import { describe, it, expect } from 'vitest';
import {
  arrangeByGroup, arrangePending, type ArrangeInput, type ArrangeResult,
} from '../geometry/arrange';
import { buildDiagramModel, PIPELINE, compile } from '#dbml-testing';
import { field, table } from './testUtils';
import { createMeasurer } from '../geometry/measure';
import { computeTableSize } from '../geometry/tableSize';
import { visibleFields } from '../geometry/lod';
import { collapsedGroupSize, groupBounds } from '../geometry/layout';
import { intersects, right, type Rect } from '../geometry/rect';
import type {
  DepEdgeVM, DiagramModel, GroupVM, TableVM,
} from '../types';

function inputFor (m: DiagramModel, extra: Partial<ArrangeInput> = {}): ArrangeInput {
  const measurer = createMeasurer(null);
  return {
    tables: m.tables,
    groups: m.groups,
    deps: m.deps,
    sizes: new Map(m.tables.map((t) => [t.key, computeTableSize(t, visibleFields(t, 'all'), measurer)])),
    ...extra,
  };
}

function arrange (dbml: string, extra: Partial<ArrangeInput> = {}) {
  const model = buildDiagramModel(compile(dbml));
  const input = inputFor(model, extra);
  return {
    model,
    input,
    result: arrangeByGroup(input),
  };
}

function boxOf (input: ArrangeInput, result: ArrangeResult, key: string): Rect {
  const p = result.positions.get(key)!;
  const s = input.sizes.get(key)!;
  return {
    x: p.x,
    y: p.y,
    w: s.width,
    h: s.height,
  };
}

/** Group boxes as the canvas draws them: open ones around their members, collapsed ones as a small box at their top left. */
function groupBoxes (input: ArrangeInput, result: ArrangeResult): Map<string, Rect> {
  const out = new Map<string, Rect>();
  for (const g of input.groups) {
    const members = input.tables.filter((t) => t.groupKey === g.key).map((t) => boxOf(input, result, t.key));
    const bounds = groupBounds(members);
    if (!bounds) continue;
    const folded = input.collapsed?.get(g.key);
    out.set(g.key, folded
      ? {
          x: bounds.x,
          y: bounds.y,
          ...folded,
        }
      : bounds);
  }
  return out;
}

function expectNoOverlaps (input: ArrangeInput, result: ArrangeResult) {
  const collapsedMembers = new Set(input.tables.filter((t) => t.groupKey && input.collapsed?.has(t.groupKey)).map((t) => t.key));
  const tables = input.tables.filter((t) => !collapsedMembers.has(t.key)).map((t) => [t.key, boxOf(input, result, t.key)] as const);
  for (let i = 0; i < tables.length; i++) {
    for (let j = i + 1; j < tables.length; j++) {
      expect(intersects(tables[i]![1], tables[j]![1]), `${tables[i]![0]} overlaps ${tables[j]![0]}`).toBe(false);
    }
  }
  const groups = [...groupBoxes(input, result)];
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      expect(intersects(groups[i]![1], groups[j]![1]), `${groups[i]![0]} overlaps ${groups[j]![0]}`).toBe(false);
    }
    // No table outside the group reaches into its box.
    for (const [key, box] of tables) {
      if (input.tables.find((t) => t.key === key)!.groupKey === groups[i]![0]) continue;
      expect(intersects(groups[i]![1], box), `${key} lies in ${groups[i]![0]}`).toBe(false);
    }
  }
}

function expectSnapped (result: ArrangeResult) {
  for (const p of result.positions.values()) {
    expect(p.x % 8).toBe(0);
    expect(p.y % 8).toBe(0);
  }
}

/** Every lineage edge leaves its upstream table to the right and enters the downstream table from the left. */
function expectLeftToRight (input: ArrangeInput, result: ArrangeResult) {
  for (const d of input.deps) {
    const a = boxOf(input, result, d.upstream.tableKey);
    const b = boxOf(input, result, d.downstream.tableKey);
    expect(right(a), `${d.key} points left to right`).toBeLessThanOrEqual(b.x);
  }
}

const groupOrder = (result: ArrangeResult) => result.columns.filter((c) => c.kind === 'group').map((c) => c.group);

describe('arrangeByGroup on the pipeline example', () => {
  it('lays the four stages out as columns in stage order with every Dep pointing left to right', () => {
    const { input, result } = arrange(PIPELINE);
    expect(groupOrder(result)).toEqual(['group:public.input', 'group:public.count', 'group:public.power', 'group:public.money']);
    expect(result.positions.size).toBe(8);
    expectLeftToRight(input, result);
    expectNoOverlaps(input, result);
    expectSnapped(result);
    // Every group box starts right of the one before it.
    const boxes = [...groupBoxes(input, result).values()];
    for (let i = 1; i < boxes.length; i++) expect(boxes[i]!.x).toBeGreaterThan(right(boxes[i - 1]!));
  });

  it('puts power.component_power before power.dc_power and lines the blue tables up across columns', () => {
    const { result } = arrange(PIPELINE);
    const at = (k: string) => result.positions.get(k)!;
    expect(result.columns.find((c) => c.group === 'group:public.power')!.layers)
      .toEqual([['power.component_power'], ['power.dc_power']]);
    expect(at('power.component_power').x).toBeLessThan(at('power.dc_power').x);
    const blue = ['count.component_count', 'power.component_power', 'money.component_money'];
    expect(new Set(blue.map((k) => at(k).y)).size).toBe(1);
    // Blue first, as colors first appear left to right; the green table below it.
    expect(result.columns.find((c) => c.group === 'group:public.money')!.layers)
      .toEqual([['money.component_money', 'money.dc_opex']]);
    // A group without lineage inside keeps declaration order.
    expect(result.columns[0]!.layers).toEqual([['input.config', 'input.component', 'input.site']]);
  });

  it('is deterministic: the same DBML always gives the same positions', () => {
    const first = arrange(PIPELINE).result;
    const second = arrange(PIPELINE).result;
    expect([...second.positions]).toEqual([...first.positions]);
  });

  it('gives a collapsed group only its box\'s room and lays its hidden members out as if open', () => {
    const { model, result: open } = arrange(PIPELINE);
    const power = 'group:public.power';
    const folded = collapsedGroupSize(40);
    const input = inputFor(model, { collapsed: new Map([[power, folded]]) });
    const result = arrangeByGroup(input);
    const boxes = groupBoxes(input, result);
    // The box keeps its place in the column order and the next column moves in.
    expect(boxes.get(power)!.w).toBe(folded.w);
    expect(boxes.get('group:public.money')!.x).toBeLessThan(groupBoxes(inputFor(model), open).get('group:public.money')!.x);
    expect(boxes.get(power)!.x).toBeGreaterThan(right(boxes.get('group:public.count')!));
    expect(boxes.get('group:public.money')!.x).toBeGreaterThan(right(boxes.get(power)!));
    // Its header lines up with the open groups' headers.
    expect(boxes.get(power)!.y).toBe(boxes.get('group:public.count')!.y);
    // The members keep their inner arrangement for when the group opens again.
    const at = (k: string) => result.positions.get(k)!;
    expect(at('power.component_power').x).toBeLessThan(at('power.dc_power').x);
    expectNoOverlaps(input, result);
  });
});

describe('arrangeByGroup group order', () => {
  it('orders groups topologically by their members\' lineage, breaking ties by declaration order', () => {
    const { result } = arrange(`
      Table c1 { id int }
      Table a1 { id int }
      Table b1 { id int }
      TableGroup c {
        c1
      }
      TableGroup a {
        a1
      }
      TableGroup b {
        b1
      }
      Dep: a1 -> c1
    `);
    // a must precede c; b is free and comes after c, which was declared first.
    expect(groupOrder(result)).toEqual(['group:public.a', 'group:public.c', 'group:public.b']);
  });

  it('counts lineage that runs through a table in no group, which sits between the two groups', () => {
    const { input, result } = arrange(`
      Table late { id int }
      Table early { id int }
      Table bridge { id int }
      TableGroup second {
        late
      }
      TableGroup first {
        early
      }
      Dep: early -> bridge
      Dep: bridge -> late
    `);
    expect(result.columns.map((c) => c.group ?? c.layers.flat().join())).toEqual(['group:public.first', 'public.bridge', 'group:public.second']);
    expectLeftToRight(input, result);
  });

  it('still places every group when their lineage forms a cycle', () => {
    const { input, result } = arrange(`
      Table x1 { id int }
      Table x2 { id int }
      Table y1 { id int }
      TableGroup x {
        x1
        x2
      }
      TableGroup y {
        y1
      }
      Dep: x1 -> y1
      Dep: y1 -> x2
    `);
    expect(groupOrder(result)).toEqual(['group:public.x', 'group:public.y']);
    expect(result.positions.size).toBe(3);
    expectNoOverlaps(input, result);
  });
});

describe('arrangeByGroup within a column', () => {
  it('layers a group by the lineage among its members, left to right', () => {
    const { input, result } = arrange(`
      Table raw { id int }
      Table clean { id int }
      Table joined { id int }
      Table report { id int }
      Table other { id int }
      TableGroup etl {
        raw
        clean
        joined
        report
        other
      }
      Dep: raw -> clean
      Dep: clean -> joined
      Dep: raw -> joined
      Dep: joined -> report
    `);
    expect(result.columns).toHaveLength(1);
    expect(result.columns[0]!.layers).toEqual([['public.raw', 'public.other'], ['public.clean'], ['public.joined'], ['public.report']]);
    expectLeftToRight(input, result);
    expectNoOverlaps(input, result);
  });

  it('orders a layer by the mean height of its upstream tables to avoid crossings', () => {
    const { input, result } = arrange(`
      Table top_src { id int }
      Table bottom_src { id int }
      Table from_bottom { id int }
      Table from_top { id int }
      TableGroup sources {
        top_src
        bottom_src
      }
      TableGroup derived {
        from_bottom
        from_top
      }
      Dep: bottom_src -> from_bottom
      Dep: top_src -> from_top
    `);
    const at = (k: string) => result.positions.get(k)!;
    expect(at('public.top_src').y).toBeLessThan(at('public.bottom_src').y);
    // Declared the other way round, but ordered after their sources.
    expect(at('public.from_top').y).toBeLessThan(at('public.from_bottom').y);
    expectLeftToRight(input, result);
  });

  it('keeps tables of one header color together, in the order colors first appear', () => {
    const { result } = arrange(`
      Table a [headercolor: #FF0000] { id int }
      Table b [headercolor: #0000FF] { id int }
      Table c [headercolor: #FF0000] { id int }
      Table d { id int }
      Table e [headercolor: #0000FF] { id int }
      Table f [headercolor: #0000FF] { id int }
      Table g [headercolor: #FF0000] { id int }
      TableGroup one {
        a
        b
        c
        d
      }
      TableGroup two {
        e
        f
        g
      }
      Dep: a -> e
    `);
    const layers = result.columns.map((c) => c.layers);
    // Red first everywhere since it shows up first; tables without a color go last.
    expect(layers).toEqual([
      [['public.a', 'public.c', 'public.b', 'public.d']],
      [['public.g', 'public.e', 'public.f']],
    ]);
  });
});

describe('arrangeByGroup for tables in no group', () => {
  const DBML = `
    Table feed { id int }
    Table stage1 { id int }
    Table stage2 { id int }
    Table report { id int }
    Table lookup { id int }
    Table orphan { id int }
    Table midway { id int }
    TableGroup s1 {
      stage1
    }
    TableGroup s2 {
      stage2
    }
    Dep: feed -> stage2
    Dep: stage1 -> stage2
    Dep: stage1 -> midway
    Dep: stage2 -> report
    Dep: lookup -> report
  `;

  it('places them by their own lineage: sources just before their first consumer, the rest after their last upstream group', () => {
    const { input, result } = arrange(DBML);
    expect(result.columns.map((c) => [c.kind, c.group ?? c.layers])).toEqual([
      ['group', 'group:public.s1'],
      // midway right after stage1, feed just before stage2 which needs it; midway sits level with its
      // source and feed with its reader, both at the top, so they keep their declaration order
      ['lineage', [['public.feed', 'public.midway']]],
      ['group', 'group:public.s2'],
      // lookup has no group upstream and feeds only report, so it comes before report in the same run
      ['lineage', [['public.lookup'], ['public.report']]],
      // no lineage at all: packed at the end
      ['unrelated', [['public.orphan']]],
    ]);
    expectLeftToRight(input, result);
    expectNoOverlaps(input, result);
    expectSnapped(result);
  });

  it('lays out a model without groups by its lineage alone', () => {
    const { input, result } = arrange(`
      Table a { id int }
      Table b { id int }
      Table c { id int }
      Table d { id int }
      Dep: a -> b
      Dep: b -> c
    `);
    expect(result.columns.map((c) => [c.kind, c.layers])).toEqual([
      ['lineage', [['public.a'], ['public.b'], ['public.c']]],
      ['unrelated', [['public.d']]],
    ]);
    expectLeftToRight(input, result);
  });

  it('packs a model with neither groups nor lineage into columns, by color then declaration order', () => {
    const tables = Array.from({ length: 12 }, (_, i) => `Table t${i}${i % 3 === 0 ? ' [headercolor: #00AA00]' : ''} {\n  id int\n  a int\n  b int\n}`).join('\n');
    const { input, result } = arrange(tables);
    expect(result.columns).toHaveLength(1);
    expect(result.columns[0]!.kind).toBe('unrelated');
    expect(result.columns[0]!.layers.length).toBeGreaterThan(1);
    expect(result.columns[0]!.layers.flat().slice(0, 4)).toEqual(['public.t0', 'public.t3', 'public.t6', 'public.t9']);
    expectNoOverlaps(input, result);
    expectSnapped(result);
  });
});

describe('arrangeByGroup notes', () => {
  it('stacks notes to the right of every table, keeping their sizes', () => {
    const { input, result } = arrange(PIPELINE, {
      notes: [
        { key: 'note:a', w: 192, h: 192 },
        { key: 'note:b', w: 300, h: 120 },
      ],
    });
    const tablesRight = Math.max(...input.tables.map((t) => right(boxOf(input, result, t.key))));
    const a = result.positions.get('note:a')!;
    const b = result.positions.get('note:b')!;
    expect(a.x).toBeGreaterThan(tablesRight);
    expect(b.x).toBe(a.x);
    expect(b.y).toBeGreaterThanOrEqual(a.y + 192);
    expectSnapped(result);
  });
});

describe('arrangePending', () => {
  /** The pipeline as arranged, then grown by `extra` DBML with its tables put into groups as given. */
  function grown (extra: string, members: Record<string, string[]> = {}) {
    const settled = arrange(PIPELINE).result.positions;
    let dbml = `${PIPELINE}\n${extra}\n`;
    for (const [group, keys] of Object.entries(members)) {
      dbml = dbml.replace(`TableGroup ${group} {\n`, `TableGroup ${group} {\n${keys.map((k) => `  ${k}\n`).join('')}`);
    }
    const model = buildDiagramModel(compile(dbml));
    return {
      model,
      settled,
    };
  }

  function placePending (model: DiagramModel, settled: ReadonlyMap<string, { x: number; y: number }>, extra: Partial<ArrangeInput> = {}) {
    const input = inputFor(model, extra);
    const pending = new Set(model.tables.map((t) => t.key).filter((k) => !settled.has(k)));
    const placed = arrangePending({
      ...input,
      current: settled,
      pending,
    });
    const all = new Map([...settled, ...placed]);
    return {
      input,
      placed,
      all: {
        positions: all,
        columns: [],
      } as ArrangeResult,
    };
  }

  it('puts a new member of an arranged group where the arrangement has it, moving nothing else', () => {
    const { model, settled } = grown('Table money.tax [headercolor: #059669] {\n  id int [pk]\n}\nDep: power.dc_power -> money.tax', { money: ['money.tax'] });
    const { input, placed, all } = placePending(model, settled);
    expect([...placed.keys()]).toEqual(['money.tax']);
    const tax = placed.get('money.tax')!;
    const opex = boxOf(input, all, 'money.dc_opex');
    expect(tax.x).toBe(opex.x);
    expect(tax.y).toBeGreaterThan(opex.y + opex.h);
    expectNoOverlaps(input, all);
    expectSnapped(all);
  });

  it('keeps a new member in its column when the layer it would open runs into the next group', () => {
    const { model, settled } = grown('Table power.peak {\n  id int [pk]\n}\nDep: power.dc_power -> power.peak', { power: ['power.peak'] });
    // Arranged afresh, peak opens a third layer in power.
    expect(arrangeByGroup(inputFor(model)).columns.find((c) => c.group === 'group:public.power')!.layers).toHaveLength(3);
    const { input, placed, all } = placePending(model, settled);
    const dc = boxOf(input, all, 'power.dc_power');
    expect(placed.get('power.peak')!.x).toBe(dc.x);
    expect(placed.get('power.peak')!.y).toBeGreaterThan(dc.y + dc.h);
    expectNoOverlaps(input, all);
  });

  it('places a table in no group by its lineage, and a group with nothing placed to go by at the right of everything', () => {
    const { model, settled } = grown([
      'Table report.total {\n  id int [pk]\n}',
      'Dep: money.dc_opex -> report.total',
      'Table audit.first {\n  id int [pk]\n}',
      'Table audit.second {\n  id int [pk]\n}',
      'TableGroup audit {\n  audit.first\n  audit.second\n}',
    ].join('\n'));
    const { input, placed, all } = placePending(model, settled);
    const moneyBox = groupBoxes(input, all).get('group:public.money')!;
    const total = boxOf(input, all, 'report.total');
    expect(total.x).toBeGreaterThan(right(moneyBox));
    const first = placed.get('audit.first')!;
    const second = placed.get('audit.second')!;
    expect(first.x).toBeGreaterThan(right(total));
    expect(second.x).toBe(first.x);
    expect(second.y).toBeGreaterThan(first.y);
    expectNoOverlaps(input, all);
    expectSnapped(all);
    const again = placePending(model, settled).placed;
    expect([...again]).toEqual([...placed]);
  });

  it('keeps the box of a collapsed group where it is', () => {
    const { model, settled } = grown('Table power.peak {\n  id int [pk]\n}', { power: ['power.peak'] });
    const collapsed = new Map([['group:public.power', collapsedGroupSize(40)]]);
    const { input, placed, all } = placePending(model, settled, { collapsed });
    const members = ['power.component_power', 'power.dc_power'].map((k) => boxOf(input, all, k));
    const before = groupBounds(members)!;
    expect(groupBoxes(input, all).get('group:public.power')).toEqual({
      x: before.x,
      y: before.y,
      ...collapsedGroupSize(40),
    });
    expect(placed.has('power.peak')).toBe(true);
  });
});

/** A seeded pipeline: `groups` stages of tables, edges only from earlier to later tables. */
function synthetic (tableCount: number, edgeCount: number, groupCount: number): ArrangeInput {
  let seed = 7;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const colors = ['#2563EB', '#059669', '#6B7280', null];
  const groups: GroupVM[] = Array.from({ length: groupCount }, (_, i) => ({
    key: `group:public.stage${i}`,
    name: `stage${i}`,
    color: null,
    tableKeys: [],
    order: i,
  }));
  const tables: TableVM[] = [];
  const sizes = new Map<string, { width: number; height: number }>();
  const perGroup = Math.ceil(tableCount / groupCount);
  for (let i = 0; i < tableCount; i++) {
    const key = `public.t${i}`;
    const group = groups[Math.floor(i / perGroup)]!;
    group.tableKeys.push(key);
    tables.push(table(key, [field(key, 'id', { pk: true })], {
      order: i,
      groupKey: group.key,
      headerColor: colors[i % colors.length]!,
    }));
    sizes.set(key, {
      width: 180 + Math.floor(rand() * 16) * 8,
      height: 32 * (2 + Math.floor(rand() * 8)),
    });
  }
  const deps: DepEdgeVM[] = [];
  const seen = new Set<string>();
  const endpoint = (k: string) => ({
    tableKey: k,
    fieldNames: [],
    fieldKeys: [],
    fieldIndices: [],
  });
  while (deps.length < edgeCount) {
    const a = Math.floor(rand() * tableCount);
    const b = Math.floor(rand() * tableCount);
    if (a >= b || seen.has(`${a}->${b}`)) continue;
    seen.add(`${a}->${b}`);
    deps.push({
      key: `dep:public.t${a}->public.t${b}`,
      label: null,
      names: [],
      upstream: endpoint(`public.t${a}`),
      downstream: endpoint(`public.t${b}`),
      columns: [],
      color: null,
      isSelf: false,
    });
  }
  return {
    tables,
    groups,
    deps,
    sizes,
  };
}

describe('arrangeByGroup at scale', () => {
  it('arranges 150 tables and 400 lineage edges well within a second, left to right and without overlaps', () => {
    const input = synthetic(150, 400, 8);
    const start = performance.now();
    const result = arrangeByGroup(input);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1000);
    expect(result.positions.size).toBe(150);
    expect(groupOrder(result)).toEqual(input.groups.map((g) => g.key));
    expectLeftToRight(input, result);
    expectNoOverlaps(input, result);
    expectSnapped(result);
    expect([...arrangeByGroup(input).positions]).toEqual([...result.positions]);
  });
});

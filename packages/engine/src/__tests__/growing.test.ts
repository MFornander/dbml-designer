// @vitest-environment happy-dom
import {
  describe, it, expect, vi, afterEach,
} from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import EngineDiagram from '../components/EngineDiagram.vue';
import { createEngine, MARK_MS, MARK_WAIT_MS } from '../engine/engine';
import { addedKeys } from '../engine/changes';
import { fromModel } from '../fromModel';
import { placeByLineage, type PlacementItem } from '../geometry/layout';
import { intersects, type Rect } from '../geometry/rect';
import type { Model, ModelTable } from '../model';

const item = (key: string, order: number, h = 100): PlacementItem => ({
  key,
  w: 200,
  h,
  order,
});

const box = (x: number, y: number): Rect => ({
  x,
  y,
  w: 200,
  h: 100,
});

describe('placeByLineage', () => {
  // The example from issue #7: the order line feeds the price; the item and the markup are new.
  const placed = new Map([['spec.order_line', box(0, 0)], ['money.line_price', box(400, 160)]]);
  const links = [
    { upstream: 'spec.order_line', downstream: 'money.line_price' },
    { upstream: 'input.item', downstream: 'money.line_price' },
    { upstream: 'input.markup', downstream: 'money.line_price' },
    { upstream: 'money.line_price', downstream: 'money.invoice' },
  ];

  it('puts a new upstream table left of the table that reads it, level with it, and stacks the next under it', () => {
    const at = placeByLineage([item('input.item', 0), item('input.markup', 1)], links, placed, [...placed.values()]);
    const price = placed.get('money.line_price')!;
    const it1 = at.get('input.item')!;
    const it2 = at.get('input.markup')!;
    expect(it1.x + 200).toBeLessThan(price.x);
    expect(it1.y).toBe(price.y);
    expect(it2.x).toBe(it1.x);
    expect(it2.y).toBeGreaterThanOrEqual(it1.y + 100);
    // Clear of each other and of what was there.
    const boxes = [...placed.values(), { ...it1, w: 200, h: 100 }, { ...it2, w: 200, h: 100 }];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) expect(intersects(boxes[i]!, boxes[j]!)).toBe(false);
    }
  });

  it('puts a new downstream table right of the table it reads, anchors new tables on new ones, and leaves the rest', () => {
    const at = placeByLineage([item('money.invoice', 0), item('ops.audit', 1)], [
      ...links,
      { upstream: 'money.invoice', downstream: 'ops.ledger' },
    ], placed, [...placed.values()]);
    expect(at.get('money.invoice')!.x).toBeGreaterThan(400 + 200);
    expect(at.has('ops.audit')).toBe(false);
    // A chain of new tables grows from the placed one.
    const chain = placeByLineage([item('a', 0), item('b', 1)], [
      { upstream: 'a', downstream: 'b' },
      { upstream: 'b', downstream: 'money.line_price' },
    ], placed, [...placed.values()]);
    expect(chain.get('a')!.x).toBeLessThan(chain.get('b')!.x);
    expect(chain.get('b')!.x).toBeLessThan(400);
  });
});

/** The trace from issue #4 with only the order line, the price, and the two row edges. */
const START: Model = {
  tables: [
    {
      schema: 'spec',
      name: 'order_line',
      fields: [{ name: 'item_id', type: 'text' }, { name: 'rate_id', type: 'text' }, { name: 'quantity', type: 'double' }],
    },
    {
      schema: 'money',
      name: 'line_price',
      fields: [{ name: 'price', type: 'double' }],
    },
  ],
  deps: [
    { from: { table: 'spec.order_line', fields: ['item_id'] }, to: { table: 'money.line_price', fields: ['price'] }, kind: 'row' },
    { from: { table: 'spec.order_line', fields: ['rate_id'] }, to: { table: 'money.line_price', fields: ['price'] }, kind: 'row' },
  ],
};

const ITEM: ModelTable = {
  schema: 'input',
  name: 'item',
  fields: [{ name: 'unit_cost', type: 'double' }],
  records: [{ unit_cost: 12.5 }],
};

const MARKUP: ModelTable = {
  schema: 'input',
  name: 'markup',
  fields: [{ name: 'rate', type: 'double' }],
};

const feeds = (table: string, field: string) => ({
  from: { table, fields: [field] },
  to: { table: 'money.line_price', fields: ['price'] },
  kind: 'value',
});

async function settle (): Promise<void> {
  await flushPromises();
  await nextTick();
  await flushPromises();
}

describe('addedKeys', () => {
  it('lists new tables, new fields of old tables, and new edges with the pair a new mapping folds into', () => {
    const before = fromModel(START);
    const after = fromModel({
      ...START,
      tables: [
        {
          ...START.tables[0]!,
          fields: [...START.tables[0]!.fields, { name: 'discount', type: 'double' }],
        },
        START.tables[1]!,
        ITEM,
      ],
      deps: [...START.deps!, feeds('input.item', 'unit_cost'), feeds('spec.order_line', 'quantity')],
    });
    expect([...addedKeys(before, after)].sort()).toEqual([
      'dep:input.item(unit_cost)->money.line_price(price)',
      'dep:input.item(unit_cost)->money.line_price(price)#value',
      'dep:input.item->money.line_price',
      'dep:spec.order_line(quantity)->money.line_price(price)',
      'dep:spec.order_line(quantity)->money.line_price(price)#value',
      'dep:spec.order_line->money.line_price',
      'input.item',
      'spec.order_line.discount',
    ]);
    expect(addedKeys(before, before).size).toBe(0);
  });

  it('lists a new kind between columns already mapped, with the column pair and edge that draw it', () => {
    const before = fromModel({ ...START, deps: [...START.deps!, feeds('spec.order_line', 'quantity')] });
    const after = fromModel({
      ...START,
      deps: [...START.deps!, feeds('spec.order_line', 'quantity'), {
        ...feeds('spec.order_line', 'quantity'),
        kind: 'row',
      }],
    });
    expect([...addedKeys(before, after)].sort()).toEqual([
      'dep:spec.order_line(quantity)->money.line_price(price)',
      'dep:spec.order_line(quantity)->money.line_price(price)#row',
      'dep:spec.order_line->money.line_price',
    ]);
  });
});

describe('growing a model', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds tables, edges, rows, and view members, and marks what is new for a moment', async () => {
    vi.useFakeTimers();
    const engine = createEngine({ model: START });
    engine.addTables([ITEM]);
    engine.addEdges([feeds('input.item', 'unit_cost')]);
    await nextTick();
    expect(engine.model.value!.tables.map((t) => t.name)).toEqual(['order_line', 'line_price', 'item']);
    expect(engine.marked.value.has('input.item')).toBe(true);
    expect(engine.marked.value.has('dep:input.item->money.line_price')).toBe(true);

    engine.setRows('input.item', [{ unit_cost: 13 }]);
    engine.addToView('trace', ['input.item', 'money.line_price']);
    engine.addToView('trace', ['money.line_price', 'spec.order_line']);
    await nextTick();
    expect(engine.diagram.value.tablesByKey.get('input.item')!.fields[0]!.value).toBe(13);
    expect(engine.model.value!.views).toEqual([{ name: 'trace', tables: ['input.item', 'money.line_price', 'spec.order_line'] }]);
    // Replacing a table keeps its place in the list.
    engine.addTables([{ ...ITEM, note: 'priced in USD' }]);
    expect(engine.model.value!.tables.map((t) => t.name)).toEqual(['order_line', 'line_price', 'item']);

    vi.advanceTimersByTime(MARK_MS + 1);
    expect(engine.marked.value.size).toBe(0);
    engine.dispose();
  });

  it('keeps what one update added lit while the next lights up', async () => {
    vi.useFakeTimers();
    const engine = createEngine({ model: START });
    engine.addTables([ITEM]);
    await nextTick();
    vi.advanceTimersByTime(MARK_MS / 2);
    engine.addEdges([feeds('input.item', 'unit_cost')]);
    await nextTick();
    expect(engine.marked.value.has('input.item')).toBe(true);
    expect(engine.marked.value.has('dep:input.item->money.line_price')).toBe(true);
    // The highlight lasts from the last update.
    vi.advanceTimersByTime(MARK_MS / 2 + 1);
    expect(engine.marked.value.size).toBeGreaterThan(0);
    vi.advanceTimersByTime(MARK_MS / 2);
    expect(engine.marked.value.size).toBe(0);
    engine.dispose();
  });

  it('marks the next model only while a request to mark it is fresh', async () => {
    vi.useFakeTimers();
    const engine = createEngine({ model: START });
    engine.markChanges();
    vi.advanceTimersByTime(MARK_WAIT_MS + 1);
    vi.setSystemTime(Date.now() + MARK_WAIT_MS + 1);
    engine.setModel({ ...START, tables: [...START.tables, MARKUP] });
    await nextTick();
    expect(engine.marked.value.size).toBe(0);
    engine.dispose();
  });

  it('lands each added table beside its neighbour, moves nothing placed, and highlights it', async () => {
    const engine = createEngine({
      model: START,
      layout: {
        positions: {
          'spec.order_line': { x: 0, y: 0 },
          'money.line_price': { x: 800, y: 0 },
        },
        collapsedGroups: [],
        edgeRoutes: {},
      },
    });
    const wrapper = mount(EngineDiagram, {
      props: { engine },
      attachTo: document.body,
    });
    await settle();
    const before = { ...engine.layout.positions.value };

    engine.addTables([ITEM]);
    engine.addEdges([feeds('input.item', 'unit_cost')]);
    await settle();
    const at = engine.layout.positions.value;
    expect(at['spec.order_line']).toEqual(before['spec.order_line']);
    expect(at['money.line_price']).toEqual(before['money.line_price']);
    expect(at['input.item']!.x).toBeLessThan(800);
    expect(at['input.item']!.x).toBeGreaterThan(400);
    expect(at['input.item']!.y).toBe(0);
    expect(wrapper.find('.dg-table[data-key="input.item"]').classes()).toContain('is-highlighted');
    expect(wrapper.find('.dg-dep.is-highlighted').exists()).toBe(true);

    engine.addTables([MARKUP]);
    engine.addEdges([feeds('input.markup', 'rate')]);
    await settle();
    const after = engine.layout.positions.value;
    // Under the item, in the same column: both end the same gap left of the price.
    expect(Math.abs(after['input.markup']!.x - after['input.item']!.x)).toBeLessThan(200);
    expect(after['input.markup']!.y).toBeGreaterThan(after['input.item']!.y);
    expect(after['input.item']).toEqual(at['input.item']);

    // The host reaches what is drawn, to anchor its own overlays.
    expect(engine.elementOf('money.line_price.price')?.classList.contains('dg-field')).toBe(true);
    expect(engine.elementOf('input.item')?.getAttribute('data-key')).toBe('input.item');
    expect(engine.elementOf('nothing.here')).toBeNull();
    wrapper.unmount();
    engine.dispose();
  });

  it('draws a 30-table addition promptly', async () => {
    const engine = createEngine({ model: START });
    const wrapper = mount(EngineDiagram, {
      props: { engine },
      attachTo: document.body,
    });
    await settle();
    const tables: ModelTable[] = Array.from({ length: 30 }, (_, i) => ({
      schema: 'step',
      name: `t${i}`,
      fields: [{ name: 'v', type: 'double' }, { name: 'w', type: 'double' }],
    }));
    const deps = tables.map((t, i) => ({
      from: { table: `step.${t.name}`, fields: ['v'] },
      to: { table: i === 0 ? 'money.line_price' : `step.t${i - 1}`, fields: [i === 0 ? 'price' : 'w'] },
      kind: 'value',
    }));
    const started = performance.now();
    engine.addTables(tables);
    engine.addEdges(deps);
    await settle();
    const elapsed = performance.now() - started;
    expect(wrapper.findAll('.dg-table')).toHaveLength(32);
    expect(Object.keys(engine.layout.positions.value)).toHaveLength(32);
    expect(elapsed).toBeLessThan(250);
    wrapper.unmount();
    engine.dispose();
  });
});

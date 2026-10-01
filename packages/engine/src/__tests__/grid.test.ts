// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { fromModel } from '../fromModel';
import { checkModel } from '../checkModel';
import { computeTableSize } from '../geometry/tableSize';
import { visibleFields } from '../geometry/lod';
import { CHIP_W, GRID_COL_MAX } from '../geometry/constants';
import { createMeasurer } from '../geometry/measure';
import { buildTooltipContent } from '../state/useTooltip';
import { mount } from '../mount';
import type { Model, ModelDep } from '../model';
import type { ElementEvent } from '../types';

// The AMD rack's power total: three component rows of one case sum into one rollup cell.
const LINE_POWER = {
  schema: 'power',
  name: 'line_power',
  fields: [
    { name: 'case_id', type: 'int', pk: true },
    { name: 'component_type', type: 'text', pk: true },
    { name: 'input_watts', type: 'double' },
  ],
  records: [
    { case_id: 7, component_type: 'CPU', input_watts: 120 },
    { case_id: 7, component_type: 'GPU', input_watts: 340 },
    { case_id: 7, component_type: 'TRAY', input_watts: 95 },
  ],
};
const ROLLUP = {
  schema: 'rollup',
  name: 'collection_power',
  fields: [{ name: 'case_id', type: 'int', pk: true }, { name: 'input_watts', type: 'double' }],
  records: [{ case_id: 7, input_watts: 555 }],
};
const sums = (component: string): ModelDep => ({
  from: { table: 'power.line_power', fields: ['input_watts'], row: { case_id: 7, component_type: component } },
  to: { table: 'rollup.collection_power', fields: ['input_watts'], row: 0 },
  kind: 'value',
});
const MODEL: Model = {
  tables: [LINE_POWER, ROLLUP],
  deps: [sums('CPU'), sums('GPU'), sums('TRAY')],
};
const PAIR = 'dep:power.line_power(input_watts)->rollup.collection_power(input_watts)';

describe('rows on lineage', () => {
  it('resolve by index or by key values, and gather on one mapping per kind', () => {
    const m = fromModel(MODEL);
    const column = m.deps[0]!.columns[0]!;
    expect(column.key).toBe(PAIR);
    expect(column.mappings).toHaveLength(1);
    expect(column.mappings[0]!.rows).toEqual([[0, 0], [1, 0], [2, 0]]);
    expect(m.diagnostics).toEqual([]);
  });

  it('report a row that is not there and leave it out', () => {
    const m = fromModel({ ...MODEL, deps: [{ ...sums('FAN') }] });
    expect(m.diagnostics.map((d) => d.kind)).toEqual(['unresolved-row']);
    expect(m.deps[0]!.columns[0]!.mappings[0]!.rows).toEqual([[null, 0]]);
  });

  it('label records by the key values that differ among them, else by place, and show those named first', () => {
    const m = fromModel({
      ...MODEL,
      deps: [sums('TRAY')],
      tables: [LINE_POWER, { ...ROLLUP, records: [{ case_id: 7, input_watts: 1 }, { case_id: 7, input_watts: 2 }] }],
    });
    expect(m.tablesByKey.get('power.line_power')!.recordLabels).toEqual(['CPU', 'GPU', 'TRAY']);
    expect(m.tablesByKey.get('power.line_power')!.recordOrder).toEqual([2, 0, 1]);
    expect(m.tablesByKey.get('rollup.collection_power')!.recordLabels).toEqual(['1', '2']);
  });

  it('are checked as an index or a record', () => {
    const bad = { ...MODEL, deps: [{ ...sums('CPU'), to: { table: 'rollup.collection_power', row: -1 } }] };
    expect(checkModel(bad).some((p) => p.path.join('.') === 'deps.0.to.row')).toBe(true);
    expect(checkModel(MODEL)).toEqual([]);
  });

  it('list their records in the column pair\'s tooltip, and a cell\'s record in its own', () => {
    const m = fromModel(MODEL);
    expect(buildTooltipContent(m, { kind: 'dep', key: PAIR })?.lines).toEqual(['kind: value', 'rows: CPU → 1, GPU → 1, TRAY → 1']);
    const cell = buildTooltipContent(m, { kind: 'field', tableKey: 'power.line_power', fieldKey: 'power.line_power.input_watts', row: 1 });
    expect(cell?.subtitle).toBe('GPU');
    expect(cell?.value).toBe('340');
  });
});

describe('the grid', () => {
  const measurer = createMeasurer();

  it('gives each record shown a column with its label, up to gridRows, then a "+N" column', () => {
    const m = fromModel(MODEL);
    const t = m.tablesByKey.get('power.line_power')!;
    const size = computeTableSize(t, visibleFields(t, 'all'), measurer, [], true, [], CHIP_W, 2);
    expect(size.grid!.columns.map((c) => [c.record, c.heading])).toEqual([[0, 'CPU'], [1, 'GPU']]);
    expect(size.grid!.more?.count).toBe(1);
    expect(size.recordsBadge).toBeUndefined();
    expect(size.valueW).toBe(size.grid!.w);
    for (const c of size.grid!.columns) expect(c.w).toBeLessThanOrEqual(GRID_COL_MAX);
    expect(size.rows.find((_, i) => t.fields[i]!.name === 'input_watts')!.cells!.map((c) => c?.text)).toEqual(['120', '340']);
  });

  async function setup (display = {}) {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const hovers: (ElementEvent | null)[] = [];
    const mounted = mount(element, { model: MODEL, display, onElementHover: (e) => hovers.push(e) });
    await flushPromises();
    await nextTick();
    return {
      element,
      engine: mounted.engine,
      hovers,
      done: () => {
        mounted.unmount();
        element.remove();
      },
    };
  }

  it('draws headed cells, and a hovered cell lights the cells its records lead to', async () => {
    const { element, hovers, done } = await setup();
    expect([...element.querySelectorAll('.dg-table[data-key="power.line_power"] .dg-grid-heading')].map((h) => h.textContent?.replace(/^.*?\n?/, '').trim()))
      .toEqual(expect.arrayContaining([expect.stringContaining('CPU')]));
    const gpu = element.querySelector('[data-key="power.line_power.input_watts[1]"]')!;
    expect(gpu.textContent).toContain('340');
    gpu.dispatchEvent(new PointerEvent('pointerenter'));
    await nextTick();
    const event = hovers.at(-1)!;
    expect(event.target).toEqual({ kind: 'field', tableKey: 'power.line_power', fieldKey: 'power.line_power.input_watts', row: 1 });
    expect(event.rect).not.toBeNull();
    const lit = [...element.querySelectorAll('.dg-cell.is-highlighted')].map((c) => c.getAttribute('data-key'));
    expect(lit.sort()).toEqual(['power.line_power.input_watts[1]']);
    // The rollup has one record, so its value is not a grid cell; the curve lights up instead.
    expect(element.querySelector(`.dg-ref[data-key="${PAIR}"]`)?.classList.contains('is-highlighted')).toBe(true);
    done();
  });

  it('lights cells the host names, and puts a record past those shown behind "+N"', async () => {
    const { element, engine, done } = await setup({ gridRows: 2 });
    engine.highlight(['power.line_power.input_watts[0]', 'power.line_power.input_watts[2]']);
    await nextTick();
    expect(element.querySelector('[data-key="power.line_power.input_watts[0]"]')!.classList.contains('is-highlighted')).toBe(true);
    // The tray's record is the third, past the two shown: "+N" lights up, and stands in for its rectangle.
    expect(element.querySelector('.dg-grid-more')!.classList.contains('is-highlighted')).toBe(true);
    const more = engine.rectOf('power.line_power.input_watts[2]')!;
    const shown = engine.rectOf('power.line_power.input_watts[1]')!;
    expect(more.x).toBeGreaterThan(shown.x);
    expect(more.y).toBe(shown.y);
    done();
  });

  it('turns into a count badge with gridRows 0', async () => {
    const { element, done } = await setup({ gridRows: 0 });
    expect(element.querySelector('.dg-cell')).toBeNull();
    expect(element.querySelector('.dg-records-badge')).not.toBeNull();
    done();
  });

  it('takes a cell of a table with one record, which has no grid, for its field', async () => {
    const { element, engine, done } = await setup();
    engine.highlight(['rollup.collection_power.input_watts[0]']);
    await nextTick();
    expect(element.querySelector('.dg-field[data-key="rollup.collection_power.input_watts"]')!.classList.contains('is-highlighted')).toBe(true);
    expect(engine.rectOf('rollup.collection_power.input_watts[0]')).toEqual(engine.rectOf('rollup.collection_power.input_watts'));
    done();
  });
});

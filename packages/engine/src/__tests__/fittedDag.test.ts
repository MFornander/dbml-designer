// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { fromModel } from '../fromModel';
import { arrangeByGroup, type ArrangeInput } from '../geometry/arrange';
import { overviewHeaderSize, visibleFields } from '../geometry/lod';
import { computeTableSize } from '../geometry/tableSize';
import { createMeasurer } from '../geometry/measure';
import { FONT_SIZE, ROW_H } from '../geometry/constants';
import { mount } from '../mount';
import type { Model } from '../model';
import type { DisplayOptions } from '../engine/engine';

// Twelve inputs in one group, each read by its own step in another; the steps are declared in the
// opposite order, so the inputs end up ordered by their readers.
const INPUTS = Array.from({ length: 12 }, (_, i) => `in.t${String(i).padStart(2, '0')}`);
const STEPS = INPUTS.map((k) => k.replace('in.', 'step.'));
const MODEL: Model = {
  tables: [
    ...INPUTS.map((k) => ({ schema: 'in', name: k.slice(3), fields: [{ name: 'id', type: 'int', pk: true }, { name: 'v', type: 'double' }] })),
    ...[...STEPS].reverse().map((k) => ({ schema: 'step', name: k.slice(5), fields: [{ name: 'id', type: 'int', pk: true }, { name: 'v', type: 'double' }] })),
  ],
  deps: INPUTS.map((k, i) => ({ from: { table: k }, to: { table: STEPS[i]! } })),
  groups: [
    { name: 'inputs', tables: INPUTS },
    { name: 'steps', tables: STEPS },
  ],
};

function input (level: 'names' | 'all' = 'all'): ArrangeInput {
  const m = fromModel(MODEL);
  const measurer = createMeasurer(null);
  return {
    tables: m.tables,
    groups: m.groups,
    deps: m.deps,
    sizes: new Map(m.tables.map((t) => [t.key, computeTableSize(t, visibleFields(t, level), measurer)])),
  };
}

describe('arrange for a fitted view', () => {
  it('wraps a tall layer into columns, filled left to right and then down, as wide as the pane allows', () => {
    const wide = arrangeByGroup(input(), { aspect: 4 });
    const inputs = wide.columns.find((c) => c.group === 'group:public.inputs')!;
    expect(inputs.layers.length).toBeGreaterThan(1);
    expect(inputs.layers.flat().sort()).toEqual([...INPUTS].sort());
    const [a, b] = [wide.positions.get(inputs.layers[0]![0]!)!, wide.positions.get(inputs.layers[1]![0]!)!];
    expect(b.y).toBe(a.y);
    expect(b.x).toBeGreaterThan(a.x);
    // A tall pane takes fewer columns, and none wraps without an aspect.
    expect(arrangeByGroup(input(), { aspect: 0.2 }).columns.find((c) => c.group === 'group:public.inputs')!.layers.length)
      .toBeLessThan(inputs.layers.length);
    expect(arrangeByGroup(input(), { aspect: 0 }).columns.every((c) => c.layers.length === 1)).toBe(true);
  });

  it('orders tables that read nothing by where what reads them sits', () => {
    // Each step reads its key, which places it, and an input in the opposite order.
    const keys = INPUTS.map((k) => k.replace('in.', 'key.'));
    const m = fromModel({
      tables: [...keys, ...INPUTS, ...STEPS].map((k) => ({ schema: k.split('.')[0], name: k.split('.')[1]!, fields: [{ name: 'id', type: 'int' }] })),
      deps: STEPS.flatMap((k, i) => [{ from: { table: keys[i]! }, to: { table: k } }, { from: { table: INPUTS[11 - i]! }, to: { table: k } }]),
      groups: [{ name: 'keys', tables: keys }, { name: 'inputs', tables: INPUTS }, { name: 'steps', tables: STEPS }],
    });
    const measurer = createMeasurer(null);
    const { positions } = arrangeByGroup({
      tables: m.tables,
      groups: m.groups,
      deps: m.deps,
      sizes: new Map(m.tables.map((t) => [t.key, computeTableSize(t, t.fields, measurer)])),
    }, { aspect: 0 });
    STEPS.forEach((k, i) => expect(positions.get(INPUTS[11 - i]!)!.y, k).toBe(positions.get(k)!.y));
  });
});

describe('the name of a table drawn as its header alone, zoomed out', () => {
  it('is as large as 12px on screen, the header, and the room for it allow', () => {
    expect(overviewHeaderSize(100, 1000, 1)).toBe(12);
    expect(overviewHeaderSize(100, 1000, 0.2)).toBe(ROW_H * 0.75);
    expect(overviewHeaderSize(100, 150, 0.2)).toBe(FONT_SIZE * 1.5);
  });

  it('is drawn in the header in place of a placeholder', async () => {
    const { element, engine, done } = await setup({ detailLevel: 'names' });
    engine.setViewport({ zoom: 0.25 });
    await nextTick();
    const name = element.querySelector<SVGTextElement>('.dg-table[data-key="in.t00"] .dg-table-name')!;
    expect(name.textContent).toBe('t00');
    expect(parseFloat(name.style.fontSize)).toBeGreaterThan(FONT_SIZE);
    expect(element.querySelector('.dg-table[data-key="in.t00"] .dg-placeholder')).toBeNull();
    done();
  });
});

async function setup (display: Partial<DisplayOptions>) {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const mounted = mount(element, { model: MODEL, display });
  const settle = async () => {
    await flushPromises();
    await nextTick();
    await nextTick();
  };
  await settle();
  return {
    element,
    engine: mounted.engine,
    settle,
    done: () => {
      mounted.unmount();
      element.remove();
    },
  };
}

describe('arrangeFor', () => {
  /** How far the arrangement reaches, right and down. */
  const extent = (positions: Record<string, { x: number; y: number }>) => Math.max(...Object.values(positions).map((p) => p.x)) + Math.max(...Object.values(positions).map((p) => p.y));

  it('spaces tables for every field by default, and for the level drawn with drawn', async () => {
    const all = await setup({ detailLevel: 'names', arrangeFor: 'all' });
    all.engine.arrange();
    await all.settle();
    const drawn = await setup({ detailLevel: 'names', arrangeFor: 'drawn' });
    drawn.engine.arrange();
    await drawn.settle();
    expect(extent(drawn.engine.layout.positions.value)).toBeLessThan(extent(all.engine.layout.positions.value));
    all.done();
    drawn.done();
  });

  it('arranges again when the level changes, while nothing has changed since the arrangement', async () => {
    const { engine, settle, done } = await setup({ detailLevel: 'names', arrangeFor: 'drawn' });
    engine.arrange();
    await settle();
    const names = extent(engine.layout.positions.value);
    engine.setDisplay({ detailLevel: 'all' });
    await settle();
    const all = { ...engine.layout.positions.value };
    expect(extent(all)).toBeGreaterThan(names);
    // Moved by hand, the arrangement stays as it is.
    engine.layout.setPosition('in.t05', { x: 4000, y: 4000 });
    engine.setDisplay({ detailLevel: 'names' });
    await settle();
    expect(engine.layout.positions.value['in.t00']).toEqual(all['in.t00']);
    done();
  });
});

describe('groups as bands', () => {
  it('are drawn as tall as the diagram, side by side, with no header of their own', async () => {
    const { element, engine, settle, done } = await setup({ groupStyle: 'band' });
    engine.arrange();
    await settle();
    const bands = [...element.querySelectorAll('.dg-group.is-band .dg-group-body')];
    expect(bands).toHaveLength(2);
    expect(new Set(bands.map((b) => b.getAttribute('height'))).size).toBe(1);
    engine.setDisplay({ groupStyle: 'box' });
    await nextTick();
    expect(element.querySelector('.dg-group.is-band')).toBeNull();
    done();
  });
});

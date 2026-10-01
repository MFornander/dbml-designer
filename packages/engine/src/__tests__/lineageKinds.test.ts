// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createEngine } from '../engine/engine';
import { mount } from '../mount';
import type { Model } from '../model';

const MODEL: Model = {
  tables: [
    { schema: 'spec', name: 'order_line', fields: [{ name: 'quantity', type: 'int' }, { name: 'item_id', type: 'int' }] },
    { schema: 'money', name: 'line_price', fields: [{ name: 'price', type: 'double' }] },
    { name: 'audit', fields: [{ name: 'id', type: 'int' }] },
    { name: 'log', fields: [{ name: 'id', type: 'int' }] },
  ],
  deps: [
    { from: { table: 'spec.order_line', fields: ['quantity'] }, to: { table: 'money.line_price', fields: ['price'] }, kind: 'value' },
    { from: { table: 'spec.order_line', fields: ['quantity'] }, to: { table: 'money.line_price', fields: ['price'] }, kind: 'row' },
    { from: { table: 'spec.order_line', fields: ['item_id'] }, to: { table: 'money.line_price', fields: ['price'] }, kind: 'row' },
    { from: { table: 'money.line_price' }, to: { table: 'public.audit' }, kind: 'row' },
    { from: { table: 'money.line_price' }, to: { table: 'public.log' } },
  ],
};

const QTY = 'dep:spec.order_line(quantity)->money.line_price(price)';
const ITEM = 'dep:spec.order_line(item_id)->money.line_price(price)';

describe('lineageKinds', () => {
  it('draws only the lineage of the kinds asked for, and deps without a kind always', () => {
    const engine = createEngine({ model: MODEL });
    const columns = () => engine.diagram.value.deps.flatMap((d) => d.columns.map((c) => [c.key, c.kind]));
    const pairs = () => engine.diagram.value.deps.map((d) => d.key).sort();
    expect(columns()).toEqual([[QTY, 'value'], [ITEM, 'row']]);

    engine.setDisplay({ lineageKinds: ['value'] });
    expect(columns()).toEqual([[QTY, 'value']]);
    expect(pairs()).toEqual(['dep:money.line_price->public.log', 'dep:spec.order_line->money.line_price']);

    // A column pair with only its row mapping left is drawn as row.
    engine.setDisplay({ lineageKinds: ['row'] });
    expect(columns()).toEqual([[QTY, 'row'], [ITEM, 'row']]);
    expect(pairs()).toContain('dep:money.line_price->public.audit');

    engine.setDisplay({ lineageKinds: [] });
    expect(pairs()).toEqual(['dep:money.line_price->public.log']);
    engine.setDisplay({ lineageKinds: null });
    expect(columns()).toHaveLength(2);
    engine.dispose();
  });

  it('leaves the drawn model alone when other display options change', () => {
    const engine = createEngine({ model: MODEL, display: { lineageKinds: ['value'] } });
    const before = engine.diagram.value;
    engine.setDisplay({ dark: true });
    engine.setDisplay({ lineageKinds: ['value'] });
    expect(engine.diagram.value).toBe(before);
    engine.dispose();
  });

  it('lists only the kinds drawn in the legend', async () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const mounted = mount(element, { model: MODEL, display: { lineageColumns: true, lineageKinds: ['value'] } });
    await flushPromises();
    await nextTick();
    expect([...element.querySelectorAll('.dg-legend-item')].map((e) => e.textContent?.trim())).toEqual(['value']);
    mounted.unmount();
    element.remove();
  });
});

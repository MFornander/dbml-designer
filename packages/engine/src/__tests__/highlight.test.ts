// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { fromModel } from '../fromModel';
import { isDimmed, resolveFocus } from '../state/focus';
import { mount } from '../mount';
import type { Model } from '../model';
import type { Highlight } from '../types';

// A small lineage: an order line and an item feed a price; an audit table hangs off the price; a
// ref joins the order line to the item; a note stands aside.
const MODEL: Model = {
  tables: [
    { schema: 'spec', name: 'order_line', fields: [{ name: 'quantity', type: 'int' }, { name: 'item_id', type: 'int' }] },
    { schema: 'input', name: 'item', fields: [{ name: 'id', type: 'int' }, { name: 'unit_cost', type: 'double' }] },
    { schema: 'money', name: 'line_price', fields: [{ name: 'price', type: 'double' }] },
    { name: 'audit', fields: [{ name: 'id', type: 'int' }] },
  ],
  refs: [{ from: { table: 'spec.order_line', fields: ['item_id'] }, to: { table: 'input.item', fields: ['id'] } }],
  deps: [
    { from: { table: 'spec.order_line', fields: ['quantity'] }, to: { table: 'money.line_price', fields: ['price'] }, kind: 'value' },
    { from: { table: 'spec.order_line', fields: ['quantity'] }, to: { table: 'money.line_price', fields: ['price'] }, kind: 'row' },
    { from: { table: 'input.item', fields: ['unit_cost'] }, to: { table: 'money.line_price', fields: ['price'] }, kind: 'value' },
    { from: { table: 'money.line_price' }, to: { table: 'public.audit' } },
  ],
  groups: [{ schema: 'spec', name: 'specs', tables: ['spec.order_line'] }],
  notes: [{ name: 'aside', content: 'hello' }],
};

const QTY = 'dep:spec.order_line(quantity)->money.line_price(price)';
const COST = 'dep:input.item(unit_cost)->money.line_price(price)';
const PAIR = 'dep:spec.order_line->money.line_price';

const hl = (keys: string[], dim = true, accent: string[] = []): Highlight => ({
  keys: new Set(keys),
  accent: new Set(accent),
  dim,
});

describe('resolveFocus', () => {
  it('lights what is named, by the key it is drawn with, and keeps the tables, pairs, and groups around it', () => {
    const m = fromModel(MODEL);
    const f = resolveFocus(m, hl([`${QTY}#row`, 'money.line_price.price', 'spec.order_line.quantity'], true, ['spec.order_line.quantity']));
    expect([...f.lit].sort()).toEqual([QTY, 'money.line_price.price', 'spec.order_line.quantity'].sort());
    expect([...f.accent]).toEqual(['spec.order_line.quantity']);
    for (const kept of [QTY, PAIR, 'spec.order_line', 'money.line_price', 'group:spec.specs']) expect(isDimmed(f, kept)).toBe(false);
    for (const dimmed of ['input.item', 'public.audit', COST, 'note:aside']) expect(isDimmed(f, dimmed)).toBe(true);
  });

  it('keeps a group\'s tables when the group is named, and dims nothing without dim', () => {
    const m = fromModel(MODEL);
    expect(isDimmed(resolveFocus(m, hl(['group:spec.specs'])), 'spec.order_line')).toBe(false);
    const plain = resolveFocus(m, hl(['input.item'], false));
    expect(plain.lit.has('input.item')).toBe(true);
    expect(isDimmed(plain, 'public.audit')).toBe(false);
    expect(resolveFocus(m, null).lit.size).toBe(0);
  });
});

describe('engine.highlight', () => {
  async function mounted (display = {}) {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const m = mount(element, { model: MODEL, display });
    await flushPromises();
    await nextTick();
    return { element, ...m };
  }
  const cls = (el: Element, key: string) => [...el.querySelector(`[data-key="${key}"]`)?.classList ?? []];

  it('lights, accents, and dims as asked, with no relayout, and clears with null', async () => {
    const { element, engine, unmount } = await mounted();
    const before = JSON.stringify(engine.layout.positions.value);
    engine.highlight([`${QTY}#value`, 'spec.order_line.quantity', 'money.line_price.price'], { dim: true, accent: ['spec.order_line.quantity'] });
    await nextTick();
    expect(engine.highlighted.value?.dim).toBe(true);
    // A mapping named while lineage is drawn by table pair draws its column pair, lit.
    expect(cls(element, QTY)).toContain('is-highlighted');
    expect(cls(element, 'spec.order_line.quantity')).toEqual(expect.arrayContaining(['is-highlighted', 'is-accent']));
    expect(cls(element, 'spec.order_line')).not.toContain('is-dimmed');
    expect(cls(element, 'input.item')).toContain('is-dimmed');
    expect(cls(element, 'note:aside')).toContain('is-dimmed');
    expect(cls(element, 'group:spec.specs')).not.toContain('is-dimmed');
    expect(JSON.stringify(engine.layout.positions.value)).toBe(before);

    engine.highlight(null);
    await nextTick();
    expect(element.querySelector('.is-dimmed')).toBeNull();
    expect(element.querySelector(`[data-key="${QTY}"]`)).toBeNull();
    unmount();
    element.remove();
  });

  it('leaves dimmed elements to the pointer: a hover lights them through the dim', async () => {
    const { element, engine, unmount } = await mounted();
    engine.highlight(['money.line_price'], { dim: true });
    await nextTick();
    const item = element.querySelector('.dg-table[data-key="input.item"]')!;
    expect(item.classList.contains('is-dimmed')).toBe(true);
    item.dispatchEvent(new PointerEvent('pointerenter'));
    await nextTick();
    expect(item.classList.contains('is-highlighted')).toBe(true);
    unmount();
    element.remove();
  });
});

// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { mount } from '../mount';
import type { Model } from '../model';

// A pick with one record, and a table of three; a third table is hidden by the view.
const MODEL: Model = {
  tables: [
    { schema: 'pick', name: 'price', fields: [{ name: 'cost', type: 'double' }], records: [{ cost: 12.5 }] },
    {
      schema: 'spec',
      name: 'bom',
      fields: [{ name: 'part', type: 'text', pk: true }, { name: 'qty', type: 'int' }],
      records: [{ part: 'CPU', qty: 2 }, { part: 'GPU', qty: 8 }, { part: 'TRAY', qty: 1 }],
    },
    { name: 'hidden', fields: [{ name: 'x', type: 'int' }], records: [{ x: 1 }] },
  ],
  views: [{ name: 'shown', tables: ['pick.price', 'spec.bom'] }],
};

const PALETTE = {
  overlay: { label: 'overlay', color: '#7C3AED' },
  catalog: { label: 'catalog', color: '#2563EB' },
};

async function setup () {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const mounted = mount(element, { model: MODEL, display: { categories: PALETTE } });
  await flushPromises();
  await nextTick();
  return {
    element,
    engine: mounted.engine,
    done: () => {
      mounted.unmount();
      element.remove();
    },
  };
}

const dotIn = (el: Element, selector: string) => el.querySelector(selector)?.querySelector('.dg-category-dot') ?? null;

describe('value categories', () => {
  it('draw a dot of their color before the value, grey for a category the palette does not name', async () => {
    const { element, engine, done } = await setup();
    engine.setCategories({
      'pick.price.cost[0]': 'catalog',
      'spec.bom.qty[1]': 'overlay',
      'spec.bom.qty[2]': 'case',
    });
    await nextTick();
    expect(dotIn(element, '.dg-field[data-key="pick.price.cost"]')?.getAttribute('fill')).toBe('#2563EB');
    expect(dotIn(element, '[data-key="spec.bom.qty[1]"]')?.getAttribute('fill')).toBe('#7C3AED');
    expect(dotIn(element, '[data-key="spec.bom.qty[2]"]')?.getAttribute('fill')).toBe('#9CA3AF');
    expect(dotIn(element, '[data-key="spec.bom.qty[0]"]')).toBeNull();
    engine.setCategories(null);
    await nextTick();
    expect(element.querySelector('.dg-category-dot')).toBeNull();
    done();
  });

  it('are listed in the legend as used, in the palette\'s order and then by name, without lineage by column', async () => {
    const { element, engine, done } = await setup();
    engine.setCategories({
      'spec.bom.qty[2]': 'case',
      'spec.bom.qty[1]': 'overlay',
      'pick.price.cost[0]': 'catalog',
    });
    await nextTick();
    expect([...element.querySelectorAll('.dg-legend-item.is-category')].map((e) => e.textContent?.trim())).toEqual(['overlay', 'catalog', 'case']);
    done();
  });

  it('leave out of the legend the categories of tables not drawn', async () => {
    const { element, engine, done } = await setup();
    engine.selectView('shown');
    engine.setCategories({ 'public.hidden.x[0]': 'overlay' });
    await nextTick();
    await nextTick();
    expect(element.querySelector('.dg-legend')).toBeNull();
    done();
  });

  it('are named in a value\'s tooltip', async () => {
    const { element, engine, done } = await setup();
    engine.setCategories({ 'spec.bom.qty[1]': 'overlay' });
    await nextTick();
    element.querySelector('[data-key="spec.bom.qty[1]"]')!.dispatchEvent(new PointerEvent('pointerenter'));
    await new Promise((r) => setTimeout(r, 200));
    await nextTick();
    expect(element.querySelector('.dg-tooltip')?.textContent).toContain('category: overlay');
    done();
  });

  it('sit in the legend, in the corner asked for', async () => {
    const { element, engine, done } = await setup();
    engine.setCategories({ 'spec.bom.qty[1]': 'overlay' });
    await nextTick();
    expect(element.querySelector('.dg-legend')!.classList.contains('is-top-left')).toBe(true);
    engine.setDisplay({ legendCorner: 'bottom-right' });
    await nextTick();
    expect(element.querySelector('.dg-legend')!.classList.contains('is-bottom-right')).toBe(true);
    done();
  });

  it('fold to a button the reader opens again', async () => {
    const { element, engine, done } = await setup();
    engine.setCategories({ 'spec.bom.qty[1]': 'overlay' });
    await nextTick();
    const toggle = element.querySelector<HTMLButtonElement>('.dg-legend-toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    toggle.click();
    await nextTick();
    expect(element.querySelector('.dg-legend')!.classList.contains('is-collapsed')).toBe(true);
    expect(element.querySelectorAll('.dg-legend-item')).toHaveLength(0);
    toggle.click();
    await nextTick();
    expect(element.querySelectorAll('.dg-legend-item')).toHaveLength(1);
    done();
  });
});

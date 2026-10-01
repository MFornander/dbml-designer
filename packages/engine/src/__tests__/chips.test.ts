// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { mount } from '../mount';
import type { Model } from '../model';
import type { ElementClickEvent, ElementEvent, TableChip } from '../types';

const MODEL: Model = {
  tables: [
    { schema: 'input', name: 'item', fields: [{ name: 'id', type: 'int' }], source: 'item-src' },
    { name: 'other', fields: [{ name: 'id', type: 'int' }] },
  ],
};

const kind: TableChip = { id: 'kind', label: 'input', outline: true };
const status = (label: string, color?: string): TableChip => ({
  id: 'status', label, ...(color ? { color } : {}), note: '3 ms · no issues',
});

async function setup (display = {}) {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const clicks: ElementClickEvent[] = [];
  const hovers: (ElementEvent | null)[] = [];
  const mounted = mount(element, {
    model: MODEL,
    display,
    onElementClick: (e) => clicks.push(e),
    onElementHover: (e) => hovers.push(e),
  });
  await flushPromises();
  await nextTick();
  const settle = async () => {
    await nextTick();
    await nextTick();
  };
  const done = () => {
    mounted.unmount();
    element.remove();
  };
  return { element, engine: mounted.engine, clicks, hovers, settle, done };
}

const chipsOf = (el: Element, table: string) => [...el.querySelectorAll(`.dg-table[data-key="${table}"] .dg-chip`)];

describe('setChips', () => {
  it('draws the chips after the name, outlined or filled, each the same width whatever its label', async () => {
    const { element, engine, settle, done } = await setup();
    const bare = engine.rectOf('input.item')!.w;
    engine.setChips({ 'input.item': [kind, status('14 rows')] });
    await settle();
    const chips = chipsOf(element, 'input.item');
    expect(chips.map((c) => c.getAttribute('data-chip'))).toEqual(['kind', 'status']);
    expect(chips.map((c) => c.textContent?.trim())).toEqual(['input', '14 rows']);
    expect(chips[0]!.classList.contains('is-outline')).toBe(true);
    expect(chips.map((c) => c.querySelector('.dg-chip-bg')!.getAttribute('width'))).toEqual(['71', '71']);
    const withChips = engine.rectOf('input.item')!.w;
    expect(withChips).toBeGreaterThan(bare);

    // A new label, even a long one, leaves the table's size alone and is cut to fit.
    engine.setChips({ 'input.item': [kind, status('1,204,331 rows of data', '#D97706')] });
    await settle();
    expect(engine.rectOf('input.item')!.w).toBe(withChips);
    const cut = chipsOf(element, 'input.item')[1]!;
    expect(cut.textContent?.trim().endsWith('…')).toBe(true);
    expect((cut as SVGElement).style.getPropertyValue('--dg-chip-fill')).toBe('#D97706');

    engine.setChips(null);
    await settle();
    expect(element.querySelector('.dg-chip')).toBeNull();
    expect(engine.rectOf('input.item')!.w).toBe(bare);
    done();
  });

  it('draws chips at the width asked for', async () => {
    const { element, engine, settle, done } = await setup({ chipWidth: 100 });
    engine.setChips({ 'input.item': [kind] });
    await settle();
    expect(chipsOf(element, 'input.item')[0]!.querySelector('.dg-chip-bg')!.getAttribute('width')).toBe('99');
    done();
  });

  it('reports a chip click and hover as the chip, with its own rectangle and its table\'s source', async () => {
    const { element, engine, clicks, hovers, settle, done } = await setup();
    engine.setChips({ 'input.item': [kind, status('14 rows')] });
    await settle();
    const table = element.querySelector('.dg-table[data-key="input.item"]')!;
    const chip = chipsOf(element, 'input.item')[1]!;
    table.dispatchEvent(new PointerEvent('pointerenter'));
    chip.dispatchEvent(new PointerEvent('pointerenter'));
    await settle();
    expect(hovers.at(-1)?.target).toEqual({ kind: 'chip', tableKey: 'input.item', chip: 'status' });

    chip.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: 10, clientY: 10 }));
    await settle();
    const click = clicks.at(-1)!;
    expect(click.target).toEqual({ kind: 'chip', tableKey: 'input.item', chip: 'status' });
    expect(click.source).toBe('item-src');
    expect(click.rect?.w).toBe(72);
    // The engine still selects the table the chip belongs to.
    expect(table.classList.contains('is-selected')).toBe(true);
    done();
  });

  it('shows a chip\'s note as its tooltip', async () => {
    const { element, engine, settle, done } = await setup();
    engine.setChips({ 'input.item': [status('14 rows')] });
    await settle();
    chipsOf(element, 'input.item')[0]!.dispatchEvent(new PointerEvent('pointerenter'));
    await new Promise((r) => setTimeout(r, 200));
    await nextTick();
    expect(element.querySelector('.dg-tooltip')?.textContent).toContain('3 ms · no issues');
    done();
  });

  it('shows a cut label in full as the tooltip, before the note, and no tooltip for a label that fits without one', async () => {
    const { element, engine, settle, done } = await setup();
    const hoverTip = async (table: string): Promise<string | null> => {
      chipsOf(element, table)[0]!.dispatchEvent(new PointerEvent('pointerenter'));
      await new Promise((r) => setTimeout(r, 200));
      await nextTick();
      const text = element.querySelector('.dg-tooltip')?.textContent ?? null;
      chipsOf(element, table)[0]!.dispatchEvent(new PointerEvent('pointerleave'));
      element.querySelector(`.dg-table[data-key="${table}"]`)!.dispatchEvent(new PointerEvent('pointerleave'));
      await settle();
      return text;
    };
    engine.setChips({
      'input.item': [{ id: 'k', label: 'a label far too long for its chip' }],
      'public.other': [{ id: 'k', label: 'core' }],
    });
    await settle();
    expect(await hoverTip('input.item')).toContain('a label far too long for its chip');
    expect(await hoverTip('public.other')).toBeNull();
    done();
  });
});

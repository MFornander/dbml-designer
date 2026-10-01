// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { fromModel } from '../fromModel';
import { createLayout, emptyLayoutState } from '../engine/layout';
import { mount } from '../mount';
import type { Model } from '../model';
import type { ElementClickEvent } from '../types';

// A pick with its provenance twin and an explain view, in the picks group; an input feeds both
// the pick and the twin.
const MODEL: Model = {
  tables: [
    { schema: 'input', name: 'catalog', fields: [{ name: 'cost', type: 'double' }] },
    { schema: 'pick', name: 'price', fields: [{ name: 'cost', type: 'double' }] },
    { schema: 'pick', name: 'price_source', fields: [{ name: 'layer', type: 'text' }], companionOf: 'pick.price', companionLabel: 'ⓢ', source: 'twin' },
    { schema: 'explain', name: 'price_explain', fields: [{ name: 'why', type: 'text' }], companionOf: 'pick.price' },
  ],
  deps: [
    { from: { table: 'input.catalog', fields: ['cost'] }, to: { table: 'pick.price', fields: ['cost'] } },
    { from: { table: 'input.catalog', fields: ['cost'] }, to: { table: 'pick.price_source', fields: ['layer'] } },
  ],
  groups: [{ schema: 'pick', name: 'picks', tables: ['pick.price'] }],
};

describe('companions in the drawn model', () => {
  it('fold into their owner with their badge labels, and join its group', () => {
    const m = fromModel(MODEL);
    expect(m.tablesByKey.get('pick.price')!.companions).toEqual([
      { key: 'pick.price_source', label: 'ⓢ' },
      { key: 'explain.price_explain', label: 'price_explain' },
    ]);
    expect(m.tablesByKey.get('pick.price_source')!.companionOf).toBe('pick.price');
    expect(m.groups[0]!.tableKeys).toEqual(['pick.price', 'pick.price_source', 'explain.price_explain']);
    expect(m.diagnostics).toEqual([]);
  });

  it('report an owner that is not there, or is a companion itself, and leave the table as it is', () => {
    const m = fromModel({
      tables: [
        { name: 'a', fields: [], companionOf: 'public.nowhere' },
        { name: 'b', fields: [], companionOf: 'public.c' },
        { name: 'c', fields: [], companionOf: 'public.d' },
        { name: 'd', fields: [] },
      ],
    });
    expect(m.diagnostics.map((d) => d.kind)).toEqual(['unresolved-companion', 'unresolved-companion']);
    expect(m.tablesByKey.get('public.a')!.companionOf).toBeUndefined();
    expect(m.tablesByKey.get('public.c')!.companionOf).toBe('public.d');
  });
});

describe('the layout\'s unfolded companions', () => {
  it('are folded by default, set per view, and saved', () => {
    const view = ref<string | null>(null);
    const layout = createLayout({ activeView: () => view.value, state: ref(emptyLayoutState()) });
    expect(layout.unfoldedCompanions.value.size).toBe(0);
    layout.setUnfolded(['pick.price_source', 'explain.price_explain'], true);
    expect([...layout.unfoldedCompanions.value].sort()).toEqual(['explain.price_explain', 'pick.price_source']);
    // A named view starts from the Default View, and folds one back for itself alone.
    view.value = 'steps';
    expect(layout.unfoldedCompanions.value.has('pick.price_source')).toBe(true);
    layout.setUnfolded(['pick.price_source'], false);
    expect(layout.unfoldedCompanions.value.has('pick.price_source')).toBe(false);
    view.value = null;
    expect(layout.unfoldedCompanions.value.has('pick.price_source')).toBe(true);
    const snap = layout.snapshot();
    expect(snap.unfoldedCompanions).toEqual(['pick.price_source', 'explain.price_explain']);
    expect(snap.views?.steps?.foldedCompanions).toEqual(['pick.price_source']);
    layout.pruneTo({
      tables: new Set(['pick.price_source']),
      notes: new Set(),
      groups: new Set(),
      refs: new Set(),
      views: new Set(['steps']),
    });
    expect([...layout.unfoldedCompanions.value]).toEqual(['pick.price_source']);
  });
});

describe('companions in the diagram', () => {
  async function setup (onElementClick?: (e: ElementClickEvent) => void) {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const mounted = mount(element, { model: MODEL, ...(onElementClick ? { onElementClick } : {}) });
    await flushPromises();
    await nextTick();
    const settle = async () => {
      await flushPromises();
      await nextTick();
      await nextTick();
    };
    const badge = (key: string) => element.querySelector(`.dg-companion-badge[data-companion="${key}"]`)!;
    const click = async (el: Element) => {
      el.dispatchEvent(new PointerEvent('pointerenter'));
      el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 5, clientY: 5 }));
      window.dispatchEvent(new MouseEvent('pointerup', { clientX: 5, clientY: 5 }));
      await settle();
    };
    return {
      element,
      engine: mounted.engine,
      badge,
      click,
      done: () => {
        mounted.unmount();
        element.remove();
      },
    };
  }
  const drawn = (el: Element, key: string) => el.querySelector(`.dg-table[data-key="${key}"]`) !== null;

  it('are folded at first: a dashed badge in the owner\'s header, with no table and no lineage of their own', async () => {
    const { element, badge, done } = await setup();
    expect(badge('pick.price_source').textContent?.trim()).toBe('ⓢ');
    expect(badge('pick.price_source').classList.contains('is-open')).toBe(false);
    expect(drawn(element, 'pick.price_source')).toBe(false);
    expect(element.querySelector('[data-key="dep:input.catalog->pick.price_source"]')).toBeNull();
    done();
  });

  it('unfold below their owner, inside its group, on a click of the badge, and fold back on another', async () => {
    const clicks: ElementClickEvent[] = [];
    const { element, engine, badge, click, done } = await setup((e) => clicks.push(e));
    await click(badge('pick.price_source'));
    expect(clicks.at(-1)!.target).toEqual({ kind: 'companion', tableKey: 'pick.price', companion: 'pick.price_source' });
    expect(clicks.at(-1)!.source).toBe('twin');
    expect(engine.layout.unfoldedCompanions.value.has('pick.price_source')).toBe(true);
    expect(drawn(element, 'pick.price_source')).toBe(true);
    const owner = engine.layout.positions.value['pick.price']!;
    const twin = engine.layout.positions.value['pick.price_source']!;
    expect(twin.x).toBe(owner.x);
    expect(twin.y).toBeGreaterThan(owner.y);
    expect(element.querySelector('[data-key="dep:input.catalog->pick.price_source"]')).not.toBeNull();

    await click(badge('pick.price_source'));
    expect(drawn(element, 'pick.price_source')).toBe(false);
    // Folded and shown again, it comes back where it was.
    engine.layout.setUnfolded(['pick.price_source'], true);
    await nextTick();
    expect(engine.layout.positions.value['pick.price_source']).toEqual(twin);
    done();
  });

  it('stay folded when the host keeps the engine from the click', async () => {
    const { engine, badge, click, done } = await setup((e) => e.preventDefault());
    await click(badge('pick.price_source'));
    expect(engine.layout.unfoldedCompanions.value.size).toBe(0);
    done();
  });
});

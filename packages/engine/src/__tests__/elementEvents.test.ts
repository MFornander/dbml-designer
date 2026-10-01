// @vitest-environment happy-dom
import {
  describe, it, expect, beforeAll, afterAll,
} from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import DiagramCanvas from '../components/DiagramCanvas.vue';
import { fromModel } from '../fromModel';
import { ROW_H } from '../geometry/constants';
import type { Model } from '../model';
import type {
  DiagramViewport, ElementClickEvent, ElementEvent, RevealAdded,
} from '../types';

const MODEL: Model = {
  tables: [
    {
      name: 'users',
      fields: [{ name: 'id', type: 'int', pk: true }, { name: 'name', type: 'text' }],
      source: { id: 'users' },
    },
    {
      name: 'posts',
      fields: [{ name: 'id', type: 'int', pk: true }, { name: 'user_id', type: 'int' }],
    },
  ],
  refs: [{ from: { table: 'public.posts', fields: ['user_id'] }, to: { table: 'public.users', fields: ['id'] } }],
  deps: [{ from: { table: 'public.users', fields: ['name'] }, to: { table: 'public.posts', fields: ['user_id'] }, kind: 'value' }],
  groups: [{ name: 'core', tables: ['public.users'] }],
};

const POSITIONS = {
  'public.users': { x: 0, y: 0 },
  'public.posts': { x: 400, y: 0 },
};

// A pane with a size, so fitting and panning have room to work in.
let restore: (() => void) | null = null;
beforeAll(() => {
  const w = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  const h = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
  restore = () => {
    if (w) Object.defineProperty(HTMLElement.prototype, 'clientWidth', w);
    if (h) Object.defineProperty(HTMLElement.prototype, 'clientHeight', h);
  };
});
afterAll(() => restore?.());

type Canvas = InstanceType<typeof DiagramCanvas>;

function mountCanvas (props: Record<string, unknown> = {}) {
  return mount(DiagramCanvas, {
    props: {
      model: fromModel(MODEL),
      positions: POSITIONS,
      detailLevel: 'all',
      dark: false,
      ...props,
    },
    attachTo: document.body,
  });
}

async function click (el: Element) {
  el.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 10, clientY: 10, bubbles: true }));
  window.dispatchEvent(new PointerEvent('pointerup', { clientX: 10, clientY: 10 }));
  await nextTick();
}

describe('element events', () => {
  it('report a click on a field with its source and screen rectangle, and still pin and select its table', async () => {
    const wrapper = mountCanvas();
    await nextTick();
    const table = wrapper.find('.dg-table[data-key="public.users"]');
    await wrapper.find('.dg-field[data-key="public.users.name"]').trigger('pointerenter');
    await click(table.element);
    const [event] = wrapper.emitted('element-click')!.at(-1) as [ElementClickEvent];
    expect(event.target).toEqual({ kind: 'field', tableKey: 'public.users', fieldKey: 'public.users.name' });
    expect(event.rect).not.toBeNull();
    expect(event.defaultPrevented).toBe(false);
    expect(wrapper.emitted('table-click')).toHaveLength(1);
    expect(table.classes()).toContain('is-selected');
    wrapper.unmount();
  });

  it('report a table click with the source the model gave it', async () => {
    const wrapper = mountCanvas();
    await nextTick();
    await click(wrapper.find('.dg-table[data-key="public.users"]').element);
    const [event] = wrapper.emitted('element-click')!.at(-1) as [ElementClickEvent];
    expect(event.target).toEqual({ kind: 'table', key: 'public.users' });
    expect(event.source).toEqual({ id: 'users' });
    expect(event.point).toEqual({ x: 10, y: 10 });
    wrapper.unmount();
  });

  it('let the host keep the engine from pinning and selecting what was clicked', async () => {
    const wrapper = mountCanvas({ onElementClick: (e: ElementClickEvent) => e.preventDefault() });
    await nextTick();
    const table = wrapper.find('.dg-table[data-key="public.users"]');
    await click(table.element);
    expect(table.classes()).not.toContain('is-selected');
    // The table pinned would keep its ref lit after the pointer leaves.
    await table.trigger('pointerleave');
    expect(wrapper.find('.dg-ref.is-highlighted').exists()).toBe(false);
    // Hosts that listen for table clicks still hear them.
    expect(wrapper.emitted('table-click')).toHaveLength(1);
    wrapper.unmount();
  });

  it('report edge clicks and pin the edge unless the host asks not to', async () => {
    const wrapper = mountCanvas();
    await nextTick();
    const ref = wrapper.find('.dg-ref:not(.dg-dep)');
    await ref.find('.dg-ref-hit').trigger('click');
    const [event] = wrapper.emitted('element-click')!.at(-1) as [ElementClickEvent];
    expect(event.target.kind).toBe('ref');
    expect(event.rect).not.toBeNull();
    expect(ref.classes()).toContain('is-highlighted');
    wrapper.unmount();

    const prevented = mountCanvas({ onElementClick: (e: ElementClickEvent) => e.preventDefault() });
    await nextTick();
    const ref2 = prevented.find('.dg-ref:not(.dg-dep)');
    await ref2.find('.dg-ref-hit').trigger('click');
    expect(ref2.classes()).not.toContain('is-highlighted');
    prevented.unmount();
  });

  it('report a click on a group header', async () => {
    const wrapper = mountCanvas();
    await nextTick();
    const header = wrapper.find('.dg-group[data-key="group:public.core"] .dg-group-header');
    await click(header.element);
    const [event] = wrapper.emitted('element-click')!.at(-1) as [ElementClickEvent];
    expect(event.target).toEqual({ kind: 'group', key: 'group:public.core' });
    wrapper.unmount();
  });

  it('report what the pointer moves onto, and null when it leaves', async () => {
    const wrapper = mountCanvas();
    await nextTick();
    const table = wrapper.find('.dg-table[data-key="public.posts"]');
    // The pointer crosses into the table (pointerover) before it enters it.
    table.element.dispatchEvent(new PointerEvent('pointerover', { clientX: 30, clientY: 40, bubbles: true }));
    await table.trigger('pointerenter');
    let [event] = wrapper.emitted('element-hover')!.at(-1) as [ElementEvent | null];
    expect(event?.target).toEqual({ kind: 'table', key: 'public.posts' });
    expect(event?.rect).not.toBeNull();
    expect(event?.point).toEqual({ x: 30, y: 40 });
    await table.trigger('pointerleave');
    [event] = wrapper.emitted('element-hover')!.at(-1) as [ElementEvent | null];
    expect(event).toBeNull();
    wrapper.unmount();
  });
});

describe('rectOf and the viewport', () => {
  it('give rectangles from the layout, scaled and moved with the viewport', async () => {
    const wrapper = mountCanvas();
    await flushPromises();
    const canvas = wrapper.vm as unknown as Canvas;
    canvas.setViewport({ x: 10, y: 20, zoom: 0.5 });
    await nextTick();
    expect(canvas.viewport).toEqual({ x: 10, y: 20, zoom: 0.5 });
    expect((wrapper.emitted('viewport-change')!.at(-1) as [DiagramViewport])[0]).toEqual({ x: 10, y: 20, zoom: 0.5 });

    const table = canvas.rectOf('public.posts')!;
    expect(table.x).toBe(10 + 400 * 0.5);
    expect(table.y).toBe(20);
    const field = canvas.rectOf('public.posts.user_id')!;
    expect(field.y).toBe(20 + ROW_H * 2 * 0.5);
    expect(field.h).toBe(ROW_H * 0.5);
    // A mapping of one kind is where its column pair is drawn.
    const pair = 'dep:public.users(name)->public.posts(user_id)';
    expect(canvas.rectOf(`${pair}#value`)).toEqual(canvas.rectOf(pair));
    expect(canvas.rectOf('public.nothing')).toBeNull();
    wrapper.unmount();
  });

  it('fit to the elements asked for', async () => {
    const wrapper = mountCanvas();
    await flushPromises();
    const canvas = wrapper.vm as unknown as Canvas;
    canvas.fit(['public.posts.user_id']);
    await nextTick();
    const field = canvas.rectOf('public.posts.user_id')!;
    // The field fills the pane's width, less the padding, and sits inside it.
    expect(field.x).toBeGreaterThanOrEqual(0);
    expect(field.x + field.w).toBeLessThanOrEqual(800);
    expect(canvas.viewport!.zoom).toBeGreaterThan(1);
    wrapper.unmount();
  });
});

describe('revealAdded', () => {
  const FAR: Model = {
    ...MODEL,
    tables: [...MODEL.tables, { name: 'far', fields: [{ name: 'id', type: 'int' }] }],
  };

  async function grow (revealAdded: RevealAdded) {
    const wrapper = mountCanvas({ revealAdded });
    await flushPromises();
    const canvas = wrapper.vm as unknown as Canvas;
    const before = { ...canvas.viewport! };
    await wrapper.setProps({
      model: fromModel(FAR),
      positions: { ...POSITIONS, 'public.far': { x: 4000, y: 3000 } },
      marked: new Set(['public.far']),
    });
    await flushPromises();
    await nextTick();
    const after = { ...canvas.viewport! };
    wrapper.unmount();
    return { before, after };
  }

  it('pans a new table into view at the same zoom by default', async () => {
    const { before, after } = await grow('pan');
    expect(after.zoom).toBe(before.zoom);
    expect(after.x).toBeLessThan(before.x);
  });

  it('keeps the whole diagram fitted with fit', async () => {
    const { before, after } = await grow('fit');
    expect(after.zoom).toBeLessThan(before.zoom);
  });

  it('leaves the view alone with none', async () => {
    const { before, after } = await grow('none');
    expect(after).toEqual(before);
  });
});

// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';
import EngineDiagram from '../components/EngineDiagram.vue';
import { createEngine } from '../engine/engine';
import type { Model } from '../model';

/** Two tables and a ref, written by hand: no DBML anywhere. */
const MODEL: Model = {
  tables: [
    {
      name: 'users',
      fields: [{
        name: 'id',
        type: 'int',
        pk: true,
      }],
      source: { id: 'users-from-my-program' },
    },
    {
      name: 'posts',
      fields: [{
        name: 'id',
        type: 'int',
        pk: true,
      }, {
        name: 'user_id',
        type: 'int',
      }],
    },
  ],
  refs: [{
    from: {
      table: 'public.posts',
      fields: ['user_id'],
      cardinality: '*',
    },
    to: {
      table: 'public.users',
      fields: ['id'],
    },
  }],
  views: [{
    name: 'just_users',
    tables: ['public.users'],
  }],
};

const PLACED = {
  positions: {
    'public.users': {
      x: 0,
      y: 0,
    },
    'public.posts': {
      x: 400,
      y: 0,
    },
  },
  collapsedGroups: [],
  edgeRoutes: {},
};

async function settle (): Promise<void> {
  await flushPromises();
  await nextTick();
}

describe('EngineDiagram', () => {
  it('draws an engine from a model without DBML and places its tables into the engine layout', async () => {
    const engine = createEngine({ model: MODEL });
    const wrapper = mount(EngineDiagram, {
      props: { engine },
      attachTo: document.body,
    });
    await settle();
    expect(wrapper.findAll('.dg-table')).toHaveLength(2);
    expect(wrapper.findAll('.dg-ref')).toHaveLength(1);
    expect(Object.keys(engine.layout.positions.value).sort()).toEqual(['public.posts', 'public.users']);
    expect(engine.layout.newTables.value.size).toBe(2);
    wrapper.unmount();
    engine.dispose();
  });

  it('keeps two engines on one page apart', async () => {
    const one = createEngine({
      model: MODEL,
      layout: PLACED,
    });
    const two = createEngine({
      model: MODEL,
      layout: PLACED,
    });
    const wrapper = mount(defineComponent({
      setup: () => () => h('div', [h(EngineDiagram, { engine: one }), h(EngineDiagram, { engine: two })]),
    }), { attachTo: document.body });
    await settle();
    const users = wrapper.findAll('.dg-table[data-key="public.users"]')[0]!;
    await users.trigger('pointerdown', {
      button: 0,
      clientX: 10,
      clientY: 10,
    });
    window.dispatchEvent(new MouseEvent('pointermove', {
      clientX: 10 + 101,
      clientY: 10 + 47,
    }));
    window.dispatchEvent(new MouseEvent('pointerup', {
      clientX: 10 + 101,
      clientY: 10 + 47,
    }));
    await settle();
    expect(one.layout.positions.value['public.users']).toEqual({
      x: 104,
      y: 48,
    });
    expect(two.layout.positions.value['public.users']).toEqual({
      x: 0,
      y: 0,
    });
    expect(one.snapshot().positions['public.users']).toEqual({
      x: 104,
      y: 48,
    });
    wrapper.unmount();
    one.dispose();
    two.dispose();
  });

  it('follows a new model, keeps the layout, and drops what is gone', async () => {
    const engine = createEngine({
      model: MODEL,
      layout: PLACED,
    });
    const wrapper = mount(EngineDiagram, {
      props: { engine },
      attachTo: document.body,
    });
    await settle();
    engine.setModel({
      tables: [MODEL.tables[0]!, {
        name: 'comments',
        fields: [{
          name: 'id',
          type: 'int',
        }],
      }],
    });
    await settle();
    expect(wrapper.findAll('.dg-table').map((t) => t.attributes('data-key')).sort()).toEqual(['public.comments', 'public.users']);
    expect(engine.layout.positions.value['public.users']).toEqual({
      x: 0,
      y: 0,
    });
    expect(engine.layout.positions.value['public.posts']).toBeUndefined();
    expect(engine.layout.newTables.value).toEqual(new Set(['public.comments']));
    wrapper.unmount();
    engine.dispose();
  });

  it('switches views and display options, and hands back the source of a clicked table', async () => {
    const engine = createEngine({
      model: MODEL,
      layout: PLACED,
      display: { detailLevel: 'names' },
    });
    const wrapper = mount(EngineDiagram, {
      props: { engine },
      attachTo: document.body,
    });
    await settle();
    expect(wrapper.find('.dg-field').exists()).toBe(false);
    engine.selectView('just_users');
    await settle();
    expect(wrapper.findAll('.dg-table').map((t) => t.attributes('data-key'))).toEqual(['public.users']);
    engine.setDisplay({ detailLevel: 'all' });
    await settle();
    expect(wrapper.findAll('.dg-field')).toHaveLength(1);

    const users = wrapper.find('.dg-table[data-key="public.users"]');
    await users.trigger('pointerdown', {
      button: 0,
      clientX: 10,
      clientY: 10,
    });
    window.dispatchEvent(new MouseEvent('pointerup', {
      clientX: 10,
      clientY: 10,
    }));
    await settle();
    expect(wrapper.emitted('table-click')?.[0]?.[0]).toEqual({
      key: 'public.users',
      source: { id: 'users-from-my-program' },
    });
    wrapper.unmount();
    engine.dispose();
  });

  it('arranges through the engine and takes it back', async () => {
    const engine = createEngine({
      model: MODEL,
      layout: PLACED,
    });
    const wrapper = mount(EngineDiagram, {
      props: { engine },
      attachTo: document.body,
    });
    await settle();
    expect(engine.arrange()).toBe(true);
    await settle();
    expect(wrapper.emitted('arrange')).toHaveLength(1);
    expect(engine.layout.canUndoArrange.value).toBe(true);
    expect(engine.undoArrange()).toBe(true);
    expect(engine.layout.positions.value).toEqual(PLACED.positions);
    wrapper.unmount();
    expect(engine.arrange()).toBe(false);
    engine.dispose();
  });
});

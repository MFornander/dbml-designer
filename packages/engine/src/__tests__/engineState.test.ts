import { describe, it, expect } from 'vitest';
import { ref, shallowRef } from 'vue';
import { fromModel } from '../fromModel';
import {
  createLayout, emptyLayoutState, layoutKeysOfModel, type LayoutKeys, type LayoutState,
} from '../engine/layout';
import { createViews } from '../engine/views';
import type { LayoutSnapshot } from '../engine/layers';
import type { Model } from '../model';

const MODEL: Model = {
  tables: ['a', 'b', 'c'].map((name) => ({
    name,
    fields: [{
      name: 'id',
      type: 'int',
    }],
  })),
  groups: [{
    name: 'g',
    tables: ['public.a', 'public.b'],
  }],
  views: [{
    name: 'focus',
    tables: ['public.a'],
  }],
};

describe('engine layout state', () => {
  it('keeps two layouts apart, without Pinia', () => {
    const one = createLayout({ activeView: () => null });
    const two = createLayout({ activeView: () => null });
    one.setPosition('public.a', {
      x: 8,
      y: 16,
    });
    expect(one.positions.value).toEqual({
      'public.a': {
        x: 8,
        y: 16,
      },
    });
    expect(two.positions.value).toEqual({});
  });

  it('keeps its layers in the ref the host passes, so the host decides where they live', () => {
    const state = shallowRef<LayoutState>(emptyLayoutState());
    const layout = createLayout({
      activeView: () => null,
      state,
    });
    layout.toggleGroup('group:public.g');
    expect(state.value.collapsedGroups).toEqual(['group:public.g']);
    state.value = emptyLayoutState();
    expect(layout.collapsedGroups.value.size).toBe(0);
  });

  it('stacks on inherited layouts and saves only what it adds, per view', () => {
    const inherited: LayoutSnapshot = {
      positions: {
        'public.a': {
          x: 0,
          y: 0,
        },
      },
      collapsedGroups: ['group:public.g'],
      edgeRoutes: {},
    };
    const active = ref<string | null>(null);
    const layout = createLayout({
      activeView: () => active.value,
      bases: () => [inherited],
    });
    expect(layout.positions.value['public.a']).toEqual({
      x: 0,
      y: 0,
    });
    layout.setPosition('public.b', {
      x: 40,
      y: 0,
    });
    // Unfolding an inherited fold is saved as an undoing.
    layout.toggleGroup('group:public.g');
    active.value = 'focus';
    layout.setPosition('public.a', {
      x: 80,
      y: 80,
    });
    expect(layout.snapshot()).toEqual({
      positions: {
        'public.b': {
          x: 40,
          y: 0,
        },
      },
      collapsedGroups: [],
      expandedGroups: ['group:public.g'],
      edgeRoutes: {},
      views: {
        focus: {
          positions: {
            'public.a': {
              x: 80,
              y: 80,
            },
          },
          collapsedGroups: [],
          edgeRoutes: {},
        },
      },
    });
  });

  it('takes an arrangement back and drops what the diagram no longer has', () => {
    let keys: LayoutKeys | null = layoutKeysOfModel(fromModel(MODEL));
    const layout = createLayout({
      activeView: () => null,
      validKeys: () => keys,
    });
    layout.setPosition('public.c', {
      x: 0,
      y: 0,
    });
    layout.applyArrangement([{
      key: 'public.a',
      x: 100,
      y: 0,
    }, {
      key: 'public.c',
      x: 200,
      y: 0,
    }]);
    expect(layout.undoableArrangeTables.value).toBe(2);
    keys = layoutKeysOfModel(fromModel({
      ...MODEL,
      tables: MODEL.tables.slice(0, 2),
    }));
    expect(layout.undoArrange()).toBe(true);
    expect(layout.positions.value).toEqual({});
    expect(layout.canUndoArrange.value).toBe(false);
  });
});

describe('engine view state', () => {
  it('follows the model, hides what the active view leaves out, and keeps two engines apart', () => {
    const m = fromModel(MODEL);
    const one = createViews();
    const two = createViews();
    one.sync(m);
    two.sync(m);
    one.select('focus');
    expect([...one.hidden.value]).toEqual(['public.b', 'public.c']);
    expect(two.activeView.value).toBeNull();
    expect(two.hidden.value.size).toBe(0);
    one.toggle('public.b');
    expect(one.dirty.value).toBe(true);
    one.revert();
    expect(one.dirty.value).toBe(false);
  });

  it('falls back to the Default View when the active view disappears', () => {
    const active = ref<string | null>('focus');
    const views = createViews({ active });
    views.sync(fromModel({
      ...MODEL,
      views: [],
    }));
    expect(active.value).toBeNull();
  });
});

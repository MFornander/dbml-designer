import {
  describe, it, expect, beforeEach,
} from 'vitest';
import { nextTick } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import { useLayoutStore } from '@/stores/layoutStore';
import { useParserStore } from '@/stores/parserStore';

describe('layoutStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useLayoutStore().resetLayout();
  });

  it('stores and batches position changes, keeping note sizes', () => {
    const layout = useLayoutStore();
    layout.setPosition('public.a', { x: 8, y: 16 });
    layout.applyPositionChanges([
      { key: 'public.b', x: 1, y: 2 },
      { key: 'note:n', x: 3, y: 4, w: 200, h: 120 },
    ]);
    // A later move without a size keeps the stored size.
    layout.applyPositionChanges([{ key: 'note:n', x: 30, y: 40 }]);
    expect(layout.positions).toEqual({
      'public.a': { x: 8, y: 16 },
      'public.b': { x: 1, y: 2 },
      'note:n': { x: 30, y: 40, w: 200, h: 120 },
    });
  });

  it('prunes positions of elements missing from an error-free parse', async () => {
    const layout = useLayoutStore();
    const parser = useParserStore();
    layout.setPosition('public.gone', { x: 0, y: 0 });
    layout.setPosition('public.b', { x: 0, y: 0 });

    parser.parseNow('Table b { id int [pk] }');
    await nextTick();

    expect(Object.keys(layout.positions)).toEqual(['public.b']);
  });

  it('does not prune when the parse has errors', async () => {
    const layout = useLayoutStore();
    const parser = useParserStore();
    parser.parseNow('Table b { id int [pk] }');
    await nextTick();
    layout.setPosition('public.b', { x: 0, y: 0 });
    layout.setPosition('public.other', { x: 0, y: 0 });

    parser.parseNow('Table c {');
    await nextTick();

    expect(Object.keys(layout.positions).sort()).toEqual(['public.b', 'public.other']);
  });

  it('treats an explicit public schema and no schema as the same key', async () => {
    const layout = useLayoutStore();
    const parser = useParserStore();
    layout.setPosition('public.b', { x: 5, y: 5 });

    parser.parseNow('Table public.b { id int [pk] }');
    await nextTick();

    expect(layout.positions['public.b']).toEqual({ x: 5, y: 5 });
  });

  it('toggles collapsed groups and forgets groups that disappear', async () => {
    const layout = useLayoutStore();
    const parser = useParserStore();
    parser.parseNow('Table a { id int }\nTable b { id int }\nTableGroup g1 { a }\nTableGroup g2 { b }');
    await nextTick();

    layout.toggleGroup('group:public.g1');
    layout.toggleGroup('group:public.g2');
    expect([...layout.collapsedGroups].sort()).toEqual(['group:public.g1', 'group:public.g2']);
    layout.toggleGroup('group:public.g1');
    expect([...layout.collapsedGroups]).toEqual(['group:public.g2']);

    parser.parseNow('Table a { id int }\nTable b { id int }\nTableGroup g1 { a }');
    await nextTick();
    expect([...layout.collapsedGroups]).toEqual([]);
  });

  it('stores hand-drawn routes and forgets them when the relationship or the override goes away', async () => {
    const layout = useLayoutStore();
    const parser = useParserStore();
    parser.parseNow('Table a { id int [pk] }\nTable b { id int [pk] \n a_id int [ref: > a.id] }');
    await nextTick();
    const key = Object.keys(layout.edgeRoutes).length === 0 ? '#public.a(id)->public.b(a_id)' : '';
    layout.setEdgeRoute(key, [300, 100, 400]);
    layout.setEdgeRoute('#nope', [1]);
    expect(layout.edgeRoutes).toEqual({
      [key]: [300, 100, 400],
      '#nope': [1],
    });
    // A parse without the second ref drops its stale route but keeps the live one.
    parser.parseNow('Table a { id int [pk] }\nTable b { id int [pk] \n a_id int [ref: > a.id] }\nTable c { id int }');
    await nextTick();
    expect(layout.edgeRoutes).toEqual({ [key]: [300, 100, 400] });
    layout.setEdgeRoute(key, null);
    expect(layout.edgeRoutes).toEqual({});
  });

  it('snapshots the view state and replaces it from a sidecar, pruned against the current parse', async () => {
    const layout = useLayoutStore();
    const parser = useParserStore();
    parser.parseNow('Table a { id int [pk] }\nNote n { \'x\' }');
    await nextTick();
    layout.setPosition('public.a', { x: 8, y: 16 });
    layout.applyPositionChanges([{ key: 'note:n', x: 0, y: 0, w: 200, h: 100 }]);
    const snap = layout.snapshot();
    expect(snap).toEqual({
      positions: {
        'public.a': { x: 8, y: 16 },
        'note:n': { x: 0, y: 0, w: 200, h: 100 },
      },
      collapsedGroups: [],
      edgeRoutes: {},
    });
    // The snapshot is a copy: later changes do not leak into it.
    layout.setPosition('public.a', { x: 800, y: 800 });
    expect(snap.positions['public.a']).toEqual({ x: 8, y: 16 });

    layout.replaceLayout({
      positions: {
        'public.a': { x: 80, y: 0 },
        'public.gone': { x: 1, y: 1 },
        'note:n': { x: 5, y: 5 },
      },
      collapsedGroups: ['group:public.nope'],
      edgeRoutes: { '#public.a(id)->public.b(a_id)': [300] },
    });
    expect(layout.positions).toEqual({
      'public.a': { x: 80, y: 0 },
      'note:n': { x: 5, y: 5 },
    });
    expect([...layout.collapsedGroups]).toEqual([]);
    expect(layout.edgeRoutes).toEqual({});
  });
});

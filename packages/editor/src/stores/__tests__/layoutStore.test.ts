import {
  describe, it, expect, beforeEach,
} from 'vitest';
import { nextTick } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import { useLayoutStore } from '@/stores/layoutStore';
import { useParserStore } from '@/stores/parserStore';
import { useViewStore } from '@/stores/viewStore';
import { buildDiagramModel } from '@/dbml/buildModel';

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

  it('keeps the route of a ref a TablePartial brings, however the diagram draws partial refs', async () => {
    const layout = useLayoutStore();
    const parser = useParserStore();
    const text = 'TablePartial per_config { config_id text [pk, ref: - config.config_id] }\nTable config { config_id text [pk] }\nTable site { ~per_config }';
    parser.parseNow(text);
    await nextTick();
    const key = '#public.site(config_id)->public.config(config_id)';
    layout.setEdgeRoute(key, [120]);
    parser.parseNow(`${text}\nTable other { id int }`);
    await nextTick();
    expect(layout.edgeRoutes).toEqual({ [key]: [120] });
  });

  it('snapshots the view state and replaces it from an imported layout, pruned against the current parse', async () => {
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

describe('layoutStore inheritance', () => {
  const SCHEMA = [
    'Table users {',
    '  id int [pk]',
    '}',
    'Table posts {',
    '  id int [pk]',
    '  author_id int [ref: > users.id]',
    '}',
    'TableGroup content {',
    '  posts',
    '}',
    '',
    '/* === DBML DESIGNER FOOTER ===',
    'version: 1',
    'tables:',
    '  public:',
    '    posts: { x: 0, y: 64 }',
    '    users: { x: 288, y: 0 }',
    'groups:',
    '  public:',
    '    content: { collapsed: true }',
    'refs:',
    '  - from: users(id)',
    '    to: posts(author_id)',
    '    rails: [ 264.5, 72, 320 ]',
    '*/',
    '',
  ].join('\n');
  const PIPELINE = 'use * from \'./schema\'\n\nTable derived {\n  id int [pk]\n  users_id int [ref: > users.id]\n}\n';
  const AUTHOR = '#public.users(id)->public.posts(author_id)';
  const flush = () => new Promise((r) => setTimeout(r, 0));

  async function openPipeline () {
    setActivePinia(createPinia());
    const layout = useLayoutStore();
    layout.resetLayout();
    const { useEditorStore } = await import('@/stores/editorStore');
    useEditorStore().setText(PIPELINE);
    const parser = useParserStore();
    parser.setSourceLoader(async (abs) => (abs === '/proj/schema.dbml' ? SCHEMA : null));
    parser.setEntryPath('/proj/pipeline.dbml');
    await flush();
    await nextTick();
    expect(parser.errors).toEqual([]);
    return layout;
  }

  it('shows the imported file\'s layout and writes only its own elements to the footer', async () => {
    const layout = await openPipeline();
    expect(layout.positions['public.users']).toEqual({ x: 288, y: 0 });
    expect(layout.positions['public.posts']).toEqual({ x: 0, y: 64 });
    expect([...layout.collapsedGroups]).toEqual(['group:public.content']);
    expect(layout.edgeRoutes).toEqual({ [AUTHOR]: [264.5, 72, 320] });

    layout.setPosition('public.derived', { x: 600, y: 0 });
    expect(layout.snapshot()).toEqual({
      positions: { 'public.derived': { x: 600, y: 0 } },
      collapsedGroups: [],
      edgeRoutes: {},
    });
  });

  it('records a moved imported table as an override and drops it when moved back', async () => {
    const layout = await openPipeline();
    layout.setPosition('public.users', { x: 1000, y: 0 });
    expect(layout.positions['public.users']).toEqual({ x: 1000, y: 0 });
    expect(layout.snapshot().positions).toEqual({ 'public.users': { x: 1000, y: 0 } });
    layout.setPosition('public.users', { x: 288, y: 0 });
    expect(layout.snapshot().positions).toEqual({});
  });

  it('undoes an inherited collapse or route explicitly, and redoes it by removing the undoing', async () => {
    const layout = await openPipeline();
    layout.toggleGroup('group:public.content');
    expect(layout.collapsedGroups.has('group:public.content')).toBe(false);
    expect(layout.snapshot().expandedGroups).toEqual(['group:public.content']);
    layout.toggleGroup('group:public.content');
    expect(layout.collapsedGroups.has('group:public.content')).toBe(true);
    expect(layout.snapshot().expandedGroups).toBeUndefined();

    layout.setEdgeRoute(AUTHOR, null);
    expect(layout.edgeRoutes).toEqual({});
    expect(layout.snapshot().edgeRoutes).toEqual({ [AUTHOR]: [] });
    layout.setEdgeRoute(AUTHOR, [100]);
    expect(layout.edgeRoutes).toEqual({ [AUTHOR]: [100] });
    expect(layout.snapshot().edgeRoutes).toEqual({ [AUTHOR]: [100] });
  });

  it('follows the imported layout when that file changes, keeping overrides', async () => {
    const layout = await openPipeline();
    const parser = useParserStore();
    layout.setPosition('public.posts', { x: 5, y: 5 });
    parser.updateImport('/proj/schema.dbml', SCHEMA.replace('users: { x: 288, y: 0 }', 'users: { x: 400, y: 40 }'));
    expect(layout.positions['public.users']).toEqual({ x: 400, y: 40 });
    expect(layout.positions['public.posts']).toEqual({ x: 5, y: 5 });
    expect(layout.snapshot().positions).toEqual({ 'public.posts': { x: 5, y: 5 } });
  });

  it('replaces the layout without pruning it against the previous text while imports are still loading', async () => {
    setActivePinia(createPinia());
    const layout = useLayoutStore();
    layout.resetLayout();
    const { useEditorStore } = await import('@/stores/editorStore');
    const editor = useEditorStore();
    editor.setText('Table lonely {\n  id int\n}\n');
    const parser = useParserStore();
    parser.parseNow();
    parser.setSourceLoader(async (abs) => (abs === '/proj/schema.dbml' ? SCHEMA : null));
    // Opening the pipeline: its text comes with the path, the import is on its way, the model is still lonely's.
    parser.setEntryPath('/proj/pipeline.dbml', PIPELINE);
    editor.setText(PIPELINE);
    expect(parser.isLoading).toBe(true);
    layout.replaceLayout({
      positions: {
        'public.derived': { x: 600, y: 0 },
        'public.users': { x: 0, y: 0 },
      },
      collapsedGroups: [],
      edgeRoutes: {},
    });
    expect(layout.positions['public.derived']).toEqual({ x: 600, y: 0 });
    expect(layout.positions['public.users']).toEqual({ x: 0, y: 0 });
    await flush();
    await nextTick();
    expect(parser.errors).toEqual([]);
    // Settled: the pipeline's own table stays, the moved import stays as an override, the rest is inherited.
    expect(layout.positions['public.derived']).toEqual({ x: 600, y: 0 });
    expect(layout.positions['public.users']).toEqual({ x: 0, y: 0 });
    expect(layout.positions['public.posts']).toEqual({ x: 0, y: 64 });
    expect(layout.snapshot().positions).toEqual({
      'public.derived': { x: 600, y: 0 },
      'public.users': { x: 0, y: 0 },
    });
  });

  it('inherits a view\'s arrangement from imported footers and writes only its own changes to it', async () => {
    setActivePinia(createPinia());
    const layout = useLayoutStore();
    layout.resetLayout();
    const { useEditorStore } = await import('@/stores/editorStore');
    const pipeline = `${PIPELINE}\nDiagramView overview {\n  Tables {\n    users\n    derived\n  }\n}\n`;
    useEditorStore().setText(pipeline);
    const parser = useParserStore();
    const schema = SCHEMA.replace('refs:\n', 'views:\n  overview:\n    tables:\n      public:\n        users: { x: 900, y: 0 }\nrefs:\n');
    parser.setSourceLoader(async (abs) => (abs === '/proj/schema.dbml' ? schema : null));
    parser.setEntryPath('/proj/pipeline.dbml');
    await flush();
    await nextTick();
    expect(parser.errors).toEqual([]);
    const views = useViewStore();
    views.adopt('overview');
    // The import's say about the view sits above this file's Default View.
    layout.setPosition('public.derived', { x: 600, y: 0 });
    expect(layout.positions['public.users']).toEqual({ x: 900, y: 0 });
    expect(layout.snapshot()).toEqual({
      positions: {},
      collapsedGroups: [],
      edgeRoutes: {},
      views: { overview: { positions: { 'public.derived': { x: 600, y: 0 } }, collapsedGroups: [], edgeRoutes: {} } },
    });
    views.select(null, buildDiagramModel(parser.rawDatabase!));
    expect(layout.positions['public.users']).toEqual({ x: 288, y: 0 });
    expect(layout.positions['public.derived']).toBeUndefined();
  });
});

describe('layoutStore views', () => {
  const TABLES = 'Table a {\n  id int [pk]\n}\nTable b {\n  id int [pk]\n}\nTableGroup g {\n  a\n}\n';
  const VIEW = 'DiagramView overview {\n  Tables {\n    a\n    b\n  }\n}\n';
  const TEXT = TABLES + VIEW;
  const G = 'group:public.g';

  async function open (text = TEXT) {
    setActivePinia(createPinia());
    const { useEditorStore } = await import('@/stores/editorStore');
    useEditorStore().setText(text);
    const layout = useLayoutStore();
    layout.resetLayout();
    const parser = useParserStore();
    parser.parseNow(text);
    await nextTick();
    expect(parser.errors).toEqual([]);
    const views = useViewStore();
    views.select(null, buildDiagramModel(parser.rawDatabase!));
    return {
      layout,
      parser,
      views,
    };
  }

  it('arranges a named view as changes against the Default View, which it otherwise follows', async () => {
    const { layout, parser, views } = await open();
    layout.setPosition('public.a', { x: 8, y: 16 });
    layout.setPosition('public.b', { x: 100, y: 100 });
    layout.toggleGroup(G);

    views.adopt('overview');
    // The view starts out looking like the Default View.
    expect(layout.positions).toEqual({ 'public.a': { x: 8, y: 16 }, 'public.b': { x: 100, y: 100 } });
    expect([...layout.collapsedGroups]).toEqual([G]);
    expect(layout.snapshot().views).toBeUndefined();

    layout.setPosition('public.a', { x: 200, y: 200 });
    layout.toggleGroup(G);
    expect(layout.positions['public.a']).toEqual({ x: 200, y: 200 });
    expect([...layout.collapsedGroups]).toEqual([]);
    expect(layout.snapshot()).toEqual({
      positions: { 'public.a': { x: 8, y: 16 }, 'public.b': { x: 100, y: 100 } },
      collapsedGroups: [G],
      edgeRoutes: {},
      views: { overview: { positions: { 'public.a': { x: 200, y: 200 } }, collapsedGroups: [], expandedGroups: [G], edgeRoutes: {} } },
    });

    // The Default View is untouched; a change there shows in the view unless the view overrides it.
    views.select(null, buildDiagramModel(parser.rawDatabase!));
    expect(layout.positions['public.a']).toEqual({ x: 8, y: 16 });
    expect([...layout.collapsedGroups]).toEqual([G]);
    layout.setPosition('public.b', { x: 300, y: 300 });
    layout.setPosition('public.a', { x: 9, y: 9 });
    views.adopt('overview');
    expect(layout.positions).toEqual({ 'public.a': { x: 200, y: 200 }, 'public.b': { x: 300, y: 300 } });

    // Moving the table back to where the Default View has it drops the override.
    layout.setPosition('public.a', { x: 9, y: 9 });
    layout.toggleGroup(G);
    expect(layout.snapshot().views).toBeUndefined();
  });

  it('carries a view layer through a rename and a copy, and drops it with the view', async () => {
    const { layout, parser, views } = await open();
    views.adopt('overview');
    layout.setPosition('public.a', { x: 200, y: 200 });
    layout.setPosition('public.b', { x: 250, y: 250 });
    layout.renameView('overview', 'summary');
    expect(Object.keys(layout.snapshot().views!)).toEqual(['summary']);
    views.adopt('summary');
    expect(layout.positions['public.a']).toEqual({ x: 200, y: 200 });
    layout.copyView('summary', 'twin');
    expect(Object.keys(layout.snapshot().views!).sort()).toEqual(['summary', 'twin']);

    // The parse only knows the renamed view: the copy's layer goes, and so does the entry for a table that is gone.
    parser.parseNow(TABLES.replace('Table b {\n  id int [pk]\n}\n', '') + VIEW.replace('overview', 'summary').replace('    b\n', ''));
    await nextTick();
    expect(parser.errors).toEqual([]);
    expect(layout.snapshot().views).toEqual({ summary: { positions: { 'public.a': { x: 200, y: 200 } }, collapsedGroups: [], edgeRoutes: {} } });
    parser.parseNow(TABLES);
    await nextTick();
    expect(layout.snapshot().views).toBeUndefined();
  });

  it('replaces and resets every layer from a footer', async () => {
    const { layout, views } = await open();
    layout.replaceLayout({
      positions: { 'public.a': { x: 1, y: 1 } },
      collapsedGroups: [],
      edgeRoutes: {},
      views: { overview: { positions: { 'public.a': { x: 2, y: 2 } }, collapsedGroups: [G], edgeRoutes: {} } },
    });
    expect(layout.positions['public.a']).toEqual({ x: 1, y: 1 });
    views.adopt('overview');
    expect(layout.positions['public.a']).toEqual({ x: 2, y: 2 });
    expect([...layout.collapsedGroups]).toEqual([G]);
    layout.resetLayout();
    expect(layout.positions).toEqual({});
    expect(layout.snapshot().views).toBeUndefined();
  });
});

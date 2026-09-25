import {
  describe, it, expect, beforeEach,
} from 'vitest';
import { nextTick } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import { useLayoutStore } from '@/stores/layoutStore';
import { useParserStore } from '@/stores/parserStore';
import { useViewStore } from '@/stores/viewStore';
import { buildDiagramModel } from '@/diagram/adapter/buildModel';
import { arrangeByGroup } from '@/diagram/geometry/arrange';
import { createMeasurer } from '@/diagram/geometry/measure';
import { computeTableSize } from '@/diagram/geometry/tableSize';
import { visibleFields } from '@/diagram/geometry/lod';
import type { PositionChange } from '@/types/diagram';

/** What the canvas hands the store when Arrange runs: every table the view shows, and the routes between them. */
function arrangement (): { changes: PositionChange[]; routes: string[] } {
  const model = buildDiagramModel(useParserStore().rawDatabase!);
  const hidden = useViewStore().hidden;
  const tables = model.tables.filter((t) => !hidden.has(t.key));
  const measurer = createMeasurer(null);
  const { positions } = arrangeByGroup({
    tables,
    groups: model.groups,
    deps: model.deps,
    sizes: new Map(tables.map((t) => [t.key, computeTableSize(t, visibleFields(t, 'all'), measurer)])),
  });
  const shown = new Set(tables.map((t) => t.key));
  return {
    changes: [...positions].map(([key, p]) => ({ key, x: p.x, y: p.y })),
    routes: model.refs.filter((r) => r.endpoints.every((e) => shown.has(e.tableKey))).map((r) => r.key),
  };
}

function arrange (): void {
  const { changes, routes } = arrangement();
  useLayoutStore().applyArrangement(changes, routes);
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('layoutStore arrange across imports', () => {
  const SCHEMA = [
    'Table raw_events {',
    '  id int [pk]',
    '}',
    'Table sessions {',
    '  id int [pk]',
    '  event_id int [ref: > raw_events.id]',
    '}',
    'TableGroup ingest {',
    '  raw_events',
    '  sessions',
    '}',
    'Dep: raw_events -> sessions',
    '',
    '/* === DBML DESIGNER FOOTER ===',
    'version: 1',
    'views:',
    '  default:',
    '    tables:',
    '      public:',
    '        raw_events: { x: 400, y: 0 }',
    '        sessions: { x: 0, y: 400 }',
    '    refs:',
    '      - from: raw_events(id)',
    '        to: sessions(event_id)',
    '        rails: [ 200 ]',
    '*/',
    '',
  ].join('\n');
  const PIPELINE = 'use * from \'./schema\'\n\nTable daily {\n  id int [pk]\n}\nTableGroup report {\n  daily\n}\nDep: sessions -> daily\n';
  const EVENT_REF = '#public.raw_events(id)->public.sessions(event_id)';

  beforeEach(async () => {
    setActivePinia(createPinia());
    useLayoutStore().resetLayout();
    const { useEditorStore } = await import('@/stores/editorStore');
    useEditorStore().setText(PIPELINE);
    const parser = useParserStore();
    parser.setSourceLoader(async (abs) => (abs === '/proj/schema.dbml' ? SCHEMA : null));
    parser.setEntryPath('/proj/pipeline.dbml');
    await flush();
    await nextTick();
    expect(parser.errors).toEqual([]);
    useViewStore().select(null, buildDiagramModel(parser.rawDatabase!));
  });

  it('writes the arranged positions of imported tables into this file\'s footer as overrides, in one undoable step', () => {
    const layout = useLayoutStore();
    layout.setPosition('public.daily', { x: 900, y: 900 });
    const before = layout.snapshot();
    expect(before.positions).toEqual({ 'public.daily': { x: 900, y: 900 } });
    expect(layout.edgeRoutes).toEqual({ [EVENT_REF]: [200] });

    arrange();
    const p = layout.positions;
    // The imported group comes first, its tables layered by their lineage; the report group follows.
    expect(p['public.raw_events']!.x).toBeLessThan(p['public.sessions']!.x);
    expect(p['public.sessions']!.x).toBeLessThan(p['public.daily']!.x);
    const footer = layout.snapshot();
    expect(Object.keys(footer.positions).sort()).toEqual(['public.daily', 'public.raw_events', 'public.sessions']);
    expect(footer.positions['public.raw_events']).toEqual(p['public.raw_events']);
    // The route drawn in the imported file no longer fits: it is undone here, not in that file.
    expect(layout.edgeRoutes).toEqual({});
    expect(footer.edgeRoutes).toEqual({ [EVENT_REF]: [] });

    expect(layout.canUndoArrange).toBe(true);
    expect(layout.undoArrange()).toBe(true);
    expect(layout.snapshot()).toEqual(before);
    expect(layout.positions['public.raw_events']).toEqual({ x: 400, y: 0 });
    expect(layout.edgeRoutes).toEqual({ [EVENT_REF]: [200] });
    expect(layout.canUndoArrange).toBe(false);
    expect(layout.undoArrange()).toBe(false);
  });

  it('drops the override of an imported table that the arrangement leaves where its own file has it', () => {
    const layout = useLayoutStore();
    arrange();
    const arranged = layout.positions['public.raw_events']!;
    // Were the imported footer to agree with the arrangement, this file would have nothing to say about the table.
    useParserStore().updateImport('/proj/schema.dbml', SCHEMA.replace('raw_events: { x: 400, y: 0 }', `raw_events: { x: ${arranged.x}, y: ${arranged.y} }`));
    expect(Object.keys(layout.snapshot().positions)).not.toContain('public.raw_events');
    expect(Object.keys(layout.snapshot().positions)).toContain('public.sessions');
  });
});

describe('layoutStore arrange in views', () => {
  const TEXT = [
    'Table a {',
    '  id int [pk]',
    '}',
    'Table b {',
    '  id int [pk]',
    '  a_id int [ref: > a.id]',
    '}',
    'Table c {',
    '  id int [pk]',
    '}',
    'TableGroup g {',
    '  a',
    '  b',
    '}',
    'Dep: a -> b',
    'DiagramView pair {',
    '  Tables {',
    '    a',
    '    b',
    '  }',
    '}',
    '',
  ].join('\n');
  const REF = '#public.a(id)->public.b(a_id)';

  async function open () {
    setActivePinia(createPinia());
    const { useEditorStore } = await import('@/stores/editorStore');
    useEditorStore().setText(TEXT);
    const layout = useLayoutStore();
    layout.resetLayout();
    const parser = useParserStore();
    parser.parseNow(TEXT);
    await nextTick();
    expect(parser.errors).toEqual([]);
    const views = useViewStore();
    const model = buildDiagramModel(parser.rawDatabase!);
    views.sync(model);
    views.select(null, model);
    layout.applyPositionChanges([
      { key: 'public.a', x: 0, y: 0 },
      { key: 'public.b', x: 0, y: 400 },
      { key: 'public.c', x: 800, y: 800 },
    ]);
    layout.setEdgeRoute(REF, [120]);
    return {
      layout,
      views,
      model,
    };
  }

  it('arranges a named view in its own layer and leaves what it hides, and the Default View, alone', async () => {
    const { layout, views, model } = await open();
    const defaultFooter = layout.snapshot();
    views.select('pair', model);
    expect(views.hidden.has('public.c')).toBe(true);

    arrange();
    const footer = layout.snapshot();
    expect(Object.keys(footer.views!.pair!.positions).sort()).toEqual(['public.a', 'public.b']);
    // The route drawn in the Default View is undone for this view only.
    expect(footer.views!.pair!.edgeRoutes).toEqual({ [REF]: [] });
    expect(footer.positions).toEqual(defaultFooter.positions);
    expect(footer.edgeRoutes).toEqual(defaultFooter.edgeRoutes);
    expect(layout.positions['public.c']).toEqual({ x: 800, y: 800 });

    // Undo belongs to the view it was made in.
    views.select(null, model);
    expect(layout.canUndoArrange).toBe(false);
    expect(layout.undoArrange()).toBe(false);
    views.select('pair', model);
    expect(layout.canUndoArrange).toBe(true);
    expect(layout.undoArrange()).toBe(true);
    expect(layout.snapshot()).toEqual(defaultFooter);
  });

  it('keeps the undo only until the layer changes again', async () => {
    const { layout } = await open();
    arrange();
    expect(layout.canUndoArrange).toBe(true);
    expect(layout.undoableArrangeTables).toBe(3);
    layout.setPosition('public.c', { x: 8, y: 8 });
    expect(layout.canUndoArrange).toBe(false);
    expect(layout.undoableArrangeTables).toBe(0);
    expect(layout.undoArrange()).toBe(false);
    expect(layout.positions['public.c']).toEqual({ x: 8, y: 8 });

    arrange();
    layout.toggleGroup('group:public.g');
    expect(layout.canUndoArrange).toBe(false);

    arrange();
    layout.replaceLayout({ positions: {}, collapsedGroups: [], edgeRoutes: {} });
    expect(layout.canUndoArrange).toBe(false);

    // Arranging twice gives the same positions, and the second can be taken back to the first.
    arrange();
    const once = { ...layout.positions };
    arrange();
    expect(layout.positions).toEqual(once);
    expect(layout.undoArrange()).toBe(true);
    expect(layout.positions).toEqual(once);
  });

  it('remembers the tables auto-placement put down until they are moved, arranged, or another layout loads', async () => {
    const { layout } = await open();
    layout.applyPositionChanges([
      { key: 'public.a', x: 0, y: 0 },
      { key: 'public.b', x: 0, y: 200 },
      { key: 'public.c', x: 0, y: 400 },
      { key: 'note:n', x: 400, y: 0 },
    ], 'auto');
    expect([...layout.newTables].sort()).toEqual(['public.a', 'public.b', 'public.c']);
    layout.setPosition('public.a', { x: 8, y: 8 });
    expect([...layout.newTables].sort()).toEqual(['public.b', 'public.c']);
    layout.applyArrangement([{ key: 'public.b', x: 600, y: 64 }]);
    expect([...layout.newTables]).toEqual(['public.c']);
    // Taking the arrangement back makes b new again.
    expect(layout.undoArrange()).toBe(true);
    expect([...layout.newTables].sort()).toEqual(['public.b', 'public.c']);
    layout.replaceLayout({ positions: {}, collapsedGroups: [], edgeRoutes: {} });
    expect(layout.newTables.size).toBe(0);
  });

  it('takes arrange requests for the diagram pane to carry out', async () => {
    const { layout } = await open();
    expect(layout.arrangeRequest).toBeNull();
    layout.requestArrange('arrange');
    expect(layout.arrangeRequest).toBe('arrange');
    layout.clearArrangeRequest();
    expect(layout.arrangeRequest).toBeNull();
  });
});

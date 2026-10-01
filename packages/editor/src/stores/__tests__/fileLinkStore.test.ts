// @vitest-environment happy-dom
import {
  describe, it, expect, beforeEach, vi,
} from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

const MAIN = '/repo/pipeline.dbml';

// A fake disk behind the bridge: files by path, one change clock, its change events, and every write.
const disk = {
  contents: {} as Record<string, string>,
  mtimeMs: 1,
  files: [MAIN, '/repo/schema.dbml'],
  writes: [] as { path: string; text: string; ifMatch: number | undefined }[],
  listeners: [] as (() => void)[],
  get text () {
    return this.contents[MAIN] ?? '';
  },
  set (text: string, path = MAIN) {
    this.contents[path] = text;
    this.mtimeMs += 1;
  },
  change () {
    this.listeners.forEach((l) => l());
  },
};

vi.mock('@/files/fileBridge', () => {
  class BridgeError extends Error {
    constructor (public readonly status: number, message: string) {
      super(message);
    }
  }
  return {
    BridgeError,
    fileBridge: {
      roots: vi.fn(async () => ({ roots: ['/repo'], files: disk.files })),
      read: vi.fn(async (path: string) => {
        if (!(path in disk.contents)) throw new BridgeError(404, 'No such file');
        return { path, text: disk.contents[path]!, mtimeMs: disk.mtimeMs };
      }),
      write: vi.fn(async (path: string, text: string, ifMatch?: number) => {
        if (ifMatch !== undefined && ifMatch !== disk.mtimeMs) throw new BridgeError(409, 'changed');
        disk.writes.push({ path, text, ifMatch });
        disk.set(text, path);
        return { path, mtimeMs: disk.mtimeMs };
      }),
      watch: vi.fn((_path: string, onChange: () => void) => {
        disk.listeners.push(onChange);
        return () => {
          disk.listeners = disk.listeners.filter((l) => l !== onChange);
        };
      }),
    },
  };
});

const { useFileLinkStore } = await import('@/stores/fileLinkStore');
const { useEditorStore } = await import('@/stores/editorStore');
const { useLayoutStore } = await import('@/stores/layoutStore');
const { useParserStore } = await import('@/stores/parserStore');
const { useUiStore } = await import('@/stores/uiStore');
const { useViewStore } = await import('@/stores/viewStore');

const DBML = 'Table users {\n  id int [pk]\n}\nTable posts {\n  id int [pk]\n}\n';
const FOOTER = '\n/* === DBML DESIGNER FOOTER ===\nversion: 1\ntables:\n  public:\n    users: { x: 8, y: 16 }\n*/\n';
const flush = () => new Promise((r) => setTimeout(r, 0));
const stored = () => JSON.parse(localStorage.getItem('dbml-edit:v1:fileLink')!) as { path: string | null; left: Record<string, unknown> };

describe('fileLinkStore', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    disk.contents = {
      [MAIN]: DBML + FOOTER,
      '/repo/schema.dbml': DBML + FOOTER,
    };
    disk.mtimeMs = 1;
    disk.files = [MAIN, '/repo/schema.dbml'];
    disk.writes = [];
    disk.listeners = [];
    useParserStore().parseNow('Table x { id int }');
    useLayoutStore().resetLayout();
  });

  it('follows a file: text without the footer, layout from the footer, and remembers the path', async () => {
    const link = useFileLinkStore();
    const editor = useEditorStore();
    expect(await link.follow(MAIN)).toBe(true);
    expect(link.following).toBe(true);
    expect(link.name).toBe('pipeline.dbml');
    expect(editor.text).toBe(DBML.trimEnd());
    expect(useLayoutStore().positions['public.users']).toEqual({ x: 8, y: 16 });
    expect(link.dirty).toBe(false);
    await flush();
    expect(stored()).toEqual({ version: 2, path: MAIN, left: {} });
  });

  it('starts from an empty layout when the file has no footer', async () => {
    const link = useFileLinkStore();
    const layout = useLayoutStore();
    await link.follow(MAIN);
    expect(layout.positions['public.users']).toEqual({ x: 8, y: 16 });
    disk.set(DBML, '/repo/schema.dbml');
    await link.follow('/repo/schema.dbml');
    expect(layout.positions).toEqual({});
  });

  it('takes a change written by someone else, keeping the layout arranged here', async () => {
    const link = useFileLinkStore();
    const editor = useEditorStore();
    const layout = useLayoutStore();
    await link.follow(MAIN);
    layout.setPosition('public.users', { x: 100, y: 200 });

    disk.set(`${DBML}Table tags {\n  id int [pk]\n}\n${FOOTER}`);
    disk.change();
    await flush();
    expect(editor.text).toContain('Table tags');
    expect(editor.text).not.toContain('DBML DESIGNER FOOTER');
    expect(layout.positions['public.users']).toEqual({ x: 100, y: 200 });
    expect(link.pending).toBeNull();
    expect(link.dirty).toBe(false);

    // A rewrite that drops the footer altogether does not reset the layout either.
    disk.set(`${DBML}Table tags {\n  id int [pk]\n}\nTable more {\n  id int [pk]\n}\n`);
    disk.change();
    await flush();
    expect(editor.text).toContain('Table more');
    expect(layout.positions['public.users']).toEqual({ x: 100, y: 200 });

    // A footer written by someone else is their layout.
    disk.set(`${DBML}\n/* === DBML DESIGNER FOOTER ===\nversion: 1\ntables:\n  public:\n    users: { x: 800, y: 0 }\n*/\n`);
    disk.change();
    await flush();
    expect(layout.positions['public.users']).toEqual({ x: 800, y: 0 });
  });

  it('switches to a view another program appends, with "follow new views" on, once its text is read', async () => {
    const link = useFileLinkStore();
    const views = useViewStore();
    useUiStore().toggleFollowNewViews();
    await link.follow(MAIN);
    useParserStore().parseNow();
    await flush();

    disk.set(`${DBML}DiagramView only_users {\n  Tables {\n    users\n  }\n}\n${FOOTER}`);
    disk.change();
    await flush();
    // Nothing yet: the text is read after the typing pause.
    expect(views.activeView).toBeNull();
    useParserStore().parseNow();
    await flush();
    expect(views.activeView).toBe('only_users');
  });

  it('holds a change on disk while the editor is dirty until reloaded or overwritten', async () => {
    const link = useFileLinkStore();
    const editor = useEditorStore();
    await link.follow(MAIN);
    editor.setText(editor.text.replace('Table posts', 'Table articles'));
    expect(link.dirty).toBe(true);

    disk.set(`${DBML}Table tags {\n  id int [pk]\n}\n${FOOTER}`);
    disk.change();
    await flush();
    expect(link.pending).not.toBeNull();
    expect(editor.text).toContain('Table articles');

    link.reloadFromDisk();
    expect(link.pending).toBeNull();
    expect(editor.text).toContain('Table tags');
    expect(editor.text).not.toContain('Table articles');
    expect(link.dirty).toBe(false);
  });

  it('saves the text with the layout footer, refusing when the file moved on unless forced', async () => {
    const link = useFileLinkStore();
    const editor = useEditorStore();
    const layout = useLayoutStore();
    await link.follow(MAIN);
    layout.setPosition('public.users', { x: 40, y: 48 });
    editor.setText(editor.text.replace('Table posts', 'Table articles'));

    expect(await link.save()).toBe(true);
    expect(disk.writes).toHaveLength(1);
    expect(disk.writes[0]!.ifMatch).toBe(1);
    expect(disk.writes[0]!.text).toContain('Table articles');
    expect(disk.writes[0]!.text).toContain('users: { x: 40, y: 48 }');
    expect(disk.writes[0]!.text.trimEnd().endsWith('*/')).toBe(true);
    expect(link.dirty).toBe(false);
    // Our own write comes back as a change event and is recognized as ours.
    disk.change();
    await flush();
    expect(link.pending).toBeNull();

    // Someone else writes; a plain save is refused and the change is offered instead.
    disk.set(`${DBML}Table tags {\n  id int [pk]\n}\n${FOOTER}`);
    editor.setText(editor.text.replace('Table users', 'Table people'));
    expect(await link.save()).toBe(false);
    expect(link.pending).not.toBeNull();
    expect(await link.save(true)).toBe(true);
    expect(disk.text).toContain('Table people');
    expect(link.pending).toBeNull();
  });

  it('reloads the file from disk on request, offering the disk text instead of dropping unsaved edits', async () => {
    const link = useFileLinkStore();
    const editor = useEditorStore();
    const layout = useLayoutStore();
    await link.follow(MAIN);
    layout.setPosition('public.users', { x: 100, y: 200 });
    // Nothing changed: nothing happens.
    await link.reload();
    expect(editor.text).toBe(DBML.trimEnd());
    expect(link.dirty).toBe(false);

    // The file changed but no change event came: reload takes it, keeping the layout arranged here.
    disk.set(`${DBML}Table tags {\n  id int [pk]\n}\n${FOOTER}`);
    await link.reload();
    expect(editor.text).toContain('Table tags');
    expect(layout.positions['public.users']).toEqual({ x: 100, y: 200 });
    expect(link.dirty).toBe(false);
    expect(link.pending).toBeNull();

    // With unsaved edits the disk text is offered, even when it is just the saved file.
    editor.setText(editor.text.replace('Table posts', 'Table articles'));
    await link.reload();
    expect(link.pending).not.toBeNull();
    expect(editor.text).toContain('Table articles');
    link.reloadFromDisk();
    expect(editor.text).not.toContain('Table articles');
    expect(link.pending).toBeNull();
    expect(link.dirty).toBe(false);
  });

  it('resumes with the first file under the roots when nothing was followed before', async () => {
    const link = useFileLinkStore();
    await link.resume();
    expect(link.available).toBe(true);
    expect(link.roots).toEqual(['/repo']);
    expect(link.files).toEqual([MAIN, '/repo/schema.dbml']);
    expect(link.path).toBe(MAIN);
    expect(link.following).toBe(true);
    // A first open takes the file's footer layout.
    expect(useLayoutStore().positions['public.users']).toEqual({ x: 8, y: 16 });
  });

  it('resumes the remembered file when it is under a root, keeping the layout arranged here', async () => {
    // A path remembered by the previous version of the store still counts.
    localStorage.setItem('dbml-edit:v1:fileLink', JSON.stringify({ version: 1, path: '/repo/schema.dbml' }));
    setActivePinia(createPinia());
    useParserStore().parseNow('Table x { id int }');
    const layout = useLayoutStore();
    layout.resetLayout();
    layout.setPosition('public.users', { x: 100, y: 200 });
    const link = useFileLinkStore();
    await link.resume();
    expect(link.path).toBe('/repo/schema.dbml');
    expect(layout.positions['public.users']).toEqual({ x: 100, y: 200 });
  });

  it('switches files, saving unsaved edits to the current one first', async () => {
    const link = useFileLinkStore();
    const editor = useEditorStore();
    await link.follow(MAIN);
    editor.setText(editor.text.replace('Table posts', 'Table articles'));
    expect(await link.switchTo('/repo/schema.dbml')).toBe(true);
    expect(disk.writes).toHaveLength(1);
    expect(disk.writes[0]!.path).toBe(MAIN);
    expect(disk.writes[0]!.text).toContain('Table articles');
    expect(link.path).toBe('/repo/schema.dbml');
    expect(link.dirty).toBe(false);
  });

  it('stops following and forgets the path', async () => {
    const link = useFileLinkStore();
    await link.follow(MAIN);
    link.stop();
    expect(link.path).toBeNull();
    expect(link.following).toBe(false);
    expect(disk.listeners).toHaveLength(0);
  });
});

describe('fileLinkStore switching between files', () => {
  // sot.dbml declares a group and arranges its table; pipeline.dbml imports it and adds a table of its own.
  const SOT = 'Table src {\n  id int [pk]\n}\nTableGroup gen {\n  src\n}\n\n/* === DBML DESIGNER FOOTER ===\nversion: 1\ntables:\n  public:\n    src: { x: 8, y: 16 }\n*/\n';
  const PIPELINE = 'use * from \'./sot\'\n\nTable derived {\n  id int [pk]\n  src_id int [ref: > src.id]\n}\n';
  const GEN = 'group:public.gen';

  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    disk.contents = {
      [MAIN]: PIPELINE,
      '/repo/sot.dbml': SOT,
    };
    disk.mtimeMs = 1;
    disk.files = [MAIN, '/repo/sot.dbml'];
    disk.writes = [];
    disk.listeners = [];
    useParserStore().parseNow('Table x { id int }');
    useLayoutStore().resetLayout();
  });

  it('keeps each file\'s own arrangement across switches without saving', async () => {
    const link = useFileLinkStore();
    const layout = useLayoutStore();
    const parser = useParserStore();
    await link.follow(MAIN);
    await flush();
    expect(parser.errors).toEqual([]);
    // The imported table comes arranged by sot's footer; nothing is collapsed yet.
    expect(layout.positions['public.src']).toEqual({ x: 8, y: 16 });
    expect([...layout.collapsedGroups]).toEqual([]);

    layout.toggleGroup(GEN);
    layout.setPosition('public.derived', { x: 400, y: 0 });
    layout.setPosition('public.src', { x: 0, y: 200 });
    expect(link.dirty).toBe(false);

    // In sot.dbml the group is open and its table sits where its own footer says.
    expect(await link.switchTo('/repo/sot.dbml')).toBe(true);
    await flush();
    expect(disk.writes).toEqual([]);
    expect(parser.errors).toEqual([]);
    expect([...layout.collapsedGroups]).toEqual([]);
    expect(layout.positions).toEqual({ 'public.src': { x: 8, y: 16 } });
    // The pipeline's arrangement is kept aside, and survives a reload.
    await flush();
    expect(stored().left[MAIN]).toEqual({
      footer: null,
      layout: {
        positions: {
          'public.derived': { x: 400, y: 0 },
          'public.src': { x: 0, y: 200 },
        },
        collapsedGroups: [GEN],
        edgeRoutes: {},
      },
    });

    // Arranging sot.dbml does not leak into the pipeline...
    layout.toggleGroup(GEN);
    layout.setPosition('public.src', { x: 64, y: 64 });
    expect(await link.switchTo(MAIN)).toBe(true);
    await flush();
    expect(parser.errors).toEqual([]);
    expect([...layout.collapsedGroups]).toEqual([GEN]);
    expect(layout.positions).toEqual({
      'public.derived': { x: 400, y: 0 },
      'public.src': { x: 0, y: 200 },
    });
    expect(stored().left[MAIN]).toBeUndefined();
    expect(disk.writes).toEqual([]);

    // ...and sot.dbml is found as it was left.
    await link.switchTo('/repo/sot.dbml');
    await flush();
    expect([...layout.collapsedGroups]).toEqual([GEN]);
    expect(layout.positions).toEqual({ 'public.src': { x: 64, y: 64 } });
  });

  it('takes a footer rewritten on disk while away over the arrangement left behind', async () => {
    const link = useFileLinkStore();
    const layout = useLayoutStore();
    await link.follow('/repo/sot.dbml');
    layout.setPosition('public.src', { x: 100, y: 100 });
    await link.switchTo(MAIN);
    await flush();

    // Someone else saved sot.dbml with another layout meanwhile.
    disk.set(SOT.replace('src: { x: 8, y: 16 }', 'src: { x: 800, y: 0 }'), '/repo/sot.dbml');
    await link.switchTo('/repo/sot.dbml');
    expect(layout.positions['public.src']).toEqual({ x: 800, y: 0 });
    expect(stored().left['/repo/sot.dbml']).toBeUndefined();

    // Whereas a rewrite that only dropped the footer leaves the arrangement in place.
    layout.setPosition('public.src', { x: 24, y: 24 });
    await link.switchTo(MAIN);
    await flush();
    disk.set(SOT.slice(0, SOT.indexOf('/* ===')), '/repo/sot.dbml');
    await link.switchTo('/repo/sot.dbml');
    expect(layout.positions['public.src']).toEqual({ x: 24, y: 24 });
  });

  it('re-reads imported files on reload', async () => {
    const link = useFileLinkStore();
    const parser = useParserStore();
    await link.follow(MAIN);
    await flush();
    expect(parser.rawDatabase!.tableGroups.map((g) => g.name)).toEqual(['gen']);
    disk.set(SOT.replace('TableGroup gen', 'TableGroup generator'), '/repo/sot.dbml');
    await link.reload();
    await flush();
    expect(parser.errors).toEqual([]);
    expect(parser.rawDatabase!.tableGroups.map((g) => g.name)).toEqual(['generator']);
  });

  it('forgets arrangements of files that are no longer under the roots', async () => {
    const link = useFileLinkStore();
    await link.follow(MAIN);
    await flush();
    await link.switchTo('/repo/sot.dbml');
    await flush();
    expect(stored().left[MAIN]).toBeDefined();
    disk.files = ['/repo/sot.dbml'];
    await link.refreshFiles();
    await flush();
    expect(stored().left).toEqual({});
  });
});

describe('fileLinkStore with model files', () => {
  const TRACE = '/repo/trace.json';
  const body = (tables: string[]) => `${JSON.stringify({
    version: 1,
    model: {
      tables: tables.map((name) => ({
        name,
        fields: [{
          name: 'id',
          type: 'int',
        }],
      })),
    },
  }, null, 2)}\n`;
  const withLayout = (text: string, x: number) => text.replace(/\n}\n$/, `,\n  "layout": {\n    "version": 1,\n    "views": {\n      "default": {\n        "tables": {\n          "public": {\n            "runs": { "x": ${x}, "y": 0 }\n          }\n        }\n      }\n    }\n  }\n}\n`);

  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    disk.contents = {
      [TRACE]: withLayout(body(['runs']), 40),
      [MAIN]: DBML + FOOTER,
    };
    disk.mtimeMs = 1;
    disk.files = [MAIN, TRACE];
    disk.writes = [];
    disk.listeners = [];
  });

  it('follows a model file: JSON without its layout in the editor, the layout on the diagram', async () => {
    const link = useFileLinkStore();
    const editor = useEditorStore();
    const parser = useParserStore();
    expect(await link.follow(TRACE)).toBe(true);
    expect(editor.language).toBe('json');
    expect(editor.text).toBe(body(['runs']));
    expect(parser.errors).toEqual([]);
    expect(parser.jsonModel!.tables.map((t) => t.name)).toEqual(['runs']);
    expect(useLayoutStore().positions['public.runs']).toEqual({ x: 40, y: 0 });
    expect(link.dirty).toBe(false);
  });

  it('saves the text with the layout as a property, and takes in a layout written by someone else', async () => {
    const link = useFileLinkStore();
    const editor = useEditorStore();
    const layout = useLayoutStore();
    await link.follow(TRACE);
    editor.setText(body(['runs', 'steps']));
    useParserStore().parseNow();
    expect(link.dirty).toBe(true);
    layout.setPosition('public.steps', { x: 400, y: 0 });
    expect(await link.save()).toBe(true);
    const written = JSON.parse(disk.writes.at(-1)!.text);
    expect(written.model.tables.map((t: { name: string }) => t.name)).toEqual(['runs', 'steps']);
    expect(written.layout.views.default.tables.public).toEqual({
      runs: { x: 40, y: 0 },
      steps: { x: 400, y: 0 },
    });
    expect(link.dirty).toBe(false);

    disk.set(withLayout(body(['runs', 'steps']), 800), TRACE);
    disk.change();
    await flush();
    expect(layout.positions['public.runs']).toEqual({ x: 800, y: 0 });
  });

  it('switches between a model file and DBML, reading each as what it is', async () => {
    const link = useFileLinkStore();
    const editor = useEditorStore();
    const parser = useParserStore();
    await link.follow(TRACE);
    expect(await link.switchTo(MAIN)).toBe(true);
    expect(editor.language).toBe('dbml');
    expect(parser.errors).toEqual([]);
    expect(parser.rawDatabase!.tables.map((t) => t.name)).toEqual(['users', 'posts']);
    expect(await link.switchTo(TRACE)).toBe(true);
    expect(editor.language).toBe('json');
    expect(editor.text).toBe(body(['runs']));
  });
});

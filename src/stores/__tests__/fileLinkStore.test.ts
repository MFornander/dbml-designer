// @vitest-environment happy-dom
import {
  describe, it, expect, beforeEach, vi,
} from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// A fake disk behind the bridge: one file, its change events, and every write.
const disk = {
  text: '',
  mtimeMs: 1,
  missing: false,
  writes: [] as { text: string; ifMatch: number | undefined }[],
  listeners: [] as (() => void)[],
  set (text: string) {
    this.text = text;
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
      roots: vi.fn(async () => ({ roots: ['/repo'], files: ['/repo/pipeline.dbml'] })),
      read: vi.fn(async (path: string) => {
        if (disk.missing) throw new BridgeError(404, 'No such file');
        return { path, text: disk.text, mtimeMs: disk.mtimeMs };
      }),
      write: vi.fn(async (_path: string, text: string, ifMatch?: number) => {
        if (ifMatch !== undefined && ifMatch !== disk.mtimeMs) throw new BridgeError(409, 'changed');
        disk.writes.push({ text, ifMatch });
        disk.missing = false;
        disk.set(text);
        return { path: _path, mtimeMs: disk.mtimeMs };
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
const { LAYOUT_PLACEHOLDER } = await import('@/layout');

const DBML = 'Table users {\n  id int [pk]\n}\nTable posts {\n  id int [pk]\n}\n';
const FOOTER = '\n/* === DBML DESIGNER FOOTER ===\nversion: 1\ntables:\n  public:\n    users: { x: 8, y: 16 }\n*/\n';
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('fileLinkStore', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    disk.text = DBML + FOOTER;
    disk.mtimeMs = 1;
    disk.missing = false;
    disk.writes = [];
    disk.listeners = [];
    useParserStore().parseNow('Table x { id int }');
    useLayoutStore().resetLayout();
  });

  it('follows a file: text with placeholder, layout from the footer, and remembers the path', async () => {
    const link = useFileLinkStore();
    const editor = useEditorStore();
    expect(await link.follow('/repo/pipeline.dbml')).toBe(true);
    expect(link.following).toBe(true);
    expect(link.name).toBe('pipeline.dbml');
    expect(editor.text).toBe(`${DBML.trimEnd()}\n\n${LAYOUT_PLACEHOLDER}\n`);
    expect(useLayoutStore().positions['public.users']).toEqual({ x: 8, y: 16 });
    expect(link.dirty).toBe(false);
    expect(JSON.parse(localStorage.getItem('dbml-edit:v1:fileLink')!)).toEqual({ version: 1, path: '/repo/pipeline.dbml' });
  });

  it('takes a change written by someone else, keeping the layout arranged here', async () => {
    const link = useFileLinkStore();
    const editor = useEditorStore();
    const layout = useLayoutStore();
    await link.follow('/repo/pipeline.dbml');
    layout.setPosition('public.users', { x: 100, y: 200 });

    disk.set(`${DBML}Table tags {\n  id int [pk]\n}\n${FOOTER}`);
    disk.change();
    await flush();
    expect(editor.text).toContain('Table tags');
    expect(editor.text.trimEnd().endsWith('*/')).toBe(true);
    expect(layout.positions['public.users']).toEqual({ x: 100, y: 200 });
    expect(link.pending).toBeNull();
    expect(link.dirty).toBe(false);
  });

  it('holds a change on disk while the editor is dirty until reloaded or overwritten', async () => {
    const link = useFileLinkStore();
    const editor = useEditorStore();
    await link.follow('/repo/pipeline.dbml');
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
    await link.follow('/repo/pipeline.dbml');
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

  it('follows a path that does not exist yet and creates the file on save', async () => {
    const link = useFileLinkStore();
    const editor = useEditorStore();
    disk.missing = true;
    editor.setText('Table fresh {\n  id int [pk]\n}\n');
    expect(await link.follow('/repo/new.dbml')).toBe(true);
    expect(link.following).toBe(true);
    expect(link.dirty).toBe(true);
    expect(editor.text).toContain('Table fresh');
    expect(await link.save()).toBe(true);
    expect(disk.writes[0]!.ifMatch).toBeUndefined();
    expect(disk.text).toContain('Table fresh');
    expect(disk.text).toContain('=== DBML DESIGNER FOOTER ===');
    expect(link.dirty).toBe(false);
  });

  it('stops following and forgets the path', async () => {
    const link = useFileLinkStore();
    await link.follow('/repo/pipeline.dbml');
    link.stop();
    expect(link.path).toBeNull();
    expect(link.following).toBe(false);
    expect(disk.listeners).toHaveLength(0);
  });
});

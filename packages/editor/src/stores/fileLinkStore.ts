/**
 * Following a file on disk through the dev server's file bridge: a `.dbml`, or a model `.json`.
 * The file is the shared document: when another program writes it, the editor picks the change up;
 * when the user saves, the editor text and the layout (a footer comment, or a model file's `layout`
 * property) are written back. Unsaved edits are never thrown away silently: a change that arrives
 * while the editor is dirty waits for the user to reload or overwrite. Each file keeps its own
 * arrangement across switches, saved or not.
 */
import {
  computed, ref, shallowRef, watch,
} from 'vue';
import { defineStore } from 'pinia';
import { BridgeError, fileBridge } from '@/files/fileBridge';
import type { LayoutSnapshot } from '@/layout';
import { languageOf, splitDocument } from '@/model/documentFormat';
import { useFileIO } from '@/layout/useFileIO';
import { usePersistedRef } from '@/utils/persistedRef';
import { useEditorStore } from './editorStore';
import { useEngineStore } from './engineStore';
import { useLayoutStore } from './layoutStore';
import { useParserStore } from './parserStore';
import { useViewStore } from './viewStore';

/** A file's arrangement as it was when switching away from it, with the layout then on disk. */
interface LeftLayout {
  footer: string | null;
  layout: LayoutSnapshot;
}

interface FileLinkState {
  version: 2;
  /** Absolute path of the followed file, resumed on the next visit. */
  path: string | null;
  /** Arrangements of the files switched away from, by path, so each file is found as it was left. */
  left: Record<string, LeftLayout>;
}

/** The file as last read from or written to disk. */
export interface SyncedFile {
  /** What the editor shows: the file without its layout. */
  body: string;
  /** The layout the file carries, as text YAML reads (its footer's YAML, or a model file's JSON), or null for none. */
  footer: string | null;
  mtimeMs: number;
}

export type FileLinkStatus = 'idle' | 'following' | 'error';

/** Where the diagram's layout comes from when a file's text is taken in. */
type LayoutSource =
  /** The file's footer; an empty layout when it has none. */
  | 'footer'
  /** Whatever the diagram shows now. */
  | 'keep'
  /** An arrangement left behind earlier. */
  | LayoutSnapshot;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

const isSnapshot = (v: unknown): v is LayoutSnapshot => typeof v === 'object' && v !== null
  && typeof (v as LayoutSnapshot).positions === 'object' && (v as LayoutSnapshot).positions !== null
  && Array.isArray((v as LayoutSnapshot).collapsedGroups)
  && typeof (v as LayoutSnapshot).edgeRoutes === 'object' && (v as LayoutSnapshot).edgeRoutes !== null;

const isLeftLayout = (v: unknown): v is LeftLayout => typeof v === 'object' && v !== null
  && ((v as LeftLayout).footer === null || typeof (v as LeftLayout).footer === 'string')
  && isSnapshot((v as LeftLayout).layout);

function isFileLinkState (v: unknown): v is FileLinkState {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as FileLinkState;
  return s.version === 2
    && (s.path === null || typeof s.path === 'string')
    && typeof s.left === 'object' && s.left !== null && Object.values(s.left).every(isLeftLayout);
}

/** Version 1 remembered only the path. */
function deserializeState (raw: string): FileLinkState {
  const parsed = JSON.parse(raw) as Partial<FileLinkState> & { version?: number };
  return {
    version: 2,
    path: typeof parsed.path === 'string' ? parsed.path : null,
    left: parsed.version === 2 && parsed.left ? parsed.left : {},
  };
}

const FORGOTTEN: FileLinkState = {
  version: 2,
  path: null,
  left: {},
};

/** Reads a file a `use` statement points at through the bridge; missing or off-limits files count as absent. */
async function loadImport (absolutePath: string): Promise<string | null> {
  try {
    return (await fileBridge.read(absolutePath)).text;
  } catch (e) {
    if (e instanceof BridgeError && (e.status === 404 || e.status === 403)) return null;
    throw e;
  }
}

export const useFileLinkStore = defineStore('fileLink', () => {
  const editor = useEditorStore();
  const parser = useParserStore();
  const layout = useLayoutStore();
  const views = useViewStore();
  const { engine } = useEngineStore();
  const io = useFileIO();

  const state = usePersistedRef<FileLinkState>('fileLink', () => ({ ...FORGOTTEN }), {
    validate: isFileLinkState,
    deserialize: deserializeState,
  });

  const path = computed(() => state.value.path);
  const name = computed(() => (path.value ? path.value.split('/').pop() ?? path.value : null));
  /** Whether the bridge answered; null until asked. Production builds have no bridge. */
  const available = ref<boolean | null>(null);
  const status = ref<FileLinkStatus>('idle');
  const error = ref<string | null>(null);
  const roots = shallowRef<readonly string[]>([]);
  const files = shallowRef<readonly string[]>([]);
  const synced = shallowRef<SyncedFile | null>(null);
  /** A change on disk not applied yet because the editor has unsaved edits. */
  const pending = shallowRef<{ text: string; mtimeMs: number } | null>(null);
  const following = computed(() => status.value === 'following' && synced.value !== null);
  /** The editor's text differs from the file's (trailing blank lines aside). */
  const dirty = computed(() => synced.value !== null
    && splitDocument(editor.text, editor.language).body.trimEnd() !== synced.value.body.trimEnd());
  /** How the followed file is split and joined: by its name. */
  const languageOfPath = (p: string | null) => languageOf(p ?? '');

  let stopWatching: (() => void) | null = null;
  /** The text of our own last write, so its change event is not mistaken for someone else's. */
  let lastWritten: string | null = null;
  /** Watchers on the files the entry imports, by absolute path. */
  const importWatchers = new Map<string, () => void>();

  // Imports resolve next to the followed file and are read through the bridge; follow their changes too.
  watch(() => parser.importPaths, (paths) => {
    for (const [abs, stopImport] of importWatchers) {
      if (!paths.includes(abs)) {
        stopImport();
        importWatchers.delete(abs);
      }
    }
    for (const abs of paths) {
      if (importWatchers.has(abs)) continue;
      importWatchers.set(abs, fileBridge.watch(abs, () => {
        void loadImport(abs).then((text) => parser.updateImport(abs, text)).catch(() => undefined);
      }));
    }
  });
  function stopImportWatchers (): void {
    for (const stopImport of importWatchers.values()) stopImport();
    importWatchers.clear();
  }

  async function refreshFiles (): Promise<boolean> {
    try {
      const r = await fileBridge.roots();
      roots.value = r.roots;
      files.value = r.files;
      available.value = true;
      // Arrangements of files that are gone are not coming back.
      const left = Object.fromEntries(Object.entries(state.value.left).filter(([p]) => r.files.includes(p)));
      if (Object.keys(left).length !== Object.keys(state.value.left).length) {
        state.value = {
          ...state.value,
          left,
        };
      }
    } catch {
      available.value = false;
    }
    return available.value;
  }

  /** A layout on disk other than the one last read or written; one that merely vanished does not count. */
  const footerChanged = (footer: string | null) => footer !== null && footer !== synced.value?.footer;

  /**
   * A change on disk is about to be taken in. When it changes the text, what it adds is marked on
   * the diagram for a moment and the views it adds may be switched to, once the text is read (see
   * the view store); one that leaves the text alone is never read again, so it is not noted.
   */
  function noteDiskChange (text: string): void {
    if (splitDocument(text, languageOfPath(path.value)).body === editor.text) return;
    views.noteDiskChange();
    engine.markChanges();
  }

  /** Put a file's text, minus its layout, into the editor, and give the diagram the layout asked for. */
  function applyFile (text: string, mtimeMs: number, take: LayoutSource): void {
    const language = languageOfPath(path.value);
    editor.setLanguage(language);
    const parts = splitDocument(text, language);
    if (take === 'footer' && parts.layout !== null) {
      io.importText(name.value ?? 'file', text);
    } else {
      io.replaceText(parts.body);
      if (take === 'footer') layout.resetLayout();
      else if (take !== 'keep') layout.replaceLayout(take);
    }
    synced.value = {
      body: parts.body,
      footer: parts.layout,
      mtimeMs,
    };
    pending.value = null;
  }

  async function onDiskChange (): Promise<void> {
    const p = path.value;
    if (!p) return;
    let file;
    try {
      file = await fileBridge.read(p);
    } catch (e) {
      status.value = 'error';
      error.value = message(e);
      return;
    }
    if (file.text === lastWritten) {
      lastWritten = null;
      if (synced.value) synced.value = { ...synced.value, mtimeMs: file.mtimeMs };
      return;
    }
    const parts = splitDocument(file.text, languageOfPath(p));
    const same = synced.value !== null && parts.body.trimEnd() === synced.value.body.trimEnd() && parts.layout === synced.value.footer;
    if (same) {
      synced.value = { ...synced.value!, mtimeMs: file.mtimeMs };
      return;
    }
    if (dirty.value) {
      pending.value = {
        text: file.text,
        mtimeMs: file.mtimeMs,
      };
      return;
    }
    // Someone else changed the layout: take theirs. Otherwise keep ours and take the text.
    noteDiskChange(file.text);
    applyFile(file.text, file.mtimeMs, footerChanged(parts.layout) ? 'footer' : 'keep');
    // A new `use` may point at a file that did not exist a moment ago.
    parser.retryImports();
  }

  function startWatching (p: string): void {
    stopWatching?.();
    stopWatching = fileBridge.watch(p, () => {
      void onDiskChange();
    });
  }

  /** Let go of the current file: its watchers and what was known about it on disk. */
  function detach (): void {
    stopWatching?.();
    stopWatching = null;
    stopImportWatchers();
    synced.value = null;
    pending.value = null;
    lastWritten = null;
  }

  /** Remember the current file's arrangement so it is found again when coming back. */
  function leave (): void {
    const p = path.value;
    if (!p || !synced.value) return;
    state.value = {
      ...state.value,
      left: {
        ...state.value.left,
        [p]: {
          footer: synced.value.footer,
          layout: layout.snapshot(),
        },
      },
    };
  }

  /**
   * The arrangement a file was left with, forgotten on the way out. A footer rewritten on disk
   * meanwhile is someone else's layout and wins; a footer that only vanished does not.
   */
  function takeLeft (p: string, footer: string | null): LayoutSnapshot | null {
    const kept = state.value.left[p];
    if (!kept) return null;
    const left = { ...state.value.left };
    delete left[p];
    state.value = {
      ...state.value,
      left,
    };
    return footer === null || footer === kept.footer ? kept.layout : null;
  }

  /**
   * Follow a file. Opened by the user, its footer layout is applied (an arrangement it was left
   * with earlier comes first); resumed after a reload, only its DBML is taken so the layout
   * arranged since the last save survives.
   */
  async function follow (target: string, opts: { applyLayout?: boolean } = {}): Promise<boolean> {
    detach();
    parser.setSourceLoader(loadImport);
    try {
      const file = await fileBridge.read(target);
      state.value = {
        ...state.value,
        path: file.path,
      };
      const language = languageOf(file.path);
      const parts = splitDocument(file.text, language);
      const kept = opts.applyLayout ?? true ? takeLeft(file.path, parts.layout) : null;
      // The text is read as what the file is; imports in DBML resolve relative to this path from now on.
      editor.setLanguage(language);
      parser.setEntryPath(file.path, parts.body);
      applyFile(file.text, file.mtimeMs, kept ?? (opts.applyLayout ?? true ? 'footer' : 'keep'));
      startWatching(file.path);
      status.value = 'following';
      error.value = null;
      return true;
    } catch (e) {
      state.value = {
        ...state.value,
        path: target,
      };
      status.value = 'error';
      error.value = message(e);
      return false;
    }
  }

  /**
   * Read the followed file and its imports from disk again, as their change events would have.
   * A changed file is applied with the usual footer rule; with unsaved edits the disk's text is
   * offered instead of applied, also when those edits are all that differs, so this is the way
   * back to the saved file. The file list is refreshed along the way.
   */
  async function reload (): Promise<void> {
    const p = path.value;
    if (!p) return;
    await refreshFiles();
    // Imports first, so the file parses against what is on disk now.
    await Promise.all(parser.importPaths.map((abs) => loadImport(abs)
      .then((text) => parser.updateImport(abs, text))
      .catch(() => undefined)));
    let file;
    try {
      file = await fileBridge.read(p);
    } catch (e) {
      status.value = 'error';
      error.value = message(e);
      return;
    }
    const parts = splitDocument(file.text, languageOfPath(p));
    if (dirty.value) {
      pending.value = {
        text: file.text,
        mtimeMs: file.mtimeMs,
      };
      return;
    }
    const same = synced.value !== null && parts.body.trimEnd() === synced.value.body.trimEnd() && parts.layout === synced.value.footer;
    if (same) {
      synced.value = { ...synced.value!, mtimeMs: file.mtimeMs };
    } else {
      noteDiskChange(file.text);
      applyFile(file.text, file.mtimeMs, footerChanged(parts.layout) ? 'footer' : 'keep');
    }
    status.value = 'following';
    error.value = null;
    if (!stopWatching) startWatching(p);
    parser.retryImports();
  }

  /** Apply the change that waited while the editor was dirty, dropping the local edits. */
  function reloadFromDisk (): void {
    const p = pending.value;
    if (!p) return;
    noteDiskChange(p.text);
    applyFile(p.text, p.mtimeMs, footerChanged(splitDocument(p.text, languageOfPath(path.value)).layout) ? 'footer' : 'keep');
  }

  /** Write the editor text with its layout. Refuses when the file changed since it was read, unless forced, and always while read-only. */
  async function save (force = false): Promise<boolean> {
    const p = path.value;
    if (!p || editor.readOnly) return false;
    const text = io.exportText();
    lastWritten = text;
    try {
      const r = await fileBridge.write(p, text, force ? undefined : synced.value?.mtimeMs);
      const parts = splitDocument(text, languageOfPath(p));
      synced.value = {
        body: parts.body,
        footer: parts.layout,
        mtimeMs: r.mtimeMs,
      };
      pending.value = null;
      error.value = null;
      status.value = 'following';
      if (!stopWatching) startWatching(p);
      return true;
    } catch (e) {
      lastWritten = null;
      if (e instanceof BridgeError && e.status === 409) {
        const file = await fileBridge.read(p).catch(() => null);
        if (file) {
          pending.value = {
            text: file.text,
            mtimeMs: file.mtimeMs,
          };
        }
      } else {
        error.value = message(e);
      }
      return false;
    }
  }

  function stop (forget = true): void {
    detach();
    parser.setEntryPath(null);
    parser.setSourceLoader(null);
    status.value = 'idle';
    error.value = null;
    if (forget) state.value = { ...FORGOTTEN };
  }

  /**
   * On startup: find the bridge, pick up the file followed last time if it is still there (keeping
   * the layout arranged since), or else the first file under the roots, with its footer layout.
   */
  async function resume (): Promise<void> {
    if (!(await refreshFiles())) return;
    const remembered = state.value.path;
    if (remembered && files.value.includes(remembered)) {
      await follow(remembered, { applyLayout: false });
      return;
    }
    const first = files.value[0];
    if (first) await follow(first, { applyLayout: true });
  }

  /**
   * Change to another file, saving unsaved edits to the current one first (false when that save
   * is refused) and keeping its arrangement for when it is opened again.
   */
  async function switchTo (target: string): Promise<boolean> {
    if (target === path.value) return true;
    if (dirty.value && !(await save())) return false;
    leave();
    return follow(target, { applyLayout: true });
  }

  return {
    path,
    name,
    available,
    status,
    error,
    roots,
    files,
    synced,
    pending,
    following,
    dirty,
    refreshFiles,
    follow,
    save,
    reload,
    reloadFromDisk,
    stop,
    resume,
    switchTo,
  };
});

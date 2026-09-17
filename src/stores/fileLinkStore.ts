/**
 * Following a `.dbml` file on disk through the dev server's file bridge. The file is the shared
 * document: when another program writes it, the editor picks the change up; when the user saves,
 * the editor text and the layout footer are written back. Unsaved edits are never thrown away
 * silently: a change that arrives while the editor is dirty waits for the user to reload or
 * overwrite.
 */
import { computed, ref, shallowRef } from 'vue';
import { defineStore } from 'pinia';
import { BridgeError, fileBridge } from '@/files/fileBridge';
import { splitLayoutComment, withLayoutPlaceholder } from '@/layout';
import { useFileIO } from '@/layout/useFileIO';
import { usePersistedRef } from '@/utils/persistedRef';
import { useEditorStore } from './editorStore';

interface FileLinkState {
  version: 1;
  /** Absolute path of the followed file, resumed on the next visit. */
  path: string | null;
}

/** The file as last read from or written to disk. */
export interface SyncedFile {
  dbml: string;
  /** The layout YAML in its footer, or null for none or the placeholder. */
  footer: string | null;
  mtimeMs: number;
}

export type FileLinkStatus = 'idle' | 'following' | 'error';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const useFileLinkStore = defineStore('fileLink', () => {
  const editor = useEditorStore();
  const io = useFileIO();

  const state = usePersistedRef<FileLinkState>('fileLink', () => ({
    version: 1,
    path: null,
  }), {
    validate: (v): v is FileLinkState => typeof v === 'object' && v !== null
      && (v as FileLinkState).version === 1
      && ((v as FileLinkState).path === null || typeof (v as FileLinkState).path === 'string'),
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
  /** The editor's DBML differs from the file's (trailing blank lines aside). */
  const dirty = computed(() => synced.value !== null
    && splitLayoutComment(editor.text).dbml.trimEnd() !== synced.value.dbml.trimEnd());

  let stopWatching: (() => void) | null = null;
  /** The text of our own last write, so its change event is not mistaken for someone else's. */
  let lastWritten: string | null = null;

  async function refreshFiles (): Promise<boolean> {
    try {
      const r = await fileBridge.roots();
      roots.value = r.roots;
      files.value = r.files;
      available.value = true;
    } catch {
      available.value = false;
    }
    return available.value;
  }

  /** Put a file's text into the editor; with `applyLayout`, its footer becomes the diagram layout too. */
  function applyFile (text: string, mtimeMs: number, applyLayout: boolean): void {
    const parts = splitLayoutComment(text);
    if (applyLayout) io.importText(name.value ?? 'file', text);
    else io.replaceText(parts.hadComment ? withLayoutPlaceholder(parts.dbml) : parts.dbml);
    synced.value = {
      dbml: parts.dbml,
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
    const parts = splitLayoutComment(file.text);
    const same = synced.value !== null && parts.dbml.trimEnd() === synced.value.dbml.trimEnd() && parts.layout === synced.value.footer;
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
    // Someone else changed the footer: take their layout. Otherwise keep ours and take the DBML.
    applyFile(file.text, file.mtimeMs, parts.layout !== synced.value?.footer);
  }

  function startWatching (p: string): void {
    stopWatching?.();
    stopWatching = fileBridge.watch(p, () => {
      void onDiskChange();
    });
  }

  /**
   * Follow a file. Chosen by the user, its footer layout is applied; resumed after a reload,
   * only its DBML is taken so the layout arranged since the last save survives.
   */
  async function follow (target: string, opts: { applyLayout?: boolean } = {}): Promise<boolean> {
    stop(false);
    try {
      const file = await fileBridge.read(target);
      state.value = {
        version: 1,
        path: file.path,
      };
      applyFile(file.text, file.mtimeMs, opts.applyLayout ?? true);
      startWatching(file.path);
      status.value = 'following';
      error.value = null;
      return true;
    } catch (e) {
      if (e instanceof BridgeError && e.status === 404) {
        // A file that does not exist yet: keep the editor as it is and create the file on save.
        state.value = {
          version: 1,
          path: target,
        };
        synced.value = {
          dbml: '',
          footer: null,
          mtimeMs: 0,
        };
        startWatching(target);
        status.value = 'following';
        error.value = null;
        return true;
      }
      state.value = {
        version: 1,
        path: target,
      };
      status.value = 'error';
      error.value = message(e);
      return false;
    }
  }

  /** Apply the change that waited while the editor was dirty, dropping the local edits. */
  function reloadFromDisk (): void {
    const p = pending.value;
    if (!p) return;
    applyFile(p.text, p.mtimeMs, splitLayoutComment(p.text).layout !== synced.value?.footer);
  }

  /** Write the editor text with the layout footer. Refuses when the file changed since it was read, unless forced. */
  async function save (force = false): Promise<boolean> {
    const p = path.value;
    if (!p) return false;
    const text = io.exportText();
    lastWritten = text;
    try {
      // A file being created has no mtime to match yet.
      const expected = synced.value && synced.value.mtimeMs > 0 ? synced.value.mtimeMs : undefined;
      const r = await fileBridge.write(p, text, force ? undefined : expected);
      const parts = splitLayoutComment(text);
      synced.value = {
        dbml: parts.dbml,
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
    stopWatching?.();
    stopWatching = null;
    synced.value = null;
    pending.value = null;
    lastWritten = null;
    status.value = 'idle';
    error.value = null;
    if (forget) {
      state.value = {
        version: 1,
        path: null,
      };
    }
  }

  /** On startup: find the bridge and pick up the file followed last time, keeping the current layout. */
  async function resume (): Promise<void> {
    if (!(await refreshFiles())) return;
    if (state.value.path) await follow(state.value.path, { applyLayout: false });
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
    reloadFromDisk,
    stop,
    resume,
  };
});

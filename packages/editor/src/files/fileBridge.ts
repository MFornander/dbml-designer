/**
 * Browser side of the dev server's file bridge (see plugins/fileBridge.ts): read, write, and
 * watch `.dbml` files on disk. Present only while the app runs from the dev server.
 */
export interface BridgeFile {
  path: string;
  text: string;
  mtimeMs: number;
}

export class BridgeError extends Error {
  constructor (public readonly status: number, message: string) {
    super(message);
  }
}

const BASE = '/__dbml';

async function call<T> (input: string, init?: Parameters<typeof fetch>[1]): Promise<T> {
  const res = await fetch(input, init);
  const body = await res.json().catch(() => ({})) as { error?: string };
  if (!res.ok) throw new BridgeError(res.status, body.error ?? res.statusText);
  return body as T;
}

const fileUrl = (path: string) => `${BASE}/file?path=${encodeURIComponent(path)}`;

/**
 * Every watched file shares one event stream. A browser allows only a handful of connections to
 * an origin, and a stream per file would use them all up once a followed file has a few imports,
 * stalling every other request to the dev server with them.
 */
const watchers = new Map<string, Set<() => void>>();
let stream: EventSource | null = null;
let reopenQueued = false;

function reopen (): void {
  stream?.close();
  stream = null;
  const paths = [...watchers.keys()];
  if (paths.length === 0) return;
  const source = new EventSource(`${BASE}/events?${paths.map((p) => `path=${encodeURIComponent(p)}`).join('&')}`);
  source.onmessage = (e: MessageEvent<string>) => {
    let changed: { path?: unknown };
    try {
      changed = JSON.parse(e.data) as { path?: unknown };
    } catch {
      return;
    }
    if (typeof changed.path !== 'string') return;
    for (const onChange of watchers.get(changed.path) ?? []) onChange();
  };
  stream = source;
}

/** Reopen once for a whole batch of watch and unwatch calls made in the same tick. */
function scheduleReopen (): void {
  if (reopenQueued) return;
  reopenQueued = true;
  queueMicrotask(() => {
    reopenQueued = false;
    reopen();
  });
}

export const fileBridge = {
  roots (): Promise<{ roots: string[]; files: string[] }> {
    return call(`${BASE}/roots`);
  },
  read (path: string): Promise<BridgeFile> {
    return call(fileUrl(path));
  },
  /** Write the whole file; with `ifMatchMtime`, refuse (409) when the file changed since then. */
  write (path: string, text: string, ifMatchMtime?: number): Promise<{ path: string; mtimeMs: number }> {
    return call(fileUrl(path), {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        ...(ifMatchMtime !== undefined ? { 'If-Match-Mtime': String(ifMatchMtime) } : {}),
      },
      body: text,
    });
  },
  /** Call `onChange` whenever the file changes on disk; returns the function that stops watching. */
  watch (path: string, onChange: () => void): () => void {
    let set = watchers.get(path);
    if (!set) {
      set = new Set();
      watchers.set(path, set);
      scheduleReopen();
    }
    set.add(onChange);
    return () => {
      const current = watchers.get(path);
      if (!current?.delete(onChange)) return;
      if (current.size === 0) {
        watchers.delete(path);
        scheduleReopen();
      }
    };
  },
};

export type FileBridge = typeof fileBridge;

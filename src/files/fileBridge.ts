/**
 * Browser side of the dev server's file bridge (see plugins/fileBridge.ts): read, write, and
 * watch one `.dbml` file on disk. Present only while the app runs from the dev server.
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
    const source = new EventSource(`${BASE}/events?path=${encodeURIComponent(path)}`);
    source.onmessage = () => onChange();
    return () => source.close();
  },
};

export type FileBridge = typeof fileBridge;

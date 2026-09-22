/**
 * Dev-server bridge to `.dbml` files on disk, so the app can follow a file that another program
 * (an agent, an editor) is writing and save back to it. The dev server listens on the LAN, so the
 * bridge stays narrow: only `.dbml` files, only under the configured roots, same origin only.
 *
 *   GET  /__dbml/roots           { roots, files }: the roots and the .dbml files under them
 *   GET  /__dbml/file?path=…     { path, text, mtimeMs }
 *   PUT  /__dbml/file?path=…     body: the text; header If-Match-Mtime: the mtimeMs last seen,
 *                                answered 409 when the file changed since
 *   GET  /__dbml/events?path=…&path=…
 *                                server-sent events, one `{ path, mtimeMs, exists }` per change of
 *                                any listed file; one stream serves every file the app watches
 */
import {
  existsSync, promises as fs, unwatchFile, watchFile,
} from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin } from 'vite';

export interface FileBridgeOptions {
  /** Directories (or single files) the bridge may read and write. */
  roots: readonly string[];
}

/** A `.dbml` file that is one of the roots or lies under one of them. */
export function isAllowed (roots: readonly string[], file: string): boolean {
  if (!file.toLowerCase().endsWith('.dbml')) return false;
  const abs = path.resolve(file);
  return roots.some((r) => {
    const root = path.resolve(r);
    return abs === root || abs.startsWith(root + path.sep);
  });
}

const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'coverage']);

/** The `.dbml` files directly under each root (deeper only when asked), skipping dependency and build folders. */
export async function listDbmlFiles (roots: readonly string[], limits = {
  maxDepth: 0,
  max: 200,
}): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (out.length >= limits.max || depth > limits.maxDepth) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (out.length >= limits.max) return;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIPPED_DIRS.has(e.name) && !e.name.startsWith('.')) await walk(p, depth + 1);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.dbml')) {
        out.push(p);
      }
    }
  };
  for (const r of roots) {
    const root = path.resolve(r);
    if (!existsSync(root)) continue;
    const st = await fs.stat(root);
    if (st.isFile()) {
      if (isAllowed(roots, root)) out.push(root);
    } else {
      await walk(root, 0);
    }
  }
  return out;
}

function readBody (req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const FORBIDDEN = 'Only .dbml files under the configured roots can be followed (see DBML_ROOTS)';

/** Watch every listed file and send one event per change until the request closes. */
function streamChanges (paths: readonly string[], req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.write(': connected\n\n');
  // Polling survives editors that replace the file instead of rewriting it.
  const stops = paths.map((p) => {
    const abs = path.resolve(p);
    const listener = (curr: { mtimeMs: number; size: number }, prev: { mtimeMs: number; size: number }) => {
      if (curr.mtimeMs === prev.mtimeMs && curr.size === prev.size) return;
      res.write(`data: ${JSON.stringify({
        path: p,
        mtimeMs: curr.mtimeMs,
        exists: curr.mtimeMs !== 0,
      })}\n\n`);
    };
    watchFile(abs, { interval: 400 }, listener);
    return () => unwatchFile(abs, listener);
  });
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => {
    clearInterval(heartbeat);
    for (const stop of stops) stop();
  });
}

export async function handle (roots: readonly string[], req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const json = (status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  };
  const file = url.searchParams.get('path');
  try {
    if (url.pathname === '/roots' && req.method === 'GET') {
      json(200, {
        roots,
        files: await listDbmlFiles(roots),
      });
      return;
    }
    if (url.pathname === '/events' && req.method === 'GET') {
      const paths = url.searchParams.getAll('path');
      if (paths.length === 0) {
        json(400, { error: 'Give at least one path to watch' });
        return;
      }
      if (!paths.every((p) => isAllowed(roots, p))) {
        json(403, { error: FORBIDDEN });
        return;
      }
      streamChanges(paths, req, res);
      return;
    }
    if (url.pathname === '/file' && file !== null) {
      if (!isAllowed(roots, file)) {
        json(403, { error: FORBIDDEN });
        return;
      }
      const abs = path.resolve(file);

      if (url.pathname === '/file' && req.method === 'GET') {
        try {
          const [text, st] = await Promise.all([fs.readFile(abs, 'utf8'), fs.stat(abs)]);
          json(200, {
            path: abs,
            text,
            mtimeMs: st.mtimeMs,
          });
        } catch (e) {
          if ((e as { code?: string }).code === 'ENOENT') json(404, { error: 'No such file' });
          else throw e;
        }
        return;
      }

      if (url.pathname === '/file' && req.method === 'PUT') {
        const body = await readBody(req);
        const expected = req.headers['if-match-mtime'];
        if (typeof expected === 'string' && expected !== '' && existsSync(abs)) {
          const st = await fs.stat(abs);
          if (String(st.mtimeMs) !== expected) {
            json(409, {
              error: 'The file changed on disk since it was last read',
              mtimeMs: st.mtimeMs,
            });
            return;
          }
        }
        // Write whole or not at all, so a reader never sees a half-written file.
        await fs.mkdir(path.dirname(abs), { recursive: true });
        const tmp = `${abs}.${process.pid}.tmp`;
        await fs.writeFile(tmp, body, 'utf8');
        await fs.rename(tmp, abs);
        const st = await fs.stat(abs);
        json(200, {
          path: abs,
          mtimeMs: st.mtimeMs,
        });
        return;
      }
    }
    next();
  } catch (e) {
    json(500, { error: e instanceof Error ? e.message : String(e) });
  }
}

export function fileBridge (options: FileBridgeOptions): Plugin {
  const roots = options.roots.map((r) => path.resolve(r));
  return {
    name: 'dbml-designer:file-bridge',
    configureServer (server) {
      server.middlewares.use('/__dbml', (req, res, next) => {
        void handle(roots, req, res, next);
      });
    },
  };
}

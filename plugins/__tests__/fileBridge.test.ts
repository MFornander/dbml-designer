import {
  describe, it, expect, beforeAll, afterAll, vi,
} from 'vitest';
import {
  mkdtemp, mkdir, rm, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handle, isAllowed, listDbmlFiles } from '../fileBridge';

let root: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'dbml-bridge-'));
  await mkdir(path.join(root, 'models', 'deep'), { recursive: true });
  await mkdir(path.join(root, 'node_modules', 'pkg'), { recursive: true });
  await mkdir(path.join(root, '.git'), { recursive: true });
  await writeFile(path.join(root, 'b.dbml'), '');
  await writeFile(path.join(root, 'a.DBML'), '');
  await writeFile(path.join(root, 'notes.md'), '');
  await writeFile(path.join(root, 'models', 'pipeline.dbml'), '');
  await writeFile(path.join(root, 'models', 'deep', 'x.dbml'), '');
  await writeFile(path.join(root, 'node_modules', 'pkg', 'skip.dbml'), '');
  await writeFile(path.join(root, '.git', 'skip.dbml'), '');
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('isAllowed', () => {
  it('accepts .dbml files at or under a root and nothing else', () => {
    expect(isAllowed([root], path.join(root, 'b.dbml'))).toBe(true);
    expect(isAllowed([root], path.join(root, 'models', 'pipeline.dbml'))).toBe(true);
    expect(isAllowed([root], path.join(root, 'notes.md'))).toBe(false);
    expect(isAllowed([root], path.join(root, '..', 'outside.dbml'))).toBe(false);
    expect(isAllowed([root], `${root}2/evil.dbml`)).toBe(false);
    expect(isAllowed([root], path.join(root, 'models', '..', '..', 'escape.dbml'))).toBe(false);
    // A root may itself be a file.
    const file = path.join(root, 'b.dbml');
    expect(isAllowed([file], file)).toBe(true);
    expect(isAllowed([file], path.join(root, 'a.DBML'))).toBe(false);
  });
});

describe('listDbmlFiles', () => {
  it('lists the .dbml files directly under a root by default', async () => {
    const files = await listDbmlFiles([root]);
    expect(files.map((f) => path.relative(root, f))).toEqual(['a.DBML', 'b.dbml']);
  });

  it('can go deeper in a stable order, skipping dependency, build, and dot folders', async () => {
    const files = await listDbmlFiles([root], {
      maxDepth: 4,
      max: 200,
    });
    expect(files.map((f) => path.relative(root, f))).toEqual([
      'a.DBML',
      'b.dbml',
      path.join('models', 'deep', 'x.dbml'),
      path.join('models', 'pipeline.dbml'),
    ]);
  });

  it('accepts a single file as a root and ignores roots that do not exist', async () => {
    const file = path.join(root, 'b.dbml');
    expect(await listDbmlFiles([file, path.join(root, 'missing')])).toEqual([file]);
  });
});

/** A request and a response the handler can talk to, with everything written kept for the test. */
function fakeExchange (url: string) {
  const req = Object.assign(new EventEmitter(), {
    url,
    method: 'GET',
    headers: {},
  }) as unknown as IncomingMessage & EventEmitter;
  const chunks: string[] = [];
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    setHeader (k: string, v: string) {
      this.headers[k] = v;
    },
    writeHead (status: number, headers: Record<string, string>) {
      this.statusCode = status;
      Object.assign(this.headers, headers);
    },
    write (chunk: string) {
      chunks.push(chunk);
      return true;
    },
    end (chunk?: string) {
      if (chunk) chunks.push(chunk);
    },
  };
  return {
    req,
    res: res as unknown as ServerResponse,
    out: chunks,
    status: () => res.statusCode,
  };
}

describe('handle /events', () => {
  it('streams one event per change of any listed file, refusing the whole list when one path is off limits', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'dbml-bridge-'));
    const a = path.join(root, 'a.dbml');
    const b = path.join(root, 'b.dbml');
    await writeFile(a, 'Table a { id int }\n');
    await writeFile(b, 'Table b { id int }\n');
    const query = (...paths: string[]) => `/events?${paths.map((p) => `path=${encodeURIComponent(p)}`).join('&')}`;

    const refused = fakeExchange(query(a, path.join(tmpdir(), 'elsewhere.dbml')));
    await handle([root], refused.req, refused.res, () => undefined);
    expect(refused.status()).toBe(403);

    const none = fakeExchange('/events');
    await handle([root], none.req, none.res, () => undefined);
    expect(none.status()).toBe(400);

    const x = fakeExchange(query(a, b));
    await handle([root], x.req, x.res, () => undefined);
    expect(x.status()).toBe(200);
    expect(x.out[0]).toBe(': connected\n\n');
    // A change to the second file arrives tagged with its path; the polling interval is 400ms.
    await new Promise((r) => setTimeout(r, 50));
    await writeFile(b, 'Table b { id int, name text }\n');
    await vi.waitFor(() => {
      expect(x.out.some((c) => c.startsWith('data: '))).toBe(true);
    }, { timeout: 3000, interval: 50 });
    const event = JSON.parse(x.out.find((c) => c.startsWith('data: '))!.slice(6)) as { path: string; exists: boolean };
    expect(event.path).toBe(b);
    expect(event.exists).toBe(true);
    x.req.emit('close');
    await rm(root, { recursive: true, force: true });
  });
});

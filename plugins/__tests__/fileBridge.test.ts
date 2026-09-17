import {
  describe, it, expect, beforeAll, afterAll,
} from 'vitest';
import {
  mkdtemp, mkdir, rm, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isAllowed, listDbmlFiles } from '../fileBridge';

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
  it('lists .dbml files in a stable order, skipping dependency, build, and dot folders', async () => {
    const files = await listDbmlFiles([root]);
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

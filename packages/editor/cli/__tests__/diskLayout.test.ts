import {
  describe, it, expect, beforeAll, afterAll,
} from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Filepath } from '@dbml/parse';
import { checkText, formatCheck, modelOf } from '../../src/cli/lib';
import { DiskProjectLayout } from '../diskLayout';

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'dbml-imports-'));
  await writeFile(path.join(dir, 'schema.dbml'), 'Table users {\n  id int [pk]\n  name varchar\n}\n');
  await writeFile(path.join(dir, 'pipeline.dbml'), 'use * from \'./schema\'\n\nTable derived {\n  id int [pk]\n  users_id int [ref: > users.id]\n}\n\nDep d {\n  users.id -> derived.users_id\n}\n');
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

function project (name: string, text?: string) {
  const entry = Filepath.from(path.join(dir, name));
  return {
    entry,
    layout: new DiskProjectLayout(entry, text),
  };
}

describe('DiskProjectLayout', () => {
  it('resolves use imports from the files next to the entry', () => {
    const opts = project('pipeline.dbml');
    const text = opts.layout.getSource(opts.entry)!;
    const result = checkText(text, opts);
    expect(result.errors).toBe(0);
    const { model } = modelOf(text, opts);
    expect(model!.tables.map((t) => t.name).sort()).toEqual(['derived', 'users']);
    expect(model!.deps).toHaveLength(1);
    expect(model!.refs).toHaveLength(1);
  });

  it('checks unsaved entry text against the files on disk', () => {
    const opts = project('pipeline.dbml', 'use * from \'./schema\'\n\nTable derived {\n  id int [pk]\n  users_id int [ref: > nobody.id]\n}\n');
    const result = checkText(opts.layout.getSource(opts.entry)!, opts);
    expect(result.errors).toBe(1);
    expect(result.diagnostics[0]!.file).toBeUndefined();
  });

  it('names the imported file when the problem is there', async () => {
    await writeFile(path.join(dir, 'broken.dbml'), 'Table b {\n  id int [ref: > nothere.id]\n}\n');
    await writeFile(path.join(dir, 'uses_broken.dbml'), 'use * from \'./broken\'\n\nTable a {\n  id int\n}\n');
    const opts = project('uses_broken.dbml');
    const result = checkText(opts.layout.getSource(opts.entry)!, opts);
    expect(result.errors).toBe(1);
    expect(result.diagnostics[0]!.file).toBe(path.join(dir, 'broken.dbml'));
    expect(formatCheck('uses_broken.dbml', result)).toContain(`${path.join(dir, 'broken.dbml')}:2:`);
  });

  it('reports an import that does not exist', () => {
    const opts = project('lonely.dbml', 'use * from \'./missing\'\n\nTable a {\n  id int\n}\n');
    const result = checkText(opts.layout.getSource(opts.entry)!, opts);
    expect(result.errors).toBeGreaterThan(0);
    expect(result.diagnostics[0]!.message).toMatch(/non-existent file/);
  });
});

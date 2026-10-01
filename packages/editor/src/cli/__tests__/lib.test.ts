import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  checkText, formatCheck, formatModelText, modelOf,
} from '@/cli/lib';
import { buildDiagramModel } from '@/dbml/buildModel';
import { fromModel } from '@dbml-designer/engine/core';

/** Every sample schema and test fixture, by path. */
const SCHEMAS = ['../../sample', '../../dbml/__tests__/fixtures']
  .map((dir) => fileURLToPath(new URL(dir, import.meta.url)))
  .flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith('.dbml')).map((f) => `${dir}/${f}`));

/** A value with every `source` left out, Maps included. */
function withoutSource (v: unknown): unknown {
  if (v instanceof Map) return new Map([...v].map(([k, x]) => [k, withoutSource(x)]));
  if (Array.isArray(v)) return v.map(withoutSource);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'source').map(([k, x]) => [k, withoutSource(x)]));
  }
  return v;
}

const DBML = [
  'Project blog {',
  '  database_type: \'PostgreSQL\'',
  '}',
  'Table users {',
  '  id int [pk, increment]',
  '  name varchar(64) [not null, note: \'Display name\']',
  '}',
  'Table posts {',
  '  id int [pk]',
  '  author_id int [not null, ref: > users.id]',
  '}',
  'Table post_stats {',
  '  post_id int [pk, ref: - posts.id]',
  '  n int',
  '}',
  'Dep rollup {',
  '  posts.id -> post_stats.post_id',
  '}',
  'TableGroup content {',
  '  posts',
  '  post_stats',
  '}',
  'DiagramView core {',
  '  tables {',
  '    users',
  '    posts',
  '  }',
  '}',
  '',
].join('\n');

describe('checkText', () => {
  it('finds nothing wrong with clean DBML', () => {
    const r = checkText(DBML);
    expect(r.errors).toBe(0);
    expect(r.warnings).toBe(0);
    expect(r.db).not.toBeNull();
  });

  it('reports compiler errors with their position and no database', () => {
    const r = checkText('Table users {\n  id int [pk\n}\n');
    expect(r.errors).toBeGreaterThan(0);
    expect(r.db).toBeNull();
    expect(r.diagnostics[0]).toMatchObject({ severity: 'error', source: 'dbml' });
    expect(r.diagnostics[0]!.line).toBeGreaterThanOrEqual(2);
    expect(formatCheck('x.dbml', r)).toMatch(/^x\.dbml:\d+:\d+: error: /);
    expect(formatCheck('x.dbml', r)).toMatch(/x\.dbml: \d+ errors?, 0 warnings\n$/);
  });

  it('checks the layout footer against the schema, at its position in the file', () => {
    const text = `${DBML}\n/* === DBML DESIGNER FOOTER ===\nversion: 1\ntables:\n  public:\n    users: { x: 8, y: 16 }\n    ghost: { x: 1, y: 2 }\n*/\n`;
    const r = checkText(text);
    expect(r.errors).toBe(0);
    expect(r.warnings).toBe(1);
    const footerLine = text.split('\n').findIndex((l) => l.includes('ghost:')) + 1;
    expect(r.diagnostics[0]).toMatchObject({
      severity: 'warning',
      source: 'layout',
      line: footerLine,
      message: 'Table "ghost" is not in the DBML; its position is ignored',
    });
    expect(formatCheck('x.dbml', r)).toContain(`x.dbml:${footerLine}:5: warning: Table "ghost"`);
    expect(formatCheck('x.dbml', r)).toContain('(layout footer)');

    const views = checkText(`${DBML}\n/* === DBML DESIGNER FOOTER ===\nversion: 1\nviews:\n  nope:\n    tables:\n      public:\n        users: { x: 1, y: 2 }\n*/\n`);
    expect(views.errors).toBe(0);
    expect(views.diagnostics.map((d) => d.message)).toEqual(['DiagramView "nope" is not in the DBML; its layout is ignored']);

    const broken = checkText(`${DBML}\n/* === DBML DESIGNER FOOTER ===\nversion: 1\ntables: [\n*/\n`);
    expect(broken.errors).toBe(1);
    expect(broken.diagnostics[0]!.message).toMatch(/^Not valid YAML/);
  });
});

describe('modelOf', () => {
  it('gives the engine model as plain data in declaration order, without text positions', () => {
    const { model, check } = modelOf(DBML);
    expect(check.errors).toBe(0);
    expect(model).not.toBeNull();
    const m = model!;
    expect(m.project).toEqual({ name: 'blog', databaseType: 'PostgreSQL' });
    expect(m.tables.map((t) => t.name)).toEqual(['users', 'posts', 'post_stats']);
    expect(m.tables[0]!.fields).toEqual([
      { name: 'id', type: 'int', pk: true, increment: true },
      { name: 'name', type: 'varchar(64)', notNull: true, note: 'Display name' },
    ]);
    expect(m.refs).toHaveLength(2);
    expect(m.refs![0]).toEqual({
      from: { table: 'public.users', fields: ['id'], cardinality: '1' },
      to: { table: 'public.posts', fields: ['author_id'], cardinality: '*' },
    });
    expect(m.deps).toEqual([{
      from: { table: 'public.posts', fields: ['id'] },
      to: { table: 'public.post_stats', fields: ['post_id'] },
      name: 'rollup',
    }]);
    expect(m.groups).toEqual([{ name: 'content', tables: ['public.posts', 'public.post_stats'] }]);
    expect(m.views).toEqual([{ name: 'core', tables: ['public.users', 'public.posts'] }]);
    expect(JSON.stringify(m)).not.toContain('"source"');
    // Stable output: the same text gives the same JSON, and the engine draws it like the DBML.
    expect(JSON.stringify(modelOf(DBML).model)).toBe(JSON.stringify(m));
    expect(fromModel(m).tablesByKey.get('public.posts')!.groupKey).toBe('group:public.content');
  });

  it('renders a compact text listing', () => {
    const text = formatModelText(modelOf(DBML).model!);
    expect(text).toContain('TABLES\n  public.users\n    id int [pk, increment]\n');
    expect(text).toContain('REFS\n  public.users(id) 1 -- public.posts(author_id) *\n');
    expect(text).toContain('DEPS\n  public.posts -> public.post_stats  [rollup]\n    public.posts.id -> public.post_stats.post_id\n');
    expect(text).toContain('VIEWS\n  core  tables: public.users, public.posts\n');
  });

  it('marks the refs a TablePartial brings with the partial, and leaves the others unmarked', () => {
    const text = [
      'TablePartial per_config {',
      '  config_id text [pk, ref: - config.config_id]',
      '}',
      'Table config {',
      '  config_id text [pk]',
      '}',
      'Table site {',
      '  ~per_config',
      '  owner_id int [ref: > owners.id]',
      '}',
      'Table owners {',
      '  id int [pk]',
      '}',
      '',
    ].join('\n');
    const m = modelOf(text).model!;
    expect(m.refs!.map((r) => [r.from.table, r.to.table, r.viaPartial ?? null])).toEqual([
      ['public.owners', 'public.site', null],
      ['public.site', 'public.config', 'per_config'],
    ]);
    expect(JSON.stringify(m)).toContain('"viaPartial":"per_config"');
    expect(m.tables.find((t) => t.name === 'site')!.fields[0]).toMatchObject({
      name: 'config_id',
      injectedFrom: 'per_config',
    });
    const listing = formatModelText(m);
    expect(listing).toContain('REFS\n  public.owners(id) 1 -- public.site(owner_id) *\n');
    expect(listing).toContain('  public.site(config_id) 1 -- public.config(config_id) 1  (from partial per_config)\n');
  });

  it.each(SCHEMAS)('prints a model of %s that draws exactly what the editor draws', (file) => {
    const { model, check } = modelOf(readFileSync(file, 'utf8'));
    expect(withoutSource(fromModel(model!))).toEqual(withoutSource({
      ...buildDiagramModel(check.db!),
      diagnostics: [],
    }));
  });

  it('gives no model for DBML with errors', () => {
    const { model, check } = modelOf('Table x {');
    expect(model).toBeNull();
    expect(check.errors).toBeGreaterThan(0);
  });
});

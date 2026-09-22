import { describe, it, expect } from 'vitest';
import {
  checkText, formatCheck, formatGraphText, graphOf,
} from '@/cli/lib';

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

describe('graphOf', () => {
  it('lists tables, refs, deps, groups, and views as data in declaration order', () => {
    const { graph, check } = graphOf(DBML);
    expect(check.errors).toBe(0);
    expect(graph).not.toBeNull();
    const g = graph!;
    expect(g.project).toEqual({ name: 'blog', databaseType: 'PostgreSQL', note: null });
    expect(g.tables.map((t) => t.key)).toEqual(['public.users', 'public.posts', 'public.post_stats']);
    expect(g.tables[0]!.fields).toEqual([
      { name: 'id', type: 'int', pk: true, unique: false, notNull: false, increment: true },
      { name: 'name', type: 'varchar(64)', pk: false, unique: false, notNull: true, increment: false, note: 'Display name' },
    ]);
    expect(g.tables[1]!.group).toBe('group:public.content');
    expect(g.refs).toHaveLength(2);
    expect(g.refs[0]).toMatchObject({
      from: { table: 'public.users', fields: ['id'] },
      to: { table: 'public.posts', fields: ['author_id'] },
      inactive: false,
    });
    expect(g.deps).toEqual([{
      names: ['rollup'],
      upstream: 'public.posts',
      downstream: 'public.post_stats',
      columns: [{ from: 'public.posts.id', to: 'public.post_stats.post_id' }],
    }]);
    expect(g.groups).toEqual([{ key: 'group:public.content', name: 'content', tables: ['public.posts', 'public.post_stats'] }]);
    expect(g.views).toEqual([{ name: 'core', tables: ['public.users', 'public.posts'], groups: [], schemas: [], notes: [] }]);
    // Stable output: the same text gives the same JSON.
    expect(JSON.stringify(graphOf(DBML).graph)).toBe(JSON.stringify(g));
  });

  it('renders a compact text listing', () => {
    const text = formatGraphText(graphOf(DBML).graph!);
    expect(text).toContain('TABLES\n  public.users\n    id int [pk, increment]\n');
    expect(text).toContain('REFS\n  public.users(id) 1 -- public.posts(author_id) *\n');
    expect(text).toContain('DEPS\n  public.posts -> public.post_stats  [rollup]\n    public.posts.id -> public.post_stats.post_id\n');
    expect(text).toContain('VIEWS\n  core  tables: public.users, public.posts\n');
  });

  it('gives no graph for DBML with errors', () => {
    const { graph, check } = graphOf('Table x {');
    expect(graph).toBeNull();
    expect(check.errors).toBeGreaterThan(0);
  });
});

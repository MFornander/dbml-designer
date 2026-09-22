import { describe, it, expect } from 'vitest';
import { refKeyOf, serializeLayout, validateLayout } from '@/layout';
import type { LayoutKeys } from '@/layout/schemaKeys';

const keys: LayoutKeys = {
  tables: new Set(['public.users', 'public.posts', 'sales.orders']),
  notes: new Set(['note:tips']),
  groups: new Set(['group:public.content', 'group:sales.reporting']),
  refs: new Set([
    refKeyOf(null, 'public.users(id)', 'public.posts(author_id)'),
    refKeyOf('fk', 'public.users(id)', 'sales.orders(user_id)'),
  ]),
  views: new Set(['overview']),
};

function withEdits (source: string, edits: readonly { start: number; end: number; newText: string }[]): string {
  let out = source;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.newText + out.slice(e.end);
  return out;
}

describe('validateLayout', () => {
  it('accepts a written file without a word of complaint', () => {
    const text = serializeLayout({
      positions: {
        'public.users': { x: 8, y: 16 },
        'sales.orders': { x: 40, y: 48 },
        'note:tips': { x: 1, y: 2, w: 200, h: 100 },
      },
      collapsedGroups: ['group:public.content'],
      edgeRoutes: { [refKeyOf(null, 'public.users(id)', 'public.posts(author_id)')]: [264.5, 72, 320] },
    });
    const v = validateLayout(text, keys);
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
    expect(v.snapshot.positions['note:tips']).toEqual({ x: 1, y: 2, w: 200, h: 100 });
    expect(v.snapshot.collapsedGroups).toEqual(['group:public.content']);
  });

  it('reports a YAML syntax error once, with its position, and nothing else', () => {
    const v = validateLayout('version: 1\ntables: [\n  x: 1', keys);
    expect(v.ok).toBe(false);
    expect(v.errors).toHaveLength(1);
    expect(v.errors[0]!.message).toMatch(/^Not valid YAML: /);
    expect(v.errors[0]!.category).toBe('layout');
    expect(v.errors[0]!.location.line).toBeGreaterThanOrEqual(2);
    expect(v.warnings).toEqual([]);
  });

  it('requires a top-level mapping with version 1', () => {
    expect(validateLayout('- just a list').errors[0]!.message).toMatch(/Expected a mapping/);
    const missing = validateLayout('tables: {}');
    expect(missing.errors[0]!.message).toMatch(/Missing "version: 1"/);
    expect(missing.errors[0]!.location).toEqual({ line: 1, column: 1 });
    const wrong = validateLayout('version: 2');
    expect(wrong.errors[0]!.message).toMatch(/version 2/);
    expect(wrong.errors[0]!.location).toEqual({ line: 1, column: 10 });
    expect(validateLayout('').errors[0]!.message).toMatch(/Expected a mapping/);
  });

  it('points at the entry whose position is not numeric x and y', () => {
    const v = validateLayout('version: 1\ntables:\n  public:\n    users: { x: 1, y: two }\n    posts: { x: 3, y: 4 }', keys);
    expect(v.ok).toBe(false);
    expect(v.errors).toHaveLength(1);
    expect(v.errors[0]!.message).toBe('"tables.public.users" needs numeric x and y');
    expect(v.errors[0]!.location).toEqual({ line: 4, column: 12 });
    // The good entry is still read.
    expect(v.snapshot.positions).toEqual({ 'public.posts': { x: 3, y: 4 } });
  });

  it('errors on note sizes that are not numbers and warns about keys it does not know', () => {
    const bad = validateLayout('version: 1\nnotes:\n  tips: { x: 1, y: 2, w: wide }', keys);
    expect(bad.errors.map((e) => e.message)).toEqual(['"notes.tips.w" must be a number']);
    const extra = validateLayout('version: 1\ntables:\n  public:\n    users: { x: 1, y: 2, color: red }\nextra: 1', keys);
    expect(extra.ok).toBe(true);
    expect(extra.warnings.map((w) => w.message)).toEqual([
      'Unknown key "color" in "tables.public.users"; it is ignored',
      'Unknown section "extra"; it is ignored. Sections are version and views',
    ]);
  });

  it('warns about tables, notes, and groups the DBML lacks but keeps them in the snapshot', () => {
    const v = validateLayout([
      'version: 1',
      'tables:',
      '  public:',
      '    ghost: { x: 1, y: 2 }',
      '  sales.legacy: { x: 3, y: 4 }',
      'notes:',
      '  lost: { x: 5, y: 6 }',
      'groups:',
      '  public:',
      '    nowhere: { collapsed: true }',
    ].join('\n'), keys);
    expect(v.ok).toBe(true);
    expect(v.warnings.map((w) => w.message)).toEqual([
      'Table "ghost" is not in the DBML; its position is ignored',
      'Table "sales.legacy" is not in the DBML; its position is ignored',
      'Note "lost" is not in the DBML; its position is ignored',
      'Table group "nowhere" is not in the DBML; its collapsed state is ignored',
    ]);
    expect(v.warnings[0]!.location).toEqual({ line: 4, column: 5 });
    expect(Object.keys(v.snapshot.positions).sort()).toEqual(['note:lost', 'public.ghost', 'sales.legacy']);
    expect(v.snapshot.collapsedGroups).toEqual(['group:public.nowhere']);
    // Without schema keys nothing is unknown.
    expect(validateLayout('version: 1\ntables:\n  public:\n    ghost: { x: 1, y: 2 }').warnings).toEqual([]);
  });

  it('spots a relationship written the wrong way round and offers to swap it', () => {
    const text = 'version: 1\nrefs:\n  - from: posts(author_id)\n    to: users(id)\n    rails: [ 300 ]\n';
    const v = validateLayout(text, keys);
    expect(v.ok).toBe(true);
    expect(v.warnings).toHaveLength(1);
    const w = v.warnings[0]!;
    expect(w.message).toMatch(/swap from and to$/);
    expect(w.explanation).toMatch(/referenced table first/);
    expect(w.location).toEqual({ line: 3, column: 5 });
    expect(w.quickFixes).toHaveLength(1);
    const fixed = withEdits(text, w.quickFixes![0]!.edits);
    expect(fixed).toContain('from: users(id)');
    expect(fixed).toContain('to: posts(author_id)');
    expect(validateLayout(fixed, keys).warnings).toEqual([]);
  });

  it('warns about refs the DBML lacks and errors on bad rails or ends', () => {
    const unknown = validateLayout('version: 1\nrefs:\n  - from: a(x)\n    to: b(y)\n    rails: [1]', keys);
    expect(unknown.ok).toBe(true);
    expect(unknown.warnings.map((w) => w.message)).toEqual(['No relationship from "a(x)" to "b(y)" in the DBML; this route is ignored']);
    expect(unknown.snapshot.edgeRoutes).toEqual({ [refKeyOf(null, 'public.a(x)', 'public.b(y)')]: [1] });

    expect(validateLayout('version: 1\nrefs:\n  - from: a(x)\n    rails: [1]').errors[0]!.message).toBe('"refs[0]" needs "from" and "to"');
    const rails = validateLayout('version: 1\nrefs:\n  - from: a(x)\n    to: b(y)\n    rails: [1, 2]');
    expect(rails.errors[0]!.message).toBe('"refs[0].rails" must be an odd-length list of numbers, or empty for the automatic route');
    expect(rails.errors[0]!.location).toEqual({ line: 5, column: 12 });
    expect(validateLayout('version: 1\nrefs:\n  x: 1').errors[0]!.message).toBe('"refs" must be a list');
    expect(validateLayout('version: 1\nrefs:\n  - name: 3\n    from: a(x)\n    to: b(y)\n    rails: [1]').errors[0]!.message).toBe('"refs[0].name" must be a string');
  });

  it('reads undone inherited collapses and routes as explicit overrides', () => {
    const v = validateLayout([
      'version: 1',
      'groups:',
      '  public:',
      '    content: { collapsed: false }',
      'refs:',
      '  - from: users(id)',
      '    to: posts(author_id)',
      '    rails: []',
    ].join('\n'), keys);
    expect(v.ok).toBe(true);
    expect(v.warnings).toEqual([]);
    expect(v.snapshot).toEqual({
      positions: {},
      collapsedGroups: [],
      expandedGroups: ['group:public.content'],
      edgeRoutes: { [refKeyOf(null, 'public.users(id)', 'public.posts(author_id)')]: [] },
    });
  });

  it('reads the older flat forms, empty sections, and named refs', () => {
    const v = validateLayout([
      'version: 1',
      'tables:',
      '  sales.orders: { x: 40, y: 48 }',
      '  public:',
      'notes:',
      'groups:',
      '  public.content: { collapsed: true }',
      '  sales:',
      '    reporting: { collapsed: false }',
      'refs:',
      '  - name: fk',
      '    from: users(id)',
      '    to: sales.orders(user_id)',
      '    rails: [300]',
    ].join('\n'), keys);
    expect(v.ok).toBe(true);
    expect(v.warnings).toEqual([]);
    expect(v.snapshot).toEqual({
      positions: { 'sales.orders': { x: 40, y: 48 } },
      collapsedGroups: ['group:public.content'],
      expandedGroups: ['group:sales.reporting'],
      edgeRoutes: { [refKeyOf('fk', 'public.users(id)', 'sales.orders(user_id)')]: [300] },
    });
  });

  it('reads every entry under views, default and the named ones alike, and warns about views the DBML lacks', () => {
    const text = [
      'version: 1',
      'views:',
      '  default:',
      '    tables:',
      '      public:',
      '        users: { x: 0, y: 0 }',
      '  overview:',
      '    tables:',
      '      public:',
      '        users: { x: 900, y: 0 }',
      '        ghost: { x: 1, y: 1 }',
      '    groups:',
      '      public:',
      '        content: { collapsed: false }',
      '    refs:',
      '      - from: users(id)',
      '        to: posts(author_id)',
      '        rails: []',
      '    version: 1',
      '  gone:',
      '    tables:',
      '      public:',
      '        users: { x: 5, y: 5 }',
      '  broken: 3',
      '',
    ].join('\n');
    const v = validateLayout(text, keys);
    expect(v.ok).toBe(true);
    expect(v.warnings.map((w) => [w.code, w.location.line])).toEqual([
      ['layout/unknown-table', 11],
      ['layout/unknown-section', 19],
      ['layout/unknown-view', 20],
      ['layout/not-a-view', 24],
    ]);
    expect(v.warnings[1]!.message).toBe('Unknown section "version" in "views.overview"; it is ignored. Sections are tables, notes, groups, refs');
    expect(v.warnings[2]!.message).toBe('DiagramView "gone" is not in the DBML; its layout is ignored');
    expect(v.warnings[3]!.message).toBe('"views.broken" is not a view: a view is a mapping of sections (tables, notes, groups, refs); it is ignored');
    expect(v.snapshot.positions).toEqual({ 'public.users': { x: 0, y: 0 } });
    expect(v.snapshot.views!.overview).toEqual({
      positions: { 'public.users': { x: 900, y: 0 }, 'public.ghost': { x: 1, y: 1 } },
      collapsedGroups: [],
      expandedGroups: ['group:public.content'],
      edgeRoutes: { [refKeyOf(null, 'public.users(id)', 'public.posts(author_id)')]: [] },
    });
    expect(Object.keys(v.snapshot.views!)).toEqual(['overview', 'gone']);
    // A `default` that is not a mapping is ignored the same way, an empty entry says nothing, and `views` itself must be a mapping.
    const odd = validateLayout('version: 1\nviews:\n  default: []\n  empty:\n');
    expect(odd.ok).toBe(true);
    expect(odd.warnings.map((w) => w.code)).toEqual(['layout/not-a-view']);
    expect(odd.snapshot.views).toBeUndefined();
    expect(validateLayout('version: 1\nviews: []\n').errors.map((e) => e.message)).toEqual(['"views" must be a mapping of view names']);
  });
});

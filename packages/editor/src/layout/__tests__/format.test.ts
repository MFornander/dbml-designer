import { describe, it, expect } from 'vitest';
import {
  baseFileName, dbmlFileName, parseLayout, refKeyOf, serializeLayout, SidecarError, type LayoutSnapshot,
} from '@/layout';

const snap: LayoutSnapshot = {
  positions: {
    'public.users': {
      x: 288,
      y: 0,
    },
    'public.posts': {
      x: 0,
      y: 64,
    },
    'note:tips': {
      x: 800,
      y: 0,
      w: 192,
      h: 160,
    },
  },
  collapsedGroups: ['group:public.content', 'group:sales.reporting'],
  edgeRoutes: {
    '#public.users(id)->public.posts(author_id)': [264.5, 72, 320],
    'fk#public.a(x,y)->sales.b(x,y)#2': [100],
  },
};

describe('file names', () => {
  it('derives a safe base name from the project, falling back to schema', () => {
    expect(baseFileName('blog')).toBe('blog');
    expect(baseFileName(' My Schema! ')).toBe('My_Schema');
    expect(baseFileName(null)).toBe('schema');
    expect(baseFileName('***')).toBe('schema');
    expect(dbmlFileName('blog')).toBe('blog.dbml');
  });
});

describe('serializeLayout', () => {
  it('writes a versioned document with tables nested by schema and one-line positions', () => {
    const text = serializeLayout(snap);
    // The Default View is `views.default`.
    expect(text.startsWith('version: 1\nviews:\n  default:\n    tables:\n')).toBe(true);
    expect(text).toMatch(/\n {4}tables:\n {6}public:\n {8}posts: \{ ?x: 0, y: 64 ?\}\n {8}users: \{ ?x: 288, y: 0 ?\}\n/);
    expect(text).toMatch(/\n {4}notes:\n {6}tips: \{ ?x: 800, y: 0, w: 192, h: 160 ?\}\n/);
    expect(text).toMatch(/\n {4}groups:\n {6}public:\n {8}content: \{ ?collapsed: true ?\}\n {6}sales:\n {8}reporting: \{ ?collapsed: true ?\}\n/);
    expect(text).toContain('\n    refs:\n');
    // Ref ends read like DBML: the default schema is left out, others are kept.
    expect(text).toContain('from: users(id)');
    expect(text).toContain('to: posts(author_id)');
    expect(text).toContain('to: sales.b(x,y)#2');
    expect(text).toMatch(/rails: \[ ?264\.5, 72, 320 ?\]/);
    expect(text).toContain('name: fk');
    expect(text).not.toContain('public.');
  });

  it('never writes negative zero', () => {
    const text = serializeLayout({
      positions: {
        'public.a': {
          x: -0,
          y: 0,
        },
        'note:n': {
          x: -0,
          y: -0,
          w: -0,
          h: 8,
        },
      },
      collapsedGroups: [],
      edgeRoutes: { '#public.a(id)->public.b(a_id)': [-0] },
    });
    expect(text).not.toContain('-0');
    expect(text).toMatch(/\n {8}a: \{ ?x: 0, y: 0 ?\}/);
  });

  it('writes undone inherited collapses and routes so they round-trip', () => {
    const snap: LayoutSnapshot = {
      positions: {},
      collapsedGroups: ['group:public.a'],
      expandedGroups: ['group:public.b'],
      edgeRoutes: { '#public.a(id)->public.b(a_id)': [] },
    };
    const text = serializeLayout(snap);
    expect(text).toMatch(/a: \{ ?collapsed: true ?\}/);
    expect(text).toMatch(/b: \{ ?collapsed: false ?\}/);
    expect(text).toMatch(/rails: \[ ?\]/);
    expect(parseLayout(text)).toEqual(snap);
  });

  it('writes every view under views, the Default View first, and skips views that change nothing', () => {
    const text = serializeLayout({
      ...snap,
      views: {
        overview: {
          positions: { 'public.users': { x: 900, y: 0 } },
          collapsedGroups: [],
          expandedGroups: ['group:public.content'],
          edgeRoutes: { '#public.users(id)->public.posts(author_id)': [] },
        },
        untouched: {
          positions: {},
          collapsedGroups: [],
          edgeRoutes: {},
        },
        compact: {
          positions: {},
          collapsedGroups: ['group:sales.reporting'],
          edgeRoutes: {},
        },
      },
    });
    const at = (s: string) => text.indexOf(s);
    expect(text.startsWith('version: 1\nviews:\n  default:\n')).toBe(true);
    expect(at('\n  default:\n')).toBeLessThan(at('\n  compact:\n'));
    // Named views follow sorted by name, and a view that changes nothing is left out.
    expect(text).toMatch(/\n {2}compact:\n {4}groups:\n {6}sales:\n {8}reporting: \{ ?collapsed: true ?\}\n {2}overview:\n {4}tables:\n {6}public:\n {8}users: \{ ?x: 900, y: 0 ?\}\n {4}groups:\n {6}public:\n {8}content: \{ ?collapsed: false ?\}\n {4}refs:\n/);
    expect(text).not.toContain('untouched');
    expect(text).toMatch(/rails: \[ ?\]/);
    expect(parseLayout(text).views).toEqual({
      compact: { positions: {}, collapsedGroups: ['group:sales.reporting'], edgeRoutes: {} },
      overview: {
        positions: { 'public.users': { x: 900, y: 0 } },
        collapsedGroups: [],
        expandedGroups: ['group:public.content'],
        edgeRoutes: { '#public.users(id)->public.posts(author_id)': [] },
      },
    });
    expect(serializeLayout({ ...snap, views: {} })).toBe(serializeLayout(snap));

    // A Default View that changes nothing is left out too, and a view named like its entry is not written.
    const viewOnly = serializeLayout({
      positions: {},
      collapsedGroups: [],
      edgeRoutes: {},
      views: {
        overview: { positions: { 'public.a': { x: 1, y: 1 } }, collapsedGroups: [], edgeRoutes: {} },
        default: { positions: { 'public.a': { x: 2, y: 2 } }, collapsedGroups: [], edgeRoutes: {} },
      },
    });
    expect(viewOnly).toBe('version: 1\nviews:\n  overview:\n    tables:\n      public:\n        a: { x: 1, y: 1 }\n');
  });

  it('omits empty sections', () => {
    const text = serializeLayout({
      positions: {},
      collapsedGroups: [],
      edgeRoutes: {},
    });
    expect(text).toContain('version: 1');
    expect(text).not.toContain('views:');
    expect(text).not.toContain('tables:');
    expect(text).not.toContain('refs:');
  });
});

describe('parseLayout', () => {
  it('round-trips a snapshot', () => {
    expect(parseLayout(serializeLayout(snap))).toEqual(snap);
  });

  it('accepts a hand-written file with only some sections, in nested or flat form, at the root as older footers have them', () => {
    const parsed = parseLayout([
      'version: 1',
      'tables:',
      '  public:',
      '    users:',
      '      x: 8',
      '      y: 16',
      '  sales.orders: { x: 40, y: 48 }',
      'groups:',
      '  public.legacy: { collapsed: true }',
      '  sales:',
      '    reporting: { collapsed: true }',
      '    other: { collapsed: false }',
      'refs:',
      '  - name: author',
      '    from: users(id)',
      '    to: sales.orders(user_id)',
      '    rails: [300]',
    ].join('\n'));
    expect(parsed).toEqual({
      positions: {
        'public.users': { x: 8, y: 16 },
        'sales.orders': { x: 40, y: 48 },
      },
      collapsedGroups: ['group:public.legacy', 'group:sales.reporting'],
      // `collapsed: false` is kept: it undoes a collapse inherited from an imported layout.
      expandedGroups: ['group:sales.other'],
      edgeRoutes: { [refKeyOf('author', 'public.users(id)', 'sales.orders(user_id)')]: [300] },
    });
  });

  it('rejects malformed files with a pointer to the problem', () => {
    expect(() => parseLayout('- just a list')).toThrow(SidecarError);
    expect(() => parseLayout('version: 2')).toThrow(/version 2/);
    expect(() => parseLayout('version: 1\ntables:\n  public:\n    users: { x: 1 }')).toThrow(/tables\.public\.users/);
    expect(() => parseLayout('version: 1\ntables:\n  public: 3')).toThrow(/tables\.public/);
    expect(() => parseLayout('version: 1\nnotes:\n  n: { x: 1, y: 2, w: wide }')).toThrow(/notes\.n\.w/);
    expect(() => parseLayout('version: 1\nrefs:\n  - from: a(x)\n    rails: [1]')).toThrow(/refs\[0\]/);
    expect(() => parseLayout('version: 1\nrefs:\n  - from: a(x)\n    to: b(y)\n    rails: [1, 2]')).toThrow(/rails/);
    expect(() => parseLayout('version: 1\ntables: [')).toThrow(/Not valid YAML/);
  });
});

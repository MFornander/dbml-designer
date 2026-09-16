import { describe, it, expect } from 'vitest';
import {
  baseFileName, dbmlFileName, parseLayout, refKeyOf, serializeLayout, sidecarFileName, SidecarError, type LayoutSnapshot,
} from '@/layout/sidecar';

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

describe('sidecar file names', () => {
  it('derives a safe base name from the project, falling back to schema', () => {
    expect(baseFileName('blog')).toBe('blog');
    expect(baseFileName(' My Schema! ')).toBe('My_Schema');
    expect(baseFileName(null)).toBe('schema');
    expect(baseFileName('***')).toBe('schema');
    expect(dbmlFileName('blog')).toBe('blog.dbml');
    expect(sidecarFileName('blog')).toBe('blog.dbml.yaml');
  });
});

describe('serializeLayout', () => {
  it('writes a commented, versioned document with tables nested by schema and one-line positions', () => {
    const text = serializeLayout(snap, 'blog.dbml');
    expect(text.startsWith('# Diagram layout for blog.dbml')).toBe(true);
    expect(text).toContain('\nversion: 1\n');
    expect(text).toMatch(/\ntables:\n {2}public:\n {4}posts: \{ ?x: 0, y: 64 ?\}\n {4}users: \{ ?x: 288, y: 0 ?\}\n/);
    expect(text).toMatch(/\nnotes:\n {2}tips: \{ ?x: 800, y: 0, w: 192, h: 160 ?\}\n/);
    expect(text).toMatch(/\ngroups:\n {2}public:\n {4}content: \{ ?collapsed: true ?\}\n {2}sales:\n {4}reporting: \{ ?collapsed: true ?\}\n/);
    expect(text).toContain('\nrefs:\n');
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
    }, 'x.dbml');
    expect(text).not.toContain('-0');
    expect(text).toMatch(/\n {4}a: \{ ?x: 0, y: 0 ?\}/);
  });

  it('omits empty sections', () => {
    const text = serializeLayout({
      positions: {},
      collapsedGroups: [],
      edgeRoutes: {},
    }, 'x.dbml');
    expect(text).toContain('version: 1');
    expect(text).not.toContain('tables:');
    expect(text).not.toContain('refs:');
  });
});

describe('parseLayout', () => {
  it('round-trips a snapshot', () => {
    expect(parseLayout(serializeLayout(snap, 'blog.dbml'))).toEqual(snap);
  });

  it('accepts a hand-written file with only some sections, in nested or flat form', () => {
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

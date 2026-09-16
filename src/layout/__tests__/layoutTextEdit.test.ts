import { describe, it, expect } from 'vitest';
import {
  applyLayoutDeltas, diffSnapshots, parseLayout, refKeyOf, serializeLayout,
} from '@/layout/sidecar';
import type { LayoutSnapshot } from '@/layout/sidecar';

const AUTHOR = refKeyOf(null, 'public.users(id)', 'public.posts(author_id)');

const base: LayoutSnapshot = {
  positions: {
    'public.users': { x: 288, y: 0 },
    'public.posts': { x: 0, y: 64 },
    'note:tips': { x: 800, y: 0, w: 192, h: 160 },
  },
  collapsedGroups: ['group:public.content'],
  edgeRoutes: { [AUTHOR]: [264.5, 72, 320] },
};

describe('diffSnapshots', () => {
  it('lists changed, added, and removed entries of every kind', () => {
    const next: LayoutSnapshot = {
      positions: {
        'public.users': { x: 296, y: 0 },
        'note:tips': { x: 800, y: 0, w: 192, h: 160 },
        'public.tags': { x: 8, y: 8 },
      },
      collapsedGroups: ['group:sales.reporting'],
      edgeRoutes: { [AUTHOR]: [270, 72, 320] },
    };
    expect(diffSnapshots(base, next)).toEqual([
      { kind: 'position', key: 'public.users', value: { x: 296, y: 0 } },
      { kind: 'position', key: 'public.posts', value: null },
      { kind: 'position', key: 'public.tags', value: { x: 8, y: 8 } },
      { kind: 'group', key: 'group:sales.reporting', collapsed: true },
      { kind: 'group', key: 'group:public.content', collapsed: false },
      { kind: 'route', key: AUTHOR, rails: [270, 72, 320] },
    ]);
    expect(diffSnapshots(base, base)).toEqual([]);
  });
});

describe('applyLayoutDeltas', () => {
  const handWritten = [
    '# my layout',
    'version: 1',
    'tables:',
    '  public:',
    '    users: { x: 288, y: 0 } # keep me',
    '    posts:',
    '      x: 0',
    '      y: 64',
    'refs:',
    '  - from: users(id)',
    '    to: posts(author_id)',
    '    rails: [ 264.5, 72, 320 ]',
    '',
  ].join('\n');

  it('updates positions in place, keeping comments and each entry\'s own style', () => {
    const out = applyLayoutDeltas(handWritten, [
      { kind: 'position', key: 'public.users', value: { x: 296, y: 8 } },
      { kind: 'position', key: 'public.posts', value: { x: 16, y: 64 } },
    ]);
    expect(out).toBe([
      '# my layout',
      'version: 1',
      'tables:',
      '  public:',
      '    users: { x: 296, y: 8 } # keep me',
      '    posts:',
      '      x: 16',
      '      y: 64',
      'refs:',
      '  - from: users(id)',
      '    to: posts(author_id)',
      '    rails: [ 264.5, 72, 320 ]',
      '',
    ].join('\n'));
  });

  it('adds tables under their schema and puts new sections in canonical order', () => {
    const out = applyLayoutDeltas('version: 1\nrefs:\n  - from: a(x)\n    to: b(y)\n    rails: [ 1 ]\n', [
      { kind: 'position', key: 'public.users', value: { x: 8, y: 16 } },
      { kind: 'position', key: 'sales.orders', value: { x: -0, y: 24 } },
      { kind: 'position', key: 'note:tips', value: { x: 1, y: 2, w: 100, h: 50 } },
      { kind: 'group', key: 'group:public.content', collapsed: true },
    ]);
    expect(out).toBe([
      'version: 1',
      'tables:',
      '  public:',
      '    users: { x: 8, y: 16 }',
      '  sales:',
      '    orders: { x: 0, y: 24 }',
      'notes:',
      '  tips: { x: 1, y: 2, w: 100, h: 50 }',
      'groups:',
      '  public:',
      '    content: { collapsed: true }',
      'refs:',
      '  - from: a(x)',
      '    to: b(y)',
      '    rails: [ 1 ]',
      '',
    ].join('\n'));
  });

  it('removes entries and the parents they leave empty', () => {
    const out = applyLayoutDeltas(handWritten, [
      { kind: 'position', key: 'public.users', value: null },
      { kind: 'position', key: 'public.posts', value: null },
      { kind: 'route', key: AUTHOR, rails: null },
    ]);
    expect(out).toBe('# my layout\nversion: 1\n');
  });

  it('adds, reroutes, and forgets relationship routes by their ends', () => {
    const added = applyLayoutDeltas('version: 1\n', [
      { kind: 'route', key: refKeyOf('fk', 'public.users(id)', 'sales.orders(user_id)'), rails: [100, 20, 140] },
    ])!;
    expect(added).toBe('version: 1\nrefs:\n  - name: fk\n    from: users(id)\n    to: sales.orders(user_id)\n    rails: [ 100, 20, 140 ]\n');
    const rerouted = applyLayoutDeltas(added, [
      { kind: 'route', key: refKeyOf('fk', 'public.users(id)', 'sales.orders(user_id)'), rails: [120] },
    ])!;
    expect(rerouted).toContain('rails: [ 120 ]');
    expect(rerouted).not.toContain('140');
    expect(applyLayoutDeltas(rerouted, [
      { kind: 'route', key: refKeyOf('fk', 'public.users(id)', 'sales.orders(user_id)'), rails: null },
    ])).toBe('version: 1\n');
  });

  it('writes collapsed groups and drops expanded ones, retiring the flat form', () => {
    const text = 'version: 1\ngroups:\n  public.content: { collapsed: true }\n';
    const stillCollapsed = applyLayoutDeltas(text, [{ kind: 'group', key: 'group:public.content', collapsed: true }]);
    expect(stillCollapsed).toBe('version: 1\ngroups:\n  public:\n    content: { collapsed: true }\n');
    expect(applyLayoutDeltas(text, [{ kind: 'group', key: 'group:public.content', collapsed: false }])).toBe('version: 1\n');
  });

  it('retires a flat table key when writing the nested form', () => {
    const out = applyLayoutDeltas('version: 1\ntables:\n  sales.orders: { x: 1, y: 2 }\n', [
      { kind: 'position', key: 'sales.orders', value: { x: 3, y: 4 } },
    ]);
    expect(out).toBe('version: 1\ntables:\n  sales:\n    orders: { x: 3, y: 4 }\n');
  });

  it('starts an empty or comment-only document', () => {
    expect(applyLayoutDeltas('', [{ kind: 'position', key: 'public.a', value: { x: 1, y: 2 } }]))
      .toBe('version: 1\ntables:\n  public:\n    a: { x: 1, y: 2 }\n');
    expect(applyLayoutDeltas('# notes to self\n', [{ kind: 'position', key: 'public.a', value: { x: 1, y: 2 } }]))
      .toBe('# notes to self\nversion: 1\ntables:\n  public:\n    a: { x: 1, y: 2 }\n');
  });

  it('refuses text it cannot edit safely', () => {
    const delta = [{ kind: 'position' as const, key: 'public.a', value: { x: 1, y: 2 } }];
    expect(applyLayoutDeltas('version: 1\ntables: [', delta)).toBeNull();
    expect(applyLayoutDeltas('- a list', delta)).toBeNull();
    expect(applyLayoutDeltas('version: 1\ntables: 3', delta)).toBeNull();
    expect(applyLayoutDeltas('version: 1\nrefs: 3', [{ kind: 'route', key: AUTHOR, rails: [1] }])).toBeNull();
    // Nothing to do is not a failure.
    expect(applyLayoutDeltas('version: 1\ntables: [', [])).toBe('version: 1\ntables: [');
  });

  it('turns any snapshot into any other through its diff', () => {
    const target: LayoutSnapshot = {
      positions: {
        'public.users': { x: 8, y: 8 },
        'sales.orders': { x: 16, y: 16 },
        'note:tips': { x: 800, y: 0, w: 200, h: 100 },
      },
      collapsedGroups: ['group:sales.reporting'],
      edgeRoutes: { [refKeyOf('fk', 'public.users(id)', 'sales.orders(user_id)')]: [50] },
    };
    const text = applyLayoutDeltas(serializeLayout(base, 'x.dbml'), diffSnapshots(base, target));
    expect(text).not.toBeNull();
    expect(parseLayout(text!)).toEqual(target);
    expect(text).toContain('# Diagram layout for x.dbml');
  });
});

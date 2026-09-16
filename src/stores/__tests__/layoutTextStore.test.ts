import {
  describe, it, expect, beforeEach,
} from 'vitest';
import { nextTick } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import { MemoryStorage } from '@/utils/persistedRef';
import { refKeyOf } from '@/layout/sidecar';
import { useLayoutStore } from '@/stores/layoutStore';
import { useLayoutTextStore } from '@/stores/layoutTextStore';
import { useParserStore } from '@/stores/parserStore';

const DBML = [
  'Table users { id int [pk] }',
  'Table posts {',
  '  id int [pk]',
  '  author_id int [ref: > users.id]',
  '}',
  'TableGroup content { posts }',
].join('\n');

const AUTHOR = refKeyOf(null, 'public.users(id)', 'public.posts(author_id)');
const USERS_AT_8 = 'version: 1\ntables:\n  public:\n    users: { x: 8, y: 16 }\n';

function setup () {
  // A fresh storage per test: persisted refs would otherwise leak between tests.
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
  setActivePinia(createPinia());
  const parser = useParserStore();
  parser.parseNow(DBML);
  const layout = useLayoutStore();
  const store = useLayoutTextStore();
  return {
    parser,
    layout,
    store,
  };
}

describe('layoutTextStore', () => {
  beforeEach(() => {
    setup();
  });

  it('starts as the diagram\'s layout and applies typed text once checked', () => {
    const { layout, store } = setup();
    expect(store.text).toContain('version: 1');
    expect(store.errors).toEqual([]);

    store.setText(USERS_AT_8);
    // Nothing moves until the typing pause; syncNow stands in for it.
    expect(layout.positions['public.users']).toBeUndefined();
    store.syncNow();
    expect(layout.positions['public.users']).toEqual({ x: 8, y: 16 });
    expect(store.errors).toEqual([]);
    expect(store.warnings).toEqual([]);
  });

  it('writes diagram changes into the text as small edits, keeping what was written by hand', async () => {
    const { layout, store } = setup();
    store.setText(`# mine\n${USERS_AT_8}`);
    store.syncNow();

    layout.setPosition('public.users', { x: 24, y: 32 });
    layout.setPosition('public.posts', { x: 0, y: 64 });
    await nextTick();
    expect(store.text).toBe('# mine\nversion: 1\ntables:\n  public:\n    users: { x: 24, y: 32 }\n    posts: { x: 0, y: 64 }\n');

    layout.toggleGroup('group:public.content');
    layout.setEdgeRoute(AUTHOR, [100, 20, 140]);
    await nextTick();
    expect(store.text).toBe([
      '# mine',
      'version: 1',
      'tables:',
      '  public:',
      '    users: { x: 24, y: 32 }',
      '    posts: { x: 0, y: 64 }',
      'groups:',
      '  public:',
      '    content: { collapsed: true }',
      'refs:',
      '  - from: users(id)',
      '    to: posts(author_id)',
      '    rails: [ 100, 20, 140 ]',
      '',
    ].join('\n'));
    expect(store.errors).toEqual([]);
    expect(store.warnings).toEqual([]);
  });

  it('keeps entries the DBML does not have, with a warning, instead of dropping them', async () => {
    const { layout, store } = setup();
    store.setText('version: 1\ntables:\n  public:\n    ghost: { x: 1, y: 2 }\n    users: { x: 8, y: 16 }\n');
    store.syncNow();
    expect(store.warnings.map((w) => w.message)).toEqual(['Table "ghost" is not in the DBML; its position is ignored']);
    expect(layout.positions).toEqual({ 'public.users': { x: 8, y: 16 } });
    await nextTick();
    expect(store.text).toContain('ghost: { x: 1, y: 2 }');
  });

  it('holds diagram changes while the text has errors and merges them once it parses again', async () => {
    const { layout, store } = setup();
    store.setText(USERS_AT_8);
    store.syncNow();

    store.setText('version: 1\ntables: [\n');
    store.syncNow();
    expect(store.errors).toHaveLength(1);
    expect(layout.positions['public.users']).toEqual({ x: 8, y: 16 });

    layout.setPosition('public.users', { x: 40, y: 48 });
    await nextTick();
    expect(store.outOfSync).toBe(true);
    expect(store.text).toBe('version: 1\ntables: [\n');

    store.setText('version: 1\n');
    store.syncNow();
    expect(store.outOfSync).toBe(false);
    expect(store.errors).toEqual([]);
    expect(store.text).toBe('version: 1\ntables:\n  public:\n    users: { x: 40, y: 48 }\n');
    expect(layout.positions['public.users']).toEqual({ x: 40, y: 48 });
  });

  it('re-checks the text when the schema changes and applies entries that became known', async () => {
    const { parser, layout, store } = setup();
    store.setText('version: 1\ntables:\n  public:\n    later: { x: 5, y: 6 }\n');
    store.syncNow();
    expect(store.warnings).toHaveLength(1);
    expect(layout.positions['public.later']).toBeUndefined();

    parser.parseNow(`${DBML}\nTable later { id int }`);
    await nextTick();
    expect(store.warnings).toEqual([]);
    expect(layout.positions['public.later']).toEqual({ x: 5, y: 6 });
  });

  it('regenerate replaces the text with the canonical file for the diagram', () => {
    const { store } = setup();
    store.setText(`# mine\n${USERS_AT_8}`);
    store.syncNow();
    store.regenerate();
    expect(store.text).toContain('# Diagram layout for schema.dbml');
    expect(store.text).not.toContain('# mine');
    expect(store.text).toContain('users: { x: 8, y: 16 }');
    expect(store.errors).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import type { Database, Ref } from '@dbml/parse';
import { buildDiagramModel } from '@/diagram/adapter/buildModel';
import { compile } from './testUtils';

describe('buildDiagramModel', () => {
  it('returns an empty model for no database', () => {
    const m = buildDiagramModel(undefined);
    expect(m.tables).toEqual([]);
    expect(m.refs).toEqual([]);
    expect(m.deps).toEqual([]);
  });

  it('builds tables, fields, and a single ref for an inline ref', () => {
    const m = buildDiagramModel(compile(`
      Table users { id int [pk] \n email varchar(255) [unique, not null, note: 'login'] }
      Table posts { id int [pk] \n user_id int [ref: > users.id] }
    `));
    expect(m.tables.map((t) => t.key)).toEqual(['public.users', 'public.posts']);
    const users = m.tablesByKey.get('public.users')!;
    expect(users.displayName).toBe('users');
    expect(users.fields[1]!.typeText).toBe('varchar(255)');
    expect(users.fields[1]!.unique).toBe(true);
    expect(users.fields[1]!.notNull).toBe(true);
    expect(users.fields[1]!.note).toBe('login');
    expect(users.token?.start.line).toBe(2);

    expect(m.refs).toHaveLength(1);
    const ref = m.refs[0]!;
    const many = ref.endpoints.find((e) => e.tableKey === 'public.posts')!;
    const one = ref.endpoints.find((e) => e.tableKey === 'public.users')!;
    expect(many.marker).toBe('some');
    expect(many.fieldIndices).toEqual([1]);
    expect(one.marker).toBe('one');
    expect(one.fieldKeys).toEqual(['public.users.id']);
    expect(ref.isSelf).toBe(false);

    expect(m.tablesByKey.get('public.posts')!.fields[1]!.hasRef).toBe(true);
    expect(m.refsByTable.get('public.posts')).toEqual([ref.key]);
    expect(m.refsByField.get('public.users.id')).toEqual([ref.key]);
  });

  it('resolves aliases and schema-qualified names to the same table key', () => {
    const m = buildDiagramModel(compile(`
      Table public.users as U { id int [pk] }
      Table posts { id int [pk] \n user_id int }
      Ref: posts.user_id > U.id
    `));
    expect(m.tablesByKey.has('public.users')).toBe(true);
    expect(m.refs).toHaveLength(1);
    expect(m.refs[0]!.endpoints.map((e) => e.tableKey).sort()).toEqual(['public.posts', 'public.users']);
    expect(m.diagnostics).toEqual([]);
  });

  it('skips an unresolvable ref with a diagnostic and keeps the others', () => {
    const raw = compile(`
      Table a { id int [pk] }
      Table b { id int [pk] \n a_id int [ref: > a.id] }
    `);
    const bogus: Ref = {
      schemaName: null,
      name: 'broken',
      endpoints: [
        {
          schemaName: null,
          tableName: 'missing',
          fieldNames: ['id'],
          relation: '1',
          token: raw.refs[0]!.token,
        },
        {
          schemaName: null,
          tableName: 'a',
          fieldNames: ['id'],
          relation: '*',
          token: raw.refs[0]!.token,
        },
      ],
      token: raw.refs[0]!.token,
    };
    const m = buildDiagramModel({
      ...raw,
      refs: [...raw.refs, bogus],
    } as Database);
    expect(m.refs).toHaveLength(1);
    expect(m.diagnostics).toHaveLength(1);
    expect(m.diagnostics[0]!.kind).toBe('unresolved-ref');
    expect(m.diagnostics[0]!.message).toContain('missing');
  });

  it('marks self references, preserves header colors, and keeps ref rules', () => {
    const m = buildDiagramModel(compile(`
      Table comments [headercolor: #24bab1] { id int [pk] \n parent_id int }
      Ref parent: comments.parent_id > comments.id [delete: cascade, update: no action]
    `));
    expect(m.refs[0]!.isSelf).toBe(true);
    expect(m.refs[0]!.name).toBe('parent');
    expect(m.refs[0]!.onDelete).toBe('cascade');
    expect(m.refs[0]!.onUpdate).toBe('no action');
    expect(m.tables[0]!.headerColor).toBe('#24BAB1');
  });

  it('splices partial fields in declaration order, promotes their inline refs, and records the origin', () => {
    const m = buildDiagramModel(compile(`
      TablePartial base { id int [pk] \n created_at timestamp }
      TablePartial owned { owner_id int [ref: > users.id] }
      Table users { id int [pk] }
      Table posts {
        ~base
        title varchar(200)
        ~owned
      }
    `));
    const posts = m.tablesByKey.get('public.posts')!;
    expect(posts.fields.map((f) => f.name)).toEqual(['id', 'created_at', 'title', 'owner_id']);
    expect(posts.fields.map((f) => f.injectedFrom)).toEqual(['base', 'base', undefined, 'owned']);
    expect(m.refs).toHaveLength(1);
    const ownerEp = m.refs[0]!.endpoints.find((e) => e.tableKey === 'public.posts')!;
    expect(ownerEp.fieldNames).toEqual(['owner_id']);
    expect(ownerEp.marker).toBe('some');
    expect(posts.fields[3]!.hasRef).toBe(true);
  });

  it('collects groups, notes, and enums', () => {
    const m = buildDiagramModel(compile(`
      Enum status { active [note: 'live'] \n retired }
      Table a { id int [pk] \n s status }
      Table b { id int [pk] }
      TableGroup core [color: #1E69FD] { a \n b \n Note: 'core tables' }
      Note hello { 'Hi there' }
    `));
    expect(m.groups).toHaveLength(1);
    expect(m.groups[0]!.tableKeys).toEqual(['public.a', 'public.b']);
    expect(m.groups[0]!.color).toBe('#1E69FD');
    expect(m.groups[0]!.note).toBe('core tables');
    expect(m.tablesByKey.get('public.a')!.groupKey).toBe(m.groups[0]!.key);
    expect(m.notes[0]!.key).toBe('note:hello');
    expect(m.notes[0]!.content).toBe('Hi there');
    const en = m.enums.get('enum:public.status')!;
    expect(en.values.map((v) => v.name)).toEqual(['active', 'retired']);
    expect(en.values[0]!.note).toBe('live');
    expect(m.tablesByKey.get('public.a')!.fields[1]!.enumKey).toBe('enum:public.status');
  });

  it('inherits group colors for headers and colors relationship lines from the one side', () => {
    const m = buildDiagramModel(compile(`
      Table users [headercolor: #1E69FD] { id int [pk] }
      Table posts { id int [pk] \n user_id int [ref: > users.id] }
      Table tags { id int [pk] }
      Table post_tags { post_id int [ref: > posts.id] \n tag_id int [ref: > tags.id] }
      Table profiles { user_id int [pk, ref: - users.id] }
      Ref colored: profiles.user_id > tags.id [color: #CA4242]
      TableGroup content [color: #24BAB1] { posts \n tags \n post_tags }
    `));
    expect(m.tablesByKey.get('public.tags')!.headerColor).toBeNull();
    expect(m.tablesByKey.get('public.tags')!.groupColor).toBe('#24BAB1');
    expect(m.tablesByKey.get('public.users')!.groupColor).toBeNull();

    const lineFor = (a: string, b: string) => m.refs.find((r) => {
      const keys = r.endpoints.map((e) => e.tableKey).sort();
      return keys[0] === a && keys[1] === b;
    })!.lineColor;
    // one side is users (explicit blue)
    expect(lineFor('public.posts', 'public.users')).toBe('#1E69FD');
    // one side is tags, which borrows the group color
    expect(lineFor('public.post_tags', 'public.tags')).toBe('#24BAB1');
    // one-to-one: first endpoint; users is listed first for the inline ref target
    expect(lineFor('public.profiles', 'public.users')).toBe('#1E69FD');
    // explicit color wins
    expect(m.refs.find((r) => r.name === 'colored')!.lineColor).toBe('#CA4242');
  });

  it('captures indexes, composite primary keys, checks, and metadata', () => {
    const m = buildDiagramModel(compile(`
      Table t {
        a int
        b int
        c int [check: \`c > 0\`]
        indexes {
          (a, b) [pk]
          c [unique, name: 'c_idx', type: btree, note: 'fast']
        }
        checks {
          \`a + b > 0\` [name: 'sum_positive']
        }
      }
      Metadata Table t { owner: 'team' }
      Metadata Column t.c { unit: 'usd' }
    `));
    const t = m.tablesByKey.get('public.t')!;
    expect(t.fields.map((f) => f.compositePk)).toEqual([true, true, false]);
    expect(t.fields.map((f) => f.pk)).toEqual([false, false, false]);
    expect(t.indexes).toHaveLength(2);
    expect(t.indexes[0]).toMatchObject({
      columns: ['a', 'b'],
      pk: true,
      unique: false,
    });
    expect(t.indexes[1]).toMatchObject({
      columns: ['c'],
      unique: true,
      name: 'c_idx',
      type: 'btree',
      note: 'fast',
    });
    expect(t.checks).toEqual(['sum_positive: a + b > 0']);
    expect(t.fields[2]!.checks).toEqual(['c > 0']);
    expect(t.metadata).toEqual({ owner: 'team' });
    expect(t.fields[2]!.metadata).toEqual({ unit: 'usd' });
  });

  it('collapses lineage into one edge per table pair and keeps the column mappings', () => {
    const m = buildDiagramModel(compile(`
      Table raw_orders { id int [pk] \n amount decimal }
      Table stg_orders { id int [pk] \n amount decimal [dep: <- raw_orders.amount] }
      Table fct_orders [dep: <- stg_orders] { id int [pk] \n revenue decimal \n n int }
      Dep rollup [color: #8F8DD8] {
        stg_orders.amount -> fct_orders.revenue
        stg_orders.id -> fct_orders.n
        Note: 'sum per order'
        owner: 'finance'
      }
    `));
    // Two inline deps and one block between two table pairs give two table-level edges.
    expect(m.deps.map((d) => d.key).sort()).toEqual([
      'dep:public.raw_orders->public.stg_orders',
      'dep:public.stg_orders->public.fct_orders',
    ]);

    const rollup = m.deps.find((d) => d.key === 'dep:public.stg_orders->public.fct_orders')!;
    expect(rollup.label).toBe('rollup');
    expect(rollup.names).toEqual(['rollup']);
    // Table-level endpoints anchor the edge at the headers.
    expect(rollup.upstream).toEqual({
      tableKey: 'public.stg_orders',
      fieldNames: [],
      fieldKeys: [],
      fieldIndices: [],
    });
    expect(rollup.downstream.tableKey).toBe('public.fct_orders');
    expect(rollup.color).toBe('#8F8DD8');
    expect(rollup.note).toBe('sum per order');
    expect(rollup.metadata).toEqual({ owner: 'finance' });
    // The inline table-level dep adds no column; the block's two mappings do, in order.
    expect(rollup.columns.map((c) => [c.upstream.fieldNames[0], c.downstream.fieldNames[0]])).toEqual([
      ['amount', 'revenue'],
      ['id', 'n'],
    ]);
    expect(rollup.columns[0]!.key).toBe('dep:public.stg_orders(amount)->public.fct_orders(revenue)');
    expect(rollup.columns[0]!.edgeKey).toBe(rollup.key);
    expect(rollup.columns[0]!.label).toBe('rollup');
    expect(rollup.columns[0]!.color).toBe('#8F8DD8');
    expect(rollup.columns[0]!.downstream.fieldKeys).toEqual(['public.fct_orders.revenue']);

    const inline = m.deps.find((d) => d.key === 'dep:public.raw_orders->public.stg_orders')!;
    expect(inline.label).toBeNull();
    expect(inline.columns).toHaveLength(1);
    expect(inline.columns[0]!.color).toBeNull();

    expect(m.tablesByKey.get('public.fct_orders')!.fields[1]!.hasDep).toBe(true);
    // Tables index the table-level edges; fields index the column mappings.
    expect(m.depsByTable.get('public.stg_orders')!.sort()).toEqual([inline.key, rollup.key].sort());
    expect(m.depsByField.get('public.raw_orders.amount')).toEqual([inline.columns[0]!.key]);
    expect(m.depsByField.get('public.fct_orders.n')).toEqual([rollup.columns[1]!.key]);
  });

  it('merges several Dep blocks between the same tables into one labelled edge', () => {
    const m = buildDiagramModel(compile(`
      Table a { x int \n y int }
      Table b { x int \n y int }
      Dep first [color: #CA4242] { a.x -> b.x \n Note: 'one' }
      Dep second { a.y -> b.y \n Note: 'two' }
      Dep: a -> b
    `));
    expect(m.deps).toHaveLength(1);
    const e = m.deps[0]!;
    expect(e.names).toEqual(['first', 'second']);
    expect(e.label).toBe('first, second');
    expect(e.color).toBe('#CA4242');
    expect(e.note).toBe('one\ntwo');
    expect(e.columns.map((c) => c.label)).toEqual(['first', 'second']);
    // A mapping from an uncolored block borrows the edge color.
    expect(e.columns[1]!.color).toBe('#CA4242');
  });
});

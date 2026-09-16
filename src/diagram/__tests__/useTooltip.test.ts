import { describe, it, expect } from 'vitest';
import { buildDiagramModel } from '@/diagram/adapter/buildModel';
import { buildTooltipContent } from '@/diagram/state/useTooltip';
import { compile } from './testUtils';

const lineage = buildDiagramModel(compile(`
  Table comments { id int [pk] \n post_id int \n created_at timestamp }
  Table post_stats { post_id int [pk] \n last_comment_at timestamp }
  Dep post_stats_rollup {
    comments.post_id -> post_stats.post_id
    comments.created_at -> post_stats.last_comment_at
    Note: 'Nightly rollup of comment activity per post'
  }
`));

describe('buildTooltipContent for lineage', () => {
  it('heads a table-level edge with its two tables and lists the column-level mappings', () => {
    const dep = lineage.deps[0]!;
    const c = buildTooltipContent(lineage, { kind: 'dep', key: dep.key })!;
    expect(c.kind).toBe('dep');
    expect(c.title).toBe('comments');
    expect(c.target).toBe('post_stats');
    expect(c.note).toBe('Nightly rollup of comment activity per post');
    expect(c.columns).toEqual(['post_id → post_id', 'created_at → last_comment_at']);
  });

  it('describes a single column mapping with its fields and the block note', () => {
    const col = lineage.deps[0]!.columns[1]!;
    const c = buildTooltipContent(lineage, { kind: 'dep', key: col.key })!;
    expect(c.title).toBe('comments.created_at');
    expect(c.target).toBe('post_stats.last_comment_at');
    expect(c.columns).toBeUndefined();
    expect(c.note).toBe('Nightly rollup of comment activity per post');
  });

  it('returns nothing for an unknown lineage key', () => {
    expect(buildTooltipContent(lineage, { kind: 'dep', key: 'dep:nope' })).toBeNull();
  });
});

describe('buildTooltipContent for relationships, fields, and groups', () => {
  const m = buildDiagramModel(compile(`
    Enum role { admin \n user }
    Table users [note: 'People'] { id int [pk] \n role role [not null, default: 'user', note: 'Access level'] }
    Table posts { id int [pk] \n user_id int }
    Ref author: posts.user_id > users.id [delete: cascade]
    TableGroup identity { users \n posts }
  `));

  it('heads a relationship with both ends and their cardinalities', () => {
    const ref = m.refs[0]!;
    const c = buildTooltipContent(m, { kind: 'ref', key: ref.key })!;
    expect(c.kind).toBe('ref');
    expect(c.subtitle).toBe('author');
    expect([c.title, c.target].sort()).toEqual(['posts.user_id (*)', 'users.id (1)']);
    expect(c.lines).toEqual(['on delete: cascade']);
  });

  it('marks enum-typed fields and lists their settings', () => {
    const c = buildTooltipContent(m, {
      kind: 'field',
      tableKey: 'public.users',
      fieldKey: 'public.users.role',
    })!;
    expect(c.kind).toBe('field');
    expect(c.type).toBe('role');
    expect(c.typeIsEnum).toBe(true);
    expect(c.enumName).toBe('role');
    expect(c.enumValues?.map((v) => v.name)).toEqual(['admin', 'user']);
    expect(c.dbdefault).toBeDefined();
    expect(c.flags).toEqual(['not null']);
    expect(c.note).toBe('Access level');
  });

  it('shows the member count of a group as its subtitle', () => {
    const c = buildTooltipContent(m, { kind: 'group', key: m.groups[0]!.key })!;
    expect(c.kind).toBe('group');
    expect(c.title).toBe('identity');
    expect(c.subtitle).toBe('2 tables');
  });
});

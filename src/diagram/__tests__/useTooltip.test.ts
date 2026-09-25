import { describe, it, expect } from 'vitest';
import { buildDiagramModel } from '@/diagram/adapter/buildModel';
import { buildTooltipContent } from '@/diagram/state/useTooltip';
import { compile } from './testUtils';
import GRAIN from './fixtures/partialGrain.dbml?raw';

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

describe('buildTooltipContent for a partial badge', () => {
  const grain = buildDiagramModel(compile(GRAIN));

  it('lists the refs the partial gives the table with their cardinalities, and its key columns', () => {
    const c = buildTooltipContent(grain, { kind: 'partial', tableKey: 'count.component_count', partial: 'per_config_component' })!;
    expect(c).toEqual({
      kind: 'partial',
      title: 'per_config_component',
      titlePrefix: '~',
      subtitle: 'Table partial',
      refs: [
        'config_id (*) → input.config.config_id (1)',
        'component (*) → input.component.name (1)',
      ],
      primaryKey: '(config_id, component)',
    });
    const site = buildTooltipContent(grain, { kind: 'partial', tableKey: 'input.site', partial: 'per_config' })!;
    expect(site.refs).toEqual(['config_id (1) → input.config.config_id (1)']);
    expect(site.primaryKey).toBe('config_id');
  });

  it('carries the partial\'s note, and says where a ref drawn as a line comes from', () => {
    const m = buildDiagramModel(compile(`
      TablePartial owned {
        owner_id int [ref: > users.id]
        Note: 'Rows belong to a user'
      }
      Table users { id int [pk] }
      Table posts { id int [pk] \n ~owned }
    `));
    const c = buildTooltipContent(m, { kind: 'partial', tableKey: 'public.posts', partial: 'owned' })!;
    expect(c.note).toBe('Rows belong to a user');
    expect(c.primaryKey).toBeUndefined();
    expect(buildTooltipContent(m, { kind: 'ref', key: m.refs[0]!.key })!.lines).toEqual(['from partial owned']);
    expect(buildTooltipContent(m, { kind: 'partial', tableKey: 'public.users', partial: 'owned' })).toBeNull();
  });
});

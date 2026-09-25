import { describe, it, expect } from 'vitest';
import { buildDiagramModel } from '@/diagram/adapter/buildModel';
import { deriveHighlight, sameTarget } from '@/diagram/state/useHover';
import { compile } from './testUtils';
import GRAIN from './fixtures/partialGrain.dbml?raw';

const model = buildDiagramModel(compile(`
  Table users { id int [pk] }
  Table posts { id int [pk] \n user_id int [ref: > users.id] }
  Table stats { post_id int [pk, ref: - posts.id] \n n int }
  Dep rollup { posts.id -> stats.n }
  TableGroup g { posts \n stats }
`));

describe('deriveHighlight', () => {
  it('highlights nothing without a target', () => {
    const h = deriveHighlight(model, null);
    expect(h.refKeys.size).toBe(0);
    expect(h.depKeys.size).toBe(0);
  });

  it('lights up refs, lineage edges, and both endpoints for a table', () => {
    const h = deriveHighlight(model, { kind: 'table', key: 'public.posts' });
    expect(h.refKeys.size).toBe(2);
    expect(h.depKeys.size).toBe(1);
    expect([...h.tableKeys].sort()).toEqual(['public.posts', 'public.stats', 'public.users']);
    expect(h.fieldKeys.has('public.stats.n')).toBe(true);
  });

  it('follows only the hovered field', () => {
    const h = deriveHighlight(model, { kind: 'field', tableKey: 'public.posts', fieldKey: 'public.posts.user_id' });
    expect(h.refKeys.size).toBe(1);
    expect(h.depKeys.size).toBe(0);
    expect(h.depColumnKeys.size).toBe(0);
    expect([...h.tableKeys].sort()).toEqual(['public.posts', 'public.users']);
  });

  it('draws the column mapping and lights its table edge when a mapped field is hovered', () => {
    const dep = model.deps[0]!;
    const h = deriveHighlight(model, { kind: 'field', tableKey: 'public.stats', fieldKey: 'public.stats.n' });
    expect([...h.depColumnKeys]).toEqual([dep.columns[0]!.key]);
    expect([...h.depKeys]).toEqual([dep.key]);
    expect([...h.tableKeys].sort()).toEqual(['public.posts', 'public.stats']);
    expect(h.fieldKeys.has('public.posts.id')).toBe(true);
  });

  it('highlights a table-level lineage edge, its endpoints, and its mapped fields without drawing columns', () => {
    const dep = model.deps[0]!;
    const h = deriveHighlight(model, { kind: 'dep', key: dep.key });
    expect(h.depKeys.has(dep.key)).toBe(true);
    expect(h.depColumnKeys.size).toBe(0);
    expect(h.refKeys.size).toBe(0);
    expect([...h.tableKeys].sort()).toEqual(['public.posts', 'public.stats']);
    expect([...h.fieldKeys].sort()).toEqual(['public.posts.id', 'public.stats.n']);
  });

  it('resolves a hovered column mapping to itself and its table edge', () => {
    const dep = model.deps[0]!;
    const col = dep.columns[0]!;
    const h = deriveHighlight(model, { kind: 'dep', key: col.key });
    expect([...h.depColumnKeys]).toEqual([col.key]);
    expect([...h.depKeys]).toEqual([dep.key]);
    expect([...h.tableKeys].sort()).toEqual(['public.posts', 'public.stats']);
  });

  it('lights nothing for a hovered sticky note but keeps it as the source', () => {
    const h = deriveHighlight(model, { kind: 'note', key: 'note:n' });
    expect(h.tableKeys.size).toBe(0);
    expect(h.refKeys.size).toBe(0);
    expect(h.source?.kind).toBe('note');
  });

  it('highlights the members of a group', () => {
    const h = deriveHighlight(model, { kind: 'group', key: model.groups[0]!.key });
    expect([...h.tableKeys].sort()).toEqual(['public.posts', 'public.stats']);
    expect(h.refKeys.size).toBe(0);
  });
});

describe('deriveHighlight for a partial badge', () => {
  const grain = buildDiagramModel(compile(GRAIN));

  it('lights up the refs the partial gives its table, the tables they reach, and the fields at both ends', () => {
    const h = deriveHighlight(grain, { kind: 'partial', tableKey: 'count.component_count', partial: 'per_config_component' });
    expect([...h.refKeys].sort()).toEqual([
      '#count.component_count(component)->input.component(name)',
      '#count.component_count(config_id)->input.config(config_id)',
    ]);
    expect([...h.tableKeys].sort()).toEqual(['count.component_count', 'input.component', 'input.config']);
    expect([...h.fieldKeys].sort()).toEqual([
      'count.component_count.component',
      'count.component_count.config_id',
      'input.component.name',
      'input.config.config_id',
    ]);
    expect(h.depKeys.size).toBe(0);
  });

  it('tells badges apart by table and partial', () => {
    const a = { kind: 'partial', tableKey: 'input.site', partial: 'per_config' } as const;
    expect(sameTarget(a, { ...a })).toBe(true);
    expect(sameTarget(a, { ...a, tableKey: 'power.dc_power' })).toBe(false);
    expect(sameTarget(a, { kind: 'table', key: 'input.site' })).toBe(false);
    // Other kinds still compare by key.
    expect(sameTarget({ kind: 'table', key: 'input.site' }, { kind: 'table', key: 'input.site' })).toBe(true);
  });
});

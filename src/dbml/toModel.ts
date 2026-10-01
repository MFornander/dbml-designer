import type {
  Check, Column, Database, Index, Ref, RefEndpoint, TablePartial,
} from '@dbml/parse';
import {
  DEFAULT_SCHEMA, enumKey, groupKey, normalizeSchema, tableKey,
  type TableKey,
} from '@/diagram/keys';
import type {
  Model, ModelDep, ModelEdgeEnd, ModelField, ModelGroup, ModelIndex, ModelRef, ModelTable, ModelView,
} from '@/diagram/model';
import type { ModelDiagnostic } from '@/diagram/types';
import { expandPartials } from './expandPartials';
import { toTokenRange } from './token';

/** Shape shared by ref and dep endpoints in the parsed database. */
type RawEndpoint = Pick<RefEndpoint, 'schemaName' | 'tableName' | 'fieldNames'>;

/** `type_name` already carries any `(args)`; only append them if the parser left them out. */
export function formatType (type: Column['type']): string {
  const name = type.type_name ?? '';
  if (type.args && !name.includes('(')) return `${name}(${type.args})`;
  return name;
}

function formatDefault (d: Column['dbdefault']): string | undefined {
  if (!d) return undefined;
  switch (d.type) {
    case 'string':
      return `'${d.value}'`;
    case 'expression':
      return `\`${d.value}\``;
    default:
      return String(d.value);
  }
}

function formatCheck (c: Check): string {
  return c.name ? `${c.name}: ${c.expression}` : c.expression;
}

const indexColumn = (c: Index['columns'][number]): string => (c.type === 'column' ? c.value : `\`${c.value}\``);

function toModelIndex (i: Index): ModelIndex {
  const m: ModelIndex = { columns: i.columns.map(indexColumn) };
  if (i.unique) m.unique = true;
  if (i.pk) m.pk = true;
  if (i.type) m.type = i.type;
  if (i.name) m.name = i.name;
  if (i.note?.value) m.note = i.note.value;
  return m;
}

function stringifyMetadata (m: Record<string, unknown> | undefined): Record<string, string> | undefined {
  if (!m) return undefined;
  const entries = Object.entries(m).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of entries) out[k] = v === null ? 'null' : String(v);
  return out;
}

/** The schema as the model writes it: absent for the default one. */
function schemaOf (schemaName: string | null | undefined): { schema?: string } {
  const schema = normalizeSchema(schemaName);
  return schema === DEFAULT_SCHEMA ? {} : { schema };
}

/** A partial's primary key: its `pk` fields, else the columns of its `pk` index. */
function partialKeyColumns (p: TablePartial): string[] {
  const fields = (p.fields ?? []).filter((f) => f.pk).map((f) => f.name);
  if (fields.length > 0) return fields;
  const index = (p.indexes ?? []).find((i) => i.pk);
  return (index?.columns ?? []).map(indexColumn);
}

/** Anonymous table groups get a stable name from their declaration order. */
export function groupDisplayName (name: string | null | undefined, order: number): string {
  return name && name.length > 0 ? name : `group_${order + 1}`;
}

function toModelField (tableSchema: string, c: Column, enums: ReadonlySet<string>, injectedFrom: string | undefined): ModelField {
  const f: ModelField = {
    name: c.name,
    type: formatType(c.type),
  };
  if (c.pk) f.pk = true;
  if (c.unique) f.unique = true;
  if (c.not_null) f.notNull = true;
  if (c.increment) f.increment = true;
  const def = formatDefault(c.dbdefault);
  if (def !== undefined) f.default = def;
  if (c.note?.value) f.note = c.note.value;
  // The parser does not flag enum types; match the type name against declared enums.
  const bareType = (c.type.type_name ?? '').replace(/\(.*$/, '');
  const candidates = c.type.schemaName ? [c.type.schemaName] : [null, tableSchema];
  const schema = candidates.find((s) => enums.has(enumKey(s, bareType)));
  if (schema !== undefined) f.enum = `${normalizeSchema(schema)}.${bareType}`;
  if (c.checks?.length) f.checks = c.checks.map(formatCheck);
  const meta = stringifyMetadata(c.metadata);
  if (meta) f.metadata = meta;
  if (injectedFrom) f.injectedFrom = injectedFrom;
  const source = toTokenRange(c.token);
  if (source) f.source = source;
  return f;
}

export interface DbmlModel {
  model: Model;
  /** What could not be converted: unknown tables, fields, partials, and groups, and repeated refs. */
  diagnostics: ModelDiagnostic[];
}

/**
 * Convert a database parsed by @dbml/parse to the engine's model. This is where DBML is resolved:
 * `TablePartial`s are spliced into the tables that inject them, aliases and schema-less names are
 * looked up, enum types are recognized, and every element keeps its place in the text as its
 * `source`. Tolerant: anything that cannot be resolved is left out and reported in `diagnostics`.
 */
export function toModel (raw: Database | undefined): DbmlModel {
  const model: Model = { tables: [] };
  const diagnostics: ModelDiagnostic[] = [];
  if (!raw) {
    return {
      model,
      diagnostics,
    };
  }

  const expanded = expandPartials(raw);
  diagnostics.push(...expanded.diagnostics);

  const project = raw.project as { name?: string | null; database_type?: string | null; note?: { value?: string } | null } | undefined;
  if (project) {
    model.project = {
      ...(project.name ? { name: project.name } : {}),
      ...(project.database_type ? { databaseType: project.database_type } : {}),
      ...(project.note?.value ? { note: project.note.value } : {}),
    };
  }

  // Enums
  const enumKeys = new Set<string>();
  if (raw.enums?.length) {
    model.enums = raw.enums.map((e) => {
      enumKeys.add(enumKey(e.schemaName, e.name));
      return {
        ...schemaOf(e.schemaName),
        name: e.name,
        values: e.values.map((v) => ({
          name: v.name,
          ...(v.note?.value ? { note: v.note.value } : {}),
        })),
      };
    });
  }

  // Aliases: Alias declarations, then each table's own `as`, which wins.
  const aliasMap = new Map<string, TableKey>();
  for (const a of raw.aliases ?? []) {
    if (a.kind === 'table') aliasMap.set(a.name, tableKey(a.value.schemaName, a.value.tableName));
  }

  // Tables
  const partialsByName = new Map((raw.tablePartials ?? []).map((p) => [p.name, p]));
  /** Field names of each table, and how messages name the table. */
  const tables = new Map<TableKey, { fields: ReadonlySet<string>; displayName: string }>();
  for (const t of expanded.tables) {
    const key = tableKey(t.schemaName, t.name);
    const schema = normalizeSchema(t.schemaName);
    if (t.alias) aliasMap.set(t.alias, key);
    const injected = expanded.injected.get(key);
    const table: ModelTable = {
      ...schemaOf(t.schemaName),
      name: t.name,
      fields: t.fields.map((c) => toModelField(schema, c, enumKeys, injected?.get(c.name))),
    };
    if (t.alias) table.alias = t.alias;
    if (t.headerColor) table.headerColor = t.headerColor;
    if (t.note?.value) table.note = t.note.value;
    const meta = stringifyMetadata(t.metadata);
    if (meta) table.metadata = meta;
    if (t.indexes?.length) table.indexes = t.indexes.map(toModelIndex);
    if (t.checks?.length) table.checks = t.checks.map(formatCheck);
    if (t.partials?.length) {
      table.partials = [...t.partials].sort((a, b) => a.order - b.order).map((p) => {
        const partial = partialsByName.get(p.name);
        return {
          name: p.name,
          keyColumns: partial ? partialKeyColumns(partial) : [],
          ...(partial?.note?.value ? { note: partial.note.value } : {}),
        };
      });
    }
    const source = toTokenRange(t.token);
    if (source) table.source = source;
    model.tables.push(table);
    tables.set(key, {
      fields: new Set(t.fields.map((c) => c.name)),
      displayName: schema === DEFAULT_SCHEMA ? t.name : `${schema}.${t.name}`,
    });
  }

  const resolveTable = (schemaName: string | null, tableName: string): TableKey | null => {
    const direct = tableKey(schemaName, tableName);
    if (tables.has(direct)) return direct;
    if (!schemaName) {
      const viaAlias = aliasMap.get(tableName);
      if (viaAlias && tables.has(viaAlias)) return viaAlias;
    }
    return null;
  };

  const resolveEndpoint = (ep: RawEndpoint): ModelEdgeEnd | string => {
    const tk = resolveTable(ep.schemaName, ep.tableName);
    if (!tk) return `Table "${ep.tableName}" not found`;
    const table = tables.get(tk)!;
    for (const name of ep.fieldNames) {
      if (!table.fields.has(name)) return `Column "${name}" not found in table "${table.displayName}"`;
    }
    return {
      table: tk,
      fields: [...ep.fieldNames],
    };
  };

  // Table groups
  const groupKeys = new Set<string>();
  (raw.tableGroups ?? []).forEach((g, order) => {
    const name = groupDisplayName(g.name, order);
    const source = toTokenRange(g.token);
    const group: ModelGroup = {
      ...schemaOf(g.schemaName),
      name,
      tables: [],
    };
    for (const member of g.tables) {
      const tk = resolveTable(member.schemaName, member.name);
      if (tk) {
        group.tables.push(tk);
      } else {
        diagnostics.push({
          kind: 'unresolved-group-member',
          message: `Table "${member.name}" in group "${name}" not found`,
          source,
        });
      }
    }
    if (g.color) group.color = g.color;
    if (g.note?.value) group.note = g.note.value;
    const meta = stringifyMetadata(g.metadata);
    if (meta) group.metadata = meta;
    if (source) group.source = source;
    (model.groups ??= []).push(group);
    groupKeys.add(groupKey(g.schemaName, name));
  });

  // Refs: explicit and inline ones, which @dbml/parse already merges, then those partials inject.
  const endKey = (e: ModelEdgeEnd) => `${e.table}(${(e.fields ?? []).join(',')})`;
  const seenPairs = new Set<string>();
  const allRefs: { ref: Ref; partial?: string }[] = [...(raw.refs ?? []).map((ref) => ({ ref })), ...expanded.extraRefs];
  for (const { ref: r, partial } of allRefs) {
    const [rawA, rawB] = r.endpoints;
    if (!rawA || !rawB) continue;
    const source = toTokenRange(r.token);
    const a = resolveEndpoint(rawA);
    const b = resolveEndpoint(rawB);
    if (typeof a === 'string' || typeof b === 'string') {
      diagnostics.push({
        kind: 'unresolved-ref',
        message: typeof a === 'string' ? a : (b as string),
        source,
      });
      continue;
    }
    const pair = [endKey(a), endKey(b)].sort().join('|');
    if (seenPairs.has(pair)) {
      diagnostics.push({
        kind: 'duplicate-ref',
        message: `Duplicate relationship between ${endKey(a)} and ${endKey(b)}`,
        source,
      });
      continue;
    }
    seenPairs.add(pair);
    const ref: ModelRef = {
      from: {
        ...a,
        cardinality: rawA.relation,
      },
      to: {
        ...b,
        cardinality: rawB.relation,
      },
    };
    if (r.name) ref.name = r.name;
    if (r.color) ref.color = r.color;
    if (r.inactive) ref.inactive = true;
    if (r.onDelete) ref.onDelete = r.onDelete;
    if (r.onUpdate) ref.onUpdate = r.onUpdate;
    if (partial) ref.viaPartial = partial;
    if (source) ref.source = source;
    (model.refs ??= []).push(ref);
  }

  // Data lineage: one dep per edge of a Dep block, carrying the block's name, color, note, and metadata.
  for (const dep of raw.deps ?? []) {
    const meta = stringifyMetadata(dep.metadata as Record<string, unknown> | undefined);
    for (const edge of dep.edges ?? []) {
      const source = toTokenRange(edge.token ?? dep.token);
      const up = resolveEndpoint(edge.upstream);
      const down = resolveEndpoint(edge.downstream);
      if (typeof up === 'string' || typeof down === 'string') {
        diagnostics.push({
          kind: 'unresolved-dep',
          message: typeof up === 'string' ? up : (down as string),
          source,
        });
        continue;
      }
      const d: ModelDep = {
        from: up,
        to: down,
      };
      if (dep.name) d.name = dep.name;
      if (dep.color) d.color = dep.color;
      if (dep.note?.value) d.note = dep.note.value;
      if (meta) d.metadata = meta;
      if (source) d.source = source;
      (model.deps ??= []).push(d);
    }
  }

  // Sticky notes
  if (raw.notes?.length) {
    model.notes = raw.notes.map((n) => {
      const source = toTokenRange(n.token);
      return {
        name: n.name,
        content: n.content,
        ...(n.color ? { color: n.color } : {}),
        ...(source ? { source } : {}),
      };
    });
  }

  // Diagram views. Names that resolve to nothing are left out with a diagnostic.
  const noteNames = new Set((raw.notes ?? []).map((n) => n.name));
  for (const v of raw.diagramViews ?? []) {
    const ve = v.visibleEntities;
    const source = toTokenRange(v.token);
    const view: ModelView = { name: v.name };
    const missing = (what: string) => diagnostics.push({
      kind: 'unresolved-view-entity',
      message: `${what} in view "${v.name}" not found`,
      source,
    });
    if (ve?.tables != null) {
      view.tables = [];
      for (const t of ve.tables) {
        const tk = resolveTable(t.schemaName, t.name);
        if (tk) view.tables.push(tk);
        else missing(`Table "${t.name}"`);
      }
    }
    if (ve?.tableGroups != null) {
      view.groups = [];
      for (const g of ve.tableGroups) {
        if (groupKeys.has(groupKey(null, g.name))) view.groups.push(`${DEFAULT_SCHEMA}.${g.name}`);
        else missing(`Table group "${g.name}"`);
      }
    }
    if (ve?.schemas != null) view.schemas = ve.schemas.map((sc) => sc.name);
    if (ve?.stickyNotes != null) {
      view.notes = [];
      for (const n of ve.stickyNotes) {
        if (noteNames.has(n.name)) view.notes.push(n.name);
        else missing(`Note "${n.name}"`);
      }
    }
    if (source) view.source = source;
    (model.views ??= []).push(view);
  }

  return {
    model,
    diagnostics,
  };
}

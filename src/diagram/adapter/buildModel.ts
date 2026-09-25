import {
  isEndpointManySide, isEndpointOneSide,
  type Check, type Column, type Database, type Index, type Ref, type RefEndpoint, type TablePartial,
} from '@dbml/parse';
import {
  DEFAULT_SCHEMA, enumKey, fieldKey, groupDisplayName, groupKey, noteKey, normalizeSchema, tableKey,
  type DepKey, type FieldKey, type RefKey, type TableKey,
} from '../keys';
import {
  emptyModel,
  type DepColumnVM, type DepEdgeVM, type DiagramModel, type DiagramViewVM, type EdgeEndpointVM, type FieldVM, type GroupVM,
  type IndexVM, type RefEndpointVM, type RefVM, type TableVM,
} from '../types';
import { normalizeHexColor } from '../geometry/color';
import { markerKind } from '../geometry/markers';
import { expandPartials } from './expandPartials';
import { toTokenRange } from './token';

/** Shape shared by ref and dep endpoints in the raw model. */
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

function toIndexVM (i: Index): IndexVM {
  const vm: IndexVM = {
    columns: i.columns.map((c) => (c.type === 'column' ? c.value : `\`${c.value}\``)),
    unique: !!i.unique,
    pk: !!i.pk,
  };
  if (i.type) vm.type = i.type;
  if (i.name) vm.name = i.name;
  if (i.note?.value) vm.note = i.note.value;
  return vm;
}

function stringifyMetadata (m: Record<string, unknown> | undefined): Record<string, string> | undefined {
  if (!m) return undefined;
  const entries = Object.entries(m).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of entries) out[k] = v === null ? 'null' : String(v);
  return out;
}

function toFieldVM (
  table: TableKey,
  tableSchema: string,
  c: Column,
  enums: ReadonlySet<string>,
  compositePkColumns: ReadonlySet<string>,
  injectedFrom: string | undefined,
): FieldVM {
  const vm: FieldVM = {
    key: fieldKey(table, c.name),
    name: c.name,
    typeText: formatType(c.type),
    pk: !!c.pk,
    compositePk: compositePkColumns.has(c.name),
    unique: !!c.unique,
    notNull: !!c.not_null,
    increment: !!c.increment,
    hasRef: false,
    hasDep: false,
    token: toTokenRange(c.token),
  };
  // The parser does not flag enum types; match the type name against declared enums.
  const bareType = (c.type.type_name ?? '').replace(/\(.*$/, '');
  const candidates = c.type.schemaName
    ? [enumKey(c.type.schemaName, bareType)]
    : [enumKey(null, bareType), enumKey(tableSchema, bareType)];
  const found = candidates.find((k) => enums.has(k));
  if (found) vm.enumKey = found;
  if (c.note?.value) vm.note = c.note.value;
  const def = formatDefault(c.dbdefault);
  if (def !== undefined) vm.dbdefault = def;
  if (c.checks?.length) vm.checks = c.checks.map(formatCheck);
  const meta = stringifyMetadata(c.metadata);
  if (meta) vm.metadata = meta;
  if (injectedFrom) vm.injectedFrom = injectedFrom;
  return vm;
}

function endpointKeyPart (tk: TableKey, fieldNames: readonly string[]): string {
  return `${tk}(${fieldNames.join(',')})`;
}

/** A partial's primary key: its `pk` fields, else the columns of its `pk` index. */
function partialKeyColumns (p: TablePartial): string[] {
  const fields = (p.fields ?? []).filter((f) => f.pk).map((f) => f.name);
  if (fields.length > 0) return fields;
  const index = (p.indexes ?? []).find((i) => i.pk);
  return (index?.columns ?? []).map((c) => (c.type === 'column' ? c.value : `\`${c.value}\``));
}

/** Effective header color of a table: its own, else its group's. */
function headerColorOf (t: TableVM | undefined): string | null {
  if (!t) return null;
  return t.headerColor ?? t.groupColor ?? null;
}

/**
 * The table whose color a relationship line borrows: the "one" side of a
 * one-to-many, otherwise the first endpoint (matches dbdiagram).
 */
function oneSideTable (endpoints: [RefEndpointVM, RefEndpointVM]): TableKey {
  const [a, b] = endpoints;
  const oneA = isEndpointOneSide(a.cardinality);
  const oneB = isEndpointOneSide(b.cardinality);
  const manyA = isEndpointManySide(a.cardinality);
  const manyB = isEndpointManySide(b.cardinality);
  if (oneA && manyB) return a.tableKey;
  if (oneB && manyA) return b.tableKey;
  return a.tableKey;
}

/**
 * Build the renderer's view model from the raw @dbml/parse database.
 * Tolerant: anything that cannot be resolved is skipped and reported in
 * `diagnostics` instead of failing the whole diagram.
 */
export function buildDiagramModel (raw: Database | undefined): DiagramModel {
  const model = emptyModel();
  if (!raw) return model;

  const expanded = expandPartials(raw);
  model.diagnostics.push(...expanded.diagnostics);

  // Enums
  for (const e of raw.enums ?? []) {
    const key = enumKey(e.schemaName, e.name);
    model.enums.set(key, {
      key,
      name: e.name,
      values: e.values.map((v) => ({
        name: v.name,
        ...(v.note?.value ? { note: v.note.value } : {}),
      })),
    });
  }
  const enumKeys = new Set(model.enums.keys());

  // Aliases (explicit `as` aliases and Alias declarations)
  const aliasMap = new Map<string, TableKey>();
  for (const a of raw.aliases ?? []) {
    if (a.kind === 'table') aliasMap.set(a.name, tableKey(a.value.schemaName, a.value.tableName));
  }

  // Tables
  expanded.tables.forEach((t, order) => {
    const key = tableKey(t.schemaName, t.name);
    const schema = normalizeSchema(t.schemaName);
    if (t.alias) aliasMap.set(t.alias, key);

    const indexes = (t.indexes ?? []).map(toIndexVM);
    const compositePk = new Set<string>();
    for (const i of t.indexes ?? []) {
      if (i.pk) for (const c of i.columns) if (c.type === 'column') compositePk.add(c.value);
    }
    const injected = expanded.injected.get(key);
    const fields = t.fields.map((c) => toFieldVM(key, schema, c, enumKeys, compositePk, injected?.get(c.name)));
    const fieldIndexByName = new Map<string, number>();
    fields.forEach((f, i) => fieldIndexByName.set(f.name, i));

    const vm: TableVM = {
      key,
      schema,
      name: t.name,
      alias: t.alias ?? null,
      displayName: schema === DEFAULT_SCHEMA ? t.name : `${schema}.${t.name}`,
      headerColor: normalizeHexColor(t.headerColor),
      groupColor: null,
      fields,
      fieldIndexByName,
      indexes,
      checks: (t.checks ?? []).map(formatCheck),
      order,
      token: toTokenRange(t.token),
    };
    if (t.note?.value) vm.note = t.note.value;
    const meta = stringifyMetadata(t.metadata);
    if (meta) vm.metadata = meta;
    model.tables.push(vm);
    model.tablesByKey.set(key, vm);
  });

  const resolveTable = (schemaName: string | null, tableName: string): TableKey | null => {
    const direct = tableKey(schemaName, tableName);
    if (model.tablesByKey.has(direct)) return direct;
    if (!schemaName) {
      const viaAlias = aliasMap.get(tableName);
      if (viaAlias && model.tablesByKey.has(viaAlias)) return viaAlias;
    }
    return null;
  };

  const resolveEndpoint = (ep: RawEndpoint): EdgeEndpointVM | string => {
    const tk = resolveTable(ep.schemaName, ep.tableName);
    if (!tk) return `Table "${ep.tableName}" not found`;
    const table = model.tablesByKey.get(tk)!;
    const fieldKeys: FieldKey[] = [];
    const fieldIndices: number[] = [];
    for (const name of ep.fieldNames) {
      const idx = table.fieldIndexByName.get(name);
      if (idx === undefined) return `Column "${name}" not found in table "${table.displayName}"`;
      fieldKeys.push(table.fields[idx]!.key);
      fieldIndices.push(idx);
    }
    return {
      tableKey: tk,
      fieldNames: [...ep.fieldNames],
      fieldKeys,
      fieldIndices,
    };
  };

  const pushIndex = <K>(map: Map<K, string[]>, k: K, edgeKey: string): void => {
    const list = map.get(k);
    if (list) {
      if (!list.includes(edgeKey)) list.push(edgeKey);
    } else {
      map.set(k, [edgeKey]);
    }
  };

  // Table groups
  (raw.tableGroups ?? []).forEach((g, order) => {
    const name = groupDisplayName(g.name, order);
    const key = groupKey(g.schemaName, name);
    const tableKeys: TableKey[] = [];
    for (const member of g.tables) {
      const tk = resolveTable(member.schemaName, member.name);
      if (!tk) {
        model.diagnostics.push({
          kind: 'unresolved-group-member',
          message: `Table "${member.name}" in group "${name}" not found`,
          token: toTokenRange(g.token),
        });
        continue;
      }
      const table = model.tablesByKey.get(tk)!;
      if (table.groupKey && table.groupKey !== key) continue; // first group wins
      table.groupKey = key;
      table.groupColor = normalizeHexColor(g.color);
      if (!tableKeys.includes(tk)) tableKeys.push(tk);
    }
    const vm: GroupVM = {
      key,
      name,
      color: normalizeHexColor(g.color),
      tableKeys,
      order,
      token: toTokenRange(g.token),
    };
    if (g.note?.value) vm.note = g.note.value;
    const meta = stringifyMetadata(g.metadata);
    if (meta) vm.metadata = meta;
    model.groups.push(vm);
  });

  // Refs (explicit and inline refs are already merged by @dbml/parse; partial-injected ones come from expandPartials)
  const seenPairs = new Set<string>();
  const usedKeys = new Set<RefKey>();
  /** Keys of the resolved partial refs, by injecting table and then partial. */
  const partialRefKeys = new Map<TableKey, Map<string, RefKey[]>>();
  const allRefs: { ref: Ref; partial?: string }[] = [...(raw.refs ?? []).map((ref) => ({ ref })), ...expanded.extraRefs];
  for (const { ref: r, partial } of allRefs) {
    const [rawA, rawB] = r.endpoints;
    if (!rawA || !rawB) continue;
    const a = resolveEndpoint(rawA);
    const b = resolveEndpoint(rawB);
    if (typeof a === 'string' || typeof b === 'string') {
      model.diagnostics.push({
        kind: 'unresolved-ref',
        message: typeof a === 'string' ? a : (b as string),
        token: toTokenRange(r.token),
      });
      continue;
    }

    const partA = endpointKeyPart(a.tableKey, a.fieldNames);
    const partB = endpointKeyPart(b.tableKey, b.fieldNames);
    const pair = [partA, partB].sort().join('|');
    if (seenPairs.has(pair)) {
      model.diagnostics.push({
        kind: 'duplicate-ref',
        message: `Duplicate relationship between ${partA} and ${partB}`,
        token: toTokenRange(r.token),
      });
      continue;
    }
    seenPairs.add(pair);

    let key: RefKey = `${r.name ?? ''}#${partA}->${partB}`;
    for (let n = 2; usedKeys.has(key); n++) key = `${r.name ?? ''}#${partA}->${partB}#${n}`;
    usedKeys.add(key);

    const endpoints: [RefEndpointVM, RefEndpointVM] = [
      {
        ...a,
        cardinality: rawA.relation,
        marker: markerKind(rawA.relation),
      },
      {
        ...b,
        cardinality: rawB.relation,
        marker: markerKind(rawB.relation),
      },
    ];
    const explicitColor = normalizeHexColor(r.color);
    const vm: RefVM = {
      key,
      name: r.name ?? null,
      endpoints,
      color: explicitColor,
      lineColor: explicitColor ?? headerColorOf(model.tablesByKey.get(oneSideTable(endpoints))),
      inactive: !!r.inactive,
      isSelf: a.tableKey === b.tableKey,
      token: toTokenRange(r.token),
    };
    if (r.onDelete) vm.onDelete = r.onDelete;
    if (r.onUpdate) vm.onUpdate = r.onUpdate;
    if (partial) {
      vm.viaPartial = partial;
      const byPartial = partialRefKeys.get(a.tableKey) ?? new Map<string, RefKey[]>();
      partialRefKeys.set(a.tableKey, byPartial);
      pushIndex(byPartial, partial, key);
    }
    model.refs.push(vm);

    for (const ep of vm.endpoints) {
      pushIndex(model.refsByTable, ep.tableKey, key);
      const table = model.tablesByKey.get(ep.tableKey)!;
      for (const idx of ep.fieldIndices) {
        const field = table.fields[idx]!;
        field.hasRef = true;
        pushIndex(model.refsByField, field.key, key);
      }
    }
  }

  // What each table's header badges stand for: the resolved refs of every partial it injects, in injection order.
  const partialsByName = new Map((raw.tablePartials ?? []).map((p) => [p.name, p]));
  for (const t of expanded.tables) {
    const key = tableKey(t.schemaName, t.name);
    const byPartial = partialRefKeys.get(key);
    const table = model.tablesByKey.get(key);
    if (!byPartial || !table) continue;
    const injected = [...(t.partials ?? [])].sort((a, b) => a.order - b.order).map((p) => p.name);
    table.partialRefs = [...new Set(injected)].filter((name) => byPartial.has(name)).map((name) => {
      const p = partialsByName.get(name);
      return {
        partial: name,
        refKeys: byPartial.get(name)!,
        keyColumns: p ? partialKeyColumns(p) : [],
        ...(p?.note?.value ? { note: p.note.value } : {}),
      };
    });
  }

  // Data lineage. Every Dep edge between the same pair of tables, whether from one Dep block,
  // several, or inline `dep` settings, collapses into one table-level edge drawn between the
  // headers, like dbdiagram. Column-level mappings stay on the edge for its tooltip and are
  // drawn on their own only while one of their fields is hovered.
  const depEdgeByPair = new Map<string, DepEdgeVM>();
  const depNotes = new Map<DepKey, Set<string>>();
  const seenColumns = new Set<string>();
  const tableEndpoint = (tk: TableKey): EdgeEndpointVM => ({
    tableKey: tk,
    fieldNames: [],
    fieldKeys: [],
    fieldIndices: [],
  });
  for (const dep of raw.deps ?? []) {
    const name = dep.name ?? null;
    const color = normalizeHexColor(dep.color);
    const note = dep.note?.value ?? '';
    const meta = stringifyMetadata(dep.metadata as Record<string, unknown> | undefined);
    /** Edges this block has already given its name, color, note, and metadata to. */
    const touched = new Set<DepKey>();

    for (const edge of dep.edges ?? []) {
      const up = resolveEndpoint(edge.upstream);
      const down = resolveEndpoint(edge.downstream);
      const token = toTokenRange(edge.token ?? dep.token);
      if (typeof up === 'string' || typeof down === 'string') {
        model.diagnostics.push({
          kind: 'unresolved-dep',
          message: typeof up === 'string' ? up : (down as string),
          token,
        });
        continue;
      }

      const pair = `${up.tableKey}->${down.tableKey}`;
      let vm = depEdgeByPair.get(pair);
      if (!vm) {
        vm = {
          key: `dep:${pair}`,
          label: null,
          names: [],
          upstream: tableEndpoint(up.tableKey),
          downstream: tableEndpoint(down.tableKey),
          columns: [],
          color: null,
          isSelf: up.tableKey === down.tableKey,
          token,
        };
        depEdgeByPair.set(pair, vm);
        model.deps.push(vm);
        pushIndex(model.depsByTable, up.tableKey, vm.key);
        pushIndex(model.depsByTable, down.tableKey, vm.key);
      }
      if (!touched.has(vm.key)) {
        touched.add(vm.key);
        if (name && !vm.names.includes(name)) {
          vm.names.push(name);
          vm.label = vm.names.join(', ');
        }
        vm.color ??= color;
        if (note) {
          const notes = depNotes.get(vm.key) ?? new Set<string>();
          notes.add(note);
          depNotes.set(vm.key, notes);
          vm.note = [...notes].join('\n');
        }
        if (meta) {
          vm.metadata = {
            ...vm.metadata,
            ...meta,
          };
        }
      }

      // A table-level edge adds nothing beyond the pair itself.
      if (up.fieldNames.length === 0 && down.fieldNames.length === 0) continue;
      const directed = `${endpointKeyPart(up.tableKey, up.fieldNames)}->${endpointKeyPart(down.tableKey, down.fieldNames)}`;
      if (seenColumns.has(directed)) continue;
      seenColumns.add(directed);
      const column: DepColumnVM = {
        key: `dep:${directed}`,
        edgeKey: vm.key,
        label: name,
        upstream: up,
        downstream: down,
        color,
        isSelf: vm.isSelf,
        token,
      };
      vm.columns.push(column);
      for (const ep of [up, down]) {
        const table = model.tablesByKey.get(ep.tableKey)!;
        for (const idx of ep.fieldIndices) {
          const field = table.fields[idx]!;
          field.hasDep = true;
          pushIndex(model.depsByField, field.key, column.key);
        }
      }
    }
  }
  // Mappings from an uncolored block borrow the color of their edge.
  for (const vm of model.deps) {
    for (const c of vm.columns) c.color ??= vm.color;
  }

  // Sticky notes
  (raw.notes ?? []).forEach((n, order) => {
    model.notes.push({
      key: noteKey(n.name),
      name: n.name,
      content: n.content,
      color: normalizeHexColor(n.color),
      order,
      token: toTokenRange(n.token),
    });
  });

  // Diagram views: what each `DiagramView` block shows. Names that resolve to nothing are dropped with a diagnostic.
  for (const v of raw.diagramViews ?? []) {
    const ve = v.visibleEntities;
    const view: DiagramViewVM = {
      key: `view:${v.name}`,
      name: v.name,
      tableKeys: [],
      groupKeys: [],
      noteKeys: [],
      schemas: (ve?.schemas ?? []).map((sc) => sc.name),
      filtersTables: ve?.tables != null || ve?.tableGroups != null || ve?.schemas != null,
      filtersNotes: ve?.stickyNotes != null,
      token: toTokenRange(v.token),
    };
    const missing = (what: string) => model.diagnostics.push({
      kind: 'unresolved-view-entity',
      message: `${what} in view "${v.name}" not found`,
      token: view.token,
    });
    for (const t of ve?.tables ?? []) {
      const tk = resolveTable(t.schemaName, t.name);
      if (tk) view.tableKeys.push(tk);
      else missing(`Table "${t.name}"`);
    }
    for (const g of ve?.tableGroups ?? []) {
      const gk = groupKey(null, g.name);
      if (model.groups.some((x) => x.key === gk)) view.groupKeys.push(gk);
      else missing(`Table group "${g.name}"`);
    }
    for (const n of ve?.stickyNotes ?? []) {
      const nk = noteKey(n.name);
      if (model.notes.some((x) => x.key === nk)) view.noteKeys.push(nk);
      else missing(`Note "${n.name}"`);
    }
    model.views.push(view);
  }

  return model;
}

import {
  DEFAULT_SCHEMA, enumKey, fieldKey, groupKey, noteKey, normalizeSchema, tableKey,
  type DepKey, type FieldKey, type GroupKey, type NoteKey, type RefKey, type TableKey,
} from './keys';
import type {
  Model, ModelDep, ModelEdgeEnd, ModelField, ModelRef, ModelRefEnd, ModelTable,
} from './model';
import {
  emptyModel,
  type DepColumnVM, type DepEdgeVM, type DiagramModel, type DiagramViewVM, type EdgeEndpointVM, type FieldVM, type GroupVM,
  type IndexVM, type ModelDiagnostic, type RefEndpointVM, type RefVM, type TableVM,
} from './types';
import { normalizeHexColor } from './geometry/color';
import { markerKind } from './geometry/markers';
import { isManySide, isOneSide } from './multiplicity';

/** The cardinality of an end that does not say. */
const DEFAULT_CARDINALITY = '1';

function endpointKeyPart (tk: TableKey, fieldNames: readonly string[]): string {
  return `${tk}(${fieldNames.join(',')})`;
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
  const oneA = isOneSide(a.cardinality);
  const oneB = isOneSide(b.cardinality);
  const manyA = isManySide(a.cardinality);
  const manyB = isManySide(b.cardinality);
  if (oneA && manyB) return a.tableKey;
  if (oneB && manyA) return b.tableKey;
  return a.tableKey;
}

function pushIndex<K> (map: Map<K, string[]>, k: K, edgeKey: string): void {
  const list = map.get(k);
  if (list) {
    if (!list.includes(edgeKey)) list.push(edgeKey);
  } else {
    map.set(k, [edgeKey]);
  }
}

/** Key of a group or enum given as `schema.name`, or as a bare name in the default schema. */
function qualifiedKey (make: (schema: string | null, name: string) => string, qualified: string): string {
  const dot = qualified.indexOf('.');
  return dot < 0 ? make(null, qualified) : make(qualified.slice(0, dot), qualified.slice(dot + 1));
}

function toFieldVM (table: TableKey, f: ModelField, compositePk: ReadonlySet<string>, enums: ReadonlySet<string>): FieldVM {
  const vm: FieldVM = {
    key: fieldKey(table, f.name),
    name: f.name,
    typeText: f.type,
    pk: !!f.pk,
    compositePk: compositePk.has(f.name),
    unique: !!f.unique,
    notNull: !!f.notNull,
    increment: !!f.increment,
    hasRef: false,
    hasDep: false,
  };
  if (f.source !== undefined) vm.source = f.source;
  if (f.enum !== undefined) {
    const key = qualifiedKey(enumKey, f.enum);
    if (enums.has(key)) vm.enumKey = key;
  }
  if (f.note) vm.note = f.note;
  if (f.default !== undefined) vm.dbdefault = f.default;
  if (f.checks?.length) vm.checks = [...f.checks];
  if (f.metadata && Object.keys(f.metadata).length > 0) vm.metadata = { ...f.metadata };
  if (f.injectedFrom) vm.injectedFrom = f.injectedFrom;
  return vm;
}

function toTableVM (t: ModelTable, order: number, enums: ReadonlySet<string>): TableVM {
  const key = tableKey(t.schema, t.name);
  const schema = normalizeSchema(t.schema);
  const indexes: IndexVM[] = (t.indexes ?? []).map((i) => {
    const vm: IndexVM = {
      columns: [...i.columns],
      unique: !!i.unique,
      pk: !!i.pk,
    };
    if (i.type) vm.type = i.type;
    if (i.name) vm.name = i.name;
    if (i.note) vm.note = i.note;
    return vm;
  });
  const compositePk = new Set<string>();
  for (const i of t.indexes ?? []) if (i.pk) for (const c of i.columns) compositePk.add(c);
  const fields = t.fields.map((f) => toFieldVM(key, f, compositePk, enums));
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
    checks: [...(t.checks ?? [])],
    order,
  };
  if (t.source !== undefined) vm.source = t.source;
  if (t.note) vm.note = t.note;
  if (t.metadata && Object.keys(t.metadata).length > 0) vm.metadata = { ...t.metadata };
  return vm;
}

/**
 * Index a model into the view model the renderer draws: keys, lookups, which fields carry refs
 * and lineage, table-level lineage edges folded from the column-level ones, group colors, and
 * partial-ref badges. Tolerant: an element that names a table, field, group, or note that is not
 * there is left out and reported in `diagnostics` with its `source`, so a host's mistake costs
 * that element and not the diagram.
 */
export function fromModel (input: Model | null | undefined): DiagramModel {
  const model = emptyModel();
  if (!input) return model;
  const diagnostics: ModelDiagnostic[] = model.diagnostics;

  // Enums
  for (const e of input.enums ?? []) {
    const key = enumKey(e.schema, e.name);
    model.enums.set(key, {
      key,
      name: e.name,
      values: e.values.map((v) => ({
        name: v.name,
        ...(v.note ? { note: v.note } : {}),
      })),
    });
  }
  const enumKeys = new Set(model.enums.keys());

  // Tables
  input.tables.forEach((t, order) => {
    const vm = toTableVM(t, order, enumKeys);
    if (model.tablesByKey.has(vm.key)) {
      diagnostics.push({
        kind: 'duplicate-table',
        message: `Duplicate table "${vm.key}"`,
        ...(t.source !== undefined ? { source: t.source } : {}),
      });
      return;
    }
    model.tables.push(vm);
    model.tablesByKey.set(vm.key, vm);
  });

  const resolveEndpoint = (ep: ModelEdgeEnd): EdgeEndpointVM | string => {
    const table = model.tablesByKey.get(ep.table);
    if (!table) return `Table "${ep.table}" not found`;
    const fieldNames = ep.fields ?? [];
    const fieldKeys: FieldKey[] = [];
    const fieldIndices: number[] = [];
    for (const name of fieldNames) {
      const idx = table.fieldIndexByName.get(name);
      if (idx === undefined) return `Column "${name}" not found in table "${table.displayName}"`;
      fieldKeys.push(table.fields[idx]!.key);
      fieldIndices.push(idx);
    }
    return {
      tableKey: table.key,
      fieldNames: [...fieldNames],
      fieldKeys,
      fieldIndices,
    };
  };

  // Table groups; a table belongs to the first group that lists it.
  (input.groups ?? []).forEach((g, order) => {
    const key = groupKey(g.schema, g.name);
    const color = normalizeHexColor(g.color);
    const tableKeys: TableKey[] = [];
    for (const member of g.tables) {
      const table = model.tablesByKey.get(member);
      if (!table) {
        diagnostics.push({
          kind: 'unresolved-group-member',
          message: `Table "${member}" in group "${g.name}" not found`,
          ...(g.source !== undefined ? { source: g.source } : {}),
        });
        continue;
      }
      if (table.groupKey && table.groupKey !== key) continue;
      table.groupKey = key;
      table.groupColor = color;
      if (!tableKeys.includes(member)) tableKeys.push(member);
    }
    const vm: GroupVM = {
      key,
      name: g.name,
      color,
      tableKeys,
      order,
    };
    if (g.source !== undefined) vm.source = g.source;
    if (g.note) vm.note = g.note;
    if (g.metadata && Object.keys(g.metadata).length > 0) vm.metadata = { ...g.metadata };
    model.groups.push(vm);
  });

  // Refs
  const seenPairs = new Set<string>();
  const usedKeys = new Set<RefKey>();
  /** Keys of the partial refs, by injecting table and then partial. */
  const partialRefKeys = new Map<TableKey, Map<string, RefKey[]>>();
  for (const r of input.refs ?? []) addRef(r);

  function addRef (r: ModelRef): void {
    const sourced = r.source !== undefined ? { source: r.source } : {};
    const a = resolveEndpoint(r.from);
    const b = resolveEndpoint(r.to);
    if (typeof a === 'string' || typeof b === 'string') {
      diagnostics.push({
        kind: 'unresolved-ref',
        message: typeof a === 'string' ? a : (b as string),
        ...sourced,
      });
      return;
    }
    const partA = endpointKeyPart(a.tableKey, a.fieldNames);
    const partB = endpointKeyPart(b.tableKey, b.fieldNames);
    const pair = [partA, partB].sort().join('|');
    if (seenPairs.has(pair)) {
      diagnostics.push({
        kind: 'duplicate-ref',
        message: `Duplicate relationship between ${partA} and ${partB}`,
        ...sourced,
      });
      return;
    }
    seenPairs.add(pair);

    let key: RefKey = `${r.name ?? ''}#${partA}->${partB}`;
    for (let n = 2; usedKeys.has(key); n++) key = `${r.name ?? ''}#${partA}->${partB}#${n}`;
    usedKeys.add(key);

    const end = (e: EdgeEndpointVM, m: ModelRefEnd): RefEndpointVM => {
      const cardinality = m.cardinality ?? DEFAULT_CARDINALITY;
      return {
        ...e,
        cardinality,
        marker: markerKind(cardinality),
      };
    };
    const endpoints: [RefEndpointVM, RefEndpointVM] = [end(a, r.from), end(b, r.to)];
    const explicitColor = normalizeHexColor(r.color);
    const vm: RefVM = {
      key,
      name: r.name ?? null,
      endpoints,
      color: explicitColor,
      lineColor: explicitColor ?? headerColorOf(model.tablesByKey.get(oneSideTable(endpoints))),
      inactive: !!r.inactive,
      isSelf: a.tableKey === b.tableKey,
      ...sourced,
    };
    if (r.onDelete) vm.onDelete = r.onDelete;
    if (r.onUpdate) vm.onUpdate = r.onUpdate;
    if (r.viaPartial) {
      vm.viaPartial = r.viaPartial;
      const byPartial = partialRefKeys.get(a.tableKey) ?? new Map<string, RefKey[]>();
      partialRefKeys.set(a.tableKey, byPartial);
      pushIndex(byPartial, r.viaPartial, key);
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

  // What each table's header badges stand for: the refs of every partial it injects that has any, in injection order.
  for (const t of input.tables) {
    const key = tableKey(t.schema, t.name);
    const byPartial = partialRefKeys.get(key);
    const table = model.tablesByKey.get(key);
    if (!byPartial || !table || !t.partials) continue;
    const seen = new Set<string>();
    table.partialRefs = t.partials.filter((p) => {
      if (seen.has(p.name) || !byPartial.has(p.name)) return false;
      seen.add(p.name);
      return true;
    }).map((p) => ({
      partial: p.name,
      refKeys: byPartial.get(p.name)!,
      keyColumns: [...(p.keyColumns ?? [])],
      ...(p.note ? { note: p.note } : {}),
    }));
  }

  // Data lineage. Every dep between the same two tables collapses into one table-level edge drawn
  // between the headers, like dbdiagram. Column-level mappings stay on the edge for its tooltip
  // and are drawn on their own only while one of their fields is hovered.
  const depEdgeByPair = new Map<string, DepEdgeVM>();
  const depNotes = new Map<DepKey, Set<string>>();
  const seenColumns = new Set<string>();
  const tableEndpoint = (tk: TableKey): EdgeEndpointVM => ({
    tableKey: tk,
    fieldNames: [],
    fieldKeys: [],
    fieldIndices: [],
  });
  for (const dep of input.deps ?? []) addDep(dep);

  function addDep (dep: ModelDep): void {
    const sourced = dep.source !== undefined ? { source: dep.source } : {};
    const up = resolveEndpoint(dep.from);
    const down = resolveEndpoint(dep.to);
    if (typeof up === 'string' || typeof down === 'string') {
      diagnostics.push({
        kind: 'unresolved-dep',
        message: typeof up === 'string' ? up : (down as string),
        ...sourced,
      });
      return;
    }
    const name = dep.name ?? null;
    const color = normalizeHexColor(dep.color);
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
        ...sourced,
      };
      depEdgeByPair.set(pair, vm);
      model.deps.push(vm);
      pushIndex(model.depsByTable, up.tableKey, vm.key);
      pushIndex(model.depsByTable, down.tableKey, vm.key);
    }
    if (name && !vm.names.includes(name)) {
      vm.names.push(name);
      vm.label = vm.names.join(', ');
    }
    vm.color ??= color;
    if (dep.note) {
      const notes = depNotes.get(vm.key) ?? new Set<string>();
      notes.add(dep.note);
      depNotes.set(vm.key, notes);
      vm.note = [...notes].join('\n');
    }
    if (dep.metadata && Object.keys(dep.metadata).length > 0) {
      vm.metadata = {
        ...vm.metadata,
        ...dep.metadata,
      };
    }

    // A table-level edge adds nothing beyond the pair itself.
    if (up.fieldNames.length === 0 && down.fieldNames.length === 0) return;
    const directed = `${endpointKeyPart(up.tableKey, up.fieldNames)}->${endpointKeyPart(down.tableKey, down.fieldNames)}`;
    if (seenColumns.has(directed)) return;
    seenColumns.add(directed);
    const column: DepColumnVM = {
      key: `dep:${directed}`,
      edgeKey: vm.key,
      label: name,
      upstream: up,
      downstream: down,
      color,
      isSelf: vm.isSelf,
      ...sourced,
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
  // Mappings without a color of their own borrow the color of their edge.
  for (const vm of model.deps) {
    for (const c of vm.columns) c.color ??= vm.color;
  }

  // Sticky notes
  (input.notes ?? []).forEach((n, order) => {
    model.notes.push({
      key: noteKey(n.name),
      name: n.name,
      content: n.content,
      color: normalizeHexColor(n.color),
      order,
      ...(n.source !== undefined ? { source: n.source } : {}),
    });
  });

  // Views: what each shows. Names that resolve to nothing are left out with a diagnostic.
  const groupKeys = new Set<GroupKey>(model.groups.map((g) => g.key));
  const noteKeys = new Set<NoteKey>(model.notes.map((n) => n.key));
  for (const v of input.views ?? []) {
    const sourced = v.source !== undefined ? { source: v.source } : {};
    const view: DiagramViewVM = {
      key: `view:${v.name}`,
      name: v.name,
      tableKeys: [],
      groupKeys: [],
      noteKeys: [],
      schemas: [...(v.schemas ?? [])],
      filtersTables: v.tables !== undefined || v.groups !== undefined || v.schemas !== undefined,
      filtersNotes: v.notes !== undefined,
      ...sourced,
    };
    const missing = (what: string) => diagnostics.push({
      kind: 'unresolved-view-entity',
      message: `${what} in view "${v.name}" not found`,
      ...sourced,
    });
    for (const tk of v.tables ?? []) {
      if (model.tablesByKey.has(tk)) view.tableKeys.push(tk);
      else missing(`Table "${tk}"`);
    }
    for (const g of v.groups ?? []) {
      const gk = qualifiedKey(groupKey, g);
      if (groupKeys.has(gk)) view.groupKeys.push(gk);
      else missing(`Table group "${g}"`);
    }
    for (const n of v.notes ?? []) {
      const nk = noteKey(n);
      if (noteKeys.has(nk)) view.noteKeys.push(nk);
      else missing(`Note "${n}"`);
    }
    model.views.push(view);
  }

  return model;
}

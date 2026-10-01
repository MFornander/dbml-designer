import {
  computed, shallowRef, watch, type Ref,
} from 'vue';
import type { DiagramModel } from '../types';
import {
  cellKey, type DepKey, type FieldKey, type GroupKey, type NoteKey, type RefKey, type TableKey,
} from '../keys';

export type HoverTarget =
  | { kind: 'table'; key: TableKey }
  /** A field, or with `row` one cell of its table's grid: the field in that record, by its index in the table's `records`. */
  | { kind: 'field'; tableKey: TableKey; fieldKey: FieldKey; row?: number }
  /** A partial badge in a table header: the refs that partial gives the table. */
  | { kind: 'partial'; tableKey: TableKey; partial: string }
  /** A chip the host put in a table header (see `Engine.setChips`), by its id. */
  | { kind: 'chip'; tableKey: TableKey; chip: string }
  /** A companion's badge in its owner's header (see `ModelTable.companionOf`): the owner and the companion, by key. */
  | { kind: 'companion'; tableKey: TableKey; companion: TableKey }
  | { kind: 'ref'; key: RefKey }
  | { kind: 'dep'; key: DepKey }
  | { kind: 'group'; key: GroupKey }
  | { kind: 'note'; key: NoteKey };

export interface HighlightSet {
  refKeys: ReadonlySet<RefKey>;
  /** Table-level lineage edges. */
  depKeys: ReadonlySet<DepKey>;
  /** Column-level lineage mappings, drawn only while one of their fields is hovered or pinned. */
  depColumnKeys: ReadonlySet<DepKey>;
  tableKeys: ReadonlySet<TableKey>;
  fieldKeys: ReadonlySet<FieldKey>;
  /** Cells of tables' grids, by cell key: those a hovered cell's records lead to, or a hovered lineage's records. */
  cellKeys: ReadonlySet<string>;
  source: HoverTarget | null;
}

const EMPTY: HighlightSet = {
  refKeys: new Set(),
  depKeys: new Set(),
  depColumnKeys: new Set(),
  tableKeys: new Set(),
  fieldKeys: new Set(),
  cellKeys: new Set(),
  source: null,
};

/** Refs, lineage edges, tables, and fields connected to the hovered element. Pure. */
export function deriveHighlight (model: DiagramModel, target: HoverTarget | null): HighlightSet {
  if (!target) return EMPTY;
  const refKeys = new Set<RefKey>();
  const depKeys = new Set<DepKey>();
  const depColumnKeys = new Set<DepKey>();
  const tableKeys = new Set<TableKey>();
  const fieldKeys = new Set<FieldKey>();
  const cellKeys = new Set<string>();
  /** The record of a hovered cell. */
  const row = target.kind === 'field' ? target.row : undefined;
  if (target.kind === 'field' && row !== undefined) cellKeys.add(cellKey(target.fieldKey, row));

  let refList: RefKey[] = [];
  /** Table-level lineage edges to light up. */
  let depList: DepKey[] = [];
  /** Column-level mappings to draw. A hovered `dep` key may be either kind. */
  let columnList: DepKey[] = [];
  switch (target.kind) {
    case 'table':
      tableKeys.add(target.key);
      refList = model.refsByTable.get(target.key) ?? [];
      depList = model.depsByTable.get(target.key) ?? [];
      break;
    // A chip lights up its table as the header around it does.
    case 'chip':
      tableKeys.add(target.tableKey);
      refList = model.refsByTable.get(target.tableKey) ?? [];
      depList = model.depsByTable.get(target.tableKey) ?? [];
      break;
    // A companion's badge lights up its owner, and the companion while it is shown.
    case 'companion':
      tableKeys.add(target.tableKey);
      tableKeys.add(target.companion);
      break;
    case 'field':
      tableKeys.add(target.tableKey);
      fieldKeys.add(target.fieldKey);
      refList = model.refsByField.get(target.fieldKey) ?? [];
      columnList = model.depsByField.get(target.fieldKey) ?? [];
      break;
    case 'partial':
      tableKeys.add(target.tableKey);
      refList = model.tablesByKey.get(target.tableKey)?.partialRefs?.find((p) => p.partial === target.partial)?.refKeys ?? [];
      break;
    case 'ref':
      refList = [target.key];
      break;
    case 'dep':
      depList = [target.key];
      columnList = [target.key];
      break;
    case 'group': {
      const group = model.groups.find((g) => g.key === target.key);
      for (const k of group?.tableKeys ?? []) tableKeys.add(k);
      break;
    }
    default:
      break;
  }

  const refsByKey = new Map(model.refs.map((r) => [r.key, r]));
  for (const rk of refList) {
    const ref = refsByKey.get(rk);
    if (!ref) continue;
    refKeys.add(rk);
    for (const ep of ref.endpoints) {
      tableKeys.add(ep.tableKey);
      for (const fk of ep.fieldKeys) fieldKeys.add(fk);
    }
  }

  const depsByKey = new Map(model.deps.map((d) => [d.key, d]));
  for (const dk of depList) {
    const dep = depsByKey.get(dk);
    if (!dep) continue;
    depKeys.add(dk);
    tableKeys.add(dep.upstream.tableKey);
    tableKeys.add(dep.downstream.tableKey);
    // The mapped fields light up as well, so the tooltip's column list has a visual counterpart.
    for (const c of dep.columns) {
      for (const ep of [c.upstream, c.downstream]) {
        for (const fk of ep.fieldKeys) fieldKeys.add(fk);
      }
    }
  }

  const columnsByKey = new Map(model.deps.flatMap((d) => d.columns).map((c) => [c.key, c]));
  for (const ck of columnList) {
    const col = columnsByKey.get(ck);
    if (!col) continue;
    // The records the column pair joins; a hovered cell follows only those it is one of.
    let pairs = col.mappings.flatMap((m) => m.rows ?? []);
    if (target.kind === 'field' && row !== undefined && pairs.length) {
      const up = col.upstream.fieldKeys.includes(target.fieldKey);
      const down = col.downstream.fieldKeys.includes(target.fieldKey);
      pairs = pairs.filter(([a, b]) => (up && a === row) || (down && b === row));
      if (!pairs.length) continue;
    }
    for (const [a, b] of pairs) {
      if (a !== null) for (const fk of col.upstream.fieldKeys) cellKeys.add(cellKey(fk, a));
      if (b !== null) for (const fk of col.downstream.fieldKeys) cellKeys.add(cellKey(fk, b));
    }
    depColumnKeys.add(ck);
    depKeys.add(col.edgeKey);
    for (const ep of [col.upstream, col.downstream]) {
      tableKeys.add(ep.tableKey);
      for (const fk of ep.fieldKeys) fieldKeys.add(fk);
    }
  }

  return {
    refKeys,
    depKeys,
    depColumnKeys,
    tableKeys,
    fieldKeys,
    cellKeys,
    source: target,
  };
}

export function sameTarget (a: HoverTarget | null, b: HoverTarget | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'field' && b.kind === 'field') return a.fieldKey === b.fieldKey && a.row === b.row;
  if (a.kind === 'partial' && b.kind === 'partial') return a.tableKey === b.tableKey && a.partial === b.partial;
  if (a.kind === 'chip' && b.kind === 'chip') return a.tableKey === b.tableKey && a.chip === b.chip;
  if (a.kind === 'companion' && b.kind === 'companion') return a.companion === b.companion;
  if ('key' in a && 'key' in b) return a.key === b.key;
  return false;
}

/** Whether the model still has what a target points at. */
export function targetExists (model: DiagramModel, t: HoverTarget): boolean {
  switch (t.kind) {
    case 'table':
      return model.tablesByKey.has(t.key);
    case 'field':
      return model.tablesByKey.get(t.tableKey)?.fields.some((f) => f.key === t.fieldKey) ?? false;
    case 'partial':
      return model.tablesByKey.get(t.tableKey)?.partialRefs?.some((p) => p.partial === t.partial) ?? false;
    case 'chip':
      return model.tablesByKey.has(t.tableKey);
    case 'companion':
      return model.tablesByKey.get(t.companion)?.companionOf === t.tableKey;
    case 'ref':
      return model.refs.some((r) => r.key === t.key);
    case 'dep':
      return model.deps.some((d) => d.key === t.key || d.columns.some((c) => c.key === t.key));
    case 'group':
      return model.groups.some((g) => g.key === t.key);
    default:
      return model.notes.some((n) => n.key === t.key);
  }
}

export function useHover (model: Ref<DiagramModel>, suppressed: Ref<boolean>) {
  const hover = shallowRef<HoverTarget | null>(null);
  const pinned = shallowRef<HoverTarget | null>(null);

  // A new model may no longer have what was hovered or pinned, for example after a switch of files.
  watch(model, (m) => {
    if (hover.value && !targetExists(m, hover.value)) hover.value = null;
    if (pinned.value && !targetExists(m, pinned.value)) pinned.value = null;
  });

  const effective = computed<HoverTarget | null>(() => {
    if (suppressed.value) return null;
    return hover.value ?? pinned.value;
  });

  const highlight = computed<HighlightSet>(() => deriveHighlight(model.value, effective.value));

  function setHover (target: HoverTarget | null): void {
    if (!sameTarget(hover.value, target)) hover.value = target;
  }

  function clearHover (): void {
    if (hover.value !== null) hover.value = null;
  }

  function togglePin (target: HoverTarget): void {
    pinned.value = sameTarget(pinned.value, target) ? null : target;
  }

  function clearPin (): void {
    pinned.value = null;
  }

  return {
    hover,
    pinned,
    effective,
    highlight,
    setHover,
    clearHover,
    togglePin,
    clearPin,
  };
}

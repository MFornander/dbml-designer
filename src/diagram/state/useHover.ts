import { computed, shallowRef, type Ref } from 'vue';
import type { DiagramModel } from '../types';
import type {
  DepKey, FieldKey, GroupKey, NoteKey, RefKey, TableKey,
} from '../keys';

export type HoverTarget =
  | { kind: 'table'; key: TableKey }
  | { kind: 'field'; tableKey: TableKey; fieldKey: FieldKey }
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
  source: HoverTarget | null;
}

const EMPTY: HighlightSet = {
  refKeys: new Set(),
  depKeys: new Set(),
  depColumnKeys: new Set(),
  tableKeys: new Set(),
  fieldKeys: new Set(),
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
    case 'field':
      tableKeys.add(target.tableKey);
      fieldKeys.add(target.fieldKey);
      refList = model.refsByField.get(target.fieldKey) ?? [];
      columnList = model.depsByField.get(target.fieldKey) ?? [];
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
    source: target,
  };
}

export function sameTarget (a: HoverTarget | null, b: HoverTarget | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'field' && b.kind === 'field') return a.fieldKey === b.fieldKey;
  if (a.kind !== 'field' && b.kind !== 'field') return a.key === b.key;
  return false;
}

export function useHover (model: Ref<DiagramModel>, suppressed: Ref<boolean>) {
  const hover = shallowRef<HoverTarget | null>(null);
  const pinned = shallowRef<HoverTarget | null>(null);

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

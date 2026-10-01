import {
  onBeforeUnmount, shallowRef, watch, type Ref,
} from 'vue';
import type {
  DiagramModel, EdgeEndpointVM, EnumValueVM, FieldVM, IndexVM,
} from '../types';
import type { ModelRecord } from '../model';
import { fullValue } from '../geometry/values';
import { DEFAULT_SCHEMA } from '../keys';
import type { NoteKey, TableKey } from '../keys';
import type { Point, Rect } from '../geometry/rect';
import { worldToScreen, type Viewport } from '../geometry/viewport';
import { GROUP_HEADER_H, ROW_H } from '../geometry/constants';
import type { HoverTarget } from './useHover';
import type { GroupBox, RefGeometry } from './useDiagramGeometry';

export interface TooltipContent {
  kind: HoverTarget['kind'];
  /** Header name. */
  title: string;
  /** Faded text before the title: the table's schema with its dot, when it is not the default one. */
  titlePrefix?: string;
  /** Monospace type after the title (fields). */
  type?: string;
  /** The type names an enum, so it is drawn in the enum color. */
  typeIsEnum?: boolean;
  /** Second header line: the other end of an edge, drawn behind a corner arrow. */
  target?: string;
  /** Muted line under the title: alias, relationship name, member count. */
  subtitle?: string;
  /** Field settings (primary key, not null, ...) and extra lines, listed under "Settings". */
  flags?: string[];
  lines?: string[];
  dbdefault?: string;
  enumName?: string;
  enumValues?: EnumValueVM[];
  indexes?: string[];
  checks?: string[];
  metadata?: [string, string][];
  note?: string;
  /** Column-level lineage mappings of a table-level Dep edge, as `a → b`. */
  columns?: string[];
  /** A partial's primary key columns, `a` or `(a, b)`. */
  primaryKey?: string;
  /** The refs a partial gives a table, as `field (card) → table.field (card)`. */
  refs?: string[];
  /** A field's value in full, when its table has one record. */
  value?: string;
  /** A field's values in a table with several records, in full, the list cut short at `TOOLTIP_VALUES`. */
  values?: string[];
}

/** How many of a column's values a field's tooltip lists. */
export const TOOLTIP_VALUES = 10;

/** The values a field's tooltip lists for a table with several records. */
function columnValues (records: readonly ModelRecord[], field: string): string[] {
  const named = records.filter((r) => Object.prototype.hasOwnProperty.call(r, field));
  const listed = named.slice(0, TOOLTIP_VALUES).map((r) => fullValue(r[field]!));
  if (named.length > TOOLTIP_VALUES) listed.push(`and ${named.length - TOOLTIP_VALUES} more`);
  return listed;
}

export interface UseTooltipInputs {
  target: Ref<HoverTarget | null>;
  model: Ref<DiagramModel>;
  boxes: Ref<Map<TableKey | NoteKey, Rect>>;
  rowsByTable: Ref<Map<TableKey, FieldVM[]>>;
  routes: Ref<Map<string, RefGeometry>>;
  groupBoxes: Ref<GroupBox[]>;
  viewport: Ref<Viewport>;
  /** Last pointer position in pane pixels; edge tooltips trail it. */
  pointer: Ref<Point | null>;
  suppressed: Ref<boolean>;
  delayMs?: number;
}

function isEdge (t: HoverTarget): boolean {
  return t.kind === 'ref' || t.kind === 'dep';
}

function fieldFlags (f: FieldVM): string[] {
  const flags: string[] = [];
  if (f.pk) flags.push('primary key');
  if (f.compositePk && !f.pk) flags.push('composite primary key');
  if (f.unique) flags.push('unique');
  if (f.notNull) flags.push('not null');
  if (f.increment) flags.push('increment');
  return flags;
}

export function formatIndex (i: IndexVM): string {
  const cols = i.columns.length === 1 ? i.columns[0]! : `(${i.columns.join(', ')})`;
  const flags: string[] = [];
  if (i.pk) flags.push('pk');
  if (i.unique) flags.push('unique');
  if (i.type) flags.push(i.type);
  if (i.name) flags.push(`name: ${i.name}`);
  const text = flags.length ? `${cols} [${flags.join(', ')}]` : cols;
  return i.note ? `${text} — ${i.note}` : text;
}

function metadataEntries (m: Record<string, string> | undefined): [string, string][] | undefined {
  if (!m) return undefined;
  const entries = Object.entries(m);
  return entries.length ? entries : undefined;
}

/** One column as is, several in parentheses. */
function columnList (names: readonly string[]): string {
  return names.length === 1 ? names[0]! : `(${names.join(', ')})`;
}

export function buildTooltipContent (model: DiagramModel, target: HoverTarget): TooltipContent | null {
  const tableName = (ep: EdgeEndpointVM) => model.tablesByKey.get(ep.tableKey)?.displayName ?? ep.tableKey;
  /** `table.field` (or `table.(a, b)`), or the table alone for a table-level endpoint. */
  const describe = (ep: EdgeEndpointVM) => {
    if (ep.fieldNames.length === 0) return tableName(ep);
    return `${tableName(ep)}.${columnList(ep.fieldNames)}`;
  };

  switch (target.kind) {
    case 'table': {
      const t = model.tablesByKey.get(target.key);
      if (!t) return null;
      const metadata = metadataEntries(t.metadata);
      if (!t.note && !t.alias && t.indexes.length === 0 && t.checks.length === 0 && !metadata) return null;
      return {
        kind: 'table',
        title: t.name,
        ...(t.schema !== DEFAULT_SCHEMA ? { titlePrefix: `${t.schema}.` } : {}),
        ...(t.alias ? { subtitle: `alias ${t.alias}` } : {}),
        ...(t.indexes.length ? { indexes: t.indexes.map(formatIndex) } : {}),
        ...(t.checks.length ? { checks: t.checks } : {}),
        ...(metadata ? { metadata } : {}),
        ...(t.note ? { note: t.note } : {}),
      };
    }
    case 'field': {
      const t = model.tablesByKey.get(target.tableKey);
      const f = t?.fields.find((x) => x.key === target.fieldKey);
      if (!t || !f) return null;
      const flags = fieldFlags(f);
      const en = f.enumKey ? model.enums.get(f.enumKey) : undefined;
      const metadata = metadataEntries(f.metadata);
      const lines: string[] = [];
      if (f.injectedFrom) lines.push(`from partial ${f.injectedFrom}`);
      const value = f.value !== undefined ? fullValue(f.value) : undefined;
      const values = (t.records?.length ?? 0) > 1 ? columnValues(t.records!, f.name) : [];
      if (!f.note && !en && !f.dbdefault && flags.length === 0 && !f.checks?.length && !metadata && lines.length === 0
        && value === undefined && values.length === 0) {
        return null;
      }
      return {
        kind: 'field',
        title: f.name,
        type: f.typeText,
        typeIsEnum: !!en,
        ...(flags.length ? { flags } : {}),
        ...(lines.length ? { lines } : {}),
        ...(f.dbdefault ? { dbdefault: f.dbdefault } : {}),
        ...(en
          ? {
              enumName: en.name,
              enumValues: en.values,
            }
          : {}),
        ...(f.checks?.length ? { checks: f.checks } : {}),
        ...(metadata ? { metadata } : {}),
        ...(f.note ? { note: f.note } : {}),
        ...(value !== undefined ? { value } : {}),
        ...(values.length ? { values } : {}),
      };
    }
    case 'partial': {
      const entry = model.tablesByKey.get(target.tableKey)?.partialRefs?.find((p) => p.partial === target.partial);
      if (!entry) return null;
      // Each ref runs from the field the partial gave this table to what that field references.
      const refs = entry.refKeys.flatMap((k) => {
        const ref = model.refs.find((r) => r.key === k);
        if (!ref) return [];
        const [own, other] = ref.endpoints;
        return [`${columnList(own.fieldNames)} (${own.cardinality}) → ${describe(other)} (${other.cardinality})`];
      });
      return {
        kind: 'partial',
        title: entry.partial,
        titlePrefix: '~',
        subtitle: 'Table partial',
        refs,
        ...(entry.keyColumns.length ? { primaryKey: columnList(entry.keyColumns) } : {}),
        ...(entry.note ? { note: entry.note } : {}),
      };
    }
    case 'ref': {
      const ref = model.refs.find((r) => r.key === target.key);
      if (!ref) return null;
      const end = (i: 0 | 1) => `${describe(ref.endpoints[i])} (${ref.endpoints[i].cardinality})`;
      const lines: string[] = [];
      if (ref.onDelete) lines.push(`on delete: ${ref.onDelete}`);
      if (ref.onUpdate) lines.push(`on update: ${ref.onUpdate}`);
      if (ref.inactive) lines.push('inactive');
      if (ref.viaPartial) lines.push(`from partial ${ref.viaPartial}`);
      return {
        kind: 'ref',
        title: end(0),
        target: end(1),
        ...(ref.name ? { subtitle: ref.name } : {}),
        ...(lines.length ? { lines } : {}),
      };
    }
    case 'dep': {
      /** Field names only (the tables head the tooltip), or the table for a table-level side. */
      const fields = (ep: EdgeEndpointVM) => (ep.fieldNames.length ? ep.fieldNames.join(', ') : tableName(ep));

      const dep = model.deps.find((d) => d.key === target.key);
      if (dep) {
        const metadata = metadataEntries(dep.metadata);
        return {
          kind: 'dep',
          title: describe(dep.upstream),
          target: describe(dep.downstream),
          ...(metadata ? { metadata } : {}),
          ...(dep.note ? { note: dep.note } : {}),
          ...(dep.columns.length
            ? { columns: dep.columns.map((c) => `${fields(c.upstream)} → ${fields(c.downstream)}`) }
            : {}),
        };
      }
      // A column-level mapping, visible while one of its fields is hovered or pinned.
      for (const d of model.deps) {
        const col = d.columns.find((c) => c.key === target.key);
        if (!col) continue;
        return {
          kind: 'dep',
          title: describe(col.upstream),
          target: describe(col.downstream),
          ...(d.note ? { note: d.note } : {}),
        };
      }
      return null;
    }
    case 'group': {
      const g = model.groups.find((x) => x.key === target.key);
      if (!g) return null;
      const metadata = metadataEntries(g.metadata);
      return {
        kind: 'group',
        title: g.name,
        subtitle: `${g.tableKeys.length} ${g.tableKeys.length === 1 ? 'table' : 'tables'}`,
        ...(metadata ? { metadata } : {}),
        ...(g.note ? { note: g.note } : {}),
      };
    }
    default:
      return null;
  }
}

/**
 * Drives the single tooltip overlay from the hover state. Shows after a short delay and hides
 * immediately when the pointer leaves, drags, pans, or zooms. Table, field, and group tooltips
 * anchor to the hovered row; edge tooltips anchor to the cursor and follow it.
 */
export function useTooltip (input: UseTooltipInputs) {
  const content = shallowRef<TooltipContent | null>(null);
  /** Anchor rectangle in pane pixels. */
  const anchor = shallowRef<Rect | null>(null);
  const delay = input.delayMs ?? 150;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function cancel (): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function hide (): void {
    cancel();
    if (content.value) content.value = null;
  }

  function cursorAnchor (): Rect | null {
    const p = input.pointer.value;
    return p
      ? {
          x: p.x,
          y: p.y,
          w: 0,
          h: 0,
        }
      : null;
  }

  function worldAnchor (target: HoverTarget): Rect | null {
    switch (target.kind) {
      // A partial badge opens its tooltip beside the header it sits in, like the table's own.
      case 'table':
      case 'partial': {
        const b = input.boxes.value.get(target.kind === 'table' ? target.key : target.tableKey);
        return b
          ? {
              x: b.x,
              y: b.y,
              w: b.w,
              h: ROW_H,
            }
          : null;
      }
      case 'field': {
        const b = input.boxes.value.get(target.tableKey);
        const rows = input.rowsByTable.value.get(target.tableKey);
        const idx = rows?.findIndex((f) => f.key === target.fieldKey) ?? -1;
        return b && idx >= 0
          ? {
              x: b.x,
              y: b.y + ROW_H * (idx + 1),
              w: b.w,
              h: ROW_H,
            }
          : null;
      }
      case 'group': {
        const g = input.groupBoxes.value.find((x) => x.group.key === target.key);
        return g
          ? {
              x: g.box.x,
              y: g.box.y,
              w: g.box.w,
              h: GROUP_HEADER_H,
            }
          : null;
      }
      default: {
        const geo = input.routes.value.get(target.key);
        return geo
          ? {
              x: geo.mid.x,
              y: geo.mid.y,
              w: 0,
              h: 0,
            }
          : null;
      }
    }
  }

  function anchorFor (target: HoverTarget): Rect | null {
    // Edges trail the cursor; the route midpoint is only a fallback before any pointer move.
    if (isEdge(target)) {
      const c = cursorAnchor();
      if (c) return c;
    }
    const world = worldAnchor(target);
    if (!world) return null;
    const vp = input.viewport.value;
    const tl = worldToScreen(vp, world);
    return {
      x: tl.x,
      y: tl.y,
      w: world.w * vp.k,
      h: world.h * vp.k,
    };
  }

  watch([input.target, input.suppressed], ([target, suppressed]) => {
    cancel();
    if (!target || suppressed) {
      hide();
      return;
    }
    const next = buildTooltipContent(input.model.value, target);
    if (!next) {
      hide();
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      const a = anchorFor(target);
      if (!a) return;
      anchor.value = a;
      content.value = next;
    }, delay);
  });

  // An edge tooltip keeps up with the cursor while it is shown.
  watch(input.pointer, () => {
    const t = input.target.value;
    if (!content.value || !t || !isEdge(t)) return;
    const c = cursorAnchor();
    if (c) anchor.value = c;
  });

  watch(input.viewport, hide);
  onBeforeUnmount(cancel);

  return {
    content,
    anchor,
    hide,
  };
}

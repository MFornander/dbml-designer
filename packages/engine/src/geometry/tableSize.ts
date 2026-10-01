import {
  FONT_FIELD, FONT_FIELD_BOLD, FONT_PARTIAL_BADGE, FONT_TABLE_NAME, FONT_TYPE, FONT_TYPE_BOLD, FONT_VALUE,
  CHIP_W, FONT_GRID_HEADING, GRID_COL_MAX, GRID_COL_MIN, GRID_GAP, GRID_ROWS, ICON_GAP, ICON_SPACING, ICON_W, PAD_X, PARTIAL_BADGE_GAP, PARTIAL_BADGE_PAD_X, ROW_H, SCHEMA_GAP, VALUE_GAP, VALUE_MAX_W, WIDTH_EXTRA,
} from './constants';
import type { Measurer } from './measure';
import { fitText, formatValue, type ValueKind } from './values';
import { isKeyField } from './lod';
import { DEFAULT_SCHEMA } from '../keys';
import type { FieldVM, TableChip, TableVM } from '../types';

export interface RowMetrics {
  nameW: number;
  typeW: number;
  iconCount: number;
  iconsW: number;
  /** Width of the NN / E badges drawn after the type, including gaps. */
  badgesW: number;
  /** The field's record value as drawn, clipped to the value column, when it has one and values show. */
  value?: {
    text: string;
    kind: ValueKind;
  };
  /** The field's values in the grid's columns, in their order; null where a record does not name the field. */
  cells?: ({ text: string; kind: ValueKind } | null)[];
}

/** One column of a table's grid: a record's values, under a heading in the header. */
export interface GridColumn {
  /** The record's index in the table's `records`. */
  record: number;
  /** Left edge, from the grid's left edge. */
  x: number;
  w: number;
  /** The record's label cut to fit; `title` is the whole label. */
  heading: string;
  title: string;
}

/** The grid of a table with several records: a column per record shown, and a column that opens the rest. */
export interface TableGrid {
  columns: GridColumn[];
  /** The records past those shown: how many, and the column that opens them all. */
  more?: {
    count: number;
    label: string;
    x: number;
    w: number;
  };
  /** From the grid's left edge to the table's right padding. */
  w: number;
}

/** A partial badge in the table header. */
export interface HeaderBadge {
  /** Name of the TablePartial; the badge reads `~name`. */
  partial: string;
  /** Left edge, from the table's left edge. */
  x: number;
  w: number;
}

/** A companion's badge in its owner's header: the companion, its label, and where the badge sits. */
export interface HeaderCompanion {
  key: string;
  label: string;
  /** Left edge, from the table's left edge. */
  x: number;
  w: number;
}

/** A host's chip in the header: where it sits and its label, cut to its fixed width. */
export interface HeaderChip {
  chip: TableChip;
  /** Left edge, from the table's left edge. */
  x: number;
  w: number;
  /** The label, with an ellipsis when it does not fit. */
  text: string;
}

export interface TableSize {
  width: number;
  height: number;
  /** Everything the header needs: name, icon, partial badges, and the schema label with its gap. */
  headerW: number;
  /** The table name alone; the note icon follows it. */
  nameW: number;
  /** The faded schema label at the right, 0 for the default schema. */
  schemaW: number;
  /** The host's chips after the name and its icon, in order. */
  chips: HeaderChip[];
  /** A badge per companion folded into the table (see `ModelTable.companionOf`), after the chips. */
  companions: HeaderCompanion[];
  /** Partial badges after the chips, in order; empty unless partial refs are drawn as badges. */
  badges: HeaderBadge[];
  /** The count of a table's records, after the partial badges, when it has several and values show; it opens them. */
  recordsBadge?: {
    label: string;
    x: number;
    w: number;
  };
  /** Width of the value column, or of the grid, at the right of the field rows; 0 without values. */
  valueW: number;
  /** The grid, when the table has several records, values show, and the grid is on. */
  grid?: TableGrid;
  rows: RowMetrics[];
}

/** Icons drawn after the field name, in display order (matches dbdiagram). */
export type FieldIcon = 'key' | 'fk' | 'unique' | 'note';

export type FieldBadge = 'nn' | 'enum';

export const BADGE_H = 16;
export const BADGE_W: Record<FieldBadge, number> = {
  nn: 24,
  enum: 14,
};
export const BADGE_GAP = 4;

/** True when hovering the field would show a tooltip with more than its type. */
export function hasFieldDetails (f: FieldVM): boolean {
  return !!(f.note || f.dbdefault || f.checks?.length || f.metadata || f.injectedFrom);
}

export function fieldIcons (f: FieldVM): FieldIcon[] {
  const icons: FieldIcon[] = [];
  if (isKeyField(f)) icons.push('key');
  if (f.hasRef) icons.push('fk');
  if (f.unique) icons.push('unique');
  if (hasFieldDetails(f)) icons.push('note');
  return icons;
}

/** Badges drawn right of the type, listed from the right edge inwards. */
export function fieldBadges (f: FieldVM): FieldBadge[] {
  const badges: FieldBadge[] = [];
  if (f.notNull) badges.push('nn');
  if (f.enumKey) badges.push('enum');
  return badges;
}

export function iconCount (f: FieldVM): number {
  return fieldIcons(f).length;
}

export function iconsWidth (n: number): number {
  return n === 0 ? 0 : n * (ICON_W + ICON_GAP) + (n - 1) * ICON_SPACING;
}

export function badgesWidth (badges: readonly FieldBadge[]): number {
  return badges.reduce((w, b) => w + BADGE_W[b] + BADGE_GAP, 0);
}

export function rowMetrics (f: FieldVM, m: Measurer): RowMetrics {
  const bold = isKeyField(f);
  const nameW = m.measure(f.name, bold ? FONT_FIELD_BOLD : FONT_FIELD);
  const typeW = m.measure(f.typeText, bold ? FONT_TYPE_BOLD : FONT_TYPE);
  const n = iconCount(f);
  return {
    nameW,
    typeW,
    iconCount: n,
    iconsW: iconsWidth(n),
    badgesW: badgesWidth(fieldBadges(f)),
  };
}

/** True when hovering the header would show a tooltip. */
export function hasTableDetails (t: TableVM): boolean {
  return !!(t.note || t.indexes.length || t.checks.length || t.metadata);
}

/** Text of a partial badge. */
export function partialBadgeLabel (partial: string): string {
  return `~${partial}`;
}

/** Text of the records badge. */
export function recordsBadgeLabel (count: number): string {
  return `${count} rows`;
}

/** Where the value column starts, counted from the row's right padding: the type and its badges sit left of it. */
export function valueShift (size: Pick<TableSize, 'valueW'>): number {
  return size.valueW > 0 ? VALUE_GAP + size.valueW : 0;
}

/**
 * Size of a table and the layout of its header. `chips` are the host's chips after the name, each
 * `chipWidth` wide whatever its label, so a new label never resizes the table; `badges` names the
 * partials whose refs show as badges after them. The header, and so the table, widens to fit both
 * before the schema label. With `values`, a table with one record gets a value column, capped at
 * `VALUE_MAX_W`, and one with several gets a badge with their count.
 */
export function computeTableSize (
  t: TableVM, rows: readonly FieldVM[], m: Measurer, badges: readonly string[] = [], values = false,
  chips: readonly TableChip[] = [], chipWidth = CHIP_W, gridRows = GRID_ROWS,
): TableSize {
  const nameW = m.measure(t.name, FONT_TABLE_NAME);
  const schemaW = t.schema === DEFAULT_SCHEMA ? 0 : m.measure(t.schema, FONT_FIELD);
  const iconW = hasTableDetails(t) ? ICON_GAP + ICON_W : 0;
  let badgesW = 0;
  const headerChips = chips.map((chip): HeaderChip => {
    badgesW += PARTIAL_BADGE_GAP;
    const placed = {
      chip,
      x: PAD_X + nameW + iconW + badgesW,
      w: chipWidth,
      text: fitText(chip.label, chipWidth - 2 * PARTIAL_BADGE_PAD_X, m, FONT_PARTIAL_BADGE),
    };
    badgesW += chipWidth;
    return placed;
  });
  const headerCompanions = (t.companions ?? []).map((c): HeaderCompanion => {
    const w = Math.ceil(m.measure(c.label, FONT_PARTIAL_BADGE) + 2 * PARTIAL_BADGE_PAD_X);
    badgesW += PARTIAL_BADGE_GAP;
    const badge = {
      key: c.key,
      label: c.label,
      x: PAD_X + nameW + iconW + badgesW,
      w,
    };
    badgesW += w;
    return badge;
  });
  const headerBadges = badges.map((partial): HeaderBadge => {
    const w = Math.ceil(m.measure(partialBadgeLabel(partial), FONT_PARTIAL_BADGE) + 2 * PARTIAL_BADGE_PAD_X);
    badgesW += PARTIAL_BADGE_GAP;
    const badge = {
      partial,
      x: PAD_X + nameW + iconW + badgesW,
      w,
    };
    badgesW += w;
    return badge;
  });
  const recordCount = values ? t.records?.length ?? 0 : 0;
  const gridded = recordCount > 1 && gridRows > 0;
  let recordsBadge: TableSize['recordsBadge'];
  if (recordCount > 1 && !gridded) {
    const label = recordsBadgeLabel(recordCount);
    const w = Math.ceil(m.measure(label, FONT_PARTIAL_BADGE) + 2 * PARTIAL_BADGE_PAD_X);
    badgesW += PARTIAL_BADGE_GAP;
    recordsBadge = {
      label,
      x: PAD_X + nameW + iconW + badgesW,
      w,
    };
    badgesW += w;
  }
  const metrics = rows.map((f) => rowMetrics(f, m));
  const grid = gridded ? gridOf(t, rows, metrics, m, gridRows) : undefined;
  const headerW = nameW + iconW + badgesW + (schemaW ? SCHEMA_GAP + schemaW : 0) + (grid ? VALUE_GAP + grid.w : 0);
  let valueW = grid?.w ?? 0;
  if (recordCount === 1) {
    rows.forEach((f, i) => {
      if (f.value === undefined) return;
      const v = formatValue(f.value);
      const text = fitText(v.text, VALUE_MAX_W, m, FONT_VALUE);
      metrics[i]!.value = {
        text,
        kind: v.kind,
      };
      valueW = Math.max(valueW, Math.ceil(m.measure(text, FONT_VALUE)));
    });
  }
  const valueColumn = valueW > 0 ? VALUE_GAP + valueW : 0;
  let rowMax = 0;
  for (const r of metrics) {
    rowMax = Math.max(rowMax, r.nameW + r.iconsW + r.typeW + r.badgesW + 2 * PAD_X + valueColumn);
  }
  return {
    width: Math.ceil(Math.max(rowMax, headerW) + WIDTH_EXTRA),
    height: ROW_H * (rows.length + 1),
    headerW,
    nameW,
    schemaW,
    chips: headerChips,
    companions: headerCompanions,
    badges: headerBadges,
    ...(recordsBadge ? { recordsBadge } : {}),
    valueW,
    ...(grid ? { grid } : {}),
    rows: metrics,
  };
}

/**
 * The grid of a table with several records: a column per record, in `recordOrder`, up to
 * `gridRows`, each as wide as its heading and values up to `GRID_COL_MAX`; then a "+N" column
 * for the rest. Fills in each row's `cells`.
 */
function gridOf (t: TableVM, rows: readonly FieldVM[], metrics: RowMetrics[], m: Measurer, gridRows: number): TableGrid {
  const records = t.records ?? [];
  const order = t.recordOrder ?? records.map((_, i) => i);
  const shown = order.slice(0, gridRows);
  const inner = GRID_COL_MAX;
  rows.forEach((_, i) => {
    metrics[i]!.cells = [];
  });
  let x = 0;
  const columns = shown.map((record, j): GridColumn => {
    const title = t.recordLabels?.[record] ?? String(record + 1);
    const heading = fitText(title, inner, m, FONT_GRID_HEADING);
    let w = Math.max(GRID_COL_MIN, Math.ceil(m.measure(heading, FONT_GRID_HEADING)));
    rows.forEach((f, i) => {
      const r = records[record]!;
      if (!Object.prototype.hasOwnProperty.call(r, f.name)) {
        metrics[i]!.cells!.push(null);
        return;
      }
      const v = formatValue(r[f.name]!);
      const text = fitText(v.text, inner, m, FONT_VALUE);
      metrics[i]!.cells!.push({
        text,
        kind: v.kind,
      });
      w = Math.max(w, Math.ceil(m.measure(text, FONT_VALUE)));
    });
    if (j > 0) x += GRID_GAP;
    const column = {
      record,
      x,
      w: Math.min(w, GRID_COL_MAX),
      heading,
      title,
    };
    x += column.w;
    return column;
  });
  const count = records.length - shown.length;
  let more: TableGrid['more'];
  if (count > 0) {
    const label = `+${count}`;
    const w = Math.ceil(m.measure(label, FONT_GRID_HEADING) + 2 * PARTIAL_BADGE_PAD_X);
    x += GRID_GAP;
    more = {
      count,
      label,
      x,
      w,
    };
    x += w;
  }
  return {
    columns,
    ...(more ? { more } : {}),
    w: x,
  };
}

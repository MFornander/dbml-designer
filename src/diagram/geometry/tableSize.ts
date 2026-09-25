import {
  FONT_FIELD, FONT_FIELD_BOLD, FONT_PARTIAL_BADGE, FONT_TABLE_NAME, FONT_TYPE, FONT_TYPE_BOLD,
  ICON_GAP, ICON_SPACING, ICON_W, PAD_X, PARTIAL_BADGE_GAP, PARTIAL_BADGE_PAD_X, ROW_H, SCHEMA_GAP, WIDTH_EXTRA,
} from './constants';
import type { Measurer } from './measure';
import { isKeyField } from './lod';
import { DEFAULT_SCHEMA } from '../keys';
import type { FieldVM, TableVM } from '../types';

export interface RowMetrics {
  nameW: number;
  typeW: number;
  iconCount: number;
  iconsW: number;
  /** Width of the NN / E badges drawn after the type, including gaps. */
  badgesW: number;
}

/** A partial badge in the table header. */
export interface HeaderBadge {
  /** Name of the TablePartial; the badge reads `~name`. */
  partial: string;
  /** Left edge, from the table's left edge. */
  x: number;
  w: number;
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
  /** Partial badges after the name and its icon, in order; empty unless partial refs are drawn as badges. */
  badges: HeaderBadge[];
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

/**
 * Size of a table and the layout of its header. `badges` names the partials whose refs show as
 * badges after the name; the header, and so the table, widens to fit them before the schema label.
 */
export function computeTableSize (t: TableVM, rows: readonly FieldVM[], m: Measurer, badges: readonly string[] = []): TableSize {
  const nameW = m.measure(t.name, FONT_TABLE_NAME);
  const schemaW = t.schema === DEFAULT_SCHEMA ? 0 : m.measure(t.schema, FONT_FIELD);
  const iconW = hasTableDetails(t) ? ICON_GAP + ICON_W : 0;
  let badgesW = 0;
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
  const headerW = nameW + iconW + badgesW + (schemaW ? SCHEMA_GAP + schemaW : 0);
  const metrics = rows.map((f) => rowMetrics(f, m));
  let rowMax = 0;
  for (const r of metrics) {
    rowMax = Math.max(rowMax, r.nameW + r.iconsW + r.typeW + r.badgesW + 2 * PAD_X);
  }
  return {
    width: Math.ceil(Math.max(rowMax, headerW) + WIDTH_EXTRA),
    height: ROW_H * (rows.length + 1),
    headerW,
    nameW,
    schemaW,
    badges: headerBadges,
    rows: metrics,
  };
}

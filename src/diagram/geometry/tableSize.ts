import {
  FONT_FIELD, FONT_FIELD_BOLD, FONT_TABLE_NAME, FONT_TYPE, FONT_TYPE_BOLD,
  ICON_GAP, ICON_SPACING, ICON_W, PAD_X, ROW_H, SCHEMA_GAP, WIDTH_EXTRA,
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

export interface TableSize {
  width: number;
  height: number;
  /** Everything the header needs: name, icon, and the schema label with its gap. */
  headerW: number;
  /** The table name alone; the note icon follows it. */
  nameW: number;
  /** The faded schema label at the right, 0 for the default schema. */
  schemaW: number;
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

export function computeTableSize (t: TableVM, rows: readonly FieldVM[], m: Measurer): TableSize {
  const nameW = m.measure(t.name, FONT_TABLE_NAME);
  const schemaW = t.schema === DEFAULT_SCHEMA ? 0 : m.measure(t.schema, FONT_FIELD);
  const headerW = nameW + (hasTableDetails(t) ? ICON_GAP + ICON_W : 0) + (schemaW ? SCHEMA_GAP + schemaW : 0);
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
    rows: metrics,
  };
}

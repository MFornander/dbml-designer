import { LOD_MINIMAL_MAX, LOD_STRUCTURE_MAX } from './constants';
import type {
  AutoLod, DetailLevel, FieldVM, TableVM, ZoomDetail,
} from '../types';
import type { FieldKey } from '../keys';

/** True for fields that are part of the primary key, single-column or composite. */
export function isKeyField (f: FieldVM): boolean {
  return f.pk || f.compositePk;
}

/** Rows shown for a table at the chosen detail level. */
export function visibleFields (t: TableVM, level: DetailLevel): FieldVM[] {
  switch (level) {
    case 'all':
      return t.fields;
    case 'keys':
      return t.fields.filter((f) => isKeyField(f) || f.unique || f.hasRef);
    case 'names':
      return [];
    default:
      return t.fields;
  }
}

/**
 * Zoom-driven level of detail: `full` above `minimal`, then `minimal` (each table's name, wrapped
 * to stay readable, in place of its fields), then `structure` (boxes and group titles) at or
 * below `structure`.
 */
export function autoLod (k: number, thresholds: ZoomDetail = DEFAULT_ZOOM_DETAIL): AutoLod {
  if (k <= thresholds.structure) return 'structure';
  if (k <= thresholds.minimal) return 'minimal';
  return 'full';
}

export const DEFAULT_ZOOM_DETAIL: Readonly<ZoomDetail> = {
  minimal: LOD_MINIMAL_MAX,
  structure: LOD_STRUCTURE_MAX,
};

export function rowIndexMap (rows: readonly FieldVM[]): Map<FieldKey, number> {
  const map = new Map<FieldKey, number>();
  rows.forEach((f, i) => map.set(f.key, i));
  return map;
}

/** Size on screen, in pixels, of a table's name and a group's title while zoomed out. */
export const OVERVIEW_NAME_PX = 12;
export const OVERVIEW_GROUP_PX = 16;
/** A name's characters are about this wide for their size, and its lines this tall. */
const CHAR_W = 0.6;
const LINE_H = 1.2;

/**
 * A name broken into lines of at most `maxChars`, after `_`, `.`, `-`, or spaces, or between a
 * lowercase and an uppercase letter, and within a part too long for a line; at most `maxLines`
 * lines, the last ending in an ellipsis when the name does not fit. None when not even three
 * characters fit a line.
 */
export function wrapName (name: string, maxChars: number, maxLines: number): string[] {
  if (maxChars < 3 || maxLines < 1) return [];
  const parts = name.split(/(?<=[._\-\s])|(?<=[a-z])(?=[A-Z])/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (let part of parts) {
    if (line && (line + part).length > maxChars) {
      lines.push(line);
      line = '';
    }
    while (part.length > maxChars) {
      lines.push(part.slice(0, maxChars));
      part = part.slice(maxChars);
    }
    line += part;
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  // The last line takes what is left, as far as it fits before the ellipsis.
  const rest = lines.slice(maxLines - 1).join('');
  return [...lines.slice(0, maxLines - 1), `${rest.slice(0, maxChars - 1)}…`];
}

/** The lines of a name drawn `px` pixels high on screen inside a box `w` by `h` in diagram units, at zoom `k`, with `pad` around. */
export function overviewLines (name: string, w: number, h: number, k: number, px = OVERVIEW_NAME_PX, pad = 8): string[] {
  const size = px / k;
  return wrapName(name, Math.floor((w - 2 * pad) / (size * CHAR_W)), Math.floor((h - 2 * pad) / (size * LINE_H)));
}

export const OVERVIEW_LINE_H = LINE_H;

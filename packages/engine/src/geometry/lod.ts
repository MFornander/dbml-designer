import { LOD_MINIMAL_MAX, LOD_STRUCTURE_MAX } from './constants';
import type {
  AutoLod, DetailLevel, FieldVM, TableVM,
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

/** Zoom-driven level of detail. */
export function autoLod (k: number): AutoLod {
  if (k <= LOD_STRUCTURE_MAX) return 'structure';
  if (k <= LOD_MINIMAL_MAX) return 'minimal';
  return 'full';
}

export function rowIndexMap (rows: readonly FieldVM[]): Map<FieldKey, number> {
  const map = new Map<FieldKey, number>();
  rows.forEach((f, i) => map.set(f.key, i));
  return map;
}

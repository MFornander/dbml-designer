import type { Rect } from '../geometry/rect';

/*
 * Structural sharing for derived geometry. Boxes and routes are recomputed from scratch whenever
 * anything they depend on changes, as on every frame of a drag, and a component re-renders
 * whenever a prop is a new object. Handing back the previous object whenever the new one holds
 * the same values keeps every table and edge that did not move from re-rendering.
 */

/** Rectangles with the same position and size. */
export function sameRect (a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/** Deep equality of plain data (primitives, arrays, and plain objects), which is what geometry is made of. */
export function samePlain (a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => samePlain(v, b[i]));
  }
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && samePlain((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** Sets with the same members. */
export function sameSet<T> (a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/**
 * `next` with every value that `same` finds equal to the one `prev` holds under that key replaced
 * by the older object. When the keys, their order, and every value are unchanged, `prev` itself
 * comes back, so whatever depends on the whole map does not run again either.
 */
export function shareMap<K, V> (prev: Map<K, V> | undefined, next: Map<K, V>, same: (a: V, b: V) => boolean): Map<K, V> {
  if (!prev) return next;
  let unchanged = prev.size === next.size;
  const prevKeys = prev.keys();
  for (const [key, value] of next) {
    if (unchanged && prevKeys.next().value !== key) unchanged = false;
    const old = prev.get(key);
    if (old !== undefined && (old === value || same(old, value))) next.set(key, old);
    else unchanged = false;
  }
  return unchanged ? prev : next;
}

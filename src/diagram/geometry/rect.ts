import { GRID } from './constants';

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface Rect extends Point, Size {}

export function right (r: Rect): number {
  return r.x + r.w;
}

export function bottom (r: Rect): number {
  return r.y + r.h;
}

export function center (r: Rect): Point {
  return {
    x: r.x + r.w / 2,
    y: r.y + r.h / 2,
  };
}

export function intersects (a: Rect, b: Rect): boolean {
  return a.x < right(b) && right(a) > b.x && a.y < bottom(b) && bottom(a) > b.y;
}

export function inflate (r: Rect, by: number): Rect {
  return {
    x: r.x - by,
    y: r.y - by,
    w: r.w + 2 * by,
    h: r.h + 2 * by,
  };
}

export function union (rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, right(r));
    y1 = Math.max(y1, bottom(r));
  }
  return {
    x: x0,
    y: y0,
    w: x1 - x0,
    h: y1 - y0,
  };
}

export function snapTo (value: number, unit: number): number {
  const snapped = Math.round(value / unit) * unit;
  // Rounding a small negative gives -0, which would later print as "-0".
  return snapped === 0 ? 0 : snapped;
}

export function snap8 (value: number): number {
  return snapTo(value, GRID);
}

export function snapPoint (p: Point): Point {
  return {
    x: snap8(p.x),
    y: snap8(p.y),
  };
}

export function pointsEqual (a: Point, b: Point, eps = 1e-6): boolean {
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;
}

export function distance (a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Format a number for an SVG attribute: at most two decimals, no trailing zeros. */
export function fmt (n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

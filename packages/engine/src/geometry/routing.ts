import { STUB } from './constants';
import type { AnchorPoint } from './anchors';
import { distance, pointsEqual, type Point } from './rect';

/**
 * The movable segments of an orthogonal route as alternating coordinates: the x of the first
 * vertical segment, the y of the horizontal one after it, and so on, always ending on an x. The
 * route runs a → (x1, a.y) → (x1, y1) → (x2, y1) → … → (xn, b.y) → b, so the two segments that
 * touch the anchors are always horizontal.
 */
export type Rails = number[];

function dir (side: AnchorPoint['side']): 1 | -1 {
  return side === 'right' ? 1 : -1;
}

/** Well-formed rails are a non-empty odd-length list of finite numbers. */
export function isValidRails (rails: unknown): rails is Rails {
  return Array.isArray(rails)
    && rails.length % 2 === 1
    && rails.every((v) => typeof v === 'number' && Number.isFinite(v));
}

/**
 * The x of the single vertical segment of the automatic route. Opposite sides: half way between
 * the two stubs. Same side: just beyond the outermost stub.
 */
export function autoRailX (a: AnchorPoint, b: AnchorPoint): number {
  const sA = a.x + dir(a.side) * STUB;
  const sB = b.x + dir(b.side) * STUB;
  if (a.side !== b.side) return (sA + sB) / 2;
  return a.side === 'left' ? Math.min(sA, sB) : Math.max(sA, sB);
}

/** Every corner of the route through `rails`, degenerate ones included (control points sit on them). */
export function routeWithRails (a: AnchorPoint, b: AnchorPoint, rails: readonly number[]): Point[] {
  const pts: Point[] = [{
    x: a.x,
    y: a.y,
  }];
  let x = a.x;
  let y = a.y;
  rails.forEach((r, i) => {
    if (i % 2 === 0) x = r;
    else y = r;
    pts.push({
      x,
      y,
    });
  });
  pts.push({
    x,
    y: b.y,
  });
  pts.push({
    x: b.x,
    y: b.y,
  });
  return pts;
}

/**
 * Drop rails that no longer bend the route: a horizontal rail back on the previous y (or on
 * b.y at the end) folds away together with its neighbouring vertical, and two equal x rails
 * around a y rail remove the spur between them. Returns null when only the automatic route is
 * left, so callers can forget the customization.
 */
export function simplifyRails (a: AnchorPoint, b: AnchorPoint, rails: readonly number[]): Rails | null {
  const out = [...rails];
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 1; i < out.length; i += 2) {
      const prevY = i === 1 ? a.y : out[i - 2]!;
      if (out[i] === prevY) {
        out.splice(i - 1, 2);
        changed = true;
        break;
      }
      if (i === out.length - 2 && out[i] === b.y) {
        out.splice(i, 2);
        changed = true;
        break;
      }
      if (out[i - 1] === out[i + 1]) {
        out.splice(i, 2);
        changed = true;
        break;
      }
    }
  }
  return out.length === 1 && out[0] === autoRailX(a, b) ? null : out;
}

/** Remove consecutive duplicates and interior points that lie on a straight axis-aligned run. */
export function dedupeCollinear (pts: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && pointsEqual(last, p)) continue;
    out.push({
      x: p.x,
      y: p.y,
    });
  }
  let changed = true;
  while (changed && out.length > 2) {
    changed = false;
    for (let i = 1; i < out.length - 1; i++) {
      const a = out[i - 1]!;
      const b = out[i]!;
      const c = out[i + 1]!;
      const horizontal = a.y === b.y && b.y === c.y;
      const vertical = a.x === b.x && b.x === c.x;
      if (horizontal || vertical) {
        out.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return out;
}

/**
 * Orthogonal route between two anchors. Opposite sides: leave each anchor by a
 * stub and bend twice through the horizontal midpoint. Same side: run a vertical
 * segment just beyond the outermost stub.
 */
export function routeRef (a: AnchorPoint, b: AnchorPoint): Point[] {
  return dedupeCollinear(routeWithRails(a, b, [autoRailX(a, b)]));
}

/** Shorten a polyline at both ends by moving the end points along their segments. */
export function trimEnds (pts: readonly Point[], startBy: number, endBy: number): Point[] {
  if (pts.length < 2) return pts.map((p) => ({ ...p }));
  const out = pts.map((p) => ({ ...p }));
  const first = out[0]!;
  const second = out[1]!;
  const lenA = distance(first, second);
  if (lenA > 0 && startBy > 0) {
    const t = Math.min(startBy, lenA) / lenA;
    first.x += (second.x - first.x) * t;
    first.y += (second.y - first.y) * t;
  }
  const last = out[out.length - 1]!;
  const beforeLast = out[out.length - 2]!;
  const lenB = distance(last, beforeLast);
  if (lenB > 0 && endBy > 0) {
    const t = Math.min(endBy, lenB) / lenB;
    last.x += (beforeLast.x - last.x) * t;
    last.y += (beforeLast.y - last.y) * t;
  }
  return out;
}

/** Point half way along a polyline (by arc length). */
export function midpoint (pts: readonly Point[]): Point {
  if (pts.length === 0) {
    return {
      x: 0,
      y: 0,
    };
  }
  if (pts.length === 1) return { ...pts[0]! };
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += distance(pts[i - 1]!, pts[i]!);
  let remaining = total / 2;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const seg = distance(a, b);
    if (remaining <= seg) {
      const t = seg === 0 ? 0 : remaining / seg;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      };
    }
    remaining -= seg;
  }
  return { ...pts[pts.length - 1]! };
}

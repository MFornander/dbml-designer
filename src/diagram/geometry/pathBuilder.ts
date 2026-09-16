import { MAX_CORNER_R } from './constants';
import { distance, fmt, type Point } from './rect';

/**
 * SVG path through `pts` with every interior corner rounded by a quadratic curve.
 * The radius is clamped to half of each adjacent segment and to `maxR`.
 */
export function roundedPolylinePath (pts: readonly Point[], maxR: number = MAX_CORNER_R): string {
  if (pts.length === 0) return '';
  const p0 = pts[0]!;
  if (pts.length === 1) return `M${fmt(p0.x)} ${fmt(p0.y)}`;
  let d = `M${fmt(p0.x)} ${fmt(p0.y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]!;
    const cur = pts[i]!;
    const next = pts[i + 1]!;
    const lenIn = distance(prev, cur);
    const lenOut = distance(cur, next);
    const r = Math.min(maxR, lenIn / 2, lenOut / 2);
    if (r <= 0 || lenIn === 0 || lenOut === 0) {
      d += ` L${fmt(cur.x)} ${fmt(cur.y)}`;
      continue;
    }
    const inStart = {
      x: cur.x - ((cur.x - prev.x) / lenIn) * r,
      y: cur.y - ((cur.y - prev.y) / lenIn) * r,
    };
    const outEnd = {
      x: cur.x + ((next.x - cur.x) / lenOut) * r,
      y: cur.y + ((next.y - cur.y) / lenOut) * r,
    };
    d += ` L${fmt(inStart.x)} ${fmt(inStart.y)} Q${fmt(cur.x)} ${fmt(cur.y)} ${fmt(outEnd.x)} ${fmt(outEnd.y)}`;
  }
  const last = pts[pts.length - 1]!;
  d += ` L${fmt(last.x)} ${fmt(last.y)}`;
  return d;
}

/** Cubic Bezier point at parameter `t`. */
export function cubicPoint (p0: Point, c1: Point, c2: Point, p1: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt ** 3 * p0.x + 3 * mt ** 2 * t * c1.x + 3 * mt * t ** 2 * c2.x + t ** 3 * p1.x,
    y: mt ** 3 * p0.y + 3 * mt ** 2 * t * c1.y + 3 * mt * t ** 2 * c2.y + t ** 3 * p1.y,
  };
}

/**
 * Smooth S-curve between two anchors leaving each horizontally in its side
 * direction (+1 right, -1 left). Used for lineage edges.
 */
export function sCurve (a: Point, dirA: 1 | -1, b: Point, dirB: 1 | -1, minHandle = 60): {
  d: string;
  c1: Point;
  c2: Point;
  mid: Point;
} {
  const handle = Math.max(minHandle, Math.abs(b.x - a.x) / 2);
  const c1 = {
    x: a.x + dirA * handle,
    y: a.y,
  };
  const c2 = {
    x: b.x + dirB * handle,
    y: b.y,
  };
  return {
    d: `M${fmt(a.x)} ${fmt(a.y)} C${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(b.x)} ${fmt(b.y)}`,
    c1,
    c2,
    mid: cubicPoint(a, c1, c2, b, 0.5),
  };
}

/** Plain polyline path (no rounding). */
export function polylinePath (pts: readonly Point[]): string {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${fmt(p.x)} ${fmt(p.y)}`).join(' ');
}

/** Rectangle at the origin with only the top two corners rounded (table and group headers). */
export function roundedTopRectPath (w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  return [
    `M0 ${fmt(h)}`,
    `V${fmt(rr)}`,
    `Q0 0 ${fmt(rr)} 0`,
    `H${fmt(w - rr)}`,
    `Q${fmt(w)} 0 ${fmt(w)} ${fmt(rr)}`,
    `V${fmt(h)}`,
    'Z',
  ].join(' ');
}

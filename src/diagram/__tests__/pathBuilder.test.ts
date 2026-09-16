import { describe, it, expect } from 'vitest';
import { polylinePath, roundedPolylinePath, roundedTopRectPath } from '@/diagram/geometry/pathBuilder';

describe('roundedPolylinePath', () => {
  it('draws a straight line for two points', () => {
    expect(roundedPolylinePath([{ x: 0, y: 0 }, { x: 100, y: 0 }])).toBe('M0 0 L100 0');
  });

  it('rounds each interior corner with a quadratic curve', () => {
    const d = roundedPolylinePath([
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 100 },
    ]);
    expect(d.match(/Q/g)).toHaveLength(2);
    expect(d).toBe('M0 0 L90 0 Q100 0 100 10 L100 90 Q100 100 110 100 L200 100');
  });

  it('clamps the radius to half of the shorter adjacent segment', () => {
    const d = roundedPolylinePath([{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 100 }]);
    // Segment of 8 -> radius 4: the curve starts 4 before the corner.
    expect(d).toBe('M0 0 L4 0 Q8 0 8 4 L8 100');
    const d2 = roundedPolylinePath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 4 }]);
    expect(d2).toBe('M0 0 L98 0 Q100 0 100 2 L100 4');
  });

  it('formats numbers with at most two decimals', () => {
    const d = roundedPolylinePath([{ x: 0.123456, y: 0 }, { x: 50.999, y: 0 }]);
    expect(d).toBe('M0.12 0 L51 0');
  });

  it('matches the snapshot for a canonical route', () => {
    const d = roundedPolylinePath([
      { x: 200, y: 48 }, { x: 350, y: 48 }, { x: 350, y: 144 }, { x: 500, y: 144 },
    ]);
    expect(d).toMatchInlineSnapshot('"M200 48 L340 48 Q350 48 350 58 L350 134 Q350 144 360 144 L500 144"');
  });
});

describe('polylinePath', () => {
  it('emits M then L commands', () => {
    expect(polylinePath([{ x: 1, y: 2 }, { x: 3, y: 4 }])).toBe('M1 2 L3 4');
  });
});

describe('roundedTopRectPath', () => {
  it('rounds only the top corners and closes the shape', () => {
    const d = roundedTopRectPath(100, 32, 3);
    expect(d.startsWith('M0 32')).toBe(true);
    expect(d.match(/Q/g)).toHaveLength(2);
    expect(d.endsWith('Z')).toBe(true);
  });
});

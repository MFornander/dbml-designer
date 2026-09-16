import { describe, it, expect } from 'vitest';
import {
  autoRailX, dedupeCollinear, isValidRails, midpoint, routeRef, routeWithRails, simplifyRails, trimEnds,
} from '@/diagram/geometry/routing';
import { STUB } from '@/diagram/geometry/constants';
import type { AnchorPoint } from '@/diagram/geometry/anchors';

const anchor = (x: number, y: number, side: 'left' | 'right'): AnchorPoint => ({ x, y, side });

describe('routeRef', () => {
  it('bends twice through the midpoint of the stubs for opposite sides', () => {
    const pts = routeRef(anchor(200, 48, 'right'), anchor(500, 144, 'left'));
    const midX = ((200 + STUB) + (500 - STUB)) / 2;
    expect(pts).toEqual([
      { x: 200, y: 48 },
      { x: midX, y: 48 },
      { x: midX, y: 144 },
      { x: 500, y: 144 },
    ]);
  });

  it('collapses to a straight line when the anchors share a y', () => {
    const pts = routeRef(anchor(200, 48, 'right'), anchor(500, 48, 'left'));
    expect(pts).toEqual([{ x: 200, y: 48 }, { x: 500, y: 48 }]);
  });

  it('routes around the outermost stub when both anchors are on the left', () => {
    const pts = routeRef(anchor(100, 48, 'left'), anchor(60, 300, 'left'));
    const outerX = Math.min(100 - STUB, 60 - STUB);
    expect(pts).toEqual([
      { x: 100, y: 48 },
      { x: outerX, y: 48 },
      { x: outerX, y: 300 },
      { x: 60, y: 300 },
    ]);
  });

  it('routes a self reference as a loop on the right', () => {
    const pts = routeRef(anchor(200, 4, 'right'), anchor(200, 28, 'right'));
    expect(pts).toEqual([
      { x: 200, y: 4 },
      { x: 220, y: 4 },
      { x: 220, y: 28 },
      { x: 200, y: 28 },
    ]);
  });
});

describe('dedupeCollinear', () => {
  it('removes duplicates and interior collinear points', () => {
    const pts = dedupeCollinear([
      { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 20, y: 20 },
    ]);
    expect(pts).toEqual([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }]);
  });
});

describe('trimEnds', () => {
  it('shortens the first and last segments by the requested amounts', () => {
    const pts = trimEnds([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }], 10, 16);
    expect(pts[0]).toEqual({ x: 10, y: 0 });
    expect(pts[2]).toEqual({ x: 100, y: 34 });
  });

  it('never moves an end point past its neighbour', () => {
    const pts = trimEnds([{ x: 0, y: 0 }, { x: 5, y: 0 }], 10, 0);
    expect(pts[0]!.x).toBeLessThanOrEqual(5);
  });
});

describe('midpoint', () => {
  it('finds the half-way point by arc length', () => {
    expect(midpoint([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }])).toEqual({ x: 100, y: 0 });
    expect(midpoint([{ x: 0, y: 0 }, { x: 40, y: 0 }])).toEqual({ x: 20, y: 0 });
  });
});

describe('rails', () => {
  const a = anchor(200, 48, 'right');
  const b = anchor(500, 144, 'left');

  it('describes the automatic route as a single vertical rail', () => {
    // Stubs at 220 and 480 meet in the middle.
    expect(autoRailX(a, b)).toBe(350);
    expect(autoRailX(anchor(200, 48, 'left'), anchor(400, 144, 'left'))).toBe(200 - STUB);
    expect(routeWithRails(a, b, [350])).toEqual([
      { x: 200, y: 48 },
      { x: 350, y: 48 },
      { x: 350, y: 144 },
      { x: 500, y: 144 },
    ]);
    expect(routeRef(a, b)).toEqual(dedupeCollinear(routeWithRails(a, b, [autoRailX(a, b)])));
  });

  it('threads a route through alternating x and y rails', () => {
    expect(routeWithRails(a, b, [220, 200, 480])).toEqual([
      { x: 200, y: 48 },
      { x: 220, y: 48 },
      { x: 220, y: 200 },
      { x: 480, y: 200 },
      { x: 480, y: 144 },
      { x: 500, y: 144 },
    ]);
  });

  it('validates rails as a non-empty odd-length list of numbers', () => {
    expect(isValidRails([300])).toBe(true);
    expect(isValidRails([300, 100, 400])).toBe(true);
    expect(isValidRails([300, 100])).toBe(false);
    expect(isValidRails([])).toBe(false);
    expect(isValidRails([Number.NaN])).toBe(false);
    expect(isValidRails('300')).toBe(false);
  });

  it('folds away bends that no longer bend and forgets the automatic route', () => {
    // A stub bent back onto its own row is no bend at all.
    expect(simplifyRails(a, b, [220, 48, 350])).toBeNull();
    expect(simplifyRails(a, b, [220, 48, 300])).toEqual([300]);
    // A horizontal rail on b's row folds with the vertical after it.
    expect(simplifyRails(a, b, [300, 144, 480])).toEqual([300]);
    // Out-and-back spurs disappear.
    expect(simplifyRails(a, b, [300, 200, 300])).toEqual([300]);
    // Real bends survive.
    expect(simplifyRails(a, b, [220, 200, 480])).toEqual([220, 200, 480]);
    expect(simplifyRails(a, b, [300])).toEqual([300]);
  });
});

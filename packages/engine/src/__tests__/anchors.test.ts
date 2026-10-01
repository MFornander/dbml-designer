import { describe, it, expect } from 'vitest';
import {
  anchorY, endpointAnchor, pickSides, selfRefAnchors,
} from '../geometry/anchors';
import { SELF_REF_GAP } from '../geometry/constants';

const box = (x: number, y: number, w = 200, h = 96) => ({ x, y, w, h });

describe('pickSides', () => {
  it('connects across the gap when A is left of B', () => {
    expect(pickSides(box(0, 0), box(300, 0))).toEqual(['right', 'left']);
  });

  it('connects across the gap when A is right of B', () => {
    expect(pickSides(box(300, 0), box(0, 0))).toEqual(['left', 'right']);
  });

  it('uses the left side of both when the tables overlap horizontally', () => {
    expect(pickSides(box(0, 0), box(100, 200))).toEqual(['left', 'left']);
  });

  it('treats touching edges as side by side', () => {
    expect(pickSides(box(0, 0, 200), box(200, 0))).toEqual(['right', 'left']);
  });
});

describe('endpointAnchor', () => {
  it('anchors at the center of a field row', () => {
    const b = box(10, 20);
    expect(anchorY(b, 0)).toBe(20 + 32 + 16);
    expect(anchorY(b, 2)).toBe(20 + 32 * 3 + 16);
  });

  it('anchors at the header center for table-level refs', () => {
    expect(anchorY(box(0, 40), null)).toBe(40 + 16);
  });

  it('uses the left or right edge and applies the offset', () => {
    const b = box(10, 20, 150);
    expect(endpointAnchor(b, 0, 'right')).toEqual({ x: 160, y: 20 + 32 + 16, side: 'right' });
  });
});

describe('selfRefAnchors', () => {
  it('runs field to field along the right edge between two different rows', () => {
    const [a, b] = selfRefAnchors(box(0, 0, 200), 3, 0);
    expect(a).toEqual({
      x: 200,
      y: 32 * 4 + 16,
      side: 'right',
    });
    expect(b).toEqual({
      x: 200,
      y: 32 + 16,
      side: 'right',
    });
  });

  it('loops out of the header a fixed distance apart when the rows coincide or are hidden', () => {
    for (const [a, b] of [selfRefAnchors(box(0, 0, 200)), selfRefAnchors(box(0, 0, 200), 2, 2), selfRefAnchors(box(0, 0, 200), 1, null)]) {
      expect(a.side).toBe('right');
      expect(b.side).toBe('right');
      expect(a.x).toBe(200);
      expect(b.y - a.y).toBe(SELF_REF_GAP);
    }
  });
});

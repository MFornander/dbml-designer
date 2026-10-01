import { describe, it, expect } from 'vitest';
import { snap8, snapPoint } from '../geometry/rect';

describe('snap8', () => {
  it('rounds to the 8px grid', () => {
    expect(snap8(3)).toBe(0);
    expect(snap8(4)).toBe(8);
    expect(snap8(-13)).toBe(-16);
    expect(snap8(100)).toBe(104);
  });

  it('never yields negative zero, which would serialize as -0', () => {
    expect(Object.is(snap8(-0.4), 0)).toBe(true);
    expect(Object.is(snap8(-0), 0)).toBe(true);
    const p = snapPoint({
      x: -3,
      y: -0,
    });
    expect(Object.is(p.x, 0)).toBe(true);
    expect(Object.is(p.y, 0)).toBe(true);
  });
});

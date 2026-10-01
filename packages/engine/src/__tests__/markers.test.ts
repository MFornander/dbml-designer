import { describe, it, expect } from 'vitest';
import { markerGeometry, markerKind } from '../geometry/markers';
import { CIRCLE_R, CROW_W } from '../geometry/constants';

describe('markerKind', () => {
  it('maps DBML cardinalities to marker kinds', () => {
    expect(markerKind('1')).toBe('one');
    expect(markerKind('0..1')).toBe('maybe');
    expect(markerKind('*')).toBe('some');
    expect(markerKind('1..*')).toBe('some');
    expect(markerKind('0..*')).toBe('many');
    expect(markerKind('2..5')).toBe('some');
    expect(markerKind('0..3')).toBe('many');
  });
});

describe('markerGeometry', () => {
  it('shortens the line by the tail, plus the circle when optional', () => {
    expect(markerGeometry('one').lineShorten).toBe(CROW_W);
    expect(markerGeometry('some').lineShorten).toBe(CROW_W);
    expect(markerGeometry('maybe').lineShorten).toBe(CROW_W + 2 * CIRCLE_R);
    expect(markerGeometry('many').lineShorten).toBe(CROW_W + 2 * CIRCLE_R);
  });

  it('draws nothing for a lineage source and an arrowhead for a lineage target', () => {
    expect(markerGeometry('none').d).toBe('');
    expect(markerGeometry('none').lineShorten).toBe(0);
    expect(markerGeometry('arrow').d).toMatch(/^M/);
    expect(markerGeometry('arrow').d).toContain('L0 0');
    expect(markerGeometry('arrow').lineShorten).toBeGreaterThan(0);
  });

  it('draws a bar for one, prongs for many, and an arc for optional ends', () => {
    expect(markerGeometry('one').d).toContain('V');
    expect(markerGeometry('one').d).not.toContain('a');
    expect(markerGeometry('some').d.match(/L/g)).toHaveLength(2);
    expect(markerGeometry('maybe').d).toContain('a');
    expect(markerGeometry('many').d).toContain('a');
    expect(markerGeometry('many').d.match(/L/g)).toHaveLength(2);
  });
});

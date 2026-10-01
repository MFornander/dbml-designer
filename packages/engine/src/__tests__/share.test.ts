import { describe, it, expect } from 'vitest';
import {
  samePlain, sameRect, sameSet, shareMap,
} from '../state/share';

const rect = (x: number, y: number, w = 100, h = 50) => ({
  x,
  y,
  w,
  h,
});

describe('structural sharing helpers', () => {
  it('compares rectangles, sets, and plain data by value', () => {
    expect(sameRect(rect(1, 2), rect(1, 2))).toBe(true);
    expect(sameRect(rect(1, 2), rect(1, 3))).toBe(false);
    expect(sameRect(rect(1, 2, 100), rect(1, 2, 101))).toBe(false);

    expect(sameSet(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(true);
    expect(sameSet(new Set(['a']), new Set(['a', 'b']))).toBe(false);
    expect(sameSet(new Set(['a', 'c']), new Set(['a', 'b']))).toBe(false);

    const route = () => ({
      a: { x: 1, y: 2, side: 'right' },
      points: [{ x: 1, y: 2 }, { x: 30, y: 2 }],
      dFull: 'M1 2 L30 2',
      rails: null,
      markerA: { d: 'M0 0 H10', circle: null, lineShorten: 10 },
    });
    expect(samePlain(route(), route())).toBe(true);
    expect(samePlain({ ...route(), points: [{ x: 1, y: 2 }] }, route())).toBe(false);
    expect(samePlain({ ...route(), rails: [300] }, route())).toBe(false);
    expect(samePlain({ ...route(), extra: undefined }, route())).toBe(false);
    expect(samePlain([1, 2], { 0: 1, 1: 2 })).toBe(false);
    expect(samePlain(null, {})).toBe(false);
  });

  it('keeps the previous value for every key whose value did not change', () => {
    const prev = new Map([['a', rect(0, 0)], ['b', rect(10, 0)]]);
    const next = shareMap(prev, new Map([['a', rect(0, 0)], ['b', rect(20, 0)]]), sameRect);
    expect(next).not.toBe(prev);
    expect(next.get('a')).toBe(prev.get('a'));
    expect(next.get('b')).not.toBe(prev.get('b'));
    expect(next.get('b')).toEqual(rect(20, 0));
  });

  it('returns the previous map itself when nothing changed, and a new one when keys come, go, or reorder', () => {
    const prev = new Map([['a', rect(0, 0)], ['b', rect(10, 0)]]);
    expect(shareMap(prev, new Map([['a', rect(0, 0)], ['b', rect(10, 0)]]), sameRect)).toBe(prev);

    const added = shareMap(prev, new Map([['a', rect(0, 0)], ['b', rect(10, 0)], ['c', rect(5, 5)]]), sameRect);
    expect(added).not.toBe(prev);
    expect(added.get('a')).toBe(prev.get('a'));

    const removed = shareMap(prev, new Map([['a', rect(0, 0)]]), sameRect);
    expect(removed).not.toBe(prev);
    expect([...removed.keys()]).toEqual(['a']);

    const reordered = shareMap(prev, new Map([['b', rect(10, 0)], ['a', rect(0, 0)]]), sameRect);
    expect(reordered).not.toBe(prev);
    expect([...reordered.keys()]).toEqual(['b', 'a']);
    expect(reordered.get('b')).toBe(prev.get('b'));

    expect(shareMap(undefined, prev, sameRect)).toBe(prev);
  });
});

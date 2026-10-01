import { describe, it, expect } from 'vitest';
import {
  groupBounds, placeNewItems, placeNewNotes, type PlacementItem,
} from '../geometry/layout';
import { intersects, type Rect } from '../geometry/rect';
import { GROUP_HEADER_H, GROUP_PAD } from '../geometry/constants';

const item = (key: string, order: number, h = 160, groupOrder?: number): PlacementItem => ({
  key,
  w: 200,
  h,
  order,
  ...(groupOrder !== undefined ? { groupOrder } : {}),
});

describe('placeNewItems', () => {
  it('is deterministic and keeps declaration order within a column', () => {
    const items = [item('a', 0), item('b', 1), item('c', 2)];
    const first = placeNewItems(items, []);
    const second = placeNewItems(items, []);
    expect([...first.entries()]).toEqual([...second.entries()]);
    expect(first.get('a')!.y).toBeLessThan(first.get('b')!.y);
    expect(first.get('b')!.y).toBeLessThan(first.get('c')!.y);
    expect(first.get('a')!.x).toBe(first.get('c')!.x);
  });

  it('starts a new column once the column height is exceeded', () => {
    const items = Array.from({ length: 8 }, (_, i) => item(`t${i}`, i, 300));
    const placed = placeNewItems(items, [], { colHeight: 900 });
    const xs = new Set([...placed.values()].map((p) => p.x));
    expect(xs.size).toBeGreaterThan(1);
  });

  it('never overlaps occupied rects and snaps to the grid', () => {
    const occupied: Rect[] = [{ x: 0, y: 0, w: 200, h: 400 }];
    const items = [item('a', 0), item('b', 1)];
    const placed = placeNewItems(items, occupied);
    for (const [key, p] of placed) {
      expect(p.x % 8).toBe(0);
      expect(p.y % 8).toBe(0);
      const rect = { x: p.x, y: p.y, w: 200, h: items.find((i) => i.key === key)!.h };
      expect(intersects(rect, occupied[0]!)).toBe(false);
    }
    expect(placed.get('a')!.x).toBeGreaterThan(200);
  });

  it('packs group members next to each other', () => {
    const items = [item('a', 0), item('g1', 1, 160, 0), item('b', 2), item('g2', 3, 160, 0)];
    const placed = placeNewItems(items, []);
    const order = [...placed.keys()];
    expect(order.indexOf('g2') - order.indexOf('g1')).toBe(1);
  });

  it('returns nothing for an empty request', () => {
    expect(placeNewItems([], []).size).toBe(0);
  });
});

describe('placeNewNotes', () => {
  it('stacks notes to the right of the content', () => {
    const placed = placeNewNotes(['note:a', 'note:b'], [{ x: 0, y: 0, w: 300, h: 200 }]);
    expect(placed.get('note:a')!.x).toBeGreaterThan(300);
    expect(placed.get('note:b')!.y).toBeGreaterThan(placed.get('note:a')!.y);
  });
});

describe('groupBounds', () => {
  it('pads the union of the members and adds a header strip', () => {
    const b = groupBounds([{ x: 100, y: 100, w: 200, h: 100 }, { x: 400, y: 150, w: 100, h: 300 }]);
    expect(b).toEqual({
      x: 100 - GROUP_PAD,
      y: 100 - GROUP_PAD - GROUP_HEADER_H,
      w: 400 + 2 * GROUP_PAD,
      h: 350 + 2 * GROUP_PAD + GROUP_HEADER_H,
    });
  });

  it('is null without members', () => {
    expect(groupBounds([])).toBeNull();
  });
});

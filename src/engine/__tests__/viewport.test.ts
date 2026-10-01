import { describe, it, expect } from 'vitest';
import {
  fitToRect, resetZoom, screenToWorld, wheelFactor, worldToScreen, zoomAt,
} from '../geometry/viewport';
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '../geometry/constants';

describe('zoomAt', () => {
  it('keeps the world point under the cursor fixed', () => {
    const vp = { x: 40, y: 20, k: 1 };
    const cursor = { x: 300, y: 200 };
    const before = screenToWorld(vp, cursor);
    const after = zoomAt(vp, cursor, 1.5);
    const afterWorld = screenToWorld(after, cursor);
    expect(afterWorld.x).toBeCloseTo(before.x);
    expect(afterWorld.y).toBeCloseTo(before.y);
    expect(after.k).toBeCloseTo(1.5);
  });

  it('clamps the zoom range', () => {
    expect(zoomAt({ x: 0, y: 0, k: 1.9 }, { x: 0, y: 0 }, 10).k).toBe(ZOOM_MAX);
    expect(zoomAt({ x: 0, y: 0, k: 0.06 }, { x: 0, y: 0 }, 0.01).k).toBe(ZOOM_MIN);
  });
});

describe('coordinate conversion', () => {
  it('round-trips between screen and world', () => {
    const vp = { x: -120, y: 35, k: 0.75 };
    const p = { x: 512, y: 96 };
    const back = worldToScreen(vp, screenToWorld(vp, p));
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });
});

describe('fitToRect', () => {
  it('fits both dimensions with padding and centers the content', () => {
    const content = { x: 100, y: 100, w: 1000, h: 500 };
    const view = { w: 800, h: 600 };
    const vp = fitToRect(content, view, 40);
    expect(vp.k).toBeCloseTo(Math.min((800 - 80) / 1000, (600 - 80) / 500));
    const center = worldToScreen(vp, { x: 600, y: 350 });
    expect(center.x).toBeCloseTo(400);
    expect(center.y).toBeCloseTo(300);
  });

  it('never exceeds the maximum zoom for tiny content', () => {
    expect(fitToRect({ x: 0, y: 0, w: 10, h: 10 }, { w: 800, h: 600 }).k).toBe(ZOOM_MAX);
  });
});

describe('resetZoom', () => {
  it('returns zoom 1 centered on the content', () => {
    const vp = resetZoom({ x: 0, y: 0, w: 200, h: 100 }, { w: 800, h: 600 });
    expect(vp.k).toBe(1);
    expect(worldToScreen(vp, { x: 100, y: 50 })).toEqual({ x: 400, y: 300 });
  });
});

describe('wheelFactor', () => {
  it('steps by the zoom step in line mode', () => {
    expect(wheelFactor({ deltaY: -3, deltaMode: 1 })).toBe(ZOOM_STEP);
    expect(wheelFactor({ deltaY: 3, deltaMode: 1 })).toBe(1 / ZOOM_STEP);
  });

  it('scales smoothly and is clamped in pixel mode', () => {
    expect(wheelFactor({ deltaY: -50, deltaMode: 0 })).toBeCloseTo(ZOOM_STEP);
    expect(wheelFactor({ deltaY: -5000, deltaMode: 0 })).toBe(1.25);
    expect(wheelFactor({ deltaY: 0, deltaMode: 0 })).toBe(1);
  });
});

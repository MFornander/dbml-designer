import {
  FIT_PADDING, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP,
} from './constants';
import type { Point, Rect, Size } from './rect';

/** Screen = world * k + (x, y). */
export interface Viewport {
  x: number;
  y: number;
  k: number;
}

export const IDENTITY_VIEWPORT: Viewport = {
  x: 0,
  y: 0,
  k: 1,
};

export function clampZoom (k: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k));
}

export function screenToWorld (vp: Viewport, p: Point): Point {
  return {
    x: (p.x - vp.x) / vp.k,
    y: (p.y - vp.y) / vp.k,
  };
}

export function worldToScreen (vp: Viewport, p: Point): Point {
  return {
    x: p.x * vp.k + vp.x,
    y: p.y * vp.k + vp.y,
  };
}

/** Zoom by `factor` keeping the world point under `screenPt` fixed. */
export function zoomAt (vp: Viewport, screenPt: Point, factor: number): Viewport {
  const k = clampZoom(vp.k * factor);
  if (k === vp.k) return vp;
  const r = k / vp.k;
  return {
    k,
    x: screenPt.x - (screenPt.x - vp.x) * r,
    y: screenPt.y - (screenPt.y - vp.y) * r,
  };
}

export function panBy (vp: Viewport, dx: number, dy: number): Viewport {
  return {
    ...vp,
    x: vp.x + dx,
    y: vp.y + dy,
  };
}

/** Center `content` in `view` at the largest zoom (up to `maxK`) that fits with padding. */
export function fitToRect (content: Rect, view: Size, pad: number = FIT_PADDING, maxK: number = ZOOM_MAX): Viewport {
  if (content.w <= 0 || content.h <= 0 || view.w <= 0 || view.h <= 0) return IDENTITY_VIEWPORT;
  const availW = Math.max(1, view.w - 2 * pad);
  const availH = Math.max(1, view.h - 2 * pad);
  const k = clampZoom(Math.min(maxK, availW / content.w, availH / content.h));
  return {
    k,
    x: view.w / 2 - (content.x + content.w / 2) * k,
    y: view.h / 2 - (content.y + content.h / 2) * k,
  };
}

/** Zoom 1 with the content (or the origin) centered. */
export function resetZoom (content: Rect | null, view: Size): Viewport {
  if (!content) return IDENTITY_VIEWPORT;
  return {
    k: 1,
    x: view.w / 2 - (content.x + content.w / 2),
    y: view.h / 2 - (content.y + content.h / 2),
  };
}

/**
 * Zoom factor for a wheel event. Line-mode deltas step by ZOOM_STEP; pixel-mode
 * (trackpads) scale smoothly and are clamped so one event cannot jump too far.
 */
export function wheelFactor (e: { deltaY: number; deltaMode: number }): number {
  if (e.deltaY === 0) return 1;
  if (e.deltaMode === 1 || e.deltaMode === 2) {
    return e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
  }
  const f = Math.pow(ZOOM_STEP, -e.deltaY / 50);
  return Math.min(1.25, Math.max(1 / 1.25, f));
}

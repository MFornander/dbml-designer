import type { Point, Rect, Size } from './rect';

export interface TooltipPlacement {
  /** Gap between the anchor's edge and the tooltip. */
  distance: number;
  /** Shift of the tooltip's top relative to the anchor's top; negative moves it up. */
  skidding: number;
  /** Minimum gap kept to the pane edges. */
  margin: number;
}

/** Tables, fields, groups, and notes: just past the box, top aligned with the hovered row. */
export const BOX_PLACEMENT: TooltipPlacement = {
  distance: 12,
  skidding: -12,
  margin: 4,
};

/** Edges: the tooltip trails the cursor. */
export const CURSOR_PLACEMENT: TooltipPlacement = {
  distance: 15,
  skidding: -12,
  margin: 4,
};

/**
 * dbdiagram's "right-start" popover placement. The tooltip sits to the right of the anchor
 * with its top aligned to the anchor's top (plus `skidding`). It flips to the left when it
 * would leave the pane on the right; when neither side has room it takes the roomier side and
 * is clamped inside. Vertically it is clamped so it never leaves the pane. A pane that has not
 * been measured yet (zero size) imposes no limits.
 */
export function placeTooltip (anchor: Rect, size: Size, view: Size, o: TooltipPlacement): Point {
  const rightX = anchor.x + anchor.w + o.distance;
  const leftX = anchor.x - o.distance - size.w;
  let x = rightX;
  if (view.w > 0 && rightX + size.w > view.w - o.margin) {
    if (leftX >= o.margin) {
      x = leftX;
    } else {
      const roomRight = view.w - (anchor.x + anchor.w);
      x = roomRight >= anchor.x ? rightX : leftX;
      x = Math.max(o.margin, Math.min(x, view.w - size.w - o.margin));
    }
  }
  let y = anchor.y + o.skidding;
  if (view.h > 0) y = Math.max(o.margin, Math.min(y, view.h - size.h - o.margin));
  return {
    x: Math.round(x),
    y: Math.round(y),
  };
}

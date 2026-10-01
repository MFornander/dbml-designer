import { HEADER_ANCHOR_Y, ROW_H, SELF_REF_GAP } from './constants';
import { right, type Point, type Rect } from './rect';

export type Side = 'left' | 'right';

export interface AnchorPoint extends Point {
  side: Side;
}

/**
 * Which side each table's endpoint leaves from. Tables side by side connect
 * across the gap; overlapping tables both use their left edge.
 */
export function pickSides (a: Rect, b: Rect): [Side, Side] {
  if (right(a) <= b.x) return ['right', 'left'];
  if (a.x >= right(b)) return ['left', 'right'];
  return ['left', 'left'];
}

/** Vertical center of a field row, or of the header when `rowIndex` is null. */
export function anchorY (box: Rect, rowIndex: number | null): number {
  if (rowIndex === null) return box.y + HEADER_ANCHOR_Y;
  return box.y + ROW_H * (rowIndex + 1) + ROW_H / 2;
}

/**
 * The single point every edge for a row (or the header) leaves from. Edges sharing a row are not
 * spread apart; they overlap along the stub and separate at their own bend, like dbdiagram.
 */
export function endpointAnchor (box: Rect, rowIndex: number | null, side: Side): AnchorPoint {
  return {
    x: side === 'left' ? box.x : right(box),
    y: anchorY(box, rowIndex),
    side,
  };
}

/** Anchor at the vertical center of a box (used for collapsed table groups). */
export function centerAnchor (box: Rect, side: Side): AnchorPoint {
  return {
    x: side === 'left' ? box.x : right(box),
    y: box.y + box.h / 2,
    side,
  };
}

/**
 * A self-referencing edge leaves and re-enters the table's right edge. Between two different
 * visible rows it runs field to field, a bracket beside the table like dbdiagram draws it; when
 * the rows coincide or are hidden it loops out of the header instead, its ends a fixed distance
 * apart.
 */
export function selfRefAnchors (
  box: Rect,
  rowA: number | null = null,
  rowB: number | null = null,
): [AnchorPoint, AnchorPoint] {
  if (rowA !== null && rowB !== null && rowA !== rowB) {
    return [endpointAnchor(box, rowA, 'right'), endpointAnchor(box, rowB, 'right')];
  }
  const y = box.y + HEADER_ANCHOR_Y;
  return [
    {
      x: right(box),
      y: y - SELF_REF_GAP / 2,
      side: 'right',
    },
    {
      x: right(box),
      y: y + SELF_REF_GAP / 2,
      side: 'right',
    },
  ];
}

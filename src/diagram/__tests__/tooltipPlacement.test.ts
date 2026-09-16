import { describe, it, expect } from 'vitest';
import { BOX_PLACEMENT, CURSOR_PLACEMENT, placeTooltip } from '@/diagram/geometry/tooltipPlacement';

const view = {
  w: 800,
  h: 600,
};
const size = {
  w: 260,
  h: 120,
};

describe('placeTooltip', () => {
  it('sits to the right of the anchor, top aligned and nudged up', () => {
    const anchor = {
      x: 100,
      y: 200,
      w: 180,
      h: 32,
    };
    expect(placeTooltip(anchor, size, view, BOX_PLACEMENT)).toEqual({
      x: 100 + 180 + 12,
      y: 200 - 12,
    });
  });

  it('trails the cursor from a zero-size anchor', () => {
    const cursor = {
      x: 300,
      y: 150,
      w: 0,
      h: 0,
    };
    expect(placeTooltip(cursor, size, view, CURSOR_PLACEMENT)).toEqual({
      x: 315,
      y: 138,
    });
  });

  it('flips to the left when the right side would leave the pane', () => {
    const anchor = {
      x: 600,
      y: 100,
      w: 150,
      h: 32,
    };
    expect(placeTooltip(anchor, size, view, BOX_PLACEMENT)).toEqual({
      x: 600 - 12 - 260,
      y: 88,
    });
  });

  it('takes the roomier side and clamps when neither side fits', () => {
    const anchor = {
      x: 200,
      y: 100,
      w: 400,
      h: 32,
    };
    // 200px of room on the left, 200px on the right: right wins ties, then clamps to the edge.
    expect(placeTooltip(anchor, size, view, BOX_PLACEMENT).x).toBe(800 - 260 - 4);
    const leftHeavy = {
      ...anchor,
      x: 250,
      w: 400,
    };
    // 250px on the left vs 150px on the right: left side, clamped to the margin.
    expect(placeTooltip(leftHeavy, size, view, BOX_PLACEMENT).x).toBe(4);
  });

  it('keeps the tooltip inside the pane vertically', () => {
    const top = {
      x: 0,
      y: 0,
      w: 100,
      h: 32,
    };
    expect(placeTooltip(top, size, view, BOX_PLACEMENT).y).toBe(4);
    const bottom = {
      ...top,
      y: 590,
    };
    expect(placeTooltip(bottom, size, view, BOX_PLACEMENT).y).toBe(600 - 120 - 4);
  });

  it('applies no limits before the pane has a size', () => {
    const anchor = {
      x: 700,
      y: -30,
      w: 100,
      h: 32,
    };
    expect(placeTooltip(anchor, size, { w: 0, h: 0 }, BOX_PLACEMENT)).toEqual({
      x: 812,
      y: -42,
    });
  });
});

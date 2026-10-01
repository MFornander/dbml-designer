import {
  GROUP_COLLAPSED_BODY_H, GROUP_COLLAPSED_MIN_W, GROUP_HEADER_CONTROLS_W, GROUP_HEADER_H, GROUP_NAME_X, GROUP_PAD,
  NOTE_GAP, NOTE_H, NOTE_W, PLACE_COL_GAP, PLACE_COL_HEIGHT, PLACE_ROW_GAP,
} from './constants';
import {
  bottom, inflate, intersects, right, snap8, union, type Point, type Rect, type Size,
} from './rect';

export interface PlacementItem {
  key: string;
  w: number;
  h: number;
  /** Declaration order, used as a stable tie-breaker. */
  order: number;
  /** Items sharing a group are packed next to each other. */
  groupOrder?: number;
}

export interface PlacementOptions {
  colGap: number;
  rowGap: number;
  colHeight: number;
}

const DEFAULTS: PlacementOptions = {
  colGap: PLACE_COL_GAP,
  rowGap: PLACE_ROW_GAP,
  colHeight: PLACE_COL_HEIGHT,
};

/**
 * Deterministic column packing for items that have no stored position.
 * Starts to the right of everything already `occupied`, fills columns top to
 * bottom, pushes down past any overlap, and snaps every coordinate to the grid.
 */
export function placeNewItems (
  pending: readonly PlacementItem[],
  occupied: readonly Rect[],
  opts: Partial<PlacementOptions> = {},
): Map<string, Point> {
  const o = {
    ...DEFAULTS,
    ...opts,
  };
  const result = new Map<string, Point>();
  if (pending.length === 0) return result;

  const sorted = [...pending].sort((a, b) => {
    const ga = a.groupOrder ?? Number.POSITIVE_INFINITY;
    const gb = b.groupOrder ?? Number.POSITIVE_INFINITY;
    if (ga !== gb) return ga - gb;
    return a.order - b.order;
  });

  const taken: Rect[] = [...occupied];
  let x = taken.length > 0 ? snap8(Math.max(...taken.map(right)) + o.colGap) : 0;
  let y = 0;
  let colW = 0;

  for (const item of sorted) {
    if (y > 0 && y + item.h > o.colHeight) {
      x = snap8(x + colW + o.colGap);
      y = 0;
      colW = 0;
    }
    const r: Rect = {
      x,
      y,
      w: item.w,
      h: item.h,
    };
    // Push down until the (padded) rect clears every occupied rect.
    for (let guard = 0; guard < 10_000; guard++) {
      const hit = taken.find((t) => intersects(inflate(r, o.rowGap / 2), t));
      if (!hit) break;
      r.y = snap8(bottom(hit) + o.rowGap);
    }
    result.set(item.key, {
      x: r.x,
      y: r.y,
    });
    taken.push(r);
    y = r.y + item.h + o.rowGap;
    colW = Math.max(colW, item.w);
  }
  return result;
}

/** A lineage edge between two tables, by key. */
export interface LineageLink {
  upstream: string;
  downstream: string;
}

/**
 * Place new tables that lineage connects to a placed table next to it, so a diagram that grows a
 * few tables at a time extends from where they connect: an upstream table left of the table that
 * reads it, else a downstream table right of the one it reads, level with it and pushed down past
 * whatever is in the way, so several stack top to bottom. Tables placed here anchor the ones
 * after; placed tables never move. Only the tables it could place are returned: the others have
 * no placed neighbour.
 */
export function placeByLineage (
  pending: readonly PlacementItem[],
  links: readonly LineageLink[],
  placed: ReadonlyMap<string, Rect>,
  occupied: readonly Rect[],
  opts: Partial<PlacementOptions> = {},
): Map<string, Point> {
  const o = {
    ...DEFAULTS,
    ...opts,
  };
  const result = new Map<string, Point>();
  const at = new Map(placed);
  const taken: Rect[] = [...occupied];
  let waiting = [...pending].sort((a, b) => a.order - b.order);
  for (let progress = true; progress && waiting.length > 0;) {
    progress = false;
    const still: PlacementItem[] = [];
    for (const item of waiting) {
      const reader = links.find((l) => l.upstream === item.key && l.downstream !== item.key && at.has(l.downstream));
      const source = reader ? undefined : links.find((l) => l.downstream === item.key && l.upstream !== item.key && at.has(l.upstream));
      if (!reader && !source) {
        still.push(item);
        continue;
      }
      const anchor = at.get(reader ? reader.downstream : source!.upstream)!;
      const r: Rect = {
        x: snap8(reader ? anchor.x - o.colGap - item.w : right(anchor) + o.colGap),
        y: snap8(anchor.y),
        w: item.w,
        h: item.h,
      };
      for (let guard = 0; guard < 10_000; guard++) {
        const hit = taken.find((t) => intersects(inflate(r, o.rowGap / 2), t));
        if (!hit) break;
        r.y = snap8(bottom(hit) + o.rowGap);
      }
      result.set(item.key, {
        x: r.x,
        y: r.y,
      });
      at.set(item.key, r);
      taken.push(r);
      progress = true;
    }
    waiting = still;
  }
  return result;
}

/**
 * Where a table goes below another, such as a companion below its owner: left-aligned with it,
 * below it, and pushed down past whatever in `occupied` is in the way. Nothing placed moves.
 */
export function placeBelow (item: Pick<PlacementItem, 'w' | 'h'>, owner: Rect, occupied: readonly Rect[], opts: Partial<PlacementOptions> = {}): Point {
  const o = {
    ...DEFAULTS,
    ...opts,
  };
  const r: Rect = {
    x: snap8(owner.x),
    y: snap8(bottom(owner) + o.rowGap),
    w: item.w,
    h: item.h,
  };
  for (let guard = 0; guard < 10_000; guard++) {
    const hit = occupied.find((t) => intersects(inflate(r, o.rowGap / 2), t));
    if (!hit) break;
    r.y = snap8(bottom(hit) + o.rowGap);
  }
  return {
    x: r.x,
    y: r.y,
  };
}

/** Stack new sticky notes in a column to the right of the current content. */
export function placeNewNotes (keys: readonly string[], occupied: readonly Rect[]): Map<string, Point> {
  const result = new Map<string, Point>();
  if (keys.length === 0) return result;
  const bounds = union(occupied);
  const x = bounds ? snap8(right(bounds) + PLACE_COL_GAP) : 0;
  let y = bounds ? snap8(bounds.y) : 0;
  const taken: Rect[] = [...occupied];
  for (const key of keys) {
    const r: Rect = {
      x,
      y,
      w: NOTE_W,
      h: NOTE_H,
    };
    for (let guard = 0; guard < 10_000; guard++) {
      const hit = taken.find((t) => intersects(r, t));
      if (!hit) break;
      r.y = snap8(bottom(hit) + NOTE_GAP);
    }
    result.set(key, {
      x: r.x,
      y: r.y,
    });
    taken.push(r);
    y = r.y + NOTE_H + NOTE_GAP;
  }
  return result;
}

/** Bounding box of a table group: members padded, plus a header strip above. */
export function groupBounds (memberBoxes: readonly Rect[]): Rect | null {
  const u = union(memberBoxes);
  if (!u) return null;
  const padded = inflate(u, GROUP_PAD);
  return {
    x: padded.x,
    y: padded.y - GROUP_HEADER_H,
    w: padded.w,
    h: padded.h + GROUP_HEADER_H,
  };
}

/** Size of the box a collapsed group is drawn as: a header wide enough for its name and controls, over a short body. */
export function collapsedGroupSize (nameW: number): Size {
  return {
    w: Math.max(GROUP_COLLAPSED_MIN_W, Math.ceil(GROUP_NAME_X + nameW + GROUP_HEADER_CONTROLS_W)),
    h: GROUP_HEADER_H + GROUP_COLLAPSED_BODY_H,
  };
}

export function contentBounds (rects: readonly Rect[]): Rect | null {
  return union(rects);
}

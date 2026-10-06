/**
 * Arrange by group: a deterministic layered layout for pipeline models. Table groups become
 * columns ordered by the lineage between their members, tables are layered by lineage inside
 * their column, and header colors form rows that line up across columns. Only `Dep` lineage
 * drives placement; refs play no part. `arrangePending` places a few new tables the same way
 * without moving anything else.
 */
import {
  GRID, GROUP_HEADER_H, GROUP_PAD, HEADER_ANCHOR_Y, NOTE_GAP, PLACE_ROW_GAP,
} from './constants';
import { groupBounds } from './layout';
import { dependencyLayers } from './lineageLayout';
import {
  bottom, inflate, intersects, right, snap8, union, type Point, type Rect, type Size,
} from './rect';
import type { DepEdgeVM, GroupVM, TableVM } from '../types';
import type { GroupKey, TableKey } from '../keys';

/** A table's footprint; `TableSize` fits. */
export interface ArrangeSize {
  width: number;
  height: number;
}

export interface ArrangeNote {
  key: string;
  w: number;
  h: number;
}

export interface ArrangeInput {
  /** The tables to arrange, the ones the view shows, in declaration order. */
  tables: readonly TableVM[];
  /** Table groups in declaration order; members missing from `tables` are left out. */
  groups: readonly GroupVM[];
  /** Table-level lineage edges. */
  deps: readonly DepEdgeVM[];
  /** Table sizes, at the all-fields level so the result holds at every detail level. */
  sizes: ReadonlyMap<TableKey, ArrangeSize>;
  /** Collapsed groups with the size of the box each is drawn as; that box is all the column holds. */
  collapsed?: ReadonlyMap<GroupKey, Size>;
  /** Sticky notes to stack beside the tables, in declaration order. */
  notes?: readonly ArrangeNote[];
}

export interface ArrangeOptions {
  /** Between neighbouring columns: group boxes and runs of tables in no group. */
  colGap: number;
  /** Between the dependency layers inside a column. */
  layerGap: number;
  /** Between tables stacked in a layer, and between the columns a tall layer wraps into. */
  rowGap: number;
  /**
   * Width over height the arrangement aims for, such as the pane's: a layer taller than that
   * allows wraps into several columns. 0 never wraps.
   */
  aspect: number;
}

/** One column of the arrangement. */
export interface ArrangeColumn {
  /** A table group; tables in no group, placed by their lineage; or tables with neither, packed last. */
  kind: 'group' | 'lineage' | 'unrelated';
  /** The group of a `group` column. */
  group?: GroupKey;
  /** Its tables in sub-columns left to right (dependency layers, or packed columns), each top to bottom. */
  layers: TableKey[][];
}

export interface ArrangeResult {
  /** Snapped positions of every table and note in the input. */
  positions: Map<string, Point>;
  /** The columns, left to right. */
  columns: ArrangeColumn[];
}

/** Width over height aimed at when packing tables that have nothing to line up with, and by default for the whole arrangement. */
const PACK_ASPECT = 1.6;

/** The most columns one layer wraps into. */
const MAX_WRAP = 16;

const DEFAULTS: ArrangeOptions = {
  colGap: 96,
  layerGap: 80,
  rowGap: PLACE_ROW_GAP,
  aspect: PACK_ASPECT,
};

const FALLBACK_SIZE: ArrangeSize = {
  width: 200,
  height: 32,
};

/** Gaps for tables drawn with their names only, closer to each other since they are short. */
export const NAMES_GAPS: Readonly<Partial<ArrangeOptions>> = {
  colGap: 48,
  layerGap: 56,
  rowGap: 16,
};

/** Round up to the grid, so gaps never shrink below what was asked for. */
function ceil8 (v: number): number {
  return Math.ceil(v / GRID) * GRID;
}

function compare (a: number, b: number): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Kahn's algorithm taking the earliest declared of the nodes that are ready, so declaration order
 * decides wherever lineage does not. A cycle is broken by taking the earliest declared node left.
 */
function topologicalOrder<T> (nodes: readonly T[], preds: ReadonlyMap<T, ReadonlySet<T>>, rank: (n: T) => number): T[] {
  const out: T[] = [];
  const done = new Set<T>();
  const remaining = new Set(nodes);
  const earliest = (list: readonly T[]) => list.reduce<T | undefined>((best, n) => (best === undefined || rank(n) < rank(best) ? n : best), undefined);
  while (remaining.size > 0) {
    const left = [...remaining];
    const next = earliest(left.filter((n) => [...preds.get(n) ?? []].every((p) => done.has(p)))) ?? earliest(left)!;
    out.push(next);
    done.add(next);
    remaining.delete(next);
  }
  return out;
}

interface PackItem {
  key: string;
  w: number;
  h: number;
}

/** Height of a block of packed items: at least `atLeast`, else roughly PACK_ASPECT wide. */
function packHeight (items: readonly PackItem[], gapX: number, gapY: number, atLeast: number): number {
  const area = items.reduce((sum, i) => sum + (i.w + gapX) * (i.h + gapY), 0);
  return Math.max(atLeast, Math.sqrt(area / PACK_ASPECT), ...items.map((i) => i.h));
}

/** Fill columns top to bottom from (x0, y0), starting a new column past `height`. */
function packColumns (items: readonly PackItem[], x0: number, y0: number, height: number, gapX: number, gapY: number) {
  const positions = new Map<string, Point>();
  const columns: string[][] = [];
  let current: string[] = [];
  let x = x0;
  let y = y0;
  let colW = 0;
  let maxRight = x0;
  for (const item of items) {
    if (current.length > 0 && y + item.h > y0 + height) {
      columns.push(current);
      current = [];
      x = ceil8(x + colW + gapX);
      y = y0;
      colW = 0;
    }
    positions.set(item.key, {
      x,
      y,
    });
    current.push(item.key);
    y = ceil8(y + item.h + gapY);
    colW = Math.max(colW, item.w);
    maxRight = Math.max(maxRight, x + item.w);
  }
  if (current.length > 0) columns.push(current);
  return {
    positions,
    columns,
    right: maxRight,
  };
}

/**
 * Lay out every table and note given, deterministically: the same input always gives the same
 * positions, snapped to the grid, whatever they were before.
 *
 * - Table groups become columns in a topological order of the lineage between their members,
 *   ties broken by declaration order. Inside its column a group's tables are layered by the
 *   lineage among them, so every `Dep` edge points left to right unless a cycle forbids it.
 * - A table in no group is placed by its own lineage: right after the last group upstream of it,
 *   or with none, just before the first group that needs it. Those that land between the same
 *   two groups share a column, layered the same way.
 * - Each layer is ordered by header color, in the order the colors first appear from left to
 *   right (tables without one last), so a color forms a row across columns; then by the mean
 *   vertical position of the upstream tables' headers, to reduce crossings; then by declaration
 *   order.
 * - Columns are top-aligned. A collapsed group takes only its box's room; its hidden members are
 *   laid out as if open, so the box lands in its slot and the group opens in order (over its
 *   neighbours, until the next Arrange).
 * - Tables with no group and no lineage are packed in columns at the right, then the notes.
 */
export function arrangeByGroup (input: ArrangeInput, opts: Partial<ArrangeOptions> = {}): ArrangeResult {
  const o = {
    ...DEFAULTS,
    ...opts,
  };
  const tableByKey = new Map<TableKey, TableVM>();
  const order = new Map<TableKey, number>();
  input.tables.forEach((t, i) => {
    tableByKey.set(t.key, t);
    order.set(t.key, i);
  });
  const byOrder = (a: TableKey, b: TableKey) => order.get(a)! - order.get(b)!;
  const sizeOf = (k: TableKey): ArrangeSize => input.sizes.get(k) ?? FALLBACK_SIZE;

  // Table-level lineage among the tables being arranged.
  const up = new Map<TableKey, Set<TableKey>>();
  const down = new Map<TableKey, Set<TableKey>>();
  for (const t of input.tables) {
    up.set(t.key, new Set());
    down.set(t.key, new Set());
  }
  for (const d of input.deps) {
    const from = d.upstream.tableKey;
    const to = d.downstream.tableKey;
    if (from === to || !order.has(from) || !order.has(to)) continue;
    down.get(from)!.add(to);
    up.get(to)!.add(from);
  }
  const hasLineage = (k: TableKey) => up.get(k)!.size > 0 || down.get(k)!.size > 0;

  // The groups that have tables to arrange, and their members in declaration order.
  const groupRank = new Map<GroupKey, number>();
  input.groups.forEach((g, i) => groupRank.set(g.key, i));
  const members = new Map<GroupKey, TableKey[]>();
  const groupOf = new Map<TableKey, GroupKey>();
  for (const t of input.tables) {
    if (!t.groupKey || !groupRank.has(t.groupKey)) continue;
    if (!members.has(t.groupKey)) members.set(t.groupKey, []);
    members.get(t.groupKey)!.push(t.key);
    groupOf.set(t.key, t.groupKey);
  }

  // Group order: one group precedes another when a member reaches one of the other's, directly or
  // through tables in no group.
  const groupPreds = new Map<GroupKey, Set<GroupKey>>();
  for (const g of members.keys()) groupPreds.set(g, new Set());
  for (const [g, keys] of members) {
    const seen = new Set<TableKey>();
    const stack = keys.flatMap((k) => [...down.get(k)!]);
    while (stack.length > 0) {
      const k = stack.pop()!;
      if (seen.has(k)) continue;
      seen.add(k);
      const h = groupOf.get(k);
      if (h === undefined) stack.push(...down.get(k)!);
      else if (h !== g) groupPreds.get(h)!.add(g);
    }
  }
  const groupSeq = topologicalOrder([...members.keys()], groupPreds, (g) => groupRank.get(g)!);
  const groupPos = new Map(groupSeq.map((g, i) => [g, i]));

  // A table in no group goes right after the last group upstream of it, or with none, just before
  // the first group downstream of it (at the end when there is none). Slot i lies right after group
  // i; slot -1 comes before the first group.
  const loose = input.tables.filter((t) => !groupOf.has(t.key) && hasLineage(t.key)).map((t) => t.key);
  const looseSet = new Set(loose);
  const loosePreds = new Map(loose.map((k) => [k, new Set([...up.get(k)!].filter((p) => looseSet.has(p)))]));
  const looseSeq = topologicalOrder(loose, loosePreds, (k) => order.get(k)!);
  const lastUpstream = new Map<TableKey, number>();
  for (const k of looseSeq) {
    let pos = -1;
    for (const p of up.get(k)!) {
      const g = groupOf.get(p);
      pos = Math.max(pos, g === undefined ? lastUpstream.get(p) ?? -1 : groupPos.get(g)!);
    }
    lastUpstream.set(k, pos);
  }
  const slot = new Map<TableKey, number>();
  for (const k of [...looseSeq].reverse()) {
    let s = lastUpstream.get(k)!;
    if (s < 0) {
      s = groupSeq.length - 1;
      for (const n of down.get(k)!) {
        const g = groupOf.get(n);
        s = Math.min(s, g === undefined ? slot.get(n) ?? s : groupPos.get(g)! - 1);
      }
    }
    slot.set(k, s);
  }
  const unrelated = input.tables.filter((t) => !groupOf.has(t.key) && !hasLineage(t.key)).map((t) => t.key);

  // Columns: each group its own, with the tables in no group that share a slot between them.
  const columns: { kind: 'group' | 'lineage'; group?: GroupKey; keys: TableKey[] }[] = [];
  const pushRun = (s: number) => {
    const keys = loose.filter((k) => slot.get(k) === s);
    if (keys.length > 0) {
      columns.push({
        kind: 'lineage',
        keys,
      });
    }
  };
  pushRun(-1);
  groupSeq.forEach((g, i) => {
    columns.push({
      kind: 'group',
      group: g,
      keys: members.get(g)!,
    });
    pushRun(i);
  });

  // Header colors rank in the order they first appear from left to right; no color comes last.
  const colorRank = new Map<string, number>();
  const seeColor = (k: TableKey) => {
    const c = tableByKey.get(k)!.headerColor;
    if (c && !colorRank.has(c)) colorRank.set(c, colorRank.size);
  };
  for (const col of columns) [...col.keys].sort(byOrder).forEach(seeColor);
  unrelated.forEach(seeColor);
  const colorOf = (k: TableKey) => {
    const c = tableByKey.get(k)!.headerColor;
    return c ? colorRank.get(c)! : Number.POSITIVE_INFINITY;
  };

  // Each column's dependency layers, in declaration order until placing orders them.
  const columnLayers = columns.map((col) => {
    const byLayer = dependencyLayers(col.keys, up, down, byOrder);
    const layers: TableKey[][] = Array.from({ length: Math.max(...byLayer.values()) + 1 }, () => []);
    for (const k of [...col.keys].sort(byOrder)) layers[byLayer.get(k)!]!.push(k);
    return layers;
  });

  /** The rows a layer takes when it wraps into `n` columns, filled left to right and then down. */
  const wrapRows = (layer: readonly TableKey[], n: number) => Array.from({ length: Math.ceil(layer.length / n) }, (_, r) => layer.slice(r * n, (r + 1) * n));
  const rowsHeight = (rows: readonly (readonly TableKey[])[]) => rows.reduce((y, row) => ceil8(y + Math.max(...row.map((k) => sizeOf(k).height)) + o.rowGap), 0) - o.rowGap;

  // Tables start low enough for group headers to fit above them.
  const top = ceil8(GROUP_PAD + GROUP_HEADER_H);

  /**
   * Place every column from the left, wrapping a layer taller than `cap` into as few columns as
   * keep it within. A layer is ordered by color, then by where what it reads sits, else by where
   * what reads it sat in `readers`, then by declaration.
   */
  const placeColumns = (cap: number, readers: ReadonlyMap<TableKey, number> | null) => {
    const positions = new Map<string, Point>();
    const result: ArrangeColumn[] = [];
    /** Where lineage edges attach to each placed table: its header, or the box of its collapsed group. */
    const anchorY = new Map<TableKey, number>();
    const meanY = (keys: Iterable<TableKey>, at: ReadonlyMap<TableKey, number>) => {
      let sum = 0;
      let n = 0;
      for (const k of keys) {
        const y = at.get(k);
        if (y === undefined) continue;
        sum += y;
        n += 1;
      }
      return n > 0 ? sum / n : Number.POSITIVE_INFINITY;
    };
    const orderLayer = (layer: TableKey[]) => {
      const bary = new Map(layer.map((k) => {
        const y = meanY(up.get(k)!, anchorY);
        return [k, y === Number.POSITIVE_INFINITY && readers ? meanY(down.get(k)!, readers) : y];
      }));
      layer.sort((a, b) => compare(colorOf(a), colorOf(b)) || compare(bary.get(a)!, bary.get(b)!) || byOrder(a, b));
    };

    let contentTop = top;
    let tallest = 0;
    let x = 0;
    columns.forEach((col, c) => {
      const inset = col.kind === 'group' ? GROUP_PAD : 0;
      const left = ceil8(x + inset);
      const placed: TableKey[][] = [];
      let layerX = left;
      let colRight = left;
      let colBottom = top;
      for (const source of columnLayers[c]!) {
        const layer = [...source];
        orderLayer(layer);
        let n = 1;
        while (n < Math.min(layer.length, MAX_WRAP) && rowsHeight(wrapRows(layer, n)) > cap) n += 1;
        const rows = wrapRows(layer, n);
        const widths = Array.from({ length: n }, (_, j) => Math.max(0, ...rows.map((row) => (row[j] ? sizeOf(row[j]!).width : 0))));
        const xs = [layerX];
        for (let j = 1; j < n; j++) xs.push(ceil8(xs[j - 1]! + widths[j - 1]! + o.rowGap));
        let y = top;
        for (const row of rows) {
          row.forEach((k, j) => {
            positions.set(k, {
              x: xs[j]!,
              y,
            });
            anchorY.set(k, y + HEADER_ANCHOR_Y);
          });
          const h = Math.max(...row.map((k) => sizeOf(k).height));
          colBottom = Math.max(colBottom, y + h);
          y = ceil8(y + h + o.rowGap);
        }
        placed.push(...widths.map((_, j) => rows.flatMap((row) => (row[j] ? [row[j]!] : []))));
        colRight = xs[n - 1]! + widths[n - 1]!;
        layerX = ceil8(colRight + o.layerGap);
      }
      if (col.group) contentTop = Math.min(contentTop, top - GROUP_PAD - GROUP_HEADER_H);
      const box = col.group ? input.collapsed?.get(col.group) : undefined;
      if (box) {
        // Folded: the box sits at the top left of its members' bounds and stands in for them.
        const boxX = left - GROUP_PAD;
        const boxY = top - GROUP_PAD - GROUP_HEADER_H;
        for (const k of col.keys) anchorY.set(k, boxY + box.h / 2);
        tallest = Math.max(tallest, boxY + box.h - top);
        x = ceil8(boxX + box.w + o.colGap);
      } else {
        tallest = Math.max(tallest, colBottom - top);
        x = ceil8(colRight + inset + o.colGap);
      }
      result.push({
        kind: col.kind,
        ...(col.group ? { group: col.group } : {}),
        layers: placed,
      });
    });
    return {
      positions,
      result,
      anchorY,
      contentTop,
      tallest,
      x,
    };
  };

  // The tallest a layer may stand: of as many heights as the tallest layer wraps into, the one
  // that lets the columns fit a pane of the aspect asked for at the largest zoom, the tallest
  // of those that tie. Then once more with each layer that reads nothing ordered by its readers.
  const natural = placeColumns(Number.POSITIVE_INFINITY, null);
  let cap = Number.POSITIVE_INFINITY;
  if (o.aspect > 0) {
    const tallestLayer = Math.max(0, ...columnLayers.flat().map((layer) => rowsHeight(layer.map((k) => [k]))));
    const fitScale = (p: typeof natural) => Math.max((p.x - o.colGap) / o.aspect, p.tallest + top - p.contentTop);
    let best = fitScale(natural);
    for (let n = 2; n <= MAX_WRAP; n++) {
      const tryCap = tallestLayer / n;
      const scale = fitScale(placeColumns(tryCap, null));
      if (scale < best) {
        best = scale;
        cap = tryCap;
      }
    }
  }
  const first = cap === Number.POSITIVE_INFINITY ? natural : placeColumns(cap, null);
  const final = placeColumns(cap, first.anchorY);
  const { positions, result, contentTop } = final;
  let { tallest, x } = final;

  if (unrelated.length > 0) {
    const items = [...unrelated]
      .sort((a, b) => compare(colorOf(a), colorOf(b)) || byOrder(a, b))
      .map((key) => ({
        key,
        w: sizeOf(key).width,
        h: sizeOf(key).height,
      }));
    const packed = packColumns(items, x, top, packHeight(items, o.layerGap, o.rowGap, tallest), o.layerGap, o.rowGap);
    for (const [k, p] of packed.positions) positions.set(k, p);
    tallest = Math.max(tallest, ...items.map((i) => packed.positions.get(i.key)!.y + i.h - top));
    result.push({
      kind: 'unrelated',
      layers: packed.columns,
    });
    x = ceil8(packed.right + o.colGap);
  }

  const notes = input.notes ?? [];
  if (notes.length > 0) {
    const noteTop = ceil8(contentTop);
    const packed = packColumns(notes, x, noteTop, packHeight(notes, NOTE_GAP, NOTE_GAP, tallest + top - noteTop), NOTE_GAP, NOTE_GAP);
    for (const [k, p] of packed.positions) positions.set(k, p);
  }

  return {
    positions,
    columns: result,
  };
}

export interface PendingInput extends ArrangeInput {
  /** Where the settled tables and the notes are now. */
  current: ReadonlyMap<string, Point>;
  /** The tables to place; every other table and every note stays where it is. */
  pending: ReadonlySet<TableKey>;
}

/**
 * Place only the `pending` tables and leave everything else where it is. Each goes where the full
 * arrangement puts it relative to the nearest placed table of its column (its group, or its run of
 * tables in no group), else relative to its nearest placed lineage neighbour; the rest keep their
 * arranged shape as a block to the right of everything. Each is then pushed down past whatever is
 * in its way, and a new member of a collapsed group stays inside the box that stands in for it.
 */
export function arrangePending (input: PendingInput, opts: Partial<ArrangeOptions> = {}): Map<TableKey, Point> {
  const o = {
    ...DEFAULTS,
    ...opts,
  };
  const full = arrangeByGroup(input, o);
  const target = (k: TableKey) => full.positions.get(k)!;
  const sizeOf = (k: TableKey): ArrangeSize => input.sizes.get(k) ?? FALLBACK_SIZE;
  const tableByKey = new Map(input.tables.map((t) => [t.key, t]));
  const groupOf = (k: TableKey) => tableByKey.get(k)!.groupKey;
  const column = new Map<TableKey, number>();
  full.columns.forEach((c, i) => {
    for (const k of c.layers.flat()) column.set(k, i);
  });
  const neighbours = new Map<TableKey, TableKey[]>();
  for (const d of input.deps) {
    const a = d.upstream.tableKey;
    const b = d.downstream.tableKey;
    if (a === b || !tableByKey.has(a) || !tableByKey.has(b)) continue;
    neighbours.set(a, [...neighbours.get(a) ?? [], b]);
    neighbours.set(b, [...neighbours.get(b) ?? [], a]);
  }

  /** Tables that have their place: the settled ones, then each pending one as it is placed. */
  const at = new Map<TableKey, Point>();
  for (const t of input.tables) {
    const p = input.current.get(t.key);
    if (p && !input.pending.has(t.key)) at.set(t.key, p);
  }
  const boxAt = (k: TableKey): Rect => ({
    ...at.get(k)!,
    w: sizeOf(k).width,
    h: sizeOf(k).height,
  });
  const hidden = (k: TableKey) => {
    const g = groupOf(k);
    return !!g && !!input.collapsed?.has(g);
  };
  const membersAt = (g: GroupKey) => [...at.keys()].filter((k) => groupOf(k) === g);
  const groupBox = (g: GroupKey): Rect | null => {
    const bounds = groupBounds(membersAt(g).map(boxAt));
    const folded = input.collapsed?.get(g);
    return bounds && folded
      ? {
          x: bounds.x,
          y: bounds.y,
          ...folded,
        }
      : bounds;
  };
  const noteBoxes: Rect[] = (input.notes ?? []).flatMap((n) => {
    const p = input.current.get(n.key);
    return p
      ? [{
          ...p,
          w: n.w,
          h: n.h,
        }]
      : [];
  });
  /** What is drawn outside group `g`, or everything without one: tables, group boxes, notes. */
  const outside = (g?: GroupKey): Rect[] => [
    ...[...at.keys()].filter((k) => (g === undefined || groupOf(k) !== g) && !hidden(k)).map(boxAt),
    ...input.groups.filter((h) => h.key !== g).map((h) => groupBox(h.key)).filter((b): b is Rect => b !== null),
    ...noteBoxes,
  ];
  /** Right of everything drawn, with room for a group box around the table. */
  const clearRight = (k: TableKey): number => {
    const content = union(outside());
    return content ? ceil8(right(content) + o.colGap + (groupOf(k) ? GROUP_PAD : 0)) : 0;
  };
  /**
   * Put a table at the first of `candidates` where, pushed down past the tables and boxes in its
   * way, its group's box does not grow into anything else (the last one otherwise).
   */
  const place = (k: TableKey, candidates: readonly Point[]) => {
    const g = groupOf(k);
    let r: Rect = {
      x: 0,
      y: 0,
      w: sizeOf(k).width,
      h: sizeOf(k).height,
    };
    if (g && hidden(k)) {
      // Inside a collapsed group: never above or left of the members, or the box that stands in would move.
      const bounds = union(membersAt(g).map(boxAt));
      r.x = snap8(Math.max(candidates[0]!.x, bounds?.x ?? Number.NEGATIVE_INFINITY));
      r.y = snap8(Math.max(candidates[0]!.y, bounds?.y ?? Number.NEGATIVE_INFINITY));
    } else {
      const around = [...outside(g), ...(g ? membersAt(g).map(boxAt) : [])];
      for (const c of candidates) {
        r = {
          ...r,
          x: snap8(c.x),
          y: snap8(c.y),
        };
        for (let guard = 0; guard < 10_000; guard++) {
          const hit = around.find((b) => intersects(inflate(r, o.rowGap / 2), b));
          if (!hit) break;
          r.y = snap8(bottom(hit) + o.rowGap);
        }
        if (!g || !outside(g).some((b) => intersects(groupBounds([...membersAt(g).map(boxAt), r])!, b))) break;
      }
    }
    at.set(k, {
      x: r.x,
      y: r.y,
    });
  };

  // Left to right and top to bottom as arranged, so a table is pushed down past those above it.
  const pending = input.tables.map((t) => t.key).filter((k) => input.pending.has(k)).sort((a, b) => compare(column.get(a)!, column.get(b)!)
    || compare(target(a).x, target(b).x) || compare(target(a).y, target(b).y));
  const nearest = (k: TableKey, candidates: readonly TableKey[]): TableKey | undefined => {
    let best: TableKey | undefined;
    let bestD = Number.POSITIVE_INFINITY;
    for (const c of candidates) {
      const d = Math.hypot(target(c).x - target(k).x, target(c).y - target(k).y);
      if (d < bestD) {
        best = c;
        bestD = d;
      }
    }
    return best;
  };
  // Tables placed in one pass can anchor others in the next, so a new group follows its first member.
  let waiting = pending;
  for (let progress = true; progress && waiting.length > 0;) {
    progress = false;
    const still: TableKey[] = [];
    for (const k of waiting) {
      const mate = nearest(k, [...at.keys()].filter((c) => column.get(c) === column.get(k)));
      const anchor = mate ?? nearest(k, (neighbours.get(k) ?? []).filter((c) => at.has(c)));
      if (anchor === undefined) {
        still.push(k);
        continue;
      }
      const a = at.get(anchor)!;
      const arranged = {
        x: target(k).x + a.x - target(anchor).x,
        y: target(k).y + a.y - target(anchor).y,
      };
      // Where it is arranged; else in its column mate's layer, as a new layer would push into the next column; else clear of everything.
      place(k, mate
        ? [arranged, {
            x: a.x,
            y: arranged.y,
          }]
        : [arranged, {
            x: clearRight(k),
            y: arranged.y,
          }]);
      progress = true;
    }
    waiting = still;
  }
  if (waiting.length > 0) {
    // Nothing placed to go by: the arranged shape of these tables, to the right of everything.
    const from = union(waiting.map((k) => ({
      ...target(k),
      w: 0,
      h: 0,
    })))!;
    // Level with the tables already there, as their tops line up in an arrangement.
    const tops = [...at.values()].map((p) => p.y);
    const dx = clearRight(waiting[0]!) - from.x;
    const dy = (tops.length > 0 ? Math.min(...tops) : from.y) - from.y;
    for (const k of waiting) {
      place(k, [{
        x: target(k).x + dx,
        y: target(k).y + dy,
      }]);
    }
  }

  return new Map(pending.map((k) => [k, at.get(k)!]));
}

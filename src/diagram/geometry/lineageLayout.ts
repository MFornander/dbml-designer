import { snap8, type Point } from './rect';
import type { TableSize } from './tableSize';
import type { DepEdgeVM, TableVM } from '../types';
import type { TableKey } from '../keys';

export interface LineageLayoutInput {
  tables: readonly TableVM[];
  deps: readonly DepEdgeVM[];
  sizes: ReadonlyMap<TableKey, TableSize>;
}

export interface LineageLayoutOptions {
  /** Horizontal gap between dependency layers. */
  colGap: number;
  /** Vertical gap between tables in a layer. */
  rowGap: number;
}

export interface LineageLayoutResult {
  positions: Map<TableKey, Point>;
  /** Dependency layer of every table that takes part in lineage (0 = pure source). */
  layers: Map<TableKey, number>;
  /** Tables with no lineage edges, placed in a trailing column. */
  unrelated: TableKey[];
}

const DEFAULTS: LineageLayoutOptions = {
  colGap: 96,
  rowGap: 32,
};

/**
 * Layer tables by dependency order (upstream left, downstream right), order
 * each layer by the average position of its upstream neighbours to reduce
 * crossings, and stack tables that have no lineage in a final column.
 * Cycles are tolerated: a back edge is ignored when it would otherwise stall.
 */
export function lineageLayout (input: LineageLayoutInput, opts: Partial<LineageLayoutOptions> = {}): LineageLayoutResult {
  const o = {
    ...DEFAULTS,
    ...opts,
  };
  const order = new Map<TableKey, number>();
  input.tables.forEach((t, i) => order.set(t.key, i));
  const byOrder = (a: TableKey, b: TableKey) => (order.get(a) ?? 0) - (order.get(b) ?? 0);

  // Table-level adjacency from the (possibly column-level) dependency edges.
  const up = new Map<TableKey, Set<TableKey>>();
  const down = new Map<TableKey, Set<TableKey>>();
  const touch = (k: TableKey) => {
    if (!up.has(k)) up.set(k, new Set());
    if (!down.has(k)) down.set(k, new Set());
  };
  for (const d of input.deps) {
    const from = d.upstream.tableKey;
    const to = d.downstream.tableKey;
    if (!order.has(from) || !order.has(to)) continue;
    touch(from);
    touch(to);
    if (from === to) continue;
    down.get(from)!.add(to);
    up.get(to)!.add(from);
  }

  const involved = [...up.keys()].sort(byOrder);
  const unrelated = input.tables.map((t) => t.key).filter((k) => !up.has(k));

  // Longest-path layering with Kahn's algorithm; break cycles by forcing the earliest stalled node.
  const layers = new Map<TableKey, number>();
  const remainingPreds = new Map<TableKey, Set<TableKey>>();
  for (const k of involved) remainingPreds.set(k, new Set(up.get(k)));
  const ready = involved.filter((k) => remainingPreds.get(k)!.size === 0);
  const pending = new Set(involved.filter((k) => remainingPreds.get(k)!.size > 0));

  const settle = (k: TableKey) => {
    const preds = up.get(k)!;
    let layer = 0;
    for (const p of preds) if (layers.has(p)) layer = Math.max(layer, layers.get(p)! + 1);
    layers.set(k, layer);
    for (const next of down.get(k)!) {
      const rp = remainingPreds.get(next);
      if (!rp || layers.has(next)) continue;
      rp.delete(k);
      if (rp.size === 0 && pending.has(next)) {
        pending.delete(next);
        ready.push(next);
      }
    }
  };

  while (ready.length > 0 || pending.size > 0) {
    if (ready.length === 0) {
      // Cycle: force the earliest declared stalled table.
      const forced = [...pending].sort(byOrder)[0]!;
      pending.delete(forced);
      ready.push(forced);
    }
    ready.sort(byOrder);
    settle(ready.shift()!);
  }

  // Group by layer and order each layer by the barycenter of upstream neighbours.
  const layerCount = involved.length ? Math.max(...layers.values()) + 1 : 0;
  const columns: TableKey[][] = Array.from({ length: layerCount }, () => []);
  for (const k of involved) columns[layers.get(k)!]!.push(k);
  const indexIn = new Map<TableKey, number>();
  columns.forEach((col, li) => {
    if (li === 0) {
      col.sort(byOrder);
    } else {
      const bary = new Map<TableKey, number>();
      for (const k of col) {
        const preds = [...up.get(k)!].filter((p) => indexIn.has(p));
        bary.set(k, preds.length ? preds.reduce((s, p) => s + indexIn.get(p)!, 0) / preds.length : Number.POSITIVE_INFINITY);
      }
      col.sort((a, b) => {
        const da = bary.get(a)!;
        const db = bary.get(b)!;
        if (da !== db) return da - db;
        return byOrder(a, b);
      });
    }
    col.forEach((k, i) => indexIn.set(k, i));
  });
  if (unrelated.length) columns.push([...unrelated].sort(byOrder));

  // Place columns left to right; center each column on the tallest one.
  const sizeOf = (k: TableKey) => input.sizes.get(k) ?? {
    width: 200,
    height: 32,
  };
  const colHeights = columns.map((col) => col.reduce((h, k, i) => h + sizeOf(k).height + (i > 0 ? o.rowGap : 0), 0));
  const maxH = Math.max(0, ...colHeights);
  const positions = new Map<TableKey, Point>();
  let x = 0;
  columns.forEach((col, ci) => {
    const colW = Math.max(0, ...col.map((k) => sizeOf(k).width));
    let y = snap8((maxH - colHeights[ci]!) / 2);
    for (const k of col) {
      positions.set(k, {
        x: snap8(x),
        y,
      });
      y = snap8(y + sizeOf(k).height + o.rowGap);
    }
    x += colW + o.colGap;
  });

  return {
    positions,
    layers,
    unrelated,
  };
}

/**
 * Layout inheritance along `use` imports. A diagram starts from the layouts written in the
 * footers of the files it imports, nearest import first, and its own footer records only what it
 * adds or changes: its own elements, moved imported ones, and explicit undoings of an inherited
 * collapse (`collapsed: false`) or hand-drawn route (`rails: []`).
 */
import type { XY } from '@/types/diagram';
import type { LayoutSnapshot } from './format';

/** The layout state a diagram keeps for itself, before it is minimized against what it inherits. */
export interface LayoutLayer {
  positions: Readonly<Record<string, XY>>;
  collapsedGroups: readonly string[];
  /** Groups kept open although an imported layout collapses them. */
  expandedGroups: readonly string[];
  /** Routes; an empty list undoes an inherited hand-drawn route. */
  edgeRoutes: Readonly<Record<string, readonly number[]>>;
}

const sameXY = (a: XY | undefined, b: XY | undefined) => !!a && !!b
  && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
const sameRails = (a: readonly number[] | undefined, b: readonly number[] | undefined) => !!a && !!b
  && a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * What a diagram inherits from the footers of its imports, in import order: for each element the
 * first footer that says anything wins, and an explicit undoing there counts as saying "default".
 */
export function baseLayoutFrom (snapshots: ReadonlyArray<LayoutSnapshot>): LayoutSnapshot {
  const positions: Record<string, XY> = {};
  const collapsed: string[] = [];
  const edgeRoutes: Record<string, number[]> = {};
  const seenGroups = new Set<string>();
  const seenRoutes = new Set<string>();
  for (const s of snapshots) {
    for (const [key, p] of Object.entries(s.positions)) {
      if (!(key in positions)) positions[key] = { ...p };
    }
    for (const key of s.collapsedGroups) {
      if (seenGroups.has(key)) continue;
      seenGroups.add(key);
      collapsed.push(key);
    }
    for (const key of s.expandedGroups ?? []) seenGroups.add(key);
    for (const [key, rails] of Object.entries(s.edgeRoutes)) {
      if (seenRoutes.has(key)) continue;
      seenRoutes.add(key);
      if (rails.length > 0) edgeRoutes[key] = [...rails];
    }
  }
  return {
    positions,
    collapsedGroups: collapsed,
    edgeRoutes,
  };
}

/** A layer that says nothing. */
export function emptyLayout (): LayoutSnapshot {
  return {
    positions: {},
    collapsedGroups: [],
    edgeRoutes: {},
  };
}

export function isEmptyLayout (s: LayoutSnapshot): boolean {
  return Object.keys(s.positions).length === 0 && s.collapsedGroups.length === 0
    && (s.expandedGroups?.length ?? 0) === 0 && Object.keys(s.edgeRoutes).length === 0;
}

/** The diagram's own footer: the layer without anything the base already says. */
export function minimizeLayout (layer: LayoutLayer, base: LayoutSnapshot): LayoutSnapshot {
  const positions: Record<string, XY> = {};
  for (const [key, p] of Object.entries(layer.positions)) {
    if (!sameXY(p, base.positions[key])) positions[key] = { ...p };
  }
  const baseCollapsed = new Set(base.collapsedGroups);
  const collapsedGroups = layer.collapsedGroups.filter((k) => !baseCollapsed.has(k));
  const expandedGroups = layer.expandedGroups.filter((k) => baseCollapsed.has(k));
  const edgeRoutes: Record<string, number[]> = {};
  for (const [key, rails] of Object.entries(layer.edgeRoutes)) {
    if (rails.length === 0) {
      if (key in base.edgeRoutes) edgeRoutes[key] = [];
    } else if (!sameRails(rails, base.edgeRoutes[key])) {
      edgeRoutes[key] = [...rails];
    }
  }
  return {
    positions,
    collapsedGroups,
    ...(expandedGroups.length ? { expandedGroups } : {}),
    edgeRoutes,
  };
}

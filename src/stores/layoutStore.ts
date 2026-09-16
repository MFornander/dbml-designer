import { computed, watch } from 'vue';
import { defineStore } from 'pinia';
import type { PositionChange, PositionsMap, XY } from '@/types/diagram';
import { usePersistedRef } from '@/utils/persistedRef';
import type { Database } from '@dbml/parse';
import type { LayoutSnapshot } from '@/layout/sidecar';
import { layoutKeysOf } from '@/layout/schemaKeys';
import { useParserStore } from './parserStore';

interface LayoutState {
  version: 1;
  positions: Record<string, XY>;
  collapsedGroups: string[];
  /** Hand-routed relationships: alternating x/y rail coordinates by ref key (see routing.ts). */
  edgeRoutes: Record<string, number[]>;
}

function isRails (v: unknown): v is number[] {
  return Array.isArray(v) && v.every((n) => typeof n === 'number');
}

function isXY (v: unknown): v is XY {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as XY;
  if (typeof p.x !== 'number' || typeof p.y !== 'number') return false;
  if (p.w !== undefined && typeof p.w !== 'number') return false;
  if (p.h !== undefined && typeof p.h !== 'number') return false;
  return true;
}

function isLayoutState (v: unknown): v is LayoutState {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Partial<LayoutState>;
  if (s.version !== 1 || typeof s.positions !== 'object' || s.positions === null) return false;
  if (!Object.values(s.positions).every(isXY)) return false;
  if (s.collapsedGroups !== undefined
    && !(Array.isArray(s.collapsedGroups) && s.collapsedGroups.every((k) => typeof k === 'string'))) return false;
  return s.edgeRoutes === undefined
    || (typeof s.edgeRoutes === 'object' && s.edgeRoutes !== null && Object.values(s.edgeRoutes).every(isRails));
}

/** Older saves have no `collapsedGroups` or `edgeRoutes`; fill them in. */
function deserializeLayout (raw: string): LayoutState {
  const parsed = JSON.parse(raw) as Partial<LayoutState>;
  return {
    version: 1,
    positions: parsed.positions ?? {},
    collapsedGroups: parsed.collapsedGroups ?? [],
    edgeRoutes: parsed.edgeRoutes ?? {},
  } as LayoutState;
}

export const useLayoutStore = defineStore('layout', () => {
  const state = usePersistedRef<LayoutState>('layout', () => ({
    version: 1,
    positions: {},
    collapsedGroups: [],
    edgeRoutes: {},
  }), {
    debounceMs: 250,
    validate: isLayoutState,
    deserialize: deserializeLayout,
  });

  const positions = computed<PositionsMap>(() => state.value.positions);
  const collapsedGroups = computed<ReadonlySet<string>>(() => new Set(state.value.collapsedGroups));
  const edgeRoutes = computed<Readonly<Record<string, number[]>>>(() => state.value.edgeRoutes);

  /** Store a hand-drawn route for a relationship, or forget it (null) to return to automatic routing. */
  function setEdgeRoute (key: string, rails: readonly number[] | null): void {
    const next = { ...state.value.edgeRoutes };
    if (rails) next[key] = [...rails];
    else if (key in next) delete next[key];
    else return;
    state.value = {
      ...state.value,
      edgeRoutes: next,
    };
  }

  function applyPositionChanges (changes: ReadonlyArray<PositionChange>): void {
    if (changes.length === 0) return;
    const next: Record<string, XY> = { ...state.value.positions };
    for (const c of changes) {
      const prev = next[c.key];
      const entry: XY = {
        x: c.x,
        y: c.y,
      };
      const w = c.w ?? prev?.w;
      const h = c.h ?? prev?.h;
      if (w !== undefined) entry.w = w;
      if (h !== undefined) entry.h = h;
      next[c.key] = entry;
    }
    state.value = {
      ...state.value,
      positions: next,
    };
  }

  function setPosition (key: string, xy: XY): void {
    applyPositionChanges([{
      key,
      ...xy,
    }]);
  }

  function toggleGroup (key: string): void {
    const list = state.value.collapsedGroups;
    state.value = {
      ...state.value,
      collapsedGroups: list.includes(key) ? list.filter((k) => k !== key) : [...list, key],
    };
  }

  /**
   * Drop positions, collapse flags, and edge routes whose element no longer exists. Only call
   * with keys from an error-free parse. Edge routes are left alone when `validRefs` is omitted.
   */
  function prune (validKeys: ReadonlySet<string>, validGroups: ReadonlySet<string>, validRefs?: ReadonlySet<string>): void {
    const current = state.value.positions;
    const orphaned = Object.keys(current).filter((k) => !validKeys.has(k));
    const staleGroups = state.value.collapsedGroups.filter((k) => !validGroups.has(k));
    const staleRoutes = validRefs ? Object.keys(state.value.edgeRoutes).filter((k) => !validRefs.has(k)) : [];
    if (orphaned.length === 0 && staleGroups.length === 0 && staleRoutes.length === 0) return;
    const next = { ...current };
    for (const k of orphaned) delete next[k];
    const routes = { ...state.value.edgeRoutes };
    for (const k of staleRoutes) delete routes[k];
    state.value = {
      version: 1,
      positions: next,
      collapsedGroups: state.value.collapsedGroups.filter((k) => validGroups.has(k)),
      edgeRoutes: routes,
    };
  }

  function resetLayout (): void {
    state.value = {
      version: 1,
      positions: {},
      collapsedGroups: [],
      edgeRoutes: {},
    };
  }

  /** Drop everything that does not belong to the elements of `db`. */
  function pruneAgainst (db: Database): void {
    const keys = layoutKeysOf(db);
    prune(new Set([...keys.tables, ...keys.notes]), keys.groups, keys.refs);
  }

  // rawDatabase only changes after an error-free parse, so a syntax error never prunes positions.
  const parser = useParserStore();
  watch(() => parser.rawDatabase, (db) => {
    if (db) pruneAgainst(db);
  }, {
    immediate: true,
  });

  /** The view state for a `.dbml.yaml` sidecar. */
  function snapshot (): LayoutSnapshot {
    return {
      positions: { ...state.value.positions },
      collapsedGroups: [...state.value.collapsedGroups],
      edgeRoutes: { ...state.value.edgeRoutes },
    };
  }

  /** Replace the view state from a sidecar, keeping only entries the current schema still has. */
  function replaceLayout (snap: LayoutSnapshot): void {
    state.value = {
      version: 1,
      positions: { ...snap.positions },
      collapsedGroups: [...snap.collapsedGroups],
      edgeRoutes: { ...snap.edgeRoutes },
    };
    if (parser.rawDatabase) pruneAgainst(parser.rawDatabase);
  }

  return {
    positions,
    collapsedGroups,
    edgeRoutes,
    applyPositionChanges,
    setPosition,
    toggleGroup,
    setEdgeRoute,
    prune,
    resetLayout,
    snapshot,
    replaceLayout,
  };
});

import { computed, watch } from 'vue';
import { defineStore } from 'pinia';
import type { PositionChange, PositionsMap, XY } from '@/types/diagram';
import { usePersistedRef } from '@/utils/persistedRef';
import type { Database } from '@dbml/parse';
import {
  baseLayoutFrom, isEmptyLayout, minimizeLayout, splitLayoutComment, validateLayout,
} from '@/layout';
import type { LayoutSnapshot } from '@/layout';
import { layoutKeysOf } from '@/layout/schemaKeys';
import { useParserStore } from './parserStore';
import { useViewStore } from './viewStore';

/** One layer's records: positions, folded and unfolded groups, hand-drawn routes. */
interface LayerState {
  positions: Record<string, XY>;
  collapsedGroups: string[];
  /** Groups kept open although a layer underneath collapses them. */
  expandedGroups: string[];
  /** Hand-routed relationships: alternating x/y rail coordinates by ref key (see routing.ts); `[]` undoes a route from underneath. */
  edgeRoutes: Record<string, number[]>;
}

/**
 * What this diagram keeps for itself, which is exactly what its footer records. The file layer
 * is the Default View: this diagram's own elements and its changes to what the footers of
 * imported files say. Each named `DiagramView` has a layer of its own on top, holding what that
 * view changes against the Default View, so a view starts out looking like it and records only
 * what is rearranged while it is active.
 */
interface LayoutState extends LayerState {
  version: 1;
  views: Record<string, LayerState>;
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

const isKeyList = (v: unknown): v is string[] => Array.isArray(v) && v.every((k) => typeof k === 'string');

function isLayerState (v: unknown): v is LayerState {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Partial<LayerState>;
  if (typeof s.positions !== 'object' || s.positions === null) return false;
  if (!Object.values(s.positions).every(isXY)) return false;
  if (s.collapsedGroups !== undefined && !isKeyList(s.collapsedGroups)) return false;
  if (s.expandedGroups !== undefined && !isKeyList(s.expandedGroups)) return false;
  return s.edgeRoutes === undefined
    || (typeof s.edgeRoutes === 'object' && s.edgeRoutes !== null && Object.values(s.edgeRoutes).every(isRails));
}

function isLayoutState (v: unknown): v is LayoutState {
  if (!isLayerState(v)) return false;
  const s = v as Partial<LayoutState>;
  if (s.version !== 1) return false;
  return s.views === undefined || (typeof s.views === 'object' && s.views !== null && Object.values(s.views).every(isLayerState));
}

function emptyLayer (): LayerState {
  return {
    positions: {},
    collapsedGroups: [],
    expandedGroups: [],
    edgeRoutes: {},
  };
}

/** A layer from a saved or imported shape, filling in what older saves lack. */
function layerFrom (raw: Partial<LayoutSnapshot> | Partial<LayerState> | undefined): LayerState {
  return {
    positions: Object.fromEntries(Object.entries(raw?.positions ?? {}).map(([k, p]) => [k, { ...p }])),
    collapsedGroups: [...(raw?.collapsedGroups ?? [])],
    expandedGroups: [...(raw?.expandedGroups ?? [])],
    edgeRoutes: Object.fromEntries(Object.entries(raw?.edgeRoutes ?? {}).map(([k, v]) => [k, [...v]])),
  };
}

function deserializeLayout (raw: string): LayoutState {
  const parsed = JSON.parse(raw) as Partial<LayoutState>;
  return {
    version: 1,
    ...layerFrom(parsed),
    views: Object.fromEntries(Object.entries(parsed.views ?? {}).map(([name, layer]) => [name, layerFrom(layer)])),
  };
}

const emptyState = (): LayoutState => ({
  version: 1,
  ...emptyLayer(),
  views: {},
});

/** The layer fields alone. */
const layerOf = (s: LayerState): LayerState => ({
  positions: s.positions,
  collapsedGroups: s.collapsedGroups,
  expandedGroups: s.expandedGroups,
  edgeRoutes: s.edgeRoutes,
});

/** A layer as a snapshot for stacking; undoings and `[]` routes count as answers there. */
const asSnapshot = (layer: LayerState): LayoutSnapshot => ({
  positions: layer.positions,
  collapsedGroups: layer.collapsedGroups,
  expandedGroups: layer.expandedGroups,
  edgeRoutes: layer.edgeRoutes,
});

const EMPTY_LAYER: LayerState = emptyLayer();

export const useLayoutStore = defineStore('layout', () => {
  const state = usePersistedRef<LayoutState>('layout', emptyState, {
    debounceMs: 250,
    validate: isLayoutState,
    deserialize: deserializeLayout,
  });

  const parser = useParserStore();
  const viewStore = useViewStore();
  /** The named view being arranged, or null for the Default View, whose layer is the file's. */
  const activeView = computed(() => viewStore.activeView);

  /** The footers of imported files, nearest import first. */
  const importedSnapshots = computed<LayoutSnapshot[]>(() => {
    const snapshots: LayoutSnapshot[] = [];
    for (const { text } of parser.importSources) {
      const yaml = splitLayoutComment(text).layout;
      if (yaml === null) continue;
      const v = validateLayout(yaml);
      if (v.ok) snapshots.push(v.snapshot);
    }
    return snapshots;
  });
  /** The Default View as inherited from imported files. */
  const importedBase = computed(() => baseLayoutFrom(importedSnapshots.value));
  /** What imported files' footers say about one named view. */
  const importedView = (name: string): LayoutSnapshot => baseLayoutFrom(
    importedSnapshots.value.flatMap((s) => (s.views?.[name] ? [s.views[name]] : [])),
  );
  /** This file's Default View layer, undoings included. */
  const fileLayer = computed(() => asSnapshot(state.value));
  /**
   * Everything a named view's own layer sits on: what imports say about that view, then this
   * file's Default View, then the Default View of the imports. A view says more than a file.
   */
  const underView = (name: string): LayoutSnapshot => baseLayoutFrom([importedView(name), fileLayer.value, importedBase.value]);
  /** What the layer being edited inherits. */
  const base = computed(() => (activeView.value === null ? importedBase.value : underView(activeView.value)));
  /** The layer edits go to. */
  const ownLayer = computed<LayerState>(() => (activeView.value === null
    ? state.value
    : state.value.views[activeView.value] ?? EMPTY_LAYER));
  // What the diagram shows: the inherited layers with the edited one on top.
  const effective = computed(() => baseLayoutFrom([asSnapshot(ownLayer.value), base.value]));

  const positions = computed<PositionsMap>(() => effective.value.positions);
  const collapsedGroups = computed<ReadonlySet<string>>(() => new Set(effective.value.collapsedGroups));
  const edgeRoutes = computed<Readonly<Record<string, number[]>>>(() => effective.value.edgeRoutes);

  /** Change the layer being edited: the file's for the Default View, the active view's otherwise. */
  function editLayer (update: (layer: LayerState) => LayerState): void {
    const name = activeView.value;
    const current = name === null ? layerOf(state.value) : state.value.views[name] ?? emptyLayer();
    const next = update(current);
    if (next === current) return;
    state.value = name === null
      ? {
          ...state.value,
          ...next,
        }
      : {
          ...state.value,
          views: {
            ...state.value.views,
            [name]: next,
          },
        };
  }

  /** Store a hand-drawn route, or forget it (null) to return to automatic routing, undoing an inherited one if needed. */
  function setEdgeRoute (key: string, rails: readonly number[] | null): void {
    editLayer((layer) => {
      const next = { ...layer.edgeRoutes };
      if (rails) {
        next[key] = [...rails];
      } else if (key in base.value.edgeRoutes) {
        next[key] = [];
      } else if (key in next) {
        delete next[key];
      } else {
        return layer;
      }
      return {
        ...layer,
        edgeRoutes: next,
      };
    });
  }

  function applyPositionChanges (changes: ReadonlyArray<PositionChange>): void {
    if (changes.length === 0) return;
    editLayer((layer) => {
      const next: Record<string, XY> = { ...layer.positions };
      for (const c of changes) {
        const prev = next[c.key] ?? base.value.positions[c.key];
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
      return {
        ...layer,
        positions: next,
      };
    });
  }

  function setPosition (key: string, xy: XY): void {
    applyPositionChanges([{
      key,
      ...xy,
    }]);
  }

  /** Collapse or expand a group; expanding one a layer underneath collapses is recorded as an undoing. */
  function toggleGroup (key: string): void {
    const inheritedCollapsed = base.value.collapsedGroups.includes(key);
    const shown = collapsedGroups.value.has(key);
    editLayer((layer) => {
      const own = layer.collapsedGroups.filter((k) => k !== key);
      const undone = layer.expandedGroups.filter((k) => k !== key);
      if (shown) {
        if (inheritedCollapsed) undone.push(key);
      } else if (!inheritedCollapsed) {
        own.push(key);
      }
      return {
        ...layer,
        collapsedGroups: own,
        expandedGroups: undone,
      };
    });
  }

  /** The layer without entries for elements that are gone, or null when nothing was. */
  function pruneLayer (layer: LayerState, validKeys: ReadonlySet<string>, validGroups: ReadonlySet<string>, validRefs?: ReadonlySet<string>): LayerState | null {
    const orphaned = Object.keys(layer.positions).filter((k) => !validKeys.has(k));
    const staleGroups = [...layer.collapsedGroups, ...layer.expandedGroups].filter((k) => !validGroups.has(k));
    const staleRoutes = validRefs ? Object.keys(layer.edgeRoutes).filter((k) => !validRefs.has(k)) : [];
    if (orphaned.length === 0 && staleGroups.length === 0 && staleRoutes.length === 0) return null;
    const positions = { ...layer.positions };
    for (const k of orphaned) delete positions[k];
    const routes = { ...layer.edgeRoutes };
    for (const k of staleRoutes) delete routes[k];
    return {
      positions,
      collapsedGroups: layer.collapsedGroups.filter((k) => validGroups.has(k)),
      expandedGroups: layer.expandedGroups.filter((k) => validGroups.has(k)),
      edgeRoutes: routes,
    };
  }

  /**
   * Drop positions, collapse flags, and edge routes whose element no longer exists, in every
   * layer, and the layers of views that no longer exist. Only call with keys from an error-free
   * parse. Edge routes are left alone when `validRefs` is omitted, view layers when `validViews` is.
   */
  function prune (validKeys: ReadonlySet<string>, validGroups: ReadonlySet<string>, validRefs?: ReadonlySet<string>, validViews?: ReadonlySet<string>): void {
    const s = state.value;
    const file = pruneLayer(layerOf(s), validKeys, validGroups, validRefs);
    const views: Record<string, LayerState> = {};
    let viewsChanged = false;
    for (const [name, layer] of Object.entries(s.views)) {
      if (validViews && !validViews.has(name)) {
        viewsChanged = true;
        continue;
      }
      const pruned = pruneLayer(layer, validKeys, validGroups, validRefs);
      const next = pruned ?? layer;
      if (pruned || isEmptyLayout(asSnapshot(next))) viewsChanged = true;
      if (!isEmptyLayout(asSnapshot(next))) views[name] = next;
    }
    if (!file && !viewsChanged) return;
    state.value = {
      version: 1,
      ...(file ?? layerOf(s)),
      views: viewsChanged ? views : s.views,
    };
  }

  function resetLayout (): void {
    state.value = emptyState();
  }

  function pruneAgainst (db: Database): void {
    const keys = layoutKeysOf(db);
    prune(new Set([...keys.tables, ...keys.notes]), keys.groups, keys.refs, keys.views);
  }

  // rawDatabase only changes after an error-free parse, so a syntax error never prunes positions.
  // While a parse or its imports are on the way it is the previous text's model, so pruning waits.
  watch(() => (parser.isLoading ? undefined : parser.rawDatabase), (db) => {
    if (db) pruneAgainst(db);
  }, {
    immediate: true,
  });

  /**
   * This diagram's footer: the Default View minus what imported layouts already say, and under
   * `views` each named view minus everything under it. Views that change nothing are left out.
   */
  function snapshot (): LayoutSnapshot {
    const own = minimizeLayout(layerOf(state.value), importedBase.value);
    const views: Record<string, LayoutSnapshot> = {};
    for (const [name, layer] of Object.entries(state.value.views)) {
      const min = minimizeLayout(layer, underView(name));
      if (!isEmptyLayout(min)) views[name] = min;
    }
    return {
      ...own,
      ...(Object.keys(views).length ? { views } : {}),
    };
  }

  /** Replace every layer from a footer, keeping only entries the current schema still has. */
  function replaceLayout (snap: LayoutSnapshot): void {
    state.value = {
      version: 1,
      ...layerFrom(snap),
      views: Object.fromEntries(Object.entries(snap.views ?? {}).map(([name, layer]) => [name, layerFrom(layer)])),
    };
    // While a parse or its imports are on the way the model is the previous text's; the watch above prunes once it lands.
    if (parser.rawDatabase && !parser.isLoading) pruneAgainst(parser.rawDatabase);
  }

  /** A view was renamed in the DBML: its layer goes with it. */
  function renameView (from: string, to: string): void {
    const layer = state.value.views[from];
    if (!layer || from === to) return;
    const views = { ...state.value.views };
    delete views[from];
    views[to] = layer;
    state.value = {
      ...state.value,
      views,
    };
  }

  /** A view was saved as a new one: the new view starts out arranged like the old. */
  function copyView (from: string, to: string): void {
    const layer = state.value.views[from];
    if (!layer || from === to) return;
    state.value = {
      ...state.value,
      views: {
        ...state.value.views,
        [to]: layerFrom(layer),
      },
    };
  }

  return {
    positions,
    collapsedGroups,
    edgeRoutes,
    base,
    applyPositionChanges,
    setPosition,
    toggleGroup,
    setEdgeRoute,
    prune,
    resetLayout,
    snapshot,
    replaceLayout,
    renameView,
    copyView,
  };
});

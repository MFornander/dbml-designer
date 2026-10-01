/**
 * One engine's layout: where tables and notes sit, which groups are folded, and hand-drawn
 * routes, kept as layers. The Default View's layer holds the diagram's own arrangement and what
 * it changes in the layouts it inherits; each named view has a layer of its own on top, holding
 * what that view changes against the Default View, so a view starts out looking like it and
 * records only what is rearranged while it is active.
 *
 * Nothing here is stored anywhere: the host passes a ref to keep the layers in if it wants them
 * to outlive the page, and reads `snapshot()` to save them.
 */
import {
  computed, shallowRef, toRaw, type Ref,
} from 'vue';
import type { PositionChange, PositionsMap, XY } from '@/types/diagram';
import { isNoteKey } from '../keys';
import type { DiagramModel } from '../types';
import {
  baseLayoutFrom, isEmptyLayout, minimizeLayout, type LayoutSnapshot,
} from './layers';

/** One layer's records: positions, folded and unfolded groups, hand-drawn routes. */
export interface LayerState {
  positions: Record<string, XY>;
  collapsedGroups: string[];
  /** Groups kept open although a layer underneath collapses them. */
  expandedGroups: string[];
  /** Hand-routed relationships: alternating x/y rail coordinates by ref key (see routing.ts); `[]` undoes a route from underneath. */
  edgeRoutes: Record<string, number[]>;
}

/** Every layer the diagram keeps for itself: the Default View's at the top level, named views' under `views`. */
export interface LayoutState extends LayerState {
  version: 1;
  views: Record<string, LayerState>;
}

/** Every key a layout may refer to. */
export interface LayoutKeys {
  /** `schema.table` */
  tables: ReadonlySet<string>;
  /** `note:name` */
  notes: ReadonlySet<string>;
  /** `group:schema.name` */
  groups: ReadonlySet<string>;
  /** `name#from->to`, the model's ref keys. */
  refs: ReadonlySet<string>;
  /** View names. */
  views: ReadonlySet<string>;
}

/** The keys a layout of this diagram may refer to. */
export function layoutKeysOfModel (model: DiagramModel): LayoutKeys {
  return {
    tables: new Set(model.tables.map((t) => t.key)),
    notes: new Set(model.notes.map((n) => n.key)),
    groups: new Set(model.groups.map((g) => g.key)),
    refs: new Set(model.refs.map((r) => r.key)),
    views: new Set(model.views.map((v) => v.name)),
  };
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

/** Saved layers in a shape this build reads, older saves (missing lists and views) included. */
export function isLayoutState (v: unknown): v is LayoutState {
  if (!isLayerState(v)) return false;
  const s = v as Partial<LayoutState>;
  if (s.version !== 1) return false;
  return s.views === undefined || (typeof s.views === 'object' && s.views !== null && Object.values(s.views).every(isLayerState));
}

export function emptyLayer (): LayerState {
  return {
    positions: {},
    collapsedGroups: [],
    expandedGroups: [],
    edgeRoutes: {},
  };
}

/** A layer from a saved or imported shape, filling in what older saves lack. */
export function layerFrom (raw: Partial<LayoutSnapshot> | Partial<LayerState> | undefined): LayerState {
  return {
    positions: Object.fromEntries(Object.entries(raw?.positions ?? {}).map(([k, p]) => [k, { ...p }])),
    collapsedGroups: [...(raw?.collapsedGroups ?? [])],
    expandedGroups: [...(raw?.expandedGroups ?? [])],
    edgeRoutes: Object.fromEntries(Object.entries(raw?.edgeRoutes ?? {}).map(([k, v]) => [k, [...v]])),
  };
}

/** Layers from a save that `isLayoutState` accepted, complete. */
export function layoutStateFrom (raw: Partial<LayoutState>): LayoutState {
  return {
    version: 1,
    ...layerFrom(raw),
    views: Object.fromEntries(Object.entries(raw.views ?? {}).map(([name, layer]) => [name, layerFrom(layer)])),
  };
}

export const emptyLayoutState = (): LayoutState => ({
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

/** Where a position change comes from: a table put down because it had no position, or anything else. */
export type PositionOrigin = 'auto';

/** The last arrangement, while it can still be taken back. */
interface ArrangeUndo {
  /** The view whose layer was arranged; null for the Default View. */
  view: string | null;
  /** The layer as it was before. */
  before: LayerState;
  /** The tables auto-placed and not yet arranged, as they were before. */
  newTables: ReadonlySet<string>;
  /** The objects the layer was left made of; once any is replaced, the layer changed since. */
  after: readonly unknown[];
  /** How many tables were placed. */
  tables: number;
}

export interface LayoutOptions {
  /** The view whose layer edits go to; null for the Default View. */
  activeView: () => string | null;
  /** Where the layers are kept; a host that wants them to outlive the page passes a ref it persists. */
  state?: Ref<LayoutState>;
  /** Layouts this one inherits, nearest first, such as the footers of imported DBML files. */
  bases?: () => readonly LayoutSnapshot[];
  /**
   * The keys of what the diagram shows now, or null while the model is behind what the host is
   * loading. Taking back an arrangement or replacing the layout drops entries for anything gone.
   */
  validKeys?: () => LayoutKeys | null;
}

export function createLayout (options: LayoutOptions) {
  const state = options.state ?? shallowRef<LayoutState>(emptyLayoutState());
  const activeView = computed(options.activeView);

  /** Inherited layouts, nearest first. */
  const inherited = computed<readonly LayoutSnapshot[]>(() => options.bases?.() ?? []);
  /** The Default View as inherited. */
  const inheritedBase = computed(() => baseLayoutFrom(inherited.value));
  /** What the inherited layouts say about one named view. */
  const inheritedView = (name: string): LayoutSnapshot => baseLayoutFrom(
    inherited.value.flatMap((s) => (s.views?.[name] ? [s.views[name]] : [])),
  );
  /** The diagram's own Default View layer, undoings included. */
  const ownDefault = computed(() => asSnapshot(state.value));
  /**
   * Everything a named view's own layer sits on: what inherited layouts say about that view, then
   * the diagram's Default View, then the inherited Default View. A view says more than a layout.
   */
  const underView = (name: string): LayoutSnapshot => baseLayoutFrom([inheritedView(name), ownDefault.value, inheritedBase.value]);
  /** What the layer being edited inherits. */
  const base = computed(() => (activeView.value === null ? inheritedBase.value : underView(activeView.value)));
  /** The layer edits go to. */
  const ownLayer = computed<LayerState>(() => (activeView.value === null
    ? state.value
    : state.value.views[activeView.value] ?? EMPTY_LAYER));
  // What the diagram shows: the inherited layers with the edited one on top.
  const effective = computed(() => baseLayoutFrom([asSnapshot(ownLayer.value), base.value]));

  const positions = computed<PositionsMap>(() => effective.value.positions);
  const collapsedGroups = computed<ReadonlySet<string>>(() => new Set(effective.value.collapsedGroups));
  const edgeRoutes = computed<Readonly<Record<string, number[]>>>(() => effective.value.edgeRoutes);

  /** A view's own layer: the Default View's (null), else that view's. */
  function layerIn (name: string | null): LayerState {
    return name === null ? layerOf(state.value) : state.value.views[name] ?? emptyLayer();
  }

  /** Change the layer being edited: the Default View's, or the active view's. */
  function editLayer (update: (layer: LayerState) => LayerState): void {
    const name = activeView.value;
    const current = layerIn(name);
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

  /** A layer's positions with the changes applied; a note keeps its size unless the change has one. */
  function positionsWith (layerPositions: Readonly<Record<string, XY>>, changes: ReadonlyArray<PositionChange>): Record<string, XY> {
    const next: Record<string, XY> = { ...layerPositions };
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
    return next;
  }

  /**
   * Tables auto-placement put down since this layout was loaded, which nothing has moved since:
   * what arranging only the new tables places. Kept for the session only.
   */
  const newTables = shallowRef<ReadonlySet<string>>(new Set());

  function trackNewTables (changes: ReadonlyArray<PositionChange>, origin?: PositionOrigin): void {
    const next = new Set(newTables.value);
    for (const c of changes) {
      if (isNoteKey(c.key)) continue;
      if (origin === 'auto') next.add(c.key);
      else next.delete(c.key);
    }
    if (next.size !== newTables.value.size || [...next].some((k) => !newTables.value.has(k))) newTables.value = next;
  }

  function applyPositionChanges (changes: ReadonlyArray<PositionChange>, origin?: PositionOrigin): void {
    if (changes.length === 0) return;
    editLayer((layer) => ({
      ...layer,
      positions: positionsWith(layer.positions, changes),
    }));
    trackNewTables(changes, origin);
  }

  /** A layer's routes with these relationships back on automatic routing, undoing inherited routes where needed. */
  function routesWithout (routes: Readonly<Record<string, number[]>>, keys: readonly string[]): Record<string, number[]> {
    let next = routes as Record<string, number[]>;
    for (const key of keys) {
      const inheritedRoute = key in base.value.edgeRoutes;
      // Already automatic: nothing drawn here, nothing inherited, or an inherited one already undone.
      if (inheritedRoute ? next[key]?.length === 0 : !(key in next)) continue;
      if (next === routes) next = { ...routes };
      if (inheritedRoute) next[key] = [];
      else delete next[key];
    }
    return next;
  }

  const lastArrange = shallowRef<ArrangeUndo | null>(null);

  /** The objects a view's own layer is made of, unwrapped. Every edit replaces at least one of them. */
  function layerParts (name: string | null): unknown[] {
    const layer = name === null ? toRaw(state.value) : toRaw(toRaw(state.value).views)[name];
    return layer ? [layer.positions, layer.collapsedGroups, layer.expandedGroups, layer.edgeRoutes].map((part) => toRaw(part)) : [];
  }

  /**
   * The last arrangement can be taken back while its view is active and nothing has changed that
   * view's layer since: no drag, fold, route, reset, or other layout in between.
   */
  const canUndoArrange = computed(() => {
    const last = lastArrange.value;
    if (!last || last.view !== activeView.value) return false;
    const parts = layerParts(last.view);
    return parts.length === last.after.length && parts.every((part, i) => part === last.after[i]);
  });

  /** Tables placed by the arrangement that can be taken back, or 0 when there is none. */
  const undoableArrangeTables = computed(() => (canUndoArrange.value ? lastArrange.value!.tables : 0));

  /**
   * Arrange the layer being edited in one step: the new positions, and automatic routing again
   * for `resetRoutes`, whose hand-drawn routes were drawn around the old positions. The layer as
   * it was is kept so `undoArrange` can put it back.
   */
  function applyArrangement (changes: ReadonlyArray<PositionChange>, resetRoutes: readonly string[] = []): void {
    if (changes.length === 0) return;
    const view = activeView.value;
    const before = layerIn(view);
    const newBefore = newTables.value;
    editLayer((layer) => ({
      ...layer,
      positions: positionsWith(layer.positions, changes),
      edgeRoutes: routesWithout(layer.edgeRoutes, resetRoutes),
    }));
    trackNewTables(changes);
    lastArrange.value = {
      view,
      before,
      newTables: newBefore,
      after: layerParts(view),
      tables: changes.filter((c) => !isNoteKey(c.key)).length,
    };
  }

  /** Drop entries for elements that are gone, when the host knows what the diagram has now. */
  function pruneToValid (): void {
    const keys = options.validKeys?.();
    if (keys) pruneTo(keys);
  }

  /** Put back the layer the last arrangement replaced; false when that can no longer be done. */
  function undoArrange (): boolean {
    const last = lastArrange.value;
    if (!last || !canUndoArrange.value) return false;
    lastArrange.value = null;
    editLayer(() => layerFrom(last.before));
    newTables.value = last.newTables;
    // Elements removed since have no business coming back.
    pruneToValid();
    return true;
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
    const nextPositions = { ...layer.positions };
    for (const k of orphaned) delete nextPositions[k];
    const routes = { ...layer.edgeRoutes };
    for (const k of staleRoutes) delete routes[k];
    return {
      positions: nextPositions,
      collapsedGroups: layer.collapsedGroups.filter((k) => validGroups.has(k)),
      expandedGroups: layer.expandedGroups.filter((k) => validGroups.has(k)),
      edgeRoutes: routes,
    };
  }

  /**
   * Drop positions, collapse flags, and edge routes whose element no longer exists, in every
   * layer, and the layers of views that no longer exist. Only call with keys from a complete
   * model. Edge routes are left alone when `validRefs` is omitted, view layers when `validViews` is.
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

  /** `prune` with every kind of key a layout refers to. */
  function pruneTo (keys: LayoutKeys): void {
    prune(new Set([...keys.tables, ...keys.notes]), keys.groups, keys.refs, keys.views);
  }

  function resetLayout (): void {
    state.value = emptyLayoutState();
    newTables.value = new Set();
  }

  /**
   * What the diagram adds to what it inherits, to save: the Default View minus the inherited
   * layouts, and under `views` each named view minus everything under it. Views that change
   * nothing are left out.
   */
  function snapshot (): LayoutSnapshot {
    const own = minimizeLayout(layerOf(state.value), inheritedBase.value);
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

  /** Replace every layer from a snapshot, keeping only entries the diagram still has. */
  function replaceLayout (snap: LayoutSnapshot): void {
    state.value = {
      version: 1,
      ...layerFrom(snap),
      views: Object.fromEntries(Object.entries(snap.views ?? {}).map(([name, layer]) => [name, layerFrom(layer)])),
    };
    newTables.value = new Set();
    pruneToValid();
  }

  /** A view was renamed: its layer goes with it. */
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
    /** Every layer, as kept; what a host persists to restore the layout exactly. */
    state,
    positions,
    collapsedGroups,
    edgeRoutes,
    base,
    newTables,
    canUndoArrange,
    undoableArrangeTables,
    applyPositionChanges,
    applyArrangement,
    undoArrange,
    setPosition,
    toggleGroup,
    setEdgeRoute,
    prune,
    pruneTo,
    resetLayout,
    snapshot,
    replaceLayout,
    renameView,
    copyView,
  };
}

export type Layout = ReturnType<typeof createLayout>;

/**
 * One diagram engine: a model, the views and layout arranged over it, and how it is displayed.
 * Everything is per instance, so several engines can share a page, and nothing is stored: a host
 * passes refs for what it wants kept, or reads `snapshot()` and hands it back to `restore()`.
 *
 * Each input can be a value, which the matching setter replaces later, or a getter the engine
 * follows, for a host that already keeps it in reactive state.
 */
import {
  computed, effectScope, shallowRef, watch, type Ref,
} from 'vue';
import type { DetailLevel, PartialRefMode } from '../types';
import { fromModel } from '../fromModel';
import type { Model } from '../model';
import type { LayoutSnapshot } from './layers';
import { createLayout, layoutKeysOfModel, type LayoutState } from './layout';
import { createViews } from './views';

/** How the diagram is drawn. */
export interface DisplayOptions {
  /** Which fields tables show: all, keys only, or none. */
  detailLevel: DetailLevel;
  dark: boolean;
  /** Draw relationships. */
  showRefs: boolean;
  /** Draw lineage edges. */
  showLineage: boolean;
  /**
   * Draw every column-level lineage mapping field to field, styled by its kind, in place of the one
   * edge between two tables. Pairs of tables with no column mappings keep their edge.
   */
  lineageColumns: boolean;
  /** Refs that come from a TablePartial: a badge per partial in the table header, or lines like the rest. */
  partialRefMode: PartialRefMode;
  /** Record values on their fields, and the count of a table's records in its header, which opens them. */
  showValues: boolean;
  /** Lay tables out by dependency order instead of their stored positions. */
  lineageLayout: boolean;
  /** Highlight every edge: walking ants, names, and cardinalities. */
  highlightAll: boolean;
}

export const DEFAULT_DISPLAY: Readonly<DisplayOptions> = {
  detailLevel: 'all',
  dark: false,
  showRefs: true,
  showLineage: true,
  lineageColumns: false,
  partialRefMode: 'badges',
  showValues: true,
  lineageLayout: false,
  highlightAll: false,
};

/** A value given once, or a getter to follow. */
export type Input<T> = T | (() => T);

export interface EngineOptions {
  /** What the diagram shows. */
  model?: Input<Model | null>;
  /** True while the model is behind what the host is loading: nothing is pruned or placed against it then. */
  loading?: Input<boolean>;
  /** How the diagram is drawn; anything left out takes its default. */
  display?: Input<Partial<DisplayOptions>>;
  /** Layouts the diagram inherits, nearest first, such as the footers of imported DBML files. */
  bases?: Input<readonly LayoutSnapshot[]>;
  /** A layout to start from, as `snapshot()` returned it. */
  layout?: LayoutSnapshot;
  /** Where the layout layers are kept, for a host that persists them as they change. */
  layoutState?: Ref<LayoutState>;
  /** Where the active view's name is kept, for a host that persists the choice. */
  activeView?: Ref<string | null>;
}

/** What a mounted diagram offers the engine; `EngineDiagram` attaches it while mounted. */
export interface DiagramHandle {
  fitToScreen (): void;
  resetZoom (): void;
  zoomIn (): void;
  zoomOut (): void;
  /** Lay out what the view shows, or only the tables in `only`; false when there is nothing to do yet. */
  arrange (only?: ReadonlySet<string>): boolean;
  /** Fit the view to the diagram once positions just stored are in. */
  refit (): void;
}

function follow<T> (input: Input<T> | undefined, fallback: T) {
  const source = shallowRef<() => T>(typeof input === 'function' ? input as () => T : () => (input === undefined ? fallback : input));
  return {
    value: computed(() => source.value()),
    set: (v: T) => {
      source.value = () => v;
    },
  };
}

export function createEngine (options: EngineOptions = {}) {
  const scope = effectScope(true);
  return scope.run(() => {
    const model = follow<Model | null>(options.model, null);
    const loading = follow(options.loading, false);
    const displayInput = follow<Partial<DisplayOptions>>(options.display, {});
    const bases = follow<readonly LayoutSnapshot[]>(options.bases, []);

    /** The view model the canvas draws. */
    const diagram = computed(() => fromModel(model.value.value));
    const display = computed<DisplayOptions>(() => ({
      ...DEFAULT_DISPLAY,
      ...displayInput.value.value,
    }));

    const views = createViews({ active: options.activeView });
    const layout = createLayout({
      state: options.layoutState,
      activeView: () => views.activeView.value,
      bases: () => bases.value.value,
      validKeys: () => (loading.value.value ? null : layoutKeysOfModel(diagram.value)),
    });

    // Views follow the model, so their hidden sets match the current definitions.
    watch(diagram, (m) => views.sync(m), {
      immediate: true,
    });
    // The layout drops what the model no longer has, but not while the model is behind.
    watch(() => (loading.value.value ? undefined : diagram.value), (m) => {
      if (m) layout.pruneTo(layoutKeysOfModel(m));
    }, {
      immediate: true,
    });
    if (options.layout) layout.replaceLayout(options.layout);

    const handle = shallowRef<DiagramHandle | null>(null);

    return {
      diagram,
      loading: loading.value,
      display,
      views,
      layout,
      /** The mounted diagram, while there is one. */
      handle: computed(() => handle.value),
      /** Show another model; the layout is kept, and tables without a position are placed. */
      setModel: model.set,
      setLoading: loading.set,
      /** Change how the diagram is drawn; what is left out keeps its current value. */
      setDisplay (next: Partial<DisplayOptions>): void {
        displayInput.set({
          ...displayInput.value.value,
          ...next,
        });
      },
      setBases: bases.set,
      /** Switch to a view by name, or to the Default View (null). */
      selectView (name: string | null): void {
        views.select(name, diagram.value);
      },
      /** What the diagram adds to the layouts it inherits, to save. */
      snapshot: layout.snapshot,
      /** Replace the layout with a saved one. */
      restore: layout.replaceLayout,
      /** Arrange what the view shows, or only the tables placed automatically since the layout was loaded; false when no diagram is mounted or there is nothing to do. */
      arrange (onlyNew = false): boolean {
        return handle.value?.arrange(onlyNew ? layout.newTables.value : undefined) ?? false;
      },
      /** Take the last arrangement back while nothing has changed since. */
      undoArrange (): boolean {
        const done = layout.undoArrange();
        if (done) handle.value?.refit();
        return done;
      },
      fitToScreen: () => handle.value?.fitToScreen(),
      resetZoom: () => handle.value?.resetZoom(),
      zoomIn: () => handle.value?.zoomIn(),
      zoomOut: () => handle.value?.zoomOut(),
      /** Used by `EngineDiagram` while it is mounted. */
      attach (h: DiagramHandle | null): void {
        handle.value = h;
      },
      /** Stop following the inputs. */
      dispose (): void {
        scope.stop();
      },
    };
  })!;
}

export type Engine = ReturnType<typeof createEngine>;

/**
 * One diagram engine: a model, the views and layout arranged over it, and how it is displayed.
 * Everything is per instance, so several engines can share a page, and nothing is stored: a host
 * passes refs for what it wants kept, or reads `snapshot()` and hands it back to `restore()`.
 *
 * Each input can be a value, which the matching setter replaces later, or a getter the engine
 * follows, for a host that already keeps it in reactive state. A host that gives the model as a
 * value can also grow it a little at a time (`addTables`, `addEdges`, `setRows`, `addToView`).
 */
import {
  computed, effectScope, nextTick, onScopeDispose, shallowRef, watch, type Ref,
} from 'vue';
import type { DetailLevel, DiagramModel, PartialRefMode } from '../types';
import { fromModel } from '../fromModel';
import type {
  Model, ModelDep, ModelRecord, ModelTable,
} from '../model';
import { addedKeys } from './changes';
import {
  withEdges, withRows, withTables, withViewTables,
} from './modelEdits';
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
  /** Offer the color picker on hovered tables, groups, and notes and on a selected relationship; the host writes the color. */
  pickColors: boolean;
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
  pickColors: true,
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
  /**
   * Arrange a named view by group and lineage when it is switched to while it has no arrangement of
   * its own, so a view another program wrote opens laid out; the result is that view's alone. On by
   * default. Either way, switching views fits the new one to the window.
   */
  arrangeViews?: boolean;
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
  /** The drawn element of a table, field, group, note, or edge, by key; null when it is not drawn. */
  element (key: string): Element | null;
}

/** How long what an update added stays highlighted. */
export const MARK_MS = 2000;
/** How long a request to mark the next update waits for it, such as a text being read. */
export const MARK_WAIT_MS = 5000;

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

    /** A view switched to that has no arrangement yet, to arrange once a mounted diagram can. */
    const toArrange = shallowRef<string | null>(null);
    /** A view was switched to: fit it once a mounted diagram shows it. */
    const toFit = shallowRef(false);
    const views = createViews({
      active: options.activeView,
      onSelect: (name) => {
        toArrange.value = name !== null && (options.arrangeViews ?? true) && !layout.hasViewLayout(name) ? name : null;
        toFit.value = true;
      },
    });
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

    /** What the last marked update added, by key, while it is highlighted. */
    const marked = shallowRef<ReadonlySet<string>>(new Set());
    /** The diagram to compare the next one with, while a request to mark it waits. */
    let markFrom: { diagram: DiagramModel; at: number } | null = null;
    let markTimer: ReturnType<typeof setTimeout> | null = null;
    /** Highlight what the next model adds to the current one; the editor asks when a followed file changes on disk. */
    function markChanges (): void {
      markFrom ??= {
        diagram: diagram.value,
        at: Date.now(),
      };
    }
    watch(diagram, (next) => {
      const from = markFrom;
      markFrom = null;
      if (!from || Date.now() - from.at > MARK_WAIT_MS) return;
      const added = addedKeys(from.diagram, next);
      if (added.size === 0) return;
      // Updates in quick succession light up together, so one does not put out the one before.
      marked.value = new Set([...marked.value, ...added]);
      if (markTimer) clearTimeout(markTimer);
      markTimer = setTimeout(() => {
        marked.value = new Set();
        markTimer = null;
      }, MARK_MS);
    });
    onScopeDispose(() => {
      if (markTimer) clearTimeout(markTimer);
    });

    /** The model as given, with what was added since, for the methods that add to it. */
    const current = (): Model => model.value.value ?? { tables: [] };
    /** Show the model with a change made, marking what it adds and placing new tables by their neighbours. */
    function change (update: (m: Model) => Model): void {
      markChanges();
      model.set(update(current()));
    }
    // The layout drops what the model no longer has, but not while the model is behind.
    watch(() => (loading.value.value ? undefined : diagram.value), (m) => {
      if (m) layout.pruneTo(layoutKeysOfModel(m));
    }, {
      immediate: true,
    });
    if (options.layout) layout.replaceLayout(options.layout);

    const handle = shallowRef<DiagramHandle | null>(null);

    // After a switch, once a diagram is mounted and the model is not behind: arrange the view if it
    // has no arrangement yet (which fits it), else fit it. Waits a tick for the diagram to take the
    // view's hidden set.
    watch([handle, toArrange, toFit, loading.value], ([h, name, fit, busy]) => {
      if (!h || busy || (name === null && !fit)) return;
      void nextTick(() => {
        if (handle.value !== h) return;
        const pending = toArrange.value;
        toArrange.value = null;
        toFit.value = false;
        if (pending !== null && pending === views.activeView.value && !layout.hasViewLayout(pending) && h.arrange()) return;
        h.refit();
      });
    }, {
      flush: 'post',
    });

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
      /** The model being shown: as given, with what the methods below added. */
      model: computed(() => model.value.value),
      /** What the last marked update added, by key, while it is highlighted. */
      marked: computed(() => marked.value),
      markChanges,
      /**
       * Add tables, or replace those with the same key. Like every method that adds to the model,
       * it keeps the layout, places new tables next to a placed table lineage connects them to, and
       * marks what is new for a moment. For a host that gives the model as a value, not a getter.
       */
      addTables (tables: readonly ModelTable[]): void {
        change((m) => withTables(m, tables));
      },
      /** Add lineage edges, column to column with a kind, or between whole tables. */
      addEdges (deps: readonly ModelDep[]): void {
        change((m) => withEdges(m, deps));
      },
      /** Replace the rows of a table, by key: one row shows its values on the fields. */
      setRows (table: string, rows: readonly ModelRecord[]): void {
        change((m) => withRows(m, table, rows));
      },
      /** Add tables to a named view by key, creating the view when there is none. */
      addToView (name: string, tables: readonly string[]): void {
        change((m) => withViewTables(m, name, tables));
      },
      /** The drawn element of a table, field, group, note, or edge, by key, to anchor the host's own overlays to. */
      elementOf (key: string): Element | null {
        return handle.value?.element(key) ?? null;
      },
      /**
       * Switch to a view by name, or to the Default View (null), and fit it; a named view with no
       * arrangement of its own is arranged first (see `arrangeViews`).
       */
      selectView (name: string | null): void {
        views.select(name, diagram.value);
      },
      /** `selectView` by another name. */
      setView (name: string | null): void {
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

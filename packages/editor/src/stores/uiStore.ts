import { computed, watch } from 'vue';
import { defineStore } from 'pinia';
import type { ThemeMode } from '@/types/diagram'; import type { DetailLevel, PartialRefMode } from '@dbml-designer/engine';
import { usePersistedRef } from '@/utils/persistedRef';

/** Which connections the diagram draws: relationships, both, or lineage edges only. */
export type EdgeMode = 'erd' | 'erd+deps' | 'deps';

interface UiState {
  version: 13;
  theme: ThemeMode;
  detailLevel: DetailLevel;
  /** [editor, diagram] in fr units; the editor is on the left. */
  splitSizes: [number, number];
  problemsOpen: boolean;
  edgeMode: EdgeMode;
  /** Lay tables out by dependency order instead of their stored positions. */
  lineageLayout: boolean;
  /** Highlight every relationship and lineage edge (walking ants, names, cardinalities). */
  highlightAll: boolean;
  /** The read-only layout YAML panel under the DBML editor is expanded. */
  layoutOpen: boolean;
  /** Height of that panel as a percentage of the editor pane. */
  layoutSize: number;
  /** The editor pane is hidden behind the split handle's chevron. */
  editorCollapsed: boolean;
  /** The Diagram Views panel at the right of the diagram is shown. */
  viewsOpen: boolean;
  /** Refs that come from a TablePartial: a badge per partial in the table header, or lines like the rest. */
  partialRefMode: PartialRefMode;
  /** Record values on their fields, and the count of a table's records in its header. */
  showValues: boolean;
  /** Lineage drawn mapping by mapping, field to field and styled by kind, instead of one edge per pair of tables. */
  lineageColumns: boolean;
  /** Switch to a view the followed file gains on disk. */
  followNewViews: boolean;
}

/** The shape before version 11, which all older ones migrate to first. */
type V10State = Omit<UiState, 'version' | 'showValues' | 'lineageColumns' | 'followNewViews'> & { version: 10 };

/** The layout panel's share of the editor pane until the user drags its handle. */
export const DEFAULT_LAYOUT_SIZE = 40;

const THEMES: readonly ThemeMode[] = ['light', 'dark'];
const LEVELS: readonly DetailLevel[] = ['all', 'keys', 'names'];
const EDGE_MODES: readonly EdgeMode[] = ['erd', 'erd+deps', 'deps'];
const PARTIAL_REF_MODES: readonly PartialRefMode[] = ['badges', 'lines'];

function isUiState (v: unknown): v is UiState {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Partial<UiState>;
  return s.version === 13
    && THEMES.includes(s.theme as ThemeMode)
    && LEVELS.includes(s.detailLevel as DetailLevel)
    && Array.isArray(s.splitSizes) && s.splitSizes.length === 2
    && s.splitSizes.every((n) => typeof n === 'number' && n > 0)
    && typeof s.problemsOpen === 'boolean'
    && EDGE_MODES.includes(s.edgeMode as EdgeMode)
    && typeof s.lineageLayout === 'boolean'
    && typeof s.highlightAll === 'boolean'
    && typeof s.layoutOpen === 'boolean'
    && typeof s.layoutSize === 'number' && s.layoutSize > 0 && s.layoutSize < 100
    && typeof s.editorCollapsed === 'boolean'
    && typeof s.viewsOpen === 'boolean'
    && PARTIAL_REF_MODES.includes(s.partialRefMode as PartialRefMode)
    && typeof s.showValues === 'boolean'
    && typeof s.lineageColumns === 'boolean'
    && typeof s.followNewViews === 'boolean';
}

/**
 * Version 1 stored [diagram, editor] sizes with the diagram on the left and had
 * no lineage flag; version 2 had a boolean `showLineage`; version 3 introduced
 * `edgeMode`; version 4 added the lineage-layout and highlight-all toggles;
 * version 5 added the editor view (DBML text or layout YAML); version 6 added
 * the collapsed-editor flag; version 7 replaced the editor view with the
 * collapsible layout panel's open flag; version 8 added that panel's height; version 9 added
 * the Diagram Views panel's open flag; version 10 added how partial refs are drawn, badges by
 * default; version 11 added the Values toggle, on by default; version 12 added drawing lineage by
 * column, and version 13 following new views, both off by default.
 */
export function migrateUiState (raw: string): UiState {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const version = parsed.version as number;
  if (version >= 13) return parsed as unknown as UiState;
  const since11 = version >= 11
    ? parsed as unknown as Omit<UiState, 'version' | 'lineageColumns' | 'followNewViews'>
    : {
        ...migrateToV10(parsed),
        showValues: true,
      };
  return {
    lineageColumns: false,
    ...since11,
    version: 13,
    followNewViews: false,
  };
}

function migrateToV10 (parsed: Record<string, unknown>): V10State {
  const version = parsed.version as number;
  if (version >= 10) return parsed as unknown as V10State;
  if (version === 9) {
    return {
      ...(parsed as unknown as V10State),
      version: 10,
      partialRefMode: 'badges',
    };
  }
  if (version === 8) {
    return {
      ...(parsed as unknown as V10State),
      version: 10,
      viewsOpen: false,
      partialRefMode: 'badges',
    };
  }
  if (version === 7) {
    return {
      ...(parsed as unknown as V10State),
      version: 10,
      layoutSize: DEFAULT_LAYOUT_SIZE,
      viewsOpen: false,
      partialRefMode: 'badges',
    };
  }
  if (version === 5 || version === 6) {
    const { editorView, ...rest } = parsed;
    return {
      ...(rest as unknown as V10State),
      version: 10,
      layoutOpen: editorView === 'layout',
      layoutSize: DEFAULT_LAYOUT_SIZE,
      editorCollapsed: version === 6 ? (parsed.editorCollapsed as boolean) : false,
      viewsOpen: false,
      partialRefMode: 'badges',
    };
  }
  if (version === 4) {
    return {
      ...(parsed as unknown as V10State),
      version: 10,
      layoutOpen: false,
      layoutSize: DEFAULT_LAYOUT_SIZE,
      editorCollapsed: false,
      viewsOpen: false,
      partialRefMode: 'badges',
    };
  }

  const base = {
    theme: parsed.theme as ThemeMode,
    detailLevel: parsed.detailLevel as DetailLevel,
    problemsOpen: parsed.problemsOpen as boolean,
    lineageLayout: false,
    highlightAll: false,
    layoutOpen: false,
    layoutSize: DEFAULT_LAYOUT_SIZE,
    editorCollapsed: false,
    viewsOpen: false,
    partialRefMode: 'badges' as const,
  };
  let splitSizes = parsed.splitSizes as [number, number];
  let edgeMode: EdgeMode = 'erd+deps';
  if (version === 1) {
    splitSizes = Array.isArray(parsed.splitSizes) && parsed.splitSizes.length === 2
      ? [parsed.splitSizes[1] as number, parsed.splitSizes[0] as number]
      : [40, 60];
  } else if (version === 2) {
    edgeMode = parsed.showLineage === false ? 'erd' : 'erd+deps';
  } else if (version === 3) {
    edgeMode = parsed.edgeMode as EdgeMode;
  }
  return {
    version: 10,
    ...base,
    splitSizes,
    edgeMode,
  };
}

function preferredTheme (): ThemeMode {
  if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export const useUiStore = defineStore('ui', () => {
  const state = usePersistedRef<UiState>('ui', () => ({
    version: 13,
    theme: preferredTheme(),
    detailLevel: 'all',
    splitSizes: [40, 60],
    problemsOpen: false,
    edgeMode: 'erd+deps',
    lineageLayout: false,
    highlightAll: false,
    layoutOpen: false,
    layoutSize: DEFAULT_LAYOUT_SIZE,
    editorCollapsed: false,
    viewsOpen: false,
    partialRefMode: 'badges',
    showValues: true,
    lineageColumns: false,
    followNewViews: false,
  }), {
    validate: isUiState,
    deserialize: migrateUiState,
  });

  const theme = computed(() => state.value.theme);
  const isDark = computed(() => state.value.theme === 'dark');
  const detailLevel = computed(() => state.value.detailLevel);
  const problemsOpen = computed(() => state.value.problemsOpen);
  const edgeMode = computed(() => state.value.edgeMode);
  const showRefs = computed(() => state.value.edgeMode !== 'deps');
  const showLineage = computed(() => state.value.edgeMode !== 'erd');
  const lineageLayout = computed(() => state.value.lineageLayout);
  const highlightAll = computed(() => state.value.highlightAll);
  const layoutOpen = computed(() => state.value.layoutOpen);
  const layoutSize = computed(() => state.value.layoutSize);
  const editorCollapsed = computed(() => state.value.editorCollapsed);
  const viewsOpen = computed(() => state.value.viewsOpen);
  const partialRefMode = computed(() => state.value.partialRefMode);
  const showValues = computed(() => state.value.showValues);
  const lineageColumns = computed(() => state.value.lineageColumns);
  const followNewViews = computed(() => state.value.followNewViews);

  const splitSizes = computed<number[]>({
    get: () => [...state.value.splitSizes],
    set: (sizes) => {
      if (sizes.length === 2) {
        state.value.splitSizes = [sizes[0]!, sizes[1]!];
      }
    },
  });

  function setTheme (mode: ThemeMode): void {
    state.value.theme = mode;
  }

  function toggleTheme (): void {
    setTheme(state.value.theme === 'dark' ? 'light' : 'dark');
  }

  function setDetailLevel (level: DetailLevel): void {
    state.value.detailLevel = level;
  }

  function toggleProblems (): void {
    state.value.problemsOpen = !state.value.problemsOpen;
  }

  function setProblemsOpen (open: boolean): void {
    state.value.problemsOpen = open;
  }

  function setEdgeMode (mode: EdgeMode): void {
    state.value.edgeMode = mode;
  }

  function toggleLineageLayout (): void {
    state.value.lineageLayout = !state.value.lineageLayout;
  }

  function toggleHighlightAll (): void {
    state.value.highlightAll = !state.value.highlightAll;
  }

  function setLayoutOpen (open: boolean): void {
    state.value.layoutOpen = open;
  }

  function toggleLayout (): void {
    state.value.layoutOpen = !state.value.layoutOpen;
  }

  function setLayoutSize (percent: number): void {
    state.value.layoutSize = Math.min(95, Math.max(5, percent));
  }

  function setViewsOpen (open: boolean): void {
    state.value.viewsOpen = open;
  }

  function toggleViews (): void {
    state.value.viewsOpen = !state.value.viewsOpen;
  }

  function setEditorCollapsed (collapsed: boolean): void {
    state.value.editorCollapsed = collapsed;
  }

  function setPartialRefMode (mode: PartialRefMode): void {
    state.value.partialRefMode = mode;
  }

  /** Switch partial refs between badges in their table headers and lines. */
  function togglePartialRefMode (): void {
    setPartialRefMode(state.value.partialRefMode === 'badges' ? 'lines' : 'badges');
  }

  /** Show or hide record values on their fields and record counts in table headers. */
  function toggleShowValues (): void {
    state.value.showValues = !state.value.showValues;
  }

  /** Draw lineage mapping by mapping, field to field, or as one edge per pair of tables. */
  function toggleLineageColumns (): void {
    state.value.lineageColumns = !state.value.lineageColumns;
  }

  /** Switch, or not, to a view the followed file gains on disk. */
  function toggleFollowNewViews (): void {
    state.value.followNewViews = !state.value.followNewViews;
  }

  watch(theme, (t) => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', t === 'dark');
    }
  }, {
    immediate: true,
  });

  return {
    theme,
    isDark,
    detailLevel,
    problemsOpen,
    edgeMode,
    showRefs,
    showLineage,
    lineageLayout,
    highlightAll,
    layoutOpen,
    layoutSize,
    editorCollapsed,
    splitSizes,
    setTheme,
    toggleTheme,
    setDetailLevel,
    toggleProblems,
    setProblemsOpen,
    setEdgeMode,
    toggleLineageLayout,
    toggleHighlightAll,
    setLayoutOpen,
    toggleLayout,
    viewsOpen,
    setViewsOpen,
    toggleViews,
    setLayoutSize,
    setEditorCollapsed,
    partialRefMode,
    setPartialRefMode,
    togglePartialRefMode,
    showValues,
    toggleShowValues,
    lineageColumns,
    toggleLineageColumns,
    followNewViews,
    toggleFollowNewViews,
  };
});

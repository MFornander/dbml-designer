import { computed, watch } from 'vue';
import { defineStore } from 'pinia';
import type { DetailLevel, ThemeMode } from '@/types/diagram';
import { usePersistedRef } from '@/utils/persistedRef';

/** Which connections the diagram draws: relationships, both, or lineage edges only. */
export type EdgeMode = 'erd' | 'erd+deps' | 'deps';

/** What the left pane shows: the DBML text, or the layout sidecar as YAML. */
export type EditorView = 'dbml' | 'layout';

interface UiState {
  version: 6;
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
  editorView: EditorView;
  /** The editor pane is hidden behind the split handle's chevron. */
  editorCollapsed: boolean;
}

const THEMES: readonly ThemeMode[] = ['light', 'dark'];
const LEVELS: readonly DetailLevel[] = ['all', 'keys', 'names'];
const EDGE_MODES: readonly EdgeMode[] = ['erd', 'erd+deps', 'deps'];
const EDITOR_VIEWS: readonly EditorView[] = ['dbml', 'layout'];

function isUiState (v: unknown): v is UiState {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Partial<UiState>;
  return s.version === 6
    && THEMES.includes(s.theme as ThemeMode)
    && LEVELS.includes(s.detailLevel as DetailLevel)
    && Array.isArray(s.splitSizes) && s.splitSizes.length === 2
    && s.splitSizes.every((n) => typeof n === 'number' && n > 0)
    && typeof s.problemsOpen === 'boolean'
    && EDGE_MODES.includes(s.edgeMode as EdgeMode)
    && typeof s.lineageLayout === 'boolean'
    && typeof s.highlightAll === 'boolean'
    && EDITOR_VIEWS.includes(s.editorView as EditorView)
    && typeof s.editorCollapsed === 'boolean';
}

/**
 * Version 1 stored [diagram, editor] sizes with the diagram on the left and had
 * no lineage flag; version 2 had a boolean `showLineage`; version 3 introduced
 * `edgeMode`; version 4 added the lineage-layout and highlight-all toggles;
 * version 5 added the editor view (DBML text or layout YAML); version 6 adds
 * the collapsed-editor flag.
 */
export function migrateUiState (raw: string): UiState {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const version = parsed.version as number;
  if (version >= 6) return parsed as unknown as UiState;
  if (version === 5) {
    return {
      ...(parsed as unknown as UiState),
      version: 6,
      editorCollapsed: false,
    };
  }
  if (version === 4) {
    return {
      ...(parsed as unknown as UiState),
      version: 6,
      editorView: 'dbml',
      editorCollapsed: false,
    };
  }

  const base = {
    theme: parsed.theme as ThemeMode,
    detailLevel: parsed.detailLevel as DetailLevel,
    problemsOpen: parsed.problemsOpen as boolean,
    lineageLayout: false,
    highlightAll: false,
    editorView: 'dbml' as EditorView,
    editorCollapsed: false,
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
    version: 6,
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
    version: 6,
    theme: preferredTheme(),
    detailLevel: 'all',
    splitSizes: [40, 60],
    problemsOpen: false,
    edgeMode: 'erd+deps',
    lineageLayout: false,
    highlightAll: false,
    editorView: 'dbml',
    editorCollapsed: false,
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
  const editorView = computed(() => state.value.editorView);
  const editorCollapsed = computed(() => state.value.editorCollapsed);

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

  function setEditorView (view: EditorView): void {
    state.value.editorView = view;
  }

  function setEditorCollapsed (collapsed: boolean): void {
    state.value.editorCollapsed = collapsed;
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
    editorView,
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
    setEditorView,
    setEditorCollapsed,
  };
});

import { computed, markRaw } from 'vue';
import { defineStore } from 'pinia';
import { toModel } from '@/dbml/toModel';
import { createEngine } from '@/diagram/engine/engine';
import {
  emptyLayoutState, isLayoutState, layoutStateFrom, type LayoutState,
} from '@/diagram/engine/layout';
import { splitLayoutComment, validateLayout } from '@/layout';
import type { LayoutSnapshot } from '@/layout';
import { usePersistedRef } from '@/utils/persistedRef';
import { useParserStore } from './parserStore';
import { useUiStore } from './uiStore';

interface ViewState {
  version: 1;
  /** Name of the active `DiagramView`, or null for the Default View. */
  activeView: string | null;
}

function isViewState (v: unknown): v is ViewState {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Partial<ViewState>;
  return s.version === 1 && (s.activeView === null || typeof s.activeView === 'string');
}

/**
 * The editor's one diagram engine. It draws the last error-free parse, converted from DBML,
 * inherits the layouts in the footers of the files the DBML imports, takes its display options
 * from the UI preferences, and keeps its layout layers and active view in local storage.
 */
export const useEngineStore = defineStore('engine', () => {
  const parser = useParserStore();
  const ui = useUiStore();

  const layoutState = usePersistedRef<LayoutState>('layout', emptyLayoutState, {
    debounceMs: 250,
    validate: isLayoutState,
    deserialize: (raw) => layoutStateFrom(JSON.parse(raw) as Partial<LayoutState>),
  });
  const viewState = usePersistedRef<ViewState>('views', () => ({
    version: 1,
    activeView: null,
  }), {
    validate: isViewState,
  });
  const activeView = computed({
    get: () => viewState.value.activeView,
    set: (name: string | null) => {
      viewState.value = {
        ...viewState.value,
        activeView: name,
      };
    },
  });

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

  // rawDatabase only changes after an error-free parse, so a syntax error never reaches the engine.
  const engine = markRaw(createEngine({
    model: () => toModel(parser.rawDatabase).model,
    loading: () => parser.isLoading,
    bases: () => importedSnapshots.value,
    display: () => ({
      detailLevel: ui.detailLevel,
      dark: ui.isDark,
      showRefs: ui.showRefs,
      showLineage: ui.showLineage,
      partialRefMode: ui.partialRefMode,
      lineageLayout: ui.lineageLayout,
      highlightAll: ui.highlightAll,
    }),
    layoutState,
    activeView,
  }));

  return { engine };
});

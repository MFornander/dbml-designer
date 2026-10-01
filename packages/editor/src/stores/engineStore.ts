import { computed, markRaw } from 'vue';
import { defineStore } from 'pinia';
import { toModel } from '@/dbml/toModel';
import {
  createEngine, emptyLayoutState, isLayoutState, layoutStateFrom, type LayoutState,
} from '@dbml-designer/engine';
import { splitLayoutComment, validateLayout } from '@/layout';
import type { LayoutSnapshot } from '@/layout';
import { usePersistedRef } from '@/utils/persistedRef';
import { useEditorStore } from './editorStore';
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
 * The editor's one diagram engine. It draws the last error-free read of the document: DBML
 * converted to the engine's model, or a model file's model as it stands. It inherits the layouts
 * in the footers of the files the DBML imports, takes its display options from the UI preferences,
 * and keeps its layout layers and active view in local storage.
 */
export const useEngineStore = defineStore('engine', () => {
  const parser = useParserStore();
  const ui = useUiStore();
  const editor = useEditorStore();

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

  // Both kinds of document change the model only after a read without errors, so a typo never reaches the engine.
  const engine = markRaw(createEngine({
    model: () => (editor.language === 'json' ? parser.jsonModel ?? null : toModel(parser.rawDatabase).model),
    loading: () => parser.isLoading,
    // A model file imports nothing, so it inherits no layout.
    bases: () => (editor.language === 'json' ? [] : importedSnapshots.value),
    display: () => ({
      detailLevel: ui.detailLevel,
      dark: ui.isDark,
      showRefs: ui.showRefs,
      showLineage: ui.showLineage,
      lineageColumns: ui.lineageColumns,
      partialRefMode: ui.partialRefMode,
      showValues: ui.showValues,
      lineageLayout: ui.lineageLayout,
      highlightAll: ui.highlightAll,
      // A picked color is written into the text, which a read-only page never does.
      pickColors: !editor.readOnly,
    }),
    layoutState,
    activeView,
  }));

  return { engine };
});

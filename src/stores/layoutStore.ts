import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import {
  createLayout, emptyLayoutState, isLayoutState, layoutStateFrom, type LayoutState,
} from '@/diagram/engine/layout';
import { usePersistedRef } from '@/utils/persistedRef';
import { splitLayoutComment, validateLayout } from '@/layout';
import type { LayoutSnapshot } from '@/layout';
import { layoutKeysOf } from '@/layout/schemaKeys';
import { useParserStore } from './parserStore';
import { useViewStore } from './viewStore';

export type { PositionOrigin } from '@/diagram/engine/layout';

/**
 * What the View menu asks the diagram for: arranging the active view, placing only the tables
 * auto-placement put down (`arrange-new`), or taking the last arrangement back.
 */
export type ArrangeRequest = 'arrange' | 'arrange-new' | 'undo';

/**
 * The editor's layout: the engine's layers (`createLayout`), persisted, on top of the footers of
 * the files the DBML imports, and pruned against every error-free parse. What it keeps for itself
 * is exactly what its footer records.
 */
export const useLayoutStore = defineStore('layout', () => {
  const state = usePersistedRef<LayoutState>('layout', emptyLayoutState, {
    debounceMs: 250,
    validate: isLayoutState,
    deserialize: (raw) => layoutStateFrom(JSON.parse(raw) as Partial<LayoutState>),
  });

  const parser = useParserStore();
  const viewStore = useViewStore();

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

  // While a parse or its imports are on the way the model is the previous text's, so nothing is pruned against it.
  const validKeys = () => (parser.rawDatabase && !parser.isLoading ? layoutKeysOf(parser.rawDatabase) : null);

  const layout = createLayout({
    state,
    activeView: () => viewStore.activeView,
    bases: () => importedSnapshots.value,
    validKeys,
  });

  // rawDatabase only changes after an error-free parse, so a syntax error never prunes positions.
  watch(() => (parser.isLoading ? undefined : parser.rawDatabase), (db) => {
    if (db) layout.pruneTo(layoutKeysOf(db));
  }, {
    immediate: true,
  });

  const arrangeRequest = ref<ArrangeRequest | null>(null);

  /** Ask for an arrangement or for taking one back; arranging needs the measured table sizes, so the diagram pane carries it out. */
  function requestArrange (request: ArrangeRequest): void {
    arrangeRequest.value = request;
  }

  function clearArrangeRequest (): void {
    arrangeRequest.value = null;
  }

  const { state: _state, pruneTo: _pruneTo, ...api } = layout;

  return {
    ...api,
    arrangeRequest,
    requestArrange,
    clearArrangeRequest,
  };
});

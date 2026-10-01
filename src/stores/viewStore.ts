import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { createViews } from '@/diagram/engine/views';
import { usePersistedRef } from '@/utils/persistedRef';

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
 * The editor's diagram views: the engine's view state (`createViews`), with the choice of view
 * persisted, and the requests the header's menu makes of the Diagram Views panel. Save writes the
 * working set back into the DBML.
 */
export const useViewStore = defineStore('views', () => {
  const state = usePersistedRef<ViewState>('views', () => ({
    version: 1,
    activeView: null,
  }), {
    validate: isViewState,
  });
  const active = computed({
    get: () => state.value.activeView,
    set: (activeView: string | null) => {
      state.value = {
        ...state.value,
        activeView,
      };
    },
  });
  const views = createViews({ active });

  /** A request from elsewhere to name a new view or rename the active one; the panel opens its name form and clears this. */
  const pendingRequest = ref<'create' | 'rename' | null>(null);

  function requestCreate (): void {
    pendingRequest.value = 'create';
  }

  function requestRename (): void {
    pendingRequest.value = 'rename';
  }

  function clearRequest (): void {
    pendingRequest.value = null;
  }

  return {
    ...views,
    pendingRequest,
    requestCreate,
    requestRename,
    clearRequest,
  };
});

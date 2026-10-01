import { ref } from 'vue';
import { defineStore } from 'pinia';
import { useEngineStore } from './engineStore';

/**
 * The editor's diagram views: its engine's view state (see `engineStore`), and the requests the
 * header's menu makes of the Diagram Views panel. Save writes the working set back into the DBML.
 */
export const useViewStore = defineStore('views', () => {
  const { engine } = useEngineStore();

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
    ...engine.views,
    pendingRequest,
    requestCreate,
    requestRename,
    clearRequest,
  };
});

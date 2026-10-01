import { ref } from 'vue';
import { defineStore } from 'pinia';
import { useEngineStore } from './engineStore';

export type { PositionOrigin } from '@/diagram/engine/layout';

/**
 * What the View menu asks the diagram for: arranging the active view, placing only the tables
 * auto-placement put down (`arrange-new`), or taking the last arrangement back.
 */
export type ArrangeRequest = 'arrange' | 'arrange-new' | 'undo';

/**
 * The editor's layout: the layers of its engine (see `engineStore`), on top of the footers of the
 * files the DBML imports. What it keeps for itself is exactly what its footer records.
 */
export const useLayoutStore = defineStore('layout', () => {
  const { engine } = useEngineStore();
  const { state: _state, pruneTo: _pruneTo, ...layout } = engine.layout;

  const arrangeRequest = ref<ArrangeRequest | null>(null);

  /** Ask for an arrangement or for taking one back; arranging needs the measured table sizes, so the diagram pane carries it out. */
  function requestArrange (request: ArrangeRequest): void {
    arrangeRequest.value = request;
  }

  function clearArrangeRequest (): void {
    arrangeRequest.value = null;
  }

  return {
    ...layout,
    arrangeRequest,
    requestArrange,
    clearArrangeRequest,
  };
});

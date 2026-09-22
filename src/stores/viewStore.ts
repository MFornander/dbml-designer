import { computed, ref, shallowRef } from 'vue';
import { defineStore } from 'pinia';
import type { DiagramModel, DiagramViewVM } from '@/diagram/types';
import { hiddenForView, sameHidden } from '@/diagram/adapter/views';
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
 * The active diagram view and what it hides. The choice of view persists; the working set of
 * hidden tables and notes starts from the view's definition and takes unsaved toggles until
 * Save writes them back into the DBML.
 */
export const useViewStore = defineStore('views', () => {
  const state = usePersistedRef<ViewState>('views', () => ({
    version: 1,
    activeView: null,
  }), {
    validate: isViewState,
  });

  const activeView = computed(() => state.value.activeView);
  const views = shallowRef<readonly DiagramViewVM[]>([]);
  /** The model the views were last read from, for picking a view from a place that has no model at hand. */
  const model = shallowRef<DiagramModel | null>(null);
  /** A request from elsewhere to name a new view or rename the active one; the panel opens its name form and clears this. */
  const pendingRequest = ref<'create' | 'rename' | null>(null);
  const view = computed(() => views.value.find((v) => v.name === activeView.value) ?? null);
  /** Hidden tables and notes as currently shown: the definition plus unsaved toggles. */
  const hidden = shallowRef<ReadonlySet<string>>(new Set());
  /** What the active view's definition hides. */
  const baseHidden = shallowRef<ReadonlySet<string>>(new Set());
  const dirty = computed(() => !sameHidden(hidden.value, baseHidden.value));

  function setActive (name: string | null): void {
    if (state.value.activeView !== name) {
      state.value = {
        ...state.value,
        activeView: name,
      };
    }
  }

  function resetTo (base: ReadonlySet<string>): void {
    baseHidden.value = base;
    hidden.value = new Set(base);
  }

  /**
   * Follow a new parse. Unsaved toggles survive edits elsewhere in the text; the working set
   * is reset only when the active view's definition changed, and a view that disappeared
   * falls back to the Default View.
   */
  function sync (m: DiagramModel): void {
    model.value = m;
    views.value = m.views;
    const active = m.views.find((v) => v.name === state.value.activeView) ?? null;
    if (state.value.activeView !== null && !active) setActive(null);
    const base = hiddenForView(m, active);
    if (!sameHidden(base, baseHidden.value)) resetTo(base);
  }

  /** Switch views, discarding unsaved toggles; against the model given, else the one last synced. */
  function select (name: string | null, m: DiagramModel | null = model.value): void {
    setActive(name);
    if (!m) {
      resetTo(new Set());
      return;
    }
    resetTo(hiddenForView(m, m.views.find((v) => v.name === name) ?? null));
  }

  function requestCreate (): void {
    pendingRequest.value = 'create';
  }

  function requestRename (): void {
    pendingRequest.value = 'rename';
  }

  function clearRequest (): void {
    pendingRequest.value = null;
  }

  /** After saving: the working set is now the definition of `name`. */
  function adopt (name: string): void {
    setActive(name);
    baseHidden.value = new Set(hidden.value);
  }

  function setHidden (keys: Iterable<string>, isHidden: boolean): void {
    const next = new Set(hidden.value);
    for (const k of keys) {
      if (isHidden) next.add(k);
      else next.delete(k);
    }
    if (!sameHidden(next, hidden.value)) hidden.value = next;
  }

  function toggle (key: string): void {
    setHidden([key], !hidden.value.has(key));
  }

  /** Drop unsaved toggles. */
  function revert (): void {
    hidden.value = new Set(baseHidden.value);
  }

  return {
    activeView,
    views,
    view,
    hidden,
    baseHidden,
    dirty,
    pendingRequest,
    sync,
    select,
    requestCreate,
    requestRename,
    clearRequest,
    adopt,
    setHidden,
    toggle,
    revert,
  };
});

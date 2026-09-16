import { computed, shallowRef } from 'vue';
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
  function sync (model: DiagramModel): void {
    views.value = model.views;
    const active = model.views.find((v) => v.name === state.value.activeView) ?? null;
    if (state.value.activeView !== null && !active) setActive(null);
    const base = hiddenForView(model, active);
    if (!sameHidden(base, baseHidden.value)) resetTo(base);
  }

  /** Switch views, discarding unsaved toggles. */
  function select (name: string | null, model: DiagramModel): void {
    setActive(name);
    resetTo(hiddenForView(model, model.views.find((v) => v.name === name) ?? null));
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
    sync,
    select,
    adopt,
    setHidden,
    toggle,
    revert,
  };
});

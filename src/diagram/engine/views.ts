/**
 * Diagram views: which tables and notes a view shows, and the active view of one engine. A view
 * lists what is visible; a section it leaves out hides nothing, so a view with only `tables`
 * keeps every note.
 */
import { computed, shallowRef, type Ref } from 'vue';
import type {
  DiagramModel, DiagramViewVM, NoteVM, TableVM,
} from '../types';

/** Keys of the tables and notes a view hides; empty for the default view (everything visible). */
export function hiddenForView (model: DiagramModel, view: DiagramViewVM | null): Set<string> {
  const hidden = new Set<string>();
  if (!view) return hidden;
  if (view.filtersTables) {
    const shown = new Set<string>(view.tableKeys);
    const schemas = new Set(view.schemas);
    for (const t of model.tables) if (schemas.has(t.schema)) shown.add(t.key);
    for (const g of model.groups) {
      if (view.groupKeys.includes(g.key)) for (const k of g.tableKeys) shown.add(k);
    }
    for (const t of model.tables) if (!shown.has(t.key)) hidden.add(t.key);
  }
  if (view.filtersNotes) {
    const shown = new Set(view.noteKeys);
    for (const n of model.notes) if (!shown.has(n.key)) hidden.add(n.key);
  }
  return hidden;
}

/** The tables and notes left visible by a hidden set, in declaration order. */
export function visibleEntities (model: DiagramModel, hidden: ReadonlySet<string>): { tables: TableVM[]; notes: NoteVM[] } {
  return {
    tables: model.tables.filter((t) => !hidden.has(t.key)),
    notes: model.notes.filter((n) => !hidden.has(n.key)),
  };
}

/** Two hidden sets with the same members. */
export function sameHidden (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const k of a) if (!b.has(k)) return false;
  return true;
}

export interface ViewsOptions {
  /**
   * Where the active view's name is kept, null for the Default View; a host that wants the choice
   * to outlive the page passes a ref it persists. Defaults to a fresh one.
   */
  active?: Ref<string | null>;
}

/**
 * The active view and what it hides. The working set of hidden tables and notes starts from the
 * view's definition and takes unsaved toggles until the host writes them back into the view
 * (`adopt`).
 */
export function createViews (options: ViewsOptions = {}) {
  const active = options.active ?? shallowRef<string | null>(null);
  const views = shallowRef<readonly DiagramViewVM[]>([]);
  /** The model the views were last read from, for picking a view from a place that has no model at hand. */
  const model = shallowRef<DiagramModel | null>(null);
  const view = computed(() => views.value.find((v) => v.name === active.value) ?? null);
  /** Hidden tables and notes as currently shown: the definition plus unsaved toggles. */
  const hidden = shallowRef<ReadonlySet<string>>(new Set());
  /** What the active view's definition hides. */
  const baseHidden = shallowRef<ReadonlySet<string>>(new Set());
  const dirty = computed(() => !sameHidden(hidden.value, baseHidden.value));

  function setActive (name: string | null): void {
    if (active.value !== name) active.value = name;
  }

  function resetTo (base: ReadonlySet<string>): void {
    baseHidden.value = base;
    hidden.value = new Set(base);
  }

  /**
   * Follow a new model. Unsaved toggles survive changes elsewhere; the working set is reset only
   * when the active view's definition changed, and a view that disappeared falls back to the
   * Default View.
   */
  function sync (m: DiagramModel): void {
    model.value = m;
    views.value = m.views;
    const current = m.views.find((v) => v.name === active.value) ?? null;
    if (active.value !== null && !current) setActive(null);
    const base = hiddenForView(m, current);
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

  /** After the host saved the working set as view `name`: that is now its definition. */
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
    /** Name of the active view, null for the Default View. */
    activeView: computed(() => active.value),
    views,
    model,
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
}

export type Views = ReturnType<typeof createViews>;

/**
 * Diagram views: which tables and notes a `DiagramView` shows. A view lists what is visible;
 * a section it leaves out hides nothing, so a view with only `tables` keeps every note.
 */
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

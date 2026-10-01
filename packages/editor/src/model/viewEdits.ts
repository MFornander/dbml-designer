/**
 * Writing views into a model file, as `viewText.ts` writes `DiagramView` blocks into DBML: the
 * view for what the Diagram Views panel shows, and the edits that add, replace, rename, or remove
 * one in `model.views`.
 */
import { findNodeAtLocation, parseTree, type JSONPath } from 'jsonc-parser';
import type { ModelView, NoteVM, TableVM } from '@dbml-designer/engine';
import type { TextEdit } from '@/editor/colorEdit';
import { setAtPath } from './modelFile';

/**
 * A view listing the visible tables and notes. A list is written only when something of its kind
 * is hidden, so a view that hides nothing of a kind keeps following the model for that kind.
 */
export function modelViewOf (
  name: string,
  visible: { tables: readonly TableVM[]; notes: readonly NoteVM[] },
  totals: { tables: number; notes: number },
): ModelView {
  const view: ModelView = { name };
  if (visible.tables.length < totals.tables) view.tables = visible.tables.map((t) => t.key);
  if (visible.notes.length < totals.notes) view.notes = visible.notes.map((n) => n.name);
  return view;
}

/** How many views the model lists, or undefined when it has no `views`. */
function viewCount (text: string): number | undefined {
  const tree = parseTree(text);
  const views = tree && findNodeAtLocation(tree, ['model', 'views']);
  return views?.type === 'array' ? views.children?.length ?? 0 : undefined;
}

/** Replace the view at `path`, or add one at the end of `model.views`. */
export function upsertModelView (text: string, path: JSONPath | null, view: ModelView): TextEdit[] {
  if (path) return setAtPath(text, path, view);
  const count = viewCount(text);
  return count === undefined
    ? setAtPath(text, ['model', 'views'], [view])
    : setAtPath(text, ['model', 'views', count], view, { insert: true });
}

/** Remove the view at `path`. */
export function deleteModelView (text: string, path: JSONPath): TextEdit[] {
  return setAtPath(text, path, undefined);
}

/** Rename the view at `path`. */
export function renameModelView (text: string, path: JSONPath, name: string): TextEdit[] {
  return setAtPath(text, [...path, 'name'], name);
}

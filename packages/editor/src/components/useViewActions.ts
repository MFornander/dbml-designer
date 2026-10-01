import { visibleEntities, type DiagramModel, type DiagramViewVM } from '@dbml-designer/engine';
import { tokenOf } from '@/dbml/token';
import { offsetAt } from '@/editor/colorEdit';
import {
  deleteDiagramView, diagramViewText, renameDiagramView, upsertDiagramView,
} from '@/editor/viewText';
import { useTextEdits } from '@/editor/useTextEdits';
import { jsonPathOf } from '@/model/modelFile';
import {
  deleteModelView, modelViewOf, renameModelView, upsertModelView,
} from '@/model/viewEdits';
import { useEditorStore } from '@/stores/editorStore';
import { useParserStore } from '@/stores/parserStore';
import { useViewStore } from '@/stores/viewStore';

/**
 * What the header's view menu and the Diagram Views panel do to views in the text: `DiagramView`
 * blocks in DBML, or entries of `model.views` in a model file.
 */
export function useViewActions () {
  const views = useViewStore();
  const parser = useParserStore();
  const editor = useEditorStore();
  const textEdits = useTextEdits();

  /** The text range of a view's DBML block, from the view's source; null when it has none. */
  function rangeOf (source: unknown): { start: number; end: number } | null {
    const token = tokenOf(source);
    if (!token) return null;
    const text = textEdits.text();
    return {
      start: offsetAt(text, token.start.line, token.start.column),
      end: offsetAt(text, token.end.line, token.end.column),
    };
  }

  /** A view declared in an imported file is shown but cannot be rewritten from this text. */
  function editable (v: { source?: unknown } | null): boolean {
    if (!v) return false;
    if (jsonPathOf(v.source)) return true;
    const file = tokenOf(v.source)?.file;
    return file === undefined || file === parser.entryPath;
  }

  /** Remove the view from the text and fall back to the Default View; false when that cannot be done now. */
  function deleteView (v: DiagramViewVM | null): boolean {
    if (!v || parser.isStale || !editable(v)) return false;
    const path = jsonPathOf(v.source);
    const range = path ? null : rangeOf(v.source);
    if (path) textEdits.apply(deleteModelView(textEdits.text(), path));
    else if (range) textEdits.apply(deleteDiagramView(textEdits.text(), range));
    else return false;
    views.select(null);
    return true;
  }

  /** Write what the diagram shows now as view `name`: over `v`'s definition, or as a new view when `v` is null. */
  function writeView (model: DiagramModel, v: DiagramViewVM | null, name: string): void {
    const visible = visibleEntities(model, views.hidden);
    const totals = {
      tables: model.tables.length,
      notes: model.notes.length,
    };
    const text = textEdits.text();
    if (editor.language === 'json') {
      textEdits.apply(upsertModelView(text, jsonPathOf(v?.source) ?? null, modelViewOf(name, visible, totals)));
    } else {
      textEdits.apply(upsertDiagramView(text, v ? rangeOf(v.source) : null, diagramViewText(name, visible, totals)));
    }
  }

  /** Rename the view in the text; false when it cannot be found there. */
  function renameView (v: DiagramViewVM, name: string): boolean {
    const path = jsonPathOf(v.source);
    if (path) {
      textEdits.apply(renameModelView(textEdits.text(), path, name));
      return true;
    }
    const range = rangeOf(v.source);
    if (!range) return false;
    textEdits.apply(renameDiagramView(textEdits.text(), range, name));
    return true;
  }

  return {
    rangeOf,
    editable,
    deleteView,
    writeView,
    renameView,
  };
}

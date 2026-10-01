import type { DiagramViewVM } from '@/engine';
import { tokenOf } from '@/dbml/token';
import { offsetAt } from '@/editor/colorEdit';
import { deleteDiagramView } from '@/editor/viewText';
import { useTextEdits } from '@/editor/useTextEdits';
import { useParserStore } from '@/stores/parserStore';
import { useViewStore } from '@/stores/viewStore';

/** What the header's view menu and the Diagram Views panel both do to `DiagramView` blocks in the text. */
export function useViewActions () {
  const views = useViewStore();
  const parser = useParserStore();
  const textEdits = useTextEdits();

  /** The text range of a view's block, from the view's source; null when it has none. */
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
    const file = tokenOf(v.source)?.file;
    return file === undefined || file === parser.entryPath;
  }

  /** Remove the view's block from the DBML and fall back to the Default View; false when that cannot be done now. */
  function deleteView (v: DiagramViewVM | null): boolean {
    const range = v ? rangeOf(v.source) : null;
    if (!range || parser.isStale || !editable(v)) return false;
    textEdits.apply(deleteDiagramView(textEdits.text(), range));
    views.select(null);
    return true;
  }

  return {
    rangeOf,
    editable,
    deleteView,
  };
}

import type { DiagramViewVM } from '@/diagram/types';
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

  function rangeOf (token: NonNullable<DiagramViewVM['token']>) {
    const text = textEdits.text();
    return {
      start: offsetAt(text, token.start.line, token.start.column),
      end: offsetAt(text, token.end.line, token.end.column),
    };
  }

  /** A view declared in an imported file is shown but cannot be rewritten from this text. */
  function editable (v: { token?: { file?: string } } | null): boolean {
    return !!v && (v.token?.file === undefined || v.token.file === parser.entryPath);
  }

  /** Remove the view's block from the DBML and fall back to the Default View; false when that cannot be done now. */
  function deleteView (v: DiagramViewVM | null): boolean {
    if (!v?.token || parser.isStale || !editable(v)) return false;
    textEdits.apply(deleteDiagramView(textEdits.text(), rangeOf(v.token)));
    views.select(null);
    return true;
  }

  return {
    rangeOf,
    editable,
    deleteView,
  };
}

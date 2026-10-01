import { useEditorStore } from '@/stores/editorStore';
import { useEditorInstance } from '@/editor/editorInstance';
import { applyTextEdits, type TextEdit } from './colorEdit';

/** Apply edits computed against the current text: through Monaco as one undo step, or straight to the store. */
export function useTextEdits () {
  const editor = useEditorStore();
  const instance = useEditorInstance();

  function apply (edits: readonly TextEdit[]): void {
    if (edits.length === 0) return;
    if (!instance.applyEdits(edits)) editor.setText(applyTextEdits(editor.text, edits));
  }

  return {
    apply,
    /** The text edits are computed against. */
    text: () => editor.text,
  };
}

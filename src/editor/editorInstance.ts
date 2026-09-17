import { shallowRef } from 'vue';
import * as monaco from 'monaco-editor';

// Module singletons: Monaco objects must stay out of reactive store state.

export interface LineRange {
  startLine: number;
  endLine: number;
}

export interface TextEditSpan {
  start: number;
  end: number;
  text: string;
}

type RevealOptions = { select?: boolean; focus?: boolean };

/** A handle on one mounted Monaco editor: reveal, decorate, and edit it from anywhere. */
function createEditorInstance (editSource: string) {
  const instance = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  let lineDecorations: monaco.editor.IEditorDecorationsCollection | null = null;
  /** A reveal asked for while no editor was mounted; runs as soon as one is. */
  let pendingReveal: { range: monaco.IRange; opts: RevealOptions } | null = null;

  function revealRange (range: monaco.IRange, opts: RevealOptions = {}): void {
    const editor = instance.value;
    if (!editor) {
      pendingReveal = {
        range,
        opts,
      };
      return;
    }
    if (opts.select ?? true) editor.setSelection(range);
    editor.revealRangeNearTop(range);
    if (opts.focus ?? true) editor.focus();
  }

  function set (editor: monaco.editor.IStandaloneCodeEditor | null): void {
    lineDecorations?.clear();
    lineDecorations = null;
    instance.value = editor;
    if (editor && pendingReveal) {
      const { range, opts } = pendingReveal;
      pendingReveal = null;
      revealRange(range, opts);
    }
  }

  function revealLine (line: number, column = 1): void {
    const editor = instance.value;
    if (!editor) return;
    editor.setPosition({
      lineNumber: line,
      column,
    });
    editor.revealLineNearTop(line);
    editor.focus();
  }

  /** Replace character ranges (non-overlapping) as one undoable step; false when no editor is mounted. */
  function applyEdits (edits: readonly TextEditSpan[]): boolean {
    const editor = instance.value;
    const model = editor?.getModel();
    if (!editor || !model) return false;
    editor.pushUndoStop();
    editor.executeEdits(editSource, edits.map((e) => ({
      range: monaco.Range.fromPositions(model.getPositionAt(e.start), model.getPositionAt(e.end)),
      text: e.text,
    })));
    editor.pushUndoStop();
    return true;
  }

  function applyEdit (edit: TextEditSpan): boolean {
    return applyEdits([edit]);
  }

  function highlightLines (range: LineRange | null): void {
    const editor = instance.value;
    if (!editor) return;
    if (!range) {
      lineDecorations?.clear();
      return;
    }
    const decorations: monaco.editor.IModelDeltaDecoration[] = [{
      range: new monaco.Range(range.startLine, 1, range.endLine, 1),
      options: {
        isWholeLine: true,
        className: 'dbml-line-highlight',
      },
    }];
    if (lineDecorations) {
      lineDecorations.set(decorations);
    } else {
      lineDecorations = editor.createDecorationsCollection(decorations);
    }
  }

  return {
    instance,
    set,
    revealRange,
    revealLine,
    highlightLines,
    applyEdit,
    applyEdits,
  };
}

const dbmlEditor = createEditorInstance('dbml-edit.text');

/** The DBML editor. */
export function useEditorInstance () {
  return dbmlEditor;
}

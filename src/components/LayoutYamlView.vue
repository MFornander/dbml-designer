<template>
  <div class="w-full h-full flex flex-col">
    <div
      ref="container"
      class="flex-1 min-h-0"
    />
    <div class="status-bar bg-white border-t border-gray-200 px-3 py-1 text-xs text-gray-600 flex justify-between items-center dark:bg-[#1e1e1e] dark:border-gray-700 dark:text-gray-400">
      <div class="flex items-center space-x-4">
        <span>YAML</span>
        <span>Ln {{ cursor.line }}, Col {{ cursor.column }}</span>
      </div>
      <div class="flex items-center space-x-3">
        <span
          :class="statusClass"
          :title="statusTitle"
        >{{ status }}</span>
        <button
          type="button"
          class="cursor-pointer text-blue-600 hover:underline dark:text-blue-300"
          title="Replace the text with the layout as the diagram has it now"
          @click="store.regenerate()"
        >
          Reset to diagram
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch,
} from 'vue';
import * as monaco from 'monaco-editor';
import {
  DBMLLanguageService, EDITOR_FONT_FAMILY, EDITOR_FONT_SIZE, EDITOR_LINE_HEIGHT,
} from '@/editor/dbml_language';
import { useLayoutEditorInstance } from '@/editor/editorInstance';
import type { ParserDiagnostic } from '@/types/diagnostics';
import { useLayoutTextStore } from '@/stores/layoutTextStore';
import { useUiStore } from '@/stores/uiStore';

/**
 * The `.dbml.yaml` sidecar as an editor. Typing is checked after a short pause and, when the
 * text is error-free, applied to the diagram; dragging in the diagram edits the text in place.
 */
const store = useLayoutTextStore();
const ui = useUiStore();
const layoutEditor = useLayoutEditorInstance();

const MARKER_OWNER = 'dbml-layout';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const status = computed(() => {
  const e = store.errors.length;
  const w = store.warnings.length;
  if (store.outOfSync) return 'Diagram changed while the text has errors';
  if (e) return `${plural(e, 'error')}, not applied`;
  if (w) return plural(w, 'warning');
  return 'Follows the diagram';
});
const statusTitle = computed(() => {
  if (store.outOfSync) return 'The diagram\'s latest changes are held until the text parses again; fix the errors or reset the text';
  if (store.errors.length) return 'The diagram keeps its layout until the errors are fixed';
  if (store.warnings.length) return 'Entries the DBML does not have are ignored by the diagram';
  return 'Valid changes are applied to the diagram as you type; diagram changes are written back here';
});
const statusClass = computed(() => {
  if (store.errors.length || store.outOfSync) return 'text-red-600 dark:text-red-400';
  if (store.warnings.length) return 'text-amber-600 dark:text-amber-400';
  return '';
});

const container = useTemplateRef<HTMLElement>('container');
const editor = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null);
let model: monaco.editor.ITextModel | null = null;
const disposables: monaco.IDisposable[] = [];
/** Set while the store's text is being written into the model, so the change is not echoed back. */
let applying = false;

const cursor = ref({
  line: 1,
  column: 1,
});

/** Replace only the part of the model that differs, so the cursor and undo history stay sensible. */
function applyMinimalEdit (m: monaco.editor.ITextModel, next: string): void {
  const current = m.getValue();
  if (current === next) return;
  const max = Math.min(current.length, next.length);
  let prefix = 0;
  while (prefix < max && current.charCodeAt(prefix) === next.charCodeAt(prefix)) prefix += 1;
  let suffix = 0;
  while (suffix < max - prefix
    && current.charCodeAt(current.length - 1 - suffix) === next.charCodeAt(next.length - 1 - suffix)) suffix += 1;
  const range = monaco.Range.fromPositions(m.getPositionAt(prefix), m.getPositionAt(current.length - suffix));
  m.pushEditOperations([], [{
    range,
    text: next.slice(prefix, next.length - suffix),
  }], () => null);
}

function toMarker (m: monaco.editor.ITextModel, d: ParserDiagnostic, severity: monaco.MarkerSeverity): monaco.editor.IMarkerData {
  const empty = d.location.line === d.endLocation.line && d.location.column === d.endLocation.column;
  return {
    severity,
    message: d.message,
    source: 'layout',
    code: String(d.code),
    startLineNumber: d.location.line,
    startColumn: d.location.column,
    endLineNumber: d.endLocation.line,
    endColumn: empty ? m.getLineMaxColumn(d.location.line) : d.endLocation.column,
  };
}

function updateMarkers (): void {
  if (!model) return;
  const m = model;
  monaco.editor.setModelMarkers(m, MARKER_OWNER, [
    ...store.errors.map((d) => toMarker(m, d, monaco.MarkerSeverity.Error)),
    ...store.warnings.map((d) => toMarker(m, d, monaco.MarkerSeverity.Warning)),
  ]);
}

onMounted(() => {
  if (!container.value) return;
  model = monaco.editor.createModel(store.text, 'yaml');
  const created = monaco.editor.create(container.value, {
    model,
    theme: DBMLLanguageService.getThemeName(ui.theme),
    minimap: {
      enabled: false,
    },
    wordWrap: 'off',
    scrollBeyondLastLine: false,
    fontFamily: EDITOR_FONT_FAMILY,
    fontSize: EDITOR_FONT_SIZE,
    lineHeight: EDITOR_LINE_HEIGHT,
    tabSize: 2,
    insertSpaces: true,
    lineNumbers: 'on',
    lineNumbersMinChars: 2,
    lineDecorationsWidth: 4,
    glyphMargin: true,
    padding: {
      top: 10,
      bottom: 10,
    },
    renderWhitespace: 'none',
    renderLineHighlight: 'none',
    occurrencesHighlight: 'off',
    automaticLayout: true,
    fixedOverflowWidgets: true,
    folding: true,
    foldingStrategy: 'indentation',
    quickSuggestions: false,
    wordBasedSuggestions: 'off',
    scrollbar: {
      vertical: 'visible',
      horizontal: 'auto',
      useShadows: false,
      verticalScrollbarSize: 10,
      horizontalScrollbarSize: 10,
    },
  });
  editor.value = created;
  disposables.push(model.onDidChangeContent(() => {
    if (!applying && model) store.setText(model.getValue());
  }));
  disposables.push(created.onDidChangeCursorPosition((e) => {
    cursor.value = {
      line: e.position.lineNumber,
      column: e.position.column,
    };
  }));
  updateMarkers();
  layoutEditor.set(created);
});

// Diagram changes and imports arrive through the store; write them into the model without echo.
watch(() => store.text, (next) => {
  if (!model || applying) return;
  applying = true;
  try {
    applyMinimalEdit(model, next);
  } finally {
    applying = false;
  }
});

watch(() => [store.errors, store.warnings], updateMarkers);

watch(() => ui.theme, (t) => monaco.editor.setTheme(DBMLLanguageService.getThemeName(t)));

onBeforeUnmount(() => {
  layoutEditor.set(null);
  disposables.forEach((d) => d.dispose());
  disposables.length = 0;
  editor.value?.dispose();
  editor.value = null;
  model?.dispose();
  model = null;
});
</script>

<style scoped>
/* Same footer as the DBML editor's status bar (DbmlEditor.vue). */
.status-bar {
  height: 22px;
  min-height: 22px;
  font-family: 'Inconsolata', ui-monospace, SFMono-Regular, Menlo, monospace;
  user-select: none;
  flex-shrink: 0;
}

.status-bar span,
.status-bar button {
  white-space: nowrap;
}
</style>

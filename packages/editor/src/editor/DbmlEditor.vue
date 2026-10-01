<!-- Adapted from holistics/dbml dbml-playground (src/components/editor/DbmlEditor.vue), Apache-2.0. See NOTICE. -->
<template>
  <div class="monaco-editor-wrapper w-full h-full flex flex-col">
    <div
      ref="editorContainer"
      class="flex-1 min-h-0"
    />
    <div class="status-bar bg-white border-t border-gray-200 px-3 py-1 text-xs text-gray-600 flex justify-between items-center dark:bg-[#1e1e1e] dark:border-gray-700 dark:text-gray-400">
      <div class="flex items-center space-x-4">
        <span>{{ doc.language === 'json' ? 'JSON' : 'DBML' }}</span>
        <span v-if="!readOnly">UTF-8</span>
      </div>
      <div class="flex items-center space-x-4">
        <span>Ln {{ cursorPosition.line }}, Col {{ cursorPosition.column }}</span>
        <span v-if="selectionInfo.hasSelection">
          ({{ selectionInfo.selectedChars }} selected)
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ref, shallowRef, computed, useTemplateRef, watch, nextTick, onMounted, onBeforeUnmount,
} from 'vue';
import * as monaco from 'monaco-editor';
import { DEFAULT_ENTRY } from '@dbml/parse';
import {
  DBMLLanguageService, EDITOR_FONT_FAMILY, EDITOR_FONT_SIZE, EDITOR_LINE_HEIGHT,
} from '@/editor/dbml_language';
import { useMonacoModel } from '@/editor/useMonacoModel';
import { setupDbmlServices, updateDiagnosticMarkers } from '@/editor/dbml_services';
import { MODEL_FILE_SCHEMA } from '@/model/modelFileSchema';
import { useEditorStore } from '@/stores/editorStore';
import { useParserStore } from '@/stores/parserStore';
import { useUiStore } from '@/stores/uiStore';
import type { ParserDiagnostic } from '@/types/diagnostics';

const {
  readOnly = false,
  filepath = DEFAULT_ENTRY.absolute,
} = defineProps<{
  readOnly?: boolean;
  filepath?: string;
}>();

const content = defineModel<string>({
  required: true,
});

const emit = defineEmits<{
  (e: 'editor-mounted', editor: monaco.editor.IStandaloneCodeEditor): void;
  (e: 'cursor-move', pos: {
    line: number;
    column: number;
  }): void;
}>();

const parser = useParserStore();
const ui = useUiStore();
const doc = useEditorStore();

// Monaco model

const DBML_LANGUAGE_ID = DBMLLanguageService.getLanguageId();

const monacoUri = computed(() => monaco.Uri.file(filepath));

const {
  model,
  setContent,
  setLanguage,
} = useMonacoModel(monacoUri);

/** Owner of the markers for names a model file uses but does not have; Monaco's JSON service marks the rest. */
const MODEL_MARKERS = 'dbml-designer-model';

function toMarker (d: ParserDiagnostic): monaco.editor.IMarkerData {
  return {
    severity: monaco.MarkerSeverity.Warning,
    message: d.message,
    startLineNumber: d.location.line,
    startColumn: d.location.column,
    endLineNumber: d.endLocation.line,
    endColumn: d.endLocation.column,
  };
}

/** Markers for the document as it was last read: the DBML compiler's, or a model file's reference problems. */
function refreshMarkers (): void {
  const m = model.value;
  if (doc.language === 'json') {
    monaco.editor.setModelMarkers(m, DBML_LANGUAGE_ID, []);
    monaco.editor.setModelMarkers(m, MODEL_MARKERS, parser.warnings.filter((w) => w.category === 'reference').map(toMarker));
  } else {
    monaco.editor.setModelMarkers(m, MODEL_MARKERS, []);
    updateDiagnosticMarkers(m);
  }
}

// The document is DBML or a model file; Monaco follows, also when a switch of files brings another
// Monaco model, which may have been left in the other language.
watch([model, () => doc.language], ([, language]) => {
  setLanguage(language === 'json' ? 'json' : DBML_LANGUAGE_ID);
  refreshMarkers();
}, {
  immediate: true,
});

// A model file is checked and completed against its schema; only the document in this editor is one.
watch(monacoUri, (uri) => {
  monaco.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: false,
    trailingCommas: 'error',
    schemaValidation: 'warning',
    enableSchemaRequest: false,
    schemas: [{
      uri: MODEL_FILE_SCHEMA.$id,
      fileMatch: [uri.toString()],
      schema: MODEL_FILE_SCHEMA,
    }],
  });
}, {
  immediate: true,
});

// Sync model <-> v-model
watch(model, (m, _, onCleanup) => {
  if (m.getValue() !== content.value) {
    m.setValue(content.value);
  }
  const disposable = m.onDidChangeContent(() => {
    content.value = m.getValue();
  });
  onCleanup(() => disposable.dispose());
}, {
  immediate: true,
});

watch(content, (value) => {
  if (model.value.getValue() !== value) {
    setContent(value);
  }
});

// Monaco editor

const editorContainer = useTemplateRef<HTMLElement>('editorContainer');
const editor = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null);

function editorConfig (): monaco.editor.IStandaloneEditorConstructionOptions {
  return {
    theme: DBMLLanguageService.getThemeName(ui.theme),
    readOnly,
    minimap: {
      enabled: false,
    },
    wordWrap: 'off',
    scrollBeyondLastLine: false,
    // dbdiagram's editor: Monaco's current default monospace stack at 12px on 18px lines.
    fontFamily: EDITOR_FONT_FAMILY,
    fontSize: EDITOR_FONT_SIZE,
    lineHeight: EDITOR_LINE_HEIGHT,
    tabSize: 2,
    insertSpaces: true,
    lineNumbers: 'on',
    lineNumbersMinChars: 2,
    lineDecorationsWidth: 4,
    columnSelection: false,
    padding: {
      top: 10,
      bottom: 10,
    },
    renderWhitespace: 'none',
    renderControlCharacters: true,
    smoothScrolling: true,
    cursorSmoothCaretAnimation: 'off',
    cursorBlinking: 'solid',
    automaticLayout: true,
    fixedOverflowWidgets: true,
    glyphMargin: false,
    folding: true,
    showFoldingControls: 'always',
    foldingStrategy: 'indentation',
    scrollbar: {
      vertical: 'visible',
      horizontal: 'visible',
      useShadows: false,
      verticalHasArrows: false,
      horizontalHasArrows: false,
      verticalScrollbarSize: 14,
      horizontalScrollbarSize: 14,
    },
    disableLayerHinting: true,
    selectOnLineNumbers: false,
    quickSuggestions: false,
    suggest: {
      showWords: false,
    },
    parameterHints: {
      enabled: false,
    },
    suggestOnTriggerCharacters: true,
    acceptSuggestionOnEnter: 'on',
    tabCompletion: 'off',
    wordBasedSuggestions: 'off',
    mouseWheelScrollSensitivity: 1,
    fastScrollSensitivity: 5,
  };
}

onMounted(async () => {
  if (!editorContainer.value) return;
  await nextTick();

  setupDbmlServices(parser.compiler, parser.layout);

  editor.value = monaco.editor.create(editorContainer.value, {
    ...editorConfig(),
    model: model.value,
  });

  refreshMarkers();
  emit('editor-mounted', editor.value);
});

// The parser store replaces its compiler when imported files come and go; the services follow.
watch(() => parser.compiler, (compiler) => {
  setupDbmlServices(compiler, parser.layout);
  refreshMarkers();
});

onBeforeUnmount(() => {
  const _editor = editor.value;
  editor.value = null;
  _editor?.dispose();
});

watch(model, (newModel) => {
  editor.value?.setModel(newModel);
});

watch(editorConfig, (newConfig) => {
  editor.value?.updateOptions(newConfig);
});

// Status bar

const cursorPosition = ref({
  line: 1,
  column: 1,
});

const selectionInfo = ref({
  hasSelection: false,
  selectedChars: 0,
});

watch(editor, (_editor, _, onCleanup) => {
  if (!_editor) return;

  const disposables: monaco.IDisposable[] = [];

  disposables.push(_editor.onDidChangeCursorPosition(() => {
    const pos = _editor.getPosition();
    if (pos) {
      cursorPosition.value = {
        line: pos.lineNumber,
        column: pos.column,
      };
      emit('cursor-move', {
        line: pos.lineNumber,
        column: pos.column,
      });
    }
  }));

  disposables.push(_editor.onDidChangeCursorSelection(() => {
    const selection = _editor.getSelection();
    if (!selection) return;
    const hasSelection = !selection.isEmpty();
    let selectedChars = 0;
    if (hasSelection) {
      const m = _editor.getModel();
      if (m) selectedChars = m.getValueInRange(selection).length;
    }
    selectionInfo.value = {
      hasSelection,
      selectedChars,
    };
  }));

  const position = _editor.getPosition();
  if (position) {
    cursorPosition.value = {
      line: position.lineNumber,
      column: position.column,
    };
  }

  onCleanup(() => disposables.forEach((d) => d.dispose()));
});

// DBML diagnostics + suggestions

// Characters after which the suggestion widget should open or stay open.
const SUGGESTION_TRIGGER_CHARS = [
  '.', // subname access
  ',', // next setting
  '[', // setting
  '(',
  ':',
  '>', '<', '-', // ref
  '~', // partial injection
  '\'', '"', // opening string literal
  '/', // path separator
  ' ', // after a keyword
];

let pendingRetrigger = false;

function shouldTriggerSuggestion (_editor: monaco.editor.IStandaloneCodeEditor): boolean {
  const m = _editor.getModel();
  if (!m) return false;
  const position = _editor.getPosition();
  if (!position) return false;
  const offset = m.getOffsetAt(position) - 1;
  if (offset < 0) return false;
  const prevChar = m.getValue()[offset];
  if (!prevChar) return false;
  if (SUGGESTION_TRIGGER_CHARS.includes(prevChar)) return true;
  return /[a-zA-Z_]/.test(prevChar);
}

watch(editor, (_editor, _, onCleanup) => {
  if (!_editor) return;
  const disposable = _editor.onDidChangeModelContent(() => {
    pendingRetrigger = shouldTriggerSuggestion(_editor);
  });
  onCleanup(() => disposable.dispose());
});

// After each completed parse the compiler is synced: refresh markers and, if the
// user was mid-word, re-open the suggestion widget with fresh completions.
watch(() => parser.parseVersion, () => {
  const _editor = editor.value;
  if (!_editor) return;
  refreshMarkers();

  if (!pendingRetrigger) return;
  pendingRetrigger = false;
  const suggestController = _editor.getContribution('editor.contrib.suggestController') as any;
  if (!suggestController) return;
  if (suggestController.widget?.value?.getFocusedItem()) return;
  suggestController.model?.trigger({
    auto: true,
  });
});
</script>

<style scoped>
.monaco-editor-wrapper {
  height: 100%;
  width: 100%;
}

.status-bar {
  height: 22px;
  min-height: 22px;
  font-family: 'Inconsolata', ui-monospace, SFMono-Regular, Menlo, monospace;
  user-select: none;
  flex-shrink: 0;
}

.status-bar span {
  white-space: nowrap;
}
</style>

<!-- Adapted from holistics/dbml dbml-playground (src/components/editor/DbmlEditor.vue), Apache-2.0. See NOTICE. -->
<template>
  <div class="monaco-editor-wrapper w-full h-full flex flex-col">
    <div
      ref="editorContainer"
      class="flex-1 min-h-0"
    />
    <div class="status-bar bg-white border-t border-gray-200 px-3 py-1 text-xs text-gray-600 flex justify-between items-center dark:bg-[#1e1e1e] dark:border-gray-700 dark:text-gray-400">
      <div class="flex items-center space-x-4">
        <span>DBML</span>
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
import { useParserStore } from '@/stores/parserStore';
import { useUiStore } from '@/stores/uiStore';

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

// Monaco model

const DBML_LANGUAGE_ID = DBMLLanguageService.getLanguageId();

const monacoUri = computed(() => monaco.Uri.file(filepath));

const {
  model,
  setContent,
  setLanguage,
} = useMonacoModel(monacoUri);

setLanguage(DBML_LANGUAGE_ID);

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

  updateDiagnosticMarkers(model.value);
  emit('editor-mounted', editor.value);
});

// The parser store replaces its compiler when imported files come and go; the services follow.
watch(() => parser.compiler, (compiler) => {
  setupDbmlServices(compiler, parser.layout);
  updateDiagnosticMarkers(model.value);
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
  const m = _editor.getModel();
  if (m) updateDiagnosticMarkers(m);

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

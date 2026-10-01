<template>
  <div
    ref="container"
    class="w-full h-full"
  />
</template>

<script setup lang="ts">
import {
  computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch,
} from 'vue';
import * as monaco from 'monaco-editor';
import {
  DBMLLanguageService, EDITOR_FONT_FAMILY, EDITOR_FONT_SIZE, EDITOR_LINE_HEIGHT,
} from '@/editor/dbml_language';
import YAML from 'yaml';
import { serializeLayout } from '@/layout';
import { useEditorStore } from '@/stores/editorStore';
import { useLayoutStore } from '@/stores/layoutStore';
import { useUiStore } from '@/stores/uiStore';

/**
 * Read-only view of the layout exactly as Export and Save write it: YAML in a `.dbml`'s footer
 * comment, or JSON in a model file's `layout` property.
 */
const layout = useLayoutStore();
const ui = useUiStore();
const doc = useEditorStore();

const language = computed(() => (doc.language === 'json' ? 'json' : 'yaml'));
const text = computed(() => {
  const yaml = serializeLayout(layout.snapshot());
  return language.value === 'json' ? `${JSON.stringify(YAML.parse(yaml), null, 2)}\n` : yaml;
});

const container = useTemplateRef<HTMLElement>('container');
const editor = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null);
let model: monaco.editor.ITextModel | null = null;

onMounted(() => {
  if (!container.value) return;
  // Its own address, so the model file schema that checks the editor's JSON leaves it alone.
  model = monaco.editor.createModel(text.value, language.value, monaco.Uri.parse('inmemory://layout/view'));
  editor.value = monaco.editor.create(container.value, {
    model,
    theme: DBMLLanguageService.getThemeName(ui.theme),
    readOnly: true,
    domReadOnly: true,
    minimap: {
      enabled: false,
    },
    wordWrap: 'off',
    scrollBeyondLastLine: false,
    fontFamily: EDITOR_FONT_FAMILY,
    fontSize: EDITOR_FONT_SIZE,
    lineHeight: EDITOR_LINE_HEIGHT,
    lineNumbers: 'on',
    lineNumbersMinChars: 2,
    lineDecorationsWidth: 4,
    padding: {
      top: 10,
      bottom: 10,
    },
    renderWhitespace: 'none',
    renderLineHighlight: 'none',
    occurrencesHighlight: 'off',
    automaticLayout: true,
    folding: true,
    foldingStrategy: 'indentation',
    scrollbar: {
      vertical: 'visible',
      horizontal: 'auto',
      useShadows: false,
      verticalScrollbarSize: 10,
      horizontalScrollbarSize: 10,
    },
  });
});

watch(language, (l) => {
  if (model) monaco.editor.setModelLanguage(model, l);
});

// Follow the diagram without losing the scroll position.
watch(text, (next) => {
  if (!model || model.getValue() === next) return;
  model.applyEdits([{
    range: model.getFullModelRange(),
    text: next,
  }]);
});

watch(() => ui.theme, (t) => monaco.editor.setTheme(DBMLLanguageService.getThemeName(t)));

onBeforeUnmount(() => {
  editor.value?.dispose();
  editor.value = null;
  model?.dispose();
  model = null;
});
</script>

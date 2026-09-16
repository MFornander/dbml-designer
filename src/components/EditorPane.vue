<!-- Adapted in part from holistics/dbml dbml-playground (src/components/panes/editor/EditorPane.vue), Apache-2.0. See NOTICE. -->
<template>
  <div class="flex flex-col h-full bg-white border-r border-gray-200 dark:bg-[#1e1e1e] dark:border-gray-800">
    <div class="flex-1 min-h-0 relative">
      <!-- The DBML editor stays mounted while hidden so its undo history and the editor link survive. -->
      <DbmlEditor
        v-show="ui.editorView === 'dbml'"
        v-model="editor.text"
        @editor-mounted="editorInstance.set"
      />
      <LayoutYamlView v-if="ui.editorView === 'layout'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import DbmlEditor from '@/editor/DbmlEditor.vue';
import LayoutYamlView from '@/components/LayoutYamlView.vue';
import { useEditorInstance } from '@/editor/editorInstance';
import { useEditorStore } from '@/stores/editorStore';
import { useUiStore } from '@/stores/uiStore';

const editor = useEditorStore();
const ui = useUiStore();
const editorInstance = useEditorInstance();
</script>

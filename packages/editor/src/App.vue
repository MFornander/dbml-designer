<template>
  <div class="h-screen flex flex-col bg-[#f5f6f7] text-gray-900 dark:bg-[#1a1a1a] dark:text-gray-100">
    <AppHeader />
    <div
      class="h-0.5 shrink-0 transition-opacity duration-200"
      :class="parser.isLoading ? 'opacity-100' : 'opacity-0'"
    >
      <div class="h-full bg-blue-500 animate-pulse w-full" />
    </div>
    <main class="flex-1 min-h-0">
      <SplitPanel
        v-model="ui.splitSizes"
        :min-size="20"
        collapsible
        :collapsed="ui.editorCollapsed"
        @update:collapsed="ui.setEditorCollapsed"
      >
        <template #panel-0>
          <EditorPane />
        </template>
        <template #panel-1>
          <DiagramPane />
        </template>
      </SplitPanel>
    </main>
  </div>
</template>

<script setup lang="ts">
import AppHeader from '@/components/AppHeader.vue';
import SplitPanel from '@/components/SplitPanel.vue';
import DiagramPane from '@/components/DiagramPane.vue';
import EditorPane from '@/components/EditorPane.vue';
import { useParserStore } from '@/stores/parserStore';
import { useUiStore } from '@/stores/uiStore';

const parser = useParserStore();
const ui = useUiStore();
</script>

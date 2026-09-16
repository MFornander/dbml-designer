<template>
  <header class="h-12 shrink-0 flex items-center px-2 gap-2 bg-[#373c44] text-[#8696b6] dark:bg-[#25272b] select-none">
    <div
      ref="menuRoot"
      class="relative"
    >
      <button
        :class="BUTTON"
        aria-label="Menu"
        :aria-expanded="menuOpen"
        title="Menu"
        @click="menuOpen = !menuOpen"
      >
        <PhList class="w-5 h-5" />
      </button>
      <div
        v-if="menuOpen"
        :class="[MENU_PANEL, 'absolute left-0 top-10 z-30 w-64']"
        role="menu"
      >
        <button
          :class="ITEM"
          role="menuitem"
          @click="run(io.exportFiles)"
        >
          <PhDownloadSimple class="w-4 h-4 shrink-0" />
          <span>Export</span>
          <span :class="MENU_HINT">.dbml + .dbml.yaml</span>
        </button>
        <button
          :class="ITEM"
          role="menuitem"
          @click="run(() => fileInput?.click())"
        >
          <PhUploadSimple class="w-4 h-4 shrink-0" />
          <span>Import</span>
          <span :class="MENU_HINT">.dbml or .dbml.yaml</span>
        </button>
        <div :class="MENU_DIVIDER" />
        <button
          :class="ITEM"
          role="menuitem"
          @click="run(ui.toggleTheme)"
        >
          <PhSun
            v-if="ui.isDark"
            class="w-4 h-4 shrink-0"
          />
          <PhMoon
            v-else
            class="w-4 h-4 shrink-0"
          />
          <span>{{ ui.isDark ? 'Light mode' : 'Dark mode' }}</span>
        </button>
        <a
          :class="ITEM"
          role="menuitem"
          href="https://dbml.dbdiagram.io/docs"
          target="_blank"
          rel="noreferrer"
          @click="menuOpen = false"
        >
          <PhBookOpen class="w-4 h-4 shrink-0" />
          <span>DBML docs</span>
          <PhArrowSquareOut class="ml-auto w-3.5 h-3.5 text-gray-400" />
        </a>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <span class="text-white font-semibold text-sm tracking-tight">DBML Designer</span>
      <div
        class="flex items-center rounded bg-white/10 p-0.5"
        role="tablist"
        aria-label="Editor view"
      >
        <button
          v-for="v in VIEWS"
          :key="v.value"
          type="button"
          role="tab"
          :aria-selected="ui.editorView === v.value"
          :class="[TAB, ui.editorView === v.value ? TAB_ACTIVE : TAB_IDLE]"
          :title="v.title"
          @click="ui.setEditorView(v.value)"
        >
          {{ v.label }}
        </button>
      </div>
    </div>
    <span
      v-if="io.message.value"
      class="ml-auto mr-2 text-xs text-gray-300 truncate max-w-[50vw]"
      role="status"
    >{{ io.message.value }}</span>
    <input
      ref="fileInput"
      type="file"
      class="hidden"
      multiple
      accept=".dbml,.yaml,.yml,.txt"
      @change="onPick"
    >
  </header>
</template>

<script setup lang="ts">
import {
  onBeforeUnmount, onMounted, ref, useTemplateRef,
} from 'vue';
import {
  PhArrowSquareOut, PhBookOpen, PhDownloadSimple, PhList, PhMoon, PhSun, PhUploadSimple,
} from '@phosphor-icons/vue';
import { useFileIO } from '@/layout/useFileIO';
import { useUiStore, type EditorView } from '@/stores/uiStore';

import {
  MENU_DIVIDER, MENU_HINT, MENU_ITEM, MENU_PANEL,
} from '@/components/common/menuStyles';

const BUTTON = 'h-8 w-8 flex items-center justify-center rounded text-[#8696b6] hover:text-white hover:bg-white/10 transition-colors cursor-pointer';
const ITEM = MENU_ITEM;
const TAB = 'px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded cursor-pointer transition-colors';
const TAB_ACTIVE = 'bg-white/20 text-white';
const TAB_IDLE = 'text-gray-400 hover:text-white';

const VIEWS: ReadonlyArray<{ value: EditorView; label: string; title: string }> = [
  {
    value: 'dbml',
    label: 'DBML',
    title: 'Edit the DBML text',
  },
  {
    value: 'layout',
    label: 'Layout',
    title: 'View the .dbml.yaml layout sidecar (read-only, follows the diagram)',
  },
];

const ui = useUiStore();
const io = useFileIO();
const fileInput = useTemplateRef<HTMLInputElement>('fileInput');
const menuRoot = useTemplateRef<HTMLElement>('menuRoot');
const menuOpen = ref(false);

/** Run a menu action and close the menu. */
function run (action: () => void) {
  menuOpen.value = false;
  action();
}

async function onPick (e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files?.length) await io.importFiles(input.files);
  // Allow picking the same file again.
  input.value = '';
}

// The menu closes on a press outside it or on Escape.
function onWindowPointerDown (e: PointerEvent) {
  if (menuOpen.value && !menuRoot.value?.contains(e.target as Node)) menuOpen.value = false;
}

function onKeyDown (e: KeyboardEvent) {
  if (e.key === 'Escape') menuOpen.value = false;
}

onMounted(() => {
  window.addEventListener('pointerdown', onWindowPointerDown, true);
  window.addEventListener('keydown', onKeyDown);
});
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onWindowPointerDown, true);
  window.removeEventListener('keydown', onKeyDown);
});
</script>

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
          @click="run(io.exportFile)"
        >
          <PhDownloadSimple class="w-4 h-4 shrink-0" />
          <span>Export</span>
          <span :class="MENU_HINT">.dbml, layout included</span>
        </button>
        <button
          :class="ITEM"
          role="menuitem"
          @click="run(() => fileInput?.click())"
        >
          <PhUploadSimple class="w-4 h-4 shrink-0" />
          <span>Import</span>
          <span :class="MENU_HINT">.dbml</span>
        </button>
        <template v-if="link.available !== false">
          <div :class="MENU_DIVIDER" />
          <button
            :class="ITEM"
            role="menuitem"
            title="Show a .dbml from disk and pick up every change written to it"
            @click="run(() => { followOpen = true; })"
          >
            <PhFolderOpen class="w-4 h-4 shrink-0" />
            <span>Follow file…</span>
            <span :class="MENU_HINT">live from disk</span>
          </button>
          <button
            :class="ITEM"
            role="menuitem"
            :disabled="!link.path"
            title="Write the text and the layout footer to the followed file"
            @click="run(() => { void link.save(); })"
          >
            <PhFloppyDisk class="w-4 h-4 shrink-0" />
            <span>Save to file</span>
            <span :class="MENU_HINT">⌘S</span>
          </button>
          <button
            v-if="link.path"
            :class="ITEM"
            role="menuitem"
            @click="run(() => link.stop())"
          >
            <PhLinkBreak class="w-4 h-4 shrink-0" />
            <span>Stop following</span>
          </button>
        </template>
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
        <button
          :class="ITEM"
          role="menuitem"
          title="Replace the text and layout with the starter blog schema"
          @click="run(io.loadExample)"
        >
          <PhFileText class="w-4 h-4 shrink-0" />
          <span>Load Example</span>
          <span :class="MENU_HINT">blog schema</span>
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
    <span class="text-white font-semibold text-sm tracking-tight">DBML Designer</span>
    <!-- The followed file and its state -->
    <span
      v-if="link.path"
      class="ml-2 flex items-center gap-1.5 rounded bg-white/10 px-2 py-0.5 text-xs text-gray-200"
      :title="link.path"
    >
      <PhFileText class="w-3.5 h-3.5 shrink-0" />
      <span class="max-w-[16rem] truncate">{{ link.name }}</span>
      <span
        class="text-gray-400"
        :class="{ 'text-yellow-300': link.dirty || link.pending, 'text-red-300': link.status === 'error' }"
      >· {{ linkState }}</span>
    </span>
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
      accept=".dbml,.txt"
      @change="onPick"
    >
    <FollowFileDialog
      v-if="followOpen"
      @close="followOpen = false"
    />
  </header>
</template>

<script setup lang="ts">
import {
  computed, onBeforeUnmount, onMounted, ref, useTemplateRef,
} from 'vue';
import {
  PhArrowSquareOut, PhBookOpen, PhDownloadSimple, PhFileText, PhFloppyDisk, PhFolderOpen, PhLinkBreak, PhList, PhMoon,
  PhSun, PhUploadSimple,
} from '@phosphor-icons/vue';
import FollowFileDialog from '@/components/FollowFileDialog.vue';
import { useFileIO } from '@/layout/useFileIO';
import { useFileLinkStore } from '@/stores/fileLinkStore';
import { useUiStore } from '@/stores/uiStore';

import {
  MENU_DIVIDER, MENU_HINT, MENU_ITEM, MENU_PANEL,
} from '@/components/common/menuStyles';

const BUTTON = 'h-8 w-8 flex items-center justify-center rounded text-[#8696b6] hover:text-white hover:bg-white/10 transition-colors cursor-pointer';
const ITEM = MENU_ITEM;

const ui = useUiStore();
const io = useFileIO();
const link = useFileLinkStore();
const fileInput = useTemplateRef<HTMLInputElement>('fileInput');
const menuRoot = useTemplateRef<HTMLElement>('menuRoot');
const menuOpen = ref(false);
const followOpen = ref(false);

const linkState = computed(() => {
  if (link.status === 'error') return link.error ?? 'error';
  if (link.pending) return 'changed on disk';
  if (link.dirty) return 'unsaved changes';
  return link.following ? 'following' : 'not following';
});

/** ⌘S / Ctrl-S saves the followed file, or downloads the export when nothing is followed. */
function onSaveShortcut (e: KeyboardEvent) {
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 's' || e.shiftKey || e.altKey) return;
  e.preventDefault();
  if (link.path) void link.save();
  else io.exportFile();
}

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
  window.addEventListener('keydown', onSaveShortcut);
  void link.resume();
  window.addEventListener('pointerdown', onWindowPointerDown, true);
  window.addEventListener('keydown', onKeyDown);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onSaveShortcut);
  window.removeEventListener('pointerdown', onWindowPointerDown, true);
  window.removeEventListener('keydown', onKeyDown);
});
</script>

<template>
  <div
    ref="root"
    class="relative ml-2 flex items-center"
  >
    <button
      type="button"
      class="flex items-center gap-1.5 rounded bg-white/10 px-2 py-0.5 text-xs text-gray-200 hover:bg-white/20 cursor-pointer"
      :title="link.path ?? 'Choose a file'"
      aria-haspopup="listbox"
      :aria-expanded="open"
      aria-label="Current file"
      @click="toggle"
    >
      <PhFileText class="w-3.5 h-3.5 shrink-0" />
      <span class="max-w-[16rem] truncate">{{ link.name ?? 'No file' }}</span>
      <!-- Only states that need attention are spelled out; plain following says nothing -->
      <span
        v-if="state"
        class="text-gray-400"
        :class="{ 'text-yellow-300': link.dirty || link.pending, 'text-red-300': link.status === 'error' }"
      >· {{ state }}</span>
      <PhCaretDown
        class="w-3 h-3 shrink-0 text-gray-400 transition-transform"
        :class="{ 'rotate-180': open }"
      />
    </button>
    <!-- Read the file and its imports from disk again, for when a change did not arrive on its own -->
    <button
      type="button"
      class="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-300 hover:bg-white/20 hover:text-white cursor-pointer disabled:cursor-default disabled:opacity-50"
      title="Reload from disk"
      aria-label="Reload from disk"
      :disabled="reloading || !link.path"
      @click="reload"
    >
      <PhArrowClockwise
        class="w-3.5 h-3.5"
        :class="{ 'animate-spin': reloading }"
      />
    </button>

    <!-- Every DBML_ROOTS folder as a dimmed title, with the .dbml files directly under it to switch to.
         Files are made outside the app (by you or the agent); the list is refreshed each time it opens. -->
    <div
      v-if="open"
      :class="[MENU_PANEL, 'absolute left-0 top-full z-30 mt-1 w-96']"
      role="listbox"
      aria-label="Files"
    >
      <template
        v-for="group in groups"
        :key="group.root"
      >
        <!-- Right-to-left overflow puts the ellipsis at the front, so the folder's tail stays readable;
             the bdi keeps the path itself in reading order. -->
        <div
          class="overflow-hidden text-ellipsis whitespace-nowrap px-3 pt-2 pb-0.5 text-left text-[11px] text-gray-400 [direction:rtl] dark:text-gray-500"
          :title="group.root"
          aria-hidden="true"
        >
          <bdi dir="ltr">{{ group.root }}</bdi>
        </div>
        <p
          v-if="group.files.length === 0"
          class="px-3 pb-1 text-xs text-gray-500 dark:text-gray-400"
        >
          No .dbml files here yet.
        </p>
        <button
          v-for="f in group.files"
          :key="f"
          type="button"
          role="option"
          :class="[MENU_ITEM, f === link.path ? MENU_ACTIVE : '']"
          :aria-selected="f === link.path"
          :title="f"
          @click="pick(f)"
        >
          <span :class="MENU_SLOT">
            <PhCheck
              v-if="f === link.path"
              class="w-4 h-4"
              weight="bold"
            />
          </span>
          <span class="truncate">{{ baseName(f) }}</span>
        </button>
      </template>
      <p
        v-if="groups.length === 0"
        class="px-3 py-2 text-xs text-gray-500 dark:text-gray-400"
      >
        No folders configured; set DBML_ROOTS in .env.local.
      </p>
      <p
        v-if="failure"
        class="px-3 pb-2 text-xs text-red-600 dark:text-red-400"
      >
        {{ failure }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed, onBeforeUnmount, onMounted, ref, useTemplateRef,
} from 'vue';
import {
  PhArrowClockwise, PhCaretDown, PhCheck, PhFileText,
} from '@phosphor-icons/vue';
import {
  MENU_ACTIVE, MENU_ITEM, MENU_PANEL, MENU_SLOT,
} from '@/components/common/menuStyles';
import { useFileLinkStore } from '@/stores/fileLinkStore';

/**
 * The header's file switcher: the followed file and its state, and a list of every `.dbml`
 * directly under the bridge's roots (DBML_ROOTS) to switch to.
 */
const link = useFileLinkStore();
const root = useTemplateRef<HTMLElement>('root');
const open = ref(false);
const failure = ref<string | null>(null);
const reloading = ref(false);

async function reload () {
  if (reloading.value) return;
  reloading.value = true;
  try {
    await link.reload();
  } finally {
    reloading.value = false;
  }
}

const baseName = (p: string) => p.split('/').pop() ?? p;
const dirName = (p: string) => p.slice(0, Math.max(0, p.lastIndexOf('/')));

const state = computed(() => {
  if (link.status === 'error') return link.error ?? 'error';
  if (link.pending) return 'changed on disk';
  if (link.dirty) return 'unsaved changes';
  return '';
});

/** Every root in the roots' order, even an empty one, with the files that sit under it. */
const groups = computed(() => {
  const byRoot = new Map<string, string[]>();
  for (const r of link.roots) byRoot.set(r, []);
  for (const f of link.files) {
    const r = link.roots.find((x) => f.startsWith(`${x.replace(/\/$/, '')}/`) || f === x) ?? dirName(f);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r)!.push(f);
  }
  return [...byRoot.entries()].map(([r, files]) => ({
    root: r,
    files,
  }));
});

async function toggle () {
  open.value = !open.value;
  failure.value = null;
  if (open.value) await link.refreshFiles();
}

async function pick (f: string) {
  failure.value = null;
  if (await link.switchTo(f)) open.value = false;
  else failure.value = link.pending ? 'Save or reload the current file first' : (link.error ?? 'Could not switch');
}

function onDocumentPointerDown (e: PointerEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false;
}
function onDocumentKeyDown (e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) open.value = false;
}
onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true);
  document.addEventListener('keydown', onDocumentKeyDown);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true);
  document.removeEventListener('keydown', onDocumentKeyDown);
});
</script>

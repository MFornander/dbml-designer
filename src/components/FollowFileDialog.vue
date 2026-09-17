<template>
  <div
    class="fixed inset-0 z-40 flex items-start justify-center bg-black/40 pt-24"
    @mousedown.self="emit('close')"
  >
    <div
      class="w-[34rem] max-w-[92vw] rounded-lg border border-gray-200 bg-white p-4 text-[13px] text-gray-800 shadow-2xl dark:border-gray-700 dark:bg-[#2b2d33] dark:text-gray-100"
      role="dialog"
      aria-modal="true"
      aria-labelledby="follow-file-title"
    >
      <div class="flex items-center gap-2">
        <h2
          id="follow-file-title"
          class="text-[15px] font-semibold"
        >
          Follow a file
        </h2>
        <button
          type="button"
          class="ml-auto flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-200/70 hover:text-gray-800 cursor-pointer dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
          aria-label="Close"
          @click="emit('close')"
        >
          <PhX class="w-4 h-4" />
        </button>
      </div>
      <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
        The editor shows the file and picks up every change written to it; ⌘S writes the text and the layout footer back.
      </p>

      <div
        v-if="link.available === false"
        class="mt-3 rounded-md bg-yellow-50 px-3 py-2 text-xs text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200"
      >
        Following files needs the dev server (<code>npm run dev</code>); the production build cannot reach the disk.
      </div>
      <template v-else>
        <div class="mt-3 max-h-64 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700">
          <button
            v-for="f in link.files"
            :key="f"
            type="button"
            class="flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-gray-100 cursor-pointer dark:hover:bg-white/5"
            @click="pick(f)"
          >
            <PhFileText class="w-4 h-4 shrink-0 text-gray-400" />
            <span class="truncate">{{ baseName(f) }}</span>
            <span class="ml-auto truncate text-xs text-gray-400">{{ dirName(f) }}</span>
          </button>
          <p
            v-if="link.files.length === 0"
            class="px-3 py-3 text-xs text-gray-500"
          >
            No .dbml files under the configured folders.
          </p>
        </div>
        <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Looking under {{ link.roots.join(', ') }}. Add folders with <code>DBML_ROOTS=/one:/two</code> in <code>.env.local</code> and restart the dev server.
        </p>
        <form
          class="mt-3 flex gap-2"
          @submit.prevent="pick(typed.trim())"
        >
          <input
            v-model="typed"
            class="h-8 flex-1 min-w-0 rounded-md border border-gray-300 bg-white px-2 text-[13px] text-gray-800 dark:border-gray-600 dark:bg-[#1f2126] dark:text-gray-100"
            placeholder="/absolute/path/to/schema.dbml (created on first save)"
            aria-label="Path of the file to follow"
          >
          <button
            type="submit"
            class="h-8 rounded-md bg-blue-600 px-3 text-[13px] text-white disabled:opacity-50"
            :disabled="!typed.trim().toLowerCase().endsWith('.dbml')"
          >
            Follow
          </button>
        </form>
        <p
          v-if="failure"
          class="mt-2 text-xs text-red-600 dark:text-red-400"
        >
          {{ failure }}
        </p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { PhFileText, PhX } from '@phosphor-icons/vue';
import { useFileLinkStore } from '@/stores/fileLinkStore';

/** Pick a `.dbml` under the dev server's roots, or type a path, and start following it. */
const emit = defineEmits<{ close: [] }>();

const link = useFileLinkStore();
const typed = ref('');
const failure = ref<string | null>(null);

const baseName = (p: string) => p.split('/').pop() ?? p;
const dirName = (p: string) => p.slice(0, Math.max(0, p.lastIndexOf('/')));

async function pick (p: string) {
  if (!p) return;
  failure.value = null;
  if (await link.follow(p)) emit('close');
  else failure.value = link.error ?? 'Could not follow the file';
}

function onKeyDown (e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}

onMounted(() => {
  void link.refreshFiles();
  window.addEventListener('keydown', onKeyDown);
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown));
</script>

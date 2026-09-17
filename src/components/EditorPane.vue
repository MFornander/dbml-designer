<!-- Adapted in part from holistics/dbml dbml-playground (src/components/panes/editor/EditorPane.vue), Apache-2.0. See NOTICE. -->
<template>
  <div
    ref="pane"
    class="flex flex-col h-full bg-white border-r border-gray-200 dark:bg-[#1e1e1e] dark:border-gray-800"
  >
    <!-- The followed file moved on while the editor had unsaved edits: the user decides which wins. -->
    <div
      v-if="link.pending"
      class="flex shrink-0 flex-wrap items-center gap-2 border-b border-yellow-300 bg-yellow-50 px-3 py-1.5 text-xs text-yellow-900 dark:border-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-100"
      role="status"
    >
      <span class="min-w-0 flex-1">{{ link.name }} changed on disk while you have unsaved edits.</span>
      <button
        type="button"
        class="rounded bg-yellow-200 px-2 py-0.5 font-medium hover:bg-yellow-300 cursor-pointer dark:bg-yellow-700 dark:hover:bg-yellow-600"
        @click="link.reloadFromDisk()"
      >
        Reload from disk
      </button>
      <button
        type="button"
        class="rounded px-2 py-0.5 font-medium hover:bg-yellow-200 cursor-pointer dark:hover:bg-yellow-700"
        @click="link.save(true)"
      >
        Overwrite with mine
      </button>
    </div>
    <div
      v-else-if="link.path && link.status === 'error'"
      class="flex shrink-0 flex-wrap items-center gap-2 border-b border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-900 dark:border-red-800 dark:bg-red-900/40 dark:text-red-100"
      role="status"
    >
      <span class="min-w-0 flex-1">{{ link.name }}: {{ link.error }}</span>
      <button
        type="button"
        class="rounded bg-red-200 px-2 py-0.5 font-medium hover:bg-red-300 cursor-pointer dark:bg-red-800 dark:hover:bg-red-700"
        @click="link.follow(link.path!, { applyLayout: false })"
      >
        Retry
      </button>
      <button
        type="button"
        class="rounded px-2 py-0.5 font-medium hover:bg-red-200 cursor-pointer dark:hover:bg-red-800"
        @click="link.stop()"
      >
        Stop following
      </button>
    </div>

    <div class="flex-1 min-h-0 relative">
      <DbmlEditor
        v-model="editor.text"
        :filepath="parser.entryPath"
        @editor-mounted="editorInstance.set"
      />
    </div>

    <!-- Drag handle between the editor and the open layout panel, like the one between the panes -->
    <div
      v-if="ui.layoutOpen"
      class="h-1 shrink-0 cursor-row-resize select-none bg-gray-200 transition-colors hover:bg-blue-400 dark:bg-gray-800 dark:hover:bg-blue-500"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize layout panel"
      @mousedown.prevent="startResize"
    />

    <!-- The layout as read-only YAML, folded away under the editor until asked for. -->
    <section
      class="flex flex-col shrink-0"
      :class="ui.layoutOpen ? '' : 'border-t border-gray-200 dark:border-gray-700'"
      :style="ui.layoutOpen ? { height: `${liveSize ?? ui.layoutSize}%` } : undefined"
      aria-label="Layout"
    >
      <button
        type="button"
        class="flex h-7 w-full shrink-0 items-center gap-1.5 bg-gray-50 px-2 text-left text-xs text-gray-600 hover:bg-gray-100 cursor-pointer dark:bg-[#252526] dark:text-gray-300 dark:hover:bg-[#2a2b2e]"
        :aria-expanded="ui.layoutOpen"
        aria-controls="layout-yaml-panel"
        :title="ui.layoutOpen ? 'Hide the layout YAML' : 'Show the layout YAML'"
        @click="ui.toggleLayout()"
      >
        <PhCaretRight
          class="w-3 h-3 shrink-0 text-gray-400 transition-transform"
          :class="{ 'rotate-90': ui.layoutOpen }"
          weight="bold"
        />
        <span class="font-semibold uppercase tracking-wider text-[11px]">Layout</span>
        <span
          class="text-gray-400 dark:text-gray-500"
          title="Read-only preview of exported footer layout."
        >
          <PhInfo
            class="w-3.5 h-3.5"
            weight="fill"
          />
        </span>
      </button>
      <div
        v-if="ui.layoutOpen"
        id="layout-yaml-panel"
        class="flex-1 min-h-0"
      >
        <LayoutYamlView />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, useTemplateRef } from 'vue';
import { PhCaretRight, PhInfo } from '@phosphor-icons/vue';
import DbmlEditor from '@/editor/DbmlEditor.vue';
import LayoutYamlView from '@/components/LayoutYamlView.vue';
import { useEditorInstance } from '@/editor/editorInstance';
import { useEditorStore } from '@/stores/editorStore';
import { useFileLinkStore } from '@/stores/fileLinkStore';
import { useParserStore } from '@/stores/parserStore';
import { useUiStore } from '@/stores/uiStore';

/** Neither side of the handle gets smaller than this while dragging. */
const MIN_EDITOR_PX = 120;
const MIN_LAYOUT_PX = 96;

const editor = useEditorStore();
const ui = useUiStore();
const link = useFileLinkStore();
const parser = useParserStore();
const editorInstance = useEditorInstance();

const pane = useTemplateRef<HTMLElement>('pane');
/** The panel's height while a drag is in progress; the store gets the final value on release. */
const liveSize = ref<number | null>(null);

function startResize (e: MouseEvent) {
  const el = pane.value;
  if (!el) return;
  const paneHeight = el.getBoundingClientRect().height;
  if (paneHeight <= 0) return;
  const startY = e.clientY;
  const startPx = (ui.layoutSize / 100) * paneHeight;
  const minPct = (MIN_LAYOUT_PX / paneHeight) * 100;
  const maxPct = ((paneHeight - MIN_EDITOR_PX) / paneHeight) * 100;

  const onMove = (ev: MouseEvent) => {
    // Dragging down shrinks the panel; dragging up grows it.
    const px = startPx - (ev.clientY - startY);
    liveSize.value = Math.min(maxPct, Math.max(minPct, (px / paneHeight) * 100));
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    if (liveSize.value !== null) ui.setLayoutSize(liveSize.value);
    liveSize.value = null;
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}
</script>

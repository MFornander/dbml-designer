<template>
  <div class="relative h-full w-full overflow-hidden">
    <DiagramCanvas
      ref="canvas"
      :model="model"
      :positions="layout.positions"
      :detail-level="ui.detailLevel"
      :dark="ui.isDark"
      :collapsed-groups="layout.collapsedGroups"
      :show-refs="ui.showRefs"
      :show-lineage="ui.showLineage"
      :lineage-layout="ui.lineageLayout"
      :highlight-all="ui.highlightAll"
      :edge-routes="layout.edgeRoutes"
      :hidden="views.hidden"
      :loading="parser.isLoading"
      @position-change="layout.applyPositionChanges"
      @edge-route-change="layout.setEdgeRoute"
      @toggle-group="layout.toggleGroup"
      @table-click="onTableClick"
      @table-hover="onTableHover"
      @set-color="onSetColor"
      @zoom-change="zoom = $event"
    />

    <div
      v-if="model.tables.length === 0 && model.notes.length === 0"
      class="absolute inset-0 flex items-center justify-center pointer-events-none text-sm text-gray-400 dark:text-gray-500"
    >
      Type some DBML on the left to see a diagram.
    </div>

    <div class="absolute top-3 left-3 flex flex-col items-start gap-2 pointer-events-none">
      <div
        v-if="parser.isStale"
        class="px-2.5 py-1 rounded bg-yellow-100 text-yellow-800 text-xs font-medium shadow dark:bg-yellow-900/60 dark:text-yellow-200"
      >
        Showing last valid diagram
      </div>
      <div
        v-if="ui.lineageLayout"
        class="px-2.5 py-1 rounded bg-[#8F8DD8]/20 text-[#5b57b3] text-xs font-medium shadow dark:bg-[#8F8DD8]/25 dark:text-[#cfcbf7]"
      >
        Lineage layout: only tables with lineage edges, ordered by dependency with upstream on the left
        <span v-if="model.deps.length === 0"> (no Dep edges in this schema, so nothing to show)</span>
      </div>
    </div>

    <!-- Shown and hidden from the header's View menu -->
    <DiagramViewsPanel
      v-if="ui.viewsOpen"
      :model="model"
    />

    <!-- Bottom toolbar: zoom cluster on the left with the Errors pill stacked above it, modes on the right; wraps in narrow panes -->
    <div
      class="absolute bottom-3 left-3 flex flex-wrap items-end gap-2 pointer-events-none"
      :class="ui.viewsOpen ? 'right-[23rem]' : 'right-3'"
    >
      <div class="flex flex-col items-start gap-2">
        <ErrorsPopover />
        <div :class="TOOLBAR">
          <button
            :class="BUTTON"
            title="Zoom out"
            aria-label="Zoom out"
            @click="canvas?.zoomOut()"
          >
            <PhMinus class="w-4 h-4" />
          </button>
          <button
            class="h-6 min-w-[3.5rem] px-1 text-sm tabular-nums text-gray-800 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-300 cursor-pointer"
            title="Reset to 100%"
            aria-label="Reset zoom"
            @click="canvas?.resetZoom()"
          >
            {{ Math.round(zoom * 100) }}%
          </button>
          <button
            :class="BUTTON"
            title="Zoom in"
            aria-label="Zoom in"
            @click="canvas?.zoomIn()"
          >
            <PhPlus class="w-4 h-4" />
          </button>
          <span :class="DIVIDER" />
          <button
            :class="BUTTON"
            title="Fit to screen"
            aria-label="Fit to screen"
            @click="canvas?.fitToScreen()"
          >
            <PhCornersOut class="w-4 h-4" />
          </button>
        </div>
      </div>

      <div :class="[TOOLBAR, 'px-1.5 gap-1 ml-auto']">
        <DetailLevelSelect />
        <span :class="DIVIDER" />
        <EdgeModeSelect />
        <span :class="DIVIDER" />
        <button
          :class="[BUTTON, ui.highlightAll ? ACTIVE : '']"
          :title="ui.highlightAll ? 'Unhighlight relationships' : 'Highlight relationships'"
          :aria-label="ui.highlightAll ? 'Unhighlight relationships' : 'Highlight relationships'"
          :aria-pressed="ui.highlightAll"
          @click="ui.toggleHighlightAll"
        >
          <PhLineSegments class="w-4 h-4" />
        </button>
        <!-- Still work in progress; the tooltip says so -->
        <button
          :class="[BUTTON, ui.lineageLayout ? ACTIVE : '']"
          :title="ui.lineageLayout ? 'Lineage layout (WIP): on. Back to your layout' : 'Lineage layout (WIP): order tables by dependency'"
          :aria-label="ui.lineageLayout ? 'Disable lineage layout (WIP)' : 'Enable lineage layout (WIP)'"
          :aria-pressed="ui.lineageLayout"
          @click="ui.toggleLineageLayout"
        >
          <PhTreeStructure class="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed, ref, useTemplateRef, watch,
} from 'vue';
import {
  PhCornersOut, PhLineSegments, PhMinus, PhPlus, PhTreeStructure,
} from '@phosphor-icons/vue';
import { DiagramCanvas, buildDiagramModel } from '@/diagram';
import type { ColorChangePayload, TableLinkPayload } from '@/types/diagram';
import DetailLevelSelect from '@/components/DetailLevelSelect.vue';
import DiagramViewsPanel from '@/components/DiagramViewsPanel.vue';
import EdgeModeSelect from '@/components/EdgeModeSelect.vue';
import ErrorsPopover from '@/components/problems/ErrorsPopover.vue';
import { useEditorInstance } from '@/editor/editorInstance';
import { offsetAt, setColorSetting, setRefColor } from '@/editor/colorEdit';
import { relationshipText } from '@/editor/refText';
import { useTextEdits } from '@/editor/useTextEdits';
import { useLayoutStore } from '@/stores/layoutStore';
import { useParserStore } from '@/stores/parserStore';
import { useUiStore } from '@/stores/uiStore';
import { useViewStore } from '@/stores/viewStore';

const TOOLBAR = 'pointer-events-auto flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white/95 px-1 py-0.5 shadow-md dark:border-gray-700 dark:bg-[#2d2f35]/95 select-none';
const BUTTON = 'h-6 w-8 flex items-center justify-center rounded text-gray-600 hover:bg-gray-100 hover:text-gray-900 cursor-pointer dark:text-gray-300 dark:hover:bg-[#3a3c44] dark:hover:text-white';
const ACTIVE = 'bg-blue-600/15 text-blue-700 hover:bg-blue-600/20 hover:text-blue-800 dark:bg-blue-400/20 dark:text-blue-300 dark:hover:bg-blue-400/30 dark:hover:text-blue-200';
const DIVIDER = 'mx-1 h-5 w-px bg-gray-200 dark:bg-gray-600';

const parser = useParserStore();
const layout = useLayoutStore();
const ui = useUiStore();
const views = useViewStore();
const editorInstance = useEditorInstance();
const textEdits = useTextEdits();

const canvas = useTemplateRef<InstanceType<typeof DiagramCanvas>>('canvas');
const zoom = ref(1);

const model = computed(() => buildDiagramModel(parser.rawDatabase));
// The view store follows every parse so its hidden set matches the current definitions.
watch(model, (m) => views.sync(m), {
  immediate: true,
});

/** The color picker's choice becomes a `headercolor` or `color` setting in the DBML text. */
/** Edits and jumps only make sense for elements declared in the text being edited, not in an imported file. */
function inEditor (token: { file?: string } | undefined): boolean {
  return !!token && (token.file === undefined || token.file === parser.entryPath);
}

function onSetColor (payload: ColorChangePayload) {
  // The diagram shows the last error-free parse; while the text is ahead of it, positions are unreliable.
  if (parser.isStale) return;
  const text = textEdits.text();
  if (payload.kind === 'ref') {
    const ref = model.value.refs.find((r) => r.key === payload.key);
    if (!ref?.token || !inEditor(ref.token)) return;
    const range = {
      start: offsetAt(text, ref.token.start.line, ref.token.start.column),
      end: offsetAt(text, ref.token.end.line, ref.token.end.column),
    };
    const edits = setRefColor(text, range, payload.color, relationshipText(model.value, ref));
    if (edits) textEdits.apply(edits);
    return;
  }
  const token = payload.kind === 'table'
    ? model.value.tablesByKey.get(payload.key)?.token
    : payload.kind === 'group'
      ? model.value.groups.find((g) => g.key === payload.key)?.token
      : model.value.notes.find((n) => n.key === payload.key)?.token;
  if (!token || !inEditor(token)) return;
  const start = offsetAt(text, token.start.line, token.start.column);
  const edit = setColorSetting(text, start, payload.kind === 'table' ? 'headercolor' : 'color', payload.color);
  if (edit) textEdits.apply([edit]);
}

function onTableClick (payload: TableLinkPayload) {
  if (!inEditor(payload.token)) return;
  editorInstance.revealLine(payload.token.start.line, payload.token.start.column);
}

function onTableHover (payload: TableLinkPayload | null) {
  editorInstance.highlightLines(payload
    ? {
        startLine: payload.token.start.line,
        endLine: payload.token.end.line,
      }
    : null);
}
</script>

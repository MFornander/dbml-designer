<template>
  <div class="relative h-full w-full overflow-hidden">
    <EngineDiagram
      ref="canvas"
      :engine="engine"
      @table-click="onTableClick"
      @table-hover="onTableHover"
      @set-color="onSetColor"
      @zoom-change="zoom = $event"
      @arrange="onArrange"
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
      <!-- Arrange from the View menu: what happened, and a way back until the layout changes again -->
      <div
        v-if="arrangedTables > 0"
        class="pointer-events-auto flex items-center gap-2 px-2.5 py-1 rounded bg-white text-gray-700 text-xs font-medium shadow dark:bg-[#2d2f35] dark:text-gray-200"
        role="status"
      >
        <span>Arranged {{ arrangedTables }} {{ arrangedTables === 1 ? 'table' : 'tables' }}</span>
        <button
          type="button"
          class="text-blue-600 hover:underline cursor-pointer dark:text-blue-300"
          title="Put everything back where it was (⌘Z)"
          @click="undoArrange"
        >
          Undo
        </button>
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
        <!-- Pressed while record values show on their fields, the default -->
        <button
          :class="[BUTTON, ui.showValues ? ACTIVE : '']"
          :title="ui.showValues ? 'Hide record values' : 'Show record values on their fields'"
          aria-label="Record values"
          :aria-pressed="ui.showValues"
          @click="ui.toggleShowValues"
        >
          <PhHash class="w-4 h-4" />
        </button>
        <!-- Pressed while partial refs show as badges, the default -->
        <button
          :class="[BUTTON, ui.partialRefMode === 'badges' ? ACTIVE : '']"
          :title="ui.partialRefMode === 'badges' ? 'Draw partial refs as lines' : 'Show partial refs as badges'"
          aria-label="Partial refs as badges"
          :aria-pressed="ui.partialRefMode === 'badges'"
          @click="ui.togglePartialRefMode"
        >
          <PhPuzzlePiece class="w-4 h-4" />
        </button>
        <span :class="DIVIDER" />
        <EdgeModeSelect />
        <!-- Pressed while lineage is drawn mapping by mapping, field to field -->
        <button
          :class="[BUTTON, ui.lineageColumns ? ACTIVE : '', 'disabled:opacity-40 disabled:pointer-events-none']"
          :title="ui.lineageColumns ? 'Draw lineage as one edge per pair of tables' : 'Draw lineage field to field, by kind'"
          aria-label="Lineage by column"
          :aria-pressed="ui.lineageColumns"
          :disabled="!ui.showLineage"
          @click="ui.toggleLineageColumns"
        >
          <PhArrowsMerge class="w-4 h-4" />
        </button>
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
import { computed, ref, useTemplateRef } from 'vue';
import {
  PhArrowsMerge, PhCornersOut, PhHash, PhLineSegments, PhMinus, PhPlus, PhPuzzlePiece, PhTreeStructure,
} from '@phosphor-icons/vue';
import { EngineDiagram, type ColorChangePayload, type TableLinkPayload } from '@dbml-designer/engine';
import { tokenOf } from '@/dbml/token';
import type { TokenRange } from '@/types/diagram';
import DetailLevelSelect from '@/components/DetailLevelSelect.vue';
import DiagramViewsPanel from '@/components/DiagramViewsPanel.vue';
import EdgeModeSelect from '@/components/EdgeModeSelect.vue';
import ErrorsPopover from '@/components/problems/ErrorsPopover.vue';
import { useArrange } from '@/components/useArrange';
import { useEditorInstance } from '@/editor/editorInstance';
import { jsonPathOf, locateInModelFile, setAtPath } from '@/model/modelFile';
import { offsetAt, setColorSetting, setRefColor } from '@/editor/colorEdit';
import { relationshipText } from '@/editor/refText';
import { useTextEdits } from '@/editor/useTextEdits';
import { useEngineStore } from '@/stores/engineStore';
import { useParserStore } from '@/stores/parserStore';
import { useUiStore } from '@/stores/uiStore';

const TOOLBAR = 'pointer-events-auto flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white/95 px-1 py-0.5 shadow-md dark:border-gray-700 dark:bg-[#2d2f35]/95 select-none';
const BUTTON = 'h-6 w-8 flex items-center justify-center rounded text-gray-600 hover:bg-gray-100 hover:text-gray-900 cursor-pointer dark:text-gray-300 dark:hover:bg-[#3a3c44] dark:hover:text-white';
const ACTIVE = 'bg-blue-600/15 text-blue-700 hover:bg-blue-600/20 hover:text-blue-800 dark:bg-blue-400/20 dark:text-blue-300 dark:hover:bg-blue-400/30 dark:hover:text-blue-200';
const DIVIDER = 'mx-1 h-5 w-px bg-gray-200 dark:bg-gray-600';

const parser = useParserStore();
const ui = useUiStore();
const { engine } = useEngineStore();
const editorInstance = useEditorInstance();
const textEdits = useTextEdits();

const canvas = useTemplateRef<InstanceType<typeof EngineDiagram>>('canvas');
const zoom = ref(1);

/** What the engine draws: the last error-free read of the document, DBML or a model file. */
const model = computed(() => engine.diagram.value);

/**
 * Where an element sits in the text being edited: its place in the DBML, or in a model file's JSON.
 * None for one declared in an imported file, where edits and jumps make no sense.
 */
function editorToken (source: unknown): TokenRange | undefined {
  const inModelFile = locateInModelFile(textEdits.text(), source);
  if (inModelFile) return inModelFile;
  const token = tokenOf(source);
  return token && (token.file === undefined || token.file === parser.entryPath) ? token : undefined;
}

/** The source of what the color picker is coloring. */
function sourceOf (payload: ColorChangePayload): unknown {
  switch (payload.kind) {
    case 'ref':
      return model.value.refs.find((r) => r.key === payload.key)?.source;
    case 'table':
      return model.value.tablesByKey.get(payload.key)?.source;
    case 'group':
      return model.value.groups.find((g) => g.key === payload.key)?.source;
    default:
      return model.value.notes.find((n) => n.key === payload.key)?.source;
  }
}

/** The color picker's choice becomes a `headercolor` or `color` setting in the DBML, or the same property in a model file. */
function onSetColor (payload: ColorChangePayload) {
  // The diagram shows the last error-free parse; while the text is ahead of it, positions are unreliable.
  if (parser.isStale) return;
  const text = textEdits.text();
  const path = jsonPathOf(sourceOf(payload));
  if (path) {
    textEdits.apply(setAtPath(text, [...path, payload.kind === 'table' ? 'headerColor' : 'color'], payload.color));
    return;
  }
  if (payload.kind === 'ref') {
    const ref = model.value.refs.find((r) => r.key === payload.key);
    const token = editorToken(ref?.source);
    if (!ref || !token) return;
    const range = {
      start: offsetAt(text, token.start.line, token.start.column),
      end: offsetAt(text, token.end.line, token.end.column),
    };
    const edits = setRefColor(text, range, payload.color, relationshipText(model.value, ref));
    if (edits) textEdits.apply(edits);
    return;
  }
  const token = editorToken(payload.kind === 'table'
    ? model.value.tablesByKey.get(payload.key)?.source
    : payload.kind === 'group'
      ? model.value.groups.find((g) => g.key === payload.key)?.source
      : model.value.notes.find((n) => n.key === payload.key)?.source);
  if (!token) return;
  const start = offsetAt(text, token.start.line, token.start.column);
  const edit = setColorSetting(text, start, payload.kind === 'table' ? 'headercolor' : 'color', payload.color);
  if (edit) textEdits.apply([edit]);
}

function onTableClick (payload: TableLinkPayload) {
  const token = editorToken(payload.source);
  if (token) editorInstance.revealLine(token.start.line, token.start.column);
}

function onTableHover (payload: TableLinkPayload | null) {
  const token = payload ? locateInModelFile(textEdits.text(), payload.source) ?? tokenOf(payload.source) : undefined;
  editorInstance.highlightLines(token
    ? {
        startLine: token.start.line,
        endLine: token.end.line,
      }
    : null);
}

// Arrange, asked for from the header's View menu, runs here where the canvas measures the tables.
const { noticeTables: arrangedTables, noticeArranged: onArrange, undo: undoArrange } = useArrange(canvas);
</script>

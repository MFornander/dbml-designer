<template>
  <div
    v-if="total > 0"
    class="relative pointer-events-auto"
  >
    <button
      type="button"
      class="flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold text-white shadow-md cursor-pointer transition-colors"
      :class="errors.length > 0 ? 'bg-red-600 hover:bg-red-500' : 'bg-amber-500 hover:bg-amber-400'"
      :aria-expanded="ui.problemsOpen"
      aria-controls="dbml-errors-panel"
      :title="ui.problemsOpen ? 'Hide the problem list' : 'Show the problem list'"
      @click="ui.toggleProblems()"
    >
      <PhXCircle
        class="w-4 h-4"
        weight="fill"
      />
      {{ label }}
    </button>

    <!-- Floating list anchored above the button, like dbdiagram's Errors panel -->
    <section
      v-if="ui.problemsOpen"
      id="dbml-errors-panel"
      class="absolute bottom-full left-0 mb-2 flex w-[28rem] max-w-[80vw] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white text-gray-800 shadow-2xl dark:border-gray-700 dark:bg-[#1f2126] dark:text-gray-100"
      :style="{ maxHeight: 'min(40rem, calc(100vh - 9rem))' }"
      aria-label="Problems in the DBML and the layout"
    >
      <header class="flex items-baseline gap-2 border-b border-gray-200 px-4 py-2.5 dark:border-gray-700">
        <h2 class="text-[15px] font-semibold">
          {{ title }}
        </h2>
        <span class="text-xs text-gray-500 dark:text-gray-400">{{ where }}</span>
      </header>
      <div class="min-h-0 flex-1 overflow-y-auto">
        <template
          v-for="group in groups"
          :key="group.category"
        >
          <button
            type="button"
            class="flex w-full items-center gap-1.5 border-b border-gray-100 bg-gray-50 px-3 py-1.5 text-left dark:border-gray-800 dark:bg-white/5"
            :aria-expanded="!collapsed.has(group.category)"
            @click="toggleGroup(group.category)"
          >
            <PhCaretDown
              class="w-3 h-3 text-gray-400 transition-transform"
              :class="{ '-rotate-90': collapsed.has(group.category) }"
            />
            <span class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{{ group.category }}</span>
            <span class="text-[11px] text-gray-400">{{ group.items.length }}</span>
          </button>
          <template v-if="!collapsed.has(group.category)">
            <ProblemEntry
              v-for="item in group.items"
              :key="`${item.file}:${item.diagnostic.location.line}:${item.diagnostic.location.column}:${item.severity}:${item.diagnostic.message}`"
              :diagnostic="item.diagnostic"
              :severity="item.severity"
              :expanded="expanded === item.diagnostic"
              :source="item.file === 'layout' ? layoutText.text : editorStore.text"
              @click="onEntryClick(item)"
              @apply-fix="onApplyFix(item, $event)"
            />
          </template>
        </template>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import {
  computed, onBeforeUnmount, onMounted, ref, shallowRef, watch,
} from 'vue';
import * as monaco from 'monaco-editor';
import { PhCaretDown, PhXCircle } from '@phosphor-icons/vue';
import type { DiagnosticSeverity, ParserDiagnostic, QuickFixAction } from '@/types/diagnostics';
import ProblemEntry from '@/components/problems/ProblemEntry.vue';
import { useEditorInstance, useLayoutEditorInstance } from '@/editor/editorInstance';
import { useEditorStore } from '@/stores/editorStore';
import { useLayoutTextStore } from '@/stores/layoutTextStore';
import { useParserStore } from '@/stores/parserStore';
import { useUiStore } from '@/stores/uiStore';

/**
 * dbdiagram's Errors button: a pill at the bottom left of the diagram that appears while the
 * DBML, or the `.dbml.yaml` layout text, has errors or warnings and toggles a floating list of
 * them. Entries jump to their location in the right editor and expand to explanations and
 * quick fixes.
 */
type ProblemFile = 'dbml' | 'layout';

interface DiagnosticItem {
  diagnostic: ParserDiagnostic;
  severity: DiagnosticSeverity;
  file: ProblemFile;
}

const parser = useParserStore();
const editorStore = useEditorStore();
const layoutText = useLayoutTextStore();
const ui = useUiStore();
const editorInstance = useEditorInstance();
const layoutEditorInstance = useLayoutEditorInstance();

const errors = computed(() => [...parser.errors, ...layoutText.errors]);
const warnings = computed(() => [...parser.warnings, ...layoutText.warnings]);

const byPosition = (a: DiagnosticItem, b: DiagnosticItem) => a.diagnostic.location.line - b.diagnostic.location.line
  || a.diagnostic.location.column - b.diagnostic.location.column;

const items = computed<DiagnosticItem[]>(() => {
  const dbml: DiagnosticItem[] = [];
  for (const d of parser.errors) dbml.push({ diagnostic: d, severity: 'error', file: 'dbml' });
  for (const d of parser.warnings) dbml.push({ diagnostic: d, severity: 'warning', file: 'dbml' });
  for (const d of parser.infos) dbml.push({ diagnostic: d, severity: 'info', file: 'dbml' });
  const layout: DiagnosticItem[] = [];
  for (const d of layoutText.errors) layout.push({ diagnostic: d, severity: 'error', file: 'layout' });
  for (const d of layoutText.warnings) layout.push({ diagnostic: d, severity: 'warning', file: 'layout' });
  return [...dbml.sort(byPosition), ...layout.sort(byPosition)];
});

/** Errors and warnings decide whether the button shows; infos only ride along in the list. */
const total = computed(() => errors.value.length + warnings.value.length);

/** "N in this file" as in the original, or split by file when the layout has problems too. */
const where = computed(() => {
  const inDbml = parser.errors.length + parser.warnings.length;
  const inLayout = layoutText.errors.length + layoutText.warnings.length;
  if (inLayout === 0) return `${total.value} in this file`;
  if (inDbml === 0) return `${total.value} in the layout`;
  return `${inDbml} in the DBML, ${inLayout} in the layout`;
});

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const label = computed(() => [
  errors.value.length ? plural(errors.value.length, 'error') : '',
  warnings.value.length ? plural(warnings.value.length, 'warning') : '',
].filter(Boolean).join(', '));
const title = computed(() => (errors.value.length ? 'Errors' : 'Warnings'));

/** Grouped by the parser's category, which is "other" for plain syntax errors, as in the original. */
const groups = computed(() => {
  const map = new Map<string, DiagnosticItem[]>();
  for (const item of items.value) {
    const cat = item.diagnostic.category ?? 'other';
    const list = map.get(cat) ?? [];
    list.push(item);
    map.set(cat, list);
  }
  return [...map.entries()].map(([category, list]) => ({
    category,
    items: list,
  }));
});

const collapsed = shallowRef<ReadonlySet<string>>(new Set());
function toggleGroup (category: string) {
  const next = new Set(collapsed.value);
  if (next.has(category)) next.delete(category);
  else next.add(category);
  collapsed.value = next;
}

const expanded = ref<ParserDiagnostic | null>(null);
watch(items, () => {
  expanded.value = null;
});

const instanceFor = (file: ProblemFile) => (file === 'layout' ? layoutEditorInstance : editorInstance);

/** Show the editor the problem lives in, then jump; the layout editor mounts on demand and reveals once it has. */
function onEntryClick (item: DiagnosticItem) {
  const d = item.diagnostic;
  ui.setEditorView(item.file);
  if (ui.editorCollapsed) ui.setEditorCollapsed(false);
  instanceFor(item.file).revealRange({
    startLineNumber: d.location.line,
    startColumn: d.location.column,
    endLineNumber: d.endLocation.line,
    endColumn: d.endLocation.column,
  }, {
    select: true,
    focus: true,
  });
  const hasDetails = !!(d.explanation || d.quickFixes?.length);
  expanded.value = hasDetails && expanded.value !== d ? d : null;
}

/** Apply a fix's edits to a string, last edit first so earlier offsets stay valid. */
function withEdits (source: string, fix: QuickFixAction): string {
  let out = source;
  for (const e of [...fix.edits].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.newText + out.slice(e.end);
  }
  return out;
}

function onApplyFix (item: DiagnosticItem, fix: QuickFixAction) {
  const model = instanceFor(item.file).instance.value?.getModel();
  if (model) {
    model.pushEditOperations([], fix.edits.map((e) => ({
      range: monaco.Range.fromPositions(model.getPositionAt(e.start), model.getPositionAt(e.end)),
      text: e.newText,
    })), () => null);
    return;
  }
  // The layout editor is not mounted while the DBML view is showing; edit the text directly.
  if (item.file === 'layout') {
    layoutText.setText(withEdits(layoutText.text, fix));
    layoutText.syncNow();
  }
}

function onKeyDown (e: KeyboardEvent) {
  if (e.key === 'Escape' && ui.problemsOpen) ui.setProblemsOpen(false);
}
onMounted(() => window.addEventListener('keydown', onKeyDown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown));
</script>

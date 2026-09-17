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
      aria-label="Problems in the DBML"
    >
      <header class="flex items-baseline gap-2 border-b border-gray-200 px-4 py-2.5 dark:border-gray-700">
        <h2 class="text-[15px] font-semibold">
          {{ title }}
        </h2>
        <span class="text-xs text-gray-500 dark:text-gray-400">{{ total }} in this file</span>
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
              :key="`${item.diagnostic.location.line}:${item.diagnostic.location.column}:${item.severity}:${item.diagnostic.message}`"
              :diagnostic="item.diagnostic"
              :severity="item.severity"
              :expanded="expanded === item.diagnostic"
              :source="editorStore.text"
              @click="onEntryClick(item)"
              @apply-fix="onApplyFix($event)"
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
import { useEditorInstance } from '@/editor/editorInstance';
import { useEditorStore } from '@/stores/editorStore';
import { useParserStore } from '@/stores/parserStore';
import { useUiStore } from '@/stores/uiStore';

/**
 * dbdiagram's Errors button: a pill above the zoom buttons that appears while the DBML has
 * errors or warnings and toggles a floating list of them. Entries jump to their location in the
 * editor and expand to explanations and quick fixes.
 */
interface DiagnosticItem {
  diagnostic: ParserDiagnostic;
  severity: DiagnosticSeverity;
}

const parser = useParserStore();
const editorStore = useEditorStore();
const ui = useUiStore();
const editorInstance = useEditorInstance();

const errors = computed(() => parser.errors);
const warnings = computed(() => parser.warnings);

const items = computed<DiagnosticItem[]>(() => {
  const out: DiagnosticItem[] = [];
  for (const d of parser.errors) out.push({ diagnostic: d, severity: 'error' });
  for (const d of parser.warnings) out.push({ diagnostic: d, severity: 'warning' });
  for (const d of parser.infos) out.push({ diagnostic: d, severity: 'info' });
  return out.sort((a, b) => a.diagnostic.location.line - b.diagnostic.location.line
    || a.diagnostic.location.column - b.diagnostic.location.column);
});

/** Errors and warnings decide whether the button shows; infos only ride along in the list. */
const total = computed(() => errors.value.length + warnings.value.length);

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

/** Bring the editor into view, then jump to the problem. */
function onEntryClick (item: DiagnosticItem) {
  const d = item.diagnostic;
  if (ui.editorCollapsed) ui.setEditorCollapsed(false);
  editorInstance.revealRange({
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

function onApplyFix (fix: QuickFixAction) {
  const model = editorInstance.instance.value?.getModel();
  if (!model) return;
  model.pushEditOperations([], fix.edits.map((e) => ({
    range: monaco.Range.fromPositions(model.getPositionAt(e.start), model.getPositionAt(e.end)),
    text: e.newText,
  })), () => null);
}

function onKeyDown (e: KeyboardEvent) {
  if (e.key === 'Escape' && ui.problemsOpen) ui.setProblemsOpen(false);
}
onMounted(() => window.addEventListener('keydown', onKeyDown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown));
</script>

/**
 * The `.dbml.yaml` text as the user sees and edits it in the Layout view.
 *
 * The text is a document in its own right: the diagram writes its changes into it as targeted
 * edits, and valid text is applied back to the diagram. Entries the schema does not know stay in
 * the text with a warning instead of being silently dropped, which is what makes an imported
 * file's mistakes visible and fixable. While the text has errors the diagram keeps working; the
 * changes it makes are held and merged into the text once it parses again.
 */
import { computed, shallowRef, watch } from 'vue';
import { defineStore } from 'pinia';
import { debounce } from 'lodash-es';
import type { ParserDiagnostic } from '@/types/diagnostics';
import { usePersistedRef } from '@/utils/persistedRef';
import {
  applyLayoutDeltas, baseFileName, dbmlFileName, diffSnapshots, serializeLayout, validateLayout,
} from '@/layout/sidecar';
import type { LayoutDelta, LayoutSnapshot, LayoutValidation } from '@/layout/sidecar';
import { layoutKeysOf } from '@/layout/schemaKeys';
import { useLayoutStore } from './layoutStore';
import { useParserStore } from './parserStore';

/** Typing pause before the text is checked and applied, like the DBML editor's parse. */
const APPLY_DEBOUNCE_MS = 300;

export const useLayoutTextStore = defineStore('layoutText', () => {
  const layout = useLayoutStore();
  const parser = useParserStore();

  const dbmlName = computed(() => {
    const project = parser.rawDatabase?.project as { name?: string | null } | undefined;
    return dbmlFileName(baseFileName(project?.name));
  });

  // Stored as a raw string, like the DBML text. First run: the diagram as it is.
  const text = usePersistedRef<string>('layoutText', () => serializeLayout(layout.snapshot(), dbmlName.value), {
    debounceMs: 500,
    serialize: (s) => s,
    deserialize: (s) => s,
    validate: (v): v is string => typeof v === 'string',
    flushOnUnload: true,
  });

  const keys = computed(() => (parser.rawDatabase ? layoutKeysOf(parser.rawDatabase) : undefined));

  const validation = shallowRef<LayoutValidation>(validateLayout(text.value, keys.value));
  const errors = computed<readonly ParserDiagnostic[]>(() => validation.value.errors);
  const warnings = computed<readonly ParserDiagnostic[]>(() => validation.value.warnings);

  /** Diagram changes that could not be written because the text had errors at the time. */
  const pending = shallowRef<readonly LayoutDelta[]>([]);
  const outOfSync = computed(() => pending.value.length > 0);

  /** The layout state as last reconciled with the text; diagram changes are diffed against it. */
  let reconciled: LayoutSnapshot = layout.snapshot();

  function revalidate (): LayoutValidation {
    validation.value = validateLayout(text.value, keys.value);
    return validation.value;
  }

  /** Make the diagram match the text (only called with an error-free validation). */
  function applyToDiagram (v: LayoutValidation): void {
    layout.replaceLayout(v.snapshot);
    reconciled = layout.snapshot();
  }

  /** Write held diagram changes into the text if it can take them now. */
  function flushPending (): void {
    if (pending.value.length === 0) return;
    const next = applyLayoutDeltas(text.value, pending.value);
    if (next === null) return;
    pending.value = [];
    if (next !== text.value) text.value = next;
  }

  /** True between a keystroke and the check it schedules. */
  let typing = false;

  /** Check the text now and, when it is error-free, apply it to the diagram. */
  function syncNow (): void {
    applyDebounced.cancel();
    typing = false;
    flushPending();
    const v = revalidate();
    if (v.ok) applyToDiagram(v);
  }

  const applyDebounced = debounce(syncNow, APPLY_DEBOUNCE_MS);

  /** New text from the editor or an import; checked after a short pause. */
  function setText (value: string): void {
    if (value === text.value) return;
    text.value = value;
    typing = true;
    applyDebounced();
  }

  /** Replace the text with the diagram's layout as the canonical writer puts it. */
  function regenerate (): void {
    applyDebounced.cancel();
    typing = false;
    pending.value = [];
    reconciled = layout.snapshot();
    text.value = serializeLayout(reconciled, dbmlName.value);
    revalidate();
  }

  // Diagram changes become text edits. Changes the store made itself diff to nothing.
  watch(() => [layout.positions, layout.collapsedGroups, layout.edgeRoutes], () => {
    const current = layout.snapshot();
    const deltas = diffSnapshots(reconciled, current);
    reconciled = current;
    if (deltas.length === 0) return;
    const all = [...pending.value, ...deltas];
    const next = applyLayoutDeltas(text.value, all);
    if (next === null) {
      pending.value = all;
      return;
    }
    pending.value = [];
    if (next !== text.value) text.value = next;
    revalidate();
  });

  // A schema change can make entries known or unknown; re-check and apply the text against it.
  watch(() => parser.rawDatabase, () => {
    if (!typing) syncNow();
  });

  // First run: text that parses wins over the stored layout, so a reload changes nothing the user can see.
  if (validation.value.ok) applyToDiagram(validation.value);

  return {
    text,
    errors,
    warnings,
    outOfSync,
    dbmlName,
    setText,
    syncNow,
    regenerate,
  };
});

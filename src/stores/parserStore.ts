// Adapted from holistics/dbml dbml-playground (src/stores/parserStore.ts), Apache-2.0. See NOTICE.
// Single-file variant: one compiler, one entry, last-good database semantics.
import {
  ref, shallowRef, computed, watch, markRaw,
} from 'vue';
import { defineStore } from 'pinia';
import { debounce } from 'lodash-es';
import {
  Compiler, DBMLDiagnosticsProvider, DEFAULT_ENTRY, MemoryProjectLayout,
} from '@dbml/parse';
import type { Database, Diagnostic } from '@dbml/parse';
import type { ParserDiagnostic } from '@/types/diagnostics';
import logger from '@/utils/logger';
import { useEditorStore } from './editorStore';

const DEBOUNCE_MS = 300;

function toParserDiagnostic (diagnostic: Diagnostic): ParserDiagnostic {
  return {
    code: diagnostic.code ?? -1,
    message: String(diagnostic.text ?? ''),
    location: {
      line: Number(diagnostic.startRow),
      column: Number(diagnostic.startColumn),
    },
    endLocation: {
      line: Number(diagnostic.endRow),
      column: Number(diagnostic.endColumn),
    },
    ...(diagnostic.category ? { category: diagnostic.category } : {}),
    ...(diagnostic.explanation ? { explanation: diagnostic.explanation } : {}),
    ...(diagnostic.quickFixes?.length ? { quickFixes: diagnostic.quickFixes } : {}),
  };
}

export const useParserStore = defineStore('parser', () => {
  // markRaw keeps Vue/Pinia from proxying the compiler objects (and keeps their types intact).
  const layout = markRaw(new MemoryProjectLayout());
  const compiler = markRaw(new Compiler(layout));
  const diagnosticsProvider = markRaw(new DBMLDiagnosticsProvider(compiler));
  const filepath = markRaw(DEFAULT_ENTRY);
  const editor = useEditorStore();

  const isLoading = ref(false);
  /** Incremented after every parse attempt. */
  const parseVersion = ref(0);
  /** Incremented only when a parse produced no errors. */
  const lastGoodVersion = ref(0);

  /** Raw @dbml/parse database from the last error-free parse. */
  const rawDatabase = shallowRef<Database>();
  const errors = shallowRef<readonly ParserDiagnostic[]>([]);
  const warnings = shallowRef<readonly ParserDiagnostic[]>([]);
  const infos = shallowRef<readonly ParserDiagnostic[]>([]);

  const hasErrors = computed(() => errors.value.length > 0);
  /** True when the diagram shows an older, valid model because the current text has errors. */
  const isStale = computed(() => hasErrors.value && rawDatabase.value !== undefined);

  function collect (provide: (fp: typeof DEFAULT_ENTRY) => unknown): ParserDiagnostic[] {
    const list = provide(DEFAULT_ENTRY) as Diagnostic[];
    return list
      .filter((d) => d.filepath.equals(DEFAULT_ENTRY))
      .map(toParserDiagnostic);
  }

  function parseNow (text: string = editor.text): void {
    isLoading.value = true;
    try {
      layout.setSource(DEFAULT_ENTRY, text);
      const report = compiler.interpretFile(DEFAULT_ENTRY);
      errors.value = collect((fp) => diagnosticsProvider.provideErrors(fp));
      const db = report.getValue() as Database | undefined;
      if (errors.value.length === 0 && db) {
        rawDatabase.value = db;
        lastGoodVersion.value += 1;
      }
    } catch (err) {
      logger.error('Unexpected parsing error', err);
      const message = err instanceof Error ? err.message : 'Unexpected error';
      errors.value = [{
        code: -1,
        message,
        location: {
          line: 1,
          column: 1,
        },
        endLocation: {
          line: 1,
          column: 2,
        },
      }];
    } finally {
      try {
        warnings.value = collect((fp) => diagnosticsProvider.provideWarnings(fp));
        infos.value = collect((fp) => diagnosticsProvider.provideInfos(fp));
      } catch (_err) {
        logger.warn('Failed to collect warnings/infos');
        warnings.value = [];
        infos.value = [];
      }
      parseVersion.value += 1;
      isLoading.value = false;
    }
  }

  const scheduleParse = debounce(() => parseNow(), DEBOUNCE_MS);

  watch(() => editor.text, () => {
    isLoading.value = true;
    scheduleParse();
  });

  // Synchronous first parse so the diagram exists on first paint.
  parseNow();

  return {
    compiler,
    layout,
    filepath,
    isLoading,
    parseVersion,
    lastGoodVersion,
    rawDatabase,
    errors,
    warnings,
    infos,
    hasErrors,
    isStale,
    parseNow,
  };
});

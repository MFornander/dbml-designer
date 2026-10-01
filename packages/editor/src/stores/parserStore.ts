// Adapted from holistics/dbml dbml-playground (src/stores/parserStore.ts), Apache-2.0. See NOTICE.
// Single-entry variant: one entry file, last-good database semantics, and `use` imports loaded
// on demand from wherever the entry file lives.
import {
  ref, shallowRef, computed, watch, markRaw,
} from 'vue';
import { defineStore } from 'pinia';
import { debounce } from 'lodash-es';
import {
  Compiler, DBMLDiagnosticsProvider, DEFAULT_ENTRY, Filepath, MemoryProjectLayout,
} from '@dbml/parse';
import type { Database, Diagnostic } from '@dbml/parse';
import type { Model } from '@dbml-designer/engine/core';
import { readModelDocument } from '@/model/modelFile';
import type { ParserDiagnostic } from '@/types/diagnostics';
import logger from '@/utils/logger';
import { useEditorStore } from './editorStore';

const DEBOUNCE_MS = 300;

/** Reads a file a `use` statement points at, by absolute path; null when there is no such file. */
export type SourceLoader = (absolutePath: string) => Promise<string | null>;

const IMPORT_HINT = 'Imports resolve relative to the file\'s own folder. Follow the file from the menu so the app can read the files next to it.';

function toParserDiagnostic (diagnostic: Diagnostic, entry: Filepath): ParserDiagnostic {
  const foreign = !diagnostic.filepath.equals(entry);
  const text = String(diagnostic.text ?? '');
  return {
    code: diagnostic.code ?? -1,
    message: foreign ? `${diagnostic.filepath.basename}: ${text}` : text,
    location: {
      line: Number(diagnostic.startRow),
      column: Number(diagnostic.startColumn),
    },
    endLocation: {
      line: Number(diagnostic.endRow),
      column: Number(diagnostic.endColumn),
    },
    ...(foreign ? { file: diagnostic.filepath.absolute } : {}),
    ...(diagnostic.category ? { category: diagnostic.category } : {}),
    ...(diagnostic.explanation ? { explanation: diagnostic.explanation } : {}),
    // Quick fixes edit the text at hand; they cannot reach into another file.
    ...(!foreign && diagnostic.quickFixes?.length ? { quickFixes: diagnostic.quickFixes } : {}),
  };
}

export const useParserStore = defineStore('parser', () => {
  // markRaw keeps Vue/Pinia from proxying the compiler objects (and keeps their types intact).
  const layout = markRaw(new MemoryProjectLayout());
  // The compiler caches which files exist; it is replaced when imported files appear or vanish.
  const compiler = shallowRef(markRaw(new Compiler(layout)));
  let diagnosticsProvider = markRaw(new DBMLDiagnosticsProvider(compiler.value));
  /** The file being edited: a virtual one, or the followed file's real path so imports resolve next to it. */
  const entry = shallowRef<Filepath>(markRaw(DEFAULT_ENTRY));
  const entryPath = computed(() => entry.value.absolute);
  const editor = useEditorStore();

  const isLoading = ref(false);
  /** Incremented after every parse attempt. */
  const parseVersion = ref(0);
  /** Incremented only when a parse produced no errors. */
  const lastGoodVersion = ref(0);

  /** Raw @dbml/parse database from the last error-free parse. */
  const rawDatabase = shallowRef<Database>();
  /** The model from the last error-free read of a model file, for while the editor holds JSON. */
  const jsonModel = shallowRef<Model>();
  const errors = shallowRef<readonly ParserDiagnostic[]>([]);
  const warnings = shallowRef<readonly ParserDiagnostic[]>([]);
  const infos = shallowRef<readonly ParserDiagnostic[]>([]);

  const hasErrors = computed(() => errors.value.length > 0);
  /** True when the diagram shows an older, valid model because the current text has errors. */
  const isStale = computed(() => hasErrors.value
    && (editor.language === 'json' ? jsonModel.value !== undefined : rawDatabase.value !== undefined));

  /** Sources of the files the entry imports, by absolute path. */
  const imports = shallowRef<ReadonlyMap<string, string>>(new Map());
  /** Loaded imports in the order the entry reaches them, nearest first. */
  const importPaths = computed(() => {
    void parseVersion.value;
    const reachable = dependencies().map((f) => f.absolute).filter((abs) => imports.value.has(abs));
    const rest = [...imports.value.keys()].filter((abs) => !reachable.includes(abs));
    return [...reachable, ...rest];
  });
  /** The imported files' texts in that order, for layouts inherited from their footers. */
  const importSources = computed(() => importPaths.value.map((file) => ({
    file,
    text: imports.value.get(file)!,
  })));
  let loader: SourceLoader | null = null;
  const pendingLoads = new Set<string>();
  /** Imports the loader could not find; asked for again only when `retryImports` says so. */
  const missing = new Set<string>();

  function rebuildCompiler (): void {
    compiler.value = markRaw(new Compiler(layout));
    diagnosticsProvider = markRaw(new DBMLDiagnosticsProvider(compiler.value));
  }

  function collect (provide: (fp: Filepath) => unknown): ParserDiagnostic[] {
    const list = provide(entry.value) as Diagnostic[];
    const seen = new Set<string>();
    const out: ParserDiagnostic[] = [];
    for (const raw of list) {
      const d = toParserDiagnostic(raw, entry.value);
      const key = `${d.file ?? ''}|${d.location.line}|${d.location.column}|${d.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const needsHint = !d.file && loader === null && /non-existent file/.test(d.message);
      out.push(needsHint ? { ...d, explanation: IMPORT_HINT } : d);
    }
    return out;
  }

  /** The files the entry reaches through `use`, besides itself, whether or not they are loaded yet. */
  function dependencies (): Filepath[] {
    try {
      return compiler.value.reachableFiles(entry.value).filter((f) => !f.equals(entry.value));
    } catch {
      return [];
    }
  }

  /** Ask the loader for imports the layout does not have yet; each answer triggers a re-parse. */
  function requestImports (): void {
    const load = loader;
    // The virtual entry has no folder for imports to live in.
    if (!load || entry.value.equals(DEFAULT_ENTRY)) return;
    const forEntry = entry.value;
    for (const fp of dependencies()) {
      const abs = fp.absolute;
      if (imports.value.has(abs) || pendingLoads.has(abs) || missing.has(abs)) continue;
      pendingLoads.add(abs);
      load(abs).then((text) => {
        pendingLoads.delete(abs);
        // The answer belongs to an earlier entry or loader: nobody wants it any more.
        if (load !== loader || forEntry !== entry.value) return;
        if (text === null) {
          missing.add(abs);
        } else {
          layout.setSource(Filepath.from(abs), text);
          imports.value = new Map(imports.value).set(abs, text);
          rebuildCompiler();
        }
        parseNow();
      }).catch((err: unknown) => {
        pendingLoads.delete(abs);
        missing.add(abs);
        logger.warn('Failed to load an imported file', abs, err);
        parseNow();
      });
    }
  }

  /** Read a model file: JSON with no imports, checked against the model's shape. */
  function readModelFile (text: string): void {
    const doc = readModelDocument(text);
    errors.value = doc.errors;
    warnings.value = doc.warnings;
    infos.value = [];
    if (doc.model) {
      jsonModel.value = doc.model;
      lastGoodVersion.value += 1;
    }
    parseVersion.value += 1;
    isLoading.value = false;
  }

  function parseNow (text: string = editor.text): void {
    if (editor.language === 'json') {
      readModelFile(text);
      return;
    }
    isLoading.value = true;
    layout.setSource(entry.value, text);
    requestImports();
    // Nothing is published until the imports have arrived; each answer runs this again.
    if (pendingLoads.size > 0) return;
    try {
      const report = compiler.value.interpretFile(entry.value);
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

  function clearImports (): void {
    for (const abs of imports.value.keys()) layout.deleteSource(Filepath.from(abs));
    imports.value = new Map();
    pendingLoads.clear();
    missing.clear();
  }

  /**
   * Where the edited text lives. Null returns to the virtual entry; imports are dropped either way.
   * When the text changes along with the path (another file is opened), pass it so its imports,
   * not the old text's, are requested from the new folder; later parses read the editor as usual.
   */
  function setEntryPath (absolutePath: string | null, text: string = editor.text): void {
    const next = absolutePath ? Filepath.from(absolutePath) : DEFAULT_ENTRY;
    if (next.equals(entry.value)) return;
    layout.deleteSource(entry.value);
    clearImports();
    entry.value = markRaw(next);
    rebuildCompiler();
    parseNow(text);
  }

  /** How imported files are read; null when nothing can read them (no followed file). */
  function setSourceLoader (load: SourceLoader | null): void {
    loader = load;
    missing.clear();
  }

  /** An imported file changed on disk (or vanished, with null). */
  function updateImport (absolutePath: string, text: string | null): void {
    const fp = Filepath.from(absolutePath);
    const next = new Map(imports.value);
    if (text === null) {
      if (!next.has(absolutePath)) return;
      layout.deleteSource(fp);
      next.delete(absolutePath);
      rebuildCompiler();
    } else {
      if (next.get(absolutePath) === text) return;
      layout.setSource(fp, text);
      if (!next.has(absolutePath)) rebuildCompiler();
      next.set(absolutePath, text);
    }
    imports.value = next;
    missing.clear();
    parseNow();
  }

  /** Look again for imports that were missing, for example after files were created next to the entry. */
  function retryImports (): void {
    if (missing.size === 0) return;
    missing.clear();
    parseNow();
  }

  const scheduleParse = debounce(() => parseNow(), DEBOUNCE_MS);

  watch(() => editor.text, () => {
    isLoading.value = true;
    scheduleParse();
  });
  // A switch between DBML and a model file reads the text the other way at once.
  watch(() => editor.language, () => parseNow());

  // Synchronous first parse so the diagram exists on first paint.
  parseNow();

  return {
    compiler,
    layout,
    entryPath,
    importPaths,
    importSources,
    isLoading,
    parseVersion,
    lastGoodVersion,
    rawDatabase,
    jsonModel,
    errors,
    warnings,
    infos,
    hasErrors,
    isStale,
    parseNow,
    setEntryPath,
    setSourceLoader,
    updateImport,
    retryImports,
  };
});

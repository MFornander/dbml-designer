/**
 * What the command line offers an agent or a script: the same diagnostics the app shows for a
 * `.dbml` or a model `.json`, a check of the layout the file carries, and the schema as the diagram
 * engine's model. Pure functions over text; `cli/dbml-designer.ts` wraps them for the terminal.
 */
import {
  Compiler, DBMLDiagnosticsProvider, DEFAULT_ENTRY, MemoryProjectLayout,
} from '@dbml/parse';
import type { Database, Diagnostic, Filepath } from '@dbml/parse';

type DbmlProjectLayout = ConstructorParameters<typeof Compiler>[0];
import { buildDiagramModel } from '@/dbml/buildModel';
import { toModel } from '@/dbml/toModel';
import { tokenOf } from '@/dbml/token';
import {
  fromModel, layoutKeysOfModel, type EdgeEndpointVM, type FieldVM, type Model, type RefEndpointVM,
} from '@dbml-designer/engine/core';
import { splitLayoutComment, validateLayout } from '@/layout';
import { readModelDocument, splitModelFile } from '@/model/modelFile';
import { layoutKeysOf } from '@/layout/schemaKeys';
import type { ParserDiagnostic } from '@/types/diagnostics';

export type Severity = 'error' | 'warning';

export interface CliDiagnostic {
  /** 1-based position in the file. */
  line: number;
  column: number;
  severity: Severity;
  message: string;
  /** The DBML itself, the layout YAML in its footer comment, a model file's JSON, or its `layout` property. */
  source: 'dbml' | 'layout' | 'model' | 'model-layout';
  /** Absolute path of the file the problem is in when it is an imported file, not the entry. */
  file?: string;
}

/** Where the text lives and how its imports are found; the defaults are a lone in-memory file. */
export interface CompileOptions {
  entry?: Filepath;
  layout?: DbmlProjectLayout;
}

export interface CheckResult {
  diagnostics: CliDiagnostic[];
  errors: number;
  warnings: number;
  /** The interpreted database when the DBML has no errors. */
  db: Database | null;
}

interface Compiled {
  db: Database | null;
  errors: Diagnostic[];
  warnings: Diagnostic[];
  /** Set when the compiler itself failed rather than reporting. */
  crash: string | null;
}

/** Distinct diagnostics: imported files' problems are reported once per file they reach. */
function dedupe (list: unknown): Diagnostic[] {
  const seen = new Set<string>();
  return (list as Diagnostic[]).filter((d) => {
    const key = `${d.filepath.absolute}|${d.startRow}|${d.startColumn}|${d.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Run the DBML compiler the way the app does, with last-good semantics. By default the text is a
 * lone in-memory file; given an entry and a layout, `use` imports resolve through the layout.
 */
export function compileDbml (text: string, opts: CompileOptions = {}): Compiled {
  const entry = opts.entry ?? DEFAULT_ENTRY;
  const layout = opts.layout ?? new MemoryProjectLayout();
  if (layout instanceof MemoryProjectLayout) layout.setSource(entry, text);
  const compiler = new Compiler(layout);
  const provider = new DBMLDiagnosticsProvider(compiler);
  try {
    const report = compiler.interpretFile(entry);
    const errors = dedupe(provider.provideErrors(entry));
    const warnings = dedupe(provider.provideWarnings(entry));
    const db = errors.length === 0 ? (report.getValue() as Database | undefined) ?? null : null;
    return {
      db,
      errors,
      warnings,
      crash: null,
    };
  } catch (e) {
    return {
      db: null,
      errors: [],
      warnings: [],
      crash: e instanceof Error ? e.message : String(e),
    };
  }
}

function fromCompiler (d: Diagnostic, severity: Severity, entry: Filepath): CliDiagnostic {
  return {
    line: Number(d.startRow),
    column: Number(d.startColumn),
    severity,
    message: String(d.text ?? ''),
    source: 'dbml',
    ...(d.filepath.equals(entry) ? {} : { file: d.filepath.absolute }),
  };
}

function fromLayout (d: ParserDiagnostic, severity: Severity, lineOffset: number, source: 'layout' | 'model-layout' = 'layout'): CliDiagnostic {
  return {
    line: d.location.line + lineOffset,
    column: d.location.column,
    severity,
    message: d.message,
    source,
  };
}

const byPosition = (a: CliDiagnostic, b: CliDiagnostic) => a.line - b.line || a.column - b.column;

/**
 * Everything wrong with a `.dbml` text: the compiler's errors and warnings, the diagram
 * adapter's warnings (duplicate refs, view entries that resolve to nothing), and problems in the
 * layout footer, reported at their position in the file.
 */
export function checkText (text: string, opts: CompileOptions = {}): CheckResult {
  const entry = opts.entry ?? DEFAULT_ENTRY;
  const compiled = compileDbml(text, opts);
  const diagnostics: CliDiagnostic[] = [];
  if (compiled.crash) {
    diagnostics.push({
      line: 1,
      column: 1,
      severity: 'error',
      message: `The DBML compiler failed: ${compiled.crash}`,
      source: 'dbml',
    });
  }
  for (const d of compiled.errors) diagnostics.push(fromCompiler(d, 'error', entry));
  for (const d of compiled.warnings) diagnostics.push(fromCompiler(d, 'warning', entry));

  const model = compiled.db ? buildDiagramModel(compiled.db) : null;
  if (model) {
    for (const d of model.diagnostics) {
      const token = tokenOf(d.source);
      diagnostics.push({
        line: token?.start.line ?? 1,
        column: token?.start.column ?? 1,
        severity: 'warning',
        message: d.message,
        source: 'dbml',
      });
    }
  }

  const { layout: yaml } = splitLayoutComment(text);
  if (yaml !== null) {
    const lineOffset = text.slice(0, text.lastIndexOf(yaml)).split('\n').length - 1;
    const v = validateLayout(yaml, compiled.db ? layoutKeysOf(compiled.db) : undefined);
    for (const d of v.errors) diagnostics.push(fromLayout(d, 'error', lineOffset));
    for (const d of v.warnings) diagnostics.push(fromLayout(d, 'warning', lineOffset));
  }

  diagnostics.sort(byPosition);
  return {
    diagnostics,
    errors: diagnostics.filter((d) => d.severity === 'error').length,
    warnings: diagnostics.filter((d) => d.severity === 'warning').length,
    db: compiled.db,
  };
}

/**
 * Everything wrong with a model file: JSON syntax, the file's and the model's shape, names the
 * model uses but does not have, and problems in its `layout`, at their position in the file.
 */
export function checkModelFileText (text: string): CheckResult & { model: Model | null } {
  const doc = readModelDocument(text);
  const diagnostics: CliDiagnostic[] = [];
  const fromModelFile = (d: ParserDiagnostic, severity: Severity): CliDiagnostic => ({
    line: d.location.line,
    column: d.location.column,
    severity,
    message: d.message,
    source: 'model',
  });
  for (const d of doc.errors) diagnostics.push(fromModelFile(d, 'error'));
  for (const d of doc.warnings) diagnostics.push(fromModelFile(d, 'warning'));
  const { layout } = splitModelFile(text);
  if (layout !== null) {
    const lineOffset = text.slice(0, text.indexOf(layout)).split('\n').length - 1;
    const v = validateLayout(layout, doc.model ? layoutKeysOfModel(fromModel(doc.model)) : undefined);
    for (const d of v.errors) diagnostics.push(fromLayout(d, 'error', lineOffset, 'model-layout'));
    for (const d of v.warnings) diagnostics.push(fromLayout(d, 'warning', lineOffset, 'model-layout'));
  }
  diagnostics.sort(byPosition);
  return {
    diagnostics,
    errors: diagnostics.filter((d) => d.severity === 'error').length,
    warnings: diagnostics.filter((d) => d.severity === 'warning').length,
    db: null,
    model: doc.model ? withoutSources(doc.model) : null,
  };
}

// The model: the schema as the engine's input, in declaration order, for reading without parsing DBML by eye.

/** The model without the DBML text positions the adapter keeps as sources: what a model file holds. */
export function withoutSources (model: Model): Model {
  return JSON.parse(JSON.stringify(model, (key, value: unknown) => (key === 'source' ? undefined : value))) as Model;
}

/** The engine's model of a text, or null with the check result when the DBML has errors. */
export function modelOf (text: string, opts: CompileOptions = {}): { model: Model | null; check: CheckResult } {
  const check = checkText(text, opts);
  return {
    model: check.db ? withoutSources(toModel(check.db).model) : null,
    check,
  };
}

const flagsOf = (f: FieldVM) => [f.pk || f.compositePk ? 'pk' : '', f.unique ? 'unique' : '', f.notNull ? 'not null' : '', f.increment ? 'increment' : '']
  .filter(Boolean).join(', ');

const refEnd = (e: RefEndpointVM) => `${e.tableKey}${e.fieldNames.length ? `(${e.fieldNames.join(', ')})` : ''} ${e.cardinality}`;

const column = (e: EdgeEndpointVM) => `${e.tableKey}.${e.fieldNames[0] ?? ''}`;

/** How many of a table's records the listing shows. */
const LISTED_RECORDS = 20;

/** A compact, line-oriented rendering of a model for reading in a terminal, as the engine resolves it. */
export function formatModelText (model: Model): string {
  const m = fromModel(model);
  const lines: string[] = [];
  lines.push('TABLES');
  for (const t of m.tables) {
    lines.push(`  ${t.key}${t.groupKey ? `  [group ${t.groupKey}]` : ''}${t.note ? `  # ${t.note}` : ''}`);
    for (const f of t.fields) {
      const fl = flagsOf(f);
      lines.push(`    ${f.name} ${f.typeText}${fl ? ` [${fl}]` : ''}${f.note ? `  # ${f.note}` : ''}`);
    }
  }
  const withRecords = m.tables.filter((t) => t.records?.length);
  if (withRecords.length) {
    lines.push('RECORDS');
    for (const t of withRecords) {
      const records = t.records!;
      lines.push(`  ${t.key}  (${records.length} ${records.length === 1 ? 'row' : 'rows'})`);
      for (const r of records.slice(0, LISTED_RECORDS)) {
        lines.push(`    ${Object.entries(r).map(([k, v]) => `${k}=${typeof v === 'string' ? JSON.stringify(v) : String(v)}`).join(', ')}`);
      }
      if (records.length > LISTED_RECORDS) lines.push(`    and ${records.length - LISTED_RECORDS} more`);
    }
  }
  lines.push('REFS');
  for (const r of m.refs) {
    lines.push(`  ${refEnd(r.endpoints[0])} -- ${refEnd(r.endpoints[1])}${r.name ? `  [${r.name}]` : ''}${r.inactive ? '  (inactive)' : ''}${r.viaPartial ? `  (from partial ${r.viaPartial})` : ''}`);
  }
  lines.push('DEPS');
  for (const d of m.deps) {
    lines.push(`  ${d.upstream.tableKey} -> ${d.downstream.tableKey}${d.names.length ? `  [${d.names.join(', ')}]` : ''}${d.note ? `  # ${d.note}` : ''}`);
    for (const c of d.columns) lines.push(`    ${column(c.upstream)} -> ${column(c.downstream)}`);
  }
  if (m.views.length) {
    lines.push('VIEWS');
    for (const v of m.views) {
      const parts = [
        v.schemas.length ? `schemas: ${v.schemas.join(', ')}` : '',
        v.groupKeys.length ? `groups: ${v.groupKeys.join(', ')}` : '',
        v.tableKeys.length ? `tables: ${v.tableKeys.join(', ')}` : '',
        v.noteKeys.length ? `notes: ${v.noteKeys.join(', ')}` : '',
      ].filter(Boolean);
      lines.push(`  ${v.name}${parts.length ? `  ${parts.join('; ')}` : '  (everything)'}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

/** `file:line:col: severity: message`, one per line, then a summary. */
export function formatCheck (file: string, result: CheckResult): string {
  const where = (d: CliDiagnostic) => (d.source === 'layout' ? ' (layout footer)' : d.source === 'model-layout' ? ' (layout property)' : '');
  const lines = result.diagnostics.map((d) => `${d.file ?? file}:${d.line}:${d.column}: ${d.severity}: ${d.message}${where(d)}`);
  const count = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  lines.push(`${file}: ${count(result.errors, 'error')}, ${count(result.warnings, 'warning')}`);
  return `${lines.join('\n')}\n`;
}

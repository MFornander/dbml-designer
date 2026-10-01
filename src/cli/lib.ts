/**
 * What the command line offers an agent or a script: the same DBML diagnostics the app shows,
 * a check of the layout footer, and the schema's tables, relationships, and lineage as data.
 * Pure functions over text; `cli/dbml-designer.ts` wraps them for the terminal.
 */
import {
  Compiler, DBMLDiagnosticsProvider, DEFAULT_ENTRY, MemoryProjectLayout,
} from '@dbml/parse';
import type { Database, Diagnostic, Filepath } from '@dbml/parse';

type DbmlProjectLayout = ConstructorParameters<typeof Compiler>[0];
import { buildDiagramModel } from '@/dbml/buildModel';
import { tokenOf } from '@/dbml/token';
import type { DiagramModel, EdgeEndpointVM, RefEndpointVM } from '@/engine/core';
import { splitLayoutComment, validateLayout } from '@/layout';
import { layoutKeysOf } from '@/layout/schemaKeys';
import type { ParserDiagnostic } from '@/types/diagnostics';

export type Severity = 'error' | 'warning';

export interface CliDiagnostic {
  /** 1-based position in the file. */
  line: number;
  column: number;
  severity: Severity;
  message: string;
  /** The DBML itself, or the layout YAML in the footer comment. */
  source: 'dbml' | 'layout';
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

function fromLayout (d: ParserDiagnostic, severity: Severity, lineOffset: number): CliDiagnostic {
  return {
    line: d.location.line + lineOffset,
    column: d.location.column,
    severity,
    message: d.message,
    source: 'layout',
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

// The graph: the schema as data, in declaration order, for reading without parsing DBML by eye.

export interface GraphField {
  name: string;
  type: string;
  pk: boolean;
  unique: boolean;
  notNull: boolean;
  increment: boolean;
  default?: string;
  note?: string;
  /** Name of the TablePartial the field was injected from. */
  injectedFrom?: string;
  metadata?: Record<string, string>;
}

export interface GraphTable {
  /** `schema.table`; the key every other section uses to name the table. */
  key: string;
  schema: string;
  name: string;
  alias: string | null;
  group: string | null;
  note?: string;
  metadata?: Record<string, string>;
  fields: GraphField[];
}

export interface GraphEnd {
  table: string;
  fields: string[];
}

export interface GraphRefEnd extends GraphEnd {
  /** `1`, `*`, `0..1`, and so on, as written in DBML. */
  cardinality: string;
}

export interface GraphRef {
  key: string;
  name: string | null;
  from: GraphRefEnd;
  to: GraphRefEnd;
  inactive: boolean;
  onDelete?: string;
  onUpdate?: string;
  /** The TablePartial whose injected field declares the ref; `from` is then the injecting table. */
  viaPartial?: string;
}

export interface GraphDep {
  /** Dep block names that contribute to this edge; empty for anonymous or inline deps. */
  names: string[];
  upstream: string;
  downstream: string;
  /** Column mappings as `schema.table.column`, upstream to downstream. */
  columns: { from: string; to: string }[];
  note?: string;
  metadata?: Record<string, string>;
}

export interface Graph {
  project: { name: string | null; databaseType: string | null; note: string | null };
  tables: GraphTable[];
  refs: GraphRef[];
  deps: GraphDep[];
  groups: { key: string; name: string; tables: string[]; note?: string; metadata?: Record<string, string> }[];
  views: { name: string; tables: string[]; groups: string[]; schemas: string[]; notes: string[] }[];
  notes: { name: string; content: string }[];
  enums: { name: string; values: { name: string; note?: string }[] }[];
}

const endOf = (e: EdgeEndpointVM): GraphEnd => ({
  table: e.tableKey,
  fields: [...e.fieldNames],
});

const refEndOf = (e: RefEndpointVM): GraphRefEnd => ({
  ...endOf(e),
  cardinality: String(e.cardinality),
});

const column = (e: EdgeEndpointVM) => `${e.tableKey}.${e.fieldNames[0] ?? ''}`;

const optional = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/** The diagram model as plain data. */
export function graphOfModel (model: DiagramModel, db: Database): Graph {
  // The interpreter keeps the Project's keys as written and wraps its note.
  const project = (db.project ?? null) as { name?: string | null; database_type?: string | null; note?: { value?: string } | null } | null;
  const groupOf = new Map<string, string>();
  for (const g of model.groups) for (const t of g.tableKeys) groupOf.set(t, g.key);
  return {
    project: {
      name: project?.name ?? null,
      databaseType: project?.database_type ?? null,
      note: project?.note?.value ?? null,
    },
    tables: [...model.tables].sort((a, b) => a.order - b.order).map((t) => optional({
      key: t.key,
      schema: t.schema,
      name: t.name,
      alias: t.alias,
      group: groupOf.get(t.key) ?? null,
      note: t.note,
      metadata: t.metadata,
      fields: t.fields.map((f) => optional({
        name: f.name,
        type: f.typeText,
        pk: f.pk || f.compositePk,
        unique: f.unique,
        notNull: f.notNull,
        increment: f.increment,
        default: f.dbdefault,
        note: f.note,
        injectedFrom: f.injectedFrom,
        metadata: f.metadata,
      })),
    })),
    refs: model.refs.map((r) => optional({
      key: r.key,
      name: r.name,
      from: refEndOf(r.endpoints[0]),
      to: refEndOf(r.endpoints[1]),
      inactive: r.inactive,
      onDelete: r.onDelete,
      onUpdate: r.onUpdate,
      viaPartial: r.viaPartial,
    })),
    deps: model.deps.map((d) => optional({
      names: [...d.names],
      upstream: d.upstream.tableKey,
      downstream: d.downstream.tableKey,
      columns: d.columns.map((c) => ({
        from: column(c.upstream),
        to: column(c.downstream),
      })),
      note: d.note,
      metadata: d.metadata,
    })),
    groups: [...model.groups].sort((a, b) => a.order - b.order).map((g) => optional({
      key: g.key,
      name: g.name,
      tables: [...g.tableKeys],
      note: g.note,
      metadata: g.metadata,
    })),
    views: model.views.map((v) => ({
      name: v.name,
      tables: [...v.tableKeys],
      groups: [...v.groupKeys],
      schemas: [...v.schemas],
      notes: [...v.noteKeys],
    })),
    notes: [...model.notes].sort((a, b) => a.order - b.order).map((n) => ({
      name: n.name,
      content: n.content,
    })),
    enums: [...model.enums.values()].map((e) => ({
      name: e.name,
      values: e.values.map((v) => optional({
        name: v.name,
        note: v.note,
      })),
    })),
  };
}

/** The graph of a text, or null with the check result when the DBML has errors. */
export function graphOf (text: string, opts: CompileOptions = {}): { graph: Graph | null; check: CheckResult } {
  const check = checkText(text, opts);
  if (!check.db) {
    return {
      graph: null,
      check,
    };
  }
  return {
    graph: graphOfModel(buildDiagramModel(check.db), check.db),
    check,
  };
}

/** A compact, line-oriented rendering of the graph for reading in a terminal. */
export function formatGraphText (g: Graph): string {
  const lines: string[] = [];
  const flags = (f: GraphField) => [f.pk ? 'pk' : '', f.unique ? 'unique' : '', f.notNull ? 'not null' : '', f.increment ? 'increment' : '']
    .filter(Boolean).join(', ');
  lines.push('TABLES');
  for (const t of g.tables) {
    lines.push(`  ${t.key}${t.group ? `  [group ${t.group}]` : ''}${t.note ? `  # ${t.note}` : ''}`);
    for (const f of t.fields) {
      const fl = flags(f);
      lines.push(`    ${f.name} ${f.type}${fl ? ` [${fl}]` : ''}${f.note ? `  # ${f.note}` : ''}`);
    }
  }
  lines.push('REFS');
  for (const r of g.refs) {
    const end = (e: GraphRefEnd) => `${e.table}${e.fields.length ? `(${e.fields.join(', ')})` : ''} ${e.cardinality}`;
    lines.push(`  ${end(r.from)} -- ${end(r.to)}${r.name ? `  [${r.name}]` : ''}${r.inactive ? '  (inactive)' : ''}${r.viaPartial ? `  (from partial ${r.viaPartial})` : ''}`);
  }
  lines.push('DEPS');
  for (const d of g.deps) {
    lines.push(`  ${d.upstream} -> ${d.downstream}${d.names.length ? `  [${d.names.join(', ')}]` : ''}${d.note ? `  # ${d.note}` : ''}`);
    for (const c of d.columns) lines.push(`    ${c.from} -> ${c.to}`);
  }
  if (g.views.length) {
    lines.push('VIEWS');
    for (const v of g.views) {
      const parts = [
        v.schemas.length ? `schemas: ${v.schemas.join(', ')}` : '',
        v.groups.length ? `groups: ${v.groups.join(', ')}` : '',
        v.tables.length ? `tables: ${v.tables.join(', ')}` : '',
        v.notes.length ? `notes: ${v.notes.join(', ')}` : '',
      ].filter(Boolean);
      lines.push(`  ${v.name}${parts.length ? `  ${parts.join('; ')}` : '  (everything)'}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

/** `file:line:col: severity: message`, one per line, then a summary. */
export function formatCheck (file: string, result: CheckResult): string {
  const lines = result.diagnostics.map((d) => `${d.file ?? file}:${d.line}:${d.column}: ${d.severity}: ${d.message}${d.source === 'layout' ? ' (layout footer)' : ''}`);
  const count = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  lines.push(`${file}: ${count(result.errors, 'error')}, ${count(result.warnings, 'warning')}`);
  return `${lines.join('\n')}\n`;
}

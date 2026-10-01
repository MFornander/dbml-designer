/**
 * Model files: the diagram engine's model as JSON, with its layout in the same file (issue #8).
 *
 *   { "version": 1, "model": { "tables": [...], ... }, "layout": { "version": 1, "views": {...} } }
 *
 * `layout` has the structure of a `.dbml` file's footer. Like the footer, it is lifted out of the
 * text the editor shows and written back on save. Each element of the model gets the JSON path it
 * sits at as its source, so the diagram can reveal it in the text and colors and views can be
 * written back into it. Edits go through jsonc-parser, which keeps the rest of the text as it was.
 */
import {
  applyEdits, findNodeAtLocation, getNodeValue, modify, parseTree, printParseErrorCode,
  type JSONPath, type Node, type ParseError,
} from 'jsonc-parser';
import YAML from 'yaml';
import { checkModel, fromModel, type Model } from '@dbml-designer/engine/core';
import type { TextEdit } from '@/editor/colorEdit';
import type { ParserDiagnostic } from '@/types/diagnostics';
import type { TokenRange } from '@/types/diagram';

/** Version of the model file format this build reads and writes. */
export const MODEL_FILE_VERSION = 1;

const PARSE_OPTIONS = {
  disallowComments: true,
  allowTrailingComma: false,
  allowEmptyContent: true,
};

const FORMATTING = {
  formattingOptions: {
    insertSpaces: true,
    tabSize: 2,
    eol: '\n',
  },
};

/** The source the editor gives an element of a model file: where it sits in the JSON. */
export interface JsonSource {
  jsonPath: JSONPath;
}

/** The JSON path of an element of a model file; undefined for an element from anywhere else. */
export function jsonPathOf (source: unknown): JSONPath | undefined {
  if (typeof source !== 'object' || source === null) return undefined;
  const p = (source as Partial<JsonSource>).jsonPath;
  return Array.isArray(p) ? p : undefined;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 1-indexed line and column of a character offset, as Monaco and the parser report them. */
export function positionAt (text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = text.indexOf('\n'); i >= 0 && i < offset; i = text.indexOf('\n', i + 1)) {
    line += 1;
    lineStart = i + 1;
  }
  return {
    line,
    column: offset - lineStart + 1,
  };
}

/**
 * What a problem in a model file is about: JSON syntax, the file's or the model's shape (both of
 * which Monaco's JSON service also marks), or a name the model uses that it does not have.
 */
export type ModelProblemKind = 'json' | 'shape' | 'reference';

function diagnostic (text: string, offset: number, length: number, message: string, category: ModelProblemKind): ParserDiagnostic {
  return {
    code: 'model',
    message,
    category,
    location: positionAt(text, offset),
    endLocation: positionAt(text, offset + Math.max(length, 1)),
  };
}

/** The node at a path, or the deepest one above it when the path leads past what the text has. */
function nearestNode (tree: Node, path: JSONPath): Node {
  for (let n = path.length; n >= 0; n--) {
    const node = findNodeAtLocation(tree, path.slice(0, n));
    if (node) return node;
  }
  return tree;
}

/** Where the value at a path sits in the text, or null when there is no such value. */
export function rangeOfPath (text: string, path: JSONPath): { start: number; end: number } | null {
  const tree = parseTree(text, [], PARSE_OPTIONS);
  const node = tree && findNodeAtLocation(tree, path);
  return node
    ? {
        start: node.offset,
        end: node.offset + node.length,
      }
    : null;
}

/** Where the element with this source sits in a model file's text; undefined for a source that is no JSON path or leads nowhere. */
export function locateInModelFile (text: string, source: unknown): TokenRange | undefined {
  const path = jsonPathOf(source);
  const range = path && rangeOfPath(text, path);
  return range
    ? {
        start: positionAt(text, range.start),
        end: positionAt(text, range.end),
      }
    : undefined;
}

/** A model file's text split into what the editor shows and its layout, as text YAML can read, or null. */
export function splitModelFile (text: string): { body: string; layout: string | null } {
  const errors: ParseError[] = [];
  const tree = parseTree(text, errors, PARSE_OPTIONS);
  const layoutNode = tree && errors.length === 0 ? findNodeAtLocation(tree, ['layout']) : undefined;
  if (!tree || !layoutNode) {
    return {
      body: text,
      layout: null,
    };
  }
  return {
    body: applyEdits(text, modify(text, ['layout'], undefined, FORMATTING)),
    // JSON is YAML, so the layout reads like a footer.
    layout: text.slice(layoutNode.offset, layoutNode.offset + layoutNode.length),
  };
}

/** The editor's text with a layout, given as footer YAML, put back in; the text as is while it is not a JSON object. */
export function withModelLayout (body: string, layoutYaml: string): string {
  const errors: ParseError[] = [];
  const tree = parseTree(body, errors, PARSE_OPTIONS);
  if (!tree || errors.length > 0 || tree.type !== 'object') return body;
  return applyEdits(body, modify(body, ['layout'], YAML.parse(layoutYaml), FORMATTING));
}

/** Edits that set the value at a path, creating what leads to it, or remove it with `undefined`. */
export function setAtPath (text: string, path: JSONPath, value: unknown, opts: { insert?: boolean } = {}): TextEdit[] {
  return modify(text, path, value, {
    ...FORMATTING,
    isArrayInsertion: opts.insert ?? false,
  }).map((e) => ({
    start: e.offset,
    end: e.offset + e.length,
    text: e.content,
  }));
}

/** The model with each element's JSON path as its source. */
function withSources (model: Model): Model {
  const at = (...path: JSONPath) => ({ source: { jsonPath: ['model', ...path] } satisfies JsonSource });
  return {
    ...model,
    tables: model.tables.map((t, i) => ({
      ...t,
      fields: t.fields.map((f, j) => ({
        ...f,
        ...at('tables', i, 'fields', j),
      })),
      ...at('tables', i),
    })),
    ...(model.refs ? { refs: model.refs.map((r, i) => ({ ...r, ...at('refs', i) })) } : {}),
    ...(model.deps ? { deps: model.deps.map((d, i) => ({ ...d, ...at('deps', i) })) } : {}),
    ...(model.groups ? { groups: model.groups.map((g, i) => ({ ...g, ...at('groups', i) })) } : {}),
    ...(model.notes ? { notes: model.notes.map((n, i) => ({ ...n, ...at('notes', i) })) } : {}),
    ...(model.views ? { views: model.views.map((v, i) => ({ ...v, ...at('views', i) })) } : {}),
  };
}

export interface ModelDocument {
  /** The model to draw, its elements sourced by JSON path; null while the text has errors. */
  model: Model | null;
  errors: ParserDiagnostic[];
  warnings: ParserDiagnostic[];
}

const SHAPE = 'A model file is { "version": 1, "model": { "tables": [ ... ] } }';

/** Read the editor's text as a model file: JSON syntax, the file's shape, the model's, and what the model names. */
export function readModelDocument (text: string): ModelDocument {
  const errors: ParserDiagnostic[] = [];
  const warnings: ParserDiagnostic[] = [];
  const parseErrors: ParseError[] = [];
  const tree = parseTree(text, parseErrors, PARSE_OPTIONS);
  for (const e of parseErrors) errors.push(diagnostic(text, e.offset, e.length, `JSON: ${printParseErrorCode(e.error)}`, 'json'));
  if (!tree) {
    if (errors.length === 0) errors.push(diagnostic(text, 0, 0, SHAPE, 'shape'));
    return {
      model: null,
      errors,
      warnings,
    };
  }
  if (errors.length > 0) {
    return {
      model: null,
      errors,
      warnings,
    };
  }
  const at = (path: JSONPath, message: string, kind: ModelProblemKind = 'shape') => {
    const node = nearestNode(tree, path);
    return diagnostic(text, node.offset, node.length, message, kind);
  };
  const root: unknown = getNodeValue(tree);
  if (!isObject(root) || !('model' in root)) {
    errors.push(at([], SHAPE));
    return {
      model: null,
      errors,
      warnings,
    };
  }
  if (root.version !== MODEL_FILE_VERSION) warnings.push(at(['version'], `"version": ${MODEL_FILE_VERSION} expected`));
  for (const key of Object.keys(root)) {
    if (key !== 'version' && key !== 'model' && key !== 'layout') warnings.push(at([key], `Unknown property "${key}"`));
  }
  for (const p of checkModel(root.model)) (p.severity === 'error' ? errors : warnings).push(at(['model', ...p.path], p.message));
  if (errors.length > 0) {
    return {
      model: null,
      errors,
      warnings,
    };
  }
  const model = withSources(root.model as Model);
  // What the engine leaves out, such as a ref to a table the model does not have.
  for (const d of fromModel(model).diagnostics) warnings.push(at(jsonPathOf(d.source) ?? ['model'], d.message, 'reference'));
  return {
    model,
    errors,
    warnings,
  };
}

/** The text of a new model file holding a model, without layout. */
export function modelFileText (model: Model): string {
  return `${JSON.stringify({
    version: MODEL_FILE_VERSION,
    model,
  }, null, 2)}\n`;
}

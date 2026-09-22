/**
 * Reads layout YAML (from the comment at the end of an imported `.dbml`) and reports what is
 * wrong with it: YAML syntax, the shape of each section, and, given the schema's keys, references
 * to tables, notes, groups, relationships, and views the DBML does not have. Structural problems are
 * errors and keep the layout from being applied; unknown references are warnings, since the
 * diagram simply ignores those entries.
 */
import {
  LineCounter, isMap, isScalar, isSeq, parseDocument,
} from 'yaml';
import type {
  Node, Pair, Range, YAMLMap, YAMLSeq,
} from 'yaml';
import type { ParserDiagnostic, QuickFixAction } from '@/types/diagnostics';
import type { XY } from '@/types/diagram';
import { isValidRails } from '@/diagram/geometry/routing';
import { noteKey } from '@/diagram/keys';
import type { LayoutKeys } from './schemaKeys';
import {
  DEFAULT_VIEW, endFromFile, GROUP_PREFIX, qualifiedForFile, refKeyOf, ROOT_SECTIONS, SECTION_ORDER, SIDECAR_VERSION, SidecarError,
  splitQualified,
} from './format';
import type { LayoutSnapshot } from './format';

/** Category shown as the group header in the Errors list. */
export const LAYOUT_CATEGORY = 'layout';

export interface LayoutValidation {
  /** Every structurally valid entry, whether or not the schema knows it. */
  snapshot: LayoutSnapshot;
  errors: ParserDiagnostic[];
  warnings: ParserDiagnostic[];
  /** No errors: the snapshot can be applied. */
  ok: boolean;
}

type Severity = 'error' | 'warning';

interface Extras {
  explanation?: string;
  quickFixes?: QuickFixAction[];
}

class Report {
  readonly errors: ParserDiagnostic[] = [];

  readonly warnings: ParserDiagnostic[] = [];

  constructor (private readonly text: string, private readonly lines: LineCounter) {}

  private pos (offset: number): { line: number; column: number } {
    const { line, col } = this.lines.linePos(Math.max(0, Math.min(offset, this.text.length)));
    return {
      line,
      column: col,
    };
  }

  add (severity: Severity, span: readonly [number, number] | null | undefined, code: string, message: string, extras: Extras = {}): void {
    const [start, end] = span ?? [0, 0];
    (severity === 'error' ? this.errors : this.warnings).push({
      code,
      message,
      location: this.pos(start),
      endLocation: this.pos(Math.max(start, end)),
      category: LAYOUT_CATEGORY,
      ...(extras.explanation ? { explanation: extras.explanation } : {}),
      ...(extras.quickFixes?.length ? { quickFixes: extras.quickFixes } : {}),
    });
  }
}

function span (node: Node | null | undefined): [number, number] | null {
  const r: Range | null | undefined = node?.range;
  return r ? [r[0], r[1]] : null;
}

/** The span of a whole `key: value` entry. */
function pairSpan (pair: Pair): [number, number] | null {
  const k = span(pair.key as Node);
  const v = span(pair.value as Node | null);
  if (!k) return v;
  return [k[0], v ? v[1] : k[1]];
}

function keyOf (pair: Pair): string | null {
  return isScalar(pair.key) ? String(pair.key.value) : null;
}

function numberOf (node: unknown): number | null {
  return isScalar(node) && typeof node.value === 'number' && Number.isFinite(node.value) ? node.value : null;
}

function stringOf (node: unknown): string | null {
  return isScalar(node) && typeof node.value === 'string' ? node.value : null;
}

function isBlank (node: unknown): boolean {
  return node === null || node === undefined || (isScalar(node) && node.value === null);
}

/** A mapping with a numeric `x` is a position, which tells a flat `schema.table` entry from a schema. */
function looksLikePosition (node: unknown): node is YAMLMap {
  return isMap(node) && numberOf(node.get('x', true)) !== null;
}

function readPosition (r: Report, node: unknown, where: string, withSize: boolean): XY | null {
  if (!isMap(node)) {
    r.add('error', span(node as Node), 'layout/position', `"${where}" needs numeric x and y`);
    return null;
  }
  const x = numberOf(node.get('x', true));
  const y = numberOf(node.get('y', true));
  if (x === null || y === null) {
    r.add('error', span(node), 'layout/position', `"${where}" needs numeric x and y`);
    return null;
  }
  const out: XY = {
    x,
    y,
  };
  let ok = true;
  for (const pair of node.items) {
    const k = keyOf(pair);
    if (k === 'x' || k === 'y') continue;
    if (withSize && (k === 'w' || k === 'h')) {
      const n = numberOf(pair.value);
      if (n === null) {
        r.add('error', span(pair.value as Node), 'layout/position', `"${where}.${k}" must be a number`);
        ok = false;
      } else {
        out[k] = n;
      }
      continue;
    }
    r.add('warning', pairSpan(pair), 'layout/unknown-key', `Unknown key "${k ?? '?'}" in "${where}"; it is ignored`);
  }
  return ok ? out : null;
}

function readTables (r: Report, node: unknown, keys: LayoutKeys | undefined, snap: LayoutSnapshot): void {
  if (isBlank(node)) return;
  if (!isMap(node)) {
    r.add('error', span(node as Node), 'layout/shape', '"tables" must be a mapping');
    return;
  }
  const accept = (key: string, pair: Pair, pos: XY | null) => {
    if (!pos) return;
    if (keys && !keys.tables.has(key)) {
      r.add('warning', pairSpan(pair), 'layout/unknown-table', `Table "${qualifiedForFile(key)}" is not in the DBML; its position is ignored`);
    }
    snap.positions[key] = pos;
  };
  for (const pair of node.items) {
    const schemaOrKey = keyOf(pair) ?? '?';
    if (looksLikePosition(pair.value)) {
      // The older flat form: `schema.table: { x, y }` right under `tables`.
      const [schema, name] = splitQualified(schemaOrKey);
      accept(`${schema}.${name}`, pair, readPosition(r, pair.value, `tables.${schemaOrKey}`, false));
      continue;
    }
    if (isBlank(pair.value)) continue;
    if (!isMap(pair.value)) {
      r.add('error', span(pair.value as Node), 'layout/shape', `"tables.${schemaOrKey}" must be a mapping`);
      continue;
    }
    for (const entry of pair.value.items) {
      const name = keyOf(entry) ?? '?';
      accept(`${schemaOrKey}.${name}`, entry, readPosition(r, entry.value, `tables.${schemaOrKey}.${name}`, false));
    }
  }
}

function readNotes (r: Report, node: unknown, keys: LayoutKeys | undefined, snap: LayoutSnapshot): void {
  if (isBlank(node)) return;
  if (!isMap(node)) {
    r.add('error', span(node as Node), 'layout/shape', '"notes" must be a mapping');
    return;
  }
  for (const pair of node.items) {
    const name = keyOf(pair) ?? '?';
    const pos = readPosition(r, pair.value, `notes.${name}`, true);
    if (!pos) continue;
    const key = noteKey(name);
    if (keys && !keys.notes.has(key)) {
      r.add('warning', pairSpan(pair), 'layout/unknown-note', `Note "${name}" is not in the DBML; its position is ignored`);
    }
    snap.positions[key] = pos;
  }
}

function readGroupEntry (r: Report, node: unknown, where: string): boolean | null {
  if (!isMap(node)) {
    r.add('error', span(node as Node), 'layout/shape', `"${where}" must be a mapping`);
    return null;
  }
  let collapsed = false;
  for (const pair of node.items) {
    const k = keyOf(pair);
    if (k === 'collapsed') {
      if (!isScalar(pair.value) || typeof pair.value.value !== 'boolean') {
        r.add('error', span(pair.value as Node), 'layout/shape', `"${where}.collapsed" must be true or false`);
        return null;
      }
      collapsed = pair.value.value;
      continue;
    }
    r.add('warning', pairSpan(pair), 'layout/unknown-key', `Unknown key "${k ?? '?'}" in "${where}"; it is ignored`);
  }
  return collapsed;
}

function readGroups (r: Report, node: unknown, keys: LayoutKeys | undefined, snap: LayoutSnapshot): void {
  if (isBlank(node)) return;
  if (!isMap(node)) {
    r.add('error', span(node as Node), 'layout/shape', '"groups" must be a mapping');
    return;
  }
  const accept = (qualified: string, pair: Pair, collapsed: boolean | null) => {
    if (collapsed === null) return;
    const key = `${GROUP_PREFIX}${qualified}`;
    if (keys && !keys.groups.has(key)) {
      r.add('warning', pairSpan(pair), 'layout/unknown-group', `Table group "${qualifiedForFile(qualified)}" is not in the DBML; its collapsed state is ignored`);
    }
    if (collapsed) snap.collapsedGroups.push(key);
    else (snap.expandedGroups ??= []).push(key);
  };
  for (const pair of node.items) {
    const schemaOrKey = keyOf(pair) ?? '?';
    if (isMap(pair.value) && pair.value.has('collapsed')) {
      // The older flat form: `schema.group: { collapsed }` right under `groups`.
      const [schema, name] = splitQualified(schemaOrKey);
      accept(`${schema}.${name}`, pair, readGroupEntry(r, pair.value, `groups.${schemaOrKey}`));
      continue;
    }
    if (isBlank(pair.value)) continue;
    if (!isMap(pair.value)) {
      r.add('error', span(pair.value as Node), 'layout/shape', `"groups.${schemaOrKey}" must be a mapping`);
      continue;
    }
    for (const entry of pair.value.items) {
      const name = keyOf(entry) ?? '?';
      accept(`${schemaOrKey}.${name}`, entry, readGroupEntry(r, entry.value, `groups.${schemaOrKey}.${name}`));
    }
  }
}

function readRails (node: unknown): number[] | null {
  if (!isSeq(node)) return null;
  // An empty list undoes a route inherited from an imported layout.
  if (node.items.length === 0) return [];
  const values = node.items.map(numberOf);
  if (values.some((v) => v === null)) return null;
  const rails = values as number[];
  return isValidRails(rails) ? rails : null;
}

const REF_KEYS = new Set(['name', 'from', 'to', 'rails']);

const DIRECTION_EXPLANATION = 'A relationship is listed with the referenced table first, the way the diagram keys it. '
  + 'An inline `ref: >` on `posts.author_id` pointing at `users.id` is written as `from: users(id)` and `to: posts(author_id)`.';

function readRefs (r: Report, text: string, node: unknown, keys: LayoutKeys | undefined, snap: LayoutSnapshot): void {
  if (isBlank(node)) return;
  if (!isSeq(node)) {
    r.add('error', span(node as Node), 'layout/shape', '"refs" must be a list');
    return;
  }
  (node as YAMLSeq).items.forEach((item, i) => {
    const where = `refs[${i}]`;
    if (!isMap(item)) {
      r.add('error', span(item as Node), 'layout/shape', `"${where}" needs "from" and "to"`);
      return;
    }
    const fromNode = item.get('from', true);
    const toNode = item.get('to', true);
    const from = stringOf(fromNode);
    const to = stringOf(toNode);
    if (from === null || to === null) {
      r.add('error', span(item), 'layout/shape', `"${where}" needs "from" and "to"`);
      return;
    }
    const nameNode = item.get('name', true);
    if (nameNode !== undefined && !isBlank(nameNode) && stringOf(nameNode) === null) {
      r.add('error', span(nameNode as Node), 'layout/shape', `"${where}.name" must be a string`);
      return;
    }
    const name = stringOf(nameNode);
    const railsNode = item.get('rails', true);
    const rails = readRails(railsNode);
    if (!rails) {
      r.add('error', span((railsNode as Node | undefined) ?? item), 'layout/rails', `"${where}.rails" must be an odd-length list of numbers, or empty for the automatic route`);
      return;
    }
    for (const pair of item.items) {
      const k = keyOf(pair);
      if (k && !REF_KEYS.has(k)) r.add('warning', pairSpan(pair), 'layout/unknown-key', `Unknown key "${k}" in "${where}"; it is ignored`);
    }
    const key = refKeyOf(name, endFromFile(from), endFromFile(to));
    if (keys && !keys.refs.has(key)) {
      const reversed = refKeyOf(name, endFromFile(to), endFromFile(from));
      if (keys.refs.has(reversed)) {
        const fromSpan = span(fromNode as Node)!;
        const toSpan = span(toNode as Node)!;
        r.add('warning', span(item), 'layout/ref-direction',
          `No relationship from "${from}" to "${to}" in the DBML, but there is one from "${to}" to "${from}"; swap from and to`, {
            explanation: DIRECTION_EXPLANATION,
            quickFixes: [{
              title: 'Swap from and to',
              shortTitle: 'Swap',
              isPreferred: true,
              edits: [{
                start: fromSpan[0],
                end: fromSpan[1],
                newText: text.slice(toSpan[0], toSpan[1]),
              }, {
                start: toSpan[0],
                end: toSpan[1],
                newText: text.slice(fromSpan[0], fromSpan[1]),
              }],
            }],
          });
      } else {
        r.add('warning', span(item), 'layout/unknown-ref', `No relationship from "${from}" to "${to}" in the DBML; this route is ignored`, {
          explanation: DIRECTION_EXPLANATION,
        });
      }
    }
    snap.edgeRoutes[key] = [...rails];
  });
}

/** Read one element section into `snap`; false when `k` names no such section. */
function readSection (r: Report, text: string, k: string | null, value: unknown, keys: LayoutKeys | undefined, snap: LayoutSnapshot): boolean {
  switch (k) {
    case 'tables': readTables(r, value, keys, snap); return true;
    case 'notes': readNotes(r, value, keys, snap); return true;
    case 'groups': readGroups(r, value, keys, snap); return true;
    case 'refs': readRefs(r, text, value, keys, snap); return true;
    default: return false;
  }
}

/** One view's entry, `default` or a `DiagramView`'s: a mapping of element sections. */
function readView (r: Report, text: string, node: YAMLMap, keys: LayoutKeys | undefined, snap: LayoutSnapshot, name: string): void {
  for (const entry of node.items) {
    const k = keyOf(entry);
    if (!readSection(r, text, k, entry.value, keys, snap)) {
      r.add('warning', pairSpan(entry), 'layout/unknown-section',
        `Unknown section "${k ?? '?'}" in "views.${name}"; it is ignored. Sections are ${SECTION_ORDER.join(', ')}`);
    }
  }
}

/** `views`: the Default View as `default` and every named `DiagramView`'s own entry. */
function readViews (r: Report, text: string, node: unknown, keys: LayoutKeys | undefined, snap: LayoutSnapshot): void {
  if (isBlank(node)) return;
  if (!isMap(node)) {
    r.add('error', span(node as Node), 'layout/shape', '"views" must be a mapping of view names');
    return;
  }
  for (const pair of node.items) {
    const name = keyOf(pair) ?? '?';
    if (isBlank(pair.value)) continue;
    if (!isMap(pair.value)) {
      r.add('warning', pairSpan(pair), 'layout/not-a-view',
        `"views.${name}" is not a view: a view is a mapping of sections (${SECTION_ORDER.join(', ')}); it is ignored`);
      continue;
    }
    if (name === DEFAULT_VIEW) {
      readView(r, text, pair.value, keys, snap, name);
      continue;
    }
    if (keys && !keys.views.has(name)) {
      r.add('warning', pairSpan(pair), 'layout/unknown-view', `DiagramView "${name}" is not in the DBML; its layout is ignored`);
    }
    const nested: LayoutSnapshot = {
      positions: {},
      collapsedGroups: [],
      edgeRoutes: {},
    };
    readView(r, text, pair.value, keys, nested, name);
    (snap.views ??= {})[name] = nested;
  }
}

/**
 * Check a layout file. With `keys` from the current schema, entries that point at nothing are
 * reported as warnings. Never throws; a file that is not YAML at all is one error.
 */
export function validateLayout (text: string, keys?: LayoutKeys): LayoutValidation {
  const lines = new LineCounter();
  const doc = parseDocument(text, {
    lineCounter: lines,
    prettyErrors: false,
  });
  const r = new Report(text, lines);
  const snapshot: LayoutSnapshot = {
    positions: {},
    collapsedGroups: [],
    edgeRoutes: {},
  };
  const finish = (): LayoutValidation => ({
    snapshot,
    errors: r.errors,
    warnings: r.warnings,
    ok: r.errors.length === 0,
  });

  for (const e of doc.errors) r.add('error', e.pos, 'layout/syntax', `Not valid YAML: ${e.message}`);
  for (const w of doc.warnings) r.add('warning', w.pos, 'layout/syntax', w.message);
  // A broken document is reported once; its shape would only add noise.
  if (doc.errors.length) return finish();

  const root = doc.contents;
  if (!isMap(root)) {
    r.add('error', span(root as Node | null) ?? [0, text.length], 'layout/shape', 'Expected a mapping with a "version" at the top level');
    return finish();
  }

  const versionPair = root.items.find((p) => keyOf(p) === 'version');
  if (!versionPair) {
    r.add('error', [0, 0], 'layout/version', `Missing "version: ${SIDECAR_VERSION}" at the top level`);
  } else if (numberOf(versionPair.value) !== SIDECAR_VERSION) {
    const v = isScalar(versionPair.value) ? String(versionPair.value.value) : '?';
    r.add('error', span(versionPair.value as Node), 'layout/version', `Unsupported layout version ${v}; this build reads version ${SIDECAR_VERSION}`);
  }

  // Older footers put the Default View's element sections at the root; they still read as such.
  for (const pair of root.items) {
    const k = keyOf(pair);
    if (k === 'version') continue;
    if (k === 'views') {
      readViews(r, text, pair.value, keys, snapshot);
      continue;
    }
    if (!readSection(r, text, k, pair.value, keys, snapshot)) {
      r.add('warning', pairSpan(pair), 'layout/unknown-section',
        `Unknown section "${k ?? '?'}"; it is ignored. Sections are ${ROOT_SECTIONS.join(' and ')}`);
    }
  }
  return finish();
}

/** Parse a sidecar into a snapshot. Throws `SidecarError` with the first problem. */
export function parseLayout (text: string): LayoutSnapshot {
  const v = validateLayout(text);
  if (!v.ok) throw new SidecarError(v.errors[0]!.message);
  return v.snapshot;
}

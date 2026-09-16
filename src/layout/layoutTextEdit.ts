/**
 * Edits a `.dbml.yaml` layout in place. When the diagram changes (a table is dragged, a group
 * collapsed, a relationship rerouted) the difference is written into the text as targeted edits,
 * so comments, ordering, and everything the user wrote by hand survive. Only the entries that
 * changed are touched; new sections land in their canonical place.
 */
import {
  isMap, isScalar, isSeq, parseDocument,
} from 'yaml';
import type {
  Document, Node, Pair, YAMLMap, YAMLSeq,
} from 'yaml';
import type { XY } from '@/types/diagram';
import { isNoteKey } from '@/diagram/keys';
import {
  endForFile, endFromFile, GROUP_PREFIX, NOTE_PREFIX, num, positionForFile, refKeyOf, SECTION_ORDER, SIDECAR_VERSION,
  splitQualified, splitRefKey,
} from './format';
import type { LayoutSnapshot } from './format';

export type LayoutDelta =
  | { kind: 'position'; key: string; value: XY | null }
  | { kind: 'group'; key: string; collapsed: boolean }
  | { kind: 'route'; key: string; rails: number[] | null };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** What changed between two snapshots, as edits to make to the file. */
export function diffSnapshots (prev: LayoutSnapshot, next: LayoutSnapshot): LayoutDelta[] {
  const out: LayoutDelta[] = [];
  for (const key of new Set([...Object.keys(prev.positions), ...Object.keys(next.positions)])) {
    if (!same(prev.positions[key], next.positions[key])) {
      out.push({
        kind: 'position',
        key,
        value: next.positions[key] ?? null,
      });
    }
  }
  const before = new Set(prev.collapsedGroups);
  const after = new Set(next.collapsedGroups);
  for (const key of after) {
    if (!before.has(key)) {
      out.push({
        kind: 'group',
        key,
        collapsed: true,
      });
    }
  }
  for (const key of before) {
    if (!after.has(key)) {
      out.push({
        kind: 'group',
        key,
        collapsed: false,
      });
    }
  }
  for (const key of new Set([...Object.keys(prev.edgeRoutes), ...Object.keys(next.edgeRoutes)])) {
    if (!same(prev.edgeRoutes[key], next.edgeRoutes[key])) {
      out.push({
        kind: 'route',
        key,
        rails: next.edgeRoutes[key] ? [...next.edgeRoutes[key]!] : null,
      });
    }
  }
  return out;
}

/** Thrown when the text is well-formed YAML but not shaped like a layout where the edit needs to go. */
class Uneditable extends Error {}

function keyOf (pair: Pair): string | null {
  return isScalar(pair.key) ? String(pair.key.value) : null;
}

/** Insert a top-level or schema-level entry where the canonical writer would put it. */
function insertPair (doc: Document, map: YAMLMap, key: string, value: Node, order?: readonly string[]): void {
  const pair = doc.createPair(key, value);
  let at = map.items.length;
  if (order) {
    const rank = order.indexOf(key);
    const later = map.items.findIndex((p) => {
      const r = order.indexOf(keyOf(p) ?? '');
      return r > rank;
    });
    if (later >= 0) at = later;
  }
  map.items.splice(at, 0, pair);
}

/** A map-valued entry, created (in canonical order for the top level) when `create` is set. */
function mapAt (doc: Document, parent: YAMLMap, key: string, create: boolean, order?: readonly string[]): YAMLMap | null {
  const existing = parent.get(key, true);
  if (isMap(existing)) return existing;
  if (existing !== undefined && !(isScalar(existing) && existing.value === null)) {
    throw new Uneditable(`"${key}" is not a mapping`);
  }
  if (!create) return null;
  const node = doc.createNode({}) as YAMLMap;
  if (existing === undefined) insertPair(doc, parent, key, node, order);
  else parent.set(key, node);
  return node;
}

/** Drop `key` from `map`, and the map itself from its parent when that leaves it empty. */
function removeEntry (parentOfMap: YAMLMap | null, map: YAMLMap, mapKey: string | null, key: string): void {
  map.delete(key);
  if (map.items.length === 0 && parentOfMap && mapKey !== null) parentOfMap.delete(mapKey);
}

function carryComments (from: Node | null | undefined, to: Node): void {
  if (!from) return;
  if (from.comment) to.comment = from.comment;
  if (from.commentBefore) to.commentBefore = from.commentBefore;
  if (from.spaceBefore) to.spaceBefore = from.spaceBefore;
}

/** Write a position into `map[name]`, updating the scalars of an existing entry to keep its style. */
function writePosition (doc: Document, map: YAMLMap, name: string, value: XY, withSize: boolean): void {
  const wanted = positionForFile(value, withSize);
  const existing = map.get(name, true);
  if (isMap(existing)) {
    for (const k of ['x', 'y', 'w', 'h'] as const) {
      const v = wanted[k];
      if (v === undefined) existing.delete(k);
      else existing.set(k, v);
    }
    return;
  }
  const node = doc.createNode(wanted, { flow: true }) as YAMLMap;
  carryComments(existing as Node | undefined, node);
  if (existing === undefined) insertPair(doc, map, name, node);
  else map.set(name, node);
}

/** Positions of tables (`schema.table`) live under `tables.<schema>`; the older flat key is retired on the way. */
function applyTablePosition (doc: Document, root: YAMLMap, key: string, value: XY | null): void {
  const [schema, name] = splitQualified(key);
  const tables = mapAt(doc, root, 'tables', value !== null, SECTION_ORDER);
  if (!tables) return;
  const flat = tables.get(key, true);
  if (isMap(flat) && flat.has('x')) tables.delete(key);
  if (value === null) {
    const bySchema = mapAt(doc, tables, schema, false);
    if (bySchema) removeEntry(tables, bySchema, schema, name);
    if (tables.items.length === 0) root.delete('tables');
    return;
  }
  writePosition(doc, mapAt(doc, tables, schema, true)!, name, value, false);
}

function applyNotePosition (doc: Document, root: YAMLMap, name: string, value: XY | null): void {
  const notes = mapAt(doc, root, 'notes', value !== null, SECTION_ORDER);
  if (!notes) return;
  if (value === null) {
    removeEntry(root, notes, 'notes', name);
    return;
  }
  writePosition(doc, notes, name, value, true);
}

function applyGroup (doc: Document, root: YAMLMap, key: string, collapsed: boolean): void {
  const qualified = key.startsWith(GROUP_PREFIX) ? key.slice(GROUP_PREFIX.length) : key;
  const [schema, name] = splitQualified(qualified);
  const groups = mapAt(doc, root, 'groups', collapsed, SECTION_ORDER);
  if (!groups) return;
  const flat = groups.get(qualified, true);
  if (isMap(flat) && flat.has('collapsed')) groups.delete(qualified);
  if (!collapsed) {
    // Expanded is the default and is not written.
    const bySchema = mapAt(doc, groups, schema, false);
    if (bySchema) removeEntry(groups, bySchema, schema, name);
    if (groups.items.length === 0) root.delete('groups');
    return;
  }
  const bySchema = mapAt(doc, groups, schema, true)!;
  const existing = bySchema.get(name, true);
  if (isMap(existing)) {
    existing.set('collapsed', true);
    return;
  }
  const node = doc.createNode({ collapsed: true }, { flow: true }) as YAMLMap;
  carryComments(existing as Node | undefined, node);
  if (existing === undefined) insertPair(doc, bySchema, name, node);
  else bySchema.set(name, node);
}

function refItemKey (item: unknown): string | null {
  if (!isMap(item)) return null;
  const s = (k: string) => {
    const n = item.get(k, true);
    return isScalar(n) && typeof n.value === 'string' ? n.value : null;
  };
  const from = s('from');
  const to = s('to');
  if (from === null || to === null) return null;
  return refKeyOf(s('name'), endFromFile(from), endFromFile(to));
}

function applyRoute (doc: Document, root: YAMLMap, key: string, rails: number[] | null): void {
  const existing = root.get('refs', true);
  let refs: YAMLSeq | null = null;
  if (isSeq(existing)) refs = existing;
  else if (existing !== undefined && !(isScalar(existing) && existing.value === null)) throw new Uneditable('"refs" is not a list');
  const index = refs ? refs.items.findIndex((item) => refItemKey(item) === key) : -1;

  if (rails === null) {
    if (!refs || index < 0) return;
    refs.items.splice(index, 1);
    if (refs.items.length === 0) root.delete('refs');
    return;
  }
  const railsNode = doc.createNode(rails.map(num), { flow: true }) as YAMLSeq;
  if (refs && index >= 0) {
    const item = refs.items[index] as YAMLMap;
    carryComments(item.get('rails', true) as Node | undefined, railsNode);
    item.set('rails', railsNode);
    return;
  }
  const parts = splitRefKey(key);
  if (!parts) return;
  const item = doc.createNode({
    ...(parts.name ? { name: parts.name } : {}),
    from: endForFile(parts.from),
    to: endForFile(parts.to),
  }) as YAMLMap;
  item.set('rails', railsNode);
  if (!refs) {
    refs = doc.createNode([]) as YAMLSeq;
    if (existing === undefined) insertPair(doc, root, 'refs', refs, SECTION_ORDER);
    else root.set('refs', refs);
  }
  refs.add(item);
}

/**
 * Apply diagram changes to a layout text. Returns the new text, or null when the text cannot
 * take edits right now: it has YAML syntax errors, or a section is not the collection it should be.
 */
export function applyLayoutDeltas (text: string, deltas: readonly LayoutDelta[]): string | null {
  if (deltas.length === 0) return text;
  let doc = parseDocument(text, { prettyErrors: false });
  if (doc.errors.length) return null;
  if (doc.contents === null || doc.contents === undefined) {
    // Nothing but comments or whitespace: start the document, keeping what is there.
    const head = text.trimEnd();
    doc = parseDocument(`${head}${head ? '\n' : ''}version: ${SIDECAR_VERSION}\n`, { prettyErrors: false });
  }
  const root = doc.contents;
  if (!isMap(root)) return null;
  try {
    for (const d of deltas) {
      switch (d.kind) {
        case 'position':
          if (isNoteKey(d.key)) applyNotePosition(doc, root, d.key.slice(NOTE_PREFIX.length), d.value);
          else applyTablePosition(doc, root, d.key, d.value);
          break;
        case 'group':
          applyGroup(doc, root, d.key, d.collapsed);
          break;
        case 'route':
          applyRoute(doc, root, d.key, d.rails);
          break;
        default:
          break;
      }
    }
  } catch (e) {
    if (e instanceof Uneditable) return null;
    throw e;
  }
  return doc.toString({ lineWidth: 0 });
}

/**
 * The `.dbml.yaml` layout sidecar: everything about a diagram that the DBML spec has no place
 * for, kept beside the `.dbml` file. Table positions, sticky note positions and sizes,
 * collapsed table groups, and hand-drawn relationship routes. Colors and notes stay in the DBML,
 * where the spec puts them and where dbdiagram and dbdocs read them.
 *
 * Tables and groups are nested by schema (`tables: { public: { users: {x, y} } }`); ref ends are
 * written like DBML, `table(fields)` with the schema omitted when it is the default one.
 *
 * This module holds the format's shared vocabulary and the canonical writer. Reading and
 * checking a file is `validateLayout.ts`; editing one in place is `layoutTextEdit.ts`.
 */
import { Document, isScalar, visit } from 'yaml';
import type { XY } from '@/types/diagram';
import { DEFAULT_SCHEMA, isNoteKey } from '@/diagram/keys';

/** Version of the sidecar format this build writes and reads. */
export const SIDECAR_VERSION = 1;

/** Top-level sections in the order the canonical writer emits them. */
export const SECTION_ORDER = ['version', 'tables', 'notes', 'groups', 'refs'] as const;

/** The view state that travels in a sidecar, in the layout store's key space. */
export interface LayoutSnapshot {
  /** Table keys (`schema.table`) and note keys (`note:name`) to positions; notes carry a size. */
  positions: Record<string, XY>;
  /** Group keys (`group:schema.name`). */
  collapsedGroups: string[];
  /** Ref keys (`name#from->to`) to rails (see routing.ts). */
  edgeRoutes: Record<string, number[]>;
}

export class SidecarError extends Error {}

export function dbmlFileName (base: string): string {
  return `${base}.dbml`;
}

export function sidecarFileName (base: string): string {
  return `${base}.dbml.yaml`;
}

/** A file-name-safe base taken from the DBML `Project` name, else `schema`. */
export function baseFileName (projectName: string | null | undefined): string {
  const slug = (projectName ?? '').trim().replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return slug || 'schema';
}

/** The model's ref key for a named or anonymous relationship between two `table(fields)` ends. */
export function refKeyOf (name: string | null | undefined, from: string, to: string): string {
  return `${name ?? ''}#${from}->${to}`;
}

export function splitRefKey (key: string): { name: string | null; from: string; to: string } | null {
  const hash = key.indexOf('#');
  if (hash < 0) return null;
  const rest = key.slice(hash + 1);
  const arrow = rest.indexOf('->');
  if (arrow < 0) return null;
  return {
    name: hash === 0 ? null : key.slice(0, hash),
    from: rest.slice(0, arrow),
    to: rest.slice(arrow + 2),
  };
}

export const GROUP_PREFIX = 'group:';
export const NOTE_PREFIX = 'note:';

/** YAML would print negative zero as `-0`; positions never mean that. */
export function num (n: number): number {
  return n === 0 ? 0 : n;
}

/** `schema.name` into its two parts; a bare name belongs to the default schema. */
export function splitQualified (key: string): [schema: string, name: string] {
  const dot = key.indexOf('.');
  return dot < 0 ? [DEFAULT_SCHEMA, key] : [key.slice(0, dot), key.slice(dot + 1)];
}

/** A ref end for the file: `table(fields)`, or `schema.table(fields)` outside the default schema. */
export function endForFile (part: string): string {
  const paren = part.indexOf('(');
  const table = paren < 0 ? part : part.slice(0, paren);
  const [schema, name] = splitQualified(table);
  return (schema === DEFAULT_SCHEMA ? name : `${schema}.${name}`) + (paren < 0 ? '' : part.slice(paren));
}

/** A ref end from the file back to the model's `schema.table(fields)`. */
export function endFromFile (part: string): string {
  const paren = part.indexOf('(');
  const table = paren < 0 ? part : part.slice(0, paren);
  const [schema, name] = splitQualified(table);
  return `${schema}.${name}${paren < 0 ? '' : part.slice(paren)}`;
}

/** A table or group key (`schema.name`) as the file shows it: the default schema is left out. */
export function qualifiedForFile (key: string): string {
  const [schema, name] = splitQualified(key);
  return schema === DEFAULT_SCHEMA ? name : `${schema}.${name}`;
}

/** The position entry as written to the file, without negative zeros or undefined sizes. */
export function positionForFile (p: XY, withSize: boolean): { x: number; y: number; w?: number; h?: number } {
  return {
    x: num(p.x),
    y: num(p.y),
    ...(withSize && p.w !== undefined ? { w: num(p.w) } : {}),
    ...(withSize && p.h !== undefined ? { h: num(p.h) } : {}),
  };
}

type BySchema<T> = Record<string, Record<string, T>>;

function nest<T> (into: BySchema<T>, qualified: string, value: T): void {
  const [schema, name] = splitQualified(qualified);
  (into[schema] ??= {})[name] = value;
}

/** Sort schemas and the names within each, so re-exports diff cleanly. */
function sorted<T> (by: BySchema<T>): BySchema<T> {
  const out: BySchema<T> = {};
  for (const schema of Object.keys(by).sort()) {
    const names = by[schema]!;
    out[schema] = Object.fromEntries(Object.keys(names).sort().map((n) => [n, names[n]!]));
  }
  return out;
}

/** Serialize a snapshot as the YAML sidecar for `dbmlName`. Keys are sorted so diffs stay small. */
export function serializeLayout (snap: LayoutSnapshot, dbmlName: string): string {
  const tables: BySchema<{ x: number; y: number }> = {};
  const notes: Record<string, { x: number; y: number; w?: number; h?: number }> = {};
  for (const [key, p] of Object.entries(snap.positions).sort(([a], [b]) => a.localeCompare(b))) {
    if (isNoteKey(key)) notes[key.slice(NOTE_PREFIX.length)] = positionForFile(p, true);
    else nest(tables, key, positionForFile(p, false));
  }
  const groups: BySchema<{ collapsed: true }> = {};
  for (const g of snap.collapsedGroups) {
    nest(groups, g.startsWith(GROUP_PREFIX) ? g.slice(GROUP_PREFIX.length) : g, { collapsed: true });
  }
  const refs = Object.entries(snap.edgeRoutes)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([key, rails]) => {
      const parts = splitRefKey(key);
      if (!parts) return [];
      return [{
        ...(parts.name ? { name: parts.name } : {}),
        from: endForFile(parts.from),
        to: endForFile(parts.to),
        rails: rails.map(num),
      }];
    });

  const doc = new Document({
    version: SIDECAR_VERSION,
    ...(Object.keys(tables).length ? { tables: sorted(tables) } : {}),
    ...(Object.keys(notes).length ? { notes } : {}),
    ...(Object.keys(groups).length ? { groups: sorted(groups) } : {}),
    ...(refs.length ? { refs } : {}),
  });
  doc.commentBefore = [
    ` Diagram layout for ${dbmlName}, written by DBML Designer. Keep it next to the .dbml file.`,
    ' Positions are diagram pixels. Tables and groups are listed under their schema, notes by',
    ' name. Refs name their two ends as table(fields), with the schema left out when it is the',
    ' default one, and the referenced table first; rails are the x, y, x, ... coordinates of a',
    ' hand-drawn route\'s movable segments. Edit freely: the diagram follows valid changes.',
  ].join('\n');
  // Leaf collections (a position, a rails list) read best on one line.
  visit(doc, {
    Map (_, node) {
      if (node.items.every((pair) => isScalar(pair.value))) node.flow = true;
    },
    Seq (_, node) {
      if (node.items.every((item) => isScalar(item))) node.flow = true;
    },
  });
  return doc.toString({ lineWidth: 0 });
}

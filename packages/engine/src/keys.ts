/** Schema name used by DBML when none is declared. */
export const DEFAULT_SCHEMA = 'public';

/** Stable identity of a table: `${schema}.${name}`, the schema `public` when there is none. Notes use `note:${name}`. */
export type TableKey = string;
export type FieldKey = string;
export type RefKey = string;
export type GroupKey = string;
export type NoteKey = string;
export type EnumKey = string;
export type DepKey = string;

export function normalizeSchema (schemaName: string | null | undefined): string {
  return schemaName && schemaName.length > 0 ? schemaName : DEFAULT_SCHEMA;
}

export function tableKey (schemaName: string | null | undefined, name: string): TableKey {
  return `${normalizeSchema(schemaName)}.${name}`;
}

export function fieldKey (table: TableKey, field: string): FieldKey {
  return `${table}.${field}`;
}

/** One cell of a table's grid: a field in one record, by the record's index in the table's `records`. */
export function cellKey (field: FieldKey, row: number): string {
  return `${field}[${row}]`;
}

/** The field and record of a cell key, or null for any other key. */
export function parseCellKey (key: string): { fieldKey: FieldKey; row: number } | null {
  const m = /^(.+)\[(\d+)\]$/.exec(key);
  return m ? { fieldKey: m[1]!, row: Number(m[2]) } : null;
}

export function groupKey (schemaName: string | null | undefined, name: string): GroupKey {
  return `group:${normalizeSchema(schemaName)}.${name}`;
}

export function noteKey (name: string): NoteKey {
  return `note:${name}`;
}

export function enumKey (schemaName: string | null | undefined, name: string): EnumKey {
  return `enum:${normalizeSchema(schemaName)}.${name}`;
}

export function isNoteKey (key: string): boolean {
  return key.startsWith('note:');
}

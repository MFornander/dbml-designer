/** Schema name used by DBML when none is declared. */
export const DEFAULT_SCHEMA = 'public';

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

export function groupKey (schemaName: string | null | undefined, name: string): GroupKey {
  return `group:${normalizeSchema(schemaName)}.${name}`;
}

/** Anonymous table groups get a stable name from their declaration order. */
export function groupDisplayName (name: string | null | undefined, order: number): string {
  return name && name.length > 0 ? name : `group_${order + 1}`;
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

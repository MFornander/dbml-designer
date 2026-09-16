import type { Database } from '@dbml/parse';
import {
  groupDisplayName, groupKey, noteKey, tableKey,
} from '@/diagram/keys';
import { buildDiagramModel } from '@/diagram/adapter/buildModel';

/** Every key a layout may refer to, taken from an error-free parse. */
export interface LayoutKeys {
  /** `schema.table` */
  tables: ReadonlySet<string>;
  /** `note:name` */
  notes: ReadonlySet<string>;
  /** `group:schema.name` */
  groups: ReadonlySet<string>;
  /** `name#from->to`, the diagram model's ref keys. */
  refs: ReadonlySet<string>;
}

export function layoutKeysOf (db: Database): LayoutKeys {
  const tables = new Set<string>();
  for (const t of db.tables) tables.add(tableKey(t.schemaName, t.name));
  const notes = new Set<string>();
  for (const n of db.notes) notes.add(noteKey(n.name));
  const groups = new Set<string>();
  db.tableGroups.forEach((g, i) => groups.add(groupKey(g.schemaName, groupDisplayName(g.name, i))));
  const refs = new Set(buildDiagramModel(db).refs.map((r) => r.key));
  return {
    tables,
    notes,
    groups,
    refs,
  };
}

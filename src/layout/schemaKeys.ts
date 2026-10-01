import type { Database } from '@dbml/parse';
import { groupKey, noteKey, tableKey } from '@/diagram/keys';
import { buildDiagramModel } from '@/dbml/buildModel';
import { groupDisplayName } from '@/dbml/toModel';
import type { LayoutKeys } from '@/diagram/engine/layout';

export type { LayoutKeys } from '@/diagram/engine/layout';

/** Every key a layout of this database may refer to; take it from an error-free parse. */
export function layoutKeysOf (db: Database): LayoutKeys {
  const tables = new Set<string>();
  for (const t of db.tables) tables.add(tableKey(t.schemaName, t.name));
  const notes = new Set<string>();
  for (const n of db.notes) notes.add(noteKey(n.name));
  const groups = new Set<string>();
  db.tableGroups.forEach((g, i) => groups.add(groupKey(g.schemaName, groupDisplayName(g.name, i))));
  const model = buildDiagramModel(db);
  return {
    tables,
    notes,
    groups,
    refs: new Set(model.refs.map((r) => r.key)),
    views: new Set(model.views.map((v) => v.name)),
  };
}

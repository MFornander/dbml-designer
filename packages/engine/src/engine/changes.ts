import type { DiagramModel } from '../types';

/**
 * What a model adds to the one before it, by key: new tables; new fields of tables that were
 * there; new refs; new lineage edges and column mappings, a new mapping with the edge it folds
 * into, so the edge lights up while mappings are drawn by table pair.
 */
export function addedKeys (before: DiagramModel, after: DiagramModel): Set<string> {
  const added = new Set<string>();
  for (const t of after.tables) {
    const old = before.tablesByKey.get(t.key);
    if (!old) {
      added.add(t.key);
      continue;
    }
    const fields = new Set(old.fields.map((f) => f.key));
    for (const f of t.fields) if (!fields.has(f.key)) added.add(f.key);
  }
  const refs = new Set(before.refs.map((r) => r.key));
  for (const r of after.refs) if (!refs.has(r.key)) added.add(r.key);
  const deps = new Set(before.deps.flatMap((d) => [d.key, ...d.columns.map((c) => c.key)]));
  for (const d of after.deps) {
    if (!deps.has(d.key)) added.add(d.key);
    for (const c of d.columns) {
      if (deps.has(c.key)) continue;
      added.add(c.key);
      added.add(d.key);
    }
  }
  return added;
}

import type { DiagramModel } from '../types';

/**
 * What a model adds to the one before it, by key: new tables; new fields of tables that were
 * there; new refs; new lineage edges and column mappings, a new mapping with its column pair and
 * the edge they fold into, so the curve that draws it lights up whichever way lineage is drawn.
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
  const deps = new Set(before.deps.flatMap((d) => [d.key, ...d.columns.flatMap((c) => [c.key, ...c.mappings.map((m) => m.key)])]));
  for (const d of after.deps) {
    if (!deps.has(d.key)) added.add(d.key);
    for (const c of d.columns) {
      for (const m of c.mappings) {
        if (deps.has(m.key)) continue;
        added.add(m.key);
        added.add(c.key);
        added.add(d.key);
      }
    }
  }
  return added;
}

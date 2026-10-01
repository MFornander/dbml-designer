import type { DiagramModel, Highlight } from '../types';

/** A host's highlight resolved to what the canvas draws. */
export interface Focus {
  /** Tables, fields, and edges drawn highlighted, by the keys they are drawn with. */
  lit: ReadonlySet<string>;
  /** Those drawn more strongly still. */
  accent: ReadonlySet<string>;
  /** Everything kept at full strength while the rest is dimmed; null when nothing is dimmed. */
  kept: ReadonlySet<string> | null;
}

export const NO_FOCUS: Focus = {
  lit: new Set(),
  accent: new Set(),
  kept: null,
};

/**
 * What a host's highlight lights, accents, and keeps from dimming. A mapping of one kind
 * (`…#kind`) is drawn by its column pair. Keeping a field keeps its table; keeping an edge keeps
 * the tables at its ends, and a column pair its table pair; keeping a table keeps its group;
 * keeping a group keeps its tables. Pure.
 */
export function resolveFocus (model: DiagramModel, highlight: Highlight | null): Focus {
  if (!highlight || (highlight.keys.size === 0 && !highlight.dim)) return NO_FOCUS;

  const tableOfField = new Map<string, string>();
  for (const t of model.tables) for (const f of t.fields) tableOfField.set(f.key, t.key);
  const groupOfTable = new Map<string, string>();
  for (const g of model.groups) for (const k of g.tableKeys) groupOfTable.set(k, g.key);
  /** Every drawn edge by key, and every mapping by its own key, with the key it is drawn by and the tables at its ends. */
  const edges = new Map<string, { drawn: string; pair?: string; ends: string[] }>();
  for (const r of model.refs) edges.set(r.key, { drawn: r.key, ends: r.endpoints.map((e) => e.tableKey) });
  for (const d of model.deps) {
    const ends = [d.upstream.tableKey, d.downstream.tableKey];
    edges.set(d.key, { drawn: d.key, ends });
    for (const c of d.columns) {
      const column = { drawn: c.key, pair: d.key, ends };
      edges.set(c.key, column);
      for (const m of c.mappings) edges.set(m.key, column);
    }
  }
  const groups = new Map(model.groups.map((g) => [g.key, g]));

  const drawnKey = (key: string) => edges.get(key)?.drawn ?? key;
  const lit = new Set<string>();
  const kept = new Set<string>();
  const keepTable = (key: string) => {
    kept.add(key);
    const g = groupOfTable.get(key);
    if (g) kept.add(g);
  };
  for (const key of highlight.keys) {
    const edge = edges.get(key);
    if (edge) {
      lit.add(edge.drawn);
      kept.add(edge.drawn);
      if (edge.pair) kept.add(edge.pair);
      edge.ends.forEach(keepTable);
      continue;
    }
    const table = tableOfField.get(key);
    if (table) {
      lit.add(key);
      kept.add(key);
      keepTable(table);
      continue;
    }
    if (model.tablesByKey.has(key)) {
      lit.add(key);
      keepTable(key);
      continue;
    }
    const group = groups.get(key);
    if (group) {
      kept.add(key);
      group.tableKeys.forEach(keepTable);
      continue;
    }
    kept.add(key);
  }
  return {
    lit,
    accent: new Set([...highlight.accent].map(drawnKey)),
    kept: highlight.dim ? kept : null,
  };
}

/** Whether an element is dimmed by a focus. */
export function isDimmed (focus: Focus, key: string): boolean {
  return focus.kept !== null && !focus.kept.has(key);
}

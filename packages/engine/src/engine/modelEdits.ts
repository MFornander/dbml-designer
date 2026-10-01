/**
 * Small additions to a model, for a host that grows its diagram a little at a time. Each returns a
 * new model and leaves the one given alone.
 */
import { tableKey } from '../keys';
import type {
  Model, ModelDep, ModelRecord, ModelTable,
} from '../model';

const keyOf = (t: ModelTable) => tableKey(t.schema, t.name);

/** Tables added, or replacing those with the same key where they stand. */
export function withTables (m: Model, tables: readonly ModelTable[]): Model {
  const byKey = new Map(tables.map((t) => [keyOf(t), t]));
  const known = new Set(m.tables.map(keyOf));
  return {
    ...m,
    tables: [...m.tables.map((t) => byKey.get(keyOf(t)) ?? t), ...tables.filter((t) => !known.has(keyOf(t)))],
  };
}

/** Lineage edges added. */
export function withEdges (m: Model, deps: readonly ModelDep[]): Model {
  return {
    ...m,
    deps: [...m.deps ?? [], ...deps],
  };
}

/** A table's rows replaced, the table found by key; the model as it was when there is no such table. */
export function withRows (m: Model, table: string, rows: readonly ModelRecord[]): Model {
  return {
    ...m,
    tables: m.tables.map((t) => (keyOf(t) === table
      ? {
          ...t,
          records: [...rows],
        }
      : t)),
  };
}

/** Tables added to a named view by key, the view created when there is none. */
export function withViewTables (m: Model, name: string, tables: readonly string[]): Model {
  const views = m.views ?? [];
  const view = views.find((v) => v.name === name);
  return {
    ...m,
    views: view
      ? views.map((v) => (v === view
          ? {
              ...v,
              tables: [...new Set([...v.tables ?? [], ...tables])],
            }
          : v))
      : [...views, {
          name,
          tables: [...tables],
        }],
  };
}

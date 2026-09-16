import {
  getMultiplicities,
  type Column, type Database, type Ref, type Table,
} from '@dbml/parse';
import type { ModelDiagnostic } from '../types';
import { tableKey, type TableKey } from '../keys';
import { toTokenRange } from './token';

export interface ExpandedDatabase {
  tables: Table[];
  /** Refs derived from inline refs on fields injected by table partials. */
  extraRefs: Ref[];
  /** Which fields came from which partial, keyed by table key then field name. */
  injected: Map<TableKey, Map<string, string>>;
  diagnostics: ModelDiagnostic[];
}

/**
 * Splice `TablePartial` fields into the tables that inject them, following the
 * same precedence rules as @dbml/core: a table's own fields win over partial
 * fields with the same name, and a later injection wins over an earlier one.
 * Never mutates the input.
 */
export function expandPartials (raw: Database): ExpandedDatabase {
  const partialsByName = new Map((raw.tablePartials ?? []).map((p) => [p.name, p]));
  const extraRefs: Ref[] = [];
  const injected = new Map<TableKey, Map<string, string>>();
  const diagnostics: ModelDiagnostic[] = [];

  const tables = (raw.tables ?? []).map((t): Table => {
    const injections = t.partials ?? [];
    if (injections.length === 0) return t;

    const slots: (Column | null)[] = [...t.fields];
    const existing = new Set(t.fields.map((f) => f.name));
    const origin = new Map<string, string>();
    // Descending order: later injections are resolved first and take precedence.
    const sorted = [...injections].sort((a, b) => b.order - a.order);
    // Placeholders are inserted in ascending order so each `order` lands on its own slot.
    [...sorted].reverse().forEach((p) => slots.splice(Math.min(p.order, slots.length), 0, null));

    let note = t.note;
    let headerColor = t.headerColor;

    for (const injection of sorted) {
      const slot = Math.min(injection.order, slots.length - 1);
      const partial = partialsByName.get(injection.name);
      if (!partial) {
        diagnostics.push({
          kind: 'unresolved-partial',
          message: `Table partial "${injection.name}" not found`,
          token: toTokenRange(injection.token),
        });
        slots.splice(slot, 1);
        continue;
      }

      const fields: Column[] = [];
      for (const f of partial.fields ?? []) {
        if (existing.has(f.name)) continue;
        existing.add(f.name);
        origin.set(f.name, partial.name);
        fields.push(f);
        for (const iref of f.inline_refs ?? []) {
          const [here, there] = getMultiplicities(iref.relation) ?? ['*', '*'];
          extraRefs.push({
            schemaName: t.schemaName,
            name: null,
            endpoints: [
              {
                schemaName: t.schemaName,
                tableName: t.name,
                fieldNames: [f.name],
                relation: here,
                token: f.token,
              },
              {
                schemaName: iref.schemaName,
                tableName: iref.tableName,
                fieldNames: iref.fieldNames,
                relation: there,
                token: iref.token,
              },
            ],
            token: f.token,
          });
        }
      }
      slots.splice(slot, 1, ...fields);

      if (!note && partial.note) note = partial.note;
      if (!headerColor && partial.headerColor) headerColor = partial.headerColor;
    }

    if (origin.size > 0) injected.set(tableKey(t.schemaName, t.name), origin);

    return {
      ...t,
      fields: slots.filter((f): f is Column => f !== null),
      ...(note ? { note } : {}),
      ...(headerColor ? { headerColor } : {}),
    };
  });

  return {
    tables,
    extraRefs,
    injected,
    diagnostics,
  };
}

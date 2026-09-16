import type { DiagramModel, RefEndpointVM, RefVM } from '@/diagram/types';
import { DEFAULT_SCHEMA } from '@/diagram/keys';

/** Bare identifiers stay as they are; anything else is double-quoted. */
export function quoteIdentifier (name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `"${name.replace(/"/g, '\\"')}"`;
}

function endpointText (model: DiagramModel, ep: RefEndpointVM): string {
  const t = model.tablesByKey.get(ep.tableKey);
  const table = t
    ? [t.schema === DEFAULT_SCHEMA ? null : t.schema, t.name].filter((s): s is string => !!s).map(quoteIdentifier).join('.')
    : ep.tableKey;
  const fields = ep.fieldNames.map(quoteIdentifier);
  return `${table}.${fields.length === 1 ? fields[0] : `(${fields.join(', ')})`}`;
}

/**
 * The body of a `Ref:` declaration for a relationship, in the model's endpoint order, for
 * example `users.id < posts.user_id`. The operator follows the cardinalities: `>` many to one,
 * `<` one to many, `-` one to one, `<>` many to many.
 */
export function relationshipText (model: DiagramModel, ref: RefVM): string {
  const many = (ep: RefEndpointVM) => ep.cardinality.includes('*');
  const [a, b] = ref.endpoints;
  const op = many(a) ? (many(b) ? '<>' : '>') : (many(b) ? '<' : '-');
  return `${endpointText(model, a)} ${op} ${endpointText(model, b)}`;
}

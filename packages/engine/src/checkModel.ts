import { MODEL_SCHEMA } from './modelSchema';
import type { Model } from './model';

export interface ModelProblem {
  /** Where in the JSON, for example `['tables', 2, 'fields']`. */
  path: (string | number)[];
  message: string;
  /** An error leaves the model unfit to draw; a warning is something the engine ignores. */
  severity: 'error' | 'warning';
}

interface Schema {
  type?: string | readonly string[];
  required?: readonly string[];
  properties?: Readonly<Record<string, Schema>>;
  items?: Schema;
  additionalProperties?: boolean | Schema;
  pattern?: string;
  $ref?: string;
}

const DEFINITIONS = MODEL_SCHEMA.definitions as unknown as Readonly<Record<string, Schema>>;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const article = (type: string) => (type === 'object' || type === 'array' ? 'an' : 'a');

/** The JSON Schema type of a value. */
function jsonType (v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function check (value: unknown, schema: Schema, path: (string | number)[], out: ModelProblem[]): void {
  if (schema.$ref) {
    check(value, DEFINITIONS[schema.$ref.split('/').pop()!]!, path, out);
    return;
  }
  // Containers and text are what drawing relies on; a wrong flag or an odd pattern is only ignored.
  const fail = (message: string, severity: ModelProblem['severity'] = 'error') => out.push({
    path,
    message,
    severity,
  });
  // A choice of plain types, as a record's values have: anything else is drawn as text.
  if (Array.isArray(schema.type)) {
    if (!schema.type.includes(jsonType(value))) fail(`Expected ${schema.type.join(', ')}`, 'warning');
    return;
  }
  switch (schema.type) {
    case 'object': {
      if (!isObject(value)) {
        fail('Expected an object');
        return;
      }
      for (const key of schema.required ?? []) {
        if (!(key in value)) {
          out.push({
            path,
            message: `Missing "${key}"`,
            severity: 'error',
          });
        }
      }
      for (const [key, v] of Object.entries(value)) {
        const property = schema.properties?.[key];
        if (property) {
          check(v, property, [...path, key], out);
        } else if (typeof schema.additionalProperties === 'object') {
          check(v, schema.additionalProperties, [...path, key], out);
        } else if (schema.additionalProperties === false) {
          out.push({
            path: [...path, key],
            message: `Unknown property "${key}"`,
            severity: 'warning',
          });
        }
      }
      return;
    }
    case 'array':
      if (!Array.isArray(value)) {
        fail('Expected an array');
        return;
      }
      if (schema.items) value.forEach((item, i) => check(item, schema.items!, [...path, i], out));
      return;
    case 'string':
      if (typeof value !== 'string') fail(`Expected ${article('string')} string`);
      else if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail(`"${value}" is not a valid value here`, 'warning');
      return;
    case 'boolean':
      if (typeof value !== 'boolean') fail('Expected true or false', 'warning');
      return;
    default:
  }
}

/**
 * Check JSON a host received, from a file or the network, before handing it to the engine: the
 * shapes `MODEL_SCHEMA` describes, each problem with its path. Draw the model only when there is no
 * error; it may still name tables or fields that are not there, which `fromModel` leaves out and
 * reports as diagnostics.
 */
export function checkModel (value: unknown): ModelProblem[] {
  const out: ModelProblem[] = [];
  check(value, MODEL_SCHEMA as unknown as Schema, [], out);
  return out;
}

/** The value as a model when `checkModel` finds no error in it, else null. */
export function asModel (value: unknown): Model | null {
  return checkModel(value).some((p) => p.severity === 'error') ? null : value as Model;
}

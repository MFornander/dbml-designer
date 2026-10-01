import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import { MODEL_SCHEMA } from '../modelSchema';
import { asModel, checkModel } from '../checkModel';
import type { Model } from '../model';

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(MODEL_SCHEMA);

/** Every kind of element, every optional property set once. */
const FULL: Model = {
  project: {
    name: 'shop',
    databaseType: 'PostgreSQL',
    note: 'An example',
  },
  tables: [
    {
      schema: 'sales',
      name: 'orders',
      alias: 'O',
      headerColor: '#24BAB1',
      note: 'One row per order',
      metadata: { owner: 'sales' },
      fields: [
        {
          name: 'id',
          type: 'int',
          pk: true,
          increment: true,
        },
        {
          name: 'state',
          type: 'status',
          notNull: true,
          unique: false,
          default: '\'open\'',
          note: 'Where it is',
          enum: 'sales.status',
          checks: ['state <> \'\''],
          metadata: { lane: 'ops' },
          injectedFrom: 'stamped',
          source: { line: 3 },
        },
      ],
      indexes: [{
        columns: ['id', 'state'],
        unique: true,
        pk: false,
        type: 'btree',
        name: 'by_state',
        note: 'Lookups',
      }],
      checks: ['positive: id > 0'],
      partials: [{
        name: 'stamped',
        keyColumns: ['id'],
        note: 'Timestamps',
      }],
      source: 'orders',
    },
    {
      name: 'users',
      fields: [{
        name: 'id',
        type: 'int',
      }],
    },
  ],
  refs: [{
    name: 'buyer',
    from: {
      table: 'sales.orders',
      fields: ['id'],
      cardinality: '*',
    },
    to: {
      table: 'public.users',
      fields: ['id'],
      cardinality: '0..1',
    },
    color: '#f00',
    inactive: true,
    onDelete: 'cascade',
    onUpdate: 'restrict',
    viaPartial: 'stamped',
  }],
  deps: [{
    from: { table: 'public.users' },
    to: {
      table: 'sales.orders',
      fields: ['id'],
    },
    name: 'fill',
    color: '#0f0',
    note: 'Nightly',
    metadata: { impl: 'sql' },
  }],
  groups: [{
    schema: 'sales',
    name: 'core',
    color: '#00f',
    tables: ['sales.orders'],
    note: 'The core',
    metadata: { stage: '1' },
  }],
  notes: [{
    name: 'tips',
    content: '# Read me',
    color: '#FFE28B',
  }],
  views: [{
    name: 'focus',
    tables: ['sales.orders'],
    groups: ['sales.core'],
    schemas: ['sales'],
    notes: ['tips'],
  }],
  enums: [{
    schema: 'sales',
    name: 'status',
    values: [{ name: 'open' }, {
      name: 'closed',
      note: 'Done',
    }],
  }],
};

describe('MODEL_SCHEMA', () => {
  it('accepts a model that uses every property', () => {
    expect(validate(FULL), JSON.stringify(validate.errors)).toBe(true);
    expect(checkModel(FULL)).toEqual([]);
    expect(asModel(FULL)).toBe(FULL);
  });

  it('accepts the smallest model', () => {
    expect(validate({ tables: [] })).toBe(true);
    expect(checkModel({ tables: [] })).toEqual([]);
  });

  it('rejects what checkModel rejects, and checkModel says where', () => {
    const cases: [unknown, { path: (string | number)[]; severity: string }[]][] = [
      [[], [{
        path: [],
        severity: 'error',
      }]],
      [{}, [{
        path: [],
        severity: 'error',
      }]],
      [{ tables: [{ name: 'a' }] }, [{
        path: ['tables', 0],
        severity: 'error',
      }]],
      [{
        tables: [{
          name: 'a',
          fields: [{
            name: 'id',
            type: 1,
          }],
        }],
      }, [{
        path: ['tables', 0, 'fields', 0, 'type'],
        severity: 'error',
      }]],
      [{
        tables: [],
        refs: [{
          from: { table: 'a' },
          to: { table: 'b' },
          colour: '#fff',
        }],
      }, [{
        path: ['refs', 0, 'colour'],
        severity: 'warning',
      }]],
      [{
        tables: [],
        refs: [{
          from: {
            table: 'a',
            cardinality: 'many',
          },
          to: { table: 'b' },
        }],
      }, [{
        path: ['refs', 0, 'from', 'cardinality'],
        severity: 'warning',
      }]],
      [{
        tables: [],
        groups: [{
          name: 'g',
          tables: 'a',
        }],
      }, [{
        path: ['groups', 0, 'tables'],
        severity: 'error',
      }]],
    ];
    for (const [value, expected] of cases) {
      expect(validate(value), JSON.stringify(value)).toBe(false);
      expect(checkModel(value).map((p) => ({
        path: p.path,
        severity: p.severity,
      })), JSON.stringify(value)).toEqual(expected);
    }
    expect(asModel({ tables: [{ name: 'a' }] })).toBeNull();
    // Warnings alone leave the model fit to draw.
    expect(asModel({
      tables: [],
      extra: true,
    })).not.toBeNull();
  });
});

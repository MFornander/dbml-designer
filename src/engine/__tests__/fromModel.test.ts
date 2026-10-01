import { describe, it, expect } from 'vitest';
import { fromModel } from '../fromModel';
import type { Model } from '../model';
import { isManySide, isOneSide, parseMultiplicity } from '../multiplicity';

/** A trace written by hand, the way a program that knows no DBML would send it. */
const TRACE: Model = {
  tables: [
    {
      schema: 'spec',
      name: 'order_line',
      headerColor: '#24bab1',
      fields: [
        {
          name: 'line_id',
          type: 'int',
          pk: true,
        },
        {
          name: 'item_id',
          type: 'int',
          source: { line: 3 },
        },
        {
          name: 'quantity',
          type: 'int',
        },
      ],
      source: 'order_line in my program',
    },
    {
      schema: 'input',
      name: 'item',
      fields: [
        {
          name: 'item_id',
          type: 'int',
        },
        {
          name: 'unit_cost',
          type: 'decimal(10,2)',
        },
        {
          name: 'status',
          type: 'item_status',
          enum: 'input.item_status',
        },
      ],
      indexes: [{
        columns: ['item_id'],
        pk: true,
      }],
    },
    {
      schema: 'money',
      name: 'line_price',
      fields: [
        {
          name: 'line_id',
          type: 'int',
        },
        {
          name: 'price',
          type: 'decimal(10,2)',
        },
      ],
    },
  ],
  refs: [{
    from: {
      table: 'spec.order_line',
      fields: ['item_id'],
      cardinality: '*',
    },
    to: {
      table: 'input.item',
      fields: ['item_id'],
    },
  }],
  deps: [
    {
      from: {
        table: 'spec.order_line',
        fields: ['quantity'],
      },
      to: {
        table: 'money.line_price',
        fields: ['price'],
      },
      name: 'value',
    },
    {
      from: {
        table: 'spec.order_line',
        fields: ['item_id'],
      },
      to: {
        table: 'money.line_price',
        fields: ['price'],
      },
      name: 'row',
      color: '#f00',
    },
    {
      from: {
        table: 'input.item',
        fields: ['unit_cost'],
      },
      to: {
        table: 'money.line_price',
        fields: ['price'],
      },
    },
  ],
  groups: [
    {
      name: 'inputs',
      color: '#8F8DD8',
      tables: ['spec.order_line', 'input.item'],
    },
    {
      name: 'also_inputs',
      tables: ['input.item'],
    },
  ],
  notes: [{
    name: 'why',
    content: 'How the price of line 1 came about',
  }],
  views: [{
    name: 'trace',
    groups: ['inputs'],
    tables: ['money.line_price'],
  }],
  enums: [{
    schema: 'input',
    name: 'item_status',
    values: [{ name: 'active' }, {
      name: 'retired',
      note: 'no longer sold',
    }],
  }],
};

describe('fromModel', () => {
  it('returns an empty diagram for no model', () => {
    const m = fromModel(undefined);
    expect(m.tables).toEqual([]);
    expect(m.diagnostics).toEqual([]);
  });

  it('builds tables with keys, display names, colors, and lookups from a model without DBML', () => {
    const m = fromModel(TRACE);
    expect(m.tables.map((t) => [t.key, t.displayName, t.order])).toEqual([
      ['spec.order_line', 'spec.order_line', 0],
      ['input.item', 'input.item', 1],
      ['money.line_price', 'money.line_price', 2],
    ]);
    const line = m.tablesByKey.get('spec.order_line')!;
    expect(line.headerColor).toBe('#24BAB1');
    expect(line.source).toBe('order_line in my program');
    expect(line.fields[1]).toMatchObject({
      key: 'spec.order_line.item_id',
      typeText: 'int',
      hasRef: true,
      hasDep: true,
      source: { line: 3 },
    });
    expect(line.fieldIndexByName.get('quantity')).toBe(2);
    const item = m.tablesByKey.get('input.item')!;
    expect(item.fields[0]!.compositePk).toBe(true);
    expect(item.fields[2]!.enumKey).toBe('enum:input.item_status');
    expect(m.enums.get('enum:input.item_status')!.values[1]).toEqual({
      name: 'retired',
      note: 'no longer sold',
    });
  });

  it('puts a table in the first group that lists it and gives it that group color', () => {
    const m = fromModel(TRACE);
    expect(m.groups.map((g) => [g.key, g.tableKeys])).toEqual([
      ['group:public.inputs', ['spec.order_line', 'input.item']],
      ['group:public.also_inputs', []],
    ]);
    expect(m.tablesByKey.get('input.item')!.groupColor).toBe('#8F8DD8');
  });

  it('reads cardinalities, defaulting to one, and colors a ref from its one side', () => {
    const m = fromModel(TRACE);
    const [ref] = m.refs;
    expect(ref!.key).toBe('#spec.order_line(item_id)->input.item(item_id)');
    expect(ref!.endpoints.map((e) => [e.cardinality, e.marker])).toEqual([['*', 'some'], ['1', 'one']]);
    // input.item has no header color of its own and takes its group's.
    expect(ref!.lineColor).toBe('#8F8DD8');
    expect(m.refsByField.get('input.item.item_id')).toEqual([ref!.key]);
  });

  it('folds every dep between two tables into one edge that keeps the column mappings', () => {
    const m = fromModel(TRACE);
    expect(m.deps.map((d) => [d.key, d.label, d.color])).toEqual([
      ['dep:spec.order_line->money.line_price', 'value, row', '#FF0000'],
      ['dep:input.item->money.line_price', null, null],
    ]);
    expect(m.deps[0]!.columns.map((c) => [c.key, c.label, c.color])).toEqual([
      ['dep:spec.order_line(quantity)->money.line_price(price)', 'value', '#FF0000'],
      ['dep:spec.order_line(item_id)->money.line_price(price)', 'row', '#FF0000'],
    ]);
    expect(m.depsByField.get('money.line_price.price')).toHaveLength(3);
  });

  it('resolves views to the tables, groups, and notes they show', () => {
    const [view] = fromModel(TRACE).views;
    expect(view).toMatchObject({
      key: 'view:trace',
      tableKeys: ['money.line_price'],
      groupKeys: ['group:public.inputs'],
      filtersTables: true,
      filtersNotes: false,
    });
  });

  it('draws partial refs as badges for the partials a table injects, in injection order', () => {
    const m = fromModel({
      tables: [
        {
          name: 'site',
          fields: [{
            name: 'config_id',
            type: 'int',
            injectedFrom: 'per_config',
          }],
          partials: [{ name: 'stamped' }, {
            name: 'per_config',
            keyColumns: ['config_id'],
          }],
        },
        {
          name: 'config',
          fields: [{
            name: 'config_id',
            type: 'int',
          }],
        },
      ],
      refs: [{
        from: {
          table: 'public.site',
          fields: ['config_id'],
          cardinality: '*',
        },
        to: {
          table: 'public.config',
          fields: ['config_id'],
        },
        viaPartial: 'per_config',
      }],
    });
    expect(m.tablesByKey.get('public.site')!.partialRefs).toEqual([{
      partial: 'per_config',
      refKeys: ['#public.site(config_id)->public.config(config_id)'],
      keyColumns: ['config_id'],
    }]);
  });

  it('leaves out what names something missing or repeats, and reports it with its source', () => {
    const m = fromModel({
      tables: [
        {
          name: 'a',
          fields: [{
            name: 'id',
            type: 'int',
          }],
        },
        {
          name: 'a',
          fields: [],
          source: 'second a',
        },
      ],
      refs: [
        {
          from: { table: 'public.a' },
          to: { table: 'public.b' },
          source: 'ref to b',
        },
        {
          from: {
            table: 'public.a',
            fields: ['nope'],
          },
          to: { table: 'public.a' },
        },
        {
          from: { table: 'public.a' },
          to: { table: 'public.a' },
        },
        {
          from: { table: 'public.a' },
          to: { table: 'public.a' },
          source: 'again',
        },
      ],
      deps: [{
        from: { table: 'public.a' },
        to: { table: 'public.c' },
      }],
      groups: [{
        name: 'g',
        tables: ['public.z'],
      }],
      views: [{
        name: 'v',
        notes: ['missing'],
      }],
    });
    expect(m.tables).toHaveLength(1);
    expect(m.refs).toHaveLength(1);
    expect(m.diagnostics).toEqual([
      {
        kind: 'duplicate-table',
        message: 'Duplicate table "public.a"',
        source: 'second a',
      },
      {
        kind: 'unresolved-group-member',
        message: 'Table "public.z" in group "g" not found',
      },
      {
        kind: 'unresolved-ref',
        message: 'Table "public.b" not found',
        source: 'ref to b',
      },
      {
        kind: 'unresolved-ref',
        message: 'Column "nope" not found in table "a"',
      },
      {
        kind: 'duplicate-ref',
        message: 'Duplicate relationship between public.a() and public.a()',
        source: 'again',
      },
      {
        kind: 'unresolved-dep',
        message: 'Table "public.c" not found',
      },
      {
        kind: 'unresolved-view-entity',
        message: 'Note "missing" in view "v" not found',
      },
    ]);
  });

  it('takes the model as plain data: a JSON round trip draws the same diagram', () => {
    const roundTripped = JSON.parse(JSON.stringify(TRACE)) as Model;
    expect(fromModel(roundTripped)).toEqual(fromModel(TRACE));
  });
});

describe('multiplicity', () => {
  it('reads single values, ranges, and the star', () => {
    expect(parseMultiplicity('1')).toEqual({
      min: 1,
      max: 1,
    });
    expect(parseMultiplicity('*')).toEqual({
      min: 1,
      max: '*',
    });
    expect(parseMultiplicity('0..*')).toEqual({
      min: 0,
      max: '*',
    });
    expect(parseMultiplicity('2..5')).toEqual({
      min: 2,
      max: 5,
    });
    expect([isOneSide('0..1'), isOneSide('*'), isManySide('0..*'), isManySide('2..5')]).toEqual([true, false, true, false]);
  });
});

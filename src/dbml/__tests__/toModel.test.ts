import { describe, it, expect } from 'vitest';
import { toModel } from '@/dbml/toModel';
import { tokenOf } from '@/dbml/token';
import { fromModel } from '@/engine/core';
import { compile } from '@/dbml/__tests__/testUtils';

const DBML = `
Enum sales.status {
  open
  closed [note: 'done']
}

TablePartial stamped [headercolor: #24BAB1] {
  created_at timestamp [default: \`now()\`]
}

Table users as U {
  id int [pk]
  email varchar(255) [unique, not null]
}

Table sales.orders {
  id int
  user_id int [ref: > U.id]
  state status
  ~stamped
  indexes {
    (id, user_id) [pk]
  }
}

TableGroup shop [color: #8F8DD8] {
  users
  sales.orders
}

Dep fill [color: #f00] {
  users.id -> sales.orders.user_id
  users.email -> sales.orders.state
  Note: 'nightly'
}

Note tips {
  'Read me'
}

DiagramView focus {
  tablegroups {
    shop
  }
  notes {
    tips
  }
}
`;

describe('toModel', () => {
  const { model, diagnostics } = toModel(compile(DBML));

  it('writes tables with the default schema left out, partials spliced in, and enum types recognized', () => {
    expect(diagnostics).toEqual([]);
    expect(model.tables.map((t) => [t.schema, t.name, t.alias])).toEqual([[undefined, 'users', 'U'], ['sales', 'orders', undefined]]);
    const orders = model.tables[1]!;
    expect(orders.headerColor).toBe('#24BAB1');
    expect(orders.fields.map((f) => [f.name, f.type, f.default, f.enum, f.injectedFrom])).toEqual([
      ['id', 'int', undefined, undefined, undefined],
      ['user_id', 'int', undefined, undefined, undefined],
      ['state', 'status', undefined, 'sales.status', undefined],
      ['created_at', 'timestamp', '`now()`', undefined, 'stamped'],
    ]);
    expect(orders.indexes).toEqual([{
      columns: ['id', 'user_id'],
      pk: true,
    }]);
    expect(orders.partials).toEqual([{
      name: 'stamped',
      keyColumns: [],
    }]);
    expect(model.enums).toEqual([{
      schema: 'sales',
      name: 'status',
      values: [{ name: 'open' }, {
        name: 'closed',
        note: 'done',
      }],
    }]);
  });

  it('resolves refs, groups, and views to keys, and gives each Dep edge its block settings', () => {
    expect(model.refs?.map((r) => [r.from, r.to])).toEqual([[
      {
        table: 'public.users',
        fields: ['id'],
        cardinality: '1',
      },
      {
        table: 'sales.orders',
        fields: ['user_id'],
        cardinality: '*',
      },
    ]]);
    expect(model.groups?.map((g) => [g.name, g.color, g.tables])).toEqual([['shop', '#8F8DD8', ['public.users', 'sales.orders']]]);
    expect(model.deps?.map((d) => [d.from.fields, d.to.fields, d.name, d.color, d.note])).toEqual([
      [['id'], ['user_id'], 'fill', '#f00', 'nightly'],
      [['email'], ['state'], 'fill', '#f00', 'nightly'],
    ]);
    expect(model.views?.map((v) => [v.name, v.groups, v.notes, v.tables])).toEqual([['focus', ['public.shop'], ['tips'], undefined]]);
  });

  it('keeps each element\'s place in the text as its source', () => {
    expect(tokenOf(model.tables[0]!.source)?.start.line).toBe(11);
    expect(tokenOf(model.refs![0]!.source)?.start.line).toBe(18);
  });

  it('is plain data that draws the same diagram after a JSON round trip', () => {
    expect(fromModel(JSON.parse(JSON.stringify(model)))).toEqual(fromModel(model));
  });

  it('reports what cannot be resolved and leaves it out', () => {
    const r = toModel(compile('Table a { id int }\nTableGroup g { a }\nDiagramView v { Tables { a } }\n'));
    expect(r.diagnostics).toEqual([]);
    expect(toModel(undefined)).toEqual({
      model: { tables: [] },
      diagnostics: [],
    });
  });
});

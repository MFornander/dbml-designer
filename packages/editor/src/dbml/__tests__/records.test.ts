import { describe, it, expect } from 'vitest';
import {
  Compiler, Filepath, MemoryProjectLayout, type Database,
} from '@dbml/parse';
import { buildDiagramModel } from '@/dbml/buildModel';
import { toModel } from '@/dbml/toModel';
import { modelOf, formatModelText } from '@/cli/lib';
import { compile } from './testUtils';
import TRACE from '@/sample/trace.dbml?raw';

describe('records from DBML', () => {
  it('put the trace\'s values on its fields: price reads 60', () => {
    const m = buildDiagramModel(compile(TRACE));
    const price = m.tablesByKey.get('money.line_price')!;
    expect(price.fields.map((f) => [f.name, f.value])).toEqual([['line_id', 'L1'], ['price', 60]]);
    expect(m.tablesByKey.get('spec.order_line')!.fields.map((f) => f.value)).toEqual(['L1', 'widget', 'standard', 4]);
    expect(m.tablesByKey.get('input.markup')!.fields[1]!.value).toBe(0.2);
  });

  it('keep several rows, nulls, and fields a record leaves out', () => {
    const { model } = toModel(compile([
      'Table t {',
      '  id int [pk]',
      '  name text',
      '  at timestamp',
      '}',
      'records t(id, name) {',
      '  1, \'one\'',
      '  2, null',
      '  3, \'three\'',
      '}',
      '',
    ].join('\n')));
    expect(model.tables[0]!.records).toEqual([
      {
        id: 1,
        name: 'one',
      },
      {
        id: 2,
        name: null,
      },
      {
        id: 3,
        name: 'three',
      },
    ]);
    const m = buildDiagramModel(compile('Table u {\n  id int\n  d date\n}\nrecords u(id, d) {\n  1, \'2026-03-04\'\n}\n'));
    expect(m.tables[0]!.fields.map((f) => f.value)).toEqual([1, '2026-03-04']);
  });

  it('come along with a table imported with use', () => {
    const layout = new MemoryProjectLayout();
    const main = Filepath.from('/proj/main.dbml');
    layout.setSource(Filepath.from('/proj/shared.dbml'), 'Table config {\n  config_id text [pk]\n  cores int\n}\nrecords config(config_id, cores) {\n  \'c1\', 64\n}\n');
    layout.setSource(main, 'use { table config } from \'./shared\'\n\nTable site {\n  id int [pk]\n}\n');
    const report = new Compiler(layout).interpretFile(main);
    expect(report.getErrors()).toEqual([]);
    const m = buildDiagramModel(report.getValue() as Database);
    expect(m.tablesByKey.get('public.config')!.fields.map((f) => f.value)).toEqual(['c1', 64]);
  });

  it('are listed by graph', () => {
    const { model } = modelOf(TRACE);
    expect(model!.tables.find((t) => t.name === 'line_price')!.records).toEqual([{
      line_id: 'L1',
      price: 60,
    }]);
    expect(formatModelText(model!)).toContain('RECORDS\n  input.item  (1 row)\n    item_id="widget", unit_cost=12.5\n');
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fromModel, type Model } from '@dbml-designer/engine/core';
import { modelOf } from '@/cli/lib';
import { buildDiagramModel } from '@/dbml/buildModel';
import { compile } from '@/dbml/__tests__/testUtils';
import { applyTextEdits } from '@/editor/colorEdit';
import { parseLayout, serializeLayout } from '@/layout';
import {
  locateInModelFile, modelFileText, readModelDocument, setAtPath, splitModelFile, withModelLayout,
} from '@/model/modelFile';
import { joinDocument, languageOf, splitDocument } from '@/model/documentFormat';

const MODEL: Model = {
  tables: [
    {
      name: 'users',
      fields: [{
        name: 'id',
        type: 'int',
        pk: true,
      }],
    },
    {
      schema: 'sales',
      name: 'orders',
      fields: [{
        name: 'id',
        type: 'int',
      }, {
        name: 'user_id',
        type: 'int',
      }],
    },
  ],
  refs: [{
    from: {
      table: 'sales.orders',
      fields: ['user_id'],
      cardinality: '*',
    },
    to: {
      table: 'public.users',
      fields: ['id'],
    },
  }],
};

const LAYOUT = serializeLayout({
  positions: {
    'public.users': {
      x: 0,
      y: 0,
    },
    'sales.orders': {
      x: 320,
      y: 0,
    },
  },
  collapsedGroups: [],
  edgeRoutes: {},
});

/** Strip sources, Maps included, to compare what two diagrams draw. */
function withoutSource (v: unknown): unknown {
  if (v instanceof Map) return new Map([...v].map(([k, x]) => [k, withoutSource(x)]));
  if (Array.isArray(v)) return v.map(withoutSource);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'source').map(([k, x]) => [k, withoutSource(x)]));
  }
  return v;
}

describe('model files', () => {
  it('lift the layout out of the text and put it back as JSON, leaving the rest as it was', () => {
    const body = modelFileText(MODEL);
    const file = withModelLayout(body, LAYOUT);
    expect(JSON.parse(file).layout.views.default.tables.sales.orders).toEqual({
      x: 320,
      y: 0,
    });
    const split = splitModelFile(file);
    expect(split.body).toBe(body);
    expect(parseLayout(split.layout!)).toEqual(parseLayout(LAYOUT));
    // Saving again replaces the layout rather than adding a second one.
    expect(withModelLayout(file, LAYOUT)).toBe(file);
    // Text that is not a JSON object is left alone.
    expect(withModelLayout('{ "version": 1, ', LAYOUT)).toBe('{ "version": 1, ');
    expect(splitModelFile('not json')).toEqual({
      body: 'not json',
      layout: null,
    });
  });

  it('are told apart from DBML by name, and split and joined accordingly', () => {
    expect([languageOf('trace.json'), languageOf('trace.JSON'), languageOf('schema.dbml'), languageOf('example')]).toEqual(['json', 'json', 'dbml', 'dbml']);
    const file = joinDocument(modelFileText(MODEL), LAYOUT, 'json');
    expect(splitDocument(file, 'json').body).toBe(modelFileText(MODEL));
    const dbml = joinDocument('Table a {\n  id int\n}\n', LAYOUT, 'dbml');
    expect(dbml).toContain('/* === DBML DESIGNER FOOTER ===');
    expect(splitDocument(dbml, 'dbml').body).toBe('Table a {\n  id int\n}');
  });

  it('read into a model whose elements are sourced by where they sit in the JSON', () => {
    const text = modelFileText(MODEL);
    const doc = readModelDocument(text);
    expect(doc.errors).toEqual([]);
    expect(doc.warnings).toEqual([]);
    expect(doc.model!.tables[1]!.source).toEqual({ jsonPath: ['model', 'tables', 1] });
    expect(doc.model!.tables[1]!.fields[1]!.source).toEqual({ jsonPath: ['model', 'tables', 1, 'fields', 1] });
    expect(doc.model!.refs![0]!.source).toEqual({ jsonPath: ['model', 'refs', 0] });
    const at = locateInModelFile(text, doc.model!.tables[1]!.source)!;
    expect(text.split('\n')[at.start.line - 1]!.trim()).toBe('{');
    expect(text.split('\n')[at.start.line]!.trim()).toBe('"schema": "sales",');
  });

  it('report JSON, shape, and reference problems where they are, and draw nothing while there are errors', () => {
    const syntax = readModelDocument('{\n  "version": 1,\n  "model": { "tables": [ }\n}\n');
    expect(syntax.model).toBeNull();
    expect(syntax.errors[0]).toMatchObject({
      category: 'json',
      location: { line: 3 },
    });

    const shape = readModelDocument('{\n  "version": 1,\n  "model": {\n    "tables": [{ "name": "a", "fields": "id" }]\n  }\n}\n');
    expect(shape.model).toBeNull();
    expect(shape.errors).toHaveLength(1);
    expect(shape.errors[0]).toMatchObject({
      category: 'shape',
      message: 'Expected an array',
      location: {
        line: 4,
        column: 41,
      },
    });

    expect(readModelDocument('{ "tables": [] }').errors[0]!.message).toMatch(/A model file is/);

    const loose = readModelDocument(JSON.stringify({
      version: 2,
      extra: true,
      model: {
        tables: [{
          name: 'a',
          fields: [],
          colour: '#fff',
        }],
        refs: [{
          from: { table: 'public.a' },
          to: { table: 'public.missing' },
        }],
      },
    }, null, 2));
    expect(loose.model).not.toBeNull();
    expect(loose.warnings.map((w) => [w.category, w.message])).toEqual([
      ['shape', '"version": 1 expected'],
      ['shape', 'Unknown property "extra"'],
      ['shape', 'Unknown property "colour"'],
      ['reference', 'Table "public.missing" not found'],
    ]);
  });

  it('take colors and other settings as edits that keep the rest of the text', () => {
    const text = modelFileText(MODEL);
    const next = applyTextEdits(text, setAtPath(text, ['model', 'tables', 1, 'headerColor'], '#E74C3C'));
    expect(JSON.parse(next).model.tables[1].headerColor).toBe('#E74C3C');
    expect(next.replace(/,\n\s*"headerColor": "#E74C3C"/, '')).toBe(text);
  });

  it.each(['../../sample/default.dbml', '../../dbml/__tests__/fixtures/partialGrain.dbml'])('of %s, as graph prints it, draw what the DBML draws', (path) => {
    const dbml = readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
    const file = modelFileText(modelOf(dbml).model!);
    const doc = readModelDocument(file);
    expect(doc.errors).toEqual([]);
    expect(withoutSource(fromModel(doc.model!))).toEqual(withoutSource({
      ...buildDiagramModel(compile(dbml)),
      diagnostics: [],
    }));
  });
});

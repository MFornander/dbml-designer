import { describe, it, expect } from 'vitest';
import { buildDiagramModel } from '@/dbml/buildModel';
import { tokenOf } from '@/dbml/token';
import type { TokenRange } from '@/types/diagram';
import { hiddenForView, visibleEntities } from '@/diagram/adapter/views';
import { compile } from '@/diagram/__tests__/testUtils';
import { applyTextEdits, offsetAt } from '@/editor/colorEdit';
import {
  deleteDiagramView, diagramViewText, renameDiagramView, upsertDiagramView,
} from '@/editor/viewText';

const text = [
  'Table users { id int [pk] }',
  'Table "sales schema".orders { id int [pk] }',
  'Table comments { id int [pk] }',
  'Note tips { \'a\' }',
  'Note todo { \'b\' }',
  '',
].join('\n');
const model = buildDiagramModel(compile(text));

describe('diagramViewText', () => {
  it('writes only the kinds that hide something, quoting names that need it', () => {
    const hidden = new Set(['public.comments', 'note:todo']);
    const block = diagramViewText('Sales overview', visibleEntities(model, hidden), {
      tables: model.tables.length,
      notes: model.notes.length,
    });
    expect(block).toBe([
      'DiagramView "Sales overview" {',
      '  tables {',
      '    users',
      '    "sales schema".orders',
      '  }',
      '  notes {',
      '    tips',
      '  }',
      '}',
      '',
    ].join('\n'));
    // Nothing hidden: an empty body, which shows everything.
    expect(diagramViewText('all', visibleEntities(model, new Set()), {
      tables: 3,
      notes: 2,
    })).toBe('DiagramView all {\n}\n');
  });
});

describe('upsertDiagramView and deleteDiagramView', () => {
  it('appends a new block after a blank line, replaces an existing one in place, and removes it cleanly', () => {
    const hidden = new Set(['public.comments']);
    const totals = {
      tables: 3,
      notes: 2,
    };
    const block = diagramViewText('focus', visibleEntities(model, hidden), totals);
    const withView = applyTextEdits(text, upsertDiagramView(text, null, block));
    expect(withView.endsWith('\n\nDiagramView focus {\n  tables {\n    users\n    "sales schema".orders\n  }\n}\n')).toBe(true);

    // The parser reads it back the same way.
    let m = buildDiagramModel(compile(withView));
    const v = m.views.find((x) => x.name === 'focus')!;
    expect([...hiddenForView(m, v)]).toEqual(['public.comments']);

    // Replace: hide todo too.
    const rangeOf = (source: string, tok: TokenRange) => ({
      start: offsetAt(source, tok.start.line, tok.start.column),
      end: offsetAt(source, tok.end.line, tok.end.column),
    });
    const hidden2 = new Set(['public.comments', 'note:todo']);
    const replaced = applyTextEdits(withView, upsertDiagramView(withView, rangeOf(withView, tokenOf(v.source)!), diagramViewText('focus', visibleEntities(m, hidden2), totals)));
    m = buildDiagramModel(compile(replaced));
    expect(m.views).toHaveLength(1);
    expect([...hiddenForView(m, m.views[0]!)].sort()).toEqual(['note:todo', 'public.comments']);

    // Delete: the text is back to where it started.
    const removed = applyTextEdits(replaced, deleteDiagramView(replaced, rangeOf(replaced, tokenOf(m.views[0]!.source)!)));
    expect(removed).toBe(text);
  });

  it('renames a block in place, quoting names that need it and unquoting ones that do not', () => {
    const text = 'Table a { id int }\n\nDiagramView first {\n  tables {\n    a\n  }\n}\n';
    const start = text.indexOf('DiagramView');
    const range = { start, end: text.length - 1 };
    expect(renameDiagramView(text, range, 'New View')).toEqual([{ start: start + 12, end: start + 17, text: '"New View"' }]);
    const quoted = 'DiagramView "New View" {\n  tables {\n    a\n  }\n}';
    expect(renameDiagramView(quoted, { start: 0, end: quoted.length }, 'renamed')).toEqual([{ start: 12, end: 22, text: 'renamed' }]);
    expect(renameDiagramView('Table a { id int }', { start: 0, end: 18 }, 'x')).toEqual([]);
  });
});

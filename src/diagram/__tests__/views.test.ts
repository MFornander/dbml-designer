import { describe, it, expect } from 'vitest';
import { buildDiagramModel } from '@/diagram/adapter/buildModel';
import { hiddenForView, sameHidden, visibleEntities } from '@/diagram/adapter/views';
import { compile } from './testUtils';

const model = buildDiagramModel(compile(`
  Table users { id int [pk] }
  Table posts { id int [pk] }
  Table sales.orders { id int [pk] }
  Table sales.items { id int [pk] }
  Note tips { 'a' }
  Note todo { 'b' }
  TableGroup content { posts }
  DiagramView only_tables {
    tables {
      users
      sales.orders
    }
  }
  DiagramView by_schema {
    schemas {
      sales
    }
    notes {
      tips
    }
  }
  DiagramView by_group {
    tablegroups {
      content
    }
  }
  DiagramView everything {
  }
  DiagramView no_notes {
    notes {
    }
  }
`));

const view = (name: string) => model.views.find((v) => v.name === name)!;

describe('DiagramView model', () => {
  it('resolves the listed tables, groups, notes, and schemas and records which kinds a view restricts', () => {
    expect(model.views.map((v) => v.name)).toEqual(['only_tables', 'by_schema', 'by_group', 'everything', 'no_notes']);
    const t = view('only_tables');
    expect(t.tableKeys).toEqual(['public.users', 'sales.orders']);
    expect(t.filtersTables).toBe(true);
    expect(t.filtersNotes).toBe(false);
    expect(t.token?.start.line).toBeGreaterThan(1);
    expect(view('by_schema').schemas).toEqual(['sales']);
    expect(view('by_schema').noteKeys).toEqual(['note:tips']);
    expect(view('by_group').groupKeys).toEqual(['group:public.content']);
    expect(view('everything').filtersTables).toBe(false);
    expect(view('everything').filtersNotes).toBe(false);
    // The parser reads an empty section as no section at all, so a view cannot hide every note.
    expect(view('no_notes').filtersNotes).toBe(false);
    expect(view('no_notes').noteKeys).toEqual([]);
  });
});

describe('hiddenForView', () => {
  it('hides nothing for the default view or a view without sections', () => {
    expect(hiddenForView(model, null).size).toBe(0);
    expect(hiddenForView(model, view('everything')).size).toBe(0);
  });

  it('shows only the listed tables and leaves notes alone without a notes section', () => {
    expect([...hiddenForView(model, view('only_tables'))].sort()).toEqual(['public.posts', 'sales.items']);
  });

  it('shows whole schemas and restricts notes when listed', () => {
    expect([...hiddenForView(model, view('by_schema'))].sort()).toEqual(['note:todo', 'public.posts', 'public.users']);
  });

  it('shows the members of listed groups', () => {
    expect([...hiddenForView(model, view('by_group'))].sort()).toEqual(['public.users', 'sales.items', 'sales.orders']);
  });

  it('treats an empty notes section like a missing one', () => {
    expect(hiddenForView(model, view('no_notes')).size).toBe(0);
  });
});

describe('visibleEntities and sameHidden', () => {
  it('lists what stays visible in declaration order', () => {
    const v = visibleEntities(model, hiddenForView(model, view('by_schema')));
    expect(v.tables.map((t) => t.key)).toEqual(['sales.orders', 'sales.items']);
    expect(v.notes.map((n) => n.key)).toEqual(['note:tips']);
  });

  it('compares sets by members', () => {
    expect(sameHidden(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(true);
    expect(sameHidden(new Set(['a']), new Set(['a', 'b']))).toBe(false);
  });
});

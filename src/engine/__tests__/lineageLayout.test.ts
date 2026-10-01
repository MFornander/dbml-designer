import { describe, it, expect } from 'vitest';
import { lineageLayout } from '../geometry/lineageLayout';
import type { TableSize } from '../geometry/tableSize';
import type { DepEdgeVM, TableVM } from '../types';
import { field, table } from '@/dbml/__tests__/testUtils';

function tables (...names: string[]): TableVM[] {
  return names.map((n, i) => table(`public.${n}`, [field(`public.${n}`, 'id', { pk: true })], { order: i }));
}

function dep (from: string, to: string): DepEdgeVM {
  const ep = (n: string) => ({
    tableKey: `public.${n}`,
    fieldNames: [],
    fieldKeys: [],
    fieldIndices: [],
  });
  return {
    key: `dep:${from}->${to}`,
    label: null,
    names: [],
    upstream: ep(from),
    downstream: ep(to),
    columns: [],
    color: null,
    isSelf: from === to,
  };
}

function sizes (ts: TableVM[], height = 64): Map<string, TableSize> {
  return new Map(ts.map((t) => [t.key, {
    width: 200,
    height,
    headerW: 50,
    rows: [],
  }]));
}

describe('lineageLayout', () => {
  it('places a chain left to right on one row', () => {
    const ts = tables('raw', 'stg', 'fct');
    const r = lineageLayout({
      tables: ts,
      deps: [dep('raw', 'stg'), dep('stg', 'fct')],
      sizes: sizes(ts),
    });
    expect(r.layers.get('public.raw')).toBe(0);
    expect(r.layers.get('public.stg')).toBe(1);
    expect(r.layers.get('public.fct')).toBe(2);
    const xs = ['raw', 'stg', 'fct'].map((n) => r.positions.get(`public.${n}`)!.x);
    expect(xs[0]).toBeLessThan(xs[1]!);
    expect(xs[1]).toBeLessThan(xs[2]!);
    expect(new Set(['raw', 'stg', 'fct'].map((n) => r.positions.get(`public.${n}`)!.y)).size).toBe(1);
    expect(r.unrelated).toEqual([]);
  });

  it('layers a diamond and keeps siblings in one column in declaration order', () => {
    const ts = tables('a', 'b', 'c', 'd');
    const r = lineageLayout({
      tables: ts,
      deps: [dep('a', 'b'), dep('a', 'c'), dep('b', 'd'), dep('c', 'd')],
      sizes: sizes(ts),
    });
    expect([...r.layers.entries()].sort()).toEqual([
      ['public.a', 0], ['public.b', 1], ['public.c', 1], ['public.d', 2],
    ]);
    const b = r.positions.get('public.b')!;
    const c = r.positions.get('public.c')!;
    expect(b.x).toBe(c.x);
    expect(b.y).toBeLessThan(c.y);
  });

  it('uses the longest path so a table depends only on layers to its left', () => {
    const ts = tables('a', 'b', 'c');
    const r = lineageLayout({
      tables: ts,
      deps: [dep('a', 'b'), dep('b', 'c'), dep('a', 'c')],
      sizes: sizes(ts),
    });
    expect(r.layers.get('public.c')).toBe(2);
  });

  it('tolerates cycles', () => {
    const ts = tables('x', 'y');
    const r = lineageLayout({
      tables: ts,
      deps: [dep('x', 'y'), dep('y', 'x')],
      sizes: sizes(ts),
    });
    expect(r.layers.size).toBe(2);
    expect(r.positions.size).toBe(2);
  });

  it('leaves tables without lineage out of the layout and snaps everything', () => {
    const ts = tables('src', 'dst', 'lonely', 'other');
    const r = lineageLayout({
      tables: ts,
      deps: [dep('src', 'dst')],
      sizes: sizes(ts),
    });
    expect(r.unrelated).toEqual(['public.lonely', 'public.other']);
    expect([...r.positions.keys()].sort()).toEqual(['public.dst', 'public.src']);
    for (const p of r.positions.values()) {
      expect(p.x % 8).toBe(0);
      expect(p.y % 8).toBe(0);
    }
  });

  it('ignores self dependencies for layering but keeps the table involved', () => {
    const ts = tables('s');
    const r = lineageLayout({
      tables: ts,
      deps: [dep('s', 's')],
      sizes: sizes(ts),
    });
    expect(r.layers.get('public.s')).toBe(0);
    expect(r.unrelated).toEqual([]);
  });
});

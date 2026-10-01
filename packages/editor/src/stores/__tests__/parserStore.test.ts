import {
  describe, it, expect, beforeEach,
} from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useParserStore } from '@/stores/parserStore';

describe('parserStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('parses the bundled sample without errors on creation', () => {
    const parser = useParserStore();
    expect(parser.errors).toEqual([]);
    expect(parser.rawDatabase).toBeDefined();
    const names = parser.rawDatabase!.tables.map((t) => t.name);
    expect(names).toContain('users');
    expect(names).toContain('posts');
    expect(parser.rawDatabase!.refs.length).toBeGreaterThan(0);
    expect(parser.rawDatabase!.tableGroups.length).toBe(1);
    expect(parser.rawDatabase!.notes.length).toBe(1);
  });

  it('exposes a raw database with 1-indexed token positions after a valid parse', () => {
    const parser = useParserStore();
    parser.parseNow('Table a {\n  id int [pk]\n}');
    expect(parser.errors).toEqual([]);
    const table = parser.rawDatabase!.tables[0]!;
    expect(table.name).toBe('a');
    expect(table.token.start.line).toBe(1);
    expect(table.fields[0]!.token.start.line).toBe(2);
  });

  it('keeps the last good database when the text has a syntax error', () => {
    const parser = useParserStore();
    parser.parseNow('Table a { id int [pk] }');
    const versionBefore = parser.parseVersion;
    const goodBefore = parser.lastGoodVersion;

    parser.parseNow('Table a { id int [pk] ');
    expect(parser.errors.length).toBeGreaterThan(0);
    expect(parser.hasErrors).toBe(true);
    expect(parser.isStale).toBe(true);
    expect(parser.rawDatabase!.tables[0]!.name).toBe('a');
    expect(parser.parseVersion).toBe(versionBefore + 1);
    expect(parser.lastGoodVersion).toBe(goodBefore);
    expect(parser.errors[0]!.location.line).toBeGreaterThanOrEqual(1);
  });

  it('keeps the last good database when a ref points at a missing table', () => {
    const parser = useParserStore();
    parser.parseNow('Table a { id int [pk] }');
    parser.parseNow('Table a { id int [pk] }\nRef: a.id > missing.id');
    expect(parser.errors.length).toBeGreaterThan(0);
    expect(parser.rawDatabase!.tables.map((t) => t.name)).toEqual(['a']);
    expect(parser.rawDatabase!.refs).toEqual([]);
  });

  it('promotes inline refs into the top-level refs list', () => {
    const parser = useParserStore();
    parser.parseNow('Table u { id int [pk] }\nTable p { id int [pk]\n u_id int [ref: > u.id] }');
    expect(parser.errors).toEqual([]);
    const refs = parser.rawDatabase!.refs;
    expect(refs).toHaveLength(1);
    // Endpoint order is not guaranteed (inline refs list the referenced table first).
    const manySide = refs[0]!.endpoints.find((e) => e.tableName === 'p')!;
    const oneSide = refs[0]!.endpoints.find((e) => e.tableName === 'u')!;
    expect(manySide.fieldNames).toEqual(['u_id']);
    expect(manySide.relation).toBe('*');
    expect(oneSide.fieldNames).toEqual(['id']);
    expect(oneSide.relation).toBe('1');
  });
});

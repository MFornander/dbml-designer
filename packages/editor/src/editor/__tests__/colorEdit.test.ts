import { describe, it, expect } from 'vitest';
import {
  applyTextEdits, offsetAt, setColorSetting, setRefColor, type TextEdit,
} from '@/editor/colorEdit';
import { relationshipText } from '@/editor/refText';
import { normalizeHex } from '@dbml-designer/engine';
import { buildDiagramModel } from '@/dbml/buildModel';
import { tokenOf } from '@/dbml/token';
import type { TokenRange } from '@/types/diagram';
import { compile } from '@/dbml/__tests__/testUtils';

function apply (text: string, e: TextEdit | null): string {
  if (!e) throw new Error('expected an edit');
  return text.slice(0, e.start) + e.text + text.slice(e.end);
}

describe('normalizeHex', () => {
  it('expands short forms, adds the hash, and upper-cases', () => {
    expect(normalizeHex('abc')).toBe('#AABBCC');
    expect(normalizeHex(' #1e69fd ')).toBe('#1E69FD');
    expect(normalizeHex('red')).toBeNull();
    expect(normalizeHex('#12345')).toBeNull();
  });
});

describe('offsetAt', () => {
  it('maps 1-indexed lines and columns to character offsets', () => {
    const t = 'ab\ncde\nf';
    expect(offsetAt(t, 1, 1)).toBe(0);
    expect(offsetAt(t, 2, 3)).toBe(5);
    expect(offsetAt(t, 3, 1)).toBe(7);
    expect(offsetAt(t, 9, 1)).toBe(t.length);
  });
});

describe('setColorSetting', () => {
  it('adds a settings list after the table name', () => {
    const t = 'Table users {\n  id int\n}';
    expect(apply(t, setColorSetting(t, 0, 'headercolor', '#3498db'))).toBe('Table users [headercolor: #3498DB] {\n  id int\n}');
  });

  it('keeps an alias ahead of the new list and spaces a brace that follows directly', () => {
    const t = 'Table users as U{\n}';
    expect(apply(t, setColorSetting(t, 0, 'headercolor', '#3498DB'))).toBe('Table users as U [headercolor: #3498DB] {\n}');
  });

  it('replaces an existing value whatever its case', () => {
    const t = "Table users [HeaderColor: #fff, note: 'x'] {\n}";
    expect(apply(t, setColorSetting(t, 0, 'headercolor', '#E74C3C'))).toBe("Table users [headercolor: #E74C3C, note: 'x'] {\n}");
  });

  it('appends to an existing list, skipping brackets inside strings, and fills an empty one', () => {
    const t = "Table users [note: 'a { b ] c' ] {\n}";
    expect(apply(t, setColorSetting(t, 0, 'headercolor', '#E74C3C'))).toBe("Table users [note: 'a { b ] c', headercolor: #E74C3C ] {\n}");
    const e = 'TableGroup g [] {\n}';
    expect(apply(e, setColorSetting(e, 0, 'color', '#2ECC71'))).toBe('TableGroup g [color: #2ECC71] {\n}');
  });

  it('works on declarations later in the file and on notes with multi-line bodies', () => {
    const t = "Table a {\n}\n\nNote hint {\n  '''\n  Braces { inside } text\n  '''\n}";
    const start = t.indexOf('Note hint');
    expect(apply(t, setColorSetting(t, start, 'color', '#F1C40F')))
      .toBe("Table a {\n}\n\nNote hint [color: #F1C40F] {\n  '''\n  Braces { inside } text\n  '''\n}");
  });

  it('refuses stale positions, bodiless declarations, and non-hex colors', () => {
    const t = 'Table users {\n}';
    expect(setColorSetting(t, 6, 'headercolor', '#FFF')).toBeNull();
    expect(setColorSetting('Table users', 0, 'headercolor', '#FFF')).toBeNull();
    expect(setColorSetting(t, 0, 'headercolor', 'red')).toBeNull();
  });
});

describe('setRefColor', () => {
  const rel = 'users.id < posts.user_id';

  it('appends to the settings of a short standalone ref, or adds a list', () => {
    const withSettings = 'Ref fk: posts.id > tags.post_id [delete: cascade]\n';
    const range = { start: 0, end: withSettings.length - 1 };
    expect(applyTextEdits(withSettings, setRefColor(withSettings, range, '#E74C3C', rel)!))
      .toBe('Ref fk: posts.id > tags.post_id [delete: cascade, color: #E74C3C]\n');
    const bare = 'Ref: tags.post_id <> posts.editor_id';
    expect(applyTextEdits(bare, setRefColor(bare, { start: 0, end: bare.length }, '#E74C3C', rel)!))
      .toBe('Ref: tags.post_id <> posts.editor_id [color: #E74C3C]');
  });

  it('edits the relationship line inside a block ref', () => {
    const colored = 'Ref fk_long {\n  tags.id - posts.id [color: #FF0000]\n}';
    expect(applyTextEdits(colored, setRefColor(colored, { start: 0, end: colored.length }, '#2ECC71', rel)!))
      .toBe('Ref fk_long {\n  tags.id - posts.id [color: #2ECC71]\n}');
    const plain = 'Ref fk_long {\n  // the join\n  tags.id - posts.id\n}';
    expect(applyTextEdits(plain, setRefColor(plain, { start: 0, end: plain.length }, '#2ECC71', rel)!))
      .toBe('Ref fk_long {\n  // the join\n  tags.id - posts.id [color: #2ECC71]\n}');
    const oneLine = 'Ref x { a.b > c.d }';
    expect(applyTextEdits(oneLine, setRefColor(oneLine, { start: 0, end: oneLine.length }, '#2ECC71', rel)!))
      .toBe('Ref x { a.b > c.d [color: #2ECC71] }');
  });

  it('moves an inline ref out of its column into a Ref line at the end', () => {
    const last = 'Table posts {\n  user_id int [not null, ref: > users.id]\n}\n';
    const r1 = { start: last.indexOf('ref:'), end: last.indexOf(']') };
    expect(applyTextEdits(last, setRefColor(last, r1, '#E74C3C', rel)!))
      .toBe('Table posts {\n  user_id int [not null]\n}\n\nRef: users.id < posts.user_id [color: #E74C3C]\n');

    const first = "Table posts {\n  user_id int [ref: > users.id, note: 'x']\n}";
    const r2 = { start: first.indexOf('ref:'), end: first.indexOf(', note') };
    expect(applyTextEdits(first, setRefColor(first, r2, '#E74C3C', rel)!))
      .toBe("Table posts {\n  user_id int [note: 'x']\n}\n\nRef: users.id < posts.user_id [color: #E74C3C]\n");

    const only = 'Table posts {\n  user_id int [ref: > users.id]\n}';
    const r3 = { start: only.indexOf('ref:'), end: only.indexOf(']') };
    expect(applyTextEdits(only, setRefColor(only, r3, '#E74C3C', rel)!))
      .toBe('Table posts {\n  user_id int\n}\n\nRef: users.id < posts.user_id [color: #E74C3C]\n');
  });

  it('refuses ranges that are not relationships and bad colors', () => {
    const t = 'Table users {\n}';
    expect(setRefColor(t, { start: 0, end: t.length }, '#FFF', rel)).toBeNull();
    expect(setRefColor('Ref: a.b > c.d', { start: 0, end: 14 }, 'blue', rel)).toBeNull();
  });

  it('lands on the parser-reported ranges and re-parses to the same relationship', () => {
    const text = [
      'Table users { id int [pk] }',
      'Table "user posts" {',
      '  id int [pk]',
      '  user_id int [not null, ref: > users.id]',
      '}',
      'Ref named: "user posts".id - users.id [update: cascade]',
      '',
    ].join('\n');
    const model = buildDiagramModel(compile(text));
    // Offsets belong to the text a token was parsed from.
    const rangeOf = (source: string, token: TokenRange) => ({
      start: offsetAt(source, token.start.line, token.start.column),
      end: offsetAt(source, token.end.line, token.end.column),
    });

    const inline = model.refs.find((r) => r.name === null)!;
    let next = applyTextEdits(text, setRefColor(text, rangeOf(text, tokenOf(inline.source)!), '#E74C3C', relationshipText(model, inline))!);
    expect(next).toContain('user_id int [not null]\n');
    expect(next).toContain('\nRef: users.id < "user posts".user_id [color: #E74C3C]\n');

    const model2 = buildDiagramModel(compile(next));
    const inline2 = model2.refs.find((r) => r.name === null)!;
    // Same endpoints in the same order keep the key, so a stored route survives the rewrite.
    expect(inline2.key).toBe(inline.key);
    expect(inline2.color).toBe('#E74C3C');

    const named2 = model2.refs.find((r) => r.name === 'named')!;
    next = applyTextEdits(next, setRefColor(next, rangeOf(next, tokenOf(named2.source)!), '#2ECC71', relationshipText(model2, named2))!);
    expect(next).toContain('Ref named: "user posts".id - users.id [update: cascade, color: #2ECC71]');
    expect(buildDiagramModel(compile(next)).refs.find((r) => r.name === 'named')!.color).toBe('#2ECC71');
  });
});

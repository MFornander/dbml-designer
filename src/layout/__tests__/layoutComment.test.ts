import { describe, it, expect } from 'vitest';
import {
  LAYOUT_PLACEHOLDER, parseLayout, serializeLayout, splitLayoutComment, withLayoutComment, withLayoutPlaceholder,
} from '@/layout';

const DBML = 'Table users { id int [pk] }\nTable posts { id int [pk] }\n';
const YAML = 'version: 1\ntables:\n  public:\n    users: { x: 8, y: 16 }\n';

describe('layout comment', () => {
  it('appends the layout as a closing comment and lifts it out again', () => {
    const file = withLayoutComment(DBML, YAML);
    expect(file).toBe(`${DBML}\n/* === DBML DESIGNER FOOTER ===\n${YAML}*/\n`);
    expect(splitLayoutComment(file)).toEqual({
      dbml: DBML.trimEnd(),
      layout: YAML,
      hadComment: true,
    });
  });

  it('replaces an earlier layout comment or the placeholder instead of stacking them', () => {
    const once = withLayoutComment(DBML, YAML);
    const twice = withLayoutComment(once, 'version: 1\n');
    expect(twice.match(/DBML DESIGNER FOOTER/g)).toHaveLength(1);
    expect(twice).toContain('version: 1\n*/');
    expect(twice).not.toContain('users:');
    const fromPlaceholder = withLayoutComment(withLayoutPlaceholder(DBML), YAML);
    expect(fromPlaceholder).toBe(once);
  });

  it('the placeholder carries no layout and is what Import leaves behind', () => {
    const text = withLayoutPlaceholder(DBML);
    expect(text).toBe(`${DBML}\n${LAYOUT_PLACEHOLDER}\n`);
    expect(splitLayoutComment(text)).toEqual({
      dbml: DBML.trimEnd(),
      layout: null,
      hadComment: true,
    });
    // Placing it again changes nothing.
    expect(withLayoutPlaceholder(text)).toBe(text);
  });

  it('leaves text without a layout comment, or with the marker elsewhere, untouched', () => {
    expect(splitLayoutComment(DBML)).toEqual({
      dbml: DBML,
      layout: null,
      hadComment: false,
    });
    const middle = `/* === DBML DESIGNER FOOTER ===\nversion: 1\n*/\n${DBML}`;
    expect(splitLayoutComment(middle)).toEqual({
      dbml: middle,
      layout: null,
      hadComment: false,
    });
    expect(splitLayoutComment('')).toEqual({
      dbml: '',
      layout: null,
      hadComment: false,
    });
    expect(withLayoutPlaceholder('')).toBe(`${LAYOUT_PLACEHOLDER}\n`);
  });

  it('keeps a comment closer inside the YAML from ending the comment early', () => {
    const file = withLayoutComment(DBML, 'version: 1\nnotes:\n  "a*/b": { x: 1, y: 2 }\n');
    expect(file.indexOf('*/')).toBe(file.lastIndexOf('*/'));
  });

  it('round-trips a written layout through the file', () => {
    const snap = {
      positions: {
        'public.users': { x: 288, y: 0 },
        'note:tips': { x: 800, y: 0, w: 192, h: 160 },
      },
      collapsedGroups: ['group:public.content'],
      edgeRoutes: { '#public.users(id)->public.posts(author_id)': [264.5, 72, 320] },
    };
    const file = withLayoutComment(DBML, serializeLayout(snap));
    const { layout } = splitLayoutComment(file);
    expect(layout).not.toBeNull();
    expect(parseLayout(layout!)).toEqual(snap);
  });
});

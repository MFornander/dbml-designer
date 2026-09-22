import { describe, it, expect } from 'vitest';
import {
  parseLayout, serializeLayout, splitLayoutComment, withLayoutComment,
} from '@/layout';

const DBML = 'Table users { id int [pk] }\nTable posts { id int [pk] }\n';
const YAML = 'version: 1\ntables:\n  public:\n    users: { x: 8, y: 16 }\n';
const FOOTER = (yaml: string) => `/* === DBML DESIGNER FOOTER ===\n${yaml}*/\n`;
const PLACEHOLDER = '/* === DBML DESIGNER FOOTER ===\n   Diagram layout in YAML as seen under the Layout tab, used during export and import.\n*/\n';

describe('layout comment', () => {
  it('appends the layout as a footer and lifts it out again, leaving the text without it', () => {
    const file = withLayoutComment(DBML, YAML);
    expect(file).toBe(`${DBML}\n${FOOTER(YAML)}`);
    expect(splitLayoutComment(file)).toEqual({
      dbml: DBML.trimEnd(),
      layout: YAML,
    });
  });

  it('replaces an earlier footer instead of stacking them', () => {
    const once = withLayoutComment(DBML, YAML);
    const twice = withLayoutComment(once, 'version: 1\n');
    expect(twice.match(/DBML DESIGNER FOOTER/g)).toHaveLength(1);
    expect(twice).toContain('version: 1\n*/');
    expect(twice).not.toContain('users:');
  });

  it('removes footer blocks wherever they are, keeping the layout of the last one that has any', () => {
    // Text that grew past an old footer, plus an old-style placeholder: nothing of either survives.
    const grown = `use * from 'schema.dbml'\n\n${PLACEHOLDER}\nTable hello {\n  first int\n}\n\n${FOOTER(YAML)}\n${PLACEHOLDER}`;
    expect(splitLayoutComment(grown)).toEqual({
      dbml: 'use * from \'schema.dbml\'\n\nTable hello {\n  first int\n}',
      layout: YAML,
    });
    // Saving such a text writes exactly one footer at the end.
    const saved = withLayoutComment(grown, YAML);
    expect(saved.match(/DBML DESIGNER FOOTER/g)).toHaveLength(1);
    expect(saved).toBe(`use * from 'schema.dbml'\n\nTable hello {\n  first int\n}\n\n${FOOTER(YAML)}`);
  });

  it('leaves text without a footer untouched and handles an empty text', () => {
    expect(splitLayoutComment(DBML)).toEqual({
      dbml: DBML,
      layout: null,
    });
    expect(splitLayoutComment('')).toEqual({
      dbml: '',
      layout: null,
    });
    expect(withLayoutComment('', YAML)).toBe(FOOTER(YAML));
  });

  it('keeps a comment closer inside the YAML from ending the footer early', () => {
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

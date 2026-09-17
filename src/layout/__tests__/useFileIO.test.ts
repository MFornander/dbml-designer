// @vitest-environment happy-dom
import {
  describe, it, expect, beforeEach,
} from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { LAYOUT_PLACEHOLDER, splitLayoutComment } from '@/layout';
import { useFileIO } from '@/layout/useFileIO';
import { useEditorStore } from '@/stores/editorStore';
import { useLayoutStore } from '@/stores/layoutStore';
import { useParserStore } from '@/stores/parserStore';

const DBML = 'Project blog {\n  database_type: \'PostgreSQL\'\n}\n\nTable users { id int [pk] }\nTable posts { id int [pk] }\n';

function file (name: string, text: string): File {
  return new File([text], name, { type: 'text/plain' });
}

describe('useFileIO', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useParserStore().parseNow(DBML);
    useLayoutStore().resetLayout();
  });

  it('exports one file with the layout in a closing comment and does not touch the editor text', () => {
    const editor = useEditorStore();
    editor.setText(DBML);
    useLayoutStore().setPosition('public.users', { x: 8, y: 16 });
    const io = useFileIO();
    const out = io.exportText();
    expect(out.startsWith(DBML.trimEnd())).toBe(true);
    expect(out).toContain('/* === DBML DESIGNER FOOTER ===');
    expect(out).toContain('=== DBML DESIGNER FOOTER ===\nversion: 1\n');
    expect(out).toContain('users: { x: 8, y: 16 }');
    expect(out.trimEnd().endsWith('*/')).toBe(true);
    expect(editor.text).toBe(DBML);
  });

  it('imports a file, applies the layout, and leaves the placeholder where the comment was', async () => {
    const editor = useEditorStore();
    const layout = useLayoutStore();
    const io = useFileIO();
    const text = `${DBML}\n/* === DBML DESIGNER FOOTER ===\nversion: 1\ntables:\n  public:\n    users: { x: 40, y: 48 }\n    ghost: { x: 1, y: 1 }\n*/\n`;
    const result = await io.importFiles([file('blog.dbml', text)]);
    expect(result.failed).toEqual([]);
    expect(result.done).toEqual(['blog.dbml (layout: 1 entry not in the schema, ignored)']);
    expect(layout.positions).toEqual({ 'public.users': { x: 40, y: 48 } });
    expect(editor.text).toBe(`${DBML}\n${LAYOUT_PLACEHOLDER}\n`);
    expect(splitLayoutComment(editor.text).layout).toBeNull();
  });

  it('loads the example schema with its layout, leaving the placeholder in the text', () => {
    const editor = useEditorStore();
    const layout = useLayoutStore();
    const io = useFileIO();
    io.loadExample();
    expect(editor.text).toContain('Project blog {');
    expect(editor.text).toContain('Dep post_stats_rollup');
    expect(editor.text.trimEnd().endsWith('*/')).toBe(true);
    expect(splitLayoutComment(editor.text)).toMatchObject({ layout: null, hadComment: true });
    expect(layout.positions['public.users']).toEqual({ x: 48, y: -184 });
    expect(layout.positions['note:getting_started']).toEqual({ x: 592, y: -304, w: 376, h: 272 });
    expect(Object.keys(layout.positions)).toHaveLength(9);
    expect(io.message.value).toBe('Loaded the example schema and its layout');
  });

  it('imports plain DBML as it is, and reports a broken layout comment without applying it', async () => {
    const editor = useEditorStore();
    const layout = useLayoutStore();
    layout.setPosition('public.users', { x: 8, y: 16 });
    const io = useFileIO();

    await io.importFiles([file('plain.dbml', DBML)]);
    expect(editor.text).toBe(DBML);
    expect(layout.positions['public.users']).toEqual({ x: 8, y: 16 });

    const result = await io.importFiles([file('broken.dbml', `${DBML}\n/* === DBML DESIGNER FOOTER ===\nversion: 1\ntables: [\n*/\n`)]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatch(/^broken\.dbml: layout comment not applied, Not valid YAML/);
    expect(layout.positions['public.users']).toEqual({ x: 8, y: 16 });
    expect(editor.text.trimEnd().endsWith('*/')).toBe(true);
    expect(editor.text).toContain('Diagram layout in YAML as seen under the Layout tab');
  });
});

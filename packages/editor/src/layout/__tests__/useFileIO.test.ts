// @vitest-environment happy-dom
import {
  describe, it, expect, beforeEach,
} from 'vitest';
import { nextTick } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import { splitLayoutComment } from '@/layout';
import { useFileIO } from '@/layout/useFileIO';
import { useEditorStore } from '@/stores/editorStore';
import { useLayoutStore } from '@/stores/layoutStore';
import { useParserStore } from '@/stores/parserStore';

const DBML = 'Project blog {\n  database_type: \'PostgreSQL\'\n}\n\nTable users { id int [pk] }\nTable posts { id int [pk] }\n';

const flush = () => new Promise((r) => setTimeout(r, 0));

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

  it('exports one file with the layout in a closing footer and does not touch the editor text', () => {
    const editor = useEditorStore();
    editor.setText(DBML);
    useLayoutStore().setPosition('public.users', { x: 8, y: 16 });
    const io = useFileIO();
    const out = io.exportText();
    expect(out.startsWith(DBML.trimEnd())).toBe(true);
    expect(out).toContain('=== DBML DESIGNER FOOTER ===\nversion: 1\n');
    expect(out).toContain('users: { x: 8, y: 16 }');
    expect(out.trimEnd().endsWith('*/')).toBe(true);
    expect(editor.text).toBe(DBML);
  });

  it('imports a file, applies the layout, and shows the text without the footer', async () => {
    const editor = useEditorStore();
    const layout = useLayoutStore();
    const io = useFileIO();
    const text = `${DBML}\n/* === DBML DESIGNER FOOTER ===\nversion: 1\ntables:\n  public:\n    users: { x: 40, y: 48 }\n    ghost: { x: 1, y: 1 }\n*/\n`;
    const result = await io.importFiles([file('blog.dbml', text)]);
    expect(result.failed).toEqual([]);
    expect(result.done).toEqual(['blog.dbml (layout: 1 entry not in the schema, ignored)']);
    expect(layout.positions).toEqual({ 'public.users': { x: 40, y: 48 } });
    expect(editor.text).toBe(DBML.trimEnd());
    expect(editor.text).not.toContain('DBML DESIGNER FOOTER');
    expect(splitLayoutComment(editor.text).layout).toBeNull();
  });

  it('imports a model file as JSON with its layout, and exports it back as a model file', async () => {
    const editor = useEditorStore();
    const layout = useLayoutStore();
    const io = useFileIO();
    const model = {
      project: { name: 'trace' },
      tables: [{
        name: 'runs',
        fields: [{
          name: 'id',
          type: 'int',
        }],
      }],
    };
    const text = `${JSON.stringify({
      version: 1,
      model,
      layout: {
        version: 1,
        views: { default: { tables: { public: { runs: { x: 24, y: 32 }, ghost: { x: 0, y: 0 } } } } },
      },
    }, null, 2)}\n`;
    const result = await io.importFiles([file('trace.json', text)]);
    expect(result.done).toEqual(['trace.json (layout: 1 entry not in the schema, ignored)']);
    expect(editor.language).toBe('json');
    expect(JSON.parse(editor.text)).toEqual({
      version: 1,
      model,
    });
    expect(layout.positions).toEqual({ 'public.runs': { x: 24, y: 32 } });
    expect(io.baseName.value).toBe('trace');

    layout.setPosition('public.runs', { x: 64, y: 8 });
    const out = JSON.parse(io.exportText());
    expect(out.model).toEqual(model);
    expect(out.layout.views.default.tables.public.runs).toEqual({ x: 64, y: 8 });

    // Back to DBML with the example, read as DBML.
    io.loadExample();
    expect(editor.language).toBe('dbml');
    expect(useParserStore().errors).toEqual([]);
  });

  it('loads the example schema with its layout and no footer in the text', () => {
    const editor = useEditorStore();
    const layout = useLayoutStore();
    const io = useFileIO();
    io.loadExample();
    expect(editor.text).toContain('Project blog {');
    expect(editor.text).toContain('Dep post_stats_rollup');
    expect(editor.text).not.toContain('DBML DESIGNER FOOTER');
    expect(layout.positions['public.users']).toEqual({ x: 48, y: -184 });
    expect(layout.positions['note:getting_started']).toEqual({ x: 592, y: -304, w: 376, h: 272 });
    expect(Object.keys(layout.positions)).toHaveLength(9);
    expect(io.message.value).toBe('Loaded the example schema and its layout');
  });

  it('imports plain DBML as it is, and reports a broken footer without applying it', async () => {
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
    expect(editor.text).not.toContain('DBML DESIGNER FOOTER');
  });

  it('keeps footer entries for imported tables while the imports are still loading', async () => {
    const editor = useEditorStore();
    const layout = useLayoutStore();
    const parser = useParserStore();
    const io = useFileIO();
    const schema = 'Table users {\n  id int [pk]\n}\n';
    const pipeline = 'use * from \'./schema\'\n\nTable derived {\n  id int [pk]\n}\n';
    parser.setSourceLoader(async (abs) => (abs === '/proj/schema.dbml' ? schema : null));
    parser.setEntryPath('/proj/pipeline.dbml', pipeline);
    expect(parser.isLoading).toBe(true);

    const text = `${pipeline}\n/* === DBML DESIGNER FOOTER ===\nversion: 1\ntables:\n  public:\n    derived: { x: 300, y: 0 }\n    ghost: { x: 1, y: 1 }\n    users: { x: 0, y: 0 }\n*/\n`;
    expect(io.importText('pipeline.dbml', text)).toEqual({ done: 'pipeline.dbml' });
    // Nothing is checked against the previous text's model...
    expect(layout.positions).toEqual({
      'public.derived': { x: 300, y: 0 },
      'public.ghost': { x: 1, y: 1 },
      'public.users': { x: 0, y: 0 },
    });
    await flush();
    await nextTick();
    expect(parser.errors).toEqual([]);
    // ...and once the import is in, only what the schema lacks goes.
    expect(layout.positions).toEqual({
      'public.derived': { x: 300, y: 0 },
      'public.users': { x: 0, y: 0 },
    });
    expect(editor.text).toBe(pipeline.trimEnd());
  });
});

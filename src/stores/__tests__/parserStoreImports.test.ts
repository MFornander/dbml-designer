import {
  describe, it, expect, beforeEach,
} from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useEditorStore } from '@/stores/editorStore';
import { useParserStore } from '@/stores/parserStore';

const flush = () => new Promise((r) => setTimeout(r, 0));

const SCHEMA = 'Table users {\n  id int [pk]\n  name varchar\n}\n';
const PIPELINE = 'use * from \'./schema\'\n\nTable derived {\n  id int [pk]\n  users_id int [ref: > users.id]\n}\n\nDep d {\n  users.id -> derived.users_id\n}\n';

describe('parserStore imports', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    // The store re-parses from the editor's text, so tests put the entry text there.
    useEditorStore().setText(PIPELINE);
  });

  it('cannot resolve imports for the virtual entry and says how to fix that', () => {
    const parser = useParserStore();
    parser.parseNow();
    const unresolved = parser.errors.find((e) => /non-existent file/.test(e.message));
    expect(unresolved).toBeDefined();
    expect(unresolved!.explanation).toMatch(/Follow the file/);
    expect(parser.hasErrors).toBe(true);
  });

  it('loads imports next to the entry path and merges them into the database', async () => {
    const parser = useParserStore();
    const files: Record<string, string> = { '/proj/schema.dbml': SCHEMA };
    const requested: string[] = [];
    parser.setSourceLoader(async (abs) => {
      requested.push(abs);
      return files[abs] ?? null;
    });
    parser.setEntryPath('/proj/pipeline.dbml');
    expect(parser.entryPath).toBe('/proj/pipeline.dbml');
    // While the import is on its way, nothing new is published and the store shows as loading.
    expect(parser.isLoading).toBe(true);
    await flush();
    expect(parser.isLoading).toBe(false);
    expect(requested).toEqual(['/proj/schema.dbml']);
    expect(parser.importPaths).toEqual(['/proj/schema.dbml']);
    expect(parser.errors).toEqual([]);
    expect(parser.rawDatabase!.tables.map((t) => t.name).sort()).toEqual(['derived', 'users']);
    expect(parser.rawDatabase!.refs).toHaveLength(1);
  });

  it('reports problems in an imported file with that file, without quick fixes, and follows its edits', async () => {
    const parser = useParserStore();
    const files: Record<string, string> = { '/proj/schema.dbml': SCHEMA };
    parser.setSourceLoader(async (abs) => files[abs] ?? null);
    parser.setEntryPath('/proj/pipeline.dbml');
    await flush();
    expect(parser.errors).toEqual([]);

    parser.updateImport('/proj/schema.dbml', `${SCHEMA}Table broken {\n  x int [ref: > nothere.id]\n}\n`);
    expect(parser.errors).toHaveLength(1);
    expect(parser.errors[0]).toMatchObject({
      file: '/proj/schema.dbml',
      location: { line: 6 },
    });
    expect(parser.errors[0]!.message).toMatch(/^schema\.dbml: /);
    expect(parser.errors[0]!.quickFixes).toBeUndefined();
    // The diagram keeps the last good database meanwhile.
    expect(parser.isStale).toBe(true);

    parser.updateImport('/proj/schema.dbml', `${SCHEMA}Table extra {\n  id int\n}\n`);
    expect(parser.errors).toEqual([]);
    expect(parser.rawDatabase!.tables.map((t) => t.name).sort()).toEqual(['derived', 'extra', 'users']);
  });

  it('reports a missing import once loading settles, and finds it again on retry', async () => {
    const parser = useParserStore();
    const files: Record<string, string> = {};
    parser.setSourceLoader(async (abs) => files[abs] ?? null);
    parser.setEntryPath('/proj/pipeline.dbml');
    await flush();
    expect(parser.errors.some((e) => /non-existent file/.test(e.message))).toBe(true);
    expect(parser.errors[0]!.explanation).toBeUndefined();

    files['/proj/schema.dbml'] = SCHEMA;
    parser.retryImports();
    await flush();
    expect(parser.errors).toEqual([]);
    expect(parser.importPaths).toEqual(['/proj/schema.dbml']);
  });

  it('drops imports and returns to the virtual entry when no path is followed', async () => {
    const parser = useParserStore();
    parser.setSourceLoader(async () => SCHEMA);
    parser.setEntryPath('/proj/pipeline.dbml');
    await flush();
    expect(parser.importPaths).toHaveLength(1);
    parser.setEntryPath(null);
    parser.setSourceLoader(null);
    expect(parser.entryPath).toBe('/main.dbml');
    expect(parser.importPaths).toEqual([]);
    expect(parser.errors.some((e) => /non-existent file/.test(e.message))).toBe(true);
  });

  it('parses the text given with a new entry path, not the editor\'s old text', async () => {
    const parser = useParserStore();
    useEditorStore().setText('use * from \'./other\'\n');
    const requested: string[] = [];
    parser.setSourceLoader(async (abs) => {
      requested.push(abs);
      return abs === '/proj/schema.dbml' ? SCHEMA : null;
    });
    parser.setEntryPath('/proj/pipeline.dbml', PIPELINE);
    expect(parser.isLoading).toBe(true);
    useEditorStore().setText(PIPELINE);
    await flush();
    // Only the new text's import was asked for; the old text's never was.
    expect(requested).toEqual(['/proj/schema.dbml']);
    expect(parser.errors).toEqual([]);
    expect(parser.rawDatabase!.tables.map((t) => t.name).sort()).toEqual(['derived', 'users']);
  });
});

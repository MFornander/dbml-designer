import { computed, ref } from 'vue';
import { useEditorStore } from '@/stores/editorStore';
import { useLayoutStore } from '@/stores/layoutStore';
import { useParserStore } from '@/stores/parserStore';
import { useEditorInstance } from '@/editor/editorInstance';
import { downloadTextFile } from '@/utils/download';
import {
  baseFileName, dbmlFileName, serializeLayout, splitLayoutComment, validateLayout, withLayoutComment,
} from '@/layout';
import { layoutKeysOf } from '@/layout/schemaKeys';
import EXAMPLE_DBML from '@/sample/example.dbml?raw';

const MESSAGE_MS = 5000;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Export and import of one `.dbml` file that carries the layout as YAML in a footer comment. The
 * editor never shows the footer: it is removed on the way in and written on the way out.
 */
export function useFileIO () {
  const editor = useEditorStore();
  const layout = useLayoutStore();
  const parser = useParserStore();
  const editorInstance = useEditorInstance();

  /** Transient status line for the header. */
  const message = ref<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;
  function notify (text: string): void {
    message.value = text;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      message.value = null;
    }, MESSAGE_MS);
  }

  /** File base name from the DBML `Project`, else `schema`. */
  const baseName = computed(() => {
    const project = parser.rawDatabase?.project as { name?: string | null } | undefined;
    return baseFileName(project?.name);
  });

  /** The file Export writes: the text with the layout YAML in a comment at the end. */
  function exportText (): string {
    return withLayoutComment(editor.text, serializeLayout(layout.snapshot()));
  }

  function exportFile (): void {
    const name = dbmlFileName(baseName.value);
    downloadTextFile(name, exportText(), 'text/plain');
    notify(`Downloaded ${name} with the layout in a comment at the end`);
  }

  /** Replace the whole text as one undoable edit and parse it right away. */
  function replaceText (text: string): void {
    const current = editor.text;
    if (!editorInstance.applyEdits([{
      start: 0,
      end: current.length,
      text,
    }])) {
      editor.setText(text);
    }
    parser.parseNow(text);
  }

  /**
   * Take in one file's text. Its footer is lifted out: the layout is checked against the schema
   * and applied to the diagram, and the editor gets the text without it. Returns the line for the
   * status message, or the failure.
   */
  function importText (name: string, text: string): { done: string } | { failed: string } {
    const { dbml, layout: yaml } = splitLayoutComment(text);
    replaceText(dbml);
    if (yaml === null) return { done: name };
    // While imports are still loading the model is the previous text's; checking against it would drop what this text declares.
    const keys = parser.rawDatabase && !parser.isLoading ? layoutKeysOf(parser.rawDatabase) : undefined;
    const v = validateLayout(yaml, keys);
    if (!v.ok) return { failed: `${name}: layout comment not applied, ${v.errors[0]!.message}` };
    layout.replaceLayout(v.snapshot);
    return {
      done: v.warnings.length
        ? `${name} (layout: ${plural(v.warnings.length, 'entry')} not in the schema, ignored)`
        : name,
    };
  }

  /** Import `.dbml` files, each through `importText`. Returns what was applied and what failed. */
  async function importFiles (files: Iterable<File>): Promise<{ done: string[]; failed: string[] }> {
    const done: string[] = [];
    const failed: string[] = [];
    for (const f of files) {
      const result = importText(f.name, await f.text());
      if ('done' in result) done.push(result.done);
      else failed.push(result.failed);
    }
    notify([done.length ? `Imported ${done.join(', ')}` : '', ...failed].filter(Boolean).join(' · '));
    return {
      done,
      failed,
    };
  }

  /** The starter blog schema, a `.dbml` with its arranged layout in the footer, imported like any file. */
  function loadExample (): void {
    importText('example', EXAMPLE_DBML);
    notify('Loaded the example schema and its layout');
  }

  return {
    baseName,
    message,
    exportText,
    exportFile,
    importText,
    importFiles,
    loadExample,
    replaceText,
  };
}

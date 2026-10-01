import { computed, ref } from 'vue';
import { layoutKeysOfModel } from '@dbml-designer/engine/core';
import { useEditorStore } from '@/stores/editorStore';
import { useEngineStore } from '@/stores/engineStore';
import { useLayoutStore } from '@/stores/layoutStore';
import { useParserStore } from '@/stores/parserStore';
import { useEditorInstance } from '@/editor/editorInstance';
import { downloadTextFile } from '@/utils/download';
import { baseFileName, serializeLayout, validateLayout } from '@/layout';
import {
  extensionOf, joinDocument, languageOf, splitDocument,
} from '@/model/documentFormat';
import EXAMPLE_DBML from '@/sample/example.dbml?raw';

const MESSAGE_MS = 5000;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Export and import of one file that carries its layout: a `.dbml` with the layout as YAML in a
 * footer comment, or a model `.json` with it as a property. The editor never shows the layout: it
 * is lifted out on the way in and written on the way out.
 */
export function useFileIO () {
  const editor = useEditorStore();
  const layout = useLayoutStore();
  const parser = useParserStore();
  const { engine } = useEngineStore();
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

  /** File base name from the project's name, else `schema`. */
  const baseName = computed(() => {
    const name = editor.language === 'json'
      ? parser.jsonModel?.project?.name
      : (parser.rawDatabase?.project as { name?: string | null } | undefined)?.name;
    return baseFileName(name);
  });

  /** The file Export and Save write: the text with the layout put back in. */
  function exportText (): string {
    return joinDocument(editor.text, serializeLayout(layout.snapshot()), editor.language);
  }

  function exportFile (): void {
    const json = editor.language === 'json';
    const name = `${baseName.value}${extensionOf(editor.language)}`;
    downloadTextFile(name, exportText(), json ? 'application/json' : 'text/plain');
    notify(`Downloaded ${name} with the layout ${json ? 'in its layout property' : 'in a comment at the end'}`);
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
   * Take in one file's text, as DBML or as a model file by its name. Its layout is lifted out,
   * checked against the schema, and applied to the diagram; the editor gets the text without it.
   * Returns the line for the status message, or the failure.
   */
  function importText (name: string, text: string): { done: string } | { failed: string } {
    const language = languageOf(name);
    editor.setLanguage(language);
    const { body, layout: yaml } = splitDocument(text, language);
    replaceText(body);
    if (yaml === null) return { done: name };
    // Without a model yet, or while imports are still loading and the model is the previous text's, nothing is checked against it.
    const hasModel = language === 'json' ? parser.jsonModel !== undefined : parser.rawDatabase !== undefined;
    const keys = hasModel && !parser.isLoading ? layoutKeysOfModel(engine.diagram.value) : undefined;
    const v = validateLayout(yaml, keys);
    if (!v.ok) return { failed: `${name}: layout ${language === 'json' ? 'property' : 'comment'} not applied, ${v.errors[0]!.message}` };
    layout.replaceLayout(v.snapshot);
    return {
      done: v.warnings.length
        ? `${name} (layout: ${plural(v.warnings.length, 'entry')} not in the schema, ignored)`
        : name,
    };
  }

  /** Import `.dbml` and model `.json` files, each through `importText`. Returns what was applied and what failed. */
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
    importText('example.dbml', EXAMPLE_DBML);
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

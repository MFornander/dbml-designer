import { computed, ref } from 'vue';
import { useEditorStore } from '@/stores/editorStore';
import { useLayoutTextStore } from '@/stores/layoutTextStore';
import { useParserStore } from '@/stores/parserStore';
import { useUiStore } from '@/stores/uiStore';
import { useEditorInstance } from '@/editor/editorInstance';
import { downloadTextFile } from '@/utils/download';
import { baseFileName, dbmlFileName, sidecarFileName } from './sidecar';

const MESSAGE_MS = 5000;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Export and import of the DBML text together with its `.dbml.yaml` layout sidecar. */
export function useFileIO () {
  const editor = useEditorStore();
  const layoutText = useLayoutTextStore();
  const parser = useParserStore();
  const ui = useUiStore();
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

  function exportFiles (): void {
    const dbml = dbmlFileName(baseName.value);
    const sidecar = sidecarFileName(baseName.value);
    downloadTextFile(dbml, editor.text, 'text/plain');
    // The Layout view's text is the sidecar, comments and all.
    downloadTextFile(sidecar, layoutText.text, 'application/yaml');
    notify(`Downloaded ${dbml} and ${sidecar}`);
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

  const isSidecar = (f: File) => /\.ya?ml$/i.test(f.name);

  /**
   * Import `.dbml` and `.dbml.yaml` files; either alone is fine. A layout file becomes the Layout
   * view's text as it is, so its problems show up there instead of being dropped quietly; it is
   * applied to the diagram only when it has no errors. Returns what was applied and what failed.
   */
  async function importFiles (files: Iterable<File>): Promise<{ done: string[]; failed: string[] }> {
    const list = [...files];
    const done: string[] = [];
    const failed: string[] = [];
    // Text first, so a layout arriving with it is checked against the schema it belongs to.
    for (const f of list.filter((x) => !isSidecar(x))) {
      replaceText(await f.text());
      done.push(f.name);
    }
    for (const f of list.filter(isSidecar)) {
      layoutText.setText(await f.text());
      layoutText.syncNow();
      const errors = layoutText.errors.length;
      const warnings = layoutText.warnings.length;
      if (errors) failed.push(`${f.name}: ${plural(errors, 'error')}, layout not applied`);
      else done.push(warnings ? `${f.name} (${plural(warnings, 'warning')})` : f.name);
      if (errors || warnings) ui.setEditorView('layout');
    }
    notify([done.length ? `Imported ${done.join(', ')}` : '', ...failed].filter(Boolean).join(' · '));
    return {
      done,
      failed,
    };
  }

  return {
    baseName,
    message,
    exportFiles,
    importFiles,
  };
}

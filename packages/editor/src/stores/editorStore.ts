import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import DEFAULT_SAMPLE from '@/sample/default.dbml?raw';
import { DOCUMENT_LANGUAGES, type DocumentLanguage } from '@/model/documentFormat';
import { usePersistedRef } from '@/utils/persistedRef';

/** Whether a link opened the page read-only: `?readonly`, unless set to `0` or `false`. */
export function readOnlyFromLocation (search: string = typeof location === 'undefined' ? '' : location.search): boolean {
  const flag = new URLSearchParams(search).get('readonly');
  return flag !== null && flag !== '0' && flag !== 'false';
}

export const useEditorStore = defineStore('editor', () => {
  // Stored as a raw string: no JSON escaping overhead for large schemas.
  const text = usePersistedRef<string>('text', DEFAULT_SAMPLE, {
    debounceMs: 500,
    serialize: (s) => s,
    deserialize: (s) => s,
    flushOnUnload: true,
  });
  /** What the text is: DBML, or a model file's JSON. */
  const language = usePersistedRef<DocumentLanguage>('language', 'dbml', {
    serialize: (s) => s,
    deserialize: (s) => s as DocumentLanguage,
    validate: (v): v is DocumentLanguage => DOCUMENT_LANGUAGES.includes(v as DocumentLanguage),
  });

  const isSample = computed(() => text.value === DEFAULT_SAMPLE);

  /**
   * Read-only: the diagram alone, for a reader or a host app. The editor is hidden, nothing is saved
   * to a file, and nothing is written into the text from the diagram or the menus; following a
   * file and arranging the diagram still work.
   */
  const readOnly = ref(readOnlyFromLocation());

  function setReadOnly (value: boolean): void {
    readOnly.value = value;
  }

  function setText (value: string): void {
    text.value = value;
  }

  function setLanguage (value: DocumentLanguage): void {
    if (language.value !== value) language.value = value;
  }

  function resetToSample (): void {
    language.value = 'dbml';
    text.value = DEFAULT_SAMPLE;
  }

  return {
    text,
    language,
    isSample,
    readOnly,
    setReadOnly,
    setText,
    setLanguage,
    resetToSample,
  };
});

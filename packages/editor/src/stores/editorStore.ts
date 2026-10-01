import { computed } from 'vue';
import { defineStore } from 'pinia';
import DEFAULT_SAMPLE from '@/sample/default.dbml?raw';
import { DOCUMENT_LANGUAGES, type DocumentLanguage } from '@/model/documentFormat';
import { usePersistedRef } from '@/utils/persistedRef';

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
    setText,
    setLanguage,
    resetToSample,
  };
});

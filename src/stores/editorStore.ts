import { computed } from 'vue';
import { defineStore } from 'pinia';
import DEFAULT_SAMPLE from '@/sample/default.dbml?raw';
import { usePersistedRef } from '@/utils/persistedRef';

export const useEditorStore = defineStore('editor', () => {
  // Stored as a raw string: no JSON escaping overhead for large schemas.
  const text = usePersistedRef<string>('text', DEFAULT_SAMPLE, {
    debounceMs: 500,
    serialize: (s) => s,
    deserialize: (s) => s,
    flushOnUnload: true,
  });

  const isSample = computed(() => text.value === DEFAULT_SAMPLE);

  function setText (value: string): void {
    text.value = value;
  }

  function resetToSample (): void {
    text.value = DEFAULT_SAMPLE;
  }

  return {
    text,
    isSample,
    setText,
    resetToSample,
  };
});

import {
  describe, it, expect, vi, afterEach,
} from 'vitest';
import { nextTick } from 'vue';
import { usePersistedRef, MemoryStorage, STORAGE_PREFIX } from '@/utils/persistedRef';

describe('usePersistedRef', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes the serialized value under the prefixed key after a change', async () => {
    const storage = new MemoryStorage();
    const state = usePersistedRef('k', { n: 1 }, { storage });
    expect(storage.getItem(`${STORAGE_PREFIX}k`)).toBeNull();

    state.value.n = 2;
    await nextTick();
    expect(JSON.parse(storage.getItem(`${STORAGE_PREFIX}k`)!)).toEqual({ n: 2 });
  });

  it('rehydrates from storage on creation', async () => {
    const storage = new MemoryStorage();
    const first = usePersistedRef('k', 'a', { storage });
    first.value = 'b';
    await nextTick();

    const second = usePersistedRef('k', 'a', { storage });
    expect(second.value).toBe('b');
  });

  it('falls back to the default on corrupt data or failed validation and reports the error', () => {
    const storage = new MemoryStorage();
    storage.setItem(`${STORAGE_PREFIX}bad`, '{not json');
    const onError = vi.fn();
    const state = usePersistedRef('bad', 42, {
      storage,
      onError,
    });
    expect(state.value).toBe(42);
    expect(onError).toHaveBeenCalledTimes(1);

    storage.setItem(`${STORAGE_PREFIX}shape`, JSON.stringify({ wrong: true }));
    const validated = usePersistedRef<{ ok: boolean }>('shape', () => ({ ok: true }), {
      storage,
      validate: (v): v is { ok: boolean } => typeof (v as any)?.ok === 'boolean',
    });
    expect(validated.value).toEqual({ ok: true });
  });

  it('debounces writes when debounceMs is set', async () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const state = usePersistedRef('d', 'x', {
      storage,
      debounceMs: 500,
    });

    state.value = 'y';
    await nextTick();
    vi.advanceTimersByTime(499);
    expect(storage.getItem(`${STORAGE_PREFIX}d`)).toBeNull();

    vi.advanceTimersByTime(1);
    expect(storage.getItem(`${STORAGE_PREFIX}d`)).toBe('"y"');
  });

  it('keeps the in-memory value and reports when the storage write fails', async () => {
    const storage = new MemoryStorage();
    storage.setItem = () => {
      throw new DOMException('quota', 'QuotaExceededError');
    };
    const onError = vi.fn();
    const state = usePersistedRef('q', 'a', {
      storage,
      onError,
    });

    state.value = 'b';
    await nextTick();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(state.value).toBe('b');
  });
});

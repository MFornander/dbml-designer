import { ref, watch, type Ref } from 'vue';
import { debounce } from 'lodash-es';

/** Bump the version segment when the persisted shape changes incompatibly. */
export const STORAGE_PREFIX = 'dbml-edit:v1:';

/** Minimal in-memory Storage used in tests and when localStorage is unavailable. */
export class MemoryStorage implements Storage {
  private map = new Map<string, string>();

  get length (): number {
    return this.map.size;
  }

  clear (): void {
    this.map.clear();
  }

  getItem (key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  key (index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  removeItem (key: string): void {
    this.map.delete(key);
  }

  setItem (key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

const fallbackStorage = new MemoryStorage();

function defaultStorage (): Storage {
  try {
    if (typeof localStorage !== 'undefined' && localStorage !== null) {
      return localStorage;
    }
  } catch {
    // Access to localStorage can throw in sandboxed or privacy contexts.
  }
  return fallbackStorage;
}

export interface PersistedRefOptions<T> {
  /** Defaults to localStorage, falling back to an in-memory store. */
  storage?: Storage;
  /** 0 (default) writes on every change; a positive value debounces writes. */
  debounceMs?: number;
  serialize?: (value: T) => string;
  deserialize?: (raw: string) => T;
  /** Reject corrupt or foreign data; falls back to the default value. */
  validate?: (value: unknown) => value is T;
  /** Deep-watch the value (default true). */
  deep?: boolean;
  /** Flush a pending debounced write on `pagehide`. */
  flushOnUnload?: boolean;
  /** Called for read/parse/write failures (for example QuotaExceededError). */
  onError?: (error: unknown) => void;
}

export function usePersistedRef<T> (
  key: string,
  defaultValue: T | (() => T),
  opts: PersistedRefOptions<T> = {},
): Ref<T> {
  const storage = opts.storage ?? defaultStorage();
  const fullKey = STORAGE_PREFIX + key;
  const serialize = opts.serialize ?? ((v: T) => JSON.stringify(v));
  const deserialize = opts.deserialize ?? ((s: string) => JSON.parse(s) as T);
  const getDefault = (): T => (typeof defaultValue === 'function' ? (defaultValue as () => T)() : defaultValue);

  let initial: T;
  try {
    const raw = storage.getItem(fullKey);
    if (raw === null) {
      initial = getDefault();
    } else {
      const parsed = deserialize(raw);
      initial = opts.validate && !opts.validate(parsed) ? getDefault() : parsed;
    }
  } catch (err) {
    opts.onError?.(err);
    initial = getDefault();
  }

  const state = ref(initial) as Ref<T>;

  let pending = false;
  const write = (): void => {
    pending = false;
    try {
      storage.setItem(fullKey, serialize(state.value));
    } catch (err) {
      opts.onError?.(err);
    }
  };

  // A custom deserializer may have migrated an older shape; persist the migrated form right away.
  if (opts.deserialize) {
    try {
      const raw = storage.getItem(fullKey);
      if (raw !== null && serialize(state.value) !== raw) write();
    } catch (err) {
      opts.onError?.(err);
    }
  }

  const debounceMs = opts.debounceMs ?? 0;
  const scheduled = debounceMs > 0 ? debounce(write, debounceMs) : null;

  watch(state, () => {
    if (scheduled) {
      pending = true;
      scheduled();
    } else {
      write();
    }
  }, {
    deep: opts.deep ?? true,
    flush: 'post',
  });

  if (opts.flushOnUnload && scheduled && typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => {
      if (pending) {
        scheduled.cancel();
        write();
      }
    });
  }

  return state;
}

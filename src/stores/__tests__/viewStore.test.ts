import {
  describe, it, expect, beforeEach,
} from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { buildDiagramModel } from '@/dbml/buildModel';
import { compile } from '@/diagram/__tests__/testUtils';
import { useViewStore } from '@/stores/viewStore';

const model = buildDiagramModel(compile(`
  Table users { id int [pk] }
  Table posts { id int [pk] }
  Note tips { 'a' }
  DiagramView focus {
    tables {
      users
    }
  }
`));

describe('viewStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('starts on the default view with nothing hidden and follows the model', () => {
    const store = useViewStore();
    store.sync(model);
    expect(store.activeView).toBeNull();
    expect(store.hidden.size).toBe(0);
    expect(store.views.map((v) => v.name)).toEqual(['focus']);
  });

  it('selecting a view applies its definition; toggles make it dirty; revert and adopt settle it', () => {
    const store = useViewStore();
    store.sync(model);
    store.select('focus', model);
    expect(store.view?.name).toBe('focus');
    expect([...store.hidden]).toEqual(['public.posts']);
    expect(store.dirty).toBe(false);

    store.toggle('note:tips');
    expect(store.dirty).toBe(true);
    // A re-parse that leaves the definition alone keeps the unsaved toggle.
    store.sync(model);
    expect(store.hidden.has('note:tips')).toBe(true);

    store.revert();
    expect(store.dirty).toBe(false);
    store.setHidden(['public.users', 'public.posts'], true);
    store.adopt('focus');
    expect(store.dirty).toBe(false);
    expect([...store.baseHidden].sort()).toEqual(['public.posts', 'public.users']);
  });

  it('falls back to the default view when the active view disappears from the text', () => {
    const store = useViewStore();
    store.sync(model);
    store.select('focus', model);
    const without = buildDiagramModel(compile('Table users { id int [pk] }\nTable posts { id int [pk] }'));
    store.sync(without);
    expect(store.activeView).toBeNull();
    expect(store.hidden.size).toBe(0);
  });
});

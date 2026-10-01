// @vitest-environment happy-dom
import {
  describe, it, expect, beforeEach, afterEach,
} from 'vitest';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useEditorStore } from '@/stores/editorStore';
import { useParserStore } from '@/stores/parserStore';
import { useUiStore } from '@/stores/uiStore';
import { useViewStore, viewFromLocation } from '@/stores/viewStore';

const TABLES = [
  'Table input.item {\n  unit_cost double\n}',
  'Table money.line_price {\n  price double\n}',
  'Dep: input.item.unit_cost -> money.line_price.price',
  '',
].join('\n');

const WITH_VIEW = `${TABLES}\nDiagramView trace_L1_price {\n  Tables {\n    input.item\n    money.line_price\n  }\n}\n`;

/** Put text in the editor and read it at once instead of after the typing pause. */
async function read (text: string): Promise<void> {
  useEditorStore().setText(text);
  await nextTick();
  useParserStore().parseNow(text);
  await nextTick();
  await nextTick();
}

function fresh (): void {
  localStorage.clear();
  setActivePinia(createPinia());
}

describe('viewFromLocation', () => {
  it('reads the view a link asks for', () => {
    expect(viewFromLocation('?view=trace_L1_price')).toBe('trace_L1_price');
    expect(viewFromLocation('?file=x&view=a%20b')).toBe('a b');
    expect(viewFromLocation('?view=')).toBeNull();
    expect(viewFromLocation('')).toBeNull();
  });
});

describe('a view opened from a link', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('opens once the document has it, and only once', async () => {
    window.history.replaceState(null, '', '/?view=trace_L1_price');
    fresh();
    const views = useViewStore();
    await read(TABLES);
    expect(views.activeView).toBeNull();
    // A followed file gains it later.
    await read(WITH_VIEW);
    expect(views.activeView).toBe('trace_L1_price');
    // The link has done its work: picking another view sticks.
    views.select(null);
    await read(`${WITH_VIEW}\n`);
    expect(views.activeView).toBeNull();
  });
});

describe('following new views', () => {
  beforeEach(fresh);

  it('switches to a view the followed file gains on disk when the option is on', async () => {
    const views = useViewStore();
    useUiStore().toggleFollowNewViews();
    await read(TABLES);
    views.noteDiskChange();
    await read(WITH_VIEW);
    expect(views.activeView).toBe('trace_L1_price');
  });

  it('does nothing when the option is off, or for a view typed in the editor', async () => {
    const views = useViewStore();
    await read(TABLES);
    views.noteDiskChange();
    await read(WITH_VIEW);
    expect(views.activeView).toBeNull();

    useUiStore().toggleFollowNewViews();
    await read(TABLES);
    await read(WITH_VIEW);
    expect(views.activeView).toBeNull();
  });
});

// @vitest-environment happy-dom
import {
  describe, it, expect, beforeEach, afterEach, vi,
} from 'vitest';
import { mount } from '@vue/test-utils';
import {
  defineComponent, h, nextTick, shallowRef,
} from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { ARRANGE_NOTICE_MS, useArrange, type ArrangeCanvas } from '@/components/useArrange';
import { buildDiagramModel } from '@/dbml/buildModel';
import { useEditorStore } from '@/stores/editorStore';
import { useLayoutStore } from '@/stores/layoutStore';
import { useParserStore } from '@/stores/parserStore';
import { useUiStore } from '@/stores/uiStore';
import { useViewStore } from '@/stores/viewStore';

const DBML = 'Table users {\n  id int [pk]\n}\nTable posts {\n  id int [pk]\n}\n';
const ARRANGED = [
  { key: 'public.users', x: 32, y: 64 },
  { key: 'public.posts', x: 400, y: 64 },
];

/** Mount useArrange with a canvas that "arranges" by storing a fixed result, as the engine's diagram does, and reporting it. */
function setup () {
  localStorage.clear();
  document.body.innerHTML = '';
  setActivePinia(createPinia());
  useEditorStore().setText(DBML);
  const parser = useParserStore();
  parser.parseNow(DBML);
  useViewStore().select(null, buildDiagramModel(parser.rawDatabase!));
  const layout = useLayoutStore();
  layout.resetLayout();
  layout.applyPositionChanges([
    { key: 'public.users', x: 0, y: 0 },
    { key: 'public.posts', x: 0, y: 200 },
  ]);
  let api!: ReturnType<typeof useArrange>;
  const canvas: ArrangeCanvas = {
    arrange: vi.fn(() => {
      layout.applyArrangement(ARRANGED, []);
      api.noticeArranged();
      return true;
    }),
    refit: vi.fn(),
  };
  const wrapper = mount(defineComponent({
    setup () {
      api = useArrange(shallowRef(canvas));
      return () => h('div');
    },
  }), { attachTo: document.body });
  return {
    wrapper,
    canvas,
    layout,
    parser,
    api: () => api,
  };
}

function pressUndo (target: EventTarget = document.body, extra: ConstructorParameters<typeof KeyboardEvent>[1] = {}): KeyboardEvent {
  const e = new KeyboardEvent('keydown', {
    key: 'z',
    metaKey: true,
    bubbles: true,
    cancelable: true,
    ...extra,
  });
  target.dispatchEvent(e);
  return e;
}

describe('useArrange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('carries out an Arrange request once the model has caught up, leaving Lineage Layout for the stored layout', async () => {
    const { wrapper, canvas, layout, parser } = setup();
    const ui = useUiStore();
    ui.toggleLineageLayout();
    parser.isLoading = true;
    layout.requestArrange('arrange');
    await nextTick();
    expect(canvas.arrange).not.toHaveBeenCalled();

    parser.isLoading = false;
    await nextTick();
    expect(canvas.arrange).toHaveBeenCalledTimes(1);
    expect(layout.arrangeRequest).toBeNull();
    expect(ui.lineageLayout).toBe(false);
    expect(layout.positions['public.posts']).toEqual({ x: 400, y: 64 });
    wrapper.unmount();
  });

  it('reports the arrangement until it times out or the layout moves on', async () => {
    const { wrapper, layout, api } = setup();
    layout.requestArrange('arrange');
    await nextTick();
    expect(api().noticeTables.value).toBe(2);
    vi.advanceTimersByTime(ARRANGE_NOTICE_MS);
    expect(api().noticeTables.value).toBe(0);
    // ⌘Z still works after the notice is gone.
    expect(layout.canUndoArrange).toBe(true);

    layout.requestArrange('arrange');
    await nextTick();
    expect(api().noticeTables.value).toBe(2);
    layout.setPosition('public.users', { x: 8, y: 8 });
    expect(api().noticeTables.value).toBe(0);
    wrapper.unmount();
  });

  it('takes the arrangement back on ⌘Z or Ctrl+Z, but never from a text field or an editor', async () => {
    const { wrapper, canvas, layout } = setup();
    layout.requestArrange('arrange');
    await nextTick();

    const field = document.createElement('textarea');
    document.body.appendChild(field);
    field.focus();
    expect(pressUndo(field).defaultPrevented).toBe(false);
    field.blur();
    const monaco = document.createElement('div');
    monaco.className = 'monaco-editor';
    const textbox = document.createElement('div');
    textbox.setAttribute('role', 'textbox');
    textbox.tabIndex = 0;
    monaco.appendChild(textbox);
    document.body.appendChild(monaco);
    textbox.focus();
    expect(pressUndo(textbox).defaultPrevented).toBe(false);
    textbox.blur();
    // Redo is not taken either.
    expect(pressUndo(document.body, { shiftKey: true }).defaultPrevented).toBe(false);
    expect(layout.canUndoArrange).toBe(true);

    expect(pressUndo(document.body, { metaKey: false, ctrlKey: true }).defaultPrevented).toBe(true);
    expect(layout.positions['public.posts']).toEqual({ x: 0, y: 200 });
    expect(canvas.refit).toHaveBeenCalledTimes(1);
    // One step: a second press has nothing to take back and leaves the key alone.
    expect(pressUndo().defaultPrevented).toBe(false);
    wrapper.unmount();
  });

  it('asks the canvas to place only the tables auto-placement put down', async () => {
    const { wrapper, canvas, layout } = setup();
    layout.applyPositionChanges([{ key: 'public.posts', x: 900, y: 0 }], 'auto');
    layout.requestArrange('arrange-new');
    await nextTick();
    expect(canvas.arrange).toHaveBeenCalledWith(new Set(['public.posts']));
    wrapper.unmount();
  });

  it('takes the arrangement back when the View menu asks', async () => {
    const { wrapper, canvas, layout } = setup();
    layout.requestArrange('arrange');
    await nextTick();
    layout.requestArrange('undo');
    await nextTick();
    expect(layout.positions['public.users']).toEqual({ x: 0, y: 0 });
    expect(canvas.refit).toHaveBeenCalledTimes(1);
    expect(layout.arrangeRequest).toBeNull();
    wrapper.unmount();
  });
});

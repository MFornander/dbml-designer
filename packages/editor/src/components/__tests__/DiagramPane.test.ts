// @vitest-environment happy-dom
import {
  describe, it, expect, beforeEach,
} from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import DiagramPane from '@/components/DiagramPane.vue';
import { useEditorStore } from '@/stores/editorStore';
import { useParserStore } from '@/stores/parserStore';
import { useUiStore } from '@/stores/uiStore';
import GRAIN from '@/dbml/__tests__/fixtures/partialGrain.dbml?raw';

const TOGGLE = 'button[aria-label="Partial refs as badges"]';

async function mountPane (text: string) {
  useEditorStore().setText(text);
  useParserStore().parseNow(text);
  const wrapper = mount(DiagramPane, { attachTo: document.body });
  // Let the new tables be placed and drawn.
  await flushPromises();
  await nextTick();
  return wrapper;
}

describe('DiagramPane partial refs toggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    setActivePinia(createPinia());
  });

  it('shows even while no partial carries refs', async () => {
    const wrapper = await mountPane('TablePartial stamped { created_at timestamp }\nTable users {\n  id int [pk]\n  ~stamped\n}\n');
    expect(wrapper.find(TOGGLE).exists()).toBe(true);
    wrapper.unmount();
  });

  it('is pressed while partial refs are badges, the default, and switches the diagram to lines and back', async () => {
    const wrapper = await mountPane(GRAIN);
    const toggle = wrapper.find(TOGGLE);
    expect(toggle.attributes('aria-pressed')).toBe('true');
    expect(toggle.attributes('title')).toBe('Draw partial refs as lines');
    expect(wrapper.findAll('.dg-partial-badge')).toHaveLength(6);
    expect(wrapper.findAll('.dg-ref:not(.dg-dep)')).toHaveLength(0);

    await toggle.trigger('click');
    expect(useUiStore().partialRefMode).toBe('lines');
    expect(toggle.attributes('aria-pressed')).toBe('false');
    expect(toggle.attributes('title')).toBe('Show partial refs as badges');
    expect(wrapper.findAll('.dg-partial-badge')).toHaveLength(0);
    expect(wrapper.findAll('.dg-ref:not(.dg-dep)')).toHaveLength(9);

    await toggle.trigger('click');
    expect(wrapper.findAll('.dg-partial-badge')).toHaveLength(6);
    wrapper.unmount();
  });
});

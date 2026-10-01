// @vitest-environment happy-dom
import {
  describe, it, expect, beforeEach, vi,
} from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { ENGINE_VERSION } from '@dbml-designer/engine';
import { version } from '../../../package.json';

vi.mock('@/files/fileBridge', () => ({
  BridgeError: class extends Error {},
  fileBridge: {
    roots: vi.fn(async () => ({ roots: [], files: [] })),
    read: vi.fn(),
    write: vi.fn(),
    watch: vi.fn(() => () => undefined),
  },
}));

const { default: AppHeader } = await import('@/components/AppHeader.vue');

describe('AppHeader', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('ends the menu with the editor and engine versions, dimmed and not a menu item', async () => {
    const wrapper = mount(AppHeader, {
      attachTo: document.body,
      global: {
        stubs: {
          FileMenu: true,
          ViewMenu: true,
        },
      },
    });
    await wrapper.find('button[aria-label="Menu"]').trigger('click');
    await nextTick();
    const last = wrapper.findAll('[role="menu"] > *').at(-1)!;
    expect(last.text()).toBe(`editor v${version} engine v${ENGINE_VERSION}`);
    expect(last.attributes('role')).toBe('none');
    expect(last.classes()).toContain('text-gray-400');
    wrapper.unmount();
  });
});

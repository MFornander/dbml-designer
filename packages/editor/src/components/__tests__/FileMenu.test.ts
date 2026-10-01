// @vitest-environment happy-dom
import {
  describe, it, expect, beforeEach, vi,
} from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

const disk = {
  files: ['/repo/pipeline.dbml', '/repo/schema.dbml'],
  texts: {
    '/repo/pipeline.dbml': 'Table a {\n  id int\n}\n',
    '/repo/schema.dbml': 'Table b {\n  id int\n}\n',
  } as Record<string, string>,
};

vi.mock('@/files/fileBridge', () => {
  class BridgeError extends Error {
    constructor (public readonly status: number, message: string) {
      super(message);
    }
  }
  return {
    BridgeError,
    fileBridge: {
      roots: vi.fn(async () => ({ roots: ['/repo'], files: disk.files })),
      read: vi.fn(async (path: string) => {
        const text = disk.texts[path];
        if (text === undefined) throw new BridgeError(404, 'No such file');
        return { path, text, mtimeMs: 1 };
      }),
      write: vi.fn(async (path: string, text: string) => {
        disk.texts[path] = text;
        return { path, mtimeMs: 2 };
      }),
      watch: vi.fn(() => () => undefined),
    },
  };
});

const { default: FileMenu } = await import('@/components/FileMenu.vue');
const { useFileLinkStore } = await import('@/stores/fileLinkStore');
const { useEditorStore } = await import('@/stores/editorStore');
const { useParserStore } = await import('@/stores/parserStore');

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('FileMenu', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useParserStore().parseNow('Table x { id int }');
  });

  it('shows the current file and lists the files under the roots with the current one checked', async () => {
    const link = useFileLinkStore();
    await link.resume();
    const wrapper = mount(FileMenu, { attachTo: document.body });
    await nextTick();
    const trigger = wrapper.find('button[aria-label="Current file"]');
    expect(trigger.text().replace(/\s+/g, ' ').trim()).toBe('pipeline.dbml');

    await trigger.trigger('click');
    await flush();
    await nextTick();
    const options = wrapper.findAll('[role="option"]');
    expect(options.map((o) => o.text())).toEqual(['pipeline.dbml', 'schema.dbml']);
    expect(options[0]!.attributes('aria-selected')).toBe('true');
    expect(options[0]!.find('svg').exists()).toBe(true);
    // The root is shown as a title above its files, and cannot be picked.
    const title = wrapper.find('[role="listbox"] div[title="/repo"]');
    expect(title.exists()).toBe(true);
    expect(title.text()).toBe('/repo');
    expect(title.attributes('role')).toBeUndefined();
    // Long paths lose their head, not their tail: the box flows right to left around a left-to-right path.
    expect(title.classes()).toContain('[direction:rtl]');
    expect(title.find('bdi[dir="ltr"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('switches to a picked file and closes', async () => {
    const link = useFileLinkStore();
    await link.resume();
    const wrapper = mount(FileMenu, { attachTo: document.body });
    await wrapper.find('button[aria-label="Current file"]').trigger('click');
    await flush();
    await nextTick();
    await wrapper.findAll('[role="option"]')[1]!.trigger('click');
    await flush();
    await nextTick();
    expect(link.path).toBe('/repo/schema.dbml');
    expect(useEditorStore().text).toContain('Table b');
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('reloads the file from disk from the button next to the name', async () => {
    const link = useFileLinkStore();
    const editor = useEditorStore();
    await link.resume();
    const wrapper = mount(FileMenu, { attachTo: document.body });
    await nextTick();
    const original = disk.texts['/repo/pipeline.dbml']!;
    disk.texts['/repo/pipeline.dbml'] = 'Table a {\n  id int\n  name text\n}\n';
    await wrapper.find('button[aria-label="Reload from disk"]').trigger('click');
    await flush();
    await nextTick();
    expect(editor.text).toContain('name text');
    expect(link.dirty).toBe(false);
    disk.texts['/repo/pipeline.dbml'] = original;
    wrapper.unmount();
  });
});

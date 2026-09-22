// @vitest-environment happy-dom
import {
  describe, it, expect, beforeEach,
} from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import DiagramViewsPanel from '@/components/DiagramViewsPanel.vue';
import { buildDiagramModel } from '@/diagram';
import { useEditorStore } from '@/stores/editorStore';
import { useLayoutStore } from '@/stores/layoutStore';
import { useParserStore } from '@/stores/parserStore';
import { useViewStore } from '@/stores/viewStore';

const DBML = [
  'Table users { id int [pk] }',
  'Table posts { id int [pk] }',
  '',
  'DiagramView first {',
  '  tables {',
  '    users',
  '  }',
  '}',
  '',
].join('\n');

function setup (activeView: string | null) {
  localStorage.clear();
  setActivePinia(createPinia());
  const editor = useEditorStore();
  editor.setText(DBML);
  const parser = useParserStore();
  parser.parseNow(DBML);
  const model = buildDiagramModel(parser.rawDatabase!);
  const views = useViewStore();
  views.sync(model);
  views.select(activeView, model);
  const wrapper = mount(DiagramViewsPanel, {
    props: { model },
    attachTo: document.body,
  });
  return {
    editor,
    views,
    wrapper,
  };
}

const texts = (wrapper: ReturnType<typeof mount>, selector: string) => wrapper.findAll(selector).map((w) => w.text().replace(/\s+/g, ' ').trim());

describe('DiagramViewsPanel menus', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('has no view picker of its own, only the saving row and the tree', async () => {
    const { wrapper } = setup('first');
    expect(wrapper.find('button[aria-label="Diagram view"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="View actions"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="Save options"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('renames the block in the DBML along with its layout when the header asks for a rename', async () => {
    const { wrapper, editor, views } = setup('first');
    // Arranged while the view is active: this belongs to the view.
    const layout = useLayoutStore();
    layout.setPosition('public.users', { x: 5, y: 5 });
    expect(Object.keys(layout.snapshot().views!)).toEqual(['first']);

    views.requestRename();
    await nextTick();
    await nextTick();
    expect(views.pendingRequest).toBeNull();
    const input = wrapper.find<HTMLInputElement>('input[aria-label="New name for the view"]');
    expect(input.exists()).toBe(true);
    expect(input.element.value).toBe('first');
    await input.setValue('Core tables');
    await wrapper.find('form').trigger('submit');
    expect(editor.text).toContain('DiagramView "Core tables" {');
    expect(editor.text).not.toContain('DiagramView first');
    expect(views.activeView).toBe('Core tables');
    expect(Object.keys(layout.snapshot().views!)).toEqual(['Core tables']);
    expect(layout.positions['public.users']).toEqual({ x: 5, y: 5 });
    wrapper.unmount();
  });

  it('Save as New and a New View request from the header create a view of what is shown, named in a form', async () => {
    const { wrapper, editor, views } = setup(null);
    views.toggle('public.posts');
    await nextTick();
    await wrapper.find('button[aria-label="Save options"]').trigger('click');
    expect(texts(wrapper, '[role="menu"] [role="menuitem"]')).toEqual(['Save as New']);
    await wrapper.find('[role="menuitem"]').trigger('click');
    const input = wrapper.find<HTMLInputElement>('input[aria-label="New view name"]');
    expect(input.element.value).toBe('New View');
    await wrapper.find('form').trigger('submit');
    expect(editor.text).toContain('DiagramView "New View" {\n  tables {\n    users\n  }\n}');
    expect(views.activeView).toBe('New View');
    expect(views.dirty).toBe(false);

    // A second one asked for from the header's menu gets the next free name.
    useParserStore().parseNow(editor.text);
    const model = buildDiagramModel(useParserStore().rawDatabase!);
    await wrapper.setProps({ model });
    views.sync(model);
    views.requestCreate();
    await nextTick();
    await nextTick();
    expect(views.pendingRequest).toBeNull();
    expect(wrapper.find<HTMLInputElement>('input[aria-label="New view name"]').element.value).toBe('New View 2');
    wrapper.unmount();
  });

  it('closes an open list on Escape and on a click elsewhere', async () => {
    const { wrapper } = setup('first');
    await wrapper.find('button[aria-label="Save options"]').trigger('click');
    expect(wrapper.find('[role="menu"]').exists()).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);

    await wrapper.find('button[aria-label="Save options"]').trigger('click');
    expect(wrapper.find('[role="menu"]').exists()).toBe(true);
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await nextTick();
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

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

  it('lists the views with the active one checked and a New View entry', async () => {
    const { wrapper, views } = setup('first');
    expect(wrapper.find('button[aria-label="Diagram view"]').text()).toBe('first');
    await wrapper.find('button[aria-label="Diagram view"]').trigger('click');
    const list = wrapper.find('[role="listbox"]');
    expect(texts(wrapper, '[role="listbox"] [role="option"]')).toEqual(['Default View', 'first', 'New View']);
    expect(list.find('[role="option"][aria-selected="true"]').text()).toBe('first');

    await list.findAll('[role="option"]')[0]!.trigger('click');
    expect(views.activeView).toBeNull();
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="Diagram view"]').text()).toBe('Default View');
    wrapper.unmount();
  });

  it('opens Rename and Delete from the dots, and renames the block in the DBML', async () => {
    const { wrapper, editor, views } = setup('first');
    await wrapper.find('button[aria-label="View actions"]').trigger('click');
    expect(texts(wrapper, '[role="menu"] [role="menuitem"]')).toEqual(['Rename', 'Delete']);

    await wrapper.find('[role="menuitem"]').trigger('click');
    const input = wrapper.find<HTMLInputElement>('input[aria-label="New name for the view"]');
    expect(input.exists()).toBe(true);
    expect(input.element.value).toBe('first');
    await input.setValue('Core tables');
    await wrapper.find('form').trigger('submit');
    expect(editor.text).toContain('DiagramView "Core tables" {');
    expect(editor.text).not.toContain('DiagramView first');
    expect(views.activeView).toBe('Core tables');
    expect(wrapper.find('button[aria-label="Diagram view"]').text()).toBe('Core tables');
    wrapper.unmount();
  });

  it('deletes the active view from the DBML and falls back to the Default View', async () => {
    const { wrapper, editor, views } = setup('first');
    await wrapper.find('button[aria-label="View actions"]').trigger('click');
    await wrapper.findAll('[role="menuitem"]')[1]!.trigger('click');
    expect(editor.text).not.toContain('DiagramView');
    expect(editor.text.trimEnd()).toBe('Table users { id int [pk] }\nTable posts { id int [pk] }');
    expect(views.activeView).toBeNull();
    wrapper.unmount();
  });

  it('keeps Rename and Delete disabled for the Default View', async () => {
    const { wrapper } = setup(null);
    await wrapper.find('button[aria-label="View actions"]').trigger('click');
    const items = wrapper.findAll('[role="menuitem"]');
    expect(items).toHaveLength(2);
    expect(items.every((i) => (i.element as HTMLButtonElement).disabled)).toBe(true);
    wrapper.unmount();
  });

  it('Save as New and + New View create a view of what is shown, named in a form', async () => {
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

    // A second one from the picker gets the next free name.
    useParserStore().parseNow(editor.text);
    const model = buildDiagramModel(useParserStore().rawDatabase!);
    await wrapper.setProps({ model });
    views.sync(model);
    await wrapper.find('button[aria-label="Diagram view"]').trigger('click');
    await wrapper.findAll('[role="option"]').at(-1)!.trigger('click');
    expect(wrapper.find<HTMLInputElement>('input[aria-label="New view name"]').element.value).toBe('New View 2');
    wrapper.unmount();
  });

  it('closes an open list on Escape and on a click elsewhere', async () => {
    const { wrapper } = setup('first');
    await wrapper.find('button[aria-label="Diagram view"]').trigger('click');
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);

    await wrapper.find('button[aria-label="View actions"]').trigger('click');
    expect(wrapper.find('[role="menu"]').exists()).toBe(true);
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await nextTick();
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

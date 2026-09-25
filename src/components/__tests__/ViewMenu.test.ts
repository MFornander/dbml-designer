// @vitest-environment happy-dom
import {
  describe, it, expect, beforeEach,
} from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import ViewMenu from '@/components/ViewMenu.vue';
import { buildDiagramModel } from '@/diagram';
import { useEditorStore } from '@/stores/editorStore';
import { useLayoutStore } from '@/stores/layoutStore';
import { useParserStore } from '@/stores/parserStore';
import { useUiStore } from '@/stores/uiStore';
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
  document.body.innerHTML = '';
  setActivePinia(createPinia());
  useEditorStore().setText(DBML);
  const parser = useParserStore();
  parser.parseNow(DBML);
  const model = buildDiagramModel(parser.rawDatabase!);
  const views = useViewStore();
  views.sync(model);
  views.select(activeView, model);
  const wrapper = mount(ViewMenu, { attachTo: document.body });
  return {
    wrapper,
    views,
    ui: useUiStore(),
  };
}

const texts = (wrapper: ReturnType<typeof mount>, selector: string) => wrapper.findAll(selector).map((w) => w.text().replace(/\s+/g, ' ').trim());
/** An option's label: the text after its icon or check slot, without the hint at the right. */
const labels = (wrapper: ReturnType<typeof mount>) => wrapper.findAll('[role="option"]').map((o) => o.findAll('span')[1]?.text().trim());
const option = (wrapper: ReturnType<typeof mount>, label: string) => wrapper.findAll('[role="option"]')[labels(wrapper).indexOf(label)]!;
const isDisabled = (wrapper: ReturnType<typeof mount>, label: string) => (option(wrapper, label).element as HTMLButtonElement).disabled;

describe('ViewMenu', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('lists the views with the active one checked and switches, hiding what the picked view hides', async () => {
    const { wrapper, views } = setup('first');
    const trigger = wrapper.find('button[aria-label="Diagram view"]');
    // Titled like the bottom toolbar's pickers: a muted word, then the value.
    expect(trigger.findAll('span').map((el) => el.text())).toEqual(['View', 'first']);
    expect(views.hidden.has('public.posts')).toBe(true);
    await trigger.trigger('click');
    expect(labels(wrapper)).toEqual(['Default', 'first', 'New View', 'Rename…', 'Reset', 'Delete', 'Arrange', 'Arrange new tables', 'Undo arrange']);
    expect(texts(wrapper, '[role="listbox"] [role="option"]').at(-1)).toContain('⌘Z');
    expect(wrapper.find('[role="option"][aria-selected="true"]').text()).toBe('first');

    await wrapper.findAll('[role="option"]')[0]!.trigger('click');
    expect(views.activeView).toBeNull();
    expect(views.hidden.size).toBe(0);
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
    expect(trigger.findAll('span').map((el) => el.text())).toEqual(['View', 'Default']);

    await trigger.trigger('click');
    await wrapper.findAll('[role="option"]')[1]!.trigger('click');
    expect(views.activeView).toBe('first');
    expect(views.hidden.has('public.posts')).toBe(true);
    wrapper.unmount();
  });

  it('shows and hides the panel from the button beside the menu, and New View opens it asking for a name', async () => {
    const { wrapper, views, ui } = setup(null);
    const toggle = wrapper.find('button[aria-label="Diagram Views panel"]');
    expect(ui.viewsOpen).toBe(false);
    expect(toggle.attributes('aria-pressed')).toBe('false');
    await toggle.trigger('click');
    expect(ui.viewsOpen).toBe(true);
    expect(toggle.attributes('aria-pressed')).toBe('true');
    await toggle.trigger('click');
    expect(ui.viewsOpen).toBe(false);

    await wrapper.find('button[aria-label="Diagram view"]').trigger('click');
    await wrapper.findAll('[role="option"]')[2]!.trigger('click');
    expect(ui.viewsOpen).toBe(true);
    expect(views.pendingRequest).toBe('create');
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renames through the panel, resets unsaved toggles, and deletes the active view from the DBML, with Rename and Delete disabled for the Default View', async () => {
    const { wrapper, views, ui } = setup(null);
    await wrapper.find('button[aria-label="Diagram view"]').trigger('click');
    const disabled = () => ['Rename…', 'Reset', 'Delete'].map((label) => isDisabled(wrapper, label));
    // Rename, Reset, Delete: nothing to rename or delete on Default, nothing toggled to reset.
    expect(disabled()).toEqual([true, true, true]);
    await wrapper.findAll('[role="option"]')[1]!.trigger('click');
    expect(views.activeView).toBe('first');

    views.toggle('public.posts');
    await wrapper.find('button[aria-label="Diagram view"]').trigger('click');
    expect(disabled()).toEqual([false, false, false]);
    await option(wrapper, 'Reset').trigger('click');
    expect(views.dirty).toBe(false);
    expect(views.hidden.has('public.posts')).toBe(true);

    await wrapper.find('button[aria-label="Diagram view"]').trigger('click');
    await option(wrapper, 'Rename…').trigger('click');
    expect(ui.viewsOpen).toBe(true);
    expect(views.pendingRequest).toBe('rename');

    await wrapper.find('button[aria-label="Diagram view"]').trigger('click');
    await option(wrapper, 'Delete').trigger('click');
    const editor = useEditorStore();
    expect(editor.text).not.toContain('DiagramView');
    expect(editor.text.trimEnd()).toBe('Table users { id int [pk] }\nTable posts { id int [pk] }');
    expect(views.activeView).toBeNull();
    wrapper.unmount();
  });

  it('asks the diagram to arrange the active view, and offers Undo arrange only while it can be taken back', async () => {
    const { wrapper } = setup('first');
    const layout = useLayoutStore();
    await wrapper.find('button[aria-label="Diagram view"]').trigger('click');
    expect(isDisabled(wrapper, 'Arrange')).toBe(false);
    expect(isDisabled(wrapper, 'Undo arrange')).toBe(true);
    await option(wrapper, 'Arrange').trigger('click');
    // The pane carries the request out, since it has the measured sizes.
    expect(layout.arrangeRequest).toBe('arrange');
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);

    layout.clearArrangeRequest();
    layout.applyArrangement([{ key: 'public.users', x: 32, y: 64 }]);
    await wrapper.find('button[aria-label="Diagram view"]').trigger('click');
    expect(isDisabled(wrapper, 'Undo arrange')).toBe(false);
    await option(wrapper, 'Undo arrange').trigger('click');
    expect(layout.arrangeRequest).toBe('undo');
    wrapper.unmount();
  });

  it('offers Arrange new tables for the tables this view shows that auto-placement put down', async () => {
    const { wrapper } = setup('first');
    const layout = useLayoutStore();
    await wrapper.find('button[aria-label="Diagram view"]').trigger('click');
    expect(isDisabled(wrapper, 'Arrange new tables')).toBe(true);
    // posts is hidden in this view, so only users counts.
    layout.applyPositionChanges([
      { key: 'public.users', x: 0, y: 0 },
      { key: 'public.posts', x: 0, y: 200 },
    ], 'auto');
    await nextTick();
    expect(isDisabled(wrapper, 'Arrange new tables')).toBe(false);
    expect(option(wrapper, 'Arrange new tables').text()).toMatch(/1$/);
    await option(wrapper, 'Arrange new tables').trigger('click');
    expect(layout.arrangeRequest).toBe('arrange-new');
    wrapper.unmount();
  });

  it('closes the list on Escape and on a click elsewhere', async () => {
    const { wrapper } = setup('first');
    await wrapper.find('button[aria-label="Diagram view"]').trigger('click');
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);

    await wrapper.find('button[aria-label="Diagram view"]').trigger('click');
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await nextTick();
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

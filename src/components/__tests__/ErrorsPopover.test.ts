// @vitest-environment happy-dom
import {
  describe, it, expect, beforeEach,
} from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import ErrorsPopover from '@/components/problems/ErrorsPopover.vue';
import { useLayoutTextStore } from '@/stores/layoutTextStore';
import { useParserStore } from '@/stores/parserStore';
import { useUiStore } from '@/stores/uiStore';

describe('ErrorsPopover', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useUiStore().setProblemsOpen(false);
  });

  it('renders nothing while the DBML is clean', async () => {
    useParserStore().parseNow('Table users { id int [pk] }');
    const wrapper = mount(ErrorsPopover, { attachTo: document.body });
    await nextTick();
    expect(wrapper.find('button').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows an error pill that toggles a grouped, categorized list', async () => {
    const parser = useParserStore();
    parser.parseNow('Table users {\n  id int [pk]\n\nTable posts { id int }');
    const wrapper = mount(ErrorsPopover, { attachTo: document.body });
    await nextTick();
    const pill = wrapper.find('button[aria-controls="dbml-errors-panel"]');
    expect(pill.exists()).toBe(true);
    expect(pill.text()).toMatch(/^\d+ errors?$/);
    expect(pill.classes().some((c) => c.startsWith('bg-red'))).toBe(true);
    expect(wrapper.find('#dbml-errors-panel').exists()).toBe(false);

    await pill.trigger('click');
    const panel = wrapper.find('#dbml-errors-panel');
    expect(panel.exists()).toBe(true);
    expect(panel.find('h2').text()).toBe('Errors');
    expect(panel.text()).toContain(`${parser.errors.length} in this file`);
    // Plain syntax errors fall into the parser's "other" category, shown as a collapsible group.
    const groupHeader = panel.find('button[aria-expanded]');
    expect(groupHeader.text().toLowerCase()).toContain('other');
    const rowsBefore = panel.findAll('.explanation').length;
    expect(rowsBefore).toBeGreaterThan(0);
    await groupHeader.trigger('click');
    expect(panel.findAll('.explanation')).toHaveLength(0);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(wrapper.find('#dbml-errors-panel').exists()).toBe(false);
    wrapper.unmount();
  });

  it('counts layout problems too and jumps to the Layout view for them', async () => {
    useParserStore().parseNow('Table users { id int [pk] }');
    const layoutText = useLayoutTextStore();
    layoutText.setText('version: 1\ntables:\n  public:\n    ghost: { x: 1, y: 2 }\n');
    layoutText.syncNow();
    const ui = useUiStore();
    ui.setEditorView('dbml');

    const wrapper = mount(ErrorsPopover, { attachTo: document.body });
    await nextTick();
    const pill = wrapper.find('button[aria-controls="dbml-errors-panel"]');
    expect(pill.text()).toBe('1 warning');
    expect(pill.classes().some((c) => c.startsWith('bg-amber'))).toBe(true);

    await pill.trigger('click');
    const panel = wrapper.find('#dbml-errors-panel');
    expect(panel.find('h2').text()).toBe('Warnings');
    expect(panel.text()).toContain('1 in the layout');
    expect(panel.find('button[aria-expanded]').text().toLowerCase()).toContain('layout');
    expect(panel.text()).toContain('Table "ghost" is not in the DBML');

    await panel.find('.explanation').trigger('click');
    expect(ui.editorView).toBe('layout');
    wrapper.unmount();
  });
});

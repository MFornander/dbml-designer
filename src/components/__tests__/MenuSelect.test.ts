// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import MenuSelect from '@/components/common/MenuSelect.vue';

const OPTIONS = [
  { value: 'all', label: 'All fields' },
  { value: 'keys', label: 'Keys only' },
  { value: 'names', label: 'Table names' },
] as const;

function mountSelect (modelValue: 'all' | 'keys' | 'names' = 'keys') {
  return mount(MenuSelect, {
    props: {
      options: OPTIONS,
      modelValue,
      label: 'Table',
      name: 'Diagram detail level',
    },
    attachTo: document.body,
  });
}

describe('MenuSelect', () => {
  it('shows the caption and current choice, lists options with a check, and reports a pick', async () => {
    const wrapper = mountSelect();
    const trigger = wrapper.find('button[aria-haspopup="listbox"]');
    // Caption and choice are separate spans laid out with a flex gap, so there is no space in the text.
    expect(trigger.findAll('span').map((el) => el.text())).toEqual(['Table', 'Keys only']);
    expect(trigger.attributes('aria-label')).toBe('Diagram detail level');
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);

    await trigger.trigger('click');
    const options = wrapper.findAll('[role="option"]');
    expect(options.map((o) => o.text())).toEqual(['All fields', 'Keys only', 'Table names']);
    expect(options[1]!.attributes('aria-selected')).toBe('true');
    expect(options[1]!.find('svg').exists()).toBe(true);
    expect(options[0]!.find('svg').exists()).toBe(false);

    await options[2]!.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([['names']]);
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('closes on Escape and on a press outside without emitting', async () => {
    const wrapper = mountSelect();
    await wrapper.find('button').trigger('click');
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);

    await wrapper.find('button').trigger('click');
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await nextTick();
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    wrapper.unmount();
  });
});

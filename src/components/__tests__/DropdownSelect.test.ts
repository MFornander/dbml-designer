// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import DropdownSelect from '@/components/common/DropdownSelect.vue';

function mountSelect (modelValue = 0) {
  return mount(DropdownSelect, {
    props: {
      options: ['Rename the column', 'Remove the setting', 'Quote the name'],
      labels: ['Rename', 'Remove', 'Quote'],
      modelValue,
    },
    attachTo: document.body,
  });
}

describe('DropdownSelect', () => {
  it('shows the selected label, opens a listbox on click, and reports a choice', async () => {
    const wrapper = mountSelect(1);
    const trigger = wrapper.find('button[aria-haspopup="listbox"]');
    expect(trigger.text()).toBe('Remove');
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);

    await trigger.trigger('click');
    const options = wrapper.findAll('[role="option"]');
    expect(options.map((o) => o.text())).toEqual(['Rename the column', 'Remove the setting', 'Quote the name']);
    expect(options[1]!.attributes('aria-selected')).toBe('true');

    await options[2]!.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([[2]]);
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('closes on a press outside or on Escape without changing the value', async () => {
    const wrapper = mountSelect();
    const trigger = wrapper.find('button[aria-haspopup="listbox"]');
    await trigger.trigger('click');
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);

    await trigger.trigger('click');
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await nextTick();
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    wrapper.unmount();
  });
});

// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { mount } from '../mount';
import type { Model } from '../model';
import type { HoverTarget } from '../state/useHover';

const MODEL: Model = {
  tables: [{
    name: 'users',
    note: 'people who sign in',
    fields: [{ name: 'id', type: 'int', note: 'the row id' }],
  }],
};

async function tooltipAfterHovering (selector: string, tooltipFilter?: (t: HoverTarget) => boolean): Promise<boolean> {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const mounted = mount(element, { model: MODEL, ...(tooltipFilter ? { tooltipFilter } : {}) });
  await flushPromises();
  await nextTick();
  element.querySelector(selector)!.dispatchEvent(new PointerEvent('pointerenter'));
  // Past the tooltip's delay.
  await new Promise((r) => setTimeout(r, 200));
  await nextTick();
  const shown = element.querySelector('.dg-tooltip') !== null;
  mounted.unmount();
  element.remove();
  return shown;
}

describe('tooltipFilter', () => {
  it('leaves the engine\'s tooltip off for the targets the host turns down, and on for the rest', async () => {
    const noFields = (t: HoverTarget) => t.kind !== 'field';
    expect(await tooltipAfterHovering('.dg-field[data-key="public.users.id"]')).toBe(true);
    expect(await tooltipAfterHovering('.dg-field[data-key="public.users.id"]', noFields)).toBe(false);
    expect(await tooltipAfterHovering('.dg-table[data-key="public.users"]', noFields)).toBe(true);
  });
});

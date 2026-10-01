// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { mount } from '../mount';
import { createEngine } from '../engine/engine';
import type { Model } from '../model';
import type {
  DiagramViewport, ElementClickEvent, ElementEvent, TableLinkPayload,
} from '../types';

const MODEL: Model = {
  tables: [
    {
      name: 'users',
      fields: [{
        name: 'id',
        type: 'int',
      }],
      source: 'users-row-17',
    },
    {
      name: 'posts',
      fields: [{
        name: 'id',
        type: 'int',
      }],
    },
  ],
};

async function settle (): Promise<void> {
  await flushPromises();
  await nextTick();
}

describe('mount', () => {
  it('draws a model into a plain element, reports clicks with their source, and cleans up', async () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const clicks: TableLinkPayload[] = [];
    const mounted = mount(element, {
      model: MODEL,
      onTableClick: (p) => clicks.push(p),
    });
    await settle();
    expect(element.querySelectorAll('.dg-table')).toHaveLength(2);
    expect(Object.keys(mounted.engine.layout.positions.value).sort()).toEqual(['public.posts', 'public.users']);
    // The diagram brings its styles: one style element, however many diagrams draw.
    expect(document.head.querySelectorAll('style[data-dbml-designer-engine]')).toHaveLength(1);
    expect(document.head.querySelector('style[data-dbml-designer-engine]')!.textContent).toContain('.dg-root');

    const users = element.querySelector('.dg-table[data-key="public.users"]')!;
    users.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 10,
      clientY: 10,
    }));
    window.dispatchEvent(new MouseEvent('pointerup', {
      clientX: 10,
      clientY: 10,
    }));
    await settle();
    expect(clicks).toEqual([{
      key: 'public.users',
      source: 'users-row-17',
    }]);
    // A table without a source is reported all the same.
    const posts = element.querySelector('.dg-table[data-key="public.posts"]')!;
    posts.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 10,
      clientY: 10,
    }));
    window.dispatchEvent(new MouseEvent('pointerup', {
      clientX: 10,
      clientY: 10,
    }));
    await settle();
    expect(clicks[1]).toEqual({
      key: 'public.posts',
      source: undefined,
    });

    mounted.engine.setModel({ tables: [MODEL.tables[1]!] });
    await settle();
    expect(element.querySelectorAll('.dg-table')).toHaveLength(1);

    mounted.unmount();
    expect(element.childElementCount).toBe(0);
    element.remove();
  });

  it('draws an engine the host created and leaves it running after unmount', async () => {
    const engine = createEngine({ model: MODEL });
    const element = document.createElement('div');
    document.body.appendChild(element);
    const mounted = mount(element, { engine });
    await settle();
    expect(mounted.engine).toBe(engine);
    mounted.unmount();
    engine.setModel({ tables: [MODEL.tables[0]!] });
    expect(engine.diagram.value.tables.map((t) => t.key)).toEqual(['public.users']);
    engine.dispose();
    element.remove();
  });

  it('passes element clicks, hovers, and viewport changes to the host, and reads the viewport and rectangles', async () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const clicks: ElementClickEvent[] = [];
    const hovers: (ElementEvent | null)[] = [];
    const viewports: DiagramViewport[] = [];
    const mounted = mount(element, {
      model: MODEL,
      onElementClick: (e) => {
        clicks.push(e);
        e.preventDefault();
      },
      onElementHover: (e) => hovers.push(e),
      onViewportChange: (v) => viewports.push(v),
    });
    await settle();
    const { engine } = mounted;
    expect(engine.viewport.value).toEqual({ x: 0, y: 0, zoom: 1 });

    const users = element.querySelector('.dg-table[data-key="public.users"]')!;
    users.dispatchEvent(new PointerEvent('pointerenter'));
    users.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: 10, clientY: 10 }));
    await settle();
    expect(hovers.at(-1)?.target).toEqual({ kind: 'table', key: 'public.users' });
    expect(clicks.map((c) => [c.target, c.source])).toEqual([[{ kind: 'table', key: 'public.users' }, 'users-row-17']]);
    // The host prevented it: nothing is selected.
    expect(users.classList.contains('is-selected')).toBe(false);

    engine.setViewport({ zoom: 0.5 });
    await settle();
    expect(engine.viewport.value).toEqual({ x: 0, y: 0, zoom: 0.5 });
    expect(viewports.at(-1)).toEqual({ x: 0, y: 0, zoom: 0.5 });
    const box = engine.layout.positions.value['public.users']!;
    expect(engine.rectOf('public.users')).toMatchObject({ x: box.x * 0.5, y: box.y * 0.5 });

    mounted.unmount();
    expect(engine.viewport.value).toBeNull();
    expect(engine.rectOf('public.users')).toBeNull();
    element.remove();
  });
});

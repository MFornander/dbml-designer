// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import DiagramCanvas from '@/diagram/components/DiagramCanvas.vue';
import { buildDiagramModel } from '@/diagram/adapter/buildModel';
import type { PositionChange } from '@/types/diagram';
import { compile } from './testUtils';

const DBML = `
  Table raw { id int [pk] }
  Table stg { id int [pk] \n raw_id int [ref: > raw.id] }
  Table mart { id int [pk] \n stg_id int [ref: > stg.id] }
  Table lonely { id int [pk] }
  TableGroup ingest {
    raw
    stg
  }
  TableGroup serve {
    mart
  }
  Dep: raw -> stg
  Dep: stg -> mart
  Note hint { 'hi' }
  Note aside { 'there' }
`;

const positions = {
  'public.raw': { x: 800, y: 0 },
  'public.stg': { x: 0, y: 0 },
  'public.mart': { x: 400, y: 400 },
  'public.lonely': { x: 1200, y: 1200 },
  'note:hint': { x: 0, y: 800, w: 300, h: 100 },
  'note:aside': { x: 400, y: 800 },
};

function mountCanvas (props: Record<string, unknown> = {}) {
  return mount(DiagramCanvas, {
    props: {
      model: buildDiagramModel(compile(DBML)),
      positions,
      detailLevel: 'all',
      dark: false,
      ...props,
    },
    attachTo: document.body,
  });
}

function arranged (wrapper: ReturnType<typeof mountCanvas>): { changes: PositionChange[]; routes: string[] } {
  const events = wrapper.emitted('arrange') as [PositionChange[], string[]][];
  expect(events).toHaveLength(1);
  const [changes, routes] = events[0]!;
  return {
    changes,
    routes,
  };
}

describe('DiagramCanvas arrange', () => {
  it('arranges every table and note the view shows and names the routes that no longer fit', async () => {
    const wrapper = mountCanvas({ hidden: new Set(['public.lonely', 'note:aside']) });
    await nextTick();
    expect((wrapper.vm as unknown as { arrange: () => boolean }).arrange()).toBe(true);
    const { changes, routes } = arranged(wrapper);
    // Hidden elements stay where they are: no change for them.
    expect(changes.map((c) => c.key).sort()).toEqual(['note:hint', 'public.mart', 'public.raw', 'public.stg']);
    for (const c of changes) {
      expect(c.x % 8).toBe(0);
      expect(c.y % 8).toBe(0);
      expect(c.w).toBeUndefined();
    }
    const at = (k: string) => changes.find((c) => c.key === k)!;
    expect(at('public.raw').x).toBeLessThan(at('public.stg').x);
    expect(at('public.stg').x).toBeLessThan(at('public.mart').x);
    // The note goes right of the tables.
    expect(at('note:hint').x).toBeGreaterThan(at('public.mart').x);
    expect(routes.sort()).toEqual(['#public.raw(id)->public.stg(raw_id)', '#public.stg(id)->public.mart(stg_id)']);
    // Nothing is stored by the canvas itself.
    expect(wrapper.emitted('position-change')).toBeUndefined();
    wrapper.unmount();
  });

  it('keeps routes to hidden tables and gives a collapsed group only its box\'s room', async () => {
    const open = mountCanvas();
    await nextTick();
    (open.vm as unknown as { arrange: () => boolean }).arrange();
    const openMart = arranged(open).changes.find((c) => c.key === 'public.mart')!;
    open.unmount();

    const folded = mountCanvas({
      collapsedGroups: new Set(['group:public.ingest']),
      hidden: new Set(['public.raw']),
    });
    await nextTick();
    (folded.vm as unknown as { arrange: () => boolean }).arrange();
    const { changes, routes } = arranged(folded);
    const mart = changes.find((c) => c.key === 'public.mart')!;
    // ingest holds one layer now and is folded to a box narrower than its open width.
    expect(mart.x).toBeLessThan(openMart.x);
    expect(routes).toEqual(['#public.stg(id)->public.mart(stg_id)']);
    folded.unmount();
  });

  it('tells auto-placement apart, and places only the tables asked for around the rest', async () => {
    const { 'public.mart': _mart, ...rest } = positions;
    const wrapper = mountCanvas({ positions: rest });
    await nextTick();
    const auto = wrapper.emitted('position-change') as [PositionChange[], string?][];
    expect(auto).toHaveLength(1);
    expect(auto[0]![0].map((c) => c.key)).toEqual(['public.mart']);
    expect(auto[0]![1]).toBe('auto');

    (wrapper.vm as unknown as { arrange: (only?: ReadonlySet<string>) => boolean }).arrange(new Set(['public.mart']));
    const { changes, routes } = arranged(wrapper);
    expect(changes.map((c) => c.key)).toEqual(['public.mart']);
    expect(routes).toEqual(['#public.stg(id)->public.mart(stg_id)']);
    // Right of stg, which lineage says comes before it.
    expect(changes[0]!.x).toBeGreaterThan(positions['public.stg'].x);
    wrapper.unmount();
  });

  it('waits while the model is behind the text', async () => {
    const wrapper = mountCanvas({ loading: true });
    await nextTick();
    expect((wrapper.vm as unknown as { arrange: () => boolean }).arrange()).toBe(false);
    expect(wrapper.emitted('arrange')).toBeUndefined();
    wrapper.unmount();
  });
});

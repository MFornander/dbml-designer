// @vitest-environment happy-dom
import {
  describe, it, expect, vi,
} from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import EngineDiagram from '../components/EngineDiagram.vue';
import { createEngine, type DiagramHandle } from '../engine/engine';
import type { Model } from '../model';

const table = (schema: string, name: string, field: string) => ({
  schema,
  name,
  fields: [{
    name: field,
    type: 'double',
  }],
});

const dep = (from: string, to: string) => ({
  from: { table: from },
  to: { table: to },
});

/** The trace from issue #4 as another program writes it, plus a table its view leaves out. */
const MODEL: Model = {
  tables: [
    table('spec', 'order_line', 'quantity'),
    table('input', 'item', 'unit_cost'),
    table('input', 'markup', 'rate'),
    table('money', 'line_price', 'price'),
    table('ops', 'audit', 'id'),
  ],
  deps: [
    dep('spec.order_line', 'money.line_price'),
    dep('input.item', 'money.line_price'),
    dep('input.markup', 'money.line_price'),
  ],
  views: [
    {
      name: 'trace_L1_price',
      tables: ['input.item', 'input.markup', 'spec.order_line', 'money.line_price'],
    },
    {
      name: 'arranged',
      tables: ['money.line_price', 'ops.audit'],
    },
  ],
};

/** The Default View as auto-placement leaves a fresh trace: one column, in declaration order. */
const COLUMN = Object.fromEntries(['spec.order_line', 'input.item', 'input.markup', 'money.line_price', 'ops.audit']
  .map((k, i) => [k, {
    x: 0,
    y: i * 160,
  }]));

const LAYOUT = {
  positions: COLUMN,
  collapsedGroups: [],
  edgeRoutes: {},
  views: {
    arranged: {
      positions: {
        'ops.audit': {
          x: 400,
          y: 0,
        },
      },
      collapsedGroups: [],
      edgeRoutes: {},
    },
  },
};

function fakeHandle () {
  return {
    fitToScreen: vi.fn(),
    resetZoom: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    arrange: vi.fn((_only?: ReadonlySet<string>) => true),
    refit: vi.fn(),
  } satisfies DiagramHandle;
}

async function settle (): Promise<void> {
  await flushPromises();
  await nextTick();
}

describe('switching views', () => {
  it('arranges a view with no arrangement of its own, and fits any other view it switches to', async () => {
    const engine = createEngine({
      model: MODEL,
      layout: LAYOUT,
    });
    const h = fakeHandle();
    engine.attach(h);

    engine.selectView('trace_L1_price');
    await settle();
    expect(h.arrange).toHaveBeenCalledTimes(1);
    expect(h.arrange).toHaveBeenCalledWith();
    // Arranging fits the result itself.
    expect(h.refit).not.toHaveBeenCalled();

    engine.selectView(null);
    await settle();
    expect(h.refit).toHaveBeenCalledTimes(1);

    // A view with a layer of its own keeps it, and is only fitted.
    engine.views.select('arranged');
    await settle();
    expect(h.arrange).toHaveBeenCalledTimes(1);
    expect(h.refit).toHaveBeenCalledTimes(2);
  });

  it('leaves a view saved from the working set as it is shown, and can be told not to arrange', async () => {
    const engine = createEngine({
      model: MODEL,
      layout: LAYOUT,
      arrangeViews: false,
    });
    const h = fakeHandle();
    engine.attach(h);
    engine.views.adopt('trace_L1_price');
    await settle();
    expect(h.arrange).not.toHaveBeenCalled();
    expect(h.refit).not.toHaveBeenCalled();

    engine.selectView('trace_L1_price');
    await settle();
    expect(h.arrange).not.toHaveBeenCalled();
    expect(h.refit).toHaveBeenCalledTimes(1);
  });

  it('waits for a diagram to be mounted and for the model to catch up', async () => {
    const engine = createEngine({
      model: MODEL,
      layout: LAYOUT,
      loading: true,
    });
    engine.selectView('trace_L1_price');
    await settle();
    const h = fakeHandle();
    engine.attach(h);
    await settle();
    expect(h.arrange).not.toHaveBeenCalled();
    engine.setLoading(false);
    await settle();
    expect(h.arrange).toHaveBeenCalledTimes(1);
  });

  it('lays a written view out in lineage order, the same every time, in that view\'s layer only', async () => {
    const arrangedOnce = async () => {
      const engine = createEngine({
        model: MODEL,
        layout: LAYOUT,
      });
      const wrapper = mount(EngineDiagram, {
        props: { engine },
        attachTo: document.body,
      });
      await settle();
      engine.selectView('trace_L1_price');
      await settle();
      const result = {
        view: engine.layout.state.value.views.trace_L1_price?.positions ?? {},
        defaults: engine.layout.state.value.positions,
      };
      wrapper.unmount();
      engine.dispose();
      return result;
    };
    const { view, defaults } = await arrangedOnce();
    // Only what the view shows moves, upstream in one column left of the price.
    expect(Object.keys(view).sort()).toEqual(['input.item', 'input.markup', 'money.line_price', 'spec.order_line']);
    const x = (k: string) => view[k]!.x;
    expect(new Set([x('input.item'), x('input.markup'), x('spec.order_line')]).size).toBe(1);
    expect(x('spec.order_line')).toBeLessThan(x('money.line_price'));
    expect(Object.values(view).every((p) => p.x % 8 === 0 && p.y % 8 === 0)).toBe(true);
    // The Default View does not move.
    expect(defaults).toEqual(COLUMN);
    expect((await arrangedOnce()).view).toEqual(view);
  });
});

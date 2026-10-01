// @vitest-environment happy-dom
import {
  describe, it, expect, beforeEach, afterEach, vi,
} from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { nextTick, type ComponentPublicInstance } from 'vue';
import DiagramCanvas from '../components/DiagramCanvas.vue';
import { buildDiagramModel } from '@/dbml/buildModel';
import { deriveHighlight } from '../state/useHover';
import type { XY } from '../types';
import { compile } from '@/dbml/__tests__/testUtils';

/*
 * How much of the diagram re-renders per interaction, counted the way the Vue-to-React research
 * measured it (docs/research/vue-to-react.md): the real canvas, a global mixin counting `updated`
 * hooks per component, and a synthetic schema of 200 tables with 8 rows in groups of ten, 400
 * relationships, and two sticky notes. A drag frame should reach only the moved table, its group,
 * and its edges; a hover only what it highlights; panning and zooming no node at all.
 */

const TABLES = 200;
const GROUP_SIZE = 10;
const FRAMES = 5;

/** Each table references the next one and the one seven on, so every table has four relationships. */
function syntheticDbml (): string {
  const lines: string[] = [];
  for (let i = 0; i < TABLES; i++) {
    lines.push(
      `Table t${i} {`,
      '  id int [pk]',
      `  next_id int [ref: > t${(i + 1) % TABLES}.id]`,
      `  skip_id int [ref: > t${(i + 7) % TABLES}.id]`,
      ...['a', 'b', 'c', 'd', 'e'].map((c) => `  ${c} varchar`),
      '}',
    );
  }
  for (let g = 0; g < TABLES / GROUP_SIZE; g++) {
    lines.push(`TableGroup g${g} {`, ...Array.from({ length: GROUP_SIZE }, (_, j) => `  t${g * GROUP_SIZE + j}`), '}');
  }
  lines.push('Note n0 {', "  'first'", '}', 'Note n1 {', "  'second'", '}');
  return lines.join('\n');
}

/** A 20-wide grid, so each group of ten is a row of tables, with the notes off to the right. */
function gridPositions (): Record<string, XY> {
  const positions: Record<string, XY> = {};
  for (let i = 0; i < TABLES; i++) {
    positions[`public.t${i}`] = {
      x: (i % 20) * 320,
      y: Math.floor(i / 20) * 400,
    };
  }
  positions['note:n0'] = {
    x: 7000,
    y: 0,
  };
  positions['note:n1'] = {
    x: 7000,
    y: 400,
  };
  return positions;
}

const model = buildDiagramModel(compile(syntheticDbml()));

/** Every component update, as `Name:key` with the table, edge, group, or note it draws. */
const updates: string[] = [];
const counter = {
  updated (this: ComponentPublicInstance) {
    const name = (this.$.type as { __name?: string }).__name ?? '?';
    const p = this.$props as Record<string, { key?: string } | undefined>;
    updates.push(`${name}:${p.table?.key ?? p.edge?.key ?? p.group?.key ?? p.note?.key ?? ''}`);
  },
};
const updatesOf = (name: string) => updates.filter((u) => u.startsWith(`${name}:`)).map((u) => u.slice(name.length + 1));
const countOf = (name: string) => updatesOf(name).length;
const updatedSet = (name: string) => new Set(updatesOf(name));

type FrameCallback = (time: number) => void;

// Animation frames run only when the test says so, so each drag move is one frame.
let pendingFrames: FrameCallback[] = [];
function runFrames (): void {
  const frames = pendingFrames;
  pendingFrames = [];
  for (const f of frames) f(performance.now());
}

let wrapper: VueWrapper;

async function mountCanvas (): Promise<void> {
  wrapper = mount(DiagramCanvas, {
    props: {
      model,
      positions: gridPositions(),
      detailLevel: 'all',
      dark: false,
    },
    attachTo: document.body,
    global: {
      mixins: [counter],
    },
  });
  await flushPromises();
  await nextTick();
  runFrames();
  await nextTick();
  updates.length = 0;
}

describe('DiagramCanvas re-renders', () => {
  beforeEach(() => {
    pendingFrames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameCallback) => {
      pendingFrames.push(cb);
      return pendingFrames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });

  afterEach(() => {
    wrapper?.unmount();
    vi.unstubAllGlobals();
  });

  it('builds the schema it means to', () => {
    expect(model.tables).toHaveLength(TABLES);
    expect(model.refs).toHaveLength(2 * TABLES);
    expect(model.groups).toHaveLength(TABLES / GROUP_SIZE);
    expect(model.notes).toHaveLength(2);
  });

  it('redraws only the dragged table, its group, and its edges on each drag frame', async () => {
    await mountCanvas();
    const dragged = 'public.t0';
    const attached = new Set(model.refs.filter((r) => r.endpoints.some((e) => e.tableKey === dragged)).map((r) => r.key));
    expect(attached.size).toBe(4);

    await wrapper.find(`.dg-table[data-key="${dragged}"]`).trigger('pointerdown', {
      button: 0,
      clientX: 10,
      clientY: 10,
    });
    const move = async (step: number) => {
      window.dispatchEvent(new MouseEvent('pointermove', {
        clientX: 10 + 16 * step,
        clientY: 10 + 8 * step,
      }));
      runFrames();
      await nextTick();
    };
    // The first move starts the drag and raises the table above the rest; count the frames after it.
    await move(1);
    updates.length = 0;
    for (let step = 2; step < 2 + FRAMES; step++) await move(step);

    expect(updatedSet('TableNode')).toEqual(new Set([dragged]));
    expect(countOf('TableNode')).toBe(FRAMES);
    expect(updatedSet('RefEdge')).toEqual(attached);
    expect(countOf('RefEdge')).toBe(FRAMES * attached.size);
    expect([...updatedSet('TableGroupNode')]).toEqual([model.tablesByKey.get(dragged)!.groupKey]);
    expect(countOf('StickyNoteNode')).toBe(0);
    expect(countOf('DiagramCanvas')).toBe(FRAMES);

    window.dispatchEvent(new MouseEvent('pointerup', {
      clientX: 10 + 16 * (1 + FRAMES),
      clientY: 10 + 8 * (1 + FRAMES),
    }));
    await nextTick();
  });

  it('redraws only the tables and edges a hover highlights', async () => {
    await mountCanvas();
    const hovered = 'public.t50';
    const expected = deriveHighlight(model, {
      kind: 'table',
      key: hovered,
    });
    // The hovered table, the two it references, and the two referencing it.
    expect(expected.tableKeys.size).toBe(5);

    await wrapper.find(`.dg-table[data-key="${hovered}"]`).trigger('pointerenter');
    await nextTick();

    expect(updatedSet('TableNode')).toEqual(new Set(expected.tableKeys));
    expect(countOf('TableNode')).toBe(expected.tableKeys.size);
    expect(updatedSet('RefEdge')).toEqual(new Set(expected.refKeys));
    expect(countOf('RefEdge')).toBe(expected.refKeys.size);
    expect(countOf('TableGroupNode')).toBe(0);
    expect(countOf('StickyNoteNode')).toBe(0);

    // Leaving puts back exactly what the hover changed.
    updates.length = 0;
    await wrapper.find(`.dg-table[data-key="${hovered}"]`).trigger('pointerleave');
    await nextTick();
    expect(updatedSet('TableNode')).toEqual(new Set(expected.tableKeys));
    expect(updatedSet('RefEdge')).toEqual(new Set(expected.refKeys));
  });

  it('redraws no node while zooming or panning', async () => {
    await mountCanvas();
    const nodes = ['TableNode', 'RefEdge', 'TableGroupNode', 'StickyNoteNode'];
    const transform = () => wrapper.find('.dg-viewport').attributes('transform');

    const before = transform();
    for (let i = 0; i < FRAMES; i++) {
      await wrapper.find('.dg-svg').trigger('wheel', {
        deltaY: -1,
        deltaMode: 1,
        clientX: 100,
        clientY: 100,
      });
    }
    expect(transform()).not.toBe(before);
    for (const name of nodes) expect(countOf(name), name).toBe(0);
    expect(countOf('DiagramCanvas')).toBe(FRAMES);

    // A middle-button drag pans from anywhere.
    updates.length = 0;
    const zoomed = transform();
    await wrapper.find('.dg-bg-fill').trigger('pointerdown', {
      button: 1,
      clientX: 100,
      clientY: 100,
    });
    for (let step = 1; step <= FRAMES; step++) {
      window.dispatchEvent(new MouseEvent('pointermove', {
        clientX: 100 + 20 * step,
        clientY: 100 + 10 * step,
      }));
      runFrames();
      await nextTick();
    }
    window.dispatchEvent(new MouseEvent('pointerup', {
      clientX: 100 + 20 * FRAMES,
      clientY: 100 + 10 * FRAMES,
    }));
    await nextTick();
    expect(transform()).not.toBe(zoomed);
    for (const name of nodes) expect(countOf(name), name).toBe(0);
  });
});

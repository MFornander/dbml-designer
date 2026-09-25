// @vitest-environment happy-dom
import {
  describe, it, expect, vi,
} from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import DiagramCanvas from '@/diagram/components/DiagramCanvas.vue';
import { buildDiagramModel } from '@/diagram/adapter/buildModel';
import { snap8 } from '@/diagram/geometry/rect';
import type { PartialRefMode, PositionChange } from '@/types/diagram';
import { compile } from './testUtils';
import GRAIN from './fixtures/partialGrain.dbml?raw';

const DBML = `
  Table users { id int [pk] \n name varchar }
  Table posts { id int [pk] \n user_id int [ref: > users.id] }
  Note hint { 'hello' }
`;

function mountCanvas (positions: Record<string, { x: number; y: number }> = {}) {
  const model = buildDiagramModel(compile(DBML));
  return mount(DiagramCanvas, {
    props: {
      model,
      positions,
      detailLevel: 'all',
      dark: false,
    },
    attachTo: document.body,
  });
}

function lastPositionChange (wrapper: ReturnType<typeof mountCanvas>): PositionChange[] | undefined {
  const events = wrapper.emitted('position-change') as PositionChange[][] | undefined;
  return events?.at(-1)?.[0];
}

describe('DiagramCanvas', () => {
  it('auto-places every table and note that has no stored position', async () => {
    const wrapper = mountCanvas();
    await flushPromises();
    await nextTick();
    const changes = lastPositionChange(wrapper);
    expect(changes).toBeDefined();
    const keys = changes!.map((c) => c.key).sort();
    expect(keys).toEqual(['note:hint', 'public.posts', 'public.users']);
    for (const c of changes!) {
      expect(c.x % 8).toBe(0);
      expect(c.y % 8).toBe(0);
    }
    wrapper.unmount();
  });

  it('renders placed tables, their ref, and the note', async () => {
    const wrapper = mountCanvas({
      'public.users': {
        x: 0,
        y: 0,
      },
      'public.posts': {
        x: 400,
        y: 0,
      },
      'note:hint': {
        x: 800,
        y: 0,
      },
    });
    await nextTick();
    expect(wrapper.findAll('.dg-table')).toHaveLength(2);
    expect(wrapper.findAll('.dg-ref')).toHaveLength(1);
    expect(wrapper.findAll('.dg-note')).toHaveLength(1);
    expect(wrapper.emitted('position-change')).toBeUndefined();
    wrapper.unmount();
  });

  it('zooms around the cursor on wheel', async () => {
    const wrapper = mountCanvas({
      'public.users': {
        x: 0,
        y: 0,
      },
      'public.posts': {
        x: 400,
        y: 0,
      },
      'note:hint': {
        x: 800,
        y: 0,
      },
    });
    await nextTick();
    expect(wrapper.find('.dg-viewport').attributes('transform')).toBe('translate(0 0) scale(1)');
    await wrapper.find('.dg-svg').trigger('wheel', {
      deltaY: -1,
      deltaMode: 1,
      clientX: 0,
      clientY: 0,
    });
    expect(wrapper.find('.dg-viewport').attributes('transform')).toBe('translate(0 0) scale(1.05)');
    wrapper.unmount();
  });

  it('emits a snapped position after dragging a table', async () => {
    const wrapper = mountCanvas({
      'public.users': {
        x: 0,
        y: 0,
      },
      'public.posts': {
        x: 400,
        y: 0,
      },
      'note:hint': {
        x: 800,
        y: 0,
      },
    });
    await nextTick();
    const users = wrapper.find('.dg-table[data-key="public.users"]');
    await users.trigger('pointerdown', {
      button: 0,
      clientX: 10,
      clientY: 10,
    });
    window.dispatchEvent(new MouseEvent('pointermove', {
      clientX: 10 + 101,
      clientY: 10 + 47,
    }));
    window.dispatchEvent(new MouseEvent('pointerup', {
      clientX: 10 + 101,
      clientY: 10 + 47,
    }));
    await nextTick();
    const changes = lastPositionChange(wrapper);
    expect(changes).toEqual([{
      key: 'public.users',
      x: 104,
      y: 48,
    }]);
    wrapper.unmount();
  });

  it('treats a click without movement as a selection, not a move', async () => {
    const wrapper = mountCanvas({
      'public.users': {
        x: 0,
        y: 0,
      },
      'public.posts': {
        x: 400,
        y: 0,
      },
      'note:hint': {
        x: 800,
        y: 0,
      },
    });
    await nextTick();
    const users = wrapper.find('.dg-table[data-key="public.users"]');
    await users.trigger('pointerdown', {
      button: 0,
      clientX: 10,
      clientY: 10,
    });
    window.dispatchEvent(new MouseEvent('pointerup', {
      clientX: 10,
      clientY: 10,
    }));
    await nextTick();
    expect(wrapper.emitted('position-change')).toBeUndefined();
    const clicks = wrapper.emitted('table-click');
    expect(clicks).toHaveLength(1);
    expect((clicks![0]![0] as { key: string }).key).toBe('public.users');
    wrapper.unmount();
  });

  it('routes every ref that leaves a field from the same anchor point', async () => {
    const wrapper = mount(DiagramCanvas, {
      props: {
        model: buildDiagramModel(compile(`
          Table users { id int [pk] }
          Table posts { id int [pk] \n author_id int [ref: > users.id] }
          Table comments { id int [pk] \n user_id int [ref: > users.id] }
        `)),
        positions: {
          'public.users': {
            x: 0,
            y: 0,
          },
          'public.posts': {
            x: 400,
            y: 0,
          },
          'public.comments': {
            x: 400,
            y: 300,
          },
        },
        detailLevel: 'all',
        dark: false,
      },
      attachTo: document.body,
    });
    await nextTick();
    const refs = wrapper.findAll('.dg-ref');
    expect(refs).toHaveLength(2);
    // Each ref draws one marker per end; the two markers on users.id sit at the identical point
    // (no fanning along the table edge), while the far ends differ.
    const markersOf = (i: number) => refs[i]!.findAll('.dg-ref-marker').map((m) => m.attributes('transform'));
    const shared = markersOf(0).filter((t) => markersOf(1).includes(t));
    expect(shared).toHaveLength(1);
    expect(shared[0]).toMatch(/^translate\(\d+(\.\d+)? \d+(\.\d+)?\) scale\(1 1\)$/);
    // Both lines start on that same point too.
    const starts = refs.map((r) => /^M[^L]+/.exec(r.find('.dg-ref-hit').attributes('d')!)![0]);
    expect(starts[0]).toBe(starts[1]);
    wrapper.unmount();
  });

  it('draws one lineage line per table pair and adds the column line while a mapped field is hovered', async () => {
    const wrapper = mount(DiagramCanvas, {
      props: {
        model: buildDiagramModel(compile(`
          Table comments { id int [pk] \n post_id int \n created_at timestamp }
          Table post_stats { post_id int [pk] \n last_comment_at timestamp }
          Dep rollup {
            comments.post_id -> post_stats.post_id
            comments.created_at -> post_stats.last_comment_at
          }
        `)),
        positions: {
          'public.comments': {
            x: 0,
            y: 0,
          },
          'public.post_stats': {
            x: 400,
            y: 0,
          },
        },
        detailLevel: 'all',
        dark: false,
      },
      attachTo: document.body,
    });
    await nextTick();
    // One table-to-table line, its arrowhead at the downstream header center.
    expect(wrapper.findAll('.dg-dep')).toHaveLength(1);
    expect(wrapper.findAll('.dg-dep .dg-ref-marker').map((m) => m.attributes('transform')))
      .toEqual(['translate(400 16) scale(-1 1)']);

    // Hovering a mapped field adds its direct field-to-field line and lights the table line.
    const statsRows = wrapper.find('.dg-table[data-key="public.post_stats"]').findAll('.dg-field');
    await statsRows[0]!.trigger('pointerenter');
    const deps = wrapper.findAll('.dg-dep');
    expect(deps).toHaveLength(2);
    expect(deps.every((d) => d.classes('is-highlighted'))).toBe(true);
    const arrowheads = deps.map((d) => d.find('.dg-ref-marker').attributes('transform')).sort();
    expect(arrowheads).toEqual(['translate(400 16) scale(-1 1)', 'translate(400 48) scale(-1 1)']);
    expect(wrapper.find('.dg-field.is-highlighted').exists()).toBe(true);

    await statsRows[0]!.trigger('pointerleave');
    expect(wrapper.findAll('.dg-dep')).toHaveLength(1);
    wrapper.unmount();
  });

  it('draws a self reference field to field along the right edge', async () => {
    const wrapper = mount(DiagramCanvas, {
      props: {
        model: buildDiagramModel(compile(`
          Table comments { id int [pk] \n parent_id int [ref: > comments.id] }
        `)),
        positions: {
          'public.comments': {
            x: 0,
            y: 0,
          },
        },
        detailLevel: 'all',
        dark: false,
      },
      attachTo: document.body,
    });
    await nextTick();
    const transforms = wrapper.findAll('.dg-ref .dg-ref-marker').map((m) => m.attributes('transform')!);
    const parsed = transforms.map((t) => /^translate\(([\d.]+) ([\d.]+)\) scale\((-?1) 1\)$/.exec(t)!.slice(1));
    // Both ends leave the right edge (no mirroring) at the id row and the parent_id row.
    expect(parsed.map((p) => p[2])).toEqual(['1', '1']);
    expect(parsed.map((p) => Number(p[1])).sort((a, b) => a - b)).toEqual([48, 80]);
    expect(parsed[0]![0]).toBe(parsed[1]![0]);
    wrapper.unmount();
  });

  it('shows a gear on the hovered table that opens the color picker and reports the chosen color', async () => {
    const wrapper = mountCanvas({
      'public.users': {
        x: 0,
        y: 0,
      },
      'public.posts': {
        x: 400,
        y: 0,
      },
      'note:hint': {
        x: 800,
        y: 0,
      },
    });
    await nextTick();
    const users = wrapper.find('.dg-table[data-key="public.users"]');
    expect(users.find('.dg-gear').exists()).toBe(false);
    await users.trigger('pointerenter');
    expect(users.find('.dg-gear').exists()).toBe(true);
    expect(wrapper.find('.dg-table[data-key="public.posts"] .dg-gear').exists()).toBe(false);

    await users.find('.dg-gear').trigger('click');
    const popover = wrapper.find('.dg-color-popover');
    expect(popover.exists()).toBe(true);
    expect(popover.find('.dg-color-title').text()).toBe('Header Color');
    // No colors are in use yet, so only the theme swatches show.
    expect(popover.findAll('.dg-color-swatch')).toHaveLength(18);

    await popover.findAll('.dg-color-swatch')[0]!.trigger('click');
    expect(wrapper.emitted('set-color')).toEqual([[{
      kind: 'table',
      key: 'public.users',
      color: '#3498DB',
    }]]);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(wrapper.find('.dg-color-popover').exists()).toBe(false);
    wrapper.unmount();
  });

  it('offers the note color picker from a hovered sticky note', async () => {
    const wrapper = mountCanvas({
      'public.users': {
        x: 0,
        y: 0,
      },
      'public.posts': {
        x: 400,
        y: 0,
      },
      'note:hint': {
        x: 800,
        y: 0,
      },
    });
    await nextTick();
    const note = wrapper.find('.dg-note[data-key="note:hint"]');
    await note.trigger('pointerenter');
    await note.find('.dg-gear').trigger('click');
    expect(wrapper.find('.dg-color-title').text()).toBe('Note Color');
    wrapper.unmount();
  });

  it('paints bottom to top: open bodies largest first, their tables, collapsed groups, free tables, then notes', async () => {
    const model = buildDiagramModel(compile(`
      Table a { id int [pk] }
      Table b { id int [pk] }
      Table c { id int [pk] }
      Table d { id int [pk] }
      Table free { id int [pk] }
      Note hint { 'hello' }
      TableGroup inner { b }
      TableGroup wide { a \n c }
      TableGroup small { d }
    `));
    const positions = {
      'public.a': { x: 0, y: 0 },
      'public.b': { x: 400, y: 0 },
      'public.c': { x: 1200, y: 0 },
      'public.d': { x: 800, y: 0 },
      'public.free': { x: 600, y: 0 },
      'note:hint': { x: 200, y: 0 },
    };
    const wrapper = mount(DiagramCanvas, {
      props: {
        model,
        positions,
        detailLevel: 'all',
        dark: false,
        collapsedGroups: new Set(['group:public.inner']),
      },
      attachTo: document.body,
    });
    await nextTick();
    const names = (sel: string) => wrapper.findAll(sel).map((g) => g.find('.dg-group-name').text());
    // The layer under everything holds only open bodies, the widest first.
    expect(names('.dg-layer-groups .dg-group')).toEqual(['wide', 'small']);
    // Then, in one layer: the open groups' own tables, the collapsed group, and the table in no group last.
    const tablesLayer = wrapper.find('.dg-layer-tables').element;
    const items = [...tablesLayer.children].map((el) => (el.classList.contains('dg-group')
      ? `group:${el.querySelector('.dg-group-name')!.textContent}`
      : el.getAttribute('data-key')));
    expect(items).toEqual(['public.a', 'public.c', 'public.d', 'group:inner', 'public.free']);
    expect(wrapper.find('.dg-layer-tables .dg-group').classes()).toContain('is-collapsed');
    // Edges go under the tables, notes above everything.
    const layers = [...wrapper.find('.dg-viewport').element.children].map((el) => el.className.baseVal ?? el.getAttribute('class')).filter((c) => c?.startsWith('dg-layer'));
    expect(layers).toEqual(['dg-layer-groups', 'dg-layer-refs', 'dg-layer-tables', 'dg-layer-notes', 'dg-layer-controls']);
    wrapper.unmount();
  });

  it('leaves hidden tables and notes, and the edges and groups that depend on them, out of the drawing', async () => {
    const model = buildDiagramModel(compile(`
      Table users { id int [pk] }
      Table posts { id int [pk] \n user_id int [ref: > users.id] }
      Note hint { 'hello' }
      TableGroup g { posts }
    `));
    const positions = {
      'public.users': {
        x: 0,
        y: 0,
      },
      'public.posts': {
        x: 400,
        y: 0,
      },
      'note:hint': {
        x: 800,
        y: 0,
      },
    };
    const wrapper = mount(DiagramCanvas, {
      props: {
        model,
        positions,
        detailLevel: 'all',
        dark: false,
        hidden: new Set(['public.posts', 'note:hint']),
      },
      attachTo: document.body,
    });
    await nextTick();
    expect(wrapper.findAll('.dg-table').map((t) => t.attributes('data-key'))).toEqual(['public.users']);
    expect(wrapper.findAll('.dg-ref')).toHaveLength(0);
    expect(wrapper.findAll('.dg-note')).toHaveLength(0);
    expect(wrapper.findAll('.dg-group')).toHaveLength(0);
    // Hidden elements are not auto-placed either.
    expect(wrapper.emitted('position-change')).toBeUndefined();

    await wrapper.setProps({ hidden: new Set() });
    expect(wrapper.findAll('.dg-table')).toHaveLength(2);
    expect(wrapper.findAll('.dg-ref')).toHaveLength(1);
    expect(wrapper.findAll('.dg-group')).toHaveLength(1);
    wrapper.unmount();
  });

  it('selects tables and notes with a marquee on the bare canvas and moves the selection together', async () => {
    const wrapper = mountCanvas({
      'public.users': {
        x: 0,
        y: 0,
      },
      'public.posts': {
        x: 400,
        y: 0,
      },
      'note:hint': {
        x: 800,
        y: 0,
      },
    });
    await nextTick();
    const bg = wrapper.find('.dg-bg-fill');
    // Drag from above-left of users to just inside posts; the note stays out.
    await bg.trigger('pointerdown', {
      button: 0,
      clientX: -10,
      clientY: -10,
    });
    window.dispatchEvent(new MouseEvent('pointermove', {
      clientX: 420,
      clientY: 60,
    }));
    await nextTick();
    expect(wrapper.find('.dg-marquee').exists()).toBe(true);
    window.dispatchEvent(new MouseEvent('pointerup', {
      clientX: 420,
      clientY: 60,
    }));
    // Browsers follow the drag with a click on the same element; it must not clear the new selection.
    await bg.trigger('click');
    expect(wrapper.find('.dg-marquee').exists()).toBe(false);
    expect(wrapper.find('.dg-table[data-key="public.users"]').classes()).toContain('is-selected');
    expect(wrapper.find('.dg-table[data-key="public.posts"]').classes()).toContain('is-selected');
    expect(wrapper.find('.dg-note').classes()).not.toContain('is-selected');

    // Dragging one selected table moves both by the same snapped delta.
    await wrapper.find('.dg-table[data-key="public.users"]').trigger('pointerdown', {
      button: 0,
      clientX: 10,
      clientY: 10,
    });
    window.dispatchEvent(new MouseEvent('pointermove', {
      clientX: 10 + 40,
      clientY: 10 + 16,
    }));
    await nextTick();
    expect(wrapper.find('.dg-table[data-key="public.posts"]').classes()).toContain('is-dragging');
    window.dispatchEvent(new MouseEvent('pointerup', {
      clientX: 50,
      clientY: 26,
    }));
    await nextTick();
    expect(lastPositionChange(wrapper)).toEqual(expect.arrayContaining([
      {
        key: 'public.users',
        x: 40,
        y: 16,
      },
      {
        key: 'public.posts',
        x: 440,
        y: 16,
      },
    ]));
    expect(lastPositionChange(wrapper)).toHaveLength(2);

    // Cmd-click toggles single elements in and out of the selection.
    await wrapper.find('.dg-note').trigger('pointerdown', {
      button: 0,
      clientX: 810,
      clientY: 10,
      metaKey: true,
    });
    window.dispatchEvent(new MouseEvent('pointerup', {
      clientX: 810,
      clientY: 10,
    }));
    await nextTick();
    expect(wrapper.find('.dg-note').classes()).toContain('is-selected');
    expect(wrapper.findAll('.dg-table.is-selected')).toHaveLength(2);
    await wrapper.find('.dg-table[data-key="public.posts"]').trigger('pointerdown', {
      button: 0,
      clientX: 450,
      clientY: 26,
      metaKey: true,
    });
    window.dispatchEvent(new MouseEvent('pointerup', {
      clientX: 450,
      clientY: 26,
    }));
    await nextTick();
    expect(wrapper.find('.dg-table[data-key="public.posts"]').classes()).not.toContain('is-selected');
    expect(wrapper.find('.dg-table[data-key="public.users"]').classes()).toContain('is-selected');

    // A plain click on the bare canvas clears the selection.
    await bg.trigger('pointerdown', {
      button: 0,
      clientX: 600,
      clientY: 300,
    });
    window.dispatchEvent(new MouseEvent('pointerup', {
      clientX: 600,
      clientY: 300,
    }));
    await bg.trigger('click');
    expect(wrapper.findAll('.dg-table.is-selected')).toHaveLength(0);
    wrapper.unmount();
  });

  it('pans the canvas in pan mode or while Space is held instead of selecting', async () => {
    const wrapper = mountCanvas({
      'public.users': {
        x: 0,
        y: 0,
      },
      'public.posts': {
        x: 400,
        y: 0,
      },
      'note:hint': {
        x: 800,
        y: 0,
      },
    });
    await nextTick();
    const transform = () => wrapper.find('.dg-viewport').attributes('transform');
    expect(transform()).toBe('translate(0 0) scale(1)');

    window.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'Space',
      key: ' ',
    }));
    await nextTick();
    expect(wrapper.find('.dg-root').classes()).toContain('is-pan');
    await wrapper.find('.dg-bg-fill').trigger('pointerdown', {
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    window.dispatchEvent(new MouseEvent('pointermove', {
      clientX: 130,
      clientY: 120,
    }));
    window.dispatchEvent(new MouseEvent('pointerup', {
      clientX: 130,
      clientY: 120,
    }));
    await nextTick();
    expect(transform()).toBe('translate(30 20) scale(1)');
    expect(wrapper.find('.dg-marquee').exists()).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keyup', {
      code: 'Space',
      key: ' ',
    }));
    await nextTick();
    expect(wrapper.find('.dg-root').classes()).not.toContain('is-pan');

    // A middle-button drag pans from anywhere, even from a table, and moves nothing else.
    const before = transform();
    await wrapper.find('.dg-table[data-key="public.users"]').trigger('pointerdown', {
      button: 1,
      clientX: 0,
      clientY: 0,
    });
    window.dispatchEvent(new MouseEvent('pointermove', {
      clientX: -30,
      clientY: 0,
    }));
    window.dispatchEvent(new MouseEvent('pointerup', {
      clientX: -30,
      clientY: 0,
    }));
    await nextTick();
    expect(transform()).not.toBe(before);
    expect(transform()).toBe('translate(0 20) scale(1)');
    expect(wrapper.emitted('position-change')?.some((c) => (c[0] as { key: string }[]).some((x) => x.key === 'public.users'))).toBeFalsy();
    wrapper.unmount();
  });

  it('leaves Space alone while a text field or an editor textbox has focus', async () => {
    const wrapper = mountCanvas({
      'public.users': {
        x: 0,
        y: 0,
      },
      'public.posts': {
        x: 400,
        y: 0,
      },
      'note:hint': {
        x: 800,
        y: 0,
      },
    });
    await nextTick();
    // Monaco's EditContext input: a plain div with role="textbox" inside .monaco-editor.
    const host = document.createElement('div');
    host.className = 'monaco-editor';
    const textbox = document.createElement('div');
    textbox.setAttribute('role', 'textbox');
    textbox.tabIndex = 0;
    host.appendChild(textbox);
    document.body.appendChild(host);
    textbox.focus();
    const press = new KeyboardEvent('keydown', {
      code: 'Space',
      key: ' ',
      cancelable: true,
    });
    window.dispatchEvent(press);
    await nextTick();
    expect(press.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(textbox);
    expect(wrapper.find('.dg-root').classes()).not.toContain('is-pan');
    host.remove();
    wrapper.unmount();
  });

  it('selects a relationship on click, moves its route by a control point, and resets it', async () => {
    const positions = {
      'public.users': {
        x: 0,
        y: 0,
      },
      'public.posts': {
        x: 400,
        y: 0,
      },
      'note:hint': {
        x: 800,
        y: 0,
      },
    };
    const wrapper = mountCanvas(positions);
    await nextTick();
    expect(wrapper.find('.dg-edge-controls').exists()).toBe(false);
    await wrapper.find('.dg-ref-hit').trigger('click');
    const controls = wrapper.find('.dg-edge-controls');
    expect(controls.exists()).toBe(true);
    // The automatic route has one movable vertical segment plus a bend handle on each stub.
    expect(controls.findAll('.dg-edge-handle')).toHaveLength(3);
    expect(controls.findAll('.dg-edge-handle.is-stub')).toHaveLength(2);
    expect(controls.find('[aria-label="Relationship color"]').exists()).toBe(true);
    expect(controls.find('[aria-label="Reset route"]').exists()).toBe(false);

    // Drag the vertical segment 40px to the right.
    const rail = controls.find('.dg-edge-handle:not(.is-stub)');
    const cx = Number(rail.attributes('cx'));
    await rail.trigger('pointerdown', {
      button: 0,
      clientX: 300,
      clientY: 100,
    });
    window.dispatchEvent(new MouseEvent('pointermove', {
      clientX: 340,
      clientY: 100,
    }));
    window.dispatchEvent(new MouseEvent('pointerup', {
      clientX: 340,
      clientY: 100,
    }));
    await nextTick();
    const events = wrapper.emitted('edge-route-change') as [string, number[] | null][];
    expect(events).toHaveLength(1);
    const [key, rails] = events[0]!;
    // Moves snap to the 8px grid like everything else.
    expect(rails).toEqual([snap8(cx + 40)]);
    // Still pinned after the drag, and the line now runs through the new x.
    expect(wrapper.find('.dg-edge-controls').exists()).toBe(true);
    await wrapper.setProps({ edgeRoutes: { [key]: rails! } });
    expect(wrapper.find('.dg-ref-hit').attributes('d')).toContain(`${snap8(cx + 40)}`);
    expect(wrapper.find('[aria-label="Reset route"]').exists()).toBe(true);

    await wrapper.find('[aria-label="Reset route"]').trigger('click');
    expect(wrapper.emitted('edge-route-change')!.at(-1)).toEqual([key, null]);
    await wrapper.setProps({ edgeRoutes: {} });

    // Hovering the stretch between the vertical segment's control point and its lower corner
    // reveals one mid-point there; dragging it splits the segment into a new bend.
    expect(wrapper.find('.dg-edge-split').exists()).toBe(false);
    await wrapper.find('.dg-edge-half[data-half="1-after"]').trigger('pointerenter');
    const split = wrapper.find('.dg-edge-split');
    expect(split.exists()).toBe(true);
    // The segment runs from users.id (y 48) to posts.user_id (y 80): three quarters along is y 72.
    expect(Number(split.attributes('cy'))).toBe(72);
    await split.trigger('pointerdown', {
      button: 0,
      clientX: 300,
      clientY: 72,
    });
    window.dispatchEvent(new MouseEvent('pointermove', {
      clientX: 340,
      clientY: 72,
    }));
    window.dispatchEvent(new MouseEvent('pointerup', {
      clientX: 340,
      clientY: 72,
    }));
    await nextTick();
    expect(wrapper.emitted('edge-route-change')!.at(-1)).toEqual([key, [cx, 72, snap8(cx + 40)]]);
    expect(wrapper.find('.dg-edge-split').exists()).toBe(false);

    // On an end stub the mid-point bends the stub into a vertical at that x.
    await wrapper.find('.dg-edge-half[data-half="0-after"]').trigger('pointerenter');
    const stubSplit = wrapper.find('.dg-edge-split');
    const jogX = Number(stubSplit.attributes('cx'));
    await stubSplit.trigger('pointerdown', {
      button: 0,
      clientX: 100,
      clientY: 48,
    });
    window.dispatchEvent(new MouseEvent('pointermove', {
      clientX: 100,
      clientY: 88,
    }));
    window.dispatchEvent(new MouseEvent('pointerup', {
      clientX: 100,
      clientY: 88,
    }));
    await nextTick();
    expect(wrapper.emitted('edge-route-change')!.at(-1)).toEqual([key, [snap8(jogX), 88, cx]]);

    // The gear opens the picker for the line.
    await wrapper.find('[aria-label="Relationship color"]').trigger('click');
    expect(wrapper.find('.dg-color-title').text()).toBe('Color');
    await wrapper.findAll('.dg-color-swatch')[1]!.trigger('click');
    expect(wrapper.emitted('set-color')!.at(-1)).toEqual([{
      kind: 'ref',
      key,
      color: '#E74C3C',
    }]);
    wrapper.unmount();
  });

  it('shows an edge tooltip that trails the cursor', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mountCanvas({
        'public.users': {
          x: 0,
          y: 0,
        },
        'public.posts': {
          x: 400,
          y: 0,
        },
        'note:hint': {
          x: 800,
          y: 0,
        },
      });
      await nextTick();
      await wrapper.find('.dg-svg').trigger('pointermove', {
        clientX: 200,
        clientY: 100,
      });
      await wrapper.find('.dg-ref-hit').trigger('pointerenter');
      vi.advanceTimersByTime(300);
      // One tick to render the tooltip, one for its post-flush measurement, one to apply the position.
      await nextTick();
      await nextTick();
      await nextTick();
      const tip = wrapper.find('.dg-tooltip');
      expect(tip.exists()).toBe(true);
      // Right of the cursor by 15px, top 12px above it (the pane is unmeasured, so nothing clamps).
      expect(tip.attributes('style')).toContain('left: 215px');
      expect(tip.attributes('style')).toContain('top: 88px');

      await wrapper.find('.dg-svg').trigger('pointermove', {
        clientX: 300,
        clientY: 150,
      });
      expect(wrapper.find('.dg-tooltip').attributes('style')).toContain('left: 315px');
      expect(wrapper.find('.dg-tooltip').attributes('style')).toContain('top: 138px');
      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('highlights every edge with ants, names, and cardinalities in highlight-all mode', async () => {
    const wrapper = mount(DiagramCanvas, {
      props: {
        model: buildDiagramModel(compile(`
          Table users { id int [pk] }
          Table posts { id int [pk] \n user_id int }
          Ref author: posts.user_id > users.id
          Dep: users -> posts
        `)),
        positions: {
          'public.users': {
            x: 0,
            y: 0,
          },
          'public.posts': {
            x: 400,
            y: 0,
          },
        },
        detailLevel: 'all',
        dark: false,
        highlightAll: true,
      },
      attachTo: document.body,
    });
    await nextTick();
    expect(wrapper.findAll('.dg-ref.is-highlighted')).toHaveLength(2);
    expect(wrapper.findAll('.dg-ref-overlay')).toHaveLength(2);
    expect(wrapper.find('.dg-edge-label').text()).toBe('author');
    expect(wrapper.findAll('.dg-edge-cardinality').map((t) => t.text()).sort()).toEqual(['*', '1']);

    await wrapper.setProps({ highlightAll: false });
    expect(wrapper.findAll('.dg-ref.is-highlighted')).toHaveLength(0);
    expect(wrapper.findAll('.dg-edge-cardinality')).toHaveLength(0);
    wrapper.unmount();
  });
});

describe('DiagramCanvas while the model is loading', () => {
  it('waits with auto-placement until the model has caught up with the text', async () => {
    const wrapper = mount(DiagramCanvas, {
      props: {
        model: buildDiagramModel(compile(DBML)),
        positions: {},
        detailLevel: 'all',
        dark: false,
        loading: true,
      },
      attachTo: document.body,
    });
    await flushPromises();
    await nextTick();
    expect(wrapper.emitted('position-change')).toBeUndefined();

    await wrapper.setProps({ loading: false });
    await flushPromises();
    await nextTick();
    const events = wrapper.emitted('position-change') as PositionChange[][];
    expect(events.at(-1)![0]!.map((c) => c.key).sort()).toEqual(['note:hint', 'public.posts', 'public.users']);
    wrapper.unmount();
  });
});

describe('DiagramCanvas partial refs', () => {
  const GRAIN_POSITIONS = {
    'input.config': { x: 0, y: 0 },
    'input.component': { x: 0, y: 200 },
    'input.site': { x: 0, y: 400 },
    'count.component_count': { x: 400, y: 0 },
    'power.component_power': { x: 400, y: 200 },
    'power.dc_power': { x: 400, y: 400 },
    'money.component_money': { x: 800, y: 0 },
    'money.dc_opex': { x: 800, y: 200 },
  };
  const SITE_REF = '#input.site(config_id)->input.config(config_id)';

  function mountGrain (props: { partialRefMode?: PartialRefMode; highlightAll?: boolean; edgeRoutes?: Record<string, number[]> } = {}) {
    return mount(DiagramCanvas, {
      props: {
        model: buildDiagramModel(compile(GRAIN)),
        positions: GRAIN_POSITIONS,
        detailLevel: 'all',
        dark: false,
        showLineage: false,
        ...props,
      },
      attachTo: document.body,
    });
  }

  const refLines = (w: ReturnType<typeof mountGrain>) => w.findAll('.dg-ref:not(.dg-dep)');
  const badgesOf = (w: ReturnType<typeof mountGrain>) => w.findAll('.dg-partial-badge')
    .map((b) => `${b.element.closest('.dg-table')!.getAttribute('data-key')} ${b.text()}`);

  it('draws each table\'s partial refs as one badge per partial instead of lines, and as lines when asked', async () => {
    const wrapper = mountGrain();
    await nextTick();
    expect(refLines(wrapper)).toHaveLength(0);
    expect(badgesOf(wrapper)).toEqual([
      'input.site ~per_config',
      'count.component_count ~per_config_component',
      'power.component_power ~per_config_component',
      'power.dc_power ~per_config',
      'money.component_money ~per_config_component',
      'money.dc_opex ~per_config',
    ]);

    await wrapper.setProps({ partialRefMode: 'lines' });
    expect(refLines(wrapper)).toHaveLength(9);
    expect(wrapper.findAll('.dg-partial-badge')).toHaveLength(0);
    wrapper.unmount();
  });

  it('keeps drawing refs declared on a table itself, on the same anchors, in both modes', async () => {
    const wrapper = mount(DiagramCanvas, {
      props: {
        model: buildDiagramModel(compile(`
          TablePartial per_config { config_id text [pk, ref: - config.config_id] }
          Table config { config_id text [pk] }
          Table site { ~per_config \n name text }
          Table plant { id int [pk] \n site_config text [ref: > site.config_id] }
        `)),
        positions: {
          'public.config': { x: 0, y: 0 },
          'public.site': { x: 400, y: 0 },
          'public.plant': { x: 800, y: 0 },
        },
        detailLevel: 'all',
        dark: false,
      },
      attachTo: document.body,
    });
    await nextTick();
    const own = () => wrapper.find('.dg-ref[data-key="#public.site(config_id)->public.plant(site_config)"] .dg-ref-hit');
    expect(refLines(wrapper)).toHaveLength(1);
    const d = own().attributes('d');

    await wrapper.setProps({ partialRefMode: 'lines' });
    expect(refLines(wrapper)).toHaveLength(2);
    // The partial ref leaves the same row; lines sharing a row share its anchor, so nothing moves.
    expect(own().attributes('d')).toBe(d);
    wrapper.unmount();
  });

  it('draws a hovered badge\'s refs with the marching ants, lights up their ends, and shows its tooltip', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mountGrain();
      await nextTick();
      const table = wrapper.find('.dg-table[data-key="count.component_count"]');
      await table.trigger('pointerenter');
      await table.find('.dg-partial-badge').trigger('pointerenter');

      const lines = refLines(wrapper);
      expect(lines.map((l) => l.attributes('data-key')).sort()).toEqual([
        '#count.component_count(component)->input.component(name)',
        '#count.component_count(config_id)->input.config(config_id)',
      ]);
      expect(lines.every((l) => l.classes('is-highlighted') && l.find('.dg-ref-overlay').exists())).toBe(true);
      // They stand in for the badge: the pointer passes through them.
      expect(lines.some((l) => l.find('.dg-ref-hit').exists())).toBe(false);
      expect(wrapper.findAll('.dg-table.is-highlighted').map((t) => t.attributes('data-key')).sort())
        .toEqual(['count.component_count', 'input.component', 'input.config']);
      expect(wrapper.findAll('.dg-field.is-highlighted')).toHaveLength(4);
      expect(table.find('.dg-partial-badge').classes()).toContain('is-highlighted');

      vi.advanceTimersByTime(300);
      await nextTick();
      await nextTick();
      await nextTick();
      const tip = wrapper.find('.dg-tooltip');
      expect(tip.find('.dg-tooltip-title').text()).toBe('~per_config_component');
      expect(tip.text()).toContain('(config_id, component)');
      expect(tip.text()).toContain('component (*) → input.component.name (1)');

      await table.find('.dg-partial-badge').trigger('pointerleave');
      await table.trigger('pointerleave');
      expect(refLines(wrapper)).toHaveLength(0);
      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('pins a clicked badge so its refs stay drawn, without the controls for rerouting them', async () => {
    const wrapper = mountGrain();
    await nextTick();
    const table = wrapper.find('.dg-table[data-key="money.dc_opex"]');
    await table.trigger('pointerenter');
    const badge = table.find('.dg-partial-badge');
    await badge.trigger('pointerenter');
    await badge.trigger('pointerdown', {
      button: 0,
      clientX: 900,
      clientY: 216,
    });
    window.dispatchEvent(new MouseEvent('pointerup', {
      clientX: 900,
      clientY: 216,
    }));
    await nextTick();
    // The press raised the table above the others, so it is a new element by now.
    const after = wrapper.find('.dg-table[data-key="money.dc_opex"]');
    await after.find('.dg-partial-badge').trigger('pointerleave');
    await after.trigger('pointerleave');
    expect(refLines(wrapper).map((l) => l.attributes('data-key'))).toEqual(['#money.dc_opex(config_id)->input.config(config_id)']);
    expect(wrapper.find('.dg-edge-controls').exists()).toBe(false);
    expect(after.classes()).toContain('is-selected');

    // Escape lets go of it.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(refLines(wrapper)).toHaveLength(0);
    wrapper.unmount();
  });

  it('leaves partial refs shown as badges out of highlight-all', async () => {
    const wrapper = mountGrain({ highlightAll: true });
    await nextTick();
    expect(refLines(wrapper)).toHaveLength(0);
    await wrapper.setProps({ partialRefMode: 'lines' });
    expect(wrapper.findAll('.dg-ref.is-highlighted')).toHaveLength(9);
    wrapper.unmount();
  });

  it('keeps a hand-drawn route for a partial ref while it is a badge and follows it again as a line', async () => {
    const wrapper = mountGrain({ edgeRoutes: { [SITE_REF]: [-96] } });
    await nextTick();
    expect(wrapper.find(`.dg-ref[data-key="${SITE_REF}"]`).exists()).toBe(false);
    await wrapper.setProps({ partialRefMode: 'lines' });
    expect(wrapper.find(`.dg-ref[data-key="${SITE_REF}"] .dg-ref-hit`).attributes('d')).toContain('-96');
    wrapper.unmount();
  });
});

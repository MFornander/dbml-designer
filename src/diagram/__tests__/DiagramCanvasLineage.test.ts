// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import DiagramCanvas from '@/diagram/components/DiagramCanvas.vue';
import { buildDiagramModel } from '@/diagram/adapter/buildModel';
import { compile } from './testUtils';

const DBML = `
  Table raw { id int [pk] }
  Table stg { id int [pk] \n raw_id int [ref: > raw.id] }
  Table fct { id int [pk] }
  Table lonely { id int [pk] }
  Dep pipeline { raw -> stg }
  Dep: stg -> fct
  TableGroup g { raw \n stg }
  Note n { 'hi' }
`;

const positions = {
  'public.raw': {
    x: 800,
    y: 0,
  },
  'public.stg': {
    x: 0,
    y: 0,
  },
  'public.fct': {
    x: 400,
    y: 0,
  },
  'public.lonely': {
    x: 0,
    y: 400,
  },
  'note:n': {
    x: 1200,
    y: 0,
  },
};

function xOf (wrapper: ReturnType<typeof mount>, key: string): number {
  const t = wrapper.find(`.dg-table[data-key="${key}"]`).attributes('transform')!;
  return Number(/translate\(([-\d.]+)/.exec(t)![1]);
}

describe('DiagramCanvas lineage layout', () => {
  it('lays tables out by dependency order and hides groups and notes but keeps filtered edges', async () => {
    const wrapper = mount(DiagramCanvas, {
      props: {
        model: buildDiagramModel(compile(DBML)),
        positions,
        detailLevel: 'all',
        dark: false,
        lineageLayout: true,
        showRefs: true,
        showLineage: true,
      },
      attachTo: document.body,
    });
    await nextTick();

    // The connections filter still applies: the one relationship stays, lineage edges too.
    expect(wrapper.findAll('.dg-ref:not(.dg-dep)')).toHaveLength(1);
    expect(wrapper.findAll('.dg-dep')).toHaveLength(2);
    expect(wrapper.findAll('.dg-group')).toHaveLength(0);
    expect(wrapper.findAll('.dg-note')).toHaveLength(0);
    expect(wrapper.findAll('.dg-table')).toHaveLength(4);

    // Stored positions are ignored: raw (source) sits left of stg, which sits left of fct.
    expect(xOf(wrapper, 'public.raw')).toBeLessThan(xOf(wrapper, 'public.stg'));
    expect(xOf(wrapper, 'public.stg')).toBeLessThan(xOf(wrapper, 'public.fct'));
    expect(xOf(wrapper, 'public.lonely')).toBeGreaterThan(xOf(wrapper, 'public.fct'));
    expect(wrapper.find('.dg-table[data-key="public.lonely"]').classes()).toContain('is-dimmed');
    expect(wrapper.find('.dg-table[data-key="public.raw"]').classes()).not.toContain('is-dimmed');

    // Nothing is placed or moved in this view.
    expect(wrapper.emitted('position-change')).toBeUndefined();
    await wrapper.find('.dg-table[data-key="public.raw"]').trigger('pointerdown', {
      button: 0,
      clientX: 5,
      clientY: 5,
    });
    window.dispatchEvent(new MouseEvent('pointermove', {
      clientX: 105,
      clientY: 55,
    }));
    window.dispatchEvent(new MouseEvent('pointerup', {
      clientX: 105,
      clientY: 55,
    }));
    await nextTick();
    expect(wrapper.emitted('position-change')).toBeUndefined();
    wrapper.unmount();
  });

  it('returns to stored positions when the lineage layout is switched off', async () => {
    const wrapper = mount(DiagramCanvas, {
      props: {
        model: buildDiagramModel(compile(DBML)),
        positions,
        detailLevel: 'all',
        dark: false,
        lineageLayout: true,
      },
      attachTo: document.body,
    });
    await nextTick();
    await wrapper.setProps({ lineageLayout: false });
    await nextTick();
    expect(xOf(wrapper, 'public.raw')).toBe(800);
    expect(wrapper.findAll('.dg-group')).toHaveLength(1);
    expect(wrapper.findAll('.dg-note')).toHaveLength(1);
    expect(wrapper.findAll('.dg-ref:not(.dg-dep)')).toHaveLength(1);
    wrapper.unmount();
  });
});

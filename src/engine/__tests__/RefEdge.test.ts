// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import RefEdge from '../components/RefEdge.vue';
import { DIAGRAM_CTX } from '../state/context';
import type { RefVM } from '../types';
import type { RefGeometry } from '../state/useDiagramGeometry';
import { routeRef, trimEnds, midpoint } from '../geometry/routing';
import { roundedPolylinePath } from '../geometry/pathBuilder';
import { markerGeometry } from '../geometry/markers';
import { makeContext } from '@/dbml/__tests__/testUtils';

function makeRef (extra: Partial<RefVM> = {}): RefVM {
  return {
    key: 'r1',
    name: null,
    endpoints: [
      {
        tableKey: 'public.posts',
        fieldNames: ['user_id'],
        fieldKeys: ['public.posts.user_id'],
        fieldIndices: [1],
        cardinality: '*',
        marker: 'some',
      },
      {
        tableKey: 'public.users',
        fieldNames: ['id'],
        fieldKeys: ['public.users.id'],
        fieldIndices: [0],
        cardinality: '1',
        marker: 'one',
      },
    ],
    color: null,
    lineColor: null,
    inactive: false,
    isSelf: false,
    ...extra,
  };
}

function makeGeo (): RefGeometry {
  const a = {
    x: 200,
    y: 72,
    side: 'right' as const,
  };
  const b = {
    x: 500,
    y: 168,
    side: 'left' as const,
  };
  const points = routeRef(a, b);
  const markerA = markerGeometry('some');
  const markerB = markerGeometry('one');
  return {
    a,
    b,
    points,
    dFull: roundedPolylinePath(points),
    dTrimmed: roundedPolylinePath(trimEnds(points, markerA.lineShorten, markerB.lineShorten)),
    markerA,
    markerB,
    mid: midpoint(points),
  };
}

function mountRef (edge: RefVM, highlighted: boolean, ctx = makeContext()) {
  return mount(RefEdge, {
    props: {
      edge,
      kind: 'ref',
      geo: makeGeo(),
      highlighted,
    },
    global: {
      provide: {
        [DIAGRAM_CTX as symbol]: ctx,
      },
    },
  });
}

describe('RefEdge', () => {
  it('renders a hit path, the line, and two mirrored markers', () => {
    const w = mountRef(makeRef(), false);
    expect(w.find('.dg-ref-hit').exists()).toBe(true);
    expect(w.find('.dg-ref-line').attributes('d')).toMatch(/^M/);
    const markers = w.findAll('.dg-ref-marker');
    expect(markers).toHaveLength(2);
    expect(markers[0]!.attributes('transform')).toBe('translate(200 72) scale(1 1)');
    expect(markers[1]!.attributes('transform')).toBe('translate(500 168) scale(-1 1)');
    expect(w.find('.dg-ref-overlay').exists()).toBe(false);
  });

  it('mounts the marching-ants overlay only when highlighted', () => {
    const w = mountRef(makeRef(), true);
    expect(w.classes()).toContain('is-highlighted');
    expect(w.find('.dg-ref-overlay').exists()).toBe(true);
    expect(w.find('.dg-ref-overlay').attributes('d')).toBe(w.find('.dg-ref-line').attributes('d'));
    expect(w.find('.dg-edge-label').exists()).toBe(false);
  });

  it('shows endpoint cardinalities while highlighted and can skip the animation', () => {
    const w = mountRef(makeRef(), true);
    const cards = w.findAll('.dg-edge-cardinality');
    expect(cards.map((c) => c.text())).toEqual(['*', '1']);
    expect(cards[0]!.attributes('text-anchor')).toBe('start');
    expect(cards[1]!.attributes('text-anchor')).toBe('end');

    const still = mount(RefEdge, {
      props: {
        edge: makeRef(),
        kind: 'ref',
        geo: makeGeo(),
        highlighted: true,
        animated: false,
      },
      global: {
        provide: {
          [DIAGRAM_CTX as symbol]: makeContext(),
        },
      },
    });
    expect(still.classes()).toContain('is-highlighted');
    expect(still.find('.dg-ref-overlay').exists()).toBe(false);
    expect(still.findAll('.dg-edge-cardinality')).toHaveLength(2);
  });

  it('shows the relationship name as a label only while highlighted', () => {
    expect(mountRef(makeRef({ name: 'fk_posts_users' }), false).find('.dg-edge-label').exists()).toBe(false);
    const w = mountRef(makeRef({ name: 'fk_posts_users' }), true);
    expect(w.find('.dg-edge-label').text()).toBe('fk_posts_users');
  });

  it('renders lineage edges with an arrowhead only at the downstream end', () => {
    const ctx = makeContext();
    const w = mount(RefEdge, {
      props: {
        edge: {
          key: 'dep:x',
          label: 'rollup',
          upstream: makeRef().endpoints[0],
          downstream: makeRef().endpoints[1],
          color: null,
          isSelf: false,
        },
        kind: 'dep',
        geo: {
          ...makeGeo(),
          markerA: markerGeometry('none'),
          markerB: markerGeometry('arrow'),
        },
        highlighted: false,
      },
      global: {
        provide: {
          [DIAGRAM_CTX as symbol]: ctx,
        },
      },
    });
    expect(w.classes()).toContain('dg-dep');
    expect(w.findAll('.dg-ref-marker')).toHaveLength(1);
    w.find('.dg-ref-hit').trigger('pointerenter');
    expect(ctx.hovers.at(-1)).toEqual({
      kind: 'dep',
      key: 'dep:x',
    });
  });

  it('applies inactive styling and carries custom colors as CSS variables', () => {
    const w = mountRef(makeRef({
      inactive: true,
      color: '#CA4242',
      lineColor: '#CA4242',
    }), false);
    expect(w.classes()).toContain('is-inactive');
    expect(w.classes()).toContain('is-colored');
    expect(w.attributes('style')).toContain('--dg-edge-color: #CA4242');
    expect(w.attributes('style')).toContain('--dg-edge-hl: #CA4242');
    expect(mountRef(makeRef(), false).attributes('style')).toBeUndefined();
  });

  it('reports hover and pin through the diagram context', async () => {
    const ctx = makeContext();
    const w = mountRef(makeRef(), false, ctx);
    await w.find('.dg-ref-hit').trigger('pointerenter');
    expect(ctx.hovers.at(-1)).toEqual({
      kind: 'ref',
      key: 'r1',
    });
    await w.find('.dg-ref-hit').trigger('click');
    expect(ctx.pins).toEqual([{
      kind: 'ref',
      key: 'r1',
    }]);
  });
});

// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { DiagramCanvas } from '@dbml-designer/engine';
import { buildDiagramModel } from '@/dbml/buildModel';
import { toModel } from '@/dbml/toModel';
import { modelOf, formatModelText } from '@/cli/lib';
import { compile } from './testUtils';
import TRACE from '@/sample/trace.dbml?raw';

describe('Dep kinds from DBML', () => {
  it('become the dep\'s kind in the model, not metadata', () => {
    const { model } = toModel(compile([
      'Table a {\n  x int\n  y int\n}',
      'Table b {\n  z int\n}',
      'Table c {\n  w int\n}',
      'Dep: a.x -> b.z [kind: \'value\', owner: \'pricing\']',
      'Dep: a.y -> b.z [kind: \'row\']',
      'Dep: a.x -> c.w',
      '',
    ].join('\n')));
    expect(model.deps!.map((d) => [d.kind, d.metadata])).toEqual([
      ['value', { owner: 'pricing' }],
      ['row', undefined],
      [undefined, undefined],
    ]);
  });

  it('draw the trace\'s five mappings into price field to field, the two row edges in short dashes', async () => {
    const m = buildDiagramModel(compile(TRACE));
    const positions = Object.fromEntries(m.tables.map((t, i) => [t.key, {
      x: (i % 2) * 400,
      y: Math.floor(i / 2) * 240,
    }]));
    const wrapper = mount(DiagramCanvas, {
      props: {
        model: m,
        positions,
        detailLevel: 'all',
        dark: false,
        lineageColumns: true,
      },
      attachTo: document.body,
    });
    await nextTick();
    const deps = wrapper.findAll('.dg-dep');
    expect(deps).toHaveLength(5);
    expect(deps.every((e) => (e.attributes('data-key') ?? '').endsWith('->money.line_price(price)'))).toBe(true);
    expect(wrapper.findAll('.dg-dep.is-kind-value')).toHaveLength(3);
    expect(wrapper.findAll('.dg-dep.is-kind-row')).toHaveLength(2);
    wrapper.unmount();
  });

  it('are printed by graph after each mapping', () => {
    const { model } = modelOf(TRACE);
    const text = formatModelText(model!);
    expect(text).toContain('    spec.order_line.quantity -> money.line_price.price  (value)\n');
    expect(text).toContain('    spec.order_line.rate_id -> money.line_price.price  (row)\n');
  });
});

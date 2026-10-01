// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import DiagramCanvas from '../components/DiagramCanvas.vue';
import { fromModel } from '../fromModel';
import { buildTooltipContent } from '../state/useTooltip';
import type { Model } from '../model';

/**
 * The trace from issue #4 in short: two mappings of different kinds between the same two tables,
 * one colored mapping from a third, and a table-level dep with no mappings at all.
 */
const MODEL: Model = {
  tables: [
    {
      schema: 'spec',
      name: 'order_line',
      fields: [
        {
          name: 'item_id',
          type: 'text',
        },
        {
          name: 'quantity',
          type: 'double',
        },
      ],
    },
    {
      schema: 'input',
      name: 'item',
      fields: [{
        name: 'unit_cost',
        type: 'double',
      }],
    },
    {
      schema: 'money',
      name: 'line_price',
      fields: [{
        name: 'price',
        type: 'double',
      }],
    },
    {
      name: 'audit',
      fields: [{
        name: 'id',
        type: 'int',
      }],
    },
  ],
  deps: [
    {
      from: {
        table: 'spec.order_line',
        fields: ['quantity'],
      },
      to: {
        table: 'money.line_price',
        fields: ['price'],
      },
      name: 'qty',
      kind: 'value',
      note: 'an operand',
      metadata: { formula: 'quantity × unit_cost' },
    },
    {
      from: {
        table: 'spec.order_line',
        fields: ['item_id'],
      },
      to: {
        table: 'money.line_price',
        fields: ['price'],
      },
      kind: 'row',
      note: 'picks the item',
    },
    {
      from: {
        table: 'input.item',
        fields: ['unit_cost'],
      },
      to: {
        table: 'money.line_price',
        fields: ['price'],
      },
      kind: 'value',
      color: '#CA4242',
    },
    {
      from: { table: 'money.line_price' },
      to: { table: 'public.audit' },
      kind: 'audited',
    },
  ],
};

const positions = {
  'spec.order_line': {
    x: 0,
    y: 0,
  },
  'input.item': {
    x: 0,
    y: 240,
  },
  'money.line_price': {
    x: 400,
    y: 0,
  },
  'public.audit': {
    x: 800,
    y: 0,
  },
};

const PAIR = 'dep:spec.order_line->money.line_price';
const COLUMN_QTY = 'dep:spec.order_line(quantity)->money.line_price(price)';
const COLUMN_ITEM = 'dep:spec.order_line(item_id)->money.line_price(price)';

function mountCanvas (lineageColumns: boolean) {
  return mount(DiagramCanvas, {
    props: {
      model: fromModel(MODEL),
      positions,
      detailLevel: 'all',
      dark: false,
      lineageColumns,
    },
    attachTo: document.body,
  });
}

describe('column-level deps', () => {
  it('keep their own dep\'s kind, note, and metadata, while the table pair keeps the merged view', () => {
    const m = fromModel(MODEL);
    const pair = m.deps.find((d) => d.key === PAIR)!;
    expect(pair.columns.map((c) => [c.upstream.fieldNames[0], c.kind, c.mappings.map((x) => [x.key, x.kind, x.note, x.metadata])])).toEqual([
      ['quantity', 'value', [[`${COLUMN_QTY}#value`, 'value', 'an operand', { formula: 'quantity × unit_cost' }]]],
      ['item_id', 'row', [[`${COLUMN_ITEM}#row`, 'row', 'picks the item', undefined]]],
    ]);
    expect(pair.kind).toBeUndefined();
    expect(pair.note).toBe('an operand\npicks the item');
    expect(pair.metadata).toEqual({ formula: 'quantity × unit_cost' });
  });

  it('list their kind in the pair\'s tooltip, and their own name, kind, note, and metadata in their own', () => {
    const m = fromModel(MODEL);
    const pair = m.deps.find((d) => d.key === PAIR)!;
    expect(buildTooltipContent(m, {
      kind: 'dep',
      key: PAIR,
    })?.columns).toEqual(['quantity → price (value)', 'item_id → price (row)']);
    const [value, row] = pair.columns;
    expect(buildTooltipContent(m, {
      kind: 'dep',
      key: value!.key,
    })).toEqual({
      kind: 'dep',
      title: 'spec.order_line.quantity',
      target: 'money.line_price.price',
      subtitle: 'qty',
      lines: ['kind: value'],
      metadata: [['formula', 'quantity × unit_cost']],
      note: 'an operand',
    });
    expect(buildTooltipContent(m, {
      kind: 'dep',
      key: row!.key,
    })).toEqual({
      kind: 'dep',
      title: 'spec.order_line.item_id',
      target: 'money.line_price.price',
      lines: ['kind: row'],
      note: 'picks the item',
    });
  });

  it('are drawn only on hover while lineage is drawn by table pair, which looks as before', async () => {
    const wrapper = mountCanvas(false);
    await nextTick();
    expect(wrapper.findAll('.dg-dep').map((e) => e.attributes('data-key')).sort()).toEqual([
      'dep:input.item->money.line_price',
      'dep:money.line_price->public.audit',
      PAIR,
    ]);
    expect(wrapper.find('.dg-dep[class*="is-kind-"]').exists()).toBe(false);
    expect(wrapper.find('.dg-legend').exists()).toBe(false);
    wrapper.unmount();
  });

  it('are all drawn field to field by kind, with a legend, in place of their table pair\'s edge', async () => {
    const wrapper = mountCanvas(true);
    await nextTick();
    const deps = wrapper.findAll('.dg-dep');
    expect(deps).toHaveLength(4);
    expect(wrapper.find(`.dg-dep[data-key="${PAIR}"]`).exists()).toBe(false);
    // A pair with no mappings keeps its edge, in the usual style whatever its kind.
    const audit = wrapper.find('.dg-dep[data-key="dep:money.line_price->public.audit"]');
    expect(audit.classes().some((c) => c.startsWith('is-kind-'))).toBe(false);
    expect(wrapper.findAll('.dg-dep.is-kind-value')).toHaveLength(2);
    expect(wrapper.findAll('.dg-dep.is-kind-row')).toHaveLength(1);
    // An explicit color colors the line and leaves the kind's pattern alone.
    const colored = wrapper.findAll('.dg-dep.is-kind-value').filter((e) => (e.attributes('style') ?? '').includes('#CA4242'));
    expect(colored).toHaveLength(1);
    expect(wrapper.findAll('.dg-legend-item').map((e) => e.text())).toEqual(['value', 'row']);
    wrapper.unmount();
  });

  it('light up for a hovered table or field, and only theirs', async () => {
    const wrapper = mountCanvas(true);
    await nextTick();
    const lit = () => wrapper.findAll('.dg-dep.is-highlighted').map((e) => e.classes().find((c) => c.startsWith('is-kind-')) ?? 'none').sort();

    await wrapper.find('.dg-table[data-key="input.item"]').trigger('pointerenter');
    expect(lit()).toEqual(['is-kind-value']);
    await wrapper.find('.dg-table[data-key="input.item"]').trigger('pointerleave');

    // The order line's two mappings, of different kinds, light up together for their table.
    await wrapper.find('.dg-table[data-key="spec.order_line"]').trigger('pointerenter');
    expect(lit()).toEqual(['is-kind-row', 'is-kind-value']);
    // Its item_id field, only the row mapping.
    await wrapper.findAll('.dg-table[data-key="spec.order_line"] .dg-field')[0]!.trigger('pointerenter');
    expect(lit()).toEqual(['is-kind-row']);
    wrapper.unmount();
  });

  it('switch back to table pairs when lineage by column is turned off', async () => {
    const wrapper = mountCanvas(true);
    await nextTick();
    expect(wrapper.findAll('.dg-dep')).toHaveLength(4);
    await wrapper.setProps({ lineageColumns: false });
    expect(wrapper.findAll('.dg-dep')).toHaveLength(3);
    expect(wrapper.find('.dg-legend').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('a value and a row mapping between the same two columns', () => {
  const BOTH: Model = {
    ...MODEL,
    deps: [
      ...MODEL.deps!,
      {
        from: {
          table: 'spec.order_line',
          fields: ['quantity'],
        },
        to: {
          table: 'money.line_price',
          fields: ['price'],
        },
        name: 'join',
        kind: 'row',
        note: 'joined on',
      },
    ],
  };

  it('stay two mappings of one column pair, under their own keys, strongest kind first', () => {
    const m = fromModel(BOTH);
    const column = m.deps.find((d) => d.key === PAIR)!.columns.find((c) => c.key === COLUMN_QTY)!;
    expect(column.mappings.map((x) => [x.key, x.kind, x.label])).toEqual([
      [`${COLUMN_QTY}#value`, 'value', 'qty'],
      [`${COLUMN_QTY}#row`, 'row', 'join'],
    ]);
    expect(column.kind).toBe('value');
    expect(column.label).toBe('qty, join');
    expect(m.depsByField.get('spec.order_line.quantity')).toEqual([COLUMN_QTY]);
  });

  it('keep a dep without a kind under the column pair\'s own key, and drop a repeat of the same kind', () => {
    const m = fromModel({
      ...BOTH,
      deps: [
        ...BOTH.deps!,
        {
          from: { table: 'spec.order_line', fields: ['quantity'] },
          to: { table: 'money.line_price', fields: ['price'] },
        },
        {
          from: { table: 'spec.order_line', fields: ['quantity'] },
          to: { table: 'money.line_price', fields: ['price'] },
          kind: 'value',
          name: 'again',
        },
      ],
    });
    const column = m.deps.find((d) => d.key === PAIR)!.columns.find((c) => c.key === COLUMN_QTY)!;
    expect(column.mappings.map((x) => x.key)).toEqual([`${COLUMN_QTY}#value`, `${COLUMN_QTY}#row`, COLUMN_QTY]);
    expect(column.label).toBe('qty, join');
  });

  it('list both kinds in the column pair\'s tooltip, and each one\'s own in the mapping\'s', () => {
    const m = fromModel(BOTH);
    expect(buildTooltipContent(m, {
      kind: 'dep',
      key: COLUMN_QTY,
    })).toEqual({
      kind: 'dep',
      title: 'spec.order_line.quantity',
      target: 'money.line_price.price',
      subtitle: 'qty, join',
      lines: ['kinds: value, row'],
      metadata: [['formula', 'quantity × unit_cost']],
      note: 'an operand\njoined on',
    });
    expect(buildTooltipContent(m, {
      kind: 'dep',
      key: `${COLUMN_QTY}#row`,
    })).toEqual({
      kind: 'dep',
      title: 'spec.order_line.quantity',
      target: 'money.line_price.price',
      subtitle: 'join',
      lines: ['kind: row'],
      note: 'joined on',
    });
    expect(buildTooltipContent(m, {
      kind: 'dep',
      key: PAIR,
    })?.columns).toEqual(['quantity → price (value, row)', 'item_id → price (row)']);
  });

  it('draw as one curve per column pair, styled by the strongest kind', async () => {
    const wrapper = mount(DiagramCanvas, {
      props: {
        model: fromModel(BOTH),
        positions,
        detailLevel: 'all',
        dark: false,
        lineageColumns: true,
      },
      attachTo: document.body,
    });
    await nextTick();
    const curves = wrapper.findAll(`.dg-dep[data-key="${COLUMN_QTY}"]`);
    expect(curves).toHaveLength(1);
    expect(curves[0]!.classes()).toContain('is-kind-value');
    expect(wrapper.findAll('.dg-dep')).toHaveLength(4);
    wrapper.unmount();
  });
});

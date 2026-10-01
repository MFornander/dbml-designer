// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import TableNode from '../components/TableNode.vue';
import DiagramCanvas from '../components/DiagramCanvas.vue';
import { DIAGRAM_CTX } from '../state/context';
import { fromModel } from '../fromModel';
import { createMeasurer } from '../geometry/measure';
import { computeTableSize, recordsBadgeLabel, valueShift } from '../geometry/tableSize';
import { visibleFields } from '../geometry/lod';
import {
  fitText, formatNumber, formatValue, fullValue,
} from '../geometry/values';
import { FONT_VALUE, VALUE_GAP, VALUE_MAX_W } from '../geometry/constants';
import { buildTooltipContent, TOOLTIP_VALUES } from '../state/useTooltip';
import type { Model } from '../model';
import { makeContext } from './testUtils';

const measurer = createMeasurer(null);

/** One table with one record, one with several, one with none. */
const MODEL: Model = {
  tables: [
    {
      schema: 'money',
      name: 'line_price',
      fields: [
        {
          name: 'line_id',
          type: 'text',
          pk: true,
        },
        {
          name: 'price',
          type: 'double',
        },
        {
          name: 'discount',
          type: 'double',
        },
        {
          name: 'note',
          type: 'text',
        },
      ],
      records: [{
        line_id: 'L1',
        price: 60,
        discount: null,
      }],
    },
    {
      schema: 'input',
      name: 'item',
      fields: [
        {
          name: 'item_id',
          type: 'text',
        },
        {
          name: 'unit_cost',
          type: 'double',
        },
      ],
      records: [
        {
          item_id: 'widget',
          unit_cost: 12.5,
        },
        {
          item_id: 'gadget',
          unit_cost: 3.333333333,
        },
        {
          item_id: 'gizmo',
          unit_cost: null,
          extra: true,
        },
      ],
    },
    {
      name: 'plain',
      fields: [{
        name: 'id',
        type: 'int',
      }],
    },
  ],
};

describe('record values', () => {
  it('are formatted for a row: whole numbers as they are, others to six significant digits', () => {
    expect([formatNumber(60), formatNumber(1234567), formatNumber(12.5), formatNumber(1234567.891), formatNumber(0.000123456789)])
      .toEqual(['60', '1234567', '12.5', '1234570', '0.000123457']);
    expect(formatValue(null)).toEqual({
      text: 'null',
      kind: 'null',
    });
    expect(formatValue(true)).toEqual({
      text: 'true',
      kind: 'boolean',
    });
    expect(formatValue('2026-01-02T03:04:05').kind).toBe('string');
    expect(fullValue(1234567.891)).toBe('1234567.891');
  });

  it('are clipped with an ellipsis to fit', () => {
    const long = 'a fairly long string value that will not fit';
    const fitted = fitText(long, 80, measurer, FONT_VALUE);
    expect(fitted.endsWith('…')).toBe(true);
    expect(measurer.measure(fitted, FONT_VALUE)).toBeLessThanOrEqual(80);
    expect(fitText('short', 80, measurer, FONT_VALUE)).toBe('short');
  });

  it('go onto the fields of a table with one record, the fields it names only', () => {
    const m = fromModel(MODEL);
    const price = m.tablesByKey.get('money.line_price')!;
    expect(price.fields.map((f) => f.value)).toEqual(['L1', 60, null, undefined]);
    expect(price.records).toHaveLength(1);
    const item = m.tablesByKey.get('input.item')!;
    expect(item.fields.map((f) => f.value)).toEqual([undefined, undefined]);
    expect(item.records).toHaveLength(3);
    expect(m.tablesByKey.get('public.plain')!.records).toBeUndefined();
  });

  it('widen a table by a value column, or give it a count badge, only while they show', () => {
    const m = fromModel(MODEL);
    const price = m.tablesByKey.get('money.line_price')!;
    const rows = visibleFields(price, 'all');
    const without = computeTableSize(price, rows, measurer);
    const withValues = computeTableSize(price, rows, measurer, [], true);
    expect(without.valueW).toBe(0);
    expect(withValues.valueW).toBeGreaterThan(0);
    expect(withValues.width - without.width).toBe(VALUE_GAP + withValues.valueW);
    expect(withValues.rows.map((r) => r.value)).toEqual([
      {
        text: 'L1',
        kind: 'string',
      },
      {
        text: '60',
        kind: 'number',
      },
      {
        text: 'null',
        kind: 'null',
      },
      undefined,
    ]);
    expect(valueShift(withValues)).toBe(VALUE_GAP + withValues.valueW);

    const item = m.tablesByKey.get('input.item')!;
    const itemSize = computeTableSize(item, visibleFields(item, 'all'), measurer, [], true);
    expect(itemSize.recordsBadge?.label).toBe(recordsBadgeLabel(3));
    expect(itemSize.valueW).toBe(0);
    expect(computeTableSize(item, visibleFields(item, 'all'), measurer).recordsBadge).toBeUndefined();
  });

  it('never widen a table past the cap', () => {
    const m = fromModel({
      tables: [{
        name: 't',
        fields: [{
          name: 'v',
          type: 'text',
        }],
        records: [{ v: 'x'.repeat(400) }],
      }],
    });
    const t = m.tables[0]!;
    const size = computeTableSize(t, t.fields, measurer, [], true);
    expect(size.valueW).toBeLessThanOrEqual(VALUE_MAX_W);
    expect(size.rows[0]!.value!.text.endsWith('…')).toBe(true);
  });

  it('show in a field\'s tooltip, in full, or as the column\'s values for several records', () => {
    const m = fromModel(MODEL);
    expect(buildTooltipContent(m, {
      kind: 'field',
      tableKey: 'money.line_price',
      fieldKey: 'money.line_price.price',
    })?.value).toBe('60');
    expect(buildTooltipContent(m, {
      kind: 'field',
      tableKey: 'input.item',
      fieldKey: 'input.item.unit_cost',
    })?.values).toEqual(['12.5', '3.333333333', 'null']);
    const many = fromModel({
      tables: [{
        name: 't',
        fields: [{
          name: 'n',
          type: 'int',
        }],
        records: Array.from({ length: TOOLTIP_VALUES + 3 }, (_, i) => ({ n: i })),
      }],
    });
    const listed = buildTooltipContent(many, {
      kind: 'field',
      tableKey: 'public.t',
      fieldKey: 'public.t.n',
    })!.values!;
    expect(listed).toHaveLength(TOOLTIP_VALUES + 1);
    expect(listed.at(-1)).toBe('and 3 more');
  });

  it('draw in the row, null dimmed, and the count badge opens the records', async () => {
    const m = fromModel(MODEL);
    const price = m.tablesByKey.get('money.line_price')!;
    const rows = visibleFields(price, 'all');
    const size = computeTableSize(price, rows, measurer, [], true);
    const ctx = makeContext();
    const mountNode = (t: typeof price, s: typeof size) => mount(TableNode, {
      props: {
        table: t,
        box: {
          x: 0,
          y: 0,
          w: s.width,
          h: s.height,
        },
        rows: visibleFields(t, 'all'),
        size: s,
        highlighted: false,
        highlightedFields: new Set<string>(),
        isDragging: false,
      },
      global: { provide: { [DIAGRAM_CTX as symbol]: ctx } },
    });
    const node = mountNode(price, size);
    expect(node.findAll('.dg-field-value').map((v) => v.text())).toEqual(['L1', '60', 'null']);
    expect(node.find('.dg-field-value.is-null').exists()).toBe(true);
    // The type moves left of the value column.
    const type = node.findAll('.dg-field-type')[1]!;
    expect(Number(type.attributes('x'))).toBe(size.width - 10 - valueShift(size));

    const item = m.tablesByKey.get('input.item')!;
    const itemNode = mountNode(item, computeTableSize(item, visibleFields(item, 'all'), measurer, [], true));
    expect(itemNode.find('.dg-field-value').exists()).toBe(false);
    await itemNode.find('.dg-records-badge').trigger('click');
    expect(ctx.recordsOpened).toEqual(['input.item']);
  });

  it('open as a table from the canvas and close on Escape, and hide with their toggle', async () => {
    const positions = {
      'money.line_price': {
        x: 0,
        y: 0,
      },
      'input.item': {
        x: 400,
        y: 0,
      },
      'public.plain': {
        x: 800,
        y: 0,
      },
    };
    const wrapper = mount(DiagramCanvas, {
      props: {
        model: fromModel(MODEL),
        positions,
        detailLevel: 'all',
        dark: false,
      },
      attachTo: document.body,
    });
    await flushPromises();
    await nextTick();
    expect(wrapper.findAll('.dg-field-value')).toHaveLength(3);
    await wrapper.find('.dg-table[data-key="input.item"] .dg-records-badge').trigger('click');
    await nextTick();
    const preview = wrapper.find('.dg-records');
    expect(preview.exists()).toBe(true);
    expect(preview.findAll('th').map((th) => th.text())).toEqual(['item_id', 'unit_cost', 'extra']);
    expect(preview.findAll('tbody tr')).toHaveLength(3);
    expect(preview.findAll('tbody tr')[1]!.findAll('td').map((td) => td.text())).toEqual(['gadget', '3.33333', '']);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(wrapper.find('.dg-records').exists()).toBe(false);

    await wrapper.setProps({ showValues: false });
    expect(wrapper.find('.dg-field-value').exists()).toBe(false);
    expect(wrapper.find('.dg-records-badge').exists()).toBe(false);
    wrapper.unmount();
  });
});

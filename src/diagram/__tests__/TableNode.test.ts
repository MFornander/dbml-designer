// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import TableNode from '@/diagram/components/TableNode.vue';
import { DIAGRAM_CTX } from '@/diagram/state/context';
import { createMeasurer } from '@/diagram/geometry/measure';
import { computeTableSize } from '@/diagram/geometry/tableSize';
import { visibleFields } from '@/diagram/geometry/lod';
import type { DetailLevel } from '@/diagram/types';
import { field, makeContext, table } from './testUtils';

const measurer = createMeasurer(null);

const users = table('public.users', [
  field('public.users', 'id', { pk: true }),
  field('public.users', 'email', { unique: true, note: 'login' }),
  field('public.users', 'name'),
  field('public.users', 'org_id', { hasRef: true, notNull: true }),
], { headerColor: '#1E69FD' });

function mountTable (level: DetailLevel, ctx = makeContext(), highlightedFields = new Set<string>()) {
  const rows = visibleFields(users, level);
  const size = computeTableSize(users, rows, measurer);
  const wrapper = mount(TableNode, {
    props: {
      table: users,
      box: {
        x: 16,
        y: 24,
        w: size.width,
        h: size.height,
      },
      rows,
      size,
      highlighted: false,
      highlightedFields,
      isDragging: false,
    },
    global: {
      provide: {
        [DIAGRAM_CTX as symbol]: ctx,
      },
    },
  });
  return {
    wrapper,
    ctx,
  };
}

describe('TableNode', () => {
  it('renders the header and one row per visible field', () => {
    const { wrapper } = mountTable('all');
    expect(wrapper.find('.dg-table-name').text()).toBe('users');
    expect(wrapper.findAll('.dg-field')).toHaveLength(4);
    expect(wrapper.find('path.dg-table-header').attributes('style')).toContain('#1E69FD');
    expect(wrapper.find('.dg-field.is-pk .dg-field-name').text()).toBe('id');
    expect(wrapper.attributes('transform')).toBe('translate(16 24)');
  });

  it('shows only key rows at the keys level and no rows at the names level', () => {
    expect(mountTable('keys').wrapper.findAll('.dg-field').map((w) => w.find('.dg-field-name').text()))
      .toEqual(['id', 'email', 'org_id']);
    const names = mountTable('names').wrapper;
    expect(names.findAll('.dg-field')).toHaveLength(0);
    expect(names.find('rect.dg-table-header').exists()).toBe(true);
  });

  it('draws icons for keys, links, unique fields, and notes, plus NN badges', () => {
    const { wrapper } = mountTable('all');
    const hrefs = wrapper.findAll('.dg-field use').map((u) => u.attributes('href'));
    expect(hrefs).toEqual(['#dg-icon-key', '#dg-icon-unique', '#dg-icon-note', '#dg-icon-fk']);
    expect(wrapper.findAll('.dg-badge-text').map((t) => t.text())).toEqual(['NN']);
  });

  it('falls back to the group color for the header', () => {
    const rows = users.fields;
    const size = computeTableSize(users, rows, measurer);
    const wrapper = mount(TableNode, {
      props: {
        table: {
          ...users,
          headerColor: null,
          groupColor: '#24BAB1',
        },
        box: {
          x: 0,
          y: 0,
          w: size.width,
          h: size.height,
        },
        rows,
        size,
        highlighted: false,
        highlightedFields: new Set<string>(),
        isDragging: false,
      },
      global: {
        provide: {
          [DIAGRAM_CTX as symbol]: makeContext(),
        },
      },
    });
    expect(wrapper.find('path.dg-table-header').attributes('style')).toContain('#24BAB1');
  });

  it('marks highlighted fields', () => {
    const { wrapper } = mountTable('all', makeContext(), new Set(['public.users.email']));
    const hl = wrapper.findAll('.dg-field.is-highlighted');
    expect(hl).toHaveLength(1);
    expect(hl[0]!.find('.dg-field-name').text()).toBe('email');
  });

  it('replaces text with placeholders at low zoom and drops rows entirely at structure level', async () => {
    const ctx = makeContext('minimal');
    const { wrapper } = mountTable('all', ctx);
    expect(wrapper.findAll('.dg-field-name')).toHaveLength(0);
    expect(wrapper.findAll('.dg-placeholder').length).toBeGreaterThan(0);

    ctx.setLod('structure');
    await nextTick();
    expect(wrapper.findAll('.dg-placeholder')).toHaveLength(0);
    expect(wrapper.findAll('.dg-field-name')).toHaveLength(0);
    expect(wrapper.find('.dg-table-name').exists()).toBe(false);
  });

  it('reports hover and drag through the diagram context', async () => {
    const { wrapper, ctx } = mountTable('all');
    await wrapper.trigger('pointerenter');
    expect(ctx.hovers.at(-1)).toEqual({
      kind: 'table',
      key: 'public.users',
    });
    await wrapper.findAll('.dg-field')[1]!.trigger('pointerenter');
    expect(ctx.hovers.at(-1)).toEqual({
      kind: 'field',
      tableKey: 'public.users',
      fieldKey: 'public.users.email',
    });
    await wrapper.trigger('pointerleave');
    expect(ctx.hovers.at(-1)).toBeNull();
    await wrapper.trigger('pointerdown', { button: 0 });
    expect(ctx.drags).toEqual([{
      kind: 'table',
      key: 'public.users',
    }]);
  });
});

describe('TableNode schema label', () => {
  it('shows the bare name with the schema faded at the right, and nothing for the default schema', () => {
    const orders = table('sales.orders', [field('sales.orders', 'id', { pk: true })], {
      schema: 'sales',
      displayName: 'sales.orders',
    });
    const rows = visibleFields(orders, 'all');
    const size = computeTableSize(orders, rows, measurer);
    expect(size.schemaW).toBeGreaterThan(0);
    expect(size.headerW).toBeGreaterThan(size.nameW + size.schemaW);
    const wrapper = mount(TableNode, {
      props: {
        table: orders,
        box: {
          x: 0,
          y: 0,
          w: size.width,
          h: size.height,
        },
        rows,
        size,
        highlighted: false,
        highlightedFields: new Set<string>(),
        isDragging: false,
      },
      global: {
        provide: {
          [DIAGRAM_CTX as symbol]: makeContext(),
        },
      },
    });
    expect(wrapper.find('.dg-table-name').text()).toBe('orders');
    const schema = wrapper.find('.dg-table-schema');
    expect(schema.text()).toBe('sales');
    // Right-aligned inside the header padding.
    expect(Number(schema.attributes('x'))).toBe(size.width - 10);
    wrapper.unmount();

    const { wrapper: plain } = mountTable('all');
    expect(plain.find('.dg-table-schema').exists()).toBe(false);
    plain.unmount();
  });
});

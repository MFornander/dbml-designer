// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { computed, nextTick } from 'vue';
import TableNode from '@/diagram/components/TableNode.vue';
import { DIAGRAM_CTX } from '@/diagram/state/context';
import { createMeasurer } from '@/diagram/geometry/measure';
import { computeTableSize } from '@/diagram/geometry/tableSize';
import { visibleFields } from '@/diagram/geometry/lod';
import { PAD_X } from '@/diagram/geometry/constants';
import type { DetailLevel, TableVM } from '@/diagram/types';
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

describe('TableNode partial badges', () => {
  const site = table('input.site', [
    field('input.site', 'config_id', { pk: true, hasRef: true, injectedFrom: 'per_config' }),
    field('input.site', 'region', { hasRef: true, injectedFrom: 'per_region' }),
    field('input.site', 'pue'),
  ], {
    schema: 'input',
    displayName: 'input.site',
    headerColor: '#6B7280',
    partialRefs: [
      { partial: 'per_config', refKeys: ['r-config'], keyColumns: ['config_id'] },
      { partial: 'per_region', refKeys: ['r-region'], keyColumns: [] },
    ],
  });
  const BADGES = ['per_config', 'per_region'];

  function mountSite (opts: { t?: TableVM; level?: DetailLevel; badges?: string[]; ctx?: ReturnType<typeof makeContext> } = {}) {
    const t = opts.t ?? site;
    const rows = visibleFields(t, opts.level ?? 'all');
    const size = computeTableSize(t, rows, measurer, opts.badges ?? BADGES);
    const ctx = opts.ctx ?? makeContext();
    const wrapper = mount(TableNode, {
      props: {
        table: t,
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
          [DIAGRAM_CTX as symbol]: ctx,
        },
      },
    });
    return {
      wrapper,
      size,
      ctx,
    };
  }

  it('lays out one badge per partial after the name and widens the header to fit them before the schema', () => {
    const rows = visibleFields(site, 'names');
    const without = computeTableSize(site, rows, measurer);
    const withBadges = computeTableSize(site, rows, measurer, BADGES);
    expect(without.badges).toEqual([]);
    expect(withBadges.badges.map((b) => b.partial)).toEqual(BADGES);
    const [first, second] = withBadges.badges;
    expect(first!.x).toBeGreaterThan(PAD_X + withBadges.nameW);
    expect(second!.x).toBeGreaterThan(first!.x + first!.w);
    expect(withBadges.headerW).toBeGreaterThan(without.headerW + first!.w + second!.w);
    expect(withBadges.width).toBeGreaterThan(without.width);

    const { wrapper, size } = mountSite({ level: 'names' });
    const badges = wrapper.findAll('.dg-partial-badge');
    expect(badges.map((b) => b.text())).toEqual(['~per_config', '~per_region']);
    expect(badges[0]!.attributes('transform')).toBe(`translate(${size.badges[0]!.x} 7)`);
    // They take the header's text color, so they read on any header.
    expect(badges[0]!.attributes('style')).toContain('color: #FFFFFF');
    // The schema stays right-aligned, clear of the last badge.
    expect(Number(wrapper.find('.dg-table-schema').attributes('x'))).toBe(size.width - PAD_X);
    wrapper.unmount();
  });

  it('shows the badges at every detail level, and none when partial refs are drawn as lines', () => {
    for (const level of ['all', 'keys', 'names'] as const) {
      const { wrapper } = mountSite({ level });
      expect(wrapper.findAll('.dg-partial-badge')).toHaveLength(2);
      wrapper.unmount();
    }
    const { wrapper } = mountSite({ badges: [] });
    expect(wrapper.findAll('.dg-partial-badge')).toHaveLength(0);
    wrapper.unmount();
  });

  it('draws dark badges on a light header', () => {
    const { wrapper } = mountSite({ t: { ...site, headerColor: '#F1C40F' } });
    expect(wrapper.find('.dg-partial-badge').attributes('style')).toContain('color: #171C26');
    wrapper.unmount();
  });

  it('reports the badge as the hover target and hands the hover back to the table on leaving it', async () => {
    const { wrapper, ctx } = mountSite();
    await wrapper.trigger('pointerenter');
    const badge = wrapper.findAll('.dg-partial-badge')[1]!;
    await badge.trigger('pointerenter');
    expect(ctx.hovers.at(-1)).toEqual({
      kind: 'partial',
      tableKey: 'input.site',
      partial: 'per_region',
    });
    await badge.trigger('pointerleave');
    expect(ctx.hovers.at(-1)).toEqual({
      kind: 'table',
      key: 'input.site',
    });
  });

  it('lights up a badge while one of its refs is highlighted', () => {
    const base = makeContext();
    const ctx = {
      ...base,
      highlight: computed(() => ({
        ...base.highlight.value,
        refKeys: new Set(['r-region']),
      })),
    };
    const { wrapper } = mountSite({ ctx });
    expect(wrapper.findAll('.dg-partial-badge.is-highlighted').map((b) => b.attributes('data-partial'))).toEqual(['per_region']);
    wrapper.unmount();
  });

  it('hides the badges at low zoom, where the header is a placeholder, and draws no placeholder at full zoom', async () => {
    const ctx = makeContext();
    // In the default schema, which has no schema label.
    const { wrapper } = mountSite({
      t: {
        ...site,
        schema: 'public',
        displayName: 'site',
      },
      ctx,
    });
    expect(wrapper.findAll('.dg-partial-badge')).toHaveLength(2);
    expect(wrapper.findAll('.dg-placeholder')).toHaveLength(0);
    ctx.setLod('minimal');
    await nextTick();
    expect(wrapper.findAll('.dg-partial-badge')).toHaveLength(0);
    expect(wrapper.findAll('.dg-placeholder').length).toBeGreaterThan(0);
    wrapper.unmount();
  });
});

describe('TableNode header text', () => {
  function mountWith (extra: Partial<TableVM>) {
    const t = table('public.t', [field('public.t', 'id', { pk: true })], { note: 'has a note icon', ...extra });
    const rows = visibleFields(t, 'all');
    const size = computeTableSize(t, rows, measurer);
    return mount(TableNode, {
      props: {
        table: t,
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
  }
  const headerText = (w: ReturnType<typeof mountWith>) => (w.element as SVGGElement).style.getPropertyValue('--dg-header-text');

  it('draws the name, schema, and note icon dark on a light header and white on a deep one', () => {
    for (const color of ['#F1C40F', '#E4A62E', '#DE65C3', '#FFFFFF']) {
      const w = mountWith({ headerColor: color });
      expect(headerText(w), color).toBe('#171C26');
      w.unmount();
    }
    const navy = mountWith({ headerColor: '#011B4E' });
    expect(headerText(navy)).toBe('#FFFFFF');
    navy.unmount();
    // A table in a colored group takes its text color from the group's.
    const teal = mountWith({ headerColor: null, groupColor: '#24BAB1' });
    expect(headerText(teal)).toBe('#171C26');
    teal.unmount();
    // A plain header leaves the palette's header text alone.
    const plain = mountWith({ headerColor: null });
    expect(headerText(plain)).toBe('');
    plain.unmount();
  });
});

import { describe, it, expect } from 'vitest';
import { autoLod, visibleFields } from '../geometry/lod';
import {
  BADGE_GAP, BADGE_W, badgesWidth, computeTableSize, fieldBadges, fieldIcons, iconsWidth,
} from '../geometry/tableSize';
import { createMeasurer, estimateWidth } from '../geometry/measure';
import {
  contrastRatio, groupBodyFill, hexToHsl, hslToHex, normalizeHexColor, textColorFor,
} from '../geometry/color';
import {
  FONT_FIELD, FONT_TYPE, ICON_GAP, ICON_SPACING, ICON_W, ROW_H, WIDTH_EXTRA, PAD_X,
} from '../geometry/constants';
import { field, table } from './testUtils';

const T = 'public.t';

describe('visibleFields', () => {
  const t = table(T, [
    field(T, 'id', { pk: true }),
    field(T, 'email', { unique: true }),
    field(T, 'author_id', { hasRef: true }),
    field(T, 'part_b', { compositePk: true }),
    field(T, 'body'),
  ]);

  it('shows all, only keys, or nothing', () => {
    expect(visibleFields(t, 'all')).toHaveLength(5);
    expect(visibleFields(t, 'keys').map((f) => f.name)).toEqual(['id', 'email', 'author_id', 'part_b']);
    expect(visibleFields(t, 'names')).toEqual([]);
  });
});

describe('autoLod', () => {
  it('switches at the zoom thresholds', () => {
    expect(autoLod(0.05)).toBe('structure');
    expect(autoLod(0.1)).toBe('structure');
    expect(autoLod(0.15)).toBe('minimal');
    expect(autoLod(0.4)).toBe('minimal');
    expect(autoLod(0.41)).toBe('full');
    expect(autoLod(1)).toBe('full');
  });
});

describe('fieldIcons and fieldBadges', () => {
  it('orders icons as key, link, unique, note like dbdiagram', () => {
    expect(fieldIcons(field(T, 'a', { pk: true, note: 'n' }))).toEqual(['key', 'note']);
    expect(fieldIcons(field(T, 'b', { hasRef: true, injectedFrom: 'p' }))).toEqual(['fk', 'note']);
    expect(fieldIcons(field(T, 'c', { compositePk: true, hasRef: true }))).toEqual(['key', 'fk']);
    expect(fieldIcons(field(T, 'u', { unique: true, dbdefault: '1' }))).toEqual(['unique', 'note']);
    expect(fieldIcons(field(T, 'd'))).toEqual([]);
  });

  it('adds NN and E badges after the type', () => {
    expect(fieldBadges(field(T, 'a'))).toEqual([]);
    expect(fieldBadges(field(T, 'b', { notNull: true }))).toEqual(['nn']);
    expect(fieldBadges(field(T, 'c', { notNull: true, enumKey: 'enum:public.e' }))).toEqual(['nn', 'enum']);
    expect(badgesWidth(['nn', 'enum'])).toBe(BADGE_W.nn + BADGE_W.enum + 2 * BADGE_GAP);
  });
});

describe('computeTableSize', () => {
  const m = createMeasurer(null);

  it('uses one row per field plus the header', () => {
    const t = table(T, [field(T, 'a'), field(T, 'b'), field(T, 'c')]);
    expect(computeTableSize(t, t.fields, m).height).toBe(ROW_H * 4);
    expect(computeTableSize(t, [], m).height).toBe(ROW_H);
  });

  it('takes the wider of header and widest row plus the extra width', () => {
    const t = table(T, [field(T, 'a_very_long_field_name_indeed', { typeText: 'varchar(255)' })]);
    const size = computeTableSize(t, t.fields, m);
    const rowW = estimateWidth('a_very_long_field_name_indeed', FONT_FIELD) + estimateWidth('varchar(255)', FONT_TYPE) + 2 * PAD_X;
    expect(size.width).toBe(Math.ceil(rowW + WIDTH_EXTRA));
  });

  it('accounts for icon widths', () => {
    expect(iconsWidth(0)).toBe(0);
    expect(iconsWidth(1)).toBe(ICON_W + ICON_GAP);
    expect(iconsWidth(2)).toBe(2 * (ICON_W + ICON_GAP) + ICON_SPACING);
  });
});

describe('measure', () => {
  it('estimates monospace and proportional widths differently and caches results', () => {
    expect(estimateWidth('abcd', '13px Inconsolata, monospace')).toBeCloseTo(4 * 13 * 0.6);
    expect(estimateWidth('abcd', '13px "Open Sans"')).toBeCloseTo(4 * 13 * 0.5);
    const m = createMeasurer(null);
    const a = m.measure('hello', FONT_FIELD);
    expect(m.measure('hello', FONT_FIELD)).toBe(a);
    m.clear();
    expect(m.measure('hello', FONT_FIELD)).toBe(a);
  });
});

describe('color', () => {
  it('normalizes hex colors and rejects none', () => {
    expect(normalizeHexColor('#abc')).toBe('#AABBCC');
    expect(normalizeHexColor('#1e69fd')).toBe('#1E69FD');
    expect(normalizeHexColor('none')).toBeNull();
    expect(normalizeHexColor(undefined)).toBeNull();
  });

  it('round-trips through HSL', () => {
    expect(hslToHex(hexToHsl('#1E69FD'))).toBe('#1E69FD');
    expect(hslToHex(hexToHsl('#FFFFFF'))).toBe('#FFFFFF');
  });

  it('tints group fills toward light or dark backgrounds', () => {
    const light = hexToHsl(groupBodyFill('#24BAB1', false));
    expect(light.l).toBeCloseTo(0.9, 1);
    const dark = hexToHsl(groupBodyFill('#24BAB1', true));
    expect(dark.l).toBeCloseTo(1 / 3, 1);
  });

  it('picks readable text colors, dark wherever it contrasts more than white', () => {
    const DARK = '#171C26';
    const WHITE = '#FFFFFF';
    // Light and mid-tone headers: note paper, white, yellow, orange, pink, teal, light green, lavender.
    for (const bg of ['#FFE28B', '#FFFFFF', '#F1C40F', '#E4A62E', '#DE65C3', '#24BAB1', '#79AD51', '#8F8DD8']) {
      expect(textColorFor(bg), bg).toBe(DARK);
    }
    // Deep ones keep white: navy, the default header blue, blue, red, purple, dark teal, dark green, grey.
    for (const bg of ['#011B4E', '#316896', '#1E69FD', '#CA4242', '#6724BB', '#126E7A', '#2D6512', '#6B7280']) {
      expect(textColorFor(bg), bg).toBe(WHITE);
    }
    expect(contrastRatio(1, 0)).toBe(21);
    expect(contrastRatio(0.5, 0.5)).toBe(1);
  });
});

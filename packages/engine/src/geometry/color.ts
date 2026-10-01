export interface Hsl {
  h: number;
  s: number;
  l: number;
}

/** Table header swatches offered by dbdiagram.io. */
export const HEADER_SWATCHES: readonly string[] = [
  '#1E69FD', '#4B82B0', '#011B4E', '#24BAB1', '#126E7A', '#2D6512', '#79AD51', '#E4A62E',
  '#EB801B', '#8F8DD8', '#990D0D', '#CA4242', '#DE65C3', '#6724BB', '#A15CF5',
];

/** Accepts `#rgb` or `#rrggbb`; returns null for anything else (including DBML's `none`). */
export function normalizeHexColor (value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toUpperCase();
  }
  return null;
}

export function hexToRgb (hex: string): [number, number, number] {
  const n = normalizeHexColor(hex) ?? '#000000';
  return [parseInt(n.slice(1, 3), 16), parseInt(n.slice(3, 5), 16), parseInt(n.slice(5, 7), 16)];
}

export function hexToHsl (hex: string): Hsl {
  const [r8, g8, b8] = hexToRgb(hex);
  const r = r8 / 255;
  const g = g8 / 255;
  const b = b8 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) {
    return {
      h: 0,
      s: 0,
      l,
    };
  }
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return {
    h,
    s,
    l,
  };
}

export function hslToHex ({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r: number;
  let g: number;
  let b: number;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  const to255 = (v: number) => Math.round(Math.min(1, Math.max(0, v + m)) * 255);
  const hex = (v: number) => v.toString(16).padStart(2, '0');
  return `#${hex(to255(r))}${hex(to255(g))}${hex(to255(b))}`.toUpperCase();
}

/** Table-group body fill derived from the group color, matching dbdiagram's tint. */
export function groupBodyFill (hex: string, dark: boolean): string {
  const hsl = hexToHsl(hex);
  if (dark) {
    return hslToHex({
      h: hsl.h,
      s: hsl.s * 0.15,
      l: 1 / 3,
    });
  }
  return hslToHex({
    h: hsl.h,
    s: hsl.s * 0.5,
    l: 0.9,
  });
}

/** Relative luminance per WCAG. */
export function luminance (hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const DARK_TEXT = '#171C26';
const LIGHT_TEXT = '#FFFFFF';
const DARK_TEXT_LUMINANCE = luminance(DARK_TEXT);
const LIGHT_TEXT_LUMINANCE = luminance(LIGHT_TEXT);

/** WCAG contrast ratio of two relative luminances, from 1 to 21. */
export function contrastRatio (a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Dark or light text for the given background: whichever has the higher contrast ratio. That
 * turns to dark text from a luminance of about 0.2, so mid-tone colors such as orange, pink, and
 * teal get dark text, as do yellow and white; deep blues, reds, and purples keep white.
 */
export function textColorFor (bgHex: string): string {
  const bg = luminance(bgHex);
  return contrastRatio(bg, DARK_TEXT_LUMINANCE) > contrastRatio(bg, LIGHT_TEXT_LUMINANCE) ? DARK_TEXT : LIGHT_TEXT;
}

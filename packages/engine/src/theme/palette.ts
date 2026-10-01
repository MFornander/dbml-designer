// Colors chosen to resemble dbdiagram.io. Values only; no code was copied.

export interface Palette {
  bg: string;
  tableBorder: string;
  headerBg: string;
  headerText: string;
  fieldBg: string;
  rowSeparator: string;
  fieldName: string;
  fieldType: string;
  pkField: string;
  iconColor: string;
  badgeBg: string;
  badgeText: string;
  highlightFieldBg: string;
  tableHighlight: string;
  shadow: string;
  refColor: string;
  refHighlight: string;
  depColor: string;
  groupBg: string;
  groupStroke: string;
  groupName: string;
  tooltipBg: string;
  tooltipHeaderBg: string;
  tooltipText: string;
  tooltipLabel: string;
  tooltipMuted: string;
  /** Outer border and section dividers. */
  tooltipBorder: string;
  /** Types, defaults, list items, metadata values (dbdiagram's orange). */
  tooltipAccent: string;
  /** Enum names and values (dbdiagram's blue). */
  tooltipEnum: string;
  tooltipShadow: string;
  /** Text fields inside popovers (the color picker's HEX box). */
  tooltipInputBg: string;
  gridDot: string;
  gridDotOpacity: string;
  placeholder: string;
  notePaper: string;
  noteText: string;
  glowBlur: string;
}

export const LIGHT: Palette = {
  bg: '#FBFBFB',
  tableBorder: '#BBBBBB',
  headerBg: '#316896',
  headerText: '#FFFFFF',
  fieldBg: '#F2F2F2',
  rowSeparator: 'rgba(0, 0, 0, 0.06)',
  fieldName: '#3C3C3C',
  fieldType: '#6A6A6A',
  pkField: '#2C2C2C',
  iconColor: '#7A7A7A',
  badgeBg: '#DEDEDE',
  badgeText: '#3C3C3C',
  highlightFieldBg: '#DEECF3',
  tableHighlight: '#619BCC',
  shadow: 'rgba(0, 0, 0, 0.14)',
  refColor: '#9B9CA4',
  refHighlight: '#475AFF',
  depColor: '#8F8DD8',
  groupBg: '#E7E9ED',
  groupStroke: '#DFDFDF',
  groupName: '#555555',
  tooltipBg: '#FFFFFF',
  tooltipHeaderBg: '#F9FAFB',
  tooltipText: '#111827',
  tooltipLabel: '#374151',
  tooltipMuted: '#6B7280',
  tooltipBorder: 'rgba(0, 0, 0, 0.1)',
  tooltipAccent: '#C2410C',
  tooltipEnum: '#2563EB',
  tooltipShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
  tooltipInputBg: '#F3F4F6',
  gridDot: '#000000',
  gridDotOpacity: '0.16',
  placeholder: 'rgba(200, 200, 200, 0.3)',
  notePaper: '#FFE28B',
  noteText: '#171C26',
  glowBlur: '6px',
};

export const DARK: Palette = {
  ...LIGHT,
  bg: '#44444C',
  tableBorder: '#2A2B31',
  headerBg: '#222222',
  fieldBg: '#37383F',
  rowSeparator: 'rgba(255, 255, 255, 0.05)',
  fieldName: '#C5C5C7',
  fieldType: '#A5A5A7',
  pkField: '#D7D7D9',
  iconColor: '#9A9AA0',
  badgeBg: '#666666',
  badgeText: '#E8E8EA',
  highlightFieldBg: '#4B4C53',
  shadow: 'rgba(0, 0, 0, 0.4)',
  refHighlight: '#3EA8DE',
  depColor: '#A79FE6',
  groupBg: '#515058',
  groupStroke: '#696969',
  groupName: '#FBFBFB',
  tooltipBg: '#303137',
  tooltipHeaderBg: '#3A3C42',
  tooltipText: '#FFFFFF',
  tooltipLabel: '#E5E7EB',
  tooltipMuted: '#9CA3AF',
  tooltipBorder: 'rgba(255, 255, 255, 0.1)',
  tooltipAccent: '#FDBA74',
  tooltipEnum: '#60A5FA',
  tooltipShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
  tooltipInputBg: '#1F2024',
  gridDot: '#FFFFFF',
  gridDotOpacity: '0.12',
  glowBlur: '5px',
};

/** The swatches of dbdiagram's color picker, in its grid order (six per row). */
export const COLOR_SWATCHES: readonly string[] = [
  '#3498DB', '#E74C3C', '#2ECC71', '#F39C12', '#9B59B6', '#1ABC9C',
  '#34495E', '#E67E22', '#95A5A6', '#D35400', '#C0392B', '#16A085',
  '#2C3E50', '#F1C40F', '#27AE60', '#8E44AD', '#2980B9', '#E84393',
];

function kebab (name: string): string {
  return name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/** Palette as `--dg-*` CSS custom properties for the diagram root element. */
export function paletteToCssVars (p: Palette): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) vars[`--dg-${kebab(k)}`] = v;
  return vars;
}

/**
 * Record values as field rows and tooltips show them. Whole numbers read as they are, so an id is
 * never rounded; other numbers are shortened to about six significant digits, with the full value
 * in the tooltip. Null reads `null` and is drawn dimmed; booleans read `true` and `false`.
 */
import type { ModelValue } from '../model';
import type { Measurer } from './measure';

export type ValueKind = 'null' | 'number' | 'boolean' | 'string';

export interface FormattedValue {
  text: string;
  kind: ValueKind;
}

const kindOf = (v: ModelValue): ValueKind => {
  if (v === null) return 'null';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  return 'string';
};

/** A number shortened for a field row. */
export function formatNumber (n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  return String(Number(n.toPrecision(6)));
}

/** A value as a field row shows it. */
export function formatValue (v: ModelValue): FormattedValue {
  const kind = kindOf(v);
  return {
    text: kind === 'number' ? formatNumber(v as number) : String(v),
    kind,
  };
}

/** A value in full, as the tooltip shows it. */
export function fullValue (v: ModelValue): string {
  return String(v);
}

/** The longest start of `text` that fits `maxW` with an ellipsis after it, or the whole text when it fits. */
export function fitText (text: string, maxW: number, m: Measurer, font: string): string {
  if (m.measure(text, font) <= maxW) return text;
  let lo = 0;
  let hi = text.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (m.measure(`${text.slice(0, mid)}…`, font) <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo)}…`;
}

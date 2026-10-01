import type { TokenPosition } from '@dbml/parse';
import type { TokenRange } from '@/types/diagram';

/** Positions from @dbml/parse are already 1-indexed, matching Monaco. The file is kept for imported elements. */
export function toTokenRange (t: TokenPosition | undefined): TokenRange | undefined {
  if (!t) return undefined;
  const file = t.filepath?.absolute;
  return {
    ...(file ? { file } : {}),
    start: {
      line: t.start.line,
      column: t.start.column,
    },
    end: {
      line: t.end.line,
      column: t.end.column,
    },
  };
}

function isPosition (v: unknown): v is { line: number; column: number } {
  return typeof v === 'object' && v !== null
    && typeof (v as { line?: unknown }).line === 'number'
    && typeof (v as { column?: unknown }).column === 'number';
}

/**
 * The DBML text range an element came from: the `source` the DBML adapter gives every element it
 * converts. Undefined for an element from anywhere else.
 */
export function tokenOf (source: unknown): TokenRange | undefined {
  if (typeof source !== 'object' || source === null) return undefined;
  const t = source as Partial<TokenRange>;
  return isPosition(t.start) && isPosition(t.end) ? source as TokenRange : undefined;
}

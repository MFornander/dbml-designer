import type { TokenPosition } from '@dbml/parse';
import type { TokenRange } from '@/types/diagram';

/** Positions from @dbml/parse are already 1-indexed, matching Monaco. */
export function toTokenRange (t: TokenPosition | undefined): TokenRange | undefined {
  if (!t) return undefined;
  return {
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

/**
 * Ref end cardinalities, written the way DBML and UML do: `1`, `*` (one or more), `0..1`, `0..*`,
 * `1..*`, or `m..n`.
 */
export interface Multiplicity {
  min: number;
  max: number | '*';
}

/** An unreadable value comes out as NaN bounds, which count as neither optional nor many. */
export function parseMultiplicity (c: string): Multiplicity {
  if (c === '*') {
    return {
      min: 1,
      max: '*',
    };
  }
  const [min, max] = c.split('..');
  const minNum = Number(min);
  if (max === undefined) {
    return {
      min: minNum,
      max: minNum,
    };
  }
  return {
    min: minNum,
    max: max === '*' ? '*' : Number(max),
  };
}

/** At most one row takes part at this end. */
export function isOneSide (c: string): boolean {
  return parseMultiplicity(c).max === 1;
}

/** Any number of rows take part at this end. */
export function isManySide (c: string): boolean {
  return parseMultiplicity(c).max === '*';
}

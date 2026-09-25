/** Stable identity of a table: `${schemaName ?? 'public'}.${tableName}`. Notes use `note:${name}`. */
export type TableKey = string;

/** Stored placement. `w` and `h` are only used by resizable elements (sticky notes). */
export interface XY {
  x: number;
  y: number;
  w?: number;
  h?: number;
}

export type PositionsMap = Readonly<Record<string, XY>>;

export type DetailLevel = 'all' | 'keys' | 'names';

/** How refs that come from a TablePartial's fields are drawn: one badge per partial in the table header, or as lines. */
export type PartialRefMode = 'badges' | 'lines';

export type ThemeMode = 'light' | 'dark';

/** Source range of an element. Positions are 1-indexed, matching Monaco. */
export interface TokenRange {
  /** Absolute path of the file the token is in, when the parser knows it. */
  file?: string;
  start: {
    line: number;
    column: number;
  };
  end: {
    line: number;
    column: number;
  };
}

export interface PositionChange {
  key: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
}

export interface TableLinkPayload {
  key: TableKey;
  token: TokenRange;
}

/** What the color picker is editing: a table header, a group header, a sticky note, or a relationship line. */
export interface ColorTarget {
  kind: 'table' | 'group' | 'note' | 'ref';
  key: string;
}

/** A color chosen in the picker; the host writes it into the DBML text. */
export interface ColorChangePayload extends ColorTarget {
  /** Normalized `#RRGGBB`. */
  color: string;
}

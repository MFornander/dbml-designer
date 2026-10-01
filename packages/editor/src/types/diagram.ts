/** The editor's own types; what the diagram engine shares is exported from `@/engine`. */

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

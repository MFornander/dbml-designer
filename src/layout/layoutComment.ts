/**
 * The layout travels inside the DBML file. Export appends it as YAML in a multi-line comment at
 * the very end, and Import lifts it back out, leaving a short placeholder comment in its place.
 * DBML ignores comments, so the file stays valid for every DBML tool and one file carries both
 * the schema and its layout.
 */
export const LAYOUT_COMMENT_MARKER = '=== DBML DESIGNER FOOTER ===';

const OPEN = `/* ${LAYOUT_COMMENT_MARKER}`;

/** What Import leaves at the end of the text, and what Export replaces with the layout. */
export const LAYOUT_PLACEHOLDER = [
  OPEN,
  '   Diagram layout in YAML as seen under the Layout tab, used during export and import.',
  '*/',
].join('\n');

export interface SplitLayout {
  /** The text without the trailing layout comment and the blank lines before it. */
  dbml: string;
  /** The YAML inside the comment, or null when there is no comment or only the placeholder. */
  layout: string | null;
  /** A layout comment, placeholder or data, closed the text. */
  hadComment: boolean;
}

/** The layout comment, which only counts when it is the last thing in the text. */
function locate (text: string): { start: number; bodyStart: number; bodyEnd: number } | null {
  const start = text.lastIndexOf(OPEN);
  if (start < 0) return null;
  const close = text.indexOf('*/', start);
  // A marker in the middle of the file is the user's own comment; leave it alone.
  if (close < 0 || text.slice(close + 2).trim() !== '') return null;
  // The marker line may carry more words; the body starts on the next line.
  const newline = text.indexOf('\n', start);
  const bodyStart = newline < 0 || newline > close ? close : newline + 1;
  return {
    start,
    bodyStart,
    bodyEnd: close,
  };
}

/** Layout YAML has a `version` line; the placeholder does not. */
function isLayoutYaml (body: string): boolean {
  return /^\s*version\s*:/m.test(body);
}

export function splitLayoutComment (text: string): SplitLayout {
  const at = locate(text);
  if (!at) {
    return {
      dbml: text,
      layout: null,
      hadComment: false,
    };
  }
  const body = text.slice(at.bodyStart, at.bodyEnd);
  return {
    dbml: text.slice(0, at.start).trimEnd(),
    layout: isLayoutYaml(body) ? body : null,
    hadComment: true,
  };
}

function withTrailingComment (text: string, comment: string): string {
  const head = splitLayoutComment(text).dbml.trimEnd();
  return `${head}${head ? '\n\n' : ''}${comment}\n`;
}

/** The text with a layout comment holding `yaml` at the end, replacing any earlier layout comment. */
export function withLayoutComment (text: string, yaml: string): string {
  // A `*/` inside the YAML would close the comment early; a space keeps the file valid.
  const body = yaml.replace(/\*\//g, '* /');
  return withTrailingComment(text, `${OPEN}\n${body.endsWith('\n') ? body : `${body}\n`}*/`);
}

/** The text with the placeholder comment at the end, replacing any earlier layout comment. */
export function withLayoutPlaceholder (text: string): string {
  return withTrailingComment(text, LAYOUT_PLACEHOLDER);
}

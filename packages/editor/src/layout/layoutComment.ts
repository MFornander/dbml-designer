/**
 * The layout travels inside the DBML file. Export and Save append it as YAML in a multi-line
 * footer comment at the very end; Import and Follow lift it back out and show the text without
 * it. DBML ignores comments, so the file stays valid for every DBML tool and one file carries
 * both the schema and its layout.
 *
 * Footer blocks are removed wherever they sit, so text that grew past an old footer does not
 * accumulate copies; the last block that holds layout YAML is the one that counts.
 */
export const LAYOUT_COMMENT_MARKER = '=== DBML DESIGNER FOOTER ===';

const OPEN = `/* ${LAYOUT_COMMENT_MARKER}`;

/** Every footer block, with the rest of its marker line and the whitespace around it. */
const BLOCK = /[ \t]*\/\* === DBML DESIGNER FOOTER ===[^\n]*(?:\n([\s\S]*?))?\*\/[ \t]*\n?/g;

export interface SplitLayout {
  /** The text without any footer block; untouched when there was none, trailing whitespace trimmed otherwise. */
  dbml: string;
  /** The layout YAML of the last footer that holds any, or null. */
  layout: string | null;
}

/** Layout YAML has a `version` line; an old placeholder comment does not. */
function isLayoutYaml (body: string): boolean {
  return /^\s*version\s*:/m.test(body);
}

export function splitLayoutComment (text: string): SplitLayout {
  let layout: string | null = null;
  let found = false;
  const stripped = text.replace(BLOCK, (_match, body: string | undefined) => {
    found = true;
    if (body !== undefined && isLayoutYaml(body)) layout = body;
    return '';
  });
  return {
    dbml: found ? stripped.replace(/\n{3,}/g, '\n\n').trimEnd() : text,
    layout,
  };
}

/** The text with a footer holding `yaml` at the end, and no other footer block anywhere. */
export function withLayoutComment (text: string, yaml: string): string {
  const head = splitLayoutComment(text).dbml.trimEnd();
  // A `*/` inside the YAML would close the comment early; a space keeps the file valid.
  const body = yaml.replace(/\*\//g, '* /');
  return `${head}${head ? '\n\n' : ''}${OPEN}\n${body.endsWith('\n') ? body : `${body}\n`}*/\n`;
}

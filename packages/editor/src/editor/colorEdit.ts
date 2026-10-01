/**
 * Text surgery behind the diagram's color picker: sets a `headercolor` (tables) or `color`
 * (table groups, sticky notes, relationships) setting in DBML source. The rest of the text is
 * untouched, so each change is a small, undoable edit in the editor.
 */
import { normalizeHex } from '@dbml-designer/engine';

export type ColorSetting = 'headercolor' | 'color';

/** Replace `text[start, end)` with `text`; offsets are in characters. */
export interface TextEdit {
  start: number;
  end: number;
  text: string;
}

/** Character offset of a 1-indexed line and column, as the parser and Monaco report them. */
export function offsetAt (text: string, line: number, column: number): number {
  let offset = 0;
  for (let l = 1; l < line; l++) {
    const nl = text.indexOf('\n', offset);
    if (nl < 0) return text.length;
    offset = nl + 1;
  }
  return Math.min(text.length, offset + column - 1);
}

/** Length of the string literal starting at `i`, or 0 when no quote opens there. */
function stringLength (text: string, i: number): number {
  const q = text[i];
  if (q !== "'" && q !== '"' && q !== '`') return 0;
  if (q === "'" && text.startsWith("'''", i)) {
    const close = text.indexOf("'''", i + 3);
    return close < 0 ? text.length - i : close + 3 - i;
  }
  let j = i + 1;
  while (j < text.length) {
    const ch = text[j];
    if (ch === '\\') {
      j += 2;
      continue;
    }
    if (ch === q) return j + 1 - i;
    // An unterminated single-line literal ends with its line.
    if (ch === '\n') return j - i;
    j++;
  }
  return text.length - i;
}

interface Span {
  start: number;
  end: number;
}

function trimSpan (text: string, s: Span): Span {
  let { start, end } = s;
  while (start < end && /\s/.test(text[start]!)) start++;
  while (end > start && /\s/.test(text[end - 1]!)) end--;
  return {
    start,
    end,
  };
}

/** Attribute spans inside a settings list, split at top-level commas (strings and nesting skipped). */
function splitAttributes (text: string, from: number, to: number): Span[] {
  const out: Span[] = [];
  let depth = 0;
  let start = from;
  let i = from;
  while (i < to) {
    const sl = stringLength(text, i);
    if (sl) {
      i += sl;
      continue;
    }
    const ch = text[i]!;
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
    } else if (ch === ',' && depth === 0) {
      out.push({
        start,
        end: i,
      });
      start = i + 1;
    }
    i++;
  }
  out.push({
    start,
    end: to,
  });
  return out.map((s) => trimSpan(text, s)).filter((s) => s.end > s.start);
}

/** Name of an attribute span (`name: value` or a bare flag), lower-cased. */
function attributeName (text: string, span: Span): string {
  const colon = text.indexOf(':', span.start);
  const nameEnd = colon > 0 && colon < span.end ? colon : span.end;
  return text.slice(span.start, nameEnd).trim().toLowerCase();
}

/**
 * Set `setting` inside the settings list whose brackets sit at `open` and `close`: replace the
 * existing attribute, fill an empty list, or append after the last attribute.
 */
function editSettingsList (text: string, open: number, close: number, setting: string, attr: string): TextEdit {
  for (const span of splitAttributes(text, open + 1, close)) {
    if (attributeName(text, span) === setting) {
      return {
        start: span.start,
        end: span.end,
        text: attr,
      };
    }
  }
  const inner = text.slice(open + 1, close);
  if (inner.trim() === '') {
    return {
      start: open + 1,
      end: close,
      text: attr,
    };
  }
  // Append right after the last attribute, ahead of any trailing whitespace.
  const at = open + 1 + inner.search(/\s*$/);
  return {
    start: at,
    end: at,
    text: `, ${attr}`,
  };
}

/** Index of the `]` closing the list opened at `open`, skipping strings; -1 when unterminated. */
function closingBracket (text: string, open: number, to: number): number {
  let depth = 0;
  let i = open;
  while (i < to) {
    const sl = stringLength(text, i);
    if (sl) {
      i += sl;
      continue;
    }
    const ch = text[i];
    if (ch === '[') depth++;
    else if (ch === ']' && --depth === 0) return i;
    i++;
  }
  return -1;
}

/**
 * The edit that gives the element declared at `declStart` the color `color`. Replaces an existing
 * setting of that name, appends to an existing settings list, or adds a list after the name and
 * alias. Returns null when the position is stale (no element keyword there), the declaration has
 * no body, or the color is not a hex literal.
 */
export function setColorSetting (text: string, declStart: number, setting: ColorSetting, color: string): TextEdit | null {
  const value = normalizeHex(color);
  if (!value) return null;
  if (!/^(table|tablegroup|note)\b/i.test(text.slice(declStart, declStart + 12))) return null;

  // Header: everything up to the body's opening brace, skipping strings and nested brackets.
  let settingsStart = -1;
  let settingsEnd = -1;
  let bodyStart = -1;
  let depth = 0;
  let i = declStart;
  while (i < text.length) {
    const sl = stringLength(text, i);
    if (sl) {
      i += sl;
      continue;
    }
    const ch = text[i]!;
    if (ch === '[') {
      if (depth === 0 && settingsStart < 0) settingsStart = i;
      depth++;
    } else if (ch === ']') {
      depth--;
      if (depth === 0 && settingsStart >= 0 && settingsEnd < 0) settingsEnd = i;
    } else if (ch === '{' && depth === 0) {
      bodyStart = i;
      break;
    }
    i++;
  }
  if (bodyStart < 0) return null;

  const attr = `${setting}: ${value}`;
  if (settingsStart >= 0 && settingsEnd > settingsStart) {
    return editSettingsList(text, settingsStart, settingsEnd, setting, attr);
  }

  // No settings list: add one after the name (and alias), before the body.
  const header = text.slice(declStart, bodyStart);
  const at = declStart + header.search(/\s*$/);
  return {
    start: at,
    end: at,
    text: ` [${attr}]${at === bodyStart ? ' ' : ''}`,
  };
}

/**
 * The edits that color the relationship whose source range is `range`. A standalone `Ref`
 * (short `Ref name: a > b [...]` or block form) gets `color` in its relationship settings, with
 * a list added when there is none. An inline `ref:` column setting cannot carry settings, so it
 * is removed from the column and re-declared at the end of the text as
 * `Ref: <relationship> [color: ...]`, the way dbdiagram rewrites relationships it edits.
 * `relationship` is that declaration's body, for example `users.id < posts.user_id`.
 */
export function setRefColor (
  text: string,
  range: { start: number; end: number },
  color: string,
  relationship: string,
): TextEdit[] | null {
  const value = normalizeHex(color);
  if (!value) return null;
  const attr = `color: ${value}`;
  const slice = text.slice(range.start, range.end);
  // An inline setting is `ref:` followed by the operator; a standalone anonymous `Ref:` names an endpoint.
  const inline = /^ref\s*:\s*(<>|<|>|-)/i.test(slice);

  if (!inline && /^ref\b/i.test(slice)) {
    // Standalone: the first settings list in the statement or block belongs to the relationship.
    let bodyOpen = -1;
    let i = range.start;
    while (i < range.end) {
      const sl = stringLength(text, i);
      if (sl) {
        i += sl;
        continue;
      }
      const ch = text[i];
      if (ch === '[') {
        const close = closingBracket(text, i, range.end);
        if (close < 0) return null;
        return [editSettingsList(text, i, close, 'color', attr)];
      }
      if (ch === '{' && bodyOpen < 0) bodyOpen = i;
      i++;
    }
    if (bodyOpen < 0) {
      const at = range.start + slice.search(/\s*$/);
      return [{
        start: at,
        end: at,
        text: ` [${attr}]`,
      }];
    }
    // Block form without settings: the relationship is the first non-blank line of the body.
    let lineStart = bodyOpen + 1;
    while (lineStart < range.end) {
      const nl = text.indexOf('\n', lineStart);
      const lineEnd = nl < 0 || nl > range.end ? range.end : nl;
      let content = text.slice(lineStart, lineEnd);
      const brace = content.indexOf('}');
      if (brace >= 0) content = content.slice(0, brace);
      const trimmed = content.trim();
      if (trimmed && !trimmed.startsWith('//')) {
        const at = lineStart + content.search(/\s*$/);
        return [{
          start: at,
          end: at,
          text: ` [${attr}]`,
        }];
      }
      lineStart = lineEnd + 1;
    }
    return null;
  }

  if (!inline) return null;
  // Inline: take the attribute out of the column's settings list ...
  const lineStart = text.lastIndexOf('\n', range.start) + 1;
  const open = text.lastIndexOf('[', range.start);
  if (open < lineStart) return null;
  const close = closingBracket(text, open, text.length);
  if (close < 0) return null;
  const spans = splitAttributes(text, open + 1, close);
  const idx = spans.findIndex((s) => s.start <= range.start && range.end <= s.end);
  if (idx < 0) return null;
  let removal: TextEdit;
  if (spans.length === 1) {
    const gap = /\s*$/.exec(text.slice(lineStart, open))?.[0].length ?? 0;
    removal = {
      start: open - gap,
      end: close + 1,
      text: '',
    };
  } else if (idx < spans.length - 1) {
    removal = {
      start: spans[idx]!.start,
      end: spans[idx + 1]!.start,
      text: '',
    };
  } else {
    removal = {
      start: spans[idx - 1]!.end,
      end: spans[idx]!.end,
      text: '',
    };
  }
  // ... and declare it on its own at the end of the file.
  const nl = text.endsWith('\n') || text.length === 0 ? '' : '\n';
  return [removal, {
    start: text.length,
    end: text.length,
    text: `${nl}\nRef: ${relationship} [${attr}]\n`,
  }];
}

/** Apply edits to a string; they must not overlap. */
export function applyTextEdits (text: string, edits: readonly TextEdit[]): string {
  let out = text;
  for (const e of [...edits].sort((p, q) => q.start - p.start)) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  return out;
}

/**
 * Writing `DiagramView` blocks: the text for a view, and the edits that add, replace, or remove
 * one in the DBML source.
 */
import { type NoteVM, type TableVM, DEFAULT_SCHEMA } from '@dbml-designer/engine/core';
import { quoteIdentifier } from './refText';
import type { TextEdit } from './colorEdit';

function tableEntry (t: TableVM): string {
  const name = quoteIdentifier(t.name);
  return t.schema === DEFAULT_SCHEMA ? name : `${quoteIdentifier(t.schema)}.${name}`;
}

/**
 * A `DiagramView` block listing the visible tables and notes. A section is written only when
 * something of its kind is hidden, so a view that hides nothing of a kind keeps following the
 * schema for that kind.
 */
export function diagramViewText (
  name: string,
  visible: { tables: readonly TableVM[]; notes: readonly NoteVM[] },
  totals: { tables: number; notes: number },
): string {
  const lines = [`DiagramView ${quoteIdentifier(name)} {`];
  if (visible.tables.length < totals.tables) {
    lines.push('  tables {', ...visible.tables.map((t) => `    ${tableEntry(t)}`), '  }');
  }
  if (visible.notes.length < totals.notes) {
    lines.push('  notes {', ...visible.notes.map((n) => `    ${quoteIdentifier(n.name)}`), '  }');
  }
  lines.push('}');
  return `${lines.join('\n')}\n`;
}

/** Replace the block at `range`, or append a new one at the end of the text separated by a blank line. */
export function upsertDiagramView (text: string, range: { start: number; end: number } | null, block: string): TextEdit[] {
  if (range) {
    return [{
      start: range.start,
      end: range.end,
      text: block.trimEnd(),
    }];
  }
  const nl = text.endsWith('\n') || text.length === 0 ? '' : '\n';
  return [{
    start: text.length,
    end: text.length,
    text: `${nl}\n${block}`,
  }];
}

/** Remove the block at `range` together with the line break after it and one blank line before it. */
export function deleteDiagramView (text: string, range: { start: number; end: number }): TextEdit[] {
  let { start, end } = range;
  if (text[end] === '\n') end++;
  if (text.slice(start - 2, start) === '\n\n') start--;
  return [{
    start,
    end,
    text: '',
  }];
}

/** Rename the block at `range`: only its name changes, quoted when the new name needs it. */
export function renameDiagramView (text: string, range: { start: number; end: number }, newName: string): TextEdit[] {
  const block = text.slice(range.start, range.end);
  const m = /^(\s*DiagramView\s+)("(?:[^"\\]|\\.)*"|\S+?)(?=\s*\{)/.exec(block);
  if (!m) return [];
  const start = range.start + m[1]!.length;
  return [{
    start,
    end: start + m[2]!.length,
    text: quoteIdentifier(newName),
  }];
}

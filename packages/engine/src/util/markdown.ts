// Adapted from holistics/dbml dbml-playground (src/utils/markdown.ts), Apache-2.0. See NOTICE.
import { marked } from 'marked';
import DOMPurify from 'dompurify';

/** Block-level Markdown for sticky notes: headings, lists, quotes, code, links. */
export function renderNoteMarkdown (source: string): string {
  const raw = marked.parse(source, { gfm: true, breaks: true }) as string;
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'blockquote', 'pre', 'code',
      'strong', 'em', 'del', 's', 'a', 'ul', 'ol', 'li', 'input',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ],
    ALLOWED_ATTR: ['href', 'title', 'type', 'checked', 'disabled'],
  });
}

// Adapted from holistics/dbml dbml-playground (src/utils/markdown.ts), Apache-2.0. See NOTICE.
import { marked } from 'marked';
import DOMPurify from 'dompurify';

/** Inline-only Markdown for diagnostic messages. */
export function renderMarkdown (source: string): string {
  const raw = marked.parse(source) as string;
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: ['code', 'strong', 'em', 'a', 'br', 'ul', 'ol', 'li', 'p'],
    ALLOWED_ATTR: ['href', 'title'],
  });
}

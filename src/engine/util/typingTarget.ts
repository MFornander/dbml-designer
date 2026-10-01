/**
 * Text fields and dropdowns own the keys typed into them, so diagram shortcuts (Space to pan, ⌘Z
 * to take an arrangement back) leave them alone. Monaco's input is a `div[role=textbox]` driven by
 * the EditContext API, neither a textarea nor contentEditable, so it is recognized by its role and
 * its editor ancestor.
 */
export function isTypingTarget (el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    || (el as HTMLElement).isContentEditable
    || el.getAttribute('role') === 'textbox'
    || el.closest('.monaco-editor') !== null;
}

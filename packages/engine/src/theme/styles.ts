import css from './diagram.css?inline';

const ATTRIBUTE = 'data-dbml-designer-engine';

/**
 * Put the diagram's styles in the page, once, before a diagram draws, so a host needs no CSS of its
 * own. The one style element is kept up to date when the styles change, as they do in development.
 */
export function installStyles (): void {
  if (typeof document === 'undefined') return;
  let style = document.head.querySelector<HTMLStyleElement>(`style[${ATTRIBUTE}]`);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute(ATTRIBUTE, '');
    document.head.appendChild(style);
  }
  if (style.textContent !== css) style.textContent = css;
}

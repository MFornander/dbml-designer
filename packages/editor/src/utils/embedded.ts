/**
 * Whether the editor runs in an iframe of another page. Embedded, it is that page's instance: it
 * keeps its state in memory instead of the local storage it would share with the editor opened on
 * its own, follows no file until one is picked, and listens to the page (see `useHostMessages`).
 */
export function isEmbedded (): boolean {
  try {
    return typeof window !== 'undefined' && window.parent !== window;
  } catch {
    return true;
  }
}

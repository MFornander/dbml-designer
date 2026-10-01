/**
 * The engine with Vue and every other dependency bundled in, for hosts written in React or
 * anything else that has no Vue of its own: `mount` a diagram into an element and drive it
 * through the engine it returns. The diagram brings its own styles.
 */
export { mount, type MountOptions, type MountedDiagram } from './mount';
export * from './core';

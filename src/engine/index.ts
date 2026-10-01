/**
 * The diagram engine's public surface. The engine draws a diagram from a model given as plain
 * data (`Model`), keeps its layout and views per instance, and knows nothing of DBML, editors,
 * or files: hosts, the DBML editor among them, convert to its model and save what `snapshot()`
 * returns wherever they like. Everything but the components is also in `core.ts`, which loads
 * without a DOM or a Vue compiler.
 */
export * from './core';
export { default as EngineDiagram } from './components/EngineDiagram.vue';
export { default as DiagramCanvas } from './components/DiagramCanvas.vue';
export { renderNoteMarkdown } from './util/markdown';

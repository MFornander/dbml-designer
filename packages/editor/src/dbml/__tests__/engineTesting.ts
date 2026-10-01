/**
 * DBML input for the engine's tests, many of which describe their diagram in DBML because it reads
 * better than the model it converts to. The engine package maps `#dbml-testing` here in its test
 * configuration only; the engine's own code never sees DBML, and a lint rule keeps it that way.
 */
export { compile } from './testUtils';
export { buildDiagramModel } from '../buildModel';
export { tokenOf } from '../token';
export { default as GRAIN } from './fixtures/partialGrain.dbml?raw';
export { default as PIPELINE } from './fixtures/arrangePipeline.dbml?raw';

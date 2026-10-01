import type { Database } from '@dbml/parse';
import { fromModel, type DiagramModel } from '@dbml-designer/engine/core';
import { toModel } from './toModel';

/**
 * The view model the diagram draws for a parsed database: converted to the engine's model, then
 * indexed by the engine. The conversion's diagnostics come first, then any the engine adds.
 */
export function buildDiagramModel (raw: Database | undefined): DiagramModel {
  const { model, diagnostics } = toModel(raw);
  const vm = fromModel(model);
  vm.diagnostics = [...diagnostics, ...vm.diagnostics];
  return vm;
}

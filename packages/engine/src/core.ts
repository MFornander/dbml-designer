/**
 * The engine without its components: the model, its keys, and the layout and view state, which
 * load anywhere, Node included. Hosts that only build models or work on layouts, such as a command
 * line tool, import this; `index.ts` adds the components that draw an engine.
 */

export {
  createEngine, DEFAULT_DISPLAY,
  type DiagramHandle, type DisplayOptions, type Engine, type EngineOptions, type Input,
} from './engine/engine';

// The model
export type * from './model';
export { fromModel } from './fromModel';
export { MODEL_SCHEMA } from './modelSchema';
export { asModel, checkModel, type ModelProblem } from './checkModel';
export * from './types';
export * from './keys';
export {
  isManySide, isOneSide, parseMultiplicity, type Multiplicity,
} from './multiplicity';

// Layouts and views
export {
  baseLayoutFrom, emptyLayout, isEmptyLayout, minimizeLayout, type LayoutLayer, type LayoutSnapshot,
} from './engine/layers';
export {
  createLayout, emptyLayer, emptyLayoutState, isLayoutState, layerFrom, layoutKeysOfModel, layoutStateFrom,
  type LayerState, type Layout, type LayoutKeys, type LayoutOptions, type LayoutState, type PositionOrigin,
} from './engine/layout';
export {
  createViews, hiddenForView, sameHidden, visibleEntities, type Views, type ViewsOptions,
} from './engine/views';

// Arranging and sizing without a DOM: text is estimated when no canvas can measure it.
export {
  arrangeByGroup, arrangePending,
  type ArrangeInput, type ArrangeOptions, type ArrangeResult, type PendingInput,
} from './geometry/arrange';
export { createMeasurer, type Measurer } from './geometry/measure';
export { computeTableSize, type TableSize } from './geometry/tableSize';
export { visibleFields } from './geometry/lod';
export { buildTooltipContent, type TooltipContent } from './state/useTooltip';

// Helpers hosts share with the engine
export { isValidRails } from './geometry/routing';
export { normalizeHexColor } from './geometry/color';
export {
  LIGHT, DARK, paletteToCssVars, type Palette,
} from './theme/palette';
export { normalizeHex } from './util/hexColor';
export { isTypingTarget } from './util/typingTarget';

/**
 * The engine for hosts that are not Vue apps: draw an engine's diagram into any element and get
 * the engine back. The diagram fills the element, so give it a size.
 */
import { createApp, h } from 'vue';
import EngineDiagram from './components/EngineDiagram.vue';
import { createEngine, type Engine, type EngineOptions } from './engine/engine';
import type {
  ColorChangePayload, DiagramViewport, ElementClickEvent, ElementEvent, PositionChange, TableLinkPayload,
} from './types';

export interface MountOptions extends EngineOptions {
  /** An engine to draw; one is created from the other options when absent. */
  engine?: Engine;
  /** A table was clicked, with the `source` the model gave it. */
  onTableClick?: (payload: TableLinkPayload) => void;
  /** The pointer entered a table, or left every table (null). */
  onTableHover?: (payload: TableLinkPayload | null) => void;
  /** A color was picked for a table, group, note, or ref; the host decides where it goes. */
  onSetColor?: (payload: ColorChangePayload) => void;
  onZoomChange?: (k: number) => void;
  /** The pan or zoom changed. */
  onViewportChange?: (viewport: DiagramViewport) => void;
  /** Any element was clicked; `event.preventDefault()` keeps the engine from pinning and selecting it. */
  onElementClick?: (event: ElementClickEvent) => void;
  /** The pointer moved onto an element, or off every element (null). */
  onElementHover?: (event: ElementEvent | null) => void;
  /** An arrangement was stored in the layout, as one step `undoArrange` can take back. */
  onArrange?: (changes: PositionChange[], resetRoutes: string[]) => void;
}

export interface MountedDiagram {
  engine: Engine;
  /** Take the diagram out of the element; an engine created by `mount` is disposed too. */
  unmount (): void;
}

export function mount (element: Element, options: MountOptions = {}): MountedDiagram {
  const engine = options.engine ?? createEngine(options);
  const app = createApp({
    render: () => h(EngineDiagram, {
      engine,
      onTableClick: options.onTableClick,
      onTableHover: options.onTableHover,
      onSetColor: options.onSetColor,
      onZoomChange: options.onZoomChange,
      onViewportChange: options.onViewportChange,
      onElementClick: options.onElementClick,
      onElementHover: options.onElementHover,
      onArrange: options.onArrange,
    }),
  });
  app.mount(element);
  return {
    engine,
    unmount (): void {
      app.unmount();
      if (!options.engine) engine.dispose();
    },
  };
}

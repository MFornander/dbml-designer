import {
  inject, type ComputedRef, type InjectionKey, type Ref, type ShallowRef,
} from 'vue';
import type { ColorTarget } from '../types';
import type { Viewport } from '../geometry/viewport';
import type { Point } from '../geometry/rect';
import type { AutoLod } from '../types';
import type { HighlightSet, HoverTarget } from './useHover';
import type { Focus } from './focus';
import type { DragTarget } from './useDrag';

export interface DiagramContext {
  viewport: Ref<Viewport>;
  lod: ComputedRef<AutoLod>;
  highlight: ComputedRef<HighlightSet>;
  /** The host's highlight: what is lit, accented, and kept from dimming. */
  focus: ComputedRef<Focus>;
  dark: Ref<boolean>;
  dragging: ShallowRef<DragTarget | null>;
  setHover (target: HoverTarget | null): void;
  clearHover (): void;
  /** An edge was clicked: tell the host, then pin it unless the host asked not to. */
  clickEdge (target: HoverTarget): void;
  beginDrag (e: PointerEvent, target: DragTarget, origin: Point): void;
  toggleGroup (key: string): void;
  /** Whether hovered tables, groups, notes, and selected edges offer the color picker. */
  pickColors: Ref<boolean>;
  /** Open the color picker beside a table header, group header, or sticky note. */
  openColorPicker (target: ColorTarget): void;
  /** Open a table's records as a table beside its header, or close them when they are open. */
  toggleRecords (tableKey: string): void;
}

export const DIAGRAM_CTX: InjectionKey<DiagramContext> = Symbol('diagram-context');

export function useDiagramContext (): DiagramContext {
  const ctx = inject(DIAGRAM_CTX);
  if (!ctx) throw new Error('Diagram components must be rendered inside DiagramCanvas');
  return ctx;
}

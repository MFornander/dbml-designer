import { onBeforeUnmount, shallowRef, type Ref } from 'vue';
import type { Viewport } from '../geometry/viewport';
import { snapPoint, type Point } from '../geometry/rect';

/**
 * What is being dragged. For `note-resize` the "position" that flows through
 * the drag is the note's size; for `group` it is the group box's top-left and
 * the canvas derives a delta for every member; for `selection` it is the
 * grabbed element's position and the delta moves every selected element.
 */
export interface DragTarget {
  kind: 'table' | 'note' | 'note-resize' | 'group' | 'selection';
  key: string;
}

export interface UseDragOptions {
  viewport: Ref<Viewport>;
  /** Called at most once per animation frame with the snapped world position. */
  onMove (target: DragTarget, pos: Point): void;
  /** Called on release. `moved` is false for a plain click. */
  onEnd (target: DragTarget, pos: Point, moved: boolean): void;
}

const CLICK_SLOP_PX = 3;

/**
 * Pointer-driven dragging of diagram elements. Listeners live on `window` so a
 * DOM reorder of the dragged element (moving it to the top layer) cannot end
 * the drag early.
 */
export function useDrag (opts: UseDragOptions) {
  const dragging = shallowRef<DragTarget | null>(null);

  let target: DragTarget | null = null;
  let origin: Point = {
    x: 0,
    y: 0,
  };
  let startScreen: Point = {
    x: 0,
    y: 0,
  };
  let lastScreen: Point = startScreen;
  let lastPos: Point = origin;
  let moved = false;
  let frame: number | null = null;

  function currentPos (): Point {
    const k = opts.viewport.value.k;
    return snapPoint({
      x: origin.x + (lastScreen.x - startScreen.x) / k,
      y: origin.y + (lastScreen.y - startScreen.y) / k,
    });
  }

  function flush (): void {
    frame = null;
    if (!target) return;
    const pos = currentPos();
    if (pos.x !== lastPos.x || pos.y !== lastPos.y) {
      lastPos = pos;
      opts.onMove(target, pos);
    }
  }

  function onPointerMove (e: PointerEvent): void {
    if (!target) return;
    lastScreen = {
      x: e.clientX,
      y: e.clientY,
    };
    if (!moved && Math.hypot(lastScreen.x - startScreen.x, lastScreen.y - startScreen.y) > CLICK_SLOP_PX) {
      moved = true;
    }
    if (moved && frame === null) frame = requestAnimationFrame(flush);
  }

  function detach (): void {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
  }

  function onPointerUp (): void {
    if (!target) return;
    detach();
    const t = target;
    const pos = moved ? currentPos() : origin;
    if (moved && (pos.x !== lastPos.x || pos.y !== lastPos.y)) opts.onMove(t, pos);
    target = null;
    dragging.value = null;
    opts.onEnd(t, pos, moved);
  }

  function begin (e: PointerEvent, t: DragTarget, from: Point): void {
    if (e.button !== 0) return;
    e.preventDefault();
    target = t;
    origin = { ...from };
    lastPos = origin;
    startScreen = {
      x: e.clientX,
      y: e.clientY,
    };
    lastScreen = startScreen;
    moved = false;
    dragging.value = t;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  onBeforeUnmount(detach);

  return {
    dragging,
    begin,
  };
}

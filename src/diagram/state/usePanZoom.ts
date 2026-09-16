import {
  onBeforeUnmount, onMounted, ref, shallowRef, type Ref,
} from 'vue';
import type { Rect, Size } from '../geometry/rect';
import {
  fitToRect, IDENTITY_VIEWPORT, panBy, resetZoom, wheelFactor, zoomAt, type Viewport,
} from '../geometry/viewport';
import { ZOOM_STEP } from '../geometry/constants';

/**
 * Wheel zoom around the cursor, drag-to-pan on the background, and view-size
 * tracking for the diagram container.
 */
export function usePanZoom (container: Ref<HTMLElement | null>) {
  const viewport = shallowRef<Viewport>(IDENTITY_VIEWPORT);
  const viewSize = ref<Size>({
    w: 0,
    h: 0,
  });
  const isPanning = ref(false);

  let observer: ResizeObserver | null = null;

  function measure (): void {
    const el = container.value;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    // Only publish real changes: fitTo() measures first, and a fresh object each time would retrigger watchers.
    if (viewSize.value.w !== w || viewSize.value.h !== h) {
      viewSize.value = {
        w,
        h,
      };
    }
  }

  onMounted(() => {
    measure();
    if (typeof ResizeObserver !== 'undefined' && container.value) {
      observer = new ResizeObserver(measure);
      observer.observe(container.value);
    }
  });

  onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
    stopPan();
  });

  function localPoint (e: { clientX: number; clientY: number }) {
    const el = container.value;
    const rect = el?.getBoundingClientRect();
    return {
      x: e.clientX - (rect?.left ?? 0),
      y: e.clientY - (rect?.top ?? 0),
    };
  }

  function onWheel (e: WheelEvent): void {
    e.preventDefault();
    const factor = wheelFactor(e);
    if (factor === 1) return;
    viewport.value = zoomAt(viewport.value, localPoint(e), factor);
  }

  let panStart = {
    x: 0,
    y: 0,
  };
  let panOrigin: Viewport = IDENTITY_VIEWPORT;

  function onPanMove (e: PointerEvent): void {
    viewport.value = panBy(panOrigin, e.clientX - panStart.x, e.clientY - panStart.y);
  }

  function stopPan (): void {
    if (!isPanning.value) return;
    isPanning.value = false;
    window.removeEventListener('pointermove', onPanMove);
    window.removeEventListener('pointerup', stopPan);
    window.removeEventListener('pointercancel', stopPan);
  }

  function onBackgroundPointerDown (e: PointerEvent): void {
    if (e.button !== 0) return;
    e.preventDefault();
    panStart = {
      x: e.clientX,
      y: e.clientY,
    };
    panOrigin = viewport.value;
    isPanning.value = true;
    window.addEventListener('pointermove', onPanMove);
    window.addEventListener('pointerup', stopPan);
    window.addEventListener('pointercancel', stopPan);
  }

  function fitTo (content: Rect | null, maxK?: number): void {
    // Explicit actions always use the live pane size, even if a resize notification is still pending.
    measure();
    if (!content || viewSize.value.w === 0) return;
    viewport.value = fitToRect(content, viewSize.value, undefined, maxK);
  }

  function reset (content: Rect | null): void {
    measure();
    viewport.value = resetZoom(content, viewSize.value);
  }

  function zoomBy (factor: number): void {
    measure();
    viewport.value = zoomAt(viewport.value, {
      x: viewSize.value.w / 2,
      y: viewSize.value.h / 2,
    }, factor);
  }

  return {
    viewport,
    viewSize,
    isPanning,
    onWheel,
    onBackgroundPointerDown,
    fitTo,
    reset,
    zoomIn: () => zoomBy(ZOOM_STEP ** 4),
    zoomOut: () => zoomBy(1 / ZOOM_STEP ** 4),
    measure,
  };
}

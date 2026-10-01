import {
  computed, onBeforeUnmount, onMounted, ref, watch, type Ref,
} from 'vue';
import { useLayoutStore } from '@/stores/layoutStore';
import { useParserStore } from '@/stores/parserStore';
import { useUiStore } from '@/stores/uiStore';
import { isTypingTarget } from '@/engine';

/** What the diagram canvas offers for arranging. */
export interface ArrangeCanvas {
  /** Lay out what the view shows, or only the tables in `only`, and emit the positions; false when there is nothing to do yet. */
  arrange (only?: ReadonlySet<string>): boolean;
  /** Fit the view to the diagram once positions just stored are in. */
  refit (): void;
}

/** How long the "Arranged … Undo" notice stays up; ⌘Z and the View menu can still take the arrangement back after. */
export const ARRANGE_NOTICE_MS = 8000;

/**
 * Arrange in the diagram pane, which holds the canvas and so the measured table sizes: carries
 * out what the View menu asks for through the layout store, takes the arrangement the engine
 * stored back on ⌘Z / Ctrl+Z unless a text field or an editor has focus, and reports it in a
 * short-lived notice with its own Undo.
 */
export function useArrange (canvas: Readonly<Ref<ArrangeCanvas | null>>) {
  const layout = useLayoutStore();
  const parser = useParserStore();
  const ui = useUiStore();

  const noticeUp = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** Tables the notice reports as arranged; 0 hides it, and so does any change that makes the arrangement stick. */
  const noticeTables = computed(() => (noticeUp.value ? layout.undoableArrangeTables : 0));

  function arrange (onlyNew: boolean): void {
    // Lineage Layout draws derived positions over the stored ones; show the arrangement instead.
    if (ui.lineageLayout) ui.toggleLineageLayout();
    canvas.value?.arrange(onlyNew ? layout.newTables : undefined);
  }

  /** Report an arrangement the engine just stored as one step. */
  function noticeArranged (): void {
    noticeUp.value = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      noticeUp.value = false;
    }, ARRANGE_NOTICE_MS);
  }

  function undo (): void {
    if (layout.undoArrange()) canvas.value?.refit();
  }

  // A request waits while the model is behind the text, which may still be the previous file's.
  watch([() => layout.arrangeRequest, () => parser.isLoading, canvas], ([request, loading]) => {
    if (!request || loading || !canvas.value) return;
    layout.clearArrangeRequest();
    if (request === 'undo') undo();
    else arrange(request === 'arrange-new');
  });

  function onKeyDown (e: KeyboardEvent): void {
    if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return;
    // Text fields and the editors keep their own undo.
    if (e.defaultPrevented || isTypingTarget(document.activeElement) || !layout.canUndoArrange) return;
    e.preventDefault();
    undo();
  }

  onMounted(() => window.addEventListener('keydown', onKeyDown));
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeyDown);
    if (timer) clearTimeout(timer);
  });

  return {
    noticeTables,
    noticeArranged,
    undo,
  };
}

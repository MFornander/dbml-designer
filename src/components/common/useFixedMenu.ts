import {
  onBeforeUnmount, ref, type CSSProperties, type Ref,
} from 'vue';

const GAP_PX = 4;

/**
 * Open/close state and placement for a menu rendered with `position: fixed` next to a trigger.
 * Fixed positioning escapes any scroll clipping of the trigger's container; the menu opens below
 * the trigger, or above it when there is not enough room, and closes on an outside press, Escape,
 * scrolling, or a resize, since any of those can move the trigger.
 */
export function useFixedMenu (root: Ref<HTMLElement | null>, opts: { roomPx: number; align?: 'left' | 'right' }) {
  const open = ref(false);
  const menuStyle = ref<CSSProperties>({});

  function place (): void {
    const trigger = root.value?.querySelector('button');
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    const flipUp = r.bottom + opts.roomPx > window.innerHeight;
    menuStyle.value = {
      ...(opts.align === 'right'
        ? { right: `${Math.round(window.innerWidth - r.right)}px` }
        : { left: `${Math.round(r.left)}px` }),
      ...(flipUp
        ? { bottom: `${Math.round(window.innerHeight - r.top + GAP_PX)}px` }
        : { top: `${Math.round(r.bottom + GAP_PX)}px` }),
    };
  }

  function close (): void {
    if (!open.value) return;
    open.value = false;
    window.removeEventListener('pointerdown', onWindowPointerDown, true);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('scroll', close, true);
    window.removeEventListener('resize', close);
  }

  function toggle (): void {
    if (open.value) {
      close();
      return;
    }
    place();
    open.value = true;
    window.addEventListener('pointerdown', onWindowPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
  }

  function onWindowPointerDown (e: PointerEvent): void {
    if (!root.value?.contains(e.target as Node)) close();
  }

  function onKeyDown (e: KeyboardEvent): void {
    if (e.key === 'Escape') close();
  }

  onBeforeUnmount(close);

  return {
    open,
    menuStyle,
    toggle,
    close,
  };
}

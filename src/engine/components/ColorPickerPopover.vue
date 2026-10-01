<template>
  <div
    ref="el"
    class="dg-color-popover"
    role="dialog"
    :aria-label="title"
    :style="style"
    @pointerdown.stop
    @wheel.stop
  >
    <div class="dg-color-title">
      {{ title }}
    </div>
    <div class="dg-color-grid">
      <button
        v-for="c in COLOR_SWATCHES"
        :key="c"
        type="button"
        class="dg-color-swatch"
        :class="{ 'is-active': isActive(c) }"
        :style="{ background: c }"
        :title="c"
        :aria-label="c"
        @click="pick(c)"
      />
    </div>

    <template v-if="usedColors.length">
      <div class="dg-color-label">
        Currently Used
      </div>
      <div class="dg-color-grid">
        <button
          v-for="c in usedColors"
          :key="c"
          type="button"
          class="dg-color-swatch"
          :class="{ 'is-active': isActive(c) }"
          :style="{ background: c }"
          :title="c"
          :aria-label="c"
          @click="pick(c)"
        />
      </div>
    </template>

    <div class="dg-color-label">
      Custom
    </div>
    <div class="dg-color-custom">
      <label class="dg-color-hex">
        <span>HEX:</span>
        <input
          v-model="hex"
          type="text"
          spellcheck="false"
          maxlength="7"
          aria-label="Hex color"
          @keydown.enter.prevent="commitHex"
          @blur="commitHex"
        >
      </label>
      <label
        class="dg-color-native"
        title="Pick a custom color"
      >
        <PhEyedropper
          :size="18"
          weight="bold"
        />
        <input
          type="color"
          aria-label="Pick a custom color"
          :value="current ?? '#000000'"
          @change="onNative"
        >
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch, type CSSProperties,
} from 'vue';
import { PhEyedropper } from '@phosphor-icons/vue';
import { normalizeHex } from '../util/hexColor';
import type { Rect, Size } from '../geometry/rect';
import { BOX_PLACEMENT, placeTooltip } from '../geometry/tooltipPlacement';
import { COLOR_SWATCHES } from '../theme/palette';

/**
 * dbdiagram's "Header Color" popover: the theme swatches, the colors already used in the
 * diagram, and a custom hex or native color input. Opens beside the element like a tooltip.
 */
const props = defineProps<{
  title: string;
  /** The element's effective color, or null for the palette default. */
  current: string | null;
  /** Distinct colors in use elsewhere in the diagram. */
  usedColors: string[];
  /** Anchor in pane pixels (the element's header). */
  anchor: Rect;
  viewSize: Size;
}>();

const emit = defineEmits<{
  pick: [color: string];
  close: [];
}>();

const hex = ref('');
watch(() => props.current, (c) => {
  hex.value = c ?? '';
}, {
  immediate: true,
});

function isActive (c: string): boolean {
  return !!props.current && props.current.toUpperCase() === c.toUpperCase();
}

function pick (c: string): void {
  emit('pick', c);
}

function commitHex (): void {
  const v = normalizeHex(hex.value);
  if (!v) {
    hex.value = props.current ?? '';
    return;
  }
  hex.value = v;
  if (!isActive(v)) emit('pick', v);
}

function onNative (e: Event): void {
  const v = normalizeHex((e.target as HTMLInputElement).value);
  if (v && !isActive(v)) emit('pick', v);
}

// Placement: the same right-start rule as tooltips, measured once mounted (and when a section appears).
const el = useTemplateRef<HTMLElement>('el');
const measured = ref<Size | null>(null);

async function measure (): Promise<void> {
  await nextTick();
  if (el.value) {
    measured.value = {
      w: el.value.offsetWidth,
      h: el.value.offsetHeight,
    };
  }
}
watch(() => props.usedColors.length, measure);

const style = computed<CSSProperties>(() => {
  const m = measured.value;
  if (!m) {
    return {
      left: '0px',
      top: '0px',
      visibility: 'hidden',
    };
  }
  const p = placeTooltip(props.anchor, m, props.viewSize, BOX_PLACEMENT);
  return {
    left: `${p.x}px`,
    top: `${p.y}px`,
    visibility: 'visible',
  };
});

// Dismissal: a press anywhere outside (except on a gear, which retargets the picker) or Escape.
function onWindowPointerDown (e: PointerEvent): void {
  const t = e.target as Element | null;
  if (!t || el.value?.contains(t) || t.closest?.('.dg-gear')) return;
  emit('close');
}

function onKeyDown (e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close');
}

onMounted(() => {
  void measure();
  window.addEventListener('pointerdown', onWindowPointerDown, true);
  window.addEventListener('keydown', onKeyDown);
});

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onWindowPointerDown, true);
  window.removeEventListener('keydown', onKeyDown);
});
</script>

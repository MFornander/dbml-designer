<template>
  <defs>
    <!-- Dot grid in screen space: the tile size follows the zoom so dots stay on the 8px world grid. -->
    <pattern
      id="dg-grid"
      patternUnits="userSpaceOnUse"
      :width="tile"
      :height="tile"
      :x="originX"
      :y="originY"
    >
      <circle
        class="dg-grid-dot"
        :cx="tile / 2"
        :cy="tile / 2"
        r="0.8"
      />
    </pattern>

    <!-- Primary key -->
    <symbol
      id="dg-icon-key"
      viewBox="0 0 12 12"
    >
      <circle
        cx="4"
        cy="8"
        r="2.4"
      />
      <path d="M5.7 6.3 L10.6 1.4 M8.6 3.4 L10 4.8" />
    </symbol>

    <!-- Takes part in a relationship -->
    <symbol
      id="dg-icon-fk"
      viewBox="0 0 12 12"
    >
      <path d="M5 7.2 L7 5.2 M4.2 8 a1.9 1.9 0 0 1 0 -2.7 l1.3 -1.3 a1.9 1.9 0 0 1 2.7 2.7 L7.5 7.4 M7.8 4 a1.9 1.9 0 0 1 0 2.7 L6.5 8 a1.9 1.9 0 0 1 -2.7 -2.7 L4.5 4.6" />
    </symbol>

    <!-- Unique -->
    <symbol
      id="dg-icon-unique"
      viewBox="0 0 12 12"
    >
      <circle
        cx="6"
        cy="6"
        r="4.2"
      />
      <path d="M3.2 8.8 L8.8 3.2" />
    </symbol>

    <!-- Has a note or other tooltip details -->
    <symbol
      id="dg-icon-note"
      viewBox="0 0 12 12"
    >
      <path d="M2.5 1.5 H7.5 L10 4 V10.5 H2.5 Z M7.5 1.5 V4 H10 M4.5 6.5 H8 M4.5 8.5 H8" />
    </symbol>
  </defs>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { GRID } from '../geometry/constants';
import type { Viewport } from '../geometry/viewport';

const props = defineProps<{
  viewport: Viewport;
}>();

function mod (a: number, n: number): number {
  return ((a % n) + n) % n;
}

// Double the world pitch until the screen pitch is at least 8px to avoid moiré when zoomed out.
const pitch = computed(() => {
  let p = GRID;
  while (p * props.viewport.k < GRID) p *= 2;
  return p;
});

const tile = computed(() => pitch.value * props.viewport.k);
const originX = computed(() => mod(props.viewport.x + tile.value / 2, tile.value));
const originY = computed(() => mod(props.viewport.y + tile.value / 2, tile.value));
</script>

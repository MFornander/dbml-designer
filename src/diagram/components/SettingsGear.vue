<template>
  <g
    class="dg-gear"
    :transform="`translate(${x} ${y})`"
    role="button"
    aria-label="Change color"
    @pointerdown.stop
    @click.stop="emit('click')"
  >
    <rect
      class="dg-gear-hit"
      x="-3"
      y="-3"
      :width="size + 6"
      :height="size + 6"
      rx="4"
    />
    <PhGear
      class="dg-gear-icon"
      :size="size"
      weight="fill"
      :color="color"
    />
  </g>
</template>

<script setup lang="ts">
import { PhGear } from '@phosphor-icons/vue';
import { GEAR_SIZE } from '../geometry/constants';

/** The small gear that appears on a hovered table, group, or note and opens the color picker. */
withDefaults(defineProps<{
  x: number;
  y: number;
  size?: number;
  /** Icon color, chosen to read against the header or paper behind it. */
  color?: string;
}>(), {
  size: GEAR_SIZE,
  color: '#FFFFFF',
});

const emit = defineEmits<{ click: [] }>();
</script>

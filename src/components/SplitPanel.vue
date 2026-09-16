<!-- Adapted from holistics/dbml dbml-playground (src/components/SplitPanel.vue), Apache-2.0. See NOTICE. -->
<template>
  <div
    ref="containerRef"
    class="grid h-full"
    :style="{ gridTemplateColumns }"
  >
    <template
      v-for="(_, index) in panelSizes"
      :key="index"
    >
      <div
        v-if="index > 0"
        class="relative w-1 select-none bg-gray-200 transition-colors dark:bg-gray-800"
        :class="index === 1 && collapsed ? '' : 'cursor-col-resize hover:bg-blue-400 dark:hover:bg-blue-500'"
        @mousedown="startResize(index - 1, $event)"
      >
        <!-- Chevrons on the first handle: hide the editor, or show / widen it -->
        <div
          v-if="index === 1 && collapsible"
          class="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded border border-gray-300 bg-white shadow dark:border-gray-600 dark:bg-[#2d2f35]"
          @mousedown.stop
        >
          <button
            type="button"
            :class="[CHEVRON, collapsed ? 'opacity-40' : '']"
            :disabled="collapsed"
            title="Hide editor"
            aria-label="Hide editor"
            @click="collapsed = true"
          >
            <PhCaretLeft class="w-3 h-3" />
          </button>
          <button
            type="button"
            :class="CHEVRON"
            :title="collapsed ? 'Show editor' : 'Expand editor'"
            :aria-label="collapsed ? 'Show editor' : 'Expand editor'"
            @click="expandFirst"
          >
            <PhCaretRight class="w-3 h-3" />
          </button>
        </div>
      </div>
      <div class="overflow-hidden min-w-0 min-h-0">
        <slot :name="`panel-${index}`" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { PhCaretLeft, PhCaretRight } from '@phosphor-icons/vue';

// Resizable set of panes laid out with CSS grid; sizes are fr units.

const HANDLE_PX = 4;
/** How much of the total width one press of "Expand editor" adds to the first pane. */
const EXPAND_STEP = 0.15;
const CHEVRON = 'flex h-5 w-4 items-center justify-center text-gray-600 hover:bg-gray-100 hover:text-gray-900 cursor-pointer disabled:cursor-default disabled:hover:bg-transparent dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white';

const {
  minSize = 20,
  collapsible = false,
} = defineProps<{
  minSize?: number;
  /** Show the hide / expand chevrons on the first handle and allow collapsing the first pane. */
  collapsible?: boolean;
}>();

const sizes = defineModel<number[]>({
  required: true,
});

/** The first pane is collapsed to nothing (its size is remembered for when it comes back). */
const collapsed = defineModel<boolean>('collapsed', {
  default: false,
});

const containerRef = ref<HTMLElement | null>(null);
const panelSizes = ref([...sizes.value]);

const gridTemplateColumns = computed(() => {
  const cols = panelSizes.value.map((s, i) => (i === 0 && collapsed.value ? '0px' : `${s}fr`));
  return cols.join(` ${HANDLE_PX}px `);
});

function expandFirst () {
  if (collapsed.value) {
    collapsed.value = false;
    return;
  }
  if (panelSizes.value.length < 2) return;
  const total = panelSizes.value.reduce((a, b) => a + b, 0);
  const first = Math.min(total - minSize, panelSizes.value[0]! + total * EXPAND_STEP);
  const rest = total - first;
  const restBefore = total - panelSizes.value[0]!;
  // Give the remaining panes their share of what is left, keeping their proportions.
  const next = panelSizes.value.map((s, i) => (i === 0 ? first : (restBefore > 0 ? (s / restBefore) * rest : rest / (panelSizes.value.length - 1))));
  panelSizes.value = next;
  sizes.value = [...next];
}

function startResize (splitterIndex: number, e: MouseEvent) {
  if (splitterIndex === 0 && collapsed.value) return;
  e.preventDefault();

  const startX = e.clientX;
  const startSizes = [...panelSizes.value];
  const totalFr = startSizes.reduce((a, b) => a + b, 0);

  const container = containerRef.value;
  if (!container) return;
  const containerWidth = container.getBoundingClientRect().width;
  const gapCount = startSizes.length - 1;
  const totalGapPx = gapCount * HANDLE_PX;
  const availablePx = containerWidth - totalGapPx;

  const leftIndex = splitterIndex;
  const rightIndex = splitterIndex + 1;
  const pairFr = startSizes[leftIndex]! + startSizes[rightIndex]!;
  const pairPx = (pairFr / totalFr) * availablePx;

  const onMove = (ev: MouseEvent) => {
    const diffX = ev.clientX - startX;
    const diffFr = (diffX / pairPx) * pairFr;
    const newLeft = Math.min(pairFr - minSize, Math.max(minSize, startSizes[leftIndex]! + diffFr));
    const newSizes = [...startSizes];
    newSizes[leftIndex] = newLeft;
    newSizes[rightIndex] = pairFr - newLeft;
    panelSizes.value = newSizes;
  };

  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    sizes.value = [...panelSizes.value];
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}
</script>

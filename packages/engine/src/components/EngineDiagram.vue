<template>
  <DiagramCanvas
    ref="canvas"
    :model="diagram"
    :positions="positions"
    :detail-level="display.detailLevel"
    :dark="display.dark"
    :collapsed-groups="collapsedGroups"
    :show-refs="display.showRefs"
    :show-lineage="display.showLineage"
    :lineage-columns="display.lineageColumns"
    :partial-ref-mode="display.partialRefMode"
    :show-values="display.showValues"
    :pick-colors="display.pickColors"
    :lineage-layout="display.lineageLayout"
    :highlight-all="display.highlightAll"
    :reveal-added="display.revealAdded"
    :highlighted="engine.highlighted.value"
    :tooltip-filter="tooltipFilter"
    :edge-routes="edgeRoutes"
    :hidden="hidden"
    :loading="loading"
    :marked="engine.marked.value"
    @position-change="(changes, origin) => engine.layout.applyPositionChanges(changes, origin)"
    @edge-route-change="(key, rails) => engine.layout.setEdgeRoute(key, rails)"
    @toggle-group="(key) => engine.layout.toggleGroup(key)"
    @arrange="onArrange"
    @table-click="emit('table-click', $event)"
    @table-hover="emit('table-hover', $event)"
    @set-color="emit('set-color', $event)"
    @zoom-change="emit('zoom-change', $event)"
    @viewport-change="emit('viewport-change', $event)"
    @element-click="emit('element-click', $event)"
    @element-hover="emit('element-hover', $event)"
  />
</template>

<script setup lang="ts">
/**
 * The diagram of one engine: a canvas drawing the engine's model, layout, active view, and
 * display options. Drags, folds, hand-drawn routes, and arrangements go into the engine's layout;
 * clicks, hovers, colors, and zoom are passed on to the host.
 */
import {
  computed, onBeforeUnmount, onMounted, useTemplateRef,
} from 'vue';
import type {
  ColorChangePayload, DiagramViewport, ElementClickEvent, ElementEvent, PositionChange, TableLinkPayload,
} from '../types';
import DiagramCanvas from './DiagramCanvas.vue';
import type { HoverTarget } from '../state/useHover';
import type { DiagramHandle, Engine } from '../engine/engine';

const props = defineProps<{
  engine: Engine;
  /** Whether the engine shows its tooltip for a hovered element; false leaves the element to the host's own popover. */
  tooltipFilter?: (target: HoverTarget) => boolean;
}>();
const emit = defineEmits<{
  'table-click': [payload: TableLinkPayload];
  'table-hover': [payload: TableLinkPayload | null];
  /** A color was chosen in the picker; the host decides where it is written. */
  'set-color': [payload: ColorChangePayload];
  'zoom-change': [k: number];
  /** The pan or zoom changed. */
  'viewport-change': [viewport: DiagramViewport];
  /** Any element was clicked; `preventDefault()` keeps the engine from pinning and selecting it. */
  'element-click': [event: ElementClickEvent];
  /** The pointer moved onto an element, or off every element (null). */
  'element-hover': [event: ElementEvent | null];
  /** An arrangement was stored in the layout, as one step `undoArrange` can take back. */
  'arrange': [changes: PositionChange[], resetRoutes: string[]];
}>();

const canvas = useTemplateRef<InstanceType<typeof DiagramCanvas>>('canvas');

const diagram = computed(() => props.engine.diagram.value);
const display = computed(() => props.engine.display.value);
const positions = computed(() => props.engine.layout.positions.value);
const collapsedGroups = computed(() => props.engine.layout.collapsedGroups.value);
const edgeRoutes = computed(() => props.engine.layout.edgeRoutes.value);
const hidden = computed(() => props.engine.views.hidden.value);
const loading = computed(() => props.engine.loading.value);

function onArrange (changes: PositionChange[], resetRoutes: string[]): void {
  props.engine.layout.applyArrangement(changes, resetRoutes);
  emit('arrange', changes, resetRoutes);
}

const handle: DiagramHandle = {
  fitToScreen: () => canvas.value?.fitToScreen(),
  fit: (keys) => canvas.value?.fit(keys),
  rectOf: (key) => canvas.value?.rectOf(key) ?? null,
  viewport: () => canvas.value?.viewport ?? null,
  setViewport: (v) => canvas.value?.setViewport(v),
  resetZoom: () => canvas.value?.resetZoom(),
  zoomIn: () => canvas.value?.zoomIn(),
  zoomOut: () => canvas.value?.zoomOut(),
  arrange: (only) => canvas.value?.arrange(only) ?? false,
  refit: () => canvas.value?.refit(),
  element: (key) => canvas.value?.element(key) ?? null,
};

onMounted(() => props.engine.attach(handle));
onBeforeUnmount(() => props.engine.attach(null));

defineExpose(handle);
</script>

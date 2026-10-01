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
    :partial-ref-mode="display.partialRefMode"
    :lineage-layout="display.lineageLayout"
    :highlight-all="display.highlightAll"
    :edge-routes="edgeRoutes"
    :hidden="hidden"
    :loading="loading"
    @position-change="(changes, origin) => engine.layout.applyPositionChanges(changes, origin)"
    @edge-route-change="(key, rails) => engine.layout.setEdgeRoute(key, rails)"
    @toggle-group="(key) => engine.layout.toggleGroup(key)"
    @arrange="onArrange"
    @table-click="emit('table-click', $event)"
    @table-hover="emit('table-hover', $event)"
    @set-color="emit('set-color', $event)"
    @zoom-change="emit('zoom-change', $event)"
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
import type { ColorChangePayload, PositionChange, TableLinkPayload } from '@/types/diagram';
import DiagramCanvas from './DiagramCanvas.vue';
import type { DiagramHandle, Engine } from '../engine/engine';

const props = defineProps<{ engine: Engine }>();
const emit = defineEmits<{
  'table-click': [payload: TableLinkPayload];
  'table-hover': [payload: TableLinkPayload | null];
  /** A color was chosen in the picker; the host decides where it is written. */
  'set-color': [payload: ColorChangePayload];
  'zoom-change': [k: number];
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
  resetZoom: () => canvas.value?.resetZoom(),
  zoomIn: () => canvas.value?.zoomIn(),
  zoomOut: () => canvas.value?.zoomOut(),
  arrange: (only) => canvas.value?.arrange(only) ?? false,
  refit: () => canvas.value?.refit(),
};

onMounted(() => props.engine.attach(handle));
onBeforeUnmount(() => props.engine.attach(null));

defineExpose(handle);
</script>

<template>
  <g
    class="dg-ref"
    :class="{ 'is-highlighted': highlighted, 'is-inactive': inactive, 'dg-dep': kind === 'dep', 'is-colored': !!lineColor }"
    :data-key="edge.key"
    :style="colorVars"
  >
    <path
      v-if="!passive"
      class="dg-ref-hit"
      :d="geo.dFull"
      @pointerenter="onEnter"
      @pointerleave="onLeave"
      @click="onClick"
    />
    <path
      class="dg-ref-line"
      :d="geo.dTrimmed"
    />
    <path
      v-if="highlighted && animated"
      class="dg-ref-overlay"
      :d="geo.dTrimmed"
    />
    <g
      v-if="geo.markerA.d"
      class="dg-ref-marker"
      :transform="markerTransform(geo.a)"
    >
      <path :d="geo.markerA.d" />
    </g>
    <g
      v-if="geo.markerB.d"
      class="dg-ref-marker"
      :transform="markerTransform(geo.b)"
    >
      <path :d="geo.markerB.d" />
    </g>
    <text
      v-if="highlighted && label"
      class="dg-edge-label"
      :x="geo.mid.x"
      :y="geo.mid.y - 8"
      text-anchor="middle"
    >{{ label }}</text>
    <template v-if="highlighted && kind === 'ref'">
      <text
        class="dg-edge-cardinality"
        :x="cardinalityX(geo.a, geo.markerA.lineShorten)"
        :y="geo.a.y - 5"
        :text-anchor="geo.a.side === 'right' ? 'start' : 'end'"
      >{{ (edge as RefVM).endpoints[0].cardinality }}</text>
      <text
        class="dg-edge-cardinality"
        :x="cardinalityX(geo.b, geo.markerB.lineShorten)"
        :y="geo.b.y - 5"
        :text-anchor="geo.b.side === 'right' ? 'start' : 'end'"
      >{{ (edge as RefVM).endpoints[1].cardinality }}</text>
    </template>
  </g>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { DepLineVM, RefVM } from '../types';
import type { AnchorPoint } from '../geometry/anchors';
import type { RefGeometry } from '../state/useDiagramGeometry';
import { useDiagramContext } from '../state/context';

const props = withDefaults(defineProps<{
  edge: RefVM | DepLineVM;
  kind: 'ref' | 'dep';
  geo: RefGeometry;
  highlighted: boolean;
  /** Mount the walking-ants overlay while highlighted. */
  animated?: boolean;
  /** Drawn for something else's hover (a partial badge), so it takes no hover or click of its own. */
  passive?: boolean;
}>(), {
  animated: true,
  passive: false,
});

const ctx = useDiagramContext();

/** Explicit or inherited color; null means the palette default for this edge kind. */
const lineColor = computed<string | null>(() => (props.kind === 'ref'
  ? (props.edge as RefVM).lineColor
  : (props.edge as DepLineVM).color));

// Colored edges keep their color when highlighted; default-colored ones switch to the highlight color.
const colorVars = computed(() => (lineColor.value
  ? {
      '--dg-edge-color': lineColor.value,
      '--dg-edge-hl': lineColor.value,
    }
  : undefined));

const inactive = computed(() => props.kind === 'ref' && (props.edge as RefVM).inactive);
const label = computed(() => (props.kind === 'ref' ? (props.edge as RefVM).name : (props.edge as DepLineVM).label));

// Marker paths are drawn with the line running toward +x; mirror them for left-side anchors.
function markerTransform (a: AnchorPoint): string {
  return `translate(${a.x} ${a.y}) scale(${a.side === 'right' ? 1 : -1} 1)`;
}

/** Cardinality text sits just past the end marker, above the line. */
function cardinalityX (a: AnchorPoint, shorten: number): number {
  return a.x + (a.side === 'right' ? 1 : -1) * (shorten + 4);
}

function target () {
  return {
    kind: props.kind,
    key: props.edge.key,
  } as const;
}

function onEnter () {
  ctx.setHover(target());
}

function onLeave () {
  ctx.clearHover();
}

function onClick () {
  ctx.togglePin(target());
}
</script>

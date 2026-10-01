<template>
  <g
    class="dg-edge-controls"
    :data-key="edge.key"
    :style="{ '--dg-ctl-color': edge.lineColor ?? 'var(--dg-ref-highlight)' }"
  >
    <!-- Hovering the stretch between a corner and a control point reveals a mid-point that becomes a new bend when dragged -->
    <line
      v-for="h in halves"
      :key="h.id"
      class="dg-edge-half"
      :data-half="h.id"
      :x1="h.x1"
      :y1="h.y1"
      :x2="h.x2"
      :y2="h.y2"
      :style="{ strokeWidth: `${16 / k}px` }"
      @pointerenter="showSplit(h.segment, h.at)"
      @pointerleave="hideSplitSoon"
    />
    <circle
      v-for="(p, i) in [geo.a, geo.b]"
      :key="`anchor-${i}`"
      class="dg-edge-anchor"
      :cx="p.x"
      :cy="p.y"
      :r="3.5 / k"
      :style="{ strokeWidth: `${1.5 / k}px` }"
    />
    <!-- Control points: one on every movable segment, and one on each end stub that bends it into a new segment -->
    <circle
      v-for="h in handles"
      :key="h.id"
      class="dg-edge-handle"
      :class="{ 'is-stub': h.kind === 'stub' }"
      :cx="h.x"
      :cy="h.y"
      :r="5 / k"
      :style="{ cursor: h.cursor, strokeWidth: `${1.5 / k}px` }"
      @pointerdown="onHandleDown($event, h)"
    />
    <circle
      v-if="splitHandle"
      class="dg-edge-split"
      :cx="splitHandle.x"
      :cy="splitHandle.y"
      :r="3.5 / k"
      :style="{ cursor: splitHandle.cursor, strokeWidth: `${1.5 / k}px` }"
      @pointerenter="showSplit(splitHandle.segment!, splitHandle.at!)"
      @pointerleave="hideSplitSoon"
      @pointerdown="onHandleDown($event, splitHandle)"
    />
    <!-- Tools sit above the middle of the route at a constant screen size -->
    <g
      class="dg-edge-tools"
      :transform="`translate(${geo.mid.x} ${geo.mid.y}) scale(${1 / k})`"
    >
      <g
        v-if="ctx.pickColors.value"
        class="dg-edge-tool"
        :transform="`translate(${customized ? -24 : -11} -36)`"
        role="button"
        aria-label="Relationship color"
        @pointerdown.stop
        @click.stop="emit('open-color')"
      >
        <rect
          class="dg-edge-tool-bg"
          width="22"
          height="22"
          rx="5"
        />
        <PhGear
          x="3"
          y="3"
          :size="16"
          weight="fill"
          :color="iconColor"
        />
      </g>
      <g
        v-if="customized"
        class="dg-edge-tool"
        :transform="`translate(${ctx.pickColors.value ? 2 : -11} -36)`"
        role="button"
        aria-label="Reset route"
        @pointerdown.stop
        @click.stop="emit('rails-change', null, true)"
      >
        <rect
          class="dg-edge-tool-bg"
          width="22"
          height="22"
          rx="5"
        />
        <PhArrowCounterClockwise
          x="3"
          y="3"
          :size="16"
          weight="bold"
          :color="iconColor"
        />
      </g>
    </g>
  </g>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { PhArrowCounterClockwise, PhGear } from '@phosphor-icons/vue';
import type { RefVM } from '../types';
import { STUB } from '../geometry/constants';
import { snap8 } from '../geometry/rect';
import { autoRailX, routeWithRails, simplifyRails } from '../geometry/routing';
import type { RefGeometry } from '../state/useDiagramGeometry';
import { useDiagramContext } from '../state/context';

/**
 * Selection controls of a relationship: anchor dots, draggable control points that move the
 * route's segments, a mid-point on the hovered stretch between a corner and a control point
 * that becomes a new bend when dragged, a gear that opens the color picker, and, once the route
 * is hand-drawn, a reset button. Dragging emits live rails while the pointer moves and a
 * simplified set (or null for "back to automatic") on release.
 */
const props = defineProps<{
  edge: RefVM;
  geo: RefGeometry;
  /** The route is hand-drawn (a stored override exists). */
  customized: boolean;
}>();

const emit = defineEmits<{
  'rails-change': [rails: number[] | null, commit: boolean];
  'open-color': [];
}>();

const ctx = useDiagramContext();
const k = computed(() => ctx.viewport.value.k);
const iconColor = computed(() => (ctx.dark.value ? '#FFFFFF' : '#111827'));

interface Handle {
  id: string;
  kind: 'rail' | 'stub' | 'split';
  /** Rail index for rails; -1 for the stub at `a`, rails.length for the stub at `b`. */
  index: number;
  x: number;
  y: number;
  cursor: string;
  /** Splits: the segment (index into the route's segments), which half of it, and where along it the bend goes. */
  segment?: number;
  at?: 'before' | 'after';
  coord?: number;
}

const rails = computed<number[]>(() => props.geo.rails ?? [autoRailX(props.geo.a, props.geo.b)]);

const handles = computed<Handle[]>(() => {
  const pts = routeWithRails(props.geo.a, props.geo.b, rails.value);
  const mid = (i: number) => ({
    x: (pts[i]!.x + pts[i + 1]!.x) / 2,
    y: (pts[i]!.y + pts[i + 1]!.y) / 2,
  });
  const out: Handle[] = [{
    id: 'stub-a',
    kind: 'stub',
    index: -1,
    ...mid(0),
    cursor: 'ns-resize',
  }];
  rails.value.forEach((_, i) => out.push({
    id: `rail-${i}`,
    kind: 'rail',
    index: i,
    ...mid(i + 1),
    cursor: i % 2 === 0 ? 'ew-resize' : 'ns-resize',
  }));
  out.push({
    id: 'stub-b',
    kind: 'stub',
    index: rails.value.length,
    ...mid(pts.length - 2),
    cursor: 'ns-resize',
  });
  return out;
});

/** Corner list of the current route, degenerate corners included. */
const points = computed(() => routeWithRails(props.geo.a, props.geo.b, rails.value));

/**
 * Every segment split at its control point into two stretches, each a hover target: corner to
 * control point and control point to corner. Segment 0 and the last one are the end stubs.
 */
const halves = computed(() => {
  const out: { id: string; segment: number; at: 'before' | 'after'; x1: number; y1: number; x2: number; y2: number }[] = [];
  const pts = points.value;
  for (let s = 0; s < pts.length - 1; s++) {
    const p = pts[s]!;
    const q = pts[s + 1]!;
    if (p.x === q.x && p.y === q.y) continue;
    const m = {
      x: (p.x + q.x) / 2,
      y: (p.y + q.y) / 2,
    };
    out.push({
      id: `${s}-before`,
      segment: s,
      at: 'before',
      x1: p.x,
      y1: p.y,
      x2: m.x,
      y2: m.y,
    }, {
      id: `${s}-after`,
      segment: s,
      at: 'after',
      x1: m.x,
      y1: m.y,
      x2: q.x,
      y2: q.y,
    });
  }
  return out;
});

const hovered = ref<{ segment: number; at: 'before' | 'after' } | null>(null);
let leaveTimer: ReturnType<typeof setTimeout> | null = null;

function showSplit (segment: number, at: 'before' | 'after') {
  if (leaveTimer) {
    clearTimeout(leaveTimer);
    leaveTimer = null;
  }
  hovered.value = {
    segment,
    at,
  };
}

// A short grace period lets the pointer travel from the stretch onto its mid-point.
function hideSplitSoon () {
  if (leaveTimer) clearTimeout(leaveTimer);
  leaveTimer = setTimeout(() => {
    hovered.value = null;
    leaveTimer = null;
  }, 250);
}

/** The mid-point of the hovered stretch: a quarter or three quarters along its segment. */
const splitHandle = computed<Handle | null>(() => {
  const h = hovered.value;
  if (!h) return null;
  const pts = points.value;
  const p = pts[h.segment];
  const q = pts[h.segment + 1];
  if (!p || !q || (p.x === q.x && p.y === q.y)) return null;
  const t = h.at === 'before' ? 0.25 : 0.75;
  const x = p.x + (q.x - p.x) * t;
  const y = p.y + (q.y - p.y) * t;
  const stub = h.segment === 0 || h.segment === pts.length - 2;
  // A stub gets a vertical jog at the mid-point's x; a rail segment splits perpendicular to itself.
  const vertical = !stub && (h.segment - 1) % 2 === 0;
  return {
    id: `split-${h.segment}-${h.at}`,
    kind: 'split',
    index: h.segment - 1,
    x,
    y,
    cursor: vertical ? 'ew-resize' : 'ns-resize',
    segment: h.segment,
    at: h.at,
    coord: stub || !vertical ? x : y,
  };
});

interface DragState {
  clientX: number;
  clientY: number;
  base: number[];
  index: number;
}
let drag: DragState | null = null;

function dir (side: 'left' | 'right'): 1 | -1 {
  return side === 'right' ? 1 : -1;
}

function onHandleDown (e: PointerEvent, h: Handle) {
  if (e.button !== 0) return;
  e.stopPropagation();
  e.preventDefault();
  const { a, b } = props.geo;
  let base = [...rails.value];
  let index = h.index;
  // Grabbing a stub inserts a bend there: a short stub, a new horizontal rail, then the old route.
  if (h.kind === 'stub' && h.index === -1) {
    base = [a.x + dir(a.side) * STUB, a.y, ...base];
    index = 1;
  } else if (h.kind === 'stub') {
    base = [...base, b.y, b.x + dir(b.side) * STUB];
    index = base.length - 2;
  } else if (h.kind === 'split' && h.segment === 0) {
    // A mid-point on a's stub: bend the stub there into a new vertical.
    base = [snap8(h.coord!), a.y, ...base];
    index = 1;
  } else if (h.kind === 'split' && h.segment === points.value.length - 2) {
    base = [...base, b.y, snap8(h.coord!)];
    index = base.length - 2;
  } else if (h.kind === 'split') {
    // Split a rail segment at the mid-point: the same rail twice around a new perpendicular
    // rail, then drag one half away to make the bend real.
    const v = base[h.index]!;
    base.splice(h.index, 1, v, snap8(h.coord!), v);
    index = h.at === 'before' ? h.index : h.index + 2;
  }
  drag = {
    clientX: e.clientX,
    clientY: e.clientY,
    base,
    index,
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function railsAt (e: PointerEvent): number[] {
  const d = drag!;
  const delta = d.index % 2 === 0 ? (e.clientX - d.clientX) / k.value : (e.clientY - d.clientY) / k.value;
  const next = [...d.base];
  next[d.index] = snap8(d.base[d.index]! + delta);
  return next;
}

function onMove (e: PointerEvent) {
  if (drag) emit('rails-change', railsAt(e), false);
}

function onUp (e: PointerEvent) {
  if (!drag) return;
  const next = simplifyRails(props.geo.a, props.geo.b, railsAt(e));
  stopListening();
  // Segment indices shift after a commit, so the hovered stretch is forgotten.
  hovered.value = null;
  emit('rails-change', next, true);
}

function stopListening () {
  drag = null;
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
}

onBeforeUnmount(() => {
  stopListening();
  if (leaveTimer) clearTimeout(leaveTimer);
});
</script>

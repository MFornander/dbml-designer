<template>
  <div
    ref="root"
    class="dg-root"
    :class="{
      'is-panning': pz.isPanning.value,
      'is-pan': panning,
      'is-marquee': marquee !== null,
      'dg-dark': dark,
    }"
    :style="cssVars"
  >
    <svg
      class="dg-svg"
      @wheel="onWheel"
      @pointermove="onPointerMove"
      @pointerover.capture="trackPointer"
      @pointerdown.capture="onAnyPointerDown"
      @mousedown.middle.prevent
    >
      <DiagramDefs :viewport="pz.viewport.value" />
      <rect
        class="dg-bg-fill"
        width="100%"
        height="100%"
        @pointerdown="onBackgroundDown"
        @click="onBackgroundClick"
      />
      <rect
        class="dg-bg-grid"
        width="100%"
        height="100%"
        fill="url(#dg-grid)"
        @pointerdown="onBackgroundDown"
        @click="onBackgroundClick"
      />
      <g
        class="dg-viewport"
        :transform="viewportTransform"
      >
        <!-- Painted bottom to top: open group bodies (largest first), edges, the tables inside open groups,
             collapsed groups, tables in no group, then sticky notes. A large group never hides what lies across it. -->
        <g class="dg-layer-groups">
          <TableGroupNode
            v-for="g in expandedGroupsInRenderOrder"
            :key="g.group.key"
            :group="g.group"
            :box="g.box"
            :name-w="g.nameW"
            :dark="dark"
            :collapsed="false"
            :member-count="g.memberCount"
            :is-dragging="drag.dragging.value?.key === g.group.key"
          />
        </g>
        <g class="dg-layer-refs">
          <RefEdge
            v-for="r in edgesInRenderOrder"
            :key="r.edge.key"
            :edge="r.edge"
            :kind="r.kind"
            :geo="r.geo"
            :highlighted="r.highlighted"
            :animated="r.animated"
            :passive="r.passive"
          />
        </g>
        <g class="dg-layer-tables">
          <!-- Members of open groups belong with their group, just above its body -->
          <TableNode
            v-for="t in groupedTablesInRenderOrder"
            :key="t.table.key"
            :table="t.table"
            :box="t.box"
            :rows="t.rows"
            :size="t.size"
            :highlighted="isTableHighlighted(t.table.key)"
            :highlighted-fields="highlightedFieldsOf(t.table.key)"
            :selected="selection.has(t.table.key)"
            :is-dragging="isDraggingKey(t.table.key)"
          />
          <!-- A collapsed group stands in for its tables -->
          <TableGroupNode
            v-for="g in collapsedGroupsInRenderOrder"
            :key="g.group.key"
            :group="g.group"
            :box="g.box"
            :name-w="g.nameW"
            :dark="dark"
            :collapsed="true"
            :member-count="g.memberCount"
            :is-dragging="false"
          />
          <!-- Tables in no group float above collapsed groups -->
          <TableNode
            v-for="t in freeTablesInRenderOrder"
            :key="t.table.key"
            :table="t.table"
            :box="t.box"
            :rows="t.rows"
            :size="t.size"
            :highlighted="isTableHighlighted(t.table.key)"
            :highlighted-fields="highlightedFieldsOf(t.table.key)"
            :selected="selection.has(t.table.key)"
            :is-dragging="isDraggingKey(t.table.key)"
          />
          <!-- Whatever is being dragged rides above the rest while it moves -->
          <TableGroupNode
            v-for="g in raisedGroupsInRenderOrder"
            :key="g.group.key"
            :group="g.group"
            :box="g.box"
            :name-w="g.nameW"
            :dark="dark"
            :collapsed="true"
            :member-count="g.memberCount"
            :is-dragging="true"
          />
          <TableNode
            v-for="t in raisedTablesInRenderOrder"
            :key="t.table.key"
            :table="t.table"
            :box="t.box"
            :rows="t.rows"
            :size="t.size"
            :highlighted="isTableHighlighted(t.table.key)"
            :highlighted-fields="highlightedFieldsOf(t.table.key)"
            :selected="selection.has(t.table.key)"
            :is-dragging="true"
          />
        </g>
        <g class="dg-layer-notes">
          <StickyNoteNode
            v-for="n in notesInRenderOrder"
            :key="n.note.key"
            :note="n.note"
            :box="n.box"
            :selected="selection.has(n.note.key)"
            :is-dragging="isDraggingKey(n.note.key)"
          />
        </g>
        <rect
          v-if="marquee"
          class="dg-marquee"
          :x="marquee.x"
          :y="marquee.y"
          :width="marquee.w"
          :height="marquee.h"
          vector-effect="non-scaling-stroke"
        />
        <g class="dg-layer-controls">
          <RefEdgeControls
            v-if="selectedRef"
            :edge="selectedRef.edge"
            :geo="selectedRef.geo"
            :customized="!!edgeRoutes[selectedRef.edge.key]"
            @rails-change="onRailsChange"
            @open-color="openRefColor"
          />
        </g>
      </g>
    </svg>
    <DiagramTooltip
      :content="tooltip.content.value"
      :anchor="tooltip.anchor.value"
      :view-size="pz.viewSize.value"
    />
    <ColorPickerPopover
      v-if="colorPicker"
      :title="colorPicker.title"
      :current="colorPicker.current"
      :used-colors="usedColors"
      :anchor="colorPicker.anchor"
      :view-size="pz.viewSize.value"
      @pick="onPickColor"
      @close="closeColorPicker"
    />
    <RecordsPreview
      v-if="recordsPreview"
      :title="recordsPreview.title"
      :records="recordsPreview.records"
      :columns="recordsPreview.columns"
      :anchor="recordsPreview.anchor"
      :view-size="pz.viewSize.value"
      @close="recordsKey = null"
    />
    <div
      v-if="legendKinds.length"
      class="dg-legend"
      aria-label="Lineage kinds"
    >
      <span
        v-for="k in legendKinds"
        :key="k"
        class="dg-legend-item"
      >
        <svg
          width="28"
          height="8"
          aria-hidden="true"
        >
          <path
            class="dg-legend-line"
            :class="`is-kind-${k}`"
            d="M1 4 H27"
          />
        </svg>
        {{ k }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed, nextTick, onBeforeUnmount, onMounted, provide, ref, shallowRef, toRef, useTemplateRef, watch,
} from 'vue';
import type {
  ColorChangePayload, ColorTarget, DetailLevel, DiagramViewport, ElementClickEvent, ElementEvent, Highlight, PartialRefMode,
  PositionChange, PositionsMap, RevealAdded, TableChip, TableLinkPayload,
} from '../types';
import { resolveFocus } from '../state/focus';
import type { Source } from '../model';
import type { DepLineVM, DiagramModel, RefVM } from '../types';
import type { FieldKey, TableKey } from '../keys';
import { createMeasurer, loadDiagramFonts } from '../geometry/measure';
import { autoLod } from '../geometry/lod';
import {
  collapsedGroupSize, placeByLineage, placeNewItems, placeNewNotes,
} from '../geometry/layout';
import { arrangeByGroup, arrangePending } from '../geometry/arrange';
import type { GroupBox } from '../state/useDiagramGeometry';
import {
  CHIP_W, FONT_GROUP_NAME, GROUP_HEADER_H, NOTE_H, NOTE_MIN_H, NOTE_MIN_W, NOTE_W, PARTIAL_BADGE_H, ROW_H,
} from '../geometry/constants';
import {
  intersects, snap8, union, type Point, type Rect,
} from '../geometry/rect';
import { clampZoom, screenToWorld, worldToScreen } from '../geometry/viewport';
import { isTypingTarget } from '../util/typingTarget';
import { DARK, LIGHT, paletteToCssVars } from '../theme/palette';
import { DIAGRAM_CTX, type DiagramContext } from '../state/context';
import {
  useDiagramGeometry, type DragOverride, type RefGeometry, type RouteDragOverride,
} from '../state/useDiagramGeometry';
import { useDrag, type DragTarget } from '../state/useDrag';
import { useHover, type HoverTarget } from '../state/useHover';
import { sameSet, shareMap } from '../state/share';
import { usePanZoom } from '../state/usePanZoom';
import { useTooltip } from '../state/useTooltip';
import DiagramDefs from './DiagramDefs.vue';
import TableNode from './TableNode.vue';
import RefEdge from './RefEdge.vue';
import TableGroupNode from './TableGroupNode.vue';
import StickyNoteNode from './StickyNoteNode.vue';
import DiagramTooltip from './DiagramTooltip.vue';
import ColorPickerPopover from './ColorPickerPopover.vue';
import RecordsPreview from './RecordsPreview.vue';
import RefEdgeControls from './RefEdgeControls.vue';
import { installStyles } from '../theme/styles';

installStyles();

const props = withDefaults(defineProps<{
  model: DiagramModel;
  positions: PositionsMap;
  detailLevel: DetailLevel;
  dark: boolean;
  collapsedGroups?: ReadonlySet<string>;
  showRefs?: boolean;
  showLineage?: boolean;
  /** Every column-level lineage mapping drawn field to field, by kind, in place of its table-level edge. */
  lineageColumns?: boolean;
  /** Refs that come from a TablePartial: a badge per partial in the table header, or lines like the rest. */
  partialRefMode?: PartialRefMode;
  /** Record values on their fields, and the count of a table's records in its header, which opens them. */
  showValues?: boolean;
  /** Lineage layout: positions derived from dependency order; groups and notes hidden. */
  lineageLayout?: boolean;
  /** Highlight every visible edge: walking ants, names, and endpoint cardinalities. */
  highlightAll?: boolean;
  /** Hand-drawn relationship routes by ref key (alternating x/y rails, see routing.ts). */
  edgeRoutes?: Readonly<Record<string, readonly number[]>>;
  /** Pan tool: dragging the bare canvas pans instead of drawing a selection box. Space does the same while held. */
  /** Tables and notes hidden by the active diagram view. */
  hidden?: ReadonlySet<string>;
  /** The model is behind the text (a parse or its imports are on the way); auto-placement waits for it. */
  loading?: boolean;
  /** What an update just added, by key: highlighted for a moment, and a new table off screen is panned into view. */
  marked?: ReadonlySet<string>;
  /** Hovered tables, groups, notes, and selected relationships offer the color picker. */
  pickColors?: boolean;
  /** What the view does when an update adds tables (see `RevealAdded`). */
  revealAdded?: RevealAdded;
  /** The host's highlight: keys lit, an accent among them, and the rest dimmed if asked. */
  highlighted?: Highlight | null;
  /** Whether the engine shows its tooltip for a hovered element; false leaves the element to the host's own. */
  tooltipFilter?: (target: HoverTarget) => boolean;
  /** The host's chips in table headers, by table key. */
  chips?: Readonly<Record<string, readonly TableChip[]>> | null;
  /** How wide every chip is drawn, whatever its label. */
  chipWidth?: number;
}>(), {
  chips: null,
  chipWidth: CHIP_W,
  revealAdded: 'pan',
  highlighted: null,
  loading: false,
  pickColors: true,
  marked: () => new Set<string>(),
  collapsedGroups: () => new Set<string>(),
  showRefs: true,
  showLineage: true,
  lineageColumns: false,
  partialRefMode: 'badges',
  showValues: true,
  lineageLayout: false,
  highlightAll: false,
  edgeRoutes: () => ({}),
  hidden: () => new Set<string>(),
});

const emit = defineEmits<{
  /** Tables or notes moved; `'auto'` when auto-placement put down elements that had no position. */
  'position-change': [changes: PositionChange[], origin?: 'auto'];
  'table-click': [payload: TableLinkPayload];
  'table-hover': [payload: TableLinkPayload | null];
  'toggle-group': [key: string];
  'zoom-change': [k: number];
  /** The pan or zoom changed. */
  'viewport-change': [viewport: DiagramViewport];
  /** Any element was clicked; the host may keep the engine from pinning and selecting it. */
  'element-click': [event: ElementClickEvent];
  /** The pointer moved onto an element, or off every element (null). */
  'element-hover': [event: ElementEvent | null];
  /** A color was chosen in the picker; the host writes it into the DBML text. */
  'set-color': [payload: ColorChangePayload];
  /** A relationship's route was hand-drawn (rails) or reset (null). */
  'edge-route-change': [key: string, rails: number[] | null];
  /** Arrange laid out what the view shows; `resetRoutes` are the relationships whose hand-drawn routes no longer fit. */
  'arrange': [changes: PositionChange[], resetRoutes: string[]];
}>();

const root = useTemplateRef<HTMLElement>('root');
const model = toRef(props, 'model');

// Measurement
const measurer = createMeasurer();
const measureVersion = ref(0);
onMounted(() => {
  loadDiagramFonts().then(() => {
    measurer.clear();
    measureVersion.value += 1;
  });
});

// Viewport
const pz = usePanZoom(root);
const viewportTransform = computed(() => {
  const vp = pz.viewport.value;
  return `translate(${vp.x} ${vp.y}) scale(${vp.k})`;
});
const lod = computed(() => autoLod(pz.viewport.value.k));
watch(() => pz.viewport.value.k, (k) => emit('zoom-change', k), {
  immediate: true,
});
/** The pan and zoom as the host sees them. */
const viewport = computed<DiagramViewport>(() => ({
  x: pz.viewport.value.x,
  y: pz.viewport.value.y,
  zoom: pz.viewport.value.k,
}));
watch(viewport, (v) => emit('viewport-change', v));

// Geometry
const dragOverride = shallowRef<DragOverride | null>(null);
const routeDragOverride = shallowRef<RouteDragOverride | null>(null);
/**
 * The refs of the hovered or pinned partial badge, drawn while it is, like the column line of a
 * mapped field. Kept as the same set while it holds the same keys, so other hovers do not reroute.
 */
const revealedRefs = computed<ReadonlySet<string>>((prev) => {
  const t = hover.effective.value;
  const keys = t?.kind === 'partial'
    ? model.value.tablesByKey.get(t.tableKey)?.partialRefs?.find((p) => p.partial === t.partial)?.refKeys ?? []
    : [];
  return prev && prev.size === keys.length && keys.every((k) => prev.has(k)) ? prev : new Set(keys);
});
const geo = useDiagramGeometry({
  model,
  positions: toRef(props, 'positions'),
  detailLevel: toRef(props, 'detailLevel'),
  collapsedGroups: toRef(props, 'collapsedGroups'),
  showRefs: toRef(props, 'showRefs'),
  showLineage: toRef(props, 'showLineage'),
  partialRefMode: toRef(props, 'partialRefMode'),
  showValues: toRef(props, 'showValues'),
  revealedRefs,
  lineageLayout: toRef(props, 'lineageLayout'),
  dragOverride,
  edgeRoutes: toRef(props, 'edgeRoutes'),
  routeDragOverride,
  hidden: toRef(props, 'hidden'),
  chips: toRef(props, 'chips'),
  chipWidth: toRef(props, 'chipWidth'),
  measurer,
  measureVersion,
});

/** A partial ref standing as a badge: drawn only while its badge reveals it, and then not editable. */
const isBadged = (r: RefVM) => props.partialRefMode === 'badges' && !!r.viaPartial;

// Selected relationship: clicking a line pins it, which shows its control points and tools.
const selectedRef = computed(() => {
  const p = hover.pinned.value;
  if (!p || p.kind !== 'ref' || !props.showRefs) return null;
  const edge = model.value.refs.find((r) => r.key === p.key);
  const g = geo.routes.value.get(p.key);
  return edge && g && !isBadged(edge)
    ? {
        edge,
        geo: g,
      }
    : null;
});

function onRailsChange (rails: number[] | null, commit: boolean) {
  const key = selectedRef.value?.edge.key;
  if (!key) return;
  if (!commit) {
    routeDragOverride.value = {
      key,
      rails: rails ?? [],
    };
    return;
  }
  routeDragOverride.value = null;
  emit('edge-route-change', key, rails);
}

// Selection: a marquee on the bare canvas (select mode) or a click picks tables and notes;
// dragging one selected element moves them all.
const selection = shallowRef<ReadonlySet<string>>(new Set());
const marquee = shallowRef<Rect | null>(null);
/** Space held: pan instead of select until it is released. */
const spaceHeld = ref(false);
/** Space held: dragging the bare canvas pans instead of selecting. Middle-button drags always pan. */
const panning = computed(() => spaceHeld.value);

function clearSelection () {
  if (selection.value.size > 0) selection.value = new Set();
}

/** Members of a group or selection drag also render as dragging. */
function isDraggingKey (key: string): boolean {
  const d = drag.dragging.value;
  if (!d) return false;
  if (d.key === key) return true;
  return d.kind === 'selection' && selection.value.has(key);
}

// Drag: tables and notes move (all selected ones together), notes resize, groups move all their members.
let dragOrigin: Point = {
  x: 0,
  y: 0,
};
/** Shift, Cmd, or Ctrl was held when the drag (or click) started: the click adds to or removes from the selection. */
let dragAdditive = false;

function isAdditive (e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }): boolean {
  return e.shiftKey || e.metaKey || e.ctrlKey;
}

function groupMembers (groupKey: string): ReadonlySet<string> {
  return new Set(model.value.groups.find((g) => g.key === groupKey)?.tableKeys ?? []);
}

/** Members moved by a delta drag: a group's tables, or the current selection. */
function deltaMembers (target: DragTarget): ReadonlySet<string> {
  return target.kind === 'group' ? groupMembers(target.key) : selection.value;
}

/** Offset of a group or selection drag, snapped so every member stays on the grid. */
function groupDelta (pos: Point): Point {
  return {
    x: snap8(pos.x - dragOrigin.x),
    y: snap8(pos.y - dragOrigin.y),
  };
}

const drag = useDrag({
  viewport: pz.viewport,
  onMove (target, pos) {
    // Moving something changes what a fit would show; from now on the viewport is the user's.
    stopAutoFit();
    switch (target.kind) {
      case 'note-resize':
        dragOverride.value = {
          key: target.key,
          size: {
            w: Math.max(NOTE_MIN_W, pos.x),
            h: Math.max(NOTE_MIN_H, pos.y),
          },
        };
        break;
      case 'group':
      case 'selection':
        dragOverride.value = {
          key: target.key,
          delta: groupDelta(pos),
          memberKeys: deltaMembers(target),
        };
        break;
      default:
        dragOverride.value = {
          key: target.key,
          pos,
        };
    }
  },
  onEnd (target, pos, moved) {
    if (moved) {
      emit('position-change', changesFor(target, pos));
    } else if (target.kind === 'table' || target.kind === 'note' || target.kind === 'selection') {
      onElementClick(target.key);
    } else if (target.kind === 'group') {
      clicked({
        kind: 'group',
        key: target.key,
      });
    }
    dragOverride.value = null;
  },
});

/**
 * A click on a table or note selects it alone; with Shift, Cmd, or Ctrl it toggles it in the selection. Tables also pin,
 * or the partial badge clicked on, which keeps its refs drawn.
 */
function onElementClick (key: string) {
  const table = model.value.tablesByKey.get(key);
  const over = hover.hover.value;
  // On a table, what is under the pointer: one of its fields or partial badges, or the table itself.
  const target: HoverTarget = table
    ? ((over?.kind === 'field' || over?.kind === 'partial' || over?.kind === 'chip') && over.tableKey === key
        ? over
        : {
            kind: 'table',
            key,
          })
    : {
        kind: 'note',
        key,
      };
  const prevented = clicked(target);
  if (!prevented) {
    const next = new Set(dragAdditive ? selection.value : []);
    if (dragAdditive && next.has(key)) next.delete(key);
    else next.add(key);
    selection.value = next;
  }

  if (!table) return;
  if (!prevented) {
    hover.togglePin(target.kind === 'partial'
      ? target
      : {
          kind: 'table',
          key,
        });
  }
  emit('table-click', {
    key,
    source: table.source,
  });
}

/** Tell the host what was clicked; true when it asked the engine to leave the click alone. */
function clicked (target: HoverTarget): boolean {
  let prevented = false;
  emit('element-click', {
    ...elementEvent(target),
    preventDefault () {
      prevented = true;
    },
    get defaultPrevented () {
      return prevented;
    },
  });
  return prevented;
}

/** A click on an edge pins it, unless the host keeps the engine from it. */
function onEdgeClick (target: HoverTarget) {
  if (!clicked(target)) hover.togglePin(target);
}

/** An element as the host sees it: what it is, its source, and where it is drawn on screen. */
function elementEvent (target: HoverTarget): ElementEvent {
  const source = sourceOf(target);
  return {
    target,
    ...(source !== undefined ? { source } : {}),
    rect: target.kind === 'chip' ? chipRect(target.tableKey, target.chip) : rectOf(target.kind === 'field' ? target.fieldKey : target.kind === 'partial' ? target.tableKey : target.key),
    point: lastPointer ? { ...lastPointer } : null,
  };
}

function sourceOf (target: HoverTarget): Source | undefined {
  const m = model.value;
  switch (target.kind) {
    case 'table':
      return m.tablesByKey.get(target.key)?.source;
    case 'partial':
    case 'chip':
      return m.tablesByKey.get(target.tableKey)?.source;
    case 'field':
      return m.tablesByKey.get(target.tableKey)?.fields.find((f) => f.key === target.fieldKey)?.source;
    case 'ref':
      return m.refs.find((r) => r.key === target.key)?.source;
    case 'dep':
      for (const d of m.deps) {
        if (d.key === target.key) return d.source;
        const c = d.columns.find((x) => x.key === target.key);
        if (c) return c.source;
      }
      return undefined;
    case 'group':
      return m.groups.find((g) => g.key === target.key)?.source;
    default:
      return m.notes.find((n) => n.key === target.key)?.source;
  }
}

function changesFor (target: DragTarget, pos: Point): PositionChange[] {
  switch (target.kind) {
    case 'note-resize': {
      const stored = props.positions[target.key];
      if (!stored) return [];
      return [{
        key: target.key,
        x: stored.x,
        y: stored.y,
        w: Math.max(NOTE_MIN_W, pos.x),
        h: Math.max(NOTE_MIN_H, pos.y),
      }];
    }
    case 'group':
    case 'selection': {
      const { x: dx, y: dy } = groupDelta(pos);
      const changes: PositionChange[] = [];
      for (const key of deltaMembers(target)) {
        const stored = props.positions[key];
        if (!stored) continue;
        changes.push({
          key,
          x: stored.x + dx,
          y: stored.y + dy,
        });
      }
      return changes;
    }
    default:
      return [{
        key: target.key,
        x: pos.x,
        y: pos.y,
      }];
  }
}

// Hover and highlight
const suppressed = computed(() => drag.dragging.value !== null || pz.isPanning.value || marquee.value !== null);
const hover = useHover(model, suppressed);
/** The host's highlight, resolved to what is drawn. */
const focus = computed(() => resolveFocus(model.value, props.highlighted));

/** The highlighted fields of every table with none; one shared set, so a hover leaves those tables alone. */
const NO_FIELDS: ReadonlySet<FieldKey> = new Set();

/**
 * Highlighted fields by table. Each table gets only its own, and the same set while they stay the
 * same, so a hover re-renders only the tables whose highlight changed rather than every table.
 */
const highlightedFieldsByTable = computed<Map<TableKey, ReadonlySet<FieldKey>>>((prev) => {
  const keys = hover.highlight.value.fieldKeys;
  const marked = props.marked;
  const lit = focus.value.lit;
  const next = new Map<TableKey, ReadonlySet<FieldKey>>();
  if (keys.size > 0 || marked.size > 0 || lit.size > 0) {
    for (const t of model.value.tables) {
      const own = t.fields.filter((f) => keys.has(f.key) || marked.has(f.key) || lit.has(f.key)).map((f) => f.key);
      if (own.length > 0) next.set(t.key, new Set(own));
    }
  }
  return shareMap(prev, next, sameSet);
});

/** A table lights up while hovered or connected to what is, for a moment after an update added it, and while the host highlights it. */
const isTableHighlighted = (key: TableKey) => hover.highlight.value.tableKeys.has(key) || props.marked.has(key) || focus.value.lit.has(key);

function highlightedFieldsOf (key: TableKey): ReadonlySet<FieldKey> {
  return highlightedFieldsByTable.value.get(key) ?? NO_FIELDS;
}

watch(hover.hover, (target) => {
  emit('element-hover', target ? elementEvent(target) : null);
});

watch(hover.hover, (target, prev) => {
  const tableOf = (t: typeof target) => {
    if (!t) return null;
    if (t.kind === 'table') return t.key;
    if (t.kind === 'field' || t.kind === 'partial') return t.tableKey;
    return null;
  };
  const key = tableOf(target);
  if (key === tableOf(prev)) return;
  if (!key) {
    emit('table-hover', null);
    return;
  }
  const table = model.value.tablesByKey.get(key);
  if (table) {
    emit('table-hover', {
      key,
      source: table.source,
    });
  }
});

/** Last pointer position in pane pixels; edge tooltips trail it. */
const pointer = shallowRef<{ x: number; y: number } | null>(null);

/**
 * Where the pointer last was, in client coordinates, for the events the host gets. Taken as it
 * crosses into an element (`pointerover` comes before `pointerenter`), moves, and presses.
 */
let lastPointer: Point | null = null;
function trackPointer (e: PointerEvent) {
  lastPointer = {
    x: e.clientX,
    y: e.clientY,
  };
}

function onPointerMove (e: PointerEvent) {
  trackPointer(e);
  const r = root.value?.getBoundingClientRect();
  if (r) {
    pointer.value = {
      x: e.clientX - r.left,
      y: e.clientY - r.top,
    };
  }
}

// Color picker (opened from the gear on a hovered table, group, or note)
const colorTarget = shallowRef<ColorTarget | null>(null);

function closeColorPicker () {
  if (colorTarget.value) colorTarget.value = null;
}

/** Title, current color, and pane-pixel anchor for the open picker; null once its element is gone. */
const colorPicker = computed(() => {
  const t = colorTarget.value;
  if (!t) return null;
  const vp = pz.viewport.value;
  const toScreen = (r: Rect): Rect => {
    const tl = worldToScreen(vp, r);
    return {
      x: tl.x,
      y: tl.y,
      w: r.w * vp.k,
      h: r.h * vp.k,
    };
  };
  if (t.kind === 'table') {
    const table = model.value.tablesByKey.get(t.key);
    const box = geo.boxes.value.get(t.key);
    if (!table || !box || !geo.visibleTableKeys.value.has(t.key)) return null;
    return {
      title: 'Header Color',
      current: table.headerColor ?? table.groupColor,
      anchor: toScreen({
        ...box,
        h: ROW_H,
      }),
    };
  }
  if (t.kind === 'group') {
    const g = geo.groupBoxes.value.find((x) => x.group.key === t.key);
    if (!g) return null;
    return {
      title: 'Header Color',
      current: g.group.color,
      anchor: toScreen({
        ...g.box,
        h: GROUP_HEADER_H,
      }),
    };
  }
  if (t.kind === 'ref') {
    const ref = model.value.refs.find((r) => r.key === t.key);
    const g = geo.routes.value.get(t.key);
    if (!ref || !g || !props.showRefs || isBadged(ref)) return null;
    return {
      title: 'Color',
      current: ref.color ?? ref.lineColor,
      anchor: toScreen({
        x: g.mid.x,
        y: g.mid.y,
        w: 0,
        h: 0,
      }),
    };
  }
  const note = model.value.notes.find((n) => n.key === t.key);
  const box = geo.noteBoxes.value.get(t.key);
  if (!note || !box) return null;
  return {
    title: 'Note Color',
    current: note.color,
    anchor: toScreen({
      ...box,
      h: ROW_H,
    }),
  };
});

function openRefColor () {
  const key = selectedRef.value?.edge.key;
  if (key) {
    colorTarget.value = {
      kind: 'ref',
      key,
    };
  }
}
watch(colorPicker, (v) => {
  if (!v) closeColorPicker();
});

/** Distinct colors already used by tables, groups, and notes, for the picker's "Currently Used" row. */
const usedColors = computed(() => {
  const set = new Set<string>();
  for (const t of model.value.tables) if (t.headerColor) set.add(t.headerColor.toUpperCase());
  for (const g of model.value.groups) if (g.color) set.add(g.color.toUpperCase());
  for (const n of model.value.notes) if (n.color) set.add(n.color.toUpperCase());
  for (const r of model.value.refs) if (r.color) set.add(r.color.toUpperCase());
  return [...set];
});

function onPickColor (color: string) {
  const t = colorTarget.value;
  if (t) {
    emit('set-color', {
      ...t,
      color,
    });
  }
}

// Records preview (opened from the count badge in a table header)
const recordsKey = ref<TableKey | null>(null);

/** The open preview: its table's records, their columns, and the header as anchor; null once the table or its badge is gone. */
const recordsPreview = computed(() => {
  const key = recordsKey.value;
  if (!key || !props.showValues) return null;
  const table = model.value.tablesByKey.get(key);
  const box = geo.boxes.value.get(key);
  const records = table?.records;
  if (!table || !box || !records || records.length < 2 || !geo.visibleTableKeys.value.has(key)) return null;
  const named = new Set(records.flatMap((r) => Object.keys(r)));
  const columns = table.fields.map((f) => f.name).filter((n) => named.has(n));
  for (const n of named) if (!columns.includes(n)) columns.push(n);
  const vp = pz.viewport.value;
  const tl = worldToScreen(vp, box);
  return {
    title: table.displayName,
    records,
    columns,
    anchor: {
      x: tl.x,
      y: tl.y,
      w: box.w * vp.k,
      h: ROW_H * vp.k,
    },
  };
});
watch(recordsPreview, (v) => {
  if (!v) recordsKey.value = null;
});

const tooltip = useTooltip({
  target: hover.hover,
  model,
  boxes: geo.boxes,
  rowsByTable: geo.rowsByTable,
  routes: geo.routes,
  groupBoxes: geo.groupBoxes,
  viewport: pz.viewport,
  pointer,
  // The picker sits where the tooltip would; keep the two from stacking. No tooltips mid route-drag either.
  suppressed: computed(() => suppressed.value || colorTarget.value !== null || recordsKey.value !== null || routeDragOverride.value !== null),
  filter: toRef(props, 'tooltipFilter'),
  chips: toRef(props, 'chips'),
  sizes: geo.sizes,
});

function onWheel (e: WheelEvent) {
  stopAutoFit();
  pz.onWheel(e);
}

// A middle-button drag pans wherever it starts, before tables or notes can claim the press.
function onAnyPointerDown (e: PointerEvent) {
  trackPointer(e);
  if (e.button !== 1) return;
  e.stopPropagation();
  stopAutoFit();
  pz.onBackgroundPointerDown(e);
}

// Bare canvas: pan (Space held) or draw a selection marquee.
function onBackgroundDown (e: PointerEvent) {
  if (e.button !== 0) return;
  if (panning.value) {
    stopAutoFit();
    pz.onBackgroundPointerDown(e);
    return;
  }
  startMarquee(e);
}

/** Pane pixels to diagram coordinates. */
function worldPoint (e: { clientX: number; clientY: number }): Point {
  const r = root.value?.getBoundingClientRect();
  return screenToWorld(pz.viewport.value, {
    x: e.clientX - (r?.left ?? 0),
    y: e.clientY - (r?.top ?? 0),
  });
}

let marqueeStart: Point | null = null;
let marqueeAdditive = false;
/** The click that follows a marquee drag must not clear what the drag just selected. */
let skipBackgroundClick = false;
const MARQUEE_SLOP_PX = 3;

function startMarquee (e: PointerEvent) {
  e.preventDefault();
  marqueeStart = worldPoint(e);
  marqueeAdditive = isAdditive(e);
  window.addEventListener('pointermove', onMarqueeMove);
  window.addEventListener('pointerup', onMarqueeUp);
  window.addEventListener('pointercancel', onMarqueeUp);
}

function onMarqueeMove (e: PointerEvent) {
  if (!marqueeStart) return;
  const p = worldPoint(e);
  const r: Rect = {
    x: Math.min(marqueeStart.x, p.x),
    y: Math.min(marqueeStart.y, p.y),
    w: Math.abs(p.x - marqueeStart.x),
    h: Math.abs(p.y - marqueeStart.y),
  };
  if (marquee.value || (r.w + r.h) * pz.viewport.value.k >= MARQUEE_SLOP_PX) marquee.value = r;
}

/** Tables and notes touching a rectangle. */
function keysInside (r: Rect): string[] {
  const out: string[] = [];
  for (const [key, box] of geo.boxes.value) {
    if (geo.visibleTableKeys.value.has(key) && intersects(box, r)) out.push(key);
  }
  for (const [key, box] of geo.noteBoxes.value) if (intersects(box, r)) out.push(key);
  return out;
}

function onMarqueeUp () {
  window.removeEventListener('pointermove', onMarqueeMove);
  window.removeEventListener('pointerup', onMarqueeUp);
  window.removeEventListener('pointercancel', onMarqueeUp);
  if (marquee.value) {
    selection.value = new Set([...(marqueeAdditive ? selection.value : []), ...keysInside(marquee.value)]);
    skipBackgroundClick = true;
  }
  marquee.value = null;
  marqueeStart = null;
}

function onBackgroundClick () {
  if (skipBackgroundClick) {
    skipBackgroundClick = false;
    return;
  }
  hover.clearPin();
  clearSelection();
}

function onKeyDown (e: KeyboardEvent) {
  if (e.key === 'Escape') {
    hover.clearPin();
    closeColorPicker();
    clearSelection();
  } else if (e.code === 'Space' && !e.repeat) {
    const active = document.activeElement;
    if (isTypingTarget(active)) return;
    // A toolbar button left focused after a click would otherwise activate on Space; drop its focus and pan.
    if (active instanceof HTMLElement && active !== document.body) active.blur();
    spaceHeld.value = true;
    e.preventDefault();
  }
}

function onKeyUp (e: KeyboardEvent) {
  if (e.code === 'Space') spaceHeld.value = false;
}

function onWindowBlur () {
  spaceHeld.value = false;
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onWindowBlur);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.removeEventListener('blur', onWindowBlur);
  onMarqueeUp();
});

// Context for child nodes
const ctx: DiagramContext = {
  viewport: pz.viewport,
  lod,
  highlight: hover.highlight,
  dark: toRef(props, 'dark'),
  dragging: drag.dragging,
  setHover: hover.setHover,
  clearHover: hover.clearHover,
  clickEdge: onEdgeClick,
  focus,
  beginDrag: (e: PointerEvent, target: DragTarget, origin: Point) => {
    // Lineage-layout positions are derived from the dependency order, so nothing is movable there.
    if (props.lineageLayout) return;
    dragOrigin = { ...origin };
    dragAdditive = isAdditive(e);
    // Dragging one of several selected elements moves them all.
    const multi = (target.kind === 'table' || target.kind === 'note')
      && selection.value.has(target.key) && selection.value.size > 1;
    drag.begin(e, multi
      ? {
          kind: 'selection',
          key: target.key,
        }
      : target, origin);
  },
  toggleGroup: (key: string) => emit('toggle-group', key),
  pickColors: toRef(props, 'pickColors'),
  toggleRecords: (key: TableKey) => {
    colorTarget.value = null;
    recordsKey.value = recordsKey.value === key ? null : key;
  },
  openColorPicker: (target: ColorTarget) => {
    recordsKey.value = null;
    colorTarget.value = target;
  },
};
provide(DIAGRAM_CTX, ctx);

// Render lists
/** Open groups, the largest body first: whatever lies inside another group is painted over it, not under it. */
const expandedGroupsInRenderOrder = computed(() => geo.groupBoxes.value
  .filter((g) => !g.collapsed)
  .map((g, i) => ({
    g,
    i,
  }))
  .sort((a, b) => (b.g.box.w * b.g.box.h - a.g.box.w * a.g.box.h) || a.i - b.i)
  .map(({ g }) => g));

const isDraggingGroup = (g: GroupBox) => drag.dragging.value?.key === g.group.key;
/** Collapsed groups in declaration order; a dragged one is raised instead. */
const collapsedGroupsInRenderOrder = computed(() => geo.groupBoxes.value.filter((g) => g.collapsed && !isDraggingGroup(g)));
const raisedGroupsInRenderOrder = computed(() => geo.groupBoxes.value.filter((g) => g.collapsed && isDraggingGroup(g)));

/** Groups drawn open, whose members are painted right above the bodies. */
const openGroupKeys = computed(() => new Set(geo.groupBoxes.value.filter((g) => !g.collapsed).map((g) => g.group.key)));

const visibleTables = computed(() => model.value.tables
  .filter((t) => geo.visibleTableKeys.value.has(t.key))
  .map((t) => ({
    table: t,
    box: geo.boxes.value.get(t.key)!,
    rows: geo.rowsByTable.value.get(t.key) ?? [],
    size: geo.sizes.value.get(t.key)!,
  })));
type RenderTable = (typeof visibleTables.value)[number];
const inOpenGroup = (t: RenderTable) => !!t.table.groupKey && openGroupKeys.value.has(t.table.groupKey);
const isRaised = (t: RenderTable) => isDraggingKey(t.table.key);
/** Tables inside an open group, painted with it. */
const groupedTablesInRenderOrder = computed(() => visibleTables.value.filter((t) => inOpenGroup(t) && !isRaised(t)));
/** Tables in no group (or whose group is not drawn), above collapsed groups. */
const freeTablesInRenderOrder = computed(() => visibleTables.value.filter((t) => !inOpenGroup(t) && !isRaised(t)));
/** Whatever is being dragged, on top of the other tables and collapsed groups while it moves. */
const raisedTablesInRenderOrder = computed(() => visibleTables.value.filter(isRaised));

interface RenderEdge {
  edge: RefVM | DepLineVM;
  kind: 'ref' | 'dep';
  geo: RefGeometry;
  highlighted: boolean;
  /** Lit by the hover or pin itself, not only by highlight-all: drawn on top, and animated past the cap. */
  hot: boolean;
  /** Whether the walking-ants overlay is mounted (capped when everything is highlighted). */
  animated: boolean;
  /** A partial ref drawn only while its badge reveals it: the pointer passes through it. */
  passive?: boolean;
}

/** Above this many highlighted edges, highlight-all mode drops the animated overlay to stay smooth. */
const MAX_ANIMATED_EDGES = 80;

const edgesInRenderOrder = computed<RenderEdge[]>(() => {
  const hl = hover.highlight.value;
  const all = props.highlightAll;
  const list: RenderEdge[] = [];
  const hostLit = focus.value.lit;
  const push = (edge: RefVM | DepLineVM, kind: 'ref' | 'dep', g: RefGeometry | undefined, lit: boolean, passive?: boolean) => {
    if (!g) return;
    // What an update just added walks with the ants for a moment, like a hovered edge.
    const hot = lit || props.marked.has(edge.key);
    // The host's highlight lights an edge without the ants, which stay for the pointer and for updates.
    const held = hostLit.has(edge.key);
    list.push({
      edge,
      kind,
      geo: g,
      highlighted: all || hot || held,
      hot,
      animated: hot || !held,
      ...(passive !== undefined ? { passive } : {}),
    });
  };
  // Partial refs standing as badges are left out, from highlight-all too, unless their badge reveals them.
  for (const r of geo.drawnRefs.value) {
    push(r, 'ref', geo.routes.value.get(r.key), hl.refKeys.has(r.key), isBadged(r));
  }
  if (props.showLineage) {
    // A hovered table lights up its mappings too when they stand in for its table-level edges.
    const tableHover = hl.source?.kind === 'table' || hl.source?.kind === 'chip';
    for (const d of model.value.deps) {
      if (props.lineageColumns && d.columns.length) {
        for (const c of d.columns) {
          push(c, 'dep', geo.routes.value.get(c.key), hl.depColumnKeys.has(c.key) || (tableHover && hl.depKeys.has(d.key)));
        }
        continue;
      }
      push(d, 'dep', geo.routes.value.get(d.key), hl.depKeys.has(d.key));
      // Column-level mappings show only while one of their fields is hovered or pinned, or the host highlights them.
      for (const c of d.columns) {
        if (hl.depColumnKeys.has(c.key)) push(c, 'dep', geo.routes.value.get(c.key), true);
        else if (hostLit.has(c.key)) push(c, 'dep', geo.routes.value.get(c.key), false);
      }
    }
  }
  if (all && list.length > MAX_ANIMATED_EDGES) {
    for (const e of list) e.animated = e.hot;
  }
  // Highlighted edges draw above the rest, hovered ones last so they sit above their neighbours.
  return [...list.filter((e) => !e.hot && !e.highlighted), ...list.filter((e) => !e.hot && e.highlighted), ...list.filter((e) => e.hot)];
});

/** The kinds the drawn column mappings have, in legend order, while lineage is drawn by column. */
const legendKinds = computed<('value' | 'row')[]>(() => {
  if (!props.showLineage || !props.lineageColumns) return [];
  const kinds = new Set<string>();
  for (const e of edgesInRenderOrder.value) {
    const k = e.kind === 'dep' ? (e.edge as DepLineVM).kind : undefined;
    if (k) kinds.add(k);
  }
  return (['value', 'row'] as const).filter((k) => kinds.has(k));
});

const notesInRenderOrder = computed(() => model.value.notes
  .filter((n) => geo.noteBoxes.value.has(n.key))
  .map((n) => ({
    note: n,
    box: geo.noteBoxes.value.get(n.key)!,
  })));

// Auto-placement of elements without a stored position. Not while the model lags the text: after
// opening another file it still shows the previous one until the imports arrive, and placing that
// against the new layout would write stray positions into it.
watch([geo.unplacedTables, geo.unplacedNotes, geo.fullSizes, () => props.loading], ([tables, notes, , loading]) => {
  if (loading || (tables.length === 0 && notes.length === 0)) return;
  const changes: PositionChange[] = [];
  // Group boxes count as occupied so new tables and notes land outside existing groups.
  const occupied: Rect[] = [
    ...geo.boxes.value.values(),
    ...geo.noteBoxes.value.values(),
    ...geo.groupBoxes.value.map((g) => g.box),
  ];

  if (tables.length > 0) {
    const groupOrder = new Map(model.value.groups.map((g, i) => [g.key, i]));
    const items = tables.map((key) => {
      const t = model.value.tablesByKey.get(key)!;
      const size = geo.fullSizes.value.get(key)!;
      return {
        key,
        w: size.width,
        h: size.height,
        order: t.order,
        ...(t.groupKey && groupOrder.has(t.groupKey) ? { groupOrder: groupOrder.get(t.groupKey)! } : {}),
      };
    });
    const take = (key: string, pos: Point) => {
      changes.push({
        key,
        x: pos.x,
        y: pos.y,
      });
      const item = items.find((i) => i.key === key)!;
      occupied.push({
        x: pos.x,
        y: pos.y,
        w: item.w,
        h: item.h,
      });
    };
    // Next to a placed table lineage connects them to; the rest packed in columns at the right.
    const placed = new Map([...geo.boxes.value].filter(([k]) => model.value.tablesByKey.has(k)));
    const links = model.value.deps.map((d) => ({
      upstream: d.upstream.tableKey,
      downstream: d.downstream.tableKey,
    }));
    const byLineage = placeByLineage(items, links, placed, occupied);
    for (const [key, pos] of byLineage) take(key, pos);
    for (const [key, pos] of placeNewItems(items.filter((i) => !byLineage.has(i.key)), occupied)) take(key, pos);
  }
  if (notes.length > 0) {
    for (const [key, pos] of placeNewNotes(notes, occupied)) {
      changes.push({
        key,
        x: pos.x,
        y: pos.y,
      });
    }
  }
  if (changes.length > 0) emit('position-change', changes, 'auto');
}, {
  immediate: true,
  flush: 'post',
});

/**
 * Arrange the tables and notes the view shows by group and lineage (see arrange.ts), with the
 * sizes placement uses, and hand the positions to the host; hidden ones stay where they are.
 * With `only`, just those tables are placed, around everything else. False when there is nothing
 * to arrange or the model is behind the text.
 */
function arrange (only?: ReadonlySet<string>): boolean {
  const m = model.value;
  const tables = m.tables.filter((t) => !props.hidden.has(t.key));
  const notes = m.notes.filter((n) => !props.hidden.has(n.key)).map((n) => ({
    key: n.key,
    w: props.positions[n.key]?.w ?? NOTE_W,
    h: props.positions[n.key]?.h ?? NOTE_H,
  }));
  const pending = only && new Set(tables.filter((t) => only.has(t.key)).map((t) => t.key));
  if (props.loading || (tables.length === 0 && notes.length === 0) || pending?.size === 0) return false;
  const input = {
    tables,
    groups: m.groups,
    deps: m.deps,
    sizes: geo.fullSizes.value,
    collapsed: new Map(m.groups
      .filter((g) => props.collapsedGroups.has(g.key))
      .map((g) => [g.key, collapsedGroupSize(measurer.measure(g.name, FONT_GROUP_NAME))])),
    notes,
  };
  const positions = pending
    ? arrangePending({
        ...input,
        current: new Map(Object.entries(props.positions)),
        pending,
      })
    : arrangeByGroup(input).positions;
  // Hand-drawn routes were drawn around the old positions; those relationships go back to automatic routing.
  const shown = new Set(tables.map((t) => t.key));
  const routes = m.refs
    .filter((r) => r.endpoints.every((e) => shown.has(e.tableKey)) && (!pending || r.endpoints.some((e) => pending.has(e.tableKey))))
    .map((r) => r.key);
  emit('arrange', [...positions].map(([key, p]) => ({
    key,
    x: p.x,
    y: p.y,
  })), routes);
  // Placing a few tables leaves the view where it is; a whole new arrangement is fitted.
  if (!pending) refit();
  return true;
}

// Keep the diagram fitted while the pane is still settling (fonts, editor, split sizes) until the
// user zooms, pans, or drags. After that the viewport is theirs.
let autoFit = true;
function stopAutoFit () {
  autoFit = false;
}

/**
 * Fit the whole diagram once positions just handed to the host are in, never zooming past 100%,
 * and keep it fitted like the first time, as the pane may still be settling (a view opened as the
 * page loads), until the user zooms, pans, or drags.
 */
function refit () {
  autoFit = true;
  nextTick(() => pz.fitTo(geo.contentBounds.value, 1));
}
watch([geo.contentBounds, pz.viewSize], ([bounds, size]) => {
  if (!autoFit || !bounds || size.w === 0 || size.h === 0) return;
  if (geo.unplacedTables.value.length > 0) return;
  // Never zoom past 1:1 on the initial fit; small diagrams should not look blown up.
  pz.fitTo(bounds, 1);
}, {
  immediate: true,
  flush: 'post',
});

// An update marked what it added. Zoom and pan stay where they are, except to bring the new tables
// into view once placed, if they landed off screen.
let toShow: ReadonlySet<TableKey> | null = null;
watch(() => props.marked, (marked, before) => {
  if (marked.size === 0) return;
  // Kept fitted: the fit follows the diagram as it grows, until the user pans or zooms.
  if (props.revealAdded === 'fit' && autoFit) return;
  stopAutoFit();
  if (props.revealAdded === 'none') return;
  // The tables this update added, not those still lit from the one before.
  const tables = [...marked].filter((k) => !before?.has(k) && model.value.tablesByKey.has(k) && !props.hidden.has(k));
  toShow = tables.length > 0 ? new Set(tables) : null;
});
watch([() => props.marked, geo.boxes], () => {
  if (!toShow) return;
  const boxes = [...toShow].map((k) => geo.boxes.value.get(k));
  if (boxes.some((b) => !b)) return;
  toShow = null;
  pz.panToShow(union(boxes as Rect[])!);
}, {
  flush: 'post',
});

/** Where a table, field, group, note, or edge is in diagram coordinates; null when it is not drawn. */
function worldRectOf (key: string): Rect | null {
  const m = model.value;
  const box = geo.boxes.value.get(key) ?? geo.noteBoxes.value.get(key);
  if (box) return box;
  const group = geo.groupBoxes.value.find((g) => g.group.key === key);
  if (group) return group.box;
  // An edge: its route's extent. A mapping of one kind is drawn by its column pair.
  const route = geo.routes.value.get(key) ?? geo.routes.value.get(key.replace(/#[^#]*$/, ''));
  if (route) {
    const xs = route.points.map((p) => p.x);
    const ys = route.points.map((p) => p.y);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    };
  }
  for (const t of m.tables) {
    if (!t.fields.some((f) => f.key === key)) continue;
    const tableBox = geo.boxes.value.get(t.key);
    const idx = geo.rowsByTable.value.get(t.key)?.findIndex((f) => f.key === key) ?? -1;
    return tableBox && idx >= 0
      ? {
          x: tableBox.x,
          y: tableBox.y + ROW_H * (idx + 1),
          w: tableBox.w,
          h: ROW_H,
        }
      : null;
  }
  return null;
}

/** Where a host's chip is drawn, in client coordinates; null when it is not drawn. */
function chipRect (tableKey: string, id: string): Rect | null {
  const box = geo.boxes.value.get(tableKey);
  const chip = geo.sizes.value.get(tableKey)?.chips.find((c) => c.chip.id === id);
  if (!box || !chip) return null;
  return toClient({
    x: box.x + chip.x,
    y: box.y + (ROW_H - PARTIAL_BADGE_H) / 2,
    w: chip.w,
    h: PARTIAL_BADGE_H,
  });
}

/** Where an element is drawn, in client coordinates; null when it is not drawn. */
function rectOf (key: string): Rect | null {
  return toClient(worldRectOf(key));
}

/** A rectangle in diagram coordinates as it is drawn, in client coordinates. */
function toClient (world: Rect | null): Rect | null {
  const pane = root.value?.getBoundingClientRect();
  if (!world || !pane) return null;
  const vp = pz.viewport.value;
  const p = worldToScreen(vp, world);
  return {
    x: pane.left + p.x,
    y: pane.top + p.y,
    w: world.w * vp.k,
    h: world.h * vp.k,
  };
}

/** Fit the view to these elements, or to the whole diagram; the viewport is the user's from then on. */
function fit (keys?: readonly string[]) {
  stopAutoFit();
  if (!keys) {
    pz.fitTo(geo.contentBounds.value);
    return;
  }
  const rects = keys.map(worldRectOf).filter((r): r is Rect => r !== null);
  if (rects.length) pz.fitTo(union(rects));
}

/** Pan and zoom to a viewport; what is left out stays. */
function setViewport (next: Partial<DiagramViewport>) {
  stopAutoFit();
  const vp = pz.viewport.value;
  pz.viewport.value = {
    x: next.x ?? vp.x,
    y: next.y ?? vp.y,
    k: clampZoom(next.zoom ?? vp.k),
  };
}

/** The drawn element of a table, field, group, note, or edge, by key. */
function element (key: string): Element | null {
  return root.value?.querySelector(`[data-key="${key.replace(/["\\]/g, '\\$&')}"]`) ?? null;
}

// Entering or leaving the lineage layout changes every position: refit once the new geometry is in.
watch(() => props.lineageLayout, () => {
  autoFit = true;
  nextTick(() => pz.fitTo(geo.contentBounds.value, 1));
});

const cssVars = computed(() => paletteToCssVars(props.dark ? DARK : LIGHT));

defineExpose({
  fitToScreen: () => fit(),
  fit,
  rectOf,
  viewport,
  setViewport,
  resetZoom: () => {
    stopAutoFit();
    pz.reset(geo.contentBounds.value);
  },
  zoomIn: () => {
    stopAutoFit();
    pz.zoomIn();
  },
  zoomOut: () => {
    stopAutoFit();
    pz.zoomOut();
  },
  arrange,
  refit,
  element,
});
</script>

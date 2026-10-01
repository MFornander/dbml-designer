<template>
  <g
    class="dg-table"
    :class="{ 'is-highlighted': highlighted, 'is-selected': selected, 'is-dragging': isDragging, 'is-dimmed': dimmed, 'is-accent': accent }"
    :data-key="table.key"
    :transform="`translate(${box.x} ${box.y})`"
    :style="headerTextVars"
    @pointerenter="onEnter"
    @pointerleave="onLeave"
    @pointerdown="onDown"
  >
    <rect
      class="dg-table-shadow"
      x="0"
      :y="TABLE_SHADOW_DY"
      :width="w"
      :height="h"
      :rx="TABLE_RADIUS"
    />
    <rect
      class="dg-table-body"
      x="0"
      y="0"
      :width="w"
      :height="h"
      :rx="TABLE_RADIUS"
    />
    <path
      v-if="rows.length > 0"
      class="dg-table-header"
      :d="headerPath"
      :style="headerStyle"
    />
    <rect
      v-else
      class="dg-table-header"
      x="0"
      y="0"
      :width="w"
      :height="ROW_H"
      :rx="TABLE_RADIUS"
      :style="headerStyle"
    />

    <template v-if="lod !== 'structure'">
      <text
        v-if="lod === 'full'"
        class="dg-table-name"
        :x="PAD_X"
        :y="ROW_H / 2"
      >{{ table.name }}</text>
      <!-- The schema, faded and right-aligned, for tables outside the default schema -->
      <text
        v-if="lod === 'full' && size.schemaW > 0"
        class="dg-table-schema"
        :x="w - PAD_X - gridRight - (showGear ? GEAR_SIZE + ICON_GAP : 0)"
        :y="ROW_H / 2"
      >{{ table.schema }}</text>
      <rect
        v-if="lod === 'minimal' && !nameLines.length"
        class="dg-placeholder"
        :x="PAD_X"
        :y="(ROW_H - placeholderH) / 2"
        :width="Math.min(size.headerW, w - 2 * PAD_X)"
        :height="placeholderH"
        rx="2"
      />
      <use
        v-if="showHeaderIcon && lod === 'full'"
        href="#dg-icon-note"
        class="dg-icon dg-icon-header"
        :x="PAD_X + size.nameW + ICON_GAP"
        :y="(ROW_H - ICON_W) / 2"
        :width="ICON_W"
        :height="ICON_W"
      />
      <template v-if="lod === 'full'">
        <!-- The grid's headings: each record's label over its column, the whole label on hover; "+N" opens the rest -->
        <template v-if="size.grid">
          <!-- The whole label is the native tooltip of the group, so the text holds only what is drawn -->
          <g
            v-for="col in size.grid.columns"
            :key="col.record"
          >
            <title>{{ col.title }}</title>
            <text
              class="dg-grid-heading"
              :class="{ 'is-highlighted': litRecords.has(col.record) }"
              :x="gridLeft + col.x + col.w"
              :y="ROW_H / 2"
              text-anchor="end"
              :style="{ fill: headerTextColor }"
            >{{ col.heading }}</text>
          </g>
          <g
            v-if="size.grid.more"
            class="dg-grid-more"
            :class="{ 'is-highlighted': hiddenLit }"
            role="button"
            :aria-label="`Show all ${table.records?.length ?? 0} rows of ${table.name}`"
            :transform="`translate(${gridLeft + size.grid.more.x} ${(ROW_H - PARTIAL_BADGE_H) / 2})`"
            :style="{ color: headerTextColor }"
            @pointerdown.stop
            @click.stop="ctx.toggleRecords(table.key)"
          >
            <rect
              class="dg-records-badge-bg"
              x="0.5"
              y="0.5"
              :width="size.grid.more.w - 1"
              :height="PARTIAL_BADGE_H - 1"
              rx="4"
            />
            <text
              class="dg-records-badge-text"
              :x="size.grid.more.w / 2"
              :y="PARTIAL_BADGE_H / 2"
              text-anchor="middle"
            >{{ size.grid.more.label }}</text>
          </g>
        </template>
        <!-- The host's chips: outlined for what does not change, filled for what does -->
        <g
          v-for="c in size.chips"
          :key="c.chip.id"
          class="dg-chip"
          :class="{ 'is-outline': c.chip.outline }"
          :data-chip="c.chip.id"
          :transform="`translate(${c.x} ${(ROW_H - PARTIAL_BADGE_H) / 2})`"
          :style="chipStyle(c.chip)"
          @pointerenter="onChipEnter(c.chip.id)"
          @pointerleave="onBadgeLeave"
        >
          <rect
            class="dg-chip-bg"
            x="0.5"
            y="0.5"
            :width="c.w - 1"
            :height="PARTIAL_BADGE_H - 1"
            :rx="(PARTIAL_BADGE_H - 1) / 2"
          />
          <text
            class="dg-chip-text"
            :x="c.w / 2"
            :y="PARTIAL_BADGE_H / 2"
            text-anchor="middle"
          >{{ c.text }}</text>
        </g>
        <!-- A badge per companion folded into this table: dashed while folded, solid while it is shown; a click toggles it -->
        <g
          v-for="c in size.companions"
          :key="c.key"
          class="dg-companion-badge"
          :class="{ 'is-open': ctx.unfolded.value.has(c.key) }"
          :data-companion="c.key"
          :transform="`translate(${c.x} ${(ROW_H - PARTIAL_BADGE_H) / 2})`"
          :style="{ color: headerTextColor }"
          @pointerenter="onCompanionEnter(c.key)"
          @pointerleave="onBadgeLeave"
        >
          <rect
            class="dg-partial-badge-bg"
            x="0.5"
            y="0.5"
            :width="c.w - 1"
            :height="PARTIAL_BADGE_H - 1"
            rx="4"
          />
          <text
            class="dg-partial-badge-text"
            :x="c.w / 2"
            :y="PARTIAL_BADGE_H / 2"
            text-anchor="middle"
          >{{ c.label }}</text>
        </g>
        <!-- One badge per partial whose refs are not drawn as lines; hovering it draws them and lights up what they reach -->
        <g
          v-for="b in size.badges"
          :key="b.partial"
          class="dg-partial-badge"
          :class="{ 'is-highlighted': highlightedPartials.has(b.partial) }"
          :data-partial="b.partial"
          :transform="`translate(${b.x} ${(ROW_H - PARTIAL_BADGE_H) / 2})`"
          :style="{ color: headerTextColor }"
          @pointerenter="onBadgeEnter(b.partial)"
          @pointerleave="onBadgeLeave"
        >
          <rect
            class="dg-partial-badge-bg"
            x="0.5"
            y="0.5"
            :width="b.w - 1"
            :height="PARTIAL_BADGE_H - 1"
            rx="4"
          />
          <text
            class="dg-partial-badge-text"
            :x="b.w / 2"
            :y="PARTIAL_BADGE_H / 2"
            text-anchor="middle"
          >{{ partialBadgeLabel(b.partial) }}</text>
        </g>
        <!-- The count of the table's records; it opens them as a table -->
        <g
          v-if="size.recordsBadge"
          class="dg-records-badge"
          role="button"
          :aria-label="`Show the ${size.recordsBadge.label} of ${table.name}`"
          :transform="`translate(${size.recordsBadge.x} ${(ROW_H - PARTIAL_BADGE_H) / 2})`"
          :style="{ color: headerTextColor }"
          @pointerdown.stop
          @click.stop="ctx.toggleRecords(table.key)"
        >
          <rect
            class="dg-records-badge-bg"
            x="0.5"
            y="0.5"
            :width="size.recordsBadge.w - 1"
            :height="PARTIAL_BADGE_H - 1"
            rx="4"
          />
          <text
            class="dg-records-badge-text"
            :x="size.recordsBadge.w / 2"
            :y="PARTIAL_BADGE_H / 2"
            text-anchor="middle"
          >{{ size.recordsBadge.label }}</text>
        </g>
      </template>
      <SettingsGear
        v-if="showGear"
        :x="w - PAD_X - gridRight - GEAR_SIZE"
        :y="(ROW_H - GEAR_SIZE) / 2"
        :color="headerTextColor"
        @click="ctx.openColorPicker({ kind: 'table', key: table.key })"
      />
    </template>

    <g
      v-for="(f, i) in rows"
      :key="f.key"
      class="dg-field"
      :data-key="f.key"
      :class="{ 'is-pk': isKeyField(f), 'is-highlighted': highlightedFields.has(f.key), 'is-accent': accentFields.has(f.key) }"
      :transform="`translate(0 ${ROW_H * (i + 1)})`"
      @pointerenter="onFieldEnter(f)"
      @pointerleave="onFieldLeave"
    >
      <rect
        class="dg-field-bg"
        x="0"
        y="0"
        :width="w"
        :height="ROW_H"
      />
      <line
        class="dg-row-sep"
        x1="0"
        y1="0.5"
        :x2="w"
        y2="0.5"
      />
      <template v-if="lod === 'full'">
        <text
          class="dg-field-name"
          :x="PAD_X"
          :y="ROW_H / 2"
        >{{ f.name }}</text>
        <g
          v-if="size.rows[i]?.iconCount"
          class="dg-field-icons"
          :transform="`translate(${PAD_X + (size.rows[i]?.nameW ?? 0) + ICON_GAP} ${(ROW_H - ICON_W) / 2})`"
        >
          <use
            v-for="(icon, j) in fieldIcons(f)"
            :key="icon"
            :href="`#dg-icon-${icon}`"
            class="dg-icon"
            :x="j * (ICON_W + ICON_SPACING)"
            y="0"
            :width="ICON_W"
            :height="ICON_W"
          />
        </g>
        <text
          class="dg-field-type"
          :x="w - PAD_X - shift - (size.rows[i]?.badgesW ?? 0)"
          :y="ROW_H / 2"
          text-anchor="end"
        >{{ f.typeText }}</text>
        <g
          v-for="badge in badgeLayout(f)"
          :key="badge.kind"
          class="dg-badge"
          :transform="`translate(${w - PAD_X - shift - badge.right} ${(ROW_H - BADGE_H) / 2})`"
        >
          <rect
            class="dg-badge-bg"
            x="0"
            y="0"
            :width="badge.w"
            :height="BADGE_H"
            rx="3"
          />
          <text
            class="dg-badge-text"
            :x="badge.w / 2"
            :y="BADGE_H / 2"
            text-anchor="middle"
          >{{ badge.label }}</text>
        </g>
        <!-- The record's value, right of the type; null dimmed -->
        <text
          v-if="size.rows[i]?.value"
          class="dg-field-value"
          :class="`is-${size.rows[i]!.value!.kind}`"
          :x="w - PAD_X"
          :y="ROW_H / 2"
          text-anchor="end"
        >{{ size.rows[i]!.value!.text }}</text>
        <!-- The grid: the field's value in each record shown, each a cell of its own -->
        <template v-if="size.grid">
          <g
            v-for="(col, j) in size.grid.columns"
            :key="col.record"
            class="dg-cell"
            :class="{ 'is-highlighted': isCellLit(f.key, col.record), 'is-accent': ctx.focus.value.accent.has(cellKey(f.key, col.record)) }"
            :data-key="cellKey(f.key, col.record)"
            :transform="`translate(${gridLeft + col.x} 0)`"
            @pointerenter="onCellEnter(f, col.record)"
            @pointerleave="onFieldEnter(f)"
          >
            <rect
              class="dg-cell-bg"
              :x="-GRID_GAP / 2"
              y="3"
              :width="col.w + GRID_GAP"
              :height="ROW_H - 6"
              rx="3"
            />
            <text
              v-if="size.rows[i]?.cells?.[j]"
              class="dg-field-value"
              :class="`is-${size.rows[i]!.cells![j]!.kind}`"
              :x="col.w"
              :y="ROW_H / 2"
              text-anchor="end"
            >{{ size.rows[i]!.cells![j]!.text }}</text>
          </g>
        </template>
      </template>
      <template v-else-if="lod === 'minimal' && !nameLines.length">
        <rect
          class="dg-placeholder"
          :x="PAD_X"
          :y="(ROW_H - placeholderH) / 2"
          :width="size.rows[i]?.nameW ?? 0"
          :height="placeholderH"
          rx="2"
        />
        <rect
          class="dg-placeholder"
          :x="w - PAD_X - shift - (size.rows[i]?.typeW ?? 0)"
          :y="(ROW_H - placeholderH) / 2"
          :width="size.rows[i]?.typeW ?? 0"
          :height="placeholderH"
          rx="2"
        />
      </template>
    </g>

    <!-- Zoomed out: the name, wrapped to the box at a size that stays readable, in place of the fields -->
    <text
      v-if="nameLines.length"
      class="dg-overview-name"
      :font-size="nameSize"
      text-anchor="middle"
    >
      <tspan
        v-for="(line, i) in nameLines"
        :key="i"
        :x="w / 2"
        :y="(h - nameLines.length * nameSize * OVERVIEW_LINE_H) / 2 + (i + 0.5) * nameSize * OVERVIEW_LINE_H"
      >{{ line }}</tspan>
    </text>
    <!-- Zoomed out, chips shrink to dots at the header's right: filled, or a ring for an outlined chip -->
    <template v-if="lod !== 'full'">
      <circle
        v-for="(c, i) in size.chips"
        :key="c.chip.id"
        class="dg-chip-dot"
        :class="{ 'is-outline': c.chip.outline }"
        :cx="w - (DOT_PX * 2 + i * DOT_PX * 3) / k"
        :cy="ROW_H / 2"
        :r="DOT_PX / k"
        :style="{ '--dg-chip-dot': c.chip.color ?? headerTextColor }"
      >
        <title>{{ c.chip.label }}</title>
      </circle>
    </template>
    <rect
      class="dg-table-border"
      x="0.5"
      y="0.5"
      :width="w - 1"
      :height="h - 1"
      :rx="TABLE_RADIUS"
    />
  </g>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { FieldVM, TableChip, TableVM } from '../types';
import { cellKey, parseCellKey, type FieldKey } from '../keys';
import type { Rect } from '../geometry/rect';
import {
  BADGE_GAP, BADGE_H, BADGE_W, fieldBadges, fieldIcons, hasTableDetails, partialBadgeLabel, valueShift, type FieldBadge, type TableSize,
} from '../geometry/tableSize';
import {
  isKeyField, OVERVIEW_LINE_H, OVERVIEW_NAME_PX, overviewLines,
} from '../geometry/lod';
import {
  GEAR_SIZE, GRID_GAP, ICON_GAP, ICON_SPACING, ICON_W, PAD_X, PARTIAL_BADGE_H, PLACEHOLDER_HEIGHT_RATIO, ROW_H, TABLE_RADIUS, TABLE_SHADOW_DY,
  VALUE_GAP,
} from '../geometry/constants';
import { roundedTopRectPath } from '../geometry/pathBuilder';
import { textColorFor } from '../geometry/color';
import { useDiagramContext } from '../state/context';
import { isDimmed } from '../state/focus';
import { sameSet } from '../state/share';
import SettingsGear from './SettingsGear.vue';

const props = defineProps<{
  table: TableVM;
  box: Rect;
  rows: FieldVM[];
  size: TableSize;
  highlighted: boolean;
  highlightedFields: ReadonlySet<FieldKey>;
  /** Part of the current multi-selection. */
  selected?: boolean;
  isDragging: boolean;
}>();

const NO_KEYS: ReadonlySet<string> = new Set();

const ctx = useDiagramContext();
const lod = ctx.lod;
const dimmed = computed(() => isDimmed(ctx.focus.value, props.table.key));
const accent = computed(() => ctx.focus.value.accent.has(props.table.key));
/** The accented fields of this table, the same empty set for most tables so they leave the rest alone. */
const accentFields = computed<ReadonlySet<string>>(() => {
  const accented = ctx.focus.value.accent;
  if (accented.size === 0) return NO_KEYS;
  const own = props.table.fields.filter((f) => accented.has(f.key)).map((f) => f.key);
  return own.length ? new Set(own) : NO_KEYS;
});

const w = computed(() => props.box.w);
const h = computed(() => props.box.h);
const headerPath = computed(() => roundedTopRectPath(props.box.w, ROW_H, TABLE_RADIUS));
const headerStyle = computed(() => ({
  fill: props.table.headerColor ?? props.table.groupColor ?? 'var(--dg-header-bg)',
}));
const placeholderH = ROW_H * PLACEHOLDER_HEIGHT_RATIO;
/** How far the type and its badges sit left of the row's right padding: the width of the value column. */
const shift = computed(() => valueShift(props.size));
/** Zoomed out to `minimal`: the name's size in diagram units, so it is the same on screen at every zoom, and its lines. */
const k = computed(() => ctx.viewport.value.k);
const nameSize = computed(() => OVERVIEW_NAME_PX / k.value);
const nameLines = computed(() => (lod.value === 'minimal' ? overviewLines(props.table.name, w.value, h.value, k.value) : []));
/** A chip dot's radius on screen, in pixels. */
const DOT_PX = 4;
/** Where the grid starts, and how far the header's schema label and gear keep left of its headings. */
const gridLeft = computed(() => (props.size.grid ? w.value - PAD_X - props.size.grid.w : 0));
const gridRight = computed(() => (props.size.grid ? props.size.grid.w + VALUE_GAP : 0));
/** Cells lit by the hover or the host, as records of this table: shown ones light their heading, hidden ones "+N". */
const litCells = computed(() => {
  const out = new Set<string>();
  if (!props.size.grid) return out;
  const fields = new Set(props.table.fields.map((f) => f.key));
  for (const keys of [ctx.highlight.value.cellKeys, ctx.focus.value.lit]) {
    for (const k of keys) {
      const cell = parseCellKey(k);
      if (cell && fields.has(cell.fieldKey)) out.add(k);
    }
  }
  return out;
});
const litRecords = computed(() => new Set([...litCells.value].map((k) => parseCellKey(k)!.row)));
const hiddenLit = computed(() => {
  const shown = new Set(props.size.grid?.columns.map((c) => c.record));
  return [...litRecords.value].some((r) => !shown.has(r));
});
const isCellLit = (field: string, row: number) => litCells.value.has(cellKey(field, row));
const showHeaderIcon = computed(() => hasTableDetails(props.table));

/** The gear shows while this table (or one of its fields or badges) is the hovered or pinned element. */
const showGear = computed(() => {
  if (!ctx.pickColors.value || lod.value !== 'full' || props.isDragging) return false;
  const s = ctx.highlight.value.source;
  if (!s) return false;
  if (s.kind === 'table') return s.key === props.table.key;
  return (s.kind === 'field' || s.kind === 'partial' || s.kind === 'chip' || s.kind === 'companion') && s.tableKey === props.table.key;
});

/**
 * Badges light up with their refs, as the lines they stand in for would: hovering the badge, its
 * table, or a table it references. The same set comes back while its members stay the same, so a
 * hover elsewhere does not re-render this table.
 */
const highlightedPartials = computed<ReadonlySet<string>>((prev) => {
  const refKeys = ctx.highlight.value.refKeys;
  const next = new Set((props.table.partialRefs ?? []).filter((p) => p.refKeys.some((k) => refKeys.has(k))).map((p) => p.partial));
  return prev && sameSet(prev, next) ? prev : next;
});
/**
 * On a colored header, the name, schema label, and note icon take whichever of dark or white text
 * reads better on it (they are drawn with `--dg-header-text`); a plain header keeps the palette's.
 */
const headerTextVars = computed(() => {
  const c = props.table.headerColor ?? props.table.groupColor;
  return c ? { '--dg-header-text': textColorFor(c) } : undefined;
});
const headerTextColor = computed(() => {
  const c = props.table.headerColor ?? props.table.groupColor;
  return c ? textColorFor(c) : '#FFFFFF';
});

const BADGE_LABEL: Record<FieldBadge, string> = {
  nn: 'NN',
  enum: 'E',
};

/** Badges laid out from the right edge inwards; `right` is the distance from the row's right padding to the badge's left. */
function badgeLayout (f: FieldVM): { kind: FieldBadge; label: string; w: number; right: number }[] {
  let right = 0;
  return fieldBadges(f).map((kind) => {
    right += BADGE_W[kind];
    const entry = {
      kind,
      label: BADGE_LABEL[kind],
      w: BADGE_W[kind],
      right,
    };
    right += BADGE_GAP;
    return entry;
  });
}

function onEnter () {
  ctx.setHover({
    kind: 'table',
    key: props.table.key,
  });
}

function onLeave () {
  ctx.clearHover();
}

function onFieldEnter (f: FieldVM) {
  ctx.setHover({
    kind: 'field',
    tableKey: props.table.key,
    fieldKey: f.key,
  });
}

function onCompanionEnter (companion: string) {
  ctx.setHover({
    kind: 'companion',
    tableKey: props.table.key,
    companion,
  });
}

function onCellEnter (f: FieldVM, row: number) {
  ctx.setHover({
    kind: 'field',
    tableKey: props.table.key,
    fieldKey: f.key,
    row,
  });
}

function onFieldLeave () {
  ctx.setHover({
    kind: 'table',
    key: props.table.key,
  });
}

function onChipEnter (chip: string) {
  ctx.setHover({
    kind: 'chip',
    tableKey: props.table.key,
    chip,
  });
}

/** A chip's colors: an outline in its color, or filled with its color and text that reads on it; the header's text color without one. */
function chipStyle (chip: TableChip): Record<string, string | number> {
  const color = chip.color ?? headerTextColor.value;
  if (chip.outline) {
    return {
      '--dg-chip-fill': 'none',
      '--dg-chip-stroke': color,
      '--dg-chip-text': color,
    };
  }
  return chip.color
    ? {
        '--dg-chip-fill': chip.color,
        '--dg-chip-stroke': 'none',
        '--dg-chip-text': textColorFor(chip.color),
      }
    : {
        '--dg-chip-fill': color,
        '--dg-chip-fill-opacity': 0.14,
        '--dg-chip-stroke': 'none',
        '--dg-chip-text': color,
      };
}

function onBadgeEnter (partial: string) {
  ctx.setHover({
    kind: 'partial',
    tableKey: props.table.key,
    partial,
  });
}

// Leaving a badge puts the pointer back on its header; leaving the table as well clears the hover right after.
function onBadgeLeave () {
  onEnter();
}

function onDown (e: PointerEvent) {
  ctx.beginDrag(e, {
    kind: 'table',
    key: props.table.key,
  }, {
    x: props.box.x,
    y: props.box.y,
  });
}
</script>

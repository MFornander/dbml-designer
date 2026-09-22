<template>
  <g
    class="dg-table"
    :class="{ 'is-highlighted': highlighted, 'is-selected': selected, 'is-dragging': isDragging }"
    :data-key="table.key"
    :transform="`translate(${box.x} ${box.y})`"
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
        :x="w - PAD_X - (showGear ? GEAR_SIZE + ICON_GAP : 0)"
        :y="ROW_H / 2"
      >{{ table.schema }}</text>
      <rect
        v-else
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
      <SettingsGear
        v-if="showGear"
        :x="w - PAD_X - GEAR_SIZE"
        :y="(ROW_H - GEAR_SIZE) / 2"
        :color="headerTextColor"
        @click="ctx.openColorPicker({ kind: 'table', key: table.key })"
      />
    </template>

    <g
      v-for="(f, i) in rows"
      :key="f.key"
      class="dg-field"
      :class="{ 'is-pk': isKeyField(f), 'is-highlighted': highlightedFields.has(f.key) }"
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
          :x="w - PAD_X - (size.rows[i]?.badgesW ?? 0)"
          :y="ROW_H / 2"
          text-anchor="end"
        >{{ f.typeText }}</text>
        <g
          v-for="badge in badgeLayout(f)"
          :key="badge.kind"
          class="dg-badge"
          :transform="`translate(${w - PAD_X - badge.right} ${(ROW_H - BADGE_H) / 2})`"
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
      </template>
      <template v-else-if="lod === 'minimal'">
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
          :x="w - PAD_X - (size.rows[i]?.typeW ?? 0)"
          :y="(ROW_H - placeholderH) / 2"
          :width="size.rows[i]?.typeW ?? 0"
          :height="placeholderH"
          rx="2"
        />
      </template>
    </g>

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
import type { FieldVM, TableVM } from '../types';
import type { FieldKey } from '../keys';
import type { Rect } from '../geometry/rect';
import {
  BADGE_GAP, BADGE_H, BADGE_W, fieldBadges, fieldIcons, hasTableDetails, type FieldBadge, type TableSize,
} from '../geometry/tableSize';
import { isKeyField } from '../geometry/lod';
import {
  GEAR_SIZE, ICON_GAP, ICON_SPACING, ICON_W, PAD_X, PLACEHOLDER_HEIGHT_RATIO, ROW_H, TABLE_RADIUS, TABLE_SHADOW_DY,
} from '../geometry/constants';
import { roundedTopRectPath } from '../geometry/pathBuilder';
import { textColorFor } from '../geometry/color';
import { useDiagramContext } from '../state/context';
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

const ctx = useDiagramContext();
const lod = ctx.lod;

const w = computed(() => props.box.w);
const h = computed(() => props.box.h);
const headerPath = computed(() => roundedTopRectPath(props.box.w, ROW_H, TABLE_RADIUS));
const headerStyle = computed(() => ({
  fill: props.table.headerColor ?? props.table.groupColor ?? 'var(--dg-header-bg)',
}));
const placeholderH = ROW_H * PLACEHOLDER_HEIGHT_RATIO;
const showHeaderIcon = computed(() => hasTableDetails(props.table));

/** The gear shows while this table (or one of its fields) is the hovered or pinned element. */
const showGear = computed(() => {
  if (lod.value !== 'full' || props.isDragging) return false;
  const s = ctx.highlight.value.source;
  return !!s && ((s.kind === 'table' && s.key === props.table.key) || (s.kind === 'field' && s.tableKey === props.table.key));
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

function onFieldLeave () {
  ctx.setHover({
    kind: 'table',
    key: props.table.key,
  });
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

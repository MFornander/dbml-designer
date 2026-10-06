<template>
  <g
    class="dg-group"
    :class="{ 'is-collapsed': collapsed, 'is-band': band, 'is-dragging': isDragging, 'is-dimmed': dimmed }"
    :data-key="group.key"
    :transform="`translate(${box.x} ${box.y})`"
  >
    <rect
      class="dg-group-body"
      x="0.5"
      y="0.5"
      :width="box.w - 1"
      :height="box.h - 1"
      :rx="GROUP_RADIUS"
      :style="bodyStyle"
    />
    <g
      class="dg-group-header"
      @pointerenter="onEnter"
      @pointerleave="onLeave"
      @pointerdown="onDown"
    >
      <path
        class="dg-group-header-bg"
        :d="headerPath"
        :style="headerStyle"
      />
      <!-- Collapse toggle at the left of the header, like dbdiagram -->
      <g
        class="dg-group-toggle"
        :transform="`translate(${GROUP_TOGGLE_X} ${(GROUP_HEADER_H - 16) / 2})`"
        role="button"
        :aria-label="collapsed ? 'Expand group' : 'Collapse group'"
        @pointerdown.stop
        @click.stop="ctx.toggleGroup(group.key)"
      >
        <rect
          class="dg-group-toggle-hit"
          x="-2"
          y="0"
          width="20"
          height="16"
          rx="3"
        />
        <path
          class="dg-group-chevron"
          :d="collapsed ? 'M5 3 L12 8 L5 13 Z' : 'M3 5 L13 5 L8 12 Z'"
          :style="nameStyle"
        />
      </g>
      <text
        class="dg-group-name"
        :x="GROUP_NAME_X"
        :y="GROUP_HEADER_H / 2"
        :style="nameStyle"
      >{{ group.name }}</text>
      <use
        v-if="group.note"
        href="#dg-icon-note"
        class="dg-icon dg-group-icon"
        :x="GROUP_NAME_X + nameW + ICON_GAP"
        :y="(GROUP_HEADER_H - ICON_W) / 2"
        :width="ICON_W"
        :height="ICON_W"
        :style="iconStyle"
      />
      <SettingsGear
        v-if="showGear"
        :x="box.w - GROUP_TOGGLE_X - GEAR_SIZE"
        :y="(GROUP_HEADER_H - GEAR_SIZE) / 2"
        :color="gearColor"
        @click="ctx.openColorPicker({ kind: 'group', key: group.key })"
      />
    </g>
    <text
      v-if="collapsed"
      class="dg-group-collapsed-text"
      :x="box.w / 2"
      :y="GROUP_HEADER_H + (box.h - GROUP_HEADER_H) / 2"
      text-anchor="middle"
    >{{ memberCount }} {{ memberCount === 1 ? 'table' : 'tables' }}</text>
    <!-- Zoomed out: the title above the group, at a size that stays readable, cut to the group's width -->
    <g v-if="overviewTitle">
      <title>{{ group.name }}</title>
      <text
        class="dg-overview-group"
        :font-size="OVERVIEW_GROUP_PX / ctx.viewport.value.k"
        x="0"
        :y="-6 / ctx.viewport.value.k"
      >{{ overviewTitle }}</text>
    </g>
  </g>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { GroupVM } from '../types';
import type { Rect } from '../geometry/rect';
import {
  GEAR_SIZE, GROUP_HEADER_H, GROUP_NAME_X, GROUP_RADIUS, GROUP_TOGGLE_X, ICON_GAP, ICON_W,
} from '../geometry/constants';
import { roundedTopRectPath } from '../geometry/pathBuilder';
import { OVERVIEW_GROUP_PX, wrapName } from '../geometry/lod';
import { groupBodyFill, textColorFor } from '../geometry/color';
import { DARK, LIGHT } from '../theme/palette';
import { useDiagramContext } from '../state/context';
import { isDimmed } from '../state/focus';
import SettingsGear from './SettingsGear.vue';

const props = defineProps<{
  group: GroupVM;
  box: Rect;
  /** Measured width of the group name, for placing the note icon. */
  nameW: number;
  dark: boolean;
  collapsed: boolean;
  /** Drawn as a faint band, titled in the group's color, instead of a box with a header. */
  band?: boolean;
  memberCount: number;
  isDragging: boolean;
}>();

const ctx = useDiagramContext();
/** Zoomed out, the title on one line no wider than the group, so it never runs into the next group's. */
const overviewTitle = computed(() => {
  if (ctx.lod.value === 'full') return '';
  const charW = 0.6 * OVERVIEW_GROUP_PX / ctx.viewport.value.k;
  const name = props.group.name;
  const fits = Math.floor(props.box.w / charW);
  if (name.length <= fits) return name;
  return wrapName(name.replace(/\s+/g, ' '), fits, 1)[0] ?? '';
});
const dimmed = computed(() => isDimmed(ctx.focus.value, props.group.key));

const headerPath = computed(() => roundedTopRectPath(props.box.w, GROUP_HEADER_H, GROUP_RADIUS));

const bodyStyle = computed(() => (props.group.color
  ? {
      fill: groupBodyFill(props.group.color, props.dark),
      ...(props.band ? {} : { stroke: props.group.color }),
    }
  : undefined));

const headerStyle = computed(() => (props.group.color && !props.band ? { fill: props.group.color } : undefined));

/** The title's color: readable on the header's color, or on a band, the group's color itself. */
const nameColor = computed(() => {
  const c = props.group.color;
  if (!c) return undefined;
  return props.band ? c : textColorFor(c);
});
const nameStyle = computed(() => (nameColor.value ? { fill: nameColor.value } : undefined));
const gearColor = computed(() => nameColor.value ?? (props.dark ? DARK : LIGHT).groupName);

const showGear = computed(() => {
  if (!ctx.pickColors.value || props.isDragging) return false;
  const s = ctx.highlight.value.source;
  return !!s && s.kind === 'group' && s.key === props.group.key;
});
const iconStyle = computed(() => (nameColor.value ? { stroke: nameColor.value } : undefined));

function onEnter () {
  ctx.setHover({
    kind: 'group',
    key: props.group.key,
  });
}

function onLeave () {
  ctx.clearHover();
}

function onDown (e: PointerEvent) {
  ctx.beginDrag(e, {
    kind: 'group',
    key: props.group.key,
  }, {
    x: props.box.x,
    y: props.box.y,
  });
}
</script>

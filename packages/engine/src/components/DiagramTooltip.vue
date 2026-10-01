<template>
  <div
    v-if="content && anchor"
    ref="el"
    class="dg-tooltip"
    :style="style"
  >
    <div class="dg-tooltip-header">
      <component
        :is="icon"
        class="dg-tooltip-icon"
        weight="bold"
      />
      <div class="dg-tooltip-heading">
        <div class="dg-tooltip-title-row">
          <span class="dg-tooltip-title"><span
            v-if="content.titlePrefix"
            class="dg-tooltip-title-schema"
          >{{ content.titlePrefix }}</span>{{ content.title }}</span>
          <span
            v-if="content.type"
            class="dg-tooltip-type"
            :class="{ 'is-enum': content.typeIsEnum }"
          >{{ content.type }}</span>
        </div>
        <div
          v-if="content.target"
          class="dg-tooltip-target"
        >
          <PhArrowElbowDownRight
            class="dg-tooltip-corner"
            weight="bold"
          />
          <span>{{ content.target }}</span>
        </div>
        <div
          v-if="content.subtitle"
          class="dg-tooltip-subtitle"
        >
          {{ content.subtitle }}
        </div>
      </div>
    </div>

    <template v-if="content.note">
      <div class="dg-tooltip-divider" />
      <div class="dg-tooltip-label dg-tooltip-note-label">
        <span>Note</span>
        <PhBookOpen class="dg-tooltip-book" />
      </div>
      <div
        class="dg-tooltip-note"
        v-html="noteHtml"
      />
    </template>

    <template v-if="content.enumName">
      <div class="dg-tooltip-divider" />
      <div class="dg-tooltip-label">
        Enum <span class="dg-tooltip-enum">{{ content.enumName }}</span>
      </div>
      <ul class="dg-tooltip-list is-enum">
        <li
          v-for="v in content.enumValues"
          :key="v.name"
        >
          {{ v.name }}<span
            v-if="v.note"
            class="dg-tooltip-item-note"
          > — {{ v.note }}</span>
        </li>
      </ul>
    </template>

    <template v-if="content.dbdefault">
      <div class="dg-tooltip-divider" />
      <div class="dg-tooltip-default">
        <span class="dg-tooltip-label">Default</span>
        <span class="dg-tooltip-accent">{{ content.dbdefault }}</span>
      </div>
    </template>

    <template v-if="content.value !== undefined">
      <div class="dg-tooltip-divider" />
      <div class="dg-tooltip-default">
        <span class="dg-tooltip-label">Value</span>
        <span class="dg-tooltip-accent">{{ content.value }}</span>
      </div>
    </template>

    <template v-if="content.primaryKey">
      <div class="dg-tooltip-divider" />
      <div class="dg-tooltip-default">
        <span class="dg-tooltip-label">Primary key</span>
        <span class="dg-tooltip-accent">{{ content.primaryKey }}</span>
      </div>
    </template>

    <template
      v-for="list in lists"
      :key="list.label"
    >
      <div class="dg-tooltip-divider" />
      <div class="dg-tooltip-label">
        {{ list.label }}
      </div>
      <ul class="dg-tooltip-list">
        <li
          v-for="(item, i) in list.items"
          :key="i"
        >
          {{ item }}
        </li>
      </ul>
    </template>

    <template v-if="content.metadata?.length">
      <div class="dg-tooltip-divider" />
      <div class="dg-tooltip-label">
        Metadata
      </div>
      <ul class="dg-tooltip-list is-plain">
        <li
          v-for="[k, v] in content.metadata"
          :key="k"
        >
          <span class="dg-tooltip-meta-key">{{ k }}</span>: <span class="dg-tooltip-meta-value">{{ v }}</span>
        </li>
      </ul>
    </template>
  </div>
</template>

<script setup lang="ts">
import {
  computed, nextTick, ref, useTemplateRef, watch, type Component, type CSSProperties,
} from 'vue';
import {
  PhArrowElbowDownRight, PhArrowsLeftRight, PhBookOpen, PhColumns, PhFlowArrow, PhNote, PhPuzzlePiece, PhSquaresFour, PhTable,
} from '@phosphor-icons/vue';
import { renderNoteMarkdown } from '../util/markdown';
import type { Rect, Size } from '../geometry/rect';
import { BOX_PLACEMENT, CURSOR_PLACEMENT, placeTooltip } from '../geometry/tooltipPlacement';
import type { TooltipContent } from '../state/useTooltip';

const props = defineProps<{
  content: TooltipContent | null;
  /** Anchor in pane pixels: the hovered row, or a point under the cursor for edges. */
  anchor: Rect | null;
  viewSize: Size;
}>();

const ICONS: Record<TooltipContent['kind'], Component> = {
  table: PhTable,
  field: PhColumns,
  partial: PhPuzzlePiece,
  ref: PhArrowsLeftRight,
  dep: PhFlowArrow,
  group: PhSquaresFour,
  note: PhNote,
};

/** Space kept between the tooltip and the pane's top and bottom when capping its height. */
const HEIGHT_MARGIN = 24;

const icon = computed(() => ICONS[props.content?.kind ?? 'table']);
const noteHtml = computed(() => (props.content?.note ? renderNoteMarkdown(props.content.note) : ''));

/** Bulleted sections in dbdiagram's order and wording. */
const lists = computed(() => {
  const c = props.content;
  if (!c) return [];
  const out: { label: string; items: string[] }[] = [];
  const settings = [...(c.flags ?? []), ...(c.lines ?? [])];
  if (settings.length) out.push({ label: 'Settings', items: settings });
  if (c.indexes?.length) out.push({ label: 'Indexes', items: c.indexes });
  if (c.checks?.length) out.push({ label: 'Check constraints', items: c.checks });
  if (c.columns?.length) out.push({ label: 'Column-level', items: c.columns });
  if (c.refs?.length) out.push({ label: 'Refs', items: c.refs });
  if (c.values?.length) out.push({ label: 'Values', items: c.values });
  return out;
});

const el = useTemplateRef<HTMLElement>('el');
const measured = ref<Size | null>(null);

// Measure only when the content changes: edge anchors move with the cursor and do not affect the size.
watch(() => props.content, async () => {
  measured.value = null;
  await nextTick();
  if (el.value) {
    measured.value = {
      w: el.value.offsetWidth,
      h: el.value.offsetHeight,
    };
  }
}, {
  flush: 'post',
});

const style = computed<CSSProperties>(() => {
  const a = props.anchor;
  const m = measured.value;
  const c = props.content;
  const maxHeight = props.viewSize.h > 0 ? `${props.viewSize.h - HEIGHT_MARGIN}px` : undefined;
  if (!a || !m || !c) {
    return {
      left: '0px',
      top: '0px',
      maxHeight,
      visibility: 'hidden',
    };
  }
  const placement = c.kind === 'ref' || c.kind === 'dep' ? CURSOR_PLACEMENT : BOX_PLACEMENT;
  const p = placeTooltip(a, m, props.viewSize, placement);
  return {
    left: `${p.x}px`,
    top: `${p.y}px`,
    maxHeight,
    visibility: 'visible',
  };
});
</script>

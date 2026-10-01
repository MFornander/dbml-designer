<template>
  <g
    class="dg-note"
    :class="{ 'is-dragging': isDragging, 'is-selected': selected, 'is-dimmed': dimmed }"
    :data-key="note.key"
    :transform="`translate(${box.x} ${box.y})`"
    @pointerenter="onEnter"
    @pointerleave="onLeave"
    @pointerdown="onDown"
  >
    <rect
      class="dg-note-paper"
      x="0"
      y="0"
      :width="box.w"
      :height="box.h"
      :rx="NOTE_RADIUS"
      :style="paperStyle"
    />
    <foreignObject
      x="0"
      y="0"
      :width="box.w"
      :height="box.h"
    >
      <div
        xmlns="http://www.w3.org/1999/xhtml"
        class="dg-note-body"
        :style="textStyle"
        @wheel="onBodyWheel"
        v-html="html"
      />
    </foreignObject>
    <SettingsGear
      v-if="showGear"
      :x="box.w - NOTE_GEAR_PAD - GEAR_SIZE"
      :y="NOTE_GEAR_PAD"
      :color="gearColor"
      @click="ctx.openColorPicker({ kind: 'note', key: note.key })"
    />
    <g
      class="dg-note-resize"
      :transform="`translate(${box.w - NOTE_RESIZE_HANDLE} ${box.h - NOTE_RESIZE_HANDLE})`"
      role="button"
      aria-label="Resize note"
      @pointerdown.stop="onResizeDown"
    >
      <rect
        class="dg-note-resize-hit"
        x="0"
        y="0"
        :width="NOTE_RESIZE_HANDLE"
        :height="NOTE_RESIZE_HANDLE"
      />
      <path
        class="dg-note-resize-grip"
        :d="`M${NOTE_RESIZE_HANDLE - 3} 4 L4 ${NOTE_RESIZE_HANDLE - 3} M${NOTE_RESIZE_HANDLE - 3} 9 L9 ${NOTE_RESIZE_HANDLE - 3}`"
        :style="textStyle"
      />
    </g>
  </g>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { NoteVM } from '../types';
import type { Rect } from '../geometry/rect';
import { GEAR_SIZE, NOTE_RADIUS, NOTE_RESIZE_HANDLE } from '../geometry/constants';
import { textColorFor } from '../geometry/color';
import { LIGHT } from '../theme/palette';
import { renderNoteMarkdown } from '../util/markdown';
import { useDiagramContext } from '../state/context';
import { isDimmed } from '../state/focus';
import SettingsGear from './SettingsGear.vue';

/** Inset of the gear from the note's top-right corner. */
const NOTE_GEAR_PAD = 8;

const props = defineProps<{
  note: NoteVM;
  box: Rect;
  /** Part of the current multi-selection. */
  selected?: boolean;
  isDragging: boolean;
}>();

const ctx = useDiagramContext();
const dimmed = computed(() => isDimmed(ctx.focus.value, props.note.key));

const html = computed(() => renderNoteMarkdown(props.note.content));
const paperStyle = computed(() => (props.note.color ? { fill: props.note.color } : undefined));
const textStyle = computed(() => (props.note.color
  ? {
      color: textColorFor(props.note.color),
      stroke: textColorFor(props.note.color),
    }
  : undefined));

const gearColor = computed(() => (props.note.color ? textColorFor(props.note.color) : LIGHT.noteText));
const showGear = computed(() => {
  if (!ctx.pickColors.value || props.isDragging) return false;
  const s = ctx.highlight.value.source;
  return !!s && s.kind === 'note' && s.key === props.note.key;
});

function onEnter () {
  ctx.setHover({
    kind: 'note',
    key: props.note.key,
  });
}

function onLeave () {
  ctx.clearHover();
}

/** A note that overflows scrolls its own text; only then is the wheel kept from the canvas zoom. */
function onBodyWheel (e: WheelEvent) {
  const el = e.currentTarget as HTMLElement;
  if (el.scrollHeight > el.clientHeight) e.stopPropagation();
}

function onDown (e: PointerEvent) {
  ctx.beginDrag(e, {
    kind: 'note',
    key: props.note.key,
  }, {
    x: props.box.x,
    y: props.box.y,
  });
}

function onResizeDown (e: PointerEvent) {
  // The "position" carried through the drag is the note's size.
  ctx.beginDrag(e, {
    kind: 'note-resize',
    key: props.note.key,
  }, {
    x: props.box.w,
    y: props.box.h,
  });
}
</script>

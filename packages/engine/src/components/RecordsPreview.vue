<template>
  <div
    ref="el"
    class="dg-records"
    role="dialog"
    :aria-label="`Records of ${title}`"
    :style="style"
    @pointerdown.stop
    @wheel.stop
  >
    <div class="dg-records-title">
      <span>{{ title }}</span>
      <span class="dg-records-count">{{ records.length }} rows</span>
    </div>
    <div class="dg-records-scroll">
      <table class="dg-records-table">
        <thead>
          <tr>
            <th
              v-for="c in columns"
              :key="c"
            >
              {{ c }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(r, i) in shown"
            :key="i"
          >
            <td
              v-for="cell in r"
              :key="cell.column"
              :class="cell.kind ? `is-${cell.kind}` : ''"
              :title="cell.full"
            >
              {{ cell.text }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch, type CSSProperties,
} from 'vue';
import type { ModelRecord } from '../model';
import type { Rect, Size } from '../geometry/rect';
import { BOX_PLACEMENT, placeTooltip } from '../geometry/tooltipPlacement';
import { formatValue, fullValue } from '../geometry/values';

/** A table's records as a table, opened from the count badge in its header. */
const props = defineProps<{
  title: string;
  records: readonly ModelRecord[];
  /** Column order: the table's fields that any record names, then any other names the records use. */
  columns: readonly string[];
  /** Anchor in pane pixels: the table's header. */
  anchor: Rect;
  viewSize: Size;
}>();

const emit = defineEmits<{
  close: [];
}>();

/** Enough rows to read; a very large sample would only slow the page down. */
const MAX_ROWS = 500;

const shown = computed(() => props.records.slice(0, MAX_ROWS).map((r) => props.columns.map((column) => {
  if (!Object.prototype.hasOwnProperty.call(r, column)) {
    return {
      column,
      text: '',
      full: '',
      kind: '',
    };
  }
  const v = r[column]!;
  const f = formatValue(v);
  return {
    column,
    text: f.text,
    full: fullValue(v),
    kind: f.kind,
  };
})));

const el = useTemplateRef<HTMLElement>('el');
const measured = ref<Size | null>(null);

async function measure (): Promise<void> {
  await nextTick();
  if (el.value) {
    measured.value = {
      w: el.value.offsetWidth,
      h: el.value.offsetHeight,
    };
  }
}
watch(() => [props.records, props.columns], measure);

const style = computed<CSSProperties>(() => {
  const m = measured.value;
  if (!m) {
    return {
      left: '0px',
      top: '0px',
      visibility: 'hidden',
    };
  }
  const p = placeTooltip(props.anchor, m, props.viewSize, BOX_PLACEMENT);
  return {
    left: `${p.x}px`,
    top: `${p.y}px`,
    visibility: 'visible',
  };
});

// Dismissal: a press anywhere outside (except on a records badge, which toggles it) or Escape.
function onWindowPointerDown (e: PointerEvent): void {
  const t = e.target as Element | null;
  if (!t || el.value?.contains(t) || t.closest?.('.dg-records-badge')) return;
  emit('close');
}

function onKeyDown (e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close');
}

onMounted(() => {
  void measure();
  window.addEventListener('pointerdown', onWindowPointerDown, true);
  window.addEventListener('keydown', onKeyDown);
});

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onWindowPointerDown, true);
  window.removeEventListener('keydown', onKeyDown);
});
</script>

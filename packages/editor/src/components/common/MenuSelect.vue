<template>
  <div
    ref="root"
    class="relative inline-block"
  >
    <button
      type="button"
      class="flex h-6 items-center gap-1 rounded px-1 text-[13px] text-gray-800 hover:bg-gray-200/70 cursor-pointer dark:text-gray-100 dark:hover:bg-white/10"
      :title="title"
      :aria-label="name"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click.stop="toggle"
    >
      <component
        :is="icon"
        v-if="icon"
        class="w-3.5 h-3.5 shrink-0 text-gray-700 dark:text-gray-200"
      />
      <span
        v-if="label"
        class="text-gray-500 dark:text-gray-400"
      >{{ label }}</span>
      <span class="truncate">{{ selectedLabel }}</span>
      <PhCaretDown
        class="w-3 h-3 shrink-0 text-gray-400 transition-transform"
        :class="{ 'rotate-180': open }"
      />
    </button>
    <div
      v-if="open"
      :class="[MENU_PANEL, 'fixed z-40 min-w-[10rem] max-w-[16rem]']"
      :style="menuStyle"
      role="listbox"
      :aria-label="name"
    >
      <button
        v-for="opt in options"
        :key="opt.value"
        type="button"
        role="option"
        :aria-selected="opt.value === modelValue"
        :class="[MENU_ITEM, opt.value === modelValue ? MENU_ACTIVE : '']"
        @click.stop="select(opt.value)"
      >
        <span :class="MENU_SLOT">
          <PhCheck
            v-if="opt.value === modelValue"
            class="w-4 h-4"
            weight="bold"
          />
        </span>
        <span class="truncate">{{ opt.label }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts" generic="T extends string">
import { computed, useTemplateRef, type Component } from 'vue';
import { PhCaretDown, PhCheck } from '@phosphor-icons/vue';
import {
  MENU_ACTIVE, MENU_ITEM, MENU_PANEL, MENU_SLOT,
} from './menuStyles';
import { useFixedMenu } from './useFixedMenu';

/**
 * A select drawn as a menu: a slim trigger (icon, caption, current choice, caret) for toolbars,
 * and a list in the app's one menu style with a check on the current choice.
 */
const props = defineProps<{
  options: ReadonlyArray<{ value: T; label: string }>;
  modelValue: T;
  /** Caption before the current choice, like "Table" or "Lineage". */
  label?: string;
  icon?: Component;
  /** What the control is called for assistive technology. */
  name: string;
  title?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: T];
}>();

/** Roughly one row per option plus the panel's padding; decides whether the list opens upward. */
const ROW_PX = 30;

const root = useTemplateRef<HTMLElement>('root');
const {
  open, menuStyle, toggle, close,
} = useFixedMenu(root, { roomPx: props.options.length * ROW_PX + 12 });

const selectedLabel = computed(() => props.options.find((o) => o.value === props.modelValue)?.label ?? '');

function select (value: T) {
  emit('update:modelValue', value);
  close();
}
</script>

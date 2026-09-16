<!-- Adapted from holistics/dbml dbml-playground (src/components/common/DropdownSelect.vue), Apache-2.0. See NOTICE. -->
<template>
  <div
    ref="root"
    class="relative inline-block"
  >
    <button
      type="button"
      class="max-w-[200px] px-2.5 py-1 text-xs border border-gray-200 rounded bg-white text-gray-700 hover:bg-gray-50 cursor-pointer flex items-center gap-1 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click.stop="toggle"
    >
      <span class="truncate">{{ selectedLabel }}</span>
      <PhCaretDown
        class="w-3 h-3 shrink-0 text-gray-400 transition-transform"
        :class="{ 'rotate-180': open }"
      />
    </button>
    <div
      v-if="open"
      :class="[MENU_PANEL, 'fixed z-40 min-w-[8rem] max-w-[16rem]']"
      :style="menuStyle"
      role="listbox"
    >
      <button
        v-for="(option, i) in options"
        :key="i"
        type="button"
        role="option"
        :aria-selected="modelValue === i"
        :class="[MENU_ITEM, modelValue === i ? MENU_ACTIVE : '']"
        @click.stop="select(i)"
      >
        <span :class="MENU_SLOT">
          <PhCheck
            v-if="modelValue === i"
            class="w-4 h-4"
            weight="bold"
          />
        </span>
        <span>{{ option }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from 'vue';
import { PhCaretDown, PhCheck } from '@phosphor-icons/vue';
import {
  MENU_ACTIVE, MENU_ITEM, MENU_PANEL, MENU_SLOT,
} from './menuStyles';
import { useFixedMenu } from './useFixedMenu';

/** A choice among several quick fixes: a small bordered trigger and a list in the app's menu style. */
const props = defineProps<{
  options: readonly string[];
  labels?: readonly string[];
  modelValue: number;
}>();

const emit = defineEmits<{
  'update:modelValue': [index: number];
}>();

/** Space the menu may need below the button before it flips upward instead. */
const MENU_ROOM_PX = 200;

const root = useTemplateRef<HTMLElement>('root');
const {
  open, menuStyle, toggle, close,
} = useFixedMenu(root, { roomPx: MENU_ROOM_PX });

const selectedLabel = computed(() => (props.labels ?? props.options)[props.modelValue] ?? '');

function select (i: number) {
  emit('update:modelValue', i);
  close();
}
</script>

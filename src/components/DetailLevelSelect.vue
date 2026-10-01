<template>
  <MenuSelect
    :options="OPTIONS"
    :model-value="ui.detailLevel"
    label="Table"
    :icon="PhColumns"
    name="Diagram detail level"
    title="Which columns to show"
    @update:model-value="ui.setDetailLevel"
  />
</template>

<script setup lang="ts">
import { PhColumns } from '@phosphor-icons/vue';
import type { DetailLevel } from '@/engine';
import MenuSelect from '@/components/common/MenuSelect.vue';
import { useUiStore } from '@/stores/uiStore';

const OPTIONS: ReadonlyArray<{ value: DetailLevel; label: string }> = [
  { value: 'all', label: 'All fields' },
  { value: 'keys', label: 'Keys only' },
  { value: 'names', label: 'Table names' },
];

const ui = useUiStore();
</script>

<template>
  <MenuSelect
    :options="OPTIONS"
    :model-value="ui.edgeMode"
    label="Lineage"
    :icon="PhFlowArrow"
    name="Connections to draw"
    title="Which connections to draw"
    @update:model-value="ui.setEdgeMode"
  />
</template>

<script setup lang="ts">
import { PhFlowArrow } from '@phosphor-icons/vue';
import MenuSelect from '@/components/common/MenuSelect.vue';
import { useUiStore, type EdgeMode } from '@/stores/uiStore';

// The stored values keep their original 'erd' spelling so persisted preferences stay valid.
const OPTIONS: ReadonlyArray<{ value: EdgeMode; label: string }> = [
  { value: 'erd', label: 'Refs' },
  { value: 'erd+deps', label: 'Refs + Deps' },
  { value: 'deps', label: 'Deps' },
];

const ui = useUiStore();
</script>

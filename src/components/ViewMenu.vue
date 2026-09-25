<template>
  <div
    ref="root"
    class="relative flex items-center gap-1"
  >
    <button
      type="button"
      class="flex items-center gap-1.5 rounded bg-white/10 px-2 py-0.5 text-xs text-gray-200 hover:bg-white/20 cursor-pointer"
      title="Choose the diagram view"
      aria-label="Diagram view"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click="toggle"
    >
      <PhStackSimple class="w-3.5 h-3.5 shrink-0" />
      <span class="text-gray-400">View</span>
      <span class="max-w-[14rem] truncate">{{ views.activeView ?? 'Default' }}</span>
      <PhCaretDown
        class="w-3 h-3 shrink-0 text-gray-400 transition-transform"
        :class="{ 'rotate-180': open }"
      />
    </button>
    <!-- Shows or hides the panel that edits the view; the icon fills in while the panel is out -->
    <button
      type="button"
      class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-300 hover:bg-white/20 hover:text-white cursor-pointer"
      :class="{ 'bg-white/20 text-white': ui.viewsOpen }"
      :title="ui.viewsOpen ? 'Hide the Diagram Views panel' : 'Show the Diagram Views panel'"
      aria-label="Diagram Views panel"
      :aria-pressed="ui.viewsOpen"
      @click="ui.toggleViews"
    >
      <PhSidebarSimple
        class="w-4 h-4 -scale-x-100"
        :weight="ui.viewsOpen ? 'fill' : 'regular'"
      />
    </button>

    <div
      v-if="open"
      :class="[MENU_PANEL, 'absolute right-0 top-full z-30 mt-1 w-64']"
      role="listbox"
      aria-label="Diagram views"
    >
      <button
        v-for="opt in options"
        :key="opt.key"
        type="button"
        :class="[MENU_ITEM, opt.active ? MENU_ACTIVE : '']"
        role="option"
        :aria-selected="opt.active"
        @click="pick(opt.name)"
      >
        <span :class="MENU_SLOT">
          <PhCheck
            v-if="opt.active"
            class="w-4 h-4"
            weight="bold"
          />
        </span>
        <span class="truncate">{{ opt.label }}</span>
      </button>
      <div :class="MENU_DIVIDER" />
      <button
        type="button"
        :class="MENU_ITEM"
        role="option"
        aria-selected="false"
        :disabled="parser.isStale"
        title="Save what is shown now as a new view, named in the panel"
        @click="startCreate"
      >
        <span :class="MENU_SLOT">
          <PhPlus class="w-4 h-4" />
        </span>
        <span>New View</span>
      </button>
      <div :class="MENU_DIVIDER" />
      <button
        type="button"
        :class="MENU_ITEM"
        role="option"
        aria-selected="false"
        :disabled="!canEdit"
        :title="actionTitle('Rename')"
        @click="startRename"
      >
        <span :class="MENU_SLOT">
          <PhPencilSimple class="w-4 h-4" />
        </span>
        <span>Rename…</span>
      </button>
      <button
        type="button"
        :class="MENU_ITEM"
        role="option"
        aria-selected="false"
        :disabled="!views.dirty"
        :title="views.dirty ? 'Discard the unsaved toggles in the panel' : 'No unsaved toggles to discard'"
        @click="reset"
      >
        <span :class="MENU_SLOT">
          <PhArrowCounterClockwise class="w-4 h-4" />
        </span>
        <span>Reset</span>
      </button>
      <button
        type="button"
        :class="MENU_ITEM"
        role="option"
        aria-selected="false"
        :disabled="!canEdit || parser.isStale"
        :title="actionTitle('Delete')"
        @click="remove"
      >
        <span :class="MENU_SLOT">
          <PhTrash class="w-4 h-4" />
        </span>
        <span>Delete</span>
      </button>
      <!-- Layout actions on the active view: its own arrangement changes, the DBML does not -->
      <div :class="MENU_DIVIDER" />
      <button
        type="button"
        :class="MENU_ITEM"
        role="option"
        aria-selected="false"
        :disabled="!canArrange"
        :title="canArrange ? 'Lay out the tables this view shows: table groups as columns in Dep order' : 'Nothing to arrange'"
        @click="arrange"
      >
        <span :class="MENU_SLOT">
          <PhKanban class="w-4 h-4" />
        </span>
        <span>Arrange</span>
      </button>
      <button
        type="button"
        :class="MENU_ITEM"
        role="option"
        aria-selected="false"
        :disabled="newTables === 0"
        :title="newTables > 0 ? 'Place the tables put down automatically since the file was opened by their group and Dep edges, leaving the rest where it is' : 'No tables were put down automatically since the file was opened'"
        @click="arrangeNew"
      >
        <span :class="MENU_SLOT">
          <PhColumnsPlusRight class="w-4 h-4" />
        </span>
        <span>Arrange new tables</span>
        <span
          v-if="newTables > 0"
          :class="MENU_HINT"
        >{{ newTables }}</span>
      </button>
      <button
        type="button"
        :class="MENU_ITEM"
        role="option"
        aria-selected="false"
        :disabled="!layout.canUndoArrange"
        :title="layout.canUndoArrange ? 'Put everything back where it was before Arrange' : 'Only right after Arrange, before anything else moves'"
        @click="undoArrange"
      >
        <span :class="MENU_SLOT">
          <PhArrowUUpLeft class="w-4 h-4" />
        </span>
        <span>Undo arrange</span>
        <span :class="MENU_HINT">⌘Z</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed, onBeforeUnmount, onMounted, ref, useTemplateRef,
} from 'vue';
import {
  PhArrowCounterClockwise, PhArrowUUpLeft, PhCaretDown, PhCheck, PhColumnsPlusRight, PhKanban, PhPencilSimple, PhPlus, PhSidebarSimple,
  PhStackSimple, PhTrash,
} from '@phosphor-icons/vue';
import {
  MENU_ACTIVE, MENU_DIVIDER, MENU_HINT, MENU_ITEM, MENU_PANEL, MENU_SLOT,
} from '@/components/common/menuStyles';
import { useLayoutStore } from '@/stores/layoutStore';
import { useParserStore } from '@/stores/parserStore';
import { useUiStore } from '@/stores/uiStore';
import { useViewStore } from '@/stores/viewStore';
import { useViewActions } from '@/components/useViewActions';

/**
 * The header's view switcher, titled like the bottom toolbar's pickers: the active diagram view
 * with a list of the Default View, every `DiagramView` block, "New View", and Rename and Delete
 * for the active one, then Arrange, Arrange new tables, and Undo arrange for the active view's
 * layout, plus the button that shows or hides the Diagram Views panel where a view is shaped,
 * named, and saved.
 */
const views = useViewStore();
const ui = useUiStore();
const parser = useParserStore();
const layout = useLayoutStore();
const actions = useViewActions();

/** Rename and Delete act on a named view declared in this text; the Default View has neither. */
const canEdit = computed(() => views.view !== null && actions.editable(views.view));
function actionTitle (verb: string): string {
  if (!views.view) return `The Default View cannot be ${verb.toLowerCase()}d`;
  if (!actions.editable(views.view)) return `${views.view.name} is declared in an imported file`;
  return verb === 'Delete' ? `Remove DiagramView ${views.view.name} from the DBML` : `${verb} ${views.view.name}`;
}
const root = useTemplateRef<HTMLElement>('root');
const open = ref(false);

const options = computed(() => [
  {
    key: '',
    name: null as string | null,
    label: 'Default',
    active: views.activeView === null,
  },
  ...views.views.map((v) => ({
    key: v.key,
    name: v.name as string | null,
    label: v.name,
    active: v.name === views.activeView,
  })),
]);

function toggle () {
  open.value = !open.value;
}

function pick (name: string | null) {
  open.value = false;
  views.select(name);
}

/** A new view is shaped and named in the panel, so the panel comes out with its name form open. */
function startCreate () {
  open.value = false;
  ui.setViewsOpen(true);
  views.requestCreate();
}

/** Renaming happens in the panel's name form too. */
function startRename () {
  open.value = false;
  ui.setViewsOpen(true);
  views.requestRename();
}

function remove () {
  open.value = false;
  actions.deleteView(views.view);
}

/** Drop the toggles made in the panel since the view was picked or saved. */
function reset () {
  open.value = false;
  views.revert();
}

/** Something the view shows can be laid out. */
const canArrange = computed(() => {
  const m = views.model;
  return !!m && [...m.tables, ...m.notes].some((e) => !views.hidden.has(e.key));
});

/** Tables auto-placement put down that this view shows and nothing has moved since. */
const newTables = computed(() => (views.model?.tables ?? []).filter((t) => layout.newTables.has(t.key) && !views.hidden.has(t.key)).length);

/** The diagram pane arranges, since it knows the table sizes; the menu only asks. */
function arrange () {
  open.value = false;
  layout.requestArrange('arrange');
}

function arrangeNew () {
  open.value = false;
  layout.requestArrange('arrange-new');
}

function undoArrange () {
  open.value = false;
  layout.requestArrange('undo');
}

function onDocumentPointerDown (e: PointerEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false;
}
function onDocumentKeyDown (e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) open.value = false;
}
onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true);
  document.addEventListener('keydown', onDocumentKeyDown);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true);
  document.removeEventListener('keydown', onDocumentKeyDown);
});
</script>

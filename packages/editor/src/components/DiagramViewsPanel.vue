<template>
  <aside
    class="absolute inset-y-0 right-0 z-20 flex w-80 flex-col border-l border-gray-200 bg-white text-gray-800 shadow-xl dark:border-gray-700 dark:bg-[#2b2d33] dark:text-gray-100"
    aria-label="Diagram views"
  >
    <!-- The title row also saves what is shown; the view itself is picked, renamed, reset, and deleted from the header's View menu. -->
    <div
      ref="menuRoot"
      class="flex items-center gap-1.5 px-4 pt-3 pb-2"
    >
      <h2 class="text-[15px] font-semibold">
        Diagram Views
      </h2>
      <span
        class="text-gray-400"
        title="A view lists the tables and notes it shows. Named views live in the DBML as DiagramView blocks; the Default View shows everything."
      >
        <PhInfo
          class="w-3.5 h-3.5"
          weight="fill"
        />
      </span>
      <div class="relative ml-auto flex items-stretch rounded-md bg-blue-600 text-[13px] font-medium text-white">
        <button
          type="button"
          class="h-8 rounded-l-md px-3.5 hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!canSave"
          :title="saveTitle"
          @click="save"
        >
          Save
        </button>
        <button
          type="button"
          class="flex h-8 w-7 items-center justify-center rounded-r-md border-l border-white/30 hover:bg-blue-500"
          aria-label="Save options"
          aria-haspopup="menu"
          :aria-expanded="openMenu === 'save'"
          title="Save options"
          @click="toggleMenu('save')"
        >
          <PhCaretDown
            class="w-3.5 h-3.5 transition-transform"
            :class="{ 'rotate-180': openMenu === 'save' }"
          />
        </button>
        <div
          v-if="openMenu === 'save'"
          :class="[POPUP, 'right-0 w-36 font-normal']"
          role="menu"
          aria-label="Save options"
        >
          <button
            type="button"
            :class="LIST_ITEM"
            role="menuitem"
            :disabled="parser.isStale"
            title="Save what is shown now as a new view"
            @click="startCreate"
          >
            Save as New
          </button>
        </div>
      </div>
    </div>

    <div class="px-3">
      <form
        v-if="nameForm"
        class="flex gap-2 pb-3"
        @submit.prevent="submitName"
      >
        <input
          ref="nameInput"
          v-model="nameForm.value"
          class="h-8 flex-1 min-w-0 rounded-md border border-gray-300 bg-white px-2 text-[13px] text-gray-800 dark:border-gray-600 dark:bg-[#1f2126] dark:text-gray-100"
          :placeholder="nameForm.mode === 'rename' ? 'New name' : 'New view name'"
          :aria-label="nameForm.mode === 'rename' ? 'New name for the view' : 'New view name'"
          @keydown.esc.prevent="nameForm = null"
        >
        <button
          type="submit"
          class="h-8 rounded-md bg-blue-600 px-3 text-[13px] text-white disabled:opacity-50"
          :disabled="!nameValid || parser.isStale"
        >
          {{ nameForm.mode === 'rename' ? 'Rename' : 'Create' }}
        </button>
      </form>
      <p
        v-if="nameError"
        class="pb-2 text-xs text-red-600 dark:text-red-400"
      >
        {{ nameError }}
      </p>
      <p
        v-if="parser.isStale"
        class="pb-2 text-xs text-yellow-700 dark:text-yellow-300"
      >
        Fix the DBML errors before saving, renaming, or deleting views.
      </p>
    </div>
    <div class="h-px bg-gray-200 dark:bg-white/10" />

    <div class="space-y-2.5 px-3 pt-3 pb-2">
      <label class="flex h-9 items-center rounded-md bg-gray-100 px-3 dark:bg-[#1f2126]">
        <input
          v-model="query"
          type="search"
          placeholder="Search table, schema or group"
          class="flex-1 min-w-0 bg-transparent text-[13px] text-gray-800 placeholder:text-gray-400 focus:outline-none dark:text-gray-100 dark:placeholder:text-gray-400"
          aria-label="Search tables, schemas, and groups"
        >
      </label>
      <div class="flex items-center gap-1">
        <label class="flex h-9 flex-1 items-center gap-2.5 rounded-md bg-gray-100 px-3 text-[13px] dark:bg-[#1f2126]">
          <PhStack class="w-4 h-4 shrink-0 text-gray-500 dark:text-gray-300" />
          <select
            v-model="groupBy"
            class="flex-1 cursor-pointer bg-transparent focus:outline-none"
            aria-label="Group by"
          >
            <option value="schema">
              Group by: Schema
            </option>
            <option value="group">
              Group by: Table Group
            </option>
          </select>
        </label>
        <button
          :class="ICON_BUTTON"
          :title="anyHidden ? 'Show all' : 'Hide all'"
          :aria-label="anyHidden ? 'Show all' : 'Hide all'"
          @click="toggleAll"
        >
          <component
            :is="anyHidden ? PhEyeSlash : PhEye"
            class="w-4 h-4"
          />
        </button>
      </div>
    </div>

    <!-- Rows are inset like the boxes above, so the eye column is the same one the Group by eye sits in.
         Geometry follows dbdiagram: caret at 0, group icon at 16px, label at 42px; a child's glyph starts
         under the group label at 38px and its label at 60px (all from the row's left edge). -->
    <div class="flex-1 min-h-0 overflow-y-auto px-3 pb-2 text-[13px]">
      <div
        v-for="section in sections"
        :key="section.key"
      >
        <div class="flex h-[30px] items-center rounded hover:bg-gray-100 dark:hover:bg-white/5">
          <button
            class="flex h-7 w-3 shrink-0 items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-white"
            :aria-label="collapsed.has(section.key) ? `Expand ${section.label}` : `Collapse ${section.label}`"
            @click="toggleCollapsed(section.key)"
          >
            <PhCaretDown
              class="w-3 h-3 transition-transform"
              :class="{ '-rotate-90': collapsed.has(section.key) }"
              weight="fill"
            />
          </button>
          <component
            :is="section.icon"
            class="ml-1 w-4 h-4 shrink-0"
            :style="section.color ? { color: section.color } : undefined"
          />
          <span class="ml-2.5 min-w-0 flex-1 truncate">{{ section.label }}</span>
          <span class="ml-auto mr-2 shrink-0 rounded-full bg-gray-200 px-2 text-[11px] leading-[18px] text-gray-700 dark:bg-white/10 dark:text-gray-300">
            {{ section.visible }}/{{ section.items.length }}
          </span>
          <button
            :class="ICON_BUTTON"
            :aria-label="section.visible === 0 ? `Show all in ${section.label}` : `Hide all in ${section.label}`"
            @click="views.setHidden(section.items.map((i) => i.key), section.visible > 0)"
          >
            <component
              :is="section.visible === 0 ? PhEyeSlash : PhEye"
              class="w-4 h-4"
            />
          </button>
        </div>
        <div v-if="!collapsed.has(section.key)">
          <div
            v-for="item in section.items"
            :key="item.key"
            class="flex h-[30px] items-center rounded pl-[38px] hover:bg-gray-100 dark:hover:bg-white/5"
            :class="{ 'opacity-50': item.hidden }"
            :data-key="item.key"
            :title="item.title"
          >
            <svg
              v-if="item.kind === 'table'"
              class="h-3.5 w-3.5 shrink-0"
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <rect
                x="1.5"
                y="1.5"
                width="13"
                height="13"
                rx="2.5"
                fill="none"
                :stroke="item.color"
                stroke-width="1.6"
              />
              <path
                d="M1.5 5.5h13"
                :stroke="item.color"
                stroke-width="1.6"
              />
            </svg>
            <PhNote
              v-else
              class="h-3.5 w-3.5 shrink-0"
              :style="{ color: item.color }"
            />
            <span class="ml-2 min-w-0 flex-1 truncate">{{ item.label }}</span>
            <button
              :class="[ICON_BUTTON, 'ml-auto']"
              :aria-label="item.hidden ? `Show ${item.label}` : `Hide ${item.label}`"
              @click="views.toggle(item.key)"
            >
              <component
                :is="item.hidden ? PhEyeSlash : PhEye"
                class="w-4 h-4"
              />
            </button>
          </div>
        </div>
      </div>
      <p
        v-if="sections.length === 0"
        class="px-3 py-4 text-center text-xs text-gray-500"
      >
        Nothing matches.
      </p>
    </div>

    <div
      v-if="chips.length"
      class="flex flex-wrap gap-2 border-t border-gray-200 px-3 py-3 dark:border-white/10"
    >
      <span
        v-for="c in shownChips"
        :key="c.key"
        class="inline-flex items-center gap-1.5 rounded-full border border-blue-500/40 bg-blue-500/10 px-2.5 py-0.5 text-xs text-blue-700 dark:border-blue-400/30 dark:bg-[#2a3350] dark:text-blue-200"
      >
        <component
          :is="c.icon"
          class="w-3 h-3"
        />{{ c.label }}
      </span>
      <span
        v-if="moreChips > 0"
        class="rounded-full border border-blue-500/40 bg-blue-500/10 px-2.5 py-0.5 text-xs text-blue-700 dark:border-blue-400/30 dark:bg-[#2a3350] dark:text-blue-200"
      >+{{ moreChips }}</span>
    </div>
  </aside>
</template>

<script setup lang="ts">
import {
  computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch, type Component,
} from 'vue';
import {
  PhCaretDown, PhEye, PhEyeSlash, PhInfo, PhNote, PhSquaresFour, PhStack, PhTable, PhTreeStructure,
} from '@phosphor-icons/vue';
import { type DiagramModel, type TableVM, visibleEntities } from '@dbml-designer/engine';
import { diagramViewText, renameDiagramView, upsertDiagramView } from '@/editor/viewText';
import { useTextEdits } from '@/editor/useTextEdits';
import { MENU_ITEM, MENU_PANEL } from '@/components/common/menuStyles';
import { useParserStore } from '@/stores/parserStore';
import { useLayoutStore } from '@/stores/layoutStore';
import { useViewStore } from '@/stores/viewStore';
import { useViewActions } from '@/components/useViewActions';

/**
 * dbdiagram's Diagram Views panel: toggle what the active view shows and save the result back
 * into the DBML as a `DiagramView` block. The view itself is picked, renamed, and deleted from
 * the header's View menu, which hands naming and renaming over to the form here.
 */
const props = defineProps<{ model: DiagramModel }>();

const ICON_BUTTON = 'h-7 w-7 flex items-center justify-center rounded text-gray-500 hover:bg-gray-200/70 hover:text-gray-800 cursor-pointer dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white';
/** The list that drops from the Save arrow shares the app's one menu style. */
const POPUP = [MENU_PANEL, 'absolute top-full z-10 mt-2 overflow-hidden'];
const LIST_ITEM = MENU_ITEM;
const DEFAULT_HEADER = '#316896';
const DEFAULT_NOTE = '#FFE28B';
const MAX_CHIPS = 6;

const views = useViewStore();
const layout = useLayoutStore();
const parser = useParserStore();
const textEdits = useTextEdits();
const { rangeOf, editable } = useViewActions();

// The Save arrow's list; the type stays open for more.
type Menu = 'save';
const openMenu = ref<Menu | null>(null);
const menuRoot = useTemplateRef<HTMLElement>('menuRoot');

function toggleMenu (menu: Menu) {
  openMenu.value = openMenu.value === menu ? null : menu;
}

function onDocumentPointerDown (e: PointerEvent) {
  if (openMenu.value && menuRoot.value && !menuRoot.value.contains(e.target as Node)) openMenu.value = null;
}
function onDocumentKeyDown (e: KeyboardEvent) {
  if (e.key === 'Escape' && openMenu.value) openMenu.value = null;
}
onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true);
  document.addEventListener('keydown', onDocumentKeyDown);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true);
  document.removeEventListener('keydown', onDocumentKeyDown);
});

/** Naming a new view or renaming the current one, in a small form under the buttons. */
interface NameForm {
  mode: 'create' | 'rename';
  value: string;
}
const nameForm = ref<NameForm | null>(null);
const nameInput = useTemplateRef<HTMLInputElement>('nameInput');
const nameError = ref<string | null>(null);
const query = ref('');
const groupBy = ref<'schema' | 'group'>('schema');
const collapsed = shallowRef<ReadonlySet<string>>(new Set());

function toggleCollapsed (key: string) {
  const next = new Set(collapsed.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  collapsed.value = next;
}

interface Item {
  key: string;
  kind: 'table' | 'note';
  label: string;
  /** Tooltip: the qualified table name, or the note's name. */
  title: string;
  color: string;
  hidden: boolean;
}
interface Section {
  key: string;
  label: string;
  icon: Component;
  color?: string;
  items: Item[];
  visible: number;
}

const UNGROUPED = 'ungrouped';
const NOTES = 'notes';

const matches = (s: string) => s.toLowerCase().includes(query.value.trim().toLowerCase());
const qualified = (t: TableVM) => `${t.schema}.${t.name}`;
/** Sticky notes are listed by their content, like dbdiagram, since that is what you see on the canvas. */
const notePreview = (content: string, fallback: string) => content.replace(/\s+/g, ' ').trim() || fallback;

/** Tables grouped by schema or table group (unnamed last), then the notes; filtered by the search box. */
const sections = computed<Section[]>(() => {
  const m = props.model;
  const buckets = new Map<string, Omit<Section, 'visible' | 'key'>>();
  const add = (key: string, head: Omit<Section, 'visible' | 'key' | 'items'>, item: Item) => {
    if (!matches(item.title) && !matches(item.label) && !matches(head.label)) return;
    const b = buckets.get(key) ?? {
      ...head,
      items: [],
    };
    b.items.push(item);
    buckets.set(key, b);
  };
  for (const t of m.tables) {
    const item: Item = {
      key: t.key,
      kind: 'table',
      label: groupBy.value === 'schema' ? t.name : qualified(t),
      title: qualified(t),
      color: t.headerColor ?? t.groupColor ?? DEFAULT_HEADER,
      hidden: views.hidden.has(t.key),
    };
    if (groupBy.value === 'schema') {
      add(`schema:${t.schema}`, {
        label: t.schema,
        icon: PhTreeStructure,
      }, item);
    } else {
      const g = t.groupKey ? m.groups.find((x) => x.key === t.groupKey) : undefined;
      add(g ? g.key : UNGROUPED, {
        label: g ? g.name : '(no group)',
        icon: PhSquaresFour,
        ...(g?.color ? { color: g.color } : {}),
      }, item);
    }
  }
  for (const n of m.notes) {
    add(NOTES, {
      label: 'Sticky Notes',
      icon: PhNote,
    }, {
      key: n.key,
      kind: 'note',
      label: notePreview(n.content, n.name),
      title: n.name,
      color: n.color ?? DEFAULT_NOTE,
      hidden: views.hidden.has(n.key),
    });
  }
  const order = (key: string) => (key === NOTES ? 2 : key === UNGROUPED ? 1 : 0);
  return [...buckets.entries()]
    .sort(([a], [b]) => order(a) - order(b))
    .map(([key, b]) => ({
      key,
      ...b,
      visible: b.items.filter((i) => !i.hidden).length,
    }));
});

const allKeys = computed(() => [...props.model.tables.map((t) => t.key), ...props.model.notes.map((n) => n.key)]);
const anyHidden = computed(() => views.hidden.size > 0);

function toggleAll () {
  views.setHidden(allKeys.value, !anyHidden.value);
}

/** What the view shows, summarized: a whole schema as one chip, otherwise its visible tables; notes likewise. */
const chips = computed(() => {
  const m = props.model;
  const out: { key: string; icon: Component; label: string }[] = [];
  const bySchema = new Map<string, TableVM[]>();
  for (const t of m.tables) {
    const list = bySchema.get(t.schema) ?? [];
    list.push(t);
    bySchema.set(t.schema, list);
  }
  for (const [schema, tables] of bySchema) {
    const visible = tables.filter((t) => !views.hidden.has(t.key));
    if (visible.length === tables.length) {
      out.push({
        key: `schema:${schema}`,
        icon: PhTreeStructure,
        label: schema,
      });
    } else {
      for (const t of visible) {
        out.push({
          key: t.key,
          icon: PhTable,
          label: qualified(t),
        });
      }
    }
  }
  const notes = visibleEntities(m, views.hidden).notes;
  if (m.notes.length > 0) {
    if (notes.length === m.notes.length) {
      out.push({
        key: NOTES,
        icon: PhNote,
        label: 'All Notes',
      });
    } else {
      for (const n of notes) {
        out.push({
          key: n.key,
          icon: PhNote,
          label: n.name,
        });
      }
    }
  }
  return out;
});
const shownChips = computed(() => chips.value.slice(0, MAX_CHIPS));
const moreChips = computed(() => chips.value.length - shownChips.value.length);

// Saving writes the working set into the DBML as a DiagramView block.
/** DBML reads an empty section as no section, so a view cannot hide every table or every note. */
const unexpressible = computed(() => {
  const v = visibleEntities(props.model, views.hidden);
  if (v.tables.length === 0 && props.model.tables.length > 0) return 'A view cannot hide every table.';
  if (v.notes.length === 0 && props.model.notes.length > 0) return 'A view cannot hide every note.';
  return null;
});
const canSave = computed(() => !parser.isStale && views.view !== null && views.dirty && !unexpressible.value);
const saveTitle = computed(() => {
  if (unexpressible.value) return `${unexpressible.value} Show at least one first`;
  if (!views.view) return 'The Default View shows everything; use the arrow to save these choices as a new view';
  return views.dirty ? `Write these choices into DiagramView ${views.view.name}` : 'No unsaved changes';
});

function blockFor (name: string): string {
  return diagramViewText(name, visibleEntities(props.model, views.hidden), {
    tables: props.model.tables.length,
    notes: props.model.notes.length,
  });
}

function save () {
  const v = views.view;
  if (!v || !canSave.value || !editable(v)) return;
  textEdits.apply(upsertDiagramView(textEdits.text(), rangeOf(v.source), blockFor(v.name)));
  views.adopt(v.name);
}

const nameValid = computed(() => (nameForm.value?.value.trim().length ?? 0) > 0);

/** "New View", or the first "New View N" not taken, like dbdiagram names a fresh view. */
function uniqueName (base: string): string {
  const taken = new Set(props.model.views.map((v) => v.name));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

async function openNameForm (form: NameForm) {
  openMenu.value = null;
  nameError.value = null;
  nameForm.value = form;
  await nextTick();
  nameInput.value?.focus();
  nameInput.value?.select();
}

/** "+ New View" and "Save as New": a view of what is shown now, named in the form. */
function startCreate () {
  if (parser.isStale) return;
  void openNameForm({
    mode: 'create',
    value: uniqueName('New View'),
  });
}

// "New View" and "Rename" in the header's menu open the panel and hand the naming over to it.
watch(() => views.pendingRequest, (request) => {
  if (!request) return;
  views.clearRequest();
  if (request === 'create') startCreate();
  else startRename();
}, {
  immediate: true,
});

function startRename () {
  const v = views.view;
  if (!v) return;
  void openNameForm({
    mode: 'rename',
    value: v.name,
  });
}

function submitName () {
  const form = nameForm.value;
  if (!form || parser.isStale) return;
  const name = form.value.trim();
  if (!name) return;
  const current = views.view;
  if (form.mode === 'rename' && current && name === current.name) {
    nameForm.value = null;
    return;
  }
  if (props.model.views.some((v) => v.name === name)) {
    nameError.value = `A view named "${name}" already exists.`;
    return;
  }
  if (form.mode === 'create') {
    if (unexpressible.value) {
      nameError.value = unexpressible.value;
      return;
    }
    textEdits.apply(upsertDiagramView(textEdits.text(), null, blockFor(name)));
    // A view saved from another named view starts out arranged like it.
    if (current) layout.copyView(current.name, name);
  } else {
    const range = current ? rangeOf(current.source) : null;
    if (!current || !range || !editable(current)) return;
    textEdits.apply(renameDiagramView(textEdits.text(), range, name));
    layout.renameView(current.name, name);
  }
  // The header shows the active name right away; the next parse brings the block itself.
  views.adopt(name);
  nameError.value = null;
  nameForm.value = null;
}

</script>

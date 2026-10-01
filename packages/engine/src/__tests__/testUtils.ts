import { computed, ref, shallowRef } from 'vue';
import type { DiagramContext } from '../state/context';
import type { HoverTarget } from '../state/useHover';
import type { DragTarget } from '../state/useDrag';
import { IDENTITY_VIEWPORT } from '../geometry/viewport';
import type {
  AutoLod, ColorTarget, FieldVM, TableVM,
} from '../types';
import { NO_FOCUS } from '../state/focus';

export interface TestContext extends DiagramContext {
  hovers: (HoverTarget | null)[];
  pins: HoverTarget[];
  drags: DragTarget[];
  toggled: string[];
  colorPicks: ColorTarget[];
  recordsOpened: string[];
  setLod (lod: AutoLod): void;
}

export function makeContext (initialLod: AutoLod = 'full'): TestContext {
  const lodRef = ref<AutoLod>(initialLod);
  const hovers: (HoverTarget | null)[] = [];
  const pins: HoverTarget[] = [];
  const drags: DragTarget[] = [];
  const toggled: string[] = [];
  const colorPicks: ColorTarget[] = [];
  const recordsOpened: string[] = [];
  return {
    viewport: shallowRef(IDENTITY_VIEWPORT),
    lod: computed(() => lodRef.value),
    highlight: computed(() => ({
      refKeys: new Set<string>(),
      depKeys: new Set<string>(),
      depColumnKeys: new Set<string>(),
      tableKeys: new Set<string>(),
      fieldKeys: new Set<string>(),
      cellKeys: new Set<string>(),
      source: null,
    })),
    dark: ref(false),
    dragging: shallowRef(null),
    setHover: (t) => hovers.push(t),
    clearHover: () => hovers.push(null),
    clickEdge: (t) => pins.push(t),
    focus: computed(() => NO_FOCUS),
    unfolded: ref(new Set<string>()),
    beginDrag: (_e, t) => drags.push(t),
    toggleGroup: (k) => toggled.push(k),
    pickColors: ref(true),
    openColorPicker: (t) => colorPicks.push(t),
    toggleRecords: (k) => recordsOpened.push(k),
    hovers,
    pins,
    drags,
    toggled,
    colorPicks,
    recordsOpened,
    setLod: (l) => {
      lodRef.value = l;
    },
  };
}

export function field (table: string, name: string, extra: Partial<FieldVM> = {}): FieldVM {
  return {
    key: `${table}.${name}`,
    name,
    typeText: 'int',
    pk: false,
    compositePk: false,
    unique: false,
    notNull: false,
    increment: false,
    hasRef: false,
    hasDep: false,
    ...extra,
  };
}

export function table (key: string, fields: FieldVM[], extra: Partial<TableVM> = {}): TableVM {
  const name = key.split('.').pop()!;
  return {
    key,
    schema: 'public',
    name,
    alias: null,
    displayName: name,
    headerColor: null,
    groupColor: null,
    fields,
    fieldIndexByName: new Map(fields.map((f, i) => [f.name, i])),
    indexes: [],
    checks: [],
    order: 0,
    ...extra,
  };
}

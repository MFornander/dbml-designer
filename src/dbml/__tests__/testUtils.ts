import { computed, ref, shallowRef } from 'vue';
import {
  Compiler, DEFAULT_ENTRY, MemoryProjectLayout, type Database,
} from '@dbml/parse';
import {
  type ColorTarget, type DiagramContext, type HoverTarget, type DragTarget, type AutoLod, type FieldVM, type TableVM, IDENTITY_VIEWPORT,
} from '@/engine/core';

export function compile (dbml: string): Database {
  const layout = new MemoryProjectLayout();
  const compiler = new Compiler(layout);
  layout.setSource(DEFAULT_ENTRY, dbml);
  const report = compiler.interpretFile(DEFAULT_ENTRY);
  const errors = report.getErrors();
  if (errors.length > 0) throw new Error(errors.map((e) => e.diagnostic).join('; '));
  return report.getValue() as Database;
}

export interface TestContext extends DiagramContext {
  hovers: (HoverTarget | null)[];
  pins: HoverTarget[];
  drags: DragTarget[];
  toggled: string[];
  colorPicks: ColorTarget[];
  setLod (lod: AutoLod): void;
}

export function makeContext (initialLod: AutoLod = 'full'): TestContext {
  const lodRef = ref<AutoLod>(initialLod);
  const hovers: (HoverTarget | null)[] = [];
  const pins: HoverTarget[] = [];
  const drags: DragTarget[] = [];
  const toggled: string[] = [];
  const colorPicks: ColorTarget[] = [];
  return {
    viewport: shallowRef(IDENTITY_VIEWPORT),
    lod: computed(() => lodRef.value),
    highlight: computed(() => ({
      refKeys: new Set<string>(),
      depKeys: new Set<string>(),
      depColumnKeys: new Set<string>(),
      tableKeys: new Set<string>(),
      fieldKeys: new Set<string>(),
      source: null,
    })),
    dark: ref(false),
    dragging: shallowRef(null),
    setHover: (t) => hovers.push(t),
    clearHover: () => hovers.push(null),
    togglePin: (t) => pins.push(t),
    beginDrag: (_e, t) => drags.push(t),
    toggleGroup: (k) => toggled.push(k),
    openColorPicker: (t) => colorPicks.push(t),
    hovers,
    pins,
    drags,
    toggled,
    colorPicks,
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

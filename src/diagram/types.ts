import type { Source } from './model';
import type {
  DepKey, EnumKey, FieldKey, GroupKey, NoteKey, RefKey, TableKey,
} from './keys';

export type { DetailLevel, PartialRefMode } from '@/types/diagram';

/**
 * How an edge end is drawn: bar, bar+circle, crow's foot, crow's foot+circle for
 * relationships; nothing or an arrowhead for lineage edges.
 */
export type MarkerKind = 'one' | 'maybe' | 'some' | 'many' | 'none' | 'arrow';

/** Automatic level of detail driven by zoom. */
export type AutoLod = 'full' | 'minimal' | 'structure';

export interface FieldVM {
  key: FieldKey;
  name: string;
  /** `type_name` plus `(args)` when present. */
  typeText: string;
  enumKey?: EnumKey;
  pk: boolean;
  /** Member of a composite primary key declared in `indexes { (...) [pk] }`. */
  compositePk: boolean;
  unique: boolean;
  notNull: boolean;
  increment: boolean;
  /** Participates in at least one resolved ref. */
  hasRef: boolean;
  /** Participates in at least one resolved dependency edge. */
  hasDep: boolean;
  note?: string;
  dbdefault?: string;
  checks?: string[];
  metadata?: Record<string, string>;
  /** Name of the TablePartial this field was injected from. */
  injectedFrom?: string;
  source?: Source;
}

export interface IndexVM {
  /** Column names or expressions, in order. */
  columns: string[];
  unique: boolean;
  pk: boolean;
  type?: string;
  name?: string;
  note?: string;
}

export interface TableVM {
  key: TableKey;
  schema: string;
  name: string;
  alias: string | null;
  /** Schema-qualified unless the schema is the default one. */
  displayName: string;
  /** Normalized `#RRGGBB`, or null for the palette default. */
  headerColor: string | null;
  /** Color of the table's group, used for the header when the table has none of its own. */
  groupColor: string | null;
  fields: FieldVM[];
  fieldIndexByName: Map<string, number>;
  indexes: IndexVM[];
  checks: string[];
  metadata?: Record<string, string>;
  note?: string;
  groupKey?: GroupKey;
  /** Refs the table gets from each injected TablePartial that carries any, in injection order; set only when there are some. */
  partialRefs?: PartialRefsVM[];
  /** Declaration order. */
  order: number;
  source?: Source;
}

/** The refs one injected TablePartial gives a table: a badge in the table header while partial refs are drawn as badges. */
export interface PartialRefsVM {
  /** Name of the TablePartial, as the table injects it. */
  partial: string;
  /** The resolved refs its injected fields declare, in field order. */
  refKeys: RefKey[];
  /** The partial's primary key: its `pk` fields, else the columns of its `pk` index. */
  keyColumns: string[];
  /** The partial's own note. */
  note?: string;
}

export interface EdgeEndpointVM {
  tableKey: TableKey;
  /** Empty for table-level endpoints. */
  fieldNames: string[];
  fieldKeys: FieldKey[];
  fieldIndices: number[];
}

export interface RefEndpointVM extends EdgeEndpointVM {
  /** As given: `1`, `*`, `0..1`, ... */
  cardinality: string;
  marker: MarkerKind;
}

export interface RefVM {
  key: RefKey;
  name: string | null;
  endpoints: [RefEndpointVM, RefEndpointVM];
  /** Explicit `[color: ...]` setting. */
  color: string | null;
  /**
   * Color the line is drawn with: the explicit color, else the header (or group)
   * color of the "one" side table, else null for the palette default.
   */
  lineColor: string | null;
  inactive: boolean;
  isSelf: boolean;
  onDelete?: string;
  onUpdate?: string;
  /**
   * Name of the TablePartial whose injected field declares this ref inline; its first endpoint is
   * then the injecting table. Unset for refs declared on a table itself or in a `Ref:` block.
   */
  viaPartial?: string;
  source?: Source;
}

/** What the renderer needs from any lineage line, table-level or column-level. */
export interface DepLineVM {
  key: DepKey;
  /** Text drawn at the midpoint while highlighted: the Dep block name(s), or null when anonymous. */
  label: string | null;
  upstream: EdgeEndpointVM;
  downstream: EdgeEndpointVM;
  /** Explicit `[color: ...]` of the Dep block, or null for the palette default. */
  color: string | null;
  isSelf: boolean;
  source?: Source;
}

/**
 * One column-level mapping (`a.x -> b.y`) folded into a table-level lineage edge. Listed in the
 * edge's tooltip, and drawn on its own only while one of its fields is hovered or pinned.
 */
export interface DepColumnVM extends DepLineVM {
  /** The table-level edge this mapping belongs to. */
  edgeKey: DepKey;
}

/**
 * One directed lineage edge between two tables, drawn from the upstream (source) header to the
 * downstream (derived) header. Every Dep edge between the same pair, whether from one Dep block,
 * several, or inline `dep` settings, collapses into it, as dbdiagram does.
 */
export interface DepEdgeVM extends DepLineVM {
  /** Distinct names of the Dep blocks that contribute, in declaration order. */
  names: string[];
  columns: DepColumnVM[];
  note?: string;
  metadata?: Record<string, string>;
}

export interface GroupVM {
  key: GroupKey;
  name: string;
  color: string | null;
  tableKeys: TableKey[];
  note?: string;
  metadata?: Record<string, string>;
  order: number;
  source?: Source;
}

export interface NoteVM {
  key: NoteKey;
  name: string;
  content: string;
  color: string | null;
  order: number;
  source?: Source;
}

export interface EnumValueVM {
  name: string;
  note?: string;
}

export interface EnumVM {
  key: EnumKey;
  name: string;
  values: EnumValueVM[];
}

export interface ModelDiagnostic {
  kind: 'unresolved-ref' | 'unresolved-dep' | 'unresolved-group-member' | 'unresolved-partial' | 'duplicate-ref' | 'duplicate-table' | 'unresolved-view-entity';
  message: string;
  source?: Source;
}

/**
 * A `DiagramView` block: the tables and notes a named view shows. Each section restricts only
 * its own kind; a view without any table-side section shows every table, one without `notes`
 * shows every note.
 */
export interface DiagramViewVM {
  key: string;
  name: string;
  /** Tables listed directly (resolved). */
  tableKeys: TableKey[];
  /** Table groups listed; their members are visible. */
  groupKeys: GroupKey[];
  noteKeys: NoteKey[];
  /** Schemas listed; all their tables are visible. */
  schemas: string[];
  /** The view has a `tables`, `tablegroups`, or `schemas` section and so restricts tables. */
  filtersTables: boolean;
  /** The view has a `notes` section and so restricts notes. */
  filtersNotes: boolean;
  source?: Source;
}

export interface DiagramModel {
  tables: TableVM[];
  tablesByKey: Map<TableKey, TableVM>;
  refs: RefVM[];
  refsByTable: Map<TableKey, RefKey[]>;
  refsByField: Map<FieldKey, RefKey[]>;
  /** Table-level lineage edges, one per directed pair of tables. */
  deps: DepEdgeVM[];
  /** Keys of the table-level edges touching each table. */
  depsByTable: Map<TableKey, DepKey[]>;
  /** Keys of the column-level mappings touching each field. */
  depsByField: Map<FieldKey, DepKey[]>;
  groups: GroupVM[];
  notes: NoteVM[];
  views: DiagramViewVM[];
  enums: Map<EnumKey, EnumVM>;
  diagnostics: ModelDiagnostic[];
}

export function emptyModel (): DiagramModel {
  return {
    tables: [],
    tablesByKey: new Map(),
    refs: [],
    refsByTable: new Map(),
    refsByField: new Map(),
    deps: [],
    depsByTable: new Map(),
    depsByField: new Map(),
    groups: [],
    notes: [],
    views: [],
    enums: new Map(),
    diagnostics: [],
  };
}

import type { ModelRecord, ModelValue, Source } from './model';
import type {
  DepKey, EnumKey, FieldKey, GroupKey, NoteKey, RefKey, TableKey,
} from './keys';
import type { Point, Rect } from './geometry/rect';
import type { HoverTarget } from './state/useHover';

/** Stored placement. `w` and `h` are only used by resizable elements (sticky notes). */
export interface XY {
  x: number;
  y: number;
  w?: number;
  h?: number;
}

export type PositionsMap = Readonly<Record<string, XY>>;

export type DetailLevel = 'all' | 'keys' | 'names';

/** How refs that come from a TablePartial's fields are drawn: one badge per partial in the table header, or as lines. */
export type PartialRefMode = 'badges' | 'lines';

export interface PositionChange {
  key: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
}

/** A table clicked or hovered, with the `source` the host gave it, if any. */
export interface TableLinkPayload {
  key: TableKey;
  source: unknown;
}

/** An element the pointer is over, with where it is drawn. */
export interface ElementEvent {
  /** What it is: a table, field, partial badge, ref, lineage edge or column pair, group, or note. */
  target: HoverTarget;
  /** The `source` the model gave the element, if any. */
  source?: Source;
  /** Where it is drawn, in client coordinates like `getBoundingClientRect`; null when it is not drawn. */
  rect: Rect | null;
  /** Where the pointer was, in client coordinates, to anchor a popover at; null before the pointer has moved over the diagram. */
  point: Point | null;
}

/** An element clicked, with where it is drawn; the host may keep the engine from pinning and selecting it. */
export interface ElementClickEvent extends ElementEvent {
  /** Keep the engine from its own response to this click: pinning the element and selecting it. */
  preventDefault (): void;
  readonly defaultPrevented: boolean;
}

/** The diagram's pan and zoom: a point at diagram coordinates (px, py) is drawn at (px·zoom + x, py·zoom + y) in the pane. */
export interface DiagramViewport {
  x: number;
  y: number;
  zoom: number;
}

/**
 * What the host highlights, on top of the engine's own hover and pin: tables, fields, edges, groups,
 * and notes by key. Nothing moves and nothing is stored; see `Engine.highlight`.
 */
export interface Highlight {
  /** Drawn highlighted; a mapping key (`…#kind`) highlights its column pair, drawn even while lineage is drawn by table pair. */
  keys: ReadonlySet<string>;
  /** Those drawn more strongly still, such as the column the host is focused on within its lineage. */
  accent: ReadonlySet<string>;
  /** Fade everything the highlight does not keep: the keys, the tables of their fields and at the ends of their edges, and their groups. */
  dim: boolean;
}

/**
 * A chip in a table's header, after its name: a kind, a status, or anything short the host keeps
 * current. Every chip is `chipWidth` wide, its label cut to fit, so updates never resize a table.
 */
export interface TableChip {
  /** Names the chip within its table, in click and hover events. */
  id: string;
  label: string;
  /** Fill, or the outline of an outlined chip; the header's text color when absent. */
  color?: string;
  /** Drawn as an outline, for what does not change, rather than filled, for what does. */
  outline?: boolean;
  /** Its tooltip, after the full label when the label was cut to fit. */
  note?: string;
}

/** What the view does when an update adds tables: pan to bring them into view, keep the whole diagram fitted until the user pans or zooms, or nothing. */
export type RevealAdded = 'pan' | 'fit' | 'none';

/** What the color picker is editing: a table header, a group header, a sticky note, or a relationship line. */
export interface ColorTarget {
  kind: 'table' | 'group' | 'note' | 'ref';
  key: string;
}

/** A color chosen in the picker; the host decides where it is written. */
export interface ColorChangePayload extends ColorTarget {
  /** Normalized `#RRGGBB`. */
  color: string;
}

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
  /** The field's value when its table has exactly one record and the record names the field. */
  value?: ModelValue;
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
  /** The table's rows of data; set only when there are some. */
  records?: readonly ModelRecord[];
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
  /** The dep's kind (`value` draws solid, `row` in short dashes); unset on table-level edges. */
  kind?: string;
  isSelf: boolean;
  source?: Source;
}

/**
 * One dep's mapping between two sets of columns, of one kind. A value mapping and a row mapping
 * between the same columns are two mappings of one column pair.
 */
export interface DepMappingVM {
  /** `dep:from(fields)->to(fields)#kind`, or the column pair's own key for a dep without a kind. */
  key: DepKey;
  kind?: string;
  /** The dep's name, or null when anonymous. */
  label: string | null;
  /** The note and metadata of the dep the mapping came from, not merged with the others. */
  note?: string;
  metadata?: Record<string, string>;
  source?: Source;
}

/**
 * The column pair `a.x -> b.y` of a table-level lineage edge, with every mapping between those
 * columns. Listed in the edge's tooltip, and drawn as one curve while one of its fields is hovered
 * or pinned, or always when the diagram draws lineage column by column. Its `kind` is the
 * strongest of its mappings' kinds (`value`, then `row`, then any other), which styles the curve;
 * its `label` joins their names, and its `source` is the strongest mapping's.
 */
export interface DepColumnVM extends DepLineVM {
  /** The table-level edge this column pair belongs to. */
  edgeKey: DepKey;
  /** Its mappings, strongest kind first. */
  mappings: DepMappingVM[];
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

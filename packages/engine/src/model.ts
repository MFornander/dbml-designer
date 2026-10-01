/**
 * The engine's input: what a diagram shows, as plain data. A host builds it directly, or converts
 * to it the way the editor does from DBML (`src/dbml/toModel.ts`); the engine indexes it into the
 * view model it draws (`fromModel.ts`). DBML's features are the checklist of what it can say, but
 * nothing here needs DBML.
 *
 * Elements refer to each other by name:
 * - a table by its key, `schema.name`, where the schema is `public` when the table has none;
 * - a field by its name within that table;
 * - a group and an enum by `schema.name` the same way, and a sticky note by its name.
 *
 * Every element can carry a `source`, which the engine never looks into and hands back with the
 * element; the editor keeps the element's place in the DBML text there.
 */

/** Anything the host wants to recognize an element by; handed back untouched. */
export type Source = unknown;

/** A value in a record, as the host has it; dates and times as text. */
export type ModelValue = string | number | boolean | null;

/** One row of a table's data, by field name. A field the record does not name has no value in it. */
export type ModelRecord = Record<string, ModelValue>;

export interface Model {
  project?: ModelProject;
  tables: ModelTable[];
  refs?: ModelRef[];
  /** Lineage edges, upstream to downstream; every edge between the same two tables is drawn as one. */
  deps?: ModelDep[];
  groups?: ModelGroup[];
  notes?: ModelNote[];
  views?: ModelView[];
  enums?: ModelEnum[];
}

export interface ModelProject {
  name?: string;
  databaseType?: string;
  note?: string;
}

export interface ModelTable {
  /** Absent for the default schema, `public`. */
  schema?: string;
  name: string;
  alias?: string;
  /** `#RGB` or `#RRGGBB`; the palette's default when absent. */
  headerColor?: string;
  note?: string;
  metadata?: Record<string, string>;
  fields: ModelField[];
  indexes?: ModelIndex[];
  /** Check constraints as shown, for example `positive: price > 0`. */
  checks?: string[];
  /**
   * The TablePartials the table injects, in injection order. Refs whose `viaPartial` names one of
   * them, with this table at their first end, are drawn as a badge per partial in the header.
   */
  partials?: ModelPartial[];
  /**
   * Rows of data, such as sample rows or the rows a trace touched. With one, each field it names
   * shows its value; several show as a grid (see `DisplayOptions.gridRows`).
   */
  records?: ModelRecord[];
  /**
   * The table this one accompanies, by key: a companion, such as a provenance twin or an explain
   * view, is folded into its owner's header as a badge until unfolded, and placed below it. One
   * owner each; an owner is no companion itself.
   */
  companionOf?: string;
  /** The companion's badge in its owner's header; its name when absent. */
  companionLabel?: string;
  source?: Source;
}

export interface ModelPartial {
  name: string;
  /** The partial's primary key columns, listed in the badge's tooltip. */
  keyColumns?: string[];
  note?: string;
}

export interface ModelField {
  name: string;
  /** The type as shown, arguments included, for example `varchar(64)`. */
  type: string;
  pk?: boolean;
  unique?: boolean;
  notNull?: boolean;
  increment?: boolean;
  /** The default as shown, for example `'draft'` or `` `now()` ``. */
  default?: string;
  note?: string;
  /** `schema.name` of the enum the type is, whose values the tooltip lists. */
  enum?: string;
  /** Check constraints as shown. */
  checks?: string[];
  metadata?: Record<string, string>;
  /** Name of the TablePartial the field came from. */
  injectedFrom?: string;
  source?: Source;
}

export interface ModelIndex {
  /** Column names, or expressions in backticks, in order. */
  columns: string[];
  unique?: boolean;
  /** A composite primary key; its columns are drawn as key fields. */
  pk?: boolean;
  type?: string;
  name?: string;
  note?: string;
}

export interface ModelRef {
  name?: string;
  from: ModelRefEnd;
  to: ModelRefEnd;
  /** `#RGB` or `#RRGGBB`; otherwise the line takes the header color of its "one" side. */
  color?: string;
  inactive?: boolean;
  onDelete?: string;
  onUpdate?: string;
  /** Name of the TablePartial whose injected field declares the ref; `from` is then the injecting table. */
  viaPartial?: string;
  source?: Source;
}

export interface ModelRefEnd {
  /** Table key, `schema.name`. */
  table: string;
  /** Field names; none for a ref between whole tables. */
  fields?: string[];
  /** How many rows take part at this end: `1`, `*` (one or more), `0..1`, `0..*`, `1..*`, or `m..n`. `1` when absent. */
  cardinality?: string;
}

export interface ModelDep {
  /** The upstream end, which the downstream one is derived from. */
  from: ModelEdgeEnd;
  to: ModelEdgeEnd;
  /** Shown on the edge while it is highlighted; the names of every dep between two tables are joined. */
  name?: string;
  /**
   * What the upstream end does for the downstream one, drawn when column mappings are: `value`, an
   * operand of the formula, solid; `row`, it chose the row used (a join key or a filter), in short
   * dashes. Any other kind is listed in the tooltip and drawn like a dep without one.
   */
  kind?: string;
  /** `#RGB` or `#RRGGBB`; the line's color whatever its kind. */
  color?: string;
  note?: string;
  metadata?: Record<string, string>;
  source?: Source;
}

export interface ModelEdgeEnd {
  /** Table key, `schema.name`. */
  table: string;
  /** Field names for a column-level edge; none between whole tables. */
  fields?: string[];
  /**
   * The record of the table this end is about, for an edge between cells: its index in the
   * table's `records`, or the values of the table's key fields (its primary key, composite
   * included) that pick it out.
   */
  row?: number | ModelRecord;
}

export interface ModelGroup {
  /** Absent for the default schema, `public`. */
  schema?: string;
  name: string;
  color?: string;
  /** Table keys. A table belongs to the first group that lists it. */
  tables: string[];
  note?: string;
  metadata?: Record<string, string>;
  source?: Source;
}

export interface ModelNote {
  /** Unique among the notes. */
  name: string;
  content: string;
  color?: string;
  source?: Source;
}

/**
 * A named view: which tables and notes it shows. Each list restricts only its own kind, and only
 * when present: without `tables`, `groups`, and `schemas` every table shows, without `notes` every
 * note does.
 */
export interface ModelView {
  name: string;
  /** Table keys. */
  tables?: string[];
  /** Groups as `schema.name`; their tables show. */
  groups?: string[];
  /** Schema names; their tables show. */
  schemas?: string[];
  /** Note names. */
  notes?: string[];
  source?: Source;
}

export interface ModelEnum {
  /** Absent for the default schema, `public`. */
  schema?: string;
  name: string;
  values: {
    name: string;
    note?: string;
  }[];
}

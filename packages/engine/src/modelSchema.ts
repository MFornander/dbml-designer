/**
 * The model as a JSON Schema (draft-07), field for field with `model.ts`, for editors and for hosts
 * that validate the JSON they hand the engine. Unknown properties are rejected so typos show.
 */

const text = (description: string) => ({
  type: 'string',
  description,
});

const flag = (description: string) => ({
  type: 'boolean',
  description,
});

const list = (description: string) => ({
  type: 'array',
  items: { type: 'string' },
  description,
});

const color = (description: string) => text(`${description} \`#RGB\` or \`#RRGGBB\`; anything else draws the default.`);

const SOURCE = { description: 'Anything the host recognizes the element by; handed back with clicks and hovers.' };

const METADATA = {
  type: 'object',
  additionalProperties: { type: 'string' },
  description: 'Name and value pairs listed in tooltips.',
};

const ref = (name: string) => ({ $ref: `#/definitions/${name}` });

const arrayOf = (name: string, description: string) => ({
  type: 'array',
  items: ref(name),
  description,
});

export const MODEL_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://github.com/MFornander/dbml-designer/schemas/model.json',
  title: 'Diagram model',
  description: 'What a diagram shows, as plain data. Tables are named by key, `schema.name`, with the schema `public` when a table has none.',
  type: 'object',
  required: ['tables'],
  additionalProperties: false,
  properties: {
    project: ref('project'),
    tables: arrayOf('table', 'The tables, in the order they are declared.'),
    refs: arrayOf('ref', 'Relationships between tables or fields.'),
    deps: arrayOf('dep', 'Lineage edges, upstream to downstream; every edge between the same two tables is drawn as one.'),
    groups: arrayOf('group', 'Table groups; a table belongs to the first group that lists it.'),
    notes: arrayOf('note', 'Sticky notes.'),
    views: arrayOf('view', 'Named views of the diagram.'),
    enums: arrayOf('enum', 'Enums, whose values field tooltips list.'),
  },
  definitions: {
    project: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: text('Project name.'),
        databaseType: text('Database type, for example `PostgreSQL`.'),
        note: text('Project note.'),
      },
    },
    table: {
      type: 'object',
      required: ['name', 'fields'],
      additionalProperties: false,
      properties: {
        schema: text('Schema; absent for the default schema, `public`.'),
        name: text('Table name.'),
        alias: text('Alias, shown in the tooltip.'),
        headerColor: color('Header color.'),
        note: text('Note, Markdown.'),
        metadata: METADATA,
        fields: arrayOf('field', 'The fields, in order.'),
        indexes: arrayOf('index', 'Indexes; a `pk` index marks a composite primary key.'),
        checks: list('Check constraints as shown, for example `positive: price > 0`.'),
        partials: arrayOf('partial', 'The TablePartials the table injects, in injection order.'),
        records: {
          type: 'array',
          items: ref('record'),
          description: 'Rows of data by field name. One shows its values on the fields; several show their count in the header, which opens them.',
        },
        source: SOURCE,
      },
    },
    record: {
      type: 'object',
      additionalProperties: {
        type: ['string', 'number', 'boolean', 'null'],
      },
      description: 'One row: values by field name; dates and times as text.',
    },
    partial: {
      type: 'object',
      required: ['name'],
      additionalProperties: false,
      properties: {
        name: text('TablePartial name.'),
        keyColumns: list('The partial\'s primary key columns, listed in its badge\'s tooltip.'),
        note: text('The partial\'s note.'),
      },
    },
    field: {
      type: 'object',
      required: ['name', 'type'],
      additionalProperties: false,
      properties: {
        name: text('Field name.'),
        type: text('Type as shown, arguments included, for example `varchar(64)`.'),
        pk: flag('Part of the primary key.'),
        unique: flag('Unique.'),
        notNull: flag('Not null.'),
        increment: flag('Auto-increment.'),
        default: text('Default as shown, for example `\'draft\'` or `` `now()` ``.'),
        note: text('Note, Markdown.'),
        enum: text('`schema.name` of the enum the type is.'),
        checks: list('Check constraints as shown.'),
        metadata: METADATA,
        injectedFrom: text('Name of the TablePartial the field came from.'),
        source: SOURCE,
      },
    },
    index: {
      type: 'object',
      required: ['columns'],
      additionalProperties: false,
      properties: {
        columns: list('Column names, or expressions in backticks, in order.'),
        unique: flag('Unique index.'),
        pk: flag('Composite primary key.'),
        type: text('Index type, for example `btree`.'),
        name: text('Index name.'),
        note: text('Note.'),
      },
    },
    refEnd: {
      type: 'object',
      required: ['table'],
      additionalProperties: false,
      properties: {
        table: text('Table key, `schema.name`.'),
        fields: list('Field names; none for a ref between whole tables.'),
        cardinality: {
          type: 'string',
          pattern: '^(\\*|\\d+|\\d+\\.\\.(\\d+|\\*))$',
          description: 'How many rows take part at this end: `1`, `*` (one or more), `0..1`, `0..*`, `1..*`, or `m..n`. `1` when absent.',
        },
      },
    },
    ref: {
      type: 'object',
      required: ['from', 'to'],
      additionalProperties: false,
      properties: {
        name: text('Relationship name.'),
        from: ref('refEnd'),
        to: ref('refEnd'),
        color: color('Line color; otherwise the header color of the "one" side.'),
        inactive: flag('Drawn dashed.'),
        onDelete: text('Delete rule, shown in the tooltip.'),
        onUpdate: text('Update rule, shown in the tooltip.'),
        viaPartial: text('The TablePartial whose injected field declares the ref; drawn as a badge on the `from` table.'),
        source: SOURCE,
      },
    },
    edgeEnd: {
      type: 'object',
      required: ['table'],
      additionalProperties: false,
      properties: {
        table: text('Table key, `schema.name`.'),
        fields: list('Field names for a column-level edge; none between whole tables.'),
      },
    },
    dep: {
      type: 'object',
      required: ['from', 'to'],
      additionalProperties: false,
      properties: {
        from: ref('edgeEnd'),
        to: ref('edgeEnd'),
        name: text('Shown on the edge while it is highlighted; the names of every dep between two tables are joined.'),
        color: color('Edge color.'),
        note: text('Note, listed in the edge\'s tooltip.'),
        metadata: METADATA,
        source: SOURCE,
      },
    },
    group: {
      type: 'object',
      required: ['name', 'tables'],
      additionalProperties: false,
      properties: {
        schema: text('Schema; absent for the default schema, `public`.'),
        name: text('Group name.'),
        color: color('Group color.'),
        tables: list('Table keys.'),
        note: text('Note.'),
        metadata: METADATA,
        source: SOURCE,
      },
    },
    note: {
      type: 'object',
      required: ['name', 'content'],
      additionalProperties: false,
      properties: {
        name: text('Unique name.'),
        content: text('Markdown.'),
        color: color('Paper color.'),
        source: SOURCE,
      },
    },
    view: {
      type: 'object',
      required: ['name'],
      additionalProperties: false,
      properties: {
        name: text('View name.'),
        tables: list('Table keys the view shows.'),
        groups: list('Groups, as `schema.name`, whose tables the view shows.'),
        schemas: list('Schemas whose tables the view shows.'),
        notes: list('Note names the view shows.'),
        source: SOURCE,
      },
    },
    enum: {
      type: 'object',
      required: ['name', 'values'],
      additionalProperties: false,
      properties: {
        schema: text('Schema; absent for the default schema, `public`.'),
        name: text('Enum name.'),
        values: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name'],
            additionalProperties: false,
            properties: {
              name: text('Value.'),
              note: text('Note.'),
            },
          },
        },
      },
    },
  },
} as const;

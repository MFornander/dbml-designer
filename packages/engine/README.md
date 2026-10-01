# @dbml-designer/engine

A diagram engine for database schemas and their lineage. Hand it a model as plain JSON, with tables, relationships, lineage edges, groups, sticky notes, and views, and it draws an interactive diagram: drag, pan and zoom, hover highlights with marching ants, tooltips, detail levels, light and dark themes, partial-ref badges, and an Arrange that lays out pipelines by group and lineage.

It knows nothing of DBML, editors, or files. The DBML Designer editor in this repository is one host: it converts DBML to this model. A run inspector or a provenance tool can be another, building the model from whatever it already has.

## The model

The input is a `Model` (`src/model.ts`). Elements refer to each other by key: a table by `schema.name`, with the schema `public` when the table has none; a field by its name within its table; a group or an enum by `schema.name`; a sticky note by its name.

```json
{
  "tables": [
    { "schema": "spec", "name": "order_line", "fields": [
      { "name": "line_id", "type": "int", "pk": true },
      { "name": "item_id", "type": "int" },
      { "name": "quantity", "type": "int" }
    ] },
    { "schema": "money", "name": "line_price", "headerColor": "#24BAB1", "fields": [
      { "name": "line_id", "type": "int", "pk": true },
      { "name": "price", "type": "decimal(10,2)" }
    ] }
  ],
  "refs": [
    { "from": { "table": "money.line_price", "fields": ["line_id"], "cardinality": "1" },
      "to": { "table": "spec.order_line", "fields": ["line_id"], "cardinality": "1" } }
  ],
  "deps": [
    { "from": { "table": "spec.order_line", "fields": ["quantity"] },
      "to": { "table": "money.line_price", "fields": ["price"] }, "name": "value" }
  ],
  "groups": [{ "name": "trace", "tables": ["spec.order_line", "money.line_price"] }],
  "views": [{ "name": "prices", "tables": ["money.line_price"] }]
}
```

- **Tables** carry fields (type as shown, keys, default, note, enum, metadata), indexes, checks, a header color, a note, and metadata.
- **Refs** have two ends, each a table with optional fields and a cardinality (`1`, `*` for one or more, `0..1`, `0..*`, `1..*`, `m..n`; `1` when left out). A ref is colored after its "one" side unless it has a color of its own.
- **Deps** are lineage edges from an upstream end to a downstream one, column-level when both ends name fields. Every dep between the same two tables is drawn as one edge; its column mappings show when a mapped field is hovered.
- **Groups** list their tables; a table belongs to the first group that lists it.
- **Views** say what they show: tables, groups, schemas, notes. Each list restricts only its own kind, and only when it is there.
- **Partials**: a table can list the partials it injects, and a ref with `viaPartial` naming one of them is drawn as a badge in that table's header instead of a line.
- **Sources**: every element can carry a `source`, which the engine hands back untouched with clicks and hovers. The DBML editor keeps the element's place in the text there.

`npm run graph -- file.dbml` in the repository root prints the model of any DBML file, so DBML is one quick way to write a model by hand.

An element that names a table, field, group, or note that is not there is left out and reported in the diagram model's `diagnostics`, with its source, so a mistake costs that element and not the diagram.

## Using it

```ts
import { createEngine, EngineDiagram } from '@dbml-designer/engine';

const engine = createEngine({
  model,                          // a Model, or a getter the engine follows
  display: { detailLevel: 'all', dark: false },
  layout: savedSnapshot,          // optional: what snapshot() returned last time
});
```

```vue
<EngineDiagram :engine="engine" @table-click="({ key, source }) => open(key)" />
```

`EngineDiagram` fills its container. Its events are `table-click` and `table-hover` (`{ key, source }`), `set-color` (a color picked for a table, group, note, or ref; the host decides where it goes), `zoom-change`, and `arrange` (an arrangement was stored).

### The engine

| Member | What it does |
|---|---|
| `diagram` | The view model being drawn, computed from the model |
| `setModel(model)` | Show another model. The layout is kept, tables without a position are placed, and what the model no longer has is dropped from the layout |
| `setLoading(flag)` | While true, the model is taken to be behind what the host is loading: nothing is placed or dropped against it |
| `display`, `setDisplay(partial)` | Detail level (`all`, `keys`, `names`), dark theme, which edges show (`showRefs`, `showLineage`), partial refs as badges or lines, lineage layout, highlight all |
| `views` | The views: `activeView`, `select`, the hidden set, and toggles that can be saved back into a view |
| `selectView(name)` | Switch to a view, or to the Default View with `null` |
| `layout` | Positions, folded groups, hand-drawn routes, kept as layers: the Default View's, and one per named view on top |
| `snapshot()`, `restore(snapshot)` | The layout as plain data, to keep wherever the host likes, and back |
| `arrange(onlyNew?)`, `undoArrange()` | Lay out what the view shows by group and lineage, or only the tables placed automatically since the layout was loaded, and take it back |
| `fitToScreen()`, `zoomIn()`, `zoomOut()`, `resetZoom()` | The view of the mounted diagram |
| `dispose()` | Stop following the inputs |

Each input of `createEngine` (`model`, `loading`, `display`, `bases`) is a value or a getter. A Vue host that keeps them in reactive state passes getters and the engine follows them; any other host passes values and calls the setters. `bases` are layouts the diagram inherits, nearest first; the editor passes the footers of the files a DBML file imports. `layoutState` and `activeView` take refs for a host that persists the layout layers and the active view as they change.

Engines share nothing: several can live on one page, each with its own model, layout, and views.

### Without components

`@dbml-designer/engine/core` has everything but the components, and loads without a DOM or a Vue compiler, in Node too: the model and its types, `fromModel`, the layout and view state, and Arrange with its table sizing, which estimates text widths when no canvas can measure them.

## Development

From the repository root: `npm test` runs this package's tests with the editor's, `npm run type-check` checks it, and `npm run lint` keeps it to the packages its `package.json` declares, with nothing of DBML, Monaco, Pinia, or the editor. Tests that describe their diagram in DBML for readability get it through `#dbml-testing`, which only the test configuration maps, to the editor's converter.

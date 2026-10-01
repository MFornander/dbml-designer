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
- **Records** are a table's rows, each an object from field name to a string, number, boolean, or null. With one record, each field it names shows its value at the right of the row; with several, a row-count badge in the header opens them as a table. The `showValues` display option hides both.
- **Refs** have two ends, each a table with optional fields and a cardinality (`1`, `*` for one or more, `0..1`, `0..*`, `1..*`, `m..n`; `1` when left out). A ref is colored after its "one" side unless it has a color of its own.
- **Deps** are lineage edges from an upstream end to a downstream one, column-level when both ends name fields. Every dep between the same two tables is drawn as one edge; its column mappings show when a mapped field is hovered.
- **Groups** list their tables; a table belongs to the first group that lists it.
- **Views** say what they show: tables, groups, schemas, notes. Each list restricts only its own kind, and only when it is there.
- **Partials**: a table can list the partials it injects, and a ref with `viaPartial` naming one of them is drawn as a badge in that table's header instead of a line.
- **Sources**: every element can carry a `source`, which the engine hands back untouched with clicks and hovers. The DBML editor keeps the element's place in the text there.

`npm run graph -- file.dbml` in the repository root prints the model of any DBML file, so DBML is one quick way to write a model by hand. The DBML Designer editor opens models as files, `{ "version": 1, "model": {...} }` with their layout alongside, and checks them as you type.

`MODEL_SCHEMA` is the model as a JSON Schema (draft-07), for editors and validators. For JSON from a file or the network, `checkModel(value)` lists every problem with its path, an error where the engine could not draw the model and a warning for what it ignores, such as an unknown property; `asModel(value)` returns the model when there is no error. An element that names a table, field, group, or note that is not there is left out and reported in the diagram model's `diagnostics`, with its source, so a mistake costs that element and not the diagram.

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

`EngineDiagram` fills its container. Its events are `table-click` and `table-hover` (`{ key, source }`, the source undefined for a table that has none), `set-color` (a color picked for a table, group, note, or ref; the host decides where it goes), `zoom-change`, and `arrange` (an arrangement was stored).

### The engine

| Member | What it does |
|---|---|
| `diagram` | The view model being drawn, computed from the model |
| `setModel(model)` | Show another model. The layout is kept, tables without a position are placed, and what the model no longer has is dropped from the layout |
| `setLoading(flag)` | While true, the model is taken to be behind what the host is loading: nothing is placed or dropped against it |
| `display`, `setDisplay(partial)` | Detail level (`all`, `keys`, `names`), dark theme, which edges show (`showRefs`, `showLineage`), partial refs as badges or lines, record values (`showValues`), lineage layout, highlight all |
| `views` | The views: `activeView`, `select`, the hidden set, and toggles that can be saved back into a view |
| `selectView(name)` | Switch to a view, or to the Default View with `null` |
| `layout` | Positions, folded groups, hand-drawn routes, kept as layers: the Default View's, and one per named view on top |
| `snapshot()`, `restore(snapshot)` | The layout as plain data, to keep wherever the host likes, and back |
| `arrange(onlyNew?)`, `undoArrange()` | Lay out what the view shows by group and lineage, or only the tables placed automatically since the layout was loaded, and take it back |
| `fitToScreen()`, `zoomIn()`, `zoomOut()`, `resetZoom()` | The view of the mounted diagram |
| `dispose()` | Stop following the inputs |

Each input of `createEngine` (`model`, `loading`, `display`, `bases`) is a value or a getter. A Vue host that keeps them in reactive state passes getters and the engine follows them; any other host passes values and calls the setters. `bases` are layouts the diagram inherits, nearest first; the editor passes the footers of the files a DBML file imports. `layoutState` and `activeView` take refs for a host that persists the layout layers and the active view as they change.

Engines share nothing: several can live on one page, each with its own model, layout, and views.

### Hosts without Vue

`mount(element, options)` draws a diagram into any element and returns `{ engine, unmount }`. The options are those of `createEngine`, or an `engine` made elsewhere, plus callbacks: `onTableClick`, `onTableHover`, `onSetColor`, `onZoomChange`, and `onArrange`. `@dbml-designer/engine/standalone` has `mount` and everything in `core` with Vue bundled in, for hosts that have no Vue of their own, React for example:

```tsx
import { useEffect, useRef } from 'react';
import { mount, type MountedDiagram, type Model } from '@dbml-designer/engine/standalone';

export function Diagram ({ model }: { model: Model }) {
  const element = useRef<HTMLDivElement>(null);
  const diagram = useRef<MountedDiagram | null>(null);
  useEffect(() => {
    diagram.current = mount(element.current!, { model, onTableClick: ({ key, source }) => console.log(key, source) });
    return () => diagram.current?.unmount();
  }, []);
  // A new model keeps the layout; tables without a position are placed.
  useEffect(() => diagram.current?.engine.setModel(model), [model]);
  return <div ref={element} style={{ width: '100%', height: 600 }} />;
}
```

The diagram fills its element, so give the element a size. It brings its styles: the first diagram to draw adds one `style` element to the page. It draws with Open Sans and Inconsolata; load them (for example from `@fontsource/open-sans` and `@fontsource/inconsolata`) for the intended look, or the browser's fallbacks are used and measured alike.

### Without components

`@dbml-designer/engine/core` has everything but the components, and loads without a DOM or a Vue compiler, in Node too: the model and its types, `fromModel`, the layout and view state, and Arrange with its table sizing, which estimates text widths when no canvas can measure them.

## Entry points

| Import | What it is |
|---|---|
| `@dbml-designer/engine` | Everything: `createEngine`, `EngineDiagram`, `mount`, and all of `core`. Vue is the host's (a peer dependency). |
| `@dbml-designer/engine/core` | No components, no DOM: models, `fromModel`, layout and view state, Arrange. |
| `@dbml-designer/engine/standalone` | `mount` and all of `core` with Vue bundled in, for hosts without Vue. |

## Using it from another project

The package is not published yet. Build it from a clone of this repository and install the result:

```bash
git clone https://github.com/MFornander/dbml-designer.git
cd dbml-designer
npm install
npm run build -w @dbml-designer/engine
cd packages/engine
npm pack
```

`npm pack` writes `dbml-designer-engine-0.1.0.tgz`; install it in the other project with `npm install /path/to/dbml-designer-engine-0.1.0.tgz`. Installing from the tarball keeps one copy of Vue: a Vue host's own Vue serves the engine too. Linking the folder instead (`npm install /path/to/dbml-designer/packages/engine`) also works, but a Vue host then needs `resolve: { dedupe: ['vue'] }` in its Vite config so the engine and the app share one Vue. The standalone entry bundles its own Vue and needs neither.

`npm run build -w @dbml-designer/engine` writes `dist/`: `index.js` and `core.js` with Vue left to the host, `standalone/standalone.js` with it bundled, and type declarations under `types/`.

## Development

From the repository root: `npm test` runs this package's tests with the editor's, `npm run type-check` checks it, and `npm run lint` keeps it to the packages its `package.json` declares, with nothing of DBML, Monaco, Pinia, or the editor. Tests that describe their diagram in DBML for readability get it through `#dbml-testing`, which only the test configuration maps, to the editor's converter.

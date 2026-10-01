# @dbml-designer/engine

A diagram engine for database schemas and their lineage. Give it a model as plain JSON (tables, relationships, lineage edges, groups, sticky notes, views, and rows of data) and it draws an interactive diagram: drag, pan and zoom, hover highlights, tooltips, detail levels, light and dark themes, and an Arrange that lays out pipelines by group and lineage. It knows nothing of DBML, editors, or files.

This README documents version 0.7.3. [CHANGELOG.md](CHANGELOG.md) says what each version changed, [api.json](api.json) lists the complete public API of this version with every signature, and [model.schema.json](model.schema.json) is the model as a JSON Schema. The type declarations in `dist/types` carry a doc comment on every member.

**Contents:** [Quick start](#quick-start) · [Install](#install) · [The model](#the-model) · [The engine](#the-engine) · [Drawing it](#drawing-it) · [Keys and the DOM](#keys-and-the-dom) · [A diagram that grows](#a-diagram-that-grows) · [Limitations](#limitations) · [All exports](#all-exports) · [Versioning](#versioning) · [Development](#development)

## Quick start

In a Vue app:

```ts
import { createEngine, EngineDiagram } from '@dbml-designer/engine';

const engine = createEngine({ model, display: { detailLevel: 'all' } });
// <EngineDiagram :engine="engine" @table-click="({ key, source }) => open(source)" />
```

In any other app, React for example, through the entry that brings its own Vue:

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

In Node, or anywhere without a DOM, `@dbml-designer/engine/core` has everything but the components: build and check models, resolve them with `fromModel`, and work on layouts and views.

| Entry | What it is |
|---|---|
| `@dbml-designer/engine` | Everything: `createEngine`, `EngineDiagram`, `mount`, and all of `core`. Vue is the host's, a peer dependency. |
| `@dbml-designer/engine/core` | No components and no DOM: the model, `fromModel`, layout and view state, placement and Arrange. |
| `@dbml-designer/engine/standalone` | `mount` and all of `core`, with Vue bundled in, for hosts without Vue. |
| `@dbml-designer/engine/model.schema.json` | The model's JSON Schema. |
| `@dbml-designer/engine/api.json` | The public API of this version. |

## Install

The package is not published. Build it from a clone and install the tarball:

```bash
git clone https://github.com/MFornander/dbml-designer.git
cd dbml-designer
npm install
npm run build -w @dbml-designer/engine
cd packages/engine
npm pack
```

Then `npm install /path/to/dbml-designer-engine-0.7.3.tgz` in the other project. The tarball keeps one copy of Vue, so a Vue host's own Vue serves the engine. Linking the folder instead (`npm install /path/to/dbml-designer/packages/engine`) also works, but a Vue host then needs `resolve: { dedupe: ['vue'] }` in its Vite config. The standalone entry bundles its own Vue and needs neither.

## The model

The input is a `Model`. Elements refer to each other by key: a table by `schema.name`, the schema `public` when it has none; a field by its name within its table; a group or an enum by `schema.name`; a sticky note by its name.

```json
{
  "tables": [
    { "schema": "spec", "name": "order_line", "fields": [
      { "name": "line_id", "type": "int", "pk": true },
      { "name": "quantity", "type": "int" }
    ], "records": [{ "line_id": 1, "quantity": 4 }] },
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
      "to": { "table": "money.line_price", "fields": ["price"] }, "kind": "value" }
  ],
  "groups": [{ "name": "trace", "tables": ["spec.order_line", "money.line_price"] }],
  "views": [{ "name": "prices", "tables": ["money.line_price"] }]
}
```

Every element can carry a `source`: anything the host recognizes it by, handed back untouched with clicks and hovers. Colors are `#RGB` or `#RRGGBB`. Optional fields are marked `?`.

**`Model`**

| Field | Type | Meaning |
|---|---|---|
| `tables` | `ModelTable[]` | The tables, in declaration order. |
| `refs?` | `ModelRef[]` | Relationships. |
| `deps?` | `ModelDep[]` | Lineage edges, upstream to downstream. |
| `groups?` | `ModelGroup[]` | Table groups. |
| `notes?` | `ModelNote[]` | Sticky notes. |
| `views?` | `ModelView[]` | Named views. |
| `enums?` | `ModelEnum[]` | Enums, whose values field tooltips list. |
| `project?` | `ModelProject` | `name`, `databaseType`, `note`. |

**`ModelTable`**

| Field | Type | Meaning |
|---|---|---|
| `name` | `string` | Table name. |
| `schema?` | `string` | Absent for the default schema, `public`. |
| `fields` | `ModelField[]` | The fields, in order. |
| `alias?` | `string` | Shown in the tooltip. |
| `headerColor?` | `string` | Header color; the palette's default when absent. |
| `note?` | `string` | Markdown, shown in the tooltip. |
| `metadata?` | `Record<string, string>` | Name and value pairs listed in the tooltip. |
| `indexes?` | `ModelIndex[]` | `columns`, `unique?`, `pk?` (a composite key drawn as key fields), `type?`, `name?`, `note?`. |
| `checks?` | `string[]` | Check constraints as shown. |
| `partials?` | `ModelPartial[]` | Table partials the table injects: `name`, `keyColumns?`, `note?`. |
| `records?` | `ModelRecord[]` | Rows of data. One record shows its values on the fields; several show as a grid, a value column per record on the field rows, headed by the record's label (the values of its key fields that differ among the records, else 1, 2, 3), up to `gridRows`, then a "+N" column that opens them all as a table. |
| `companionOf?` | `string` | The table this one accompanies, by key, such as a provenance twin or an explain view of it: folded into that owner's header as a badge until unfolded, then placed below it, inside its group. One owner each; an owner is no companion itself. A folded companion is not drawn, nor is its lineage. |
| `companionLabel?` | `string` | The companion's badge; its name when absent. |
| `source?` | `unknown` | Handed back with events. |

A `ModelRecord` maps field names to a `ModelValue`: a string, number, boolean, or null. Dates and times are strings.

**`ModelField`**

| Field | Type | Meaning |
|---|---|---|
| `name` | `string` | Field name. |
| `type` | `string` | The type as shown, for example `varchar(64)`. |
| `pk?`, `unique?`, `notNull?`, `increment?` | `boolean` | Key and constraint flags, drawn as icons and badges. |
| `default?` | `string` | The default as shown. |
| `note?` | `string` | Markdown, shown in the tooltip. |
| `enum?` | `string` | `schema.name` of the enum the type is. |
| `checks?` | `string[]` | Check constraints as shown. |
| `metadata?` | `Record<string, string>` | Listed in the tooltip. |
| `injectedFrom?` | `string` | The table partial the field came from. |
| `source?` | `unknown` | Handed back with events. |

**`ModelRef`** (a relationship) and **`ModelRefEnd`**

| Field | Type | Meaning |
|---|---|---|
| `from`, `to` | `ModelRefEnd` | `table` (key), `fields?` (none for whole tables), `cardinality?`: `1`, `*` (one or more), `0..1`, `0..*`, `1..*`, or `m..n`; `1` when absent. |
| `name?` | `string` | Shown on the line while highlighted. |
| `color?` | `string` | Line color; otherwise the header color of the "one" side. |
| `inactive?` | `boolean` | Drawn dashed. |
| `onDelete?`, `onUpdate?` | `string` | Listed in the tooltip. |
| `viaPartial?` | `string` | The table partial whose field declares the ref; drawn as a badge in the `from` table's header unless partial refs are drawn as lines. |
| `source?` | `unknown` | Handed back with events. |

**`ModelDep`** (a lineage edge) and **`ModelEdgeEnd`**

| Field | Type | Meaning |
|---|---|---|
| `from`, `to` | `ModelEdgeEnd` | `table` (key), `fields?`, and `row?`. With fields at both ends it is a column mapping. Every dep between the same two tables is drawn as one edge. `row` names the record the end is about, for lineage between cells: its index in the table's `records`, or the values of the table's key fields (its primary key, composite included); a row that is not there is left out and reported as `unresolved-row`. Deps of one kind between the same columns but different records are one curve, its mapping's `rows` listing the record pairs. |
| `kind?` | `string` | `value`: an operand of the downstream formula, drawn solid. `row`: it chose the row used, as a join key or a filter, drawn in short dashes. Anything else is listed in the tooltip. Kinds show when mappings are drawn (`lineageColumns`). |
| `name?` | `string` | Shown while highlighted; names of deps between the same tables are joined. |
| `color?` | `string` | Line color, whatever the kind. |
| `note?`, `metadata?` | | Listed in the tooltip. |
| `source?` | `unknown` | Handed back with events. |

**`ModelGroup`, `ModelNote`, `ModelView`, `ModelEnum`**

| Element | Fields |
|---|---|
| `ModelGroup` | `name`, `schema?`, `tables` (keys; a table belongs to the first group that lists it), `color?`, `note?`, `metadata?`, `source?` |
| `ModelNote` | `name` (unique), `content` (Markdown), `color?`, `source?` |
| `ModelView` | `name`, then what it shows: `tables?` (keys), `groups?` (`schema.name`), `schemas?`, `notes?` (names). Each list restricts only its own kind, and only when present. `source?` |
| `ModelEnum` | `name`, `schema?`, `values` (each `name` and `note?`) |

**Checking a model.** `checkModel(value)` lists every `ModelProblem` in JSON from a file or the network, each with a `path`, a `message`, and a `severity`: an `error` where the engine could not draw the model, a `warning` for what it ignores, such as an unknown property. `asModel(value)` returns the model when there is no error, else null. `MODEL_SCHEMA` is the same as `model.schema.json`, for editors and validators. An element that names a table, field, group, or note that is not there is left out and reported in the drawn model's `diagnostics` as a `ModelDiagnostic` with a `kind`, a `message`, and its `source`, so a mistake costs that element and not the diagram.

## The engine

`createEngine(options)` returns an `Engine`. Several can live on one page; they share nothing.

**Options** (`EngineOptions`). Each of `model`, `loading`, `display`, and `bases` is a value or a getter (`Input`): a Vue host passes getters and the engine follows them, any other host passes values and calls the setters.

| Option | Meaning |
|---|---|
| `model` | The `Model` to draw. |
| `loading` | True while the model is behind what the host is loading: nothing is placed or dropped against it. |
| `display` | Display options, any subset; the rest take `DEFAULT_DISPLAY`. |
| `bases` | Layouts the diagram inherits, nearest first, each a `LayoutSnapshot`. |
| `layout` | A layout to start from, as `snapshot()` returned it. |
| `layoutState` | A ref to keep every layout layer in, for a host that persists them as they change. |
| `activeView` | A ref to keep the active view's name in. |
| `arrangeViews` | Arrange a named view the first time it is switched to while it has no arrangement of its own. Default true. |

**Members.** Members that hold state are Vue refs: read `.value`.

| Member | What it is or does |
|---|---|
| `model` | The model being shown, with what the methods below added. |
| `diagram` | The drawn model, a `DiagramModel`: the model resolved and indexed, see [The drawn model](#the-drawn-model). |
| `display` | The display options in effect. |
| `loading` | Whether the model is behind. |
| `marked` | Keys of what the last update added, while they are highlighted. |
| `views` | The views, see below. |
| `layout` | The layout, see below. |
| `handle` | The mounted diagram's `DiagramHandle`, or null. |
| `setModel(model)` | Show another model. The layout is kept, tables without a position are placed, and entries for what the model no longer has are dropped. |
| `setLoading(flag)`, `setDisplay(partial)`, `setBases(snapshots)` | Change an input; `setDisplay` merges. |
| `addTables(tables)` | Add tables, or replace those with the same key in place. |
| `addEdges(deps)` | Add lineage edges. |
| `setRows(table, rows)` | Replace a table's records, by table key. |
| `addToView(name, tables)` | Add tables to a named view by key, creating the view. |
| `markChanges()` | Highlight what the next model adds, compared with the current one. The four methods above do it themselves. |
| `selectView(name)` | Switch to a view, or to the Default View with null, and fit it. A named view with no arrangement of its own is arranged first. |
| `setView(name)` | The same as `selectView`. |
| `snapshot()`, `restore(snapshot)` | The layout as plain data to keep wherever the host likes, and back. |
| `arrange(onlyNew?)` | Lay out what the view shows by group and lineage, or only the tables placed automatically since the layout was loaded. False when nothing is mounted or there is nothing to do. |
| `undoArrange()` | Take the last arrangement back while nothing has changed since. |
| `fitToScreen()`, `zoomIn()`, `zoomOut()`, `resetZoom()` | The mounted diagram's viewport. |
| `fit(keys?)` | Fit the view to these elements by key, or to the whole diagram like `fitToScreen()`. |
| `viewport` | The pan and zoom, `DiagramViewport` `{ x, y, zoom }`: a point at diagram coordinates (px, py) is drawn at (px·zoom + x, py·zoom + y) in the pane. Null while no diagram is mounted. |
| `setViewport(partial)` | Pan and zoom; what is left out stays. |
| `lod` | The level of detail the zoom draws at, an `AutoLod`: `'full'`, `'minimal'`, or `'structure'` (see `zoomDetail`); null while no diagram is mounted. |
| `rectOf(key)` | Where a table, field, group, note, or edge is drawn, in client coordinates like `getBoundingClientRect`, worked out from the layout, so it stays right as elements redraw; a mapping of one kind (`…#kind`) is where its column pair is. Null when it is not drawn. |
| `elementOf(key)` | The drawn element of a table, field, group, note, or edge, by key; null when it is not drawn. See [Keys and the DOM](#keys-and-the-dom). |
| `highlight(keys, { dim?, accent? })` | Highlight tables, fields, edges, groups, and notes by key, on top of the engine's own hover and pin, until the next call; `null` clears it. A mapping key (`…#kind`) lights its column pair, drawn even while lineage is drawn by table pair. `dim` fades everything the highlight does not keep: the keys, the tables of their fields and at the ends of their edges, a column pair's table pair, and their groups. `accent` draws some keys more strongly. Nothing moves or is stored; dimmed elements still take hovers and clicks, and a hover lights them through the dim. |
| `highlighted` | What `highlight` last set, as a `Highlight` (`{ keys, accent, dim }`), or null. |
| `setChips(chips)` | Put chips in table headers, after the name, by table key (`Record<string, TableChip[]>`), replacing every chip set before; null takes them all away. A `TableChip` is `{ id, label, color?, outline?, note? }`: outlined for what does not change, such as a kind, filled for what does, such as a status. Its tooltip is its `note`, led by the full label when the label was cut to fit. Every chip is `chipWidth` wide, its label cut with an ellipsis, so a new label never resizes a table; only a table's number of chips does. Not part of the model, and not stored. |
| `chips` | What `setChips` last set, or null. |
| `setCategories(cells)` | Give values a category, by cell key (`schema.table.field[index]`, index 0 on a table with one record), replacing every category set before; null takes them all away. A categorized value is drawn with a dot of its category's color before it, its tooltip names the category, and the legend lists the categories in use. Not part of the model, and not stored. |
| `cellCategories` | What `setCategories` last set, or null. |
| `attach(handle)` | Used by `EngineDiagram` to connect a mounted diagram. |
| `dispose()` | Stop following the inputs. |

**Display options** (`DisplayOptions`; `DEFAULT_DISPLAY` holds the defaults)

| Option | Default | Meaning |
|---|---|---|
| `detailLevel` | `'all'` | `DetailLevel`: all fields, `'keys'` only, or table `'names'` only. |
| `dark` | `false` | Dark theme. |
| `showRefs` | `true` | Draw relationships. |
| `showLineage` | `true` | Draw lineage edges. |
| `lineageColumns` | `false` | Draw every column mapping field to field, styled by kind, with a legend, in place of one edge per pair of tables. |
| `categories` | `{}` | The palette for value categories, by name: `CategoryStyle` `{ label, color }`, the label for the legend and the color of the dot before a value of that category (see `setCategories`). A category it does not name gets a grey dot and its name in the legend. |
| `legendCorner` | `'top-left'` | `LegendCorner`: the corner the legend of lineage kinds and value categories sits in, `'top-left'`, `'top-right'`, `'bottom-left'`, or `'bottom-right'`. A button in the legend folds it to that button, out of the way of what lies under it, and opens it again. |
| `chipWidth` | `72` | How wide every chip `setChips` puts in a table header is drawn, whatever its label. |
| `lineageKinds` | `null` | The lineage kinds drawn, such as `['value']`, or null for every kind. A dep without a kind always shows; a column pair shows while one of its mappings does, styled by the strongest of those; a table pair while one of its deps does; the legend lists only the kinds drawn. `engine.diagram` is the model drawn, so placement and Arrange follow the lineage drawn too. |
| `partialRefMode` | `'badges'` | `PartialRefMode`: refs from a table partial as a badge in the table header, or `'lines'`. |
| `showValues` | `true` | Record values on fields, and the grid or row-count badge of several. |
| `zoomDetail` | `{ minimal: 0.4, structure: 0.1 }` | `ZoomDetail`: the zooms at or below which less is drawn, so many tables stay readable when fitted. At `minimal`, each table shows its name in place of its fields, wrapped to its box at 12px on screen whatever the zoom, chips shrink to dots, group titles show above their groups at 16px, lines keep their width on screen, and lineage is drawn table to table (a column pair the host highlights lights its pair). At `structure`, tables are boxes under their group titles. `{ minimal: 0, structure: 0 }` always draws full detail. |
| `gridRows` | `5` | How many records a table with several shows as a grid, those a lineage edge's `row` names first; a "+N" column opens the rest. 0 shows a row-count badge instead. |
| `lineageLayout` | `false` | Lay tables out by dependency order instead of their stored positions; nothing can be moved meanwhile. |
| `highlightAll` | `false` | Highlight every edge. |
| `pickColors` | `true` | Offer the color picker on hovered tables, groups, and notes and on a selected relationship. The picked color comes back as `set-color`; the host writes it into its model. |
| `revealAdded` | `'pan'` | `RevealAdded`: when an update adds tables, `'pan'` brings them into view at the same zoom; `'fit'` keeps the whole diagram fitted as it grows until the user pans or zooms, then pans; `'none'` leaves the view alone. |

**Views** (`engine.views`, a `Views`)

| Member | What it is or does |
|---|---|
| `activeView` | The active view's name, or null for the Default View. |
| `views`, `view` | Every view of the drawn model, and the active one (`DiagramViewVM`). |
| `hidden` | The tables and notes hidden now: the view's definition plus toggles not saved yet. |
| `baseHidden`, `dirty` | What the definition hides, and whether `hidden` differs from it. |
| `select(name)` | Switch views; what `selectView` calls. |
| `toggle(key)`, `setHidden(keys, isHidden)`, `revert()` | Show or hide tables and notes in the working set, or drop those toggles. |
| `adopt(name)` | The host saved the working set as view `name` in its model: it becomes that view's definition, and the view is not arranged or fitted. |
| `sync(diagram)`, `model` | Follow a new drawn model, and the one last followed; the engine does this itself. |

**Layout** (`engine.layout`, a `Layout`). The layout is kept in layers: the Default View's, and one per named view holding only what that view changes. Positions are by key; `XY` is `{ x, y, w?, h? }`, with `w` and `h` for sticky notes.

| Member | What it is or does |
|---|---|
| `positions` | Where everything is drawn in the active view: layers and inherited layouts combined. |
| `collapsedGroups` | Keys of the folded groups. |
| `unfoldedCompanions` | Keys of the companion tables shown beside their owner; the rest are folded into it. |
| `edgeRoutes` | Hand-drawn relationship routes by ref key. |
| `state` | Every layer as kept, a `LayoutState`. |
| `base` | What the active view's own layer sits on. |
| `setPosition(key, xy)`, `toggleGroup(key)`, `setEdgeRoute(key, rails)` | Change the active view's layer; null rails go back to automatic routing. |
| `setUnfolded(keys, open)` | Show companion tables beside their owners, or fold them back, in the active view's layer, all at once; a click on a companion's badge does it for one. |
| `applyPositionChanges(changes, origin?)` | Store several `PositionChange`s; `'auto'` marks tables placed automatically. |
| `applyArrangement(changes, resetRoutes?)` | Store an arrangement as one step that `undoArrange` can take back. |
| `undoArrange()`, `canUndoArrange`, `undoableArrangeTables` | Take the last arrangement back, whether that is still possible, and how many tables it placed. |
| `newTables` | Tables placed automatically since the layout was loaded and not arranged since. |
| `hasViewLayout(name)` | Whether a named view has an arrangement of its own. |
| `snapshot()`, `replaceLayout(snapshot)`, `resetLayout()` | Save, replace, or empty the layers. |
| `renameView(from, to)`, `copyView(from, to)` | Move or copy a view's layer when the host renames or copies the view. |
| `prune(...)`, `pruneTo(keys)` | Drop entries for what the model no longer has; the engine does this itself. |

A `LayoutSnapshot` is plain JSON: `positions`, `collapsedGroups`, `expandedGroups?` (groups kept open over an inherited fold), `edgeRoutes`, and `views?`, a snapshot per named view.

### The drawn model

`engine.diagram.value` is a `DiagramModel`, the model resolved: `tables` and `tablesByKey` (`TableVM`, with `fields` as `FieldVM`, each with its `key` and, for a single record, its `value`), `refs` (`RefVM`), `deps` (`DepEdgeVM`, one per pair of tables, each with its column pairs in `columns` as `DepColumnVM`, and each pair's mappings by kind in `mappings` as `DepMappingVM`), `groups`, `notes`, `enums`, `views`, the indexes `refsByTable`, `refsByField`, `depsByTable`, `depsByField`, and `diagnostics`. Every element keeps its `source`. The type declarations document each field.

## Drawing it

**`EngineDiagram`** draws one engine and fills its container. Its props are `engine` and, optionally, `tooltipFilter`: `(target: HoverTarget) => boolean`, asked before the engine shows its tooltip for a hovered element; returning false leaves that element to a popover of the host's own, anchored with `element-hover`'s `rect` or `point`. Its events:

| Event | Payload | When |
|---|---|---|
| `element-click` | `ElementClickEvent`: `{ target, source, rect, point, preventDefault() }` | A table, field, partial badge, chip, companion's badge, ref, lineage edge or column pair, group, or note was clicked. `target` is a `HoverTarget`; `rect` is where it is drawn and `point` where the pointer was, both in client coordinates. `preventDefault()` keeps the engine from pinning and selecting it. |
| `element-hover` | `ElementEvent`: `{ target, source, rect, point }`, or null | The pointer moved onto an element, or off every element. |
| `table-click` | `TableLinkPayload`: `{ key, source }` | A table was clicked; `element-click` says the same and more. |
| `table-hover` | `TableLinkPayload` or null | The pointer entered a table, or left every table. |
| `set-color` | `ColorChangePayload`: `{ kind, key, color }` | A color was picked for a table, group, note, or ref (`ColorTarget`); the host writes it into its model. |
| `zoom-change` | the zoom factor | The zoom changed. |
| `viewport-change` | `DiagramViewport` | The pan or zoom changed. |
| `arrange` | `PositionChange[]`, reset route keys | An arrangement was stored. |

**`mount(element, options)`** draws into any element and returns a `MountedDiagram`: `engine` and `unmount()`. Its `MountOptions` are those of `createEngine`, or an `engine` made elsewhere, plus `tooltipFilter` and the events as callbacks: `onElementClick`, `onElementHover`, `onTableClick`, `onTableHover`, `onSetColor`, `onZoomChange`, `onViewportChange`, and `onArrange`. `unmount()` disposes an engine that `mount` created.

`DiagramCanvas` is the component `EngineDiagram` wraps, for hosts that keep their own state; it takes the drawn model, positions, and display options as props.

**Styles and fonts.** The first diagram to draw adds one `style` element to the page. It draws with Open Sans and Inconsolata; load them (for example `@fontsource/open-sans` and `@fontsource/inconsolata`) for the intended look, or the browser's fallbacks are used and measured alike. Give the container a size.

## Keys and the DOM

Everything drawn has a key, the same in the drawn model, the layout, `marked`, and the DOM.

| Element | Key | Helper |
|---|---|---|
| Table | `schema.name`, for example `public.users` | `tableKey(schema, name)` |
| Field | `schema.table.field` | `fieldKey(table, field)` |
| Group | `group:schema.name` | `groupKey(schema, name)` |
| Note | `note:name` | `noteKey(name)`, `isNoteKey(key)` |
| Enum | `enum:schema.name` | `enumKey(schema, name)` |
| Relationship | `name#from(fields)->to(fields)`, with `#2`, `#3` added to repeats | |
| Lineage edge between two tables | `dep:from->to` | |
| Cell of a table's grid: a field in one record | `schema.table.field[index]`, the record's index in `records` | `cellKey(field, index)`, `parseCellKey(key)` |
| Column pair, drawn as one curve | `dep:from(fields)->to(fields)` | |
| Column mapping of one kind | `dep:from(fields)->to(fields)#kind`; a dep without a kind has the column pair's key | |

`DEFAULT_SCHEMA` is `'public'`, and `normalizeSchema` applies it. The key types (`TableKey`, `FieldKey`, `RefKey`, `GroupKey`, `NoteKey`, `EnumKey`, `DepKey`) are all strings.

**DOM hooks.** These are part of the API; any other class or the SVG's structure may change in any version.

- `data-key` on every drawn table (`.dg-table`), field row (`.dg-field`), group (`.dg-group`), note (`.dg-note`), and edge (`.dg-ref`, lineage edges also `.dg-dep`). `elementOf(key)` finds them.
- `is-highlighted` on highlighted tables, fields, and edges; `is-dimmed` on what a host's `highlight` dims and `is-accent` on its accent; `--dg-dim-opacity` on the page sets how faint dimmed elements are (0.15); `is-kind-value` and `is-kind-row` on column pairs drawn by kind, after the strongest kind among their mappings (`value`, then `row`).
- `.dg-chip` (a host's chip in a table header, with its id in `data-chip`), `.dg-companion-badge` (a companion's badge in its owner's header, with its key in `data-companion` and `is-open` while it is shown), `.dg-cell` (a cell of a grid, with its cell key in `data-key`), `.dg-category-dot` (a value's category), `.dg-legend-item.is-category`, `.dg-legend-toggle` and `is-collapsed` on a folded `.dg-legend`, `.dg-grid-heading`, `.dg-grid-more` (the "+N" that opens the rest), and zoomed out `is-overview` on `.dg-root`, `.dg-overview-name`, `.dg-overview-group`, `.dg-chip-dot`, `.dg-field-value` (a record value), `.dg-records-badge`, `.dg-records` (the records table), `.dg-legend`, and `.dg-tooltip`.
- The colors are `--dg-*` CSS variables on the diagram's root, `.dg-root`; `paletteToCssVars(LIGHT)` and `paletteToCssVars(DARK)` list them.

## A diagram that grows

A host can grow a model it gave as a value a little at a time with `addTables`, `addEdges`, `setRows`, and `addToView`. Each keeps the layout and is taken in at once; calls made in the same task are one change.

Tables without a position are placed as they are drawn. One that a dep connects to a placed table goes beside it: an upstream table to the left of the table that reads it, else a downstream table to the right of the one it reads, level with it and pushed down past whatever is in the way, so several stack top to bottom. Tables placed this way anchor the next; tables already placed never move. The others are packed in columns at the right. Add a table and the edges that connect it in the same task, so they are placed together.

What an update adds is highlighted for `MARK_MS` (two seconds); updates in quick succession light up together. The zoom and pan stay where they are, except to bring the tables an update added into view when they land off screen; with `revealAdded: 'fit'` the whole diagram stays fitted as it grows, until the user pans or zooms. `markChanges()` asks for the same for a model given another way; a request waits `MARK_WAIT_MS` for the next model.

```ts
engine.addTables([{ schema: 'input', name: 'item', fields: [{ name: 'unit_cost', type: 'double' }], records: [{ unit_cost: 12.5 }] }]);
engine.addEdges([{ from: { table: 'input.item', fields: ['unit_cost'] }, to: { table: 'money.line_price', fields: ['price'] }, kind: 'value' }]);
engine.addToView('trace_L1_price', ['input.item']);
const row = engine.rectOf('money.line_price.price'); // where the field's row is on screen, to anchor a popover of the host's own
```

## Limitations

- A host without Vue cannot subscribe to changes in the engine's state; it reads `.value` after its own calls and listens to the events.
- `addTables` and the other methods that grow the model replace a model given as a getter with a value.
- Positions are stored by key, so a renamed table loses its position and is placed again.

## All exports

Every entry has all of `core`; `index` and `standalone` add the components and `mount`. `api.json` has each signature.

- **Engine:** `createEngine`, `Engine`, `EngineOptions`, `Input`, `DisplayOptions`, `DEFAULT_DISPLAY`, `DiagramHandle`, `ENGINE_VERSION`, `MARK_MS`, `MARK_WAIT_MS`, `addedKeys` (what one drawn model adds to another).
- **Model:** `Model`, `ModelProject`, `ModelTable`, `ModelField`, `ModelIndex`, `ModelPartial`, `ModelRecord`, `ModelValue`, `ModelRef`, `ModelRefEnd`, `ModelDep`, `ModelEdgeEnd`, `ModelGroup`, `ModelNote`, `ModelView`, `ModelEnum`, `Source`, `MODEL_SCHEMA`, `checkModel`, `asModel`, `ModelProblem`, and the pure edits the growing methods use: `withTables`, `withEdges`, `withRows`, `withViewTables`.
- **Drawn model:** `fromModel` (model to `DiagramModel`), `emptyModel`, `DiagramModel`, `TableVM`, `FieldVM`, `IndexVM`, `RefVM`, `RefEndpointVM`, `EdgeEndpointVM`, `DepLineVM`, `DepEdgeVM`, `DepColumnVM`, `DepMappingVM`, `GroupVM`, `NoteVM`, `EnumVM`, `EnumValueVM`, `DiagramViewVM`, `PartialRefsVM`, `ModelDiagnostic`, `ModelDiagnosticKind`, `MarkerKind`, `AutoLod`, `DetailLevel`, `PartialRefMode`, `TooltipContent` with `buildTooltipContent`, and `HoverTarget`.
- **Keys:** `TableKey`, `FieldKey`, `RefKey`, `GroupKey`, `NoteKey`, `EnumKey`, `DepKey`, `DEFAULT_SCHEMA`, `normalizeSchema`, `tableKey`, `fieldKey`, `groupKey`, `noteKey`, `enumKey`, `isNoteKey`, `cellKey`, `parseCellKey`.
- **Cardinality:** `parseMultiplicity`, `Multiplicity`, `isOneSide`, `isManySide`.
- **Layout and views:** `createLayout`, `Layout`, `LayoutOptions`, `LayoutState`, `LayerState`, `LayoutKeys`, `LayoutSnapshot`, `LayoutLayer`, `PositionOrigin`, `XY`, `PositionsMap`, `PositionChange`, `emptyLayer`, `emptyLayout`, `emptyLayoutState`, `isLayoutState`, `layerFrom`, `layoutStateFrom`, `layoutKeysOfModel`, `baseLayoutFrom`, `minimizeLayout`, `isEmptyLayout`, `createViews`, `Views`, `ViewsOptions`, `hiddenForView`, `visibleEntities`, `sameHidden`.
- **Placing and arranging:** `placeByLineage`, `placeNewItems`, `LineageLink`, `PlacementItem`, `PlacementOptions`, `arrangeByGroup`, `arrangePending`, `ArrangeInput`, `ArrangeOptions`, `ArrangeResult`, `PendingInput`, `createMeasurer`, `Measurer`, `computeTableSize`, `TableSize`, `visibleFields`, `Point`, `Size`, `Rect`.
- **Events and the viewport:** `ElementEvent`, `ElementClickEvent`, `TableLinkPayload`, `ColorTarget`, `ColorChangePayload`, `DiagramViewport`, `RevealAdded`, `Highlight`, `TableChip`, `ZoomDetail`, `CategoryStyle`, `LegendCorner`.
- **Look:** `LIGHT`, `DARK`, `Palette`, `paletteToCssVars`, `normalizeHexColor`, `normalizeHex`, `isValidRails`, `isTypingTarget`.
- **Components and mounting** (`index`, `standalone`): `EngineDiagram`, `DiagramCanvas`, `renderNoteMarkdown`, `mount`, `MountOptions`, `MountedDiagram`.

## Versioning

The version follows [semantic versioning](https://semver.org). Before 1.0, a change that can break a host raises the minor number (0.2.x to 0.3.0) and anything else the patch number; from 1.0 on, breaking changes raise the major number.

The public API is everything the entries export, as `api.json` lists it, plus the model schema, the DOM hooks above, and the behavior this README describes. Four things tell a host which version it has and what changed:

| File | What it says |
|---|---|
| `package.json` and `ENGINE_VERSION` | The version, at install time and at run time. |
| `CHANGELOG.md` | What each version changed, and what a host has to do. |
| `api.json` | Every export with its signature, every member of every exported type, and the components' props and events. Comparing two versions' files shows exactly what changed. |
| `model.schema.json` | The model as a JSON Schema. |

For developers of the engine, a test keeps these in step. When the API differs from `api.json`, the tests fail with the list of changes until it is recorded:

1. Set a new version in `packages/engine/package.json` and `src/version.ts`. Something removed or changed, or a new member a host must fill in, needs a breaking step.
2. Run `npm run api -w @dbml-designer/engine`. It writes `api.json` and `model.schema.json`, and refuses a version that is not newer, or not a breaking step when one is needed. For a change it counts as breaking but that cannot break a host, such as a new optional parameter, run it with `ENGINE_API_COMPATIBLE=1`.
3. Add a section for the version to `CHANGELOG.md`, and name anything new in this README. The tests check both, and that this README names the version it documents.

## Development

From the repository root: `npm test` runs this package's tests with the editor's, `npm run type-check` checks it, and `npm run lint` keeps it to the packages its `package.json` declares, with nothing of DBML, Monaco, Pinia, or the editor. Tests that describe their diagram in DBML for readability get it through `#dbml-testing`, which only the test configuration maps, to the editor's converter.

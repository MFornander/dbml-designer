# TODO

Feature coverage of DBML elements compared with dbdiagram.io, updated 2026-09-17 after the layout comment and Diagram Views work. Element list follows the DBML docs sections (Core Database Markup, Enrichment & Visualization, Data Lineage, Module System, Language Basics). "dbdiagram" behaviour is taken from the docs and from component and constant names in the saved dbdiagram bundle, so it is strong evidence rather than certainty.

## Coverage grid

### Core database markup

| Element | dbdiagram.io | DBML Designer | Match |
|---|---|---|---|
| Project (`database_type`, `Note`) | Not drawn on the canvas; used for export | Parsed, not shown | Full (nothing to draw) |
| Schema (`schema.table`, cross-schema refs) | Qualified names shown, `public` implied | Bare table name in the header with the schema faded at its right (nothing for `public`); the tooltip shows `schema.table` with the schema faded; keys normalize `public` | Full |
| Table (name, alias, `headercolor`, `note`) | Header color, note icon plus tooltip, alias in tooltip | Same | Full |
| Column: `pk`, `unique`, `not null`, `increment` | pk bold with icon; others in tooltip | Same | Full |
| Column: `default` | Tooltip section | Tooltip section | Full |
| Column: `note` | Note icon plus tooltip | Same | Full |
| Column: inline `ref` | Drawn as a relationship, fk icon | Same | Full |
| Column: `check` | Tooltip section | Tooltip section | Full |
| Column type with args, e.g. `varchar(255)` | Right-aligned monospace | Same | Full |
| Indexes (`type`, `name`, `unique`, `pk`, `note`) | Tooltip list on the table | Tooltip list on the table, list icon in the header | Full |
| Composite primary key via `indexes { (a,b) [pk] }` | Member fields bold | Member fields bold with key icon, shown in "Keys only" | Full |
| Checks block (`name`) | Tooltip section | Tooltip section | Full |
| Ref operators `<` `>` `-` `<>` and `?` optional | Crow's foot, bar, and circle markers | Same four marker kinds | Full |
| Ref: composite foreign keys | Anchors at the fields, all highlighted | Anchored at first field, all fields highlighted | Full |
| Ref: `color` | Colored line | Same | Full |
| Ref: `name` | Label at the midpoint when highlighted | Label at the midpoint when highlighted, plus tooltip | Full |
| Ref: `delete` / `update` rules | Labels in the ref popup | Lines in the relationship tooltip | Full |
| Ref: inactive | Dashed line | Dashed line, noted in tooltip | Full |
| Enum (values, value notes, quoted names) | Values in the field tooltip | Same | Full |
| TablePartial and `~injection` | Fields spliced in, injected fields marked | Fields spliced in with correct precedence and refs; tilde icon and "from partial" in tooltip; the refs a partial brings are one `~partial` badge in the table header by default (hover draws them and lists them with the partial's key), or lines by toggle; imported partials included | Full |
| Records / Data Sample | Records icon on the header opens a preview | Parsed, not shown | Not surfaced |

### Enrichment and visualization

| Element | dbdiagram.io | DBML Designer | Match |
|---|---|---|---|
| Sticky Notes (`Note x { }`, `color`) | Draggable, resizable, Markdown rendered, editable in place | Draggable, resizable, colored, Markdown rendered; edited in the DBML text | Full (editing is via the editor by design) |
| TableGroup (members, `color`) | Tinted body, colored header, collapsible, drag moves members | Same: tinted body, collapse toggle, header drag moves members, refs re-anchor to a collapsed group | Full |
| TableGroup `note` | Note icon on the group header | Note icon on the group header, tooltip on hover | Full |
| Notes on Project, Index, TableGroup | Various tooltips | Index notes in the indexes list, group notes in the group tooltip; project note not shown | Partial |
| Custom Metadata (inline and block) | Metadata section in tooltips | Metadata section in table, column, group, and lineage tooltips | Full |
| DiagramView | Right-hand panel: view picker, Save / Save as New, rename and delete, tree of tables and notes with eye toggles; each view keeps its own layout | Same, writing the blocks back into the DBML text; each named view has a layer of positions, collapses, and routes over the Default View, written under `views` in the footer beside `default` | Full |
| Colors: header, ref, group, sticky, lineage | All | All | Full |
| Inactive Ref | Dashed | Dashed | Full |

### Data lineage, modules, basics

| Element | dbdiagram.io | DBML Designer | Match |
|---|---|---|---|
| Dep block and inline `dep` (data lineage) | Table-level lineage edges with column-level mappings in the tooltip, in a separate lineage view | One curved dashed arrow per table pair with the column mappings in its tooltip and drawn on field hover, a Deps-only filter, a Lineage Layout toggle that orders tables by dependency, and Arrange, which lays table groups out as columns in `Dep` order and saves the result | Full |
| Module system: `use`, selective import, aliases, `reuse` | Multi-file projects | Imports resolve next to a followed file (and on the command line); imported elements are drawn, refs and deps cross files, their problems are listed by file. The virtual, unfollowed text cannot import | Full |
| Multi-line strings, comments | Parser level | Parser level | Full |

### Summary

| Rating | Count |
|---|---|
| Full | 30 |
| Partial | 1 |
| Not surfaced (parsed, no UI) | 1 |
| Missing or unsupported | 0 |

## Work items

### Done

- [x] Composite primary keys from `indexes { (a, b) [pk] }` are bold with a key icon.
- [x] Indexes, checks, and metadata in the table tooltip; checks and metadata in the column tooltip.
- [x] Ref `delete` and `update` rules in the relationship tooltip.
- [x] Table-group note icon and tooltip.
- [x] Tilde icon and tooltip line for fields injected from a TablePartial.
- [x] Ref and Dep names drawn at the path midpoint while highlighted.
- [x] Sticky-note content rendered as Markdown.
- [x] Sticky notes resizable from the bottom-right handle; sizes persist.
- [x] Table groups collapse and expand; refs re-anchor to the collapsed box.
- [x] Dragging a group header moves all of its members.
- [x] Dep lineage edges rendered as dashed arrows with a header toggle.
- [x] Editor pane on the left, diagram on the right.
- [x] Lineage Layout toggle in the bottom toolbar: tables with lineage edges laid out in dependency layers with upstream on the left, everything else (groups, notes, tables without lineage) hidden, positions derived (not draggable or persisted), view refits on entry. The Refs / Refs + Deps / Deps dropdown stays a pure connections filter.
- [x] Highlight Relationships toggle in the bottom toolbar: every visible relationship and lineage edge gets the walking-ants overlay, its name label, and endpoint cardinalities; animation is capped at 80 edges to stay smooth, with hover still animating beyond that.
- [x] Visual parity pass against a dbdiagram.io screenshot: tables inherit their group's header color; relationship lines take the "one" side table's color and keep it when highlighted; key, link, unique, and note icons after field names with `NN` and `E` badges after the type; link icon on referenced primary keys; collapse triangle at the left of group headers; curved dashed lineage edges; subtle dark-mode table border; bottom toolbar with zoom percentage, fit, field detail, and Refs / Refs + Deps / Deps filter.
- [x] Lineage edges collapse to one line per table pair between the headers, like dbdiagram; the tooltip lists the column-level mappings, and hovering or pinning a mapped field draws its direct field-to-field line. Refs that leave the same field share one anchor instead of fanning out along the table edge. The Lineage dropdown reads Refs / Refs + Deps / Deps, and the two toolbar dropdowns carry visible Detail and Lineage titles.
- [x] Tooltips restyled after dbdiagram's canvas popover: rounded card with a tinted header, hairline dividers, sentence-case section labels (Note with a book icon, Enum, Default, Settings, Indexes, Check constraints, Column-level, Metadata), orange accents and blue enums, Markdown notes. Placement follows dbdiagram's right-start rule: beside a table, field, or group, flipping to the left when the right side would leave the pane, clamped vertically, and trailing the cursor along a relationship or lineage line. Self references run field to field as a bracket on the table's right edge.
- [x] Header color picker: a gear appears on the hovered table header, group header, or sticky note and opens dbdiagram's popover (its 18 swatches, a Currently Used row, HEX input, and native color input). Picking a color edits the DBML text, replacing or adding the `headercolor` (tables) or `color` (groups, notes) setting in place as a single undoable editor edit; edits are skipped while the diagram is stale.
- [x] Relationship editing: clicking a Ref line pins it and shows anchor dots, draggable control points (one per movable segment plus one on each end stub that inserts a bend, and a mid-point on the hovered stretch between a corner and a control point that becomes a new bend when dragged), a gear for the color picker, and a reset button once the route is hand-drawn. Routes are stored per ref key as alternating x/y rails in the layout store, pruned with the model, simplified on release, and dropped when they equal the automatic route. Colors edit the `Ref` settings list in place; inline refs are removed from the column and re-declared as `Ref: … [color: …]` at the end of the text, keeping the same key.

- [x] Layout inside the DBML file: the view state the DBML spec has no place for (table positions, sticky note positions and sizes, collapsed groups, hand-drawn relationship routes) is written by Export as YAML inside a `/* === DBML DESIGNER FOOTER === ... */` comment at the very end of `<project>.dbml`, so one file carries schema and layout and stays valid DBML. Import and Follow lift the footer out (wherever old footers sit), check it (YAML syntax, section shape, references to tables, notes, groups, and refs the schema lacks, with a direction hint for reversed refs), apply it to the diagram, and show the text without it; Export and Save write a single footer at the end. The editor text is never rewritten by the diagram. Colors and notes stay in the DBML proper, where the spec puts them.
- [x] Layout panel: a collapsible section under the DBML editor, closed by default, holds a read-only Monaco preview of that YAML, following the diagram as tables, notes, groups, and routes change. A drag handle above it resizes it like the pane splitter; its open state and height persist.

- [x] Select and Pan tools like dbdiagram: dragging the bare canvas draws a marquee that selects the tables and notes it touches (Shift adds to the selection), clicking selects one (Shift, Cmd, or Ctrl toggles), and dragging any selected element moves the whole selection as one snapped delta. Holding Space makes canvas drags pan instead, and a middle-button drag pans from anywhere; the hand-shaped Pan toggle was dropped. Escape or a plain click on the canvas clears the selection.

- [x] Editor type matches dbdiagram: Monaco's current default monospace stack (SF Mono first on macOS) at 12px on 18px lines, in both the DBML editor and the layout YAML view. The layout YAML nests tables and groups under their schema and writes ref ends DBML-style with the default schema omitted.

- [x] Diagram Views panel: a right-hand pop-in like dbdiagram's. The view is picked from the View menu at the right of the header, titled like the bottom pickers, which lists the Default View and every `DiagramView` block with a check on the active one, a "New View" entry, and Rename and Delete for the active view (disabled for the Default View and for views declared in imported files); New View and Rename open the panel with its name form. The Default View is listed as "Default", the menu carries the layers icon the bottom button had, and Reset (discarding unsaved toggles) sits between Rename and Delete. The toggle beside that menu shows or hides the panel, and its state persists (the bottom toolbar's Diagram Views button, the panel's own blue picker box, its Reset button, and its close button are gone); the panel is 20rem wide so its title row holds the heading and the Save buttons; Save writes the visible tables and notes into the active block and the Save arrow offers Save as New; new and renamed views are named in a small form pre-filled with "New View" or the next free name. Below: search, Group by Schema or Table Group with visible/total counts and eye toggles per group and per table or note, a show/hide-all toggle, and chips of the visible tables. The tree follows dbdiagram's geometry (child glyphs start under the group label, long names truncate, every eye in one column). Hidden tables drop out of the geometry, taking their edges and emptied groups with them. The active view persists; unsaved toggles survive edits elsewhere in the text and fall back to the Default View if the view disappears.
- [x] Drawing order, bottom to top: open group bodies (largest first, so a group lying inside another stays visible), edges, the tables inside open groups, collapsed groups, tables in no group, then sticky notes; whatever is being dragged rides above the other tables and collapsed groups while it moves. A large open group therefore never hides a collapsed group, a free table, or a note lying across it.
- [x] Per-view layouts: the layout store stacks layers, the imports' Default View, this file's Default View (`views.default` in the footer), then for the active named view what imports say about it and this file's own layer for it (`views.<name>`, holding only what the view changes: moved tables, folded or unfolded groups, drawn or reset routes). The footer's root holds `version` and `views`; older footers with element sections at the root still read as the Default View. Edits go to the active layer, so a new view starts out looking like the Default View and follows it wherever it has not overridden; Save as New copies the source view's layer, Rename carries it over, and pruning drops layers of views that are gone. The validator and `check` read the section and warn about views the DBML lacks.

- [x] Header: a hamburger menu at the top left gathers Export (one `.dbml`, layout included), Import (`.dbml`), Load Example (the starter blog schema with an arranged layout, run through the import path), the light/dark switch, and the DBML docs link; the bottom toolbar's field-detail dropdown is titled Table.

- [x] One menu style everywhere: the hamburger's panel and row classes are shared by the Diagram Views popups, the quick-fix chooser in the Errors list, and the Table and Lineage toolbar pickers, which are now menus (opening upward, current choice checked) instead of native selects.

- [x] Split handle slimmed to 4px with two chevrons like dbdiagram's: `<` hides the editor pane (remembered across sessions), `>` shows it again or widens it by a step.

- [x] Errors button and floating panel like dbdiagram's, replacing the docked Problems panel: a red (or amber for warnings only) pill above the zoom buttons appears while the DBML has problems and toggles a list grouped by the parser's category, with jump-to-location (expanding a hidden editor first), explanations, and quick fixes kept from the old panel.

- [x] Follow files: through a dev-server bridge (`plugins/fileBridge.ts`, `.dbml` files directly under `DBML_ROOTS`, same origin), the app follows a file from disk, picks up every change written to it within a second while keeping the layout arranged here, and writes text plus footer back on ⌘S. The header's file name is a menu of the files under the roots: the first is followed automatically and switching saves unsaved edits first; files are created outside the app. Changes arriving while the editor is dirty wait behind a reload/overwrite bar; a save that would clobber a newer file is refused unless forced. The followed path persists and is resumed without touching the layout. Each file keeps its own arrangement across switches (kept aside and persisted, replaced when its footer is rewritten on disk meanwhile, kept when the footer merely vanished); a file without a footer starts from an empty layout. While an opened file's imports are still loading the model is the previous file's, so the footer is not checked against it, nothing is pruned by it, and nothing is auto-placed. A reload button next to the file name reads the file, its imports, and the file list from disk again on demand, applying a changed file or, with unsaved edits, offering it through the reload/overwrite bar. All watched files (the followed one and its imports) share one server-sent event stream carrying the changed path, since browsers allow about six connections per origin and one stream per file stalled every other request once a file had a handful of imports.

- [x] Module system: the parser store's entry is the followed file's real path, `use` imports are fetched through the file bridge on demand (the compiler is rebuilt when files appear or vanish, since it caches resolution), imported files are watched for changes, and their diagnostics are tagged with the file. Elements declared in imported files are drawn but cannot be recolored, revealed, or have their views rewritten from this text. The command line resolves imports from disk through `DiskProjectLayout`.

- [x] Layout inheritance along imports: the layout store is an inherited layer (footers of imported files, nearest import first, undoings counting as answers) with this diagram's own layer on top; `snapshot()` minimizes the own layer against the base, so a pipeline's footer holds only its own elements, moved imported ones, `collapsed: false` for opened inherited collapses, and `rails: []` for reset inherited routes. Imported footers are re-read when those files change, so their rearrangements flow through while overrides stay.

- [x] Command line: `npm run check -- file.dbml` reports the app's DBML errors and warnings, the diagram adapter's warnings, and layout footer problems as `file:line:col: severity: message` (exit 1 on errors); `npm run graph -- file.dbml [--text]` prints the schema as deterministic JSON or a compact listing (tables, fields, refs with cardinalities, lineage edges with column mappings, groups, views, notes, enums); since issue #8 the JSON is the engine's own model, so it can be handed to the engine as is. Built on the same `@dbml/parse` compiler and adapter as the app, run through `tsx`, so an agent editing the DBML gets the same feedback the Errors button gives.

- [x] Toolchain: TypeScript 6.0, ESLint 10, Vite 8, Vitest 5, Pinia 4, Monaco 0.56 (EditContext input; Space-to-pan leaves typing in either editor alone), `yaml` for the layout comment; floating-vue dropped in favour of the hand-rolled menus.

- [x] Sticky note Markdown styled after dbdiagram: GitHub-style heading sizes with a hairline under h1 and h2, roomier list spacing, and notes that scroll inside their paper with a thin scrollbar (the wheel zooms the canvas only when the note has nothing to scroll).

- [x] Partial-ref badges (issue #1): the adapter records which `TablePartial` each injected ref comes from (`RefVM.viaPartial`) and, per table, the refs of each injected partial with the partial's key columns and note (`TableVM.partialRefs`). By default those refs are not drawn as lines: each table shows one `~partial` badge per partial after its name, the header widening to fit, in the header's text color and at every detail level, in every edge mode (Deps included, so the grain stays in view). Hovering a badge draws its refs with the marching ants (they take no pointer events), lights up the tables and fields they reach, and opens a tooltip with the refs, their cardinalities, and the partial's primary key; clicking it pins them. Hidden partial refs get no anchor or route, and highlight-all and the relationship controls leave them alone, but they stay in the model, so their hand-drawn routes are kept and come back with the lines. A puzzle toggle in the bottom toolbar, always shown between the Table and Lineage menus, switches to lines; the choice persists (UI state version 10). Works for partials imported with `use`. `graph` marks those refs with `viaPartial` and `(from partial …)`. Also fixed: the zoomed-out placeholder bar no longer shows behind the names of tables in the default schema at full zoom.

- [x] Arrange by group (issue #2): Arrange in the header's View menu lays out the active view with an in-house layered layout (`src/engine/geometry/arrange.ts`, no new dependency). Table groups become columns in a topological order of the `Dep` edges between their members (reached directly or through tables in no group), ties broken by declaration order; inside a column tables are layered by the `Dep` edges among them with the longest-path layering shared with Lineage Layout, so every lineage arrow points left to right unless a cycle forbids it. A table in no group goes right after the last group upstream of it, else just before the first group that needs it, sharing a column with its neighbours there; tables with neither group nor lineage are packed at the right, then the visible sticky notes, keeping their sizes. Each layer is ordered by header color (colors rank by first appearance from the left, none last), then by the mean vertical position of its upstream tables' headers, then by declaration order; columns are top-aligned, so a color reads as a row across stages. Refs play no part. Collapsed groups keep their collapse and take only their box's room, their hidden members laid out as if open under the box. Sizes are the all-fields ones auto-placement uses, positions are snapped to the 8px grid, and the same DBML gives the same positions. The result goes through the layout store as one layer edit (positions, plus automatic routing again for hand-drawn routes between moved tables), so it lands in the active view's layer and in the footer on save, imported tables included as overrides. Undo arrange (View menu, the notice's Undo link, or ⌘Z / Ctrl+Z outside text fields and editors) restores the layer from before in one step while nothing else has changed it. Arrange new tables places only the tables auto-placement put down this session, next to their group or lineage neighbours, leaving everything else where it is. 150 tables with 400 `Dep` edges arrange in about 1 ms, and about 15 ms including the re-render, so no worker is needed.

- [x] Drags and hovers re-render only what changed: table, note, and group boxes and edge routes keep the previous object whenever its values are unchanged (`src/engine/state/share.ts`), and each table receives only its own highlighted fields, so a drag frame re-renders the moved table, its group, and its edges instead of the whole diagram, and a hover re-renders only what it highlights. Counted with the real canvas on 200 tables and 400 refs: five drag frames went from 1,000 table and 2,000 edge updates to 5 and 20, and one hover from 200 table updates to 5; `DiagramCanvasRenders.test.ts` asserts these, and that panning and zooming still re-render no table, edge, group, or note.

- [x] Header text contrast: on a colored table header, the name, schema label, note icon, gear, and partial badges use whichever of dark or white text has the higher WCAG contrast ratio, instead of the name, schema, and icon always being white. Light and mid-tone headers such as yellow, orange, pink, teal, and white now read in dark text; group headers and sticky notes follow the same rule.

### Remaining

- [ ] Engine and editor split (issue #8). Step 1, untangling in place: the engine's input is now its own JSON model (`src/engine/model.ts`), indexed by `fromModel.ts`, and the DBML conversion lives in `src/dbml/`, so the engine imports nothing from `@dbml/parse` and every element carries an opaque `source` in place of a DBML token. The layout layers, their inheritance, arrange and its undo, and the active view are per-instance engine state (`src/engine/engine/`). `createEngine()` ties model, views, layout, and display options together, `EngineDiagram` draws an engine, and the editor runs on one engine instance (`engineStore.ts`), which the layout and view stores wrap. The engine lives in `src/engine/` behind `index.ts` and the component-free `core.ts`; a lint rule keeps DBML, Monaco, Pinia, and app modules out of it and deep imports out of the editor. `graph` prints the engine's model, and its own format is gone; a test holds the printed model of every sample and fixture to drawing exactly what the editor draws. Step 1 is done. Still to do: step 2 (workspace packages) and step 3 (JSON files in the editor).
- [ ] Records: an icon on the table header that opens a preview of the sample rows.
- [ ] Project note surfaced somewhere (for example a tooltip on the app title).
- [ ] Auto-arrange for schemas without groups or lineage. Arrange lays out by table groups and `Dep` edges and only packs the rest, since refs play no part; a ref-driven layout for plain ERDs (elkjs in a web worker if it comes to that) is still open. New tables still get deterministic column placement until Arrange new tables places them.
- [ ] Remember across reloads which tables auto-placement put down, so Arrange new tables still finds them after the page reloads (today it knows only this session's).
- [ ] Migrate a table's stored position when it is renamed, instead of re-placing it.

### Out of scope by design

- Publish, accounts, workspaces. Export and import exist only as the `.dbml` file (layout in its closing comment); there is no SQL or image export.

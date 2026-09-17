# TODO

Feature coverage of DBML elements compared with dbdiagram.io, updated 2026-09-17 after the layout comment and Diagram Views work. Element list follows the DBML docs sections (Core Database Markup, Enrichment & Visualization, Data Lineage, Module System, Language Basics). "dbdiagram" behaviour is taken from the docs and from component and constant names in the saved dbdiagram bundle, so it is strong evidence rather than certainty.

## Coverage grid

### Core database markup

| Element | dbdiagram.io | DBML Designer | Match |
|---|---|---|---|
| Project (`database_type`, `Note`) | Not drawn on the canvas; used for export | Parsed, not shown | Full (nothing to draw) |
| Schema (`schema.table`, cross-schema refs) | Qualified names shown, `public` implied | Same; keys normalize `public` | Full |
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
| TablePartial and `~injection` | Fields spliced in, injected fields marked | Fields spliced in with correct precedence and refs; tilde icon and "from partial" in tooltip | Full |
| Records / Data Sample | Records icon on the header opens a preview | Parsed, not shown | Not surfaced |

### Enrichment and visualization

| Element | dbdiagram.io | DBML Designer | Match |
|---|---|---|---|
| Sticky Notes (`Note x { }`, `color`) | Draggable, resizable, Markdown rendered, editable in place | Draggable, resizable, colored, Markdown rendered; edited in the DBML text | Full (editing is via the editor by design) |
| TableGroup (members, `color`) | Tinted body, colored header, collapsible, drag moves members | Same: tinted body, collapse toggle, header drag moves members, refs re-anchor to a collapsed group | Full |
| TableGroup `note` | Note icon on the group header | Note icon on the group header, tooltip on hover | Full |
| Notes on Project, Index, TableGroup | Various tooltips | Index notes in the indexes list, group notes in the group tooltip; project note not shown | Partial |
| Custom Metadata (inline and block) | Metadata section in tooltips | Metadata section in table, column, group, and lineage tooltips | Full |
| DiagramView | Right-hand panel: view picker, Save / Save as New, rename and delete, tree of tables and notes with eye toggles | Same, writing the blocks back into the DBML text | Full |
| Colors: header, ref, group, sticky, lineage | All | All | Full |
| Inactive Ref | Dashed | Dashed | Full |

### Data lineage, modules, basics

| Element | dbdiagram.io | DBML Designer | Match |
|---|---|---|---|
| Dep block and inline `dep` (data lineage) | Table-level lineage edges with column-level mappings in the tooltip, in a separate lineage view | One curved dashed arrow per table pair with the column mappings in its tooltip and drawn on field hover, a Deps-only filter, and a Lineage Layout toggle that orders tables by dependency | Full |
| Module system: `use`, selective import, aliases, `reuse` | Multi-file projects | Single file; an import is reported as an error | Not supported by design |
| Multi-line strings, comments | Parser level | Parser level | Full |

### Summary

| Rating | Count |
|---|---|
| Full | 29 |
| Partial | 1 |
| Not surfaced (parsed, no UI) | 1 |
| Missing or unsupported | 1 |

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

- [x] Layout inside the DBML file: the view state the DBML spec has no place for (table positions, sticky note positions and sizes, collapsed groups, hand-drawn relationship routes) is written by Export as YAML inside a `/* === DBML DESIGNER FOOTER === ... */` comment at the very end of `<project>.dbml`, so one file carries schema and layout and stays valid DBML. Import lifts the comment out, checks it (YAML syntax, section shape, references to tables, notes, groups, and refs the schema lacks, with a direction hint for reversed refs), applies it to the diagram, and leaves a short placeholder comment that Export overwrites. The placeholder is static while arranging; the editor text is never rewritten by the diagram. Colors and notes stay in the DBML proper, where the spec puts them.
- [x] Layout panel: a collapsible section under the DBML editor, closed by default, holds a read-only Monaco preview of that YAML, following the diagram as tables, notes, groups, and routes change. A drag handle above it resizes it like the pane splitter; its open state and height persist.

- [x] Select and Pan tools like dbdiagram: dragging the bare canvas draws a marquee that selects the tables and notes it touches (Shift adds to the selection), clicking selects one (Shift, Cmd, or Ctrl toggles), and dragging any selected element moves the whole selection as one snapped delta. Holding Space, or the single hand-shaped Pan toggle right of Fit to Screen in the bottom toolbar, makes canvas drags pan instead. Escape or a plain click on the canvas clears the selection.

- [x] Editor type matches dbdiagram: Monaco's current default monospace stack (SF Mono first on macOS) at 12px on 18px lines, in both the DBML editor and the layout YAML view. The layout YAML nests tables and groups under their schema and writes ref ends DBML-style with the default schema omitted.

- [x] Diagram Views panel: a right-hand pop-in like dbdiagram's. The bordered blue picker lists the Default View and every `DiagramView` block with a check on the active one and a "+ New View" entry; the dots segment beside it opens Rename and Delete for the active view (disabled for the Default View); Save writes the visible tables and notes into the active block and the Save arrow offers Save as New; new and renamed views are named in a small form pre-filled with "New View" or the next free name. Below: search, Group by Schema or Table Group with visible/total counts and eye toggles per group and per table or note, a show/hide-all toggle, and chips of the visible tables. The tree follows dbdiagram's geometry (child glyphs start under the group label, long names truncate, every eye in one column). Hidden tables drop out of the geometry, taking their edges and emptied groups with them. The active view persists; unsaved toggles survive edits elsewhere in the text and fall back to the Default View if the view disappears.

- [x] Header: a hamburger menu at the top left gathers Export (one `.dbml`, layout included), Import (`.dbml`), Load Example (the starter blog schema with an arranged layout, run through the import path), the light/dark switch, and the DBML docs link; the bottom toolbar's field-detail dropdown is titled Table.

- [x] One menu style everywhere: the hamburger's panel and row classes are shared by the Diagram Views popups, the quick-fix chooser in the Errors list, and the Table and Lineage toolbar pickers, which are now menus (opening upward, current choice checked) instead of native selects.

- [x] Split handle slimmed to 4px with two chevrons like dbdiagram's: `<` hides the editor pane (remembered across sessions), `>` shows it again or widens it by a step.

- [x] Errors button and floating panel like dbdiagram's, replacing the docked Problems panel: a red (or amber for warnings only) pill above the zoom buttons appears while the DBML has problems and toggles a list grouped by the parser's category, with jump-to-location (expanding a hidden editor first), explanations, and quick fixes kept from the old panel.

- [x] Follow a file: through a dev-server bridge (`plugins/fileBridge.ts`, `.dbml` files under `DBML_ROOTS` only, same origin), the app shows a file from disk, picks up every change written to it within a second while keeping the layout arranged here, and writes text plus footer back on ⌘S. Changes arriving while the editor is dirty wait behind a reload/overwrite bar; a save that would clobber a newer file is refused unless forced. The followed path persists and is resumed without touching the layout.

- [x] Command line: `npm run check -- file.dbml` reports the app's DBML errors and warnings, the diagram adapter's warnings, and layout footer problems as `file:line:col: severity: message` (exit 1 on errors); `npm run graph -- file.dbml [--text]` prints the schema as deterministic JSON or a compact listing (tables, fields, refs with cardinalities, lineage edges with column mappings, groups, views, notes, enums). Built on the same `@dbml/parse` compiler and adapter as the app, run through `tsx`, so an agent editing the DBML gets the same feedback the Errors button gives.

- [x] Toolchain: TypeScript 6.0, ESLint 10, Vite 8, Vitest 5, Pinia 4, Monaco 0.56 (EditContext input; Space-to-pan leaves typing in either editor alone), `yaml` for the layout comment; floating-vue dropped in favour of the hand-rolled menus.

- [x] Sticky note Markdown styled after dbdiagram: GitHub-style heading sizes with a hairline under h1 and h2, roomier list spacing, and notes that scroll inside their paper with a thin scrollbar (the wheel zooms the canvas only when the note has nothing to scroll).

### Remaining

- [ ] Records: an icon on the table header that opens a preview of the sample rows.
- [ ] Project note surfaced somewhere (for example a tooltip on the app title).
- [ ] Auto-arrange with elkjs in a web worker (deferred from v1; new tables currently get deterministic column placement).
- [ ] Migrate a table's stored position when it is renamed, instead of re-placing it.

### Out of scope by design

- Module system (`use`, selective import, `reuse`): the app is a single-file REPL.
- Publish, accounts, workspaces. Export and import exist only as the `.dbml` file (layout in its closing comment); there is no SQL or image export.

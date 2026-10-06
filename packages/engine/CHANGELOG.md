# Changelog

Every version of `@dbml-designer/engine`, newest first. Each entry says what changed for a host and what a host has to do, if anything.

The version follows [semantic versioning](https://semver.org). Before 1.0, a change that can break a host raises the minor number (0.2.x to 0.3.0) and anything else the patch number; from 1.0 on, breaking changes raise the major number. `api.json` in the package lists the whole public API of its version, signatures included, so comparing two versions' `api.json` shows every change; `ENGINE_VERSION` says at run time which version a host got. How the API is kept in step with the version is in the README, under "Versioning".

## 0.7.4 - 2026-10-06

A large lineage diagram readable when fitted.

### Added

- Display option `arrangeFor` (`ArrangeFor`): `'all'`, the default, spaces tables for every field as before; `'drawn'` spaces them for the detail level drawn, closer together with names only, and arranges again when the detail level changes while nothing has changed since the arrangement. `DiagramCanvas` prop `arrangeFor`.
- Display option `groupStyle` (`GroupStyle`): `'box'`, the default, as before, or `'band'`, open groups drawn as faint columns of their color as tall as the diagram, titled at the top, with no border. `DiagramCanvas` prop `groupStyle`; DOM hook `is-band` on `.dg-group`.
- `ArrangeOptions.aspect`: the width over height Arrange aims for; the canvas passes its pane's, and `arrangeByGroup` defaults to 1.6. 0 never wraps.

### Changed

- Arrange wraps a layer taller than the pane allows into several columns, filled left to right and then down, as many as let the whole arrangement fit the pane at the largest zoom, so a group of many inputs no longer sets the fitted zoom on its own. Tables that read nothing, such as inputs, are ordered by where the tables that read them sit, after their color. Arranging again can move tables that did not move before.
- Zoomed out to `minimal`, a table drawn as its header alone (names only, or keys with none) shows its name on one line in the header, as large as the header holds up to 12px on screen, in place of a placeholder bar.
- Zoomed out, lineage is drawn as thin, light, solid lines; lit and accented edges keep their color. `--dg-overview-edge` sets the color.

## 0.7.3 - 2026-10-01

### Added

- A button in the legend folds it to that button, out of the way of what lies under it, and opens it again; the reader's choice, kept while the diagram is mounted. DOM hooks `.dg-legend-toggle`, and `is-collapsed` on a folded `.dg-legend`.

## 0.7.2 - 2026-10-01

### Added

- Display option `legendCorner` (`LegendCorner`): the corner the legend sits in, `'top-left'` (the default, as before), `'top-right'`, `'bottom-left'`, or `'bottom-right'`, so it need not cover a table placed in the top-left corner. `DiagramCanvas` prop `legendCorner`; the legend carries `is-<corner>`.

## 0.7.1 - 2026-10-01

Value categories, with the host's palette and a legend.

### Added

- `engine.setCategories(cells)` and `engine.cellCategories`: a category per value, by cell key (index 0 on a table with one record), replacing every category set before; null takes them away. Like chips, they are the host's: not part of the model, and not stored.
- Display option `categories`: the palette, by name, a `CategoryStyle` `{ label, color }` each. A categorized value gets a dot of its color in the gap before it, its text left as it is; a category the palette does not name gets a grey dot. A value's tooltip names its category, and the legend lists the categories of the values drawn, the palette's first in its order, then the rest by name, with or without lineage by column.
- `DiagramCanvas` props `cellCategories` and `categories`; DOM hooks `.dg-category-dot` and `.dg-legend-item.is-category`.

## 0.7.0 - 2026-10-01

Companion tables folded into their owners.

### Added

- `ModelTable.companionOf` and `companionLabel`: a table that accompanies another, such as a provenance twin or an explain view, is folded into its owner's header as a badge (dashed while folded) until unfolded. Shown, it is placed below its owner, inside its group, without moving anything placed; folded again, it keeps its place for next time. A folded companion is not drawn, nor is its lineage. `TableVM.companionOf` and `TableVM.companions` (each with its badge's label) resolve them; an owner that is not there, or is a companion itself, is reported as `unresolved-companion`.
- The fold state is the layout's, per view, like collapsed groups: `layout.unfoldedCompanions`, and `layout.setUnfolded(keys, open)` to show or fold any number at once. A badge click arrives as `{ kind: 'companion', tableKey, companion }`, whose default shows or folds it; `preventDefault()` leaves it as it is.
- `LayoutSnapshot.unfoldedCompanions` and `foldedCompanions`, the latter undoing an unfold a layout underneath records. DOM hook `.dg-companion-badge`, with `data-companion` and `is-open`.

### Changed (breaking)

- `HoverTarget` and `TooltipContent.kind` have `companion`; `ModelDiagnosticKind` has `unresolved-companion`. `LayerState` has `unfoldedCompanions` and `foldedCompanions` (optional in `LayoutLayer`); `TableSize` has `companions`.

### Fixed

- Zoomed out, a group's title is cut to the group's width with an ellipsis, the whole title on hover, so it no longer runs into the next group's.

## 0.6.1 - 2026-10-01

A diagram of many tables stays readable when fitted.

### Added

- Display option `zoomDetail` (`ZoomDetail`, `{ minimal: 0.4, structure: 0.1 }`): the zooms at or below which less is drawn. Below 0.4, 12px field text is drawn under 5px on screen, so a readable name is shown instead. At `minimal`, each table shows its name in place of its fields, wrapped to its box (after `_`, `.`, `-`, or between words) at 12px on screen whatever the zoom; chips shrink to dots; group titles show above their groups at 16px; lines keep their width on screen; and lineage is drawn table to table, a column pair the host highlights lighting its pair. At `structure`, tables are boxes under their group titles. `{ minimal: 0, structure: 0 }` always draws full detail.
- `engine.lod`: the level of detail the mounted diagram's zoom draws at.
- DOM hooks `is-overview` on `.dg-root`, `.dg-overview-name`, `.dg-overview-group`, and `.dg-chip-dot`.

### Changed

- Tables show their names in place of their fields from zoom 0.4 down, where they used to draw fields down to 0.2 and placeholder bars below; the bars remain only for a box too small for its name.
- A grid heading's whole label is the native tooltip of its group, no longer inside the heading's text.

## 0.6.0 - 2026-10-01

Several records as a grid in their table, and lineage between cells.

### Added

- `ModelEdgeEnd.row`: the record an end is about, by index in the table's `records` or by the values of its key fields. Deps of one kind between the same columns but different records are one curve; `DepMappingVM.rows` lists the record pairs, and the column pair's tooltip lists them by label. A row that is not there is left out and reported as `unresolved-row`.
- The grid: a table with several records shows a value column per record on its field rows, up to the display option `gridRows` (5), those a lineage edge names first, each headed by the record's label in the header (`TableVM.recordLabels`: the key values that differ among the records, else 1, 2, 3; the whole label on hover) and capped at 80 px; a "+N" column opens the rest as a table. `TableVM.recordOrder` is the order shown.
- Cells: `cellKey(field, index)` and `parseCellKey`, keys like `power.line_power.input_watts[2]`. A cell's hovers and clicks reach the host as a field target with `row`, with the cell's own `rect`; hovering one lights the cells its records lead to and the curves between them; `highlight` and `rectOf` take cell keys, a record past those shown standing on its "+N", and a cell of a table with one record, which has no grid, on its field. A cell's tooltip shows its record's label and value.
- DOM hooks `.dg-cell` (with its cell key in `data-key`), `.dg-grid-heading`, and `.dg-grid-more`.

### Changed (breaking)

- A table with several records shows the grid instead of the row-count badge; `gridRows: 0` keeps the badge.
- `ModelDiagnostic.kind` has `unresolved-row`, and is named `ModelDiagnosticKind`; `HighlightSet` has `cellKeys`. `computeTableSize` takes `gridRows` after the chip width; `TableSize` has `grid`, and `RowMetrics` `cells`.
- A second dep of the same kind between the same columns adds its records to the first mapping instead of being dropped.

## 0.5.0 - 2026-10-01

Chips in table headers, kept by the host.

### Added

- `engine.setChips(chips)` and `engine.chips`: chips in table headers after the name, by table key, replacing every chip set before; null takes them away. A `TableChip` is `{ id, label, color?, outline?, note? }`: outlined for what does not change, filled for what does. Its tooltip is its `note`, led by the full label when the label was cut, so nothing is lost to the ellipsis. Like `highlight`, chips are the host's: not part of the model, and not stored.
- Display option `chipWidth` (72): every chip is that wide, its label cut with an ellipsis, so a new label never resizes a table; only a table's number of chips does.
- `DiagramCanvas` props `chips` and `chipWidth`; the DOM hook `.dg-chip` with `data-chip`.

### Changed (breaking)

- `HoverTarget` has a new kind, `{ kind: 'chip', tableKey, chip }`, in `element-click` and `element-hover` (with the chip's own `rect` and its table's `source`), and so has `TooltipContent.kind`. A host that switches over every kind adds it. A chip lights up its table on hover, and a click on it selects and pins its table like a click on the header.
- `TableSize` has `chips`, and `computeTableSize` takes the chips and their width after `values`.

## 0.4.3 - 2026-10-01

Lineage filtered by kind.

### Added

- Display option `lineageKinds`: the lineage kinds drawn, such as `['value']`, or null (the default) for every kind. A dep without a kind always shows; a column pair shows while one of its mappings does, styled by the strongest of those; a table pair while one of its deps does; the legend lists only the kinds drawn. It filters the model drawn (`engine.diagram`), so hovers, tooltips, `highlight`, placement of new tables, and Arrange all follow the lineage drawn. Other display changes leave the drawn model as it is.

## 0.4.2 - 2026-10-01

The host decides where the engine's tooltip shows.

### Added

- `tooltipFilter`, a prop of `EngineDiagram` and `DiagramCanvas` and an option of `mount`: `(target: HoverTarget) => boolean`, asked before the engine shows its tooltip for a hovered element. Return false to leave that element to a popover of the host's own, anchored with `element-hover`'s `rect` or `point`, so the two never show together.

## 0.4.1 - 2026-10-01

The host can highlight and dim.

### Added

- `engine.highlight(keys, { dim?, accent? })` and `engine.highlighted` (`Highlight`): tables, fields, edges, groups, and notes lit by key on top of the engine's own hover and pin. A mapping key lights its column pair, drawn even while lineage is drawn by table pair. `dim` fades what the highlight does not keep; `accent` draws some keys more strongly. It is an overlay: nothing moves or is stored, and dimmed elements still take hovers and clicks. Host-lit edges are drawn highlighted without the walking ants, which stay for the pointer and for updates.
- `DiagramCanvas` prop `highlighted`; DOM hooks `is-dimmed` and `is-accent`, and the CSS variable `--dg-dim-opacity`.

## 0.4.0 - 2026-10-01

Every element's clicks and hovers reach the host, with where it is on screen, and the viewport can be read and set.

### Added

- `element-click` and `element-hover` on `EngineDiagram` and `DiagramCanvas`, `onElementClick` and `onElementHover` for `mount`. The payload, `ElementEvent`, carries the `target` (a `HoverTarget`: a table, field, partial badge, ref, lineage edge or column pair, group, or note), its `source`, its `rect` (where it is drawn, the extent of its route for an edge), and the pointer's `point`, both in client coordinates. `ElementClickEvent` adds `preventDefault()`, which keeps the engine from pinning and selecting what was clicked. `table-click` and `table-hover` stay as they were.
- `engine.rectOf(key)`: where an element is drawn, in client coordinates, from the layout rather than the DOM, so it stays right as elements redraw. A mapping key (`…#kind`) gives its column pair's.
- `engine.viewport` (`DiagramViewport`, `{ x, y, zoom }`, reactive, null while nothing is mounted), `engine.setViewport(partial)`, and `engine.fit(keys?)`, which fits the view to elements by key, or to everything. `viewport-change` and `onViewportChange` report every pan and zoom.
- Display option `revealAdded` (`RevealAdded`): `'pan'` (the default, as before), `'fit'` to keep the whole diagram fitted as it grows until the user pans or zooms, or `'none'`.

### Changed

- `DiagramHandle` has four new members: `fit`, `rectOf`, `viewport`, and `setViewport`. Only a host that implements its own handle for `attach` must add them; `EngineDiagram` and `mount` do.
- Pressing a table or note without moving it, or drawing a selection on the bare canvas, no longer ends the automatic fit that holds while the pane settles; moving something, panning, or zooming still does.

## 0.3.0 - 2026-10-01

Column mappings keep their kind. Before, a second dep between the same two columns was dropped whatever its kind, so a column that is both projected (`value`) and joined on (`row`) lost one of the two.

### Changed (breaking)

- `DepColumnVM` is now a column pair: every mapping between the same columns, in `mappings` as `DepMappingVM`s, strongest kind first (`value`, then `row`, then any other, then none). It is still drawn as one curve with the same key, `dep:from(fields)->to(fields)`; its `kind` is the strongest mapping's, its `label` joins their names, and its `source` is the strongest mapping's. `note` and `metadata` moved from `DepColumnVM` to each `DepMappingVM`. A host that read `columns[i].note` or `.metadata` reads them from `columns[i].mappings` instead.
- A mapping of a kind has its own key, `dep:from(fields)->to(fields)#kind`; a dep without a kind keeps the column pair's key. `addedKeys` and `markChanges` list a new mapping's key along with its column pair and edge.

### Added

- `DepMappingVM`: a mapping's `key`, `kind`, `label` (the dep's name), `note`, `metadata`, and `source`.
- A column pair's tooltip lists all of its kinds, names, and notes; a mapping key's tooltip shows that mapping alone. The table pair's tooltip lists each column pair once, with its kinds.

## 0.2.0 - 2026-10-01

The first version handed to other projects.

### Added

- Record values (issue #4): `ModelTable.records`, rows of `ModelValue`s by field name. One record shows its values on the fields (`FieldVM.value`); several get a row-count badge that opens them as a table. Display option `showValues`.
- Lineage by kind (issue #5): `ModelDep.kind` (`value` draws solid, `row` in short dashes). Display option `lineageColumns` draws every column mapping field to field, with a legend. Each mapping keeps its own dep's kind, note, and metadata (`DepColumnVM.kind`, `.note`, `.metadata`).
- Views opened from outside (issue #6): `selectView` fits the view, and first arranges a named view that has no arrangement of its own. Option `arrangeViews` turns the arranging off; `layout.hasViewLayout` tells whether a view has one.
- Growing a diagram (issue #7): `addTables`, `addEdges`, `setRows`, `addToView`, `setView`, `model`, `markChanges`, `marked`, `elementOf`. New tables are placed beside a placed table lineage connects them to (`placeByLineage`); what an update adds is highlighted for `MARK_MS`. Also `addedKeys`, `withTables`, `withEdges`, `withRows`, `withViewTables`, `placeNewItems`, display option `pickColors`, and a `data-key` on every drawn field row.
- Versioning: `ENGINE_VERSION`, `api.json`, `model.schema.json` (also importable as `@dbml-designer/engine/model.schema.json`), and this changelog.
- The types the signatures use: `Point`, `Rect`, `Size`, `HoverTarget`, `PlacementOptions`.

### Changed

- `DiagramHandle` has a new member, `element(key)`. Only a host that implements its own handle for `attach` must add it; `EngineDiagram` and `mount` do.
- After a view switch or an Arrange, the diagram stays fitted while its element settles, as it does on first load, until the user zooms, pans, or drags.

## 0.1.0

The engine split out of the DBML Designer editor (issue #8): `createEngine`, `EngineDiagram`, `mount`, the `Model` with `MODEL_SCHEMA` and `checkModel`, layout layers and views per engine, and the three entries `@dbml-designer/engine`, `/core`, and `/standalone`. Never handed out.

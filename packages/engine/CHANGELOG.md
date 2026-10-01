# Changelog

Every version of `@dbml-designer/engine`, newest first. Each entry says what changed for a host and what a host has to do, if anything.

The version follows [semantic versioning](https://semver.org). Before 1.0, a change that can break a host raises the minor number (0.2.x to 0.3.0) and anything else the patch number; from 1.0 on, breaking changes raise the major number. `api.json` in the package lists the whole public API of its version, signatures included, so comparing two versions' `api.json` shows every change; `ENGINE_VERSION` says at run time which version a host got. How the API is kept in step with the version is in the README, under "Versioning".

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

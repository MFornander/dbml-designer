# Changelog

Every version of `@dbml-designer/engine`, newest first. Each entry says what changed for a host and what a host has to do, if anything.

The version follows [semantic versioning](https://semver.org). Before 1.0, a change that can break a host raises the minor number (0.2.x to 0.3.0) and anything else the patch number; from 1.0 on, breaking changes raise the major number. `api.json` in the package lists the whole public API of its version, signatures included, so comparing two versions' `api.json` shows every change; `ENGINE_VERSION` says at run time which version a host got. How the API is kept in step with the version is in the README, under "Versioning".

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

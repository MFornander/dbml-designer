# DBML Designer

A single-page DBML editor and diagram in the spirit of [dbdiagram.io](https://dbdiagram.io). Type or paste [DBML](https://dbml.dbdiagram.io/docs) on the left and the entity-relationship diagram on the right updates as you type.

Everything runs in the browser: no accounts, no server. Your text and layout are kept in `localStorage`, and can be exported as a `.dbml` file with a `.dbml.yaml` layout sidecar.

## Features

### Editor

- Monaco editor with DBML highlighting, completions, go-to-definition, and inline diagnostics from the official `@dbml/parse` compiler.
- An Errors button appears above the zoom buttons while the DBML or the layout text has errors or warnings, and toggles a floating list of them like dbdiagram's. Click an entry to jump to it in the right editor; entries with explanations or quick fixes expand in place. While the DBML has errors, the diagram keeps showing the last valid schema.
- Click a table in the diagram to reveal its declaration in the editor.
- A thin handle between the panes resizes them. Its chevrons hide the editor (`<`) or show and widen it (`>`).
- The DBML / Layout switch in the header swaps the editor for the layout sidecar as YAML. It is a real editor: valid changes are applied to the diagram after a short pause, and arranging the diagram edits the text in place, keeping your comments and ordering. Syntax and shape problems are underlined and stop the text from being applied; entries for tables, notes, groups, or relationships the DBML does not have are kept with a warning instead of being dropped. The footer shows the state, and Reset to diagram rewrites the text from the diagram.

### Diagram

- Tables with fields and key icons (composite keys and partial-injected fields included), header colors, collapsible table groups, and Markdown sticky notes.
- Relationships drawn with crow's-foot ends. Lines leaving the same field share one anchor, and each line takes the color of the table it points to.
- Data lineage: `Dep` blocks and inline `dep` settings draw one dashed curve per pair of tables. Hovering it lists the column mappings; hovering a mapped field draws that field-to-field arrow.
- Three detail levels (all fields, keys only, table names) and light and dark themes.
- Hover a table, field, or line to highlight its connections with a marching-ants effect, the line's name, and its cardinalities. Click to pin, or turn on Highlight Relationships to animate every connection.
- Tooltips styled like dbdiagram's popovers, with sections for notes, enums, defaults, indexes, checks, metadata, relationship rules, and column-level lineage. They open beside a table or field and trail the cursor along a line.

### Arranging

- Drag tables, notes, or a whole group by its header, snapped to an 8px grid. Resize notes from their corner.
- Drag on the empty canvas to select; the selected tables and notes move together. Shift-click or Cmd-click adds or removes one.
- Hold Space, or switch on the Pan tool, to drag the canvas around. Scroll to zoom.
- Lineage Layout arranges tables in dependency order, upstream on the left.
- Click a relationship to reroute it: drag a control point to move a segment, drag the mid-point between two points to add a bend, and reset to return to the automatic route.

### Colors and views, written back into the DBML

- A gear on a hovered table, group, or note, or on a selected relationship, opens dbdiagram's color picker. The choice becomes a `headercolor` or `color` setting in the text as one undoable edit. An inline `ref:` is moved to a `Ref:` line first, since inline refs cannot carry settings.
- The Diagram Views panel, modelled on dbdiagram's, toggles tables and notes on and off in a tree grouped by schema or table group, with search, visible/total counts, and an eye per row. Named views are `DiagramView` blocks in the text: the picker lists them with a check on the active one and a "+ New View" entry, the dots next to it rename or delete the active view, and Save or Save as New write the visible set back into the DBML. A view lists what it shows, so it cannot hide every table or every note.

### Toolbar and menu

- Bottom toolbar: zoom, fit, and the Pan tool on the left; the Table and Lineage menus, Highlight Relationships, Lineage Layout, and Diagram Views on the right. Every menu in the app, from the hamburger to these two pickers, shares one look.
- The menu at the top left holds Export, Import, the light/dark switch, and a link to the DBML docs. Export downloads `<project>.dbml` and the Layout view's text as `<project>.dbml.yaml`. Import accepts either file, or both at once; an imported layout is shown as it is in the Layout view, with its problems flagged, and is applied to the diagram when it has no errors.

## Layout sidecar

DBML holds the schema and the presentation the spec allows in the text: `headercolor` on tables, `color` on groups, refs, and notes, `Note` documentation, and `DiagramView` blocks. Everything else about a diagram has no place in the spec, so it lives in a sidecar named after the DBML file, `blog.dbml.yaml` next to `blog.dbml` (the base name comes from the `Project`, else `schema`):

```yaml
version: 1
tables:
  public:
    posts: { x: 0, y: 64 }
    users: { x: 288, y: 0 }
notes:
  tips: { x: 800, y: 0, w: 192, h: 160 }
groups:
  public:
    content: { collapsed: true }
refs:
  - from: users(id)
    to: posts(author_id)
    rails: [ 264.5, 72, 320 ]
```

- Positions are diagram pixels. Tables and groups are nested under their schema; notes are keyed by name.
- A ref is identified by its optional `name` and its two ends, written like DBML as `table(fields)` with the schema left out when it is `public` (`sales.orders(id)` otherwise). The referenced table comes first: an inline `ref: > users.id` on `posts.author_id` is `from: users(id)`, `to: posts(author_id)`. A route written the other way round gets a warning with a one-click swap.
- `rails` are the alternating x, y, x, ... coordinates of the movable segments of a hand-drawn route.
- Empty sections are left out. Entries the DBML does not have are ignored by the diagram and flagged in the Layout view; when a table leaves the DBML, its entry leaves the text.
- Both the text and the layout it describes are kept in `localStorage` between sessions, so the sidecar file is for sharing and versioning alongside the `.dbml`.

## Development

```bash
npm install
npm run dev
```

The dev server listens on all interfaces on port 5173, so it is reachable locally at `http://localhost:5173` and by teammates on the same network at `http://<your-machine-ip>:5173` (Vite prints the Network URL on start). Vite's host check allows IP addresses, `localhost`, and `.local` Bonjour names; add other hostnames to `server.allowedHosts` in `vite.config.ts`. macOS may ask once to allow incoming connections for `node`.

Other scripts:

| Command | What it does |
|---|---|
| `npm test` | Unit and component tests with Vitest |
| `npm run type-check` | `vue-tsc` against `tsconfig.app.json` |
| `npm run lint` | ESLint over the whole project |
| `npm run build` | Type-check and produce a production build in `dist/` |
| `npm run preview` | Serve the production build locally |

## Layout of the code

- `src/editor/` wraps Monaco and registers the DBML language services.
- `src/layout/` is the `.dbml.yaml` sidecar: its format and writer, the validator that turns a file into diagnostics and a snapshot, and the in-place editor that writes diagram changes back into the text.
- `src/stores/` holds Pinia stores for the editor text, the compiler state, saved positions, the layout text, and UI preferences.
- `src/components/` is the app shell: header, split panes, the Errors list, the Diagram Views panel, the shared menu pieces under `common/`, and the diagram pane.
- `src/diagram/` is the renderer. `adapter/` turns the raw parser output into a view model, `geometry/` holds framework-free layout, routing, and marker math, `state/` holds the Vue composables for pan, zoom, drag, hover, and tooltips, and `components/` are the SVG nodes.

## Licensing

Apache-2.0. The editor half is adapted from the `dbml-playground` app in [holistics/dbml](https://github.com/holistics/dbml), also Apache-2.0; see `NOTICE` for the list of adapted files. The diagram renderer is original work whose dimensions and colors were chosen to resemble dbdiagram.io.

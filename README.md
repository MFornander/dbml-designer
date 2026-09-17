# DBML Designer

A single-page DBML editor and diagram in the spirit of [dbdiagram.io](https://dbdiagram.io). Type or paste [DBML](https://dbml.dbdiagram.io/docs) on the left and the entity-relationship diagram on the right updates as you type.

Everything runs in the browser: no accounts, no server. Your text and layout are kept in `localStorage`, and export as one `.dbml` file that carries the layout in a comment at its end.

![DBML Designer showing the example blog schema: the DBML editor and the collapsible Layout panel on the left, the diagram with tables, a table group, relationships, a lineage edge, and a sticky note on the right](docs/screenshot.png)

## Features

### Editor

- Monaco editor with DBML highlighting, completions, go-to-definition, and inline diagnostics from the official `@dbml/parse` compiler.
- An Errors button appears above the zoom buttons while the DBML has errors or warnings, and toggles a floating list of them like dbdiagram's. Click an entry to jump to it; entries with explanations or quick fixes expand in place. While the DBML has errors, the diagram keeps showing the last valid schema.
- Click a table in the diagram to reveal its declaration in the editor.
- A thin handle between the panes resizes them. Its chevrons hide the editor (`<`) or show and widen it (`>`).
- A collapsible Layout panel under the editor, closed by default, shows the layout as read-only YAML, exactly what Export writes into the footer comment at the end of the file. It follows the diagram as you arrange it, and the handle above it resizes it like the one between the panes.

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
- Lineage Layout shows only the tables that take part in `Dep` lineage, arranged in dependency order with upstream on the left.
- Click a relationship to reroute it: drag a control point to move a segment, drag the mid-point between two points to add a bend, and reset to return to the automatic route.

### Colors and views, written back into the DBML

- A gear on a hovered table, group, or note, or on a selected relationship, opens dbdiagram's color picker. The choice becomes a `headercolor` or `color` setting in the text as one undoable edit. An inline `ref:` is moved to a `Ref:` line first, since inline refs cannot carry settings.
- The Diagram Views panel, modelled on dbdiagram's, toggles tables and notes on and off in a tree grouped by schema or table group, with search, visible/total counts, and an eye per row. Named views are `DiagramView` blocks in the text: the picker lists them with a check on the active one and a "+ New View" entry, the dots next to it rename or delete the active view, and Save or Save as New write the visible set back into the DBML. A view lists what it shows, so it cannot hide every table or every note.

### Toolbar and menu

- Bottom toolbar: zoom, fit, and the Pan tool on the left; the Table and Lineage menus, Highlight Relationships, Lineage Layout, and Diagram Views on the right. Every menu in the app, from the hamburger to these two pickers, shares one look.
- The menu at the top left holds Export, Import, Load Example, the light/dark switch, and a link to the DBML docs. Export downloads `<project>.dbml` with the layout in a comment at the end. Import reads any `.dbml`; if it ends with such a comment, the layout is lifted out and applied to the diagram. Load Example replaces the text and layout with the starter blog schema, arranged.

## Layout comment

DBML holds the schema and the presentation the spec allows in the text: `headercolor` on tables, `color` on groups, refs, and notes, `Note` documentation, and `DiagramView` blocks. Everything else about a diagram has no place in the spec, so Export writes it as YAML inside a multi-line comment at the very end of the `.dbml`. DBML ignores comments, so the file stays valid for any DBML tool, and one file carries both the schema and its layout (the file name comes from the `Project`, else `schema`):

```dbml
Table users { id int [pk] }
Table posts { id int [pk]  author_id int [ref: > users.id] }

/* === DBML DESIGNER FOOTER ===
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
*/
```

- The Layout panel under the editor is a read-only preview of this YAML and follows the diagram as you arrange it.
- Import lifts the comment out of the file, checks it against the schema, applies it to the diagram, and leaves a short placeholder comment where Export will write the layout again. The placeholder is static while you arrange; Export replaces it. Entries for tables, notes, groups, or relationships the DBML does not have are ignored and counted in the status line; a comment that is not valid layout YAML is reported and skipped.
- Positions are diagram pixels. Tables and groups are nested under their schema; notes are keyed by name.
- A ref is identified by its optional `name` and its two ends, written like DBML as `table(fields)` with the schema left out when it is `public` (`sales.orders(id)` otherwise). The referenced table comes first: an inline `ref: > users.id` on `posts.author_id` is `from: users(id)`, `to: posts(author_id)`.
- `rails` are the alternating x, y, x, ... coordinates of the movable segments of a hand-drawn route.
- Empty sections are left out. The layout is kept in `localStorage` between sessions, so the exported file is for sharing and versioning.

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
| `npm run type-check` | `vue-tsc` for the app and `tsc` for the command line |
| `npm run lint` | ESLint over the whole project |
| `npm run build` | Type-check and produce a production build in `dist/` |
| `npm run preview` | Serve the production build locally |

## Following a file

To work on a `.dbml` together with another program, an agent or an editor, let the app follow the file instead of importing it. Choose Follow file… in the menu, pick a file or type its path, and the editor shows it; every change written to the file appears within a second, and the layout you arranged stays put. ⌘S (Ctrl-S) writes the text and the layout footer back to the file; the status next to the title says whether you have unsaved changes. If the file changes on disk while you have unsaved edits, a bar above the editor offers to reload from disk or overwrite with yours, and a save that would clobber someone else's write is refused the same way.

Following works through the dev server only. It reaches `.dbml` files in this repo by default; to add folders, put them in `.env.local`, colon-separated, and restart the dev server:

```bash
DBML_ROOTS=/Users/me/pipeline-wiki:/Users/me/other-repo
```

The bridge reads and writes only `.dbml` files under those roots, from the same origin. Remember the dev server listens on the network, so keep the roots to what you mean to share.

## Working with an agent

The follow-file bridge and the command line together let an agent write the DBML while you watch the diagram and arrange it. Using `~/github/pipeline-wiki` as the repo the model lives in:

1. Point the dev server at that repo, once, and restart it:

   ```bash
   echo 'DBML_ROOTS=/Users/me/github/pipeline-wiki' > .env.local
   ```

   Colon-separate several folders if the agent should also reach the repos being modeled.

2. In DBML Designer, choose Follow file… from the menu and type `/Users/me/github/pipeline-wiki/schema.dbml`. A path that does not exist yet is fine: press ⌘S once and the file is created with the layout footer.

3. Start the agent in that repo and give it the instructions as the first prompt, rather than through a `CLAUDE.md`, so they travel with the task:

   ```markdown
   The model lives in schema.dbml. DBML spec: ~/github/dbml/dbml-homepage/docs/docs.md
   and ~/github/dbml/dbml-homepage/docs/syntax/. Edit the DBML with normal file edits;
   a human watches the diagram live and arranges it.

   After every edit run this and fix what it reports before moving on:
     npm run --prefix ~/github/dbml-edit check -- $PWD/schema.dbml
   To read the model back as data:
     npm run --prefix ~/github/dbml-edit graph -- $PWD/schema.dbml --text

   Conventions: one Table per dataset, schemas for systems (kafka.events, s3.raw_orders);
   Dep blocks for lineage with column mappings; Note for what a table is and where it
   comes from; Metadata for owner, repo, schedule; TableGroup per stage; a DiagramView
   per pipeline. Never edit or remove the /* === DBML DESIGNER FOOTER === ... */ comment
   at the end; it holds the human's layout.
   ```

Each write the agent makes lands in the diagram within a second. You arrange, press ⌘S, and both of you commit the one file.

## Command line

Two commands expose what the app knows about a `.dbml` file, for scripts and for an agent that writes DBML and needs feedback without a browser:

```bash
npm run check -- path/to/schema.dbml
```

`check` prints the same errors and warnings the Errors button shows, plus the diagram adapter's warnings (duplicate refs, view entries that resolve to nothing) and any problems in the layout footer, as `file:line:col: severity: message`. It exits 1 when there are errors, 0 otherwise, and takes several files at once.

```bash
npm run graph -- path/to/schema.dbml
npm run graph -- path/to/schema.dbml --text
```

`graph` prints the schema as data in declaration order: project, tables with their fields and group, refs with both ends and cardinalities, lineage edges with their column mappings, groups, views, notes, and enums. JSON by default, or a compact listing with `--text`. It refuses a file with errors and prints them instead. The DBML text stays the source of truth; these commands only read it.

## Layout of the code

- `src/editor/` wraps Monaco and registers the DBML language services.
- `src/layout/` is the layout: its YAML format and writer, the validator that turns imported YAML into diagnostics and a snapshot, the comment handling that puts it into and lifts it out of a `.dbml`, and the import/export composable.
- `src/cli/` is the pure logic behind the `check` and `graph` commands; `cli/` is their Node entry point.
- `plugins/fileBridge.ts` is the dev-server side of following a file; `src/files/` is its browser client and `src/stores/fileLinkStore.ts` the state around it.
- `src/stores/` holds Pinia stores for the editor text, the compiler state, saved positions, and UI preferences.
- `src/components/` is the app shell: header, split panes, the Errors list, the Diagram Views panel, the shared menu pieces under `common/`, and the diagram pane.
- `src/diagram/` is the renderer. `adapter/` turns the raw parser output into a view model, `geometry/` holds framework-free layout, routing, and marker math, `state/` holds the Vue composables for pan, zoom, drag, hover, and tooltips, and `components/` are the SVG nodes.

## Licensing

Apache-2.0. The editor half is adapted from the `dbml-playground` app in [holistics/dbml](https://github.com/holistics/dbml), also Apache-2.0; see `NOTICE` for the list of adapted files. The diagram renderer is original work whose dimensions and colors were chosen to resemble dbdiagram.io.

# AGENTS.md

A short guide for coding agents working in this repository, or using its diagram engine from another one.

## What is here

- `packages/engine` (`@dbml-designer/engine`): a diagram engine that draws tables, relationships, lineage, groups, notes, views, and rows of data from a plain JSON model. It knows nothing of DBML, editors, or files.
- `packages/editor` (`@dbml-designer/editor`): DBML Designer, a Vue app with a Monaco editor. It converts DBML, or model JSON files, to the engine's model, follows files on disk through its dev server, and can be embedded in an iframe.

## Where to look

| Question | Read |
|---|---|
| Every field of the model | `packages/engine/model.schema.json` (JSON Schema, with a description per field), or `packages/engine/src/model.ts` |
| The engine's API: creating, drawing, growing, keys, DOM hooks | `packages/engine/README.md` |
| Every export and signature of an engine version | `packages/engine/api.json` |
| What changed between engine versions | `packages/engine/CHANGELOG.md`, or compare two versions' `api.json` |
| Putting a diagram in another app, and the iframe protocol | `docs/embedding.md` |
| The editor: features, the layout footer, following files, the command line | `README.md` |
| Why things are the way they are | the "Done" list in `TODO.md`, and the GitHub issues it cites |

## Using the engine

- Build a `Model` (see the schema) and check JSON from elsewhere with `checkModel` or `asModel` before drawing it.
- To get a model from DBML, run `npm run graph -- file.dbml` in this repository: it prints the model as JSON.
- `ENGINE_VERSION` tells which engine version is running.
- Key formats: a table is `schema.name`, a field is `schema.table.field`. The engine README lists the rest.

## Working in this repository

Run everything from the root:

| Command | What it does |
|---|---|
| `npm install` | Install and link the two workspace packages |
| `npm test` | Vitest, both packages |
| `npm run lint` | ESLint, including the import boundaries below |
| `npm run type-check` | Type-check both packages |
| `npm run build` | Build the engine library, then the editor |
| `npm run dev` | The editor's dev server on port 5173 |
| `npm run check -- file.dbml` / `npm run graph -- file.dbml` | Check a DBML or model file, or print its model |

Rules the tests and lint enforce:

- The engine imports only its own modules and the packages its `package.json` declares: nothing of DBML, Monaco, Pinia, or the editor. Engine tests that want DBML input use `#dbml-testing`. The editor imports the engine only as `@dbml-designer/engine` or `@dbml-designer/engine/core`.
- The engine's public API is versioned. A change to it fails `api.test.ts` until you set a new version in `packages/engine/package.json` and `src/version.ts` (a breaking step for anything removed or changed), run `npm run api -w @dbml-designer/engine`, add a `CHANGELOG.md` section, and name anything new in the engine README.
- The iframe protocol is documented in `docs/embedding.md`, and a test checks that every message is there. Raise `HOST_PROTOCOL_VERSION` in `packages/editor/src/host/useHostMessages.ts` when a change could break a page written for the version before.

Conventions:

- Keep `README.md`, the engine README, and `TODO.md` current with what changes for users. A finished feature gets an entry in the "Done" list of `TODO.md`.
- In Markdown, write each paragraph or list item as one line; do not wrap prose at a fixed width.
- `npm run graph` and `npm run check` output for the sample models in `packages/editor/src/sample/` should change only when that is the point of the change.

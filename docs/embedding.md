# Embedding DBML Designer

An app can show a diagram it builds, and grow it as it goes, without files or DBML. There are two ways in:

| Way | When | Reference |
|---|---|---|
| The engine as a component | The app bundles JavaScript: Vue, React, or plain DOM. Fastest, with full access to the diagram's state and its drawn elements. | [packages/engine/README.md](../packages/engine/README.md) |
| The editor in an iframe | The app cannot bundle the engine, or wants the editor's menus and panels too. It talks to the editor with `postMessage`. | This page |

Both take the same model: the engine's `Model`, described in the engine README and in [model.schema.json](../packages/engine/model.schema.json). Both keep the layout as the model grows, place new tables beside the tables lineage connects them to, and highlight what is new for two seconds.

## The iframe protocol, version 1

### Setting up

Load the editor in an iframe. Add `?readonly` to show the diagram alone: no editor pane, nothing saved, nothing written into the text. Add `&view=name` to open a view once the model has it.

```html
<iframe id="designer" src="http://localhost:5173/?readonly" style="width: 100%; height: 600px; border: 0"></iframe>
```

The editor runs on the DBML Designer dev server (`npm run dev` in the repository). Embedded, it keeps its state to itself, apart from the editor opened on its own in another tab, and follows no file until one is picked from its file menu.

Wait for `dbml-designer:ready` before sending anything; it says which protocol and engine versions the editor has. Then send the model, and additions to it as they come:

```js
const frame = document.getElementById('designer');
const send = (message) => frame.contentWindow.postMessage(message, '*');

window.addEventListener('message', (e) => {
  if (e.source !== frame.contentWindow) return;
  const m = e.data;
  if (m.type === 'dbml-designer:ready') {
    if (m.protocol !== 1) console.warn(`Written for protocol 1, the editor speaks ${m.protocol}`);
    send({ type: 'dbml-designer:model', model: firstModel });
  }
  if (m.type === 'dbml-designer:error') console.error(m.request, m.message);
  if (m.type === 'dbml-designer:rect') placeTooltip(m.key, m.rect);
});

// Later: a table and the edge that connects it, posted together so they are placed together.
send({ type: 'dbml-designer:addTables', tables: [{ schema: 'input', name: 'item', fields: [{ name: 'unit_cost', type: 'double' }] }] });
send({ type: 'dbml-designer:addEdges', edges: [{ from: { table: 'input.item', fields: ['unit_cost'] }, to: { table: 'money.line_price', fields: ['price'] }, kind: 'value' }] });
```

### Messages to the editor

Every message is an object whose `type` starts `dbml-designer:`. Others are ignored.

| `type` | Fields | What it does |
|---|---|---|
| `dbml-designer:model` | `model`: a `Model` | Shows this model in place of whatever was shown, and stops following a file. Not highlighted. |
| `dbml-designer:addTables` | `tables`: `ModelTable[]` | Adds tables, or replaces those with the same key in place. |
| `dbml-designer:addEdges` | `edges`: `ModelDep[]` | Adds lineage edges. |
| `dbml-designer:setRows` | `table`: a table key; `rows`: `ModelRecord[]` | Replaces a table's records. |
| `dbml-designer:addToView` | `view`: a view name; `tables`: table keys | Adds tables to a view, creating it. |
| `dbml-designer:setView` | `view`: a view name, or null for the Default View | Switches views and fits the view; a view with no arrangement of its own is arranged first. Additions sent before it are taken in first. |
| `dbml-designer:readOnly` | `readOnly`: boolean | Turns read-only on or off, as `?readonly` does. |
| `dbml-designer:rect` | `key`: a table, field, group, note, or edge key | Asks where that element is drawn; answered with `dbml-designer:rect`. |

Additions (`addTables`, `addEdges`, `setRows`, `addToView`) posted together are taken in as one change, right after the messages already on their way: the layout is kept, new tables are placed beside a placed table a dep connects them to, and what is new is highlighted. A change that would leave a model the engine cannot draw is dropped as a whole and answered with `dbml-designer:error`. Keys are those of the engine: `schema.name` for a table, `schema.table.field` for a field; the engine README lists them all.

### Messages from the editor

| `type` | Fields | When |
|---|---|---|
| `dbml-designer:ready` | `protocol`: this protocol's version; `engine`: the engine's version | Once the editor listens. |
| `dbml-designer:rect` | `key`; `rect`: `{ x, y, width, height }` in the iframe's pixels, or null when the element is not drawn | In answer to `dbml-designer:rect`. |
| `dbml-designer:error` | `message`; `request`: the type of the message, or types of the batch, it answers | A message could not be carried out as sent. |

Only messages from the window that embeds the editor are heard, and answers go back to that window's origin.

### Types

The editor's own definitions, in [useHostMessages.ts](../packages/editor/src/host/useHostMessages.ts), with the model types from `@dbml-designer/engine`:

```ts
type HostMessage =
  | { type: 'dbml-designer:model'; model: Model }
  | { type: 'dbml-designer:addTables'; tables: ModelTable[] }
  | { type: 'dbml-designer:addEdges'; edges: ModelDep[] }
  | { type: 'dbml-designer:setRows'; table: string; rows: ModelRecord[] }
  | { type: 'dbml-designer:addToView'; view: string; tables: string[] }
  | { type: 'dbml-designer:setView'; view: string | null }
  | { type: 'dbml-designer:readOnly'; readOnly: boolean }
  | { type: 'dbml-designer:rect'; key: string };

type EditorMessage =
  | { type: 'dbml-designer:ready'; protocol: number; engine: string }
  | { type: 'dbml-designer:rect'; key: string; rect: { x: number; y: number; width: number; height: number } | null }
  | { type: 'dbml-designer:error'; message: string; request?: string };
```

### Versions

The protocol has a version of its own, sent with `dbml-designer:ready`. It goes up when a page written for the version before could break: a message or a field removed, or changed in meaning. New messages and new optional fields keep it. The model inside the messages is versioned with the engine; see its [CHANGELOG.md](../packages/engine/CHANGELOG.md).

| Protocol | Engine | Changes |
|---|---|---|
| 1 | 0.2.0 | The first version: the messages above. |

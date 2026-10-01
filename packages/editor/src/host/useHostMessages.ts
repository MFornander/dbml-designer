/**
 * The editor in an iframe, driven by the page around it with `postMessage` and a model instead of
 * text: the model to show, then additions to it, taken in like a followed file's change (the
 * layout kept, new tables placed next to their lineage neighbours, what is new marked for a
 * moment) at once rather than after the typing pause, those posted together as one.
 * The model is the engine's (see its README); the editor holds it as a model file's JSON, so DBML
 * never comes into it.
 *
 * Messages are objects with a `type` starting `dbml-designer:`. Only the embedding page is heard,
 * and it is told `dbml-designer:ready` once the editor listens. A message that does not fit gets a
 * `dbml-designer:error` reply.
 */
import { onBeforeUnmount, onMounted } from 'vue';
import {
  asModel, withEdges, withRows, withTables, withViewTables,
  type Model, type ModelDep, type ModelRecord, type ModelTable,
} from '@dbml-designer/engine/core';
import { modelFileText, withoutSources } from '@/model/modelFile';
import { useEditorStore } from '@/stores/editorStore';
import { useEngineStore } from '@/stores/engineStore';
import { useFileLinkStore } from '@/stores/fileLinkStore';
import { useParserStore } from '@/stores/parserStore';
import { isEmbedded } from '@/utils/embedded';

export type HostMessage =
  /** Show this model, replacing whatever is shown. */
  | { type: 'dbml-designer:model'; model: Model }
  | { type: 'dbml-designer:addTables'; tables: ModelTable[] }
  | { type: 'dbml-designer:addEdges'; edges: ModelDep[] }
  | { type: 'dbml-designer:setRows'; table: string; rows: ModelRecord[] }
  | { type: 'dbml-designer:addToView'; view: string; tables: string[] }
  /** Switch views by name; null for the Default View. */
  | { type: 'dbml-designer:setView'; view: string | null }
  | { type: 'dbml-designer:readOnly'; readOnly: boolean }
  /** Where an element is drawn, by key, in the iframe's pixels: answered with `dbml-designer:rect`. */
  | { type: 'dbml-designer:rect'; key: string };

export type HostReply =
  | { type: 'dbml-designer:rect'; key: string; rect: { x: number; y: number; width: number; height: number } | null }
  | { type: 'dbml-designer:error'; message: string; request?: string };

const PREFIX = 'dbml-designer:';

/** After the messages already on their way: those the page posted together arrive before this. */
const afterPending = (run: () => void) => setTimeout(run, 0);

/**
 * Carry out messages from the embedding page. A message is answered at once when it cannot be
 * carried out as sent; additions the page posted together are taken in together as one
 * change, so a table and the edges that connect it are placed together. `reply` gets what is
 * found wrong only then.
 */
export function useHostHandler (reply: (r: HostReply) => void = () => undefined) {
  const editor = useEditorStore();
  const parser = useParserStore();
  const link = useFileLinkStore();
  const { engine } = useEngineStore();

  const error = (message: string, request?: string): HostReply => ({
    type: 'dbml-designer:error',
    message,
    ...(request ? { request } : {}),
  });

  /** Show a model: as a model file's JSON, read at once. A followed file is let go, since the page drives now. */
  function show (model: Model, mark: boolean): void {
    if (link.path) link.stop();
    if (mark) engine.markChanges();
    editor.setLanguage('json');
    editor.setText(modelFileText(model));
    parser.parseNow();
  }

  /** Additions waiting for the others posted with them, with the message each came in. */
  let queued: { request: string; update: (m: Model) => Model }[] = [];

  /** Take in the additions waiting, as one change, if what results is a model the engine can draw. */
  function flush (): void {
    const batch = queued;
    queued = [];
    if (batch.length === 0) return;
    const next = asModel(batch.reduce((m, a) => a.update(m), withoutSources(engine.model.value ?? { tables: [] })));
    if (next) show(next, true);
    else reply(error('The model would not be valid after this change', batch.map((a) => a.request).join(', ')));
  }

  function add (request: string, update: (m: Model) => Model): null {
    if (queued.length === 0) afterPending(flush);
    queued.push({
      request,
      update,
    });
    return null;
  }

  function handle (data: unknown): HostReply | null {
    if (typeof data !== 'object' || data === null) return null;
    const m = data as Partial<HostMessage> & { type?: unknown };
    if (typeof m.type !== 'string' || !m.type.startsWith(PREFIX)) return null;
    switch (m.type) {
      case 'dbml-designer:model': {
        const model = asModel((m as { model?: unknown }).model);
        if (!model) return error('Not a model', m.type);
        // A whole new model replaces what waits to be added to the old one.
        queued = [];
        show(model, false);
        return null;
      }
      case 'dbml-designer:addTables':
        return add(m.type, (model) => withTables(model, (m as { tables?: ModelTable[] }).tables ?? []));
      case 'dbml-designer:addEdges':
        return add(m.type, (model) => withEdges(model, (m as { edges?: ModelDep[] }).edges ?? []));
      case 'dbml-designer:setRows': {
        const { table, rows } = m as { table?: string; rows?: ModelRecord[] };
        if (typeof table !== 'string' || !Array.isArray(rows)) return error('setRows takes a table key and rows', m.type);
        return add(m.type, (model) => withRows(model, table, rows));
      }
      case 'dbml-designer:addToView': {
        const { view, tables } = m as { view?: string; tables?: string[] };
        if (typeof view !== 'string' || !Array.isArray(tables)) return error('addToView takes a view name and table keys', m.type);
        return add(m.type, (model) => withViewTables(model, view, tables));
      }
      case 'dbml-designer:setView': {
        // After the additions before it, which may bring the view.
        flush();
        const { view } = m as { view?: string | null };
        engine.selectView(typeof view === 'string' ? view : null);
        return null;
      }
      case 'dbml-designer:readOnly':
        editor.setReadOnly((m as { readOnly?: boolean }).readOnly !== false);
        return null;
      case 'dbml-designer:rect': {
        const { key } = m as { key?: string };
        if (typeof key !== 'string') return error('rect takes a key', m.type);
        const r = engine.elementOf(key)?.getBoundingClientRect();
        return {
          type: 'dbml-designer:rect',
          key,
          rect: r
            ? {
                x: r.x,
                y: r.y,
                width: r.width,
                height: r.height,
              }
            : null,
        };
      }
      default:
        return error(`Unknown message ${m.type}`, m.type);
    }
  }

  return {
    handle,
    /** Take in the additions waiting now. */
    flush,
  };
}

/** Listen to the embedding page, when there is one. */
export function useHostMessages (): void {
  if (!isEmbedded()) return;
  let origin = '*';
  const send = (r: HostReply) => window.parent.postMessage(r, origin);
  const { handle } = useHostHandler(send);
  function onMessage (e: MessageEvent): void {
    if (e.source !== window.parent) return;
    origin = e.origin === 'null' ? '*' : e.origin;
    const reply = handle(e.data);
    if (reply) send(reply);
  }
  onMounted(() => {
    window.addEventListener('message', onMessage);
    window.parent.postMessage({ type: 'dbml-designer:ready' }, '*');
  });
  onBeforeUnmount(() => window.removeEventListener('message', onMessage));
}

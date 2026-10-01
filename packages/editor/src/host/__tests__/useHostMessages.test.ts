// @vitest-environment happy-dom
import {
  describe, it, expect, beforeEach,
} from 'vitest';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import type { Model } from '@dbml-designer/engine';
import { useHostHandler } from '@/host/useHostMessages';
import { useTextEdits } from '@/editor/useTextEdits';
import { readOnlyFromLocation, useEditorStore } from '@/stores/editorStore';
import { useEngineStore } from '@/stores/engineStore';
import { useFileLinkStore } from '@/stores/fileLinkStore';

const MODEL: Model = {
  tables: [
    { schema: 'spec', name: 'order_line', fields: [{ name: 'item_id', type: 'text' }] },
    { schema: 'money', name: 'line_price', fields: [{ name: 'price', type: 'double' }] },
  ],
  deps: [{ from: { table: 'spec.order_line', fields: ['item_id'] }, to: { table: 'money.line_price', fields: ['price'] }, kind: 'row' }],
};

describe('messages from the embedding page', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('show a model as a model file, at once, and add to it without any DBML, additions together', async () => {
    const { handle, flush } = useHostHandler();
    const editor = useEditorStore();
    const { engine } = useEngineStore();
    expect(handle({ type: 'dbml-designer:model', model: MODEL })).toBeNull();
    expect(editor.language).toBe('json');
    expect(engine.diagram.value.tables.map((t) => t.key)).toEqual(['spec.order_line', 'money.line_price']);

    handle({
      type: 'dbml-designer:addTables',
      tables: [{ schema: 'input', name: 'item', fields: [{ name: 'unit_cost', type: 'double' }] }],
    });
    handle({
      type: 'dbml-designer:addEdges',
      edges: [{ from: { table: 'input.item', fields: ['unit_cost'] }, to: { table: 'money.line_price', fields: ['price'] }, kind: 'value' }],
    });
    handle({ type: 'dbml-designer:setRows', table: 'input.item', rows: [{ unit_cost: 12.5 }] });
    handle({ type: 'dbml-designer:addToView', view: 'trace', tables: ['input.item', 'money.line_price'] });
    // Nothing yet: the additions wait for the others posted with them, to be taken in as one change.
    expect(engine.diagram.value.tables).toHaveLength(2);
    flush();
    await nextTick();
    const m = engine.diagram.value;
    expect(m.tables.map((t) => t.key)).toEqual(['spec.order_line', 'money.line_price', 'input.item']);
    expect(m.tablesByKey.get('input.item')!.fields[0]!.value).toBe(12.5);
    expect(m.deps.flatMap((d) => d.columns.map((c) => c.kind))).toEqual(['row', 'value']);
    expect(editor.text).toContain('"unit_cost"');
    expect(editor.text).not.toContain('"source"');

    handle({ type: 'dbml-designer:setView', view: 'trace' });
    expect(engine.views.activeView.value).toBe('trace');
  });

  it('answer what does not fit with an error, and ignore what is not for them', () => {
    const replies: unknown[] = [];
    const { handle, flush } = useHostHandler((r) => replies.push(r));
    expect(handle({ type: 'dbml-designer:model', model: { tables: 'no' } })).toMatchObject({ type: 'dbml-designer:error', request: 'dbml-designer:model' });
    expect(handle({ type: 'dbml-designer:setRows', table: 'x' })).toMatchObject({ type: 'dbml-designer:error' });
    expect(handle({ type: 'dbml-designer:nope' })).toMatchObject({ type: 'dbml-designer:error', message: 'Unknown message dbml-designer:nope' });
    expect(handle({ type: 'something-else' })).toBeNull();
    expect(handle('hello')).toBeNull();
    expect(handle({ type: 'dbml-designer:rect', key: 'spec.order_line' })).toEqual({ type: 'dbml-designer:rect', key: 'spec.order_line', rect: null });
    // An addition that breaks the model is found when it is taken in, and leaves the model alone.
    handle({ type: 'dbml-designer:addTables', tables: [{ name: 'broken' }] });
    flush();
    expect(replies).toEqual([{ type: 'dbml-designer:error', message: 'The model would not be valid after this change', request: 'dbml-designer:addTables' }]);
  });

  it('turn read-only on: nothing is written into the text or saved', async () => {
    const { handle } = useHostHandler();
    const editor = useEditorStore();
    handle({ type: 'dbml-designer:readOnly', readOnly: true });
    expect(editor.readOnly).toBe(true);
    const before = editor.text;
    useTextEdits().apply([{ start: 0, end: 0, text: '// edit\n' }]);
    expect(editor.text).toBe(before);
    expect(await useFileLinkStore().save()).toBe(false);
    // The page's own model still comes in.
    handle({ type: 'dbml-designer:model', model: MODEL });
    expect(editor.language).toBe('json');
  });
});

describe('readOnlyFromLocation', () => {
  it('reads the readonly flag of a link', () => {
    expect(readOnlyFromLocation('?readonly')).toBe(true);
    expect(readOnlyFromLocation('?readonly=1&view=x')).toBe(true);
    expect(readOnlyFromLocation('?readonly=false')).toBe(false);
    expect(readOnlyFromLocation('?readonly=0')).toBe(false);
    expect(readOnlyFromLocation('')).toBe(false);
  });
});

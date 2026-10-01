import { describe, it, expect } from 'vitest';
import { fromModel, type Model } from '@dbml-designer/engine/core';
import { applyTextEdits } from '@/editor/colorEdit';
import { modelFileText } from '@/model/modelFile';
import {
  deleteModelView, modelViewOf, renameModelView, upsertModelView,
} from '@/model/viewEdits';

const MODEL: Model = {
  tables: ['a', 'b', 'c'].map((name) => ({
    name,
    fields: [],
  })),
  notes: [{
    name: 'tips',
    content: 'Read me',
  }],
};

const views = (text: string) => JSON.parse(text).model.views;

describe('views in a model file', () => {
  it('list only the kinds something is hidden of', () => {
    const m = fromModel(MODEL);
    expect(modelViewOf('focus', {
      tables: m.tables.slice(0, 2),
      notes: m.notes,
    }, {
      tables: 3,
      notes: 1,
    })).toEqual({
      name: 'focus',
      tables: ['public.a', 'public.b'],
    });
  });

  it('are added, replaced, renamed, and removed as edits to model.views', () => {
    let text = modelFileText(MODEL);
    text = applyTextEdits(text, upsertModelView(text, null, {
      name: 'one',
      tables: ['public.a'],
    }));
    expect(views(text)).toEqual([{
      name: 'one',
      tables: ['public.a'],
    }]);
    text = applyTextEdits(text, upsertModelView(text, null, {
      name: 'two',
      notes: [],
    }));
    expect(views(text).map((v: { name: string }) => v.name)).toEqual(['one', 'two']);
    text = applyTextEdits(text, upsertModelView(text, ['model', 'views', 0], {
      name: 'one',
      tables: ['public.b', 'public.c'],
    }));
    expect(views(text)[0].tables).toEqual(['public.b', 'public.c']);
    text = applyTextEdits(text, renameModelView(text, ['model', 'views', 1], 'second'));
    expect(views(text)[1].name).toBe('second');
    text = applyTextEdits(text, deleteModelView(text, ['model', 'views', 0]));
    expect(views(text)).toEqual([{
      name: 'second',
      notes: [],
    }]);
  });
});

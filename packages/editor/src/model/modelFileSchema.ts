/**
 * A model file as a JSON Schema, for Monaco's checking and completion: the engine's model schema
 * under `model`, and the layout the editor writes, the structure of a `.dbml` footer, under `layout`.
 */
import { MODEL_SCHEMA } from '@dbml-designer/engine/core';
import { MODEL_FILE_VERSION } from './modelFile';

const { definitions, $schema, $id: _modelId, ...model } = MODEL_SCHEMA;

const POSITION = {
  type: 'object',
  properties: {
    x: { type: 'number' },
    y: { type: 'number' },
    w: { type: 'number' },
    h: { type: 'number' },
  },
};

const LAYOUT_VIEW = {
  type: 'object',
  properties: {
    tables: {
      type: 'object',
      description: 'Positions by schema, then table name.',
      additionalProperties: {
        type: 'object',
        additionalProperties: POSITION,
      },
    },
    notes: {
      type: 'object',
      description: 'Positions and sizes by note name.',
      additionalProperties: POSITION,
    },
    groups: {
      type: 'object',
      description: 'Folded (`collapsed: true`) or unfolded groups, by schema, then group name.',
      additionalProperties: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          properties: { collapsed: { type: 'boolean' } },
        },
      },
    },
    refs: {
      type: 'array',
      description: 'Hand-drawn routes.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          from: { type: 'string' },
          to: { type: 'string' },
          rails: {
            type: 'array',
            items: { type: 'number' },
          },
        },
      },
    },
  },
};

export const MODEL_FILE_SCHEMA = {
  $schema,
  $id: 'https://github.com/MFornander/dbml-designer/schemas/model-file.json',
  title: 'Model file',
  description: 'A diagram engine model with its layout, as DBML Designer opens, follows, and saves it.',
  type: 'object',
  required: ['version', 'model'],
  additionalProperties: false,
  properties: {
    version: {
      const: MODEL_FILE_VERSION,
      description: 'Version of the model file format.',
    },
    model,
    layout: {
      type: 'object',
      description: 'The arrangement, written by the editor on save: the structure of a `.dbml` footer.',
      properties: {
        version: { const: 1 },
        views: {
          type: 'object',
          description: '`default` is the Default View; every other entry is a named view with only what it changes.',
          additionalProperties: LAYOUT_VIEW,
        },
      },
    },
  },
  definitions,
};

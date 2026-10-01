// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import { ENGINE_VERSION } from '@dbml-designer/engine/core';
import {
  HOST_MESSAGE_TYPES, HOST_PROTOCOL_VERSION, HOST_REPLY_TYPES, readyMessage, useHostHandler,
} from '@/host/useHostMessages';

/** A file of the repository, found from wherever the tests run: the root or the package. */
function inRepository (path: string): string {
  let dir = process.cwd();
  while (!existsSync(join(dir, path)) && dirname(dir) !== dir) dir = dirname(dir);
  return join(dir, path);
}

const doc = readFileSync(inRepository('docs/embedding.md'), 'utf8');

describe('the iframe protocol', () => {
  it('is the one docs/embedding.md describes: its version, and every message each way', () => {
    expect(doc).toContain(`## The iframe protocol, version ${HOST_PROTOCOL_VERSION}`);
    expect(doc).toMatch(new RegExp(`^\\| ${HOST_PROTOCOL_VERSION} \\| `, 'm'));
    for (const type of [...HOST_MESSAGE_TYPES, ...HOST_REPLY_TYPES]) expect(doc, type).toContain(`| \`${type}\` |`);
  });

  it('says its version and the engine\'s when ready, and takes every message it lists', () => {
    expect(readyMessage()).toEqual({
      type: 'dbml-designer:ready',
      protocol: HOST_PROTOCOL_VERSION,
      engine: ENGINE_VERSION,
    });
    setActivePinia(createPinia());
    const { handle } = useHostHandler();
    for (const type of HOST_MESSAGE_TYPES) {
      const reply = handle({ type });
      expect(reply && reply.type === 'dbml-designer:error' ? reply.message : '', type).not.toMatch(/^Unknown message/);
    }
  });
});

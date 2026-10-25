import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readFile } from 'node:fs/promises';

const packageId = 'dsh-plugin-terminal-upgrades';

test('the built bundle registers one module and cleans up its listeners', async () => {
  const documentListeners = [];
  const windowListeners = [];
  const disposers = [];
  let loaded;

  globalThis.document = {
    addEventListener: (...args) => documentListeners.push(args),
    removeEventListener: (...args) => {
      const index = documentListeners.findIndex(([type, handler, capture]) => type === args[0] && handler === args[1] && capture === args[2]);
      assert.notEqual(index, -1, `removed listener ${args[0]} was registered`);
      documentListeners.splice(index, 1);
    },
  };
  globalThis.fetch = async () => ({ ok: false });
  globalThis.window = {
    __ModuleLoader__: {
      load: ({ id, factory }) => { loaded = { id, exports: factory(() => ({})) }; },
    },
    addEventListener: (...args) => windowListeners.push(args),
    removeEventListener: (...args) => {
      const index = windowListeners.findIndex(([type, handler]) => type === args[0] && handler === args[1]);
      assert.notEqual(index, -1, `removed listener ${args[0]} was registered`);
      windowListeners.splice(index, 1);
    },
  };

  await import('../client.js');

  assert.equal(loaded.id, packageId);
  assert.deepEqual(loaded.exports.inject, []);
  assert.equal(typeof loaded.exports.apply, 'function');

  loaded.exports.apply({ effect: (setup) => disposers.push(setup()) });

  assert.deepEqual(documentListeners.map(([type]) => type), ['mousedown', 'mouseup', 'click', 'mousemove', 'keydown', 'keyup', 'scroll', 'wheel']);
  assert.deepEqual(windowListeners.map(([type]) => type), ['blur']);

  for (const dispose of disposers) dispose();
  assert.equal(documentListeners.length, 0);
  assert.equal(windowListeners.length, 0);
});

test('the bundle reads only its own config route', async () => {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
  assert.match(source, /Generated from src\/client\.js/);
  assert.match(source, /\/__dsh\/terminal-upgrades/);
  assert.doesNotMatch(source, /XMLHttpRequest/);
});

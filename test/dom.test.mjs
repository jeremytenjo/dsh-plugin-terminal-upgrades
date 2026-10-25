import { test } from 'node:test';
import assert from 'node:assert/strict';

import { JSDOM } from 'jsdom';

/**
 * The plugin talks to a real terminal screen: one `.xterm` element, a
 * `.xterm-screen` holding the rows, and one inline-block span per run of text
 * inside each `.xterm-rows > div`. This builds that structure with fixed
 * geometry and drives the same pointer and key events the terminal receives.
 */
async function mountPlugin({ config = { triggerKey: 'alt' }, configFails = false } = {}) {
  const dom = new JSDOM(
    '<!doctype html><html><body><section data-sidebar-terminal>' +
      '<div class="terminal xterm"><div class="xterm-viewport"></div>' +
      '<div class="xterm-screen"><div class="xterm-rows"></div></div></div>' +
      '</section></body></html>',
    { pretendToBeVisual: true },
  );
  const { window } = dom;
  const opened = [];
  window.open = (...args) => { opened.push(args); return null; };

  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Element = window.Element;
  globalThis.fetch = async () => {
    if (configFails) throw new Error('offline');
    return { ok: true, json: async () => config };
  };

  const warnings = [];
  const warn = console.warn;
  console.warn = (...args) => warnings.push(args);

  const { apply } = await import('../src/client.js');
  const disposers = [];
  apply({ effect: (setup) => disposers.push(setup()) });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const rows = window.document.querySelector('.xterm-rows');
  const screen = window.document.querySelector('.xterm-screen');
  const terminal = window.document.querySelector('.xterm');
  const rowCount = 24;
  const cellWidth = 10;
  const cellHeight = 20;
  const rowTop = 100;
  const rowLeft = 50;
  for (let index = 0; index < rowCount; index += 1) rows.appendChild(window.document.createElement('div'));

  const box = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  Object.defineProperty(rows, 'getBoundingClientRect', { value: () => box(rowLeft, rowTop, 800, rowCount * cellHeight) });
  Object.defineProperty(screen, 'getBoundingClientRect', { value: () => box(rowLeft, rowTop, 800, rowCount * cellHeight) });

  const setRow = (index, runs) => {
    const row = rows.children[index];
    row.replaceChildren();
    for (const run of runs) {
      const span = window.document.createElement('span');
      span.textContent = run.text;
      Object.defineProperty(span, 'getBoundingClientRect', {
        value: () => box(run.left, rowTop + index * cellHeight, run.text.length * cellWidth, cellHeight),
      });
      row.appendChild(span);
    }
  };

  setRow(1, [
    { text: '  - Local:        ', left: rowLeft },
    { text: 'http://localhost:3000', left: 220 },
  ]);
  setRow(2, [{ text: 'nothing to see', left: rowLeft }]);

  const fire = (type, x, y, modifiers = {}) => {
    const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y, ...modifiers });
    screen.dispatchEvent(event);
    return event;
  };
  const press = (x, y, modifiers) => {
    const down = fire('mousedown', x, y, modifiers);
    fire('mouseup', x, y, modifiers);
    fire('click', x, y, modifiers);
    return down;
  };
  const key = (type, modifiers) => {
    window.document.dispatchEvent(new window.KeyboardEvent(type, { bubbles: true, key: 'Alt', ...modifiers }));
  };

  return {
    opened,
    press,
    fire,
    key,
    warnings,
    terminal,
    scroll: () => screen.dispatchEvent(new window.Event('scroll')),
    underline: () => screen.querySelector('[data-terminal-upgrades-underline]'),
    dispose: () => {
      for (const dispose of disposers) dispose();
      console.warn = warn;
    },
  };
}

test('the configured key opens the URL and the other modifiers do not', async () => {
  const screen = await mountPlugin();
  for (const modifier of [{ metaKey: true }, { ctrlKey: true }]) screen.press(230, 120, modifier);
  assert.deepEqual(screen.opened, []);

  screen.press(230, 120, { altKey: true });
  assert.deepEqual(screen.opened, [['http://localhost:3000', '_blank', 'noopener,noreferrer']]);
  screen.dispose();
});

test('the trigger key follows the plugin config', async () => {
  const screen = await mountPlugin({ config: { triggerKey: 'meta' } });
  screen.press(230, 120, { altKey: true });
  assert.deepEqual(screen.opened, []);
  screen.press(230, 120, { metaKey: true });
  assert.deepEqual(screen.opened, [['http://localhost:3000', '_blank', 'noopener,noreferrer']]);
  screen.dispose();
});

test('an unusable config falls back to Option', async () => {
  const screen = await mountPlugin({ config: { triggerKey: 'hyper' } });
  screen.press(230, 120, { altKey: true });
  assert.equal(screen.opened.length, 1);
  screen.dispose();
});

test('a config that cannot be read falls back to Option and warns once', async () => {
  const screen = await mountPlugin({ configFails: true });
  screen.press(230, 120, { altKey: true });
  assert.equal(screen.opened.length, 1);
  assert.equal(screen.warnings.length, 1);
  screen.dispose();
});

test('a click without the trigger key is left to the terminal', async () => {
  const screen = await mountPlugin();
  const down = screen.press(230, 120);
  assert.deepEqual(screen.opened, []);
  assert.equal(down.defaultPrevented, false);
  screen.dispose();
});

test('a trigger-keyed click away from the URL is left to the terminal', async () => {
  const screen = await mountPlugin();
  const offLink = screen.press(600, 120, { altKey: true });
  const noLink = screen.press(100, 140, { altKey: true });
  assert.deepEqual(screen.opened, []);
  assert.equal(offLink.defaultPrevented, false);
  assert.equal(noLink.defaultPrevented, false);
  screen.dispose();
});

test('a link press never reaches the terminal', async () => {
  const screen = await mountPlugin();
  const down = screen.press(230, 120, { altKey: true });
  assert.equal(down.defaultPrevented, true);
  screen.dispose();
});

test('the URL is underlined only while the trigger key is held over it', async () => {
  const screen = await mountPlugin();
  assert.equal(screen.underline(), null);

  screen.fire('mousemove', 230, 120, { altKey: true });
  const layer = screen.underline();
  assert.notEqual(layer, null);
  const line = layer.firstElementChild;
  assert.equal(line.style.left, '170px');
  assert.equal(line.style.top, '38px');
  assert.equal(line.style.width, '210px');
  assert.equal(screen.terminal.style.cursor, 'pointer');

  screen.fire('mousemove', 600, 120, { altKey: true });
  assert.equal(screen.underline(), null);
  assert.equal(screen.terminal.style.cursor, '');

  screen.fire('mousemove', 230, 120);
  assert.equal(screen.underline(), null);
  screen.dispose();
});

test('pressing and releasing the trigger key while resting on a link underlines and clears it', async () => {
  const screen = await mountPlugin();
  screen.fire('mousemove', 230, 120);
  assert.equal(screen.underline(), null);

  screen.key('keydown', { altKey: true });
  assert.notEqual(screen.underline(), null);

  screen.key('keyup', {});
  assert.equal(screen.underline(), null);
  screen.dispose();
});

test('the underline follows the configured trigger key', async () => {
  const screen = await mountPlugin({ config: { triggerKey: 'meta' } });
  screen.fire('mousemove', 230, 120, { altKey: true });
  assert.equal(screen.underline(), null);
  screen.fire('mousemove', 230, 120, { metaKey: true });
  assert.notEqual(screen.underline(), null);
  screen.dispose();
});

test('scrolling clears the decoration until the pointer moves again', async () => {
  const screen = await mountPlugin();
  screen.fire('mousemove', 230, 120, { altKey: true });
  assert.notEqual(screen.underline(), null);
  screen.scroll();
  assert.equal(screen.underline(), null);
  assert.equal(screen.terminal.style.cursor, '');
  screen.dispose();
});

test('disposing the plugin removes every listener and the decoration', async () => {
  const screen = await mountPlugin();
  screen.fire('mousemove', 230, 120, { altKey: true });
  assert.notEqual(screen.underline(), null);
  screen.dispose();
  assert.equal(screen.underline(), null);
  screen.press(230, 120, { altKey: true });
  assert.deepEqual(screen.opened, []);
});

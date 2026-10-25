import { test } from 'node:test';
import assert from 'node:assert/strict';

import { JSDOM } from 'jsdom';

/**
 * The plugin talks to a real terminal screen: one `.xterm` element, a
 * `.xterm-rows` container with one div per visible row, and one inline-block
 * span per run of text. This builds that structure with fixed geometry and
 * drives the same pointer and click events the terminal receives.
 */
async function mountPlugin() {
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

  const { apply } = await import('../src/client.js');
  const disposers = [];
  apply({ effect: (setup) => disposers.push(setup()) });

  const rows = window.document.querySelector('.xterm-rows');
  const screen = window.document.querySelector('.xterm-screen');
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

  return {
    opened,
    press,
    fire,
    terminal: window.document.querySelector('.xterm'),
    dispose: () => { for (const dispose of disposers) dispose(); },
  };
}

test('a modified click on a URL opens it in a new browser tab', async () => {
  const screen = await mountPlugin();
  screen.press(230, 120, { altKey: true });
  assert.deepEqual(screen.opened, [['http://localhost:3000', '_blank', 'noopener,noreferrer']]);

  for (const modifier of [{ metaKey: true }, { ctrlKey: true }]) {
    screen.opened.length = 0;
    screen.press(230, 120, modifier);
    assert.deepEqual(screen.opened, [['http://localhost:3000', '_blank', 'noopener,noreferrer']]);
  }
});

test('a click without a modifier is left to the terminal', async () => {
  const screen = await mountPlugin();
  const down = screen.press(230, 120);
  assert.deepEqual(screen.opened, []);
  assert.equal(down.defaultPrevented, false);
});

test('a modified click away from the URL is left to the terminal', async () => {
  const screen = await mountPlugin();
  assert.deepEqual(screen.opened, []);
  const offLink = screen.press(600, 120, { altKey: true });
  const noLink = screen.press(100, 140, { altKey: true });
  assert.deepEqual(screen.opened, []);
  assert.equal(offLink.defaultPrevented, false);
  assert.equal(noLink.defaultPrevented, false);
});

test('a link press never reaches the terminal', async () => {
  const screen = await mountPlugin();
  const down = screen.press(230, 120, { altKey: true });
  assert.equal(down.defaultPrevented, true);
});

test('the pointer becomes a hand only while a modifier is held over a link', async () => {
  const screen = await mountPlugin();
  screen.fire('mousemove', 230, 120, { altKey: true });
  assert.equal(screen.terminal.style.cursor, 'pointer');
  screen.fire('mousemove', 600, 120, { altKey: true });
  assert.equal(screen.terminal.style.cursor, '');
  screen.fire('mousemove', 230, 120);
  assert.equal(screen.terminal.style.cursor, '');
  screen.fire('mousemove', 230, 120, { altKey: true });
  screen.fire('keyup', 230, 120);
  assert.equal(screen.terminal.style.cursor, '');
});

test('disposing the plugin removes every listener', async () => {
  const screen = await mountPlugin();
  screen.dispose();
  screen.press(230, 120, { altKey: true });
  assert.deepEqual(screen.opened, []);
});

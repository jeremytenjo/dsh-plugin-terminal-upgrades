/**
 * Browser half of dsh-plugin-terminal-upgrades.
 *
 * DeepSeek Harness renders terminals with xterm's DOM renderer, so the visible
 * rows are real text in the page. The plugin listens at the document level:
 * holding Option (macOS), Alt, Cmd, or Ctrl over a URL shows a pointer cursor,
 * and clicking it opens the URL in a new browser tab. A click without a
 * modifier is untouched, so text selection and terminal input keep working.
 *
 * The plugin only reads the rows it needs for the pointer position. It never
 * writes to the terminal, registers no Host route, and does not touch another
 * plugin's state.
 */

import { findUrls, runOffset, urlAtOffset } from './links.js';

export const inject = [];

const TERMINAL_ROOT = '.xterm';
const ROW_CONTAINER = '.xterm-rows';

export function apply(ctx) {
  // The listeners are document-wide because terminals mount and unmount with
  // their sidebar tabs; delegation covers every current and future screen.
  ctx.effect(() => {
    /** The terminal currently showing a link cursor. */
    let cursorTerminal;
    /** Whether the current press started on a link and must not reach the terminal. */
    let linkPress = false;

    const clearCursor = () => {
      if (cursorTerminal === undefined) return;
      cursorTerminal.style.cursor = '';
      cursorTerminal = undefined;
    };

    const showCursor = (terminal) => {
      if (cursorTerminal === terminal) return;
      clearCursor();
      terminal.style.cursor = 'pointer';
      cursorTerminal = terminal;
    };

    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('mouseup', onMouseUp, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', clearCursor);

    return () => {
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('mouseup', onMouseUp, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('mousemove', onMouseMove, true);
      document.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', clearCursor);
      clearCursor();
    };

    // A modified press on a link is swallowed whole: the terminal must not move
    // its cursor, start a selection, or report the click to a program that
    // tracks the mouse. The `click` that follows still fires on the screen.
    function onMouseDown(event) {
      linkPress = false;
      if (event.button !== 0 || !isModified(event)) return;
      const terminal = terminalOf(event.target);
      if (terminal === undefined) return;
      if (urlAtPoint(terminal, event.clientX, event.clientY) === undefined) return;
      linkPress = true;
      event.preventDefault();
      event.stopPropagation();
    }

    function onMouseUp(event) {
      if (!linkPress) return;
      linkPress = false;
      event.preventDefault();
      event.stopPropagation();
    }

    function onClick(event) {
      if (event.button !== 0 || !isModified(event)) return;
      const terminal = terminalOf(event.target);
      if (terminal === undefined) return;
      const url = urlAtPoint(terminal, event.clientX, event.clientY);
      if (url === undefined) return;
      event.preventDefault();
      event.stopPropagation();
      clearCursor();
      window.open(url, '_blank', 'noopener,noreferrer');
    }

    function onMouseMove(event) {
      if (!isModified(event)) {
        clearCursor();
        return;
      }
      const terminal = terminalOf(event.target);
      if (terminal === undefined) {
        clearCursor();
        return;
      }
      if (urlAtPoint(terminal, event.clientX, event.clientY) === undefined) clearCursor();
      else showCursor(terminal);
    }

    function onKeyUp(event) {
      // Releasing every modifier without moving the pointer must drop the cursor.
      if (!isModified(event)) clearCursor();
    }
  }, 'terminal-upgrades: pointer and click listeners');
}

function isModified(event) {
  return event.altKey || event.metaKey || event.ctrlKey;
}

function terminalOf(target) {
  if (!(target instanceof Element)) return undefined;
  return target.closest(TERMINAL_ROOT) ?? undefined;
}

/**
 * The URL under one point of a terminal screen.
 * @param {Element} terminal - the `.xterm` root of the screen.
 * @param {number} x - pointer position in client coordinates.
 * @param {number} y - pointer position in client coordinates.
 * @returns {string | undefined} the link destination.
 */
function urlAtPoint(terminal, x, y) {
  const rows = terminal.querySelector(ROW_CONTAINER);
  if (rows === null || rows.childElementCount === 0) return undefined;
  const box = rows.getBoundingClientRect();
  if (box.height <= 0 || x < box.left || x >= box.right || y < box.top || y >= box.bottom) {
    return undefined;
  }
  const rowHeight = box.height / rows.childElementCount;
  const index = Math.min(rows.childElementCount - 1, Math.floor((y - box.top) / rowHeight));
  const row = rows.children[index];
  const offset = runOffset(spansOf(row), x);
  if (offset === undefined) return undefined;
  return urlAtOffset(findUrls(row.textContent ?? ''), offset)?.url;
}

function spansOf(row) {
  const runs = [];
  let start = 0;
  for (const span of row.children) {
    const length = span.textContent === null ? 0 : span.textContent.length;
    const rect = span.getBoundingClientRect();
    runs.push({ start, left: rect.left, width: rect.width, length });
    start += length;
  }
  return runs;
}

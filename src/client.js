/**
 * Browser half of dsh-plugin-terminal-upgrades.
 *
 * DeepSeek Harness renders terminals with xterm's DOM renderer, so the visible
 * rows are real text in the page. The plugin listens at the document level:
 * holding the trigger key (Option by default) over a URL underlines it, a
 * modified click opens it in a new browser tab, and a click without the
 * trigger is untouched, so text selection and terminal input keep working.
 *
 * The trigger key comes from the Host: this half reads it once from the
 * plugin's config route and keeps Option until the answer arrives.
 *
 * The plugin only reads the rows it needs for the pointer position and adds
 * its own underline overlay. It never writes to the terminal's text, and does
 * not touch another plugin's state.
 */

import { findUrls, linkSegments, runOffset, urlAtOffset } from './links.js';

export const inject = [];

const CONFIG_ROUTE = '/__dsh/terminal-upgrades';
const DEFAULT_TRIGGER_KEY = 'alt';
const TRIGGER_KEYS = new Set(['alt', 'meta', 'ctrl']);
const TERMINAL_ROOT = '.xterm';
const SCREEN = '.xterm-screen';
const ROW_CONTAINER = '.xterm-rows';
const UNDERLINE = 'data-terminal-upgrades-underline';

export function apply(ctx) {
  // The listeners are document-wide because terminals mount and unmount with
  // their sidebar tabs; delegation covers every current and future screen.
  ctx.effect(() => {
    /** Option (alt), Command (meta) or Control (ctrl); replaced by the Host setting. */
    let triggerKey = DEFAULT_TRIGGER_KEY;
    /** Modifier state as of the last pointer or key event. */
    const held = { alt: false, meta: false, ctrl: false };
    /** Terminal and position of the last pointer move over a screen. */
    let pointer;
    /** The terminal currently showing a link cursor. */
    let cursorTerminal;
    /** The underline overlay for the hovered link. */
    let underline;
    /** Whether the current press started on a link and must not reach the terminal. */
    let linkPress = false;

    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('mouseup', onMouseUp, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', onKeyUp, true);
    // Scrolling and output move the rows under a still pointer; drop the
    // decoration on the next pointer move rather than underlining other cells.
    document.addEventListener('scroll', onViewportMove, true);
    document.addEventListener('wheel', onViewportMove, true);
    window.addEventListener('blur', onBlur);

    void readTriggerKey().then((key) => {
      triggerKey = key;
      refresh();
    });

    return () => {
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('mouseup', onMouseUp, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('mousemove', onMouseMove, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('keyup', onKeyUp, true);
      document.removeEventListener('scroll', onViewportMove, true);
      document.removeEventListener('wheel', onViewportMove, true);
      window.removeEventListener('blur', onBlur);
      clearHover();
    };

    // A press with the trigger key on a link is swallowed whole: the terminal
    // must not move its cursor, start a selection, or report the click to a
    // program that tracks the mouse. The `click` that follows still fires on
    // the screen, where it opens the URL.
    function onMouseDown(event) {
      linkPress = false;
      track(event);
      if (event.button !== 0 || !held[triggerKey]) return;
      const terminal = terminalOf(event.target);
      if (terminal === undefined) return;
      if (hitAt(terminal, event.clientX, event.clientY) === undefined) return;
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
      track(event);
      if (event.button !== 0 || !held[triggerKey]) return;
      const terminal = terminalOf(event.target);
      if (terminal === undefined) return;
      const hit = hitAt(terminal, event.clientX, event.clientY);
      if (hit === undefined) return;
      event.preventDefault();
      event.stopPropagation();
      clearHover();
      window.open(hit.url, '_blank', 'noopener,noreferrer');
    }

    function onMouseMove(event) {
      track(event);
      const terminal = terminalOf(event.target);
      pointer = terminal === undefined ? undefined : { terminal, x: event.clientX, y: event.clientY };
      refresh();
    }

    function onKeyDown(event) {
      track(event);
      refresh();
    }

    function onKeyUp(event) {
      track(event);
      refresh();
    }

    function onViewportMove() {
      pointer = undefined;
      clearHover();
    }

    function onBlur() {
      held.alt = false;
      held.meta = false;
      held.ctrl = false;
      clearHover();
    }

    function track(event) {
      held.alt = event.altKey;
      held.meta = event.metaKey;
      held.ctrl = event.ctrlKey;
    }

    // The decoration follows the pointer, and appears or disappears when the
    // trigger key is pressed or released without moving it.
    function refresh() {
      if (!held[triggerKey] || pointer === undefined) {
        clearHover();
        return;
      }
      const hit = hitAt(pointer.terminal, pointer.x, pointer.y);
      if (hit === undefined) {
        clearHover();
        return;
      }
      showCursor(pointer.terminal);
      paintUnderline(pointer.terminal, hit);
    }

    function clearHover() {
      clearCursor();
      clearUnderline();
    }

    function showCursor(terminal) {
      if (cursorTerminal === terminal) return;
      clearCursor();
      terminal.style.cursor = 'pointer';
      cursorTerminal = terminal;
    }

    function clearCursor() {
      if (cursorTerminal === undefined) return;
      cursorTerminal.style.cursor = '';
      cursorTerminal = undefined;
    }

    function clearUnderline() {
      if (underline === undefined) return;
      underline.layer.remove();
      underline = undefined;
    }

    function paintUnderline(terminal, hit) {
      const screen = terminal.querySelector(SCREEN);
      if (screen === null) return;
      if (underline !== undefined && underline.screen !== screen) clearUnderline();
      if (underline === undefined) {
        const layer = document.createElement('div');
        layer.setAttribute(UNDERLINE, '');
        layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:2';
        screen.appendChild(layer);
        underline = { screen, layer };
      }
      const box = screen.getBoundingClientRect();
      const color = linkColor(hit.runs, hit.link);
      underline.layer.replaceChildren(...linkSegments(hit.runs, hit.link).map((segment) => {
        const line = document.createElement('div');
        line.style.cssText = 'position:absolute;pointer-events:none;border-radius:1px';
        line.style.left = `${segment.left - box.left}px`;
        line.style.top = `${segment.top - box.top + segment.height - 2}px`;
        line.style.width = `${segment.width}px`;
        line.style.height = '1.5px';
        line.style.backgroundColor = color;
        return line;
      }));
    }
  }, 'terminal-upgrades: pointer, key and click listeners');
}

/**
 * Read the trigger key the Host composed from the plugin config.
 * @returns the configured key, or Option when the route is unavailable.
 */
function readTriggerKey() {
  if (typeof fetch !== 'function') return Promise.resolve(DEFAULT_TRIGGER_KEY);
  return fetch(CONFIG_ROUTE, { credentials: 'same-origin', headers: { accept: 'application/json' } })
    .then((response) => response.ok ? response.json() : undefined)
    .then((body) => typeof body?.triggerKey === 'string' && TRIGGER_KEYS.has(body.triggerKey) ? body.triggerKey : DEFAULT_TRIGGER_KEY)
    .catch((error) => {
      console.warn('terminal-upgrades: could not read the trigger key; using Option', error);
      return DEFAULT_TRIGGER_KEY;
    });
}

function terminalOf(target) {
  if (!(target instanceof Element)) return undefined;
  return target.closest(TERMINAL_ROOT) ?? undefined;
}

/**
 * The URL and its geometry under one point of a terminal screen.
 * @param {Element} terminal - the `.xterm` root of the screen.
 * @param {number} x - pointer position in client coordinates.
 * @param {number} y - pointer position in client coordinates.
 * @returns {{ url: string, link: { start: number, end: number }, runs: object[] } | undefined} the hovered link.
 */
function hitAt(terminal, x, y) {
  const rows = terminal.querySelector(ROW_CONTAINER);
  if (rows === null || rows.childElementCount === 0) return undefined;
  const box = rows.getBoundingClientRect();
  if (box.height <= 0 || x < box.left || x >= box.right || y < box.top || y >= box.bottom) {
    return undefined;
  }
  const rowHeight = box.height / rows.childElementCount;
  const index = Math.min(rows.childElementCount - 1, Math.floor((y - box.top) / rowHeight));
  const row = rows.children[index];
  const runs = spansOf(row);
  const offset = runOffset(runs, x);
  if (offset === undefined) return undefined;
  const link = urlAtOffset(findUrls(row.textContent ?? ''), offset);
  if (link === undefined) return undefined;
  return { url: link.url, link, runs };
}

function spansOf(row) {
  const runs = [];
  let start = 0;
  for (const span of row.children) {
    const text = span.textContent ?? '';
    const rect = span.getBoundingClientRect();
    runs.push({ start, left: rect.left, top: rect.top, width: rect.width, height: rect.height, length: text.length, element: span });
    start += text.length;
  }
  return runs;
}

function linkColor(runs, link) {
  const run = runs.find((candidate) => link.start < candidate.start + candidate.length && link.end > candidate.start);
  const element = run?.element;
  const view = element?.ownerDocument?.defaultView;
  if (view === undefined || view === null) return 'currentColor';
  return view.getComputedStyle(element).color || 'currentColor';
}

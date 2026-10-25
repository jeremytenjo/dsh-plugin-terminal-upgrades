/**
 * URL detection over xterm's rendered rows.
 *
 * The terminal paints one DOM row per visible terminal row, and every row is a
 * sequence of spans holding its text. Detection therefore works on one row at a
 * time: a URL that wraps onto the next row is seen as two separate rows.
 */

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gu;
const TRAILING_PUNCTUATION = /[.,;:!?]$/u;
const BRACKETS = [['(', ')'], ['[', ']'], ['{', '}']];
const SCHEME_END = '://'.length;

/**
 * Find HTTP(S) URLs in one row of terminal text.
 *
 * Sentence punctuation after a URL and an unbalanced closing bracket are not
 * part of it, so `see https://example.test/docs.` links only the URL.
 *
 * @param {string} text - the visible text of one terminal row.
 * @returns {{ url: string, start: number, end: number }[]} the URLs in order, with zero-based start and exclusive end offsets.
 */
export function findUrls(text) {
  const links = [];
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = trimUrlEnd(match[0]);
    // A scheme with no destination is not a link.
    if (url.slice(url.indexOf('://') + SCHEME_END) === '') continue;
    links.push({ url, start: match.index, end: match.index + url.length });
  }
  return links;
}

/**
 * Pick the link covering one character offset.
 * @param {{ url: string, start: number, end: number }[]} links - the row's links.
 * @param {number} offset - zero-based character offset within the row text.
 * @returns {{ url: string, start: number, end: number } | undefined} the covering link.
 */
export function urlAtOffset(links, offset) {
  for (const link of links) {
    if (offset >= link.start && offset < link.end) return link;
  }
  return undefined;
}

/**
 * Map a horizontal pointer position to a character offset across the spans of
 * one row. Characters are monospaced, so a position inside a span maps by
 * proportion of that span's width.
 *
 * @param {{ start: number, left: number, width: number, length: number }[]} runs - the row's spans in reading order.
 * @param {number} x - pointer position in client coordinates.
 * @returns {number | undefined} the zero-based character offset under the pointer.
 */
export function runOffset(runs, x) {
  for (const run of runs) {
    if (run.length <= 0 || run.width <= 0) continue;
    if (x < run.left || x >= run.left + run.width) continue;
    const index = Math.floor(((x - run.left) / run.width) * run.length);
    return run.start + Math.min(run.length - 1, Math.max(0, index));
  }
  return undefined;
}

function trimUrlEnd(url) {
  let end = url.length;
  while (end > url.indexOf('://') + SCHEME_END) {
    const candidate = url.slice(0, end);
    if (!TRAILING_PUNCTUATION.test(candidate) && !unbalancedClosing(candidate)) return candidate;
    end -= 1;
  }
  return url.slice(0, end);
}

function unbalancedClosing(url) {
  return BRACKETS.some(([opening, closing]) => url.endsWith(closing) && count(url, closing) > count(url, opening));
}

function count(text, character) {
  return text.split(character).length - 1;
}

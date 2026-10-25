import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findUrls, linkSegments, runOffset, urlAtOffset } from '../src/links.js';

test('finds every URL in a dev-server banner row', () => {
  const row = '  - Local:        http://localhost:3000  Network: http://10.0.0.79:3000';
  const link = (url) => ({ url, start: row.indexOf(url), end: row.indexOf(url) + url.length });
  assert.deepEqual(findUrls(row), [link('http://localhost:3000'), link('http://10.0.0.79:3000')]);
});

test('keeps paths, queries, fragments, and ports in the link', () => {
  const row = 'GET https://example.test:8443/a/b?x=1&y=2#top';
  assert.deepEqual(findUrls(row).map((link) => link.url), ['https://example.test:8443/a/b?x=1&y=2#top']);
});

test('drops sentence punctuation and unbalanced closing brackets', () => {
  assert.equal(findUrls('See https://example.test/docs.').at(0).url, 'https://example.test/docs');
  assert.equal(findUrls('see https://example.test/a, then').at(0).url, 'https://example.test/a');
  assert.equal(findUrls('(see https://example.test/a)').at(0).url, 'https://example.test/a');
  assert.equal(findUrls('see https://example.test/a]').at(0).url, 'https://example.test/a');
});

test('keeps a balanced closing bracket that belongs to the URL', () => {
  assert.equal(findUrls('see https://example.test/a_(b)').at(0).url, 'https://example.test/a_(b)');
});

test('ignores rows without a destination', () => {
  assert.deepEqual(findUrls(''), []);
  assert.deepEqual(findUrls('no links here'), []);
  assert.deepEqual(findUrls('scheme only https://'), []);
  assert.deepEqual(findUrls('http://..'), []);
  assert.deepEqual(findUrls('not a url http:/example.test'), []);
});

test('picks the link covering an offset', () => {
  const row = 'a http://one.test b http://two.test';
  const links = findUrls(row);
  const first = row.indexOf('http://one.test');
  const second = row.indexOf('http://two.test');
  assert.equal(urlAtOffset(links, 0), undefined);
  assert.equal(urlAtOffset(links, first).url, 'http://one.test');
  assert.equal(urlAtOffset(links, first + 14).url, 'http://one.test');
  assert.equal(urlAtOffset(links, first + 15), undefined);
  assert.equal(urlAtOffset(links, second).url, 'http://two.test');
  assert.equal(urlAtOffset(links, second + 14).url, 'http://two.test');
  assert.equal(urlAtOffset(links, second + 15), undefined);
});

test('maps a pointer position inside the first span', () => {
  const runs = [{ start: 0, left: 100, width: 80, length: 8 }];
  assert.equal(runOffset(runs, 100), 0);
  assert.equal(runOffset(runs, 109), 0);
  assert.equal(runOffset(runs, 110), 1);
  assert.equal(runOffset(runs, 179), 7);
  assert.equal(runOffset(runs, 180), undefined);
  assert.equal(runOffset(runs, 99), undefined);
});

test('accounts for earlier spans when mapping a later one', () => {
  const runs = [
    { start: 0, left: 0, width: 30, length: 3 },
    { start: 3, left: 30, width: 50, length: 5 },
  ];
  assert.equal(runOffset(runs, 35), 3);
  assert.equal(runOffset(runs, 45), 4);
  assert.equal(runOffset(runs, 79), 7);
  assert.equal(runOffset(runs, 20), 2);
});

test('skips empty and zero-width spans', () => {
  const runs = [
    { start: 0, left: 0, width: 0, length: 0 },
    { start: 0, left: 0, width: 0, length: 4 },
    { start: 4, left: 10, width: 20, length: 2 },
  ];
  assert.equal(runOffset(runs, 15), 4);
  assert.equal(runOffset(runs, 0), undefined);
});

test('underlines only the URL inside a span', () => {
  const runs = [{ start: 0, left: 100, top: 20, width: 200, height: 20, length: 20 }];
  assert.deepEqual(linkSegments(runs, { start: 5, end: 15 }), [
    { left: 150, top: 20, width: 100, height: 20 },
  ]);
});

test('splits a link that crosses a color change', () => {
  const runs = [
    { start: 0, left: 0, top: 0, width: 60, height: 20, length: 6 },
    { start: 6, left: 60, top: 0, width: 80, height: 20, length: 8 },
  ];
  assert.deepEqual(linkSegments(runs, { start: 4, end: 10 }), [
    { left: 40, top: 0, width: 20, height: 20 },
    { left: 60, top: 0, width: 40, height: 20 },
  ]);
});

test('ignores empty spans when underlining', () => {
  const runs = [
    { start: 0, left: 0, top: 0, width: 0, height: 20, length: 3 },
    { start: 3, left: 30, top: 0, width: 0, height: 20, length: 0 },
  ];
  assert.deepEqual(linkSegments(runs, { start: 0, end: 2 }), []);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { apply, inject } from '../index.js';

const ORIGIN = 'http://127.0.0.1:57926';

function mount(config, { getOrigin = () => ORIGIN } = {}) {
  const routes = [];
  const ctx = {
    effect: (setup) => setup(),
    webServer: {
      register: (route) => { routes.push(route); return { dispose() {} }; },
      getOrigin,
    },
  };
  apply(ctx, config);
  return routes[0];
}

function request(overrides = {}) {
  return {
    method: 'GET',
    url: '/__dsh/terminal-upgrades',
    headers: { origin: ORIGIN, 'sec-fetch-site': 'same-origin' },
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  };
}

function response() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    writableEnded: false,
    writeHead(status, headers) { this.statusCode = status; this.headers = headers; },
    end(body) { this.body = body; this.writableEnded = true; },
  };
}

function serve(route, req = request()) {
  const res = response();
  route.handler(req, res);
  return { status: res.statusCode, headers: res.headers, body: res.body === '' ? undefined : JSON.parse(res.body) };
}

test('the Host half only needs the web server', () => {
  assert.deepEqual(inject, ['webServer']);
});

test('serves Option when the plugin config sets no trigger key', () => {
  const route = mount(undefined);
  assert.equal(route.path, '/__dsh/terminal-upgrades');
  assert.equal(route.kind, 'exact');
  const answer = serve(route);
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body, { triggerKey: 'alt' });
  assert.equal(answer.headers['cache-control'], 'no-store');
  assert.equal(answer.headers['content-type'], 'application/json; charset=utf-8');
});

test('serves each supported trigger key', () => {
  for (const triggerKey of ['alt', 'meta', 'ctrl']) {
    assert.deepEqual(serve(mount({ triggerKey })).body, { triggerKey });
  }
});

test('refuses an unsupported trigger key at startup', () => {
  assert.throws(() => mount({ triggerKey: 'hyper' }), /triggerKey must be one of alt, meta, ctrl/);
  assert.throws(() => mount({ triggerKey: 1 }), /triggerKey must be one of/);
  assert.throws(() => mount({ triggerKey: null }), /triggerKey must be one of/);
});

test('answers only GET', () => {
  const answer = serve(mount(undefined), request({ method: 'POST' }));
  assert.equal(answer.status, 405);
  assert.equal(answer.body.error, 'Only GET is supported.');
});

test('answers only the page origin on the loopback interface', () => {
  assert.equal(serve(mount(undefined), request({ headers: { origin: 'https://example.test' } })).status, 403);
  assert.equal(serve(mount(undefined), request({ headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.equal(serve(mount(undefined), request({ socket: { remoteAddress: '10.0.0.7' } })).status, 403);
  assert.equal(serve(mount(undefined), request({ headers: {} })).status, 200);
});

test('reports an unready web server instead of failing the request', () => {
  const route = mount(undefined, { getOrigin: () => { throw new Error('not ready') } });
  assert.equal(serve(route).status, 503);
});

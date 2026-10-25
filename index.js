/**
 * Host half of dsh-plugin-terminal-upgrades.
 *
 * The feature lives in the page: the browser half reads the rendered terminal
 * rows, underlines the URL under the trigger key, and opens it in a new
 * browser tab. The client cannot receive plugin config directly, so this half
 * validates the `triggerKey` entry config and publishes it on one loopback
 * route for the browser half to read at startup.
 *
 * The route answers a single setting. It carries no credentials, touches no
 * files, and runs no project code.
 */

const ROUTE = '/__dsh/terminal-upgrades';
const DEFAULT_TRIGGER_KEY = 'alt';
const TRIGGER_KEYS = new Set(['alt', 'meta', 'ctrl']);

export const inject = ['webServer'];

/**
 * Compose the setting once and serve it to the page.
 * @param {object} ctx - Host context carrying `webServer`.
 * @param {{ triggerKey?: string } | undefined} config - the entry's plugin config.
 * @throws {Error} when `triggerKey` is not one of the supported keys.
 */
export function apply(ctx, config) {
  const triggerKey = readTriggerKey(config);
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE,
    handler: (req, res) => serve(ctx, req, res, triggerKey),
  }), 'terminal-upgrades: config route');
}

function readTriggerKey(config) {
  const value = config?.triggerKey;
  if (value === undefined) return DEFAULT_TRIGGER_KEY;
  if (typeof value !== 'string' || !TRIGGER_KEYS.has(value)) {
    throw new Error(`terminal-upgrades: triggerKey must be one of ${[...TRIGGER_KEYS].join(', ')}, received ${JSON.stringify(value)}`);
  }
  return value;
}

function serve(ctx, req, res, triggerKey) {
  try {
    if (req.method !== 'GET') throw new RequestError(405, 'Only GET is supported.');
    assertSameOrigin(ctx, req);
    send(res, 200, { triggerKey });
  } catch (error) {
    if (res.writableEnded) return;
    if (error instanceof RequestError) {
      send(res, error.status, { ok: false, error: error.message });
      return;
    }
    console.error('[terminal-upgrades] could not serve the plugin config', error);
    send(res, 503, { ok: false, error: 'Could not read the plugin config.' });
  }
}

function assertSameOrigin(ctx, req) {
  const address = req.socket?.remoteAddress;
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') {
    throw new RequestError(403, 'This setting is only available over the local loopback connection.');
  }
  let expected;
  try {
    expected = ctx.webServer.getOrigin();
  } catch {
    throw new RequestError(503, 'The web server is not ready yet.');
  }
  const origin = req.headers.origin;
  if (origin && origin !== expected) throw new RequestError(403, 'This request came from a different origin.');
  if (req.headers['sec-fetch-site'] === 'cross-site') throw new RequestError(403, 'Cross-site requests are not allowed.');
}

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'RequestError';
    this.status = status;
  }
}

function send(res, status, payload) {
  if (res.writableEnded) return;
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

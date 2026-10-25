/**
 * Host half of dsh-plugin-terminal-upgrades.
 *
 * The whole feature lives in the page: the browser half reads the rendered
 * terminal rows and opens a URL in a new browser tab. The Host contributes no
 * route, service, or filesystem access.
 */

export const inject = [];

export function apply() {
  // Nothing to do on the Host.
}

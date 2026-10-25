# Terminal upgrades for DeepSeek Harness

Terminal upgrades for DeepSeek Harness. The first one: hold **Option** over a URL in a terminal and it underlines; click it and it opens in your browser. The trigger key is configurable.

<p align="center">
  <picture>
    <img src="icon.svg" width="96" alt="The terminal upgrades plugin icon: a terminal prompt with a chain link" />
  </picture>
</p>

## Features

- **The link underlines while you hold the trigger key.** The underline is drawn over the URL's cells in the URL's own color, and the pointer becomes a hand, so you can see what is clickable before you click.
- **Click opens the browser.** Clicking `http://localhost:3000` from `next dev` opens it in a new tab; the desktop app hands the URL to your default browser.
- **Configurable trigger key.** Option by default; Command or Control from the plugin config.
- **Plain clicks are untouched.** Text selection, double-click word selection, and keystrokes reach the terminal exactly as before. Only the trigger key on a link is intercepted.
- **No terminal changes.** The plugin reads the rows the terminal already renders and adds its own overlay; it never rewrites terminal text, so output, colors, and the shell are unaffected.
- **Works with every terminal tab**, including ones opened after installing, and disposes cleanly when the plugin is removed.

## Install

In the desktop app, open **Plugins** in the sidebar, choose **Add plugin**, and enter this directory. The desktop profile is managed by the Electron app, which is why this is the preferred path there.

For another profile, use the CLI:

```bash
git clone https://github.com/jeremytenjo/dsh-plugin-terminal-upgrades.git
dsh plugin --profile <profile> add ./dsh-plugin-terminal-upgrades
```

Replace `<profile>` with the name shown by `dsh --profile <name> --dump-config` (for example `web`). Restart the Host or reload the page after installing.

The package ships its browser bundle (`client.js`), so no build step is required to install it.

## Usage

1. Run something that prints a URL, for example `pnpm dev` in a Next.js project.
2. Hold the trigger key — **Option** (`⌥`) by default — and move the pointer over the URL. The URL underlines and the terminal cursor becomes a hand. Pressing the key while already resting on a link underlines it without moving the pointer.
3. Click. The URL opens in a new browser tab. In the desktop app it opens in the system browser.

Without the trigger key, clicking the same URL does what it always did: it places the terminal cursor and starts a text selection.

## Configuration

The trigger key defaults to **Option** (Alt). Change it in the plugin's profile entry config:

```yaml
# ~/.dsh/profiles/desktop/cordis.patch.yml
- id: dsh-plugin-terminal-upgrades
  name: "dsh-plugin-terminal-upgrades"
  config:
    triggerKey: meta
```

| `triggerKey` | Key |
| --- | --- |
| `alt` (default) | Option on macOS, Alt on Windows and Linux |
| `meta` | Command |
| `ctrl` | Control |

Restart DeepSeek Harness after changing it: the profile applies plugin config at startup. The Host validates the value while it starts, so an unknown key stops the plugin with an explicit error instead of silently falling back. The browser reads the setting once as the page loads and keeps Option until the answer arrives.

Only the configured key triggers the underline and the click; the other modifiers stay inert, so nothing changes for people who use them for other terminal gestures.

## How it works

DeepSeek Harness renders terminals with xterm's DOM renderer, so the visible rows exist as text in the page. The plugin listens on `document`, maps a pointer position to the terminal row and character offset, and runs the same URL rules for any row under the pointer:

- `http://` and `https://` only.
- Sentence punctuation after a URL and an unbalanced closing bracket are left out, so `see https://example.test/docs.` links the URL without the period.
- A balanced closer stays part of the link, so `https://example.test/a_(b)` keeps its `)`.

Client plugins do not receive profile entry config, so the Host half validates `triggerKey` and publishes it on one loopback route, `/__dsh/terminal-upgrades`; the browser reads it once at startup. The underline itself is an overlay element the plugin owns, positioned from the URL's text runs, so the terminal's own DOM is never modified.

The plugin adds no slot, no terminal state, and no per-terminal setup, so it has nothing to clean up beyond removing its listeners and its overlay.

## Limitations

- **One row at a time.** A URL that wraps onto the next terminal row is not detected; short links such as `http://localhost:3000` are unaffected.
- **Underline is an overlay.** It tracks the text runs the terminal rendered. Scrolling hides it until the pointer moves again, and a very unusual font fallback could shift it by a pixel.
- **Programs that capture the mouse.** In a terminal program that reports mouse clicks itself, such as Vim or `less`, a trigger-keyed click on a link is consumed by the plugin; a trigger-keyed click elsewhere still reaches the program.
- **DOM renderer only.** The detection reads the rendered rows. If the terminal switches to a canvas or WebGL renderer, nothing is detected and the plugin does nothing.
- **Not a general link opener.** File paths, line numbers, and bare host names are not links.

## Development

```bash
pnpm install
pnpm run build   # regenerates client.js from src/client.js
pnpm test        # URL, offset, host-route and terminal-screen tests
```

`src/client.js` is the browser source, `index.js` is the Host half, and `scripts/build-client.mjs` bundles the browser half into `client.js` wrapped in the Harness module-loader shape. Edit `src/`, run `pnpm run build`, and reload the page.

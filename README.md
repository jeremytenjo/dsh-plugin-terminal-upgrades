# Terminal upgrades for DeepSeek Harness

Terminal upgrades for DeepSeek Harness. The first one: hold **Option** (macOS), **Alt**, **Cmd**, or **Ctrl** and click a URL in a terminal to open it in your browser. Hovering a link with the modifier held turns the pointer into a hand, so you can see what is clickable before you click.

<p align="center">
  <picture>
    <img src="icon.svg" width="96" alt="The terminal upgrades plugin icon: a terminal prompt with a chain link" />
  </picture>
</p>

## Features

- **Modifier-click opens the browser.** Option-clicking `http://localhost:3000` from `next dev` opens it in a new tab; the desktop app hands the URL to your default browser.
- **Plain clicks are untouched.** Text selection, double-click word selection, and keystrokes reach the terminal exactly as before. Only a modified click on a link is intercepted.
- **Pointer feedback.** With the modifier held, hovering a URL changes the terminal cursor to a hand.
- **No terminal changes.** The plugin reads the rows the terminal already renders and never writes to it, so output, colors, and the shell are unaffected.
- **No Host route, no project code.** The browser half is a pair of document listeners; nothing runs on the Host.
- **Works with every terminal tab**, including ones opened after installing, and disposes cleanly when the plugin is removed.

## Install

In the desktop app, open **Plugins** in the sidebar, choose **Add plugin**, and enter this directory. The desktop profile is managed by the Electron app, which is why this is the preferred path there.

For another profile, use the CLI:

```bash
dsh plugin --profile <profile> add ./dsh-plugin-terminal-upgrades
```

Replace `<profile>` with the name shown by `dsh --profile <name> --dump-config` (for example `web`). Restart the Host or reload the page after installing.

The package ships its browser bundle (`client.js`), so no build step is required to install it.

## Usage

1. Run something that prints a URL, for example `pnpm dev` in a Next.js project.
2. Hold **Option** (`⌥`) on macOS — or **Alt**, **Cmd**, or **Ctrl** — and move the pointer over the URL. The terminal cursor becomes a hand.
3. Click. The URL opens in a new browser tab. In the desktop app it opens in the system browser.

Without the modifier, clicking the same URL does what it always did: it places the terminal cursor and starts a text selection.

## How it works

DeepSeek Harness renders terminals with xterm's DOM renderer, so the visible rows exist as text in the page. The plugin listens on `document`, maps a pointer position to the terminal row and character offset, and runs the same URL rules for any row under the pointer:

- `http://` and `https://` only.
- Sentence punctuation after a URL and an unbalanced closing bracket are left out, so `see https://example.test/docs.` links the URL without the period.
- A balanced closer stays part of the link, so `https://example.test/a_(b)` keeps its `)`.

The plugin adds no slot, no route, and no per-terminal setup, so it has nothing to clean up beyond removing its listeners.

## Limitations

- **One row at a time.** A URL that wraps onto the next terminal row is not detected; short links such as `http://localhost:3000` are unaffected.
- **No underline.** The terminal owns the rendering of its text, so the plugin cannot decorate a URL in place. The hand cursor is the affordance instead.
- **Programs that capture the mouse.** In a terminal program that reports mouse clicks itself, such as Vim or `less`, a modified click on a link is consumed by the plugin; a modified click elsewhere still reaches the program.
- **DOM renderer only.** The detection reads the rendered rows. If the terminal switches to a canvas or WebGL renderer, nothing is detected and the plugin does nothing.
- **Not a general link opener.** File paths, line numbers, and bare host names are not links.

## Development

```bash
pnpm install
pnpm run build   # regenerates client.js from src/client.js
pnpm test        # URL detection and pointer-offset unit tests
```

`src/client.js` is the source; `scripts/build-client.mjs` bundles it into `client.js` wrapped in the Harness module-loader shape. Edit `src/`, run `pnpm run build`, and reload the page.

# Build instructions

These steps reproduce the submitted package exactly. They are written for
add-on reviewers; nothing here is specific to one machine.

## Requirements

**Python 3.8 or newer.** Nothing else. No package manager, no dependencies, no
network access. The build script uses only the Python standard library.

Check with:

```
python --version
```

## Build

From the root of this source package:

```
python tools/build.py firefox
```

Output:

```
dist/firefox/                        the unpacked extension
dist/snaplocal-firefox-<version>.zip the submitted package
```

`python tools/build.py` with no argument builds all three targets (Edge, Chrome
and Firefox). The script first runs `tools/check-locales.py`, which verifies
that every locale has the same keys and placeholders, and aborts if it does not.

## What the build actually does

**No code is transformed.** There is no minifier, no bundler, no transpiler and
no template engine. Every `.js`, `.css` and `.json` file under `src/` is copied
byte for byte into the package. You can verify this with a recursive diff
between `src/` and `dist/firefox/`.

The Firefox target applies exactly three changes, all of them visible in the
packaged output:

**1. The background becomes an event page.** Manifest V3 in Firefox has no
service worker, so `background.service_worker` is replaced by
`background.scripts`.

**2. A five-line polyfill is generated** at `lib/browser-polyfill.js`:

```js
if (typeof globalThis.browser !== "undefined") {
  globalThis.chrome = globalThis.browser;
}
```

The source is written against the promise-based extension API. Firefox exposes
that on `browser`, while its `chrome` namespace is callback-based, so without
this alias every `await chrome.*` call in the extension would resolve to
`undefined`. On Chromium `browser` does not exist and the file does nothing.

A `<script>` tag loading this file is inserted into the three HTML pages
(`popup/popup.html`, `options/options.html`, `editor/editor.html`), immediately
after `<meta charset="utf-8">`. It is a classic script, so it runs before any
module on the page. This one added line is the only difference between the
packaged HTML and the source HTML.

**3. `browser_specific_settings` is added**, carrying the add-on id, the
minimum Firefox version, and `data_collection_permissions`. In the same
manifest, the `"incognito": "split"` key is removed: Chromium needs it to open
the editor page in a private window, while Firefox does not support split mode
and would install the extension as `"not_allowed"` in private windows. MDN
recommends deleting the key so Firefox keeps its default, `"spanning"`.

The whole script is about 170 lines of readable Python at `tools/build.py`, and
each of these three steps is commented there.

## Verifying the correspondence

```
python tools/build.py firefox --no-zip
diff -r src dist/firefox
```

The only differences you should see are the three items above: the reserialised
`manifest.json`, the added `lib/browser-polyfill.js`, and one `<script>` line in
each of the three HTML files. Nothing else, not even a line ending: the build
writes its generated files as bytes and keeps each HTML file's own newline
convention, so the same source produces the same package on Windows, Linux and
macOS.

## Project home

<https://github.com/Peiterc/snaplocal> — GPL-3.0.

The published repository holds this tree plus two things this package leaves
out, because neither is part of the extension: `app/`, a Windows desktop app
that reuses the same editor, and the store artwork. Everything the extension is
built from — `src/` and `tools/` — is here, complete.

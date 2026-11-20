# Accessibility audit

All commands run from the worktree root unless stated otherwise.

`audit` measures the editor against the redesign's accessibility rules and rewrites the generated half of `impower-dev/docs/design/audit.md`. It seeds its own fixture project (two scripts and two pictures) into the session's browser profile, so it replaces whatever project that profile holds.

```sh
node .agents/skills/drive-web-editor/driver.mjs up
ANDROID_SERIAL=emulator-5554 node .agents/skills/drive-web-editor/driver.mjs audit --device android --out <dir>
node .agents/skills/drive-web-editor/driver.mjs audit --out <dir> --doc impower-dev/docs/design/audit.md
```

The device run is optional and needs the [Android route](android.md); it measures touch targets and the on-screen keyboard on the emulator at its own width and writes `<dir>/audit-device.json`, which the main run with the same `--out` folds into the document. Without it the document says the emulator was not run. The main run takes about five minutes and launches its own Chromium contexts: desktop (1440×900, mouse) and the phone preset (360×780, touch) in Charcoal, then a reduced-motion context of each with a video recording, then a forced-colors desktop context. Screenshots of every route and surface land in `<dir>`; look at them, in particular the `forced-*.png` ones, which nothing else checks.

What each part measures (`--parts` runs a subset):

- `contrast`: every rendered text (a field's value or placeholder included), icon and form-field boundary on each route, scrolled into view or not, one row per element, in all eight themes, with the theme set the way the editor applies it (`data-theme`, and `data-surfaces` and `data-syntax` at their defaults for Graphite and Warm Folio); opened surfaces in Charcoal and Chalk only. The backdrop is the element's ancestors' background colours composited; an ancestor with a background image is reported as not measured. A field with no drawn boundary is reported as not measured, not as a failure. Also the token-pair table from the computed custom properties.
- `axe`: axe-core's WCAG 2.0 and 2.1 A and AA rules in Charcoal and Chalk, excluding the game's frame.
- `targets`: under the phone preset, each control's hit area by hit testing outward from its centre; a tap on the control's own label counts. Each control is scrolled to the centre of its scroller before it is measured, so a fixed bar does not cover it, and the scroll positions are restored afterwards.
- `keyboard`: the Tab order of each route on desktop, each stop named by Chromium's accessibility tree (over CDP), with whether each stop's focus edge is visible (a computed style of the control, its pseudo-elements or its two nearest ancestors differs between focused and blurred; in the script the caret counts). The page is reloaded after each route's pass. Enter and Space are not pressed: a stop counts as operable when it is a native control or carries a role.
- `escape`: each surface the named steps open, closed with Escape, and where focus lands.
- `shortcuts`: each editor row of the keymap table pressed in the script, with the effect it had; rows that need a context the fixture lacks (a call, a running game) show no effect.
- `motion`: CSS transitions and animations, Web Animations calls and View Transitions that start under `prefers-reduced-motion: reduce`; progress bars are allowed.
- `forced`: the first stops of each route's Tab order under `forced-colors: active`, and screenshots.
- `copy`: the old words, sentence case outside glossary phrases, and glossary strings rendered with different capitals.
- `structure`: landmarks, live regions and lists per route.

The screen-reader pass with NVDA and anything visual (the forced-colors screenshots, the reduced-motion recordings) stay manual.

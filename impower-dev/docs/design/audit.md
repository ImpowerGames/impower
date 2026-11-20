# Accessibility audit

The redesigned editor measured against the rules every Folio slice carried: WCAG AA contrast, keyboard operation with a visible focus edge, 44×44px targets under a coarse pointer, no motion under `prefers-reduced-motion: reduce` except progress bars and the game, system colours under forced colors, a landmark structure for screen readers, and the copy in [the glossary](glossary.md). Out of scope: the standalone player, VS Code and the game's own interface.

## Rerunning it

The results below are generated. Rerun them from a worktree with the dev servers up, as [the driver's audit reference](../../../.agents/skills/drive-web-editor/references/audit.md) describes:

```sh
node .agents/skills/drive-web-editor/driver.mjs audit --device android --out <dir>
node .agents/skills/drive-web-editor/driver.mjs audit --out <dir> --doc impower-dev/docs/design/audit.md
```

The second command rewrites everything between the two markers below and nothing else.

## Triage

The first run measured main at `b969caf645`, before any fix; its tables are in this file at commit `385df05f1a`. Against that starting point:

- Charcoal and Chalk had no text or icon below its contrast threshold. Their one failure is the boundary of the bordered text fields (Search scripts, Search assets), 1.27 to 1.85:1 against 3:1.
- Sepia had 20 text failures (muted and warning text at 4.19 to 4.35:1 on its raised surface, tint and preview mat). The other themes had only the field boundary.
- axe-core found an untitled game frame on every desktop route, plus the failures filed below.
- Under a coarse pointer the Settings section chips were 36px tall, and the phone title bar's three controls took taps in a 25 to 27px strip.
- Under reduced motion the Settings page's script sample still animated its line numbers (180ms).
- Every Tab stop on every route showed a focus edge, none was focusable without a role, and every menu, sheet and inspector closed with Escape.

That first run measured only what each route's first screen showed. The scans now cover whole pages, and that found three more things. Settings draws its switches, selects and text fields with the same divider-coloured boundary as the search fields, which widens #2643. The Emphasize markup row dims its markers to 2.26 to 3.32:1 (#2658). The Settings script sample's selector took taps in 36px under touch, which is fixed below.

The rerun measured main at `c8fd9c91ce` on 2026-11-20, after #2643, #2644 and #2658 closed; the Results below are that run. Charcoal and Chalk have zero failures for rendered contrast, touch targets (on the 360 preset and on the 430 emulator) and keyboard operation: every Tab stop is named, shows a focus edge and carries a role. The failures left are:

- Midnight and Dusk field placeholders, 1.87 to 2.57:1, kept by the decision under Decisions and readings.
- Chalk's `--warning` token pairs on `--tint` and `--elevated`, which no screen draws, accepted under Decisions and readings.
- axe-core's `aria-valid-attr-value` on every route's tabs, which is #2641, open.
- The Add panel's Escape returning focus to the script, kept by decision.

### Fixed in this change

| Finding | Fix | Where |
|---|---|---|
| The game frame had no accessible name | Titled "*story title* game preview", the glossary's frame title | `PreviewGame.tsx` |
| Sepia's muted and warning text under 4.5:1 | `--muted` `#64615a`, `--warning` `#8f5400` | `theme.css`, `tokens.md` |
| Settings section chips 36px under touch | 44px under a coarse pointer; a mouse keeps 36px | `JumpChips.tsx` |
| Selects 36px under touch (the Settings script sample's selector) | 44px under a coarse pointer; a mouse keeps 36px | `Select.tsx` |
| The desktop divider between the page and the preview had no accessible name | Named per route as the glossary gives it ("Resize script and preview panes" and its Scripts and page forms) | `MainWindow.tsx` |
| The Settings sample's gutter moved under reduced motion | The editor theme turns its transitions off under reduced motion, declared after the rules it overrides | `EDITOR_THEME.ts` |

### Filed

| Bug | Finding |
|---|---|
| #2636 | The tab crashes when a script is opened from the Scripts page after the project name was clicked (found by the keyboard pass) |
| #2639 | No banner landmark on any route: the whole page is one `main` |
| #2640 | The script editor's text box and its loading bar have no accessible name |
| #2641 | Every tab's `aria-controls` points at a panel that does not exist |
| #2642 | The page cannot be zoomed on a phone (`maximum-scale=1`, `user-scalable=no`) |
| #2643 | Bordered form controls (the search fields, and the switches, selects and fields in Settings and the Watch panel) reach 1.3 to 1.9:1 against their surface, the one control failure left in Charcoal and Chalk |
| #2644 | The phone title bar's project name, save status and problem count take taps in a 25 to 27px strip |
| #2646 | Script rows, asset rows and the aspect-ratio button are labelled with words other than the ones they show |
| #2647 | The app menu is an ARIA menu holding children a menu may not contain |
| #2658 | The Emphasize markup row's markers are dimmed to 2.26 to 3.32:1, the one text failure left in Charcoal and Chalk |
| #2662 | The title bar's save status button has an empty accessible name: the label that gives it its hit area supersedes its text |

### Known, owned by open tickets

Not fixed or filed here: #2586 (phone title bar spacing), #2591 (debug controls become a floating toolbar; the Step menu and the settings sheet's Step group were audited only lightly), #2592 (Replay beat icon), #2593 (Stop and the preview thumbnail), #2594 (on-screen keyboard layout), #2595 (URL names), #2596 (starting chip), #2597 (Settings sample scroll trap), #2531 and #2532 (player bar pressed colour and focus indicator), #2538, #2546, #2548, #2557.

### Decisions and readings

- Other themes. Ink, Sepia, Graphite and Warm Folio have no failure. Midnight keeps today's values by decision. It draws field placeholders in `#315881`, at 1.87 to 2.57:1. Dusk takes Midnight's component colours by design (the theme test "gives Dusk Midnight's colours"), so it shares both the placeholder colour and the decision. Changing Dusk's placeholder would separate it from Midnight; that is recorded here as accepted, not fixed.
- Token pairs that no screen draws. Chalk's `--warning` reaches 4.19:1 on `--tint` and 4.23:1 on `--elevated`. No audited view draws warning text on either surface, so both are accepted as recorded; a component that puts warning text there needs another colour.
- The Add panel returns focus to the script, at the caret it inserts at, rather than to its Add button. Its close handler does this on purpose (`AddPanel.tsx`), so the behaviour is kept and recorded here.
- Copy. No old word appears. The glossary quotes four prototype strings in title case that the editor shows in sentence case ("Editor & project preferences", and the Settings names "Play from here", "Step into" and "Step out"). The sentence-case rule is kept over the glossary's capitals. The preview's play button keeps the glossary's "Play From Here".
- Shortcuts. Every editor row of the keymap table had an effect except the two signature-help rows, which need a function call that the fixture does not have. Reindent changes the text when the lines are selected, as the setup does.
- Touch on the emulator. Centred in its scroller before it is measured, every control reaches 44×44, the same as on the 360 preset.
- On-screen keyboard. On the emulator no tapped field was covered once the keyboard was up. The script name field only shows in the phone layout's edit mode, so it was not tapped, and toasts were not raised. Both belong to #2594.
- Forced colors. No Tab stop lost its focus edge, and the screenshots show every control drawn in system colours. The rail's current route stays marked only by bold text. The current script row and the current outline scene lose their tint and accent bar. This is an observation from the screenshots, not measured, and not filed.
- Names in the keyboard order. The order is named from Chromium's accessibility tree. Every stop has a name. The game frame reads "Untitled story game preview".
- Live regions. The save status is a `status` ("Draft saved"). Each page ends with an empty `status` that receives toasts. Settings announces through an `output`. The caret position readout is a button with `aria-live="off"`, so it does not announce caret moves; whether it should is for the screen-reader pass below. The Outline ("Scene outline in main") and the Scripts rows ("Scripts and folders") are lists.

### Screen-reader pass

To be done with NVDA on Windows, in Chrome, on the editor with a project open:

1. Press Insert+F7 and choose Landmarks: expect banner, navigation, main and, on desktop, complementary.
2. Tab through Story: every button names what it does; the script editor names itself.
3. Type in the script and watch the title bar: the save status announces "Saving locally…" then "Saved locally".
4. Trigger a toast (for example add a file on Assets): NVDA reads it once.
5. Move the caret with the arrow keys: note whether the line and column are announced, and whether that is wanted.
6. In the Outline and on the Scripts page, press L to move between list items: each row reads its name.
7. Open the app menu, the Add panel and the asset inspector: NVDA reads each one's name on opening, and Escape returns to where you were.
8. On Settings, change a toggle: its new state is announced.

## Results

<!-- audit:begin -->
Generated by `node .agents/skills/drive-web-editor/driver.mjs audit` on 2026-11-20 (UTC) at commit `c8fd9c91ce`, in headless Chromium 149.0.7827.55.

### Token pairs

WCAG 2 contrast of each theme's semantic colour pairs, alpha composited over the surface. Text pairs need 4.5:1.

| Text | On | Charcoal | Chalk | Ink | Sepia | Graphite | Warm Folio | Midnight | Dusk |
|---|---|---|---|---|---|---|---|---|---|
| `--ink` | `--bg` | 14.00 | 13.66 | 14.56 | 12.83 | 14.00 | 14.56 | 13.82 | 13.96 |
| `--ink` | `--panel` | 12.51 | 14.79 | 13.20 | 13.78 | 12.51 | 13.20 | 17.69 | 17.72 |
| `--ink` | `--paper` | 13.49 | 15.44 | 13.87 | 14.25 | 13.49 | 13.87 | 18.99 | 18.88 |
| `--ink` | `--workspace` | 14.00 | 15.44 | 14.56 | 14.25 | 14.00 | 14.56 | 18.99 | 18.88 |
| `--ink` | `--elevated` | 10.52 | 12.46 | 11.30 | 11.69 | 10.52 | 11.30 | 13.82 | 13.96 |
| `--ink` | `--tint` | 11.11 | 12.33 | 10.49 | 12.16 | 11.04 | 10.49 | 11.98 | 12.05 |
| `--ink` | `--selection` | 9.08 | 11.88 | 7.07 | 11.14 | 8.41 | 7.07 | 8.50 | 8.50 |
| `--muted` | `--bg` | 8.24 | 5.07 | 8.34 | 5.11 | 8.24 | 8.34 | 5.89 | 5.97 |
| `--muted` | `--panel` | 7.36 | 5.49 | 7.57 | 5.48 | 7.36 | 7.57 | 6.91 | 6.94 |
| `--muted` | `--paper` | 7.94 | 5.73 | 7.94 | 5.67 | 7.94 | 7.94 | 7.17 | 7.17 |
| `--muted` | `--workspace` | 8.24 | 5.73 | 8.34 | 5.67 | 8.24 | 8.34 | 7.17 | 7.17 |
| `--muted` | `--elevated` | 6.19 | 4.62 | 6.48 | 4.65 | 6.19 | 6.48 | 5.89 | 5.97 |
| `--muted` | `--tint` | 6.54 | 4.58 | 6.01 | 4.84 | 6.50 | 6.01 | 5.37 | 5.42 |
| `--muted` | `--preview-mat` | 8.24 | 5.73 | 8.34 | 4.79 | 8.24 | 8.34 | 6.91 | 6.94 |
| `--accent` | `--bg` | 8.80 | 5.43 | 9.16 | 5.29 | 6.15 | 9.16 | 6.48 | 6.54 |
| `--accent` | `--panel` | 7.86 | 5.88 | 8.31 | 5.69 | 5.49 | 8.31 | 8.29 | 8.31 |
| `--accent` | `--workspace` | 8.80 | 6.14 | 9.16 | 5.88 | 6.15 | 9.16 | 8.90 | 8.85 |
| `--accent` | `--tint` | 6.98 | 4.90 | 6.60 | 5.02 | 4.85 | 6.60 | 5.62 | 5.65 |
| `--accent-ink` | `--accent` | 8.53 | 6.07 | 8.53 | 6.07 | 5.96 | 8.53 | 8.90 | 8.90 |
| `--error` | `--panel` | 7.19 | 6.00 | 7.60 | 5.80 | 7.19 | 7.60 | 6.13 | 6.14 |
| `--error` | `--workspace` | 8.05 | 6.26 | 8.38 | 6.00 | 8.05 | 8.38 | 6.58 | 6.54 |
| `--warning` | `--panel` | 9.33 | 5.02 | 9.86 | 5.43 | 9.33 | 9.86 | 10.27 | 10.29 |
| `--warning` | `--workspace` | 10.44 | 5.24 | 10.87 | 5.61 | 10.44 | 10.87 | 11.03 | 10.96 |
| `--warning` | `--tint` | 8.29 | **4.19** | 7.83 | 4.79 | 8.24 | 7.83 | 6.96 | 7.00 |
| `--warning` | `--elevated` | 7.85 | **4.23** | 8.44 | 4.60 | 7.85 | 8.44 | 8.02 | 8.11 |
| `--warning` | `--preview-mat` | 10.44 | 5.24 | 10.87 | 4.74 | 10.44 | 10.87 | 10.27 | 10.29 |
| `--success` | `--panel` | 8.50 | 5.51 | 8.98 | 5.33 | 8.50 | 8.98 | 9.95 | 9.96 |
| `--success` | `--workspace` | 9.52 | 5.75 | 9.91 | 5.51 | 9.52 | 9.91 | 10.68 | 10.61 |
| `--bg` | `--ink` | 14.00 | 13.66 | 14.56 | 12.83 | 14.00 | 14.56 | 13.82 | 13.96 |

### Rendered contrast

Every rendered text, icon and form-control boundary on each route and opened surface, whether or not it is scrolled into view, measured from computed styles. Text needs 4.5:1 (3:1 at 24px, or 18.66px bold), icons and control boundaries 3:1. Disabled controls and the script's own syntax colours are counted apart.

| Theme | Viewport | Checked | Failures | Script-colour failures | Not measured |
|---|---|---|---|---|---|
| Charcoal | desktop | 1753 | 0 | 0 | 11 |
| Chalk | desktop | 1753 | 0 | 0 | 11 |
| Ink | desktop | 1008 | 0 | 0 | 5 |
| Sepia | desktop | 1008 | 0 | 0 | 5 |
| Graphite | desktop | 1008 | 0 | 0 | 5 |
| Warm Folio | desktop | 1008 | 0 | 0 | 5 |
| Midnight | desktop | 1008 | 6 | 0 | 5 |
| Dusk | desktop | 1008 | 6 | 0 | 5 |
| Charcoal | phone 360 | 978 | 0 | 0 | 7 |
| Chalk | phone 360 | 978 | 0 | 0 | 7 |
| Ink | phone 360 | 779 | 0 | 0 | 4 |
| Sepia | phone 360 | 779 | 0 | 0 | 4 |
| Graphite | phone 360 | 779 | 0 | 0 | 4 |
| Warm Folio | phone 360 | 779 | 0 | 0 | 4 |
| Midnight | phone 360 | 779 | 2 | 0 | 4 |
| Dusk | phone 360 | 779 | 2 | 0 | 4 |

Failures, one row per element and colour pair:

| Theme | Viewport | Surface | Kind | Element | Sample | Colours | Ratio | Needs |
|---|---|---|---|---|---|---|---|---|
| Midnight | desktop | Scripts | placeholder | main: input[aria-label="Search scripts"] | Search scripts | `#315881` on `#001124` | 2.57 | 4.5 |
| Midnight | desktop | Scripts | placeholder | Preview: input[aria-label="Add an expression to watch"] | Add expression | `#315881` on `#052d57` | 1.87 | 4.5 |
| Dusk | desktop | Scripts | placeholder | main: input[aria-label="Search scripts"] | Search scripts | `#315881` on `#041220` | 2.56 | 4.5 |
| Dusk | desktop | Scripts | placeholder | Preview: input[aria-label="Add an expression to watch"] | Add expression | `#315881` on `#0e2d4e` | 1.89 | 4.5 |
| Midnight | desktop | Assets | placeholder | main: input[aria-label="Search assets"] | Search assets | `#315881` on `#001124` | 2.57 | 4.5 |
| Midnight | desktop | Assets | placeholder | Preview: input[aria-label="Add an expression to watch"] | Add expression | `#315881` on `#052d57` | 1.87 | 4.5 |
| Dusk | desktop | Assets | placeholder | main: input[aria-label="Search assets"] | Search assets | `#315881` on `#041220` | 2.56 | 4.5 |
| Dusk | desktop | Assets | placeholder | Preview: input[aria-label="Add an expression to watch"] | Add expression | `#315881` on `#0e2d4e` | 1.89 | 4.5 |
| Midnight | desktop | Share | placeholder | Preview: input[aria-label="Add an expression to watch"] | Add expression | `#315881` on `#052d57` | 1.87 | 4.5 |
| Dusk | desktop | Share | placeholder | Preview: input[aria-label="Add an expression to watch"] | Add expression | `#315881` on `#0e2d4e` | 1.89 | 4.5 |
| Midnight | desktop | Settings | placeholder | Preview: input[aria-label="Add an expression to watch"] | Add expression | `#315881` on `#052d57` | 1.87 | 4.5 |
| Dusk | desktop | Settings | placeholder | Preview: input[aria-label="Add an expression to watch"] | Add expression | `#315881` on `#0e2d4e` | 1.89 | 4.5 |
| Midnight | phone 360 | Scripts | placeholder | main: input[aria-label="Search scripts"] | Search scripts | `#315881` on `#052d57` | 1.87 | 4.5 |
| Dusk | phone 360 | Scripts | placeholder | main: input[aria-label="Search scripts"] | Search scripts | `#315881` on `#0e2d4e` | 1.89 | 4.5 |
| Midnight | phone 360 | Assets | placeholder | main: input[aria-label="Search assets"] | Search assets | `#315881` on `#052d57` | 1.87 | 4.5 |
| Dusk | phone 360 | Assets | placeholder | main: input[aria-label="Search assets"] | Search assets | `#315881` on `#0e2d4e` | 1.89 | 4.5 |

Not measured in Charcoal and Chalk, because no boundary is drawn or the backdrop is an image:

| Viewport | Surface | Element | Sample | Reason |
|---|---|---|---|---|
| desktop | Settings | header: input[aria-label="Project name"] | Project name | no boundary is drawn |
| phone 360 | Settings | header: input[aria-label="Project name"] | Project name | no boundary is drawn |

### axe-core

axe-core 4.14.1, WCAG 2.0 and 2.1 A and AA rules, on every route and surface in Charcoal and Chalk.

| Theme | Viewport | Surface | Rule | Impact | Nodes | First element |
|---|---|---|---|---|---|---|
| Charcoal | desktop | Story | `aria-valid-attr-value` | critical | 1 | `<button type="button" role="tab" aria-selected="true" aria-controls="radix-P0-1-content-l..." data-state="active" id="ra` |
| Chalk | desktop | Story | `aria-valid-attr-value` | critical | 1 | `<button type="button" role="tab" aria-selected="true" aria-controls="radix-P0-1-content-l..." data-state="active" id="ra` |
| Charcoal | desktop | Story: add-menu | `aria-valid-attr-value` | critical | 1 | `<button type="button" role="tab" aria-selected="true" aria-controls="radix-P0-1-content-l..." data-state="active" id="ra` |
| Chalk | desktop | Story: add-menu | `aria-valid-attr-value` | critical | 1 | `<button type="button" role="tab" aria-selected="true" aria-controls="radix-P0-1-content-l..." data-state="active" id="ra` |
| Charcoal | desktop | Story: problems | `aria-valid-attr-value` | critical | 1 | `<button type="button" role="tab" aria-selected="true" aria-controls="radix-P0-1-content-l..." data-state="active" id="ra` |
| Chalk | desktop | Story: problems | `aria-valid-attr-value` | critical | 1 | `<button type="button" role="tab" aria-selected="true" aria-controls="radix-P0-1-content-l..." data-state="active" id="ra` |
| Charcoal | desktop | Scripts | `aria-valid-attr-value` | critical | 1 | `<button type="button" role="tab" aria-selected="true" aria-controls="radix-P0-1-content-l..." data-state="active" id="ra` |
| Chalk | desktop | Scripts | `aria-valid-attr-value` | critical | 1 | `<button type="button" role="tab" aria-selected="true" aria-controls="radix-P0-1-content-l..." data-state="active" id="ra` |
| Charcoal | desktop | Assets | `aria-valid-attr-value` | critical | 2 | `<button type="button" role="tab" aria-selected="true" aria-controls="radix-P0-1-content-a..." data-state="active" id="ra` |
| Chalk | desktop | Assets | `aria-valid-attr-value` | critical | 2 | `<button type="button" role="tab" aria-selected="true" aria-controls="radix-P0-1-content-a..." data-state="active" id="ra` |
| Charcoal | desktop | Assets: asset-inspector | `aria-valid-attr-value` | critical | 2 | `<button type="button" role="tab" aria-selected="true" aria-controls="radix-P0-1-content-a..." data-state="active" id="ra` |
| Chalk | desktop | Assets: asset-inspector | `aria-valid-attr-value` | critical | 2 | `<button type="button" role="tab" aria-selected="true" aria-controls="radix-P0-1-content-a..." data-state="active" id="ra` |
| Charcoal | desktop | Share | `aria-valid-attr-value` | critical | 1 | `<button type="button" role="tab" aria-selected="true" aria-controls="radix-P0-1-content-s..." data-state="active" id="ra` |
| Chalk | desktop | Share | `aria-valid-attr-value` | critical | 1 | `<button type="button" role="tab" aria-selected="true" aria-controls="radix-P0-1-content-s..." data-state="active" id="ra` |
| Charcoal | phone 360 | Story | `aria-valid-attr-value` | critical | 1 | `<button type="button" role="tab" aria-selected="true" aria-controls="radix-P0-4-content-l..." data-state="active" id="ra` |
| Chalk | phone 360 | Story | `aria-valid-attr-value` | critical | 1 | `<button type="button" role="tab" aria-selected="true" aria-controls="radix-P0-4-content-l..." data-state="active" id="ra` |
| Charcoal | phone 360 | Scripts | `aria-valid-attr-value` | critical | 1 | `<button type="button" role="tab" aria-selected="true" aria-controls="radix-P0-26-content-..." data-state="active" id="ra` |
| Chalk | phone 360 | Scripts | `aria-valid-attr-value` | critical | 1 | `<button type="button" role="tab" aria-selected="true" aria-controls="radix-P0-26-content-..." data-state="active" id="ra` |
| Charcoal | phone 360 | Assets | `aria-valid-attr-value` | critical | 2 | `<button type="button" role="tab" aria-selected="true" aria-controls="radix-P0-50-content-..." data-state="active" id="ra` |
| Chalk | phone 360 | Assets | `aria-valid-attr-value` | critical | 2 | `<button type="button" role="tab" aria-selected="true" aria-controls="radix-P0-50-content-..." data-state="active" id="ra` |
| Charcoal | phone 360 | Share | `aria-valid-attr-value` | critical | 1 | `<button type="button" role="tab" aria-selected="true" aria-controls="radix-P0-4-content-s..." data-state="active" id="ra` |
| Chalk | phone 360 | Share | `aria-valid-attr-value` | critical | 1 | `<button type="button" role="tab" aria-selected="true" aria-controls="radix-P0-4-content-s..." data-state="active" id="ra` |

### Touch targets

Every rendered control under a coarse pointer, scrolled to the centre of its scroller first, measured by hit testing outward from its centre: the hit area counts the points where a tap lands on the control or on its label, up to 44px each way. Chromium's phone preset at 360×780 with touch; and the Android emulator at its own width of 430px (sdk_gphone64_x86_64 emulator-5554, Chrome 124.0.6367.219), run on 2026-11-20 at commit `c8fd9c91ce` with `audit --device android`.

| Viewport | Surface | Controls | Under 44×44 |
|---|---|---|---|
| phone 360 | Story | 14 | 0 |
| phone 360 | Story: app-menu | 5 | 0 |
| phone 360 | Scripts | 15 | 0 |
| phone 360 | Scripts: file-menu | 6 | 0 |
| phone 360 | Assets | 16 | 0 |
| phone 360 | Assets: asset-inspector | 7 | 0 |
| phone 360 | Share | 10 | 0 |
| phone 360 | Settings | 117 | 0 |
| emulator 430 | Story | 13 | 0 |
| emulator 430 | Story: add-menu | 7 | 0 |
| emulator 430 | Scripts | 15 | 0 |
| emulator 430 | Assets | 16 | 0 |
| emulator 430 | Assets: asset-inspector | 7 | 0 |
| emulator 430 | Share | 10 | 0 |
| emulator 430 | Settings | 116 | 0 |

### On-screen keyboard

Each text field tapped on the Android emulator, then the field's bottom edge compared with the bottom of the visual viewport once the keyboard is up.

| Field | Route | Keyboard up | Field bottom | Visible bottom | Covered |
|---|---|---|---|---|---|
| Search scripts | Scripts | yes | 252 | 495 | no |
| Search assets | Assets | yes | 149 | 495 | no |
| Script name | Story | – | – | – | not on screen |
| Project name | Story | yes | 45 | 447 | no |

### Keyboard order

Tab from the page start until the order repeats, on the desktop layout in Charcoal. Each stop: its role and accessible name as Chromium's accessibility tree computes them, whether the focus edge is visible (a computed style of the control, its pseudo-elements or its two nearest ancestors differs between focused and blurred). Inside the script, Escape then Tab leaves the editor. Enter and Space are not pressed: a stop counts as operable when it is a native control or carries a role, and a focusable element with neither is marked.

#### Story

42 stops; 0 without a visible focus edge; 0 focusable without a role.

1. textbox “Project name”
2. button “Draft saved”
3. tab “Story”
4. button “Search”
5. button “Script setup”
6. button “Scene: start”
7. button “Scene total: 1 warning in HARBOR”
8. button “Scene: HARBOR, 1 warning in this scene”
9. button “Collapse scene HARBOR”
10. button “Choose: What does Mara do?”
11. button “Saved locally”
12. button “Show line numbers”
13. button “Show problems”
14. button “Browse scripts”
15. button “Fold”
16. button “Fold”
17. button “Fold”
18. button “Fold”
19. button “Fold”
20. button “Fold”
21. button “Fold”
22. button “Fold”
23. button “Fold”
24. textbox “main” — focus shown by the caret
25. button “Writing tools”
26. button “Line 1, Col 1”
27. button “Add”
28. separator “Resize script and preview panes”
29. button “Viewing mode: Visual Novel”
30. button “Replay beat”
31. button “Skip back”
32. button “Play From Here”
33. button “Skip forward”
34. button “Saves”
35. button “Preview settings”
36. Iframe “Untitled story game preview”
37. separator “Resize game and panel”
38. button “2 problems”
39. button “main : 1”
40. button “Game aspect ratio: Auto, 544×694 pixels”
41. button “Fullscreen preview”
42. separator “Resize sidebar”

#### Scripts

49 stops; 0 without a visible focus edge; 0 focusable without a role.

1. textbox “Project name”
2. button “Draft saved”
3. tab “Story”
4. button “Search”
5. button “Script setup”
6. button “Scene: start”
7. button “Scene total: 1 warning in HARBOR”
8. button “Scene: HARBOR, 1 warning in this scene”
9. button “Collapse scene HARBOR”
10. button “Choose: What does Mara do?”
11. button “Saved locally”
12. button “Back to story”
13. searchbox “Search scripts”
14. button “New”
15. button “Scripts options”
16. button “Sort by name, a to z”
17. button “Open script Main, Entry script · Modified just now · 323 B”
18. button “1 warning in Main”
19. button “Options for Main”
20. checkbox “Select boat.sd”
21. button “Open script boat.sd, Modified just now · 132 B”
22. button “1 warning in boat.sd”
23. button “Options for boat.sd”
24. separator “Resize scripts and preview panes”
25. button “Viewing mode: Visual Novel”
26. button “Replay beat”
27. button “Skip back”
28. button “Play From Here”
29. button “Skip forward”
30. button “Saves”
31. button “Preview settings”
32. Iframe “Untitled story game preview”
33. separator “Resize game and panel”
34. button “2 problems”
35. button “main : 1”
36. button “Game aspect ratio: Auto, 544×496 pixels”
37. button “Fullscreen preview”
38. button “0 errors. Hide errors”
39. button “2 warnings. Hide warnings”
40. button “0 notes. Hide notes”
41. button “In the script, 2 problems”
42. button “Open Main at line 13”
43. button “Open boat at line 2”
44. button “While playing”
45. button “Variables”
46. button “Watch”
47. textbox “Add an expression to watch”
48. button “Call stack”
49. separator “Resize sidebar”

#### Assets

49 stops; 0 without a visible focus edge; 0 focusable without a role.

1. textbox “Project name”
2. button “Draft saved”
3. tab “Assets”
4. button “Search”
5. button “Script setup”
6. button “Scene: start”
7. button “Scene total: 1 warning in HARBOR”
8. button “Scene: HARBOR, 1 warning in this scene”
9. button “Collapse scene HARBOR”
10. button “Choose: What does Mara do?”
11. button “Saved locally”
12. searchbox “Search assets”
13. button “Add”
14. tab “Images”
15. button “Images options”
16. button “Change how this folder is shown”
17. button “Sort by name, a to z”
18. checkbox “Select harbor”
19. button “Open image harbor, Modified just now · 608 B”
20. button “Options for harbor”
21. checkbox “Select pier”
22. button “Open image pier, Modified just now · 608 B”
23. button “Options for pier”
24. separator “Resize page and preview panes”
25. button “Viewing mode: Visual Novel”
26. button “Replay beat”
27. button “Skip back”
28. button “Play From Here”
29. button “Skip forward”
30. button “Saves”
31. button “Preview settings”
32. Iframe “Untitled story game preview”
33. separator “Resize game and panel”
34. button “2 problems”
35. button “main : 1”
36. button “Game aspect ratio: Auto, 544×496 pixels”
37. button “Fullscreen preview”
38. button “0 errors. Hide errors”
39. button “2 warnings. Hide warnings”
40. button “0 notes. Hide notes”
41. button “In the script, 2 problems”
42. button “Open Main at line 13”
43. button “Open boat at line 2”
44. button “While playing”
45. button “Variables”
46. button “Watch”
47. textbox “Add an expression to watch”
48. button “Call stack”
49. separator “Resize sidebar”

#### Share

42 stops; 0 without a visible focus edge; 0 focusable without a role.

1. textbox “Project name”
2. button “Draft saved”
3. tab “Share”
4. button “Search”
5. button “Script setup”
6. button “Scene: start”
7. button “Scene total: 1 warning in HARBOR”
8. button “Scene: HARBOR, 1 warning in this scene”
9. button “Collapse scene HARBOR”
10. button “Choose: What does Mara do?”
11. button “Saved locally”
12. button “Back to story”
13. link “Open your project in VS Code”
14. link “Screenplay settings”
15. button “Download PDF”
16. button “Download HTML”
17. separator “Resize page and preview panes”
18. button “Viewing mode: Visual Novel”
19. button “Replay beat”
20. button “Skip back”
21. button “Play From Here”
22. button “Skip forward”
23. button “Saves”
24. button “Preview settings”
25. Iframe “Untitled story game preview”
26. separator “Resize game and panel”
27. button “2 problems”
28. button “main : 1”
29. button “Game aspect ratio: Auto, 544×496 pixels”
30. button “Fullscreen preview”
31. button “0 errors. Hide errors”
32. button “2 warnings. Hide warnings”
33. button “0 notes. Hide notes”
34. button “In the script, 2 problems”
35. button “Open Main at line 13”
36. button “Open boat at line 2”
37. button “While playing”
38. button “Variables”
39. button “Watch”
40. textbox “Add an expression to watch”
41. button “Call stack”
42. separator “Resize sidebar”

#### Settings

144 stops; 0 without a visible focus edge; 0 focusable without a role.

1. textbox “Project name”
2. button “Draft saved”
3. tab “Story”
4. button “Editor preferences”
5. button “Appearance”
6. button “Script editor”
7. button “Keyboard shortcuts”
8. button “Preview”
9. button “Project preferences”
10. button “Metadata”
11. button “Screenplay”
12. button “Add menu”
13. button “File types”
14. button “Save & sync”
15. button “Saved locally”
16. button “Back to story”
17. button “Reset to defaults”
18. radio “Charcoal Neutral grey · peach accents”
19. switch “Bold declaration names”
20. switch “Bold speaker names”
21. switch “Bold container names”
22. switch “Tinted dialogue”
23. switch “Italic comments”
24. switch “Emphasize markup”
25. switch “Highlight matching symbols”
26. switch “Hover previews”
27. combobox “Show indentation guides”
28. combobox “Sample”
29. region “Read-only syntax sample”
30. DisclosureTriangle “Syntax color key”
31. switch “Suggest autocompletions”
32. switch “Auto-rename asset files”
33. switch “Auto-close angle brackets”
34. button “Undo shortcut: Ctrl+Z. Press to change.”
35. button “Redo shortcut: Ctrl+Y. Press to change.”
36. button “Format script shortcut: Ctrl+S. Press to change.”
37. button “Rename shortcut: F2. Press to change.”
38. button “Show suggestions shortcut: Ctrl+Space. Press to change.”
39. button “Fold a block shortcut: Ctrl+Shift+[. Press to change.”
40. button “Open a folded block shortcut: Ctrl+Shift+]. Press to change.”
41. button “Search shortcut: Ctrl+F. Press to change.”
42. button “Go to definition shortcut: F12. Press to change.”
43. button “Find references shortcut: Shift+F12. Press to change.”
44. button “Undo a selection change shortcut: Ctrl+U. Press to change.”
45. button “Redo a selection change shortcut: Alt+U. Press to change.”
46. button “Indent shortcut: Ctrl+]. Press to change.”
47. button “Dedent shortcut: Ctrl+[. Press to change.”
48. button “Reindent the selection shortcut: Ctrl+Alt+\. Press to change”
49. button “Toggle comment shortcut: Ctrl+/. Press to change.”
50. button “Toggle block comment shortcut: Shift+Alt+A. Press to change.”
51. button “Move line up shortcut: Alt+Up. Press to change.”
52. button “Move line down shortcut: Alt+Down. Press to change.”
53. button “Duplicate line above shortcut: Shift+Alt+Up. Press to change”
54. button “Duplicate line shortcut: Shift+Alt+Down. Press to change.”
55. button “Delete line shortcut: Ctrl+Shift+K. Press to change.”
56. button “Insert a blank line below shortcut: Ctrl+Enter. Press to cha”
57. button “Select all shortcut: Ctrl+A. Press to change.”
58. button “Select line shortcut: Alt+L. Press to change.”
59. button “Expand the selection shortcut: Ctrl+I. Press to change.”
60. button “Add a caret above shortcut: Ctrl+Alt+Up. Press to change.”
61. button “Add a caret below shortcut: Ctrl+Alt+Down. Press to change.”
62. button “Go to the matching bracket shortcut: Ctrl+Shift+\. Press to ”
63. button “Fold every block shortcut: Ctrl+Alt+[. Press to change.”
64. button “Open every folded block shortcut: Ctrl+Alt+]. Press to chang”
65. button “Let Tab move focus shortcut: Ctrl+M. Press to change.”
66. button “Next match shortcut: F3. Press to change.”
67. button “Previous match shortcut: Shift+F3. Press to change.”
68. button “Select every match shortcut: Ctrl+Shift+L. Press to change.”
69. button “Add the next match to the selection shortcut: Ctrl+D. Press ”
70. button “Go to line shortcut: Ctrl+G. Press to change.”
71. button “Show problems shortcut: Ctrl+Shift+M. Press to change.”
72. button “Next problem shortcut: F8. Press to change.”
73. button “Show parameter hints shortcut: Ctrl+Shift+Space. Press to ch”
74. button “Previous parameter hint shortcut: Ctrl+Shift+Up. Press to ch”
75. button “Next parameter hint shortcut: Ctrl+Shift+Down. Press to chan”
76. button “Previous beat in the preview shortcut: PageUp. Press to chan”
77. button “Next beat in the preview shortcut: PageDown. Press to change”
78. button “Play from here shortcut: none. Press to change.”
79. button “Replay beat shortcut: Ctrl+Alt+Enter. Press to change.”
80. button “Step over shortcut: F10. Press to change.”
81. button “Step into shortcut: F11. Press to change.”
82. button “Step out shortcut: Shift+F11. Press to change.”
83. button “Previous choice in the preview shortcut: Shift+PageUp. Press”
84. button “Next choice in the preview shortcut: Shift+PageDown. Press t”
85. radio “Paper”
86. switch “Screenplay paper texture”
87. switch “Game preview follows cursor”
88. switch “Auto-play beats”
89. switch “Play audio”
90. switch “Show idle animations”
91. switch “Color typing pauses”
92. switch “Sync screenplay and editor scroll position”
93. button “Edit in Main”
94. button “Show preview”
95. switch “Title page”
96. switch “Bold headings”
97. combobox “Heading numbers”
98. switch “Scene names”
99. switch “Branch names”
100. switch “Function names”
101. combobox “Paper size”
102. switch “Page numbers”
103. switch “Allow dialogue to be split across page breaks”
104. textbox “Bottom of the page”
105. textbox “Top of the next page”
106. switch “Bookmarks”
107. switch “Bookmark hidden section names”
108. link “Try in Add”
109. textbox “Backdrop”
110. textbox “Portrait”
111. textbox “Music”
112. textbox “Sound”
113. slider “Visible area”
114. textbox “Scripts”
115. textbox “Images”
116. textbox “Audio”
117. textbox “Fonts”
118. button “Download .zip”
119. button “Choose a .zip…”
120. button “Connect Google Drive”
121. separator “Resize page and preview panes”
122. button “Viewing mode: Visual Novel”
123. button “Replay beat”
124. button “Skip back”
125. button “Play From Here”
126. button “Skip forward”
127. button “Saves”
128. button “Preview settings”
129. Iframe “Untitled story game preview”
130. separator “Resize game and panel”
131. button “No problems”
132. button “main : 1”
133. button “Game aspect ratio: Auto, 544×496 pixels”
134. button “Fullscreen preview”
135. button “0 errors. Hide errors”
136. button “0 warnings. Hide warnings”
137. button “0 notes. Hide notes”
138. button “In the script”
139. button “While playing”
140. button “Variables”
141. button “Watch”
142. textbox “Add an expression to watch”
143. button “Call stack”
144. separator “Resize sidebar”

### Escape and focus return

| Viewport | Surface | Opened | Closed by Escape | Focus returned to |
|---|---|---|---|---|
| desktop | app-menu | yes | yes | the opener (Saved locally) |
| desktop | add-menu | yes | yes | **main** (opener: Close add menu) |
| desktop | preview-settings | yes | yes | the opener (Preview settings) |
| desktop | problems | yes | a panel in the page, not an overlay | – |
| desktop | file-menu | yes | yes | the opener (Options for boat.sd) |
| desktop | asset-inspector | yes | yes | the opener (Open image harbor, Modified just now · 608 B) |
| phone 360 | app-menu | yes | yes | the opener (App menu) |
| phone 360 | add-menu | no: no Add button on screen: neither the writer's bar nor the keyboard toolbar shows one | – | – |
| phone 360 | preview-settings | no: the preview's settings button is not on screen; the preview pane may be hidden | – | – |
| phone 360 | problems | no: the problems toggle under the game is not on screen; the preview pane may be hidden | – | – |
| phone 360 | file-menu | yes | yes | the opener (Options for boat.sd) |
| phone 360 | asset-inspector | yes | yes | the opener (Open image harbor, Modified 2m · 608 B) |

### Editor shortcuts

Each editor row of the keymap table pressed in the script with the caret on line 14, Windows bindings. An effect is a change to the text, the selection, the carets, a fold, an open panel, tooltip or dialog, the route or the focus. A row with no effect here may need a context the fixture does not give (a running game, a second match, a call).

| Shortcut | Keys | Effect |
|---|---|---|
| Undo | `Mod+Z` | expanded a panel, text, selection |
| Redo | `Mod+Y` | text, selection |
| Format script | `Mod+S` | text, selection |
| Rename | `F2` | opened Rename HARBOR, focus |
| Show suggestions | `Ctrl+Space` | opened cm-suggestions-empty cm-tooltip cm-tooltip-below |
| Fold a block | `Mod+Shift+[` | expanded a panel, text, selection |
| Open a folded block | `Mod+Shift+]` | text, selection |
| Search | `Mod+F` | opened Search, focus |
| Go to definition | `F12` | expanded a panel, selection |
| Find references | `Shift+F12` | opened References to HARBOR, Main |
| Undo a selection change | `Mod+U` | selection |
| Redo a selection change | `Alt+U` | selection |
| Indent | `Mod+]` | text, selection |
| Dedent | `Mod+[` | text, selection |
| Reindent the selection | `Mod+Alt+\` | text |
| Toggle comment | `Mod+/` | text, selection |
| Toggle block comment | `Shift+Alt+A` | text |
| Move line up | `Alt+Up` | expanded a panel, text, selection |
| Move line down | `Alt+Down` | text, selection |
| Duplicate line above | `Shift+Alt+Up` | text |
| Duplicate line | `Shift+Alt+Down` | text, selection |
| Delete line | `Mod+Shift+K` | expanded a panel, text, selection |
| Insert a blank line below | `Mod+Enter` | text, selection |
| Select all | `Mod+A` | expanded a panel, selection |
| Select line | `Alt+L` | expanded a panel, selection |
| Expand the selection | `Mod+I` | selection |
| Add a caret above | `Mod+Alt+Up` | selection, carets |
| Add a caret below | `Mod+Alt+Down` | selection, carets |
| Go to the matching bracket | `Mod+Shift+\` | expanded a panel, selection |
| Fold every block | `Ctrl+Alt+[` | folds |
| Open every folded block | `Ctrl+Alt+]` | folds |
| Let Tab move focus | `Ctrl+M` | Tab then left the editor |
| Next match | `F3` | opened Search, focus |
| Previous match | `Shift+F3` | focus |
| Select every match | `Mod+Shift+L` | expanded a panel |
| Add the next match to the selection | `Mod+D` | selection |
| Go to line | `Mod+G` | opened cm-gotoLine cm-panel, focus |
| Show problems | `Mod+Shift+M` | expanded a panel |
| Next problem | `F8` | selection |
| Show parameter hints | `Mod+Shift+Space` | selection |
| Previous parameter hint | `Mod+Shift+Up` | **none seen** |
| Next parameter hint | `Mod+Shift+Down` | **none seen** |
| Previous beat in the preview | `PageUp` | expanded a panel, selection |
| Next beat in the preview | `PageDown` | expanded a panel, selection |

### Reduced motion

With `prefers-reduced-motion: reduce` emulated, every CSS transition and animation that started, every Web Animations call and every View Transition while visiting each route and opening each surface. Progress bars are allowed; the game runs in its own frame and is not counted.

| Viewport | Kind | Name | Element | Duration | Route |
|---|---|---|---|---|---|
| all | none | | | | |

Recordings: C:\Users\Lovelle\AppData\Local\Temp\claude\e87ebce098f3bdba\76a50fbe-09c8-48a2-ad5f-e68d7993c028\scratchpad\writer-2668-4SFrgj\audit\reduced-motion-desktop\page@03345075713a0db83912ed540c8b564c.webm, C:\Users\Lovelle\AppData\Local\Temp\claude\e87ebce098f3bdba\76a50fbe-09c8-48a2-ad5f-e68d7993c028\scratchpad\writer-2668-4SFrgj\audit\reduced-motion-phone\page@5c90b1b243ec722f1dfd68158eb86575.webm, C:\Users\Lovelle\AppData\Local\Temp\claude\e87ebce098f3bdba\76a50fbe-09c8-48a2-ad5f-e68d7993c028\scratchpad\writer-2668-4SFrgj\audit\reduced-motion-phone\page@e57787f77b09ea978d5eb6c09cc6e81d.webm (kept out of the repository).

### Forced colors

With `forced-colors: active` emulated on the desktop layout, the first stops of each route's Tab order and a screenshot of each route and surface, inspected by eye.

| Route | Stops checked | Without a visible focus edge |
|---|---|---|
| Story | 40 | 0 |
| Scripts | 40 | 0 |
| Assets | 40 | 0 |
| Share | 40 | 0 |
| Settings | 40 | 0 |

### Landmarks, live regions and lists

| Viewport | Route | banner | navigation | main | complementary | Live regions | Lists |
|---|---|---|---|---|---|---|---|
| desktop | Story | 1 | 2 | 1 | 2 | status “Draft saved”; div[aria-live=polite]; button[aria-live=off] “Line 1, Col 1”; status “2 problems”; status | tablist (3); list “Scene outline in main” (4) |
| desktop | Scripts | 1 | 3 | 1 | 2 | status “Draft saved”; status “2 problems”; status | tablist (3); list “Scene outline in main” (4); list “Scripts and folders” (2); list “Problems and playback messages” (15) |
| desktop | Assets | 1 | 3 | 1 | 2 | status “Draft saved”; status “2 problems”; status | tablist (3); list “Scene outline in main” (4); tablist (6); list “Assets and folders” (2); list “Problems and playback messages” (15) |
| desktop | Share | 1 | 2 | 1 | 2 | status “Draft saved”; status “2 problems”; status | tablist (3); list “Scene outline in main” (4); list “Problems and playback messages” (15) |
| desktop | Settings | 1 | 2 | 1 | 2 | status “Draft saved”; div[aria-live=polite]; output[aria-live=null] “Top 50%”; status “No problems”; status | tablist (3); list (2); list “Editor preferences” (4); list “Project preferences” (5); list “Problems and playback messages” (16) |
| phone 360 | Story | 1 | 1 | 1 | 0 | status “Draft saved”; div[aria-live=polite]; button[aria-live=off] “Line 17, Col 1”; status | tablist (3) |
| phone 360 | Scripts | 1 | 1 | 1 | 0 | status | tablist (2); list “Scripts and folders” (2) |
| phone 360 | Assets | 1 | 2 | 1 | 0 | status “Draft saved”; status | tablist (6); list “Assets and folders” (2); tablist (3) |
| phone 360 | Share | 1 | 1 | 1 | 0 | status “Draft saved”; status | tablist (3) |
| phone 360 | Settings | 1 | 2 | 1 | 0 | status “Draft saved”; div[aria-live=polite]; output[aria-live=null] “Top 50%”; status | tablist (3) |

### Copy

593 distinct strings read from every route and surface (text, aria-label, title, placeholder, alt). 304 of the glossary's 975 strings appeared as written; the rest belong to surfaces the audit does not open.

| Check | String | Where |
|---|---|---|
| Glossary has “Editor & Project Preferences” | Editor & project preferences | div > div:nth-of-type(1) > div:nth-of-type(1) > div |
| Glossary has “Play From Here” | Play from here | strong#shortcut-playFromHere-name |
| Glossary has “Step Into” | Step into | strong#shortcut-stepInto-name |
| Glossary has “Step Out” | Step out | strong#shortcut-stepOut-name |
| Not sentence case (Entry) | Open script Main, Entry script · Modified just now · 323 B | button[aria-label="Open script Main, Entry script · Modifie"] |
<!-- audit:end -->

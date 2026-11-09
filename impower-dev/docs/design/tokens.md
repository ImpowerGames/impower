# Folio design tokens

The values the Folio redesign of the web editor is built from, transcribed from the
prototype at commit `c2fe740` (see [README.md](./README.md) for running it). Every
"Declared at" cell is a path relative to the prototype's `prototype/` directory with the
line and selector that wins the cascade. "Computed" is what the running page reports
through `getComputedStyle` at 1440×900 on `folio.html#write`, which resolves `var()`
references and colour spaces; where the declared value is itself a `var()`, both are
shown.

The prototype is the design of record; where its own notes or two of its stylesheets
disagree, the [inconsistencies](#inconsistencies) section records both and the value
this reference chooses.

## Themes

Nine choices, stored under the ids in `folio-themes.js:4-14`:

| Choice | Id | Detail line in Settings | Surfaces and syntax colours |
|---|---|---|---|
| Automatic | `auto` | Charcoal or Chalk, following your device | Resolves to Chalk when `prefers-color-scheme: light` matches, Charcoal otherwise (`folio-themes.js:28`). |
| Charcoal | `charcoal` | Neutral grey · peach accents | Preset: Unified, Charcoal syntax colours. The default dark theme. |
| Chalk | `chalk` | Neutral white · terracotta accents | Preset: Unified, Chalk syntax colours. The default light theme. |
| Ink | `ink` | Warm charcoal · peach accents | Preset: Unified, Ink syntax colours. |
| Sepia | `paper` | Warm cream · terracotta accents | Preset: Unified, Sepia syntax colours. The id keeps the old name Paper. |
| Graphite | `graphite` | Neutral charcoal · clay accents | Writer's choice of Surfaces (Unified or Lighter navigation) and Syntax colours (Original or Softened, default Softened). |
| Warm Folio | `warm` | Soft brown · peach accents | As Graphite. |
| Midnight | `midnight` | Original Spark Engine colors | Preset: Original syntax colours; surfaces are its own. |
| Dusk | `dusk` | Quieter navy · original syntax | Preset: Original syntax colours; surfaces are its own. |

The editor stores Automatic under the id `automatic`, its settings default, and applies
the resolved theme as `data-theme` on `<html>` before first paint. The browser's
`theme-color` follows the same resolved theme, from first paint and on every change: the
build writes each theme's `--bg` (as hex) into the meta tag. The web app manifest's
`theme_color` and `background_color` are static, so they take Charcoal's `--bg`,
`#202123`, the default dark theme's colour.

Graphite and Warm Folio read two more preferences, `surfaces` (`unified`, the default, or
`layered`) and `syntaxPalette` (`softened`, the default, or `original`), applied as
`data-surfaces` and `data-syntax` beside `data-theme` before first paint and on every
change. Every other theme removes both attributes and leaves the two stored preferences
as they were, so switching back to Graphite or Warm Folio restores them. Midnight and
Dusk take their Lighter navigation writing pane in their own blocks.

The prototype applies the theme as `data-theme` on `<body>`, with `data-surfaces` and
`data-syntax-palette` beside it (`folio-themes.js:113-128`); the syntax colours are
written as `--syntax-*` inline properties from `folio-syntax-palette.js`.

### Contrast of the default themes

Text-on-surface pairs for the two default themes, WCAG 2 contrast ratio of the computed
colours (alpha composited over the surface). Every pair is at or above 4.5:1.

| Text | On | Charcoal | Chalk |
|---|---|---|---|
| `--ink` | `--bg` | 14.00:1 | 13.66:1 |
| `--ink` | `--panel` | 12.51:1 | 14.79:1 |
| `--ink` | `--paper` | 13.49:1 | 15.44:1 |
| `--ink` | `--workspace` | 14.00:1 | 15.44:1 |
| `--ink` | `--elevated` | 10.52:1 | 12.46:1 |
| `--ink` | `--tint` | 11.11:1 | 12.33:1 |
| `--ink` | `--selection` | 9.08:1 | 11.88:1 |
| `--muted` | `--bg` | 8.24:1 | 5.07:1 |
| `--muted` | `--panel` | 7.36:1 | 5.49:1 |
| `--muted` | `--paper` | 7.94:1 | 5.73:1 |
| `--muted` | `--workspace` | 8.24:1 | 5.73:1 |
| `--muted` | `--elevated` | 6.19:1 | 4.62:1 |
| `--accent` | `--bg` | 8.80:1 | 5.43:1 |
| `--accent` | `--panel` | 7.86:1 | 5.88:1 |
| `--accent` | `--workspace` | 8.80:1 | 6.14:1 |
| `--accent` | `--tint` | 6.98:1 | 4.90:1 |
| `--accent-ink` | `--accent` | 8.53:1 | 6.07:1 |
| `--error` | `--panel` | 7.19:1 | 6.00:1 |
| `--error` | `--workspace` | 8.05:1 | 6.26:1 |
| `--warning` | `--panel` | 9.33:1 | 5.02:1 |
| `--warning` | `--workspace` | 10.44:1 | 5.24:1 |
| `--success` | `--panel` | 8.50:1 | 5.51:1 |
| `--success` | `--workspace` | 9.52:1 | 5.75:1 |
| `--bg` | `--ink` | 14.00:1 | 13.66:1 |

The lowest pairs are Chalk's muted ink on the raised surface (4.62:1) and Chalk's
accent on the tint (4.90:1); a component that puts muted text on `--elevated` in Chalk
has no margin left.

### Semantic colour variables per theme

#### Charcoal (default dark)

| Variable | Role | Value | Computed | Declared at |
|---|---|---|---|---|
| `--bg` | Surface: the page, the Scripts page, the bottom navigation | `#202123` | `rgb(32, 33, 35)` | `folio-themes.css:155` `body[data-theme="charcoal"]` |
| `--panel` | Surface: panels, menus, popovers, the inspector, buttons | `#282a2d` | `rgb(40, 42, 45)` | `folio-themes.css:156` `body[data-theme="charcoal"]` |
| `--paper` | Surface: inset wells (thumbnails, chips, fields) | `#232427` | `rgb(35, 36, 39)` | `folio-themes.css:157` `body[data-theme="charcoal"]` |
| `--workspace` | Surface: the writing pane (script, script header, writer's bar) | `#202123` (from `var(--bg)`) | `rgb(32, 33, 35)` | `folio-themes.css:17` `body[data-direction="folio"]` |
| `--workspace-deep` | Surface: the writing pane under Lighter navigation | `#1d1e20` | `rgb(29, 30, 32)` | `folio-themes.css:166` `body[data-theme="charcoal"]` |
| `--preview-mat` | Surface: the mat around the game preview | `#202123` (from `var(--workspace)`) | `rgb(32, 33, 35)` | `folio-themes.css:19` `body[data-direction="folio"]` |
| `--elevated` | Raised surface: tags, keycaps, the checked segment | `#34363a` | `rgb(52, 54, 58)` | `folio-themes.css:158` `body[data-theme="charcoal"]` |
| `--ink` | Ink: text and icons at full strength | `#f0efeb` | `rgb(240, 239, 235)` | `folio-themes.css:160` `body[data-theme="charcoal"]` |
| `--muted` | Muted ink: secondary text and chrome; the info problem colour | `#b9b9bd` | `rgb(185, 185, 189)` | `folio-themes.css:161` `body[data-theme="charcoal"]` |
| `--accent` | Accent: active navigation, links, focus edge, primary button, current-line rule | `#edb393` | `rgb(237, 179, 147)` | `folio-themes.css:162` `body[data-theme="charcoal"]` |
| `--accent-ink` | Ink on an accent fill | `#302017` | `rgb(48, 32, 23)` | `folio-themes.css:163` `body[data-theme="charcoal"]` |
| `--tint` | Tint: selected, current and drop-target washes | `#3b302a` | `rgb(59, 48, 42)` | `folio-themes.css:164` `body[data-theme="charcoal"]` |
| `--error` | Problem colour: error | `#f2a39c` | `rgb(242, 163, 156)` | `folio-themes.css:16` `body[data-direction="folio"]` |
| `--warning` | Problem colour: warning | `#edcc8b` | `rgb(237, 204, 139)` | `folio-themes.css:15` `body[data-direction="folio"]` |
| `--success` | Problem colour: success | `#b4ceb1` | `rgb(180, 206, 177)` | `folio-themes.css:165` `body[data-theme="charcoal"]` |
| `--edge` | Divider: borders and rules | `#494b50` | `rgb(73, 75, 80)` | `folio-themes.css:159` `body[data-theme="charcoal"]` |
| `--selection` | Selection: selected text in the script | `#4a3d35` | `rgb(74, 61, 53)` | `folio-themes.css:168` `body[data-theme="charcoal"]` |
| `--syntax-active` | The script's current-line band | `#242427` | `rgb(36, 36, 39)` | `folio-themes.css:169` `body[data-theme="charcoal"]` |
| `--scrollbar` | Scrollbar thumb (no track) | `#73757c` | `rgb(115, 117, 124)` | `folio-themes.css:167` `body[data-theme="charcoal"]` |
| `--control-hover` | Hover overlay on controls | `rgb(255 255 255 / 0.06)` | `rgba(255, 255, 255, 0.06)` | `folio-themes.css:3` `body[data-direction="folio"]` |
| `--stage-full` | Fullscreen player backdrop | `#0a0a0b` | `rgb(10, 10, 11)` | `folio-themes.css:170` `body[data-theme="charcoal"]` |

#### Chalk (default light)

| Variable | Role | Value | Computed | Declared at |
|---|---|---|---|---|
| `--bg` | Surface: the page, the Scripts page, the bottom navigation | `#ececee` | `rgb(236, 236, 238)` | `folio-themes.css:204` `body[data-theme="chalk"]` |
| `--panel` | Surface: panels, menus, popovers, the inspector, buttons | `#f5f5f6` | `rgb(245, 245, 246)` | `folio-themes.css:205` `body[data-theme="chalk"]` |
| `--paper` | Surface: inset wells (thumbnails, chips, fields) | `#fafafa` | `rgb(250, 250, 250)` | `folio-themes.css:206` `body[data-theme="chalk"]` |
| `--workspace` | Surface: the writing pane (script, script header, writer's bar) | `#fafafa` | `rgb(250, 250, 250)` | `folio-themes.css:217` `body[data-theme="chalk"]` |
| `--workspace-deep` | Surface: the writing pane under Lighter navigation | `#ececee` | `rgb(236, 236, 238)` | `folio-themes.css:218` `body[data-theme="chalk"]` |
| `--preview-mat` | Surface: the mat around the game preview | `#fafafa` (from `var(--workspace)`) | `rgb(250, 250, 250)` | `folio-themes.css:219` `body[data-theme="chalk"]` |
| `--elevated` | Raised surface: tags, keycaps, the checked segment | `#e2e2e5` | `rgb(226, 226, 229)` | `folio-themes.css:207` `body[data-theme="chalk"]` |
| `--ink` | Ink: text and icons at full strength | `#202123` | `rgb(32, 33, 35)` | `folio-themes.css:209` `body[data-theme="chalk"]` |
| `--muted` | Muted ink: secondary text and chrome; the info problem colour | `#62636a` | `rgb(98, 99, 106)` | `folio-themes.css:210` `body[data-theme="chalk"]` |
| `--accent` | Accent: active navigation, links, focus edge, primary button, current-line rule | `#9c4519` | `rgb(156, 69, 25)` | `folio-themes.css:211` `body[data-theme="chalk"]` |
| `--accent-ink` | Ink on an accent fill | `#fff8ee` | `rgb(255, 248, 238)` | `folio-themes.css:212` `body[data-theme="chalk"]` |
| `--tint` | Tint: selected, current and drop-target washes | `#e0e1e5` | `rgb(224, 225, 229)` | `folio-themes.css:213` `body[data-theme="chalk"]` |
| `--error` | Problem colour: error | `#b3261e` | `rgb(179, 38, 30)` | `folio-themes.css:216` `body[data-theme="chalk"]` |
| `--warning` | Problem colour: warning | `#9a5a00` | `rgb(154, 90, 0)` | `folio-themes.css:215` `body[data-theme="chalk"]` |
| `--success` | Problem colour: success | `#33702f` | `rgb(51, 112, 47)` | `folio-themes.css:214` `body[data-theme="chalk"]` |
| `--edge` | Divider: borders and rules | `#d3d3d7` | `rgb(211, 211, 215)` | `folio-themes.css:208` `body[data-theme="chalk"]` |
| `--selection` | Selection: selected text in the script | `#dcdde2` | `rgb(220, 221, 226)` | `folio-themes.css:222` `body[data-theme="chalk"]` |
| `--syntax-active` | The script's current-line band | `#f0f0f2` | `rgb(240, 240, 242)` | `folio-themes.css:223` `body[data-theme="chalk"]` |
| `--scrollbar` | Scrollbar thumb (no track) | `#c0c0c5` | `rgb(192, 192, 197)` | `folio-themes.css:221` `body[data-theme="chalk"]` |
| `--control-hover` | Hover overlay on controls | `rgb(0 0 0 / 0.05)` | `rgba(0, 0, 0, 0.05)` | `folio-themes.css:203` `body[data-theme="chalk"]` |
| `--stage-full` | Fullscreen player backdrop | `#e6e6e8` | `rgb(230, 230, 232)` | `folio-themes.css:220` `body[data-theme="chalk"]` |

#### Ink

| Variable | Role | Value | Computed | Declared at |
|---|---|---|---|---|
| `--bg` | Surface: the page, the Scripts page, the bottom navigation | `#201d1a` | `rgb(32, 29, 26)` | `folio-themes.css:131` `body[data-theme="ink"]` |
| `--panel` | Surface: panels, menus, popovers, the inspector, buttons | `#292521` | `rgb(41, 37, 33)` | `folio-themes.css:132` `body[data-theme="ink"]` |
| `--paper` | Surface: inset wells (thumbnails, chips, fields) | `#25211e` | `rgb(37, 33, 30)` | `folio-themes.css:133` `body[data-theme="ink"]` |
| `--workspace` | Surface: the writing pane (script, script header, writer's bar) | `#201d1a` (from `var(--bg)`) | `rgb(32, 29, 26)` | `folio-themes.css:17` `body[data-direction="folio"]` |
| `--workspace-deep` | Surface: the writing pane under Lighter navigation | `#1b1816` | `rgb(27, 24, 22)` | `folio-themes.css:142` `body[data-theme="ink"]` |
| `--preview-mat` | Surface: the mat around the game preview | `#201d1a` (from `var(--workspace)`) | `rgb(32, 29, 26)` | `folio-themes.css:19` `body[data-direction="folio"]` |
| `--elevated` | Raised surface: tags, keycaps, the checked segment | `#36302a` | `rgb(54, 48, 42)` | `folio-themes.css:134` `body[data-theme="ink"]` |
| `--ink` | Ink: text and icons at full strength | `#f5eee4` | `rgb(245, 238, 228)` | `folio-themes.css:136` `body[data-theme="ink"]` |
| `--muted` | Muted ink: secondary text and chrome; the info problem colour | `#c2b5a5` | `rgb(194, 181, 165)` | `folio-themes.css:137` `body[data-theme="ink"]` |
| `--accent` | Accent: active navigation, links, focus edge, primary button, current-line rule | `#edb393` | `rgb(237, 179, 147)` | `folio-themes.css:138` `body[data-theme="ink"]` |
| `--accent-ink` | Ink on an accent fill | `#302017` | `rgb(48, 32, 23)` | `folio-themes.css:139` `body[data-theme="ink"]` |
| `--tint` | Tint: selected, current and drop-target washes | `#42332a` | `rgb(66, 51, 42)` | `folio-themes.css:140` `body[data-theme="ink"]` |
| `--error` | Problem colour: error | `#f2a39c` | `rgb(242, 163, 156)` | `folio-themes.css:16` `body[data-direction="folio"]` |
| `--warning` | Problem colour: warning | `#edcc8b` | `rgb(237, 204, 139)` | `folio-themes.css:15` `body[data-direction="folio"]` |
| `--success` | Problem colour: success | `#b4ceb1` | `rgb(180, 206, 177)` | `folio-themes.css:141` `body[data-theme="ink"]` |
| `--edge` | Divider: borders and rules | `#51483f` | `rgb(81, 72, 63)` | `folio-themes.css:135` `body[data-theme="ink"]` |
| `--selection` | Selection: selected text in the script | `#634a3e` | `rgb(99, 74, 62)` | `folio-themes.css:144` `body[data-theme="ink"]` |
| `--syntax-active` | The script's current-line band | `#2b2622` | `rgb(43, 38, 34)` | `folio-themes.css:145` `body[data-theme="ink"]` |
| `--scrollbar` | Scrollbar thumb (no track) | `#8b7969` | `rgb(139, 121, 105)` | `folio-themes.css:143` `body[data-theme="ink"]` |
| `--control-hover` | Hover overlay on controls | `rgb(255 255 255 / 0.06)` | `rgba(255, 255, 255, 0.06)` | `folio-themes.css:3` `body[data-direction="folio"]` |
| `--stage-full` | Fullscreen player backdrop | `#0a0a0b` | `rgb(10, 10, 11)` | `folio-themes.css:146` `body[data-theme="ink"]` |

#### Sepia (id `paper`)

| Variable | Role | Value | Computed | Declared at |
|---|---|---|---|---|
| `--bg` | Surface: the page, the Scripts page, the bottom navigation | `#efe9dc` | `rgb(239, 233, 220)` | `folio-themes.css:176` `body[data-theme="paper"]` |
| `--panel` | Surface: panels, menus, popovers, the inspector, buttons | `#f6f1e6` | `rgb(246, 241, 230)` | `folio-themes.css:177` `body[data-theme="paper"]` |
| `--paper` | Surface: inset wells (thumbnails, chips, fields) | `#f9f5ea` | `rgb(249, 245, 234)` | `folio-themes.css:178` `body[data-theme="paper"]` |
| `--workspace` | Surface: the writing pane (script, script header, writer's bar) | `#f9f5ea` | `rgb(249, 245, 234)` | `folio-themes.css:189` `body[data-theme="paper"]` |
| `--workspace-deep` | Surface: the writing pane under Lighter navigation | `#efe9dc` | `rgb(239, 233, 220)` | `folio-themes.css:190` `body[data-theme="paper"]` |
| `--preview-mat` | Surface: the mat around the game preview | `#e9e2d3` | `rgb(233, 226, 211)` | `folio-themes.css:191` `body[data-theme="paper"]` |
| `--elevated` | Raised surface: tags, keycaps, the checked segment | `#e6dfcf` | `rgb(230, 223, 207)` | `folio-themes.css:179` `body[data-theme="paper"]` |
| `--ink` | Ink: text and icons at full strength | `#252421` | `rgb(37, 36, 33)` | `folio-themes.css:181` `body[data-theme="paper"]` |
| `--muted` | Muted ink: secondary text and chrome; the info problem colour | `#6b6861` | `rgb(107, 104, 97)` | `folio-themes.css:182` `body[data-theme="paper"]` |
| `--accent` | Accent: active navigation, links, focus edge, primary button, current-line rule | `#9c4519` | `rgb(156, 69, 25)` | `folio-themes.css:183` `body[data-theme="paper"]` |
| `--accent-ink` | Ink on an accent fill | `#fff8ee` | `rgb(255, 248, 238)` | `folio-themes.css:184` `body[data-theme="paper"]` |
| `--tint` | Tint: selected, current and drop-target washes | `#f1e1d3` | `rgb(241, 225, 211)` | `folio-themes.css:185` `body[data-theme="paper"]` |
| `--error` | Problem colour: error | `#b3261e` | `rgb(179, 38, 30)` | `folio-themes.css:188` `body[data-theme="paper"]` |
| `--warning` | Problem colour: warning | `#9a5a00` | `rgb(154, 90, 0)` | `folio-themes.css:187` `body[data-theme="paper"]` |
| `--success` | Problem colour: success | `#33702f` | `rgb(51, 112, 47)` | `folio-themes.css:186` `body[data-theme="paper"]` |
| `--edge` | Divider: borders and rules | `#d6cdbb` | `rgb(214, 205, 187)` | `folio-themes.css:180` `body[data-theme="paper"]` |
| `--selection` | Selection: selected text in the script | `#efd6c2` | `rgb(239, 214, 194)` | `folio-themes.css:194` `body[data-theme="paper"]` |
| `--syntax-active` | The script's current-line band | `#f0ebdd` | `rgb(240, 235, 221)` | `folio-themes.css:195` `body[data-theme="paper"]` |
| `--scrollbar` | Scrollbar thumb (no track) | `#c4bba9` | `rgb(196, 187, 169)` | `folio-themes.css:193` `body[data-theme="paper"]` |
| `--control-hover` | Hover overlay on controls | `rgb(60 40 20 / 0.06)` | `rgba(60, 40, 20, 0.06)` | `folio-themes.css:175` `body[data-theme="paper"]` |
| `--stage-full` | Fullscreen player backdrop | `#ebebeb` | `rgb(235, 235, 235)` | `folio-themes.css:192` `body[data-theme="paper"]` |

#### Graphite (no `data-theme` block; the base `body[data-direction="folio"]` values)

| Variable | Role | Value | Computed | Declared at |
|---|---|---|---|---|
| `--bg` | Surface: the page, the Scripts page, the bottom navigation | `#202123` | `rgb(32, 33, 35)` | `folio-themes.css:4` `body[data-direction="folio"]` |
| `--panel` | Surface: panels, menus, popovers, the inspector, buttons | `#282a2d` | `rgb(40, 42, 45)` | `folio-themes.css:5` `body[data-direction="folio"]` |
| `--paper` | Surface: inset wells (thumbnails, chips, fields) | `#232427` | `rgb(35, 36, 39)` | `folio-themes.css:6` `body[data-direction="folio"]` |
| `--workspace` | Surface: the writing pane (script, script header, writer's bar) | `#202123` (from `var(--bg)`) | `rgb(32, 33, 35)` | `folio-themes.css:17` `body[data-direction="folio"]` |
| `--workspace-deep` | Surface: the writing pane under Lighter navigation | `#1d1e20` | `rgb(29, 30, 32)` | `folio-themes.css:18` `body[data-direction="folio"]` |
| `--preview-mat` | Surface: the mat around the game preview | `#202123` (from `var(--workspace)`) | `rgb(32, 33, 35)` | `folio-themes.css:19` `body[data-direction="folio"]` |
| `--elevated` | Raised surface: tags, keycaps, the checked segment | `#34363a` | `rgb(52, 54, 58)` | `folio-themes.css:7` `body[data-direction="folio"]` |
| `--ink` | Ink: text and icons at full strength | `#f0efeb` | `rgb(240, 239, 235)` | `folio-themes.css:9` `body[data-direction="folio"]` |
| `--muted` | Muted ink: secondary text and chrome; the info problem colour | `#b9b9bd` | `rgb(185, 185, 189)` | `folio-themes.css:10` `body[data-direction="folio"]` |
| `--accent` | Accent: active navigation, links, focus edge, primary button, current-line rule | `#c69581` | `rgb(198, 149, 129)` | `folio-themes.css:11` `body[data-direction="folio"]` |
| `--accent-ink` | Ink on an accent fill | `#302017` | `rgb(48, 32, 23)` | `folio-themes.css:12` `body[data-direction="folio"]` |
| `--tint` | Tint: selected, current and drop-target washes | `#39312e` | `rgb(57, 49, 46)` | `folio-themes.css:13` `body[data-direction="folio"]` |
| `--error` | Problem colour: error | `#f2a39c` | `rgb(242, 163, 156)` | `folio-themes.css:16` `body[data-direction="folio"]` |
| `--warning` | Problem colour: warning | `#edcc8b` | `rgb(237, 204, 139)` | `folio-themes.css:15` `body[data-direction="folio"]` |
| `--success` | Problem colour: success | `#b4ceb1` | `rgb(180, 206, 177)` | `folio-themes.css:14` `body[data-direction="folio"]` |
| `--edge` | Divider: borders and rules | `#494b50` | `rgb(73, 75, 80)` | `folio-themes.css:8` `body[data-direction="folio"]` |
| `--selection` | Selection: selected text in the script | `#51413b` | `rgb(81, 65, 59)` | `folio-themes.css:21` `body[data-direction="folio"]` |
| `--syntax-active` | The script's current-line band | `#242427` | `rgb(36, 36, 39)` | `folio-themes.css:22` `body[data-direction="folio"]` |
| `--scrollbar` | Scrollbar thumb (no track) | `#73757c` | `rgb(115, 117, 124)` | `folio-themes.css:20` `body[data-direction="folio"]` |
| `--control-hover` | Hover overlay on controls | `rgb(255 255 255 / 0.06)` | `rgba(255, 255, 255, 0.06)` | `folio-themes.css:3` `body[data-direction="folio"]` |

#### Warm Folio

| Variable | Role | Value | Computed | Declared at |
|---|---|---|---|---|
| `--bg` | Surface: the page, the Scripts page, the bottom navigation | `#201d1a` | `rgb(32, 29, 26)` | `folio-themes.css:65` `body[data-theme="warm"]` |
| `--panel` | Surface: panels, menus, popovers, the inspector, buttons | `#292521` | `rgb(41, 37, 33)` | `folio-themes.css:66` `body[data-theme="warm"]` |
| `--paper` | Surface: inset wells (thumbnails, chips, fields) | `#25211e` | `rgb(37, 33, 30)` | `folio-themes.css:67` `body[data-theme="warm"]` |
| `--workspace` | Surface: the writing pane (script, script header, writer's bar) | `#201d1a` (from `var(--bg)`) | `rgb(32, 29, 26)` | `folio-themes.css:17` `body[data-direction="folio"]` |
| `--workspace-deep` | Surface: the writing pane under Lighter navigation | `#1b1816` | `rgb(27, 24, 22)` | `folio-themes.css:76` `body[data-theme="warm"]` |
| `--preview-mat` | Surface: the mat around the game preview | `#201d1a` (from `var(--workspace)`) | `rgb(32, 29, 26)` | `folio-themes.css:19` `body[data-direction="folio"]` |
| `--elevated` | Raised surface: tags, keycaps, the checked segment | `#36302a` | `rgb(54, 48, 42)` | `folio-themes.css:68` `body[data-theme="warm"]` |
| `--ink` | Ink: text and icons at full strength | `#f5eee4` | `rgb(245, 238, 228)` | `folio-themes.css:70` `body[data-theme="warm"]` |
| `--muted` | Muted ink: secondary text and chrome; the info problem colour | `#c2b5a5` | `rgb(194, 181, 165)` | `folio-themes.css:71` `body[data-theme="warm"]` |
| `--accent` | Accent: active navigation, links, focus edge, primary button, current-line rule | `#edb393` | `rgb(237, 179, 147)` | `folio-themes.css:72` `body[data-theme="warm"]` |
| `--accent-ink` | Ink on an accent fill | `#302017` | `rgb(48, 32, 23)` | `folio-themes.css:73` `body[data-theme="warm"]` |
| `--tint` | Tint: selected, current and drop-target washes | `#42332a` | `rgb(66, 51, 42)` | `folio-themes.css:74` `body[data-theme="warm"]` |
| `--error` | Problem colour: error | `#f2a39c` | `rgb(242, 163, 156)` | `folio-themes.css:16` `body[data-direction="folio"]` |
| `--warning` | Problem colour: warning | `#edcc8b` | `rgb(237, 204, 139)` | `folio-themes.css:15` `body[data-direction="folio"]` |
| `--success` | Problem colour: success | `#b4ceb1` | `rgb(180, 206, 177)` | `folio-themes.css:75` `body[data-theme="warm"]` |
| `--edge` | Divider: borders and rules | `#51483f` | `rgb(81, 72, 63)` | `folio-themes.css:69` `body[data-theme="warm"]` |
| `--selection` | Selection: selected text in the script | `#634a3e` | `rgb(99, 74, 62)` | `folio-themes.css:78` `body[data-theme="warm"]` |
| `--syntax-active` | The script's current-line band | `#2b2622` | `rgb(43, 38, 34)` | `folio-themes.css:149` `body[data-theme="warm"]` |
| `--scrollbar` | Scrollbar thumb (no track) | `#8b7969` | `rgb(139, 121, 105)` | `folio-themes.css:77` `body[data-theme="warm"]` |
| `--control-hover` | Hover overlay on controls | `rgb(255 255 255 / 0.06)` | `rgba(255, 255, 255, 0.06)` | `folio-themes.css:3` `body[data-direction="folio"]` |

#### Midnight (today's impower.dev navy)

Midnight always renders with `data-surfaces="layered"` (`folio-themes.js:90-93`), so its writing pane takes `--workspace-deep`.

| Variable | Role | Value | Computed | Declared at |
|---|---|---|---|---|
| `--bg` | Surface: the page, the Scripts page, the bottom navigation | `hsl(210.7 89.1% 18%)` | `rgb(5, 45, 87)` | `folio-themes.css:82` `body[data-theme="midnight"]` |
| `--panel` | Surface: panels, menus, popovers, the inspector, buttons | `hsl(210.6 100% 10%)` | `rgb(0, 25, 51)` | `folio-themes.css:83` `body[data-theme="midnight"]` |
| `--paper` | Surface: inset wells (thumbnails, chips, fields) | `hsl(210.6 100% 7%)` | `rgb(0, 17, 36)` | `folio-themes.css:84` `body[data-theme="midnight"]` |
| `--workspace` | Surface: the writing pane (script, script header, writer's bar) | `hsl(210.6 100% 7%)` (from `var(--workspace-deep)`) | `rgb(0, 17, 36)` | `folio-themes.css:227` `body[data-surfaces="layered"]` |
| `--workspace-deep` | Surface: the writing pane under Lighter navigation | `hsl(210.6 100% 7%)` | `rgb(0, 17, 36)` | `folio-themes.css:95` `body[data-theme="midnight"]` |
| `--preview-mat` | Surface: the mat around the game preview | `hsl(210.6 100% 10%)` (from `var(--panel)`) | `rgb(0, 25, 51)` | `folio-themes.css:96` `body[data-theme="midnight"]` |
| `--elevated` | Raised surface: tags, keycaps, the checked segment | `hsl(210.7 89.1% 18%)` | `rgb(5, 45, 87)` | `folio-themes.css:85` `body[data-theme="midnight"]` |
| `--ink` | Ink: text and icons at full strength | `rgb(255 255 255)` | `rgb(255, 255, 255)` | `folio-themes.css:87` `body[data-theme="midnight"]` |
| `--muted` | Muted ink: secondary text and chrome; the info problem colour | `rgb(255 255 255 / 0.6)` | `rgba(255, 255, 255, 0.6)` | `folio-themes.css:88` `body[data-theme="midnight"]` |
| `--accent` | Accent: active navigation, links, focus edge, primary button, current-line rule | `hsl(207 61% 70% / 1)` | `rgb(132, 183, 225)` | `folio-themes.css:89` `body[data-theme="midnight"]` |
| `--accent-ink` | Ink on an accent fill | `hsl(210.6 100% 7%)` | `rgb(0, 17, 36)` | `folio-themes.css:90` `body[data-theme="midnight"]` |
| `--tint` | Tint: selected, current and drop-target washes | `rgb(255 255 255 / 0.05)` | `rgba(255, 255, 255, 0.05)` | `folio-themes.css:91` `body[data-theme="midnight"]` |
| `--error` | Problem colour: error | `oklch(70.4% 0.191 22.216)` | `oklch(0.704 0.191 22.216)` | `folio-themes.css:94` `body[data-theme="midnight"]` |
| `--warning` | Problem colour: warning | `oklch(82.8% 0.189 84.429)` | `oklch(0.828 0.189 84.429)` | `folio-themes.css:93` `body[data-theme="midnight"]` |
| `--success` | Problem colour: success | `oklch(79.2% 0.209 151.711)` | `oklch(0.792 0.209 151.711)` | `folio-themes.css:92` `body[data-theme="midnight"]` |
| `--edge` | Divider: borders and rules | `rgb(255 255 255 / 0.12)` | `rgba(255, 255, 255, 0.12)` | `folio-themes.css:86` `body[data-theme="midnight"]` |
| `--selection` | Selection: selected text in the script | `#264f78` | `rgb(38, 79, 120)` | `folio-themes.css:98` `body[data-theme="midnight"]` |
| `--syntax-active` | The script's current-line band | `#0d263d` | `rgb(13, 38, 61)` | `folio-themes.css:100` `body[data-theme="midnight"]` |
| `--scrollbar` | Scrollbar thumb (no track) | `rgb(255 255 255 / 0.15)` | `rgba(255, 255, 255, 0.15)` | `folio-themes.css:97` `body[data-theme="midnight"]` |
| `--control-hover` | Hover overlay on controls | `rgb(255 255 255 / 0.06)` | `rgba(255, 255, 255, 0.06)` | `folio-themes.css:3` `body[data-direction="folio"]` |
| `--button-bg` | Primary button fill (Midnight and Dusk only) | `hsl(210.8 44.9% 34.9%)` | `rgb(49, 88, 129)` | `folio-themes.css:101` `body[data-theme="midnight"]` |
| `--sidebar` | Rail fill (Midnight and Dusk only) | `hsl(210.7 89.1% 12%)` | `rgb(3, 30, 58)` | `folio-themes.css:102` `body[data-theme="midnight"]` |

#### Dusk

Dusk always renders with `data-surfaces="layered"` (`folio-themes.js:90-93`), so its writing pane takes `--workspace-deep`.

| Variable | Role | Value | Computed | Declared at |
|---|---|---|---|---|
| `--bg` | Surface: the page, the Scripts page, the bottom navigation | `hsl(210.7 70% 18%)` | `rgb(14, 45, 78)` | `folio-themes.css:106` `body[data-theme="dusk"]` |
| `--panel` | Surface: panels, menus, popovers, the inspector, buttons | `hsl(210.6 80% 10%)` | `rgb(5, 25, 46)` | `folio-themes.css:107` `body[data-theme="dusk"]` |
| `--paper` | Surface: inset wells (thumbnails, chips, fields) | `hsl(210.6 80% 7%)` | `rgb(4, 18, 32)` | `folio-themes.css:108` `body[data-theme="dusk"]` |
| `--workspace` | Surface: the writing pane (script, script header, writer's bar) | `hsl(210.6 80% 7%)` (from `var(--workspace-deep)`) | `rgb(4, 18, 32)` | `folio-themes.css:227` `body[data-surfaces="layered"]` |
| `--workspace-deep` | Surface: the writing pane under Lighter navigation | `hsl(210.6 80% 7%)` | `rgb(4, 18, 32)` | `folio-themes.css:119` `body[data-theme="dusk"]` |
| `--preview-mat` | Surface: the mat around the game preview | `hsl(210.6 80% 10%)` (from `var(--panel)`) | `rgb(5, 25, 46)` | `folio-themes.css:120` `body[data-theme="dusk"]` |
| `--elevated` | Raised surface: tags, keycaps, the checked segment | `hsl(210.7 70% 18%)` | `rgb(14, 45, 78)` | `folio-themes.css:109` `body[data-theme="dusk"]` |
| `--ink` | Ink: text and icons at full strength | `rgb(255 255 255)` | `rgb(255, 255, 255)` | `folio-themes.css:111` `body[data-theme="dusk"]` |
| `--muted` | Muted ink: secondary text and chrome; the info problem colour | `rgb(255 255 255 / 0.6)` | `rgba(255, 255, 255, 0.6)` | `folio-themes.css:112` `body[data-theme="dusk"]` |
| `--accent` | Accent: active navigation, links, focus edge, primary button, current-line rule | `hsl(207 61% 70% / 1)` | `rgb(132, 183, 225)` | `folio-themes.css:113` `body[data-theme="dusk"]` |
| `--accent-ink` | Ink on an accent fill | `hsl(210.6 100% 7%)` | `rgb(0, 17, 36)` | `folio-themes.css:114` `body[data-theme="dusk"]` |
| `--tint` | Tint: selected, current and drop-target washes | `rgb(255 255 255 / 0.05)` | `rgba(255, 255, 255, 0.05)` | `folio-themes.css:115` `body[data-theme="dusk"]` |
| `--error` | Problem colour: error | `oklch(70.4% 0.191 22.216)` | `oklch(0.704 0.191 22.216)` | `folio-themes.css:118` `body[data-theme="dusk"]` |
| `--warning` | Problem colour: warning | `oklch(82.8% 0.189 84.429)` | `oklch(0.828 0.189 84.429)` | `folio-themes.css:117` `body[data-theme="dusk"]` |
| `--success` | Problem colour: success | `oklch(79.2% 0.209 151.711)` | `oklch(0.792 0.209 151.711)` | `folio-themes.css:116` `body[data-theme="dusk"]` |
| `--edge` | Divider: borders and rules | `rgb(255 255 255 / 0.12)` | `rgba(255, 255, 255, 0.12)` | `folio-themes.css:110` `body[data-theme="dusk"]` |
| `--selection` | Selection: selected text in the script | `#264f78` | `rgb(38, 79, 120)` | `folio-themes.css:122` `body[data-theme="dusk"]` |
| `--syntax-active` | The script's current-line band | `#0d263d` | `rgb(13, 38, 61)` | `folio-themes.css:123` `body[data-theme="dusk"]` |
| `--scrollbar` | Scrollbar thumb (no track) | `rgb(255 255 255 / 0.15)` | `rgba(255, 255, 255, 0.15)` | `folio-themes.css:121` `body[data-theme="dusk"]` |
| `--control-hover` | Hover overlay on controls | `rgb(255 255 255 / 0.06)` | `rgba(255, 255, 255, 0.06)` | `folio-themes.css:3` `body[data-direction="folio"]` |
| `--button-bg` | Primary button fill (Midnight and Dusk only) | `hsl(210.8 44.9% 34.9%)` | `rgb(49, 88, 129)` | `folio-themes.css:124` `body[data-theme="dusk"]` |
| `--sidebar` | Rail fill (Midnight and Dusk only) | `hsl(210.7 70% 12%)` | `rgb(9, 30, 52)` | `folio-themes.css:126` `body[data-theme="dusk"]` |

Lighter navigation (`data-surfaces="layered"`, offered only for Graphite and Warm Folio)
changes only the writing pane:

- Graphite: `--workspace` → `#1d1e20` (`folio-themes.css:227`), `--preview-mat` → `#1d1e20` (`folio-themes.css:19`)
- Warm Folio: `--workspace` → `#1b1816` (`folio-themes.css:227`), `--preview-mat` → `#1b1816` (`folio-themes.css:19`)

### Problem colours

Four severities share the theme's colours: error `--error`, warning `--warning`, info
`--muted` (`folio-hierarchy.css:426-427`, `folio-editor.css:57`), and success
`--success` for a clean result. The script marks each problem with a wavy underline in
its colour and a mark in the right margin drawn from `--folio-mark-error`,
`--folio-mark-warning` and `--folio-mark-info` (`folio-editor.css:54`), SVG masks
painted in the severity colour.

### Derived colours

Values the stylesheets derive with `color-mix`, resolved by the browser per theme:

| Variable | Declared | Declared at |
|---|---|---|
| `--guide` (indentation guide) | `color-mix(in srgb, var(--muted) 22%, transparent)` | `folio-themes.css:905` |
| `--guide-lit` (guide of the current block) | `color-mix(in srgb, var(--accent) 55%, transparent)` | `folio-themes.css:906` |

### Syntax colours

38 syntax roles drawn from 17 distinct colours in the original palette,
measured from impower.dev (`folio-syntax-palette.js:1-17`). Original is the impower.dev
palette; Softened is Original with OKLab chroma reduced by 20%
(`folio-syntax-palette.js:62-82`, computed by the module); Ink, Charcoal, Sepia (`paper`)
and Chalk are the preset themes' palettes (`folio-syntax-palette.js:18-60`). Midnight and
Dusk use Original; Graphite and Warm Folio use Original or Softened as chosen.

| Role | Original | Softened | Ink | Charcoal | Sepia | Chalk |
|---|---|---|---|---|---|---|
| `--syntax-text` | `#cccccc` | `#cccccc` | `#f0ebe3` | `#f0efeb` | `#252421` | `#202123` |
| `--syntax-dialogue` | `#ce9178` | `#c69581` | `#fbddc6` | `#fbddc6` | `#4e2a1a` | `#4e2a1a` |
| `--syntax-choice` | `#ce9178` | `#c69581` | `#edb393` | `#edb393` | `#9c4519` | `#9c4519` |
| `--syntax-choicemark` | `#569cd6` | `#669bc9` | `#7a9dbc` | `#7a9dbc` | `#3d6389` | `#3d6389` |
| `--syntax-string` | `#ce9178` | `#c69581` | `#e09a84` | `#e09a84` | `#8c4221` | `#8c4221` |
| `--syntax-keyword` | `#d197d9` | `#cb9cd1` | `#de9ed0` | `#de9ed0` | `#7d3b73` | `#7d3b73` |
| `--syntax-target` | `#d88cff` | `#d195f0` | `#c0a3fe` | `#c0a3fe` | `#6a3fa2` | `#6a3fa2` |
| `--syntax-declared` | `#d88cff` | `#d195f0` | `#c0a3fe` | `#c0a3fe` | `#6a3fa2` | `#6a3fa2` |
| `--syntax-declared-type` | `#4ec9b0` | `#6bc5b0` | `#61c2ad` | `#61c2ad` | `#096354` | `#096354` |
| `--syntax-declared-function` | `#dcdcaa` | `#dbdbb4` | `#b6b570` | `#b6b570` | `#6b6200` | `#6b6200` |
| `--syntax-declaration` | `#569cd6` | `#669bc9` | `#7db8ea` | `#7db8ea` | `#1d55a3` | `#1d55a3` |
| `--syntax-delimiter` | `#569cd6` | `#669bc9` | `#7a9dbc` | `#7a9dbc` | `#3d6389` | `#3d6389` |
| `--syntax-clause` | `#569cd6` | `#669bc9` | `#7a9dbc` | `#7a9dbc` | `#3d6389` | `#3d6389` |
| `--syntax-interpolation` | `#569cd6` | `#669bc9` | `#7db8ea` | `#7db8ea` | `#1d55a3` | `#1d55a3` |
| `--syntax-tag` | `#569cd6` | `#669bc9` | `#7db8ea` | `#7db8ea` | `#1d55a3` | `#1d55a3` |
| `--syntax-boolean` | `#569cd6` | `#669bc9` | `#7db8ea` | `#7db8ea` | `#1d55a3` | `#1d55a3` |
| `--syntax-speaker` | `#4ec9b0` | `#6bc5b0` | `#edb393` | `#edb393` | `#9c4519` | `#9c4519` |
| `--syntax-type` | `#4ec9b0` | `#6bc5b0` | `#61c2ad` | `#61c2ad` | `#096354` | `#096354` |
| `--syntax-asset` | `#4fc1ff` | `#6bbff1` | `#61bbf0` | `#61bbf0` | `#006f8e` | `#006f8e` |
| `--syntax-attribute` | `#4fc1ff` | `#6bbff1` | `#61bbf0` | `#61bbf0` | `#006f8e` | `#006f8e` |
| `--syntax-identifier` | `#9cdcfe` | `#a8daf5` | `#aac1d2` | `#aac1d2` | `#3f5878` | `#3f5878` |
| `--syntax-property` | `#9cdcfe` | `#a8daf5` | `#aac1d2` | `#aac1d2` | `#3f5878` | `#3f5878` |
| `--syntax-number` | `#b5cea8` | `#b8ccae` | `#97bd83` | `#97bd83` | `#3f6a1f` | `#3f6a1f` |
| `--syntax-function` | `#dcdcaa` | `#dbdbb4` | `#b6b570` | `#b6b570` | `#6b6200` | `#6b6200` |
| `--syntax-event` | `#dcdcaa` | `#dbdbb4` | `#b6b570` | `#b6b570` | `#6b6200` | `#6b6200` |
| `--syntax-comment` | `#6a9955` | `#719661` | `#86a07c` | `#86a07c` | `#4d6b3e` | `#4d6b3e` |
| `--syntax-punctuation` | `#a0a0a0` | `#a0a0a0` | `#959288` | `#94959b` | `#6b6861` | `#62636a` |
| `--syntax-operator` | `#a0a0a0` | `#a0a0a0` | `#959288` | `#94959b` | `#6b6861` | `#62636a` |
| `--syntax-separator` | `#cccccc` | `#cccccc` | `#f0ebe3` | `#f0efeb` | `#252421` | `#202123` |
| `--syntax-regex` | `#ff8080` | `#f08b89` | `#f2908e` | `#f2908e` | `#a22b33` | `#a22b33` |
| `--syntax-slug` | `#ff8080` | `#f08b89` | `#fe9e9c` | `#fe9e9c` | `#9c242e` | `#9c242e` |
| `--syntax-escape` | `#d7ba7d` | `#d2bb8b` | `#b59a63` | `#b59a63` | `#7d5e08` | `#7d5e08` |
| `--syntax-modifier` | `#d7ba7d` | `#d2bb8b` | `#b59a63` | `#b59a63` | `#7d5e08` | `#7d5e08` |
| `--syntax-title` | `#d7ba7d` | `#d2bb8b` | `#d3b574` | `#d3b574` | `#694e01` | `#694e01` |
| `--syntax-heading` | `#bea3a3` | `#baa5a4` | `#b29191` | `#b29191` | `#7f595a` | `#7f595a` |
| `--syntax-element` | `#ff80bb` | `#f18cb9` | `#f296be` | `#f296be` | `#a1265e` | `#a1265e` |
| `--syntax-type-keyword` | `#ff80bb` | `#f18cb9` | `#f296be` | `#f296be` | `#a1265e` | `#a1265e` |
| `--syntax-container` | `#ffb380` | `#f5b890` | `#dfa674` | `#dfa674` | `#88460c` | `#88460c` |

### Code editor variables

The script editor's CodeMirror theme blocks (`packages/sparkdown-document-views` and
`packages/codemirror-vscode-lsp-client`) read the semantic set above where a colour is
the same (`--panel`, `--paper`, `--bg`, `--ink`, `--selection`, `--control-hover`, and
`color-mix(in srgb, var(--ink) N%, transparent)` for white at an opacity) and the
variables below for the rest. `packages/impower-ui/src/theme.css` declares them in a
`:root, [data-theme="midnight"], [data-theme="dusk"]` block holding the values the editor drew before
it read variables, so Midnight renders unchanged. The per-theme palettes, and the
mapping of the editor's highlight tags onto the syntax roles above, replace the
`--syntax-*` part of this set.

Component variables of the editor's own chrome:

| Variable | Role | Midnight value |
|---|---|---|
| `--editor-ink` | Chrome text: menus, the reference list, the keyboard toolbar, the status bar's reveal arrow | `#cccccc` |
| `--editor-line-number` | Gutter line numbers | `#2b83b7` |
| `--editor-line-number-active` | The current line's number | `#99d9ff` |
| `--editor-indent-guide` | Indentation guide | `#1a293a` |
| `--editor-indent-guide-active` | Indentation guide of the current block | `#4d5866` |
| `--editor-field-edge` | Find and go-to-line field border | `hsl(210.6 30% 20%)` |
| `--editor-field-edge-hover` | Field border under the pointer or pressed | `hsl(210.6 30% 30%)` |
| `--editor-button-hover` | Panel button and toggle hover wash | `rgb(43 17 17 / 0.05)` |
| `--editor-focus` | Focus outline and the focused field's border | `#0da2e7` |
| `--editor-focus-edge` | Selected reference outline, the dialog close button under the pointer | `#007acc` |
| `--editor-selection-match` | Other occurrences of the selection | `#62331599` |
| `--editor-panel-edge` | Rule above the bottom panels | `hsl(210.6 70% 15%)` |
| `--editor-toolbar-ink` | Keyboard toolbar text | `hsl(211 24% 60%)` |
| `--editor-status-ink` | Status bar text | `hsl(211 24% 42%)` |
| `--editor-list-selected` | Selected row: completion, problems, references | `#04395e` |
| `--editor-problem-range` | The active problem's range | `#ffdd991a` |
| `--editor-problem-error` | Status bar error count, error pinpoint | `#f14c4c` |
| `--editor-problem-warning` | Status bar warning count | `#cca700` |
| `--editor-problem-info` | Status bar info count | `#59a4f9` |
| `--editor-action-ink` | A problem's action link | `#9cdcfe` |
| `--editor-match` | The matched letters in a completion | `#18a3ff` |
| `--editor-faint` | Fold placeholder, link shortcut hint | `#808080` |
| `--editor-placeholder` | Find and go-to-line placeholder | `#888888` |
| `--editor-swatch-edge` | Colour swatch border | `#888888` |
| `--editor-reference-line` | Line number in the reference list | `#858585` |
| `--editor-lens-ink` | Code lens text | `#999999` |
| `--editor-link` | Code lens and link under the pointer | `#4e94ce` |
| `--editor-link-active` | A followable link while the modifier is held | `#4daafc` |
| `--editor-rename-edge` | Rename field border | `#3c3c3c` |
| `--editor-rename-submit` | Rename submit button | `#0078d4` |
| `--editor-sticky-shadow` | Shadow under the sticky scene headers | `rgb(0 0 0 / 0.7)` |
| `--editor-breakpoint` | Breakpoint gutter mark | `#3abff8` |
| `--editor-pinpoint` | Pinpoint rule | `#66baff` |
| `--editor-touch-handle` | Touch selection handle | `#1976d2` |
| `--editor-doc-code` | Inline code in hover and completion documentation | `#656c7633` |
| `--editor-doc-keycap` | Key cap in documentation | `#151b23` |
| `--editor-doc-keycap-edge` | Key cap border | `#3d444db3` |
| `--editor-doc-quote-ink` | Block quote text in documentation | `#9198a1` |
| `--editor-doc-quote-edge` | Block quote rule | `#3d444d` |
| `--editor-icon-ink` | Find and go-to-line button icons, a checked find toggle's icon | `#ffffff` |
| `--editor-icon-close` | The find and go-to-line close icon | `#315881` |
| `--editor-symbol-highlight` | The other uses of the name under the caret | `color-mix(in srgb, var(--syntax-section-name-definition) 26%, transparent)` |
| `--editor-search-match` | A find match | `#00ffff8a` |
| `--editor-search-match-selected` | The selected find match | `#ff00ff8a` |
| `--editor-list-disabled` | Selected row of a completion list that cannot be accepted yet | `#444444` |

Syntax variables, one per highlight role the editor's `EDITOR_HIGHLIGHTS.ts` and LSP
semantic-token rules colour today:

| Variable | Role | Midnight value |
|---|---|---|
| `--syntax-text` | Plain script text, separators | `#cccccc` |
| `--syntax-bracket` | Brackets, braces, parentheses | `#ffd700` |
| `--syntax-string` | Strings | `#ce9178` |
| `--syntax-escape` | Escapes, monospace | `#d7ba7d` |
| `--syntax-type-name` | Type names | `#4ec9b0` |
| `--syntax-type-name-definition` | Type names where defined | `#4ec9b0` |
| `--syntax-standard-type` | Standard variables and namespaces | `#4ec9b0` |
| `--syntax-number` | Numbers | `#b5cea8` |
| `--syntax-bool` | Booleans | `#569cd6` |
| `--syntax-operator` | Operators | `#a0a0a0` |
| `--syntax-special-operator` | Special operators | `#a0a0a0` |
| `--syntax-break` | Content separators | `#606080` |
| `--syntax-section-name-accessor` | Headings, keyword semantic tokens | `#d88cff` |
| `--syntax-section-name-definition` | Section names where defined, class semantic tokens | `#d88cff` |
| `--syntax-regex` | Regular expressions | `#ff8080` |
| `--syntax-transitional` | Labels (transitions) | `#bea3a3` |
| `--syntax-plain-keyword` | Keywords without a more specific tag | `#569cd6` |
| `--syntax-module-keyword` | Module keywords | `#d197d9` |
| `--syntax-control-keyword` | Control keywords | `#d197d9` |
| `--syntax-builtin` | Definition keywords, special functions | `#ff80bb` |
| `--syntax-operator-keyword` | Operator keywords | `#ffa8d1` |
| `--syntax-property-name` | Property names | `#9cdcfe` |
| `--syntax-variable-name` | Variable names | `#9cdcfe` |
| `--syntax-parameter-name` | Parameter names | `#9cdcfe` |
| `--syntax-constant-variable-name` | Constants | `#4fc1ff` |
| `--syntax-attribute-name` | Attribute names | `#d7ba7d` |
| `--syntax-function-name` | Function names | `#dcdcaa` |
| `--syntax-standard-function` | Standard library functions | `#fab387` |
| `--syntax-class-name` | Class names | `#ffb380` |
| `--syntax-chunk-name-definition` | Chunk names | `#7c7ca6` |
| `--syntax-invalid` | Invalid text | `#f44747` |
| `--syntax-comment` | Comments | `#6a9955` |
| `--syntax-speaker` | Speaker names | `#4ec9b0` |
| `--syntax-dialogue` | Dialogue under Tinted dialogue | `#ce9178` |
| `--syntax-dialogue-untinted` | Dialogue without Tinted dialogue | `var(--syntax-dialogue)` |

### Folio component and code editor variables

Charcoal, Chalk, Ink, Sepia, Graphite and Warm Folio give every component and code editor
variable a value read from their semantic set, so one block listing the six themes in
`packages/impower-ui/src/theme.css` serves them all. Dusk shares Midnight's component
and code editor values. The prototype draws no code editor
chrome of its own, so each value is the semantic colour the prototype gives the same
role: the primary button is `--accent` on `--accent-ink` (`app.css:120-123`), the rail
is `--bg` outside Midnight and Dusk (`folio-themes.css:319-325`), line numbers and the
info problem colour are `--muted` (`folio-editor.css:39`, `:57`), the indentation guides
are the derived colours above (`folio-editor.css:71`), and focus, links and the current
selection's accents are `--accent`. The sticky header shadow takes the one-third black
of the popovers (`folio-hierarchy.css:918`). The one value the themes do not share
is the modal backdrop `--scrim`, declared in each theme's own block from the overlay
strengths under [Elevation](#elevation): `rgb(0 0 0 / 0.6)` in the dark themes (`app.css:1093-1094`)
and `rgb(0 0 0 / 0.35)` in Chalk and Sepia (`folio-themes.css:311-312`).

| Variable | Folio value | Chosen from |
|---|---|---|
| `--button-bg` | `var(--accent)` | Primary button fill, `app.css:121` |
| `--button-ink` | `var(--accent-ink)` | Primary button ink, `app.css:122` |
| `--sidebar` | `var(--bg)` | Rail fill, `folio-themes.css:319-322` |
| `--popup` | `var(--panel)` | Menus and popovers |
| `--surface` | `var(--panel)` | Panels |
| `--tab-ink` | `var(--ink)` | Active tab |
| `--tab-muted` | `var(--muted)` | Inactive tab |
| `--placeholder` | `var(--muted)` | Secondary text |
| `--primary` | `var(--accent)` | Active navigation, links |
| `--focus-ring` | `var(--accent)` | Focus edge |
| `--error-strong` | `var(--error)` | Problem colour: error |
| `--warning-strong` | `var(--warning)` | Problem colour: warning |
| `--editor-ink` | `var(--ink)` | Ink |
| `--editor-line-number` | `var(--muted)` | `folio-editor.css:39` |
| `--editor-line-number-active` | `var(--ink)` | Ink |
| `--editor-indent-guide` | `color-mix(in srgb, var(--muted) 22%, transparent)` | `--guide`, `folio-themes.css:905` |
| `--editor-indent-guide-active` | `color-mix(in srgb, var(--accent) 55%, transparent)` | `--guide-lit`, `folio-themes.css:906` |
| `--editor-field-edge` | `var(--edge)` | Divider |
| `--editor-field-edge-hover` | `var(--muted)` | Muted ink |
| `--editor-button-hover` | `var(--control-hover)` | Hover overlay |
| `--editor-focus` | `var(--accent)` | Focus edge |
| `--editor-focus-edge` | `var(--accent)` | Focus edge |
| `--editor-selection-match` | `color-mix(in srgb, var(--accent) 25%, transparent)` | Accent wash |
| `--editor-panel-edge` | `var(--edge)` | Divider |
| `--editor-toolbar-ink` | `var(--muted)` | Muted ink |
| `--editor-status-ink` | `var(--muted)` | Muted ink |
| `--editor-list-selected` | `var(--tint)` | Selected wash |
| `--editor-problem-range` | `color-mix(in srgb, var(--warning) 10%, transparent)` | Midnight's warning wash at its 10% |
| `--editor-problem-error` | `var(--error)` | Problem colour: error |
| `--editor-problem-warning` | `var(--warning)` | Problem colour: warning |
| `--editor-problem-info` | `var(--muted)` | Problem colour: info, `folio-editor.css:57` |
| `--editor-action-ink` | `var(--accent)` | Links |
| `--editor-match` | `var(--accent)` | Accent |
| `--editor-faint` | `var(--muted)` | Muted ink |
| `--editor-placeholder` | `var(--muted)` | Muted ink |
| `--editor-swatch-edge` | `var(--muted)` | Muted ink |
| `--editor-reference-line` | `var(--muted)` | Muted ink |
| `--editor-lens-ink` | `var(--muted)` | Muted ink |
| `--editor-link` | `var(--accent)` | Links |
| `--editor-link-active` | `var(--accent)` | Links |
| `--editor-rename-edge` | `var(--edge)` | Divider |
| `--editor-rename-submit` | `var(--tint)` | Selected wash, under `--ink` text |
| `--editor-sticky-shadow` | `rgb(0 0 0 / 0.33)` | Popover shadow, `folio-hierarchy.css:918` |
| `--editor-breakpoint` | `var(--accent)` | Accent |
| `--editor-pinpoint` | `var(--accent)` | Accent |
| `--editor-touch-handle` | `var(--accent)` | Accent |
| `--editor-doc-code` | `var(--elevated)` | Raised surface: keycaps |
| `--editor-doc-keycap` | `var(--paper)` | Inset well |
| `--editor-doc-keycap-edge` | `var(--edge)` | Divider |
| `--editor-doc-quote-ink` | `var(--muted)` | Muted ink |
| `--editor-doc-quote-edge` | `var(--edge)` | Divider |
| `--editor-icon-ink` | `var(--ink)` | Ink |
| `--editor-icon-close` | `var(--muted)` | Muted ink |
| `--editor-search-match` | `color-mix(in srgb, var(--accent) 30%, transparent)` | Accent wash |
| `--editor-search-match-selected` | `color-mix(in srgb, var(--accent) 55%, transparent)` | Accent wash, stronger |
| `--editor-list-disabled` | `var(--elevated)` | Raised surface |

`--editor-symbol-highlight`, the wash on the other uses of the name under the caret,
differs between the dark and light themes as the prototype's does
(`folio-language.css:134-135`): `color-mix(in srgb, var(--syntax-section-name-definition) 26%, transparent)`
in Charcoal, Ink, Graphite and Warm Folio, and 16% in Chalk and Sepia.

### Folio syntax variables

Each editor syntax variable takes the Charcoal, Chalk, Ink or Sepia colour of the syntax role whose
Original colour it already draws, choosing among roles that share an Original colour by
meaning; a variable whose Midnight colour no role uses takes the role closest in meaning
(brackets take punctuation, operator keywords take type keyword, standard library
functions take function, chunk names take heading, invalid text takes slug, content
separators take separator).

Graphite and Warm Folio draw Softened by default: each variable's Midnight colour with
OKLab chroma reduced by 20%, the computation that gives the Softened column above.
With `data-syntax="original"` they draw Midnight's colours, as Midnight and Dusk do.

| Variable | Syntax role | Charcoal | Chalk | Ink | Sepia | Softened |
|---|---|---|---|---|---|---|
| `--syntax-text` | `--syntax-text` | `#f0efeb` | `#202123` | `#f0ebe3` | `#252421` | `#cccccc` |
| `--syntax-bracket` | `--syntax-punctuation` | `#94959b` | `#62636a` | `#959288` | `#6b6861` | `#f7d85c` |
| `--syntax-string` | `--syntax-string` | `#e09a84` | `#8c4221` | `#e09a84` | `#8c4221` | `#c69581` |
| `--syntax-escape` | `--syntax-escape` | `#b59a63` | `#7d5e08` | `#b59a63` | `#7d5e08` | `#d2bb8b` |
| `--syntax-type-name` | `--syntax-type` | `#61c2ad` | `#096354` | `#61c2ad` | `#096354` | `#6bc5b0` |
| `--syntax-type-name-definition` | `--syntax-declared-type` | `#61c2ad` | `#096354` | `#61c2ad` | `#096354` | `#6bc5b0` |
| `--syntax-standard-type` | `--syntax-type` | `#61c2ad` | `#096354` | `#61c2ad` | `#096354` | `#6bc5b0` |
| `--syntax-number` | `--syntax-number` | `#97bd83` | `#3f6a1f` | `#97bd83` | `#3f6a1f` | `#b8ccae` |
| `--syntax-bool` | `--syntax-boolean` | `#7db8ea` | `#1d55a3` | `#7db8ea` | `#1d55a3` | `#669bc9` |
| `--syntax-operator` | `--syntax-operator` | `#94959b` | `#62636a` | `#959288` | `#6b6861` | `#a0a0a0` |
| `--syntax-special-operator` | `--syntax-operator` | `#94959b` | `#62636a` | `#959288` | `#6b6861` | `#a0a0a0` |
| `--syntax-break` | `--syntax-separator` | `#f0efeb` | `#202123` | `#f0ebe3` | `#252421` | `#61617a` |
| `--syntax-section-name-accessor` | `--syntax-target` | `#c0a3fe` | `#6a3fa2` | `#c0a3fe` | `#6a3fa2` | `#d195f0` |
| `--syntax-section-name-definition` | `--syntax-declared` | `#c0a3fe` | `#6a3fa2` | `#c0a3fe` | `#6a3fa2` | `#d195f0` |
| `--syntax-regex` | `--syntax-regex` | `#f2908e` | `#a22b33` | `#f2908e` | `#a22b33` | `#f08b89` |
| `--syntax-transitional` | `--syntax-heading` | `#b29191` | `#7f595a` | `#b29191` | `#7f595a` | `#baa5a4` |
| `--syntax-plain-keyword` | `--syntax-declaration` | `#7db8ea` | `#1d55a3` | `#7db8ea` | `#1d55a3` | `#669bc9` |
| `--syntax-module-keyword` | `--syntax-keyword` | `#de9ed0` | `#7d3b73` | `#de9ed0` | `#7d3b73` | `#cb9cd1` |
| `--syntax-control-keyword` | `--syntax-keyword` | `#de9ed0` | `#7d3b73` | `#de9ed0` | `#7d3b73` | `#cb9cd1` |
| `--syntax-builtin` | `--syntax-type-keyword` | `#f296be` | `#a1265e` | `#f296be` | `#a1265e` | `#f18cb9` |
| `--syntax-operator-keyword` | `--syntax-type-keyword` | `#f296be` | `#a1265e` | `#f296be` | `#a1265e` | `#f5afcf` |
| `--syntax-property-name` | `--syntax-property` | `#aac1d2` | `#3f5878` | `#aac1d2` | `#3f5878` | `#a8daf5` |
| `--syntax-variable-name` | `--syntax-identifier` | `#aac1d2` | `#3f5878` | `#aac1d2` | `#3f5878` | `#a8daf5` |
| `--syntax-parameter-name` | `--syntax-identifier` | `#aac1d2` | `#3f5878` | `#aac1d2` | `#3f5878` | `#a8daf5` |
| `--syntax-constant-variable-name` | `--syntax-asset` | `#61bbf0` | `#006f8e` | `#61bbf0` | `#006f8e` | `#6bbff1` |
| `--syntax-attribute-name` | `--syntax-modifier` | `#b59a63` | `#7d5e08` | `#b59a63` | `#7d5e08` | `#d2bb8b` |
| `--syntax-function-name` | `--syntax-function` | `#b6b570` | `#6b6200` | `#b6b570` | `#6b6200` | `#dbdbb4` |
| `--syntax-standard-function` | `--syntax-function` | `#b6b570` | `#6b6200` | `#b6b570` | `#6b6200` | `#f0b794` |
| `--syntax-class-name` | `--syntax-container` | `#dfa674` | `#88460c` | `#dfa674` | `#88460c` | `#f5b890` |
| `--syntax-chunk-name-definition` | `--syntax-heading` | `#b29191` | `#7f595a` | `#b29191` | `#7f595a` | `#7d7d9f` |
| `--syntax-invalid` | `--syntax-slug` | `#fe9e9c` | `#9c242e` | `#fe9e9c` | `#9c242e` | `#e35d58` |
| `--syntax-comment` | `--syntax-comment` | `#86a07c` | `#4d6b3e` | `#86a07c` | `#4d6b3e` | `#719661` |
| `--syntax-speaker` | `--syntax-speaker` | `#edb393` | `#9c4519` | `#edb393` | `#9c4519` | `#6bc5b0` |
| `--syntax-dialogue` | `--syntax-dialogue` | `#fbddc6` | `#4e2a1a` | `#fbddc6` | `#4e2a1a` | `#c69581` |

The editor tells speaker names and dialogue apart by the grammar rule that matched
them (`DialogueCharacterName`, and the `TextChunk` inside `BlockDialogue` or
`InlineDialogue`), so they take their roles' colours rather than the type and text
colours their highlight tags share with other syntax.

Derived syntax variables:

| Variable | Value | Themes |
|---|---|---|
| `--syntax-dialogue-untinted` | `var(--syntax-text)` | Charcoal, Chalk, Ink and Sepia, the themes the prototype's untinted rule names (`folio-themes.css:880`) |
| `--syntax-dialogue-untinted` | `var(--syntax-dialogue)` | Midnight, Dusk, Graphite and Warm Folio, whose dialogue the prototype always tints, as impower.dev does |

Dialogue takes `--syntax-dialogue` under the Tinted dialogue preference and
`--syntax-dialogue-untinted` without it.

## Type

| Family | Use | Declared at |
|---|---|---|
| Open Sans, bundled as `Folio UI` at weights 400, 600 and 700, falling back to `"Segoe UI", system-ui, sans-serif` | Every interface string | `folio-type.css:4-26`, `--ui-font` at `folio-type.css:48` |
| Courier Prime Sans (U+007E only, inside `Folio UI`) | The tilde, which Open Sans draws as a dash | `folio-type.css:30-45` |
| Courier Prime Sans as `Folio Courier Prime Sans`, regular, bold, italic and bold italic, falling back to `monospace` | The script | `folio-editor.css:2-6` |
| Georgia, falling back to `"Times New Roman", serif` | Display headings | `--display-font` at `folio-type.css:49` |

The script is 18px at a 1.5 line height above 1100px and 16px at 1.5 at 1100px and
below (`folio-editor.css:6`, `folio-editor.css:29`), regular weight, kerning off and
synthesis off. In Sepia and Chalk the script takes a 0.2px stroke in its own colour so
the light-on-dark weight carries over (`folio-themes.css:236-240`).

Named styles, as weight, size / line height and tracking. "Desktop" is above 1100px;
"Compact" is 1100px and below, where an override exists. Rows marked measured were read
with `getComputedStyle` on the rendered route at 1440, 768 and 360 wide; rows for
surfaces that open on demand (dialogs, toasts, menus, popovers, the suggestion list)
were measured with the surface open at 360, 768, 1100 and 1440 wide, and the row says
where a surface does not open at some width. The prototype's stylesheets also style surfaces Folio no longer renders
(`.writer-header h1`, `.section-heading`, `.asset-row`, `.scene-card`, `.scene-link`,
`.preview-heading`, `.preview-caption`, `.rail-label`, `.tiny-link`); none of them is
listed (see inconsistencies).

| Style | Selector | Desktop | Compact | Declared at |
|---|---|---|---|---|
| Body | `body[data-direction="folio"]` | 400 14px / 1.6 | same | `folio-type.css:47-51`; measured |
| Project name | `.project-name` | 600 14px / 1.3 | 600 12px / 1.3 | `app.css:396-404`, `folio-type.css:312-315`; measured |
| Save caption | `.saved`, `.project-title small` | 400 12px / 1.5 | 400 11px / 1.4 | `folio-type.css:68-73`, `:316-320`; measured |
| Button | `.btn` | 600 14px / 1.4 | | `folio-type.css:52-56` |
| Writer's bar text button (Add) | `.writer-tools .insert-trigger` | 600 13px / 1.4 | same | `folio-insert.css:55`, overriding `folio-type.css:137-140` and `:329-334`; measured |
| Navigation link | `.nav-link` | 600 14px / 1.4 | 600 11px / 1.35 on the icon rail | `folio-type.css:117-120`, `folio-hierarchy.css:788-789`; measured |
| Outline heading | `.rail-heading h2` | 600 14px / 1.4 | | `folio-hierarchy.css:92-94` |
| Outline row | `.outline-jump` | 400 12px / 1.6 | 11px on the 190px rail | `folio-hierarchy.css:225`, `:754-755`; measured on desktop |
| Script name in the header | `.script-context > span > strong`, `.script-name-field` | 600 17px / 1.3 | 600 14px / 1.35 | `folio-hierarchy.css:360-365`, `:838-841`; measured |
| Script | `.folio-input` | 400 18px / 1.5 | 400 16px / 1.5 | `folio-editor.css:6`, `:29`; measured |
| Line numbers | `.folio-line::before` | 0.72em of the script size | same | `folio-editor.css:39` |
| Scripts page row name | `.scripts-item-name` | 400 14px / 1.5 | same; 13px when the page is 440px wide or less | `folio-scripts.css:61`, `:141`; measured |
| Preview mode label | `.runtime-mode-label` | 600 12px / 1.4 | same | measured |
| Problems toggle | `.console-toggle-text` | 600 12px / 1.6 | same | measured |
| Problems panel position | `.console-position` | 600 11px / 1.4 | same | `folio-playback.css:280-285`; measured |
| Problems panel section heading | `.console-part-toggle` | 600 11px / 1.4, 0.06em, uppercase; its count `small` 400 11px | same | `folio-playback.css:1243-1253`, `:1285`; measured |
| Problems panel group heading | `.console-group h3` | 600 12px / 1.4 | same | `folio-playback.css:1359-1364`; measured |
| Problems panel message | `.console-message strong`, `.console-message span > span` | title 600 13px / 1.4; text 400 12px / 1.5 | same | `folio-playback.css:993-996`; measured |
| Problems panel line link | `.console-line` | 400 11px / 1.5 | same | `folio-playback.css:957-964`; measured |
| Problems panel empty state | `.console-empty` | 400 13px / 1.5 | same | `folio-playback.css:1021-1022`; measured |
| Page title (Share, Settings) | `.page-intro h1` | Georgia 400 40px / 1.12, −0.035em | 32px / 1.15 | `folio-type.css:176-179`, `:368-371`; measured; the one display style |
| Page and card body | `.page-intro p`, `.feature-card p` | 400 14px / 1.6 | same | `folio-type.css:180-185`; measured |
| Share card title | `.feature-card h2` | 600 22px / 1.25, −0.02em | same | `folio-type.css:203-206`, `:419-422`; measured |
| Eyebrow | `.eyebrow` | 700 11px / 1.5, 0.12em | same | `app.css:137-141`, `folio-type.css:57-62`; measured |
| Tag | `.tag` | 600 11px / 1.4 | same | `folio-type.css:63-67`; measured |
| Bottom navigation label | `.mobile-nav a` | | 400 12px / 1.4 (phones) | `folio-type.css:433-436`; measured |
| Add menu title | `.insert-heading h2` | 600 15px / 1.4 | same | `folio-insert.css:12`; measured |
| Writing tools title | `#folio-tools h2` | 600 15px / 1.4 | same | `folio-insert.css:12`; measured |
| App menu title | `.account-menu-heading h2` | 600 15px / 1.4 | same | `folio-hierarchy.css:636`; measured |
| App menu description and items | `.account-menu-heading p`, `.account-menu-item` | description 400 12px / 1.5; items 400 14px / 1.4 | same | `folio-hierarchy.css:639-642`, `:652-660`; measured |
| Add menu and Writing tools rows | `.insert-block strong`, `.insert-block small` | name 600 14px / 1.4; description 400 12px / 1.5 | same | `folio-insert.css:19-20`; measured |
| Dialog title (shared dialogs: Problems to fix, Replace this project?) | `.dialog-heading h2` | 600 22px / 1.25, −0.02em | | `folio-type.css:211-214`; measured on desktop (the dialog opens from the script's problem badge, which is not on screen at 1100px and below) |
| Dialog title (Scripts and Assets form dialogs: New, Rename, Move, Delete, Add a link) | `.scripts-dialog-form .dialog-heading h2` | 600 20px / 1.25, −0.02em | same | `folio-scripts.css:112`; measured at all four widths |
| Dialog body (shared dialogs) | `.tool-dialog p` | 400 14px / 1.6 | | `folio-type.css:215-218`; measured on desktop |
| Dialog context line (form dialogs) | `.scripts-form-context` | 400 12px / 1.6 | same | `folio-scripts.css:113`; measured |
| Dialog label | `.tool-dialog label` | 400 13px / 1.5 | same | `folio-type.css:219-222`; measured |
| Dialog field | `.tool-dialog input` | 400 16px / 1.5 | same | `folio-type.css:223-226`, `folio-scripts.css:167`; measured; 16px keeps mobile browsers from zooming |
| Toast | `.toast` | 400 13px / 1.5 | same | `folio-type.css:256-259`; measured |
| Suggestion list container | `.completion` | 400 13px / 1.4, rows 36px | chip row 52px, chips 44px (`.completion-chip` 15px / 1, which no text inherits) | `folio-language.css:80`, `:84`, `:113`; measured |
| Suggestion name | `.completion-label` | 400 14px / 1.3 in the script's font | same, in each chip | `folio-language.css:91`; measured at all four widths |
| Suggestion detail | `.completion-detail` | 400 12px / 1.4 | not shown in chips | `folio-language.css:93`; measured |
| Suggestion list footer | `.completion-foot` | 400 11px / 1.4 | not shown | `folio-language.css:96`; measured |
| Suggestion preview caption | `.hover-caption code`, `.hover-caption span` | reference 400 13px / 1.4 in the script's font; caption 400 12px | not shown | `folio-language.css:66-68`; measured |
| Expression suggestion heading | `.suggestion-head` | 600 14px / 1.4 | 600 13px / 1.4 | `folio-type.css:156-159`, `:354-356`; measured |
| Popover | `.problem-popover`, `.problem-title`, `.problem-fix-button` | text 400 13px / 1.5; title 600 13px / 1.5; Fix button 600 12px / 1.4 | same | `folio-hierarchy.css:918-919`, `:963`, `:979-989`; measured |
| Context menu | `.context-menu-item`, `.context-menu-item kbd` | label 400 13px / 1.4, rows 34px; shortcut 400 12px / 1 | does not open on right-click at 1100px and below | `folio-tools.css:485-486`, `:499`, `:516-518`; measured |
| Viewing-mode and cog menu rows | `.runtime-mode-menu strong`, `.runtime-settings-menu strong`, their `small` | name 600 14px / 1.4; description 11px / 1.5 (600 on the chosen row) | same, in the fullscreen player | `folio-playback.css:97-100`, `:363-366`; the descriptions' 12px at `:106` and `:369` is overridden by `.runtime-menu small` at `:396`; measured |
| Aspect-ratio menu rows | `.runtime-menu [role="menuitemradio"]` and its `small` | ratio 400 13px / 1.6 (600 on the chosen row); hint 400 11px; rows 40px | same, in the fullscreen player | `folio-playback.css:332-344`, `:396`; measured |
| Scripts menu rows (sort, row menu, New) | `.scripts-menu button`, `.scripts-menu-heading` | rows 400 13px / 1.6, 44px; group heading 600 11px, 0.04em, uppercase | same | `folio-scripts.css:100`, `:108`; measured |

## Spacing

The prototype declares no spacing scale; its padding, margin and gap values cluster on
these steps (count of uses across the stylesheets, `surface.css` and `review.css`
excluded):

| Step | Uses | Typical use |
|---|---|---|
| 2px | 56 | Gaps inside dense toolbars |
| 4px | 110 | Toolbar padding, icon gaps |
| 6px | 131 | Menu item gaps, small insets |
| 8px | 157 | Control padding, menu padding |
| 10px | 127 | Rail gutter on tablets, compact control padding |
| 12px | 125 | Card padding, section gaps |
| 14px | 45 | Desktop rail gutter (`folio-hierarchy.css:15`) |
| 16px | 50 | Compact header inset, page gutters |
| 20px | 28 | Desktop script top padding, outline separation |
| 22px | 17 | Desktop header inset (`folio-hierarchy.css:4`) |

Off-step values (5px, 7px, 9px, 18px) appear 22–32 times each, mostly as one-off
optical adjustments; this reference takes the steps above and rounds the rest to the
nearest step. Named spacing variables:

| Variable | Desktop | ≤1100px | Declared at |
|---|---|---|---|
| `--folio-header-inset` | 22px | 16px from 701px to 1100px; 22px on phones | `folio-hierarchy.css:4`, `:741` (inside `701px–1100px`); measured |
| `--folio-context-gap` | 12px | 9px from 701px to 1100px; 12px on phones | `folio-hierarchy.css:5`, `:742` (inside `701px–1100px`); measured |
| `--folio-rail-gutter` | 14px | 10px on the 190px rail; 5px on the icon rail; phones have no rail | `folio-hierarchy.css:15`, `:745`, `:772`; measured |
| `--folio-gutter` (script's left gutter) | 56px | 36px | `folio-editor.css:6`, `:29`; measured |
| `--folio-margin-right` (script's right padding, where problem marks sit) | 30px | 20px | `folio-editor.css:54`, `:65`; measured |
| `--preview-inline-padding` | 10px docked; 16px in the fullscreen player | 10px, docked and fullscreen | `folio-playback.css:3`, `:1044-1045`, `:1189-1191` (docked; fullscreen; fullscreen at 1100px and below); measured: the fullscreen player pads `12px 16px 0` at 1440 and `8px 10px 0` at 1100, 768 and 360 |
| Dialog padding | 26px | 19px | `app.css:1091`, `:1794-1795`; measured |
| Expression suggestion panel padding | 17px | 11px; 8px on a phone 710px tall or less | `app.css:740`, `:1613`, `:2056`; measured |
| `--scripts-gutter` | 18px (the page always sits beside the preview) | 16px | `folio-scripts.css:129`, `:149`; the 30px base at `folio-scripts.css:2` applies at no width; measured |

## Shape

| Token | Value | Declared at |
|---|---|---|
| `--control-radius` (buttons, icon buttons, fields, menus' items) | 8px | `app.css:17` |
| `--radius` (cards and panels: the Add menu and Writing tools on desktop, the suggestion list, popovers, the viewing-mode menu, the context menu, the Scripts menus, the app menu) | 12px | `app.css:16`; the panels write 12px literally (`folio-insert.css:10`, `folio-language.css:80`, `folio-hierarchy.css:915`, `folio-playback.css:326`, `folio-tools.css:482`, `folio-scripts.css:99`, `folio-hierarchy.css:621`); measured |
| Dialogs | 18px | `app.css:1088`; measured at all four widths |
| Preview cog and aspect-ratio menus, the Problems panel's sections | 10px | `folio-playback.css:310`, `:1228`; measured |
| Toast | 10px | `app.css:1080`; measured |
| Expression suggestion panel | 12px; 9px at 1100px and below | `app.css:743`, `:1614`; measured |
| Sheets (the Add menu and Writing tools at 1100px and below) | 0 | `folio-insert.css:56`; measured |
| Tags | 5px | `app.css:152` |

## Elevation

One shadow for everything that floats over the page (menus, popovers, the Add menu,
the account dialog, the suggestion list): `0 12px 40px #0006`, as on
`.insert-panel` (`folio-insert.css:10`) and `.runtime-mode-menu`
(`folio-playback.css:327`). What each floating surface computes with the surface open,
at every width where it opens:

| Surface | Computed shadow | Winning rule |
|---|---|---|
| Add menu and Writing tools (desktop) | `0 12px 40px` black at 40% | `folio-insert.css:10` |
| Viewing-mode menu | `0 12px 40px` black at 40% | `folio-playback.css:327` |
| Preview cog menu, aspect-ratio menu | `0 10px 30px` black at 40% | `folio-playback.css:312` (the cog menu also carries `.runtime-menu`; see inconsistencies) |
| App menu | `0 12px 40px` black at 33% | `folio-hierarchy.css:624` |
| Popovers, hover cards, context menu, suggestion list (desktop) | `0 12px 34px` black at 33% | `folio-hierarchy.css:918`, `folio-tools.css:485`, `folio-language.css:80` |
| Scripts menus (sort, row, New) | `0 8px 24px` black at 27% | `folio-scripts.css:99` |
| Toast | `0 5px 25px` black at 33% | `app.css:1082` |
| Dialogs, sheets, the suggestion chip row | none | `app.css:1084-1092`, `folio-insert.css:56`, `folio-language.css:110` |

The variants are listed under inconsistencies with the value this reference takes. Sepia and Chalk soften the
preview frame to `0 10px 30px rgb(0 0 0 / 0.16)` (`folio-themes.css:289`) and give the
primary button `0 1px 2px` at 0.18 (Sepia, warm) or 0.16 (Chalk, neutral)
(`folio-themes.css:286`, `:315`).

Overlay strength under a modal dialog (`.tool-dialog::backdrop`):

| Themes | Value | Declared at |
|---|---|---|
| Dark themes | `#0009` (black at 60%) | `app.css:1093-1094`; measured in Charcoal |
| Sepia | `rgb(40 30 20 / 0.35)` | `folio-themes.css:282-283`; measured |
| Chalk | `rgb(0 0 0 / 0.35)` | `folio-themes.css:311-312`; measured |

The account dialog's backdrop is transparent (`folio-hierarchy.css:626-627`, measured):
it reads as a menu, not a modal. The fullscreen player's backdrop is the theme's
`--stage-full` (measured `#e6e6e8` in Chalk).

## Interaction

| Token | Value | Declared at |
|---|---|---|
| Touch target | 44px minimum in both directions: `.icon-btn` is 44×44, buttons and links take `min-height: 44px`; the prototype's exceptions are listed under inconsistencies | `app.css:51-52`, `app.css:129-135`; 50 `44px` minimums across the stylesheets |
| Hover overlay | `--control-hover` drawn as a background image over the control's own fill, only under `@media (hover: hover)`: white at 6% in dark themes, `rgb(60 40 20 / 0.06)` in Sepia, black at 5% in Chalk | `folio-themes.css:855-861`, values at `:3`, `:175`, `:203` |
| Press | Not modelled by the prototype (no `:active` rule). The components use a 12% overlay of the same colour as the hover, the press value impower-ui uses today | This repository: `packages/impower-ui/src/components/button/Button.tsx:15`, `packages/impower-ui/src/components/ripple/Ripple.tsx:10` |
| Focus | The control's own edge in the accent: `outline: 1px solid var(--accent); outline-offset: -1px` on `:focus-visible`; a filled accent button draws it inside in `--accent-ink` at `-3px` | `app.css:62-71` |
| Disabled | `opacity: 0.4` | `app.css:55-58` |
| Text selection outside the script | `--accent` fill with `--accent-ink` text | `app.css:72-75` |
| Scrollbars | `scrollbar-width: thin` everywhere, thumb `--scrollbar`, no track (Midnight and Dusk: track black at 15%) | `folio-themes.css:465-473` |
| Long names | Fade out over the last 24px with a mask instead of an ellipsis (`--fade`, default 24px) | `app.css:383-393`, `folio-hierarchy.css:240-250` |
| Current line | Full-width band in `--syntax-active` with a 3px `--accent` rule at the left edge | `folio-editor.css:21`, `folio-themes.css:336-338` |

## Breakpoints

Layout follows the viewport width; touch affordances follow `(hover: none)` / `(hover:
hover)`, never the user agent.

| Name | Query | What changes | Declared at |
|---|---|---|---|
| Phone | `max-width: 700px` | No rail; bottom navigation | `app.css:1806-1846` |
| Compact | `max-width: 1100px` | Preview becomes a strip above the script; the script opens read-only with an Edit button; 54px top bar; 16px script; 52px writer's bar | `app.css:1227`, `folio-editor.css:29`, `folio-hierarchy.css:807-809` |
| Tablet | `min-width: 701px and max-width: 1100px` | 190px rail by default | `folio-hierarchy.css:719`, `folio-split.js:42` |
| Narrow tablet | `min-width: 701px and max-width: 1000px` | The rail opens as the 76px icon rail by default | `folio-hierarchy.css:765-769`, `folio-split.js:42` |
| Desktop | `min-width: 1101px` | Top bar with the logo, 232px rail, preview docked at the right on every route | `folio-type.css:80`, `folio-playback.css:1103` |
| Small phone | `max-width: 380px` | Tighter keyboard, header and outline | `app.css:1852`, `folio-hierarchy.css:475` |
| Short phone | `max-width: 700px and max-height: 710px` | On the expression-suggestion route the script is hidden and the panel takes the writing pane with 12px margins and 8px padding (measured at 360 × 700 and 430 × 700; at 900 tall it sits under the script with 16px margins and 11px padding); the preview strip shrinks to 91px; the monitor caption clamps to two lines. The suggestion list itself does not change: on phones it is the 52px chip row at any height | `folio-editor.css:30`, `app.css:2054-2056`, `app.css:1905-1918`, `folio-type.css:475-479`; measured |
| Scripts page | `max-width: 1100px` | The Scripts page takes the whole workspace and the preview pane is hidden | `folio-scripts.css:144-146`; see inconsistencies for the ticket's 1000px |

## Motion

The prototype models only small state transitions; the components built from this
reference own their enter and exit motion, and nothing below is verified against the
prototype. Each component removes all of it under `prefers-reduced-motion: reduce`.

What the prototype does transition, for reference:

| Element | Transition | Declared at |
|---|---|---|
| Buttons, navigation links, expression chips | `background 0.14s, border-color 0.14s` under `no-preference` | `app.css:1925-1932` |
| Toast entrance | `appear 0.15s ease-out`: from opacity 0 and 5px up | `app.css:1933-1945` |
| Switch thumb and track | `0.15s ease` on background, border and position under `no-preference` | `folio-settings.css:227-235` |
| Line numbers showing and hiding | `opacity .18s ease, transform .18s ease`, from 12px left | `folio-editor.css:39-40` |
| Fold arrow appearing; rotating | `opacity .12s ease`; `transform .15s ease` | `folio-language.css:10-11` |
| Rail toggle, Add trigger, console carets rotating | `transform .15s` / `.15s ease` / `0.18s ease` | `folio-editor.css:46`, `folio-insert.css:8`, `folio-playback.css:864`, `:1280` |
| Asset card menu, zoom hint | `opacity .15s`, `opacity .2s` | `folio-assets.css:61`, `:106` |
| Console message spotlight | `console-spotlight 1.4s ease-out`, a `--tint` wash fading out | `folio-playback.css:1319-1325` |

The motion each component owns:

| Surface | Enter | Exit | Duration and easing |
|---|---|---|---|
| Menu (dropdown, context menu, select, the cog and mode menus, the app menu) | Fade and scale from 0.97 at the trigger's edge | Fade | 150ms; enter `ease-out`, exit `ease-in` |
| Popover and tooltip (hover cards, problem popovers) | Fade | Fade | 140ms `ease` |
| Dialog | Fade and scale from 0.97; backdrop fades | Fade; backdrop fades | 180ms; enter `ease-out`, exit `ease-in` |
| Sheet (phone inspector, phone menus) | Slides in from its edge; backdrop fades | Slides out; backdrop fades | 180ms; enter `ease-out`, exit `ease-in` |
| Toast | Fades in from 5px above its place, as the prototype's | Fades | 150ms `ease-out` |
| Route change | None; if the router adds one, a View Transitions cross-fade | — | 150ms `ease` |
| Button press | The press overlay appears at once and fades on release | — | 140ms, as the prototype's background transition |
| State changes on controls (hover, switch, carets) | As the prototype's table above | — | 120–180ms `ease` |

The curves are CSS's keywords: `ease` = `cubic-bezier(0.25, 0.1, 0.25, 1)`, `ease-out` =
`cubic-bezier(0, 0, 0.58, 1)`, `ease-in` = `cubic-bezier(0.42, 0, 1, 1)`. Under
`prefers-reduced-motion: reduce` every entrance, exit, slide, scale, rotation and
spotlight is removed and the end state appears at once, as the prototype's
`reduce` rules do (`folio-editor.css:42`, `:50`, `folio-language.css:16`, `:150`,
`folio-playback.css:870-874`, `:1330-1336`); colour changes on hover keep no
transition either.

## Inconsistencies

Where the prototype disagrees with itself or with the ticket, the value this reference
takes, and why in one line.

| Topic | The two values | Taken |
|---|---|---|
| Theme count | The ticket names seven themes and says nine; the prototype lists nine, with Graphite and Warm Folio (`folio-themes.js:4-14`) | Nine, as the prototype |
| Script size cut | The ticket says 16px "below 1100px"; the rule is `max-width:1100px`, so 1100px itself is compact (`folio-editor.css:29`; measured 16px at 1100 wide, 18px at 1101) | 16px at 1100px and below |
| Scripts page cut | The ticket gives 1000px for the Scripts page; in the prototype 1000px is where the rail defaults to the icon rail (`folio-hierarchy.css:765-769`, `folio-split.js:42`), and the Scripts page hides the preview pane at every width up to 1100px (`folio-scripts.css:144-146`; measured at 1100 and 1000 wide, with the preview pane beside it at 1101) | Scripts page fills the workspace at 1100px and below; 1000px is the icon-rail default |
| Tablet rail | The ticket gives a 190px tablet rail; the prototype opens 190px only from 1001px to 1100px and the 76px icon rail from 701px to 1000px (`folio-split.js:42`) | As the prototype |
| Current-line band | `folio-editor.css:21` paints it `--tint`; `folio-themes.css:336-338` repaints it `--syntax-active`, which wins | `--syntax-active` |
| Hover overlay | The ticket gives 6%; Chalk uses black at 5% (`folio-themes.css:203`), the dark themes and Sepia 6% | Per theme, as declared |
| Floating shadow | `0 12px 40px #0006` (`folio-insert.css:10`, `folio-playback.css:64`, `:327`), `0 12px 40px #0005` (`folio-hierarchy.css:624`), `0 12px 34px #0005` (`folio-hierarchy.css:918`, `folio-language.css:80`, `folio-tools.css:485`), `0 10px 30px #0006` (`folio-hierarchy.css:1018`, `folio-playback.css:312`), `0 8px 24px #0004` (Scripts menus, `folio-scripts.css:99`), `0 5px 25px #0005` (toast, `app.css:1082`); dialogs and sheets have none (all measured open) | `0 12px 40px #0006` for every floating surface, the toast included |
| Eyebrow | `app.css:137-141` sets `.eyebrow` to 700 at 0.18em; `folio-type.css:57-62` sets 0.12em and loads later | 11px, 700, 0.12em |
| Compact script header | `folio-hierarchy.css:812-814` sets 48px; `folio-tools.css:96-98` sets 56px and loads later (measured 56px at 768 wide) | 56px |
| Toast type | `app.css:1079` sets 12px; `folio-type.css` sets 13px / 1.5 (computed 13px) | 13px / 1.5 |
| Bottom navigation | `app.css:1816-1836` sets a `--panel` fill and 10px labels; `folio-themes.css:320-322` sets `--bg` and `folio-type.css` 12px / 1.4, both loading later (computed: `--bg`, 12px) | `--bg`, 12px / 1.4 |
| Fallback palette | `app.css:3-18` `:root` declares a warm palette that `body[data-direction="folio"]` replaces on every Folio page | Ignored; only `--radius`, `--control-radius` and `--kbd-height` come from `:root` |
| Light layered surfaces | `folio-themes.css:229-232` defines Lighter navigation for Sepia and Chalk, but those themes are presets that force Unified (`folio-themes.js:17-24`, `:90-93`), so the rule never applies | Lighter navigation exists for Graphite and Warm Folio only |
| Theme id | Sepia is stored as `paper` and the stylesheets' comments still say Paper (`folio-themes.js:9-10`) | The interface word is Sepia; the stored id stays `paper` |
| Scripts page gutter | `folio-scripts.css:147` sets 22px at 1100px and below; `folio-scripts.css:148-149` sets 16px under the same query and wins | 16px |
| Wide desktop | `app.css:1145-1160` sets the script to 52% and the preview to 48% with 30px × 50px padding at 1600px and wider; Folio's resizable panes override it at every desktop width (`folio-split.js:7-15` sets the script to 53% of the area after the 8px divider, `folio-playback.css:1103-1117` lets the preview fill the rest, and `folio-playback.css:2-5` pads it 12px top and 10px at the sides) | No separate wide layout; the desktop split holds above 1100px |
| Script name size | `folio-hierarchy.css:760-763` sets 16px from 701px to 1100px; `folio-hierarchy.css:838-841` sets 14px / 1.35 at 1100px and below and comes later, so it wins (measured 14px at 768 and 360) | 17px / 1.3 above 1100px, 14px / 1.35 at 1100px and below |
| Unrendered styles | `folio-type.css` styles `.writer-header h1`, `.section-heading`, `.asset-row`, `.scene-card`, `.scene-link`, `.preview-heading`, `.preview-caption`, `.rail-label` and `.tiny-link`, none of which any Folio route renders (none found on any route at 1440, 768 or 360 wide) | Omitted from the type table |
| Compact right margin | `folio-editor.css:64` sets `--folio-margin-right` to 23px at 1100px and below; `folio-editor.css:65` sets 20px under the same query and wins (computed 20px) | 20px |
| Compact script bottom padding | `folio-editor.css:29` pads the script 45px at the bottom at 1100px and below; `folio-tools.css:134-136` lowers it to 32px while reading (computed 32px reading, 45px editing) | 32px reading, 45px editing |
| Add button size | `folio-type.css:329-334` sets `.writer-tools .btn` to 12px at 1100px and below; `folio-insert.css:55` sets the Add button (`.writer-tools .insert-trigger`) to 13px and loads later (computed 600 13px at 1100, 768 and 360) | 13px at every width |
| Preview cog menu | `folio-playback.css:58-64` gives `.runtime-settings-menu` a 12px radius and `0 12px 40px #0006`; the element also carries `.runtime-menu`, whose rule at `folio-playback.css:302-312` comes later and wins (measured 10px and `0 10px 30px` black at 40%) | 10px and `0 10px 30px #0006`, as rendered; the shared shadow above is the target for the component |
| Dialog title size | The shared dialogs' title is 600 22px (`folio-type.css:211-214`, measured on Problems to fix); the Scripts and Assets form dialogs override it to 20px (`folio-scripts.css:112`, measured at all widths) | Both, per dialog family, as the type table lists; one dialog component would pick one size |
| Rows under the 44px target | Desktop-only lists: the context menu (34px rows, `folio-tools.css:499`) and the suggestion panel (36px rows, `folio-language.css:84`) open only above 1100px, where they answer a fine pointer. At every width, touch included: the aspect-ratio menu keeps 40px rows (`folio-playback.css:332-344`), the problem popover's Fix button is 32px tall (`folio-hierarchy.css:979-989`), the Problems panel's line links are 32px (`folio-playback.css:957-961`) and its section action buttons 36px (`folio-playback.css:1300-1304`), all measured at 360 wide with `(hover: none)` and `(pointer: coarse)` and again at 1440 | The desktop-only rows as rendered; on touch widths the aspect-ratio rows, the Fix button, the line links and the section actions take the 44px minimum, which is the rule this reference states, and the prototype's 40px, 36px and 32px are recorded here as below it |
| Expression panel radius | 12px (`app.css:743`) above 1100px and 9px (`app.css:1614`) at 1100px and below, against the 12px panel radius everywhere else (measured) | As rendered |
| Preview menu descriptions | `folio-playback.css:106` and `:369` set the cog and viewing-mode menus' descriptions to 12px / 1.5; both menus also carry `.runtime-menu`, whose `small` rule at `folio-playback.css:396` comes later and sets 11px (measured 11px / 1.5 at every width) | 11px / 1.5, as rendered |
| Suggestion chip font | `.completion-chip` declares 15px / 1 in the script's font (`folio-language.css:113`), but the name inside sets its own 14px / 1.3 (`.completion-label`, `folio-language.css:91`) and the chip shows no other text (measured) | 14px / 1.3 for the name; the chip's own font has no visible effect |

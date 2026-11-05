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

The theme is applied as `data-theme` on `<body>`, with `data-surfaces` and
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

| Variable | Role | Value | Computed | Declared at |
|---|---|---|---|---|
| `--bg` | Surface: the page, the Scripts page, the bottom navigation | `hsl(210.7 89.1% 18%)` | `rgb(5, 45, 87)` | `folio-themes.css:82` `body[data-theme="midnight"]` |
| `--panel` | Surface: panels, menus, popovers, the inspector, buttons | `hsl(210.6 100% 10%)` | `rgb(0, 25, 51)` | `folio-themes.css:83` `body[data-theme="midnight"]` |
| `--paper` | Surface: inset wells (thumbnails, chips, fields) | `hsl(210.6 100% 7%)` | `rgb(0, 17, 36)` | `folio-themes.css:84` `body[data-theme="midnight"]` |
| `--workspace` | Surface: the writing pane (script, script header, writer's bar) | `hsl(210.6 100% 7%)` (from `var(--bg)`) | `rgb(0, 17, 36)` | `folio-themes.css:17` `body[data-direction="folio"]` |
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

| Variable | Role | Value | Computed | Declared at |
|---|---|---|---|---|
| `--bg` | Surface: the page, the Scripts page, the bottom navigation | `hsl(210.7 70% 18%)` | `rgb(14, 45, 78)` | `folio-themes.css:106` `body[data-theme="dusk"]` |
| `--panel` | Surface: panels, menus, popovers, the inspector, buttons | `hsl(210.6 80% 10%)` | `rgb(5, 25, 46)` | `folio-themes.css:107` `body[data-theme="dusk"]` |
| `--paper` | Surface: inset wells (thumbnails, chips, fields) | `hsl(210.6 80% 7%)` | `rgb(4, 18, 32)` | `folio-themes.css:108` `body[data-theme="dusk"]` |
| `--workspace` | Surface: the writing pane (script, script header, writer's bar) | `hsl(210.6 80% 7%)` (from `var(--bg)`) | `rgb(4, 18, 32)` | `folio-themes.css:17` `body[data-direction="folio"]` |
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

Named styles, as size / line height and weight. Values are `folio-type.css` unless named;
the compact column is the `max-width: 1100px` override where one exists
(`folio-type.css:308-474`), the tablet column the `701px–1100px` override
(`folio-type.css:286-307`).

| Style | Selector | Desktop | Tablet | Compact | Notes |
|---|---|---|---|---|---|
| Body | `body[data-direction="folio"]` | 14px / 1.6, 400 | | | `folio-type.css:47-51` |
| Button | `.btn` | 14px / 1.4, 600 | | | |
| Eyebrow, rail label | `.eyebrow`, `.rail-label` | 11px / 1.5, letter-spacing 0.12em | | | `.eyebrow` is 700 with 0.18em in `app.css:137-141`; see inconsistencies |
| Tag | `.tag` | 11px / 1.4 | | | |
| Small link, save caption | `.tiny-link`, `.saved`, `.project-title small` | 12px / 1.5 | | 11px / 1.4 (`.topbar .saved`) | |
| Project name | `.project-title` | 14px / 1.5 | | 12px / 1.4 | |
| Navigation link | `.nav-link` | 14px / 1.4 | | | 11px / 1.35 on the icon rail (`folio-hierarchy.css:788-789`) |
| Outline row | `.scene-link` | 13px / 1.4 | | | |
| Script title | `.writer-header h1` | 600 22px / 1.25, −0.025em | 20px | 600 18px / 1.3, −0.02em | |
| Script name in the header | `.script-context > span > strong` | | 16px | | `folio-hierarchy.css:760-763` |
| Writer's bar button | `.writer-tools .btn` | 13px / 1.4 | 12px | 12px / 1.4 | |
| Preview heading | `.preview-heading`, `.following` | 13px / 1.4 | | | |
| Preview caption | `.preview-caption` | 12px / 1.5 | | | |
| Page title | `.page-intro h1` | Georgia 40px / 1.12, −0.035em | | 32px / 1.15 | The one display style |
| Page and card body | `.page-intro p`, `.feature-card p` | 14px / 1.6 | | | |
| Section heading | `.section-heading h2`, `.asset-row h3`, `.scene-card h2` | 600 16px / 1.3 | | 15px (cards), 14px (asset row) | |
| Card caption | `.section-heading span`, `.asset-row p` | 12px / 1.5 | | 12px / 1.4 (asset row) | |
| Share card title | `.feature-card h2` | 600 22px / 1.25, −0.02em | | | |
| Dialog title | `.dialog-heading h2` | 600 22px / 1.25, −0.02em | | | |
| Dialog body | `.tool-dialog p` | 14px / 1.6 | | | |
| Dialog label | `.tool-dialog label` | 13px / 1.5 | | | |
| Dialog field | `.tool-dialog input` | 16px / 1.5 | | | 16px keeps mobile browsers from zooming |
| Toast | `.toast` | 13px / 1.5 | | | `app.css:1082` sets 12px earlier; `folio-type.css` wins |
| Bottom navigation label | `.mobile-nav a` | | | 12px / 1.4 | `app.css:1836` sets 10px; `folio-type.css` loads later and wins |
| Add menu title | `.insert-heading h2` | 600 15px / 1.4 | | | `folio-insert.css:12` |
| Suggestion list | `.completion` | 13px / 1.4 | | | `folio-language.css:80` |
| Popover | `.problem-popover` | 13px / 1.5 | | | `folio-hierarchy.css:918-919` |
| Context menu | `.context-menu` | 13px / 1.4 | | | `folio-tools.css:485-486` |
| Line numbers | `.folio-line::before` | 0.72em of the script size | | | `folio-editor.css:39` |

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
| `--folio-header-inset` | 22px | 16px | `folio-hierarchy.css:4`, `:741` |
| `--folio-context-gap` | 12px | 9px | `folio-hierarchy.css:5`, `:742` |
| `--folio-rail-gutter` | 14px | 10px; 5px on the icon rail | `folio-hierarchy.css:15`, `:745`, `:772` |
| `--folio-gutter` (script's left gutter) | 56px | 36px | `folio-editor.css:6`, `:29` |
| `--folio-margin-right` (problem marks) | 30px | 30px | `folio-editor.css:54` |
| `--preview-inline-padding` | 10px | 10px; 16px in the fullscreen player | `folio-playback.css:3`, `:1045`, `:1191` |
| `--scripts-gutter` | 30px; 18px beside the preview | 16px | `folio-scripts.css:2`, `:129`, `:149` |

## Shape

| Token | Value | Declared at |
|---|---|---|
| `--control-radius` (buttons, icon buttons, fields, menus' items) | 8px | `app.css:17` |
| `--radius` (cards, panels, the Add menu, the suggestion list) | 12px | `app.css:16`; the panels write 12px literally (`folio-insert.css:10`, `folio-language.css:80`) |
| Toast | 10px | `app.css:1080` |
| Tags | 5px | `app.css:152` |

## Elevation

One shadow for everything that floats over the page (menus, popovers, the Add menu,
the account dialog, the suggestion list): `0 12px 40px #0006`, as on
`.insert-panel` (`folio-insert.css:10`), `.runtime-settings-menu`
(`folio-playback.css:64`) and `.runtime-mode-menu` (`folio-playback.css:327`). The
prototype also writes `0 12px 34px #0005`, `0 12px 40px #0005`, `0 10px 30px #0006` and,
for the toast, `0 5px 25px #0005` (see inconsistencies). Sepia and Chalk soften the
preview frame to `0 10px 30px rgb(0 0 0 / 0.16)` (`folio-themes.css:289`) and give the
primary button `0 1px 2px` at 0.18 (Sepia, warm) or 0.16 (Chalk, neutral)
(`folio-themes.css:286`, `:315`).

Overlay strength under a modal dialog (`.tool-dialog::backdrop`):

| Themes | Value | Declared at |
|---|---|---|
| Dark themes | `#0009` (black at 60%) | `app.css:1093-1094` |
| Sepia | `rgb(40 30 20 / 0.35)` | `folio-themes.css:282-283` |
| Chalk | `rgb(0 0 0 / 0.35)` | `folio-themes.css:311-312` |

The account dialog's backdrop is transparent (`folio-hierarchy.css:626-627`): it reads
as a menu, not a modal.

## Interaction

| Token | Value | Declared at |
|---|---|---|
| Touch target | 44px minimum in both directions: `.icon-btn` is 44×44, buttons and links take `min-height: 44px` | `app.css:51-52`, `app.css:129-135`; 50 `44px` minimums across the stylesheets |
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
| Wide | `min-width: 1600px` | Script 52%, preview 48% with 30px × 50px padding | `app.css:1145-1160` |
| Small phone | `max-width: 380px` | Tighter keyboard, header and outline | `app.css:1852`, `folio-hierarchy.css:475` |
| Short phone | `max-width: 700px and max-height: 710px` | The suggestion panel's preview is hidden; the preview strip shrinks to 91px; the monitor caption clamps to two lines | `folio-editor.css:30`, `app.css:1905-1918`, `folio-type.css:475-479` |
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
| Floating shadow | `0 12px 40px #0006` (`folio-insert.css:10`, `folio-playback.css:64`, `:327`), `0 12px 40px #0005` (`folio-hierarchy.css:624`), `0 12px 34px #0005` (`folio-hierarchy.css:918`, `folio-language.css:80`, `folio-tools.css:485`), `0 10px 30px #0006` (`folio-hierarchy.css:1018`, `folio-playback.css:312`), `0 5px 25px #0005` (toast, `app.css:1082`) | `0 12px 40px #0006` for every floating surface, the toast included |
| Eyebrow | `app.css:137-141` sets `.eyebrow` to 700 at 0.18em; `folio-type.css:57-62` sets 0.12em and loads later | 11px, 700, 0.12em |
| Compact script header | `folio-hierarchy.css:812-814` sets 48px; `folio-tools.css:96-98` sets 56px and loads later (measured 56px at 768 wide) | 56px |
| Toast type | `app.css:1079` sets 12px; `folio-type.css` sets 13px / 1.5 (computed 13px) | 13px / 1.5 |
| Bottom navigation | `app.css:1816-1836` sets a `--panel` fill and 10px labels; `folio-themes.css:320-322` sets `--bg` and `folio-type.css` 12px / 1.4, both loading later (computed: `--bg`, 12px) | `--bg`, 12px / 1.4 |
| Fallback palette | `app.css:3-18` `:root` declares a warm palette that `body[data-direction="folio"]` replaces on every Folio page | Ignored; only `--radius`, `--control-radius` and `--kbd-height` come from `:root` |
| Light layered surfaces | `folio-themes.css:229-232` defines Lighter navigation for Sepia and Chalk, but those themes are presets that force Unified (`folio-themes.js:17-24`, `:90-93`), so the rule never applies | Lighter navigation exists for Graphite and Warm Folio only |
| Theme id | Sepia is stored as `paper` and the stylesheets' comments still say Paper (`folio-themes.js:9-10`) | The interface word is Sepia; the stored id stays `paper` |
| Scripts page gutter | `folio-scripts.css:147` sets 22px at 1100px and below; `folio-scripts.css:148-149` sets 16px under the same query and wins | 16px |

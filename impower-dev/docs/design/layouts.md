# Folio layouts

The geometry of each Folio shell at each width, measured from the prototype at commit
`c2fe740` (see [README.md](./README.md)). "Measured" values are bounding boxes in CSS
pixels from the running page in Chromium on `folio.html#write` (and `#scripts` where
named), in the default theme, before any resize was saved. "Declared at" cells are
paths relative to the prototype's `prototype/` directory. Breakpoints and tokens are in
[tokens.md](./tokens.md).

## The three shells

| Shell | Widths | Navigation | Preview |
|---|---|---|---|
| Desktop | above 1100px | Top bar, left rail | Docked at the right on every route |
| Compact (tablet) | 701px–1100px | Top bar, left rail (190px or the 76px icon rail) | A strip above the script |
| Phone | 700px and below | Top bar, bottom navigation | A strip above the script |

## Desktop (1440 × 900)

```
+--------------------------------------------------------------------------------+
| [logo]  Project name                                                    76px   |
|         Saved caption                                                          |
+-----------+--------------------------------------+-+---------------------------+
| Story     | [rail] Script name         [Browse]  | | [mode v]  |<< (>) >>| [*] |
| Assets    |   path                       68px    | |              48px         |
| Share     +--------------------------------------+ +---------------------------+
|-----------|                                      | |                           |
| Outline   |  script, 18px / 1.5                  | |   game, fills the pane    |
|  scene    |  56px gutter, 30px right margin      | |                           |
|  scene    |                                      | |                           |
|  ...      |                                      | |                           |
|           |                                      | +========= 12px ============+
|-----------+--------------------------------------+ +---------------------------+
| Saved     | [Tools]                  [Add] 62px  | | [problems]  [ratio] [ ] 62|
| locally   |                                      | |                           |
+-----------+--------------------------------------+-+---------------------------+
   232px              636px (53% of the rest)       8px        564px
```

| Part | Measured | Declared at |
|---|---|---|
| Top bar | 76px tall; logo block 112.5 × 44 at the left | `app.css:365-370` (`min-height: 76px`) |
| Project name and save caption | 420 × 42 field at x 226 | `app.css:432`, `folio-type.css` `.project-title` |
| Rail | 232px wide by default, from below the top bar to the bottom; gutter 14px; top padding 22px | `folio-hierarchy.css:3`, `:14-20` |
| Rail navigation (Story, Assets, Share) | 3 links, 203 × 46 each, from y 98 | `folio-hierarchy.css`, `.nav-link` |
| Outline | Heading 44px tall below a 1px rule; rows 44px tall, 191px wide, badge gutter 12px | `folio-hierarchy.css:21-31`, `:45-53` |
| Rail footer (app menu trigger) | 62px tall bar; the trigger 203 × 44 | `.rail-accountbar`, `.account-trigger` |
| Rail divider | 8px wide hit area straddling the rail's edge | `.sidebar-divider`, `folio-playback.css:1057` |
| Script header | 68px tall; 22px inset; the name block 436 × 44 | `folio-hierarchy.css:337-340` |
| Script | Padding 20px top, 30px right, 60px bottom, 56px left gutter | `folio-editor.css:6`, `:11`, `:54` |
| Writer's bar | 62px tall; 44px buttons | `folio-hierarchy.css:6-12` |
| Pane divider | 8px between script and preview | `folio-split.js:11`, `.pane-divider` |
| Script : preview split | 53% of the width after the rail and divider; the script keeps at least 280px and the preview 336px | `folio-split.js:7-11` |
| Preview pane padding | 12px top, 10px at the sides, none at the bottom | `folio-playback.css:2-5`; measured |
| Preview top bar | 48px tall | `.runtime-toolbar`, `folio-playback.css:9` |
| Game | Fills the rest of the pane, 544 × 694 | `.runtime-stage` |
| Divider above the bar under the game | 12px hit area | `.preview-height-divider` |
| Bar under the game (problems toggle, position, ratio, fullscreen) | 62px tall, aligned with the writer's bar | `.runtime-console` |

The split holds at every desktop width: at 1700 × 900 the script is 774px (53% of
the 1460px left after the rail and divider) and the preview 686px. The older 1600px
rule in `app.css:1145-1160` is overridden (see the inconsistencies in
[tokens.md](./tokens.md#inconsistencies)).

### Rail sizes

| Rule | Value | Declared at |
|---|---|---|
| Default width | 232px above 1100px, 190px from 1001px to 1100px, the 76px icon rail at 1000px and below | `folio-split.js:42` |
| Resize range | 180px to 420px, and never so wide that less than 624px (280px script, 336px preview, 8px divider) remains | `folio-split.js:39`, `:43-44` |
| Snap | A drag below 180px snaps to the 76px icon rail | `folio-split.js:49-50` |
| Keyboard | Arrow keys step 16px (64px with Shift); Home is the icon rail, End the widest; Enter or double-click resets | `folio-split.js:69-75` |
| Saved | Per device, under `spark-folio-sidebar-width` | `folio-split.js:39`, `:59` |

The icon rail: navigation links stack icon over label, 65 × 66, 11px / 1.35 type; the
Outline is hidden; the footer trigger is a 44px square (`folio-hierarchy.css:770-805`).

## Compact (1100 × 800, rail 190px)

```
+--------------------------------------------------------------------+
| [=] Project name / Saved caption                         54px      |
+-----------+--------------------------------------------------------+
| Story     | [game ] Following: scene                     104px     |
| Assets    | [98x83] caption                                        |
| Share     +--------------------------------------------------------+
|-----------| [rail] Script name                [Browse]   56px      |
| Outline   +--------------------------------------------------------+
|  scene    |  script, 16px / 1.5, 36px gutter                       |
|  ...      |                                                        |
|-----------+--------------------------------------------------------+
| Saved     | [Tools]                                  [Edit]  52px  |
+-----------+--------------------------------------------------------+
   190px                         910px
```

Compact widths open the script read-only, as phones do: the writer's bar holds Writing
tools and Edit (88 × 44). Editing swaps it for Indent, Dedent, Format script and Writing
tools at the left and Add (74 × 44) at the right, and puts Undo, Redo and Done editing
(98 × 46) at the right of the top bar.

| Part | Measured | Declared at |
|---|---|---|
| Top bar | 54px tall | `app.css:1318-1321` |
| Rail | 190px; gutter 10px; top padding 16px | `folio-hierarchy.css:739-748` |
| Preview strip | 104px tall across the script column; the game thumbnail 98 × 83 | `app.css:1467-1472` |
| Script header | 56px tall; name block 48px | `folio-tools.css:95-98` |
| Script | 16px type; padding 12px top, 20px right, 36px gutter; 32px bottom while reading, 45px while editing | `folio-editor.css:29`, `:65`, `folio-tools.css:134-136`; measured at 1100, 768 and 360 |
| Writer's bar | 52px tall; 44px buttons | `folio-hierarchy.css:807-809` |

At 768 × 1024 the rail is the 76px icon rail (the default at 1000px and below) and the
script column is 692px; every height above is unchanged.

## Phone (360 × 780 and 430 × 932)

Reading, as the page opens:

```
+----------------------------------+
| [logo] Name   [Search] [Menu] 54 |
+----------------------------------+
| [game] Following: scene  104px   |
+----------------------------------+
| [rail] Script name       56px    |
+----------------------------------+
|                                  |
|  script, read-only, 16px         |
|                                  |
+----------------------------------+
| [Tools]               [Edit] 52px|
+----------------------------------+
|  Story    Assets    Share   65px |
+----------------------------------+
```

Editing, after Edit:

```
+----------------------------------+
| Script name [S][Un][Re][Done] 54 |
+----------------------------------+
| [game] Following: scene  104px   |
+----------------------------------+
|  script, 16px                    |
+----------------------------------+
| [<][>][Fmt][Tools]     [Add] 52px|   <- suggestions replace this row
+----------------------------------+
|                                  |
|  on-screen keyboard              |
|                                  |
+----------------------------------+
```

| Part | Measured | Declared at |
|---|---|---|
| Top bar | 54px tall at every phone width | `app.css:1318-1321` |
| Preview strip | 104px; 91px when the viewport is 710px tall or less | `app.css:1467-1472`, `:1913-1915` |
| Top bar contents | Reading: logo, project name and save caption, Search and App menu (44px each). Editing: the script's name, Search, Undo edit, Redo edit and Done editing (98 × 46) | measured |
| Script header | 56px while reading; while editing it moves into the top bar as a 44px block | `folio-tools.css:95-98` |
| Writer's bar (the keyboard toolbar) | 52px. Reading: Writing tools (44px) and Edit (88 × 44). Editing: Indent, Dedent, Format script and Writing tools (44px each) at the left, Add (74 × 44) at the right | `folio-hierarchy.css:807-809` |
| Suggestion row | 52px, in the writer's bar's place while suggestions show | `.completion.is-bar`, `folio-language.css:110` |
| Bottom navigation | 65px minimum plus the safe-area inset; three 64 × 64 targets; hidden while editing | `app.css:1816-1846` |

The prototype draws a stand-in keyboard so the layout can be judged in a desktop
browser (`--kbd-height` 220px by default, 193px–264px by width and height,
`app.css:18`, `:1229`, `:1854`, `:1907`, `:2022-2041`); the real editor leaves that
space to the device's keyboard and measures it with the visual viewport.

## Scripts page

At 1101px and wider the Scripts page takes the script's slot (53%) and the preview
stays beside it with an 18px gutter (`folio-scripts.css:128-135`); at 1100px and below it
fills the whole workspace and the preview pane is hidden (`folio-scripts.css:144-146`),
with a 16px gutter (`folio-scripts.css:148-149`). Measured: 636px wide at 1440, 910px
at 1100, 924px at 1000, 360px at 360.

## Overlays and states

Each surface below was opened in the running prototype by its own control (or its route
option) and measured as a bounding box at 1440 × 900, 1100 × 900, 768 × 1024 and
360 × 900, plus 360 × 700 and 430 × 700 for the short-phone cut. "Not opened" means the
control does not produce the surface at that width.

| Surface | 1440 | 1100 | 768 | 360 | Declared at |
|---|---|---|---|---|---|
| Fullscreen player (`?preview=fullscreen`) | Fills the viewport; pads `12px 16px 0`; top bar 48px; bar under the game 62px | Fills the viewport; pads `8px 10px 0`; top bar 48px; bar under the game 52px | as 1100 | as 1100 | `folio-playback.css:1044-1050`, `:1189-1192`; `--folio-bottom-bar-height` |
| Problems panel open (`?preview=console`) | In the docked preview: 260px tall under the game, section card 10px radius with a 40px head | Opens inside the fullscreen player: 260px tall across the viewport | as 1100 | as 1100 | `folio-playback.css:809`, `:1225-1228` |
| Writing tools (`?tools=menu`) | Floating panel 360 × 195, 12px left of the script pane's edge and 8px above the writer's bar | Sheet in the keyboard's place across the script column, 264px tall, no radius or shadow | Sheet 692 × 264 | Sheet 360 × 256 | `folio-tools.css:20-24`, `folio-insert.css:10`, `:56` |
| Add menu (`?insert=blocks`) | Floating panel 340 × 642, 12px from the script pane's right edge, 8px above the writer's bar | Sheet, as Writing tools | Sheet, as Writing tools | Sheet, as Writing tools | `folio-insert.css:10`, `:56` |
| App menu | 280 × 267 above the rail footer, 12px from the left | as 1440 | as 1440 | 280 × 267 under the top bar, 12px from the right | `folio-hierarchy.css:611-624` |
| Viewing-mode menu | 340 wide under the preview top bar | Not opened in the strip; in the fullscreen player 340 wide | as 1100 | in the fullscreen player 320 wide | `folio-playback.css:321-327` |
| Preview cog menu | 340 wide, right-aligned under the top bar | Not opened in the strip; in the fullscreen player as 1440 | as 1100 | in the fullscreen player 320 wide | `folio-playback.css:58-62` |
| Aspect-ratio menu | 210 wide above the bar under the game, rows 40px | Not opened in the strip; in the fullscreen player as 1440 | as 1100 | as 1100 | `folio-playback.css:302-317`, `:337` |
| Context menu (right-click in the script) | 250 wide at the pointer, rows 34px | Not opened | Not opened | Not opened | `folio-tools.css:476-499` |
| Suggestion list (typing) | Panel with a preview side, 612 × 291 under the caret, rows 36px | Chip row, 52px, in the writer's bar's place across the script column | as 1100 | as 1100, 360 wide | `folio-language.css:80-84`, `:110-113` |
| Expression suggestions (`#suggestions`) | 596 × 240 above the writer's bar, 20px from the pane's sides | 878 × 206, 16px from the column's sides | 660 × 206 | 328 × 206 above the writer's bar, 16px from the sides; at 700px tall it replaces the script, 336 × 180 with 12px margins | `app.css:738-743`, `:1611-1614`, `:2054-2056`, `folio-editor.css:30` |
| Problem popover (margin mark) | Up to 460 wide, under the line | Up to 460 wide | Up to 460 wide | 336 wide (12px from each side) | `folio-hierarchy.css:907-918` |
| Hover card (picture name) | 290 wide under the name | Not opened | Not opened | Not opened | `folio-hierarchy.css:907-918` |
| Scripts menus (sort, row, New) | 196 wide at their button, rows 44px | as 1440 | as 1440 | as 1440 | `folio-scripts.css:99-100` |
| Dialogs | Centred, 440 wide, 26px padding, 18px radius | Centred, 440 wide, 19px padding | as 1100 | 328 wide (16px from each side), 19px padding | `app.css:1084-1091`, `:1794-1795` |
| Asset inspector | Over the preview pane, 564 × 824 | Full screen | Full screen | Full screen | `folio-assets.css:76`, `:87` |
| Toast | 86px from the top, centred | 64px from the top, up to the viewport less 28px | as 1100 | as 1100, 332 wide | `app.css:1069-1078`, `:1790` |

The sweep script and its output (`measure-output.json`) are kept with the writer's
private artifacts; every cell above comes from that output.

# Folio design reference

An art-free reference of the Folio redesign of the web editor, so that the work that
builds it and the review of that work can check a colour, a size or a string without
the prototype. The design of record is the prototype at commit `c2fe740`; where this
reference and the prototype differ, the prototype wins and this reference is corrected.

| Document | Holds |
|---|---|
| [tokens.md](./tokens.md) | The nine theme choices and every theme's semantic colours with contrast for the two defaults, the syntax palettes, type, spacing, shape, elevation, interaction tokens, breakpoints, motion, and the prototype's inconsistencies with the value chosen |
| [layouts.md](./layouts.md) | The measured geometry of the desktop, compact and phone shells, the rail's resize rules and the Scripts page, as ASCII frames |
| [glossary.md](./glossary.md) | Old words and their replacements, and the interface copy of every surface, quoted from the prototype |
| [adding-a-surface.md](./adding-a-surface.md) | How to add a surface to the editor: the row kit, the Dialog and Sheet, icons, the variables and the driver steps |

## The prototype

The prototype lives in the private repository `ImpowerGames/spark-engine-redesign`, on
branch `folio-revisions`, checked out beside this repository:

```sh
git clone --branch folio-revisions https://github.com/ImpowerGames/spark-engine-redesign.git ../spark-engine-redesign
git -C ../spark-engine-redesign checkout c2fe740
```

Serve it from this machine only, bound to the loopback address:

```sh
python -m http.server 8765 --bind 127.0.0.1 --directory ../spark-engine-redesign
```

Then open `http://127.0.0.1:8765/prototype/index.html`. The routes:

| Route | Shows |
|---|---|
| `prototype/folio.html#write` | Story: the script, the rail and the preview |
| `prototype/folio.html#write?insert=blocks` | The Add menu open |
| `prototype/folio.html#write?tools=menu` | The Writing tools menu open |
| `prototype/folio.html#write?preview=console` | The Problems panel open |
| `prototype/folio.html#write?mode=screenplay` | The preview in Screenplay mode |
| `prototype/folio.html#scripts` | The Scripts page |
| `prototype/folio.html#collection` | Assets |
| `prototype/folio.html#share` | Share |
| `prototype/folio.html#project` | Settings |
| `prototype/folio.html?project=empty#write` | An empty project |

A route's options follow the `?` inside the hash (`app.js:186`, `:218-226`); Feature #977
writes them as `?insert=blocks` and so on after `#write`. The prototype's own
`prototype/README.md` lists further routes such as `#play`, `#write?preview=fullscreen`
and `#project?preference=themes`.

The prototype's markup wins over its own notes (`prototype/README.md`,
`prototype/change-list.md`, `prototype/decisions.md`) where they differ.

## Rules for using it

- The prototype's demo art (backdrops, portraits, sounds, video) may not leave the
  machine it is checked out on. No ticket, pull request, commit or document carries a
  screenshot, recording or copy of it; this reference holds no image of any kind.
- Screenshots of the editor built from this reference are fine: they show the
  repository's own sample projects, not the prototype's art.
- Every value in the reference names the stylesheet, script and line it was read from,
  relative to the prototype's `prototype/` directory, or says it was measured from the
  running page. A value that cannot be found there is a defect in this reference.

## Where the editor differs from the prototype

The editor follows the prototype except where the table below says otherwise. Each row names the surface, the widths it applies to, the difference, and the slice that built it.

| Surface | Widths | Difference | Slice |
|---|---|---|---|
| Story (write) and every route at compact width | tablet | At tablet widths the strip above the script is a full, resizable game band, not the prototype's small 104px monitor | #996, #2250, #2208 |
| Scripts, Assets, Settings | tablet | At tablet width the Scripts, Assets and Settings pages share the screen with the game preview instead of filling the workspace | #1007, #1025, #1015 |
| Story (write) | tablet | Tablets open the script directly editable with Indent, Dedent and Format showing; the prototype's read-only mode with an Edit button is phone-only in the editor | #998, #2009 |
| Assets inspector, Variants tester | tablet | At tablet width variant pickers in the asset inspector open as a popover menu instead of a wheel sheet | #2223 |
| Assets inspector, Variants tester | desktop, tablet, phone | Variants tester Copy and Insert at caret buttons are 44px tall, not 38px | #2223 |
| Assets inspector, Variants tester and menus | desktop, tablet, phone | Tester and menu text is 13px instead of 12px | #2223 |
| Assets inspector, Variants tester | desktop, tablet, phone | A hint line explains why Insert at caret is unavailable | #2223 |
| Assets inspector head | desktop, tablet, phone | The inspector's more-options menu lists Rename, Move, Download, Delete instead of Select, Variants, Rename, Move, Delete | #2223 |
| Assets | desktop | Assets page content is about 10px narrower than the prototype's | #2223 |
| Assets inspector head | desktop, tablet, phone | The inspector head's subtitle names the file type | #2223 |
| Settings (and other scrolling pages) | desktop | Settings page content and rail tint stop about 10px short of the prototype's edge | #1015 |
| Preview bar under the game | desktop, tablet | In Interactive Fiction mode the preview bar keeps a disabled aspect-ratio control reading Auto | #1992, #1042 |
| Preview bar under the game (phone preview pane) | phone | On phones the aspect-ratio control moves into the Preview settings menu and the position readout carries the stopped-before state with an octagon | #2085, #977 |
| Preview, Interactive Fiction mode | desktop, tablet, phone | The Interactive Fiction page keeps growing across choices instead of clearing at each choice | #1991, #1990, #1042 |
| Preview, Interactive Fiction mode | desktop, tablet, phone | Interactive Fiction options have 1em above them, and a thin rule marks a new scene | #1990 |
| Preview, Interactive Fiction mode | desktop, tablet | The Interactive Fiction page fills the preview pane instead of sitting in a bordered card | #1992 |
| Preview, Screenplay mode | desktop, tablet, phone | Screenplay mode shows the full printed title page instead of the prototype's compact header | #1024 |
| Preview, Screenplay mode | desktop, tablet, phone | Screenplay mode shows choices in source form '+ [Run]' instead of '▸ Run' | #1024 |
| Preview, Screenplay mode | desktop, tablet | Screenplay page fills the pane with no rounded inset frame, and consecutive scenes draw two rules | #1024, #2208 |
| Story (write) | desktop, tablet, phone | Line numbers show by default in the script | #1002, #999 |
| Preview top bar | desktop, phone | The preview top bar is 52px with centred controls, where the prototype has a 48px toolbar below a 12px gap (8px at 1100px and narrower) | #1020, #2208 |
| Preview top bar | phone | At phone widths Pause sits beside the viewing-mode button instead of overlapping it | #2454 |
| Preview pane | desktop, tablet | An 8px resize handle sits between the game card and the bar under it | #2208 |
| Preview, fullscreen | desktop, tablet, phone | Fullscreen preview has no inset, radius or shadow | #2208 |
| Preview bars (web editor) vs VS Code Game Preview | desktop | The web editor draws its own preview bars; VS Code and the standalone player keep the player's own bar | #1018 |
| Story, Add menu | desktop, tablet | The Add panel is 360px wide instead of 340px | #1013 |
| Add menu pickers (Backdrop, Portrait, Sound, Music) | desktop | In the Add pickers the 'Previewing' note sits under the game instead of a chip on it, and sound tiles use a muted fill | #1017, #1012 |
| Assets inspector, Variants tester | desktop, tablet, phone | The Variants tester has no 'Save as a variant' | #2187, #1039 |
| Settings > Script editor | desktop, tablet, phone | The Settings 'Syntax color key' lists one row per editor colour variable rather than the prototype's 17 roles | #1974, #1036 |
| Settings > Keyboard shortcuts | desktop | Keyboard shortcut recording names letters by key, not by physical key code | #1037 |
| Scripts page | desktop, tablet | The Scripts page header reads 'Scripts' instead of the open script's name | #1009 |
| Scripts and Assets pages | desktop, tablet, phone | Naming and renaming scripts and assets happens in an inline field instead of a Rename dialog | #1009, #2215 |
| Scripts page | desktop, tablet, phone | No script or folder row offers Duplicate, and Main's row menu offers only Download | #1009, #2689 |
| Search and replace rail | desktop, tablet | Search rail buttons and result rows are 44px, and match marks use the accent wash | #1004 |
| Change color view | desktop, tablet | Change color opened from a swatch shows a Back button | #1005 |
| Writing tools menu | desktop, tablet, phone | Go to definition is disabled on a dialogue cue in Writing tools | #1006 |
| Writing tools menu | desktop, tablet, phone | The Sparkdown guide and Keyboard shortcuts rows show their label with no description | #2763 |
| Outline rail | desktop, tablet | Outline row labels are drawn in full ink instead of muted | #1008 |
| Assets inspector, Variants tester on touch | tablet, phone | The variant wheel sheet dims the picture and spans the window | #1032 |
| Assets Audio tab and inspector player | desktop, tablet, phone | Sound rows are 63px instead of 60px; Restart and Loop are 44px instead of 40px | #1029, #2162 |
| Assets Audio tab | desktop, tablet, phone | A playing sound row shows 'elapsed / length · meta' | #2223 |
| Problem popover, Problems panel and dialog | desktop, tablet, phone | No 'Remove the two dots' quick fix for a stray marker at a line start | #2059, #1041 |
| Story, Add menu | desktop, tablet, phone | Add > Dialogue shows a 'Cannot find character named CHARACTER' warning immediately | #2058 |
| Top bar save status | desktop, tablet, phone | No backup reminder for local-only projects | #2063, #2092 |
| First run | desktop, tablet, phone | No welcome page or starter story | #977, #979 |
| Shell rail | tablet | At 768 the rail can be widened to 190px | #996 |
| Assets | desktop, tablet, phone | The Assets page has no title bar; the search row starts the page | #2464, #2463 |
| Preview top bar, running | phone, tablet, desktop | Below the width the running bar's controls need, the Step menu's entries move from a Step button in the bar to a Step group at the top of the cog menu; under 360px the bar closes its gaps and narrows its side padding to 4px, where the prototype keeps 4px between the transport buttons down to 340px | #2523, #2517, #1020 |
| Preview, Screenplay mode | desktop, tablet, phone | The Screenplay page draws choice lines in grey (#666), where the PDF prints them in black | #2517 |
| Preview, Screenplay mode | desktop, tablet, phone | The Screenplay page is #ebeae8 with #333 ink in every theme with the Paper setting, where the PDF prints black on white | #2517 |
| Preview, Screenplay mode | desktop, tablet, phone | The Screenplay page draws a rule above each scene heading where the PDF starts a new page | #2517 |
| Assets, image folder in Small tiles, desktop pane dragged to 440 or less | desktop | Small tiles keep their 96px minimum in a narrow desktop pane | #2462 |
| Assets page tile, row and folder menus | desktop, tablet, phone | Delete has no ellipsis in the tile, row and folder menus | #2544, #1025 |
| Assets page folder trail | phone, tablet | The folder trail's crumb button is 44px under a coarse pointer | #2544, #1025 |
| Asset inspector (Files section and reference field) | desktop, tablet, phone | Thumbnails on the inspector's Files rows, the pinned picture and the script font in the reference field | #2544, #2274, #1025 |
| Assets page tiles | desktop, tablet, phone | Tile names and sub-lines fade at the right edge only when the text overflows | #1025 |
| Asset inspector (Variants) | phone, tablet | The inspector's Face picker is 44px tall under touch | #1025 |
| Assets page tiles | desktop, tablet | Hovering a tile with a mouse shows an empty round select circle in its top-left corner | #1025 |
| Assets inspector, Used in | desktop, tablet, phone | The unused hint for a single-file picture stops after the first sentence | #1025, #2544 |
| Shell rail, bottom navigation, app menu, Settings page | desktop, tablet, phone | Settings is the fourth navigation entry of the rail, under Share, and the fourth bottom navigation tab, not an app menu item; the Settings page has no Back to story and its index has no heading | #2723, #2763 |

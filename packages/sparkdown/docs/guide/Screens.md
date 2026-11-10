# 6. Screens & Navigation

So far every example lived in one `layout main`, which shows automatically. Real games often have more than one view — a HUD over the action, a pause menu, a settings page. This page covers how to show, hide, and switch between them.

Navigation directives are written in your **story flow** (the same `[[ … ]]` directives you use for backdrops and sound), so your narrative drives what's on screen.

---

## 6.1 The `main` layout

A layout named `main` is shown from the start — it's your always-on view (the HUD, the world, whatever's persistently visible). You don't have to open it.

```sparkdown
store player = { hp = 8, max_hp = 10, gold = 20 }

layout main {
  row.hud #child-gap=12 {
    text "Health: {player.hp}/{player.max_hp}"
    text "Gold: {player.gold}"
  }
}
```

### The `textbox` layout and `ui.layouts_initial`

The built-in `main` layout holds the stage. The dialogue box and the choices live in a built-in layout of their own, `textbox`, and `ui.layouts_initial` names the layouts that open when a run or a preview starts, besides `main`:

```sparkdown
define ui as config with
  layouts_initial = { "textbox" }
end
```

An initial layout with a dialogue box (a `textbox` or `dialogue` element) is skipped when `main` already holds text elements, so a project whose own `layout main` shows dialogue keeps one dialogue box. Any other layout in the list always opens. An explicit `[[open textbox]]` still opens the built-in layout.

To hide the dialogue box, use the ordinary directives, and checkpoints and saves remember the result:

```sparkdown
[[close textbox]]
Nobody sees this line.
[[open textbox]]
Everybody sees this one.
```

Image cues and layout directives still apply while no open layout holds a beat's text. The text and choices are not shown, and the play log says once per run: "No open layout shows this text. Open textbox or textstream." A beat whose text has no open layout waits for a click like any other beat, and a beat whose choices have no open layout waits for a pick that cannot arrive, so open a layout before a menu.

A layout's name styles its root unless the layout holds an element of that name, in which case the name reaches the element.

The `textbox` layout stacks above `main`'s `stage` and below `main`'s `screen`, so a `screen` animation such as a fade or flash covers the dialogue box. A layout opened later stacks above them both.

### The `textstream` layout: Interactive Fiction

The built-in `textstream` layout shows the story as a page of text and choices that keeps growing, the way interactive fiction reads. Open it at any point with `[[open textstream]]`, and the page covers the stage and the dialogue box. `[[close textstream]]` goes back to them. The run carries on either way. To start a game on the page, name it in `ui.layouts_initial`:

```sparkdown
define ui as config with
  layouts_initial = { "textstream" }
end
```

Each beat becomes an entry below the last:

- Narration is an italic paragraph.
- Dialogue is the speaker's name in small capitals above the line. The name is left out while the same speaker keeps talking.
- A title, a scene heading or a transition is a centred heading.
- A horizontal rule comes before the first entry of a new scene.
- A menu is a list of option buttons. Pick one by clicking it, by pressing its number (1 to 9), or by moving to it with the arrow keys and pressing Enter. The picked option stays on the page as a muted line marked ▸, and the others are removed. The number and arrow keys work in the dialogue box's menus too.

Text is typed out with the same timing as the dialogue box, so pauses read as pauses, a click finishes the line, and bold, italic, underline, centring and the wavy and shaky effects all show. Set the typing speed to 0 to show each entry at once.

Pictures and sounds still play on the stage and through the audio channels, and each one also leaves a small muted caption on the page, named after its layer or channel and its asset: "Backdrop: int_subway_aisle", "Portrait: mara_smile", "Music: theme" or "Sound: door_slam". The typewriter's blips get no caption. The page is opaque, so the stage only shows through if a game restyles the page's ground to be see-through.

The page keeps growing across choices and scenes. Restarting the game clears it. Saves and checkpoints keep it, so loading a save shows the page as it was, and a preview or a step back shows the page the game would have at that line.

To start a fresh page, write `[[clear textstream]]`. Every entry is removed, and the line the directive is on becomes the first entry of the new page, typed out like any other:

```sparkdown
  + [Go upstairs.]
    [[clear textstream]] The landing is dark.
```

A clear after a menu is a good place for one, when the next part of the story reads better on its own page. Saves and checkpoints taken after it keep the cleared page. `clear` only works on `textstream`: on any other layout the editor warns "Only textstream has a page to clear." and the game ignores it.

The page follows the newest entry. Scroll up to reread, and it stays where you are until you scroll back to the bottom. Under the reader's reduced-motion setting it jumps instead of scrolling smoothly.

With both `textbox` and `textstream` open, each beat shows in both, and a choice can be picked from either.

The page draws every colour from four styles, so a game re-themes the whole page by redefining them:

| Style | What it colours | Built-in value |
| --- | --- | --- |
| `paper` | The page's ground | `neutral_99` |
| `ink` | The text | `slate_20` |
| `accent` | Speaker names and option buttons | `orange_30` |
| `muted` | Headings, captions and the picked option | `slate_60` |

```sparkdown
style paper {
  background-color = slate_10
}

style ink {
  text-color = slate_95
}
```

The page's other styles, `textstream` (the scrolling page), `textstream_column`, `textstream_action`, `textstream_dialogue`, `textstream_name`, `textstream_heading`, `textstream_rule`, `textstream_options`, `textstream_option`, `textstream_chosen` and `textstream_caption`, can be restyled the same way. The `textstream` layout stacks with `textbox`: above `main`'s `stage` and below `main`'s `screen`.

---

## 6.2 Overlays: `open` and `close`

Any other layout can be shown **on top of** what's already there — a dialog, an inventory panel, a tooltip — with `[[open]]`, and dismissed with `[[close]]`:

```sparkdown
layout inventory {
  column.panel #child-gap=8 {
    text.headline "Inventory"
    -- …
  }
}

scene explore
  You rummage through your pack.
  [[open inventory]]
  -- …later…
  [[close inventory]]
```

`open` mounts and reveals the layout; `close` hides and tears it down (freeing its state). Reopening builds it fresh.

The built-in `loading` and `ending` layouts are engine-managed: `load` opens and closes `loading`, `fin` opens `ending`, navigation never closes either, and neither is recorded in a checkpoint. Keep them out of any `screen`. See [Loading & Preloading](./Loading.md) and [6.5 The ending screen](#65-the-ending-screen).

---

## 6.3 Screens: groups you navigate between

A **screen** is a navigation group — a set of layouts where showing one replaces the others (like the pages of a menu). Define a screen with the `screen` keyword, and put layouts in it with `in <screen>`:

```sparkdown
function start() end

function go_settings() end

function go_back() end

screen menu {
}

layout title in menu {
  column #child-gap=16 {
    text "My Game"
    button "Play" @click=start
    button "Settings" @click=go_settings
  }
}

layout settings in menu {
  column #child-gap=16 {
    text "Settings"
    button "Back" @click=go_back
  }
}
```

> A screen's body is reserved for future screen-level config, so leave it empty for now. Layouts join the screen with `in <screen>`, and referencing a screen you never defined is a compile error, which catches typos.

Move to a layout within a screen with **`[[navigate <screen> to <layout>]]`** — this is full-screen routing: it replaces whatever that screen was showing.

```sparkdown
scene menus
  [[navigate menu to title]]
  -- player clicks Settings →
  [[navigate menu to settings]]
```

**Overlay vs navigate:**

- `open` / `close` — stack a layout on top / take it back off. Good for dialogs, HUD panels, popups.
- `navigate … to …` — switch which layout a screen shows. Good for menu pages and view changes.

---

## 6.4 Transitions

`open`, `close`, and `navigate` all take the same optional clauses, so views can
fade, slide, and time their entrance:

| Clause             | Meaning                                       |
| :----------------- | :-------------------------------------------- |
| `with <animation>` | the transition to play (e.g. `with fade`)     |
| `over <time>`      | how long it takes (`over 1s`, `over 300ms`)   |
| `after <time>`     | delay before it starts (`after 0.2s`)         |
| `ease <ease>`      | the easing curve (`ease ease_out`)            |
| `wait`             | block the story until the transition finishes |

```sparkdown
scene start
  [[open inventory with fade over 0.3s]]
  [[close inventory with fade over 0.2s wait]]
  [[navigate menu to settings with slide over 0.25s ease ease_out]]
end
```

---

## 6.5 The ending screen

When the story ends with `fin`, the engine opens the built-in `ending` layout over the last frame. By default it holds one element, `end_mark`: a small ■ in the corner where the continue arrow (▼) sits while the game waits for a click. Its root is transparent and lets clicks through, so your own layouts stay visible and usable underneath.

```sparkdown
scene start
  Hello.
  fin
end
```

Every other ending holds the last frame without opening the ending screen: a `done` with nothing to return to, the closing `end` of a scene that nothing follows, running off the end of the script, and a runtime error. In each case the ▼ disappears and clicks no longer advance the story, because there is nothing left to show. To give players an ending screen, end the story with `fin`.

Replace the ending screen with your own `layout ending` (an empty one shows nothing), or restyle the default mark with `style end_mark`:

```sparkdown
layout ending {
  column.thanks {
    text "Thanks for playing!"
  }
}

style thanks {
  position = absolute
  inset = 0
  align_items = center
  justify_content = center
  background_color = rgb(0 0 0 / 60%)
}

style end_mark {
  color = sky_60
}
```

While the ending screen is open, `game.ending.active` is `true`, so any layout can react to it through a binding such as `{game.ending.active}`. A checkpoint keeps neither the open ending screen nor `game.ending.active`; it records only how the story ended, so a story that ended with `fin` opens its ending screen again when it resumes from there.

The ending screen opens with the transition named by `ending_transition` in `define ui as config`, which is `"fade"` unless you change it:

```sparkdown
define ui as config with
  ending_transition = "fade"
end
```

Next up: [Styling](./StyleProps.md) — making it all look the way you want.

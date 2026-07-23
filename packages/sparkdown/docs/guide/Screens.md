# 6. Screens & Navigation

So far every example lived in one `layout main`, which shows automatically. Real games often have more than one view — a HUD over the action, a pause menu, a settings page. This page covers how to show, hide, and switch between them.

Navigation directives are written in your **story flow** (the same `[[ … ]]` directives you use for backdrops and sound), so your narrative drives what's on screen.

---

## 6.1 The `main` layout

A layout named `main` is shown from the start — it's your always-on view (the HUD, the world, whatever's persistently visible). You don't have to open it.

```sparkdown
store player = { hp = 8, max_hp = 10, gold = 20 }

layout main with
  row hud #child-gap=12:
    text "Health: {player.hp}/{player.max_hp}"
    text "Gold: {player.gold}"
end
```

---

## 6.2 Overlays: `open` and `close`

Any other layout can be shown **on top of** what's already there — a dialog, an inventory panel, a tooltip — with `[[open]]`, and dismissed with `[[close]]`:

```sparkdown
layout inventory with
  column panel #child-gap=8:
    text title "Inventory"
    -- …
end

scene explore
  You rummage through your pack.
  [[open inventory]]
  -- …later…
  [[close inventory]]
```

`open` mounts and reveals the layout; `close` hides and tears it down (freeing its state). Reopening builds it fresh.

---

## 6.3 Screens: groups you navigate between

A **screen** is a navigation group — a set of layouts where showing one replaces the others (like the pages of a menu). Define a screen with the `screen` keyword, and put layouts in it with `in <screen>`:

```sparkdown
function start()       end
function go_settings() end
function go_back()     end

screen menu with
end

layout title in menu with
  column #child-gap=16:
    text "My Game"
    button "Play"     @click=start
    button "Settings" @click=go_settings
end

layout settings in menu with
  column #child-gap=16:
    text "Settings"
    button "Back" @click=go_back
end
```

> A screen's body is reserved for future screen-level config — leave it empty for
> now (the `with … end` is still required). Layouts join the screen with
> `in <screen>`, and referencing a screen you never defined is a compile error,
> which catches typos.

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
[[open inventory with fade over 0.3s]]
[[close inventory with fade over 0.2s wait]]
[[navigate menu to settings with slide over 0.25s ease ease_out]]
```

Next up: [Styling](./StyleProps.md) — making it all look the way you want.

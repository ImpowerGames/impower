# 2. Basic Concepts

---

## ✏️ Sparkle at a Glance

Here's a quick example of what a Sparkle layout looks like:

```sparkdown
store player = { name = "Hero" }       -- state the UI reads
function start_game()  end             -- the event's handler

layout main with                       -- a layout named main
  column #child-gap=24:                -- an element with a class and a prop
    text "Welcome, {player.name}!"     -- content with an interpolated {value}
    button "Begin" @click=start_game   -- content + an event
end
```

- **Layouts** hold your UI.
- **Elements** create the visible or interactive parts.
- **Classes** (bare words after the element) let `style` blocks target it.
- **Content** (in quotes) is what the player sees.
- **Props** (`#name=value`) customize layout, style, or behavior.
- **Events** (`@name=action`) respond to interactions.

---

## 2.1 Layouts

A **layout** is a tree of UI — a menu, a HUD, a dialog, an inventory panel.

You create one with the `layout` keyword, and everything inside `with … end` is what it displays:

```sparkdown
function start_game()    end
function open_settings() end
function quit_game()     end

layout main with
  column #child-gap=24 #child-align=center:
    text "Feature Creeper"
    button "Start"   @click=start_game
    button "Options" @click=open_settings
    button "Quit"    @click=quit_game
end
```

- **The layout's name** (like `main`) identifies it.
- **A layout named `main` shows automatically** when the game starts. Other layouts are shown on demand — see [Screens & Navigation](./Screens.md).
- **Everything between `with` and `end`** is the element tree.

> Layouts belong to _screens_ (navigation groups). You rarely need to think about screens until you have more than one full-screen view — [Screens & Navigation](./Screens.md) covers that.

---

## 2.2 Elements

**Elements** are the building blocks of a layout.

They're things you can **see** (like `text` and `image`) or **interact with** (like `button` and `field`). You add one just by writing its name:

```sparkdown
button "Press me!"
```

Common built-in elements:

| Element | Purpose |
| :-- | :-- |
| `text`, `stroke` | Display text |
| `image`, `mask` | Display an image |
| `row`, `column`, `box`, `stack`, `overlay` | Lay out and group children |
| `button`, `link` | Clickable controls |
| `field` / `input`, `slider`, `checkbox`, `dropdown` | Interactive widgets (see [Interactive Widgets](./Widgets.md)) |

An element line can carry classes, content, props, events, and children — in that order:

```
<element>[ class …] [ "content" ] [ #prop=value …] [ @event=handler …] [:]
```

A trailing **`:`** opens a child block; the more-indented lines below become its children. Elements with no children omit the `:`.

```sparkdown
column #child-gap=8:     -- has children (note the `:`)
  text "Line one"         -- a child (no children of its own, no `:`)
  text "Line two"
```

---

## 2.3 Content

**Content** is the text (or image source) shown inside an element. You write it in quotes:

```sparkdown
text "A monster approaches!"
button "ATTACK"
image "goblin_portrait"
```

You can **interpolate** dynamic values with `{ }`:

```sparkdown
text "You have {player.hp} HP left!"
text "Level {player.level} — {player.hp}/{player.max_hp}"
```

Sparkle automatically re-renders any interpolated value when your game state changes — no wiring required. (Need a literal brace? Write `{{` or `}}`.)

---

## 2.4 Classes

**Classes** are labels you attach to an element so a `style` block can target it. They're **space-separated bare words** right after the element name:

```sparkdown
button primary         "Save"
text   title           "Inventory"
column panel scrollable:
  text "…"
```

> Classes are separated by **spaces** (The element name itself is also a class, so `style button with …` styles every button.)

A `style` block then targets the class:

```sparkdown
style primary with
  background-color = blue
  text-color = white
end
```

See [Styling](./StyleProps.md) for the full story.

---

## 2.5 Props

**Props** customize how a single element looks or behaves. You write them as `#name=value` after the content:

```sparkdown
button "Play My Theme Song" #text-size=lg #text-color=blue
slider "Volume" #min=0 #max=100 #value={volume}
```

- **Style props** control layout, spacing, colors, text size, and more — the inline equivalent of a `style` rule. See the [Style Props reference](./StyleProps.md).
- **Behavior props** control things like a slider's `#min`/`#max`, a field's `#value`, or a checkbox's `#checked`.

Props are separated by spaces; add as many or as few as you like. If a value contains spaces, quote it:

```sparkdown
field #placeholder="Who are you?"
```

To bind a prop to **dynamic** game state, wrap the value in `{ }` — just like content. It updates automatically:

```sparkdown
row #background-color={team_color}:
  text "Team {team_name}"
```

> Inline props take a leading `#` (`#child-gap=16`). Properties inside a `style` block use `key = value` instead (`child-gap = 16`) — see [Styling](./StyleProps.md).

---

## 2.6 Events

Pretty layouts are nice — but without events, nothing happens.

**Events** let an element **do something** when the player interacts with it. You attach one with `@event=handler`:

```sparkdown
button "Save Progress" @click=save
```

- The **event name** (like `@click`) is the interaction you're responding to.
- The **handler** is what runs.

A handler can take three forms:

```sparkdown
button "Use"   @click=use_item              -- a named function
button "Hit"   @click=take_damage(10)       -- a call with arguments
button "Reset" @click={ score = 0; combo = 0 }  -- an inline block of statements
```

Common events: `@click`, `@input`, `@change`, `@focus`, `@blur`, `@submit`, `@keydown`.

Inside an inline handler (and in a widget's write-back), `event` is in scope — `event.value`, `event.checked`, `event.key`. That's how form controls send input back into your state:

```sparkdown
field #value={name} @input={ name = event.value }
```

_(You'll define what named handlers like `save` do using Sparkdown's narrative flow — the same functions your story logic uses.)_

Next up: [Control Flow](./ControlFlow.md) — making the UI change as state changes.

# 2. Basic Concepts

---

## Sparkle at a glance

Here's a quick example of what a Sparkle layout looks like:

```sparkdown
layout main with -- a layout named main
  column #child-gap=24 { -- an element with a prop, and a block of children
    text "Welcome, {player.name}!" -- an element with an interpolated {value}
    button.start "Begin" @click=start_game -- an element with a class and a bound event
  }
end

store player = { name = "Hero" }

scene start_game()
  You enter the city.
end
```

- **Layouts** hold your UI.
- **Elements** create the visible or interactive parts.
- **Blocks** (`{ … }`) hold an element's children.
- **Classes** (written with a dot, like `.start`) let `style` blocks target an element.
- **Content** (in quotes) is what the player sees.
- **Props** (`#name=value`) customize layout, style, or behavior.
- **Events** (`@name=action`) respond to interactions.

---

## 2.1 Layouts

A **layout** is a tree of UI — a menu, a HUD, a dialog, an inventory panel.

You create one with the `layout` keyword, and everything inside `with … end` is what it displays:

```sparkdown
layout main with
  column #child-gap=24 #child-align=center {
    text "Feature Creeper"
    button "Start" @click=start_game
    button "Options" @click=open_settings
    button "Quit" @click=quit_game
  }
end

function start_game() end

function open_settings() end

function quit_game() end
```

- **The layout's name** (like `main`) identifies it.
- **A layout named `main` shows automatically** when the game starts. Other layouts are shown on demand — see [Screens & Navigation](./Screens.md). A layout named `loading` is the loading screen the `load` arrow shows — see [Loading & Preloading](./Loading.md).
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

| Element                                             | Purpose                                                       |
| :-------------------------------------------------- | :------------------------------------------------------------ |
| `text`, `stroke`                                    | Display text                                                  |
| `image`, `mask`                                     | Display an image                                              |
| `box`, `scroller`                                   | Group (and scroll) children                                   |
| `button`, `link`                                    | Clickable controls                                            |
| `field` / `input`, `slider`, `checkbox`, `dropdown` | Interactive widgets (see [Interactive Widgets](./Widgets.md)) |

Story image directives such as `[[mia]]` can also select a layered portrait's expression, clothes, or props: `[[mia:happy:hat]]`. See [Character Portraits](./Portraits.md) for naming SVG layers, using image-file folders, and defining reusable looks. These directives belong to the story; an `image` element belongs to a UI layout.

### Names and plain containers

The first word of an element names it. A built-in element (`text`, `button`, …) or one of your own [components](./Components.md) does what it always does. Any other name makes a **plain container**: an element that holds its children and is named after what it is.

```sparkdown
layout hud with
  stage {
    toolbar {
      button "Map" @click=open_map
      button "Bag" @click=open_bag
    }
  }
end

function open_map() end

function open_bag() end
```

Here `stage` and `toolbar` are plain containers. A name is also a class, so a `style toolbar` block styles the toolbar (see [Styling](./StyleProps.md)). To give an element more classes, add each with a dot: `button.primary`, `row.hud` (see [Classes](#24-classes)).

> **Layout classes, not elements.** `row`, `column`, `stack`, and `overlay` aren't
> elements — they're built-in **classes** that set how an element arranges its children
> (`row` / `column` lay them out in a line; `stack` / `overlay` layer them). Writing
> `column { … }` makes a plain container named `column`, so it carries the `column`
> class, which is why they read like elements in the examples. Because they're classes,
> they work on _any_ element — `button.column { … }` is a button that stacks its children.

### An element's parts

An element can carry classes, content, props, events, and a block of children — in that order:

```
<element>[.class …] [ "content" ] [ #prop=value …] [ @event=handler …] [ { children } ]
```

Each part has its own section below. Elements with no children have no block.

### Blocks

An element's children go in a **block**: a `{` after the element, then the children, then a `}`.

```sparkdown
column #child-gap=8 {
  text "Line one"
  text "Line two"
}
```

The braces alone decide what belongs to what. Indentation is only layout: it makes the tree easy to read, and the formatter sets it for you, but moving a line left or right never moves it into or out of a block. In the editor, a block folds from its first line to its `}`.

Inside a block, entries are separated by a new line or a `;`. A comma at the end of an entry is accepted and ignored, so a line `text "Line one",` reads as `text "Line one"`. A comma between two entries on one line is an error: `row { text "A", text "B" }` is reported, and `row { text "A"; text "B" }` is what you meant.

Leave a space before a block's `{`. Glued to a prop's value, as in `#child-gap=8{`, it is read as part of the value. You may also write `=` before the `{` (`row = { … }`); it means the same thing, and this guide leaves it out.

### Several elements on one line

A short block can sit on one line. Separate its entries with `;`:

```sparkdown
row.stats { text "HP"; text "{player.hp}"; text "/ {player.max_hp}" }
```

Write a `;` between elements on one line even when they look separate without it.

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

Sparkle automatically re-renders any interpolated value when your game state changes — no wiring required. (Need a literal brace? Escape it: `\{` or `\}`.)

Doubled braces are the **function-call shorthand**: `{{fn}}` calls `fn` and shows its return value — the same as writing `{fn()}` — and `{{fn(args)}}` passes arguments. It works in every place `{ }` interpolation does, including regular story text.

```sparkdown
text "Battle cry: {{shout}}"
text "HP bar: {{render_hp(player.hp)}}"
```

For `image`, the quoted content is the image source. You can also set it with the `#src` prop — handy when the source is dynamic: `image #src={item.icon}`.

---

## 2.4 Classes

**Classes** are labels you attach to an element so a `style` block can target it. Write each one with a dot, right after the element's name:

```sparkdown
button.primary "Save"
text.headline "Inventory"
column.panel.scrollable {
  text "…"
}
```

> The element name itself counts as a class, so `style button with …` styles every button.

A `style` block then targets the class:

```sparkdown
style primary with
  background-color = blue
  text-color = white
end
```

In the editor, renaming a class also renames the `style` of the same name.

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
row #background-color={team_color} {
  text "Team {team_name}"
}
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
button "Use" @click=use_item -- a named function
button "Hit" @click=take_damage(10) -- a call with arguments
button "Reset" @click={ score = 0; combo = 0 } -- an inline block of statements
```

Common events: `@click`, `@input`, `@change`, `@focus`, `@blur`, `@submit`, `@keydown`.

Inside an inline handler (and in a widget's write-back), `event` is in scope — `event.value`, `event.checked`, `event.key`. That's how form controls send input back into your state:

```sparkdown
field #value={name} @input={ name = event.value }
```

_(You'll define what named handlers like `save` do using Sparkdown's narrative flow — the same functions your story logic uses.)_

---

## 2.7 Long elements

An element doesn't have to fit on one line. A line that starts with a `.class`, a `#prop`, an `@event`, or quoted content goes on with the element above it, and the element's `{` may sit on a line of its own:

```sparkdown
store difficulty = "easy"

layout options with
  dropdown
    .wide
    #value={difficulty}
    @change={ difficulty = event.value }
  {
    option "Easy"
    option "Hard"
  }
end
```

Such a line must start the line: after a `;`, a `.class` is not read as part of the element before it.

An inline handler can span lines too. Its statements go between its braces, one per line:

```sparkdown
store score = 0
store combo = 0

layout arcade with
  button "Hit" @click={
    score = score + 10
    combo = combo + 1
  }
end
```

Next up: [Control Flow](./ControlFlow.md) — making the UI change as state changes.

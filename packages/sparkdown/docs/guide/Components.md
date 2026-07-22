# 4. Components

When you find yourself writing the same little cluster of elements over and
over, wrap it in a **component**. A component is a reusable, named piece of UI —
your own element, built from the built-in ones.

---

## 4.1 Defining a component

Use the `component` keyword. Everything between `with` and `end` is the
component's body:

```sparkdown
component divider_line with
  box line
end
```

Then use it anywhere by name, just like a built-in element:

```sparkdown
layout main with
  text "Above"
  divider_line
  text "Below"
end
```

---

## 4.2 Parameters

A component becomes reusable when it takes **parameters** — values the caller
passes in. Declare them in parentheses after the name, and reference them inside
the body like any other value:

```sparkdown
component stat_row(label, value) with
  row stat:
    text caption "{label}"
    text amount "{value}"
end
```

> Class names are ordinary words, but avoid reusing a **built-in element name**
> (like `label`, `box`, or `image`) as a class — `text label` would read as two
> elements. Pick a distinct class (`caption`, `amount`, `panel`).

Call it with arguments in parentheses:

```sparkdown
layout sheet with
  column #gap=4:
    stat_row("Strength", player.str)
    stat_row("Agility",  player.agi)
    stat_row("Health",   "{player.hp}/{player.max_hp}")
end
```

Arguments are evaluated in the **caller's** scope, so they can read the caller's
state (and loop variables). If you pass a reactive value, the component updates
when that value changes:

```sparkdown
for enemy in enemies do
  stat_row(enemy.name, enemy.hp)   -- updates as each enemy's hp changes
end
```

---

## 4.3 Slots

Parameters pass in **values**. To pass in **UI** — children the caller supplies
— use a **slot**. Mark where caller content should land with `slot`, and the
caller's indented children render there:

```sparkdown
component card(title) with
  box card:
    text card_title "{title}"
    slot                       -- caller's children appear here
end

layout sheet with
  card("Inventory"):
    text "10 / 20 slots"       -- fills the card's slot
end
```

### Named slots

A component can expose more than one slot by naming them. The caller targets a
named slot with `fill`:

```sparkdown
component card(title) with
  box card:
    text card_title "{title}"
    slot                       -- the default slot
    slot footer                -- a named slot
end

layout sheet with
  card("Inventory"):
    text "10 / 20 slots"       -- unnamed children fill the default slot
    fill footer:
      button "Sort" @click=sort_bag
end
```

- **`slot`** marks the default slot; **`slot <name>`** marks a named one.
- On the caller side, unnamed children fill the default slot; **`fill <name>:`**
  targets a named slot.
- Slot content is written in the **caller's** scope, so it reads the caller's
  state — not the component's parameters.

Next up: [Interactive Widgets](./Widgets.md) — controls the player can operate.

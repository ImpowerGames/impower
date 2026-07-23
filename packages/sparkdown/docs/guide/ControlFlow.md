# 3. Control Flow

Your UI shouldn't be static. Sparkle's control flow adds and removes elements as
your game state changes — and it does so **reactively**: when the state a
condition or loop depends on changes, that part of the UI updates on its own.

Control flow uses the same keywords as the rest of Sparkdown's logic (`then`,
`do`, `end`), so one mental model spans your story and your UI.

---

## 3.1 `if` / `elseif` / `else`

Show one branch depending on a condition:

```sparkdown
store player = { dead = false, hp = 8 }

layout hud with
  if player.dead then
    text "GAME OVER"
  elseif player.hp < 10 then
    text warning "Low health!"
  else
    text "HP: {player.hp}"
  end
end
```

- The condition is any Luau expression.
- `elseif` and `else` are optional; `end` closes the block.
- When the winning branch changes, the old branch is torn down and the new one
  is mounted — so `if` is how you conditionally show, hide, or swap UI.

---

## 3.2 `for` — loops and lists

Render one copy of a block per item:

```sparkdown
store player = { inventory = { { name = "Potion", icon = "potion" } } }
function use_item(item)  end

layout bag with
  for item in player.inventory do
    row item:
      image #src={item.icon} #width=32 #height=32
      text "{item.name}"
      button "Use" @click=use_item(item)
  else
    text empty "Your bag is empty."
  end
end
```

- **`for <name> in <iterable> do … end`** — one binding names the value.
- **Two bindings** iterate a table as `key, value`:

  ```sparkdown
  for slot, item in equipped do
    text "{slot}: {item.name}"
  end
  ```

- The optional **`else`** renders when the iterable is empty.
- Loop variables (`item`, `slot`) are in scope for everything inside the loop —
  content, props, events, and nested control flow.

### Keyed reconciliation

When the list changes, Sparkle **reuses** the elements for items that stayed,
**removes** the ones that left, and **moves** the ones that were reordered —
instead of rebuilding everything. That preserves focus, scroll position, and
in-progress animations. You get this automatically.

### Numeric `for`

Count with a numeric range (`from, to[, step]`), just like Luau:

```sparkdown
for i = 1, 5 do
  text "Star {i}"
end
```

---

## 3.3 `match` — pick one of many

When you're branching on the value of a single expression, `match` reads more
cleanly than a chain of `elseif`s:

```sparkdown
store player = { class = "knight" }

layout badge with
  match player.class do
  case "knight"
    text "⚔ Knight"
  case "mage"
    text "✦ Mage"
  else
    text "Adventurer"
  end
end
```

- **`match <expr> do  case <value> …  end`** — the first matching `case` wins.
- The optional **`else`** is the default when nothing matches.

---

## 3.4 Nesting

Control-flow blocks nest freely inside each other and inside elements — mix and
match to build exactly the UI your state describes:

```sparkdown
store party = { { name = "Ana", hp = 10 }, { name = "Bo", hp = 0 } }

layout roster with
  column #child-gap=8:
    for member in party do
      row #child-gap=8:
        text "{member.name}"
        if member.hp <= 0 then
          text down "(down)"
        end
    end
end
```

Next up: [Components](./Components.md) — packaging UI you reuse.

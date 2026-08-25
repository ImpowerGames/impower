# 1. Introduction

**Sparkle UI** is how you build your game's interface in Sparkdown — the same language you're already writing your story in. You declare what the UI looks like, and the engine keeps it in sync with your game state.

---

## A quick look

```sparkdown
store hp = 0

layout main with
  column #child-gap=12:
    text "Health: {hp}"
    row #child-gap=8:
      button "- Damage" @click={ hp = hp - 1 }
      button "+ Heal" @click={ hp = hp + 1 }
end
```

Here's what each piece does:

- **State** lives in a `store` variable — here, `hp` starts at `0`.
- **Layouts** hold a tree of UI. A layout named `main` shows automatically.
- **Elements** (`text`, `button`) build the parts; **layout classes** (`row`, `column`) arrange them.
- **Props** (like `#child-gap=12`) fine-tune spacing, size, and style.
- **Interpolation** (`{hp}`) drops a live value straight into your UI.
- **Events** (like `@click`) run code when the player interacts.

It's **reactive by default**: change `hp` — from a button, from your story logic, from anywhere — and every `{hp}` on screen updates itself. No redraw calls, no wiring.

As your UI grows, you'll add **classes** for styling, **components** for reuse,
and **`if` / `for` / `match`** to show and hide UI as state changes — all covered
in the pages ahead.

Next up: [Basic Concepts](./Structure.md) — layouts, elements, classes, content, props, and events.

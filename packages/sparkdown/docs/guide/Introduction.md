# Building Sparkle UI with Sparkdown

## 1. Introduction

### Building Sparkle UI with Sparkdown

**Sparkle UI** is our fast, flexible system for crafting beautiful user interfaces — no complex tools, fiddly editors, or endless setup required.

You create Sparkle UI using the same language you already know: **Sparkdown**.

Sparkdown lets you structure your UI clearly, style it easily, and focus on what matters — while the system handles the heavy lifting.

---

### A Quick Look at Sparkle with Sparkdown

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

- **State** lives in a `store` variable. `hp` starts at `0`.
- **Layouts** hold a tree of UI. A layout named `main` shows automatically.
- **Elements** (`text`, `button`, `row`, `column`) arrange and display your content.
- **Props** (like `#child-gap=12`) fine-tune spacing, size, and style.
- **Interpolation** (`{hp}`) drops a live value straight into your UI.
- **Events** (like `@click`) run code when the player interacts.

It's **reactive by default**.
You never have to tell the counter to redraw.
Simply change `hp`, and every `{hp}` on screen updates itself — no refresh, no re-render call, no wiring. 

As your UI grows, you'll add **classes** for styling, **components** for reuse,
and **`if` / `for` / `match`** to show and hide UI as state changes — all covered
in the pages ahead.

---

### What Comes Next

| #   | Page                     | What you'll learn                                                                   |
| :-- | :----------------------- | :---------------------------------------------------------------------------------- |
| 2   | **Basic Concepts**       | Layouts, elements, classes, content, props, and events.                             |
| 3   | **Control Flow**         | `if` / `for` / `match` to add and remove UI as state changes.                       |
| 4   | **Components**           | Build your own reusable elements, with parameters and slots.                        |
| 5   | **Interactive Widgets**  | Buttons, text fields, sliders, checkboxes, and dropdowns — including two-way input. |
| 6   | **Screens & Navigation** | Group layouts into screens and move between them.                                   |
| 7   | **Styling**              | `style` blocks, selectors, breakpoints, and the full style-prop reference.          |
| 8   | **Animation & Theme**    | Reusable animations and shared design tokens.                                       |

---

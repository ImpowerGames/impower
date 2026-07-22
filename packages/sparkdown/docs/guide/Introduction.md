# Building Sparkle UI with Sparkdown

## 1. Introduction

### Building Sparkle UI with Sparkdown

**Sparkle UI** is our fast, flexible system for crafting beautiful user interfaces — no complex tools, fiddly editors, or endless setup required.

You create Sparkle UI using the same language you already know: **Sparkdown**.

Sparkdown lets you structure your UI clearly, style it easily, and focus on what matters — while the system handles the heavy lifting.

Whether you're building an inventory screen, a dialog box, a settings menu, or a full interface system, Sparkle UI helps your UI shine — with less fuss, and more fun.

---

### The Problem Sparkle Solves

If you've ever tried to build a game UI, you've probably run into something like this:

- **Tools that get in your way.**
  You open a visual editor or markup language, and you're immediately wrestling with layers, anchors, containers, and hidden settings you didn't ask for.

- **Layout that doesn't behave.**
  You just want to line up a few buttons — but instead you're adjusting margins, resizing boxes, or searching forums for fixes.

- **Friction between your idea and the result.**
  You know what you want — but it feels like there's too much distance between writing it and seeing it work.

Sparkle UI is designed to fix that.

---

### What Makes Sparkle Different

| Principle                               | What It Means                                                                      |
| :-------------------------------------- | :--------------------------------------------------------------------------------- |
| **Readable first**                      | Your layout reads like a clear, simple outline.                                    |
| **Structure first, style second**       | You build the shape of your UI before worrying about polish.                       |
| **Reactive by default**                 | Interpolated values re-render themselves when your game state changes — no wiring. |
| **Sensible defaults, powerful control** | You can get great results with no tweaking — or customize deeply when you want to. |
| **Built for games, not websites**       | Sparkle fits game menus, dialogs, inventories, settings — not blog posts.          |
| **Lightweight by design**               | No installs, no compilers — everything works directly in your browser.             |

**Sparkle bridges the gap between your ideas and the screen — fast, focused, and frustration-free.**

---

### A Quick Look at Sparkle with Sparkdown

Here's what building a basic **inventory layout** looks like:

```sparkdown
layout main with
  column panel #gap=16:
    text title "Inventory"

    for item in player.inventory do
      row #gap=8:
        text "{item.name}"
        button "Use" @click=use_item(item)
    else
      text "No items available."
    end

    row #margin-top=24:
      button "Back" @click=go_back
  end
```

- **Layouts** hold a tree of UI. A layout named `main` shows automatically.
- **Elements** (like `text`, `button`, `row`, `column`) organize and lay out your content.
- **Classes** (like `panel` or `title`) are space-separated words after the element name — `style` blocks target them.
- **Props** (like `#gap=16` or `#margin-top=24`) style and fine-tune each element.
- **Events** (like `@click=use_item`) hook into interactivity.
- **Conditionals and loops** (`if`, `for`, `match`) keep your UI dynamic — and update automatically when state changes.

You can read Sparkle Sparkdown almost like a storyboard:
what appears, how it's arranged, and what happens when players interact.

---

### What Comes Next

This guide walks through the whole system, one step at a time:

| # | Page | What you'll learn |
| :-- | :-- | :-- |
| 2 | **Basic Concepts** | Layouts, elements, classes, content, props, and events. |
| 3 | **Control Flow** | `if` / `for` / `match` to add and remove UI as state changes. |
| 4 | **Components** | Build your own reusable elements, with parameters and slots. |
| 5 | **Interactive Widgets** | Buttons, text fields, sliders, checkboxes, and dropdowns — including two-way input. |
| 6 | **Screens & Navigation** | Group layouts into screens and move between them. |
| 7 | **Styling** | `style` blocks, selectors, breakpoints, and the full style-prop reference. |
| 8 | **Animation & Theme** | Reusable animations and shared design tokens. |

Ready?
Let's dive in.

---

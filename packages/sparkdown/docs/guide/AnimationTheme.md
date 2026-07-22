# 8. Animation & Theme

The last two building blocks are **animations** (movement) and **themes**
(shared design values). Both are static authoring config — you define them once
and refer to them by name.

---

## 8.1 Using animations

The quickest way to animate is to reference a named animation in a **transition
clause** when you open, close, or navigate a view (see
[Screens & Navigation](./Screens.md)):

```sparkdown
[[open inventory with fade over 0.3s]]
[[navigate menu to settings with slide over 0.25s ease ease_out]]
```

Built-in animations you can use out of the box include `fade`, `slide`, `shake`,
`wavy`, `wave`, `spin`, `bounce`, and `ping`, plus the structural
`show` / `hide` / `align_left` / `align_center` / `align_right`.

You can also apply an animation to an element through the `animation` style prop
(see the **Animation Utilities** table in [Styling](./StyleProps.md)):

```sparkdown
text "New!" #animation="0.5s infinite bounce"
```

---

## 8.2 Defining your own animation

Use the `animation` keyword. An animation has **keyframes** (a list of states to
move through) and **timing** (how it plays):

```sparkdown
animation pulse with
  keyframes:
    -
      scale = "1"
    -
      scale = "1.1"
    -
      scale = "1"
  timing:
    duration = 0.4
    easing = "ease-in-out"
    iterations = 1
    fill = "both"
end
```

- **`keyframes:`** is a list — each `-` is one keyframe carrying style props
  (`opacity`, `scale`, `translate`, `background-position`, …).
- **`timing:`** controls `duration`, `delay`, `easing`, `iterations`,
  `direction`, and `fill`.
- Refer to it by name (`pulse`) in a transition clause or the `animation` prop.

---

## 8.3 Theme

A **theme** collects shared design values — colors, sizes, spacing — in one
place, so your UI stays consistent and is easy to re-skin. It's static config:
define it with the `theme` keyword and reference its values from your styles.

```sparkdown
theme default with
  -- shared design tokens
end
```

> Theming is an advanced, evolving area. For most UIs you'll get far with
> `style` blocks and the built-in colors — reach for a custom `theme` when you
> want one source of truth for a whole game's look.

---

## You've got the whole picture

That's the Sparkle UI system end to end:

- **[Basic Concepts](./Structure.md)** — layouts, elements, classes, content, props, events
- **[Control Flow](./ControlFlow.md)** — `if` / `for` / `match`
- **[Components](./Components.md)** — reusable UI with parameters and slots
- **[Interactive Widgets](./Widgets.md)** — buttons, fields, sliders, checkboxes, dropdowns
- **[Screens & Navigation](./Screens.md)** — `open` / `close` / `navigate`
- **[Styling](./StyleProps.md)** — `style` blocks and the full prop reference
- **Animation & Theme** — movement and shared design values

Structure first, style second, and let the engine keep it in sync with your game.

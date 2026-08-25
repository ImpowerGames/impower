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

Built-in animations: `fade`, `slide`, `shake`,
`wavy`, `wave`, `spin`, `bounce`, and `ping`, plus the structural
`show` / `hide` / `align_left` / `align_center` / `align_right`.

You can also apply an animation to an element through the `animation` style prop
(see the **Animation** table in [Styling](./StyleProps.md#animation)):

```sparkdown
text "New!" #animation=bounce #animation-duration=0.5s #animation-iterations=infinite
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
theme dusk with
  color = #112233
  radius = 8px
end
```

<!-- TODO(docs): how styles reference theme values isn't documented yet — add it once settled. -->

> Theme bodies are `key = value` pairs, like `style` blocks. How styles reference
> those values isn't documented yet. For most UIs you'll get far with `style`
> blocks and the built-in colors — reach for a custom `theme` when you want a
> whole game's look defined in one place.

---

That's the whole system. Structure first, style second, and let the engine keep
it in sync with your game.

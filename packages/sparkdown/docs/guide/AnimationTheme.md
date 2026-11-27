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
scene start
  [[open inventory with fade over 0.3s]]
  [[navigate menu to settings with slide over 0.25s ease ease_out]]
end
```

Built-in animations: `fade`, `slide`, `shake`,
`wavy`, `wave`, `spin`, `bounce`, and `ping`, plus the structural
`show` / `hide`.

### Several animations at once

An `animate`, `show` or `hide` line, and the bare picture shorthand, takes any
number of `with` clauses. They all start with the line and run together:

```sparkdown
scene start
  [[animate portrait with shake over 1s with spin over 5s ease linear]]
  [[animate portrait with shake loop with spin over 2s once]]
end
```

The first line shakes the portrait for one second while it turns once every five
seconds at a steady pace. The second shakes it without end while it makes a
single turn over two seconds.

Which `with` a clause belongs to:

- `over`, `after`, `ease`, `loop` and `once` written after a `with` belong to
  that `with`, up to the next `with` or the end of the line.
- The same words written before the first `with` belong to the line itself.
  `over`, `after` and `ease` time the line's own motion, such as the travel of
  `to` (see [Framings](./Framings.md#193-travelling-to-a-framing)). `loop` and
  `once` there belong to a video the line shows.
- `at`, `to`, `morph`, `wait`, `mute`, `unmute` and `now` belong to the line
  wherever they are written.
- A clause word written twice for one owner keeps the later value.

Timing that is not written is borrowed:

- A `with` that has no `over` takes the line's. The same holds for `after` and
  `ease`.
- A line that has none of `over`, `after` and `ease` of its own takes all three
  from the first `with`. A line that has any of them borrows none.
- A `with` never borrows from another `with`.

So `[[animate portrait over 2s with shake with spin over 5s]]` shakes for two
seconds and turns over five.

`loop` after a `with` repeats that animation without end, and `once` plays it
through one time, whatever its definition says. One definition then serves a
single play and a continuous one: `with shake` and `with shake loop`. `loop` and
`once` are never borrowed. On a `with` that names a transition, they apply to
every animation the transition runs.

`wait` holds the story until the last of them has ended: the line's own motion
and every `with`, each counted as its `after` plus its length. A `with` that
repeats counts one pass.

When two `with` clauses on a line set the same property, the later one wins while
both run. `[[animate portrait with shake with pulse]]` shows both, because
`shake` moves the portrait and `pulse` changes its opacity.

A `with` names a transition or an animation, and one line can mix them. Each
`with` plays as it would if it were the line's only `with`:

```sparkdown
scene start
  [[show portrait hero with fade over 0.5s with shake over 2s]]
  [[hide portrait with fade over 1s with spin over 1s once]]
  [[show portrait mia with screenfade over 1s with shake]]
end
```

- A transition gives the arriving picture its `on_show` animation and the
  picture leaving its `on_hide` animation, both stretched to that `with`'s
  `over`. Its other parts, such as the `screen` pulse of `screenfade`, play on
  their own layers.
- An animation that is not a transition plays on both pictures: the one arriving
  and the one it replaces.

So the first line fades the hero in over half a second while it shakes for two,
and the portrait it replaces fades out while it shakes. The second fades the
portrait out while it makes one turn. A picture that leaves is removed once the
longest of its animations has ended.

`open`, `close` and `navigate` play only the last `with` on their line. `load`,
`play` and sound lines take one `with`, and a second is reported.

Pan and zoom are framings, not animations: see [Framings](./Framings.md). An
animation is for an effect that plays and returns to rest, such as `shake`. A
framing is a place the view of a layer's picture stays, so you show a picture
`at` one and move it `to` another:

```sparkdown
scene start
  [[show backdrop bg_apartment at right]]
  [[animate backdrop to left over 5s]]
  The view pans across the room.
end
```

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
animation pulse {
  keyframes {
    { scale = "1" }
    { scale = "1.1" }
    { scale = "1" }
  }
  timing {
    duration = 0.4
    easing = "ease-in-out"
    iterations = 1
    fill = "both"
  }
}
```

- **`keyframes { … }`** is a list. A list's entries are bare: they have no
  name before them. Here each entry is a block, `{ … }`, holding one keyframe's
  style props (`opacity`, `scale`, `translate`, `background-position`, …).
- **`timing { … }`** controls `duration`, `delay`, `easing`, `iterations`,
  `direction`, and `fill`.
- As in any block, entries are separated by a new line or a `;` (see
  [Blocks](./Structure.md#blocks)).
- Refer to it by name (`pulse`) in a transition clause or the `animation` prop.

### Writing keyframes by position

A keyframe's place in the animation can be written as the header of its block
instead of as an `offset` property inside it. Write `from` for the start, `to`
for the end, or a percentage for anywhere in between:

```sparkdown
animation fade {
  keyframes {
    from { opacity = "0" }
    40% { opacity = "1" }
    to { opacity = "0" }
  }
  timing { duration = 0.4 }
}
```

That block means exactly the same thing as the list with explicit offsets:

```sparkdown
animation fade {
  keyframes {
    { offset = 0; opacity = "0" }
    { offset = 0.4; opacity = "1" }
    { offset = 1; opacity = "0" }
  }
  timing { duration = 0.4 }
}
```

- `from` is `0%` and `to` is `100%`; a percentage becomes the matching
  `offset` (`40%` is `offset = 0.4`).
- Positions may be written in any order — the keyframes are sorted by
  position, so a block that starts with `to { … }` still plays last.
- Pick one form per block. Mixing position headers with bare `{ … }` entries,
  repeating a position, or writing a position outside `0%` to `100%` is
  reported as an error.

To make a layered portrait move between its drawn states, such as a blink, write a `morph` rather than an animation: see [Portrait Morphs](./PortraitMorphs.md).

---

## 8.3 Theme

A **theme** collects shared design values — colors, sizes, spacing — in one
place, so your UI stays consistent and is easy to re-skin. It's static config:
define it with the `theme` keyword and reference its values from your styles.

```sparkdown
theme dusk {
  color = #112233
  radius = 8px
}
```

<!-- TODO(docs): how styles reference theme values isn't documented yet — add it once settled. -->

> Theme bodies are `key = value` pairs, like `style` blocks. How styles reference
> those values isn't documented yet. For most UIs you'll get far with `style`
> blocks and the built-in colors — reach for a custom `theme` when you want a
> whole game's look defined in one place.

---

That's the whole system. Structure first, style second, and let the engine keep
it in sync with your game.

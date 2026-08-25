# Sparkle UI Guide

Build game UI — menus, HUDs, dialogs, inventory panels — in Sparkdown, the same language you write your story in.

Read in order:

1. **[Introduction](./Introduction.md)** — what Sparkle is and why.
2. **[Basic Concepts](./Structure.md)** — layouts, elements, classes, content, props, events.
3. **[Control Flow](./ControlFlow.md)** — `if` / `for` / `match` for dynamic UI.
4. **[Components](./Components.md)** — reusable UI with parameters and slots.
5. **[Interactive Widgets](./Widgets.md)** — buttons, fields, sliders, checkboxes, dropdowns.
6. **[Screens & Navigation](./Screens.md)** — `open` / `close` / `navigate`.
7. **[Styling](./StyleProps.md)** — `style` blocks, selectors, breakpoints, and the full style-prop reference.
8. **[Animation & Theme](./AnimationTheme.md)** — movement and shared design values.

> Syntax at a glance: element lines are `element [ classes ] [ "content" ] [ #prop=value ] [ @event=handler ] [:]`; classes are **space-separated**; inline props take a **`#`**; blocks are `keyword name with … end`; control flow uses `then` / `do` / `end`.

---

_For the engine/design specification (audience: contributors), see
[`docs/sparkle/reactive-sparkle-spec.md`](../../../../docs/sparkle/reactive-sparkle-spec.md)._

# Sparkle UI Guide

Build game UI — menus, HUDs, dialogs, inventory panels — in Sparkdown, the same language you write your story in.

Read in order:

1. **[Introduction](./Introduction.md)** — what Sparkle is and why.
2. **[Basic Concepts](./Structure.md)** — layouts, elements, blocks, classes, content, props, events.
3. **[Control Flow](./ControlFlow.md)** — `if` / `for` / `match` for dynamic UI.
4. **[Components](./Components.md)** — reusable UI with parameters and slots.
5. **[Interactive Widgets](./Widgets.md)** — buttons, fields, sliders, checkboxes, dropdowns.
6. **[Screens & Navigation](./Screens.md)** — `open` / `close` / `navigate`.
7. **[Styling](./StyleProps.md)** — `style` blocks, selectors, breakpoints, and the full style-prop reference.
8. **[Animation & Theme](./AnimationTheme.md)** — movement and shared design values.
9. **[Loading & Preloading](./Loading.md)** — what loads ahead of need, the `load` arrow, and the loading screen.
10. **[Character Portraits](./Portraits.md)** — layered portraits and backgrounds, attributes, named looks, and image-file layers.
11. **[Previewing Suggestions](./SuggestionPreview.md)** — the Game Preview shows an autocomplete suggestion before you accept it.
12. **[Type Checking](./TypeChecking.md)** — warnings about the types in your Luau, and how strict they are.

> Syntax at a glance: an element is `element[.class …] [ "content" ] [ #prop=value ] [ @event=handler ] [ { children } ]`; each class takes a **`.`**; inline props take a **`#`**; an element's children, a style's nested rules and an animation's keyframes go in **`{ … }`** blocks, whose entries are separated by a new line or **`;`**; declarations are `keyword name with … end`; control flow uses `then` / `do` / `end`.

---

_For the engine/design specification (audience: contributors), see
[`docs/sparkle/reactive-sparkle-spec.md`](../../../../docs/sparkle/reactive-sparkle-spec.md)._

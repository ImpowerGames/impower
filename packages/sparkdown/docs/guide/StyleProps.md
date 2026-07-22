# 7. Styling

You style Sparkle UI with the same props two ways: **inline** on a single
element, or in a reusable **`style` block**. This page explains both, then lists
every built-in style prop you can use.

## Inline props

Put a prop right on an element with a leading `#`. This is the quick, one-off
way — great for a single tweak:

```sparkdown
button "Save" #text-color=white #background-color=blue
```

Inline props can be **dynamic** — wrap the value in `{ }` to bind it to state,
and it re-applies when that state changes:

```sparkdown
row #background-color={team_color}:
  text "…"
```

## `style` blocks

When you want a look you reuse, define a `style` block. Its properties use
`key = value` (with spaces around `=`, and **no** `#`):

```sparkdown
style blue with
  text-color = white
  background-color = blue
end
```

A style block targets elements by **name**: any element carrying that name as a
class (or as its tag) gets the style.

```sparkdown
style panel with          -- applies to any element with the `panel` class
  background-color = rgb(0 0 0 / 40%)
  border-radius = 8px
  padding = 16px
end

style button with         -- the tag is a class too, so this styles EVERY button
  cursor = pointer
end

layout main with
  column panel:           -- gets the `panel` style
    button "OK"           -- gets the `button` style
end
```

### Nested selectors, breakpoints & states

Inside a `style` block you can nest rules that target descendants, screen sizes,
and interaction states:

```sparkdown
style dialogue with
  height = 100%
  > text:                 -- direct child `text`
    color = black
  >> image:               -- any descendant `image`
    opacity = 0.5
  @screen-size(sm):       -- responsive: at the `sm` breakpoint and below
    width = 100%
  @hovered:               -- on hover
    background-color = black
end
```

- `> selector:` targets a direct child; `>> selector:` targets any descendant.
- `@screen-size(xs|sm|md|lg|xl):` is a responsive breakpoint.
- `@hovered:` / `@focused:` / `@pressed:` / `@checked:` / `@disabled:` target
  interaction states.

> **Inline vs block:** inline props take a `#` and can be dynamic (`#gap={n}`);
> `style`-block properties use `key = value` and are evaluated once. For a value
> that changes per frame, use an inline `#prop={expr}` or toggle a class.

---

### 🧭 Quick Tips For How to Read These Tables

> #### 🔤 Prop Name
>
> - Some props have **short aliases** like `w` for `width` or `bg-color` for `background-color`. You can use either form.

> #### 🎯 Supported Values
>
> - The first value listed is the **default**.  
>   If the first value is `<number>`, `<length>`, or `<time>`, the default is `0`.
> - Keyword values appear as is. For example: `auto`, `bold`.
> - Data-types appear between angle brackets. For example: `<length>`, `<color>`.
>   (You can find a full list of data-types and their syntax at the end of this page → [Data-Type Syntax](#))

---

## 👁️ Appearance Utilities

These utilities help you control how elements appear on screen.

| Prop Name   | What it does                                                           | Supported Values     |
| ----------- | ---------------------------------------------------------------------- | -------------------- |
| `displayed` | Controls if the element is displayed (and takes up space).             | `true`, `false`      |
| `visible`   | Controls if the element is visible or invisible.                       | `true`, `false`      |
| `overflow`  | Controls if content should overflow or be clipped to its bounding box. | `true`, `false`      |
| `opacity`   | Controls how transparent the element is.                               | `1`, `0`, `<number>` |

> 💡 Setting `visible` to `false` hides the element, but still reserves space for it. To remove it entirely from the layout so that no space is reserved for it, set `displayed` to `false` instead.

---

## ☐ Margin Utilities

These utilities let you control the spacing around the exterior of an element.

| Prop Name              | What it does                                                    | Supported Values   |
| ---------------------- | --------------------------------------------------------------- | ------------------ |
| `margin`, `m`          | Sets the space _outside_ an element, separating it from others. | `<length>`, `auto` |
| `margin-top`, `m-t`    | Sets the margin above the element.                              | `<length>`, `auto` |
| `margin-right`, `m-r`  | Sets the margin to the right of the element.                    | `<length>`, `auto` |
| `margin-bottom`, `m-b` | Sets the margin below the element.                              | `<length>`, `auto` |
| `margin-left`, `m-l`   | Sets the margin to the left of the element.                     | `<length>`, `auto` |

> 💡 Multi-value shorthand can be used for `margin` and `m`:
>
> - `8px` → all sides
> - `8px 4px` → top/bottom and left/right
> - `8px 4px 2px 1px` → top, right, bottom, left (clockwise)

---

## ☐ Padding Utilities

These utilities let you control the spacing around the interior of an element.

| Prop Name               | What it does                                                    | Supported Values |
| ----------------------- | --------------------------------------------------------------- | ---------------- |
| `padding`, `p`          | Sets the space _inside_ an element, between content and border. | `<length>`       |
| `padding-top`, `p-t`    | Sets the padding above the content.                             | `<length>`       |
| `padding-right`, `p-r`  | Sets the padding to the right of the content.                   | `<length>`       |
| `padding-bottom`, `p-b` | Sets the padding below the content.                             | `<length>`       |
| `padding-left`, `p-l`   | Sets the padding to the left of the content.                    | `<length>`       |

> 💡 Multi-value shorthand can be used for `padding` and `p`:
>
> - `8px` → all sides
> - `8px 4px` → top/bottom and left/right
> - `8px 4px 2px 1px` → top, right, bottom, left (clockwise)

---

## ↔️ Dimension Utilities

These utilities help you control an element's size.

| Prop Name             | What it does                                                          | Supported Values                   |
| --------------------- | --------------------------------------------------------------------- | ---------------------------------- |
| `width`, `w`          | Sets how much horizontal space an element takes up by default.        | `auto`, `<length>`, `<percentage>` |
| `width-min`, `w-min`  | Sets the minimum amount of horizontal space the element will take up. | `none`, `<length>`, `<percentage>` |
| `width-max`, `w-max`  | Sets the maximum amount of horizontal space the element will take up. | `none`, `<length>`, `<percentage>` |
| `height`, `h`         | Sets how much vertical space an element takes up by default.          | `auto`, `<length>`, `<percentage>` |
| `height-min`, `h-min` | Sets the minimum amount of vertical space the element will take up.   | `none`, `<length>`, `<percentage>` |
| `height-max`, `h-max` | Sets the maximum amount of vertical space the element will take up.   | `none`, `<length>`, `<percentage>` |

> 💡 Using percentage values for width and height make an element take up that percentage of their parent's width and height respectively.

> 💡 By default, width and height include the size of the content, padding, and border, but does not include the margin.

---

## ⏹️ Border Utilities

These utilities help you style the border around an element.

| Prop Name                          | What it does                                         | Supported Values |
| ---------------------------------- | ---------------------------------------------------- | ---------------- |
| `border-width`, `b-width`          | Sets the width of the element’s border on all sides. | `<length>`       |
| `border-width-top`, `b-width-t`    | Sets the width of the top border.                    | `<length>`       |
| `border-width-right`, `b-width-r`  | Sets the width of the right border.                  | `<length>`       |
| `border-width-bottom`, `b-width-b` | Sets the width of the bottom border.                 | `<length>`       |
| `border-width-left`, `b-width-l`   | Sets the width of the left border.                   | `<length>`       |
| `border-color`, `b-color`          | Sets the border color on all sides.                  | `<color>`        |
| `border-color-top`, `b-color-t`    | Sets the top border color.                           | `<color>`        |
| `border-color-right`, `b-color-r`  | Sets the right border color.                         | `<color>`        |
| `border-color-bottom`, `b-color-b` | Sets the bottom border color.                        | `<color>`        |
| `border-color-left`, `b-color-l`   | Sets the left border color.                          | `<color>`        |

> 💡 Multi-value shorthand can be used for `border-width`:
>
> - `8px` → all sides
> - `8px 4px` → top/bottom and left/right
> - `8px 4px 2px 1px` → top, right, bottom, left (clockwise)

> 💡 An element's border takes up space, contributing to an element's width and height. If you wish to outline an element without the outline taking up space, use the `ring` or `shadow` utility props instead.

---

## 🟡 Corner Utilities

These utilities help you style the shape of an element's corners.

| Prop Name                     | What it does                         | Supported Values             |
| ----------------------------- | ------------------------------------ | ---------------------------- |
| `corner`, `c`                 | Rounds all corners equally.          | `<length>`, `pill`, `circle` |
| `corner-top-left`, `c-tl`     | Rounds just the top-left corner.     | `<length>`, `pill`, `circle` |
| `corner-top-right`, `c-tr`    | Rounds just the top-right corner.    | `<length>`, `pill`, `circle` |
| `corner-bottom-left`, `c-bl`  | Rounds just the bottom-left corner.  | `<length>`, `pill`, `circle` |
| `corner-bottom-right`, `c-br` | Rounds just the bottom-right corner. | `<length>`, `pill`, `circle` |

> 💡 Set `corner` to `circle` to make the element a perfect circle.

> 💡 Set `corner` to `pill` to make the element pill-shaped.

> 💡 Multi-value shorthand can be used for `corner`:
>
> - `8px` → all corners
> - `8px 4px` → top-left/top-right and bottom-right/bottom-left
> - `8px 4px 2px 1px` → top-left, top-right, bottom-right, bottom-left (clockwise from top-left)

---

## 📐 Position Utilities

These utilities help you control how elements are positioned relative to other elements.

| Prop Name              | What it does                                                 | Supported Values                   |
| ---------------------- | ------------------------------------------------------------ | ---------------------------------- |
| `position`             | Sets whether or not an element takes up space in the layout. | `relative`, `absolute`             |
| `anchor`, `a`          | Anchors the element to its parent from all four sides.       | `auto`, `<length>`, `<percentage>` |
| `anchor-top`, `a-t`    | Anchors the top of the element to its parent.                | `auto`, `<length>`, `<percentage>` |
| `anchor-right`, `a-r`  | Anchors the right side of the element to its parent.         | `auto`, `<length>`, `<percentage>` |
| `anchor-bottom`, `a-b` | Anchors the bottom of the element to its parent.             | `auto`, `<length>`, `<percentage>` |
| `anchor-left`, `a-l`   | Anchors the left side of the element to its parent.          | `auto`, `<length>`, `<percentage>` |

> 💡 Set `position` to `absolute` to remove an element from the layout flow entirely (so it takes up no space in the layout).

> 💡 `anchor` supports multi-value shorthand:
>
> - `8px` sets all sides to 8px.
> - `8px 4px` sets top and bottom to 8px, and sets left and right to 4px.
> - `8px 4px 2px 1px` sets top to 8px, right to 4px, bottom to 2px, left to 1px (clockwise order).
> - Use `auto` to skip anchoring a side.
>   For example, `0 0 auto 0` anchors the element to the top, right, and left sides of its parent, but leaves the bottom unanchored.

> 💡 When using percentages, the direction matters:
>
> - `anchor-top` and `anchor-bottom` use a percentage of the element’s height
> - `anchor-left` and `anchor-right` use a percentage of the element’s width

---

## 🧱 Layout Utilities

These utilities help you control how element's children are arranged.

| Prop Name        | What it does                                                                                    | Supported Values                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `child-layout`   | Arranges the children of this element into a row or column.                                     | `column`, `row`                                                    |
| `child-gap`      | Sets the space between children.                                                                | `<length>`                                                         |
| `child-align`    | Aligns children vertically inside a row or horizontally inside a column.                        | `stretch`, `start`, `end`, `center`                                |
| `child-justify`  | Aligns children horizontally inside a row or vertically inside a column.                        | `start`, `end`, `center`, `stretch`, `between`, `around`, `evenly` |
| `child-overflow` | Controls whether or not children will wrap when there isn't enough space.                       | `nowrap`, `wrap`, `wrap-reverse`                                   |
| `align`          | Aligns this element among its siblings.                                                         | `start`, `end`,`center`,                                           |
| `grow`           | Controls how much this element should grow relative to siblings.                                | `0`, `1`, `<number>`                                               |
| `shrink`         | Controls how much this element should shrink relative to its siblings.                          | `1`, `0`, `<number>`                                               |
| `basis`          | Sets this element’s initial size before `grow` or `shrink` is applied.                          | `auto`, `0`, `<length>`                                            |
| `order`          | Controls where this element should appear relative to its siblings (sorted in ascending order). | `<number>`                                                         |

> 💡 `grow`, `shrink`, and `basis` work together to control how elements flexibly share space:
>
> - `grow` determines **how much the element should expand** to fill extra space.
>   - Set `grow` to `1` to make the element grow to fill available space.
> - `shrink` controls **how much it can shrink** when there’s not enough space.
>   - Set `shrink` to `0` to prevent the element from shrinking when there isn't enough space.
> - `basis` sets the **initial size** the element _tries to be_ before growing or shrinking.
>   - `auto` → size is based on the content (or `width`/`height` if set)
>   - `0` → starts at zero and grows only when needed
>   - `100px` → starts at 100px even if content is smaller

---

## ✍️ Text Utilities

These utilities control how text looks — its font, size, spacing, alignment, decoration, and more.

| Prop Name                   | What it does                                                      | Supported Values                       |
| --------------------------- | ----------------------------------------------------------------- | -------------------------------------- |
| `text-font`                 | Sets which font family to use.                                    | `sans`, `serif`, `mono`, `<font-name>` |
| `text-color`                | Sets the color of the text.                                       | `<color>`                              |
| `text-size`                 | Controls how large the text appears.                              | `<length>`                             |
| `text-leading`              | Controls the vertical spacing between lines of text.              | `normal`, `<number>`, `none`           |
| `text-tracking`             | Adjusts the spacing between individual letters.                   | `<length>`                             |
| `text-align`                | Aligns text inside its container.                                 | `left`, `center`, `right`, `justify`   |
| `text-overflow`             | Handles how text behaves when it’s too long to fit.               | `clip`, `wrap`, `ellipsis`, `visible`  |
| `text-weight`               | Determines if the text is bold or not.                            | `normal`, `bold`                       |
| `text-style`                | Determines if the text is italic or not.                          | `normal`, `italic`                     |
| `text-stroke`               | Adds an outline (stroke) around the text.                         | `<length>`, `<length> <color>`         |
| `text-decoration-line`      | Adds underlines or strikethroughs.                                | `none`, `underline`, `strikethrough`   |
| `text-decoration-color`     | Sets the color of the underline or strikethrough.                 | `<color>`                              |
| `text-decoration-thickness` | Sets the thickness of the underline or strikethrough.             | `<length>`                             |
| `text-underline-offset`     | Adjusts how far below the text the underline appears.             | `<length>`                             |
| `text-direction`            | Determines whether text is written left-to-right or right-to-left | `auto`, `ltr`, `rtl`                   |

> 💡 When using `ellipsis` for `text-overflow`, make sure the element has `overflow` set to `false` and a fixed width (not `auto`).

---

## 🌄 Background Utilities

These utilities control how elements are visually filled — using solid colors or background images.

| Prop Name                        | What it does                                           | Supported Values                                                                                          |
| -------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `background-color`, `bg-color`   | Sets the background color of the element.              | `<color>`                                                                                                 |
| `background-image`, `bg-image`   | Displays an image behind the element.                  | `none`, `<asset-name>`                                                                                    |
| `background-repeat`, `bg-repeat` | Controls if the background image should tile (repeat). | `repeat`, `no-repeat`                                                                                     |
| `background-align`, `bg-align`   | Sets the starting position of the background image.    | `center`, `top`, `left`, `right`, `bottom`                                                                |
| `background-fit`, `bg-fit`       | Scales the background image to fit inside the element. | `cover`, `fill`, `contain`, `auto`, `<percentage> <percentage>`, `auto <percentage>`, `<percentage> auto` |

> 💡 `background-fit` controls how the image scales:
>
> - `cover` fills the element, cropping if needed
> - `fill` stretches to fit (may distort)
> - `contain` keeps the image fully visible
> - `auto` uses the image’s original size
> - `auto 100%` contains the image vertically (useful if the image will be panned left or right)
> - `100% auto` contains the image horizontally (useful if the image will be panned up or down)

---

## ✨ Effect Utilities

These utilities add visual flair — shadows, blur, transparency, outlines, and more.

| Prop Name         | What it does                                                   | Supported Values                                                                                                                                                                                                                                                          |
| ----------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shadow`          | Adds a soft shadow behind the element.                         | `none`, `<number>`, `<length> <length> <length> <length> <color>`                                                                                                                                                                                                         |
| `glow`            | Adds a soft glow around the element.                           | `none`, `<length> <color>`                                                                                                                                                                                                                                                |
| `ring`            | Adds a solid ring around the element.                          | `none`, `<length> <color>`                                                                                                                                                                                                                                                |
| `mask`            | Applies a mask shape to the element.                           | `none`, `<asset-name>`                                                                                                                                                                                                                                                    |
| `blend`           | Sets how this element blends with what’s underneath.           | `normal`, `plus-lighter`, `plus-darker`, `multiply`, `screen`, `overlay`, `darken`, `lighten`, `color-dodge`, `color-burn`, `hard-light`, `soft-light`, `difference`, `exclusion`, `hue`, `saturation`, `color`, `luminosity`                                             |
| `filter`          | Applies a visual filter effect (e.g. blur, grayscale).         | `blur(<length>)`, `brightness(<number>)`, `contrast(<percentage>)`, `grayscale(<percentage>)`, `hue-rotate(<angle>)`, `invert(<percentage>)`, `opacity(<percentage>)`, `saturate(<percentage>)`, `sepia(<percentage>)`, `drop-shadow(<length> <length> <length> <color>)` |
| `backdrop-filter` | Applies filter effects to the background _behind_ the element. | Same as `filter`                                                                                                                                                                                                                                                          |

> 💡 `shadow` uses pre-defined levels (`1`, `2`, `3`, etc.) or a full specification of `<offset-x> <offset-y> <blur-radius> <spread-radius> <color>`. You can specify multiple shadows by separating them with commas like so: `3px 3px 3px 3px red, 4px 4px 4px 4px green`

> 💡 `glow` acts like a soft outline and is defined by specifying a blur-radius and color like so: `4px blue`. (It is shorthand for specifying a single shadow with no offset and no spread-radius)

> 💡 `ring` acts like a solid outline and is defined by specifying a spread-radius and color like so: `4px blue`. (It is shorthand for specifying a single shadow with no offset and no blur-radius)

> 💡 `filter` and `backdrop-filter` accepts a space-separated list of built-in filters like:
> `brightness(3%) contrast(175%) saturate(30%)`.

> 💡 `blend` controls how an element's colors interact with what's beneath it (like layer blend modes in an image editing program).
>
> - `plus-lighter` is the default blend mode for images and allows two similar images to smoothly crossfade between each other without the background leaking through.

> 💡 `mask` can be used to create non-rectangular shapes or image-based reveals.

---

## 🔄 Transform Utilities

These utilities let you move, rotate, scale, and set the anchor point for transformations — great for animations or transitions.

| Prop Name   | What it does                                                    | Supported Values                                                                                                               |
| ----------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `translate` | Moves the element along the X or Y axes.                        | `0 0`, `<length> <length>`, `<percentage> <percentage>`                                                                        |
| `rotate`    | Rotates the element clockwise around its pivot point.           | `0`, `<angle>`                                                                                                                 |
| `scale`     | Scales the size of the element along the X or Y axes.           | `1`, `<number>`, `<number> <number>`                                                                                           |
| `skew`      | Skews element along the X or Y axes.                            | `0 0`, `<angle> <angle>`                                                                                                       |
| `pivot`     | Sets the origin point for `rotate` and `scale` transformations. | `center`, `<length> <length>`, `<percentage> <percentage>`, `top left`, `bottom right`, `top`, `left`, `bottom`, `right`, etc. |

> 💡 `translate`, `rotate`, `scale`, and `skew` do **not** affect layout flow — they visually change an element’s appearance without moving surrounding elements.

> 💡 When using percentages in `translate`, the values are relative to the **element’s own size**, not its parent.
>
> - For example: setting `translate` to `50% 0` moves the element **half of its own width** to the right.
> - Setting `translate` to `0 100%` moves it **down by its own height**.

> 💡 `pivot` controls where transformations "originate" from. For example:
>
> - `pivot: center` rotates from the middle
> - `pivot: top left` rotates or scales from the top-left corner

---

## 👆 Interactivity Utilities

These utilities affect how users can interact with an element — whether it’s clickable and how the mouse cursor looks when hovering over it.

| Prop Name      | What it does                                                    | Supported Values                             |
| -------------- | --------------------------------------------------------------- | -------------------------------------------- |
| `interactable` | Determines if the element responds to mouse/touch input.        | `true`, `false`                              |
| `cursor`       | Sets what the cursor looks like when hovering over the element. | `default`, `pointer`, `text`, `<image-name>` |

> 💡 `cursor` lets you customize the pointer:
>
> - `pointer` indicates the element is clickable (default for buttons)
> - `text` shows the I-beam cursor (used for text fields)
> - `default` the normal arrow cursor

---

## ⏳ Transition Utilities

Transitions are used for smoothly changing a property's value over time when the state changes.

| Prop Name             | What it does                                          | Supported Values                                                                                            |
| --------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `transition-delay`    | How long to wait before starting a transition.        | `<time>`                                                                                                    |
| `transition-duration` | How long the transition takes once it begins.         | `<time>`                                                                                                    |
| `transition-easing`   | Controls the speed curve of the transition over time. | `ease`, `ease-in`, `ease-out`, `ease-in-out`, `linear`, `cubic-bezier(<number>,<number>,<number>,<number>)` |
| `transition-property` | Sets which properties will animate on change.         | `<property-name>`                                                                                           |

> 💡 The following properties will be transitioned by default `opacity`, `translate`, `rotate`, `scale`, `filter`, `backdrop-filter`, `mix-blend-mode`, `box-shadow`, `color`, `background-color`, `border-color`, `text-decoration-color`.
>
> - Use `transition-property` to override which properties are transitioned.

> 💡 `transition-property`, `transition-delay`, `transition-duration`, and `transition-easing` can take **multiple comma-separated values** — one for each property.
>
> - For example, if `transition-property` is set to `background-color, opacity` and `transition-duration` is set to `0.5s, 1s`, the background-color will fade over 0.5 seconds while the opacity fades over 1 second.

> 💡 Transitions only work for numeric or color-based properties — they won't animate layout changes like display or visibility.

---

## 📽 Animation Utilities

Animations are full motion sequences, defined by an [`animation` declaration](#).

| Prop Name              | What it does                                                           | Supported Values                                                                                            |
| ---------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `animation`            | Plays a named animation with default timing.                           | `none`, `<animation-name>`                                                                                  |
| `animation-state`      | Controls whether the animation is running or paused.                   | `running`, `paused`                                                                                         |
| `animation-delay`      | Overrides how long to wait before starting the animation begins.       | `<time>`                                                                                                    |
| `animation-duration`   | Overrides how long each cycle of the animation takes.                  | `<time>`                                                                                                    |
| `animation-easing`     | Overrides the speed curve of the animation over time.                  | `ease`, `ease-in`, `ease-out`, `ease-in-out`, `linear`, `cubic-bezier(<number>,<number>,<number>,<number>)` |
| `animation-iterations` | Overrides how many times the animation should repeat.                  | `1`, `<number>`, `infinite`, etc.                                                                           |
| `animation-direction`  | Overrides whether the animation runs forward, backward, or alternates. | `normal`, `reverse`, `alternate`, `alternate-reverse`                                                       |
| `animation-fill`       | Overrides whether styles are applied before/after the animation runs.  | `none`, `forwards`, `backwards`, `both`                                                                     |

> 💡 `animation-delay`, `animation-duration`, `animation-easing`, `animation-iterations`, `animation-direction`, and `animation-fill` will override equivalent timing settings defined in an [animation declaration](#) as long as they are set **after** the `animation` property is set.

- `animation=bounce duration=3s` overrides the duration defined in `bounce`'s animation declaration
- `duration=3s animation=bounce` animation will play with it's default duration **(not 3s)**

> 💡 Set `animation-iterations` to `infinite` for looping effects.

> 💡 Set `animation-direction` to `alternate` to make the animation reverse on every other cycle.

> 💡 `animation-fill` defines how the element looks **before** or **after** the animation:
>
> - `forwards` keeps the final state
> - `backwards` shows the first frame even during delay
> - `both` combines both behaviors

---

## #️⃣ Data-Type Syntax

### `<number>`

Supports either floating points or integer literals. For example, `1` or `0.5`.

### `<length>`

Consists of a `<number>` followed by the unit (`px`) — e.g. `8px`.  
(The value `0` does not require a unit.)

The following size literals can also be used in place of a pixel size:

- `xs` = 2px
- `sm` = 4px
- `md` = 8px
- `lg` = 16px
- `xl` = 24px

### `<percentage>`

Consists of a `<number>` followed by the percentage sign (`%`) — e.g. `50%`.  
(The value `0` does not require a unit.)

### `<angle>`

Consists of a `<number>` followed by the unit (`deg`) — e.g. `180deg`.  
(The value `0` does not require a unit.)

### `<time>`

Consists of a `<number>` followed by the unit (`s`) for seconds or (`ms`) for milliseconds — e.g. `2s` or `200ms`.  
(The value `0` does not require a unit.)

### `<color>`

Supports the following literal color values and functions:

- A Hexadecimal value: `#FFFF00`, `#0F0`
- The RGB function: `rgb(255, 255, 0)`
- The RGBA function: `rgba(255, 255, 0, 1.0)`
- [Color Palette Keywords](#)

### `<property-name>`

The name of a styling property — e.g. `background-color`, `opacity`, `scale`, etc.

### `<font-name>`

The name of a [defined `font`](#).

### `<image-name>`

The name of a [defined `image`](#).

### `<animation-name>`

The name of a [defined `animation`](#)

---

## 🧩 Advanced Usage & Compatibility Notes

If you're already familiar with CSS, you can use **standard CSS property names and property values** inside `style` blocks:

```sparkdown
style fancy_box with
  max-width = 100%
  justify-content = space-between
end
```

You can also use standard CSS names and values **inline** on elements — as long as the property has a known equivalent in the Sparkle system:

```sparkdown
row #max-width=100% #justify-content=space-between
```

### ⚠ Portability Warning

These raw CSS values will work fine on the web — but they may not work on other platforms like game consoles or mobile devices.

For full cross-platform support, it’s best to stick to the **Sparkle prop names, value keywords, and data-type syntax** listed in this guide (like `width-max=100%`, `child-justify=between`, etc.).

This ensures your styles remain portable even when building for non-web environments.

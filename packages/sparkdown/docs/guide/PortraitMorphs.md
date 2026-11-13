# Portrait morphs

A portrait drawn with layers already has its states: eyes open and eyes closed, a mouth open and shut, a door ajar and a door closed. [Character Portraits](./Portraits.md) shows how the script chooses one. A `morph` makes the portrait move between them on its own: the drawings of one state bend, fade or scale into the drawings of the next. Wherever a morph is not moving its portrait it holds it in its rest, the state its last pose shows unless the morph names another. A morph that stops after a set number of plays holds the pose its final play ends on: the last pose with the default `direction = normal`, the first with `reverse`, and for the alternating directions whichever end the final play reaches.

A morph knows nothing about eyes. It drives whatever attribute groups its keyframes name, on every portrait that has those groups. This chapter uses a blink as its worked example because it is the most common use, but the same rules serve a mouth, a flickering lamp or a curtain.

The chapter covers what the art needs, how to declare the morph, how it chooses portraits, how it times its plays, and how to read its warnings.

## A first morph

Mia's eyes are drawn twice, once open and once closed, as [Character Portraits](./Portraits.md) describes:

```
eyelash-left:eyes.closed
eyelash-left:eyes.open:default
eyelash-right:eyes.closed
eyelash-right:eyes.open:default
```

This morph closes them and opens them again:

```sparkdown
morph blink {
  method = bend
  unless = eyes.closed

  keyframes {
    0% {
      eyes {
        state = open
      }
    }
    50% {
      eyes {
        state = closed
      }
    }
    100% {
      eyes {
        state = open
      }
    }
  }
}
```

That is all the script needs. Every portrait with an `eyes` group that draws `open` and `closed` now blinks once when it appears and then rests with its eyes open, except a look whose eyes are closed. Nothing in a scene has to mention the morph: `[[mia]]` and `[[mia:happy]]` both play it.

Reading it:

- `morph blink { … }` declares a morph named `blink`. Like `style` and `animation`, it is written at a script's top level and takes a brace body.
- `keyframes` lists the poses. Each pose names a group as a container, `eyes { … }`, and the `state` it shows there. The last pose, `open`, is where the morph rests.
- `method = bend` says how a drawing changes shape into its counterpart. The methods are described below; a morph that changes shapes has to name one.
- `unless = eyes.closed` keeps the morph off a look whose eyes are closed, such as `[[mia:eyes.closed]]` or a face drawn with `eyes.closed:default`, so a sleeping face stays asleep. Without it the blink plays there too and rests the eyes open ([Which portraits a morph plays on](#which-portraits-a-morph-plays-on)).

The drawings that change are found from the artwork, by their labels: the open `eyelash-left` becomes the closed `eyelash-left`, and the open `eyelash-right` becomes the closed `eyelash-right`.

## Preparing the art

A morph pairs drawings by their labels, so the art has to be labelled with that in mind. A drawing program that exports one SVG per portrait, with layer names in `data-name`, is the starting point ([Drawing programs](./Portraits.md#drawing-programs)). Expect to edit the drawing: a portrait drawn only to be looked at rarely qualifies unchanged.

### Matching labels

The label is the part of a layer's name before the first colon: `eyelash-left` in `eyelash-left:eyes.open:default`. A drawing whose layer has no label of its own takes the label of the nearest labelled layer around it. A drawing with no label anywhere above it never pairs.

Give the drawing that changes the same nonempty label in each state. `eyelash-left:eyes.open` and `eyelash-left:eyes.closed` pair. `lash-left:eyes.open` and `lid-left:eyes.closed` do not, and each leaves or arrives by itself through the morph's `fallback` instead, a fade unless the morph sets another.

Each drawn element is one pairing unit. When a label holds one drawing in one state, every drawing of that label in the other state pairs with it. When it holds the same number of drawings in both states, they pair by position: the two drawings nearest each other pair first, then the nearest of the rest, and so on, so the top lash becomes the top lash whatever order the elements are in. Drawings at equal distances pair in the order they are drawn, so the same art always moves the same way. A label with different numbers of drawings in the two states, more than one on each side, does not pair at all: each of its drawings uses the fallback, with a warning on the artwork. A shape split across several elements pairs element by element.

### Two open lashes, one closed lash

An open eye is often drawn with a top lash and a bottom lash, while the closed eye is one line. Give both open lashes the label of the closed lash:

```
eyelash-right:eyes.closed
eyelash-right:eyes.open:default
eyelash-right:eyes.open:default
```

Both open drawings then move onto the one closed drawing. Two drawings sharing one destination give two moving edges, which meet at the closed line. They do not make a single opening out of three drawings.

A side label is what keeps the left lashes from pairing with the right ones. Repeat the side in every label that belongs to it.

### Drawings that should not pair

A drawing with no counterpart in the other state is valid. It uses the morph's `fallback`, a fade by default, and nothing is reported. Leaving the shine on an open eye unpaired, so it fades away as the eye closes, is a deliberate choice.

### The eyeball under the lids

As lashes close, the eyeball between them has to disappear with them. The morph does that with a clip, which is described below; the art has to give it something to clip.

- Draw the eyeball whole, as if the lids were not there, rather than cut to the open eye's outline. A clip shows less of a drawing, never more.
- Keep any mask the artist drew. The morph's clip is applied on top of it, and the two intersect.
- Label each side's pieces separately, so a clip can name them: the reference project below uses `eyeball-white-left`, `eyeball-shadow-left` and `pupil-left`, and the same with `-right`.

### Art the morph can read

The morph reads the artwork's own markup, so some export settings stop it. An artwork the morph cannot read safely shows without the morph, still, with an error on the artwork file:

- A style sheet: a `<style>` or `<link>` element anywhere in the file, even an empty one or one whose rules touch nothing, an `<?xml-stylesheet ?>` instruction, or a `<!DOCTYPE>` with an internal subset in square brackets. Export styling as inline `style` attributes or presentation attributes, which are read.
- An inline `style` the morph cannot read safely: one using `all`, `var()`, comments, escapes, character references or strings, anything outside plain ASCII, a `!` other than `!important`, or an opacity that is not a number or a percentage.
- A `transform` attribute the morph cannot read: the six SVG transform functions with plain numbers are read, separated by spaces, tabs, line breaks or commas.

A single shape the morph cannot follow fades instead of moving, with a warning naming its layer, while the rest of the portrait still moves: a shape whose geometry is set in units or styles the morph cannot read exactly, such as `cx="50%"`, `r="1em"` or a `d` or `r` set in its `style`, and a shape moved by a transform the morph cannot follow, such as a CSS `transform` or `rotate` in its `style`, or a `transform-origin` attribute, on the shape or a layer around it.

## Declaring a morph

A morph's body has these parts. Each is optional except `keyframes`, and `method` wherever shapes morph.

```sparkdown
morph blink {
  blend = morph
  method = bend
  fallback = fade
  unless = eyes.closed

  keyframes {
    from {
      eyes {
        state = open
      }
    }
    50% {
      eyes {
        state = closed
      }
    }
    to {
      eyes {
        state = open
      }
    }
  }

  timing {
    duration = 0.25
    iterations = infinite
    iteration_delay_min = 2
    iteration_delay_max = 6
  }
}
```

The editor completes the field names in each block and shows what each one does when you hover over it.

### Keyframes and states

A pose can be placed in several ways:

- By percentage, `50% { … }`, or with `from` for `0%` and `to` for `100%`.
- As an entry with an `offset` from 0 to 1: `{ offset = 0.5; eyes { state = closed } }`.
- As entries with no position at all, `{ … }`. The first sits at 0, the last at 1, and the ones between are spaced evenly between their nearest placed neighbours.

The poses can be written on one line each, with `;` between entries:

```sparkdown
morph blink {
  method = bend
  unless = eyes.closed
  keyframes {
    from { eyes { state = open } }
    50% { eyes { state = closed } }
    to { eyes { state = open } }
  }
}
```

A `state` is always the name of an option, never a variable or a number, so `state = closed`, `state = "closed"`, `state = 01` and `state = open-wide` are each read as written. It may also be qualified with its group, `state = eyes.closed`, the way a script line writes it. The qualifier has to be the container's own group: `state = mouth.closed` inside `eyes { … }` is an error. After you type `eyes.`, the editor completes the states the project's portraits draw.

Every group the morph drives needs its `state` in the first pose; a morph whose group first appears in a later pose is an error and plays nowhere. Each group rests in the state of the last pose that names it, or in the state the morph's `rest` gives it ([Where a morph rests](#where-a-morph-rests)). A morph whose first and last poses are both its rest comes back to rest seamlessly whichever direction it plays in; between the rest and a first or last pose that differs, the portrait cuts, whatever the morph's `blend`. As in CSS keyframes, a group whose first pose sits after `0%`, or whose last pose sits before `100%`, holds the morph's rest there.

States match exactly ([The naming rules](./Portraits.md#the-naming-rules)): a morph whose poses name `open` shows the `open` drawings, and `open-wide` is a state of its own. A folder that draws only `open-wide` does not fit a morph that names `open`.

### How shapes change

`blend` says what happens between poses, for every drawing that changes:

| `blend` | Between poses |
| --- | --- |
| `morph` | Each paired drawing changes shape into its counterpart, by the `method`. The default. |
| `fade` | The leaving drawing fades out while the arriving one fades in. |
| `cut` | The leaving drawing holds until the pose is reached, then the arriving one shows. |
| `scale` | The leaving drawing shrinks to nothing while the arriving one grows from nothing. |

`method` says how a pair morphs, and has to be written wherever `blend = morph` applies:

| `method` | Use it for |
| --- | --- |
| `match` | Two drawings made of the same points in the same order, such as a shape and an edited copy of it. |
| `bend` | A thin shape with two pointed ends, such as a lash, a brow or a mouth line. It bends while its ends keep their shape. |
| `trace` | Any closed shape, when nothing simpler fits. |

`fallback` says what happens to a drawing under `blend = morph` that has no counterpart, or whose pair the method cannot morph: `fade` (the default), `cut` or `scale`. A method that cannot morph a pair it was asked to is reported on the artwork, and that pair uses the fallback, so the portrait still moves.

### Per-layer settings

`layers` changes those settings for the drawings of one label:

```sparkdown
morph blink {
  method = bend
  unless = eyes.closed

  layers {
    creases {
      fallback = scale
    }
    shine {
      blend = fade
    }
  }

  keyframes {
    from { eyes { state = open } }
    50% { eyes { state = closed } }
    to { eyes { state = open } }
  }
}
```

Each field is taken from the nearest setting: the label's own, else the morph's. A label under `layers` may set `blend`, `method`, `fallback`, `depth`, `spread` and `partner`. A label that morphs under a morph whose `blend` is not `morph` needs its own `method`.

Two more settings help art whose drawings overlap. `depth` chooses which pose's layer order a moving drawing keeps between poses: `rest`, the default, keeps the order the still portrait shows, and a state such as `depth = eyes.closed` keeps that pose's order. `spread` grows (positive) or shrinks (negative) a drawing's outline by a number of screen pixels while it is between poses, such as `spread = -1px`, so an edge that lands on another drawing's outline hides under it.

`spread` grows or shrinks fills only: a drawing that paints a stroke, its own or a `paints` entry's, keeps its own size. Growing also skips a fill that is a pattern or a gradient whose stops differ in opacity, and a `polyline`. A drawing shrinks only when it is a single contour that does not overlap itself and has no `mask` of its own; split a drawing of several contours into one layer per contour. A drawing `spread` skips keeps its own size between poses, with a `spread-ignored` warning on the artwork.

`partner` names the labels whose drawing a label's drawings take in a pose that draws none of its own. In the reference project the open eyeball shadow has no closed drawing, so it takes the shape of the nearest closed lash and stays there while the eye is closed:

```sparkdown
morph blink {
  method = bend
  unless = eyes.closed

  layers {
    eyeball-shadow-left {
      partner {
        eyelash-left
      }
      spread = -1px
    }
  }

  keyframes {
    from { eyes { state = open } }
    50% { eyes { state = closed } }
    to { eyes { state = open } }
  }
}
```

`partner` may also list several labels in priority order. In each pose the first listed label that pose draws decides which drawing the label takes, and the label's own name in the list pairs by name at that rank. The reference project lists two lashes for its right shadow, so a look whose right lash is labelled `eyelash-top-right` still gives the shadow a shape, while `eyelash-right` decides wherever a pose draws it:

```sparkdown
morph blink {
  method = bend
  unless = eyes.closed

  layers {
    eyeball-shadow-right {
      partner {
        eyelash-right
        eyelash-top-right
      }
      spread = -1px
    }
  }

  keyframes {
    from { eyes { state = open } }
    50% { eyes { state = closed } }
    to { eyes { state = open } }
  }
}
```

A pose that draws neither the label nor any label its `partner` lists leaves the drawing no shape to take: there it uses its fallback, or holds while the opening moves if a clip targets it, with a `partner-missing` warning on the artwork.

### Clips

A `clips` entry cuts an opening from the edges of the drawings its `between` labels name, and shows its `targets` only inside that opening. As the edges move, the opening moves with them:

```sparkdown
morph blink {
  method = bend
  unless = eyes.closed

  keyframes {
    from { eyes { state = open } }
    50% { eyes { state = closed } }
    to { eyes { state = open } }
  }

  clips {
    {
      between {
        eyelash-left
      }
      targets {
        eyeball-white-left
        eyeball-shadow-left
        pupil-left
      }
    }
    {
      between {
        eyelash-right
        eyelash-top-right
        eyelash-bottom-right
      }
      targets {
        eyeball-white-right
        eyeball-shadow-right
        pupil-right
      }
    }
  }
}
```

The rules for an entry:

- `between` lists the labels the entry accepts as edges. A portrait uses the ones it draws, so one morph serves a portrait whose two right lashes are both `eyelash-right` and one whose lashes are `eyelash-top-right` and `eyelash-bottom-right`. Listing different labels does not make them counterparts: drawings still pair by their own labels, and distinct labels keep lashes from pairing across each other.
- The edges have to be bend morphs: two moving edges that form the opening. A lone edge, an edge that never moves, three edges sharing their tips, or an edge inside its own target keeps the morph from playing on that portrait, with a warning.
- Each entry is its own opening. Give each eye its own entry, naming that side's edges and targets, so one eye's lashes never clip the other eye.
- The opening applies to the targets in the still portrait too, and is laid over any mask the artwork already gives them.
- An entry's `spread` sets how far the opening reaches past its outline, under the edges drawn around it: `1px` by default, `0` for none, and a negative value to pull it inside the edges.
- An opening that closes to nothing, as a closed eye's does, is valid.

A target need not be an eyeball. Any drawing that should show only between two moving edges can be one, such as a shadow inside an opening mouth.

### Colours at a pose

A `paints` entry recolours the drawings of its `targets` labels at one pose: the colour moves in as the pose approaches and away as it leaves. `state` names the pose with its group. The entry's own `when`, unlike the morph's, limits only the entry, to portraits that draw a layer needing another group's state, such as a mask switched on:

```sparkdown
morph blink {
  method = bend
  unless = eyes.closed

  keyframes {
    from { eyes { state = open } }
    50% { eyes { state = closed } }
    to { eyes { state = open } }
  }

  paints {
    {
      targets {
        eyelash-left
        eyelash-right
      }
      state = eyes.closed
      when = mask.on
      fill = #c9c9c9
      span = 40%
    }
  }
}
```

An entry sets at least one of `fill`, `stroke` and `opacity`. `span` is how much of each neighbouring segment the change takes, `100%` by default.

### A second group in the same poses

A pose can set the state of more than one group. This blink drops the brows to their `down` drawing while the eyes close:

```sparkdown
morph blink {
  method = bend
  unless = eyes.closed

  layers {
    brow-left {
      blend = fade
    }
  }

  keyframes {
    from {
      eyes { state = open }
      brows { state = up }
    }
    50% {
      eyes { state = closed }
      brows { state = down }
    }
    to {
      eyes { state = open }
      brows { state = up }
    }
  }
}
```

- Every group a morph drives has its `state` in the first pose. A group whose first `state` comes in a later pose is an error on that `state`, and the morph plays on no portrait until it is fixed.
- Each group moves between the nearest poses that set it, on the same timing as the others, and rests in its own rest: here the eyes rest `open` and the brows `up`.
- A morph plays all of its groups or none. A look one of whose folders cannot show a state the morph names in any group stays as drawn, with a warning, and a `when` or `unless` keeps the whole morph off a look: a morph never moves half a face.
- A drawing belongs to at most one group the morph drives. A layer whose showing depends on two or more of them together, such as a crease drawn only while the eyes are closed and the brows are down, keeps the portrait still with a `mixed-groups` error on the artwork. Draw it under one group.

### Moving layers

A container named after a layer label, rather than a group, moves the drawings with that label. It takes CSS's 2D transform properties and opacity:

```sparkdown
morph blink {
  method = bend
  unless = eyes.closed

  keyframes {
    from { eyes { state = open } }
    50% {
      eyes { state = closed }
      eyebrows { translate = 0 8px }
      nose {
        translate = 0 -2px
        rotate = 2deg
        transform_origin = center bottom
      }
    }
    to { eyes { state = open } }
  }
}
```

| Property | Value | At rest |
| --- | --- | --- |
| `translate` | One or two lengths, `x y`: `0 8px`, `-2px`, `50% 0`. | `0` |
| `rotate` | One angle: `5deg`, `-0.02turn`, `0`. | `0deg` |
| `scale` | One or two factors, `x y`: `1.1`, `1 0.9`, `95%`. | `1` |
| `transform` | A list of 2D functions with commas between their arguments: `translate()`, `translateX()`, `translateY()`, `scale()`, `scaleX()`, `scaleY()`, `rotate()`, `skew()`, `skewX()`, `skewY()` and `matrix()`, such as `skewX(4deg) translate(0, -1px)`. | `none` |
| `transform_origin` | The point the layer turns and scales around: one or two of `left`, `center`, `right`, `top`, `bottom` and lengths, horizontal first, such as `left top` or `50% 100%`. | `center` |
| `opacity` | From 0 to 1, or a percentage. | `1` |

A length is written in `px`, as a percentage, or as a `calc()` of the two, such as `calc(50% + 2px)`. A bare number other than `0` is an error, since a browser would ignore it. An angle is in `deg`, `rad`, `grad` or `turn`.

`px` are units of the artwork's own coordinates, those of the group the layer sits in, not pixels on the screen. For a layer at the top of the artwork they are the units of its `viewBox`: a portrait 2000 units tall shown 600 pixels tall moves `translate = 0 8px` about 2.4 pixels on screen. A layer inside a scaled group moves in that group's units.

A percentage is of the moved layer's own box, the bounds of what it draws in that frame: `translate = 0 50%` moves a layer down by half its own height, and the default origin is the centre of that box. A percentage of an eyebrow's box is not a fraction of the eye's height, so a movement meant to follow the eyes is written in `px` and tuned by looking.

When several properties are set they apply in CSS's order: `translate`, then `rotate`, then `scale`, then `transform`, all about `transform_origin`. Within `transform` the functions apply as written, so `rotate(90deg) translate(10px, 0)` moves along the turned axis while `translate = 10px 0` with `rotate = 90deg` moves sideways. A `transform` the artwork already gives the layer stays on it, and the movement is added around it.

Each property moves between the nearest poses that set it. A first or last pose that leaves a property out uses its rest value from the table, so the layer returns to where it is drawn. The movement follows the same progress as the shapes and openings: `easing` applies once to the whole play, so under `steps(3)` the brows step with the lids.

- Every drawing with the label moves, with everything inside it. A label that also appears inside itself moves once, from the outermost.
- A container whose name is both a group and a label can set the group's `state` and move the layers with that label in one place.
- The edges and targets of a clip cannot move: their opening is cut where the artwork draws the edges. A moved layer that draws part of one holds still, with a `motion-ignored` warning on the artwork. So does a moved layer that a `<use>` or a clip path outside it draws again, since that copy would stay behind.
- 3D is refused where it is written: `rotateX()`, `translate3d()`, `perspective()` and the other 3D functions, a third value of `translate`, `scale` or `transform_origin`, and a rotation axis such as `rotate = x 30deg`. Any other field in a container is an unknown field.
- A label no portrait draws is reported on its container. A label only some portraits draw is fine: the others play without moving it, so one morph can move a nose drawn on a mask that only some looks wear.
- Changing a distance or angle prepares nothing again; only which labels move is part of the prepared portrait.

### Building on another morph

`morph slow as blink { … }` starts from `blink` and changes what it writes. Here only the timing changes:

```sparkdown
morph blink {
  method = bend
  unless = eyes.closed
  keyframes {
    from { eyes { state = open } }
    50% { eyes { state = closed } }
    to { eyes { state = open } }
  }
}

morph slow as blink {
  timing {
    duration = 1
  }
}
```

A problem in the parent is reported where the parent writes it.

## Which portraits a morph plays on

A morph finds its portraits itself; nothing connects them by name.

- A portrait is considered when it has at least one of the groups the keyframes name. One with none of them, such as a background, is ignored silently.
- It is compatible when it has every one of those groups, and every state the keyframes and `rest` name in them. A portrait missing a group or a state is reported on the morph, naming the portrait and what it lacks.
- Each compatible portrait is then checked as each look the script asks for: the plain portrait, every named look built on it and every script line that selects attributes.

For each look:

- If the morph's `unless` or `when` keeps it off the look, the look shows exactly what the script and the art choose, and nothing is reported.
- Otherwise every visible folder that draws a group the morph drives has to draw each state the keyframes and `rest` name for that group. If one does not, the look is skipped, with a warning on the morph naming the folder and the state it lacks.
- Otherwise the morph plays on the look, whatever the look rests in. `[[mia:eyes.closed]]` blinks, and so does a face whose eyes are marked `eyes.closed:default`, unless the morph keeps itself off them.

A morph that drives several groups plays all of them or none: one skipped group skips the whole look.

### Keeping a morph off a look

`unless` names states that keep the morph off a look, and `when` names states a look needs for the morph to play there. Each is one state written with its group, or a block of several:

```sparkdown
morph blink {
  method = bend
  unless {
    eyes.closed
    mask.on
  }

  keyframes {
    from { eyes { state = open } }
    50% { eyes { state = closed } }
    to { eyes { state = open } }
  }
}
```

- With `unless`, the morph does not play on a look where any listed state is active.
- With `when`, the morph plays only on a look where every listed state is active.
- A state is active on a look when the script line or a named look chooses it, or failing that the art's `:default` does, in any visible folder that draws the group.
- A condition may name a group the morph drives, as the blink's `unless = eyes.closed` does, or any other group, such as `mask.on`.
- Conditions are judged on the look as the script and the art give it, before the morph's rest replaces anything.
- A child morph that writes `when` or `unless` replaces its parent's. There is no way to clear an inherited one.
- A state no portrait the morph could play on draws, or a group none of them has, is reported where it is written.

Nothing else keeps a morph off a look. A blink that should leave closed eyes closed writes `unless = eyes.closed`; without it a face drawn asleep opens its eyes to blink.

### Where a morph rests

While a morph plays on a look it owns the groups it drives:

- During a play they show its keyframes.
- In a gap between plays, and after the last of a set number of plays, they hold the pose the last play ended on.
- Before the first play, while its `delay` runs, they show the pose that play starts from, so a morph that plays once does not show its end state first.
- When playback is off, with `Animate portraits` off or `iterations = 0`, they show the morph's rest.

Each driven group's rest is the state the morph's `rest` gives it, or else the state of the last pose that names the group. `rest` is a block of group containers, each with a `state`, written like a keyframe's pose:

```sparkdown
morph talk_smile {
  blend = cut
  when = mouth.teeth

  rest {
    mouth { state = teeth }
  }

  keyframes {
    from { mouth { state = closed } }
    50% { mouth { state = open } }
    to { mouth { state = closed } }
  }
}
```

This morph plays only on looks whose mouth shows its teeth, flaps between `closed` and `open`, and shows the teeth whenever it is not moving.

- A rest state need not appear in the keyframes. Going from the rest into a first pose that differs, and from a last pose that differs back to the rest, is a cut, whatever the morph's `blend`.
- Where a clip cuts the eyes with their lids, a rest state outside the keyframes is cut by the lids that state draws: two lids whose tips meet make the opening, and a single lash on its own closes the eye. If that state draws a clipped eye with no lids around it, or lids that cannot make an opening, the portrait shows that look as drawn, without the morph, and the error names the clip.
- A group the keyframes leave unset at the start or end of a play, because its first pose sits after `0%` or its last before `100%`, holds its rest there.
- `rest` holds group states only. A layer movement field in it, such as `translate`, is an error: a moved layer rests where it is drawn. A group the keyframes do not drive is an error too.

### The look a portrait shows

The look a portrait shows is the script's and the art's choices, except in the groups a playing morph drives, where the morph's rest replaces them. The image shown when hovering over a portrait or its suggestion, a portrait used as a mask and the morph's prepared still all show this look. While the morph is being prepared, the portrait shows the pose its moving drawing will show first.

A script line or named look that chooses a state in a group a playing morph drives, other than the morph's rest, therefore does not show that state. The choice gets a warning naming the morph, the group and the rest shown instead:

```sparkdown
scene nap
  [[mia:eyes.closed]]
end
```

Under a blink with no `unless`, this warns that `blink` rests `eyes` on `open`. Add `eyes.closed` to the blink's `unless` to keep the blink off such looks, or route them to another morph that rests on the state, with that morph's `when`. A state the art's `:default` chooses is not reported.

A group is driven by its name. Renaming a group, `eyes` to `lids` say, takes those portraits out of a blink that drives `eyes`; change the script lines and named looks that select `eyes.closed` to match, or they select a group that no longer exists.

Several morphs can play on one portrait at once, each on its own timing, so a face can blink while its mouth moves. They play together when they drive different groups, move different labels and name different labels in their clips' `between` and `targets`. If any two of them share a group, a moved label or a clip label, none of them plays: the portrait stays still, with a warning that names the morphs and what they share. A drawing whose showing depends on groups that two of the morphs drive, such as a crease conditioned on `eyes.closed` inside a `mouth.open` layer, also keeps the portrait still, with an error on the artwork.

## Timing

Timing is set in `timing { … }`. Every value is optional:

| Field | Default | Meaning |
| --- | --- | --- |
| `trigger` | `appear` | What starts the plays: `appear` when the portrait appears, `speech` while its character speaks ([Talking](#talking)). |
| `duration` | `0.25` | Seconds one play lasts. |
| `delay` | `0` | Seconds before the first play only. Meanwhile the portrait shows the pose that play starts from. |
| `iterations` | `1` | How many plays in all: a whole number, or `infinite`. `0` turns playback off, and the portrait shows the morph's rest. |
| `iteration_delay_min` | none | Shortest quiet time, in seconds, from the end of one play to the start of the next. |
| `iteration_delay_max` | none | Longest such time. |
| `direction` | `normal` | `normal`, `reverse`, `alternate` or `alternate-reverse`, as in CSS. A morph with a set number of plays stops on the pose its final play ends at. |
| `easing` | `ease-out` | The timing curve over a whole play: a CSS name, `cubic-bezier(…)`, `steps(…)` or `linear(…)`. |

`iteration_delay_min` and `iteration_delay_max` are written together. Each gap is drawn independently and evenly between them, so a blink with `2` and `6` never settles into a rhythm. Without them, plays follow each other with no gap.

`easing` applies once, to the whole play, not to each segment between poses: `steps(3)` gives the whole blink three visible steps.

There is no control for a double blink. A morph with more poses (open, closed, open, closed, open) plays one.

## Talking

A morph marked `trigger = speech` plays while its portrait's character speaks, so a mouth flaps through a line and rests between lines. This script gives Raffles three ways of talking and blinks his eyes throughout:

```sparkdown
define raffles as character with
  name = "RAFFLES"
end

morph blink {
  method = bend
  unless = eyes.closed

  keyframes {
    from { eyes { state = open } }
    50% { eyes { state = closed } }
    to { eyes { state = open } }
  }

  timing {
    iterations = infinite
    iteration_delay_min = 2
    iteration_delay_max = 6
  }
}

morph talk {
  blend = cut
  default = true
  unless = mouth.teeth

  keyframes {
    from { mouth { state = closed } }
    50% { mouth { state = open } }
    to { mouth { state = closed } }
  }

  timing {
    trigger = speech
    duration = 0.16
    iteration_delay_min = 0
    iteration_delay_max = 0.08
  }
}

morph talk_gritted as talk {
  keyframes {
    from { mouth { state = closed } }
    50% { mouth { state = teeth } }
    to { mouth { state = closed } }
  }
}

morph talk_smile {
  blend = cut
  when = mouth.teeth

  rest {
    mouth { state = teeth }
  }

  keyframes {
    from { mouth { state = closed } }
    50% { mouth { state = open } }
    to { mouth { state = closed } }
  }

  timing {
    trigger = speech
    duration = 0.16
  }
}

scene start
  RAFFLES:
    [[raffles@confident]]
    Yes yes, I'm fine...

  RAFFLES:
    [[raffles@confident morph talk_gritted]]
    I said I'm fine.

  RAFFLES:
    [[raffles@happy:mouth.teeth]]
    ((play voice raffles_laugh))
    Anyway!

  RAFFLES (V.O.):
    [[raffles@confident:mouth.closed morph none]]
    He was not fine.
end
```

The first line flaps between `open` and `closed` and rests closed. The second flaps between `teeth` and `closed` and rests closed. On the third the mouth shows its teeth, so `talk` keeps off the look and `talk_smile` flaps between `open` and `closed` for as long as the laugh plays, then rests on the teeth. The fourth plays no speech morph, so the line's own closed mouth shows. The blink plays on every line, since it drives `eyes` and the talking drives `mouth`.

### Marking a speech morph

`trigger = speech`, in `timing`, marks the morph. On a speech morph:

- `duration`, `easing` and `direction` shape each play as on any morph, and `iteration_delay_min` and `iteration_delay_max` set the gap between plays, with no gap when they are absent.
- `delay` and `iterations` are errors, on the field, since speech decides when the plays start and how many there are. A child morph that inherits either from its parent is reported where it names the parent.
- `when`, `unless` and `rest` work as on every morph ([Which portraits a morph plays on](#which-portraits-a-morph-plays-on), [Where a morph rests](#where-a-morph-rests)).

Changing `trigger` changes only when the morph plays, so the portrait's movement is not prepared again.

### Who is speaking

A line's cue names its character the way the rest of the story does: by the define's own name or its `name` field, so `RAFFLES:` names `raffles` above. A cue with no `define … as character` behind it names nobody, and narration names nobody, so no mouth moves for them.

An image is a character's portrait when its name, up to its first `@`, is the character's define name: `raffles`, `raffles@confident` and `raffles@happy` are all Raffles. A project that keeps one file per expression names its files that way ([Character Portraits](./Portraits.md)). A named look whose own name names no character belongs to the character of the image it is built on.

When a character speaks, every portrait of theirs on screen flaps, wherever it was shown. A portrait of someone else stays at rest, so a listener's mouth stays shut while another character talks.

### When the mouth flaps

When the line's block plays a clip on the `voice` channel, as the third line plays `raffles_laugh`, the mouth flaps for as long as the clip is heard: from its start until it ends, or until the next line stops it. The text does not matter then, so skipping the typing leaves the clip and the mouth going, and the mouth keeps flapping through silences inside the clip. A voice clip that cannot play counts as no clip.

Otherwise the mouth flaps while the line's voiced characters type: the characters the typewriter's `voiced` pattern matches, letters, digits and the apostrophe unless the typewriter sets another, the same characters that make the character's voice beep. Each counts for its own letter pause, the typewriter's `letter_pause` divided by the text speed in force.

- Other punctuation, spaces and the extra time a typewriter pause adds, such as a run of spaces, a dash or a spaced ellipsis, are not speech, so a pause in the typing is a pause in the flap.
- The character name and parenthetical at the top of a line are not speech.
- A line with no voiced character, such as `. . .`, does not move the mouth. In `...AND THEN YOU DIE!` the mouth starts at the `A`.
- Skipping the typing, so that the whole line shows at once, ends the speech.

While speech lasts the morph plays again and again: each play takes `duration`, and the gap before the next is drawn between `iteration_delay_min` and `iteration_delay_max`. The first play starts as the speech starts. Between plays the mouth holds the pose the last play ended on. A play in progress always finishes, but none starts once the speech has stopped, so after the last letter, during a pause in the typing or after a skip the mouth finishes its flap and shows its rest.

### Where the mouth rests

A speech morph rests like any morph: each group it drives rests on the state its `rest` gives, or else the state of its last keyframe. `talk` rests on `closed`, its last keyframe, and `talk_smile` rests on the `teeth` its `rest` names.

While a speech morph plays on a look, it owns the mouth even when nobody is speaking, so a line that chooses a mouth state the morph does not rest on shows the morph's rest instead, with a warning on the choice ([The look a portrait shows](#the-look-a-portrait-shows)). To keep a choice, route it to a morph that honours it, as `talk_smile`'s `when = mouth.teeth` and `talk`'s `unless = mouth.teeth` route the smile, or pick `morph none` on the line.

`when` and `unless` route other looks the same way. A portrait whose mask covers the mouth can keep the flap off itself with a condition on its mask group:

```sparkdown
morph talk {
  blend = cut
  unless {
    mouth.teeth
    mask.on
  }

  keyframes {
    from { mouth { state = closed } }
    50% { mouth { state = open } }
    to { mouth { state = closed } }
  }

  timing {
    trigger = speech
    duration = 0.16
  }
}
```

### Picking the morph

Several speech morphs can fit one face, as `talk` and `talk_gritted` both fit Raffles's confident face. A line chooses among them with a `morph` clause after the image's name:

- `[[raffles@confident morph talk_gritted]]` plays `talk_gritted`.
- `[[raffles@confident:mouth.closed morph none]]` plays no speech morph on the line's images, so the line's and the art's own choices show in the mouth.
- Without a clause, the morph marked `default = true` plays. A speech morph that is the only one fitting the look needs no mark.
- In a `+` composition, the clause applies to every image in the line that the morph plays on.

`default` is written at the morph's root and is not passed on through `as`, so `talk_gritted` above is not a default although its parent is. A named look cannot carry a `morph` clause; the line that shows it can.

When several speech morphs drive the same group on one face, none is picked and none or more than one is marked `default = true`, none of them plays there. The morphs carry one warning, naming a face where it happens. Mark exactly one of them `default = true`.

### Talking and blinking together

A speech morph plays beside the face's other morphs, each on its own clock, under the rule every morph shares ([The look a portrait shows](#the-look-a-portrait-shows)): they play together when they drive different groups, move different labels and name different labels in their clips. A blink on `eyes` and a talk on `mouth` share none of them. A talk that also moves the eyebrows a blink moves still overlaps it, and the face stays still with a warning naming both.

## Seeing it play

In the editor, the Game Preview plays morphs as soon as it shows a portrait.

- While the preview is stopped, morphs play on their own clock; nothing in the story advances. Nothing types there, so a speech morph shows its rest.
- During PLAY a speech morph flaps while its character speaks and rests between lines. After a load, a rewind or a restart the mouth rests until the next line speaks.
- During PLAY they follow the story's clock: pausing the story freezes each morph on its frame, and stepping moves it.
- Changing the expression of a character who is already on screen keeps the morph's place in its cycle. A different character, an edited morph, a restart or previewing another line starts it again from rest.
- Moved layers follow the same clock as the shapes: they freeze when the story pauses, return to where they are drawn when playback is off, and are let go with the portrait.
- The image shown when hovering over a portrait, and a portrait used as a mask, show the look at rest with its clips applied ([The look a portrait shows](#the-look-a-portrait-shows)). They do not move.

The `Animate portraits` button in the Game Preview's toolbar turns playback off and on. Off returns every morph to its rest and holds it there; on starts each one on a fresh cycle. The choice is kept in this browser for the editor, not saved with the project, and it does not change what players of the game see.

A portrait shows a still image until its morph is ready: the pose its moving drawing will show first, or the rest while playback is off. It shows the rest for good if the morph cannot be prepared.

## When something looks wrong

Problems with the declaration itself appear on the `morph` block, at the field that has them: a missing `method`, an unknown field or value, a state qualified with another group, `iteration_delay_max` without `iteration_delay_min` or below it, a `paints` entry with no `state`, a `when` or `unless` state written without its group, a layer movement field inside `rest`. Problems with how the morph fits the project's portraits also appear on the block, naming each portrait: a missing group or state, a folder that lacks a state the morph names. A state in `rest`, `when` or `unless` that no portrait the morph could play on draws is reported where it is written. A script line or named look whose choice a playing morph's rest replaces is warned on the choice. A label the morph names, in `layers`, `clips` or `paints`, that no portrait it plays on draws is reported where it is written, such as `No image the morph applies to has a layer labelled eyelash-top-right`; a label only some portraits draw is fine.

Problems found while preparing a portrait's movement appear on the artwork file, naming the morph, the layer and the looks it affects: a pair the method could not morph, a clip whose edges cannot form an opening, art the morph cannot move, a layer whose showing depends on two driven groups, a moved layer that draws part of a clip. They show once per artwork, even for art the script has not used yet.

When only part of a portrait moves, read the artwork's warnings first. The usual causes are:

- Labels that differ between states, so the drawings take the fallback instead of changing shape. Give them the same label.
- A label with two drawings in one state and three in the other, which pairs none of them. Make the counts equal, or one on one side.
- Lashes on both sides sharing one label, so they pair across the face. Repeat the side in each label.
- An eyeball cut to the open eye's outline, which shows its cut edge as the eye closes. Draw it whole.
- A look that should keep a state the morph drives, such as closed eyes, but shows the morph's rest instead: add the state to the morph's `unless`. The warning on the script line or named look that chooses it names the morph. A face drawn with that state as its `:default` gets no warning, so check its art too.
- A morph that plays nowhere you expect: check its `when` and `unless`, which are judged on the look before the rest applies.
- A portrait that shows still with an error on the artwork: it carries a style sheet, an inline style or a `transform` attribute the morph cannot read safely ([Art the morph can read](#art-the-morph-can-read)).
- A single shape that fades instead of moving: its geometry or transform is one the morph cannot follow, and the warning names its layer.
- A `spread-ignored` warning: the drawing paints a stroke, has a fill or shape `spread` cannot grow, or is not a single contour without overlaps or its own mask, so it keeps its own size; or none of its drawings moves between poses, so the `spread` changes nothing; or a clip's `spread` cannot apply to an opening cut in a target's own coordinates.
- A `depth-ignored` warning: the `depth` names a state of a group the label does not change with, or a pose that draws none of the label's moving shapes, so they keep their place in the rest pose.
- A `partner-missing` warning: a pose the label moves to or from draws neither it nor any label its `partner` lists. Add a drawing there, or list a label that pose draws.
- A `paint-target-missing` warning: a `paints` entry names a label its pose does not draw, so nothing takes that paint. Check the label's spelling, or the entry's `state`.
- A moved layer that stays put: it draws part of a clip's edges or targets, something outside it draws it again by reference (a `<use>` of it), or this look does not draw a layer with its label (check the label's spelling in the artwork).

For a speech morph:

- `delay` or `iterations` on a speech morph is an error on the field: speech decides when the plays start and how many there are.
- `default` on a morph that is not `trigger = speech` is an error, and so is a `default` that is not `true` or `false`.
- A `morph` clause naming no morph, or a morph that is not a speech morph, is an error on the clause. One naming a speech morph that plays on none of the line's images, because it does not fit them or its `when` or `unless` keeps it off their looks, is a warning.
- A warning on the morphs that they play on one image and drive the same group: none of them plays there until a line picks one or exactly one is marked `default = true`.
- A mouth that never moves: check that the cue names a `define … as character`, that the portrait's name up to its first `@` is that define's name, and that the line has voiced characters or a `voice` clip.
- A mouth that shows the morph's rest instead of the line's choice: the choice gets a warning naming the morph. Route the look with `when` or `unless`, or add `morph none` to the line.

`morph` is a built-in type name, so a variable called `morph` is reported, as `style` or `animation` would be.

## The reference project

The project these rules were developed on declares its blink like this. Its art follows the preparation above: matching side labels, both open right lashes listed as edges, whole eyeballs as `eyeball-white-*`, `eyeball-shadow-*` and `pupil-*`, and shadows that take the closed lash's shape:

```sparkdown
morph blink {
  blend = morph
  method = bend
  fallback = fade
  unless = eyes.closed

  layers {
    creases {
      fallback = scale
    }
    eyeball-shadow-left {
      partner {
        eyelash-left
      }
      spread = -1px
    }
    eyeball-shadow-right {
      partner {
        eyelash-right
        eyelash-top-right
      }
      spread = -1px
    }
  }

  keyframes {
    0% {
      eyes {
        state = eyes.open
      }
    }
    33.333% {
      eyes {
        state = eyes.closed
      }
      eyebrows {
        translate = 0 8px
      }
      nose {
        translate = 0 -2px
      }
      masked-nose {
        translate = 0 -2px
      }
    }
    100% {
      eyes {
        state = eyes.open
      }
    }
  }

  timing {
    duration = 0.25
    easing = steps(3)
    delay = 0.7
    iterations = infinite
    iteration_delay_min = 0.2
    iteration_delay_max = 6
  }

  clips {
    {
      between {
        eyelash-left
      }
      targets {
        eyeball-white-left
        eyeball-shadow-left
        pupil-left
      }
      spread = 1px
    }
    {
      between {
        eyelash-right
        eyelash-top-right
        eyelash-bottom-right
      }
      targets {
        eyeball-white-right
        eyeball-shadow-right
        pupil-right
      }
      spread = 1px
    }
  }

  paints {
    {
      targets {
        eyelash-left
        eyelash-right
      }
      state = eyes.closed
      when = mask.on
      fill = #c9c9c9
      span = 40%
    }
  }
}
```

Its timing is the project's own tuning, still provisional, not a recommendation: the eyes close in the first third of a quarter-second play, `steps(3)` gives the blink a drawn, three-frame look, and the gaps range from a fifth of a second to six seconds.

With each closing the eyebrows drop 8 units and the nose, and the nose drawn on a mask, lift 2 units, by `translate` in the artwork's own units (each portrait is 3240 units tall). The prototype the blink was designed from moved them by 6% and 1.5% of each face's eye height, which across the project's five characters comes to 4.5 to 13.5 units for the brows and 1.1 to 3.4 for the nose; 8 and 2 sit in the middle of the characters' typical figures. One morph moves every face by the same distance, so a face with small eyes scrunches a little more than the prototype did and a face with large eyes a little less.

# Portrait morphs

A portrait drawn with layers already has its states: eyes open and eyes closed, a mouth open and shut, a door ajar and a door closed. [Character Portraits](./Portraits.md) shows how the script chooses one. A `morph` makes the portrait move between them on its own: the drawings of one state bend, fade or scale into the drawings of the next. A morph whose first and last poses are both the state the portrait was drawn in brings it back there after every play. A morph that stops after a set number of plays holds the pose its final play ends on: the last pose with the default `direction = normal`, the first with `reverse`, and for the alternating directions whichever end the final play reaches.

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

That is all the script needs. Every portrait with an `eyes` group that has `open` and `closed` states, and that rests open, now blinks once when it appears. Nothing in a scene has to mention the morph: `[[mia]]` and `[[mia:happy]]` both play it.

Reading it:

- `morph blink { … }` declares a morph named `blink`. Like `style` and `animation`, it is written at a script's top level and takes a brace body.
- `keyframes` lists the poses. Each pose names a group as a container, `eyes { … }`, and the `state` it shows there.
- `method = bend` says how a drawing changes shape into its counterpart. The methods are described below; a morph that changes shapes has to name one.

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
  keyframes {
    from { eyes { state = open } }
    50% { eyes { state = closed } }
    to { eyes { state = open } }
  }
}
```

A `state` is always the name of an option, never a variable or a number, so `state = closed`, `state = "closed"`, `state = 01` and `state = open-wide` are each read as written. It may also be qualified with its group, `state = eyes.closed`, the way a script line writes it. The qualifier has to be the container's own group: `state = mouth.closed` inside `eyes { … }` is an error. After you type `eyes.`, the editor completes the states the project's portraits draw.

The first pose is the state a portrait has to rest in for the morph to play on it, as [Which portraits a morph plays on](#which-portraits-a-morph-plays-on) describes. Make the last pose that state too, so the portrait comes back to rest whichever direction the morph plays in. Every group the morph drives needs its `state` in the first pose; a morph whose group first appears in a later pose is an error and plays nowhere. As in CSS keyframes, a last pose that leaves a group out uses the portrait's resting state there.

An option with a hyphen is a kind of the word before it ([The naming rules](./Portraits.md#the-naming-rules)). A morph whose first pose is `open` therefore also plays on a portrait resting in `open-wide`, and returns it to `open-wide`, because each portrait keeps its own resting choice.

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

A `paints` entry recolours the drawings of its `targets` labels at one pose: the colour moves in as the pose approaches and away as it leaves. `state` names the pose with its group. `when` limits the entry to portraits that draw a layer needing another group's state, such as a mask switched on:

```sparkdown
morph blink {
  method = bend

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

- Every group a morph drives has its `state` in the first pose, because the first pose is what a portrait has to rest in. A group whose first `state` comes in a later pose is an error on that `state`, and the morph plays on no portrait until it is fixed.
- Each group moves between the nearest poses that set it, on the same timing as the others.
- A portrait plays the morph only when it rests at the first pose in every group. If one group rests elsewhere, the whole look stays as drawn: a morph never moves half a face.
- A drawing belongs to at most one group the morph drives. A layer whose showing depends on two or more of them together, such as a crease drawn only while the eyes are closed and the brows are down, keeps the portrait still with a `mixed-groups` error on the artwork. Draw it under one group.

### Moving layers

A container named after a layer label, rather than a group, moves the drawings with that label. It takes CSS's 2D transform properties and opacity:

```sparkdown
morph blink {
  method = bend

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
- It is compatible when it has every one of those groups, and every state the keyframes name in them. A portrait missing a group or a state is reported on the morph, naming the portrait and what it lacks.
- Each compatible portrait is then checked as each look the script asks for: the plain portrait, every named look built on it and every script line that selects attributes.

For each look, every visible folder that draws the group has a resting state: the state the look selects, or the folder's `:default`. Then:

- If every folder rests in the state of the morph's first pose, the morph plays. This check uses the first pose whatever the `direction`, though a `reverse` play begins from the last pose, which is one more reason to make the two the same state.
- If every folder rests in another state, the look is dormant: it stays exactly as drawn and nothing is reported. `[[mia:eyes.closed]]` does not blink, and neither does a face whose eyes are marked `eyes.closed:default`. This is how a sleeping face keeps its eyes shut under a blinking morph.
- If some folders rest in the first pose's state and others do not, the look is skipped, with a warning on the morph that names the folders and their states. Mark the same resting state in each folder, or select one in the script.
- A folder with no resting state for the group, or with two, is reported the same way.

A morph that drives several groups makes these checks for each of them, and the look plays only when every group passes. One dormant group makes the whole look dormant, and one skipped group skips it.

A group is driven by its name. Renaming a group, `eyes` to `lids` say, takes those portraits out of a blink that drives `eyes`; change the script lines and named looks that select `eyes.closed` to match, or they select a group that no longer exists.

Several morphs can play on one portrait at once, each on its own timing, so a face can blink while its mouth moves. They play together when they drive different groups, move different labels and name different labels in their clips' `between` and `targets`. If any two of them share a group, a moved label or a clip label, none of them plays: the portrait stays still, with a warning that names the morphs and what they share. A drawing whose showing depends on groups that two of the morphs drive, such as a crease conditioned on `eyes.closed` inside a `mouth.open` layer, also keeps the portrait still, with an error on the artwork.

## Timing

Timing is set in `timing { … }`. Every value is optional:

| Field | Default | Meaning |
| --- | --- | --- |
| `duration` | `0.25` | Seconds one play lasts. |
| `delay` | `0` | Seconds before the first play only. |
| `iterations` | `1` | How many plays in all: a whole number, or `infinite`. `0` turns playback off. |
| `iteration_delay_min` | none | Shortest quiet time, in seconds, from the end of one play to the start of the next. |
| `iteration_delay_max` | none | Longest such time. |
| `direction` | `normal` | `normal`, `reverse`, `alternate` or `alternate-reverse`, as in CSS. A morph with a set number of plays stops on the pose its final play ends at. |
| `easing` | `ease-out` | The timing curve over a whole play: a CSS name, `cubic-bezier(…)`, `steps(…)` or `linear(…)`. |

`iteration_delay_min` and `iteration_delay_max` are written together. Each gap is drawn independently and evenly between them, so a blink with `2` and `6` never settles into a rhythm. Without them, plays follow each other with no gap.

`easing` applies once, to the whole play, not to each segment between poses: `steps(3)` gives the whole blink three visible steps.

There is no control for a double blink. A morph with more poses (open, closed, open, closed, open) plays one.

## Seeing it play

In the editor, the Game Preview plays morphs as soon as it shows a portrait.

- While the preview is stopped, morphs play on their own clock; nothing in the story advances.
- During PLAY they follow the story's clock: pausing the story freezes each morph on its frame, and stepping moves it.
- Changing the expression of a character who is already on screen keeps the morph's place in its cycle. A different character, an edited morph, a restart or previewing another line starts it again from rest.
- Moved layers follow the same clock as the shapes: they freeze when the story pauses, return to where they are drawn when playback is off, and are let go with the portrait.
- The image shown when hovering over a portrait, and a portrait used as a mask, show the still portrait with its clips applied. They do not move.

The `Animate portraits` button in the Game Preview's toolbar turns playback off and on. Off returns every morph to rest and holds it there; on starts each one on a fresh cycle. The choice is kept in this browser for the editor, not saved with the project, and it does not change what players of the game see.

A portrait shows its still image until its morph is ready, and keeps it for good if the morph cannot be prepared.

## When something looks wrong

Problems with the declaration itself appear on the `morph` block, at the field that has them: a missing `method`, an unknown field or value, a state qualified with another group, `iteration_delay_max` without `iteration_delay_min` or below it, a `paints` entry with no `state`. Problems with how the morph fits the project's portraits also appear on the block, naming each portrait: a missing group or state, folders resting in different states. A label the morph names, in `layers`, `clips` or `paints`, that no portrait it plays on draws is reported where it is written, such as `No image the morph applies to has a layer labelled eyelash-top-right`; a label only some portraits draw is fine.

Problems found while preparing a portrait's movement appear on the artwork file, naming the morph, the layer and the looks it affects: a pair the method could not morph, a clip whose edges cannot form an opening, art the morph cannot move, a layer whose showing depends on two driven groups, a moved layer that draws part of a clip. They show once per artwork, even for art the script has not used yet.

When only part of a portrait moves, read the artwork's warnings first. The usual causes are:

- Labels that differ between states, so the drawings take the fallback instead of changing shape. Give them the same label.
- A label with two drawings in one state and three in the other, which pairs none of them. Make the counts equal, or one on one side.
- Lashes on both sides sharing one label, so they pair across the face. Repeat the side in each label.
- An eyeball cut to the open eye's outline, which shows its cut edge as the eye closes. Draw it whole.
- A look resting in another state than the morph's first pose, which is dormant by design. With several groups, check each one.
- A portrait that shows still with an error on the artwork: it carries a style sheet, an inline style or a `transform` attribute the morph cannot read safely ([Art the morph can read](#art-the-morph-can-read)).
- A single shape that fades instead of moving: its geometry or transform is one the morph cannot follow, and the warning names its layer.
- A `spread-ignored` warning: the drawing paints a stroke, has a fill or shape `spread` cannot grow, or is not a single contour without overlaps or its own mask, so it keeps its own size; or none of its drawings moves between poses, so the `spread` changes nothing; or a clip's `spread` cannot apply to an opening cut in a target's own coordinates.
- A `depth-ignored` warning: the `depth` names a state of a group the label does not change with, or a pose that draws none of the label's moving shapes, so they keep their place in the rest pose.
- A `partner-missing` warning: a pose the label moves to or from draws neither it nor any label its `partner` lists. Add a drawing there, or list a label that pose draws.
- A `paint-target-missing` warning: a `paints` entry names a label its pose does not draw, so nothing takes that paint. Check the label's spelling, or the entry's `state`.
- A moved layer that stays put: it draws part of a clip's edges or targets, something outside it draws it again by reference (a `<use>` of it), or this look does not draw a layer with its label (check the label's spelling in the artwork).

`morph` is a built-in type name, so a variable called `morph` is reported, as `style` or `animation` would be.

## The reference project

The project these rules were developed on declares its blink like this. Its art follows the preparation above: matching side labels, both open right lashes listed as edges, whole eyeballs as `eyeball-white-*`, `eyeball-shadow-*` and `pupil-*`, and shadows that take the closed lash's shape:

```sparkdown
morph blink {
  blend = morph
  method = bend
  fallback = fade

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

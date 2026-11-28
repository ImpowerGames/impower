# 19. Framings

A framing is where the view of a layer's picture rests: how far across the picture, how far down, and how close. Name a framing when you show a picture, and it appears already there. Name one on `animate`, and the picture travels there from wherever the view is now. This is how you pan across a wide backdrop or push in on part of it.

```sparkdown
framing sofa {
  x = 60%
  y = 100%
  zoom = 1.2
}

scene start
  [[show backdrop bg_apartment at right]]
  The apartment is dark.
  [[animate backdrop to left over 5s]]
  Bunny tears through the room, looking for a first aid kit.
  [[animate backdrop to sofa over 1s]]
  He drops to his knees beside the sofa.
end
```

Pan and zoom are framings, not animations. An `animation` is for an effect that plays and returns to rest, such as `shake`. A framing is a place the view stays until another line moves it. Because the engine moves the picture with `translate` and `scale` only, the travel runs on the graphics card and does not slow the text that types beside it.

---

## 19.1 Defining a framing

Write the `framing` keyword, a name, and a body with up to three fields:

```sparkdown
framing sofa {
  x = 60%
  y = 100%
  zoom = 1.2
}
```

- **`x`** is a percentage across. `x = 60%` puts the point 60% across the picture on the point 60% across the layer. So `0%` sets the picture's left edge on the layer's left edge, `100%` sets the right edges together, and `50%` centres the picture.
- **`y`** is the same rule from the top. `0%` sets the top edges together and `100%` the bottom edges.
- **`zoom`** is a number. `1` is the size the layer draws the picture at without a framing, and `1.2` is a fifth larger. The picture grows about the framing's own point, so the `x` and `y` rule holds at any zoom.

Because the rule matches points, not distances, a framing gives the same view whether the picture is wider or narrower than its layer, and on any screen shape.

A field you leave out takes its default: `x = 50%`, `y = 50%` and `zoom = 1`. A framing is a whole view, so its name always gives the same view whatever ran before it:

```sparkdown
framing closeup {
  zoom = 1.5
}
```

`closeup` is centred, at one and a half times the size.

An `x` or `y` outside `0%` to `100%`, or a `zoom` below `1`, is allowed and can show past the picture's edge. The editor reports a field other than `x`, `y` and `zoom`, an `x` or `y` that is not a percentage, and a `zoom` of zero or less.

### The built-in framings

Nine framings are built in, named the way CSS names positions. Each is at `zoom = 1`:

| Framing | `x` | `y` |
| --- | --- | --- |
| `left` | `0%` | `50%` |
| `center` | `50%` | `50%` |
| `right` | `100%` | `50%` |
| `top` | `50%` | `0%` |
| `bottom` | `50%` | `100%` |
| `top_left` | `0%` | `0%` |
| `top_right` | `100%` | `0%` |
| `bottom_left` | `0%` | `100%` |
| `bottom_right` | `100%` | `100%` |

A framing of your own with a built-in's name changes that built-in, as an `animation` with a built-in's name does. The fields you write replace the built-in's, and the fields you leave out keep the built-in's values, not the defaults. This makes `top_left` sit 10% in from the left, still at the top:

```sparkdown
framing top_left {
  x = 10%
}
```

---

## 19.2 Showing a picture at a framing

Add `at` and a framing's name to a line that shows a picture. The picture appears already there:

```sparkdown
scene start
  [[show backdrop bg_apartment at right]]
  The apartment is dark.
end
```

`at` works on `show` and on the bare shorthand for a character's portrait, such as `[[bunny@serious at left]]`.

A picture shown without `at` is at the default framing, centred at zoom 1, which looks exactly as the layer draws it without framings. On a plain layer that holds even when the layer was at another framing before: showing a new picture puts the layer back at the default. To swap one backdrop for another and keep the view, write the `at` again:

```sparkdown
scene start
  [[show backdrop bg_apartment at right]]
  The lights are on.
  [[show backdrop bg_apartment_dim at right]]
  The lights go out.
end
```

Hiding the layer, or clearing it, also puts it back at the default.

In a [cast](./Streams.md#a-cast-keeps-one-entry-per-character), each character's entry is its own layer for framings. `[[mia@happy at left]]` frames only Mia's picture, so two characters can hold different framings at once. A character keeps their framing: a new picture of Mia with no `at` stays where she was, including after her entry has emptied or gone and is made again. A later `at` or `animate mia to …` changes it, and hiding Mia or the layer ends it. To put a character back at the default, write `at center`, since the built-in `center` draws the same view as the default. A framing moves the picture inside its own element, and the style places the element, so the two add up.

The editor reports `at` on `animate` or `hide`, and `at` on a `show` that names no picture, such as `[[show backdrop at right]]`. A name after `at` that is not a framing is reported as an unknown name after `with` is.

---

## 19.3 Travelling to a framing

Add `to` and a framing's name to `animate`. The layer's picture travels from its view on screen to that framing:

```sparkdown
scene start
  [[show backdrop bg_apartment at right]]
  The apartment is dark.
  [[animate backdrop to left over 5s]]
  Bunny runs from one end of the room to the other.
end
```

`to` moves the picture the layer already shows, so an `animate … to` line names no picture: `[[animate backdrop bg_apartment to left]]` is reported. On a layer that shows no picture, `to` changes nothing. `to` on `show`, `hide` or the bare shorthand is reported too.

The clauses that time an animation time a travel:

| Clause | Meaning |
| --- | --- |
| `over 5s` | The travel takes five seconds. Without `over`, the picture arrives at once. |
| `after 0.5s` | The travel starts half a second after the line. |
| `ease linear` | The travel moves at a steady pace. Without `ease`, it takes the easing an animation gets when it names none. |
| `wait` | The story holds until the picture arrives. |

```sparkdown
scene start
  [[show backdrop bg_apartment at right]]
  [[animate backdrop to left over 4s ease linear wait]]
  The whole room has gone past before this line types.
end
```

`to` and `with` can share a line. Both run, and `over`, `after` and `ease` time each:

```sparkdown
scene start
  [[show backdrop bg_apartment at right]]
  [[animate backdrop to bottom_right over 1s with shake]]
  He dumps the supplies in front of the sofa.
end
```

A timing clause belongs to the side of the `with` it is written on. Written before the first `with`, it times the travel. Written after a `with`, it times that `with`'s animation. A `with` takes each timing word it lacks from the line. A line with no timing word of its own takes all of the first `with`'s, and a line with any of its own borrows none. So the line above and `[[animate backdrop to bottom_right with shake over 1s]]` both shake for a second while the picture travels for a second:

| Line | What plays |
| --- | --- |
| `[[animate backdrop to left over 1s with shake]]` | The travel takes 1s. The shake has no `over` and takes the line's, 1s. |
| `[[animate backdrop to left with shake over 1s]]` | The shake takes 1s. The line has no `over` and takes the `with`'s, so the travel takes 1s. |
| `[[animate backdrop to left over 1s with shake over 2s]]` | The travel takes 1s and the shake 2s. |
| `[[animate backdrop to left over 4s with shake after 3s over 1s]]` | The line has an `over` of its own, so it borrows nothing: the travel starts at once and takes 4s. The shake starts 3s in and takes 1s. |

A line can name several `with` clauses, and each borrows only from the line, never from another `with` (see [Several animations at once](./AnimationTheme.md#several-animations-at-once)). `wait` holds the story until the travel and every `with` have ended, each counted as its `after` plus its length:

```sparkdown
scene start
  [[show backdrop bg_apartment at right]]
  [[animate backdrop to left over 4s with shake after 3s over 1s wait]]
  The shake ends as the view arrives, four seconds in, and only then does this line type.
end
```

Only the layer the line names moves. `[[animate backdrop to left over 5s]]` pans the backdrop and leaves the portrait layer, and every other layer, where it is.

In a cast, `animate` also takes a character's name: `[[animate mia to center over 1s]]` moves Mia's picture and leaves every other entry where it is, while `[[animate portrait to center over 1s]]` moves every entry's picture. See [Hiding and animating one character](./Streams.md#hiding-and-animating-one-character).

---

## 19.4 The rules a travel follows

- **A travel keeps going across lines.** Advancing the story does not end it. It goes on until it arrives, or until another `to` on the same layer redirects it.
- **A travel starts from the view on screen.** A `to` that comes while an earlier one is still in flight starts from wherever the picture is at that moment, not from where the earlier travel was going.
- **A new picture ends a travel.** On a plain layer, showing a picture, hiding the layer or clearing it ends the travel and puts the layer back at the default framing, unless the `show` says `at`. In a cast, a new picture of a character with no `at` takes the framing the travel was going to.
- **Pausing pauses a travel.** Resuming the game continues it, as it continues every animation.
- **A save holds where the view is going.** A game saved during a travel loads with the picture already arrived.
- **The preview shows every framing arrived.** When the Game Preview is stopped on a line, every travel before it has reached its framing, including one that play would still have in flight. Replay beat plays the travels of that beat's own lines, each starting from where the earlier beats' travels end. See [Previewing a Line](./PreviewingALine.md).

---

## 19.5 A worked example

A scene in Raffles and Bunny pans across a wide apartment backdrop while Bunny searches it, pans back, and pushes in on the sofa. The backdrop is much wider than the screen, so `right` and `left` show its two ends. The portrait stays where it is the whole time, because only the backdrop layer moves:

```sparkdown
framing sofa {
  x = 60%
  y = 100%
  zoom = 1.2
}

scene start
  [[show backdrop bg_apartment at right]]
  [[show portrait bunny_serious]]
  First step is to stop the bleeding.

  [[animate backdrop to left over 5s]]
  Bunny tears through Raffles' apartment, desperately searching for anything resembling a first aid kit.

  He tosses bits and bobs from the shelves -- crystal stemware, porcelain figures, novelty mugs, a grappling hook?

  [[animate backdrop to right over 2s]]
  Bunny cuts past a wall smothered in oil paintings and cuckoo clocks, leaving a trail of muddy footprints in his wake.

  [[animate backdrop to sofa over 1s]]
  He dumps the supplies in front of the sofa and drops to his knees beside Raffles.
end
```

- The first line shows the backdrop at its right end, before anything has typed.
- The five-second pan to `left` keeps going while the next two lines type. If the player reads fast, the second `to` starts from wherever the first had got to.
- The push in to `sofa` sets `x`, `y` and `zoom` together, so it lands on the same view whichever travel came before it.
- Stopped on the last line, the Game Preview shows the backdrop at `sofa`.

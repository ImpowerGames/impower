# 20. Streams and Casts

A `text` element holds one line, and the next line replaces it. A `stream` keeps every line that goes to it: for each one, it adds a copy of the elements written inside it after the copies before. Each copy is an entry. A message thread, a log or a page of narration is a stream. A `cast` keeps one entry per character instead (see [A cast keeps one entry per character](#a-cast-keeps-one-entry-per-character)).

## A stream adds an entry for each line

```sparkdown
layout phone {
  thread {
    stream {
      dialogue.bubble { text }
    }
  }
}

style bubble {
  text-color = white
}

scene start
  [[open phone]]
  RAFFLES: slight problem
  RAFFLES: doors locked
  BUNNY: Anything you can do about it?
  [[clear phone]]
  RAFFLES: maybe
  [[close phone]]
end
```

The elements written inside a `stream` are its templates. A line goes to the stream when a template is named after the line's kind, by the same rule that sends a line to a box: `dialogue` takes dialogue lines, `action` takes action lines, and a name you write to with `@name:` takes those lines. A stream may hold a template for each kind it shows:

```sparkdown
layout log {
  stream {
    dialogue.said {
      character_name { text }
      dialogue { text }
    }
    action.narrated { text }
  }
}
```

A template can be limited to a variant ([Variants](./Variants.md)). A line makes its entry from the template limited to its variant, and a template with no `#variant` takes every line that no limited template takes:

```sparkdown
layout phone {
  thread {
    stream {
      dialogue.bubble.incoming #variant=receive { text }
      dialogue.bubble.outgoing #variant=send { text }
      dialogue.bubble { text }
    }
  }
}
```

Here `RAFFLES [receive]:` makes an incoming bubble, `BUNNY [send]:` an outgoing one, and a line with any other variant, or none, a plain bubble. Without the last template those lines would add nothing. Every entry carries `#variant` and `#speaker` for its own line, whichever template made it, so `#variant=send { … }` and `#speaker=bunny { … }` in a style select it.

A line of a kind with no template adds nothing to the stream. Each line adds one entry after the last, and types into its entry as it would into a box: the speaker's name goes to a `character_name` inside the entry, the line to the element named after its kind, and a click finishes the typing. Each line waits for a click before the next one, as a line in a box does, unless the stream advances by itself (see [A stream that advances by itself](#a-stream-that-advances-by-itself)).

Whatever a line writes into its entry stays there as long as the entry does. Entries stay until `[[clear phone]]` or `[[close phone]]`. After a clear, the line the clear is on becomes the first entry; after a close, the layout opens empty the next time. `clear` works on any layout that holds a stream, and on `textstream` (see [Screens & Navigation](./Screens.md)). On a layout with no stream, the editor warns "`card` has no stream to clear." and the game ignores it.

An entry appears and leaves as any element does (see [Appearing and leaving](./StyleProps.md#appearing-and-leaving)): a new entry arrives from its `@initial` look, and a clear plays each entry's `@hide` before removing it. A line that extends the line before it adds to that entry, which stays on screen.

The newest entry is `@latest`, so a style can set it apart from the entries before it:

```sparkdown
style bubble {
  text-color = white
  opacity = 0.5
  @latest { opacity = 1 }
}
```

A stream is an element like any other, so it takes classes and props, and a `style stream` block or a class styles it. It scrolls to keep its newest entry in view, as the text page does, when the stream or the element around it is given a height and lets its content scroll:

```sparkdown
layout phone {
  stream.thread #height=240px {
    dialogue.bubble { text }
  }
}

style thread {
  overflow-y = auto
  pointer-events = auto
}
```

`pointer-events = auto` lets the reader scroll the stream with the wheel or a finger. Scroll up to reread, and it stays where you are until you scroll back to the bottom. Under the reader's reduced-motion setting it jumps instead of scrolling smoothly.

Saves and checkpoints keep the entries. The preview on a line and a step back show the entries the game would have at that line.

With the text box and a stream both open, a line shows in both.

## A stream that advances by itself

A `stream NAME { }` block sets the streams in the layout of that name. It is written on its own, outside the layout:

```sparkdown
layout phone {
  thread {
    stream {
      dialogue.bubble { text }
    }
  }
}

stream phone {
  advance = auto
  pause = 0.6s
}

scene start
  [[open phone]]
  RAFFLES: slight problem
  RAFFLES: doors locked
  BUNNY: Anything you can do about it? >
  RAFFLES: maybe
  BUNNY: You know how to pick locks?? >
end
```

| Setting | Values | Built-in value | Meaning |
| --- | --- | --- | --- |
| `advance` | `click`, `auto` | `click` | Whether each line waits for a click or follows the one before it. |
| `pause` | a time | `0.4s` | With `auto`, how long after a line finishes typing the next one starts. |

The block is the only way to write these settings: `define phone as stream` is refused, as it is for styles, layouts, animations and morphs. A block that names no layout gets the warning "No layout is named `phnoe`."

A stream that advances by itself starts each line `pause` after the one before it finishes typing. It waits for a click at the last line before the story leaves the stream, where the next line goes elsewhere, a menu comes up or the story ends, and at any line that ends with `>`, the mark that already means "wait for a click". A click before a wait shows every line up to that wait at once.

### Runs are gathered

A run is every line a stream shows from one wait to the next. The game reads a run's lines before it shows any of them, as it reads a menu's options, makes room for all of them, and then shows them in order. The stream has the size its gathered entries need before the first line shows, and each entry takes its place when its line starts, so a box around the stream is sized once rather than growing with each line. Whether the lines then fill from the top or stack from the bottom is up to the stream's style.

- A stream in a layout that opened by itself (see [Screens & Navigation](./Screens.md)) is gathered to that layout's close, so its box is sized once even when each line waits for a click or a line ends with `>`.
- A stream in a layout you opened with `[[open NAME]]` is gathered to its next wait.
- With `advance = click` in a layout you opened, each line is a run of its own, so a page of text still grows line by line.
- Reading stops at a menu.
- A run holds at most 100 lines. In a longer stretch with no wait, such as lines written in an endless loop, the stream waits for a click at every hundredth line, and each part of up to 100 lines is gathered and sized on its own.

Pictures, sounds and directives written on a line happen when that line starts, not when it is read. Game logic between gathered lines runs before the first of them shows; to make a line wait for that logic, end the line before it with `>`.

Each wait is one step: stepping back from a line after a run returns to the wait before it, and a save taken at a wait loads with the lines shown up to it. The preview on a line inside a run makes room for every gathered line and shows the lines up to the one you picked.

## A cast keeps one entry per character

A stream keeps one copy of the elements inside it for each line; a `cast` keeps one for each character. Each copy is an entry, and it belongs to its character for as long as it stays:

```sparkdown
layout main {
  stage {
    backdrop { image }
    cast {
      actor {
        portrait #clear { image }
      }
    }
  }
}
```

Every element written directly inside the cast is part of each entry, so `cast { portrait { image }; character_name { text } }` gives each character a picture and a name. A picture goes to the entry of the character it shows. The name before `@` already says whose picture it is, so `[[mia@happy]]` goes to Mia's entry, making one if she has none, and a later `[[mia@sad]]` changes her picture in place. A picture shown on a line nobody speaks makes an entry too. A name written to a text element inside the cast, such as a `character_name`, goes to the entry of the line's speaker. An element of the same name outside the cast shows the picture or the name as it would without one.

### Hiding and animating one character

`hide` and `animate` take a character's name wherever they take a layer's name, and act on that character's entry alone:

```sparkdown
scene start
  [[mia@happy at left]]
  [[sam@calm at right]]
  MIA: You came.
  [[animate mia to center over 1s]]
  SAM: I said I would.
  [[animate sam with shake]]
  [[hide mia]]
  SAM: Fine. Go.
  [[hide portrait]]
end
```

`[[hide mia]]` removes Mia's entry, which plays its `@hide`, and leaves Sam's. `[[animate mia to center over 1s]]` moves only Mia's picture, and `[[animate sam with shake]]` shakes only Sam's. A layer's name reaches every entry in a cast that holds that layer: `[[animate portrait with shake]]` shakes them all, and `[[hide portrait]]` removes them all. A character with no entry on screen is left alone, as hiding an empty layer is.

Each entry is its own layer for [framings](./Framings.md), so `[[mia@happy at left]]` frames only Mia's picture and `[[sam@calm at right]]` frames only Sam's. A framing moves the picture inside its own element, and a style places the element, so the two add up. Showing a new picture of a character puts that entry back at the default framing unless the line writes `at` again, as for a plain layer.

When a character and a layer share a name, the layer wins, and the editor warns "`mia` names a layer and a character. `hide` and `animate` use the layer." After `hide` and `animate`, the editor offers the characters that have pictures beside the layers.

### What a style can tell about an entry

- `#speaker=mia` selects the entry Mia's pictures go to, whether or not she has spoken. It takes the character's define name.
- `#variant=left` selects an entry whose character's newest line is labelled `[left]` (see [Variants](./Variants.md)). It changes when that character next speaks.
- `@latest` is true on the entry of whoever is speaking now, and on none during a line with no speaker or one whose speaker has no entry.

```sparkdown
style actor {
  left = 62%
  transition-property = left, translate
  transition-duration = 0.18s
  @initial { translate = 64px 0 }
  #variant=left {
    left = 24%
    scale = -1 1
    @initial { translate = -64px 0 }
  }
  #variant=right { left = 76% }
  @latest { > portrait { filter = none } }
}

style portrait {
  filter = brightness(55%) saturate(85%)
  transition = filter 0.26s
}
```

With this style a single speaker stands at one spot, the two speakers of an exchange stand left and right with the one not speaking dimmed, and a speaker who carries on after the exchange slides from their exchange spot to the single spot, because it is the same entry.

### How long an entry stays

An entry is on screen while it has content, and [`#clear`](./Structure.md#clear-content-that-lasts-one-line) on its picture says how long that is:

- Without `#clear`, the picture stays until the script hides it. This suits a game that keeps several characters on screen.
- With `#clear`, the picture lasts as long as the line that showed it is on screen: one line in a dialogue box, and as long as that line's entry stays in a stream, which keeps both speakers of an exchange up.
- If the next line shows a picture of the same character, the picture is replaced, not emptied, so the entry stays and only its `#variant` changes.

An emptied entry stays, unseen, until another character's entry arrives or the script hides it. With the two-level template above, a speaker who returns after a line of narration appears in place at once, as any picture does when it is shown, and a different speaker slides in, because the new entry's `@initial` plays. A property named in an `@initial` block moves only when the element's transition names it, as `translate` is named here. A one-level template, `cast { portrait #clear { image } }`, suits a game where every appearance should slide.

Saves and checkpoints keep the entries. The preview on a line and a step back show the cast the game would have at that line.

The built-in `main` layout keeps its plain `portrait` slot. Write a `layout main` of your own to use a cast.

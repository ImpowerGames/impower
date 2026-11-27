# 20. Streams

A `text` element holds one line, and the next line replaces it. A `stream` keeps every line that goes to it: for each one, it adds a copy of the elements written inside it after the copies before. Each copy is an entry. A message thread, a log or a page of narration is a stream.

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
- The game reads at most 100 lines ahead of the line on screen. In a longer run, such as lines written in an endless loop, the room made covers the next 100 lines.

Pictures, sounds and directives written on a line happen when that line starts, not when it is read. Game logic between gathered lines runs before the first of them shows; to make a line wait for that logic, end the line before it with `>`.

Each wait is one step: stepping back from a line after a run returns to the wait before it, and a save taken at a wait loads with the lines shown up to it. The preview on a line inside a run makes room for every gathered line and shows the lines up to the one you picked.

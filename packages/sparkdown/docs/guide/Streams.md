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

A line of a kind with no template adds nothing to the stream. Each line adds one entry after the last, and types into its entry as it would into a box: the speaker's name goes to a `character_name` inside the entry, the line to the element named after its kind, and a click finishes the typing. Each line waits for a click before the next one, as a line in a box does.

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

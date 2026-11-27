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

`[[hide portrait]]` hides the picture in every entry and removes the entries.

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
  transition = filter 0.26s, opacity 0.26s
  @initial { opacity = 0 }
  @hide { opacity = 0; transition-duration = 0.02s }
}
```

With this style a single speaker stands at one spot, the two speakers of an exchange stand left and right with the one not speaking dimmed, and a speaker who carries on after the exchange slides from their exchange spot to the single spot, because it is the same entry.

### How long an entry stays

An entry is on screen while it has content, and [`#clear`](./Structure.md#clear-content-that-lasts-one-line) on its picture says how long that is:

- Without `#clear`, the picture stays until the script hides it. This suits a game that keeps several characters on screen.
- With `#clear`, the picture lasts as long as the line that showed it is on screen: one line in a dialogue box, and as long as that line's entry stays in a stream, which keeps both speakers of an exchange up.
- If the next line shows a picture of the same character, the picture is replaced, not emptied, so the entry stays and only its `#variant` changes.

An emptied entry stays, unseen, until another character's entry arrives or the script hides it. With the two-level template above, a speaker who returns after a line of narration fades back in place, because only the picture's `@initial` plays, and a different speaker slides in, because the new entry's `@initial` plays as well. A property named in an `@initial` block moves only when the element's transition names it, as `translate` is named here. A one-level template, `cast { portrait #clear { image } }`, suits a game where every appearance should slide.

Saves and checkpoints keep the entries. The preview on a line and a step back show the cast the game would have at that line.

The built-in `main` layout keeps its plain `portrait` slot. Write a `layout main` of your own to use a cast.

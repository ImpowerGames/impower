# 21. Variants

A word in a cue's brackets is the line's variant, a label on the line: `BUNNY [shout]:`, `RAFFLES [receive]:`, `BUNNY [right]:`. Layouts, styles and typewriters can use a line's variant, and its speaker, to treat it differently from other lines.

```sparkdown
define raffles as character with
  name = "RAFFLES"
end

define bunny as character with
  name = "BUNNY"
end

scene start
  RAFFLES [<]: Well-- I mean--
  BUNNY [right]: Seriously???
  BUNNY [shout]: I'm busy!
end
```

`[<]` is short for `[left]` and `[>]` for `[right]`. A variant is one word of letters, digits and `_`; anything else in the brackets, such as `[two words]`, gets the warning "A variant uses letters, digits and `_`." A cue with no brackets has no variant. The variant follows the line's other cue parts: a line that carries on with `..` keeps the variant of the line it joins ([Joining Lines](./JoiningLines.md)).

## An element for one variant or one speaker

In a layout, `#variant=left` on a text element limits it to lines of that variant, and `#speaker=bunny` limits it to lines that character speaks. `#speaker` takes the character's define name, the word after `define`. Other lines do not write to a limited element, so in this box the left name element takes Raffles' name and the right one Bunny's:

```sparkdown
layout main {
  box {
    character_name #variant=left #clear { text }
    character_name #variant=right #clear { text }
    dialogue #clear { text }
  }
}
```

An element with both props takes only the lines that match both. An element with neither takes every line written to its name.

A limited element without `#clear` keeps what it shows until a line it takes replaces it, so a left name stays while the right side speaks. With `#clear`, as in the box above, it empties at the next line that does not write to it.

## A layout that opens for a variant

A labelled line opens the layout that holds an element of its kind limited to its variant. The built-in `simultaneous` layout holds `#variant=left` and `#variant=right` dialogue, so `[left]` and `[right]` lines open it by themselves, with no `[[open simultaneous]]`:

```sparkdown
define raffles as character with
  name = "RAFFLES"
end

define bunny as character with
  name = "BUNNY"
end

scene start
  RAFFLES [<]: Well-- I mean--
  BUNNY [>]: Seriously???
  RAFFLES [<]: Don't.
  BUNNY [>]: I wasn't going to.
  Raffles looks away.
  BUNNY: Fine.
end
```

The four labelled lines are one exchange. It closes at the first line that belongs in a different layout, here the action line, and the plain dialogue line after it opens the ordinary dialogue box. A pair after the action line would start a fresh exchange. If no layout holds the variant, the line opens the layout named after its kind, and `@variant(name)` is true there, so `BUNNY [shout]:` stays in the ordinary box and only changes its style. Only variants pick a layout; speakers do not.

If a layout you opened already holds the line's kind, the labelled line goes there and nothing opens. A layout holds a labelled line when it has an element of the line's kind with no `#variant` or with the line's own.

The built-in exchange looks plain: the lines sit on two sides, older lines are dimmed, each name is on its own side, and nothing moves. It is written like any layout, so writing your own `layout simultaneous` replaces it:

```sparkdown
layout simultaneous in textbox {
  simultaneous_names {
    character_name.simultaneous_name #variant=left { stroke; text }
    character_name.simultaneous_name #variant=right { stroke; text }
  }
  stream.simultaneous_lines {
    dialogue.simultaneous_line #variant=left { stroke; text }
    dialogue.simultaneous_line #variant=right { stroke; text }
  }
}

stream simultaneous {
  advance = auto
}
```

Its lines are a stream that advances by itself ([Streams](./Streams.md#a-stream-that-advances-by-itself)), so the whole exchange is gathered and its box is sized once. Each name appears when its side's first line starts, because an element is on screen only while it has content, and both stay until the exchange closes.

A message thread uses the same rules with other names:

```sparkdown
layout phone {
  thread {
    stream {
      dialogue.bubble.incoming #variant=receive { text }
      dialogue.bubble.outgoing #variant=send { text }
    }
  }
}

scene start
  RAFFLES [receive]: slight problem
  BUNNY [send]: Anything you can do about it? >
  Bunny looks up from the screen.
end
```

The first line opens `phone`, and the action line closes it. To keep the phone up through narration, write `[[open phone]]` first; it then stays until `[[close phone]]`, and the labelled lines go to it.

When two layouts limit elements of one kind to one variant, the editor warns "`left` dialogue lines could open `simultaneous` or `duel`. Limit only one layout's elements to a variant." and the line opens the one written first, which for a built-in layout is the built-in.

## Styling by variant and speaker

A style selects the elements written with a prop the same way it selects any prop, with `#name=value`:

```sparkdown
style character_name {
  #variant=left { align-self = start }
  #variant=right { align-self = end }
}
```

`@variant(name)` and `@speaker(name)` test the newest line showing, anywhere in the game. They are true from the moment the line is shown until the next line replaces it, and a line with no variant, or no speaker, clears them. `@speaker` takes a character's define name:

```sparkdown
style character_name {
  @speaker(raffles) { text-color = red_40 }
  @speaker(bunny) { text-color = sky_60 }
}

style dialogue {
  @variant(shout) { text-size = 32px }
}
```

Like `@showing(name)` ([What is on screen](./StyleProps.md#what-is-on-screen)), both hold across the whole game, so a frame in one layout can react to a line shown in another. They follow the same rule for where they may be written: as a state of the style's own selector, alone or beside other states, or as a nested block read together with the blocks it sits in. Anywhere else they get a warning and their block never applies.

## Typing a variant's lines

A typewriter named after a variant sets how that variant's lines type, ahead of the typewriter named after the line's kind. Here a `[receive]` line appears whole, while every other dialogue line types with the `dialogue` typewriter:

```sparkdown
define receive as typewriter with
  letter_pause = 0
end
```

The name and the parenthetical above the line keep their own typewriters.

## In the screenplay

The screenplay prints `[left]` and `[right]` lines, and `[<]` and `[>]` lines, side by side in two columns. A line with any other variant prints as ordinary dialogue.

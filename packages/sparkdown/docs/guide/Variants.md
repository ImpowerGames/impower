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
    character_name #variant=left { text }
    character_name #variant=right { text }
    dialogue { text }
  }
}
```

An element with both props takes only the lines that match both. An element with neither takes every line written to its name.

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

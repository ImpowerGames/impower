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

## Giving a speaker a typewriter sound

In the web editor, open **Writing tools → Typewriter sound**. **Play sample** plays one key press, then a short line at the default dialogue speed. **Reroll** varies the brightness, resonance and return click while keeping the same 73 ms note. **Copy definition** gives you the settings for that particular roll. Paste them above your scenes. A character named `imani` can inherit that sound at a lower volume.

```sparkdown
define imani as story_key with
  volume = 0.22
end
```

You can also write the sound directly. This key has a soft return 46 ms after the initial strike.

```sparkdown
define story_key as synth with
  shape = "whitenoise"
  volume = 0.31
  pitch = { frequency = 6250 }
  envelope = {
    attack = 0.001, decay = 0.016, sustain = 0.027, release = 0.029, level = 0.68,
    points = {
      { time = 0, level = 1 }, { time = 0.011, level = 1 },
      { time = 0.012, level = 0.36 }, { time = 0.023, level = 0.105 },
      { time = 0.035, level = 0.035 }, { time = 0.045, level = 0.035 },
      { time = 0.046, level = 0.91 }, { time = 0.055, level = 0.91 },
      { time = 0.058, level = 0.17 }, { time = 0.069, level = 0 }
    }
  }
  bandpass = { on = true, frequency = 1600, q = 0.96 }
  delay = { on = true, length = 0.000435, strength = 0.24, feedback = 0.65 }
  lowpass = { on = true, cutoff = 7850, resonance = 0.04 }
end
```

Each point multiplies the usual envelope by a level from 0 to 1. Its time is in seconds from the start of the note. The synth interpolates linearly between points and holds the first and last levels outside that interval. Attack, decay, sustain and release still set the note length used to group syllables.

The band-pass frequency is its center in Hz. A higher `q` gives the key a narrower resonance. The delay length is in seconds and can be randomized in steps of one microsecond. A high-pass filter now passes treble above its cutoff. To keep the former sound of a custom high-pass setting, use `lowpass` with the same cutoff and cutoff ramp and with `resonance = 0`.

## In the screenplay

The screenplay prints `[left]` and `[right]` lines, and `[<]` and `[>]` lines, side by side in two columns. A line with any other variant prints as ordinary dialogue.

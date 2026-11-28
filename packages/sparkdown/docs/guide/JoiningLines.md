# 13. Joining Lines

Each line of story text shows as a line of its own. Two dots, `..`, join lines together: a line that ends with `..` offers to join, and a line that begins with `..` takes the offer. The two lines then show as one, in the same text box. The same marks beside a `>` break carry a box on after the player clicks. A line that ends with `>>` carries on to the next line without a click, and the `<speed>` and `<wait>` tags set how a line types.

The examples are written inside a `scene`, as story text is in a script.

## 13.1 Ending and beginning a line with `..`

A line that ends with `..` joins the next line shown onto it, when that line begins with `..`.

```sparkdown
store has_key = true

scene Cellar
  You see a ..
  if has_key then
    .. rusty key.
  else
    .. locked door.
  end
end
```

With the key, this shows "You see a rusty key." as one line. The joined lines do not have to sit next to each other in the script: the line shown after `You see a ..` can be the first line of an `if` branch, the first line of a scene a divert reaches, or a line that comes after some logic.

Both marks are needed. A line that ends with `..` before a line that does not begin with `..` shows as usual, and so does a line that begins with `..` after a line that does not end with one, with a warning (see 13.6).

### Spaces

The join keeps the spaces written before the first mark and drops the spaces after the second.

```sparkdown
scene Night
  The night was full of shadows ..
  .. and whispers.
end
```

This shows "The night was full of shadows and whispers.", with the space written before `..`. Write `shadows..` and `..and` and the words touch.

### What counts as a mark

A mark is exactly two dots. A third dot makes an ellipsis, so `Wait...` and `...and then` are text. A `..` in the middle of a line (`a..b`, `a .. b`) is text too, and so is a `..` right after an interpolation in the middle of a line (`{count} .. more`). Inside `{...}` and on logic lines, `..` joins strings, as it does in Luau.

A tag or a `//` comment may follow the `..` that ends a line:

```sparkdown
scene Waiting
  She waits .. # pause
  .. and then speaks.
end
```

### Dialogue

A `..` may begin the words after a speaker's colon:

```sparkdown
scene Doorway
  ALICE: I thought ..
  ALICE: .. you had gone.
end
```

The joined line keeps the first line's speaker. A line that begins with `..` and names no speaker takes the speaker of the line it joins. The speaker is the whole cue: the name the box shows, the character an `as` names after it ([Who is speaking](./PortraitMorphs.md#who-is-speaking)), the parenthetical and the variant ([Variants](./Variants.md)), so after `??? as raffles (O.S.): I thought ..` a `.. you had gone.` is still Raffles speaking under `???`. Inside a dialogue block, the lines join the same way:

```sparkdown
scene Doorway
  ALICE:
    I thought ..
    .. you had gone.
end
```

### A line with only the mark

A line that is only `..`, or `..` followed by a tag or a comment, shows nothing. It leaves the offer open for the line after it.

## 13.2 Carrying on after a `>` break

A `>` in a line waits for the player to click before it shows the rest. With a `..` on each side of the break, what comes after the click is added to the same box, and the box keeps the text it already shows:

```sparkdown
scene Ledge
  Hold on .. > .. tight.
end
```

The box shows "Hold on", waits for the click, then types "tight." after it, so it reads "Hold on tight.". The marks and the `>` may touch each other and the words beside them (`Abso..>..lutely.`), as a break needs no spaces.

The two halves can be on separate lines, with the `>` ending the first:

```sparkdown
scene Ledge
  Hold on .. >
  .. tight.
end
```

Several clicks can add to one box: in `One .. > .. two .. > .. three.` each click adds to the box.

A continuation may name a speaker. Its words are then typed with that speaker's settings, and a dialogue box shows that speaker's name:

```sparkdown
scene Knock
  ???: Hello... .. >
  ALICE: .. It's me.
end
```

The box stays the kind it was before the click. An action box carried on by `BOB: .. Who's there?` adds the words, typed as BOB, and shows no name.

With a mark on one side of the break only, the part after the click starts a new box. A `..` that ends a line right after a break (`Wait > ..`) has no part after the break to begin, so it does nothing.

## 13.3 Carrying on without a click

A line that ends with `>>` carries on without a click once it has finished showing. `>` waits for the player's click, and `>>` is its pair: the story goes on to the next line by itself.

```sparkdown
scene Alley
  RAFFLES: Wait here. >>
  A siren wails in the distance.
end
```

Raffles's line types, and the siren's line follows the moment it has finished, with no click. A click while the line is typing shows the whole line, as it does for any line, and the story then carries on.

`>>` waits for nothing of its own. For a beat before the next line, write a `<wait=N>` (see 13.4) before the mark:

```sparkdown
scene Phone
  BUNNY: What's plan b? <wait=0.6> >>
  A notification slides over the screen.
end
```

The notification's line starts 0.6 seconds after Bunny's line finishes typing.

With a `..` before it, the mark keeps the box open as a `>` break does, and the next line shown carries on in the same box when it begins with `..`, with no click:

```sparkdown
scene Ledge
  Hold on .. >>
  .. tight.
end
```

### What counts as the mark

The mark is two `>` at the end of a line. A tag, a `//` comment or block comments that close on the same line may follow it. A block comment that runs on to a later line leaves `>>` two breaks, since the line cannot tell whether text follows where the comment closes. Anywhere else on a line, `>>` is two `>` breaks, each waiting for a click (`Wait >> there.`), and so is a run of three or more `>` at the end of a line. On a line with no text, such as one that only plays a sound, `>>` changes nothing: the sound already plays when the next line starts, and that line waits as usual.

### In a stream

In a stream that advances by itself (see [A stream that advances by itself](./Streams.md#a-stream-that-advances-by-itself)), a line that ends with `>>` is followed at once by the next one, with no `pause`. A `>>` does not end a run: the stream's lines are gathered through it to the next wait, and that holds in a stream that waits for a click too.

A line that takes no time to type, such as a line at `<speed=0>`, finishes the moment it shows, so lines written at `<speed=0>` and ending with `>>` all show at once. Messages that are already in a thread when it opens are written that way:

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
}

scene Thread
  [[open phone]]
  RAFFLES: <speed=0>i have a plan b >>
  RAFFLES: <speed=0>meet me outside >>
  BUNNY: What's plan b?
end
```

The first two messages are whole and on screen the moment the phone appears, and Bunny's reply types after them.

### In the editor preview

The preview on a line that ends with `>>` shows that line, as the preview on any other line does.

## 13.4 Pacing a line with `<speed>` and `<wait>`

Two tags written in a line set how it types. The value follows an `=`.

| Tag | What it does |
| --- | --- |
| `<speed=N>` | Types the text after it N times as fast as the typewriter's own pace, until the line ends or another `<speed>` changes it. `<speed=0.5>` types at half speed, `<speed=2>` at twice the speed, and `<speed=0>` shows the text at once. |
| `<wait=N>`, or `<w=N>` | Pauses the typing for N seconds before the text after it. |

```sparkdown
scene Reveal
  ALICE: It was... <wait=1> <speed=0.5>you.
  <speed=0>The lights go out.
end
```

Alice's line types "It was...", holds for a second, then types "you." at half speed. The next line is there at once.

A wait at the end of a line holds the line before the next one starts, which is how a line that ends with `>>` gets a beat before the story carries on. Neither tag shows in the text.

## 13.5 Asset lines

A `load` line names the assets it loads, so it cannot end with `..`. The text after a `>` break on a `load` line is not part of the loading, so a `..` that ends that text joins as usual.

## 13.6 Errors and warnings

The editor reports one error about the marks, on a `load` line that ends with `..`:

> A `load` line cannot end with `..`. Name every asset it loads on the line.

Which line shows before a line that begins with `..` can depend on the choices the player made, so the editor cannot tell ahead of time whether the line will join. The game checks as it runs. When the line shown before does not end with `..`, the line shows on its own and the game warns:

> This line begins with `..`, but the line shown before it does not end with `..`, so it does not join it.

A line that ends with `..` and is followed by a line that does not begin with `..` raises nothing, since another branch may take the offer.

## 13.7 In the editor

Hover over a `..` that ends or begins a line, or a `>>` that ends a line, to see what it does. A `..` that is text and a `>>` in the middle of a line show no hover.

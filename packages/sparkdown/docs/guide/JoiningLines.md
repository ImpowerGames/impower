# 13. Joining Lines

Each line of story text shows as a line of its own. Two dots, `..`, join lines together: a line that ends with `..` offers to join, and a line that begins with `..` takes the offer. The two lines then show as one, in the same text box. The same marks beside a `>` break carry a box on after the player clicks.

## 13.1 Ending and beginning a line with `..`

A line that ends with `..` joins the next line shown onto it, when that line begins with `..`.

```sparkdown
You see a ..
if has_key then
  .. rusty key.
else
  .. locked door.
end
```

With the key, this shows "You see a rusty key." as one line. The joined lines do not have to sit next to each other in the script: the line shown after `You see a ..` can be the first line of an `if` branch, the first line of a scene a divert reaches, or a line that comes after some logic.

Both marks are needed. A line that ends with `..` before a line that does not begin with `..` shows as usual, and so does a line that begins with `..` after a line that does not end with one, with a warning (see 13.4).

### Spaces

The join keeps the spaces written before the first mark and drops the spaces after the second.

```sparkdown
The night was full of shadows ..
.. and whispers.
```

This shows "The night was full of shadows and whispers.", with the space written before `..`. Write `shadows..` and `..and` and the words touch.

### What counts as a mark

A mark is exactly two dots. A third dot makes an ellipsis, so `Wait...` and `...and then` are text. A `..` in the middle of a line (`a..b`, `a .. b`) is text too, and so is a `..` right after an interpolation in the middle of a line (`{count} .. more`). Inside `{...}` and on logic lines, `..` joins strings, as it does in Luau.

A tag or a `//` comment may follow the `..` that ends a line:

```sparkdown
She waits .. # pause
.. and then speaks.
```

### Dialogue

A `..` may begin the words after a speaker's colon:

```sparkdown
ALICE: I thought ..
ALICE: .. you had gone.
```

The joined line keeps the first line's speaker. A line that begins with `..` and names no speaker takes the speaker of the line it joins. Inside a dialogue block, the lines join the same way:

```sparkdown
ALICE:
  I thought ..
  .. you had gone.
```

### A line with only the mark

A line that is only `..`, or `..` followed by a tag or a comment, shows nothing. It leaves the offer open for the line after it.

## 13.2 Carrying on after a `>` break

A `>` in a line waits for the player to click before it shows the rest. With a `..` on each side of the break, what comes after the click is added to the same box, and the box keeps the text it already shows:

```sparkdown
Hold on .. > .. tight.
```

The box shows "Hold on", waits for the click, then types "tight." after it, so it reads "Hold on tight.". The marks and the `>` may touch each other and the words beside them (`Abso..>..lutely.`), as a break needs no spaces.

The two halves can be on separate lines, with the `>` ending the first:

```sparkdown
Hold on .. >
.. tight.
```

Several clicks can add to one box: in `One .. > .. two .. > .. three.` each click adds to the box.

A continuation may name a speaker. Its words are then typed with that speaker's settings, and the box shows that speaker's name:

```sparkdown
???: Hello... .. >
ALICE: .. It's me.
```

With a mark on one side of the break only, the part after the click starts a new box. A `..` that ends a line right after a break (`Wait > ..`) has no part after the break to begin, so it does nothing.

## 13.3 Asset lines

A `load` line names the assets it loads, so it cannot end with `..`. The text after a `>` break on a `load` line is not part of the loading, so a `..` that ends that text joins as usual.

## 13.4 Errors and warnings

The editor reports one error about the marks, on a `load` line that ends with `..`:

> A `load` line cannot end with `..`. Name every asset it loads on the line.

Which line shows before a line that begins with `..` can depend on the choices the player made, so the editor cannot tell ahead of time whether the line will join. The game checks as it runs. When the line shown before does not end with `..`, the line shows on its own and the game warns:

> This line begins with `..`, but the line shown before it does not end with `..`, so it does not join it.

A line that ends with `..` and is followed by a line that does not begin with `..` raises nothing, since another branch may take the offer.

## 13.5 In the editor

Hover over a `..` that ends or begins a line to see what it does. A `..` that is text shows no hover.

# Writing with Sparkdown — Part 1: Writing Your First Script

```sparkdown
The beam sweeps the water. Far out, something answers.

MARA: You're up late.

JONAS: Couldn't sleep.

choose
  * Tell him about the light
    MARA: The light failed twice last winter.
  * Say nothing
    The two of them watch the water in silence.
end
```

This is a complete Sparkdown script. Type it into the editor and it plays, revealing its text to the player a little at a time. The bare line is narration, the named lines are spoken by their characters, and the starred lines are a choice the player makes. Everything else you will write is a variation on these three ingredients, plus a small set of marks that tell the game how to present them.

## 1.1 — A script is plain text

```sparkdown
The lamp turns.
Salt wind rattles the rail.
```

**What the player sees:**

```
The lamp turns.
Salt wind rattles the rail.
```

Any plain line of prose is narration. There is no keyword to learn and no setup required: open a file, describe what happens, and the game shows it to the player as action text. Each line arrives on its own, one after the other.

## 1.2 — Dialogue

```sparkdown
MARA: You're up late.
```

**What the player sees:**

```
MARA
You're up late.
```

A name, a colon, and the words: that is a line of dialogue. The game routes it to that character's dialogue box, with their name shown as the speaker. Writing speakers in capitals is screenplay habit, and every script in this guide follows it.

A name needs no setup. The editor will gently point out that MARA isn't defined yet, and the line plays anyway, using the name exactly as you wrote it. Giving characters a proper display name, color, and voice comes in Part 5.

## 1.3 — Your first choice

```sparkdown
JONAS: Something's out there.

choose
  * Look through the glass
    A light, where no light should be.
  * Check the logbook
    Last entry, three nights ago. Nothing since.
end

The wind picks up.
```

**What the player sees:** JONAS speaks, then two options appear. Picking "Check the logbook" plays that option's text back as a line, then its indented lines. Either way, the story carries on with "The wind picks up."

A `choose` block turns the story over to the player. Each `*` line is an option; the lines indented beneath an option play only when the player picks it; `end` closes the list, and the story continues below as if the road never forked. The option's own text plays back as a line when chosen, so write choices as things worth saying or doing.

This is all a choice needs. Sending a choice somewhere else in the story entirely is section 1.8; choices that remember they were taken or appear only under certain conditions are the subject of Part 2.

## 1.4 — Blocks and indentation

So far every line has stood alone. To make several lines travel together, put the mark on its own line and indent what follows:

```sparkdown
MARA:
  The light failed twice last winter.
  Both times on a clear night.
No one else knows that.
```

**What the player sees:** one dialogue box from MARA holding both indented lines, then a separate narration line.

The same shape works for narration. A lone `:` opens a narration block, and its indented lines appear together as one passage instead of arriving one at a time:

```sparkdown
:
  They climb the stairs.
  They do not speak.
```

**What the player sees:** one narration box containing both lines, one under the other.

The rule is the same everywhere: a block stays open as long as each following line is indented further than the line that opened it (the amounts do not have to match), and the first line that steps back out to the opener's indent or less belongs to whatever comes next. You have already used this shape once — the option bodies inside a `choose` block work the same way.

> **Gotcha:** Blank lines and `//` comment lines do NOT close an open block — only a less-indented line does. A dialogue block also ends early at certain marks even when they are indented: the choice marks you met in 1.3 (`*`, `+`), the `->` jumps coming in section 1.8, other display marks, and declaration keywords such as `scene` or `define`. Indenting those will not fold them into a speech.

## 1.5 — Beats and line breaks

A trailing `>` splits a speech into separate beats — separate boxes the player steps through one at a time, all from the same speaker:

```sparkdown
MARA:
  That light isn't ours. >
  ...I think.
```

**What the player sees:**

```
MARA
That light isn't ours.

MARA
...I think.
```

Without the `>`, both lines would share one box. Chains extend naturally: `One. > Two. > Three.` plays as three beats.

> **Gotcha:** a trailing `>` with nothing after it does not split anything — it is trimmed away.

A backslash before a space forces a line break inside the same box, and a backslash before punctuation makes that character literal:

```sparkdown
MARA: Look down. \ It's over there.
JONAS: The chart is marked \*here\*.
```

**What the player sees:** MARA's box shows "Look down." and "It's over there." on two lines. JONAS's box shows the asterisks as real characters instead of styling marks (styling comes in 1.7).

The opposite move is running two separate lines together into one. That uses the `..` mark, which arrives with story flow in Part 2.

## 1.6 — Sluglines, title cards, and transitions

```sparkdown
^: THE LAST LIGHT

$: THE LAMP ROOM - NIGHT

The beam sweeps the water.

%: FADE OUT
```

**What the player sees:** a title card reading THE LAST LIGHT, then a scene heading, the narration, and finally FADE OUT presented as a transition.

Three marks shape a scene the way a screenplay does. `$:` is a scene heading (a slugline), `^:` is a title card shown to the player mid-story, and `%:` is a transition such as FADE OUT or CUT TO. Each takes its text on the same line, and each is styled by the game to look like what it is. The marks are the only way to get these looks — a line like CUT TO: without its `%:` stays ordinary narration.

## 1.7 — Styling

```sparkdown
MARA: Do you *see* it?

JONAS: It was **loud**. The whole tower _hummed_.

MARA: ***Run.***
```

**What the player sees:** "see" in italics, "loud" in bold, "hummed" underlined, and "Run." in bold italics.

Wrap a word or phrase in marks to style it, the same way you would in a chat message. There are seven, and the last three do things paper can't:

```sparkdown
^The Last Light^

The water goes ~~up and down~~.

The door is ::rattling::.
```

**What the player sees:** the first line centered, the letters of "up and down" rippling in a wave, and "rattling" trembling in place.

| You type | The player sees |
|---|---|
| `*italic*` | *italic* |
| `**bold**` | **bold** |
| `***bold italic***` | ***bold italic*** |
| `_underline_` | underlined text |
| `^centered^` | the text centered |
| `~~wavy~~` | letters ripple up and down |
| `::shaky::` | letters tremble |

A `^` wrapped around words centers them; `^:` at the start of a line is the title-card mark from section 1.6 — the colon is the difference. When you need any mark as a visible character, escape it with a backslash (`\*`, `\_`), as shown in section 1.5.

## 1.8 — Sending the story somewhere

```sparkdown
MARA: Ready?

choose
  * Head up the tower
    The rail is cold under your hand.
    -> tower
  * Wait by the door
    -> door
end

scene tower
  The stairs wind upward.
end

scene door
  You wait, listening.
end
```

**What the player sees:** picking "Head up the tower" plays that option's lines, then the story continues inside the tower scene with "The stairs wind upward."

`scene NAME` opens a named section of story, closed by `end`. An arrow `->` sends the story to a scene by name, from anywhere — here, from inside a choice. When the story runs out of places to go, it ends.

That is enough to write a complete branching story. Everything else scenes and arrows can do — joining back up, calling and returning, passing values along — is Part 2's subject.

## 1.9 — Pictures and sound

```sparkdown
[[show backdrop cliffside]]

((play music waves))

MARA: Listen.
```

**What the player sees:** the image named cliffside fills the backdrop, the waves track starts playing, and MARA speaks over both.

Double square brackets command the screen; double parentheses command the audio. Each takes a verb (`show`, `hide`, `play`, `stop`), a place for it to happen (a layer like `backdrop`, a channel like `music`), and the name of an asset from your project. Until an asset with that name exists, the editor warns you.

Adding images and audio to a project — and everything else these commands can do, like fades, loops, and animation — is covered in Part 5.

## 1.10 — Comments and em-dashes

```sparkdown
The tide goes out. // check timing against the storm scene
// remind Mara about the ledger here
The fog rolls in.
```

**What the player sees:**

```
The tide goes out.
The fog rolls in.
```

`//` followed by a space starts a note to yourself. A note at the end of a line is stripped but the line stays; a note on its own line vanishes completely, taking its line break with it.

Double hyphens, meanwhile, are safe in prose — they are em-dashes, not notes:

```sparkdown
He turned -- slowly -- and looked back at the tower.

MARA:
  Wait --
```

**What the player sees:** every `--` rendered as dash text, in both the narration and the speech.

> **Gotcha:** when you start writing code in Part 4, `--` begins a comment *there*. In prose and dialogue it never comments anything; it is always an em-dash on screen.

> **Gotcha:** `//` only starts a note when followed by a space or the end of the line. Written tight against text it is ordinary prose, so `http://example.com` survives intact.

## 1.11 — The title page

```sparkdown
---
title: The Last Light
credit: Written by
author: A. Keeper
---

MARA: It starts tonight.
```

A block fenced by `---` lines at the top of your file holds the script's metadata: title, credit, author, and any other `key: value` fields you want to record. The player never reads these in a box; they describe the script itself, and the game and its tools can pick them up.

> **Gotcha:** both `---` fences are required. Without them, `title:` reads as a line of dialogue spoken by a character named "title". Field values are fixed text; they cannot contain the `{...}` text inserts that arrive in Part 3.

## 1.12 — What the formatter will (and won't) touch

```sparkdown
MARA:    Hello, old friend.

JONAS: You came back.
```

Saving the file tidies it into this:

```sparkdown
MARA: Hello, old friend.

JONAS: You came back.
```

The formatter tidies every file to the same shape: the gap between a mark and its text collapses to a single space, runs of blank lines collapse to one, indented bodies settle at two spaces, tabs become spaces, trailing whitespace is trimmed, and a blank line separates back-to-back top-level blocks. Formatting the same file twice changes nothing.

What it will never touch is the inside of your text. Deliberate runs of spaces within a line of narration or speech survive every save, exactly as you typed them.

> **Gotcha:** the formatter's rule of thumb is marks versus content. Gaps around marks are its territory and get collapsed; whitespace inside your text is yours and is never reflowed.

Next: [Part 2 — Choices and Story Flow](02-choices-and-story-flow.md), where choices learn to jump, remember, and come back together.

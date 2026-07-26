# Writing with Sparkdown — Part 1: Writing Your First Script

```sparkdown
$: THE LAMP ROOM - NIGHT

The beam sweeps the water.  Far out, something answers.

MARA: You're up late.

JONAS:
  Couldn't sleep.
  The sea sounds different tonight.
```

That is a complete Sparkdown script — a plain text file. Type it into the editor and it plays, revealing its text to the player a little at a time. The `$:` line sets the scene, the bare line is narration, and the named lines are spoken by their characters. Everything else you will write is a variation on this: lines of text, plus a small set of marks that tell the game how to present them.

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

Any plain line of prose is narration. There is no keyword to learn and no setup required: open a file, describe what happens, and the game shows it to the player as action text. Each bare line is its own narration passage, delivered one after the other.

If you want several lines to travel together, a lone `:` opens a narration block, and its indented lines appear together as one passage:

```sparkdown
:
  They climb the stairs.
  They do not speak.
```

**What the player sees:** one narration box containing both lines, one under the other.

Where the two bare lines above arrived as two separate passages, the block joins its lines into a single one. The inline form `: They climb the stairs.` works too, and means the same as the bare line.

> **Different from Fountain:** Fountain needs a `!` to force a line to be action when it looks like something else. Sparkdown has no forced-action mark, because it needs none: anything that does not match another rule is action by default.

<details><summary>Backing fixtures</summary>

`packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/implicit-action.sd`
`packages/sparkdown/src/tests/compiler/__snapshots__/grammar/display/implicit-action-with-plural.sd`
`packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/inline-action.sd`
`packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/block-action.sd`
`packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/display/inline-action.sd`
`packages/sparkdown/src/tests/runtime/PortInventory.test.ts`

</details>

## 1.2 — Dialogue

```sparkdown
MARA: You're up late.
```

**What the player sees:**

```
MARA
You're up late.
```

A name, a colon, and the words: that is a line of dialogue. The game routes it to that character's dialogue box, with their name shown as the speaker.

For a longer speech, put the name and colon on their own line and indent what follows:

```sparkdown
JONAS:
  Couldn't sleep.
  The sea sounds different tonight.
```

**What the player sees:** one dialogue box from JONAS, with the two lines shown one under the other.

The indented lines belong to the speech until you write a line that is not indented; section 1.4 covers exactly when a block ends.

> **Different from Fountain:** Fountain infers a speaker from an ALL-CAPS line sitting above the speech. Sparkdown always uses the explicit `NAME:` prefix; writing speakers in capitals is screenplay habit, and every script in this guide follows it.

> **Gotcha:** If you find older Sparkdown material showing an `@` before the name for block dialogue (`@NARRATOR:`), that form does not exist. Plain `NAME:` is the only dialogue mark; `@` means something else entirely (writing text into a named part of the screen, which comes in Part 5).

<details><summary>Backing fixtures</summary>

`packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/dialogue-inline.sd`
`packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/block-dialogue.sd`
`packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/block-multiline-trailing-space.sd`
`packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/dialogue-inline-empty-body.sd`
`packages/sparkdown/src/tests/runtime/fixtures/smoke/hello.sd`
`packages/sparkdown/src/tests/runtime/smoke.test.ts`
`packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/display/dialogue-pacing.sd`
`packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/display/block-dialogue.sd`
`packages/sparkdown/language/sparkdown.language-grammar.json`

</details>

## 1.3 — Sluglines, title cards, and transitions

```sparkdown
^: THE LAST LIGHT

$: THE LAMP ROOM - NIGHT

The beam sweeps the water.

%: FADE OUT
```

**What the player sees:** a title card reading THE LAST LIGHT, then a scene heading, the narration, and finally FADE OUT presented as a transition.

Three marks shape a scene the way a screenplay does. `$:` is a scene heading (a slugline), `^:` is a title card shown to the player mid-story, and `%:` is a transition such as FADE OUT or CUT TO. Each takes its text on the same line, and each is styled by the game to look like what it is.

> **Different from Fountain:** Fountain recognizes headings by an INT./EXT. prefix, transitions by ALL-CAPS lines ending in `TO:`, and centered text by a leading `>`. Sparkdown never infers any of these — the explicit marks `$:`, `%:`, and `^:` are the only way to get them, and text without a mark stays ordinary narration.

<details><summary>Backing fixtures</summary>

`packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/inline-heading.sd`
`packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/block-heading.sd`
`packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/inline-title.sd`
`packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/block-title.sd`
`packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/inline-transitional.sd`
`packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/block-transitional.sd`
`packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/display/heading.sd`
`packages/sparkdown/src/tests/runtime/PortInventory.test.ts`

</details>

## 1.4 — Blocks and indentation

```sparkdown
MARA:
  The light failed twice last winter.
  Both times on a clear night.
No one else knows that.
```

**What the player sees:** one dialogue box from MARA holding both indented lines, then a separate narration line.

Every display mark you have met (`NAME:`, `:`, `$:`, `^:`, `%:`) can stand alone on its line and take an indented body instead of same-line text. The indented lines merge into a single box, joined by line breaks, and the block stays open as long as each following line is indented further than the line that opened it — the amounts do not have to match. The first line that steps back out to the opener's indent (or less) ends the block and belongs to whatever comes next.

> **Gotcha:** Blank lines and `//` comment lines do NOT close an open block — only a less-indented line does. A dialogue block also ends early at certain marks even when they are indented: choice marks (`*`, `+`) and diverts (`->`) from Part 2, other display marks, and declaration keywords such as `scene` or `define` from Part 4. You do not need any of those yet — just know that when they arrive, indenting them will not fold them into a speech.

<details><summary>Backing fixtures</summary>

`packages/sparkdown/language/sparkdown.language-grammar.json`
`packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/block-dialogue.sd`

</details>

## 1.5 — Pacing: pauses, beats, and line breaks

```sparkdown
MARA: I saw it too.  Three nights running.    I counted.
```

**What the player sees:** the line types out with a short pause after "too." and a longer one after "running."

Two or more spaces in a row are a pause: the longer the run, the longer the player waits as the text reveals. Those spaces are part of your writing; nothing ever removes them.

> **Different from ink:** ink (another scripting language for interactive stories) collapses runs of whitespace into a single space. Sparkdown preserves every run of two or more spaces as a pacing pause, and the formatter never touches them.

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

> **Different from Fountain:** in Fountain a *leading* `>` marks a transition or centered text. Sparkdown's beat break is a *trailing* `>`, and transitions have their own mark (`%:`).

> **Gotcha:** a trailing `>` with nothing after it does not split anything — it is trimmed away.

A backslash before a space forces a line break inside the same box, and a backslash before punctuation makes that character literal:

```sparkdown
MARA: Look down\ there.
JONAS: The chart is marked \*here\*.
```

**What the player sees:** MARA's box shows "Look down" and "there." on two lines. JONAS's box shows the asterisks as real characters instead of emphasis marks (emphasis is next).

A break is the backslash mark; a pause is a plain run of two or more spaces — two different things.

The opposite move is running two separate lines together into one. That uses the `..` mark, which arrives with story flow in Part 2.

<details><summary>Backing fixtures</summary>

`packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/display/dialogue-pacing.sd`
`packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/display/block-dialogue.sd`
`packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/display/heading.sd`
`packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/display/glue-break-spacing.sd`
`packages/sparkdown/src/tests/runtime/ChainedDialogueBreak.test.ts`
`packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/chained-dialogue-break.sd`
`packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/trailing-break.sd`
`packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/escape-non-whitespace.sd`
`packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/escape-space-mid-content.sd`
`packages/sparkdown/src/tests/runtime/Glue.test.ts`

</details>

## 1.6 — Emphasis

```sparkdown
MARA: Do you *see* it?
```

**What the player sees:** the line with "see" emphasized.

Wrap a word or phrase in asterisks to emphasize it, the same way you would in a chat message. When you need a visible asterisk instead, escape it with `\*` as shown in section 1.5.

<details><summary>Backing fixtures</summary>

`packages/sparkdown/src/tests/runtime/PortInventory.test.ts`
`packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/stress/spark-tale-sample.sd`

</details>

## 1.7 — Comments and em-dashes

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

<details><summary>Backing fixtures</summary>

`packages/sparkdown/src/tests/runtime/DisplayLineComment.test.ts`
`packages/sparkdown/src/tests/runtime/FrontMatterAndCommentContext.test.ts`
`packages/sparkdown/src/tests/runtime/StyleDefine.test.ts`
`packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/luau/opener-keyword-join.sd`
`packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/stress/spark-tale-sample.sd`

</details>

## 1.8 — The title page

```sparkdown
---
title: The Last Light
credit: Written by
author: A. Keeper
---

MARA: It starts tonight.
```

A block fenced by `---` lines at the top of your file holds the script's metadata: title, credit, author, and any other `key: value` fields you want to record. The player never reads these in a box; they describe the script itself, and the game and its tools can pick them up.

> **Different from Fountain:** Fountain's title page is bare `key: value` lines with no fences. In Sparkdown the `---` fences are required — without them, `title:` reads as a line of dialogue spoken by a character named "title". Field values are fixed text; they cannot contain the `{...}` text inserts that arrive in Part 3.

<details><summary>Backing fixtures</summary>

`packages/sparkdown/src/tests/runtime/FrontMatterAndCommentContext.test.ts`
`packages/sparkdown/language/sparkdown.language-grammar.json`
`packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/misc/frontmatter.sd`

</details>

## 1.9 — What the formatter will (and won't) touch

```sparkdown
MARA:    Hello.  Old friend.



JONAS: You came back.
```

Saving the file tidies it into this:

```sparkdown
MARA: Hello.  Old friend.

JONAS: You came back.
```

The formatter tidies every file to the same shape: the gap between a mark and its text collapses to a single space, runs of blank lines collapse to one, indented bodies settle at two spaces, tabs become spaces, trailing whitespace is trimmed, and a blank line separates back-to-back top-level blocks. Formatting the same file twice changes nothing.

What it will never touch is your writing. The two-space pause after "Hello." survives every save, and so does every deliberate run of spaces in headings, narration, and speech.

> **Gotcha:** the formatter's rule of thumb is marks versus content. Gaps around marks are its territory and get collapsed; whitespace inside your text is author-significant and is never reflowed.

<details><summary>Backing fixtures</summary>

`packages/sparkdown-language-server/src/tests/formatter/formatSnapshot.test.ts`
`packages/sparkdown-language-server/src/tests/formatter/deltaFormatEquivalence.test.ts`
`packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/misc/extra-blanks.sd`
`packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/blanklines/back-to-back-top-level.sd`
`packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/whitespace/mid-line-tabs.sd`
`packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/stress/spark-tale-sample-messy.sd`
`packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/stress/spark-tale-sample-tight.sd`
`packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/display/dialogue-pacing.sd`

</details>

Next: [Part 2 — Choices and Story Flow](02-choices-and-story-flow.md), where the player starts making decisions.

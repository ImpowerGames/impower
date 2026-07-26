# Sparkdown feature inventory

The master checklist for the user-facing Sparkdown documentation effort. Every
entry was extracted from the test suite (runtime fixtures, compiler/grammar/
formatter snapshots, luau-conformance tests) and internal docs, then merged,
deduplicated, and — wherever sources conflicted — settled by opening the cited
fixtures and trusting test assertions over doc prose. **Docs must never claim
syntax this inventory doesn't back**; each entry cites its backing files.

Generated 2026-07-25 on branch `claude/sparkdown-dsl-docs-dac184` (main-derived).
Companion documents: [docs-plan.md](docs-plan.md) (tutorial ToC + syntax
reference outline built from this inventory) and
[reactive-sparkle-divergence.md](reactive-sparkle-divergence.md) (which entries
`dev/reactive-sparkle-engine` invalidates).

**250 features across 7 sections:**

| § | Section | Features |
|---|---------|----------|
| 1 | Script structure & display text | 21 |
| 2 | Choices, weaves & story flow | 42 |
| 3 | Dynamic text: alternators, glue, tags & interpolation | 30 |
| 4 | Logic, variables & expressions | 45 |
| 5 | Functions, strings & the standard library | 44 |
| 6 | Structured data, UI, assets & project structure | 29 |
| 7 | Integrator features, divergences & known-unsupported | 39 |

## Unresolved conflicts (settle before documenting)

These could not be settled from fixtures — each needs either a new pinning
fixture or a maintainer ruling. Details inline at the flagged entries.

1. **Double-quoted string interpolation** — RESOLVED by the divergence report:
   on this branch (main-derived) `"..."` is fully literal and only backticks
   interpolate; `dev/reactive-sparkle-engine` inverts this (`"..."` interpolates,
   `'...'`/`[[...]]` stay literal, `\{` escapes). A semantic inversion at merge —
   do not document quote semantics until the branch lands. Proof:
   `QuotedStringInterpolation.test.ts` (branch) vs `lowerString` at merge-base.
2. **`#` length on record-style tables** — `LuaArithmetic.test.ts` asserts
   array-portion-only (`#{a=1} == 0`) in code contexts; `DIVERGENCES.md` and the
   `#TIME_OF_DAY` enum-count idiom imply entry-count semantics. A context split
   can't be ruled out.
3. **`count` reserved-identifier status** — `STDLIB.md` says reserved;
   `FUNCTIONS.md` uses it as a parameter name. No fixture settles it.
4. **Class-instance receiver-type method dispatch** (`Penguin.swim` via
   `as Bird` chain) — `DIVERGENCES.md` says unimplemented, `DEFERRED.md` says
   landed; `MethodCallValueDispatch.test.ts` pins only compile-time lowering.
5. **`const` declaration semantics** — is reassignment diagnosed, or is `const`
   still lowered to `var`? `Constants.test.ts` covers stdlib constants only.
6. **Inline alternator ` end` terminator** — the committed formatter snapshot
   turns `{queue|a|b|c end}` into `{queue|a|b|cend}`; formatter bug or optional
   terminator?
7. **Loops in narrative context** — loops are proven inside function bodies;
   no fixture exercises a bare loop statement in scene/narrative context.
8. **`&` discard prefix before diverts / `!=` operator** — flagged during
   planning as under-fixtured; see docs-plan §5b.
9. **Multi-space pause pacing at runtime** — the formatter preserves 2+ space
   runs in the file (fixture-backed), but a runtime probe (2026-07-25) shows
   runs collapse to single spaces in the story text stream
   (`too.  Three` → `too. Three`), so the typewriter's space-run pause scaling
   (`InterpreterModule.spaceLength`) cannot fire from source spacing on this
   branch. Regression, alternate channel, or never wired — needs a maintainer
   ruling and a pinning fixture. Docs claim file-level preservation only.

---
## Script structure & display text

### Implicit action (narration) lines
*Audience:* writer
Any plain prose line with no sigil and no `NAME:` prefix is an action (narration) line — no keyword, blank-line rule, or Fountain-style `!` forced-action sigil needed. Works inside a `scene` body or at the top level of a file.
```sparkdown
They walk forward.
```
*Output:* The narration text renders as an action event (the compiler wraps it in start/end `Tag` markers with text `action`, so the UI routes it to the action/narration box).
*Sources:* `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/implicit-action.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/display/implicit-action-with-plural.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/flow/choices-with-body.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/stress/spark-tale-sample.sd`, `packages/sparkdown/src/tests/runtime/PortInventory.test.ts`
Divergence from Fountain: anything unrecognized is action by default. Interpolation is allowed (`{c.name} trusts you a little less...`).

### Explicit action marker (`:`)
*Audience:* writer
A line starting with a bare colon `:` is explicitly an action line. Inline form: `: text`. Block form: `:` alone on a line, followed by indented lines.
```sparkdown
:
  They walk forward.
  They look at the sky.
```
*Output:* One action event; block-form indented lines are joined with a line break into a single box ("They walk forward.\nThey look at the sky.") — they are not separate beats. The formatter collapses only the sigil gap (`:   A` becomes `: A`); internal text spacing is preserved.
*Sources:* `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/inline-action.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/block-action.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/display/inline-action.sd`, `packages/sparkdown/docs/compiler/GRAMMAR.md`

### Dialogue lines (`NAME:` inline and block)
*Audience:* writer
A character name followed by a colon speaks the line. Inline form: `NAME: spoken text`. Block form: `NAME:` alone on a line, then indented lines — all merged into one dialogue box with line breaks between them.
```sparkdown
N: Hello there.

O:
  A meteor.
  Make a wish.
```
*Output:* A dialogue event tagged `dialogue:N` — the player sees that character's box. The block form puts both lines in ONE box ("A meteor.\nMake a wish."). Raw beat text keeps the `NAME: ` prefix; a separate interpreter layer strips it for rendering. The formatter normalizes only the sigil gap (`N:   Hello.` → `N: Hello.`) and never touches spacing inside the spoken text.
*Sources:* `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/dialogue-inline.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/block-dialogue.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/block-multiline-trailing-space.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/dialogue-inline-empty-body.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/misc/unhandled-falls-through.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/flow/scene-with-choices-and-divert.sd`, `packages/sparkdown/src/tests/runtime/fixtures/smoke/hello.sd`, `packages/sparkdown/src/tests/runtime/smoke.test.ts`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/display/dialogue-pacing.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/display/block-dialogue.sd`, `packages/sparkdown/language/sparkdown.language-grammar.json`
Divergence from Fountain: Fountain infers speakers from an ALL-CAPS cue on its own line above the speech; Sparkdown uses an explicit `NAME:` prefix. Fixtures use short capitalized/ALL-CAPS IDs (N, O, RAFFLES, ALICE) but casing is a convention, not an enforced rule in these fixtures. An empty body (`N:` alone with nothing after) is legal and produces an empty dialogue event. A dialogue line also works at file top level outside any scene. **Conflict resolved:** `packages/sparkdown/docs/compiler/GRAMMAR.md` §11.1 shows block dialogue opening with `@NARRATOR:` — that is stale; the current grammar's `BlockDialogue` rule (`packages/sparkdown/language/sparkdown.language-grammar.json`) has no `@` mark, and every compiler/formatter/runtime fixture uses plain `NAME:` (the `@` sigil belongs to write-to-target). Doc-only note (`docs/runtime/DEFERRED.md`): character parenthetical `N (whisper):` and position `N [LEFT]:` forms parse (the grammar includes a `ParentheticalLine` rule) but are not yet captured into runtime tags — a known gap, not yet fixture-verified.

### Character definitions resolve dialogue cues (`define ID as character`)
*Audience:* writer
`define <id> as character with name = "CUE" ... end` declares a speaker: `name` is the display name matched against dialogue cue lines, `color` the tint. Once defined, a cue line matching the `name` (e.g. `RAFFLES:`) resolves to that character with no unknown-character warning, and the engine can render its portrait/colors.
```sparkdown
define raffles as character with
  name = "RAFFLES"
end
```
*Output:* No "Cannot find character" warning; `program.context.character.raffles = { $type: "character", $name: "raffles", name: "RAFFLES" }`.
*Sources:* `packages/sparkdown/src/tests/runtime/FrontMatterAndCommentContext.test.ts`, `packages/sparkdown/src/tests/runtime/SameNameDefineRuntimeExport.test.ts`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/luau/define-block.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/luau/quote-normalization.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/stress/spark-tale-sample.sd`
Field commas are optional (both comma-separated and bare-newline field lists appear in fixtures). Custom character subtypes add fields (`define companion as character with store trust = 0 end`, then `define O as companion with ...`); instances are addressable as `companion.O`, passed to scenes, read in interpolation (`{c.name}`), and mutated (`& c.trust -= 1`). Possibly belongs in the defines/objects section — kept here because it is what makes dialogue cues resolve.

### Block form & indentation scoping (all display types)
*Audience:* writer
Every display line type has a block form: the sigil line alone (`NAME:`, `:`, `$:`, `^:`, `%:`, `@ target:`), then a body of lines indented at least as much as the opener. The block stays open as long as every following non-blank line has at least the opener's indent; the first under-indented line ends it (and is not consumed).
```sparkdown
N:
  Hello.
  How are you?
This is a new line outside the block.
```
*Output:* The indented lines belong to the block (one merged display event, source lines joined by line breaks); the final line is a separate action line outside it.
*Sources:* `packages/sparkdown/language/sparkdown.language-grammar.json`, `packages/sparkdown/docs/compiler/GRAMMAR.md`, `packages/sparkdown/docs/runtime/DEFERRED.md`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/block-dialogue.sd`
Blank lines and `//` comment lines do NOT end an open block — only a de-dented line does (grammar end pattern `(?=^(?!$|//|\1{{WS}}))`). Block dialogue additionally closes early at choice markers (`*`/`+`), diverts (`->`), other display sigils, and declaration keywords (`scene`, `branch`, `function`, `define`, `const`, `store`, `local`) even when indented (per the grammar's `BlockDialogue` end pattern). The formatter re-indents block bodies to 2 spaces if wrong but never touches text content. Grammar block node names: `BlockDialogue`, `BlockAction`, `BlockHeading`, `BlockTitle`, `BlockTransitional`, `BlockWrite`.

### Dialogue beat break (trailing `>`)
*Audience:* writer
A trailing `>` at the end of a display line splits the content into separate beats. Inside a block dialogue it splits what follows into a NEW dialogue event from the same character; on a standalone inline line it emits an extra line break after the text. Spaces before the `>` are significant and preserved.
```sparkdown
RAFFLES:
  Different rope! >
  ...I think.
```
*Output:* TWO separate dialogue events, both tagged `dialogue:RAFFLES` — first box "Different rope!", second box "...I think." Each beat is its own `Continue()` step / dialogue box, and each continuation re-emits the character cue so it routes to the same speaker. Without `>`, the multi-line block is a single beat with internal line breaks. Chains extend: `One. > Two. > Three.` yields three beats.
*Sources:* `packages/sparkdown/src/tests/runtime/ChainedDialogueBreak.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/chained-dialogue-break.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/trailing-break.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/display/glue-break-spacing.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/display/dialogue-pacing.sd`
No ink or Fountain equivalent. Motivation (test header): each beat is its own runtime checkpoint so the screenplay preview can route to every box in a chain. A trailing `>` with no content after it does NOT split — it is just trimmed (though `N: one line >` inline compiles to the text plus an extra trailing newline, and the pre-`>` trailing space survives in the first box's text). Fountain divergence: in Fountain a leading `>` means transition/centered text; in Sparkdown trailing `>` is a break marker and transitions use `%:`.

### Glue (`..`)
*Audience:* writer
`..` at a whitespace-delimited line boundary joins consecutive output lines with no newline between them — Sparkdown's replacement for ink's `<>` glue. Works in trailing position (`text ..`) and leading position (`.. text`), on any display line type, and the spaces before/after the marker are significant (preserved as the word separator).
```sparkdown
ALICE: a ..
ALICE: b ..
ALICE: c.
```
*Output:* One beat: "ALICE: a b c." (`Some ..` + `content` glues to "Some content"). Also joins mid-body lines within a block dialogue, and can glue a following block alternator's output onto a sentence.
*Sources:* `packages/sparkdown/src/tests/runtime/Glue.test.ts`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/display/glue-break-spacing.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/display/dialogue-pacing.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/stress/spark-tale-sample.sd`
DIVERGENCE from both upstreams: in Luau `..` is always string concat; in Sparkdown it is context-sensitive — between whitespace boundaries it is glue, between non-whitespace operands (`"a" .. "b"`) it is concat. There is no syntax to force one reading; surround with whitespace to get glue. Glued lines skip the line-type metadata tag and inherit the previous line's type. A leading-`..` line is always parsed as a bare continuation (it carries no prefix of its own). Sparkdown does not implement ink's "empty lines collapsed via implicit glue" behavior.

### Significant whitespace (multi-space pauses)
*Audience:* writer
Runs of 2+ spaces inside display text are semantically meaningful content — pacing pauses for typing-pace effects, where a longer run means a longer pause. Neither the compiler nor the formatter ever collapses them.
```sparkdown
N: Hello.  There is a short pause.    And a long one.
```
*Output:* Formatted output is byte-identical — the 2-space and 4-space runs survive. Applies to dialogue, action, headings (`$: A   MOONLIT   ROOFTOP`), titles, transitions, and `@ target:` writes; also to spacing before `..` glue and `>` break markers.
*Sources:* `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/display/dialogue-pacing.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/display/block-dialogue.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/display/heading.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/display/inline-action.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/display/write.sd`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`
Divergence from ink, which collapses whitespace. Only the sigil gap (between `NAME:`/`:`/`@ target:` and the first word) is formatter-normalized.

### Backslash escapes (`\*` literal, `\ ` hard line break)
*Audience:* writer
`\` before a punctuation character makes it literal (e.g. `\*` prevents emphasis). `\` before a space forces a line break at that point within the same display box.
```sparkdown
N: this is \*not italic\* here
N: hello\ world
```
*Output:* First line displays "this is *not italic* here" (asterisks literal, no italics). Second compiles to "hello\nworld" — one dialogue box with "hello" and "world" on separate lines (same shape as block-form indented-line joins). The backslash is preserved into compiled text and stripped at render time.
*Sources:* `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/escape-non-whitespace.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/escape-space-mid-content.sd`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`, `packages/sparkdown/docs/runtime/DEFERRED.md`
The escaped-space-as-hard-line-break rule is Sparkdown-specific. Docs additionally list `\<tab>` and `\<newline>` (paragraph break / line-join that preserves a single newline while treating the next line as plain text) escape forms, but no fixture exercises them — doc-only claim.

### Inline styling marks (`*` `**` `***` `_` `^` `~~` `::`)
*Audience:* writer
The renderer's full inline styling vocabulary (`InterpreterModule.MARKERS`): `*italic*`, `**bold**`, `***bold italic***`, `_underline_`, `^centered^`, `~~wavy~~` (animated ripple; longer marks slow it), `::shaky::` (animated tremble; longer marks slow it). Marks wrap words or phrases inside any display line.
```sparkdown
N: The star fell *here*.
```
*Output:* Marks pass through the compiled text stream verbatim (runtime-probed 2026-07-25, all seven forms, zero diagnostics); the interpreter converts them to styled/animated chunks. The formatter treats them as plain display text and never reflows them.
*Sources:* `packages/spark-engine/src/game/modules/interpreter/classes/InterpreterModule.ts` (MARKERS + mark handling), `packages/sparkdown/src/tests/runtime/PortInventory.test.ts`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/stress/spark-tale-sample.sd`
Escape with `\*` (etc.) to show the literal character (see backslash escapes). No rendered-output fixture pins the styled result yet — the vocabulary and passthrough are code+probe-verified; a DOM-harness fixture would fully pin it. The old cheatsheet's `` `raw` `` backtick form is NOT in MARKERS and is not documented.

### Scene heading (`$:`)
*Audience:* writer
`$: TEXT` (inline) or `$:` followed by an indented body (block) marks a scene heading / slugline.
```sparkdown
$: A MOONLIT ROOFTOP
```
*Output:* A display event tagged `heading` containing "A MOONLIT ROOFTOP". The compiled/raw beat text keeps the `$: ` prefix; the screenplay-preview interpreter layer strips it for rendering. Internal spacing is preserved (`$: A   MOONLIT   ROOFTOP`).
*Sources:* `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/inline-heading.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/block-heading.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/display/heading.sd`, `packages/sparkdown/src/tests/runtime/PortInventory.test.ts`
Divergence from Fountain: Fountain infers scene headings from INT./EXT. prefixes; Sparkdown uses the explicit `$:` sigil.

### Title card (`^:`)
*Audience:* writer
`^: TEXT` (inline) or `^:` plus indented body (block) displays a title card.
```sparkdown
^: THE TALE OF THE SPARK
```
*Output:* A display event tagged `title` containing "THE TALE OF THE SPARK".
*Sources:* `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/inline-title.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/block-title.sd`
Fountain has centered text (`> TEXT <`) and a title-page key-value block; Sparkdown's `^:` sigil is its own construct for in-story title display (document metadata lives in front matter instead).

### Transition (`%:`)
*Audience:* writer
`%: TEXT` (inline) or `%:` plus indented body (block) marks a transition (e.g. FADE OUT).
```sparkdown
%: FADE OUT
```
*Output:* A display event tagged `transitional` containing "FADE OUT".
*Sources:* `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/inline-transitional.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/block-transitional.sd`
Divergence from Fountain: Fountain infers transitions from ALL-CAPS lines ending in `TO:` (or a leading `>`); Sparkdown uses the explicit `%:` sigil.

### Write-to-target (`@ target:`)
*Audience:* advanced
`@ target: text` (inline) or `@ target:` plus indented body (block) writes display text into a named UI element instead of the default dialogue/action box. Whitespace after `@` is optional (the grammar's `WriteMark` is `@` followed by optional whitespace before the target name).
```sparkdown
@ target: some written content
```
*Output:* A display event tagged `write:target`; the tag encodes the destination so the UI routes the text to that element. The block form joins its indented lines with a line break into a single write event. Formatter: `@ target:    some  written  content` → `@ target: some  written  content` (sigil gap collapsed, internal double space preserved).
*Sources:* `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/inline-write.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/block-write.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/display/write.sd`, `packages/sparkdown/language/sparkdown.language-grammar.json`
No ink or Fountain equivalent. Possibly belongs in the UI section — kept here because it is a display-line sigil in the same prefix family. Note the `@` sigil is what makes this distinct from dialogue: `NAME:` speaks, `@ name:` writes to a UI element.

### `{expression}` interpolation in display text
*Audience:* writer
Curly braces `{...}` anywhere in a display line — action, inline dialogue, block dialogue, or other display bodies — evaluate any Luau expression (variable, dotted property path, literal, arithmetic, function call) and splice its value into the output at that point. A line may consist of a single `{x}`.
```sparkdown
store x = "Hello world 1"
{x}
Hello {"world"} 2.
```
*Output:* "Hello world 1" then "Hello world 2." (compiles to Text segments interleaved with VariableReference/expression nodes). Booleans print as `true`/`false`; nil prints as empty text; a string literal inside braces prints its own text.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/evaluation/basic-string-literals.sd`, `packages/sparkdown/src/tests/runtime/fixtures/variables/set-non-existent-variable.sd`, `packages/sparkdown/src/tests/runtime/Evaluation.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/single-interpolation.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/dialogue-inline-interpolated.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/block-dialogue-interpolated.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/display/text-interpolation.sd`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`
Same sigil as ink's inline logic `{...}`, but with the full Luau expression language inside (including calls like `{factorial(5)}` and paths like `{inventory.stars}`). Because `{}` is reserved for output interpolation, choice guards use `if` rather than ink's `{cond}` prefix. Doc note: mid-line diverts inside display text (`text -> target`) are also spliced inline — flow transfers right after the preceding text is emitted (possibly belongs in the flow section).

### Adjacent interpolations share a line
*Audience:* writer
Two interpolations written back-to-back on one line (`{x}{y}`) concatenate with no newline or separator between the values; only the last one in the chain emits the line break.
```sparkdown
store x = 5
local y = 4
{x}{y}
```
*Output:* `54`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/variables/temporaries-at-global-scope.sd`, `packages/sparkdown/src/tests/runtime/Variables.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/adjacent-interpolations.sd`
Mechanism (test comment): the lowerer peeks at the next sibling; if it is another interpolation with no Newline separator, the trailing `\n` is suppressed.

### Inline `{if cond then a else b}` conditional expression
*Audience:* writer
An if/elseif/else expression inside an interpolation chooses which value to print; the closing `}` terminates it — no `end` keyword needed. Full elseif chains are supported.
```sparkdown
{if false then "not true" else "true"}
{if 1 > 3 then "not true" elseif 2 + 2 == 4 then "true" else "not true"}
```
*Output:* "true" then "true". An elseif form with no else that matches nothing prints nothing.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/conditions/conditionals.sd`, `packages/sparkdown/src/tests/runtime/fixtures/evaluation/stack-leaks.sd`, `packages/sparkdown/src/tests/runtime/Conditions.test.ts`, `packages/sparkdown/src/tests/runtime/Evaluation.test.ts`
Sparkdown's equivalent of ink's inline `{cond:a|b}`. Also exercised in stack-leaks.sd, which asserts the evaluation stack drains to empty afterward. Possibly belongs in the conditions section — kept here because it is display-text syntax.

### `//` display line comments
*Audience:* writer
`//` followed by whitespace or end-of-line starts a comment in display (non-code) contexts. A whole-line comment vanishes entirely (its newline is swallowed); an end-of-line comment is stripped but the line break is kept.
```sparkdown
Action before. // trailing note
Action after.
```
*Output:* "Action before.\nAction after." — the note is gone; the two lines stay separate.
*Sources:* `packages/sparkdown/src/tests/runtime/DisplayLineComment.test.ts`, `packages/sparkdown/docs/compiler/GRAMMAR.md`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`
`//` NOT followed by whitespace is ordinary text — `http://example.com` survives intact (URL-safe, mirroring the `#` tag convention). `//` exists because `--` is not a comment in display contexts. `//` comment lines do not break open indented blocks, and a trailing `// comment` is allowed on scene declaration lines. Grammar rule name: `SparkdownLineComment`.

### `--` is an em-dash in display; a Luau comment only in code contexts
*Audience:* writer
In prose/dialogue, `--` renders as literal em-dash text — even at the start of an action line, or inside a display-level `if` block. Only inside Luau code contexts (function bodies, closure/define bodies, style bodies, expressions, .luau files) is `--` a line comment (with `--[==[...]==]` long-bracket comments also supported there).
```sparkdown
He turned -- slowly -- and left.
BUNNY:
  Wait --
```
*Output:* The em-dashes render as text; nothing is treated as a comment. Inside `function greet() ... end`, `-- a real comment` works normally, and a whole-line `--` inside a `style` body is skipped as a comment.
*Sources:* `packages/sparkdown/src/tests/runtime/FrontMatterAndCommentContext.test.ts`, `packages/sparkdown/src/tests/runtime/StyleDefine.test.ts`, `packages/sparkdown/src/tests/luau-conformance/Pcall.test.ts`, `packages/sparkdown/src/tests/luau-conformance/StdlibBatch1.test.ts`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/luau/opener-keyword-join.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/stress/spark-tale-sample.sd`
Divergence from Luau (where `--` always comments). Real screenplay ports routinely open and close action lines with `--` em-dashes (`-- He closes the app. --`) — a regression suite guards this. `--` also appears as a comment between top-level constructs (code context); the formatter preserves decorative `-- text --` banners there. Grammar rule name: `LuauComment`.

### Front matter (`---`-fenced metadata block)
*Audience:* writer
A block fenced by `---` lines (3+ dashes) at the top of a file holds Fountain-style `key: value` document metadata fields (title, credit, author, ...).
```sparkdown
---
title: My Title
credit: Written by
author: Someone
---
```
*Output:* Parses as `FrontMatter` with `FrontMatterFieldKeyword` nodes — no "Cannot find character named `title`" warnings. Each field is emitted as a `# key: value` tag on the story. The formatter collapses the value gap to one space (`title:    My Story` → `title: My Story`).
*Sources:* `packages/sparkdown/src/tests/runtime/FrontMatterAndCommentContext.test.ts`, `packages/sparkdown/language/sparkdown.language-grammar.json`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/misc/frontmatter.sd`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`
**Conflict resolved:** one reader (from the formatter fixture, which has no fences) described front matter as bare `key: value` lines at the top of the file; the grammar's `FrontMatter` rule requires the `---` begin AND end fences, and the runtime test's regression comment confirms that without the fence `title:` parses as a dialogue cue for a character named "title". The formatter fixture's normalization result is identical either way (dialogue sigil-gap collapsing looks the same), so it cannot discriminate — the `---`-fenced form is the verified canonical syntax (deciding files: `packages/sparkdown/language/sparkdown.language-grammar.json`, `packages/sparkdown/src/tests/runtime/FrontMatterAndCommentContext.test.ts`). Divergence from Fountain (whose title page is unfenced) and from Luau (`---` here is a fence, not a doc comment). Front-matter fields cannot contain `{expr}` interpolation (unlike ink tag content).

### Tags and notes (`#`)
*Audience:* writer
`# tag` at the end of a display line attaches a tag to that line (captured into `currentTags`); a line starting with `#` is a whole-line note.
```sparkdown
# a top-of-line note
N: Hello.   # greeting
```
*Output:* Line-start notes are dedented to column 0 by the formatter (an indented `   # another note` moves to `# another note`); trailing tags keep their exact pre-tag spacing (`N: Hello.   # greeting` is unchanged).
*Sources:* `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/misc/sol-tag.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/misc/tags.sd`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`, `packages/sparkdown/docs/compiler/GRAMMAR.md`
Similar to ink's `#` tags, plus the whole-line note form. Grammar rule name: `Annotation`. The `#` must be followed by whitespace or end-of-line to count (mirroring the `//` URL-safety convention). Front-matter fields surface as `# key: value` tags at runtime (see front matter). Possibly belongs in the metadata/integrator section for the tag-reading side.
# 02 — Choices, weaves & story flow

## Choices, weaves & story flow

### basic divert (`-> target`)
*Audience:* writer
`-> target` on its own line transfers flow to a scene (or dotted path). A story typically opens with a top-level `-> sceneName` to pick its entry point.
```sparkdown
-> RunAThing

scene RunAThing
  The first line.
  The second line.
  done
end
```
*Output:* `The first line.\nThe second line.\n`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/callstack/clean-callstack-reset-on-path-choice.sd`, `packages/sparkdown/src/tests/runtime/Diverts.test.ts`, `packages/sparkdown/src/tests/runtime/CallStack.test.ts`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/flow/divert.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/flow/divert-simple.sd`
Equivalent to ink's `-> knot` — identical sigil. Diverting to an unknown name is a compile-time error; forward references work because compilation is two-pass. The formatter normalizes `->   next_scene` to `-> next_scene` (single space after the arrow).

### scene declarations (`scene NAME ... end`)
*Audience:* writer
`scene NAME` opens a named top-level flow section; its body is indented and the block is closed with an explicit `end` keyword. This is sparkdown's equivalent of an ink knot (`=== knot ===`).
```sparkdown
scene knot1
  knot 1 line 1
  knot 1 line 2
  fin
end
```
*Output:* `knot 1 line 1\nknot 1 line 2\n` (then the story ends)
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/multiflow/multi-flow-basics.sd`, `packages/sparkdown/src/tests/runtime/Knots.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/flow/scene-without-params.sd`, `packages/sparkdown/src/tests/runtime/fixtures/tags/knot-stitch-tags.sd`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`, `packages/sparkdown/src/compiler/lower/utils/validateSceneBranchScope.ts`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/flow/scene.sd`
Divergence from ink: the `=== name ===` header syntax is replaced by a block keyword form with an explicit `end`. Conflict resolved: formatter snapshots (`format/flow/scene.sd`) show scenes without `end`, and reader-10 flagged "whether end is required is not determinable" — the compiler settles it: `validateSceneBranchScope.ts` emits an **Error**-severity diagnostic "Scene is missing its closing `end` keyword" when the `end` is absent (the parser recovers at the next `scene`/`branch`, but the script does not compile cleanly). The formatter fixtures are formatter-only inputs, not evidence of optional `end`. A scene name that collides with a `store` variable is a compile error (Duplicate identifier). Compiles to an ink Knot (isFunction: false).

### branch declarations (`branch NAME ... end`)
*Audience:* writer
`branch NAME ... end` nested inside a `scene` declares a sub-section — ink's "stitch". Reached by the dotted divert path `-> scene.branch`.
```sparkdown
-> main.opener
scene main
  branch opener
    Greetings.
  end
end
```
*Output:* `Greetings.\n`
*Sources:* `packages/sparkdown/src/tests/runtime/smoke.test.ts`, `packages/sparkdown/src/tests/runtime/fixtures/knots/knot-stitch-gather-counts.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/flow/branch-without-params.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/flow/branch-with-if-else-divert.sd`, `packages/sparkdown/src/tests/runtime/fixtures/tags/knot-stitch-tags.sd`, `packages/sparkdown/src/compiler/lower/utils/validateSceneBranchScope.ts`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/flow/branch.sd`
Divergence from ink: ink's `= stitchName` becomes a `branch NAME ... end` block. `end` is required here too (same Error diagnostic as scenes), and a branch outside any `scene` is a compile Error ("Branches are only allowed inside a `scene` block" — `validateSceneBranchScope.ts`); the formatter fixture with a bare top-level `branch` is formatter-only. Branches get the same auto-DONE termination as scenes, and have their own visit counts (`{branchName}` interpolation). Compiles to an ink Stitch under its Knot.

### dotted divert paths (`-> scene.branch.label`)
*Audience:* writer
Divert targets can be dotted paths that reach inside a scene: `-> scene.branch`, `-> scene.label`, or the full `-> scene.branch.label` for a labeled point nested in a branch.
```sparkdown
-> knot
scene knot
  -> knot.gather
  label gather
    g
  done
end
```
*Output:* `g\n`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/knots/knot-do-not-gather.sd`, `packages/sparkdown/src/tests/runtime/fixtures/diverts/divert-to-weave-points.sd`, `packages/sparkdown/src/tests/runtime/smoke.test.ts`, `packages/sparkdown/src/tests/runtime/Knots.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/flow/divert-dotted-path.sd`
Cross-scope dotted lookup deep-searches branches (Path.GetChildFromContext → FlowBase.ContentWithNameAtLevel) and works for both labeled anchors (`label x`) and labeled choices (`+ (target) text`) — `divert-to-weave-points.sd` drives `-> knot.stitch.gather` and `-> knot.stitch.choice`. Compiles to a Divert with a multi-part path (e.g. `["Foo","Bar"]`).

### `done` — end the current flow
*Audience:* writer
Bare `done` on its own line ends the current flow (ink's `-> DONE`). Content after it in the same scope never runs. The arrow form `-> DONE` (divert to the special DONE target) is also accepted.
```sparkdown
done
This content is inaccessible.
```
*Output:* (empty — the line after `done` never prints)
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/diverts/done-stops-flow.sd`, `packages/sparkdown/src/tests/runtime/Diverts.test.ts`, `packages/sparkdown/src/compiler/lower/lowerers/lowerDoneOrFin.ts`, `packages/sparkdown/src/tests/runtime/fixtures/choices/choice-diverts-to-done.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/flow/divert-done.sd`, `packages/sparkdown/src/tests/compiler/incrementalEquivalence.test.ts`
Divergence from ink: bare keyword instead of `-> DONE` (`lowerDoneOrFin.ts` lowers `done` to `Divert([DONE])`). Conflict resolved: some records implied `fin`/`done` fully *replace* the arrow forms — but compiler tests use `-> DONE` directly (`incrementalEquivalence.test.ts`) so both spellings work; the keywords are the idiomatic form. In a thread, `done` is thread-local — it ends the thread, not the story. Unreachable statements after `done`/`fin` get a greyed-out "Unnecessary"/"Unreachable statement detected" editor hint. A `done` in a choice body cuts the flow immediately — `choice-diverts-to-done`'s picked output is `choice` with no trailing newline.

### `fin` — end the story
*Audience:* writer
Bare `fin` ends the entire story (ink's `-> END`). The arrow form `-> END` is also accepted.
```sparkdown
scene the_esc
  This is the_esc
  fin
end
```
*Output:* `This is the_esc\n` (story over; canContinue is false, no more choices)
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/misc/end.sd`, `packages/sparkdown/src/tests/runtime/fixtures/diverts/tunnel-onwards-variable-target.sd`, `packages/sparkdown/src/tests/runtime/fixtures/multiflow/multi-flow-basics.sd`, `packages/sparkdown/src/tests/runtime/Misc.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/flow/divert-end.sd`, `packages/sparkdown/src/tests/compiler/scopeEquality.test.ts`, `packages/sparkdown/src/compiler/lower/lowerers/lowerDoneOrFin.ts`
Lowers to `Divert([END])`. Compiler tests also use `-> END` as a choice divert target (`scopeEquality.test.ts`: `+ a choice -> END`), so both forms coexist. Fixtures freely mix `fin` with choice bodies (`* "Leave"` then indented `fin`). An entirely empty `.sd` source also compiles and produces empty output; loose-end/end-of-content validation is intentionally disabled in sparkdown (screenplay-shaped narratives would trip it noisily).

### auto-termination (implicit `done`)
*Audience:* writer
A scene or branch whose body does not end with a divert, tunnel-onwards, or return automatically behaves as if it ended with `done` — no trailing terminator boilerplate needed.
```sparkdown
-> main
scene main
  Hello world.
end
```
*Output:* `Hello world.\n` (canContinue becomes false, no warnings)
*Sources:* `packages/sparkdown/src/tests/runtime/smoke.test.ts`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`
Divergence from ink, where running off the end of a knot is a runtime "ran out of content" error. SparkdownCompiler auto-appends `Divert(Done)` to any non-function scene/branch (smoke.test.ts: "scenes without explicit -> DONE auto-terminate cleanly").

### inline (same-line) diverts
*Audience:* writer
A divert at the end of a text line (`some text -> target`) transfers flow mid-line; the diverted-to text joins the same output line with no break.
```sparkdown
scene hurry_home
  We hurried home to Savile Row -> as_fast_as_we_could
end
scene as_fast_as_we_could
  as fast as we could.
  done
end
```
*Output:* `We hurried home to Savile Row as fast as we could.\n`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/diverts/same-line-divert-is-inline.sd`, `packages/sparkdown/src/tests/runtime/Diverts.test.ts`
Matches ink's mid-line divert gluing. The display-body lowerer detects the nested Divert node and emits it inline with the preceding text (lowerDisplay.ts).

### `choose ... end` choice blocks
*Audience:* writer
The `choose` keyword opens a block of choices (one per line, each starting with `*` or `+`), closed by `end`. When flow reaches the block, the player is presented the menu. `*`/`+` choice lines are only legal inside a `choose ... end` block — bare choice marks at scene level are a compile error whose message mentions `choose`.
```sparkdown
choose
  + hello
end
choose
  + world
end
```
*Output:* First menu shows the single choice "hello"; after picking it, the second menu shows "world".
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/choices/sequential-choose-blocks.sd`, `packages/sparkdown/src/tests/runtime/Choices.test.ts`, `packages/sparkdown/src/tests/runtime/PortInventory.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/flow/scene-with-choices-and-divert.sd`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`
Major divergence from ink, where bare `*`/`+` weave lines are the norm: sparkdown requires the enclosing block (PortInventory.test.ts: "SYNTAX: bare choice marks must be wrapped in choose...end"). This is the structural replacement for ink's flat weave — sequential weaves at one scope each get their own `choose...end`. Blocks can appear inside `scene` bodies or at the top level of a script. Divergence: sparkdown allows a `choose` block nested inside an `if` block — the construct ink rejects with a "nested choice" error is well-formed here (Choices.test.ts describe.skip note, validated by Builtins.test.ts "turns since nested"). The choose block also pushes a `local` scope frame. Costs roughly 3 extra lines per weave vs ink; the gain is that nesting depth is structural, not mark-counted.

### once-only choices (`*`)
*Audience:* writer
A choice line starting with `*` is once-only: after the player picks it, it disappears from the menu on subsequent visits.
```sparkdown
choose
  * Eat ice-cream[]
  * Drink coke[]
  * Munch cookies[]
then
  -> home
end
```
*Output:* Visiting the menu repeatedly: 3 choices, then 2 after one is picked, then 1, then 0.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/choices/once-only-choices-with-own-content.sd`, `packages/sparkdown/src/tests/runtime/fixtures/choices/once-only-choices-can-link-back-to-self.sd`, `packages/sparkdown/src/tests/runtime/Choices.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/flow/choice-once-only.sd`
Same `*` semantics as ink; compiles to a Choice node with `onceOnly: true`. Once-only removal is tracked by visit count, so a choice that loops back to its own menu (`-> opts`) is gone the second time around.

### sticky choices (`+`)
*Audience:* writer
A choice line starting with `+` is sticky: it stays in the menu even after being picked.
```sparkdown
-> test
scene test
  choose
    + Choice 1 -> test
    + Choice 2 -> test
  end
end
```
*Output:* After picking Choice 1 and returning to the scene, both choices are still offered (currentChoices.length stays 2).
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/choices/sticky-choices-stay-sticky.sd`, `packages/sparkdown/src/tests/runtime/Choices.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/flow/choice-sticky.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/flow/choices.sd`
Same `*` vs `+` distinction as ink; compiles with `onceOnly: false`.

### choice bodies (indented continuation content)
*Audience:* writer
Lines indented under a choice form its body — content that plays only when that choice is picked. The body can hold plain text, flow terminators, diverts, and whole nested `choose` blocks.
```sparkdown
choose
  * one
    choose
      * two
    then
      three
    end
  * four
    five
```
*Output:* Picking "one" then "two" outputs: `two\nthree\nsix\n` (the outer then-body "six" runs last).
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/weaves/weave-gathers.sd`, `packages/sparkdown/src/tests/runtime/fixtures/choices/choice-diverts-to-done.sd`, `packages/sparkdown/src/tests/runtime/fixtures/choices/should-not-gather-due-to-choice.sd`, `packages/sparkdown/src/tests/runtime/Weaves.test.ts`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/flow/choices-with-body.sd`
Equivalent to ink's indented weave content under a choice, but scoped by block structure instead of `*`-count depth. The formatter auto-indents body lines two spaces under their choice even when the author wrote them flush-left.

### bracketed choice text (`[...]` label/output split)
*Audience:* writer
Square brackets split choice text into three parts: text before `[` appears in both the menu label and the chosen output; text inside `[...]` appears only in the label; text after `]` appears only in the output. `* [Label]` shows a label but emits nothing when picked; `* text[]` emits only the pre-bracket text with no duplicate.
```sparkdown
choose
  * Hello[.], world.
end
```
*Output:* Menu label: "Hello." — picking it outputs: `Hello, world.\n`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/choices/weave-options.sd`, `packages/sparkdown/src/tests/runtime/fixtures/choices/default-choices.sd`, `packages/sparkdown/src/tests/runtime/fixtures/choices/non-text-in-choice-inner-content.sd`, `packages/sparkdown/src/tests/runtime/Choices.test.ts`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`
Same anatomy as ink (startContent / choiceOnlyContent / innerContent), verified by Choices.test.ts asserting label "Hello." vs chosen output "Hello, world.\n". Conflict resolved: a formatter-fixture record claimed brackets "wrap the whole option" as a divergence from ink's mid-line split — the whole-option form (`+ [Courage.] -> WishCourage`) is just the common special case where all the text is choice-only; the three-part split is fixture-proven, so there is no divergence. `* []` (completely blank bracket choice) emits a compile-time "Blank choice" warning (`lowerChoice.ts`), mirroring ink's parser check. The post-bracket output section can hold diverts and interpolations.

### choice same-line diverts (`* text -> target`)
*Audience:* writer
A `-> target` at the end of a choice line jumps to that scene or label when the choice is picked, instead of (or after) emitting body content.
```sparkdown
choose
  + if true [go to a stitch] -> a_stitch
end
```
*Output:* Picking "go to a stitch" jumps to scene a_stitch and outputs: `result\n`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/weaves/conditional-choice-in-weave.sd`, `packages/sparkdown/src/tests/runtime/fixtures/choices/sticky-choices-stay-sticky.sd`, `packages/sparkdown/src/tests/runtime/fixtures/choices/choice-thread-forking.sd`, `packages/sparkdown/src/tests/runtime/fixtures/choices/non-text-in-choice-inner-content.sd`
Works on `*` and `+` choices, with or without bracketed text, and combined with `(label)` markers (e.g. `* (firstOpt) [First choice] -> opts`).

### `then` gather clauses (`choose ... then ... end`)
*Audience:* writer
Inside a `choose` block, the `then` keyword introduces the gather body: content that runs after whichever choice was picked (and its body) finishes. `end` closes the whole block. This replaces ink's `-` gather lines.
```sparkdown
choose
  * Hi
  * Hey
then
  She nods.
end
```
*Output:* Menu shows "Hi" / "Hey"; picking "Hi" outputs: `Hi\nShe nods.\n`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/weaves/choose-then-block.sd`, `packages/sparkdown/src/tests/runtime/fixtures/choices/default-simple-gather.sd`, `packages/sparkdown/src/tests/runtime/fixtures/choices/should-not-gather-due-to-choice.sd`, `packages/sparkdown/src/tests/runtime/Weaves.test.ts`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/alternator/choose.sd`
Divergence from ink: gathers are expressed structurally with `then` bodies, not `-` marks; ink's `- - foo` depth-2 gather becomes the innermost `then` clause. `then` is optional when every choice diverts away. The `then` body is ordinary scene content — it can hold diverts, nested blocks, `##` tags and `[[...]]` annotations. A fallback choice inside a nested choose can bypass the outer `then` gather entirely (should-not-gather-due-to-choice: picking "opt" emits "opt\ntext\n" and never reaches the gather). Conflict resolved: reader-02 parenthetically claimed "the bare gather dash `- text` still exists, seen in divert-to-weave-points.sd" — this is wrong as a gather feature. The grammar (`packages/sparkdown/language/sparkdown.language-grammar.json`) has no gather rule at all (its only dash token is `EmDash`), DIVERGENCES.md's migration note states mark-counted gathers (`- - text`) and `- (label)` anchors are no longer accepted, and the single `- hello` line in `divert-to-weave-points.sd` is never reached by flow (the fixture's asserted output does not contain "hello"), so it exercises nothing. (A stale list at the bottom of DIVERGENCES.md still names "Gathers — `- (gather_name)`" as a sparkdown addition; the runtime fixtures and the migration note in the same doc outrank it.)

### labeled gathers (`then (name)`)
*Audience:* writer
After the options of a `choose` block, `then (name)` introduces a labeled gather point whose body runs after any option; the whole construct still closes with one `end`. The label participates in visit counting and dotted-path addressing like other weave points.
```sparkdown
choose
  * Hi
  * Hey
then (greeting)
  She nods.
end
```
*Output:* Same convergence behavior as an unlabeled `then`; `greeting` is a named section (lowered to a labeled ink Gather).
*Sources:* `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/flow/scene-with-choose-then-block.sd`, `packages/sparkdown/src/compiler/lower/lowerers/lowerSparkdownChooseBlock.ts`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`
Replaces ink's `- (label)` gather syntax — gathers are labeled-or-not symmetrically with `then (label)` / `then`. `lowerSparkdownChooseBlock.ts` builds a labeled `Gather` from the then-clause identifier. Historical note: external `- (continue)` gathers in migrated content were folded into `then` blocks (choose/then migration).

### nested `choose` blocks (weave nesting)
*Audience:* writer
A `choose` block placed inside a choice's body creates a nested weave level: the inner menu appears only after that choice is picked; the inner block's `then` closes the inner level and the outer `then` closes the outer level.
```sparkdown
choose
  * First
    choose
      * Very indented
    then
    end
then
  End
end
```
*Output:* Only "First" is visible initially; picking it surfaces "Very indented"; picking that outputs: `Very indented\nEnd\n`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/weaves/unbalanced-weave-indentation.sd`, `packages/sparkdown/src/tests/runtime/fixtures/weaves/weave-gathers.sd`, `packages/sparkdown/src/tests/runtime/Weaves.test.ts`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/alternator/nested-choose.sd`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`
Divergence from ink: ink expresses nesting depth by repeating the mark (`* * *`, `- -`); sparkdown expresses the same shapes with explicitly nested blocks — `* * * foo` becomes one `*` inside three nested `choose` blocks. The legacy mark-counted syntax is no longer accepted. An inner `then` can be empty (a bare `then` / `end` pair).

### choice text on the following line
*Audience:* writer
When the choice mark line holds only the mark (and optionally a `(label)`), the choice text may start on the next indented line — useful for very long choice text.
```sparkdown
* (say_something_interesting_about_bricklaying)
  I did have one interesting fact about bricklaying, if you don't mind me spending taking a fair bit of time to lay the groundwork for it.
```
*Output:* The menu shows the full long sentence as the choice's text (leading indent trimmed).
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/choices/newline-after-choice.sd`, `packages/sparkdown/src/tests/runtime/Choices.test.ts`
The grammar extends the Choice rule across the newline; runtime CleanOutputWhitespace trims the indent. This is also why a completely bare `*` line cannot be flagged as an "empty choice" error — it is grammar-ambiguous with this multi-line form (Choices.test.ts closed-by-design note).

### conditional choices (`* if cond text`)
*Audience:* writer
An `if condition` guard right after the choice mark gates whether the choice appears; false-guarded choices are filtered out of the menu entirely. The condition is a single identifier, dotted path, optional `not` prefix, or any parenthesized expression — it ends at whitespace and the rest of the line is choice text. Order with a label is `* (name) if cond text`.
```sparkdown
choose
  * if true one
  * if false not displayed
  * (name) if true two
  * if true three
end
```
*Output:* Menu shows exactly: one, two, three.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/choices/conditional-choices.sd`, `packages/sparkdown/src/tests/runtime/fixtures/weaves/conditional-choice-in-weave.sd`, `packages/sparkdown/src/tests/runtime/Choices.test.ts`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/flow/choice-if-gate.vsc.snap`
Divergence from ink: ink's `{cond}` brace guard prefix is spelled `if cond` — no `then`/`end` on the guard; `{}` stays reserved for interpolation. Wired to the runtime's ConditionalSingleBranch filter. Ink's inline conditional-with-embedded-choice (`{cond: * choice}`) is not replicated; `* if cond` achieves the same observable gating. The guard composes with quoted choice text and diverts (`* if has_key "Unlock the door." -> inside` — grammar token snapshot; note that fixture exists only as a `.vsc.snap`, its `.sd` input is missing). Choices.test.ts comments state multiple guards chain via logical AND, though no fixture shows two guards on one choice.

### visit-count conditions on choices
*Audience:* advanced
A scene or label name used as a choice condition reads its visit count. Bare form `* if test` uses ink truthiness (count 0 is falsy, so the choice hides until the scene has been visited). Arbitrary expressions must be parenthesized: `* if (test == 0)` is the sanctioned "not yet visited" idiom.
```sparkdown
choose
  * if (test == 0) visible choice
  * if test visible choice
end
```
*Output:* Only one choice is visible: "visible choice" (the read-count of unvisited scene `test` is 0).
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/choices/has-read-on-choice.sd`, `packages/sparkdown/src/tests/runtime/fixtures/choices/once-only-choices-can-link-back-to-self.sd`, `packages/sparkdown/src/tests/runtime/Choices.test.ts`
Divergence from both ink and Luau: ink's `not test` idiom does NOT port, because sparkdown's `not` is the Luau operator and `not 0` is false under Lua truthiness. Bare read-count conditions keep ink truthiness via Story.IsTruthy. Labeled choices feed the same mechanism: `* if firstOpt [Second choice]` unlocks after the `(firstOpt)` choice has been picked once.

### labeled choices (`* (name)` weave points)
*Audience:* writer
A parenthesized `(name)` right after the choice mark labels the choice as a weave point. The label's visit count can then gate other choices or be tested in logic, and the label is addressable by dotted divert paths.
```sparkdown
choose
  * (firstOpt) [First choice] -> opts
  * if firstOpt [Second choice] -> opts
  * -> end_anchor
end
```
*Output:* First visit: only "First choice". After picking it (loops back): only "Second choice". After both: the fallback fires and flow reaches end_anchor.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/choices/once-only-choices-can-link-back-to-self.sd`, `packages/sparkdown/src/tests/runtime/fixtures/choices/conditional-choices.sd`, `packages/sparkdown/src/tests/runtime/Choices.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/flow/choice-labeled.sd`, `packages/sparkdown/src/tests/runtime/fixtures/diverts/divert-to-weave-points.sd`
Same as ink's `* (label)` choice labels; compiles to a Choice with `label: "name"`. Combinable with `if` guards and bracketed text. Divertable from outside via dotted paths (`-> knot.stitch.choice`).

### fallback / default choices (`* ->` and `* -> target`)
*Audience:* writer
A choice with no text and only a divert is an invisible default: it never appears in the menu, and the runtime auto-picks it when no visible choices remain. `* -> target` jumps to a scene/label; bare `* ->` falls through to the block's `then` body. A textless choice may also carry an indented body instead of a divert.
```sparkdown
choose
  * ->
then
  x
end
```
*Output:* No menu is ever shown; output is: `x\n`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/choices/default-simple-gather.sd`, `packages/sparkdown/src/tests/runtime/fixtures/choices/default-choices.sd`, `packages/sparkdown/src/tests/runtime/fixtures/choices/various-default-choices.sd`, `packages/sparkdown/src/tests/runtime/fixtures/choices/fallback-choice-on-thread.sd`, `packages/sparkdown/src/tests/runtime/fixtures/choices/should-not-gather-due-to-choice.sd`, `packages/sparkdown/src/tests/runtime/Choices.test.ts`
Same semantics as ink's fallback choices. `various-default-choices` mixes both shapes and outputs "1\n2\n3\n" with no player interaction. Works when every visible sibling is filtered by a false `if` guard (fallback-choice-on-thread outputs "Fallback fired.\n"). A textless `*` with an indented body acts as a fallback whose body runs when auto-picked, and an inner fallback bypasses the outer `then` gather. The tunnel-onwards form can also sit on a fallback choice (`* ->-> elsewhere(8)`).

### `{expr}` interpolation in choice text
*Audience:* advanced
`{expression}` interpolations work inside all three choice-text sections (before `[`, inside `[...]`, after `]`); each section evaluates when the runtime renders that piece (label vs chosen output).
```sparkdown
store name = "Joe"
choose
  * 'Hello {name}[, your name is {name}.'],' I said, knowing full well that his name was {name}.
end
```
*Output:* Menu label: `'Hello Joe, your name is Joe.'` — picking outputs: `'Hello Joe,' I said, knowing full well that his name was Joe.\n`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/choices/logic-in-choices.sd`, `packages/sparkdown/src/tests/runtime/fixtures/choices/non-text-in-choice-inner-content.sd`, `packages/sparkdown/src/tests/runtime/Choices.test.ts`
Divergence from ink: ink's inline conditional text `{cond: text}` is written as the Luau short-circuit `{cond and "text" or ""}`. Inside `{...}` everything is Luau-expression-typed. (Interpolation in general possibly belongs in the display-text section of the master doc; kept here for its choice-specific anatomy.)

### `count.choices()` choice counter
*Audience:* advanced
`count.choices()` (sparkdown's analog of ink's CHOICE_COUNT) returns the number of choices accumulated up to the call site — usable in `{...}` interpolation.
```sparkdown
scene hub
  {count.choices()}
  <- side
  {count.choices()}
```
*Output:* `0\n1\n` — 0 before the thread spawn, 1 right after `<- side` registers the thread's choice (the hub's own choices aren't declared yet).
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/choices/choice-count-with-threads.sd`, `packages/sparkdown/src/tests/runtime/Choices.test.ts`
Namespaced function call replaces ink's SHOUTY built-in name. Possibly belongs in the built-in functions section of the master doc; kept here because its semantics are choice-menu-specific.

### label anchors (`label NAME`)
*Audience:* writer
A standalone `label NAME` statement declares a re-enterable divert target mid-scene; `-> NAME` (or a dotted path to it) jumps there. Two `label` declarations with the same name in one scope are a compile-time error.
```sparkdown
scene main
  label start
  choose
    * [Choice 1]
    * [Choice 2]
  then
    After choice
  end
  -> start
```
*Output:* Flow loops back to `start` after each pick, re-presenting the menu. Duplicate labels produce a compile error matching /same label name `x`/.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/choices/default-choices.sd`, `packages/sparkdown/src/tests/runtime/fixtures/knots/knot-stitch-gather-counts.sd`, `packages/sparkdown/src/tests/runtime/fixtures/diverts/path-to-self.sd`, `packages/sparkdown/src/tests/runtime/fixtures/tags/tags-in-sequence.sd`, `packages/sparkdown/src/tests/runtime/Weaves.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/flow/label-anchor.sd`, `packages/sparkdown/src/compiler/lower/lowerers/lowerLabelAnchor.ts`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`
Divergence from ink: replaces ink's `- (name)` labelled-gather form — a keyword statement, no parens, no overloaded `-` mark. Compiles to a named ink Gather at depth 0 (`lowerLabelAnchor.ts`), so the anchor captures subsequent sibling statements as its body via inkjs weave-assembly and gets its own visit count (`{loop}` interpolation). `* -> hello` fallbacks can jump forward to a later `label hello`, skipping unreachable lines between them.

### labels inside and after conditional bodies
*Audience:* writer
`label name` can sit inside an `if`/`elseif`/`else` branch body (as a divert anchor) or after the `end` (as a convergence point that branches divert to with `-> name`).
```sparkdown
store x = 1
if x == 1 then
  Tom enters.
  -> meet
elseif x == 2 then
  Sarah enters.
  -> meet
end
label meet
Now they look at each other.
```
*Output:* Either branch's text prints, then flow lands at `meet` and prints "Now they look at each other."
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/conditions/gather-inside-conditional-body.sd`, `packages/sparkdown/src/tests/runtime/fixtures/conditions/gather-inside-if.sd`, `packages/sparkdown/src/tests/runtime/Conditions.test.ts`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`
Divergence from ink: ink disallows gathers inside multiline conditionals because its `{ cond: - branch }` form uses `-` as the branch-arm prefix, clashing with gather marks; sparkdown's `if ... then ... end` has no `-` markers and its label is a keyword, so the restriction is lifted.

### scene & branch parameters and divert arguments
*Audience:* advanced
Scenes and branches declare parameters like functions — `scene place(value)`, optionally with Luau type annotations (`scene LoseTrust(c: companion)`) — and diverts pass arguments: `-> place(5)`. Inside the body, `{value}` interpolates the argument.
```sparkdown
-> main
scene main
  -> place(5)

end
scene place(value)
  {value}
  done
end
```
*Output:* `5\n`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/diverts/divert-targets-with-parameters.sd`, `packages/sparkdown/src/tests/runtime/Diverts.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/flow/scene-with-params.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/flow/scene-with-multiple-params.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/flow/branch-with-params.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/flow/scene-with-parameters.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/flow/divert-with-args.vsc.snap`, `packages/sparkdown/src/tests/runtime/PortInventory.test.ts`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`
Same as ink knot parameters, plus optional `: type` annotations (compile-time only; ink knot params are untyped) — a Luau borrow. Arguments also work on tunnel calls in a chain (`-> one(1) -> two(2) ->`), on tunnel invocations of typed scenes (`-> LoseTrust(companion.O) ->`), on parameterless tunnels (`-> PassTime() ->`), and on thread spawns (`<- thread1("red")`). Parameterized scene/branch diverts are the recommended replacement for ink's narrative functions (sparkdown functions are expression-only). The formatter tightens call args: `GainTrust(   companion.O   )` becomes `GainTrust(companion.O)`.

### tunnels (`-> f ->` call, `->->` return)
*Audience:* writer
`-> f ->` (trailing arrow) calls scene `f` as a tunnel: flow runs `f` and, when `f` executes `->->`, returns to just after the call. Bare `->->` is the tunnel-return statement.
```sparkdown
scene main
  -> f ->
  .. world
  done
end
scene f
  Hello
  ->->
end
```
*Output:* `Hello world\n` (the `..` glue joins the returned-to line onto Hello's line)
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/diverts/basic-tunnel.sd`, `packages/sparkdown/src/tests/runtime/fixtures/diverts/tunnel-vs-thread.sd`, `packages/sparkdown/src/tests/runtime/fixtures/choices/choice-thread-forking.sd`, `packages/sparkdown/src/tests/runtime/Diverts.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/flow/divert-tunnel.sd`
Same semantics as ink tunnels; the compiled Divert sets `isTunnel: true`. `tunnel-vs-thread.sd` contrasts the two transfer forms: a tunnel pauses the caller until `->->`; a thread (`<-`) runs alongside without pausing. Conflict resolved: the header comment in Diverts.test.ts still claims tunnels are "deferred", but the tests below it exercise and pass the whole tunnel family — the comment is stale (runtime assertions outrank test-header prose).

### multi-target tunnel chains (`-> A -> B -> C [->]`)
*Audience:* advanced
One divert statement may chain several targets: `-> first -> second -> third`. Every non-final target is a tunnel call; the final target is a tunnel only if a trailing `->` is present, otherwise it is a plain divert (flow never returns to the caller).
```sparkdown
scene main
  -> first -> second -> third ->
  Back at start.
  done
end
```
*Output:* With trailing arrow: `In first.\nIn second.\nIn third.\nBack at start.\n` — without it: `In first.\nIn second.\nIn third.\n` (no return)
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/diverts/multi-target-tunnel.sd`, `packages/sparkdown/src/tests/runtime/fixtures/diverts/multi-target-tunnel-chain.sd`, `packages/sparkdown/src/tests/runtime/fixtures/diverts/complex-tunnels.sd`, `packages/sparkdown/src/tests/runtime/Diverts.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/flow/multi-target-tunnel.sd`
Conflict resolved: one grammar-snapshot record described `-> Foo -> Bar` loosely as "visit Foo, then continue to Bar" without noting the no-return distinction — Diverts.test.ts (lines 233-252) pins the precise semantics: without the trailing `->`, "Back at start." never prints. Targets in a chain can take arguments: `-> one(1) -> two(2) ->` (complex-tunnels.sd outputs `one (1)\none and a half (1.5)\ntwo (2)\nthree (3)\n`). buildDivert walks nested Tunnel grammar nodes, setting isTunnel per target.

### tunnel-onwards with redirect (`->-> target(args)`)
*Audience:* advanced
`->-> target` pops the current tunnel frame but diverts to `target` instead of returning to the caller. The target may take arguments (`->-> b(5 + 3)`) and the whole form may sit on a fallback choice (`* ->-> elsewhere(8)`).
```sparkdown
scene A
  This is A
  ->-> B
end
scene B
  Now in B.
  done
end
```
*Output:* `This is A\nNow in B.\n` (the caller's post-tunnel text "We will never return to here!" is skipped)
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/diverts/tunnel-onwards-divert-override.sd`, `packages/sparkdown/src/tests/runtime/fixtures/diverts/tunnel-onwards-divert-after-with-arg.sd`, `packages/sparkdown/src/tests/runtime/fixtures/diverts/tunnel-onwards-with-param-default-choice.sd`, `packages/sparkdown/src/tests/runtime/Diverts.test.ts`
Same as ink's tunnel-onwards-with-divert. `->-> b(5 + 3)` evaluates arguments at pop time (output `8`). On a textless fallback choice it auto-fires when no visible choices exist. Variable divert targets are also accepted here (tunnel-onwards-variable-target.sd).

### chained tunnel pop (`-> X ->->`)
*Audience:* advanced
`-> tunnel2 ->->` inside a tunnel means: call `tunnel2` as a tunnel, and when it returns, immediately pop this frame too — landing back at the original caller.
```sparkdown
scene tunnel1
  Hello...
  -> tunnel2 ->->
end
scene tunnel2
  ...world.
  ->->
end
```
*Output:* `Hello...\n...world.\nThe End.\n` (control lands back in main after both pops)
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/diverts/tunnel-onwards-after-tunnel.sd`, `packages/sparkdown/src/tests/runtime/Diverts.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/flow/tunnel-onwards-after-tunnel.sd`
Matches ink's `-> x ->->` chained-pop form. The general rule: two trailing arrows on a chain (`-> X -> Y ->->`) additionally pop the outer caller's frame.

### threads (`<- scene`)
*Audience:* writer
`<- sceneName` spawns the named scene as a parallel flow. Its text emits in sequence, the spawning flow continues past the `<-` point without pausing, and any choices the thread reaches merge into the current decision point's menu. Picking a threaded choice resumes flow inside the thread's continuation, not back in the spawning scene.
```sparkdown
scene hub
  You arrive at the town square.
  <- merchant
  <- guard
  choose
    * "Leave town"
      fin
  end
end
```
*Output:* `You arrive at the town square.\n` then a single merged menu: "What do you sell?" / "Any news?" / "Leave town"
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/threads/multi-threads.sd`, `packages/sparkdown/src/tests/runtime/fixtures/threads/thread-done.sd`, `packages/sparkdown/src/tests/runtime/fixtures/threads/thread-in-logic.sd`, `packages/sparkdown/src/tests/runtime/fixtures/knots/knot-thread-interaction.sd`, `packages/sparkdown/src/tests/runtime/fixtures/knots/knot-thread-interaction-2.sd`, `packages/sparkdown/src/tests/runtime/fixtures/choices/choice-thread-forking.sd`, `packages/sparkdown/src/tests/runtime/fixtures/choices/fallback-choice-on-thread.sd`, `packages/sparkdown/src/tests/runtime/Threads.test.ts`, `packages/sparkdown/src/tests/runtime/Choices.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/flow/thread-simple.sd`
Same as ink threads (`<- thread`) — the canonical modular-menu composition tool; the compiled Divert sets `isThread: true`. Threads can be spawned conditionally inside `if` blocks (thread-in-logic.sd). Thread-merged choices keep full routing: a thread choice that diverts onward (`* "Check pack" -> pack`) runs the target scene when picked, and a thread may itself divert through intermediate scenes before settling at its choices (knot-thread-interaction-2.sd). Threads compose with conditional gating and invisible fallbacks: a thread whose only visible choice is `if false`-gated auto-fires its `* -> defaulted` fallback. Grammar parses `<-` as a Thread node; the lowerer emits StartThread. Empty `<-` (no target) is a grammar-level error pinned in grammar snapshots.

### parameterized threads (`<- thread1("red")`)
*Audience:* advanced
Thread spawns pass arguments like diverts do: `<- thread1("red")`. The spawned scene's parameters capture the values, and they persist into whatever the thread's choices later divert to.
```sparkdown
scene red
  Hello I'm red
  <- thread1("red")
  <- thread2("red")
  done
end
```
*Output:* Picking the thread's choice later runs its continuation with the captured value: `Thread 1 red choice\nAfter thread 1 choice (red)\n`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/multiflow/multi-flow-save-load-threads.sd`, `packages/sparkdown/src/tests/runtime/Multiflow.test.ts`
Captured arguments survive save/load: after state.ToJson()/LoadJson() the restored thread choices still carry name="red"/"blue" (Multiflow.test.ts).

### thread choices survive main-flow `done`
*Audience:* advanced
If the spawning flow hits `done` right after `<- side`, choices already collected by the thread remain available — `done` means "no more main-flow content", not "kill pending threads".
```sparkdown
scene main
  <- side
  done
end
scene side
  choose
    * "Survivor choice"
      fin
  end
  done
end
```
*Output:* (no text) then one choice: "Survivor choice"
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/threads/thread-survives-main-done.sd`, `packages/sparkdown/src/tests/runtime/Threads.test.ts`
Covers a historical inkjs bug; the thread's own `done` is likewise thread-local (thread-done.sd shows main text after the `<-` still rendering).

### divert targets as values
*Audience:* advanced
A divert arrow plus target is a first-class value: `store x = -> here` stores it, `-> x` later diverts to the stored target, and targets compare with `==` (`if -> X == -> Y then`). `->` also works as a type annotation for divert-target parameters: `function cut_to(escape: ->)`.
```sparkdown
store x = -> here
-> there

scene there
  -> x

end
scene here
  Here.
  done
end
```
*Output:* `Here.`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/variables/variable-divert-target.sd`, `packages/sparkdown/src/tests/runtime/Variables.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/flow/divert-target-as-value.vsc.snap`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/flow/if-dtv.vsc.snap`, `packages/sparkdown/docs/runtime/FUNCTIONS.md`, `packages/sparkdown/docs/runtime/DEFERRED.md`
Lowered to a DivertTargetValue at runtime (same machinery as ink's `VAR x = -> here`). Divert-target values are the sanctioned way to persist a "callable" reference in a store (function values are forbidden in stores). The `->` type annotation is purely declarative today (any value is accepted as a target at runtime). Variable targets are accepted anywhere a target is used, including tunnel-onwards. Note: the comparison/annotation fixtures exist only as `.vsc.snap` token snapshots — the `.sd` inputs are missing. Possibly also belongs in the variables section of the master doc.

### glue marker (`..` at line start)
*Audience:* writer
A display line beginning with `.. ` glues onto the previous output line, suppressing the newline between them (ink's `<>`).
```sparkdown
if true then
  {"a"}
end
.. b
```
*Output:* `a b`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/logic/multiline-logic-with-glue.sd`, `packages/sparkdown/src/tests/runtime/fixtures/diverts/basic-tunnel.sd`, `packages/sparkdown/src/tests/runtime/Logic.test.ts`
Same `..` token as string concat — position determines meaning: line-leading = glue marker, mid-expression = concatenation. Ink's `} <> {cond: ...}` same-line pattern has no clean sparkdown equivalent since `if ... then` needs its own line. Possibly belongs in the display-text section of the master doc; kept here because glue is the standard companion to tunnels/diverts for mid-line joins.

### Luau loops (`while`, numeric `for`, `repeat...until`, `do...end`)
*Audience:* advanced
All Lua loop forms work in code contexts, including one-line bodies. Numeric `for i = start, stop[, step]` snapshots its bounds at entry, drives a hidden index (writing the loop var doesn't affect iteration), doesn't leak the variable, and follows Luau direction semantics. `repeat`'s `until` condition sees body locals; `do ... end` blocks scope locals.
```sparkdown
local i = 0
repeat
i = i + 1
local done = i >= 2
host_record(i)
until done
```
*Output:* 1 then 2 — the until condition reads the body-local `done`.
*Sources:* `packages/sparkdown/src/tests/luau-conformance/Loops.test.ts`, `packages/sparkdown/src/tests/luau-conformance/LuaLoops.test.ts`, `packages/sparkdown/src/tests/luau-conformance/ForLoopVarCapture.test.ts`
Possibly belongs in the Luau logic/scripting section of the master doc — these are code-block control flow, not narrative weave flow. `nan`/`inf` are ordinary identifiers, not literals; math.huge is true Infinity and survives story-JSON serialization (the former 3.4e38 clamp divergence was removed). Note the separate stale-doc caveat: DIVERGENCES.md's Luau appendix claims loop lowerers are no-op stubs — the luau-conformance suite passing outranks that prose.

### `break` and `continue`
*Audience:* advanced
`break` exits the innermost loop of any kind (while, numeric for, repeat, generic for), even from inside nested if/do blocks. `continue` (a Luau keyword, not in Lua) skips to the next iteration and still applies the for-step.
```sparkdown
while i < 5 do
i = i + 1
if i == 3 then
continue
end
host_record(i)
end
```
*Output:* 1, 2, 4, 5 — iteration 3 is skipped.
*Sources:* `packages/sparkdown/src/tests/luau-conformance/Loops.test.ts`, `packages/sparkdown/src/tests/luau-conformance/TimelyUpvalueClosing.test.ts`
Possibly belongs in the Luau logic/scripting section of the master doc.

### generic `for ... in` and the iterator protocol
*Audience:* advanced
`for k, v in pairs(t)`, `for i, v in ipairs(t)`, `for k in next, t`, closure-based user iterators, and Luau's generalized iteration: iterating a plain table directly (`for k, v in t do` behaves like pairs) and the `__iter` metamethod. An iterator yielding 0 does NOT terminate (only nil does). Non-iterables raise a trappable "attempt to iterate over a X value".
```sparkdown
local y = 0
for k, v in {1, 2, 3, nil, 5, a = 1, b = 2, c = 3} do
  y += v
end
host_record(y)
```
*Output:* 17 — plain-table iteration visits all non-nil entries (1+2+3+5+1+2+3).
*Sources:* `packages/sparkdown/src/tests/luau-conformance/Loops.test.ts`, `packages/sparkdown/src/tests/luau-conformance/IterProtocol.test.ts`, `packages/sparkdown/src/tests/luau-conformance/LuaTablesIterators.test.ts`
Possibly belongs in the Luau logic/scripting section of the master doc. pairs/ipairs return Lua's full (fn, state, control) triple, so manual invocation works: `local inext = ipairs(t)` then `inext(t, 2)`.

### scene headings (`$:`)
*Audience:* writer
`$:` at line start marks a scene heading (slugline). The heading text may contain `{expr}` interpolation.
```sparkdown
$: A MOONLIT ROOFTOP - {format(currentTimeOfDay)}
```
*Output:* Renders as a screenplay slugline; the formatter collapses the gap after the sigil (`$:   A   MOONLIT   ROOFTOP` → `$: A   MOONLIT   ROOFTOP`) while keeping internal spacing.
*Sources:* `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/display/heading.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/stress/spark-tale-sample.sd`
Fountain divergence: Fountain detects headings from INT./EXT. prefixes; Sparkdown uses the explicit `$:` sigil. Possibly belongs in the display/screenplay section of the master doc — kept per no-drop rule since it was grouped under "scenes" by its reader (note: it is a *display* heading, unrelated to `scene` flow declarations).

### title lines (`^:`)
*Audience:* writer
`^:` at line start displays a title card line.
```sparkdown
^: THE TALE OF THE SPARK
```
*Output:* Renders as a title line; formatter normalizes the sigil gap only.
*Sources:* `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/display/title.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/stress/spark-tale-sample.sd`
Possibly belongs in the display/screenplay section of the master doc.

### transitions (`%:`)
*Audience:* writer
`%:` at line start marks a transitional line (FADE OUT, time cuts).
```sparkdown
%: FADE   OUT
```
*Output:* Renders as a transition; unchanged by the formatter (internal spacing preserved).
*Sources:* `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/display/transitional.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/stress/spark-tale-sample.sd`
Used narratively too: `%: A few hours later...` inside `scene PassTime()`. Fountain divergence: Fountain transitions are `>` or ALL CAPS ending in TO:; Sparkdown uses `%:`. Possibly belongs in the display/screenplay section of the master doc.
# Section 03

## Dynamic text: alternators, glue, tags & interpolation

### Inline `{expr}` interpolation in display text
*Audience:* writer
`{expression}` inside any display line evaluates the expression (variable reference, arithmetic, or function call) and splices the resulting value into the text.
```sparkdown
I have {five()} eggs.
done

function five() return "five" end
```
*Output:* `I have five eggs.`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/glue/inline-function-return-in-interp.sd`, `packages/sparkdown/src/tests/runtime/fixtures/newlines/value-returning-function-eval.sd`, `packages/sparkdown/src/tests/runtime/fixtures/misc/nested-include/includes/included_file_4.sd`, `packages/sparkdown/src/tests/runtime/fixtures/extra/arithmetic-2.sd`, `packages/sparkdown/src/tests/runtime/PortInventory.test.ts`
Divergences from ink: (1) a string LITERAL containing `{3}` is just those characters — sparkdown does not re-evaluate interpolation markers inside returned strings the way ink does; (2) an interpolation that evaluates to empty on its own line still emits its line break (ink collapses the line via implicit glue). Functions are expression-only — they return values, they don't emit narrative (use scenes or `print()` for that).

### Function calls inside `{expr}` interpolation
*Audience:* writer
Any function — user-defined, builtin, or external binding — called inside `{...}` in display text prints its return value; the same call written as a `&` statement discards the value instead.
```sparkdown
& message("hello world")
{multiply(5.0, 3)}
{times(3, "knock ")}
```
*Output:* `15` then `knock knock knock` (and the host receives `"hello world"` as a side effect). Number formatting drops trailing `.0`: `multiply(5.0, 3)` prints `15`, not `15.0`.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/bindings/external-binding.sd`, `packages/sparkdown/src/tests/runtime/fixtures/builtins/count-turns.sd`, `packages/sparkdown/src/tests/runtime/fixtures/methods/string-methods.sd`, `packages/sparkdown/src/tests/runtime/Bindings.test.ts`
Interpolated method chains and builtins work the same way (`{s:upper()}`, `{count.turns()}`).

### Inline conditional text `{if cond then "text"}`
*Audience:* writer
`{if cond then "text"}` inside a display line emits the text only when the condition is true; when false it emits nothing and any trailing space left behind is trimmed. This is sparkdown's mapping of ink's inline `{cond: text}` shorthand.
```sparkdown
A {if f() then "B"}
X
done

function f() return false end
```
*Output:* `A` then `X` — `f()` is false, so nothing is emitted and the trailing space after "A" is trimmed.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/glue/inline-conditional-empty-then.sd`, `packages/sparkdown/src/tests/runtime/Glue.test.ts`

### Block `if cond then ... end` around display lines
*Audience:* writer
A multi-line `if cond then <display lines> end` block in scene content emits its body lines with clean line joins — the block itself introduces no leading or trailing blank lines. This is the sparkdown form of ink's multi-line `{cond: body}` conditional.
```sparkdown
A line.
if f() then
  Another line.
end
```
*Output:* `A line.` / `Another line.` — ported ink tests pin that a body starting right after the condition does not emit a leading newline.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/glue/left-right-glue-matching.sd`, `packages/sparkdown/src/tests/runtime/fixtures/newlines/newline-at-start-of-multiline-conditional.sd`, `packages/sparkdown/src/tests/runtime/fixtures/newlines/external-fallback.sd`
Possibly belongs in the flow-control/conditionals section of the master doc; kept here because the pinned behavior is about newline handling in display output.

### Glue marker `..` (leading and trailing)
*Audience:* writer
A line beginning with `.. ` joins onto the previous line; a line ending with ` ..` glues the following line onto itself. This is sparkdown's replacement for ink's `<>` glue marker.
```sparkdown
Some
.. content
.. with glue.
```
*Output:* `Some content with glue.` — the trailing form (`Some ..` / `content ..` / `with glue.`) produces the identical joined output; the single space before a trailing `..` is preserved as the word separator.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/glue/simple-glue.sd`, `packages/sparkdown/src/tests/runtime/fixtures/glue/trailing-glue.sd`, `packages/sparkdown/src/tests/runtime/Glue.test.ts`
Divergence from ink: ink uses `<>`; sparkdown uses `..` sitting between whitespace boundaries. A fixed regression: trailing `..` used to be read as literal text by the display lowerer.

### Glue across all display-line types (beat merging)
*Audience:* writer
`..` joins consecutive display lines of EVERY type — action, `NAME:` dialogue, `$:` heading, `^:` title, `%:` transitional, `@target:` write — in both leading and trailing position. The joined lines become a SINGLE `Continue()` beat, and the continuation inherits the first line's display target (its routing prefix appears once).
```sparkdown
ALICE: a ..
ALICE: b ..
ALICE: c.
```
*Output:* One beat: `ALICE: a b c.` — the repeated `ALICE:` prefix is dropped from continuations.
*Sources:* `packages/sparkdown/src/tests/runtime/Glue.test.ts`
A leading-`..` line is always parsed as a bare continuation (it carries no prefix of its own). Glue also works mid-body inside block dialogue (`ALICE:` + indented lines), where the separator space survives indentation stripping. Without `..`, block-dialogue body lines stay on separate lines within one beat.

### Same-line divert glues text (`hello -> world`)
*Audience:* writer
A divert on the same line as text (`hello -> world`) joins the text with the diverted-to scene's first content onto ONE output line. A divert on the following indented line keeps them on separate lines.
```sparkdown
hello -> world
scene world
  world
  done
end
```
*Output:* `hello world` (one line). With the divert on the next line instead: `hello` / `world` on two lines.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/newlines/newline-consistency-1.sd`, `packages/sparkdown/src/tests/runtime/fixtures/newlines/newline-consistency-2.sd`, `packages/sparkdown/src/tests/runtime/fixtures/newlines/newline-consistency-3.sd`
Also applies inside choices: `* hello -> world` produces "hello world", while `* hello` with `-> world` on the next indented line produces "hello" / "world". Possibly belongs in the diverts/flow section of the master doc.

### Whitespace collapsing across diverts
*Audience:* writer
Blank space at the join between a divert and the target scene's content is collapsed — chained scenes emit consecutive lines with no extra blank line between them.
```sparkdown
scene firstKnot
  Hello!
  -> secondKnot
end
scene secondKnot
  World.
  fin
end
```
*Output:* `Hello!` / `World.`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/misc/whitespace.sd`, `packages/sparkdown/src/tests/runtime/Misc.test.ts`
Possibly belongs in the diverts/flow section of the master doc.

### `queue` alternator (play once through, then nothing)
*Audience:* writer
The `queue` keyword plays its arms in order, one per visit, then emits nothing once exhausted. Compiles to an ink `Sequence` with sequenceType `Once` — the equivalent of ink's once-only `{!a|b|c}`. Available in all alternator forms (block, single-line block, inline `{...}`, inline-glued).
```sparkdown
queue
  | apple
  | banana
  | cherry
end
```
*Output:* Five visits output `apple` / `banana` / `cherry` — exhausted visits emit nothing at all in the block form. (The inline expression form `{queue|"A"|"B"|"C"}` instead yields `A\nB\nC\n\n\n` — a blank line per exhausted visit, because the line's own newline survives.)
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/sequences/block-display-text.sd`, `packages/sparkdown/src/tests/runtime/fixtures/sequences/inline-queue.sd`, `packages/sparkdown/src/tests/runtime/fixtures/sequences/single-line-block-queue.sd`, `packages/sparkdown/src/tests/runtime/fixtures/sequences/inline-glued-queue.sd`, `packages/sparkdown/src/tests/runtime/Sequences.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/alternator/queue-three-arms.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/alternator/single-line-queue.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/alternator/queue.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/alternator/queue-inline-block.sd`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`
There is no `once` keyword — `queue` is sparkdown's rename of ink's once-only sequence, and ink's `{!a|b|c}` sigil syntax is not supported (docs claim, `DIVERGENCES.md`). Block arms may be plain display text or diverts (`| -> A`). Docs also claim the four alternator keywords are reserved words (a bare `queue` in `local queue = 5` is consumed as a keyword, not an identifier).

### `cycle` alternator (wrap around)
*Audience:* writer
The `cycle` keyword plays arms in order and wraps back to the first arm indefinitely. Compiles to a `Sequence` with sequenceType `Cycle` — the equivalent of ink's `{&a|b|c}`.
```sparkdown
{cycle|"A"|"B"|"C"}
```
*Output:* Seven visits output `A B C A B C A` (one per line).
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/sequences/inline-cycle.sd`, `packages/sparkdown/src/tests/runtime/fixtures/sequences/single-line-block-cycle.sd`, `packages/sparkdown/src/tests/runtime/fixtures/sequences/inline-glued-cycle.sd`, `packages/sparkdown/src/tests/runtime/Sequences.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/alternator/cycle-three-arms.sd`

### `chain` alternator (stick on last)
*Audience:* writer
The `chain` keyword plays arms in order, then keeps repeating the final arm on every later visit. Compiles to a `Sequence` with sequenceType `Stopping` — the equivalent of ink's default sequence `{a|b|c}`.
```sparkdown
{chain|"A"|"B"|"C"}
```
*Output:* Five visits output `A B C C C` (one per line).
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/sequences/inline-chain.sd`, `packages/sparkdown/src/tests/runtime/fixtures/sequences/inline-glued-chain.sd`, `packages/sparkdown/src/tests/runtime/fixtures/choices/once-only-choices-with-own-content.sd`, `packages/sparkdown/src/tests/runtime/Sequences.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/alternator/chain-three-arms.sd`
In display context: `This is the {chain | "first" | "second" | "third" end} time.` — the `end` keyword inside `{...}` is optional (the closing `}` also terminates the alternator; see the inline braced form).

### `shuffle` modifier (randomized alternators)
*Audience:* writer
Prefixing an alternator keyword with `shuffle` randomizes arm order: `shuffle queue` plays each arm once in random order then nothing; `shuffle cycle` reshuffles every cycle; `shuffle chain` plays a random order then sticks. `shuffle` can also stand alone as its own block (`shuffle ... end`).
```sparkdown
{shuffle queue|"A"|"B"|"C"}
```
*Output:* First 3 visits emit A, B, C in some random order; later visits emit nothing. `shuffle cycle` over 6 visits emits each of A/B/C exactly twice. Compile snapshots pin the sequence types `Shuffle|Once`, `Shuffle|Cycle`, `Shuffle|Stopping`.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/sequences/inline-shuffle-queue.sd`, `packages/sparkdown/src/tests/runtime/fixtures/sequences/inline-shuffle-cycle.sd`, `packages/sparkdown/src/tests/runtime/fixtures/sequences/inline-shuffle-chain.sd`, `packages/sparkdown/src/tests/runtime/fixtures/sequences/inline-glued-shuffle.sd`, `packages/sparkdown/src/tests/runtime/Sequences.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/alternator/shuffle-queue.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/alternator/shuffle-cycle.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/alternator/shuffle-chain.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/alternator/bare-shuffle.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/stress/spark-tale-sample.sd`
Divergence: `shuffle` is a sparkdown extension that composes with any of the three keywords, replacing ink's separate `{~a|b|c}` shuffle form; sparkdown's `shuffle chain` has no direct ink equivalent. The grammar classifies `shuffle` as a modifier keyword (LUAU_SEQUENTIAL_MODIFIER_KEYWORDS), separate from the base keywords. Runtime tests assert set membership rather than order (no PRNG seeding, unlike ink's seeded spec test). Verified conflict resolution: `shuffle chain` sticks on whichever arm was EMITTED last in the shuffled order (the runtime test asserts `lines[3] == lines[4] == lines[2]` where lines 1-3 are a random permutation — `packages/sparkdown/src/tests/runtime/Sequences.test.ts`); a formatter stress-fixture comment claiming the final AUTHORED arm is held fixed while the rest shuffle (`spark-tale-sample.sd`, "B, A, C, D, D, D...") is contradicted by that assertion — runtime outranks fixture prose.

### Block alternator form (multi-line)
*Audience:* writer
As a standalone statement in a scene body: the keyword on its own line, each arm on its own line starting with `|`, closed by `end`. Arms are display content — bare text, no quotes — and can hold full display content including diverts (`| -> someKnot`), nested blocks, and interpolations.
```sparkdown
queue
  | apple
  | banana
  | cherry
end
```
*Output:* `apple` / `banana` / `cherry` over five visits (nothing emitted once exhausted).
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/sequences/block-display-text.sd`, `packages/sparkdown/src/tests/runtime/Sequences.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/alternator/queue.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/alternator/sequential.sd`
The canonical sparkdown shape for narrative alternators; arm content is lowered with the same display machinery as the scene body itself. Parses as `LuauSparkdownSequentialAlternatorBlock`.

### Single-line block alternator form
*Audience:* writer
The block form compressed onto one line: `keyword | arm | arm | arm end`. Arms hold simple display text only — no diverts or nested blocks (those need the multi-line shape). The trailing `end` is required in this form.
```sparkdown
queue | apple | banana | cherry end
```
*Output:* `apple` / `banana` / `cherry` over five visits.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/sequences/single-line-block-queue.sd`, `packages/sparkdown/src/tests/runtime/fixtures/sequences/single-line-block-cycle.sd`, `packages/sparkdown/src/tests/runtime/fixtures/sequences/single-line-block-plural.sd`, `packages/sparkdown/src/tests/runtime/fixtures/sequences/empty-middle-arm-chain.sd`, `packages/sparkdown/src/tests/runtime/Sequences.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/alternator/single-line-block-queue.sd`
Selected by a `(?=[|])` grammar lookahead after the keyword; each arm terminates at the next `|` or ` end` so subsequent separators aren't absorbed as text. Lowering is identical to the multi-line shape. Parses as `LuauSparkdownSingleLineSequentialAlternatorBlock`.

### Inline braced alternator form (`{keyword|...}`, expression arms)
*Audience:* advanced
Inside `{...}` interpolation, an alternator is written `{keyword|arm|arm|arm}` where arms are Luau EXPRESSIONS — text arms must be string literals (`"A"`). A closing `end` before the `}` is optional. Usable anywhere an expression goes.
```sparkdown
{queue|"A"|"B"|"C"}
```
*Output:* `A\nB\nC\n\n\n` over five visits — empty string once exhausted, but the line's newline is still emitted (unlike the block/glued display forms, which emit nothing).
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/sequences/inline-queue.sd`, `packages/sparkdown/src/tests/runtime/fixtures/sequences/inline-cycle.sd`, `packages/sparkdown/src/tests/runtime/fixtures/sequences/inline-chain.sd`, `packages/sparkdown/src/tests/runtime/Sequences.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/alternator/inline-queue.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/alternator/inline-queue.snap`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/alternator/inline-sequential.sd`
Divergence from ink: ink's `{a|b|c}` bare-text arms don't work here because `{...}` content is expression-typed; the mapping is `{a|b|c}` → `{chain|"a"|"b"|"c"}`, `{!...}` → `queue`, `{&...}` → `cycle`. Verified conflict resolutions: (1) bare arms like `{queue | A | B | C end}` DO parse, but as variable references, not text — the grammar snapshot `inline-queue.snap` shows `A`/`B`/`C` tokenized as `LuauVariableName`; (2) the `end` is OPTIONAL in this form — the runtime fixture `inline-queue.sd` omits it and passes with zero compile errors, while `once-only-choices-with-own-content.sd` includes it and also passes (this overrides a grammar-reader claim that `end` is required). Formatter gotcha pinned in a committed snapshot (`inline-sequential.formatted.sd`): formatting `{queue|a|b|c end}` strips the space before `end`, producing `{queue|a|b|cend}` — which, per the grammar, changes the last arm from variable `c` to variable `cend`. Avoid relying on a space-separated `end` inside braces; omit it instead.

### Inline-glued alternator form (`.. keyword|a|b ..`)
*Audience:* writer
A mid-sentence alternator spliced into a narrative line: `Before .. keyword|A|B|C .. After.` The leading and trailing `..` are required delimiters marking where the alternator begins and ends; arms are bare display text (no quotes), and no `end` is needed.
```sparkdown
Before .. queue|A|B|C .. After.
```
*Output:* `Before A After.` / `Before B After.` / `Before C After.` / `Before After.` / `Before After.` — when exhausted, the runtime collapses the surrounding whitespace so there is no double-space gap.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/sequences/inline-glued-queue.sd`, `packages/sparkdown/src/tests/runtime/fixtures/sequences/inline-glued-cycle.sd`, `packages/sparkdown/src/tests/runtime/fixtures/sequences/inline-glued-chain.sd`, `packages/sparkdown/src/tests/runtime/fixtures/sequences/inline-glued-shuffle.sd`, `packages/sparkdown/src/tests/runtime/Sequences.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/alternator/inline-glued-shuffle-queue.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/alternator/inline-glued.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/alternator/inline-glued-bare.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/alternator/inline-glued-in-scene.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/alternator/inline-glued-after-interp.sd`
The closing `..` is consumed as part of the construct and never appears in output. Works at top level, inside scenes, and directly after an interpolation (`You have {n} .. plural(n)|one=apple|other=apples .. in the basket.`). Parses as `LuauSparkdownInlineGluedSequentialAlternatorBlock` (or Conditional). Conditional alternators use `key=value` arms in this form.

### Empty alternator arms (adjacent `|` separators)
*Audience:* writer
Two adjacent `|` separators create an empty arm; when the alternator reaches it, that visit emits nothing at all — no newline, no blank line.
```sparkdown
chain | a | | b end
```
*Output:* Five visits output `a` / `b` / `b` / `b` — the second (empty) visit produces no line.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/sequences/empty-middle-arm-chain.sd`, `packages/sparkdown/src/tests/runtime/Sequences.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/alternator/single-line-empty-arms.sd`
Mirrors ink's `{a||b}` blank-step sequences — but that shape can't be written in sparkdown's inline `{}` form (expression-typed); use the single-line block form instead. The lowerer's `lowerArms` walks separators sequentially, so two adjacent separators create an arm with an empty body.

### Escaping a literal `|` in alternator arms (`\|`)
*Audience:* writer
`\|` escapes a literal pipe character inside an alternator arm so the arm isn't split at that point.
```sparkdown
chain | this is a '\|' character | this isn't end
```
*Output:* First visit: `this is a '|' character`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/misc/escape-character-in-arm.sd`, `packages/sparkdown/src/tests/runtime/fixtures/misc/author-warnings-no-error.sd`
`TODO:`-looking text inside an arm is plain content — sparkdown has no ink-style TODO author-warning mechanism (different diagnostic surface).

### Alternators as expressions (inside functions)
*Audience:* advanced
An alternator block can be used as an EXPRESSION — e.g. `return ( chain | "a" | "b" end )` — since functions can only display strings by returning them. In expression context arms are quoted or backtick strings.
```sparkdown
function interrogate()
  return (
    chain
      | "first"
      | "second"
      | "third"
    end
  )
end
```
*Output:* Each call returns the alternator's next arm as a string ("first", then "second", then "third" repeatedly).
*Sources:* `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/luau/multi-line-parens.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/stress/spark-tale-sample.sd`
Backtick strings allow embedded quotes and interpolation in arms: `` | `It rattles with {potion_count} health potions.` ``. Conditional alternators work too: `return ( plural (potion_count) | zero = ... end )`, and inline conditional alternators are legal inside backtick template strings returned from functions: `` return `There {plural(n)|one="is"|other="are"} {n} {plural(n)|one="goose"|other="geese"}.` ``.

### `match` alternator (value switch)
*Audience:* writer
`match (expr)` (parens around the subject optional) opens a block whose arms are `| value = result`; `other` is the fallback arm; closed with `end`. Also usable inline: `{match(x) | a = "first" | b = "second"}` with quoted-string values. Roughly replaces ink's `{expr: - val: ...}` switch blocks.
```sparkdown
match (player_class)
  | warrior = "A meat shield."
  | mage = "A scholar."
  | other = "A recruit."
end
```
*Output:* Shows the arm whose label equals the subject value; compiles to a Conditional whose init is the matched expression, one branch per arm comparing against the string value, with `other` becoming the isElse (catch-all) branch.
*Sources:* `packages/sparkdown/src/tests/compiler/__snapshots__/compile/alternator/match-three-arms.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/alternator/match.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/alternator/match-paren-less.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/stress/spark-tale-sample.sd`, `packages/sparkdown/docs/runtime/RUNTIME.md`
Arm values compile to string comparisons; block-form arm values are display text (may mix quoted dialogue and narration on one line), inline-form values are quoted strings. `match` is one of two conditional-alternator keywords (with `plural`). Formatter conventions: one space in `match (x)` at statement level, arms indented one level, `| key = value` single-spaced in block form; inside braces all spaces around `|` and `=` are stripped. Note: in `match`, `other` IS a true catch-all — unlike in `plural`, where `other` is a literal CLDR category name.

### `plural` alternator with named CLDR keys
*Audience:* writer
`plural(n)` heads a conditional alternator whose arms are keyed by CLDR plural category names (`zero`, `one`, `two`, `few`, `many`, `other`): `.. plural(n)|one=apple|other=apples ..` (inline-glued), `plural (n) | one = ... | other = ... end` (block), or `{plural(n)|one="apple"|other="apples"}` (braced, quoted values). The arm matching n's plural category is emitted.
```sparkdown
You have {n} .. plural(n)|one=apple|other=apples .. in the basket.
```
*Output:* With n = 1, 2, 3: `You have 1 apple in the basket.` / `You have 2 apples in the basket.` / `You have 3 apples in the basket.`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/sequences/inline-glued-plural.sd`, `packages/sparkdown/src/tests/runtime/fixtures/sequences/single-line-block-plural.sd`, `packages/sparkdown/src/tests/runtime/Sequences.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/alternator/plural-three-arms.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/alternator/inline-glued-plural-display-text.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/alternator/plural.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/alternator/plural-inline.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/alternator/plural-no-space-arms.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/alternator/conditional.sd`, `packages/sparkdown/docs/runtime/STDLIB.md`
No ink equivalent — a sparkdown localization extension. Compiles to a `Conditional(init=plural.category(n))` with per-category Text branches; the category is computed at runtime from `lang.current` via `engine/PluralRules.ts`. Arm values may be bare display text (block/glued forms) or quoted strings (braced/code forms), and may themselves contain `{interpolations}` (`| other = It rattles with {potion_count} health potions.`). Whitespace around `|` and `=` is optional. Docs-level gotcha (`DEFERRED.md`/`RUNTIME.md`): in `plural`, `other` is a literal CLDR category name matched by string equality, NOT a catch-all — corroborated by the lowerer using a separate `else` key for the positional catch-all. Formatter normalizes statement-position `plural(count)` to `plural (count)`; inline `{plural(n)|...}` stays tight. Inline forms suppress leading newlines in arm bodies.

### `plural` alternator with positional arms
*Audience:* writer
Positional sugar: two unkeyed arms `.. plural(n)|apple|apples ..` mean singular vs everything else (the lowerer treats them as `one=apple|else=apples`). A single unkeyed arm is a catch-all that runs regardless of n.
```sparkdown
You have {n} .. plural(n)|apple|apples .. in the basket.
```
*Output:* `You have 1 apple in the basket.` / `You have 2 apples in the basket.` / `You have 3 apples in the basket.` — the single-arm form (`.. plural(n)|item ..`) yields `item` for every n.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/sequences/inline-glued-plural-positional.sd`, `packages/sparkdown/src/tests/runtime/fixtures/sequences/inline-glued-plural-positional-single.sd`, `packages/sparkdown/src/tests/runtime/Sequences.test.ts`
Two-arm sugar works for languages whose CLDR rules collapse to singular-vs-plural (English, French, Spanish, German, Italian, Portuguese); finer-grained languages (Russian, Arabic, Welsh) need named keys. Single-arm form suits invariant nouns (fish, sheep).

### `plural` pluralization-table call form
*Audience:* advanced
Inside an interpolation, `plural(count)` can instead be followed directly by a table literal of category strings: `{plural(inventory.stars){one="star",other="stars"}}` — a curried call taking a `{[string]: string}` pluralizations table.
```sparkdown
You now have {inventory.stars} {plural(inventory.stars){one="star",other="stars"}} and {inventory.coins} {plural(inventory.coins){one="coin",other="coins"}}.
```
*Output:* The category string matching the count is spliced in ("1 star", "2 stars", etc.).
*Sources:* `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/display/implicit-action-with-plural.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/luau-function/anonymous-expression.sd`
The anonymous-expression fixture shows the underlying shape: `plural(n)` returns `function (pluralizations: {[string]: string})`, so this is a function-call spelling of the same feature as the `|arm` syntax.

### `plural.category(n)` stdlib function
*Audience:* advanced
`plural.category(n)` is directly callable and returns the CLDR category name as a string (`"zero"`, `"one"`, `"two"`, `"few"`, `"many"`, `"other"`), independent of any alternator; the language comes from `lang.current`.
```sparkdown
{plural.category(1)}
lang.current = "ar"
{plural.category(5)}
```
*Output:* English: 0→other, 1→one, 2→other. Arabic exercises all six categories: 0→zero, 1→one, 2→two, 5→few, 15→many. Full fixture output: `other one other zero one two few many` (one per line).
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/sequences/plural-category-direct.sd`, `packages/sparkdown/src/tests/runtime/Sequences.test.ts`, `packages/sparkdown/docs/runtime/STDLIB.md`
It is also the desugar target for `plural(n)|...` alternators. A non-number argument raises a story error and returns `"other"` (`src/inkjs/engine/StdLib.ts`).

### Runtime language selection (`lang.current`)
*Audience:* advanced
Assigning `lang.current = "fr"` (a `store` table property) switches which CLDR plural rule set `plural(...)` and `plural.category(...)` use, at runtime — not a compile-time default.
```sparkdown
scene main
  lang.current = "fr"
  label start
  & n = n + 1
  Vous avez {n} .. plural(n)|one=pomme|other=pommes ..
```
*Output:* French rules put n ∈ {0, 1} in category "one": `Vous avez 1 pomme` / `Vous avez 2 pommes` / `Vous avez 3 pommes`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/sequences/inline-glued-plural-french.sd`, `packages/sparkdown/src/tests/runtime/Sequences.test.ts`, `packages/sparkdown/src/inkjs/engine/StdLib.ts`, `packages/sparkdown/docs/runtime/RUNTIME.md`
Verified (was flagged as unclear by a reader): the engine defaults to `"en"` when no `lang` store exists — `StdLib.ts`'s `plural.category` reads `lang.current` (dotted name first, then a `lang` object with a `current` key) and falls back to English when neither is set; fixtures declaring `store lang = { current = "en" }` do so for explicitness, not necessity. Docs list rules for en/fr/es/de/it/pt/ru/ja/zh/ko/vi/th/ar/cy, with unknown languages falling back to English.

### `# tag` lines (global, scene, branch, and dynamic tags)
*Audience:* writer
`# tag text` attaches metadata. Tags above the first content line are file-level global tags; tags at the top of a scene/branch (before any content) are that container's static tags; tags after content surface dynamically in `currentTags` as the story runs. Multiple `# a # b` tags can share one line.
```sparkdown
# author: Joe
# version: 1.0
This is the content
done

scene knot
  # knot tag
  Knot content
  # end of knot tag
  fin
end
```
*Output:* `story.globalTags = ["author: Joe", "version: 1.0"]`; `TagsForContentAtPath("knot") = ["knot tag"]`; after "Knot content" the next Continue surfaces "end of knot tag" in `currentTags`.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/tags/knot-stitch-tags.sd`, `packages/sparkdown/src/tests/runtime/Tags.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/tag/tag-plain.sd`
Runtime API (`globalTags`, `currentTags`, `TagsForContentAtPath`) is inherited from inkjs. Integrator gotcha: sparkdown wraps every display line in line-type metadata tags (action / dialogue:Name / heading / title / transitional / write) that appear in `currentTags` alongside author tags — hosts must filter them. A tag below content is NOT part of a container's static tags. Divergence from Fountain, where `#` marks a section heading.

### Dynamic `{var}` interpolation inside tags
*Audience:* writer
Tag bodies may embed `{var}` single-identifier references, substituted at runtime, anywhere in the body — including glued together to build filenames (`# pic{amount}{color}.jpg`) or mid-body (`# a tag {var} more`).
```sparkdown
store color = "red"
store amount = 8
tag # pic{amount}{color}.jpg
done
```
*Output:* Line "tag" carries the tag `pic8red.jpg` in `currentTags`.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/tags/dynamic-tags.sd`, `packages/sparkdown/src/tests/runtime/Tags.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/tag/tag-interpolation.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/tag/tag-interpolation-midbody.sd`
Verified (readers appeared to disagree): only single-identifier `{var}` references are supported in tag bodies at runtime — not arbitrary expressions (`{5+3}`) or inline alternators (`{red|blue}`), which ink allows. `Tags.test.ts` rewrites the upstream ink fixture to pre-computed stored values precisely because `appendInterpolatedTagText` only handles identifiers, and the grammar fixtures likewise only exercise single identifiers — so there is no actual grammar/runtime contradiction. The same constraint applies to the choice-tag interpolation path.

### Tags on choices (`#` inside choice text)
*Audience:* writer
`# tag` inside choice text attaches tags. Tags in the label sections (before `[` and inside `[...]`) become the choice's `.tags`, visible alongside the menu label; tags in the output section (after `]`) surface in `currentTags` when the choice is taken. Tag bodies may contain `{var}` interpolations.
```sparkdown
choose
  + one # one [two # two] three # three
    fin
end
```
*Output:* Menu: label "one two" with tags `["one", "two"]`. Picking outputs "one three" with `currentTags` `["one", "three"]`.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/choices/tags-in-choice.sd`, `packages/sparkdown/src/tests/runtime/fixtures/choices/dynamic-tags-in-choice.sd`, `packages/sparkdown/src/tests/runtime/Choices.test.ts`
Dynamic tags: `+ [choice # tag {var1}{var2}]` with var1="aaa", var2="bbb" yields tags `["tag aaabbb"]` — interpolations concatenate into the tag string. Possibly also belongs in the choices section of the master doc.

### Per-arm `# tag` inside inline-glued alternators
*Audience:* writer
Inside an inline-glued alternator (`.. type|arm|arm ..` spliced into a display line), each arm can carry its own `# tag` annotation; the tag is emitted only when that arm is shown. The arm-tag is bounded by `|`, the closing `..`, or `end`.
```sparkdown
A .. queue|red # red|white # white|blue # blue|green # green .. sequence.
```
*Output:* 1st visit: "A red sequence." with tag `red`; 2nd visit: "A white sequence." with tag `white`.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/tags/tags-in-sequence.sd`, `packages/sparkdown/src/tests/runtime/Tags.test.ts`

### `##` section tags and `[[...]]` lines inside choose-then bodies
*Audience:* writer
The `then` clause of a `choose ... then ... end` block is ordinary scene content: it may contain standalone `#`/`##` section-tag lines, `[[...]]` annotation/asset-command lines, display text, and diverts.
```sparkdown
then
  ## FinalImage
  [[show backdrop bg]]
  Action after the choice.
  -> next
end
```
*Output:* Picking a choice runs the then-body: output contains "Action after the choice." then continues into the diverted scene ("Done.").
*Sources:* `packages/sparkdown/src/tests/runtime/ChooseThenTagBody.test.ts`
Regression-guarded: the choose-block/then-clause grammar originally lacked `#Annotation`, so a standalone tag line in the body sent the parser into an infinite empty-match loop (surfaced in the editor on the real R&B port with `## FinalImage`). Possibly also belongs in the choices section of the master doc.
# 04 — Logic, variables & expressions

## Logic, variables & expressions

Sparkdown's logic layer is a Luau superset: display text is the default, and code is marked either by keywords (`store`, `local`, `const`, `if`, `function`, ...) or by the `&` statement prefix. There is no `var` or `temp` keyword anywhere in the fixtures — the declaration pair is `store` (persistent global) / `local` (block-scoped temporary), replacing ink's `VAR`/`temp`.

### Interpolation `{expr}` in display text

*Audience:* writer
`{expression}` inside any display line evaluates a full Luau expression and splices the result into the text — property chains, arithmetic, function calls `{foo(a, b)}`, and the `cond and x or y` ternary idiom all work; also valid in scene headings.

```sparkdown
N: There are {inventory.stars} items.
A: Sum is {a + b}.
N: Compare {x == y and "yes" or "no"}.
```

*Output:* The evaluated value is spliced into the line the player sees. Interpolating a bare boolean prints `true`/`false`; interpolating `nil` prints nothing (runtime fixtures) — in Luau code contexts `tostring(nil)` is the text `nil`.
*Sources:* `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/display/interpolation-whitespace.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/luau/expression-in-interpolation.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/stress/spark-tale-sample.sd`
Possibly belongs in the Display/Text section of the master doc — kept here because it is the writer-facing surface of the expression language. The formatter normalizes whitespace inside braces (`{ inventory . stars }` → `{inventory.stars}`) but leaves braces inside backtick template strings untouched.

### `store` — persistent global variables

*Audience:* advanced
`store name = value` declares a global variable (ink's `VAR`); the initializer may be a number, string, table literal, divert target, or property access on a define (`store currentTimeOfDay = TIME_OF_DAY.NIGHT`). Only `store`-marked state persists into save files.

```sparkdown
store x = "world"
Hello {x}.
```

*Output:* `Hello world.`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/evaluation/basic-string-literals.sd`, `packages/sparkdown/src/tests/runtime/fixtures/variables/variable-get-set-api.sd`, `packages/sparkdown/src/tests/runtime/StoreOnlySerialization.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/variable/store-simple.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/variable/store-with-property-access.sd`, `packages/sparkdown/docs/runtime/FUNCTIONS.md`, `packages/sparkdown/docs/runtime/RUNTIME.md`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/stress/spark-tale-sample.sd`
Declarations are position-independent: `variable-get-set-api.sd` declares `store x = 5` at the bottom of the file, after the scene that reads it. Inside a `define`, `store prop = default` marks the property instance-owned and it is the ONLY per-instance state serialized (`StoreOnlySerialization.test.ts`); non-store props/methods are reconstructed at init. Docs (FUNCTIONS.md, flagged "design") additionally claim `store` is illegal inside `function` bodies and inside `if`/`for`/`while`/`do` blocks, that `store`/`const` bypass lexical scoping, and that function values may never be store-reachable — enforcement of these rules is not verified by any cited test.

### `local` — block-scoped temporary variables

*Audience:* advanced
`local name = value` declares a temporary variable scoped to the enclosing block (Luau semantics); `local x` with no initializer declares it as nil. Usable at top level, inside if-branches, and inside functions. Locals are never saved.

```sparkdown
store x = 5
local y = 4
{x}{y}
```

*Output:* `54`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/variables/temporaries-at-global-scope.sd`, `packages/sparkdown/src/tests/runtime/Scoping.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/variable/local-decl.sd`, `packages/sparkdown/src/tests/luau-conformance/LocalNoInit.test.ts`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`
DIVERGENCE from ink: ink's `temp` is function-scoped; sparkdown's `local` is block-scoped like Luau (implemented via BeginScope/EndScope control commands per `Scoping.test.ts`). There is no keyword for ink's function-scoped shape — declare in the outer scope if a value must survive a block. `& local x = 5` (explicit-prefixed) is also valid at top level.

### `const` — named constants

*Audience:* advanced
`const NAME = value` declares a compile-time constant (ink's `CONST`; standard Luau has no `const`). Table-literal consts serve as enums: `const TIME_OF_DAY = { MORNING = 1, ... }` read as `TIME_OF_DAY.NIGHT`.

```sparkdown
const c = 5
store x = c
{x}
```

*Output:* `5`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/variables/const.sd`, `packages/sparkdown/src/tests/runtime/fixtures/variables/const-explicit.sd`, `packages/sparkdown/src/tests/runtime/fixtures/variables/multiple-constant-references.sd`, `packages/sparkdown/src/tests/runtime/fixtures/strings/string-constants.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/variable/const-decl.sd`, `packages/sparkdown/src/tests/runtime/PortInventory.test.ts`, `packages/sparkdown/docs/runtime/DEFERRED.md`
Works with strings and tables; a store variable can be compared against a const with `==` (`multiple-constant-references.sd`). Conflict resolved: DIVERGENCES.md still says const is "currently lowered to var", but the compiler snapshot `const-decl.sd` shows a true `ConstantDeclaration` node (no runtime assignment emitted) and DEFERRED.md marks the lowering resolved — the doc line is stale; references resolve at compile time and reassignment trips a name-conflict error.

### `&` explicit-statement prefix

*Audience:* advanced
A leading `&` marks a line as a logic statement rather than display text — sparkdown's replacement for ink's `~`. It is REQUIRED at the top level of flow (scenes/branches/main) for bare reassignments (`& x = 15`) and discard function calls (`& run()`, `& message("hello world")`), OPTIONAL on declarations (`& store x = 5`, `& const c = 5`, `& local x = 5` — the keyword already disambiguates), and UNNECESSARY inside function bodies, where plain `foo()` and bare assignments are valid Luau.

```sparkdown
& run()
done

function run()
host_record(42)
end
```

*Output:* `host_record` fires with 42 and the logic lines emit no display text.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/functions/function-and-increment-together.sd`, `packages/sparkdown/src/tests/runtime/fixtures/variables/const-explicit.sd`, `packages/sparkdown/src/tests/runtime/fixtures/evaluation/compound-assignment.sd`, `packages/sparkdown/src/tests/luau-conformance/BareCalls.test.ts`, `packages/sparkdown/src/tests/luau-conformance/RedundantDiscardPrefix.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/variable/explicit-assign-simple.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/luau/redundant-discard-prefix.sd`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`
A redundant `&` inside a function body produces an Information-severity "unnecessary" diagnostic (`RedundantDiscardPrefix.test.ts`) and the formatter removes it. `& foo()` is a discard call — the return value is popped; non-call bare expressions after `&` (`& foo`, `& 1 + 2`) are dropped. Inside if-bodies a bare `x = 99` parses without `&` (`scoping/reassign-without-local.sd`), and property assignments like `lang.current = "fr"` appear un-prefixed in sequence fixtures. Doc gotcha (DEFERRED.md): recursive discard-calls inside a `function` body hang the runtime. Unasserted edge: `divert-in-conditional.sd` writes `& -> done` inside an if-block, but no test pins whether `&` is required before a divert there.

### Reassignment without declaration (scope walk)

*Audience:* advanced
Assigning without a declaration keyword (`x = 99` or `& x = 5`) searches enclosing scopes innermost-to-outermost for an existing binding and mutates it; a global mutated inside an if-block stays changed after the block.

```sparkdown
local x = 1
if true then
  x = 99
end
{x}
```

*Output:* `99`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/scoping/reassign-without-local.sd`, `packages/sparkdown/src/tests/runtime/fixtures/variables/variable-declaration-in-conditional.sd`, `packages/sparkdown/src/tests/runtime/Scoping.test.ts`
Contrast with `local x = ...` inside the block, which creates a new shadowing binding instead (see the block-scoping entry).

### Auto-globals and no autovivification

*Audience:* advanced
A bare `Y = expr` with no prior declaration creates a global, per Luau — including in flow (`& foundTheAlley = true`). But a nested write into an undeclared table (`& inventory.star += 1`) raises "attempt to index a nil value": declare the table first.

```sparkdown
& inventory = { star = 0 }
& inventory.star += 1
```

*Output:* `inventory.star == 1`; without the declaration the same write errors at runtime.
*Sources:* `packages/sparkdown/src/tests/luau-conformance/BareCallAutoGlobal.test.ts`, `packages/sparkdown/src/tests/runtime/PortInventory.test.ts`
Matches Luau: no autovivification. `PortInventory.test.ts` marks the no-autovivification behavior a standing DESIGN DECISION that could flip. Auto-globals can hold any value including closures later called (`Y = function(le) return le end` then `Y(F)`).

### `if / elseif / else / end` blocks

*Audience:* writer
Multi-line conditionals use Luau keywords directly in narrative flow: `if cond then` ... `elseif cond then` ... `else` ... `end`. Bodies may contain display lines, dialogue, interpolations, diverts, labels, `&`-statements, and bare assignments.

```sparkdown
store x = 3
if x == 1 then
  {"one"}
elseif x == 2 then
  {"two"}
else
  {"other"}
end
```

*Output:* `other` — exactly one branch's content emits.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/conditions/else-branches.sd`, `packages/sparkdown/src/tests/runtime/fixtures/conditions/empty-conditional-branch.sd`, `packages/sparkdown/src/tests/runtime/fixtures/conditions/all-switch-branches-fail-is-clean.sd`, `packages/sparkdown/src/tests/runtime/Conditions.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/conditional/if-elseif-else.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/flow/scene-with-if-display.sd`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`
DIVERGENCE from ink: replaces ink's `{cond: A - else: B}` brace conditionals. There is no separate switch construct — ink's switch-on-value alternators port to if/elseif chains. A matching branch with an empty body emits nothing (`Continue()` === `""`), and a chain where no branch matches emits nothing and leaves the eval stack clean. Bare-variable conditions are wrapped in a TRUTHY unary check at compile time. Multi-line conditions before `then` are allowed; a forgotten `end` is bounded — the block bails at the next scene/branch instead of eating the rest of the document. Each branch body pushes its own `local` scope.

### Truthiness (Lua rules; ink rules in narrative constructs)

*Audience:* advanced
In Luau code contexts (`if`, `elseif`, `while`, `and`, `or`, `not`, `assert`), only `nil` and `false` are falsy — `0`, `""`, and every table are truthy. `not` always returns a genuine boolean.

```sparkdown
assert((0 or 5) == 0)
assert((nil or 7) == 7)
assert((not 0) == false)
assert(0)
assert("")
```

*Output:* All pass — 0 and the empty string are truthy.
*Sources:* `packages/sparkdown/src/tests/luau-conformance/LuaTruthiness.test.ts`, `packages/sparkdown/src/tests/luau-conformance/Assert.test.ts`, `packages/sparkdown/src/tests/runtime/fixtures/booleans/not-one.sd`, `packages/sparkdown/src/tests/runtime/fixtures/evaluation/literal-unary.sd`, `packages/sparkdown/src/tests/runtime/Booleans.test.ts`
DIVERGENCE from ink, which treats 0 as falsy. Conflict resolved: DIVERGENCES.md's Nil section claims `nil` lowers to integer `0` (so nil would be indistinguishable from zero), but runtime conformance tests assert `undefined_var == nil` passes, `tostring(nil)` is `"nil"`, and `assert(0)` succeeds (`UndefinedAsNil.test.ts`, `LuaTruthiness.test.ts`) — nil is a real distinct value and the doc is stale. Documented context split kept by design: ink-style narrative constructs (choice conditions like `* if seen_scene`) go through `Story.IsTruthy` and keep INK truthiness, so read-count-0 still reads as false there.

### Boolean operators `not` / `and` / `or` with short-circuit selection

*Audience:* advanced
Boolean operators are the Luau keywords `not`, `and`, `or` (there is no `!`, `&&`, `||`). `and`/`or` short-circuit — the untaken branch never evaluates — and return an operand rather than a boolean, enabling guarded indexing (`t and t.field`) and the `cond and a or b` ternary idiom.

```sparkdown
store x = false
{not x and "yes" or "no"}
```

*Output:* `yes`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/smoke/not-runtime.sd`, `packages/sparkdown/src/tests/runtime/smoke.test.ts`, `packages/sparkdown/src/tests/luau-conformance/ShortCircuitAndOr.test.ts`, `packages/sparkdown/src/tests/runtime/fixtures/variables/multiple-constant-references.sd`, `packages/sparkdown/src/tests/runtime/Variables.test.ts`
`t and t.field` on a nil `t` yields nil without erroring because the index branch never runs. Chains evaluate left-to-right with early exit; a multi-return right-hand side truncates to one value. The runtime's NativeFunctionCall has a fast-path so `and`/`or` return operands (not coerced booleans) across mixed types.

### `if ... then ... else` expression (Luau ternary)

*Audience:* advanced
Luau's expression-form conditional `if cond then a elseif c2 then b else c` works in statement, parenthesized, call-argument, operand, and return positions; only the taken arm evaluates.

```sparkdown
local a = if true then 1 else 2
host_record(7 + if true then 10 else 20)
```

*Output:* `a` is 1; the operand-position form evaluates to 17.
*Sources:* `packages/sparkdown/src/tests/luau-conformance/TernaryExpression.test.ts`
Conflict resolved: GRAMMAR.md/FUNCTIONS.md claim the ternary form inside `return (...)` is "not yet implemented", but `TernaryExpression.test.ts` contains a passing fixture with `return if c1 then 10 elseif c2 then 20 elseif c3 then 30 else 40` — the docs are stale; the feature works including in return position. Gotcha pinned by the test: don't name a helper function `chain` — `queue|chain|cycle|shuffle` are reserved alternator keywords and hijack the parse.

### Comparison operators (`~=` for not-equal)

*Audience:* advanced
Comparisons are `==`, `~=` (Luau not-equal — NOT `!=`), `<`, `<=`, `>`, `>=`; results print as `true`/`false`.

```sparkdown
{ 3 ~= 4 }
{ 3 <= 3 }
{ 4 >= 5 }
```

*Output:* `true` / `true` / `false`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/evaluation/comparison-ops.sd`, `packages/sparkdown/src/tests/runtime/fixtures/booleans/three-greater-than-one.sd`, `packages/sparkdown/src/tests/runtime/Evaluation.test.ts`, `packages/sparkdown/src/tests/runtime/Booleans.test.ts`
DIVERGENCE from ink/JS: not-equal is `~=` per Luau.

### Arithmetic operators and float division

*Audience:* advanced
`+ - * / %` with parentheses for grouping. `/` is ALWAYS float division regardless of operand int-ness (Luau); floor division is the separate `//`. `%` is floor-mod (Lua semantics: `-5 % 3` is 1, differing from JS remainder for negatives). Numeric strings coerce in arithmetic, including hex (`2 * "0xa"` is 20). NaN, Infinity, and -0 are first-class with Lua-style tostring (`"nan"`, `"inf"`, `"-inf"`, `"-0"`).

```sparkdown
{ 2 * 3 + 5 * 6 }
{ 8 % 3 }
{ 7 / 3 }
{ 2 * (5-1) }
```

*Output:* `36` / `2` / `2.3333333333333335` / `8` — and all of `7/3`, `7/3.0`, `7.0/3`, `7.0/3.0` print the same float.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/evaluation/arithmetic.sd`, `packages/sparkdown/src/tests/runtime/fixtures/extra/arithmetic-2.sd`, `packages/sparkdown/src/tests/runtime/Evaluation.test.ts`, `packages/sparkdown/src/tests/luau-conformance/LuaArithmetic.test.ts`
DIVERGENCE from ink: ink's `7 / 3` truncates to 2. DIVERGENCE deferred: ink's `mod` keyword alias for `%` is not in sparkdown's grammar. Int-vs-float typing survives JSON round-trips via the WriteFloat marker convention (`"3.0f"`).

### Floor division `//`

*Audience:* advanced
`//` is Luau floor division: rounds toward negative infinity and works on floats.

```sparkdown
{ 7 // 2 }
{ -7 // 2 }
{ 7.5 // 2 }
```

*Output:* `3` / `-4` / `3`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/evaluation/floor-division.sd`, `packages/sparkdown/src/tests/runtime/Evaluation.test.ts`, `packages/sparkdown/src/tests/luau-conformance/LuaArithmetic.test.ts`
DIVERGENCE from ink: ink historically treated `//` as a line comment (inherited from JS); sparkdown disabled that and made `//` a real operator. Code-context comments use Luau `--`; display lines have a separate `//` comment rule (covered in another section).

### Exponentiation `^`

*Audience:* advanced
`^` is exponentiation — right-associative, highest arithmetic precedence, fractional exponents allowed (`4 ^ 0.5` is the square root).

```sparkdown
{ 2 ^ 3 }
{ 4 ^ 0.5 }
{ 2 ^ (3 ^ 2) }
```

*Output:* `8` / `2` / `512`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/evaluation/exponentiation.sd`, `packages/sparkdown/src/tests/runtime/fixtures/evaluation/associativity.sd`, `packages/sparkdown/src/tests/runtime/Evaluation.test.ts`
DIVERGENCE from ink: ink used `^` for list intersection; sparkdown reclaimed it for power (list intersection is now `t:intersection(other)`). Conflict resolved: a comment in `Evaluation.test.ts` claims the `{...}` interpolation path parses `2 ^ 3 ^ 2` left-associatively (=64) and advises parenthesizing, but the `associativity.sd` fixture asserts `{ 2 ^ 3 ^ 2 }` → `512` in exactly that context (assertion at Evaluation.test.ts line 128) — the comment is stale; the asserted behavior is right-associative everywhere tested.

### String concatenation `..`

*Audience:* advanced
`..` is genuine string concatenation, right-associative: numbers stringify (`1 .. 2` is `"12"`); nil/boolean/table operands raise a pcall-trappable "attempt to concatenate" error. Compound form `..=` appends in place.

```sparkdown
assert((1 .. 2) == "12")
assert(("x" .. 5) == "x5")
```

*Output:* Both pass.
*Sources:* `packages/sparkdown/src/tests/luau-conformance/LuaArithmetic.test.ts`, `packages/sparkdown/src/tests/runtime/Evaluation.test.ts`, `packages/sparkdown/src/tests/runtime/fixtures/evaluation/compound-assignment.sd`
Historical divergence removed: `..` once aliased `+` (so `1 .. 2` was 3); it is now a first-class concat op. Legacy quirk kept: string+string `+` still concatenates (ink behavior), per the `LuaArithmetic.test.ts` header.

### Operator precedence and associativity

*Audience:* advanced
Luau's precedence table, lowest to highest: `or`; `and`; comparisons; `..` (right-assoc); `+ -`; `* / // %`; unary `not # -`; `^` (right-assoc). Everything else is left-associative; parentheses group as expected.

```sparkdown
{ 2 ^ 3 ^ 2 }
{ 10 - 3 - 2 }
{ -2 ^ 2 }
```

*Output:* `512` / `5` / `-4`. The full fixture pins ten cases: 512, 5, 5, 7, 14, 9, 9, -4, 36, 0.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/evaluation/associativity.sd`, `packages/sparkdown/src/tests/runtime/Evaluation.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/expression/binop/mixed-precedence.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/expression/binop/concat-right-assoc.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/expression/binop/not-and-or.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/luau-binop/logical-precedence.sd`
`-2 ^ 2` is -4 because `^` binds tighter than unary minus — a famous Lua quirk the tests pin explicitly. Compiler snapshots confirm the same tree shapes: `a + b * c` → `a + (b*c)`, `a .. b .. c` → `a .. (b .. c)`, `not a and b or c` → `((not a) and b) or c`.

### Unary operators `-`, `not`, `#`

*Audience:* advanced
Luau unary operators: numeric negation `-x`, logical `not x`, and length `#t` — applicable to variables, table literals, and strings (`#'g'` is 1). `#` fires the `__len` metamethod.

```sparkdown
assert(#_G == 0)
assert(#{1,2} == 2)
assert(#'g' == 1)
```

*Output:* All pass.
*Sources:* `packages/sparkdown/src/tests/compiler/__snapshots__/expression/unary/length-of-variable.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/expression/unary/minus-var.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/expression/unary/not-bool.sd`, `packages/sparkdown/src/tests/luau-conformance/LuaArithmetic.test.ts`
`not true` constant-folds to `false` at compile time (visible in the `not-bool` snapshot). **UNRESOLVED:** `#` on record-style (keyed) tables — the conformance suite asserts array-portion-only semantics (`#{a=1}` is 0, `#_G` is 0, per `LuaArithmetic.test.ts`), but DIVERGENCES.md claims `#` is extended to record tables (entry count, `#{a=1, b=2}` = 2) and the `spark-tale-sample` formatter fixture uses the `#TIME_OF_DAY` enum-count idiom, which only makes sense under entry-count semantics. Runtime assertions outrank docs, so array-portion is authoritative for Luau code contexts; no fixture asserts the flow/interpolation-context value, so a context split cannot be ruled out.

### Boolean–number coercion in arithmetic and equality

*Audience:* advanced
Booleans coerce to numbers in arithmetic (true=1, false=0), and `true == 1` is true.

```sparkdown
{true + 1}
{2 + true}
{true == 1}
```

*Output:* `2` / `3` / `true`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/booleans/true-plus-one.sd`, `packages/sparkdown/src/tests/runtime/fixtures/booleans/two-plus-true.sd`, `packages/sparkdown/src/tests/runtime/fixtures/booleans/false-plus-false.sd`, `packages/sparkdown/src/tests/runtime/fixtures/booleans/true-equals-one.sd`, `packages/sparkdown/src/tests/runtime/Booleans.test.ts`
DIVERGENCE from real Luau, where `true + 1` errors — this coercion is inherited from ink's runtime (the fixtures are direct inkjs ports with unchanged expectations).

### Number, boolean, and nil literals

*Audience:* advanced
Integers (`42`), floats (`3.14`, `3.0`), negatives (`-1`), scientific notation (`1e3`), booleans (`true`/`false`), and `nil` are Luau-style literals; int vs float is tracked in the lowered AST.

```sparkdown
1e3
```

*Output:* Lowers to Number(1000, float) — scientific notation normalizes at compile time; `3.0` stays float-typed; booleans lower to a numeric bool representation (ink internals); `nil` lowers to a NullExpression.
*Sources:* `packages/sparkdown/src/tests/compiler/__snapshots__/expression/literal/number-int.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/expression/literal/number-scientific.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/expression/literal/boolean-true.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/expression/literal/nil.sd`, `packages/sparkdown/src/tests/luau-conformance/UndefinedAsNil.test.ts`
Conflict resolved: DIVERGENCES.md says nil "currently lowers to NumberExpression(0, int)", but the compiler snapshot lowers `nil` to a NullExpression and conformance tests prove nil is runtime-distinct from 0 (`undefined_var == nil` passes while `assert(0)` also passes) — the doc is stale.

### String literals: double, single, and backtick-interpolated

*Audience:* advanced
Three code-string forms: `"hello"`, `'hi'`, and backtick template strings with `{expr}` interpolation (`` `hello {name}, score = {count + 1}` ``), matching Luau's interpolated-string syntax. Interpolations may contain property access and arithmetic. Luau long strings `[[ ... ]]` / `[==[ ... ]==]` are also in the grammar.

```sparkdown
`hello {name}, score = {count + 1}`
```

*Output:* Lowers to alternating literal/expression parts: String["hello ", Var(name), ", score = ", (count + 1)].
*Sources:* `packages/sparkdown/src/tests/compiler/__snapshots__/expression/literal/string-double.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/expression/literal/string-single.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/expression/literal/string-interpolated.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/luau-string/interpolated-with-access.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/luau/quote-normalization.sd`, `packages/sparkdown/src/tests/luau-conformance/StringPatterns.test.ts`
The formatter's canonical style is double quotes: single-quoted strings convert unless the content contains a double quote; quotes inside dialogue text are literal and untouched. **UNRESOLVED:** whether `"..."` interpolates `{expr}`. Project memory claims double-quoted strings interpolate and single-quoted are literal, but `StringPatterns.test.ts` runs `string.match("{x {y} z}", "%b{}")` and records the literal `{x {y} z}` — braces pass through UN-interpolated in a double-quoted string in a code context. No fixture covers double-quote interpolation in display contexts, so the claim could not be settled; only backtick interpolation is fixture-proven.

### Table literals: array, keyed, nested, computed keys

*Audience:* advanced
Luau table constructors: `{}`, `{ 1, 2, 3 }`, `{a = 1, b = 2}`, nested `{outer = {inner = 42}}`, bracket string keys (`{["name"] = "Anon"}`), and computed keys evaluated at runtime (`{[1+2] = 4}`, `{[k .. "n"] = 9}`); multi-line forms take trailing commas.

```sparkdown
{outer = {inner = 42}}
```

*Output:* Lowers to Object{outer: Object{inner: 42}}.
*Sources:* `packages/sparkdown/src/tests/compiler/__snapshots__/expression/literal/table-empty.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/expression/literal/table-keyed.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/expression/literal/table-nested.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/luau-literal/table-with-string-keys.sd`, `packages/sparkdown/src/tests/luau-conformance/TableKeysAndTargets.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/variable/store-table.sd`
Table literals work as `store`/`const` initializers and in `&` statements (`& opts = {color = "red", count = 3}`). DEFERRED.md calls bracket-key literals and pure array-style literals "still rough" (bare-expression keys auto-increment as strings), but the conformance suite exercises computed keys successfully — trust the tests for the covered cases.

### Table semantics: references, nil deletion, key identity, iteration order

*Audience:* advanced
Tables are reference values — every variable holding a table shares one underlying map, so mutations propagate. Nil entries don't exist: constructor gaps drop, `t[k] = nil` deletes the key, and `ipairs` stops at the first nil. Tables and functions work as keys with pointer identity.

```sparkdown
local t = {5, 6, 7, nil, 8}
assert(t[4] == nil)
local a = ''
for k in ipairs(t) do a = a .. k end
assert(a == "123", "got " .. a)
```

*Output:* Passes — ipairs stops before the gap.
*Sources:* `packages/sparkdown/src/tests/luau-conformance/LuaTablesIterators.test.ts`, `packages/sparkdown/src/tests/luau-conformance/TableKeysAndTargets.test.ts`, `packages/sparkdown/src/tests/luau-conformance/upstreamPatches.ts`, `packages/sparkdown/docs/runtime/RUNTIME.md`
DIVERGENCES from ink: there is no `LIST` keyword — ink lists map onto plain tables; list arithmetic (`(a, b) + (c)`) is not implemented. DIVERGENCES from Luau (per `upstreamPatches.ts`): sparkdown tables are insertion-ordered JS Maps, so `pairs` order is deterministic insertion order (Lua leaves it unspecified); numeric keys stringify, so `t[1000]` and `t["1000"]` alias the same slot.

### `:find` membership test (replaces ink LIST operators)

*Audience:* advanced
`list:find(value)` returns the key/index of the matching entry or nil on a miss, so `not list:find(x)` tests absence — replacing ink's `?` / `!?` / `hasnt` list-membership operators.

```sparkdown
store list = {"b", "d"}
{not list:find("c")}
```

*Output:* `true`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/booleans/list-hasnt.sd`, `packages/sparkdown/src/tests/runtime/Booleans.test.ts`, `packages/sparkdown/src/tests/luau-conformance/LuaTruthiness.test.ts`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`
A miss returns nil (not 0), so the idiom composes with Lua truthiness (`LuaTruthiness.test.ts` pins this). Subset containment has no dedicated method — compose `:intersection` + `:len` per DIVERGENCES.md. `list` is not a reserved word.

### Access chains: property, indexer, call, and method call

*Audience:* advanced
Full Luau access grammar: dotted chains (`companion.O.trust`), bracket indexers (`opts["color"]`, `opts[key1][key2]`, `obj.subtable[key]`), calls with any arity (`reset()`, `f(a, b, c)`), call-then-access (`f(x).y.z`, `f(x)[key]`), namespace calls (`math.abs(-1)`), colon method calls (`obj:greet("hi")`), chained method calls (`a:b():c():d()`), and table-call sugar (`baz{k = v}`).

```sparkdown
& x = a:b():c():d()
```

*Output:* Dotted chains lower to a single path Var; bracket access lowers to Index nodes; `f(x).y` → Index(Call(f, [x]), "y"); method calls lower to CallValueExpression.
*Sources:* `packages/sparkdown/src/tests/compiler/__snapshots__/expression/access/property-chain.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/expression/access/indexer-by-variable.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/expression/access/call-then-property.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/expression/access/method-call.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/luau-access/chained-3-method-calls.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/luau-access/function-call-with-method.sd`
GRAMMAR GAP (project memory, corroborated by the absence of any fixture and a formatter fixture that only partially normalizes `obj.method(a). b . c (d)`): a property access trailing a colon method call — `a:m(x).y` — is not parsed. Call-then-property fixtures exist only for plain calls.

### Property assignment targets (dot and bracket paths)

*Audience:* advanced
Assignment targets can be arbitrary access paths: `& opts.color = "red"`, nested `& opts.theme.bg = "dark"`, indexed `t[k] = v`, and mixed chains `& this.is["a"].access.path = "ok"`; compound operators work on paths too (`& opts.count += 1`, `state.items["sword"].count += 1`).

```sparkdown
& opts.theme.bg = "dark"
```

*Output:* Compiles to StorePropertyAssignment: base expression + final key + value, with intermediate segments as nested IndexExpressions; dot access and `["string"]` indexing are equivalent.
*Sources:* `packages/sparkdown/src/tests/compiler/__snapshots__/compile/variable/property-target-explicit.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/variable/property-target-nested.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/variable/property-target-deeply-mixed.sd`, `packages/sparkdown/src/tests/luau-conformance/CompoundAssignment.test.ts`, `packages/sparkdown/docs/runtime/RUNTIME.md`
DIVERGENCE from ink: ink variables are flat; sparkdown supports Luau-style table property mutation directly in flow statements. Table mutations propagate through references (shared underlying map).

### Compound assignment operators

*Audience:* advanced
Every binary arithmetic and concat operator has a compound form: `+=`, `-=`, `*=`, `/=`, `//=`, `%=`, `^=`, `..=`; each desugars to `x = x <op> y`. Works on plain variables, property targets (`obj.count += 5`), indexed targets (`arr[2] += 5`), and nested paths (`obj.inner.count += 5`).

```sparkdown
store n = 10
& n += 5
{n}
store s = "Hello"
& s ..= ", World!"
{s}
```

*Output:* `15` then `Hello, World!` (the full fixture verifies all eight operators: 15, 12, 24, 6, 2, 8, 3, "Hello, World!").
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/evaluation/compound-assignment.sd`, `packages/sparkdown/src/tests/runtime/Evaluation.test.ts`, `packages/sparkdown/src/tests/luau-conformance/CompoundAssignment.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/variable/explicit-compound-add.sd`
Matches Luau's compound-assignment set (plain Lua has none). Formatter quirk: the committed snapshot normalizes `n ..= "tail"` with no space before `..=`.

### Increment / decrement via `+= 1` and `-= 1`

*Audience:* advanced
There is no `++`/`--`; use `x += 1` and `x -= 1`.

```sparkdown
store x = 5
& x += 1
{x}
& x -= 1
{x}
```

*Output:* `6` then `5`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/evaluation/increment.sd`, `packages/sparkdown/src/tests/runtime/Evaluation.test.ts`
DIVERGENCE from ink: ink's `~ x++` / `~ x--` port to compound assignment (equivalent bytecode per `Evaluation.test.ts`).

### Multiple assignment and Lua conflict semantics

*Audience:* advanced
Multi-target assignment `a, b = 1, 2` works with mixed variable/property/indexer targets (`a.x, b, a[1] = 1, 2, f()`), swap (`a, b = b, a`), padding (missing RHS → nil), and truncation. All RHS values and every target's base+subscript evaluate BEFORE any store (Lua's conflict rule); the last RHS spreads its multi-return.

```sparkdown
a = {}
function f() return 10, 20, 30 end
a.x, b, a[1] = f()
assert(a.x == 10 and b == 20 and a[1] == 30)
```

*Output:* Passes — the three return values distribute across the mixed targets.
*Sources:* `packages/sparkdown/src/tests/luau-conformance/MultiTargetPropertyAssignment.test.ts`, `packages/sparkdown/src/tests/luau-conformance/MultiReturn.test.ts`, `packages/sparkdown/src/tests/luau-conformance/TableKeysAndTargets.test.ts`
Conflict-semantics cases from upstream basic.luau pass: `a, b[a] = 43, -1` writes into `b[1]` using the OLD `a`. Call-rooted targets (`ident(a)[1] = 4`) also work.

### Multiple statements per line and `;` separators

*Audience:* advanced
Lua's free-form layout works in code contexts: several statements on one line (`function f() local x = 5 return x end`), explicit `;` separators, one-line loop bodies with trailing statements, and consecutive bare reassignments on one line (`a = 1 a = 2`).

```sparkdown
assert((function() local x = 5 return x end)() == 5)
```

*Output:* Passes — the canonical one-line IIFE idiom.
*Sources:* `packages/sparkdown/src/tests/luau-conformance/OneLineMultiStatement.test.ts`, `packages/sparkdown/src/tests/luau-conformance/IifeStatement.test.ts`, `packages/sparkdown/src/tests/luau-conformance/LuaLoops.test.ts`

### Block scoping and shadowing

*Audience:* advanced
A `local` declared inside any block (`if` arm, `else` arm, `do` block) shadows an outer binding only until the block's `end`; afterwards the outer binding is visible again. Locals and parameters may freely shadow globals, top-level function/knot names, stdlib names (`local unpack = table.unpack`, `function f(print)`), and even the function's own parameters.

```sparkdown
local x = 1
if true then
  local x = 2
  {x}
end
{x}
```

*Output:* `2` then `1`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/scoping/local-shadows-in-if-block.sd`, `packages/sparkdown/src/tests/runtime/fixtures/scoping/else-branch-isolated.sd`, `packages/sparkdown/src/tests/runtime/Scoping.test.ts`, `packages/sparkdown/src/tests/luau-conformance/LocalShadowsGlobal.test.ts`, `packages/sparkdown/src/tests/luau-conformance/StdlibShadowing.test.ts`, `packages/sparkdown/src/tests/luau-conformance/ParameterShadowsKnot.test.ts`
DIVERGENCE from ink: under ink's function-scoped `temp` the inner declaration would reassign the outer (and ink's CheckForNamingCollisions errored when a parameter shadowed a knot name); Luau semantics allow all of it. `local function g` self-recursion works even when a global `g` exists.

### Undefined variables read as nil (silently)

*Audience:* advanced
Referencing a never-declared name evaluates to `nil` — no runtime error, no runtime warning; interpolating the nil prints nothing and execution continues. Indexing a nil root (`unknown.path`) raises a trappable "attempt to index a nil value"; a missing member of an EXISTING table is nil.

```sparkdown
{x}
& local x = 5
hello
```

*Output:* An empty line for the nil read, then `hello`; `story.hasWarning === false`.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/variables/temp-not-found.sd`, `packages/sparkdown/src/tests/runtime/Variables.test.ts`, `packages/sparkdown/src/tests/luau-conformance/UndefinedAsNil.test.ts`, `packages/sparkdown/src/tests/luau-conformance/GCStubAndUnresolvedCall.test.ts`
DIVERGENCE from ink: ink resolved unknown variables to IntValue(0), emitted a runtime warning, and made unresolved names a compile error; sparkdown demotes them to compile-time editor warnings so Luau's runtime semantics apply. Arithmetic on the nil errors like Lua; `tostring(undefined_var)` is `"nil"`.

### `_G` globals table

*Audience:* advanced
`_G` is Luau's global-environment table (a runtime proxy). Dot and bracket reads/writes (`_G.foo = 1`, `_G['foo']`), dynamic keys (`_G[key]`), and interop with plain global access all work; `_G` always reads the true global even when a local shadows the name; absent globals read as nil; `type(_G) == "table"`.

```sparkdown
g = 7
local function f()
  local g = 99
  return _G.g
end
assert(f() == 7, "got " .. tostring(f()))
```

*Output:* Passes — `_G.g` bypasses the shadowing local and reads 7.
*Sources:* `packages/sparkdown/src/tests/luau-conformance/GlobalsTable.test.ts`

### Loops and `do` blocks in flow and functions

*Audience:* advanced
`while cond do ... end`, `for k, v in ... do ... end` (including `for i=1,n do` numeric form seen in conformance fixtures), and bare `do ... end` blocks work inside functions AND directly in scenes, where their bodies can be dialogue/action/directive display lines.

```sparkdown
while x > 0 do
x -= 1
end
```

*Output:* The loop counts x down to 0 (fixture verbatim from the formatter suite; the formatter indents the body one level). Display lines as loop bodies are attested in the deep-nesting and spark-tale-sample fixtures; loop-value semantics are pinned by the conformance suite's LuaLoops tests.
*Sources:* `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/luau/while-loop.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/luau/do-block.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/luau/function-with-for.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/stress/deep-nesting.sd`, `packages/sparkdown/src/tests/luau-conformance/LuaLoops.test.ts`, `packages/sparkdown/src/tests/luau-conformance/IterProtocol.test.ts`
DIVERGENCE from ink, which has no loop statements (loops are done by diverting back to a label — see the divert-in-conditional loop idiom). A parenthesized loop-variable form `for (i) in pairs(t) do` also appears in formatter fixtures. `break` is available per the function-definition fixtures. Statement keywords get one space before `(` when formatted (`while (true) do`); bare `do` blocks are never joined onto the previous line.

### Loop idiom: divert back to a label with a counter

*Audience:* writer
The ink-style loop pattern still works: increment a counter with an `&` statement, then `if count < N then -> label end` re-enters the label.

```sparkdown
label start
  {queue|"A"|"B"|"C"}
  & i = i + 1
  if i < 5 then
    -> start
  end
```

*Output:* The body repeats until the condition fails; the `&` line emits nothing.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/sequences/inline-queue.sd`, `packages/sparkdown/src/tests/runtime/fixtures/knots/knot-stitch-gather-counts.sd`, `packages/sparkdown/src/tests/runtime/fixtures/choices/once-only-choices-with-own-content.sd`
Possibly belongs in the Flow/Diverts section — kept here because it is the primary writer-facing looping construct.

### Diverts inside conditionals

*Audience:* advanced
`if cond then -> target end` diverts only when the condition holds — sparkdown's rewrite of ink's inline conditional divert `{ cond: -> x }`.

```sparkdown
scene top
  if count.visits(-> main) > 0 then
    & -> done
  end
  fin
end
```

*Output:* Empty on first run — `main` has zero visits, so nothing diverts and the scene reaches `fin`.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/diverts/divert-in-conditional.sd`, `packages/sparkdown/src/tests/runtime/fixtures/knots/knot-stitch-gather-counts.sd`, `packages/sparkdown/src/tests/runtime/Diverts.test.ts`
Possibly belongs in the Flow/Diverts section. DIVERGENCE from ink: ink reads a bare knot name as its visit count (`{ main: -> done }`); sparkdown uses the explicit `count.visits(-> path)` builtin. The fixture prefixes the divert with `&` inside the if-block; whether `&` is required there is unasserted. A scene may legally be named `done` and be diverted to.

### Diverts inside alternator arms

*Audience:* advanced
An arm of a `{chain | ... | ... end}` alternator can be a divert: on the visit where that arm is selected, flow transfers instead of printing text; dotted paths work (`-> knot.stitch.choice`).

```sparkdown
scene main
  start
  {chain | -> next | second visit end}
  -> DONE
end
```

*Output:* `start` then `arrived` — the first visit takes the divert arm into scene `next`; a later visit would print `second visit`.
*Sources:* `packages/sparkdown/src/tests/runtime/smoke.test.ts`, `packages/sparkdown/src/tests/runtime/fixtures/diverts/divert-to-weave-points.sd`, `packages/sparkdown/src/tests/runtime/Diverts.test.ts`
Possibly belongs in the Alternators/Sequences section. Lowerer detail: ArmDivert routes through the main lowerer dispatch so the arm becomes a real Divert, not literal text (a fixed bug). The smoke fixture's `-> DONE` arrow form is confirmed as an alias for `done`.

### Visit counts: `count.visits(-> path)` and `{name}` interpolation

*Audience:* advanced
`count.visits(-> path)` returns how many times a scene has been visited; interpolating a scene/branch/label's own name — `{knot_count_test}`, `{stitch}`, `{loop}` — yields its visit count, including self-references from inside its own body.

```sparkdown
scene knot_count_test
  & knotCount = knotCount + 1
  {knotCount} {knot_count_test}
  if knotCount < 3 then
    -> knot_count_test
  end
  ->->
end
```

*Output:* Lines pair the manual counter with the visit count (`1 1`, `2 2`, `3 3` when re-entered by divert); re-entering only a label does not bump the scene count (`2 1`, `3 1`).
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/knots/knot-stitch-gather-counts.sd`, `packages/sparkdown/src/tests/runtime/fixtures/diverts/divert-in-conditional.sd`, `packages/sparkdown/src/tests/runtime/Knots.test.ts`
Possibly belongs in the Flow/Knots section. DIVERGENCE from ink: ink's bare-name read count (`{ main: ... }`, `READ_COUNT`) becomes `count.visits(-> name)`. Integrator gotcha from `Knots.test.ts`: the harness passes `countAllVisits: true` because the compiler otherwise only tracks containers explicitly referenced by count.visits/interpolation — self-references inside a knot's own body defeat the compile-time scan.

### Divert targets as first-class values

*Audience:* advanced
`-> name` used as an expression is a first-class divert-target value: storable (`store to_one = -> one`), passable as an argument (`-> cut_to(-> the_esc)`), comparable with `==` (true iff both point at the same scene), and usable as the target of `->-> param`.

```sparkdown
store to_one = -> one
store to_two = -> two
  if to_one == to_two then
    same knot
  else
    different knot
  end
```

*Output:* `different knot` — literals compare equal to stored copies of the same target.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/diverts/compare-divert-targets.sd`, `packages/sparkdown/src/tests/runtime/fixtures/diverts/tunnel-onwards-variable-target.sd`, `packages/sparkdown/src/tests/runtime/Diverts.test.ts`
Possibly belongs in the Flow/Diverts section. DIVERGENCE from ink: a parameter receiving a divert target needs no `->` type marker; the runtime infers divert-target-ness from the value.

### Divert-target parameter annotation (`param: ->`)

*Audience:* advanced
A scene/function parameter may be annotated as a divert target with `->` as the type: `scene cut_to(escape: ->)`. The annotation is informational only.

```sparkdown
scene cut_to(escape: ->)
  ->-> escape
end
```

*Output:* Behaves identically with or without the annotation (`This is outer` / `This is the_esc`).
*Sources:* `packages/sparkdown/src/tests/runtime/smoke.test.ts`
Sparkdown's analogue of ink's typed divert parameter `f(-> target)`. DIVERGENCE: the runtime accepts any value as a divert target when used as one — nothing is enforced.

### `type` / `typeof` and type annotations

*Audience:* advanced
`type(v)` / `typeof(v)` return Lua-style names (number, string, boolean, table, function, userdata) and require an argument (pcall-trappable if missing). `type` is a soft keyword: `type Foo = number` declares a Luau type alias, and annotations like `local x: Foo = 5` parse. Function parameters may carry annotations including table types: `function format(enum: {[string]: number}, value: number)`.

```sparkdown
local function f() end
assert(type(f) == 'function', "got " .. type(f))
```

*Output:* Passes.
*Sources:* `packages/sparkdown/src/tests/luau-conformance/TypeOf.test.ts`, `packages/sparkdown/src/tests/luau-conformance/Stdlib.test.ts`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/luau/type-annotation.sd`
The formatter normalizes annotations to `value: number` (space after the colon only).

### `::` typecast is parsed but ignored

*Audience:* advanced
Luau's typecast operator `value :: number` is accepted by the grammar but discarded during lowering — no runtime or checking effect.

```sparkdown
value :: number
```

*Output:* Lowers to Var(value) — the `:: number` annotation vanishes.
*Sources:* `packages/sparkdown/src/tests/compiler/__snapshots__/expression/unary/typecast-ignored.sd`
DIVERGENCE from Luau, where `::` participates in type checking.

### Top-level structure: Luau code lives inside `function ... end` bodies

*Audience:* advanced
At the top level of a .sd file, text is narrative; `function name() ... end` declares a function (compiled as a knot) whose body is a Luau superset. The first top-level `function` declaration ends the implicit main flow, so calls to it must appear BEFORE the declaration; `done` ends the flow.

```sparkdown
& run()
: Hello
done

function run()
local x = 5
end
```

*Output:* The main flow calls run(), prints `Hello`, then ends.
*Sources:* `packages/sparkdown/src/tests/luau-conformance/conformanceTestHarness.ts`, `packages/sparkdown/src/tests/luau-conformance/Run.test.ts`
Possibly belongs in the Functions/Structure section. The conformance harness wraps every Luau fixture in `function run() ... end` and invokes it with `& run()` before the declaration precisely because anything after the first top-level knot is unreachable from the implicit main flow.

### Function definitions with optional type annotations

*Audience:* advanced
`function name(params) ... end` defines a function; parameters may carry Luau type annotations; `local` variables, `return`, and `break` behave as in Luau.

```sparkdown
function format(value:number)
  return value
end
```

*Output:* Formatter normalizes the annotation to `value: number`; `function empty()` + `end` compacts to `function empty() end`.
*Sources:* `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/luau/function.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/luau/type-annotation.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/luau/empty-block-compaction.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/stress/spark-tale-sample.sd`
Possibly belongs in the Functions section of the master doc — kept per the no-drop rule. Functions display text only via returned strings; `print` shows display output from functions, `log` goes to the console.

### `define` blocks: typed structs, classes, inheritance, `new`, `self`

*Audience:* advanced
`define Name with ... end` declares a typed struct; `define Child as Parent with ... end` inherits (`as` = inherits). Property members are `name = value` lines (comma- or newline-separated, trailing commas allowed); a per-property `store` modifier marks it persisted. Methods use shorthand without the `function` keyword (`fly() ... end`) with `self` available. Instantiate with `new Type()`; call methods with `obj:method()`.

```sparkdown
define Penguin as Bird with
  canFly = false
  fly()
    print("Penguins can't fly...")
  end
  swim()
    self.isSwimming = true
  end
end
```

*Output:* Runtime: `local bird = new Bird()` then `& bird:fly()` dispatches through the class chain; `rawget(instance, "storeProp")` is an own key while non-store props read through `__index`.
*Sources:* `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/luau-declaration/define-with-properties.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/luau-declaration/define-with-methods.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/luau-declaration/define-with-store-property.sd`, `packages/sparkdown/src/tests/runtime/DefineClasses.test.ts`, `packages/sparkdown/src/tests/runtime/StoreOnlySerialization.test.ts`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/luau/define-methods.sd`, `packages/sparkdown/docs/runtime/RUNTIME.md`
Possibly belongs in the Types/Defines section — kept per the no-drop rule. Not Luau syntax: Luau has no `class`/`new`; method shorthand is legal ONLY inside `define`. Two flavors per docs: DATA defines (properties only) stay a compile-time struct registry with flat dot-access globals; CLASS defines (anything with a method, transitively) build runtime class tables at story start via `setmetatable(Class, { __index = Parent })`, with the nearest `init` method as constructor. Doc-reported gaps (unverified by tests): a method-less ROOT class is not auto-detected as a class; `read`/`write` property modifiers are recorded but not enforced; nested (indented) struct sub-properties don't work; parents must be defined before subclasses in document order.
# (section 05)

## Functions, strings & the standard library

### Declaring functions (`function ... end`)
*Audience:* advanced
Declare a global function at top level with `function name(params) ... end`; return a value with plain `return expr` (no ink `~` prefix). Bodies are pure Luau logic — display text, choices, diverts, and threads inside a function body are compile-time errors.
```sparkdown
function double(n)
  return n * 2
end
```
*Output:* Nothing by itself; the function becomes callable from logic and from `{...}` interpolations (`double(3)` evaluates to 6). Compiles to an ink Knot with `isFunction: true`.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/bindings/game-ink-back-and-forth.sd`, `packages/sparkdown/src/tests/runtime/fixtures/functions/function-and-increment-together.sd`, `packages/sparkdown/src/tests/runtime/fixtures/evaluation/factorial-recursive.sd`, `packages/sparkdown/src/tests/runtime/fixtures/logic/print-num.sd`, `packages/sparkdown/src/tests/runtime/Functions.test.ts`, `packages/sparkdown/src/tests/runtime/Evaluation.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/function/no-args-empty.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/function/with-return.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/function/with-empty-return.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/function/with-locals.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/function/with-luau-if.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/function/with-numeric-for.sd`, `packages/sparkdown/docs/runtime/FUNCTIONS.md`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`
Divergence from ink: ink "knot functions" (`=== function f ===`) can emit narrative text; sparkdown functions are expression-only, and the ink declaration syntax is not supported. Restructure narrative-emitting ink functions to build strings with `..` and return them, or use `print()` (below), or a parameterized `scene`/tunnel. Empty bodies and bare `return` are legal. Bodies support `local` declarations, `if/elseif/else...end`, numeric `for i = 1, n do ... end`, and `for k, v in pairs(t) do ... end` loops. Forward references between top-level functions are fine (two-pass compile). Functions can return a divert target (`return -> somewhere`). Note: DIVERGENCES.md's claims that sparkdown has "no anonymous functions/closures" and that `local function` is "parsed but ignored" are stale — both are disproven by runtime conformance tests (see "First-class functions", "Closures", and "Nested function declarations" below).

### Calling functions from text vs logic (`{fn(args)}` and `& fn()`)
*Audience:* advanced
Call a function inside display text with an interpolation `{name(args)}` (its return value prints); call it as a standalone statement with the discard prefix `& name(args)` (return value thrown away). The `&` prefix is required at top level and inside scene bodies; inside function bodies plain `foo()` works.
```sparkdown
{factorial(5)}

function factorial(n)
  if n == 1 then
    return 1
  else
    return n * factorial(n-1)
  end
end
```
*Output:* `120`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/evaluation/factorial-recursive.sd`, `packages/sparkdown/src/tests/runtime/Logic.test.ts`, `packages/sparkdown/src/tests/runtime/fixtures/evaluation/factorial-by-reference.sd`, `packages/sparkdown/src/tests/runtime/fixtures/logic/nested-pass-by-reference.sd`, `packages/sparkdown/src/tests/runtime/fixtures/evaluation/function-variable-state.sd`, `packages/sparkdown/docs/runtime/FUNCTIONS.md`
The `&` sigil exists only to distinguish statements from display text in narrative context. Recursive `& fn(args)` calls nested inside `if` bodies previously hung due to a grammar bug (LuauControlBlock missing LuauExplicitStatement) — now fixed and pinned by the factorial-by-reference and nested-pass-by-reference fixtures.

### `print()` = display output from functions; `log()` = console only
*Audience:* advanced
Inside a function body, `print("text")` emits player-visible display text — the escape hatch, since function bodies cannot contain narrative lines. `log("text")` writes to the developer console and never reaches story output.
```sparkdown
function run()
print("Footprints... glowing?")
end
```
*Output:* "Footprints... glowing?" appears in story output. `log("debug only")` does NOT appear in output.
*Sources:* `packages/sparkdown/src/tests/runtime/PortInventory.test.ts`
Resolved conflict: STDLIB.md claims "`print` is currently a NO-OP" — that is stale. The runtime test `PortInventory.test.ts` ("print() emits display text from a function body", "log() is developer console output, NOT story display") asserts the behavior above, and runtime assertions outrank doc prose. One subtlety survives: `print` returns nothing, so reading its result through a call yields nil (`luau-conformance/LocalCalleeDispatch.test.ts`).

### Visit counts, turn counts & choice counts (`count.*`)
*Audience:* writer
Sparkdown namespaces ink's flow builtins under `count`: `count.visits(-> target)` (ink READ_COUNT), `count.visited(-> target)` (boolean shorthand for visits > 0), `count.turns()` (ink TURNS), `count.turns(-> target)` (ink TURNS_SINCE), and `count.choices()` (ink CHOICE_COUNT).
```sparkdown
{count.visited(-> aside)}
<- aside
{count.visited(-> aside)}
if count.visited(-> aside) then
  Seen it.
end
```
*Output:* `false` / `Inside aside.` / `true` / `Seen it.` (per the visited-shorthand fixture's asserted transcript).
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/builtins/visited-shorthand.sd`, `packages/sparkdown/src/tests/runtime/fixtures/builtins/turns-since.sd`, `packages/sparkdown/src/tests/runtime/fixtures/builtins/turns-since-variable-target.sd`, `packages/sparkdown/src/tests/runtime/fixtures/builtins/turns-since-nested.sd`, `packages/sparkdown/src/tests/runtime/fixtures/builtins/read-count-across-thread.sd`, `packages/sparkdown/src/tests/runtime/fixtures/builtins/turns-choice-loop.sd`, `packages/sparkdown/src/tests/runtime/fixtures/choices/choice-count-with-threads.sd`, `packages/sparkdown/src/tests/runtime/Builtins.test.ts`, `packages/sparkdown/src/tests/runtime/Choices.test.ts`, `packages/sparkdown/docs/runtime/STDLIB.md`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`
Divergence from ink: renamed and namespaced (TURNS → `count.turns`, etc.); `count.turns` is arity-overloaded like `math.log`. `count.visited` exists because a 0 read count is no longer falsy under Lua truthiness. Targets can be functions as well as scenes/labels, and variable divert targets work (`turns-since-variable-target.sd`). **UNRESOLVED:** STDLIB.md says `count` is a reserved identifier that cannot be declared as a variable, but a FUNCTIONS.md example uses `count` as a parameter name; no fixture in this group settles which is true.

### Functions vs scenes: call/divert restrictions
*Audience:* advanced
Scenes and functions are invoked differently and the compiler enforces it: a scene must be reached by divert (`-> aKnot`) and can never be called (`& aKnot()` errors); a function must be called (`& myFunc()` or `{myFunc()}`) and can never be diverted to (`-> myFunc` errors).
```sparkdown
& myFunc()
& aKnot()
-> myFunc
done

function myFunc() return end

scene aKnot
```
*Output:* Compile errors: "hasn't been marked as a function" (for `& aKnot()`) and "can only be called as a function" (for `-> myFunc`).
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/functions/function-call-restrictions.sd`, `packages/sparkdown/src/tests/runtime/Functions.test.ts`
Error wording is inherited verbatim from inkjs's divert validation. Sparkdown uses `scene` where ink uses `== knot ==`.

### Recursion and the function call stack
*Audience:* advanced
Function calls nest and recurse freely, including inside interpolations: `{six() + two()}` where `six()` itself calls other functions.
```sparkdown
{six() + two()}
done

function two()
  return 2
end

function six()
  return four() + two()
end
```
*Output:* `8`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/callstack/callstack-evaluation.sd`, `packages/sparkdown/src/tests/runtime/CallStack.test.ts`
Functions lower to ink knots with isFunction=true, so call-stack behavior matches upstream ink. Ordering gotcha (DEFERRED.md "function-end accumulation boundary"): a top-level invocation written after the last `end` gets attached inside the previous function's body — put top-level content before the function declarations. Forward references are fine.

### Bare statements inside function bodies (no `&` prefix)
*Audience:* advanced
Inside a `function` body, assignments are written bare — `total = 0`, `count += x`, `state.count = state.count + 1`, `state.items["sword"].count += 1` — without the `&` prefix that top-level statements require.
```sparkdown
function update(state)
  state.items["sword"].count += 1
end
```
*Output:* Bare assignments lower to reassign VariableAssignments; property targets (dot chains and bracket indexes, arbitrarily mixed) lower to StorePropertyAssignment with nested IndexExpressions; compound `+=` desugars to `x = x + ...`.
*Sources:* `packages/sparkdown/src/tests/compiler/__snapshots__/compile/function/bare-assignment.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/function/bare-compound-assignment.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/function/bare-property-assignment.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/function/bare-deeply-mixed-target.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/luau-function/bare-assignment-in-body.sd`
The `&` sigil exists only to distinguish statements from display text at the top level; function bodies are already code context.

### Parameter scoping and name-collision rules
*Audience:* advanced
Function parameters are locally scoped: a parameter may share its name with a `label` inside an unrelated scene (allowed). But a parameter that shadows a top-level function name or a global `store` variable is a compile error.
```sparkdown
store global_var = 5

function aTarget() return true end

function pass_divert(aTarget) return aTarget end

function variable_param_test(global_var) return global_var end
```
*Output:* Both collisions emit compile errors (e.g. "Duplicate identifier `X`. A function named `X` already exists"); the label-vs-parameter case compiles with zero diagnostics.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/functions/argument-name-collisions.sd`, `packages/sparkdown/src/tests/runtime/fixtures/functions/argument-shouldnt-conflict-with-gather.sd`, `packages/sparkdown/src/tests/runtime/Functions.test.ts`
Divergence from ink: ink's wording is "name has already been used for a function/var"; sparkdown emits its own "Duplicate identifier" diagnostics. Ink's typed divert-target parameters (`function f(-> b)`) have no sparkdown equivalent. Stdlib names are also reserved and cannot be redeclared as user identifiers.

### Typed parameters and return-type annotations
*Audience:* advanced
Parameters and returns may carry Luau type annotations: `function name(param: type, ...): returnType ... end`. Return types may be `typeof(x)`; parameter types may be table types with indexers (`{[string]: number}`). Annotations are compile-time only — args lower to plain names.
```sparkdown
function get_plural_category(n: number, lang: string): string
  if lang == "en" then
    return n == 1 and "one" or "other"
  end
  return "other"
end
```
*Output:* Compiles identically to the unannotated form; `n == 1 and "one" or "other"` is the standard Lua ternary idiom.
*Sources:* `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/luau-function/typed-params-and-return.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/luau-function/typeof-return-type.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/function/typed-params.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/luau-literal/type-context-table-with-indexer.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/luau-function/with-for-in-loop.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/luau-function/anonymous-expression.sd`

### Tables as reference types (pseudo-`ref` parameters)
*Audience:* advanced
Table values are passed by reference: wrap a value in a table (`store r = { value = 5 }`), pass it to a function, and mutations to `r.value` inside the callee are visible to the caller — including through nested and recursive calls.
```sparkdown
store globalVal = { value = 5 }
{globalVal.value}
& squaresquare(globalVal)
{globalVal.value}
```
*Output:* `5` then `625`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/logic/nested-pass-by-reference.sd`, `packages/sparkdown/src/tests/runtime/fixtures/evaluation/factorial-by-reference.sd`, `packages/sparkdown/src/tests/runtime/Logic.test.ts`, `packages/sparkdown/src/tests/runtime/Evaluation.test.ts`
Divergence from ink: sparkdown has no `ref` parameter modifier; Luau tables being reference types is the replacement idiom. Several inkjs Variables fixtures that need `ref` are explicitly deferred for this reason (Variables.test.ts header).

### String literal forms, escapes, long strings & interpolation
*Audience:* advanced
Double- and single-quoted strings; `\n`/`\t`/`\xNN`/`\0` escapes; long `[[...]]` strings (which drop the newline right after the opening bracket and normalize line endings). Backtick strings interpolate expressions in braces: `` `This {expr}` ``. Strings preserve literal newlines through values.
```sparkdown
local s = `This {undefined_var}`
assert(s == "This nil", "got " .. s)
```
*Output:* Passes — the interpolation stringifies nil (undefined variables resolve to nil, not 0).
*Sources:* `packages/sparkdown/src/tests/luau-conformance/UndefinedAsNil.test.ts`, `packages/sparkdown/src/tests/luau-conformance/LuaArgSemantics.test.ts`, `packages/sparkdown/src/tests/luau-conformance/upstreamPatches.ts`, `packages/sparkdown/src/tests/luau-conformance/StdlibBatch1.test.ts`
Byte-string convention: literals lex as UTF-16 text, chars <= 0xFF are bytes; the lexer has NO `\u{...}` or `\z` escapes (the vendored upstream utf8.luau conformance fixture is patched to `\xNN` bytes for this reason — `luau-conformance/Stdlib.test.ts` states "Sparkdown doesn't decode `\u{}` escapes in string literals"). **UNRESOLVED:** project memory/docs state that double-quoted `"..."` strings also interpolate `{expr}` while single-quoted `'...'` strings are fully literal; only the backtick form is pinned by a test in this group's sources, so the quoted-form interpolation rule is recorded here unverified.

### String concatenation with `..`
*Audience:* advanced
Luau `..` concatenates strings in expressions; also available as compound `..=`.
```sparkdown
store a = "Hello"
store b = "World"
store greeting = a .. ", " .. b .. "!"
{greeting}
```
*Output:* `Hello, World!`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/evaluation/concat.sd`, `packages/sparkdown/src/tests/runtime/fixtures/logic/print-num.sd`, `packages/sparkdown/src/tests/runtime/Evaluation.test.ts`
Divergence from ink, which concatenates strings with `+`; sparkdown aliases `..` onto that runtime native (which is also why the `__concat` metamethod collapses into `__add` — see Metatables). Heavily used to build return strings inside functions (print-num.sd spells 1234 as "one thousand two hundred and thirty-four" this way). Possibly belongs in the expressions/operators section.

### Strict typing & explicit string↔number conversion
*Audience:* advanced
Comparisons never coerce across types: `"5" == 5` is always false. Convert explicitly — `"" .. five` stringifies a number, and `tonumber(s)` parses a string to a number (returning nil on failure). The Luau `cond and a or b` idiom serves as inline ternary.
```sparkdown
store five = 5
{"5" == ("" .. five) and "same" or "different"}
{"blah" == ("" .. five) and "same" or "different"}
```
*Output:* `same` then `different`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/strings/type-coercion-tonumber.sd`, `packages/sparkdown/src/tests/runtime/Strings.test.ts`, `packages/sparkdown/src/tests/luau-conformance/LuaArithmetic.test.ts`
Divergence from ink: ink implicitly coerces `"5" == 5` to true; sparkdown is strictly typed. Resolved conflict: an older fixture comment claimed `tonumber()` "is not yet wired into sparkdown's stdlib" — stale; `luau-conformance/LuaArithmetic.test.ts` asserts `tonumber("0xa") == 10`, `tonumber("inf") == 1/0`, `tonumber("zzz") == nil` all pass.

### Method-call syntax (`receiver:method(args)`)
*Audience:* advanced
Luau colon syntax dispatches builtin methods on a value: `s:upper()`, `t:concat(",")`. The call desugars to the receiver as implicit first argument, and dispatch is receiver-type-aware (string methods vs table methods share names like `len`, `find`, `at`, `sub`, `reverse`).
```sparkdown
store s = "Hello, World!"
{s:upper()}
{s:len()}
```
*Output:* `HELLO, WORLD!` then `13`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/methods/string-methods.sd`, `packages/sparkdown/src/tests/runtime/fixtures/methods/table-methods.sd`, `packages/sparkdown/src/tests/runtime/fixtures/strings/string-contains.sd`, `packages/sparkdown/src/tests/runtime/Methods.test.ts`, `packages/sparkdown/src/inkjs/engine/MethodDispatch.ts`, `packages/sparkdown/docs/runtime/METHODS.md`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`, `packages/sparkdown/docs/runtime/FUNCTIONS.md`, `packages/sparkdown/docs/runtime/DEFERRED.md`
Lowered to a `__method_*` builtin FunctionCall at compile time; the builtin method set is a fixed registry (`MethodDispatch.ts`), not user-extensible. Resolved conflict: METHODS.md is headed "design sketch — not implemented" — stale; the registry is live and runtime fixtures assert its behavior. Colon calls on user-defined table members (`a:mul(42)`) lower to a CallValueExpression and no longer error at compile time (`luau-conformance/MethodCallValueDispatch.test.ts`), and dot-form `a.method(args)` on stored closures works fully. **UNRESOLVED (possibly belongs in the define/classes section):** DIVERGENCES.md says receiver-type dispatch through a class `as`-inheritance chain (`Penguin.swim` via `as Bird`) is "not yet implemented" while DEFERRED.md says it now rides colon-call value dispatch + metatable chain walking; MethodCallValueDispatch.test.ts pins only the compile-time lowering ("full runtime semantics ... overlap with other open work"), so the class-instance case could not be settled from this group's sources.

### String methods (`s:upper()`, `s:sub()`, `s:find()`, ...)
*Audience:* advanced
Strings support a rich colon-method set. Indices are 1-based and inclusive; negative indices count from the end (`s:sub(-3)`, `s:at(-1)`). `s:find(sub)` returns the 1-based position or nil on a miss; `s:rep(n, sep)` takes an optional separator; `s:padstart`/`s:padend` pad to a width with a fill string.
```sparkdown
store s = "Hello, World!"
{s:sub(2, 5)}
{s:find("zzz")}
{s:gsub("World", "Luau")}
store n = "42"
{n:padstart(5, "0")}
{s:at(-1)}
```
*Output:* `ello` / `nil` / `Hello, Luau!` / `00042` / `!`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/methods/string-methods.sd`, `packages/sparkdown/src/tests/runtime/Methods.test.ts`, `packages/sparkdown/src/inkjs/engine/MethodDispatch.ts`, `packages/sparkdown/docs/runtime/METHODS.md`, `packages/sparkdown/docs/runtime/STDLIB.md`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`
Fixture-asserted set: upper, lower, len, reverse, sub, trim, startswith, endswith, find, gsub, rep, padstart, padend, at. Also registered in `MethodDispatch.ts` (implemented, not fixture-pinned): trimstart, trimend, split, match. Divergence from Luau: trim/startswith/endswith/padstart/padend/at and `rep`'s separator arg are JS-inspired extensions beyond Lua's string library. Resolved conflict: METHODS.md documents `s:find`/`s:gsub` as plain-text-only — half-stale. Per `MethodDispatch.ts`: `s:find(...)` has FULL `string.find` semantics (Lua patterns, optional init, plain mode), and `s:match(pattern)` routes through the same Lua-pattern engine; but `s:gsub(old, new)` really IS plain-text replacement only ("Luau pattern support is deferred") — use `string.gsub(s, ...)` for pattern replacement. Deliberately dropped JS aliases: `:slice`→`:sub`, `:repeat`→`:rep`, `:indexof`→`:find`, `:replace`→`:gsub`, `:includes`→`:find`, `:concat`→`..`.

### String contains idiom (`:find`, replaces ink's `?` operator)
*Audience:* advanced
There is no `?` string-contains operator. Use `:find`, which returns a 1-based position (truthy) or nil (falsy): `if s:find(sub) then` is the contains idiom.
```sparkdown
store s = "Hello, World!"
{s:find("World")}
{s:find("zzz")}
```
*Output:* `8` then `nil`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/strings/string-contains.sd`, `packages/sparkdown/src/tests/runtime/Strings.test.ts`
Divergence from ink: ink's `?` contains operator does not exist in sparkdown. A find miss returns real nil (interpolates as "nil"), not 0 — formerly an IntValue(0) placeholder; Lua truthiness applies in conditions.

### Table/list methods (`t:len()`, `t:at()`, `t:concat()`, `t:sort()`, ...)
*Audience:* advanced
Array-style tables declared with `{1, 2, 3}` support `:len()`, `:at(i)` (negative i counts from end), `:find(value)` (index or nil), `:concat(sep)`, `:reverse()`, `:sort()`, and `:sub(from, to)`.
```sparkdown
store a = {1, 2, 3, 4, 5}
{a:len()}
{a:at(-1)}
{a:find(99)}
{a:concat("-")}
{a:reverse():concat(",")}
```
*Output:* `5` / `5` / `nil` / `1-2-3-4-5` / `5,4,3,2,1`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/methods/table-methods.sd`, `packages/sparkdown/src/tests/runtime/Methods.test.ts`, `packages/sparkdown/src/inkjs/engine/MethodDispatch.ts`, `packages/sparkdown/docs/runtime/METHODS.md`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`
All colon methods are pure-return: `t:sort()` returns the sorted table (chainable) rather than mutating in place like Lua's `table.sort` — the mutating surface is the `table.*` library. `:find` on tables searches by value and returns nil (not 0) on a miss. Also registered in `MethodDispatch.ts` (implemented, not fixture-pinned): insert, remove, clone, sortby, keys, values, pairs, ipairs — per METHODS.md, `:insert(x)` returns a NEW table, `:keys`/`:values`/`:pairs` preserve insertion order, `:ipairs` walks integer keys 1..n stopping at the first hole, `:sortby(key)` is the sort-records convenience. Dropped aliases: `:join`→`:concat`, `:add`→`:insert`, `:intersect`→`:intersection`.

### Table set operations (`union`/`intersection`/`difference`/`some`/`every`)
*Audience:* advanced
Tables combine set-wise: `a:union(b)`, `a:intersection(b)`, `a:difference(b)` return new tables; `a:some(b)` / `a:every(b)` return booleans (any/all of b's elements present in a).
```sparkdown
store a = {1, 2, 3, 4}
store b = {3, 4, 5, 6}
{a:union(b):concat(",")}
{a:intersection(b):concat(",")}
{a:difference(b):concat(",")}
{a:some({2, 99})}
{a:every({1, 99})}
```
*Output:* `1,2,3,4,5,6` / `3,4` / `1,2` / `true` / `false`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/methods/set-ops.sd`, `packages/sparkdown/src/tests/runtime/Methods.test.ts`
No Lua/Luau stdlib equivalent — a sparkdown extension, filling the role of ink's LIST operations for plain tables.

### Table `min`/`max`/`random`
*Audience:* advanced
`t:min()` / `t:max()` return the smallest/largest element (numbers compared numerically, strings lexically; mixed types raise); `t:random()` picks a uniformly random element from the array portion. All three return nil for an empty table.
```sparkdown
store nums = {3, 1, 4, 1, 5, 9, 2, 6}
store strs = {"pear", "apple", "banana"}
store empty = {}
{nums:min()}
{nums:max()}
{strs:min()}
{empty:random()}
```
*Output:* `1` / `9` / `apple` / `nil`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/methods/min-max-random.sd`, `packages/sparkdown/src/tests/runtime/Methods.test.ts`
min/max use the same compareValues helper as `:sort()`. Empty-table nil is falsy in conditions (`if t:min() then`). Per METHODS.md, `t:random()` currently does NOT honor `math.randomseed` (unseeded).

### Chained method calls
*Audience:* advanced
Method calls chain left-to-right, each link's return value becoming the next receiver: `a:union(b):sort():reverse():at(1)`. Works at any depth, with string or numeric args mid-chain.
```sparkdown
{a:difference(b):reverse():concat(",")}
{a:union(b):sort():reverse():at(1)}
{a:union(b):sort():sub(2, 4):concat(",")}
```
*Output:* `2,1` / `6` / `2,3,4`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/methods/chained.sd`, `packages/sparkdown/src/tests/runtime/Methods.test.ts`, `packages/sparkdown/docs/runtime/FUNCTIONS.md`
Added in Phase 0 of the first-class-functions work via the LuauChainedFunctionCall grammar rule. Value-call chains (`f(a)(b)`, `f():g()`) also work — see First-class functions.

### Lua string patterns (`find`/`match`/`gmatch`/`gsub`)
*Audience:* advanced
Full Lua pattern support: `string.find` (with init, negative init, plain mode), `string.match`, `string.gmatch` iteration, and `string.gsub` with string, table, and function replacements (plus max-count). Character classes (`%a %d %s` etc.), quantifiers (`* + - ?`), anchors, captures, `%b()` balanced match, `%f[]` frontier, and `()` position captures all work. Colon method form works on strings (`err:find("oops")`, `s:match(...)`).
```sparkdown
local word, pos, next_word = string.match("hello world", "(%a+)() (%a+)")
host_record(word)
host_record(pos)
host_record(next_word)
```
*Output:* `"hello"`, `6`, `"world"` — string and position captures interleave in order.
*Sources:* `packages/sparkdown/src/tests/luau-conformance/StringPatterns.test.ts`, `packages/sparkdown/src/tests/luau-conformance/StringPatternsOracle.test.ts`, `packages/sparkdown/src/tests/luau-conformance/_fengariOracleSmoke.test.ts`
Backstopped by a parametric fengari (Lua 5.3 VM) oracle: every pattern case must match real Lua byte-for-byte on ASCII. Invalid capture indexes in gsub replacements raise "invalid capture index". Note the colon-form exception: `s:gsub` is plain-text only (see String methods).

### The Luau standard library in logic code
*Audience:* advanced
Function bodies and `&` statements have the Luau stdlib available: `string.format`, `rawget`, `rawequal`, `getmetatable`, `table.freeze`/`table.isfrozen`/`table.create`, `pcall`, `#` length, `for ... in ... do` loops, etc.
```sparkdown
host_record(string.format("%d at %s", 2000, "night"))
```
*Output:* `"2000 at night"`
*Sources:* `packages/sparkdown/src/tests/runtime/PortInventory.test.ts`, `packages/sparkdown/src/tests/runtime/TableSerialization.test.ts`, `packages/sparkdown/src/tests/runtime/DefineClasses.test.ts`
Umbrella entry — the per-library entries below detail each namespace. Stdlib names are reserved: they cannot be redeclared as user identifiers or external bindings.

### Global builtin functions
*Audience:* advanced
Non-namespaced Luau globals: `assert`, `error`, `getmetatable`/`setmetatable`, `ipairs`/`pairs`/`next`, `newproxy`, `pcall`/`xpcall`, `print`, `rawequal`/`rawget`/`rawset`, `select`, `tonumber`, `tostring`, `type`, `typeof`, `unpack` (deprecated → `table.unpack`).
```sparkdown
pcall(f, ...)
```
*Output:* See the dedicated pcall/assert entries; `type` returns nil/number/string/boolean/table/userdata; `typeof` is currently identical to `type`.
*Sources:* `packages/sparkdown/docs/runtime/STDLIB.md`, `packages/sparkdown/src/tests/luau-conformance/StdlibBatch2.test.ts`, `packages/sparkdown/src/tests/luau-conformance/Stdlib.test.ts`
`error(msg)` uncaught force-ends the story; its `level` arg is ignored (no call-frame depth tracking — divergence from Lua). `assert` uses Lua truthiness. `ipairs`/`pairs` iterate insertion order via builtin-iterator dispatch. Note: STDLIB.md's "print is a NO-OP" claim is stale — see the print/log entry.

### `string.*` library
*Audience:* advanced
Full `string.*` namespace: `byte` (multi-return), `char`, `find` (multi-return start,end,captures; full patterns), `format` (C-accurate `%d %i %u %o %x %X %e %E %f %g %G %c %s %q` with flags/width/precision), `gmatch`, `gsub`, `len`, `lower`, `match`, `pack`/`packsize`/`unpack` (binary, DataView-backed), `rep` (optional sep), `reverse`, `split` (Luau-only; empty sep splits to chars), `sub` (1-based inclusive, negative indices), `upper`. Sparkdown/JS-mirror additions: `contains`, `startswith`, `endswith`, `trim`, `trimstart`, `trimend`.
```sparkdown
host_record(string.format("%g", 1000000))
host_record(string.split("a,b,c", ",")[2])
```
*Output:* `"1e+06"` then `"b"`.
*Sources:* `packages/sparkdown/src/tests/luau-conformance/Stdlib.test.ts`, `packages/sparkdown/src/tests/luau-conformance/StringPack.test.ts`, `packages/sparkdown/src/tests/luau-conformance/MultiReturn.test.ts`, `packages/sparkdown/src/tests/luau-conformance/MetamethodDispatch.test.ts`, `packages/sparkdown/docs/runtime/STDLIB.md`
Indexing is 1-based throughout. `%g` matches C semantics at the fixed/exponential boundary (1e+06, 1e-05, 1.23e+03).

### `table.*` library (mutating semantics)
*Audience:* advanced
Full `table.*` namespace with Luau mutating semantics (unlike the pure-return `t:method()` surface): `clear`, `clone` (shallow; result unfrozen), `concat`, `create` (shares one value reference across slots), `find`, `insert`, `maxn` (deprecated), `move` (safe for overlapping ranges), `pack`, `remove`, `sort` (in-place stable; default `<` or user comparator — anonymous, named, or closure), `unpack` (multi-return), `freeze`/`isfrozen`, plus deprecated-but-functional `getn`/`foreach`/`foreachi`.
```sparkdown
local t = { 1, 4, 2, 3 }
table.sort(t, function(a, b) return a > b end)
```
*Output:* `t` becomes `{4, 3, 2, 1}`; default sort on mismatched types errors with "compare".
*Sources:* `packages/sparkdown/src/tests/luau-conformance/TableSort.test.ts`, `packages/sparkdown/src/tests/luau-conformance/Stdlib.test.ts`, `packages/sparkdown/src/tests/luau-conformance/StdlibBatch1.test.ts`, `packages/sparkdown/src/tests/luau-conformance/DeprecatedStdLib.test.ts`, `packages/sparkdown/docs/runtime/STDLIB.md`
Frozen tables refuse clear/insert/remove/move/sort mutation ("readonly" error). User comparator closures or bare-named functions run via CallLuauFunction (sync re-entry). Deprecated entries still run but get a strikethrough editor diagnostic.

### `math.*` library
*Audience:* advanced
Full `math.*` namespace with Luau names: abs, acos, asin, atan (1- and 2-arg), ceil, clamp, cos, cosh, deg, exp, floor, fmod, frexp, huge, ldexp, lerp, log (optional base), log10, map, max/min (variadic), modf (multi-return), noise (deterministic Perlin), pi, rad, random (0/1/2-arg forms, shared deterministic PRNG), randomseed (0-arg seeds from Date.now), round, sign, sin, sinh, sqrt, tan, tanh, ult. Deprecated: atan2 (→ 2-arg atan), pow (→ `^`).
```sparkdown
host_record(math.clamp(15, 0, 10))
host_record(math.noise(0.5))
```
*Output:* `10`; noise is deterministic (same input, same output) and ~[-1, 1].
*Sources:* `packages/sparkdown/src/tests/luau-conformance/Constants.test.ts`, `packages/sparkdown/src/tests/luau-conformance/Stdlib.test.ts`, `packages/sparkdown/src/tests/luau-conformance/StdlibBatch2.test.ts`, `packages/sparkdown/src/tests/luau-conformance/LuaArgSemantics.test.ts`, `packages/sparkdown/docs/runtime/STDLIB.md`
Resolved conflict: STDLIB.md says `math.huge` is stored as 3.4e38 (Float32 max) — stale. `Constants.test.ts` ("math.huge evaluates to true Infinity") asserts it is genuine Infinity end-to-end; the comment notes it "was formerly clamped to 3.4e38, a documented divergence now removed" (JSON serialization uses an "inff" marker). Pure numeric ops coerce numeric strings and raise Lua-style "missing argument #1 to 'abs'" errors. `math.noise` differs from Roblox's permutation table.

### `os.*` library
*Audience:* advanced
Time and clock functions: `os.clock`, `os.date`, `os.difftime`, `os.time`. `os.date(fmt, epoch)` supports strftime codes (`%a %A %b %B %c %d %H %I %j %M %m %p %S %w %x %X %y %Y %Z %%`), the `!` UTC prefix, and the `*t` table form returning {year, month, day, hour, min, sec, wday, yday}; `os.time` accepts the table form (local time, 1-indexed month).
```sparkdown
host_record(os.date("!%A, %B %d, %Y", 1779287445))
```
*Output:* `"Wednesday, May 20, 2026"`
*Sources:* `packages/sparkdown/src/tests/luau-conformance/OsDate.test.ts`, `packages/sparkdown/src/tests/luau-conformance/Stdlib.test.ts`, `packages/sparkdown/docs/runtime/STDLIB.md`
`os.clock` is wall-clock (performance.now/1000), not CPU time. Month/weekday names are English-only. Unknown or dangling `%` conversions raise errors.

### `utf8.*` library
*Audience:* advanced
Unicode helpers: `utf8.char`, `utf8.charpattern`, `utf8.codepoint` (multi-return), `utf8.codes(s)` (generic-for iterator over (byte_position, codepoint)), `utf8.len`, `utf8.offset`, plus Luau-only `nfcnormalize`/`nfdnormalize`.
```sparkdown
for p, c in utf8.codes("abc") do
host_record(p)
host_record(c)
end
```
*Output:* `1,97, 2,98, 3,99`
*Sources:* `packages/sparkdown/src/tests/luau-conformance/StdlibBatch1.test.ts`, `packages/sparkdown/src/tests/luau-conformance/Stdlib.test.ts`, `packages/sparkdown/src/tests/luau-conformance/UpstreamConformance.test.ts`, `packages/sparkdown/docs/runtime/STDLIB.md`
Byte positions are 1-indexed; negative indices count from end. JS strings are always valid Unicode so Lua's invalid-UTF-8 error paths never trigger. The vendored upstream utf8.luau fixture passes end-to-end under the byte-string convention.

### `bit32.*` library
*Audience:* advanced
Fully supported 32-bit integer ops, results coerced back to unsigned 32-bit: arshift, band, bnot, bor, btest, bxor, byteswap (Luau-only), countlz, countrz (Luau-only), extract, lrotate, lshift, replace, rrotate, rshift.
```sparkdown
bit32.band(...)
```
*Output:* Unsigned 32-bit integer results.
*Sources:* `packages/sparkdown/docs/runtime/STDLIB.md`, `packages/sparkdown/src/tests/luau-conformance/StdlibBatch1.test.ts`
Sparkdown has no native bitwise operators (`&`, `|` etc. mean other things in the language), so bit32 is the only bitwise surface.

### `debug.*` library (limited)
*Audience:* advanced
`debug.traceback([message [, level]])` returns the current call-stack dump (message-prefixed if given); `debug.info(level, options)` returns multi-values for option codes s/l/n/a/f/r.
```sparkdown
local t = debug.traceback("oh no")
host_record(string.startswith(t, "oh no"))
```
*Output:* `true`
*Sources:* `packages/sparkdown/src/tests/luau-conformance/StdlibBatch2.test.ts`, `packages/sparkdown/src/tests/luau-conformance/Stdlib.test.ts`, `packages/sparkdown/docs/runtime/STDLIB.md`
traceback's `level` arg is accepted for compat but ignored. `debug.info` has no line info (`l` returns -1; out-of-range level returns nil). The upstream debug.luau conformance fixture is skipped (needs coroutine-threaded stack introspection).

### Stdlib constants (`_VERSION`, `math.pi`, `math.huge`, `utf8.charpattern`)
*Audience:* advanced
Constants are emitted as literals at compile time — no runtime dispatch. `_VERSION` reports "Luau".
```sparkdown
_VERSION
```
*Output:* `"Luau"`
*Sources:* `packages/sparkdown/src/tests/luau-conformance/Constants.test.ts`, `packages/sparkdown/docs/runtime/STDLIB.md`
`math.huge` is true Infinity (see the math library entry for the resolved stale-doc claim). STDLIB.md's note that `_G` is "not yet implemented" is also stale — see the next entry.

### `_G` globals table
*Audience:* advanced
Luau's `_G` global environment table works as a runtime view over globals: `_G.foo = 1` then `_G['foo']`, dynamic keys (`_G[key]`), reads of absent globals give nil, writes are visible as plain global reads and vice versa, `_G` reads the global even when a local shadows it, and `type(_G) == "table"`.
```sparkdown
_G.score = 42
assert(score == 42, "got " .. tostring(score))
```
*Output:* Passes — `_G` writes are visible as plain global reads.
*Sources:* `packages/sparkdown/src/tests/luau-conformance/GlobalsTable.test.ts`
Resolved conflict: STDLIB.md says `_G` is "not yet implemented (planned as the class registry once needed)" — stale; `GlobalsTable.test.ts` asserts the behaviors above, and runtime assertions outrank doc prose.

### Error handling: `error()`, `pcall`, `xpcall`
*Audience:* advanced
`error(msg)` raises a runtime error; uncaught, it aborts and surfaces to the host. `pcall(fn, args...)` traps it and returns `(false, msg)` — or `(true, ...returns)` on success, spreading all return values. `xpcall(fn, handler)` routes the error through a message handler first.
```sparkdown
local ok, err = pcall(function() error("oops") end)
assert(ok == false)
assert(err:find("oops"))
```
*Output:* Passes; execution continues after the trapped error.
*Sources:* `packages/sparkdown/src/tests/luau-conformance/Pcall.test.ts`, `packages/sparkdown/src/tests/luau-conformance/PcallTrapsError.test.ts`, `packages/sparkdown/src/tests/luau-conformance/ErrorMessageFormat.test.ts`, `packages/sparkdown/src/tests/luau-conformance/PerStatementSourceMapping.test.ts`, `packages/sparkdown/src/tests/luau-conformance/MetamethodDispatch.test.ts`
pcall accepts closures, bare-named functions, first-class stdlib builtins (`pcall(rawequal, "a", "a")`), and callable tables (via `__call`). Runtime errors from bad indexing, concatenation, iteration, and stdlib arg validation are all pcall-trappable (trappable stdlib errors go through story.Error, not AddError). Error messages get a Luau-spec `<file>:<line>: ` prefix only when the host installs `story.errorMessageFormatter` (the LSP doesn't; the test harness does); per-statement source mapping makes the reported line exact. `error`'s `level` arg is ignored (divergence from Lua).

### `assert(v [, message, ...])`
*Audience:* advanced
`assert` raises a runtime error on falsy values (nil/false only), with "assertion failed!" or a custom message; on success it returns ALL its arguments (`assert(1) == 1`, `select('#', assert(1,2,3)) == 3`). Zero args raises "missing argument #1".
```sparkdown
assert(false, "custom failure")
```
*Output:* Runtime error containing "custom failure".
*Sources:* `packages/sparkdown/src/tests/luau-conformance/Assert.test.ts`

### Multi-return values and spread rules
*Audience:* advanced
Functions return multiple values (`return 1, 2, 3`). A call in LAST position spreads all values (into call args, table literals, `return`, multi-assignments); in non-last position it truncates to its first value. Parenthesizing adjusts to exactly one value: `(f())`. Stdlib multi-returns (math.modf, math.frexp, string.byte, string.find, utf8.codepoint, table.unpack, select, string.unpack) participate identically, and unpack into multi-target `local`s: `local i, f = math.modf(x)`.
```sparkdown
function g() return 1, 2, 3 end
function f(a, b, c) return a + b + c end
host_record(f(g()))
```
*Output:* `6` — g's three values spread into f's three parameters. `f(g(), 10)` would truncate `g()` to 1.
*Sources:* `packages/sparkdown/src/tests/luau-conformance/MultiReturn.test.ts`, `packages/sparkdown/src/tests/luau-conformance/MultiReturnSpread.test.ts`, `packages/sparkdown/src/tests/luau-conformance/CallAdjustments.test.ts`, `packages/sparkdown/src/tests/luau-conformance/VariadicCallSpread.test.ts`, `packages/sparkdown/docs/runtime/STDLIB.md`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`, `packages/sparkdown/docs/README.md`
Distinct from general multiple assignment (`x, y = 1, 2`), which is parsed but NOT lowered. Known gap: pure stdlib calls don't spread a tuple argument (`math.max(math.modf(x))` doesn't spread modf's tuple). Resolved conflict: METHODS.md's claim that sparkdown "lacks multiple-return support" predates the conformance suite and is stale.

### Varargs (`...`) and `select`
*Audience:* advanced
`function f(...)` and `function f(a, b, ...)` capture surplus args. `select('#', ...)` counts them, `select(n, ...)` returns the nth onward, `{...}` packs into a table, `return ...` propagates, and `...` as last call-arg spreads. Missing regular params bind nil.
```sparkdown
function f(...) return select("#", ...) end
host_record(f())
host_record(f(10, 20, 30))
```
*Output:* `0` then `3`.
*Sources:* `packages/sparkdown/src/tests/luau-conformance/Varargs.test.ts`, `packages/sparkdown/src/tests/luau-conformance/VariadicFirstClass.test.ts`, `packages/sparkdown/src/tests/luau-conformance/VariadicSubFlowCapture.test.ts`, `packages/sparkdown/src/tests/luau-conformance/VariadicCallSpread.test.ts`, `packages/sparkdown/src/tests/luau-conformance/LuaArgSemantics.test.ts`
Variadic functions work as first-class values, as methods (`function t:f(...)`), and can be redefined. Variadic nested functions compile as subflows rather than closures internally, but capture upvalues and shadow correctly per the tests.

### Argument-count adjustment (pad nil / discard extras)
*Audience:* advanced
Calling with fewer args than parameters pads the rest with nil (`foo(1)` where foo takes (a, b) binds b = nil); extra args are evaluated then discarded, including for fixed-arity natives (`math.sin(1, 2) == math.sin(1)`). A function with no return values compares equal to nil and counts as zero values in variadic contexts.
```sparkdown
local function foo(a, b) return b end
assert(foo(1) == nil)
```
*Output:* Passes; also `assert((function() end)() == nil)` and `select('#', (function() end)()) == 0`.
*Sources:* `packages/sparkdown/src/tests/luau-conformance/VoidAndUnderArgs.test.ts`, `packages/sparkdown/src/tests/luau-conformance/CallAdjustments.test.ts`, `packages/sparkdown/src/tests/luau-conformance/NativeArityRelaxed.test.ts`

### First-class functions and anonymous function literals
*Audience:* advanced
`local f = function(x) return x * 2 end` creates a function value; functions pass as arguments, return from functions, store in tables/globals, and chain-call: `f(a)(b)`, `make()(5)`. Bare knot/function names are values too (`local f = double`). IIFEs work in every position: `(function() ... end)()`.
```sparkdown
local function make() return function(n) return n end end
local t = make()(5)
assert(t == 5, "got " .. tostring(t))
```
*Output:* Passes — the returned closure is immediately called with 5.
*Sources:* `packages/sparkdown/src/tests/luau-conformance/FirstClassFunctions.test.ts`, `packages/sparkdown/src/tests/luau-conformance/ChainedValueCall.test.ts`, `packages/sparkdown/src/tests/luau-conformance/IifeStatement.test.ts`, `packages/sparkdown/src/tests/luau-conformance/AnonOuterWithNamedInner.test.ts`, `packages/sparkdown/src/tests/luau-conformance/LocalCalleeDispatch.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/luau-function/anonymous-expression.sd`
Resolved conflict: DIVERGENCES.md says sparkdown has "no anonymous functions/closures" — stale; the luau-conformance suite (all green as of 2026-06) asserts them extensively, and runtime assertions outrank docs. As a statement, an IIFE after another call needs the same `;` guard as real Luau (`bump(1)` newline `;(function() ... end)()`) to avoid the classic Lua call-continuation ambiguity. The engine may emit a hint that first-class fns "should be marked as: -> fn" — an ink-style annotation the tests filter out as unnecessary.

### Closures and upvalue semantics
*Audience:* advanced
Closures capture enclosing locals by reference (live cell): mutations propagate both ways, two closures over the same local share state, nested re-capture at any depth reaches one shared cell, and closures outlive their defining scope. Upvalues close per Lua's timely-closing rules: each loop iteration's `local` is a fresh cell, and do-block locals close at block exit.
```sparkdown
local res = {}
for i = 1, 5 do
    res[#res+1] = (function() return i end)
end
local sum = 0
for i, f in pairs(res) do sum = sum + f() end
host_record(sum)
```
*Output:* `15` — each closure sees its own iteration's i (1+2+3+4+5), not the final value.
*Sources:* `packages/sparkdown/src/tests/luau-conformance/FirstClassFunctions.test.ts`, `packages/sparkdown/src/tests/luau-conformance/UpvalueFlattening.test.ts`, `packages/sparkdown/src/tests/luau-conformance/TimelyUpvalueClosing.test.ts`, `packages/sparkdown/src/tests/luau-conformance/SelfCaptureInNestedFn.test.ts`, `packages/sparkdown/src/tests/luau-conformance/NestedSiblingCalls.test.ts`
`self` is captured correctly by anonymous functions nested inside method bodies. Divergence: forward references between nested named functions are NOT late-bound — `function A() B() end function B() end` requires B declared before A for the upvalue to resolve (Lua late-binds).

### Nested function declarations and hoisting
*Audience:* advanced
Inside a function body, `function NAME() end` (no `local`) is sugar for `NAME = function() end` and is visible across do/while/for/if block boundaries within the enclosing function; `local function NAME` stays scoped to its innermost block per Luau spec. Same-named nested functions in different functions don't collide; three-level nesting works.
```sparkdown
do
  function inner(n)
    return n * 2
  end
end
assert(inner(5) == 10, "got " .. tostring(inner(5)))
```
*Output:* Passes — `inner` escapes the do-block to the enclosing function scope.
*Sources:* `packages/sparkdown/src/tests/luau-conformance/NestedFunctionHoisting.test.ts`, `packages/sparkdown/src/tests/luau-conformance/FirstClassFunctions.test.ts`, `packages/sparkdown/src/tests/luau-conformance/AnonOuterWithNamedInner.test.ts`
Resolved conflict: DIVERGENCES.md's "`local function` scope modifier parsed but ignored" is stale — `NestedFunctionHoisting.test.ts` states and tests "`local function NAME(...) end` still scopes to the innermost block per Luau spec — only the non-local form gets hoisted". Remaining known divergence: non-local `function NAME end` nested in a function binds enclosing-local rather than true Luau global semantics.

### Call sugar: `f{...}`, `f"..."`, `f'...'`, `f[[...]]`
*Audience:* advanced
Lua's single-argument call sugar works: a table constructor or string literal directly after a function name is a one-arg call (`f{a=1, b=2}` == `f({a=1, b=2})`). Applies to user functions and stdlib soft keywords (`type{}`, `type"x"`).
```sparkdown
local function f(t) return t.a + t.b end
assert(f{a=1, b=2} == 3)
```
*Output:* Passes — the table literal is the single argument.
*Sources:* `packages/sparkdown/src/tests/luau-conformance/CallSugarArgs.test.ts`, `packages/sparkdown/src/tests/luau-conformance/MethodCallChain.test.ts`, `packages/sparkdown/src/tests/luau-conformance/CallAdjustments.test.ts`

### Stdlib functions as first-class values
*Audience:* advanced
Builtins can be read as values: `local abs = math.abs` then `abs(-5)`; passed to pcall (`pcall(math.abs, -5)`); used as table keys (`a[print] = assert`); compared (`f == print` after `local f = print`); captured by closures; and called through parameters (`call(math.max, {5, 2, 8})` with table.unpack).
```sparkdown
local abs = math.abs
assert(abs(-5) == 5)
```
*Output:* Passes.
*Sources:* `packages/sparkdown/src/tests/luau-conformance/LocalCalleeDispatch.test.ts`, `packages/sparkdown/src/tests/luau-conformance/TableKeysAndTargets.test.ts`, `packages/sparkdown/src/tests/luau-conformance/MetamethodDispatch.test.ts`, `packages/sparkdown/src/tests/luau-conformance/VariadicFirstClass.test.ts`, `packages/sparkdown/src/tests/luau-conformance/LuaArgSemantics.test.ts`
Stdlib values are marker objects that compare equal by tag. `print` returns nothing — reading its result through a call gives nil.

### Metatables and metamethods
*Audience:* advanced
`setmetatable(t, mt)` / `getmetatable(t)` / `newproxy([mt])` attach and read metatables. Supported metamethods: `__add __sub __mul __div __mod __pow __unm` (arithmetic), `__len`, `__eq __lt __le` (comparison), `__index __newindex` (table + function forms; chained lookup gives Lua-style inheritance), `__call`, `__tostring`, `__metatable` (protection).
```sparkdown
setmetatable(Class, { __index = Parent })
```
*Output:* Missing-key lookups on `Class` fall through to `Parent` (Lua-style inheritance).
*Sources:* `packages/sparkdown/docs/runtime/STDLIB.md`, `packages/sparkdown/src/tests/luau-conformance/Metatables.test.ts`, `packages/sparkdown/src/tests/luau-conformance/MetamethodDispatch.test.ts`
Caveats: `__concat` collapses into `__add` because sparkdown maps `..` and `+` to the same runtime op (so `t .. s` triggers `__add`); `__call` with a bare divert-target handler can't infer arg count (defaults to 1 arg = self) — wrap as a closure for multi-arg; `__eq` fires only when BOTH operands are tables; `>`/`>=` swap args onto `__lt`/`__le`. Not supported: `__mode` (weak tables — needs GC hooks), `__iter` (deferred), `__idiv` (grammar has no `//` operator — `//` is a display comment). Possibly belongs in the define/classes or tables section.

### Evaluating functions from the host (`EvaluateFunction`)
*Audience:* integrator
Because sparkdown functions are pure, a host application can call any declared function directly via the engine's EvaluateFunction API and get its return value; the `output` field of the result always comes back empty (functions cannot emit narrative).
```sparkdown
done

function func1() return 5 end
function func2() end
function add(x, y) return x + y end
```
*Output:* Host-side: `EvaluateFunction("add", [1, 2])` evaluates to 3 with empty text output; `inkInc(6)` evaluates to 7 in the bindings round-trip test.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/evaluation/evaluating-functions-from-host.sd`, `packages/sparkdown/src/tests/runtime/fixtures/bindings/game-ink-back-and-forth.sd`, `packages/sparkdown/src/tests/runtime/Evaluation.test.ts`, `packages/sparkdown/src/tests/runtime/Bindings.test.ts`
Divergence from ink: ink's EvaluateFunction can capture narrative text emitted by knot functions; sparkdown's never has any. Possibly belongs in the integrator/engine-API section.
## Structured data, UI, assets & project structure

### `---` front matter (title page)
*Audience:* writer
A file may open with a `---` fenced block of `key: value` fields (title, credit, author, ...) — Fountain-style title-page metadata.
```sparkdown
---
title: My Title
credit: Written by
author: Someone
---
```
*Output:* Parses as FrontMatter (not as a doc comment or dialogue); no "Cannot find character named `title`" warnings.
*Sources:* `packages/sparkdown/src/tests/runtime/FrontMatterAndCommentContext.test.ts`
Regression-guarded against the Luau `---` doc-comment rule eating the fence. Inside display contexts `--` reads as an em-dash/front-matter token, not a comment.

### `include` — multi-file projects
*Audience:* writer
`include relative/path.sd` splices another script file into the project. Includes nest recursively; included content is emitted in include order before the including file's own content.
```sparkdown
include includes/included_file.sd
include includes/included_file_2.sd
This is the main file.
done
```
*Output:* `This is include 1.` / `This is include 2.` / `This is the main file.`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/misc/include/main.sd`, `packages/sparkdown/src/tests/runtime/fixtures/misc/include/includes/included_file.sd`, `packages/sparkdown/src/tests/runtime/fixtures/misc/include/includes/included_file_2.sd`, `packages/sparkdown/src/tests/runtime/fixtures/misc/nested-include/main.sd`, `packages/sparkdown/src/tests/runtime/fixtures/misc/nested-include/includes/included_file_3.sd`, `packages/sparkdown/src/tests/runtime/fixtures/misc/nested-include/includes/included_file_4.sd`, `packages/sparkdown/src/tests/runtime/Misc.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/include/basic.sd`
Lowercase `include` + `.sd` extension (ink equivalent: `INCLUDE file.ink`). Paths resolve relative to the importing file's URI. Declarations are project-global across files: a `store t2 = 5` declared in a nested include is readable everywhere, and `-> knot_in_2` can divert to a scene defined in another file.

### `run "path"` — external .luau code files
*Audience:* advanced
A top-level `run "name"` statement loads a sibling `.luau` file and executes its body (wrapped as a function called from main flow). Missing files are a compile error.
```sparkdown
external harness_record(v)
run "helpers"
done
```
*Output:* The body of helpers.luau executes (its top-level `& harness_record(42)` fires, recording 42).
*Sources:* `packages/sparkdown/src/tests/luau-conformance/Run.test.ts`
The grammar only allows `run` at file top level, making run-cycles structurally impossible today (cycle detection exists as defensive code). Inside the .luau file, statement-level bare calls still need the `&` discard prefix per the test comment (issue #75).

### Image directives `[[...]]` (show / hide / animate)
*Audience:* writer
Double square brackets issue a stage/visual command in the flow: `[[show TARGET NAME]]`, `[[hide TARGET]]`, `[[animate TARGET with ANIMATION]]`, each optionally with an `over DURATION` timing clause (unit suffixes: `50ms`, `1s`, `0.5s`). Directives can appear on their own line or inline at the end of an action/dialogue line.
```sparkdown
[[show backdrop rooftop_night]]
[[show portrait nova_smile over 50ms]]
[[hide stage over 1s]]
[[animate stage with shake over 0.5s]]
```
*Output:* No prose is printed. The directive lowers to a literal Text node (`[[show backdrop rooftop_night]]` plus a newline) that survives into the runtime, where the InterpreterModule re-parses it into an image instruction — the same path as inline directives. The player shows the named image on the named layer.
*Sources:* `packages/sparkdown/src/tests/compiler/__snapshots__/compile/asset/image.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/asset/image-and-audio.sd`, `packages/sparkdown/src/tests/runtime/PortInventory.test.ts`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/stress/spark-tale-sample.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/stress/spark-tale-sample-messy.sd`, `packages/sparkdown/docs/compiler/GRAMMAR.md`
Fountain divergence: Fountain's `[[...]]` are invisible notes; in Sparkdown they are executable stage directions. Multiple directives can share one line (`[[show backdrop rooftop_night]] ((play music stars))` — both fire from the same flow step). The formatter strips padding inside the brackets (`[[  show backdrop rooftop_night  ]]` → `[[show backdrop rooftop_night]]`); the delimiters are bracket-matched in the editor, and an unterminated marker is line-bounded so it cannot swallow the document. Conflict resolved: `packages/sparkdown/docs/runtime/DEFERRED.md` claims each command emits tag-wrapped `image:...` markers — that is STALE; the current lowerer (`packages/sparkdown/src/compiler/lower/lowerers/lowerAssetLine.ts` and the `image.snap` compile snapshot) emits the raw bracketed directive text precisely because nothing consumed those tags and standalone directives were silently dropped.

### Audio directives `((...))` (play / stop)
*Audience:* writer
Double parentheses issue an audio command: `((play CHANNEL NAME))`, `((stop CHANNEL))`, with optional modifiers `looping` and `over DURATION`. Channels seen in fixtures: `music`, `sound`.
```sparkdown
((play music stars))
((play sound step looping))
((stop music over 2s))
```
*Output:* No display text. Lowers to a literal Text node (`((play music stars))`) that the runtime InterpreterModule re-parses into an audio instruction; the player plays the `stars` audio on the `music` channel.
*Sources:* `packages/sparkdown/src/tests/compiler/__snapshots__/compile/asset/audio.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/asset/image-and-audio.sd`, `packages/sparkdown/src/tests/runtime/PortInventory.test.ts`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/stress/spark-tale-sample.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/stress/spark-tale-sample-messy.sd`
Fountain divergence: `((...))` is NOT a Fountain note/boneyard or doubled parenthetical here — it is the audio sigil. Sigil pair to remember: `[[ ]]` = image/visual, `(( ))` = audio. The formatter strips inner padding (`((  play   music   stars  ))` → `((play music stars))`). Same stale-docs caveat as image directives: the `audio:...` tag wrapping described in DEFERRED.md was replaced by raw-text re-parsing.

### Image filter chains (`~`) and the `with` animation clause
*Audience:* writer
Inside an image directive, an asset name can chain filters with `~` (`bunny_suspicious~phone~look_left`), which implicitly creates a `filtered_image` variant; an optional trailing `with <animation>` clause applies an animation.
```sparkdown
[[bunny_suspicious~phone~look_left with flip]]
```
*Output:* Creates the implicit filtered_image keyed by SORTED filter names: `bunny_suspicious~look_left~phone` (same clean key with or without the clause).
*Sources:* `packages/sparkdown/src/tests/runtime/ImplicitFilteredImageClause.test.ts`, `packages/sparkdown/src/tests/runtime/PortInventory.test.ts`, `packages/sparkdown/src/tests/runtime/ChooseThenTagBody.test.ts`
Filter order in source doesn't matter — keys are sorted. Regression-guarded: the `with` clause used to leak a trailing space into the key (`bunny_suspicious~look_left ~phone`), breaking image lookup whenever a clause followed. Animations themselves are declared as defines (e.g. `define flip as animation with keyframes = { transform = "scaleX(-1)" } end`).

### `define` blocks — named data objects
*Audience:* writer
`define Name with <prop = value> ... end` declares a named data object; properties are `key = value` pairs, one per line (trailing commas are also accepted — both forms are attested in fixtures). A property can itself be a `store` declaration (`store trust = 0`) to make it persist in saves.
```sparkdown
define Settings with
  max_trust = 10,
  language = "en"
end
```
*Output:* Compiles to a global variable holding a struct: parentless defines lower to a `__def({...}, "Name", "")` call producing a runtime table; `Settings.language` reads its default string.
*Sources:* `packages/sparkdown/src/tests/compiler/__snapshots__/compile/define/without-parent.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/define/with-numeric-property.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/define/with-string-properties.sd`
This is also how characters are declared (a `define O as companion` pairs with `O:` dialogue lines). `define` is class-like: instances/types/namespaces all use it, and only `store`-marked props persist to saves. No ink or Fountain equivalent. Conflict resolved: one reader described props as comma-separated, another newline-separated — both are valid; compiler snapshots use commas, runtime tests (`DefineClasses.test.ts`, `DefineTypes.test.ts`) use bare newlines.

### `define X as Y` — inheritance and the type/instance/namespace model
*Audience:* advanced
`define Sub as Parent with ... end` inherits Parent's props and methods via a metatable chain; subclass overrides win, unoverridden members fall through. `define D as T` also auto-creates the named singleton D registered under T and all ancestors — so `D`, `T.D`, and `Grandparent.D` all resolve.
```sparkdown
define companion as character with
  store trust = 0
end

define O as companion with
  name = "Orion"
  color = "teal"
end
```
*Output:* `companion.O.name == "Orion"`; `character.O.name == "Orion"` (bubbles up); `O.trust == 0` as an own store key; mutating `O.trust` leaves `companion.trust` at 0. An inherited method on a subclass instance reads the subclass's own defaults ("honk" not "tweet").
*Sources:* `packages/sparkdown/src/tests/runtime/DefineTypes.test.ts`, `packages/sparkdown/src/tests/runtime/DefineClasses.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/compile/define/with-string-properties.sd`
Types form a hierarchy (companion as character; O as companion). `store` props are copied into each instance at construction (per-instance, serialized); unmarked properties stay on the class until written. `new companion()` also mints fresh anonymous instances of a define-type, independent of the named singletons.

### Methods, `new`, and colon dispatch on defines
*Audience:* advanced
A define body can contain methods (`method() ... end`). `new Name()` constructs an instance; `obj:method()` colon-calls thread `self`; property reads fall back to class defaults, writes are per-instance.
```sparkdown
define Bird with
  canFly = true
  isFlying = false
  fly()
    self.isFlying = true
  end
end
```
*Output:* `local b = new Bird(); b:fly()` → `b.isFlying == true`; other instances and the class default stay untouched.
*Sources:* `packages/sparkdown/src/tests/runtime/DefineClasses.test.ts`
Desugars to Luau tables + metatable chains (`define Bird` → `Bird = { defaults, methods }`; `new Bird()` → instance with `__index` → Bird). Writing to an instance never mutates the class. Methods can colon-call other methods on `self` (`self:bump()`).

### `init()` constructor
*Audience:* advanced
If a define declares an `init(args...)` method, `new T(args...)` calls it on the fresh instance with those arguments.
```sparkdown
define Critter with
  name = "???"
  init(name, hp)
    self.name = name
    self.hp = hp
  end
end
```
*Output:* `new Critter("Maw", 12)` → `c.name == "Maw"`, `c.hp == 12`.
*Sources:* `packages/sparkdown/src/tests/runtime/DefineClasses.test.ts`

### Data-only defines as enums/settings
*Audience:* advanced
A `define` with no methods does not become a runtime class — it routes through the compile-time struct registry with flat dot access to its properties, making it work as an enum or settings bag.
```sparkdown
define TIME_OF_DAY with
  NIGHT = 2
  DAY = 1
end
```
*Output:* `TIME_OF_DAY.NIGHT` evaluates to 2; `Settings.difficulty` reads its default string.
*Sources:* `packages/sparkdown/src/tests/runtime/DefineClasses.test.ts`, `packages/sparkdown/src/tests/runtime/PortInventory.test.ts`

### Same-name defines under different types
*Audience:* advanced
Two defines may share a name if their types differ (`define raffles as character` + `define raffles as synth`). Each is reachable type-namespaced (`character.raffles`, `synth.raffles`); the first keeps the flat global slot.
```sparkdown
define raffles as character with
  name = "RAFFLES"
end

define raffles as synth with
  frequency = 340
end
```
*Output:* `character.raffles.name == "RAFFLES"`; `synth.raffles.frequency == 340` — both in one runnable program.
*Sources:* `packages/sparkdown/src/tests/runtime/SameNameDefineRuntimeExport.test.ts`
This pairing is REQUIRED by the engine: a character links to its voice synth by shared name. Regression-guarded: the second define once silently broke compilation (black preview with 0 errors).

### Table and array props in defines; asset references
*Audience:* integrator
Define props can be Luau tables: array-style `{ a, b }` → JS array, keyed `{ k = v }` → object, reaching `program.context` for the engine's spec system. A bare identifier value is a reference `{ $type: "", $name }` (engine searches all types); a dotted `type.name` is a typed reference `{ $type, $name }`. Quoted strings stay plain strings.
```sparkdown
define bg_print_shop as layered_image with
  assets = {
    bg_int_print_shop_night__base,
    bg_int_print_shop_night__prop,
  }
end
```
*Output:* `context.layered_image.bg_print_shop.assets == [{$type:"",$name:"bg_int_print_shop_night__base"}, {$type:"",$name:"bg_int_print_shop_night__prop"}]`
*Sources:* `packages/sparkdown/src/tests/runtime/DefineNonScalarContext.test.ts`
Dotted refs like `audio.mus_a_bass` stay inert `{$type,$name}` literals at runtime (never evaluated as global lookups, which would throw). Scalar bare refs (`image = bunny_realization`) are references too, not strings — a filtered_image's base image lookup depends on it.

### `instances()`, `iinstances()`, `props()` iterators
*Audience:* advanced
`for k, v in instances(T) do` iterates T's member defines as (name, instance); `iinstances(T)` yields (ordinal, instance) in declaration order; `props(x)` enumerates own + inherited DATA properties (methods and bookkeeping keys hidden).
```sparkdown
for k, v in instances(companion) do
  count = count + 1
  host_record(k)
  host_record(v.name)
end
```
*Output:* Yields ("O", Orion-instance) and ("P", Pax-instance); props like trust are yielded by `props()` but internal `__storeProps` bookkeeping is NOT. Mutating members through the loop (`v.trust = 0`) writes the real singletons.
*Sources:* `packages/sparkdown/src/tests/runtime/DefineTypes.test.ts`

### No `class` keyword — `define` is the OOP path
*Audience:* advanced
The `class Name ... end` syntax from upstream Luau's RFC/prototype fixtures is intentionally NOT implemented. Sparkdown's object-oriented path is its own `define` construct, which desugars to class-like behavior via the struct/inheritance machinery; metatable-based OOP (`setmetatable` + `__index`) also works for Lua-style code.
```sparkdown
define Name with ... end
```
*Output:* n/a — `classes.luau` is permanently skipped in the upstream conformance suite with an explanatory comment.
*Sources:* `packages/sparkdown/src/tests/luau-conformance/UpstreamConformance.test.ts`
Possibly belongs in the Luau/code section of the master doc, but kept here because it frames the `define` family above.

### `screen` blocks — UI element trees
*Audience:* advanced
`screen NAME [as PARENT] with <element tree> end` declares a UI element tree using colon/indent nesting: `element:` (trailing colon) opens a child element, `key = value` sets a scalar prop, `element ARG` passes an argument, and a bare name (`image`, `text`, `mask shadow_1`) becomes an empty leaf. Elements can take `#attr=value` attributes and a quoted text argument (`text #class=title "Settings"`).
```sparkdown
screen main with
  stage:
    backdrop:
      image = "black"
    portrait:
      mask shadow_1
      image
end
```
*Output:* Lowers to `program.context.screen.main = { $type: "screen", stage: { backdrop: { image: "black" }, portrait: { "mask shadow_1": {}, image: {} } } }` — consumed directly by the engine.
*Sources:* `packages/sparkdown/src/tests/runtime/ScreenComponent.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/struct/screen-bare-markers.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/ui/screen-tree.sd`, `packages/sparkdown-language-server/src/tests/formatter/deltaFormatEquivalence.test.ts`
Screens coexist with style blocks and narrative content in one file. Formatter: two spaces per tree level; attribute spacing is enforced tight (`#class = title` is corrected back to `#class=title`), and the fixtures are idempotent. Naming caveat: a later UI-terminology refactor (commit cfb300cff, "rename screen→layout, container→screen") exists in the repo but is NOT an ancestor of this documentation branch — here `screen` is the element-tree keyword and no `layout` keyword exists (verified: `packages/sparkdown/src/compiler/lower/lower.ts` maps grammar node `LuauScreen` → `context.screen`). Docs built from this branch should use `screen`; expect the rename when that refactor merges.

### `component` blocks — reusable UI trees
*Audience:* advanced
`component NAME [as PARENT] with ... end` declares a reusable UI element tree with the same colon/indent body as `screen`; `as PARENT` records inheritance (`$extends`).
```sparkdown
component my_button as button with
  label:
    text
end
```
*Output:* `context.component.my_button` has `$type` "component" and `$extends` "button".
*Sources:* `packages/sparkdown/src/tests/runtime/ScreenComponent.test.ts`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/ui/component-tree.sd`

### `style` blocks — CSS-like styling
*Audience:* advanced
`style NAME [as PARENT] with ... end` declares styling. Bodies support: scalar props with unquoted CSS-like values (`position = absolute`, `font_size = 3.4cqh`, hex colors like `#E5323E`); array-valued props as `items:` followed by `- item` dash lines; `> selector:` nested rules (child combinator, including attribute selectors like `> #image^=raffles_:`); `@screen-size(sm):` breakpoint blocks; and `as PARENT` inheritance.
```sparkdown
style dialogue with
  height = 100%
  @screen-size(sm):
    width = 100%
  > text:
    color = black
    font_size = 3cqh
end
```
*Output:* `context.style.dialogue = { height: "100%", "@screen-size(sm)": { width: "100%" }, "> text": { color: "black", font_size: "3cqh" } }`
*Sources:* `packages/sparkdown/src/tests/runtime/StyleDefine.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/struct/style-scalar-props.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/struct/style-array-items.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/struct/style-object-headers.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/ui/style-block.sd`, `packages/sparkdown-language-server/src/tests/formatter/deltaFormatEquivalence.test.ts`
Values are bare tokens, not quoted strings (`absolute`, `100%`, `3.4cqh`, `black`, `surface-2`); raw complex values like `calc()` pass through. Property names may be snake_case (`font_size` — maps to CSS kebab-case) or kebab-case (`bg-color`). Style bodies are Luau contexts: whole-line `--` comments are skipped (and `//` would be floor division). `type.name` values (`image.ui_dialogue_box`, `font.courier_prime_sans`) resolve to `{$type,$name}` references that become `var(--theme-<type>-<name>)` CSS variables; quoted strings are unquoted. The formatter re-indents under-indented props under their `style ... with` header. No ink/Fountain/Luau equivalent.

### Standalone `end` keyword
*Audience:* writer
`end` is the universal block terminator (scenes, branches, functions, defines, screens, styles, alternators, conditionals, choose). A stray standalone `end` lowers to nothing.
```sparkdown
end
```
*Output:* Compiles to an empty block `{}` — no content and no crash.
*Sources:* `packages/sparkdown/src/tests/compiler/__snapshots__/compile/misc/end-keyword-standalone.sd`
Confirms `end` is structural punctuation, not content; an unmatched one is silently inert at the lowering stage (diagnostics, if any, are not shown in this snapshot). Possibly belongs in the flow/structure section of the master doc.

### count.turns() — total turn count
*Audience:* writer
`count.turns()` with no argument returns the number of player turns (choices taken) so far; 0-based at story start.
```sparkdown
label loop
{count.turns()}
choose
  + [choice]
end
-> loop
```
*Output:* 0, then 1, 2, 3... — one increment per choice picked.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/builtins/count-turns.sd`, `packages/sparkdown/src/tests/runtime/fixtures/builtins/turns-choice-loop.sd`, `packages/sparkdown/src/tests/runtime/Builtins.test.ts`
Luau-style alias for ink's `TURNS()` builtin, registered in INK_BUILTIN_ALIASES. `[choice]`-bracketed text is shown in the menu but suppressed after picking, so the loop prints only the counts. Possibly belongs in the builtins/state section of the master doc.

### count.turns(-> target) — turns since a container was visited
*Audience:* writer
`count.turns(-> target)` returns how many turns have passed since `target` (a scene, function, or labeled choice) was last visited: -1 if never, 0 if this turn, 1 if one choice ago, etc. The target is written as a divert arrow.
```sparkdown
{count.turns(-> test)}
& test()
{count.turns(-> test)}
choose
  + [choice 1]
then
  {count.turns(-> test)}
end
```
*Output:* -1, then 0; after picking a choice, 1; after another, 2.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/builtins/turns-since.sd`, `packages/sparkdown/src/tests/runtime/fixtures/builtins/turns-since-nested.sd`, `packages/sparkdown/src/tests/runtime/fixtures/builtins/turns-since-variable-target.sd`, `packages/sparkdown/src/tests/runtime/Builtins.test.ts`
Alias for ink's `TURNS_SINCE(-> t)`. Works on labeled choices (`+ (then) stuff` → `count.turns(-> then)`). Gotcha: the target's visit bookkeeping only exists if the compiler saw it referenced (or the `countAllVisits` compile option is on). Divert-target values flowing through function parameters (ink's `function beats(x) ~ return TURNS_SINCE(x)`) are not yet supported. Possibly belongs in the builtins/state section of the master doc.

### count.visits(-> target) — numeric visit count
*Audience:* writer
`count.visits(-> target)` returns how many times a container has been entered, by any route (divert, tunnel, or thread spawn).
```sparkdown
{count.visits(-> aside)}
<- aside
{count.visits(-> aside)}
```
*Output:* 0 / Inside aside. / 1
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/builtins/read-count-across-thread.sd`, `packages/sparkdown/src/tests/runtime/Builtins.test.ts`
Thread spawns (`<- aside`) increment the count just like diverts. Tunnels (`-> second ->` ... `->->`) do not double-count the calling scene. Possibly belongs in the builtins/state section of the master doc.

### count.visited(-> target) — boolean visited check
*Audience:* writer
`count.visited(-> target)` returns a genuine boolean: has the reader ever entered `target`? Usable in interpolation, `if` conditions, and with `not`.
```sparkdown
{count.visited(-> aside)}
<- aside
{count.visited(-> aside)}
if not count.visited(-> elsewhere) then
  Never been there.
end
```
*Output:* false / Inside aside. / true / Never been there.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/builtins/visited-shorthand.sd`, `packages/sparkdown/src/tests/runtime/Builtins.test.ts`
Lowers to `READ_COUNT(t) > 0`. Needed because a 0 read count is NOT falsy under Lua truthiness (only nil/false are), so `if count.visits(-> t) then` would always be true — use `visited` for the boolean question. Possibly belongs in the builtins/state section of the master doc.

### Bare-name visit-count interpolation
*Audience:* writer
Interpolating a container name directly — `{first}` for a scene, `{hi.stitch_to_count}` for a branch inside a scene (dotted path), `{gather}` for a `label` — prints that container's visit count.
```sparkdown
-> first
scene first
  1) Seen first {first} times.
  -> second ->
  2) Seen first {first} times.
  done
end
```
*Output:* `1) Seen first 1 times.` / `In second.` / `2) Seen first 1 times.`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/builtins/read-count-across-callstack.sd`, `packages/sparkdown/src/tests/runtime/fixtures/builtins/read-count-dot-separated-path.sd`, `packages/sparkdown/src/tests/runtime/fixtures/builtins/visit-count-bug-nested-containers.sd`, `packages/sparkdown/src/tests/runtime/Builtins.test.ts`
Divergence from ink: `-> hi` does NOT auto-route to the first branch/stitch inside `scene hi` — you must divert explicitly to `-> hi.stitch_to_count`. Labels created with `label name` count once per entry; re-reading `{gather}` after a choice still shows 1 because the label was only entered once. Possibly belongs in the builtins/state section of the master doc.

### Divert targets as values + READ_COUNT(x)
*Audience:* advanced
A divert target is a first-class value: `store x = -> knot` stores it, `-> x(1) ->` tunnels through it with arguments, and `READ_COUNT(x)` / `READ_COUNT(-> knot)` / bare `{knot}` all read the underlying scene's visit count. Scenes take parameters: `scene knot(a)` with `{a}` in the body.
```sparkdown
store x = -> knot
Count start - {READ_COUNT(x)} {READ_COUNT(-> knot)} {knot}
-> x(1) ->
-> x(2) ->
Count end - {READ_COUNT(x)} {READ_COUNT(-> knot)} {knot}
```
*Output:* `Count start - 0 0 0` / `1` / `2` / then with a third `-> x(3) ->` call, `Count end - 3 3 3`.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/builtins/read-count-variable-target.sd`, `packages/sparkdown/src/tests/runtime/Builtins.test.ts`
The ALL-CAPS ink builtins (READ_COUNT, TURNS, TURNS_SINCE, RANDOM, SEED_RANDOM) keep their ink names today; only the math family and count.* got Luau-style aliases (per the Builtins.test.ts header). Possibly belongs in the builtins/flow section of the master doc.

### math.floor / math.ceil — Luau-named math builtins
*Audience:* advanced
Math builtins use Luau names: `math.floor(x)`, `math.ceil(x)` (also math.pow, math.min, math.max, math.random, math.randomseed per the test header). Calls nest: `math.floor(math.ceil(1.2))`.
```sparkdown
{math.floor(1.2)}
{math.ceil(1.2)}
{math.floor(math.ceil(1.2))}
```
*Output:* 1 / 2 / 2
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/builtins/floor-ceiling-and-casts.sd`, `packages/sparkdown/src/tests/runtime/Builtins.test.ts`
Divergence from ink: replaces ink's all-caps FLOOR/CEILING/POW/MIN/MAX. There is no INT() cast — math.floor covers the truncating-int role. Mapped onto the runtime's native ops via stdlibMapping.ts. Possibly belongs in the builtins/expressions section of the master doc.

### Visit-count tracking is opt-in (countAllVisits compile option)
*Audience:* integrator
The compiler only records visit counts for containers the source references via READ_COUNT / `{name}` / TURNS_SINCE. The `countAllVisits: true` compile option forces bookkeeping on every container — required when counts are read only at runtime (labeled-choice TURNS_SINCE targets, or host-side VisitCountAtPathString).
```sparkdown
label gather
{gather}
choose
  + choice
end
{gather}
```
*Output:* 1, then (after picking) choice / 1 — but only when compiled with `countAllVisits: true`; without it these counts read 0 forever.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/builtins/visit-count-bug-nested-containers.sd`, `packages/sparkdown/src/tests/runtime/fixtures/builtins/turns-since-nested.sd`, `packages/sparkdown/src/tests/runtime/fixtures/builtins/visit-counts-when-choosing.sd`, `packages/sparkdown/src/tests/runtime/Builtins.test.ts`
Mirrors inkjs's `compileStory(name, true)` second argument. Gotcha for hosts: TURNS_SINCE reads visit counts at runtime, after compile-time tracking has already been decided. Possibly belongs in the integrator/compile-options section of the master doc.

### Methods on tables (`function a.f` / `function a:m` and `self`)
*Audience:* advanced
`function a.f(p) ... end` desugars to `a.f = function(p) ... end`; `function a:m(p) ... end` adds an implicit `self` bound to the receiver. Multi-level paths work (`function a.b.c.f`). Calls dispatch via `a.f(...)`, `a:m(...)`, chained colon calls (`a:add(10):add(20).x` — receiver evaluated exactly once), and method-call-then-index (`a:m()[2]`, `a:get().x`). Outside method bodies `self` is an ordinary variable.
```sparkdown
a = {i = 10}
function a:x (x) return x + self.i end
assert(a:x(1) == 11)
```
*Output:* Passes — self is the receiver, so 1 + 10.
*Sources:* `packages/sparkdown/src/tests/luau-conformance/PropertyTargetFunctionDefinition.test.ts`, `packages/sparkdown/src/tests/luau-conformance/MethodCallValueDispatch.test.ts`, `packages/sparkdown/src/tests/luau-conformance/MethodCallChain.test.ts`, `packages/sparkdown/src/tests/luau-conformance/CallAdjustments.test.ts`, `packages/sparkdown/src/tests/luau-conformance/VariadicFirstClass.test.ts`
Documented limitation: property-target function definitions get a bare closure without upval-capture wrapper, so outer locals reassigned after the declaration aren't seen. Colon-form dispatch through user table methods was historically partial — dot-form `a.method()` is fully supported. Possibly belongs in the Luau/code section of the master doc.

### Metatables and metamethods
*Audience:* advanced
`setmetatable(t, mt)` / `getmetatable(t)`; `setmetatable(t, nil)` clears; `__metatable` locks and hides. Supported metamethods: `__index` (table-form chains and function-form), `__newindex` (both forms), arithmetic (`__add`, `__sub`, `__unm`, `__idiv`), comparison (`__eq` with Lua's same-handler rule, `__lt`, `__le`), `__len`, `__tostring`, `__call` (including callable tables through pcall), `__namecall` (colon-call fallback on newproxy userdata), and `__iter`.
```sparkdown
local parent = { x = 10, y = 20 }
local child = setmetatable({}, { __index = parent })
host_record(child.x)
```
*Output:* 10 — lookup falls through to the parent via __index.
*Sources:* `packages/sparkdown/src/tests/luau-conformance/Metatables.test.ts`, `packages/sparkdown/src/tests/luau-conformance/MetamethodDispatch.test.ts`, `packages/sparkdown/src/tests/luau-conformance/LuaArithmetic.test.ts`, `packages/sparkdown/src/tests/luau-conformance/IterProtocol.test.ts`, `packages/sparkdown/src/tests/luau-conformance/LuaArgSemantics.test.ts`
`__eq` follows Lua's getequalhandler rule: identity first, handler only when both operands share the SAME `__eq` value. `newproxy(true)` creates userdata whose type cannot be spoofed via a `__type` field. Possibly belongs in the Luau/code section of the master doc.
## Integrator features, divergences & known-unsupported

> Verification note: several `packages/sparkdown/docs/runtime/*.md` files (DIVERGENCES.md, DEFERRED.md, FUNCTIONS.md, METHODS.md) are stale relative to the test suite. Where a doc claim contradicted a passing runtime test, the test was opened and the test's assertion is stated as the verified truth, with the deciding file cited. Entries 27-32 below document features the docs still list as missing/broken that are verifiably working today.

### Reserved keywords and their escape hatches
*Audience:* writer
Alternator keywords (`queue`, `cycle`, `chain`, `shuffle`, `match`, `plural`) are reserved at statement/expression start. Escape hatches: (1) a `.` accessor after the word makes it a plain variable (`cycle.position`, `plural.category(n)` — even with whitespace before the dot: `plural .category(n)`); (2) identifiers merely *containing* a reserved word are fine (`check_plural`); (3) declaring `function plural(n)` is allowed. But a bare call `match(x)` is captured as a match-alternator block, not a function call.
```sparkdown
function check(x: number)
  match(x)
end
```
*Output:* The `match(x)` line parses as LuauConditionalAlternatorBlock — the intended function call is swallowed by the alternator grammar.
*Sources:* `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/reserved-keywords/cycle-as-access-path.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/reserved-keywords/queue-as-access-path.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/reserved-keywords/shuffle-as-access-path.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/reserved-keywords/match-as-access-path.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/reserved-keywords/plural-as-access-path.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/reserved-keywords/plural-with-whitespace-before-accessor.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/reserved-keywords/identifier-containing-reserved-word.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/reserved-keywords/plural-as-function-name.sd`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/reserved-keywords/match-as-name-rejected.sd`, `packages/sparkdown/language/sparkdown.language-grammar.json`
Full keyword inventory from the grammar file: flow beats `scene`, `branch`; flow modules `include`, `run`; flow terminators `done`, `fin`; scope modifiers `store`, `local`, `const`; access modifiers `read`, `write`; declarations `define`, `function`; alternators `queue`, `cycle`, `chain` (sequential), `shuffle` (modifier), `match`, `plural` (conditional); Luau control `do`, `if`, `then`, `elseif`, `else`, `for`, `while`, `repeat`, `until`, `break`, `continue`, `in`, `goto`, `return`, `end`, `and`, `or`, `not`, `require`, `export`; primitive types `nil`, `string`, `number`, `boolean`, `thread`, `vector`, `buffer`, `unknown`, `never`, `any`; image control `show`, `hide`, `animate` + clauses `over`, `after`, `with`, `wait`, `ease`; audio control `play`, `stop`, `fade`, `queue`, `await` + clauses `over`, `after`, `to`, `loop`, `once`, `mute`, `unmute`, `now`; stdlib namespaces `bit32`, `coroutine`, `debug`, `math`, `os`, `string`, `table`, `task`, `utf8`, `buffer`, `vector`, `system`, `count`, `lang`, `plural`; stdlib functions `assert`, `collectgarbage`, `error`, `gcinfo`, `getfenv`, `getmetatable`, `ipairs`, `loadstring`, `newproxy`, `next`, `pairs`, `pcall`, `print`, `rawequal`, `rawset`, `require`, `select`, `setfenv`, `setmetatable`, `tonumber`, `tostring`, `type`, `typeof`, `unpack`, `xpcall`; globals `_G`, `_VERSION`. Additionally, names in LUAU_STANDARD_LIB_FUNCTIONS cannot be used as `external` binding names. Ink's briefly-exposed `has`/`hasnt` are no longer reserved and are usable as identifiers.

### Glued reserved-word access is not an alternator
*Audience:* writer
Between glue dots, a reserved alternator word followed by a `.` accessor parses as a function call/property access, not an alternator arm list. The `|` arm separator is what makes an inline glued fragment an alternator; a `.` accessor after the keyword routes to expression parsing.
```sparkdown
x .. plural.category(n) ..
```
*Output:* Parses as a glued expression access (call to `plural.category`), not an inline alternator.
*Sources:* `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/reserved-keywords/inline-glued-plural-access-not-alternator.sd`

### Flow diagnostics: bad diverts, empty diverts, name collisions, unreachable code
*Audience:* writer
The compiler reports flow mistakes: `-> nowhere` (unresolvable target) is a "not found" error; a bare `->` with no target outside a choice is an "Empty diverts" warning; `store knot = 0` plus `scene knot` is a "Duplicate identifier" error.
```sparkdown
-> main
scene main
  -> nowhere
```
*Output:* Compile error containing "not found" (no story runs).
*Sources:* `packages/sparkdown/src/tests/runtime/Diverts.test.ts`, `packages/sparkdown/src/tests/runtime/Knots.test.ts`, `packages/sparkdown/src/compiler/lower/lowerers/lowerDoneOrFin.ts`
The fallback-choice form `* ->` is legal and does not trip the empty-divert warning. Unreachable code after `done`/`fin` is a Hint-severity "Unnecessary" diagnostic rendered as greyed-out text in editors. Note: ink-style loose-end/end-of-content validation is intentionally disabled (per skipped Misc tests).

### Relaxed compile-time checks for Luau code (errors happen at runtime)
*Audience:* advanced
Wrong-arity stdlib calls (`math.abs()`), unresolved dotted paths (`_G.bar`), and calls to undefined globals compile with warnings instead of errors, matching Luau's call-site/runtime error model — `if false then unknown() end` is legal. Reachable bad calls fail at runtime with trappable errors.
```sparkdown
function helper() return 1 end
if false then
  unknown_global()
end
assert(helper() == 1)
```
*Output:* Compiles and passes — the unreachable unknown call never errors.
*Sources:* `packages/sparkdown/src/tests/luau-conformance/NativeArityRelaxed.test.ts`, `packages/sparkdown/src/tests/luau-conformance/GCStubAndUnresolvedCall.test.ts`
Ink-style explicit diverts (`-> nowhere`) keep the compile-time "target not found" error — there is no Luau equivalent to relax.

### Deprecated-stdlib strikethrough diagnostics
*Audience:* advanced
Calling a Luau-deprecated stdlib entry (`table.getn`, `math.pow`, global `unpack`, `table.foreach`/`foreachi`) emits an Information-severity diagnostic tagged Deprecated (editor strikethrough) that suggests the replacement (`^` for `math.pow`, `table.unpack` for `unpack`). The call still runs.
```sparkdown
host_record(math.pow(2, 8))
```
*Output:* 256, plus an editor-only deprecation hint suggesting `^`.
*Sources:* `packages/sparkdown/src/tests/luau-conformance/DeprecatedStdLib.test.ts`, `packages/sparkdown/src/tests/luau-conformance/StdlibBatch1.test.ts`

### Host error hooks and file:line error formatting
*Audience:* integrator
Hosts receive runtime errors via `story.onError`; compile diagnostics arrive with LSP severities (1 Error, 2 Warning, 3 Info, 4 Hint) and tags (Deprecated, Unnecessary). Setting `story.errorMessageFormatter = (story, raw) => ...` opts into prefixing `error()` messages Luau-style (`file:line: msg`); per-statement debug metadata makes the line exact.
```sparkdown
local ok, err = pcall(function() error("oops") end)
assert(err == "basic.luau:1: oops", "got " .. tostring(err))
```
*Output:* Passes when the host installs the formatter with fixture name "basic.luau".
*Sources:* `packages/sparkdown/src/tests/luau-conformance/ErrorMessageFormat.test.ts`, `packages/sparkdown/src/tests/luau-conformance/PerStatementSourceMapping.test.ts`, `packages/sparkdown/src/tests/luau-conformance/conformanceTestHarness.ts`, `packages/sparkdown/src/tests/luau-conformance/DeprecatedStdLib.test.ts`
Production LSP leaves the formatter unset.

### `external` function declarations
*Audience:* integrator
`external name(params)` on a single line at top level (file scope only — not allowed behind `&` or inside scenes/branches) declares a host-implemented function. Call sites use the normal forms: `& name(args)` for side effects, `{name(args)}` for values, or plain calls from inside a `function` body (`return gameInc(x)`).
```sparkdown
external message(x)
external multiply(x, y)
external times(i, str)

& message("hello world")
{multiply(5.0, 3)}
{times(3, "knock ")}
```
*Output:* `15` then `knock knock knock` (the host's bound `message` receives "hello world").
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/bindings/external-binding.sd`, `packages/sparkdown/src/tests/runtime/fixtures/bindings/game-ink-back-and-forth.sd`, `packages/sparkdown/src/tests/runtime/Bindings.test.ts`, `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/luau-function/external-declaration.sd`, `packages/sparkdown/src/tests/luau-conformance/BareCalls.test.ts`, `packages/sparkdown/src/tests/luau-conformance/NestedSiblingCalls.test.ts`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/luau/redundant-discard-prefix.sd`, `packages/sparkdown/docs/runtime/RUNTIME.md`
Divergence from ink: lowercase `external` replaces ink's `EXTERNAL`. The declaration registers a signature; call sites are ordinary FunctionCall lowering with the Divert.isExternal flag flipped. External declarations are recognized by the closure-capture scan, so nested functions can call them directly. Names in LUAU_STANDARD_LIB_FUNCTIONS (`assert`, `print`, `tostring`, ...) cannot be used as external names. The formatter normalizes `external host_record ( v )` back to `external host_record(v)` (no space before the paren). The `external host_record(v)` + BindExternalFunction pattern is the standard harness used throughout the conformance and serialization suites.

### `BindExternalFunction` host API and the `lookaheadSafe` flag
*Audience:* integrator
The host implements a declared external with `story.BindExternalFunction(name, fn, lookaheadSafe?)`. Return values are coerced and pushed onto the evaluation stack. With `lookaheadSafe = true` the glue-detection lookahead may call the function speculatively (host can see 2 invocations for 1 logical call); with `false` the runtime breaks out of lookahead, guaranteeing exactly 1 invocation.
```sparkdown
external myAction()

One
& myAction()
Two
done
```
*Output:* `One` / `Two` — with lookaheadSafe=true the host's callback runs 2x, with false exactly 1x.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/bindings/lookup-safe-or-not.sd`, `packages/sparkdown/src/tests/runtime/fixtures/bindings/external-binding.sd`, `packages/sparkdown/src/tests/runtime/Bindings.test.ts`, `packages/sparkdown/docs/runtime/RUNTIME.md`
Use lookaheadSafe=false for externals with real side effects. If a declared external is called but never bound, the first Continue throws "Missing function binding for external" (auto-validation via `ValidateExternalBindings`). `UnbindExternalFunction` also exists. Ink's `ref` parameters don't exist — tables pass by reference, primitives by value.

### External-function fallbacks (`allowExternalFunctionFallbacks`)
*Audience:* integrator
If the host sets `story.allowExternalFunctionFallbacks = true` and leaves an external unbound, a same-named in-script `function NAME() ... end` runs instead.
```sparkdown
external TRUE()

Phrase 1
if TRUE() then
  Phrase 2
end
fin

function TRUE() return true end
```
*Output:* `Phrase 1` / `Phrase 2` (with `story.allowExternalFunctionFallbacks = true`).
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/newlines/external-fallback.sd`, `packages/sparkdown/src/tests/runtime/Newlines.test.ts`, `packages/sparkdown/src/tests/runtime/DefineClasses.test.ts`

### Left glue (`..`) across external-call lookahead
*Audience:* integrator
A line beginning with `..` carries left glue (sparkdown's marker where ink uses `<>`). When an external call sits before a glued line, the lookahead-safe runtime path snapshots state at the newline, calls the external speculatively while peeking, then rewinds when the glue forces re-evaluation — output ordering is preserved.
```sparkdown
external myAction()

One
& myAction()
.. Two
```
*Output:* `One` / `Two`
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/bindings/lookup-safe-or-not-with-post-glue.sd`, `packages/sparkdown/src/tests/runtime/Bindings.test.ts`
Divergence from ink: `..` replaces ink's `<>` glue marker. Possibly belongs in the display/glue section of the master doc, but the lookahead interaction is integrator-facing.

### `EvaluateFunction` host API (host calls story functions, re-entrant)
*Audience:* integrator
`story.EvaluateFunction(name, args, returnTextOutput?)` invokes a sparkdown `function` from the host. With the third arg true it returns `{ returned, output }`. Fully re-entrant: a bound external can call EvaluateFunction mid-call (host → story → host → story), and calling it between `Continue()` calls — even inside a tunnel — leaves the narrative state intact.
```sparkdown
function add(x, y)
  return x + y
end
```
*Output:* `story.EvaluateFunction("add", [1, 2], true)` → `{ returned: 3, output: "" }`; a function with no return yields `returned: null`; `return -> somewhere` comes back as the string `"-> somewhere"`.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/evaluation/evaluating-functions-from-host.sd`, `packages/sparkdown/src/tests/runtime/fixtures/evaluation/function-variable-state.sd`, `packages/sparkdown/src/tests/runtime/fixtures/bindings/game-ink-back-and-forth.sd`, `packages/sparkdown/src/tests/runtime/Evaluation.test.ts`, `packages/sparkdown/src/tests/runtime/Bindings.test.ts`
Documented divergence from ink: because sparkdown functions are pure (no narrative emission), the `output` field is always `""`; ink knot-functions could emit text into it.

### `variablesState` get/set and enumeration host API
*Audience:* integrator
The host reads and writes declared `store` globals via `story.variablesState[name]`. Reads return the current value; writes accept int, float, and string; reading an unknown name returns null; writing an undeclared name throws; writing an unsupported type (e.g. a Map) throws. `variablesState` is a Proxy-backed map: `Object.keys(variablesState)` lists every declared global in declaration order.
```sparkdown
store x = 5
store i = 0
scene main
  label start
  {x}
```
*Output:* After `state["x"] = 8.5` and advancing a choice, the next `{x}` prints `8.5`; `state["z"] === null`; `state["y"] = "earth"` throws (y undeclared).
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/variables/variable-get-set-api.sd`, `packages/sparkdown/src/tests/runtime/fixtures/variables/set-non-existent-variable.sd`, `packages/sparkdown/src/tests/runtime/Variables.test.ts`, `packages/sparkdown/src/tests/runtime/fixtures/bindings/variable-observer.sd`, `packages/sparkdown/src/tests/runtime/Bindings.test.ts`
API inherited from inkjs. The fixture drives it across a choose-block loop, mutating x between choice picks (5 → 10 → 8.5 → "a string").

### Variable observers (`ObserveVariable`)
*Audience:* integrator
`story.ObserveVariable(name, (varName, newValue) => ...)` fires the callback every time the named `store` global is assigned (including from choice bodies).
```sparkdown
store testVar = 5
store testVar2 = 10
Hello world!
& testVar = 15
choose
  + choice
then
  & testVar = 25
end
```
*Output:* Observer fires once with newValue=15 during the first Continue burst, again with 25 after the choice.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/bindings/variable-observer.sd`, `packages/sparkdown/src/tests/runtime/Bindings.test.ts`
`store` is sparkdown's `VAR`; runtime registration is identical to inkjs (VariableAssignment kind="global"). Observers do not fire for the initial declaration value.

### Host navigation: `ChoosePathString` and `VisitCountAtPathString`
*Audience:* integrator
The host can jump the story to any named container with `story.ChoosePathString("SomeScene", true, [])` and query visit counts with `story.state.VisitCountAtPathString("SomeScene")`. Jumping mid-scene cleanly resets the call stack — the abandoned scene's remaining lines never run. Counts increment only when control actually enters the container.
```sparkdown
scene RunAThing
  The first line.
  The second line.
  done
end
scene SomewhereElse
  somewhere else
  fin
end
```
*Output:* Continue() → `The first line.\n`; after ChoosePathString("SomewhereElse"): `somewhere else\n` (never `The second line.`). VisitCountAtPathString goes 0 → 1 after the jump; a choice's divert target stays 0 until Continue()d into.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/callstack/clean-callstack-reset-on-path-choice.sd`, `packages/sparkdown/src/tests/runtime/CallStack.test.ts`, `packages/sparkdown/src/tests/runtime/fixtures/builtins/visit-counts-when-choosing.sd`, `packages/sparkdown/src/tests/runtime/Builtins.test.ts`
Runtime API inherited from inkjs StoryState. Requires the `countAllVisits` compile option when the script itself never reads the counts. Divergence from ink noted in CallStack.test.ts: the upstream fixture wraps the narrative in an ink function, but sparkdown functions are expression-only — a callable that emits narrative must be a scene.

### Multiple parallel flows (`SwitchFlow` / `RemoveFlow`)
*Audience:* integrator
Host API, no .sd syntax: `story.SwitchFlow(name)` swaps the active callstack/output/choices to a named flow (created on first use); `story.RemoveFlow(name)` disposes one and falls back to the default flow. Each flow advances independently via Continue/ChoosePathString.
```sparkdown
scene knot1
  knot 1 line 1
  knot 1 line 2
  fin
end
```
*Output:* Interleaved: First flow Continue → `knot 1 line 1\n`, Second → `knot 2 line 1\n`, back to First → `knot 1 line 2\n` — per-flow state is isolated; switching back preserves that flow's currentText and currentChoices.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/multiflow/multi-flow-basics.sd`, `packages/sparkdown/src/tests/runtime/Multiflow.test.ts`
Runtime machinery inherited from inkjs (SwitchFlow_Internal/_namedFlowsDict); no sparkdown compile work involved. Use case: run "Conversation A" alongside "Conversation B" and resume each where it left off. No author-facing doc coverage of this surface exists yet (see gaps).

### Save/restore: `ToJson` / `LoadJson` with store-only serialization
*Audience:* integrator
Hosts save via `story.state.ToJson()` and restore via `state.LoadJson(json)`; `story.ResetState()` clears before a load. Only `store`-marked state persists (plus narrative flow position, read counts, and the random seed — locals are never saved). Named defines write just the changed store delta (merged over init-reconstructed defaults on load); `new` instances write store props + a `defref` class name and relink `__index` to the LIVE class global on load.
```sparkdown
define companion with
  store trust = 5
end
define O as companion with
  name = "Orion"
end
```
*Output:* After `O.trust = O.trust - 1`, save, and load into a fresh story: `O.trust == 4` AND `O.name == "Orion"` (non-store prop survives via merge). The save contains no method bodies or non-store defaults.
*Sources:* `packages/sparkdown/src/tests/runtime/StoreOnlySerialization.test.ts`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`, `packages/sparkdown/docs/runtime/DEFERRED.md`, `packages/sparkdown/docs/runtime/FUNCTIONS.md`
A define with no store props writes nothing to the save. Class identity after load is rawequal to the live global type table. Integrator quirks: whole-number floats serialize as the string `"7.0f"` (JSON has no int/float distinction) — do NOT `JSON.stringify` the compiled program or you mangle it; use `story.ToJson(writer)` or pass the parsed object. `SparkdownCompiler.compile()` deletes `result.story` — construct `new RuntimeStory(program.compiled)`. Function values are never serializable, and identity-KEYED table entries (tables/functions as keys) can't round-trip. Undeclared Lua-style dynamic globals now load correctly (was a bug). Story exposes `onWriteRuntimeObject` for source-map-style save debugging.

### Reference-identity table serialization (aliases, cycles, freeze, length hints)
*Audience:* integrator
Saves preserve Lua reference semantics: each distinct table serializes once (tagged `objid: N`), later occurrences write `{objref: N}`. Aliased tables load as ONE table; cyclic tables (`t.self = t`) save without recursing and load intact; instances share one class table after load.
```sparkdown
t = { n = 1 }
alias = t
```
*Output:* After save/load: `rawequal(t, alias) == true`; writing `alias.n = 99` makes `t.n` read 99.
*Sources:* `packages/sparkdown/src/tests/runtime/TableSerialization.test.ts`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`
`table.freeze` state (`frz` on the wire) and `#` capacity/border hints also round-trip (a `table.create(10)` with a hole still reports `#arr == 10` after load). Two saves from the same state are byte-identical and each load is an independent identity session.

### Save/load across flows and threads
*Audience:* integrator
`story.state.ToJson()` / `LoadJson(saved)` round-trip the full multi-flow state: every named flow's output buffer, choice list, and spawned threads (with captured arguments) survive restore.
```sparkdown
scene blue
  Hello I'm blue
  <- thread1("blue")
  <- thread2("blue")
  done
end
```
*Output:* After LoadJson + SwitchFlow("Blue Flow") + ChooseChoiceIndex(0): `Thread 1 blue choice\nAfter thread 1 choice (blue)\n` — the same save re-loads repeatedly to take different branches.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/multiflow/multi-flow-save-load-threads.sd`, `packages/sparkdown/src/tests/runtime/Multiflow.test.ts`
A save is a resumable branch point: the test loads the same save multiple times to take thread1 vs thread2 in red vs blue flows. After RemoveFlow("Blue Flow"), the next Continue runs the default flow.

### Fallback choices survive save/load
*Audience:* integrator
Fallback (invisible default) choices serialize with `isInvisibleDefault: true` in state JSON, so a ToJson/LoadJson round-trip keeps them hidden from `currentChoices` and still auto-followable on the next Continue.
```sparkdown
<- make_default_choice
Text.

scene make_default_choice
  choose
    + ->
  then
    {5}
    fin
  end
end
```
*Output:* Continue → `Text.\n` with 0 visible choices; after ToJson/LoadJson still 0 choices; next Continue auto-follows the fallback → `5\n`.
*Sources:* `packages/sparkdown/src/tests/runtime/fixtures/choices/state-rollback-over-default-choice.sd`, `packages/sparkdown/src/tests/runtime/Choices.test.ts`
Also pins state rollback over a default choice: isInvisibleDefault must survive the runtime's internal snapshot/restore around fallback resolution (fixed in JsonSerialisation WriteChoice/JObjectToChoice; an absent flag defaults to false for backward compat).

### Line-type tag emission (output-stream contract)
*Audience:* integrator
Every display line is wrapped in a BeginTag / Text("<type>") / EndTag triple BEFORE the body, labeling the line type: `action`, `dialogue:Alice`, `heading`, etc. Ink only emits tags for user-written `#` tags after content.
```sparkdown
dialogue:Alice
```
*Output:* Hosts walking the runtime output stream see an extra metadata tag pair per line, ahead of the text.
*Sources:* `packages/sparkdown/docs/runtime/DIVERGENCES.md`
Glued lines (starting with `..`) skip the line-type tag. Anyone consuming the raw output stream (custom players, exporters) must expect these.

### Logical operators: keyword form only
*Audience:* writer
`and`, `or`, `not` — the symbolic forms `&&`, `||`, `!` do not exist. Short-circuit semantics match Luau.
```sparkdown
(player.alive and not exhausted)
```
*Sources:* `packages/sparkdown/docs/runtime/DIVERGENCES.md`, `packages/sparkdown/docs/runtime/STDLIB.md`
Error messages mention the operator the user actually wrote. Comparison `!=` exists alongside `~=` per the metamethod table (`!=` inverts `__eq`). Possibly belongs in the expressions section of the master doc; kept here as an ink/Luau divergence.

### Membership tests via methods (no `?`/`!?` operators)
*Audience:* advanced
Ink's membership operators `?` / `!?` (and the briefly-exposed `has`/`hasnt` keywords) are removed. Element membership: `list:find(item) ~= nil`. Non-membership: `list:find(item) == nil`. Subset test: `set:intersection(subset):len() == subset:len()`.
```sparkdown
list:find(item) ~= nil
```
*Sources:* `packages/sparkdown/docs/runtime/DIVERGENCES.md`
Rationale: ink's `?` overloaded any-element membership with subset containment depending on operand types; named methods make intent explicit. Related: ink's LIST type is closed by design — sparkdown uses Luau tables plus builtin table methods; ink features with NO equivalent are the LIST_ALL universe, LIST_INVERT, and items with intrinsic ordinals (use `const` instead) — per the skipped `packages/sparkdown/src/tests/runtime/Lists.test.ts`.

### Pure-return colon methods vs mutating `table.*`
*Audience:* advanced
Sparkdown's `t:insert` / `t:remove` / `t:sort` / `t:reverse` return a new value instead of mutating — "the single biggest intentional deviation from Luau". `t:remove` returns the new table, NOT the removed element (use `t:at(i)` first to grab it).
```sparkdown
t:insert(x)
```
*Output:* A new table with x appended; the original t is unchanged.
*Sources:* `packages/sparkdown/docs/runtime/METHODS.md`, `packages/sparkdown/docs/runtime/STDLIB.md`
The namespaced `table.insert(t, x)` / `table.sort(t)` forms keep Luau's mutating semantics — the divergence applies only to the colon-method surface. Docs should teach the distinction explicitly.

### Ink math builtins renamed to Luau stdlib names
*Audience:* advanced
FLOOR→`math.floor`, CEILING→`math.ceil`, POW→`math.pow` (itself deprecated in favor of `^`), MIN→`math.min`, MAX→`math.max`, RANDOM→`math.random`, SEED_RANDOM→`math.randomseed`. Ink's all-caps builtin names do not exist.
```sparkdown
math.floor(x)
```
*Sources:* `packages/sparkdown/docs/runtime/DIVERGENCES.md`, `packages/sparkdown/docs/runtime/STDLIB.md`
Single source of truth is the STDLIB table; the compiler picks up new entries automatically.

### Type annotations parsed but ignored
*Audience:* advanced
Luau type syntax parses — `local x: number = 1`, `function f(x: number): string`, generics, and the cast operator `a :: SomeType` — but the lowerer drops all of it; runtime behavior is identical to unannotated code.
```sparkdown
local x: number = 1
```
*Sources:* `packages/sparkdown/docs/runtime/DIVERGENCES.md`, `packages/sparkdown/docs/runtime/DEFERRED.md`
`::` is a no-op at runtime (`a :: SomeType` lowers to just `a`). Typecheck-only use is fine. Return-type annotations and generics likewise preserved in-tree, ignored at runtime.

### No `ref` parameters (deliberate)
*Audience:* advanced
Ink's `ref` parameter keyword is intentionally absent. Sparkdown follows Luau value/reference semantics: primitives pass by value, tables by reference. For ref-like behavior on a primitive, wrap it in a single-key table and mutate the field, or mutate a `store` global directly.
```sparkdown
store box = {value = 0}
```
*Sources:* `packages/sparkdown/docs/runtime/DIVERGENCES.md`, `packages/sparkdown/src/tests/runtime/Evaluation.test.ts`
A deliberate design choice, not a missing feature. The box-table idiom is verified by the passing `factorial-by-reference` fixture (Evaluation.test.ts, "factorial by reference (table param as pseudo-ref)").

### Loops (`for` / `while` / `repeat` / `do`) — implemented; stale docs say otherwise
*Audience:* advanced
**Verified working, docs stale.** DIVERGENCES.md/DEFERRED.md claim loop bodies are silently dropped by a no-op lowerer stub; the test suite proves otherwise. `while`, numeric `for`, generic `for ... in pairs(t)`, and `repeat ... until` all execute correctly (at least inside function bodies and Luau code context).
```sparkdown
function run()
local n = 0
while n < 3 do
n = n + 1
end
host_record(n)
end
```
*Output:* `host_record` receives 3 — the loop body ran three times and the mutation reached the outer scope (Loops.test.ts "counter mutation reaches outer scope").
*Sources:* `packages/sparkdown/src/tests/luau-conformance/Loops.test.ts`, `packages/sparkdown/src/tests/luau-conformance/LuaLoops.test.ts`, `packages/sparkdown/src/tests/luau-conformance/ForLoopVarCapture.test.ts`, `packages/sparkdown/src/tests/luau-conformance/UpstreamConformance.test.ts`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`, `packages/sparkdown/docs/runtime/DEFERRED.md`
Deciding evidence: Loops.test.ts asserts loop side effects reach the host, and the CI-gated upstream fixture basic.luau (which contains `for b=1,9 do a = a * 2 end` → 512) passes end-to-end. STDLIB.md's `for k, v in pairs(t)` idioms are therefore accurate; DIVERGENCES.md/DEFERRED.md are stale on this point and must be corrected. Caveat: all passing loop tests run inside function bodies or the conformance harness; loops at the top level of narrative flow are not directly evidenced (see conflicts). Whether `continue`/`break` have narrative-flow analogues is also untested.

### First-class functions, closures, anonymous functions — implemented; stale docs say otherwise
*Audience:* advanced
**Verified working, docs stale.** FUNCTIONS.md is headed "design — no implementation yet" and DIVERGENCES.md claims anonymous function expressions produce empty content, but anonymous function literals, closures, and upvalue capture all pass dedicated conformance suites.
```sparkdown
function run()
local f = function(x) return x * 2 end
host_record(f(5))
end
```
*Output:* `host_record` receives 10 (FirstClassFunctions.test.ts, errors empty).
*Sources:* `packages/sparkdown/src/tests/luau-conformance/FirstClassFunctions.test.ts`, `packages/sparkdown/src/tests/luau-conformance/UpvalueFlattening.test.ts`, `packages/sparkdown/src/tests/luau-conformance/TimelyUpvalueClosing.test.ts`, `packages/sparkdown/src/tests/luau-conformance/SelfCaptureInNestedFn.test.ts`, `packages/sparkdown/src/tests/luau-conformance/UpstreamConformance.test.ts`, `packages/sparkdown/docs/runtime/FUNCTIONS.md`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`, `packages/sparkdown/docs/README.md`
Deciding evidence: FirstClassFunctions.test.ts asserts anonymous-function values are created, stored in locals, and called; the CI-gated upstream closure.luau fixture passes end-to-end. docs/README.md ("closures landed") is right; FUNCTIONS.md/DIVERGENCES.md are stale. The runtime emits a "should be marked as: `-> fn`" Warning for unannotated function values — the tests treat it as suppressible noise, and its exact annotation syntax is undocumented (see gaps). Design commitments held: capture-by-reference matching Luau; function values forbidden anywhere store-reachable; no arrow syntax. Note: nested `function NAME ... end` scoping is enclosing-local (diverges from Luau global semantics).

### Multiple assignment — implemented; stale docs say otherwise
*Audience:* advanced
**Verified working, docs stale.** DIVERGENCES.md/DEFERRED.md say `x, y = 1, 2` is parsed but not lowered; the test suite proves multi-target reassignment works, including mixed property/indexer targets and multi-return spread on the last RHS.
```sparkdown
a = {}
a.x, b = 1, 2
assert(a.x == 1 and b == 2)
```
*Output:* Passes (MultiTargetPropertyAssignment.test.ts).
*Sources:* `packages/sparkdown/src/tests/luau-conformance/MultiTargetPropertyAssignment.test.ts`, `packages/sparkdown/src/tests/luau-conformance/MultiReturn.test.ts`, `packages/sparkdown/src/tests/luau-conformance/MultiReturnSpread.test.ts`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`, `packages/sparkdown/docs/runtime/DEFERRED.md`
Deciding evidence: MultiTargetPropertyAssignment.test.ts asserts `a.x, b, a[1] = 1, 2, f()` (upstream attrib.luau line 13) evaluates correctly; the CI-gated attrib.luau fixture passes. A historical bug where property targets silently clobbered the whole table (`a.x = ...` treated as `a = ...`) was fixed via synthetic `__mt_<from>_<i>` temps — the test file documents the mechanism.

### Ternary `if ... then ... else` expression form — implemented; stale docs say otherwise
*Audience:* advanced
**Verified working, docs stale.** DIVERGENCES.md/DEFERRED.md list the Luau `if cond then a else b` EXPRESSION form as not yet implemented; it is lowered to a TernaryExpression emitting conditional content-pointer jumps (`sc:if` / `sc:jump` ControlCommand ops), and only the taken arm's value ops execute.
```sparkdown
if x then y else z
```
*Output:* Evaluates to the taken arm only (side-effect test verifies the untaken arm never executes).
*Sources:* `packages/sparkdown/src/tests/luau-conformance/TernaryExpression.test.ts`, `packages/sparkdown/src/tests/luau-conformance/UpstreamConformance.test.ts`, `packages/sparkdown/docs/runtime/DIVERGENCES.md`, `packages/sparkdown/docs/runtime/DEFERRED.md`, `packages/sparkdown/docs/compiler/GRAMMAR.md`
Deciding evidence: TernaryExpression.test.ts is a passing regression suite and the CI-gated upstream ifelseexpr.luau fixture passes end-to-end. Gotcha preserved from the test header: the unparenthesized nested-condition form parses FLAT (the grammar can't bracket without counting); the lowerer reconstructs the nesting (see lowerTernaryExpression).

### Diverts inside alternator arms — working; DEFERRED.md stale
*Audience:* writer
**Verified working, docs stale.** DEFERRED.md claims a `-> target` inside an alternator arm is stored as literal text; the lowerer now recognizes `ArmDivert` (the alternator-arm context-bounded variant of `Divert`) and routes it through the main lowerer dispatch, producing a real Divert.
```sparkdown
scene main
  start
  {chain | -> next | second visit end}
  -> DONE
end
```
*Output:* `start\narrived\n` — the chain's first arm diverts to scene `next`, which emits "arrived" (smoke.test.ts).
*Sources:* `packages/sparkdown/src/tests/runtime/smoke.test.ts`, `packages/sparkdown/src/tests/runtime/Diverts.test.ts`, `packages/sparkdown/src/compiler/lower/lower.ts`, `packages/sparkdown/docs/runtime/DEFERRED.md`
Deciding evidence: smoke.test.ts "diverts inside alternator arms route through `lower()` dispatch" and Diverts.test.ts "divert to weave points (cross-stitch label lookup + alternator-arm divert)" both pass; per their comments, alternator-arm diverts route through a statement-form `Divert` (see `lowerArms` in `alternatorArms.ts`). The DEFERRED.md workaround advice (hoist the divert into surrounding `if` flow) is obsolete.

### Recursive discard-call hang — fixed
*Audience:* advanced
**Verified fixed, DEFERRED.md stale.** The old bug — `& fn(args)` recursion inside a `function ... end` body never returning — was a grammar issue: `LuauControlBlock` didn't include `LuauExplicitStatement`, so a recursive call inside an `if` body ended up a sibling of the `if` instead of nested inside it. Fixed by adding `LuauExplicitStatement` to the `LuauControlBlock` patterns.
```sparkdown
& count(n - 1)
```
*Output:* The `factorial-by-reference` fixture (recursive `& fn(args)` discard calls inside an `if` body) now runs to completion and prints `120`.
*Sources:* `packages/sparkdown/src/tests/runtime/Evaluation.test.ts`, `packages/sparkdown/src/tests/runtime/Logic.test.ts`, `packages/sparkdown/docs/runtime/DEFERRED.md`, `packages/sparkdown/docs/compiler/GRAMMAR.md`
Deciding evidence: Evaluation.test.ts "factorial by reference (table param as pseudo-ref)" asserts `ContinueMaximally() === "120\n"` and its comment documents the fix; Logic.test.ts "print num" exercises recursive discard-call shapes and passes. Value-returning recursion (`return n * fact(n-1)`) was always fine.

### Predicate methods (reserved, not yet available)
*Audience:* advanced
`t:map(fn)`, `t:filter(fn)`, `t:reduce(fn, init)`, `t:findindex(fn)`, `t:foreach(fn)`, predicate `t:sort(fn)`, predicate-overload `t:find(fn)`, `s:gsub(pat, fn)`, `s:some(fn)` / `s:every(fn)` — names reserved, not implemented.
```sparkdown
t:map(fn)
```
*Sources:* `packages/sparkdown/docs/runtime/METHODS.md`, `packages/sparkdown/docs/runtime/FUNCTIONS.md`
Docs must not promise these. Verified still-absent as of this pass: no test in `packages/sparkdown/src/tests` exercises `:map`/`:filter`/`:reduce`/`:foreach`/`:findindex` — even though first-class functions (the stated blocker) have since landed, the predicate methods themselves have not. `:findindex` will return nil (not -1) on no match, for symmetry with `:find`.

### Unimplemented Luau namespaces: vector, coroutine, task, buffer, loadstring, require, `_G`
*Audience:* advanced
Entire namespaces tracked but unimplemented: `vector.*` (needs a Vector value type), `coroutine.*` (needs fibers/CPS — significant runtime investment), `task.*` (blocked on coroutines + frame loop), `buffer.*` (needs a Buffer value type). `loadstring` returns `(nil, "...loadstring is not supported in sparkdown")` for every chunk (stories are precompiled — no runtime compiler); `require` is TBD; `_G` awaits the class registry.
```sparkdown
coroutine.create(f)
```
*Output:* A clear "not yet" error rather than a silent not-found.
*Sources:* `packages/sparkdown/docs/runtime/STDLIB.md`, `packages/sparkdown/src/tests/luau-conformance/UpstreamConformance.test.ts`, `packages/sparkdown/src/tests/luau-conformance/upstreamPatches.ts`, `packages/sparkdown/src/tests/luau-conformance/Run.test.ts`
The conformance suite's documented skip classes match: coroutines (yield/resume/wrap), buffers, vectors, native 64-bit integers, userdata internals, native codegen, real GC/weak tables, runtime compiler (loadstring), per-function setfenv, and the RFC `class` syntax. In place of `require`, the `run "path"` statement loads and executes a `.luau` file — verified end-to-end (happy path plus missing-file and cycle-detection failure modes) in Run.test.ts. Also unimplemented metamethods: `__iter`, `__idiv`.

### GC stubs and no weak tables
*Audience:* advanced
`collectgarbage(...)` and `gcinfo()` are no-op stubs returning 0 — sparkdown runs on the JS garbage collector, so code can't force collection or query memory, but the calls succeed instead of erroring. The `__mode` weak-table metamethod has no effect.
```sparkdown
collectgarbage()
assert(collectgarbage("count") == 0)
```
*Output:* Passes.
*Sources:* `packages/sparkdown/src/tests/luau-conformance/GCStubAndUnresolvedCall.test.ts`, `packages/sparkdown/src/tests/luau-conformance/upstreamPatches.ts`, `packages/sparkdown/docs/runtime/STDLIB.md`
Conflict resolved: STDLIB.md lists `collectgarbage`/`gcinfo` as "structurally infeasible — never coming", but the runtime tests show they exist as callable no-op stubs (return 0) rather than being absent — the stub behavior is the verified truth (GCStubAndUnresolvedCall.test.ts). Real GC control and weak tables remain permanently unavailable; upstream fixtures that spin until a weak reference is collected are patched or skipped.

### Environment functions: getfenv works, setfenv/loadstring don't
*Audience:* advanced
`getfenv()` returns the (single) global environment; assigning `getfenv().math = {...}` overrides even statically-lowered `math.*` call sites. But per-function environments (`setfenv(f, env)`) are NOT representable, and runtime compilation (`loadstring`) is not supported.
```sparkdown
getfenv().math = { abs = function(n) return n * n end }
host_record(math.abs(negfive))
```
*Output:* 25 — the environment override redirects `math.abs`.
*Sources:* `packages/sparkdown/src/tests/luau-conformance/LuaArgSemantics.test.ts`, `packages/sparkdown/src/tests/luau-conformance/upstreamPatches.ts`, `packages/sparkdown/src/tests/luau-conformance/UpstreamConformance.test.ts`
Conflict resolved: STDLIB.md marks `getfenv` structurally infeasible, but LuaArgSemantics.test.ts proves the zero-arg global-environment form works — only per-function `setfenv` is infeasible. Upstream fixtures relying on setfenv/loadstring (locals.luau, literals.luau, errors.luau) are skipped or patched.

### Display-layer lowerer gaps: styling markers, `<style>` commands, dialogue metadata
*Audience:* writer
At the compiler level: bold `**`, italic `*`, underline `__`, centered `^^`, raw backtick, and emphasis tilde/colon currently pass through as literal punctuation in the Text run; `<style>...</style>` inline TextCommands are not handled; dialogue character parenthetical `N (whisper):` and position `N [LEFT]:` are not captured into tags.
```sparkdown
N (whisper):
```
*Sources:* `packages/sparkdown/docs/runtime/DEFERRED.md`
Caution: styling markers may still be rendered by the downstream player — DEFERRED.md only establishes that the LOWERER doesn't process them; verify player behavior before documenting styling syntax. Possibly belongs in the display/dialogue section of the master doc.

### Upstream Luau conformance baseline (22 fixtures gated green)
*Audience:* advanced
The vendored official Luau conformance suite runs verbatim through the harness. 22 fixtures pass end-to-end and are CI-gated: assert, attrib, basic (1018 lines of fundamentals), bitwise, calls, clear, closure, constructs, datetime, ifelseexpr, iter, math, move, pm, sort, strconv, stringinterp, strings, tables, tpack, utf8, vararg.
```sparkdown
assert((function() local a = 1 for b=1,9 do a = a * 2 end return a end)() == 512)
```
*Output:* basic.luau (source of this line) passes end-to-end.
*Sources:* `packages/sparkdown/src/tests/luau-conformance/UpstreamConformance.test.ts`, `packages/sparkdown/src/tests/luau-conformance/upstreamPatches.ts`, `packages/sparkdown/src/tests/luau-conformance/_probe.test.ts`, `packages/sparkdown/src/tests/luau-conformance/upstream/VENDORING.md`
Documented skip-class divergences (unimplemented by design or infra): coroutines, buffers, vectors, native 64-bit integers, userdata internals, native codegen, real GC/weak tables, runtime compiler (loadstring), per-function setfenv, and the RFC `class` syntax (intentional — sparkdown's OOP path is `define`). The only source-level patches are for pairs iteration order (insertion vs hash), loadstring, byte-escape rewrites, and workload sizing.

### Formatter canonicalization contract
*Audience:* writer
Format-on-save normalizes to one canonical shape: 2-space indentation, tabs converted to spaces (including mid-line tabs in code), 2+ consecutive blank lines collapsed to one, exactly one blank line inserted between back-to-back top-level blocks, trailing whitespace trimmed, final newline enforced.
```sparkdown
function f()
  return 1
end
function g()
  return 2
end
```
*Output:* A blank line is inserted between `end` and `function g()` (and between adjacent scenes). The `-messy` and `-tight` sample variants format byte-identically to the canonical sample; formatting is proven idempotent, and incremental (delta) formatting equals a full format byte-for-byte.
*Sources:* `packages/sparkdown-language-server/src/tests/formatter/formatSnapshot.test.ts`, `packages/sparkdown-language-server/src/tests/formatter/deltaFormatEquivalence.test.ts`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/misc/extra-blanks.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/blanklines/back-to-back-top-level.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/whitespace/mid-line-tabs.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/stress/spark-tale-sample-messy.sd`, `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/stress/spark-tale-sample-tight.sd`
Harness: each `<name>.sd` fixture is raw input, the sibling `<name>.formatted.sd` is the committed formatter output — whatever whitespace survives in a `.formatted.sd` is author-significant by design (relevant because whitespace is significant in dialogue). Possibly belongs in a tooling/editor section of the master doc.

---

## Reader-reported gaps and open questions (deduped, grouped)

### Settled during this consolidation pass (fixture-checked)
- Loops, first-class functions/closures, multiple assignment, ternary expressions, alternator-arm diverts, and the recursive discard-call hang are all VERIFIED WORKING/FIXED — see entries 27-32 above. The corresponding claims in DIVERGENCES.md, DEFERRED.md, and FUNCTIONS.md are stale and should be corrected upstream.
- `tonumber` (flagged unimplemented in a Strings.test.ts comment) now works: the CI-gated upstream fixtures basic.luau, strings.luau, and math.luau all use it and pass (`packages/sparkdown/src/tests/luau-conformance/UpstreamConformance.test.ts`).
- `^` exponentiation associativity: right-associative — the associativity fixture asserts `2 ^ 3 ^ 2` → 512 (Evaluation.test.ts, expected output line 1, "NOT (2^3)^2 = 64" per its own comment). The conflicting "left-assoc, 64" comment in the separate exponentiation test is stale; assertions outrank comments.
- `run "path"` statement (mentioned but undocumented in STDLIB.md): real and tested end-to-end — loads + executes a `.luau` file, with missing-file and cycle-detection diagnostics (`packages/sparkdown/src/tests/luau-conformance/Run.test.ts`).
- STDLIB.md's "structurally infeasible" list is partially wrong: `collectgarbage`/`gcinfo` exist as no-op stubs returning 0, and zero-arg `getfenv()` works (global env only). Only per-function `setfenv`, real GC/weak tables, and `loadstring` remain genuinely unavailable.
- Diverts.test.ts's header comment ("tunnels, tunnel-onwards, inline diverts, divert-target-as-value, divert arguments, and threads are all deferred") is stale — the tests in that same file and Threads.test.ts exercise all of them and pass. Trust the tests, not that header.

### Host-integration gaps
- How a real host (not the test harness) sets the `countAllVisits: true` compile option needed for self-referencing visit counts is not determinable from the reviewed files.
- Multiflow (named flows, multi-flow save/load with threads) has no author- or host-facing doc coverage — it is referenced only via a test name in DEFERRED.md.
- CallValueAsFunction.test.ts is engine-internal: it hand-builds runtime containers (no .sd source) to test the `call` control command (invoking a function via a DivertTargetValue on the evaluation stack; "attempt to call a X value" on non-targets). No author-facing surface syntax exists for calling a function value held in a variable — document as engine/integrator internals only.
- The exact syntax and semantics of the `-> fn` first-class-function annotation hinted at by the filtered warning ("should be marked as: -> fn") in FirstClassFunctions.test.ts is not documented anywhere in the suite.
- `os.time` table-form details and bit32's exact function list were only skimmed via describe titles in Stdlib.test.ts, not read assertion-by-assertion.
- The vendored upstream/conformance/*.luau files were not read line-by-line; features they lock in are captured via the harness, patches, and the sparkdown-authored regression tests that cite them by line number. _probe.test.ts is a committed diagnostic/bisect scratch harness, not a feature test.

### Grammar / reserved-word gaps
- FUNCTIONS.md's advance_time example uses a parameter named `count`, but STDLIB.md/DIVERGENCES.md say `count` is a reserved stdlib namespace that cannot be declared as an identifier — one of the two is wrong; not settled here.
- Comment-form validity per context is not fully pinned: `--` (Luau comments in code contexts; em-dash/front-matter in display), `//` (display-safe line comments), and an apparent trailing-`#` Annotation form all appear in docs with no unified rule. Sparkle element-line inline comments still leak into scalar-prop/array VALUES (lowerer-side fix pending, per project memory).
- Method-call trailing property access (`a:m(x).y`) remains unparsed — visible in the formatter leaving `e = obj.method(a). b . c (d)` partially unnormalized (stress/space-around-accessors.formatted.sd) and in opaque `<CallValueExpression>` snapshot placeholders.
- Five grammar/flow fixtures exist only as .vsc.snap token snapshots with no .sd input (choice-if-gate, divert-target-as-value, divert-with-args, if-dtv, if-simple under `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/flow/`); reconstructed snippets should be re-verified against live .sd files before publication.
- Grammar keyword lists include access modifiers `read`/`write`, flow-module keywords `include`/`run`, and image/audio directive keywords (show/hide/animate, play/stop/fade/queue/await + clause words) with no exercising fixture in the reviewed assignments (`run` since verified via Run.test.ts; the rest need sourcing from other test dirs).
- Sparkdown identifiers follow the LUAU_IDENTIFIER rule (Unicode via \p{L}; cannot start with digits) — extracted from skipped Parser.test.ts/Misc.test.ts; grammar `flags:` fields are doc-only (neither parser reads them).
- The regex literal sigil `@/re/flags` appears in no reviewed fixture; documented only in project memory — must be sourced from other test dirs before inclusion.

### Formatter / tooling gaps
- Inline sequential alternators: `{queue|a|b|c end}` formats to `{queue|a|b|cend}` — cannot tell whether the inline ` end` terminator is optional (making `cend` harmless text) or this is a formatter bug baked into the committed snapshot. UNRESOLVED (also in conflicts).
- `n  ..=  "tail"` formats to `n..= "tail"` — asymmetric spacing around `..=`; intentional or a committed quirk, undeterminable.
- `@ target:` write directive: what `target` refers to (UI element? buffer?) is not determinable from formatter fixtures.
- Whether `scene`/`branch` blocks require a closing `end`: fixtures show both closed and unclosed forms with no stated rule. Related: GRAMMAR.md's forgotten-`end` bail-out recovers at the next scene/branch.
- `done` statement vs `-> DONE` / `-> END` diverts: both appear; behavioral difference not determinable from the formatter suite.
- Formatter-suite stress-sample comments (queue stops, cycle loops, shuffle chain repeats last, etc.) are author prose, not executable assertions — runtime alternator semantics must come from runtime fixtures.
- `then (label)` on choose blocks: what the label is usable for (divert target? read count?) is unshown.
- Screen-tree leaf semantics (`mask shadow_1` as element-plus-argument vs bare `image` as empty element) are inferred from shape only; and the `layout` keyword (per project memory, the current name for element trees) never appears in the reviewed fixtures — only `screen`, `component`, `style`. Which keyword is current is undeterminable from these files.
- No reactive-sparkle spec or sparkle-language material exists in this worktree's repo-root docs/; the sparkle/UI syntax is absent from this inventory.

### Gaps belonging to other sections of the master doc
- String quote semantics (`"..."`/backtick interpolate vs `'...'` literal) are asserted only in the luau-conformance suite, not runtime/display fixtures; backtick interpolation's full rules (nesting, escapes, format specifiers) lack suite-authored assertions. Whether double-quoted strings support `{interpolation}` has no direct fixture. → strings/expressions section.
- The `&` statement-prefix rule (required for `& i = i + 1` and `& -> done` in logic context but not `lang.current = "fr"`; unnecessary for plain calls inside function bodies; whether `& name = value` can DECLARE vs only reassign — it lowers to kind "reassign" even undeclared) is not authoritatively pinned by the reviewed files. → logic/statements section.
- Choice mark semantics (`*` vs `+`, once-only vs sticky), bracketed choice-menu text echo behavior, multiple guards chaining via AND, leading-`{var}` choice-text ambiguity (closed by design; put interpolation after the first non-brace character), and inline alternators inside choice text. → choices section.
- Flat-weave surface syntax (bare `-` gathers, mark-count depth, `- (label)` anchors — DIVERGENCES.md internally contradicts itself; the migration section saying `label NAME` replaces `- (label)` appears current). → weaves section.
- Alternator per-visit semantics (queue vs cycle vs chain vs shuffle; no `once` keyword — once-through is spelled `queue`; `mod` keyword absent by design). → sequences section.
- Whether the engine provides a default `lang` store (pluralization fixtures all declare their own). → localization section.
- `var`/`temp` keywords: ink's VAR maps to `store`, temp to `local`; no `var` keyword appears anywhere reviewed. `const` lowering status is contradictory between DIVERGENCES.md and DEFERRED.md — UNRESOLVED (see conflicts). → variables section.
- `& inventory.star += 1` autovivify-vs-require-declaration failure is an explicitly unresolved DESIGN DECISION — docs should hedge. → variables section.
- Emphasis rules (\* escape suppressing italics is the only evidence), character-name casing for dialogue, `$:`/`^:`/`%:` line rendering, front matter `---`, `\` line-join, `# tag` usage, asset directives `[[...]]`/`((...))` (player-interpreted, opaque to the compiler), and the `tag` token being plain display text. → display/dialogue sections.
- Ink-function purity enforcement diagnostics (no display text/choices/diverts inside `function ... end`) lack a negative fixture in the reviewed slices; quote-character significance inside `{...}` differs from ink (skipped Misc test). → functions section.
- Referenced-but-unreviewed sources likely holding more facts: `packages/sparkdown/docs/compiler/LOWERING.md`, `packages/sparkdown/src/inkjs/README.md`, and the exact empty-thread (`<-` with no target) diagnostic pinned in grammar/flow parse-tree snapshots.

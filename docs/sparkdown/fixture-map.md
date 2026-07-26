# Tutorial fixture map

Backing fixtures per tutorial section — the traceability record behind the
"no claim without a backing fixture" rule (docs-plan ground rule + guideline 3).
Maintainer artifact; not published. Update when a section's claims change.

## Part 1 — Writing Your First Script

### 1.1 — A script is plain text

- `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/implicit-action.sd`
- `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/display/implicit-action-with-plural.sd`
- `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/inline-action.sd`
- `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/display/inline-action.sd`
- `packages/sparkdown/src/tests/runtime/PortInventory.test.ts`

### 1.2 — Dialogue

- `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/dialogue-inline.sd`
- `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/dialogue-inline-empty-body.sd`
- `packages/sparkdown/src/tests/runtime/fixtures/smoke/hello.sd`
- `packages/sparkdown/src/tests/runtime/smoke.test.ts`
- `packages/sparkdown/language/sparkdown.language-grammar.json`

### 1.3 — Your first choice

- `packages/sparkdown/src/tests/runtime/fixtures/choices/weave-options.sd`
- `packages/sparkdown/src/tests/runtime/fixtures/choices/once-only-choices-with-own-content.sd`
- `packages/sparkdown/src/tests/runtime/fixtures/choices/newline-after-choice.sd`
- `packages/sparkdown/src/tests/runtime/Choices.test.ts`

### 1.4 — Blocks and indentation

- `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/block-dialogue.sd`
- `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/block-action.sd`
- `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/block-multiline-trailing-space.sd`
- `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/display/block-dialogue.sd`
- `packages/sparkdown/language/sparkdown.language-grammar.json`

### 1.5 — Beats and line breaks

- `packages/sparkdown/src/tests/runtime/ChainedDialogueBreak.test.ts`
- `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/chained-dialogue-break.sd`
- `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/trailing-break.sd`
- `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/escape-non-whitespace.sd`
- `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/escape-space-mid-content.sd`
- `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/display/glue-break-spacing.sd`
- `packages/sparkdown/src/tests/runtime/Glue.test.ts`

### 1.6 — Sluglines, title cards, and transitions

- `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/inline-heading.sd`
- `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/block-heading.sd`
- `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/inline-title.sd`
- `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/block-title.sd`
- `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/inline-transitional.sd`
- `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/block-transitional.sd`
- `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/display/heading.sd`
- `packages/sparkdown/src/tests/runtime/PortInventory.test.ts`

### 1.7 — Styling

- `packages/spark-engine/src/game/modules/interpreter/classes/InterpreterModule.ts`
- `packages/sparkdown/src/tests/runtime/PortInventory.test.ts`
- `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/stress/spark-tale-sample.sd`

### 1.8 — Sending the story somewhere

- `packages/sparkdown/src/tests/runtime/fixtures/choices/choice-diverts-to-done.sd`
- `packages/sparkdown/src/tests/runtime/fixtures/diverts/done-stops-flow.sd`
- `packages/sparkdown/src/tests/runtime/Diverts.test.ts`
- `packages/sparkdown/src/tests/runtime/Choices.test.ts`

### 1.9 — Pictures and sound

- `packages/sparkdown/src/tests/compiler/__snapshots__/compile/asset/image.sd`
- `packages/sparkdown/src/tests/compiler/__snapshots__/compile/asset/audio.sd`
- `packages/sparkdown/src/tests/compiler/__snapshots__/compile/asset/image-and-audio.sd`
- `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/stress/spark-tale-sample.sd`

### 1.10 — Comments and em-dashes

- `packages/sparkdown/src/tests/runtime/DisplayLineComment.test.ts`
- `packages/sparkdown/src/tests/runtime/FrontMatterAndCommentContext.test.ts`
- `packages/sparkdown/src/tests/runtime/StyleDefine.test.ts`
- `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/luau/opener-keyword-join.sd`
- `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/stress/spark-tale-sample.sd`

### 1.11 — The title page

- `packages/sparkdown/src/tests/runtime/FrontMatterAndCommentContext.test.ts`
- `packages/sparkdown/language/sparkdown.language-grammar.json`
- `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/misc/frontmatter.sd`

### 1.12 — What the formatter will (and won't) touch

- `packages/sparkdown-language-server/src/tests/formatter/formatSnapshot.test.ts`
- `packages/sparkdown-language-server/src/tests/formatter/deltaFormatEquivalence.test.ts`
- `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/misc/extra-blanks.sd`
- `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/blanklines/back-to-back-top-level.sd`
- `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/whitespace/mid-line-tabs.sd`
- `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/display/dialogue-pacing.sd`
- `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/stress/spark-tale-sample-messy.sd`
- `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/stress/spark-tale-sample-tight.sd`

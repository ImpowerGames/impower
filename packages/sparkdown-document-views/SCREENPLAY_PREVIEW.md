# Screenplay preview — architecture & test guide

The screenplay preview is the right-pane in the Spark Editor (and the VS Code
sparkdown extension) that shows what the script will look like when exported
to PDF, updated live as you type. It uses CodeMirror with custom decorations
rather than re-running the PDF pipeline — much faster, but the trade-off is
that the preview's visibility rules and the PDF's token stream must be kept
in sync by hand.

This document explains how the two pipelines work, where they diverge, what
test infrastructure exists to catch divergences, and what to do when you find
a new one.

## TL;DR — "the preview is showing something wrong"

1. Add a fixture for the failing input to `test/parity.test.ts`.
2. Run `npm test` from this package. You should see a diff between PDF output
   and preview output.
3. Identify which rule in `src/modules/screenplay-preview/utils/screenplayFormatting.ts`
   needs to change. Common patterns:
   - **A specific grammar node is leaking through** — add an explicit
     `name === "..."` hide check next to the `Break` / `ColonSeparator` cases.
   - **An inline-tagged node is leaking** — see "the styleTags inheritance
     problem" below; the existing `isInlineHidden` check may not fire on the
     specific node you expect.
4. Fix the rule, re-run, confirm green.

## Pipeline 1: PDF export

```
.sd source
  -> ScreenplayParser.parse(script)         [packages/sparkdown-screenplay/src/classes/ScreenplayParser.ts]
  -> ScreenplayToken[]                       [tag, text?, position?, prefix?, suffix?]
  -> generateScreenplayPrintData(tokens)    [packages/sparkdown-screenplay/src/utils/generateScreenplayPrintData.ts]
  -> ScreenplayTypesetter.compose(tokens)   [packages/sparkdown-screenplay/src/classes/ScreenplayTypesetter.ts]
  -> DocumentSpan[]                          [pages of PageLines with FormattedText[] content]
  -> ScreenplayPrinter (pdfkit)             [packages/sparkdown-screenplay-pdf/src/classes/ScreenplayPrinter.ts]
  -> PDF bytes
```

Key things to know:

- **The parser strips structural noise.** Scene/Knot/Function declarations,
  `include` statements, `~` logic lines, `//` comments, `>` BREAK markers,
  `[[image]]` / `((audio))` / `<text>` directives — none of these survive
  into the token stream. The token's `text` field for an action containing
  `the door [[show door]] opens` will already be `the door opens`.
- **Inline emphasis markers stay literal in the token text.** The PDF only
  resolves them at render time, via `styleText()`
  (`packages/sparkdown-screenplay/src/utils/styleText.ts`). `**bold**` stays
  as `**bold**` in the token text and becomes `{ text: "bold", bold: true }`
  at render time.
- **The typesetter handles dual dialogue** by creating a `dual` span whose
  `positions.l` and `positions.r` hold each side's PageLines.

The PDF text-only extractor lives at `test/helpers/pdfText.ts`. It runs the
PDF pipeline through `generateScreenplayPrintData` and stops short of pdfkit,
flattening the `DocumentSpan[]` into one labelled line per visible PageLine.
This is the **source of truth** the preview is graded against.

## Pipeline 2: Preview (CodeMirror decorations)

```
.sd source in EditorState
  -> textmate-grammar-tree parser (via VSCodeLanguageSupport)
  -> Lezer Tree
  -> decorate(state, ...)                   [packages/sparkdown-document-views/src/modules/screenplay-preview/utils/screenplayFormatting.ts]
  -> Range<Decoration>[]
     - Decoration.replace({})                  -> hide source range
     - Decoration.replace({ widget })          -> replace with widget DOM
     - Decoration.mark({ class })              -> apply CSS class
     - Decoration.mark({ attributes })         -> apply HTML attrs
     - Decoration.line({ class / attributes }) -> apply to whole line
  -> CodeMirror renders source + decorations
```

The decorate() function walks the syntax tree with `tree.iterate({ enter, leave })`:

- **Top-level "block hidden" check** (`isBlockHidden`): for nodes whose
  parent is `sparkdown`, anything not on the allow-list of visible node types
  (FrontMatter, Function, Scene, BlockTitle, …) becomes a `collapse`
  decoration that hides the whole block.
- **Inline hidden check** (`isInlineHidden`): for nodes whose lezer style tag
  is in `INLINE_HIDDEN_TAGS` (macroName, comment, meta, definition(...) of
  various sub-tags, etc.), the range is replaced with `Decoration.replace({})`.
- **Centered nodes** (`isCentered`): `Centered`, `BlockTitle`, `InlineTitle`
  get a `text-align: center` mark.
- **Explicit name checks**: `Indent`, `Break` (the `>` BREAK marker),
  `ColonSeparator` (the `:` after a character cue) are hidden by direct
  node-name comparison. **Add new such checks here** when you find a node
  that needs to be hidden but isn't covered by the style-tag rule.
- **Page-break widgets** are produced for `Function` / `Scene` / `Knot`.
  TODO: make these toggleable per user spec (off by default; explicit page
  breaks render as `<hr>`; auto-paginated breaks visible only when the user
  flips a toggle). Not yet implemented — see task #19 in your task list.
- **Title page widget** consumes the `FrontMatter` node and emits a structured
  title-page block.
- **Dialogue** (block, inline, dual) goes through `DialogueWidget` for the
  layout, with `DialogueSpec` carrying character/parenthetical/dialogue
  content broken out for proper indentation.

## Where they diverge — known issues

Each of these is a real divergence between preview and PDF, found via the
test infrastructure. Fixed ones are noted; the rest are open.

### Fixed in this work

1. **`>` BREAK marker visible in preview** — the PDF parser drops it; the
   preview was leaking it because no rule hid the `Break` grammar node.
   Fixed by adding `name === "Break"` to the explicit hide list in
   `decorate()`. Covered by `test/parity.test.ts > BREAK character >`.

2. **`:` after character cue visible in preview** — the PDF emits the
   character name without the trailing `:` (the dialogue widget re-adds it
   visually). Preview was leaking the raw source `:`. Fixed by adding
   `name === "ColonSeparator"` to the same list. Covered by the `dialogue`
   parity test.

3. **Directive-only lines left a vertical gap** (e.g. `[[mackenzie_apathetic]]`
   on its own line inside a dialogue block). The inline content was hidden
   by CSS but the wrapping `cm-line` still created a line-box because
   `LANGUAGE_HIGHLIGHTS` used `visibility:hidden; width:0; height:0` — which
   removes the *visible glyph* but still generates a line-box, giving the
   parent block its full line-height. Fixed by switching `LANGUAGE_HIGHLIGHTS`
   to `display: none` (matching `DUAL_LANGUAGE_HIGHLIGHTS`). The element
   stops generating a line-box entirely; the cm-line collapses to zero height
   when its only content is inline-hidden. Covered by `test/render-gap.test.ts`.
   **Trade-off**: with `display: none` the user cannot click into a hidden
   range to put the cursor inside it. For the read-only screenplay preview
   this is fine. If the same highlight style ever gets reused in an editable
   context, restore `visibility:hidden` there and instead add a
   `Decoration.line({class: "screenplay-hidden-line"})` with `display:none`
   CSS for the all-inline-hidden lines.

4. **`[[image directive]]` and `((audio directive))` visible in preview** —
   resolved as a side-effect of #3. The directives ARE picked up by
   `highlightTree` with the `macroName` tag (the styleTags inheritance issue
   noted below was a red herring — `getStyleTags()` returns null when called
   externally, but `highlightTree`'s internal walking still applies the rule
   correctly). The marks were being added, but their CSS only hid them
   visually while keeping their line-boxes. Switching to `display: none`
   removed the line-boxes too.

### Open

### Visual inspection harness

`test/helpers/renderPreview.ts` mounts a real CodeMirror `EditorView` in
jsdom (set up via `vitest.config.ts`'s `environment: "jsdom"`) and returns
the rendered `.cm-content` outerHTML plus a per-line breakdown. Use
`test/render-gap.test.ts` as a template: call `renderPreview(source)`,
then either assert structural properties (no line is flagged
`emptyButBlockRendered`) or dump the result with `formatRender()` to
`test/snapshots/<name>.txt` for human/agent eyeballing.

Caveat: jsdom has no layout engine. It returns `getComputedStyle` for
explicitly-set properties but cannot tell us pixel positions or whether a
flex/grid container collapses. The harness compensates by looking at
*structural* signals — "is every text-bearing child marked
visibility:hidden?" — to infer the "empty-but-block-rendered" gap class
of bugs. Real visual fidelity needs Playwright + the running extension.

### Vitest cross-package codemirror dedupe

`vitest.config.ts` aliases all `@codemirror/*` and `@lezer/*` imports to
this package's `node_modules` so transitive resolutions from sibling
`file:` packages don't pick up duplicate copies of `@codemirror/state` —
the same "Unrecognized extension value" trap that bit the webview bundle.
Mirror this alias list in any new package that imports CodeMirror.

### Suspected but untested

- Dual dialogue: the `DialogueSpec` walking is intricate and the dual-position
  detection (`<`, `>`, `left`, `right`, `l`, `r`) easy to get wrong if the
  source uses unusual notations. Not yet covered by tests.
- Conditional blocks: the `inConditionalBlock` stack suppresses some hiding;
  uncertain whether the PDF treats these the same.
- Choices with `+`/`-`/`*` markers: the preview shows the mark as-is; the PDF
  uses the prefix from the token. May diverge for the `*` "default choice"
  variant.

## The styleTags inheritance problem

The big issue blocking comprehensive parity tests. `screenplayFormatting.ts`
uses `getStyleTags(nodeRef)` from `@lezer/highlight` to determine which nodes
to hide inline. But `getStyleTags` returns `null` for most named nodes in
the sparkdown grammar — even for nodes that the grammar explicitly tags (like
`ImageCommand` tagged `macroName`).

Hypothesis (not fully confirmed): the textmate-grammar-tree's per-NodeType
prop attachment doesn't compose correctly with `@lezer/highlight`'s `styleTags`
function, which expects to be applied to a whole-language NodePropSource that
sees ALL node types at once. When applied per-NodeType, the
`Foo/...` (apply-to-descendants) selector and the `Foo` (apply-to-self)
selector both fail to register the prop on the actual NodeType.

What this means in practice: the existing `isInlineHidden` check in
`decorate()` only fires for nodes where `getStyleTags` happens to work — and
it's not at all clear which those are. Many nodes that the grammar *says*
should be hidden (anything tagged macroName, meta, comment, etc.) likely
aren't being hidden in the real preview either. Users may not have noticed
for `[[...]]` directives because they're often at the start of a line and
the visual effect is just "this line is wider than expected".

To unblock comprehensive parity:
1. Verify the hypothesis by checking `getStyleTags` on a tree built through
   the actual VS Code or impower-dev pipeline (not just through the test
   `parser.parse()` direct call).
2. If confirmed, two options:
   a. Replace `isInlineHidden` with a direct grammar-node-name allow/deny list
      (lose flexibility, gain correctness).
   b. Fix the textmate-grammar-tree / codemirror-vscode-language NodeType
      construction so styleTags work correctly with @lezer/highlight.

## Test infrastructure

`test/parity.test.ts` is the entry point. Helpers:

- **`test/helpers/pdfText.ts`** — runs the PDF pipeline up to `DocumentSpan[]`
  and flattens to labelled lines: `<scene_heading> INT. CASINO`. This is
  the source of truth.
- **`test/helpers/previewText.ts`** — runs the preview pipeline:
  - Builds an `EditorState` with the language facet attached via
    `language.of(SCREENPLAY_LANGUAGE_SUPPORT.language)` (using `.extension`
    or passing the LanguageSupport directly didn't register the facet in
    this test environment).
  - Calls `ensureSyntaxTree(state, source.length, 30s)` to force parsing.
  - Calls `decorate(state, 0, undefined, tree)` with a tree override (the
    parameter was added during this work).
  - Walks each source line, subtracts hidden ranges, looks up the enclosing
    block kind via `tree.resolve(pos).parent` chain, and emits one labelled
    line per source line that has any visible content.
- **`test/helpers/LogicalDoc.ts`** and **`test/helpers/pdfExtract.ts`** —
  scaffolding for a richer structural extractor (alignment, emphasis runs,
  dual-dialogue position, title-page positions). Not yet wired up to a
  matching preview extractor — kept as the next iteration's starting point.

### Critical design rule for the preview extractor

Walk **source characters**, not known block nodes. The preview shows every
character in the source that isn't covered by a hide decoration — including
characters between known nodes (this is exactly how the `>` bug stayed hidden
for so long: a node-walking extractor would have iterated `TextChunk` nodes
and skipped over the standalone `Break` node entirely).

### Things that surprised me

- `ensureSyntaxTree(state, ...)` returns `null` if the language facet isn't
  installed correctly — and `LanguageSupport.extension` (the documented
  getter) does *not* install the facet correctly in this Vitest environment.
  `language.of(SCREENPLAY_LANGUAGE_SUPPORT.language)` works.
- `LanguageSupport`-as-extension (`extensions: [SCREENPLAY_LANGUAGE_SUPPORT]`)
  silently registers nothing. Same with `extensions: [LANGUAGE_SUPPORT.extension]`.
- Parsing the source directly via `LANGUAGE_SUPPORT.language.parser.parse(source)`
  produces a tree of the right shape but with NO styleTags attached to
  NodeTypes — `getStyleTags(node)` returns null even for nodes the grammar
  explicitly tags. See the styleTags problem above.

## Running tests

```
cd packages/sparkdown-document-views
npm test           # one-shot
npm run test:watch # watch mode
```

## Page-break toggle (TBD)

Per spec: page breaks should be a toggleable feature in the preview. Off by
default. Explicit page breaks always render as `<hr>`. When the user toggles
on, auto-computed page breaks become visible too. Not yet implemented.

Open design question: what counts as "explicit" in the sparkdown grammar?
The current preview always emits a `PageBreakWidget` for `Function` / `Scene`
/ `Knot` nodes — these are structural boundaries, not author-intended page
breaks, and probably belong in the "auto" bucket.

## Files to know

| Path | What |
|---|---|
| `packages/sparkdown-document-views/src/modules/screenplay-preview/utils/screenplayFormatting.ts` | The preview's brain — `decorate()` walks the tree and emits decorations. Edit this when fixing parity bugs. |
| `packages/sparkdown-document-views/src/modules/screenplay-preview/classes/widgets/*` | Block-replacement widgets (page break, title page, dialogue, collapse). |
| `packages/sparkdown-screenplay/src/classes/ScreenplayParser.ts` | Parser that emits the PDF's token stream. Source of truth for "what should be visible". |
| `packages/sparkdown-screenplay/src/classes/ScreenplayTypesetter.ts` | Lays tokens out into pages. |
| `packages/sparkdown-screenplay/src/utils/styleText.ts` | Resolves inline emphasis markers and inline directives. Has subtle rules around whitespace consumption around `((...))` / `[[...]]` / `<...>`. |
| `packages/sparkdown/language/sparkdown.language-grammar.json` | The TextMate-style grammar both pipelines parse with. Tells you what node name a piece of source becomes. |
| `packages/sparkdown-document-views/test/parity.test.ts` | Parity fixtures. Add new ones here when you find a divergence. |
| `packages/sparkdown-document-views/test/helpers/` | Extractors. |

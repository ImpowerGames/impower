# Sparkdown docs divergence report: main vs `dev/reactive-sparkle-engine`

Merge-base: `c2e2a510e`. Feature branch: `dev/reactive-sparkle-engine`. Compiled from 8 analyzer
slices covering the grammar YAML, grammar/compile/formatter snapshot fixtures, runtime tests,
stdlib/engine diffs, and the branch's own docs tree. Findings are deduplicated; each appears once
under the area it primarily affects.

## Executive verdict

The divergence is concentrated almost entirely in the **world** area (UI/sparkle/define syntax),
which is actively moving and must not be drafted from main: the element-tree keyword `screen` is
renamed to `layout` while `screen` is *repurposed* as a navigation group (old examples still parse
but mean something else), leaf-instance defines lose their bare Luau globals (`O.trust` →
`companion.O.trust`), and a large net-new surface lands (animation/theme blocks, component
params/slots/fill, inline `#prop=`/`@event=` attributes, `{expr}` interpolation, if/for/match in
layout bodies, a 3,353-line implicit `builtins.sd` prelude). Outside that, the branch's enormous
engine churn (NUL-sentinel routing tags, `display()` call transport, delta checkpoints, reactive dep
tracking) is deliberately parity-gated and **internal-only** — core prose authoring (dialogue cues,
glue `..`, chained `>` breaks, `# tags`, alternators, conditionals, choices, diverts, saves) is
byte-identical and safe to document now. Three cross-cutting hazards must be tracked even in
otherwise-safe areas: double-quoted strings *gain* interpolation on the branch (a semantic inversion
of existing syntax), the new `@/pattern/flags` regex literal, and three new `[[open/close/navigate]]`
flow directives. **20 deduplicated author-visible findings are blocked on the merge**; everything
else can be drafted today with the merge-day checklist below applied when the branch lands.

---

## Per-area verdicts

### display — TOUCHED

Draft dialogue/action/heading/transition/alternator/glue docs now; re-check the four small items
below at merge.

Author-visible changes (re-check at merge):

- **`<s>` speed shorthand removed** (was `<s:2>` ≡ `<speed:2>`). `<s>` is reserved for
  strikethrough in the adopted UI Toolkit rich-text vocabulary; `<p>` (pitch) and `<w>` (wait)
  shorthands survive. Commit notes zero real usages.
  Sources: `packages/spark-engine/src/game/modules/interpreter/classes/InterpreterModule.ts`
  (branch, ~line 1048), commit `9620d08ae`.
- **Control tags accept `=` as well as `:`** — `<speed=2>` now works alongside `<speed:2>`,
  matching UITK styling tags (`<size=20>`).
  Source: `packages/spark-engine/src/game/modules/interpreter/classes/InterpreterModule.ts` (branch).
- **Defined character with empty `name` now renders the cue.** Before: `define GUARD as character
  with color = red end` + `GUARD: Halt!` rendered a *blank* speaker (inherited `name = ""` won).
  After: empty name is treated as absent and the cue text (`GUARD`) renders. Changes what docs
  should say about the `name` default.
  Sources: commit `1ff2bad86`, `packages/spark-engine/src/tests/ui/characterName.test.ts` (branch).
- **Inline rich-text tags** (`<b>`, `<i>`, etc., UITK vocabulary) inside display/content strings are
  branch-only — do not document from main. Source: commit `9620d08ae`,
  `docs/sparkle/pico-showcase.sd` (branch).

Internal-only churn (**ignorable for docs**):

- All 25 changed compile snapshots (display/alternator/conditional/misc) come from one commit
  (`3398b8eba`): routing tags gain a NUL sentinel (`\0dialogue:O`) and the duplicated visible
  speaker-prefix Text node is dropped; the engine routes on the tag instead of regexing visible
  text. `.sd` inputs untouched; commit states no visible DOM stream change. Only invalidates docs
  that describe raw `Continue()` text or `currentTags` contents.
  Sources: `packages/sparkdown/src/compiler/utils/displayRoutingTag.ts` (branch),
  `packages/sparkdown/src/tests/compiler/__snapshots__/compile/display/*.snap` (both).
- `display(<table>)` stdlib transport behind `experimentalDisplayCalls` — a spike; excluded from
  authoring docs (see functions).
  Sources: `packages/sparkdown/src/inkjs/engine/StdLib.ts` (branch), commit `6d5f3f136`.
- Glue `..`, chained `>` breaks, cue prefixes (`ALICE:`/`$:`/`^:`/`%:`/`@hud:`), and `# tags` are
  byte-identical in `.sd` sources and behavior; only the transport moved.
  Sources: `packages/sparkdown/src/tests/runtime/Glue.test.ts`,
  `.../ChainedDialogueBreak.test.ts`, `.../Tags.test.ts` (diffs, both branches).

### flow — TOUCHED

Draft knot/divert/choice/gather flow docs now — none of that syntax moved. One addition to fold in
at merge:

- **`[[open X]]` / `[[close X]]` / `[[navigate S to L]]` lifecycle directives** typed in narrative
  prose. Before: `[[...]]` verbs were image (`show/hide/animate`) and audio
  (`play/stop/fade/queue/await`) only. After: `LAYOUT_CONTROL_KEYWORDS ["open","close","navigate"]`
  join `AssetCommandInstruction` and inherit the full clause set (`with/over/after/ease/wait`;
  `wait` blocks story advance). Flow docs written today must not claim `[[...]]` is asset-only —
  leave the door open or add the verbs at merge.
  Sources: `definitions/yaml/sparkdown.language-grammar.yaml` (branch), commits `27faf04bd`,
  `f41a010fd`, `cc26da0e7`; guide page `packages/sparkdown/docs/guide/Screens.md` (branch).

### dynamics — SAFE

No author-visible change. The only finding is internal-only (**ignorable**): `reactiveDepsEnabled`
(default false) read/write dependency tracking in the ink VM for reactive UI bindings; every hook
is a boolean check when off, zero effect on truthiness or evaluation order.
Sources: `packages/sparkdown/src/inkjs/engine/VariablesState.ts`, `.../Story.ts` (branch diffs).

### logic — TOUCHED

Core Luau logic (operators, division, `//` display comments, `--` code comments, escape sequences,
backtick interpolation, `'...'`/`[[...]]` literal semantics) is unchanged — draft now. But one
subsection is a semantic inversion and must be written against the *branch*, not main:

- **Double-quoted strings interpolate (BLOCKED item).** Merge-base: only backticks interpolate;
  `"Hello, {name}!"` is a plain literal (proved by `lowerString` at `c2e2a510e` and the merge-base
  conformance test using `"%b{}"` raw). Branch: `"..."` interpolates `{expr}` exactly like
  backticks; `'...'` and `[[...]]` stay literal (the escape hatches); `\{` escapes a brace. Breaking
  for existing scripts with braces in double quotes. Docs written today saying double quotes are
  literal become wrong at merge — do not draft the quote-semantics section from main.
  Sources: `packages/sparkdown/src/tests/runtime/QuotedStringInterpolation.test.ts` (branch),
  `packages/sparkdown/docs/runtime/DIVERGENCES.md` §`"..."` interpolates (branch),
  `packages/sparkdown/src/compiler/lower/expression/lowerExpression.ts` (both).
- **Interpolation diagnostics added (blocked with the above).** Malformed `` `{a `` / `"{a"` →
  "Malformed interpolated string; did you forget to add a }"; empty `{}` → "expected expression
  inside {}". Both were previously *silent* failure modes (file-consuming escape; self-deleting
  value). Source: `packages/sparkdown/src/tests/luau-conformance/InterpolatedStringErrors.test.ts`
  (branch).
- **Regex literal `@/pattern/flags` added (blocked).** No regex literal exists at merge-base; the
  documentable convention today is a quoted `'/pattern/flags'` string into the engine Matcher. The
  branch literal has a mandatory, load-bearing `@` sigil (bare `/re/` is always division), a RAW
  body (no escapes, no interpolation), and lowers to the verbatim string — value-compatible with the
  quoted convention. Sources: `packages/sparkdown/src/tests/runtime/RegexLiteralDivision.test.ts`,
  `.../compiler/regexNotDivision.test.ts` (branch),
  `packages/sparkdown/docs/runtime/DIVERGENCES.md` (branch).
- **`none` un-reserved.** Only `nil` is reserved (matching Luau); `ease.none`/`synth.none` are now
  legal defines. Any reserved-word list must drop `none` at merge. Sources: commit `1e84a3bcf`,
  `packages/sparkdown/src/inkjs/compiler/Parser/ParsedHierarchy/Story.ts` (branch).
- **Bare `=`-then-newline assignment continuation removed; empty-RHS diagnostic added.** The
  operator now closes at end-of-line, an empty RHS no longer swallows the following `end`, and a
  Luau-style error flags it. The removed form was undocumented and unused — don't document it; note
  the new diagnostic. Sources: commits `dea0faa31`, `48d362ee1`;
  `definitions/yaml/sparkdown.language-grammar.yaml` diff @@ -5942.

Internal-only (**ignorable**): DIVERGENCES.md membership-methods (`:find` vs ink `?`/`!?`) section
relocation — behavior identical on both sides; escape-sequence bugfix in define-context emission
(`565867552`) aligns behavior with what escape docs already claim.

### functions — SAFE

No author-visible stdlib surface change to document. The new `display` stdlib entry is an explicit
spike behind `experimentalDisplayCalls` and was **not** added to the author-facing
`LUAU_STANDARD_LIB_FUNCTIONS` grammar list (verified identical to merge-base) — exclude it from
docs entirely; it is not a blocker. `print`/`log`/`format` semantics and stdlib name reservations
are unchanged.
Sources: `packages/sparkdown/src/inkjs/engine/StdLib.ts` (branch, `display:` entry ~line 2987),
`packages/sparkdown/src/tests/display-transport/*.test.ts` (branch).

### world — BLOCKED

Syntax is actively moving. Do not draft the UI/sparkle/define-reference areas from main. The
blocked findings, deduplicated:

1. **`screen` → `layout` keyword swap (hardest invalidation).** Merge-base: `screen NAME
   [as PARENT] with <element tree> end` *is* the element tree. Branch: that block is `layout NAME
   [as PARENT] [in SCREEN] with ... end`; `screen NAME with ... end` is repurposed as a
   *navigation group* (header loses `as PARENT`; body reserved/empty for now). Old `screen`
   examples still parse but mean something different — silently wrong docs.
   Sources: commit `cfb300cff`; `definitions/yaml/sparkdown.language-grammar.yaml` (both);
   fixture rename `screen-bare-markers.sd` → `layout-bare-markers.sd` and formatter fixture
   `screen-tree.sd` → `layout-tree.sd` (branch).
2. **`in <screen>` membership clause** — `layout hud_main in hud with ... end`; undefined screen is
   a compile error. Validated by `[[navigate SCREEN to LAYOUT]]`.
   Sources: `LuauLayoutScreenOperation` in grammar YAML (branch),
   `packages/sparkdown/src/tests/compiler/screenDirectiveValidation.test.ts` (branch).
3. **Leaf-instance defines lose bare Luau globals.** Merge-base: `define O as companion` binds
   bare global `O`; scripts read `O.trust`. Branch: leaf instances (never used as a type) are
   scoped to a synthetic `$<type>_<name>` global; pure-Luau expressions must use
   `companion.O.trust` longform; the bare name is freed for user vars. Classification is
   **whole-program, cross-file** (`scopeDefineInstances` post-pass over `as` parents + `new`
   targets in all included files). Dialogue cues and `[[directives]]` unaffected. A new warning
   fires when `store`/`const` shadows a define *type* or builtin namespace.
   Sources: commits `90d26f76d`, `d3f4e2f79`, `3f9c7c323`;
   `packages/sparkdown/src/tests/runtime/DefineTypes.test.ts` (diff),
   `.../CrossFileNamespaceScoping.test.ts`, `.../StoreOnlySerialization.test.ts` (branch).
4. **`animation NAME [as PARENT] with ... end` structural keyword** (typed colon/indent bodies; the
   26 builtin animations migrated to it; `define X as animation` still works).
   Sources: commits `fe93b5054`, `fc6c3d005`;
   `packages/sparkdown/src/compiler/lower/lowerers/lowerLuauStructDefine.ts` (branch).
5. **`theme NAME [as PARENT] with ... end` structural keyword** (same shape; `theme.X` refs and the
   `theme(...)` selector still work). Source: `LuauTheme` in grammar YAML (branch).
6. **Component parameters + call syntax + slot/fill.** `component stat_row(label, value) with ...
   end`; call sites `stat_row(hero.name, hero.hp)` (leaf) or `card("Inventory"):` (children →
   default slot); `slot` / `slot footer` placeholders; caller-side `fill footer:` routing. Args are
   Luau expressions in caller scope.
   Sources: commit `2b6e44272`;
   `packages/sparkdown/src/tests/compiler/__snapshots__/grammar/sparkle/component-params-and-call.sd`
   (branch); guide `packages/sparkdown/docs/guide/Components.md` (branch).
7. **Inline `#prop=` attributes** (kebab-case names; numeric/quoted/bare values; dynamic
   `#prop={expr}` reactive bindings; interpolation inside quoted prop values; legal on container
   headers). Sources: commit `a9262c274`; sparkle fixtures `layout-props.sd`, `prop-interp.sd`
   (branch).
8. **Inline `@event=` handlers** — bare name, call-with-args, and `@e={ statements }` closures
   (statement block, single-line, implicit `event` object with `.value`/`.checked`/`.key`).
   Sources: commits `b2ff406d7`, `d286953b3`, `64685b715`; fixtures `layout-events.sd`,
   `layout-event-closures.sd` (branch).
9. **`{expr}` interpolation in sparkle double-quoted strings + `{{`/`}}` literal-brace escape**
   (content, args, props; deliberately different escape regime from Luau strings' `\{` — spec
   decision D3). Sources: commits `ca776d229`, `9e71a52df`; fixture
   `layout-content-interpolation.sd` (branch).
10. **Adjacency content `tag "content"`** — `image "black"`, `text "HP: {hp}"`; equivalent to the
    `=` scalar form, which still parses. Sources: commit `1efd49e8a`; fixture
    `layout-adjacency-content.sd` (branch).
11. **Bare-word classes + coexistence** — `button primary "Use" @click=x`: words between the
    builtin tag and content are classes; class + content + attrs + trailing `:` coexist on one
    line. Sources: commits `f3318d696`, `e417becd9`; fixture `layout-classes.sd` (branch).
12. **Sparkle control flow in layout/component bodies** — `if/elseif/else`,
    `for x in expr do ... else ... end` (`else` = empty-iterable fallback, non-standard Luau; keyed
    reconciliation; numeric `for i = 1, 5 do`), `match expr do case "x" ... else ... end` (`case`
    at the same indent as `match`). New keywords `match`/`case`. Distinct from the display-context
    alternator `match |`. Sources: commits `dbc8a9b24`, `95efd74ce`, `9877ec208`; fixtures
    `layout-if.sd`, `layout-for.sd`, `layout-match.sd` (branch, grammar + formatter dirs).
13. **Expanded builtin tag vocabulary** — ~35 semantic tags rendering as real HTML (button, link,
    label, span, divider, inline-text set, lists, tables, structure, form widgets, modal, ...);
    deliberately not promoted: small, nav, progress-as-tag-name variants that would collide with
    bare-word classes. Sources: commit `e934e570e`; `docs/sparkle/pico-showcase.sd` (branch,
    CI-enforced inventory via `picoShowcase.test.ts`).
14. **Bracket-keys in define bodies** — `[">> *"] = {...}`, `["$link"] = {...}`, computed
    `[keyExpr]`; previously desynced the body parse and silently dropped subsequent properties.
    Define-body only. Sources: commit `83e7f5e53`;
    `packages/sparkdown/src/tests/runtime/DefineBracketKey.test.ts` (branch).
15. **Implicit `builtins.sd` prelude** — 3,353 lines / ~421 defines auto-included in every compile.
    Author consequences: same-name authored defines **deep-merge onto builtins** per-key instead of
    standing alone; builtin namespace roots (color, character, animation, ...) shadowing warns;
    `none` un-reserved. Sources: commits `315df2c9c`, `4a63c9c85`, `1e84a3bcf`;
    `packages/sparkdown/src/compiler/builtins/builtins.sd` (branch);
    `packages/sparkdown/src/tests/runtime/StyleDefine.test.ts` (diff).
16. **Root-define props become the type's `$default` and instances inherit it** (deep-merge;
    `$`-metadata never inherited; fixes animations reverting on completion). Docs can now say: a
    root define declares a type *and* its defaults. Sources: commits `da70e61ca`, `6d69a3565`.
17. **Type + same-named instance of a different type coexist** — `define image with ...` (type,
    bare global) and `define image as style` (instance, `style.image`) no longer collide; same-type
    same-name still errors. Sources: commit `510b65ea4`;
    `packages/sparkdown/src/tests/runtime/DefineTypeNameCoexist.test.ts` (branch).
18. **Reactive path is the only render path** — `config.ui.reactive` opt-in retired (setting it
    does nothing); `layout main` auto-opens. Source: `docs/sparkle/reactive-smoke-test.sd`
    (branch header).

**Safe world subtopics — draft now** (byte-identical at merge-base): the core
`define NAME [as PARENT] with ... end` shape; `store` vs plain props; type-vs-instance identity;
`new T()` / `instances()` / `props()`; dialogue-cue and directive references to defines;
store-keyed save/load semantics (scoping is transparent to saves — round-trips unchanged, commit
`92304d5d4`); style block syntax including colon/indent bodies, `-` array items, `> child:` /
`>> descendant:` selectors, and `@screen-size(sm):` breakpoints (`cfb300cff` explicitly lists
`@screen-size` as do-not-touch in the rename); basic `component` trees (fixture byte-identical).
Sources: `packages/sparkdown-language-server/src/tests/formatter/__snapshots__/format/ui/style-block.sd`
and `component-tree.sd` (empty diffs), struct grammar `.sd` fixtures (unchanged except rename).

Internal-only (**ignorable**): ~80 restored struct-body highlighting leaf rules and all
`.snap`/`.vsc.snap` node-name churn (`LuauStructPropertyName` → `StylingDeclarationScalarPropertyName`
etc., commits `693be4159`/`9af423e5b`/`e30bbd7c2`); regenerated grammar JSON mirrors in
`packages/sparkdown/language/` and `vscode-sparkdown/language/` (confirmed no independent drift);
`LuauUINameAndInheritance` split into per-keyword header rules; compile-snapshot `$type_name`
key churn (manifestation of finding 3, not separate syntax).

### meta — SAFE

Nothing here changes what authors type. Internal-only (**ignorable**): compile-snapshot harness
scoping post-pass (`compileSnapshot.ts`); delta-checkpoint store behind `incrementalCheckpoints`
(default OFF, normal save JSON unchanged, commit `4bfaea4b2`); GRAMMAR.md §5.1 contributor
guidance; docs index restructure. One near-author item to note when (if) docs describe the
formatter: the branch adds **UI-block normalization** (header/`end` dedent to column 0, 2-space
body renormalization, trailing-whitespace strip; blank lines untouched, nothing reordered) — new
`*-messy` fixtures, commit `2531bea9c`. Since UI blocks themselves are blocked, this rides along
with the world merge.

---

## Existing guide docs on the feature branch

The branch already contains a serious, polished docs effort — not working notes:

- **`packages/sparkdown/docs/guide/`** (branch): an 8-page, ~1,400-line author-facing Sparkle UI
  guide with an ordered reading path — `README.md` (index + syntax-at-a-glance),
  `Introduction.md`, `Structure.md` (211 lines: layouts, elements, classes, content, props,
  events), `ControlFlow.md`, `Components.md`, `Widgets.md`, `Screens.md`, `StyleProps.md`
  (521 lines, full prop reference with alias tables), `AnimationTheme.md` (explicitly unfinished:
  theme-value referencing carries a TODO — that part of the language is not yet designed).
  Examples were compile-verified against the branch per commit history.
- **`docs/sparkle/reactive-sparkle-spec.md`** (branch): 779-line contributor design spec
  ("Audience of this doc: us") with open `[DECISION]`/`[DIVERGES]` markers — a planning reference,
  not a docs page.
- **`docs/sparkle/pico-showcase.sd`** (branch): runnable, CI-enforced builtin inventory (~35 tags,
  builtin classes, rich-text tags); also records a known grammar bug (`://` in `#href` values).
- **`packages/sparkdown/docs/README.md`** (branch): adds an authors-vs-contributors split and
  establishes `guide/` as *the* home for author docs.
- **`packages/sparkdown/docs/runtime/DIVERGENCES.md`** (branch): gains the double-quote
  interpolation and regex-literal sections a docs inventory must track.

**Reconciliation verdict: build on it, do not write beside it.** Essentially everything the guide
documents is branch-only, so it is the post-merge foundation for the entire world area — the docs
effort on this branch should (a) adopt `packages/sparkdown/docs/guide/` as the canonical author-doc
location, (b) draft only the SAFE/TOUCHED areas now (display, flow, logic-minus-strings, functions,
core define/style world subtopics) in a structure that slots alongside the guide, and (c) at merge,
fill the guide's known holes rather than duplicating its pages: theme-value referencing (unsettled),
a palette-color/font/image reference (missing), and Widgets coverage (6 of ~35 builtins documented).

---

## Merge-day checklist

Every `changed` finding that invalidates a current-branch (merge-base) inventory entry. Check each
off after updating the affected docs when `dev/reactive-sparkle-engine` merges:

- [ ] **`screen` no longer means element tree** — every element-tree example/reference becomes
      `layout NAME [as PARENT] [in SCREEN] with ... end` (`cfb300cff`).
- [ ] **`screen NAME with ... end` re-documented as a navigation group** — `as PARENT` removed from
      its header; body reserved/empty; layouts join via `in`; undefined screen = compile error.
- [ ] **Bare instance globals are gone** — rewrite every `O.trust`-style example to
      `companion.O.trust` longform; document whole-program cross-file classification and the new
      store/const-shadows-type warning (`90d26f76d`, `d3f4e2f79`, `3f9c7c323`).
- [ ] **Double-quoted strings interpolate** — invert any statement that `"..."` is literal; document
      `\{` escape, `'...'`/`[[...]]` as the literal escape hatches, and the new malformed/empty-`{}`
      diagnostics.
- [ ] **`[[...]]` directives are no longer asset-only** — add `open`/`close`/`navigate` with the
      inherited `with/over/after/ease/wait` clause set.
- [ ] **`<s>` typewriter speed shorthand removed** — drop it; keep `<p>`/`<w>`; add the `=`
      separator (`<speed=2>`) alongside `:`.
- [ ] **Empty character `name` falls back to the cue** — fix any statement that an undefined/blank
      `name` renders a blank speaker (`1ff2bad86`).
- [ ] **`none` removed from the reserved-word list** — only `nil` is reserved (`1e84a3bcf`).
- [ ] **Bare `=`-then-newline continuation no longer parses** — remove if documented; note the
      empty-RHS diagnostic (`dea0faa31`, `48d362ee1`).
- [ ] **Root-define props are the type's `$default` and are inherited by instances** — update any
      claim that root-define props are inert/dropped (`da70e61ca`, `6d69a3565`).
- [ ] **Type + same-named instance of a different type coexist** — no longer a duplicate-identifier
      error (`510b65ea4`).
- [ ] **Same-name authored defines deep-merge onto `builtins.sd` builtins** — document the merge
      behavior and the builtin-namespace shadowing warning (`315df2c9c`, `4a63c9c85`).
- [ ] **`config.ui.reactive` retired** — remove any mention of a reactive opt-in; reactive layouts
      are the only render path and `main` auto-opens (`docs/sparkle/reactive-smoke-test.sd`).
- [ ] **Quoted `'/pattern/flags'` regex convention** — where documented, add the `@/pattern/flags`
      literal as the preferred form (value-compatible; `@` sigil mandatory; raw body).

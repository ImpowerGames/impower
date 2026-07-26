# Sparkdown documentation plan

Two-track user-facing docs, modeled on inkle's *Writing with Ink* (progressive tutorial) and
fountain.io/syntax (one-page scannable reference). Every feature listed below uses the exact
`###` heading name from the canonical inventory ([feature-inventory.md](feature-inventory.md)), annotated with
the inventory file it came from. Features that appear in more than one inventory file are
documented in exactly **one** tutorial section; the annotation `(01, 02)` means both files
inventoried it and this section is its single home.

Ground rules carried through the whole plan:

- Docs never claim syntax the test suite does not back. Each published section must cite the
  backing fixtures listed in the inventory entry it covers.
- Divergences from ink / Fountain / Luau get explicit callout boxes (section 4 below).
- Anything marked UNRESOLVED or doc-only-unverified in the inventory goes to section 5
  ("do not document yet") — the parent feature is still documented, minus the unsettled claim.
- **Branch quarantine:** `dev/reactive-sparkle-engine` actively changes syntax. Per-area verdicts
  (from [reactive-sparkle-divergence.md](reactive-sparkle-divergence.md)):
  display TOUCHED · flow TOUCHED · dynamics SAFE · logic TOUCHED · functions SAFE ·
  **world BLOCKED** · meta SAFE. Sections annotated ⛔ below must be drafted against that branch
  (or after merge), never from main; its merge-day checklist is the update list for everything else.

---

## 1. Proposed file layout

User-facing docs (will surface on a website; internal contributor docs stay in
`packages/sparkdown/docs/`):

```
docs/sparkdown/
  docs-plan.md                          # this file (planning artifact, not published)
  tutorial/
    index.md                            # "Writing with Sparkdown" landing page + part map
    01-writing-your-first-script.md     # Part 1
    02-choices-and-story-flow.md        # Part 2
    03-living-text.md                   # Part 3
    04-variables-and-logic.md           # Part 4
    05-characters-world-presentation.md # Part 5
    06-advanced-scripting.md            # Part 6
    07-tooling-and-integration.md       # Part 7
  reference/
    syntax.md                           # one-page syntax reference (section 3 below)
    coming-from-ink.md                  # optional later: divergence table, generated from callouts
    coming-from-fountain.md             # optional later: same idea
```

Notes:
- **Open layout decision:** `dev/reactive-sparkle-engine` already ships an 8-page author guide at
  `packages/sparkdown/docs/guide/` (Sparkle UI: Structure, Components, Widgets, Screens,
  StyleProps, AnimationTheme, ...) and declares that directory the home for author docs. Before
  drafting begins, decide whether user docs live here (`docs/sparkdown/`) with `guide/` merged in
  at branch-merge time, or whether this effort adopts `packages/sparkdown/docs/guide/` as the
  canonical location and this tree holds only planning artifacts. The divergence report
  recommends building on `guide/` for the whole UI area rather than writing parallel pages.
- Each tutorial part is self-contained (a writer can start at Part 1 and stop at any part
  boundary with a working mental model). Examples come before explanation, per the brief.
- The two `coming-from-*` pages are optional follow-ups; the callout boxes in section 4 are the
  source material. They are not required for launch.
- `reference/syntax.md` may repeat features freely; the tutorial may not.

---

## 2. Tutorial table of contents — "Writing with Sparkdown"

7 parts, 68 sections. Ordered by audience: Part 1 is pure-writer (no jargon, no code); Parts 2-3
end in advanced-tier tails a first-time writer can skip past; Parts 6-7 are advanced/integrator.

### Part 1 — Writing Your First Script *(pure writer; Fountain-side basics)*

**1.1 A script is just text** — Plain prose is narration; nothing to learn before you start typing.
- Implicit action (narration) lines (01)
- Explicit action marker (`:`) (01)

**1.2 Dialogue** — A name and a colon make a character speak.
- Dialogue lines (`NAME:` inline and block) (01)

**1.3 Sluglines, title cards, and transitions** — The three screenplay sigils that shape a scene on screen.
- Scene heading (`$:`) (01) / scene headings (`$:`) (02)
- Title card (`^:`) (01) / title lines (`^:`) (02)
- Transition (`%:`) (01) / transitions (`%:`) (02)

**1.4 Blocks and indentation** — Any sigil can open an indented block; how blocks begin and end.
- Block form & indentation scoping (all display types) (01)

**1.5 Pacing: pauses, beats, and line breaks** — Controlling the rhythm the player experiences.
- Significant whitespace (multi-space pauses) (01)
- Dialogue beat break (trailing `>`) (01)
- Backslash escapes (`\*` literal, `\ ` hard line break) (01)

**1.6 Emphasis** — Italics with asterisks, and how to show a literal asterisk.
- Text emphasis (`*word*`) (01)

**1.7 Comments and em-dashes** — Notes to yourself that the player never sees, and why `--` is safe in prose.
- `//` display line comments (01)
- `--` is an em-dash in display; a Luau comment only in code contexts (01)

**1.8 The title page** — Document metadata in a fenced front-matter block.
- Front matter (`---`-fenced metadata block) (01) / `---` front matter (title page) (06)

**1.9 What the formatter will (and won't) touch** — Format-on-save tidies sigils but never your spacing.
- Formatter canonicalization contract (07)

### Part 2 — Choices and Story Flow *(writer → advanced)*

**2.1 Scenes, branches, and `end`** — Named sections of story and the universal block terminator.
- scene declarations (`scene NAME ... end`) (02)
- branch declarations (`branch NAME ... end`) (02)
- Standalone `end` keyword (06)

**2.2 Diverts** — Sending the story somewhere else, including mid-line. *(How diverts join text is covered with glue in 2.8.)*
- basic divert (`-> target`) (02)
- dotted divert paths (`-> scene.branch.label`) (02)
- inline (same-line) diverts (02)

**2.3 Ending a flow, ending the story** — `done`, `fin`, and why you rarely need either.
- `done` — end the current flow (02)
- `fin` — end the story (02)
- auto-termination (implicit `done`) (02)

**2.4 Choices** — The `choose` block and everything that can live on a choice line.
- `choose ... end` choice blocks (02)
- once-only choices (`*`) (02)
- sticky choices (`+`) (02)
- choice bodies (indented continuation content) (02)
- bracketed choice text (`[...]` label/output split) (02)
- choice same-line diverts (`* text -> target`) (02)
- choice text on the following line (02)

**2.5 Gathers** — Bringing branching text back together with `then`.
- `then` gather clauses (`choose ... then ... end`) (02)
- labeled gathers (`then (name)`) (02)
- nested `choose` blocks (weave nesting) (02)

**2.6 Labels and weave points** — Named anchors you can jump back to and count.
- label anchors (`label NAME`) (02)
- labeled choices (`* (name)` weave points) (02)
- labels inside and after conditional bodies (02)

**2.7 Conditional and fallback choices** — Guarding choices, and what happens when none are visible.
- conditional choices (`* if cond text`) (02)
- visit-count conditions on choices (02)
- fallback / default choices (`* ->` and `* -> target`) (02)

**2.8 Glue** — Joining consecutive output lines into one. *(Single home for all glue semantics; 1.5 pacing and 2.2 diverts cross-link here.)*
- Glue (`..`) (01)
- glue marker (`..` at line start) (02)
- Glue marker `..` (leading and trailing) (03)
- Glue across all display-line types (beat merging) (03)
- Same-line divert glues text (`hello -> world`) (03)
- Whitespace collapsing across diverts (03)

**2.9 Tunnels** — Call a scene and come back.
- tunnels (`-> f ->` call, `->->` return) (02)
- multi-target tunnel chains (`-> A -> B -> C [->]`) (02)
- tunnel-onwards with redirect (`->-> target(args)`) (02)
- chained tunnel pop (`-> X ->->`) (02)

**2.10 Threads** — Composing one menu from several scenes.
- threads (`<- scene`) (02)
- parameterized threads (`<- thread1("red")`) (02)
- thread choices survive main-flow `done` (02)

**2.11 Scene parameters** — Passing values into scenes and branches when you divert.
- scene & branch parameters and divert arguments (02)

**2.12 When the compiler complains** — The mistakes it catches for you before the player ever sees them.
- Flow diagnostics: bad diverts, empty diverts, name collisions, unreachable code (07)

### Part 3 — Living Text: Variation, Tags & Localization *(writer → advanced)*

**3.1 Interpolation** — `{...}` splices computed values into any display text.
- `{expression}` interpolation in display text (01) / Inline `{expr}` interpolation in display text (03) / Interpolation `{expr}` in display text (04)
- Adjacent interpolations share a line (01)
- Function calls inside `{expr}` interpolation (03)
- `{expr}` interpolation in choice text (02)

**3.2 Conditional text** — Text that appears only when a condition holds, inline or as a block.
- Inline `{if cond then a else b}` conditional expression (01)
- Inline conditional text `{if cond then "text"}` (03)
- Block `if cond then ... end` around display lines (03)

**3.3 Alternators** — Text that changes each time the player sees it.
- `queue` alternator (play once through, then nothing) (03)
- `cycle` alternator (wrap around) (03)
- `chain` alternator (stick on last) (03)
- `shuffle` modifier (randomized alternators) (03)

**3.4 Alternator forms** — The four ways to write an alternator and when each applies.
- Block alternator form (multi-line) (03)
- Single-line block alternator form (03)
- Inline braced alternator form (`{keyword|...}`, expression arms) (03)
- Inline-glued alternator form (`.. keyword|a|b ..`) (03)
- Empty alternator arms (adjacent `|` separators) (03)
- Escaping a literal `|` in alternator arms (`\|`) (03)
- Alternators as expressions (inside functions) (03)
- Diverts inside alternator arms (04)

**3.5 Switching on a value with `match`** — One arm per value, `other` as the catch-all.
- `match` alternator (value switch) (03)

**3.6 Plurals and localization** — Grammatically-correct counts in any supported language.
- `plural` alternator with named CLDR keys (03)
- `plural` alternator with positional arms (03)
- `plural` pluralization-table call form (03)
- `plural.category(n)` stdlib function (03)
- Runtime language selection (`lang.current`) (03)

**3.7 Tags** — Metadata attached to lines, scenes, choices, and alternator arms.
- Tags and notes (`#`) (01)
- `# tag` lines (global, scene, branch, and dynamic tags) (03)
- Dynamic `{var}` interpolation inside tags (03)
- Tags on choices (`#` inside choice text) (03)
- Per-arm `# tag` inside inline-glued alternators (03)
- `##` section tags and `[[...]]` lines inside choose-then bodies (03)

### Part 4 — Variables, Logic & State *(writer → advanced)*

**4.1 Declaring state** — Persistent, temporary, and constant values.
- `store` — persistent global variables (04)
- `local` — block-scoped temporary variables (04)
- `const` — named constants (04)

**4.2 The `&` statement prefix** — Marking a line as logic instead of prose.
- `&` explicit-statement prefix (04)

**4.3 Assignment** — Writing to variables, table properties, and multiple targets at once.
- Reassignment without declaration (scope walk) (04)
- Auto-globals and no autovivification (04)
- Property assignment targets (dot and bracket paths) (04)
- Compound assignment operators (04)
- Increment / decrement via `+= 1` and `-= 1` (04)
- Multiple assignment and Lua conflict semantics (04) / Multiple assignment — implemented; stale docs say otherwise (07)

**4.4 Conditionals** — Branching narrative and logic with if/elseif/else.
- `if / elseif / else / end` blocks (04)
- Truthiness (Lua rules; ink rules in narrative constructs) (04)
- `if ... then ... else` expression (Luau ternary) (04) / Ternary `if ... then ... else` expression form — implemented; stale docs say otherwise (07)
- Diverts inside conditionals (04)

**4.5 Operators** — The full expression toolkit and its precedence.
- Boolean operators `not` / `and` / `or` with short-circuit selection (04)
- Comparison operators (`~=` for not-equal) (04)
- Arithmetic operators and float division (04)
- Floor division `//` (04)
- Exponentiation `^` (04)
- String concatenation `..` (04) *(single home; 05's "String concatenation with `..`" is the same feature — 6.6 cross-links here)*
- Operator precedence and associativity (04)
- Unary operators `-`, `not`, `#` (04) *(record-table `#` semantics withheld — see §5)*
- Boolean–number coercion in arithmetic and equality (04)
- Logical operators: keyword form only (07)

**4.6 Values and literals** — Numbers, booleans, nil, strings, and tables.
- Number, boolean, and nil literals (04)
- String literals: double, single, and backtick-interpolated (04) *(double-quote interpolation claim withheld — see §5; scope here is the three literal shapes you'll store and interpolate — escapes, long strings, and patterns are owned by 6.6)*
- Table literals: array, keyed, nested, computed keys (04)

**4.7 Tables in depth** — Reference semantics, membership, and access chains.
- Table semantics: references, nil deletion, key identity, iteration order (04)
- `:find` membership test (replaces ink LIST operators) (04)
- Access chains: property, indexer, call, and method call (04)
- Membership tests via methods (no `?`/`!?` operators) (07)

**4.8 Scoping** — Where a name is visible and what shadowing does.
- Block scoping and shadowing (04)
- Undefined variables read as nil (silently) (04)
- Multiple statements per line and `;` separators (04)

**4.9 Repeating narrative** — The label-divert loop idiom. *(Code loops need function bodies, which arrive in Part 6 — see 6.2.)*
- Loop idiom: divert back to a label with a counter (04)

**4.10 Visit counts, turns, and choice counts** — Asking the story what has already happened.
- Visit counts: `count.visits(-> path)` and `{name}` interpolation (04)
- Visit counts, turn counts & choice counts (`count.*`) (05) *(`count`-reserved question withheld — see §5)*
- count.turns() — total turn count (06)
- count.turns(-> target) — turns since a container was visited (06)
- count.visits(-> target) — numeric visit count (06)
- count.visited(-> target) — boolean visited check (06)
- Bare-name visit-count interpolation (06)
- `count.choices()` choice counter (02)

**4.11 Divert targets as values** — Storing, passing, and comparing places in the story.
- divert targets as values (02) / Divert targets as first-class values (04)
- Divert-target parameter annotation (`param: ->`) (04)
- Divert targets as values + READ_COUNT(x) (06)

**4.12 Type annotations** — Optional Luau types: parsed, formatted, ignored at runtime.
- `type` / `typeof` and type annotations (04)
- `::` typecast is parsed but ignored (04)
- Type annotations parsed but ignored (07)

### Part 5 — Characters, World & Presentation *(writer → advanced)*

**5.1 Defining characters** — Making a dialogue cue resolve to a character with a name and look.
- Character definitions resolve dialogue cues (`define ID as character`) (01)

**5.2 `define`: named data objects** — Settings bags, enums, and other named data. *(Core shape is safe on both branches, but ⛔ do not document HOW code references leaf instances: the feature branch removes bare instance globals — `O.trust` becomes `companion.O.trust` — and adds an implicit `builtins.sd` prelude with deep-merge semantics. Use dialogue-cue/directive references in examples; avoid bare-global reads.)*
- `define` blocks — named data objects (06)
- Data-only defines as enums/settings (06)

**5.3 Inheritance and instances** — `as` inheritance for data, and iterating everything you defined. *(Methods, `new`, and `self` need function syntax — they live in 6.10.)*
- `define X as Y` — inheritance and the type/instance/namespace model (06)
- Same-name defines under different types (06)
- `instances()`, `iinstances()`, `props()` iterators (06)
- No `class` keyword — `define` is the OOP path (06)

**5.4 Stage directives: images and audio** — Show, hide, animate, play, stop. *(Write as open-ended: the feature branch adds `[[open/close/navigate]]` lifecycle verbs, so do not claim `[[...]]` is asset-only.)*
- Image directives `[[...]]` (show / hide / animate) (06)
- Audio directives `((...))` (play / stop) (06)
- Image filter chains (`~`) and the `with` animation clause (06)

**5.5 UI: components and styles** — Reusable element trees and their look. ⛔ *(Element-tree `screen` blocks are BLOCKED: the feature branch renames them `layout` and repurposes `screen` as a navigation group — old examples would still parse but mean something else. `style` blocks and basic `component` trees are byte-identical on both branches and safe. The feature branch's `guide/` already documents the new surface — see divergence report.)*
- `screen` blocks — UI element trees (06) ⛔ *becomes `layout` at merge; do not draft*
- `component` blocks — reusable UI trees (06)
- `style` blocks — CSS-like styling (06)

**5.6 Writing text into UI elements** — Routing display text to a named element.
- Write-to-target (`@ target:`) (01)

**5.7 Multi-file projects** — Splitting a game across files and pulling in Luau code.
- `include` — multi-file projects (06)
- `run "path"` — external .luau code files (06)

### Part 6 — Advanced Scripting: Functions & the Standard Library *(advanced)*

**6.1 Functions** — Declaring, calling, and typing pure functions; how they differ from scenes.
- Declaring functions (`function ... end`) (05)
- Calling functions from text vs logic (`{fn(args)}` and `& fn()`) (05)
- Functions vs scenes: call/divert restrictions (05)
- Top-level structure: Luau code lives inside `function ... end` bodies (04)
- Bare statements inside function bodies (no `&` prefix) (05)
- Function definitions with optional type annotations (04)
- Typed parameters and return-type annotations (05)
- Parameter scoping and name-collision rules (05)

**6.2 Loops and iteration** — Real Luau loops, now that you have code contexts to put them in. *(Narrative-side repetition is 4.9's label-divert idiom.)*
- Luau loops (`while`, numeric `for`, `repeat...until`, `do...end`) (02)
- `break` and `continue` (02)
- generic `for ... in` and the iterator protocol (02)
- Loops and `do` blocks in flow and functions (04)
- Loops (`for` / `while` / `repeat` / `do`) — implemented; stale docs say otherwise (07)

**6.3 `print` and `log`** — Display output vs console output from inside functions.
- `print()` = display output from functions; `log()` = console only (05)

**6.4 Multi-return, varargs, and recursion** — Lua's calling conventions in full.
- Recursion and the function call stack (05)
- Multi-return values and spread rules (05)
- Varargs (`...`) and `select` (05)
- Argument-count adjustment (pad nil / discard extras) (05)

**6.5 First-class functions and closures** — Functions as values, captured state, and hoisting.
- First-class functions and anonymous function literals (05) / First-class functions, closures, anonymous functions — implemented; stale docs say otherwise (07)
- Closures and upvalue semantics (05)
- Nested function declarations and hoisting (05)
- Call sugar: `f{...}`, `f"..."`, `f'...'`, `f[[...]]` (05)
- Stdlib functions as first-class values (05)

**6.6 Strings** — Literal forms, conversion, methods, and Lua patterns. *(Sole owner of escapes, long strings, and patterns; 4.6 teaches only the three basic literal shapes, and concatenation's home is 4.5.)*
- String literal forms, escapes, long strings & interpolation (05)
- String concatenation with `..` (05) *(cross-reference to 4.5, its single home)*
- Strict typing & explicit string↔number conversion (05)
- String methods (`s:upper()`, `s:sub()`, `s:find()`, ...) (05)
- String contains idiom (`:find`, replaces ink's `?` operator) (05)
- Lua string patterns (`find`/`match`/`gmatch`/`gsub`) (05)

**6.7 Table and list methods** — The pure-return colon-method surface.
- Method-call syntax (`receiver:method(args)`) (05) *(class-chain dispatch question withheld — see §5)*
- Table/list methods (`t:len()`, `t:at()`, `t:concat()`, `t:sort()`, ...) (05)
- Table set operations (`union`/`intersection`/`difference`/`some`/`every`) (05)
- Table `min`/`max`/`random` (05)
- Chained method calls (05)
- Pure-return colon methods vs mutating `table.*` (07)

**6.8 The standard library** — What's available in code contexts, namespace by namespace.
- The Luau standard library in logic code (05)
- Global builtin functions (05)
- `string.*` library (05)
- `table.*` library (mutating semantics) (05)
- `math.*` library (05)
- `os.*` library (05)
- `utf8.*` library (05)
- `bit32.*` library (05)
- `debug.*` library (limited) (05)
- Stdlib constants (`_VERSION`, `math.pi`, `math.huge`, `utf8.charpattern`) (05)
- `_G` globals table (04, 05)
- math.floor / math.ceil — Luau-named math builtins (06)
- Ink math builtins renamed to Luau stdlib names (07)

**6.9 Error handling and diagnostics in code** — Raising, trapping, and what the compiler checks.
- Error handling: `error()`, `pcall`, `xpcall` (05)
- `assert(v [, message, ...])` (05)
- Relaxed compile-time checks for Luau code (errors happen at runtime) (07)
- Deprecated-stdlib strikethrough diagnostics (07)

**6.10 Object-oriented defines & metatables** — `new`, `init()`, `self`, colon dispatch, and Lua-style objects. *(Completes 5.3's data-side story now that functions exist.)*
- Methods, `new`, and colon dispatch on defines (06)
- `init()` constructor (06)
- `define` blocks: typed structs, classes, inheritance, `new`, `self` (04)
- Metatables and metamethods (05, 06)
- Methods on tables (`function a.f` / `function a:m` and `self`) (06)

**6.11 Reference semantics** — Pass-by-value vs pass-by-reference, and the box-table idiom.
- Tables as reference types (pseudo-`ref` parameters) (05)
- No `ref` parameters (deliberate) (07)

**6.12 Environment and garbage collection** — What works, what's a stub, what never will.
- GC stubs and no weak tables (07)
- Environment functions: getfenv works, setfenv/loadstring don't (07)

**6.13 Reserved words** — The keyword inventory and the escape hatches.
- Reserved keywords and their escape hatches (07)
- Glued reserved-word access is not an alternator (07)

### Part 7 — Tooling, Diagnostics & Host Integration *(integrator)*

**7.1 Host error surfaces** — How compile and runtime errors reach the host. *(Writer-facing diagnostic basics live in 2.12; the formatter contract lives in 1.9.)*
- Host error hooks and file:line error formatting (07)
- Recursive discard-call hang — fixed (07) *(historical note within the section)*

**7.2 External functions** — Wiring script calls to host code.
- `external` function declarations (07)
- `BindExternalFunction` host API and the `lookaheadSafe` flag (07)
- External-function fallbacks (`allowExternalFunctionFallbacks`) (07)
- Left glue (`..`) across external-call lookahead (07)

**7.3 Calling story functions from the host** — Re-entrant evaluation.
- Evaluating functions from the host (`EvaluateFunction`) (05)
- `EvaluateFunction` host API (host calls story functions, re-entrant) (07)

**7.4 Reading and writing variables from the host** — State access and observation.
- `variablesState` get/set and enumeration host API (07)
- Variable observers (`ObserveVariable`) (07)

**7.5 Host navigation and parallel flows** — Jumping the story and running flows side by side.
- Host navigation: `ChoosePathString` and `VisitCountAtPathString` (07)
- Multiple parallel flows (`SwitchFlow` / `RemoveFlow`) (07)
- Visit-count tracking is opt-in (countAllVisits compile option) (06)

**7.6 Saving and loading** — Store-only serialization and its guarantees.
- Save/restore: `ToJson` / `LoadJson` with store-only serialization (07)
- Reference-identity table serialization (aliases, cycles, freeze, length hints) (07)
- Save/load across flows and threads (07)
- Fallback choices survive save/load (07)

**7.7 Data references the engine understands** — Bare and dotted names inside define props. *(Moved from Part 5 — this is a `program.context` contract, integrator territory.)*
- Table and array props in defines; asset references (06)

**7.8 The output-stream contract** — What raw-stream consumers must expect.
- Line-type tag emission (output-stream contract) (07)

---

## 3. One-page syntax reference outline (`reference/syntax.md`)

Fountain.io-style: grouped cheat-sheet rows, each with a paired **"You type" / "Player sees"**
(or "Effect") example. Features repeat here freely; every row links to its tutorial section.
Groups, in page order:

1. **Script basics** — action lines, `:` explicit action, `NAME:` dialogue (inline + block),
   `$:` heading, `^:` title, `%:` transition, `---` front matter, `//` comments, `#` notes/tags,
   `--` em-dash rule.
2. **Pacing & joining** — multi-space pauses, trailing `>` beat break, `\ ` hard break,
   `\*` literal escape, `*emphasis*`, `..` glue (leading/trailing).
3. **Interpolation & inline logic** — `{expr}`, `{if ... then ... else ...}`, adjacent
   interpolations, interpolation in choice text and headings.
4. **Choices & flow** — `scene`/`branch`/`end`, `->` divert (plain, dotted, inline),
   `done`/`fin`, `choose`/`*`/`+`/`[...]`/`then`/`then (name)`, `* if cond`, `* (label)`,
   `* ->` fallback, `label NAME`, tunnels `-> f ->` / `->->`, threads `<-`,
   scene parameters `-> place(5)`.
5. **Alternators & plurals** — `queue`/`cycle`/`chain`/`shuffle` in all four forms, `\|` escape,
   empty arms, `match`, `plural` (named keys, positional, table-call), `lang.current`.
6. **Variables & logic** — `store`/`local`/`const`, `&` prefix, assignment & compound ops,
   `if/elseif/else/end`, operator table (with `~=`, `//`, `^`, `..`, `not/and/or`,
   precedence one-liner), truthiness note, loops, visit/turn counts (`count.*`, `{name}`),
   divert-target values.
7. **Characters, defines & world** — `define ... as character`, `define ... with ... end`,
   `as` inheritance, `new`/`init`/methods, `instances()`.
8. **Assets & UI** — `[[show/hide/animate ...]]` with `over`/`with` clauses, filter chains `~`,
   `((play/stop ...))` with `looping`/`over`, `screen`/`component`/`style` block shapes,
   `@ target:` write.
9. **Functions & stdlib quick rows** — `function ... end`, `{fn()}` vs `& fn()`, `print`/`log`,
   `external`, method-call chains, headline stdlib namespaces with one example each.
10. **Project structure** — `include path.sd`, `run "name"`.
11. **Migration mini-tables** — "If you know ink…" and "If you know Fountain…" two-column
    quick-maps (`<>`→`..`, `=== knot ===`→`scene`, `VAR`→`store`, `~`→`&`, `{a|b|c}`→
    `{chain|"a"|"b"|"c"}`, INT./EXT.→`$:`, etc.), sourced from the callout list below.

---

## 4. Callout boxes (divergences & gotchas), by tutorial section

Every divergence/gotcha the inventory records, placed where the user would trip. Format on the
page: a titled callout box ("Different from ink", "Different from Fountain", "Different from
Luau", or "Gotcha").

| # | Callout | Section |
|---|---------|---------|
| 1 | Fountain: anything unrecognized is action by default — no `!` forced-action sigil | 1.1 |
| 2 | Fountain: speakers use an explicit `NAME:` prefix, not an ALL-CAPS cue line; casing is convention, not enforced | 1.2 |
| 3 | Stale-doc warning for maintainers: GRAMMAR.md's `@NARRATOR:` block-dialogue form does not exist — plain `NAME:` only | 1.2 |
| 4 | Fountain: headings/transitions/titles are explicit sigils (`$:`/`%:`/`^:`), never inferred from INT./EXT., `TO:`, or `>` | 1.3 |
| 5 | Blank lines and `//` comments do NOT close an indented block — only a de-dented line does; block dialogue also closes at choice marks, diverts, sigils, and declaration keywords | 1.4 |
| 6 | ink collapses runs of whitespace; Sparkdown preserves 2+ spaces as pacing pauses (formatter never touches them) | 1.5 |
| 7 | Fountain: leading `>` means transition/centered; Sparkdown's beat break is a *trailing* `>` (transitions are `%:`) | 1.5 |
| 8 | A trailing `>` with nothing after it does not split — it is trimmed | 1.5 |
| 9 | `--` is an em-dash in prose and a comment only in code contexts (divergence from Luau) | 1.7 |
| 10 | `//` must be followed by whitespace/EOL to comment — `http://...` is safe text | 1.7 |
| 11 | Front matter MUST be `---`-fenced (unlike Fountain's bare title page); without fences `title:` parses as a dialogue cue. Fields cannot contain `{expr}` | 1.8 |
| 12 | ink: `=== knot ===` / `= stitch` become `scene`/`branch` blocks; the closing `end` is REQUIRED (compile error without it); `branch` only inside `scene` | 2.1 |
| 13 | ink: running off the end of a knot is a runtime error; Sparkdown auto-terminates cleanly | 2.3 |
| 14 | `done`/`fin` are the idiomatic spellings; `-> DONE` / `-> END` also work. In a thread, `done` is thread-local | 2.3 / 2.10 |
| 15 | MAJOR ink divergence: bare `*`/`+` choice lines are illegal — choices must live in `choose ... end`; nesting is structural, not mark-counted (`* * *` is gone) | 2.4 / 2.5 |
| 16 | ink gathers (`-`, `- (label)`) are gone: use `then` / `then (name)`; `label NAME` replaces `- (name)` anchors | 2.5 / 2.6 |
| 17 | Sparkdown allows `choose` nested inside `if` — a shape ink rejects | 2.4 |
| 18 | Choice guards are `if cond`, not ink's `{cond}`; `{}` is reserved for interpolation | 2.7 |
| 19 | ink's `not seen_thing` visit-count idiom does NOT port (Lua `not 0` is false); use `* if (test == 0)`. Bare read-count conditions keep ink truthiness | 2.7 |
| 20 | Glue is `..` (not ink's `<>`), and it is context-sensitive: whitespace-delimited = glue, between operands = string concat; no way to force one reading except spacing | 2.8 |
| 21 | Sparkdown does not implement ink's empty-line-collapsing implicit glue | 2.8 |
| 22 | `-> A -> B` without a trailing `->` never returns to the caller — the final target is a plain divert | 2.9 |
| 23 | `-> hi` does not auto-route into a scene's first branch — divert explicitly to `-> hi.branchName` | 2.2 |
| 24 | Interpolation braces take full Luau expressions; ink's `{cond: text}` becomes `{if cond then "text"}` or `{cond and "a" or "b"}` | 3.1 / 3.2 |
| 25 | Strings returned into display are NOT re-scanned for `{...}` (ink re-evaluates); an empty interpolation on its own line still emits its newline (ink collapses it) | 3.1 |
| 26 | No `once` keyword — ink's once-only sequence is `queue`; the ink sigils `{!|&|~}` don't exist; `shuffle` composes with all three keywords (`shuffle chain` has no ink equivalent) | 3.3 |
| 27 | Inline braced alternator arms are EXPRESSIONS — bare words parse as variable refs; write `{chain|"a"|"b"|"c"}`. Omit the optional ` end` inside braces (the formatter's `cend` gotcha) | 3.4 |
| 28 | In `plural`, `other` is a literal CLDR category — NOT a catch-all (unlike `match`, where `other` IS the catch-all) | 3.6 |
| 29 | Tag bodies interpolate single identifiers only (`{var}`) — no expressions or alternators (unlike ink tags) | 3.7 |
| 30 | Fountain: `#` is a section heading; in Sparkdown it is a note/tag (must be followed by whitespace/EOL) | 3.7 |
| 31 | ink's VAR/temp become `store`/`local`; `local` is BLOCK-scoped (Luau), not function-scoped — there is no keyword for ink's temp scoping | 4.1 |
| 32 | Only `store`-marked state is saved; locals never persist | 4.1 |
| 33 | `&` replaces ink's `~`; required at top level for bare assignments/calls, optional on declarations, unnecessary (and flagged) inside function bodies | 4.2 |
| 34 | No autovivification: `& inventory.star += 1` errors unless `inventory` was declared (standing design decision — hedge accordingly) | 4.3 |
| 35 | No `++`/`--`; use `+= 1` / `-= 1` | 4.3 |
| 36 | Lua truthiness in code: `0` and `""` are truthy (ink treats 0 as falsy); narrative constructs (choice guards) keep ink truthiness | 4.4 |
| 37 | Not-equal is `~=` (no `!=`, `&&`, `||`, `!`) | 4.5 |
| 38 | `/` is always float division (ink truncates); `//` is floor division, NOT a comment; `%` is floor-mod; no `mod` keyword | 4.5 |
| 39 | `^` is exponentiation (ink used it for list intersection); right-associative; `-2 ^ 2 == -4` (binds tighter than unary minus) | 4.5 |
| 40 | Boolean–number coercion (`true + 1 == 2`) is inherited from ink and diverges from real Luau; string+string `+` still concatenates | 4.5 |
| 41 | Undefined variables read as nil silently (ink errored/warned); indexing a nil root raises a trappable error | 4.8 |
| 42 | No ink LISTs: plain tables + `:find` / set methods replace `?`, `!?`, `has`/`hasnt`; subset test composes `:intersection`+`:len` | 4.7 |
| 43 | Tables are insertion-ordered (deterministic `pairs`, diverging from Lua); numeric keys stringify (`t[1000]` aliases `t["1000"]`) | 4.7 |
| 44 | ink has no loop statements; Sparkdown has real Luau loops in code contexts plus the label-divert idiom in narrative | 4.9 / 6.2 |
| 45 | ink's bare-name read count becomes `{name}` interpolation, and `count.visits`/`count.turns`/`count.choices`/`count.visited` are the idiomatic forms (`count.visited` exists because 0 is no longer falsy) — but the ALL-CAPS flow builtins READ_COUNT/TURNS/TURNS_SINCE/RANDOM/SEED_RANDOM still resolve under their ink names | 4.10 |
| 46 | Visit-count bookkeeping is compile-time opt-in: self-references and runtime-only reads need `countAllVisits` (integrator note, cross-linked from 7.5) | 4.10 |
| 47 | The `->` parameter type annotation is informational only — nothing is enforced at runtime | 4.11 |
| 48 | All Luau type syntax (annotations, generics, `::` casts) parses but is ignored at runtime | 4.12 |
| 49 | Fountain: `[[...]]` are invisible notes; in Sparkdown they are EXECUTABLE stage directions. `(( ))` is the audio sigil, not boneyard. Mnemonic: `[[ ]]` = image, `(( ))` = audio | 5.4 |
| 50 | Filter-chain keys are sorted — source order of `~` filters doesn't matter | 5.4 |
| 51 | `define` has no ink/Fountain/Luau equivalent; `as` means *inherits*; there is no `class` keyword (Luau RFC syntax intentionally unimplemented) | 5.2 / 5.3 |
| 52 | Same-name defines under different types are legal and REQUIRED by the character↔synth pairing convention | 5.3 |
| 53 | `style` bodies are Luau contexts: `--` comments work there, values are bare CSS-like tokens, and `type.name` values become theme-variable references | 5.5 |
| 54 | CONFIRMED (divergence report): `dev/reactive-sparkle-engine` renames element trees `screen`→`layout NAME [as PARENT] [in SCREEN]` and repurposes `screen` as a navigation group — main's `screen` examples would silently change meaning at merge; the whole element-tree topic is ⛔ blocked | 5.5 |
| 55 | `@ name:` writes to a UI element; `NAME:` speaks — the `@` is the distinction | 5.6 |
| 56 | Sparkdown functions are EXPRESSION-ONLY: no narrative text, choices, diverts, or threads inside bodies (ink knot-functions can emit text). Use `print()`, returned strings, or parameterized scenes/tunnels instead | 6.1 |
| 57 | Top-level content after the first `function` declaration is unreachable — put main-flow content first | 6.1 |
| 58 | Scenes are diverted-to, functions are called — the compiler enforces both directions | 6.1 |
| 59 | `print()` emits display text; `log()` is console-only (STDLIB.md's "print is a no-op" is stale) | 6.3 |
| 60 | `"5" == 5` is false — comparisons never coerce (ink coerces); convert with `tonumber` / `"" .. n` | 6.6 |
| 61 | Only backtick strings are fixture-proven to interpolate `{expr}`; no `\u{...}` or `\z` escapes (byte-string convention) | 6.6 |
| 62 | Colon `s:gsub` is plain-text-only; use `string.gsub` for Lua patterns. `s:find`/`s:match` DO support full patterns | 6.6 |
| 63 | Colon table methods are pure-return ("the single biggest intentional deviation from Luau"): `t:sort()` returns a new table; `t:remove` returns the table, not the removed element. The mutating surface is `table.*` | 6.7 |
| 64 | JS-style aliases were deliberately dropped (`:slice`, `:repeat`, `:indexof`, `:replace`, `:includes`, `:join`, `:add`, ...) — use the Lua-named method | 6.7 |
| 65 | Statement-position IIFE after another call needs the Lua `;` guard | 6.5 |
| 66 | Nested named functions are NOT late-bound (declare callees first — diverges from Lua); nested non-local `function NAME` binds enclosing-local, not global (diverges from Luau) | 6.5 |
| 67 | `__concat` collapses into `__add` (`..` and `+` share a runtime op); `__eq` fires only when both operands are tables and share the handler; `>`/`>=` swap onto `__lt`/`__le` | 6.10 |
| 68 | `error()`'s `level` argument is ignored; file:line prefixes appear only if the host installs `errorMessageFormatter` | 6.9 |
| 69 | Alternator keywords (`queue cycle chain shuffle match plural`) are reserved at statement/expression start: `match(x)` as a call is swallowed by the alternator grammar; escape via `.` accessor, containing-names, or function declaration. Don't name helpers `chain` | 6.13 |
| 70 | Stdlib names are reserved — they cannot be user identifiers or `external` binding names | 6.13 / 7.2 |
| 71 | `external` is lowercase (ink: `EXTERNAL`); unbound externals throw on first Continue unless fallbacks are enabled | 7.2 |
| 72 | `lookaheadSafe = true` means the host callback may fire twice per logical call — use `false` for real side effects | 7.2 |
| 73 | `EvaluateFunction`'s `output` is always `""` (functions are pure; ink's could emit text) | 7.3 |
| 74 | Save-file quirks: whole-number floats serialize as `"7.0f"` strings — never `JSON.stringify` the compiled program; `compile()` deletes `result.story`; function values and identity-keyed table entries never round-trip | 7.6 |
| 75 | Every display line is wrapped in line-type tags (`action`, `dialogue:Name`, ...) that appear in `currentTags` — hosts must filter them; glued lines skip the tag | 7.8 |
| 76 | Formatter contract: sigil gaps collapse, but content whitespace is author-significant and never reflowed | 1.9 (cross-linked from 1.5) |
| 77 | ink structurally disallows gathers/labels inside multiline conditional bodies; Sparkdown lifts the restriction — `label` anchors work inside and after conditional bodies | 2.6 |
| 78 | A bare `*` choice with its text on the following line is legal — the grammar cannot flag an "empty choice" (closed by design) | 2.4 |
| 79 | `include` is lowercase (ink: `INCLUDE`) and takes a file path | 5.7 |
| 80 | ink's math builtins are renamed to Luau stdlib names: FLOOR/CEILING/POW/MIN/MAX/RANDOM/SEED_RANDOM → `math.*`; there is no `INT()` cast | 6.8 |
| 81 | ink's `ref` parameters don't exist — tables already pass by reference; use the box-table idiom to share scalars | 6.11 |

---

## 5. Not covered / do not document yet

### 5a. Unsupported or deferred features (documenting them would over-promise)

- **Predicate methods (reserved, not yet available)** (07) — `t:map`/`t:filter`/`t:reduce`/
  `t:findindex`/`t:foreach`, predicate `t:sort`/`t:find`, `s:gsub(pat, fn)`, `s:some`/`s:every`.
  Names reserved; verified still-absent.
- **Unimplemented Luau namespaces: vector, coroutine, task, buffer, loadstring, require, `_G`**
  (07) — document the clear "not supported" errors only if asked; note that `_G` itself IS
  implemented and is documented in §6.8 (the heading's `_G` mention is stale within the entry).
- **Display-layer lowerer gaps: styling markers, `<style>` commands, dialogue metadata** (07) —
  bold `**`, underline `__`, centered `^^`, `<style>` TextCommands, and character
  parenthetical/position forms (`N (whisper):`, `N [LEFT]:`) are lowerer pass-through /
  uncaptured. Do not document styling syntax until player behavior is fixture-verified.
- Doc-only escape forms `\<tab>` and `\<newline>` (from *Backslash escapes*, 01) — no fixture;
  document only `\*` and `\ `.
- ink LIST features with no equivalent: LIST_ALL universe, LIST_INVERT, intrinsic ordinals,
  list arithmetic `(a, b) + (c)` (from *Membership tests* / *Table semantics* entries).
- ink's `mod` keyword alias for `%` — absent by design (from *Arithmetic operators*, 04).
- `__mode` (weak tables), `__iter`, `__idiv` metamethods — unsupported (from *Metatables*, 05).
- Divert-target values flowing through function parameters into `count.turns(x)`
  (ink's `TURNS_SINCE(x)` via param) — not yet supported (from *count.turns*, 06).
- The `-> fn` first-class-function annotation hinted by a filtered warning — syntax undocumented
  anywhere; do not mention.
- Regex literal sigil `@/re/flags` — confirmed branch-only (zero trace at merge-base; added on
  `dev/reactive-sparkle-engine` with a mandatory `@` sigil and raw body). Today's documentable
  convention is a quoted `'/pattern/flags'` string; add the literal at merge.
- Sparkle/reactive-UI syntax beyond `screen`/`component`/`style` — absent from this inventory.
- Pure stdlib calls do not spread tuple arguments (`math.max(math.modf(x))`) — known gap;
  mention only as a caveat inside §6.4 if at all.

### 5b. UNRESOLVED conflicts (docs wait until settled; parent feature documents only the verified part)

- **Unary `#` on record-style (keyed) tables** (04 *Unary operators*): conformance asserts
  array-portion-only; DIVERGENCES.md and a formatter fixture imply entry-count. Document `#` for
  arrays/strings only.
- **Whether `"..."` double-quoted strings interpolate `{expr}`** (04 *String literals*, 05
  *String literal forms*): RESOLVED by the divergence report — on main, `"..."` is fully literal
  and only backticks interpolate; `dev/reactive-sparkle-engine` inverts this (`"..."` interpolates,
  `'...'`/`[[...]]` are the literal escape hatches, `\{` escapes a brace, plus new malformed-`{}`
  diagnostics). Because the semantics flip at merge, ⛔ do not draft the quote-semantics section
  at all until the branch lands; document backtick interpolation only.
- **`count` as a reserved identifier** (05 *Visit counts... `count.*`*): STDLIB.md says reserved,
  FUNCTIONS.md uses it as a parameter name. Avoid using `count` as an identifier in examples;
  make no reservation claim.
- **Colon-method dispatch through define `as`-inheritance chains** (05 *Method-call syntax*):
  DIVERGENCES.md vs DEFERRED.md disagree; only compile-time lowering is pinned. Document colon
  calls on defines via the `DefineClasses`-fixture-backed shapes only.
- **`&` before a divert inside an `if` body** (04 *`&` explicit-statement prefix* / *Diverts
  inside conditionals*): fixture writes `& -> done` but no test pins whether `&` is required.
  Show the fixture form; make no rule claim.
- **`store` legality inside function/control bodies; store/const scope-bypass; function values
  never store-reachable** (04 *`store`*): FUNCTIONS.md design claims with no enforcing test.
  Do not state as rules.
- **`!=` operator** (07 *Logical operators* mentions it "exists per the metamethod table" while
  04's fixture-backed entry says `~=` only): document `~=`; do not mention `!=`.
- **`..=` formatter spacing asymmetry** (`n..= "tail"`) — committed quirk vs bug undetermined;
  don't present formatted output containing it as canonical.
- **screen→layout keyword rename** (06 *`screen` blocks*): pending refactor not on this branch;
  document `screen`, flag for re-verification at merge (callout 54).

### 5c. Internal / contributor-facing (belongs in `packages/sparkdown/docs`, not user docs)

- **Upstream Luau conformance baseline (22 fixtures gated green)** (07) — CI/vendoring detail.
- The stale-docs reconciliation entries in 07 (loops, first-class functions, multiple
  assignment, ternary, alternator-arm diverts, discard-call hang) are **cross-references, not
  homes** — each is homed in its tutorial section (6.2, 6.5, 4.3, 4.4, 3.4, 7.1 respectively);
  this list exists only as documentation hygiene for maintainers.
- `CallValuAsFunction` engine-internal `call` control command — no author-facing syntax; skip.

---

## 6. Writing guidelines

1. **Examples first.** Every section opens with a runnable snippet and its output ("you type /
   player sees") before any explanation — inkle/Fountain style.
2. **No jargon in Part 1.** Part 1 never says compiler, token, sigil-as-a-term, lowerer, AST,
   ink, or Luau. Progressive disclosure: each part may use only concepts introduced in earlier
   parts.
3. **Every claim is fixture-backed.** A section may only describe behavior its inventory entry
   ties to a passing test/snapshot, and each published section ends with a collapsed
   "Backing fixtures" list citing those paths. If the inventory marks a claim doc-only or
   UNRESOLVED, it does not ship (see §5).
4. **Divergences are callouts, not prose.** Differences from ink/Fountain/Luau go in visually
   distinct boxes titled "Different from ink/Fountain/Luau" or "Gotcha", placed exactly where a
   migrating user would trip (§4 table is the checklist).
5. **Snippets must compile.** Every code block is a complete, compilable `.sd` fragment (add
   `done`/`end` scaffolding as needed) so it can be pasted into the editor — and eventually
   CI-checked against the compiler.
6. **Prefer the idiomatic spelling.** Where two forms coexist (`done` vs `-> DONE`, `&` optional
   on declarations), teach the idiomatic one and mention the alternative once.
7. **Neutral placeholders.** Example names use neutral characters/settings (no real-person
   names), matching the repo's fixture conventions.
8. **Tutorial owns a feature once; the reference repeats freely.** Cross-link instead of
   restating; the syntax reference rows link back to their tutorial section.
9. **Hedge standing design decisions.** Where the inventory flags "could flip" (autovivification)
   or a pending rename (screen→layout), say so explicitly rather than presenting as permanent.
10. **Do not trust `packages/sparkdown/docs/runtime/*.md` prose.** DIVERGENCES.md, DEFERRED.md,
    FUNCTIONS.md, METHODS.md, STDLIB.md contain known-stale claims; the inventory's
    fixture-verified statements are the source of truth for user docs.

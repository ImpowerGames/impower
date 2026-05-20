# Sparkdown Grammar Guide

This guide is for anyone adding, modifying, or debugging a rule in `definitions/yaml/sparkdown.language-grammar.yaml` — the file that tells sparkdown's parser how to turn `.sd` source into a syntax tree. It assumes no prior experience with TextMate grammars, Lezer, or this codebase's pipeline.

> **Companion docs:** [`LOWERING.md`](./LOWERING.md) covers the next stage (tree → ParsedObject). [`RUNTIME.md`](./RUNTIME.md) covers the bytecode interpreter.

## How to read this guide

The guide is built for two passes:

- **First pass — orientation.** Read Parts I–III in order (about 20 min). You'll come away knowing what the grammar is, what the YAML file looks like, what the three rule shapes are, and the principle that ties everything together.
- **Second pass — playbook.** When you actually have a change to make, the rest of the guide is reference material organized by what you're trying to do. The "adding a new feature" checklist (§14) is the natural starting point for any new construct.

The grammar is the **first** stage of sparkdown's pipeline. Everything downstream — the lowerer, the runtime, syntax highlighting, the formatter — consumes the tree this grammar produces. Get the grammar right and the rest of the pipeline is mostly mechanical translation. Get it wrong and you fight downstream code forever. That's why the first-pass orientation is worth doing properly.

---

# Part I — Orientation

## 1. The grammar at a glance

### 1.1 What's a TextMate grammar?

A **TextMate grammar** is a set of regex-based rules for slicing source code into named tokens. The format was invented for syntax highlighting in macOS's TextMate editor and is now the standard format VS Code, Sublime Text, GitHub, and most modern code editors use to colorize code.

Conceptually a grammar is just three things:

- **Patterns** — regular expressions that match pieces of the source.
- **Names** — labels attached to each match (`keyword.control.if`, `string.quoted`, etc.) that themes turn into colors.
- **Nesting** — rules can contain other rules, producing a tree of tokens rather than a flat list.

That's the whole conceptual model. No backtracking semantics to learn, no separate AST grammar to design. Just "regexes with names and nesting."

### 1.2 The sparkdown pipeline

Here's what happens to `.sd` source between the keystroke and the running game. Each arrow is a different stage with its own document; this guide covers stage 1.

```
.sd source
    │  (TextMate grammar — definitions/yaml/sparkdown.language-grammar.yaml)
    ▼
Syntax tree (Lezer-shaped)              ← what printTree shows
    │  (lowerers — src/compiler/lower/, see LOWERING.md)
    ▼
inkjs ParsedHierarchy
    │  (inkjs's bytecode generator)
    ▼
Bytecode (JSON)
    │  (engine/Story.ts interpreter, see RUNTIME.md)
    ▼
Output stream + state
```

The grammar runs as an **incremental parser** (`@impower/textmate-grammar-tree`, a fork of cm-tarnation). When the user edits a line, the parser re-runs over the affected chunk and splices the new tokens into the existing tree. You usually don't have to think about incrementality, but the chunk size affects re-parse cost — see §16 for the one place that leaks into design.

### 1.3 What this grammar drives

The same grammar file is consumed by five different systems. If the grammar names a piece of source, all five agree on what it is. If meaning lives somewhere else (say, in the lowerer), three of the five silently disagree.

| Consumer                                   | What it reads on each rule                                                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CodeMirror** syntax highlighting         | The `tag` property                                                                                                                                                  |
| **VS Code** syntax highlighting            | The `name` property                                                                                                                                                 |
| **Auto-formatter** (`FormattingAnnotator`) | Whitespace-class node names like `Whitespace`, `OptionalWhitespace`, `RequiredWhitespace`, `ExtraWhitespace`; position (line-start, line-end) for indent / trailing |
| **Auto-close brackets, smart indent**      | `brackets: true`, `openedBy` / `closedBy` properties                                                                                                                |
| **Lowerer** (compile pipeline)             | The tree shape — every meaningful construct gets its own named node                                                                                                 |

### 1.4 Tour of the YAML file

Every TextMate grammar follows the same skeleton. Here's `definitions/yaml/sparkdown.language-grammar.yaml` cut down to its frame:

```yaml
fileTypes: ["sd"]
keyEquivalent: ^~S
indentUnit: "  "
name: Sparkdown
scopeName: text.source.sparkdown
uuid: ...
flags: mu                    # documentary only — see note below

variables:                   # shared regex fragments and keyword lists (§7)
  WS: (?:[^\S\n\r])
  NL: (?:\r\n|\r|\n)
  IDENTIFIER: (?:[_\p{L}][0-9_\p{L}-]*\b)
  LUAU_END_KEYWORDS: ["end"] # arrays auto-wrap to \b(?:end)\b

patterns:                    # root dispatch — what a top-level line can start with
  - { include: "#Newline" }
  - { include: "#Annotation" }
  - { include: "#Scene" }
  ...

repository:                  # every named rule lives here
  Scene:
    tag: meta
    name: meta.scene.sd
    begin: ({{WS}}*)(scene)\b({{WS}}+)
    beginCaptures: { ... }
    patterns: [ ... ]
    end: (?={{BEAT}})|$
    endCaptures: { ... }
```

Three sections to know:

- **`variables:`** — shared regex fragments. Covered in §7.
- **`patterns:` (top-level)** — the root dispatch. Adding a brand-new top-level construct means adding it here.
- **`repository:`** — every named rule lives here. References use `#Name`. New rules go here.

> **About `flags: mu`.** This field is documentary only. Neither parser actually reads it. It tells human authors what regex flags every pattern is implicitly run under: `u` for Unicode-aware matching, `m` for multiline `^`/`$`. Changing it doesn't change parse behavior.

---

# Part II — The three rule shapes

Every rule in `repository:` takes one of three shapes. Picking the right shape is the first decision when writing a rule.

| Shape    | Used for                                        | Emits a tree node?          |
| -------- | ----------------------------------------------- | --------------------------- |
| `Match`  | A single atomic token matched by one regex      | Yes, always                 |
| `Scoped` | A region bounded by `begin:` and `end:` markers | Yes, wraps the whole region |
| `Switch` | Pure dispatch — a named bag of `include`s       | No (unless `emit: true`)    |

Each of the next three sections walks through one shape with a worked example. The examples are real rules from the grammar, with the source they parse and the tree they produce.

## 2. `Match` — a single token

A `match` rule fires once at its match position and produces a single node spanning the match. If you want to break the match into sub-tokens, attach a `captures:` map (see §6).

**Source:**

```sparkdown
end
```

**Tree (relevant portion):**

```
LuauEndKeyword [13..16]: "end"
```

**Rule:**

```yaml
LuauEndKeyword:
  tag: controlKeyword # → CodeMirror highlighting (§8)
  name: keyword.control.end.luau # → VS Code highlighting (§8)
  match: (end)\b # \b so `endless` doesn't false-match
```

Use `Match`s for atomic tokens — keywords, operators, literals, anything that's a single named blip in the source.

## 3. `Scoped` — a bounded region

A `Scoped` rule is the right tool **when you need to match a region bounded by two specific markers (an opener and a closer), the body between them can contain whatever the rule's `patterns:` list recognizes, and the body has no length guarantee** — it might be one line, it might be many.

Canonical examples: an `if … end` block, a `( … )` parenthesized expression, a `[[ … ]]` multiline string, a function body.

**Source:**

```sparkdown
if globalVal > 0 then
  You have something.
end
```

**Tree (positions abbreviated):**

```
LuauSparkdownIfBlock [0..47]
 ├─ LuauSparkdownIfBlock_begin [0..3]
 │   ├─ LuauSparkdownIfBlock_begin_c1 0
 │   ├─ LuauSparkdownIfBlock_begin_c2 [0..2]
 │   │   └─ LuauIfKeyword [0..2]: "if"
 │   └─ LuauSparkdownIfBlock_begin_c3 [2..3]
 │       └─ OptionalWhitespace [2..3]: " "
 ├─ LuauSparkdownIfBlock_content [3..44]
 │   ├─ LuauIfBlockCondition [3..21]
 │   ├─ Newline [21..22]: "\n"
 │   └─ ImplicitAction [22..43]
 └─ LuauSparkdownIfBlock_end [44..47]
     └─ LuauEndKeyword [44..47]: "end"
```

**Rule:**

```yaml
LuauSparkdownIfBlock:
  # Opens at `if` with leading indent and trailing separator captured.
  begin: ({{WS}}*)(if)\b({{WS}}*)
  beginCaptures:
    1: { patterns: [{ include: "#OptionalWhitespace" }] }
    2: { patterns: [{ include: "#LuauIfKeyword" }] }
    3: { patterns: [{ include: "#OptionalWhitespace" }] }
  # Tried in declaration order against the body.
  patterns:
    - { include: "#LuauIfBlockCondition" }
    - { include: "#LuauExplicitStatement" }
    - { include: "#LuauImplicitStatement" }
    - { include: "#LuauSparkdownControlBlock" }
    - { include: "#SparkdownStatement" }
    - { include: "#LuauExpression" }
    - { include: "#ExtraWhitespace" }
    - { include: "#Newline" }
  # Closes at `end`, OR bails at the next BEAT (next scene/branch) so a
  # forgotten `end` doesn't eat the rest of the document.
  end: (?={{BEAT}})|({{WS}}*)(end)\b
  endCaptures:
    1: { patterns: [{ include: "#OptionalWhitespace" }] }
    2: { patterns: [{ include: "#LuauEndKeyword" }] }
```

Walk-through:

- **`begin:`** fires when the parser sees `if` at a valid position. Three capture groups: leading whitespace, the keyword itself, trailing whitespace.
- **`beginCaptures:`** attaches sub-rules to each capture group by index. Capture 1 → `OptionalWhitespace` (leading WS; the formatter detects line-start position and treats it as indent), capture 2 → `LuauIfKeyword` node, capture 3 → `OptionalWhitespace` node (mid-line, normalized to one space). These named children are what the formatter, highlighter, and lowerer address.
- **`patterns:`** is the set of rules the parser tries inside the body, in declaration order, until one matches.
- **`end:`** has two alternatives: `(?={{BEAT}})` (zero-width lookahead — bail out if the next scene/branch is starting) and `({{WS}}*)(end)\b` (consume the actual `end` keyword). `BEAT` is a grammar variable meaning "start of the next scene or branch" — see the worked use in §11.
- **`endCaptures:`** does for end captures what `beginCaptures` did for begin captures.

> **About the auto-named `_begin_c2` / `_begin_c3` / `_content` wrappers in the tree.** These are auto-generated structural wrappers — `_begin_cN` for the Nth begin capture, `_end_cN` for end captures, `_content` for the inter-begin/end body. They are visible in `printTree` but **they are not a stable contract**. Don't reference them from the lowerer. The lowerer should reach for `LuauIfKeyword` or `OptionalWhitespace`, not `LuauSparkdownIfBlock_begin_c2`. See §6.4 for the rationale.

### 3.1 Two critical properties of `Scoped` rules

**Property 1: Once `begin:` matches, the parser commits.** There's no backtracking. The parser doesn't try alternative rules if the body misbehaves or if the close doesn't show up where expected. It will keep consuming input as body content until `end:` matches (or until end-of-input — the failure case in §3.2).

Two consequences flow from this:

- Make your `begin:` pattern **specific enough** that it doesn't false-match input that wasn't meant to open this scope. A loose opener locks the parser into the wrong scope for a long stretch of input.
- Make your `end:` pattern cover **every plausible legitimate close**, including bail-outs. Most existing `Scoped` rules use `(?={{BEAT}})` as a bail-out so a forgotten closer doesn't cause the rule to eat the rest of the document.

**Property 2: The whole scope is one re-parse unit.** When the user edits inside a `Scoped` rule that sits at the document root, the parser re-runs over the entire scope. A 500-line scope means a 500-line re-parse on every keystroke. This usually doesn't matter — but it constrains what you should wrap in a `Scoped` rule at root level. See §16 for the full picture.

**When NOT to use a `Scoped` rule.** If the region will cover a large part of the document (a whole scene, a whole branch, a top-level document section), capture the _boundary_ (the declaration line) rather than wrapping the entire body. `Scene` and `Branch` are scoped only over their declaration lines; their bodies live at root and the lowerer reconstructs the hierarchy. See §16.3.

### 3.2 The biggest gotcha: incomplete scope

This is the single biggest landmine in writing scoped rules.

> **If a `Scoped` rule's `patterns:` list doesn't cover something it encounters in the body, AND the rule's `end:` pattern can't match either, the rule terminates without closing.** The unmatched content becomes a sibling of the (now-closed) rule at the parent level, several nesting levels too shallow.

The parser surfaces this two ways:

- **A `console.warn`** of the form `[ScopedRule:RuleName] Incomplete scope at pos=...!` — look in stderr / your console first.
- **An `ERROR_INCOMPLETE` node** appended as the last child of the offending scope. `printTree` renders these in red (the node type has `isError: true`).

**A worked failure.** Parse this recursive function:

```sparkdown
function count(n)
  if n > 0 then
    & count(n - 1)
  end
end
```

What the tree _should_ look like:

```
LuauFunctionDefinition
 └─ LuauFunctionDefinition_content
     ├─ LuauFunctionDeclarationName: "count"
     ├─ LuauFunctionParameters
     └─ LuauIfBlock
         └─ LuauIfBlock_content
             ├─ LuauIfBlockCondition
             └─ LuauExplicitStatement     ← `& count(n - 1)` lives HERE
```

What the tree _actually_ looked like (before the fix):

```
LuauFunctionDefinition [0..38]                  ← function closed at 38, too early!
 ├─ LuauFunctionDefinition_content [9..38]
 │   └─ LuauIfBlock [18..38]                    ← if closed at 38 too
 │       ├─ LuauIfBlock_content [23..38]
 │       │   └─ LuauIfBlockCondition             (no `end` captured — body just stops)
 │       └─ ERROR_INCOMPLETE 38                  ← parser flags incomplete scope
 └─ ERROR_INCOMPLETE 38                          ← outer function also incomplete
LuauExplicitStatement [38..52]                  ← `& count(n - 1)` ended up here
LuauEndKeyword [55..58]: "end"                   ← stray top-level tokens
LuauEndKeyword [59..62]: "end"
```

Plus two `console.warn`s in stderr.

**Cause.** `LuauIfBlock.patterns` (the pure-Luau variant) didn't include `LuauExplicitStatement`. When the parser hit `& count(n - 1)` inside the if-body, no inner pattern matched the `&`, the end pattern didn't match either, and the rule had to close without finding `end`. The discard-call then matched at the parent (function-definition) level, but that level also rejected it, so the function also closed incomplete. The two `end` keywords ended up as stray top-level tokens.

The runtime symptom was that the function appeared to never terminate — but the actual bug was structural: the recursive call was unconditionally executed every time the function ran, regardless of the guard.

**Fix.** `LuauControlBlock` (which `LuauIfBlock` includes) needed `LuauExplicitStatement` and `LuauImplicitStatement` added so `&`-statements and declarations would parse inside the body.

**Two rules for avoiding this:**

1. **When you add a new statement type, audit every block that should accept it.** If/elseif/else, for, while, repeat, do, function-body, alternator-arm, etc. There is no inheritance — each block's `patterns:` list must include the new rule explicitly. The shared `LuauBlockBody` / `LuauSparkdownBlockBody` Switch rules (§13.2) cut this audit down to two places for most cases.
2. **When a feature "doesn't work" with no error, dump the tree first.** `ERROR_INCOMPLETE` nodes or `[ScopedRule:...]` warnings are the signal. The fix is in the parent's `patterns:` list, not in the lowerer.

## 4. `Switch` — pure dispatch

A `Switch` rule has no `begin`, `end`, or `match`. It's just a list of `include`s — a named bag of alternatives.

```yaml
LuauImplicitStatement:
  patterns:
    - { include: "#LuauComment" }
    - { include: "#LuauFunctionDefinition" }
    - { include: "#LuauVariableDefinition" }
    - { include: "#LuauReturnStatement" }
    ...
```

The parser tries each include in declaration order; first match wins.

**It doesn't emit a tree node.** The matching inner rule appears directly under whatever parent included the `Switch`. So `printTree` won't show `LuauImplicitStatement` — only the rule inside it that actually matched. This is usually what you want (the dispatcher is implementation detail), but it has two consequences worth knowing:

- **`getDescendent` walks transparently through them.** A lookup like `getDescendent("LuauFunctionName", parent)` doesn't care whether `LuauFunctionName` was an immediate child of `parent` or several levels deep through skipped Switch wrappers. Usually what you want — but when position-in-parent matters (e.g. "the LuauFunctionName must be the first significant child"), walk children manually with `firstChild` / `nextSibling`.
- **The grammar tree and the printed tree don't visually match the YAML hierarchy.** A reader of `printTree` output sees `Scene → SceneDeclarationName → LuauFunctionName` even when the YAML routes through several `Switch` includes along the way. When debugging by tree-staring, expect this — the absent intermediate levels are pure-`patterns` includes that did their dispatch and got out of the way.

**If you want a `Switch` to _also_ appear as a wrapper node**, set `emit: true`:

```yaml
LuauAccessorOperator:
  emit: true
  patterns:
    - { include: "#LuauDotOperator" }
    - { include: "#LuauColonOperator" }
```

Now whichever inner rule fires, the result is wrapped in a `LuauAccessorOperator` parent. Useful when the lowerer wants to find "any accessor" without enumerating dot/colon separately.

---

# Part III — The principle

## 5. The Golden Rule

Now that you've seen what rules actually look like, the principle that drives every design decision in this grammar:

> **Encode structure in the grammar before reaching for descendent or parent checks in the lowerer.**

This is the single most important guideline in this guide. Everything else flows from it.

**What it means in practice.** The lowerer walks the syntax tree and turns each node into a `ParsedObject`. It needs to find specific pieces inside each construct — a function's name, an if-block's condition, a divert's target. There are two ways to make that information findable:

- **In the grammar (right).** The grammar captures the name / condition / target as its own distinctly-named tree node. The lowerer calls `getDescendent("LuauFunctionName", node)` and trusts the answer.
- **In the lowerer (wrong).** The grammar emits one undifferentiated blob of text. The lowerer scans tokens, applies heuristics, checks `parent.name`, asks "am I inside an if-block?" to disambiguate.

The wrong approach works — but it puts the language's semantics in a place no other consumer can see. The syntax highlighter doesn't know what a "function name" is because the grammar didn't say. The formatter can't normalize whitespace around it. The auto-complete machinery can't suggest names in scope. Only the lowerer knows, and only at compile time.

**A useful test.** Open a fixture, parse it, and run `printTree` (§15.1). If you can tell what every construct means just by reading the node names in the printed tree — without cross-referencing the lowerer source — the grammar is doing its job. If you can't, you're designing backwards.

**Two corollaries.**

1. **A construct with distinct meaning gets a distinct node name.** Choices come in flavors (`ChoiceWithSuppressedText`, `ChoiceWithNoSuppressedText`), not one node with a `hasBrackets` flag. `Divert` and `ArmDivert` are separate rules because their end boundaries differ.
2. **Begin and end captures should give every meaningful sub-token its own child.** Don't lump "the operator + the trailing space" into one capture if the formatter or lowerer wants to address them separately.

---

# Part IV — Building blocks

Now that the three rule shapes and the Golden Rule are in place, the rest of this part covers the smaller building blocks every rule uses: captures (§6), variables (§7), highlighting properties (§8), and the handful of optional rule properties that come up most often (§9). §10 covers the rule-ordering convention.

## 6. Captures

A **capture** is a parenthesized group in a regex — like the `(scene)` in `({{WS}}*)(scene)\b`. TextMate grammars extend regex captures with a powerful idea: you can attach a _sub-rule_ to a capture, so the captured text gets parsed by another rule and produces its own tree node.

Captures are how you avoid the anti-pattern of "one big regex blob that the lowerer has to re-parse." If the grammar can name a piece of text, name it.

### 6.1 Why captures matter for the lowerer

The lowerer often needs to find a specific piece of text. The cleanest way is to capture it as its own named node:

```yaml
LuauFunctionDeclarationName:
  patterns:
    - { include: "#LuauFunctionName" }
```

Now the lowerer does `getDescendent("LuauFunctionName", node)` and trusts the grammar to have isolated the right text. Without the capture, the lowerer would have to scan tokens — and any other consumer (formatter, highlighter, etc.) would have no way to find the name at all.

### 6.2 `emit: true` for invisible captures

If a capture matches but its inner patterns produce no named child (e.g. it's an empty string, or it dispatches to a Switch that doesn't emit), the capture itself doesn't appear in the tree — so the lowerer can't find it positionally. Adding `emit: true` to the capture's pattern bag forces a node to appear even when the body is empty or unstructured:

```yaml
beginCaptures:
  3:
    emit: true # forces a node even if the inner pattern produces nothing nameable
    patterns:
      - { include: "#OptionalWhitespace" }
```

Common use: capturing the trailing whitespace after a keyword as an `OptionalWhitespace` node so the formatter can normalize it to one space — even when the user wrote zero spaces.

### 6.3 Don't lump captures together

Bad:

```yaml
begin: ({{WS}}*scene\b{{WS}}+) # one capture for indent + keyword + separator
```

Good:

```yaml
begin: ({{WS}}*)(scene)\b({{WS}}+) # three captures the formatter and highlighter can address
beginCaptures:
  1: { patterns: [{ include: "#OptionalWhitespace" }] }
  2: { patterns: [{ include: "#SceneKeyword" }] }
  3: { patterns: [{ include: "#RequiredWhitespace" }] }
```

The first form makes the leading indent and the trailing separator invisible to the formatter. The second gives each piece its own named node.

### 6.4 Never reference auto-generated `_cN` names from the lowerer

The parser emits structural wrapper nodes for each capture position: `{RuleName}_begin_cN` for the Nth begin capture, `{RuleName}_end_cN` for end captures, and `{RuleName}_content` for the inter-begin/end body. **These exist for the parser's bookkeeping; they are visible in `printTree` but they are not a stable contract.** Their indices shift the moment you add, remove, or reorder a capture group.

Code like `getDescendent("LuauFunctionDefinition_begin_c4", node)` is broken-on-arrival — the next person who adds a capture before that one will silently break your lowerer.

**The right pattern: if a capture is semantically important, give it a proper named rule.** That stable name becomes the lowerer's handle.

```yaml
Include:
  begin: ^({{WS}}*)(include)({{EOK}})
  beginCaptures:
    1: { patterns: [{ include: "#OptionalWhitespace" }] }
    2: { patterns: [{ include: "#IncludeKeyword" }] } # ← named wrapper
    3: { patterns: [{ include: "#RequiredWhitespace" }] }
  patterns:
    - { include: "#IncludeContent" }
  end: (?=$)

IncludeKeyword:
  tag: controlKeyword
  name: keyword.control.definition.include.sd

IncludeContent:
  tag: string
  name: string.include.sd
  match: (.+?)(?={{EOL}})
```

Now the lowerer does `getDescendent("IncludeKeyword", node)` or `getDescendent("IncludeContent", node)` — names that won't drift if you later add an annotation capture in front of the include keyword.

**Rule of thumb:** the auto-generated `_cN` wrappers are a parser implementation detail; named rules are the public surface. If you find yourself reaching for a `_cN` name, stop and add a named wrapper instead.

## 7. Variables

Real grammars repeat the same regex fragments everywhere — whitespace patterns, identifier shapes, keyword lists. Without a way to share them, you'd copy-paste the same regex into a hundred rules and silently drift out of sync the first time one of them needed to change.

The `variables:` block at the top of the file solves this: every fragment defined there can be referenced as `{{NAME}}` from any rule's `begin`, `end`, or `match` pattern, and the build pipeline expands the reference before the grammar runs.

**Rule of thumb: every regex fragment used in more than one place should be a variable.** Don't repeat patterns inline.

### 7.1 Two kinds of variable

**A. String values** are inserted verbatim:

```yaml
variables:
  WS: (?:[^\S\n\r]) # one whitespace char (not newline)
  NL: (?:\r\n|\r|\n) # any newline form
  IDENTIFIER: (?:[_\p{L}][0-9_\p{L}-]*\b)
```

Reference with `{{NAME}}`:

```yaml
Scene:
  begin: ({{WS}}*)(scene)\b({{WS}}+)
```

After substitution, that becomes `((?:[^\S\n\r])*)(scene)\b((?:[^\S\n\r])+)`.

**B. Array values** auto-wrap to `\b(?:item1|item2|...)\b`:

```yaml
variables:
  LUAU_END_KEYWORDS: ["end"]
  LUAU_FLOW_BLOCK_KEYWORDS: ["do", "if", "for", "while", "repeat"]
```

`{{LUAU_FLOW_BLOCK_KEYWORDS}}` expands to `\b(?:do|if|for|while|repeat)\b`. Use this whenever you mean "any of these keywords" — never write the alternation by hand.

### 7.2 Composing variables

Variables can reference other variables, regardless of declaration order — the build pipeline runs a fixed-point substitution until no `{{...}}` tokens remain. Circular references and undefined names are build errors, not silently-passed literals.

```yaml
LUAU_VALUE_BINARY_OPERATORS: (?:{{LUAU_LOGICAL_KEYWORDS}}|{{LUAU_ASSIGNMENT_OPERATORS}}|{{LUAU_COMPARE_OPERATORS}}|...)
LUAU_BINARY_OPERATORS: (?:{{LUAU_TYPE_BINARY_OPERATORS}}|{{LUAU_VALUE_BINARY_OPERATORS}}|{{LUAU_ALTERNATOR_OPERATOR}})
```

Build small named pieces, then compose them. A long regex like `EOL: "(?:$|{{WS}}*$|{{WS}}*{{TAG_START}}.*$)"` is readable at this level; spelled out inline it's noise.

**If a regex is too long to read in one go, give its parts names — even if those names are only used once.** A good rule: if the regex has more than two `(?:...)` groups or any nested lookahead, name something.

### 7.3 Always use non-capturing groups inside variables

Variables expand inline, which means **any capture groups they contain become capture groups of the host rule**. If `WS` were defined as `([^\S\n\r])` (capturing), then `begin: ({{WS}}*)(scene)\b({{WS}}+)` would expand to a regex with _five_ capture groups instead of three — the `WS` variable would steal two index slots, throwing off the `beginCaptures` mapping and the lowerer's expectations.

Always wrap variable contents in a non-capturing group `(?:...)`:

```yaml
variables:
  # GOOD — non-capturing; rule authors decide capture themselves
  WS: (?:[^\S\n\r])
  NL: (?:\r\n|\r|\n)
  IDENTIFIER: (?:[_\p{L}][0-9_\p{L}-]*\b)

  # BAD — capturing groups inside a variable steal capture-index slots
  WS: ([^\S\n\r])
```

Array variables already follow this rule automatically (they expand to `\b(?:a|b|c)\b`, not `\b(a|b|c)\b`). String variables are author-written, so it's on you.

**The rule of thumb:** a variable is a transparent regex fragment; capturing is a decision the _host rule_ makes by wrapping the reference in its own `(...)`, not something the variable should impose.

### 7.4 The capturing exception: underscore-wrapped names

Sometimes a variable genuinely needs to contain a capture — the captured text is meaningful at every use site and inlining the whole pattern would mean duplicating it dozens of times. We handle this with a naming convention plus a build-time check:

- **Naming convention:** any variable whose value contains a capturing group `(...)` must have its name wrapped in underscores: `_NAME_`. The underscore brackets are a visible flag at every `{{_NAME_}}` reference that this variable adds capture group(s) to the host rule's regex.
- **Build-time check:** `definitions/src/language.ts` walks every resolved variable, counts unescaped capturing groups, and refuses to build if a capturing variable doesn't follow the naming convention (or if an underscore-wrapped variable has no captures). You can't accidentally introduce a footgun-named variable.

The one current exception is `_LUAU_BINARY_OPERATOR_AHEAD_`:

```yaml
_LUAU_BINARY_OPERATOR_AHEAD_: (?:({{WS}}*)(?={{LUAU_BINARY_OPERATOR_AHEAD_LOOKAHEAD}})|(?=$|.))
```

The inner `({{WS}}*)` is a real capture group. The pattern is appended to the end of nearly every Luau expression rule so the trailing whitespace can be picked up as an `OptionalWhitespace` by the host. Writing it inline at each use site would mean copy-pasting `(?:({{WS}}*)(?={{LUAU_BINARY_OPERATOR_AHEAD_LOOKAHEAD}})|(?=$|.))` dozens of times. The variable wins on maintenance, and the underscored name flags every use site so authors know to budget a capture-index slot for it.

**If you add a new capturing variable:** underscore-wrap the name, count exactly how many captures it contains, and adjust `beginCaptures` / `endCaptures` indices at every use site by that amount. The build check refuses to compile if you forget the naming.

## 8. `tag` vs `name` — the two highlighters

Both attach to the same node, both control highlighting, but they target **different downstream consumers**:

- **`name`** — a TextMate scope name like `meta.scene.sd` or `keyword.control.end.luau`. This is what **VS Code** highlights against (via its TextMate engine). VS Code themes match against these scope names. Follow TextMate conventions (`keyword.control.*`, `string.quoted.*`, `meta.*`, etc.) so themes Just Work.
- **`tag`** — a Lezer/CodeMirror style tag like `keyword`, `string`, `controlKeyword`, `definition(content)`. This is what **CodeMirror** highlights against. The allowed values are defined by `@lezer/highlight`'s `tags`. CodeMirror themes (e.g. `@codemirror/theme-one-dark`) bind colors to these tags.

> **Rule of thumb:** every rule that should highlight needs _both_. They aren't redundant — they target two different rendering paths. The build pipeline can't infer one from the other reliably; we declare both explicitly.

`tag` accepts a mini-syntax for modifiers:

- `tag: keyword` — plain
- `tag: definition(content)` — definition role over content
- `tag: special(content)` — special role
- `tag: local(content)` — local scope

See `parseTag` in `packages/codemirror-vscode-language/src/utils/parseTag.ts` for the parser, and `@lezer/highlight`'s `tags` for the full vocabulary.

## 9. Other rule properties

Beyond `tag` and `name`, rules accept optional properties that opt into specific editor behaviors — bracket matching, smart indent, end-pattern timing. None are required to make a rule "work"; each is an opt-in. The two that come up most often:

### 9.1 `brackets: true`

Marks the rule as a highlighted bracket. Used by CodeMirror to highlight matching brackets:

```yaml
ImageCommand:
  brackets: true
  begin: (\[\[)({{WS}}*)
  end: $|({{WS}}*)(\]\])({{WS}}*)
```

Don't set it on rules whose "begin" isn't actually a bracket-style delimiter that should be highlighted.

### 9.2 `applyEndPatternLast: true`

By default a `begin`/`end` rule checks the `end` pattern **before** every inner-pattern iteration — as soon as `end` matches, the rule closes. With `applyEndPatternLast: true`, the rule tries the inner patterns first and only checks `end` if none of them match.

You need this when:

- An inner pattern would _also_ satisfy the end pattern (e.g. inner pattern matches "any whitespace", end pattern is "end of line whitespace"). Without the flag, `end` always wins and you never get inside.
- A rule must consume content the end pattern would otherwise greedily claim.

Real example:

```yaml
LuauVariableDefinition:
  patterns:
    - { include: "#LuauComment" }
    - { include: "#LuauVariableAssignment" }
  applyEndPatternLast: true
  end: (?={{BEAT}})|(?=$|{{WS}}*(?!{{LUAU_COMMENT_START}}))
```

`LuauVariableAssignment` can consume across-line text. The end pattern is a lookahead for "end of line, unless a comment follows" — without `applyEndPatternLast`, the assignment would be cut short at the first line boundary even when the user meant to continue.

**Rule of thumb:** if you find yourself reaching for negative lookaheads in the end pattern, ask first whether `applyEndPatternLast: true` would let you drop them.

The full list of rule properties lives in `packages/textmate-grammar-tree/src/grammar/types/GrammarDefinition.ts`.

## 10. Ordering, not lookaheads

When writing a grammar, there will often be situations where multiple rules can match the same input. (Example: a function call `foo()` is also a valid expression — both `FunctionCall` and `GenericExpression` could match it.) You need a way to tell the parser which one should win.

There are two ways to disambiguate, and one is much better than the other.

- **Rule order (good).** Within a `patterns:` list, the parser tries each include in declaration order and uses the first that matches. Put the more specific rule before the more general one and the right one wins.
- **Lookaheads (bad).** Lookaheads can make a general rule "step aside" when a more specific rule would also match. They work, but they're regex-heavy, hard to read, easy to break, and require the general rule to know about every specific rule that might compete with it — a maintenance nightmare.

**Rule of thumb: reorder first, lookahead only as a last resort.**

Bad — disambiguate with a lookahead:

```yaml
patterns:
  - { include: "#GenericExpression" } # would also match `foo()`
  - { include: "#FunctionCall" } # needs lookahead to win
```

Good — reorder:

```yaml
patterns:
  - { include: "#FunctionCall" } # most specific first
  - { include: "#GenericExpression" } # general fallback
```

**The wider lesson:** the order of `include`s in a `patterns:` list is a parsing decision. Specific before general, statement before expression, declaration before reassignment. When grammar rules conflict, almost always the fix is to reorder, not to add a lookahead.

### 10.1 Structural fixes come in more shapes than "reorder a list"

"Reorder, don't lookahead" extends past the literal act of reordering items in a `patterns:` list. Before reaching for a lookahead, walk through this menu of structural alternatives:

- **Reorder a `patterns:` list.** The base case above.
- **Split a rule into narrower rules and include each separately.** If a `Switch` rule (e.g. `LuauKeyword`) is matching a keyword in contexts where that keyword should be a structural boundary instead, the answer is usually to _take the keyword out of the Switch_ and re-include it from a narrower rule that only fires in the contexts that should actually tokenise it. Example from this codebase: `then` / `else` / `elseif` are scope-enders for `if`-blocks, so they live in `LuauTernaryKeyword` (included only by `LuauTernaryExpression` for inline-ternary highlighting) rather than in the general `LuauKeyword` bag that every expression rule picks up. The split makes the keyword _structurally unavailable_ where it shouldn't tokenise — no lookahead, no maintenance trap.
- **Let an `end:` pattern carry the load.** A scoped rule that needs to stop at a specific token (`then`, `do`, a closing delimiter) should bound itself in its own `end:` pattern. Adding a lookahead to a sibling rule's `begin:` to "make room" for the terminator is doing the parent's job in the child's regex.
- **Tighten what a variable matches.** If an `IDENTIFIER`-style variable is greedily eating a keyword, exclude the keyword from the variable's definition (§10.2's `LUAU_IDENTIFIER` is exactly this). The exclusion lives in one place; every rule that uses the variable benefits.

When you find yourself writing a lookahead, run through this list first. The lookahead is the last resort, not the first reach.

> **Debugging anecdotes that motivated this section.**
>
> _The `then` case (split a Switch rule)._ A multi-line `if` block in scene context wasn't parsing — `then` was being consumed by `LuauKeyword` (inside `LuauExpression`) before the surrounding `LuauIfBlockCondition`'s `end:` pattern could see it. The first instinct was `(?!then\b)` inside `LuauKeyword` — a textbook anti-pattern. The right answer was the second bullet above: split `then`/`else`/`elseif` out of `LuauKeyword` into a narrower `LuauTernaryKeyword` rule, and re-include only from the inline-ternary expression where those tokens are genuinely keyword-shaped.
>
> _The `queue` / `cycle` / `chain` / `shuffle` case (reserved-keyword fallback)._ These sequential-alternator keywords used to be excluded from `LUAU_IDENTIFIER` via a baked-in lookahead so they couldn't be rebound as identifiers. The structural replacement: a `LuauSequentialAlternatorKeyword` match rule included as the _last_ pattern in `Luau(Sparkdown)?AlternatorBlocks` — after the full alternator-shape rules. A proper `queue \| A \| B end` still matches as a structured alternator block; a bare `queue` (e.g. in `local queue = 5`) is consumed by the fallback before any identifier-shaped rule is tried. Same end state, no lookaheads, and the reservation is now visible at every use site of the alternator-blocks Switch.

### 10.2 Recognise lookahead-shaped thinking

Before you reach for any fix, notice when your _description_ of the problem already implies a lookahead. These verbal framings are warning signs:

- "Match `X` **only when followed by** `Y`."
- "Match `X` **except when next to** `Z`."
- "Match `X` **unless we're inside** `<context>`."
- "Match `X` **but not when it looks like** `Y`."

They read naturally — that's how people describe disambiguation in English — but each one translates directly into `(?=...)` / `(?!...)`. If your problem statement sounds like one of these, you've already half-written the wrong fix.

**The reframe.** Drop the "only when" / "except when" qualifier and ask the symmetric question instead: _two rules can both match this input — which one should the parser try first?_ That lands on ordering, which puts §10.1's menu (reorder, split a rule, end-pattern, tighten a variable) back in reach.

The same translation applies at review time. A diff that adds a `(?=...)` or `(?!...)` deserves the question: _what is the rival rule, and could we reorder so this rule doesn't have to know about it?_ Either there is one and the lookahead is removable, or there isn't and you've learned something concrete about the actual constraint.

---

# Part V — Patterns the codebase uses

This part covers three sets of patterns that come up everywhere in the existing grammar. §11 covers indentation-sensitive blocks (the workhorse pattern). §12 covers the whitespace-class taxonomy the formatter cares about. §13 covers the LuauX / LuauSparkdownX pairing that lets the same construct work in two different contexts.

## 11. Indentation-sensitive blocks

Sparkdown is indentation-significant in many places (block dialogue, block action, etc.). TextMate grammars are line-oriented and don't directly understand "an indented block" — but the engine **does** support back-references in the end pattern, which gives us exactly what we need.

### 11.1 Capture the indent, end when indentation drops

**Goal:** parse a block-dialogue construct (`@NAME:` followed by an indented body) so the indented body is _inside_ the block node, and the first non-indented line ends the block.

**Source:**

```sparkdown
@NARRATOR:
  Hello.
  How are you?
This is a new line outside the block.
```

**Tree (relevant portion):**

```
BlockDialogue [0..…]              ← contains the body lines
 ├─ BlockDialogue_begin [..]      ← `@NARRATOR:` header
 │   ├─ OptionalWhitespace        ← leading WS (position-detected as indent)
 │   ├─ DialogueMark: "@"
 │   ├─ ...character name pieces...
 │   └─ ColonOperator: ":"
 ├─ BlockLineContinue [..]        ← "  Hello."
 ├─ BlockLineContinue [..]        ← "  How are you?"
                                  ← block ends HERE (no `end` token)
This is a new line outside…       ← sibling of BlockDialogue
```

**Rule:**

```yaml
BlockDialogue:
  begin: ^({{WS}}*)(@)({{WS}}+)(.*)({{WS}}*)([:])({{WS}}*)$
  ...
  end: (?=^(?!$|\1{{WS}}))
```

Reading the end pattern:

- `(?=^` — anchored at start of a line (lookahead — doesn't consume).
- `(?!$|\1{{WS}}` — but **not** if the line is empty or starts with at least `\1` followed by whitespace.
- `\1` is a **back-reference** to capture group 1 of the begin pattern — the leading indent the block opened at.

In plain English: "this block stays open as long as every following non-blank line has at least the same indent as the line that opened it." The first under-indented line ends the block (and crucially, doesn't consume that line — the parent rule gets it).

This is the **canonical way** to express "indented block" in a TextMate grammar. Every block construct in sparkdown that needs indentation scoping (`BlockHeading`, `BlockAction`, `BlockTitle`, `BlockWrite`, `BlockTransitional`, `BlockDialogue`) uses this exact shape. **Copy it; don't invent variations.**

### 11.2 Back-references for bracket balancing

The same back-reference trick works for any pair of delimiters that come in matching-length variants. Luau's `[==[ ... ]==]` multiline strings (the number of `=`s must match):

```yaml
LuauMultilineString:
  begin: (\[)([=]*)(\[)
  beginCaptures:
    1: { patterns: [{ include: "#PunctuationStringBracketQuoteOpen" }] }
    2: { patterns: [{ include: "#PunctuationStringEqualQuoteOpen" }] }
    3: { patterns: [{ include: "#PunctuationStringBracketQuoteOpen" }] }
  ...
  end: (\])(\2)(\])...
  endCaptures:
    1: { patterns: [{ include: "#PunctuationStringBracketQuoteClose" }] }
    2: { patterns: [{ include: "#PunctuationStringEqualQuoteClose" }] }
    3: { patterns: [{ include: "#PunctuationStringBracketQuoteClose" }] }
```

`\2` in the end pattern back-references the `[=]*` captured by the begin. For a well-formed `[==[hello]==]`, the back-reference forces the parser to close on `]==]` (two `=`s — matching the begin) and not on `]=]` (one) or `]]` (zero).

> **Caveat (same property as §3.1, viewed differently):** once `[==[` matches as begin, the parser commits to `LuauMultilineString`. A source like `[==[hello]=]` does not "fail to match" — `hello]=]` and everything after it is consumed as body text until the parser finds `]==]` somewhere ahead (or hits end-of-file and emits an incomplete scope, §3.2). A `Scoped` rule that opens _will_ close somewhere, and how aggressively it eats input depends entirely on what the `end` pattern matches.

### 11.3 Leave whitespace for the parent

A subtle but important pattern: **when a child wants to signal "I'm done" but the parent's end pattern keys off whitespace, the child can stop short and leave that whitespace behind.**

Example: an alternator arm in inline form (`{chain | A | B | C end}`) ends at `|`, `end`, or the closing `}`. The arm rule's end pattern _doesn't consume_ the `|` — it uses lookahead `(?=[|]|...)`. That leaves the separator for the enclosing alternator block's own pattern set to pick up as a `LuauAlternatorSeparator`.

If the arm consumed the `|`, the enclosing block would have to re-emit it from a different rule, and the parent's children would no longer be in source order.

Whenever you write a child rule's end pattern, consciously choose:

- **Lookahead** (`(?=...)`) if the terminating token belongs to the parent's structural vocabulary.
- **Consuming match** (`(...)`) if the terminator is the child's own closing delimiter (the matching `]]`, `end`, etc.).

### 11.4 What back-references can't do

Back-references work because they look at _captured text_ from earlier in the same regex match. They do **not** work across line boundaries inside a single regex. So while you can match an indented block (line-anchored end pattern that re-checks indent at each new line), you can't match arbitrary multi-line lookaheads.

When you need cross-line reconciliation, the grammar can't fully express it. Pick what it _can_ express (e.g. emit a `LuauEndKeyword` marker) and let the lowerer or annotator do the cross-line work.

### 11.5 Spanning newlines inside a scope

VS Code's TextMate engine tokenizes one line at a time. The trailing `\n` _is_ part of the line input — `Newline` and friends match it explicitly — but **no single `begin:`, `end:`, or `match:` pattern can extend past that `\n` into the next line's content.** Lookbehinds and lookaheads in those patterns are equally line-bound: a lookbehind to `if\b` on a previous line will not succeed on a continuation line.

**Once `begin:` opens a scope, the rule's `patterns:` list is iterated line by line.** Inside the open scope, a `Newline` include consumes the line terminator; the next iteration starts at the next line; a whitespace include consumes the leading indent there; and the next pattern picks up content on whatever line it sits on. This is the trick that lets a scope span newlines even though no individual regex ever crosses one.

Sparkdown uses this pattern wherever a Luau construct needs to tolerate `\n` between its keyword and the next token — `if\n  cond\n  then`, `for\n  k, v in iter()\n  do`, `and\n  rhs`. The cleanest expression of it is the two-rule **Operation / Operator** split, used by every binary-operator rule in the grammar:

```yaml
LuauLogicalOperation:
  # Lookahead-only begin — opens a scope without consuming the keyword.
  begin: ({{WS}}*)(?={{LUAU_LOGICAL_KEYWORDS}})
  beginCaptures:
    1: { patterns: [{ include: "#ExtraWhitespace" }] }
  patterns:
    - { include: "#LuauLogicalOperator" } # actually consumes the keyword
    - { include: "#LuauComment" }
    - { include: "#LuauExpression" } # the RHS operand
  end: (?={{BEAT}})|(?=$|{{WS}}|[,;)\]}])

LuauLogicalOperator:
  begin: ({{WS}}*)({{LUAU_LOGICAL_KEYWORDS}})({{WS}}*)
  beginCaptures: { ... }
  # The keyword's trailing whitespace plus the next line's leading
  # whitespace get consumed iteratively here.
  patterns:
    - { include: "#OptionalWhitespace" }
    - { include: "#Newline" }
  # End at the first non-WS / non-EOL character — that's the RHS.
  end: (?={{BEAT}})|(?!$|{{WS}})
```

Walk through `and\n  rhs`:

1. `LuauLogicalOperation`'s lookahead-only `begin:` fires (no consumption).
2. Its first inner pattern, `LuauLogicalOperator`, matches `and` + trailing WS (single-line).
3. Inside the Operator's scope we sit at end-of-line.
4. Operator patterns iterate: `Newline` consumes `\n` (advance to next line), `OptionalWhitespace` consumes `  ` (the next line's indent), and we land on `r` of `rhs`.
5. Operator's `end:` fires (`(?!$|{{WS}})` — we're at non-WS) and the scope closes.
6. Back in `LuauLogicalOperation`, the next pattern `LuauExpression` matches `rhs`.

The same trick works inside a single rule when you don't need a separate Operator-level node. `LuauIfBlockCondition` is the simpler shape:

```yaml
LuauIfBlockCondition:
  # Intra-line lookbehind. Fires immediately after `if` regardless of
  # whether the condition starts on the same line or on a continuation.
  begin: (?<=if\b{{WS}}*)(?!{{BEAT}}|then\b)
  patterns:
    - { include: "#LuauExpression" }
    - { include: "#LuauCommaSeparator" }
    - { include: "#ExtraWhitespace" }
    - { include: "#Newline" } # ← spans lines once the scope is open
  end: ({{WS}}*)((?:then)\b)|(?={{BEAT}}|{{END}})
```

For `if\n  a == 1 and\n  b == 2\n  then …`, the begin fires right after `if`, the body iterates `Newline` → `ExtraWhitespace` → `LuauExpression` → `Newline` → `ExtraWhitespace` → ... until `then` matches the end. No single regex ever crossed a newline.

**Two corollaries.**

- **If a `begin:` / `end:` / `match:` pattern needs to consume past the trailing `\n` of the current line, stop and restructure.** textmate-grammar-tree may quietly accept it, but VS Code will not — and the highlighting will then disagree with the runtime tree. Matching the `\n` itself is fine (and is what `Newline` does); reaching past it into the next line's content is not. Open the scope on a single line and let `Newline` + a whitespace class inside the `patterns:` array do the cross-line work.
- **A scope-end pattern like `(?=$|{{WS}})` is a single-line bound.** It terminates the scope as soon as the first whitespace or end-of-line is hit on the opening line — useful for "one-line construct" rules, fatal for "spans newlines" rules. When making a rule newline-flexible, drop the `$|{{WS}}` half of the end pattern and replace with a specific terminator (a keyword, a BEAT, a closing delimiter) so the scope can survive intermediate whitespace.

> IMPORTANT: textmate-grammar-tree, the runtime parser we use for compiling scripts, happens to be more permissive than vscode's textmate highlighter — a `begin:` like `if\b\s*` can in fact consume past `\n` there. **Don't rely on that.** The same grammar ships to VS Code, where the extra match silently fails and highlighting diverges from the runtime tree.

## 12. Whitespace classes — picking the right one

The auto-formatter (`FormattingAnnotator`) decides how to normalize whitespace by **position first, node name second**. Whitespace runs at the **start of a line** are treated as indent regardless of which capture they sit under; runs at the **end of a line** are treated as trailing whitespace the same way. Only mid-line runs need their node name to disambiguate.

That position-based dispatch is why the grammar has no dedicated `Indent` rule any more — the formatter detects line-start position without needing the grammar to tag it. `TrailingWhitespace` is still defined (and used in one place — the `EndOfLine` Switch rule — where a parser-level "match only at end of line" pattern is required so we don't accidentally eat leading whitespace), but it's a niche tool: capture-list authors should usually reach for `OptionalWhitespace` and let the formatter's position check route line-end runs to "trailing" by name.

| Rule                 | Match                | Where to use                                                                                                                                                                                   |
| -------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Newline`            | `\r\n` / `\r` / `\n` | end of a line, always                                                                                                                                                                          |
| `Whitespace`         | `[\t ]+`             | mid-line whitespace that should be preserved as-is (dialogue body text, glue/break pacing). Also the natural pick for leading-WS captures: the formatter still normalizes those at line start. |
| `TrailingWhitespace` | `(?<!^)[\t ]+$`      | parser-level "match only at line end" — used inside the `EndOfLine` Switch rule where an unanchored WS pattern would eat leading whitespace too. Rarely needed in capture lists.               |
| `ExtraWhitespace`    | `[\t ]+`             | mid-line whitespace that should collapse to nothing                                                                                                                                            |
| `RequiredWhitespace` | `[\t ]+`             | mid-line: normalize to exactly one space; insert one if the capture matched zero chars                                                                                                         |
| `OptionalWhitespace` | `[\t ]*`             | same mid-line behavior as `RequiredWhitespace`; the regex spelling documents that the rule author considers the gap optional                                                                   |

`RequiredWhitespace` and `OptionalWhitespace` differ only in the regex quantifier they expose (`+` vs `*`) — useful as grammar-side documentation of intent. Mid-line, the formatter treats them identically.

**Position-based override.** When _any_ whitespace-class node lands at the start or end of a line, the position check wins:

- At line start → "indent" (`FormattingAnnotator` normalizes the run to the current block-indent depth).
- At line end → "trailing" (trimmed when the LSP `trimTrailingWhitespace` option is on).
- Otherwise → mid-line dispatch per the table above.

So if you write `({{WS}}*)` somewhere a value can sit at line start AND mid-line (`name: type` vs `\n  name: type`), reach for `#OptionalWhitespace` and let the formatter do the right thing for each case — the position check covers both.

**A common mistake** is to use `Whitespace` (preserve-as-is) where `RequiredWhitespace` would be more correct. When in doubt, ask: should auto-formatting ever change this whitespace mid-line?

- Yes → `RequiredWhitespace`, `OptionalWhitespace`, or `ExtraWhitespace`.
- No (e.g. inside a string literal, dialogue typing pacing) → `Whitespace`.

**Switch rules can't include `OptionalWhitespace`.** A `patterns:` list whose member's regex can match zero chars causes the parser to loop. Use `ExtraWhitespace` (or `Whitespace`) inside `patterns:`; reserve `OptionalWhitespace` for capture targets where a zero-width match is the parser's natural "no whitespace here" signal.

## 13. Two-context rules: LuauX and LuauSparkdownX

Many block-shaped constructs come in pairs because the same syntactic shape needs to accept different content in different contexts:

| Pair member                              | Used where                                                          | Accepts                                                           |
| ---------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `LuauIfBlock`                            | pure-Luau context (inside a function body, inside `return (...)`)   | only Luau expressions and statements                              |
| `LuauSparkdownIfBlock`                   | sparkdown context (inside a scene, branch, or other narrative flow) | Luau **plus** display lines, `SparkdownStatement`, narrative text |
| `LuauSequentialAlternatorBlock`          | pure-Luau context (inline `{queue\|A\|B\|C}` in an expression)      | arms parsed as Luau expressions                                   |
| `LuauSparkdownSequentialAlternatorBlock` | sparkdown context (block-form `queue \| A \| B \| C end`)           | arms parsed as display text                                       |

### 13.1 Why pairs exist

The `Sparkdown`-prefixed variant is generally a _superset_ of the un-prefixed one — it accepts everything the Luau version accepts plus display-context constructs. **If you add a new block-shaped construct that should work in both contexts, you almost always need to write both variants** (and remember §3.2 — each variant's `patterns:` must be exhaustive for its context).

When you see a bug like "this works in a scene body but not inside a function," the cause is often that the rule's pure-Luau variant is missing a child pattern its Sparkdown variant has.

### 13.2 Shared body rules: `LuauBlockBody` and `LuauSparkdownBlockBody`

To avoid having to keep the body-content pattern list in sync across all 7 paired block rules, the actual body tail lives in two shared `Switch` rules:

- **`LuauBlockBody`** — body content accepted inside every pure-Luau block (`LuauIfBlock`, `LuauForLoop`, `LuauWhileLoop`, `LuauRepeatLoop`, `LuauDoBlock`, `LuauElseifBlock`, `LuauElseBlock`, `LuauFunctionDefinition`, the type-side alternator blocks). Wraps `LuauControlBlock`, `LuauExpression`, `LuauCommaSeparator`, `ExtraWhitespace`, `Newline`.
- **`LuauSparkdownBlockBody`** — body content for every sparkdown-context block (`LuauSparkdownIfBlock`, `LuauSparkdownForLoop`, etc.). Wraps `LuauExplicitStatement`, `LuauImplicitStatement`, `LuauSparkdownControlBlock`, `SparkdownStatement`, `LuauExpression`, `ExtraWhitespace`, `Newline`. **Does not include `LuauCommaSeparator`** — a display line could legitimately start with a comma (`, she muttered`) and we don't want the parser to treat it as a structural token.

### 13.3 Statement bundles

Three `Switch` rules cover the different statement shapes a body might need to accept:

- **`LuauDeclarations`** — declaration-shaped statements: `function`, `local`, `const`, `return`, `break`, `continue`, `goto`, label declarations, type declarations. Does _not_ include reassignments or function calls.
- **`LuauReassignment`** — the bare reassignment form: `x = expr`, `obj.field = expr`, `obj.a[k].b += expr`. Does _not_ cover declarations.
- **`LuauExplicitStatement`** — the `& …` discard-call / explicit-statement form.

When wiring up a parent block's `patterns:`, you typically want all three included. The `LuauControlBlock` Switch rule pulls in `LuauDeclarations` and `LuauExplicitStatement` for you; `LuauReassignment` is a separate include because of grammar-precedence concerns.

---

# Part VI — Workflow

## 14. Adding a new feature: the checklist

This is the order to follow when introducing a new construct to the language. It's the most useful single page in this guide once you've done the orientation pass.

1. **Sketch the desired parse tree.** Write the source on the left, draw the node hierarchy on the right. This is where you decide what nodes you need. (Apply the Golden Rule, §5: every meaningful piece gets its own named node.)
2. **Add variables** for any new keywords or operator patterns. Use arrays for keyword sets so word boundaries are automatic. Don't inline repeated fragments. (§7)
3. **Write the rule.** Pick the smallest shape that works: `match` for atoms, `patterns` for dispatch, `begin`/`end` for regions. (§§2–4) Set `tag` AND `name`. (§8) Set `brackets` if applicable. (§9)
   - **For region-shaped constructs, ask "how much of the document will this capture?"** If it will capture a very large region (a scene, a branch, a top-level section), scope only the boundary and let the body live at root. Large `Scoped` regions degrade incremental-parse performance. (§16)
4. **Add captures** for every sub-token the lowerer or formatter might want to address. Use `emit: true` if the capture would otherwise be invisible. (§6)
5. **Decide where this rule plugs in.** Add it to the relevant parent's `patterns:` list. **Order matters** — put it before any rule it might conflict with. (§10) For block-shaped constructs in two contexts, write both `LuauX` and `LuauSparkdownX` variants. (§13)
6. **Build the JSON** — `cd definitions && npm run build`. (Or `npm run watch` while iterating.)
7. **Write a `dumpTree` snapshot test** for at least one minimal example. Add it to `src/tests/compiler/__snapshots__/grammar/<category>/<name>.sd` plus a matching `.snap` and `.vsc.snap`. (§15.2, §15.3)
8. **Open a `.sd` file in VS Code** and visually verify the highlighting matches what you intended.
9. **Then** write the lowerer.

The grammar is the slow, fiddly part. Once it's right, the lowerer is usually <50 lines.

## 15. Debugging the grammar

When a grammar feature misbehaves, the question is almost always "what did the parser actually produce?" Reading the YAML and trying to predict the answer is slow and error-prone. The tools in this section let you look at the actual parse tree instead.

### 15.1 `printTree` is your best friend

`printTree` (from `@impower/textmate-grammar-tree/src/tree/utils/printTree`) renders the full parse tree as ASCII. The snapshot test harness wraps this in `dumpTree`:

```typescript
import { dumpTree, stripAnsi } from "./src/tests/compiler/grammarSnapshot";

console.log(
  stripAnsi(
    dumpTree(`scene main
  hello world
`),
  ),
);
```

Output:

```
sparkdown [0..27]
 ├─ Scene [0..27]
 │   ├─ Scene_begin [0..7]
 │   │   ├─ Scene_begin_c1 0
 │   │   ├─ Scene_begin_c2 [0..5]
 │   │   │   └─ SceneKeyword [0..5]: "scene"
 │   │   └─ Scene_begin_c3 [5..6]
 │   │       └─ RequiredWhitespace [5..6]: " "
 │   ├─ Scene_content [6..27]
 │   │   ...
```

**When a feature isn't working as expected, dump the tree first.** Nine times out of ten you'll spot the problem immediately — a node ended too early, the wrong rule matched, a capture didn't fire. Don't guess. Don't read the YAML and try to derive what should happen. Run `dumpTree`.

### 15.2 Snapshot tests

`src/tests/compiler/grammarSnapshot.test.ts` walks every `.sd` file under `src/tests/compiler/__snapshots__/grammar/**` and asserts its parse tree matches a `.snap` file alongside it. After a grammar change:

```
npx vitest run src/tests/compiler/grammarSnapshot.test.ts
```

If a snapshot fails:

1. **Read the diff.** Is it a _correct_ change (you intentionally restructured a rule) or a regression?
2. If correct: update the `.snap` by running with `-u` or by deleting the file and re-running.
3. If regression: don't update. Fix the grammar.

**Always sanity-check the diff.** "Snapshot mismatched" sometimes means the test happened to capture buggy behavior; sometimes it means you broke something. Reading the diff is non-negotiable.

### 15.3 VS Code engine parity (the `.vsc.snap` suite)

The textmate-grammar-tree parser is **not bug-compatible** with VS Code's TextMate engine. In particular, textmate-grammar-tree allows lookaheads to span more aggressively than VS Code does. A pattern that compiles and parses correctly here may not highlight identically in a `.sd` file opened in VS Code.

This matters because the **same grammar file** ships to the VS Code extension. So:

- **A parallel snapshot suite covers VS Code's engine.** `src/tests/compiler/vscodeGrammarSnapshot.test.ts` runs every fixture through `vscode-textmate` + `vscode-oniguruma` (the literal engine VS Code uses) and writes the tokenized output to a sibling `.vsc.snap` file. When you add a new fixture, add **both** snapshots. A diff between the two reveals engine divergence at fixture-add time, not when a user opens the file in their editor.
- After non-trivial grammar changes, **open a representative `.sd` file in VS Code** and verify it highlights correctly.
- Prefer patterns simple enough to behave the same in both engines: avoid deeply nested lookaheads, prefer rule reordering, prefer captured tokens over regex-internal disambiguation.
- **If a pattern relies on parser-level lookahead behavior VS Code can't replicate, restructure it.** Divergence between the editor's highlighting and the runtime's parse is not acceptable — both must agree, since the grammar drives both.

### 15.4 Things that look like grammar bugs but aren't

- **Tree differs from what you expected, but you didn't rebuild the JSON.** Always run `cd definitions && npm run build` (or `npm run watch`) after editing the YAML. The compiled `language/sparkdown.language-grammar.json` is what tests load.
- **The build emits the JSON in _two_ places.** `cd definitions && npm run build` writes both `packages/sparkdown/language/sparkdown.language-grammar.json` AND `vscode-sparkdown/language/sparkdown.language-grammar.json`. Don't hand-edit either copy. If one gets stale (e.g. you copied a fix to one without rebuilding), the runtime and the VS Code extension will diverge with no source-level cause.
- **Snapshot fails because of line endings.** If the working-tree `.sd` files are CRLF but the snapshot was generated against LF, positions shift by 1 per line. `git ls-files --eol` shows the discrepancy. Fix by normalizing to LF. Most commonly triggered by `git stash`/`pop` operations on Windows checkouts with `core.autocrlf` enabled.
- **A rule "doesn't match" but the regex looks right.** Check rule order in the parent `patterns:` list — an earlier rule may be consuming the input. (§10)
- **A construct appears as a sibling of its supposed parent.** The parent's body was forcibly terminated because its `patterns:` list didn't include the construct. Fix the parent, not the construct. (§3.2)

---

# Part VII — Performance

## 16. Incremental re-parse and scope size

**The TL;DR:** the incremental parser re-parses by chunks, the chunk boundaries are top-level `Scoped` rules, and the size of any top-level `Scoped` rule directly determines re-parse cost for edits inside it. If you absorb nothing else from this section, absorb this: **keep top-level scopes small.**

### 16.1 How chunking works

When the user edits a `.sd` file, the parser doesn't re-tokenize the whole document. It identifies which chunk(s) the edit overlaps and re-runs the parser on just those chunks, splicing the new tokens into the existing tree. That's what makes editor responsiveness possible at scale.

The chunk boundaries are **top-level `Scoped` rules** — rules whose `begin`/`end` opens a region directly under the document root. The chunk for an edit is the smallest root-level region that contains the edit position. If your edit lands inside a `Scoped` rule that's at root level, the chunk is that scope's full body. If your edit lands at root level (outside any scoped region), the chunk is just the affected line(s) — tiny.

### 16.2 Two consequences

- **A small edit inside a big top-level `Scoped` rule re-runs the rule's _entire body_.** The chunk is the whole scope, not the line you edited. A 500-line `Scoped` rule means a 500-line re-parse on every keystroke inside it.
- **Nesting doesn't shrink the chunk — it expands it.** If a small `Scoped` rule is included (directly or transitively) inside a larger root-level `Scoped` rule, edits inside the small rule force re-parse of the _entire enclosing_ root-level chunk. The chunk boundary the parser tracks is always the **root-most** scoped ancestor — so it's the size of the outermost wrapping scope that determines re-parse cost, regardless of how deeply nested the actual edit sits.

That second point is the counterintuitive one. "My rule is small, so re-parse should be small" is _wrong_ — what matters is how big the outermost `Scoped` rule above it on the root path is.

### 16.3 The decision rule for new constructs

When picking a shape for a new region-shaped construct, ask: **would a user ever write something this large?**

- **No** (a parenthesized expression, a quoted string, a single declaration line) → `Scoped` rule is fine.
- **Yes** (a scene, a branch, a top-level document section) → don't `Scoped`-wrap it. Capture the _boundary_ (the declaration line, the marker keyword) and let the body live at root. The lowerer can reconstruct the logical hierarchy after the fact.

`Scene` and `Branch` are the canonical examples. Both are `Scoped` rules, but they're scoped only over the **declaration line** (`scene Name(...):` / `branch Name:`) — the body lives at root and the lowerer reconstructs the hierarchy. Concretely, `Scene`'s definition looks like:

```yaml
Scene:
  begin: ^({{WS}}*)(scene)({{EOK}}) # opens at the `scene` keyword
  beginCaptures: { ... }
  patterns:
    - { include: "#SceneWithParametersDeclaration" }
    - { include: "#SceneWithoutParametersDeclaration" }
  end: $|([:]) # closes at end-of-line OR `:`
  endCaptures: { ... }
```

Note the `end` pattern: end-of-line **or** a colon. Either way, the scope closes after the declaration. The next line — the actual scene body — is parsed at root level. The way the parser identifies the _next_ scene's boundary (so this scene's body knows where to stop logically) is the `BEAT` lookahead mechanism shown in §11.

### 16.4 The compromise: `LuauFunctionDefinition`

`LuauFunctionDefinition` is the one root-level construct we _do_ wrap in a `Scoped` rule despite the cost. The reason is **syntax highlighting**: a function body needs different highlighting from the surrounding narrative — Luau identifiers, operators, and keywords look nothing like dialogue — and the only mechanism a TextMate grammar exposes to switch highlighting context for a span of text is a `Scoped` rule with a different `patterns:` list. The grammar has no "context-switch without scope" affordance.

So we accept the bill: a 200-line function re-parses on every keystroke inside it. The bet is that **users will write small functions.** If function bodies routinely get into the thousands of lines, this is where editor lag will show up first.

**Takeaway for anyone adding a new construct:** if you can possibly avoid wrapping a potentially-large region in a `Scoped` rule, do. `LuauFunctionDefinition` is the compromise we settled for; don't add another one without a comparably strong reason.

---

# Part VIII — Reference

## 17. Common pitfalls

A condensed list of the things that bite hardest in practice. Each line links back to the section that explains it in depth.

- **Don't update one regex in two places.** Put it in `variables:`. (§7)
- **Don't put capturing groups inside variables.** Variables expand inline, so a `(...)` group inside a variable definition becomes a capture group of every host rule that uses it — throwing off the host's capture-index mapping. Always wrap variable bodies in `(?:...)`. The host rule decides what to capture, not the variable. (§7.3)
- **Don't pile keywords into a hand-written alternation.** Use an array variable; word boundaries are free. (§7.1)
- **Don't disambiguate via lookahead** when a rule reorder works. (§10)
- **Don't lump captures together.** One capture per meaningful sub-token. (§6.3)
- **Don't wrap potentially-large regions in a `Scoped` rule.** The parser uses **top-level (root-most) scopes** as the unit of incremental re-parse, so a 500-line scoped region means a 500-line re-parse on every keystroke inside it — _including_ keystrokes inside any rule nested deep within it. Scope only the boundary (the declaration line); let the body live at root. (§16)
- **Don't write a loose `begin` pattern on a `Scoped` rule.** Once `begin` matches, the parser commits to the scope and won't back out. (§3.1)
- **Don't forget the `(?={{BEAT}})` bail-out in `Scoped` rule `end:` patterns.** Without it, a forgotten closer lets the rule eat the rest of the document. (§3.1)
- **Don't reference `_cN` node names from the lowerer.** Capture-index names shift whenever the begin/end regex gains or loses a capture group. Wrap semantically-important captures in named rules instead. (§6.4)
- **Don't leave a block's `patterns:` list incomplete.** Anything the parser can't match inside a body silently closes the block at that position. There is no inheritance — each block's `patterns:` list must include the new rule explicitly. (§3.2)
- **Don't forget the `Sparkdown`-prefixed variant.** If you add a new block-shaped construct in pure-Luau context, the sparkdown context usually needs its own variant. (§13.1)
- **Don't set only `tag` or only `name`.** Both, or syntax highlighting breaks in one editor. (§8)
- **Don't use `Whitespace` where `RequiredWhitespace` belongs** (or vice versa). The formatter cares. (§12)
- **Don't infer block scopes from line content alone.** Use the `\1`-back-reference indentation pattern. (§11.1)
- **Don't extend a `begin:`, `end:`, or `match:` pattern past the trailing `\n`.** Matching the `\n` itself is fine; consuming into the _next line's_ content (or referencing it via a cross-line lookbehind/lookahead) is not. VS Code tokenizes one line at a time and won't follow the pattern across; textmate-grammar-tree silently will, so the highlighting and the runtime tree diverge. To span newlines, open the scope on a single line and let `Newline` + a whitespace class inside the `patterns:` array consume the intervening whitespace. (§11.5)
- **Don't have the child rule consume what belongs to the parent.** Use `(?=...)` lookaheads in child end patterns when the terminator is part of the parent's structure. (§11.3)
- **Don't ship without checking VS Code.** Always add a matching `.vsc.snap` for new fixtures so engine divergence shows up as a diff at fixture-add time. If the diff shows divergence, restructure the rule until both engines agree. (§15.3)
- **Don't forget to rebuild.** `cd definitions && npm run build`. (§15.4)

## 18. Useful files to read

- `definitions/yaml/sparkdown.language-grammar.yaml` — the grammar itself.
- `definitions/src/language.ts` — the build pipeline (YAML → JSON, variable substitution, capturing-variable check).
- `packages/textmate-grammar-tree/src/grammar/types/GrammarDefinition.ts` — the full schema of allowed rule properties.
- `packages/textmate-grammar-tree/src/grammar/classes/rules/ScopedRule.ts` — `applyEndPatternLast` logic.
- `packages/textmate-grammar-tree/src/tree/utils/printTree.ts` — the tree printer.
- `packages/sparkdown/src/tests/compiler/grammarSnapshot.test.ts` — the textmate-grammar-tree snapshot harness.
- `packages/sparkdown/src/tests/compiler/vscodeGrammarSnapshot.test.ts` — the VS Code engine snapshot harness.
- `packages/sparkdown/src/compiler/classes/annotators/FormattingAnnotator.ts` — what node names the formatter looks for.

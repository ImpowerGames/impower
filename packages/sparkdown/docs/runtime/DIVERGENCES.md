# Sparkdown Divergences

Sparkdown is built on two upstreams: **ink** (via the inkjs fork at
[`src/inkjs/`](src/inkjs/)) supplies the runtime and the screenplay/scripting
layer, and **Luau** supplies the expression / statement / type syntax. This
document catalogs places where sparkdown intentionally diverges from each
upstream in ways a user familiar with either language might find surprising.

Items that aren't differences but rather _missing-but-planned_ features live in
[`src/compiler/lower/DEFERRED.md`](src/compiler/lower/DEFERRED.md) instead.

Each entry links to the relevant lowerer or grammar rule when possible, so the
description stays grounded in the actual implementation.

---

## Coming from ink

### Glue: `<>` → `..`

Ink's `<>` glue operator becomes `..` between whitespace boundaries. The
grammar's `Glue` rule (`(?<=^|WS)(?:[.][.])(?=$|WS)`) disambiguates it from
Luau's `..` string-concatenation operator, which appears between non-whitespace
operands.

```sparkdown
if true then
  {"a"}
end
.. b
```

The runtime `Glue` output-stream marker is emitted by
[`lowerInlineAction`](src/compiler/lower/lowerers/lowerDisplay.ts) when the
line begins with `..`. Glued lines also skip the line-type metadata tag
(`action` / `dialogue` / etc.) — the tag's inner text would otherwise sit
between the `Glue` marker and the body, preventing the runtime from cleanly
consuming the marker. The glued content conceptually inherits the previous
line's type.

### Explicit statements: `~` → `&` (top level only)

Ink uses `~ x = 5` to introduce a logic line outside a knot. Sparkdown uses
`&` at the top level. Inside function bodies you can omit the prefix
entirely.

```sparkdown
& store x = 5      # top-level declaration (explicit form)
store x = 5        # equivalent — implicit form, also works at top level
& total = total + 1  # top-level reassignment needs the &
```

Without `&`, a bare reassignment at the top level would parse as
[`ImplicitAction`](definitions/yaml/sparkdown.language-grammar.yaml) text. The
declaration form `store x = 5` parses as `LuauVariableDefinition` either way,
which is why `& store x = 5` and `store x = 5` are interchangeable. See
[`lowerExplicitStatement.ts`](src/compiler/lower/lowerers/lowerExplicitStatement.ts).

### Weaves use `choose ... then ... end` blocks, not mark-counting

Ink expresses weave nesting through mark counts: `* * * choice` is a
depth-3 choice nested inside depth-2 nested inside depth-1, and
`- - text` is a depth-2 gather that closes the depth-2 choices.
Sparkdown replaces this with explicit block syntax that matches the
Luau register (`if/then/end`, `function ... end`):

```sparkdown
Marcus stands in the doorway. He's not smiling.
choose
  * "What do you want?"
    "An explanation."
  * "How did you find me?"
    "Wasn't hard."
  * [Wait him out.]
    The silence stretches. He frowns.
    "Tell me what happened."
    choose
      * "Nothing happened."
        He laughs once, sharp. "Try again."
      * "Everything happened."
        He goes very still.
      * "I can't talk about it."
        "You can. You just don't want to."
    then
      He sits down without being asked.
    end
then (optional_label)           -- labeled gather
  "Either way, I'm not leaving until I hear it."
end
-> DONE
```

Translation rules from ink:

- `* * * foo` (depth 3) → single `*` inside three nested `choose` blocks
- `- - foo` (depth 2 gather) → `then` clause of the innermost `choose`
- `- (label) foo` → `then (label) foo`
- Multiple weaves at the same scope: each `choose ... then ... end` is self-contained — write `end` then start the next `choose`. (No chaining shortcut: keeping the close-token explicit avoids relying on indentation for block scoping.)

The `then` body is optional — `choose ... end` with no `then` clause
is fine when every choice diverts away. Conditional gating uses an
inline `if cond` prefix on the choice line — replacing ink's `{cond}`
guard form:

```sparkdown
choose
  * "Always available"
  * if has_key "Unlock the door." -> inside
  * if not has_key "Try the window."
  * if (player.alive and not exhausted) "Run."
end
```

The condition expression is a single identifier, a dotted access path,
an optional `not` prefix, or any parenthesized expression. No `then`
or `end` keyword — the cond ends at whitespace and the rest of the
line is the choice text. This stays in sparkdown's Luau-keyword
register for control flow and keeps `{}` reserved for output-stream
interpolation. The choose block also pushes a `local` scope frame.

Cost vs. ink's syntax: roughly 3 more lines per simple weave (the
`choose` / `then` / `end` keywords). The gain: depth is structural
not numeric (no counting marks), nesting is visually unambiguous,
gathers are labeled-or-not symmetrically with `then (label)` /
`then`, and the syntax matches the rest of the Luau-style block
constructs.

> **Migration status:** ink's legacy mark-counted weave syntax
> (`* * *` for nested choices, `- - text` for nested gathers) is no
> longer accepted — all weaves use `choose ... then ... end`, and
> the bare `- (label)` anchor form is replaced by `label NAME` (see
> below).

### Label anchors: `- (label)` → `label NAME`

Ink uses `- (label) text` to declare a named divert target outside a
weave (typically inside an `if` block or knot, as a jump destination).
Sparkdown replaces it with the dedicated `label NAME` keyword form —
no parens, no overloaded `-` mark, and no collision with the rest of
the Luau-style block syntax. The anchor still captures subsequent
sibling statements as its body via inkjs's weave-assembly, so the
runtime behavior is unchanged.

Ink disallows gathers inside multiline conditionals because its
`{ cond: - branch1 - branch2 }` form uses `-` as the branch-arm
prefix, making a gather's `-` ambiguous. Sparkdown's multiline
conditional is `if cond then ... elseif ... else ... end` and its
label uses a keyword rather than `-`, so anchors appear freely inside
`if` / `elseif` / `else` branch bodies:

```sparkdown
if x == 1 then
  Tom enters.
  -> meet_again
  label meet_again
  The crowd hushes.
end
```

The same applies after the block:

```sparkdown
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

Both shapes work today without lowerer changes — the anchor is a
runtime container that any divert can target by name, and sparkdown's
if-block lowerer just walks the body statements through
`lowerStatements` without filtering. Regression-tested in
`Conditions.test.ts`.

### Conditionals: `{cond: yes|no}` → `if / elseif / else / end`

Ink's inline conditional expression `{cond: yes|no}` maps onto sparkdown's
Luau-style block:

```sparkdown
if x > 0 then
  positive
elseif x < 0 then
  negative
else
  zero
end
```

Lowered by [`lowerSparkdownIfBlock`](src/compiler/lower/lowerers/lowerSparkdownIfBlock.ts).
The `if x then y else z` expression form (inside `return (...)`) is **not yet
implemented** — see DEFERRED.md.

### Alternators: `once / cycle / stopping / shuffle` → `queue / cycle / chain / shuffle`

Ink alternator marker keywords are renamed in sparkdown:

| ink        | sparkdown |
| ---------- | --------- |
| `once`     | `queue`   |
| `cycle`    | `cycle`   |
| `stopping` | `chain`   |
| `shuffle`  | `shuffle` |

`{!a|b|c}` (ink's once-marker syntax) is not supported — use the keyword form
on the alternator block instead.

### Logical operators: keyword form only

| ink    | sparkdown |
| ------ | --------- |
| `&&`   | `and`     |
| `\|\|` | `or`      |
| `!`    | `not`     |

Only the keyword form is exposed in the grammar; the runtime's
`NativeFunctionCall` opcodes were renamed to match
([`NativeFunctionCall.ts:42-54`](src/inkjs/engine/NativeFunctionCall.ts)). Error
messages mention the operator the user actually wrote. Short-circuit semantics
for `and` / `or` are honored as in Luau.

Ink's membership operators (`?` / `!?`, or the `has` / `hasnt` keyword
forms sparkdown briefly exposed) are removed — see
[Membership: method calls, not operators](#membership-method-calls-not-operators)
below.

### Lists → tables

Ink's first-class `LIST` construct (with item arithmetic, list-of-lists, etc.)
maps onto sparkdown's Luau tables. There is no separate `list` keyword; what
ink would express as a `LIST` is an `ObjectValue` populated by an
[`ObjectExpression`](src/inkjs/compiler/Parser/ParsedHierarchy/Expression/ObjectExpression.ts).
Length (`#items`), indexing (`items[k]`), and membership are all implemented;
list-specific arithmetic (`(a, b) + (c)`) is not.

### `local` is block-scoped (unlike ink's `temp`)

In ink, `temp x = ...` is **function-scoped** — there's one temp-var bag
per call-stack frame, and re-declarations within nested branches collide.
In Luau, `local x = ...` is **block-scoped** — an inner `local x` creates
a new binding that shadows any outer `x` for the rest of the inner
block, and the outer `x` is visible again after the block exits.

Sparkdown follows Luau. The compiler emits new `BeginScope` / `EndScope`
control commands around every block body (`if` / `elseif` / `else`, and
future `for` / `while` / `repeat` / `do`), and the runtime's
`CallStack.Element` carries a stack of temp-var maps (innermost-last)
instead of ink's single map. `local x = ...` adds to the innermost
frame; reassignment without `local` walks innermost → outermost to find
the existing binding.

```sparkdown
local x = 1
if true then
  local x = 2
  {x}           -- 2
end
{x}             -- 1
```

vs. ink's `temp` would either error on re-declaration or treat both as
the same binding. The reserved-bytecode change touches `ControlCommand`,
`CallStack.Element`, `Story` (the new command handlers), and the JSON
save format (`temp` → `temps`, an array of maps). Pre-existing saved
states with the legacy single-`temp` format still round-trip — the
loader treats them as a one-element scope stack.

The trade-off: function-scoped `temp` (ink's idiom) is no longer
available — there's no separate keyword for the old shape. If you want
a variable that survives across a block, declare it in the outer scope.

### Functions are expression-only

Ink allows a function body to emit narrative text into the surrounding
flow (a "function-as-subroutine") — `function five() five` returns 5
**and** prints the literal `five` into the calling line's output.
Sparkdown's `function ... end` is strictly expression-returning: the
body parses as Luau-only, and any sparkdown statement that would
yield to the surrounding flow — display lines, choice blocks, diverts,
threads — is **rejected at compile time** with a diagnostic from
`lowerLuauFunctionDefinition`. The lowerer enumerates the legitimate
Luau statement shapes (return, assignment, if/loop/do, explicit-`&`
call, etc.) and flags any other top-level body child.

Authors who want a callable narrative unit should use a `scene` or
`branch` divert with parameters instead — the same composability
without two overlapping callable shapes:

```sparkdown
scene greet(name)
  Hello, {name}.
  ->->

-> greet("Marcus") ->
```

The shared callable surface stays in one keyword family (scene/branch +
divert), and `function ... end` keeps its pure-expression contract
(returns a value, no flow side-effects).

### Ink syntax NOT supported

- **`ref` parameters** — sparkdown follows Luau's value/reference
  semantics: primitives (numbers, strings, booleans) pass by value;
  tables / objects pass by reference. The `ref` keyword is intentionally
  absent — for ref-like semantics on primitives, authors wrap the value
  in a single-key table (`store box = {value = 0}` and mutate
  `box.value` inside the callee) or mutate the relevant `store`
  variable directly (globals are accessible from inside any function).
  This is a deliberate design choice, not a missing feature.
- **Ink function declaration syntax (`=== function f(n) ... ===`)** — use
  `function f(n) ... end` instead.
- **`# tag` content with inline logic** — front matter (between `---`
  markers) is emitted as `# key: value` tags but cannot contain `{expr}`.

### Tag emission

Sparkdown wraps each display line in a `BeginTag` / `Text("<type>")` / `EndTag`
pair before the body to label the line type (`action`, `dialogue:Alice`,
`heading`, etc.). Ink only emits `BeginTag` / `EndTag` for user-written `#`
tags after the line content. If you walk the runtime output stream looking for
specific control commands, expect the extra metadata tags.

---

## Coming from Luau

### `..` is context-sensitive

In Luau, `..` is always string concatenation. In sparkdown it has two
meanings:

- Between whitespace boundaries (start-of-line / spaces) → **glue marker**:
  `.. b`
- Between non-whitespace operands → **string concat**: `"a" .. "b"`

The grammar's `Glue` rule uses lookbehind / lookahead anchors to keep the two
disambiguated. There's no syntax to force one or the other — surround with
whitespace to get glue.

### `&` prefix for bare statements at the top level

Bare reassignments outside function bodies must be prefixed with `&` because
without it they'd parse as `ImplicitAction` display text. Declarations
(`store` / `local` / `const`) work without `&` because they start with a
recognizable keyword.

### `store` declaration keyword

Sparkdown adds `store` alongside Luau's `local`. `store` declares a
ink-style global variable (persisted in save state); `local` is a per-scope
binding (see below); `const` is a once-only declaration (currently lowered
to `var` — see DEFERRED.md). Standard Luau has no `store`.

### Membership: method calls, not operators

Sparkdown removed the dedicated membership operators (ink's `?` / `!?`
and the `has` / `hasnt` keyword aliases sparkdown briefly exposed).
There's no operator-level membership check anywhere in the grammar
now — the equivalents live as receiver methods, dispatched through
the builtin-method registry (see
[`MethodDispatch.ts`](src/inkjs/engine/MethodDispatch.ts)):

| ink            | sparkdown                                        |
| -------------- | ------------------------------------------------ |
| `list ? item`  | `list:find(item) ~= nil`                         |
| `list !? item` | `list:find(item) == nil`                         |
| `set ? subset` | `set:intersection(subset):len() == subset:len()` |

For the common element-membership case (`item ∈ collection`), `:find`
returns the key of the matching entry or `nil` on miss, so it composes
naturally with `if t:find(x) then ... end` / `t:find(x) ~= nil`.
Subset-containment doesn't have a single dedicated method — compose
`:intersection` + `:len`, or define a per-project helper.

Why the change: ink's `?` overloaded "any-element membership" with
"subset containment" depending on operand types — splitting into named
methods makes the intent explicit at the call site, and the receiver-
type dispatch already used for `:union` / `:intersection` /
`:difference` / `:min` / `:max` / `:random` etc. covers it uniformly.
The grammar no longer reserves `has` / `hasnt` as keywords, so authors
can use those words as identifiers (`local has = ...`, `function
hasnt() end`, etc.).

### Math builtins use Luau names, not ink's all-caps form

Sparkdown exposes ink's runtime math builtins under their Luau standard-
library names rather than ink's `FLOOR` / `CEILING` / etc. conventions:

| ink              | sparkdown            |
| ---------------- | -------------------- |
| `FLOOR(x)`       | `math.floor(x)`      |
| `CEILING(x)`     | `math.ceil(x)`       |
| `POW(x, y)`      | `math.pow(x, y)`     |
| `MIN(x, y)`      | `math.min(x, y)`     |
| `MAX(x, y)`      | `math.max(x, y)`     |
| `RANDOM(a, b)`   | `math.random(a, b)`  |
| `SEED_RANDOM(s)` | `math.randomseed(s)` |

The single source of truth is the [`STDLIB`
table](src/inkjs/engine/StdLib.ts) — a plain `{ namespace: { method: fn } }`
object of JS implementations. At engine init, `NativeFunctionCall` walks
the table and registers each function under its dotted full name (e.g.
`"math.floor"`), inferring arity from `fn.length` and registering for
both int and float operand types. The lowerer's
[`stdlibMapping`](src/compiler/lower/utils/stdlibMapping.ts) reads the
same table via `lookupStdLibBuiltin(receiver, method)`, so adding a new
function is a one-line change in `StdLib.ts` — the compiler picks it up
automatically.

See [STDLIB.md](STDLIB.md) for the full coverage matrix — supported
methods, unsupported methods (with implementation notes), and which
ones can't fit the table-driven model (variadic / multi-return /
side-effecting). The goal is eventual full Luau stdlib coverage.

### Narrative-flow builtins live under `count.*`

Ink's `TURNS`, `TURNS_SINCE`, `READ_COUNT`, and `CHOICE_COUNT` builtins
don't have luau-stdlib equivalents (they're ink-specific narrative-flow
queries), so sparkdown groups them under a new `count.*` namespace.
The `count` prefix makes it clear at the call site that these return
numeric _counts_ rather than the things being counted:

| ink                      | sparkdown                 |
| ------------------------ | ------------------------- |
| `TURNS()`                | `count.turns()`           |
| `TURNS_SINCE(-> target)` | `count.turns(-> target)`  |
| `READ_COUNT(-> target)`  | `count.visits(-> target)` |
| `CHOICE_COUNT()`         | `count.choices()`         |

`count.turns` is arity-overloaded — `count.turns()` returns the global
turn counter, `count.turns(-> target)` returns turns since `target` was
last visited. Same conceptual operation ("turn counter against a
reference point"), disambiguated by whether a reference point was
provided. Mirrors `math.log(x)` / `math.log(x, base)` in standard Luau.

`count` is registered as a stdlib namespace
([`LUAU_STANDARD_LIB_CONSTANTS`](definitions/yaml/sparkdown.language-grammar.yaml)),
which means it's **reserved as an identifier** — users can't declare a
variable named `count`. Syntax highlighting tags the name as stdlib at
the source level so the reserved status is visible.

The mappings live in `INK_BUILTIN_ALIASES.count` in
[`StdLib.ts`](src/inkjs/engine/StdLib.ts). Unlike the `STDLIB` table
(which holds JS implementations registered with `NativeFunctionCall`),
these alias entries point at _existing_ ink runtime builtin names —
`FunctionCall.GenerateIntoContainer` already routes those through
dedicated `ControlCommand`s, so the alias table just needs to translate
the source-level name and the runtime path takes over.

### `#` length applies to objects too

In Luau, `#x` returns the length of a string or array-style table. Sparkdown
extends `#` to also work on `ObjectValue` (returning the entry count), so
`#{a=1, b=2}` is `2`. The dispatch lives in `NativeFunctionCall.Length` /
`AddObjectUnaryOp`. See the resolved entry in DEFERRED.md for details.

### Nil

`nil` parses as `LuauNil` but currently lowers to `NumberExpression(0, "int")`
— ink has no distinct nil/null value, and ink treats `0` as falsy, so
`x == nil` and `if not x` work without a separate type. A dedicated
`NilValue` is deferred until a scenario actually needs to distinguish nil
from numeric zero.

### Type annotations are parsed but ignored

`local x: number = 1` and `function f(x: number): string ... end` parse
correctly — the annotation lives in `LuauTypeAnnotationOperation` /
`LuauTypeCastOperation` nodes — but the lowerer drops them. Typecheck-only
use is fine; runtime behavior is the same as if the annotations weren't
there.

### TypeCast (`::`) is a no-op at runtime

`a :: SomeType` lowers to just the expression `a`. Type-only annotation.

### Functions are global, no first-class function values

- `function name() ... end` declares a global function only. There is no
  scoped `local function name()` lowering (the `LuauScopeModifier` is parsed
  but ignored).
- Anonymous function expressions (`return function(...) ... end`) and currying
  aren't supported — ink has no first-class function values. Lambdas in
  expression context produce empty content today.
- No closures.

### No multiple assignment

Luau's `x, y = 1, 2` is parsed but not lowered. Use single assignments.

### Methods: `obj:method(args)` desugars to `method(obj, args)`

Call-site sugar works (the `:` becomes an implicit first-parameter pass).
Receiver-type dispatch (so that `p:swim()` on a `Penguin` looks up
`Penguin.swim` specifically, falling back through `as Bird`) is **not yet
implemented**. Today, write methods as plain global functions whose first
parameter is the receiver. See the _Method calls_ entry in DEFERRED.md for
the planned design.

### Method shorthand inside `define`

Inside a `define` block, method bodies omit the `function` keyword:

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

Standard Luau requires `function name() ... end`. Sparkdown's grammar adds a
`LuauMethodDefinition` rule scoped to `LuauDefine` only — at the top level,
`name()` is still a function-call expression. Note: the lowerer currently
drops these methods (see DEFERRED.md _Function members in defines_).

### Loops are stubbed

`for` / `while` / `repeat` / `do ... end` parse correctly and produce a
`LuauForLoop` / etc. node, but the lowerer is a no-op stub (the body is
dropped). Ink has no native loop primitives; real lowering needs either
desugaring to recursive knots or extending the runtime with loop primitives.

### Sparkdown additions on top of Luau

These don't exist in stock Luau:

- **Display lines** — `:`-prefixed inline forms (`: Hello world`) and block
  forms for `dialogue`, `action`, `heading`, `title`, `transitional`, `write`.
- **Choices** — `+ choice text -> target`.
- **Diverts** — `-> target` for unconditional flow.
- **Threads** — `<- thread_name`.
- **Gathers** — `- (gather_name)`.
- **Scenes / branches / knots / stitches** — top-level navigation structure.
- **Tags** — `# tag` after a line, captured into `currentTags`.
- **Asset lines** — `[[image]]` and `((audio))` mid-line or as their own line.
- **Front matter** — `---` delimited block at the top of a file; each field
  becomes a `# key: value` tag.
- **`define` blocks** — sparkdown's OOP shorthand for typed structs with
  properties and methods. Inheritance via `define X as Y with ...`.
- **`\` line-join** — preserves a single newline between two lines while
  treating the second as plain text. Like glue but newline-preserving.

---

## Runtime / serialization quirks

These don't affect the source language but can surprise anyone inspecting the
compiled bytecode or driving the runtime directly.

### Whole-number floats are serialized as `"<n>.0f"` strings

The JSON wire format distinguishes `7` (int) from `7.0` (float) by emitting
the latter as the string `"7.0f"` rather than the bare number `7`.
[`SimpleJson.Writer.WriteFloat`](src/inkjs/engine/SimpleJson.ts) emits the
marker; `JsonSerialisation.JTokenToRuntimeObject` recognizes it (via
`/^([0-9]+.[0-9]+f)$/`) on the way back in. Without this, `7 / 3.0`'s `2.333…`
would round-trip as `2`.

**Don't `JSON.stringify` the compiled program** if you want the runtime to
preserve int-vs-float typing — the marker is already encoded in the object
form, and re-stringifying mangles it. Use `story.ToJson(writer)` if you need
a string, or pass the already-parsed object directly into `new
RuntimeStory(...)`.

### `SparkdownCompiler.compile()` deletes `result.story`

The `Story` object isn't JSON-serializable for the LSP wire format, so it's
explicitly deleted from the result before return. To get a runnable story,
use `program.compiled` (a JS object) and hand it straight to the constructor:
`new RuntimeStory(program.compiled)`. The constructor accepts either a JSON
string or the parsed object, and the object path is the right one here. See
[`runtimeTestHarness.ts`](src/runtime-tests/runtimeTestHarness.ts).

### Internal whitespace is not collapsed

The inkjs engine was patched to disable whitespace collapsing in the output
stream — sparkdown treats whitespace (including number of spaces between
words) as semantically meaningful for typing-pace effects. See
[`src/inkjs/README.md`](src/inkjs/README.md) for the engine-fork rationale.

### Story exposes `onWriteRuntimeObject`

A callback fired when an `InkObject` is compiled into a runtime object,
useful for recording the runtime path of a particular script statement (for
source-map-style debugging).

# First-Class Functions (design sketch)

> **Status**: design — no implementation yet. This document scopes the
> work needed to support anonymous functions, nested function
> definitions, function-valued return/assignment, and chained
> function/method calls.

## Guiding principle: sparkdown is a superset of Luau

Every valid Luau program is also a valid sparkdown program with
identical semantics. Sparkdown adds narrative-flow primitives (scenes,
branches, choices, divert syntax, display interpolation) on top of
the Luau substrate, but core Luau language features must match Luau
exactly. This includes:

- **Lexical scoping** with block-scoped `local`.
- **Capture-by-reference closures** — inner functions see mutations to
  outer `local`s.
- **`local function f()` recursion** via the standard Luau desugar
  (`local f; f = function() ... end`).
- Operator precedence, associativity, error semantics, etc.

When sparkdown extends Luau, the extensions live in sparkdown-only
keywords (`scene`, `branch`, `store`, `const`, `& ` action, `* ` choice,
etc.). They never shadow or alter Luau's core semantics.

Sparkdown's current function model is **expression-only and statement-named**:
```sparkdown
function double(x)
  return x * 2
end
```
A function is a named, top-level construct. It can be *called* but not
*passed around* — there is no first-class function value. All the
deferred predicate methods in [METHODS.md](METHODS.md) (`:map`,
`:filter`, `:reduce`, `:findindex`, …) are blocked on this.

The four features the user listed for "next" all hinge on the same
core lift:

| Feature | What's needed |
| ------- | ------------- |
| Anonymous functions | Function-expression syntax + a runtime function value |
| Functions inside functions | Function definitions allowed in nested scope; scope-chain semantics |
| Returning functions | Function value as a `return` operand; storable in `store` / `local` |
| Chained calls | Lowerer support for `a():b():c()` / `f()()` |

Three of the four (anonymous, nested, returning) are facets of the same
**first-class function value** lift. Chained calls are a smaller,
mostly-orthogonal lowerer change that doesn't need the runtime lift —
worth doing as a standalone Phase 0.

---

## Phase 0: Chained function/method calls (no runtime lift)

Currently `lowerMethodCall` recognizes a single `LuauAccessPath` ending
in a `LuauFunctionAccessor` paired with a sibling `LuauParenthetical`.
It does not recursively handle `a:b():c()` — only the first pair.

**Scope**: extend `lowerExpression.ts` so each consecutive
`access-path + parenthetical` (or `value + parenthetical`) tuple folds
into an `IndexExpression` / `FunctionCall` chain whose receiver is the
*result of the previous step*.

**No runtime change needed.** Functions still get called by name; what
changes is how the lowerer threads the receiver through the chain.

**Unblocks**:
- Cleaner method composition: `a:union(b):concat(",")` (was already
  noted as a gap in the Methods test)
- `string-literal:method()` form (also noted)
- Function call followed by method: `compute():len()`

---

## The big design decisions (Phases 1+)

### Decision 1: Closure semantics — capture-by-reference ✅

**Locked in: capture-by-reference, matching Luau exactly.** Inner
functions see mutations to outer `local`s. Required by the
superset-of-Luau commitment.

```sparkdown
function make_counter()
  local n = 0
  return function()
    n = n + 1
    return n
  end
end

local c = make_counter()
c() -- 1
c() -- 2
c() -- 3
```

The returned closure holds a reference to `make_counter`'s `n`
binding. The outer call returns, but the binding survives because the
closure points at it. Each invocation reads and writes the same slot.

**Engine implications**:

- A function call's `local` bindings can no longer live purely on the
  callstack — if any escape via a returned/stored closure, they need
  heap lifetime. In JS terms, this falls out naturally: a frame is just
  a `Map<string, AbstractValue>` object, and as long as any closure
  references it, the JS garbage collector keeps it alive.

- Each function call creates a fresh `Environment` (the new heap object).
  The environment carries a reference to its *defining* environment (set
  at closure-creation time), not its caller's environment. This is the
  "static link" model — Luau / JS-style lexical scope.

- Variable lookup for a free name walks the environment chain:
  current frame → defining frame → its defining frame → ... → globals.

- Variable mutation looks up the binding and writes in-place. Since
  closures share environment references, mutations are visible to all
  closures that captured the same frame.

**`store` and `const` are exempt** — they're global, not lexically
scoped. References to `store`/`const` go straight to globals, not
through the environment chain.

> **Note on iteration variables**: Luau-5.1-style numeric `for` (e.g.
> `for i = 1, 10 do`) creates a *fresh* `i` binding each iteration.
> Closures captured inside the loop each see their own `i`. This
> matters once for-loops are implemented — see deferred work in
> `lowerLuauLoopStub.ts`.

### Decision 2: Function value runtime representation — new `FunctionValue` ✅

**Locked in: new `FunctionValue` type** (`ValueType.Function`).

A function value carries:
- A reference to the function's compiled `Container` (the body's
  runtime path).
- A reference to the `Environment` it was created in (the static link).
- The parameter list / arity for call-site validation.

`DivertTargetValue` stays as-is for explicit divert-target literals
(`-> some_scene`); function values are a distinct type because they
need to carry the captured environment, which a plain path can't.

**Runtime invariants**:
- `FunctionValue` is **not serializable**. Per D6 (no function values
  in store-reachable state) and D8 (no mid-function saves), a
  `FunctionValue` can never appear in save state. If the save-state
  serializer ever encounters one, it raises an error — that's a bug
  in the deep-check, not a serializable edge case to handle.
- `typeof(f)` returns `"function"` (matches Luau).
- `f == g` is reference-equality (matches Luau).

### Decision 3: Anonymous function syntax — Luau-style only ✅

**Locked in: Luau-form only** (`function(args) body end`). No arrow
form. One syntax to teach; matches the rest of sparkdown's
Luau-flavored choices.

Sparkdown today reserves `function ... end` for *statement* form.
Allowing the same shape at expression position is straightforward — it
just needs grammar disambiguation: a `function` keyword at expression
position starts an anonymous function; at statement position it starts
a named definition.

```sparkdown
local double = function(x) return x * 2 end
arr:filter(function(x) return x > 10 end)
```

### Decision 4: Nested function definitions

Once anonymous functions land, named nested functions
(`function inner() ... end` inside another `function`) reduce to
sugar:
```sparkdown
function outer()
  function inner()  -- syntactic sugar
    ...
  end
  return inner
end
```
desugars to:
```sparkdown
function outer()
  local inner = function()  -- the anonymous form
    ...
  end
  return inner
end
```

No separate design needed — falls out of anonymous-function support.

### Decision 5: Chained method calls on function results

`f():m()` — call `f`, then call method `:m` on its return value.
This works automatically once Phase 0 lands AND function values are
callable as the receiver of a method call (which they would be — same
as any other value).

`f()()` — calling the result of `f` as a function. Requires the
expression grammar to recognize `<value-expression>(args)` as a
function call. Currently the call syntax is anchored to a *name*
(`LuauFunctionCall` ≈ `<identifier>(args)`).

**Recommendation**: extend `LuauFunctionCall` (or add a sibling rule)
to accept a parenthetical at any value position in the access-path
chain. Same lowerer machinery as chained method calls.

---

## Implementation phases (sequenced)

Because we committed to full Luau semantics (capture-by-reference
closures), the engine work for `Environment` + `FunctionValue` is
required up-front. Phasing focuses on landing the engine machinery
first, then layering syntactic surfaces on top.

| Phase | Scope | Independent? |
| ----- | ----- | ------------ |
| 0 | Chained method/function calls in the lowerer (`a:b():c()`, `f():g()`, `f()()`) | Yes — no runtime change. Worth doing first; fixes the chained-method-call gap surfaced during METHODS implementation. |
| 1 | Runtime: `Environment` heap object + per-call environment chain. Variable lookup/mutation walks the chain. **No new syntax** — invisible refactor of how `local`s are stored. | Self-contained. Existing tests should all still pass; this is plumbing only. |
| 2 | Runtime: `FunctionValue` type (path + captured environment). Compile-time: function references at expression position (`local f = some_named_function`). Runtime: invoking a `FunctionValue`. | Builds on 1. |
| 3 | Grammar + lowerer: anonymous function expressions (`function(args) body end`). Each anonymous function definition snapshots the current environment as its static link. Closures work automatically because of Phase 1+2 machinery. | Builds on 2. |
| 4 | Grammar + lowerer: nested `function name() ... end` blocks. Sugar over `local name = function() ... end` (with the Luau pre-declaration trick for recursion). | Tiny once 3 lands. |
| 5 | Implement deferred predicate methods (`:map`, `:filter`, `:reduce`, `:find(fn)`, `:findindex`, `:foreach`, predicate `:sort`, `:some(fn)` / `:every(fn)`, `:gsub(pat, fn)`). | Builds on 3. Each is ~10 lines in MethodDispatch.ts. |

Order rationale:
- **Phase 0** is independent and fixes a known gap, so do it first.
- **Phase 1** is the deepest engine change but invisible to authors —
  refactoring how `local`s are stored to use the new `Environment`
  type. Doing this *before* function values means we never have a
  half-state where closures exist but capture is broken.
- **Phase 2** is when function values become observable to authors.
- **Phases 3–5** are syntax surfaces that fall out of the underlying
  machinery.

---

## Resolved decisions

- **D1. Closure semantics**: capture-by-reference (full Luau). ✅
- **D2. Function value type**: new `FunctionValue` (`ValueType.Function`)
  carrying path + captured environment. ✅
- **D3. Recursion**: handled by Luau's `local function f` desugar —
  the local binding is created *before* the function value is built,
  so the closure captures the binding-that-will-hold-itself. No
  special-casing needed at the engine level. ✅
- **D4. Anonymous function syntax**: Luau-form only
  (`function(args) body end`). No arrow-form. ✅
- **D5. `store` *declaration* placement**: top-level, scene-body, and
  branch-body positions are all allowed. `store` declarations inside a
  `function` or a block (`if` / `for` / `while` / `do`) raise a
  compile-time error. Scene/branch placement is purely lexical — the
  variable still lives in the global namespace; the placement just
  controls *when* the declaration initializes. **Assignments to
  existing `store` variables are allowed everywhere**, including inside
  functions — functions are the standard way to encapsulate state-
  mutating logic. The rule is only about introducing new bindings, not
  about updating them. ✅
- **D6. Function value in a `store`** (deep): forbidden — `FunctionValue`
  cannot appear anywhere reachable from a store (including nested
  tables). Compile-time error for the literal case
  (`store x = function ...`), runtime error at any store-reachable
  write that would introduce a function value (catches nested-table
  cases like `handlers.click = h`), and a save-state serialization
  error as the final backstop. Authors who want a "persistent callable"
  use a top-level `function` declaration; for a "persistent target",
  they use a `divert-target` literal (`store x = -> scene_name`). ✅
- **D8. Mid-function save is impossible.** Since functions are
  expression-only (cannot yield to display statements or choices —
  closed-by-design per DIVERGENCES.md), no save point can occur with
  a function frame on the callstack. All transient locals and captured
  environments are gone by save time. This is the architectural
  guarantee that makes the "environments never appear in save state"
  invariant hold. ✅
- **D7. Storage strategy**: every `local` allocates on the heap (in
  an `Environment` object). No escape analysis. Heap allocation has no
  save-state cost because locals aren't serialized. ✅

## Save state, rollback, and isolation

Sparkdown draws a sharp line between **persistent state** and
**transient runtime state**:

- **`store` and `const`** are the only persistent variable kinds. They
  declare top-level globals. Save state contains exactly the
  top-level `store` values (plus narrative flow position, read counts,
  random seed, etc. — all already handled by inkjs's existing
  serializer).
- **`local`** is transient runtime state. Locals are created when a
  scope is entered (function call, scene body, block) and destroyed
  when nothing references them anymore. They do **not** appear in save
  state.

### The `store` placement rules (compile-time enforced)

Two rules, both compile-time errors. The key distinction is between
**declaring** a new persistent variable (the `store` keyword
introducing a binding) and **updating** an existing one (a plain
assignment to a variable whose binding was declared elsewhere).

> **R1: `store` *declarations* cannot appear inside a `function` body or
> any block (`if`/`for`/`while`/`do`).** Declarations introduce a new
> persistent variable; the persistent-state namespace must be visible
> at file load time. Putting a `store` declaration inside a function
> means the variable only "exists" when the function is called, which
> doesn't make sense for persistent state.
>
> **Assignments to existing `store` variables ARE allowed everywhere**,
> including inside functions. Functions are the normal way to encapsulate
> game-state-mutating logic.
>
> `store` declarations ARE allowed inside `scene` and `branch` bodies
> (narrative flow nodes). Authors often want to declare scene-specific
> persistent state close to where it's used rather than scattering
> everything at the top of the file. Lexical placement in a scene is
> just organization; the variable lives in the global namespace
> semantically, and is initialized when the declaration's flow point
> is reached.

> **R2: A function value cannot be written to anything `store`-reachable.**
> Closures are runtime-only values whose captured environments are
> transient — they don't survive save/load. Storing one (or putting one
> inside a table that's in a store) would create a dangling reference
> after a round-trip.

Examples:

```sparkdown
-- Allowed: store declaration at top level
store player_name = "Alex"
store currentTimeOfDay = 1

-- Allowed: store declaration inside a scene
scene intro
  store visited_intro = true
  & player_name = "Hero"
  -> hub

-- Allowed: store declaration inside a branch
scene hub
  branch first_visit
    store first_visit_done = true
    -> story
  branch later_visit
    & player_name = player_name .. " (returning)"  -- assignment to existing
    -> story

-- Allowed: function MUTATES existing stores (this is the common pattern)
function advance_time(count: number)
  currentTimeOfDay += count                -- assignment to existing store: OK
  if currentTimeOfDay > #TIME_OF_DAY then
    currentTimeOfDay = 1                   -- same: assignment, not declaration
  end
end

-- R1 violation — store DECLARATION inside a function:
function init()
  store x = 5                              -- compile error: declaration
end

-- R1 violation — store declaration inside a block:
scene intro
  if has_save then
    store loaded = true                    -- compile error: declaration
  end

-- R2 violation — function value into a store:
store callback = function(x) return x end  -- compile error

-- R2 violation — function value reaching a store via a table:
store handlers = {}
function register(h)
  handlers.click = h                       -- runtime error: deep R2 violation
end

-- Workaround for "persistent callable":
function callback(x)                       -- named function — code, not data
  return x
end

-- Workaround for "persistent target":
store on_chapter_end = -> credits          -- divert-target value: OK in store
```

The compile-time check for R2 catches the common case where a function
literal is the immediate RHS of a `store` declaration. Indirect cases
(writing a function value into a table reachable from a store) are
caught by a runtime deep-check at `VariableAssignment` and indexed-write
time. A third defense — the save-state serializer rejecting any
`FunctionValue` in globals — catches anything that somehow slipped
through the first two.

### Save / load (cold serialization to JSON)

Unchanged from today. The serializer walks `VariablesState` (the
top-level stores) plus narrative flow state. **Locals are never saved**
— they're rebuilt by the runtime when the script replays from the
save point.

`Environment` objects (the heap-allocated `local` storage introduced
for closures, see "Always-heap" below) live entirely outside the save
file.

### Why mid-function saves are impossible

A potential concern with capture-by-reference closures is what happens
if a save is triggered while a function is mid-execution — would the
captured environment need to be serialized?

**Sparkdown's answer: it can't be, because saves can't happen
mid-function.** Per DIVERGENCES.md, sparkdown functions are
*expression-only*: they cannot emit narrative text, cannot pause for
choices, cannot yield to display statements. A function call runs
synchronously from call to `return`, then control resumes at the
caller.

Save state is captured at narrative-flow points (between display
lines, before choices, after diverts). At every save point, **no
function is mid-execution and the callstack contains only flow frames
(scenes / branches / tunnels), never function frames**. All transient
locals — including any closures created during a function call — are
gone by save time because their frames have popped.

This gives Phase 1 a clean guarantee: **captured environments never
appear in save state**.

### R2 deep-check (closing the indirect-persistence escape hatch)

The one way a closure could *try* to leak into save state is by being
written into a `store`-reachable location indirectly:

```sparkdown
store handlers = {}                    -- table in store

function register(h)
  handlers.click = h                   -- closure → table → store
end                                    -- runtime error here
```

R2 ("no function value in a `store`") must be **deep** to catch this.
Implementation:

1. **Compile-time** catches the direct case (`store x = function …`).
2. **Runtime check on store-reachable writes** — every time a value is
   assigned into a store, or into a table reachable from a store
   (including indexed writes like `t[k] = v` and method-call results
   re-assigned to a store), recursively scan for `FunctionValue`. If
   found, raise a runtime error pointing at the assignment site.
3. **Save-state serializer** is a final defense — if a `FunctionValue`
   somehow survives to serialization, error there too.

The runtime scan is cheap in practice (most assignments are
primitives, and `instanceof FunctionValue` is fast). And it makes the
"closures are transient" guarantee bulletproof.

### Rollback (within-session state patching)

Unchanged from today. `StatePatch` continues to track only global
writes; `local` writes don't need patching because:

- Locals can't outlive their enclosing call past the next save point.
- After rollback, the runtime replays from the save point, which
  recreates any locals naturally.

This is consistent with the "save state = top-level stores" invariant.

### `EvaluateFunction` isolation (host API)

**Automatic** under the `store`-top-level rule. A function the host
evaluates can mutate things in two places:

1. Its own frame's locals — discarded when the frame pops. Zero leakage.
2. Top-level `store`s — already isolated via the existing `StatePatch`
   mechanism (write through patch, revert on pop).

The host-evaluated function **cannot** reach any local in the
paused game callstack because:
- Its captured environment (if any) is the environment where the
  function was *defined*, not where the host called it.
- `local`s are unreachable from `store`s by the placement rule.
- The paused game callstack's frames are not part of the host call's
  environment chain.

No extra isolation work needed for closures.

### Storage strategy: always-heap

Every `local` allocates a heap slot in an `Environment` object. This
is required by capture-by-reference semantics — a `local` captured by a
closure must outlive its enclosing function call.

**No escape analysis.** Predictable, simple, eliminates a class of
"captured-or-not" bugs. The locals-don't-need-saving rule above means
heap allocation has no save/rollback cost — it's just a JS heap
object that gets GC'd when no closure or active frame references it.

For sparkdown's scale (narrative scripts, not hot-loop game logic),
heap allocation per local is plenty fast. Escape analysis could
land later as an optimization if profiling shows a problem.

---

## Still-open questions

1. **Method-call form on function values**: `f:call(...)` — Luau has no
   built-in `:call` method on functions; you just write `f(...)`. Should
   sparkdown forbid `:method()` syntax on a function-typed receiver
   (compile-time error), or let it fail at runtime ("function value has
   no method `xxx`")? Runtime error is more permissive; compile-time is
   more helpful. Leaning compile-time once we have static type info,
   but not a blocker.

2. **Predicate-method ordering**: once Phase 3 lands, do we implement
   the deferred predicate methods (Phase 5) before considering
   first-class functions "done", or ship Phases 0–4 and treat Phase 5
   as a separate follow-up? Recommendation: ship Phases 0–4 with at
   minimum `:map`, `:filter`, `:foreach` to prove the integration, then
   the rest follow.

3. **Method calls on function-returning expressions** (Phase 0
   sub-case): `f():g()` where `f()` returns a `FunctionValue`. Phase 0
   handles the parser/lowerer side, but Phase 2 needs to make calling
   a function-typed receiver work — they intersect cleanly.

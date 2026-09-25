# Sparkdown Runtime Guide

The runtime is the bytecode interpreter that executes a compiled story. It lives in `src/inkjs/engine/` and is forked from inkjs with sparkdown-specific extensions. Most of the interpreter is general-purpose ink semantics; the deltas this guide focuses on are the points where sparkdown's language design needs runtime support.

If the grammar produces the tree and the lowerer produces the ParsedHierarchy, the runtime executes the bytecode the lowerer's emit eventually becomes (via inkjs's `ExportRuntime`).

> **Companion docs:** [`GRAMMAR.md`](./GRAMMAR.md), [`LOWERING.md`](./LOWERING.md).

---

## 1. Layout

```
packages/sparkdown/src/inkjs/
├── engine/
│   ├── Story.ts                # main interpreter loop, PerformLogicAndFlowControl
│   ├── StoryState.ts           # the mutable run state (call stack, output, eval stack)
│   ├── VariablesState.ts       # global vars
│   ├── CallStack.ts            # call-stack elements (each has its own temp-var scopes)
│   ├── ControlCommand.ts       # the enum of control-command opcodes
│   ├── NativeFunctionCall.ts   # operators (+, *, ==, and/or/not, ...) as native funcs
│   ├── Value.ts                # IntValue, FloatValue, StringValue, ObjectValue, etc.
│   ├── Container.ts            # bytecode container with named child lookup
│   ├── PluralRules.ts          # CLDR plural categories for plural() alternator
│   └── ...
├── compiler/
│   ├── Compiler.ts             # orchestrates ExportRuntime → JSON
│   └── Parser/ParsedHierarchy/ # the ParsedObject classes (input to ExportRuntime)
└── tests/                      # original inkjs spec tests (NOT run; see DIVERGENCES.md)
```

The interpreter's hot path is `Story.Step()` and `Story.PerformLogicAndFlowControl()`. Most behavior changes land in `PerformLogicAndFlowControl`'s switch over `ControlCommand.CommandType`.

---

## 2. Bytecode in 60 seconds

A story's bytecode is a tree of `Container`s. Each container has an array of children: control commands, literal values, named references, and sub-containers. Common items:

| Token | Meaning |
|---|---|
| `"ev"` / `"/ev"` | `EvalStart` / `EvalEnd` — enter/exit expression-evaluation mode |
| `"out"` | `EvalOutput` — pop value, append to output stream |
| `{"VAR?": "name"}` | Variable reference — push the variable's value onto the eval stack |
| `{"VAR=": "name"}` | Variable assign — pop value, assign to variable |
| `{"temp=": "name"}` | Temp-var bind — pop value, bind as function parameter |
| `{"f()": "target"}` | Function call (or knot divert that returns) |
| `{"->": "target"}` | Divert (unconditional flow transfer) |
| `{"->": "target", "c": true}` | Conditional divert (only if top-of-stack is truthy) |
| `"pop"` | Pop and discard top of eval stack (used for discard calls) |
| `"+"`, `"-"`, `"*"`, `"=="`, ... | Native function calls (operators) |
| `"str"` / `"^literal"` / `"/str"` | Build a string literal |
| `"obj{"` / `"}obj"` | Build an `ObjectValue` (table) |
| `"idx="` | `StoreIndex` — pop value+key+base, set base[key]=value |
| `"scope{"` / `"}scope"` | Push/pop a temp-variable scope frame |
| `"done"` | Story ends here |

Containers can be named (`{"my_label": [...]}`) so diverts can target them by path.

The `ToJson()` method serializes the runtime tree. Snippet:

```typescript
console.log(ctx.story.ToJson());
// → {"inkVersion":22,"root":[[...bytecode...],"done",{"global decl":[...]}], ...}
```

When debugging, dump the JSON and read it. The opcodes are mnemonic.

---

## 3. The Step loop

```
Story.Continue()
└─ Story.ContinueAsync()
   └─ Story.ContinueInternal()
      └─ loop: ContinueSingleStep()
                ├─ Story.Step()                       — execute one instruction
                │  ├─ PerformLogicAndFlowControl()    — handle control commands
                │  └─ (otherwise treat content as output)
                └─ check stopping conditions (newline, choice, done)
```

`Step()` advances the pointer one element. If the element is a control command, `PerformLogicAndFlowControl` handles it (this is where most semantics live). Otherwise it's plain content (text, value), which gets appended to the output stream.

The loop keeps stepping until:

- A newline is emitted to the output stream (return one line at a time),
- The story produces choices (waiting for user selection),
- `done`/end-of-content is reached,
- An error occurs.

### 3.1 Display tables

Every line of visible text the compiler lowers reaches the output stream through the `display` stdlib function (`StdLib.ts`), which the compiler calls with a table: `{ target?, character?, text, pause?, extend?, glue?, continues?, inherit?, group?, tags? }`, `{ load }` for a `load` line, or `{ parts }` for a picked choice whose tags sit between its words (`display` joins the parts into `text` and `tags`). `display` pushes the table's tags as `BeginTag` … `EndTag` spans, then the table itself as an `ObjectValue`, then a closing `"\n"` that ends the step. The `print` stdlib function is the one other producer of a table: it builds `{ text }` from its arguments and pushes it and a closing `"\n"` the same way, or, inside string evaluation, pushes its text as a plain string.

Glue needs a mark on each side, and the story decides each join as it runs. A table with `glue` (a line that ends with `..`) leaves its newline pending, as a caption does (below), and sets `StoryState.lineJoinable`; a table with `extend` (a line that ends with `..` before a `>` break) writes its newline, ending the step at the click, and sets it too. Any output that shows something clears the flag, so the offer lasts only until the next thing the run shows. It is saved with the state, since a click falls between the two steps of an `extend`, and `ChoosePathString`, a picked choice and a host call that runs against its own output stream (below) drop or suspend it. A table with `continues` (a line that begins with `..`) reads the flag before it writes anything. When it is set, `display` clears it and drops the pending newline, so after `glue` the table joins the same step, and after `extend` it begins the step the interpreter carries on in the box. A line a divert holds open (the output stream has content, does not end in a newline, and no newline is pending) is already joined, so it passes too. Otherwise `display` raises a runtime warning, "This line begins with `..`, but the line shown before it does not end with `..`, so it does not join it.", and takes `continues` off the table, so the line shows as a line of its own. Inside a block body the compiler joins lines itself, and it places a `__unjoined()` stdlib call, stamped with the mark, at each line that begins with a lone `..`; the call raises the same warning on that line. The check reads only what the run has already written. A preview route search runs with its error handler silenced, so the warning reaches the author when the path is played: the web player logs it with its source location and stops the run, as it does for every runtime warning.

Two flags change the closing newline. A table with `open` writes none: the next display call joins its line, and the step runs on until a call closes it. A table with `caption` (a `choose` block's last caption line) leaves the newline pending (`StoryState.lineEndPending`): if the step reaches its choices, or the story's end, without showing anything else, it completes with the caption and the choices together. The first output that shows something (text that is not only whitespace, a display table or a tag) marks the output stream where it starts (`outputCut`). The continue ends after that step: its output ends at the mark with the pending newline, and the rest moves to the flow's carried step (`Flow.carried`), which the next continue starts from, so nothing is run twice. The carried step holds the output past the mark, whether that output's own line still waits (it may end with a caption of its own), and the content paths run while the line end waited. Those paths are held back from `onExecute` (`StoryState.heldPaths`) because they ran for the output past the mark: the next continue reports them as it starts, so the game credits their lines to the beat that shows them. When no cut comes, they are reported as the continue ends. The caption's own statement finishes after its line end starts waiting, so its last instructions are held too and its line is also reported with the next continue; the caption's first instructions are reported in its own continue, which is where the preview finds its line. The carried step is saved with the flow as `carried` (`output`, and `lineEndPending` and `paths` when set). A step that leaves the story unable to continue keeps its output whole, with the newline written at the mark, since no continue follows to carry it to. `ChoosePathString` drops a pending line end and a carried step, since what they would show belongs to the path the host leaves, and so does `StoryState.ForceEnd`, which a host's `ResetCallstack`, the story's own end (`fin`) and an error all reach; the caption's text stays, without its newline, as a story that ends does not start another line. A call that runs a story function against an output stream of its own (`EvaluateFunction`, `CallLuauFunction`, and `pcall` of a function the story defines) suspends the pending newline, the cut, the held paths and the carried step while it runs, since what it shows never reaches the story's steps; a host calling `EvaluateFunction` between continues leaves the carried step for the story's next continue.

What a step collected is read two ways:

- `currentText` includes each table's `text`, in stream order, beside any other text on the stream, so text reads the same whether it came from a table or not.
- `currentDisplayInstructions` returns the step's tables in order. The engine's interpreter (`InterpreterModule.queue` in `spark-engine`) builds the step's beat from them: the first table that names a `target` routes the beat, with its `character` as the dialogue cue, and the body is `currentText`. A step whose tables name no target renders on the default target. A table with `pause` set came from a beat a `>` break ends, and its beat waits for a click even when it has no text. A table with `extend` set came from a beat whose text ends with `..` before a `>` break (`A .. >`): the interpreter keeps the box that beat shows in its saved state, since a checkpoint between the two parts must carry on in it. A step carries on in that box only when its first table has `continues`, which `display` leaves on only when the line shown before offered to join; any other step starts a new box (see DIVERGENCES.md's glue section). A glued continuation's tables name it with `group` (its file and starting offset), and the interpreter remembers each beat's routing with the last `group` its tables carried, since glue can hold several continuations open in one step and the beat after a break belongs to the last of them. A beat that sets `inherit` takes that remembered routing only while the beat its own `group` names is the one just queued; otherwise it routes by its own table, which names the line the source reads before the continuation. The remembered routing belongs to the run rather than to the story, so it is not part of the interpreter's saved state — two runs that reach the same story position save the same bytes, which is what a resumed route is checked against. `clearQueuedBeats` and a program update drop it, and a run that loads a checkpoint remembers nothing, so a continuation's beat reached that way routes by its own table, as one reached by a jump does.

Glue joins lines across tables as it joins text: a glued line's table joins the step the glue holds open, so one step may carry several tables.

A table's `text` is a captured string, evaluated between `BeginString` and `EndString`. A tag cannot end inside one (`EndTag` there is taken for a choice label's tag and goes to the evaluation stack), so a line's tags ride the table's `tags` instead, and an inline-glued alternator arm's tag is a runtime `Tag` object, which `EndString` moves back onto the output stream.

---

## 4. How a line ends

A continue returns at the newline that ends its line. `ContinueSingleStep` runs one step and reports whether the output stream now ends in a newline outside string evaluation (`StoryState.outputStreamEndsInNewline`), and `ContinueInternal` stops there, or when the flow cannot continue. The story rests just after the newline. Everything after it, whether logic, the choices, the story's end or a fallback choice, runs in the next continue, once and in order.

Nothing that runs is taken back, so the runtime keeps no copy of the state to return to and no undo log for variables or table writes, and a host binds an external function with only its name and its implementation (`BindExternalFunction(name, fn)`). An opcode that mutates shared state in place, such as `StoreIndex` writing into a table's `Map`, needs no extra bookkeeping.

What that means for a caller:

- A continue may complete with no text. After a line, the next continue can run through logic to the choices and raise them with no text, reach the story's end with nothing (`canContinue` false and no choices), or follow a fallback choice into the content after it. The game makes a beat of choices alone and makes no beat of a continue that brings nothing.
- A `choose` block's caption shows with its choices because the caption's newline waits (§3.1). A line written before the block returns alone, and the choices come with the next continue.
- A host function called between two lines runs in the continue that reaches it. One interpolated into a line runs as that line is built.
- A table with `open` writes no newline (§3.1), so the next display call joins its line before any newline is written, and the line ends where the joined line's newline is.

When a caption's pending newline is written at a cut (§3.1), the continue ends after the cutting step and the carried output starts the next one. Carried output that already ends its line is returned by that continue without stepping.

---

## 5. Variable resolution

`Story.ts > VariableReference` branch is the single read path:

```typescript
foundValue = this.state.variablesState.GetVariableWithName(varRef.name);

if (foundValue == null && varRef.name && varRef.name.includes(".")) {
  // Dotted-name fallback: split on '.', walk down ObjectValue maps.
  const segs = varRef.name.split(".");
  let cur = this.state.variablesState.GetVariableWithName(segs[0]!);
  if (cur != null) {
    for (let i = 1; i < segs.length; i++) {
      const obj = (cur as any)?.value;
      if (obj instanceof Map) {
        cur = obj.get(segs[i]!) ?? null;
        if (cur == null) break;
      } else { cur = null; break; }
    }
    if (cur != null) foundValue = cur as Value;
  }
}
```

Two paths:

1. **Flat lookup** — `GetVariableWithName(name)`. Hits temp vars (per-call-stack scopes), then globals.
2. **Dotted fallback** — for `t.value` when no flat variable `"t.value"` exists, split the name and walk the table.

The dotted fallback is sparkdown-specific (ink uses hierarchical knot.stitch paths instead). When adding new value containers that should support `.` access, make sure their inner storage is a `Map` (or wire them into this walk).

---

## 6. Scopes and the call stack

```
CallStack
└── elements[]
    └── element
        ├── currentPointer    — what bytecode position we're executing
        ├── type              — Tunnel / Function / Thread
        ├── temporaryScopes[] — stack of Map<string, Value> for temp vars
        └── ...
```

Each call-stack element has its own `temporaryScopes`, which is a stack of frames. Block scopes (`BeginScope`/`EndScope`) push/pop on the innermost element's `temporaryScopes`.

- `BeginScope` → push a new empty Map.
- `EndScope` → pop (refuses to pop the last frame, which is the function-level scope).
- `temp=` (TempVarAssign) → set in the innermost frame.
- Variable lookup → walk frames innermost-to-outermost, then fall to globals.

When the lowerer emits `wrapInScope([...])` around an if-body, those translate to `BeginScope`/`EndScope` so a `local x` inside the if doesn't leak to the surrounding function.

**If you add a new block-shaped construct (loops, etc.), wrap its body in `wrapInScope`** at the lowerer level. The runtime will already know what to do.

---

## 7. Functions

Two related runtime objects:

- **`FunctionCall`** (parsed-hierarchy) — emits a `Divert` to the target with `pushesToStack = true, stackPushType = PushPopType.Function`. The runtime treats this as a function call: pushes a stack element, jumps to the target, returns when the target returns.
- **`{"f()": "name"}`** in bytecode — the serialized form.

Built-in operators (`+`, `*`, `==`, `and`, `or`, `not`, `..`, `#`, etc.) are *also* function calls — they target `NativeFunctionCall`s registered at story creation. `NativeFunctionCall.Call(params)` handles operator dispatch by value type:

- Two `IntValue`s → integer impl.
- Two `FloatValue`s → float impl.
- Two `StringValue`s → string impl (concat for `..`, comparison for `==`).
- `ObjectValue` length via `#`.
- List operations get a separate path.

The dispatcher in `NativeFunctionCall.Call` coerces operands to a single type first (mixed int/float → float; mixed types → strings).

**To add a new operator:** define the name in `NativeFunctionCall`, register impls via `AddIntBinaryOp` / `AddFloatBinaryOp` / `AddStringBinaryOp` / `AddObjectUnaryOp` (etc.) in the constructor, wire it into `UnaryExpression.nativeNameForOp` or `BinaryExpression.nativeNameForOp` (in the parsed hierarchy), and add the token in the grammar.

---

## 8. ObjectValue (tables) — runtime details

`ObjectValue` wraps a `Map<string, AbstractValue>`. Important properties:

- The **same Map** is referenced by every variable that holds the value. Mutations propagate through references (luau-table semantics, this is intentional).
- The Map is **not deep-cloned** on save/load. If you need value semantics for a table, copy it explicitly in user code.
- Property reads via `IndexValue` opcode (pops key + base, pushes value) handle both `ObjectValue` (Map key lookup) and `StringValue` (1-indexed character access).
- Property writes via the `StoreIndex` opcode (`idx=`, §2), which sets the key in place.

Tables are how sparkdown represents structured data — they replace ink's separate `LIST` type. The `define X with ...` construct also lowers to a table-like structure.

---

## 9. Adding a control command (worked example)

Suppose you need a new operation `MyOp` that pops two values and pushes a custom result.

1. **Define the opcode** in `engine/ControlCommand.ts`:

   ```typescript
   public static CommandType = {
     ...
     MyOp: "myop",
   };
   ```

   And a factory:

   ```typescript
   public static MyOp(): ControlCommand {
     return new ControlCommand(ControlCommand.CommandType.MyOp);
   }
   ```

2. **Register JSON serialization** if the opcode has a printable name. Check `JsonSerialisation.ts` — the existing pattern is a string-to-CommandType map.

3. **Handle the opcode** in `Story.ts > PerformLogicAndFlowControl`:

   ```typescript
   case ControlCommand.CommandType.MyOp: {
     const b = this.state.PopEvaluationStack();
     const a = this.state.PopEvaluationStack();
     // ... compute ...
     this.state.PushEvaluationStack(result);
     break;
   }
   ```

4. **Emit the opcode** from a ParsedObject's `GenerateRuntimeObject`. See `StorePropertyAssignment.ts` for an example that emits `EvalStart; base; key; value; StoreIndex; EvalEnd`.

5. **Wire it into a lowerer** so the new opcode actually gets emitted from grammar tree input.

6. **Test end-to-end** via a runtime fixture.

---

## 10. Debugging the runtime

### 10.1 Bytecode dump

```typescript
const ctx = makeRuntimeStoryFromSource(src);
console.log(ctx.story.ToJson());
```

Read the resulting JSON. The bytecode vocabulary (§2) is mnemonic. Most runtime bugs are visible here as "the wrong opcode sequence was emitted." If the bytecode is right but execution is wrong, it's a runtime bug; if the bytecode is wrong, it's a lowerer bug.

### 10.2 Step-by-step Continue

```typescript
while (ctx.story.canContinue) {
  console.log("continue:", JSON.stringify(ctx.story.Continue()));
}
```

This shows you one line of output at a time. If a particular line shows up with unexpected content, that's where to focus.

### 10.3 Instrument opcodes

The fastest way to find a runtime issue is to add a `console.log` at the start of the opcode handler in `Story.ts`. For example:

```typescript
case ControlCommand.CommandType.StoreIndex: {
  const storeValue = this.state.PopEvaluationStack();
  const storeKey   = this.state.PopEvaluationStack();
  const storeBase  = this.state.PopEvaluationStack();
  console.log("[idx=]", "base=", debug(storeBase),
              "key=", storeKey?.toString(),
              "val=", storeValue?.toString());
  ...
}
```

Run a test that exercises the path. The trace shows *exactly* how many times the opcode fires, with what operands. Comparing how many times it fires with how many times the source should run it is often how a lowering bug surfaces.

Remove the `console.log` before committing.

### 10.4 Common runtime symptoms

| Symptom | Likely cause |
|---|---|
| `Variable not found` warnings on names that should exist | Lookup is happening before the declaration; or temp-var scope was popped early; or dotted-name fallback can't traverse (check Map type at each segment). |
| `target not found: -> X.Y.Z` | Path resolution can't find the target. Verify the named container exists in the bytecode JSON (look for `{"X": [..., {"Y": [..., {"Z": ...}]}]}`). |
| Infinite loop / worker crash | Recursive call with no base case, or a divert chain that loops back without progress. Check the divert path. |
| Output text doubled / missing newlines | Wrong text/newline emission in the lowerer. Step through with `Continue()`. |
| `Cannot read property 'value' of null` | A primary expression lowered to nothing; check the lowerer for the input shape. |

---

## 11. What's intentionally different from inkjs

See [`DIVERGENCES.md`](./DIVERGENCES.md) for the full list. Highlights relevant when reading the engine:

- **Property access on tables** — sparkdown allows `obj.field` for tables; inkjs uses `obj["field"]`. Implemented via dotted-name fallback in `VariableReference` (§5).
- **`store` / `local` / `const`** scope modifiers in place of ink's `VAR` / `~ temp` / `CONST`.
- **`&` discard-call statements** instead of `~ fn(args)`.
- **`store t = { value = 5 }` tables** in place of ink's `LIST`.
- **`define X with ...`** in place of inkjs's struct/list union.
- **Plural categories via CLDR** — `plural(n) | one = "a" | other = "b"` uses `PluralRules.ts` for category lookup, indexed by `lang.current`.

If you find a runtime feature that doesn't match inkjs's spec test, check DIVERGENCES.md before treating it as a bug — it may be deliberate.

---

## 12. Pitfalls

- **Calling `SetGlobal` without going through `VariablesState.Assign`.** `Assign` resolves whether the target is global or temp; `SetGlobal` is unconditional. Use `Assign` from runtime contexts unless you specifically know you want global.
- **Forgetting to pop the eval stack after a value-emitting call you don't want output.** Use `pop` opcode, or set `shouldPopReturnedValue = true` on the `FunctionCall`.
- **Mutating a value retrieved from globals when a copy was meant.** Reads return the same reference that's stored, so an in-place write is seen by every variable that holds it. Replace the value through `SetGlobal` to change one variable alone.
- **Assuming the eval stack is empty between top-level instructions.** It usually is, but some intermediate states leave values on it. Trace with `PrintEvaluationStack` if you're unsure.

---

## 13. Useful files to read

- `engine/Story.ts` — `Step`, `ContinueSingleStep`, `PerformLogicAndFlowControl`. Most behavior lives here.
- `engine/StoryState.ts` — the output stream (`PushToOutputStream`, `outputStreamEndsInNewline`), the pending line end and the carried step.
- `engine/VariablesState.ts` — `Assign`, `SetGlobal`, `GetVariableWithName`.
- `engine/ControlCommand.ts` — the opcode enum (full vocabulary).
- `engine/NativeFunctionCall.ts` — operator implementations.
- `engine/Value.ts` — `IntValue`, `FloatValue`, `StringValue`, `ObjectValue`, `ListValue`, `DivertTargetValue`, etc.
- `engine/Container.ts` — bytecode container + named-child lookup.
- `compiler/Parser/ParsedHierarchy/Variable/StorePropertyAssignment.ts` — example of emitting a multi-opcode sequence.

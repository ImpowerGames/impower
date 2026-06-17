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
│   ├── VariablesState.ts       # global vars, with patch-aware get/set
│   ├── StatePatch.ts           # snapshot patch: deferred writes + property-mutation undo log
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
                ├─ (newline/lookahead bookkeeping)
                └─ check stopping conditions (newline, choice, done)
```

`Step()` advances the pointer one element. If the element is a control command, `PerformLogicAndFlowControl` handles it (this is where most semantics live). Otherwise it's plain content (text, value), which gets appended to the output stream.

The loop keeps stepping until:

- A newline is emitted to the output stream (return one line at a time),
- The story produces choices (waiting for user selection),
- `done`/end-of-content is reached,
- An error occurs.

---

## 4. The state snapshot — and why it matters

Sparkdown inherits ink's **newline-lookahead state snapshot** mechanism. When the output stream ends in a newline and there's more bytecode to execute, the runtime:

1. Takes a snapshot of the current state.
2. Keeps executing.
3. After the next step, checks whether the extended output would "extend beyond the newline" (i.e. produce more text on the same logical line). If so → restore the snapshot, return only up to the newline; if not → commit and continue.

This lets ink decide on a per-line basis whether `text\n` should be one line or whether more text glues onto it.

The mechanism works via a **`StatePatch`** attached during the speculation window:

- Variable assignments (`SetGlobal`) go into `patch._globals` instead of the real `_globalVariables`.
- On commit (`ApplyAnyPatch`) the patch's globals are written to `_globalVariables`.
- On rewind (`RestoreStateSnapshot`) the patch is discarded — globals are unchanged.

### 4.1 The trap: in-place mutations bypass the patch

Most state changes are "set the variable named X to value Y" — the patch sees these via `SetGlobal`. But some operations mutate state *in place*:

- **`idx=` (`StoreIndex`)** — mutates an `ObjectValue`'s internal `Map` directly.
- Any future operation that mutates a shared reference.

These operations write to objects that are also referenced from outside the patch. The patch can't undo them by discarding itself.

### 4.2 The fix pattern: explicit undo log

For `StoreIndex`, the runtime records each mutation in `patch._propertyMutations` (a `(map, key, oldValue)` triple). On `RestoreStateSnapshot`, `UndoPropertyMutations` walks the log in reverse and restores each entry. On commit, the log is dropped (the mutations have already been applied to the real Map).

```typescript
case ControlCommand.CommandType.StoreIndex: {
  const storeValue = this.state.PopEvaluationStack();
  const storeKey   = this.state.PopEvaluationStack();
  const storeBase  = this.state.PopEvaluationStack();
  if (storeBase instanceof ObjectValue) {
    const keyStr = storeKey?.toString() ?? "";
    const val = asOrNull(storeValue, AbstractValue);
    if (storeBase.value && val !== null) {
      // Record undo entry while a snapshot is active.
      const patch = this.state.variablesState.patch;
      if (patch !== null) {
        const oldValue = storeBase.value.has(keyStr)
          ? storeBase.value.get(keyStr) : undefined;
        patch.RecordPropertyMutation(storeBase.value, keyStr, oldValue);
      }
      storeBase.value.set(keyStr, val);
    }
  }
  ...
}
```

If you add another opcode that mutates shared state in-place, **mirror this pattern**: detect snapshot mode, record an undo entry, then mutate.

### 4.3 Lookahead-unsafe escape hatch

There's also a coarser-grained mechanism: `_sawLookaheadUnsafeFunctionAfterNewline`. When set during a lookahead, `RestoreStateSnapshot` skips its normal rewind. External function calls use this when marked `lookAheadSafe: false`. It's appropriate when:

- The side effect can't reasonably be undone (e.g. an external function called user-supplied JS code).
- The operation is rare enough that committing-forward is fine.

Prefer the explicit-undo pattern when possible. Use the lookahead-unsafe flag only when undoing is genuinely impractical.

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

1. **Flat lookup** — `GetVariableWithName(name)`. Hits temp vars (per-call-stack scopes), then globals (with patch awareness).
2. **Dotted fallback** — for `t.value` when no flat variable `"t.value"` exists, split the name and walk the table.

The dotted fallback is sparkdown-specific (ink uses hierarchical knot.stitch paths instead). When adding new value containers that should support `.` access, make sure their inner storage is a `Map` (or wire them into this walk).

`VariablesState.GetVariableWithName` goes through `TryGetGlobal` which checks the patch first. The dotted fallback respects this because the *first segment* lookup goes through the same path; the inner Map walk is non-patched, which is fine because Map mutations are tracked by the undo log (§4.2).

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
- The Map is **not deep-cloned** on save/load by default. State snapshots track mutations explicitly via the undo log (§4.2). Background saves don't currently deep-clone either — if you need value-semantics for a table, copy it explicitly in user code.
- Property reads via `IndexValue` opcode (pops key + base, pushes value) handle both `ObjectValue` (Map key lookup) and `StringValue` (1-indexed character access).
- Property writes via `StoreIndex` opcode (§4.2).

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

4. **Decide on snapshot safety.** If your op mutates shared state in-place, record an undo entry on `patch` (§4.2). If it writes to a global via `SetGlobal`, the existing patch handles it. If it's pure stack manipulation, you don't need to do anything.

5. **Emit the opcode** from a ParsedObject's `GenerateRuntimeObject`. See `StorePropertyAssignment.ts` for an example that emits `EvalStart; base; key; value; StoreIndex; EvalEnd`.

6. **Wire it into a lowerer** so the new opcode actually gets emitted from grammar tree input.

7. **Test end-to-end** via a runtime fixture.

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

Run a test that exercises the path. The trace shows *exactly* how many times the opcode fires, with what operands. Comparing "fires once" vs "fires twice" is often how state-snapshot bugs surface (see the recent `& obj.field = obj.field + 1` investigation).

Remove the `console.log` before committing.

### 10.4 Common runtime symptoms

| Symptom | Likely cause |
|---|---|
| Operation runs twice | State snapshot is rewinding but the mutation isn't being undone. Add undo log (§4.2). |
| `Variable not found` warnings on names that should exist | Lookup is happening before the declaration; or temp-var scope was popped early; or dotted-name fallback can't traverse (check Map type at each segment). |
| `target not found: -> X.Y.Z` | Path resolution can't find the target. Verify the named container exists in the bytecode JSON (look for `{"X": [..., {"Y": [..., {"Z": ...}]}]}`). |
| Infinite loop / worker crash | Recursive call with no base case, or a divert chain that loops back without progress. Check the divert path. |
| Output text doubled / missing newlines | Output-stream snapshot bug, or wrong text/newline emission in lowerer. Step through with `Continue()`. |
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

- **Forgetting snapshot safety on a new mutating opcode.** §4.2 has the pattern.
- **Calling `SetGlobal` without going through `VariablesState.Assign`.** `Assign` resolves whether the target is global or temp; `SetGlobal` is unconditional. Use `Assign` from runtime contexts unless you specifically know you want global.
- **Forgetting to pop the eval stack after a value-emitting call you don't want output.** Use `pop` opcode, or set `shouldPopReturnedValue = true` on the `FunctionCall`.
- **Mutating a value retrieved from globals without going through the patch.** Reads return the same reference that's stored. Writes need to either go through `SetGlobal` (atomic replace) or be recorded in the undo log (§4.2).
- **Assuming the eval stack is empty between top-level instructions.** It usually is, but some intermediate states leave values on it. Trace with `PrintEvaluationStack` if you're unsure.

---

## 13. Useful files to read

- `engine/Story.ts` — `Step`, `ContinueSingleStep`, `PerformLogicAndFlowControl`. Most behavior lives here.
- `engine/StoryState.ts` — `CopyAndStartPatching`, `RestoreAfterPatch`, `ApplyAnyPatch`.
- `engine/StatePatch.ts` — patch shape, `RecordPropertyMutation`, `UndoPropertyMutations`.
- `engine/VariablesState.ts` — `Assign`, `SetGlobal`, `GetVariableWithName`.
- `engine/ControlCommand.ts` — the opcode enum (full vocabulary).
- `engine/NativeFunctionCall.ts` — operator implementations.
- `engine/Value.ts` — `IntValue`, `FloatValue`, `StringValue`, `ObjectValue`, `ListValue`, `DivertTargetValue`, etc.
- `engine/Container.ts` — bytecode container + named-child lookup.
- `compiler/Parser/ParsedHierarchy/Variable/StorePropertyAssignment.ts` — example of emitting a multi-opcode sequence.

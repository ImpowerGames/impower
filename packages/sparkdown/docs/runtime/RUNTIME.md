# Sparkdown Runtime Guide

The runtime runs a compiled story. The compiler writes each statement of a script as a statement chunk, an immutable `Int32Array` of two-word instructions, and the program engine, `ProgramStory`, steps through those chunks one instruction at a time. What the instructions do to values (arithmetic, comparison, tables, the standard library, variables and the call stack) is the value layer the engine kept from inkjs, under `packages/sparkdown/src/runtime/`.

This guide is the map: where each part lives, how a story runs, and where to look when it does not run as written. The design of record is [`docs/engine/binary-program.md`](../../../../docs/engine/binary-program.md), which this guide links by section rather than repeats; the value layer's own note is [`packages/sparkdown/src/runtime/README.md`](../../src/runtime/README.md).

> **Companion docs:** [`GRAMMAR.md`](../compiler/GRAMMAR.md) (source text to syntax tree) and [`LOWERING.md`](../compiler/LOWERING.md) (syntax tree to parsed objects). The parsed objects emit the chunks this guide runs.

Paths below are relative to `packages/sparkdown/src/` unless they start with `docs/` or `packages/`.

---

## 1. Layout

The program engine and the compile side that builds its programs live in `program/`:

| File | Holds |
| --- | --- |
| [`program/ProgramStory.ts`](../../src/program/ProgramStory.ts) | The engine: `ContinueInternal`, `ContinueSingleStep`, `Step` and the `execute` switch over the opcodes, choices, calls, jumps and the declaration run |
| [`program/ProgramStoryState.ts`](../../src/program/ProgramStoryState.ts) | The engine's mutable state: position, block stack, eval stack, output, the waiting line end, counts, choices |
| [`program/StoryEngine.ts`](../../src/program/StoryEngine.ts) | The surface a game, the route planner and the standard library run a story through; `ProgramStory` is its one implementer |
| [`program/ProgramInstructions.ts`](../../src/program/ProgramInstructions.ts) | The opcodes (`Op`), their flags and the instruction word's layout |
| [`program/ProgramChunk.ts`](../../src/program/ProgramChunk.ts) | A chunk's header, tables and block rows, and the address helpers (`addressOf`, `chunkOfAddress`, `offsetOfAddress`) |
| [`program/ProgramRoot.ts`](../../src/program/ProgramRoot.ts) | One version of the whole program: sequences, flows, symbol definitions, the declaration chunks (`initialization`), `addressAt` and `locationOf` |
| [`program/ProgramTable.ts`](../../src/program/ProgramTable.ts) | The string, number and symbol tables shared across compiles |
| [`program/ProgramSymbols.ts`](../../src/program/ProgramSymbols.ts) | Symbol kinds, `ROOT_FLOW_NAME`, and `readableSymbolLabel` |
| [`program/BinaryProgramWriter.ts`](../../src/program/BinaryProgramWriter.ts) | Emits one statement's chunk; `describeInstruction` prints an instruction as text |
| [`program/BinaryProgramReader.ts`](../../src/program/BinaryProgramReader.ts) | Iterates a sequence's statements and a chunk's instructions in place; `listing` prints a sequence |
| [`program/ProgramEmitter.ts`](../../src/program/ProgramEmitter.ts) | The interface a parsed object's `EmitProgram` writes through |
| [`program/ChunkStore.ts`](../../src/program/ChunkStore.ts) | Keeps chunks across compiles and decides which statements are emitted again |
| [`program/ProgramResolver.ts`](../../src/program/ProgramResolver.ts) | Resolves each statement's references for the writer |
| [`program/ProgramImages.ts`](../../src/program/ProgramImages.ts), [`program/ProgramSave.ts`](../../src/program/ProgramSave.ts) | Images of the state (route search nodes, checkpoints, rewind) and the durable save format |

The value layer the engine runs on lives in `runtime/`:

| File | Holds |
| --- | --- |
| [`runtime/Value.ts`](../../src/runtime/Value.ts) | `IntValue`, `FloatValue`, `StringValue`, `BoolValue`, `NullValue`, `MultiValue`, `ObjectValue` (tables), `SymbolValue` (function and flow values), `VariablePointerValue` (upvalues) |
| [`runtime/evaluation.ts`](../../src/runtime/evaluation.ts) | What the instructions call for their effect on values: `readVariable`, `indexValue`, `storeIndex`, `tableFromPairs`, `callNativeFunction`, `arrangeArgsFor`, `callVariableTarget`, `callValueAsFunction`, `captureString` |
| [`runtime/NativeFunctionCall.ts`](../../src/runtime/NativeFunctionCall.ts) | Operators and native functions, dispatched by operand type |
| [`runtime/MethodDispatch.ts`](../../src/runtime/MethodDispatch.ts) | Builtin methods (`obj:method(...)` on strings and tables) |
| [`runtime/StdLib.ts`](../../src/runtime/StdLib.ts) | The standard library, `display` and `print` among it; [`runtime/LuaPatterns.ts`](../../src/runtime/LuaPatterns.ts) for string patterns |
| [`runtime/PluralRules.ts`](../../src/runtime/PluralRules.ts) | CLDR plural categories (`getPluralCategory`) |
| [`runtime/VariablesState.ts`](../../src/runtime/VariablesState.ts) | Globals, and temporaries through the call stack (`Assign`, `GetVariableWithName`, `SetGlobal`) |
| [`runtime/CallStack.ts`](../../src/runtime/CallStack.ts) | Threads and call stack elements, each with its scopes of temporaries and its open upvalues |
| [`runtime/JsonSerialisation.ts`](../../src/runtime/JsonSerialisation.ts), [`runtime/SimpleJson.ts`](../../src/runtime/SimpleJson.ts) | Values as JSON, for saves |
| [`runtime/ControlCommand.ts`](../../src/runtime/ControlCommand.ts) | The markers the engine writes into its output (`BeginString`, `BeginTag`, `EndTag`) |
| [`runtime/outputWhitespace.ts`](../../src/runtime/outputWhitespace.ts) | How output text is cleaned (`cleanOutputWhitespace`) |

The layer still holds pieces of ink that no Sparkdown program reaches: the list type (`InkList`, `ListValue`, `ListDefinition`) and the wire objects the engine never emits (`DivertTargetValue`, `Path`, and the control commands other than the output markers and `BeginScope`/`EndScope`). They are not part of the value model, and #1752 and #1753 remove them.

The parsed objects that emit chunks are the classes under `inkjs/compiler/Parser/ParsedHierarchy/`, each with an `EmitProgram` method; `LOWERING.md` covers how the lowerer builds them. A game builds its engine in `packages/spark-engine/src/game/core/classes/Game.ts` (`new ProgramStory(chunks, ...)`, where `chunks` is the compile's `program.chunks`).

---

## 2. Statement chunks in 60 seconds

[Section 1 of the design](../../../../docs/engine/binary-program.md#1-the-program-chunk) is the full layout. In short:

- **A chunk is one statement.** Ten header words (code length, table sizes, chunk id, the source fingerprint and the layout hash), then the code, then four tables: lines, exports, blocks and references. Nothing writes a chunk after the writer builds it.
- **An instruction is two words.** Word 0 holds the opcode (bits 0 to 7), flags (8 to 15) and a 16-bit `aux`; word 1 is a signed 32-bit `arg`. Offsets count words, so instructions sit at even offsets.
- **A body is a sequence.** A block statement (`if`, `choose`, a loop, a function) is one chunk whose code says `EnterBlock k` where a body runs; the body's statements are chunks of their own in a sequence that the chunk's block table names. When the body runs out, the owner resumes at the block row's resume offset.
- **A flow is a sequence too.** The top-level content is the flow named `""` (`ROOT_FLOW_NAME`); scenes, branches and top-level functions are flows under their qualified names. A flow's first chunk binds its parameters.
- **Anything outside the chunk is a symbol.** A jump inside a chunk is relative; a target in another chunk is a symbol id that the root resolves ([section 2](../../../../docs/engine/binary-program.md#2-symbols)). Names the compiler generates hold a `$` (`__synth$<n>`, `__group$<n>`, `__binding$...`), which no author's name can, and an author sees a generated function as `<anonymous>` ([Generated names](../../../../docs/engine/binary-program.md#generated-names)).
- **Declarations run first.** `store`, `const` and `define` statements are chunks of their script's declaration sequence; `ResetState` runs them (`root.initialization`) before the story starts.
- **A position outside the engine is a number.** An address is `chunkId * 2^21 + offset` (`ProgramAddress`, `compiler/types/ProgramAddress.ts`); `root.locationOf(address)` gives its script and range, and `root.addressAt(uri, line)` the reverse ([section 8](../../../../docs/engine/binary-program.md#8-addresses)). A line with no address starts a run at `TOP_LEVEL_START`, which is -1.

The instructions are listed in [section 3](../../../../docs/engine/binary-program.md#3-the-instruction-set) with their effect on the eval stack, the output, the call stack and the counts, and in `Op` with a comment each. [What replaces the runtime objects](../../../../docs/engine/binary-program.md#what-replaces-the-runtime-objects) maps each control command of the deleted object engine to its instruction, which helps when reading older tickets.

### Worked example

This script:

```sparkdown
store gold = 3
function double(n)
  return n * 2
end
You have {double(gold)} coins.
if gold > 2 then
  Rich.
end
```

compiles to these chunks, as `BinaryProgramReader.listing` prints them (offset, then `describeInstruction`'s text; a jump shows its target offset, not its relative operand):

```
top-level flow ""
0 (line 5, 1 rows)
  0: LineStart
  2: Str "target"
  4: Str "action"
  6: Str "text"
  8: BeginString
  10: Text "You have "
  12: GetVar gold
  14: Call "double"/1
  16: Out
  18: Text " coins."
  20: EndString
  22: MakeTable 2
  24: CallStd display/1 flags 1
1 (line 6, 1 rows)
  0: GetVar gold
  2: Int 2
  4: Native >/2
  6: Native TRUTHY/1
  8: JumpIfFalse 18 flags 2
  10: BeginScope
  12: EnterBlock 0
  14: EndScope
  16: Jump 18
  block 0
    0 (line 7, 1 rows)
      0: LineStart
      ...
      12: CallStd display/1 flags 1

flow "double"
0 (line 2, 1 rows)
  0: SetVar n flags 1
  2: EnterBlock 0
  4: Const void
  6: Return
  block 0
    0 (line 3, 1 rows)
      0: GetVar n
      2: Int 2
      4: Native */2
      6: Return
```

and the declaration sequence holds `Int 3`, `SetVar gold` with the declare and global flags (3). Reading it:

- The display line is one statement. Its `LineStart` names the beat's address. The table `{ target = "action", text = ... }` is built by pushing its keys and values and `MakeTable 2` (two pairs). The text is a capture: `BeginString` opens it, `Text` and `Out` write into it, `EndString` pushes the captured string. `CallStd display/1` calls the `display` builtin with one argument; flag 1 is `CALL_DISCARD`, so nothing is pushed back.
- `Call "double"/1` enters the flow `double` with one argument. Its first chunk binds `n` (`SetVar` with the declare flag), enters the function body (`EnterBlock 0`), and the body's `Return` returns `6` to the caller, which `Out` writes into the capture.
- The `if` is one chunk: the condition, a `JumpIfFalse` with the decision-site flag (2, `JUMP_DECISION`), a scope around the branch body (`BeginScope` ... `EndScope`), and the body as block 0. `Native TRUTHY/1` normalizes the condition to Luau truthiness.

To get the same listing for any script, see §11.

---

## 3. The step loop

```
ProgramStory.Continue()                 — also ContinueAsync()
└─ ContinueInternal()
   ├─ start of a continue: take the carried step (§4), reset the output
   └─ loop while the output does not end in a newline and canContinue:
        ContinueSingleStep()
        ├─ Step()
        │  ├─ fetch(position)   — the chunk at the position; a body that ran
        │  │                      out pops the block stack and resumes its
        │  │                      owner at the block's resume offset
        │  ├─ onExecute(address), executedLog
        │  └─ execute(position, chunk)  — the switch over Op
        └─ returns whether the output now ends in a newline outside a capture
```

`Step` runs exactly one instruction. `execute` reads the two words at the position, moves the offset past them, and does what the opcode says; a jump adds its operand to the offset. When the offset passes the end of a chunk's code, the position moves to the next entry of the sequence. When a sequence runs out, `fetch` pops the block stack (`state.blockStack`) and resumes the owner chunk at the block row's resume offset (`B_RESUME`); when the flow's own sequence runs out, the flow ends as `Done` ends it.

The continue stops when:

- the output ends in a newline outside a capture (a line was written: `display` writes its table and then a newline),
- the story can no longer continue (`canContinue` is false: a `Done` that stops the flow, an `End`, the end of content, or choices raised),
- a `StoryException` is raised (it becomes an error that `onError` receives), or
- `pauseBeforeEvaluatingConditions` is set and the next instruction is a decision (a `JumpIfFalse` or `Choice` with the decision flag); `pausedBeforeCondition` names its address. The route planner uses this together with `simulator`, which forces a decision's verdict.

What happens around the loop:

- **Declarations.** `ResetState` builds a fresh `ProgramStoryState` over a call stack of the engine's own (`CallStack.ForProgram`) and a `VariablesState`, runs every declaration chunk in `root.initialization` (`runDeclarations`), and places the position at the start of the top-level flow.
- **Choices.** A `Choice` instruction pops its texts and condition and, unless the condition is false or a once-only choice was already visited, adds a `ProgramChoice` that holds a fork of the current thread and its entry offset (`raiseChoice`). The `Done` that ends a `choose` block's presentation carries the hold flag: it stops the flow only when a choice that chunk raised is waiting. `ChooseChoiceIndex` takes a choice, the story resumes at its entry in the thread it was raised in, and the next continue runs it. When every waiting choice is an invisible default, the engine takes the first one itself. [Section 4 of the design](../../../../docs/engine/binary-program.md#4-weaves-in-linear-code) shows a whole `choose` chunk.
- **Calls.** `Call`, `CallVar` and `CallValue` push a call stack element with a program frame beside it (`ProgramStoryState.PushFrame`; `frameOf` reads it back) and move to the function's entry; `Return` pops it and resumes the caller after its call. A host calls a function through `EvaluateFunction`, and a builtin that takes a function (`table.sort`'s comparator, a metamethod, `pcall`) calls it through `CallLuauFunction` or `CallLuauFunctionProtected`; each steps the function to its return against an output of its own (§4).
- **Jumps.** `JumpSym` and `JumpVar` move to where a symbol is defined, rebuild the block stack and the frame's scopes for the target (`land`), and count the flows the jump enters ([section 5](../../../../docs/engine/binary-program.md#5-counts)). `ChoosePathString(name)` and `ChooseAddress(address)` do the same from outside.

### 3.1 Display tables

Every line of visible text the compiler lowers reaches the output through the `display` builtin (`runtime/StdLib.ts`), which the compiler calls with a table: `{ target?, character?, text, pause?, extend?, glue?, continues?, inherit?, group?, open?, caption?, tags? }` (`compiler/lower/utils/displayCall.ts`), `{ load }` for a `load` line, or `{ parts }` for a picked choice whose tags sit between its words (`display` joins the parts into `text` and `tags`). `display` writes the table's tags as `BeginTag` ... `EndTag` spans, then the table itself as an `ObjectValue`, then a closing `"\n"` that ends the step. The `print` builtin is the one other producer of a table: it builds `{ text }` from its arguments and writes it and a closing `"\n"` the same way, or, inside a capture, writes its text as a plain string.

Glue needs a mark on each side, and the story decides each join as it runs. A table with `glue` (a line that ends with `..`) leaves its newline waiting, as a caption does (below), and sets `ProgramStoryState.lineJoinable`; a table with `extend` (a line that ends with `..` before a `>` break) writes its newline, ending the step at the click, and sets it too. Any output that shows something clears the flag, so the offer lasts only until the next thing the run shows. `ChoosePathString`, a picked choice and a call that runs against its own output (§4) drop or suspend it. A table with `continues` (a line that begins with `..`) reads the flag before it writes anything. When it is set, `display` clears it and drops the waiting newline, so after `glue` the table joins the same step, and after `extend` it begins the step the interpreter carries on in the box. A line a divert holds open (the output has content, does not end in a newline, and no newline is waiting) is already joined, so it passes too. Otherwise `display` raises a runtime warning, "This line begins with `..`, but the line shown before it does not end with `..`, so it does not join it.", and takes `continues` off the table, so the line shows as a line of its own. Inside a block body the compiler joins lines itself, and it places a `__unjoined()` builtin call, stamped with the mark, at each line that begins with a lone `..`; the call raises the same warning on that line.

Three keys change the closing newline. A table with `open` writes none: the next display call joins its line, and the step runs on until a call closes it. A table with `glue` or `caption` (a `choose` block's last caption line) leaves the newline waiting (`lineEndPending`); §4 says what happens next. The writer also sets `CALL_OPEN` on the `CallStd` of a display call whose table carries one of these three keys; the engine reads the table, not the flag.

What a step collected is read two ways:

- `currentText` includes each table's `text`, in output order, beside any other text in the output, so text reads the same whether it came from a table or not.
- `currentDisplayInstructions` returns the step's tables in order. The game's interpreter (`InterpreterModule.queue` in `packages/spark-engine/src/game/modules/interpreter/classes/InterpreterModule.ts`) builds the step's beat from them: the first table that names a `target` routes the beat, with its `character` as the dialogue cue, and the body is `currentText`. A step whose tables name no target renders on the default target. A table with `pause` came from a beat a `>` break ends, and its beat waits for a click even when it has no text. A table with `extend` came from a beat whose text ends with `..` before a `>` break (`A .. >`): the interpreter keeps the box that beat shows in its state (`InterpreterState.box`), and a step carries on in that box only when its first table has `continues`, which `display` leaves on only when the line shown before offered to join; any other step starts a new box (see DIVERGENCES.md's glue section). A glued continuation's tables name it with `group`, and the interpreter remembers each beat's routing with the last `group` its tables carried. A beat that sets `inherit` takes that remembered routing only while the beat its own `group` names is the one just queued; otherwise it routes by its own table. `clearQueuedBeats` and a program update drop the remembered routing and the box.

Glue joins lines across tables as it joins text: a glued line's table joins the step the glue holds open, so one step may carry several tables.

A table's `text` is a captured string, built between `BeginString` and `EndString`. A tag cannot end inside a capture (`EndTag` there is taken for a choice label's tag and goes to the eval stack), so a line's tags ride the table's `tags` key instead, and an inline-glued alternator arm's tag is written by the `Tag` instruction as a runtime `Tag` object, which `EndString` (`captureString`) leaves in the output.

---

## 4. How a line ends

A continue returns at the newline that ends its line ([section 6 of the design](../../../../docs/engine/binary-program.md#6-how-a-beat-ends)). The story rests just after that newline. Everything after it, whether logic, the choices, the story's end or a fallback choice, runs in the next continue, once and in order. Nothing that runs is taken back: the engine keeps no undo log, and the only bookkeeping a write carries is the write barrier that marks what changed for the next image ([section 7](../../../../docs/engine/binary-program.md#7-state)).

What that means for a caller:

- A continue may complete with no text. After a line, the next continue can run through logic to the choices and raise them with no text, reach the story's end with nothing (`canContinue` false and no choices), or follow a fallback choice into the content after it. The game makes a beat of choices alone and no beat of a continue that brings nothing.
- A `choose` block's caption shows with its choices because the caption's newline waits. A line written before the block returns alone, and the choices come with the next continue.
- A function the story calls between two lines (`& tick()` after `First.`) runs in the continue that reaches it, the one after `First.`'s newline; a function interpolated into a line runs as that line is built. A host runs a story function only through `EvaluateFunction`, between continues.
- A table with `open` writes no newline, so the next display call joins its line, and the line ends where the joined line's newline is.

The waiting newline is four fields of `ProgramStoryState`:

| Field | Meaning |
| --- | --- |
| `lineEndPending` | A `glue` or `caption` table's newline has not been written yet. |
| `lineJoinable` | The line shown last offers to join a line that begins with `..` (§3.1). |
| `outputCut` | Where the first output that shows something began while a newline was waiting (`PushToOutputStream` sets it): text that is not only whitespace, a display table or a tag. |
| `carried` | The output after the cut, and whether its own line still waits, carried to the next continue (`CarryOutputPastCut`, `TakeCarriedStep`). |

If the step reaches its choices or the story's end without showing anything else, the caption completes with them. Otherwise the continue ends after the step that cut: `ContinueSingleStep` reports the line as ended, `ContinueInternal` calls `CarryOutputPastCut`, which ends the output at the cut with the waiting newline and moves the rest into `carried`, and the next continue starts from the carried output, so nothing is run twice. Carried output that already ends its line is returned by that continue without stepping. A step that leaves the story unable to continue keeps its output whole, with the newline written at the cut (`CloseOutputCut`), since no continue follows to carry it to.

`ChoosePathString` and `ChooseAddress` drop a waiting line end and a carried step (`DiscardLineEnd`), since what they would show belongs to the path the host leaves, and so does `ForceEnd`, which `ResetCallstack` and an `End` reach. A call that runs a story function against an output of its own (`EvaluateFunction`, and `CallLuauFunction` and `CallLuauFunctionProtected`, which the builtins that take a function use) suspends all four fields while it runs and restores them after (`SuspendLineEnd`, `ResumeLineEnd`), since what it shows never reaches the story's steps.

---

## 5. The state

`ProgramStoryState` is what a continue reads and writes. Its parts:

- **Position.** `position` is a sequence, an entry in it and an offset into that entry's code (`ProgramPosition`). `blockStack` lists the blocks the position is inside, outermost first, each as the owner's sequence, entry and block index (`BlockEntry`). The block stack is derived from the position through the root's tables (`blockStackOf`) and is never saved.
- **Frames and threads.** The call stack is `runtime/CallStack.ts`'s, made by `CallStack.ForProgram`; each element holds a frame's scopes of temporaries and its open upvalues, and `frameOf(element)` gives the program frame beside it (`ProgramFrame`: where it returns to, the caller's block stack and the symbol it runs). A thread forks with `ForkThread` (the `Thread` instruction) and with each choice (`ForkChoiceThread`).
- **Eval stack and output.** `evaluationStack` holds operands; `outputStream` holds the step's text, tables, tags and capture markers. The output rules are the object engine's, carried over: a newline is not repeated, does not open a line, and is dropped inside a function until the function shows something (`PushToOutputStreamIndividual`); a function's trailing whitespace is trimmed when it returns (`TrimWhitespaceFromFunctionEnd`).
- **The waiting line end.** The four fields of §4.
- **Counts.** `visits` (`Uint32Array`) and `turns` (`Int32Array`), indexed by each counted symbol's dense count id ([section 5](../../../../docs/engine/binary-program.md#5-counts)). `Visit` raises a count; `GetCount`, `CountOf` and `VisitIndex` read one.
- **Choices.** `generatedChoices`, read as `currentChoices`.
- **Globals.** `variablesState`, the value layer's `VariablesState`.
- **Bookkeeping.** `currentTurnIndex`, `storySeed`, `previousRandom`, `didSafeExit`, `previousAddress` (the address of the instruction that ran last) and the errors and warnings of the continue in progress.

Images of this state (whole keyframes and deltas, for route search nodes, checkpoints and rewind) are `program/ProgramImages.ts`; durable saves, which name positions by the source rather than by address, are `program/ProgramSave.ts`. The design for both is [section 7](../../../../docs/engine/binary-program.md#7-state) and [section 8](../../../../docs/engine/binary-program.md#8-addresses).

---

## 6. Variables and scopes

**Reading.** `GetVar name` calls `readVariable` (`runtime/evaluation.ts`), which tries in order:

1. `VariablesState.GetVariableWithName(name)`: the current frame's temporaries, innermost scope first, then the globals. Locals shadow globals for reads and writes alike.
2. A dotted name (`hero.hp`) when no variable has that whole name: the first segment as a variable, then each later segment as a key, through `ObjectValue` entries and the `__index` chain. Indexing nil, a number or a function on the way raises "attempt to index a nil value" or its like, which `pcall` can trap; a missing last member is nil. `_G.x` reads the global `x` past any local of that name.
3. A flow or function of that name, as a function value (`FlowValueNamed`), so `local f = double` works.
4. A standard library function of that name, as a marker value.
5. Otherwise nil. An undefined name is nil, not a runtime warning.

**Writing.** `SetVar name` pops a value and assigns it through `VariablesState.Assign`. Its flags (`program/ProgramInstructions.ts`) say how: `SET_DECLARE` declares the name in the current scope (a `local`, a parameter), `SET_GLOBAL` with it declares a global (a `store` or `const` in the declaration sequence), `SET_VARARGS` keeps a multiple value whole for `...`, and `SET_INITIALIZE` marks the assignment that completes a self-recursive `local function`. Without the declare flag the write goes to the innermost temporary of that name, or to the global when no temporary has it. A write to a member (`hero.hp = 5`) is `GetVar hero; Str "hp"; ...; StoreIndex`, never a `SetVar` of a dotted name.

**Scopes.** Each call stack element has `temporaryScopes`, a stack of `Map`s. `BeginScope` pushes one (`Element.PushScope`); `EndScope` pops one (`PopScope`, which never pops the frame's outermost scope) and closes the upvalues bound in it. The writer brackets every scoped body with them: an `if` branch, each pass of a loop and its hidden variables, a `do` block (the lowerers wrap such bodies in `wrapInScope`). The scope depth at any position follows from the block stack and the chunk's own `BeginScope`/`EndScope` count, which is how a jump or a restored image rebuilds the scopes a frame holds ([section 1, Blocks and sequences](../../../../docs/engine/binary-program.md#blocks-and-sequences)).

---

## 7. Functions, calls and operators

**Functions.** A function declared at the top level is a flow; one written inside a statement is a function-body block of that statement's chunk, exported under an anonymous symbol. Either way the entry code binds the parameters with `SetVar` (declare flag, last parameter first) and enters the body (`EnterBlock`). A function value is a `SymbolValue` (`runtime/Value.ts`); a closure is a table holding `__closure_fn` (the symbol value) and `__closure_upvals` ([section 10](../../../../docs/engine/binary-program.md#10-function-values)).

**Calls.** The call site pushes its arguments, then:

- `Call symbol/argc` calls a function the compiler resolved. `arrangeArgsFor` arranges the `argc` arguments as Luau passes them: a last multiple value spreads, a call that returned nothing gives nothing, the surplus is dropped, missing parameters are nil, and a variadic function's extras are packed for its `...`.
- `CallVar name/argc` calls what a variable holds: a function value, a closure, a builtin, a builtin iterator, or a table with `__call` (`callVariableTarget`).
- `CallValue argc` pops the callee from the stack, for a call on an expression's value (`callValueAsFunction`).
- `CallStd name/arity` calls a state-aware builtin from `runtime/StdLib.ts` with the story itself (`callStd`).

**Discarded results.** A statement that calls only for the effect (`& heal(2)` at the top level, `heal(2)` inside a function body) discards the result: `Pop` after a `Call`, `CallVar` or `CallValue`, or the `CALL_DISCARD` flag on a `CallStd`. At every statement boundary the eval stack is back at the height the frame was pushed with.

**Operators.** `Native op/arity` pops the operands and pushes the result of `callNativeFunction` (`runtime/evaluation.ts`), which dispatches a metamethod of a table operand (`__add`, `__eq`, `__concat` and the rest) or a global that replaced a standard library namespace, and otherwise `NativeFunctionCall.Call`. Its semantics follow Luau:

- `and` and `or` return one of their operands by Luau truthiness (only nil and false are falsy); `not` returns a boolean by the same rule. The compiler short-circuits `and` and `or` with `JumpIfKeep`.
- `..` concatenates strings and numbers (numbers formatted as Luau formats them); any other operand raises "attempt to concatenate ...".
- `==` and `~=` with a nil operand compare nil-ness; any other operator with a nil operand raises.
- Arithmetic converts a numeric string operand (`"2" + 3`); a non-numeric string raises.
- Otherwise the operands are coerced to the highest `ValueType` among them (an int and a float make floats) and the operation registered for that type runs: `AddIntBinaryOp`, `AddFloatBinaryOp`, `AddStringBinaryOp`, `AddObjectUnaryOp` and the like, in `GenerateNativeFunctionsIfNecessary`. `#` (`LEN`) is registered for strings and tables.

**Methods.** `obj:method(args)` lowers to a call with `obj` as the first argument. A builtin method (`__method_<name>`) dispatches on the receiver's type in `runtime/MethodDispatch.ts`; a `define`'s method dispatches through the table's `__index` chain like any other member.

---

## 8. Tables

A table is an `ObjectValue` (`runtime/Value.ts`), which wraps a `Map<string, AbstractValue>` with a metatable slot and a frozen flag.

- `MakeTable pairs` pops the keys and values a table literal pushed and builds the table (`tableFromPairs`).
- `Index` pops a key and a base and pushes the member (`indexValue`): a key present in the map is returned directly, and a miss goes through `__index`. A string base is indexed by character, from 1.
- `StoreIndex` pops a value, a key and a base and writes the member in place (`storeIndex`), through `__newindex` on a miss, and refuses a frozen table.
- The same `Map` is shared by every variable that holds the table, so a write through one is seen through all of them, as in Luau.
- A save writes each table once and refers to it again by id (`objid` and `objref` in `runtime/JsonSerialisation.ts`), so aliasing, cycles and a `define`'s class table survive a load.

Sparkdown has no ink `LIST`: tables replace it, and a `LIST` declaration is a compile error ([section 9](../../../../docs/engine/binary-program.md#9-the-surfaces)).

---

## 9. Where each Sparkdown extension lives now

The object engine carried these as control commands and special cases in its interpreter loop. On the program engine:

| Extension | Where it lives now |
| --- | --- |
| Tables (`ObjectValue`) | `ObjectValue` in `runtime/Value.ts`; built by `MakeTable`, read by `Index`, written by `StoreIndex`, through `tableFromPairs`, `indexValue` and `storeIndex` in `runtime/evaluation.ts` (§8) |
| Dotted property access (`t.value`) | Reads: `GetVar` with the dotted name, walked by `readVariable` (§6). Writes: `StoreIndex` on the base and the last key |
| `store` / `local` / `const` scopes | `SetVar` flags (§6). `store` and `const` are chunks of the declaration sequence that `runDeclarations` runs; a constant is a global, and `VariablesState.constantNames` keeps a save from overwriting it on load. `local` is a temporary of the current scope |
| `&` discard calls | `Pop` after the call, or `CALL_DISCARD` on `CallStd` (§7) |
| `define` | Every define lowers (`compiler/lower/lowerers/lowerLuauDefine.ts`) to a global table that a declaration chunk builds at story start through the `__def` builtin (`runtime/StdLib.ts`), which chains `__index` to the parent type's table; methods are closures with an implicit `self`, and `new T(...)` calls the `__new` builtin. A typed define (`as T`) is also a compile-time record (`runtime/StructDefinition.ts`), read through `ProgramStory.structDefinitions` (`root.tables`) |
| CLDR plurals | `plural(n) \| one = ... \| other = ...` lowers to a match on `plural.category(n)`, a builtin in `runtime/StdLib.ts` that reads `lang.current` (English when unset) and calls `getPluralCategory` in `runtime/PluralRules.ts` |
| Display tables | The `display` and `print` builtins in `runtime/StdLib.ts`; read back by `ProgramStoryState.currentDisplayInstructions` and `currentText` (§3.1) |
| Line ends and glue | `lineEndPending`, `lineJoinable`, `outputCut` and `carried` on `ProgramStoryState`, and `ContinueInternal` (§4) |
| Functions | Flows and function-body blocks, `Call`/`CallVar`/`CallValue`/`Return` in `ProgramStory.execute`, argument arrangement in `runtime/evaluation.ts` (§7) |

---

## 10. Adding an instruction (worked example)

Most new behaviour needs no new instruction: a builtin in `runtime/StdLib.ts` called through `CallStd`, or a native function in `runtime/NativeFunctionCall.ts` called through `Native`, reaches the engine with no change to it. Add an instruction only when no builtin can do the work, and record it in [section 3 of the design](../../../../docs/engine/binary-program.md#3-the-instruction-set). Suppose a new instruction `MyOp` pops two values and pushes a result:

1. **Define the opcode** in `Op` (`program/ProgramInstructions.ts`) with the next free number and a comment saying what it does to the eval stack. `OP_NAMES` derives its name from `Op`. Define any flags it reads beside the others.
2. **Emit it** from the parsed class's `EmitProgram` (under `inkjs/compiler/Parser/ParsedHierarchy/`), through `ProgramEmitter.emit(Op.MyOp, arg, aux, flags)`. `StorePropertyAssignment.EmitProgram` is a short example: it emits the base, the key and the value, then `StoreIndex`.
3. **Run it** in `ProgramStory.execute`, the `switch (opOf(w0))`:

   ```typescript
   case Op.MyOp: {
     const b = state.PopEvaluationStack();
     const a = state.PopEvaluationStack();
     state.PushEvaluationStack(/* ... */);
     break;
   }
   ```

   An instruction the switch does not know raises "unknown instruction".
4. **Describe it** in `describeInstruction` (`program/BinaryProgramWriter.ts`) when its operand should print as more than its opcode name, so listings and tests read it.
5. **Check what else reads instructions.** An instruction that writes keyed state (a count, a global, a table, an upvalue cell) has to go through the write barrier ([section 7, The write barrier](../../../../docs/engine/binary-program.md#the-write-barrier)); one that jumps or opens scopes has to keep the scope count the design describes; one that is a decision needs the decision flag that `pausesAt` reads.
6. **Test it** end to end: a script that uses it, its listing, and the beats it shows (§11), through `/write-regression-test`.

---

## 11. Debugging the runtime

### 11.1 Listing a program

```typescript
import { BinaryProgramReader } from "../../program/BinaryProgramReader";
import { compileScript } from "./programHarness"; // tests/program/

const root = compileScript(source).program.chunks!;
const reader = new BinaryProgramReader(root);
console.log(reader.listing(root.flowNamed("")!).join("\n"));
```

prints a flow's statements as in §2, with each block's body under it. `flowListings` and `programListing` (`tests/programListing.ts`) give every flow's instructions, and the declarations', as lists of strings a test can search. If the listing is wrong, the bug is in lowering or emitting; if it is right and the run is wrong, it is in the engine or the value layer. A compile that holds a construct the writer has no emit path for makes no program (`program.chunks` is absent) and reports the construct at its statement's line (`compiler/utils/unsupportedConstructMessage.ts`).

### 11.2 Running a story in a test

`compileScript` and `storyBeats` / `storyRun` (`tests/program/programHarness.ts`) compile a script and run it from its start: each beat's text, tags and display tables, the errors with their type, and the menus with the choice taken at each. `testCompiler` and `testStory` (`tests/engineUnderTest.ts`) serve the ink fixtures ported as tests, which declare `external` functions: a test-only adapter rewrites each `external` line into a Sparkdown function that calls a test builtin, and `TestProgramStory.BindExternalFunction` supplies the JavaScript behind it. The engine itself has no external functions, and a compile outside the tests reports an `external` declaration as an error. Run test files only through `node scripts/test-suite.mjs run packages/sparkdown <test-file> --wait <seconds>`, from the repository root.

### 11.3 Tracing instructions

`traceSteps(story)` (`tests/program/programTrace.ts`) runs a story one instruction at a time and returns, for each, the instruction as text with the eval stack, the output, the scopes and the block depth it left:

```
{"op":"GetVar gold","stack":["\"target\"","\"action\"","\"text\"","3"],...}
{"op":"Call \"double\"/1",...}
{"op":"SetVar n flags 1",...,"scopes":[{"n":"3"}],"blocks":0}
{"op":"EnterBlock 0",...,"blocks":1}
```

A step trace does not reset the output between lines as a continue does, so read it for the stack and the scopes rather than for line breaks. In a running game, `onExecute(address)` and `executedLog` see each instruction's address, and `root.locationOf(address)` turns one into its script and range. `debugFrames(threadIndex)` gives the call frames as the debugger shows them: `name` is readable (a function the compiler named shows as `<anonymous>`), and `scope` is the label the program holds, which keeps two anonymous functions apart.

### 11.4 Common runtime symptoms

| Symptom | Likely cause |
| --- | --- |
| "The compile built no statement chunks" in a test, or the game keeps running the old program | The compile has an error, or a construct the writer has no emit path for (§11.1). Read `program.diagnostics`. |
| `Divert target not found.` | A `Call` or jump names a symbol the root does not define. The compile reports `target not found` for the same reference. |
| `attempt to index a nil value` | A dotted read or `Index` reached nil before its last segment (§6). Check the value at each segment. |
| A value reads as nil | The name is undefined at that point (undefined names are nil, §6), or a local in an inner scope shadowed it, or the scope that declared it was closed. |
| A continue never returns, or a test hits `StepLimitExceeded` | A loop or recursion with no exit. `stepLimit` bounds a run's instructions. |
| Text doubled, joined or split wrongly | The display tables' flags (§3.1, §4), or the lowering. Compare the listing's `display` tables with what the source asks for. |

---

## 12. What's intentionally different from inkjs

See [`DIVERGENCES.md`](./DIVERGENCES.md) for the full list. The ones a reader of the engine meets first:

- **Property access on tables**: `obj.field` reads through `readVariable`'s dotted walk (§6).
- **`store` / `local` / `const`** in place of ink's `VAR` / `~ temp` / `CONST`.
- **`&` discard calls** in place of `~ fn(args)`.
- **Tables** in place of ink's `LIST`.
- **`define`** for records and classes.
- **Plural categories via CLDR**: `plural.category(n)` reads `lang.current`.
- **No external functions**: a host binds no function into a story; the program has no instruction for one ([section 3](../../../../docs/engine/binary-program.md#what-the-parsed-hierarchy-emits)).

If a runtime behaviour does not match ink's, check DIVERGENCES.md before treating it as a bug.

---

## 13. Pitfalls

- **Calling `SetGlobal` where `VariablesState.Assign` was meant.** `Assign` decides between a temporary and a global as a `SetVar` does; `SetGlobal` writes the global unconditionally.
- **Mutating a table read from a variable when a copy was meant.** Reads return the same `ObjectValue`, so an in-place write is seen by every variable that holds it (§8).
- **Leaving a value on the eval stack at the end of a statement.** A statement that discards a call's result must `Pop` it or set `CALL_DISCARD`; the engine relies on the stack being at the frame's height at every statement boundary.
- **Reading a block's body as part of its owner.** A body is a sequence of its own chunks; the owner's code only says `EnterBlock k`. Look up the body with `root.body(chunk, k)`.
- **Comparing addresses across compiles.** An address names a chunk id, and a statement emitted again gets a new id. Use `locationOf` to name a position for a person, and the saved form ([section 8](../../../../docs/engine/binary-program.md#8-addresses)) for anything that outlives the program.

---

## 14. Useful files to read

- `program/ProgramStory.ts`: `ContinueInternal`, `ContinueSingleStep`, `Step`, `fetch` and `execute`. Most engine behaviour lives here.
- `program/ProgramStoryState.ts`: the output (`PushToOutputStream`, `outputStreamEndsInNewline`), the waiting line end and the carried step, the counts and the choices.
- `program/ProgramInstructions.ts`: every opcode with a comment.
- `runtime/evaluation.ts`: what the instructions do to values.
- `runtime/VariablesState.ts`: `Assign`, `SetGlobal`, `GetVariableWithName`.
- `runtime/NativeFunctionCall.ts`: operator implementations.
- `runtime/Value.ts`: the value classes.
- `runtime/StdLib.ts`: the builtins, `display` among them.
- `tests/program/programHarness.ts` and `tests/program/programTrace.ts`: compiling, running and tracing a script in a test.

# The binary program

This is the design of record for the binary program of #692: the form a compiled story takes, the instructions it is made of, the symbols and addresses that name positions in it, and the state of the engine that runs it. Every slice of #692 builds against this document. It specifies and ships no engine.

Where a choice rests on a number, the number comes from a throwaway prototype under `scripts/bench` (`chunkProgram.ts`, `chunkStepper.ts`) measured beside #664's. [Measurements](#measurements) gives the figures and the command that reproduces each. Nothing under `packages/*/src` imports the prototype, and `scripts/bench/engine-bench.test.mjs` asserts that.

Each of the ten sections below ends with the decision, its reason, and the alternative it was chosen over.

## Terms

- Program chunk: the compiled form of one statement, an immutable `Int32Array`. A statement is one syntax node that `lowerStatements` lowers on its own, at the top level of a flow or inside a block (#656).
- Sequence: the ordered program chunks of one body. A flow has one sequence, and each block of a block statement (`if`, `choose`, a loop, a function) has one.
- Root: one version of the whole program. It holds the sequences, which sequence is which block of which chunk, where each symbol is defined, and the line index. A compile produces a new root that shares every sequence and every chunk it did not change.
- Symbol: an interned id for anything a chunk refers to outside itself.
- Address: a chunk id and an offset into that chunk's code. It names an execution position.
- Image: a capture of the engine's state, either whole or as what changed since the previous capture.

## 1. The program chunk

### Layout

A program chunk is one `Int32Array`, little-endian, read in place and never written after it is built.

| Words | Holds |
| --- | --- |
| 0 | code words, two per instruction |
| 1 | rows in the line table |
| 2 | rows in the export table |
| 3 | rows in the block table |
| 4 | rows in the reference table |
| 5 | chunk id |
| 6 | fingerprint of the code and tables, for the save format |
| 7 onwards | the code, then the four tables in the order above |

A line table row is five words: the offset of the first instruction it covers, the first line as a delta from the statement's first line, the start column, the last line as the same kind of delta, and the end column. Rows are sorted by offset and a row covers the code up to the next row. Every display call carries the row of its own source range, so any line of a joined beat maps to that beat (#685); an instruction with no range of its own falls under the statement's first row.

An export table row is two words: a symbol id and the offset in this chunk's code that defines it.

A block table row is three words: the offset at which this chunk resumes when the block's sequence runs out, the offset a `break` inside the block resumes at (or -1 when the block is no loop body), and flags saying whether the block is scoped, a loop body, a choice body, a `then` clause or a function body.

A reference table row is two words: a symbol id this chunk refers to, and a hash of the facts about that symbol the emitted code depends on (see Identity).

### The instruction word

An instruction is two words. Word 0 holds the opcode in bits 0 to 7, flags in bits 8 to 15 whose meaning belongs to the opcode, and an unsigned 16-bit operand `aux` in bits 16 to 31. Word 1 is a signed 32-bit operand `arg`. The words are fixed-width and little-endian so that a native player stays possible.

A jump inside a chunk is a signed count of words relative to the instruction after the jump. Nothing in a chunk names a position outside it: a target in another chunk is a symbol id, and a block is an index into the chunk's own block table.

### Blocks and sequences

The program is a tree of sequences, as a Lezer tree is a tree of nodes that hold positions relative to their parent. A block statement is one chunk. Its code holds the statement's own control flow, and where a body runs it says `EnterBlock k`. The statements of block `k` are chunks of their own in a sequence, and the root holds that sequence under the owner's chunk id (`root.blocks[chunkId][k]`). The owner's chunk holds no reference to it, so replacing a statement inside a block builds a new sequence for that block and a new root, and no new owner.

When a block's sequence runs out, the engine resumes the owner at the block row's resume offset. The engine keeps the blocks it is inside on a block stack in the current call frame: three numbers per entry (the owner's sequence, its entry in that sequence, the resume offset) and the frame's scope depth at entry. The stack is derivable from the position, because a sequence knows its owner and a block row's offsets are static, which is how a jump that lands inside a block rebuilds it (section 5). It is never saved.

A flow (a scene, a branch, a function declared at the top level) is a sequence registered in the root under its symbol. Its first chunk binds its parameters (`SetVar` with the declare flag, last parameter first, as function entry does today). A function written inside a statement is a function-body block of that statement's chunk: the chunk exports the function's symbol at the entry code that binds the parameters and enters the block, and the chunk's main path jumps over that entry code.

`break` and `continue` are statements inside a loop body's sequence, so their chunks cannot hold an offset of the loop. The lowerer already emits one `EndScope` per scoped block the jump skips (`lowerLuauBreakContinue.ts`); after those, the writer emits `Leave` where the lowerer's divert targets the generated label of an enclosing loop. `Leave` pops the block stack to the nearest loop body and resumes its owner at that block row's break or resume offset.

Top-level declarations (`store`, `const`, `define`) are statements of their script's declaration sequence, which `ResetState` runs in the order it runs the `global decl` container today, constants first.

### The order structure

A sequence is two parallel plain arrays: the chunks, and each entry's first line relative to the first line of the sequence's owner statement (or of the flow). A sequence is never edited. A compile that changes a statement builds new arrays for that statement's sequence by copying, with the tail of the line starts shifted, and a root that points at them. A preview compile does the same and its root is dropped afterwards, which leaves the real root, every sequence and every chunk exactly as they were, with nothing to roll back.

At the size of a real scene this costs microseconds. On the Raffles and Bunny project the flow that holds `main.sd` line 3515 is 15,954 records in #314's encoding and an estimated 813 statements in 4 sequences, the largest of 434; inserting a statement into that sequence costs 3 to 6 microseconds by copy and replacing one costs 1 to 2, against 5.4 microseconds for the bulk copy #314 pays to carry one unchanged flow of that size into every compile. A persistent 32-wide tree is cheaper still (0.7 to 1.4 microseconds) and barely grows with size, but every reader of a sequence is simpler over an array: the engine's next statement is an index plus one, and the line lookup is a binary search. The copy grows by 10 to 15 nanoseconds per entry, so it passes 50 microseconds between 3,000 and 5,000 statements in one sequence; a sequence that large is the point at which to put the tree behind the same reader interface.

The line starts are plain arrays of small integers and not typed arrays, because allocating a typed array costs more than copying a few hundred numbers.

### Identity

A statement keeps its program chunk across compiles while three things hold: its syntax subtree is the node object the incremental parse kept; every part of the lowering context its lowering read is unchanged (choose depth, loop stack, enclosing function scope, declared locals, the define type names and global callable names it consulted, as #656 lists them for parsed objects); and every fact about another symbol its emitted code depends on is unchanged. Those facts are what the 31 generating classes read outside their own subtree: whether a name is a flow, a function, a label, a global, a constant or a builtin; a callee's parameter count, which of its parameters are by reference, and whether it is variadic (`Divert.ts:130-246`); and a constant's value, which is inlined where it is read. The reference table records a hash of those facts per referenced symbol, so the incremental pass compares hashes and re-emits a chunk only when one differs.

Chunk ids come from a counter in the chunk store and are never reused within a table generation. A re-emitted statement gets a new id.

An address is a chunk id and an offset. Outside the engine it is one number, `chunkId * 2^21 + offset`, which a double holds exactly and a consumer compares with `===`.

**Decision:** one immutable `Int32Array` per statement with two-word instructions, chunk-relative jumps, symbols for everything outside the chunk, blocks resolved through the root, and copy-on-write array sequences under a persistent root.

**Reason:** an edit re-emits one chunk and copies one sequence; nothing else is touched, a preview needs no rollback, and the garbage collector reclaims dropped chunks and roots with no arena to compact.

**Alternative:** one flat buffer with absolute indexes, which #664 measured and whose every insertion shifts every later index; a single arena of chunk spans, which saves the per-array overhead (about 200 bytes a chunk) at the price of compaction and of a preview writing into shared storage; a flat sequence with synthetic head, else and end chunks and skip spans, which makes one statement several chunks and makes an owner's spans change when its body does; the persistent tree, kept in reserve as above. inkcpp's six-byte unaligned instruction was not taken because a typed array reads aligned words and a `DataView` read per field costs more than the two bytes save; a single word with a 24-bit payload was not taken because an instruction such as `CallStd` (a name and an arity) or `Choice` (flags, a target and a count symbol) needs a second operand.

## 2. Symbols

A symbol is what one chunk uses to refer to something another chunk defines. These receive one:

| Kind | Named | Counted |
| --- | --- | --- |
| Scene | `ACT_TWO` | yes |
| Branch | `ACT_TWO.cellar` | yes |
| Label, including the label of a `then` clause | `ACT_TWO.cellar.knock` | yes |
| Function | its name; one written inside a statement is anonymous | yes |
| Choice body, alternator | anonymous | yes |
| Global, constant | its name | no |

Symbols are interned in the persistent `ProgramTable` (`packages/sparkdown/src/binary/ProgramBinaryWriter.ts:44`) in a third pair beside strings and numbers: `symbols` (qualified names), `symbolIds`, and per symbol its kind and, for a counted kind, a dense count id. The table is append-only, so an id handed out stays valid for every chunk minted in that generation.

An anonymous symbol belongs to the statement that produced it. The chunk store allocates it when the statement is first emitted and hands it to the replacement when the statement is re-emitted in place (one statement in the changed range before and one after), by its ordinal within the statement. It is never renumbered by document order, which is what the generated function names do today (`SparkdownCompiler.ts:2062`) and what makes a preview compile rewrite them (#666). A durable save names an anonymous symbol by position, as it names an address (section 8).

### Resolution

Where a symbol is defined belongs to a root, because a preview root and the real root can define the same label in different chunks. A root holds three `Int32Array`s indexed by symbol id: the defining sequence, the entry in it, and the offset in that entry's chunk, with -1 for a symbol the program does not define. A compile copies the arrays and rewrites the rows of the symbols the changed chunks export, plus the entry of every symbol defined after the edit in the same sequence. No chunk holds an entry, so no chunk changes.

A divert through a symbol is three typed-array reads more than a divert whose target was resolved at compile time. Measured, that is 2 to 5 nanoseconds on a divert of 22 to 26, and a busier run put it inside the noise.

### A symbol that disappears

The id stays interned and its definition row becomes -1 in the new root. At compile time the pass that resolves references finds the chunks that refer to it through the reverse index of the reference tables and reports the diagnostic the current compiler reports (`target not found`), with the source range of the referring instruction. Their chunks are not re-emitted: they hold the id, which has not changed. At run time a jump to an undefined symbol raises the engine's runtime error with the source line of the jump, as `Divert target doesn't exist` does today. Saved state that names the symbol migrates (section 8).

### Reseed

`reseedProgramTable` (`ProgramBinaryWriter.ts:67`) starts a new generation. Every chunk holds ids of the old one, so the next compile is cold. The reseed interns the live entries again and returns, per table, an `Int32Array` from old id to new id with -1 for a dropped entry. An engine that receives a root of a newer generation remaps its counts arrays through it. A value that names a symbol holds the qualified name beside the id and the generation the id belongs to, and resolves the id again when the generation differs, so no walk of the table heap is needed.

**Decision:** exact interned ids in `ProgramTable`, definitions per root in typed arrays, anonymous symbols owned by their statement and inherited on re-emit, a reference to a vanished symbol reported and left in place.

**Reason:** a chunk never depends on where its target is, so an edit to the target re-emits only the target; ids are exact, so nothing is tie-broken.

**Alternative:** absolute offsets written into instructions at the end of a compile, which is what inkcpp's emitter does (`inkcpp_compiler/binary_emitter.cpp`, `process_paths`) and what a batch compiler can afford; 32-bit hashes of names, which inkcpp uses and has to tie-break by offset because paths repeat (`shared/private/header.h`, `container_hash_t`); ordinal names such as `g-0` and `c-1`, which one inserted gather renumbers.

## 3. The instruction set

The set is purpose-built and linear. It has no evaluation mode: where the current engine pushes content to the eval stack or to the output depending on `inExpressionEvaluation`, each instruction here names its own destination (`Text` writes output, `Str` pushes a value), so `EvalStart` and `EvalEnd` do not exist. A literal string is one `Str`. A table is built from a pair count known when it was lowered. A conditional is a relative jump.

Values are the engine's value classes, and a pushed constant is a value object created once per table entry, so pushing allocates nothing. "Pops n, pushes m" below is the effect on the eval stack. The output rules (a newline that is not repeated and does not open a line, glue, the trimming of a function's trailing whitespace) are those of `StoryState.PushToOutputStreamIndividual` and `TrimWhitespaceFromFunctionEnd`, carried over with the instruction's operand in place of the runtime object.

| Instruction | Operands | Eval stack | Output | Call stack | Counts |
| --- | --- | --- | --- | --- | --- |
| `LineStart` | | | ends an open look-ahead (section 6) | | |
| `Text` | arg: string | | appends the text, or adds it to an open capture | | |
| `Newline` | | | appends a newline under the newline rule | | |
| `Glue` | | | appends glue, which removes trailing newlines | | |
| `Out` | | pops 1 | appends its text; Void appends nothing | | |
| `BeginTag`, `EndTag` | | inside a capture `EndTag` pushes the tag for the next `Choice` | otherwise the tag markers | | |
| `BeginString` | | | opens a capture | | |
| `EndString` | | pushes the captured text | closes the capture | | |
| `Int` | arg: the value | pushes | | | |
| `Num` | arg: number id; flag: float | pushes | | | |
| `Str` | arg: string id | pushes | | | |
| `Const` | aux: nil, void, true or false | pushes | | | |
| `Sym` | arg: symbol | pushes a symbol value (section 10) | | | |
| `VarPtr` | arg: name | pushes a variable pointer resolved against the current frame, reusing an open upvalue for the same variable | | registers the open upvalue on its frame | |
| `MakeTable` | aux: pairs | pops 2 × pairs, pushes the table, with `EndObject`'s rules for a nil value and for a last entry that is a multiple value | | | |
| `Dup`, `Pop` | | duplicates or discards the top | | | |
| `Pack`, `Unpack` | aux: n | as `PackTuple` and `UnpackTuple` | | | |
| `Index` | | pops key and base, pushes the member, through `__index` on a miss | | | |
| `StoreIndex` | | pops value, key and base | | | |
| `GetVar` | arg: name | pushes the value, with `VariableReference`'s fallbacks: `_G`, a dotted name walked through tables, a flow's name as a symbol value, a builtin's name as its marker, nil | | | |
| `SetVar` | arg: name; flags: declare, global, varargs slot | pops 1; a multiple value keeps its first unless the varargs flag is set | | writes a temporary of the current frame, or a global | |
| `GetCount` | arg: symbol | pushes its visits | | | reads |
| `CountOf` | flag: turns since | pops a symbol value, pushes its visits or the turns since it | | | reads |
| `VisitIndex` | arg: symbol | pushes its visits less one | | | reads |
| `ShuffleIndex` | arg: symbol | pops the element count, pushes the next shuffled index, seeded from the symbol's name and the story seed | | | reads |
| `Visit` | arg: symbol | | | | raises the symbol's visits and records the turn |
| `BeginScope`, `EndScope` | | | | pushes or pops a scope of temporaries on the current frame; popping closes the upvalues bound in it | |
| `Native` | arg: operator name; aux: arguments | pops them, pushes the result, through `NativeFunctionCall` with its metamethod and namespace-override dispatch | | | |
| `CallStd` | arg: builtin name; aux: arity; flag: discard | pops the arguments with the last one spread; pushes the result unless discard is set | what the builtin writes; `display` writes its table and a newline | | |
| `Jump` | arg: offset | | | | |
| `JumpIfFalse` | arg: offset; flags: Luau truthiness, decision site | pops 1 | | | |
| `JumpIfKeep` | arg: offset; flag: `and` or `or` | jumps and keeps the top when it decides the result, otherwise pops it | | | |
| `JumpSym` | arg: symbol | | | rebuilds the block stack for the target | counts the flows entered (section 5) |
| `JumpVar` | arg: name | | | as `JumpSym`, to the symbol value the variable holds | as `JumpSym` |
| `Call` | arg: symbol; aux: arguments; flag: function or tunnel | spreads a last multiple value for a target that is not variadic | | pushes a frame that returns after this instruction | counts the flow entered |
| `CallVar` | arg: name; aux: arguments; flag: function or tunnel | as the variable-target divert: a symbol value, a closure table, a builtin marker, a builtin iterator or a `__call` table | | pushes a frame when the target is code | as `Call` |
| `CallValue` | aux: arguments, or 0xffff when unknown | pops the target, then as `CallValueAsFunction`: padding, overflow, variadic packing, `__call`, `__namecall` | | pushes a frame when the target is code | as `Call` |
| `Return` | | leaves the result | trims the function's trailing whitespace | pops a function frame | |
| `TunnelReturn` | | pops a symbol value or void | | pops a tunnel frame; a symbol value is jumped to | |
| `Thread` | arg: offset | | | forks the current thread; the fork runs on from the next instruction and the original resumes at the offset when the fork ends | |
| `EnterBlock` | arg: block | | | pushes the block on the frame's block stack and enters its sequence | |
| `Leave` | flag: continue | | | pops the block stack to the nearest loop body and resumes its owner | |
| `Choice` | flags: condition, start content, choice-only content, invisible default, once only, decision site; aux: target offset; arg: the choice's count symbol | pops the condition, the choice-only text and the start text, and any tags above them | | adds a choice that holds a fork of the thread, unless the condition is false or a once-only choice was visited | reads the count symbol |
| `Done` | | | | pops a forked thread if one is open, otherwise stops the flow with a safe exit | |
| `End` | | | | ends every flow | |

A `JumpIfFalse` or `Choice` with the decision-site flag is where the route planner pauses, forks and forces a value, which is what a conditional divert and a choice point with a condition are today (`Story.ts:1715-1734`). A jump that belongs to an expression (`and`, `or`, the `if` expression) carries no such flag, as `ShortCircuit` has no pause today.

### What the parsed hierarchy emits

The writer gives each class that implements `GenerateRuntimeObject` an emit path beside it. All 31, under `packages/sparkdown/src/inkjs/compiler/Parser/ParsedHierarchy`:

| Class | Emits |
| --- | --- |
| `Object` | nothing: it declares the method |
| `AuthorWarning` | nothing; emitting it raises the warning, as generating it does |
| `IncludedFile` | nothing |
| `ConstantDeclaration` | nothing in a flow; it defines a constant symbol, and its value is an emission input of every chunk that reads it |
| `StructDefinition`, `StructPropertyDefinition` | nothing: they are compile-time records and their generators throw today |
| `ExternalDeclaration` | not carried: external function bindings have no caller outside the engine (#692). The fallback names `external` |
| `ListDefinition`, `ListElementDefinition` | not carried: Sparkdown has no LIST type and no parsed list is ever constructed. The fallback names `list` |
| `Wrap` | the instruction of what it wraps: `Glue`, a legacy tag's markers, `BeginScope`, `EndScope` |
| `Text` | `Text`, or `Newline` when the text is a newline |
| `Tag` | `BeginTag` or `EndTag` |
| `ContentList` | the code of its children in order, with no container |
| `Statement` | the code of its children; the chunk is the statement, so the named container it exists to provide is not needed |
| `Expression` and its subclasses | the code of `GenerateIntoContainer`: `Int`, `Num`, `Str`, `Const` for literals; `BeginString` to `EndString` for an interpolated string; `MakeTable` for a table; `Index`; `Native` for an operator; `JumpIfKeep` for `and` and `or`; `JumpIfFalse` and `Jump` for the `if` expression; `GetVar`, `SetVar` and `Native` for an increment; `Dup` and `SetVar` for a stash and reread; `VarPtr`; then `Out` when the expression is output |
| `VariableReference` (through `Expression`) | `GetVar`, or `GetCount` when the name resolves to a counted symbol |
| `FunctionCall` (through `Expression`) | the arguments, then `CountOf` for a read count or turns since, `CallStd` for a state-aware builtin, `Native` for an operator or a builtin method, or the `Call` of its divert; `Pop` where the value is discarded, folded into `CallStd`'s discard flag |
| `CallValueExpression` | the arguments, the target, `CallValue` |
| `VariableAssignment` | the expression, then `SetVar`; a global declaration is a chunk of the declaration sequence |
| `MultiVariableAssignment` | the expression, `Unpack`, a `SetVar` per target |
| `StorePropertyAssignment` | base, key, value, `StoreIndex` |
| `ReturnType` | the expression or `Const` void, then `Return` |
| `MultiReturnType` | the expressions, `Pack`, `Return` |
| `Divert` | `Jump` to a label of the same chunk; `JumpSym`, `JumpVar`, `Call` or `CallVar` with the arguments before it (`VarPtr` for a by-reference argument, nil padding and `Pack` for a variadic target); `Thread` around the jump for a thread; `Leave` for the generated label of an enclosing loop. `Done` and `End` for the two built-in targets |
| `DivertTarget` | `Sym` |
| `TunnelOnwards` | the override target or `Const` void, then `TunnelReturn` |
| `FlowBase` | a sequence registered under the flow's symbol, whose first chunk binds the parameters; a function inside a statement is a block of that statement |
| `Gather` | a label: a chunk that exports the label's symbol at its `Visit`. An unnamed gather emits nothing (section 4) |
| `Choice` | its condition and text code, its `Choice`, and its entry code, all in the `choose` statement's chunk; its body is a block (section 4) |
| `Weave` | no code of its own: it is the structure of a `choose` chunk's blocks (section 4) |
| `Conditional` | one chunk: per branch its condition, a `JumpIfFalse` with the decision-site flag, the branch's `Newline` and scope markers, `EnterBlock`, and a `Jump` to the end |
| `ConditionalSingleBranch` | one branch of that chunk; a `match` form compares with `Dup`, the value and `Native ==`, and pops the duplicate on entry |
| `Sequence` | one chunk: `VisitIndex` or `ShuffleIndex` on its own count symbol, the clamp (`Native MIN` or `%`), a run of `Dup`, `Int`, `Native ==`, `JumpIfFalse` per arm, each arm's content inline or as a block, and its `Visit` |

### What replaces the runtime objects

Everything `Story.Step` and `Story.PerformLogicAndFlowControl` dispatch today:

| Runtime object or control command | Becomes |
| --- | --- |
| `Container` | nothing to execute: a flow or a block is a sequence, and what a container was counted for is a `Visit` |
| `Divert` | `Jump`, `JumpSym`, `JumpVar`, `Call`, `CallVar`; an external divert is not carried |
| `ChoicePoint` | `Choice` |
| `VariableAssignment`, `VariableReference` | `SetVar`; `GetVar`, `GetCount` |
| `NativeFunctionCall` | `Native` |
| `StringValue`, `IntValue`, `FloatValue`, `BoolValue`, `NullValue`, `Void` | `Text` or `Str`; `Int`; `Num`; `Const` |
| `DivertTargetValue`, `VariablePointerValue` | `Sym`; `VarPtr` |
| `ListValue` | not carried |
| `Glue`, `Tag` | `Glue`; the tag markers |
| `EvalStart`, `EvalEnd` | not carried: an instruction names its destination |
| `EvalOutput` | `Out` |
| `Duplicate`, `PopEvaluatedValue` | `Dup`, `Pop` |
| `PopFunction`, `PopTunnel` | `Return`, `TunnelReturn` |
| `BeginString`, `EndString`, `BeginTag`, `EndTag` | the same four |
| `BeginObject`, `EndObject` | `MakeTable` |
| `IndexValue`, `StoreIndex` | `Index`, `StoreIndex` |
| `CallValueAsFunction` | `CallValue` |
| `BeginScope`, `EndScope` | the same two |
| `RunStdLibFunction` | `CallStd` |
| `PackTuple`, `UnpackTuple` | `Pack`, `Unpack` |
| `ShortCircuit` | `JumpIfKeep`, `JumpIfFalse`, `Jump` |
| `TurnsSince`, `ReadCount` | `CountOf` |
| `VisitIndex`, `SequenceShuffleIndex` | `VisitIndex`, `ShuffleIndex`, each naming its symbol, since there is no current container to ask |
| `StartThread` | `Thread` |
| `Done`, `End` | the same two |
| `NoOp` | not carried: it exists as a divert's landing place, and a relative jump needs none |
| `ListFromInt`, `ListRange`, `ListRandom` | not carried |

**Decision:** about fifty instructions that name their destination, with the choice point, the count marker, the line start and the block entry as instructions of their own.

**Reason:** a display beat is 7 to 9 instructions where it is 18 to 24 runtime objects, every one of them dispatched by an integer switch; the value model, the operators and the builtins are reused as they are, so parity rests on the same code.

**Alternative:** executing #314's encoding of the ink JSON tree, which #664's prototype ran for measurement only and which inherits container climbing, path resolution and the evaluation mode; inkcpp's set (`shared/private/command.h`), which gives each operator an opcode and so would replace `NativeFunctionCall`, the value model's dispatch, which the maintainer keeps.

## 4. Weaves in linear code

A `choose` block is one statement and one chunk. For

```
choose
  + [Open the door] if has_key
    The door swings open.
  * Knock
    Nobody answers.
then (hallway)
  You step back.
end
```

the chunk is:

```
      BeginString  Text "Open the door"  EndString     the first choice's choice-only text
      GetVar has_key                                   its condition
      Choice   condition, choice-only, decision site   target A   count #1
      BeginString  Text "Knock"  EndString             the second choice's start content
      Choice   start content, once only                target B   count #2
      Done
A:    Visit #1
      Newline
      EnterBlock 0
      Jump T
B:    Visit #2
      Text "Knock"
      Newline
      EnterBlock 1
T:    Visit ACT_TWO.hallway
      EnterBlock 2
```

The chunk exports `ACT_TWO.hallway` at `T`. Blocks 0 and 1 are the choices' bodies and block 2 is the `then` clause. Their statements are chunks of their own in the three sequences, so a plain line inside the clause does not depend on the choices before it, and a line after the `choose` block is the next entry of the parent sequence.

What the current weave computes as a fold over siblings falls out of the structure. A loose end is the end of a block: a choice's body ends, its owner resumes at `Jump T`, and with no `then` clause the owner's code ends and the parent sequence continues. A nested `choose` passes its loose ends to its ancestors the same way, by running out. A gather replaces no container, because a statement is never inside one. An `if` that gates a choice inside a `choose` block is a relative jump around that choice's code in the same chunk.

A `label` statement is a chunk of its own that exports its symbol at a `Visit`, in the sequence where the author wrote it.

Nothing is named by ordinal. An unnamed gather needs no identity: it is an offset inside its chunk. A choice's count, which once-only reads, is an anonymous symbol owned by the `choose` statement (section 2). A choice's identity for the route planner, which is `Choice.sourcePath` today, is the address of its `Choice` instruction. An alternator's count and its shuffle seed come from its own anonymous symbol.

The start content of a choice is emitted twice, once inside the capture that builds the choice's text and once as output at its entry, where the current protocol runs one container twice through a return label held in a temporary.

**Decision:** one chunk per `choose` with relative labels for its choices and its `then` clause, bodies as blocks, anonymous count symbols in place of ordinal names.

**Reason:** the fold's shared state (the current container, the loose ends, the ordinal counters of `Weave.ts:64`, `:75`, `:282`) has no counterpart, so inserting a statement or a gather renames nothing.

**Alternative:** porting the weave's containers and the `$r` return-label protocol as they are, which keeps the statement inside its gather's path; one chunk for the whole block with its bodies inline, which re-emits 1,100 lines for an edit to one.

## 5. Counts

Every symbol of a counted kind has a dense count id, given when it is interned. Visits are a `Uint32Array` and the turn of the last visit an `Int32Array` holding -1 for never, both indexed by count id and grown when the table grows.

Every counted symbol counts, always. No count flag exists and no pass decides which containers count. What the language reads is unchanged, because a count that no script reads is never observed; what changes is that a read added in one flow re-emits nothing in the counted flow, a count has its full history whenever a script first reads it, and `FlattenContainersIn` with its count-flag reconcile (about 8 percent of `ink/compile`, #664) has no successor, because there is no container to flatten and no flag to reconcile.

A label, a choice body and an alternator count at their start only, as their containers do today (`countingAtStartOnly`), so their count is a `Visit` at their position: flow that passes the position counts, whether it fell through or jumped there.

A flow counts when it is entered from outside, wherever the jump lands, and when a jump lands on its first instruction from anywhere. The engine decides that from the root's sequence table, which is the container table of this design: per sequence its owner chunk, the owner's sequence, its block index, whether the block is scoped, and its flow's symbol, with a branch's flow naming its scene as parent. On `JumpSym`, `JumpVar`, a call, a chosen choice and a loaded position, the engine reads the target's sequence, walks owners to the flow to rebuild the block stack and the scope depth of the frame, and compares the flow and its parent scene with those of the position it left; each one newly entered gets a visit. That is `VisitChangedContainersDueToDivert` with sequences in place of containers, and inkcpp's `jump` (`inkcpp/runner_impl.cpp`) with owner links in place of start and end offsets.

**Decision:** typed-array counts indexed by a dense id that every counted symbol receives, `Visit` markers for the start-only kinds, and the root's sequence table for flows entered by a jump.

**Reason:** a checkpoint's counts are an array copy and its delta an array difference, in place of two maps keyed by path string that are the largest part of a save today; nothing about counting is a whole-program pass.

**Alternative:** a count flag in the symbol table maintained from references, which the filing of #696 proposed. It gives the same reads, needs a reference count per symbol kept by the incremental pass, and leaves a count at zero when a script starts reading a container that was visited before the read existed. inkcpp's start and end container markers with offset ranges were not taken, because containment here is structural.

## 6. How a beat ends

Every displayed line is a `display(...)` call whose builtin writes its table and a newline (#685). A continuation is a `Glue` followed by its own call (#686). The writer puts `LineStart` first in the chunk of every statement that displays and does not begin with glue, ahead of its tags and its argument. It knows the statement's kind, so this does not depend on how #691 lands in the current engine.

A continue runs until a line is over:

1. After an instruction leaves the output ending in a newline, outside a capture, with more to run, the engine opens a save point (section 7) and keeps stepping.
2. `Glue` removes the newline. The line goes on, so the save point is forgotten.
3. `LineStart`, or any visible output, with the save point open means the line ended at its newline. The engine restores and returns the line. The next line's argument has not been evaluated, so a beat's body runs once.
4. `Done`, `End`, or running out of content with the save point open forgets it and returns the line. Choices raised on the way stay raised, as they do today.

Logic between two beats runs during the look-ahead and is taken back, then runs again when the next continue starts. It cannot be left run: the game reads variables between continues, so a reactive binding would show an assignment one beat early. It is cheap to take back, because restoring costs what changed.

A state-aware builtin whose effect cannot be restored ends the look-ahead before it runs, as `LineStart` does. This is inkcpp's rule for an external function that is not marked safe (`inkcpp/runner_impl.cpp`, `CALL_EXTERNAL`), kept as a backstop; every builtin today writes only restorable state.

A continue returns with the position just after the instruction that wrote the line's newline. A statement whose last instruction wrote it rests at offset 0 of the next chunk, which is the address a consumer sees for "after this beat".

Choice presentation needs from the engine what it has today: each choice's text and tags, its index, whether it is an invisible default, the address of its `Choice` instruction as its identity, its target, and the thread it was raised in. A choice's text is built in a capture and stays flat text; how choices are transported is outside #685.

**Decision:** a `LineStart` marker emitted by the writer, a save point opened at a newline and resolved by glue, by a line start or by the end of content, with unsafe builtins as a backstop.

**Reason:** the look-ahead costs a save and a restore of restorable state and no re-evaluation, where today every beat is stepped twice (#664): on the comparison scene the prototype takes 6,927 steps where the engine takes 29,517.

**Alternative:** treating `display` itself as the unsafe call, which still evaluates the whole argument before the call is reached; running the logic after a newline for good and stopping at the line start, which saves the restore and changes what a game observes between beats; resolving glue at compile time, which #685 rejected because a continuation can sit inside an `if`.

## 7. State

Engine state is of two kinds. Positional state is small at the end of a line and is copied whole. Keyed state is large and changes little, so it is journaled.

| State | Held as | At a save point | In an image |
| --- | --- | --- | --- |
| Position: sequence, entry, offset | three numbers | copied | the address |
| Call frames: kind, return address, eval height, output start, scopes of temporaries, open upvalues, block stack | an array per thread | the array is copied, a scope's map on its first write | addresses and the temporaries; the block stack is rebuilt |
| Threads, and the thread each choice holds | arrays of frames | copied | as frames |
| Eval stack, output, captures, choices | arrays | copied; they hold a handful of entries | copied |
| Turn index, seed, previous random, safe-exit flag | numbers | copied | copied |
| Visits, turns | typed arrays | an undo log of id, old visits, old turn | whole in a keyframe; the changed ids in a delta |
| Globals | `VariablesState`, unchanged | its patch, as today | whole in a keyframe; the names assigned since in a delta |
| Tables | `ObjectValue` maps, unchanged | an undo log of map, key, old value | the content of each table written since the previous image |

### Save, restore, forget

A save point is what the look-ahead opens. `save` copies the positional state and starts the logs; `restore` puts the copies back and unwinds the logs; `forget` drops both. One level is enough: a look-ahead never opens inside another. On state the size of the Raffles and Bunny story (591 globals, a count per symbol, one frame) a save and a restore cost 0.5 microseconds, and 0.7 with a global and a count written between them, against 3.2 and 5.5 for `StateSnapshot` and `RestoreStateSnapshot` (`Story.ts:1602`, `:1611`) at the end of each line of the real route, because those copy the whole `StoryState`.

Every write to a table goes through one barrier on the table: `StoreIndex`, `__newindex`, and each builtin that changes a table in place (`table.insert`, `table.remove`, `table.sort`, `rawset` and the rest). Today only `StoreIndex` and the metatable helpers journal (`Story.ts:637`, `:660`, `:2744`), so a table changed by a builtin during a look-ahead is not taken back; the barrier closes that.

### Images

An image serves a route search node and a checkpoint alike. A keyframe holds everything in the last column above. A delta holds the positional state, which is small, and for the keyed state only what changed since the image it follows: the barrier that feeds the undo log also marks the count ids, the global names and the tables written since the last capture. The first time a table is written after a reset, the barrier keeps a copy of its pristine content, so that restoring an image taken before that write can put it back.

Restoring an image restores in place: counts are copied into the live arrays, globals reset and reassigned, and each table that was ever written is cleared and refilled from the newest copy at or before the image, or from its pristine copy. Identity is kept, so nothing is relinked, and a table created after the image is simply unreachable.

A route search node holds an image in place of `stateJson` (`planRoute.ts:21`). The search is breadth-first, so its nodes are live together and their images form a tree: a fork's image is a delta on the image its run started from, siblings share it, and `claimForkSite` hashes its content. A node run restores the chain from the nearest keyframe, which costs the changes along that path and not the size of the state. Forks are rare beside steps (the route to `main.sd` line 3515 is about 30,000 engine steps and one `choose`), so a fork pays a positional copy and a short delta.

A checkpoint is the same image taken at each beat: a keyframe every `baseInterval` beats and deltas between, as `CheckpointStore` arranges them today, without the JSON text and without the string splice that exists to keep the path-keyed count maps out of it. Within a session a checkpoint holds addresses and count ids as they are. They survive a compile for every statement that was not re-emitted. When a root arrives, the store translates the addresses of chunks the new root no longer holds while it still has the old root to ask (section 8).

### The save format

A save is JSON, versioned by the engine that wrote it, and owes no compatibility to the current engine's saves, of which none exist outside development. Values go through the existing `JsonSerialisation` round trip, which keeps table identity with `objref` and relinks instances of a define. Positions and counted symbols are written symbolically (section 8): a frame's address as its symbolic form, a count under its symbol's qualified name or its position, a symbol value by its name.

**Decision:** copied positional state, journaled keyed state behind one write barrier, a single-level save point for the look-ahead, and keyframe and delta images for route search nodes and checkpoints.

**Reason:** the look-ahead, a fork and a checkpoint each cost what changed, and none allocates a copy of the whole state.

**Alternative:** inkcpp's restorable stack (`inkcpp/collections/restorable.h`), which keeps a saved region in place with a jump pointer so that a save is free. The contract is taken (save, restore, forget, fanned out from the runner as `inkcpp/runner_impl.cpp` does it) and the mechanism is not, because the positional arrays hold a handful of entries at the end of a line and a copy measures at half a microsecond. A version tree of undo and redo logs, which would make any two states reachable from each other, was not chosen because a restore in place from the nearest keyframe is simpler and a fork is rare. Copy-on-write tables behind a handle were not chosen because the value model stays as it is.

## 8. Addresses

Outside the engine a position is a source location. The root offers two lookups, and one accessor answers from either engine until the current one is deleted:

- `addressAt(uri, line)` returns the address of the beat or statement on that line, or nothing. It finds the flow whose line range holds the line, descends through the sequences by binary search of their line starts, then reads the chunk's line table. A beat's address is the offset of its `LineStart`, so the cue line, the directive and the dialogue text of one beat return one address, and the lines of two beats return two.
- `locationOf(address)` returns the script and range of the line table row that covers the offset, with the sequence's and its owners' line starts added.

A chunk's line table is relative to its statement's first line, and a sequence's line starts are relative to its owner's, so an edit above shifts no stored line in any chunk. It shifts the tail of one array per enclosing sequence, and the first line of each later flow in the script, which the root holds per flow.

An address survives a compile for every statement that was not re-emitted. A route step's identity is the address of its position, folded as `extendSeq` folds path strings today, and a reused route step is one whose chunk is still in the root.

### The saved form

An address that outlives a session, or a chunk, is written as the flow's qualified name; the nearest label at or above the position in the chain of sequences that holds it, if any; the ordinals of the statement from that anchor, one per nested sequence with the block index between them; the offset; and the fingerprints of the statement's chunk and of the one before it. An anonymous symbol is written the same way, with its ordinal in the statement in place of the offset.

Loading resolves the anchor, walks the ordinals and compares both fingerprints:

1. Both match: the address is exact.
2. They do not: the loader looks for the pair among the entries of the same sequence, nearest first, which is how a save taken below an edit finds its statement after an insertion above it.
3. Not found, and the offset was 0: the statement now at that ordinal, at offset 0.
4. Otherwise the nearest named container above: the anchor label if it still exists, else the start of the flow.
5. The flow is gone: the load is refused and says which flow. The engine does not guess a position it cannot name.

Steps 4 and 5 are what inkcpp's snapshots do with the hash of the current container (`inkcpp/story_impl.cpp`, `find_migration_hash` and `new_runner_from_snapshot`), here by interned name and with an exact match tried first.

Within a session, when a root arrives, a checkpoint's address whose chunk the new root does not hold is translated once: the old root gives its saved form and the new root resolves it by the same steps.

**Decision:** an opaque address of chunk id and offset for the running program, two lookups on the root in place of the path-location table, and a symbolic saved form that migrates to the nearest named container.

**Reason:** consumers asked a path for two things, where a line runs and whether two lines run at the same place, and an address answers both without a table of every location in the program (2,083 KB of a 4,316 KB program today) or the two compile phases that build it.

**Alternative:** path strings kept at the boundary; a record index, which shifts on every edit; a statement ordinal alone as the saved form, which an insertion above shifts and which identical statements make ambiguous, hence the pair of fingerprints.

## 9. The surfaces

### The config fields

`SparkdownCompilerConfig.programChunks` and `GameConfiguration.programChunks`, both booleans, off by default, with no editor setting. The compiler field cannot be `binaryProgram`, which selects #314's encoding while it exists (`SparkdownCompilerConfig.ts:70`). With the field on, a compile fills the chunk store and `program.chunks` refers to the root; `program.compiled` is not emitted.

### The fallback

The writer emits what it can. The first parsed object it has no emit path for, at any depth, makes the whole compile fall back: the program is compiled and run by the current engine, and `program.fallback` holds the construct's name (the parsed class's `typeName`, or the builtin's or command's name), the script and the line. The game constructs the current `Story` when `program.fallback` is set. `preview-bench.mjs` reports the statements emitted and the fallbacks counted by construct.

### The chunk store

The compiler owns the store and the game in the same worker reads a root by reference (#676). The interface is what a transported store would also implement:

| Member | Gives |
| --- | --- |
| `table` | the `ProgramTable` and its generation |
| `id`, `since` | the root's identity and its predecessor's, as `ProgramChangeSummary` numbers programs |
| `flow(symbol)` | the flow's sequence |
| `block(chunkId, k)` | a block's sequence |
| `sequence(id)` | its chunks, their ids, its line starts, its owner and its flow |
| `definition(symbol)` | sequence, entry and offset, or nothing |
| `position(chunkId)` | the sequence and entry that hold a chunk, from an index built on first use |
| `declarations(uri)` | a script's declaration sequence |
| `addressAt`, `locationOf`, `savedForm`, `resolve` | section 8 |

### The Story surface

The engine presents what its callers use today, so that shared fixtures run against both engines. Members that carried a path carry an address.

| Caller | Uses | Presented as |
| --- | --- | --- |
| `Game.ts` | `canContinue`, `ContinueAsync`, `asyncContinueComplete`, `CancelAsyncContinue`, `ResetState`, `currentText`, `currentTags`, `currentDisplayInstructions`, `currentChoices`, `ChooseChoiceIndex`, `variablesState`, `simulator`, the seven hooks (`onError`, `onExecute`, `onMakeChoice`, `onEvaluateCondition`, and the three snapshot hooks), `processEscapes`, `collapseWhitespace` | the same members |
| `Game.ts` | `ChoosePathString` | the same, taking a qualified symbol name |
| `Game.ts` | `state.currentPathString`, `state.previousPointer.path`, `onExecute(path)` | `currentAddress`, `previousAddress`, `onExecute(address)`, called only when set |
| `Game.ts`, `CheckpointStore.ts` | `state.toJson`, `LoadJson`, `ToJsonWithoutCounts`, the count entry and delta readers | `capture`, `restore`, `toSave`, `loadSave` (section 7) |
| `Game.ts` (debugger) | `state.callStack`, `state.callstackDepth`, the private globals and each frame's temporaries | a frames view: per frame its symbol, its address and its temporaries |
| `Game.ts` | `listDefinitions` | not carried |
| `planRoute.ts` | `state.toJson`, `LoadJson`, `previousPointer`, `pauseBeforeEvaluatingConditions`, `pausedBeforeCondition`, `simulator`, `ChooseChoice`, a choice's `sourcePath`, `stateIsPristine`, `ResetErrors` | images and addresses: the pause site and a choice's identity are addresses |
| `RuntimeState.ts` | `currentChoices`; its recency sets of executed paths | the same; sets of addresses |
| `InterpreterModule.ts` | `currentTags`, `currentDisplayInstructions` | the same |
| `UIModule.ts` | `variablesState` with its reactive tracking, `HasFunction`, `EvaluateFunction`, `onError` | the same; a function is found by its symbol |
| `buildContextFromStory.ts` | the globals and `GetVariableWithName` | unchanged, since `VariablesState` is |
| `StdLib.ts` (203 uses) | `Error` (155), `AddError`, `errorMessageFormatter`, `CallLuauFunction`, `CallLuauFunctionProtected`, `turns`, `state.variablesState`, `state.storySeed`, `state.previousRandom`, `state.currentTurnIndex`, `state.generatedChoices`, `state.PushToOutputStream`, and `state.callStack` for `debug.traceback` and `debug.info` | the same; a frame's name comes from its symbol in place of a parsed path |

External function bindings and variable observers are not presented.

### The names

`BinaryProgramWriter` emits a statement's chunk and `BinaryProgramReader` iterates sequences and instructions in place, as the maintainer named them. They live under `packages/sparkdown/src/program/`, apart from #314's `ProgramBinaryWriter` under `src/binary/`. The chunk's type is `StatementChunk` while #314's exported `ProgramChunk` exists. The root is `ProgramRoot`, the store `ChunkStore`, the engine `ProgramStory`, and the surface both engines implement `StoryEngine`.

**Decision:** one field name on both sides, a whole-program fallback that names the first construct, a store read by reference behind an interface, and the `Story` surface with addresses where paths were.

**Reason:** the build-out needs every program to run on one engine or the other with no mixed state, and a coverage number that says what is left.

**Alternative:** a fallback per flow, which would run one story on two engines with two states; a second `Story` subclass, which inherits 5,334 lines of container navigation to override.

## 10. Function values

A function value is a symbol value: the class that replaces `DivertTargetValue` (`packages/sparkdown/src/inkjs/engine/Value.ts:373`) holds a symbol id, the qualified name and the table generation in place of a `Path`. It is what `Sym` pushes, what a scene or label held in a variable is, what `CountOf` and `TunnelReturn` pop, and what `GetVar` produces for a flow's name. Truthiness, equality and printing follow the name, as they follow the path today.

A closure stays the table it is (`__closure_fn`, `__closure_upvals`, `__closure_user_arity`), with a symbol value in `__closure_fn`. Its code is a function-body block of the statement that wrote it, exported under an anonymous symbol that the statement owns, so an edit elsewhere renames no function and a preview rewrites none. A call resolves the symbol in the root the engine holds. A closure made before an edit to its own statement runs the statement's new code the next time it is called, which is what hot reload means for every other statement.

Upvalues are unchanged: a `VariablePointerValue` names a variable and a frame, open upvalues are registered on their frame, and the three closing points (a frame pop, `EndScope`, a `local` declared again in the same scope) stay in `CallStack`. A call frame addresses code by address: the return position is a chunk id and an offset, beside the frame's kind, eval height, output start, scopes and block stack.

Temporaries stay maps keyed by name in each frame's scopes, as `CallStack.Element.temporaryScopes` holds them. An instruction carries the name's string id, which the table turns into the string without allocating.

In a save a symbol value is its qualified name, or the saved form of its position when anonymous (section 8).

**Decision:** a symbol value in place of the path, closures and upvalues as they are, frames that return to addresses, temporaries by name.

**Reason:** everything that held a `Path` needed only to name code, and a symbol does that across compiles.

**Alternative:** a direct reference from the value to its chunk, which would keep a deleted statement's code alive and running; numbered slots for temporaries, which would rewrite how the lowerers resolve names, against a route on which variable work is a handful of steps in 30,000 (#664).

## A statement inserted in the middle of a long `then` clause

`ACT_TWO` ends in a `choose` at line 2449 whose `then` clause runs to line 3556 and holds about 430 statements. The author inserts a two-line action statement at line 3000, which falls between entries 210 and 211 of the clause's sequence.

| What | Changes |
| --- | --- |
| Program chunks | One is emitted, for the new statement, with a new id. No existing chunk is re-emitted or rewritten: not the statements around it, which hold no position; not the `choose` chunk, whose code says `EnterBlock 2` and nothing about what block 2 holds; not any chunk that jumps to a label below line 3000, which holds the label's symbol |
| Sequences | The clause's sequence is replaced by a copy of its two arrays with the new chunk at entry 211 and the line starts of entries 212 onwards raised by 2. Every other sequence is shared with the previous root |
| Root | A new root: `blocks[choose chunk][2]` names the new sequence; the first lines of the flows after `ACT_TWO` in `main.sd` are raised by 2 |
| Symbols | None is defined or removed. The definition rows of labels in the clause below the insertion have their entry raised by 1 in the new root. Their ids, and every chunk that refers to them, are unchanged |
| Line tables | None. They are relative to their own statement |
| Addresses | Every address stays valid, because no chunk changed. A checkpoint taken at a beat below line 3000 loads into the new root as it is |
| A durable save taken below line 3000 | Its ordinal from the `then` label is now one short. The loader finds the pair of fingerprints one entry further on and resumes at the same statement (section 8, step 2) |
| The route | The change summary says line 3000. Every step above it is reused, and the replay resumes from the last checkpoint above that line |
| Passes | The reference pass visits the one new chunk. No symbol's definedness changed, so it visits no other |

#694's criterion, and the one #692 sets for a statement inside a `then` clause, assert this by a counter of emitted chunks and by the identity of every other chunk.

## Measurements

Taken 2026-09-21 at 83b5f1855 plus this branch's scripts, on an Intel i7-9750H, Windows 11, Node 23.6.0. Processor load from other sessions read 36 to 52 percent through the runs, so the machine was busy: read the ratios, and treat a difference of a few nanoseconds as a bound. Every figure is min / median / max over 12 samples after 4 warm-up samples, one candidate per process, from a bundle built without function names.

```bash
node scripts/bench/engine-bench.mjs --fixture --mode chunks,symbols,order,lookahead
node scripts/bench/engine-bench.mjs --project <Raffles and Bunny project> --line 3515 --mode symbols,order,lookahead
```

The first command reproduces every fixture figure without the private project. How to read each mode is in `.agents/skills/drive-web-editor/references/performance.md`.

### The prototype against the engine

`--mode chunks` runs `buildChunksFixture` (`scripts/bench/preview-fixture.mjs`): eight scenes reached by `-> NAME`, stored variables and reassignments, `if ... else ... end` blocks, a line that interpolates two variables, and one `choose` whose `then` clause holds the last 1,100 lines. Both engines run it from the top of `MAIN` until nothing is left, taking the first choice. The command fails unless all four candidates produce the same digest of every line's text, tags and display tables and of every list of choices. They do: 674 lines, 674 display tables and one stop at choices, digest `7a543d164c28…`. Breaking the prototype on purpose (not taking variables back when a look-ahead is restored) fails the run with `chunks: outputs differ`.

| Script, top to end | Engine | Prototype |
| --- | --- | --- |
| Steps | 29,517 | 6,927 |
| One call per step | 34.36 / 48.76 / 107.23 ms; 1.164 / 1.652 / 3.633 microseconds per step | 1.21 / 1.62 / 3.12 ms; 0.175 / 0.233 / 0.451 microseconds per step |
| One call per line | 32.86 / 38.07 / 46.56 ms; 48.8 / 56.5 / 69.1 microseconds per line | 1.09 / 1.50 / 3.13 ms; 1.62 / 2.23 / 4.64 microseconds per line |

An earlier run in the same sitting gave the engine 30.87 / 35.09 / 39.84 ms per step-driven script and the prototype 1.04 / 1.68 / 2.34.

The program is 795 chunks in 57 sequences, 6,443 instructions and 61,280 bytes of chunks, with 12 symbols, and the prototype opened 674 look-aheads, one per line.

The prototype's step is dearer than #664's (0.05 microseconds) because its steps are coarser and it does real work #664's left out: the engine's value classes and native operators, variables with an undo log, counts, block entry and the look-ahead's save and restore. Its steps are fewer for two reasons of about equal weight: a beat is 7 to 9 instructions where it is 18 to 24 runtime objects, and no beat is evaluated twice. A factor of about 25 per line is what the layout permits on this content. It is not a forecast for a full engine, which also carries call frames, threads, errors and the whole builtin surface; #664's profile put the certain saving at 35 to 50 percent of stepping, and the look-ahead's repeat at about half of it on top.

What the prototype leaves out: function calls and frames, tunnels, threads, labels and jumps into a block, loops, glue, tags, every builtin but `display`, choice conditions, once-only and fallback choices, errors and warnings, images and the save format. Its writer translates the compiled JSON tree of the kinds above and throws, naming the construct, on anything else; it does not lower source.

### A symbol lookup per divert

`--mode symbols` runs a ring of as many flows as the project would intern symbols, each holding one divert to the next, 2,000,000 diverts per sample, once through the root's symbol table and once with every divert replaced by a reference to its target.

| Project | Through the symbol table | Resolved at compile time | Difference by the medians |
| --- | --- | --- | --- |
| Fixture, 6 symbols | 21.60 / 26.19 / 28.28 ns | 18.75 / 21.71 / 24.76 ns | 4.48 ns |
| Raffles and Bunny, 24 symbols | 21.58 / 24.11 / 54.38 ns | 20.17 / 22.41 / 26.12 ns | 1.70 ns |

A busier run of the fixture reversed the sign, so the lookup is 2 to 5 nanoseconds and inside the noise of this machine. The Raffles and Bunny route to line 3515 takes 8 diverts.

### Inserting and replacing a chunk

`--mode order`, at the sizes of the flow that holds the line: its largest sequence, every statement of the flow in one sequence, and one entry per record of #314's encoding, which is the scale the ticket names. The statement counts are an estimate read from the compiled JSON tree (`scripts/bench/projectShape.ts`). Medians in nanoseconds per operation, at the top, the middle and the bottom of the sequence; each insert and replace includes the restamp of the later line starts.

| Raffles and Bunny, `ACT_TWO`: 15,954 records, 813 statements in 4 sequences | Insert | Replace |
| --- | --- | --- |
| Copy on write, 434 entries | 5,539 / 3,881 / 3,019 | 1,738 / 1,332 / 1,543 |
| Copy on write, 813 entries | 6,839 / 5,074 / 4,908 | 2,245 / 2,556 / 1,989 |
| Copy on write, 15,954 entries | 247,972 / 277,530 / 235,624 | 43,072 / 57,531 / 26,585 |
| Edit in place, 434 entries (an insert and its removal) | 1,041 / 1,198 / 166 | 553 / 255 / 19 |
| Persistent 32-wide tree, 434 entries | 1,261 / 1,399 / 654 | 498 / 420 / 698 |
| Persistent 32-wide tree, 15,954 entries | 1,734 / 1,962 / 1,170 | 752 / 966 / 763 |
| #314: bulk copy of the flow's records, per unchanged flow per compile | 4,979 / 5,428 / 5,751 (min / median / max) | |

| Fixture, `MAIN`: 16,052 records, 770 statements in 4 sequences | Insert | Replace |
| --- | --- | --- |
| Copy on write, 407 entries | 2,400 / 2,909 / 1,968 | 1,159 / 964 / 782 |
| Copy on write, 770 entries | 4,198 / 4,320 / 3,565 | 1,914 / 1,709 / 1,405 |
| Copy on write, 16,052 entries | 245,303 / 268,266 / 261,247 | 34,705 / 48,837 / 29,550 |
| Persistent 32-wide tree, 407 entries | 1,507 / 1,621 / 1,148 | 838 / 566 / 731 |
| Persistent 32-wide tree, 16,052 entries | 1,895 / 2,402 / 1,056 | 1,069 / 1,205 / 874 |
| #314: bulk copy of the flow's records | 5,934 / 6,396 / 9,090 (min / median / max) | |

This answers the ticket's second uncertainty. An order structure with stable chunk ids is cheaper than #314's per-flow splice at the size of a real scene: it pays 1 to 7 microseconds for the one sequence an edit touched and nothing for any other flow, where #314 copies every unchanged flow (5 to 6 microseconds each) and writes the edited flow again record by record, which #664 priced at 1 to 9 ms for a flow of this size.

### A restorable save and restore per look-ahead

`--mode lookahead` replays the route to the line on the shipped engine and times a pair of `StateSnapshot` and `RestoreStateSnapshot` at the end of every line, with the route simulator detached so that its own snapshot is no part of the figure. Beside it, a save and a restore of state held as the prototype holds it and sized as the project's story is. The `write` rows assign one global between the two, and the restorable state also raises one count.

| Microseconds per pair | Engine | Engine, one write | Restorable | Restorable, one write |
| --- | --- | --- | --- | --- |
| Fixture: 755 lines; 405 globals, 6 counts, 1 temporary | 2.889 / 3.584 / 5.066 | 4.381 / 5.800 / 8.937 | 0.437 / 0.488 / 0.605 | 0.630 / 0.671 / 1.048 |
| Raffles and Bunny: 777 lines; 591 globals, 24 counts, 1 temporary | 2.553 / 3.245 / 3.748 | 4.360 / 5.487 / 7.262 | 0.496 / 0.534 / 0.801 | 0.640 / 0.721 / 0.887 |

The restorable figure copies the frame's temporaries whole at every save, which the design puts off until the first write. On this ticket's first uncertainty: once a new line is recognised before its argument runs, the look-ahead saves a handful of array entries and logs only what the logic between two beats wrote, which on a real route is nothing for nearly every beat.

## What is taken from inkcpp

Read at JBenda/inkcpp `master`, d38608dffe50de8b6c954419647a5185044fbeee.

| From | Taken | Not taken |
| --- | --- | --- |
| `shared/private/command.h` | A fixed-width instruction of command, flags and payload, with flags whose meaning belongs to the command (its choice, divert, container-marker and assignment flags) | The six-byte unaligned size, for two aligned 32-bit words. An opcode per operator (`ADD` to `LIST_INVERT`, dispatched as a range): operators stay `NativeFunctionCall` by name. The list commands |
| `shared/private/header.h` | A container table that lets a jump rebuild where it is (`container_data_t`: parent, flags, start and end offsets) | Its offset ranges and the offset-sorted `container_map_t` searched to find a position's container: containment here is the sequence's owner link. The hash-sorted `container_hash_t` and the 32-bit hashes it holds, whose comment records 164 entries under 128 hashes in one test story and a tie-break by offset because paths repeat: interned ids are exact. One file of aligned sections: no packed program is built |
| `inkcpp_compiler/binary_emitter.cpp` | A dense counter index that only tracked containers receive (`setContainerIndex`, `build_container_data`), extended here to every counted symbol | `write_path` and `process_paths`, which collect every path and write the target's absolute byte offset into the instruction when the compile ends: an incremental compiler needs chunk-relative offsets and symbols |
| `inkcpp/runner_impl.cpp` | `jump`, which clears the container stack, finds the destination's container and walks parents to rebuild the stack and record visits. `line_step`, which saves at a newline and restores, forgets or goes on by what the output did. The `CALL_EXTERNAL` rule that a function not marked look-ahead safe is not run during the look-ahead: it writes a marker that ends the line and runs after the restore. `save`, `restore` and `forget` fanned out over every piece of state | `START_CONTAINER_MARKER` and `END_CONTAINER_MARKER` as instructions on both sides of a container: a `Visit` at the counted position is enough when containment is structural. Its forget and save at every choice |
| `inkcpp/collections/restorable.h` | The save, restore and forget contract | The jump-pointer stack that keeps the saved region in place: at the end of a line the positional arrays hold a handful of entries and a copy measures at half a microsecond |
| `inkcpp/story_impl.cpp` | `find_migration_hash` and `new_runner_from_snapshot`: a snapshot records the container at the current position, a story that differs migrates to it, and the load fails when the position cannot be named | The hash as the name, for the interned qualified name with an exact match by fingerprint tried first |

The chunk discipline itself is Lezer's: a `TreeBuffer` stores positions relative to its own start and a `Tree` stores child offsets relative to its parent, so an unchanged subtree is reused without being rewritten.

## Where each slice builds

| Slice | Builds |
| --- | --- |
| #694 | the config fields, the fallback, the store, `LineStart`, the output and value instructions, `MakeTable`, `CallStd`, the save point, the `Story` surface a beat needs |
| #695 | `Native`, `GetVar`, `SetVar`, the jumps, scopes, `Leave`, blocks for `if` and loops, the declaration sequence |
| #696 | symbols and their definitions, `JumpSym`, `JumpVar`, `Call` and `TunnelReturn` for tunnels, `Thread`, `Visit` and the counts, `VisitIndex`, `ShuffleIndex`, the sequence table's flow entry rule |
| #697 | `Choice`, the `choose` chunk, anonymous count symbols, choices in a thread |
| #698 | `Sym` and symbol values, `Call`, `CallVar`, `CallValue`, `Return`, `Pack`, `Unpack`, `VarPtr`, function-body blocks, the builtin surface |
| #699 | the write barrier, images, checkpoints, the save format |
| #700 | line tables, `addressAt`, `locationOf`, the saved form, the planner and the readers on addresses |
| #701 | identity, reference tables, the incremental passes over them, reuse inside blocks |
| #702 | the frames view, `onExecute(address)`, breakpoints as address sets |
| #703 to #705 | parity and the default, the language server, the deletion |

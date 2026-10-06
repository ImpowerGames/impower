/**
 * What a parsed object's emit path writes through. Each class of the parsed
 * hierarchy that the binary program covers implements `EmitProgram` beside
 * `GenerateRuntimeObject`; the others inherit `ParsedObject.EmitProgram`,
 * which reports the construct the writer does not emit.
 *
 * The parsed hierarchy imports this module's types, and values from three
 * other modules of `src/program`: the instruction constants and the builtin
 * names, which import nothing, and `displayCallFlags`, which imports
 * `NumberExpression` and `ObjectExpression` back. That cycle is benign:
 * `displayCallFlags` reads the two classes only when a call is emitted, and
 * it loads the engine's `Container` first, as every entry to the engine does
 * (see `CompilationAnnotator`). The writer and the store stay out of the
 * hierarchy's import graph.
 */
export interface ProgramEmitter {
  /** Appends one instruction. */
  emit(op: number, arg?: number, aux?: number, flags?: number): void;
  /** Emits `obj`'s code, under a line table row of its own source range when
   *  it has one. */
  emitObject(obj: EmittedObject): void;
  /** Emits a list of a statement's objects in order, a loop's among them. */
  emitObjects(objects: readonly EmittedObject[]): void;
  /** Emits the content of a conditional's branch: a body the branch runs as
   *  a block of the statement, and its other objects as the statement's own
   *  code. */
  emitBranchBody(branch: object): void;
  /** Emits a function (a `FlowBase`) that runs where it is written: one
   *  written at the top level inside a block that the story leaves it in,
   *  whose container the current engine runs as content of the block. Its
   *  parameters are bound from the evaluation stack, the locals the lowering
   *  hoisted to the top of its body are declared, and its body runs as a
   *  block of the statement. */
  emitFunctionInPlace(fn: object): void;
  /** Emits a `choose` block (a `Weave` that is one) as one chunk: the code
   *  that raises its choices, the `Done` that ends their presentation, each
   *  choice's entry code with its body entered as a block, and its `then`
   *  clause (docs/engine/binary-program.md, section 4). */
  emitChoose(weave: object): void;
  /** Emits a `choose` block written in another block's preamble (a `Weave`
   *  that holds choices and is no block of its own) as part of that block's
   *  presentation, its choices continuing at its `then` clause when it has
   *  one. */
  emitPreambleChoose(weave: object): void;
  /** Emits a `break` or `continue` (`divert`, which `exit` names): a jump to
   *  the loop's exit or its next pass when the loop's body is the chunk's
   *  own code, and otherwise `Leave`, which leaves the blocks up to the
   *  loop's body. */
  emitLoopExit(divert: object, exit: "break" | "continue"): void;
  /** Emits a jump whose target is bound later with `bind`. */
  jump(op: number, flags?: number, aux?: number): ProgramLabel;
  /** Emits a jump to a label the caller already holds, bound or not: a
   *  loop's head, or the end a conditional's branches all jump to and the
   *  conditional binds after them. `jump` is the one that makes a new
   *  label. */
  jumpBack(op: number, label: ProgramLabel, flags?: number): void;
  /** Binds a label, and every jump to it, to the next instruction. */
  bind(label: ProgramLabel): void;
  /** The id of `text` in the program table. */
  string(text: string): number;
  /** The id of `value` in the program table. */
  number(value: number): number;
  /** The id of a variable's name as the chunk writes it. A name the compiler
   *  generated, which it numbers by its place in the document, gets a name of
   *  the chunk's own, so that the chunk's code does not depend on where its
   *  statement stands. */
  variable(name: string): number;
  /** Records a value the chunk's code depends on that a whole-program pass
   *  of the compiler rewrites in the parsed hierarchy in place, such as a
   *  continuation's canonical group name. A chunk is reused only while every
   *  value it recorded reads the same. */
  recordRead(value: string): void;
  /** Records how a name the chunk reads resolved when the compile resolved
   *  its references (a variable, a count, a function, nothing), which
   *  another statement can change. A chunk is reused only while its
   *  statement's names resolve as they did. */
  recordResolution(value: string): void;
  /** Reads a fact about `symbol` from the symbol table of the program being
   *  built (`FACT_KIND`, what the program defines it as; `FACT_PARAMS`, the
   *  kind of each of a function's parameters), as the code about to be
   *  emitted depends on it. The read is recorded: the chunk's reference
   *  table keeps a hash of every fact its code read about each symbol, with
   *  the value read, and the chunk is reused only while the program it is
   *  reused in gives the same answers. A new dependency is a new read, and
   *  needs nothing added anywhere else (docs/engine/binary-program.md,
   *  section 1, Identity). */
  fact(symbol: number, name: string): string;
  /** Records that the chunk's code depends on what the program defines
   *  `symbol` as, or that it does not define it: a read of its
   *  `FACT_KIND`. */
  reference(symbol: number): void;
  /** Records that the chunk's code refers to `symbol` and depends on no fact
   *  about it: a jump, a count or a symbol value of a scene, a branch or a
   *  label, whose code is the same whatever the program defines the symbol
   *  as, or whether it defines it. */
  referenceTarget(symbol: number): void;
  /** The symbol of a function of the program (a `FlowBase`): its qualified
   *  name's for a function declared at the top level, and the anonymous one
   *  of the statement that writes it otherwise. A function the program does
   *  not define stops the statement's emission. */
  functionSymbol(fn: object): number;
  /** The symbol a divert, a count or a divert target names: the symbol of
   *  the scene, branch or label `target` is (`programSymbolName`), or for a
   *  target the compile found nothing for, the symbol of the name as
   *  `written`. A target that has no symbol stops the emission. */
  targetSymbol(target: object | null, written: string): number;
  /** The symbol of a `label` (a named `Gather`). */
  labelSymbol(gather: object): number;
  /** The anonymous symbol of an alternator (a `Sequence`) of the statement,
   *  which counts it and seeds its shuffle. */
  alternatorSymbol(sequence: object): number;
  /** Exports `symbol` at the next instruction: the chunk defines it
   *  there. */
  exportHere(symbol: number): void;
  /** Stops the statement's emission: the program falls back to the current
   *  engine as a whole and names `construct` (the parsed class's `typeName`,
   *  or the builtin's name). */
  unsupported(construct: string): never;
}

/** What `emitObject` emits: a parsed object. */
export interface EmittedObject {
  readonly ownDebugMetadata: unknown;
  EmitProgram(emitter: ProgramEmitter): void;
}

/** A position in the code of the chunk being emitted, which jumps target. */
export interface ProgramLabel {
  /** The offset it is bound to, or -1 while it is not bound. */
  offset: number;
}

/** Thrown by `ProgramEmitter.unsupported` and caught per statement. */
export class UnsupportedConstruct extends Error {
  constructor(public readonly construct: string) {
    super(`The binary program does not emit ${construct}`);
  }
}

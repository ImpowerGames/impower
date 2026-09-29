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
  /** Emits a jump whose target is bound later with `bind`. */
  jump(op: number, flags?: number, aux?: number): ProgramLabel;
  /** Emits a jump back to a label already bound. */
  jumpBack(op: number, label: ProgramLabel, flags?: number): void;
  /** A label bound to the next instruction. */
  here(): ProgramLabel;
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
  /** Gives the generated variable `name` the chunk-local name `local` (a
   *  loop's hidden temporaries). */
  aliasVariable(name: string, local: string): void;
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
  /** Records that the chunk's code depends on the facts about `symbol` (its
   *  kind, and whether the program defines it). The chunk's reference table
   *  keeps a hash of them, and the chunk is reused only while the program
   *  it is reused in gives the same facts. */
  reference(symbol: number): void;
  /** Emits `EnterBlock` for the body `body` of the statement, as block
   *  `flags` says (`BLOCK_LOOP` and the rest). Its resume offset is the next
   *  instruction until `blockResume` says otherwise. Returns the block's
   *  index. */
  enterBlock(body: object, flags?: number): number;
  /** Sets where the owner resumes when block `block`'s sequence runs out. */
  blockResume(block: number, label: ProgramLabel): void;
  /** Sets where a `break` inside loop body `block` resumes the owner. */
  blockBreak(block: number, label: ProgramLabel): void;
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

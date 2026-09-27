/**
 * What a parsed object's emit path writes through. Each class of the parsed
 * hierarchy that the binary program covers implements `EmitProgram` beside
 * `GenerateRuntimeObject`; the others inherit `ParsedObject.EmitProgram`,
 * which reports the construct the writer does not emit.
 *
 * Only types are imported by the parsed hierarchy, so this module and the
 * writer stay out of its import graph.
 */
export interface ProgramEmitter {
  /** Appends one instruction. */
  emit(op: number, arg?: number, aux?: number, flags?: number): void;
  /** The id of `text` in the program table. */
  string(text: string): number;
  /** The id of `value` in the program table. */
  number(value: number): number;
  /** Records a value the chunk's code depends on that a whole-program pass
   *  of the compiler rewrites in the parsed hierarchy in place, such as a
   *  continuation's canonical group name. A chunk is reused only while every
   *  value it recorded reads the same. */
  recordRead(value: string): void;
  /** Records that the chunk's code depends on the facts about `symbol` (its
   *  kind, and whether the program defines it). The chunk's reference table
   *  keeps a hash of them, and the chunk is reused only while the program
   *  it is reused in gives the same facts. */
  reference(symbol: number): void;
  /** Stops the statement's emission: the program falls back to the current
   *  engine as a whole and names `construct` (the parsed class's `typeName`,
   *  or the builtin's name). */
  unsupported(construct: string): never;
}

/** Thrown by `ProgramEmitter.unsupported` and caught per statement. */
export class UnsupportedConstruct extends Error {
  constructor(public readonly construct: string) {
    super(`The binary program does not emit ${construct}`);
  }
}

/**
 * The instruction set of the binary program (docs/engine/binary-program.md,
 * section 3), as far as the build-out has carried it.
 *
 * An instruction is two words of a statement chunk's code. Word 0 holds the
 * opcode in bits 0 to 7, flags whose meaning belongs to the opcode in bits 8
 * to 15, and an unsigned 16-bit operand `aux` in bits 16 to 31. Word 1 is a
 * signed 32-bit operand `arg`. An operand that does not fit its field is a
 * construct the writer does not emit, and the compile falls back.
 *
 * A jump's `arg` is a signed count of code words relative to the instruction
 * after the jump. A block is an index into the chunk's own block table.
 */
export const Op = {
  /** No effect when run. Its offset is the address a beat is known by. */
  LineStart: 1,
  /** Writes the string `arg` names to the output. */
  Text: 2,
  /** Writes a newline to the output under the newline rule. */
  Newline: 3,
  BeginTag: 4,
  EndTag: 5,
  /** Pushes the string `arg` names. */
  Str: 6,
  /** Pushes the integer `arg`. */
  Int: 7,
  /** Pushes the number `arg` names; the float flag keeps it a float. */
  Num: 8,
  /** Pushes nil, void, true or false, as `aux` says. */
  Const: 9,
  /** Pops `arg` key and value pairs and pushes the table they make. */
  MakeTable: 10,
  Pop: 11,
  /** Calls the state-aware builtin `arg` names with `aux` arguments. */
  CallStd: 12,
  /** Stops the flow with a safe exit. */
  Done: 13,
  /** Ends every flow. */
  End: 14,
  /** Pops a value and writes its text; Void writes nothing. */
  Out: 15,
  /** Opens a capture of the output. */
  BeginString: 16,
  /** Closes the capture and pushes the text it caught. */
  EndString: 17,
  /** Pops `aux` arguments and pushes the result of the native function or
   *  operator `arg` names. */
  Native: 18,
  /** `and` or `or`: keeps the top and jumps by `arg` when it decides the
   *  result, and pops it otherwise. The flag says which. */
  JumpIfKeep: 19,
  /** Pops a value and jumps by `arg` when it is false. */
  JumpIfFalse: 20,
  /** Jumps by `arg`. */
  Jump: 21,
  /** Pushes the variable `arg` names. */
  GetVar: 22,
  /** Pops a value into the variable `arg` names, as the flags say. */
  SetVar: 23,
  /** Pops a key and a base and pushes the member. */
  Index: 24,
  /** Pops a value, a key and a base and stores the member. */
  StoreIndex: 25,
  /** Pushes the top again. */
  Dup: 26,
  /** Pops `arg` values and pushes them as one multiple value, the last
   *  spread. */
  Pack: 27,
  /** Pops one value and pushes its first `arg` values, padded with nil, the
   *  first on top. */
  Unpack: 28,
  /** Opens a scope of temporaries on the frame. */
  BeginScope: 29,
  /** Closes the frame's innermost scope. */
  EndScope: 30,
  /** Enters the sequence of block `arg` of the chunk. */
  EnterBlock: 31,
  /** Leaves the blocks up to the nearest loop body, and resumes its owner at
   *  the block's break offset, or its resume offset with the continue flag. */
  Leave: 32,
  /** Pops a callable and `aux` arguments below it, and pushes what the call
   *  returns. */
  CallValue: 33,
  /** Pushes the function value of the symbol `arg` names. */
  Sym: 34,
  /** Pushes a pointer at the variable `arg` names, resolved against the
   *  current frame; a pointer at a variable a closure already captured is
   *  the one it captured. */
  VarPtr: 35,
  /** Calls the function the symbol `arg` names with the `aux` arguments on
   *  the stack, adjusted to its parameters, in a frame that returns after
   *  this instruction. */
  Call: 36,
  /** Calls what the variable `arg` names holds, with the `aux` arguments
   *  on the stack: a function value, a closure, a builtin, a builtin
   *  iterator or a table with `__call`, each taking them as its parameters
   *  do. */
  CallVar: 37,
  /** Pops the function frame, leaving the value on top as the result, and
   *  resumes the caller after its call. */
  Return: 38,
  /** Jumps to where the symbol `arg` names is defined, rebuilding the
   *  frame's block stack and scope depth for the target and counting the
   *  flows the jump enters (docs/engine/binary-program.md, section 5). */
  JumpSym: 39,
  /** As `JumpSym`, to the symbol value the variable `arg` names holds. */
  JumpVar: 40,
  /** Pops a symbol value or void and the tunnel frame, and resumes the
   *  caller after its tunnel call, or jumps to the symbol the value names. */
  TunnelReturn: 41,
  /** Forks the current thread: the fork runs on from the next instruction,
   *  and the original resumes `arg` words after the next instruction when the
   *  fork ends. */
  Thread: 42,
  /** Raises the visits of the symbol `arg` names and records the turn. */
  Visit: 43,
  /** Pushes the visits of the symbol `arg` names. */
  GetCount: 44,
  /** Pops a symbol value and pushes its visits, or with the turns flag the
   *  turns since its last visit. */
  CountOf: 45,
  /** Pushes the visits of the symbol `arg` names, less one. */
  VisitIndex: 46,
  /** Pops the element count and the sequence's index, and pushes the next
   *  shuffled index of the alternator the symbol `arg` names. */
  ShuffleIndex: 47,
  /** Writes a tag holding the string `arg` names to the output, which a
   *  capture's `EndString` moves out to the line's tags: the legacy tag an
   *  inline alternator's arm writes inside the string of its line. */
  Tag: 48,
} as const;

export type Opcode = (typeof Op)[keyof typeof Op];

/** The names of the opcodes, for a listing or an error. */
export const OP_NAMES: Readonly<Record<number, string>> = Object.fromEntries(
  Object.entries(Op).map(([name, code]) => [code, name]),
);

/** `Const`'s `aux`. */
export const ConstValue = {
  Nil: 0,
  Void: 1,
  True: 2,
  False: 3,
} as const;

/** `Num`'s flag: the number stays a float when it is whole. */
export const NUM_FLOAT = 1;

/** `CallStd`'s flags. */
export const CALL_DISCARD = 1;
/** The call writes no newline after its line (a `display` table marked
 *  `open`, `glue` or `caption`), so the statement after it continues its
 *  beat and carries no `LineStart` of its own. */
export const CALL_OPEN = 2;

/** `JumpIfKeep`'s flag: set for `or`, clear for `and`. */
export const KEEP_OR = 1;

/** `JumpIfFalse`'s flags. The condition is tested by Luau truthiness, where
 *  only nil and false are false, and otherwise as the current engine tests a
 *  conditional divert's condition. */
export const JUMP_LUAU = 1;
/** The jump is a decision the route planner can pause at and force, as a
 *  conditional divert is today. */
export const JUMP_DECISION = 2;

/** `SetVar`'s flags. */
export const SET_DECLARE = 1;
export const SET_GLOBAL = 2;
/** The variable is a variadic function's hidden `...` local, which keeps a
 *  multiple value whole. */
export const SET_VARARGS = 4;

/** `CallValue`'s `aux` when the call site does not say how many arguments it
 *  passed. */
export const CALL_ARGS_UNKNOWN = 0xffff;

/** `Leave`'s flag: resume the loop's owner where its next pass starts. */
export const LEAVE_CONTINUE = 1;

/** `Call`'s and `CallVar`'s flag: the call enters a tunnel, a flow that
 *  returns with `TunnelReturn`, rather than a function. */
export const CALL_TUNNEL = 1;

/** `CountOf`'s flag: push the turns since the last visit, or -1 for none,
 *  rather than the visits. */
export const COUNT_TURNS = 1;

export const AUX_MAX = 0xffff;

export const encodeWord0 = (op: number, flags: number, aux: number): number =>
  (op & 0xff) | ((flags & 0xff) << 8) | (aux << 16);

export const opOf = (word0: number): number => word0 & 0xff;

export const flagsOf = (word0: number): number => (word0 >>> 8) & 0xff;

export const auxOf = (word0: number): number => word0 >>> 16;

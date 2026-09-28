/**
 * The instruction set of the binary program (docs/engine/binary-program.md,
 * section 3), as far as the build-out has carried it.
 *
 * An instruction is two words of a statement chunk's code. Word 0 holds the
 * opcode in bits 0 to 7, flags whose meaning belongs to the opcode in bits 8
 * to 15, and an unsigned 16-bit operand `aux` in bits 16 to 31. Word 1 is a
 * signed 32-bit operand `arg`. An operand that does not fit its field is a
 * construct the writer does not emit, and the compile falls back.
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

export const AUX_MAX = 0xffff;

export const encodeWord0 = (op: number, flags: number, aux: number): number =>
  (op & 0xff) | ((flags & 0xff) << 8) | (aux << 16);

export const opOf = (word0: number): number => word0 & 0xff;

export const flagsOf = (word0: number): number => (word0 >>> 8) & 0xff;

export const auxOf = (word0: number): number => word0 >>> 16;

export const Op = {
  LineStart: 1,
  Text: 2,
  Newline: 3,
  BeginTag: 4,
  EndTag: 5,
  Str: 6,
  Int: 7,
  Num: 8,
  Const: 9,
  MakeTable: 10,
  Pop: 11,
  CallStd: 12,
  Done: 13,
  End: 14,
  Out: 15,
  BeginString: 16,
  EndString: 17,
  Native: 18,
  JumpIfKeep: 19,
  JumpIfFalse: 20,
  Jump: 21,
  GetVar: 22,
  SetVar: 23,
  Index: 24,
  StoreIndex: 25,
  Dup: 26,
  Pack: 27,
  Unpack: 28,
  BeginScope: 29,
  EndScope: 30,
  EnterBlock: 31,
  Leave: 32,
  CallValue: 33,
  Sym: 34,
  VarPtr: 35,
  Call: 36,
  CallVar: 37,
  Return: 38,
  JumpSym: 39,
  JumpVar: 40,
  TunnelReturn: 41,
  Thread: 42,
  Visit: 43,
  GetCount: 44,
  CountOf: 45,
  VisitIndex: 46,
  ShuffleIndex: 47,
  Tag: 48,
  Choice: 49,
  DeclareValue: 51,
} as const;

export type Opcode = (typeof Op)[keyof typeof Op];

export const OP_NAMES: Readonly<Record<number, string>> = Object.fromEntries(
  Object.entries(Op).map(([name, code]) => [code, name]),
);

export const ConstValue = {
  Nil: 0,
  Void: 1,
  True: 2,
  False: 3,
} as const;

export const NUM_FLOAT = 1;

export const CALL_DISCARD = 1;
export const CALL_OPEN = 2;

export const NATIVE_CALL_ARGS = 1;

export const KEEP_OR = 1;

export const JUMP_LUAU = 1;
export const JUMP_DECISION = 2;

export const ROOT_SLOT = 1;

export const ROOT_GLOBAL = 2;

export const SET_DECLARE = 1;
export const SET_GLOBAL = 2;
export const SET_VARARGS = 4;
export const SET_INITIALIZE = 8;
export const SET_ROOT_SLOTTED = 16;

export const CALL_ARGS_UNKNOWN = 0xffff;

export const CALL_METHOD = 1;

export const LEAVE_CONTINUE = 1;

export const CALL_TUNNEL = 1;

export const JUMP_ARGUMENTS = 2;

export const COUNT_TURNS = 1;

export const CHOICE_CONDITION = 1;
export const CHOICE_START = 2;
export const CHOICE_ONLY = 4;
export const CHOICE_INVISIBLE_DEFAULT = 8;
export const CHOICE_ONCE = 16;
export const CHOICE_DECISION = 32;

export const DONE_HOLD = 1;

export const AUX_MAX = 0xffff;

export const encodeWord0 = (op: number, flags: number, aux: number): number =>
  (op & 0xff) | ((flags & 0xff) << 8) | (aux << 16);

export const opOf = (word0: number): number => word0 & 0xff;

export const flagsOf = (word0: number): number => (word0 >>> 8) & 0xff;

export const auxOf = (word0: number): number => word0 >>> 16;

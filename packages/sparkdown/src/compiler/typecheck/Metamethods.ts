// The metamethod each overloadable operator invokes, ported from Luau's
// `Metamethods.h`; Luau is MIT-licensed (see `LICENSE-luau.txt`).

import { BinaryOp, UnaryOp } from "./Ast";

export const kBinaryOpMetamethods = new Map<BinaryOp, string>([
  [BinaryOp.CompareEq, "__eq"],
  [BinaryOp.CompareNe, "__eq"],
  [BinaryOp.CompareGe, "__lt"],
  [BinaryOp.CompareGt, "__le"],
  [BinaryOp.CompareLe, "__le"],
  [BinaryOp.CompareLt, "__lt"],
  [BinaryOp.Add, "__add"],
  [BinaryOp.Sub, "__sub"],
  [BinaryOp.Mul, "__mul"],
  [BinaryOp.Div, "__div"],
  [BinaryOp.FloorDiv, "__idiv"],
  [BinaryOp.Pow, "__pow"],
  [BinaryOp.Mod, "__mod"],
  [BinaryOp.Concat, "__concat"],
]);

export const kUnaryOpMetamethods = new Map<UnaryOp, string>([
  [UnaryOp.Minus, "__unm"],
  [UnaryOp.Len, "__len"],
]);

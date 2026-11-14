// Bounded observations used by Luau's built-in and non-strict tests at 7d5f733.
// These read checker objects; they do not convert printed types into identities.
import { type LuauTypeError, type TypeErrorData } from "../../compiler/typecheck/Error";
import type { Frontend } from "../../compiler/typecheck/Frontend";
import {
  follow,
  get,
  InternalCompilerError,
  type FunctionType,
  type TableState,
  type TypeId,
} from "../../compiler/typecheck/Type";

/** NonStrictTypeChecker.test.cpp:27–44 searches in order and matches only begin. */
export function firstErrorAtBegin(
  errors: readonly LuauTypeError[],
  begin: readonly [line: number, column: number],
): { index: number; error: LuauTypeError } {
  const index = errors.findIndex(
    (error) => error.location.begin.line === begin[0] && error.location.begin.column === begin[1],
  );
  if (index < 0) throw new Error(`Expected error at ${begin[0]}:${begin[1]}`);
  return { index, error: errors[index]! };
}

/** StructuralTypeEquality.cpp:165–199: follow BoundType; primitives compare their enum, not metatables or identity. */
function equalPrimitiveType(left: TypeId, right: TypeId): boolean {
  const l = follow(left), r = follow(right);
  if (l.ty.kind !== r.ty.kind) return false;
  const lp = get(l, "PrimitiveType"), rp = get(r, "PrimitiveType");
  if (!lp || !rp)
    throw new Error(`unsupported structural diagnostic type comparison: ${l.ty.kind}`);
  return lp.type === rp.type;
}

/**
 * Error.cpp:1122–1130, bounded to the primitive TypeMismatch comparisons in
 * TypeInfer.builtins.test.cpp:997–1029. Nested TypeMismatch and UnknownSymbol
 * data preserve their upstream comparators; other nested kinds fail explicitly.
 */
export function equalTypeMismatchData(left: TypeErrorData, right: TypeErrorData): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind !== "TypeMismatch" || right.kind !== "TypeMismatch")
    throw new Error(`expected TypeMismatch data, received ${left.kind}`);
  if (!!left.error !== !!right.error) return false;
  if (left.error && right.error) {
    // Error.cpp:1298–1301 deliberately does not compare moduleName.
    if (!left.error.location.equals(right.error.location)) return false;
    const l = left.error.data, r = right.error.data;
    if (l.kind !== r.kind) return false;
    if (l.kind === "TypeMismatch" && r.kind === "TypeMismatch") {
      if (!equalTypeMismatchData(l, r)) return false;
    } else if (l.kind === "UnknownSymbol" && r.kind === "UnknownSymbol") {
      // Error.cpp:1133–1136 compares name only, not context.
      if (l.name !== r.name) return false;
    } else throw new Error(`unsupported nested diagnostic comparison: ${l.kind}`);
  }
  return equalPrimitiveType(left.wantedType, right.wantedType)
    && equalPrimitiveType(left.givenType, right.givenType)
    && left.reason === right.reason
    && left.context === right.context;
}

export function tableState(type: TypeId): TableState {
  const table = get(follow(type), "TableType");
  if (!table) throw new Error("expected TableType");
  return table.state;
}

export interface CapturedFunctionLevel {
  /** The same FunctionType object upstream captures before checking. */
  readonly function: FunctionType;
  readonly before: { level: number; subLevel: number };
  current(): { level: number; subLevel: number };
}

/** TypeInfer.builtins.test.cpp:1406–1424 captures math.frexp before the check. */
export function captureGlobalFunctionLevel(
  frontend: Frontend,
  global: string,
  property: string,
): CapturedFunctionLevel {
  const type = frontend.globals.globalScope.lookup(global);
  if (!type) throw new Error(`missing global ${global}`);
  const table = get(follow(type), "TableType");
  if (!table) throw new Error(`global ${global} is not TableType`);
  const member = table.props.get(property)?.readTy;
  if (!member) throw new Error(`missing readable property ${global}.${property}`);
  const fn = get(follow(member), "FunctionType");
  if (!fn) throw new Error(`${global}.${property} is not FunctionType`);
  const current = () => ({ level: fn.level.level, subLevel: fn.level.subLevel });
  return { function: fn, before: current(), current };
}

export type CheckOutcome<T> =
  | { kind: "returned"; value: T }
  | { kind: "threw"; error: unknown; internalCompilerError: boolean };

/** Observe the actual thrown object. No diagnostic is promoted into an exception. */
export function observeCheck<T>(check: () => T): CheckOutcome<T> {
  try { return { kind: "returned", value: check() }; }
  catch (error) { return { kind: "threw", error, internalCompilerError: error instanceof InternalCompilerError }; }
}

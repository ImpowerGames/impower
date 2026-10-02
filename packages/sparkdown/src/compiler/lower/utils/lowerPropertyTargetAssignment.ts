import { BinaryExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/BinaryExpression";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { IndexExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/IndexExpression";
import { StringExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/StringExpression";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Text } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { StorePropertyAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/StorePropertyAssignment";
import { VariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { VariableReference } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableReference";
import {
  AstExpr,
  AstExprGlobal,
  AstExprIndexExpr,
  AstExprIndexName,
  AstExprLocal,
} from "../../typecheck/Ast";
import type { LowerContext } from "../context";
import {
  astIdentifier,
  lowerExpression,
  pathNames,
} from "../expression/lowerExpression";
import { syntheticId } from "./documentTag";
import type { LuauSource } from "./luauAst";

// Stores through a field or an index (`obj.field = value`, `t[k] += 1`,
// `o:get().a.x = value`), shared by assignments, multiple assignments and
// the `function a.f` statements.
//
// A target is decomposed into:
//   - `base`: a GET expression for the value the field is stored in, e.g.
//     `VariableReference([obj])` for `obj.field`, or
//     `IndexExpression(VariableReference([obj]), "a")` for `obj.a.b`;
//   - `key`: the final field as a `StringExpression` (for `.field`) or the
//     lowered key expression (for `[expr]`).

/**
 * The base and key of a target that stores through a field or an index, or
 * null for a target that is a name (or that lowers to nothing).
 */
export function storeTarget(
  target: AstExpr,
  source: LuauSource,
  ctx: LowerContext,
): { base: Expression; key: Expression } | null {
  if (target instanceof AstExprIndexName) {
    const base = lowerStoreBase(target.expr, source, ctx);
    return base
      ? { base, key: new StringExpression([new Text(target.index)]) }
      : null;
  }
  if (target instanceof AstExprIndexExpr) {
    const base = lowerStoreBase(target.expr, source, ctx);
    const key = lowerExpression(target.index, source, ctx);
    return base && key ? { base, key } : null;
  }
  return null;
}

/** The name a target assigns to when it is a name, positioned where it is written. */
export function targetIdentifier(
  target: AstExpr,
  ctx: LowerContext,
): Identifier | null {
  if (!(target instanceof AstExprGlobal || target instanceof AstExprLocal)) {
    return null;
  }
  return astIdentifier(pathNames(target)![0]!, ctx);
}

// The value a store's field is stored in. The root name is its variable,
// and every field or index after it reads a property off a *value*, so a
// dotted base (`opts.theme.x = v`) traverses values rather than reading the
// dotted path as one name, as a value elsewhere does (ink's hierarchical
// lookup). `self`, a stdlib namespace (`lang.current = "ar"` stores into the
// `lang` store) and `_G` (the globals-table proxy) are roots like any other
// name. Any other base (`f(x).y`, `(t).a`, `o:get().a`) is its value.
export function lowerStoreBase(
  expr: AstExpr,
  source: LuauSource,
  ctx: LowerContext,
): Expression | null {
  if (expr instanceof AstExprGlobal || expr instanceof AstExprLocal) {
    return new VariableReference([astIdentifier(pathNames(expr)![0]!, ctx)]);
  }
  if (expr instanceof AstExprIndexName && expr.op === ".") {
    const base = lowerStoreBase(expr.expr, source, ctx);
    return base
      ? new IndexExpression(base, new StringExpression([new Text(expr.index)]))
      : null;
  }
  if (expr instanceof AstExprIndexExpr) {
    const base = lowerStoreBase(expr.expr, source, ctx);
    const key = lowerExpression(expr.index, source, ctx);
    return base && key ? new IndexExpression(base, key) : null;
  }
  return lowerExpression(expr, source, ctx);
}

// The store `base[key] = value`, or for a compound operator (`+=`, `..=`,
// …) its read-modify-write, the base and the key stashed in temporaries
// named from the target's offset `from`, so each runs once. Shared by a
// path's store and a store through what a call returns
// (`o.get().a.x += 2`).
export function propertyStore(
  baseExpr: Expression,
  keyExpr: Expression,
  valueExpr: Expression,
  opText: string | null,
  from: number,
  ctx: LowerContext,
): ParsedObject[] {
  // Plain `=`: just one StorePropertyAssignment — no LHS reuse needed.
  if (!opText || opText === "=") {
    return [new StorePropertyAssignment(baseExpr, keyExpr, valueExpr)];
  }

  // Compound `+=` / `-=` / etc. Stash base+key into temp locals so each
  // side-effecting subexpression in the LHS runs exactly once. Names
  // include the source offset so multiple compound assignments in the
  // same function body don't collide. (Re-lowering the same node — e.g.
  // from incremental reparse — produces the same temp name, which is
  // a no-op on the second declaration.)
  const binOp = opText.slice(0, -1);
  const id = syntheticId(from, ctx);
  const baseTempName = `__pa_base_${id}`;
  const keyTempName = `__pa_key_${id}`;

  const baseTempDecl = new VariableAssignment({
    variableIdentifier: new Identifier(baseTempName),
    assignedExpression: baseExpr,
    isTemporaryNewDeclaration: true,
  });
  const keyTempDecl = new VariableAssignment({
    variableIdentifier: new Identifier(keyTempName),
    assignedExpression: keyExpr,
    isTemporaryNewDeclaration: true,
  });

  const refBaseForRead = new VariableReference([new Identifier(baseTempName)]);
  const refKeyForRead = new VariableReference([new Identifier(keyTempName)]);
  const readExpr = new IndexExpression(refBaseForRead, refKeyForRead);
  const computedValue = new BinaryExpression(readExpr, valueExpr, binOp);

  const refBaseForWrite = new VariableReference([new Identifier(baseTempName)]);
  const refKeyForWrite = new VariableReference([new Identifier(keyTempName)]);
  const store = new StorePropertyAssignment(
    refBaseForWrite,
    refKeyForWrite,
    computedValue,
  );

  return [baseTempDecl, keyTempDecl, store];
}

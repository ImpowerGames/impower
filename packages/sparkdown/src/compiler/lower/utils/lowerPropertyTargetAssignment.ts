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

export function targetIdentifier(
  target: AstExpr,
  ctx: LowerContext,
): Identifier | null {
  if (!(target instanceof AstExprGlobal || target instanceof AstExprLocal)) {
    return null;
  }
  return astIdentifier(pathNames(target)![0]!, ctx);
}

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

export function propertyStore(
  baseExpr: Expression,
  keyExpr: Expression,
  valueExpr: Expression,
  opText: string | null,
  from: number,
  ctx: LowerContext,
): ParsedObject[] {
  if (!opText || opText === "=") {
    return [new StorePropertyAssignment(baseExpr, keyExpr, valueExpr)];
  }

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
  store.writtenTarget = { base: baseExpr, key: keyExpr };

  return [baseTempDecl, keyTempDecl, store];
}

import { BinaryExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/BinaryExpression";
import { CallValueExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/CallValueExpression";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { FunctionCall } from "../../../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { MultiVariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/MultiVariableAssignment";
import { StorePropertyAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/StorePropertyAssignment";
import { VariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { VariableReference } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableReference";
import { type SyntaxNode } from "@lezer/common";
import {
  AstExpr,
  AstExprSparkdownConditionalAlternator,
  AstExprSparkdownSequentialAlternator,
  AstStatAssign,
  AstStatCompoundAssign,
  AstStatExpr,
  binaryOpToString,
} from "../../typecheck/Ast";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { LowerContext } from "../context";
import { recordRebind } from "../expression/bindings";
import {
  lowerCallArguments,
  lowerExpression,
} from "../expression/lowerExpression";
import { syntheticId } from "../utils/documentTag";
import {
  propertyStore,
  storeTarget,
  targetIdentifier,
} from "../utils/lowerPropertyTargetAssignment";
import { lowerAlternatorValue } from "../utils/alternatorValue";
import { offsetAt } from "../utils/luauAst";
import { publishesConst, reassignedConstName, reportReassignedConst } from "../utils/publishesConst";
import { wrapInWeave } from "../utils/wrapInWeave";
import type { StatementSite } from "./lowerLuauStatement";

export function lowerAssignment(
  stat: AstStatAssign,
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  const vars = stat.vars.map((target) => reassignedConst(target, site, ctx));
  if (vars.length === 1 && stat.values.length <= 1) {
    const value = stat.values[0];
    return lowerSingleAssignment(
      vars[0]!,
      value ? lowerExpression(value, site.source, ctx) : null,
      "=",
      site,
      ctx,
    );
  }
  return lowerMultipleAssignment(vars, stat.values, site, ctx);
}

function reassignedConst(target: AstExpr, site: StatementSite, ctx: LowerContext): AstExpr {
  reportReassignedConst(target, site.node, ctx);
  const local = reassignedConstName(target);
  return local && publishesConst(ctx) ? local : target;
}

export function lowerCompoundAssignment(
  stat: AstStatCompoundAssign,
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  return lowerSingleAssignment(
    reassignedConst(stat.variable, site, ctx),
    lowerExpression(stat.value, site.source, ctx),
    `${binaryOpToString(stat.op)}=`,
    site,
    ctx,
  );
}

export function lowerCallStatement(
  stat: AstStatExpr,
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  if (stat.expr instanceof AstExprSparkdownSequentialAlternator || stat.expr instanceof AstExprSparkdownConditionalAlternator) {
    const node = stat.expr.source.node as SyntaxNode | undefined;
    const alternator = node ? lowerAlternatorValue(node, ctx, true) : null;
    return alternator ? wrapInWeave([alternator]) : {};
  }
  const call = lowerExpression(stat.expr, site.source, ctx);
  if (call instanceof FunctionCall || call instanceof CallValueExpression) {
    call.shouldPopReturnedValue = true;
    return wrapInWeave([call]);
  }
  return {};
}

function lowerSingleAssignment(
  target: AstExpr,
  value: Expression | null,
  opText: string,
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  if (!value) return {};
  const store = storeTarget(target, site.source, ctx);
  if (store) {
    return wrapInWeave(
      propertyStore(
        store.base,
        store.key,
        value,
        opText,
        offsetAt(target.location.begin, ctx),
        ctx,
      ),
    );
  }
  const identifier = targetIdentifier(target, ctx);
  if (!identifier) return {};
  const variableName = identifier.name ?? "";

  recordRebind(variableName, ctx);

  const expr =
    opText === "="
      ? value
      : new BinaryExpression(
          new VariableReference([targetIdentifier(target, ctx)!]),
          value,
          opText.slice(0, -1),
        );
  return wrapInWeave([
    new VariableAssignment({
      variableIdentifier: identifier,
      assignedExpression: expr,
    }),
  ]);
}

function lowerMultipleAssignment(
  vars: readonly AstExpr[],
  values: readonly AstExpr[],
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  const expressions = lowerCallArguments(values, site.source, ctx);
  if (expressions.length === 0) return {};
  const names = vars.map((target) => targetIdentifier(target, ctx));
  if (names.every((name) => name !== null)) {
    return wrapInWeave([
      new MultiVariableAssignment(names as Identifier[], expressions, false),
    ]);
  }

  const id = syntheticId(offsetAt(vars[0]!.location.begin, ctx), ctx);
  const tempIdents = vars.map((_, i) => new Identifier(`__mt_${id}_${i}`));
  const tempDecl = new MultiVariableAssignment(tempIdents, expressions, true);

  const preStores: ParsedObject[] = [];
  const writes: ParsedObject[] = [];
  vars.forEach((target, i) => {
    const tempRef = new VariableReference([tempIdents[i]!]);
    const store = storeTarget(target, site.source, ctx);
    if (store) {
      const baseTemp = new Identifier(`__mt_base_${id}_${i}`);
      const keyTemp = new Identifier(`__mt_key_${id}_${i}`);
      preStores.push(
        new VariableAssignment({
          variableIdentifier: baseTemp,
          assignedExpression: store.base,
          isTemporaryNewDeclaration: true,
        }),
        new VariableAssignment({
          variableIdentifier: keyTemp,
          assignedExpression: store.key,
          isTemporaryNewDeclaration: true,
        }),
      );
      const write = new StorePropertyAssignment(
        new VariableReference([baseTemp]),
        new VariableReference([keyTemp]),
        tempRef,
      );
      write.writtenTarget = store;
      writes.push(write);
      return;
    }
    const name = names[i];
    if (name) {
      writes.push(
        new VariableAssignment({
          variableIdentifier: name,
          assignedExpression: tempRef,
          isTemporaryNewDeclaration: false,
        }),
      );
    }
  });
  return wrapInWeave([...preStores, tempDecl, ...writes]);
}

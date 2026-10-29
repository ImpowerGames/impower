import { nodeNameSet } from "../../utils/nodeNameSet";
import { type SyntaxNode } from "@lezer/common";
import { Argument } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Argument";
import { Function } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Flow/Function";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { Knot } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Knot";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { VariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { StorePropertyAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/StorePropertyAssignment";
import { StringExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/StringExpression";
import { Text } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { Weave } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Weave";
import { NullExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/NullExpression";
import {
  AstExprFunction,
  AstExprGlobal,
  AstExprIndexName,
  AstExprLocal,
  AstStatFunction,
  AstStatLocalFunction,
} from "../../typecheck/Ast";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { LowerContext } from "../context";
import { recordCaptureRead, recordRebind } from "../expression/bindings";
import { astIdentifier, pathNames } from "../expression/lowerExpression";
import {
  bodyReferencesNameAsCall,
  buildClosureExpression,
  buildFunction,
  freeVariables,
  functionArguments,
  lowerFunctionBody,
  parameterNames,
  rootCaptureSlots,
  type RootRead,
} from "../expression/lowerFunction";
import { lowerStoreBase } from "../utils/lowerPropertyTargetAssignment";
import { wrapInWeave } from "../utils/wrapInWeave";
import { reportReassignedConst } from "../utils/publishesConst";
import { syntheticId } from "../utils/documentTag";
import { statementNodeAt, type StatementSite } from "./lowerLuauStatement";

const FUNCTION_NODES = nodeNameSet(["LuauFunctionDefinition"]);

export function lowerLuauFunctionDefinition(
  stat: AstStatFunction | AstStatLocalFunction,
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  const node = statementNodeAt(stat, site, FUNCTION_NODES, ctx);
  if (!node) return {};
  const func = stat.func;
  if (stat instanceof AstStatFunction && stat.name instanceof AstExprIndexName) {
    return lowerPropertyTargetFunctionDefinition(stat.name, func, node, site, ctx);
  }
  const identifier =
    stat instanceof AstStatLocalFunction
      ? astIdentifier({ name: stat.name.name, location: stat.name.location }, ctx)
      : stat.name instanceof AstExprGlobal || stat.name instanceof AstExprLocal
        ? astIdentifier(pathNames(stat.name)![0]!, ctx)
        : null;
  if (stat instanceof AstStatFunction) reportReassignedConst(stat.name, site.node, ctx);
  if (!identifier) return {};

  const stack = ctx.functionScopeStack;
  const enclosingScope =
    stack && stack.length > 0 ? stack[stack.length - 1] : null;

  if (enclosingScope) {
    const isLocal = stat instanceof AstStatLocalFunction;
    return lowerNestedNamedFunction(func, node, identifier, ctx, enclosingScope, isLocal);
  }

  if (stat instanceof AstStatLocalFunction && ctx.hoistedKnots) {
    return lowerNestedNamedFunction(func, node, identifier, ctx, ctx.hoistedKnots, true);
  }

  const args = functionArguments(func);
  const { hoisted, body, nested, close } = lowerFunctionBody(func, node, ctx);
  const knot = new Knot(identifier, [], args, true);
  close(knot);
  knot._bodyClosed = !!node.getChild("LuauFunctionDefinition_end");
  const rootWeave = new Weave([...hoisted, ...body]);
  knot._rootWeave = rootWeave;
  knot.AddContent(rootWeave);
  for (const child of nested) {
    knot.AddContent(child);
    const childFlow = child as Function;
    if (childFlow.identifier?.name) {
      knot._subFlowsByName.set(childFlow.identifier.name, childFlow);
    }
  }
  return { content: [knot] };
}

function lowerNestedNamedFunction(
  func: AstExprFunction,
  node: SyntaxNode,
  identifier: Identifier,
  ctx: LowerContext,
  enclosingScope: ParsedObject[],
  isLocal: boolean,
): CompiledBlock {
  const synthName = `__anon_fn_${syntheticId(node.from, ctx)}`;
  const rootReads: RootRead[] = [];
  const upvals = freeVariables(parameterNames(func), func.body, ctx, { node, rootReads });

  const selfName = identifier.name ?? "";
  const isSelfReferential =
    !!selfName &&
    (upvals.includes(selfName) || bodyReferencesNameAsCall(func.body, selfName));
  if (isSelfReferential && !upvals.includes(selfName)) {
    upvals.push(selfName);
  }
  recordCaptureRead(ctx, upvals);

  if (!isLocal) recordRebind(selfName, ctx);

  const fn = buildFunction(func, node, synthName, ctx, upvals);
  fn._authoredName = selfName || null;
  enclosingScope.push(fn);

  const closureValue = buildClosureExpression(
    synthName,
    upvals,
    func.args.length,
    rootCaptureSlots(
      rootReads.filter(({ name }) => !isSelfReferential || name !== selfName),
      upvals,
      ctx,
    ),
  );

  if (!isLocal) {
    return wrapInWeave([
      new VariableAssignment({
        variableIdentifier: identifier,
        assignedExpression: closureValue,
        isTemporaryNewDeclaration: false,
      }),
    ]);
  }

  if (isSelfReferential) {
    const declareNil = new VariableAssignment({
      variableIdentifier: new Identifier(selfName),
      assignedExpression: new NullExpression(),
      isTemporaryNewDeclaration: true,
    });
    const assignClosure = new VariableAssignment({
      variableIdentifier: new Identifier(selfName),
      assignedExpression: closureValue,
      isTemporaryNewDeclaration: false,
      isDeclarationInitializer: true,
    });
    return wrapInWeave([declareNil, assignClosure]);
  }
  return wrapInWeave([
    new VariableAssignment({
      variableIdentifier: identifier,
      assignedExpression: closureValue,
      isTemporaryNewDeclaration: true,
    }),
  ]);
}

function lowerPropertyTargetFunctionDefinition(
  name: AstExprIndexName,
  func: AstExprFunction,
  node: SyntaxNode,
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  const isColonForm = name.op === ":";
  const baseExpr = lowerStoreBase(name.expr, site.source, ctx);
  if (!baseExpr) return {};
  const synthName = `__anon_fn_${syntheticId(node.from, ctx)}`;

  const rootReads: RootRead[] = [];
  const upvals = freeVariables(parameterNames(func), func.body, ctx, { node, rootReads }).filter(
    (n) => !(isColonForm && n === "self"),
  );
  recordCaptureRead(ctx, upvals);
  const leading = isColonForm
    ? [new Argument(new Identifier("self"), false, false)]
    : [];
  const stack = ctx.functionScopeStack;
  const enclosingScope =
    stack && stack.length > 0 ? stack[stack.length - 1] : null;
  if (!enclosingScope && !ctx.hoistedKnots) return {};
  const fn = buildFunction(func, node, synthName, ctx, upvals, leading);
  if (enclosingScope) {
    enclosingScope.push(fn);
  } else {
    ctx.hoistedKnots!.push(fn);
  }

  const userArity = (isColonForm ? 1 : 0) + func.args.length;
  const closureValue = buildClosureExpression(
    synthName,
    upvals,
    userArity,
    rootCaptureSlots(rootReads, upvals, ctx),
  );
  const keyExpr = new StringExpression([new Text(name.index)]);
  const definition = new StorePropertyAssignment(baseExpr, keyExpr, closureValue);
  definition.definesFunction = true;
  return wrapInWeave([definition]);
}

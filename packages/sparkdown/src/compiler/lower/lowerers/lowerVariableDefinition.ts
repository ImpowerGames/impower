import { ErrorType } from "../../../runtime/Error";
import { ConstantDeclaration } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Declaration/ConstantDeclaration";
import { MultiVariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/MultiVariableAssignment";
import { NullExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/NullExpression";
import { VariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import {
  AstExprCall,
  AstExprVarargs,
  AstStatLocal,
  AstStatSparkdownStore,
} from "../../typecheck/Ast";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { LowerContext } from "../context";
import {
  astIdentifier,
  lowerCallArguments,
  type PathName,
} from "../expression/lowerExpression";
import { offsetAt, rangeOf } from "../utils/luauAst";
import { rootDeclarationSlot } from "../utils/rootLocalReads";
import { publishesConst, reportMissingConstInitializer } from "../utils/publishesConst";
import { statementSource } from "../utils/statementSource";
import { validateDefineTypeShadow } from "../utils/validateDefineTypeShadow";
import { wrapInWeave } from "../utils/wrapInWeave";
import type { StatementSite } from "./lowerLuauStatement";

const MISSING_NAME = "%error-id%";

export function lowerVariableDefinition(
  stat: AstStatLocal | AstStatSparkdownStore,
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  const scope =
    stat instanceof AstStatSparkdownStore
      ? "store"
      : stat.isConst && publishesConst(ctx)
        ? "const"
        : "local";
  if (stat instanceof AstStatLocal) reportMissingConstInitializer(stat, site.node, ctx);
  const targets: PathName[] =
    stat instanceof AstStatLocal
      ? stat.vars.map((v) => ({ name: v.name, location: v.location }))
      : stat.vars.map((v) => ({ name: v.name, location: v.location }));
  if (targets.length === 0) return {};
  const hasEquals = stat.equalsSignLocation !== undefined;

  if (scope === "store" || scope === "const") {
    for (const t of targets) {
      validateDefineTypeShadow(t.name, rangeOf(t.location, ctx), ctx);
    }
  }

  if (scope !== "local" && ctx.siblingSubFlowNamesStack) {
    for (const t of targets) {
      for (const frame of ctx.siblingSubFlowNamesStack) {
        frame.delete(t.name);
      }
    }
  }

  const expressions = lowerCallArguments(stat.values, site.source, ctx);
  const targetIdentifiers = targets.map((t) => astIdentifier(t, ctx));
  const lastIdentifier = targetIdentifiers[targetIdentifiers.length - 1]!;

  if (scope === "const") {
    const range = rangeOf(stat.location, ctx);
    if (targets.length > 1 || expressions.length > 1) {
      ctx.diagnostics?.push({
        message: "A `const` takes one name and one value",
        severity: ErrorType.Error,
        source: statementSource(range, ctx),
      });
    } else if (expressions.length === 0 && !hasEquals) {
      ctx.diagnostics?.push({
        message: "Missing initializer in const declaration",
        severity: ErrorType.Error,
        source: statementSource(range, ctx),
      });
    }
    if (targets.length !== 1 || expressions.length !== 1) return {};
    return wrapInWeave([
      new ConstantDeclaration(lastIdentifier, expressions[0]!),
    ]);
  }

  if (targets.length > 1) {
    const last = stat.values[stat.values.length - 1];
    if (
      scope === "store" &&
      stat.values.length < targets.length &&
      last instanceof AstExprVarargs
    ) {
      ctx.diagnostics?.push({
        message:
          "A `store` is set when the story starts, outside any function, where `...` has no values: give each name its own value, or call a function that returns them",
        severity: ErrorType.Error,
        source: statementSource(rangeOf(stat.location, ctx), ctx),
      });
    }
    if (scope === "local") {
      const multiExprs =
        expressions.length === 0 ? [new NullExpression()] : expressions;
      const multi = new MultiVariableAssignment(targetIdentifiers, multiExprs, true);
      markRootDeclarations(multi.targetAssignments, targets, ctx);
      return wrapInWeave([multi]);
    }
    const assignments = targetIdentifiers.map(
      (identifier, i) =>
        new VariableAssignment({
          variableIdentifier: identifier,
          assignedExpression: expressions[i] ?? new NullExpression(),
          isGlobalDeclaration: true,
        }),
    );
    if (
      stat.values.length < targets.length &&
      last instanceof AstExprCall &&
      expressions.length === stat.values.length
    ) {
      assignments[stat.values.length - 1]!.spreadTo = assignments.slice(
        stat.values.length,
      );
    }
    for (const assignment of assignments) {
      assignment.statementGlobals = assignments;
    }
    assignments[assignments.length - 1]!.Discard(
      expressions.slice(targets.length),
    );
    const declared = assignments.filter((_, i) => targets[i]!.name !== MISSING_NAME);
    const declaredSet = new Set(declared);
    for (const assignment of declared) {
      assignment.spreadTo = assignment.spreadTo.filter((a) => declaredSet.has(a));
    }
    return wrapInWeave(declared);
  }

  if (scope === "local" && expressions.length > 1) {
    const multi = new MultiVariableAssignment([lastIdentifier], expressions, true);
    markRootDeclarations(multi.targetAssignments, [targets[targets.length - 1]!], ctx);
    return wrapInWeave([multi]);
  }
  const isTemp = scope === "local";
  const va = new VariableAssignment({
    variableIdentifier: lastIdentifier,
    assignedExpression: expressions[0] ?? new NullExpression(),
    isGlobalDeclaration: scope === "store",
    isTemporaryNewDeclaration: isTemp,
  });
  if (scope === "store") va.Discard(expressions.slice(1));
  if (isTemp) markRootDeclarations([va], [targets[targets.length - 1]!], ctx);
  return wrapInWeave([va]);
}

function markRootDeclarations(
  assignments: readonly VariableAssignment[],
  targets: readonly PathName[],
  ctx: LowerContext,
): void {
  assignments.forEach((assignment, i) => {
    const target = targets[i];
    if (!target || !assignment.isNewTemporaryDeclaration) return;
    assignment.rootSlot = rootDeclarationSlot(target.name, offsetAt(target.location.begin, ctx), ctx);
  });
}

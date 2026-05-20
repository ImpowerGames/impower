import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ConstantDeclaration } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Declaration/ConstantDeclaration";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { MultiVariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/MultiVariableAssignment";
import { NullExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/NullExpression";
import { VariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import {
  lowerExpressionFromContainer,
  lowerExpressionFromNodes,
} from "../expression/lowerExpression";
import { wrapInWeave } from "../utils/wrapInWeave";

export function lowerVariableDefinition(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const scopeNode = getDescendent("LuauScopeModifier", nodeRef.node);
  const scope = scopeNode ? ctx.read(scopeNode.from, scopeNode.to).trim() : "";

  // Walk `LuauVariableDefinition_content`. After the multi-RHS grammar
  // fix, the content holds:
  //   VA(name1) [, name1's-AssignmentOperation? ...]
  //   LuauCommaSeparator
  //   VA(name2) [...]
  //   LuauCommaSeparator
  //   <RHS expression>   ← extra trailing RHS values (multi-RHS case)
  //   LuauCommaSeparator
  //   <RHS expression>
  //
  // Only the LAST VA can carry a `LuauAssignmentOperation` (since
  // earlier VAs are pure targets). Any expression nodes after the
  // last VA are additional RHS values.
  const contentNode = findChildByName(
    nodeRef.node,
    "LuauVariableDefinition_content",
  );
  const targets: { name: string; assignNode: SyntaxNode }[] = [];
  const trailingRhsGroups: SyntaxNode[][] = [];
  let sawAssignmentOp = false;
  let currentRhsGroup: SyntaxNode[] = [];

  if (contentNode) {
    let child = contentNode.firstChild;
    while (child) {
      if (isSkippableName(child.name)) {
        child = child.nextSibling;
        continue;
      }
      if (child.name === "LuauVariableAssignment") {
        // Flush any in-progress RHS group before starting a new
        // target. (Shouldn't happen with current grammar — VAs
        // always come before any standalone RHS exprs — but handle
        // it defensively.)
        if (currentRhsGroup.length > 0) {
          trailingRhsGroups.push(currentRhsGroup);
          currentRhsGroup = [];
        }
        const nameNode = getDescendent("LuauVariableName", child);
        if (nameNode) {
          targets.push({
            name: ctx.read(nameNode.from, nameNode.to),
            assignNode: child,
          });
        }
        const opNode = getDescendent("LuauAssignmentOperation", child);
        if (opNode) sawAssignmentOp = true;
        child = child.nextSibling;
        continue;
      }
      if (child.name === "LuauCommaSeparator") {
        if (currentRhsGroup.length > 0) {
          trailingRhsGroups.push(currentRhsGroup);
          currentRhsGroup = [];
        }
        child = child.nextSibling;
        continue;
      }
      // Any other node at the def-content level is a trailing
      // RHS expression (LuauNumericDecimal, LuauAccessPath,
      // LuauTable, LuauParenthetical, etc.).
      currentRhsGroup.push(child);
      child = child.nextSibling;
    }
    if (currentRhsGroup.length > 0) {
      trailingRhsGroups.push(currentRhsGroup);
    }
  }

  if (targets.length === 0) {
    // Fallback for an unrecognized shape — bail without emitting.
    return {};
  }

  // The LAST target's `LuauAssignmentOperation` carries the first
  // RHS value. Subsequent RHS values are at the def-content level.
  const lastTarget = targets[targets.length - 1]!;
  const firstRhsOp = getDescendent(
    "LuauAssignmentOperation",
    lastTarget.assignNode,
  );
  const firstRhs = firstRhsOp
    ? lowerExpressionFromContainer(firstRhsOp, ctx)
    : null;
  const trailingExprs = trailingRhsGroups
    .map((nodes) => lowerExpressionFromNodes(nodes, ctx))
    .filter((e): e is NonNullable<typeof e> => e != null);
  const expressions = firstRhs ? [firstRhs, ...trailingExprs] : trailingExprs;

  // `const x = expr` — must be single-target, single-RHS. Reject
  // multi-target const and multi-RHS const (Luau doesn't support
  // either form for `const`).
  if (scope === "const") {
    if (targets.length !== 1 || expressions.length !== 1) return {};
    return wrapInWeave([
      new ConstantDeclaration(new Identifier(lastTarget.name), expressions[0]!),
    ]);
  }

  // Multi-target. Two paths:
  //
  //   `local a, b = …`  → route through `MultiVariableAssignment` so
  //   the runtime gets a proper `PackTuple` + `UnpackTuple` sequence —
  //   handles both multi-RHS positional and single-RHS multi-return.
  //
  //   `store a, b = …`  → synthesize one `VariableAssignment` per
  //   target with the positionally-corresponding expression (missing
  //   slots get no expression, which defaults to 0 at story init).
  //   Globals don't emit procedural runtime objects — they register
  //   at the story level and the story evaluates each expression at
  //   init time, so the `MultiVariableAssignment` Pack/Unpack flow
  //   doesn't apply. Single-RHS multi-return into multi-target globals
  //   (`store a, b = f()`) takes only f()'s first value — to fully
  //   unpack, authors should use a local intermediate.
  //
  //   `const a, b = …` is rejected — `const` requires single-target.
  if (targets.length > 1) {
    if (scope === "local") {
      const targetIdents = targets.map((t) => new Identifier(t.name));
      return wrapInWeave([
        new MultiVariableAssignment(targetIdents, expressions, true),
      ]);
    }
    if (scope === "store") {
      const vas = targets.map((t, i) => {
        const e = expressions[i] ?? null;
        return new VariableAssignment({
          variableIdentifier: new Identifier(t.name),
          assignedExpression: e ?? undefined,
          isGlobalDeclaration: true,
        });
      });
      return wrapInWeave(vas);
    }
    // `const a, b = …` — not supported.
    return {};
  }

  // Single target. If there are multiple RHS expressions (`local x = a, b`),
  // Lua truncates to the first value — but with `MultiValue` spread
  // semantics, the LAST expression spreads if it's multi-return.
  // For now we just take the first expression (matches Lua's
  // single-target truncation) since single-target rarely uses
  // multi-RHS in practice.
  //
  // Bare declaration (`local x` with no `= …`) is also handled here:
  // we synthesize a `NullExpression` so the runtime gets a `NullValue`
  // pushed before the `RuntimeVariableAssignment`. Without the
  // synthetic init, the binding bytecode would pop whatever junk
  // happened to be on the eval stack.
  const identifier = new Identifier(lastTarget.name);
  const expr = expressions[0] ?? (sawAssignmentOp ? null : new NullExpression());

  const isGlobal = scope === "store";
  const isTemp = scope === "local";

  const va = new VariableAssignment({
    variableIdentifier: identifier,
    assignedExpression: expr ?? undefined,
    isGlobalDeclaration: isGlobal,
    isTemporaryNewDeclaration: isTemp,
  });

  return wrapInWeave([va]);
}

function findChildByName(parent: SyntaxNode, name: string): SyntaxNode | null {
  let child = parent.firstChild;
  while (child) {
    if (child.name === name) return child;
    child = child.nextSibling;
  }
  return null;
}

function isSkippableName(name: string): boolean {
  return (
    name === "ExtraWhitespace" ||
    name === "Whitespace" ||
    name === "Newline" ||
    name === "LuauComment" ||
    name === "OptionalWhitespace" ||
    name === "RequiredWhitespace" ||
    name === "LuauVariableDefinition_begin" ||
    name === "LuauVariableDefinition_end"
  );
}

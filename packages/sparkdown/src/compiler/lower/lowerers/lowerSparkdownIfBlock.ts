import { type SyntaxNode } from "@lezer/common";
import { Conditional } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/Conditional";
import { ConditionalSingleBranch } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/ConditionalSingleBranch";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { lowerExpressionFromContainer } from "../expression/lowerExpression";
import { lowerStatements } from "../lower";
import { findChildByName } from "../utils/alternatorArms";
import { wrapInScope } from "../utils/wrapInScope";
import { wrapInWeave } from "../utils/wrapInWeave";

// Shared core for both `LuauSparkdownIfBlock` (allows display statements in
// arms) and `LuauIfBlock` (pure-luau, function-body context). The two variants
// differ only in node names; the structural shape and lowering pattern are
// identical.

export interface IfBlockVariant {
  /** Top-level if-block node name, e.g. "LuauSparkdownIfBlock" or "LuauIfBlock". */
  prefix: string;
}

export function lowerSparkdownIfBlock(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  return lowerIfBlock(nodeRef, ctx, { prefix: "LuauSparkdownIfBlock" });
}

export function lowerLuauIfBlock(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  return lowerIfBlock(nodeRef, ctx, { prefix: "LuauIfBlock" });
}

function lowerIfBlock(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
  variant: IfBlockVariant,
): CompiledBlock {
  const elseifNodeName = variant.prefix.replace("IfBlock", "ElseifBlock");
  const elseNodeName = variant.prefix.replace("IfBlock", "ElseBlock");

  const content = findChildByName(nodeRef.node, `${variant.prefix}_content`);
  const ifBodySkip = new Set<string>([
    "LuauIfBlockCondition",
    elseifNodeName,
    elseNodeName,
  ]);

  const branches: ConditionalSingleBranch[] = [];

  // ----- Main `if` branch -----
  const condNode = content
    ? findChildByName(content, "LuauIfBlockCondition")
    : null;
  const condExpr = condNode ? lowerExpressionFromContainer(condNode, ctx) : null;
  // Each branch body gets its own scope frame so `local x` follows
  // Luau's block-scoping rules — an `if`-arm's `local` doesn't leak to
  // the `else`-arm and vice versa, and neither leaks to the enclosing
  // function. The runtime pushes / pops a frame on the call-stack
  // element when it sees the BeginScope / EndScope markers.
  const mainBody = wrapInScope(lowerStatements(content, ctx, ifBodySkip));
  branches.push(buildBranch(condExpr, mainBody, false));

  // ----- Any `elseif` branches -----
  for (const elseifNode of findDirectChildren(content, elseifNodeName)) {
    const elseifContent = findChildByName(
      elseifNode,
      `${elseifNodeName}_content`,
    );
    const ec = elseifContent
      ? findChildByName(elseifContent, "LuauElseifBlockCondition")
      : null;
    const ecExpr = ec ? lowerExpressionFromContainer(ec, ctx) : null;
    const body = wrapInScope(
      lowerStatements(elseifContent, ctx, ELSEIF_BODY_SKIP),
    );
    branches.push(buildBranch(ecExpr, body, false));
  }

  // ----- Optional `else` branch -----
  const elseNode = content
    ? findChildByName(content, elseNodeName)
    : null;
  if (elseNode) {
    const elseContent = findChildByName(elseNode, `${elseNodeName}_content`);
    const body = wrapInScope(lowerStatements(elseContent, ctx));
    branches.push(buildBranch(null, body, true));
  }

  const conditional = new Conditional(
    null as unknown as Expression,
    branches,
  );
  return wrapInWeave([conditional]);
}

const ELSEIF_BODY_SKIP = new Set<string>(["LuauElseifBlockCondition"]);

function buildBranch(
  condition: Expression | null,
  body: ParsedObject[],
  isElse: boolean,
): ConditionalSingleBranch {
  const branch = new ConditionalSingleBranch(body.length > 0 ? body : null);
  if (condition) {
    branch.ownExpression = condition;
  }
  branch.isElse = isElse;
  return branch;
}

function findDirectChildren(
  parent: SyntaxNode | null,
  name: string,
): SyntaxNode[] {
  const result: SyntaxNode[] = [];
  if (!parent) return result;
  let child = parent.firstChild;
  while (child) {
    if (child.name === name) result.push(child);
    child = child.nextSibling;
  }
  return result;
}

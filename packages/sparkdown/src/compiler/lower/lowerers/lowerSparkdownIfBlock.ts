import { type SparkdownNodeName } from "../../types/SparkdownNodeName";
import { nodeNameSet } from "../../utils/nodeNameSet";
import { type SyntaxNode } from "@lezer/common";
import { Conditional } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/Conditional";
import { ConditionalSingleBranch } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/ConditionalSingleBranch";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { UnaryExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/UnaryExpression";
import { NativeFunctionCall } from "../../../inkjs/engine/NativeFunctionCall";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";
import { lowerExpressionFromContainer } from "../expression/lowerExpression";
import { lowerStatements } from "../lower";
import { findChildByName } from "../utils/alternatorArms";
import { headerLineRange, stampDebugMetadata } from "../utils/debugMetadata";
import {
  bodyOfBlock,
  openBody,
  type BodyShape,
} from "../utils/statementShape";
import { wrapInScope } from "../utils/wrapInScope";
import { wrapInWeave } from "../utils/wrapInWeave";

// Shared core for both `LuauSparkdownIfBlock` (allows display statements in
// arms) and `LuauIfBlock` (pure-luau, function-body context). The two variants
// differ only in node names; the structural shape and lowering pattern are
// identical.

export interface IfBlockVariant {
  /** Top-level if-block node name, e.g. "LuauSparkdownIfBlock" or "LuauIfBlock". */
  prefix: SparkdownNodeName;
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
  // Two of the members are computed from the variant, so this set cannot be
  // declared with the union; the check script covers the literal.
  const ifBodySkip = new Set<string>([
    "LuauIfBlockCondition",
    elseifNodeName,
    elseNodeName,
  ]);

  const branches: ConditionalSingleBranch[] = [];

  // The parts of the statement in order, which head its bodies: the `if`
  // condition, each `elseif`, the `else`, and then `end`, where the content
  // node ends. A body runs from the part that heads it to the next part.
  const elseifNodes = findDirectChildren(content, elseifNodeName);
  const elseNode = content
    ? findChildByName(content, elseNodeName)
    : null;
  const endStart = content?.to ?? nodeRef.node.to;
  const partStarts = [
    ...elseifNodes.map((node) => node.from),
    ...(elseNode ? [elseNode.from] : []),
    endStart,
  ];

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
  // `ctx.scopeDepth` is bumped around each arm's body lowering so a
  // `break`/`continue` inside the arm knows it must emit an EndScope
  // for this frame before diverting out of the enclosing loop.
  const mainShape = openBody(
    ctx,
    condNode?.to ?? content?.from ?? nodeRef.node.from,
    partStarts[0]!,
  );
  ctx.scopeDepth = (ctx.scopeDepth ?? 0) + 1;
  const mainBody = wrapInScope(
    lowerStatements(content, ctx, ifBodySkip, mainShape),
  );
  ctx.scopeDepth--;
  branches.push(buildBranch(condExpr, mainBody, false, mainShape));

  // ----- Any `elseif` branches -----
  elseifNodes.forEach((elseifNode, i) => {
    const elseifContent = findChildByName(
      elseifNode,
      `${elseifNodeName}_content`,
    );
    const ec = elseifContent
      ? findChildByName(elseifContent, "LuauElseifBlockCondition")
      : null;
    const ecExpr = ec ? lowerExpressionFromContainer(ec, ctx) : null;
    // `lower()` gives the whole statement the `if` header's position, so the
    // condition carries its own `elseif` line: a diagnostic about it, such as
    // an unknown name, is then reported where it is written.
    if (ecExpr) {
      const header = headerLineRange(elseifNode.from, elseifNode.to, ctx);
      stampDebugMetadata([ecExpr], header.from, header.to, ctx);
    }
    const shape = openBody(
      ctx,
      ec?.to ?? elseifContent?.from ?? elseifNode.from,
      partStarts[i + 1]!,
    );
    ctx.scopeDepth = (ctx.scopeDepth ?? 0) + 1;
    const body = wrapInScope(
      lowerStatements(elseifContent, ctx, ELSEIF_BODY_SKIP, shape),
    );
    ctx.scopeDepth--;
    branches.push(buildBranch(ecExpr, body, false, shape));
  });

  // ----- Optional `else` branch -----
  if (elseNode) {
    const elseContent = findChildByName(elseNode, `${elseNodeName}_content`);
    const shape = openBody(
      ctx,
      elseContent?.from ?? elseNode.to,
      endStart,
    );
    ctx.scopeDepth = (ctx.scopeDepth ?? 0) + 1;
    const body = wrapInScope(lowerStatements(elseContent, ctx, undefined, shape));
    ctx.scopeDepth--;
    branches.push(buildBranch(null, body, true, shape));
  }

  const conditional = new Conditional(
    null as unknown as Expression,
    branches,
  );
  return wrapInWeave([conditional]);
}

const ELSEIF_BODY_SKIP = nodeNameSet(["LuauElseifBlockCondition"]);

function buildBranch(
  condition: Expression | null,
  body: ParsedObject[],
  isElse: boolean,
  shape: BodyShape | undefined,
): ConditionalSingleBranch {
  const branch = new ConditionalSingleBranch(body.length > 0 ? body : null);
  if (shape) {
    bodyOfBlock.set(branch, shape);
  }
  if (condition) {
    // Normalize the condition to a real boolean under LUA truthiness
    // (only nil and false are falsy — `if 0 then` / `if "" then` /
    // `if {} then` all take the then-branch, basic.luau line 86). The
    // runtime branch test (`Story.IsTruthy` on the conditional divert)
    // keeps ink truthiness for narrative constructs, so Luau `if`
    // conditions must arrive as a BoolValue. The `TRUTHY` native op
    // pops the value and pushes `BoolValue(isLuauTruthy(v))`.
    branch.ownExpression = new UnaryExpression(
      condition,
      NativeFunctionCall.LuauTruthy,
    );
  }
  branch.isElse = isElse;
  // Every display line closes its own line, so a branch needs no newline of
  // its own to start one. A newline there would end the line a trailing `..`
  // holds open before the branch (`You see a ..` then `if`).
  branch.isInline = true;
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

import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { BinaryExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/BinaryExpression";
import { Conditional } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/Conditional";
import { ConditionalSingleBranch } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/ConditionalSingleBranch";
import { Divert } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { FunctionCall } from "../../../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { Gather } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Gather/Gather";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { MultiVariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/MultiVariableAssignment";
import { NumberExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/NumberExpression";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { VariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { VariableReference } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableReference";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { lowerExpressionFromNodes } from "../expression/lowerExpression";
import { lowerStatements } from "../lower";
import { findChildByName } from "../utils/alternatorArms";
import { wrapInScope } from "../utils/wrapInScope";
import { wrapInWeave } from "../utils/wrapInWeave";

// `for v1, v2, ... in iter_expr do BODY end` — Luau's generic-for.
//
// Lua's iterator protocol (Luau follows the same):
//   1. Evaluate `iter_expr` to (f, s, var).
//   2. Each iteration:
//        (v1, v2, ..., vn) = f(s, var)
//        if v1 == nil then break end
//        var = v1
//        BODY (with v1..vn in scope)
//
// A user-defined iterator may return ALL THREE values (`f, s, var`)
// or just ONE (`f`, a stateful closure). In the closure case `s` and
// `var` are nil and the closure ignores its args, using its captured
// state.
//
// Compiled shape:
//   BeginScope
//     local __iter_<off>, __state_<off>, __ctrl_<off> = <iter_expr>
//     - (__forIn_<off>_loop)
//       local v1, v2, ..., vn = __iter_<off>(__state_<off>, __ctrl_<off>)
//       { v1 == nil:
//         -> __forIn_<off>_break
//       }
//       __ctrl_<off> = v1
//       BODY (continue → -> __forIn_<off>_loop, break → -> __forIn_<off>_break)
//       -> __forIn_<off>_loop
//     - (__forIn_<off>_break)
//   EndScope
//
// Limitations matching numeric/repeat:
//   - The loop variables (v1..vn) share their slots across iterations
//     instead of getting a fresh binding per iteration. Most user code
//     never observes this; closures captured inside the body that
//     depend on per-iteration slots would see all closures pointing
//     at the SAME slot (Luau gives each a fresh slot). Acceptable for
//     v1 of the iterator protocol.

const FOR_IN_BODY_SKIP: ReadonlySet<string> = new Set([
  "LuauForCondition",
  "LuauForKeyword",
  "LuauDoKeyword",
  "LuauComment",
]);

export function lowerLuauGenericForLoop(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const condNode = getDescendent("LuauForCondition", nodeRef.node);
  const doBlock = getDescendent("LuauDoBlock", nodeRef.node);
  const bodyContent = doBlock
    ? findChildByName(doBlock, "LuauDoBlock_content")
    : null;
  if (!condNode || !bodyContent) return {};

  const condContent =
    findChildByName(condNode, "LuauForCondition_content") ?? condNode;

  // Walk LuauForCondition_content children: collect loop-variable
  // access paths (before `in`), then iter-expression nodes (after
  // `in`). Both halves are comma-separated, but the for-condition
  // grammar drops commas implicitly between sibling expression
  // nodes (no separator emitted between consecutive identifiers).
  // We split on the `LuauInKeyword` boundary.
  const loopVarNodes: SyntaxNode[] = [];
  const iterExprNodes: SyntaxNode[] = [];
  let seenIn = false;
  let cursor: SyntaxNode | null = condContent.firstChild;
  while (cursor) {
    if (cursor.name === "LuauInKeyword") {
      seenIn = true;
    } else if (!isSkippable(cursor.name)) {
      if (!seenIn) {
        if (cursor.name === "LuauAccessPath") {
          loopVarNodes.push(cursor);
        }
      } else {
        iterExprNodes.push(cursor);
      }
    }
    cursor = cursor.nextSibling;
  }

  if (loopVarNodes.length === 0 || iterExprNodes.length === 0) return {};

  // Extract loop-variable identifier names from their access paths.
  // Multi-segment paths (`a.b`) aren't valid loop targets in Luau, so
  // we just pick the first segment's variable name.
  const loopVarNames: string[] = [];
  for (const node of loopVarNodes) {
    const nameNode = getDescendent("LuauVariableName", node);
    if (!nameNode) return {};
    loopVarNames.push(ctx.read(nameNode.from, nameNode.to));
  }

  // The iter expression is the FIRST node after `in`. Anything past
  // it (commas + extra expressions) would form a multi-return tuple
  // `(f, s, var)` — but our parser puts them as separate sibling
  // nodes. We treat the whole post-`in` sibling list as a single
  // expression sequence and let `lowerExpressionFromNodes` either
  // merge an access-path + call shape, OR fall through.
  const iterExpr = lowerExpressionFromNodes(iterExprNodes, ctx);
  if (!iterExpr) return {};

  const iterName = `__forIn_${nodeRef.node.from}_iter`;
  const stateName = `__forIn_${nodeRef.node.from}_state`;
  const ctrlName = `__forIn_${nodeRef.node.from}_ctrl`;
  const loopLabel = `__forIn_${nodeRef.node.from}_loop`;
  const breakLabel = `__forIn_${nodeRef.node.from}_break`;

  // Init: pull (f, s, var) from the iter expression via a multi-
  // variable assignment with new-declaration semantics. When the
  // expression returns a single value (closure case),
  // MultiVariableAssignment fills the rest with nulls.
  const initTuple = new MultiVariableAssignment(
    [new Identifier(iterName), new Identifier(stateName), new Identifier(ctrlName)],
    [iterExpr],
    /* isTemporaryNewDeclaration */ true,
  );

  // Push break/continue targets so the body's `break` / `continue`
  // emit diverts to the right label.
  ctx.loopStack?.push({ continueLabel: loopLabel, breakLabel });
  const bodyStatements = lowerStatements(bodyContent, ctx, FOR_IN_BODY_SKIP);
  ctx.loopStack?.pop();

  // Iteration step: call __iter(__state, __ctrl), unpack into the
  // user's loop variables. Declared as locals (re-set each iteration
  // in the same slot under the single-scope wrap).
  const iterCall = new FunctionCall(new Identifier(iterName), [
    new VariableReference([new Identifier(stateName)]),
    new VariableReference([new Identifier(ctrlName)]),
  ]);
  const callAndUnpack = new MultiVariableAssignment(
    loopVarNames.map((n) => new Identifier(n)),
    [iterCall],
    /* isTemporaryNewDeclaration */ true,
  );

  // Termination check: `if first_loop_var == nil then -> break`.
  // sparkdown represents nil as IntValue(0) — see `LuauNil` case in
  // `lowerExpression.ts`. So `x == nil` compiles as `x == 0`.
  const firstVarRef = new VariableReference([new Identifier(loopVarNames[0]!)]);
  const isNilCheck = new BinaryExpression(
    firstVarRef,
    new NumberExpression(0, "int"),
    "==",
  );
  const breakBranch = new ConditionalSingleBranch([
    new Divert([new Identifier(breakLabel)]),
  ]);
  breakBranch.ownExpression = isNilCheck;
  breakBranch.isElse = false;
  const nilCheckConditional = new Conditional(null as never, [breakBranch]);

  // Control update: __ctrl = first_loop_var.
  const ctrlUpdate = new VariableAssignment({
    variableIdentifier: new Identifier(ctrlName),
    assignedExpression: new VariableReference([
      new Identifier(loopVarNames[0]!),
    ]),
  });

  const tailDivert = new Divert([new Identifier(loopLabel)]);

  // Assemble the loop body inside the loop gather.
  const loopGatherContents: ParsedObject[] = [
    callAndUnpack,
    nilCheckConditional,
    ctrlUpdate,
    ...bodyStatements,
    tailDivert,
  ];
  const loopGather = new Gather(new Identifier(loopLabel), 1);
  for (const c of loopGatherContents) loopGather.AddContent(c);

  const breakGather = new Gather(new Identifier(breakLabel), 1);

  return wrapInWeave(
    wrapInScope([initTuple, loopGather, breakGather]),
  );
}

function isSkippable(name: string): boolean {
  return (
    name === "Newline" ||
    name === "OptionalWhitespace" ||
    name === "RequiredWhitespace" ||
    name === "ExtraWhitespace" ||
    name === "LuauComment" ||
    name === "LuauCommaSeparator"
  );
}

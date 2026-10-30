import { isExplicitRuleName } from "../../utils/explicitRuleNames";
import { nodeNameSet } from "../../utils/nodeNameSet";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { Conditional } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/Conditional";
import { ConditionalSingleBranch } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/ConditionalSingleBranch";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { NullExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/NullExpression";
import { StringExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/StringExpression";
import { FunctionCall } from "../../../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { Text } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { ErrorType } from "../../../runtime/Error";
import type {
  CompiledBlock,
  InkDiagnostic,
} from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";
import type { ValuedArms } from "../utils/alternatorValue";
import { containerValueNodes, lowerExpressionFromNodes } from "../expression/lowerExpression";
import { findChildByName, lowerArms, reportAlternatorHead, tokenAfter, valuedConditionNodes } from "../utils/alternatorArms";
import { alternatorHeadNodes } from "../../utils/alternatorDecision";
import { statementSource } from "../utils/statementSource";
import { wrapInWeave } from "../utils/wrapInWeave";

const NOT_A_LINE = nodeNameSet([
  "LuauConditionalAlternatorCondition",
  "Newline",
  "Whitespace",
  "OptionalWhitespace",
  "RequiredWhitespace",
  "ExtraWhitespace",
  "TrailingWhitespace",
  "SparkdownLineComment",
  "SparkdownInlineComment",
  "LuauComment",
  "LuauLineComment",
  "LuauDocLineComment",
  "LuauBlockComment",
]);

export function lowerSparkdownConditionalAlternatorBlock(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
  valued: ValuedArms | false = false,
): CompiledBlock {
  const prefix = nodeRef.node.name;
  const begin = findChildByName(nodeRef.node, `${prefix}_begin`);
  const keywordNode = begin
    ? getDescendent("LuauControlKeyword", begin)
    : null;
  const keyword = keywordNode
    ? ctx.read(keywordNode.from, keywordNode.to).trim()
    : "";

  const condNode = getDescendent(
    "LuauConditionalAlternatorCondition",
    nodeRef.node,
  );
  const readsHead = valued !== false || alternatorHeadNodes(nodeRef.node).length > 0;
  if (readsHead && !valued) reportAlternatorHead(nodeRef.node, ctx);
  const condNodes = valued ? valuedConditionNodes(nodeRef.node) : condNode ? containerValueNodes(condNode) : [];
  let condExpr = condNodes.length > 0
    ? lowerExpressionFromNodes(condNodes, ctx, readsHead ? null : "expression", readsHead ? undefined : tokenAfter(condNodes, ctx))
    : null;

  if (keyword === "plural" && condExpr) {
    condExpr = new FunctionCall(new Identifier("plural.category"), [condExpr]);
  }

  const content = findChildByName(nodeRef.node, `${prefix}_content`);
  let arms = lowerArms(content, ctx, valued);

  const diagnostics: InkDiagnostic[] = [];
  const name = keyword || "match";
  if (prefix === "LuauSparkdownConditionalAlternatorBlock") {
    for (
      let child = content?.firstChild ?? null;
      child && child.name !== "LuauAlternatorSeparator";
      child = child.nextSibling
    ) {
      if (NOT_A_LINE.has(child.name)) {
        continue;
      }
      diagnostics.push({
        message: `This line is in no arm of the \`${name}\`: an arm starts with \`|\`, as in \`| 1 = One.\``,
        severity: ErrorType.Error,
        source: statementSource(child, ctx),
      });
    }
  }
  if (arms.length === 0 && diagnostics.length === 0) {
    const at = keywordNode ?? nodeRef.node;
    diagnostics.push({
      message: `A \`${name}\` needs at least one arm, written \`| value = ...\``,
      severity: ErrorType.Error,
      source: statementSource(at, ctx),
    });
  }

  if (keyword === "plural") {
    const allPositional = arms.length > 0 && arms.every((a) => a.key === null);
    if (allPositional) {
      if (arms.length === 2) {
        arms = [
          { key: "one", body: arms[0]!.body },
          { key: null, body: arms[1]!.body },
        ];
      }
    }
  }

  const isInline =
    valued !== false ||
    isExplicitRuleName(prefix, "LuauConditionalAlternatorBlock") ||
    prefix === "LuauSparkdownInlineGluedConditionalAlternatorBlock" ||
    prefix === "LuauSparkdownSingleLineConditionalAlternatorBlock";

  const branches = arms.map((arm) => {
    const branch = new ConditionalSingleBranch(
      arm.body.length > 0 ? arm.body : null,
    );
    if (arm.key !== null) {
      if (keyword === "match" && arm.key === "other") {
        branch.isElse = true;
      } else {
        branch.ownExpression = new StringExpression([new Text(arm.key)]);
        branch.matchingEquality = true;
      }
    } else if (keyword === "plural") {
      branch.isElse = true;
    }
    if (condExpr) branch.matchingEquality = true;
    branch.isInline = isInline;
    return branch;
  });

  if (valued && !branches.some((branch) => branch.isElse)) {
    const nil = new ConditionalSingleBranch([new NullExpression()]);
    nil.isElse = true;
    if (condExpr) nil.matchingEquality = true;
    nil.isInline = true;
    branches.push(nil);
  }

  const conditional = new Conditional(
    (condExpr ?? null) as unknown as Expression,
    branches,
  );
  const block = wrapInWeave([conditional]);
  if (diagnostics.length > 0) {
    block.diagnostics = [...(block.diagnostics ?? []), ...diagnostics];
  }
  return block;
}

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

// match (expr)    →  Conditional(initialCondition=expr,
// | key = body                  branches=[ Branch(ownExpression="key", matchingEquality, body) ])
// end
//
// plural (n)      →  Conditional(initialCondition=plural.category(n),
// | zero = body                  branches=[ Branch(ownExpression="zero", matchingEquality, body) ])
// end
//
// `plural.category(n)` is a stdlib builtin that returns the CLDR
// plural category for `n` ("zero" / "one" / "two" / "few" / "many" /
// "other") given the current language stored in `lang.current`. The
// language is a runtime-mutable store (default "en"); authors can
// switch it with `lang.current = "fr"` and subsequent plural calls
// observe the change. We keep the language out of the desugared call
// site so plural alternators don't need to know which language they're
// being evaluated in — that's a runtime concern.
//
// **Positional plural** — when every arm is keyless (`plural(n)|apple|
// apples`), the lowerer treats the arms as positional and synthesizes
// CLDR-category keys from a canonical singular-vs-plural mapping:
//   - 1 arm  → `[else=arm0]` (single form, language-independent)
//   - 2 arms → `[one=arm0, else=arm1]` (singular + everything else)
// This is right for languages whose CLDR rules collapse to one/other
// (English, French, Spanish, German, Italian, Portuguese, ...). For
// richer category sets (Russian, Arabic, Welsh), authors use named
// arms (`|zero=…|one=…|two=…|few=…|many=…|other=…`) where the
// per-language category list is explicit. Three-or-more keyless arms
// are intentionally rejected — the mapping would be arbitrary across
// languages, and we prefer a hard error directing authors to named
// keys over silently picking a convention.

// What a block holds before its first arm that is not a line of story: the
// condition, line breaks, spacing and comments.
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

// With `valued`, each arm pushes one value (`lowerArms`), for an alternator
// Luau code uses as a value or writes as a statement (`lowerAlternatorValue`).
export function lowerSparkdownConditionalAlternatorBlock(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
  valued: ValuedArms | false = false,
): CompiledBlock {
  // Works for both the top-level `LuauSparkdownConditionalAlternatorBlock`
  // (block form: `plural(n) ... end` on its own lines) and the inline
  // `LuauConditionalAlternatorBlock` (the variant the grammar produces
  // when the construct appears inside `{...}` interpolation). The two
  // rules generate begin/content children with different name prefixes;
  // deriving the prefix from the node's own name lets the same lowerer
  // handle both.
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
  // Its condition, an alternator's head in a story brace, reports its
  // reading's errors (`reportReadingErrors`), as an arm does, ending at the
  // `|` after it (`tokenAfter`): the whole head where the grammar gives it
  // one, which can hold more than the condition (`match 1 `a {} b` | ...`),
  // or else the condition.
  // When `valued`, the reading of Luau code that uses the alternator as a
  // value reads its head (`reportNestedAlternators`).
  const readsHead = valued !== false || alternatorHeadNodes(nodeRef.node).length > 0;
  if (readsHead && !valued) reportAlternatorHead(nodeRef.node, ctx);
  const condNodes = valued ? valuedConditionNodes(nodeRef.node) : condNode ? containerValueNodes(condNode) : [];
  let condExpr = condNodes.length > 0
    ? lowerExpressionFromNodes(condNodes, ctx, readsHead ? null : "expression", readsHead ? undefined : tokenAfter(condNodes, ctx))
    : null;

  // Plural desugars to `plural.category(condition)` — the stdlib
  // builtin consults `lang.current` internally to pick the right
  // CLDR rules.
  if (keyword === "plural" && condExpr) {
    condExpr = new FunctionCall(new Identifier("plural.category"), [condExpr]);
  }

  const content = findChildByName(nodeRef.node, `${prefix}_content`);
  let arms = lowerArms(content, ctx, valued);

  // An arm starts at its `|`. A line of the block before the first one, such
  // as `case 1` (#1502), belongs to no arm and would be dropped: it is an
  // error, and so is a block with no arm at all.
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

  // Positional plural sugar: when `keyword === "plural"` and every arm
  // is keyless, synthesize CLDR keys from the canonical singular-vs-
  // plural mapping. 1 arm → catch-all; 2 arms → `one` + catch-all. The
  // 3+-arm case is left as-is (all branches become catch-all `isElse`,
  // so only the first matches) — authors writing 3+ positional arms
  // are likely confused about the design and should switch to named
  // keys; the silent-first-wins fallback at least produces stable
  // output rather than no output. See top-of-file comment.
  if (keyword === "plural") {
    const allPositional = arms.length > 0 && arms.every((a) => a.key === null);
    if (allPositional) {
      if (arms.length === 2) {
        arms = [
          { key: "one", body: arms[0]!.body },
          { key: null, body: arms[1]!.body },
        ];
      }
      // 1-arm positional: leave as keyless — the `isElse` assignment
      // below makes it the catch-all.
    }
  }

  // Multi-line block form (`plural(n)\n  | one = ...\nend`) places each
  // arm on its own logical line — `ConditionalSingleBranch.
  // EmitProgram` emits a leading `\n` into the branch body
  // when `isInline` is false. For the inline forms (`{plural(n)|...|...}`
  // inside `{...}`, `..plural(n)|...|.. ..` inline-glued, and the
  // single-line block form `plural(n)|one=…|other=… end`), arms are
  // inline content with no per-arm newline, so we set `isInline = true`
  // to suppress that leading newline.
  // A valued alternator's arms push a value and write nothing, so none
  // starts a line.
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
      // `match` catch-all: the bare keyword `other` on a named arm
      // becomes a true `isElse=true` branch (matches whatever didn't
      // match earlier), not a string-equality comparison against the
      // literal `"other"`. This mirrors how typical pattern-matching
      // constructs treat a wildcard/default arm.
      //
      // `plural` keeps `other` as a string match — CLDR uses "other"
      // as a real category name (the catch-all category in
      // pluralization rules), so `| other = ...` in plural is
      // correctly an equality match against `plural.category(n)`'s
      // return value.
      if (keyword === "match" && arm.key === "other") {
        branch.isElse = true;
      } else {
        branch.ownExpression = new StringExpression([new Text(arm.key)]);
        branch.matchingEquality = true;
      }
    } else if (keyword === "plural") {
      // A keyless arm in `plural` (after positional desugaring) is the
      // catch-all `else` branch — matches whatever the plural category
      // is when no preceding named branch matched. Required for the
      // 1-arm-positional and 2-arm-positional cases above.
      branch.isElse = true;
    }
    // Every branch of a switch on `condExpr` matches against its value, the
    // catch-all included: a matching else branch pops the value the branches
    // compared. Left on the evaluation stack, it would be read by whatever
    // consumes the stack next, such as the table of the line the alternator
    // sits in.
    if (condExpr) branch.matchingEquality = true;
    branch.isInline = isInline;
    return branch;
  });

  // A valued alternator whose value matches no arm is nil, as a displayed
  // one shows nothing: a catch-all branch pushes it.
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

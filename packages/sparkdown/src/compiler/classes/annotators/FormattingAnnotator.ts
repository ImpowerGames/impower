import { isExplicitRuleName } from "../../utils/explicitRuleNames";
import { namesValue } from "../../utils/alternatorDecision";
import { type SparkdownNodeName } from "../../types/SparkdownNodeName";
import { CALL_LIKE_OPENERS } from "../../utils/callLikeOpeners";
import { nodeNameSet } from "../../utils/nodeNameSet";
import {
  ALL_INLINE_ALTERNATOR_NAMES,
  isInsideOneLineAlternator,
  PRESERVE_WHITESPACE_ALTERNATOR_NAMES,
} from "../../utils/inlineAlternators";
import {
  braceBodySpacing,
  isInStructBlockKey,
  isSpacedBraceEdge,
  keepsSpaceBeforeClass,
} from "../../utils/braceBodySpacing";
import { oneLineTableBraces, tableOuterGaps } from "../../utils/oneLineTableBraces";
import { Range } from "@codemirror/state";
import { getContextStack } from "@impower/textmate-grammar-tree/src/tree/utils/getContextStack";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import type { SyntaxNode, SyntaxNodeRef } from "@lezer/common";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";

const KEYWORDS_REQUIRING_TRAILING_SPACE = nodeNameSet([
  "LuauIfKeyword",
  "LuauElseifKeyword",
  "LuauForKeyword",
  "LuauWhileKeyword",
  "LuauRepeatKeyword",
  "LuauChooseKeyword",
  "LuauThenKeyword",
  "LuauElseKeyword",
  "LuauControlKeyword",
  "LuauReturnKeyword",
  "LuauDoKeyword",
  "LuauWithKeyword",
  "LuauNewKeyword",
  "LuauLocalKeyword",
  "LuauConstKeyword",
  "LuauFunctionKeyword",
  "LuauDefineKeyword",
  "LuauAsKeyword",
  "LuauInKeyword",
  "LuauUntilKeyword",
  "SceneKeyword",
  "BranchKeyword",
]);

const KEYWORDS_REQUIRING_LEADING_SPACE = nodeNameSet([
  "LuauThenKeyword",
  "LuauElseKeyword",
  "LuauElseifKeyword",
]);

const SPACED_PUNCTUATION_OPERATORS: Partial<
  Record<SparkdownNodeName, { spelling: string; forceAfter: boolean }>
> = {
  LuauConcatOperator: { spelling: "..", forceAfter: true },
  LuauTypeCastOperator: { spelling: "::", forceAfter: false },
  LuauAssignmentOperator: { spelling: "..=", forceAfter: false },
};

function spacedPunctuationOperator(name: string): { spelling: string; forceAfter: boolean } | undefined {
  for (const [original, spacing] of Object.entries(SPACED_PUNCTUATION_OPERATORS)) {
    if (isExplicitRuleName(name, original)) return spacing;
  }
  return undefined;
}

function isInsideInlineAlternator(
  node: SparkdownSyntaxNodeRef,
  read: (from: number, to: number) => string,
): boolean {
  return isInsideOneLineAlternator(
    node.node,
    read,
    PRESERVE_WHITESPACE_ALTERNATOR_NAMES,
  );
}

function isInsideAnyInlineAlternator(
  node: SparkdownSyntaxNodeRef,
  read: (from: number, to: number) => string,
): boolean {
  return isInsideOneLineAlternator(node.node, read, ALL_INLINE_ALTERNATOR_NAMES);
}

function isAfterUnaryOperator(node: SparkdownSyntaxNodeRef): boolean {
  const opNode = ancestorNamed(node.node, "LuauArithmeticOperator");
  if (!opNode) return false;
  if (node.from <= opNode.from) return false;
  const operation = ancestorNamed(opNode, "LuauArithmeticOperation");
  if (!operation) return false;

  const before = significantBefore(opNode.prevSibling);
  if (before) return NOT_AN_LHS.has(before.name);

  if (
    isExplicitRuleName(operation.parent?.name, "LuauLineContinuation_content") ||
    operation.parent?.name === "LuauMinusLineContinuation_content"
  ) {
    return false;
  }

  const lhs = significantBefore(operation.prevSibling);
  return !lhs || NOT_AN_LHS.has(lhs.name);
}

function isBetweenLengthAndOperator(node: SparkdownSyntaxNodeRef): boolean {
  const opNode = ancestorNamed(node.node, "LuauArithmeticOperator");
  if (!opNode || node.from > opNode.from) return false;
  const operation = ancestorNamed(opNode, "LuauArithmeticOperation");
  if (!operation || significantBefore(opNode.prevSibling)) return false;
  return (
    isExplicitRuleName(significantBefore(operation.prevSibling)?.name, "LuauLengthOperator")
  );
}

function ancestorNamed(node: SyntaxNode, name: string): SyntaxNode | null {
  for (let walker = node.parent; walker; walker = walker.parent) {
    if (isExplicitRuleName(walker.name, name)) return walker;
  }
  return null;
}

function isInsignificant(n: { name: string }): boolean {
  return (
    n.name === "Newline" ||
    n.name === "Whitespace" ||
    n.name === "ExtraWhitespace" ||
    n.name === "OptionalWhitespace" ||
    n.name === "RequiredWhitespace" ||
    n.name === "TrailingWhitespace"
  );
}

function isBeforeMidLineTag(
  node: SyntaxNode,
  read: (from: number, to: number) => string,
): boolean {
  const begin = node.parent?.parent;
  return (
    (begin?.name === "Tags_begin" ||
      begin?.name === "SparkdownExplicitTags_begin") &&
    read(node.to, node.to + 1) === "#"
  );
}

function significantBefore(n: SyntaxNode | null): SyntaxNode | null {
  while (n && isInsignificant(n)) n = n.prevSibling;
  return n;
}

const NOT_AN_LHS = nodeNameSet([
  "LuauArithmeticOperator",
  "LuauLengthOperator",
  "LuauAssignmentOperator",
  "LuauCompareOperator",
  "LuauConcatOperator",
  "LuauLogicalOperator",
  "LuauCommaSeparator",
  "LuauCommaLineBreak",
  "LuauThenOperator",
  "LuauElseOperator",
]);

function isInsideUIAttribute(node: SparkdownSyntaxNodeRef): boolean {
  for (const ancestor of getContextStack(node.node)) {
    if (ancestor.name === "LuauUIAttribute") {
      return true;
    }
  }
  return false;
}

function followsLeadingGlue(node: SyntaxNode): boolean {
  for (
    let before: SyntaxNode | null = node.resolveInner(node.from, -1);
    before && before.to === node.from;
    before = before.parent
  ) {
    if (before.name === "LeadingGlue") return true;
  }
  return false;
}

function precedesLeadingGlue(node: SyntaxNode): boolean {
  for (
    let after: SyntaxNode | null = node.resolveInner(node.to, 1);
    after && after.from === node.to;
    after = after.parent
  ) {
    if (after.name === "LeadingGlue") return true;
  }
  return false;
}

export type FormatType =
  | "separator"
  | "keyword_separator"
  | "extra"
  | "trailing"
  | "newline"
  | "indent"
  | "frontmatter_begin"
  | "frontmatter_end"
  | "scene_begin"
  | "branch_begin"
  | "choice_mark"
  | "sol_comment"
  | "eol_divert"
  | "blankline"
  | "frontmatter"
  | "top_level_begin";

const INDENT_REGEX: RegExp = /^[ \t]*/;

export class FormattingAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<FormatType>
> {
  processedLineFrom = -1;

  override begin(): void {
    this.processedLineFrom = -1;
  }

  private isTopLevel(nodeRef: SparkdownSyntaxNodeRef): boolean {
    const stack = getContextStack(nodeRef.node);
    for (const ancestor of stack) {
      if (ancestor === nodeRef.node) continue;
      const name = ancestor.name;
      if (name === "sparkdown") {
        continue;
      }
      return false;
    }
    return true;
  }

  override enter(
    annotations: Range<SparkdownAnnotation<FormatType>>[],
    nodeRef: SparkdownSyntaxNodeRef,
  ): Range<SparkdownAnnotation<FormatType>>[] {
    if (
      nodeRef.from > this.processedLineFrom &&
      (nodeRef.from === 0 || this.read(nodeRef.from - 1, nodeRef.from) === "\n")
    ) {
      const firstChar = this.read(nodeRef.from, nodeRef.from + 1);
      if (firstChar !== "" && !/\s/.test(firstChar)) {
        this.processedLineFrom = nodeRef.from;
        annotations.push(
          SparkdownAnnotation.mark<FormatType>("indent").range(
            nodeRef.from,
            nodeRef.from,
          ),
        );
      }
    }
    if (
      nodeRef.name === "Whitespace" ||
      nodeRef.name === "ExtraWhitespace" ||
      nodeRef.name === "OptionalWhitespace" ||
      nodeRef.name === "RequiredWhitespace" ||
      nodeRef.name === "TrailingWhitespace"
    ) {
      const currentLine = this.getLineAt(nodeRef.from);
      if (currentLine.from === nodeRef.from) {
        if (this.processedLineFrom < currentLine.from) {
          this.processedLineFrom = currentLine.from;
          const indentMatch = currentLine.text.match(INDENT_REGEX);
          const currentIndentation = indentMatch?.[0] || "";
          annotations.push(
            SparkdownAnnotation.mark<FormatType>("indent").range(
              currentLine.from,
              currentLine.from + currentIndentation.length,
            ),
          );
        }
        return annotations;
      }
      const nextChar = this.read(nodeRef.to, nodeRef.to + 1);
      if (nextChar === "\n" || nextChar === "\r" || nextChar === "") {
        annotations.push(
          SparkdownAnnotation.mark<FormatType>("trailing").range(
            nodeRef.from,
            nodeRef.to,
          ),
        );
        return annotations;
      }
    }
    if (nodeRef.name === "FrontMatter_begin") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("frontmatter_begin").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    if (nodeRef.name === "SceneKeyword") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("scene_begin").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    if (
      nodeRef.name === "LuauFunctionDefinition" ||
      nodeRef.name === "LuauFunctionTypeDeclaration" ||
      nodeRef.name === "LuauDefine" ||
      nodeRef.name === "LuauStyle" ||
      nodeRef.name === "LuauLayout" ||
      nodeRef.name === "LuauScreen" ||
      nodeRef.name === "LuauComponent"
    ) {
      if (this.isTopLevel(nodeRef)) {
        annotations.push(
          SparkdownAnnotation.mark<FormatType>("top_level_begin").range(
            nodeRef.from,
            nodeRef.from,
          ),
        );
      }
    }
    if (nodeRef.name === "BranchKeyword") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("branch_begin").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    if (isExplicitRuleName(nodeRef.name, "LuauLogicalOperator")) {
      let kwStart = nodeRef.from;
      while (
        kwStart < nodeRef.to &&
        (this.read(kwStart, kwStart + 1) === " " ||
          this.read(kwStart, kwStart + 1) === "\t")
      ) {
        kwStart += 1;
      }
      for (const kw of ["and", "or", "not"]) {
        const slice = this.read(kwStart, kwStart + kw.length);
        if (slice !== kw) continue;
        const kwEnd = kwStart + kw.length;
        let scan = kwEnd;
        while (
          this.read(scan, scan + 1) === " " ||
          this.read(scan, scan + 1) === "\t"
        ) {
          scan += 1;
        }
        if (CALL_LIKE_OPENERS.has(this.read(scan, scan + 1))) {
          annotations.push(
            SparkdownAnnotation.mark<FormatType>("keyword_separator").range(
              kwEnd,
              kwEnd,
            ),
          );
        }
        break;
      }
    }
    const spacedOperator = spacedPunctuationOperator(nodeRef.name);
    if (spacedOperator) {
      let opStart = nodeRef.from;
      while (
        opStart < nodeRef.to &&
        (this.read(opStart, opStart + 1) === " " ||
          this.read(opStart, opStart + 1) === "\t")
      ) {
        opStart += 1;
      }
      const { spelling, forceAfter } = spacedOperator;
      if (this.read(opStart, opStart + spelling.length) === spelling) {
        const opEnd = opStart + spelling.length;
        const isLineBreak = (c: string) => c === "\n" || c === "\r" || c === "";
        let beforeScan = opStart - 1;
        while (beforeScan >= 0) {
          const c = this.read(beforeScan, beforeScan + 1);
          if (c === " " || c === "\t") {
            beforeScan -= 1;
            continue;
          }
          break;
        }
        const before =
          beforeScan < 0 ? "" : this.read(beforeScan, beforeScan + 1);
        let afterScan = opEnd;
        while (true) {
          const c = this.read(afterScan, afterScan + 1);
          if (c === " " || c === "\t") {
            afterScan += 1;
            continue;
          }
          break;
        }
        const after = this.read(afterScan, afterScan + 1);
        if (!isLineBreak(before)) {
          annotations.push(
            SparkdownAnnotation.mark<FormatType>("keyword_separator").range(
              opStart,
              opStart,
            ),
          );
        }
        if (forceAfter && !isLineBreak(after)) {
          annotations.push(
            SparkdownAnnotation.mark<FormatType>("keyword_separator").range(
              opEnd,
              opEnd,
            ),
          );
        }
      }
    }
    if (KEYWORDS_REQUIRING_TRAILING_SPACE.has(nodeRef.name)) {
      let scanPos = nodeRef.to;
      while (true) {
        const ch = this.read(scanPos, scanPos + 1);
        if (ch === " " || ch === "\t") {
          scanPos += 1;
          continue;
        }
        break;
      }
      const nextChar = this.read(scanPos, scanPos + 1);
      if (CALL_LIKE_OPENERS.has(nextChar)) {
        const insideInline =
          nodeRef.name === "LuauControlKeyword" &&
          (namesValue(nodeRef.node) ||
            isInsideAnyInlineAlternator(nodeRef, (from, to) =>
              this.read(from, to),
            ));
        if (!insideInline) {
          annotations.push(
            SparkdownAnnotation.mark<FormatType>("keyword_separator").range(
              nodeRef.to,
              nodeRef.to,
            ),
          );
        }
      }
    }
    if (KEYWORDS_REQUIRING_LEADING_SPACE.has(nodeRef.name)) {
      const prevChar = this.read(nodeRef.from - 1, nodeRef.from);
      if (
        nodeRef.from > this.getLineAt(nodeRef.from).from &&
        prevChar !== " " &&
        prevChar !== "\t"
      ) {
        annotations.push(
          SparkdownAnnotation.mark<FormatType>("keyword_separator").range(
            nodeRef.from,
            nodeRef.from,
          ),
        );
      }
      const nextChar = this.read(nodeRef.to, nodeRef.to + 1);
      if (
        nextChar !== "" &&
        !/\s/.test(nextChar) &&
        !isInsideAnyInlineAlternator(nodeRef, (from, to) => this.read(from, to))
      ) {
        annotations.push(
          SparkdownAnnotation.mark<FormatType>("separator").range(
            nodeRef.to,
            nodeRef.to,
          ),
        );
      }
    }
    const read = (from: number, to: number) => this.read(from, to);
    const tableGaps = tableOuterGaps(nodeRef.node, read);
    for (const gap of [tableGaps.before, tableGaps.after]) {
      if (gap != null) {
        annotations.push(
          SparkdownAnnotation.mark<FormatType>("keyword_separator").range(
            gap,
            gap,
          ),
        );
      }
    }
    const tableBraces = oneLineTableBraces(nodeRef.node, read);
    if (tableBraces) {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("keyword_separator").range(
          tableBraces.open + 1,
          tableBraces.open + 1,
        ),
        SparkdownAnnotation.mark<FormatType>("keyword_separator").range(
          tableBraces.close,
          tableBraces.close,
        ),
      );
    }
    for (const mark of braceBodySpacing(nodeRef.node, read)) {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>(mark.type).range(
          mark.from,
          mark.to,
        ),
      );
    }
    if (nodeRef.name === "ChoiceMark") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("choice_mark").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    if (isExplicitRuleName(nodeRef.name, "Tag")) {
      if (nodeRef.from === this.getLineAt(nodeRef.from).from) {
        annotations.push(
          SparkdownAnnotation.mark<FormatType>("sol_comment").range(
            nodeRef.from,
            nodeRef.to,
          ),
        );
        return annotations;
      }
    }
    if (nodeRef.name === "Divert") {
      const tunnelMarkNode = getDescendent("TunnelMark", nodeRef.node);
      if (!tunnelMarkNode) {
        annotations.push(
          SparkdownAnnotation.mark<FormatType>("eol_divert").range(
            nodeRef.from,
            nodeRef.to,
          ),
        );
      }
      return annotations;
    }
    if (
      nodeRef.name === "RequiredWhitespace" ||
      nodeRef.name === "OptionalWhitespace"
    ) {
      const read = (from: number, to: number) => this.read(from, to);
      if (isInsideInlineAlternator(nodeRef, read)) return annotations;
      if (followsLeadingGlue(nodeRef.node)) return annotations;
      if (isInStructBlockKey(nodeRef.node)) return annotations;
      if (
        this.read(nodeRef.from - 1, nodeRef.from) === ":" &&
        precedesLeadingGlue(nodeRef.node)
      ) {
        annotations.push(
          SparkdownAnnotation.mark<FormatType>("keyword_separator").range(
            nodeRef.from,
            nodeRef.to,
          ),
        );
        return annotations;
      }
      if (isBeforeMidLineTag(nodeRef.node, read)) {
        annotations.push(
          SparkdownAnnotation.mark<FormatType>("keyword_separator").range(
            nodeRef.from,
            nodeRef.to,
          ),
        );
        return annotations;
      }
      if (
        keepsSpaceBeforeClass(nodeRef.node) ||
        isSpacedBraceEdge(nodeRef.node, read)
      ) {
        annotations.push(
          SparkdownAnnotation.mark<FormatType>("keyword_separator").range(
            nodeRef.from,
            nodeRef.to,
          ),
        );
        return annotations;
      }
      const tightInline = isInsideAnyInlineAlternator(nodeRef, read);
      const tightUnary =
        (isAfterUnaryOperator(nodeRef) &&
          this.read(nodeRef.to, nodeRef.to + 1) !== "-") ||
        isBetweenLengthAndOperator(nodeRef);
      const tightUIAttr =
        isInsideUIAttribute(nodeRef) &&
        (this.read(nodeRef.to, nodeRef.to + 1) === "=" ||
          this.read(nodeRef.from - 1, nodeRef.from) === "=");
      annotations.push(
        SparkdownAnnotation.mark<FormatType>(
          tightInline || tightUnary || tightUIAttr ? "extra" : "separator",
        ).range(nodeRef.from, nodeRef.to),
      );
      return annotations;
    }
    if (nodeRef.name === "ExtraWhitespace") {
      if (isInsideInlineAlternator(nodeRef, (from, to) => this.read(from, to)))
        return annotations;
      if (isInStructBlockKey(nodeRef.node)) return annotations;
      if (ancestorNamed(nodeRef.node, "LuauSparkleValueOverflow")) {
        return annotations;
      }
      annotations.push(
        SparkdownAnnotation.mark<FormatType>(
          isSpacedBraceEdge(nodeRef.node, (from, to) => this.read(from, to))
            ? "keyword_separator"
            : "extra",
        ).range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    if (nodeRef.name === "Newline") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("newline").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      const nextLine = this.getLineAt(nodeRef.to);
      const indentMatch = nextLine.text.match(INDENT_REGEX);
      if (this.processedLineFrom < nextLine.from) {
        this.processedLineFrom = nextLine.from;
        let currentIndentation = indentMatch?.[0] || "";
        annotations.push(
          SparkdownAnnotation.mark<FormatType>("indent").range(
            nodeRef.to,
            nodeRef.to + currentIndentation.length,
          ),
        );
      }
      return annotations;
    }
    return annotations;
  }

  override leave(
    annotations: Range<SparkdownAnnotation<FormatType>>[],
    nodeRef: SyntaxNodeRef,
  ): Range<SparkdownAnnotation<FormatType>>[] {
    if (nodeRef.name === "FrontMatter") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("frontmatter_end").range(
          nodeRef.to,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    return annotations;
  }
}

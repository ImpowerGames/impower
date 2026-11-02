import { isExplicitRuleName } from "@impower/sparkdown/src/compiler/utils/explicitRuleNames";
import { ALTERNATOR_CANDIDATES, opensAlternator } from "@impower/sparkdown/src/compiler/utils/alternatorDecision";
import { CALL_LIKE_OPENERS } from "@impower/sparkdown/src/compiler/utils/callLikeOpeners";
import { isNameChar, JOINING_PAIRS } from "@impower/sparkdown/src/compiler/utils/lexicalJoin";
import { nodeNameSet } from "@impower/sparkdown/src/compiler/utils/nodeNameSet";
import { oneLineTableBraces } from "@impower/sparkdown/src/compiler/utils/oneLineTableBraces";
import { reassignmentParts } from "@impower/sparkdown/src/compiler/utils/reassignmentNames";
import { isStatementNodeName } from "@impower/sparkdown/src/compiler/lower/utils/lineContinuation";
import { createSparkdownParser } from "@impower/sparkdown/src/compiler/utils/createSparkdownParser";
import { type TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { FormatType } from "@impower/sparkdown/src/compiler/classes/annotators/FormattingAnnotator";
import { SparkdownAnnotations } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import { GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { getStack } from "@impower/textmate-grammar-tree/src/tree/utils/getStack";
import { type SyntaxNode, Tree } from "@lezer/common";
import {
  type FormattingOptions,
  type Position,
  type TextEdit,
} from "vscode-languageserver";
import { type Range } from "vscode-languageserver-textdocument";

const WHITESPACE_REGEX = /[\t ]*/;
const INDENT_REGEX: RegExp = /^[ \t]*/;

const NO_SPACE_BEFORE = new Set([")", "]", "}", ",", ";", ":", "."]);
const NO_SPACE_AFTER = new Set(["(", "[", "{", "."]);

function isWordChar(c: string): boolean {
  return /[a-zA-Z0-9_]/.test(c);
}

const FORMATTER_ONLY_JOINING_PAIRS = new Set([".="]);

const NUMBER_NODE_REGEX = /^(?:LuauNumeric[A-Za-z]*|NumberLiteral|NumberValue)(?:_|$)/;

const STRING_NODE_REGEX = /String$/;
const LITERAL_NODE_REGEX = /(?:String|Comment)$/;

function insideNode(tree: Tree, pos: number, regex: RegExp): boolean {
  for (let n: SyntaxNode | null = tree.resolveInner(pos, 1); n; n = n.parent) {
    if (n.from < pos && regex.test(n.name)) return true;
  }
  return false;
}

function endsNumberAt(tree: Tree | undefined, offset: number): boolean {
  const node = tree?.resolveInner(offset, -1);
  return Boolean(
    node &&
      (NUMBER_NODE_REGEX.test(node.name) ||
        (node.parent != null && NUMBER_NODE_REGEX.test(node.parent.name))),
  );
}

function mustKeepSpaceBetween(
  prevChar: string,
  nextChar: string,
  afterNumber: boolean,
): boolean {
  const nextIsName = isNameChar(nextChar);
  if (
    nextIsName &&
    (isNameChar(prevChar) || prevChar === ")" || prevChar === "]")
  ) {
    return true;
  }
  if (afterNumber && (nextIsName || nextChar === ".")) return true;
  return (
    JOINING_PAIRS.has(prevChar + nextChar) ||
    FORMATTER_ONLY_JOINING_PAIRS.has(prevChar + nextChar)
  );
}

function shouldInsertSpaceBetween(
  prevChar: string,
  nextChar: string,
): boolean {
  if (prevChar === " " || prevChar === "\t") return false;
  if (nextChar === " " || nextChar === "\t") return false;
  if (NO_SPACE_BEFORE.has(nextChar)) return false;
  if (NO_SPACE_AFTER.has(prevChar)) return false;
  if (CALL_LIKE_OPENERS.has(nextChar) && isWordChar(prevChar)) return false;
  return true;
}

const INDENTING_BLOCKS = nodeNameSet([
  "BlockTitle",
  "BlockHeading",
  "BlockTransitional",
  "BlockWrite",
  "BlockDialogue",
  "BlockAction",
  "LuauFunctionDefinition",
  "LuauFunctionTypeDeclaration",
  "LuauSparkdownRepeatLoop",
  "LuauSparkdownDoBlock",
  "LuauSparkdownIfBlock",
  "LuauSparkdownElseifBlock",
  "LuauSparkdownElseBlock",
  "LuauRepeatLoop",
  "LuauDoBlock",
  "LuauIfBlock",
  "LuauElseifBlock",
  "LuauElseBlock",
  "LuauSparkdownChooseBlock",
  "LuauSparkdownChooseThenClause",
  "LuauSparkdownConditionalAlternatorBlock",
  "LuauSparkdownSequentialAlternatorBlock",
  "LuauSequentialAlternatorBlock",
  "LuauConditionalAlternatorBlock",
  "LuauSequentialAlternatorLineStart",
  "LuauConditionalAlternatorLineStart",
  "LuauSparkleBlockIf",
  "LuauSparkleBlockElseif",
  "LuauSparkleBlockElse",
  "LuauSparkleBlockFor",
  "LuauSparkleBlockMatch",
  "LuauSparkleBlockCase",
  "LuauSparkleIfBlock",
  "LuauSparkleElseifBlock",
  "LuauSparkleElseBlock",
  "LuauSparkleForLoop",
  "LuauSparkleMatchBlock",
  "LuauSparkleCaseClause",
  "LuauDefine",
  "LuauMethodDefinition",
  "LuauTable",
  "LuauParenthetical",
  "LuauFunctionCallParameters",
  "LuauFunctionParameters",
] as SparkdownNodeName[]);

const SIBLING_CLAUSES: Partial<Record<SparkdownNodeName, SparkdownNodeName[]>> = {
  LuauSparkdownIfBlock: [
    "LuauSparkdownElseifBlock",
    "LuauSparkdownElseBlock",
  ],
  LuauIfBlock: ["LuauElseifBlock", "LuauElseBlock"],
  LuauSparkleBlockIf: ["LuauSparkleBlockElseif", "LuauSparkleBlockElse"],
  LuauSparkleBlockFor: ["LuauSparkleBlockElse"],
  LuauSparkleIfBlock: ["LuauSparkleElseifBlock", "LuauSparkleElseBlock"],
  LuauSparkleForLoop: ["LuauSparkleElseBlock"],
  LuauSparkdownChooseBlock: ["LuauSparkdownChooseThenClause"],
};

const CHOICE_SCOPE_TERMINATORS = nodeNameSet([
  "Scene",
  "Branch",
  "LuauFunctionDefinition",
  "LuauFunctionTypeDeclaration",
  "LuauDefine",
  "FrontMatter",
]);

function countChoiceBodies(
  stack: GrammarSyntaxNode<SparkdownNodeName>[],
): number {
  let count = 0;
  for (const node of stack) {
    if (!node || !node.node) continue;
    if (node.name === "Choice") continue;
    if (node.name === "LuauSparkdownChooseThenClause") continue;
    if (CHOICE_SCOPE_TERMINATORS.has(node.name)) break;

    let sibling = node.node.prevSibling;
    while (sibling) {
      if (CHOICE_SCOPE_TERMINATORS.has(sibling.name)) break;
      if (sibling.name === "Choice") {
        count += 1;
        break;
      }
      sibling = sibling.prevSibling;
    }
  }
  return count;
}

const MERGEABLE_ELSE_BLOCKS = nodeNameSet([
  "LuauSparkdownElseBlock",
  "LuauElseBlock",
]);

const MATCHING_IF_BLOCK: Partial<Record<SparkdownNodeName, SparkdownNodeName>> = {
  LuauSparkdownElseBlock: "LuauSparkdownIfBlock",
  LuauElseBlock: "LuauIfBlock",
};

function isElseBlockMergeableIntoIf(
  node: GrammarSyntaxNode<SparkdownNodeName>,
  contentNode: GrammarSyntaxNode<SparkdownNodeName> | undefined,
): boolean {
  if (!MERGEABLE_ELSE_BLOCKS.has(node.name)) return false;
  if (!contentNode) return false;
  const expectedIfName = MATCHING_IF_BLOCK[node.name];
  if (!expectedIfName) return false;
  let ifBlockChild: GrammarSyntaxNode<SparkdownNodeName> | undefined;
  let child = contentNode.node.firstChild;
  while (child) {
    const isInsignificant =
      child.name === "Newline" ||
      child.name === "Whitespace" ||
      child.name === "ExtraWhitespace" ||
      child.name === "OptionalWhitespace" ||
      child.name === "RequiredWhitespace" ||
      child.name === "TrailingWhitespace";
    if (!isInsignificant) {
      if (child.name === expectedIfName && !ifBlockChild) {
        ifBlockChild = child.node as GrammarSyntaxNode<SparkdownNodeName>;
      } else {
        return false;
      }
    }
    child = child.nextSibling;
  }
  return !!ifBlockChild;
}

function isHeaderOpenerLine(
  stack: GrammarSyntaxNode<SparkdownNodeName>[],
  block: GrammarSyntaxNode<SparkdownNodeName>,
): boolean {
  const leaf = stack[0];
  if (!leaf) return false;
  if (
    leaf.name === "LuauThenKeyword" &&
    (block.name === "LuauSparkdownIfBlock" ||
      block.name === "LuauIfBlock" ||
      block.name === "LuauSparkdownElseifBlock" ||
      block.name === "LuauElseifBlock")
  ) {
    return true;
  }
  return false;
}

const CONTINUATION_OPERATOR_RULES = nodeNameSet([
  "LuauArithmeticOperator",
  "LuauCompareOperator",
  "LuauLogicalOperator",
  "LuauConcatOperator",
  "LuauTypeCastOperator",
  "LuauAccessorOperator",
]);
function isContinuationLine(
  stack: GrammarSyntaxNode<SparkdownNodeName>[],
  lineStart: number,
  source: ListSource,
): boolean {
  for (const node of stack) {
    if (!node) continue;
    if (!CONTINUATION_OPERATOR_RULES.has(node.name)) continue;
    if (node.from >= lineStart) return true;
  }
  return isCommaContinuationLine(stack, source);
}

const COMMA_CONTINUED_CONTENT = new Set<string>([
  "LuauVariableDefinition_content",
  "LuauReassignment_content",
]);

function isCommaContinuationLine(
  stack: GrammarSyntaxNode<SparkdownNodeName>[],
  source: ListSource,
): boolean {
  for (let i = 0; i < stack.length; i++) {
    const node = stack[i];
    if (!node) continue;
    if (isExplicitRuleName(node.name, "LuauCommaLineBreak")) return true;
    if (continuesReassignmentList(node, source)) return true;
    if (!COMMA_CONTINUED_CONTENT.has(stack[i + 1]?.name ?? "")) continue;
    for (let prev = node.prevSibling; prev; prev = prev.prevSibling) {
      if (isExplicitRuleName(prev.name, "LuauCommaLineBreak") && spansLineBreak(prev)) {
        return true;
      }
    }
    return false;
  }
  return false;
}
const LINE_TRIVIA = new Set(["Newline", "ExtraWhitespace", "Whitespace", "OptionalWhitespace"]);
interface ListSource {
  text: string;
  lists: Map<number, number>;
  blocks: Map<string, IndentedReading>;
}

interface IndentedReading {
  tree: Tree;
  sourceStarts: number[];
  indentedStarts: number[];
  statements: Map<number, SyntaxNode>;
}

let listParser: TextmateGrammarParser | undefined;

function beginsListEndingStatement(node: SyntaxNode): boolean {
  if (node.name === "LuauFunctionDefinition") return functionHeaderName(node) !== null;
  return node.name !== "LuauReassignment" && isStatementNodeName(node.name);
}

function functionHeaderName(node: SyntaxNode): SyntaxNode | null {
  const content = node.getChild("LuauFunctionDefinition_content");
  for (let child = content?.firstChild ?? null; child; child = child.nextSibling) {
    if (child.name === "LuauFunctionParameters") return null;
    if (child.name === "LuauFunctionDeclarationName" || isExplicitRuleName(child.name, "LuauAccessPath")) return child;
  }
  return null;
}

function listEnd(reassignment: SyntaxNode, source: ListSource): number {
  const cached = source.lists.get(reassignment.from);
  if (cached !== undefined) return cached;
  let blockStart = reassignment.from;
  for (let prev = reassignment.prevSibling; prev; prev = prev.prevSibling) blockStart = prev.from;
  let blockEnd = reassignment.to;
  for (let next = reassignment.nextSibling; next; next = next.nextSibling) blockEnd = next.to;
  const key = `${blockStart}:${blockEnd}`;
  let block = source.blocks.get(key);
  if (!block) {
    block = readIndented(source.text, blockStart, blockEnd);
    source.blocks.set(key, block);
  }
  let reading = block;
  let reassigned = sharedStatement(reassignment, source.text, block);
  if (!reassigned) {
    if (reassignment.from !== blockStart) reading = readIndented(source.text, reassignment.from, blockEnd);
    reassigned = firstNodeNamed(reading, reassignment.name);
  }
  let end = reassignment.to;
  if (reassigned) {
    const { sourceStarts, indentedStarts } = reading;
    let line = indentedStarts.length - 1;
    while (line > 0 && indentedStarts[line]! > reassigned.to) line -= 1;
    end = Math.max(end, sourceStarts[line]! + Math.max(0, reassigned.to - indentedStarts[line]!));
  }
  source.lists.set(reassignment.from, end);
  return end;
}

const LIST_PREFIX = "function __list()\n";

function readIndented(text: string, from: number, to: number): IndentedReading {
  const lines = text.slice(from, to).split("\n");
  const sourceStarts: number[] = [];
  const indentedStarts: number[] = [];
  const lineStarts = new Map<number, number>();
  let sourceAt = from;
  let indented = LIST_PREFIX;
  lines.forEach((line, i) => {
    sourceStarts.push(sourceAt);
    lineStarts.set(indented.length, i);
    const added = i === 0 ? (/^\s/.test(line) ? "" : " ") : line.trim() ? "  " : "";
    indentedStarts.push(indented.length + added.length);
    indented += added + line + "\n";
    sourceAt += line.length + 1;
  });
  indented += "end\n";
  listParser ??= createSparkdownParser();
  const tree = listParser.parse(indented);
  const statements = new Map<number, SyntaxNode>();
  const body = tree.topNode
    .getChild("LuauFunctionDefinition")
    ?.getChild("LuauFunctionDefinition_content")
    ?.getChild("LuauFunctionBody")
    ?.getChild("LuauFunctionBody_content");
  for (let child = body?.firstChild ?? null; child; child = child.nextSibling) {
    const line = lineStarts.get(child.from);
    if (line !== undefined) statements.set(line, child);
  }
  return { tree, sourceStarts, indentedStarts, statements };
}

function sharedStatement(reassignment: SyntaxNode, text: string, block: IndentedReading): SyntaxNode | null {
  const { sourceStarts } = block;
  let line = sourceStarts.length - 1;
  while (line > 0 && sourceStarts[line]! > reassignment.from) line -= 1;
  if (line === 0 && reassignment.from !== sourceStarts[0]) return null;
  if (text.slice(sourceStarts[line]!, reassignment.from).trim()) return null;
  const statement = block.statements.get(line);
  return statement?.name === reassignment.name ? statement : null;
}

function firstNodeNamed(reading: IndentedReading, name: string): SyntaxNode | null {
  let found: SyntaxNode | null = null;
  reading.tree.iterate({
    enter(node) {
      if (found) return false;
      if (node.name === name && node.from >= LIST_PREFIX.length) {
        found = node.node;
        return false;
      }
      return undefined;
    },
  });
  return found;
}

const LIST_STATEMENTS = new Set(["LuauReassignment", "LuauVariableDefinition"]);

function continuesReassignmentList(node: SyntaxNode, source: ListSource): boolean {
  if (beginsListEndingStatement(node)) return false;
  let prev = node.prevSibling;
  while (prev && !LIST_STATEMENTS.has(prev.name)) {
    if (beginsListEndingStatement(prev)) return false;
    prev = prev.prevSibling;
  }
  if (!prev) return false;
  const parts = reassignmentParts(prev).filter((part) => !LINE_TRIVIA.has(part.name));
  const last = parts[parts.length - 1];
  if (!last || !isExplicitRuleName(last.name, "LuauCommaLineBreak") || !spansLineBreak(last)) return false;
  return node.from < listEnd(prev, source);
}

function spansLineBreak(lineBreak: SyntaxNode) {
  const gap = lineBreak
    .getChild("LuauCommaLineBreak_content")
    ?.getChild("LuauCommaLineBreakGap")
    ?.getChild("LuauCommaLineBreakGap_content");
  for (let child = gap?.firstChild; child; child = child.nextSibling) {
    if (child.name === "Newline") return true;
  }
  return false;
}

function computeBlockIndent(
  stack: GrammarSyntaxNode<SparkdownNodeName>[],
): number {
  let level = 0;
  for (let i = 0; i < stack.length; i++) {
    const node = stack[i];
    if (!node) continue;
    if (!INDENTING_BLOCKS.has(node.name)) continue;

    const innerChild = stack[i - 1];
    if (!innerChild) continue;
    if (innerChild.name !== `${node.name}_content`) continue;

    const siblings = SIBLING_CLAUSES[node.name];
    if (siblings) {
      const directChild = stack[i - 2];
      if (directChild && siblings.includes(directChild.name)) continue;
    }

    if (isElseBlockMergeableIntoIf(node, stack[i - 1])) continue;

    if (ALTERNATOR_CANDIDATES.has(node.name) && !opensAlternator(node)) continue;

    const arms = stack[i - 2];
    if (arms && isExplicitRuleName(arms.name, "LuauAlternatorArms") && stack[i - 3]?.name === `${arms.name}_end`) continue;

    if (isHeaderOpenerLine(stack, node)) continue;

    level += 1;
  }
  return level;
}

const BRACE_LINES = nodeNameSet(["LuauSparkleBlockLine", "LuauStructBlockLine"]);

function findBraceLine(stack: GrammarSyntaxNode<SparkdownNodeName>[]): number {
  for (let i = stack.length - 1; i >= 0; i--) {
    const node = stack[i];
    if (node && BRACE_LINES.has(node.name)) return i;
  }
  return -1;
}

const BRACE_INDENTERS = nodeNameSet([
  "LuauSparkleElementBlock",
  "LuauStructBlockBody",
  "LuauStructListBlock",
  "LuauSparkleHandlerClosure",
  "LuauSparkleElementContinuation",
]);

function braceDepth(
  stack: GrammarSyntaxNode<SparkdownNodeName>[],
  braceLineIndex: number,
  lineStart: number,
  source: ListSource,
): number {
  const inner = stack.slice(0, braceLineIndex);
  let depth = 0;
  for (let i = 1; i < inner.length; i++) {
    const node = inner[i];
    if (!node || !BRACE_INDENTERS.has(node.name)) continue;
    if (inner[i - 1]?.name !== `${node.name}_content`) continue;
    depth += 1;
  }
  depth += computeBlockIndent(inner);
  if (isContinuationLine(inner, lineStart, source)) depth += 1;
  return depth;
}

function continuationAfterComments(
  document: SparkdownDocument,
  tree: Tree,
  line: number,
): { end: number; continues: boolean } {
  for (let l = line + 1; l < document.lineCount; l++) {
    const text = document.getLineText(l);
    const first = text.search(/\S/);
    if (first < 0) continue;
    const rest = text.slice(first);
    if (rest.startsWith("--") || rest.startsWith("//")) continue;
    const lineStart = document.offsetAt({ line: l, character: 0 });
    const pos = lineStart + first;
    const continues = getStack<SparkdownNodeName>(tree, pos, 1).some(
      (n) =>
        n?.name === "LuauSparkleElementContinuation" && n.from >= lineStart,
    );
    return { end: l, continues };
  }
  return { end: document.lineCount, continues: false };
}

function sceneSpans(
  tree: Tree,
): { from: number; to: number; closed: boolean }[] {
  const spans: { from: number; to: number; closed: boolean }[] = [];
  const open: { kind: "scene" | "branch"; from: number }[] = [];
  const setAsideScene = (to: number) => {
    const scene = open.find((entry) => entry.kind === "scene");
    if (scene) spans.push({ from: scene.from, to, closed: false });
    open.length = 0;
  };
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (node.name === "Scene") {
      setAsideScene(node.from);
      open.push({ kind: "scene", from: node.from });
    } else if (node.name === "Branch") {
      while (open.length > 0 && open.at(-1)!.kind !== "scene") open.pop();
      open.push({ kind: "branch", from: node.from });
    } else if (node.name === "LuauEndKeyword") {
      const closed = open.pop();
      if (closed?.kind === "scene") {
        spans.push({ from: closed.from, to: node.to, closed: true });
      }
    }
  }
  setAsideScene(tree.length);
  return spans;
}

const isInRange = (
  document: SparkdownDocument,
  innerRange: Range,
  outerRange: Range | Position,
) => {
  if ("start" in outerRange) {
    return (
      document.offsetAt(innerRange.start) >=
        document.offsetAt(outerRange.start) &&
      document.offsetAt(innerRange.end) <= document.offsetAt(outerRange.end)
    );
  }
  return document.offsetAt(innerRange.start) >= document.offsetAt(outerRange);
};

export const getFormatting = (
  document: SparkdownDocument | undefined,
  tree: Tree | undefined,
  annotations: SparkdownAnnotations,
  options: FormattingOptions,
  formattingRange?: Range | Position,
  formattingOnType?: Position,
  incrementalDirtyRange?: { from: number; to: number },
) => {
  const edits: (TextEdit & {
    lineNumber: number;
    oldText: string;
    type: string;
  })[] = [];

  if (!document) {
    return {};
  }

  const lines: { range: Range; text: string }[] = [];

  let sceneActive = false;
  let branchActive = false;
  let scenes: { from: number; to: number; closed: boolean }[] | undefined;
  const sceneAt = (pos: number) => {
    if (!tree) return undefined;
    scenes ??= sceneSpans(tree);
    return scenes.find((span) => span.from < pos && pos < span.to);
  };
  const endsSceneBody = (pos: number) => !sceneAt(pos)?.closed;

  let sparkleContentFrom: number | undefined = undefined;
  let braceLineLevels = new Map<number, number>();
  let lastElementLevel: number | undefined = undefined;
  let commentRun: { start: number; end: number; continues: boolean } | null =
    null;

  let tempIndentLevel: number | undefined = undefined;
  let matchNextIndentLevel: { from: number; to: number } | undefined =
    undefined;
  let indentsToProcessLater: { from: number; to: number }[] = [];

  const pushIfInRange = (
    edit: TextEdit & { lineNumber: number; oldText: string; type: string },
  ) => {
    if (
      formattingOnType ||
      !formattingRange ||
      isInRange(document, edit.range, formattingRange)
    ) {
      edits.push(edit);
    }
  };

  const ensureBlankLineBefore = (pos: number) => {
    const line = document.positionAt(pos).line;
    if (line <= 0) return;
    const prevLine = document.getLineText(line - 1).trim();
    if (!prevLine) return;
    if (prevLine.startsWith("--")) return;
    const insertPos: Position = { line, character: 0 };
    pushIfInRange({
      lineNumber: line + 1,
      range: { start: insertPos, end: insertPos },
      oldText: "",
      newText: "\n",
      type: "blankline_insert",
    });
  };

  const listSource: ListSource = { text: document.getText(), lists: new Map(), blocks: new Map() };

  const processIndent = (from: number, to: number) => {
    if (from === to && from >= document.length) {
      return;
    }
    const range = document.range(from, to);
    const text = document.read(from, to);
    const indentMatch = text.match(INDENT_REGEX);
    const currentIndentation = indentMatch?.[0] || "";
    const indentRange = {
      start: { line: range.start.line, character: range.start.character },
      end: {
        line: range.start.line,
        character: currentIndentation.length,
      },
    };

    let newIndentLevel = tempIndentLevel ?? 0;
    tempIndentLevel = undefined;

    if (tree) {
      const lineStart = document.offsetAt({
        line: range.start.line,
        character: 0,
      });
      const lineEnd = document.offsetAt({
        line: range.start.line + 1,
        character: 0,
      });
      if (insideNode(tree, lineStart, STRING_NODE_REGEX)) return;
      const lineText = document.read(lineStart, lineEnd);
      const firstNonWs = lineText.search(/\S/);
      const stackPos = firstNonWs >= 0 ? lineStart + firstNonWs : from;
      const stack = getStack<SparkdownNodeName>(tree, stackPos, 1);

      const sparkleContentNode =
        firstNonWs >= 0
          ? stack.find(
              (n) =>
                n &&
                (n.name === "LuauStyle_content" ||
                  n.name === "LuauLayout_content" ||
                  n.name === "LuauScreen_content" ||
                  n.name === "LuauComponent_content" ||
                  n.name === "LuauAnimation_content" ||
                  n.name === "LuauTheme_content" ||
                  n.name === "LuauMorph_content"),
            )
          : undefined;
      if (sparkleContentNode) {
        const emitLevel = (level: number) => {
          const expectedIndentation = options.insertSpaces
            ? " ".repeat(level * options.tabSize)
            : "\t".repeat(level);
          if (currentIndentation !== expectedIndentation) {
            pushIfInRange({
              lineNumber: indentRange.start.line + 1,
              range: indentRange,
              oldText: document.getText(indentRange),
              newText: expectedIndentation,
              type: "indent",
            });
          }
        };
        const bodyLevel =
          computeBlockIndent(stack) +
          1 +
          (sceneActive ? 1 : 0) +
          (branchActive ? 1 : 0);
        if (sparkleContentFrom !== sparkleContentNode.from) {
          sparkleContentFrom = sparkleContentNode.from;
          braceLineLevels = new Map();
          lastElementLevel = undefined;
        }
        const trimmedLine = lineText.trimStart();
        const isCommentLine =
          trimmedLine.startsWith("--") || trimmedLine.startsWith("//");
        let commentsContinuation = false;
        if (isCommentLine) {
          const line = range.start.line;
          if (!commentRun || line < commentRun.start || line >= commentRun.end) {
            commentRun = {
              start: line,
              ...continuationAfterComments(document, tree, line),
            };
          }
          commentsContinuation = commentRun.continues;
        }
        const braceLineIndex = findBraceLine(stack);
        const braceLine =
          braceLineIndex >= 0 ? stack[braceLineIndex] : undefined;
        if (braceLine && braceLineIndex >= 0) {
          const depth = braceDepth(stack, braceLineIndex, lineStart, listSource);
          if (braceLine.from < lineStart) {
            const base = braceLineLevels.get(braceLine.from);
            if (base != null) {
              emitLevel(base + depth + (commentsContinuation ? 1 : 0));
            }
            return;
          }
          if (
            braceLine.name === "LuauSparkleBlockLine" &&
            (lineText[firstNonWs] === "{" ||
              stack.some(
                (n, i) =>
                  i < braceLineIndex &&
                  n?.name === "LuauSparkleElementContinuation",
              ))
          ) {
            const base = lastElementLevel ?? bodyLevel;
            braceLineLevels.set(braceLine.from, base);
            emitLevel(base + depth);
            return;
          }
        }
        if (commentsContinuation && lastElementLevel != null) {
          emitLevel(lastElementLevel + 1);
          return;
        }
        if (braceLine) braceLineLevels.set(braceLine.from, bodyLevel);
        if (!isCommentLine) lastElementLevel = bodyLevel;
        emitLevel(bodyLevel);
        return;
      }

      newIndentLevel = computeBlockIndent(stack);
      if (isContinuationLine(stack, lineStart, listSource)) {
        newIndentLevel += 1;
      }

      if (firstNonWs < 0) {
        const expectedIndentation = "";
        if (currentIndentation !== expectedIndentation) {
          pushIfInRange({
            lineNumber: indentRange.start.line + 1,
            range: indentRange,
            oldText: document.getText(indentRange),
            newText: expectedIndentation,
            type: "indent",
          });
        }
        return;
      }

      const leaf = stack[0];
      const isStrayEnd =
        !!leaf &&
        leaf.name === "LuauEndKeyword" &&
        !stack.some(
          (n, i) =>
            i > 0 &&
            n &&
            (INDENTING_BLOCKS.has(n.name) ||
              n.name.endsWith("_content") ||
              n.name.endsWith("_end")),
        );
      if (isStrayEnd) {
        if (branchActive) {
          branchActive = false;
        } else if (sceneActive) {
          sceneActive = false;
        }
      }

      newIndentLevel += sceneActive ? 1 : 0;
      newIndentLevel += branchActive ? 1 : 0;
      newIndentLevel += countChoiceBodies(stack);

      const frontMatterNode = stack.find(
        (n) => n && n.name === "FrontMatter",
      );
      if (frontMatterNode) {
        const unknownNode = stack.find((n) => n && n.name === "Unknown");
        const frontMatterFieldContentNode = stack.find(
          (n) => n && n.name === "FrontMatterField_content",
        );
        if (unknownNode) {
          newIndentLevel = currentIndentation.includes("\t")
            ? Math.max(0, currentIndentation.split("\t").length - 1)
            : Math.round(currentIndentation.length / options.tabSize);
        } else {
          newIndentLevel = frontMatterFieldContentNode ? 1 : 0;
        }
      }
    }

    const validIndentLevel = Math.max(0, newIndentLevel);
    const expectedIndentation = options.insertSpaces
      ? " ".repeat(validIndentLevel * options.tabSize)
      : "\t".repeat(validIndentLevel);
    if (currentIndentation !== expectedIndentation) {
      pushIfInRange({
        lineNumber: indentRange.start.line + 1,
        range: indentRange,
        oldText: document.getText(indentRange),
        newText: expectedIndentation,
        type: "indent",
      });
    }
  };

  let iterStart = 0;
  let reachesDocEnd = true;
  let treeIterFrom: number | undefined;
  let treeIterTo: number | undefined;
  if (
    incrementalDirtyRange &&
    document.length > 0 &&
    !formattingRange &&
    !formattingOnType
  ) {
    const boundaries: number[] = [];
    const b = annotations.formatting.iter();
    while (b.value) {
      if (
        b.value.type === "scene_begin" ||
        (b.value.type === "top_level_begin" &&
          !sceneAt(b.from) &&
          document.positionAt(b.from).character === 0 &&
          !/\s/.test(document.read(b.from, b.from + 1)))
      ) {
        boundaries.push(b.from);
      }
      b.next();
    }
    let from = 0;
    for (const off of boundaries) {
      if (off <= incrementalDirtyRange.from) {
        from = off;
      } else {
        break;
      }
    }
    let to = document.length;
    for (const off of boundaries) {
      if (off > incrementalDirtyRange.to) {
        to = off;
        break;
      }
    }
    iterStart = from;
    reachesDocEnd = to >= document.length;
    treeIterFrom = from;
    treeIterTo = to;
    formattingRange = {
      start: document.positionAt(from),
      end: document.positionAt(to),
    };
  }

  const formattingTo = formattingRange
    ? "end" in formattingRange
      ? document.offsetAt(formattingRange.end)
      : document.length
    : undefined;

  const insertsSpaceAt = new Set<number>();
  const separatorAt = new Set<number>();
  const insertCur = annotations.formatting.iter(iterStart);
  while (insertCur.value) {
    if (formattingTo != null && insertCur.from > formattingTo) break;
    if (insertCur.from === insertCur.to) {
      if (insertCur.value.type === "keyword_separator") {
        insertsSpaceAt.add(insertCur.from);
      } else if (insertCur.value.type === "separator") {
        separatorAt.add(insertCur.from);
      }
    }
    insertCur.next();
  }
  const charBefore = (from: number) => {
    const char =
      Array.from(document.read(Math.max(0, from - 2), from)).pop() ?? "";
    return char === "." && document.read(from - 3, from) === "..." ? "_" : char;
  };
  const charAfter = (to: number) => {
    const char = Array.from(document.read(to, to + 2))[0] ?? "";
    return char === "." && document.read(to, to + 3) === "..." ? "_" : char;
  };
  const insertsSeparatorSpace = (from: number, to: number) =>
    shouldInsertSpaceBetween(charBefore(from), charAfter(to));
  const separatorKeepsSpace = (from: number, to: number) =>
    from !== to &&
    (separatorAt.has(from) || separatorAt.has(to)) &&
    insertsSeparatorSpace(from, to);
  const keepsJoiningSpace = (from: number, to: number) => {
    if (from === to || insertsSpaceAt.has(from) || insertsSpaceAt.has(to)) {
      return false;
    }
    const nextChar = charAfter(to);
    const prevChar = charBefore(from);
    return mustKeepSpaceBetween(
      prevChar,
      nextChar,
      (isNameChar(nextChar) || nextChar === ".") &&
        endsNumberAt(tree, from),
    );
  };

  const cur = annotations.formatting.iter(iterStart);
  const aheadCur = annotations.formatting.iter(iterStart);
  aheadCur.next();

  while (cur.value) {
    if (formattingTo != null && cur.from > formattingTo) {
      break;
    }
    while (aheadCur.value) {
      if (aheadCur.value.type === "sol_comment") {
        if (!matchNextIndentLevel) {
          matchNextIndentLevel = { from: aheadCur.from, to: aheadCur.to };
        }
        let line = document.range(aheadCur.from, aheadCur.to).end.line;
        if (!document.getLineText(line + 1).trim()) {
          line += 1;
          while (
            line < document.lineCount &&
            !document.getLineText(line).trim()
          ) {
            line += 1;
          }
          matchNextIndentLevel.to = document.offsetAt(
            document.getLineRange(line - 1).end,
          );
        }
      } else if (aheadCur.value.type === "scene_begin") {
        sceneActive = false;
        branchActive = false;
      } else if (aheadCur.value.type === "branch_begin") {
        branchActive = false;
      } else if (
        aheadCur.value.type === "top_level_begin" &&
        endsSceneBody(aheadCur.from)
      ) {
        sceneActive = false;
        branchActive = false;
      }
      break;
    }

    const range = document.range(cur.from, cur.to);
    if (cur.value.type === "indent") {
      if (!matchNextIndentLevel || cur.from >= matchNextIndentLevel.to) {
        for (const indent of indentsToProcessLater) {
          processIndent(indent.from, indent.to);
        }
        processIndent(cur.from, cur.to);
        matchNextIndentLevel = undefined;
        indentsToProcessLater.length = 0;
      } else if (matchNextIndentLevel) {
        indentsToProcessLater.push({ from: cur.from, to: cur.to });
      }
    } else if (cur.value.type === "separator") {
      const atLineStart =
        range.start.character === 0 && cur.from === cur.to;
      let expectedText: string;
      if (atLineStart) {
        expectedText = "";
      } else {
        expectedText =
          insertsSeparatorSpace(cur.from, cur.to) ||
          keepsJoiningSpace(cur.from, cur.to)
            ? " "
            : "";
      }
      if (cur.from === cur.to && expectedText === "") {
      } else {
        const text = document.getText(range);
        if (text !== expectedText) {
          pushIfInRange({
            lineNumber: range.start.line + 1,
            range,
            oldText: document.getText(range),
            newText: expectedText,
            type: cur.value.type,
          });
        }
      }
    } else if (cur.value.type === "keyword_separator") {
      const text = document.getText(range);
      const expectedText = " ";
      if (text !== expectedText) {
        pushIfInRange({
          lineNumber: range.start.line + 1,
          range,
          oldText: document.getText(range),
          newText: expectedText,
          type: cur.value.type,
        });
      }
    } else if (cur.value.type === "extra") {
      const text = document.getText(range);
      const expectedText =
        keepsJoiningSpace(cur.from, cur.to) ||
        separatorKeepsSpace(cur.from, cur.to)
          ? " "
          : "";
      if (text !== expectedText) {
        pushIfInRange({
          lineNumber: range.start.line + 1,
          range,
          oldText: document.getText(range),
          newText: expectedText,
          type: cur.value.type,
        });
      }
    } else if (cur.value.type === "trailing") {
      const text = document.getText(range);
      const expectedText = "";
      if (options.trimTrailingWhitespace && text !== expectedText) {
        pushIfInRange({
          lineNumber: range.start.line + 1,
          range,
          oldText: document.getText(range),
          newText: expectedText,
          type: cur.value.type,
        });
      }
    } else if (cur.value.type === "choice_mark") {
      const text = document.getText(range);
      const marks = text.split(WHITESPACE_REGEX).filter((m) => Boolean(m));
      const expectedText = marks.join(" ") + " ";
      if (text !== expectedText) {
        const editRange = {
          start: {
            line: range.start.line,
            character: range.start.character + 1,
          },
          end: range.end,
        };
        pushIfInRange({
          lineNumber: editRange.start.line + 1,
          range: editRange,
          oldText: document.getText(editRange),
          newText: expectedText.slice(1),
          type: cur.value.type,
        });
      }
    } else if (cur.value.type === "eol_divert") {
      if (
        !document
          .getLineText(document.range(cur.from, cur.to).start.line + 1)
          .trim()
      ) {
        tempIndentLevel = 0;
      }
    } else if (cur.value.type === "scene_begin") {
      sceneActive = true;
      ensureBlankLineBefore(cur.from);
    } else if (cur.value.type === "top_level_begin") {
      if (endsSceneBody(cur.from)) ensureBlankLineBefore(cur.from);
    } else if (cur.value.type === "branch_begin") {
      branchActive = true;
    } else if (cur.value.type === "newline") {
      const range = document.range(cur.from, cur.to);
      const lineRange = document.getLineRange(range.start.line);
      const text = document.getText(lineRange);
      const prevLine = lines.at(-1);
      if (!text.trim()) {
        if (formattingOnType?.line !== range.start.line) {
          if (prevLine && !prevLine.text.trim()) {
            const deleteRange: Range = {
              start: lineRange.start,
              end: { line: lineRange.start.line + 1, character: 0 },
            };
            pushIfInRange({
              lineNumber: lineRange.start.line + 1,
              range: deleteRange,
              oldText: document.getText(deleteRange),
              newText: "",
              type: "blankline",
            });
          }
        }
      }
      lines.push({ text, range: lineRange });
    }
    cur.next();
    aheadCur.next();
  }

  const lastPosition = document.positionAt(Number.MAX_VALUE);

  if (
    reachesDocEnd &&
    options.insertFinalNewline &&
    formattingOnType?.line !== lastPosition.line
  ) {
    const lastChar =
      document.length > 0
        ? document.read(document.length - 1, document.length)
        : "";
    if (/\S/.test(document.getText()) && lastChar !== "\n" && lastChar !== "\r") {
      const editRange = {
        start: lastPosition,
        end: lastPosition,
      };
      pushIfInRange({
        lineNumber: editRange.start.line + 1,
        range: editRange,
        oldText: document.getText(editRange),
        newText: "\n",
        type: "newline",
      });
    }

    if (options.trimFinalNewlines) {
      let lastLine = lines.pop();
      while (lastLine && !lastLine.text.trim()) {
        const editRange: Range = {
          start: lastLine.range.start,
          end: { line: lastLine.range.start.line + 1, character: 0 },
        };
        pushIfInRange({
          lineNumber: editRange.start.line + 1,
          range: editRange,
          oldText: document.getText(editRange),
          newText: "",
          type: "newline",
        });
        lastLine = lines.pop();
      }
    }
  }

  if (tree) {
    tree.iterate({
      from: treeIterFrom,
      to: treeIterTo,
      enter: (nodeRef) => {
        if (!MERGEABLE_ELSE_BLOCKS.has(nodeRef.name as SparkdownNodeName))
          return;
        const elseNode = nodeRef.node;
        let beginNode, contentNode, endNode;
        let child = elseNode.firstChild;
        while (child) {
          if (child.name.endsWith("_begin")) beginNode = child;
          else if (child.name.endsWith("_content")) contentNode = child;
          else if (child.name.endsWith("_end")) endNode = child;
          child = child.nextSibling;
        }
        if (!beginNode || !contentNode) return;
        void endNode;
        const expectedIfName =
          MATCHING_IF_BLOCK[nodeRef.name as SparkdownNodeName] ?? "";
        let innerIfNode;
        let c = contentNode.firstChild;
        while (c) {
          const insignificant =
            c.name === "Newline" ||
            c.name === "Whitespace" ||
            c.name === "ExtraWhitespace" ||
            c.name === "OptionalWhitespace" ||
            c.name === "RequiredWhitespace" ||
            c.name === "TrailingWhitespace";
          if (!insignificant) {
            if (c.name === expectedIfName && !innerIfNode) {
              innerIfNode = c;
            } else {
              return;
            }
          }
          c = c.nextSibling;
        }
        if (!innerIfNode) return;
        type Span = { from: number; to: number };
        let elseKeyword: Span | undefined;
        let innerIfKeyword: Span | undefined;
        let innerEndKeyword: Span | undefined;
        beginNode.cursor().iterate((inner) => {
          if (inner.name === "LuauElseKeyword") {
            elseKeyword = { from: inner.from, to: inner.to };
            return false;
          }
          return true;
        });
        let innerEndChild;
        let ec = innerIfNode.firstChild;
        while (ec) {
          if (ec.name.endsWith("_end")) {
            innerEndChild = ec;
            break;
          }
          ec = ec.nextSibling;
        }
        if (!innerEndChild) return;
        innerIfNode.cursor().iterate((inner) => {
          if (innerIfKeyword) return false;
          if (inner.name === "LuauIfKeyword") {
            innerIfKeyword = { from: inner.from, to: inner.to };
            return false;
          }
          return true;
        });
        innerEndChild.cursor().iterate((inner) => {
          if (inner.name === "LuauEndKeyword") {
            innerEndKeyword = { from: inner.from, to: inner.to };
            return false;
          }
          return true;
        });
        if (!elseKeyword || !innerIfKeyword || !innerEndKeyword) return;
        const elseLine = document.positionAt(elseKeyword.from).line;
        const elseLineStart = document.offsetAt({
          line: elseLine,
          character: 0,
        });
        const elsePrelude = document.read(elseLineStart, elseKeyword.from);
        const elsePreludeIsAllWs = /^[ \t]*$/.test(elsePrelude);
        const elseStack = getStack<SparkdownNodeName>(
          tree,
          elseKeyword.from,
          1,
        );
        const indentLevel = computeBlockIndent(elseStack);
        const indentChars = options.insertSpaces
          ? " ".repeat(indentLevel * options.tabSize)
          : "\t".repeat(indentLevel);
        const joinFrom = elsePreludeIsAllWs
          ? elseLineStart
          : elseKeyword.from;
        const joinPrefix = elsePreludeIsAllWs ? indentChars : "";
        const joinRange: Range = {
          start: document.positionAt(joinFrom),
          end: document.positionAt(innerIfKeyword.to),
        };
        pushIfInRange({
          lineNumber: joinRange.start.line + 1,
          range: joinRange,
          oldText: document.getText(joinRange),
          newText: joinPrefix + "elseif",
          type: "elseif_join",
        });
        const endLine = document.positionAt(innerEndKeyword.from).line;
        const lineStart: Position = { line: endLine, character: 0 };
        const nextLineStart: Position = { line: endLine + 1, character: 0 };
        const lineRange: Range = { start: lineStart, end: nextLineStart };
        pushIfInRange({
          lineNumber: endLine + 1,
          range: lineRange,
          oldText: document.getText(lineRange),
          newText: "",
          type: "elseif_drop_end",
        });
      },
    });
    const EMPTY_COMPACTABLE_BLOCKS = nodeNameSet([
      "LuauFunctionDefinition",
      "LuauDefine",
      "LuauMethodDefinition",
    ]);
    tree.iterate({
      from: treeIterFrom,
      to: treeIterTo,
      enter: (nodeRef) => {
        if (!EMPTY_COMPACTABLE_BLOCKS.has(nodeRef.name)) return;
        const node = nodeRef.node;
        let contentNode, endNode;
        let child = node.firstChild;
        while (child) {
          if (child.name === `${nodeRef.name}_content`) contentNode = child;
          else if (child.name === `${nodeRef.name}_end`) endNode = child;
          child = child.nextSibling;
        }
        if (!contentNode || !endNode) return;
        if (endNode.from === endNode.to) return;
        const SIGNATURE_NAMES = nodeNameSet([
          "LuauFunctionParameters",
          "LuauFunctionReturnType",
          "LuauFunctionDeclarationName",
          "LuauDefineNameAndInheritance",
        ]);
        let signatureEnd: number | undefined;
        let bodyHasContent = false;
        const isInsignificant = (name: string): boolean =>
          name === "Newline" ||
          name === "Whitespace" ||
          name === "ExtraWhitespace" ||
          name === "OptionalWhitespace" ||
          name === "RequiredWhitespace" ||
          name === "TrailingWhitespace";
        let cc = contentNode.firstChild;
        while (cc) {
          if (SIGNATURE_NAMES.has(cc.name)) {
            signatureEnd =
              cc.from + document.read(cc.from, cc.to).trimEnd().length;
          } else if (cc.name === "LuauFunctionBody") {
            let bb = cc.firstChild;
            while (bb) {
              if (bb.name === "LuauFunctionBody_content") {
                let bc = bb.firstChild;
                while (bc) {
                  if (!isInsignificant(bc.name) && signatureEnd != null) {
                    bodyHasContent = true;
                    break;
                  }
                  bc = bc.nextSibling;
                }
              }
              if (bodyHasContent) break;
              bb = bb.nextSibling;
            }
            if (bodyHasContent) break;
          } else if (!isInsignificant(cc.name) && signatureEnd != null) {
            bodyHasContent = true;
            break;
          }
          cc = cc.nextSibling;
        }
        if (bodyHasContent) return;
        if (signatureEnd == null) signatureEnd = contentNode.from;
        const replaceFrom = signatureEnd;
        const endText = document.read(endNode.from, endNode.to);
        const replaceTo = endNode.from + endText.length - endText.trimStart().length;
        if (replaceFrom >= replaceTo) return;
        const text = document.read(replaceFrom, replaceTo);
        if (text === " ") return;
        if (text.trim() !== "") return;
        const range: Range = {
          start: document.positionAt(replaceFrom),
          end: document.positionAt(replaceTo),
        };
        pushIfInRange({
          lineNumber: range.start.line + 1,
          range,
          oldText: document.getText(range),
          newText: " ",
          type: "empty_block_compact",
        });
      },
    });
    const BLOCK_OPENER_KEYWORDS = nodeNameSet(["LuauDoKeyword", "LuauThenKeyword"]);
    const afterLineComment = (pos: number) => {
      for (let n: SyntaxNode | null = tree.resolveInner(pos, -1); n; n = n.parent) {
        if (/Comment$/.test(n.name)) {
          return !/^--\[=*\[/.test(document.read(n.from, n.to));
        }
      }
      return false;
    };
    const afterKeywordOrOperator = (from: number, to: number) => {
      for (
        let n: SyntaxNode | null = tree.resolveInner(from, -1);
        n && n.to <= to;
        n = n.parent
      ) {
        if (/(?:Keyword|Operator)$/.test(n.name)) return true;
      }
      return false;
    };
    const LOOP_CONTENT_NAMES = nodeNameSet([
      "LuauSparkdownForLoop_content",
      "LuauSparkdownWhileLoop_content",
      "LuauSparkdownRepeatLoop_content",
      "LuauForLoop_content",
      "LuauWhileLoop_content",
      "LuauRepeatLoop_content",
    ]);
    tree.iterate({
      from: treeIterFrom,
      to: treeIterTo,
      enter: (nodeRef) => {
        if (!BLOCK_OPENER_KEYWORDS.has(nodeRef.name)) return;
        if (nodeRef.name === "LuauThenKeyword") {
          let walker = nodeRef.node.parent;
          let isChooseThen = false;
          while (walker) {
            if (walker.name === "LuauSparkdownChooseThenClause") {
              isChooseThen = true;
              break;
            }
            if (
              walker.name === "LuauSparkdownIfBlock" ||
              walker.name === "LuauIfBlock" ||
              walker.name === "LuauSparkdownElseifBlock" ||
              walker.name === "LuauElseifBlock"
            ) {
              break;
            }
            walker = walker.parent;
          }
          if (isChooseThen) return;
        }
        const kwFrom = nodeRef.from;
        let headerStart: number | undefined;
        if (nodeRef.name === "LuauThenKeyword") {
          let walker = nodeRef.node.parent;
          while (walker) {
            if (isExplicitRuleName(walker.name, "LuauTernaryExpression")) {
              return;
            }
            if (
              walker.name === "LuauSparkdownIfBlock" ||
              walker.name === "LuauSparkdownElseifBlock"
            ) {
              return;
            }
            if (
              walker.name === "LuauIfBlock" ||
              walker.name === "LuauElseifBlock"
            ) {
              let c = walker.firstChild;
              while (c) {
                if (c.name.endsWith("_begin")) {
                  headerStart = c.to;
                  break;
                }
                c = c.nextSibling;
              }
              break;
            }
            walker = walker.parent;
          }
        } else {
          let walker = nodeRef.node.parent;
          while (walker) {
            if (
              walker.name === "LuauSparkdownDoBlock" ||
              walker.name === "LuauSparkdownForLoop" ||
              walker.name === "LuauSparkdownWhileLoop" ||
              walker.name === "LuauSparkdownRepeatLoop" ||
              walker.name === "LuauSparkleDoMark"
            ) {
              return;
            }
            if (
              walker.name === "LuauForLoop" ||
              walker.name === "LuauWhileLoop" ||
              walker.name === "LuauRepeatLoop"
            ) {
              let c = walker.firstChild;
              while (c) {
                if (c.name.endsWith("_begin")) {
                  headerStart = c.to;
                  break;
                }
                c = c.nextSibling;
              }
              break;
            }
            walker = walker.parent;
          }
          if (headerStart == null) {
            const kwLine = document.positionAt(kwFrom).line;
            const STATEMENT_STARTERS = [
              "local ",
              "function ",
              "define ",
              "scene ",
              "branch ",
              "const ",
              "store ",
              "return ",
              "if ",
              "if",
              "end",
              "do",
              "else",
              "elseif ",
              "elseif",
            ];
            for (let line = kwLine - 1; line >= 0 && line > kwLine - 10; line--) {
              const text = document.getLineText(line);
              const trimmed = text.trim();
              if (trimmed === "") continue;
              if (
                trimmed.startsWith("for ") ||
                trimmed.startsWith("while ") ||
                trimmed.startsWith("repeat ") ||
                trimmed === "for" ||
                trimmed === "while" ||
                trimmed === "repeat"
              ) {
                const lineStart = document.offsetAt({
                  line,
                  character: 0,
                });
                const kwIdx = text.search(/\S/);
                const kwMatch = text
                  .slice(kwIdx)
                  .match(/^(for|while|repeat)\b/);
                if (kwMatch) {
                  headerStart = lineStart + kwIdx + kwMatch[0].length;
                }
                break;
              }
              if (
                STATEMENT_STARTERS.some(
                  (s) => trimmed === s.trim() || trimmed.startsWith(s),
                )
              ) {
                break;
              }
            }
          }
        }
        if (headerStart == null) return;
        if (headerStart >= kwFrom) return;

        const between = document.read(headerStart, kwFrom);
        if (!between.includes("\n")) return;

        const breaks: { from: number; to: number; newText: string }[] = [];
        for (const run of between.matchAll(/\s+/g)) {
          if (!run[0].includes("\n")) continue;
          const from = headerStart + run.index;
          const to = from + run[0].length;
          if (insideNode(tree, from, LITERAL_NODE_REGEX)) continue;
          if (afterLineComment(from)) return;
          const spaced =
            afterKeywordOrOperator(from, to) ||
            ["..", "::"].includes(document.read(to, to + 2)) ||
            insertsSeparatorSpace(from, to) ||
            keepsJoiningSpace(from, to);
          breaks.push({ from, to, newText: spaced ? " " : "" });
        }
        if (breaks.length === 0) return;

        const HEADER_LINE_BUDGET = 100;
        const headerKwLine = document.positionAt(headerStart).line;
        const headerLineStart = document.offsetAt({
          line: headerKwLine,
          character: 0,
        });
        const openerEnd = nodeRef.to;
        const wouldBe = document
          .read(headerLineStart, openerEnd)
          .replace(/\s+/g, " ");
        if (wouldBe.length > HEADER_LINE_BUDGET) return;

        for (const { from, to, newText } of breaks) {
          const range: Range = {
            start: document.positionAt(from),
            end: document.positionAt(to),
          };
          pushIfInRange({
            lineNumber: range.start.line + 1,
            range,
            oldText: document.getText(range),
            newText,
            type: "opener_join",
          });
        }
      },
    });
    tree.iterate({
      from: treeIterFrom,
      to: treeIterTo,
      enter: (nodeRef) => {
        if (nodeRef.name !== "LuauSingleQuotedString") return;
        const node = nodeRef.node;
        let beginNode, contentNode, endNode;
        let child = node.firstChild;
        while (child) {
          if (child.name.endsWith("_begin")) beginNode = child;
          else if (child.name.endsWith("_content")) contentNode = child;
          else if (child.name.endsWith("_end")) endNode = child;
          child = child.nextSibling;
        }
        if (!beginNode || !contentNode || !endNode) return;
        const contentText = document.read(contentNode.from, contentNode.to);
        if (contentText.includes('"')) return;
        const newContent = contentText.split("\\'").join("'");
        if (document.read(endNode.from, endNode.from + 1) !== "'") return;
        const range: Range = {
          start: document.positionAt(node.from),
          end: document.positionAt(endNode.from + 1),
        };
        pushIfInRange({
          lineNumber: range.start.line + 1,
          range,
          oldText: document.getText(range),
          newText: `"${newContent}"`,
          type: "quote_normalize",
        });
      },
    });
    tree.iterate({
      from: treeIterFrom,
      to: treeIterTo,
      enter: (nodeRef) => {
        if (!isExplicitRuleName(nodeRef.name, "LuauTable")) return;
        const tableNode = nodeRef.node;
        if (document.read(tableNode.from, tableNode.from + 1) !== "{") return;
        if (document.read(tableNode.to - 1, tableNode.to) !== "}") return;
        const contentFrom = tableNode.from + 1;
        const contentTo = tableNode.to - 1;
        const contentText = document.read(contentFrom, contentTo);
        if (!contentText.trim()) return;
        const isMultiline = contentText.includes("\n");
        let lastNonWs = contentText.length - 1;
        while (
          lastNonWs >= 0 &&
          (contentText[lastNonWs] === " " ||
            contentText[lastNonWs] === "\t" ||
            contentText[lastNonWs] === "\n" ||
            contentText[lastNonWs] === "\r")
        ) {
          lastNonWs -= 1;
        }
        if (lastNonWs < 0) return;
        const hasTrailingComma = contentText[lastNonWs] === ",";
        const lastNonWsOffset = contentFrom + lastNonWs;
        if (isMultiline && !hasTrailingComma) {
          const insertFrom = lastNonWsOffset + 1;
          let insertTo = insertFrom;
          while (
            insertTo < contentText.length + contentFrom &&
            (contentText[insertTo - contentFrom] === " " ||
              contentText[insertTo - contentFrom] === "\t")
          ) {
            insertTo += 1;
          }
          const range: Range = {
            start: document.positionAt(insertFrom),
            end: document.positionAt(insertTo),
          };
          pushIfInRange({
            lineNumber: range.start.line + 1,
            range,
            oldText: document.getText(range),
            newText: ",",
            type: "trailing_comma_insert",
          });
        } else if (!isMultiline && hasTrailingComma) {
          const commaIdx = lastNonWs;
          let leftBound = commaIdx;
          while (
            leftBound > 0 &&
            (contentText[leftBound - 1] === " " ||
              contentText[leftBound - 1] === "\t")
          ) {
            leftBound -= 1;
          }
          let rightBound = commaIdx + 1;
          while (
            rightBound < contentText.length &&
            (contentText[rightBound] === " " ||
              contentText[rightBound] === "\t")
          ) {
            rightBound += 1;
          }
          const range: Range = {
            start: document.positionAt(contentFrom + leftBound),
            end: document.positionAt(contentFrom + rightBound),
          };
          const reachesClose = contentFrom + rightBound === contentTo;
          const spaced =
            reachesClose &&
            oneLineTableBraces(tableNode, (from, to) =>
              document.read(from, to),
            ) != null;
          pushIfInRange({
            lineNumber: range.start.line + 1,
            range,
            oldText: document.getText(range),
            newText: spaced ? " " : "",
            type: "trailing_comma_delete",
          });
        }
      },
    });
  }

  edits.sort(
    (a, b) =>
      document.offsetAt(a.range.start) - document.offsetAt(b.range.start),
  );

  return {
    edits,
    lines,
    indentStack: [] as { type: FormatType; level: number }[],
    indentLevel: 0,
  };
};

const PRECEDENCE: Record<string, number> = {
  trailing_comma_insert: 100,
  trailing_comma_delete: 100,
  quote_normalize: 100,
  crlf_normalize: 100,
  empty_block_compact: 100,
  opener_join: 110,
  elseif_join: 110,
  elseif_drop_end: 110,
  choice_mark: 100,
  blankline_insert: 100,
  blankline: 90,
  newline: 90,
  indent: 80,
  keyword_separator: 70,
  separator: 60,
  extra: 50,
  trailing: 40,
};

const precedence = (type: string) => PRECEDENCE[type] ?? 0;

const MERGEABLE: Set<string> = new Set([
  "separator|separator",
  "extra|extra",
  "keyword_separator|separator",
  "keyword_separator|keyword_separator",
  "separator|extra",
  "keyword_separator|extra",
]);

const isMergeable = (a: string, b: string) =>
  MERGEABLE.has(`${a}|${b}`) || MERGEABLE.has(`${b}|${a}`);

const foldQuoteRewrites = (
  resolved: (TextEdit & { type: string })[],
  quotes: (TextEdit & { type: string })[],
  start: (e: TextEdit) => number,
  end: (e: TextEdit) => number,
): TextEdit[] => {
  const result: (TextEdit & { type: string })[] = [];
  let i = 0;
  for (const quote of quotes) {
    const q = structuredClone(quote);
    const from = start(q);
    const to = end(q);
    while (i < resolved.length && end(resolved[i]!) <= from) {
      result.push(resolved[i]!);
      i++;
    }
    const last = result.at(-1);
    if (last && end(last) === from) {
      result.pop();
      q.newText = last.newText + q.newText;
      q.range.start = last.range.start;
    }
    while (i < resolved.length && start(resolved[i]!) <= to) {
      const other = resolved[i]!;
      if (start(other) === to) {
        q.newText += other.newText;
        q.range.end = other.range.end;
      }
      i++;
    }
    result.push(q);
  }
  result.push(...resolved.slice(i));
  return result;
};

export const resolveFormattingConflicts = (
  edits: (TextEdit & { type: string })[] | undefined,
  document: SparkdownDocument,
  formattingOnType?: Position,
): TextEdit[] => {
  const result: (TextEdit & { type: string })[] = [];
  if (!edits) return result;

  const start = (e: TextEdit) => document.offsetAt(e.range.start);
  const end = (e: TextEdit) => document.offsetAt(e.range.end);

  if (edits.some((e) => e.type === "quote_normalize")) {
    const rest = resolveFormattingConflicts(
      edits.filter((e) => e.type !== "quote_normalize"),
      document,
      formattingOnType,
    ) as (TextEdit & { type: string })[];
    const quotes = edits.filter((e) => e.type === "quote_normalize");
    return foldQuoteRewrites(rest, quotes, start, end);
  }

  const unionInto = (
    keep: TextEdit & { type: string },
    other: TextEdit & { type: string },
  ) => {
    if (start(other) < start(keep)) keep.range.start = other.range.start;
    if (end(other) > end(keep)) keep.range.end = other.range.end;
  };

  for (let i = 0; i < edits.length; i++) {
    const curr = structuredClone(edits[i])!;
    const prev = result.at(-1);
    if (!prev || end(prev) < start(curr)) {
      result.push(curr);
      continue;
    }

    const blanklineIndentMerge =
      (prev.type === "blankline" && curr.type === "indent") ||
      (prev.type === "indent" && curr.type === "blankline");
    if (blanklineIndentMerge) {
      const blankline = prev.type === "blankline" ? prev : curr;
      const indent = prev.type === "indent" ? prev : curr;
      const indentLineHasContent =
        document.getLineText(indent.range.start.line).trim() !== "";
      const shouldConcat = indentLineHasContent || formattingOnType;
      unionInto(prev, curr);
      if (shouldConcat) {
        if (prev.type === "blankline") prev.newText += indent.newText;
        else prev.newText = blankline.newText + prev.newText;
      } else {
        if (prev.type === "indent") prev.newText = blankline.newText;
      }
      prev.type = "blankline";
      continue;
    }

    const blanklineInsertIndent =
      (prev.type === "blankline_insert" && curr.type === "indent") ||
      (prev.type === "indent" && curr.type === "blankline_insert");
    if (blanklineInsertIndent) {
      const insert = prev.type === "blankline_insert" ? prev : curr;
      const indent = prev.type === "indent" ? prev : curr;
      if (start(insert) === start(indent) && end(insert) === start(insert)) {
        prev.range = indent.range;
        prev.newText = insert.newText + indent.newText;
        prev.type = "blankline_insert";
        continue;
      }
    }

    if (isMergeable(prev.type, curr.type)) {
      if (precedence(curr.type) > precedence(prev.type)) {
        unionInto(curr, prev);
        result.pop();
        result.push(curr);
      } else {
        unionInto(prev, curr);
      }
      continue;
    }

    if (precedence(curr.type) > precedence(prev.type)) {
      result.pop();
      result.push(curr);
      continue;
    }
    if (precedence(curr.type) < precedence(prev.type)) {
      continue;
    }

    if (curr.newText === "" && prev.newText === "") {
      prev.range.end = curr.range.end;
      continue;
    }
    if (end(prev) === start(curr)) {
      prev.newText += curr.newText;
      prev.range.end = curr.range.end;
      continue;
    }
    console.error(
      "ERROR:",
      JSON.stringify({
        line: prev.range.start.line + 1,
        offset: start(prev),
        oldText: document.getText(prev.range),
        newText: prev.newText,
        type: prev.type,
      }),
      " overlaps with ",
      JSON.stringify({
        line: curr.range.start.line + 1,
        offset: start(curr),
        oldText: document.getText(curr.range),
        newText: curr.newText,
        type: curr.type,
      }),
    );
  }

  return result;
};

export const getDocumentFormattingEdits = (
  document: SparkdownDocument | undefined,
  tree: Tree | undefined,
  annotations: SparkdownAnnotations | undefined,
  options: FormattingOptions,
  formattingRange?: Range | Position,
  formattingOnType?: Position,
  incrementalDirtyRange?: { from: number; to: number },
): TextEdit[] | undefined => {
  if (!document || !annotations) {
    return undefined;
  }

  const { edits } = getFormatting(
    document,
    tree,
    annotations,
    options,
    formattingRange,
    formattingOnType,
    incrementalDirtyRange,
  );

  const result = resolveFormattingConflicts(edits, document, formattingOnType);
  return result ?? [];
};

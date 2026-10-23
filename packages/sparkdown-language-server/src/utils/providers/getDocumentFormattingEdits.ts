import { isExplicitRuleName } from "@impower/sparkdown/src/compiler/utils/explicitRuleNames";
import { ALTERNATOR_CANDIDATES, opensAlternator } from "@impower/sparkdown/src/compiler/utils/alternatorDecision";
import { CALL_LIKE_OPENERS } from "@impower/sparkdown/src/compiler/utils/callLikeOpeners";
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

// Right-side: nextChar = these → never insert space BEFORE them.
const NO_SPACE_BEFORE = new Set([")", "]", "}", ",", ";", ":", "."]);
// Left-side: prevChar = these → never insert space AFTER them.
const NO_SPACE_AFTER = new Set(["(", "[", "{", "."]);
// Openers that "attach" to a preceding word — `foo(`, `arr[`, `obj{`
// — but DON'T attach to a preceding operator (`a * (b)` wants space).
// `FormattingAnnotator` reads the same set to force the space after a
// keyword (`return {1}`).

function isWordChar(c: string): boolean {
  return /[a-zA-Z0-9_]/.test(c);
}

// Character pairs that begin a longer token when nothing separates them:
// `- -x` would become the comment `--x`, `t[ [[s]] ]` a long string.
const JOINING_PAIRS = new Set([
  "--",
  "..",
  "==",
  "~=",
  "<=",
  ">=",
  "//",
  "::",
  "->",
  "[[",
  "[=",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "^=",
  ".=",
]);

// A name or number character in any script, so `ñandú x` is two words.
const NAME_CHAR_REGEX = /[\p{L}\p{N}_]/u;

// The grammar's number literals (`LuauNumericDecimal`, `LuauNumericHex`,
// ... and their captures), as opposed to a name that ends in a digit
// (`text2`, `text-2`, `t.a1`).
const NUMBER_NODE_REGEX = /^(?:LuauNumeric[A-Za-z]*|NumberLiteral|NumberValue)(?:_|$)/;

// Strings, whose whitespace is part of their value, and comments.
const STRING_NODE_REGEX = /String$/;
const LITERAL_NODE_REGEX = /(?:String|Comment)$/;

// Whether `pos` is inside a node that `regex` names and that begins before
// `pos`.
function insideNode(tree: Tree, pos: number, regex: RegExp): boolean {
  for (let n: SyntaxNode | null = tree.resolveInner(pos, 1); n; n = n.parent) {
    if (n.from < pos && regex.test(n.name)) return true;
  }
  return false;
}

// Whether the token that ends at `offset` is a number literal (`5`, `1.`,
// `-1.`, `0xFF`), read from the syntax tree.
function endsNumberAt(tree: Tree | undefined, offset: number): boolean {
  const node = tree?.resolveInner(offset, -1);
  return Boolean(
    node &&
      (NUMBER_NODE_REGEX.test(node.name) ||
        (node.parent != null && NUMBER_NODE_REGEX.test(node.parent.name))),
  );
}

// Whether removing all the whitespace between `prevChar` and `nextChar`
// would join the tokens either side into one (`5 print` → `5print`,
// `match match` → `matchmatch`), which changes what the script means.
// After a number (`afterNumber`) a `.` or name character would read as
// part of it (`1. print` → `1.print`, `5 .x` → `5.x`). A word after a
// closing `)` or `]` also keeps its space (`]] print(1)`, a statement
// after a block comment), so a second statement on the line is not glued
// to the first.
function mustKeepSpaceBetween(
  prevChar: string,
  nextChar: string,
  afterNumber: boolean,
): boolean {
  const nextIsName = NAME_CHAR_REGEX.test(nextChar);
  if (
    nextIsName &&
    (NAME_CHAR_REGEX.test(prevChar) || prevChar === ")" || prevChar === "]")
  ) {
    return true;
  }
  if (afterNumber && (nextIsName || nextChar === ".")) return true;
  return JOINING_PAIRS.has(prevChar + nextChar);
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

// Every grammar rule that visually indents its body content by one level.
// The body is recognized as the `_content` child of the named root —
// e.g. `LuauSparkdownIfBlock_content`. The header / footer (`_begin` /
// `_end`) stays at the parent level, so the closing `end` keyword
// aligns with the opening `if`.
const INDENTING_BLOCKS = nodeNameSet([
  "BlockTitle",
  "BlockHeading",
  "BlockTransitional",
  "BlockWrite",
  "BlockDialogue",
  "BlockAction",
  "LuauFunctionDefinition",
  "LuauFunctionTypeDeclaration",
  // `for`/`while`/`repeat` loops are NOT in this set: their grammar
  // rules end at `$` / `until`, so the inner `DoBlock` (which owns
  // the visible `end` keyword) is what we count. Listing both the
  // loop and the DoBlock would double-indent.
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
  // Multi-line function-call arg lists (`foo(\n  arg1,\n  arg2,\n)`)
  // and function-definition parameter lists indent their body one
  // level past the opener — same shape as `LuauParenthetical` and
  // `LuauTable`.
  "LuauFunctionCallParameters",
  "LuauFunctionParameters",
  // NOTE: `Scene` and `Branch` end at the colon — they're single-line
  // tree nodes, not body wrappers. Their indent contributions are
  // tracked via `sceneActive` / `branchActive` state (see below)
  // since the body lines are top-level siblings in the tree.
] as SparkdownNodeName[]);

// When a sibling clause (`else`, `elseif`, `then` after a `choose`)
// shows up inside the parent block's body, the parent's contribution
// is replaced by the sibling's own — otherwise both would stack and
// the clause body would indent +1 too deep.
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

// Walking back past one of these aborts the choice-body lookup.
// `Choice` ends at the marker line's EOL so a free-standing `Scene`,
// `LuauFunctionDefinition` or `LuauFunctionTypeDeclaration` after
// some top-level choices isn't inside any choice's "body" — it's
// started a new top-level scope.
const CHOICE_SCOPE_TERMINATORS = nodeNameSet([
  "Scene",
  "Branch",
  "LuauFunctionDefinition",
  "LuauFunctionTypeDeclaration",
  "LuauDefine",
  "FrontMatter",
]);

// Counts the number of "I'm in a Choice's body" levels active at
// `pos`. The tree models Choice as a single-line node that ends at
// EOL, so the body lines that follow are tree-level *siblings* of
// the marker. We walk each ancestor's prevSibling chain looking for
// a preceding Choice; stops at scope-changing constructs so a
// function declaration written after top-level choices doesn't
// get credited with their indent.
function countChoiceBodies(
  stack: GrammarSyntaxNode<SparkdownNodeName>[],
): number {
  let count = 0;
  for (const node of stack) {
    if (!node || !node.node) continue;
    // Skip Choice itself (we're ON a marker line, not in a body)
    // and ChooseThenClause (the `then` keyword line replaces the
    // body of preceding choices — it's at the choose's level, not
    // the choice's body).
    if (node.name === "Choice") continue;
    if (node.name === "LuauSparkdownChooseThenClause") continue;
    // Hitting a scope-changing construct in our ancestor chain means
    // the choice bodies before it don't apply to us — break out.
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

// `ElseBlock` whose only content is a single `IfBlock` collapses to
// `elseif`. Both Sparkdown and non-Sparkdown variants. Returns true
// when this node is one of those merge-eligible else blocks so the
// indent logic can treat it as transparent (and the post-format
// rewrite pass deletes the outer `end` and joins keywords).
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
  // Walk content's direct children. Exactly one must be the expected
  // `IfBlock`, and everything else must be insignificant (newlines /
  // whitespace nodes the parser keeps for layout).
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
        // Either a second meaningful child, or a non-If first child —
        // not eligible for elseif collapse.
        return false;
      }
    }
    child = child.nextSibling;
  }
  return !!ifBlockChild;
}

// A line whose first non-whitespace token is a header-opener
// keyword (`then` for an if-block, `do` for a loop's do-block)
// should indent at the HEADER's level, not the body's level. The
// grammar buries these keywords inside `*_content`, so the default
// "in content → +1" rule would put them one level too deep. This
// helper detects the case so `computeBlockIndent` can suppress the
// enclosing block's contribution.
function isHeaderOpenerLine(
  stack: GrammarSyntaxNode<SparkdownNodeName>[],
  block: GrammarSyntaxNode<SparkdownNodeName>,
): boolean {
  const leaf = stack[0];
  if (!leaf) return false;
  // `then` belongs to an `IfBlock` / `ElseifBlock`.
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

// Continuation-line indent bump: a line whose first non-WS token is
// the operator of a binary `Luau*Operator` rule (arithmetic, compare,
// logical, concat, type-cast, accessor for method chains) sits inside
// an expression that started on a previous line. The structural tree
// has no block boundary at the line-break — `computeBlockIndent` would
// return the parent's depth and leave the continuation line aligned
// with the opening line.
//
// Prettier and Lua's stylua both indent these continuations one level
// past the opener:
//
//   local x = a + b
//     + c + d
//
//   local s = "hello"
//     .. "world"
//
//   obj
//     :method1()
//     :method2()
//
// Detection: the leaf at line-start sits underneath one of the
// `Luau*Operator` rules whose own begin is on THIS line — meaning the
// operator itself opens the line. Lines that merely happen to be
// inside an operator scope (e.g. the RHS operand on the same line as
// the operator) don't trigger; only lines that LEAD with the operator
// token do.
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
    // Operator's own opening must be on the current line — i.e.
    // its node.from >= lineStart. If the operator started on an
    // earlier line, we're inside its scope but not leading with it.
    if (node.from >= lineStart) return true;
  }
  return isCommaContinuationLine(stack, source);
}

// The statements whose value list continues after a comma that ends its line.
const COMMA_CONTINUED_CONTENT = new Set<string>([
  "LuauVariableDefinition_content",
  "LuauReassignment_content",
]);

// A declaration or reassignment list continued after a comma that ends its
// line (`LuauCommaLineBreak`) indents its later lines one level past the
// statement, as stylua does:
//
//   local a, b = 1,
//     2
//   a, b = 3,
//     4
//
// The comment-only lines between sit inside the line break. Everything the
// statement holds after a line break is on a continued line, so it takes
// the extra level on every line it spans, and a table, call or function
// started there keeps its body one level deeper than its opener:
//
//   local a, t = 1,
//     {
//       k = 5,
//     }
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
// What the continued-list test reads: the document's text, by each
// reassignment's offset where the statement that begins at it ends, and by
// a block's start and end its lines parsed once, indented (`readIndented`).
interface ListSource {
  text: string;
  lists: Map<number, number>;
  blocks: Map<string, IndentedReading>;
}

// Source lines parsed again, indented, in a function body: the tree, each
// line's start in the source and in the indented text, and the statements the
// body holds, by the line they begin at the start of.
interface IndentedReading {
  tree: Tree;
  sourceStarts: number[];
  indentedStarts: number[];
  statements: Map<number, SyntaxNode>;
}

let listParser: TextmateGrammarParser | undefined;

// Whether `node` begins a statement that ends a list rather than continuing
// it: a reassignment continues a target list or is a second `=` the list
// reads on to, and a function whose header names nothing (`function (`,
// `function --[[c]] <T>(`) is a value.
function beginsListEndingStatement(node: SyntaxNode): boolean {
  if (node.name === "LuauFunctionDefinition") return functionHeaderName(node) !== null;
  return node.name !== "LuauReassignment" && isStatementNodeName(node.name);
}

// The name in a function definition's header, before its parameters: a
// plain name (`LuauFunctionDeclarationName`) or a dotted or method name,
// which parses as a `LuauAccessPath`. Null for an anonymous function,
// whatever comments its header holds.
function functionHeaderName(node: SyntaxNode): SyntaxNode | null {
  const content = node.getChild("LuauFunctionDefinition_content");
  for (let child = content?.firstChild ?? null; child; child = child.nextSibling) {
    if (child.name === "LuauFunctionParameters") return null;
    if (child.name === "LuauFunctionDeclarationName" || isExplicitRuleName(child.name, "LuauAccessPath")) return child;
  }
  return null;
}

// Where the reassignment or declaration at `reassignment` would end if the
// lines after its first were indented, which is how it reads them once they
// are formatted: an indented line after a comma that ends the line is read
// into the statement, which then ends where its grammar says, after its last
// value, at a statement, or on a line not carried on by a comma. The lines
// up to the end of the block are parsed again, indented, in a function
// body, and the statement's end is mapped back. Deciding with the same
// grammar that reads the formatted text is what keeps a second format from
// moving these lines again.
//
// The block is parsed once, from its first statement, and shared by the
// reassignments in it. One that the indented block holds as a statement at
// the start of its line is read exactly as a parse beginning at it would
// read it: the grammar tells lines apart by whether they start at column 0,
// which no indented line does, so the parser stands in the function body at
// that line's start either way and reads the same lines after it. Any other
// reassignment, one that starts partway through a line or that the indented
// block reads into an earlier statement's list, parses the rest of its block
// on its own.
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
    // The source offset of the indented text's offset `at`.
    const { sourceStarts, indentedStarts } = reading;
    let line = indentedStarts.length - 1;
    while (line > 0 && indentedStarts[line]! > reassigned.to) line -= 1;
    end = Math.max(end, sourceStarts[line]! + Math.max(0, reassigned.to - indentedStarts[line]!));
  }
  source.lists.set(reassignment.from, end);
  return end;
}

const LIST_PREFIX = "function __list()\n";

// The source from `from` to `to` parsed in a function body with every line
// after the first indented, and the first too when it starts at column 0:
// the whole rest of the block, since a list can run on through any number of
// lines (comment lines, values), so no shorter read can say where it ends.
function readIndented(text: string, from: number, to: number): IndentedReading {
  const lines = text.slice(from, to).split("\n");
  const sourceStarts: number[] = [];
  const indentedStarts: number[] = [];
  // Each line's start in the indented text, before its added indentation.
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

// The statement that `reassignment` is in a block's shared reading: the one
// of its name at the start of the line it begins, when nothing but
// whitespace stands before it on that line, so that a parse beginning at it
// would read the same line.
function sharedStatement(reassignment: SyntaxNode, text: string, block: IndentedReading): SyntaxNode | null {
  const { sourceStarts } = block;
  let line = sourceStarts.length - 1;
  while (line > 0 && sourceStarts[line]! > reassignment.from) line -= 1;
  if (line === 0 && reassignment.from !== sourceStarts[0]) return null;
  if (text.slice(sourceStarts[line]!, reassignment.from).trim()) return null;
  const statement = block.statements.get(line);
  return statement?.name === reassignment.name ? statement : null;
}

// The first node of `name` after the function header in a reading that
// begins at the reassignment.
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

// The statements whose list an unindented line can carry on.
const LIST_STATEMENTS = new Set(["LuauReassignment", "LuauVariableDefinition"]);

// A node on an unindented line of a reassignment's target or value list, or
// of a declaration's value list, that a comma ending the line before carried
// on (`a,` then `g = 1, 2`, `a, b, c = 1,` then `2,` then `3`, or
// `local a, b = 1,` then `2` at the line's start). The statement ends at the
// start of the first such line, so the rest of its list is in siblings
// after it.
// Which siblings is what the reassignment reads once those lines are
// indented (`listEnd`), since that is what the next format sees: a value
// split by a comment, a call after a finished value and the statement after
// the list are told apart by the grammar rather than guessed from the
// siblings' shapes. A sibling that begins before that end, including a
// comment between two parts of the list, is on a continued line.
function continuesReassignmentList(node: SyntaxNode, source: ListSource): boolean {
  if (beginsListEndingStatement(node)) return false;
  let prev = node.prevSibling;
  // A sibling that begins a statement ends any list before it, which keeps
  // the walk to the lines of one statement.
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

// A comma followed by a block comment and the value on its own line
// (`1, --[[c]] 2`) does not continue the list onto another line.
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

// Tree-walking indent: returns the count of ancestor blocks whose
// `_content` contains `pos`, minus header/footer adjustments. No
// stack state, no annotation queue — just the tree.
function computeBlockIndent(
  stack: GrammarSyntaxNode<SparkdownNodeName>[],
): number {
  let level = 0;
  for (let i = 0; i < stack.length; i++) {
    const node = stack[i];
    if (!node) continue;
    if (!INDENTING_BLOCKS.has(node.name)) continue;

    // `getStack` returns leaf-first: stack[i-1] is the immediate
    // child of stack[i] on the path to the leaf. We're in this
    // block's body iff that immediate child is its `_content`.
    const innerChild = stack[i - 1];
    if (!innerChild) continue;
    if (innerChild.name !== `${node.name}_content`) continue;

    // Sibling-clause override: when the immediate child of this
    // block's `_content` is one of its sibling clauses (`ElseBlock`
    // for `IfBlock`, `ChooseThenClause` for `ChooseBlock`), the
    // clause owns the indent — our `+1` would double-count. We
    // check stack[i-2] (the direct child of stack[i-1]=content) so
    // a clause nested inside a deeper instance of the SAME rule
    // doesn't suppress this outer one.
    const siblings = SIBLING_CLAUSES[node.name];
    if (siblings) {
      const directChild = stack[i - 2];
      if (directChild && siblings.includes(directChild.name)) continue;
    }

    // `else if … end end` → `elseif … end` transparency. When an
    // `ElseBlock`'s only meaningful content is a single `IfBlock`,
    // the two collapse visually into one `elseif` clause. The
    // `ElseBlock` itself contributes 0 — the inner `IfBlock`'s
    // header/body/end align with the outer `if`'s siblings, exactly
    // as a real `elseif` would. The textual rewrite (see post-format
    // tree walk) deletes the outer `end` and merges `else if` →
    // `elseif`; this rule keeps indent correct so both passes
    // agree.
    if (isElseBlockMergeableIntoIf(node, stack[i - 1])) continue;

    // A structural word that holds no arms is a name (I-1310): its rule is
    // the call it reads as, which indents nothing.
    if (ALTERNATOR_CANDIDATES.has(node.name) && !opensAlternator(node)) continue;

    // An alternator's arms take its `end` (I-1310), which aligns with the
    // word that opened it as a block's own `end` does.
    const arms = stack[i - 2];
    if (arms && isExplicitRuleName(arms.name, "LuauAlternatorArms") && stack[i - 3]?.name === `${arms.name}_end`) continue;

    // Header-opener line (e.g. `then` on its own line inside an
    // if-block whose condition was too long to inline). Such lines
    // sit inside `IfBlock_content` but visually belong to the
    // header — indent them at the block's level, not body level.
    if (isHeaderOpenerLine(stack, node)) continue;

    level += 1;
  }
  return level;
}

// A body line that holds a brace (#1222): it nests by its braces, and may
// span lines up to the `}` of its last block.
const BRACE_LINES = nodeNameSet(["LuauSparkleBlockLine", "LuauStructBlockLine"]);

// The index in `stack` (leaf first) of the outermost brace line around the
// leaf, or -1.
function findBraceLine(stack: GrammarSyntaxNode<SparkdownNodeName>[]): number {
  for (let i = stack.length - 1; i >= 0; i--) {
    const node = stack[i];
    if (node && BRACE_LINES.has(node.name)) return i;
  }
  return -1;
}

// What indents a line inside a brace line by one level, when the line starts
// inside the node's `_content`: a block's braces, a multi-line handler
// closure, an `if` / `for` / `match` in a block and each of their branches,
// and a continuation line, whose parts, block and closure sit one level past
// the element they continue. A header's own line and a closing `}` or `end`
// are outside the `_content`, so they stay at the level around it.
const BRACE_INDENTERS = nodeNameSet([
  "LuauSparkleElementBlock",
  "LuauStructBlockBody",
  "LuauStructListBlock",
  "LuauSparkleHandlerClosure",
  "LuauSparkleElementContinuation",
]);

// The depth of a line below the first line of the brace line at
// `stack[braceLineIndex]`: the braces, branches and continuations it starts
// inside, and any Luau block it starts inside within a handler closure.
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

// The next line after `line` that is neither blank nor a comment (`end`, or
// the line count when there is none), and whether it continues an element
// (#1225): a comment between an element and its continuation lines lines up
// with them. Every comment line before `end` shares the answer, so the
// caller reads it once per run of comments.
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
    // The continuation must begin on that line, not merely hold it (a
    // closure's statements sit inside the continuation that opened it).
    const continues = getStack<SparkdownNodeName>(tree, pos, 1).some(
      (n) =>
        n?.name === "LuauSparkleElementContinuation" && n.from >= lineStart,
    );
    return { end: l, continues };
  }
  return { end: document.lineCount, continues: false };
}

// The span of each scene, from `scene` to its own `end`, or to the next
// `scene` or the end of the document when its author never closes it. A
// scene's body lies at the tree's root beside its declaration (GRAMMAR.md
// section 16), so a function or other declaration written inside it is a
// root-level node too, and only the scene's `end` tells the two apart. The
// root-level walk pairs `scene`, `branch` and `end` as the compiler does
// (`validateOpenBlocks`): a `scene` sets aside every scene and branch still
// open, a `branch` every branch, and an `end` closes the innermost one.
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
  // Incremental (delta) formatting: the byte range that changed since
  // the last format. The formatter reprocesses only the top-level
  // construct(s) the change touched — see the region computation below.
  // Mutually exclusive with an explicit `formattingRange` / `formattingOnType`.
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

  // Persistent state across lines — only for things the tree alone
  // can't tell us:
  //   - `Scene` / `Branch` aren't body wrappers; their bodies are
  //     top-level siblings in the tree. We track them as booleans
  //     that flip on scene_begin / branch_begin and back off when
  //     the implicit body ends (next scene, top-level Luau decl, or
  //     a stray `end` keyword closing the scope).
  //   - `Choice` body indent is derived from the tree by walking
  //     prev-siblings (see `countChoiceBodies`). No state needed.
  let sceneActive = false;
  let branchActive = false;
  // A top-level Luau declaration written inside a scene its author closes
  // with `end` belongs to that scene's body (I-1544): the compiler closes a
  // scene only at its own `end`, so the declaration neither ends the body
  // nor starts a top-level construct. Read once, on the first such mark.
  let scenes: { from: number; to: number; closed: boolean }[] | undefined;
  const sceneAt = (pos: number) => {
    if (!tree) return undefined;
    scenes ??= sceneSpans(tree);
    return scenes.find((span) => span.from < pos && pos < span.to);
  };
  const endsSceneBody = (pos: number) => !sceneAt(pos)?.closed;

  // Track the enclosing struct body to reset display indentation state.
  let sparkleContentFrom: number | undefined = undefined;
  // Record each line’s base level; explicit blocks determine deeper levels.
  let braceLineLevels = new Map<number, number>();
  // The level of the last element line at the top of the body, which a
  // continuation line or a `{` on its own line there is placed against.
  let lastElementLevel: number | undefined = undefined;
  // The run of comment and blank lines last looked past for a continuation:
  // a comment line after `start` and before `end` shares its answer.
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

  // Ensures exactly one blank line precedes `pos`. If the previous
  // line is non-blank (and we're not at the file start), inserts a
  // `\n` at the start of the line containing `pos`. Used to enforce
  // visual separation between top-level constructs (scenes,
  // functions, defines) — prettier-style.
  //
  // Exception: doc comments (`-- …`) directly above a construct stay
  // attached to it without an inserted blank line.
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
    // Zero-width indent at end-of-doc — skip so we don't emit a
    // ghost trailing-whitespace line.
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
      // Use the first non-whitespace character on this line as the
      // tree-context anchor. Reading the stack at the leading-WS
      // position would credit the enclosing block's `_content`
      // contribution even for the closing `}` / `)` / `end` keyword,
      // which should align with the OPENING line one level shallower.
      const lineStart = document.offsetAt({
        line: range.start.line,
        character: 0,
      });
      const lineEnd = document.offsetAt({
        line: range.start.line + 1,
        character: 0,
      });
      // A line inside a string begun on an earlier line (`[[a` then
      // `  b]]`) is part of the string's value, its indentation too.
      if (insideNode(tree, lineStart, STRING_NODE_REGEX)) return;
      const lineText = document.read(lineStart, lineEnd);
      const firstNonWs = lineText.search(/\S/);
      const stackPos = firstNonWs >= 0 ? lineStart + firstNonWs : from;
      const stack = getStack<SparkdownNodeName>(tree, stackPos, 1);

      // Struct bodies nest by braces; each brace level adds one display indent.
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
        // The body's own level, past the scene and branch that hold its
        // declaration (a `style` written inside a scene, I-1544).
        const bodyLevel =
          computeBlockIndent(stack) +
          1 +
          (sceneActive ? 1 : 0) +
          (branchActive ? 1 : 0);
        // Reset cached brace and continuation levels for each body.
        if (sparkleContentFrom !== sparkleContentNode.from) {
          sparkleContentFrom = sparkleContentNode.from;
          braceLineLevels = new Map();
          lastElementLevel = undefined;
        }
        // Braces and control scopes determine each body's display levels.
        const trimmedLine = lineText.trimStart();
        const isCommentLine =
          trimmedLine.startsWith("--") || trimmedLine.startsWith("//");
        // A comment between an element and the lines that continue it lines
        // up with those lines.
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
            // A later line of the brace line: its depth below the first.
            const base = braceLineLevels.get(braceLine.from);
            if (base != null) {
              emitLevel(base + depth + (commentsContinuation ? 1 : 0));
            }
            return;
          }
          // A continuation line, or a `{` on its own line, belongs to the
          // element above it whatever its column (#1225): the continuation
          // one level past the element, the `{` at the element's level.
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
        // A comment before a continuation uses the preceding element's level.
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
      // Continuation lines: a line that LEADS with a binary operator
      // (`+`, `..`, `:`, `and`, etc.) belongs to an expression that
      // started on the previous line and should indent one level past
      // the opener (see `isContinuationLine`'s comment).
      if (isContinuationLine(stack, lineStart, listSource)) {
        newIndentLevel += 1;
      }

      // Blank lines: leave them entirely empty; don't sprinkle
      // ghost-indent whitespace on otherwise-empty rows.
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

      // Stray `end` closing scene/branch: sparkdown's `Scene` /
      // `Branch` grammar rules end at the colon, so a top-level
      // `end` keyword written by the user (intending to close the
      // scope) is just a free-standing token in the tree.
      // Recognize it via the leaf token's grammar type
      // (`LuauEndKeyword`) rather than a source-text regex — the
      // regex would silently misfire on top-level `end` keywords
      // the parser DID match to a block (e.g. an if-block whose
      // recognition we hadn't predicted).
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

      // FrontMatter is special-cased: field bodies are at level 1,
      // headers at level 0. Anything inside an `Unknown` node (a
      // parse failure region) keeps the source's existing indent.
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

  // Incremental (delta) formatting. The only cross-line formatting
  // state — `sceneActive` / `branchActive` — resets at every
  // `scene_begin` boundary and every `top_level_begin` outside a closed
  // scene (`endsSceneBody`), and per-line indent is
  // computed position-locally from the tree. Whether a declaration ends a
  // scene's body depends on an `end` after it, which an edit anywhere in
  // the scene can add or remove, so a declaration is a boundary only
  // outside every scene, closed or not, and only when it already starts
  // its line: the text there is the last format's output, which writes a
  // declaration inside a scene indented, so one at column 0 was a reset
  // point for the last format too. So starting the scan AT the
  // nearest such boundary ≤ the dirty start (with the same fresh initial
  // state the function already begins with) yields byte-for-byte the same
  // output as a full format for that span — while skipping the untouched
  // rest of the file. We bound the EMIT range to [boundaryBefore,
  // boundaryAfter) (reusing the existing `formattingRange` machinery) and
  // start the iterator at the boundary.
  let iterStart = 0;
  let reachesDocEnd = true;
  // When set (incremental path), bound the structural `tree.iterate`
  // passes to the reprocessed region so they don't walk the whole tree.
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

  // A zero-width `keyword_separator` inserts a space of its own (before
  // the `..` in `5 .. x`), so a span that starts or ends at one may go
  // without joining anything; keeping it too would write two spaces.
  const insertsSpaceAt = new Set<number>();
  // A zero-width `separator` decides the gap it sits in: extra whitespace
  // that touches it is the same gap (the space after `-> one` before the
  // `==` the separator stands in front of), which keeps one space where
  // the separator would insert one once the extra whitespace is gone.
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
  // The characters either side of the gap from `from` to `to`, as the
  // spacing rules read them. The vararg `...` is one token, not member
  // accesses, so it reads as a name does (`c, ...`, `if ... then`).
  const charBefore = (from: number) => {
    // Whole code points, so a letter outside the BMP (`𐐀`) is not read as
    // half of a surrogate pair.
    const char =
      Array.from(document.read(Math.max(0, from - 2), from)).pop() ?? "";
    return char === "." && document.read(from - 3, from) === "..." ? "_" : char;
  };
  const charAfter = (to: number) => {
    const char = Array.from(document.read(to, to + 2))[0] ?? "";
    return char === "." && document.read(to, to + 3) === "..." ? "_" : char;
  };
  // Whether the separator rule puts one space between the tokens either side
  // of the gap from `from` to `to`.
  const insertsSeparatorSpace = (from: number, to: number) =>
    shouldInsertSpaceBetween(charBefore(from), charAfter(to));
  // Whether the separator touching the whitespace from `from` to `to` would
  // insert a space between the tokens either side once it is removed.
  const separatorKeepsSpace = (from: number, to: number) =>
    from !== to &&
    (separatorAt.has(from) || separatorAt.has(to)) &&
    insertsSeparatorSpace(from, to);
  // Whether the whitespace from `from` to `to` must keep one space so the
  // tokens either side are not joined.
  const keepsJoiningSpace = (from: number, to: number) => {
    if (from === to || insertsSpaceAt.has(from) || insertsSpaceAt.has(to)) {
      return false;
    }
    const nextChar = charAfter(to);
    const prevChar = charBefore(from);
    return mustKeepSpaceBetween(
      prevChar,
      nextChar,
      (NAME_CHAR_REGEX.test(nextChar) || nextChar === ".") &&
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
    // Lookahead — drives sol_comment indent-matching and (just for
    // resets) scene/branch transitions.
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
        // New scene declaration — reset prior scene/branch state.
        sceneActive = false;
        branchActive = false;
      } else if (aheadCur.value.type === "branch_begin") {
        // New branch declaration. Branches sit inside a scene body
        // (sceneActive stays as-is). Reset any prior branch state.
        branchActive = false;
      } else if (
        aheadCur.value.type === "top_level_begin" &&
        endsSceneBody(aheadCur.from)
      ) {
        // Top-level Luau decl (function / define) ends a scene/branch
        // body that has no `end` of its own.
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
      // Separator decision is the same whether the span is empty
      // (insert one space?) or already-spaces (collapse to what?):
      // look at the neighboring characters and let
      // `shouldInsertSpaceBetween` decide. If it says no, collapse
      // to empty; if yes, normalize to exactly one space.
      const atLineStart =
        range.start.character === 0 && cur.from === cur.to;
      let expectedText: string;
      if (atLineStart) {
        // Zero-width separator at column 0 — never insert leading
        // whitespace (`indent` handles the row's leading WS).
        expectedText = "";
      } else {
        // Collapsing existing spaces keeps one where the tokens either
        // side would otherwise join.
        expectedText =
          insertsSeparatorSpace(cur.from, cur.to) ||
          keepsJoiningSpace(cur.from, cur.to)
            ? " "
            : "";
      }
      // Skip the no-op zero-width insert (avoid creating a useless
      // empty-text edit).
      if (cur.from === cur.to && expectedText === "") {
        // no-op
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
      // Always exactly one space — bypasses the call-like-opener
      // tightening that would otherwise glue `if`/`for`/`match` to
      // a following `(`.
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
      // Extra whitespace goes, except one space where its removal would
      // join the tokens either side into one, or where a separator it
      // touches would put one back.
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
      // Normalize the marker text itself ("*  " → "* ") — the indent
      // for the marker line is already computed from the tree by
      // `processIndent` above.
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
        // Blank line after a divert outdents by 1 (visual paragraph
        // break before the next statement). Stay at 0 if we're
        // already at the outermost level.
        tempIndentLevel = 0;
      }
    } else if (cur.value.type === "scene_begin") {
      // After processing the scene declaration line itself, the
      // implicit body begins. Subsequent lines indent +1 until the
      // scope closes (next scene, top-level Luau decl, stray `end`).
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
    // A document with no text gains no newline: it would end in a blank
    // line, which `trimFinalNewlines` removes on the next format.
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
    // `else if X then BODY end end` → `elseif X then BODY end`. The
    // indent-suppression rule above (`isElseBlockMergeableIntoIf`)
    // already aligns indents as if these were a single `elseif`;
    // here we make the source text match by joining the keywords
    // and dropping the now-redundant outer `end`.
    tree.iterate({
      from: treeIterFrom,
      to: treeIterTo,
      enter: (nodeRef) => {
        if (!MERGEABLE_ELSE_BLOCKS.has(nodeRef.name as SparkdownNodeName))
          return;
        const elseNode = nodeRef.node;
        // Find begin / content / end children.
        let beginNode, contentNode, endNode;
        let child = elseNode.firstChild;
        while (child) {
          if (child.name.endsWith("_begin")) beginNode = child;
          else if (child.name.endsWith("_content")) contentNode = child;
          else if (child.name.endsWith("_end")) endNode = child;
          child = child.nextSibling;
        }
        // We only need begin + content for `else if` → `elseif`.
        // ElseBlock's own `_end` is zero-width (lookahead on `end`)
        // — the actual `end` keyword that becomes redundant is the
        // INNER if's `end`. After conversion the outer `if`'s `end`
        // continues to close the whole chain.
        if (!beginNode || !contentNode) return;
        void endNode;
        // Verify the eligible pattern (single inner IfBlock).
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
        // Locate the inner `if` keyword and inner `end` keyword.
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
        // Find the inner if's own _end child (direct child of
        // innerIfNode). We can't just iterate the whole subtree —
        // a nested if-statement inside the body would have its own
        // _end too, and we'd grab the wrong one.
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
        // Edit 1: collapse `else…if` into `<indent>elseif`. We
        // extend the range back to the start of the `else` line so
        // the leading whitespace is absorbed too — the elseif chain
        // sits at the OUTER if's level (sibling clauses share their
        // header indent), and absorbing the original WS lets us
        // produce that indent here in one edit (instead of relying
        // on a separate, possibly-conflicting indent edit on the
        // same line).
        //
        // Safety check: only extend back to column 0 if everything
        // before `else` on its line is whitespace. Otherwise we'd
        // clobber preceding content.
        const elseLine = document.positionAt(elseKeyword.from).line;
        const elseLineStart = document.offsetAt({
          line: elseLine,
          character: 0,
        });
        const elsePrelude = document.read(elseLineStart, elseKeyword.from);
        const elsePreludeIsAllWs = /^[ \t]*$/.test(elsePrelude);
        // Indent to emit. The else block is "transparent" per
        // `isElseBlockMergeableIntoIf`, so the elseif keyword sits
        // at the level the else WOULD sit at — which equals the
        // outer if's level. We compute it by looking at the
        // ancestor stack of the `else` keyword's position.
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
        // Edit 2: delete the inner `end`'s entire line (leading
        // indent + `end` keyword + trailing newline). The outer if's
        // own `end` continues to close the chain.
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
    // Empty-block compaction. `function f()\n\nend` → `function f() end`,
    // same for `define`. Body-bearing blocks whose body contains
    // nothing meaningful collapse onto one line. Skips blocks that
    // already have a single-line body and ones with comments / any
    // real statement inside.
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
        // An end that matched no text closes no block here: a define's call
        // line the grammar opened as a method (`isDefineMethodCall`), or a
        // block left open, which ends before the next line. Compacting
        // against it would join that line onto this one.
        if (endNode.from === endNode.to) return;
        // Find the signature: the part of `_content` that represents
        // the declaration (name + params for function/method, name +
        // inheritance for define). Everything after the signature
        // until `_end` is the body. We pick the LAST signature-like
        // child as the boundary.
        // A method's name sits in its `_begin` capture, so inside `_content`
        // the signature is the parameters and the return type.
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
            // A return type takes in the line breaks after it (it may go on
            // as a union on the next line), so the signature ends where
            // its text does.
            signatureEnd =
              cc.from + document.read(cc.from, cc.to).trimEnd().length;
          } else if (cc.name === "LuauFunctionBody") {
            // After the LuauFunctionBody wrapper landed, body
            // statements live one level deeper (inside
            // LuauFunctionBody_content) instead of as direct children
            // of `_content`. Descend so we can still tell whether the
            // wrapped body is truly empty.
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
          } else if (
            cc.name === "LuauFunctionHeaderLineBreak" &&
            !document.read(cc.from, cc.to).trim()
          ) {
            // The line break after a header that ends its line, which the
            // grammar carries before the body (I-1449): nothing of the body
            // when it holds only whitespace.
          } else if (!isInsignificant(cc.name) && signatureEnd != null) {
            bodyHasContent = true;
            break;
          }
          cc = cc.nextSibling;
        }
        if (bodyHasContent) return;
        if (signatureEnd == null) signatureEnd = contentNode.from;
        const replaceFrom = signatureEnd;
        // An `_end` capture can hold the indentation before its `end` (a
        // define's method): that whitespace is part of the gap too.
        const endText = document.read(endNode.from, endNode.to);
        const replaceTo = endNode.from + endText.length - endText.trimStart().length;
        if (replaceFrom >= replaceTo) return;
        const text = document.read(replaceFrom, replaceTo);
        if (text === " ") return; // already compact
        if (text.trim() !== "") return; // body actually has content
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
    // Block-opener keyword line-join. Any multi-line Luau header
    // (`if`/`for`/`while`/`repeat` ... `then`/`do`) folds onto a
    // single line. The opener (`then`/`do`) is the anchor; we scan
    // backwards through preceding whitespace+content lines until we
    // hit the loop/conditional header keyword (or, for `then`, the
    // enclosing if-block's `if`), then collapse everything between
    // into single spaces.
    //
    // This handles three cases at once:
    //   `if X\n  then`        → `if X then`
    //   `if\n  X\n  then`     → `if X then`
    //   `while\n  X\n  do`    → `while X do`
    //
    // Pure Luau semantics: newlines are interchangeable with spaces
    // anywhere inside a header. The grammar doesn't quite model
    // this (loop rules terminate at `$`), so the formatter does the
    // visual normalization itself. In Luau code only: a story
    // header ends at its line (#1907), so the lines under it are
    // story, never its condition.
    //
    // `then` is overloaded — it also opens the *result* clause of a
    // `choose ... then ... end` construct, where it MUST stay on
    // its own line (separates choices from the result body). Skip
    // join when the keyword sits inside a `LuauSparkdownChooseThenClause`.
    const BLOCK_OPENER_KEYWORDS = nodeNameSet(["LuauDoKeyword", "LuauThenKeyword"]);
    // Whether the token that ends at `pos` is a line comment (`-- note`), as
    // opposed to a block comment (`--[[c]]`).
    const afterLineComment = (pos: number) => {
      for (let n: SyntaxNode | null = tree.resolveInner(pos, -1); n; n = n.parent) {
        if (/Comment$/.test(n.name)) {
          return !/^--\[=*\[/.test(document.read(n.from, n.to));
        }
      }
      return false;
    };
    // Whether the token that ends at `from`, before the gap that ends at
    // `to`, is a keyword or an operator (`if`, `not`, `and`, `==`).
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
          // `then` is overloaded — `choose ... then ... end` uses
          // it to open the RESULT clause, which must stay on its
          // own line. Skip when the keyword sits inside
          // ChooseThenClause.
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
        // Find the START of the matching header keyword (`if` /
        // `elseif` / `for` / `while` / `repeat`). We collapse all
        // whitespace/newlines between header-start and this opener.
        //
        // For `then`: tree gives us the enclosing if/elseif block.
        // For `do`: tree often doesn't (the loop's content ends at
        // `$` so the DoBlock is parsed as a sibling). Fall back to
        // a line-by-line scan looking for `for`/`while`/`repeat`.
        let headerStart: number | undefined;
        if (nodeRef.name === "LuauThenKeyword") {
          // Walk up to enclosing IfBlock or ElseifBlock and use
          // its begin's `.to` as the header-start.
          let walker = nodeRef.node.parent;
          while (walker) {
            // An if expression's `then` opens no block: joining it to the
            // `if` statement around it would claim that statement's header
            // a second time (`if if c then false else ...then` with
            // `return if if c then ...` under it).
            if (isExplicitRuleName(walker.name, "LuauTernaryExpression")) {
              return;
            }
            // A story header ends at its line (#1907): a `then` on a
            // later line is not its header's, and joining it would
            // read the lines between into the condition.
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
              // The begin of this block ends right after `if`/`elseif`.
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
          // LuauDoKeyword: walk up to LuauForLoop / LuauWhileLoop /
          // LuauRepeatLoop (nested form) first.
          let walker = nodeRef.node.parent;
          while (walker) {
            // A story `do` block's `do` opens a block of its own: a
            // story loop's header ends at its line (#1907), so the
            // lines above it are never its loop's condition.
            // Its own `do` stays where a bracket that carried the
            // header on left it.
            // A Sparkle block's `do` (`match mode do`) ends a header written
            // on its own line, so the lines above it are not its header
            // either.
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
          // Sibling fallback: walk back through lines looking for
          // a header keyword (`for`/`while`/`repeat`). Skip blank
          // lines and condition-continuation lines (no `=`, `;`,
          // and not starting with another statement keyword). Bail
          // out on any line that looks like a separate statement
          // — that's our signal the `do` is bare and shouldn't
          // join with the preceding line. Cap the search at 10
          // lines so we don't reach into unrelated code if the
          // user's header is broken.
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
              // If line clearly starts a separate statement (local,
              // function, end, etc.), the `do` is bare.
              if (
                STATEMENT_STARTERS.some(
                  (s) => trimmed === s.trim() || trimmed.startsWith(s),
                )
              ) {
                break;
              }
              // Otherwise treat as a condition-continuation line
              // and keep scanning back.
            }
          }
        }
        if (headerStart == null) return;
        if (headerStart >= kwFrom) return;

        // Only join if there's actually a newline in the span (no
        // need to rewrite single-line `if X then`).
        const between = document.read(headerStart, kwFrom);
        if (!between.includes("\n")) return;

        // Each line break, with the whitespace around it, becomes the gap
        // the joined line's spacing rules leave there, so a second format
        // does not move it: one space, none where the tokens either side
        // are written together (`t` then `[2]` joins as `t[2]`), and one
        // after a keyword or an operator (`if (t)`, `and (t)`) or before
        // a spaced operator (`... .. "x"`). Only the line breaks: the
        // gaps on one line keep their own edits, and a line break inside
        // a string or a comment is the author's text.
        const breaks: { from: number; to: number; newText: string }[] = [];
        for (const run of between.matchAll(/\s+/g)) {
          if (!run[0].includes("\n")) continue;
          const from = headerStart + run.index;
          const to = from + run[0].length;
          if (insideNode(tree, from, LITERAL_NODE_REGEX)) continue;
          // A line comment runs to the end of its line, so joining the
          // next line onto it would read that line as part of the comment.
          if (afterLineComment(from)) return;
          const spaced =
            afterKeywordOrOperator(from, to) ||
            ["..", "::"].includes(document.read(to, to + 2)) ||
            insertsSeparatorSpace(from, to) ||
            keepsJoiningSpace(from, to);
          breaks.push({ from, to, newText: spaced ? " " : "" });
        }
        if (breaks.length === 0) return;

        // Line-length budget. If collapsing the whole header would
        // exceed the budget, keep it multi-line — the opener stays
        // on its own line at header-level indent (see
        // `isHeaderOpenerLine` in `computeBlockIndent` for the
        // indent fix).
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
    // Quote normalization. Convert single-quoted Luau strings
    // (`'foo'`) to double-quoted (`"foo"`) — prettier-style. Skip
    // when the content contains a `"` already (would require
    // re-escaping; keep the user's chosen form). Interpolated
    // template strings (backticks) are NOT touched: they have
    // different semantics (interpolation evaluation). Display-text
    // quotes (`N: "hello"`) live as plain text in dialogue nodes,
    // NOT as `LuauSingleQuotedString` / `LuauDoubleQuotedString`,
    // so they're untouched too.
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
        // If the content contains a literal `"`, keep single-quoted
        // form — converting would require escape rewrites which
        // risk subtle semantic changes (raw `\` sequences, etc.).
        if (contentText.includes('"')) return;
        // Strip redundant `\'` escapes — single-quote doesn't need
        // escaping inside a double-quoted string.
        const newContent = contentText.split("\\'").join("'");
        // A string left open at the end of its line keeps its quote: a
        // closing `"` would end it there and read the next line apart.
        if (document.read(endNode.from, endNode.from + 1) !== "'") return;
        // Stop at the closing quote: the node also holds the whitespace
        // after it, which belongs to the separator edits around the next
        // operator (`'x' .. 'y'`), and replacing it here would drop them.
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
    // Trailing-comma policy for multi-line `LuauTable` literals.
    // Prettier-style: multi-line → add trailing comma after the last
    // field; single-line → strip any trailing comma. Skips empty
    // tables and tables that got rewritten by the alternator pass
    // above (no `{` / `}` left).
    tree.iterate({
      from: treeIterFrom,
      to: treeIterTo,
      enter: (nodeRef) => {
        if (!isExplicitRuleName(nodeRef.name, "LuauTable")) return;
        const tableNode = nodeRef.node;
        // Find content range. If begin/end aren't `{` / `}` in the
        // source (e.g. inline alternator that we just rewrote),
        // bail out.
        if (document.read(tableNode.from, tableNode.from + 1) !== "{") return;
        if (document.read(tableNode.to - 1, tableNode.to) !== "}") return;
        const contentFrom = tableNode.from + 1;
        const contentTo = tableNode.to - 1;
        const contentText = document.read(contentFrom, contentTo);
        // Empty table — nothing to do.
        if (!contentText.trim()) return;
        const isMultiline = contentText.includes("\n");
        // Locate the last non-whitespace position inside the content.
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
          // Insert `,` immediately after the last field value AND
          // absorb any trailing spaces/tabs through end-of-line so
          // the trailing-whitespace trim pass can't fire on what
          // we just produced (would non-idempotent: pass 1 leaves
          // `0, `, pass 2 trims to `0,`). The range stretches to
          // the next `\n` (or content end) and we emit just `,`.
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
          // Delete the trailing `,` plus the whitespace that was
          // before AND after it inside the table braces — otherwise
          // the surrounding whitespace gets normalized on a second
          // pass (`b = 2 ` vs `b = 2`) and we lose idempotency.
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
          // A spaced one-line table keeps its space before the `}`
          // (`{ 1, 2 }`): the deletion outranks the space the
          // annotator forces there, so it writes that space itself.
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

// Edit-type precedence. When two overlapping edits can't merge,
// the higher-precedence one wins. Adding a new edit type? Drop one
// entry here and the conflict logic does the rest.
//
// Slots are spaced (10s) to leave room for future types without
// renumbering. Equal precedence is fine — they'll fall to the
// merge/adjacent-concat fallback.
const PRECEDENCE: Record<string, number> = {
  // Targeted character rewrites that nothing else should touch.
  trailing_comma_insert: 100,
  trailing_comma_delete: 100,
  quote_normalize: 100,
  crlf_normalize: 100,
  empty_block_compact: 100,
  opener_join: 110,
  elseif_join: 110,
  elseif_drop_end: 110,
  choice_mark: 100,
  // Structural line-level edits.
  blankline_insert: 100,
  blankline: 90,
  newline: 90,
  // Whitespace normalization at the leading column.
  indent: 80,
  // Mid-line whitespace.
  keyword_separator: 70,
  separator: 60,
  extra: 50,
  trailing: 40,
};

const precedence = (type: string) => PRECEDENCE[type] ?? 0;

// Pairs that can merge their ranges into one edit (rather than one
// winning and the other being dropped). The winner's `newText` is
// kept; the loser's range is unioned in.
const MERGEABLE: Set<string> = new Set([
  // Same-type unions: two adjacent whitespace dispatches at the same
  // boundary should fuse into one edit, not stay as two adjacent edits.
  "separator|separator",
  "extra|extra",
  // Cross-type mergeables: when both edits target overlapping
  // whitespace and their normalized intents are compatible.
  "keyword_separator|separator",
  "keyword_separator|keyword_separator",
  "separator|extra",
  // A keyword's forced space replaces the extra whitespace after it
  // (`with  (x)`) instead of being inserted beside it on every pass.
  "keyword_separator|extra",
]);

const isMergeable = (a: string, b: string) =>
  MERGEABLE.has(`${a}|${b}`) || MERGEABLE.has(`${b}|${a}`);

// Folds quote rewrites into already-resolved edits. An edit that only
// touches a rewrite changes different characters (`'x' .. 'y'` rewrites
// `'x'` and the space after it), so the two are joined into one edit,
// since touching edits are not applied independently. An edit that
// overlaps a rewrite gives way to it, as the rewrite outranks every
// whitespace edit. Both lists are in document order, so one merge pass
// folds them.
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
    // Everything that ends at or before the rewrite comes first.
    while (i < resolved.length && end(resolved[i]!) <= from) {
      result.push(resolved[i]!);
      i++;
    }
    // An edit (or an earlier folded rewrite) ending where this one
    // starts is joined in front of it.
    const last = result.at(-1);
    if (last && end(last) === from) {
      result.pop();
      q.newText = last.newText + q.newText;
      q.range.start = last.range.start;
    }
    // Edits overlapping the rewrite give way to it; one starting where
    // it ends is joined behind it.
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

  // A quote rewrite (`'x'` → `"x"`) changes only the string's own
  // characters, so it is folded in after the whitespace edits around it
  // have been resolved against each other: folding it in first would
  // join each of them to the rewrite, and two edits at one boundary
  // (`'a'|'b'`) would both keep their space.
  if (edits.some((e) => e.type === "quote_normalize")) {
    const rest = resolveFormattingConflicts(
      edits.filter((e) => e.type !== "quote_normalize"),
      document,
      formattingOnType,
    ) as (TextEdit & { type: string })[];
    const quotes = edits.filter((e) => e.type === "quote_normalize");
    return foldQuoteRewrites(rest, quotes, start, end);
  }

  // Union the prev edit's range with curr's, keeping prev's `newText`.
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
      // No overlap — just push. Touching edits (prev.end === curr.start)
      // ARE treated as conflicts here: VS Code's edit applier won't
      // accept adjacent non-overlapping ranges as independent edits,
      // so we collapse them through the same precedence/merge logic
      // below.
      result.push(curr);
      continue;
    }

    // blankline + indent is special: deleting a blank line AND
    // formatting the next line's indent should combine into ONE edit
    // covering both spans, with the indent text appended (so the
    // next line gets its leading whitespace right after the deletion).
    // Skip the concat in trim-and-keep cases where the blank line
    // itself was the body content (no text to indent).
    const blanklineIndentMerge =
      (prev.type === "blankline" && curr.type === "indent") ||
      (prev.type === "indent" && curr.type === "blankline");
    if (blanklineIndentMerge) {
      const blankline = prev.type === "blankline" ? prev : curr;
      const indent = prev.type === "indent" ? prev : curr;
      // Use the indent edit's *content line* as the trim check: if
      // that line has visible characters (or we're formatting-on-type
      // and need to preserve indent at the cursor), concat the
      // indent text after the blankline deletion. Otherwise the
      // blank-line removal stands alone.
      const indentLineHasContent =
        document.getLineText(indent.range.start.line).trim() !== "";
      const shouldConcat = indentLineHasContent || formattingOnType;
      unionInto(prev, curr);
      if (shouldConcat) {
        // The blankline edit deletes; the indent edit inserts WS.
        // After unioning ranges, the deletion + insertion = blankline-deleted-then-indent.
        if (prev.type === "blankline") prev.newText += indent.newText;
        else prev.newText = blankline.newText + prev.newText;
      } else {
        // Just the deletion. prev keeps its newText if it's the
        // blankline; otherwise replace.
        if (prev.type === "indent") prev.newText = blankline.newText;
      }
      // Force prev's type to whichever should dominate for downstream
      // (immaterial after this — the edit is final).
      prev.type = "blankline";
      continue;
    }

    // A blank line inserted before a line and that line's indent: the
    // blank line goes in front of the re-indented line, rather than the
    // insert winning and the indent waiting for the next format.
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
      // Mergeable overlap — keep whichever has higher precedence
      // (its `newText` wins); union ranges.
      if (precedence(curr.type) > precedence(prev.type)) {
        unionInto(curr, prev);
        result.pop();
        result.push(curr);
      } else {
        unionInto(prev, curr);
      }
      continue;
    }

    // Not mergeable — higher precedence wins, lower is dropped.
    // (Ties: drop curr, keep prev — arbitrary but stable.)
    if (precedence(curr.type) > precedence(prev.type)) {
      result.pop();
      result.push(curr);
      continue;
    }
    if (precedence(curr.type) < precedence(prev.type)) {
      continue;
    }

    // Equal precedence, not mergeable, overlapping. Two cases:
    //   - Pure deletions adjacent / overlapping: fuse the range, keep "".
    //   - Touching (prev.end === curr.start) but otherwise unrelated:
    //     fuse text into prev.
    // Anything else is a real conflict the formatter has produced —
    // log and drop curr to keep going.
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

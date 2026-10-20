// The syntax tree's nodes that decide which of a `.sd` file's text the type
// checker reads as Luau (`readLuauAst.ts`), kept apart from the checker so
// that the validator can ask the same question without loading it.

import type { SyntaxNode } from "@lezer/common";
import { explicitRuleNames, isExplicitRuleName } from "../utils/explicitRuleNames";
import { REASSIGNMENT_NAMES } from "../utils/reassignmentNames";
import { RUN_QUERY, runWrapperName } from "../utils/runWrapper";
import { VARIABLE_DEFINITION_NAMES } from "../utils/variableDefinitionNames";

// The statements of a `.sd` file that are Luau, wherever they sit.
export const LUAU_STATEMENTS = new Set([
  ...VARIABLE_DEFINITION_NAMES,
  // A top-level function's attributes, read with the function after them.
  "LuauFunctionAttributes",
  "LuauFunctionDefinition",
  "LuauSparkdownExplicitStatement",
  "LuauSparkdownExplicitBlockStatement",
  ...REASSIGNMENT_NAMES,
  "LuauReturnStatement",
  "LuauBreakStatement",
  "LuauContinueStatement",
  "LuauDataTypeDeclaration",
  "LuauFunctionTypeDeclaration",
  "LuauIfBlock",
  "LuauWhileLoop",
  "LuauForLoop",
  "LuauRepeatLoop",
  "LuauUntilCondition",
  "LuauStrayUntilStatement",
  "LuauDoBlock",
  "LuauSparkdownIfBlock",
  "LuauSparkdownWhileLoop",
  "LuauSparkdownForLoop",
  "LuauSparkdownRepeatLoop",
  "LuauSparkdownDoBlock",
  "LuauSparkdownExplicitDoBlock",
  "LuauSparkdownExplicitIfBlock",
  "LuauSparkdownExplicitLoop",
  "LuauSparkdownExplicitRepeatLoop",
  "LuauSparkdownChooseBlock",
].flatMap(explicitRuleNames));

// The headers that begin a flow.
export const FLOW_HEADERS = new Set(["Scene", "Branch"]);

// Nodes inside Luau statements that are Sparkdown's own: the `&` that marks
// a statement, the `choose`, `then` and `end` of a `choose` block, and the
// constructs Luau has no syntax for. A `choose` block opens no scope (a
// choice's statements run in its flow's), so the statements inside it are
// kept where they stand.
export const SPARKDOWN_ONLY = new Set([
  "LuauExplicitStatementMark",
  "LuauSparkdownChooseBlock_begin",
  "LuauSparkdownChooseThenClause_begin",
  "LuauSparkdownChooseBlock_end",
  "LuauDefine",
  "LuauStyle",
  "LuauLayout",
  "LuauScreen",
  "LuauAnimation",
  "LuauTheme",
  "LuauComponent",
  "LuauMorph",
  "LuauSparkdownAlternatorBlocks",
  "LuauSparkdownConditionalAlternatorBlock",
  "LuauSparkdownSequentialAlternatorBlock",
  "LuauSparkdownSingleLineConditionalAlternatorBlock",
  "LuauSparkdownSingleLineSequentialAlternatorBlock",
  "LuauSparkdownInlineGluedConditionalAlternatorBlock",
  "LuauSparkdownInlineGluedSequentialAlternatorBlock",
].flatMap(explicitRuleNames));

// Sparkdown's own expressions, which Luau has no syntax for: alternators,
// divert targets and regular expressions. Each is a value of type `any` to
// the checker (`SparkdownReading.ts`), so the rest of its statement is
// checked as written.
export const SPARKDOWN_EXPRESSIONS = new Set([
  "LuauConditionalAlternatorBlock",
  "LuauSequentialAlternatorBlock",
  "LuauDivertTargetLiteral",
  "LuauRegexLiteral",
].flatMap(explicitRuleNames));

// A comment, or a part of one the tree reads apart from it (the `]]` that
// closes a block comment after a value or type); a cast after a comment is not one.
export const COMMENT = /^Luau(?!(?:SparkdownExplicit)?TargetTypeCastAfterComment$)\w*Comment(Close|Content|Mark|Tags)?$/;

// Nodes that may sit anywhere in Luau: trivia and punctuation.
export const NEUTRAL = /^(Newline|OptionalWhitespace|RequiredWhitespace|ExtraWhitespace|Whitespace|Punctuation\w+)$/;

// The scope modifiers that are Luau's; any other (`store`) is Sparkdown's own,
// and the checker reads its declaration without it.
export const LUAU_SCOPE_MODIFIERS = new Set(["local", "const"]);

/**
 * Whether the type checker reads a node as Luau: a node of one of a file's
 * Luau statements, outside what is Sparkdown's own in it, and not in a
 * declaration whose scope modifier is Sparkdown's own (`store x: = 1`),
 * whose syntax errors are Sparkdown's own syntax's to report. A flow
 * header's parameters are not among them: the checker reads them only when
 * they are Luau's as written.
 */
export function isCheckedLuau(node: SyntaxNode, read: (from: number, to: number) => string): boolean {
  for (let n: SyntaxNode | null = node; n; n = n.parent) {
    if (SPARKDOWN_ONLY.has(n.name) || SPARKDOWN_EXPRESSIONS.has(n.name)) return false;
    if (!n.name.startsWith("Luau") && !NEUTRAL.test(n.name)) return false;
    if (VARIABLE_DEFINITION_NAMES.has(n.name)) {
      const modifier = findChild(n.getChild(`${n.name}_begin`)?.firstChild ?? null, "LuauScopeModifier");
      if (modifier && !LUAU_SCOPE_MODIFIERS.has(read(modifier.from, modifier.to).trim())) return false;
    }
    if (n.parent && !n.parent.parent) return LUAU_STATEMENTS.has(n.name);
  }
  return false;
}

/**
 * Whether a node is in a function's own Luau, its header or its body, a
 * pure-Luau body, where the type checker reports every error of Luau's
 * reading, its recovery's included (I-1322). A story statement's Luau is
 * bounded by its line, and its errors have one owner each (#931, #1907).
 */
export function inLuauFunction(node: SyntaxNode | null): boolean {
  for (let n = node; n; n = n.parent) {
    if (n.name === "LuauFunctionDefinition") return true;
  }
  return false;
}

/**
 * Whether a reading of Luau reports every syntax error of Luau's at a node
 * (I-1322): the type checker's, where the node is in a `.luau` or `run`
 * file (`uri`, the document's), whose whole text is Luau, or it is Luau the
 * checker reads (`isCheckedLuau`) in a function's own Luau
 * (`inLuauFunction`); or a lowerer's, where it is in the body of a define's
 * method or a Sparkle handler's closure (`loweredLuauBodyOf`, I-1368).
 * There a validator or lowerer reports none of Luau's own syntax errors
 * from the tree.
 */
export function luauReadingReportsAllAt(node: SyntaxNode, read: (from: number, to: number) => string, uri?: string): boolean {
  if (uri !== undefined && isLuauDocument(uri)) return true;
  if (loweredLuauBodyOf(node)) return true;
  return inLuauFunction(node) && isCheckedLuau(node, read);
}

// The nodes of a define's method's content that are its header, not its
// body's statements (`METHOD_BODY_SKIP` in `lowerLuauDefine.ts`).
const METHOD_HEADER = new Set([
  "LuauFunctionDeclarationName",
  "LuauFunctionName",
  "LuauFunctionParameters",
  "LuauFunctionReturnType",
  "LuauGenericsDeclaration",
]);

/**
 * The reading a node's body is in where the type checker does not read it
 * and its lowerer reports every syntax error of Luau's reading of the body
 * alone, its `end` included (`reportBodySyntaxErrors`, I-1368): a define's
 * method, in either spelling (`f()` … `end`, `function f()` … `end`), or a
 * Sparkle handler's closure. Null outside them, and in a method's header,
 * whose errors are not its body's.
 */
export function loweredLuauBodyOf(node: SyntaxNode | null): SyntaxNode | null {
  for (let n = node; n?.parent; n = n.parent) {
    const content = n.parent;
    const method =
      content.name === "LuauMethodDefinition_content" ||
      (content.name === "LuauFunctionDefinition_content" && content.parent?.parent?.name === "LuauDefine_content");
    if (method) return METHOD_HEADER.has(n.name) ? null : content.parent;
    if (content.name === "LuauSparkleHandlerClosure_content") return content.parent;
  }
  return null;
}

/**
 * Where a lowerer's reading of a body stops reading the author's text
 * (`loweredLuauBodyOf`): a method's reading reads its `end`, a Sparkle
 * handler closure's stops before its `}`, which is Sparkdown's own token,
 * and closes the function value it runs as with an `end` of its own there.
 */
export function loweredReadingEnd(body: SyntaxNode): number {
  return body.getChild("LuauSparkleHandlerClosure_content")?.to ?? body.to;
}

/**
 * Whether a reading of Luau that reports its syntax errors reads a node:
 * the type checker's (`isCheckedLuau`), or a lowerer's of a body the
 * checker does not read (`loweredLuauBodyOf`).
 */
export function isReadLuau(node: SyntaxNode, read: (from: number, to: number) => string): boolean {
  return isCheckedLuau(node, read) || loweredLuauBodyOf(node) !== null;
}

/** Whether a document is a Luau file, which is Luau from its first line to its last. */
export function isLuauFile(uri: string): boolean {
  const path = uri.split(/[?#]/, 1)[0]!;
  return path.endsWith(".luau") && !uri.includes(RUN_QUERY);
}

/** Whether a document is all Luau: a `.luau` file, or the `run` wrapper of one. */
export function isLuauDocument(uri: string): boolean {
  return isLuauFile(uri) || runWrapperName(uri) !== undefined;
}

/**
 * Whether the type checker reads the token at a document position as Luau,
 * asked from any node of the same tree. Where it does not (a `;` or a word
 * the grammar reads as story in a narrative body, a scene's `end`), the
 * checker cannot report an error at that token, so Sparkdown reports it.
 */
export function isCheckedLuauAt(anyNode: SyntaxNode, position: number, read: (from: number, to: number) => string): boolean {
  let root = anyNode;
  while (root.parent) root = root.parent;
  return isCheckedLuau(root.resolveInner(position, 1), read);
}

// Luau's reserved words, which are never a name.
export const RESERVED: ReadonlySet<string> = new Set([
  "and",
  "break",
  "do",
  "else",
  "elseif",
  "end",
  "false",
  "for",
  "function",
  "if",
  "in",
  "local",
  "nil",
  "not",
  "or",
  "repeat",
  "return",
  "then",
  "true",
  "until",
  "while",
]);

// The statements the tree begins on a new line where Luau's parser could
// read on into the statement before them (`a, b = 1,` before a line `goto
// done`, or `x = if c then 1 else` before a line `x = 6`): those that begin
// with a word Luau reads as a name (`x`, `goto`, `type`, `const`, `define`)
// or with `function` and a name, which Luau reads as a function value with a
// name after a comma or an operator (`breaksStatement`); the tree also reads
// a function value as a function definition, which has no name. Sparkdown
// ends the statement before them, and so does the type checker's reading
// (`readLuauAst.ts`); what that statement lacks there is Sparkdown's own
// syntax's to report.
export const STATEMENT_BREAKS = new Set([
  ...VARIABLE_DEFINITION_NAMES,
  ...REASSIGNMENT_NAMES,
  "LuauFunctionDefinition",
  "LuauGotoStatement",
  "LuauDataTypeDeclaration",
  "LuauFunctionTypeDeclaration",
  "LuauDefine",
  "LuauStyle",
  "LuauLayout",
  "LuauScreen",
  "LuauAnimation",
  "LuauTheme",
  "LuauComponent",
  "LuauMorph",
]);

/**
 * Whether a statement node's text (from `STATEMENT_BREAKS`) begins with a
 * word Luau's parser could read as part of the statement before it: a name,
 * or `function` and a name. A statement that begins with any other reserved
 * word ends the one before it in Luau too.
 */
export function breaksStatement(text: string): boolean {
  const words = /^\s*([A-Za-z_][A-Za-z0-9_]*)(\s+[A-Za-z_])?/.exec(text);
  const word = words?.[1];
  if (word === "function") return words?.[2] !== undefined;
  return word !== undefined && !RESERVED.has(word);
}

/**
 * Whether the reading ends a statement before one the tree begins that
 * `breaksStatement` lets end it, given the text between the last token
 * before that statement and its first word: only across a line end. On the
 * line of the statement before, the reading carries that statement on
 * (`local a, const = 1, 2` is one declaration), as Luau does.
 */
export function breaksAcrossLine(between: string): boolean {
  return between.includes("\n");
}

/**
 * Whether the type checker's reading ends the statement before a node the
 * tree begins (`STATEMENT_BREAKS`), given the last Luau token before it,
 * comments aside. The reading carries a statement on into an assignment
 * (`local a, b =` before a line `f(1),`, which the tree reads as an
 * assignment's targets), except after an empty if-expression arm, whose
 * last token is the arm's `then` or `else`: that arm's missing value must
 * not take the next assignment's target. Whether the node's first word
 * breaks the statement in Luau is `breaksStatement`'s to decide.
 */
export function endsStatementBefore(name: string, previousToken: string | undefined): boolean {
  if (!STATEMENT_BREAKS.has(name)) return false;
  return !isExplicitRuleName(name, "LuauReassignment") || previousToken === "then" || previousToken === "else";
}

/**
 * Whether the type checker reads a construct and the token after it as one
 * statement, and so reports what the construct is missing at that token,
 * with Luau's wording and range (#1175): the construct is Luau it reads
 * (`isCheckedLuau`), and so is the token (from `tokenFrom`, or the end of the
 * Luau when there is none), with no statement the tree begins at the token
 * that the reading ends the construct's statement before (`STATEMENT_BREAKS`).
 * Otherwise Sparkdown's own syntax ends the statement first (at story in a
 * narrative body, a scene's `end`, or `goto` after a line-ending comma), and
 * Sparkdown reports what the construct lacks. In a body whose lowerer
 * reads it in the checker's stead (`loweredLuauBodyOf`), that reading
 * reports it, at a token up to the body's own end, a closure's `}`
 * included, which the reading names where it closes the closure
 * (`closureReadingErrors`).
 */
export function checkerReadsOnTo(node: SyntaxNode, tokenFrom: number | undefined, read: (from: number, to: number) => string): boolean {
  const lowered = loweredLuauBodyOf(node);
  if (lowered) return tokenFrom === undefined || (tokenFrom < lowered.to && readingCarriesOnTo(node, tokenFrom, read));
  if (!isCheckedLuau(node, read)) return false;
  if (tokenFrom === undefined) return true;
  let root = node;
  while (root.parent) root = root.parent;
  if (!isCheckedLuau(root.resolveInner(tokenFrom, 1), read)) return false;
  return readingCarriesOnTo(node, tokenFrom, read);
}

/**
 * Whether Luau's reading of a construct, the type checker's or a lowerer's
 * own, carries its statement on to the token at `tokenFrom`: no statement
 * the tree begins at the token is one the reading ends the construct's
 * statement before (`STATEMENT_BREAKS`, `breaksStatement`, across a line
 * end). Whether the type checker reads the construct at all is
 * `checkerReadsOnTo`'s question, not this one's.
 */
export function readingCarriesOnTo(node: SyntaxNode, tokenFrom: number, read: (from: number, to: number) => string): boolean {
  let root = node;
  while (root.parent) root = root.parent;
  const token = root.resolveInner(tokenFrom, 1);
  for (let n: SyntaxNode | null = token; n; n = n.parent) {
    if (!STATEMENT_BREAKS.has(n.name)) continue;
    // The construct's last word, comments aside, is the token the reading
    // holds before this one.
    const own = textWithoutComments(node, read).trimEnd();
    const lastWord = /(?:^|[^A-Za-z0-9_])([A-Za-z_][A-Za-z0-9_]*)$/.exec(own)?.[1];
    if (!endsStatementBefore(n.name, lastWord)) return true;
    const text = read(n.from, n.to);
    if (n.from + text.length - text.trimStart().length !== tokenFrom || !breaksStatement(text)) return true;
    return !breaksAcrossLine(read(node.from + own.length, tokenFrom));
  }
  return true;
}

/** A node's text with each comment the tree holds in it (`COMMENT`, as the checker's reading skips them) replaced by spaces. */
function textWithoutComments(node: SyntaxNode, read: (from: number, to: number) => string): string {
  let text = "";
  let at = node.from;
  const walk = (parent: SyntaxNode): void => {
    for (let child = parent.firstChild; child; child = child.nextSibling) {
      if (!COMMENT.test(child.name)) {
        walk(child);
        continue;
      }
      text += read(at, child.from) + " ".repeat(child.to - child.from);
      at = child.to;
    }
  };
  walk(node);
  return text + read(at, node.to);
}

/** The first node of a name among a node and its later siblings, and under them, depth first. */
function findChild(node: SyntaxNode | null, name: string): SyntaxNode | null {
  for (let child = node; child; child = child.nextSibling) {
    if (child.name === name) return child;
    const found = findChild(child.firstChild, name);
    if (found) return found;
  }
  return null;
}

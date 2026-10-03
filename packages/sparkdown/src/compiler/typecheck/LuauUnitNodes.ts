// The syntax tree's nodes that decide which of a `.sd` file's text the type
// checker reads as Luau (`readLuauAst.ts`), kept apart from the checker so
// that the validator can ask the same question without loading it.

import type { SyntaxNode } from "@lezer/common";
import { REASSIGNMENT_NAMES } from "../utils/reassignmentNames";
import { RUN_QUERY } from "../utils/runWrapper";
import { VARIABLE_DEFINITION_NAMES } from "../utils/variableDefinitionNames";

// The statements of a `.sd` file that are Luau, wherever they sit.
export const LUAU_STATEMENTS = new Set([
  ...VARIABLE_DEFINITION_NAMES,
  "LuauFunctionDefinition",
  "LuauExplicitStatement",
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
]);

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
]);

// Sparkdown's own expressions, which Luau has no syntax for: alternators,
// divert targets and regular expressions. Each is a value of type `any` to
// the checker (`SparkdownReading.ts`), so the rest of its statement is
// checked as written.
export const SPARKDOWN_EXPRESSIONS = new Set([
  "LuauConditionalAlternatorBlock",
  "LuauSequentialAlternatorBlock",
  "LuauDivertTargetLiteral",
  "LuauRegexLiteral",
]);

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

/** Whether a document is a Luau file, which is Luau from its first line to its last. */
export function isLuauFile(uri: string): boolean {
  const path = uri.split(/[?#]/, 1)[0]!;
  return path.endsWith(".luau") && !uri.includes(RUN_QUERY);
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
 * Whether the type checker reads a construct and the token after it as one
 * statement, and so reports what the construct is missing at that token,
 * with Luau's wording and range (#1175): the construct is Luau it reads
 * (`isCheckedLuau`), and so is the token (from `tokenFrom`, or the end of the
 * Luau when there is none), with no statement the tree begins at the token
 * that the reading ends the construct's statement before (`STATEMENT_BREAKS`).
 * Otherwise Sparkdown's own syntax ends the statement first (at story in a
 * narrative body, a scene's `end`, or `goto` after a line-ending comma), and
 * Sparkdown reports what the construct lacks.
 */
export function checkerReadsOnTo(node: SyntaxNode, tokenFrom: number | undefined, read: (from: number, to: number) => string): boolean {
  if (!isCheckedLuau(node, read)) return false;
  if (tokenFrom === undefined) return true;
  let root = node;
  while (root.parent) root = root.parent;
  const token = root.resolveInner(tokenFrom, 1);
  if (!isCheckedLuau(token, read)) return false;
  for (let n: SyntaxNode | null = token; n; n = n.parent) {
    if (!STATEMENT_BREAKS.has(n.name)) continue;
    const text = read(n.from, n.to);
    return !(n.from + text.length - text.trimStart().length === tokenFrom && breaksStatement(text));
  }
  return true;
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

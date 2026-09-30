// The syntax tree's nodes that decide which of a `.sd` file's text the type
// checker reads as Luau (see `sparkdownUnits` in `LuauDocumentChecker.ts`),
// kept apart from the checker so that the validator can ask the same
// question without loading it.

import type { SyntaxNode } from "@lezer/common";
import { VARIABLE_DEFINITION_NAMES } from "../utils/variableDefinitionNames";

// The statements of a `.sd` file that are Luau, wherever they sit.
export const LUAU_STATEMENTS = new Set([
  ...VARIABLE_DEFINITION_NAMES,
  "LuauFunctionDefinition",
  "LuauExplicitStatement",
  "LuauReassignment",
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
  "LuauSparkdownReturnStatement",
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
  "LuauUIElement",
  "LuauSparkdownAlternatorBlocks",
  "LuauSparkdownConditionalAlternatorBlock",
  "LuauSparkdownSequentialAlternatorBlock",
  "LuauSparkdownSingleLineConditionalAlternatorBlock",
  "LuauSparkdownSingleLineSequentialAlternatorBlock",
  "LuauSparkdownInlineGluedConditionalAlternatorBlock",
  "LuauSparkdownInlineGluedSequentialAlternatorBlock",
]);

// Sparkdown's own expressions, which Luau has no syntax for: alternators,
// divert targets and regular expressions. Each is checked as a call of the
// checker's `any` value, `_G` unless the document writes that name itself
// (see `ANY_NAMES`), or as the value alone where the expression is too short
// for the call, so the rest of its statement is checked as written.
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
 * declaration whose scope modifier is Sparkdown's own (`store x: = 1`), whose
 * annotation the checker reads without its declaration. A flow header's
 * parameters are not among them: the checker reads them only when they are
 * Luau's as written.
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

/** The first node of a name among a node and its later siblings, and under them, depth first. */
function findChild(node: SyntaxNode | null, name: string): SyntaxNode | null {
  for (let child = node; child; child = child.nextSibling) {
    if (child.name === name) return child;
    const found = findChild(child.firstChild, name);
    if (found) return found;
  }
  return null;
}

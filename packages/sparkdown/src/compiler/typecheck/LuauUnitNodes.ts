import type { SyntaxNode } from "@lezer/common";
import { ALTERNATOR_CANDIDATES, opensAlternator } from "../utils/alternatorDecision";
import { loweredDefinePropertyOf, loweredDefineStatementOf } from "../utils/defineStatement";
import { explicitRuleNames, isExplicitRuleName } from "../utils/explicitRuleNames";
import { REASSIGNMENT_NAMES } from "../utils/reassignmentNames";
import { RUN_QUERY, runWrapperName } from "../utils/runWrapper";
import { VARIABLE_DEFINITION_NAMES } from "../utils/variableDefinitionNames";
import { RESERVED } from "../utils/luauReservedWords";

export const LUAU_STATEMENTS = new Set([
  ...VARIABLE_DEFINITION_NAMES,
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

export const FLOW_HEADERS = new Set(["Scene", "Branch"]);

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

export const SPARKDOWN_EXPRESSIONS = new Set([
  "LuauConditionalAlternatorBlock",
  "LuauSequentialAlternatorBlock",
  "LuauConditionalAlternatorLineStart",
  "LuauSequentialAlternatorLineStart",
  "LuauDivertTargetLiteral",
  "LuauRegexLiteral",
].flatMap(explicitRuleNames));

export function isSparkdownExpression(node: SyntaxNode): boolean {
  return SPARKDOWN_EXPRESSIONS.has(node.name) && opensAlternator(node);
}

export const COMMENT = /^Luau(?!(?:SparkdownExplicit)?TargetTypeCastAfterComment$)\w*Comment(Close|Content|Mark|Tags)?$/;

export const NEUTRAL = /^(Newline|OptionalWhitespace|RequiredWhitespace|ExtraWhitespace|Whitespace|Punctuation\w+)$/;

export const LUAU_SCOPE_MODIFIERS = new Set(["local", "const"]);

export function isLuauNodeName(name: string): boolean {
  return name.startsWith("Luau");
}

export function isCheckedLuau(node: SyntaxNode, read: (from: number, to: number) => string): boolean {
  for (let n: SyntaxNode | null = node; n; n = n.parent) {
    if (SPARKDOWN_ONLY.has(n.name) || isSparkdownExpression(n)) return false;
    if (!isLuauNodeName(n.name) && !NEUTRAL.test(n.name)) return false;
    if (VARIABLE_DEFINITION_NAMES.has(n.name)) {
      const modifier = findChild(n.getChild(`${n.name}_begin`)?.firstChild ?? null, "LuauScopeModifier");
      if (modifier && !LUAU_SCOPE_MODIFIERS.has(read(modifier.from, modifier.to).trim())) return false;
    }
    if (n.parent && !n.parent.parent) return LUAU_STATEMENTS.has(n.name);
  }
  return false;
}

export function inLuauFunction(node: SyntaxNode | null): boolean {
  for (let n = node; n; n = n.parent) {
    if (n.name === "LuauFunctionDefinition") return true;
  }
  return false;
}

export function luauReadingReportsAllAt(node: SyntaxNode, read: (from: number, to: number) => string, uri?: string): boolean {
  if (uri !== undefined && isLuauDocument(uri)) return true;
  if (loweredLuauBodyOf(node) || loweredDefineStatementOf(node, read)) return true;
  return inLuauFunction(node) && isCheckedLuau(node, read);
}

const METHOD_HEADER = new Set([
  "LuauFunctionDeclarationName",
  "LuauFunctionName",
  "LuauFunctionParameters",
  "LuauFunctionReturnType",
  "LuauGenericsDeclaration",
]);

export function loweredLuauBodyOf(node: SyntaxNode | null): SyntaxNode | null {
  for (let n = node; n?.parent; n = n.parent) {
    if (SPARKDOWN_ONLY.has(n.name) || SPARKDOWN_EXPRESSIONS.has(n.name)) return null;
    const content = n.parent;
    const method =
      content.name === "LuauMethodDefinition_content" ||
      (content.name === "LuauFunctionDefinition_content" && content.parent?.parent?.name === "LuauDefine_content");
    if (method) return METHOD_HEADER.has(n.name) ? null : content.parent;
    if (content.name === "LuauSparkleHandlerClosure_content") return content.parent;
  }
  return null;
}

const DOUBLE_QUOTED_INTERPOLATION = "LuauDoubleQuotedStringInterpolation";

export function storyStoreOf(node: SyntaxNode | null, read: (from: number, to: number) => string): SyntaxNode | null {
  let store: SyntaxNode | null = null;
  for (let n = node; n; n = n.parent) {
    if (SPARKDOWN_ONLY.has(n.name) || SPARKDOWN_EXPRESSIONS.has(n.name)) return null;
    if (!store && n.name.startsWith(DOUBLE_QUOTED_INTERPOLATION)) return null;
    if (!store && VARIABLE_DEFINITION_NAMES.has(n.name)) {
      const modifier = findChild(n.getChild(`${n.name}_begin`)?.firstChild ?? null, "LuauScopeModifier");
      if (modifier && read(modifier.from, modifier.to).trim() === "store") store = n;
    }
  }
  return store && !inLuauFunction(store) && !luauReadingReportsAllAt(store, read) ? store : null;
}

export function loweredReadingEnd(body: SyntaxNode): number {
  return body.getChild("LuauSparkleHandlerClosure_content")?.to ?? body.to;
}

export function isReadLuau(node: SyntaxNode, read: (from: number, to: number) => string): boolean {
  return isCheckedLuau(node, read) || loweredLuauBodyOf(node) !== null || loweredDefineStatementOf(node, read) !== null;
}

export function isLuauFile(uri: string): boolean {
  const path = uri.split(/[?#]/, 1)[0]!;
  return path.endsWith(".luau") && !uri.includes(RUN_QUERY);
}

export function isLuauDocument(uri: string): boolean {
  return isLuauFile(uri) || runWrapperName(uri) !== undefined;
}

export function isCheckedLuauAt(anyNode: SyntaxNode, position: number, read: (from: number, to: number) => string): boolean {
  let root = anyNode;
  while (root.parent) root = root.parent;
  return isCheckedLuau(root.resolveInner(position, 1), read);
}

export { RESERVED };

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

export function breaksStatement(text: string): boolean {
  const words = /^\s*([A-Za-z_][A-Za-z0-9_]*)(\s+[A-Za-z_])?/.exec(text);
  const word = words?.[1];
  if (word === "function") return words?.[2] !== undefined;
  return word !== undefined && !RESERVED.has(word);
}

export function breaksAcrossLine(between: string): boolean {
  return between.includes("\n");
}

export function endsStatementBefore(name: string, previousToken: string | undefined): boolean {
  if (!STATEMENT_BREAKS.has(name)) return false;
  return !isExplicitRuleName(name, "LuauReassignment") || previousToken === "then" || previousToken === "else";
}

export function checkerReadsOnTo(node: SyntaxNode, tokenFrom: number | undefined, read: (from: number, to: number) => string): boolean {
  const lowered = loweredLuauBodyOf(node);
  if (lowered) return tokenFrom === undefined || (tokenFrom < lowered.to && readingCarriesOnTo(node, tokenFrom, read));
  if (loweredDefineStatementOf(node, read) || loweredDefinePropertyOf(node, read)) return tokenFrom === undefined || readingCarriesOnTo(node, tokenFrom, read);
  if (!isCheckedLuau(node, read)) {
    const expression = loweredExpressionOf(node);
    return !!expression && (tokenFrom === undefined || tokenFrom < expression.to || unclosedBrace(expression));
  }
  if (tokenFrom === undefined) return true;
  let root = node;
  while (root.parent) root = root.parent;
  if (!isCheckedLuau(root.resolveInner(tokenFrom, 1), read)) return false;
  return readingCarriesOnTo(node, tokenFrom, read);
}

const STORY_BRACES = new Set(["LuauInterpolatedStringExpression", "LuauFunctionCallShorthand"].flatMap(explicitRuleNames));
const STORY_TEXT = new Set(["TextChunk", "ChoiceTextContent"]);
const ARM_STORY = new Set(["LuauSparkdownAlternatorArm", "LuauSparkdownInlineGluedAlternatorArm"]);
const ALTERNATOR_HEADS = new Set(["LuauAlternatorHead", "LuauAlternatorLineStartHead"].flatMap(explicitRuleNames));
const STORY_CONDITIONAL_ALTERNATORS = new Set(
  ["LuauSparkdownConditionalAlternatorBlock", "LuauSparkdownInlineGluedConditionalAlternatorBlock"].flatMap(explicitRuleNames),
);

export function enclosingAlternator(node: SyntaxNode | null): SyntaxNode | null {
  for (let n = node; n; n = n.parent) {
    if (ALTERNATOR_CANDIDATES.has(n.name) || STORY_CONDITIONAL_ALTERNATORS.has(n.name)) return n;
  }
  return null;
}

export function loweredExpressionOf(node: SyntaxNode | null): SyntaxNode | null {
  for (let n = node; n?.parent; n = n.parent) {
    if (isExplicitRuleName(n.name, "ChoiceCondition")) return n;
    if (ALTERNATOR_HEADS.has(n.name)) return enclosingAlternator(n.parent);
    if (isExplicitRuleName(n.name, "LuauConditionalAlternatorCondition") && STORY_CONDITIONAL_ALTERNATORS.has(n.parent.parent?.name ?? "")) {
      return n.parent.parent;
    }
    const arms = n.parent.parent;
    if (arms && isExplicitRuleName(arms.name, "LuauAlternatorArms") && n.parent.name === `${arms.name}_content`) {
      if (LUAU_STATEMENTS.has(n.name) || ARM_STORY.has(n.name)) return null;
      const alternator = arms.parent?.parent;
      return alternator && ALTERNATOR_CANDIDATES.has(alternator.name) ? alternator : null;
    }
    if (STORY_BRACES.has(n.name)) {
      for (let text: SyntaxNode | null = n.parent; text; text = text.parent) {
        if (STORY_TEXT.has(text.name)) return n;
        if (isExplicitRuleName(text.name, "Tag") || isLuauNodeName(text.name)) return null;
      }
      return null;
    }
  }
  return null;
}

function unclosedBrace(expression: SyntaxNode): boolean {
  if (!STORY_BRACES.has(expression.name)) return false;
  const close = expression.getChild(`${expression.name}_end`);
  return !close || close.from === close.to;
}

export function readingCarriesOnTo(node: SyntaxNode, tokenFrom: number, read: (from: number, to: number) => string): boolean {
  let root = node;
  while (root.parent) root = root.parent;
  const token = root.resolveInner(tokenFrom, 1);
  for (let n: SyntaxNode | null = token; n; n = n.parent) {
    if (!STATEMENT_BREAKS.has(n.name)) continue;
    const own = textWithoutComments(node, read).trimEnd();
    const lastWord = /(?:^|[^A-Za-z0-9_])([A-Za-z_][A-Za-z0-9_]*)$/.exec(own)?.[1];
    if (!endsStatementBefore(n.name, lastWord)) return true;
    const text = read(n.from, n.to);
    if (n.from + text.length - text.trimStart().length !== tokenFrom || !breaksStatement(text)) return true;
    return !breaksAcrossLine(read(node.from + own.length, tokenFrom));
  }
  return true;
}

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

function findChild(node: SyntaxNode | null, name: string): SyntaxNode | null {
  for (let child = node; child; child = child.nextSibling) {
    if (child.name === name) return child;
    const found = findChild(child.firstChild, name);
    if (found) return found;
  }
  return null;
}

import type { SyntaxNode } from "@lezer/common";
import { nodeNameSet } from "./nodeNameSet";
import { VARIABLE_DEFINITION_NAMES } from "./variableDefinitionNames";

export const TOP_LEVEL_STATEMENT_MESSAGE =
  "statement must be inside a scene or branch; the top level holds declarations only";

const DECLARATIONS = nodeNameSet([
  "Run",
  "LuauDefine",
  "LuauStyle",
  "LuauLayout",
  "LuauScreen",
  "LuauComponent",
  "LuauAnimation",
  "LuauTheme",
  "LuauMorph",
  "LuauExternalDeclaration",
  "LuauDataTypeDeclaration",
  "LuauFunctionTypeDeclaration",
]);

const FUNCTIONS = nodeNameSet([
  "LuauFunctionDefinition",
  "LuauFunctionAttributes",
]);

export const EXPLICIT = nodeNameSet(["LuauSparkdownExplicitStatement"]);

const SEPARATORS = nodeNameSet(["LuauSemicolonSeparator"]);

export const FLOWS = nodeNameSet(["Scene", "Branch"]);

const STRUCTURE = nodeNameSet(["LuauEndKeyword", "Include"]);

export function topLevelStatements(
  top: SyntaxNode,
  read: (from: number, to: number) => string,
): Map<number, boolean> {
  const found = new Map<number, boolean>();
  let depth = 0;
  for (let node = top.firstChild; node; node = node.nextSibling) {
    if (FLOWS.has(node.name)) {
      depth += 1;
    } else if (node.name === "LuauEndKeyword") {
      depth = Math.max(0, depth - 1);
    } else if (
      depth === 0 &&
      !STRUCTURE.has(node.name) &&
      !node.name.endsWith("Comment")
    ) {
      found.set(node.from, declares(node, read));
    }
  }
  return found;
}

export function runnableTopLevelRuns(
  top: SyntaxNode,
  read: (from: number, to: number) => string,
): { from: number; to: number }[] {
  const runs: { from: number; to: number }[] = [];
  let run: { from: number; to: number } | undefined;
  let depth = 0;
  for (let node = top.firstChild; node; node = node.nextSibling) {
    if (FLOWS.has(node.name)) {
      depth += 1;
      run = undefined;
    } else if (node.name === "LuauEndKeyword") {
      depth = Math.max(0, depth - 1);
      run = undefined;
    } else if (
      depth > 0 ||
      node.name === "Newline" ||
      node.name.endsWith("Whitespace") ||
      node.name.endsWith("Comment")
    ) {
      continue;
    } else if (STRUCTURE.has(node.name) || declares(node, read)) {
      run = undefined;
    } else if (run) {
      run.to = node.to;
    } else {
      run = { from: node.from, to: node.to };
      runs.push(run);
    }
  }
  return runs;
}

const declares = (
  node: SyntaxNode,
  read: (from: number, to: number) => string,
): boolean => {
  if (DECLARATIONS.has(node.name)) {
    return true;
  }
  if (EXPLICIT.has(node.name)) {
    const content = childEndingWith(node, "_content");
    const marked = content ? statementsOf(content) : [];
    return marked.length > 0 && marked.every((statement) => declares(statement, read));
  }
  if (FUNCTIONS.has(node.name)) {
    return scopeOf(node, read) !== "local";
  }
  if (VARIABLE_DEFINITION_NAMES.has(node.name)) {
    const scope = scopeOf(node, read);
    return scope === "store" || scope === "const";
  }
  return false;
};

export const childEndingWith = (
  node: SyntaxNode,
  suffix: string,
): SyntaxNode | undefined => {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name.endsWith(suffix)) {
      return child;
    }
  }
  return undefined;
};

export const statementsOf = (content: SyntaxNode): SyntaxNode[] => {
  const statements: SyntaxNode[] = [];
  for (let child = content.firstChild; child; child = child.nextSibling) {
    if (
      !SEPARATORS.has(child.name) &&
      !child.name.endsWith("Whitespace") &&
      !child.name.endsWith("Comment")
    ) {
      statements.push(child);
    }
  }
  return statements;
};

export const findWithin = (node: SyntaxNode, name: string): SyntaxNode | undefined => {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) {
      return child;
    }
    const found = findWithin(child, name);
    if (found) {
      return found;
    }
  }
  return undefined;
};

export const scopeOf = (
  node: SyntaxNode,
  read: (from: number, to: number) => string,
): string | undefined => {
  const definition =
    node.name === "LuauFunctionAttributes"
      ? (findWithin(node, "LuauFunctionDefinition") ?? node)
      : node;
  const header = childEndingWith(definition, "_begin");
  const modifier = header && findWithin(header, "LuauScopeModifier");
  return modifier ? read(modifier.from, modifier.to).trim() : undefined;
};

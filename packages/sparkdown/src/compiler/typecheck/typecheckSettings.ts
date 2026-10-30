import type { SyntaxNode, Tree } from "@lezer/common";
import { TYPECHECK_MODE_NAMES } from "./LuauDocumentChecker";

export interface TypecheckSetting {
  value: string;
  from: number;
  to: number;
}

type Read = (from: number, to: number) => string;

function descendant(node: SyntaxNode, name: string): SyntaxNode | undefined {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === name) return c;
    const found = descendant(c, name);
    if (found) return found;
  }
  return undefined;
}

function descendants(node: SyntaxNode, name: string, found: SyntaxNode[] = []): SyntaxNode[] {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === name) found.push(c);
    else descendants(c, name, found);
  }
  return found;
}

function trimmed(read: Read, from: number, to: number): TypecheckSetting {
  const text = read(from, to);
  const start = text.length - text.trimStart().length;
  const value = text.trim();
  return { value, from: from + start, to: from + start + value.length };
}

export function frontMatterTypecheckSetting(tree: Tree, read: Read): TypecheckSetting | undefined {
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (node.name !== "FrontMatter") continue;
    for (const field of descendants(node, "FrontMatterField")) {
      const keyword = descendant(field, "FrontMatterFieldKeyword");
      if (!keyword || read(keyword.from, keyword.to).trim() !== "typecheck") continue;
      const value = descendant(field, "FrontMatterString");
      return value ? trimmed(read, value.from, value.to) : { value: "", from: keyword.to, to: keyword.to };
    }
  }
  return undefined;
}

export function configTypecheckSetting(tree: Tree, read: Read): TypecheckSetting | undefined {
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (node.name !== "LuauDefine") continue;
    const name = descendant(node, "LuauDefineName");
    const parent = descendant(node, "LuauDefineParentName");
    if (!name || !parent || read(name.from, name.to) !== "typecheck" || read(parent.from, parent.to) !== "config") continue;
    for (const property of descendants(node, "LuauPropertyDefinition")) {
      const variable = descendant(property, "LuauVariableName");
      const assignment = descendant(property, "LuauAssignmentOperation");
      if (!variable || !assignment || read(variable.from, variable.to) !== "mode") continue;
      const operator = descendant(assignment, "LuauAssignmentOperator");
      return trimmed(read, operator ? operator.to : assignment.from, assignment.to);
    }
  }
  return undefined;
}

export function unknownModeMessage(value: string): string {
  return `Unknown type checking mode ${JSON.stringify(value)}; the modes are ${TYPECHECK_MODE_NAMES.map((m) => `"${m}"`).join(", ")}`;
}

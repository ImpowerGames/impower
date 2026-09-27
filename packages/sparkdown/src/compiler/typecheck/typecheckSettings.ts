// Where a program says how strictly to type check it: `config.typecheck.mode`
// for the project, and a `.sd` file's `typecheck:` front matter field for
// that file. (A `.luau` file's `--!` first line is Luau's own, and the
// checker reads it.)

import type { SyntaxNode, Tree } from "@lezer/common";
import { TYPECHECK_MODE_NAMES } from "./LuauDocumentChecker";

/** A mode setting as written: its text, and where the text is. */
export interface TypecheckSetting {
  value: string;
  from: number;
  to: number;
}

type Read = (from: number, to: number) => string;

/** The first descendant with a name, depth first. */
function descendant(node: SyntaxNode, name: string): SyntaxNode | undefined {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === name) return c;
    const found = descendant(c, name);
    if (found) return found;
  }
  return undefined;
}

/** Every descendant with a name, not looking inside the ones found. */
function descendants(node: SyntaxNode, name: string, found: SyntaxNode[] = []): SyntaxNode[] {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === name) found.push(c);
    else descendants(c, name, found);
  }
  return found;
}

/** A range without the whitespace at either end. */
function trimmed(read: Read, from: number, to: number): TypecheckSetting {
  const text = read(from, to);
  const start = text.length - text.trimStart().length;
  const value = text.trim();
  return { value, from: from + start, to: from + start + value.length };
}

/** The `typecheck:` field of a `.sd` file's front matter. */
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

/** The `mode` a document's `define typecheck as config` sets, as written. */
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

/** The warning for a mode Sparkdown does not know. */
export function unknownModeMessage(value: string): string {
  return `Unknown type checking mode ${JSON.stringify(value)}; the modes are ${TYPECHECK_MODE_NAMES.map((m) => `"${m}"`).join(", ")}`;
}

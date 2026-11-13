import type { SyntaxNode } from "@lezer/common";

const ASSET_COMMANDS = new Set(["ImageCommand", "AudioCommand"]);

export function valueClauseOf(node: SyntaxNode | null | undefined): SyntaxNode | null {
  for (let current = node ?? null; current; current = current.parent) {
    if (current.name === "AssetCommandValueClause") return current;
    if (ASSET_COMMANDS.has(current.name)) return null;
  }
  return null;
}

const firstNamed = (node: SyntaxNode, name: string): SyntaxNode | null => {
  const cursor = node.cursor();
  do {
    if (cursor.name === name) return cursor.node;
  } while (cursor.next() && cursor.from < node.to);
  return null;
};

export function clauseKeywordNode(clause: SyntaxNode): SyntaxNode | null {
  return firstNamed(clause, "AssetCommandClauseKeyword");
}

export function clauseValueNode(clause: SyntaxNode): SyntaxNode | null {
  return firstNamed(clause, "AssetCommandClauseValue");
}

export function clauseValueTokenNode(clause: SyntaxNode): SyntaxNode | null {
  const value = clauseValueNode(clause);
  if (!value) return null;
  for (const name of ["TimeValue", "NumberValue", "NameValue"]) {
    const token = firstNamed(value, name);
    if (token && token.from === value.from && token.to === value.to) return token;
  }
  return value;
}

export function keywordOfValue(node: SyntaxNode | null | undefined): SyntaxNode | null {
  const clause = valueClauseOf(node);
  return clause ? clauseKeywordNode(clause) : null;
}

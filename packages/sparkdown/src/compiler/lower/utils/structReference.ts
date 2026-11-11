import type { SyntaxNode } from "@lezer/common";
import type { LowerContext } from "../context";

function onlyMeaningfulChild(node: SyntaxNode, name: string): SyntaxNode | null {
  let found: SyntaxNode | null = null;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.from === child.to) continue;
    if (child.name !== name || found) return null;
    found = child;
  }
  return found;
}

function capture(node: SyntaxNode, name: string): SyntaxNode | null {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) return child;
    const inner = capture(child, name);
    if (inner) return inner;
  }
  return null;
}

export function structReference(
  value: SyntaxNode,
  ctx: LowerContext,
): { $type: string; $name: string } | undefined {
  const path = capture(value, "StylingAccessPath");
  if (!path) return undefined;
  const raw = ctx.read(value.from, value.to);
  const start = value.from + (raw.length - raw.trimStart().length);
  const end = value.to - (raw.length - raw.trimEnd().length);
  if (path.from !== start || path.to !== end) return undefined;
  const content = onlyMeaningfulChild(path, "StylingAccessPath_content");
  const part = content && onlyMeaningfulChild(content, "StylingAccessPart");
  const accessor = part && onlyMeaningfulChild(part, "NamespaceAccessor");
  if (!accessor) return undefined;
  const type = capture(accessor, "TypeName");
  const name = capture(accessor, "VariableName");
  if (!type || !name) return undefined;
  return { $type: ctx.read(type.from, type.to), $name: ctx.read(name.from, name.to) };
}

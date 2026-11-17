import type { SyntaxNode } from "@lezer/common";
import { nodeNameSet } from "../../utils/nodeNameSet";

const NUMBERS = nodeNameSet(["LuauNumericDecimal", "LuauNumericHex", "LuauNumericBinary"]);

const WHITESPACE = nodeNameSet(["Whitespace", "OptionalWhitespace", "RequiredWhitespace", "ExtraWhitespace"]);

function contentChildren(node: SyntaxNode): SyntaxNode[] {
  const children: SyntaxNode[] = [];
  const content = node.getChild(`${node.name}_content`);
  for (let child = content?.firstChild ?? null; child; child = child.nextSibling) {
    if (!WHITESPACE.has(child.name)) children.push(child);
  }
  return children;
}

function isDottedName(node: SyntaxNode): boolean {
  if (node.name !== "LuauAccessPath") return false;
  const parts = contentChildren(node);
  return (
    parts.length > 0 &&
    parts.every(
      (part, i) => part.name === "LuauAccessPart" && part.getChild(i === 0 ? "LuauVariable" : "LuauPropertyAccessor") !== null,
    )
  );
}

function isNumber(node: SyntaxNode): boolean {
  if (NUMBERS.has(node.name)) return true;
  if (node.name !== "LuauArithmeticOperation") return false;
  const [operator, operand, ...rest] = contentChildren(node);
  return rest.length === 0 && operator?.name === "LuauArithmeticOperator" && !!operand && NUMBERS.has(operand.name);
}

export function oneLineValueNeedsBrackets(valueNodes: readonly SyntaxNode[]): boolean {
  if (valueNodes.length !== 1) return valueNodes.length > 1;
  const [value] = valueNodes as [SyntaxNode];
  return !(value.name === "LuauParenthetical" || isDottedName(value) || isNumber(value));
}

import type { SyntaxNode } from "@lezer/common";
import { isTrivia } from "../../lint/luauTree";
import { nodeNameSet } from "../../utils/nodeNameSet";

const NUMBERS = nodeNameSet(["LuauNumericDecimal", "LuauNumericHex", "LuauNumericBinary"]);

function contentChildren(node: SyntaxNode): SyntaxNode[] {
  const children: SyntaxNode[] = [];
  const content = node.getChild(`${node.name}_content`);
  for (let child = content?.firstChild ?? null; child; child = child.nextSibling) {
    if (!isTrivia(child)) children.push(child);
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
  const values = valueNodes.filter((node) => !isTrivia(node));
  if (values.length !== 1) return values.length > 1;
  const [value] = values as [SyntaxNode];
  return !(value.name === "LuauParenthetical" || isDottedName(value) || isNumber(value));
}

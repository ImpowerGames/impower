import "../../inkjs/compiler/Compiler";
import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { BinaryExpression } from "../../inkjs/compiler/Parser/ParsedHierarchy/Expression/BinaryExpression";
import { Expression } from "../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { IndexExpression } from "../../inkjs/compiler/Parser/ParsedHierarchy/Expression/IndexExpression";
import { NumberExpression } from "../../inkjs/compiler/Parser/ParsedHierarchy/Expression/NumberExpression";
import { ObjectExpression } from "../../inkjs/compiler/Parser/ParsedHierarchy/Expression/ObjectExpression";
import { StringExpression } from "../../inkjs/compiler/Parser/ParsedHierarchy/Expression/StringExpression";
import { UnaryExpression } from "../../inkjs/compiler/Parser/ParsedHierarchy/Expression/UnaryExpression";
import { FunctionCall } from "../../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { Text } from "../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { VariableReference } from "../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableReference";
import { createLowerContextFromSource } from "../../compiler/lower/context";
import { lowerExpressionFromContainer } from "../../compiler/lower/expression/lowerExpression";
import { parseSource } from "./grammarSnapshot";

// Lowers a luau expression by wrapping it in `& __ = <expr>` and extracting
// the RHS of the assignment from the parsed tree.
export function lowerExpressionFromText(text: string): Expression | null {
  const source = `& __ = ${text}`;
  const tree = parseSource(source);
  const ctx = createLowerContextFromSource(source);
  // Find LuauAssignmentOperation_content — its children (minus the assignment
  // operator) form the value expression.
  const opContent = findDescendentByName(
    tree.topNode,
    "LuauAssignmentOperation_content",
  );
  if (!opContent) return null;
  return lowerExpressionFromContainer(opContent, ctx);
}

function findDescendentByName(
  parent: SyntaxNode,
  name: string,
): SyntaxNode | null {
  return getDescendent(name, parent) ?? null;
}

export function formatExpression(expr: Expression | null): string {
  if (!expr) return "<null>";
  if (expr instanceof NumberExpression) {
    return `Number(${expr.value}, ${expr.subtype})`;
  }
  if (expr instanceof StringExpression) {
    const parts = expr.content
      .map((c) => {
        if (c instanceof Text) return JSON.stringify(c.text);
        if (c instanceof Expression) return formatExpression(c);
        return `<${c.constructor.name}>`;
      })
      .join(", ");
    return `String[${parts}]`;
  }
  if (expr instanceof VariableReference) {
    return `Var(${expr.path.join(".")})`;
  }
  if (expr instanceof FunctionCall) {
    const args = expr.args.map(formatExpression).join(", ");
    return `Call(${expr.name}, [${args}])`;
  }
  if (expr instanceof BinaryExpression) {
    return `(${formatExpression(expr.leftExpression)} ${expr.opName} ${formatExpression(expr.rightExpression)})`;
  }
  if (expr instanceof UnaryExpression) {
    return `(${expr.op} ${formatExpression(expr.innerExpression)})`;
  }
  if (expr instanceof ObjectExpression) {
    const parts = expr.entries
      .map((e) => `${e.key}: ${formatExpression(e.value)}`)
      .join(", ");
    return `Object{${parts}}`;
  }
  if (expr instanceof IndexExpression) {
    return `Index(${formatExpression(expr.baseExpression)}, ${formatExpression(expr.keyExpression)})`;
  }
  return `<${expr.constructor.name}>`;
}

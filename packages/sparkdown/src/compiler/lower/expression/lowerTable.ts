import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import {
  ObjectExpression,
  ObjectExpressionEntry,
} from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/ObjectExpression";
import { LowerContext } from "../context";
import {
  lowerExpressionFromContainer,
  lowerExpressionFromNodes,
} from "./lowerExpression";

// Luau tables. Grammar shape for `{a = 1, b = 2}`:
//   LuauTable
//     └─ LuauTable_content
//         ├─ LuauAccessPath              ← key (single variable name)
//         ├─ LuauAssignmentOperation     ← `= <value>`
//         │   └─ LuauAssignmentOperation_content
//         │       (LuauAssignmentOperator + value-expression nodes)
//         ├─ LuauCommaSeparator
//         ├─ LuauAccessPath              ← key
//         └─ LuauAssignmentOperation
//
// Array-style entries (`{1, 2, 3}`) appear as bare expressions and get
// auto-incremented integer keys ("1", "2", ...). Bracketed keys
// (`[expr] = value`) live in `LuauTableIndexDeclaration` and are deferred.
export function lowerTable(
  node: SyntaxNode,
  ctx: LowerContext,
): ObjectExpression {
  const content = findChildByName(node, "LuauTable_content");
  if (!content) return new ObjectExpression([]);

  const entries: ObjectExpressionEntry[] = [];
  let pendingKey: SyntaxNode | null = null;
  let arrayIndex = 1;

  const emitBareValue = (valueNode: SyntaxNode) => {
    const value = lowerExpressionFromNodes([valueNode], ctx);
    if (value) {
      entries.push(new ObjectExpressionEntry(String(arrayIndex++), value));
    }
  };

  let child = content.firstChild;
  while (child) {
    if (
      child.name === "LuauCommaSeparator" ||
      child.name === "LuauSemicolonSeparator"
    ) {
      if (pendingKey !== null) {
        // Bare identifier acting as an array-style value.
        emitBareValue(pendingKey);
        pendingKey = null;
      }
      child = child.nextSibling;
      continue;
    }
    if (isSkippableName(child.name)) {
      child = child.nextSibling;
      continue;
    }
    if (child.name === "LuauAccessPath" && pendingKey === null) {
      pendingKey = child;
      child = child.nextSibling;
      continue;
    }
    if (child.name === "LuauAssignmentOperation" && pendingKey !== null) {
      const keyName = readSingleIdentifier(pendingKey, ctx);
      pendingKey = null;
      const opContent = findChildByName(
        child,
        "LuauAssignmentOperation_content",
      );
      const value = opContent
        ? lowerExpressionFromContainer(opContent, ctx)
        : null;
      if (value && keyName !== null) {
        entries.push(new ObjectExpressionEntry(keyName, value));
      }
      child = child.nextSibling;
      continue;
    }
    // Either a leftover pending key with no `=` (treat as bare value), or a
    // bare expression entry (array-style).
    if (pendingKey !== null) {
      emitBareValue(pendingKey);
      pendingKey = null;
    }
    emitBareValue(child);
    child = child.nextSibling;
  }
  if (pendingKey !== null) {
    emitBareValue(pendingKey);
  }
  return new ObjectExpression(entries);
}

function readSingleIdentifier(
  accessPath: SyntaxNode,
  ctx: LowerContext,
): string | null {
  const nameNode = getDescendent("LuauVariableName", accessPath);
  if (!nameNode) return null;
  return ctx.read(nameNode.from, nameNode.to).trim() || null;
}

function findChildByName(parent: SyntaxNode, name: string): SyntaxNode | null {
  let child = parent.firstChild;
  while (child) {
    if (child.name === name) return child;
    child = child.nextSibling;
  }
  return null;
}

function isSkippableName(name: string): boolean {
  return (
    name === "ExtraWhitespace" ||
    name === "Whitespace" ||
    name === "Newline" ||
    name === "LuauComment" ||
    name === "OptionalWhitespace" ||
    name === "RequiredWhitespace"
  );
}

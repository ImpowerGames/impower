import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { BinaryExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/BinaryExpression";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { IndexExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/IndexExpression";
import { StringExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/StringExpression";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Text } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { StorePropertyAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/StorePropertyAssignment";
import { VariableReference } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableReference";
import { LowerContext } from "../context";
import {
  lowerExpressionFromContainer,
  lowerSimpleAccessPath,
  lowerValueChainAccessPath,
} from "../expression/lowerExpression";

// Shared lowering for `obj.field = value` (and compound forms like `+=`),
// invoked from both the explicit (`& obj.field = value`) and implicit
// (`obj.field = value` in a function body) statement lowerers.
//
// The LHS access path is decomposed into:
//   - `base`: a GET expression that walks all but the last segment, e.g.
//     `VariableReference([obj])` for `obj.field`, or
//     `IndexExpression(VariableReference([obj]), "a")` for `obj.a.b`.
//   - `key`: the final segment as a `StringExpression` (for `.field`) or
//     a lowered key expression (for `[expr]`).
//
// Compound assignment (`+=`, `-=`, …) is desugared by reading the current
// value via the same base+key chain, computing the new value via a
// `BinaryExpression`, then storing back. This duplicates the base+key
// computation; it's correct but a future optimization could split them.
export function lowerPropertyTargetAssignment(
  lhsPath: SyntaxNode,
  opNode: SyntaxNode,
  opText: string | null,
  ctx: LowerContext,
): ParsedObject | null {
  const parts = collectAccessParts(lhsPath);
  if (parts.length < 2) return null;

  const finalPart = parts[parts.length - 1]!;
  const baseParts = parts.slice(0, -1);
  const finalInner = finalPart.firstChild;
  if (!finalInner) return null;

  let keyExpr: Expression | null = null;
  if (finalInner.name === "LuauPropertyAccessor") {
    const nameNode = getDescendent("LuauPropertyName", finalInner);
    if (!nameNode) return null;
    keyExpr = new StringExpression([
      new Text(ctx.read(nameNode.from, nameNode.to)),
    ]);
  } else if (finalInner.name === "LuauPropertyIndexer") {
    const indexerContent = findChildByName(
      finalInner,
      "LuauPropertyIndexer_content",
    );
    keyExpr = indexerContent
      ? lowerExpressionFromContainer(indexerContent, ctx)
      : null;
  } else {
    // Last segment is a variable name (path of length 1) or function call —
    // not a property target. Caller falls back to simple-variable assignment.
    return null;
  }
  if (!keyExpr) return null;

  const baseExpr = lowerBaseFromParts(baseParts, ctx);
  if (!baseExpr) return null;

  let valueExpr = lowerExpressionFromContainer(opNode, ctx);
  if (!valueExpr) return null;

  // Compound assignment: `obj.field += rhs` → `obj.field = obj.field + rhs`.
  // We have to clone the base+key for the GET side since `StorePropertyAssignment`
  // calls `AddContent` (which sets parent pointers) on the original base+key.
  if (opText && opText !== "=") {
    const binOp = opText.slice(0, -1);
    const getBase = lowerBaseFromParts(baseParts, ctx);
    const getKey = cloneKeyExpression(finalInner, ctx);
    if (!getBase || !getKey) return null;
    const readExpr = new IndexExpression(getBase, getKey);
    valueExpr = new BinaryExpression(readExpr, valueExpr, binOp);
  }

  return new StorePropertyAssignment(baseExpr, keyExpr, valueExpr);
}

function collectAccessParts(accessPath: SyntaxNode): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  const content = findChildByName(accessPath, "LuauAccessPath_content");
  if (!content) return out;
  let inner = content.firstChild;
  while (inner) {
    if (inner.name === "LuauAccessPart") out.push(inner);
    inner = inner.nextSibling;
  }
  return out;
}

function lowerBaseFromParts(
  parts: SyntaxNode[],
  ctx: LowerContext,
): Expression | null {
  if (parts.length === 0) return null;

  // The leading segment is the root variable (or function call). Subsequent
  // segments are property reads on a *value*, so they always become
  // `IndexExpression`s — even for a pure dotted base like `opts.theme`,
  // which in a generic expression context would lower to
  // `VariableReference([opts, theme])` (ink hierarchical lookup). Property-
  // target assignment commits to value-traversal semantics: each hop reads a
  // property off an `ObjectValue` rather than walking a namespace.
  const firstInner = parts[0]!.firstChild;
  let current: Expression | null;
  let i: number;
  if (firstInner?.name === "LuauFunctionCall") {
    // Leading function call (`f(x).y = ...`) — route through the existing
    // value-chain builder; it handles the call→index transition correctly.
    return lowerValueChainAccessPath(parts, ctx);
  }
  if (firstInner?.name !== "LuauVariable") {
    return lowerSimpleAccessPath(parts, ctx);
  }
  // The base identifier can be tagged as either a plain `LuauVariableName`
  // or a `LuauStdLibConstants` (for stdlib namespaces like `lang`, `count`).
  // Both are valid roots for a property-target assignment — e.g.
  // `lang.current = "ar"` must write into the `lang` store.
  const nameNode =
    getDescendent("LuauStdLibConstants", firstInner) ??
    getDescendent("LuauVariableName", firstInner);
  if (!nameNode) return null;
  current = new VariableReference([
    new Identifier(ctx.read(nameNode.from, nameNode.to)),
  ]);
  i = 1;

  for (; i < parts.length; i++) {
    const inner = parts[i]!.firstChild;
    if (!inner) continue;
    if (inner.name === "LuauPropertyAccessor") {
      const propName = getDescendent("LuauPropertyName", inner);
      if (!propName) return null;
      const key = new StringExpression([
        new Text(ctx.read(propName.from, propName.to)),
      ]);
      current = new IndexExpression(current!, key);
      continue;
    }
    if (inner.name === "LuauPropertyIndexer") {
      const indexerContent = findChildByName(
        inner,
        "LuauPropertyIndexer_content",
      );
      const key = indexerContent
        ? lowerExpressionFromContainer(indexerContent, ctx)
        : null;
      if (!key) return null;
      current = new IndexExpression(current!, key);
      continue;
    }
    return null;
  }
  return current;
}

function cloneKeyExpression(
  finalInner: SyntaxNode,
  ctx: LowerContext,
): Expression | null {
  // The SET side's key has already been attached to a parent via AddContent.
  // Build a fresh, parent-less copy for the GET side of a compound assignment.
  if (finalInner.name === "LuauPropertyAccessor") {
    const nameNode = getDescendent("LuauPropertyName", finalInner);
    if (!nameNode) return null;
    return new StringExpression([
      new Text(ctx.read(nameNode.from, nameNode.to)),
    ]);
  }
  if (finalInner.name === "LuauPropertyIndexer") {
    const indexerContent = findChildByName(
      finalInner,
      "LuauPropertyIndexer_content",
    );
    return indexerContent
      ? lowerExpressionFromContainer(indexerContent, ctx)
      : null;
  }
  return null;
}

function findChildByName(parent: SyntaxNode, name: string): SyntaxNode | null {
  let child = parent.firstChild;
  while (child) {
    if (child.name === name) return child;
    child = child.nextSibling;
  }
  return null;
}

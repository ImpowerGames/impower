import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import {
  ObjectExpression,
  ObjectExpressionEntry,
} from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/ObjectExpression";
import {
  AstExpr,
  AstExprConstantNumber,
  AstExprError,
  AstExprConstantString,
  AstExprTable,
  TableItemKind,
} from "../../typecheck/Ast";
import type { LowerContext } from "../context";
import { nodeNameSet } from "../../utils/nodeNameSet";
import { nodeWithin, offsetAt, rangeOf, type LuauSource } from "../utils/luauAst";
import { reportValueInVain } from "../utils/lineContinuation";
import { validateAssignmentValue } from "../utils/validateAssignmentValue";
import { asOneValue, lowerExpression } from "./lowerExpression";

export function lowerTable(
  table: AstExprTable,
  source: LuauSource,
  ctx: LowerContext,
): ObjectExpression {
  const entries: ObjectExpressionEntry[] = [];
  let arrayIndex = 1;
  for (const item of table.items) {
    if (item.kind === TableItemKind.List) {
      reportValueInVain(item.value, source, ctx);
      const value = lowerExpression(item.value, source, ctx);
      if (value) {
        entries.push(new ObjectExpressionEntry(String(arrayIndex++), value));
      }
      continue;
    }
    let key: string | Expression | null = null;
    if (item.kind === TableItemKind.Record) {
      key = (item.key as AstExprConstantString).value || null;
    } else if (item.key) {
      key = staticKey(item.key, ctx);
      if (key === null) {
        const computed = lowerExpression(item.key, source, ctx);
        key = computed ? asOneValue(computed) : null;
      }
    }
    if (item.value instanceof AstExprError && item.key) {
      const operation = nodeWithin(
        source,
        offsetAt(item.key.location.end, ctx),
        offsetAt(item.value.location.end, ctx),
        ASSIGNMENT_OPERATION,
      );
      if (operation) validateAssignmentValue(operation, ctx);
    }
    const value = lowerExpression(item.value, source, ctx);
    if (key !== null && value) {
      entries.push(new ObjectExpressionEntry(key, asOneValue(value)));
    }
  }
  return new ObjectExpression(entries);
}

const ASSIGNMENT_OPERATION = nodeNameSet(["LuauAssignmentOperation"]);

function staticKey(key: AstExpr, ctx: LowerContext): string | null {
  if (
    !(key instanceof AstExprConstantString) &&
    !(key instanceof AstExprConstantNumber)
  ) {
    return null;
  }
  const range = rangeOf(key.location, ctx);
  const raw = ctx.read(range.from, range.to).trim();
  if (key instanceof AstExprConstantNumber) return raw;
  if (raw.length >= 2) {
    const first = raw[0];
    const last = raw[raw.length - 1];
    if (
      (first === '"' && last === '"') ||
      (first === "'" && last === "'") ||
      (first === "`" && last === "`")
    ) {
      return raw.slice(1, -1);
    }
  }
  return raw;
}

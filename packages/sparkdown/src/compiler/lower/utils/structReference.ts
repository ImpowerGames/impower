import type { SyntaxNode } from "@lezer/common";
import { findWithin } from "../../utils/declarationOnly";
import type { LowerContext } from "../context";

export function structReference(
  value: SyntaxNode,
  ctx: LowerContext,
): { $type: string; $name: string } | undefined {
  const accessor = findWithin(value, "NamespaceAccessor");
  if (!accessor) return undefined;
  const raw = ctx.read(value.from, value.to);
  const start = value.from + (raw.length - raw.trimStart().length);
  const end = value.to - (raw.length - raw.trimEnd().length);
  if (accessor.from !== start || accessor.to !== end) return undefined;
  const type = findWithin(accessor, "TypeName");
  const name = findWithin(accessor, "VariableName");
  if (!type || !name) return undefined;
  return { $type: ctx.read(type.from, type.to), $name: ctx.read(name.from, name.to) };
}

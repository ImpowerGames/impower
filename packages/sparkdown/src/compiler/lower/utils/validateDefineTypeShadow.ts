import { ErrorType, type SourceMetadata } from "../../../runtime/Error";
import { getBuiltinTypeNames } from "../../utils/builtinTypeNames";
import type { LowerContext } from "../context";

export function validateDefineTypeShadow(
  name: string,
  range: { from: number; to: number },
  ctx: LowerContext,
): void {
  if (!ctx.diagnostics) return;
  const trimmed = name.trim();
  const isInDocumentType = ctx.defineTypeNames?.has(trimmed) ?? false;
  const isBuiltinType = !isInDocumentType && getBuiltinTypeNames().has(trimmed);
  if (!isInDocumentType && !isBuiltinType) return;
  const message = isBuiltinType
    ? `'${trimmed}' is a reserved builtin type/namespace. The bare name now ` +
      `refers to this variable, which will break '${trimmed}.<member>' access — ` +
      `rename this variable.`
    : `'${trimmed}' shadows the define type of the same name. The bare name ` +
      `now refers to this variable — reference the define as '${trimmed}.<member>' ` +
      `or rename this variable.`;
  ctx.diagnostics.push({
    message,
    severity: ErrorType.Warning,
    source: makeSource(range, ctx),
  });
}

function makeSource(
  node: { from: number; to: number },
  ctx: LowerContext,
): SourceMetadata {
  return {
    fileName: null,
    filePath: ctx.filePath ?? null,
    startLineNumber: ctx.lineNumber(node.from) + 1,
    endLineNumber: ctx.lineNumber(node.to) + 1,
    startCharacterNumber: ctx.characterNumber(node.from) + 1,
    endCharacterNumber: ctx.characterNumber(node.to) + 1,
  };
}

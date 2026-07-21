import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ErrorType, SourceMetadata } from "../../../inkjs/engine/Error";
import { getBuiltinTypeNames } from "../../utils/builtinTypeNames";
import { LowerContext } from "../context";

// A global (`store` / `const`) variable whose name collides with a define
// TYPE name — an `as`-parent or a `new X()` target, i.e. a name that KEEPS
// its bare Luau global after leaf-instance scoping — fights the type table
// over the same global slot. `type.name` member access, `new T()`, and
// `instances(T)` all resolve `T` as a bare global, so the user variable
// silently shadows the type (or, once both bind at story init, one clobbers
// the other). Emit a Warning so the clash is visible in the editor.
//
// Two sources of type names are checked:
//   - `ctx.defineTypeNames` — types defined in THIS document.
//   - `getBuiltinTypeNames()` — the builtin namespace/type roots (color,
//     character, animation, …) from the compiled prelude. Reserved.
//
// Leaf instances are NOT flagged: Phase 1 scopes them to a synthetic
// `$<type>_<name>` key, so `store red` / `store show` no longer clash with
// the builtin `red` / `show` defines — they're free names again.
// See [[project_define_namespace_scoping]].
export function validateDefineTypeShadow(
  name: string,
  node: SyntaxNode,
  ctx: LowerContext,
): void {
  if (!ctx.diagnostics) return;
  const trimmed = name.trim();
  const isInDocumentType = ctx.defineTypeNames?.has(trimmed) ?? false;
  const isBuiltinType = !isInDocumentType && getBuiltinTypeNames().has(trimmed);
  if (!isInDocumentType && !isBuiltinType) return;
  // Point the diagnostic at the declared name if we can find it; fall back
  // to the whole assignment node otherwise.
  const nameNode = getDescendent("LuauVariableName", node) ?? node;
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
    source: makeSource(nameNode, ctx),
  });
}

function makeSource(node: SyntaxNode, ctx: LowerContext): SourceMetadata {
  return {
    fileName: null,
    filePath: ctx.filePath ?? null,
    startLineNumber: ctx.lineNumber(node.from) + 1,
    endLineNumber: ctx.lineNumber(node.to) + 1,
    startCharacterNumber: ctx.characterNumber(node.from) + 1,
    endCharacterNumber: ctx.characterNumber(node.to) + 1,
  };
}

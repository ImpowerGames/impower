import { DebugMetadata } from "../../../inkjs/engine/DebugMetadata";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { LowerContext } from "../context";

// Builds a `DebugMetadata` populated with chunk-relative line/character
// positions derived from the absolute byte offsets `from` / `to`. The
// caller is responsible for attaching it to a ParsedObject — typically via
// `stampDebugMetadata`.
//
// The compiler's post-lowering `offsetDebugMetadata` pass (in
// SparkdownCompiler.remapContent) saves these chunk-relative numbers into
// `sourceStartLineNumber` / `sourceEndLineNumber` on first encounter and
// rebases `startLineNumber` / `endLineNumber` to absolute lines by adding
// the chunk's start-line offset. Incremental updates re-apply the offset
// against the saved chunk-relative number, so the same `DebugMetadata`
// stays valid across edits.
export function buildDebugMetadata(
  from: number,
  to: number,
  ctx: LowerContext,
): DebugMetadata {
  const dm = new DebugMetadata();
  dm.startLineNumber = ctx.lineNumber(from);
  dm.endLineNumber = ctx.lineNumber(to);
  dm.startCharacterNumber = ctx.characterNumber(from);
  dm.endCharacterNumber = ctx.characterNumber(to);
  if (ctx.filePath) {
    dm.filePath = ctx.filePath;
  }
  return dm;
}

// Stamps the given ParsedObjects with debug metadata derived from the
// absolute byte range `[from, to]`. Existing metadata on a child is left
// alone so a more-specific lowerer can override the dispatcher-level
// fallback. Nested children without their own metadata inherit via
// `ParsedObject.get debugMetadata()` which walks the parent chain — so the
// dispatcher only needs to stamp the top-level returned objects.
export function stampDebugMetadata(
  objects: ParsedObject[] | undefined,
  from: number,
  to: number,
  ctx: LowerContext,
): void {
  if (!objects || objects.length === 0) return;
  const dm = buildDebugMetadata(from, to, ctx);
  for (const obj of objects) {
    if (!obj.debugMetadata) {
      obj.debugMetadata = dm;
    }
  }
}

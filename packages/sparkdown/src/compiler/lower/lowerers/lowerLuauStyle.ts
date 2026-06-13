import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ErrorType, SourceMetadata } from "../../../inkjs/engine/Error";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { findChildByName } from "../utils/alternatorArms";
import { resolveStyleProp } from "./sparkleStyleProps";

// `style NAME [as PARENT] with <prop = value> ... end` — a structural
// UI keyword (parallel to `scene` / `branch`), NOT a `define`. Lowers to
// a COMPILE-TIME struct only: it emits nothing into the runtime story
// (`content: []`) and instead populates the chunk's `context` with a
// `style` struct that the compiler copies into
// `program.context.style.<name>` for the engine's sparkle UI system.
//
//   style option_row as button with     program.context.style.option_row =
//     bg-color = surface-2                 {
//     c = md                                 $type: "style",
//     p = sm                                 $name: "option_row",
//   end                                      $extends: "button",
//                                            "background-color": "surface-2",
//                                            corner: "md",
//                                            padding: "sm",
//                                          }
//
// Property names are validated against the real sparkle prop surface
// (sparkleStyleProps.ts, generated from sparkle-style-transformer) and
// de-aliased to their canonical spelling (`bg-color` → `background-color`,
// `p` → `padding`). Unknown props raise a warning but don't block the
// build. Values are stored as raw strings — the engine's transformer
// interprets CSS-like tokens (`surface-2`, `md`, `sm md`) at render time.

const DIAGNOSTIC_TAG_UNNECESSARY = 1;

export function lowerLuauStyle(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const nameNode = getDescendent("LuauDefineName", nodeRef.node);
  if (!nameNode) return { content: [] };
  const name = ctx.read(nameNode.from, nameNode.to).trim();
  if (!name) return { content: [] };

  const parentNode = getDescendent("LuauDefineParentName", nodeRef.node);
  const parent = parentNode
    ? ctx.read(parentNode.from, parentNode.to).trim()
    : "";

  const struct: Record<string, unknown> = {
    $type: "style",
    $name: name,
  };
  if (parent) {
    struct["$extends"] = parent;
  }

  const content = findChildByName(nodeRef.node, "LuauStyle_content");
  if (content) {
    let child: SyntaxNode | null = content.firstChild;
    while (child) {
      if (child.name === "LuauStylePropertyDefinition") {
        applyStyleProperty(child, ctx, struct);
      }
      child = child.nextSibling;
    }
  }

  return {
    content: [],
    context: { style: { [name]: struct } },
  };
}

function applyStyleProperty(
  propNode: SyntaxNode,
  ctx: LowerContext,
  struct: Record<string, unknown>,
): void {
  const nameNode = getDescendent("LuauStylePropertyName", propNode);
  if (!nameNode) return;
  const authored = ctx.read(nameNode.from, nameNode.to).trim();
  if (!authored) return;

  const valueNode = getDescendent("LuauStylePropertyValue", propNode);
  const value = valueNode ? ctx.read(valueNode.from, valueNode.to).trim() : "";

  const canonical = resolveStyleProp(authored);
  if (!canonical) {
    ctx.diagnostics?.push({
      message: `Unknown style property \`${authored}\`. It is not a sparkle style property or alias.`,
      severity: ErrorType.Warning,
      source: makeSource(nameNode, ctx),
      tags: [DIAGNOSTIC_TAG_UNNECESSARY],
    });
    return;
  }

  if (canonical in struct) {
    ctx.diagnostics?.push({
      message: `Duplicate style property \`${canonical}\`.`,
      severity: ErrorType.Warning,
      source: makeSource(nameNode, ctx),
    });
  }
  struct[canonical] = value;
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

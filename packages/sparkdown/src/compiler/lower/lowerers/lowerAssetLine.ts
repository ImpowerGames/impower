import { type SyntaxNode } from "@lezer/common";
import { getDescendents } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendents";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Tag } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Tag";
import { Text } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { wrapInWeave } from "../utils/wrapInWeave";

// Asset lines lower to a sequence of Tag pairs, one per asset command:
//
//   [[show backdrop rooftop_night]]   → Tag(start), Text "image:show backdrop rooftop_night", Tag(end)
//   ((play music stars))              → Tag(start), Text "audio:play music stars", Tag(end)
//   [[show X]] ((play Y))             → emits both tags in order, then a trailing Text "\n"
//
// V1 captures the raw command text inside the brackets. Structured parsing of
// the instruction (control keyword, target, clauses, time values) is deferred
// to the runtime / renderer; downstream code can re-parse the tag text.

export function lowerImageLine(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  return buildAssetContent(nodeRef.node, ctx);
}

export function lowerAudioLine(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  return buildAssetContent(nodeRef.node, ctx);
}

export function lowerImageAndAudioLine(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  return buildAssetContent(nodeRef.node, ctx);
}

function buildAssetContent(node: SyntaxNode, ctx: LowerContext): CompiledBlock {
  const content: ParsedObject[] = [];
  const commands = getDescendents(["ImageCommand", "AudioCommand"], node);
  for (const cmd of commands) {
    const type = cmd.name === "ImageCommand" ? "image" : "audio";
    const innerText = extractCommandContent(cmd, ctx);
    content.push(new Tag(true));
    content.push(new Text(`${type}:${innerText}`));
    content.push(new Tag(false));
  }
  if (content.length > 0) {
    content.push(new Text("\n"));
  }
  return wrapInWeave(content);
}

// Strips the surrounding `[[` `]]` (or `((` `))`) and trims whitespace. The
// grammar's ImageCommand/AudioCommand node may span a trailing space when
// followed by another command on the same line, so we trim first to anchor
// the closing-bracket match correctly.
function extractCommandContent(cmd: SyntaxNode, ctx: LowerContext): string {
  return ctx
    .read(cmd.from, cmd.to)
    .trim()
    .replace(/^\[\[|^\(\(/, "")
    .replace(/\]\]$|\)\)$/, "")
    .trim();
}

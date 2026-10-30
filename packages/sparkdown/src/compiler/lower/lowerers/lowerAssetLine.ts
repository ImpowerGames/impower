import { type SyntaxNode } from "@lezer/common";
import { getDescendents } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendents";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Text } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";
import { buildDisplayCall } from "../utils/displayCall";
import { wrapInWeave } from "../utils/wrapInWeave";

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
    content.push(new Text(extractCommandText(cmd, ctx)));
  }
  if (content.length === 0) {
    return wrapInWeave(content);
  }
  return wrapInWeave([
    buildDisplayCall(undefined, undefined, content, node, ctx),
  ]);
}

function extractCommandText(cmd: SyntaxNode, ctx: LowerContext): string {
  return ctx.read(cmd.from, cmd.to).trim();
}

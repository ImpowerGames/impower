import { type SyntaxNode } from "@lezer/common";
import { getDescendents } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendents";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Text } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { wrapInWeave } from "../utils/wrapInWeave";

// Asset lines lower to their raw bracketed directive text, emitted inline:
//
//   [[show backdrop rooftop_night]]   → Text "[[show backdrop rooftop_night]]"
//   ((play music stars))              → Text "((play music stars))"
//   [[show X]] ((play Y))             → Text "[[show X]]", Text "((play Y))", then Text "\n"
//
// The directive text survives into the runtime as display text, where the
// InterpreterModule's `[[...]]` / `((...))` parser re-parses it into image /
// audio instructions — the SAME path used for directives written inline at the
// end of an action/dialogue line. (Previously these lowered to ink tags
// `image:...` / `audio:...`, but nothing in the runtime consumed those tags, so
// directives on their own line were silently dropped — e.g. a standalone
// `[[show backdrop ...]]` never changed the backdrop.)

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
    // Emit the raw bracketed directive (e.g. `[[show backdrop X]]`) so the
    // runtime interpreter parses it exactly like an inline directive.
    content.push(new Text(extractCommandText(cmd, ctx)));
  }
  if (content.length > 0) {
    content.push(new Text("\n"));
  }
  return wrapInWeave(content);
}

// Reads the raw `[[...]]` / `((...))` directive text. The grammar's
// ImageCommand/AudioCommand node may span a trailing space when followed by
// another command on the same line, so trim to anchor the closing bracket.
function extractCommandText(cmd: SyntaxNode, ctx: LowerContext): string {
  return ctx.read(cmd.from, cmd.to).trim();
}

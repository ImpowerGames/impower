import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Tag } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Tag";
import { Text } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { VariableReference } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableReference";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { wrapInWeave } from "../utils/wrapInWeave";

function findChild(parent: SyntaxNode, name: string): SyntaxNode | null {
  let c = parent.firstChild;
  while (c) {
    if (c.name === name) return c;
    c = c.nextSibling;
  }
  return null;
}

// Lower a top-level `# tag` (or `# a # b`) line. Each `Tag` child of the
// `Tags` wrapper emits a `BeginTag` / content / `EndTag` triplet so the
// runtime collects the text into `currentTags` (and, when at the start
// of a flow, into `globalTags` / `TagsForContentAtPath`).
export function lowerTags(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const out: ParsedObject[] = [];
  // The grammar wraps `Tag` children inside a `Tags_content` wrapper.
  // Walk the wrapper to reach individual `Tag` nodes.
  const contentNode = findChild(nodeRef.node, "Tags_content") ?? nodeRef.node;
  let child = contentNode.firstChild;
  while (child) {
    if (child.name === "Tag") {
      out.push(new Tag(true));
      const tagContent = getDescendent("TagContent", child);
      if (tagContent) {
        appendInterpolatedTagText(
          ctx.read(tagContent.from, tagContent.to),
          out,
        );
      }
      out.push(new Tag(false));
    }
    child = child.nextSibling;
  }
  if (out.length === 0) return {};
  return wrapInWeave(out);
}

// Mirrors lowerDisplay.ts's helper of the same shape — kept local to
// avoid coupling top-level tag lowering to display-line internals.
function appendInterpolatedTagText(raw: string, out: ParsedObject[]): void {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return;
  let i = 0;
  while (i < trimmed.length) {
    const open = trimmed.indexOf("{", i);
    if (open === -1) {
      out.push(new Text(trimmed.slice(i)));
      break;
    }
    if (open > i) {
      out.push(new Text(trimmed.slice(i, open)));
    }
    const close = trimmed.indexOf("}", open);
    if (close === -1) {
      out.push(new Text(trimmed.slice(open)));
      break;
    }
    const exprText = trimmed.slice(open + 1, close).trim();
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(exprText)) {
      const ref = new VariableReference([new Identifier(exprText)]);
      ref.outputWhenComplete = true;
      out.push(ref);
    } else {
      out.push(new Text(trimmed.slice(open, close + 1)));
    }
    i = close + 1;
  }
}

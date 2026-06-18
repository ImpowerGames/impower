import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Tag } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Tag";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { lowerTagContent } from "../utils/lowerTagContent";
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
        for (const obj of lowerTagContent(tagContent, ctx)) {
          out.push(obj);
        }
      }
      out.push(new Tag(false));
    }
    child = child.nextSibling;
  }
  if (out.length === 0) return {};
  return wrapInWeave(out);
}

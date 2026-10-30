import { isExplicitRuleName } from "../../utils/explicitRuleNames";
import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Tag } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Tag";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";
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

export function lowerTags(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const out: ParsedObject[] = [];
  const contentNode = findChild(nodeRef.node, "Tags_content") ?? nodeRef.node;
  let child = contentNode.firstChild;
  while (child) {
    if (isExplicitRuleName(child.name, "Tag")) {
      out.push(new Tag(true));
      const tagContent = getDescendent(["TagContent", "SparkdownExplicitTagContent"], child);
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

import type { SyntaxNode } from "@lezer/common";
import { tags } from "@lezer/highlight";
import { isHighlightedAs } from "./isHighlightedAs";

export const isAlreadyColored = (node: SyntaxNode) =>
  isHighlightedAs(
    node,
    tags.comment,
    tags.lineComment,
    tags.blockComment,
    tags.docComment,
    tags.keyword,
    tags.self,
    tags.null,
    tags.atom,
    tags.unit,
    tags.modifier,
    tags.operatorKeyword,
    tags.controlKeyword,
    tags.definitionKeyword,
    tags.moduleKeyword,
    tags.string,
    tags.tagName,
    tags.typeName,
    tags.className,
    tags.labelName,
    tags.macroName,
    tags.propertyName,
    tags.variableName,
    tags.attributeName
  );

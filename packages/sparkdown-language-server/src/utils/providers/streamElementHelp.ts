import { type SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { type SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import { getStack } from "@impower/textmate-grammar-tree/src/tree/utils/getStack";
import { type Tree } from "@lezer/common";
import {
  CompletionItemKind,
  InsertTextFormat,
  MarkupKind,
  type CompletionItem,
  type Hover,
  type Position,
} from "vscode-languageserver";

export const STREAM_ELEMENT = "stream";

export const STREAM_ELEMENT_DESCRIPTION =
  "Adds a copy of the elements inside it for each line that goes to it, after the copies before. A line goes to the stream when an element inside is named after the line's kind, such as `dialogue { text }`. The copies stay until `[[clear LAYOUT]]` or `[[close LAYOUT]]`, the newest is `@latest`, and the stream scrolls to keep it in view.";

const LAYOUT_BODIES = new Set<string>(["LuauLayout", "LuauComponent"]);

export const streamElementCompletion = (): CompletionItem => ({
  label: STREAM_ELEMENT,
  insertText: `${STREAM_ELEMENT} {\n\t$0\n}`,
  insertTextFormat: InsertTextFormat.Snippet,
  kind: CompletionItemKind.Keyword,
  labelDetails: { description: "element" },
  documentation: { kind: MarkupKind.Markdown, value: STREAM_ELEMENT_DESCRIPTION },
});

export const getStreamElementHover = (
  document: SparkdownDocument,
  tree: Tree,
  position: Position,
): Hover | null => {
  const offset = document.offsetAt(position);
  const stack = getStack<SparkdownNodeName>(tree, offset, 1);
  const name = stack.find((node) => node.name === "LuauSparkleElementName");
  if (!name || !stack.some((node) => LAYOUT_BODIES.has(node.name))) {
    return null;
  }
  if (document.getText(document.range(name.from, name.to)).trim() !== STREAM_ELEMENT) {
    return null;
  }
  return {
    contents: { kind: MarkupKind.Markdown, value: STREAM_ELEMENT_DESCRIPTION },
    range: document.range(name.from, name.to),
  };
};

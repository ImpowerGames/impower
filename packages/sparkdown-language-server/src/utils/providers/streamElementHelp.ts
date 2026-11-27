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

export const CAST_ELEMENT = "cast";

export const CAST_ELEMENT_DESCRIPTION =
  "Keeps one copy of the elements inside it for each character, such as `actor { portrait #clear { image } }`. A picture goes to the copy of the character it shows (`mia@happy` goes to Mia's), and a name to its speaker's. Each copy carries `#speaker` and the `#variant` of its character's newest line, and the one whose character is speaking now is `@latest`. A copy stays while it has content, and an emptied copy stays, unseen, until another character's copy arrives or the script hides it.";

const TEMPLATED_ELEMENTS: ReadonlyMap<string, string> = new Map([
  [STREAM_ELEMENT, STREAM_ELEMENT_DESCRIPTION],
  [CAST_ELEMENT, CAST_ELEMENT_DESCRIPTION],
]);

const LAYOUT_BODIES = new Set<string>(["LuauLayout", "LuauComponent"]);

export const templatedElementCompletions = (): CompletionItem[] =>
  [...TEMPLATED_ELEMENTS].map(([label, value]) => ({
    label,
    insertText: `${label} {\n\t$0\n}`,
    insertTextFormat: InsertTextFormat.Snippet,
    kind: CompletionItemKind.Keyword,
    labelDetails: { description: "element" },
    documentation: { kind: MarkupKind.Markdown, value },
  }));

export const getTemplatedElementHover = (
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
  const value = TEMPLATED_ELEMENTS.get(document.getText(document.range(name.from, name.to)).trim());
  if (!value) {
    return null;
  }
  return {
    contents: { kind: MarkupKind.Markdown, value },
    range: document.range(name.from, name.to),
  };
};

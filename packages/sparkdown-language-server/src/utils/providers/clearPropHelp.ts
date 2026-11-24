import { type SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import { type SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { getStack } from "@impower/textmate-grammar-tree/src/tree/utils/getStack";
import { type Tree } from "@lezer/common";
import {
  CompletionItemKind,
  MarkupKind,
  type CompletionItem,
  type Hover,
  type Position,
  type Range,
} from "vscode-languageserver";

const PROPS_GUIDE =
  "https://github.com/ImpowerGames/impower/blob/main/packages/sparkdown/docs/guide/Structure.md#25-props";

export const CLEAR_PROP_DOCUMENTATION = [
  "With `#clear`, this element's content lasts as long as the line that put it there is on screen. The next line that writes to the element replaces its content, and the next line that does not empties it.",
  "Without `#clear`, the element keeps its content until something replaces it or the script hides it.",
  `[Props](${PROPS_GUIDE})`,
].join("\n\n");

const PROP_AFTER_HEAD = /[^\s{;]\s+#([A-Za-z0-9_-]*)$/;

const VALUE_CONTEXT = /Closure|Interpolat|CallArguments|Parens|Expression|String/;

export const getClearPropCompletion = (
  leftStack: { name: string }[],
  lineBeforeCursor: string,
  cursor: number,
  range: (from: number, to: number) => Range,
): CompletionItem | null => {
  const typed = PROP_AFTER_HEAD.exec(lineBeforeCursor)?.[1];
  if (
    typed == null ||
    !"clear".startsWith(typed) ||
    !leftStack.some((node) => node.name === "LuauLayout") ||
    leftStack.some((node) => VALUE_CONTEXT.test(node.name))
  ) {
    return null;
  }
  return {
    label: "clear",
    kind: CompletionItemKind.Property,
    labelDetails: { description: "prop" },
    documentation: { kind: MarkupKind.Markdown, value: CLEAR_PROP_DOCUMENTATION },
    textEdit: { newText: "clear", range: range(cursor - typed.length, cursor) },
  };
};

export const getClearPropHover = (
  document: SparkdownDocument,
  tree: Tree,
  position: Position,
): Hover | null => {
  const stack = getStack<SparkdownNodeName>(tree, document.offsetAt(position), 1);
  const name = stack.find((node) => node.name === "StyleAttributeName");
  const attribute = stack.find((node) => node.name === "LuauSparklePropAttribute");
  if (
    !name ||
    !attribute ||
    !stack.some((node) => node.name === "LuauLayout") ||
    document.read(name.from, name.to) !== "clear"
  ) {
    return null;
  }
  return {
    contents: { kind: MarkupKind.Markdown, value: CLEAR_PROP_DOCUMENTATION },
    range: document.range(attribute.from, name.to),
  };
};

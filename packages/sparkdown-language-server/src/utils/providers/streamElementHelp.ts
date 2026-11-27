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

export const STREAM_BLOCK_DESCRIPTION = [
  "`stream NAME { … }` sets the streams in the layout of that name.",
  "",
  "- `advance`: `click` (the built-in value), where each line waits for a click, or `auto`, where each line follows the one before it.",
  "- `pause`: with `auto`, how long after a line finishes typing the next one starts. The built-in value is `0.4s`.",
  "",
  "A stream that advances by itself waits for a click at the last line before the story leaves it and at any line that ends with `>`. Its lines are gathered first, so it makes room for all of them before the first one shows.",
  "",
  "```sparkdown",
  "stream phone {",
  "  advance = auto",
  "  pause = 0.6s",
  "}",
  "```",
].join("\n");

export const STREAM_SETTING_DOCS: Readonly<Record<string, string>> = {
  advance:
    "`click` or `auto`. With `click`, the built-in value, each line waits for a click. With `auto`, each line follows the one before it, and the stream waits for a click at the last line before the story leaves it and at any line that ends with `>`.",
  pause:
    "A time, such as `0.6s` or `600ms`. With `advance = auto`, how long after a line finishes typing the next one starts. The built-in value is `0.4s`.",
};

const LAYOUT_BODIES = new Set<string>(["LuauLayout", "LuauComponent"]);

export const streamElementCompletion = (): CompletionItem => ({
  label: STREAM_ELEMENT,
  insertText: `${STREAM_ELEMENT} {\n\t$0\n}`,
  insertTextFormat: InsertTextFormat.Snippet,
  kind: CompletionItemKind.Keyword,
  labelDetails: { description: "element" },
  documentation: { kind: MarkupKind.Markdown, value: STREAM_ELEMENT_DESCRIPTION },
});

export const streamBlockCompletion = (): CompletionItem => ({
  label: STREAM_ELEMENT,
  insertText: `${STREAM_ELEMENT} \${1:layout} {\n\tadvance = \${2|auto,click|}\n}`,
  insertTextFormat: InsertTextFormat.Snippet,
  kind: CompletionItemKind.Keyword,
  labelDetails: { description: "settings" },
  documentation: { kind: MarkupKind.Markdown, value: STREAM_BLOCK_DESCRIPTION },
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

export const getStreamBlockHover = (
  document: SparkdownDocument,
  tree: Tree,
  position: Position,
): Hover | null => {
  const offset = document.offsetAt(position);
  const stack = getStack<SparkdownNodeName>(tree, offset, 1);
  const keyword = stack.find((node) => node.name === "LuauStreamKeyword");
  if (keyword) {
    return {
      contents: { kind: MarkupKind.Markdown, value: STREAM_BLOCK_DESCRIPTION },
      range: document.range(keyword.from, keyword.to),
    };
  }
  if (!stack.some((node) => node.name === "LuauStream")) {
    return null;
  }
  const line = document.getLineText(position.line);
  const isNameChar = (ch: string | undefined) => !!ch && /\w/.test(ch);
  let start = position.character;
  let end = position.character;
  while (isNameChar(line[start - 1])) start -= 1;
  while (isNameChar(line[end])) end += 1;
  const setting = line.slice(start, end);
  if (!Object.hasOwn(STREAM_SETTING_DOCS, setting) || !/^[ \t]*=/.test(line.slice(end))) {
    return null;
  }
  return {
    contents: { kind: MarkupKind.Markdown, value: STREAM_SETTING_DOCS[setting]! },
    range: {
      start: { line: position.line, character: start },
      end: { line: position.line, character: end },
    },
  };
};

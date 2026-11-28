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

export const STREAM_BLOCK_DESCRIPTION = [
  "`stream NAME { … }` sets the streams in the layout of that name.",
  "",
  "- `advance`: `click` (the built-in value), where each line waits for a click, or `auto`, where each line follows the one before it.",
  "- `pause`: with `auto`, how long after a line finishes typing the next one starts. The built-in value is `0.4s`.",
  "- `clear`: `never` (the built-in value), where entries stay until `[[clear NAME]]`, or `run`, where the entries of earlier runs leave when a new run starts.",
  "- `carry`: how many of the newest entries stay through a clear. The built-in value is `0`.",
  "",
  "A stream that advances by itself waits for a click at the last line before the story leaves it and at any line that ends with `>`. Its lines are gathered first, so it makes room for all of them before the first one shows.",
  "",
  "```sparkdown",
  "stream phone {",
  "  advance = auto",
  "  pause = 0.6s",
  "  clear = run",
  "  carry = 1",
  "}",
  "```",
].join("\n");

export const STREAM_SETTING_DOCS: Readonly<Record<string, string>> = {
  advance:
    "`click` or `auto`. With `click`, the built-in value, each line waits for a click. With `auto`, each line follows the one before it, and the stream waits for a click at the last line before the story leaves it and at any line that ends with `>`.",
  pause:
    "A time, such as `0.6s` or `600ms`. With `advance = auto`, how long after a line finishes typing the next one starts. The built-in value is `0.4s`.",
  clear:
    "`never` or `run`. With `never`, the built-in value, entries stay until `[[clear NAME]]` or `[[close NAME]]`. With `run`, the entries of earlier runs leave when a new run starts, and the stream is gathered to its next clear, so each page is sized on its own. The leaving entries play their `@hide`, the carried ones move to their new place, and then the next line starts.",
  carry:
    "A count, such as `1`. How many of the newest entries stay through a clear, with `clear = run` and with `[[clear NAME]]`. A kept entry is `@carried`. The built-in value is `0`.",
};

export const STREAM_ENTRY_STATE_DOCS: Readonly<Record<string, string>> = {
  latest: "`@latest` is true on the newest entry of a stream, and on the entry of whoever is speaking now in a cast.",
  carried:
    "`@carried` is true on a stream entry that was kept through a clear, by the stream's `carry` setting. It is no longer `@latest` once a newer entry arrives.",
};

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

export const streamBlockCompletion = (): CompletionItem => ({
  label: STREAM_ELEMENT,
  insertText: `${STREAM_ELEMENT} \${1:layout} {\n\tadvance = \${2|auto,click|}\n}`,
  insertTextFormat: InsertTextFormat.Snippet,
  kind: CompletionItemKind.Keyword,
  labelDetails: { description: "settings" },
  documentation: { kind: MarkupKind.Markdown, value: STREAM_BLOCK_DESCRIPTION },
});

export const getStreamEntryStateHover = (
  document: SparkdownDocument,
  tree: Tree,
  position: Position,
): Hover | null => {
  const offset = document.offsetAt(position);
  const stack = getStack<SparkdownNodeName>(tree, offset, 1);
  if (!stack.some((node) => node.name === "LuauStyle")) {
    return null;
  }
  const state = stack.find((node) => node.name === "SelectorStateName");
  if (!state) {
    return null;
  }
  const name = document.getText(document.range(state.from, state.to));
  if (
    !Object.hasOwn(STREAM_ENTRY_STATE_DOCS, name) ||
    document.getText(document.range(state.from - 1, state.from)) !== "@"
  ) {
    return null;
  }
  return {
    contents: { kind: MarkupKind.Markdown, value: STREAM_ENTRY_STATE_DOCS[name]! },
    range: document.range(state.from - 1, state.to),
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

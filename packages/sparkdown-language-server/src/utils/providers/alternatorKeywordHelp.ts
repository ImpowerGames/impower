import { getStack } from "@impower/textmate-grammar-tree/src/tree/utils/getStack";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { type SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import { type SyntaxNode, type Tree } from "@lezer/common";
import { MarkupKind, type Hover, type Position, type Range } from "vscode-languageserver";

export const ALTERNATOR_KEYWORDS = ["queue", "cycle", "chain", "shuffle", "match", "plural"] as const;

export type AlternatorKeyword = (typeof ALTERNATOR_KEYWORDS)[number];

const isAlternatorKeyword = (word: string): word is AlternatorKeyword =>
  (ALTERNATOR_KEYWORDS as readonly string[]).includes(word);

const SEQUENTIAL_FORMS = (keyword: string) =>
  [
    `One line: \`${keyword} | In the hall. | On the stairs. end\``,
    "",
    "Several lines:",
    "",
    "```sparkdown",
    keyword,
    "| In the hall.",
    "| On the stairs.",
    "end",
    "```",
    "",
    `Inside a line: \`A crow .. ${keyword}|calls|waits .. on the fence.\``,
  ].join("\n");

const CONDITIONAL_FORMS = (keyword: string, value: string, arms: [string, string][]) =>
  [
    `One line: \`${keyword}(${value}) ${arms.map(([key, text]) => `| ${key} = ${text}`).join(" ")} end\``,
    "",
    "Several lines:",
    "",
    "```sparkdown",
    `${keyword} ${value}`,
    ...arms.map(([key, text]) => `| ${key} = ${text}`),
    "end",
    "```",
  ].join("\n");

const ALTERNATOR_KEYWORD_SUMMARIES: Record<AlternatorKeyword, string> = {
  queue:
    "`queue` shows its options in order, one each time the story reaches it, and shows nothing once every option has been shown.",
  cycle:
    "`cycle` shows its options in order, one each time the story reaches it, and starts again from the first after the last.",
  chain:
    "`chain` shows its options in order, one each time the story reaches it, and keeps showing the last one after that.",
  shuffle:
    "`shuffle` shows its options in a random order. On its own it shuffles a `cycle`; written before `queue`, `cycle` or `chain` (`shuffle queue | ... end`) it shuffles that kind of set.",
  match:
    "`match` shows the option named by the value after it, or its `other` option when no name matches.",
  plural:
    "`plural` shows the option named by the plural form of the number after it: `one` or `other`, and `zero`, `two`, `few` or `many` where the language has them. With two unnamed options, the first is `one` and the second `other`.",
};

const ALTERNATOR_KEYWORD_FORMS: Record<AlternatorKeyword, string> = {
  queue: SEQUENTIAL_FORMS("queue"),
  cycle: SEQUENTIAL_FORMS("cycle"),
  chain: SEQUENTIAL_FORMS("chain"),
  shuffle: SEQUENTIAL_FORMS("shuffle"),
  match: CONDITIONAL_FORMS("match", "mood", [
    ["happy", "She smiles."],
    ["other", "She waits."],
  ]),
  plural: CONDITIONAL_FORMS("plural", "coins", [
    ["one", "A coin."],
    ["other", "Some coins."],
  ]),
};

const SEQUENTIAL_OPTION_START_RULE = (keyword: string) =>
  `At the start of an option, \`${keyword}\` followed by \`|\` opens a one-line set nested in that option, which ends at its own \`end\`: \`cycle | ${keyword} | A. | B. end | C. end\`. Write \`\\${keyword}\` to show the word itself.`;

const CONDITIONAL_OPTION_START_RULE = (keyword: string, value: string, key: string) =>
  `At the start of an option, \`${keyword}\` with its value in brackets and then \`|\` opens a one-line set nested in that option, which ends at its own \`end\`: \`cycle | ${keyword}(${value}) | ${key} = A. | other = B. end | C. end\`. Write \`\\${keyword}\` to show the word itself.`;

const OPTION_START_RULES: Record<AlternatorKeyword, string> = {
  queue: SEQUENTIAL_OPTION_START_RULE("queue"),
  cycle: SEQUENTIAL_OPTION_START_RULE("cycle"),
  chain: SEQUENTIAL_OPTION_START_RULE("chain"),
  shuffle: SEQUENTIAL_OPTION_START_RULE("shuffle"),
  match: CONDITIONAL_OPTION_START_RULE("match", "mood", "happy"),
  plural: CONDITIONAL_OPTION_START_RULE("plural", "coins", "one"),
};

export const alternatorKeywordDocumentation = (keyword: AlternatorKeyword) =>
  [
    ALTERNATOR_KEYWORD_SUMMARIES[keyword],
    ALTERNATOR_KEYWORD_FORMS[keyword],
    OPTION_START_RULES[keyword],
  ].join("\n\n");

const ESCAPE_HELP = (keyword: string) =>
  `A \`\\\` before \`${keyword}\` at the start of an option keeps it a word: the option shows \`${keyword}\` as text instead of opening a nested set.`;

const ALTERNATOR_BLOCKS: ReadonlySet<string> = new Set<SparkdownNodeName>([
  "LuauSparkdownSequentialAlternatorBlock",
  "LuauSparkdownSingleLineSequentialAlternatorBlock",
  "LuauSparkdownInlineGluedSequentialAlternatorBlock",
  "LuauSparkdownConditionalAlternatorBlock",
  "LuauSparkdownSingleLineConditionalAlternatorBlock",
  "LuauSparkdownInlineGluedConditionalAlternatorBlock",
]);

const NESTING_BLOCKS: ReadonlySet<string> = new Set<SparkdownNodeName>([
  "LuauSparkdownSequentialAlternatorBlock",
  "LuauSparkdownSingleLineSequentialAlternatorBlock",
  "LuauSparkdownConditionalAlternatorBlock",
  "LuauSparkdownSingleLineConditionalAlternatorBlock",
]);

type Read = (from: number, to: number) => string;

const isNestingContent = (node: SyntaxNode | null | undefined): node is SyntaxNode =>
  !!node?.parent && NESTING_BLOCKS.has(node.parent.name) && node.name === `${node.parent.name}_content`;

const separatorBefore = (content: SyntaxNode, offset: number) => {
  let separator: SyntaxNode | null = null;
  for (let child = content.firstChild; child && child.from < offset; child = child.nextSibling) {
    if (child.name === "LuauAlternatorSeparator") {
      separator = child;
    }
  }
  return separator;
};

const startsOption = (content: SyntaxNode, offset: number, read: Read, typed: RegExp) => {
  const separator = separatorBefore(content, offset);
  if (!separator) {
    return false;
  }
  if (separator.to > offset) {
    return /^[ \t]*$/.test(read(offset, separator.to)) && /\|[ \t]*$/.test(read(separator.from, offset));
  }
  return typed.test(read(separator.to, offset));
};

export const alternatorOptionStartAt = (tree: Tree, offset: number, read: Read) => {
  const stack = getStack<SparkdownNodeName>(tree, offset, -1);
  const content = stack.find((node) => isNestingContent(node));
  if (!content || !startsOption(content, offset, read, /^[ \t]*[A-Za-z]*$/)) {
    return undefined;
  }
  return { typed: /[A-Za-z]*$/.exec(read(content.from, offset))?.[0] ?? "" };
};

const blockKeywords = (block: SyntaxNode, read: Read) => {
  const begin = block.getChild(`${block.name}_begin`);
  const words: string[] = [];
  const visit = (node: SyntaxNode) => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.name === "LuauControlKeyword") {
        words.push(read(child.from, child.to).trim());
      } else {
        visit(child);
      }
    }
  };
  if (begin) visit(begin);
  return words.join(" ");
};

const getKeywordHover = (tree: Tree, offset: number, read: Read, range: (from: number, to: number) => Range): Hover | null => {
  const keywordNode = getStack<SparkdownNodeName>(tree, offset, 1).find((node) => node.name === "LuauControlKeyword");
  if (!keywordNode) {
    return null;
  }
  let begin: SyntaxNode | null = keywordNode.parent;
  while (begin && !begin.name.endsWith("_begin")) {
    begin = begin.parent;
  }
  const block = begin?.parent;
  if (!block || !ALTERNATOR_BLOCKS.has(block.name) || begin!.name !== `${block.name}_begin`) {
    return null;
  }
  const keyword = read(keywordNode.from, keywordNode.to).trim();
  if (!isAlternatorKeyword(keyword)) {
    return null;
  }
  const sections: string[] = [];
  const content = block.parent;
  if (isNestingContent(content) && startsOption(content, block.from, read, /^[ \t]*$/)) {
    const outer = blockKeywords(content.parent!, read);
    sections.push(
      `This \`${keyword}\` starts an option of the \`${outer}\` around it, so it opens a one-line set nested in that option, which ends at its own \`end\`.`,
    );
  }
  sections.push(alternatorKeywordDocumentation(keyword));
  return {
    contents: { kind: MarkupKind.Markdown, value: sections.join("\n\n") },
    range: range(keywordNode.from, keywordNode.to),
  };
};

const getEscapeHover = (
  tree: Tree,
  offset: number,
  lineFrom: number,
  lineText: string,
  read: Read,
  range: (from: number, to: number) => Range,
): Hover | null => {
  const column = offset - lineFrom;
  const isWordChar = (ch: string | undefined) => !!ch && /\w/.test(ch);
  if (lineText[column] !== "\\" && !isWordChar(lineText[column])) {
    return null;
  }
  let start = lineText[column] === "\\" ? column + 1 : column;
  while (isWordChar(lineText[start - 1])) start -= 1;
  if (lineText[start - 1] !== "\\") {
    return null;
  }
  let end = start;
  while (isWordChar(lineText[end])) end += 1;
  const word = lineText.slice(start, end);
  if (!isAlternatorKeyword(word)) {
    return null;
  }
  const escapeFrom = lineFrom + start - 1;
  const stack = getStack<SparkdownNodeName>(tree, escapeFrom, 1);
  const escape = stack.find((node) => node.name === "Escape");
  const content = stack.find((node) => isNestingContent(node));
  if (!escape || escape.from !== escapeFrom || !content || !startsOption(content, escapeFrom, read, /^[ \t]*$/)) {
    return null;
  }
  return {
    contents: { kind: MarkupKind.Markdown, value: ESCAPE_HELP(word) },
    range: range(escapeFrom, lineFrom + end),
  };
};

export const getAlternatorKeywordHover = (
  document: SparkdownDocument,
  tree: Tree,
  position: Position,
): Hover | null => {
  const offset = document.offsetAt(position);
  const read: Read = (from, to) => document.read(from, to);
  const range = (from: number, to: number) => document.range(from, to);
  return (
    getKeywordHover(tree, offset, read, range) ??
    getEscapeHover(
      tree,
      offset,
      document.offsetAt({ line: position.line, character: 0 }),
      document.getLineText(position.line),
      read,
      range,
    )
  );
};

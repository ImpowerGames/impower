import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { type SyntaxNode, type Tree } from "@lezer/common";
import { Position, Range } from "vscode-languageserver-textdocument";

export interface ChoiceMenuOption {
  name: string;
  range: Range;
  selectionRange: Range;
}

export interface ChoiceMenu {
  name: string;
  range: Range;
  selectionRange: Range;
  options: ChoiceMenuOption[];
}

const CHOOSE_BLOCK = "LuauSparkdownChooseBlock";
const CHOOSE_CONTENT = "LuauSparkdownChooseBlock_content";
const CHOOSE_KEYWORD = "LuauChooseKeyword";
const CHOICE = "Choice";
const CHOICE_CONTENT = "Choice_content";
const THEN_CLAUSE = "LuauSparkdownChooseThenClause";
const IMPLICIT_ACTION = "ImplicitAction";
const DISPLAY_LINES = new Set([
  "InlineAction",
  "InlineDialogue",
  "BlockAction",
  "BlockDialogue",
]);
const CONTAINS_BLOCKS = /(?:Block|Clause)(?:_content)?$/;
const NOT_PROMPT =
  /^(?:\[\[|\(\(|[$%^:@&]|->|<-|if\b|else\b|elseif\b|label\b|\/\/)/;
const FALLBACK_NAME = "choose";

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

const findWithin = (
  node: SyntaxNode | null,
  name: string,
): SyntaxNode | undefined => {
  if (!node) {
    return undefined;
  }
  const cur = node.cursor();
  do {
    if (cur.name === name) {
      return cur.node;
    }
  } while (cur.next() && cur.from < node.to);
  return undefined;
};

export const getChoiceMenus = (
  document: SparkdownDocument,
  tree: Tree | undefined,
): ChoiceMenu[] => {
  if (!tree) {
    return [];
  }
  const text = document.getText();
  const lineEnd = (line: number): Position => ({
    line,
    character: document
      .getText({
        start: { line, character: 0 },
        end: { line: line + 1, character: 0 },
      })
      .replace(/\r?\n$/, "").length,
  });
  const endBefore = (offset: number, start: Position): Position => {
    const at = document.positionAt(offset);
    const before = document.getText({
      start: { line: at.line, character: 0 },
      end: at,
    });
    if (before.trim() || at.line <= start.line) {
      return at;
    }
    let line = at.line - 1;
    while (line > start.line && !lineEnd(line).character) {
      line -= 1;
    }
    return lineEnd(line);
  };
  const trimmedFrom = (node: SyntaxNode) => {
    const slice = text.slice(node.from, node.to);
    return node.to - slice.trimStart().length;
  };

  const displayText = (node: SyntaxNode): string | undefined => {
    if (node.name === IMPLICIT_ACTION) {
      const line = oneLine(text.slice(node.from, node.to));
      return NOT_PROMPT.test(line) ? undefined : line;
    }
    if (DISPLAY_LINES.has(node.name)) {
      const content = node.getChild(`${node.name}_content`);
      return content
        ? oneLine(text.slice(content.from, content.to))
        : undefined;
    }
    return undefined;
  };

  const readOption = (
    choice: SyntaxNode,
    boundary: number,
  ): ChoiceMenuOption | undefined => {
    const content = choice.getChild(CHOICE_CONTENT);
    const name = content ? oneLine(text.slice(content.from, content.to)) : "";
    if (!name) {
      return undefined;
    }
    const start = document.positionAt(trimmedFrom(choice));
    return {
      name,
      range: { start, end: endBefore(boundary, start) },
      selectionRange: { start, end: document.positionAt(choice.to) },
    };
  };

  const readMenu = (block: SyntaxNode): ChoiceMenu => {
    const keyword = findWithin(block.firstChild, CHOOSE_KEYWORD);
    const keywordFrom = keyword?.from ?? trimmedFrom(block);
    const keywordTo = keyword?.to ?? keywordFrom;
    const start = document.positionAt(keywordFrom);
    let prompt: string | undefined;
    const choices: SyntaxNode[] = [];
    let optionsEnd = block.to;
    const content = block.getChild(CHOOSE_CONTENT);
    for (let child = content?.firstChild; child; child = child.nextSibling) {
      if (child.name === CHOICE) {
        choices.push(child);
      } else if (child.name === THEN_CLAUSE) {
        optionsEnd = child.from;
        break;
      } else if (!choices.length) {
        prompt = displayText(child) || prompt;
      }
    }
    if (optionsEnd === block.to && content) {
      optionsEnd = content.to;
    }
    const options = choices.flatMap((choice, index) => {
      const option = readOption(choice, choices[index + 1]?.from ?? optionsEnd);
      return option ? [option] : [];
    });
    return {
      name: prompt || options[0]?.name || FALLBACK_NAME,
      range: { start, end: endBefore(block.to, start) },
      selectionRange: { start, end: document.positionAt(keywordTo) },
      options,
    };
  };

  const menus: ChoiceMenu[] = [];
  tree.iterate({
    enter: (node) => {
      if (node.type.isTop) {
        return true;
      }
      if (node.name === CHOOSE_BLOCK) {
        menus.push(readMenu(node.node));
        return true;
      }
      return CONTAINS_BLOCKS.test(node.name);
    },
  });
  return menus;
};

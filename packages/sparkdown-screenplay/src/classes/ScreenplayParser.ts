import { type SyntaxNode, Tree } from "@lezer/common";
import GRAMMAR_DEFINITION from "../../../sparkdown/language/sparkdown.language-grammar.json";
import type { SparkdownNodeName } from "../../../sparkdown/src/compiler/types/SparkdownNodeName";
import { readSkipping } from "../../../sparkdown/src/compiler/utils/readSkipping";
import { trimStyled } from "../../../sparkdown/src/runtime/displayStyle";
import { TextmateGrammarParser } from "../../../textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { ScreenplayToken } from "../types/ScreenplayToken";
import { MetadataTokenType } from "../types/ScreenplayTokenType";
import { printsAsBlankLine } from "../utils/printsAsBlankLine";
import { readStyled } from "../utils/readStyled";
import { isRootFunctionName } from "../utils/rootFunctionName";

const COMPILER_FIELDS = new Set(["typecheck"]);

const SAME_LINE_TEXT_SEPARATORS = new Set([
  "SparkdownBlockComment",
  "SparkdownBlockCommentOnLine",
]);

const CHOICE_TEXT_COMMENTS = new Set(["SparkdownBlockComment", "SparkdownInlineComment"]);

const TOKENS_ON_LEAVE = new Set(["DialogueCharacter", "Choice"]);

interface Reading {
  text: string;
  styled: string;
}

const NO_TEXT: Reading = { text: "", styled: "" };

const NEWLINE: Reading = { text: "\n", styled: "\n" };

const join = (...parts: Reading[]): Reading => ({
  text: parts.map((part) => part.text).join(""),
  styled: parts.map((part) => part.styled).join(""),
});

const isWordSeparator = (child: SyntaxNode) =>
  child.name === "Glue" || child.name === "SparkdownBlockComment";

export const screenplayTokens = (tree: Tree, script: string): ScreenplayToken[] => {
    const stack: SparkdownNodeName[] = [];
    const tokens: ScreenplayToken[] = [{ tag: "page_break" }];
    let frontMatterKey = "";
    let frontMatterValue = NO_TEXT;
    let title = NO_TEXT;
    let heading = NO_TEXT;
    let transitional = NO_TEXT;
    let action = NO_TEXT;
    let choice = NO_TEXT;
    let choice_prefix = "";
    let choice_suffix = "";
    let character = NO_TEXT;
    let position: "l" | "r" | undefined = undefined;
    let lineStart = 0;
    const read = (from: number, to: number) => script.slice(from, to);
    let leading = false;
    const readWords = (node: SyntaxNode): Reading => {
      const text = readSkipping(node, read, isWordSeparator);
      const styled = readStyled(node, read, isWordSeparator);
      if (leading) {
        leading = false;
        return { text: text.trimStart(), styled: trimStyled(styled, { end: false }) };
      }
      return { text, styled };
    };
    const readLine = (node: SyntaxNode): Reading => ({
      text: read(node.from, node.to),
      styled: readStyled(node, read),
    });

    const continuesAfterComment = (node: SyntaxNode): boolean => {
      let before = node.prevSibling;
      while (before && SAME_LINE_TEXT_SEPARATORS.has(before.name)) {
        before = before.prevSibling;
      }
      return before !== node.prevSibling && before?.name === "TextChunk";
    };
    const appendLine = (lines: Reading, node: SyntaxNode, line: Reading): Reading =>
      continuesAfterComment(node)
        ? join(
            {
              text: lines.text.replace(/\n$/, ""),
              styled: lines.styled.replace(/\n$/, ""),
            },
            line,
            NEWLINE,
          )
        : join(lines, line, NEWLINE);
    const isChoiceComment = (child: SyntaxNode) => CHOICE_TEXT_COMMENTS.has(child.name);
    const readChoiceText = (node: SyntaxNode): Reading => ({
      text: readSkipping(node, read, isChoiceComment),
      styled: readStyled(node, read, isChoiceComment),
    });

    let headingContinues = false;
    const flushText = () => {
      if (title.text) {
        tokens.push({ tag: "title", ...title });
        title = NO_TEXT;
      }
      if (heading.text) {
        tokens.push(
          headingContinues
            ? { tag: "heading", ...heading, continued: true }
            : { tag: "heading", ...heading },
        );
        heading = NO_TEXT;
        headingContinues = true;
      }
      if (transitional.text) {
        tokens.push({ tag: "transitional", ...transitional });
        transitional = NO_TEXT;
      }
      if (action.text) {
        tokens.push({ tag: "action", ...action });
        action = NO_TEXT;
      }
    };

    let pendingTokens = 0;
    let heldSeparator: number | undefined = undefined;
    const addSeparator = (from: number) => {
      if (pendingTokens > 0) {
        heldSeparator ??= from;
        return;
      }
      flushText();
      if (tokens.at(-1)?.tag !== "separator") {
        tokens.push({ tag: "separator", from });
      }
    };

    const isWhitespaceOnly = (start: number, end: number): boolean => {
      for (let i = start; i < end; i++) {
        const c = script.charCodeAt(i);
        if (c !== 0x20 && c !== 0x09) return false;
      }
      return true;
    };

    tree.iterate({
      enter: (nodeRef) => {
        const name = nodeRef.name as SparkdownNodeName;
        const from = nodeRef.from;
        const to = nodeRef.to;

        if (printsAsBlankLine(name, nodeRef.node.parent?.name)) {
          addSeparator(from);
        }
        if (TOKENS_ON_LEAVE.has(name)) {
          pendingTokens++;
        }
        if (name === "SparkdownBlockComment") {
          return false;
        }
        if (name === "Newline") {
          if (isWhitespaceOnly(lineStart, from)) {
            addSeparator(lineStart);
          }
          lineStart = to;
          leading = false;
        }
        if (name === "LeadingGlue") {
          leading = true;
        }

        if (name === "FrontMatterFieldKeyword") {
          const text = read(from, to);
          frontMatterKey = text;
          frontMatterValue = NO_TEXT;
        }
        if (name === "FrontMatterString") {
          frontMatterValue = join(frontMatterValue, readLine(nodeRef.node));
        }

        if (name === "Scene") {
          tokens.push({ tag: "page_break" });
        }
        if (name === "SceneDeclarationName") {
          const text = read(from, to);
          tokens.push({ tag: "scene", text });
        }

        if (name === "BranchDeclarationName") {
          const text = read(from, to);
          tokens.push({ tag: "branch", text });
        }

        if (
          name === "LuauFunctionDeclarationName" &&
          isRootFunctionName(nodeRef.node, read)
        ) {
          const text = read(from, to);
          tokens.push({ tag: "function", text });
        }

        if (stack.includes("BlockTitle") || stack.includes("InlineTitle")) {
          if (name === "TextChunk") {
            title = appendLine(title, nodeRef.node, readWords(nodeRef.node));
          }
          if (name === "ParentheticalLineContent") {
            title = join(title, readLine(nodeRef.node), NEWLINE);
          }
        }

        if (stack.includes("BlockHeading") || stack.includes("InlineHeading")) {
          if (name === "TextChunk") {
            heading = appendLine(heading, nodeRef.node, readWords(nodeRef.node));
          }
          if (name === "ParentheticalLineContent") {
            heading = join(heading, readLine(nodeRef.node), NEWLINE);
          }
        }

        if (
          stack.includes("BlockTransitional") ||
          stack.includes("InlineTransitional")
        ) {
          if (name === "TextChunk") {
            transitional = appendLine(
              transitional,
              nodeRef.node,
              readWords(nodeRef.node),
            );
          }
          if (name === "ParentheticalLineContent") {
            transitional = join(transitional, readLine(nodeRef.node), NEWLINE);
          }
        }

        if (
          stack.includes("BlockAction") ||
          stack.includes("InlineAction") ||
          stack.includes("ImplicitAction")
        ) {
          if (name === "TextChunk") {
            action = appendLine(action, nodeRef.node, readWords(nodeRef.node));
          }
          if (name === "ParentheticalLineContent") {
            action = join(action, readLine(nodeRef.node), NEWLINE);
          }
        }

        if (name === "DialogueCharacterName") {
          character = readLine(nodeRef.node);
        }
        if (name === "DialogueCharacterParenthetical") {
          character = join(character, readLine(nodeRef.node));
        }
        if (name === "DialogueCharacterPositionContent") {
          const text = read(from, to);
          if (text === "<" || text === "left" || text === "l") {
            position = "l";
          } else if (text === ">" || text === "right" || text === "r") {
            position = "r";
          }
        }
        if (
          stack.includes("BlockDialogue_content") ||
          stack.includes("InlineDialogue_content")
        ) {
          if (name === "TextChunk") {
            const continues = continuesAfterComment(nodeRef.node);
            const words = readWords(nodeRef.node);
            const last = tokens.at(-1);
            if (continues && last?.tag === "dialogue_content") {
              last.text = `${last.text ?? ""}${words.text}`;
              last.styled = `${last.styled ?? ""}${words.styled}`;
            } else {
              tokens.push({
                tag: "dialogue_content",
                ...words,
                position,
              });
            }
          }
          if (name === "ParentheticalLineContent") {
            tokens.push({
              tag: "dialogue_parenthetical",
              ...readLine(nodeRef.node),
              position,
            });
          }
        }

        if (stack.includes("Choice")) {
          if (name === "ChoiceMark") {
            const text = read(from, to);
            choice_prefix += text;
          }
          if (name === "Choice_content") {
            choice = join(choice, readChoiceText(nodeRef.node));
          }
        }

        stack.push(name);
        return undefined;
      },
      leave: (nodeRef) => {
        const name = nodeRef.name as SparkdownNodeName;
        if (name === "FrontMatterField" && !COMPILER_FIELDS.has(frontMatterKey)) {
          tokens.push({
            tag: ("meta:" + frontMatterKey) as MetadataTokenType,
            ...frontMatterValue,
          });
        }

        if (
          name === "BlockTitle" ||
          name === "InlineTitle" ||
          name === "BlockHeading" ||
          name === "InlineHeading" ||
          name === "BlockTransitional" ||
          name === "InlineTransitional" ||
          name === "BlockAction" ||
          name === "InlineAction" ||
          name === "ImplicitAction"
        ) {
          flushText();
          headingContinues = false;
        }

        if (name === "DialogueCharacter") {
          tokens.push({
            tag: "dialogue_character",
            ...character,
            position,
          });
          character = NO_TEXT;
        }
        if (name === "BlockDialogue" || name === "InlineDialogue") {
          position = undefined;
        }

        if (name === "Choice") {
          tokens.push({
            tag: "choice",
            ...choice,
            prefix: choice_prefix,
            suffix: choice_suffix,
          });
          choice = NO_TEXT;
          choice_prefix = "";
          choice_suffix = "";
        }

        if (TOKENS_ON_LEAVE.has(name)) {
          pendingTokens--;
          if (pendingTokens === 0 && heldSeparator !== undefined) {
            const held = heldSeparator;
            heldSeparator = undefined;
            addSeparator(held);
          }
        }

        stack.pop();
      },
    });

    while (tokens.at(0)?.tag === "separator") {
      tokens.shift();
    }
    while (tokens.at(-1)?.tag === "separator") {
      tokens.pop();
    }

    return tokens;
};

export default class ScreenplayParser {
  protected _parser = new TextmateGrammarParser(GRAMMAR_DEFINITION);

  parse(script: string): ScreenplayToken[] {
    if (!script) {
      return [];
    }
    return screenplayTokens(this.buildTree(script), script);
  }

  parseAll(scripts: string[]): ScreenplayToken[] {
    return scripts.flatMap((script) => this.parse(script));
  }

  buildTree(script: string): Tree {
    const paddedScript = script + "\n\n";
    return this._parser.parse(paddedScript);
  }
}

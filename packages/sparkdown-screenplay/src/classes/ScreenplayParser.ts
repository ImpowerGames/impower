import { type SyntaxNode, Tree } from "@lezer/common";
import GRAMMAR_DEFINITION from "../../../sparkdown/language/sparkdown.language-grammar.json";
import type { SparkdownNodeName } from "../../../sparkdown/src/compiler/types/SparkdownNodeName";
import { readSkipping } from "../../../sparkdown/src/compiler/utils/readSkipping";
import { TextmateGrammarParser } from "../../../textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { ScreenplayToken } from "../types/ScreenplayToken";
import { MetadataTokenType } from "../types/ScreenplayTokenType";
import { printsAsBlankLine } from "../utils/printsAsBlankLine";
import { isRootFunctionName } from "../utils/rootFunctionName";

const COMPILER_FIELDS = new Set(["typecheck"]);

const SAME_LINE_TEXT_SEPARATORS = new Set([
  "SparkdownBlockComment",
  "SparkdownBlockCommentOnLine",
]);

const TEXT_UNPRINTED = new Set(["Glue", "SparkdownBlockComment", "Divert"]);

const CHOICE_UNPRINTED = new Set(["SparkdownBlockComment", "SparkdownInlineComment", "Divert", "Tags", "Tag"]);

const TOKENS_ON_LEAVE = new Set(["DialogueCharacter", "Choice"]);

export const screenplayTokens = (tree: Tree, script: string): ScreenplayToken[] => {
    const stack: SparkdownNodeName[] = [];
    const tokens: ScreenplayToken[] = [{ tag: "page_break" }];
    let frontMatterKey = "";
    let frontMatterValue = "";
    let title = "";
    let heading = "";
    let transitional = "";
    let action = "";
    let choice = "";
    let choice_prefix = "";
    let choice_suffix = "";
    let character = "";
    let position: "l" | "r" | undefined = undefined;
    let textSource: number[] = [];
    let characterSource: number[] = [];
    let choiceSource: number[] = [];
    let lineStart = 0;
    const read = (from: number, to: number) => script.slice(from, to);
    let sink: number[] = [];
    const readIntoSink = (from: number, to: number) => {
      if (to > from) sink.push(from, to);
      return read(from, to);
    };
    const readInto = (source: number[]) => {
      sink = source;
      return readIntoSink;
    };
    let leading = false;
    const readWords = (node: SyntaxNode, source: number[]): string => {
      const text = readSkipping(
        node,
        readInto(source),
        (child) => TEXT_UNPRINTED.has(child.name),
      );
      if (leading) {
        leading = false;
        return text.trimStart();
      }
      return text;
    };

    const continuesAfterComment = (node: SyntaxNode): boolean => {
      let before = node.prevSibling;
      while (before && SAME_LINE_TEXT_SEPARATORS.has(before.name)) {
        before = before.prevSibling;
      }
      return before !== node.prevSibling && before?.name === "TextChunk";
    };
    const appendLine = (lines: string, node: SyntaxNode, text: string) =>
      continuesAfterComment(node)
        ? `${lines.replace(/\n$/, "")}${text}\n`
        : `${lines}${text}\n`;
    const readChoiceText = (node: SyntaxNode): string =>
      readSkipping(node, readInto(choiceSource), (child) => CHOICE_UNPRINTED.has(child.name));

    let headingContinues = false;
    const flushText = () => {
      const source = textSource;
      textSource = [];
      if (title) {
        tokens.push({ tag: "title", text: title, source });
        title = "";
      }
      if (heading) {
        tokens.push(
          headingContinues
            ? { tag: "heading", text: heading, continued: true, source }
            : { tag: "heading", text: heading, source },
        );
        heading = "";
        headingContinues = true;
      }
      if (transitional) {
        tokens.push({ tag: "transitional", text: transitional, source });
        transitional = "";
      }
      if (action) {
        tokens.push({ tag: "action", text: action, source });
        action = "";
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
          frontMatterValue = "";
        }
        if (name === "FrontMatterString") {
          const text = read(from, to);
          frontMatterValue += text;
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
            title = appendLine(title, nodeRef.node, readWords(nodeRef.node, textSource));
          }
          if (name === "ParentheticalLineContent") {
            textSource.push(from, to);
            const text = read(from, to);
            title += text + "\n";
          }
        }

        if (stack.includes("BlockHeading") || stack.includes("InlineHeading")) {
          if (name === "TextChunk") {
            heading = appendLine(heading, nodeRef.node, readWords(nodeRef.node, textSource));
          }
          if (name === "ParentheticalLineContent") {
            textSource.push(from, to);
            const text = read(from, to);
            heading += text + "\n";
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
              readWords(nodeRef.node, textSource),
            );
          }
          if (name === "ParentheticalLineContent") {
            textSource.push(from, to);
            const text = read(from, to);
            transitional += text + "\n";
          }
        }

        if (
          stack.includes("BlockAction") ||
          stack.includes("InlineAction") ||
          stack.includes("ImplicitAction")
        ) {
          if (name === "TextChunk") {
            action = appendLine(action, nodeRef.node, readWords(nodeRef.node, textSource));
          }
          if (name === "ParentheticalLineContent") {
            textSource.push(from, to);
            const text = read(from, to);
            action += text + "\n";
          }
        }

        if (name === "DialogueCharacterName") {
          const text = read(from, to);
          character = text;
          characterSource = [from, to];
        }
        if (name === "DialogueCharacterParenthetical") {
          const text = read(from, to);
          character += text;
          characterSource.push(from, to);
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
            const last = tokens.at(-1);
            if (continues && last?.tag === "dialogue_content") {
              last.text = `${last.text ?? ""}${readWords(nodeRef.node, (last.source ??= []))}`;
            } else {
              const source: number[] = [];
              tokens.push({
                tag: "dialogue_content",
                text: readWords(nodeRef.node, source),
                position,
                source,
              });
            }
          }
          if (name === "ParentheticalLineContent") {
            const text = read(from, to);
            tokens.push({
              tag: "dialogue_parenthetical",
              text,
              position,
              source: [from, to],
            });
          }
        }

        if (stack.includes("Choice")) {
          if (name === "ChoiceMark") {
            const text = read(from, to);
            choice_prefix += text;
            choiceSource.push(from, to);
          }
          if (name === "Choice_content") {
            choice += readChoiceText(nodeRef.node);
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
            text: frontMatterValue,
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
            text: character,
            position,
            source: characterSource,
          });
          character = "";
          characterSource = [];
        }
        if (name === "BlockDialogue" || name === "InlineDialogue") {
          position = undefined;
        }

        if (name === "Choice") {
          tokens.push({
            tag: "choice",
            text: choice,
            prefix: choice_prefix,
            suffix: choice_suffix,
            source: choiceSource,
          });
          choice = "";
          choiceSource = [];
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

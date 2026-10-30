import { type SyntaxNode, Tree } from "@lezer/common";
import GRAMMAR_DEFINITION from "../../../sparkdown/language/sparkdown.language-grammar.json";
import type { SparkdownNodeName } from "../../../sparkdown/src/compiler/types/SparkdownNodeName";
import { TextmateGrammarParser } from "../../../textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { ScreenplayToken } from "../types/ScreenplayToken";
import { MetadataTokenType } from "../types/ScreenplayTokenType";

const COMPILER_FIELDS = new Set(["typecheck"]);

export default class ScreenplayParser {
  protected _parser = new TextmateGrammarParser(GRAMMAR_DEFINITION);

  parse(script: string): ScreenplayToken[] {
    if (!script) {
      return [];
    }

    const tree = this.buildTree(script);
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
    let lineStart = 0;
    const read = (from: number, to: number) => script.slice(from, to);
    let leading = false;
    const readWords = (node: SyntaxNode): string => {
      let text = "";
      let pos = node.from;
      const visit = (parent: SyntaxNode) => {
        for (let child = parent.firstChild; child; child = child.nextSibling) {
          if (child.name === "Glue") {
            text += read(pos, child.from);
            pos = child.to;
          } else {
            visit(child);
          }
        }
      };
      visit(node);
      text += read(pos, node.to);
      if (leading) {
        leading = false;
        return text.trimStart();
      }
      return text;
    };

    const addSeparator = () => {
      if (tokens.at(-1)?.tag !== "separator") {
        tokens.push({ tag: "separator" });
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

        if (nodeRef.node.parent?.name === "sparkdown") {
          if (
            name !== "FrontMatter" &&
            name !== "Scene" &&
            name !== "Branch" &&
            name !== "BlockTitle" &&
            name !== "InlineTitle" &&
            name !== "BlockHeading" &&
            name !== "InlineHeading" &&
            name !== "BlockTransitional" &&
            name !== "InlineTransitional" &&
            name !== "BlockWrite" &&
            name !== "InlineWrite" &&
            name !== "BlockDialogue" &&
            name !== "InlineDialogue" &&
            name !== "BlockAction" &&
            name !== "InlineAction" &&
            name !== "ImplicitAction" &&
            name !== "Choice" &&
            name !== "Newline" &&
            name !== "Whitespace"
          ) {
            addSeparator();
          }
        }
        if (name === "Newline") {
          if (isWhitespaceOnly(lineStart, from)) {
            addSeparator();
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

        if (stack.includes("BlockTitle") || stack.includes("InlineTitle")) {
          if (name === "TextChunk") {
            const text = readWords(nodeRef.node);
            title += text + "\n";
          }
          if (name === "ParentheticalLineContent") {
            const text = read(from, to);
            title += text + "\n";
          }
        }

        if (stack.includes("BlockHeading") || stack.includes("InlineHeading")) {
          if (name === "TextChunk") {
            const text = readWords(nodeRef.node);
            heading += text + "\n";
          }
          if (name === "ParentheticalLineContent") {
            const text = read(from, to);
            heading += text + "\n";
          }
        }

        if (
          stack.includes("BlockTransitional") ||
          stack.includes("InlineTransitional")
        ) {
          if (name === "TextChunk") {
            const text = readWords(nodeRef.node);
            transitional += text + "\n";
          }
          if (name === "ParentheticalLineContent") {
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
            const text = readWords(nodeRef.node);
            action += text + "\n";
          }
          if (name === "ParentheticalLineContent") {
            const text = read(from, to);
            action += text + "\n";
          }
        }

        if (name === "DialogueCharacterName") {
          const text = read(from, to);
          character = text;
        }
        if (name === "DialogueCharacterParenthetical") {
          const text = read(from, to);
          character += text;
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
            const text = readWords(nodeRef.node);
            tokens.push({
              tag: "dialogue_content",
              text,
              position,
            });
          }
          if (name === "ParentheticalLineContent") {
            const text = read(from, to);
            tokens.push({
              tag: "dialogue_parenthetical",
              text,
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
            const text = read(from, to);
            choice += text;
          }
        }

        stack.push(name);
      },
      leave: (nodeRef) => {
        const name = nodeRef.name as SparkdownNodeName;
        if (name === "FrontMatterField" && !COMPILER_FIELDS.has(frontMatterKey)) {
          tokens.push({
            tag: ("meta:" + frontMatterKey) as MetadataTokenType,
            text: frontMatterValue,
          });
        }

        if (name === "BlockTitle" || name === "InlineTitle") {
          tokens.push({
            tag: "title",
            text: title,
          });
          title = "";
        }

        if (name === "BlockHeading" || name === "InlineHeading") {
          tokens.push({
            tag: "heading",
            text: heading,
          });
          heading = "";
        }

        if (name === "BlockTransitional" || name === "InlineTransitional") {
          tokens.push({
            tag: "transitional",
            text: transitional,
          });
          transitional = "";
        }

        if (
          name === "BlockAction" ||
          name === "InlineAction" ||
          name === "ImplicitAction"
        ) {
          tokens.push({
            tag: "action",
            text: action,
          });
          action = "";
        }

        if (name === "DialogueCharacter") {
          tokens.push({
            tag: "dialogue_character",
            text: character,
            position,
          });
          character = "";
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
          });
          choice = "";
          choice_prefix = "";
          choice_suffix = "";
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
  }

  parseAll(scripts: string[]): ScreenplayToken[] {
    return scripts.flatMap((script) => this.parse(script));
  }

  buildTree(script: string): Tree {
    const paddedScript = script + "\n\n";
    return this._parser.parse(paddedScript);
  }
}

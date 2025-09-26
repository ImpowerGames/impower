import { Tree } from "@lezer/common";
import GRAMMAR_DEFINITION from "../../../sparkdown/language/sparkdown.language-grammar.json";
import type { SparkdownNodeName } from "../../../sparkdown/src/types/SparkdownNodeName";
import { TextmateGrammarParser } from "../../../textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { ScreenplayToken } from "../types/ScreenplayToken";
import { MetadataTokenType } from "../types/ScreenplayTokenType";

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
    let heading = "";
    let transitional = "";
    let action = "";
    let choice = "";
    let choice_prefix = "";
    let choice_suffix = "";
    let character = "";
    let position: "l" | "r" | undefined = undefined;
    let isBlankLine = true;
    const read = (from: number, to: number) => script.slice(from, to);

    const addSeparator = () => {
      if (tokens.at(-1)?.tag !== "separator") {
        tokens.push({ tag: "separator" });
      }
    };

    tree.iterate({
      enter: (nodeRef) => {
        const name = nodeRef.name as SparkdownNodeName;
        const from = nodeRef.from;
        const to = nodeRef.to;

        // Separator
        if (nodeRef.node.parent?.name === "sparkdown") {
          if (
            name !== "FrontMatter" &&
            name !== "Function" &&
            name !== "Scene" &&
            name !== "Branch" &&
            name !== "Knot" &&
            name !== "Stitch" &&
            name !== "BlockTitle" &&
            name !== "BlockHeading" &&
            name !== "BlockTransitional" &&
            name !== "BlockDialogue" &&
            name !== "InlineDialogue" &&
            name !== "BlockAction" &&
            name !== "InlineAction" &&
            name !== "Choice" &&
            name !== "Newline" &&
            name !== "Whitespace"
          ) {
            // Add separator for hidden top-level nodes
            addSeparator();
          }
        }
        if (name === "Newline") {
          if (isBlankLine) {
            // Add separator for blank lines
            addSeparator();
          }
          isBlankLine = true;
        } else if (to > from && name !== "sparkdown" && name !== "Whitespace") {
          isBlankLine = false;
        }

        // FrontMatter
        if (name === "FrontMatterFieldKeyword") {
          const text = read(from, to);
          frontMatterKey = text;
          frontMatterValue = "";
        }
        if (name === "FrontMatterString") {
          const text = read(from, to);
          frontMatterValue += text;
        }

        // Function
        if (name === "Function") {
          tokens.push({ tag: "page_break" });
        }
        if (name === "FunctionDeclarationName") {
          const text = read(from, to);
          tokens.push({ tag: "function", text });
        }

        // Scene
        if (name === "Scene") {
          tokens.push({ tag: "page_break" });
        }
        if (name === "SceneDeclarationName") {
          const text = read(from, to);
          tokens.push({ tag: "scene", text });
        }

        // Branch
        if (name === "BranchDeclarationName") {
          const text = read(from, to);
          tokens.push({ tag: "branch", text });
        }

        // Knot
        if (name === "Knot") {
          tokens.push({ tag: "page_break" });
        }
        if (name === "KnotDeclarationName") {
          const text = read(from, to);
          tokens.push({ tag: "knot", text });
        }

        // Stitch
        if (name === "StitchDeclarationName") {
          const text = read(from, to);
          tokens.push({ tag: "stitch", text });
        }

        // Transitional
        if (stack.includes("BlockTransitional")) {
          if (name === "TextChunk") {
            const text = read(from, to);
            transitional += text + "\n";
          }
          if (name === "ParentheticalLineContent") {
            const text = read(from, to);
            transitional += text + "\n";
          }
        }

        // Heading
        if (stack.includes("BlockHeading")) {
          if (name === "TextChunk") {
            const text = read(from, to);
            heading += text + "\n";
          }
          if (name === "ParentheticalLineContent") {
            const text = read(from, to);
            heading += text + "\n";
          }
        }

        // Action
        if (stack.includes("BlockAction") || stack.includes("InlineAction")) {
          if (name === "TextChunk") {
            const text = read(from, to);
            action += text + "\n";
          }
          if (name === "ParentheticalLineContent") {
            const text = read(from, to);
            action += text + "\n";
          }
        }

        // Dialogue
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
            const text = read(from, to);
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

        // Choice
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
        // FrontMatter
        if (name === "FrontMatterField") {
          tokens.push({
            tag: frontMatterKey as MetadataTokenType,
            text: frontMatterValue,
          });
        }

        // Transitional
        if (name === "BlockTransitional") {
          tokens.push({
            tag: "transitional",
            text: transitional,
          });
          transitional = "";
        }

        // Heading
        if (name === "BlockHeading") {
          tokens.push({
            tag: "heading",
            text: heading,
          });
          heading = "";
        }

        // Action
        if (name === "BlockAction" || name === "InlineAction") {
          tokens.push({
            tag: "action",
            text: action,
          });
          action = "";
        }

        // Dialogue
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

        // Choice
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
      // trim away leading separators
      tokens.shift();
    }
    while (tokens.at(-1)?.tag === "separator") {
      // trim away trailing separators
      tokens.pop();
    }

    return tokens;
  }

  parseAll(scripts: string[]): ScreenplayToken[] {
    return scripts.flatMap((script) => this.parse(script));
  }

  buildTree(script: string): Tree {
    // Pad script so we ensure all scopes are properly closed before the end of the file.
    const paddedScript = script + "\n\n";
    return this._parser.parse(paddedScript);
  }
}

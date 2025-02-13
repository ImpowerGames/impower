import {
  Compiler as GrammarCompiler,
  NodeSet,
  NodeType,
  Tree,
} from "../../../grammar-compiler/src/compiler";
import { NodeID } from "../../../grammar-compiler/src/core";
import { Grammar } from "../../../grammar-compiler/src/grammar";
import GRAMMAR_DEFINITION from "../../../sparkdown/language/sparkdown.language-grammar.json";
import type { SparkdownNodeName } from "../../../sparkdown/src/types/SparkdownNodeName";
import { ScreenplayToken } from "../types/ScreenplayToken";
import { MetadataTokenType } from "../types/ScreenplayTokenType";
// import { printTree } from "../../../grammar-compiler/src/compiler/utils/printTree";

const NODE_TOP = NodeType.define({
  id: NodeID.top,
  name: "sparkdown",
  top: true,
});

const NODE_ERROR_UNRECOGNIZED = NodeType.define({
  name: "⚠️ ERROR_UNRECOGNIZED",
  id: NodeID.unrecognized,
  error: true,
});

const NODE_ERROR_INCOMPLETE = NodeType.define({
  name: "⚠️ ERROR_INCOMPLETE",
  id: NodeID.incomplete,
  error: true,
});

const getRuleNodeType = (id: number, name: string): NodeType => {
  if (id === NodeID.none) {
    return NodeType.none;
  }
  if (id === NodeID.top) {
    return NODE_TOP;
  }
  if (id === NodeID.unrecognized) {
    return NODE_ERROR_UNRECOGNIZED;
  }
  if (id === NodeID.incomplete) {
    return NODE_ERROR_INCOMPLETE;
  }
  return NodeType.define({ id, name });
};

export default class ScreenplayParser {
  protected _nodeTypeProp = "nodeType";

  protected _nodeSet: NodeSet;

  protected _grammarCompiler: GrammarCompiler;

  protected _grammar: Grammar;
  get grammar() {
    return this._grammar;
  }

  constructor() {
    const declarator = (id: number, name: string) => ({
      [this._nodeTypeProp]: getRuleNodeType(id, name),
    });
    this._grammar = new Grammar(GRAMMAR_DEFINITION, declarator);
    const nodeTypes = this.grammar.nodes.map(
      (n) => n.props[this._nodeTypeProp]
    );
    this._nodeSet = new NodeSet(nodeTypes);
    this._grammarCompiler = new GrammarCompiler(this._grammar, this._nodeSet);
  }

  parse(script: string): ScreenplayToken[] {
    if (!script) {
      return [];
    }

    const tree = this.buildTree(script);
    const stack: SparkdownNodeName[] = [];
    const tokens: ScreenplayToken[] = [{ tag: "page_break" }];
    let frontMatterKey = "";
    let frontMatterValue = "";
    let scene = "";
    let transition = "";
    let explicitActionMark = false;
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
      enter: (node) => {
        const name = node.name as SparkdownNodeName;
        const from = node.from;
        const to = node.to;

        // Separator
        if (node.matchContext(["sparkdown"])) {
          if (
            name !== "FrontMatter" &&
            name !== "Knot" &&
            name !== "Stitch" &&
            name !== "Transition" &&
            name !== "Scene" &&
            name !== "Action" &&
            name !== "BlockDialogue" &&
            name !== "InlineDialogue" &&
            name !== "Choice"
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
        if (name === "FrontMatterString_content") {
          const text = read(from, to);
          frontMatterValue += text + "\n";
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

        // Transition
        if (stack.includes("Transition")) {
          if (name === "TextChunk") {
            const text = read(from, to);
            transition += text + "\n";
          }
          if (name === "ParentheticalLineContent") {
            const text = read(from, to);
            transition += text + "\n";
          }
        }

        // Scene
        if (stack.includes("Scene")) {
          if (name === "TextChunk") {
            const text = read(from, to);
            scene += text + "\n";
          }
          if (name === "ParentheticalLineContent") {
            const text = read(from, to);
            scene += text + "\n";
          }
        }

        // Action
        if (stack.includes("Action")) {
          if (name === "ActionMark") {
            explicitActionMark = true;
          }
          if (stack.includes("Action_begin")) {
            if (name === "Whitespace") {
              const text = read(from, to);
              // This action does not begin with an explicit action mark,
              // so include the indented whitespace.
              action += text;
            }
          }
          if (name === "Indent") {
            if (!explicitActionMark) {
              const text = read(from, to);
              // This action does not begin with an explicit action mark,
              // so include the indented whitespace.
              action += text;
            }
          }
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
      leave: (node) => {
        const name = node.name as SparkdownNodeName;
        // FrontMatter
        if (name === "FrontMatterField") {
          tokens.push({
            tag: frontMatterKey as MetadataTokenType,
            text: frontMatterValue,
          });
        }

        // Transition
        if (name === "Transition") {
          tokens.push({
            tag: "transition",
            text: transition,
          });
          transition = "";
        }

        // Scene
        if (name === "Scene") {
          tokens.push({
            tag: "scene",
            text: scene,
          });
          scene = "";
        }

        // Action
        if (name === "Action") {
          tokens.push({
            tag: "action",
            text: action,
          });
          explicitActionMark = false;
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
    const result = this._grammarCompiler.compile(paddedScript);
    if (!result) {
      throw new Error("Could not compile sparkdown script");
    }
    const topID = NodeID.top;
    const buffer = result.cursor;
    const reused = result.reused;
    const tree = Tree.build({
      topID,
      buffer,
      reused,
      nodeSet: this._nodeSet,
    });
    return tree;
  }
}

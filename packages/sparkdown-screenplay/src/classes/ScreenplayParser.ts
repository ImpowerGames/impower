import {
  Compiler as GrammarCompiler,
  NodeSet,
  NodeType,
  SyntaxNode,
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
    let action = "";
    let choice = "";
    let choice_prefix = "";
    let choice_suffix = "";
    let character = "";
    let position: "l" | "r" | undefined = undefined;
    const read = (from: number, to: number) => script.slice(from, to);

    tree.iterate({
      enter: (node) => {
        const nodeType = node.type.name as SparkdownNodeName;
        const text = read(node.from, node.to);

        // FrontMatter
        if (nodeType === "FrontMatterFieldKeyword") {
          frontMatterKey = text;
          frontMatterValue = "";
        }
        if (nodeType === "FrontMatterString_content") {
          frontMatterValue += text + "\n";
        }

        // Knot
        if (nodeType === "Knot") {
          tokens.push({ tag: "page_break" });
        }
        if (nodeType === "KnotDeclarationName") {
          tokens.push({ tag: "knot", text });
        }

        // Stitch
        if (nodeType === "StitchDeclarationName") {
          tokens.push({ tag: "stitch", text });
        }

        // Transition
        if (stack.includes("Transition")) {
          if (nodeType === "TextChunk") {
            transition += text + "\n";
          }
          if (nodeType === "ParentheticalLineContent") {
            transition += text + "\n";
          }
        }

        // Scene
        if (stack.includes("Scene")) {
          if (nodeType === "TextChunk") {
            scene += text + "\n";
          }
          if (nodeType === "ParentheticalLineContent") {
            scene += text + "\n";
          }
        }

        // Action
        if (stack.includes("Action")) {
          if (stack.includes("Action_begin")) {
            if (nodeType === "Whitespace") {
              // This action does not begin with an explicit action mark,
              // so include the indented whitespace.
              action += text;
            }
          }
          if (nodeType === "TextChunk") {
            action += text + "\n";
          }
          if (nodeType === "ParentheticalLineContent") {
            action += text + "\n";
          }
        }

        // Dialogue
        if (nodeType === "DialogueCharacterName") {
          character = text;
        }
        if (nodeType === "DialogueCharacterParenthetical") {
          character += text;
        }
        if (nodeType === "DialogueCharacterPositionContent") {
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
          if (nodeType === "TextChunk") {
            tokens.push({
              tag: "dialogue_content",
              text,
              position,
            });
          }
          if (nodeType === "ParentheticalLineContent") {
            tokens.push({
              tag: "dialogue_parenthetical",
              text,
              position,
            });
          }
        }

        // Choice
        if (stack.includes("Choice")) {
          if (nodeType === "ChoiceMark") {
            choice_prefix += text;
          }
          if (nodeType === "Choice_content") {
            choice += text;
          }
        }

        stack.push(nodeType);
      },
      leave: (node) => {
        const text = read(node.from, node.to);

        const getNodeAfterFinalNewline = () => {
          const finalNewlineNode = text.endsWith("\n")
            ? node.node
            : node.node.nextSibling;
          return finalNewlineNode?.node.nextSibling || null;
        };

        const isPrintable = (node: SyntaxNode | null) => {
          const name = node?.name as SparkdownNodeName;
          return (
            name === "Transition" ||
            name === "Scene" ||
            name === "Action" ||
            name === "ImageAndAudioLine" || // Equivalent to Action with no text
            name === "ImageLine" || // Equivalent to Action with no text
            name === "AudioLine" || // Equivalent to Action with no text
            name === "InlineDialogue" ||
            name === "BlockDialogue" ||
            name === "Choice"
          );
        };

        const shouldAddSeparator = () => {
          // Should not add separator if directly followed by a printable body line
          return !isPrintable(getNodeAfterFinalNewline());
        };

        // FrontMatter
        const nodeType = node.type.name as SparkdownNodeName;
        if (nodeType === "FrontMatterField") {
          tokens.push({
            tag: frontMatterKey as MetadataTokenType,
            text: frontMatterValue,
          });
        }

        // Transition
        if (nodeType === "Transition") {
          tokens.push({
            tag: "transition",
            text: transition,
          });
          transition = "";
          if (shouldAddSeparator()) {
            tokens.push({ tag: "separator" });
          }
        }

        // Scene
        if (nodeType === "Scene") {
          tokens.push({
            tag: "scene",
            text: scene,
          });
          scene = "";
          if (shouldAddSeparator()) {
            tokens.push({ tag: "separator" });
          }
        }

        // Action
        if (nodeType === "Action") {
          tokens.push({
            tag: "action",
            text: action,
          });
          action = "";
          if (shouldAddSeparator()) {
            tokens.push({ tag: "separator" });
          }
        }

        // Dialogue
        if (nodeType === "DialogueCharacter") {
          tokens.push({
            tag: "dialogue_character",
            text: character,
            position,
          });
          character = "";
        }
        if (nodeType === "BlockDialogue" || nodeType === "InlineDialogue") {
          position = undefined;
          if (shouldAddSeparator()) {
            tokens.push({ tag: "separator" });
          }
        }

        // Choice
        if (nodeType === "Choice") {
          tokens.push({
            tag: "choice",
            text: choice,
            prefix: choice_prefix,
            suffix: choice_suffix,
          });
          choice = "";
          choice_prefix = "";
          choice_suffix = "";
          if (shouldAddSeparator()) {
            tokens.push({ tag: "separator" });
          }
        }

        stack.pop();
      },
    });
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

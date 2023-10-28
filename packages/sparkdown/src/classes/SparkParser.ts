import { Compiler, Tree } from "../../../grammar-compiler/src/compiler";
import { NodeID } from "../../../grammar-compiler/src/core";
import { Grammar } from "../../../grammar-compiler/src/grammar";
import GRAMMAR_DEFINITION from "../../language/sparkdown.language-grammar.json";
import SPARK_TOKEN_TAGS from "../constants/SPARK_TOKEN_TAGS";
import { SparkAction } from "../types/SparkDiagnostic";
import { SparkParserConfig } from "../types/SparkParserConfig";
import { SparkProgram } from "../types/SparkProgram";
import {
  SparkDialogueBoxToken,
  SparkDialogueToken,
  SparkToken,
  SparkTokenTagMap,
} from "../types/SparkToken";
import { SparkdownNodeName } from "../types/SparkdownNodeName";
import createSparkToken from "../utils/createSparkToken";

const WHITESPACE_REGEX = /[ \t]+/;

const lookup = <K extends keyof SparkTokenTagMap = "comment">(
  tag: K,
  tokenStack: SparkToken[]
): SparkTokenTagMap[K] | undefined =>
  tokenStack.findLast((t) => t.tag === tag) as SparkTokenTagMap[K];

const reversePosition = (
  position: "left" | "right" | undefined
): "right" | "left" | undefined =>
  position === "left" ? "right" : position === "right" ? "left" : undefined;

const VARIABLE_IDENTIFIER_REGEX = new RegExp(
  GRAMMAR_DEFINITION.repository.VariableIdentifier.match,
  GRAMMAR_DEFINITION.flags
);

export default class SparkParser {
  config: SparkParserConfig = {};

  grammar: Grammar;

  compiler: Compiler;

  constructor(config: SparkParserConfig) {
    this.config = config || this.config;
    this.grammar = new Grammar(GRAMMAR_DEFINITION);
    this.compiler = new Compiler(this.grammar);
  }

  build(script: string, tree: Tree, config?: SparkParserConfig) {
    const program: SparkProgram = {
      tokens: [],
      sections: {},
      diagnostics: [],
      metadata: {},
    };
    const nodeNames = this.grammar.nodeNames as SparkdownNodeName[];
    const stack: SparkToken[] = [];
    const prevDisplayPositionalTokens: (
      | SparkDialogueToken
      | SparkDialogueBoxToken
    )[] = [];
    let line = 0;
    let currentSectionId = "";
    let sceneNumber = 1;
    program.sections[currentSectionId] = {
      level: 0,
      name: "",
      line: 0,
      from: 0,
      to: 0,
      parent: null,
    };
    const addToken = (token: SparkToken) => {
      program.tokens.push(token);
      const currentSection = program.sections[currentSectionId];
      if (currentSection) {
        currentSection.tokens ??= [];
        currentSection.tokens.push(token);
      }
    };
    const diagnostic = (
      program: SparkProgram,
      currentToken: { from: number; to: number; line: number; offset?: number },
      message = "",
      actions?: SparkAction[],
      from = -1,
      to = -1,
      severity: "error" | "warning" | "info" = "error"
    ): void => {
      if (from < 0 || to < 0) {
        return;
      }
      if (from === to) {
        to = from + 1;
      }
      program.diagnostics ??= [];
      const lineStart = (currentToken.from || 0) + (currentToken.offset || 0);
      let validFrom = Math.max(0, from >= 0 ? from : lineStart);
      const validTo = to >= 0 ? to : currentToken.to;
      if (validFrom === validTo && lineStart < validTo) {
        validFrom = lineStart;
      }
      const line = currentToken?.line;
      const startColumn = Math.max(0, validFrom - currentToken.from);
      const endColumn = Math.max(0, startColumn + (validTo - validFrom));
      const source = `${severity.toUpperCase()}: line ${line} column ${startColumn}`;
      if (validFrom < validTo) {
        program.diagnostics.push({
          from: validFrom,
          to: validTo,
          line,
          startColumn,
          endColumn,
          severity,
          source,
          message,
          actions,
        });
      } else if (currentToken.from < currentToken.to) {
        program.diagnostics.push({
          from: currentToken.from,
          to: currentToken.to,
          line,
          startColumn,
          endColumn,
          severity,
          source,
          message,
          actions,
        });
      }
    };
    tree.iterate({
      enter: (node) => {
        const id = nodeNames[node.type]!;
        const from = node.from;
        const to = node.to;
        const tag = SPARK_TOKEN_TAGS[id];
        if (tag) {
          const text = script.slice(from, to);
          const tok = createSparkToken(tag, {
            line,
            from,
            to,
          });

          // front_matter
          if (tok.tag === "front_matter_field") {
            addToken(tok);
          }
          if (tok.tag === "front_matter_field_keyword") {
            const parent = lookup("front_matter_field", stack);
            if (parent) {
              parent.name = text;
            }
          }
          if (tok.tag === "front_matter_field_item") {
            const parent = lookup("front_matter_field", stack);
            if (parent) {
              const keyword = parent.name;
              program.frontMatter ??= {};
              if (program.frontMatter[keyword]) {
                program.frontMatter[keyword]?.push("");
              } else {
                program.frontMatter[keyword] = [""];
              }
            }
          }
          if (tok.tag === "front_matter_field_string") {
            const parent = lookup("front_matter_field", stack);
            if (parent) {
              const keyword = parent.name;
              program.frontMatter ??= {};
              program.frontMatter[keyword] ??= [""];
              const lastIndex = program.frontMatter[keyword]!.length - 1;
              program.frontMatter[keyword]![lastIndex] += text;
            }
          }

          // comment
          if (tok.tag === "comment") {
            addToken(tok);
          }
          if (tok.tag === "comment_content") {
            const parent = lookup("comment", stack);
            if (parent) {
              parent.text = text;
            }
          }

          // assign
          if (tok.tag === "assign") {
            addToken(tok);
          }
          if (tok.tag === "type_name") {
            const parent = lookup("assign", stack);
            if (parent) {
              parent.type = text;
            }
          }
          if (tok.tag === "identifier_path") {
            const parent = lookup("assign", stack);
            if (parent) {
              parent.target = text;
              parent.ranges ??= {};
              parent.ranges["target"] = { from: tok.from, to: tok.to };
            }
          }
          if (tok.tag === "assign_operator") {
            const parent = lookup("assign", stack);
            if (parent) {
              parent.operator = text;
              parent.ranges ??= {};
              parent.ranges["operator"] = { from: tok.from, to: tok.to };
            }
          }
          if (tok.tag === "value_text") {
            const parent = lookup("assign", stack);
            if (parent) {
              parent.value ??= "";
              parent.value += text;
              parent.ranges ??= {};
              parent.ranges["value"] ??= { from: tok.from, to: tok.to };
              parent.ranges["value"].to = tok.to;
            }
          }

          // chunk
          if (tok.tag === "chunk") {
            addToken(tok);
          }
          if (tok.tag === "chunk_name") {
            const parent = lookup("chunk", stack);
            if (parent) {
              parent.name = text.split(".")[0] || "";
            }
          }

          // section
          if (tok.tag === "section") {
            addToken(tok);
          }
          if (tok.tag === "section_level") {
            const parent = lookup("section", stack);
            if (parent) {
              parent.level = text.length;
            }
          }
          if (tok.tag === "section_name") {
            const parent = lookup("section", stack);
            if (parent) {
              parent.name = text;
            }
          }

          // flow_break
          if (tok.tag === "flow_break") {
            addToken(tok);
          }

          // jump
          if (tok.tag === "jump") {
            addToken(tok);
          }

          // choice
          if (tok.tag === "choice") {
            addToken(tok);
          }
          if (tok.tag === "choice_content") {
            tok.text = text;
            const parent = lookup("choice", stack);
            if (parent) {
              parent.content ??= [];
              parent.content?.push(tok);
            }
          }

          // jump_to_section
          if (tok.tag === "jump_to_section") {
            const parent = lookup("jump", stack) || lookup("choice", stack);
            if (parent) {
              parent.section = text;
            }
          }

          // transition
          if (tok.tag === "transition") {
            addToken(tok);
          }
          if (tok.tag === "transition_content") {
            tok.text = text;
            const parent = lookup("transition", stack);
            if (parent) {
              parent.content ??= [];
              parent.content?.push(tok);
            }
          }

          // scene
          if (tok.tag === "scene") {
            tok.scene = sceneNumber;
            addToken(tok);
          }
          if (tok.tag === "scene_content") {
            tok.text = text;
            const parent = lookup("scene", stack);
            if (parent) {
              parent.content ??= [];
              parent.content?.push(tok);
            }
          }

          // centered
          if (tok.tag === "centered") {
            addToken(tok);
          }
          if (tok.tag === "centered_content") {
            tok.text = text;
            const parent = lookup("centered", stack);
            if (parent) {
              parent.content ??= [];
              parent.content?.push(tok);
            }
          }

          // action
          if (tok.tag === "action") {
            addToken(tok);
          }
          if (tok.tag === "action_start") {
            addToken(tok);
          }
          if (tok.tag === "action_end") {
            addToken(tok);
          }
          if (tok.tag === "action_box") {
            addToken(tok);
          }

          // dialogue
          if (tok.tag === "dialogue") {
            addToken(tok);
          }
          if (tok.tag === "dialogue_start") {
            addToken(tok);
          }
          if (tok.tag === "dialogue_end") {
            addToken(tok);
          }
          if (tok.tag === "dialogue_character_name" && text) {
            const dialogue = lookup("dialogue", stack);
            if (dialogue) {
              dialogue.characterName = text;
            }
            const dialogue_start = lookup("dialogue_start", stack);
            if (dialogue_start) {
              dialogue_start.print = text;
            }
          }
          if (tok.tag === "dialogue_character_parenthetical" && text) {
            const dialogue = lookup("dialogue", stack);
            if (dialogue) {
              dialogue.characterParenthetical = text;
            }
            const dialogue_start = lookup("dialogue_start", stack);
            if (dialogue_start) {
              dialogue_start.print += " " + text;
            }
          }
          if (tok.tag === "dialogue_character_simultaneous" && text) {
            const dialogue = lookup("dialogue", stack);
            const dialogue_start = lookup("dialogue_start", stack);
            if (dialogue && dialogue_start) {
              let prevPosition: "left" | "right" | undefined = undefined;
              let prevCharacterName: string | undefined = undefined;
              prevDisplayPositionalTokens.forEach((t) => {
                t.autoAdvance = true;
                prevPosition ??= t.position;
                prevCharacterName ??= t.characterName;
              });
              if (dialogue.characterName === prevCharacterName) {
                // Same character, so show in same spot
                dialogue.position = prevPosition;
              } else {
                // Different character, so if a spot was not assigned for the previous character, move them to the left
                // and display this character on the opposite side.
                prevDisplayPositionalTokens.forEach((t) => {
                  if (!t.position) {
                    t.position = "left";
                  }
                  prevPosition = t.position;
                });
                dialogue.position = reversePosition(prevPosition);
              }
            }
          }
          if (tok.tag === "dialogue_box") {
            const parent = lookup("dialogue", stack);
            if (parent) {
              tok.characterName = parent.characterName;
              tok.characterParenthetical = parent.characterParenthetical;
              tok.position = parent.position;
            }
            addToken(tok);
          }
          if (tok.tag === "dialogue_line_parenthetical") {
            tok.text = text;
            tok.print = text;
            const parent = lookup("dialogue_box", stack);
            if (parent) {
              parent.content ??= [];
              parent.content?.push(tok);
            }
          }

          // box
          if (tok.tag === "box_line_continue") {
            tok.text = text;
            const parent =
              lookup("dialogue_box", stack) || lookup("action_box", stack);
            if (parent) {
              parent.content ??= [];
              parent.content?.push(tok);
            }
          }
          if (tok.tag === "box_line_complete") {
            tok.text = text;
            const parent =
              lookup("dialogue_box", stack) || lookup("action_box", stack);
            if (parent) {
              parent.content ??= [];
              parent.content?.push(tok);
            }
          }
          if (tok.tag === "display_text_prerequisite_value") {
            const parent =
              lookup("choice", stack) ||
              lookup("box_line_continue", stack) ||
              lookup("box_line_complete", stack);
            if (parent) {
              parent.prerequisiteValue = text;
            }
          }
          if (tok.tag === "display_text_prerequisite_operator") {
            const parent =
              lookup("choice", stack) ||
              lookup("box_line_continue", stack) ||
              lookup("box_line_complete", stack);
            if (parent) {
              parent.prerequisiteOperator = text;
            }
          }
          if (tok.tag === "display_text_content") {
            const parent =
              lookup("choice_content", stack) ||
              lookup("box_line_continue", stack) ||
              lookup("box_line_complete", stack);
            if (parent) {
              parent.text = text;
            }
          }
          if (tok.tag === "image") {
            const parts = text.split(WHITESPACE_REGEX);
            tok.name = parts[0] || "";
            tok.args = parts.slice(1);
            const parent =
              lookup("dialogue_box", stack) || lookup("action_box", stack);
            if (parent) {
              parent.content ??= [];
              parent.content?.push(tok);
            }
          }
          if (tok.tag === "audio") {
            const parts = text.split(WHITESPACE_REGEX);
            tok.name = parts[0] || "";
            tok.args = parts.slice(1);
            const parent =
              lookup("dialogue_box", stack) || lookup("action_box", stack);
            if (parent) {
              parent.content ??= [];
              parent.content?.push(tok);
            }
          }

          // push token onto current stack
          stack.push(tok);
        }

        // Print screenplay content (include styling marks but not emphasis marks)
        if (id === "PlainText" || id === "StylingMark") {
          const text = script.slice(from, to);
          const display_line =
            lookup("choice_content", stack) ||
            lookup("transition_content", stack) ||
            lookup("scene_content", stack) ||
            lookup("centered_content", stack) ||
            lookup("box_line_continue", stack) ||
            lookup("box_line_complete", stack);
          if (display_line) {
            if (display_line.print == null) {
              display_line.print = "";
            }
            display_line.print += text;
          }
        }

        // newline
        if (id === "Newline") {
          line += 1;
        }
      },
      leave: (node) => {
        const tok = stack.at(-1);
        const id = nodeNames[node.type]!;
        const tag = SPARK_TOKEN_TAGS[id];
        if (tok && tok.tag === tag) {
          if (tok.tag === "chunk") {
            sceneNumber = 1;
            prevDisplayPositionalTokens.length = 0;
            const parentId = "";
            const parentSection = program.sections[parentId];
            currentSectionId = parentId + "." + tok.name;
            const section = {
              level: 0,
              name: tok.name,
              line: tok.line,
              from: tok.from,
              to: tok.to,
              parent: parentId,
            };
            program.sections[currentSectionId] = section;
            if (parentSection) {
              parentSection.children ??= [];
              parentSection.children.push(currentSectionId);
            }
          }
          if (tok.tag === "section") {
            prevDisplayPositionalTokens.length = 0;
            const currentSection = program.sections[currentSectionId]!;
            const currentLevel = currentSection.level;
            const levelDiff = tok.level - currentLevel;
            const parentId =
              levelDiff === 0
                ? currentSectionId.split(".").slice(0, -1).join(".")
                : levelDiff > 0
                ? currentSectionId
                : currentSectionId.split(".").slice(0, levelDiff).join(".");
            const parentSection = program.sections[parentId];
            currentSectionId = parentId + "." + tok.name;
            const section = {
              level: tok.level,
              name: tok.name,
              line: tok.line,
              from: tok.from,
              to: tok.to,
              parent: parentId,
            };
            program.sections[currentSectionId] = section;
            if (parentSection) {
              parentSection.children ??= [];
              parentSection.children.push(currentSectionId);
            }
          }
          if (tok.tag === "flow_break") {
            prevDisplayPositionalTokens.length = 0;
          }
          if (tok.tag === "transition") {
            prevDisplayPositionalTokens.length = 0;
          }
          if (tok.tag === "scene") {
            sceneNumber += 1;
            prevDisplayPositionalTokens.length = 0;
          }
          if (tok.tag === "centered") {
            prevDisplayPositionalTokens.length = 0;
          }
          if (tok.tag === "action") {
            prevDisplayPositionalTokens.length = 0;
          }
          if (tok.tag === "dialogue_character_simultaneous") {
            const dialogue = lookup("dialogue", stack);
            if (dialogue) {
              prevDisplayPositionalTokens.length = 0;
              prevDisplayPositionalTokens.push(dialogue);
            }
          }
          if (tok.tag === "dialogue_box") {
            prevDisplayPositionalTokens.push(tok);
          }
          if (tok.tag === "assign") {
            if (VARIABLE_IDENTIFIER_REGEX.test(tok.target)) {
              // If we are assigning a bare variable name (without property or index accessors),
              // ensure it is declared (if it doesn't already exist).
              const id = `.${tok.target}`;
              if (!program.variables?.[id]) {
                if (tok.operator !== "=") {
                  // Since variable does not exist,
                  // if variable references itself during assignment (i.e. it uses an operator other than `=` like `+=` or `-=`),
                  // report an error
                  diagnostic(
                    program,
                    tok,
                    `Cannot find variable named '${tok.target}'`,
                    undefined,
                    tok.ranges?.["target"]?.from,
                    tok.ranges?.["target"]?.to
                  );
                }
                const variable = {
                  line: tok.line,
                  from: tok.from,
                  to: tok.to,
                  name: tok.target,
                  type: tok.type,
                  value: tok.value,
                };
                program.variables ??= {};
                program.variables[id] ??= variable;
                const currentSection = program.sections[currentSectionId]!;
                currentSection.variables ??= {};
                currentSection.variables[id] ??= variable;
              }
            } else {
              // If we are assigning a property or array item,
              // report if property or array does not exist.
              // TODO
            }
            if (!tok.type) {
              // Determine type by compiling value
              // TODO
            }
          }
          stack.pop();
        }
      },
    });
    // CLEANUP
    if (program.frontMatter) {
      Object.entries(program.frontMatter).forEach(([keyword, values]) => {
        // Trim and remove empty values
        program.frontMatter![keyword] = values
          .map((v) => v.trim())
          .filter((v) => Boolean(v));
      });
    }
    console.log(program);
    return program;
  }

  parse(script: string, config?: SparkParserConfig): SparkProgram {
    const result = this.compiler.compile(script);
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
    });
    // console.log(printTree(tree, script, this.grammar.nodeNames));
    return this.build(script, tree, config);
  }
}

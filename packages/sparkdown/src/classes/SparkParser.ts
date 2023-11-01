import { Compiler, Tree } from "../../../grammar-compiler/src/compiler";
import { NodeID } from "../../../grammar-compiler/src/core";
import { Grammar } from "../../../grammar-compiler/src/grammar";
import GRAMMAR_DEFINITION from "../../language/sparkdown.language-grammar.json";
import SPARK_RESERVED_KEYWORDS from "../constants/SPARK_RESERVED_KEYWORDS";
import SPARK_TOKEN_TAGS from "../constants/SPARK_TOKEN_TAGS";
import defaultCompiler from "../defaults/defaultCompiler";
import { CompilerDiagnostic } from "../types/CompilerDiagnostic";
import { SparkAction } from "../types/SparkDiagnostic";
import { SparkField } from "../types/SparkField";
import { SparkParserConfig } from "../types/SparkParserConfig";
import { SparkProgram } from "../types/SparkProgram";
import { SparkRange } from "../types/SparkRange";
import { SparkSection } from "../types/SparkSection";
import { SparkStruct } from "../types/SparkStruct";
import {
  SparkDialogueBoxToken,
  SparkDialogueToken,
  SparkToken,
  SparkTokenTagMap,
} from "../types/SparkToken";
import { SparkVariable } from "../types/SparkVariable";
import { SparkdownNodeName } from "../types/SparkdownNodeName";
import createSparkToken from "../utils/createSparkToken";
import getScopedItemId from "../utils/getScopedItemId";
import getScopedValueContext from "../utils/getScopedValueContext";
import setProperty from "../utils/setProperty";

const WHITESPACE_REGEX = /[ \t]+/;

const UNESCAPED_DOUBLE_QUOTE = /(?<!\\)(?:(\\\\)*)["]/g;
const ESCAPED_DOUBLE_QUOTE = /\\["]/g;

const VARIABLE_NAME_REGEX = new RegExp(
  GRAMMAR_DEFINITION.repository.VariableName.match,
  GRAMMAR_DEFINITION.flags
);

const BUILT_IN_TYPES = [
  "string",
  "number",
  "bigint",
  "boolean",
  "symbol",
  "undefined",
  "object",
  "function",
];

const vowels = ["a", "e", "i", "o", "u"];
const lowercaseArticles = ["an", "a"];
const capitalizedArticles = ["An", "A"];

const prefixArticle = (str: string, capitalize?: boolean): string => {
  if (!str[0]) {
    return "";
  }
  const articles = capitalize ? capitalizedArticles : lowercaseArticles;
  return `${vowels.includes(str[0]) ? articles[0] : articles[1]} ${str}`;
};

const findSectionId = (
  sections: Record<string, SparkSection> | undefined,
  sectionId: string,
  name: string
): string | undefined => {
  if (sections) {
    return getScopedItemId(sections, sectionId, name);
  }
  return undefined;
};

const findVariableId = (
  variables: Record<string, SparkVariable> | undefined,
  sectionId: string,
  name: string
): string | undefined => {
  if (variables) {
    return getScopedItemId(variables, sectionId, name);
  }
  return undefined;
};

const findStructId = (
  structs: Record<string, SparkStruct> | undefined,
  name: string
): string | undefined => {
  const found = structs?.[name];
  if (found) {
    return name;
  }
  return undefined;
};

const findSection = (
  sections: Record<string, SparkSection> | undefined,
  sectionId: string,
  name: string
): SparkSection | undefined => {
  const id = findSectionId(sections, sectionId, name);
  if (id != null) {
    return sections?.[id];
  }
  return undefined;
};

const findVariable = (
  variables: Record<string, SparkVariable> | undefined,
  sectionId: string,
  name: string
): SparkVariable | undefined => {
  const id = findVariableId(variables, sectionId, name);
  if (id != null) {
    return variables?.[id];
  }
  return undefined;
};

const findStruct = (
  structs: Record<string, SparkStruct> | undefined,
  name: string
): SparkStruct | undefined => {
  const id = findStructId(structs, name);
  if (id != null) {
    return structs?.[id];
  }
  return undefined;
};

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
    const compiler = config?.compiler || defaultCompiler;

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
      parent: undefined,
    };

    const lookup = <K extends keyof SparkTokenTagMap>(
      ...tags: K[]
    ): SparkTokenTagMap[K] | undefined =>
      stack.findLast((t) =>
        tags.includes(t.tag as unknown as K)
      ) as SparkTokenTagMap[K];

    const addToken = (token: SparkToken) => {
      program.tokens.push(token);
      const currentSection = program.sections[currentSectionId];
      if (currentSection) {
        currentSection.tokens ??= [];
        currentSection.tokens.push(token);
      }
    };

    const _construct = (
      struct: SparkStruct,
      ids: Record<string, string>,
      combinedFieldValues: any
    ) => {
      if (struct.type && !BUILT_IN_TYPES.includes(struct.type)) {
        const parentId = ids[struct.type];
        if (parentId) {
          const parentStruct = program.structs?.[parentId];
          if (parentStruct) {
            _construct(parentStruct, ids, combinedFieldValues);
          }
        }
      }
      if (struct.fields) {
        struct.fields.forEach((field) => {
          const propertyPath = field.path + "." + field.key;
          setProperty(combinedFieldValues, propertyPath, field.value);
        });
      }
    };

    const construct = (struct: SparkStruct, ids: Record<string, string>) => {
      const obj = {};
      _construct(struct, ids, obj);
      return obj;
    };

    const diagnostic = (
      program: SparkProgram,
      tok: SparkToken,
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
      const lineStart = tok.from || 0;
      let validFrom = Math.max(0, from >= 0 ? from : lineStart);
      const validTo = to >= 0 ? to : tok.to;
      if (validFrom === validTo && lineStart < validTo) {
        validFrom = lineStart;
      }
      const line = tok?.line;
      const startColumn = Math.max(0, validFrom - tok.from);
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
      } else if (tok.from < tok.to) {
        program.diagnostics.push({
          from: tok.from,
          to: tok.to,
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

    const reversePosition = (
      position: "left" | "right" | undefined
    ): "right" | "left" | undefined =>
      position === "left" ? "right" : position === "right" ? "left" : undefined;

    const recordExpressionReferences = (
      tok: SparkToken,
      expressionFrom: number,
      references: CompilerDiagnostic[],
      ids: Record<string, string>
    ) => {
      if (references?.length > 0) {
        // Record any references
        for (let i = 0; i < references.length; i += 1) {
          const r = references[i];
          if (r) {
            const from = expressionFrom + r.from;
            const to = expressionFrom + r.to;
            program.metadata.lines ??= [];
            program.metadata.lines[tok.line] ??= {};
            program.metadata.lines[tok.line]!.references ??= [];
            program.metadata.lines[tok.line]!.references!?.push({
              from,
              to,
              name: r.content,
              id: ids[r.content],
            });
          }
        }
      }
    };

    const reportExpressionDiagnostics = (
      tok: SparkToken,
      expressionFrom: number,
      diagnostics: CompilerDiagnostic[]
    ) => {
      if (diagnostics?.length > 0) {
        // Report any problems encountered during compilation
        for (let i = 0; i < diagnostics.length; i += 1) {
          const d = diagnostics[i];
          if (d) {
            const from = expressionFrom + d.from;
            const to = expressionFrom + d.to;
            diagnostic(program, tok, d.message, undefined, from, to);
          }
        }
      }
    };

    const reportMissing = (
      tok: SparkToken,
      type: string,
      name: string,
      nameRange?: SparkRange
    ) => {
      diagnostic(
        program,
        tok,
        `Cannot find ${type} named '${name}'`,
        undefined,
        nameRange?.from,
        nameRange?.to
      );
    };

    const reportDuplicate = (
      tok: SparkToken,
      type: string,
      name: string,
      assignedRange?: SparkRange,
      declaredToken?: { line: number; from: number; to: number }
    ) => {
      const prefix = prefixArticle(type, true);
      const location =
        declaredToken && declaredToken.line >= 0
          ? ` at line ${declaredToken.line}`
          : "";
      const actions = declaredToken
        ? [{ name: "FOCUS", focus: declaredToken }]
        : undefined;
      diagnostic(
        program,
        tok,
        `${prefix} named '${name}' already exists${location}`,
        actions,
        assignedRange?.from,
        assignedRange?.to
      );
    };

    const validateTypeMatch = (
      tok: SparkToken,
      compiledType: string,
      declaredType: string,
      assignedRange?: SparkRange,
      declaredRange?: SparkRange
    ): boolean => {
      if (
        declaredType &&
        declaredType !== "undefined" &&
        compiledType !== "undefined" &&
        compiledType !== declaredType
      ) {
        const actions = declaredRange
          ? [
              {
                name: "FOCUS",
                focus: {
                  from: declaredRange.from,
                  to: declaredRange.to,
                },
              },
            ]
          : undefined;
        diagnostic(
          program,
          tok,
          `Cannot assign a '${compiledType}' to a '${declaredType}' variable`,
          actions,
          assignedRange?.from,
          assignedRange?.to
        );
        return false;
      }
      return true;
    };

    const validateNameAllowed = (
      tok: SparkToken,
      name: string,
      nameRange?: SparkRange
    ): boolean => {
      if (SPARK_RESERVED_KEYWORDS.includes(name)) {
        diagnostic(
          program,
          tok,
          `'${name}' is a reserved keyword.`,
          undefined,
          nameRange?.from,
          nameRange?.to
        );
        return false;
      }
      return true;
    };

    const validateNameUnique = <
      T extends SparkSection | SparkVariable | SparkStruct
    >(
      tok: SparkToken,
      type: string,
      found: T,
      nameRange?: SparkRange
    ): boolean => {
      if (found?.name && found.from !== nameRange?.from) {
        reportDuplicate(tok, type, found.name, nameRange, found);
        return false;
      }
      return true;
    };

    const validateName = <T extends SparkSection | SparkVariable>(
      tok: SparkToken,
      currentSectionId: string,
      name: string,
      nameRange?: SparkRange
    ): boolean => {
      if (!validateNameAllowed(tok, name, nameRange)) {
        return false;
      }
      if (
        !validateNameUnique<T>(
          tok,
          "type",
          findStruct(program.structs, name) as T,
          nameRange
        )
      ) {
        return false;
      }
      if (
        !validateNameUnique<T>(
          tok,
          "section",
          findSection(
            program.sections,
            currentSectionId.split(".").slice(0, -1).join("."),
            name
          ) as T,
          nameRange
        )
      ) {
        return false;
      }
      if (
        !validateNameUnique<T>(
          tok,
          "variable",
          findVariable(program.variables, currentSectionId, name) as T,
          nameRange
        )
      ) {
        return false;
      }
      return true;
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
            const parent = lookup("front_matter_field");
            if (parent) {
              parent.name = text;
            }
          }
          if (tok.tag === "front_matter_field_item") {
            const parent = lookup("front_matter_field");
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
            const parent = lookup("front_matter_field");
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
            const parent = lookup("comment");
            if (parent) {
              parent.text = text;
            }
          }

          // struct
          if (tok.tag === "struct") {
            addToken(tok);
          }
          if (tok.tag === "type_name") {
            const parent = lookup("struct");
            if (parent) {
              parent.type = text;
              parent.ranges ??= {};
              parent.ranges.type = { from: tok.from, to: tok.to };
            }
          }
          if (tok.tag === "struct_name") {
            const parent = lookup("struct");
            if (parent) {
              parent.name = text;
              parent.ranges ??= {};
              parent.ranges.name = { from: tok.from, to: tok.to };
            }
          }
          if (tok.tag === "struct_map_property") {
            addToken(tok);
          }
          if (tok.tag === "struct_map_item") {
            const struct = lookup("struct");
            const mapProperty = lookup("struct_map_property");
            if (mapProperty) {
              mapProperty.arrayLength ??= 0;
              tok.key = mapProperty.arrayLength;
              mapProperty.arrayLength += 1;
            } else if (struct) {
              struct.arrayLength ??= 0;
              tok.key = struct.arrayLength;
              struct.arrayLength += 1;
            }
            addToken(tok);
          }
          if (tok.tag === "struct_scalar_item") {
            const struct = lookup("struct");
            if (struct) {
              struct.fields ??= [];
              struct.fields.push(tok);
            }
            const mapProperty = lookup("struct_map_property");
            if (mapProperty) {
              mapProperty.arrayLength ??= 0;
              tok.key = mapProperty.arrayLength;
              mapProperty.arrayLength += 1;
            } else if (struct) {
              struct.arrayLength ??= 0;
              tok.key = struct.arrayLength;
              struct.arrayLength += 1;
            }
            tok.path = stack
              .map((p) =>
                p.tag === "struct_map_item" || p.tag === "struct_map_property"
                  ? p.key
                  : ""
              )
              .join(".");
            addToken(tok);
          }
          if (tok.tag === "struct_scalar_property") {
            const struct = lookup("struct");
            if (struct) {
              struct.fields ??= [];
              struct.fields.push(tok);
            }
            tok.path = stack
              .map((p) =>
                p.tag === "struct_map_item" || p.tag === "struct_map_property"
                  ? p.key
                  : ""
              )
              .join(".");
            addToken(tok);
          }
          if (tok.tag === "property_name") {
            const parent = lookup(
              "struct_map_property",
              "struct_scalar_property"
            );
            if (parent) {
              parent.key = text;
              parent.ranges ??= {};
              parent.ranges.key = { from: tok.from, to: tok.to };
            }
          }
          if (tok.tag === "value_text") {
            const parent = lookup(
              "struct_scalar_item",
              "struct_scalar_property"
            );
            if (parent) {
              parent.value ??= "";
              parent.value += text;
              parent.ranges ??= {};
              parent.ranges.value ??= { from: tok.from, to: tok.to };
              parent.ranges.value.to = tok.to;
            }
          }

          // assign
          if (tok.tag === "assign") {
            addToken(tok);
          }
          if (tok.tag === "type_name") {
            const parent = lookup("assign");
            if (parent) {
              parent.type = text;
              parent.ranges ??= {};
              parent.ranges.type = { from: tok.from, to: tok.to };
            }
          }
          if (tok.tag === "identifier_path") {
            const parent = lookup("assign");
            if (parent) {
              parent.name = text;
              parent.ranges ??= {};
              parent.ranges.name = { from: tok.from, to: tok.to };
            }
          }
          if (tok.tag === "assign_operator") {
            const parent = lookup("assign");
            if (parent) {
              parent.operator = text;
              parent.ranges ??= {};
              parent.ranges.operator = { from: tok.from, to: tok.to };
            }
          }
          if (tok.tag === "value_text") {
            const parent = lookup("assign");
            if (parent) {
              parent.value ??= "";
              parent.value += text;
              parent.ranges ??= {};
              parent.ranges.value ??= { from: tok.from, to: tok.to };
              parent.ranges.value.to = tok.to;
            }
          }

          // chunk
          if (tok.tag === "chunk") {
            addToken(tok);
          }
          if (tok.tag === "chunk_name") {
            const parent = lookup("chunk");
            if (parent) {
              parent.name = text.split(".")[0] || "";
            }
          }

          // section
          if (tok.tag === "section") {
            addToken(tok);
          }
          if (tok.tag === "section_level") {
            const parent = lookup("section");
            if (parent) {
              parent.level = text.length;
              parent.ranges ??= {};
              parent.ranges.level = { from: tok.from, to: tok.to };
            }
          }
          if (tok.tag === "section_name") {
            const parent = lookup("section");
            if (parent) {
              parent.name = text;
              parent.ranges ??= {};
              parent.ranges.name = { from: tok.from, to: tok.to };
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
            const parent = lookup("choice");
            if (parent) {
              parent.content ??= [];
              parent.content?.push(tok);
            }
          }

          // jump_to_section
          if (tok.tag === "jump_to_section") {
            const parent = lookup("jump", "choice");
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
            const parent = lookup("transition");
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
            const parent = lookup("scene");
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
            const parent = lookup("centered");
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
            const dialogue = lookup("dialogue");
            if (dialogue) {
              dialogue.characterName = text;
            }
            const dialogue_start = lookup("dialogue_start");
            if (dialogue_start) {
              dialogue_start.print = text;
            }
          }
          if (tok.tag === "dialogue_character_parenthetical" && text) {
            const dialogue = lookup("dialogue");
            if (dialogue) {
              dialogue.characterParenthetical = text;
            }
            const dialogue_start = lookup("dialogue_start");
            if (dialogue_start) {
              dialogue_start.print += " " + text;
            }
          }
          if (tok.tag === "dialogue_character_simultaneous" && text) {
            const dialogue = lookup("dialogue");
            const dialogue_start = lookup("dialogue_start");
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
            const parent = lookup("dialogue");
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
            const parent = lookup("dialogue_box");
            if (parent) {
              parent.content ??= [];
              parent.content?.push(tok);
            }
          }

          // box
          if (tok.tag === "box_line_continue") {
            tok.text = text;
            const parent = lookup("dialogue_box", "action_box");
            if (parent) {
              parent.content ??= [];
              parent.content?.push(tok);
            }
          }
          if (tok.tag === "box_line_complete") {
            tok.text = text;
            const parent = lookup("dialogue_box", "action_box");
            if (parent) {
              parent.content ??= [];
              parent.content?.push(tok);
            }
          }
          if (tok.tag === "display_text_prerequisite_value") {
            const parent = lookup(
              "choice",
              "box_line_continue",
              "box_line_complete"
            );
            if (parent) {
              parent.prerequisiteValue = text;
            }
          }
          if (tok.tag === "display_text_prerequisite_operator") {
            const parent = lookup(
              "choice",
              "box_line_continue",
              "box_line_complete"
            );
            if (parent) {
              parent.prerequisiteOperator = text;
            }
          }
          if (tok.tag === "display_text_content") {
            const parent = lookup(
              "choice_content",
              "box_line_continue",
              "box_line_complete"
            );
            if (parent) {
              parent.text = text;
            }
          }
          if (tok.tag === "image") {
            const parts = text.split(WHITESPACE_REGEX);
            tok.name = parts[0] || "";
            tok.args = parts.slice(1);
            const parent = lookup("dialogue_box", "action_box");
            if (parent) {
              parent.content ??= [];
              parent.content?.push(tok);
            }
          }
          if (tok.tag === "audio") {
            const parts = text.split(WHITESPACE_REGEX);
            tok.name = parts[0] || "";
            tok.args = parts.slice(1);
            const parent = lookup("dialogue_box", "action_box");
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
          const display_line = lookup(
            "choice_content",
            "transition_content",
            "scene_content",
            "centered_content",
            "box_line_continue",
            "box_line_complete"
          );
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
            if (
              validateName(tok, currentSectionId, tok.name, tok.ranges?.name)
            ) {
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
              const section = {
                level: tok.level,
                name: tok.name,
                line: tok.line,
                from: tok.from,
                to: tok.to,
                parent: parentId,
              };
              currentSectionId = parentId + "." + tok.name;
              program.sections[currentSectionId] = section;
              if (parentSection) {
                parentSection.children ??= [];
                parentSection.children.push(currentSectionId);
              }
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
            const dialogue = lookup("dialogue");
            if (dialogue) {
              prevDisplayPositionalTokens.length = 0;
              prevDisplayPositionalTokens.push(dialogue);
            }
          }

          if (tok.tag === "dialogue_box") {
            prevDisplayPositionalTokens.push(tok);
          }

          if (tok.tag === "struct") {
            if (lookup("if", "elseif", "else", "while", "for", "until")) {
            }
            const [ids, context] = getScopedValueContext(
              currentSectionId,
              program.sections,
              compiler
            );
            const id = `${currentSectionId}.${tok.name}`;
            const type = tok.type;
            if (type && !BUILT_IN_TYPES.includes(type) && !context[type]) {
              reportMissing(tok, "type", type, tok.ranges?.type);
            }
            const existingStruct = program.structs?.[id];
            if (tok.fields) {
              const propertyPaths: Record<string, SparkField> = {};
              tok.fields.forEach((field) => {
                if (
                  validateNameAllowed(
                    field,
                    String(field.key),
                    field.ranges?.key
                  )
                ) {
                  const propertyPath = field.path + "." + field.key;
                  const existingField = propertyPaths[propertyPath];
                  if (existingField) {
                    reportDuplicate(
                      field,
                      "field",
                      String(field.key),
                      field.ranges.key,
                      existingField
                    );
                  } else {
                    propertyPaths[propertyPath] = field;
                    const [compiledValue, diagnostics, references] = compiler(
                      field.value,
                      context
                    );
                    recordExpressionReferences(
                      field,
                      field?.ranges?.value?.from ?? 0,
                      references,
                      ids
                    );
                    reportExpressionDiagnostics(
                      field,
                      field?.ranges?.value?.from ?? 0,
                      diagnostics
                    );
                    // Check for type mismatch
                    const parentPropertyAccessor = type + propertyPath;
                    const declaredValue = compiler(
                      parentPropertyAccessor,
                      context
                    )[0];
                    const compiledType = typeof compiledValue;
                    const declaredType = typeof declaredValue;
                    if (
                      validateTypeMatch(
                        field,
                        compiledType,
                        declaredType,
                        field?.ranges?.value
                      )
                    ) {
                      field.type = compiledType;
                    } else {
                      field.type = declaredType;
                    }
                    // Check for extra fields
                    if (
                      typeof field.key === "string" &&
                      existingStruct &&
                      !existingStruct.fields?.find(
                        (f) => f.path + "." + f.key === propertyPath
                      )
                    ) {
                      diagnostic(
                        program,
                        field,
                        `'${field.key}' does not exist in original definition of type '${tok.name}'`,
                        [{ name: "FOCUS", focus: existingStruct }],
                        field.ranges?.key?.from,
                        field.ranges?.key?.to
                      );
                    }
                  }
                }
              });
            }

            const obj = construct(tok, ids);
            const objectLiteral = JSON.stringify(obj)
              .replace(UNESCAPED_DOUBLE_QUOTE, "")
              .replace(ESCAPED_DOUBLE_QUOTE, `"`);
            tok.value = objectLiteral;

            // If struct does not already exist, declare it.
            if (!program.structs?.[id]) {
              // Add struct declaration to program
              program.structs ??= {};
              program.structs[id] ??= tok;
            }

            // If variable does not already exist, declare it.
            if (!program.variables?.[id]) {
              if (
                validateName(tok, currentSectionId, tok.name, tok.ranges?.name)
              ) {
                // Create object variable declaration
                const variable = {
                  line: tok.line,
                  from: tok.from,
                  to: tok.to,
                  name: tok.name,
                  type: tok.type ?? "object",
                  value: tok.value,
                };
                // Add object variable declaration to program
                program.variables ??= {};
                program.variables[id] ??= variable;
                // Add object variable declaration to section
                const currentSection = program.sections[currentSectionId]!;
                currentSection.variables ??= {};
                currentSection.variables[id] ??= variable;
              }
            }
          }

          if (tok.tag === "assign") {
            const [ids, context] = getScopedValueContext(
              currentSectionId,
              program.sections,
              compiler
            );
            // Compile accessor
            const [declaredValue, accessorReferences, accessorDiagnostics] =
              compiler(tok.name, context);
            recordExpressionReferences(
              tok,
              tok.ranges?.name?.from ?? 0,
              accessorReferences,
              ids
            );
            reportExpressionDiagnostics(
              tok,
              tok.ranges?.name?.from ?? 0,
              accessorDiagnostics
            );
            // Compile value
            const [compiledValue, valueDiagnostics, valueReferences] = compiler(
              tok.value,
              context
            );
            recordExpressionReferences(
              tok,
              tok.ranges?.value?.from ?? 0,
              valueReferences,
              ids
            );
            reportExpressionDiagnostics(
              tok,
              tok.ranges?.value?.from ?? 0,
              valueDiagnostics
            );
            // Check for type mismatch
            const compiledType = typeof compiledValue;
            const declaredType = typeof declaredValue;
            validateTypeMatch(
              tok,
              compiledType,
              declaredType,
              tok.ranges?.name
            );
            if (VARIABLE_NAME_REGEX.test(tok.name)) {
              const id = `${currentSectionId}.${tok.name}`;
              // If variable does not already exist, declare it.
              if (!program.variables?.[id]) {
                if (
                  validateName(
                    tok,
                    currentSectionId,
                    tok.name,
                    tok.ranges?.name
                  )
                ) {
                  // Create variable declaration
                  const variable = {
                    line: tok.line,
                    from: tok.from,
                    to: tok.to,
                    name: tok.name,
                    type: tok.type ?? typeof compiledValue,
                    value: tok.value,
                  };
                  // Add variable declaration to program
                  program.variables ??= {};
                  program.variables[id] ??= variable;
                  // Add variable declaration to section
                  const currentSection = program.sections[currentSectionId]!;
                  currentSection.variables ??= {};
                  currentSection.variables[id] ??= variable;
                  if (tok.operator !== "=") {
                    // Since variable was not previously declared,
                    // if variable references itself during assignment (i.e. uses a compound operator like `+=` or `-=`),
                    // report an error
                    reportMissing(tok, "variable", tok.name, tok.ranges?.name);
                  }
                }
              }
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
    // Pad script with newline to ensure any open scopes are closed by the end of the script.
    let paddedScript = script + "\n";
    let parseConfig = config
      ? {
          ...this.config,
          ...config,
        }
      : this.config;
    const result = this.compiler.compile(paddedScript);
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
    // console.log(printTree(tree, paddedScript, this.grammar.nodeNames));
    return this.build(paddedScript, tree, parseConfig);
  }
}

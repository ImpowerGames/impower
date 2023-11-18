import { Compiler, Tree } from "../../../grammar-compiler/src/compiler";
import { NodeID } from "../../../grammar-compiler/src/core";
import { Grammar } from "../../../grammar-compiler/src/grammar";
import GRAMMAR_DEFINITION from "../../language/sparkdown.language-grammar.json";
import SPARK_RESERVED_KEYWORDS from "../constants/SPARK_RESERVED_KEYWORDS";
import SPARK_TOKEN_TAGS from "../constants/SPARK_TOKEN_TAGS";
import defaultCompiler from "../defaults/defaultCompiler";
import defaultFormatter from "../defaults/defaultFormatter";
import { CompilerDiagnostic } from "../types/CompilerDiagnostic";
import { ISparkToken } from "../types/ISparkToken";
import { SparkChunk } from "../types/SparkChunk";
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
  SparkStructToken,
  SparkToken,
  SparkTokenTagMap,
  SparkVariableToken,
} from "../types/SparkToken";
import { SparkVariable } from "../types/SparkVariable";
import { SparkdownNodeName } from "../types/SparkdownNodeName";
import { StructureItem } from "../types/StructureItem";
import calculateSpeechDuration from "../utils/calculateSpeechDuration";
import createSparkToken from "../utils/createSparkToken";
import getAncestorIds from "../utils/getAncestorIds";
import getColorMetadata from "../utils/getColorMetadata";
import { getProperty } from "../utils/getProperty";
import getRelativeSectionName from "../utils/getRelativeSectionName";
import getScopedItemId from "../utils/getScopedItemId";
import getScopedValueContext from "../utils/getScopedValueContext";
import setProperty from "../utils/setProperty";
import { traverse } from "../utils/traverse";

const WHITESPACE_REGEX = /([ \t]+)/;

const UNESCAPED_DOUBLE_QUOTE = /(?<!\\)(?:(\\\\)*)["]/g;
const ESCAPED_DOUBLE_QUOTE = /\\["]/g;

const SCENE_LOCATION_TIME_REGEX = new RegExp(
  `^${GRAMMAR_DEFINITION.repository.SceneLocationTime.match}$`,
  GRAMMAR_DEFINITION.flags
);

const INDENT_UNIT = GRAMMAR_DEFINITION.indentUnit;
const PRIMITIVE_TYPES = ["string", "number", "boolean"];

const BUILT_IN_TYPES = [...PRIMITIVE_TYPES, "undefined", "object", "function"];

const vowels = ["a", "e", "i", "o", "u"];
const lowercaseArticles = ["an", "a"];
const capitalizedArticles = ["An", "A"];

const prefixWithArticle = (str: string, capitalize?: boolean): string => {
  if (!str[0]) {
    return "";
  }
  const articles = capitalize ? capitalizedArticles : lowercaseArticles;
  return `${vowels.includes(str[0]) ? articles[0] : articles[1]} ${str}`;
};

const calculateIndent = (text: string): number => {
  let tabCount = 0;
  let spaceCount = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]!;
    if (c === "\t") {
      tabCount += 1;
    }
    if (c === " ") {
      spaceCount += 1;
    }
  }
  const spaceMultiplier = INDENT_UNIT?.[0] === " " ? 1 / INDENT_UNIT.length : 0;
  return tabCount + spaceCount * spaceMultiplier;
};

const findChunkId = (
  chunks: Record<string, SparkChunk> | undefined,
  name: string
): string | undefined => {
  const found = chunks?.[name];
  if (found) {
    return name;
  }
  return undefined;
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

const findChunk = (
  chunks: Record<string, SparkChunk> | undefined,
  name: string
): SparkChunk | undefined => {
  const id = findChunkId(chunks, name);
  if (id != null) {
    return chunks?.[id];
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
    const parseStartTime = Date.now();

    /* INITIALIZE PROGRAM */
    const program: SparkProgram = {
      metadata: {},
      chunks: {},
      sections: {},
      tokens: [],
      ...(config?.augmentations || {}),
    };
    const nodeNames = this.grammar.nodeNames as SparkdownNodeName[];
    const stack: SparkToken[] = [];
    const prevDisplayPositionalTokens: (
      | SparkDialogueToken
      | SparkDialogueBoxToken
    )[] = [];
    program.metadata.structure = {
      "": {
        type: "chunk",
        level: -1,
        text: "",
        id: "",
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
        selectionRange: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
        children: [],
      },
    };
    program.chunks[""] = {
      line: 0,
      from: 0,
      to: 0,
      name: "",
    };
    program.sections[""] = {
      line: 0,
      from: 0,
      to: 0,
      name: "",
      level: 0,
      parent: undefined,
      tokens: [],
    };

    /* HELPER FUNCTIONS */
    const compiler = config?.compiler || defaultCompiler;
    const formatter = config?.formatter || defaultFormatter;

    const lookup = <K extends keyof SparkTokenTagMap>(
      ...tags: K[]
    ): SparkTokenTagMap[K] | undefined =>
      (tags.length > 0
        ? stack.findLast((t) => tags.includes(t.tag as unknown as K))
        : stack.at(-1)) as SparkTokenTagMap[K];

    const addToken = (tok: SparkToken) => {
      const currentSection = program.sections[currentSectionId];
      if (currentSection) {
        currentSection.tokens ??= [];
        currentSection.tokens.push(tok);
      }
    };

    const declareStruct = (tok: SparkStruct) => {
      const id = getDeclarationId(tok);
      tok.id = id;
      program.structs ??= {};
      program.structs[id] ??= tok;

      if (typeof tok.compiled === "object" && tok.compiled) {
        program.typeMap ??= {};
        program.typeMap[tok.type] ??= {};
        program.typeMap[tok.type]![tok.name] = tok.compiled;
        program.typeMap ??= {};
        program.typeMap[tok.name] = {
          "": tok.compiled,
        };
      }
    };

    const getDeclarationId = (tok: { name: string }) => {
      return `${currentSectionId}.${tok.name}`;
    };

    const validateDeclaration = (
      tok: SparkVariableToken | SparkStructToken
    ) => {
      return validateName(tok, currentSectionId, tok.name, tok.ranges?.name);
    };

    const declareVariable = (tok: SparkVariableToken | SparkStructToken) => {
      const id = getDeclarationId(tok);
      // Create variable declaration
      const variable = {
        line: tok.line,
        from: tok.from,
        to: tok.to,
        name: tok.name,
        type: tok.type,
        value: tok.value,
        compiled: tok.compiled,
      };
      // Add variable declaration to program
      program.variables ??= {};
      program.variables[id] ??= variable;
      // Add variable declaration to section
      const currentSection = program.sections[currentSectionId]!;
      currentSection.variables ??= {};
      currentSection.variables[id] ??= variable;
    };

    const _construct = (
      isLeaf: boolean,
      struct: SparkStruct,
      ids: Record<string, string>,
      combinedFieldValues: any
    ) => {
      if (struct.type && !BUILT_IN_TYPES.includes(struct.type)) {
        const parentId = ids[struct.type];
        if (parentId) {
          const parentStruct = program.structs?.[parentId];
          if (parentStruct) {
            _construct(false, parentStruct, ids, combinedFieldValues);
          }
        }
      }
      if (struct.fields) {
        let prevField: SparkField | undefined = undefined;
        struct.fields.forEach((field) => {
          const propertyPath = field.path + "." + field.key;
          const { successfullySet, error } = setProperty(
            combinedFieldValues,
            propertyPath,
            field.value,
            // Ensure array items are not inherited from parent
            (_curr, part) => !isLeaf && !Number.isNaN(Number(part))
          );
          if (error) {
            const from = prevField?.to ?? 0;
            const fullProp = script.slice(from, field.to);
            const indentCols = fullProp.length - fullProp.trimStart().length;
            const parentObj = getProperty(combinedFieldValues, successfullySet);
            const parentType = Array.isArray(parentObj) ? "array" : "object";
            diagnostic(
              program,
              field as SparkToken,
              `Invalid property inside of ${parentType}`,
              undefined,
              from + indentCols,
              field.to
            );
          }
          prevField = field;
        });
      }
    };

    const construct = (struct: SparkStruct, ids: Record<string, string>) => {
      const isArray = !Number.isNaN(Number(struct.fields?.[0]?.key));
      const obj = isArray ? [] : {};
      _construct(true, struct, ids, obj);
      return obj;
    };

    const diagnostic = (
      program: SparkProgram,
      tok: ISparkToken,
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

    const validateSectionReferences = (
      tok: ISparkToken,
      currentSectionId: string,
      expression: string,
      from: number,
      to: number
    ) => {
      if (!expression) {
        return;
      }
      const [, context] = getScopedValueContext(
        currentSectionId,
        program.sections
      );
      if (expression.includes("{")) {
        const [, diagnostics, references] = formatter(expression, context);
        const line = tok.line;
        reportExpressionDiagnostics(tok, { line, from, to }, diagnostics);
        references.forEach((reference) => {
          const name = reference.content.trim();
          const trimmedFromStart =
            reference.content.length - reference.content.trimStart().length;
          const trimmedFromEnd =
            reference.content.length - reference.content.trimEnd().length;
          const referenceFrom = from + reference.from + trimmedFromStart;
          const referenceTo = from + reference.to - trimmedFromEnd;
          const id = findSectionId(program.sections, currentSectionId, name);
          const found = id ? program.sections?.[id] : undefined;
          if (found) {
            program.metadata ??= {};
            program.metadata.lines ??= [];
            program.metadata.lines[tok.line] ??= {};
            program.metadata.lines[tok.line]!.references ??= [];
            program.metadata.lines[tok.line]!.references!.push({
              line,
              from: referenceFrom,
              to: referenceTo,
              name,
              id,
            });
          } else {
            reportMissing(tok, "section", name, {
              line,
              from: referenceFrom,
              to: referenceTo,
            });
          }
        });
      } else {
        const name = getRelativeSectionName(
          currentSectionId,
          program.sections,
          expression
        );
        const id = findSectionId(program.sections, currentSectionId, name);
        const found = id ? program.sections?.[id] : undefined;
        if (found) {
          program.metadata ??= {};
          program.metadata.lines ??= [];
          program.metadata.lines[tok.line] ??= {};
          program.metadata.lines[tok.line]!.references ??= [];
          program.metadata.lines[tok.line]!.references!.push({
            line,
            from,
            to,
            name,
            id,
          });
        } else {
          reportMissing(tok, "section", name, { line, from, to });
        }
      }
    };

    const validateAssetReference = (
      tok: ISparkToken,
      currentSectionId: string,
      type: string,
      name: string,
      nameRange: SparkRange | undefined
    ): SparkVariable | undefined => {
      if (!name) {
        return undefined;
      }
      const line = tok.line;
      const from = nameRange?.from ?? -1;
      const to = nameRange?.to ?? -1;
      const id = findVariableId(program.variables, currentSectionId, name);
      program.metadata ??= {};
      program.metadata.lines ??= [];
      program.metadata.lines[tok.line] ??= {};
      program.metadata.lines[tok.line]!.references ??= [];
      program.metadata.lines[tok.line]!.references!.push({
        line,
        from,
        to,
        name,
        id,
      });
      const found = id ? program.variables?.[id] : undefined;
      if (!found) {
        reportMissing(tok, type, name, nameRange, "warning");
        return undefined;
      }
      if (
        !found.compiled ||
        typeof found.compiled !== "object" ||
        !("type" in found.compiled) ||
        found.compiled.type !== type
      ) {
        diagnostic(
          program,
          tok,
          `'${name}' is not ${prefixWithArticle(type)}`,
          [{ name: "FOCUS", focus: { from: found.from, to: found.from } }],
          from,
          to
        );
        return undefined;
      }
      return found;
    };

    const recordColors = (
      value: string,
      expressionFrom: number | undefined
    ) => {
      // Record any color strings
      const colorMetadata = getColorMetadata(value, expressionFrom);
      if (colorMetadata) {
        program.metadata ??= {};
        program.metadata.colors ??= [];
        program.metadata.colors?.push(colorMetadata);
      }
    };

    const recordExpressionReferences = (
      tok: ISparkToken,
      expressionFrom: number | undefined,
      references: CompilerDiagnostic[],
      ids: Record<string, string>
    ) => {
      if (
        expressionFrom != null &&
        expressionFrom >= 0 &&
        references?.length > 0
      ) {
        // Record any references
        for (let i = 0; i < references.length; i += 1) {
          const r = references[i];
          if (r) {
            const line = tok.line;
            const from = expressionFrom + r.from;
            const to = expressionFrom + r.to;
            program.metadata ??= {};
            program.metadata.lines ??= [];
            program.metadata.lines[tok.line] ??= {};
            program.metadata.lines[tok.line]!.references ??= [];
            program.metadata.lines[tok.line]!.references!?.push({
              line,
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
      tok: ISparkToken,
      expressionRange: SparkRange | undefined,
      diagnostics: CompilerDiagnostic[]
    ) => {
      if (
        expressionRange?.from != null &&
        expressionRange?.from >= 0 &&
        diagnostics?.length > 0
      ) {
        // Report any problems encountered during compilation
        for (let i = 0; i < diagnostics.length; i += 1) {
          const d = diagnostics[i];
          if (d) {
            const from = expressionRange.from + d.from;
            const to = Math.min(
              expressionRange.to,
              expressionRange.from + d.to
            );
            diagnostic(program, tok, d.message, undefined, from, to);
          }
        }
      }
    };

    const compileAndValidate = (
      tok: ISparkToken,
      value: string,
      valueRange: SparkRange | undefined,
      ids: Record<string, string>,
      context: Record<string, unknown>
    ) => {
      const [compiledValue, valueDiagnostics, valueReferences] = compiler(
        value,
        context
      );
      recordColors(value, valueRange?.from);
      recordExpressionReferences(tok, valueRange?.from, valueReferences, ids);
      reportExpressionDiagnostics(tok, valueRange, valueDiagnostics);
      return compiledValue;
    };

    const reportMissing = (
      tok: ISparkToken,
      type: string,
      name: string,
      nameRange?: SparkRange,
      severity?: "error" | "warning" | "info"
    ) => {
      diagnostic(
        program,
        tok,
        `Cannot find ${type} named '${name}'`,
        undefined,
        nameRange?.from,
        nameRange?.to,
        severity
      );
    };

    const reportDuplicate = (
      tok: ISparkToken,
      type: string,
      name: string,
      assignedRange?: SparkRange,
      declaredToken?: { line: number; from: number; to: number }
    ) => {
      const prefix = prefixWithArticle(type, true);
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

    const validateTypeExists = (
      tok: ISparkToken,
      type: string,
      typeRange: SparkRange | undefined,
      typeMap: { [type: string]: { [name: string]: object } } | undefined
    ) => {
      let missing = false;
      if (type) {
        const types = type.split(/[\[\],<> \t]/);
        types.forEach((type) => {
          if (type && !BUILT_IN_TYPES.includes(type) && !typeMap?.[type]) {
            reportMissing(tok, "object", type, typeRange);
            missing = true;
          }
        });
      }
      return missing;
    };

    const validateTypeMatch = (
      tok: ISparkToken,
      compiledType: string,
      declaredType: string,
      assignedRange?: SparkRange,
      declaredRange?: SparkRange
    ): boolean => {
      const baseCompiledType = BUILT_IN_TYPES.includes(compiledType)
        ? compiledType
        : "object";
      const baseDeclaredType = BUILT_IN_TYPES.includes(declaredType)
        ? declaredType
        : "object";
      if (
        baseDeclaredType &&
        baseDeclaredType !== "undefined" &&
        baseCompiledType !== "undefined" &&
        baseCompiledType !== baseDeclaredType
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
      tok: ISparkToken,
      name: string,
      nameRange?: SparkRange
    ): boolean => {
      if (!name) {
        return false;
      }
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
      tok: ISparkToken,
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

    const validateName = <T extends SparkSection | SparkVariable | SparkStruct>(
      tok: ISparkToken,
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
          "object",
          findStruct(program.structs, name) as T,
          nameRange
        )
      ) {
        return false;
      }
      if (
        !validateNameUnique<T>(
          tok,
          "chunk",
          findChunk(program.chunks, name) as T,
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

    const getLastStructureItem = (
      program: SparkProgram,
      condition: (item?: StructureItem) => boolean = () => true
    ): StructureItem | undefined => {
      const structures = Object.values(program.metadata?.structure || {});
      for (let i = structures.length - 1; i >= 0; i -= 1) {
        const structItem = structures[i];
        if (!condition || condition(structItem)) {
          return structItem;
        }
      }
      return undefined;
    };

    const extendStructureRange = (
      program: SparkProgram,
      id: string,
      end: {
        line: number;
        character: number;
      }
    ) => {
      const structure = program.metadata?.structure;
      if (structure) {
        [id, ...getAncestorIds(id)].forEach((id) => {
          const item = structure[id];
          if (item) {
            if (item.range.end.line < end.line) {
              item.range.end = { ...end };
            }
          }
        });
      }
    };

    /* PROCESS TYPE MAP */
    let line = -1;
    let currentSectionId = "";
    if (program.typeMap) {
      Object.entries(program.typeMap).forEach(([type, objectsOfType]) => {
        program.structs ??= {};
        Object.entries(objectsOfType).forEach(([name, object]) => {
          const id = "." + name;
          const struct: SparkStruct = {
            tag: "struct",
            line,
            from: -1,
            to: -1,
            indent: 0,
            id,
            type,
            name,
            value: JSON.stringify(object),
            compiled: object,
            fields: [],
          };
          traverse(object, (path, v) => {
            const parts = path.split(".");
            struct.fields ??= [];
            struct.fields.push({
              tag: "field",
              line,
              from: -1,
              to: -1,
              indent: 0,
              path: parts.slice(0, -1).join("."),
              key: parts.at(-1) || "",
              type: typeof v,
              value: JSON.stringify(v),
            });
          });
          program.structs ??= {};
          program.structs[id] ??= struct;
          declareVariable(struct);
        });
      });
    }

    /* HOIST FRONTMATTER, CHUNKS, AND SECTIONS */
    line = 0;
    currentSectionId = "";
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
            indent: 0,
          });

          // front_matter
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

          // chunk
          if (tok.tag === "chunk_name") {
            const parent = lookup("chunk");
            if (parent) {
              parent.name = text.split(".")[0] || "";
              parent.ranges ??= {};
              parent.ranges.name = {
                line: tok.line,
                from: tok.from,
                to: tok.to,
              };
            }
          }

          // section
          if (tok.tag === "section_level") {
            const parent = lookup("section");
            if (parent) {
              parent.level = text.length;
              parent.ranges ??= {};
              parent.ranges.level = {
                line: tok.line,
                from: tok.from,
                to: tok.to,
              };
            }
          }
          if (tok.tag === "section_name") {
            const parent = lookup("section");
            if (parent) {
              parent.name = text;
              parent.ranges ??= {};
              parent.ranges.name = {
                line: tok.line,
                from: tok.from,
                to: tok.to,
              };
            }
          }

          // scene
          if (tok.tag === "text") {
            tok.text = text;
            const parent = lookup("scene");
            if (parent) {
              parent.content ??= [];
              parent.content.push(tok);
            }
          }

          if (tok.tag === "indent") {
            const parent = lookup();
            if (parent) {
              parent.indent = calculateIndent(text);
            }
          }

          // push token onto current stack
          stack.push(tok);
        }

        // newline
        if (id === "Newline") {
          const latestStructureItem = getLastStructureItem(program);
          if (
            latestStructureItem &&
            latestStructureItem.level != null &&
            latestStructureItem.level >= 0
          ) {
            extendStructureRange(program, latestStructureItem.id, {
              line: Math.max(0, line),
              character: 0,
            });
          }
          line += 1;
        }
      },
      leave: (node) => {
        const tok = stack.at(-1);
        const tag = SPARK_TOKEN_TAGS[nodeNames[node.type]!];

        if (tok && tok.tag === tag) {
          if (tok.tag === "chunk") {
            prevDisplayPositionalTokens.length = 0;
            const chunk = {
              line: tok.line,
              from: tok.from,
              to: tok.to,
              name: tok.name,
            };
            if (
              validateName(tok, currentSectionId, tok.name, tok.ranges?.name)
            ) {
              currentSectionId = "";
              program.chunks[chunk.name] = chunk;
              program.metadata ??= {};
              program.metadata.lines ??= [];
              program.metadata.lines[tok.line] ??= {};
              program.metadata.lines[tok.line]!.chunk ??= tok.name;
              program.metadata.lines[tok.line]!.references ??= [];
              program.metadata.lines[tok.line]!.references!.push({
                line: tok?.ranges?.name?.line ?? -1,
                from: tok?.ranges?.name?.from ?? -1,
                to: tok?.ranges?.name?.to ?? -1,
                name: tok.name,
                id: tok.name,
                declaration: true,
              });
            }
            // Record structure
            const selectionRange = {
              start: { line: tok.line, character: 0 },
              end: {
                line: tok.line + 1,
                character: 0,
              },
            };
            const id = "." + tok.line;
            const structureItem: StructureItem = {
              ...(program.metadata?.structure?.[id] || {}),
              type: "chunk",
              level: 0,
              text: tok.name,
              id,
              range: {
                start: { ...selectionRange.start },
                end: { ...selectionRange.end },
              },
              selectionRange,
              children: [],
            };
            program.metadata?.structure?.[""]?.children.push(id);
            program.metadata ??= {};
            program.metadata.structure ??= {};
            program.metadata.structure[id] = structureItem;
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
            const maxValidLevel = currentLevel + 1;
            if (tok.level > maxValidLevel) {
              diagnostic(
                program,
                tok,
                `Too many #: Expected at most ${maxValidLevel}`,
                undefined,
                tok.ranges?.level?.from,
                tok.ranges?.level?.to,
                "warning"
              );
            }
            const parentSection = program.sections[parentId];
            const section = {
              line: tok.line,
              from: tok.from,
              to: tok.to,
              name: tok.name,
              level: tok.level,
              parent: parentId,
              tokens: [],
            };
            if (
              validateName(tok, currentSectionId, tok.name, tok.ranges?.name)
            ) {
              currentSectionId = parentId + "." + tok.name;
              program.sections[currentSectionId] = section;
              if (parentSection) {
                parentSection.children ??= [];
                parentSection.children.push(currentSectionId);
              }
              program.metadata ??= {};
              program.metadata.lines ??= [];
              program.metadata.lines[section.line] ??= {};
              program.metadata.lines[section.line]!.section ??=
                currentSectionId;
              program.metadata.lines[section.line]!.references ??= [];
              program.metadata.lines[section.line]!.references!.push({
                line: tok?.ranges?.name?.line ?? -1,
                from: tok?.ranges?.name?.from ?? -1,
                to: tok?.ranges?.name?.to ?? -1,
                name: section.name,
                id: currentSectionId,
                declaration: true,
              });
            }
            // Record structure
            const latestSectionOrChunk = getLastStructureItem(
              program,
              (t) =>
                (t?.type === "section" || t?.type === "chunk") &&
                (t?.level || 0) < currentLevel
            );
            if (latestSectionOrChunk) {
              const selectionRange = {
                start: { line: tok.line, character: 0 },
                end: {
                  line: tok.line + 1,
                  character: 0,
                },
              };
              const id = latestSectionOrChunk.id + "." + tok.line;
              const structureItem: StructureItem = {
                ...(program.metadata?.structure?.[id] || {}),
                type: "section",
                level: tok.level,
                text: tok.name,
                id,
                range: {
                  start: { ...selectionRange.start },
                  end: { ...selectionRange.end },
                },
                selectionRange,
                children: [],
              };
              latestSectionOrChunk.children.push(id);
              program.metadata ??= {};
              program.metadata.structure ??= {};
              program.metadata.structure[id] = structureItem;
            }
          }

          if (tok.tag === "scene") {
            // Record structure
            const latestSectionOrChunk = getLastStructureItem(
              program,
              (t) => t?.type === "section" || t?.type === "chunk"
            );
            if (latestSectionOrChunk) {
              const selectionRange = {
                start: { line: tok.line, character: 0 },
                end: {
                  line: tok.line + 1,
                  character: 0,
                },
              };
              const id = latestSectionOrChunk.id + "." + tok.line;
              const structureItem: StructureItem = {
                ...(program.metadata?.structure?.[id] || {}),
                type: "scene",
                level: (latestSectionOrChunk.level || 0) + 1,
                text: tok.content?.map((c) => c.text)?.join("") || "",
                id,
                range: {
                  start: { ...selectionRange.start },
                  end: { ...selectionRange.end },
                },
                selectionRange,
                children: [],
              };
              latestSectionOrChunk.children.push(id);
              program.metadata ??= {};
              program.metadata.structure ??= {};
              program.metadata.structure[id] = structureItem;
            }
          }

          stack.pop();
        }
      },
    });

    const endRange = { line, character: 0 };
    const root = program.metadata.structure[""];
    if (root) {
      root.range.end = endRange;
    }
    const latestStructureItem = getLastStructureItem(program);
    if (
      latestStructureItem &&
      latestStructureItem.level != null &&
      latestStructureItem.level >= 0
    ) {
      extendStructureRange(program, latestStructureItem.id, endRange);
    }

    /* PROCESS COMMANDS */
    line = 0;
    currentSectionId = "";
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
            indent: 0,
          });

          if (tok.tag === "chunk") {
            currentSectionId = "";
          }

          if (tok.tag === "section") {
            currentSectionId = program.metadata?.lines?.[line]?.section || "";
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

          // variable
          if (tok.tag === "variable") {
            addToken(tok);
          }
          if (tok.tag === "type_name") {
            const parent = lookup("variable");
            if (parent) {
              parent.type = text;
              parent.ranges ??= {};
              parent.ranges.type = {
                line: tok.line,
                from: tok.from,
                to: tok.to,
              };
            }
          }
          if (tok.tag === "declaration_name") {
            const parent = lookup("variable");
            if (parent) {
              parent.name = text;
              parent.ranges ??= {};
              parent.ranges.name = {
                line: tok.line,
                from: tok.from,
                to: tok.to,
              };
            }
          }
          if (tok.tag === "value_text") {
            const parent = lookup("variable");
            if (parent) {
              parent.value ??= "";
              parent.value += text;
              parent.ranges ??= {};
              parent.ranges.value ??= {
                line: tok.line,
                from: tok.from,
                to: tok.to,
              };
              parent.ranges.value.to = tok.to;
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
              parent.ranges.type = {
                line: tok.line,
                from: tok.from,
                to: tok.to,
              };
            }
          }
          if (tok.tag === "declaration_name") {
            const parent = lookup("struct");
            if (parent) {
              parent.name = text;
              parent.ranges ??= {};
              parent.ranges.name = {
                line: tok.line,
                from: tok.from,
                to: tok.to,
              };
            }
          }
          if (tok.tag === "struct_field") {
            const parent = lookup("struct");
            if (parent) {
              parent.ranges ??= {};
              parent.ranges.value ??= {
                line: tok.line,
                from: tok.from,
                to: tok.to,
              };
              parent.ranges.value.to = tok.to;
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
              tok.key = String(mapProperty.arrayLength);
              mapProperty.arrayLength += 1;
            } else if (struct) {
              struct.arrayLength ??= 0;
              tok.key = String(struct.arrayLength);
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
              tok.key = String(mapProperty.arrayLength);
              mapProperty.arrayLength += 1;
            } else if (struct) {
              struct.arrayLength ??= 0;
              tok.key = String(struct.arrayLength);
              struct.arrayLength += 1;
            }
            tok.path = stack
              .map((p) =>
                p.tag === "struct_map_item" || p.tag === "struct_map_property"
                  ? p.key
                  : ""
              )
              .filter((k) => k)
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
              .filter((k) => k)
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
              parent.ranges.key = {
                line: tok.line,
                from: tok.from,
                to: tok.to,
              };
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
              parent.ranges.value ??= {
                line: tok.line,
                from: tok.from,
                to: tok.to,
              };
              parent.ranges.value.to = tok.to;
            }
          }

          // assign
          if (tok.tag === "assign") {
            addToken(tok);
          }
          if (tok.tag === "identifier_path") {
            const parent = lookup("assign");
            if (parent) {
              parent.name = text;
              parent.ranges ??= {};
              parent.ranges.name = {
                line: tok.line,
                from: tok.from,
                to: tok.to,
              };
            }
          }
          if (tok.tag === "assign_operator") {
            const parent = lookup("assign");
            if (parent) {
              parent.operator = text;
              parent.ranges ??= {};
              parent.ranges.operator = {
                line: tok.line,
                from: tok.from,
                to: tok.to,
              };
            }
          }
          if (tok.tag === "value_text") {
            const parent = lookup("assign");
            if (parent) {
              parent.value ??= "";
              parent.value += text;
              parent.ranges ??= {};
              parent.ranges.value ??= {
                line: tok.line,
                from: tok.from,
                to: tok.to,
              };
              parent.ranges.value.to = tok.to;
            }
          }

          // access
          if (tok.tag === "access") {
            addToken(tok);
          }
          if (tok.tag === "type_name") {
            const parent = lookup("access");
            if (parent) {
              parent.type = text;
              parent.ranges ??= {};
              parent.ranges.type = {
                line: tok.line,
                from: tok.from,
                to: tok.to,
              };
            }
          }
          if (tok.tag === "identifier_path") {
            const parent = lookup("access");
            if (parent) {
              parent.name = text;
              parent.ranges ??= {};
              parent.ranges.name = {
                line: tok.line,
                from: tok.from,
                to: tok.to,
              };
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

          // jump_to_section
          if (tok.tag === "jump_to_section") {
            const parent = lookup("jump", "choice");
            if (parent) {
              parent.section = text;
              validateSectionReferences(
                tok,
                currentSectionId,
                text,
                tok.from,
                tok.to
              );
            }
          }

          // transition
          if (tok.tag === "transition") {
            tok.waitUntilFinished = true;
            addToken(tok);
          }

          // scene
          if (tok.tag === "scene") {
            tok.waitUntilFinished = true;
            addToken(tok);
          }

          // centered
          if (tok.tag === "centered") {
            tok.waitUntilFinished = true;
            addToken(tok);
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
            tok.waitUntilFinished = true;
            const parent = lookup("action");
            if (parent) {
              parent.boxes ??= [];
              parent.boxes.push(tok);
            }
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
            tok.layer = "CharacterName";
            tok.speed = 0;
            tok.text = text;
            const dialogue = lookup("dialogue");
            if (dialogue) {
              dialogue.characterName = tok;
            }
            const dialogue_start = lookup("dialogue_start");
            if (dialogue_start) {
              dialogue_start.print = text;
            }
          }
          if (tok.tag === "dialogue_character_parenthetical" && text) {
            tok.layer = "CharacterParenthetical";
            tok.speed = 0;
            tok.text = text;
            const dialogue = lookup("dialogue");
            if (dialogue) {
              dialogue.characterParenthetical = tok;
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
                prevCharacterName ??= t.characterName?.text;
              });
              if (dialogue.characterName.text === prevCharacterName) {
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
              parent.boxes ??= [];
              parent.boxes.push(tok);
              tok.content ??= [];
              if (parent.characterName) {
                tok.content.push(parent.characterName);
              }
              if (parent.characterParenthetical) {
                tok.content.push(parent.characterParenthetical);
              }
              tok.position = parent.position;
              tok.characterName = parent.characterName;
              tok.characterParenthetical = parent.characterParenthetical;
              tok.overwritePrevious = true;
              tok.waitUntilFinished = true;
            }
            addToken(tok);
          }
          if (tok.tag === "dialogue_line_parenthetical") {
            tok.layer = "Parenthetical";
            tok.speed = 0;
            tok.text = text;
            tok.print = text;
            const parent = lookup("dialogue_box");
            if (parent) {
              parent.content ??= [];
              parent.content.push(tok);
            }
          }

          // box
          if (tok.tag === "display_text_prerequisite_value") {
            const parent = lookup("display_text");
            if (parent) {
              parent.prerequisite = text;
            }
          }
          if (tok.tag === "display_text_content") {
            const parent = lookup("display_text");
            if (parent) {
              parent.text = text;
            }
          }
          if (tok.tag === "text") {
            tok.text = text;
            const parent = lookup(
              "choice",
              "action_box",
              "dialogue_box",
              "transition",
              "scene",
              "centered"
            );
            if (parent) {
              parent.content ??= [];
              parent.content.push(tok);
            }
            const display_text = lookup("display_text");
            if (display_text) {
              if (display_text.prerequisite) {
                tok.prerequisite = display_text.prerequisite;
              }
            }
          }
          if (tok.tag === "image") {
            tok.layer = id === "InlineImage" ? "Insert" : "Portrait";
            const parent = lookup("dialogue_box", "action_box");
            if (parent) {
              parent.content ??= [];
              parent.content.push(tok);
            }
          }
          if (tok.tag === "audio") {
            tok.layer = "InlineAudio" ? "Sound" : "Voice";
            const parent = lookup("dialogue_box", "action_box");
            if (parent) {
              parent.content ??= [];
              parent.content.push(tok);
            }
          }
          if (tok.tag === "asset_layer") {
            const parent = lookup("image", "audio");
            if (parent) {
              parent.layer = text;
              parent.ranges ??= {};
              parent.ranges.layer = {
                line: tok.line,
                from: tok.from,
                to: tok.to,
              };
            }
          }
          if (tok.tag === "asset_names") {
            const image = lookup("image");
            if (image) {
              image.image = [];
              image.nameRanges = [];
              let from = tok.from;
              text.split(WHITESPACE_REGEX).forEach((p) => {
                const name = p.trim();
                if (name) {
                  image.image.push(name);
                  image.nameRanges.push({
                    line: tok.line,
                    from,
                    to: from + p.length,
                  });
                }
                from += p.length;
              });
              image.ranges ??= {};
              image.ranges.image = {
                line: tok.line,
                from: tok.from,
                to: tok.to,
              };
            }
            const audio = lookup("audio");
            if (audio) {
              audio.audio = [];
              audio.nameRanges = [];
              let from = tok.from;
              text.split(WHITESPACE_REGEX).forEach((p) => {
                const name = p.trim();
                if (name) {
                  audio.audio.push(name);
                  audio.nameRanges.push({
                    line: tok.line,
                    from,
                    to: from + p.length,
                  });
                }
                from += p.length;
              });
              audio.ranges ??= {};
              audio.ranges.audio = {
                line: tok.line,
                from: tok.from,
                to: tok.to,
              };
            }
          }
          if (tok.tag === "asset_args") {
            const parent = lookup("image", "audio");
            if (parent) {
              const args = text.split(WHITESPACE_REGEX);
              parent.args = args;
              parent.ranges ??= {};
              parent.ranges.args = {
                line: tok.line,
                from: tok.from,
                to: tok.to,
              };
            }
          }
          if (tok.tag === "indent") {
            const parent = lookup();
            if (parent) {
              parent.indent = calculateIndent(text);
            }
          }

          // push token onto current stack
          stack.push(tok);
        }

        // Print screenplay content (include styling marks but not emphasis marks)
        if (id === "PlainText" || id === "StylingMark") {
          const text = script.slice(from, to);
          const inline_text = lookup("text");
          if (inline_text) {
            inline_text.print ??= "";
            inline_text.print += text;
          }
        }

        // newline
        if (id === "Newline") {
          line += 1;
        }
      },
      leave: (node) => {
        const tok = stack.at(-1);
        const tag = SPARK_TOKEN_TAGS[nodeNames[node.type]!];

        if (tok && tok.tag === tag) {
          if (tok.tag === "front_matter_start") {
            prevDisplayPositionalTokens.length = 0;
          }

          if (tok.tag === "chunk") {
            prevDisplayPositionalTokens.length = 0;
          }

          if (tok.tag === "section") {
            prevDisplayPositionalTokens.length = 0;
          }

          if (tok.tag === "flow_break") {
            prevDisplayPositionalTokens.length = 0;
          }

          if (tok.tag === "struct") {
            prevDisplayPositionalTokens.length = 0;
            const [ids, context] = getScopedValueContext(
              currentSectionId,
              program.sections
            );

            validateTypeExists(
              tok,
              tok.type,
              tok.ranges?.type,
              program.typeMap
            );
            tok.type = tok.type ?? "object";

            if (
              PRIMITIVE_TYPES.includes(tok.type) &&
              (!tok.fields || tok.fields.length === 0)
            ) {
              if (tok.type === "string") {
                tok.compiled = "";
                tok.value = JSON.stringify(tok.compiled);
              }
              if (tok.type === "number") {
                tok.compiled = 0;
                tok.value = JSON.stringify(tok.compiled);
              }
              if (tok.type === "boolean") {
                tok.compiled = false;
                tok.value = JSON.stringify(tok.compiled);
              }
              if (validateDeclaration(tok)) {
                declareVariable(tok);
              }
            } else {
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
                      // Error if field was defined multiple times in the current struct
                      reportDuplicate(
                        field,
                        "field",
                        String(field.key),
                        field.ranges?.key,
                        existingField
                      );
                    } else {
                      propertyPaths[propertyPath] = field;
                      const compiledValue = compileAndValidate(
                        field,
                        field.value,
                        field?.ranges?.value,
                        ids,
                        context
                      );
                      // Check for type mismatch
                      const parentPropertyAccessor = tok.type + propertyPath;
                      const declaredValue = getProperty(
                        context,
                        parentPropertyAccessor
                      );
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
                    }
                  }
                });
              }

              const obj = construct(tok, ids);
              const objectLiteral = JSON.stringify(obj)
                .replace(UNESCAPED_DOUBLE_QUOTE, "")
                .replace(ESCAPED_DOUBLE_QUOTE, `"`);
              tok.value = objectLiteral;
              const compiledValue = compiler(objectLiteral, context);
              tok.compiled = compiledValue;

              validateTypeMatch(tok, typeof obj, tok.type, tok?.ranges?.type);

              if (validateDeclaration(tok)) {
                declareStruct(tok);
                declareVariable(tok);
              }
            }
          }
          if (tok.tag === "struct_field") {
            const parent = lookup("struct");
            if (parent) {
              program.metadata ??= {};
              program.metadata.lines ??= [];
              program.metadata.lines[tok.line] ??= {};
              program.metadata.lines[tok.line]!.struct = parent.id;
            }
          }

          if (tok.tag === "variable") {
            prevDisplayPositionalTokens.length = 0;
            const [ids, context] = getScopedValueContext(
              currentSectionId,
              program.sections
            );
            // Compile value
            const compiledValue = compileAndValidate(
              tok,
              tok.value,
              tok?.ranges?.value,
              ids,
              context
            );
            tok.compiled = compiledValue;

            validateTypeExists(
              tok,
              tok.type,
              tok.ranges?.type,
              program.typeMap
            );
            tok.type = tok.type ?? typeof compiledValue;

            validateTypeMatch(
              tok,
              typeof compiledValue,
              tok.type,
              tok?.ranges?.type
            );

            if (validateDeclaration(tok)) {
              declareVariable(tok);
            }
          }

          if (tok.tag === "image") {
            const nameRanges = tok.nameRanges;
            if (nameRanges) {
              nameRanges.forEach((nameRange) => {
                const name = script.slice(nameRange.from, nameRange.to);
                validateAssetReference(
                  tok,
                  currentSectionId,
                  "image",
                  name,
                  nameRange
                );
              });
            }
          }

          if (tok.tag === "audio") {
            const nameRanges = tok.nameRanges;
            if (nameRanges) {
              nameRanges.forEach((nameRange) => {
                const name = script.slice(nameRange.from, nameRange.to);
                validateAssetReference(
                  tok,
                  currentSectionId,
                  "audio",
                  name,
                  nameRange
                );
              });
            }
          }

          // choice
          if (tok.tag === "choice") {
            const parent = lookup("action_box", "dialogue_box");
            if (parent) {
              const text =
                tok.content?.map((c) => c.text || "")?.join("") || "";
              parent.content ??= [];
              parent.content.push({
                tag: "choice",
                line: tok.line,
                from: tok.from,
                to: tok.to,
                indent: tok.indent,
                speed: 0,
                text,
                args: [tok.section],
                layer: `Choice`,
              });
            }
          }

          if (tok.tag === "action_box") {
            const textContent = tok.content?.filter((p) => p.text);
            if (!textContent || textContent.length === 0) {
              // Assets only
              // No need to wait for user input
              tok.content?.forEach((p) => {
                if (p.audio) {
                  p.layer = "Music";
                }
                if (p.image) {
                  p.layer = "Backdrop";
                }
              });
              tok.waitUntilFinished = false;
              tok.overwritePrevious = false;
              tok.autoAdvance = true;
            }
          }

          if (tok.tag === "transition") {
            prevDisplayPositionalTokens.length = 0;
          }

          if (tok.tag === "scene") {
            prevDisplayPositionalTokens.length = 0;
            const text =
              tok.content
                ?.map((t) => t.text)
                .join("")
                .toUpperCase() || "";
            const locationTimeMatch = text.match(SCENE_LOCATION_TIME_REGEX);
            const location = locationTimeMatch?.[1] || "";
            const time = locationTimeMatch?.[2] || "";
            program.metadata ??= {};
            program.metadata.lines ??= [];
            program.metadata.lines[tok.line] ??= {};
            program.metadata.lines[tok.line]!.sceneIndex = tok.index;
            program.metadata.scenes ??= [];
            program.metadata.scenes.push({
              index: tok.index,
              name: text,
              line: tok.line,
              location,
              time,
              actionDuration: 0,
              dialogueDuration: 0,
            });
          }

          if (tok.tag === "centered") {
            prevDisplayPositionalTokens.length = 0;
          }

          if (tok.tag === "action") {
            prevDisplayPositionalTokens.length = 0;
          }

          if (tok.tag === "action_box") {
            // Record estimated speechDuration
            const text =
              tok.content?.map((t) => ("text" in t ? t.text : "")).join("") ||
              "";
            tok.speechDuration = calculateSpeechDuration(text);
            program.metadata ??= {};
            program.metadata.actionDuration =
              (program.metadata.actionDuration || 0) + tok.speechDuration;
            const currentScene = program.metadata?.scenes?.at(-1);
            if (currentScene) {
              currentScene.actionDuration =
                (currentScene.actionDuration || 0) + tok.speechDuration;
            }
            tok.overwritePrevious = true;
            tok.waitUntilFinished = true;
          }

          if (tok.tag === "dialogue") {
            const characterName = tok.characterName?.text || "";
            const characterParenthetical =
              tok.characterParenthetical?.text || "";
            program.metadata ??= {};
            program.metadata.lines ??= [];
            program.metadata.lines[line] ??= {};
            program.metadata.lines[line]!.characterName = characterName;
            program.metadata.lines[line]!.characterParenthetical =
              characterParenthetical;
            program.metadata.characters ??= {};
            program.metadata.characters[characterName] ??= {};
            program.metadata.characters[characterName]!.name = characterName;
            program.metadata.characters[characterName]!.lines ??= [];
            program.metadata.characters[characterName]!.lines!.push(tok.line);
          }

          if (tok.tag === "dialogue_box") {
            // Record estimated speechDuration
            const text =
              tok.content?.map((t) => ("text" in t ? t.text : "")).join("") ||
              "";
            tok.speechDuration = calculateSpeechDuration(text);
            program.metadata ??= {};
            program.metadata.dialogueDuration =
              (program.metadata.dialogueDuration || 0) + tok.speechDuration;
            const currentScene = program.metadata?.scenes?.at(-1);
            if (currentScene) {
              currentScene.dialogueDuration =
                (currentScene.dialogueDuration || 0) + tok.speechDuration;
            }
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

          if (tok.tag === "assign") {
            const [ids, context] = getScopedValueContext(
              currentSectionId,
              program.sections
            );
            // Validate accessor
            const declaredValue = compileAndValidate(
              tok,
              tok.name,
              tok?.ranges?.name,
              ids,
              context
            );
            // Validate value
            const compiledValue = compileAndValidate(
              tok,
              tok.value,
              tok?.ranges?.value,
              ids,
              context
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
            if (declaredValue === undefined) {
              diagnostic(
                program,
                tok,
                `'${tok.name}' does not exist`,
                undefined,
                tok?.ranges?.name?.from,
                tok?.ranges?.name?.to
              );
            }
          }

          if (tok.tag === "access") {
            const [ids, context] = getScopedValueContext(
              currentSectionId,
              program.sections
            );
            // Compile accessor
            compileAndValidate(tok, tok.name, tok?.ranges?.name, ids, context);
          }

          stack.pop();
        }
      },
    });

    program.metadata.lineCount = line - 1;

    // CLEANUP
    if (program.frontMatter) {
      Object.entries(program.frontMatter).forEach(([keyword, values]) => {
        // Trim and remove empty values
        program.frontMatter![keyword] = values
          .map((v) => v.trim())
          .filter((v) => Boolean(v));
      });
    }

    Object.values(program.sections).forEach((section) => {
      section.tokens.forEach((tok) => {
        const tokenIndex = program.tokens.length ?? 0;
        program.tokens.push(tok);
        program.metadata ??= {};
        program.metadata.lines ??= [];
        program.metadata.lines[tok.line] ??= {};
        program.metadata.lines[tok.line]!.tokens ??= [];
        program.metadata.lines[tok.line]!.tokens!.push(tokenIndex);
        if (tok.content) {
          tok.content.forEach((c) => {
            program.metadata ??= {};
            program.metadata.lines ??= [];
            program.metadata.lines[c.line] ??= {};
            program.metadata.lines[c.line]!.tokens ??= [];
            program.metadata.lines[c.line]!.tokens!.push(tokenIndex);
          });
        }
      });
    });

    const parseEndTime = Date.now();
    program.metadata ??= {};
    program.metadata.parseTime = parseEndTime;
    program.metadata.parseDuration = parseEndTime - parseStartTime;

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

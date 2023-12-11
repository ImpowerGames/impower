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
import { SparkAction } from "../types/SparkDiagnostic";
import { SparkField } from "../types/SparkField";
import { SparkParserConfig } from "../types/SparkParserConfig";
import { SparkProgram } from "../types/SparkProgram";
import { SparkRange } from "../types/SparkRange";
import {
  ISparkDeclarationToken,
  SparkAssignToken,
  SparkCheckpointToken,
  SparkChunkToken,
  SparkDialogueBoxToken,
  SparkDialogueToken,
  SparkDisplayToken,
  SparkSectionToken,
  SparkStoreToken,
  SparkToken,
  SparkTokenTagMap,
} from "../types/SparkToken";
import { SparkVariable } from "../types/SparkVariable";
import { SparkdownNodeName } from "../types/SparkdownNodeName";
import { StructureItem } from "../types/StructureItem";
import calculateSpeechDuration from "../utils/calculateSpeechDuration";
import createSparkToken from "../utils/createSparkToken";
import { getProperty } from "../utils/getProperty";
import getRelativeSectionName from "../utils/getRelativeSectionName";
import setProperty from "../utils/setProperty";
import { traverse } from "../utils/traverse";

const WHITESPACE_REGEX = /([ \t]+)/;

const DOUBLE_ESCAPE = /\\\\/g;
const UNESCAPED_DOUBLE_QUOTE = /(?<!\\)["]/g;
const ESCAPED_DOUBLE_QUOTE = /\\["]/g;

const SCENE_LOCATION_TIME_REGEX = new RegExp(
  `^${GRAMMAR_DEFINITION.repository.SceneLocationTime.match}$`,
  GRAMMAR_DEFINITION.flags
);

const INDENT_UNIT = GRAMMAR_DEFINITION.indentUnit;
const PRIMITIVE_SCALAR_TYPES = ["string", "number", "boolean"];

const PRIMITIVE_TYPES = [
  ...PRIMITIVE_SCALAR_TYPES,
  "undefined",
  "object",
  "function",
];

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

const getVariableId = (tok: { type?: string; name?: string }) => {
  return tok.type && PRIMITIVE_SCALAR_TYPES.includes(tok.type)
    ? tok.name || ""
    : [tok.type, tok.name].filter((p) => p).join(".");
};

const getDialogueCharacterKey = (name: string) => {
  return name
    .replace(/([ ])/g, "_")
    .replace(/([.'"`])/g, "")
    .toLowerCase();
};

const populateVariableFields = (variable: SparkVariable) => {
  if (variable.compiled && typeof variable.compiled === "object") {
    // Populate fields
    traverse(variable.compiled, (path, v) => {
      const parts = path.split(".");
      const field = {
        tag: "field",
        line: variable.line,
        from: -1,
        to: -1,
        indent: 0,
        path: parts.slice(0, -1).join("."),
        key: parts.at(-1) || "",
        type: typeof v,
        value: JSON.stringify(v),
        compiled: v,
        implicit: true,
      };
      variable.fields ??= [];
      variable.fields.push(field);
    });
  }
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

    const augmentations = JSON.parse(
      JSON.stringify(config?.augmentations || {})
    );

    /* INITIALIZE PROGRAM */
    const program: SparkProgram = {
      metadata: {},
      chunks: {},
      sections: {},
      tokens: [],
      ...augmentations,
    };
    const context: any = {};
    const nodeNames = this.grammar.nodeNames as SparkdownNodeName[];
    const stack: SparkToken[] = [];
    const prevDisplayPositionalTokens: (
      | SparkDialogueToken
      | SparkDialogueBoxToken
    )[] = [];
    const rootStructure: StructureItem = {
      type: "chunk",
      level: 0,
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
    };
    program.metadata.structure = {
      "": rootStructure,
    };
    program.chunks[""] = {
      tag: "chunk",
      line: 0,
      from: 0,
      to: 0,
      indent: 0,
      name: "",
    };
    program.sections[""] = {
      tag: "section",
      line: 0,
      from: 0,
      to: 0,
      indent: 0,
      level: 0,
      path: [],
      parent: undefined,
      name: "",
      tokens: [],
    };
    const structure: StructureItem[] = [rootStructure];

    /* HELPER FUNCTIONS */
    const compiler = config?.compiler || defaultCompiler;
    const formatter = config?.formatter || defaultFormatter;

    // Find last matching parent token
    const lookup = <K extends keyof SparkTokenTagMap>(
      ...tags: K[]
    ): SparkTokenTagMap[K] | undefined =>
      (tags.length > 0
        ? stack.findLast((t) => tags.includes(t.tag as unknown as K))
        : stack.at(-1)) as SparkTokenTagMap[K];

    // Find last matching section token
    const search = <K extends keyof SparkTokenTagMap>(
      ...tags: K[]
    ): SparkTokenTagMap[K] | undefined => {
      const currentSectionName = currentSectionPath.at(-1) || "";
      const currentSection = program.sections[currentSectionName];
      if (currentSection) {
        return (
          tags.length > 0
            ? currentSection.tokens?.findLast((t) =>
                tags.includes(t.tag as unknown as K)
              )
            : currentSection.tokens?.at(-1)
        ) as SparkTokenTagMap[K];
      }
      return undefined;
    };

    const path = <K extends keyof SparkTokenTagMap>(...tags: K[]) => {
      return stack
        .map((p) =>
          tags.includes(p.tag as unknown as K) && "key" in p ? p.key : ""
        )
        .filter((k) => k)
        .join(".");
    };

    const addToken = (tok: SparkToken) => {
      const currentSectionName = currentSectionPath.at(-1) || "";
      const currentSection = program.sections[currentSectionName];
      if (currentSection) {
        currentSection.tokens ??= [];
        currentSection.tokens.push(tok);
      }
    };

    const declareType = (type: string, tok: SparkVariable) => {
      // Add variable declaration to program
      program.variables ??= {};
      program.variables[type] = tok;
      context[type] ??= {};
      context[type]["default"] = tok.compiled;
    };

    const declareVariable = (tok: SparkVariable) => {
      // Add variable declaration to program
      program.variables ??= {};
      if (tok.type && !tok.name) {
        // User is declaring a new type
        const typeName = tok.type;
        tok.name = typeName;
        tok.type = "type";
      }
      if (tok.type === "type") {
        program.variables[tok.name] = tok;
      } else {
        const id = getVariableId(tok);
        program.variables[id] = tok;
      }
      if (tok.type === "type") {
        context[tok.name] ??= {};
        context[tok.name]["default"] = tok.compiled;
      } else if (typeof tok.compiled === "object") {
        context[tok.type] ??= {};
        context[tok.type][tok.name] = tok.compiled;
      } else {
        context[tok.name] = tok.compiled;
      }
    };

    const constructProperty = (
      obj: any,
      propertyPath: string,
      value: unknown,
      field: SparkField,
      prevField: SparkField | undefined
    ) => {
      const { successfullySet, error } = setProperty(obj, propertyPath, value);
      if (error) {
        const from = prevField?.to ?? field.from;
        const fullProp = script.slice(from, field.to);
        const indentCols = fullProp.length - fullProp.trimStart().length;
        const parentObj = getProperty(obj, successfullySet);
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
    };

    const _inheritFields = (
      variable: SparkVariable,
      objValue: any,
      objCompiled: any
    ) => {
      if (variable.fields) {
        let prevField: SparkField | undefined = undefined;
        const arrays: Record<string, boolean> = {};
        variable.fields.forEach((field) => {
          const propAccess = field.key ? "." + field.key : "";
          const propertyPath = field.path + propAccess;
          const isArrayItem =
            Array.isArray(getProperty(objCompiled, field.path)) ||
            !Number.isNaN(Number(field.key));
          if (isArrayItem && !arrays[field.path]) {
            // This is the first index of the new array
            // Clear any inherited array so that the child can override the entire array (not just the item at this index)
            arrays[field.path] = true;
            setProperty(objValue, field.path, []);
            setProperty(objCompiled, field.path, []);
          }
          constructProperty(
            objValue,
            propertyPath,
            field.value,
            field,
            prevField
          );
          const clonedFieldCompiled =
            field.compiled != null
              ? JSON.parse(JSON.stringify(field.compiled))
              : field.compiled;
          constructProperty(
            objCompiled,
            propertyPath,
            clonedFieldCompiled,
            field,
            prevField
          );
          prevField = field;
        });
      }
    };

    const _construct = (
      variable: SparkVariable,
      objValue: any,
      objCompiled: any
    ) => {
      if (
        variable.type &&
        variable.type !== "type" &&
        !PRIMITIVE_TYPES.includes(variable.type)
      ) {
        const parent = program.variables?.[variable.type];
        if (parent && typeof parent.compiled === "object") {
          _construct(parent, objValue, objCompiled);
        }
      }
      const existingVariable = program.variables?.[getVariableId(variable)];
      if (existingVariable && existingVariable.tag !== "builtin") {
        // Inherit fields of variables that were implicitly declared due to usage (like character variables),
        // but don't inherit fields of builtin defaults like ui or style variables.
        _inheritFields(existingVariable, objValue, objCompiled);
      }
      _inheritFields(variable, objValue, objCompiled);
    };

    const construct = (variable: SparkVariable): [string, unknown] => {
      if (variable.type === "string") {
        return [`""`, ""];
      }
      if (variable.type === "number") {
        return [`0`, 0];
      }
      if (variable.type === "boolean") {
        return [`false`, false];
      }
      const firstField = variable.fields?.[0];
      const isArray =
        variable.type === "array" ||
        (!firstField?.path && !Number.isNaN(Number(firstField?.key)));
      const objValue = isArray ? [] : {};
      const objCompiled = isArray ? [] : {};
      _construct(variable, objValue, objCompiled);
      const objectLiteral = JSON.stringify(objValue)
        .replace(UNESCAPED_DOUBLE_QUOTE, "")
        .replace(ESCAPED_DOUBLE_QUOTE, `"`)
        .replace(DOUBLE_ESCAPE, `\\`);
      return [objectLiteral, objCompiled];
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
      currentSectionName: string,
      expression: string,
      expressionRange: SparkRange,
      context: Record<string, unknown>
    ) => {
      if (!expression) {
        return;
      }
      if (expression.includes("{")) {
        const [, diagnostics, references] = formatter(expression, context);
        const line = tok.line;
        reportExpressionDiagnostics(tok, expressionRange, diagnostics);
        references.forEach((reference) => {
          const name = reference.content.trim();
          const trimmedFromStart =
            reference.content.length - reference.content.trimStart().length;
          const trimmedFromEnd =
            reference.content.length - reference.content.trimEnd().length;
          const referenceFrom =
            (expressionRange?.from ?? 0) + reference.from + trimmedFromStart;
          const referenceTo =
            (expressionRange?.from ?? 0) + reference.to - trimmedFromEnd;
          const found = name ? program.sections?.[name] : undefined;
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
          currentSectionName,
          program.sections,
          expression
        );
        const found = name ? program.sections?.[name] : undefined;
        if (found) {
          program.metadata ??= {};
          program.metadata.lines ??= [];
          program.metadata.lines[tok.line] ??= {};
          program.metadata.lines[tok.line]!.references ??= [];
          program.metadata.lines[tok.line]!.references!.push({
            line,
            from: expressionRange.from,
            to: expressionRange.to,
            name,
          });
        } else {
          reportMissing(tok, "section", name, expressionRange);
        }
      }
    };

    const validateAssetReference = (
      tok: ISparkToken,
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
      program.metadata ??= {};
      program.metadata.lines ??= [];
      program.metadata.lines[tok.line] ??= {};
      program.metadata.lines[tok.line]!.references ??= [];
      program.metadata.lines[tok.line]!.references!.push({
        line,
        from,
        to,
        name,
      });
      const found =
        program.variables?.[getVariableId({ type, name })] ??
        program.variables?.[getVariableId({ type: type + "_group", name })];
      if (!found) {
        reportMissing(tok, type, name, nameRange, "warning");
        return undefined;
      }
      if (type === "audio" && found.type === "audio_group") {
        // TODO: ensure audio_group definition is valid
      } else if (type === "audio" && found.type === "synth") {
        // TODO: ensure synth definition is valid
      } else if (found.type !== type) {
        diagnostic(
          program,
          tok,
          `'${name}' is not ${prefixWithArticle(type)} file`,
          [{ name: "FOCUS", focus: { from: found.from, to: found.from } }],
          from,
          to
        );
        return undefined;
      }
      return found;
    };

    const recordExpressionReferences = (
      tok: ISparkToken,
      expressionFrom: number | undefined,
      references: CompilerDiagnostic[]
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

    const formatAndValidate = (
      tok: ISparkToken,
      value: string,
      valueRange: SparkRange | undefined,
      context: Record<string, unknown>
    ) => {
      const [formattedValue, valueDiagnostics, valueReferences] = formatter(
        value,
        context
      );
      recordExpressionReferences(tok, valueRange?.from, valueReferences);
      reportExpressionDiagnostics(tok, valueRange, valueDiagnostics);
      return formattedValue;
    };

    const compileAndValidate = (
      tok: ISparkToken,
      value: string,
      valueRange: SparkRange | undefined,
      context: Record<string, unknown>
    ) => {
      const [compiledValue, valueDiagnostics, valueReferences] = compiler(
        value,
        context
      );
      recordExpressionReferences(tok, valueRange?.from, valueReferences);
      reportExpressionDiagnostics(tok, valueRange, valueDiagnostics);
      if (compiledValue === undefined && valueDiagnostics.length === 0) {
        diagnostic(
          program,
          tok,
          `Value is undefined`,
          undefined,
          valueRange?.from,
          valueRange?.to
        );
      }
      return compiledValue;
    };

    const reportMissing = (
      tok: ISparkToken,
      type: string,
      name: string,
      nameRange?: SparkRange,
      severity?: "error" | "warning" | "info"
    ) => {
      const typeStr = type ? `${type} named ` : "";
      diagnostic(
        program,
        tok,
        `Cannot find ${typeStr}'${name}'`,
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
          ? ` at line ${declaredToken.line + 1}`
          : "";
      const actions =
        declaredToken && declaredToken?.line >= 0
          ? [{ name: "FOCUS", focus: declaredToken }]
          : undefined;
      const message = `${prefix} named '${name}' already exists${location}`;
      diagnostic(
        program,
        tok,
        message,
        actions,
        assignedRange?.from,
        assignedRange?.to
      );
    };

    const validateTypeExists = (
      tok: ISparkToken,
      type: string,
      typeRange: SparkRange | undefined
    ) => {
      let missing = false;
      if (type) {
        const types = type.split(/[\[\],<> \t]/);
        types.forEach((type) => {
          const variable = program.variables?.[type];
          if (
            type &&
            !PRIMITIVE_TYPES.includes(type) &&
            (!variable || typeof variable.compiled !== "object")
          ) {
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
      const baseCompiledType = PRIMITIVE_TYPES.includes(compiledType)
        ? compiledType
        : "object";
      const baseDeclaredType = PRIMITIVE_TYPES.includes(declaredType)
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

    const validateAssignment = (
      tok: SparkStoreToken | SparkAssignToken,
      declaredValue: unknown
    ) => {
      if (declaredValue === undefined && tok.content) {
        const parentPropertyParts = tok.content.slice(0, -1);
        const parentPropertyPath = parentPropertyParts
          .map((c) => c.text)
          .join("") as string;
        if (parentPropertyPath) {
          const [parentProperty] = compiler(parentPropertyPath, context);
          if (tok.name?.endsWith("]")) {
            if (parentProperty && typeof parentProperty !== "object") {
              // Error if user is attempting to index a scalar value (i.e. a number, string, or boolean)
              diagnostic(
                program,
                tok,
                `'${parentPropertyPath}' is not an array or object`,
                undefined,
                tok?.ranges?.name?.from,
                (tok?.ranges?.name?.from ?? 0) + parentPropertyPath.length
              );
            }
          } else if (tok.name?.endsWith(".")) {
            if (parentProperty === undefined) {
              reportMissing(tok, "", tok.name, parentPropertyParts?.at(-1));
            }
          }
        }
      }
    };

    const validateDeclarationAllowed = (
      tok: ISparkToken,
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

    const validateDeclarationUnique = (
      tok: ISparkToken,
      type: string,
      found: ISparkToken | undefined,
      name: string,
      nameRange?: SparkRange
    ): boolean => {
      if (found && found.from !== nameRange?.from) {
        reportDuplicate(tok, type, name, nameRange, found);
        return false;
      }
      return true;
    };

    const validateDeclaration = <
      T extends
        | SparkChunkToken
        | SparkSectionToken
        | ISparkDeclarationToken<string>
    >(
      tok: T
    ): boolean => {
      if (!validateDeclarationAllowed(tok, tok.name, tok.ranges?.name)) {
        return false;
      }
      if (
        !validateDeclarationUnique(
          tok,
          "chunk",
          program.chunks?.[tok.name],
          tok.name,
          tok.ranges?.name
        )
      ) {
        return false;
      }
      if (
        !validateDeclarationUnique(
          tok,
          "section",
          program.sections?.[tok.name],
          tok.name,
          tok.ranges?.name
        )
      ) {
        return false;
      }
      if (
        "type" in tok &&
        tok.type &&
        !tok.access_operator &&
        !tok.name &&
        !validateDeclarationUnique(
          tok,
          "type",
          program.variables?.[tok.type],
          tok.type,
          tok.ranges?.type
        )
      ) {
        return false;
      }
      if (
        !validateDeclarationUnique(
          tok,
          "type",
          program.variables?.[tok.name],
          tok.name,
          tok.ranges?.name
        )
      ) {
        return false;
      }
      const existingVariable = program.variables?.[getVariableId(tok)];
      if (
        existingVariable &&
        !existingVariable.implicit &&
        !validateDeclarationUnique(
          tok,
          "variable",
          existingVariable,
          getVariableId(tok),
          tok.ranges?.name
        )
      ) {
        return false;
      }
      return true;
    };

    const extendStructureRange = () => {
      structure.forEach((item) => {
        item.range.end.line = Math.max(0, line);
        item.range.end.character = 0;
      });
    };

    const addStructureItem = (item: StructureItem) => {
      extendStructureRange();
      while (structure.at(-1) && structure.at(-1)!.level >= item.level) {
        structure.pop();
      }
      const lastStructure = structure.at(-1);
      item.id = (lastStructure?.id || "") + "." + item.range.start.line;
      lastStructure?.children.push(item.id);
      structure.push(item);
    };

    let line = -1;
    let currentSectionPath: string[] = [];

    /* PROCESS DEFAULT BUILTINS */
    if (program.builtins) {
      Object.entries(program.builtins).forEach(([type, objectsOfType]) => {
        // Define type
        const compiled = objectsOfType["default"] ?? {};
        const compiledType = typeof compiled;
        program.variables ??= {};
        const variable: SparkVariable = {
          tag: "builtin",
          line,
          from: -1,
          to: -1,
          indent: 0,
          type: compiledType === "object" ? "type" : compiledType,
          name: type,
          value: JSON.stringify(compiled),
          compiled,
          implicit: true,
        };
        populateVariableFields(variable);
        declareType(type, variable);
        // Define variables of type
        const objectsOfTypeEntries = Object.entries(objectsOfType);
        if (objectsOfTypeEntries.length > 0) {
          objectsOfTypeEntries.forEach(([name, compiled]) => {
            if (name) {
              const variableName = name;
              const variableType = type;
              const variable: SparkVariable = {
                tag: "builtin",
                line,
                from: -1,
                to: -1,
                indent: 0,
                type: variableType,
                name: variableName,
                value: JSON.stringify(compiled),
                compiled,
                implicit: true,
              };
              populateVariableFields(variable);
              declareVariable(variable);
            }
          });
        }
      });
    }

    /* PROCESS DEFAULT VARIABLES */
    if (program.variables) {
      Object.entries(program.variables).forEach(([, v]) => {
        const variable: SparkVariable = { ...v };
        populateVariableFields(variable);
        declareVariable(variable);
      });
    }

    /* HOIST FRONTMATTER, CHUNKS, AND SECTIONS */
    line = 0;
    currentSectionPath = [];
    tree.iterate({
      enter: (node) => {
        const id = nodeNames[node.type]!;
        const from = node.from;
        const to = node.to > script.length ? script.length : node.to;
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
              tag: "chunk",
              line: tok.line,
              from: tok.from,
              to: tok.to,
              indent: 0,
              name: tok.name,
            };
            if (validateDeclaration(tok)) {
              currentSectionPath = [];
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
            const structureItem: StructureItem = {
              type: "chunk",
              level: 0,
              text: tok.name,
              id: "",
              range: {
                start: { ...selectionRange.start },
                end: { ...selectionRange.end },
              },
              selectionRange,
              children: [],
            };
            addStructureItem(structureItem);
            program.metadata ??= {};
            program.metadata.structure ??= {};
            program.metadata.structure[""]?.children.push(structureItem.id);
            program.metadata.structure[structureItem.id] = structureItem;
          }

          if (tok.tag === "section") {
            prevDisplayPositionalTokens.length = 0;
            const currentSectionName = currentSectionPath.at(-1) || "";
            const currentSection = program.sections[currentSectionName]!;
            const currentLevel = currentSection.level;
            const levelDiff = tok.level - currentLevel;
            const parentSectionPath =
              (levelDiff === 0
                ? currentSectionPath.slice(0, -1)
                : levelDiff > 0
                ? currentSectionPath.slice(0)
                : currentSectionPath.slice(0, levelDiff)) ?? [];
            const parentSectionName = parentSectionPath.at(-1) || "";
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
            const parentSection = program.sections[parentSectionName];
            if (validateDeclaration(tok)) {
              currentSectionPath = [...parentSectionPath, tok.name];
              program.sections[tok.name] = {
                tag: "section",
                line: tok.line,
                from: tok.from,
                to: tok.to,
                indent: 0,
                level: tok.level,
                path: [...parentSectionPath, tok.name],
                parent: parentSectionName,
                name: tok.name,
                tokens: [],
              };
              const sectionVariable = {
                tag: "section",
                line: tok.line,
                from: tok.from,
                to: tok.to,
                indent: 0,
                type: "section",
                name: tok.name,
                value: "0",
                compiled: 0,
                implicit: true,
              };
              populateVariableFields(sectionVariable);
              declareVariable(sectionVariable);
              if (parentSection) {
                parentSection.children ??= [];
                parentSection.children.push(tok.name);
                program.metadata ??= {};
                program.metadata.lines ??= [];
                program.metadata.lines[tok.line] ??= {};
                program.metadata.lines[tok.line]!.section ??= tok.name;
                program.metadata.lines[tok.line]!.references ??= [];
                program.metadata.lines[tok.line]!.references!.push({
                  line: tok?.ranges?.name?.line ?? -1,
                  from: tok?.ranges?.name?.from ?? -1,
                  to: tok?.ranges?.name?.to ?? -1,
                  name: tok.name,
                  declaration: true,
                });
              }
              // Record structure
              const lastStructure = structure.at(-1);
              if (lastStructure) {
                const selectionRange = {
                  start: { line: tok.line, character: 0 },
                  end: {
                    line: tok.line + 1,
                    character: 0,
                  },
                };
                const structureItem: StructureItem = {
                  type: "section",
                  level: tok.level,
                  text: tok.name,
                  id: "",
                  range: {
                    start: { ...selectionRange.start },
                    end: { ...selectionRange.end },
                  },
                  selectionRange,
                  children: [],
                };
                addStructureItem(structureItem);
                program.metadata ??= {};
                program.metadata.structure ??= {};
                program.metadata.structure[structureItem.id] = structureItem;
              }
            }
          }

          if (tok.tag === "scene") {
            // Record structure
            const lastStructure = structure.at(-1);
            if (lastStructure) {
              const selectionRange = {
                start: { line: tok.line, character: 0 },
                end: {
                  line: tok.line + 1,
                  character: 0,
                },
              };
              const structureItem: StructureItem = {
                type: "scene",
                level:
                  (structure.findLast(
                    (s) => s.type === "section" || s.type === "chunk"
                  )?.level || 0) + 1,
                text: tok.content?.map((c) => c.text)?.join("") || "",
                id: "",
                range: {
                  start: { ...selectionRange.start },
                  end: { ...selectionRange.end },
                },
                selectionRange,
                children: [],
              };
              addStructureItem(structureItem);
              program.metadata ??= {};
              program.metadata.structure ??= {};
              program.metadata.structure[structureItem.id] = structureItem;
            }
          }

          stack.pop();
        }
      },
    });

    extendStructureRange();

    const currentSectionCheckpoints = new Map<
      string,
      SparkCheckpointToken | SparkDisplayToken
    >();

    const setCheckpoint = (
      tok: SparkCheckpointToken | SparkDisplayToken,
      checkpointId?: string
    ) => {
      const checkpointIndex = currentSectionCheckpoints.size;
      const checkpoint = checkpointId ?? String(checkpointIndex);
      const existingCheckpoint = currentSectionCheckpoints.get(checkpoint);
      if (existingCheckpoint) {
        reportDuplicate(tok, "checkpoint", checkpoint, tok, existingCheckpoint);
      } else {
        tok.checkpoint = checkpoint;
        currentSectionCheckpoints.set(checkpoint, tok);
      }
    };

    /* PROCESS COMMANDS */
    line = 0;
    currentSectionPath = [];
    tree.iterate({
      enter: (node) => {
        const id = nodeNames[node.type]!;
        const from = node.from;
        const to = node.to > script.length ? script.length : node.to;
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
            currentSectionPath = [];
          } else if (tok.tag === "section") {
            const currentSectionName =
              program.metadata?.lines?.[line]?.section || "";
            const currentSection = program.sections[currentSectionName];
            currentSectionPath = [...(currentSection?.path || [])];
            currentSectionCheckpoints.clear();
          } else if (tok.tag === "comment") {
            addToken(tok);
          } else if (tok.tag === "comment_content") {
            const parent = lookup("comment");
            if (parent) {
              parent.text = text;
            }
          } else if (tok.tag === "checkpoint_name") {
            const parent = lookup("checkpoint");
            if (parent) {
              const name = text;
              parent.ranges ??= {};
              parent.ranges.checkpoint = {
                line: tok.line,
                from: tok.from,
                to: tok.to,
              };
              setCheckpoint(parent, name);
              const lastImplicitCheckpointToken = search(
                "action_box",
                "dialogue_box",
                "transition",
                "scene"
              );
              const lastImplicitCheckpointLine =
                lastImplicitCheckpointToken?.content?.at(-1)?.line ??
                lastImplicitCheckpointToken?.line;
              if (
                lastImplicitCheckpointToken &&
                lastImplicitCheckpointLine != null &&
                tok.line - lastImplicitCheckpointLine <= 1
              ) {
                // This explicit checkpoint immediately follows an implicit checkpoint (with no blank line between)
                // and thus should override the implicit checkpoint instead of adding a new checkpoint
                lastImplicitCheckpointToken.checkpoint = name;
                lastImplicitCheckpointToken.ranges ??= {};
                lastImplicitCheckpointToken.ranges.checkpoint = {
                  line: tok.line,
                  from: tok.from,
                  to: tok.to,
                };
              } else {
                // Add an explicit checkpoint
                addToken(parent);
              }
            }
          } else if (tok.tag === "import") {
            addToken(tok);
          } else if (tok.tag === "define") {
            addToken(tok);
          } else if (tok.tag === "store") {
            addToken(tok);
          } else if (tok.tag === "declaration_type") {
            const parent = lookup("define", "import");
            if (parent) {
              parent.type = text;
              parent.ranges ??= {};
              parent.ranges.type = {
                line: tok.line,
                from: tok.from,
                to: tok.to,
              };
            }
          } else if (tok.tag === "declaration_name") {
            const parent = lookup("define", "import");
            if (parent) {
              parent.name = text;
              parent.ranges ??= {};
              parent.ranges.name = {
                line: tok.line,
                from: tok.from,
                to: tok.to,
              };
            }
          } else if (tok.tag === "declaration_access_operator") {
            const parent = lookup("define");
            if (parent) {
              parent.access_operator = text;
              parent.ranges ??= {};
              parent.ranges.access_operator = {
                line: tok.line,
                from: tok.from,
                to: tok.to,
              };
            }
          } else if (tok.tag === "declaration_assign_operator") {
            const parent = lookup("define", "store", "assign");
            if (parent) {
              parent.assign_operator = text;
              parent.ranges ??= {};
              parent.ranges.assign_operator = {
                line: tok.line,
                from: tok.from,
                to: tok.to,
              };
            }
          } else if (tok.tag === "value_text") {
            const parent = lookup(
              "struct_scalar_item",
              "struct_scalar_property",
              "define",
              "store",
              "assign",
              "import"
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
          } else if (tok.tag === "struct_field") {
            const parent = lookup("define");
            if (parent) {
              parent.ranges ??= {};
              parent.ranges.value ??= {
                line: tok.line,
                from: tok.from,
                to: tok.to,
              };
              parent.ranges.value.to = tok.to;
            }
          } else if (tok.tag === "struct_map_property") {
            tok.path = path("struct_map_item", "struct_map_property");
            const parent = lookup("define");
            if (parent) {
              parent.content ??= [];
              parent.content.push(tok);
            }
            const mapProperty = lookup("struct_map_property");
            if (mapProperty) {
              mapProperty.entriesLength ??= 0;
              tok.key = String(mapProperty.entriesLength);
              mapProperty.entriesLength += 1;
            } else if (parent) {
              parent.entriesLength ??= 0;
              tok.key = String(parent.entriesLength);
              parent.entriesLength += 1;
            }
            addToken(tok);
          } else if (tok.tag === "struct_map_item") {
            const parent = lookup("define");
            const mapProperty = lookup("struct_map_property");
            if (mapProperty) {
              mapProperty.entriesLength ??= 0;
              tok.key = String(mapProperty.entriesLength);
              mapProperty.entriesLength += 1;
            } else if (parent) {
              parent.entriesLength ??= 0;
              tok.key = String(parent.entriesLength);
              parent.entriesLength += 1;
            }
            tok.path = path("struct_map_item", "struct_map_property");
            addToken(tok);
          } else if (tok.tag === "struct_scalar_item") {
            const parent = lookup("define");
            if (parent) {
              parent.fields ??= [];
              parent.fields.push(tok);
            }
            const mapProperty = lookup("struct_map_property");
            if (mapProperty) {
              mapProperty.entriesLength ??= 0;
              tok.key = String(mapProperty.entriesLength);
              mapProperty.entriesLength += 1;
            } else if (parent) {
              parent.entriesLength ??= 0;
              tok.key = String(parent.entriesLength);
              parent.entriesLength += 1;
            }
            tok.path = path("struct_map_item", "struct_map_property");
            addToken(tok);
          } else if (tok.tag === "struct_scalar_property") {
            const parent = lookup("define");
            if (parent) {
              parent.fields ??= [];
              parent.fields.push(tok);
            }
            const mapProperty = lookup("struct_map_property");
            if (mapProperty) {
              mapProperty.entriesLength ??= 0;
              tok.key = String(mapProperty.entriesLength);
              mapProperty.entriesLength += 1;
            } else if (parent) {
              parent.entriesLength ??= 0;
              tok.key = String(parent.entriesLength);
              parent.entriesLength += 1;
            }
            tok.path = path("struct_map_item", "struct_map_property");
            addToken(tok);
          } else if (tok.tag === "struct_blank_property") {
            tok.path = path("struct_map_item", "struct_map_property");
            const parent = lookup("define");
            if (parent) {
              parent.content ??= [];
              parent.content.push(tok);
            }
            addToken(tok);
          } else if (tok.tag === "declaration_property") {
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
          } else if (tok.tag === "assign") {
            addToken(tok);
          } else if (tok.tag === "delete") {
            addToken(tok);
          } else if (tok.tag === "target_access_path") {
            const parent = lookup("store", "assign", "delete");
            if (parent) {
              parent.name = text;
              parent.ranges ??= {};
              parent.ranges.name = {
                line: tok.line,
                from: tok.from,
                to: tok.to,
              };
            }
          } else if (tok.tag === "access_part") {
            tok.text = text;
            const target_access_path = lookup("target_access_path");
            if (target_access_path) {
              // Push top-level access parts
              const parent = lookup("store", "assign", "delete");
              if (parent) {
                parent.content ??= [];
                parent.content.push(tok);
              }
            }
          } else if (tok.tag === "color") {
            program.metadata ??= {};
            program.metadata.colors ??= [];
            program.metadata.colors?.push({
              line: tok.line,
              from: tok.from,
              to: tok.to,
              value: text,
            });
          } else if (tok.tag === "flow_break") {
            addToken(tok);
          } else if (tok.tag === "jump") {
            addToken(tok);
          } else if (tok.tag === "jump_to_section") {
            const parent = lookup("jump", "choice");
            if (parent) {
              parent.section = text;
              validateSectionReferences(
                tok,
                currentSectionPath.at(-1) || "",
                text,
                tok,
                context
              );
            }
          } else if (tok.tag === "transition") {
            tok.waitUntilFinished = true;
            setCheckpoint(tok);
            addToken(tok);
          } else if (tok.tag === "scene") {
            tok.waitUntilFinished = true;
            setCheckpoint(tok);
            addToken(tok);
          } else if (tok.tag === "action") {
            addToken(tok);
          } else if (tok.tag === "action_start") {
            addToken(tok);
          } else if (tok.tag === "action_end") {
            addToken(tok);
          } else if (tok.tag === "action_box") {
            tok.waitUntilFinished = true;
            setCheckpoint(tok);
            addToken(tok);
          } else if (tok.tag === "dialogue") {
            addToken(tok);
          } else if (tok.tag === "dialogue_start") {
            addToken(tok);
          } else if (tok.tag === "dialogue_end") {
            addToken(tok);
          } else if (tok.tag === "dialogue_character_name" && text) {
            tok.target = "character_name";
            tok.ignore = true;
            tok.text = text;
            const characterKey = getDialogueCharacterKey(text);
            const dialogue = lookup("dialogue");
            if (dialogue) {
              dialogue.characterName = tok;
              dialogue.characterKey = characterKey;
            }
            const dialogue_start = lookup("dialogue_start");
            if (dialogue_start) {
              dialogue_start.print = text;
            }
            const existingCharacterVariable =
              program.variables?.[
                getVariableId({ type: "character", name: characterKey })
              ];
            if (!existingCharacterVariable) {
              const characterTypeVariable = program.variables?.["character"];
              if (
                characterTypeVariable &&
                typeof characterTypeVariable?.compiled === "object"
              ) {
                const clonedCharacterObj = JSON.parse(
                  JSON.stringify(characterTypeVariable.compiled)
                );
                clonedCharacterObj.name = text;
                const characterVariable: SparkVariable = {
                  tag: "character",
                  line: tok.line,
                  from: tok.from,
                  to: tok.to,
                  indent: 0,
                  type: "character",
                  name: characterKey,
                  value: JSON.stringify(clonedCharacterObj),
                  compiled: clonedCharacterObj,
                  implicit: true,
                };
                populateVariableFields(characterVariable);
                declareVariable(characterVariable);
              }
            }
          } else if (tok.tag === "dialogue_character_parenthetical" && text) {
            tok.target = "character_parenthetical";
            tok.ignore = true;
            tok.text = text;
            const dialogue = lookup("dialogue");
            if (dialogue) {
              dialogue.characterParenthetical = tok;
            }
            const dialogue_start = lookup("dialogue_start");
            if (dialogue_start) {
              dialogue_start.print += " " + text;
            }
          } else if (tok.tag === "dialogue_character_simultaneous" && text) {
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
          } else if (tok.tag === "dialogue_box") {
            tok.waitUntilFinished = true;
            setCheckpoint(tok);
            addToken(tok);
            const parent = lookup("dialogue");
            if (parent) {
              tok.content ??= [];
              if (parent.characterName) {
                tok.content.push(parent.characterName);
              }
              if (parent.characterParenthetical) {
                tok.content.push(parent.characterParenthetical);
              }
              tok.position = parent.position;
              tok.characterKey = parent.characterKey;
              tok.characterName = parent.characterName;
              tok.characterParenthetical = parent.characterParenthetical;
            }
          } else if (tok.tag === "dialogue_line_parenthetical") {
            tok.target = "parenthetical";
            tok.speed = 0;
            tok.text = text;
            tok.print = text;
            const parent = lookup("dialogue_box");
            if (parent) {
              parent.content ??= [];
              parent.content.push(tok);
            }
          } else if (tok.tag === "display_text_prerequisite_value") {
            const parent = lookup("display_text");
            if (parent) {
              parent.prerequisite = text;
            }
          } else if (tok.tag === "display_text_target") {
            const parent = lookup("display_text");
            if (parent) {
              parent.target = text;
            }
          } else if (tok.tag === "display_text_content") {
            formatAndValidate(
              tok,
              text,
              { line: tok.line, from: tok.from, to: tok.to },
              context
            );
            const parent = lookup("display_text");
            if (parent) {
              parent.text = text;
            }
          } else if (tok.tag === "text") {
            tok.text = text;
            const parent = lookup(
              "choice",
              "action_box",
              "dialogue_box",
              "transition",
              "scene"
            );
            if (parent) {
              parent.content ??= [];
              parent.content.push(tok);
            }
            const display_text = lookup("display_text");
            if (display_text) {
              if (display_text.prerequisite) {
                tok.prerequisite = display_text.prerequisite;
                tok.target = display_text.target;
              }
            }
          } else if (tok.tag === "image") {
            tok.target = id === "InlineImage" ? "insert" : "portrait";
            const parent = lookup("dialogue_box", "action_box");
            if (parent) {
              parent.content ??= [];
              parent.content.push(tok);
            }
          } else if (tok.tag === "audio") {
            tok.target = "InlineAudio" ? "sound" : "voice";
            const parent = lookup("dialogue_box", "action_box");
            if (parent) {
              parent.content ??= [];
              parent.content.push(tok);
            }
          } else if (tok.tag === "asset_target") {
            const parent = lookup("image", "audio");
            if (parent) {
              parent.target = text;
              parent.ranges ??= {};
              parent.ranges.target = {
                line: tok.line,
                from: tok.from,
                to: tok.to,
              };
            }
          } else if (tok.tag === "asset_names") {
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
          } else if (tok.tag === "asset_args") {
            const parent = lookup("image", "audio");
            if (parent) {
              parent.args = [];
              text.split(WHITESPACE_REGEX).forEach((p) => {
                const arg = p.trim();
                if (arg) {
                  parent.args.push(arg);
                }
              });
              parent.ranges ??= {};
              parent.ranges.args = {
                line: tok.line,
                from: tok.from,
                to: tok.to,
              };
            }
          } else if (tok.tag === "indent") {
            const parent = lookup();
            if (parent) {
              parent.indent = calculateIndent(text);
            }
          } else if (tok.tag === "unknown") {
            const parent = lookup("define");
            diagnostic(
              program,
              tok,
              parent ? `Invalid ${parent.tag} syntax` : `Invalid syntax`,
              undefined,
              tok.from,
              tok.to
            );
          }

          // push token onto current stack
          stack.push(tok);

          if (
            tok.tag !== "newline" &&
            tok.tag !== "punctuation_paren_close" &&
            tok.tag !== "struct_field"
          ) {
            program.metadata.lines ??= [];
            program.metadata.lines[line] ??= {};
            program.metadata.lines[line]!.scopes = stack.map((s) => s.tag);
          }
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
          } else if (tok.tag === "chunk") {
            prevDisplayPositionalTokens.length = 0;
          } else if (tok.tag === "section") {
            prevDisplayPositionalTokens.length = 0;
          } else if (tok.tag === "flow_break") {
            prevDisplayPositionalTokens.length = 0;
          } else if (tok.tag === "import") {
            prevDisplayPositionalTokens.length = 0;
            // Compile value
            const compiledValue = compileAndValidate(
              tok,
              tok.value,
              tok?.ranges?.value,
              context
            );
            tok.compiled = compiledValue;

            validateTypeExists(tok, tok.type, tok.ranges?.type);
            tok.type ??= "url";

            if (
              typeof compiledValue !== "string" ||
              !compiledValue.startsWith("https://")
            ) {
              diagnostic(
                program,
                tok,
                `Invalid url`,
                undefined,
                tok?.ranges?.value?.from,
                tok?.ranges?.value?.to
              );
            }

            if (validateDeclaration(tok)) {
              declareVariable(tok);
            }
          } else if (tok.tag === "struct_map_property") {
            if (!tok.entriesLength) {
              const struct_empty_property = createSparkToken(
                "struct_empty_property",
                {
                  line: tok.line,
                  from: tok.from,
                  to: tok.to,
                  indent: tok.indent,
                }
              );
              struct_empty_property.path = path(
                "struct_map_item",
                "struct_map_property"
              );
              struct_empty_property.value = "{}";
              addToken(struct_empty_property);
              const parent = lookup("define");
              if (parent) {
                parent.fields ??= [];
                parent.fields.push(struct_empty_property);
              }
            }
          } else if (tok.tag === "struct_field") {
            const parent = lookup("define");
            if (parent) {
              program.metadata ??= {};
              program.metadata.lines ??= [];
              program.metadata.lines[tok.line] ??= {};
              program.metadata.lines[tok.line]!.struct = parent.name;
            }
          } else if (tok.tag === "define") {
            prevDisplayPositionalTokens.length = 0;
            const scopedParent = lookup(
              "if",
              "elseif",
              "else",
              "while",
              "for",
              "until"
            );
            if (scopedParent) {
              diagnostic(
                program,
                tok,
                `Cannot define variable inside ${scopedParent.tag} scope`,
                undefined,
                tok.from,
                tok.to
              );
            } else {
              if (PRIMITIVE_SCALAR_TYPES.includes(tok.type)) {
                if (
                  tok.assign_operator === ":" ||
                  (tok.fields && tok.fields.length > 0)
                ) {
                  diagnostic(
                    program,
                    tok,
                    `Cannot assign an object to a '${tok.type}'`,
                    undefined,
                    tok?.ranges?.type?.from,
                    tok?.ranges?.type?.to
                  );
                } else {
                  if (tok.type === "string") {
                    tok.value = `""`;
                  }
                  if (tok.type === "number") {
                    tok.value = "0";
                  }
                  if (tok.type === "boolean") {
                    tok.value = "false";
                  }
                  const compiledValue = compileAndValidate(
                    tok,
                    tok.value,
                    tok.ranges?.value,
                    context
                  );
                  tok.compiled = compiledValue;
                }
              } else {
                if (tok.value) {
                  tok.compiled = compileAndValidate(
                    tok,
                    tok.value,
                    tok.ranges?.value,
                    context
                  );
                } else {
                  if (tok.fields) {
                    const propertyPaths: Record<string, SparkField> = {};
                    tok.fields.forEach((field) => {
                      const propAccess = field.key ? "." + field.key : "";
                      const propertyPath = field.path + propAccess;
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
                          context
                        );
                        field.compiled = compiledValue;
                        if (tok.type) {
                          // Check for type mismatch
                          const parentPropertyAccessor =
                            tok.type + "." + propertyPath;
                          const declaredValue = getProperty(
                            context,
                            parentPropertyAccessor
                          );
                          const compiledType = typeof compiledValue;
                          const declaredType = typeof declaredValue;
                          if (
                            compiledValue != null &&
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
                  const [objectLiteral, objCompiled] = construct(tok);
                  tok.value = objectLiteral;
                  tok.compiled = objCompiled;
                }
                validateTypeMatch(
                  tok,
                  typeof tok.compiled,
                  tok.type,
                  tok?.ranges?.type
                );
              }
              if (tok.compiled != null) {
                tok.type ??=
                  typeof tok.compiled === "object"
                    ? "type"
                    : typeof tok.compiled;
                if (
                  (tok.access_operator || tok.assign_operator) &&
                  validateDeclaration(tok)
                ) {
                  declareVariable(tok);
                }
              }
            }
          } else if (tok.tag === "store") {
            prevDisplayPositionalTokens.length = 0;
            const scopedParent = lookup(
              "if",
              "elseif",
              "else",
              "while",
              "for",
              "until"
            );
            if (scopedParent) {
              diagnostic(
                program,
                tok,
                `Cannot store variable inside ${scopedParent.tag} scope`,
                undefined,
                tok.from,
                tok.to
              );
            } else {
              if (tok.value) {
                tok.compiled = compileAndValidate(
                  tok,
                  tok.value,
                  tok.ranges?.value,
                  context
                );
              }
              const existingVariable = program.variables?.[getVariableId(tok)];
              if (existingVariable) {
                tok.type = existingVariable.type;
              } else if (
                tok.assign_operator &&
                !tok.name.includes(".") &&
                validateDeclaration(tok)
              ) {
                tok.type = typeof tok.compiled;
                declareVariable(tok);
              } else {
                const declaredValue = compileAndValidate(
                  tok,
                  tok.name,
                  tok?.ranges?.name,
                  context
                );
                const declaredType = typeof declaredValue;
                tok.type = declaredType;
                validateAssignment(tok, declaredValue);
              }
              validateTypeMatch(
                tok,
                typeof tok.compiled,
                tok.type,
                tok?.ranges?.type
              );
              program.stored ??= [];
              program.stored.push(tok.name);
            }
          } else if (tok.tag === "assign") {
            const declaredValue = compileAndValidate(
              tok,
              tok.name,
              tok?.ranges?.name,
              context
            );
            // Validate value
            const compiledValue = compileAndValidate(
              tok,
              tok.value,
              tok?.ranges?.value,
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
            tok.type = declaredType;
            validateAssignment(tok, declaredValue);
          } else if (tok.tag === "delete") {
            const declaredValue = compileAndValidate(
              tok,
              tok.name,
              tok?.ranges?.name,
              context
            );
            const declaredType = typeof declaredValue;
            tok.type = declaredType;
          } else if (tok.tag === "image") {
            const nameRanges = tok.nameRanges;
            if (nameRanges) {
              nameRanges.forEach((nameRange) => {
                const name = script.slice(nameRange.from, nameRange.to);
                validateAssetReference(tok, "image", name, nameRange);
              });
            }
          } else if (tok.tag === "audio") {
            const nameRanges = tok.nameRanges;
            if (nameRanges) {
              nameRanges.forEach((nameRange) => {
                const name = script.slice(nameRange.from, nameRange.to);
                validateAssetReference(tok, "audio", name, nameRange);
              });
            }
          } else if (tok.tag === "choice") {
            const lastBox = search("action_box", "dialogue_box");
            if (lastBox) {
              const text =
                tok.content?.map((c) => c.text || "")?.join("") || "";
              const choices = tok.content?.filter((c) => c.target === "choice");
              const choiceId = String(choices?.length);
              lastBox.content ??= [];
              lastBox.content.push({
                tag: "choice",
                line: tok.line,
                from: tok.from,
                to: tok.to,
                indent: tok.indent,
                target: "choice",
                speed: 0,
                text,
                args: [tok.section, choiceId],
              });
            }
          } else if (tok.tag === "transition") {
            prevDisplayPositionalTokens.length = 0;
          } else if (tok.tag === "scene") {
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
          } else if (tok.tag === "action") {
            prevDisplayPositionalTokens.length = 0;
          } else if (tok.tag === "action_box") {
            const textContent = tok.content?.filter((p) => p.tag === "text");
            if (!textContent || textContent.length === 0) {
              // Check for images or audio not associated with any box text
              tok.content?.forEach((p) => {
                if (p.audio) {
                  // Assume playing standalone music
                  p.target = "music";
                }
                if (p.image) {
                  //Assume displaying standalone image
                  p.target = "backdrop";
                }
              });
              // No text to display, so no need to wait for user input
              tok.waitUntilFinished = false;
              tok.autoAdvance = true;
            } else {
              tok.waitUntilFinished = true;
              tok.autoAdvance = false;
            }
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
          } else if (tok.tag === "dialogue_box") {
            prevDisplayPositionalTokens.push(tok);
            // Check if no text content
            const textContent = tok.content?.filter((p) => p.tag === "text");
            if (!textContent || textContent.length === 0) {
              // No text to display, so no need to wait for user input
              tok.waitUntilFinished = false;
              tok.autoAdvance = true;
            } else {
              tok.waitUntilFinished = true;
              tok.autoAdvance = false;
            }
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
          } else if (tok.tag === "dialogue") {
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
          } else if (tok.tag === "dialogue_character_simultaneous") {
            const dialogue = lookup("dialogue");
            if (dialogue) {
              prevDisplayPositionalTokens.length = 0;
              prevDisplayPositionalTokens.push(dialogue);
            }
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
        if (!program.metadata.lines[tok.line]!.tokens?.includes(tokenIndex)) {
          program.metadata.lines[tok.line]!.tokens!.push(tokenIndex);
        }
        if (tok.content) {
          tok.content.forEach((c) => {
            program.metadata ??= {};
            program.metadata.lines ??= [];
            program.metadata.lines[c.line] ??= {};
            program.metadata.lines[c.line]!.tokens ??= [];
            if (!program.metadata.lines[c.line]!.tokens?.includes(tokenIndex)) {
              program.metadata.lines[c.line]!.tokens!.push(tokenIndex);
            }
          });
        }
      });
    });

    const parseEndTime = Date.now();
    program.metadata ??= {};
    program.metadata.parseTime = parseEndTime;
    program.metadata.parseDuration = parseEndTime - parseStartTime;

    // console.log(program);

    return program;
  }

  parse(script: string, config?: SparkParserConfig): SparkProgram {
    // Pad script with newline to ensure any open scopes are closed by the end of the script.
    let paddedScript = script + "\n";
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
    let parseConfig = config
      ? {
          ...this.config,
          ...config,
        }
      : this.config;
    return this.build(script, tree, parseConfig);
  }
}

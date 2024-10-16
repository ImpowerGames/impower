import { Tree } from "../../../grammar-compiler/src/compiler";
import GRAMMAR_DEFINITION from "../../language/sparkdown.language-grammar.json";
import PRIMITIVE_TYPES from "../constants/PRIMITIVE_TYPES";
import RESERVED_KEYWORDS from "../constants/RESERVED_KEYWORDS";
import SPARK_TOKEN_TAGS from "../constants/SPARK_TOKEN_TAGS";
import { CompilerDiagnostic } from "../types/CompilerDiagnostic";
import { ISparkToken } from "../types/ISparkToken";
import { SparkAction } from "../types/SparkDiagnostic";
import { SparkField } from "../types/SparkField";
import { SparkProgram } from "../types/SparkProgram";
import { SparkRange } from "../types/SparkRange";
import {
  ISparkDeclarationToken,
  SparkAssignToken,
  SparkCheckpointToken,
  SparkChunkToken,
  SparkDefineToken,
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
import buildSVGSource from "./buildSVGSource";
import calculateIndent from "./calculateIndent";
import calculateSpeechDuration from "./calculateSpeechDuration";
import createSparkToken from "./createSparkToken";
import declareVariable from "./declareVariable";
import getArticle from "./getArticle";
import getDialogueCharacterKey from "./getDialogueCharacterKey";
import getProperty from "./getProperty";
import getRelativeSectionName from "./getRelativeSectionName";
import getVariableId from "./getVariableId";
import populateVariableFields from "./populateVariableFields";
import prefixWithArticle from "./prefixWithArticle";
import setProperty from "./setProperty";
import traverse from "./traverse";

const COMBINE_OPERATOR_REGEX = /([~+-]+)/;
const NEWLINE_REGEX = /(\r\n|\r|\n)/;

const DOUBLE_ESCAPE = /\\\\/g;
const UNESCAPED_DOUBLE_QUOTE = /(?<!\\)["]/g;
const ESCAPED_DOUBLE_QUOTE = /\\["]/g;

const NAMESPACE_REGEX =
  /^(?:([_\p{L}][_\p{L}0-9]*)[.])?([_\p{L}][_\p{L}0-9]*)$/u;

const SCENE_LOCATION_TIME_REGEX = new RegExp(
  `^${GRAMMAR_DEFINITION.repository.SceneLocationTime.match}$`,
  GRAMMAR_DEFINITION.flags
);

const populateProgram = (
  program: SparkProgram,
  script: string,
  nodeNames: SparkdownNodeName[],
  compiler: (
    expr: string,
    context: Record<string, unknown> | undefined
  ) => [unknown, CompilerDiagnostic[], CompilerDiagnostic[]],
  formatter: (
    str: string,
    context: Record<string, unknown> | undefined
  ) => [string, CompilerDiagnostic[], CompilerDiagnostic[]],
  buildTree: (script: string) => Tree,
  readFile?: (path: string) => string
) => {
  const tree = buildTree(script);

  const stack: SparkToken[] = [];

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
  program.metadata ??= {};
  program.metadata.structure = {
    "": rootStructure,
  };

  const structure: StructureItem[] = [rootStructure];

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
    const currentSection = program.sections?.[currentSectionName];
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
    const currentSection = program.sections?.[currentSectionName];
    if (currentSection) {
      currentSection.tokens ??= [];
      currentSection.tokens.push(tok);
    }
  };

  const getCurrentSection = () => {
    const currentSectionName = currentSectionPath.at(-1) || "";
    const currentSection = program.sections?.[currentSectionName];
    return currentSection;
  };

  const declareImplicitVariable = (
    tok: ISparkToken,
    type: string,
    name: string,
    inheritFrom: string,
    propOverrides?: Record<string, unknown>
  ) => {
    const existingVariable = program.variables?.[getVariableId({ type, name })];
    if (!existingVariable) {
      const defaultObj = program.context?.[type]?.[inheritFrom];
      const clonedDefaultObj = defaultObj
        ? JSON.parse(JSON.stringify(defaultObj))
        : {};
      if (propOverrides) {
        Object.entries(propOverrides).forEach(([key, value]) => {
          clonedDefaultObj[key] = value;
        });
      }
      const variable: SparkVariable = {
        tag: type,
        line: tok.line,
        from: tok.from,
        to: tok.to,
        indent: 0,
        type,
        name,
        id: type + "." + name,
        compiled: clonedDefaultObj,
        implicit: true,
      };
      populateVariableFields(variable);
      declareVariable(program, variable);
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
          Number.isInteger(Number(field.key));
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
      (!firstField?.path && Number.isInteger(Number(firstField?.key)));
    const objValue = isArray ? [] : {};
    const objCompiled = isArray ? [] : {};
    _construct(variable, objValue, objCompiled);
    const objectLiteral = JSON.stringify(objValue)
      .replace(UNESCAPED_DOUBLE_QUOTE, "")
      .replace(ESCAPED_DOUBLE_QUOTE, `"`)
      .replace(DOUBLE_ESCAPE, `\\`);
    return [objectLiteral, objCompiled];
  };

  const validateFields = (variable: SparkVariable) => {
    if (variable.fields) {
      const propertyPaths: Record<string, SparkField> = {};
      variable.fields.forEach((field) => {
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
          const compiledValue = compileAndValidateExpression(
            field,
            field.value,
            field?.ranges?.value,
            program.context
          );
          field.compiled = compiledValue;
          if (variable.type) {
            // Check for type mismatch
            const parentPropertyAccessor =
              variable.type +
              "." +
              (propertyPath.startsWith(".")
                ? "default" + propertyPath
                : propertyPath);
            const declaredValue = getProperty(
              program.context,
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

  const validateSectionReferences = (
    tok: ISparkToken,
    currentSectionName: string,
    expression: string,
    expressionRange: SparkRange,
    context: Record<string, unknown> | undefined
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

  const getUIElementNames = () => {
    const names = new Set<string>();
    Object.entries(program?.context?.["ui"] || {}).forEach(([, v]) => {
      traverse(v, (fieldPath) => {
        const elements = fieldPath.split(".");
        elements.forEach((element) => {
          if (!element.startsWith("$")) {
            names.add(element);
          }
        });
      });
    });
    return names;
  };

  const validateAssetTarget = (
    tok: ISparkToken,
    type: string,
    name: string,
    nameRange: SparkRange | undefined
  ) => {
    if (!name) {
      return undefined;
    }
    if (type === "audio") {
      if (!program?.context?.["channel"]?.[name]) {
        reportMissing(tok, "channel", name, nameRange, "warning");
      }
    }
    if (type === "image") {
      const imageTargets = getUIElementNames();
      if (!imageTargets.has(name)) {
        reportMissing(tok, "ui element", name, nameRange, "warning");
      }
    }
  };

  const validateAssetName = (
    tok: ISparkToken,
    type: string,
    name: string,
    nameRange: SparkRange | undefined
  ) => {
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

    if (type === "audio") {
      if (
        !program?.context?.["audio"]?.[name] &&
        !program?.context?.["layered_audio"]?.[name] &&
        !program?.context?.["synth"]?.[name]
      ) {
        reportMissing(tok, type, name, nameRange, "warning");
      }
    }
    if (type === "image") {
      if (
        !program?.context?.["image"]?.[name] &&
        !program?.context?.["layered_image"]?.[name]
      ) {
        reportMissing(tok, type, name, nameRange, "warning");
      }
    }
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
          const to = Math.min(expressionRange.to, expressionRange.from + d.to);
          diagnostic(program, tok, d.message, undefined, from, to);
        }
      }
    }
  };

  const formatAndValidate = (
    tok: ISparkToken,
    value: string,
    valueRange: SparkRange | undefined,
    context: Record<string, unknown> | undefined
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
    expr: string,
    exprRange: SparkRange | undefined,
    context: Record<string, unknown> | undefined
  ) => {
    const [compiledValue, valueDiagnostics, valueReferences] = compiler(
      expr,
      context
    );
    recordExpressionReferences(tok, exprRange?.from, valueReferences);
    reportExpressionDiagnostics(tok, exprRange, valueDiagnostics);
    return compiledValue;
  };

  const compileAndValidateExpression = (
    tok: ISparkToken,
    expr: string,
    exprRange: SparkRange | undefined,
    context: Record<string, unknown> | undefined
  ) => {
    if (!expr) {
      diagnostic(
        program,
        tok,
        "Expression expected.",
        undefined,
        tok.to,
        tok.to
      );
      return undefined;
    }
    return compileAndValidate(tok, expr, exprRange, context);
  };

  const compileAndValidateIdentifier = (
    tok: ISparkToken,
    expr: string,
    exprRange: SparkRange | undefined,
    context: Record<string, unknown> | undefined
  ) => {
    if (!expr || expr.trim().endsWith(".")) {
      diagnostic(
        program,
        tok,
        "Identifier expected.",
        undefined,
        tok.to,
        tok.to
      );
      return undefined;
    }
    return compileAndValidate(tok, expr, exprRange, context);
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

  const reportTypeMismatch = (
    tok: ISparkToken,
    compiledType: string,
    declaredType: string,
    assignedRange?: SparkRange,
    declaredRange?: SparkRange,
    severity?: "error" | "warning" | "info"
  ) => {
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
      `Cannot assign ${getArticle(
        compiledType
      )} '${compiledType}' to ${getArticle(
        declaredType
      )} '${declaredType}' variable`,
      actions,
      assignedRange?.from,
      assignedRange?.to,
      severity
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
    if (!declaredType) {
      return true;
    }
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
      reportTypeMismatch(
        tok,
        compiledType,
        declaredType,
        assignedRange,
        declaredRange
      );
      return false;
    }
    return true;
  };

  const validateAssignment = (
    tok: SparkDefineToken | SparkStoreToken | SparkAssignToken
  ) => {
    if (!tok.operator) {
      compileAndValidateIdentifier(
        tok,
        tok.name,
        tok?.ranges?.name,
        program.context
      );
      return;
    }
    const [declaredValue] = compiler(tok.name, program.context);
    // Validate accessor
    if (
      !tok.name?.endsWith(".") &&
      !tok.name?.endsWith("]") &&
      declaredValue === undefined
    ) {
      const parts = tok.name?.split(".");
      const objPath = parts.slice(0, -1).join(".");
      const key = parts.at(-1);
      diagnostic(
        program,
        tok,
        `Property '${key}' does not exist in ${objPath}`,
        undefined,
        (tok?.ranges?.name?.from ?? tok.from) + objPath.length + 1,
        tok?.ranges?.name?.to
      );
      return;
    }
    const [compiledValue] = compiler(tok.value, program.context);
    if (
      !validateTypeMatch(
        tok,
        typeof compiledValue,
        typeof declaredValue,
        tok?.ranges?.name
      )
    ) {
      return;
    }
    tok.compiled = compiledValue;
    // Validate assignment
    const assignmentRange = {
      line: tok.line,
      from: tok?.ranges?.name?.from ?? tok.from,
      to: tok?.ranges?.value?.to ?? tok.to,
    };
    const assignmentExpression = script.slice(
      assignmentRange.from,
      assignmentRange.to
    );
    compileAndValidateExpression(
      tok,
      assignmentExpression,
      assignmentRange,
      program.context
    );
  };

  const validateDeclarationAllowed = (
    tok: ISparkToken,
    name: string,
    nameRange?: SparkRange
  ): boolean => {
    if (RESERVED_KEYWORDS.includes(name)) {
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

  /* HOIST FRONTMATTER, CHUNKS, SECTIONS, AND IMPLICIT VARIABLES */
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
        } else if (tok.tag === "front_matter_field_item") {
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
        } else if (tok.tag === "front_matter_field_string") {
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
        else if (tok.tag === "chunk_name") {
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
        else if (tok.tag === "section_level") {
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
        } else if (tok.tag === "section_name") {
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
        else if (tok.tag === "text") {
          tok.text = text;
          const parent = lookup("scene");
          if (parent) {
            parent.content ??= [];
            parent.content.push(tok);
          }
        } else if (tok.tag === "indent") {
          const parent = lookup();
          if (parent) {
            parent.indent = calculateIndent(text);
          }
        }

        // character
        else if (tok.tag === "dialogue_character_name" && text) {
          const characterKey = getDialogueCharacterKey(text);
          declareImplicitVariable(tok, "character", characterKey, "default", {
            name: text,
          });
          declareImplicitVariable(tok, "synth", characterKey, "character");
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
          const chunk = {
            tag: "chunk",
            line: tok.line,
            from: tok.from,
            to: tok.to,
            indent: 0,
            name: tok.name,
            id: tok.name,
          };
          if (validateDeclaration(tok)) {
            currentSectionPath = [];
            program.chunks ??= {};
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
          const currentSectionName = currentSectionPath.at(-1) || "";
          const currentSection = program.sections?.[currentSectionName]!;
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
          const parentSection = program.sections?.[parentSectionName];
          if (validateDeclaration(tok)) {
            currentSectionPath = [...parentSectionPath, tok.name];
            program.sections ??= {};
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
              id: "visited" + "." + tok.name,
              tokens: [],
            };
            program.context ??= {};
            program.context["visited"] ??= {};
            program.context["visited"]![tok.name] = 0;
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

  const currentSectionCheckpoints = new Set<string>();

  const setCheckpoint = (
    tok: SparkCheckpointToken | SparkDisplayToken,
    checkpointId?: string
  ) => {
    const checkpointIndex = currentSectionCheckpoints.size;
    const currentSectionName = currentSectionPath.at(-1) || "";
    const checkpoint =
      checkpointId ?? currentSectionName + "." + String(checkpointIndex);
    tok.id = checkpoint;
    currentSectionCheckpoints.add(checkpoint);
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
          const currentSection = program.sections?.[currentSectionName];
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
              lastImplicitCheckpointToken.id = name;
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
          const parent = lookup("import");
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
          const parent = lookup("import");
          if (parent) {
            parent.name = text;
            parent.ranges ??= {};
            parent.ranges.name = {
              line: tok.line,
              from: tok.from,
              to: tok.to,
            };
          }
        } else if (tok.tag === "declaration_assign_operator") {
          const parent = lookup("define", "store", "assign");
          if (parent) {
            parent.operator = text;
            parent.ranges ??= {};
            parent.ranges.operator = {
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
          const parent = lookup("define", "store", "assign", "delete");
          if (parent) {
            parent.name = text;
            parent.ranges ??= {};
            parent.ranges.name = {
              line: tok.line,
              from: tok.from,
              to: tok.to,
            };
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
        } else if (tok.tag === "jump") {
          addToken(tok);
        } else if (tok.tag === "jump_to_section") {
          const parent = lookup("jump", "choice");
          if (parent) {
            parent.section = text;
            parent.ranges ??= {};
            parent.ranges!.section = {
              line: tok.line,
              from: tok.from,
              to: tok.to,
            };
            validateSectionReferences(
              tok,
              currentSectionPath.at(-1) || "",
              text,
              tok,
              program.context
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
        } else if (tok.tag === "action_box") {
          tok.waitUntilFinished = true;
          setCheckpoint(tok);
          addToken(tok);
        } else if (tok.tag === "dialogue") {
          addToken(tok);
        } else if (tok.tag === "dialogue_character_name" && text) {
          tok.target = "character_name";
          tok.text = text;
          const characterKey = getDialogueCharacterKey(text);
          const dialogue = lookup("dialogue");
          if (dialogue) {
            dialogue.characterName = tok;
            dialogue.characterKey = characterKey;
          }
        } else if (tok.tag === "dialogue_character_parenthetical" && text) {
          tok.target = "character_parenthetical";
          tok.text = text;
          const dialogue = lookup("dialogue");
          if (dialogue) {
            dialogue.characterParenthetical = tok;
          }
        } else if (tok.tag === "dialogue_character_simultaneous" && text) {
          const dialogue = lookup("dialogue");
          const prevDialogueTokens: (
            | SparkDialogueToken
            | SparkDialogueBoxToken
          )[] = [];
          const currentSection = getCurrentSection();
          if (currentSection) {
            // Search backwards for the dialogue immediately preceding this one
            let prevPosition: number = 0;
            for (let i = currentSection.tokens.length - 1; i >= 0; i -= 1) {
              const token = currentSection.tokens[i];
              if (token?.tag === "dialogue" || token?.tag === "dialogue_box") {
                if (token !== dialogue) {
                  token.autoAdvance = true;
                  prevDialogueTokens.unshift(token);
                  if (token.tag === "dialogue") {
                    prevPosition = token.position ?? 0;
                    break;
                  }
                }
              } else {
                break;
              }
            }
            if (dialogue) {
              // If a spot was not assigned for the previous character, move them to the left
              // and display this character on the right.
              prevDialogueTokens.forEach((t) => {
                if (!t.position) {
                  t.position = 1;
                }
                prevPosition = t.position;
              });
              dialogue.position = prevPosition + 1;
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
            if (parent.position !== undefined) {
              tok.position = parent.position;
            }
            if (parent.characterKey !== undefined) {
              tok.characterKey = parent.characterKey;
            }
            if (parent.characterName !== undefined) {
              tok.characterName = parent.characterName;
            }
            if (parent.characterParenthetical !== undefined) {
              tok.characterParenthetical = parent.characterParenthetical;
            }
          }
        } else if (tok.tag === "dialogue_line_parenthetical") {
          tok.target = "parenthetical";
          tok.text = text;
          const parent = lookup("dialogue_box");
          if (parent) {
            parent.content ??= [];
            parent.content.push(tok);
          }
        } else if (tok.tag === "target_name") {
          const parent = lookup("display_text");
          if (parent) {
            parent.target = text;
          }
        } else if (tok.tag === "text") {
          const parent = lookup(
            "choice",
            "spec",
            "action_box",
            "dialogue_box",
            "transition",
            "scene"
          );
          formatAndValidate(
            tok,
            text,
            { line: tok.line, from: tok.from, to: tok.to },
            program.context
          );
          tok.text = text;
          const display_text = lookup("display_text");
          if (display_text) {
            display_text.text = text;
            if (display_text.target) {
              tok.target = display_text.target;
            } else {
              tok.target =
                parent?.tag === "dialogue_box"
                  ? "dialogue"
                  : parent?.tag === "action_box"
                  ? "action"
                  : parent?.tag;
            }
          }
          if (parent) {
            parent.content ??= [];
            const lastContent = parent.content.at(-1);
            if (
              lastContent &&
              lastContent.tag === "text" &&
              lastContent.target === tok.target &&
              !NEWLINE_REGEX.test(tok.text) &&
              !NEWLINE_REGEX.test(lastContent.text || "")
            ) {
              lastContent.text += tok.text;
            } else {
              parent.content.push(tok);
            }
            parent.ranges ??= {};
            parent.ranges!.text ??= {
              line: tok.line,
              from: tok.from,
              to: tok.to,
            };
            parent.ranges!.text.to = tok.to;
          }
        } else if (tok.tag === "image_tag") {
          const parent = lookup("spec", "dialogue_box", "action_box");
          if (parent) {
            parent.content ??= [];
            parent.content.push(tok);
          }
          addToken(tok);
        } else if (tok.tag === "audio_tag") {
          const parent = lookup("spec", "dialogue_box", "action_box");
          if (parent) {
            parent.content ??= [];
            parent.content.push(tok);
          }
          addToken(tok);
        } else if (tok.tag === "asset_tag_control") {
          const parent = lookup("image_tag", "audio_tag");
          if (parent) {
            parent.control = text;
            parent.ranges ??= {};
            parent.ranges.control = {
              line: tok.line,
              from: tok.from,
              to: tok.to,
            };
          }
        } else if (tok.tag === "asset_tag_target") {
          const parent = lookup("image_tag", "audio_tag");
          if (parent) {
            parent.target = text;
            parent.ranges ??= {};
            parent.ranges.target = {
              line: tok.line,
              from: tok.from,
              to: tok.to,
            };
            validateAssetTarget(tok, parent.tag, text, parent.ranges.target);
          }
        } else if (tok.tag === "asset_tag_names") {
          const parent = lookup("image_tag", "audio_tag");
          if (parent) {
            const assetGroups: {
              name: string;
              range: SparkRange;
              filters: {
                $name: string;
                includes?: string[];
                excludes?: string[];
                range: SparkRange;
              }[];
            }[] = [];
            let trimmedText = text;
            let from = tok.from;
            while (trimmedText[0] === " " || trimmedText[0] === "\t") {
              trimmedText = trimmedText.slice(1);
              from += 1;
            }
            const parts = trimmedText.split(COMBINE_OPERATOR_REGEX);
            let prevOperator = "";
            parts.forEach((p) => {
              const name = p.trim();
              if (name) {
                if (COMBINE_OPERATOR_REGEX.test(name)) {
                  prevOperator = name;
                } else {
                  if (prevOperator === "~") {
                    // name is filter
                    const filterType = "filter";
                    const filter = program.context?.[filterType]?.[name];
                    const asset = assetGroups.at(-1);
                    if (asset) {
                      if (filter) {
                        if (!filter.includes || filter.includes.length === 0) {
                          filter.includes ??= [];
                          filter.includes.push(name);
                        }
                        asset.filters.push({
                          ...filter,
                          range: {
                            line: tok.line,
                            from,
                            to: from + p.length,
                          },
                        });
                      } else {
                        asset.filters.push({
                          $name: name,
                          includes: [name],
                          range: {
                            line: tok.line,
                            from,
                            to: from + p.length,
                          },
                        });
                      }
                    }
                  } else {
                    // name is asset
                    assetGroups.push({
                      name,
                      range: {
                        line: tok.line,
                        from,
                        to: from + p.length,
                      },
                      filters: [],
                    });
                  }
                  prevOperator = "";
                }
              }
              from += p.length;
            });
            const assetRanges: {
              name: string;
              range: SparkRange;
            }[] = assetGroups.map((a) => {
              if (a.filters.length > 0) {
                if (parent.tag === "image_tag") {
                  const asset = program.context?.["image"]?.[a.name];
                  if (asset && asset.ext === "svg" && asset.text) {
                    const includes = a.filters
                      .flatMap((f) => f.includes)
                      .filter((s) => typeof s === "string") as string[];
                    includes.push("default");
                    const excludes = a.filters
                      .flatMap((f) => f.excludes)
                      .filter((s) => typeof s === "string") as string[];
                    const filter = { includes, excludes };
                    const filteredAssetName = [
                      a.name,
                      ...a.filters.map((f) => f.$name),
                    ].join("~");
                    declareImplicitVariable(
                      tok,
                      "image",
                      filteredAssetName,
                      "default",
                      {
                        ext: "svg",
                        type: "image",
                        name: filteredAssetName,
                        src: buildSVGSource(asset.text, filter),
                      }
                    );
                    return {
                      name: filteredAssetName,
                      range: {
                        ...a.range,
                        to: a.filters?.at(-1)?.range?.to ?? a.range.to,
                      },
                    };
                  }
                }
              }
              return { name: a.name, range: a.range };
            });
            parent.assets = assetRanges.map((a) => a.name);
            assetRanges.forEach((a) => {
              validateAssetName(tok, parent.tag, a.name, a.range);
            });
            parent.ranges ??= {};
            parent.ranges.assets = {
              line: tok.line,
              from: tok.from,
              to: tok.to,
            };
          }
        } else if (tok.tag === "asset_tag_arguments") {
          const parent = lookup("image_tag", "audio_tag");
          if (parent) {
            parent.ranges ??= {};
            parent.ranges.args = {
              line: tok.line,
              from: tok.from,
              to: tok.to,
            };
          }
        } else if (tok.tag === "asset_tag_argument") {
          const parent = lookup("image_tag", "audio_tag");
          if (parent) {
            const arg = text.trim();
            if (arg) {
              parent.args ??= [];
              parent.args.push(arg);
            }
          }
        } else if (tok.tag === "command_tag") {
          addToken(tok);
        } else if (tok.tag === "command_tag_control") {
          const command_tag = lookup("command_tag");
          if (command_tag) {
            command_tag.control = text;
            command_tag.ranges ??= {};
            command_tag.ranges.control = {
              line: tok.line,
              from: tok.from,
              to: tok.to,
            };
            const compiledValue = compileAndValidateExpression(
              command_tag,
              command_tag.control,
              command_tag?.ranges?.control,
              program.context
            );
            const parent = lookup("spec", "dialogue_box", "action_box");
            if (parent) {
              parent.content ??= [];
              if (compiledValue && Array.isArray(compiledValue)) {
                parent.content.push(...compiledValue);
              }
            }
          }
        } else if (tok.tag === "choice_operator") {
          const parent = lookup("choice");
          if (parent) {
            parent.operator = text;
            parent.ranges ??= {};
            parent.ranges!.operator = {
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
          program.metadata ??= {};
          program.metadata.lines ??= [];
          program.metadata.lines[line] ??= {};
          program.metadata.lines[line]!.scopes = stack.map((s) => s.tag);
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
        if (tok.tag === "import") {
          if (tok.value) {
            // Compile value
            tok.value = tok.value.startsWith("[")
              ? tok.value
              : `[${tok.value}]`;
            const compiledValue = compileAndValidateExpression(
              tok,
              tok.value,
              tok?.ranges?.value,
              program.context
            );
            tok.compiled = compiledValue;

            validateTypeExists(tok, tok.type, tok.ranges?.type);
            tok.type ??= "url";

            const url =
              typeof compiledValue === "object" && Array.isArray(compiledValue)
                ? compiledValue[0]
                : typeof compiledValue === "string"
                ? compiledValue
                : undefined;

            if (typeof url !== "string" || !url.startsWith("https://")) {
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
              declareVariable(program, tok);
            }
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
        } else if (tok.tag === "spec") {
          const parent = lookup("define");
          if (parent) {
            parent.compiled = tok.content;
            parent.value = JSON.stringify(tok.content);
          }
        } else if (tok.tag === "define") {
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
          } else if (tok.name?.includes("[")) {
            diagnostic(
              program,
              tok,
              `Cannot define variable using bracket notation`,
              undefined,
              tok.from + tok.name.indexOf("["),
              tok.to
            );
          } else {
            const namespaceMatch = tok.name?.match(NAMESPACE_REGEX);
            const type = namespaceMatch?.[1] || "";
            const name = namespaceMatch?.[2] || "";
            if (name) {
              tok.operator = "=";
              const variable = {
                ...tok,
                type,
                name,
              };
              if (variable.compiled === undefined) {
                if (variable.fields) {
                  validateFields(variable);
                  const [objectLiteral, objCompiled] = construct(variable);
                  variable.value = objectLiteral;
                  variable.compiled = objCompiled;
                } else if (!variable.value) {
                  const [objectLiteral, objCompiled] = construct(variable);
                  variable.value = objectLiteral;
                  variable.compiled = objCompiled;
                } else {
                  variable.compiled = compileAndValidateExpression(
                    variable,
                    variable.value,
                    variable.ranges?.value,
                    program.context
                  );
                  const valueNamespaceMatch =
                    variable.value?.match(NAMESPACE_REGEX);
                  const valueType = valueNamespaceMatch?.[1] || "";
                  const assignedType = valueType || typeof variable.compiled;
                  if (
                    variable.type &&
                    assignedType !== "undefined" &&
                    variable.type !== assignedType
                  ) {
                    reportTypeMismatch(
                      variable,
                      assignedType,
                      variable.type,
                      variable?.ranges?.name
                    );
                    variable.compiled = undefined;
                  }
                }
              }
              tok.value = variable.value;
              tok.compiled = variable.compiled;
              if (variable.compiled != null) {
                if (
                  validateTypeMatch(
                    variable,
                    typeof variable.compiled,
                    variable.type,
                    variable?.ranges?.name
                  )
                ) {
                  if (!variable.type) {
                    variable.type =
                      typeof variable.compiled === "object" &&
                      !Array.isArray(variable.compiled)
                        ? "type"
                        : typeof variable.compiled;
                  }
                  if (
                    variable.compiled != null &&
                    variable.operator &&
                    validateDeclaration(variable)
                  ) {
                    declareVariable(program, variable);
                  }
                }
              }
            } else {
              validateAssignment(tok);
            }
          }
        } else if (tok.tag === "store") {
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
          } else if (tok.name?.includes("[")) {
            diagnostic(
              program,
              tok,
              `Cannot store variable using bracket notation`,
              undefined,
              tok.from + tok.name.indexOf("["),
              tok.to
            );
          } else {
            const namespaceMatch = tok.name?.match(NAMESPACE_REGEX);
            const type = namespaceMatch?.[1] || "";
            const name = namespaceMatch?.[2] || "";
            if (name && tok.operator) {
              const variable = {
                ...tok,
                type,
                name,
              };
              variable.compiled = compileAndValidateExpression(
                variable,
                variable.value,
                variable.ranges?.value,
                program.context
              );
              if (!variable.type) {
                variable.type =
                  typeof variable.compiled === "object"
                    ? "type"
                    : typeof variable.compiled;
              }
              if (
                variable.compiled != null &&
                variable.operator &&
                validateDeclaration(variable)
              ) {
                declareVariable(program, variable);
              }
            } else {
              validateAssignment(tok);
            }
            program.stored ??= [];
            program.stored.push(tok.name);
          }
        } else if (tok.tag === "assign") {
          validateAssignment(tok);
        } else if (tok.tag === "delete") {
          compileAndValidateIdentifier(
            tok,
            tok.name,
            tok?.ranges?.name,
            program.context
          );
        } else if (tok.tag === "image_tag") {
          if (!tok.target) {
            tok.target = "portrait";
          }
        } else if (tok.tag === "audio_tag") {
          if (!tok.target) {
            tok.target = "sound";
          }
        } else if (tok.tag === "choice") {
          const lastBox = search("action_box", "dialogue_box");
          if (lastBox) {
            const text = tok.content?.map((c) => c.text || "")?.join("") || "";
            const choices = lastBox.content?.filter((c) => c.tag === "choice");
            const choiceInstance = choices?.length ?? 0;
            lastBox.content ??= [];
            lastBox.content.push({
              tag: "choice",
              line: tok.ranges?.text?.line ?? tok.line,
              from: tok.ranges?.text?.from ?? tok.from,
              to: tok.ranges?.text?.to ?? tok.to,
              indent: tok.indent,
              target: `choice#${choiceInstance}`,
              text,
              button: tok.section,
              id: tok.id,
            });
          }
        } else if (tok.tag === "scene") {
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
        } else if (tok.tag === "action_box") {
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
            tok.content?.map((t) => ("text" in t ? t.text : "")).join("") || "";
          tok.speechDuration = calculateSpeechDuration(text);
          program.metadata ??= {};
          program.metadata.actionDuration =
            (program.metadata.actionDuration || 0) + tok.speechDuration;
          const currentScene = program.metadata?.scenes?.at(-1);
          if (currentScene) {
            currentScene.actionDuration =
              (currentScene.actionDuration || 0) + tok.speechDuration;
          }
          const parent = lookup("action");
          if (parent) {
            parent.content ??= [];
            parent.content.push(tok);
          }
        } else if (tok.tag === "dialogue_box") {
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
            tok.content?.map((t) => ("text" in t ? t.text : "")).join("") || "";
          tok.speechDuration = calculateSpeechDuration(text);
          program.metadata ??= {};
          program.metadata.dialogueDuration =
            (program.metadata.dialogueDuration || 0) + tok.speechDuration;
          const currentScene = program.metadata?.scenes?.at(-1);
          if (currentScene) {
            currentScene.dialogueDuration =
              (currentScene.dialogueDuration || 0) + tok.speechDuration;
          }
          const parent = lookup("dialogue");
          if (parent) {
            parent.content ??= [];
            parent.content.push(tok);
          }
        } else if (tok.tag === "dialogue") {
          const characterName = tok.characterName?.text || "";
          const characterParenthetical = tok.characterParenthetical?.text || "";
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

  if (program.sections) {
    Object.values(program.sections).forEach((section) => {
      section.tokens.forEach((tok) => {
        program.tokens ??= [];
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
  }

  return program;
};

export default populateProgram;

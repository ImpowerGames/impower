import SPARK_DISPLAY_TOKEN_TYPES from "../constants/SPARK_DISPLAY_TOKEN_TYPES";
import SPARK_FLOW_TOKEN_TYPES from "../constants/SPARK_FLOW_TOKEN_TYPES";
import SPARK_REGEX from "../constants/SPARK_REGEX";
import SPARK_RESERVED_KEYWORDS from "../constants/SPARK_RESERVED_KEYWORDS";
import SPARK_SCOPE_TYPES from "../constants/SPARK_SCOPE_TYPES";
import SPARK_SYSTEM_METHODS from "../constants/SPARK_SYSTEM_METHODS";
import TITLE_PAGE_DISPLAY from "../constants/TITLE_PAGE_DISPLAY";
import defaultCompiler from "../defaults/defaultCompiler";
import defaultFormatter from "../defaults/defaultFormatter";
import { CompilerDiagnostic } from "../types/CompilerDiagnostic";
import { SparkColorMetadata } from "../types/SparkColorMetadata";
import { SparkAction } from "../types/SparkDiagnostic";
import { SparkField } from "../types/SparkField";
import { SparkParseState } from "../types/SparkParseState";
import { SparkParserConfig } from "../types/SparkParserConfig";
import { SparkParserContext } from "../types/SparkParserContext";
import { SparkProgram } from "../types/SparkProgram";
import { SparkScopeType } from "../types/SparkScopeType";
import { SparkSection } from "../types/SparkSection";
import { SparkStruct } from "../types/SparkStruct";
import { SparkTitleKeyword } from "../types/SparkTitleKeyword";
import { SparkTitlePosition } from "../types/SparkTitlePosition";
import {
  SparkChoiceToken,
  SparkDialogueToken,
  SparkDisplayToken,
  SparkStructFieldToken,
  SparkToken,
} from "../types/SparkToken";
import { SparkTokenType } from "../types/SparkTokenType";
import { SparkTokenTypeMap } from "../types/SparkTokenTypeMap";
import { SparkVariable } from "../types/SparkVariable";
import { SparkVariableType } from "../types/SparkVariableType";
import { StructureItem } from "../types/StructureItem";
import calculateSpeechDuration from "./calculateSpeechDuration";
import createSparkLine from "./createSparkLine";
import createSparkSection from "./createSparkSection";
import createSparkToken from "./createSparkToken";
import getAncestorIds from "./getAncestorIds";
import getExpressionCallMatch from "./getExpressionCallMatch";
import getIndent from "./getIndent";
import getScopedContext from "./getScopedContext";
import getScopedItemId from "./getScopedItemId";
import getScopedValueContext from "./getScopedValueContext";
import getTo from "./getTo";
import isSparkDisplayToken from "./isSparkDisplayToken";
import isVariableType from "./isVariableType";
import stripInlineComments from "./stripInlineComments";
import trimCharacterExtension from "./trimCharacterExtension";
import updateObjectMap from "./updateObjectMap";

const EMPTY_OBJECT = {};

const SEVERITY_ORDER = ["info", "warning", "error"];

const getColorMetadata = (
  expression: string,
  expressionFrom: number
): SparkColorMetadata | null => {
  const expressionTo = expressionFrom + expression.length;
  const trimmedStartWhitespaceLength =
    expression.length - expression.trimStart().length;
  const trimmedEndWhitespaceLength =
    expression.length - expression.trimEnd().length;
  const trimmedExpression = expression.trim();
  if (!trimmedExpression.match(SPARK_REGEX.string)) {
    return null;
  }
  const stringContent = trimmedExpression.slice(1, -1);
  const from = expressionFrom + trimmedStartWhitespaceLength + 1;
  const to = expressionTo - trimmedEndWhitespaceLength - 1;
  if (
    SPARK_REGEX.hex_color.test(stringContent) ||
    SPARK_REGEX.hsl_color.test(stringContent) ||
    SPARK_REGEX.rgb_color.test(stringContent)
  ) {
    return {
      from,
      to,
      value: stringContent,
    };
  }
  return null;
};

const getLastStructureItem = (
  program: SparkProgram,
  condition: (item?: StructureItem) => boolean = () => true
): StructureItem | undefined => {
  program.metadata.structure ??= {};
  const structures = Object.values(program.metadata.structure);
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
  const structure = program.metadata.structure;
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

const getStart = (match: string[], groupIndex: number): number => {
  if (!match) {
    return -1;
  }
  const group = match[groupIndex];
  if (group == null) {
    return -1;
  }
  return match.slice(1, groupIndex).reduce((p, x) => p + (x?.length || 0), 0);
};

const capitalize = (str: string): string => {
  if (!str[0]) {
    return "";
  }
  return `${str[0].toUpperCase()}${str.slice(1)}`;
};

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

const getSceneEnvironment = (match: RegExpMatchArray) => {
  const environmentText = match[2] || "";
  const environmentTrimmed = environmentText?.toLowerCase()?.trim();
  return environmentTrimmed?.startsWith("int./ext.") ||
    environmentTrimmed?.startsWith("int/ext.")
    ? "int-ext"
    : environmentTrimmed?.startsWith("int.")
    ? "int"
    : environmentTrimmed?.startsWith("ext.")
    ? "ext"
    : "other";
};

const getSceneLocation = (match: RegExpMatchArray) => {
  const locationText: string = match[3] || "";
  return locationText.startsWith(".")
    ? locationText.substring(1)
    : locationText;
};

const getSceneTime = (match: RegExpMatchArray) => {
  return match[7] || "";
};

const getSceneDisplayedContent = (match: RegExpMatchArray) => {
  const content = match
    .slice(2, 9)
    .map((x) => x || "")
    .join("");
  const extraOffset = content.startsWith(".") ? 1 : 0;
  return content.substring(extraOffset)?.trimStart();
};

const lint = (regex: RegExp): RegExp => {
  const lintRegexSource = regex.source.replace(/[$][|]/g, "");
  const lintRegex = new RegExp(lintRegexSource);
  return lintRegex;
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

const lintNameUnique = <
  T extends SparkSection | SparkVariable | SparkStruct | SparkField
>(
  program: SparkProgram,
  currentToken: { from: number; to: number; line: number; offset?: number },
  type: "section" | "variable" | "struct" | "field",
  found: T,
  from: number,
  to: number
): T | undefined => {
  if (found?.name && found.from !== from) {
    const prefix = prefixArticle(type, true);
    const name = found?.name;
    const existingLine = found.line;
    if (existingLine >= 0) {
      diagnostic(
        program,
        currentToken,
        `${prefix} named '${name}' already exists at line ${existingLine}`,
        [{ name: "FOCUS", focus: { from: found.from, to: found.from } }],
        from,
        to
      );
    }
    return found;
  }
  return undefined;
};

const lintName = <T extends SparkSection | SparkVariable | SparkStruct>(
  program: SparkProgram,
  currentToken: { from: number; to: number; line: number; offset?: number },
  currentSectionId: string,
  name: string,
  from: number,
  to: number,
  sectionId?: string
): boolean => {
  const validSectionId = sectionId != null ? sectionId : currentSectionId;
  if (SPARK_RESERVED_KEYWORDS.includes(name)) {
    program.diagnostics ??= [];
    diagnostic(
      program,
      currentToken,
      `'${name}' is a reserved keyword.`,
      undefined,
      from,
      to
    );
    return false;
  }
  if (
    lintNameUnique<T>(
      program,
      currentToken,
      "struct",
      findStruct(program.structs, name) as T,
      from,
      to
    )
  ) {
    return false;
  }
  if (
    lintNameUnique<T>(
      program,
      currentToken,
      "section",
      findSection(
        program.sections,
        validSectionId.split(".").slice(0, -1).join("."),
        name
      ) as T,
      from,
      to
    )
  ) {
    return false;
  }
  if (
    lintNameUnique<T>(
      program,
      currentToken,
      "variable",
      findVariable(program.variables, validSectionId, name) as T,
      from,
      to
    )
  ) {
    return false;
  }
  return true;
};

const addSection = (
  program: SparkProgram,
  currentSectionId: string,
  section: SparkSection,
  nameFrom: number,
  nameTo: number
): void => {
  const id = currentSectionId;
  program.sections ??= {};
  if (id) {
    const parentId = id.split(".").slice(0, -1).join(".");
    section.parent = parentId;
    const parentSection = program.sections[parentId];
    if (parentSection) {
      parentSection.children ??= [];
      parentSection.children.push(id);
      if (
        section.type !== "function" &&
        (parentSection.type === "detector" || parentSection.type === "function")
      ) {
        diagnostic(
          program,
          section,
          `'${section.name}' cannot be a child of ${parentSection.type} '${
            parentSection.name
          }'.\n${capitalize(
            parentSection.type
          )}s can only have function children.`
        );
      }
    }
  }
  if (
    !lintName(
      program,
      section,
      currentSectionId,
      section.name,
      nameFrom,
      nameTo
    )
  ) {
    return;
  }
  section.index = Object.keys(program.sections).length;
  program.sections[id] = section;
  program.metadata.lines ??= [];
  program.metadata.lines[section.line] ??= {};
  program.metadata.lines[section.line]!.section ??= id;
  program.metadata.lines[section.line]!.references ??= [];
  program.metadata.lines[section.line]!.references!.push({
    from: nameFrom,
    to: nameTo,
    name: section.name,
    id,
    declaration: true,
  });
};

const getSection = (
  program: SparkProgram,
  currentToken: SparkToken,
  currentSectionId: string,
  type: "section" | "method" | "function" | "detector",
  name: string,
  from: number,
  to: number
): SparkSection | undefined => {
  if (!name) {
    return undefined;
  }
  const id = findSectionId(program.sections, currentSectionId, name);
  program.metadata.lines ??= [];
  program.metadata.lines[currentToken.line] ??= {};
  program.metadata.lines[currentToken.line]!.references ??= [];
  program.metadata.lines[currentToken.line]!.references!.push({
    from,
    to,
    name,
    id,
  });
  const found = id ? program.sections?.[id] : undefined;
  if (!found) {
    diagnostic(
      program,
      currentToken,
      `Cannot find ${type} named '${name}'`,
      undefined,
      from,
      to
    );
    return undefined;
  }
  if (found.type === "section" && type === "method") {
    return found;
  }
  if (found.type !== type) {
    program.diagnostics ??= [];
    diagnostic(
      program,
      currentToken,
      `'${name}' is not a ${type}`,
      undefined,
      from,
      to
    );
    return undefined;
  }
  return found;
};

const getArgumentValues = (
  program: SparkProgram,
  config: SparkParserConfig | undefined,
  currentToken: SparkToken,
  currentSectionId: string,
  type: "section" | "method" | "function" | "detector",
  methodName: string,
  methodArgs: string,
  methodNameFrom: number,
  methodNameTo: number,
  methodArgsFrom: number,
  methodArgsTo: number
): string[] => {
  const section = getSection(
    program,
    currentToken,
    currentSectionId,
    type,
    methodName,
    methodNameFrom,
    methodNameTo
  );
  if (!section) {
    return [];
  }
  if (!methodArgs) {
    return [];
  }
  const argumentsString = methodArgs.slice(1, -1);
  const expressionListMatches = Array.from(
    argumentsString.matchAll(SPARK_REGEX.expression_list)
  );
  const tokenMatches: string[] = [""];
  expressionListMatches.forEach((m) => {
    const text = m[0];
    const separatorGroupMatch = m[2];
    if (separatorGroupMatch) {
      tokenMatches.push("");
      tokenMatches[tokenMatches.length - 1] += text;
      tokenMatches.push("");
    } else {
      tokenMatches[tokenMatches.length - 1] += text;
    }
  });
  if (tokenMatches.length === 1 && tokenMatches[0] === "") {
    return [];
  }
  const parameters = section.variables
    ? Object.values(section.variables).filter((v) => v.parameter)
    : [];
  const argumentExpressions: string[] = [];
  let paramIndex = 0;
  const extraArgIndices: number[] = [];
  for (let index = 0; index < tokenMatches.length; index += 1) {
    const expression = tokenMatches[index];
    const expressionFrom =
      methodArgsFrom + getStart(["", ...tokenMatches], index + 1) + 1;
    const expressionTo = expressionFrom + (expression?.length || 0);
    const parameter = parameters?.[paramIndex];
    if (expression === ",") {
      // Separator
    } else if (!expression?.trim()) {
      if (parameter) {
        argumentExpressions.push(parameter.name);
      } else {
        extraArgIndices.push(index);
      }
      paramIndex += 1;
    } else {
      if (!parameter) {
        extraArgIndices.push(index);
      }
      if (expression) {
        let result = undefined;
        let diagnostics: CompilerDiagnostic[] | undefined = undefined;
        let references: CompilerDiagnostic[] | undefined = undefined;
        const struct = findStruct(program.structs, expression);
        if (struct) {
          result = { name: struct.name, type: struct.type };
        } else {
          const [ids, context] = getScopedValueContext(
            currentSectionId,
            program.sections
          );
          const colorMetadata = getColorMetadata(expression, expressionFrom);
          if (colorMetadata) {
            program.metadata.colors ??= [];
            program.metadata.colors?.push(colorMetadata);
          }
          const compiler = config?.compiler || defaultCompiler;
          [result, diagnostics, references] = compiler(expression, context);
          if (references?.length > 0) {
            for (let i = 0; i < references.length; i += 1) {
              const r = references[i];
              if (r) {
                const from = expressionFrom + r.from;
                const to = expressionFrom + r.to;
                program.metadata.lines ??= [];
                program.metadata.lines[currentToken.line] ??= {};
                program.metadata.lines[currentToken.line]!.references ??= [];
                program.metadata.lines[currentToken.line]!.references!?.push({
                  from,
                  to,
                  name: r.content,
                  id: ids[r.content],
                });
              }
            }
          }
        }
        if (diagnostics && diagnostics.length > 0) {
          for (let i = 0; i < diagnostics.length; i += 1) {
            const d = diagnostics[i];
            if (d) {
              const from = expressionFrom + d.from;
              const to = expressionFrom + d.to;
              if (program.files) {
                diagnostic(
                  program,
                  currentToken,
                  d.message,
                  undefined,
                  from,
                  to
                );
              }
            }
          }
        } else if (parameter) {
          const trimmedStartWhitespaceLength =
            expression.length - expression.trimStart().length;
          const trimmedEndWhitespaceLength =
            expression.length - expression.trimEnd().length;
          const evaluatedType = typeof result;
          const expectedType = parameter?.type;
          if (evaluatedType !== expectedType) {
            diagnostic(
              program,
              currentToken,
              `Parameter '${parameter.name}' expects ${prefixArticle(
                expectedType
              )} value.`,
              [
                {
                  name: "FOCUS",
                  focus: { from: parameter.from, to: parameter.from },
                },
              ],
              expressionFrom + trimmedStartWhitespaceLength,
              expressionTo - trimmedEndWhitespaceLength
            );
          }
        }
      }
      argumentExpressions.push(expression);
      paramIndex += 1;
    }
  }
  if (extraArgIndices?.length > 0) {
    diagnostic(
      program,
      currentToken,
      `Expected ${parameters.length} ${
        parameters.length === 1 ? "argument" : "arguments"
      } but got ${parameters.length + extraArgIndices.length}`,
      undefined,
      methodArgsFrom,
      methodArgsTo
    );
  }
  return argumentExpressions;
};

const getExpressionCallNameAndValues = (
  program: SparkProgram,
  config: SparkParserConfig | undefined,
  currentToken: SparkToken,
  currentSectionId: string,
  type: "method" | "function",
  expression: string,
  expressionFrom: number
): { name: string | undefined; values: string[] } => {
  if (expression === "!" || expression?.toLowerCase() === "!quit") {
    return { name: "!", values: [] };
  }
  if (expression === ">") {
    const block = program?.sections?.[currentSectionId];
    const blockIndex = block?.index || 0;
    const entry = program?.sections
      ? Object.entries(program?.sections)
          .slice(blockIndex + 1)
          .find(
            ([, v]) =>
              v.type === "section" &&
              (v.parent === currentSectionId ||
                (program?.sections?.[v.parent || ""]?.index || 0) < blockIndex)
          )
      : undefined;
    const id = entry?.[0];
    if (id == null || id === currentSectionId) {
      diagnostic(
        program,
        currentToken,
        "There are no sections after this section",
        undefined,
        expressionFrom,
        expressionFrom + expression.length,
        "warning"
      );
      return { name: expression, values: [] };
    }
    const name = program?.sections?.[id]?.name;
    return { name, values: [] };
  }
  if (expression === "[") {
    const parentId = program?.sections?.[currentSectionId]?.parent;
    if (parentId != null) {
      const siblingIds = program?.sections?.[parentId]?.children;
      const id = siblingIds?.find(
        (x) => program?.sections?.[x]?.type === "section"
      );
      if (id != null && id !== currentSectionId) {
        const name = program?.sections?.[id]?.name;
        return { name, values: [] };
      }
    }
    diagnostic(
      program,
      currentToken,
      "There are no sibling sections before this section",
      undefined,
      expressionFrom,
      expressionFrom + expression.length,
      "warning"
    );
    return { name: expression, values: [] };
  }
  if (expression === "]") {
    const parentId = program?.sections?.[currentSectionId]?.parent;
    if (parentId != null) {
      const siblingIds = program?.sections?.[parentId]?.children;
      if (siblingIds) {
        const id = [...siblingIds]
          ?.reverse()
          .find((x) => program?.sections?.[x]?.type === "section");
        if (id != null && id !== currentSectionId) {
          const name = program?.sections?.[id]?.name;
          return { name, values: [] };
        }
      }
    }
    diagnostic(
      program,
      currentToken,
      "There are no sibling sections after this section",
      undefined,
      expressionFrom,
      expressionFrom + expression.length,
      "warning"
    );
    return { name: expression, values: [] };
  }
  if (expression === "^") {
    const id = program?.sections?.[currentSectionId]?.parent;
    if (id != null) {
      const name = program?.sections?.[id]?.name;
      return { name, values: [] };
    }
    diagnostic(
      program,
      currentToken,
      "This section does not have a parent",
      undefined,
      expressionFrom,
      expressionFrom + expression.length
    );
    return { name: expression, values: [] };
  }
  const match = getExpressionCallMatch(type, expression);
  if (match) {
    const name = match[2] || "";
    const nameSpace = match[3] || "";
    const args = match[4] || "";
    const nameFrom = expressionFrom + getStart(match, 2);
    const nameTo = nameFrom + name.length;
    const argsFrom = nameTo + nameSpace.length;
    const argsTo = argsFrom + args.length;
    const values = getArgumentValues(
      program,
      config,
      currentToken,
      currentSectionId,
      type,
      name,
      args,
      nameFrom,
      nameTo,
      argsFrom,
      argsTo
    );
    return { name, values };
  }
  return { name: undefined, values: [] };
};

const checkExpressionValue = (
  program: SparkProgram,
  config: SparkParserConfig | undefined,
  currentToken: SparkToken,
  currentSectionId: string,
  expression: string,
  expressionFrom: number
): void => {
  if (!expression) {
    return;
  }
  const [ids, context] = getScopedValueContext(
    currentSectionId,
    program.sections
  );
  const colorMetadata = getColorMetadata(expression, expressionFrom);
  if (colorMetadata) {
    program.metadata.colors ??= [];
    program.metadata.colors?.push(colorMetadata);
  }
  const compiler = config?.compiler || defaultCompiler;
  const [, diagnostics, references] = compiler(expression, context);
  if (references?.length > 0) {
    for (let i = 0; i < references.length; i += 1) {
      const r = references[i];
      if (r) {
        const from = expressionFrom + r.from;
        const to = expressionFrom + r.to;
        program.metadata.lines ??= [];
        program.metadata.lines[currentToken.line] ??= {};
        program.metadata.lines[currentToken.line]!.references ??= [];
        program.metadata.lines[currentToken.line]!.references!?.push({
          from,
          to,
          name: r.content,
          id: ids[r.content],
        });
      }
    }
  }
  if (diagnostics?.length > 0) {
    for (let i = 0; i < diagnostics.length; i += 1) {
      const d = diagnostics[i];
      if (d) {
        const from = expressionFrom + d.from;
        const to = expressionFrom + d.to;
        diagnostic(program, currentToken, d.message, undefined, from, to);
      }
    }
  }
};

const checkTextExpression = (
  program: SparkProgram,
  config: SparkParserConfig | undefined,
  currentToken: SparkToken,
  currentSectionId: string,
  content: string,
  contentFrom: number
): void => {
  if (content?.indexOf("{") >= 0) {
    const expression = `\`${content}\``;
    const expressionFrom = contentFrom - 1;
    checkExpressionValue(
      program,
      config,
      currentToken,
      currentSectionId,
      expression,
      expressionFrom
    );
  }
};

const getSectionCalls = (
  program: SparkProgram,
  config: SparkParserConfig | undefined,
  currentToken: SparkToken,
  currentSectionId: string,
  type: "method" | "function",
  expression: string,
  expressionFrom: number
): Record<string, { name: string; values: string[] }> => {
  if (!expression) {
    return {};
  }
  const { name, values } = getExpressionCallNameAndValues(
    program,
    config,
    currentToken,
    currentSectionId,
    type,
    expression,
    expressionFrom
  );
  if (name !== undefined) {
    return { "": { name, values } };
  }
  const [, context] = getScopedContext(
    "sections",
    currentSectionId,
    program.sections
  );
  const formatter = config?.formatter || defaultFormatter;
  const [, , possibleSectionExpressions] = formatter(expression, context);
  const calls: Record<string, { name: string; values: string[] }> = {};
  if (possibleSectionExpressions?.length > 0) {
    possibleSectionExpressions.forEach(({ content, from }) => {
      const { name, values } = getExpressionCallNameAndValues(
        program,
        config,
        currentToken,
        currentSectionId,
        type,
        content,
        expressionFrom + from
      );
      if (name !== undefined) {
        calls[content] = { name, values };
      } else {
        const trimmedStart = content.trimStart();
        const trimmedEnd = content.trimEnd();
        const trimmedStartLength = content.length - trimmedStart.length;
        const trimmedEndLength = content.length - trimmedEnd.length;
        diagnostic(
          program,
          currentToken,
          "Invalid section syntax",
          undefined,
          expressionFrom + from + trimmedStartLength,
          expressionFrom + from + content.length - trimmedEndLength
        );
      }
    });
  } else {
    diagnostic(
      program,
      currentToken,
      "Dynamic sections must be surrounded by '{}'.\n{FirstTime|SecondTime|ThirdTime}",
      undefined,
      expressionFrom,
      expressionFrom + expression.length
    );
  }
  return calls;
};

const getVariableExpressionValue = (
  program: SparkProgram,
  config: SparkParserConfig | undefined,
  currentToken: SparkToken,
  currentSectionId: string,
  expression: string,
  expressionFrom: number,
  expressionTo: number,
  variable?: SparkVariable,
  variableNameFrom?: number,
  variableNameTo?: number
): unknown | undefined => {
  if (!expression) {
    return undefined;
  }
  const structFound = findStruct(program.structs, expression);
  if (structFound) {
    return { name: structFound.name, type: structFound.type };
  }
  const { name } = getExpressionCallNameAndValues(
    program,
    config,
    currentToken,
    currentSectionId,
    "function",
    expression,
    expressionFrom
  );
  if (name !== undefined) {
    if (variable) {
      const section = findSection(program.sections, currentSectionId, name);
      if (
        section != null &&
        variable.type &&
        section.returnType !== variable.type
      ) {
        if (section.returnType) {
          diagnostic(
            program,
            currentToken,
            `Cannot assign the result of a '${section.returnType}' function to a '${variable.type}' variable`,
            [
              {
                name: "FOCUS",
                focus: {
                  from: variable.from,
                  to: variable.from,
                },
              },
            ],
            variableNameFrom,
            variableNameTo
          );
        } else {
          diagnostic(
            program,
            currentToken,
            `'${section.name}' is a method that does not return a value`,
            [
              {
                name: "FOCUS",
                focus: {
                  from: variable.from,
                  to: variable.from,
                },
              },
            ],
            variableNameFrom,
            variableNameTo
          );
        }
      }
    } else {
      diagnostic(
        program,
        currentToken,
        `Must be initialized to a constant value or expression`,
        undefined,
        expressionFrom,
        expressionTo
      );
    }
    return undefined;
  }
  const [ids, context] = getScopedValueContext(
    currentSectionId,
    program.sections
  );
  const colorMetadata = getColorMetadata(expression, expressionFrom);
  if (colorMetadata) {
    program.metadata.colors ??= [];
    program.metadata.colors?.push(colorMetadata);
  }
  const compiler = config?.compiler || defaultCompiler;
  const [result, diagnostics, references] = compiler(expression, context);
  if (references?.length > 0) {
    for (let i = 0; i < references.length; i += 1) {
      const r = references[i];
      if (r) {
        const from = expressionFrom + r.from;
        const to = expressionFrom + r.to;
        program.metadata.lines ??= [];
        program.metadata.lines[currentToken.line] ??= {};
        program.metadata.lines[currentToken.line]!.references ??= [];
        program.metadata.lines[currentToken.line]!.references!?.push({
          from,
          to,
          name: r.content,
          id: ids[r.content],
        });
      }
    }
  }
  if (diagnostics?.length > 0) {
    for (let i = 0; i < diagnostics.length; i += 1) {
      const d = diagnostics[i];
      if (d) {
        const from = expressionFrom + d.from;
        const to = expressionFrom + d.to;
        diagnostic(program, currentToken, d.message, undefined, from, to);
      }
    }
  } else if (variable) {
    const resultType = typeof result;
    if (result != null && variable.type) {
      if (resultType !== variable.type) {
        diagnostic(
          program,
          currentToken,
          `Cannot assign a '${resultType}' to a '${variable.type}' variable`,
          [
            {
              name: "FOCUS",
              focus: {
                from: variable.from,
                to: variable.from,
              },
            },
          ],
          variableNameFrom,
          variableNameTo
        );
      }
    }
  }
  if (diagnostics?.length > 0) {
    return undefined;
  }
  return result;
};

const getStruct = (
  program: SparkProgram,
  currentToken: SparkToken,
  type: string,
  name: string,
  from: number,
  to: number,
  severity: "error" | "warning" | "info" | null
): SparkStruct | undefined => {
  if (!name) {
    return undefined;
  }
  const id = findStructId(program.structs, name);
  program.metadata.lines ??= [];
  program.metadata.lines[currentToken.line] ??= {};
  program.metadata.lines[currentToken.line]!.references ??= [];
  program.metadata.lines[currentToken.line]!.references!?.push({
    from,
    to,
    name,
    id,
  });
  const found = id ? program.structs?.[id] : undefined;
  if (!found) {
    if (severity) {
      diagnostic(
        program,
        currentToken,
        `Cannot find ${type || "struct"} named '${name}'`,
        undefined,
        from,
        to,
        severity
      );
    }
    return undefined;
  }
  if (type && found.type !== type) {
    if (severity) {
      diagnostic(
        program,
        currentToken,
        `'${name}' is not ${prefixArticle(type)}`,
        [{ name: "FOCUS", focus: { from: found.from, to: found.from } }],
        from,
        to,
        severity
      );
    }
    return undefined;
  }
  return found;
};

const getVariable = (
  program: SparkProgram,
  currentToken: SparkToken,
  currentSectionId: string,
  type: SparkVariableType | SparkVariableType[] | undefined,
  name: string,
  from: number,
  to: number,
  severity: "error" | "warning" | "info" = "error"
): SparkVariable | undefined => {
  if (!name) {
    return undefined;
  }
  const id = findVariableId(program.variables, currentSectionId, name);
  program.metadata.lines ??= [];
  program.metadata.lines[currentToken.line] ??= {};
  program.metadata.lines[currentToken.line]!.references ??= [];
  program.metadata.lines[currentToken.line]!.references!?.push({
    from,
    to,
    name,
    id,
  });
  const found = id ? program.variables?.[id] : undefined;
  if (!found) {
    const itemType =
      typeof type === "string"
        ? type
        : Array.isArray(type)
        ? type[0]
        : "variable";
    diagnostic(
      program,
      currentToken,
      `Cannot find ${itemType} named '${name}'`,
      undefined,
      from,
      to,
      severity
    );
    return undefined;
  }
  if (type) {
    if (Array.isArray(type)) {
      if (!type.includes(found.type)) {
        diagnostic(
          program,
          currentToken,
          `'${name}' is not ${prefixArticle(type.join(" or "))} variable`,
          [{ name: "FOCUS", focus: { from: found.from, to: found.from } }],
          from,
          to
        );
      }
    } else {
      if (found.type !== type) {
        diagnostic(
          program,
          currentToken,
          `'${name}' is not ${prefixArticle(type)} variable`,
          [{ name: "FOCUS", focus: { from: found.from, to: found.from } }],
          from,
          to
        );
      }
    }
    return undefined;
  }
  return found;
};

const getValueType = (valueText: string): SparkVariableType | undefined => {
  if (valueText == null || valueText === "") {
    return undefined;
  }
  if (valueText.match(SPARK_REGEX.string)) {
    return "string";
  }
  if (valueText.match(SPARK_REGEX.number)) {
    return "number";
  }
  if (valueText.match(SPARK_REGEX.boolean)) {
    return "boolean";
  }
  return undefined;
};

const getVariableValueOrReference = (
  program: SparkProgram,
  currentToken: SparkToken,
  currentSectionId: string,
  content: string,
  from: number,
  to: number
): [unknown, SparkVariable | undefined] => {
  if (!content) {
    return [undefined, undefined];
  }
  const type = getValueType(content);
  if (type === "string") {
    return [content.slice(1, -1), undefined];
  }
  if (type === "number") {
    return [Number(content), undefined];
  }
  if (type === "boolean") {
    return [Boolean(content), undefined];
  }
  const found = getVariable(
    program,
    currentToken,
    currentSectionId,
    undefined,
    content,
    from,
    to
  );
  if (found) {
    return [found.value, found];
  }
  return [undefined, undefined];
};

const getRawString = (content: string): string => {
  if (content.match(SPARK_REGEX.string)) {
    return content.slice(1, -1);
  }
  return content;
};

const addStruct = (
  program: SparkProgram,
  currentToken: SparkToken,
  currentSectionId: string,
  type: string,
  name: string,
  base: string,
  line: number,
  nameFrom: number,
  nameTo: number,
  baseFrom: number,
  baseTo: number
): void => {
  program.structs ??= {};
  const id = name;
  if (
    !lintName(program, currentToken, currentSectionId, name, nameFrom, nameTo)
  ) {
    return;
  }
  program.metadata.lines ??= [];
  program.metadata.lines[currentToken.line] ??= {};
  program.metadata.lines[currentToken.line]!.references ??= [];
  program.metadata.lines[currentToken.line]!.references!?.push({
    from: nameFrom,
    to: nameTo,
    name,
    id,
    declaration: true,
  });
  if (base) {
    getStruct(program, currentToken, type, base, baseFrom, baseTo, "error");
  }
  const existing = program?.structs?.[id];
  const item: SparkStruct = {
    ...(existing || EMPTY_OBJECT),
    from: nameFrom,
    to: nameTo,
    line,
    name,
    base,
    type,
    fields: {},
  };
  program.structs[id] = item;
};

const addCss = (
  program: SparkProgram,
  valueText: string,
  line: number,
  valueFrom: number,
  valueTo: number
): void => {
  program.structs ??= {};
  const value = getRawString(valueText);
  const name = "css";
  const existing = program?.structs?.[name];
  const fieldId = existing?.fields
    ? Object.keys(existing?.fields).length?.toString()
    : "0";
  const item: SparkStruct = {
    ...(existing || EMPTY_OBJECT),
    from: valueFrom,
    to: valueTo,
    line,
    base: "",
    type: "css",
    name,
    fields: {
      ...(existing?.fields || EMPTY_OBJECT),
      [fieldId]: {
        type: "string",
        value,
      } as SparkField,
    },
  };
  program.structs[name] = item;
};

const addVariable = (
  program: SparkProgram,
  config: SparkParserConfig | undefined,
  currentToken: SparkToken,
  currentSectionId: string,
  name: string,
  type: string,
  valueText: string,
  scope: "public" | "protected",
  parameter: boolean,
  line: number,
  nameFrom: number,
  nameTo: number,
  typeFrom: number,
  typeTo: number,
  valueFrom: number,
  valueTo: number
): SparkVariableType | null => {
  program.variables ??= {};
  const id = `${currentSectionId}.${name}`;
  if (
    !lintName(program, currentToken, currentSectionId, name, nameFrom, nameTo)
  ) {
    return null;
  }
  program.metadata.lines ??= [];
  program.metadata.lines[currentToken.line] ??= {};
  program.metadata.lines[currentToken.line]!.references ??= [];
  program.metadata.lines[currentToken.line]!.references!?.push({
    from: nameFrom,
    to: nameTo,
    name,
    id,
    declaration: true,
  });
  const value = getVariableExpressionValue(
    program,
    config,
    currentToken,
    currentSectionId,
    valueText,
    valueFrom,
    valueTo
  );
  const validValue = value != null ? value : "";
  const valueType =
    typeof validValue === "object"
      ? (validValue as { type: string })?.type
      : (typeof validValue as SparkVariableType);
  const variableType = (type || valueType) as SparkVariableType;
  if (!isVariableType(variableType)) {
    const error = `Unrecognized variable type`;
    diagnostic(program, currentToken, error, undefined, typeFrom, typeTo);
  } else {
    const existing = program?.variables?.[id];
    const item: SparkVariable = {
      ...(existing || EMPTY_OBJECT),
      from: nameFrom,
      to: nameTo,
      line,
      name,
      type: variableType,
      value: validValue,
      parameter,
      scope,
    };
    program.variables[id] = item;
    const parentSection = program.sections?.[currentSectionId];
    if (parentSection) {
      parentSection.variables ??= {};
      parentSection.variables[id] = item;
    }
  }

  return variableType;
};

const addField = (
  program: SparkProgram,
  config: SparkParserConfig | undefined,
  currentToken: SparkStructFieldToken,
  currentSectionId: string,
  nameFrom: number,
  nameTo: number,
  valueFrom: number,
  valueTo: number
): void => {
  const id = currentToken.id;
  const name = currentToken.name;
  const valueText = currentToken.valueText;
  const currentStructName = currentToken.struct;
  const line = currentToken.line;
  program.structs ??= {};
  const struct = program.structs[currentStructName];
  if (struct) {
    struct.fields ??= {};
    if (
      !lintName(program, currentToken, currentSectionId, id, nameFrom, nameTo)
    ) {
      return;
    }
    if (id) {
      program.metadata.lines ??= [];
      program.metadata.lines[currentToken.line] ??= {};
      program.metadata.lines[currentToken.line]!.references ??= [];
      program.metadata.lines[currentToken.line]!.references!?.push({
        from: nameFrom,
        to: nameTo,
        name: name,
        id: id,
        declaration: true,
      });
    }
    const found = struct.fields[id];
    if (found) {
      lintNameUnique(program, currentToken, "field", found, nameFrom, nameTo);
    } else {
      const value =
        findVariable(program.variables, currentSectionId, valueText)?.value ??
        getVariableExpressionValue(
          program,
          config,
          currentToken,
          currentSectionId,
          valueText,
          valueFrom,
          valueTo
        );
      const validValue = value != null ? value : "";
      const validType = typeof validValue as SparkVariableType;
      const existing = program?.structs?.[currentStructName]?.fields?.[id];
      const item: SparkField = {
        ...(existing || EMPTY_OBJECT),
        from: nameFrom,
        to: nameTo,
        line,
        name: name,
        type: validType,
        value: validValue,
        valueText,
      };
      struct.fields[id] = item;
    }
  }
};

const getParameterNames = (
  program: SparkProgram,
  config: SparkParserConfig | undefined,
  currentToken: SparkToken,
  currentSectionId: string,
  match: string[],
  groupIndex: number
): string[] => {
  if (!match) {
    return [];
  }
  const parametersWithParenthesisString = match[groupIndex] || "";
  if (!parametersWithParenthesisString) {
    return [];
  }
  const parametersString = parametersWithParenthesisString.slice(1, -1);
  const openMark = parametersWithParenthesisString.slice(0, 1);
  const closeMark = parametersWithParenthesisString.slice(-1);
  const detector = openMark === "[" && closeMark === "]";
  const expressionListMatches = Array.from(
    parametersString.matchAll(SPARK_REGEX.expression_list)
  );
  const tokenMatches: string[] = [""];
  expressionListMatches.forEach((m) => {
    const text = m[0];
    const separatorGroupMatch = m[2];
    if (separatorGroupMatch) {
      tokenMatches.push("");
      tokenMatches[tokenMatches.length - 1] += text;
      tokenMatches.push("");
    } else {
      tokenMatches[tokenMatches.length - 1] += text;
    }
  });
  if (tokenMatches.length === 1 && tokenMatches[0] === "") {
    return [];
  }
  const allTokenMatches = [openMark, ...tokenMatches, closeMark];
  const allMatches = [...match];
  allMatches.splice(groupIndex, 1, ...allTokenMatches);
  const parameterNames: string[] = [];
  const startIndex = groupIndex;
  const endIndex = groupIndex + allTokenMatches.length;
  const startFrom = currentToken.from + getStart(allMatches, startIndex);
  const endFrom = currentToken.from + getStart(allMatches, endIndex);
  if (openMark && closeMark && openMark === "(" && closeMark === "]") {
    const message = "Mismatched parenthesis";
    diagnostic(
      program,
      currentToken,
      message,
      undefined,
      startFrom,
      startFrom + 1
    );
    diagnostic(program, currentToken, message, undefined, endFrom, endFrom + 1);
    return parameterNames;
  }
  if (openMark && closeMark && openMark === "[" && closeMark === ")") {
    const message = "Mismatched brackets";
    diagnostic(
      program,
      currentToken,
      message,
      undefined,
      startFrom,
      startFrom + 1
    );
    diagnostic(program, currentToken, message, undefined, endFrom, endFrom + 1);
    return parameterNames;
  }
  for (let index = startIndex + 1; index < endIndex - 1; index += 1) {
    const declaration = allMatches[index] || "";
    const from = currentToken.from + getStart(allMatches, index);
    const to = from + declaration.length;
    let parameterMatch: RegExpMatchArray | null;
    if (declaration === ",") {
      // Separator
    } else if (!declaration.trim()) {
      diagnostic(program, currentToken, "Empty parameter", [], from, to);
    } else if (
      (parameterMatch = declaration.match(
        lint(SPARK_REGEX.parameter_declaration)
      ))
    ) {
      const name = parameterMatch[2] || "";
      const type = parameterMatch[6] || "";
      const operator = parameterMatch[8] || "";
      const expression = parameterMatch[10] || "";
      const nameFrom = from + getStart(parameterMatch, 2);
      const nameTo = nameFrom + name.length;
      const typeFrom = from + getStart(parameterMatch, 6);
      const typeTo = typeFrom + type.length;
      const operatorFrom = from + getStart(parameterMatch, 8);
      const operatorTo = operatorFrom + operator.length;
      const expressionFrom = from + getStart(parameterMatch, 10);
      const expressionTo = expressionFrom + expression.length;
      if (name) {
        if (detector) {
          getVariable(
            program,
            currentToken,
            currentSectionId,
            undefined,
            name,
            nameFrom,
            nameTo
          );
          if (expression) {
            const error = `Detector dependencies should not be initialized`;
            diagnostic(
              program,
              currentToken,
              error,
              [],
              expressionFrom,
              expressionTo
            );
          } else if (operator) {
            const error = `Detector dependencies should not be initialized`;
            diagnostic(
              program,
              currentToken,
              error,
              [],
              operatorFrom,
              operatorTo
            );
          }
        } else {
          addVariable(
            program,
            config,
            currentToken,
            currentSectionId,
            name,
            type,
            expression,
            "protected",
            true,
            currentToken.line,
            nameFrom,
            nameTo,
            typeFrom,
            typeTo,
            expressionFrom,
            expressionTo
          );
        }
      }
      parameterNames.push(name);
    } else {
      const trimmedStartWhitespaceLength =
        declaration.length - declaration.trimStart().length;
      const trimmedEndWhitespaceLength =
        declaration.length - declaration.trimEnd().length;
      const error = detector
        ? `Invalid variable dependency`
        : `Invalid parameter declaration`;
      diagnostic(
        program,
        currentToken,
        error,
        [],
        from + trimmedStartWhitespaceLength,
        to - trimmedEndWhitespaceLength
      );
    }
  }
  return parameterNames;
};

const pushToken = (
  program: SparkProgram,
  config: SparkParserConfig | undefined,
  currentScope: string,
  currentSectionId: string,
  token: SparkToken,
  updateLines = true
): void => {
  if (token.content && !token.text) {
    token.text = token.content;
  }
  if (config?.skipTokens?.includes(token.type)) {
    return;
  }
  program.tokens.push(token);
  program.sections ??= {};
  const section = program.sections[currentSectionId] || createSparkSection();
  program.sections[currentSectionId] = section;
  if (updateLines) {
    const tokenIndex = program.tokens.length - 1;
    program.metadata.lines ??= [];
    program.metadata.lines[token.line] ??= {};
    program.metadata.lines[token.line]!.level = section.level;
    program.metadata.lines[token.line]!.indent = token.indent;
    program.metadata.lines[token.line]!.offset = token.offset;
    program.metadata.lines[token.line]!.length = token.text.length;
    program.metadata.lines[token.line]!.tokens ??= [];
    program.metadata.lines[token.line]!.tokens!.push(tokenIndex);
    if (currentScope) {
      program.metadata.lines[token.line]!.scope = SPARK_SCOPE_TYPES.indexOf(
        currentScope as SparkScopeType
      );
    }
  }
  section.tokens ??= [];
  const tokens = section.tokens;
  if (tokens) {
    tokens.push(token);
  }
};

const checkNotes = (program: SparkProgram, currentToken: SparkToken): void => {
  const str = currentToken.content;
  if (str?.indexOf("[") >= 0) {
    const noteMatches = str.match(SPARK_REGEX.note_inline);
    let startIndex = -1;
    if (noteMatches) {
      for (let i = 0; i < noteMatches.length; i += 1) {
        const noteMatch = noteMatches[i] || "";
        const type = noteMatch.startsWith("(") ? "audio" : "image";
        const name = noteMatch.slice(2, noteMatch.length - 2);
        startIndex = str.indexOf(noteMatch, startIndex) + 2;
        const from = currentToken.from + startIndex;
        const to = from + noteMatch.length - 4;
        if (name) {
          getStruct(
            program,
            currentToken,
            type,
            name,
            from,
            to,
            program.files ? "warning" : null
          );
        }
      }
    }
  }
};

const pushAssets = (
  program: SparkProgram,
  currentToken: SparkToken,
  state: SparkParseState
): void => {
  const str = currentToken.content;
  const noteMatches = str.match(SPARK_REGEX.note_inline);
  let startIndex = -1;
  if (noteMatches) {
    for (let i = 0; i < noteMatches.length; i += 1) {
      const noteMatch = noteMatches[i]?.trim() || "";
      const type = noteMatch.startsWith("(") ? "audio" : "image";
      const name = noteMatch.slice(2, noteMatch.length - 2);
      startIndex = str.indexOf(noteMatch, startIndex) + 2;
      const from = currentToken.from + startIndex;
      const to = from + noteMatch.length - 4;
      if (name) {
        getStruct(
          program,
          currentToken,
          type,
          name,
          from,
          to,
          program.files ? "warning" : null
        );
      }
      state.assets ??= [];
      state.assets.push({ name, type });
    }
  }
};

const saveAndClearAssets = (
  currentToken: SparkToken,
  state: SparkParseState
): void => {
  state.assets ??= [];
  const save = state.assets.length > 0;
  if (
    save &&
    (currentToken.type === "assets" ||
      currentToken.type === "dialogue" ||
      currentToken.type === "action")
  ) {
    currentToken.assets ??= [];
    currentToken.assets = [...currentToken.assets, ...state.assets];
  }
  state.assets.length = 0;
};

const saveAndClearDialogueToken = (
  program: SparkProgram,
  config: SparkParserConfig | undefined,
  currentToken: SparkToken,
  currentScope: string,
  currentSectionId: string,
  state: SparkParseState,
  dialogueToken: SparkDialogueToken
): void => {
  dialogueToken.character = state.character || "";
  dialogueToken.parenthetical = state.parenthetical || "";
  pushToken(program, config, currentScope, currentSectionId, dialogueToken);
  saveAndClearAssets(currentToken, state);
  state.character = undefined;
  state.parenthetical = undefined;
};

const pushChoice = (
  program: SparkProgram,
  config: SparkParserConfig | undefined,
  currentScope: string,
  currentSectionId: string,
  state: SparkParseState,
  choiceToken: SparkChoiceToken
): void => {
  state.choiceTokens ??= [];
  if (!state.choiceTokens?.length) {
    pushToken(
      program,
      config,
      currentScope,
      currentSectionId,
      createSparkToken("choice", state.newLineLength, {
        line: choiceToken?.line,
        indent: choiceToken?.indent,
        from: choiceToken?.from,
        operator: "start",
        skipToNextPreview: true,
      }),
      false
    );
  }
  state.choiceTokens.push(choiceToken);
};

const saveAndClearChoices = (
  program: SparkProgram,
  config: SparkParserConfig | undefined,
  currentToken: SparkToken,
  currentScope: string,
  currentSectionId: string,
  state: SparkParseState
): void => {
  state.choiceTokens ??= [];
  if (state.choiceTokens.length > 0) {
    pushToken(
      program,
      config,
      currentScope,
      currentSectionId,
      createSparkToken("choice", state.newLineLength, {
        line: currentToken?.line,
        indent: currentToken?.indent,
        from: currentToken?.to,
        operator: "end",
        skipToNextPreview: true,
      }),
      false
    );
  }
  state.choiceTokens.length = 0;
};

const dialogueOrAssetTypes = ["dialogue", "dialogue_asset"];
const actionOrAssetTypes = ["action", "action_asset"];
const sparkLineKeys = Object.keys(createSparkLine());

const processDisplayedContent = (
  program: SparkProgram,
  config: SparkParserConfig | undefined,
  currentToken: SparkToken,
  currentSectionId: string,
  state: SparkParseState,
  token: SparkDisplayToken,
  contentFrom?: number
): void => {
  if (token.type === "assets") {
    return;
  }
  if (token.type !== "action") {
    token.content = token.content?.trimStart();
  }
  if (token.content?.[0] === "~") {
    const trimmedEndContent = token.content?.trimEnd();
    const trimmedEndLength = token.content.length - trimmedEndContent.length;
    const endSpaces =
      trimmedEndLength > 0 ? token.content.slice(-trimmedEndLength) : "";
    token.content = `*${trimmedEndContent.substring(1)}*${endSpaces}`;
  }
  const matchingType =
    state.displayToken?.type === token?.type ||
    (dialogueOrAssetTypes.includes(state.displayToken?.type || "") &&
      dialogueOrAssetTypes.includes(token?.type)) ||
    (actionOrAssetTypes.includes(state.displayToken?.type || "") &&
      actionOrAssetTypes.includes(token?.type));
  if (
    state.prependNext &&
    state.displayToken &&
    token.line - state.displayToken.line <= 1 &&
    matchingType
  ) {
    token.text = token.content;
    Object.entries(state.displayToken).forEach(([k, v]) => {
      if (!sparkLineKeys.includes(k)) {
        token[k as keyof SparkDisplayToken] = v as never;
      }
    });
    token.content = `${state.displayToken.content}${token.content}`;
    state.displayToken.ignore = true;
    state.displayToken.skipToNextPreview = true;
  }
  if (token.type === "action") {
    token.duration = calculateSpeechDuration(token.text);
    program.metadata.actionDuration =
      (program.metadata.actionDuration || 0) + token.duration;
    const currentScene = program.metadata?.scenes?.[state.sceneIndex || 0];
    if (currentScene) {
      currentScene.actionDuration =
        (currentScene.actionDuration || 0) + token.duration;
    }
  }
  if (token.type === "dialogue") {
    token.duration = calculateSpeechDuration(token.text);
    program.metadata.dialogueDuration =
      (program.metadata.dialogueDuration || 0) + token.duration;
    const currentScene = program.metadata?.scenes?.[state.sceneIndex || 0];
    if (currentScene) {
      currentScene.dialogueDuration =
        (currentScene.dialogueDuration || 0) + token.duration;
    }
  }
  state.displayToken = token;
  if (token.type === "dialogue_asset" || token.type === "action_asset") {
    token.autoAdvance = true;
    token.clearPreviousText = false;
    token.wait = false;
    return;
  }
  if (token.content?.[0] === "&") {
    const contentMatch = token.content.match(SPARK_REGEX.content_continuation);
    if (contentMatch) {
      const continuePrevious = Boolean(contentMatch[1] || "");
      const validContent = contentMatch[2] || "";
      const endSpaces = contentMatch[3] || "";
      token.content = validContent + endSpaces;
      token.clearPreviousText = !continuePrevious;
    }
  } else {
    token.clearPreviousText = true;
  }
  token.autoAdvance = false;
  token.wait = true;
  token.ignore = false;
  token.skipToNextPreview = false;
  state.prependNext = token.content.endsWith(" ");
  if (state.prependNext) {
    token.content += "\n";
  }
  const validContentFrom =
    contentFrom != null ? contentFrom : token.from + token.offset;
  checkTextExpression(
    program,
    config,
    currentToken,
    currentSectionId,
    token.text,
    validContentFrom
  );
  checkNotes(program, currentToken);
};

const augmentProgram = (program: SparkProgram, config?: SparkParserConfig) => {
  if (!program.objectMap) {
    program.objectMap = config?.augmentations?.objectMap ?? {};
  }
  program.scopes = Array.from(
    new Set([...SPARK_SCOPE_TYPES, ...(config?.augmentations?.scopes || [])])
  );
  if (config?.augmentations?.files) {
    program.files = config.augmentations.files;
    config.augmentations.files.forEach(({ name, src, type, ext }) => {
      config.augmentations ??= {};
      config.augmentations.structs ??= {};
      config.augmentations.structs[name] = {
        from: -1,
        to: -1,
        line: -1,
        base: "",
        type,
        name,
        fields: {
          [".src"]: {
            from: -1,
            to: -1,
            line: -1,
            name: "src",
            type: "string",
            value: src,
            valueText: `"${src}"`,
          },
          [".ext"]: {
            from: -1,
            to: -1,
            line: -1,
            name: "ext",
            type: "string",
            value: ext,
            valueText: `"${ext}"`,
          },
          [".type"]: {
            from: -1,
            to: -1,
            line: -1,
            name: "type",
            type: "string",
            value: type,
            valueText: `"${type}"`,
          },
        },
      };
      config.augmentations.variables ??= {};
      config.augmentations.variables[`.${name}`] = {
        from: -1,
        to: -1,
        line: -1,
        name,
        type: "string",
        value: src,
        scope: "public",
      };
    });
  }
  if (config?.augmentations?.variables) {
    Object.entries(config?.augmentations?.variables).forEach(([id, d]) => {
      program.variables ??= {};
      program.variables[id] = d;
      const parentId = id.split(".").slice(0, -1).join(".") || "";
      program.sections ??= {};
      const parentSection = program.sections[parentId] || createSparkSection();
      program.sections[parentId] = parentSection;
      parentSection.variables ??= {};
      const variables = parentSection.variables;
      if (variables) {
        variables[id] = d;
      }
    });
  }
  if (config?.augmentations?.structs) {
    Object.entries(config?.augmentations?.structs).forEach(([id, d]) => {
      program.structs ??= {};
      program.structs[id] = d;
    });
  }
};

const startsWithArrayMark = <
  T extends { id: string; indent: number; content: string }
>(
  token: T
): boolean => {
  return token.content.trimStart().startsWith("- ");
};

const getParentId = <T extends { id: string; indent: number; content: string }>(
  token: T,
  currentTokens: T[]
): string => {
  let index = currentTokens.length - 1;
  let prevToken = currentTokens[index];
  while (prevToken && prevToken.indent >= token.indent) {
    // search for parent
    index -= 1;
    prevToken = currentTokens[index];
  }
  if (!prevToken) {
    return "";
  }
  if (!startsWithArrayMark(token) && startsWithArrayMark(prevToken)) {
    return prevToken.id.split(".").slice(0, -1).join(".");
  }
  return prevToken.id;
};

const getPrevSiblingToken = <T extends SparkToken>(
  token: T,
  currentTokens: T[]
): T => {
  let index = currentTokens.length - 1;
  let prevToken = currentTokens[index];
  while (prevToken && prevToken.indent > token.indent) {
    // search for previous sibling
    index -= 1;
    prevToken = currentTokens[index];
  }
  return prevToken as T;
};

const updateFieldToken = (
  fieldToken: SparkStructFieldToken,
  currentFieldTokens: SparkStructFieldToken[]
): void => {
  const parentId = getParentId(fieldToken, currentFieldTokens);
  let id = parentId;
  const name = fieldToken.name;
  const valueText = fieldToken.valueText;
  if (fieldToken.mark === "-") {
    const prevSiblingToken = getPrevSiblingToken(
      fieldToken,
      currentFieldTokens
    );
    let arrayIndex = 0;
    if (
      prevSiblingToken &&
      prevSiblingToken.indent === fieldToken.indent &&
      prevSiblingToken.mark === fieldToken.mark
    ) {
      const siblingId = prevSiblingToken.id;
      const siblingPathParts = siblingId.split(".");
      for (let i = siblingPathParts.length - 1; i >= 0; i -= 1) {
        const part = siblingPathParts[i];
        const siblingIndex = Number(part);
        if (!Number.isNaN(siblingIndex)) {
          arrayIndex = siblingIndex + 1;
          const siblingParentId = siblingPathParts.slice(0, i).join(".");
          id = siblingParentId + "." + `${arrayIndex}`;
          break;
        }
      }
    } else {
      id = parentId + "." + `${arrayIndex}`;
    }
    fieldToken.index = arrayIndex;
    if (name && valueText) {
      const rawName = getRawString(name);
      fieldToken.name = rawName;
      id += "." + rawName;
    } else {
      fieldToken.name = `${arrayIndex}`;
    }
    if (!valueText) {
      fieldToken.valueText = name;
    }
  } else if (name) {
    const rawName = getRawString(name);
    id += "." + rawName;
    fieldToken.name = rawName;
  }
  fieldToken.id = id;
};

const hoistDeclarations = (
  program: SparkProgram,
  config: SparkParserConfig | undefined,
  newLineLength: number,
  lines: string[]
) => {
  let currentLevel = -1;
  let currentSectionId = "";
  let currentStructName = "";
  let currentSceneIndex = -1;
  let currentFieldTokens: SparkStructFieldToken[] = [];
  let stateType: string | undefined = "normal";
  let match: RegExpMatchArray | null = null;

  program.metadata.structure = {
    "": {
      type: "section",
      level: -1,
      text: "",
      id: "",
      range: {
        start: { line: 0, character: 0 },
        end: {
          line: lines.length - 1,
          character: Math.max(0, lines[lines.length - 1]?.length ?? 0 - 1),
        },
      },
      selectionRange: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      children: [],
    },
  };

  const existing = program?.sections?.[""];
  const item: SparkSection = {
    ...createSparkSection(),
    ...(existing || EMPTY_OBJECT),
    level: currentLevel,
    from: -1,
    to: -1,
    line: -1,
    indent: 0,
    type: "section",
    returnType: "",
    name: "",
    value: 0,
    variables: existing?.variables || {},
    triggers: existing?.triggers || [],
    children: existing?.children || [],
    tokens: existing?.tokens || [],
  };
  addSection(program, currentSectionId, item, 0, 1);
  const context: SparkParserContext = {
    line: -1,
    from: -1,
    to: -1,
    scopes: [],
    text: "",
    declarations: program,
  };
  let text = "";
  for (context.line = 0; context.line < lines.length; context.line += 1) {
    context.from = context.to + 1;
    text = lines[context.line] || "";
    const to = getTo(
      context.from,
      lines[context.line] || "",
      newLineLength || 0
    );
    context.to = to;
    context.text = text;
    const indent = getIndent(text);

    const latestStructureItem = getLastStructureItem(program);
    if (
      latestStructureItem &&
      latestStructureItem.level != null &&
      latestStructureItem.level >= 0
    ) {
      const prevLineIndex = context.line - 1;
      const prevLine = lines[prevLineIndex] ?? "";
      extendStructureRange(program, latestStructureItem.id, {
        line: Math.max(0, prevLineIndex),
        character: Math.max(0, prevLine.length - 1),
      });
    }

    if ((match = text.match(SPARK_REGEX.label))) {
      const currentToken = createSparkToken("label", newLineLength, {
        content: text,
        line: context.line,
        from: context.from,
      });
      const level = 0;
      const name = match[4] || "";
      const nameFrom = currentToken.from + getStart(match, 4);
      const nameTo = nameFrom + name.length;
      const trimmedName = name.trim();
      if (trimmedName) {
        currentSectionId = `.${trimmedName}`;
      }
      currentLevel = level;
      currentToken.level = level;
      const latestSectionOrLabel = getLastStructureItem(
        program,
        (t) =>
          (t?.type === "section" || t?.type === "label") &&
          (t?.level ?? 0) < currentLevel
      );
      if (latestSectionOrLabel) {
        const selectionRange = {
          start: { line: currentToken.line, character: 0 },
          end: {
            line: currentToken.line,
            character: Math.max(0, text.length - 1),
          },
        };
        const id = latestSectionOrLabel.id + "." + currentToken.line;
        const structureItem: StructureItem = {
          ...(program.metadata.structure[id] || EMPTY_OBJECT),
          type: "label",
          level: currentToken.level,
          text: trimmedName,
          id,
          range: {
            start: { ...selectionRange.start },
            end: { ...selectionRange.end },
          },
          selectionRange,
          children: [],
        };
        latestSectionOrLabel.children.push(id);
        program.metadata.structure[id] = structureItem;
      }
      const newSection: SparkSection = {
        ...createSparkSection(),
        ...(program?.sections?.[currentSectionId] || EMPTY_OBJECT),
        level: currentLevel,
        from: currentToken.from,
        to: currentToken.to,
        line: currentToken.line,
        type: "section",
        returnType: "",
        name: trimmedName,
        variables: program?.sections?.[currentSectionId]?.variables || {},
        triggers: program?.sections?.[currentSectionId]?.triggers || [],
        children: program?.sections?.[currentSectionId]?.children || [],
        tokens: program?.sections?.[currentSectionId]?.tokens || [],
        value: 0,
      };
      if (newSection.name) {
        addSection(program, currentSectionId, newSection, nameFrom, nameTo);
      }
    } else if ((match = text.match(SPARK_REGEX.section))) {
      const currentToken = createSparkToken("section", newLineLength, {
        content: text,
        line: context.line,
        from: context.from,
      });
      const level = match[2]?.length || 0;
      const name = match[4] || "";
      const parametersString = match[6] || "";
      const returnType = match[9] || "";
      const nameFrom = currentToken.from + getStart(match, 4);
      const nameTo = nameFrom + name.length;
      const returnTypeFrom = currentToken.from + getStart(match, 9);
      const returnTypeTo = returnTypeFrom + returnType.length;
      const trimmedName = name.trim();
      if (trimmedName) {
        if (level > currentLevel) {
          currentSectionId += `.${trimmedName}`;
        } else if (level < currentLevel) {
          const grandparentId = currentSectionId
            .split(".")
            .slice(0, -2)
            .join(".");
          currentSectionId = `${grandparentId}.${trimmedName}`;
        } else {
          const parentId = currentSectionId.split(".").slice(0, -1).join(".");
          currentSectionId = `${parentId}.${trimmedName}`;
        }
      }
      currentLevel = level;
      currentToken.level = level;
      const latestSectionOrLabel = getLastStructureItem(
        program,
        (t) =>
          (t?.type === "section" || t?.type === "label") &&
          (t?.level || 0) < currentLevel
      );
      if (latestSectionOrLabel) {
        const selectionRange = {
          start: { line: currentToken.line, character: 0 },
          end: {
            line: currentToken.line,
            character: Math.max(0, text.length - 1),
          },
        };
        const id = latestSectionOrLabel.id + "." + currentToken.line;
        const structureItem: StructureItem = {
          ...(program.metadata.structure[id] || EMPTY_OBJECT),
          type: "section",
          level: currentToken.level,
          text: trimmedName,
          id,
          range: {
            start: { ...selectionRange.start },
            end: { ...selectionRange.end },
          },
          selectionRange,
          children: [],
        };
        latestSectionOrLabel.children.push(id);
        program.metadata.structure[id] = structureItem;
      }
      const newSection: SparkSection = {
        ...createSparkSection(),
        ...(program?.sections?.[currentSectionId] || EMPTY_OBJECT),
        level: currentLevel,
        from: currentToken.from,
        to: currentToken.to,
        line: currentToken.line,
        type: "section",
        returnType: "",
        name: trimmedName,
        variables: program?.sections?.[currentSectionId]?.variables || {},
        triggers: program?.sections?.[currentSectionId]?.triggers || [],
        children: program?.sections?.[currentSectionId]?.children || [],
        tokens: program?.sections?.[currentSectionId]?.tokens || [],
      };
      if (
        returnType === "" ||
        returnType === "string" ||
        returnType === "number" ||
        returnType === "boolean"
      ) {
        newSection.returnType = returnType;
      } else {
        diagnostic(
          program,
          currentToken,
          `Function return type must be 'string', 'number', or 'boolean'`,
          [],
          returnTypeFrom,
          returnTypeTo
        );
      }
      if (newSection.name) {
        addSection(program, currentSectionId, newSection, nameFrom, nameTo);
      }
      const type =
        parametersString.trim().startsWith("[") &&
        parametersString.trim().endsWith("]")
          ? "detector"
          : returnType
          ? "function"
          : parametersString.trim().startsWith("(") &&
            parametersString.trim().endsWith(")")
          ? "method"
          : "section";
      if (type === "detector" && returnType) {
        diagnostic(
          program,
          currentToken,
          `Detectors cannot return a value`,
          [],
          returnTypeFrom,
          returnTypeTo
        );
      }
      const parameters = getParameterNames(
        program,
        config,
        currentToken,
        currentSectionId,
        match,
        6
      );
      newSection.type = type;
      if (newSection.type !== "function" && newSection.type !== "detector") {
        newSection.value = 0;
      }
      newSection.triggers = type === "detector" ? parameters : [];
    } else if ((match = text.match(SPARK_REGEX.variable))) {
      const type = (match[4] || "") as keyof SparkTokenTypeMap;
      const name = match[6] || "";
      let expression = match[10] || "";
      const currentToken = createSparkToken(type, newLineLength, {
        content: text,
        line: context.line,
        from: context.from,
      });
      const typeFrom = currentToken.from + getStart(match, 4);
      const nameFrom = currentToken.from + getStart(match, 6);
      const expressionFrom = currentToken.from + getStart(match, 10);
      expression = stripInlineComments(expression);
      const typeTo = typeFrom + type.length;
      const nameTo = nameFrom + name.length;
      const expressionTo = expressionFrom + expression.length;
      if (name) {
        const tokenType = addVariable(
          program,
          config,
          currentToken,
          currentSectionId,
          name,
          type,
          expression,
          "protected",
          false,
          currentToken.line,
          nameFrom,
          nameTo,
          typeFrom,
          typeTo,
          expressionFrom,
          expressionTo
        );
        if (tokenType) {
          currentToken.type = tokenType;
        }
      }
    } else if ((match = text.match(SPARK_REGEX.scene))) {
      const currentToken = createSparkToken("scene", newLineLength, {
        content: text,
        line: context.line,
        from: context.from,
      });
      currentToken.content = getSceneDisplayedContent(match);
      currentToken.environment = getSceneEnvironment(match);
      const location = getSceneLocation(match);
      const time = getSceneTime(match);
      currentSceneIndex += 1;
      currentToken.scene = currentSceneIndex + 1;
      program.metadata.scenes ??= [];
      program.metadata.scenes.push({
        scene: currentToken.scene,
        name: currentToken.content,
        line: currentToken.line,
        location,
        time,
        actionDuration: 0,
        dialogueDuration: 0,
      });
      program.metadata.lines ??= [];
      program.metadata.lines[currentToken.line] ??= {};
      program.metadata.lines[currentToken.line]!.scene = currentSceneIndex;
      const latestSectionOrLabel = getLastStructureItem(
        program,
        (t) => t?.type === "section" || t?.type === "label"
      );
      if (latestSectionOrLabel) {
        const selectionRange = {
          start: { line: currentToken.line, character: 0 },
          end: {
            line: currentToken.line,
            character: Math.max(0, text.length - 1),
          },
        };
        const id = latestSectionOrLabel.id + "." + currentToken.line;
        const structureItem: StructureItem = {
          ...(program.metadata.structure[id] || EMPTY_OBJECT),
          type: "scene",
          level: currentLevel + 1,
          info: currentToken.environment,
          text: currentToken.content,
          id,
          range: {
            start: { ...selectionRange.start },
            end: { ...selectionRange.end },
          },
          selectionRange,
          children: [],
        };
        latestSectionOrLabel.children.push(id);
        program.metadata.structure[id] = structureItem;
      }
    } else if ((match = text.match(SPARK_REGEX.css))) {
      const currentToken = createSparkToken("css", newLineLength, {
        content: text,
        line: context.line,
        from: context.from,
      });
      // TODO: support multiline expressions
      const expression = stripInlineComments(match[6] || "");
      currentToken.content = getRawString(expression) || "";
      const expressionFrom = currentToken.from + getStart(match, 6);
      const expressionTo = expressionFrom + expression.length;
      addCss(
        program,
        expression,
        currentToken.line,
        expressionFrom,
        expressionTo
      );
    } else if ((match = text.match(SPARK_REGEX.struct))) {
      const type = match[4] || "";
      const name = match[6] || "";
      const base = match[10] || "";
      const colon = match[14] || "";
      const currentToken = createSparkToken("struct", newLineLength, {
        content: text,
        line: context.line,
        from: context.from,
      });
      if (colon) {
        stateType = "struct";
      }
      const nameFrom = currentToken.from + getStart(match, 6);
      const nameTo = nameFrom + name.length;
      const baseFrom = currentToken.from + getStart(match, 10);
      const baseTo = baseFrom + base.length;
      (currentToken as { name: string }).name = name;
      if (name) {
        addStruct(
          program,
          currentToken,
          currentSectionId,
          type,
          name,
          base,
          currentToken.line,
          nameFrom,
          nameTo,
          baseFrom,
          baseTo
        );
      }
      currentStructName = name;
      currentFieldTokens = [];
    } else if (stateType === "struct" && indent.length >= 2) {
      if ((match = text.match(SPARK_REGEX.struct_field))) {
        const currentToken = createSparkToken("struct_field", newLineLength, {
          content: text,
          line: context.line,
          from: context.from,
        });
        const mark = match[2] || "";
        const name = match[4] || "";
        const colonOrEquals = match[6] || "";
        // TODO: support multiline expressions
        const expression = stripInlineComments(match[8] || "");
        const nameFrom = context.from + getStart(match, 4);
        const expressionFrom = context.from + getStart(match, 8);
        const nameTo = nameFrom + name.length;
        const expressionTo = expressionFrom + expression.length;
        if (currentToken.type === "struct_field") {
          currentToken.struct = currentStructName;
          currentToken.mark = mark;
          currentToken.name = name;
          currentToken.valueText = expression;
          updateFieldToken(currentToken, currentFieldTokens);
          if (expression || !colonOrEquals) {
            addField(
              program,
              config,
              currentToken,
              currentSectionId,
              nameFrom,
              nameTo,
              expressionFrom,
              expressionTo
            );
          }
          if (colonOrEquals === ":" && expression.trim()) {
            diagnostic(
              program,
              currentToken,
              `Unexpected expression after colon`,
              [],
              expressionFrom,
              expressionTo
            );
          }
          currentFieldTokens.push(currentToken);
        }
      }
    }

    const isSeparator =
      !text.trim() &&
      ((stateType !== "dialogue" && stateType !== "dual_dialogue") ||
        text.length < 2);
    if (isSeparator) {
      stateType = "normal";
    }
  }

  const latestStructureItem = getLastStructureItem(program);
  if (
    latestStructureItem &&
    latestStructureItem.level != null &&
    latestStructureItem.level >= 0
  ) {
    extendStructureRange(program, latestStructureItem.id, {
      line: context.line,
      character: Math.max(0, text.length - 1),
    });
  }
};

const parseSpark = (
  script: string,
  config?: SparkParserConfig
): SparkProgram => {
  const program: SparkProgram = {
    tokens: [],
    metadata: {},
    diagnostics: [],
    sections: {
      ...SPARK_SYSTEM_METHODS,
    },
  };

  const parseStartTime = Date.now();

  augmentProgram(program, config);

  if (!script) {
    return program;
  }

  const lines = script.split(/\r\n|\r|\n/);

  const newLineLength = script.match(/\r\n/) ? 2 : 1;

  hoistDeclarations(program, config, newLineLength, lines);

  let currentLevel = -1;
  let currentScope: SparkScopeType | "" = "";
  let currentSectionId = "";
  let currentStructName = "";
  let currentFieldTokens: SparkStructFieldToken[] = [];
  let previousToken: SparkToken | undefined;
  let previousNonSeparatorToken: SparkToken | undefined;
  let lastTitlePageToken: SparkToken | undefined;
  let match: RegExpMatchArray | null;
  let text = "";
  let tokenCategory = "none";
  let lastCharacterIndex = -1;
  let dualRight = false;
  let frontMatterStarted = false;
  let isDualDialogue = false;

  const state: SparkParseState = { newLineLength, sceneIndex: -1 };

  let currentToken: SparkToken = createSparkToken("");
  let ignoredLastToken = false;

  const context: SparkParserContext = {
    line: -1,
    from: -1,
    to: -1,
    scopes: [],
    text: "",
    declarations: program,
  };
  for (context.line = 0; context.line < lines.length; context.line += 1) {
    context.from = context.to + 1;
    text = lines[context.line] || "";

    currentToken = createSparkToken("comment", state.newLineLength, {
      content: text,
      line: context.line,
      from: context.from,
    });
    currentToken.content = text;

    context.from = currentToken.from;
    context.to = currentToken.to;
    context.text = text;

    if (
      text.match(SPARK_REGEX.dialogue_terminator) &&
      isSparkDisplayToken(previousToken)
    ) {
      previousToken.autoAdvance = true;
    }

    const isSeparator = !text.trim() && text.length < 2;
    if (isSeparator || text.trim() === "_") {
      state.prependNext = false;
      saveAndClearChoices(
        program,
        config,
        currentToken,
        currentScope,
        currentSectionId,
        state
      );
    }

    if (
      isSeparator ||
      text.trim() === "_" ||
      text.match(SPARK_REGEX.dialogue_terminator)
    ) {
      if (currentScope === "dialogue") {
        if (
          previousToken?.type === "dialogue_parenthetical" ||
          previousToken?.type === "dialogue_asset"
        ) {
          saveAndClearDialogueToken(
            program,
            config,
            currentToken,
            currentScope,
            currentSectionId,
            state,
            createSparkToken("dialogue", state.newLineLength, {
              line: previousToken?.line,
              indent: previousToken?.indent,
              from: context.from,
            })
          );
        }
      }
      if (currentScope === "dialogue") {
        const endDialogueTokenType = isDualDialogue
          ? "dual_dialogue_end"
          : "dialogue_end";
        pushToken(
          program,
          config,
          currentScope,
          currentSectionId,
          createSparkToken(endDialogueTokenType, state.newLineLength, {
            line: previousToken?.line,
            indent: previousToken?.indent,
          }),
          false
        );
      }
      if (currentScope === "dialogue") {
        currentScope = "";
      }

      if (isSeparator) {
        currentScope = "";
        const skip_separator =
          ignoredLastToken &&
          program.tokens.length > 1 &&
          program.tokens[program.tokens.length - 1]?.type === "separator";

        if (ignoredLastToken) {
          ignoredLastToken = false;
        }

        if (skip_separator) {
          continue;
        }

        dualRight = false;
        currentToken.type = "separator";
        saveAndClearAssets(currentToken, state);
        pushToken(
          program,
          config,
          currentScope,
          currentSectionId,
          currentToken
        );
        previousToken = currentToken;
        state.displayToken = undefined;
        continue;
      }
    }

    // top_or_separated = last_was_separator || i === 0;
    tokenCategory = "script";

    if (
      !frontMatterStarted &&
      SPARK_REGEX.front_matter.test(currentToken.content)
    ) {
      currentScope = "front-matter";
      continue;
    }

    if (currentScope === "front-matter") {
      if ((match = currentToken.content.match(SPARK_REGEX.front_matter))) {
        currentScope = "";
        continue;
      } else if (
        (match = currentToken.content.match(SPARK_REGEX.front_matter_entry))
      ) {
        const key = match[2] || "";
        const entry = match[5] || "";
        currentToken.type = key
          .toLowerCase()
          .replace(" ", "_") as SparkTokenType;
        currentToken.content = entry.trim();
        lastTitlePageToken = currentToken;
        const type = currentToken.type as
          | SparkTitleKeyword
          | SparkTitlePosition;
        const keyFormat = TITLE_PAGE_DISPLAY[type];
        currentToken.order = keyFormat?.order || 0;
        if (keyFormat) {
          program.frontMatter ??= {};
          program.frontMatter[keyFormat.position] ??= [];
          if (currentToken.content && !currentToken.text) {
            currentToken.text = currentToken.content;
          }
          program.frontMatter[keyFormat.position]?.push(currentToken);
        }
        frontMatterStarted = true;
        continue;
      } else if (frontMatterStarted) {
        if (lastTitlePageToken) {
          lastTitlePageToken.text +=
            (lastTitlePageToken.text ? "\n" : "") +
            (currentToken.content?.trim() || "");
        }
        continue;
      }
    }

    if (!currentScope) {
      if (currentToken.content.match(SPARK_REGEX.line_break)) {
        tokenCategory = "none";
      } else if (program.metadata?.firstScriptLine === undefined) {
        program.metadata.firstScriptLine = currentToken.line;
      }

      const extensions = config?.extensions || [];
      let customToken = undefined;
      for (let e = 0; e < extensions.length; e += 1) {
        const extension = extensions[e];
        if (extension) {
          const result = extension(context);
          if (result) {
            customToken = result;
          }
        }
      }
      if (customToken) {
        currentToken = {
          ...currentToken,
          ...customToken,
        } as SparkToken;
      } else if ((match = currentToken.content.match(SPARK_REGEX.scene))) {
        currentToken.type = "scene";
        if (currentToken.type === "scene") {
          currentToken.content = getSceneDisplayedContent(match);
          currentToken.environment = getSceneEnvironment(match);
          const extraOffset = currentToken.environment === "other" ? 1 : 0;
          state.sceneIndex += 1;
          processDisplayedContent(
            program,
            config,
            currentToken,
            currentSectionId,
            state,
            currentToken,
            currentToken.from + currentToken.offset + extraOffset
          );
          currentToken.scene = state.sceneIndex + 1;
        }
      } else if (
        currentToken.content.length &&
        currentToken.content[0] === "!"
      ) {
        currentToken.type = "action";
        if (currentToken.type === "action") {
          const content = currentToken.content;
          const extraOffset = 1;
          currentToken.content = content.substring(extraOffset)?.trimStart();
          processDisplayedContent(
            program,
            config,
            currentToken,
            currentSectionId,
            state,
            currentToken,
            currentToken.from + currentToken.offset + extraOffset
          );
        }
      } else if (
        (match = currentToken.content.match(SPARK_REGEX.centered)) ||
        (match = currentToken.content.match(SPARK_REGEX.centered_angle))
      ) {
        currentToken.type = "centered";
        if (currentToken.type === "centered") {
          const content = match[4] || "";
          const contentFrom = currentToken.from + getStart(match, 4);
          currentToken.content = content?.trimStart() || "";
          processDisplayedContent(
            program,
            config,
            currentToken,
            currentSectionId,
            state,
            currentToken,
            contentFrom
          );
        }
      } else if ((match = currentToken.content.match(SPARK_REGEX.transition))) {
        currentToken.type = "transition";
        if (currentToken.type === "transition") {
          const content = match[2] || "";
          const contentFrom = currentToken.from + getStart(match, 2);
          const extraOffset = content[0] === ">" ? 1 : 0;
          currentToken.content = content.substring(extraOffset).trimStart();
          processDisplayedContent(
            program,
            config,
            currentToken,
            currentSectionId,
            state,
            currentToken,
            contentFrom + extraOffset
          );
        }
      } else if ((match = currentToken.content.match(SPARK_REGEX.jump))) {
        const call = match[4] || "";
        const callFrom = currentToken.from + getStart(match, 4);
        currentToken.type = "jump";
        if (currentToken.type === "jump") {
          currentToken.value = call;
          currentToken.calls = getSectionCalls(
            program,
            config,
            currentToken,
            currentSectionId,
            "method",
            call,
            callFrom
          );
        }
      } else if ((match = currentToken.content.match(SPARK_REGEX.repeat))) {
        currentToken.type = "repeat";
      } else if ((match = currentToken.content.match(SPARK_REGEX.return))) {
        currentToken.type = "return";
        if (currentToken.type === "return") {
          let expression = match[4] || "";
          const expressionFrom = currentToken.from + getStart(match, 4);
          expression = stripInlineComments(expression);
          const expressionTo = expressionFrom + expression.length;
          currentToken.value = expression;
          const currentSection = program?.sections?.[currentSectionId];
          const expectedType = currentSection?.returnType;
          if (expression) {
            // TODO: Fence off ~~~~ map syntax so this check is no longer necessary
            if (expression.trim() !== ">") {
              const [ids, context] = getScopedValueContext(
                currentSectionId,
                program.sections
              );
              const colorMetadata = getColorMetadata(
                expression,
                expressionFrom
              );
              if (colorMetadata) {
                program.metadata.colors ??= [];
                program.metadata.colors?.push(colorMetadata);
              }
              const compiler = config?.compiler || defaultCompiler;
              const [result, diagnostics, references] = compiler(
                expression,
                context
              );
              if (references?.length > 0) {
                for (let i = 0; i < references.length; i += 1) {
                  const r = references[i];
                  if (r) {
                    const from = expressionFrom + r.from;
                    const to = expressionFrom + r.to;
                    program.metadata.lines ??= [];
                    program.metadata.lines[currentToken.line] ??= {};
                    program.metadata.lines[currentToken.line]!.references ??=
                      [];
                    program.metadata.lines[
                      currentToken.line
                    ]!.references!?.push({
                      from,
                      to,
                      name: r.content,
                      id: ids[r.content],
                    });
                  }
                }
              }
              if (diagnostics?.length > 0) {
                for (let i = 0; i < diagnostics.length; i += 1) {
                  const d = diagnostics[i];
                  if (d) {
                    const from = expressionFrom + d.from;
                    const to = expressionFrom + d.to;
                    diagnostic(
                      program,
                      currentToken,
                      d.message,
                      undefined,
                      from,
                      to
                    );
                  }
                }
              }
              const resultType = typeof result;
              if (result != null && resultType !== expectedType) {
                const message = expectedType
                  ? `Function expects to return a '${expectedType}' but returns a '${resultType}'`
                  : `${capitalize(
                      currentSection?.type || "section"
                    )} cannot return a value`;
                diagnostic(
                  program,
                  currentToken,
                  message,
                  undefined,
                  expressionFrom,
                  expressionTo
                );
              }
            }
          } else if (expectedType) {
            const message = `Function expects to return a '${expectedType}' but returns nothing`;
            diagnostic(program, currentToken, message);
          } else if (!expectedType) {
            const message = `${capitalize(
              currentSection?.type || "section"
            )}s cannot return`;
            diagnostic(program, currentToken, message);
          }
        }
      } else if ((match = currentToken.content.match(SPARK_REGEX.css))) {
        const type = "css";
        currentToken.type = type;
        if (currentToken.type === type) {
          // TODO: support multiline expressions
          const expression = stripInlineComments(match[6] || "");
          currentToken.content = getRawString(expression) || "";
        }
      } else if ((match = currentToken.content.match(SPARK_REGEX.choice))) {
        currentToken.type = "choice";
        if (currentToken.type === "choice") {
          const mark = (match[2] || "") as "+";
          const content = match[4] || "";
          const call = match[8] || "";
          const callFrom = currentToken.from + getStart(match, 8);
          currentToken.operator = mark;
          currentToken.content = content;
          currentToken.value = call;
          currentToken.calls = getSectionCalls(
            program,
            config,
            currentToken,
            currentSectionId,
            "method",
            call,
            callFrom
          );
          currentToken.order = state.choiceTokens?.length || 0;
          checkTextExpression(
            program,
            config,
            currentToken,
            currentSectionId,
            currentToken.content,
            callFrom
          );
          currentToken.content = currentToken.content?.trim();
          pushChoice(
            program,
            config,
            currentScope,
            currentSectionId,
            state,
            currentToken
          );
        }
      } else if ((match = currentToken.content.match(SPARK_REGEX.condition))) {
        currentToken.type = "condition";
        if (currentToken.type === "condition") {
          const check = match[4] || "";
          let expression = match[6] || "";
          const checkFrom = currentToken.from + getStart(match, 4);
          const expressionFrom = currentToken.from + getStart(match, 6);
          expression = stripInlineComments(expression);
          const checkTo = checkFrom + check.length;
          currentToken.check = (check as "if" | "elseif" | "else") || "close";
          currentToken.value = expression;
          if (check === "elseif" || check === "else") {
            const startIndex = program.tokens.length;
            let index = startIndex;
            let lastToken = program.tokens[index - 1];
            let valid = false;
            while (lastToken && lastToken?.type !== "section") {
              if (
                lastToken?.type !== "condition" &&
                lastToken?.type !== "separator" &&
                lastToken?.indent <= currentToken.indent
              ) {
                break;
              } else if (
                lastToken?.type === "condition" &&
                lastToken?.indent === currentToken.indent
              ) {
                if (lastToken?.check === "else") {
                  break;
                } else if (
                  lastToken?.check === "elseif" ||
                  lastToken?.check === "if"
                ) {
                  valid = true;
                  break;
                }
              }
              index -= 1;
              lastToken = program.tokens[index];
            }
            if (!valid) {
              diagnostic(
                program,
                currentToken,
                `'${check}' must be preceded by an 'if' on the same indent level`,
                undefined,
                checkFrom,
                checkTo
              );
            }
          }
          if (check === "else" && expression) {
            diagnostic(
              program,
              currentToken,
              "'else' cannot have a condition. Use elseif instead.",
              undefined,
              checkFrom,
              checkTo
            );
          } else if (expression) {
            checkExpressionValue(
              program,
              config,
              currentToken,
              currentSectionId,
              expression,
              expressionFrom
            );
          }
        }
      } else if ((match = currentToken.content.match(SPARK_REGEX.variable))) {
        const declaredType = (match[4] || "") as SparkVariableType;
        const name = match[6] || "";
        const operator = (match[6] || "") as "=";
        let expression = match[14] || "";
        expression = stripInlineComments(expression);
        if (declaredType) {
          currentToken.type = declaredType;
          if (currentToken.type === declaredType) {
            currentToken.name = name;
            currentToken.type = declaredType;
            currentToken.operator = operator;
            currentToken.value = expression;
          }
        }
      } else if ((match = currentToken.content.match(SPARK_REGEX.call))) {
        currentToken.type = "call";
        if (currentToken.type === "call") {
          const call = match.slice(4, 6).join("");
          const callFrom = currentToken.from + getStart(match, 4);
          currentToken.value = call;
          currentToken.calls = getSectionCalls(
            program,
            config,
            currentToken,
            currentSectionId,
            "function",
            call,
            callFrom
          );
        }
      } else if (
        (match = currentToken.content.match(SPARK_REGEX.assign_variable))
      ) {
        currentToken.type = "assign";
        if (currentToken.type === "assign") {
          const name = match[4] || "";
          const operator = match[6] || "";
          let expression = match[8] || "";
          const nameFrom = currentToken.from + getStart(match, 4);
          const expressionFrom = currentToken.from + getStart(match, 8);
          expression = stripInlineComments(expression);
          const nameTo = nameFrom + name.length;
          const expressionTo = expressionFrom + expression.length;
          currentToken.name = name;
          currentToken.operator = operator;
          currentToken.value = expression;
          const [, found] = getVariableValueOrReference(
            program,
            currentToken,
            currentSectionId,
            name,
            nameFrom,
            nameTo
          );
          if (found) {
            getVariableExpressionValue(
              program,
              config,
              currentToken,
              currentSectionId,
              expression,
              expressionFrom,
              expressionTo,
              found,
              nameFrom,
              nameTo
            );
            currentToken.value = expression;
          }
        }
      } else if ((match = currentToken.content.match(SPARK_REGEX.struct))) {
        const name = match[6] || "";
        const colon = match[14] || "";
        if (colon) {
          currentScope = "struct";
        }
        currentToken.type = "struct";
        if (currentToken.type === "struct") {
          currentToken.name = name;
        }
        currentStructName = name;
      } else if ((match = currentToken.content.match(SPARK_REGEX.label))) {
        currentToken.type = "label";
        if (currentToken.type === "label") {
          const name = match[4] || "";
          const level = 0;
          const trimmedName = name.trim();
          currentToken.content = trimmedName;
          if (trimmedName) {
            currentSectionId = `.${trimmedName}`;
          }
          currentLevel = level;
          currentToken.level = level;
        }
      } else if ((match = currentToken.content.match(SPARK_REGEX.section))) {
        currentToken.type = "section";
        if (currentToken.type === "section") {
          const mark = match[2] || "";
          const markSpace = match[3] || "";
          const name = match[4] || "";
          const level = mark.length;
          const markFrom = currentToken.from + getStart(match, 2);
          const markTo = markFrom + mark.length;
          const trimmedName = name.trim();
          currentToken.content = trimmedName;
          if (level > 1 && level > currentLevel + 1) {
            const validMark = "#".repeat(currentLevel + 1);
            const insert = `${validMark}`;
            diagnostic(
              program,
              currentToken,
              `Child Section must be level ${validMark.length} or less`,
              [
                {
                  name: "FIX",
                  changes: [
                    {
                      from: markFrom,
                      to: markTo,
                      insert: "",
                    },
                    {
                      from: markFrom,
                      insert,
                    },
                  ],
                },
              ],
              markFrom,
              markTo
            );
            if (markSpace) {
              currentSectionId += `.${trimmedName}`;
            }
          } else {
            if (trimmedName) {
              if (level > currentLevel) {
                currentSectionId += `.${trimmedName}`;
              } else if (level < currentLevel) {
                const grandparentId = currentSectionId
                  .split(".")
                  .slice(0, -2)
                  .join(".");
                currentSectionId = `${grandparentId}.${trimmedName}`;
              } else {
                const parentId = currentSectionId
                  .split(".")
                  .slice(0, -1)
                  .join(".");
                currentSectionId = `${parentId}.${trimmedName}`;
              }
            }
          }
          currentLevel = level;
          currentToken.level = level;
        }
      } else if ((match = currentToken.content.match(SPARK_REGEX.page_break))) {
        currentToken.type = "page_break";
        currentToken.content = match[3] || "";
      } else if (
        !currentScope &&
        currentToken.content.match(SPARK_REGEX.dialogue_character) &&
        context.line !== lines.length &&
        context.line !== lines.length - 1 &&
        (lines[context.line + 1]?.trim().length === 0
          ? lines[context.line + 1] === "  "
          : true) &&
        lines[context.line]?.match(SPARK_REGEX.indent)?.[0]?.length ===
          lines[context.line + 1]?.match(SPARK_REGEX.indent)?.[0]?.length
      ) {
        // The last part of the above statement ('(lines[i + 1].trim().length == 0) ? (lines[i+1] == "  ") : false)')
        // means that if the trimmed length of the following line (i+1) is equal to zero, the statement will only return 'true',
        // and therefore consider the token as a character, if the content of the line is exactly two spaces.
        // If the trimmed length is larger than zero, then it will be accepted as dialogue regardless
        currentScope = "dialogue";
        isDualDialogue = false;
        currentToken.type = "dialogue_character";
        if (currentToken.type === "dialogue_character") {
          currentToken.content = currentToken.content;
          currentToken.skipToNextPreview = true;
          if (currentToken.content[currentToken.content.length - 1] === "^") {
            currentScope = "dialogue";
            isDualDialogue = true;
            // update last dialogue to be dual:left
            let index = lastCharacterIndex;
            let lastCharacterToken = program.tokens[index];
            while (
              lastCharacterToken?.type === "dialogue_character" ||
              lastCharacterToken?.type === "dialogue_parenthetical" ||
              lastCharacterToken?.type === "dialogue" ||
              lastCharacterToken?.type === "dialogue_asset"
            ) {
              lastCharacterToken.position = "left";
              lastCharacterToken.autoAdvance = true;
              index += 1;
              lastCharacterToken = program.tokens[index];
            }
            // update last dialogue_start to be dual_dialogue_start and remove last dialogue_end
            let foundMatch = false;
            let temp_index = program.tokens.length;
            temp_index -= 1;
            while (!foundMatch) {
              temp_index -= 1;
              switch (program.tokens[temp_index]?.type) {
                case "dialogue_end":
                  program.tokens.splice(temp_index);
                  temp_index -= 1;
                  break;
                case "separator":
                  break;
                case "dialogue_character":
                  break;
                case "dialogue_parenthetical":
                  break;
                case "dialogue":
                  break;
                case "dialogue_start": {
                  const t = program.tokens[temp_index];
                  if (t) {
                    t.type = "dual_dialogue_start";
                    foundMatch = true;
                  }
                  break;
                }
                default:
                  foundMatch = false;
              }
            }
            dualRight = true;
            currentToken.position = "right";
            currentToken.content = currentToken.content.replace(/\^$/, "");
          } else {
            pushToken(
              program,
              config,
              currentScope,
              currentSectionId,
              createSparkToken("dialogue_start", state.newLineLength, {
                line: currentToken?.line,
                indent: currentToken?.indent,
              }),
              false
            );
          }
          const character: string = trimCharacterExtension(
            currentToken.content
          ).trim();
          const characterName = character.replace(/[\^]$/, "").trim();
          program.metadata.characters ??= {};
          program.metadata.characters[characterName] ??= {};
          program.metadata.characters[characterName]!.name = characterName;
          program.metadata.characters[characterName]!.lines ??= [];
          program.metadata.characters[characterName]!.lines!.push(
            currentToken.line
          );
          state.character = currentToken.content;
          lastCharacterIndex = program.tokens.length;
          program.metadata.lines ??= [];
          program.metadata.lines[currentToken.line] ??= {};
          program.metadata.lines[currentToken.line]!.character = characterName;
        }
      } else if (
        currentToken.content?.match(SPARK_REGEX.note_inline) &&
        !currentToken.content?.replace(SPARK_REGEX.note_inline, "")?.trim()
      ) {
        currentToken.type = "assets";
        if (currentToken.type === "assets") {
          currentToken.skipToNextPreview = false;
          pushAssets(program, currentToken, state);
          processDisplayedContent(
            program,
            config,
            currentToken,
            currentSectionId,
            state,
            currentToken
          );
          saveAndClearAssets(currentToken, state);
        }
      } else {
        if (
          currentToken.content?.trim() === "/*" ||
          currentToken.content?.trim() === "*/"
        ) {
          currentToken.ignore = true;
        } else {
          currentToken.type = "action";
          if (currentToken.type === "action") {
            if (previousToken?.type === "assets") {
              previousToken.type = "action_asset" as "assets";
              previousToken.skipToNextPreview = true;
              currentToken.assets = previousToken.assets
                ? [...previousToken.assets]
                : [];
            }
            processDisplayedContent(
              program,
              config,
              currentToken,
              currentSectionId,
              state,
              currentToken
            );
            saveAndClearAssets(currentToken, state);
          }
        }
      }
    } else if (currentScope === "dialogue") {
      if (
        currentToken.content?.match(SPARK_REGEX.note_inline) &&
        !currentToken.content?.replace(SPARK_REGEX.note_inline, "")?.trim()
      ) {
        currentToken.type = "dialogue_asset";
        if (currentToken.type === "dialogue_asset") {
          currentToken.skipToNextPreview = true;
          pushAssets(program, currentToken, state);
          processDisplayedContent(
            program,
            config,
            currentToken,
            currentSectionId,
            state,
            currentToken
          );
        }
      } else if (
        (match = currentToken.content.match(SPARK_REGEX.dialogue_parenthetical))
      ) {
        currentToken.type = "dialogue_parenthetical";
        const openParen = match[2] || "";
        const content = match[3] || "";
        const closeParen = match[4] || "";
        currentToken.content = openParen + content + closeParen;
        currentToken.skipToNextPreview = true;
        state.parenthetical = currentToken.content;
      } else {
        currentToken.type = "dialogue";
        if (currentToken.type === "dialogue") {
          processDisplayedContent(
            program,
            config,
            currentToken,
            currentSectionId,
            state,
            currentToken
          );
          saveAndClearAssets(currentToken, state);
          if (state.character) {
            currentToken.character = state.character;
          }
          if (state.parenthetical) {
            currentToken.parenthetical = state.parenthetical;
          }
          state.parenthetical = undefined;
        }
      }
      if (dualRight) {
        if (currentToken.type === "dialogue_parenthetical") {
          currentToken.position = "right";
        }
        if (currentToken.type === "dialogue") {
          currentToken.position = "right";
          currentToken.wait = true;
        }
      }
    } else if (currentScope === "struct") {
      if ((match = currentToken.content.match(SPARK_REGEX.struct_field))) {
        const mark = match[2] || "";
        const name = match[4] || "";
        // TODO: support multiline expressions
        const expression = stripInlineComments(match[8] || "");
        currentToken.type = "struct_field";
        if (currentToken.type === "struct_field") {
          currentToken.struct = currentStructName;
          currentToken.mark = mark;
          currentToken.name = name;
          currentToken.valueText = expression;
          updateFieldToken(currentToken, currentFieldTokens);
          currentFieldTokens.push(currentToken);
          const field =
            program.structs?.[currentStructName]?.fields[currentToken.id];
          if (field) {
            field.from = currentToken.from;
            field.to = currentToken.to;
          }
        }
      } else {
        if (currentToken.content?.trim()) {
          diagnostic(
            program,
            currentToken,
            `Invalid ${currentScope} field syntax`
          );
        }
      }
    }

    if (
      currentToken.type === "dialogue" &&
      currentToken.content.trim() !== ""
    ) {
      currentToken.content = currentToken.content?.trimStart();
    }

    if (
      previousNonSeparatorToken &&
      currentToken.indent < previousNonSeparatorToken?.indent
    ) {
      let indent = (previousNonSeparatorToken?.indent || 0) - 1;
      while (currentToken.indent <= indent) {
        pushToken(
          program,
          config,
          currentScope,
          currentSectionId,
          createSparkToken("condition", state.newLineLength, {
            line: currentToken?.line,
            check: "close",
            indent,
            from: currentToken?.from,
            to: currentToken?.from,
          }),
          false
        );
        indent -= 1;
      }
    }
    if (
      previousNonSeparatorToken &&
      currentToken.indent > previousNonSeparatorToken?.indent &&
      previousNonSeparatorToken.type !== "condition" &&
      currentToken.type === "condition"
    ) {
      let lineIndex = context.line;
      let from = currentToken.from;
      let to = currentToken.from;
      while (lineIndex < lines.length) {
        const line = lines[lineIndex];
        if (!line) {
          break;
        }
        const indentMatch = line?.match(SPARK_REGEX.indent);
        const indentText = indentMatch?.[0] || "";
        const offset = indentText.length;
        const indent = Math.floor(offset / 2);
        if (indent <= previousNonSeparatorToken.indent) {
          break;
        }
        from = to + offset;
        to = from + line.length - offset + 1;
        diagnostic(
          program,
          currentToken,
          `Unreachable Code`,
          undefined,
          from,
          to,
          "warning"
        );
        lineIndex += 1;
      }
    }

    const currentSection = program?.sections?.[currentSectionId];
    if (
      currentSection?.type === "function" ||
      currentSection?.type === "detector"
    ) {
      if (SPARK_DISPLAY_TOKEN_TYPES.includes(currentToken.type)) {
        diagnostic(
          program,
          currentToken,
          `Display commands are not allowed in ${currentSection.type}s`
        );
      }
      if (SPARK_FLOW_TOKEN_TYPES.includes(currentToken.type)) {
        diagnostic(
          program,
          currentToken,
          `Flow commands are not allowed in ${currentSection.type}s`
        );
      }
    }

    if (tokenCategory === "script") {
      if (["scene", "transition"].includes(currentToken.type)) {
        currentToken.content = currentToken.content.toUpperCase();
        frontMatterStarted = true; // ignore title tags after first heading
      }
      if (
        currentToken.content &&
        currentToken.content[0] === "~" &&
        currentToken.content[1] !== "~"
      ) {
        currentToken.content = `*${currentToken.content.substring(1)}*`;
      }

      if (currentToken.ignore) {
        ignoredLastToken = true;
      } else {
        ignoredLastToken = false;
        pushToken(
          program,
          config,
          currentScope,
          currentSectionId,
          currentToken
        );
        previousToken = currentToken;
        previousNonSeparatorToken = currentToken;
      }
    }
  }

  if (currentScope === "dialogue") {
    if (
      previousToken?.type === "dialogue_parenthetical" ||
      previousToken?.type === "dialogue_asset"
    ) {
      saveAndClearDialogueToken(
        program,
        config,
        currentToken,
        currentScope,
        currentSectionId,
        state,
        createSparkToken("dialogue", state.newLineLength, {
          line: previousToken?.line,
          indent: previousToken?.indent,
          from: context.from,
        })
      );
    }
  }

  saveAndClearChoices(
    program,
    config,
    currentToken,
    currentScope,
    currentSectionId,
    state
  );

  if (currentScope === "dialogue") {
    const endDialogueTokenType = isDualDialogue
      ? "dual_dialogue_end"
      : "dialogue_end";
    pushToken(
      program,
      config,
      currentScope,
      currentSectionId,
      createSparkToken(endDialogueTokenType, state.newLineLength, {
        line: currentToken?.line,
        indent: currentToken?.indent,
      }),
      false
    );
    state.character = undefined;
    state.parenthetical = undefined;
  }

  // tidy up separators

  if (!frontMatterStarted) {
    program.frontMatter = undefined;
  }

  // clean separators at the end
  while (
    program.tokens.length > 0 &&
    program.tokens[program.tokens.length - 1]?.type === "separator"
  ) {
    program.tokens.pop();
  }

  program.diagnostics.forEach((diagnostic) => {
    if (program.metadata.structure) {
      Object.values(program.metadata.structure).forEach((chunk) => {
        if (
          diagnostic.line >= chunk.range.start.line &&
          diagnostic.line <= chunk.range.end.line
        ) {
          if (
            SEVERITY_ORDER.indexOf(diagnostic.severity) >
            SEVERITY_ORDER.indexOf(chunk?.state || "")
          ) {
            chunk.state = diagnostic.severity;
          }
        }
      });
    }
  });

  const parseEndTime = Date.now();
  program.metadata.parseTime = parseEndTime;
  program.metadata.parseDuration = parseEndTime - parseStartTime;
  program.objectMap ??= {};
  updateObjectMap(program.objectMap, program.structs);

  // console.log(program);

  return program;
};

export default parseSpark;

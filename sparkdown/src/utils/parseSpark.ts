/* eslint-disable no-cond-assign */
/* eslint-disable prefer-destructuring */
/* eslint-disable no-continue */
import { displayTokenTypes } from "../constants/displayTokenTypes";
import { flowTokenTypes } from "../constants/flowTokenTypes";
import { titlePageDisplay } from "../constants/pageTitleDisplay";
import { reservedKeywords } from "../constants/reservedKeywords";
import { sparkRegexes } from "../constants/sparkRegexes";
import { defaultCompiler } from "../defaults/defaultCompiler";
import { defaultFormatter } from "../defaults/defaultFormatter";
import { SparkAction, SparkDiagnostic } from "../types/SparkDiagnostic";
import { SparkField } from "../types/SparkField";
import { SparkParserConfig } from "../types/SparkParserConfig";
import { SparkParseResult } from "../types/SparkParseResult";
import { SparkSection } from "../types/SparkSection";
import { SparkStruct } from "../types/SparkStruct";
import { SparkStructType } from "../types/SparkStructType";
import { SparkTitleKeyword } from "../types/SparkTitleKeyword";
import { SparkTitlePosition } from "../types/SparkTitlePosition";
import {
  SparkChoiceToken,
  SparkDialogueToken,
  SparkDisplayToken,
  SparkToken,
} from "../types/SparkToken";
import { SparkTokenType } from "../types/SparkTokenType";
import { SparkVariable } from "../types/SparkVariable";
import { SparkVariableType } from "../types/SparkVariableType";
import { StructureItem } from "../types/StructureItem";
import { calculateSpeechDuration } from "./calculateSpeechDuration";
import { createSparkLine } from "./createSparkLine";
import { createSparkSection } from "./createSparkSection";
import { createSparkToken } from "./createSparkToken";
import { getExpressionCallMatch } from "./getExpressionCallMatch";
import { getPrimitiveType } from "./getPrimitiveType";
import { getScopedContext } from "./getScopedContext";
import { getScopedValueContext } from "./getScopedValueContext";
import { isAssetType } from "./isAssetType";
import { isSparkDisplayToken } from "./isSparkDisplayToken";
import { isStructType } from "./isStructType";
import { isTagType } from "./isTagType";
import { isVariableType } from "./isVariableType";
import { stripBlockComments } from "./stripBlockComments";
import { stripInlineComments } from "./stripInlineComments";
import { trimCharacterExtension } from "./trimCharacterExtension";
import { trimCharacterForceSymbol } from "./trimCharacterForceSymbol";
import { SparkParseState } from "../types/SparkParseState";
import { getTo } from "./getTo";
import { getScopedItemId } from "./getScopedItemId";

const EMPTY_OBJECT = {};

const diagnostic = (
  parsed: {
    diagnostics?: SparkDiagnostic[];
  },
  currentToken: { from: number; to: number; line: number; offset?: number },
  message: string,
  actions?: SparkAction[],
  from = -1,
  to = -1,
  severity: "error" | "warning" | "info" = "error"
): void => {
  if (from < 0 || to < 0) {
    return;
  }
  if (!parsed.diagnostics) {
    parsed.diagnostics = [];
  }
  const lineStart = (currentToken.from || 0) + (currentToken.offset || 0);
  let validFrom = Math.max(0, from >= 0 ? from : lineStart);
  const validTo = to >= 0 ? to : currentToken.to;
  if (validFrom === validTo && lineStart < validTo) {
    validFrom = lineStart;
  }
  const source = `${severity.toUpperCase()}: line ${currentToken.line} column ${
    validFrom - currentToken.from
  }`;
  if (validFrom < validTo) {
    parsed.diagnostics.push({
      from: validFrom,
      to: validTo,
      severity,
      source,
      message,
      actions,
    });
  } else if (currentToken.from < currentToken.to) {
    parsed.diagnostics.push({
      from: currentToken.from,
      to: currentToken.to,
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
  parsed: {
    diagnostics?: SparkDiagnostic[];
  },
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
    if (existingLine >= 0 && !found.imported) {
      diagnostic(
        parsed,
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
  parsed: SparkParseResult,
  currentToken: { from: number; to: number; line: number; offset?: number },
  currentSectionId: string,
  name: string,
  from: number,
  to: number,
  sectionId?: string
): boolean => {
  const validSectionId = sectionId != null ? sectionId : currentSectionId;
  if (reservedKeywords.includes(name)) {
    if (!parsed.diagnostics) {
      parsed.diagnostics = [];
    }
    diagnostic(
      parsed,
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
      parsed,
      currentToken,
      "struct",
      findStruct(parsed.structs, name) as T,
      from,
      to
    )
  ) {
    return false;
  }
  if (
    lintNameUnique<T>(
      parsed,
      currentToken,
      "section",
      findSection(
        parsed.sections,
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
      parsed,
      currentToken,
      "variable",
      findVariable(parsed.variables, validSectionId, name) as T,
      from,
      to
    )
  ) {
    return false;
  }
  return true;
};

const addSection = (
  parsed: SparkParseResult,
  currentSectionId: string,
  section: SparkSection,
  nameFrom: number,
  nameTo: number
): void => {
  const id = currentSectionId;
  if (!parsed.sections) {
    parsed.sections = {};
  }
  if (!parsed.references) {
    parsed.references = {};
  }
  if (!parsed.references[section.line]) {
    parsed.references[section.line] = [];
  }
  parsed.references[section.line]?.push({
    from: nameFrom,
    to: nameTo,
    name: section.name,
    id,
    declaration: true,
  });
  if (id) {
    const parentId = id.split(".").slice(0, -1).join(".");
    section.parent = parentId;
    const parentSection = parsed.sections[parentId];
    if (parentSection) {
      if (!parentSection.children) {
        parentSection.children = [];
      }
      parentSection.children.push(id);
      if (
        section.type !== "function" &&
        (parentSection.type === "detector" || parentSection.type === "function")
      ) {
        diagnostic(
          parsed,
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
    !lintName(parsed, section, currentSectionId, section.name, nameFrom, nameTo)
  ) {
    return;
  }
  section.index = Object.keys(parsed.sections).length;
  parsed.sections[id] = section;
  if (!parsed.sectionLines) {
    parsed.sectionLines = {};
  }
  if (!parsed.sectionLines[section.line]) {
    parsed.sectionLines[section.line] = id;
  }
};

const getSection = (
  parsed: SparkParseResult,
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
  const id = findSectionId(parsed.sections, currentSectionId, name);
  const found = parsed.sections?.[id || ""];
  if (!parsed.references) {
    parsed.references = {};
  }
  if (!parsed.references[currentToken.line]) {
    parsed.references[currentToken.line] = [];
  }
  parsed.references[currentToken.line]?.push({ from, to, name, id });
  if (!found) {
    diagnostic(
      parsed,
      currentToken,
      `Cannot find ${type === "method" ? "section" : type} named '${name}'`,
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
    if (!parsed.diagnostics) {
      parsed.diagnostics = [];
    }
    diagnostic(
      parsed,
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
  parsed: SparkParseResult,
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
    parsed,
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
    argumentsString.matchAll(sparkRegexes.expression_list)
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
        const [ids, context] = getScopedValueContext(
          currentSectionId,
          parsed.sections
        );
        const compiler = config?.compiler || defaultCompiler;
        const [result, diagnostics, references] = compiler(expression, context);
        if (references?.length > 0) {
          for (let i = 0; i < references.length; i += 1) {
            const r = references[i];
            if (r) {
              const from = expressionFrom + r.from;
              const to = expressionFrom + r.to;
              if (!parsed.references) {
                parsed.references = {};
              }
              if (!parsed.references[currentToken.line]) {
                parsed.references[currentToken.line] = [];
              }
              parsed.references[currentToken.line]?.push({
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
              diagnostic(parsed, currentToken, d.message, undefined, from, to);
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
              parsed,
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
      parsed,
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
  parsed: SparkParseResult,
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
    const block = parsed?.sections?.[currentSectionId];
    const blockIndex = block?.index || 0;
    const entry = parsed?.sections
      ? Object.entries(parsed?.sections)
          .slice(blockIndex + 1)
          .find(
            ([, v]) =>
              v.type === "section" &&
              (v.parent === currentSectionId ||
                (parsed?.sections?.[v.parent || ""]?.index || 0) < blockIndex)
          )
      : undefined;
    const id = entry?.[0];
    if (id == null || id === currentSectionId) {
      diagnostic(
        parsed,
        currentToken,
        "There are no sections after this section",
        undefined,
        expressionFrom,
        expressionFrom + expression.length,
        "warning"
      );
      return { name: expression, values: [] };
    }
    const name = parsed?.sections?.[id]?.name;
    return { name, values: [] };
  }
  if (expression === "[") {
    const parentId = parsed?.sections?.[currentSectionId]?.parent;
    if (parentId != null) {
      const siblingIds = parsed?.sections?.[parentId]?.children;
      const id = siblingIds?.find(
        (x) => parsed?.sections?.[x]?.type === "section"
      );
      if (id != null && id !== currentSectionId) {
        const name = parsed?.sections?.[id]?.name;
        return { name, values: [] };
      }
    }
    diagnostic(
      parsed,
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
    const parentId = parsed?.sections?.[currentSectionId]?.parent;
    if (parentId != null) {
      const siblingIds = parsed?.sections?.[parentId]?.children;
      if (siblingIds) {
        const id = [...siblingIds]
          ?.reverse()
          .find((x) => parsed?.sections?.[x]?.type === "section");
        if (id != null && id !== currentSectionId) {
          const name = parsed?.sections?.[id]?.name;
          return { name, values: [] };
        }
      }
    }
    diagnostic(
      parsed,
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
    const id = parsed?.sections?.[currentSectionId]?.parent;
    if (id != null) {
      const name = parsed?.sections?.[id]?.name;
      return { name, values: [] };
    }
    diagnostic(
      parsed,
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
      parsed,
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
  parsed: SparkParseResult,
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
    parsed.sections
  );
  const compiler = config?.compiler || defaultCompiler;
  const [, diagnostics, references] = compiler(expression, context);
  if (references?.length > 0) {
    for (let i = 0; i < references.length; i += 1) {
      const r = references[i];
      if (r) {
        const from = expressionFrom + r.from;
        const to = expressionFrom + r.to;
        if (!parsed.references) {
          parsed.references = {};
        }
        if (!parsed.references[currentToken.line]) {
          parsed.references[currentToken.line] = [];
        }
        parsed.references[currentToken.line]?.push({
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
        diagnostic(parsed, currentToken, d.message, undefined, from, to);
      }
    }
  }
};

const checkTextExpression = (
  parsed: SparkParseResult,
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
      parsed,
      config,
      currentToken,
      currentSectionId,
      expression,
      expressionFrom
    );
  }
};

const getSectionCalls = (
  parsed: SparkParseResult,
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
    parsed,
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
    parsed.sections
  );
  const formatter = config?.formatter || defaultFormatter;
  const [, , possibleSectionExpressions] = formatter(expression, context);
  const calls: Record<string, { name: string; values: string[] }> = {};
  if (possibleSectionExpressions?.length > 0) {
    possibleSectionExpressions.forEach(({ content, from }) => {
      const { name, values } = getExpressionCallNameAndValues(
        parsed,
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
          parsed,
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
      parsed,
      currentToken,
      "Dynamic sections must be separated by '|'.\n{FirstTime|SecondTime|ThirdTime}",
      undefined,
      expressionFrom,
      expressionFrom + expression.length
    );
  }
  return calls;
};

const getVariableExpressionValue = (
  parsed: SparkParseResult,
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
  const struct = findStruct(parsed.structs, expression);
  if (struct) {
    return { name: struct.name, type: struct.type };
  }
  const { name } = getExpressionCallNameAndValues(
    parsed,
    config,
    currentToken,
    currentSectionId,
    "function",
    expression,
    expressionFrom
  );
  if (name !== undefined) {
    if (variable) {
      const section = findSection(parsed.sections, currentSectionId, name);
      if (
        section != null &&
        variable.type &&
        section.returnType !== variable.type
      ) {
        if (section.returnType) {
          diagnostic(
            parsed,
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
            parsed,
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
        parsed,
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
    parsed.sections
  );
  const compiler = config?.compiler || defaultCompiler;
  const [result, diagnostics, references] = compiler(expression, context);
  if (references?.length > 0) {
    for (let i = 0; i < references.length; i += 1) {
      const r = references[i];
      if (r) {
        const from = expressionFrom + r.from;
        const to = expressionFrom + r.to;
        if (!parsed.references) {
          parsed.references = {};
        }
        if (!parsed.references[currentToken.line]) {
          parsed.references[currentToken.line] = [];
        }
        parsed.references[currentToken.line]?.push({
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
        diagnostic(parsed, currentToken, d.message, undefined, from, to);
      }
    }
  } else if (variable) {
    const resultType = typeof result;
    if (result != null && variable.type) {
      if (resultType !== getPrimitiveType(variable.type)) {
        diagnostic(
          parsed,
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
      } else if (
        isAssetType(variable.type) &&
        typeof result === "string" &&
        !result.startsWith("https://")
      ) {
        diagnostic(
          parsed,
          currentToken,
          `'${variable.type}' variables must be assigned a secure url`,
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
  parsed: SparkParseResult,
  currentToken: SparkToken,
  type: SparkStructType,
  name: string,
  from: number,
  to: number
): SparkStruct | undefined => {
  if (!name) {
    return undefined;
  }
  const id = findStructId(parsed.structs, name);
  const found = parsed.structs?.[id || ""];
  if (!parsed.references) {
    parsed.references = {};
  }
  if (!parsed.references[currentToken.line]) {
    parsed.references[currentToken.line] = [];
  }
  parsed.references[currentToken.line]?.push({ from, to, name, id });
  if (!found) {
    diagnostic(
      parsed,
      currentToken,
      `Cannot find ${type || "struct"} named '${name}'`,
      undefined,
      from,
      to
    );
    return undefined;
  }
  if (type && found.type !== type) {
    diagnostic(
      parsed,
      currentToken,
      `'${name}' is not ${prefixArticle(type)}`,
      [{ name: "FOCUS", focus: { from: found.from, to: found.from } }],
      from,
      to
    );
    return undefined;
  }
  return found;
};

const getVariable = (
  parsed: SparkParseResult,
  currentToken: SparkToken,
  currentSectionId: string,
  type: SparkVariableType | SparkVariableType[] | undefined,
  name: string,
  from: number,
  to: number
): SparkVariable | undefined => {
  if (!name) {
    return undefined;
  }
  const id = findVariableId(parsed.variables, currentSectionId, name);
  const found = parsed.variables?.[id || ""];
  if (!parsed.references) {
    parsed.references = {};
  }
  if (!parsed.references[currentToken.line]) {
    parsed.references[currentToken.line] = [];
  }
  parsed.references[currentToken.line]?.push({ from, to, name, id });
  if (!found) {
    diagnostic(
      parsed,
      currentToken,
      `Cannot find variable named '${name}'`,
      undefined,
      from,
      to
    );
    return undefined;
  }
  if (type) {
    if (Array.isArray(type)) {
      if (!type.includes(found.type)) {
        diagnostic(
          parsed,
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
          parsed,
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
  if (valueText.match(sparkRegexes.string)) {
    return "string";
  }
  if (valueText.match(sparkRegexes.number)) {
    return "number";
  }
  if (valueText.match(sparkRegexes.boolean)) {
    return "boolean";
  }
  return undefined;
};

const getVariableValueOrReference = (
  parsed: SparkParseResult,
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
    parsed,
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

const getImportValue = (content: string): string | undefined => {
  if (!content) {
    return undefined;
  }
  if (content.match(sparkRegexes.string)) {
    return content.slice(1, -1);
  }
  return undefined;
};

const addStruct = (
  parsed: SparkParseResult,
  currentToken: SparkToken,
  currentSectionId: string,
  type: SparkStructType,
  name: string,
  base: string,
  line: number,
  nameFrom: number,
  nameTo: number,
  baseFrom: number,
  baseTo: number
): void => {
  if (!parsed.structs) {
    parsed.structs = {};
  }
  const id = name;
  if (
    !lintName(parsed, currentToken, currentSectionId, name, nameFrom, nameTo)
  ) {
    return;
  }
  if (!parsed.references) {
    parsed.references = {};
  }
  if (!parsed.references[currentToken.line]) {
    parsed.references[currentToken.line] = [];
  }
  parsed.references[currentToken.line]?.push({
    from: nameFrom,
    to: nameTo,
    name,
    id,
    declaration: true,
  });
  if (base) {
    getStruct(parsed, currentToken, type, base, baseFrom, baseTo);
  }
  const existing = parsed?.structs?.[id];
  const item: SparkStruct = {
    ...(existing || EMPTY_OBJECT),
    from: nameFrom,
    to: nameTo,
    line,
    name,
    base,
    type,
    fields: {},
    imported: false,
  };
  parsed.structs[id] = item;
};

const addImport = (
  parsed: SparkParseResult,
  valueText: string,
  line: number,
  valueFrom: number,
  valueTo: number
): void => {
  if (!parsed.structs) {
    parsed.structs = {};
  }
  const value = getImportValue(valueText);
  const validValue = value != null ? value : "";
  const name = "import";
  const existing = parsed?.structs?.[name];
  const fieldId = existing?.fields
    ? Object.keys(existing?.fields).length?.toString()
    : "0";
  const item: SparkStruct = {
    ...(existing || EMPTY_OBJECT),
    from: valueFrom,
    to: valueTo,
    line,
    base: "",
    type: "list",
    name,
    fields: {
      ...(existing?.fields || EMPTY_OBJECT),
      [fieldId]: {
        type: "string",
        value: validValue,
      } as SparkField,
    },
  };
  parsed.structs[name] = item;
};

const addVariable = (
  parsed: SparkParseResult,
  config: SparkParserConfig | undefined,
  currentToken: SparkToken,
  currentSectionId: string,
  name: string,
  type: string,
  valueText: string,
  scope: "public" | "protected" | "private",
  parameter: boolean,
  line: number,
  nameFrom: number,
  nameTo: number,
  typeFrom: number,
  typeTo: number,
  valueFrom: number,
  valueTo: number
): SparkVariableType | null => {
  if (!parsed.variables) {
    parsed.variables = {};
  }
  const prefix = scope === "private" ? "private-" : "";
  const id = `${currentSectionId}.${prefix}${name}`;
  if (
    !lintName(parsed, currentToken, currentSectionId, name, nameFrom, nameTo)
  ) {
    return null;
  }
  if (!parsed.references) {
    parsed.references = {};
  }
  if (!parsed.references[currentToken.line]) {
    parsed.references[currentToken.line] = [];
  }
  parsed.references[currentToken.line]?.push({
    from: nameFrom,
    to: nameTo,
    name,
    id,
    declaration: true,
  });
  const value = getVariableExpressionValue(
    parsed,
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
      ? (validValue as { type: SparkStructType })?.type
      : (typeof validValue as SparkVariableType);
  const variableType = (type || valueType) as SparkVariableType;
  if (!isVariableType(variableType)) {
    const error = `Unrecognized variable type`;
    diagnostic(parsed, currentToken, error, undefined, typeFrom, typeTo);
  } else if (
    (isAssetType(variableType) || isTagType(variableType)) &&
    valueType !== "string"
  ) {
    const error = `${variableType} must be initialized to a string`;
    diagnostic(parsed, currentToken, error, undefined, typeFrom, typeTo);
  } else {
    const existing = parsed?.variables?.[id];
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
      imported: false,
    };
    parsed.variables[id] = item;
    const parentSection = parsed.sections?.[currentSectionId];
    if (parentSection) {
      if (!parentSection.variables) {
        parentSection.variables = {};
      }
      parentSection.variables[id] = item;
    }
  }

  return variableType;
};

const addField = (
  parsed: SparkParseResult,
  config: SparkParserConfig | undefined,
  currentToken: SparkToken,
  currentSectionId: string,
  currentStructFieldId: string,
  name: string | undefined,
  valueText: string,
  line: number,
  indent: number,
  nameFrom: number,
  nameTo: number,
  valueFrom: number,
  valueTo: number
): void => {
  if (!parsed.structs) {
    parsed.structs = {};
  }
  const structName = currentStructFieldId.split(".")[0] || "";
  const struct = parsed.structs[structName];
  if (struct) {
    if (!struct.fields) {
      struct.fields = {};
    }
    const validName = name || String(Object.keys(struct.fields).length);
    const fieldId = `${currentStructFieldId
      .split(".")
      .slice(0, indent)
      .join(".")}.${validName}`;
    const parts = fieldId.split(".");
    parts.shift();
    const id = `${parts.join(".")}`;

    if (
      !lintName(parsed, currentToken, currentSectionId, id, nameFrom, nameTo)
    ) {
      return;
    }
    if (name) {
      if (!parsed.references) {
        parsed.references = {};
      }
      if (!parsed.references[line]) {
        parsed.references[line] = [];
      }
      parsed.references[line]?.push({
        from: nameFrom,
        to: nameTo,
        name,
        id,
        declaration: true,
      });
    }
    const found = struct.fields[id];
    if (found) {
      lintNameUnique(parsed, currentToken, "field", found, nameFrom, nameTo);
    } else {
      const defaultValue =
        struct?.type === "list" || struct?.type === "map" ? validName : "";
      const value = getVariableExpressionValue(
        parsed,
        config,
        currentToken,
        currentSectionId,
        valueText,
        valueFrom,
        valueTo
      );
      const validValue = value != null ? value : defaultValue;
      const validType = typeof validValue as SparkVariableType;
      const existing = parsed?.structs?.[structName]?.fields?.[id];
      const item: SparkField = {
        ...(existing || EMPTY_OBJECT),
        from: nameFrom,
        to: nameTo,
        line,
        name: validName,
        type: validType,
        value: validValue,
        imported: false,
      };
      let curr =
        struct?.type === "list" || struct?.type === "map"
          ? struct
          : parsed.structs[struct.base];
      if (curr) {
        let baseField: SparkField | undefined = undefined;
        while (curr) {
          const fieldIds: string[] =
            struct?.type === "list" || struct?.type === "map"
              ? Object.keys(curr.fields).reverse()
              : [id];
          for (let i = 0; i < fieldIds.length; i += 1) {
            const f = fieldIds[i];
            if (f) {
              baseField = curr?.fields?.[f];
              if (baseField) {
                break;
              }
            }
          }
          if (baseField) {
            break;
          }
          curr = parsed.structs[curr.base];
        }
        const hasValueText = Boolean(valueText?.trim());
        const isValid = !hasValueText || value !== undefined;
        if (
          isValid &&
          validType &&
          baseField?.type &&
          validType !== baseField?.type
        ) {
          diagnostic(
            parsed,
            currentToken,
            struct?.type === "list"
              ? `All list values must be the same type`
              : `Cannot assign a '${validType}' to a '${baseField?.type}' field`,
            [
              {
                name: "FOCUS",
                focus: {
                  from: baseField.from,
                  to: baseField.from,
                },
              },
            ],
            hasValueText ? valueFrom : nameFrom,
            hasValueText ? valueTo : nameTo
          );
        }
      }
      struct.fields[id] = item;
    }
  }
};

const getParameterNames = (
  parsed: SparkParseResult,
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
    parametersString.matchAll(sparkRegexes.expression_list)
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
      parsed,
      currentToken,
      message,
      undefined,
      startFrom,
      startFrom + 1
    );
    diagnostic(parsed, currentToken, message, undefined, endFrom, endFrom + 1);
    return parameterNames;
  }
  if (openMark && closeMark && openMark === "[" && closeMark === ")") {
    const message = "Mismatched brackets";
    diagnostic(
      parsed,
      currentToken,
      message,
      undefined,
      startFrom,
      startFrom + 1
    );
    diagnostic(parsed, currentToken, message, undefined, endFrom, endFrom + 1);
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
      diagnostic(parsed, currentToken, "Empty parameter", [], from, to);
    } else if (
      (parameterMatch = declaration.match(
        lint(sparkRegexes.parameter_declaration)
      ))
    ) {
      const name = parameterMatch[2] || "";
      const type = parameterMatch[6] || "";
      const operator = parameterMatch[8] || "";
      const valueText = parameterMatch[10] || "";
      const nameFrom = from + getStart(parameterMatch, 2);
      const nameTo = nameFrom + name.length;
      const typeFrom = from + getStart(parameterMatch, 6);
      const typeTo = typeFrom + type.length;
      const operatorFrom = from + getStart(parameterMatch, 8);
      const operatorTo = operatorFrom + operator.length;
      const valueFrom = from + getStart(parameterMatch, 10);
      const valueTo = valueFrom + valueText.length;
      if (name) {
        if (detector) {
          getVariable(
            parsed,
            currentToken,
            currentSectionId,
            undefined,
            name,
            nameFrom,
            nameTo
          );
          if (valueText) {
            const error = `Detector dependencies should not be initialized`;
            diagnostic(parsed, currentToken, error, [], valueFrom, valueTo);
          } else if (operator) {
            const error = `Detector dependencies should not be initialized`;
            diagnostic(
              parsed,
              currentToken,
              error,
              [],
              operatorFrom,
              operatorTo
            );
          }
        } else {
          addVariable(
            parsed,
            config,
            currentToken,
            currentSectionId,
            name,
            type,
            valueText,
            "private",
            true,
            currentToken.line,
            nameFrom,
            nameTo,
            typeFrom,
            typeTo,
            valueFrom,
            valueTo
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
        parsed,
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
  parsed: SparkParseResult,
  config: SparkParserConfig | undefined,
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
  if (updateLines) {
    if (!parsed.tokenLines) {
      parsed.tokenLines = {};
    }
    parsed.tokenLines[token.line] = parsed.tokens.length;
  }
  parsed.tokens.push(token);
  if (!parsed.sections) {
    parsed.sections = {};
  }
  const section = parsed.sections[currentSectionId] || createSparkSection();
  parsed.sections[currentSectionId] = section;
  if (!section.tokens) {
    section.tokens = [];
  }
  const tokens = section.tokens;
  if (tokens) {
    tokens.push(token);
  }
};

const checkNotes = (
  parsed: SparkParseResult,
  currentToken: SparkToken,
  currentSectionId: string
): void => {
  const str = currentToken.content;
  if (str?.indexOf("[") >= 0) {
    const noteMatches = str.match(sparkRegexes.note);
    let startIndex = -1;
    if (noteMatches) {
      for (let i = 0; i < noteMatches.length; i += 1) {
        const noteMatch = noteMatches[i] || "";
        const type: SparkVariableType | SparkVariableType[] =
          noteMatch.startsWith("(") ? "audio" : ["image", "graphic"];
        const name = noteMatch.slice(2, noteMatch.length - 2);
        startIndex = str.indexOf(noteMatch, startIndex) + 2;
        const from = currentToken.from + startIndex;
        const to = from + noteMatch.length - 4;
        if (name) {
          getVariable(
            parsed,
            currentToken,
            currentSectionId,
            type,
            name,
            from,
            to
          );
        }
      }
    }
  }
};

const pushAssets = (
  parsed: SparkParseResult,
  currentToken: SparkToken,
  currentSectionId: string,
  state: SparkParseState
): void => {
  const str = currentToken.content;
  const noteMatches = str.match(sparkRegexes.note);
  let startIndex = -1;
  if (noteMatches) {
    for (let i = 0; i < noteMatches.length; i += 1) {
      const noteMatch = noteMatches[i]?.trim() || "";
      const type: SparkVariableType | SparkVariableType[] =
        noteMatch.startsWith("(") ? "audio" : ["image", "graphic"];
      const name = noteMatch.slice(2, noteMatch.length - 2);
      startIndex = str.indexOf(noteMatch, startIndex) + 2;
      const from = currentToken.from + startIndex;
      const to = from + noteMatch.length - 4;
      if (name) {
        getVariable(
          parsed,
          currentToken,
          currentSectionId,
          type,
          name,
          from,
          to
        );
      }
      if (!state.assets) {
        state.assets = [];
      }
      state.assets.push({ name });
    }
  }
};

const saveAndClearAssets = (
  currentToken: SparkToken,
  state: SparkParseState
): void => {
  if (!state.assets) {
    state.assets = [];
  }
  const save = state.assets.length > 0;
  if (
    save &&
    (currentToken.type === "assets" ||
      currentToken.type === "dialogue" ||
      currentToken.type === "action")
  ) {
    if (!currentToken.assets) {
      currentToken.assets = [];
    }
    currentToken.assets = [...currentToken.assets, ...state.assets];
  }
  state.assets.length = 0;
};

const saveAndClearDialogueToken = (
  parsed: SparkParseResult,
  config: SparkParserConfig | undefined,
  currentToken: SparkToken,
  currentSectionId: string,
  state: SparkParseState,
  dialogueToken: SparkDialogueToken
): void => {
  dialogueToken.character = state.character || "";
  dialogueToken.parenthetical = state.parenthetical || "";
  pushToken(parsed, config, currentSectionId, dialogueToken);
  saveAndClearAssets(currentToken, state);
  state.character = undefined;
  state.parenthetical = undefined;
};

const pushChoice = (
  parsed: SparkParseResult,
  config: SparkParserConfig | undefined,
  currentSectionId: string,
  state: SparkParseState,
  choiceToken: SparkChoiceToken
): void => {
  if (!state.choiceTokens) {
    state.choiceTokens = [];
  }
  if (!state.choiceTokens?.length) {
    pushToken(
      parsed,
      config,
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
  parsed: SparkParseResult,
  config: SparkParserConfig | undefined,
  currentToken: SparkToken,
  currentSectionId: string,
  state: SparkParseState
): void => {
  if (!state.choiceTokens) {
    state.choiceTokens = [];
  }
  if (state.choiceTokens.length > 0) {
    pushToken(
      parsed,
      config,
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

const last = <T>(array: T[]): T => {
  return array[array.length - 1] as T;
};

const getLatestSectionOrScene = (
  parsed: SparkParseResult,
  depth: number,
  condition: (token: StructureItem) => boolean = () => true
): StructureItem | null => {
  try {
    if (depth <= 0) {
      return null;
    } else if (depth === 1) {
      if (!parsed.properties) {
        parsed.properties = {};
      }
      if (!parsed.properties.structure) {
        parsed.properties.structure = [];
      }
      const lastItem: StructureItem | null = last(
        parsed.properties.structure.filter(condition)
      );
      return lastItem;
    } else {
      const prevSection = getLatestSectionOrScene(parsed, depth - 1, condition);
      if (prevSection?.children) {
        const lastChild = last(prevSection.children.filter(condition));
        if (lastChild) {
          return lastChild;
        }
      }
      // nest ###xyz inside #abc if there's no ##ijk to nest within
      return prevSection;
    }
  } catch {
    let section: StructureItem | null = null;
    while (!section && depth > 0) {
      section = getLatestSectionOrScene(parsed, --depth, condition);
    }
    return section;
  }
};

const getLatestSection = (
  parsed: SparkParseResult,
  depth: number
): StructureItem | null =>
  getLatestSectionOrScene(parsed, depth, (t) => t.type === "section");

const dialogueOrAssetTypes = ["dialogue", "dialogue_asset"];
const actionOrAssetTypes = ["action", "action_asset"];
const sparkLineKeys = Object.keys(createSparkLine());

const processDisplayedContent = (
  parsed: SparkParseResult,
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
    if (!parsed.properties) {
      parsed.properties = {};
    }
    parsed.properties.actionDuration =
      (parsed.properties.actionDuration || 0) + token.duration;
    const currentScene = parsed.properties?.scenes?.[state.sceneIndex || 0];
    if (currentScene) {
      currentScene.actionDuration =
        (currentScene.actionDuration || 0) + token.duration;
    }
  }
  if (token.type === "dialogue") {
    token.duration = calculateSpeechDuration(token.text);
    if (!parsed.properties) {
      parsed.properties = {};
    }
    parsed.properties.dialogueDuration =
      (parsed.properties.dialogueDuration || 0) + token.duration;
    const currentScene = parsed.properties?.scenes?.[state.sceneIndex || 0];
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
    const contentMatch = token.content.match(sparkRegexes.content_continuation);
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
    parsed,
    config,
    currentToken,
    currentSectionId,
    token.text,
    validContentFrom
  );
  checkNotes(parsed, currentToken, currentSectionId);
};

const augmentResult = (
  parsed: SparkParseResult,
  config?: SparkParserConfig
) => {
  if (config?.augmentations?.variables) {
    Object.entries(config?.augmentations?.variables).forEach(([id, d]) => {
      if (!parsed.variables) {
        parsed.variables = {};
      }
      d.imported = true;
      parsed.variables[id] = d;
      const parentId = id.split(".").slice(0, -1).join(".") || "";
      if (!parsed.sections) {
        parsed.sections = {};
      }
      const parentSection = parsed.sections[parentId] || createSparkSection();
      parsed.sections[parentId] = parentSection;
      if (parentSection && !parentSection.variables) {
        parentSection.variables = {};
      }
      const variables = parentSection.variables;
      if (variables) {
        variables[id] = d;
      }
    });
  }
  if (config?.augmentations?.structs) {
    Object.entries(config?.augmentations?.structs).forEach(([id, d]) => {
      if (!parsed.structs) {
        parsed.structs = {};
      }
      d.imported = true;
      Object.values(d.fields).forEach((f) => {
        f.imported = true;
      });
      parsed.structs[id] = d;
    });
  }
};

const hoistDeclarations = (
  parsed: SparkParseResult,
  config: SparkParserConfig | undefined,
  newLineLength: number,
  lines: string[]
) => {
  let current = 0;
  let currentLevel = 0;
  let currentSectionId = "";
  let currentStructFieldId = "";
  let stateType: string | undefined = "normal";
  let match: RegExpMatchArray | null = null;

  const existing = parsed?.sections?.[""];
  const item: SparkSection = {
    ...createSparkSection(),
    ...(existing || EMPTY_OBJECT),
    level: currentLevel,
    from: current,
    to: getTo(current, "", newLineLength || 0),
    indent: 0,
    line: config?.lineOffset || 0,
    type: "section",
    returnType: "",
    name: "",
    value: 0,
    variables: existing?.variables || {},
    triggers: existing?.triggers || [],
    children: existing?.children || [],
    tokens: existing?.tokens || [],
  };
  addSection(parsed, currentSectionId, item, 0, 1);

  for (let i = 0; i < lines.length; i += 1) {
    const from = current;
    const to = getTo(from, lines[i] || "", newLineLength || 0);
    current = to + 1;
    const text = stripInlineComments(lines[i] || "");

    if ((match = text.match(sparkRegexes.section))) {
      const currentToken = createSparkToken("section", newLineLength, {
        content: text,
        line: i + (config?.lineOffset || 0),
        from: current,
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
        if (level === 0) {
          currentSectionId = trimmedName;
        } else if (level === 1) {
          currentSectionId = `.${trimmedName}`;
        } else if (level > currentLevel) {
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
      const newSection: SparkSection = {
        ...createSparkSection(),
        ...(parsed?.sections?.[currentSectionId] || EMPTY_OBJECT),
        level: currentLevel,
        from: currentToken.from,
        to: currentToken.to,
        line: currentToken.line,
        type: "section",
        returnType: "",
        name: trimmedName,
        variables: parsed?.sections?.[currentSectionId]?.variables || {},
        triggers: parsed?.sections?.[currentSectionId]?.triggers || [],
        children: parsed?.sections?.[currentSectionId]?.children || [],
        tokens: parsed?.sections?.[currentSectionId]?.tokens || [],
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
          parsed,
          currentToken,
          `Function return type must be 'string', 'number', or 'boolean'`,
          [],
          returnTypeFrom,
          returnTypeTo
        );
      }
      if (newSection.name) {
        addSection(parsed, currentSectionId, newSection, nameFrom, nameTo);
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
          parsed,
          currentToken,
          `Detectors cannot return a value`,
          [],
          returnTypeFrom,
          returnTypeTo
        );
      }
      const parameters = getParameterNames(
        parsed,
        config,
        currentToken,
        currentSectionId,
        match,
        8
      );
      newSection.type = type;
      if (newSection.type !== "function" && newSection.type !== "detector") {
        newSection.value = 0;
      }
      newSection.triggers = type === "detector" ? parameters : [];
    } else if ((match = text.match(sparkRegexes.variable))) {
      const name = match[6] || "";
      const type = (match[10] || "") as SparkVariableType;
      const valueText = match[14] || "";
      const currentToken = createSparkToken(type, newLineLength, {
        content: text,
        line: i + (config?.lineOffset || 0),
        from: current,
      });
      if (currentToken.type === type) {
        const nameFrom = currentToken.from + getStart(match, 6);
        const nameTo = nameFrom + name.length;
        const typeFrom = currentToken.from + getStart(match, 10);
        const typeTo = typeFrom + type.length;
        const valueFrom = currentToken.from + getStart(match, 14);
        const valueTo = valueFrom + valueText.length;
        if (name) {
          const tokenType = addVariable(
            parsed,
            config,
            currentToken,
            currentSectionId,
            name,
            type,
            valueText,
            "protected",
            false,
            currentToken.line,
            nameFrom,
            nameTo,
            typeFrom,
            typeTo,
            valueFrom,
            valueTo
          );
          if (tokenType) {
            currentToken.type = tokenType;
          }
        }
      }
    } else if ((match = text.match(sparkRegexes.struct))) {
      const type = match[2] as SparkStructType;
      const currentToken = createSparkToken(type, newLineLength, {
        content: text,
        line: i + (config?.lineOffset || 0),
        from: current,
      });
      const colon = match[12] || "";
      if (colon) {
        stateType = type;
      }
      const name = match[4] || "";
      const base = match[8] || "";
      const nameFrom = currentToken.from + getStart(match, 4);
      const nameTo = nameFrom + name.length;
      const baseFrom = currentToken.from + getStart(match, 8);
      const baseTo = baseFrom + base.length;
      currentToken.name = name;
      if (name) {
        addStruct(
          parsed,
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
      currentStructFieldId = name;
    } else if (isStructType(stateType) && text?.trim()) {
      if ((match = text.match(sparkRegexes.struct_object_field))) {
        const currentToken = createSparkToken(
          "struct_object_field",
          newLineLength,
          {
            content: text,
            line: i + (config?.lineOffset || 0),
            from: current,
          }
        );
        const name = match[2] || "";
        currentStructFieldId = `${currentStructFieldId
          .split(".")
          .slice(0, currentToken.indent)
          .join(".")}.${name}`;
      } else if (
        stateType !== "list" &&
        (match = text.match(sparkRegexes.struct_value_field))
      ) {
        const currentToken = createSparkToken(
          "struct_value_field",
          newLineLength,
          {
            content: text,
            line: i + (config?.lineOffset || 0),
            from: current,
          }
        );
        const name = match[2] || "";
        const valueText = match[6] || "";
        const nameFrom = currentToken.from + getStart(match, 2);
        const nameTo = nameFrom + name.length;
        const valueFrom = currentToken.from + getStart(match, 6);
        const valueTo = valueFrom + valueText.length;
        addField(
          parsed,
          config,
          currentToken,
          currentSectionId,
          currentStructFieldId,
          name,
          valueText,
          currentToken.line,
          currentToken.indent,
          nameFrom,
          nameTo,
          valueFrom,
          valueTo
        );
      } else if (
        stateType === "list" &&
        (match = text.match(sparkRegexes.struct_list_value))
      ) {
        const currentToken = createSparkToken(
          "struct_list_value",
          newLineLength,
          {
            content: text,
            line: i + (config?.lineOffset || 0),
            from: current,
          }
        );
        const valueText = match[2] || "";
        const valueFrom = currentToken.from + getStart(match, 2);
        const valueTo = valueFrom + valueText.length;
        addField(
          parsed,
          config,
          currentToken,
          currentSectionId,
          currentStructFieldId,
          undefined,
          valueText,
          currentToken.line,
          currentToken.indent,
          valueFrom,
          valueTo,
          valueFrom,
          valueTo
        );
      }
    } else if ((match = text.match(sparkRegexes.import))) {
      const currentToken = createSparkToken("import", newLineLength, {
        content: text,
        line: i + (config?.lineOffset || 0),
        from: current,
      });
      const valueText = match[4] || "";
      currentToken.content = getImportValue(valueText) || "";
      const valueFrom = currentToken.from + getStart(match, 4);
      const valueTo = valueFrom + valueText.length;
      addImport(parsed, valueText, currentToken.line, valueFrom, valueTo);
    }

    const isSeparator = !text.trim() && text.length < 2;
    if (isSeparator) {
      stateType = "normal";
    }
  }
};

export const parseSpark = (
  script: string,
  config?: SparkParserConfig
): SparkParseResult => {
  const parsed: SparkParseResult = {
    tokens: [],
    tokenLines: {},
    properties: {},
    diagnostics: [],
    references: [],
  };

  augmentResult(parsed, config);

  if (!script) {
    return parsed;
  }

  if (config?.removeBlockComments) {
    script = stripBlockComments(script);
  }

  const lines = script.split(/\r\n|\r|\n/);

  const newLineLength = script.match(/\r\n/) ? 2 : 1;

  hoistDeclarations(parsed, config, newLineLength, lines);

  let current = 0;
  let currentLevel = 0;
  let currentSectionId = "";
  let currentStructName = "";
  let previousToken: SparkToken | undefined;
  let previousNonSeparatorToken: SparkToken | undefined;
  let lastTitlePageToken: SparkToken | undefined;
  let match: RegExpMatchArray | null;
  let text = "";
  let tokenCategory = "none";
  let lastCharacterIndex = -1;
  let dualRight = false;
  let titlePageStarted = false;
  let stateType: string | undefined = "normal";

  const state: SparkParseState = { newLineLength };

  let currentToken: SparkToken = createSparkToken("", state.newLineLength, {
    content: text,
    line: config?.lineOffset || 0,
    from: current,
  });
  let ignoredLastToken = false;

  for (let i = 0; i < lines.length; i += 1) {
    text = lines[i] || "";

    if (stateType === "ignore") {
      stateType = undefined;
    }

    currentToken = createSparkToken("comment", state.newLineLength, {
      content: text,
      line: i + (config?.lineOffset || 0),
      from: current,
    });
    text = stripInlineComments(text);
    currentToken.content = text;
    current = currentToken.to + 1;

    if (
      text.match(sparkRegexes.dialogue_terminator) &&
      isSparkDisplayToken(previousToken)
    ) {
      previousToken.autoAdvance = true;
    }

    const isSeparator = !text.trim() && text.length < 2;
    if (isSeparator || text.trim() === "_") {
      state.prependNext = false;
      saveAndClearChoices(
        parsed,
        config,
        currentToken,
        currentSectionId,
        state
      );
    }

    if (
      isSeparator ||
      text.trim() === "_" ||
      text.match(sparkRegexes.dialogue_terminator)
    ) {
      if (stateType === "dialogue" || stateType === "dual_dialogue") {
        if (
          previousToken?.type === "parenthetical" ||
          previousToken?.type === "dialogue_asset"
        ) {
          saveAndClearDialogueToken(
            parsed,
            config,
            currentToken,
            currentSectionId,
            state,
            createSparkToken("dialogue", state.newLineLength, {
              line: previousToken?.line,
              indent: previousToken?.indent,
              from: current,
            })
          );
        }
      }
      if (stateType === "dialogue") {
        pushToken(
          parsed,
          config,
          currentSectionId,
          createSparkToken("dialogue_end", state.newLineLength, {
            line: previousToken?.line,
            indent: previousToken?.indent,
          }),
          false
        );
      }
      if (stateType === "dual_dialogue") {
        pushToken(
          parsed,
          config,
          currentSectionId,
          createSparkToken("dual_dialogue_end", state.newLineLength, {
            line: previousToken?.line,
            indent: previousToken?.indent,
          }),
          false
        );
      }
      if (stateType === "dialogue" || stateType === "dual_dialogue") {
        stateType = "normal";
      }

      if (isSeparator) {
        stateType = "normal";
        const skip_separator =
          ignoredLastToken &&
          parsed.tokens.length > 1 &&
          parsed.tokens[parsed.tokens.length - 1]?.type === "separator";

        if (ignoredLastToken) {
          ignoredLastToken = false;
        }

        if (skip_separator || stateType === "title_page") {
          continue;
        }

        dualRight = false;
        currentToken.type = "separator";
        saveAndClearAssets(currentToken, state);
        pushToken(parsed, config, currentSectionId, currentToken);
        previousToken = currentToken;
        state.displayToken = undefined;
        continue;
      }
    }

    // top_or_separated = last_was_separator || i === 0;
    tokenCategory = "script";

    if (
      !titlePageStarted &&
      sparkRegexes.title_page.test(currentToken.content)
    ) {
      stateType = "title_page";
    }

    if (stateType === "title_page") {
      if ((match = currentToken.content.match(sparkRegexes.title_page))) {
        const key = match[2] || "";
        const entry = match[4] || "";
        currentToken.type = key
          .toLowerCase()
          .replace(" ", "_") as SparkTokenType;
        currentToken.content = entry.trim();
        lastTitlePageToken = currentToken;
        const type = currentToken.type as
          | SparkTitleKeyword
          | SparkTitlePosition;
        const keyFormat = titlePageDisplay[type];
        if (keyFormat) {
          currentToken.order = keyFormat.order;
          if (!parsed.titleTokens) {
            parsed.titleTokens = {};
          }
          if (!parsed.titleTokens[keyFormat.position]) {
            parsed.titleTokens[keyFormat.position] = [];
          }
          if (currentToken.content && !currentToken.text) {
            currentToken.text = currentToken.content;
          }
          parsed.titleTokens[keyFormat.position]?.push(currentToken);
        }
        titlePageStarted = true;
        continue;
      } else if (titlePageStarted) {
        if (lastTitlePageToken) {
          lastTitlePageToken.text +=
            (lastTitlePageToken.text ? "\n" : "") +
            (currentToken.content?.trim() || "");
        }
        continue;
      }
    }

    if (stateType === "normal") {
      if (currentToken.content.match(sparkRegexes.line_break)) {
        tokenCategory = "none";
      } else if (parsed.properties?.firstTokenLine === undefined) {
        if (!parsed.properties) {
          parsed.properties = {};
        }
        parsed.properties.firstTokenLine = currentToken.line;
        currentLevel = 0;
      }

      if ((match = currentToken.content.match(sparkRegexes.scene))) {
        currentToken.type = "scene";
        if (currentToken.type === "scene") {
          const scene = match[10] || "";
          const environmentText = match[2] || "";
          const locationText = match[3] || "";
          const time = match[7] || "";
          const location = locationText.startsWith(".")
            ? locationText.substring(1)
            : locationText;
          const content = match
            .slice(2, 9)
            .map((x) => x || "")
            .join("");
          const extraOffset = content.startsWith(".") ? 1 : 0;
          currentToken.content = content.substring(extraOffset)?.trimStart();
          processDisplayedContent(
            parsed,
            config,
            currentToken,
            currentSectionId,
            state,
            currentToken,
            currentToken.from + currentToken.offset + extraOffset
          );
          if (!parsed.properties) {
            parsed.properties = {};
          }
          if (!parsed.properties.scenes) {
            parsed.properties.scenes = [];
          }
          state.sceneIndex = parsed.properties.scenes.length || 0;
          currentToken.scene = scene || state.sceneIndex + 1;
          const environmentTrimmed = environmentText?.toLowerCase()?.trim();
          currentToken.environment =
            environmentTrimmed?.startsWith("int./ext.") ||
            environmentTrimmed?.startsWith("int/ext.")
              ? "int-ext"
              : environmentTrimmed?.startsWith("int.")
              ? "int"
              : environmentTrimmed?.startsWith("ext.")
              ? "ext"
              : "other";
          parsed.properties.scenes.push({
            name: currentToken.content,
            scene: currentToken.scene,
            line: currentToken.line,
            actionDuration: 0,
            dialogueDuration: 0,
          });
          if (!parsed.sceneLines) {
            parsed.sceneLines = {};
          }
          if (!parsed.sceneLines[currentToken.line]) {
            parsed.sceneLines[currentToken.line] = state.sceneIndex;
          }
          if (!parsed.properties.locations) {
            parsed.properties.locations = {};
          }
          if (parsed.properties.locations[location]) {
            parsed.properties.locations[location]?.push(currentToken.line);
          } else {
            parsed.properties.locations[location] = [currentToken.line];
          }
          if (!parsed.properties.times) {
            parsed.properties.times = {};
          }
          if (parsed.properties.times[time]) {
            parsed.properties.times[time]?.push(currentToken.line);
          } else {
            parsed.properties.times[time] = [currentToken.line];
          }

          const struct: StructureItem = {
            type: "scene",
            info: currentToken.environment,
            text: currentToken.content,
            id: `${currentToken.line}`,
            range: {
              start: { line: currentToken.line, character: 0 },
              end: {
                line: currentToken.line,
                character: currentToken.content.length,
              },
            },
            children: [],
          };
          const latestSection = getLatestSection(parsed, currentLevel);
          if (latestSection) {
            struct.id = latestSection.id + "/" + currentToken.line;
            latestSection.children.push(struct);
          } else {
            struct.id = "/" + currentToken.line;
            if (!parsed.properties.structure) {
              parsed.properties.structure = [];
            }
            parsed.properties.structure.push(struct);
          }
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
            parsed,
            config,
            currentToken,
            currentSectionId,
            state,
            currentToken,
            currentToken.from + currentToken.offset + extraOffset
          );
        }
      } else if ((match = currentToken.content.match(sparkRegexes.centered))) {
        currentToken.type = "centered";
        if (currentToken.type === "centered") {
          const content = match[4] || "";
          const contentFrom = currentToken.from + getStart(match, 4);
          const endSpaces = match[7] || "";
          currentToken.content = (content?.trimStart() || "") + endSpaces;
          processDisplayedContent(
            parsed,
            config,
            currentToken,
            currentSectionId,
            state,
            currentToken,
            contentFrom
          );
        }
      } else if (
        (match = currentToken.content.match(sparkRegexes.transition))
      ) {
        currentToken.type = "transition";
        if (currentToken.type === "transition") {
          processDisplayedContent(
            parsed,
            config,
            currentToken,
            currentSectionId,
            state,
            currentToken
          );
        }
      } else if ((match = currentToken.content.match(sparkRegexes.jump))) {
        currentToken.type = "jump";
        if (currentToken.type === "jump") {
          const valueText = match[4] || "";
          const valueFrom = currentToken.from + getStart(match, 4);
          currentToken.value = valueText;
          currentToken.calls = getSectionCalls(
            parsed,
            config,
            currentToken,
            currentSectionId,
            "method",
            valueText,
            valueFrom
          );
        }
      } else if ((match = currentToken.content.match(sparkRegexes.repeat))) {
        currentToken.type = "repeat";
      } else if ((match = currentToken.content.match(sparkRegexes.return))) {
        currentToken.type = "return";
        if (currentToken.type === "return") {
          const expression = match[4] || "";
          const expressionFrom = currentToken.from + getStart(match, 4);
          const expressionTo = expressionFrom + expression.length;
          currentToken.value = expression;
          const currentSection = parsed?.sections?.[currentSectionId];
          const expectedType = currentSection?.returnType;
          if (expression) {
            const [ids, context] = getScopedValueContext(
              currentSectionId,
              parsed.sections
            );
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
                  if (!parsed.references[currentToken.line]) {
                    parsed.references[currentToken.line] = [];
                  }
                  parsed.references[currentToken.line]?.push({
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
                    parsed,
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
                parsed,
                currentToken,
                message,
                undefined,
                expressionFrom,
                expressionTo
              );
            }
          } else if (expectedType) {
            const message = `Function expects to return a '${expectedType}' but returns nothing`;
            diagnostic(parsed, currentToken, message);
          } else if (!expectedType) {
            const message = `${capitalize(
              currentSection?.type || "section"
            )}s cannot return`;
            diagnostic(parsed, currentToken, message);
          }
        }
      } else if ((match = currentToken.content.match(sparkRegexes.choice))) {
        currentToken.type = "choice";
        if (currentToken.type === "choice") {
          const mark = (match[2] || "") as "+" | "-";
          const content = match[4] || "";
          const valueText = match[8] || "";
          const valueFrom = currentToken.from + getStart(match, 8);
          currentToken.operator = mark;
          currentToken.content = content;
          currentToken.value = valueText;
          currentToken.calls = getSectionCalls(
            parsed,
            config,
            currentToken,
            currentSectionId,
            "method",
            valueText,
            valueFrom
          );
          currentToken.order = state.choiceTokens?.length || 0;
          checkTextExpression(
            parsed,
            config,
            currentToken,
            currentSectionId,
            currentToken.content,
            valueFrom
          );
          pushChoice(parsed, config, currentSectionId, state, currentToken);
        }
      } else if ((match = currentToken.content.match(sparkRegexes.condition))) {
        currentToken.type = "condition";
        if (currentToken.type === "condition") {
          const check = match[4] || "";
          const expression = match[6] || "";
          const checkFrom = currentToken.from + getStart(match, 4);
          const checkTo = checkFrom + check.length;
          const expressionFrom = currentToken.from + getStart(match, 6);
          currentToken.check = (check as "if" | "elif" | "else") || "close";
          currentToken.value = expression;
          if (check === "elif" || check === "else") {
            const startIndex = parsed.tokens.length;
            let index = startIndex;
            let lastToken = parsed.tokens[index - 1];
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
                  lastToken?.check === "elif" ||
                  lastToken?.check === "if"
                ) {
                  valid = true;
                  break;
                }
              }
              index -= 1;
              lastToken = parsed.tokens[index];
            }
            if (!valid) {
              diagnostic(
                parsed,
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
              parsed,
              currentToken,
              "'else' cannot have a condition. Use elif instead.",
              undefined,
              checkFrom,
              checkTo
            );
          } else if (expression) {
            checkExpressionValue(
              parsed,
              config,
              currentToken,
              currentSectionId,
              expression,
              expressionFrom
            );
          }
        }
      } else if ((match = currentToken.content.match(sparkRegexes.variable))) {
        const name = match[6] || "";
        const operator = (match[6] || "") as "=";
        const valueText = match[14] || "";
        const found = findVariable(parsed.variables, currentSectionId, name);
        const tokenType = found?.type;
        if (tokenType) {
          currentToken.type = tokenType;
          if (currentToken.type === tokenType) {
            currentToken.name = name;
            currentToken.type = tokenType;
            currentToken.operator = operator;
            currentToken.value = valueText;
          }
        }
      } else if ((match = currentToken.content.match(sparkRegexes.call))) {
        currentToken.type = "call";
        if (currentToken.type === "call") {
          const expression = match.slice(4, 6).join("");
          const expressionFrom = currentToken.from + getStart(match, 4);
          currentToken.value = expression;
          currentToken.calls = getSectionCalls(
            parsed,
            config,
            currentToken,
            currentSectionId,
            "function",
            expression,
            expressionFrom
          );
        }
      } else if ((match = currentToken.content.match(sparkRegexes.assign))) {
        currentToken.type = "assign";
        if (currentToken.type === "assign") {
          const name = match[4] || "";
          const operator = match[6] || "";
          const expression = match[8] || "";
          const nameFrom = currentToken.from + getStart(match, 4);
          const nameTo = nameFrom + name.length;
          const expressionFrom = currentToken.from + getStart(match, 8);
          const expressionTo = expressionFrom + expression.length;
          currentToken.name = name;
          currentToken.operator = operator;
          currentToken.value = expression;
          const [, found] = getVariableValueOrReference(
            parsed,
            currentToken,
            currentSectionId,
            name,
            nameFrom,
            nameTo
          );
          if (found) {
            getVariableExpressionValue(
              parsed,
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
      } else if ((match = currentToken.content.match(sparkRegexes.struct))) {
        const type = match[2] as SparkStructType;
        const name = match[4] || "";
        const colon = match[12] || "";
        if (colon) {
          stateType = type;
        }
        currentToken.type = type;
        if (currentToken.type === type) {
          currentToken.name = name;
        }
        currentStructName = name;
      } else if ((match = currentToken.content.match(sparkRegexes.import))) {
        const type = "import";
        currentToken.type = type;
        if (currentToken.type === type) {
          const valueText = match[4] || "";
          currentToken.content = getImportValue(valueText) || "";
        }
      } else if ((match = currentToken.content.match(sparkRegexes.synopsis))) {
        currentToken.type = "synopsis";
        currentToken.content = match[4] || "";
        const struct: StructureItem = {
          type: "synopsis",
          text: currentToken.content,
          id: `${currentToken.line}`,
          range: {
            start: { line: currentToken.line, character: 0 },
            end: {
              line: currentToken.line,
              character: currentToken.content.length,
            },
          },
          children: [],
        };
        if (!parsed.properties) {
          parsed.properties = {};
        }
        const latestStruct = getLatestSectionOrScene(parsed, currentLevel + 1);
        if (latestStruct) {
          struct.id = latestStruct.id + "/" + currentToken.line;
          latestStruct.children.push(struct);
        } else {
          struct.id = "/" + currentToken.line;
          if (!parsed.properties.structure) {
            parsed.properties.structure = [];
          }
          parsed.properties.structure.push(struct);
        }
      } else if ((match = currentToken.content.match(sparkRegexes.section))) {
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
          if (level > currentLevel + 1) {
            const validMark = "#".repeat(currentLevel + 1);
            const insert = `${validMark}`;
            diagnostic(
              parsed,
              currentToken,
              `Child Section must be max ${validMark.length} levels deep`,
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
              if (level === 0) {
                currentSectionId = trimmedName;
              } else if (level === 1) {
                currentSectionId = `.${trimmedName}`;
              } else if (level > currentLevel) {
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

          let struct: StructureItem = {
            type: "section",
            level: currentToken.level,
            text: currentToken.content,
            id: `${currentToken.line}`,
            range: {
              start: { line: currentToken.line, character: 0 },
              end: {
                line: currentToken.line,
                character: currentToken.content.length,
              },
            },
            children: [],
          };
          const levelStruct =
            currentLevel > 1 &&
            getLatestSectionOrScene(
              parsed,
              currentLevel,
              (token) =>
                token.type === "section" &&
                token.level !== undefined &&
                token.level < currentLevel
            );
          if (currentLevel == 1 || !levelStruct) {
            struct.id = "/" + currentToken.line;
            if (!parsed.properties) {
              parsed.properties = {};
            }
            if (!parsed.properties.structure) {
              parsed.properties.structure = [];
            }
            parsed.properties.structure.push(struct);
          } else {
            struct.id = levelStruct.id + "/" + currentToken.line;
            levelStruct.children.push(struct);
          }
        }
      } else if (
        (match = currentToken.content.match(sparkRegexes.page_break))
      ) {
        currentToken.type = "page_break";
        currentToken.content = match[3] || "";
      } else if (
        stateType === "normal" &&
        currentToken.content.match(sparkRegexes.character) &&
        i !== lines.length &&
        i !== lines.length - 1 &&
        (lines[i + 1]?.trim().length === 0 ? lines[i + 1] === "  " : true) &&
        lines[i]?.match(sparkRegexes.indent)?.[0]?.length ===
          lines[i + 1]?.match(sparkRegexes.indent)?.[0]?.length
      ) {
        // The last part of the above statement ('(lines[i + 1].trim().length == 0) ? (lines[i+1] == "  ") : false)')
        // means that if the trimmed length of the following line (i+1) is equal to zero, the statement will only return 'true',
        // and therefore consider the token as a character, if the content of the line is exactly two spaces.
        // If the trimmed length is larger than zero, then it will be accepted as dialogue regardless
        stateType = "dialogue";
        currentToken.type = "character";
        if (currentToken.type === "character") {
          currentToken.content = trimCharacterForceSymbol(currentToken.content);
          currentToken.skipToNextPreview = true;
          if (currentToken.content[currentToken.content.length - 1] === "^") {
            stateType = "dual_dialogue";
            // update last dialogue to be dual:left
            let index = lastCharacterIndex;
            let lastCharacterToken = parsed.tokens[index];
            while (
              lastCharacterToken?.type === "character" ||
              lastCharacterToken?.type === "parenthetical" ||
              lastCharacterToken?.type === "dialogue" ||
              lastCharacterToken?.type === "dialogue_asset"
            ) {
              lastCharacterToken.position = "left";
              lastCharacterToken.autoAdvance = true;
              index += 1;
              lastCharacterToken = parsed.tokens[index];
            }
            // update last dialogue_start to be dual_dialogue_start and remove last dialogue_end
            let foundMatch = false;
            let temp_index = parsed.tokens.length;
            temp_index -= 1;
            while (!foundMatch) {
              temp_index -= 1;
              switch (parsed.tokens[temp_index]?.type) {
                case "dialogue_end":
                  parsed.tokens.splice(temp_index);
                  temp_index -= 1;
                  break;
                case "separator":
                  break;
                case "character":
                  break;
                case "dialogue":
                  break;
                case "parenthetical":
                  break;
                case "dialogue_start": {
                  const t = parsed.tokens[temp_index];
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
              parsed,
              config,
              currentSectionId,
              createSparkToken("dialogue_start", state.newLineLength, {
                line: currentToken?.line,
                indent: currentToken?.indent,
              }),
              false
            );
          }
          const character = trimCharacterExtension(currentToken.content).trim();
          const characterName = character.replace(/\^$/, "").trim();
          if (!parsed.properties) {
            parsed.properties = {};
          }
          if (!parsed.properties.characters) {
            parsed.properties.characters = {};
          }
          if (parsed.properties.characters[characterName]) {
            parsed.properties.characters[characterName]?.push(
              currentToken.line
            );
          } else {
            parsed.properties.characters[characterName] = [currentToken.line];
          }
          state.character = currentToken.content;
          lastCharacterIndex = parsed.tokens.length;
          if (!parsed.dialogueLines) {
            parsed.dialogueLines = {};
          }
          parsed.dialogueLines[currentToken.line] = characterName;
        }
      } else if (
        currentToken.content?.match(sparkRegexes.note) &&
        !currentToken.content?.replace(sparkRegexes.note, "")?.trim()
      ) {
        currentToken.type = "assets";
        if (currentToken.type === "assets") {
          currentToken.skipToNextPreview = false;
          pushAssets(parsed, currentToken, currentSectionId, state);
          processDisplayedContent(
            parsed,
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
              parsed,
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
    } else if (stateType === "dialogue" || stateType === "dual_dialogue") {
      if (
        currentToken.content?.match(sparkRegexes.note) &&
        !currentToken.content?.replace(sparkRegexes.note, "")?.trim()
      ) {
        currentToken.type = "dialogue_asset";
        if (currentToken.type === "dialogue_asset") {
          currentToken.skipToNextPreview = true;
          pushAssets(parsed, currentToken, currentSectionId, state);
          processDisplayedContent(
            parsed,
            config,
            currentToken,
            currentSectionId,
            state,
            currentToken
          );
        }
      } else if (
        (match = currentToken.content.match(sparkRegexes.parenthetical))
      ) {
        currentToken.type = "parenthetical";
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
            parsed,
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
        if (currentToken.type === "parenthetical") {
          currentToken.position = "right";
        }
        if (currentToken.type === "dialogue") {
          currentToken.position = "right";
          currentToken.wait = true;
        }
      }
    } else if (isStructType(stateType || "") && currentToken.content?.trim()) {
      if (
        (match = currentToken.content.match(sparkRegexes.struct_object_field))
      ) {
        if (stateType === "list" || stateType === "map") {
          diagnostic(
            parsed,
            currentToken,
            `Cannot declare object field in ${stateType}`
          );
        } else {
          currentToken.type = "struct_object_field";
          if (currentToken.type === "struct_object_field") {
            currentToken.struct = currentStructName;
          }
        }
      } else if (
        stateType !== "list" &&
        (match = currentToken.content.match(sparkRegexes.struct_value_field))
      ) {
        currentToken.type = "struct_value_field";
        if (currentToken.type === "struct_value_field") {
          currentToken.struct = currentStructName;
        }
      } else if (
        stateType === "list" &&
        (match = currentToken.content.match(sparkRegexes.struct_list_value))
      ) {
        currentToken.type = "struct_list_value";
        if (currentToken.type === "struct_list_value") {
        }
      } else {
        diagnostic(parsed, currentToken, `Invalid ${stateType} field syntax`);
      }
    }

    if (
      currentToken.type !== "action" &&
      !(currentToken.type === "dialogue" && currentToken.content === "  ")
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
          parsed,
          config,
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
      let lineIndex = i;
      let from = currentToken.from;
      let to = currentToken.from;
      while (lineIndex < lines.length) {
        const line = lines[lineIndex];
        if (!line) {
          break;
        }
        const indentMatch = line?.match(sparkRegexes.indent);
        const indentText = indentMatch?.[0] || "";
        const offset = indentText.length;
        const indent = Math.floor(offset / 2);
        if (indent <= previousNonSeparatorToken.indent) {
          break;
        }
        from = to + offset;
        to = from + line.length - offset + 1;
        diagnostic(
          parsed,
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

    const currentSection = parsed?.sections?.[currentSectionId];
    if (
      currentSection?.type === "function" ||
      currentSection?.type === "detector"
    ) {
      if (displayTokenTypes.includes(currentToken.type)) {
        diagnostic(
          parsed,
          currentToken,
          `Display commands are not allowed in ${currentSection.type}s`
        );
      }
      if (flowTokenTypes.includes(currentToken.type)) {
        diagnostic(
          parsed,
          currentToken,
          `Flow commands are not allowed in ${currentSection.type}s`
        );
      }
    }

    if (tokenCategory === "script" && stateType !== "ignore") {
      if (["scene", "transition"].includes(currentToken.type)) {
        currentToken.content = currentToken.content.toUpperCase();
        titlePageStarted = true; // ignore title tags after first heading
      }
      if (currentToken.content && currentToken.content[0] === "~") {
        currentToken.content = `*${currentToken.content.substring(1)}*`;
      }
      if (currentToken.type !== "action" && currentToken.type !== "dialogue")
        currentToken.content = currentToken.content?.trimStart();

      if (currentToken.ignore) {
        ignoredLastToken = true;
      } else {
        ignoredLastToken = false;
        pushToken(parsed, config, currentSectionId, currentToken);
        previousToken = currentToken;
        previousNonSeparatorToken = currentToken;
      }
    }
  }

  if (stateType === "dialogue" || stateType === "dual_dialogue") {
    if (
      previousToken?.type === "parenthetical" ||
      previousToken?.type === "dialogue_asset"
    ) {
      saveAndClearDialogueToken(
        parsed,
        config,
        currentToken,
        currentSectionId,
        state,
        createSparkToken("dialogue", state.newLineLength, {
          line: previousToken?.line,
          indent: previousToken?.indent,
          from: current,
        })
      );
    }
  }

  saveAndClearChoices(parsed, config, currentToken, currentSectionId, state);

  if (stateType === "dialogue") {
    pushToken(
      parsed,
      config,
      currentSectionId,
      createSparkToken("dialogue_end", state.newLineLength, {
        line: currentToken?.line,
        indent: currentToken?.indent,
      }),
      false
    );
    state.character = undefined;
    state.parenthetical = undefined;
  }

  if (stateType === "dual_dialogue") {
    pushToken(
      parsed,
      config,
      currentSectionId,
      createSparkToken("dual_dialogue_end", state.newLineLength, {
        line: currentToken?.line,
        indent: currentToken?.indent,
      }),
      false
    );
    state.character = undefined;
    state.parenthetical = undefined;
  }

  // tidy up separators

  if (!titlePageStarted) {
    parsed.titleTokens = undefined;
  }

  // clean separators at the end
  while (
    parsed.tokens.length > 0 &&
    parsed.tokens[parsed.tokens.length - 1]?.type === "separator"
  ) {
    parsed.tokens.pop();
  }
  parsed.parseTime = new Date().getTime();
  // console.log(parsed);

  return parsed;
};

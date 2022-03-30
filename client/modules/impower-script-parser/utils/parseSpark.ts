/* eslint-disable no-cond-assign */
/* eslint-disable prefer-destructuring */
/* eslint-disable no-continue */
import { compile, format } from "../../impower-evaluate";
import { displayTokenTypes } from "../constants/displayTokenTypes";
import { flowTokenTypes } from "../constants/flowTokenTypes";
import { titlePageDisplay } from "../constants/pageTitleDisplay";
import { reservedKeywords } from "../constants/reservedKeywords";
import { sparkRegexes } from "../constants/sparkRegexes";
import { SparkAsset } from "../types/SparkAsset";
import { SparkAssetType } from "../types/SparkAssetType";
import { SparkDeclarations } from "../types/SparkDeclarations";
import { SparkAction } from "../types/SparkDiagnostic";
import { SparkEntity } from "../types/SparkEntity";
import { SparkEntityType } from "../types/SparkEntityType";
import { SparkParseResult } from "../types/SparkParseResult";
import { SparkSection } from "../types/SparkSection";
import { SparkTag } from "../types/SparkTag";
import {
  SparkAssetsToken,
  SparkChoiceToken,
  SparkDialogueToken,
  SparkDisplayToken,
  SparkToken,
} from "../types/SparkToken";
import { SparkTokenType } from "../types/SparkTokenType";
import { SparkVariable } from "../types/SparkVariable";
import { SparkVariableType } from "../types/SparkVariableType";
import { createSparkLine } from "./createSparkLine";
import { createSparkToken } from "./createSparkToken";
import { getExpressionCallMatch } from "./getExpressionCallMatch";
import { getScopedContext } from "./getScopedContext";
import { getScopedEvaluationContext } from "./getScopedEvaluationContext";
import { getScopedItem } from "./getScopedItem";
import { isSparkDisplayToken } from "./isSparkDisplayToken";
import { trimCharacterExtension } from "./trimCharacterExtension";
import { trimCharacterForceSymbol } from "./trimCharacterForceSymbol";

export const parseSpark = (
  originalScript: string,
  augmentations?: SparkDeclarations
): SparkParseResult => {
  const script = originalScript;

  const parsed: SparkParseResult = {
    scriptTokens: [],
    scriptLines: {},
    properties: {},
    diagnostics: [],
    references: [],
    ...augmentations,
  };

  Object.entries(augmentations?.variables || {}).forEach(([id, d]) => {
    if (!parsed.variables) {
      parsed.variables = {};
    }
    parsed.variables[id] = d;
    const parentId = id.split(".").slice(0, -1).join(".") || "";
    if (!parsed.sections) {
      parsed.sections = {};
    }
    if (!parsed.sections[parentId]) {
      parsed.sections[parentId] = { type: "section" };
    }
    if (!parsed.sections[parentId].variables) {
      parsed.sections[parentId].variables = {};
    }
    parsed.sections[parentId].variables[id] = d;
  });
  Object.entries(augmentations?.tags || {}).forEach(([id, d]) => {
    if (!parsed.tags) {
      parsed.tags = {};
    }
    parsed.tags[id] = d;
    const parentId = id.split(".").slice(0, -1).join(".") || "";
    if (!parsed.sections) {
      parsed.sections = {};
    }
    if (!parsed.sections[parentId]) {
      parsed.sections[parentId] = { type: "section" };
    }
    if (!parsed.sections[parentId].tags) {
      parsed.sections[parentId].tags = {};
    }
    parsed.sections[parentId].tags[id] = d;
  });
  Object.entries(augmentations?.assets || {}).forEach(([id, d]) => {
    if (!parsed.assets) {
      parsed.assets = {};
    }
    parsed.assets[id] = d;
    const parentId = id.split(".").slice(0, -1).join(".") || "";
    if (!parsed.sections) {
      parsed.sections = {};
    }
    if (!parsed.sections[parentId]) {
      parsed.sections[parentId] = { type: "section" };
    }
    if (!parsed.sections[parentId].assets) {
      parsed.sections[parentId].assets = {};
    }
    parsed.sections[parentId].assets[id] = d;
  });

  if (!script) {
    return parsed;
  }

  const newLineLength = script.match(/\r\n/) ? 2 : 1;

  const lines = script.split(/\r\n|\r|\n/);

  const linesLength = lines.length;
  let current = 0;
  let currentLevel = 0;
  let currentSectionId = "";
  let match: string[];
  let text = "";
  let lastTitlePageToken;
  let currentToken: SparkToken;
  let previousToken: SparkToken;
  let previousNonSeparatorToken: SparkToken;
  let tokenCategory = "none";
  let lastCharacterIndex;
  let dualRight;
  let state = "normal";
  let cacheStateForComment: string;
  let nestedComments = 0;
  let titlePageStarted = false;
  let previousCharacter: string;
  let previousParenthetical: string;
  let previousAssets: { name: string }[] = [];
  let previousDisplayToken: SparkDisplayToken;
  let currentChoiceTokens: SparkChoiceToken[] = [];
  let prependNext = false;

  const diagnostic = (
    currentToken: SparkToken,
    message: string,
    actions: SparkAction[] = [],
    from = -1,
    to = -1,
    severity: "error" | "warning" | "info" = "error"
  ): void => {
    if (!parsed.diagnostics) {
      parsed.diagnostics = [];
    }
    const validFrom = Math.max(
      0,
      from >= 0 ? from : currentToken.from + currentToken.offset
    );
    const validTo = Math.min(script.length, to >= 0 ? to : currentToken.to);
    const source = `${severity.toUpperCase()}: line ${
      currentToken.line
    } column ${validFrom - currentToken.from}`;
    if (validTo > validFrom) {
      parsed.diagnostics.push({
        from: validFrom,
        to: validTo,
        severity,
        source,
        message,
        actions,
      });
    } else if (currentToken.to > currentToken.from) {
      parsed.diagnostics.push({
        from: currentToken.from,
        to: currentToken.to,
        severity,
        source,
        message,
        actions,
      });
    } else {
      console.error(
        `Invalid Diagnostic Range: ${validFrom}-${validTo}`,
        message
      );
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
    return `${str[0].toUpperCase()}${str.slice(1)}`;
  };

  const prefixArticle = (str: string, capitalize?: boolean): string => {
    const articles = capitalize ? ["An", "A"] : ["an", "a"];
    return `${
      ["a", "e", "i", "o", "u"].includes(str[0]) ? articles[0] : articles[1]
    } ${str}`;
  };

  const lintDiagnostic = (): void => {
    diagnostic(
      currentToken,
      `Invalid ${currentToken.type ? `${currentToken.type} ` : ""}syntax`
    );
  };

  const lint = (regex: RegExp): RegExpMatchArray => {
    const lintRegexSource = regex.source.replace(/[$][|]/g, "");
    const lintRegex = new RegExp(lintRegexSource);
    const lintedMatch = text.match(lintRegex);
    if (!lintedMatch) {
      lintDiagnostic();
    }
    return lintedMatch;
  };

  const findSection = (
    sectionId: string,
    name: string
  ): [string, SparkSection] => {
    return getScopedItem(parsed?.sections, sectionId, name);
  };

  const findVariable = (
    sectionId: string,
    name: string
  ): [string, SparkVariable] => {
    return getScopedItem(parsed?.variables, sectionId, name);
  };

  const findAsset = (sectionId: string, name: string): [string, SparkAsset] => {
    return getScopedItem(parsed?.assets, sectionId, name);
  };

  const findEntity = (
    sectionId: string,
    name: string
  ): [string, SparkEntity] => {
    return getScopedItem(parsed?.entities, sectionId, name);
  };

  const findTag = (sectionId: string, name: string): [string, SparkTag] => {
    return getScopedItem(parsed?.tags, sectionId, name);
  };

  const lintNameUnique = <
    T extends SparkSection | SparkVariable | SparkAsset | SparkEntity | SparkTag
  >(
    type: "section" | "variable" | "asset" | "entity" | "tag",
    found: T,
    from: number,
    to: number
  ): T => {
    if (found?.name && found.from !== from) {
      const prefix = prefixArticle(type, true);
      const name = found?.name;
      const existingLine = found.line;
      const location = existingLine !== null ? ` at line ${existingLine}` : "";
      diagnostic(
        currentToken,
        `${prefix} named '${name}' already exists${location}`,
        [{ name: "FOCUS", focus: { from: found.from, to: found.from } }],
        from,
        to
      );
      return found;
    }
    return undefined;
  };

  const lintName = <
    T extends SparkSection | SparkVariable | SparkAsset | SparkEntity | SparkTag
  >(
    name: string,
    from: number,
    to: number
  ): void => {
    if (reservedKeywords.includes(name)) {
      diagnostic(
        currentToken,
        `'${name}' is a reserved keyword.`,
        [],
        from,
        to
      );
      return;
    }
    if (
      lintNameUnique<T>(
        "section",
        findSection(
          currentSectionId.split(".").slice(0, -1).join("."),
          name
        )[1] as T,
        from,
        to
      )
    ) {
      return;
    }
    if (
      lintNameUnique<T>(
        "variable",
        findVariable(currentSectionId, name)[1] as T,
        from,
        to
      )
    ) {
      return;
    }
    if (
      lintNameUnique<T>(
        "asset",
        findAsset(currentSectionId, name)[1] as T,
        from,
        to
      )
    ) {
      return;
    }
    if (
      lintNameUnique<T>(
        "entity",
        findEntity(currentSectionId, name)[1] as T,
        from,
        to
      )
    ) {
      return;
    }
    lintNameUnique<T>("tag", findTag(currentSectionId, name)[1] as T, from, to);
  };

  const addSection = (
    section: SparkSection,
    nameFrom: number,
    nameTo: number
  ): void => {
    if (!parsed.sections) {
      parsed.sections = {};
    }
    if (!parsed.references[currentToken.line]) {
      parsed.references[currentToken.line] = [];
    }
    parsed.references[currentToken.line].push({
      from: nameFrom,
      to: nameTo,
      name: section.name,
      id: currentSectionId,
      declaration: true,
    });
    if (currentSectionId) {
      const parentId = currentSectionId.split(".").slice(0, -1).join(".") || "";
      section.parent = parentId;
      const parentSection = parsed.sections[parentId];
      if (parentSection) {
        if (!parentSection.children) {
          parentSection.children = [];
        }
        parentSection.children.push(currentSectionId);
        if (
          section.type !== "function" &&
          ["detector", "function"].includes(parentSection.type)
        ) {
          diagnostic(
            currentToken,
            `'${section.name}' cannot be a child of ${parentSection.type} '${
              parentSection.name
            }'.\n${capitalize(
              parentSection.type
            )}s can only have function children.`
          );
        }
      } else {
        console.error("SECTION DOES NOT EXIST", parentId);
      }
    }
    lintName(section.name, nameFrom, nameTo);
    if (!parsed.sections[currentSectionId]) {
      section.index = Object.keys(parsed.sections).length;
      parsed.sections[currentSectionId] = {
        ...(parsed?.sections?.[currentSectionId] || {}),
        ...section,
      };
    }
    if (!parsed.sectionLines) {
      parsed.sectionLines = {};
    }
    parsed.sectionLines[section.line] = currentSectionId;
  };

  const getSection = (
    type: "section" | "method" | "function" | "detector",
    name: string,
    from?: number,
    to?: number
  ): SparkSection => {
    if (!name) {
      return undefined;
    }
    const [id, found] = findSection(currentSectionId, name);
    if (!parsed.references[currentToken.line]) {
      parsed.references[currentToken.line] = [];
    }
    parsed.references[currentToken.line].push({ from, to, name, id });
    if (!found) {
      diagnostic(
        currentToken,
        `Cannot find ${type === "method" ? "section" : type} named '${name}'`,
        [],
        from,
        to
      );
      return null;
    }
    if (found.type === "section" && type === "method") {
      return found;
    }
    if (found.type !== type) {
      diagnostic(currentToken, `'${name}' is not a ${type}`, [], from, to);
      return null;
    }
    return found;
  };

  const getArgumentValues = (
    type: "section" | "method" | "function" | "detector",
    methodName: string,
    methodArgs: string,
    methodNameFrom: number,
    methodNameTo: number,
    methodArgsFrom: number,
    methodArgsTo: number
  ): string[] => {
    const section = getSection(type, methodName, methodNameFrom, methodNameTo);
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
    const parameters = Object.values(section.variables || {}).filter(
      (v) => v.parameter
    );
    const argumentExpressions: string[] = [];
    let paramIndex = 0;
    const extraArgIndices: number[] = [];
    for (let index = 0; index < tokenMatches.length; index += 1) {
      const expression = tokenMatches[index];
      const expressionFrom =
        methodArgsFrom + getStart(["", ...tokenMatches], index + 1) + 1;
      const expressionTo = expressionFrom + expression.length;
      const parameter = parameters?.[paramIndex];
      if (expression === ",") {
        // Separator
      } else if (!expression.trim()) {
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
          const [ids, context] = getScopedEvaluationContext(
            currentSectionId,
            parsed.sections
          );
          const { result, references, diagnostics } = compile(
            expression,
            context
          );
          if (references?.length > 0) {
            for (let i = 0; i < references.length; i += 1) {
              const r = references[i];
              const from = expressionFrom + r.from;
              const to = expressionFrom + r.to;
              if (!parsed.references[currentToken.line]) {
                parsed.references[currentToken.line] = [];
              }
              parsed.references[currentToken.line].push({
                from,
                to,
                name: r.name,
                id: ids[r.name],
              });
            }
          }
          if (diagnostics?.length > 0) {
            for (let i = 0; i < diagnostics.length; i += 1) {
              const d = diagnostics[i];
              const from = expressionFrom + d.from;
              const to = expressionFrom + d.to;
              diagnostic(currentToken, d.message, [], from, to);
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
        currentToken,
        `Expected ${parameters.length} ${
          parameters.length === 1 ? "argument" : "arguments"
        } but got ${parameters.length + extraArgIndices.length}`,
        [],
        methodArgsFrom,
        methodArgsTo
      );
    }
    return argumentExpressions;
  };

  const getExpressionCallNameAndValues = (
    type: "method" | "function",
    expression: string,
    expressionFrom: number
  ): { name: string; values: string[] } => {
    if (expression === "!" || expression?.toLowerCase() === "!quit") {
      return { name: "!", values: [] };
    }
    if (expression === ">") {
      const block = parsed?.sections?.[currentSectionId];
      const blockList = Object.entries(parsed?.sections).slice(block.index + 1);
      const [id] = blockList.find(
        ([, v]) =>
          v.type === "section" &&
          (v.parent === currentSectionId ||
            parsed?.sections?.[v.parent]?.index < block.index)
      ) || [undefined, undefined];
      if (id == null || id === currentSectionId) {
        diagnostic(
          currentToken,
          "There are no sections after this section",
          [],
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
        const siblingIds = parsed?.sections?.[parentId]?.children || [];
        const id = siblingIds.find(
          (x) => parsed?.sections?.[x]?.type === "section"
        );
        if (id != null && id !== currentSectionId) {
          const name = parsed?.sections?.[id]?.name;
          return { name, values: [] };
        }
      }
      diagnostic(
        currentToken,
        "There are no sibling sections before this section",
        [],
        expressionFrom,
        expressionFrom + expression.length,
        "warning"
      );
      return { name: expression, values: [] };
    }
    if (expression === "]") {
      const parentId = parsed?.sections?.[currentSectionId]?.parent;
      if (parentId != null) {
        const siblingIds = parsed?.sections?.[parentId]?.children || [];
        const id = [...siblingIds]
          ?.reverse()
          .find((x) => parsed?.sections?.[x]?.type === "section");
        if (id != null && id !== currentSectionId) {
          const name = parsed?.sections?.[id]?.name;
          return { name, values: [] };
        }
      }
      diagnostic(
        currentToken,
        "There are no sibling sections after this section",
        [],
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
        currentToken,
        "This section does not have a parent",
        [],
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
    expression: string,
    expressionFrom: number
  ): void => {
    const [ids, context] = getScopedEvaluationContext(
      currentSectionId,
      parsed.sections
    );
    const { references, diagnostics } = compile(expression, context);
    if (references?.length > 0) {
      for (let i = 0; i < references.length; i += 1) {
        const r = references[i];
        const from = expressionFrom + r.from;
        const to = expressionFrom + r.to;
        if (!parsed.references[currentToken.line]) {
          parsed.references[currentToken.line] = [];
        }
        parsed.references[currentToken.line].push({
          from,
          to,
          name: r.name,
          id: ids[r.name],
        });
      }
    }
    if (diagnostics?.length > 0) {
      for (let i = 0; i < diagnostics.length; i += 1) {
        const d = diagnostics[i];
        const from = expressionFrom + d.from;
        const to = expressionFrom + d.to;
        diagnostic(currentToken, d.message, [], from, to);
      }
    }
  };

  const checkTextExpression = (content: string, contentFrom: number): void => {
    const expression = `\`${content}\``;
    const expressionFrom = contentFrom - 1;
    checkExpressionValue(expression, expressionFrom);
  };

  const getSectionCalls = (
    type: "method" | "function",
    expression: string,
    expressionFrom: number
  ): Record<string, { name: string; values: string[] }> => {
    if (!expression) {
      return undefined;
    }
    const { name, values } = getExpressionCallNameAndValues(
      type,
      expression,
      expressionFrom
    );
    if (name !== undefined) {
      return { "": { name, values } };
    }
    const [, context] = getScopedContext(
      currentSectionId,
      parsed.sections,
      "sections"
    );
    const [, possibleSectionExpressions] = format(expression, context);
    const calls: Record<string, { name: string; values: string[] }> = {};
    possibleSectionExpressions.forEach(({ content, from }) => {
      const { name, values } = getExpressionCallNameAndValues(
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
          currentToken,
          "Invalid section syntax",
          [],
          expressionFrom + from + trimmedStartLength,
          expressionFrom + from + content.length - trimmedEndLength
        );
      }
    });
    return calls;
  };

  const getVariableExpressionValue = (
    expression: string,
    expressionFrom: number,
    expressionTo: number,
    variable?: SparkVariable,
    variableNameFrom?: number,
    variableNameTo?: number
  ): unknown => {
    if (expression) {
      const { name } = getExpressionCallNameAndValues(
        "function",
        expression,
        expressionFrom
      );
      if (name !== undefined) {
        if (variable) {
          const [, section] = findSection(currentSectionId, name);
          if (
            section != null &&
            variable.type &&
            section.returnType !== variable.type
          ) {
            if (section.returnType) {
              diagnostic(
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
            currentToken,
            `Must be initialized to a constant value or expression`,
            [],
            expressionFrom,
            expressionTo
          );
        }
      } else {
        const [ids, context] = getScopedEvaluationContext(
          currentSectionId,
          parsed.sections
        );
        const { result, references, diagnostics } = compile(
          expression,
          context
        );
        if (references?.length > 0) {
          for (let i = 0; i < references.length; i += 1) {
            const r = references[i];
            const from = expressionFrom + r.from;
            const to = expressionFrom + r.to;
            if (!parsed.references[currentToken.line]) {
              parsed.references[currentToken.line] = [];
            }
            parsed.references[currentToken.line].push({
              from,
              to,
              name: r.name,
              id: ids[r.name],
            });
          }
        }
        if (diagnostics?.length > 0) {
          for (let i = 0; i < diagnostics.length; i += 1) {
            const d = diagnostics[i];
            const from = expressionFrom + d.from;
            const to = expressionFrom + d.to;
            diagnostic(currentToken, d.message, [], from, to);
          }
        } else if (variable) {
          const resultType = typeof result;
          if (result != null && variable.type && resultType !== variable.type) {
            diagnostic(
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
        return result;
      }
    }
    return undefined;
  };

  const getAsset = (
    type: SparkAssetType,
    name: string,
    from: number,
    to: number
  ): SparkAsset => {
    if (!name) {
      return undefined;
    }
    const validType = type || "image";
    const numValue = Number(name);
    if (!Number.isNaN(numValue)) {
      diagnostic(
        currentToken,
        `'${name}' is not a valid ${validType} value`,
        [],
        from,
        to
      );
      return null;
    }
    const [id, found] = findAsset(currentSectionId, name);
    if (!parsed.references[currentToken.line]) {
      parsed.references[currentToken.line] = [];
    }
    parsed.references[currentToken.line].push({ from, to, name, id });
    if (!found) {
      diagnostic(
        currentToken,
        `Cannot find ${validType} named '${name}'`,
        [],
        from,
        to
      );
      return null;
    }
    if (found.type !== validType) {
      diagnostic(
        currentToken,
        `'${name}' is not ${prefixArticle(validType)} asset`,
        [{ name: "FOCUS", focus: { from: found.from, to: found.from } }],
        from,
        to
      );
      return null;
    }
    return found;
  };

  const getEntity = (
    type: SparkEntityType,
    name: string,
    from: number,
    to: number
  ): SparkEntity => {
    if (!name) {
      return undefined;
    }
    const validType = type || "enum";
    const numValue = Number(name);
    if (!Number.isNaN(numValue)) {
      diagnostic(
        currentToken,
        `'${name}' is not a valid ${validType} value`,
        [],
        from,
        to
      );
      return null;
    }
    const [id, found] = findEntity(currentSectionId, name);
    if (!parsed.references[currentToken.line]) {
      parsed.references[currentToken.line] = [];
    }
    parsed.references[currentToken.line].push({ from, to, name, id });
    if (!found) {
      diagnostic(
        currentToken,
        `Cannot find ${validType} named '${name}'`,
        [],
        from,
        to
      );
      return null;
    }
    if (found.type !== validType) {
      diagnostic(
        currentToken,
        `'${name}' is not ${prefixArticle(validType)} entity`,
        [{ name: "FOCUS", focus: { from: found.from, to: found.from } }],
        from,
        to
      );
      return null;
    }
    return found;
  };

  const getTag = (name: string, from: number, to: number): SparkTag => {
    if (!name) {
      return undefined;
    }
    const numValue = Number(name);
    if (!Number.isNaN(numValue)) {
      diagnostic(
        currentToken,
        `'${name}' is not a valid tag value`,
        [],
        from,
        to
      );
      return null;
    }
    const [id, found] = findTag(currentSectionId, name);
    if (!parsed.references[currentToken.line]) {
      parsed.references[currentToken.line] = [];
    }
    parsed.references[currentToken.line].push({ from, to, name, id });
    if (!found) {
      diagnostic(currentToken, `Cannot find tag named '${name}'`, [], from, to);
      return null;
    }
    return found;
  };

  const getVariable = (
    type: SparkVariableType,
    name: string,
    from: number,
    to: number
  ): SparkVariable => {
    if (!name) {
      return undefined;
    }
    const [id, found] = findVariable(currentSectionId, name);
    if (!parsed.references[currentToken.line]) {
      parsed.references[currentToken.line] = [];
    }
    parsed.references[currentToken.line].push({ from, to, name, id });
    if (!found) {
      diagnostic(
        currentToken,
        `Cannot find variable named '${name}'`,
        [],
        from,
        to
      );
      return null;
    }
    if (type && found.type !== type) {
      diagnostic(
        currentToken,
        `'${name}' is not ${prefixArticle(type)} variable`,
        [{ name: "FOCUS", focus: { from: found.from, to: found.from } }],
        from,
        to
      );
      return null;
    }
    return found;
  };

  const getValueType = (valueText: string): SparkVariableType => {
    if (valueText == null || valueText === "") {
      return null;
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
    content: string,
    from: number,
    to: number
  ): [unknown, SparkVariable] => {
    if (!content) {
      return [undefined, undefined];
    }
    const type = getValueType(content);
    if (type === "string") {
      return [content.slice(1, -1), null];
    }
    if (type === "number") {
      return [Number(content), null];
    }
    if (type === "boolean") {
      return [Boolean(content), null];
    }
    const found = getVariable(undefined, content, from, to);
    if (found) {
      return [found.value, found];
    }
    return [undefined, undefined];
  };

  const getAssetValueOrReference = (
    type: SparkAssetType,
    content: string,
    from: number,
    to: number
  ): [string, SparkAsset] => {
    if (!content) {
      return [undefined, undefined];
    }
    if (content.match(sparkRegexes.string)) {
      return [content.slice(1, -1), null];
    }
    const found = getAsset(type, content, from, to);
    if (found) {
      return [found.value, found];
    }
    return [undefined, undefined];
  };

  const getEntityValueOrReference = (
    type: SparkEntityType,
    content: string,
    from: number,
    to: number
  ): [string, SparkEntity] => {
    if (!content) {
      return [undefined, undefined];
    }
    if (content.match(sparkRegexes.string)) {
      return [content.slice(1, -1), null];
    }
    const found = getEntity(type, content, from, to);
    if (found) {
      return [found.value, found];
    }
    return [undefined, undefined];
  };

  const getTagValueOrReference = (
    content: string,
    from: number,
    to: number
  ): [string, SparkTag] => {
    if (!content) {
      return [undefined, undefined];
    }
    if (content.match(sparkRegexes.string)) {
      return [content.slice(1, -1), null];
    }
    const found = getTag(content, from, to);
    if (found) {
      return [found.value, found];
    }
    return [undefined, undefined];
  };

  const addAsset = (
    type: SparkAssetType,
    name: string,
    valueText: string,
    line: number,
    nameFrom: number,
    nameTo: number,
    valueFrom: number,
    valueTo: number
  ): void => {
    if (!parsed.assets) {
      parsed.assets = {};
    }
    const id = `${currentSectionId}.${name}`;
    lintName(name, nameFrom, nameTo);
    if (!parsed.references[currentToken.line]) {
      parsed.references[currentToken.line] = [];
    }
    parsed.references[currentToken.line].push({
      from: nameFrom,
      to: nameTo,
      name,
      id,
      declaration: true,
    });
    const [value] = getAssetValueOrReference(
      type,
      valueText,
      valueFrom,
      valueTo
    );
    const validType = type || "image";
    const validValue = value != null ? value : "";
    const item = {
      ...(parsed?.assets?.[id] || {}),
      from: nameFrom,
      to: nameTo,
      line,
      name,
      type: validType,
      value: validValue,
    };
    parsed.assets[id] = item;
    const parentSection = parsed.sections[currentSectionId];
    if (parentSection) {
      if (!parentSection.assets) {
        parentSection.assets = {};
      }
      parentSection.assets[id] = item;
    } else {
      console.error("SECTION DOES NOT EXIST", currentSectionId);
    }
  };

  const addEntity = (
    type: SparkEntityType,
    name: string,
    valueText: string,
    line: number,
    nameFrom: number,
    nameTo: number,
    valueFrom: number,
    valueTo: number
  ): void => {
    if (!parsed.entities) {
      parsed.entities = {};
    }
    const id = `${currentSectionId}.${name}`;
    lintName(name, nameFrom, nameTo);
    if (!parsed.references[currentToken.line]) {
      parsed.references[currentToken.line] = [];
    }
    parsed.references[currentToken.line].push({
      from: nameFrom,
      to: nameTo,
      name,
      id,
      declaration: true,
    });
    const [value] = getEntityValueOrReference(
      type,
      valueText,
      valueFrom,
      valueTo
    );
    const validType = type || "ui";
    const validValue = value != null ? value : "";
    const item = {
      ...(parsed?.entities?.[id] || {}),
      from: nameFrom,
      to: nameTo,
      line,
      name,
      type: validType,
      value: validValue,
    };
    parsed.entities[id] = item;
    const parentSection = parsed.sections[currentSectionId];
    if (parentSection) {
      if (!parentSection.entities) {
        parentSection.entities = {};
      }
      parentSection.entities[id] = item;
    } else {
      console.error("SECTION DOES NOT EXIST", currentSectionId);
    }
  };

  const addTag = (
    name: string,
    valueText: string,
    line: number,
    nameFrom: number,
    nameTo: number,
    valueFrom: number,
    valueTo: number
  ): void => {
    if (!parsed.tags) {
      parsed.tags = {};
    }
    const id = `${currentSectionId}.${name}`;
    lintName(name, nameFrom, nameTo);
    if (!parsed.references[currentToken.line]) {
      parsed.references[currentToken.line] = [];
    }
    parsed.references[currentToken.line].push({
      from: nameFrom,
      to: nameTo,
      name,
      id,
      declaration: true,
    });
    const [value] = getTagValueOrReference(valueText, valueFrom, valueTo);
    const validValue = value != null ? value : "";
    const item: SparkTag = {
      ...(parsed?.tags?.[id] || {}),
      from: nameFrom,
      to: nameTo,
      line,
      name,
      type: "tag",
      value: validValue,
    };
    parsed.tags[id] = item;
    const parentSection = parsed.sections[currentSectionId];
    if (parentSection) {
      if (!parentSection.tags) {
        parentSection.tags = {};
      }
      parentSection.tags[id] = item;
    } else {
      console.error("SECTION DOES NOT EXIST", currentSectionId);
    }
  };

  const addVariable = (
    name: string,
    valueText: string,
    scope: "public" | "protected" | "private",
    parameter: boolean,
    line: number,
    nameFrom: number,
    nameTo: number,
    valueFrom: number,
    valueTo: number
  ): void => {
    if (!parsed.variables) {
      parsed.variables = {};
    }
    const prefix = scope === "private" ? "private-" : "";
    const id = `${currentSectionId}.${prefix}${name}`;
    lintName(name, nameFrom, nameTo);
    if (!parsed.references[currentToken.line]) {
      parsed.references[currentToken.line] = [];
    }
    parsed.references[currentToken.line].push({
      from: nameFrom,
      to: nameTo,
      name,
      id,
      declaration: true,
    });
    const value = getVariableExpressionValue(valueText, valueFrom, valueTo);
    const validValue = value != null ? value : "";
    const validType = typeof validValue as SparkVariableType;
    const item: SparkVariable = {
      ...(parsed?.variables?.[id] || {}),
      from: nameFrom,
      to: nameTo,
      line,
      name,
      type: validType,
      value: validValue,
      parameter,
      scope,
    };
    parsed.variables[id] = item;
    const parentSection = parsed.sections[currentSectionId];
    if (parentSection) {
      if (!parentSection.variables) {
        parentSection.variables = {};
      }
      parentSection.variables[id] = item;
    } else {
      console.error("SECTION DOES NOT EXIST", currentSectionId);
    }
  };

  const getParameterNames = (match: string[], groupIndex: number): string[] => {
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
      diagnostic(currentToken, message, [], startFrom, startFrom + 1);
      diagnostic(currentToken, message, [], endFrom, endFrom + 1);
      return parameterNames;
    }
    if (openMark && closeMark && openMark === "[" && closeMark === ")") {
      const message = "Mismatched brackets";
      diagnostic(currentToken, message, [], startFrom, startFrom + 1);
      diagnostic(currentToken, message, [], endFrom, endFrom + 1);
      return parameterNames;
    }
    for (let index = startIndex + 1; index < endIndex - 1; index += 1) {
      const declaration = allMatches[index];
      const from = currentToken.from + getStart(allMatches, index);
      const to = from + declaration.length;
      let parameterMatch: RegExpMatchArray;
      if (declaration === ",") {
        // Separator
      } else if (!declaration.trim()) {
        diagnostic(currentToken, "Empty parameter", [], from, to);
      } else if (
        (parameterMatch = declaration.match(
          sparkRegexes.parameter_declaration_lint
        ))
      ) {
        const name = parameterMatch[2] || "";
        const operator = parameterMatch[4] || "";
        const valueText = parameterMatch[6] || "";
        const nameFrom = from + getStart(parameterMatch, 2);
        const nameTo = nameFrom + name.length;
        const operatorFrom = from + getStart(parameterMatch, 4);
        const operatorTo = operatorFrom + operator.length;
        const valueFrom = from + getStart(parameterMatch, 6);
        const valueTo = valueFrom + valueText.length;
        if (name) {
          if (detector) {
            getVariable(undefined, name, nameFrom, nameTo);
            if (valueText) {
              const error = `Detector dependencies should not be initialized`;
              diagnostic(currentToken, error, [], valueFrom, valueTo);
            } else if (operator) {
              const error = `Detector dependencies should not be initialized`;
              diagnostic(currentToken, error, [], operatorFrom, operatorTo);
            }
          } else {
            addVariable(
              name,
              valueText,
              "private",
              true,
              currentToken.line,
              nameFrom,
              nameTo,
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

  const pushToken = (token: SparkToken): void => {
    if (!parsed.scriptLines) {
      parsed.scriptLines = {};
    }
    parsed.scriptLines[token.line] = parsed.scriptTokens.length;
    parsed.scriptTokens.push(token);
    if (!parsed.sections[currentSectionId]) {
      parsed.sections[currentSectionId] = {};
    }
    if (!parsed.sections[currentSectionId].tokens) {
      parsed.sections[currentSectionId].tokens = [];
    }
    parsed?.sections?.[currentSectionId].tokens.push(token);
  };

  const checkNotes = (): void => {
    const str = currentToken.content;
    const noteMatches = str.match(sparkRegexes.note);
    let startIndex = -1;
    if (noteMatches) {
      for (let i = 0; i < noteMatches.length; i += 1) {
        const noteMatch = noteMatches[i];
        const type = noteMatch.startsWith("(") ? "audio" : "image";
        const name = noteMatch.slice(2, noteMatch.length - 2);
        startIndex = str.indexOf(noteMatch, startIndex) + 2;
        const from = currentToken.from + startIndex;
        const to = from + noteMatch.length - 4;
        if (name) {
          getAsset(type, name, from, to);
        }
      }
    }
  };

  const pushAssets = (): void => {
    const str = currentToken.content;
    const noteMatches = str.match(sparkRegexes.note);
    let startIndex = -1;
    if (noteMatches) {
      for (let i = 0; i < noteMatches.length; i += 1) {
        const noteMatch = noteMatches[i].trim();
        const type = noteMatch.startsWith("(") ? "audio" : "image";
        const name = noteMatch.slice(2, noteMatch.length - 2);
        startIndex = str.indexOf(noteMatch, startIndex) + 2;
        const from = currentToken.from + startIndex;
        const to = from + noteMatch.length - 4;
        if (name) {
          getAsset(type, name, from, to);
        }
        previousAssets.push({ name });
      }
    }
  };

  const saveAndClearDialogueOrActionAssets = (): void => {
    const save = previousAssets.length > 0;
    if (
      save &&
      (currentToken.type === "dialogue" || currentToken.type === "action")
    ) {
      currentToken.assets = [...(currentToken.assets || []), ...previousAssets];
    }
    previousAssets = [];
  };

  const saveAndClearAssetsToken = (assetsToken: SparkAssetsToken): void => {
    assetsToken.assets = [...(assetsToken.assets || []), ...previousAssets];
    previousAssets = [];
    pushToken(assetsToken);
  };

  const saveAndClearDialogueToken = (
    dialogueToken: SparkDialogueToken
  ): void => {
    dialogueToken.character = previousCharacter;
    dialogueToken.parenthetical = previousParenthetical;
    pushToken(dialogueToken);
    saveAndClearDialogueOrActionAssets();
    previousCharacter = null;
    previousParenthetical = null;
  };

  const pushChoice = (choiceToken: SparkChoiceToken): void => {
    if (!currentChoiceTokens?.length) {
      pushToken(
        createSparkToken("choice", newLineLength, {
          from: currentToken.from,
          operator: "start",
          skipPreview: true,
        })
      );
    }
    currentChoiceTokens.push(choiceToken);
  };

  const saveAndClearChoices = (): void => {
    if (currentChoiceTokens?.length > 0) {
      pushToken(
        createSparkToken("choice", newLineLength, {
          from: currentToken.to,
          operator: "end",
          skipPreview: true,
        })
      );
    }
    currentChoiceTokens = [];
  };

  const reduceBlockComment = (prev: string, current: string): string => {
    if (current === "/*") {
      nestedComments += 1;
    } else if (current === "*/") {
      nestedComments -= 1;
    } else if (!nestedComments) {
      prev += current;
    }
    return prev;
  };

  const removeBlockComments = (str: string): string => {
    str = str
      .split(sparkRegexes.comment_block)
      .filter((x) => Boolean(x))
      .reduce(reduceBlockComment, "");
    return str;
  };

  const removeInlineComments = (str: string): string => {
    const inlineCommentIndex = str.indexOf("//");
    if (inlineCommentIndex >= 0) {
      str = str.slice(0, inlineCommentIndex);
    }
    return str;
  };

  const processDisplayedContent = (
    token: SparkDisplayToken,
    contentFrom?: number
  ): void => {
    if (token.type === "assets") {
      return;
    }
    token.content = token.content?.trimStart();
    if (
      prependNext &&
      previousDisplayToken &&
      (previousDisplayToken.type === token.type ||
        (["dialogue", "dialogue_asset"].includes(previousDisplayToken.type) &&
          ["dialogue", "dialogue_asset"].includes(token.type)) ||
        (["action", "action_asset"].includes(previousDisplayToken.type) &&
          ["action", "action_asset"].includes(token.type)))
    ) {
      token.text = token.content;
      const sparkLine = createSparkLine();
      Object.entries(previousDisplayToken).forEach(([k, v]) => {
        if (!Object.keys(sparkLine).includes(k)) {
          token[k] = v;
        }
      });
      token.content = `${previousDisplayToken.content}${token.content}`;
      previousDisplayToken.ignore = true;
      previousDisplayToken.skipPreview = true;
    }
    previousDisplayToken = token;
    if (token.type === "dialogue_asset" || token.type === "action_asset") {
      token.autoAdvance = true;
      token.continuePrevious = true;
      token.wait = false;
      return;
    }
    const contentMatch = token.content.match(sparkRegexes.content_continuation);
    if (contentMatch) {
      const continuePrevious = Boolean(contentMatch[1] || "");
      const validContent = contentMatch[2] || "";
      const endSpaces = contentMatch[3] || "";
      token.content = validContent + endSpaces;
      token.autoAdvance = Boolean(endSpaces);
      token.continuePrevious = continuePrevious;
    } else {
      token.autoAdvance = false;
      token.continuePrevious = false;
    }
    token.wait = true;
    token.ignore = false;
    token.skipPreview = false;
    prependNext = token.content.endsWith(" ");
    if (prependNext) {
      token.content += "\n";
    }
    const validContentFrom =
      contentFrom != null ? contentFrom : token.from + token.offset;
    checkTextExpression(token.text, validContentFrom);
    checkNotes();
  };

  currentToken = createSparkToken("", newLineLength, {
    content: text,
    line: 1,
    from: current,
  });

  addSection(
    {
      ...(parsed?.sections?.[currentSectionId] || {}),
      level: currentLevel,
      from: currentToken.from,
      to: currentToken.to,
      line: 1,
      type: "section",
      returnType: "",
      name: "",
      triggers: [],
      tokens: [],
      value: 0,
    },
    0,
    1
  );

  for (let i = 0; i < linesLength; i += 1) {
    text = lines[i];

    text = removeBlockComments(text);
    text = removeInlineComments(text);

    currentToken = createSparkToken("", newLineLength, {
      content: text,
      line: i + 1,
      from: current,
    });
    current = currentToken.to + 1;

    if ((match = currentToken.content.match(sparkRegexes.section))) {
      currentToken.type = "section";
      if (currentToken.type === "section") {
        const level = match[2].length;
        const returnType = match[4] || "";
        const name = match[6] || "";
        const parametersString = match[8] || "";
        const nameFrom = currentToken.from + getStart(match, 6);
        const nameTo = nameFrom + name.length;
        const returnTypeFrom = currentToken.from + getStart(match, 4);
        const returnTypeTo = returnTypeFrom + returnType.length;
        if (level === 0) {
          currentSectionId = name;
        } else if (level === 1) {
          currentSectionId = `.${name}`;
        } else if (level > currentLevel) {
          currentSectionId += `.${name}`;
        } else if (level < currentLevel) {
          const grandparentId = currentSectionId
            .split(".")
            .slice(0, -2)
            .join(".");
          currentSectionId = `${grandparentId}.${name}`;
        } else {
          const parentId = currentSectionId.split(".").slice(0, -1).join(".");
          currentSectionId = `${parentId}.${name}`;
        }
        currentLevel = level;
        const newSection: SparkSection = {
          ...(parsed?.sections?.[currentSectionId] || {}),
          level: currentLevel,
          from: currentToken.from,
          to: currentToken.to,
          line: currentToken.line,
          type: "section",
          returnType: "",
          name,
          tokens: [],
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
            currentToken,
            `Function return type must be 'string', 'number', or 'boolean'`,
            [],
            returnTypeFrom,
            returnTypeTo
          );
        }
        addSection(newSection, nameFrom, nameTo);
        const type =
          parametersString.startsWith("[") && parametersString.endsWith("]")
            ? "detector"
            : returnType
            ? "function"
            : parametersString.startsWith("(") && parametersString.endsWith(")")
            ? "method"
            : "section";
        if (type === "detector" && returnType) {
          diagnostic(
            currentToken,
            `Detectors cannot return a value`,
            [],
            returnTypeFrom,
            returnTypeTo
          );
        }
        const parameters = getParameterNames(match, 8);
        newSection.type = type;
        if (newSection.type !== "function" && newSection.type !== "detector") {
          newSection.value = 0;
        }
        newSection.triggers = type === "detector" ? parameters : [];
      }
    } else if ((match = currentToken.content.match(sparkRegexes.variable))) {
      currentToken.type = "variable";
      if (currentToken.type === "variable") {
        const mark = match[2] || "";
        const name = match[4] || "";
        const valueText = match[8] || "";
        const nameFrom = currentToken.from + getStart(match, 4);
        const nameTo = nameFrom + name.length;
        const valueFrom = currentToken.from + getStart(match, 8);
        const valueTo = valueFrom + valueText.length;
        const scope = mark === "temp" ? "private" : "protected";
        if (name) {
          addVariable(
            name,
            valueText,
            scope,
            false,
            currentToken.line,
            nameFrom,
            nameTo,
            valueFrom,
            valueTo
          );
        }
      }
    } else if ((match = currentToken.content.match(sparkRegexes.asset))) {
      const type = match[2] as SparkAssetType;
      currentToken.type = type;
      if (currentToken.type === type) {
        const name = match[4] || "";
        const valueText = match[8] || "";
        const nameFrom = currentToken.from + getStart(match, 4);
        const nameTo = nameFrom + name.length;
        const valueFrom = currentToken.from + getStart(match, 8);
        const valueTo = valueFrom + valueText.length;
        if (name) {
          addAsset(
            type,
            name,
            valueText,
            currentToken.line,
            nameFrom,
            nameTo,
            valueFrom,
            valueTo
          );
        }
      }
    } else if ((match = currentToken.content.match(sparkRegexes.entity))) {
      const type = match[2] as SparkEntityType;
      currentToken.type = type;
      if (currentToken.type === type) {
        const name = match[4] || "";
        const valueText = match[8] || "";
        const nameFrom = currentToken.from + getStart(match, 4);
        const nameTo = nameFrom + name.length;
        const valueFrom = currentToken.from + getStart(match, 8);
        const valueTo = valueFrom + valueText.length;
        if (name) {
          addEntity(
            type,
            name,
            valueText,
            currentToken.line,
            nameFrom,
            nameTo,
            valueFrom,
            valueTo
          );
        }
      }
    } else if ((match = currentToken.content.match(sparkRegexes.tag))) {
      const type = "tag";
      currentToken.type = type;
      if (currentToken.type === type) {
        const name = match[4] || "";
        const valueText = match[8] || "";
        const nameFrom = currentToken.from + getStart(match, 4);
        const nameTo = nameFrom + name.length;
        const valueFrom = currentToken.from + getStart(match, 8);
        const valueTo = valueFrom + valueText.length;
        if (name) {
          addTag(
            name,
            valueText,
            currentToken.line,
            nameFrom,
            nameTo,
            valueFrom,
            valueTo
          );
        }
      }
    }
  }

  current = 0;
  currentLevel = 0;
  currentSectionId = "";

  currentLevel = 0;

  let ignoredLastToken = false;

  for (let i = 0; i < linesLength; i += 1) {
    text = lines[i];

    text = removeBlockComments(text);
    text = removeInlineComments(text);

    if (nestedComments && state !== "ignore") {
      cacheStateForComment = state;
      state = "ignore";
    } else if (state === "ignore") {
      state = cacheStateForComment;
    }

    if (nestedComments === 0 && state === "ignore") {
      state = cacheStateForComment;
    }

    currentToken = createSparkToken("comment", newLineLength, {
      content: text,
      line: i + 1,
      from: current,
    });
    current = currentToken.to + 1;

    if (
      text.match(sparkRegexes.dialogue_terminator) &&
      isSparkDisplayToken(previousToken)
    ) {
      previousToken.wait = false;
    }

    const isSeparator = text.trim().length === 0 && text.length < 2;
    if (isSeparator || text.trim() === "_") {
      prependNext = false;
      saveAndClearChoices();
    }

    if (
      isSeparator ||
      text.trim() === "_" ||
      text.match(sparkRegexes.dialogue_terminator)
    ) {
      if (state === "dialogue" || state === "dual_dialogue") {
        if (
          previousToken?.type === "parenthetical" ||
          previousToken?.type === "dialogue_asset"
        ) {
          saveAndClearDialogueToken(
            createSparkToken("dialogue", newLineLength, {
              line: previousToken.line,
              from: current,
            })
          );
        }
      }
      if (state === "dialogue") {
        pushToken(createSparkToken("dialogue_end"));
      }
      if (state === "dual_dialogue") {
        pushToken(createSparkToken("dual_dialogue_end"));
      }
      if (previousToken?.type === "action_asset") {
        saveAndClearAssetsToken(
          createSparkToken("assets", newLineLength, {
            line: i + 1,
            from: current,
          })
        );
      }

      if (isSeparator) {
        state = "normal";
        const skip_separator =
          ignoredLastToken &&
          parsed.scriptTokens.length > 1 &&
          parsed.scriptTokens[parsed.scriptTokens.length - 1]?.type ===
            "separator";

        if (ignoredLastToken) {
          ignoredLastToken = false;
        }

        if (skip_separator || state === "title_page") {
          continue;
        }

        dualRight = false;
        currentToken.type = "separator";
        saveAndClearDialogueOrActionAssets();
        pushToken(currentToken);
        previousToken = currentToken;
        continue;
      }
    }

    // top_or_separated = last_was_separator || i === 0;
    tokenCategory = "script";

    if (
      !titlePageStarted &&
      sparkRegexes.title_page.test(currentToken.content)
    ) {
      state = "title_page";
    }

    if (state === "title_page") {
      if ((match = currentToken.content.match(sparkRegexes.title_page))) {
        const key = match[2] || "";
        const entry = match[5] || "";
        currentToken.type = key
          .toLowerCase()
          .replace(" ", "_") as SparkTokenType;
        currentToken.content = entry.trim();
        lastTitlePageToken = currentToken;
        const keyFormat = titlePageDisplay[currentToken.type];
        if (keyFormat) {
          currentToken.order = keyFormat.order;
          if (!parsed.titleTokens) {
            parsed.titleTokens = {};
          }
          if (!parsed.titleTokens[keyFormat.position]) {
            parsed.titleTokens[keyFormat.position] = [];
          }
          parsed.titleTokens[keyFormat.position].push(currentToken);
        }
        titlePageStarted = true;
        continue;
      } else if (titlePageStarted) {
        lastTitlePageToken.text +=
          (lastTitlePageToken.text ? "\n" : "") + currentToken.content?.trim();
        continue;
      }
    }

    if (state === "normal") {
      if (currentToken.content.match(sparkRegexes.line_break)) {
        tokenCategory = "none";
      } else if (parsed.properties.firstTokenLine === undefined) {
        parsed.properties.firstTokenLine = currentToken.line;
        currentLevel = 0;
      }

      if ((match = currentToken.content.match(sparkRegexes.scene))) {
        currentToken.type = "scene";
        if (currentToken.type === "scene") {
          const scene = match[11] || "";
          const locationText = match[4] || "";
          const time = match[8] || "";
          const location = locationText.startsWith(".")
            ? locationText.substring(1)
            : locationText;
          const content = match
            .slice(2, 10)
            .map((x) => x || "")
            .join("");
          const extraOffset = content.startsWith(".") ? 1 : 0;
          currentToken.content = content.substring(extraOffset)?.trimStart();
          processDisplayedContent(
            currentToken,
            currentToken.from + currentToken.offset + extraOffset
          );
          currentToken.scene = scene;
          if (!parsed.properties.scenes) {
            parsed.properties.scenes = [];
          }
          parsed.properties.scenes.push({
            name: currentToken.content,
            scene: currentToken.scene,
            line: currentToken.line,
          });
          if (!parsed.properties.locations) {
            parsed.properties.locations = {};
          }
          if (parsed.properties.locations[location]) {
            parsed.properties.locations[location].push(currentToken.line);
          } else {
            parsed.properties.locations[location] = [currentToken.line];
          }
          if (!parsed.properties.times) {
            parsed.properties.times = {};
          }
          if (parsed.properties.times[time]) {
            parsed.properties.times[time].push(currentToken.line);
          } else {
            parsed.properties.times[time] = [currentToken.line];
          }
        }
      } else if (
        currentToken.content.length &&
        currentToken.content[0] === "!"
      ) {
        currentToken.type = "action";
        if (currentToken.type === "action") {
          const content = currentToken.content;
          const extraOffset = content.startsWith(".") ? 1 : 0;
          currentToken.content = content.substring(extraOffset)?.trimStart();
          processDisplayedContent(
            currentToken,
            currentToken.from + currentToken.offset + extraOffset
          );
        }
      } else if (currentToken.content.match(sparkRegexes.centered)) {
        currentToken.type = "centered";
        if (currentToken.type === "centered") {
          if ((match = lint(sparkRegexes.centered))) {
            const content = match[4] || "";
            const contentFrom = currentToken.from + getStart(match, 4);
            const endSpaces = match[7] || "";
            currentToken.content = content?.trimStart() + endSpaces;
            processDisplayedContent(currentToken, contentFrom);
          }
        }
      } else if (
        (match = currentToken.content.match(sparkRegexes.transition))
      ) {
        currentToken.type = "transition";
        if (currentToken.type === "transition") {
          if ((match = lint(sparkRegexes.transition))) {
            processDisplayedContent(currentToken);
          }
        }
      } else if ((match = currentToken.content.match(sparkRegexes.go))) {
        currentToken.type = "go";
        if (currentToken.type === "go") {
          if ((match = lint(sparkRegexes.go))) {
            const valueText = match[4] || "";
            const valueFrom = currentToken.from + getStart(match, 4);
            currentToken.value = valueText;
            currentToken.calls = getSectionCalls(
              "method",
              valueText,
              valueFrom
            );
          }
        }
      } else if ((match = currentToken.content.match(sparkRegexes.repeat))) {
        currentToken.type = "repeat";
      } else if ((match = currentToken.content.match(sparkRegexes.return))) {
        currentToken.type = "return";
        if (currentToken.type === "return") {
          if ((match = lint(sparkRegexes.return))) {
            const expression = match[4] || "";
            const expressionFrom = currentToken.from + getStart(match, 4);
            const expressionTo = expressionFrom + expression.length;
            currentToken.value = expression;
            const currentSection = parsed?.sections[currentSectionId];
            const expectedType = currentSection?.returnType;
            if (expression) {
              const [ids, context] = getScopedEvaluationContext(
                currentSectionId,
                parsed.sections
              );
              const { result, references, diagnostics } = compile(
                expression,
                context
              );
              if (references?.length > 0) {
                for (let i = 0; i < references.length; i += 1) {
                  const r = references[i];
                  const from = expressionFrom + r.from;
                  const to = expressionFrom + r.to;
                  if (!parsed.references[currentToken.line]) {
                    parsed.references[currentToken.line] = [];
                  }
                  parsed.references[currentToken.line].push({
                    from,
                    to,
                    name: r.name,
                    id: ids[r.name],
                  });
                }
              }
              if (diagnostics?.length > 0) {
                for (let i = 0; i < diagnostics.length; i += 1) {
                  const d = diagnostics[i];
                  const from = expressionFrom + d.from;
                  const to = expressionFrom + d.to;
                  diagnostic(currentToken, d.message, [], from, to);
                }
              }
              const resultType = typeof result;
              if (result != null && resultType !== expectedType) {
                const message = expectedType
                  ? `Function expects to return a '${expectedType}' but returns a '${resultType}'`
                  : `${capitalize(currentSection.type)} cannot return a value`;
                diagnostic(
                  currentToken,
                  message,
                  [],
                  expressionFrom,
                  expressionTo
                );
              }
            } else if (expectedType) {
              const message = `Function expects to return a '${expectedType}' but returns nothing`;
              diagnostic(currentToken, message);
            } else if (!expectedType) {
              const message = `${capitalize(
                currentSection.type
              )}s cannot return`;
              diagnostic(currentToken, message);
            }
          }
        }
      } else if ((match = currentToken.content.match(sparkRegexes.condition))) {
        currentToken.type = "condition";
        if (currentToken.type === "condition") {
          if ((match = lint(sparkRegexes.condition))) {
            const check = match[4] || "";
            const expression = match[6] || "";
            const checkFrom = currentToken.from + getStart(match, 4);
            const checkTo = checkFrom + check.length;
            const expressionFrom = currentToken.from + getStart(match, 6);
            currentToken.check = (check as "if" | "elif" | "else") || "close";
            currentToken.value = expression;
            if (check === "elif" || check === "else") {
              const startIndex = parsed.scriptTokens.length;
              let index = startIndex;
              let lastToken = parsed.scriptTokens[index - 1];
              let valid = false;
              while (lastToken && lastToken?.type !== "section") {
                if (
                  lastToken?.type !== "condition" &&
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
                lastToken = parsed.scriptTokens[index];
              }
              if (!valid) {
                diagnostic(
                  currentToken,
                  `'${check}' must be preceded by an 'if' on the same indent level`,
                  [],
                  checkFrom,
                  checkTo
                );
              }
            }
            if (check === "else" && expression) {
              diagnostic(
                currentToken,
                "'else' cannot have a condition. Use elif instead.",
                [],
                checkFrom,
                checkTo
              );
            } else if (expression) {
              checkExpressionValue(expression, expressionFrom);
            }
          }
        }
      } else if (currentToken.content.match(sparkRegexes.list)) {
        if ((match = currentToken.content.match(sparkRegexes.call))) {
          currentToken.type = "call";
          if (currentToken.type === "call") {
            if ((match = lint(sparkRegexes.call))) {
              const expression = match.slice(4, 6).join("");
              const expressionFrom = currentToken.from + getStart(match, 4);
              currentToken.value = expression;
              currentToken.calls = getSectionCalls(
                "function",
                expression,
                expressionFrom
              );
            }
          }
        } else if ((match = currentToken.content.match(sparkRegexes.assign))) {
          currentToken.type = "assign";
          if (currentToken.type === "assign") {
            if ((match = lint(sparkRegexes.assign))) {
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
                name,
                nameFrom,
                nameTo
              );
              if (found) {
                getVariableExpressionValue(
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
          }
        } else if ((match = currentToken.content.match(sparkRegexes.choice))) {
          currentToken.type = "choice";
          if (currentToken.type === "choice") {
            if ((match = lint(sparkRegexes.choice))) {
              const mark = (match[2] || "") as "+" | "-";
              const content = match[4] || "";
              const valueText = match[8] || "";
              const valueFrom = currentToken.from + getStart(match, 8);
              currentToken.operator = mark;
              currentToken.content = content;
              currentToken.value = valueText;
              currentToken.calls = getSectionCalls(
                "method",
                valueText,
                valueFrom
              );
              currentToken.order = currentChoiceTokens.length;
              const expression = `\`${currentToken.content}\``;
              const expressionFrom = valueFrom - 1;
              checkExpressionValue(expression, expressionFrom);
              pushChoice(currentToken);
            }
          }
        } else {
          lintDiagnostic();
        }
      } else if ((match = currentToken.content.match(sparkRegexes.variable))) {
        currentToken.type = "variable";
        if (currentToken.type === "variable") {
          if (lint(sparkRegexes.variable)) {
            const name = match[4] || "";
            const operator = (match[6] || "") as "=";
            const expression = match[8] || "";
            currentToken.name = name;
            currentToken.operator = operator;
            currentToken.value = expression;
          }
        }
      } else if ((match = currentToken.content.match(sparkRegexes.asset))) {
        const type = match[2] as SparkAssetType;
        currentToken.type = type;
        lint(sparkRegexes.asset);
      } else if ((match = currentToken.content.match(sparkRegexes.entity))) {
        const type = match[2] as SparkEntityType;
        currentToken.type = type;
        lint(sparkRegexes.entity);
      } else if ((match = currentToken.content.match(sparkRegexes.tag))) {
        currentToken.type = "tag";
        lint(sparkRegexes.tag);
      } else if ((match = currentToken.content.match(sparkRegexes.synopses))) {
        currentToken.type = "synopses";
        if ((match = lint(sparkRegexes.synopses))) {
          currentToken.content = match[4];
        }
      } else if ((match = currentToken.content.match(sparkRegexes.section))) {
        currentToken.type = "section";
        if (currentToken.type === "section") {
          const mark = match[2] || "";
          const markSpace = match[3] || "";
          const name = match[6] || "";
          const level = mark.length;
          const markFrom = currentToken.from + getStart(match, 2);
          const markTo = markFrom + mark.length;
          currentToken.content = name;
          if (level > currentLevel + 1) {
            const validMark = "#".repeat(currentLevel + 1);
            const insert = `${validMark}`;
            diagnostic(
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
              currentSectionId += `.${name}`;
              currentLevel = level;
            }
          } else if (lint(sparkRegexes.section)) {
            if (level === 0) {
              currentSectionId = name;
            } else if (level === 1) {
              currentSectionId = `.${name}`;
            } else if (level > currentLevel) {
              currentSectionId += `.${name}`;
            } else if (level < currentLevel) {
              const grandparentId = currentSectionId
                .split(".")
                .slice(0, -2)
                .join(".");
              currentSectionId = `${grandparentId}.${name}`;
            } else {
              const parentId = currentSectionId
                .split(".")
                .slice(0, -1)
                .join(".");
              currentSectionId = `${parentId}.${name}`;
            }
            currentLevel = level;
          }
        }
      } else if (currentToken.content.match(sparkRegexes.page_break)) {
        currentToken.type = "page_break";
        if ((match = lint(sparkRegexes.page_break))) {
          currentToken.content = match[3] || "";
        }
      } else if (
        currentToken.content.match(sparkRegexes.character) &&
        i !== linesLength &&
        i !== linesLength - 1 &&
        (lines[i + 1].trim().length === 0 ? lines[i + 1] === "  " : true)
      ) {
        // The last part of the above statement ('(lines[i + 1].trim().length == 0) ? (lines[i+1] == "  ") : false)')
        // means that if the trimmed length of the following line (i+1) is equal to zero, the statement will only return 'true',
        // and therefore consider the token as a character, if the content of the line is exactly two spaces.
        // If the trimmed length is larger than zero, then it will be accepted as dialogue regardless
        state = "dialogue";
        currentToken.type = "character";
        if (currentToken.type === "character") {
          currentToken.content = trimCharacterForceSymbol(currentToken.content);
          currentToken.skipPreview = true;
          if (currentToken.content[currentToken.content.length - 1] === "^") {
            state = "dual_dialogue";
            // update last dialogue to be dual:left
            let index = lastCharacterIndex;
            let lastCharacterToken = parsed.scriptTokens[index];
            while (
              lastCharacterToken?.type === "character" ||
              lastCharacterToken?.type === "parenthetical" ||
              lastCharacterToken?.type === "dialogue"
            ) {
              lastCharacterToken.position = "left";
              lastCharacterToken.wait = false;
              index += 1;
              lastCharacterToken = parsed.scriptTokens[index];
            }
            // update last dialogue_start to be dual_dialogue_start and remove last dialogue_end
            let foundMatch = false;
            let temp_index = parsed.scriptTokens.length;
            temp_index -= 1;
            while (!foundMatch) {
              temp_index -= 1;
              switch (parsed.scriptTokens[temp_index]?.type) {
                case "dialogue_end":
                  parsed.scriptTokens.splice(temp_index);
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
                case "dialogue_start":
                  parsed.scriptTokens[temp_index].type = "dual_dialogue_start";
                  foundMatch = true;
                  break;
                default:
                  foundMatch = true;
              }
            }
            dualRight = true;
            currentToken.position = "right";
            currentToken.content = currentToken.content.replace(/\^$/, "");
          } else {
            pushToken(createSparkToken("dialogue_start"));
          }
          const character = trimCharacterExtension(currentToken.content).trim();
          const characterName = character.replace(/\^$/, "").trim();
          if (!parsed.properties.characters) {
            parsed.properties.characters = {};
          }
          if (parsed.properties.characters[characterName]) {
            parsed.properties.characters[characterName].push(currentToken.line);
          } else {
            parsed.properties.characters[characterName] = [currentToken.line];
          }
          previousCharacter = currentToken.content;
          lastCharacterIndex = parsed.scriptTokens.length;
          if (!parsed.dialogueLines) {
            parsed.dialogueLines = {};
          }
          parsed.dialogueLines[currentToken.line] = currentToken.content
            ?.trimStart()
            .replace(/\^$/, "")
            ?.trimStart();
        }
      } else if (
        currentToken.content?.match(sparkRegexes.note) &&
        !currentToken.content?.replace(sparkRegexes.note, "")?.trim()
      ) {
        currentToken.type = "action_asset";
        if (currentToken.type === "action_asset") {
          currentToken.skipPreview = false;
          pushAssets();
          processDisplayedContent(currentToken);
        }
      } else {
        currentToken.type = "action";
        if (currentToken.type === "action") {
          processDisplayedContent(currentToken);
          saveAndClearDialogueOrActionAssets();
        }
      }
    } else {
      if (
        currentToken.content?.match(sparkRegexes.note) &&
        !currentToken.content?.replace(sparkRegexes.note, "")?.trim()
      ) {
        currentToken.type = "dialogue_asset";
        if (currentToken.type === "dialogue_asset") {
          currentToken.skipPreview = true;
          pushAssets();
          processDisplayedContent(currentToken);
        }
      } else if (currentToken.content.match(sparkRegexes.parenthetical)) {
        currentToken.type = "parenthetical";
        currentToken.content = currentToken.content?.trim();
        currentToken.skipPreview = true;
        previousParenthetical = currentToken.content;
      } else {
        currentToken.type = "dialogue";
        if (currentToken.type === "dialogue") {
          processDisplayedContent(currentToken);
          saveAndClearDialogueOrActionAssets();
          if (previousCharacter) {
            currentToken.character = previousCharacter;
          }
          if (previousParenthetical) {
            currentToken.parenthetical = previousParenthetical;
          }
          previousParenthetical = null;
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
    }

    if (
      currentToken.type !== "action" &&
      !(currentToken.type === "dialogue" && currentToken.content === "  ")
    ) {
      currentToken.content = currentToken.content?.trimStart();
    }

    if (currentToken.indent < previousNonSeparatorToken?.indent) {
      let indent = previousNonSeparatorToken?.indent - 1;
      while (currentToken.indent <= indent) {
        pushToken(
          createSparkToken("condition", newLineLength, {
            check: "close",
            indent,
            from: currentToken.from,
            to: currentToken.from,
          })
        );
        indent -= 1;
      }
    }
    if (
      currentToken.indent > previousNonSeparatorToken?.indent &&
      previousNonSeparatorToken.type !== "condition" &&
      currentToken.type === "condition"
    ) {
      let lineIndex = i;
      let from = currentToken.from;
      let to = currentToken.from;
      while (lineIndex < linesLength) {
        const line = lines[lineIndex];
        const indentMatch = line.match(/^([ \t]*)/);
        const indentText = indentMatch[0] || "";
        const offset = indentText.length;
        const indent = Math.floor(offset / 2);
        if (indent <= previousNonSeparatorToken.indent) {
          break;
        }
        from = to + offset;
        to = from + line.length - offset + 1;
        diagnostic(currentToken, `Unreachable Code`, [], from, to, "warning");
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
          currentToken,
          `Display commands are not allowed in ${currentSection.type}s`
        );
      }
      if (flowTokenTypes.includes(currentToken.type)) {
        diagnostic(
          currentToken,
          `Flow commands are not allowed in ${currentSection.type}s`
        );
      }
    }

    if (tokenCategory === "script" && state !== "ignore") {
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
        pushToken(currentToken);
        previousToken = currentToken;
        previousNonSeparatorToken = currentToken;
      }
    }
  }

  if (state === "dialogue" || state === "dual_dialogue") {
    if (
      previousToken?.type === "parenthetical" ||
      previousToken?.type === "dialogue_asset"
    ) {
      saveAndClearDialogueToken(
        createSparkToken("dialogue", newLineLength, {
          line: previousToken.line,
          from: current,
        })
      );
    }
  }

  saveAndClearChoices();

  if (state === "dialogue") {
    pushToken(createSparkToken("dialogue_end"));
    previousCharacter = null;
    previousParenthetical = null;
  }

  if (state === "dual_dialogue") {
    pushToken(createSparkToken("dual_dialogue_end"));
    previousCharacter = null;
    previousParenthetical = null;
  }

  // tidy up separators

  if (!titlePageStarted) {
    parsed.titleTokens = undefined;
  }

  // clean separators at the end
  while (
    parsed.scriptTokens.length > 0 &&
    parsed.scriptTokens[parsed.scriptTokens.length - 1]?.type === "separator"
  ) {
    parsed.scriptTokens.pop();
  }

  return parsed;
};

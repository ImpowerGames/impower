/* eslint-disable no-cond-assign */
/* eslint-disable prefer-destructuring */
/* eslint-disable no-continue */
import { compile } from "../../impower-evaluate";
import { fountainRegexes } from "../constants/fountainRegexes";
import { titlePageDisplay } from "../constants/pageTitleDisplay";
import { reservedKeywords } from "../constants/reservedKeywords";
import { FountainAsset } from "../types/FountainAsset";
import { FountainAssetType } from "../types/FountainAssetType";
import { FountainDeclarations } from "../types/FountainDeclarations";
import { FountainAction } from "../types/FountainDiagnostic";
import { FountainEntity } from "../types/FountainEntity";
import { FountainEntityType } from "../types/FountainEntityType";
import { FountainParseResult } from "../types/FountainParseResult";
import { FountainSection } from "../types/FountainSection";
import { FountainTag } from "../types/FountainTag";
import { FountainToken } from "../types/FountainToken";
import { FountainTokenType } from "../types/FountainTokenType";
import { FountainVariable } from "../types/FountainVariable";
import { FountainVariableType } from "../types/FountainVariableType";
import { createFountainToken } from "./createFountainToken";
import { getScopedEvaluationContext } from "./getScopedEvaluationContext";
import { getScopedItem } from "./getScopedItem";
import { trimCharacterExtension } from "./trimCharacterExtension";
import { trimCharacterForceSymbol } from "./trimCharacterForceSymbol";

export const parseFountain = (
  originalScript: string,
  augmentations?: FountainDeclarations
): FountainParseResult => {
  const script = originalScript;

  const parsed: FountainParseResult = {
    scriptTokens: [],
    scriptLines: {},
    properties: {},
    diagnostics: [],
    references: [],
    ...augmentations,
  };

  Object.entries(augmentations?.variables || {}).forEach(([id, d]) => {
    const parentId = id.split(".").slice(0, -1).join(".") || "";
    if (!parsed.sections) {
      parsed.sections = {};
    }
    if (!parsed.sections[parentId]) {
      parsed.sections[parentId] = {};
    }
    if (!parsed.sections[parentId].variables) {
      parsed.sections[parentId].variables = {};
    }
    parsed.sections[parentId].variables[id] = d;
  });
  Object.entries(augmentations?.tags || {}).forEach(([id, d]) => {
    const parentId = id.split(".").slice(0, -1).join(".") || "";
    if (!parsed.sections) {
      parsed.sections = {};
    }
    if (!parsed.sections[parentId]) {
      parsed.sections[parentId] = {};
    }
    if (!parsed.sections[parentId].tags) {
      parsed.sections[parentId].tags = {};
    }
    parsed.sections[parentId].tags[id] = d;
  });
  Object.entries(augmentations?.assets || {}).forEach(([id, d]) => {
    const parentId = id.split(".").slice(0, -1).join(".") || "";
    if (!parsed.sections) {
      parsed.sections = {};
    }
    if (!parsed.sections[parentId]) {
      parsed.sections[parentId] = {};
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
  let currentToken: FountainToken;
  let currentSectionTokens: FountainToken[] = [];
  let tokenCategory = "none";
  let lastCharacterIndex;
  let dualRight;
  let state = "normal";
  let cacheStateForComment;
  let nestedComments = 0;
  let titlePageStarted = false;
  let previousCharacter: string;
  let previousParenthetical: string;
  let previousAssets: { name: string }[] = [];
  let notes: { type: FountainAssetType; name: string }[] = [];

  const diagnostic = (
    currentToken: FountainToken,
    message: string,
    actions: FountainAction[] = [],
    from = -1,
    to = -1,
    severity: "error" | "warning" | "info" = "error"
  ): void => {
    if (!parsed.diagnostics) {
      parsed.diagnostics = [];
    }
    const source = `${severity.toUpperCase()}: line ${
      currentToken.line
    } column ${from - currentToken.from}`;
    const validFrom = from >= 0 ? from : currentToken.from;
    const validTo = to >= 0 ? to : currentToken.to;
    if (validTo > validFrom) {
      parsed.diagnostics.push({
        from: validFrom,
        to: validTo,
        severity,
        source,
        message,
        actions,
      });
    } else {
      console.error(`Invalid Diagnostic Range: ${validFrom}-${validTo}`);
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
  ): [string, FountainSection] => {
    return getScopedItem(parsed?.sections, sectionId, name);
  };

  const findVariable = (
    sectionId: string,
    name: string
  ): [string, FountainVariable] => {
    return getScopedItem(parsed?.variables, sectionId, name);
  };

  const findAsset = (
    sectionId: string,
    name: string
  ): [string, FountainAsset] => {
    return getScopedItem(parsed?.assets, sectionId, name);
  };

  const findEntity = (
    sectionId: string,
    name: string
  ): [string, FountainEntity] => {
    return getScopedItem(parsed?.entities, sectionId, name);
  };

  const findTag = (sectionId: string, name: string): [string, FountainTag] => {
    return getScopedItem(parsed?.tags, sectionId, name);
  };

  const lintNameUnique = <
    T extends
      | FountainSection
      | FountainVariable
      | FountainAsset
      | FountainEntity
      | FountainTag
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
    T extends
      | FountainSection
      | FountainVariable
      | FountainAsset
      | FountainEntity
      | FountainTag
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
    section: FountainSection,
    nameFrom: number,
    nameTo: number
  ): void => {
    if (!parsed.sections) {
      parsed.sections = {};
    }
    parsed.references.push({
      from: nameFrom,
      to: nameTo,
      name: section.name,
      id: currentSectionId,
      declaration: true,
    });
    if (currentSectionId) {
      const parentId = currentSectionId.split(".").slice(0, -1).join(".") || "";
      const parentSection = parsed.sections[parentId];
      if (parentSection) {
        if (!parentSection.children) {
          parentSection.children = [];
        }
        parentSection.children.push(currentSectionId);
      } else {
        console.error("SECTION DOES NOT EXIST", parentId);
      }
    }
    lintName(section.name, nameFrom, nameTo);
    parsed.sections[currentSectionId] = section;
    if (!parsed.sectionLines) {
      parsed.sectionLines = {};
    }
    parsed.sectionLines[section.line] = currentSectionId;
  };

  const getSection = (
    name: string,
    from?: number,
    to?: number
  ): FountainSection => {
    if (!name) {
      return undefined;
    }
    const [id, found] = findSection(currentSectionId, name);
    parsed.references.push({ from, to, name, id });
    if (!found) {
      diagnostic(
        currentToken,
        `Cannot find section named '${name}'`,
        [],
        from,
        to
      );
      return null;
    }
    return found;
  };

  const getArgumentValues = (
    methodName: string,
    methodArgs: string,
    methodNameFrom: number,
    methodNameTo: number,
    methodArgsFrom: number,
    methodArgsTo: number
  ): string[] => {
    const section = getSection(methodName, methodNameFrom, methodNameTo);
    if (!section) {
      return [];
    }
    const parameters = Object.values(section.variables || {}).filter(
      (v) => v.parameter
    );
    if (!match) {
      return [];
    }
    if (!methodArgs) {
      return [];
    }
    const argumentsString = methodArgs.slice(1, -1);
    const expressionListMatches = Array.from(
      argumentsString.matchAll(fountainRegexes.expression_list)
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
            context,
            expression
          );
          if (references?.length > 0) {
            references.forEach((r) => {
              const from = expressionFrom + r.from;
              const to = expressionFrom + r.to;
              parsed.references.push({
                from,
                to,
                name: r.name,
                id: ids[r.name],
              });
            });
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

  const getExpressionValue = (
    expression: string,
    expressionFrom: number,
    expressionTo: number,
    found?: FountainVariable,
    nameFrom?: number,
    nameTo?: number
  ): {
    value?: string | number | boolean;
    methodName?: string;
    methodArgs?: string[];
  } => {
    const expressionValue: {
      value?: string | number | boolean;
      methodName?: string;
      methodArgs?: string[];
    } = {};
    if (expression) {
      const methodMatch = expression.match(fountainRegexes.method);
      if (methodMatch) {
        if (found) {
          const methodName = methodMatch[1]?.trim() || "";
          const methodNameSpace = methodMatch[2]?.trim() || "";
          const methodArgs = methodMatch[3]?.trim() || "";
          const methodNameFrom = expressionFrom;
          const methodNameTo = methodNameFrom + methodName.length;
          const methodArgsFrom = methodNameTo + methodNameSpace.length;
          const methodArgsTo = methodArgsFrom + methodArgs.length;
          expressionValue.methodName = methodName;
          expressionValue.methodArgs = getArgumentValues(
            methodName,
            methodArgs,
            methodNameFrom,
            methodNameTo,
            methodArgsFrom,
            methodArgsTo
          );
          const [, section] = findSection(currentSectionId, methodName);
          if (
            section != null &&
            found.type &&
            section.returnType !== found.type
          ) {
            if (section.returnType) {
              diagnostic(
                currentToken,
                `Cannot assign the result of a '${section.returnType}' function to a '${found.type}' variable`,
                [
                  {
                    name: "FOCUS",
                    focus: { from: found.from, to: found.from },
                  },
                ],
                nameFrom,
                nameTo
              );
            } else {
              diagnostic(
                currentToken,
                `'${section.name}' is a method that does not return a value`,
                [
                  {
                    name: "FOCUS",
                    focus: { from: found.from, to: found.from },
                  },
                ],
                nameFrom,
                nameTo
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
          context,
          expression
        );
        expressionValue.value = result;
        if (references?.length > 0) {
          references.forEach((r) => {
            const from = expressionFrom + r.from;
            const to = expressionFrom + r.to;
            parsed.references.push({
              from,
              to,
              name: r.name,
              id: ids[r.name],
            });
          });
        }
        if (diagnostics?.length > 0) {
          for (let i = 0; i < diagnostics.length; i += 1) {
            const d = diagnostics[i];
            const from = expressionFrom + d.from;
            const to = expressionFrom + d.to;
            diagnostic(currentToken, d.message, [], from, to);
          }
        } else if (found) {
          const resultType = typeof result;
          if (result != null && found.type && resultType !== found.type) {
            diagnostic(
              currentToken,
              `Cannot assign a '${resultType}' to a '${found.type}' variable`,
              [{ name: "FOCUS", focus: { from: found.from, to: found.from } }],
              nameFrom,
              nameTo
            );
          }
        }
      }
    }
    return expressionValue;
  };

  const getAsset = (
    type: FountainAssetType,
    name: string,
    from: number,
    to: number
  ): FountainAsset => {
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
    parsed.references.push({ from, to, name, id });
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
    type: FountainEntityType,
    name: string,
    from: number,
    to: number
  ): FountainEntity => {
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
    parsed.references.push({ from, to, name, id });
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

  const getTag = (name: string, from: number, to: number): FountainTag => {
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
    parsed.references.push({ from, to, name, id });
    if (!found) {
      diagnostic(currentToken, `Cannot find tag named '${name}'`, [], from, to);
      return null;
    }
    return found;
  };

  const getVariable = (
    type: FountainVariableType,
    name: string,
    from: number,
    to: number
  ): FountainVariable => {
    if (!name) {
      return undefined;
    }
    const [id, found] = findVariable(currentSectionId, name);
    parsed.references.push({ from, to, name, id });
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

  const getValueType = (valueText: string): FountainVariableType => {
    if (valueText == null || valueText === "") {
      return null;
    }
    if (valueText.match(fountainRegexes.string)) {
      return "string";
    }
    if (valueText.match(fountainRegexes.number)) {
      return "number";
    }
    if (valueText.match(fountainRegexes.boolean)) {
      return "boolean";
    }
    return undefined;
  };

  const getVariableValueOrReference = (
    content: string,
    from: number,
    to: number
  ): [string | number | boolean, FountainVariable] => {
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
    type: FountainAssetType,
    content: string,
    from: number,
    to: number
  ): [string, FountainAsset] => {
    if (!content) {
      return [undefined, undefined];
    }
    if (content.match(fountainRegexes.string)) {
      return [content.slice(1, -1), null];
    }
    const found = getAsset(type, content, from, to);
    if (found) {
      return [found.value, found];
    }
    return [undefined, undefined];
  };

  const getEntityValueOrReference = (
    type: FountainEntityType,
    content: string,
    from: number,
    to: number
  ): [string, FountainEntity] => {
    if (!content) {
      return [undefined, undefined];
    }
    if (content.match(fountainRegexes.string)) {
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
  ): [string, FountainTag] => {
    if (!content) {
      return [undefined, undefined];
    }
    if (content.match(fountainRegexes.string)) {
      return [content.slice(1, -1), null];
    }
    const found = getTag(content, from, to);
    if (found) {
      return [found.value, found];
    }
    return [undefined, undefined];
  };

  const addAsset = (
    type: FountainAssetType,
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
    parsed.references.push({
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
    type: FountainEntityType,
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
    parsed.references.push({
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
    parsed.references.push({
      from: nameFrom,
      to: nameTo,
      name,
      id,
      declaration: true,
    });
    const [value] = getTagValueOrReference(valueText, valueFrom, valueTo);
    const validValue = value != null ? value : "";
    const item: FountainTag = {
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
    parsed.references.push({
      from: nameFrom,
      to: nameTo,
      name,
      id,
      declaration: true,
    });
    const { value } = getExpressionValue(valueText, valueFrom, valueTo);
    const validValue = value != null ? value : "";
    const validType = typeof validValue as FountainVariableType;
    const item: FountainVariable = {
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
      parametersString.matchAll(fountainRegexes.expression_list)
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
          fountainRegexes.parameter_declaration
        ))
      ) {
        const name = parameterMatch[2] || "";
        const valueText = parameterMatch[6] || "";
        const nameFrom = from + getStart(parameterMatch, 2);
        const nameTo = nameFrom + name.length;
        const valueFrom = from + getStart(parameterMatch, 6);
        const valueTo = valueFrom + valueText.length;
        if (name) {
          if (detector) {
            getVariable(undefined, name, nameFrom, nameTo);
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
        diagnostic(
          currentToken,
          `Invalid parameter declaration:\nParameter must be initialized to a string (x = "") or number (x = 0)`,
          [],
          from + trimmedStartWhitespaceLength,
          to - trimmedEndWhitespaceLength
        );
      }
    }
    return parameterNames;
  };

  const pushToken = (token: FountainToken): void => {
    if (!parsed.scriptLines) {
      parsed.scriptLines = {};
    }
    parsed.scriptLines[token.line] = parsed.scriptTokens.length;
    parsed.scriptTokens.push(token);
    currentSectionTokens.push(token);
  };

  const pushNotes = (): void => {
    const str = currentToken.content;
    const noteMatches = str.match(fountainRegexes.note);
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
        notes.push({ type, name });
      }
      currentToken.text = str;
      currentToken.content = str.replace(fountainRegexes.note, "");
    }
  };

  const saveAndClearNotes = (): void => {
    const save = notes.length > 0;
    if (save) {
      currentToken.notes = [...notes];
    }
    notes = [];
  };

  const pushAssets = (): void => {
    const str = currentToken.content;
    const noteMatches = str.match(fountainRegexes.note);
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

  const saveAndClearAssets = (): void => {
    const save = previousAssets.length > 0;
    if (save && currentToken.type === "dialogue") {
      currentToken.assets = [...previousAssets];
    }
    previousAssets = [];
  };

  const reduceComment = (prev: string, current: string): string => {
    if (current === "/*") {
      nestedComments += 1;
    } else if (current === "*/") {
      nestedComments -= 1;
    } else if (!nestedComments) {
      prev += current;
    }
    return prev;
  };

  const startNewSection = (level: number): void => {
    currentSectionTokens = [];
    currentLevel = level;
    const section = parsed.sections[currentSectionId];
    if (section) {
      section.tokens = currentSectionTokens;
    }
  };

  currentToken = createFountainToken(
    undefined,
    text,
    1,
    current,
    newLineLength
  );

  addSection(
    {
      ...(parsed?.sections?.[currentSectionId] || {}),
      from: currentToken.from,
      to: currentToken.to,
      line: 1,
      type: "section",
      returnType: "",
      name: "",
      triggers: [],
      tokens: currentSectionTokens,
      value: 0,
    },
    0,
    1
  );

  for (let i = 0; i < linesLength; i += 1) {
    text = lines[i];

    // replace inline comments
    text = text
      .split(/(\/\*){1}|(\*\/){1}|([^/*]+)/g)
      .filter((x) => Boolean(x))
      .reduce(reduceComment, "");

    currentToken = createFountainToken(
      undefined,
      text,
      i + 1,
      current,
      newLineLength
    );
    current = currentToken.to + 1;

    if ((match = currentToken.content.match(fountainRegexes.section))) {
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
        const newSection: FountainSection = {
          ...(parsed?.sections?.[currentSectionId] || {}),
          from: currentToken.from,
          to: currentToken.to,
          line: currentToken.line,
          type: "section",
          returnType: "",
          name,
          tokens: currentSectionTokens,
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
        startNewSection(level);
      }
    } else if ((match = currentToken.content.match(fountainRegexes.variable))) {
      currentToken.type = "variable";
      if (currentToken.type === "variable") {
        const mark = match[2]?.trim() || "";
        const name = match[4]?.trim() || "";
        const valueText = match[8]?.trim() || "";
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
    } else if ((match = currentToken.content.match(fountainRegexes.asset))) {
      const type = match[2]?.trim() as FountainAssetType;
      currentToken.type = type;
      if (currentToken.type === type) {
        const name = match[4]?.trim() || "";
        const valueText = match[8]?.trim() || "";
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
    } else if ((match = currentToken.content.match(fountainRegexes.entity))) {
      const type = match[2]?.trim() as FountainEntityType;
      currentToken.type = type;
      if (currentToken.type === type) {
        const name = match[4]?.trim() || "";
        const valueText = match[8]?.trim() || "";
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
    } else if ((match = currentToken.content.match(fountainRegexes.tag))) {
      const type = "tag";
      currentToken.type = type;
      if (currentToken.type === type) {
        const name = match[4]?.trim() || "";
        const valueText = match[8]?.trim() || "";
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
  currentSectionTokens = [];

  let ignoredLastToken = false;

  for (let i = 0; i < linesLength; i += 1) {
    text = lines[i];

    // replace inline comments
    text = text
      .split(/(\/\*){1}|(\*\/){1}|([^/*]+)/g)
      .filter((x) => Boolean(x))
      .reduce(reduceComment, "");

    if (nestedComments && state !== "ignore") {
      cacheStateForComment = state;
      state = "ignore";
    } else if (state === "ignore") {
      state = cacheStateForComment;
    }

    if (nestedComments === 0 && state === "ignore") {
      state = cacheStateForComment;
    }

    currentToken = createFountainToken(
      undefined,
      text,
      i + 1,
      current,
      newLineLength
    );
    current = currentToken.to + 1;

    if (text.trim().length === 0 && text !== "  ") {
      const skip_separator =
        ignoredLastToken &&
        parsed.scriptTokens.length > 1 &&
        parsed.scriptTokens[parsed.scriptTokens.length - 1]?.type ===
          "separator";

      if (ignoredLastToken) {
        ignoredLastToken = false;
      }

      if (state === "dialogue") {
        pushToken(createFountainToken("dialogue_end"));
      }
      if (state === "dual_dialogue") {
        pushToken(createFountainToken("dual_dialogue_end"));
      }
      state = "normal";

      if (skip_separator || state === "title_page") {
        continue;
      }
      dualRight = false;
      currentToken.type = "separator";
      saveAndClearAssets();
      pushToken(currentToken);
      continue;
    }

    // top_or_separated = last_was_separator || i === 0;
    tokenCategory = "script";

    if (
      !titlePageStarted &&
      fountainRegexes.title_page.test(currentToken.content)
    ) {
      state = "title_page";
    }

    if (state === "title_page") {
      if ((match = currentToken.content.match(fountainRegexes.title_page))) {
        const key = match[2] || "";
        const entry = match[5] || "";
        currentToken.type = key
          .toLowerCase()
          .replace(" ", "_") as FountainTokenType;
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
          (lastTitlePageToken.text ? "\n" : "") + currentToken.content.trim();
        continue;
      }
    }

    if (state === "normal") {
      if (currentToken.content.match(fountainRegexes.line_break)) {
        tokenCategory = "none";
      } else if (parsed.properties.firstTokenLine === undefined) {
        parsed.properties.firstTokenLine = currentToken.line;
        currentSectionTokens = [];
        currentLevel = 0;
      }

      if ((match = currentToken.content.match(fountainRegexes.scene))) {
        currentToken.type = "scene";
        if (currentToken.type === "scene") {
          pushNotes();
          saveAndClearNotes();
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
          currentToken.content = content.startsWith(".")
            ? content.substring(1)
            : content;
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
        pushNotes();
        saveAndClearNotes();
        currentToken.content = currentToken.content.substring(1);
      } else if (currentToken.content.match(fountainRegexes.centered)) {
        currentToken.type = "centered";
        if ((match = lint(fountainRegexes.centered))) {
          pushNotes();
          saveAndClearNotes();
          currentToken.content = match[4] || "";
        }
      } else if (currentToken.content.match(fountainRegexes.transition)) {
        currentToken.type = "transition";
        if ((match = lint(fountainRegexes.transition))) {
          pushNotes();
          saveAndClearNotes();
          currentToken.content = match[2] || "";
        }
      } else if ((match = currentToken.content.match(fountainRegexes.go))) {
        currentToken.type = "go";
        if (currentToken.type === "go") {
          if ((match = lint(fountainRegexes.go))) {
            const name = match[4]?.trim() || "";
            const nameFrom = currentToken.from + getStart(match, 4);
            const nameTo = nameFrom + name.length;
            const methodArgs = match[6]?.trim() || "";
            const methodArgsFrom = currentToken.from + getStart(match, 6);
            const methodArgsTo = methodArgsFrom + methodArgs.length;
            currentToken.name = name;
            if (name !== "!END") {
              currentToken.methodArgs = getArgumentValues(
                name,
                methodArgs,
                nameFrom,
                nameTo,
                methodArgsFrom,
                methodArgsTo
              );
            }
          }
        }
      } else if ((match = currentToken.content.match(fountainRegexes.repeat))) {
        currentToken.type = "repeat";
      } else if ((match = currentToken.content.match(fountainRegexes.return))) {
        currentToken.type = "return";
        if (currentToken.type === "return") {
          if ((match = lint(fountainRegexes.return))) {
            const mark = match[2]?.trim() || "";
            const expression = match[4]?.trim() || "";
            const markFrom = currentToken.from + getStart(match, 2);
            const markTo = markFrom + mark.length;
            const expressionFrom = currentToken.from + getStart(match, 4);
            const expressionTo = expressionFrom + expression.length;
            const expectedType = parsed?.sections[currentSectionId]?.returnType;
            const validExpression = expression;
            if (expectedType && (!expression || expression === "^")) {
              const message = `Function expects to return a '${expectedType}' but returns nothing`;
              diagnostic(currentToken, message, [], markFrom, markTo);
            }
            currentToken.value = validExpression;
            if (expression && expression !== "^") {
              const [ids, context] = getScopedEvaluationContext(
                currentSectionId,
                parsed.sections
              );
              const { result, references, diagnostics } = compile(
                context,
                expression
              );
              if (references?.length > 0) {
                references.forEach((r) => {
                  const from = expressionFrom + r.from;
                  const to = expressionFrom + r.to;
                  parsed.references.push({
                    from,
                    to,
                    name: r.name,
                    id: ids[r.name],
                  });
                });
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
                  : `Methods cannot return a value`;
                diagnostic(
                  currentToken,
                  message,
                  [],
                  expressionFrom,
                  expressionTo
                );
              }
            }
          }
        }
      } else if (currentToken.content.match(fountainRegexes.list)) {
        if ((match = currentToken.content.match(fountainRegexes.call))) {
          currentToken.type = "call";
          if (currentToken.type === "call") {
            if ((match = lint(fountainRegexes.call))) {
              const name = match[4]?.trim() || "";
              const nameFrom = currentToken.from + getStart(match, 4);
              const nameTo = nameFrom + name.length;
              const methodArgs = match[6]?.trim() || "";
              const methodArgsFrom = currentToken.from + getStart(match, 6);
              const methodArgsTo = methodArgsFrom + methodArgs.length;
              currentToken.name = name;
              currentToken.methodArgs = getArgumentValues(
                name,
                methodArgs,
                nameFrom,
                nameTo,
                methodArgsFrom,
                methodArgsTo
              );
            }
          }
        } else if (
          (match = currentToken.content.match(fountainRegexes.condition))
        ) {
          currentToken.type = "condition";
          if (currentToken.type === "condition") {
            if ((match = lint(fountainRegexes.condition))) {
              const expression = match[4]?.trim() || "";
              const expressionFrom = currentToken.from + getStart(match, 4);
              currentToken.value = expression;
              if (expression) {
                const [ids, context] = getScopedEvaluationContext(
                  currentSectionId,
                  parsed.sections
                );
                const { references, diagnostics } = compile(
                  context,
                  expression
                );
                if (references?.length > 0) {
                  references.forEach((r) => {
                    const from = expressionFrom + r.from;
                    const to = expressionFrom + r.to;
                    parsed.references.push({
                      from,
                      to,
                      name: r.name,
                      id: ids[r.name],
                    });
                  });
                }
                if (diagnostics?.length > 0) {
                  for (let i = 0; i < diagnostics.length; i += 1) {
                    const d = diagnostics[i];
                    const from = expressionFrom + d.from;
                    const to = expressionFrom + d.to;
                    diagnostic(currentToken, d.message, [], from, to);
                  }
                }
              }
            }
          }
        } else if (
          (match = currentToken.content.match(fountainRegexes.assign))
        ) {
          currentToken.type = "assign";
          if (currentToken.type === "assign") {
            if ((match = lint(fountainRegexes.assign))) {
              const name = match[4]?.trim() || "";
              const operator = match[6]?.trim() || "";
              const expression = match[8]?.trim() || "";
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
                const { methodName, methodArgs } = getExpressionValue(
                  expression,
                  expressionFrom,
                  expressionTo,
                  found,
                  nameFrom,
                  nameTo
                );
                currentToken.value = expression;
                currentToken.methodName = methodName;
                currentToken.methodArgs = methodArgs;
              }
            }
          }
        } else if (
          (match = currentToken.content.match(fountainRegexes.choice))
        ) {
          currentToken.type = "choice";
          if (currentToken.type === "choice") {
            if ((match = lint(fountainRegexes.choice))) {
              const mark = match[2]?.trim() || "";
              const content = match[4]?.trim() || "";
              const section = match[8]?.trim() || "";
              const sectionFrom = currentToken.from + getStart(match, 8);
              const sectionTo = sectionFrom + section.length;
              if (section) {
                getSection(section, sectionFrom, sectionTo);
              }
              currentToken.mark = mark;
              currentToken.content = content;
              currentToken.section = section;
            }
          }
        } else {
          lintDiagnostic();
        }
      } else if (
        (match = currentToken.content.match(fountainRegexes.variable))
      ) {
        currentToken.type = "variable";
        lint(fountainRegexes.variable);
      } else if ((match = currentToken.content.match(fountainRegexes.asset))) {
        const type = match[2]?.trim() as FountainAssetType;
        currentToken.type = type;
        lint(fountainRegexes.asset);
      } else if ((match = currentToken.content.match(fountainRegexes.entity))) {
        const type = match[2]?.trim() as FountainEntityType;
        currentToken.type = type;
        lint(fountainRegexes.entity);
      } else if ((match = currentToken.content.match(fountainRegexes.tag))) {
        currentToken.type = "tag";
        lint(fountainRegexes.tag);
      } else if (
        (match = currentToken.content.match(fountainRegexes.synopses))
      ) {
        currentToken.type = "synopses";
        if ((match = lint(fountainRegexes.synopses))) {
          currentToken.content = match[4];
        }
      } else if (
        (match = currentToken.content.match(fountainRegexes.section))
      ) {
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
              startNewSection(level);
            }
          } else if (lint(fountainRegexes.section)) {
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
            startNewSection(level);
          }
        }
      } else if (currentToken.content.match(fountainRegexes.page_break)) {
        currentToken.type = "page_break";
        if ((match = lint(fountainRegexes.page_break))) {
          currentToken.content = match[3] || "";
        }
      } else if (
        currentToken.content.match(fountainRegexes.character) &&
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
        pushNotes();
        if (currentToken.type === "character") {
          currentToken.content = trimCharacterForceSymbol(currentToken.content);
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
              index += 1;
              lastCharacterToken = parsed.scriptTokens[index];
            }
            // update last dialogue_begin to be dual_dialogue_begin and remove last dialogue_end
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
                case "dialogue_begin":
                  parsed.scriptTokens[temp_index].type = "dual_dialogue_begin";
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
            pushToken(createFountainToken("dialogue_begin"));
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
            .trim()
            .replace(/\^$/, "")
            .trim();
        }
      } else if (
        currentToken.content?.match(fountainRegexes.note) &&
        !currentToken.content?.replace(fountainRegexes.note, "")?.trim()
      ) {
        currentToken.type = "action_asset";
        pushAssets();
      } else {
        currentToken.type = "action";
        pushNotes();
        saveAndClearNotes();
        saveAndClearAssets();
      }
    } else {
      if (
        currentToken.content?.match(fountainRegexes.note) &&
        !currentToken.content?.replace(fountainRegexes.note, "")?.trim()
      ) {
        currentToken.type = "dialogue_asset";
        pushAssets();
      } else if (currentToken.content.match(fountainRegexes.parenthetical)) {
        currentToken.type = "parenthetical";
        pushNotes();
        saveAndClearNotes();
        previousParenthetical = currentToken.content;
      } else {
        currentToken.type = "dialogue";
        pushNotes();
        saveAndClearNotes();
        saveAndClearAssets();
        if (currentToken.type === "dialogue") {
          if (previousCharacter) {
            currentToken.character = previousCharacter;
          }
          if (previousParenthetical) {
            currentToken.parenthetical = previousParenthetical;
          }
        }
        previousParenthetical = null;
      }
      if (dualRight) {
        if (currentToken.type === "parenthetical") {
          currentToken.position = "right";
        }
        if (currentToken.type === "dialogue") {
          currentToken.position = "right";
        }
      }
    }

    if (
      currentToken.type !== "action" &&
      !(currentToken.type === "dialogue" && currentToken.content === "  ")
    ) {
      currentToken.content = currentToken.content.trim();
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
        currentToken.content = currentToken.content.trim();

      if (currentToken.ignore) {
        ignoredLastToken = true;
      } else {
        ignoredLastToken = false;
        pushToken(currentToken);
      }
    }
  }

  if (state === "dialogue") {
    pushToken(createFountainToken("dialogue_end"));
    previousCharacter = null;
    previousParenthetical = null;
  }

  if (state === "dual_dialogue") {
    pushToken(createFountainToken("dual_dialogue_end"));
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

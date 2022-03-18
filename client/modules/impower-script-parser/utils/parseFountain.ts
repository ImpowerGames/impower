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
import { getScopedContext } from "./getScopedContext";
import { getScopedItem } from "./getScopedItem";
import { trimCharacterExtension } from "./trimCharacterExtension";
import { trimCharacterForceSymbol } from "./trimCharacterForceSymbol";

export const parseFountain = (
  originalScript: string,
  augmentations?: FountainDeclarations
): FountainParseResult => {
  const script = originalScript;

  const result: FountainParseResult = {
    scriptTokens: [],
    scriptLines: {},
    properties: {},
    ...augmentations,
  };

  Object.entries(augmentations?.variables || {}).forEach(([id, d]) => {
    const parentId = id.split(".").slice(0, -1).join(".") || "";
    if (!result.sections) {
      result.sections = {};
    }
    if (!result.sections[parentId]) {
      result.sections[parentId] = {};
    }
    if (!result.sections[parentId].variables) {
      result.sections[parentId].variables = {};
    }
    result.sections[parentId].variables[id] = d;
  });
  Object.entries(augmentations?.tags || {}).forEach(([id, d]) => {
    const parentId = id.split(".").slice(0, -1).join(".") || "";
    if (!result.sections) {
      result.sections = {};
    }
    if (!result.sections[parentId]) {
      result.sections[parentId] = {};
    }
    if (!result.sections[parentId].tags) {
      result.sections[parentId].tags = {};
    }
    result.sections[parentId].tags[id] = d;
  });
  Object.entries(augmentations?.assets || {}).forEach(([id, d]) => {
    const parentId = id.split(".").slice(0, -1).join(".") || "";
    if (!result.sections) {
      result.sections = {};
    }
    if (!result.sections[parentId]) {
      result.sections[parentId] = {};
    }
    if (!result.sections[parentId].assets) {
      result.sections[parentId].assets = {};
    }
    result.sections[parentId].assets[id] = d;
  });

  if (!script) {
    return result;
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
  let notes: Partial<FountainAsset>[] = [];

  const diagnostic = (
    currentToken: FountainToken,
    message: string,
    actions: FountainAction[] = [],
    from = -1,
    to = -1,
    severity: "error" | "warning" | "info" = "error"
  ): void => {
    if (!result.diagnostics) {
      result.diagnostics = [];
    }
    const source = `${severity.toUpperCase()}: line ${
      currentToken.line
    } column ${from - currentToken.from}`;
    const validFrom = from >= 0 ? from : currentToken.from;
    const validTo = to >= 0 ? to : currentToken.to;
    if (validTo > validFrom) {
      result.diagnostics.push({
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

  const getLength = (match: string[], groupIndex: number): number => {
    if (!match) {
      return -1;
    }
    const group = match[groupIndex];
    if (group == null) {
      return -1;
    }
    return group.length;
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

  const findSection = (sectionId: string, name: string): FountainSection => {
    return getScopedItem(result?.sections, sectionId, name);
  };

  const findVariable = (sectionId: string, name: string): FountainVariable => {
    return getScopedItem(result?.variables, sectionId, name, ["parameter"]);
  };

  const findAsset = (sectionId: string, name: string): FountainAsset => {
    return getScopedItem(result?.assets, sectionId, name);
  };

  const findEntity = (sectionId: string, name: string): FountainEntity => {
    return getScopedItem(result?.entities, sectionId, name);
  };

  const findTag = (sectionId: string, name: string): FountainTag => {
    return getScopedItem(result?.tags, sectionId, name);
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
        [{ name: "FOCUS", focus: { from: found.from, to: found.to } }],
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
        ) as T,
        from,
        to
      )
    ) {
      return;
    }
    if (
      lintNameUnique<T>(
        "variable",
        findVariable(currentSectionId, name) as T,
        from,
        to
      )
    ) {
      return;
    }
    if (
      lintNameUnique<T>(
        "asset",
        findAsset(currentSectionId, name) as T,
        from,
        to
      )
    ) {
      return;
    }
    if (
      lintNameUnique<T>(
        "entity",
        findEntity(currentSectionId, name) as T,
        from,
        to
      )
    ) {
      return;
    }
    lintNameUnique<T>("tag", findTag(currentSectionId, name) as T, from, to);
  };

  const getEvaluationContext = (
    sectionId: string
  ): Record<string, string | number | boolean> => {
    const [, sections] = getScopedContext(
      sectionId,
      result?.sections,
      "sections"
    );
    const [, tags] = getScopedContext(sectionId, result?.sections, "tags");
    const [, assets] = getScopedContext(sectionId, result?.sections, "assets");
    const [, entities] = getScopedContext(
      sectionId,
      result?.sections,
      "entities"
    );
    const [, variables] = getScopedContext(
      sectionId,
      result?.sections,
      "variables"
    );
    return { ...sections, ...tags, ...assets, ...entities, ...variables };
  };

  const addSection = (section: FountainSection): void => {
    if (!result.sections) {
      result.sections = {};
    }
    const parentId = currentSectionId.split(".").slice(0, -1).join(".") || "";
    const parent = result.sections[parentId];
    if (parent) {
      if (currentSectionId) {
        if (!parent.children) {
          parent.children = [];
        }
        parent.children.push(currentSectionId);
      }
    } else {
      console.error("SECTION DOES NOT EXIST", parentId);
    }
    lintName(section.name, section.from, section.to);
    result.sections[currentSectionId] = section;
    if (!result.sectionLines) {
      result.sectionLines = {};
    }
    result.sectionLines[section.line] = currentSectionId;
  };

  const getSection = (
    nameOrId: string,
    from?: number,
    to?: number
  ): FountainSection => {
    if (!nameOrId) {
      return undefined;
    }
    const global = nameOrId.startsWith(".");
    const found = global
      ? result.sections?.[nameOrId]
      : findSection(currentSectionId, nameOrId);
    if (!found) {
      diagnostic(
        currentToken,
        `Cannot find ${
          global
            ? `section with id '${nameOrId}'`
            : `child or ancestor section named '${nameOrId}'`
        }`,
        [],
        from,
        to
      );
      return null;
    }
    return found;
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
    const found = findAsset(currentSectionId, name);
    if (!found) {
      diagnostic(
        currentToken,
        `Could not find ${validType} named '${name}'`,
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
        [{ name: "FOCUS", focus: { from: found.from, to: found.to } }],
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
    const found = findEntity(currentSectionId, name);
    if (!found) {
      diagnostic(
        currentToken,
        `Could not find ${validType} named '${name}'`,
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
        [{ name: "FOCUS", focus: { from: found.from, to: found.to } }],
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
    const found = findTag(currentSectionId, name);
    if (!found) {
      diagnostic(
        currentToken,
        `Could not find tag named '${name}'`,
        [],
        from,
        to
      );
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
    const validType = type || "string";
    const found = findVariable(currentSectionId, name);
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
    if (type !== undefined && found.type !== validType) {
      diagnostic(
        currentToken,
        `'${name}' is not ${prefixArticle(validType)} variable`,
        [{ name: "FOCUS", focus: { from: found.from, to: found.to } }],
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

  const addAsset = (
    type: FountainAssetType,
    name: string,
    valueText: string,
    value: string | { name: string },
    line: number,
    from: number,
    to: number
  ): void => {
    if (!result.assets) {
      result.assets = {};
    }
    lintName(name, from, to);
    const resolvedValue =
      typeof value === "string"
        ? value
        : getAsset(type, value?.name, from, to)?.value;
    const id = `${currentSectionId}.${name}`;
    const item = {
      ...(result.assets[id] || {}),
      from,
      to,
      line,
      name,
      type,
      value: resolvedValue,
      valueText,
    };
    result.assets[id] = item;
    const parent = result.sections[currentSectionId];
    if (parent) {
      if (!parent.assets) {
        parent.assets = {};
      }
      parent.assets[id] = item;
    } else {
      console.error("SECTION DOES NOT EXIST", currentSectionId);
    }
  };

  const addEntity = (
    type: FountainEntityType,
    name: string,
    valueText: string,
    value: string | { name: string },
    line: number,
    from: number,
    to: number
  ): void => {
    if (!result.entities) {
      result.entities = {};
    }
    lintName(name, from, to);
    const resolvedValue =
      typeof value === "string"
        ? value
        : getEntity(type, value?.name, from, to)?.value;
    const id = `${currentSectionId}.${name}`;
    const item = {
      ...(result.entities[id] || {}),
      from,
      to,
      line,
      name,
      type,
      value: resolvedValue,
      valueText,
    };
    result.entities[id] = item;
    const parent = result.sections[currentSectionId];
    if (parent) {
      if (!parent.entities) {
        parent.entities = {};
      }
      parent.entities[id] = item;
    } else {
      console.error("SECTION DOES NOT EXIST", currentSectionId);
    }
  };

  const addTag = (
    name: string,
    valueText: string,
    value: string | { name: string },
    line: number,
    from: number,
    to: number
  ): void => {
    if (!result.tags) {
      result.tags = {};
    }
    lintName(name, from, to);
    const resolvedValue =
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
        ? value
        : getTag(value?.name, from, to)?.value;
    const id = `${currentSectionId}.${name}`;
    const item = {
      ...(result.tags[id] || {}),
      from,
      to,
      name,
      line,
      value: resolvedValue,
      valueText,
    };
    result.tags[id] = item;
    const parent = result.sections[currentSectionId];
    if (parent) {
      if (!parent.tags) {
        parent.tags = {};
      }
      parent.tags[id] = item;
    } else {
      console.error("SECTION DOES NOT EXIST", currentSectionId);
    }
  };

  const addVariable = (
    name: string,
    valueText: string,
    value: string | number | boolean | { name: string },
    parameter: boolean,
    line: number,
    nameFrom: number,
    nameTo: number
  ): void => {
    const valueVariable =
      typeof value === "object"
        ? findVariable(currentSectionId, value.name)
        : undefined;
    const type = valueVariable
      ? valueVariable.type
      : (typeof value as FountainVariableType);
    if (!result.variables) {
      result.variables = {};
    }
    lintName(name, nameFrom, nameTo);
    const resolvedValue =
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
        ? value
        : findVariable(currentSectionId, value?.name)?.value;
    const id = `${currentSectionId}.${parameter ? `parameter-` : ""}${name}`;
    const item = {
      ...(result.variables[id] || {}),
      from: nameFrom,
      to: nameTo,
      line,
      name,
      type,
      value: resolvedValue,
      valueText,
      parameter,
    };
    result.variables[id] = item;
    const parent = result.sections[currentSectionId];
    if (parent) {
      if (!parent.variables) {
        parent.variables = {};
      }
      parent.variables[id] = item;
    } else {
      console.error("SECTION DOES NOT EXIST", currentSectionId);
    }
  };

  const getVariableValueOrReference = (
    content: string,
    from: number,
    to: number
  ):
    | string
    | number
    | boolean
    | { name: string; type: FountainVariableType } => {
    const type = getValueType(content);
    if (type === "string") {
      return content.slice(1, -1);
    }
    if (type === "number") {
      return Number(content);
    }
    if (type === "boolean") {
      return Boolean(content);
    }
    const found = getVariable(undefined, content, from, to);
    if (found) {
      return {
        name: content,
        type: found.type,
      };
    }
    return undefined;
  };

  const getAssetValueOrReference = (
    type: FountainAssetType,
    content: string,
    from: number,
    to: number
  ): string | { name: string } => {
    if (content.match(fountainRegexes.string)) {
      return content.slice(1, -1);
    }
    const found = getAsset(type, content, from, to);
    if (found) {
      return {
        name: content,
      };
    }
    return undefined;
  };

  const getEntityValueOrReference = (
    type: FountainEntityType,
    content: string,
    from: number,
    to: number
  ): string | { name: string } => {
    if (content.match(fountainRegexes.string)) {
      return content.slice(1, -1);
    }
    const found = getEntity(type, content, from, to);
    if (found) {
      return {
        name: content,
      };
    }
    return undefined;
  };

  const getTagValueOrReference = (
    content: string,
    from: number,
    to: number
  ): string | { name: string } => {
    if (content.match(fountainRegexes.string)) {
      return content.slice(1, -1);
    }
    const found = getTag(content, from, to);
    if (found) {
      return {
        name: content,
      };
    }
    return undefined;
  };

  const getParameterNames = (
    operator: string,
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
    const allTokenMatches = ["(", ...tokenMatches, ")"];
    const allMatches = [...match];
    allMatches.splice(groupIndex, 1, ...allTokenMatches);
    const parameterNames: string[] = [];
    const startIndex = groupIndex + 1;
    const endIndex = groupIndex + allTokenMatches.length - 1;
    for (let index = startIndex; index < endIndex; index += 1) {
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
          if (operator === "?") {
            getVariable(undefined, name, nameFrom, nameTo);
          } else {
            const value = valueText
              ? getVariableValueOrReference(valueText, valueFrom, valueTo)
              : "";
            addVariable(
              name,
              valueText,
              value,
              true,
              currentToken.line,
              nameFrom,
              nameTo
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

  const getArgumentValues = (
    section: FountainSection,
    match: string[],
    groupIndex: number
  ): string[] => {
    if (!section) {
      return [];
    }
    const parameters = Object.values(section.variables || {}).filter(
      (v) => v.parameter
    );
    if (!match) {
      return [];
    }
    const argumentsWithParenthesisString = match[groupIndex] || "";
    if (!argumentsWithParenthesisString) {
      return [];
    }
    const argumentsString = argumentsWithParenthesisString.slice(1, -1);
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
    const allTokenMatches = ["(", ...tokenMatches, ")"];
    const allMatches = [...match];
    allMatches.splice(groupIndex, 1, ...allTokenMatches);
    const argumentExpressions: string[] = [];
    const startIndex = groupIndex + 1;
    const endIndex = groupIndex + allTokenMatches.length - 1;
    let paramIndex = 0;
    const extraArgIndices: number[] = [];
    for (let index = startIndex; index < endIndex; index += 1) {
      const expression = allMatches[index];
      const expressionFrom = currentToken.from + getStart(allMatches, index);
      const expressionTo = expressionFrom + expression.length;
      const parameter = parameters?.[paramIndex];
      if (expression === ",") {
        // Separator
      } else if (!expression.trim()) {
        if (!parameter) {
          extraArgIndices.push(index);
        }
        argumentExpressions.push(parameter.name);
        paramIndex += 1;
      } else {
        if (!parameter) {
          extraArgIndices.push(index);
        }
        if (expression) {
          const context = getEvaluationContext(currentSectionId);
          const { result, diagnostics } = compile(context, expression);
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
                    focus: { from: parameter.from, to: parameter.to },
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
      const from = currentToken.from + getStart(allMatches, startIndex);
      const to = from + getLength(allMatches, endIndex);
      diagnostic(
        currentToken,
        `Expected ${parameters.length} ${
          parameters.length === 1 ? "argument" : "arguments"
        } but got ${parameters.length + extraArgIndices.length}`,
        [],
        from,
        to
      );
    }
    return argumentExpressions;
  };

  const pushToken = (token: FountainToken): void => {
    if (!result.scriptLines) {
      result.scriptLines = {};
    }
    result.scriptLines[token.line] = result.scriptTokens.length;
    result.scriptTokens.push(token);
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
        const value = name ? getAsset(type, name, from, to)?.value : undefined;
        notes.push({ type, value });
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
    const section = result.sections[currentSectionId];
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

  addSection({
    ...(result?.sections[currentSectionId] || {}),
    from: currentToken.from,
    to: currentToken.to,
    line: 1,
    operator: "",
    name: "",
    triggers: [],
    tokens: currentSectionTokens,
  });

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
        const operator = (match[4] as "?" | "*") || "";
        const name = match[5] || "";
        const id = `${operator}${name}`;
        if (level === 0) {
          currentSectionId = id;
        } else if (level === 1) {
          currentSectionId = `.${id}`;
        } else if (level > currentLevel) {
          currentSectionId += `.${id}`;
        } else if (level < currentLevel) {
          const grandparentId = currentSectionId
            .split(".")
            .slice(0, -2)
            .join(".");
          currentSectionId = `${grandparentId}.${id}`;
        } else {
          const parentId = currentSectionId.split(".").slice(0, -1).join(".");
          currentSectionId = `${parentId}.${id}`;
        }
        const newSection: FountainSection = {
          ...(result?.sections[currentSectionId] || {}),
          from: currentToken.from,
          to: currentToken.to,
          line: currentToken.line,
          operator,
          name,
          tokens: currentSectionTokens,
        };
        addSection(newSection);
        const parameters = getParameterNames(operator, match, 7);
        newSection.triggers = operator === "?" ? parameters : [];
        startNewSection(level);
      }
    } else if ((match = currentToken.content.match(fountainRegexes.variable))) {
      currentToken.type = "variable";
      if (currentToken.type === "variable") {
        const name = match[4]?.trim() || "";
        const valueText = match[8]?.trim() || "";
        const nameFrom = currentToken.from + getStart(match, 4);
        const nameTo = nameFrom + name.length;
        const valueFrom = currentToken.from + getStart(match, 8);
        const valueTo = valueFrom + valueText.length;
        const value = valueText
          ? getVariableValueOrReference(valueText, valueFrom, valueTo)
          : "";
        if (name) {
          addVariable(
            name,
            valueText,
            value,
            undefined,
            currentToken.line,
            nameFrom,
            nameTo
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
        const value = valueText
          ? getAssetValueOrReference(type, valueText, valueFrom, valueTo)
          : "";
        if (name) {
          addAsset(
            type,
            name,
            valueText,
            value,
            currentToken.line,
            nameFrom,
            nameTo
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
        const value = valueText
          ? getEntityValueOrReference(type, valueText, valueFrom, valueTo)
          : "";
        if (name) {
          addEntity(
            type,
            name,
            valueText,
            value,
            currentToken.line,
            nameFrom,
            nameTo
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
        const value = valueText
          ? getTagValueOrReference(valueText, valueFrom, valueTo)
          : "";
        if (name) {
          addTag(name, valueText, value, currentToken.line, nameFrom, nameTo);
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
        result.scriptTokens.length > 1 &&
        result.scriptTokens[result.scriptTokens.length - 1]?.type ===
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
          if (!result.titleTokens) {
            result.titleTokens = {};
          }
          if (!result.titleTokens[keyFormat.position]) {
            result.titleTokens[keyFormat.position] = [];
          }
          result.titleTokens[keyFormat.position].push(currentToken);
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
      } else if (result.properties.firstTokenLine === undefined) {
        result.properties.firstTokenLine = currentToken.line;
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
          if (!result.properties.scenes) {
            result.properties.scenes = [];
          }
          result.properties.scenes.push({
            name: currentToken.content,
            scene: currentToken.scene,
            line: currentToken.line,
          });
          if (!result.properties.locations) {
            result.properties.locations = {};
          }
          if (result.properties.locations[location]) {
            result.properties.locations[location].push(currentToken.line);
          } else {
            result.properties.locations[location] = [currentToken.line];
          }
          if (!result.properties.times) {
            result.properties.times = {};
          }
          if (result.properties.times[time]) {
            result.properties.times[time].push(currentToken.line);
          } else {
            result.properties.times[time] = [currentToken.line];
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
            const section =
              name !== "!END" ? getSection(name, nameFrom, nameTo) : undefined;
            currentToken.name = name;
            currentToken.values = getArgumentValues(section, match, 6);
          }
        }
      } else if ((match = currentToken.content.match(fountainRegexes.repeat))) {
        currentToken.type = "repeat";
      } else if ((match = currentToken.content.match(fountainRegexes.return))) {
        currentToken.type = "return";
        if (currentToken.type === "return") {
          if ((match = lint(fountainRegexes.return))) {
            const expression = match[4]?.trim() || "";
            const expressionFrom = currentToken.from + getStart(match, 4);
            currentToken.value = expression;
            if (expression) {
              const context = getEvaluationContext(currentSectionId);
              const { diagnostics } = compile(context, expression);
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
      } else if (currentToken.content.match(fountainRegexes.list)) {
        if ((match = currentToken.content.match(fountainRegexes.call))) {
          currentToken.type = "call";
          if (currentToken.type === "call") {
            if ((match = lint(fountainRegexes.call))) {
              const name = match[4]?.trim() || "";
              const nameFrom = currentToken.from + getStart(match, 4);
              const nameTo = nameFrom + name.length;
              currentToken.name = name;
              const section = getSection(`*${name}`, nameFrom, nameTo);
              currentToken.values = getArgumentValues(section, match, 6);
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
                const context = getEvaluationContext(currentSectionId);
                const { diagnostics } = compile(context, expression);
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
              currentToken.name = name;
              currentToken.operator = operator;
              currentToken.value = expression;
              const variableValue = name
                ? getVariableValueOrReference(name, nameFrom, nameTo)
                : undefined;
              if (expression) {
                const context = getEvaluationContext(currentSectionId);
                const { result, diagnostics } = compile(context, expression);
                const expectedType =
                  typeof variableValue === "string" ||
                  typeof variableValue === "number" ||
                  typeof variableValue === "boolean"
                    ? typeof variableValue
                    : variableValue.type;
                if (diagnostics?.length > 0) {
                  for (let i = 0; i < diagnostics.length; i += 1) {
                    const d = diagnostics[i];
                    const from = expressionFrom + d.from;
                    const to = expressionFrom + d.to;
                    diagnostic(currentToken, d.message, [], from, to);
                  }
                } else {
                  const evaluatedType = typeof result;
                  if (evaluatedType !== expectedType) {
                    diagnostic(
                      currentToken,
                      `'${name}' is not ${prefixArticle(
                        evaluatedType
                      )} variable`,
                      [],
                      nameFrom,
                      nameTo
                    );
                  }
                }
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
          const operator = match[4] || "";
          const name = match[5] || "";
          const id = `${operator}${name}`;
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
              currentSectionId += `.${id}`;
              startNewSection(level);
            }
          } else if (lint(fountainRegexes.section)) {
            if (level === 0) {
              currentSectionId = id;
            } else if (level === 1) {
              currentSectionId = `.${id}`;
            } else if (level > currentLevel) {
              currentSectionId += `.${id}`;
            } else if (level < currentLevel) {
              const grandparentId = currentSectionId
                .split(".")
                .slice(0, -2)
                .join(".");
              currentSectionId = `${grandparentId}.${id}`;
            } else {
              const parentId = currentSectionId
                .split(".")
                .slice(0, -1)
                .join(".");
              currentSectionId = `${parentId}.${id}`;
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
            let lastCharacterToken = result.scriptTokens[index];
            while (
              lastCharacterToken?.type === "character" ||
              lastCharacterToken?.type === "parenthetical" ||
              lastCharacterToken?.type === "dialogue"
            ) {
              lastCharacterToken.position = "left";
              index += 1;
              lastCharacterToken = result.scriptTokens[index];
            }
            // update last dialogue_begin to be dual_dialogue_begin and remove last dialogue_end
            let foundMatch = false;
            let temp_index = result.scriptTokens.length;
            temp_index -= 1;
            while (!foundMatch) {
              temp_index -= 1;
              switch (result.scriptTokens[temp_index]?.type) {
                case "dialogue_end":
                  result.scriptTokens.splice(temp_index);
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
                  result.scriptTokens[temp_index].type = "dual_dialogue_begin";
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
          if (!result.properties.characters) {
            result.properties.characters = {};
          }
          if (result.properties.characters[characterName]) {
            result.properties.characters[characterName].push(currentToken.line);
          } else {
            result.properties.characters[characterName] = [currentToken.line];
          }
          previousCharacter = currentToken.content;
          lastCharacterIndex = result.scriptTokens.length;
          if (!result.dialogueLines) {
            result.dialogueLines = {};
          }
          result.dialogueLines[currentToken.line] = currentToken.content
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
    result.titleTokens = undefined;
  }

  // clean separators at the end
  while (
    result.scriptTokens.length > 0 &&
    result.scriptTokens[result.scriptTokens.length - 1]?.type === "separator"
  ) {
    result.scriptTokens.pop();
  }

  return result;
};

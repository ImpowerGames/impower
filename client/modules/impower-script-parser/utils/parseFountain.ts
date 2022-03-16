/* eslint-disable no-cond-assign */
/* eslint-disable prefer-destructuring */
/* eslint-disable no-continue */
import { fountainRegexes } from "../constants/fountainRegexes";
import { titlePageDisplay } from "../constants/pageTitleDisplay";
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
    start = -1,
    length = -1,
    severity: "error" | "warning" | "info" = "error"
  ): void => {
    if (!result.diagnostics) {
      result.diagnostics = [];
    }
    const validStart = start >= 0 ? start : currentToken.indent;
    const column = current - currentToken.end + validStart;
    const from = currentToken.start + validStart;
    const to = length >= 0 ? from + length : currentToken.end;
    const source = `${severity.toUpperCase()}: line ${
      currentToken.line
    } column ${column}`;
    result.diagnostics.push({
      from,
      to,
      severity,
      source,
      message,
      actions,
    });
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

  const prefixArticle = (str: string): string => {
    return `${["a", "e", "i", "o", "u"].includes(str[0]) ? "an" : "a"} ${str}`;
  };

  const getActions = (focus?: number): FountainAction[] => {
    const actions = [];
    if (focus) {
      actions.push({ name: "Focus", focus });
    }
    return actions;
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
    return getScopedItem(result?.variables, sectionId, name, "param-");
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

  const addSection = (
    id: string,
    section: FountainSection,
    match?: string[],
    index?: number
  ): void => {
    if (!result.sections) {
      result.sections = {};
    }
    const parentId = id.split(".").slice(0, -1).join(".") || "";
    const parent = result.sections[parentId];
    if (parent && id) {
      if (!parent.children) {
        parent.children = [];
      }
      parent.children.push(id);
    }
    const existingChild = result.sections[id];
    const sectionName = id.split(".").slice(-1).join("");
    const existingAncestor = findSection(
      currentSectionId.split(".").slice(0, -1).join("."),
      sectionName
    );
    const found = existingChild || existingAncestor;
    if (found?.name && found?.line !== section?.line) {
      diagnostic(
        currentToken,
        `A section named '${section.name}' already exists at line ${found.line}`,
        getActions(found.start),
        getStart(match, index),
        getLength(match, index)
      );
    }
    const existingVariable = findVariable(currentSectionId, section.name);
    if (existingVariable?.name) {
      diagnostic(
        currentToken,
        `A variable named '${section.name}' already exists at line ${existingVariable.line}`,
        getActions(existingVariable.start),
        getStart(match, index),
        getLength(match, index)
      );
    }
    result.sections[id] = { ...(found || {}), ...section };
    if (!result.sectionLines) {
      result.sectionLines = {};
    }
    result.sectionLines[section.line] = id;
  };

  const getSection = (
    nameOrId: string,
    match?: string[],
    index?: number,
    start?: number,
    length?: number
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
        `Could not find ${
          global
            ? `section with id '${nameOrId}'`
            : `child or ancestor section named '${nameOrId}'`
        }`,
        getActions(),
        start != null ? start : getStart(match, index),
        length != null ? length : getLength(match, index)
      );
      return null;
    }
    return found;
  };

  const getAsset = (
    type: FountainAssetType,
    name: string,
    match?: string[],
    index?: number,
    start?: number,
    length?: number
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
        getActions(),
        start != null ? start : getStart(match, index),
        length != null ? length : getLength(match, index)
      );
      return null;
    }
    const found = findAsset(currentSectionId, name);
    if (!found) {
      diagnostic(
        currentToken,
        `Could not find ${validType} named '${name}'`,
        getActions(),
        start != null ? start : getStart(match, index),
        length != null ? length : getLength(match, index)
      );
      return null;
    }
    if (found.type !== validType) {
      diagnostic(
        currentToken,
        `'${name}' is not ${prefixArticle(validType)} asset`,
        getActions(found.line),
        start != null ? start : getStart(match, index),
        length != null ? length : getLength(match, index)
      );
      return null;
    }
    return found;
  };

  const getEntity = (
    type: FountainEntityType,
    name: string,
    match?: string[],
    index?: number,
    start?: number,
    length?: number
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
        getActions(),
        start != null ? start : getStart(match, index),
        length != null ? length : getLength(match, index)
      );
      return null;
    }
    const found = findEntity(currentSectionId, name);
    if (!found) {
      diagnostic(
        currentToken,
        `Could not find ${validType} named '${name}'`,
        getActions(),
        start != null ? start : getStart(match, index),
        length != null ? length : getLength(match, index)
      );
      return null;
    }
    if (found.type !== validType) {
      diagnostic(
        currentToken,
        `'${name}' is not ${prefixArticle(validType)} entity`,
        getActions(found.start),
        start != null ? start : getStart(match, index),
        length != null ? length : getLength(match, index)
      );
      return null;
    }
    return found;
  };

  const getTag = (
    name: string,
    match?: string[],
    index?: number,
    start?: number,
    length?: number
  ): FountainTag => {
    if (!name) {
      return undefined;
    }
    const numValue = Number(name);
    if (!Number.isNaN(numValue)) {
      diagnostic(
        currentToken,
        `'${name}' is not a valid tag value`,
        getActions(),
        start != null ? start : getStart(match, index),
        length != null ? length : getLength(match, index)
      );
      return null;
    }
    const found = findTag(currentSectionId, name);
    if (!found) {
      diagnostic(
        currentToken,
        `Could not find tag named '${name}'`,
        getActions(),
        start != null ? start : getStart(match, index),
        length != null ? length : getLength(match, index)
      );
      return null;
    }
    return found;
  };

  const getVariable = (
    type: FountainVariableType,
    name: string,
    match?: string[],
    index?: number,
    start?: number,
    length?: number
  ): FountainVariable => {
    if (!name) {
      return undefined;
    }
    const validType = type || "string";
    const found = findVariable(currentSectionId, name);
    if (!found) {
      diagnostic(
        currentToken,
        `Could not find variable named '${name}'`,
        getActions(),
        start != null ? start : getStart(match, index),
        length != null ? length : getLength(match, index)
      );
      return null;
    }
    if (found.type !== validType) {
      diagnostic(
        currentToken,
        `'${name}' is not ${prefixArticle(validType)} variable`,
        getActions(found.start),
        start != null ? start : getStart(match, index),
        length != null ? length : getLength(match, index)
      );
      return null;
    }
    return found;
  };

  const getValueType = (value: string): FountainVariableType => {
    if (value == null || value === "") {
      return null;
    }
    if (value.match(fountainRegexes.string)) {
      return "string";
    }
    const numValue = Number(value);
    if (!Number.isNaN(numValue)) {
      return "number";
    }
    return undefined;
  };

  const getValue = (
    content: string,
    match?: string[],
    index?: number
  ): string | number | { name: string; type: "string" | "number" } => {
    const type = getValueType(content);
    if (type === "string") {
      return content.slice(1, -1);
    }
    if (type === "number") {
      return Number(content);
    }
    const found = getVariable(type, content, match, index);
    if (found) {
      return {
        name: content,
        type: found.type,
      };
    }
    return undefined;
  };

  const addAsset = (
    type: FountainAssetType,
    name: string,
    valueText: string,
    value: string | { name: string },
    start: number,
    line: number,
    match: string[],
    index: number
  ): void => {
    if (!result.assets) {
      result.assets = {};
    }
    const found = findAsset(currentSectionId, name);
    if (found && line !== found.line) {
      diagnostic(
        currentToken,
        `A ${
          currentSectionId ? "local" : "global"
        } asset named '${name}' already exists at line ${found.line}`,
        getActions(found.start),
        getStart(match, index),
        getLength(match, index)
      );
    }
    const resolvedValue =
      typeof value === "string"
        ? value
        : getAsset(type, value?.name, match, index)?.value;
    const asset = {
      ...(found || {}),
      start,
      line,
      name,
      type,
      value: resolvedValue,
      valueText,
    };
    const id = `${currentSectionId}.${name}`;
    result.assets[id] = asset;
    const parent = result.sections[currentSectionId];
    if (parent) {
      if (!parent.assets) {
        parent.assets = {};
      }
      parent.assets[id] = asset;
    }
  };

  const addEntity = (
    type: FountainEntityType,
    name: string,
    valueText: string,
    value: string | { name: string },
    start: number,
    line: number,
    match: string[],
    index: number
  ): void => {
    if (!result.entities) {
      result.entities = {};
    }
    const found = findEntity(currentSectionId, name);
    if (found && line !== found.line) {
      diagnostic(
        currentToken,
        `A ${
          currentSectionId ? "local" : "global"
        } entity named '${name}' already exists at line ${found.line}`,
        getActions(found.start),
        getStart(match, index),
        getLength(match, index)
      );
    }
    const resolvedValue =
      typeof value === "string"
        ? value
        : getEntity(type, value?.name, match, index)?.value;
    const asset = {
      ...(found || {}),
      start,
      line,
      name,
      type,
      value: resolvedValue,
      valueText,
    };
    const id = `${currentSectionId}.${name}`;
    result.entities[id] = asset;
    const parent = result.sections[currentSectionId];
    if (parent) {
      if (!parent.entities) {
        parent.entities = {};
      }
      parent.entities[id] = asset;
    }
  };

  const addTag = (
    name: string,
    valueText: string,
    value: string | { name: string },
    start: number,
    line: number,
    match: string[],
    index: number
  ): void => {
    if (!result.tags) {
      result.tags = {};
    }
    const found = findTag(currentSectionId, name);
    if (found && line !== found.line) {
      diagnostic(
        currentToken,
        `A ${
          currentSectionId ? "local" : "global"
        } tag named '${name}' already exists at line ${found.line}`,
        getActions(found.start),
        getStart(match, index),
        getLength(match, index)
      );
    }
    const resolvedValue =
      typeof value === "string" || typeof value === "number"
        ? value
        : getTag(value?.name, match, index)?.value;
    const tag = {
      ...(found || {}),
      start,
      name,
      line,
      value: resolvedValue,
      valueText,
    };
    const id = `${currentSectionId}.${name}`;
    result.tags[id] = tag;
    const parent = result.sections[currentSectionId];
    if (parent) {
      if (!parent.tags) {
        parent.tags = {};
      }
      parent.tags[id] = tag;
    }
  };

  const addVariable = (
    name: string,
    valueText: string,
    value: string | number | { name: string },
    parameter: boolean,
    start: number,
    line: number,
    match: string[],
    index: number
  ): void => {
    const type = typeof value as FountainVariableType;
    if (!result.variables) {
      result.variables = {};
    }
    const found = findVariable(currentSectionId, name);
    if (found?.name && line !== found.line) {
      diagnostic(
        currentToken,
        `A ${
          currentSectionId ? "local" : "global"
        } variable named '${name}' already exists at line ${found.line}`,
        getActions(found.start),
        getStart(match, index),
        getLength(match, index)
      );
    }
    const existingSection = findSection(
      currentSectionId.split(".").slice(0, -1).join("."),
      name
    );
    if (existingSection?.name) {
      diagnostic(
        currentToken,
        `A section named '${name}' already exists at line ${existingSection.line}`,
        getActions(existingSection.start),
        getStart(match, index),
        getLength(match, index)
      );
    }
    const resolvedValue =
      typeof value === "string" || typeof value === "number"
        ? value
        : getVariable(type, value?.name, match, index)?.value;
    const variable = {
      ...(found || {}),
      start,
      line,
      name,
      type,
      value: resolvedValue,
      valueText,
    };
    if (parameter) {
      variable.parameter = true;
    }
    const id = `${currentSectionId}.${parameter ? "param-" : ""}${name}`;
    result.variables[id] = variable;
    const parent = result.sections[currentSectionId];
    if (parent) {
      if (!parent.variables) {
        parent.variables = {};
      }
      parent.variables[id] = variable;
    }
  };

  const getAssetValue = (
    type: FountainAssetType,
    content: string,
    match?: string[],
    index?: number
  ): string | { name: string } => {
    if (content.match(fountainRegexes.string)) {
      return content.slice(1, -1);
    }
    const found = getAsset(type, content, match, index);
    if (found) {
      return {
        name: content,
      };
    }
    return undefined;
  };

  const getEntityValue = (
    type: FountainEntityType,
    content: string,
    match?: string[],
    index?: number
  ): string | { name: string } => {
    if (content.match(fountainRegexes.string)) {
      return content.slice(1, -1);
    }
    const found = getEntity(type, content, match, index);
    if (found) {
      return {
        name: content,
      };
    }
    return undefined;
  };

  const getTagValue = (
    content: string,
    match?: string[],
    index?: number
  ): string | { name: string } => {
    if (content.match(fountainRegexes.string)) {
      return content.slice(1, -1);
    }
    const found = getTag(content, match, index);
    if (found) {
      return {
        name: content,
      };
    }
    return undefined;
  };

  const getParameterDeclarations = (
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
    const tokenMatches = parametersString.split(fountainRegexes.separator);
    if (!tokenMatches) {
      diagnostic(
        currentToken,
        "Invalid parameters syntax",
        [],
        getStart(match, groupIndex),
        getLength(match, groupIndex) - 1
      );
      return [];
    }
    if (tokenMatches.length === 1 && tokenMatches[0] === "") {
      return [];
    }
    const allTokenMatches = ["(", ...tokenMatches, ")"];
    const allMatches = [...match];
    allMatches.splice(groupIndex, 1, ...allTokenMatches);
    const result: string[] = [];
    const start = groupIndex + 1;
    const end = groupIndex + allTokenMatches.length - 1;
    for (let i = start; i < end; i += 1) {
      const declaration = allMatches[i];
      let parameterMatch: RegExpMatchArray;
      if (declaration.match(fountainRegexes.separator)) {
        // NoOp
      } else if (!declaration.trim()) {
        const isStart = i === start;
        const separatorGroupIndex = isStart ? i + 1 : i - 1;
        const separator = allMatches[separatorGroupIndex];
        const prefixLength =
          separator.length - separator.trimStart().length + 1;
        const emptyStart =
          getStart(allMatches, separatorGroupIndex) +
          (isStart ? 0 : prefixLength);
        const emptyLength =
          getLength(allMatches, separatorGroupIndex) -
          (isStart ? prefixLength - 1 : prefixLength);
        diagnostic(
          currentToken,
          "Empty parameter",
          [],
          emptyStart,
          emptyLength
        );
      } else if (
        (parameterMatch = declaration.match(
          fountainRegexes.parameter_declaration
        ))
      ) {
        const name = parameterMatch[1] || "";
        const valueText = parameterMatch[5] || "";
        const value = valueText ? getValue(valueText, allMatches, i) : "";
        if (name) {
          addVariable(
            name,
            valueText,
            value,
            true,
            currentToken.start,
            currentToken.line,
            allMatches,
            i
          );
        }
        result.push(declaration);
      } else {
        diagnostic(
          currentToken,
          `Invalid parameter declaration:\nParameter must be initialized to a string (x = "") or number (x = 0)`,
          [],
          getStart(allMatches, i),
          getLength(allMatches, i)
        );
      }
    }
    return result;
  };

  const getArgumentValues = (
    section: FountainSection,
    match: string[],
    groupIndex: number
  ): (string | number | { name: string })[] => {
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
    const argumentTokenMatches = argumentsString.split(
      fountainRegexes.separator
    );
    if (!argumentTokenMatches) {
      diagnostic(
        currentToken,
        "Invalid parameters syntax",
        [],
        getStart(match, groupIndex),
        getLength(match, groupIndex) - 1
      );
      return [];
    }
    if (argumentTokenMatches.length === 1 && argumentTokenMatches[0] === "") {
      return [];
    }
    const allTokenMatches = ["(", ...argumentTokenMatches, ")"];
    const allMatches = [...match];
    allMatches.splice(groupIndex, 1, ...allTokenMatches);
    const result: (
      | string
      | number
      | {
          name: string;
          type: "string" | "number";
        }
    )[] = [];
    const start = groupIndex + 1;
    const end = groupIndex + allTokenMatches.length - 1;
    let paramIndex = 0;
    const extraArgIndices: number[] = [];
    for (let i = start; i < end; i += 1) {
      const argumentValue = allMatches[i];
      const parameter = parameters?.[paramIndex];
      let argumentMatch: RegExpMatchArray;
      if (argumentValue.match(fountainRegexes.separator)) {
        // NoOp
      } else if (!argumentValue.trim()) {
        if (!parameter) {
          extraArgIndices.push(i);
        }
        result.push(parameter?.value);
        paramIndex += 1;
      } else if (
        (argumentMatch = argumentValue.match(fountainRegexes.argument_value))
      ) {
        if (!parameter) {
          extraArgIndices.push(i);
        }
        const valueText = argumentMatch[1] || "";
        const value = getValue(valueText, allMatches, i);
        const type =
          typeof value === "string" || typeof value === "number"
            ? typeof value
            : value?.type;
        if (parameter && type && parameter?.type !== type) {
          diagnostic(
            currentToken,
            `Parameter must be a ${parameter?.type}`,
            [],
            getStart(allMatches, i),
            getLength(allMatches, i)
          );
        }
        result.push(value);
        paramIndex += 1;
      } else {
        diagnostic(
          currentToken,
          parameter?.type
            ? `Parameter must be a ${parameter?.type}`
            : `Invalid parameter value`,
          [],
          getStart(allMatches, i),
          getLength(allMatches, i)
        );
        paramIndex += 1;
      }
    }
    if (extraArgIndices?.length > 0) {
      extraArgIndices.forEach((extraArgIndex) => {
        diagnostic(
          currentToken,
          `Expected ${parameters.length} ${
            parameters.length === 1 ? "argument" : "arguments"
          } but got ${parameters.length + extraArgIndices.length}`,
          [],
          getStart(allMatches, extraArgIndex),
          getLength(allMatches, extraArgIndex)
        );
      });
    }
    return result;
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
        const value = name
          ? getAsset(
              type,
              name,
              noteMatches,
              i,
              startIndex,
              noteMatch.length - 4
            )?.value
          : undefined;
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
        if (name) {
          getAsset(
            type,
            name,
            noteMatches,
            i,
            startIndex,
            noteMatch.length - 4
          );
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

  addSection(currentSectionId, {
    start: currentToken.start,
    line: 1,
    operator: "",
    name: "",
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
    current = currentToken.end + 1;

    if ((match = currentToken.content.match(fountainRegexes.section))) {
      currentToken.type = "section";
      if (currentToken.type === "section") {
        const level = match[2].length;
        const operator = match[4] || "";
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
        addSection(
          currentSectionId,
          {
            start: currentToken.start,
            line: currentToken.line,
            operator,
            name,
            tokens: currentSectionTokens,
          },
          match,
          5
        );
        startNewSection(level);
        getParameterDeclarations(match, 7);
      }
    } else if ((match = currentToken.content.match(fountainRegexes.variable))) {
      currentToken.type = "variable";
      if (currentToken.type === "variable") {
        const name = match[4]?.trim() || "";
        const valueText = match[8]?.trim() || "";
        const value = valueText ? getValue(valueText, match, 8) : "";
        if (name) {
          addVariable(
            name,
            valueText,
            value,
            false,
            currentToken.start,
            currentToken.line,
            match,
            4
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
    current = currentToken.end + 1;

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
            const section =
              name !== "!END" ? getSection(name, match, 4) : undefined;
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
            const valueText = match[4]?.trim() || "";
            const value = valueText ? getValue(valueText, match, 4) : "";
            currentToken.value = value;
          }
        }
      } else if (currentToken.content.match(fountainRegexes.list)) {
        if ((match = currentToken.content.match(fountainRegexes.assign))) {
          currentToken.type = "assign";
          if (currentToken.type === "assign") {
            if ((match = lint(fountainRegexes.assign))) {
              const name = match[4]?.trim() || "";
              const operator = match[6]?.trim() || "";
              const value = match[8]?.trim() || "";
              if (name) {
                getVariable(getValueType(value), name, match, 4);
              }
              currentToken.name = name;
              currentToken.operator = operator;
              currentToken.value = value;
            }
          }
        } else if (
          (match = currentToken.content.match(fountainRegexes.condition))
        ) {
          currentToken.type = "condition";
          if (currentToken.type === "condition") {
            if ((match = lint(fountainRegexes.condition))) {
              const name = match[4]?.trim() || "";
              const operator = match[6]?.trim() || "";
              const value = match[8]?.trim() || "";
              if (name) {
                getVariable(getValueType(value), name, match, 4);
              }
              currentToken.name = name;
              currentToken.operator = operator;
              currentToken.value = value;
            }
          }
        } else if ((match = currentToken.content.match(fountainRegexes.call))) {
          currentToken.type = "call";
          if (currentToken.type === "call") {
            if ((match = lint(fountainRegexes.call))) {
              const name = match[4]?.trim() || "";
              currentToken.name = name;
              const section = getSection(`*${name}`, match, 4);
              currentToken.values = getArgumentValues(section, match, 6);
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
              if (section) {
                getSection(section, match, 8);
              }
              currentToken.mark = mark;
              currentToken.content = content;
              currentToken.section = section;
            }
          }
        } else {
          lintDiagnostic();
        }
      } else if ((match = currentToken.content.match(fountainRegexes.asset))) {
        currentToken.type = match[2]?.trim() as FountainAssetType;
        if (
          currentToken.type === "image" ||
          currentToken.type === "audio" ||
          currentToken.type === "video" ||
          currentToken.type === "text"
        ) {
          if ((match = lint(fountainRegexes.asset))) {
            const name = match[4]?.trim() || "";
            const valueText = match[8]?.trim() || "";
            currentToken.content = valueText;
            currentToken.value = getAssetValue(
              currentToken.type,
              valueText,
              match,
              8
            );
            addAsset(
              currentToken.type,
              name,
              valueText,
              currentToken.value,
              currentToken.start,
              currentToken.line,
              match,
              4
            );
          }
        }
      } else if ((match = currentToken.content.match(fountainRegexes.entity))) {
        currentToken.type = match[2]?.trim() as FountainEntityType;
        if (
          currentToken.type === "ui" ||
          currentToken.type === "object" ||
          currentToken.type === "enum"
        ) {
          if ((match = lint(fountainRegexes.entity))) {
            const name = match[4]?.trim() || "";
            const valueText = match[8]?.trim() || "";
            currentToken.content = valueText;
            currentToken.value = getEntityValue(
              currentToken.type,
              valueText,
              match,
              8
            );
            addEntity(
              currentToken.type,
              name,
              valueText,
              currentToken.value,
              currentToken.start,
              currentToken.line,
              match,
              4
            );
          }
        }
      } else if ((match = currentToken.content.match(fountainRegexes.tag))) {
        currentToken.type = "tag";
        if (currentToken.type === "tag") {
          if ((match = lint(fountainRegexes.tag))) {
            const name = match[4]?.trim() || "";
            const valueText = match[8]?.trim() || "";
            currentToken.content = valueText;
            currentToken.value = getTagValue(valueText, match, 8);
            const value = currentToken.value;
            addTag(
              name,
              valueText,
              value,
              currentToken.start,
              currentToken.line,
              match,
              4
            );
          }
        }
      } else if (
        (match = currentToken.content.match(fountainRegexes.variable))
      ) {
        currentToken.type = "variable";
        if (currentToken.type === "variable") {
          if ((match = lint(fountainRegexes.variable))) {
            const name = match[4]?.trim() || "";
            const operator = match[6]?.trim() || "";
            const valueText = match[8]?.trim() || "";
            currentToken.name = name;
            currentToken.operator = operator;
            currentToken.content = valueText;
            const value = valueText ? getValue(valueText, match, 8) : "";
            currentToken.value = value;
          }
        }
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
          currentToken.level = level;
          currentToken.operator = operator;
          currentToken.content = name;
          if (level > currentLevel + 1) {
            const from = currentToken.start + currentToken.indent;
            const to = from + mark.length + markSpace.length;
            const validMark = "#".repeat(currentLevel + 1);
            diagnostic(
              currentToken,
              `Child Section must be max ${validMark.length} levels deep`,
              [
                {
                  name: "Fix",
                  replace: {
                    from,
                    to,
                    insert: `${validMark}${" "}`,
                  },
                },
              ],
              currentToken.indent,
              level
            );
            if (markSpace) {
              currentSectionId += `.${id}`;
              startNewSection(level);
              currentToken.parameters = getParameterDeclarations(match, 7);
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
            currentToken.parameters = getParameterDeclarations(match, 7);
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

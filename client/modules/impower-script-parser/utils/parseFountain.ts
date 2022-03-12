/* eslint-disable no-cond-assign */
/* eslint-disable prefer-destructuring */
/* eslint-disable no-continue */
import { FountainDeclarations } from "..";
import { fountainRegexes } from "../constants/fountainRegexes";
import { titlePageDisplay } from "../constants/pageTitleDisplay";
import { FountainAsset } from "../types/FountainAsset";
import { FountainEntity } from "../types/FountainEntity";
import { FountainParseResult } from "../types/FountainParseResult";
import { FountainSection } from "../types/FountainSection";
import { FountainTag } from "../types/FountainTag";
import { FountainLogicToken, FountainToken } from "../types/FountainToken";
import { FountainTokenType } from "../types/FountainTokenType";
import { FountainVariable } from "../types/FountainVariable";
import { createFountainToken } from "./createFountainToken";
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
  let sceneNumber = 1;
  let currentLevel = 0;
  let currentSectionId = "";
  let match: string[];
  let text: string;
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
  let previousTriggerToken: FountainLogicToken;
  let previousCharacter: string;
  let previousParenthetical: string;
  let previousAssets: { name: string }[] = [];
  let notes: FountainAsset[] = [];

  const diagnostic = (
    currentToken: FountainToken,
    message: string,
    start = -1,
    length = -1,
    severity: "error" | "warning" | "info" = "error"
  ): void => {
    if (!result.diagnostics) {
      result.diagnostics = [];
    }
    const validStart = start >= 0 ? start : 0;
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
    });
  };

  const getStart = (match: string[], groupIndex: number): number => {
    if (!match) {
      return -1;
    }
    const group = match[groupIndex];
    if (!group) {
      return -1;
    }
    return match.slice(1, groupIndex).reduce((p, x) => p + x.length, 0);
  };

  const getLength = (match: string[], groupIndex: number): number => {
    if (!match) {
      return -1;
    }
    const group = match[groupIndex];
    if (!group) {
      return -1;
    }
    return group.length;
  };

  const getGlobalId = (name: string, sectionId?: string): string => {
    return `${sectionId == null ? currentSectionId : sectionId}.${name}`;
  };

  const prefixArticle = (str: string): string => {
    return `${["a", "e", "i", "o", "u"].includes(str[0]) ? "an" : "a"} ${str}`;
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
    if (parent) {
      if (!parent.children) {
        parent.children = [];
      }
      parent.children.push(id);
    }
    const existingContainer = result.sections[id];
    if (existingContainer?.line) {
      diagnostic(
        currentToken,
        `A section named '${section.name}' already exists at line ${existingContainer.line}`,
        getStart(match, index),
        getLength(match, index)
      );
    }
    result.sections[id] = { ...(existingContainer || {}), ...section };
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
      : result.sections?.[`${currentSectionId}.${nameOrId}`];
    if (!found) {
      diagnostic(
        currentToken,
        `Could not find ${
          global
            ? `section with id '${nameOrId}'`
            : `child section named '${nameOrId}'`
        }`,
        start != null ? start : getStart(match, index),
        length != null ? length : getLength(match, index)
      );
      return null;
    }
    const copy = { ...found };
    delete copy.line;
    return copy;
  };

  const getAsset = (
    type: "image" | "audio" | "video" | "text",
    name: string,
    match?: string[],
    index?: number,
    start?: number,
    length?: number
  ): FountainAsset => {
    if (!name) {
      return undefined;
    }
    const typeName = type || "asset";
    const numValue = Number(name);
    if (!Number.isNaN(numValue)) {
      diagnostic(
        currentToken,
        `'${name}' is not a valid ${typeName} value`,
        start != null ? start : getStart(match, index),
        length != null ? length : getLength(match, index)
      );
      return null;
    }
    const found =
      result.assets?.[getGlobalId(name)] ||
      result.assets?.[getGlobalId(name, "")];
    if (!found) {
      diagnostic(
        currentToken,
        `Could not find ${typeName} named '${name}'`,
        start != null ? start : getStart(match, index),
        length != null ? length : getLength(match, index)
      );
      return null;
    }
    if (type && found.type !== type) {
      diagnostic(
        currentToken,
        `${found.type[0].toUpperCase()}${found.type.slice(
          1
        )} '${name}' is not ${prefixArticle(typeName)}`,
        start != null ? start : getStart(match, index),
        length != null ? length : getLength(match, index)
      );
      return null;
    }
    const copy = { ...found };
    delete copy.line;
    return copy;
  };

  const getEntity = (
    type: "element" | "component",
    name: string,
    match?: string[],
    index?: number,
    start?: number,
    length?: number
  ): FountainEntity => {
    if (!name) {
      return undefined;
    }
    const typeName = type || "entity";
    const numValue = Number(name);
    if (!Number.isNaN(numValue)) {
      diagnostic(
        currentToken,
        `'${name}' is not a valid ${typeName} value`,
        start != null ? start : getStart(match, index),
        length != null ? length : getLength(match, index)
      );
      return null;
    }
    const found =
      result.entities?.[getGlobalId(name)] ||
      result.entities?.[getGlobalId(name, "")];
    if (!found) {
      diagnostic(
        currentToken,
        `Could not find ${typeName} named '${name}'`,
        start != null ? start : getStart(match, index),
        length != null ? length : getLength(match, index)
      );
      return null;
    }
    if (type && found.type !== type) {
      diagnostic(
        currentToken,
        `${found.type[0].toUpperCase()}${found.type.slice(
          1
        )} '${name}' is not ${prefixArticle(typeName)}`,
        start != null ? start : getStart(match, index),
        length != null ? length : getLength(match, index)
      );
      return null;
    }
    const copy = { ...found };
    delete copy.line;
    return copy;
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
        start != null ? start : getStart(match, index),
        length != null ? length : getLength(match, index)
      );
      return null;
    }
    const found =
      result.tags?.[getGlobalId(name)] || result.tags?.[getGlobalId(name, "")];
    if (!found) {
      diagnostic(
        currentToken,
        `Could not find tag named '${name}'`,
        start != null ? start : getStart(match, index),
        length != null ? length : getLength(match, index)
      );
      return null;
    }
    const copy = { ...found };
    delete copy.line;
    return copy;
  };

  const getVariable = (
    name: string,
    match?: string[],
    index?: number,
    start?: number,
    length?: number
  ): FountainVariable => {
    if (!name) {
      return undefined;
    }
    const found =
      result.variables?.[getGlobalId(name)] ||
      result.variables?.[getGlobalId(name, "")];
    if (!found) {
      diagnostic(
        currentToken,
        `Could not find variable named '${name}'`,
        start != null ? start : getStart(match, index),
        length != null ? length : getLength(match, index)
      );
      return null;
    }
    const copy = { ...found };
    delete copy.line;
    return copy;
  };

  const addAsset = (
    type: "image" | "audio" | "video" | "text",
    name: string,
    value: string | { name: string },
    line: number,
    match: string[],
    index: number
  ): void => {
    const id = getGlobalId(name);
    if (!result.assets) {
      result.assets = {};
    }
    const found = result.assets?.[id];
    if (found && line !== found.line) {
      diagnostic(
        currentToken,
        `A ${
          currentSectionId ? "local" : "global"
        } asset named '${name}' already exists at line ${found.line}`,
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
      line,
      type,
      value: resolvedValue,
    };
    result.assets[id] = asset;
    const parentId = id.split(".").slice(0, -1).join(".") || "";
    const parent = result.sections[parentId];
    if (parent) {
      if (!parent.assets) {
        parent.assets = {};
      }
      parent.assets[id] = asset;
    }
  };

  const addEntity = (
    type: "element" | "component",
    name: string,
    value: string | { name: string },
    line: number,
    match: string[],
    index: number
  ): void => {
    const id = getGlobalId(name);
    if (!result.entities) {
      result.entities = {};
    }
    const found = result.entities?.[id];
    if (found && line !== found.line) {
      diagnostic(
        currentToken,
        `A ${
          currentSectionId ? "local" : "global"
        } entity named '${name}' already exists at line ${found.line}`,
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
      line,
      type,
      value: resolvedValue,
    };
    result.entities[id] = asset;
    const parentId = id.split(".").slice(0, -1).join(".") || "";
    const parent = result.sections[parentId];
    if (parent) {
      if (!parent.entities) {
        parent.entities = {};
      }
      parent.entities[id] = asset;
    }
  };

  const addTag = (
    name: string,
    value: string | { name: string },
    line: number,
    match: string[],
    index: number
  ): void => {
    const id = getGlobalId(name);
    if (!result.tags) {
      result.tags = {};
    }
    const found = result.tags[id];
    if (found && line !== found.line) {
      diagnostic(
        currentToken,
        `A ${
          currentSectionId ? "local" : "global"
        } tag named '${name}' already exists at line ${found.line}`,
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
      line,
      value: resolvedValue,
    };
    result.tags[id] = tag;
    const parentId = id.split(".").slice(0, -1).join(".") || "";
    const parent = result.sections[parentId];
    if (parent) {
      if (!parent.tags) {
        parent.tags = {};
      }
      parent.tags[id] = tag;
    }
  };

  const addVariable = (
    name: string,
    value: string | number | { name: string },
    line: number,
    match: string[],
    index: number
  ): void => {
    const type = typeof value as "string" | "number";
    const id = getGlobalId(name);
    if (!result.variables) {
      result.variables = {};
    }
    const found = result.variables[id];
    if (found && line !== found.line) {
      diagnostic(
        currentToken,
        `A ${
          currentSectionId ? "local" : "global"
        } variable named '${name}' already exists at line ${found.line}`,
        getStart(match, index),
        getLength(match, index)
      );
    }
    const resolvedValue =
      typeof value === "string" || typeof value === "number"
        ? value
        : getVariable(value?.name, match, index)?.value;
    const variable = {
      ...(found || {}),
      line,
      type,
      value: resolvedValue,
    };
    result.variables[id] = variable;
    const parentId = id.split(".").slice(0, -1).join(".") || "";
    const parent = result.sections[parentId];
    if (parent) {
      if (!parent.variables) {
        parent.variables = {};
      }
      parent.variables[id] = variable;
    }
  };

  const getAssetValue = (
    type: "image" | "audio" | "video" | "text",
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
    type: "element" | "component",
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

  const getEntityReference = (
    content: string,
    match?: string[],
    index?: number
  ): { name: string } => {
    const found = getEntity(undefined, content, match, index);
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

  const getVariableValue = (
    content: string,
    match?: string[],
    index?: number
  ): string | number | { name: string } => {
    if (content.match(fountainRegexes.string)) {
      return content.slice(1, -1);
    }
    const numValue = Number(content);
    if (!Number.isNaN(numValue)) {
      return numValue;
    }
    const found = getVariable(content, match, index);
    if (found) {
      return {
        name: content,
      };
    }
    return undefined;
  };

  const getParameterNames = (match: string[], groupIndex: number): string[] => {
    if (!match) {
      return [];
    }
    const values = match[groupIndex] || "";
    const parameterMatches = values.match(
      fountainRegexes.parameter_declarations
    );
    if (!parameterMatches) {
      return [];
    }
    const allMatches = [...match];
    allMatches.splice(groupIndex, 1, ...parameterMatches);
    const result: string[] = [];
    for (let i = groupIndex; i < groupIndex + parameterMatches.length; i += 1) {
      const declaration = allMatches[i];
      if (!declaration.match(fountainRegexes.separator)) {
        const [nameString, valueString] = declaration.split("=");
        const name = nameString.trim();
        const value = getVariableValue(valueString.trim());
        addVariable(name, value, currentToken.line, allMatches, i);
        result.push(declaration);
      }
    }
    return result;
  };

  const getGoParameterValues = (
    match: string[],
    groupIndex: number
  ): (string | number | { name: string })[] => {
    if (!match) {
      return [];
    }
    const values = match[groupIndex] || "";
    const parameterMatches = values.match(fountainRegexes.parameter_values);
    if (!parameterMatches) {
      return [];
    }
    const allMatches = [...match];
    allMatches.splice(groupIndex, 1, ...parameterMatches);
    const result: (string | number | { name: string })[] = [];
    for (let i = groupIndex; i < groupIndex + parameterMatches.length; i += 1) {
      const value = allMatches[i];
      if (!value.match(fountainRegexes.separator)) {
        result.push(getVariableValue(value, allMatches, i));
      }
    }
    return result;
  };

  const getCallParameterValues = (
    match: string[],
    groupIndex: number
  ): (string | number | { name: string })[] => {
    if (!match) {
      return [];
    }
    const values = match[groupIndex] || "";
    const parameterMatches = values.match(fountainRegexes.parameter_values);
    if (!parameterMatches) {
      return [];
    }
    const allMatches = [...match];
    allMatches.splice(groupIndex, 1, ...parameterMatches);
    const result: (string | number | { name: string })[] = [];
    for (let i = groupIndex; i < groupIndex + parameterMatches.length; i += 1) {
      const value = allMatches[i];
      if (!value.match(fountainRegexes.separator)) {
        if (i === groupIndex) {
          result.push(getEntityReference(value, allMatches, i));
        } else {
          result.push(getVariableValue(value, allMatches, i));
        }
      }
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
      if (fountainRegexes.title_page.test(currentToken.content)) {
        const index = currentToken.content.indexOf(":");
        currentToken.type = currentToken.content
          .substring(0, index)
          .toLowerCase()
          .replace(" ", "_") as FountainTokenType;
        currentToken.content = currentToken.content.substring(index + 1).trim();
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
        addSection(currentSectionId, {
          start: currentToken.start,
          line: 1,
          operator: "",
          name: "",
          tokens: currentSectionTokens,
        });
        currentLevel = currentToken.level;
      }

      if (currentToken.content.match(fountainRegexes.scene_heading)) {
        currentToken.type = "scene";
        if (currentToken.type === "scene") {
          pushNotes();
          saveAndClearNotes();
          currentToken.content = currentToken.content.replace(/^\./, "");
          currentToken.scene = sceneNumber;
          const match = currentToken.content.match(
            fountainRegexes.scene_number
          );
          if (match) {
            currentToken.content = currentToken.content.replace(
              fountainRegexes.scene_number,
              ""
            );
            currentToken.scene = match[1];
          }
          if (!result.properties.scenes) {
            result.properties.scenes = [];
          }
          result.properties.scenes.push({
            name: currentToken.content,
            scene: currentToken.scene,
            line: currentToken.line,
          });
          if (!result.properties.sceneNames) {
            result.properties.sceneNames = [];
          }
          result.properties.sceneNames.push(currentToken.content);
          sceneNumber += 1;
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
        pushNotes();
        saveAndClearNotes();
        currentToken.content = currentToken.content.replace(/>|</g, "").trim();
      } else if (currentToken.content.match(fountainRegexes.transition)) {
        currentToken.type = "transition";
        pushNotes();
        saveAndClearNotes();
        currentToken.content = currentToken.content.replace(/> ?/, "");
      } else if ((match = currentToken.content.match(fountainRegexes.go))) {
        currentToken.type = "go";
        if (currentToken.type === "go") {
          currentToken.operator = match[4]?.trim() || "";
          currentToken.content = match[5]?.trim() || "";
          if (currentToken.content) {
            getSection(currentToken.content, match, 5);
          }
          currentToken.values = getGoParameterValues(match, 9);
        }
      } else if ((match = currentToken.content.match(fountainRegexes.jump))) {
        currentToken.type = "jump";
        if (currentToken.type === "jump") {
          currentToken.content = match[2]?.trim() || "";
        }
      } else if ((match = currentToken.content.match(fountainRegexes.return))) {
        currentToken.type = "return";
        if (currentToken.type === "return") {
          currentToken.content = match[4]?.trim() || "";
        }
      } else if (currentToken.content.match(fountainRegexes.condition)) {
        currentToken.type = "condition";
        if (currentToken.type === "condition") {
          match = currentToken.content.match(fountainRegexes.condition_lint);
          if (match) {
            const indent = (match[1] || "").length;
            const mark = match[2]?.trim() || "";
            const variable = match[4]?.trim() || "";
            const operator = match[6]?.trim() || "";
            const value = match[8]?.trim() || "";
            const content = match[13]?.trim() || "";
            const section = match[18]?.trim() || "";
            if (variable) {
              getVariable(variable, match, 4);
            }
            if (section) {
              getSection(section, match, 18);
            }
            currentToken.indent = indent;
            currentToken.mark = mark;
            currentToken.name = variable;
            currentToken.operator = operator;
            currentToken.value = value;
            currentToken.content = content;
            if (content) {
              currentToken.section = section;
            }
          } else {
            diagnostic(currentToken, `Invalid syntax`);
          }
        }
      } else if ((match = currentToken.content.match(fountainRegexes.asset))) {
        currentToken.type = match[2]?.trim() as
          | "image"
          | "audio"
          | "video"
          | "text";
        if (
          currentToken.type === "image" ||
          currentToken.type === "audio" ||
          currentToken.type === "video" ||
          currentToken.type === "text"
        ) {
          const name = match[4]?.trim() || "";
          const content = match[8]?.trim() || "";
          currentToken.content = content;
          currentToken.value = getAssetValue(
            currentToken.type,
            content,
            match,
            8
          );
          const value = currentToken.value;
          addAsset(currentToken.type, name, value, currentToken.line, match, 4);
        }
      } else if ((match = currentToken.content.match(fountainRegexes.entity))) {
        currentToken.type = match[2]?.trim() as "element" | "component";
        if (
          currentToken.type === "element" ||
          currentToken.type === "component"
        ) {
          const name = match[4]?.trim() || "";
          const content = match[8]?.trim() || "";
          currentToken.content = content;
          currentToken.value = getEntityValue(
            currentToken.type,
            content,
            match,
            8
          );
          const value = currentToken.value;
          addEntity(
            currentToken.type,
            name,
            value,
            currentToken.line,
            match,
            4
          );
        }
      } else if ((match = currentToken.content.match(fountainRegexes.tag))) {
        currentToken.type = "tag";
        if (currentToken.type === "tag") {
          const name = match[4]?.trim() || "";
          const content = match[8]?.trim() || "";
          currentToken.content = content;
          currentToken.value = getTagValue(content, match, 8);
          const value = currentToken.value;
          addTag(name, value, currentToken.line, match, 4);
        }
      } else if (
        (match = currentToken.content.match(fountainRegexes.declare))
      ) {
        currentToken.type = "declare";
        if (currentToken.type === "declare") {
          const variable = match[4]?.trim() || "";
          const operator = match[6]?.trim() || "";
          const content = match[8]?.trim() || "";
          currentToken.name = variable;
          currentToken.operator = operator;
          currentToken.content = content;
          currentToken.value = getVariableValue(content, match, 8);
          const value = currentToken.value;
          addVariable(variable, value, currentToken.line, match, 4);
        }
      } else if ((match = currentToken.content.match(fountainRegexes.assign))) {
        currentToken.type = "assign";
        if (currentToken.type === "assign") {
          const variable = match[4]?.trim() || "";
          const operator = match[6]?.trim() || "";
          const content = match[8]?.trim() || "";
          if (variable) {
            getVariable(variable, match, 4);
          }
          currentToken.name = variable;
          currentToken.operator = operator;
          currentToken.content = content;
          currentToken.value = getVariableValue(currentToken.content, match, 8);
        }
      } else if ((match = currentToken.content.match(fountainRegexes.call))) {
        currentToken.type = "call";
        if (currentToken.type === "call") {
          const content = match[4]?.trim() || "";
          currentToken.content = content;
          currentToken.values = getCallParameterValues(match, 8);
        }
      } else if (
        (match = currentToken.content.match(fountainRegexes.trigger))
      ) {
        currentToken.type = "trigger_group_begin";
        if (currentToken.type === "trigger_group_begin") {
          currentToken.indent = (match[1] || "").length;
          currentToken.content = match[2]?.trim() || "";
          if (
            (previousTriggerToken?.type === "trigger_group_begin" ||
              previousTriggerToken?.type === "compare") &&
            currentToken.indent < previousTriggerToken.indent
          ) {
            pushToken(createFountainToken("trigger_group_end"));
          }
          previousTriggerToken = currentToken;
        }
      } else if (
        (match = currentToken.content.match(fountainRegexes.compare))
      ) {
        currentToken.type = "compare";
        if (currentToken.type === "compare") {
          const indent = match[1]?.trim() || "";
          const variable = match[4]?.trim() || "";
          const operator = match[6]?.trim() || "";
          const content = match[8]?.trim() || "";
          if (variable) {
            getVariable(variable, match, 4);
          }
          currentToken.indent = indent.length;
          currentToken.name = variable;
          currentToken.operator = operator;
          currentToken.content = content;
          currentToken.value = getVariableValue(content, match, 8);
          if (
            (previousTriggerToken?.type === "trigger_group_begin" ||
              previousTriggerToken?.type === "compare") &&
            currentToken.indent < previousTriggerToken.indent
          ) {
            pushToken(createFountainToken("trigger_group_end"));
          }
          previousTriggerToken = currentToken;
        }
      } else if (
        (match = currentToken.content.match(fountainRegexes.synopses))
      ) {
        currentToken.type = currentToken.content ? "synopses" : "separator";
        currentToken.content = match[1];
      } else if (
        (match = currentToken.content.match(fountainRegexes.section))
      ) {
        currentToken.type = "section";
        if (currentToken.type === "section") {
          currentToken.level = match[2].length;
          currentToken.operator = match[4];
          currentToken.content = match[6];
          if (currentToken.level === 0) {
            currentSectionId = currentToken.content;
          } else if (currentToken.level === 1) {
            currentSectionId = `.${currentToken.content}`;
          } else if (currentToken.level > currentLevel) {
            currentSectionId += `.${currentToken.content}`;
          } else if (currentToken.level < currentLevel) {
            const grandparentId = currentSectionId
              .split(".")
              .slice(0, -2)
              .join(".");
            currentSectionId = `${grandparentId}.${currentToken.content}`;
          } else {
            const parentId = currentSectionId.split(".").slice(0, -1).join(".");
            currentSectionId = `${parentId}.${currentToken.content}`;
          }
          currentSectionTokens = [];
          currentToken.parameters = getParameterNames(match, 10);
          addSection(
            currentSectionId,
            {
              start: currentToken.start,
              line: currentToken.line,
              operator: currentToken.operator,
              name: currentToken.content,
              tokens: currentSectionTokens,
            },
            match,
            6
          );
          currentLevel = currentToken.level;
        }
      } else if (currentToken.content.match(fountainRegexes.page_break)) {
        currentToken.type = "page_break";
        currentToken.content = "";
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
          if (result.properties.characters?.[characterName]) {
            const values = result.properties.characters[characterName];
            if (values.indexOf(sceneNumber) === -1) {
              values.push(sceneNumber);
            }
            if (!result.properties.characters) {
              result.properties.characters = {};
            }
            result.properties.characters[characterName] = values;
          } else {
            if (!result.properties.characters) {
              result.properties.characters = {};
            }
            result.properties.characters[characterName] = [sceneNumber];
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
      currentToken.type !== "trigger_group_begin" &&
      currentToken.type !== "compare"
    ) {
      previousTriggerToken = undefined;
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

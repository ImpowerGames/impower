/* eslint-disable no-cond-assign */
/* eslint-disable prefer-destructuring */
/* eslint-disable no-continue */
import { fountainRegexes } from "../constants/fountainRegexes";
import { titlePageDisplay } from "../constants/pageTitleDisplay";
import { FountainAsset } from "../types/FountainAsset";
import { FountainParseResult } from "../types/FountainParseResult";
import { FountainSection } from "../types/FountainSection";
import { FountainLogicToken, FountainToken } from "../types/FountainToken";
import { FountainTokenType } from "../types/FountainTokenType";
import { FountainVariable } from "../types/FountainVariable";
import { createFountainToken } from "./createFountainToken";
import { trimCharacterExtension } from "./trimCharacterExtension";
import { trimCharacterForceSymbol } from "./trimCharacterForceSymbol";

export const parseFountain = (originalScript: string): FountainParseResult => {
  const script = originalScript;

  const result: FountainParseResult = {
    scriptTokens: [],
    scriptLines: {},
    properties: {},
  };

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
  let previousPortrait: string;
  let previousParenthetical: string;
  let notes: string[] = [];

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
    if (existingContainer) {
      diagnostic(
        currentToken,
        `A section named '${section.name}' already exists at line ${existingContainer.line}`,
        getStart(match, index),
        getLength(match, index)
      );
    }
    result.sections[id] = section;
    if (!result.sectionLines) {
      result.sectionLines = {};
    }
    result.sectionLines[section.line] = id;
  };

  const getAsset = (
    type: "image" | "audio" | "video" | "text",
    name: string,
    match?: string[],
    index?: number
  ): FountainAsset => {
    const asset =
      result.assets?.[type]?.[getGlobalId(name)] ||
      result.assets?.[type]?.[getGlobalId(name, "")];
    if (asset) {
      const copy = { ...asset };
      delete copy.line;
      return copy;
    }
    diagnostic(
      currentToken,
      `Could not find ${type} named '${name}'`,
      getStart(match, index),
      getLength(match, index)
    );
    return null;
  };

  const getVariable = (
    name: string,
    match?: string[],
    index?: number
  ): FountainVariable => {
    const variable =
      result.variables?.[getGlobalId(name)] ||
      result.variables?.[getGlobalId(name, "")];
    if (variable) {
      const copy = { ...variable };
      delete copy.line;
      return copy;
    }
    diagnostic(
      currentToken,
      `Could not find variable named '${name}'`,
      getStart(match, index),
      getLength(match, index)
    );
    return null;
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
    if (!result.assets[type]) {
      result.assets[type] = {};
    }
    const existingAsset = result.assets?.[type]?.[id];
    if (existingAsset) {
      diagnostic(
        currentToken,
        `A ${
          currentSectionId ? "local" : "global"
        } asset named '${name}' already exists at line ${
          existingAsset.line + 1
        }`,
        getStart(match, index),
        getLength(match, index)
      );
    }
    const resolvedValue =
      typeof value === "string"
        ? value
        : getAsset(type, value?.name, match, index)?.value;
    const asset = {
      line,
      value: resolvedValue,
      type,
    };
    result.assets[type][id] = asset;
    const parentId = id.split(".").slice(0, -1).join(".") || "";
    const parent = result.sections[parentId];
    if (parent) {
      if (!parent.assets) {
        parent.assets = {};
      }
      if (!parent.assets[type]) {
        parent.assets[type] = {};
      }
      parent.assets[type][id] = asset;
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
    const existingVariable = result.variables[id];
    if (existingVariable) {
      diagnostic(
        currentToken,
        `A ${
          currentSectionId ? "local" : "global"
        } variable named '${name}' already exists at line ${
          existingVariable.line + 1
        }`,
        getStart(match, index),
        getLength(match, index)
      );
    }
    const resolvedValue =
      typeof value === "string" || typeof value === "number"
        ? value
        : getVariable(value?.name, match, index)?.value;
    const variable = {
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
    const asset = getAsset(type, content, match, index);
    if (asset) {
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
    const variable = getVariable(content, match, index);
    if (variable) {
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

  const getParameterValues = (
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

  const pushToken = (token: FountainToken): void => {
    if (!result.scriptLines) {
      result.scriptLines = {};
    }
    result.scriptLines[token.line] = result.scriptTokens.length;
    result.scriptTokens.push(token);
    currentSectionTokens.push(token);
  };

  const pushNotes = (): boolean => {
    const str = currentToken.content;
    const noteMatches = str.match(fountainRegexes.note_inline);
    if (noteMatches) {
      for (let i = 0; i < noteMatches.length; i += 1) {
        const noteMatch = noteMatches[i].trim();
        notes.push(noteMatch.slice(2, noteMatch.length - 2));
      }
      currentToken.text = str;
      currentToken.content = str.replace(fountainRegexes.note_inline, "");
    }
    return noteMatches && str === noteMatches[0];
  };

  const saveAndClearNotes = (): boolean => {
    const save = notes.length > 0;
    if (save) {
      currentToken.notes = [...notes];
    }
    notes = [];
    return save;
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
        result.scriptTokens[result.scriptTokens.length - 1].type ===
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
          currentToken.content = currentToken.content.replace(/^\./, "");
          pushNotes();
          saveAndClearNotes();
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
        currentToken.content = currentToken.content.substring(1);
        pushNotes();
        saveAndClearNotes();
        notes = [];
      } else if (currentToken.content.match(fountainRegexes.centered)) {
        currentToken.type = "centered";
        currentToken.content = currentToken.content.replace(/>|</g, "").trim();
        pushNotes();
        saveAndClearNotes();
      } else if (currentToken.content.match(fountainRegexes.transition)) {
        currentToken.type = "transition";
        currentToken.content = currentToken.content.replace(/> ?/, "");
        pushNotes();
        saveAndClearNotes();
      } else if ((match = currentToken.content.match(fountainRegexes.go))) {
        currentToken.type = "go";
        if (currentToken.type === "go") {
          currentToken.operator = match[4]?.trim();
          currentToken.content = match[5]?.trim() || "";
          currentToken.values = getParameterValues(match, 9);
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
      } else if ((match = currentToken.content.match(fountainRegexes.choice))) {
        currentToken.type = "choice";
        if (currentToken.type === "choice") {
          currentToken.indent = (match[1] || "").length;
          currentToken.operator = match[2]?.trim();
          currentToken.content = match[3]?.trim() || "";
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
          const image = match[4]?.trim() || "";
          const content = match[8]?.trim() || "";
          currentToken.content = content;
          currentToken.value = getAssetValue(
            currentToken.type,
            content,
            match,
            8
          );
          const value = currentToken.value;
          addAsset(
            currentToken.type,
            image,
            value,
            currentToken.line,
            match,
            4
          );
        }
      } else if (
        (match = currentToken.content.match(fountainRegexes.declare))
      ) {
        currentToken.type = "declare";
        if (currentToken.type === "declare") {
          const variable = match[4]?.trim() || "";
          const operator = match[6]?.trim() || "";
          const content = match[8]?.trim() || "";
          currentToken.variable = variable;
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
          currentToken.variable = variable;
          currentToken.operator = operator;
          currentToken.content = content;
          currentToken.value = getVariableValue(currentToken.content, match, 8);
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
          currentToken.variable = variable;
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
        (match = currentToken.content.match(fountainRegexes.synopsis))
      ) {
        currentToken.type = currentToken.content ? "synopsis" : "separator";
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
              lastCharacterToken.type === "character" ||
              lastCharacterToken.type === "parenthetical" ||
              lastCharacterToken.type === "dialogue"
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
              switch (result.scriptTokens[temp_index].type) {
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
          if (result.properties.characters?.[character]) {
            const values = result.properties.characters[character];
            if (values.indexOf(sceneNumber) === -1) {
              values.push(sceneNumber);
            }
            if (!result.properties.characters) {
              result.properties.characters = {};
            }
            result.properties.characters[character] = values;
          } else {
            if (!result.properties.characters) {
              result.properties.characters = {};
            }
            result.properties.characters[character] = [sceneNumber];
          }
          previousCharacter = currentToken.content;
          lastCharacterIndex = result.scriptTokens.length;
        }
      } else {
        currentToken.type = pushNotes() ? "note" : "action";
        saveAndClearNotes();
        notes = [];
      }
    } else {
      if ((match = currentToken.content?.trim()?.match(fountainRegexes.note))) {
        currentToken.type = "note";
        const note = match[3];
        currentToken.content = note;
        if (note) {
          getAsset("image", note, match, 3);
        }
        previousPortrait = note;
      } else if (currentToken.content.match(fountainRegexes.parenthetical)) {
        pushNotes();
        currentToken.type = "parenthetical";
        previousParenthetical = currentToken.content;
      } else {
        pushNotes();
        currentToken.type = "dialogue";
        if (currentToken.type === "dialogue") {
          if (previousCharacter) {
            currentToken.character = previousCharacter;
          }
          if (previousPortrait) {
            currentToken.portrait = previousPortrait;
          }
          if (previousParenthetical) {
            currentToken.parenthetical = previousParenthetical;
          }
        }
        previousPortrait = null;
        previousParenthetical = null;
        saveAndClearNotes();
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
    previousPortrait = null;
    previousParenthetical = null;
  }

  if (state === "dual_dialogue") {
    pushToken(createFountainToken("dual_dialogue_end"));
    previousCharacter = null;
    previousPortrait = null;
    previousParenthetical = null;
  }

  // tidy up separators

  if (!titlePageStarted) {
    result.titleTokens = undefined;
  }

  // clean separators at the end
  while (
    result.scriptTokens.length > 0 &&
    result.scriptTokens[result.scriptTokens.length - 1].type === "separator"
  ) {
    result.scriptTokens.pop();
  }

  return result;
};
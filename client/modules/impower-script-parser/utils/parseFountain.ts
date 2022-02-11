/* eslint-disable no-cond-assign */
/* eslint-disable prefer-destructuring */
/* eslint-disable no-continue */
import { fountainRegexes } from "../constants/fountainRegexes";
import { titlePageDisplay } from "../constants/pageTitleDisplay";
import {
  FountainContainer,
  FountainSyntaxTree,
  FountainToken,
} from "../types/FountainSyntaxTree";
import { FountainTokenType } from "../types/FountainTokenType";
import { createFountainToken } from "./createFountainToken";
import { trimCharacterExtension } from "./trimCharacterExtension";
import { trimCharacterForceSymbol } from "./trimCharacterForceSymbol";

export const parseFountain = (originalScript: string): FountainSyntaxTree => {
  const script = originalScript;

  const result: FountainSyntaxTree = {
    scriptTokens: [],
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
  let currentDepth = 0;
  let match;
  let text;
  let lastTitlePageToken;
  let currentToken: FountainToken;
  let tokenCategory = "none";
  let lastCharacterIndex;
  let dualRight;
  let state = "normal";
  let previousCharacter;
  let previousParenthetical;
  let cacheStateForComment;
  let nestedComments = 0;
  let titlePageStarted = false;

  const pushToken = (token: FountainToken): void => {
    result.scriptTokens.push(token);
    if (currentToken.line) {
      if (!result.scriptTokenLines) {
        result.scriptTokenLines = {};
      }
      result.scriptTokenLines[currentToken.line] =
        result.scriptTokens.length - 1;
    }
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

  const latestSectionOrScene = (
    depth: number,
    condition: (token: FountainContainer) => boolean
  ): FountainContainer => {
    try {
      if (depth <= 0) {
        return null;
      }
      if (depth === 1) {
        if (!result.properties.structure) {
          return undefined;
        }
        const containers = result.properties.structure.filter(condition);
        return containers[containers.length - 1];
      }
      const prevSection = latestSectionOrScene(depth - 1, condition);
      if (prevSection.children != null) {
        const containers = prevSection.children.filter(condition);
        const lastChild = containers[containers.length - 1];
        if (lastChild) {
          return lastChild;
        }
      }
      // nest ###xyz inside #abc if there's no ##ijk to nest within
      return prevSection;
    } catch {
      let section: FountainContainer = null;
      while (!section && depth > 0) {
        depth -= 1;
        section = latestSectionOrScene(depth, condition);
      }
      return section;
    }
  };

  const processInlineNote = (text: string): number => {
    let irrelevantTextLength = 0;
    const match = text.match(new RegExp(fountainRegexes.note_inline));
    if (match) {
      const level = latestSectionOrScene(currentDepth + 1, () => true);
      if (level) {
        level.notes = level.notes || [];
        for (let i = 0; i < match.length; i += 1) {
          match[i] = match[i].slice(2, match[i].length - 2);
          level.notes.push({ note: match[i], line: currentToken.line });
          irrelevantTextLength += match[i].length;
        }
      }
    }
    return irrelevantTextLength;
  };

  const processDialogueBlock = (token: FountainToken): void => {
    const textWithoutNotes = token.text.replace(
      fountainRegexes.note_inline,
      ""
    );
    processInlineNote(token.text);
    token.text = textWithoutNotes;
    if (token.text.trim().length === 0) {
      token.ignore = true;
    }
  };

  const processActionBlock = (token: FountainToken): void => {
    processInlineNote(token.text);
    token.text = token.text.replace(fountainRegexes.note_inline, "");
    if (token.text.trim().length === 0) {
      token.ignore = true;
    }
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
      i,
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

      if (ignoredLastToken) ignoredLastToken = false;

      if (state === "dialogue") pushToken(createFountainToken("dialogue_end"));
      if (state === "dual_dialogue")
        pushToken(createFountainToken("dual_dialogue_end"));
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
      fountainRegexes.title_page.test(currentToken.text)
    ) {
      state = "title_page";
    }

    if (state === "title_page") {
      if (fountainRegexes.title_page.test(currentToken.text)) {
        const index = currentToken.text.indexOf(":");
        currentToken.type = currentToken.text
          .substring(0, index)
          .toLowerCase()
          .replace(" ", "_") as FountainTokenType;
        currentToken.text = currentToken.text.substring(index + 1).trim();
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
          (lastTitlePageToken.text ? "\n" : "") + currentToken.text.trim();
        continue;
      }
    }

    const latestSection = (depth: number): FountainContainer =>
      latestSectionOrScene(depth, (token) => token.level != null);

    if (state === "normal") {
      if (currentToken.text.match(fountainRegexes.line_break)) {
        tokenCategory = "none";
      } else if (result.properties.firstTokenLine === undefined) {
        result.properties.firstTokenLine = currentToken.line;
      }
      if (currentToken.text.match(fountainRegexes.scene_heading)) {
        currentToken.text = currentToken.text.replace(/^\./, "");
        currentToken.type = "scene_heading";
        currentToken.scene = sceneNumber;
        const match = currentToken.text.match(fountainRegexes.scene_number);
        if (match) {
          currentToken.text = currentToken.text.replace(
            fountainRegexes.scene_number,
            ""
          );
          currentToken.scene = Number(match[1]);
        }
        // Scene Container
        const container: FountainContainer = {
          id: null,
          text: currentToken.text,
        };

        if (currentDepth === 0) {
          container.id = `.${currentToken.line}`;
          if (!result.properties.structure) {
            result.properties.structure = [];
          }
          result.properties.structure.push(container);
        } else {
          const level = latestSection(currentDepth);
          if (level) {
            container.id = `${level.id}.${currentToken.line}`;
            if (!level.children) {
              level.children = [];
            }
            level.children.push(container);
          } else {
            container.id = `.${currentToken.line}`;
            if (!result.properties.structure) {
              result.properties.structure = [];
            }
            result.properties.structure.push(container);
          }
        }
        if (!result.properties.scenes) {
          result.properties.scenes = [];
        }
        result.properties.scenes.push({
          scene: currentToken.scene,
          line: currentToken.line,
        });
        if (!result.properties.sceneLines) {
          result.properties.sceneLines = [];
        }
        result.properties.sceneLines.push(currentToken.line);
        if (!result.properties.sceneNames) {
          result.properties.sceneNames = [];
        }
        result.properties.sceneNames.push(currentToken.text);
        sceneNumber += 1;
      } else if (currentToken.text.length && currentToken.text[0] === "!") {
        currentToken.type = "action";
        currentToken.text = currentToken.text.substring(1);
        processActionBlock(currentToken);
      } else if (currentToken.text.match(fountainRegexes.centered)) {
        currentToken.type = "centered";
        currentToken.text = currentToken.text.replace(/>|</g, "").trim();
      } else if (currentToken.text.match(fountainRegexes.transition)) {
        currentToken.text = currentToken.text.replace(/> ?/, "");
        currentToken.type = "transition";
      } else if ((match = currentToken.text.match(fountainRegexes.synopsis))) {
        currentToken.text = match[1];
        currentToken.type = currentToken.text ? "synopsis" : "separator";

        const level = latestSectionOrScene(currentDepth + 1, () => true);
        if (level) {
          level.synopses = level.synopses || [];
          level.synopses.push({
            synopsis: currentToken.text,
            line: currentToken.line,
          });
        }
      } else if ((match = currentToken.text.match(fountainRegexes.section))) {
        currentToken.level = match[1].length;
        currentToken.text = match[2];
        currentToken.type = "section";
        // Section Container
        const container: FountainContainer = {
          id: null,
          level: currentToken.level,
          text: currentToken.text,
        };
        currentDepth = currentToken.level;
        const tokenDepth = currentDepth;

        const level =
          currentDepth > 1 &&
          latestSectionOrScene(
            currentDepth,
            (token) => token.level != null && token.level < tokenDepth
          );
        if (currentDepth === 1 || !level) {
          container.id = `.${currentToken.line}`;
          if (!result.properties.structure) {
            result.properties.structure = [];
          }
          result.properties.structure.push(container);
        } else {
          container.id = `${level.id}.${currentToken.line}`;
          if (!level.children) {
            level.children = [];
          }
          level.children.push(container);
        }
      } else if (currentToken.text.match(fountainRegexes.page_break)) {
        currentToken.text = "";
        currentToken.type = "page_break";
      } else if (
        currentToken.text.match(fountainRegexes.character) &&
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
        currentToken.text = trimCharacterForceSymbol(currentToken.text);
        if (currentToken.text[currentToken.text.length - 1] === "^") {
          state = "dual_dialogue";
          // update last dialogue to be dual:left
          const dialogue_tokens = ["dialogue", "character", "parenthetical"];
          while (
            dialogue_tokens.indexOf(
              result.scriptTokens[lastCharacterIndex].type
            ) !== -1
          ) {
            result.scriptTokens[lastCharacterIndex].dual = "left";
            lastCharacterIndex += 1;
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
          currentToken.dual = "right";
          currentToken.text = currentToken.text.replace(/\^$/, "");
        } else {
          pushToken(createFountainToken("dialogue_begin"));
        }
        const character = trimCharacterExtension(currentToken.text).trim();
        previousCharacter = character;
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
        lastCharacterIndex = result.scriptTokens.length;
      } else {
        currentToken.type = "action";
        processActionBlock(currentToken);
      }
    } else {
      if (currentToken.text.match(fountainRegexes.parenthetical)) {
        currentToken.type = "parenthetical";
        previousParenthetical = currentToken.text;
      } else {
        currentToken.type = "dialogue";
        processDialogueBlock(currentToken);
        currentToken.character = previousCharacter;
        if (previousParenthetical) {
          currentToken.parenthetical = previousParenthetical;
        }
        previousParenthetical = undefined;
      }
      if (dualRight) {
        currentToken.dual = "right";
      }
    }

    if (
      currentToken.type !== "action" &&
      !(currentToken.type === "dialogue" && currentToken.text === "  ")
    ) {
      currentToken.text = currentToken.text.trim();
    }

    if (tokenCategory === "script" && state !== "ignore") {
      if (["scene_heading", "transition"].includes(currentToken.type)) {
        currentToken.text = currentToken.text.toUpperCase();
        titlePageStarted = true; // ignore title tags after first heading
      }
      if (currentToken.text && currentToken.text[0] === "~") {
        currentToken.text = `*${currentToken.text.substring(1)}*`;
      }
      if (currentToken.type !== "action" && currentToken.type !== "dialogue")
        currentToken.text = currentToken.text.trim();

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
  }

  if (state === "dual_dialogue") {
    pushToken(createFountainToken("dual_dialogue_end"));
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

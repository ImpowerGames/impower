import {
  CompletionContext,
  CompletionItem,
  CompletionItemKind,
  MarkupKind,
  Position,
} from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import type { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import { getBlockMatch } from "@impower/sparkdown/src/utils/getBlockMatch";
import { getBlockType } from "@impower/sparkdown/src/utils/getBlockType";
import getDocumentation from "./getFencedCode";
import getLineText from "./getLineText";
import getUniqueOptions from "./getUniqueOptions";
import isEmptyLine from "./isEmptyLine";

const getSceneCompletions = () => {
  return [
    {
      label: "INT.",
      labelDetails: { description: "Scene" },
      kind: CompletionItemKind.Interface,
      documentation: {
        kind: MarkupKind.Markdown,
        value: getDocumentation("An indoor scene.", `INT. BEDROOM - NIGHT`),
      },
    },
    {
      label: "EXT.",
      labelDetails: { description: "Scene" },
      kind: CompletionItemKind.Interface,
      documentation: {
        kind: MarkupKind.Markdown,
        value: getDocumentation("An outdoor scene.", `EXT. BEACH - DAY`),
      },
    },
    {
      label: "INT./EXT.",
      labelDetails: { description: "Scene" },
      kind: CompletionItemKind.Interface,
      documentation: {
        kind: MarkupKind.Markdown,
        value: getDocumentation(
          "A scene that is intercut between indoors and outdoors.",
          `INT./EXT. PHONE BOOTH`
        ),
      },
    },
  ];
};

const getCharacterCompletions = (
  line: number,
  program: SparkProgram | undefined
) => {
  const characterNames = Object.keys(program?.metadata?.characters || {});
  const recentCharactersSet = new Set<string>();
  for (let i = line - 1; i >= 0; i -= 1) {
    const dialogueCharacterName = program?.metadata?.lines?.[i]?.character;
    if (dialogueCharacterName) {
      recentCharactersSet.add(dialogueCharacterName);
      if (recentCharactersSet.size >= characterNames.length) {
        break;
      }
    }
  }
  const recentCharacters = Array.from(recentCharactersSet);
  if (recentCharacters.length > 1) {
    const mostRecentCharacter = recentCharacters.shift();
    if (mostRecentCharacter) {
      recentCharacters.splice(1, 0, mostRecentCharacter);
    }
  }
  const labelDetails = { description: "Dialogue" };
  const kind = CompletionItemKind.Constant;
  const documentation = {
    kind: MarkupKind.Markdown,
    value: getDocumentation(
      "Dialogue is represented with an UPPERCASE character name followed by a line of text.",
      `JEFFERY\nDo you know where we are?`
    ),
  };
  const result: CompletionItem[] = [];
  recentCharacters.forEach((name, index) => {
    result.push({
      label: name,
      insertText: name + "\n",
      labelDetails,
      kind,
      documentation,
      sortText: `${index}`,
    });
  });
  characterNames.forEach((name) => {
    if (!recentCharactersSet.has(name)) {
      result.push({
        label: name,
        insertText: name + "\n",
        labelDetails,
        kind,
        documentation,
      });
    }
  });
  return result;
};

const getSceneCaptureCompletions = (
  match: string[],
  program: SparkProgram | undefined
) => {
  const location = match[3];
  const dash = match[5];
  const time = match[7];
  if (!location) {
    const locations = getUniqueOptions(
      program?.metadata.scenes?.map((s) => s.location)
    );
    return locations.map((location) => ({
      label: location,
      kind: CompletionItemKind.Enum,
    }));
  }
  if (dash && !time) {
    const times = getUniqueOptions([
      ...(program?.metadata.scenes?.map((s) => s.time) || []),
      "DAY",
      "NIGHT",
      "DAWN",
      "DUSK",
    ]);
    return times.map((time) => ({
      label: time,
      kind: CompletionItemKind.Enum,
    }));
  }
  return [];
};

const getCompletions = (
  document: TextDocument | undefined,
  program: SparkProgram | undefined,
  position: Position,
  context: CompletionContext | undefined
): CompletionItem[] => {
  if (!document) {
    return [];
  }
  const lineText = getLineText(document, position);
  const prevLineText = getLineText(document, position, -1);
  const triggerCharacter = context?.triggerCharacter;
  const lineMetadata = program?.metadata?.lines?.[position?.line];
  const scopeName = program?.scopes?.[lineMetadata?.scope ?? -1];
  if (!scopeName) {
    const match = getBlockMatch(lineText);
    const blockType = getBlockType(match);
    if (match) {
      if (blockType === "scene" && triggerCharacter === " ") {
        return getSceneCaptureCompletions(match, program);
      }
    } else {
      if (!triggerCharacter) {
        return [
          ...getCharacterCompletions(position.line, program),
          ...getSceneCompletions(),
        ];
      } else if (triggerCharacter === "\n" && isEmptyLine(prevLineText)) {
        return [...getCharacterCompletions(position.line, program)];
      }
    }
  }
  return [];
};

export default getCompletions;

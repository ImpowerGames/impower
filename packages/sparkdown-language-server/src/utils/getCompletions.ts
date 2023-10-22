import {
  CompletionContext,
  CompletionItem,
  CompletionItemKind,
  MarkupKind,
  Position,
} from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import type { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import getLineText from "./getLineText";
import getLineTextBefore from "./getLineTextBefore";
import getUniqueOptions from "./getUniqueOptions";

const WHITESPACE_REGEX = /\s/g;

const getImageCompletions = (program: SparkProgram | undefined) => {
  if (!program) {
    return [];
  }
  return Object.entries(program?.objectMap?.["image"] || {}).map(
    ([name, { src, type }]) => ({
      label: name,
      labelDetails: { description: type },
      kind: CompletionItemKind.Constructor,
      documentation: {
        kind: MarkupKind.Markdown,
        value: `![${name}](${src})`,
      },
    })
  );
};

const getAudioCompletions = (program: SparkProgram | undefined) => {
  if (!program) {
    return [];
  }
  return Object.entries(program?.objectMap?.["audio"] || {}).map(
    ([name, { type }]) => ({
      label: name,
      labelDetails: { description: type },
      kind: CompletionItemKind.Constructor,
    })
  );
};

const getAudioArgumentCompletions = (content: string) => {
  const args = content.split(WHITESPACE_REGEX);
  if (args.includes("stop")) {
    return null;
  }
  if (args.includes("start")) {
    return null;
  }
  return [
    {
      label: "stop",
      kind: CompletionItemKind.Keyword,
    },
    {
      label: "start",
      kind: CompletionItemKind.Keyword,
    },
  ];
};

const getScriptCompletions = (program: SparkProgram | undefined) => {
  if (!program) {
    return [];
  }
  return Object.entries(program?.objectMap?.["script"] || {}).map(
    ([name, { type }]) => ({
      label: name,
      labelDetails: { description: type },
      kind: CompletionItemKind.Constructor,
    })
  );
};

const getSceneCompletions = () => {
  return [
    {
      label: "INT.",

      labelDetails: { description: "Scene" },
      kind: CompletionItemKind.Interface,
    },
    {
      label: "EXT.",
      labelDetails: { description: "Scene" },
      kind: CompletionItemKind.Interface,
    },
    {
      label: "INT./EXT.",
      labelDetails: { description: "Scene" },
      kind: CompletionItemKind.Interface,
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
  const result: CompletionItem[] = [];
  recentCharacters.forEach((name, index) => {
    result.push({
      label: name,
      insertText: name + "\n",
      labelDetails,
      kind,
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
): CompletionItem[] | null | undefined => {
  if (!document) {
    return undefined;
  }
  const lineText = getLineText(document, position);
  const prevLineText = getLineText(document, position, -1);
  const triggerCharacter = context?.triggerCharacter;
  const lineMetadata = program?.metadata?.lines?.[position?.line];
  const scopeName = program?.scopes?.[lineMetadata?.scope ?? -1];
  const lineTextBefore = getLineTextBefore(document, position);
  const trimmedLineTextBefore = lineTextBefore.trim();
  if (trimmedLineTextBefore.startsWith("[[")) {
    return getImageCompletions(program);
  }
  if (trimmedLineTextBefore.startsWith("((")) {
    if (WHITESPACE_REGEX.test(lineTextBefore)) {
      return getAudioArgumentCompletions(
        trimmedLineTextBefore.replace("((", "")
      );
    } else {
      return getAudioCompletions(program);
    }
  }
  if (trimmedLineTextBefore.startsWith("> load(")) {
    return getScriptCompletions(program);
  }
  if (!scopeName) {
    // TODO:
    // const match = getBlockMatch(lineText);
    // const blockType = getBlockType(match);
    // if (match) {
    //   if (blockType === "scene" && triggerCharacter === " ") {
    //     return getSceneCaptureCompletions(match, program);
    //   }
    // } else {
    //   if (!triggerCharacter) {
    //     return [
    //       ...getCharacterCompletions(position.line, program),
    //       ...getSceneCompletions(),
    //     ];
    //   } else if (triggerCharacter === "\n" && isEmptyLine(prevLineText)) {
    //     return [...getCharacterCompletions(position.line, program)];
    //   }
    // }
  }
  return undefined;
};

export default getCompletions;

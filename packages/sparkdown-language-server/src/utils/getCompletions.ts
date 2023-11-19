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
import { Asset, isAsset } from "./isAsset";
import isEmptyLine from "./isEmptyLine";

const WHITESPACE_REGEX = /\s/g;

const getImageCompletions = (program: SparkProgram | undefined) => {
  const images = Object.values(program?.typeMap?.["Asset"] || {}).filter(
    (asset) => isAsset(asset) && asset.type === "image"
  ) as Asset[];
  return images.map((asset) => ({
    label: asset.name,
    labelDetails: { description: asset.type },
    kind: CompletionItemKind.Constructor,
    documentation: {
      kind: MarkupKind.Markdown,
      value: `![${asset.name}](${asset.src})`,
    },
  }));
};

const getAudioCompletions = (program: SparkProgram | undefined) => {
  const audio = Object.values(program?.typeMap?.["Asset"] || {}).filter(
    (asset) => isAsset(asset) && asset.type === "audio"
  ) as Asset[];
  return audio.map((asset) => ({
    label: asset.name,
    labelDetails: { description: asset.type },
    kind: CompletionItemKind.Constructor,
  }));
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

const getCharacterCompletions = (
  line: number,
  program: SparkProgram | undefined,
  beforeText: string
) => {
  const characters = Object.values(program?.metadata?.characters || {});
  const recentCharactersSet = new Set<string>();
  for (let i = line - 1; i >= 0; i -= 1) {
    const dialogueCharacterName = program?.metadata?.lines?.[i]?.characterName;
    if (dialogueCharacterName && dialogueCharacterName.startsWith(beforeText)) {
      recentCharactersSet.add(dialogueCharacterName);
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
  characters.forEach((character) => {
    if (
      character.lines?.[0] !== line &&
      character.name &&
      !recentCharactersSet.has(character.name) &&
      character.name.startsWith(beforeText)
    ) {
      result.push({
        label: character.name,
        insertText: character.name + "\n",
        labelDetails,
        kind,
      });
    }
  });
  return result;
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
  const prevLineText = getLineText(document, position, -1);
  const nextLineText = getLineText(document, position, 1);
  const lineTextBefore = getLineTextBefore(document, position);
  const trimmedLineTextBefore = lineTextBefore.trim();
  const lineMetadata = program?.metadata?.lines?.[position?.line];
  const scopes = lineMetadata?.scopes;
  const triggerCharacter = context?.triggerCharacter;
  if (scopes) {
    if (scopes.includes("image")) {
      return getImageCompletions(program);
    }
    if (scopes.includes("audio")) {
      if (scopes.includes("asset_args")) {
        return getAudioArgumentCompletions(
          trimmedLineTextBefore.replace("((", "")
        );
      } else if (triggerCharacter !== "@") {
        return getAudioCompletions(program);
      }
    }
    if (
      scopes.includes("action") &&
      scopes.includes("text") &&
      isEmptyLine(prevLineText) &&
      isEmptyLine(nextLineText)
    ) {
      return getCharacterCompletions(
        position.line,
        program,
        trimmedLineTextBefore
      );
    }
    if (
      scopes.includes("dialogue") &&
      scopes.includes("dialogue_character_name")
    ) {
      return getCharacterCompletions(
        position.line,
        program,
        trimmedLineTextBefore
      );
    }
  }
  return undefined;
};

export default getCompletions;

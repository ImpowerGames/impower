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
import isEmptyLine from "./isEmptyLine";

const WHITESPACE_REGEX = /\s/g;

interface Asset {
  type: string;
  name: string;
  src: string;
}

const isAsset = (obj: unknown): obj is Asset => {
  const asset = obj as Asset;
  return Boolean(asset.type && asset.name && asset.src);
};

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
  program: SparkProgram | undefined
) => {
  const characters = Object.values(program?.metadata?.characters || {});
  const recentCharactersSet = new Set<string>();
  for (let i = line - 1; i >= 0; i -= 1) {
    const dialogueCharacterName = program?.metadata?.lines?.[i]?.characterName;
    if (dialogueCharacterName) {
      console.log(line, dialogueCharacterName);
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
      !recentCharactersSet.has(character.name)
    ) {
      result.push({
        label: character.name,
        insertText: character.name + "\n",
        labelDetails,
        kind,
      });
    }
  });
  console.log(result);
  return result;
};

const getCompletions = (
  document: TextDocument | undefined,
  program: SparkProgram | undefined,
  position: Position,
  _context: CompletionContext | undefined
): CompletionItem[] | null | undefined => {
  if (!document) {
    return undefined;
  }
  const lineText = getLineText(document, position);
  const prevLineText = getLineText(document, position, -1);
  const nextLineText = getLineText(document, position, 1);
  const lineTextBefore = getLineTextBefore(document, position);
  const trimmedLineTextBefore = lineTextBefore.trim();
  const lineMetadata = program?.metadata?.lines?.[position?.line];
  const scopes = lineMetadata?.scopes;
  console.log(
    JSON.stringify(prevLineText),
    JSON.stringify(lineText),
    JSON.stringify(nextLineText),
    scopes,
    scopes && scopes.includes("action") && scopes.includes("text")
  );
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
  if (scopes) {
    if (
      scopes.includes("action") &&
      scopes.includes("text") &&
      isEmptyLine(prevLineText) &&
      isEmptyLine(nextLineText)
    ) {
      return getCharacterCompletions(position.line, program);
    }
    if (
      scopes.includes("dialogue") &&
      scopes.includes("dialogue_character_name")
    ) {
      return getCharacterCompletions(position.line, program);
    }
  }
  return undefined;
};

export default getCompletions;

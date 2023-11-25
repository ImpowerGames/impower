import {
  CompletionContext,
  CompletionItem,
  CompletionItemKind,
  MarkupKind,
  Position,
} from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { getAllProperties } from "@impower/spark-engine/src/game/core/utils/getAllProperties";
import { SparkField } from "@impower/sparkdown/src/types/SparkField";
import type { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import {
  SparkStructEmptyProperty,
  SparkStructMapPropertyToken,
  SparkStructToken,
} from "@impower/sparkdown/src/types/SparkToken";
import getLineText from "./getLineText";
import getLineTextAfter from "./getLineTextAfter";
import getLineTextBefore from "./getLineTextBefore";
import { Asset, isAsset } from "./isAsset";
import isEmptyLine from "./isEmptyLine";

const WHITESPACE_REGEX = /\s/g;

const getImageCompletions = (
  program: SparkProgram | undefined
): CompletionItem[] | null => {
  const images = Object.values(program?.variables || {})
    .filter((v) => isAsset(v.compiled) && v.compiled.type === "image")
    .map((v) => v.compiled as Asset);
  return images.map((asset) => ({
    label: asset.name,
    labelDetails: { description: "Image" },
    kind: CompletionItemKind.Constructor,
    documentation: {
      kind: MarkupKind.Markdown,
      value: `![${asset.name}](${asset.src})`,
    },
  }));
};

const getAudioCompletions = (
  program: SparkProgram | undefined
): CompletionItem[] | null => {
  const audio = Object.values(program?.variables || {})
    .filter((v) => isAsset(v.compiled) && v.compiled.type === "audio")
    .map((v) => v.compiled as Asset);
  return audio.map((asset) => ({
    label: asset.name,
    labelDetails: { description: "Audio" },
    kind: CompletionItemKind.Constructor,
  }));
};

const getAudioArgumentCompletions = (
  content: string
): CompletionItem[] | null => {
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
    {
      label: "pause",
      kind: CompletionItemKind.Keyword,
    },
    {
      label: "unpause",
      kind: CompletionItemKind.Keyword,
    },
    {
      label: "mute",
      kind: CompletionItemKind.Keyword,
    },
    {
      label: "unmute",
      kind: CompletionItemKind.Keyword,
    },
  ];
};

const getCharacterCompletions = (
  line: number,
  program: SparkProgram | undefined,
  beforeText?: string
): CompletionItem[] | null => {
  const characters = Object.values(program?.metadata?.characters || {});
  const recentCharactersSet = new Set<string>();
  for (let i = line - 1; i >= 0; i -= 1) {
    const dialogueCharacterName = program?.metadata?.lines?.[i]?.characterName;
    if (
      dialogueCharacterName &&
      (!beforeText || dialogueCharacterName.startsWith(beforeText))
    ) {
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
  const labelDetails = { description: "Character" };
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
      (!beforeText || character.name.startsWith(beforeText))
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

const getStructMapPropertyNameCompletions = (
  program: SparkProgram | undefined,
  type: string,
  fields: SparkField[] | undefined,
  path: string,
  beforeText: string
): CompletionItem[] | null => {
  const parentObj = program?.typeMap?.[type]?.[""];
  const result: CompletionItem[] = [];
  const existingProps = new Set<string>();
  const possibleNames = new Set<string>();
  const prefix = path ? `.${path}.` : ".";
  const trimmedText = beforeText.trimStart();
  const indentLength = beforeText.length - trimmedText.length;
  const indentedStr = beforeText.slice(0, indentLength) + "  ";
  const parentProperties = getAllProperties(parentObj);
  fields?.forEach((field) => {
    const prop = "." + field.path + "." + field.key;
    let path = "";
    prop.split(".").forEach((p) => {
      if (p) {
        path += "." + p;
        existingProps.add(path);
      }
    });
  });
  Object.entries(parentProperties).forEach(([p, v]) => {
    if (p.startsWith(prefix)) {
      const [name, child] = p.slice(prefix.length).split(".");
      const targetPath = p.slice(0, prefix.length) + name;
      const description = child ? "object" : typeof v;
      if (name && Number.isNaN(Number(name))) {
        if (!existingProps.has(targetPath) && !possibleNames.has(name)) {
          possibleNames.add(name);
          // TODO: When inserting string prop (that takes fixed values), use snippet syntax to allow user to choose between all possible string values ${1|one,two,three|}
          const insertSuffix = child ? `:\n${indentedStr}` : ": ";
          result.push({
            label: name,
            insertText: name + insertSuffix,
            labelDetails: { description },
            kind: CompletionItemKind.Property,
          });
        }
      }
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
  const textBefore = getLineTextBefore(document, position);
  const textAfter = getLineTextAfter(document, position);
  const trimmedTextBefore = textBefore.trimStart();
  const trimmedTextAfter = textAfter.trimEnd();
  const lineMetadata = program?.metadata?.lines?.[position?.line];
  const scopes = lineMetadata?.scopes;
  const triggerCharacter = context?.triggerCharacter;
  if (scopes) {
    if (scopes.includes("image")) {
      return getImageCompletions(program);
    }
    if (scopes.includes("audio")) {
      if (scopes.includes("asset_args")) {
        return getAudioArgumentCompletions(trimmedTextBefore.replace("((", ""));
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
      return getCharacterCompletions(position.line, program, trimmedTextBefore);
    }
    if (
      scopes.includes("dialogue") &&
      scopes.includes("dialogue_character_name") &&
      !trimmedTextAfter
    ) {
      return getCharacterCompletions(position.line, program, trimmedTextBefore);
    }
    if (
      scopes.includes("struct_map_property_start") &&
      scopes.includes("property_name")
    ) {
      const structToken = lineMetadata.tokens
        ?.map((i) => program?.tokens?.[i])
        .findLast((t) => t?.tag === "struct") as SparkStructToken | undefined;
      const structMapPropertyToken = lineMetadata.tokens
        ?.map((i) => program?.tokens?.[i])
        .findLast((t) => t?.tag === "struct_map_property") as
        | SparkStructMapPropertyToken
        | undefined;
      if (structToken && structMapPropertyToken) {
        return getStructMapPropertyNameCompletions(
          program,
          structToken.type,
          structToken.fields,
          structMapPropertyToken.path,
          textBefore
        );
      }
    }
    if (
      scopes.includes("struct") &&
      (scopes.includes("struct_blank_property") ||
        scopes.at(-1) === "struct_field")
    ) {
      const structToken = lineMetadata.tokens
        ?.map((i) => program?.tokens?.[i])
        .findLast((t) => t?.tag === "struct") as SparkStructToken | undefined;
      const structEmptyProperty = lineMetadata.tokens
        ?.map((i) => program?.tokens?.[i])
        .findLast((t) => t?.tag === "struct_blank_property") as
        | SparkStructEmptyProperty
        | undefined;
      if (structToken && structEmptyProperty) {
        return getStructMapPropertyNameCompletions(
          program,
          structToken.type,
          structToken.fields,
          structEmptyProperty.path,
          textBefore
        );
      }
    }
    if (
      scopes.includes("struct_scalar_property") &&
      scopes.includes("value_text")
    ) {
      // TODO: Use struct validation to autocomplete enum strings
    }
  } else {
    if (isEmptyLine(nextLineText)) {
      return getCharacterCompletions(position.line, program);
    }
  }
  return undefined;
};

export default getCompletions;

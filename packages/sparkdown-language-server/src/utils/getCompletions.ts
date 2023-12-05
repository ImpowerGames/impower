import {
  CompletionContext,
  CompletionItem,
  CompletionItemKind,
  InsertTextMode,
  MarkupKind,
  Position,
} from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { getAllProperties } from "@impower/spark-engine/src/game/core/utils/getAllProperties";
import { SparkField } from "@impower/sparkdown/src/types/SparkField";
import type { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import {
  SparkDefineObjectToken,
  SparkStoreObjectToken,
  SparkStructEmptyProperty,
  SparkStructMapPropertyToken,
} from "@impower/sparkdown/src/types/SparkToken";
import getLineText from "./getLineText";
import getLineTextAfter from "./getLineTextAfter";
import getLineTextBefore from "./getLineTextBefore";
import { Asset, isAssetOfType } from "./isAsset";
import isEmptyLine from "./isEmptyLine";

const WHITESPACE_REGEX = /\s/g;

const getImageCompletions = (
  program: SparkProgram | undefined
): CompletionItem[] | null => {
  const images = Object.values(program?.variables || {})
    .filter((v) => isAssetOfType(v.compiled, "image"))
    .map((v) => v.compiled as Asset);
  const imageCompletions = images.map((asset) => ({
    label: asset.name,
    labelDetails: { description: "image" },
    kind: CompletionItemKind.Constructor,
    documentation: {
      kind: MarkupKind.Markdown,
      value: `![${asset.name}](${asset.src})`,
    },
  }));
  const imageArrayNames = Object.values(program?.variables || {})
    .filter(
      (v) =>
        Array.isArray(v.compiled) &&
        v.compiled.every((x) => isAssetOfType(x, "image"))
    )
    .map((v) => v.name as string);
  const imageArrayCompletions = imageArrayNames.map((name) => ({
    label: name,
    labelDetails: { description: "image[]" },
    kind: CompletionItemKind.Constructor,
  }));
  const imageGroupNames = Object.values(program?.variables || {})
    .filter(
      (v) =>
        v.compiled &&
        typeof v.compiled === "object" &&
        "assets" in v.compiled &&
        Array.isArray(v.compiled.assets) &&
        v.compiled.assets.every((x: unknown) => isAssetOfType(x, "image"))
    )
    .map((v) => v.name as string);
  const imageGroupCompletions = imageGroupNames.map((name) => ({
    label: name,
    labelDetails: { description: "image_group" },
    kind: CompletionItemKind.Constructor,
  }));
  return [
    ...imageCompletions,
    ...imageArrayCompletions,
    ...imageGroupCompletions,
  ];
};

const getAudioCompletions = (
  program: SparkProgram | undefined
): CompletionItem[] | null => {
  const audio = Object.values(program?.variables || {})
    .filter((v) => isAssetOfType(v.compiled, "audio"))
    .map((v) => v.compiled as Asset);
  const audioCompletions = audio.map((asset) => ({
    label: asset.name,
    labelDetails: { description: "audio" },
    kind: CompletionItemKind.Constructor,
  }));
  const audioArrayNames = Object.values(program?.variables || {})
    .filter(
      (v) =>
        Array.isArray(v.compiled) &&
        v.compiled.every((x) => isAssetOfType(x, "audio"))
    )
    .map((v) => v.name as string);
  const audioArrayCompletions = audioArrayNames.map((arrayName) => ({
    label: arrayName,
    labelDetails: { description: "audio[]" },
    kind: CompletionItemKind.Constructor,
  }));
  const audioGroupNames = Object.values(program?.variables || {})
    .filter(
      (v) =>
        v.compiled &&
        typeof v.compiled === "object" &&
        "assets" in v.compiled &&
        Array.isArray(v.compiled.assets) &&
        v.compiled.assets.every((x: unknown) => isAssetOfType(x, "audio"))
    )
    .map((v) => v.name as string);
  const audioGroupCompletions = audioGroupNames.map((name) => ({
    label: name,
    labelDetails: { description: "audio_group" },
    kind: CompletionItemKind.Constructor,
  }));
  return [
    ...audioCompletions,
    ...audioArrayCompletions,
    ...audioGroupCompletions,
  ];
};

const getAudioArgumentCompletions = (
  content: string
): CompletionItem[] | null => {
  const args = content.split(WHITESPACE_REGEX);
  const completions = [
    "schedule",
    "stop",
    "start",
    "mute",
    "unmute",
    "loop",
    "noloop",
    "volume",
    "after",
    "over",
  ];
  return completions
    .filter((c) => !args.includes(c))
    .map((label) => ({
      label,
      insertText:
        content.startsWith(" ") && !content.trim() ? label : " " + label,
      kind: CompletionItemKind.Keyword,
    }));
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
  const labelDetails = { description: "character" };
  const kind = CompletionItemKind.Constant;
  const result: CompletionItem[] = [];
  recentCharacters.forEach((name, index) => {
    const sortText = index.toString().padStart(3, "0");
    result.push({
      label: name,
      insertText: name + "\n",
      labelDetails,
      kind,
      sortText,
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
  return result;
};

const getStructMapPropertyNameCompletions = (
  program: SparkProgram | undefined,
  type: string,
  fields: SparkField[] | undefined,
  path: string,
  beforeText: string
): CompletionItem[] | null => {
  const parentObj = program?.variables?.[type]?.compiled;
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
  Object.entries(parentProperties).forEach(([p, v], index) => {
    if (p.startsWith(prefix)) {
      const [name, child] = p.slice(prefix.length).split(".");
      const targetPath = p.slice(0, prefix.length) + name;
      const description = child ? "object" : typeof v;
      if (name && Number.isNaN(Number(name))) {
        if (!existingProps.has(targetPath) && !possibleNames.has(name)) {
          possibleNames.add(name);
          // TODO: When inserting string prop (that takes fixed values), use snippet syntax to allow user to choose between all possible string values ${1|one,two,three|}
          const insertSuffix = child ? `:\n${indentedStr}` : ": ";
          const sortText = index.toString().padStart(3, "0");
          result.push({
            label: name,
            insertText: name + insertSuffix,
            sortText,
            labelDetails: { description },
            kind: CompletionItemKind.Property,
            insertTextMode: InsertTextMode.asIs,
            command: {
              title: "Trigger Suggestions",
              command: "editor.action.triggerSuggest",
            },
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
  const lineText = getLineText(document, position);
  const nextLineText = getLineText(document, position, 1);
  const beforeText = getLineTextBefore(document, position);
  const afterText = getLineTextAfter(document, position);
  const trimmedBeforeText = beforeText.trimStart();
  const trimmedAfterText = afterText.trimEnd();
  const lineMetadata = program?.metadata?.lines?.[position?.line];
  const scopes = lineMetadata?.scopes;
  const triggerCharacter = context?.triggerCharacter;
  if (scopes) {
    if (scopes.includes("image")) {
      return getImageCompletions(program);
    }
    if (scopes.includes("audio")) {
      if (triggerCharacter === ":" || scopes.includes("asset_args")) {
        return getAudioArgumentCompletions(
          lineText.slice(lineText.indexOf(":") + 1, lineText.indexOf(")"))
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
      return getCharacterCompletions(position.line, program, trimmedBeforeText);
    }
    if (
      scopes.includes("dialogue") &&
      scopes.includes("dialogue_character_name") &&
      !trimmedAfterText
    ) {
      return getCharacterCompletions(position.line, program, trimmedBeforeText);
    }
    if (
      scopes.includes("struct_map_property_start") &&
      scopes.includes("property_name")
    ) {
      const structToken = lineMetadata.tokens
        ?.map((i) => program?.tokens?.[i])
        .findLast(
          (t) => t?.tag === "define_object" || t?.tag === "store_object"
        ) as SparkDefineObjectToken | SparkStoreObjectToken | undefined;
      const structMapPropertyToken = lineMetadata.tokens
        ?.map((i) => program?.tokens?.[i])
        .findLast((t) => t?.tag === "struct_map_property") as
        | SparkStructMapPropertyToken
        | undefined;
      if (structToken && structMapPropertyToken && !beforeText.includes(":")) {
        return getStructMapPropertyNameCompletions(
          program,
          structToken.type,
          structToken.fields,
          structMapPropertyToken.path,
          beforeText
        );
      }
    }
    if (
      (scopes.includes("define_object") || scopes.includes("store_object")) &&
      (scopes.includes("struct_blank_property") ||
        scopes.at(-1) === "struct_field")
    ) {
      const structToken = lineMetadata.tokens
        ?.map((i) => program?.tokens?.[i])
        .findLast(
          (t) => t?.tag === "define_object" || t?.tag === "store_object"
        ) as SparkDefineObjectToken | SparkStoreObjectToken | undefined;
      const structEmptyProperty = lineMetadata.tokens
        ?.map((i) => program?.tokens?.[i])
        .findLast((t) => t?.tag === "struct_blank_property") as
        | SparkStructEmptyProperty
        | undefined;
      if (structToken && structEmptyProperty && !beforeText.includes(":")) {
        return getStructMapPropertyNameCompletions(
          program,
          structToken.type,
          structToken.fields,
          structEmptyProperty.path,
          beforeText
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
    if (isEmptyLine(prevLineText) && isEmptyLine(nextLineText)) {
      return getCharacterCompletions(position.line, program);
    }
  }
  return undefined;
};

export default getCompletions;

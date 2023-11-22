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
  SparkStructMapPropertyToken,
  SparkStructToken,
} from "@impower/sparkdown/src/types/SparkToken";
import getLineText from "./getLineText";
import getLineTextBefore from "./getLineTextBefore";
import { Asset, isAsset } from "./isAsset";
import isEmptyLine from "./isEmptyLine";

const WHITESPACE_REGEX = /\s/g;

const getImageCompletions = (
  program: SparkProgram | undefined
): CompletionItem[] | null => {
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

const getAudioCompletions = (
  program: SparkProgram | undefined
): CompletionItem[] | null => {
  const audio = Object.values(program?.typeMap?.["Asset"] || {}).filter(
    (asset) => isAsset(asset) && asset.type === "audio"
  ) as Asset[];
  return audio.map((asset) => ({
    label: asset.name,
    labelDetails: { description: asset.type },
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
  ];
};

const getCharacterCompletions = (
  line: number,
  program: SparkProgram | undefined,
  beforeText: string
): CompletionItem[] | null => {
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
    existingProps.add(prop);
  });
  Object.entries(parentProperties).forEach(([p, v]) => {
    if (!existingProps.has(p) && p.startsWith(prefix)) {
      const [name, child] = p.slice(prefix.length).split(".");
      const description = child ? "object" : typeof v;
      if (name && Number.isNaN(Number(name))) {
        if (!possibleNames.has(name)) {
          possibleNames.add(name);
          // TODO: When inserting object prop, use snippet syntax to allow user to choose between all possible child names ${1|one,two,three|}
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
  const lineTextBefore = getLineTextBefore(document, position);
  const trimmedLineTextBefore = lineTextBefore.trim();
  const lineMetadata = program?.metadata?.lines?.[position?.line];
  const scopes = lineMetadata?.scopes;
  const triggerCharacter = context?.triggerCharacter;
  console.log(triggerCharacter, lineMetadata);
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
    if (
      scopes.includes("struct_map_property_start") &&
      scopes.includes("property_name")
    ) {
      const structToken = lineMetadata.tokens
        ?.map((i) => program?.tokens?.[i])
        .find((t) => t?.tag === "struct") as SparkStructToken | undefined;
      const structMapPropertyToken = lineMetadata.tokens
        ?.map((i) => program?.tokens?.[i])
        .find((t) => t?.tag === "struct_map_property") as
        | SparkStructMapPropertyToken
        | undefined;
      if (structToken && structMapPropertyToken) {
        return getStructMapPropertyNameCompletions(
          program,
          structToken.type,
          structToken.fields,
          structMapPropertyToken.path,
          lineTextBefore
        );
      }
    }
    if (
      scopes.includes("struct_scalar_property") &&
      scopes.includes("value_text")
    ) {
      // TODO: Use struct validation to autocomplete enum strings
    }
  }
  return undefined;
};

export default getCompletions;

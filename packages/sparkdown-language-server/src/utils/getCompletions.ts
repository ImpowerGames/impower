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
  ISparkDeclarationToken,
  ISparkStructFieldToken,
  SparkAssignToken,
  SparkStoreToken,
  SparkStructBlankProperty,
  SparkStructMapPropertyToken,
} from "@impower/sparkdown/src/types/SparkToken";
import { SparkVariable } from "@impower/sparkdown/src/types/SparkVariable";
import { Asset } from "../types/Asset";
import getLineText from "./getLineText";
import getLineTextAfter from "./getLineTextAfter";
import getLineTextBefore from "./getLineTextBefore";
import isEmptyLine from "./isEmptyLine";

const WHITESPACE_REGEX = /\s+/g;

const getImageCompletions = (
  program: SparkProgram | undefined
): CompletionItem[] | null => {
  const images = Object.values(program?.variables || {})
    .filter((v) => v.type === "image")
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
        Array.isArray(v.compiled) && v.compiled.every((x) => x.type === "image")
    )
    .map((v) => v.name as string);
  const imageArrayCompletions = imageArrayNames.map((name) => ({
    label: name,
    labelDetails: { description: "image[]" },
    kind: CompletionItemKind.Constructor,
  }));
  const imageGroupNames = Object.values(program?.variables || {})
    .filter((v) => v.type === "image_group")
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
    .filter((v) => v.type === "audio")
    .map((v) => v.compiled as Asset);
  const audioCompletions = audio.map((asset) => ({
    label: asset.name,
    labelDetails: { description: "audio" },
    kind: CompletionItemKind.Constructor,
  }));
  const audioArrayNames = Object.values(program?.variables || {})
    .filter(
      (v) =>
        Array.isArray(v.compiled) && v.compiled.every((x) => x.type === "audio")
    )
    .map((v) => v.name as string);
  const audioArrayCompletions = audioArrayNames.map((arrayName) => ({
    label: arrayName,
    labelDetails: { description: "audio[]" },
    kind: CompletionItemKind.Constructor,
  }));
  const audioGroupNames = Object.values(program?.variables || {})
    .filter((v) => v.type === "audio_group")
    .map((v) => v.name as string);
  const audioGroupCompletions = audioGroupNames.map((name) => ({
    label: name,
    labelDetails: { description: "audio_group" },
    kind: CompletionItemKind.Constructor,
  }));
  const synthNames = Object.values(program?.variables || {})
    .filter((v) => v.type === "synth")
    .map((v) => v.name as string);
  const synthCompletions = synthNames.map((name) => ({
    label: name,
    labelDetails: { description: "synth" },
    kind: CompletionItemKind.Constructor,
  }));
  return [
    ...audioCompletions,
    ...audioArrayCompletions,
    ...audioGroupCompletions,
    ...synthCompletions,
  ];
};

const getAudioArgumentCompletions = (
  content: string,
  triggerCharacter: string | undefined
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
      insertText: triggerCharacter === ":" ? " " + label : label,
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
  if (!type) {
    return null;
  }
  const parentObj = program?.variables?.[type]?.compiled;
  const result: CompletionItem[] = [];
  const existingProps = new Set<string>();
  const possibleNames = new Set<string>();
  const trimmedPath = path.endsWith(".") ? path.slice(0, -1) : path;
  const prefix = trimmedPath ? `.${trimmedPath}.` : ".";
  const trimmedText = beforeText.trimStart();
  const indentLength = beforeText.length - trimmedText.length;
  const indentedStr = beforeText.slice(0, indentLength) + "  ";
  const parentProperties = getAllProperties(parentObj);
  fields?.forEach((field) => {
    const prop = "." + field.path + "." + field.key;
    let existingPath = "";
    prop.split(".").forEach((p) => {
      if (p) {
        existingPath += "." + p;
        existingProps.add(existingPath);
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
          const insertSuffix = child ? `:\n${indentedStr}` : " = ";
          result.push({
            label: name,
            insertText: name + insertSuffix,
            labelDetails: { description },
            kind: CompletionItemKind.Property,
            insertTextMode: InsertTextMode.asIs,
          });
        }
      }
    }
  });
  return result;
};

const getPropertyNameCompletions = (
  program: SparkProgram | undefined,
  type: string,
  path: string
): CompletionItem[] | null => {
  if (!type) {
    return null;
  }
  const parentObj = program?.variables?.[type]?.compiled;
  const result: CompletionItem[] = [];
  const possibleNames = new Set<string>();
  const trimmedPath = path.replace(/^[.]+/, "").replace(/[.]+$/, "");
  const prefix = trimmedPath ? `.${trimmedPath}.` : ".";
  const parentProperties = getAllProperties(parentObj);
  Object.entries(parentProperties).forEach(([p, v]) => {
    if (p.startsWith(prefix)) {
      const [name, child] = p.slice(prefix.length).split(".");
      const description = child ? "object" : typeof v;
      if (name && Number.isNaN(Number(name))) {
        if (!possibleNames.has(name)) {
          possibleNames.add(name);
          result.push({
            label: name,
            labelDetails: { description },
            kind: CompletionItemKind.Property,
            insertTextMode: InsertTextMode.asIs,
          });
        }
      }
    }
  });
  return result;
};

const getVariableCompletions = (
  program: SparkProgram | undefined,
  filter?: (variable: SparkVariable) => boolean,
  boost?: (variable: SparkVariable) => boolean
) => {
  if (!program?.variables) {
    return [];
  }
  const result: CompletionItem[] = [];
  Object.entries(program.variables).forEach(([name, variable]) => {
    if (!filter || filter(variable)) {
      const description = variable.type ?? "object";
      const sortText = boost?.(variable) ? "0" : "1";
      result.push({
        label: name,
        labelDetails: { description },
        kind: CompletionItemKind.Variable,
        insertTextMode: InsertTextMode.asIs,
        sortText,
      });
    }
  });
  return result;
};

const PRIMITIVE_TYPES = ["string", "number", "boolean"];

const getTypeCompletions = (program: SparkProgram | undefined) => {
  const result: CompletionItem[] = [];
  PRIMITIVE_TYPES.forEach((type) => {
    result.push({
      label: type,
      kind: CompletionItemKind.Keyword,
      insertTextMode: InsertTextMode.asIs,
    });
  });
  if (program?.variables) {
    Object.entries(program.variables).forEach(([name, variable]) => {
      if (!variable.type || variable.type === "object") {
        result.push({
          label: name,
          kind: CompletionItemKind.TypeParameter,
          insertTextMode: InsertTextMode.asIs,
        });
      }
    });
  }
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
  const line = position?.line;
  const prevLineText = getLineText(document, position, -1);
  const lineText = getLineText(document, position);
  const nextLineText = getLineText(document, position, 1);
  const beforeText = getLineTextBefore(document, position);
  const afterText = getLineTextAfter(document, position);
  const trimmedBeforeText = beforeText.trimStart();
  const trimmedAfterText = afterText.trimEnd();
  const lineMetadata = program?.metadata?.lines?.[line];
  const scopes = lineMetadata?.scopes;
  const triggerCharacter = context?.triggerCharacter;
  if (scopes) {
    if (scopes.includes("image")) {
      return getImageCompletions(program);
    }
    if (scopes.includes("audio")) {
      if (triggerCharacter === ":" || scopes.includes("asset_args")) {
        return getAudioArgumentCompletions(
          lineText.slice(lineText.indexOf(":") + 1, lineText.indexOf(")")),
          triggerCharacter
        );
      } else if (triggerCharacter !== "@") {
        return getAudioCompletions(program);
      }
      return null;
    }
    if (
      scopes.includes("action") &&
      scopes.includes("text") &&
      !beforeText &&
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
    if (scopes.includes("define")) {
      if (
        scopes.includes("struct_map_property_start") &&
        scopes.includes("property_name")
      ) {
        const token = lineMetadata.tokens
          ?.map((i) => program?.tokens?.[i])
          .findLast((t) => t?.tag === "define") as
          | ISparkDeclarationToken<string>
          | undefined;
        const structMapPropertyToken = lineMetadata.tokens
          ?.map((i) => program?.tokens?.[i])
          .findLast((t) => t?.tag === "struct_map_property") as
          | SparkStructMapPropertyToken
          | undefined;
        if (token && !beforeText.includes(":")) {
          return getStructMapPropertyNameCompletions(
            program,
            token.type,
            token.fields,
            structMapPropertyToken?.path ?? "",
            beforeText
          );
        }
      }
      if (scopes.includes("struct_blank_property") && !triggerCharacter) {
        const token = lineMetadata.tokens
          ?.map((i) => program?.tokens?.[i])
          .findLast((t) => t?.tag === "define") as
          | ISparkDeclarationToken<string>
          | undefined;
        const structBlankProperty = lineMetadata.tokens
          ?.map((i) => program?.tokens?.[i])
          .findLast((t) => t?.tag === "struct_blank_property") as
          | SparkStructBlankProperty
          | undefined;
        if (token && !beforeText.includes(":")) {
          return getStructMapPropertyNameCompletions(
            program,
            token.type,
            token.fields,
            structBlankProperty?.path ?? "",
            beforeText
          );
        }
      }
      if (scopes.at(-1) === "type_name") {
        return getTypeCompletions(program);
      }
      if (
        (scopes.includes("struct_scalar_property") ||
          scopes.includes("struct_scalar_item")) &&
        scopes.includes("value_text") &&
        scopes.at(-1) === "variable_name"
      ) {
        const fieldToken = lineMetadata.tokens
          ?.map((i) => program?.tokens?.[i])
          .findLast(
            (t) =>
              t?.tag === "struct_scalar_property" ||
              t?.tag === "struct_scalar_item"
          ) as ISparkStructFieldToken<string> | undefined;
        if (fieldToken) {
          return getVariableCompletions(
            program,
            (v) => v.line !== line && !v.implicit,
            (v) => v.type === fieldToken.type
          );
        }
        // TODO: Use struct validation to autocomplete enum strings
      }
    }
    if (
      (scopes.includes("define") ||
        scopes.includes("store") ||
        scopes.includes("assign")) &&
      scopes.includes("value_text") &&
      scopes.at(-1) === "variable_name"
    ) {
      const declarationToken = lineMetadata.tokens
        ?.map((i) => program?.tokens?.[i])
        .findLast(
          (t) =>
            t?.tag === "define" || t?.tag === "store" || t?.tag === "assign"
        ) as ISparkDeclarationToken<string> | undefined;
      if (declarationToken) {
        return getVariableCompletions(
          program,
          (v) => v.line !== line && !v.implicit,
          (v) => v.type === declarationToken.type
        );
      }
    }
    if (
      (scopes.at(0) === "store" ||
        scopes.at(0) === "assign" ||
        scopes.at(0) === "delete") &&
      scopes.at(1) === "whitespace"
    ) {
      return getVariableCompletions(
        program,
        (v) => v.line !== line && !v.implicit,
        (v) => typeof v.compiled !== "object"
      );
    }
    if (
      scopes.includes("target_access_path") &&
      scopes.at(-1) === "variable_name"
    ) {
      return getVariableCompletions(
        program,
        (v) => v.line !== line && !v.implicit && typeof v.compiled === "object"
      );
    }
    if (scopes.includes("value_text") && scopes.at(-1) === "variable_name") {
      return getVariableCompletions(
        program,
        (v) => v.line !== line && !v.implicit
      );
    }
    if (scopes.at(-1) === "punctuation_accessor") {
      const assignToken = lineMetadata.tokens
        ?.map((i) => program?.tokens?.[i])
        .findLast((t) => t?.tag === "store" || t?.tag === "assign") as
        | SparkStoreToken
        | SparkAssignToken
        | undefined;
      const pathParts = assignToken?.content;
      if (pathParts) {
        const variableName = pathParts?.[0]?.text;
        if (variableName) {
          const variable = program?.variables?.[variableName];
          if (variable) {
            return getPropertyNameCompletions(
              program,
              variable.type,
              pathParts
                .slice(1)
                .map((p) => p.text)
                .join("")
            );
          }
        }
      }
    }
  } else {
    if (!beforeText && isEmptyLine(prevLineText) && isEmptyLine(nextLineText)) {
      return getCharacterCompletions(position.line, program);
    }
  }
  return undefined;
};

export default getCompletions;

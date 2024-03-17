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
import { SparkTokenTagMap } from "@impower/sparkdown/src/types/SparkToken";
import { getProperty } from "@impower/sparkdown/src/utils/getProperty";
import isIdentifier from "@impower/sparkdown/src/utils/isIdentifier";
import { traverse } from "@impower/sparkdown/src/utils/traverse";
import { Asset } from "../types/Asset";
import getLineText from "./getLineText";
import getLineTextAfter from "./getLineTextAfter";
import getLineTextBefore from "./getLineTextBefore";
import isEmptyLine from "./isEmptyLine";

const WHITESPACE_REGEX = /\s+/g;

const getLineToken = <K extends keyof SparkTokenTagMap>(
  program: SparkProgram,
  line: number,
  ...tags: K[]
): SparkTokenTagMap[K] | undefined => {
  const lineMetadata = program?.metadata?.lines?.[line];
  const lineTokens = lineMetadata?.tokens?.map((i) => program?.tokens?.[i]);
  return (
    tags.length > 0
      ? lineTokens?.findLast((t) => tags.includes(t?.tag as unknown as K))
      : lineTokens?.at(-1)
  ) as SparkTokenTagMap[K];
};

const getElementCompletions = (
  program: SparkProgram
): CompletionItem[] | null => {
  const completions: Map<string, CompletionItem> = new Map();
  Object.entries(program?.context?.["ui"] || {}).forEach(([, v]) => {
    traverse(v, (fieldPath) => {
      if (fieldPath.endsWith(".image")) {
        const layer = fieldPath.split(".").at(-2);
        if (layer) {
          const completion: CompletionItem = {
            label: layer,
            labelDetails: { description: "element" },
            kind: CompletionItemKind.Constructor,
          };
          if (!completions.has(completion.label)) {
            completions.set(completion.label, completion);
          }
        }
      }
    });
  });
  return Array.from(completions.values());
};

const getImageCompletions = (
  program: SparkProgram,
  line: number
): CompletionItem[] | null => {
  const imageToken = getLineToken(program, line, "image");
  const completions: Map<string, CompletionItem> = new Map();
  Object.entries(program?.context?.["image_group"] || {}).forEach(([, v]) => {
    const name = v.$name;
    if (name !== "default") {
      const asset = v as {
        assets: Asset[];
        src: string;
        data?: string;
        mime?: string;
      };
      if (asset) {
        const completion: CompletionItem = {
          label: name,
          labelDetails: { description: "image_group" },
          kind: CompletionItemKind.Constructor,
        };
        completion.documentation = {
          kind: MarkupKind.Markdown,
          value: `<img src="${asset.src}" alt="${name}" width="300px" />`,
        };
        if (!completions.has(completion.label)) {
          completions.set(completion.label, completion);
        }
      }
    }
  });
  Object.entries(program?.context?.["image"] || {}).forEach(([, v]) => {
    const name = v.$name;
    if (name !== "default") {
      const asset = v as Asset;
      if (asset) {
        const completion: CompletionItem = {
          label: name,
          labelDetails: { description: "image" },
          kind: CompletionItemKind.Constructor,
        };
        if (asset.src) {
          completion.documentation = {
            kind: MarkupKind.Markdown,
            value: `<img src="${asset.src}" alt="${name}" width="300px" />`,
          };
        }
        if (!completions.has(completion.label)) {
          completions.set(completion.label, completion);
        }
      }
    }
  });
  if (!imageToken?.control) {
    const controls = ["show", "hide", "fade"];
    controls.forEach((label) => {
      const completion = {
        label,
        labelDetails: { description: "control" },
        kind: CompletionItemKind.Keyword,
      };
      if (!completions.has(completion.label)) {
        completions.set(completion.label, completion);
      }
    });
  }
  return Array.from(completions.values());
};

const getAudioCompletions = (
  program: SparkProgram | undefined
): CompletionItem[] | null => {
  const completions: CompletionItem[] = [];
  Object.values(program?.variables || {}).forEach((v) => {
    if (v.name !== "default") {
      if (v.type === "audio") {
        completions.push({
          label: v.name,
          labelDetails: { description: "audio" },
          kind: CompletionItemKind.Constructor,
        });
      } else if (v.type === "audio_group") {
        completions.push({
          label: v.name,
          labelDetails: { description: "audio_group" },
          kind: CompletionItemKind.Constructor,
        });
      } else if (
        Array.isArray(v.compiled) &&
        v.compiled.length > 0 &&
        v.compiled.every((x) => x.type === "audio")
      ) {
        completions.push({
          label: v.name,
          labelDetails: { description: "audio[]" },
          kind: CompletionItemKind.Constructor,
        });
      } else if (v.type === "synth") {
        completions.push({
          label: v.name,
          labelDetails: { description: "synth" },
          kind: CompletionItemKind.Constructor,
        });
      }
    }
  });
  return completions;
};

const getImageArgumentCompletions = (
  content: string
): CompletionItem[] | null => {
  const args = content.split(WHITESPACE_REGEX);
  const completions = ["after", "over", "with"];
  return completions
    .filter((c) => !args.includes(c))
    .map((label) => ({
      label,
      insertText: label,
      kind: CompletionItemKind.Keyword,
    }));
};

const getAudioArgumentCompletions = (
  program: SparkProgram,
  line: number,
  content: string
): CompletionItem[] | null => {
  const audioToken = getLineToken(program, line, "audio");
  const args = content.split(WHITESPACE_REGEX);
  const completions: string[] = [];
  if (audioToken?.control === "fade") {
    completions.push("to");
  }
  completions.push("after", "over", "mute", "unmute", "loop", "noloop", "now");
  return completions
    .filter((c) => !args.includes(c))
    .map((label) => ({
      label,
      insertText: label,
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
      const description = child ? undefined : typeof v;
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

const getTypeOrNameCompletions = (program: SparkProgram | undefined) => {
  const result: CompletionItem[] = [];
  if (program?.context) {
    Object.entries(program.context).forEach(([k, v]) => {
      if (isIdentifier(k)) {
        const description = typeof v === "object" ? undefined : typeof v;
        const sortText = typeof v !== "object" ? "0" : "1";
        const kind =
          typeof v === "object"
            ? CompletionItemKind.TypeParameter
            : CompletionItemKind.Variable;
        result.push({
          label: k,
          labelDetails: { description },
          kind,
          insertTextMode: InsertTextMode.asIs,
          sortText,
        });
      }
    });
  }
  return result;
};

const getAccessPathCompletions = (
  program: SparkProgram | undefined,
  beforeText: string
) => {
  const match = beforeText.match(/([_a-zA-Z0-9.]+?)$/);
  const path = match?.[1]?.trim();
  const parts = path?.split(".") || [];
  const parentPath =
    parts.length === 1
      ? ""
      : path?.endsWith(".")
      ? parts.slice(0, -1).join(".")
      : parts.join(".");
  const keyStartsWith =
    parts.length === 1 ? path : path?.endsWith(".") ? parts.at(-1) : "";
  const result: CompletionItem[] = [];
  if (program?.context) {
    const props = getProperty(program.context, parentPath);
    if (props) {
      Object.entries(props).forEach(([k, v]) => {
        if (isIdentifier(k)) {
          if (!keyStartsWith || k.startsWith(keyStartsWith)) {
            const description = typeof v === "object" ? undefined : typeof v;
            const kind =
              parts.length <= 1
                ? CompletionItemKind.TypeParameter
                : parts.length === 2
                ? CompletionItemKind.Variable
                : CompletionItemKind.Property;
            result.push({
              label: k,
              labelDetails: { description },
              kind,
              insertTextMode: InsertTextMode.asIs,
            });
          }
        }
      });
    }
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
  const trimmedBeforeText = beforeText.trim();
  const trimmedAfterText = afterText.trim();
  const trimmedStartBeforeText = beforeText.trimStart();
  const lineMetadata = program?.metadata?.lines?.[line];
  const scopes = lineMetadata?.scopes;
  const triggerCharacter = context?.triggerCharacter;

  if (!program) {
    return undefined;
  }

  console.log(lineMetadata, JSON.stringify(beforeText));

  if (scopes) {
    if (scopes.includes("image")) {
      if (scopes.includes("asset_args")) {
        return getImageArgumentCompletions(
          lineText.slice(lineText.indexOf(" ") + 1, lineText.indexOf("]"))
        );
      } else if (scopes.includes("asset_target_separator")) {
        return getElementCompletions(program);
      }
      return getImageCompletions(program, line);
    }
    if (scopes.includes("audio")) {
      if (scopes.includes("asset_args")) {
        return getAudioArgumentCompletions(
          program,
          line,
          lineText.slice(lineText.indexOf(" ") + 1, lineText.indexOf(")"))
        );
      }
      return getAudioCompletions(program);
    }
    if (
      scopes.includes("action") &&
      scopes.includes("text") &&
      isEmptyLine(prevLineText) &&
      isEmptyLine(nextLineText) &&
      !trimmedBeforeText &&
      !trimmedAfterText
    ) {
      return getCharacterCompletions(position.line, program);
    }
    if (
      scopes.includes("dialogue") &&
      scopes.includes("dialogue_character_name") &&
      !trimmedAfterText
    ) {
      return getCharacterCompletions(
        position.line,
        program,
        trimmedStartBeforeText
      );
    }
    if (scopes.includes("access_path")) {
      return getAccessPathCompletions(program, beforeText);
    }
    if (
      (trimmedBeforeText === "define" ||
        trimmedBeforeText === "store" ||
        trimmedBeforeText === "set") &&
      !trimmedAfterText
    ) {
      return getTypeOrNameCompletions(program);
    }
    if (
      scopes.includes("struct_map_property_start") &&
      scopes.includes("property_name")
    ) {
      const defineToken = getLineToken(program, line, "define");
      const structMapPropertyToken = getLineToken(
        program,
        line,
        "struct_map_property"
      );
      if (defineToken?.name) {
        const variable = program?.variables?.[defineToken.name];
        if (variable && !beforeText.includes(":")) {
          return getStructMapPropertyNameCompletions(
            program,
            variable.type,
            variable.fields,
            structMapPropertyToken?.path ?? "",
            beforeText
          );
        }
      }
    }
    if (scopes.includes("struct_blank_property") && !triggerCharacter) {
      const defineToken = getLineToken(program, line, "define");
      const structBlankPropertyToken = getLineToken(
        program,
        line,
        "struct_blank_property"
      );
      if (defineToken?.name) {
        const variable = program?.variables?.[defineToken.name];
        if (variable && !beforeText.includes(":")) {
          return getStructMapPropertyNameCompletions(
            program,
            variable.type,
            variable.fields,
            structBlankPropertyToken?.path ?? "",
            beforeText
          );
        }
      }
    }
  }
  return undefined;
};

export default getCompletions;

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
import getProperty from "@impower/sparkdown/src/utils/getProperty";
import isIdentifier from "@impower/sparkdown/src/utils/isIdentifier";
import traverse from "@impower/sparkdown/src/utils/traverse";

import type {
  NodeIterator,
  Tree,
  SyntaxNodeRef,
} from "../../../grammar-compiler/src/compiler/classes/Tree";
import type { Grammar } from "../../../grammar-compiler/src/grammar";
import { printTree } from "../../../grammar-compiler/src/compiler";

import { SparkdownNodeName } from "@impower/sparkdown/src/types/SparkdownNodeName";
import GRAMMAR_DEFINITION from "@impower/sparkdown/language/sparkdown.language-grammar.json";

const IMAGE_CONTROL_KEYWORDS =
  GRAMMAR_DEFINITION.variables.IMAGE_CONTROL_KEYWORDS;
const AUDIO_CONTROL_KEYWORDS =
  GRAMMAR_DEFINITION.variables.AUDIO_CONTROL_KEYWORDS;
const IMAGE_CLAUSE_KEYWORDS =
  GRAMMAR_DEFINITION.variables.IMAGE_CLAUSE_KEYWORDS;
const AUDIO_CLAUSE_KEYWORDS =
  GRAMMAR_DEFINITION.variables.AUDIO_CLAUSE_KEYWORDS;

const getImageTargetCompletions = (
  program: SparkProgram | undefined
): CompletionItem[] | null => {
  const completions: Map<string, CompletionItem> = new Map();
  Object.entries(program?.compiled?.structDefs?.["ui"] || {}).forEach(
    ([, v]) => {
      traverse(v, (fieldPath) => {
        if (fieldPath.endsWith(".image")) {
          const layer = fieldPath.split(".").at(-2);
          if (layer) {
            const completion: CompletionItem = {
              label: layer,
              labelDetails: { description: "element" },
              kind: CompletionItemKind.Constructor,
            };
            if (completion.label && !completions.has(completion.label)) {
              completions.set(completion.label, completion);
            }
          }
        }
      });
    }
  );
  return Array.from(completions.values());
};

const getImageNameCompletions = (
  program: SparkProgram | undefined
): CompletionItem[] => {
  const completions: Map<string, CompletionItem> = new Map();
  if (program) {
    Object.entries(
      program?.compiled?.structDefs?.["filtered_image"] || {}
    ).forEach(([, v]) => {
      const name = v.$name;
      if (!name.startsWith("$")) {
        const struct = v as {
          filtered_src: string;
          filtered_data?: string;
        };
        const src = struct?.filtered_src;
        if (struct) {
          const completion: CompletionItem = {
            label: name,
            labelDetails: { description: "filtered_image" },
            kind: CompletionItemKind.Constructor,
          };
          if (src) {
            completion.documentation = {
              kind: MarkupKind.Markdown,
              value: `<img src="${src}" alt="${name}" width="300px" />`,
            };
          }
          if (completion.label && !completions.has(completion.label)) {
            completions.set(completion.label, completion);
          }
        }
      }
    });
    Object.entries(
      program?.compiled?.structDefs?.["layered_image"] || {}
    ).forEach(([, v]) => {
      const name = v.$name;
      if (!name.startsWith("$")) {
        const struct = v as {
          assets: { src?: string }[];
        };
        const src = struct?.assets?.[0]?.src;
        if (struct) {
          const completion: CompletionItem = {
            label: name,
            labelDetails: { description: "layered_image" },
            kind: CompletionItemKind.Constructor,
          };
          if (src) {
            completion.documentation = {
              kind: MarkupKind.Markdown,
              value: `<img src="${src}" alt="${name}" width="300px" />`,
            };
          }
          if (completion.label && !completions.has(completion.label)) {
            completions.set(completion.label, completion);
          }
        }
      }
    });
    Object.entries(program?.compiled?.structDefs?.["image"] || {}).forEach(
      ([, v]) => {
        const name = v.$name;
        if (!name.startsWith("$")) {
          const struct = v as { src?: string };
          const src = struct?.src;
          if (struct) {
            const completion: CompletionItem = {
              label: name,
              labelDetails: { description: "image" },
              kind: CompletionItemKind.Constructor,
            };
            if (src) {
              completion.documentation = {
                kind: MarkupKind.Markdown,
                value: `<img src="${src}" alt="${name}" width="300px" />`,
              };
            }
            if (completion.label && !completions.has(completion.label)) {
              completions.set(completion.label, completion);
            }
          }
        }
      }
    );
  }
  return Array.from(completions.values());
};

const getImageControlCompletions = (
  _program: SparkProgram | undefined
): CompletionItem[] => {
  const completions: Map<string, CompletionItem> = new Map();
  const keywords = IMAGE_CONTROL_KEYWORDS;
  keywords.forEach((label) => {
    const completion = {
      label,
      labelDetails: { description: "control" },
      kind: CompletionItemKind.Keyword,
    };
    if (completion.label && !completions.has(completion.label)) {
      completions.set(completion.label, completion);
    }
  });
  return Array.from(completions.values());
};

const getImageClauseCompletions = (
  _program: SparkProgram | undefined,
  exclude: string[]
): CompletionItem[] | null => {
  const completions: Map<string, CompletionItem> = new Map();
  const keywords = IMAGE_CLAUSE_KEYWORDS;
  keywords.forEach((label) => {
    if (!exclude.includes(label)) {
      const completion = {
        label,
        labelDetails: { description: "clause" },
        kind: CompletionItemKind.Keyword,
      };
      if (completion.label && !completions.has(completion.label)) {
        completions.set(completion.label, completion);
      }
    }
  });
  return Array.from(completions.values());
};

const getFilterCompletions = (
  program: SparkProgram | undefined,
  exclude: string[]
): CompletionItem[] | null => {
  const completions: Map<string, CompletionItem> = new Map();
  Object.entries(program?.compiled?.structDefs?.["filter"] || {}).forEach(
    ([, v]) => {
      const name = v.$name;
      if (!exclude?.includes(name)) {
        if (!name.startsWith("$")) {
          const completion: CompletionItem = {
            label: name,
            labelDetails: { description: "filter" },
            kind: CompletionItemKind.Constructor,
          };
          if (completion.label && !completions.has(completion.label)) {
            completions.set(completion.label, completion);
          }
        }
      }
    }
  );
  return Array.from(completions.values());
};

const getAnimationCompletions = (
  program: SparkProgram | undefined
): CompletionItem[] => {
  const completions: Map<string, CompletionItem> = new Map();
  Object.entries(program?.compiled?.structDefs?.["transition"] || {}).forEach(
    ([, v]) => {
      const name = v.$name;
      if (!name.startsWith("$")) {
        const completion: CompletionItem = {
          label: name,
          labelDetails: { description: "transition" },
          kind: CompletionItemKind.Constructor,
        };
        if (completion.label && !completions.has(completion.label)) {
          completions.set(completion.label, completion);
        }
      }
    }
  );
  Object.entries(program?.compiled?.structDefs?.["animation"] || {}).forEach(
    ([, v]) => {
      const name = v.$name;
      if (!name.startsWith("$")) {
        const completion: CompletionItem = {
          label: name,
          labelDetails: { description: "animation" },
          kind: CompletionItemKind.Constructor,
        };
        if (completion.label && !completions.has(completion.label)) {
          completions.set(completion.label, completion);
        }
      }
    }
  );
  return Array.from(completions.values());
};

const getAudioTargetCompletions = (
  program: SparkProgram | undefined
): CompletionItem[] | null => {
  const completions: Map<string, CompletionItem> = new Map();
  Object.entries(program?.compiled?.structDefs?.["channel"] || {}).forEach(
    ([, v]) => {
      const name = v.$name;
      if (!name.startsWith("$")) {
        const completion: CompletionItem = {
          label: name,
          labelDetails: { description: "channel" },
          kind: CompletionItemKind.Constructor,
        };
        if (completion.label && !completions.has(completion.label)) {
          completions.set(completion.label, completion);
        }
      }
    }
  );
  return Array.from(completions.values());
};

const getAudioNameCompletions = (
  program: SparkProgram | undefined
): CompletionItem[] => {
  const completions: Map<string, CompletionItem> = new Map();
  Object.values(program?.compiled?.structDefs?.["audio"] || {}).forEach((v) => {
    if (!v.name.startsWith("$")) {
      const completion = {
        label: v.name,
        labelDetails: { description: "audio" },
        kind: CompletionItemKind.Constructor,
      };
      if (completion.label && !completions.has(completion.label)) {
        completions.set(completion.label, completion);
      }
    }
  });
  Object.values(program?.compiled?.structDefs?.["layered_audio"] || {}).forEach(
    (v) => {
      if (!v.name.startsWith("$")) {
        const completion = {
          label: v.name,
          labelDetails: { description: "layered_audio" },
          kind: CompletionItemKind.Constructor,
        };
        if (completion.label && !completions.has(completion.label)) {
          completions.set(completion.label, completion);
        }
      }
    }
  );
  Object.values(program?.compiled?.structDefs?.["synth"] || {}).forEach((v) => {
    if (!v.name.startsWith("$")) {
      const completion = {
        label: v.name,
        labelDetails: { description: "synth" },
        kind: CompletionItemKind.Constructor,
      };
      if (completion.label && !completions.has(completion.label)) {
        completions.set(completion.label, completion);
      }
    }
  });
  return Array.from(completions.values());
};

const getAudioControlCompletions = (
  _program: SparkProgram | undefined
): CompletionItem[] => {
  const completions: Map<string, CompletionItem> = new Map();
  const keywords = AUDIO_CONTROL_KEYWORDS;
  keywords.forEach((label) => {
    const completion = {
      label,
      labelDetails: { description: "control" },
      kind: CompletionItemKind.Keyword,
    };
    if (completion.label && !completions.has(completion.label)) {
      completions.set(completion.label, completion);
    }
  });
  return Array.from(completions.values());
};

const getAudioClauseCompletions = (
  _program: SparkProgram | undefined,
  exclude: string[]
): CompletionItem[] | null => {
  const completions: Map<string, CompletionItem> = new Map();
  const keywords = AUDIO_CLAUSE_KEYWORDS;
  keywords.forEach((label) => {
    if (!exclude.includes(label)) {
      const completion = {
        label,
        labelDetails: { description: "clause" },
        kind: CompletionItemKind.Keyword,
      };
      if (completion.label && !completions.has(completion.label)) {
        completions.set(completion.label, completion);
      }
    }
  });
  return Array.from(completions.values());
};

const getModulationCompletions = (
  program: SparkProgram | undefined
): CompletionItem[] => {
  const completions: Map<string, CompletionItem> = new Map();
  Object.entries(program?.compiled?.structDefs?.["modulation"] || {}).forEach(
    ([, v]) => {
      const name = v.$name;
      if (!name.startsWith("$")) {
        const completion: CompletionItem = {
          label: name,
          labelDetails: { description: "modulation" },
          kind: CompletionItemKind.Constructor,
        };
        if (completion.label && !completions.has(completion.label)) {
          completions.set(completion.label, completion);
        }
      }
    }
  );
  return Array.from(completions.values());
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
  if (program?.compiled?.structDefs) {
    Object.entries(program.compiled?.structDefs).forEach(([k, v]) => {
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
  const match = beforeText.match(/([_\p{L}0-9.]+?)$/u);
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
  if (program?.compiled?.structDefs) {
    const props = getProperty(program.compiled?.structDefs, parentPath);
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
  tree: Tree | undefined,
  grammar: Grammar,
  position: Position,
  context: CompletionContext | undefined
): CompletionItem[] | null | undefined => {
  if (!document) {
    return undefined;
  }
  if (!tree) {
    return undefined;
  }

  const side = -1;

  const getNodeType = (node: SyntaxNodeRef) => ({
    name: grammar.nodeNames[node.type] as SparkdownNodeName,
    id: node.type,
  });

  const getNode = (cursor: SyntaxNodeRef | NodeIterator) => {
    const node = "node" in cursor ? cursor.node : cursor;
    return {
      type: getNodeType(node),
      from: node.from,
      to: node.to,
    };
  };

  type Node = ReturnType<typeof getNode>;

  const getOtherMatchesInside = (
    matchTypeName: SparkdownNodeName,
    parentTypeName: SparkdownNodeName,
    stack: Node[]
  ) => {
    const matches = [];
    const current = stack[0];
    const parent = stack.find((n) => n.type.name === parentTypeName);
    if (current && parent) {
      const prevCur = tree.cursorAt(current.from - 1, side);
      while (prevCur.from >= parent.from) {
        const node = getNode(prevCur);
        if (node.type.name === matchTypeName) {
          matches.unshift(
            document.getText({
              start: document.positionAt(node.from),
              end: document.positionAt(node.to),
            })
          );
        }
        prevCur.moveTo(prevCur.from - 1, side);
      }
      const nextCur = tree.cursorAt(current.to + 1, side);
      while (nextCur.to <= parent.to) {
        const node = getNode(nextCur);
        if (node.type.name === matchTypeName) {
          matches.push(
            document.getText({
              start: document.positionAt(node.from),
              end: document.positionAt(node.to),
            })
          );
        }
        nextCur.moveTo(nextCur.to + 1, side);
      }
    }
    return matches;
  };

  const triggerKind = context?.triggerKind;
  const triggerCharacter = context?.triggerCharacter;

  const pos = document.offsetAt(position);
  const stackIterator = tree.resolveStack(pos, side);
  const stack = [] as Node[];
  for (let cur: NodeIterator | null = stackIterator; cur; cur = cur.next) {
    stack.push(getNode(cur));
  }

  console.log(printTree(tree, document.getText(), grammar.nodeNames));
  console.log(
    pos,
    JSON.stringify(triggerCharacter),
    stack.map((n) => n.type.name)
  );

  if (!stack[0]) {
    return null;
  }

  const prevCur = tree.cursorAt(stack[0].from - 1, side);
  const prevNode = getNode(prevCur);
  const prevTypeName = prevNode.type.name;
  const prevText = document.getText({
    start: document.positionAt(prevNode.from),
    end: document.positionAt(prevNode.to),
  });

  // ImageCommand
  if (stack.some((n) => n.type.name === "ImageCommand")) {
    if (stack[0]?.type.name === "ImageCommand_c1") {
      return [
        ...getImageNameCompletions(program),
        ...getImageControlCompletions(program),
      ];
    }
    if (stack[0]?.type.name === "AssetCommandControl") {
      return getImageControlCompletions(program);
    }
    if (stack[0]?.type.name === "WhitespaceAssetCommandTarget") {
      return getImageTargetCompletions(program);
    }
    if (
      stack[0]?.type.name === "WhitespaceAssetCommandName" ||
      stack[0]?.type.name === "AssetCommandName" ||
      stack[0]?.type.name === "AssetCommandFileName"
    ) {
      return getImageNameCompletions(program);
    }
    if (
      stack[0]?.type.name === "AssetCommandFilterOperator" ||
      stack[0]?.type.name === "AssetCommandFilterName"
    ) {
      const exclude = getOtherMatchesInside(
        "AssetCommandFilterName",
        "AssetCommandContent",
        stack
      );
      return getFilterCompletions(program, exclude);
    }
    if (stack[0]?.type.name === "WhitespaceAssetCommandClause") {
      const prevClauseTakesArgument =
        prevTypeName === "AssetCommandClauseKeyword" &&
        (prevText === "after" ||
          prevText === "over" ||
          prevText === "with" ||
          prevText === "fadeto");
      if (!prevClauseTakesArgument) {
        const exclude = getOtherMatchesInside(
          "AssetCommandClauseKeyword",
          "AssetCommandContent",
          stack
        );
        return getImageClauseCompletions(program, exclude);
      }
    }
    if (
      (stack[0]?.type.name === "WhitespaceAssetCommandClause" &&
        prevTypeName === "AssetCommandClauseKeyword" &&
        prevText === "with") ||
      stack[0]?.type.name === "NameValue"
    ) {
      return getAnimationCompletions(program);
    }
  }

  // AudioCommand
  if (stack.some((n) => n.type.name === "AudioCommand")) {
    if (stack[0]?.type.name === "AudioCommand_c1") {
      return [
        ...getAudioNameCompletions(program),
        ...getAudioControlCompletions(program),
      ];
    }
    if (stack[0]?.type.name === "AssetCommandControl") {
      return getAudioControlCompletions(program);
    }
    if (stack[0]?.type.name === "WhitespaceAssetCommandTarget") {
      return getAudioTargetCompletions(program);
    }
    if (
      stack[0]?.type.name === "WhitespaceAssetCommandName" ||
      stack[0]?.type.name === "AssetCommandName" ||
      stack[0]?.type.name === "AssetCommandFileName"
    ) {
      return getAudioNameCompletions(program);
    }
    if (
      stack[0]?.type.name === "AssetCommandFilterOperator" ||
      stack[0]?.type.name === "AssetCommandFilterName"
    ) {
      const exclude = getOtherMatchesInside(
        "AssetCommandFilterName",
        "AssetCommandContent",
        stack
      );
      return getFilterCompletions(program, exclude);
    }
    if (stack[0]?.type.name === "WhitespaceAssetCommandClause") {
      const prevClauseTakesArgument =
        prevTypeName === "AssetCommandClauseKeyword" &&
        (prevText === "after" ||
          prevText === "over" ||
          prevText === "with" ||
          prevText === "fadeto");
      if (!prevClauseTakesArgument) {
        const exclude = getOtherMatchesInside(
          "AssetCommandClauseKeyword",
          "AssetCommandContent",
          stack
        );
        return getAudioClauseCompletions(program, exclude);
      }
    }
    if (
      (stack[0]?.type.name === "WhitespaceAssetCommandClause" &&
        prevTypeName === "AssetCommandClauseKeyword" &&
        prevText === "with") ||
      stack[0]?.type.name === "NameValue"
    ) {
      return getModulationCompletions(program);
    }
  }

  // const line = position?.line;
  // const lineText = getLineText(document, position);
  // const prevLineText = getLineText(document, position, -1);
  // const nextLineText = getLineText(document, position, 1);
  // const beforeText = getLineTextBefore(document, position);
  // const afterText = getLineTextAfter(document, position);
  // const trimmedBeforeText = beforeText.trim();
  // const trimmedAfterText = afterText.trim();
  // const trimmedStartBeforeText = beforeText.trimStart();
  // const lineMetadata = program?.metadata?.lines?.[line];
  // const scopes = lineMetadata?.scopes;

  // console.log(triggerCharacter, lineMetadata, JSON.stringify(beforeText));

  // if (scopes) {
  //   if (
  //     scopes.includes("action") &&
  //     scopes.includes("text") &&
  //     isEmptyLine(prevLineText) &&
  //     isEmptyLine(nextLineText) &&
  //     !trimmedBeforeText &&
  //     !trimmedAfterText
  //   ) {
  //     return getCharacterCompletions(position.line, program);
  //   }
  //   if (
  //     scopes.includes("dialogue") &&
  //     scopes.includes("dialogue_character_name") &&
  //     !trimmedAfterText
  //   ) {
  //     return getCharacterCompletions(
  //       position.line,
  //       program,
  //       trimmedStartBeforeText
  //     );
  //   }
  //   if (scopes.includes("access_path")) {
  //     return getAccessPathCompletions(program, beforeText);
  //   }
  //   if (
  //     (trimmedBeforeText === "define" ||
  //       trimmedBeforeText === "store" ||
  //       trimmedBeforeText === "set") &&
  //     !trimmedAfterText
  //   ) {
  //     return getTypeOrNameCompletions(program);
  //   }
  //   if (
  //     scopes.includes("struct_map_property_start") &&
  //     scopes.includes("property_name")
  //   ) {
  //     const defineToken = getLineToken(program, line, "define");
  //     const structMapPropertyToken = getLineToken(
  //       program,
  //       line,
  //       "struct_map_property"
  //     );
  //     if (defineToken?.name) {
  //       const variable = program?.variables?.[defineToken.name];
  //       if (variable && !beforeText.includes(":")) {
  //         return getStructMapPropertyNameCompletions(
  //           program,
  //           variable.type,
  //           variable.fields,
  //           structMapPropertyToken?.path ?? "",
  //           beforeText
  //         );
  //       }
  //     }
  //   }
  //   if (scopes.includes("struct_blank_property") && !triggerCharacter) {
  //     const defineToken = getLineToken(program, line, "define");
  //     const structBlankPropertyToken = getLineToken(
  //       program,
  //       line,
  //       "struct_blank_property"
  //     );
  //     if (defineToken?.name) {
  //       const variable = program?.variables?.[defineToken.name];
  //       if (variable && !beforeText.includes(":")) {
  //         return getStructMapPropertyNameCompletions(
  //           program,
  //           variable.type,
  //           variable.fields,
  //           structBlankPropertyToken?.path ?? "",
  //           beforeText
  //         );
  //       }
  //     }
  //   }
  // }
  return undefined;
};

export default getCompletions;

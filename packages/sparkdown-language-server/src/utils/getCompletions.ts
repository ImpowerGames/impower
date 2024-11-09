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
import { SparkLocation } from "@impower/sparkdown/src/types/SparkLocation";

const IMAGE_CONTROL_KEYWORDS =
  GRAMMAR_DEFINITION.variables.IMAGE_CONTROL_KEYWORDS;
const AUDIO_CONTROL_KEYWORDS =
  GRAMMAR_DEFINITION.variables.AUDIO_CONTROL_KEYWORDS;
const IMAGE_CLAUSE_KEYWORDS =
  GRAMMAR_DEFINITION.variables.IMAGE_CLAUSE_KEYWORDS;
const AUDIO_CLAUSE_KEYWORDS =
  GRAMMAR_DEFINITION.variables.AUDIO_CLAUSE_KEYWORDS;

const addTextTargetCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined,
  insertTextPrefix = ""
) => {
  for (const [, v] of Object.entries(
    program?.compiled?.structDefs?.["ui"] || {}
  )) {
    traverse(v, (fieldPath) => {
      if (fieldPath.endsWith(".text")) {
        const layer = fieldPath.split(".").at(-2);
        if (layer) {
          const completion: CompletionItem = {
            label: layer,
            insertText: insertTextPrefix + layer,
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
};

const addImageTargetCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined
) => {
  for (const [, v] of Object.entries(
    program?.compiled?.structDefs?.["ui"] || {}
  )) {
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
};

const addImageNameCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined
) => {
  if (program) {
    for (const [name, v] of Object.entries(
      program?.compiled?.structDefs?.["filtered_image"] || {}
    )) {
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
    }
    for (const [name, v] of Object.entries(
      program?.compiled?.structDefs?.["layered_image"] || {}
    )) {
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
    }
    for (const [name, v] of Object.entries(
      program?.compiled?.structDefs?.["image"] || {}
    )) {
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
  }
};

const addImageControlCompletions = (
  completions: Map<string, CompletionItem>,
  _program: SparkProgram | undefined
) => {
  const keywords = IMAGE_CONTROL_KEYWORDS;
  for (const keyword of keywords) {
    const completion: CompletionItem = {
      label: keyword,
      labelDetails: { description: "control" },
      kind: CompletionItemKind.Keyword,
    };
    if (completion.label && !completions.has(completion.label)) {
      completions.set(completion.label, completion);
    }
  }
};

const addImageClauseCompletions = (
  completions: Map<string, CompletionItem>,
  _program: SparkProgram | undefined,
  exclude?: string[]
) => {
  const keywords = IMAGE_CLAUSE_KEYWORDS;
  for (const keyword of keywords) {
    if (!exclude || !exclude.includes(keyword)) {
      const completion: CompletionItem = {
        label: keyword,
        labelDetails: { description: "clause" },
        kind: CompletionItemKind.Keyword,
      };
      if (completion.label && !completions.has(completion.label)) {
        completions.set(completion.label, completion);
      }
    }
  }
};

const addFilterCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined,
  exclude?: string[]
) => {
  for (const [name] of Object.entries(
    program?.compiled?.structDefs?.["filter"] || {}
  )) {
    if (!exclude || !exclude?.includes(name)) {
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
};

const addAnimationCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined
) => {
  for (const [name] of Object.entries(
    program?.compiled?.structDefs?.["transition"] || {}
  )) {
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
  for (const [name] of Object.entries(
    program?.compiled?.structDefs?.["animation"] || {}
  )) {
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
};

const addAudioTargetCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined
) => {
  for (const [name] of Object.entries(
    program?.compiled?.structDefs?.["channel"] || {}
  )) {
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
};

const addAudioNameCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined
) => {
  for (const [name] of Object.entries(
    program?.compiled?.structDefs?.["audio"] || {}
  )) {
    if (!name.startsWith("$")) {
      const completion: CompletionItem = {
        label: name,
        labelDetails: { description: "audio" },
        kind: CompletionItemKind.Constructor,
      };
      if (completion.label && !completions.has(completion.label)) {
        completions.set(completion.label, completion);
      }
    }
  }
  for (const [name] of Object.entries(
    program?.compiled?.structDefs?.["layered_audio"] || {}
  )) {
    if (!name.startsWith("$")) {
      const completion: CompletionItem = {
        label: name,
        labelDetails: { description: "layered_audio" },
        kind: CompletionItemKind.Constructor,
      };
      if (completion.label && !completions.has(completion.label)) {
        completions.set(completion.label, completion);
      }
    }
  }
  for (const [name] of Object.entries(
    program?.compiled?.structDefs?.["synth"] || {}
  )) {
    if (!name.startsWith("$")) {
      const completion: CompletionItem = {
        label: name,
        labelDetails: { description: "synth" },
        kind: CompletionItemKind.Constructor,
      };
      if (completion.label && !completions.has(completion.label)) {
        completions.set(completion.label, completion);
      }
    }
  }
};

const addAudioControlCompletions = (
  completions: Map<string, CompletionItem>,
  _program: SparkProgram | undefined
) => {
  const keywords = AUDIO_CONTROL_KEYWORDS;
  for (const keyword of keywords) {
    const completion = {
      label: keyword,
      labelDetails: { description: "control" },
      kind: CompletionItemKind.Keyword,
    };
    if (completion.label && !completions.has(completion.label)) {
      completions.set(completion.label, completion);
    }
  }
};

const addAudioClauseCompletions = (
  completions: Map<string, CompletionItem>,
  _program: SparkProgram | undefined,
  exclude?: string[]
) => {
  const keywords = AUDIO_CLAUSE_KEYWORDS;
  for (const keyword of keywords) {
    if (!exclude || !exclude.includes(keyword)) {
      const completion = {
        label: keyword,
        labelDetails: { description: "clause" },
        kind: CompletionItemKind.Keyword,
      };
      if (completion.label && !completions.has(completion.label)) {
        completions.set(completion.label, completion);
      }
    }
  }
};

const addModulationCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined
) => {
  for (const [name] of Object.entries(
    program?.compiled?.structDefs?.["modulation"] || {}
  )) {
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
};

const getClosestLineBefore = (
  locations: SparkLocation[],
  uri: string,
  line: number
) => {
  let numLinesBefore: number | undefined = undefined;
  let closestLineBefore: number | undefined = undefined;
  for (const location of locations) {
    if (location.uri === uri) {
      const d = location.range.start.line - line;
      if (d < 0) {
        if (numLinesBefore === undefined || Math.abs(d) < numLinesBefore) {
          numLinesBefore = Math.abs(d);
          closestLineBefore = location.range.start.line;
        }
      }
    }
  }
  return closestLineBefore;
};

const rankDistance = (
  a: [string, SparkLocation[]],
  b: [string, SparkLocation[]],
  uri: string,
  line: number
) => {
  const [, aLocations] = a;
  const aClosestLineBefore = getClosestLineBefore(aLocations, uri, line);
  const aDistance =
    aClosestLineBefore === undefined ? 0 : Math.abs(aClosestLineBefore - line);
  const [, bLocations] = b;
  const bClosestLineBefore = getClosestLineBefore(bLocations, uri, line);
  const bDistance =
    bClosestLineBefore === undefined ? 0 : Math.abs(bClosestLineBefore - line);
  return aDistance - bDistance;
};

const addTransitionCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined,
  uri: string,
  line: number,
  insertTextPrefix: string = ""
) => {
  // Sort by most recently used
  const mostRecentEntries = Object.entries(
    program?.metadata?.transitions || {}
  ).sort((a, b) => rankDistance(a, b, uri, line));
  // Add completions
  for (const [name] of mostRecentEntries) {
    const labelDetails = { description: "transition" };
    const kind = CompletionItemKind.Constant;
    const completion: CompletionItem = {
      label: name,
      insertText: insertTextPrefix + name + "\n\n",
      labelDetails,
      kind,
    };
    if (completion.label && !completions.has(completion.label)) {
      completions.set(completion.label, completion);
    }
  }
};

const addSceneCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined,
  uri: string,
  line: number,
  insertTextPrefix: string = ""
) => {
  // Sort by most recently used
  const mostRecentEntries = Object.entries(
    program?.metadata?.scenes || {}
  ).sort((a, b) => rankDistance(a, b, uri, line));
  // Most recent scene is the least likely to be used again,
  // So move it to the end of the list
  const mostRecentEntry = mostRecentEntries.shift();
  if (mostRecentEntry) {
    mostRecentEntries.push(mostRecentEntry);
  }
  // Add completions
  for (const [name] of mostRecentEntries) {
    const labelDetails = { description: "scene" };
    const kind = CompletionItemKind.Constant;
    const completion: CompletionItem = {
      label: name,
      insertText: insertTextPrefix + name + "\n\n",
      labelDetails,
      kind,
    };
    if (completion.label && !completions.has(completion.label)) {
      completions.set(completion.label, completion);
    }
  }
};

const addCharacterCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined,
  uri: string,
  line: number,
  insertTextPrefix: string = ""
) => {
  // Sort by most recently used
  const mostRecentEntries = Object.entries(
    program?.metadata?.characters || {}
  ).sort((a, b) => rankDistance(a, b, uri, line));
  // Most recent character is the least likely to be used again,
  // So move it to the end of the list
  const mostRecentEntry = mostRecentEntries.shift();
  if (mostRecentEntry) {
    mostRecentEntries.push(mostRecentEntry);
  }
  // Add completions
  for (const [name] of mostRecentEntries) {
    const labelDetails = { description: "character" };
    const kind = CompletionItemKind.Constant;
    const completion: CompletionItem = {
      label: name,
      insertText: insertTextPrefix + name + "\n",
      labelDetails,
      kind,
    };
    if (completion.label && !completions.has(completion.label)) {
      completions.set(completion.label, completion);
    }
  }
};

const addStructMapPropertyNameCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined,
  type: string,
  fields: SparkField[] | undefined,
  path: string,
  beforeText: string
) => {
  if (type) {
    const parentObj = program?.variables?.[type]?.compiled;
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
            const completion: CompletionItem = {
              label: name,
              insertText: name + insertSuffix,
              labelDetails: { description },
              kind: CompletionItemKind.Property,
              insertTextMode: InsertTextMode.asIs,
            };
            if (completion.label && !completions.has(completion.label)) {
              completions.set(completion.label, completion);
            }
          }
        }
      }
    });
  }
};

const addTypeOrNameCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined
) => {
  if (program?.compiled?.structDefs) {
    Object.entries(program.compiled?.structDefs).forEach(([k, v]) => {
      if (isIdentifier(k)) {
        const description = typeof v === "object" ? undefined : typeof v;
        const sortText = typeof v !== "object" ? "0" : "1";
        const kind =
          typeof v === "object"
            ? CompletionItemKind.TypeParameter
            : CompletionItemKind.Variable;
        const completion: CompletionItem = {
          label: k,
          labelDetails: { description },
          kind,
          insertTextMode: InsertTextMode.asIs,
          sortText,
        };
        if (completion.label && !completions.has(completion.label)) {
          completions.set(completion.label, completion);
        }
      }
    });
  }
};

const addAccessPathCompletions = (
  completions: Map<string, CompletionItem>,
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
            const completion: CompletionItem = {
              label: k,
              labelDetails: { description },
              kind,
              insertTextMode: InsertTextMode.asIs,
            };
            if (completion.label && !completions.has(completion.label)) {
              completions.set(completion.label, completion);
            }
          }
        }
      });
    }
  }
};

const getCompletions = (
  document: TextDocument | undefined,
  program: SparkProgram | undefined,
  tree: Tree | undefined,
  grammar: Grammar,
  position: Position,
  _context: CompletionContext | undefined
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

  const completions: Map<string, CompletionItem> = new Map();

  const pos = document.offsetAt(position);
  const stackIterator = tree.resolveStack(pos, side);
  const stack = [] as Node[];
  for (let cur: NodeIterator | null = stackIterator; cur; cur = cur.next) {
    stack.push(getNode(cur));
  }

  // console.log(printTree(tree, document.getText(), grammar.nodeNames));
  // console.log(stack.map((n) => n.type.name));

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

  // Transition
  if (stack[0]?.type.name === "TransitionMark") {
    addTransitionCompletions(
      completions,
      program,
      document.uri,
      position.line,
      " "
    );
    return Array.from(completions.values());
  }
  if (
    stack[0]?.type.name === "TransitionMarkSeparator" ||
    stack.some((n) => n?.type.name === "Transition_content")
  ) {
    addTransitionCompletions(completions, program, document.uri, position.line);
    return Array.from(completions.values());
  }

  // Scene
  if (stack[0]?.type.name === "SceneMark") {
    addSceneCompletions(completions, program, document.uri, position.line, " ");
    return Array.from(completions.values());
  }
  if (
    stack[0]?.type.name === "SceneMarkSeparator" ||
    stack.some((n) => n?.type.name === "Scene_content")
  ) {
    addSceneCompletions(completions, program, document.uri, position.line);
    return Array.from(completions.values());
  }

  // Dialogue
  if (stack[0]?.type.name === "DialogueMark") {
    addCharacterCompletions(
      completions,
      program,
      document.uri,
      position.line,
      " "
    );
    return Array.from(completions.values());
  }
  if (
    stack[0]?.type.name === "DialogueMarkSeparator" ||
    stack.some((n) => n?.type.name === "DialogueCharacter")
  ) {
    addCharacterCompletions(completions, program, document.uri, position.line);
    return Array.from(completions.values());
  }

  // Write
  if (stack[0]?.type.name === "WriteMark") {
    addTextTargetCompletions(completions, program, " ");
    return Array.from(completions.values());
  }
  if (
    stack[0]?.type.name === "WriteMarkSeparator" ||
    stack.some((n) => n?.type.name === "WriteTarget")
  ) {
    addTextTargetCompletions(completions, program);
    return Array.from(completions.values());
  }

  // ImageCommand
  if (stack.some((n) => n.type.name === "ImageCommand")) {
    if (stack[0]?.type.name === "ImageCommand_c1") {
      addImageControlCompletions(completions, program);
      addImageNameCompletions(completions, program);
      return Array.from(completions.values());
    }
    if (stack[0]?.type.name === "AssetCommandControl") {
      addImageControlCompletions(completions, program);
      return Array.from(completions.values());
    }
    if (stack[0]?.type.name === "WhitespaceAssetCommandTarget") {
      addImageTargetCompletions(completions, program);
      return Array.from(completions.values());
    }
    if (stack[0]?.type.name === "WhitespaceAssetCommandName") {
      addImageNameCompletions(completions, program);
      addImageClauseCompletions(completions, program);
      return Array.from(completions.values());
    }
    if (
      stack[0]?.type.name === "AssetCommandName" ||
      stack[0]?.type.name === "AssetCommandFileName"
    ) {
      addImageNameCompletions(completions, program);
      return Array.from(completions.values());
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
      addFilterCompletions(completions, program, exclude);
      return Array.from(completions.values());
    }
    if (
      (stack[0]?.type.name === "WhitespaceAssetCommandClause" &&
        prevTypeName === "AssetCommandClauseKeyword" &&
        prevText === "with") ||
      stack[0]?.type.name === "NameValue"
    ) {
      addAnimationCompletions(completions, program);
      return Array.from(completions.values());
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
        addImageClauseCompletions(completions, program, exclude);
      }
      return Array.from(completions.values());
    }
  }

  // AudioCommand
  if (stack.some((n) => n.type.name === "AudioCommand")) {
    if (stack[0]?.type.name === "AudioCommand_c1") {
      addAudioControlCompletions(completions, program);
      addAudioNameCompletions(completions, program);
      return Array.from(completions.values());
    }
    if (stack[0]?.type.name === "AssetCommandControl") {
      addAudioControlCompletions(completions, program);
      return Array.from(completions.values());
    }
    if (stack[0]?.type.name === "WhitespaceAssetCommandTarget") {
      addAudioTargetCompletions(completions, program);
      return Array.from(completions.values());
    }
    if (stack[0]?.type.name === "WhitespaceAssetCommandName") {
      addAudioNameCompletions(completions, program);
      addAudioClauseCompletions(completions, program);
      return Array.from(completions.values());
    }
    if (
      stack[0]?.type.name === "AssetCommandName" ||
      stack[0]?.type.name === "AssetCommandFileName"
    ) {
      addAudioNameCompletions(completions, program);
      return Array.from(completions.values());
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
      addFilterCompletions(completions, program, exclude);
      return Array.from(completions.values());
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
        addAudioClauseCompletions(completions, program, exclude);
        return Array.from(completions.values());
      }
    }
    if (
      (stack[0]?.type.name === "WhitespaceAssetCommandClause" &&
        prevTypeName === "AssetCommandClauseKeyword" &&
        prevText === "with") ||
      stack[0]?.type.name === "NameValue"
    ) {
      addModulationCompletions(completions, program);
      return Array.from(completions.values());
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

import {
  Command,
  CompletionContext,
  CompletionItem,
  CompletionItemKind,
  InsertTextMode,
  MarkupKind,
  Position,
} from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import type { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import getProperty from "@impower/sparkdown/src/utils/getProperty";
import isIdentifier from "@impower/sparkdown/src/utils/isIdentifier";

import type {
  NodeIterator,
  Tree,
  SyntaxNode,
} from "../../../grammar-compiler/src/compiler/classes/Tree";
import { printTree } from "../../../grammar-compiler/src/compiler/utils/printTree";

import { SparkdownNodeName } from "@impower/sparkdown/src/types/SparkdownNodeName";
import GRAMMAR_DEFINITION from "@impower/sparkdown/language/sparkdown.language-grammar.json";
import { SparkLocation } from "@impower/sparkdown/src/types/SparkLocation";
import getLineText from "./getLineText";

const IMAGE_CONTROL_KEYWORDS =
  GRAMMAR_DEFINITION.variables.IMAGE_CONTROL_KEYWORDS;
const AUDIO_CONTROL_KEYWORDS =
  GRAMMAR_DEFINITION.variables.AUDIO_CONTROL_KEYWORDS;
const IMAGE_CLAUSE_KEYWORDS =
  GRAMMAR_DEFINITION.variables.IMAGE_CLAUSE_KEYWORDS;
const AUDIO_CLAUSE_KEYWORDS =
  GRAMMAR_DEFINITION.variables.AUDIO_CLAUSE_KEYWORDS;

const traverse = <T>(
  obj: T,
  process: (fieldPath: string, fieldValue: any) => void,
  fieldPath: string = ""
) => {
  if (obj) {
    for (let [k, v] of Object.entries(obj)) {
      const path = `${fieldPath}.${k}`;
      if (
        typeof v === "object" &&
        v &&
        !("$name" in v) &&
        Object.keys(v).length > 0
      ) {
        traverse(v, process, path);
      } else {
        process(path, v);
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
      insertText: insertTextPrefix + name + "\n",
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
      insertText: insertTextPrefix + name + "\n",
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

const addTextTargetCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined,
  insertTextPrefix = ""
) => {
  for (const [, v] of Object.entries(program?.context?.["ui"] || {})) {
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
  for (const [, v] of Object.entries(program?.context?.["ui"] || {})) {
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
      program?.context?.["filtered_image"] || {}
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
      program?.context?.["layered_image"] || {}
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
    for (const [name, v] of Object.entries(program?.context?.["image"] || {})) {
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
  for (const [name] of Object.entries(program?.context?.["filter"] || {})) {
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
  for (const [name] of Object.entries(program?.context?.["transition"] || {})) {
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
  for (const [name] of Object.entries(program?.context?.["animation"] || {})) {
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
  for (const [name] of Object.entries(program?.context?.["channel"] || {})) {
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
  for (const [name] of Object.entries(program?.context?.["audio"] || {})) {
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
    program?.context?.["layered_audio"] || {}
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
  for (const [name] of Object.entries(program?.context?.["synth"] || {})) {
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
  for (const [name] of Object.entries(program?.context?.["modulation"] || {})) {
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

const addStructTypeNameCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined
) => {
  if (program?.context) {
    for (const k of Object.keys(program?.context).sort()) {
      if (
        !k.startsWith("$") &&
        !program?.compiled?.structDefs?.[k]?.["$default"]
      ) {
        const description = undefined;
        const kind = CompletionItemKind.TypeParameter;
        const completion: CompletionItem = {
          label: k,
          labelDetails: { description },
          kind,
        };
        if (completion.label && !completions.has(completion.label)) {
          completions.set(completion.label, completion);
        }
      }
    }
  }
};

const addStructVariableNameCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined,
  type: string
) => {
  if (program?.context?.[type]) {
    for (const k of Object.keys(program?.context?.[type]).sort()) {
      if (!k.startsWith("$") && !program?.compiled?.structDefs?.[type]?.[k]) {
        const description = undefined;
        const kind = CompletionItemKind.Variable;
        const completion: CompletionItem = {
          label: k,
          labelDetails: { description },
          kind,
        };
        if (completion.label && !completions.has(completion.label)) {
          completions.set(completion.label, completion);
        }
      }
    }
  }
};

const getTypeName = (v: unknown): string | undefined => {
  if (v && typeof v === "object" && Array.isArray(v)) {
    return undefined;
  }
  if (
    v &&
    typeof v === "object" &&
    "$type" in v &&
    v.$type &&
    typeof v.$type === "string"
  ) {
    return v.$type;
  }
  return typeof v;
};

const getTypeKind = (v: unknown): CompletionItemKind | undefined => {
  if (v && typeof v === "object" && Array.isArray(v)) {
    return undefined;
  }
  if (
    v &&
    typeof v === "object" &&
    "$type" in v &&
    v.$type &&
    typeof v.$type === "string"
  ) {
    return CompletionItemKind.Constructor;
  }
  if (typeof v === "string") {
    return CompletionItemKind.Text;
  }
  if (typeof v === "number") {
    return CompletionItemKind.Unit;
  }
  return undefined;
};

const addContextStructPropertyNameCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined,
  definitions: {
    builtinDefinitions?: { [type: string]: { [name: string]: any } };
    optionalDefinitions?: { [type: string]: { [name: string]: any } };
    schemaDefinitions?: { [type: string]: { [name: string]: any } };
    descriptionDefinitions?: { [type: string]: { [name: string]: any } };
  },
  type: string,
  name: string,
  path: string,
  lineText: string,
  existingProps: Set<string>,
  possibleNames: Set<string>
) => {
  const relativePath = path.startsWith(".") ? path : `.${path}`;
  const indentLength = lineText.length - lineText.trimStart().length;
  const indentedStr = lineText.slice(0, indentLength) + "  ";
  if (type) {
    const contextStruct =
      program?.context?.[type]?.[name] ??
      definitions?.optionalDefinitions?.[type]?.[name];
    if (contextStruct) {
      const pathPrefix = contextStruct["$recursive"]
        ? "."
        : relativePath.slice(0, relativePath.lastIndexOf(".") + 1);
      traverse(contextStruct, (p: string) => {
        if (p.startsWith(pathPrefix)) {
          const [name] = p.slice(pathPrefix.length).split(".");
          const optionValue = getProperty(contextStruct, pathPrefix + name);
          const description = getTypeName(optionValue);
          if (name && Number.isNaN(Number(name))) {
            if (
              !existingProps.has(p) &&
              !possibleNames.has(name) &&
              !name.startsWith("$")
            ) {
              possibleNames.add(name);
              const isScalarAssignment =
                !optionValue ||
                typeof optionValue !== "object" ||
                "$type" in optionValue ||
                "$name" in optionValue;
              const arrayDash = Array.isArray(optionValue) ? "- " : "";
              const insertSuffix = isScalarAssignment
                ? " = "
                : `:\n${indentedStr}${arrayDash}`;
              const completion: CompletionItem = {
                label: name,
                insertText: name + insertSuffix,
                labelDetails: { description },
                kind: CompletionItemKind.Property,
                insertTextMode: InsertTextMode.asIs,
                command: Command.create(
                  "suggest",
                  "editor.action.triggerSuggest"
                ),
              };
              if (completion.label && !completions.has(completion.label)) {
                completions.set(completion.label, completion);
              }
            }
          }
        }
      });
    }
  }
};

const addStructPropertyNameCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined,
  definitions: {
    builtinDefinitions?: { [type: string]: { [name: string]: any } };
    optionalDefinitions?: { [type: string]: { [name: string]: any } };
    schemaDefinitions?: { [type: string]: { [name: string]: any } };
    descriptionDefinitions?: { [type: string]: { [name: string]: any } };
  },
  type: string,
  name: string,
  path: string,
  lineText: string
) => {
  if (type) {
    const existingProps = new Set<string>();
    const possibleNames = new Set<string>();
    const definedStruct = program?.compiled?.structDefs?.[type]?.[name];
    if (definedStruct) {
      traverse(definedStruct, (fieldPath: string) => {
        existingProps.add(fieldPath);
      });
    }
    addContextStructPropertyNameCompletions(
      completions,
      program,
      definitions,
      type,
      "$default",
      path,
      lineText,
      existingProps,
      possibleNames
    );
    addContextStructPropertyNameCompletions(
      completions,
      program,
      definitions,
      type,
      "$optional",
      path,
      lineText,
      existingProps,
      possibleNames
    );
  }
};

const addContextStructPropertyValueReferenceCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined,
  definitions: {
    builtinDefinitions?: { [type: string]: { [name: string]: any } };
    optionalDefinitions?: { [type: string]: { [name: string]: any } };
    schemaDefinitions?: { [type: string]: { [name: string]: any } };
    descriptionDefinitions?: { [type: string]: { [name: string]: any } };
  },
  type: string,
  name: string,
  path: string
) => {
  const relativePath = path.startsWith(".") ? path : `.${path}`;
  if (type) {
    const contextStruct =
      program?.context?.[type]?.[name] ??
      definitions?.optionalDefinitions?.[type]?.[name];
    if (contextStruct) {
      const value = getProperty(contextStruct, relativePath);
      const description = getTypeName(value);
      const kind = getTypeKind(value);
      if (
        value &&
        typeof value === "object" &&
        "$type" in value &&
        typeof value.$type === "string"
      ) {
        const names: string[] = Object.keys(
          program?.context?.[value.$type] || {}
        );
        for (const name of names) {
          if (!name.startsWith("$")) {
            const completion: CompletionItem = {
              label: name,
              insertText: name,
              labelDetails: { description },
              kind,
            };
            if (completion.label && !completions.has(completion.label)) {
              completions.set(completion.label, completion);
            }
          }
        }
      }
    }
  }
};

const addStructPropertyValueCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined,
  definitions: {
    builtinDefinitions?: { [type: string]: { [name: string]: any } };
    optionalDefinitions?: { [type: string]: { [name: string]: any } };
    schemaDefinitions?: { [type: string]: { [name: string]: any } };
    descriptionDefinitions?: { [type: string]: { [name: string]: any } };
  },
  type: string,
  name: string,
  path: string
) => {
  if (type) {
    addContextStructPropertyValueReferenceCompletions(
      completions,
      program,
      definitions,
      type,
      "$default",
      path
    );
    addContextStructPropertyValueReferenceCompletions(
      completions,
      program,
      definitions,
      type,
      "$optional",
      path
    );
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
  definitions: {
    builtinDefinitions?: { [type: string]: { [name: string]: any } };
    optionalDefinitions?: { [type: string]: { [name: string]: any } };
    schemaDefinitions?: { [type: string]: { [name: string]: any } };
    descriptionDefinitions?: { [type: string]: { [name: string]: any } };
  },
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

  const getNodeText = (node: SyntaxNode | null | undefined) => {
    if (node == null) {
      return "";
    }
    return document.getText({
      start: document.positionAt(node.from),
      end: document.positionAt(node.to),
    });
  };

  const getDescendent = (
    descendentTypeName: SparkdownNodeName,
    parent: SyntaxNode
  ) => {
    if (parent) {
      const cur = parent?.node.cursor();
      while (cur.from <= parent.to) {
        if (cur.node.type.name === descendentTypeName) {
          return cur.node;
        }
        cur?.next();
      }
    }
    return undefined;
  };

  const getDescendentInsideParent = (
    descendentTypeName: SparkdownNodeName,
    parentTypeName: SparkdownNodeName,
    stack: SyntaxNode[]
  ) => {
    const parent = stack.find((n) => n.type.name === parentTypeName);
    if (parent) {
      const cur = parent?.node.cursor();
      while (cur.from <= parent.to) {
        if (cur.node.type.name === descendentTypeName) {
          return cur.node;
        }
        cur?.next();
      }
    }
    return undefined;
  };

  const getOtherMatchesInsideParent = (
    matchTypeName: SparkdownNodeName,
    parentTypeName: SparkdownNodeName,
    stack: SyntaxNode[]
  ) => {
    const matches = [];
    const current = stack[0];
    const parent = stack.find((n) => n.type.name === parentTypeName);
    if (current && parent) {
      const prevCur = tree.cursorAt(current.from - 1, side);
      while (prevCur.from >= parent.from) {
        const node = prevCur.node;
        if (node.type.name === matchTypeName) {
          matches.unshift(getNodeText(node));
        }
        prevCur.moveTo(prevCur.from - 1, side);
      }
      const nextCur = tree.cursorAt(current.to + 1, side);
      while (nextCur.to <= parent.to) {
        const node = nextCur.node;
        if (node.type.name === matchTypeName) {
          matches.push(getNodeText(node));
        }
        nextCur.moveTo(nextCur.to + 1, side);
      }
    }
    return matches;
  };

  const getParentPropertyPath = (propertyNameNode: SyntaxNode) => {
    let stackCursor: SyntaxNode | null = propertyNameNode.node;
    let path = "";
    while (stackCursor) {
      if (stackCursor.type.name === "StructObjectItemBlock") {
        path = "0" + "." + path;
      }
      if (
        stackCursor.type.name === "StructObjectItemWithInlineScalarProperty"
      ) {
        path = "0" + "." + path;
      }
      if (
        stackCursor.type.name === "StructObjectItemWithInlineObjectProperty"
      ) {
        path = "0" + "." + path;
        const beginNode = stackCursor.getChild(
          "StructObjectItemWithInlineObjectProperty_begin"
        );
        if (beginNode) {
          const nameNode = getDescendent(
            "DeclarationObjectPropertyName",
            beginNode
          );
          if (nameNode && nameNode.from !== propertyNameNode.from) {
            path = getNodeText(nameNode) + "." + path;
          }
        }
      }
      if (stackCursor.type.name === "StructObjectProperty") {
        const beginNode = stackCursor.getChild("StructObjectProperty_begin");
        if (beginNode) {
          const nameNode = getDescendent(
            "DeclarationObjectPropertyName",
            beginNode
          );
          if (nameNode && nameNode.from !== propertyNameNode.from) {
            path = getNodeText(nameNode) + "." + path;
          }
        }
      }
      stackCursor = stackCursor.node.parent;
    }
    return path;
  };

  const completions: Map<string, CompletionItem> = new Map();

  const lineText = getLineText(document, position);
  const pos = document.offsetAt(position);
  const stackIterator = tree.resolveStack(pos, side);
  const stack = [] as SyntaxNode[];
  for (let cur: NodeIterator | null = stackIterator; cur; cur = cur.next) {
    stack.push(cur.node);
  }

  // console.log(printTree(tree, document.getText()));
  console.log(stack.map((n) => n.type.name));

  if (!stack[0]) {
    return null;
  }

  const prevCur = tree.cursorAt(stack[0].from - 1, side);
  const prevNode = prevCur.node;
  const prevTypeName = prevNode.type.name;
  const prevText = getNodeText(prevNode);

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
      const exclude = getOtherMatchesInsideParent(
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
        const exclude = getOtherMatchesInsideParent(
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
      const exclude = getOtherMatchesInsideParent(
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
        const exclude = getOtherMatchesInsideParent(
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

  // Define
  if (
    stack.some(
      (n) =>
        n.type.name === "WhitespaceDefineTypeName" ||
        n.type.name === "DefineTypeName"
    )
  ) {
    addStructTypeNameCompletions(completions, program);
    return Array.from(completions.values());
  }
  if (
    stack.some(
      (n) =>
        n.type.name === "DefinePunctuationAccessor" ||
        n.type.name === "WhitespaceDefineVariableName" ||
        n.type.name === "DefineVariableName"
    )
  ) {
    const defineTypeNameNode = getDescendentInsideParent(
      "DefineTypeName",
      "DefineDeclaration",
      stack
    );
    const type = defineTypeNameNode ? getNodeText(defineTypeNameNode) : "";
    addStructVariableNameCompletions(completions, program, type);
    return Array.from(completions.values());
  }
  const propertyNameNode = stack.find(
    (n) =>
      n.type.name === "StructBlankProperty" ||
      n.type.name === "DeclarationObjectPropertyName" ||
      n.type.name === "DeclarationScalarPropertyName" ||
      n.type.name === "StructObjectItemBlock"
  );
  if (
    propertyNameNode &&
    document.positionAt(propertyNameNode.from).line === position.line
  ) {
    const defineTypeNameNode = getDescendentInsideParent(
      "DefineTypeName",
      "DefineDeclaration",
      stack
    );
    const defineVariableNameNode = getDescendentInsideParent(
      "DefineVariableName",
      "DefineDeclaration",
      stack
    );
    const type = defineTypeNameNode ? getNodeText(defineTypeNameNode) : "";
    const name = defineVariableNameNode
      ? getNodeText(defineVariableNameNode)
      : "";
    const path = getParentPropertyPath(propertyNameNode);
    addStructPropertyNameCompletions(
      completions,
      program,
      definitions,
      type,
      name,
      path,
      lineText
    );
    return Array.from(completions.values());
  }
  if (
    stack.some(
      (n) =>
        n.type.name === "WhitespaceStructFieldValue" ||
        n.type.name === "StructFieldValue"
    )
  ) {
    const defineTypeNameNode = getDescendentInsideParent(
      "DefineTypeName",
      "DefineDeclaration",
      stack
    );
    const defineVariableNameNode = getDescendentInsideParent(
      "DefineVariableName",
      "DefineDeclaration",
      stack
    );
    const type = defineTypeNameNode ? getNodeText(defineTypeNameNode) : "";
    const name = defineVariableNameNode
      ? getNodeText(defineVariableNameNode)
      : "";
    const propertyNameNode = getDescendentInsideParent(
      "DeclarationScalarPropertyName",
      "StructField",
      stack
    );
    if (propertyNameNode) {
      const path =
        getParentPropertyPath(propertyNameNode) +
        "." +
        getNodeText(propertyNameNode);
      addStructPropertyValueCompletions(
        completions,
        program,
        definitions,
        type,
        name,
        path
      );
      return Array.from(completions.values());
    }
  }

  // const line = position?.line;
  // const prevLineText = getLineText(document, position, -1);
  // const nextLineText = getLineText(document, position, 1);
  // const beforeText = getLineTextBefore(document, position);
  // const afterText = getLineTextAfter(document, position);
  // const trimmedBeforeText = beforeText.trim();
  // const trimmedAfterText = afterText.trim();
  // const trimmedStartBeforeText = beforeText.trimStart();
  // const lineMetadata = program?.metadata?.lines?.[line];
  // const scopes = lineMetadata?.scopes;

  // if (scopes) {
  //   if (scopes.includes("access_path")) {
  //     return getAccessPathCompletions(program, beforeText);
  //   }
  // }
  return undefined;
};

export default getCompletions;

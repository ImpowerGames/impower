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

import type { SparkProgram } from "../../../../sparkdown/src/types/SparkProgram";
import type { SparkLocation } from "../../../../sparkdown/src/types/SparkLocation";
import type { SparkdownSyntaxNode } from "../../../../sparkdown/src/types/SparkdownSyntaxNode";
import { getProperty } from "../../../../sparkdown/src/utils/getProperty";
import { getStack } from "../../../../sparkdown/src/utils/syntax/getStack";
import { getParentPropertyPath } from "../../../../sparkdown/src/utils/syntax/getParentPropertyPath";
import { getParentSectionPath } from "../../../../sparkdown/src/utils/syntax/getParentSectionPath";
import { getDescendentInsideParent } from "../../../../sparkdown/src/utils/syntax/getDescendentInsideParent";
import { getOtherMatchesInsideParent } from "../../../../sparkdown/src/utils/syntax/getOtherMatchesInsideParent";
import GRAMMAR_DEFINITION from "../../../../sparkdown/language/sparkdown.language-grammar.json";

import type {
  SyntaxNode,
  Tree,
} from "../../../../grammar-compiler/src/compiler/classes/Tree";
import { printTree } from "../../../../grammar-compiler/src/compiler/utils/printTree";

import { getLineText } from "../document/getLineText";

const IMAGE_CONTROL_KEYWORDS =
  GRAMMAR_DEFINITION.variables.IMAGE_CONTROL_KEYWORDS;
const AUDIO_CONTROL_KEYWORDS =
  GRAMMAR_DEFINITION.variables.AUDIO_CONTROL_KEYWORDS;

const IMAGE_CLAUSE_KEYWORDS =
  GRAMMAR_DEFINITION.variables.IMAGE_CLAUSE_KEYWORDS;
const AUDIO_CLAUSE_KEYWORDS =
  GRAMMAR_DEFINITION.variables.AUDIO_CLAUSE_KEYWORDS;

const IMAGE_TYPES = ["filtered_image", "layered_image", "image"];
const AUDIO_TYPES = ["layered_audio", "audio", "synth"];
const LOGIC_KEYWORDS = ["temp", "return"];
const FLOW_KEYWORDS = ["DONE", "END"];

const isPrefilteredName = (name: string) => name.includes("~");

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
      insertText: insertTextPrefix + name,
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
      insertText: insertTextPrefix + name,
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
      insertText: insertTextPrefix + name,
      labelDetails,
      kind,
    };
    if (completion.label && !completions.has(completion.label)) {
      completions.set(completion.label, completion);
    }
  }
};

const addKeywordCompletions = (
  completions: Map<string, CompletionItem>,
  description: string,
  keywords: string[],
  exclude?: string[],
  insertTextPrefix: string = ""
) => {
  for (const keyword of keywords) {
    if (!exclude || !exclude.includes(keyword)) {
      const completion: CompletionItem = {
        label: keyword,
        insertText: insertTextPrefix + keyword,
        labelDetails: { description },
        kind: CompletionItemKind.Constant,
      };
      if (completion.label && !completions.has(completion.label)) {
        completions.set(completion.label, completion);
      }
    }
  }
};

const addStructTypeNameCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined,
  typeText: string
) => {
  if (program?.context) {
    for (const type of Object.keys(program?.context).sort()) {
      if (!type.startsWith("$") && type !== typeText) {
        const completion: CompletionItem = {
          label: type,
          labelDetails: { description: "type" },
          kind: CompletionItemKind.TypeParameter,
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
    for (const name of Object.keys(program?.context?.[type]).sort()) {
      if (
        !name.startsWith("$") &&
        !program?.compiled?.structDefs?.[type]?.[name]
      ) {
        const completion: CompletionItem = {
          label: name,
          labelDetails: { description: "name" },
          kind: CompletionItemKind.Variable,
        };
        if (completion.label && !completions.has(completion.label)) {
          completions.set(completion.label, completion);
        }
      }
    }
  }
};

const addStructReferenceCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined,
  types: string[],
  exclude?: string[] | ((name: string) => boolean)
) => {
  if (program) {
    for (const type of types) {
      const structs = program?.context?.[type];
      if (structs) {
        for (const name of Object.keys(structs).sort()) {
          if (
            !name.startsWith("$") &&
            (!exclude ||
              (Array.isArray(exclude) && !exclude.includes(name)) ||
              (!Array.isArray(exclude) && !exclude(name)))
          ) {
            const completion: CompletionItem = {
              label: name,
              labelDetails: { description: type },
              kind: CompletionItemKind.Constructor,
            };
            const struct = structs[name];
            const src =
              type === "filtered_image"
                ? struct?.filtered_src
                : type === "layered_image"
                ? struct?.assets?.[0]?.src
                : type === "image"
                ? struct?.src
                : undefined;
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
  }
};

const addUIElementReferenceCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined,
  contentTypes: ("image" | "text")[],
  insertTextPrefix = ""
) => {
  for (const contentType of contentTypes) {
    const uiStructs = program?.context?.["ui"];
    if (uiStructs) {
      for (const v of Object.values(uiStructs)) {
        traverse(v, (fieldPath) => {
          if (fieldPath.endsWith(`.${contentType}`)) {
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
    }
  }
};

const getTypeDescription = (v: unknown): string | undefined => {
  if (
    v &&
    typeof v === "object" &&
    "$type" in v &&
    v.$type &&
    typeof v.$type === "string"
  ) {
    return v.$type;
  }
  if (v && typeof v === "object" && Array.isArray(v)) {
    return "[]";
  }
  if (typeof v === "object") {
    return "{}";
  }
  return typeof v;
};

const getTypeKind = (v: unknown): CompletionItemKind | undefined => {
  if (
    v &&
    typeof v === "object" &&
    "$type" in v &&
    v.$type &&
    typeof v.$type === "string"
  ) {
    return CompletionItemKind.Constructor;
  }
  if (v && typeof v === "object" && Array.isArray(v)) {
    return CompletionItemKind.Class;
  }
  if (typeof v === "object") {
    return CompletionItemKind.Class;
  }
  if (typeof v === "string") {
    return CompletionItemKind.Constant;
  }
  if (typeof v === "number") {
    return CompletionItemKind.Unit;
  }
  return undefined;
};

const addStructPropertyNameContextCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined,
  typeStruct: any,
  modifier: string,
  path: string,
  lineText: string,
  cursorPosition: Position,
  existingProps: Set<string>
) => {
  const textAfterCursor = lineText.slice(cursorPosition.character);
  if (typeStruct) {
    const relativePath = path.startsWith(".") ? path : `.${path}`;
    const indentLength = lineText.length - lineText.trimStart().length;
    const indent = lineText.slice(0, indentLength) + "  ";
    const pathPrefix = program?.context?.[typeStruct.$type]?.["$default"]?.[
      "$recursive"
    ]
      ? "."
      : relativePath.slice(0, relativePath.lastIndexOf(".") + 1);
    traverse(typeStruct, (p: string) => {
      if (p.startsWith(pathPrefix)) {
        const [propName] = p.slice(pathPrefix.length).split(".");
        const optionValue = getProperty(typeStruct, pathPrefix + propName);
        const description = getTypeDescription(optionValue);
        if (propName && Number.isNaN(Number(propName))) {
          if (!propName.startsWith("$") && !existingProps.has(p)) {
            const isArray = Array.isArray(optionValue);
            const isMap =
              optionValue &&
              typeof optionValue === "object" &&
              !("$type" in optionValue) &&
              !("$name" in optionValue);
            if (modifier !== "optional" || isArray || isMap) {
              const arrayItemDash = "- ";
              const insertSuffix = textAfterCursor
                ? ""
                : isArray || modifier === "schema" || modifier === "random"
                ? `:\n${indent}${arrayItemDash}`
                : isMap || modifier === "description"
                ? `:\n${indent}`
                : " = ";
              const completion: CompletionItem = {
                label: propName,
                insertText: propName + insertSuffix,
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
      }
    });
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
  modifier: string,
  type: string,
  name: string,
  path: string,
  lineText: string,
  cursorPosition: Position
) => {
  if (type) {
    const existingProps = new Set<string>();
    const definedStruct = program?.compiled?.structDefs?.[type]?.[name];
    if (definedStruct) {
      traverse(definedStruct, (fieldPath: string) => {
        existingProps.add(fieldPath);
      });
    }
    addStructPropertyNameContextCompletions(
      completions,
      program,
      program?.context?.[type]?.["$default"],
      modifier,
      path,
      lineText,
      cursorPosition,
      existingProps
    );
    addStructPropertyNameContextCompletions(
      completions,
      program,
      program?.context?.[type]?.[`$optional:${name}`],
      modifier,
      path,
      lineText,
      cursorPosition,
      existingProps
    );
    addStructPropertyNameContextCompletions(
      completions,
      program,
      program?.context?.[type]?.["$optional"],
      modifier,
      path,
      lineText,
      cursorPosition,
      existingProps
    );
    addStructPropertyNameContextCompletions(
      completions,
      program,
      definitions?.optionalDefinitions?.[type]?.["$optional"],
      modifier,
      path,
      lineText,
      cursorPosition,
      existingProps
    );
  }
};

const addStructPropertyValueSchemaCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined,
  schemaStruct: any,
  modifier: string,
  path: string,
  valueText: string,
  valueCursorOffset: number,
  context: CompletionContext | undefined
) => {
  if (!modifier) {
    if (schemaStruct) {
      const relativePath = path.startsWith(".") ? path : `.${path}`;
      const lookupPath = program?.context?.[schemaStruct.$type]?.["$default"]?.[
        "$recursive"
      ]
        ? relativePath.split(".").at(-1)
        : relativePath;
      if (lookupPath) {
        const value = getProperty(schemaStruct, lookupPath);
        if (Array.isArray(value)) {
          for (const option of value) {
            const kind = getTypeKind(option);
            if (typeof option === "string") {
              if (!valueText) {
                const completion: CompletionItem = {
                  label: `"${option}"`,
                  kind,
                };
                if (completion.label && !completions.has(completion.label)) {
                  completions.set(completion.label, completion);
                }
              } else if (
                context?.triggerCharacter === '"' &&
                valueCursorOffset === 1
              ) {
                const completion: CompletionItem = {
                  label: option,
                  kind,
                };
                if (completion.label && !completions.has(completion.label)) {
                  completions.set(completion.label, completion);
                }
              }
            } else if (
              typeof option === "object" &&
              "$type" in option &&
              typeof option.$type === "string"
            ) {
              addStructReferenceCompletions(completions, program, [
                option.$type,
              ]);
            }
          }
        }
      }
    }
  }
};

const addStructPropertyValueContextCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined,
  typeStruct: any,
  modifier: string,
  path: string
) => {
  if (!modifier) {
    if (typeStruct) {
      const relativePath = path.startsWith(".") ? path : `.${path}`;
      const value = getProperty(typeStruct, relativePath);
      if (
        value &&
        typeof value === "object" &&
        "$type" in value &&
        typeof value.$type === "string"
      ) {
        addStructReferenceCompletions(completions, program, [value.$type]);
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
  modifier: string,
  type: string,
  name: string,
  path: string,
  valueText: string,
  valueCursorOffset: number,
  context: CompletionContext | undefined
) => {
  if (type) {
    addStructPropertyValueSchemaCompletions(
      completions,
      program,
      program?.context?.[type]?.[`$schema:${name}`],
      modifier,
      path,
      valueText,
      valueCursorOffset,
      context
    );
    addStructPropertyValueSchemaCompletions(
      completions,
      program,
      program?.context?.[type]?.["$schema"],
      modifier,
      path,
      valueText,
      valueCursorOffset,
      context
    );
    addStructPropertyValueSchemaCompletions(
      completions,
      program,
      definitions?.schemaDefinitions?.[type]?.["$schema"],
      modifier,
      path,
      valueText,
      valueCursorOffset,
      context
    );
    addStructPropertyValueContextCompletions(
      completions,
      program,
      program?.context?.[type]?.["$default"],
      modifier,
      path
    );
    addStructPropertyValueContextCompletions(
      completions,
      program,
      program?.context?.[type]?.[`$optional:${name}`],
      modifier,
      path
    );
    addStructPropertyValueContextCompletions(
      completions,
      program,
      program?.context?.[type]?.["$optional"],
      modifier,
      path
    );
    addStructPropertyValueContextCompletions(
      completions,
      program,
      definitions?.optionalDefinitions?.[type]?.["$optional"],
      modifier,
      path
    );
  }
};

const addMutableAccessPathCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined,
  valueText: string,
  valueCursorOffset: number,
  scopePath: string,
  insertTextPrefix: string = ""
) => {
  const valueTextAfterCursor = valueText.slice(valueCursorOffset);
  if (!valueTextAfterCursor) {
    const parts = valueText?.split(".") || [];
    if (program?.metadata?.scopes) {
      const types = ["var", "list", "param", "temp"];
      for (const [path, declarations] of Object.entries(
        program.metadata.scopes
      )) {
        if (
          (parts.length <= 1 && scopePath.startsWith(path)) ||
          (parts.length > 1 && path === "." + parts.slice(0, -1).join("."))
        ) {
          for (const type of types) {
            if (declarations[type]) {
              for (const location of declarations[type]) {
                if (location.text) {
                  const description = type;
                  const kind = CompletionItemKind.Class;
                  const completion: CompletionItem = {
                    label: location.text,
                    insertText: insertTextPrefix + location.text,
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
      }
    }
  }
};

const addImmutableAccessPathCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined,
  valueText: string,
  valueCursorOffset: number,
  scopePath: string,
  insertTextPrefix: string = ""
) => {
  const valueTextAfterCursor = valueText.slice(valueCursorOffset);
  if (!valueTextAfterCursor) {
    const parts = valueText?.split(".") || [];
    if (program?.metadata?.scopes) {
      const types = ["const"];
      for (const [path, declarations] of Object.entries(
        program.metadata.scopes
      )) {
        if (
          (parts.length <= 1 && scopePath.startsWith(path)) ||
          (parts.length > 1 && path === "." + parts.slice(0, -1).join("."))
        ) {
          for (const type of types) {
            if (declarations[type]) {
              for (const location of declarations[type]) {
                if (location.text) {
                  const description = type;
                  const kind = CompletionItemKind.Class;
                  const completion: CompletionItem = {
                    label: location.text,
                    insertText: insertTextPrefix + location.text,
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
      }
    }
  }
};

const addStructAccessPathCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined,
  valueText: string,
  valueCursorOffset: number,
  insertTextPrefix: string = ""
) => {
  const valueTextAfterCursor = valueText.slice(valueCursorOffset);
  if (!valueTextAfterCursor) {
    const parts = valueText?.split(".") || [];
    const type = parts[0];
    if (program?.context) {
      if (parts.length === 2 && type) {
        addStructReferenceCompletions(completions, program, [type]);
      } else {
        const parentPath =
          parts.length === 1
            ? ""
            : valueText.endsWith(".")
            ? valueText.slice(0, -1)
            : valueText;
        const props = getProperty(program.context, parentPath);
        if (props) {
          for (const [propName, v] of Object.entries(props)) {
            if (!propName.startsWith("$")) {
              const keyStartsWith = parts.at(-1) || "";
              if (!keyStartsWith || propName.startsWith(keyStartsWith)) {
                const description =
                  typeof v === "object" ? undefined : typeof v;
                const kind =
                  parts.length <= 1
                    ? CompletionItemKind.TypeParameter
                    : parts.length === 2
                    ? CompletionItemKind.Variable
                    : CompletionItemKind.Property;
                const completion: CompletionItem = {
                  label: propName,
                  insertText: insertTextPrefix + propName,
                  labelDetails: { description },
                  kind,
                  insertTextMode: InsertTextMode.asIs,
                };
                if (completion.label && !completions.has(completion.label)) {
                  completions.set(completion.label, completion);
                }
              }
            }
          }
        }
      }
    }
  }
};

const addDivertPathCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined,
  valueText: string,
  valueCursorOffset: number,
  scopePath: string,
  insertTextPrefix: string = ""
) => {
  const valueTextAfterCursor = valueText.slice(valueCursorOffset);
  if (!valueTextAfterCursor) {
    const parts = valueText?.split(".") || [];
    if (parts.length <= 1) {
      addKeywordCompletions(
        completions,
        "terminator",
        FLOW_KEYWORDS,
        undefined,
        insertTextPrefix
      );
    }
    if (program?.metadata?.scopes) {
      const types = ["knot", "stitch", "label"];
      for (const [path, declarations] of Object.entries(
        program.metadata.scopes
      )) {
        if (
          (parts.length <= 1 && scopePath.startsWith(path)) ||
          (parts.length > 1 && path === "." + parts.slice(0, -1).join("."))
        ) {
          for (const type of types) {
            if (declarations[type]) {
              for (const location of declarations[type]) {
                if (location.text) {
                  const description = type;
                  const kind = CompletionItemKind.Class;
                  const completion: CompletionItem = {
                    label: location.text,
                    insertText: insertTextPrefix + location.text,
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
      }
    }
  }
};

export const getCompletions = (
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
  context: CompletionContext | undefined
): CompletionItem[] | null | undefined => {
  if (!document) {
    return undefined;
  }
  if (!tree) {
    return undefined;
  }

  const documentCursorOffset = document.offsetAt(position);

  const completions: Map<string, CompletionItem> = new Map();

  const stack = getStack(tree, document.offsetAt(position));
  if (!stack[0]) {
    return null;
  }

  const read = (from: number, to: number) =>
    document.getText({
      start: document.positionAt(from),
      end: document.positionAt(to),
    });

  const getNodeText = (node: SyntaxNode | undefined) =>
    node ? read(node.from, node.to) : "";

  const getCursorOffset = (node: SyntaxNode | undefined) =>
    node
      ? documentCursorOffset < node.from
        ? 0
        : documentCursorOffset > node.to
        ? node.to - node.from
        : documentCursorOffset - node.from
      : 0;

  const side = -1;
  const prevCursor = tree.cursorAt(stack[0].from - 1, side);
  const prevNode = prevCursor.node as SparkdownSyntaxNode;
  const prevText = getNodeText(prevNode);

  // console.log(printTree(tree, document.getText()));
  // console.log("program", program);
  // console.log(stack.map((n) => n.type.name));

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
    addUIElementReferenceCompletions(completions, program, ["text"], " ");
    return Array.from(completions.values());
  }
  if (
    stack[0]?.type.name === "WriteMarkSeparator" ||
    stack.some((n) => n?.type.name === "WriteTarget")
  ) {
    addUIElementReferenceCompletions(completions, program, ["text"]);
    return Array.from(completions.values());
  }

  // ImageCommand
  if (stack.some((n) => n.type.name === "ImageCommand")) {
    if (
      stack.some(
        (n) =>
          n.type.name === "ImageCommand_c1" ||
          n.type.name === "AssetCommandContent_c1"
      )
    ) {
      addKeywordCompletions(completions, "control", IMAGE_CONTROL_KEYWORDS);
      addStructReferenceCompletions(
        completions,
        program,
        IMAGE_TYPES,
        isPrefilteredName
      );
      return Array.from(completions.values());
    }
    if (stack[0]?.type.name === "AssetCommandControl") {
      addKeywordCompletions(completions, "control", IMAGE_CONTROL_KEYWORDS);
      return Array.from(completions.values());
    }
    if (
      stack[0]?.type.name === "WhitespaceAssetCommandTarget" ||
      stack[0]?.type.name === "AssetCommandTarget"
    ) {
      addUIElementReferenceCompletions(completions, program, ["image"]);
      return Array.from(completions.values());
    }
    if (stack[0]?.type.name === "WhitespaceAssetCommandName") {
      addStructReferenceCompletions(
        completions,
        program,
        IMAGE_TYPES,
        isPrefilteredName
      );
      addKeywordCompletions(completions, "clause", IMAGE_CLAUSE_KEYWORDS);
      return Array.from(completions.values());
    }
    if (
      stack[0]?.type.name === "AssetCommandName" ||
      stack[0]?.type.name === "AssetCommandFileName"
    ) {
      addStructReferenceCompletions(
        completions,
        program,
        IMAGE_TYPES,
        isPrefilteredName
      );
      return Array.from(completions.values());
    }
    if (
      stack[0]?.type.name === "AssetCommandFilterOperator" ||
      stack[0]?.type.name === "AssetCommandFilterName"
    ) {
      const exclude = getOtherMatchesInsideParent(
        "AssetCommandFilterName",
        "AssetCommandContent",
        stack,
        tree,
        read
      );
      addStructReferenceCompletions(completions, program, ["filter"], exclude);
      return Array.from(completions.values());
    }
    if (
      (stack[0]?.type.name === "WhitespaceAssetCommandClause" &&
        prevNode?.type.name === "AssetCommandClauseKeyword" &&
        prevText === "with") ||
      stack[0]?.type.name === "NameValue"
    ) {
      addStructReferenceCompletions(completions, program, [
        "transition",
        "animation",
      ]);
      return Array.from(completions.values());
    }
    if (stack[0]?.type.name === "WhitespaceAssetCommandClause") {
      const prevClauseTakesArgument =
        prevNode?.type.name === "AssetCommandClauseKeyword" &&
        (prevText === "after" ||
          prevText === "over" ||
          prevText === "with" ||
          prevText === "fadeto");
      if (!prevClauseTakesArgument) {
        const exclude = getOtherMatchesInsideParent(
          "AssetCommandClauseKeyword",
          "AssetCommandContent",
          stack,
          tree,
          read
        );
        addKeywordCompletions(
          completions,
          "clause",
          IMAGE_CLAUSE_KEYWORDS,
          exclude
        );
      }
      return Array.from(completions.values());
    }
  }

  // AudioCommand
  if (stack.some((n) => n.type.name === "AudioCommand")) {
    if (
      stack.some(
        (n) =>
          n.type.name === "AudioCommand_c1" ||
          n.type.name === "AssetCommandContent_c1"
      )
    ) {
      addKeywordCompletions(completions, "control", AUDIO_CONTROL_KEYWORDS);
      addStructReferenceCompletions(completions, program, AUDIO_TYPES);
      return Array.from(completions.values());
    }
    if (stack[0]?.type.name === "AssetCommandControl") {
      addKeywordCompletions(completions, "control", AUDIO_CONTROL_KEYWORDS);
      return Array.from(completions.values());
    }
    if (
      stack[0]?.type.name === "WhitespaceAssetCommandTarget" ||
      stack[0]?.type.name === "AssetCommandTarget"
    ) {
      addStructReferenceCompletions(completions, program, ["channel"]);
      return Array.from(completions.values());
    }
    if (stack[0]?.type.name === "WhitespaceAssetCommandName") {
      addStructReferenceCompletions(completions, program, AUDIO_TYPES);
      addKeywordCompletions(completions, "clause", AUDIO_CLAUSE_KEYWORDS);
      return Array.from(completions.values());
    }
    if (
      stack[0]?.type.name === "AssetCommandName" ||
      stack[0]?.type.name === "AssetCommandFileName"
    ) {
      addStructReferenceCompletions(completions, program, AUDIO_TYPES);
      return Array.from(completions.values());
    }
    if (
      stack[0]?.type.name === "AssetCommandFilterOperator" ||
      stack[0]?.type.name === "AssetCommandFilterName"
    ) {
      const exclude = getOtherMatchesInsideParent(
        "AssetCommandFilterName",
        "AssetCommandContent",
        stack,
        tree,
        read
      );
      addStructReferenceCompletions(completions, program, ["filter"], exclude);
      return Array.from(completions.values());
    }
    if (stack[0]?.type.name === "WhitespaceAssetCommandClause") {
      const prevClauseTakesArgument =
        prevNode?.type.name === "AssetCommandClauseKeyword" &&
        (prevText === "after" ||
          prevText === "over" ||
          prevText === "with" ||
          prevText === "fadeto");
      if (!prevClauseTakesArgument) {
        const exclude = getOtherMatchesInsideParent(
          "AssetCommandClauseKeyword",
          "AssetCommandContent",
          stack,
          tree,
          read
        );
        addKeywordCompletions(
          completions,
          "clause",
          AUDIO_CLAUSE_KEYWORDS,
          exclude
        );
        return Array.from(completions.values());
      }
    }
    if (
      (stack[0]?.type.name === "WhitespaceAssetCommandClause" &&
        prevNode?.type.name === "AssetCommandClauseKeyword" &&
        prevText === "with") ||
      stack[0]?.type.name === "NameValue"
    ) {
      addStructReferenceCompletions(completions, program, ["modulation"]);
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
    const defineTypeNameNode = stack.find(
      (n) => n.type.name === "DefineTypeName"
    );
    const type = defineTypeNameNode ? getNodeText(defineTypeNameNode) : "";
    addStructTypeNameCompletions(completions, program, type);
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
    const defineModifierNameNode = getDescendentInsideParent(
      "DefineModifierName",
      "DefineDeclaration",
      stack
    );
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
    const modifier = defineModifierNameNode
      ? getNodeText(defineModifierNameNode)
      : "";
    const type = defineTypeNameNode ? getNodeText(defineTypeNameNode) : "";
    const name = defineVariableNameNode
      ? getNodeText(defineVariableNameNode)
      : "";
    const path = getParentPropertyPath(propertyNameNode, read);
    const lineText = getLineText(document, position);
    addStructPropertyNameCompletions(
      completions,
      program,
      definitions,
      modifier,
      type,
      name,
      path,
      lineText,
      position
    );
    return Array.from(completions.values());
  }
  if (
    stack.some(
      (n) =>
        n.type.name === "WhitespaceStructFieldValue" ||
        n.type.name === "StructFieldValue"
    ) &&
    !stack.some((n) => n.type.name === "AccessPath")
  ) {
    const defineModifierNameNode = getDescendentInsideParent(
      "DefineModifierName",
      "DefineDeclaration",
      stack
    );
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
    const modifier = defineModifierNameNode
      ? getNodeText(defineModifierNameNode)
      : "";
    const type = defineTypeNameNode ? getNodeText(defineTypeNameNode) : "";
    const name = defineVariableNameNode
      ? getNodeText(defineVariableNameNode)
      : "";
    const propertyNameNode = getDescendentInsideParent(
      "DeclarationScalarPropertyName",
      "StructField",
      stack
    );
    const propertyValueNode = getDescendentInsideParent(
      "StructFieldValue",
      "StructField",
      stack
    );
    const valueText = propertyValueNode ? getNodeText(propertyValueNode) : "";
    const documentCursorOffset = document.offsetAt(position);
    const valueCursorOffset = getCursorOffset(propertyValueNode);
    if (propertyNameNode) {
      const path =
        getParentPropertyPath(propertyNameNode, read) +
        "." +
        getNodeText(propertyNameNode);
      addStructPropertyValueCompletions(
        completions,
        program,
        definitions,
        modifier,
        type,
        name,
        path,
        valueText,
        valueCursorOffset,
        context
      );
      return Array.from(completions.values());
    }
  }

  // Access Path
  const accessPathNode = stack.find((n) => n.type.name === "AccessPath");
  if (accessPathNode) {
    const valueText = getNodeText(accessPathNode);
    const valueCursorOffset = getCursorOffset(accessPathNode);
    if (stack.find((n) => n.type.name === "StructField")) {
      addStructAccessPathCompletions(
        completions,
        program,
        valueText,
        valueCursorOffset
      );
    } else {
      addMutableAccessPathCompletions(
        completions,
        program,
        valueText,
        valueCursorOffset,
        getParentSectionPath(stack, read)
      );
      addImmutableAccessPathCompletions(
        completions,
        program,
        valueText,
        valueCursorOffset,
        getParentSectionPath(stack, read)
      );
    }
    return Array.from(completions.values());
  }

  // Divert Path
  if (
    stack[0]?.type.name === "DivertArrow" &&
    !getNodeText(getDescendentInsideParent("Divert_content", "Divert", stack))
  ) {
    addDivertPathCompletions(
      completions,
      program,
      "",
      0,
      getParentSectionPath(stack, read),
      " "
    );
    return Array.from(completions.values());
  }
  if (
    stack[0]?.type.name === "WhitespaceDivertPath" &&
    !getNodeText(getDescendentInsideParent("Divert_content", "Divert", stack))
  ) {
    addDivertPathCompletions(
      completions,
      program,
      "",
      0,
      getParentSectionPath(stack, read)
    );
    return Array.from(completions.values());
  }
  if (stack[0]?.type.name === "DivertPath") {
    const valueText = getNodeText(stack[0]);
    const valueCursorOffset = getCursorOffset(stack[0]);
    addDivertPathCompletions(
      completions,
      program,
      valueText,
      valueCursorOffset,
      getParentSectionPath(stack, read)
    );
    return Array.from(completions.values());
  }

  return undefined;
};

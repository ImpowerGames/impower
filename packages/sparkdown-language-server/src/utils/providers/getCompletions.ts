import {
  Command,
  CompletionItemKind,
  InsertTextMode,
  MarkupKind,
  type CompletionContext,
  type CompletionItem,
  type Position,
} from "vscode-languageserver";
import { type TextDocument } from "vscode-languageserver-textdocument";

import { type SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import { type SparkLocation } from "@impower/sparkdown/src/types/SparkLocation";
import { getProperty } from "@impower/sparkdown/src/utils/getProperty";
import { SparkdownNodeName } from "@impower/sparkdown/src/types/SparkdownNodeName";
import GRAMMAR_DEFINITION from "@impower/sparkdown/language/sparkdown.language-grammar.json";

import { type GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { type SyntaxNode, type Tree } from "@lezer/common";
import { getStack } from "@impower/textmate-grammar-tree/src/tree/utils/getStack";
import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { getParentPropertyPath } from "../syntax/getParentPropertyPath";
import { getParentSectionPath } from "../syntax/getParentSectionPath";
import { getDescendentInsideParent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendentInsideParent";
import { getOtherMatchesInsideParent } from "@impower/textmate-grammar-tree/src/tree/utils/getOtherMatchesInsideParent";
import { getOtherNodesInsideParent } from "@impower/textmate-grammar-tree/src/tree/utils/getOtherNodesInsideParent";

import { getLineText } from "../document/getLineText";
import { SparkdownAnnotations } from "@impower/sparkdown/src/classes/SparkdownCombinedAnnotator";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { DeclarationType } from "@impower/sparkdown/src/classes/annotators/DeclarationAnnotator";

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

const rankMostRecentTexts = (
  type: keyof SparkdownAnnotations,
  read: (from: number, to: number) => string,
  scriptAnnotations: Record<string, SparkdownAnnotations>,
  uri: string,
  contentNode: GrammarSyntaxNode<SparkdownNodeName> | undefined
) => {
  // Sort by most recently used
  const before: string[] = [];
  const after: string[] = [];
  const scriptAnnotationEntries = Object.entries(scriptAnnotations);
  const currentScriptIndex = scriptAnnotationEntries.findIndex(
    ([k]) => k === uri
  );
  if (currentScriptIndex < 0) {
    return [];
  }
  const beforeScriptEntries = scriptAnnotationEntries.slice(
    0,
    currentScriptIndex
  );
  const currentScriptEntries = [scriptAnnotationEntries[currentScriptIndex]!];
  const afterScriptEntries = scriptAnnotationEntries.slice(
    currentScriptIndex + 1
  );
  for (const [, annotations] of beforeScriptEntries) {
    const cur = annotations[type]?.iter();
    if (cur) {
      while (cur.value) {
        const text = read(cur.from, cur.to);
        before.push(text);
        cur.next();
      }
    }
  }
  for (const [, annotations] of currentScriptEntries) {
    const cur = annotations[type]?.iter();
    if (cur) {
      while (cur.value) {
        if (!contentNode || cur.to < contentNode.from) {
          const text = read(cur.from, cur.to);
          before.push(text);
        } else if (cur.from > contentNode.from && cur.to > contentNode.to) {
          const text = read(cur.from, cur.to);
          after.push(text);
        }
        cur.next();
      }
    }
  }
  for (const [, annotations] of afterScriptEntries) {
    const cur = annotations[type]?.iter();
    if (cur) {
      while (cur.value) {
        const text = read(cur.from, cur.to);
        after.push(text);
        cur.next();
      }
    }
  }
  const mostRecentTexts = Array.from(
    new Set([...before.toReversed(), ...after])
  );
  // Most recent is the least likely to be used again,
  // So move it to the end of the list
  const mostRecentText = mostRecentTexts.shift();
  if (mostRecentText) {
    mostRecentTexts.push(mostRecentText);
  }
  return mostRecentTexts;
};

const getScopes = (
  read: (from: number, to: number) => string,
  scriptAnnotations: Record<string, SparkdownAnnotations>
) => {
  let scopePathParts: { kind: "" | "knot" | "stitch"; name: string }[] = [
    { kind: "", name: "" },
  ];
  const scopes: {
    [path: string]: Record<string, string[]>;
  } = {};
  const scriptAnnotationEntries = Object.entries(scriptAnnotations);
  for (const [, annotations] of scriptAnnotationEntries) {
    const cur = annotations.declarations?.iter();
    if (cur) {
      while (cur.value) {
        const text = read(cur.from, cur.to);
        if (cur.value.type === "knot") {
          // Global
          const scopePath = "";
          scopes[scopePath] ??= {};
          scopes[scopePath][cur.value.type] ??= [];
          scopes[scopePath][cur.value.type]!.push(read(cur.from, cur.to));
          scopePathParts = [{ kind: "", name: "" }];
          scopePathParts.push({ kind: "knot", name: text });
        }
        if (cur.value.type === "stitch") {
          const prevKind = scopePathParts.at(-1)?.kind || "";
          if (prevKind === "stitch") {
            scopePathParts.pop();
          }
          // Scoped
          const scopePath = scopePathParts.map((p) => p.name).join(".");
          scopes[scopePath] ??= {};
          scopes[scopePath][cur.value.type] ??= [];
          scopes[scopePath][cur.value.type]!.push(read(cur.from, cur.to));
          scopePathParts.push({ kind: "stitch", name: text });
        }
        if (cur.value.type === "label") {
          // Scoped
          const scopePath = scopePathParts.map((p) => p.name).join(".");
          scopes[scopePath] ??= {};
          scopes[scopePath][cur.value.type] ??= [];
          scopes[scopePath][cur.value.type]!.push(read(cur.from, cur.to));
        }
        if (cur.value.type === "const") {
          // Global
          const scopePath = "";
          scopes[scopePath] ??= {};
          scopes[scopePath][cur.value.type] ??= [];
          scopes[scopePath][cur.value.type]!.push(read(cur.from, cur.to));
        }
        if (cur.value.type === "var") {
          // Global
          const scopePath = "";
          scopes[scopePath] ??= {};
          scopes[scopePath][cur.value.type] ??= [];
          scopes[scopePath][cur.value.type]!.push(read(cur.from, cur.to));
        }
        if (cur.value.type === "list") {
          // Global
          const scopePath = "";
          scopes[scopePath] ??= {};
          scopes[scopePath][cur.value.type] ??= [];
          scopes[scopePath][cur.value.type]!.push(read(cur.from, cur.to));
        }
        if (cur.value.type === "define") {
          // Global
          const scopePath = "";
          scopes[scopePath] ??= {};
          scopes[scopePath][cur.value.type] ??= [];
          scopes[scopePath][cur.value.type]!.push(read(cur.from, cur.to));
        }
        if (cur.value.type === "temp") {
          // Scoped
          const scopePath = scopePathParts.map((p) => p.name).join(".");
          scopes[scopePath] ??= {};
          scopes[scopePath][cur.value.type] ??= [];
          scopes[scopePath][cur.value.type]!.push(read(cur.from, cur.to));
        }
        if (cur.value.type === "param") {
          // Scoped
          const scopePath = scopePathParts.map((p) => p.name).join(".");
          scopes[scopePath] ??= {};
          scopes[scopePath][cur.value.type] ??= [];
          scopes[scopePath][cur.value.type]!.push(read(cur.from, cur.to));
        }
        cur.next();
      }
    }
  }
  return scopes;
};

const addTransitionCompletions = (
  completions: Map<string, CompletionItem>,
  read: (from: number, to: number) => string,
  scriptAnnotations: Record<string, SparkdownAnnotations>,
  uri: string,
  contentNode: GrammarSyntaxNode<SparkdownNodeName> | undefined,
  insertTextPrefix: string = ""
) => {
  const mostRecentTexts = rankMostRecentTexts(
    "transitions",
    read,
    scriptAnnotations,
    uri,
    contentNode
  );
  // Add completions
  for (const text of mostRecentTexts) {
    const labelDetails = { description: "transition" };
    const kind = CompletionItemKind.Constant;
    const completion: CompletionItem = {
      label: text,
      insertText: insertTextPrefix + text + "\n\n",
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
  read: (from: number, to: number) => string,
  scriptAnnotations: Record<string, SparkdownAnnotations>,
  uri: string,
  contentNode: GrammarSyntaxNode<SparkdownNodeName> | undefined,
  insertTextPrefix: string = ""
) => {
  const mostRecentTexts = rankMostRecentTexts(
    "scenes",
    read,
    scriptAnnotations,
    uri,
    contentNode
  );
  // Add completions
  for (const text of mostRecentTexts) {
    const labelDetails = { description: "scene" };
    const kind = CompletionItemKind.Constant;
    const completion: CompletionItem = {
      label: text,
      insertText: insertTextPrefix + text + "\n\n",
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
  read: (from: number, to: number) => string,
  scriptAnnotations: Record<string, SparkdownAnnotations>,
  uri: string,
  contentNode: GrammarSyntaxNode<SparkdownNodeName> | undefined,
  insertTextPrefix: string = ""
) => {
  const mostRecentTexts = rankMostRecentTexts(
    "characters",
    read,
    scriptAnnotations,
    uri,
    contentNode
  );
  // Add completions
  for (const text of mostRecentTexts) {
    const labelDetails = { description: "character" };
    const kind = CompletionItemKind.Constant;
    const completion: CompletionItem = {
      label: text,
      insertText: insertTextPrefix + text + "\n",
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
      if (!name.startsWith("$")) {
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
  exclude?: string[]
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
          if (!propName.startsWith("$") && !exclude?.includes(propName)) {
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
  definitions:
    | {
        builtinDefinitions?: { [type: string]: { [name: string]: any } };
        optionalDefinitions?: { [type: string]: { [name: string]: any } };
        schemaDefinitions?: { [type: string]: { [name: string]: any } };
        descriptionDefinitions?: { [type: string]: { [name: string]: any } };
      }
    | undefined,
  modifier: string,
  type: string,
  name: string,
  path: string,
  lineText: string,
  cursorPosition: Position,
  exclude: string[]
) => {
  if (type) {
    addStructPropertyNameContextCompletions(
      completions,
      program,
      program?.context?.[type]?.["$default"],
      modifier,
      path,
      lineText,
      cursorPosition,
      exclude
    );
    addStructPropertyNameContextCompletions(
      completions,
      program,
      program?.context?.[type]?.[`$optional:${name}`],
      modifier,
      path,
      lineText,
      cursorPosition,
      exclude
    );
    addStructPropertyNameContextCompletions(
      completions,
      program,
      program?.context?.[type]?.["$optional"],
      modifier,
      path,
      lineText,
      cursorPosition,
      exclude
    );
    addStructPropertyNameContextCompletions(
      completions,
      program,
      definitions?.optionalDefinitions?.[type]?.["$optional"],
      modifier,
      path,
      lineText,
      cursorPosition,
      exclude
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
  definitions:
    | {
        builtinDefinitions?: { [type: string]: { [name: string]: any } };
        optionalDefinitions?: { [type: string]: { [name: string]: any } };
        schemaDefinitions?: { [type: string]: { [name: string]: any } };
        descriptionDefinitions?: { [type: string]: { [name: string]: any } };
      }
    | undefined,
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
  scopes: {
    [path: string]: Record<string, string[]>;
  },
  valueText: string,
  valueCursorOffset: number,
  scopePath: string,
  insertTextPrefix: string = ""
) => {
  const valueTextAfterCursor = valueText.slice(valueCursorOffset);
  if (!valueTextAfterCursor) {
    const parts = valueText?.split(".") || [];
    if (scopes) {
      const types = ["var", "list", "param", "temp"];
      for (const [path, declarations] of Object.entries(scopes)) {
        if (
          (parts.length <= 1 && scopePath.startsWith(path)) ||
          (parts.length > 1 && path === "." + parts.slice(0, -1).join("."))
        ) {
          for (const type of types) {
            if (declarations[type]) {
              for (const name of declarations[type]) {
                if (name) {
                  const description = type;
                  const kind = CompletionItemKind.Class;
                  const completion: CompletionItem = {
                    label: name,
                    insertText: insertTextPrefix + name,
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
  scopes: {
    [path: string]: Record<string, string[]>;
  },
  valueText: string,
  valueCursorOffset: number,
  scopePath: string,
  insertTextPrefix: string = ""
) => {
  const valueTextAfterCursor = valueText.slice(valueCursorOffset);
  if (!valueTextAfterCursor) {
    const parts = valueText?.split(".") || [];
    if (scopes) {
      const types = ["const"];
      for (const [path, declarations] of Object.entries(scopes)) {
        if (
          (parts.length <= 1 && scopePath.startsWith(path)) ||
          (parts.length > 1 && path === "." + parts.slice(0, -1).join("."))
        ) {
          for (const type of types) {
            if (declarations[type]) {
              for (const name of declarations[type]) {
                if (name) {
                  const description = type;
                  const kind = CompletionItemKind.Class;
                  const completion: CompletionItem = {
                    label: name,
                    insertText: insertTextPrefix + name,
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
  scopes: {
    [path: string]: Record<string, string[]>;
  },
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
    if (scopes) {
      const types = ["knot", "stitch", "label"];
      for (const [path, declarations] of Object.entries(scopes)) {
        if (
          (parts.length <= 1 && scopePath.startsWith(path)) ||
          (parts.length > 1 && path === "." + parts.slice(0, -1).join("."))
        ) {
          for (const type of types) {
            if (declarations[type]) {
              for (const name of declarations[type]) {
                if (name) {
                  const description = type;
                  const kind = CompletionItemKind.Class;
                  const completion: CompletionItem = {
                    label: name,
                    insertText: insertTextPrefix + name,
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
  tree: Tree | undefined,
  scriptAnnotations: Record<string, SparkdownAnnotations>,
  program: SparkProgram | undefined,
  definitions:
    | {
        builtinDefinitions?: { [type: string]: { [name: string]: any } };
        optionalDefinitions?: { [type: string]: { [name: string]: any } };
        schemaDefinitions?: { [type: string]: { [name: string]: any } };
        descriptionDefinitions?: { [type: string]: { [name: string]: any } };
      }
    | undefined,
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

  const stack = getStack<SparkdownNodeName>(tree, document.offsetAt(position));
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

  const isCursorAfterNodeText = (node: SyntaxNode | undefined) => {
    if (!node) {
      return true;
    }
    const nodeText = getNodeText(node);
    const nodeCursorOffset = getCursorOffset(node);
    const nodeTextAfterCursor = nodeText.slice(nodeCursorOffset);
    return !nodeTextAfterCursor.trim();
  };

  const buildCompletions = () => {
    return Array.from(completions.values()).map((c, index) => ({
      ...c,
      sortText: c.sortText ?? String(index).padStart(10, "0"),
    }));
  };

  const side = -1;
  const prevCursor = tree.cursorAt(stack[0].from - 1, side);
  const prevNode = prevCursor.node as GrammarSyntaxNode<SparkdownNodeName>;
  const prevText = getNodeText(prevNode);

  // console.log(printTree(tree, document.getText()));
  // console.log("program", program);
  // console.log(stack.map((n) => n.type.name));

  // Transition
  if (stack[0]?.type.name === "TransitionMark") {
    const contentNode = getDescendentInsideParent(
      "Transition_content",
      "Transition_begin",
      stack
    );
    if (isCursorAfterNodeText(contentNode)) {
      addTransitionCompletions(
        completions,
        read,
        scriptAnnotations,
        document.uri,
        contentNode,
        " "
      );
    }
    return buildCompletions();
  }
  if (
    stack[0]?.type.name === "TransitionMarkSeparator" ||
    stack.some((n) => n?.type.name === "Transition_content")
  ) {
    const contentNode = getDescendentInsideParent(
      "Transition_content",
      "Transition_begin",
      stack
    );
    if (isCursorAfterNodeText(contentNode)) {
      addTransitionCompletions(
        completions,
        read,
        scriptAnnotations,
        document.uri,
        contentNode
      );
    }
    return buildCompletions();
  }

  // Scene
  if (stack[0]?.type.name === "SceneMark") {
    const contentNode = getDescendentInsideParent(
      "Scene_content",
      "Scene_begin",
      stack
    );
    if (isCursorAfterNodeText(contentNode)) {
      addSceneCompletions(
        completions,
        read,
        scriptAnnotations,
        document.uri,
        contentNode,
        " "
      );
    }
    return buildCompletions();
  }
  if (
    stack[0]?.type.name === "SceneMarkSeparator" ||
    stack.some((n) => n?.type.name === "Scene_content")
  ) {
    const contentNode = getDescendentInsideParent(
      "Scene_content",
      "Scene_begin",
      stack
    );
    if (isCursorAfterNodeText(contentNode)) {
      addSceneCompletions(
        completions,
        read,
        scriptAnnotations,
        document.uri,
        contentNode
      );
    }
    return buildCompletions();
  }

  // Dialogue
  if (stack[0]?.type.name === "DialogueMark") {
    const contentNode =
      getDescendentInsideParent(
        "DialogueCharacter",
        "BlockDialogue_begin",
        stack
      ) ||
      getDescendentInsideParent(
        "DialogueCharacter",
        "InlineDialogue_begin",
        stack
      );
    if (isCursorAfterNodeText(contentNode)) {
      addCharacterCompletions(
        completions,
        read,
        scriptAnnotations,
        document.uri,
        contentNode,
        " "
      );
    }
    return buildCompletions();
  }
  if (
    stack[0]?.type.name === "DialogueMarkSeparator" ||
    stack.some((n) => n?.type.name === "DialogueCharacter")
  ) {
    const dialogueCharacterNode =
      getDescendentInsideParent(
        "DialogueCharacter",
        "BlockDialogue_begin",
        stack
      ) ||
      getDescendentInsideParent(
        "DialogueCharacter",
        "InlineDialogue_begin",
        stack
      );
    if (isCursorAfterNodeText(dialogueCharacterNode)) {
      addCharacterCompletions(
        completions,
        read,
        scriptAnnotations,
        document.uri,
        dialogueCharacterNode
      );
    }
    return buildCompletions();
  }

  // Write
  if (stack[0]?.type.name === "WriteMark") {
    if (isCursorAfterNodeText(stack[0])) {
      addUIElementReferenceCompletions(completions, program, ["text"], " ");
    }
    return buildCompletions();
  }
  if (
    stack[0]?.type.name === "WriteMarkSeparator" ||
    stack.some((n) => n?.type.name === "WriteTarget")
  ) {
    const writeTargetNode =
      getDescendentInsideParent("WriteTarget", "BlockWrite_begin", stack) ||
      getDescendentInsideParent("WriteTarget", "InlineWrite_begin", stack);
    if (isCursorAfterNodeText(writeTargetNode)) {
      addUIElementReferenceCompletions(completions, program, ["text"]);
    }
    return buildCompletions();
  }

  // ImageCommand
  if (stack.some((n) => n.type.name === "ImageCommand")) {
    const beforeImageNode = stack.find(
      (n) =>
        n.type.name === "ImageCommand_c1" ||
        n.type.name === "AssetCommandContent_c1"
    );
    if (beforeImageNode) {
      if (isCursorAfterNodeText(beforeImageNode)) {
        addKeywordCompletions(completions, "control", IMAGE_CONTROL_KEYWORDS);
        addStructReferenceCompletions(
          completions,
          program,
          IMAGE_TYPES,
          isPrefilteredName
        );
      }
      return buildCompletions();
    }
    if (stack[0]?.type.name === "AssetCommandControl") {
      if (isCursorAfterNodeText(stack[0])) {
        addKeywordCompletions(completions, "control", IMAGE_CONTROL_KEYWORDS);
      }
      return buildCompletions();
    }
    if (
      stack[0]?.type.name === "WhitespaceAssetCommandTarget" ||
      stack[0]?.type.name === "AssetCommandTarget"
    ) {
      if (isCursorAfterNodeText(stack[0])) {
        addUIElementReferenceCompletions(completions, program, ["image"]);
      }
      return buildCompletions();
    }
    if (stack[0]?.type.name === "WhitespaceAssetCommandName") {
      if (isCursorAfterNodeText(stack[0])) {
        addStructReferenceCompletions(
          completions,
          program,
          IMAGE_TYPES,
          isPrefilteredName
        );
        addKeywordCompletions(completions, "clause", IMAGE_CLAUSE_KEYWORDS);
      }
      return buildCompletions();
    }
    if (
      stack[0]?.type.name === "AssetCommandName" ||
      stack[0]?.type.name === "AssetCommandFileName"
    ) {
      if (isCursorAfterNodeText(stack[0])) {
        addStructReferenceCompletions(
          completions,
          program,
          IMAGE_TYPES,
          isPrefilteredName
        );
      }
      return buildCompletions();
    }
    if (
      stack[0]?.type.name === "AssetCommandFilterOperator" ||
      stack[0]?.type.name === "AssetCommandFilterName"
    ) {
      if (isCursorAfterNodeText(stack[0])) {
        const exclude = getOtherMatchesInsideParent(
          "AssetCommandFilterName",
          "AssetCommandContent",
          stack,
          tree,
          read
        );
        addStructReferenceCompletions(
          completions,
          program,
          ["filter"],
          exclude
        );
      }
      return buildCompletions();
    }
    if (
      (stack[0]?.type.name === "WhitespaceAssetCommandClause" &&
        prevNode?.type.name === "AssetCommandClauseKeyword" &&
        prevText === "with") ||
      stack[0]?.type.name === "NameValue"
    ) {
      if (isCursorAfterNodeText(stack[0])) {
        addStructReferenceCompletions(completions, program, [
          "transition",
          "animation",
        ]);
      }
      return buildCompletions();
    }
    if (stack[0]?.type.name === "WhitespaceAssetCommandClause") {
      if (isCursorAfterNodeText(stack[0])) {
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
      }
      return buildCompletions();
    }
  }

  // AudioCommand
  if (stack.some((n) => n.type.name === "AudioCommand")) {
    const beforeAudioNode = stack.find(
      (n) =>
        n.type.name === "AudioCommand_c1" ||
        n.type.name === "AssetCommandContent_c1"
    );
    if (beforeAudioNode) {
      if (isCursorAfterNodeText(beforeAudioNode)) {
        addKeywordCompletions(completions, "control", AUDIO_CONTROL_KEYWORDS);
        addStructReferenceCompletions(completions, program, AUDIO_TYPES);
      }
      return buildCompletions();
    }
    if (stack[0]?.type.name === "AssetCommandControl") {
      if (isCursorAfterNodeText(stack[0])) {
        addKeywordCompletions(completions, "control", AUDIO_CONTROL_KEYWORDS);
      }
      return buildCompletions();
    }
    if (
      stack[0]?.type.name === "WhitespaceAssetCommandTarget" ||
      stack[0]?.type.name === "AssetCommandTarget"
    ) {
      if (isCursorAfterNodeText(stack[0])) {
        addStructReferenceCompletions(completions, program, ["channel"]);
      }
      return buildCompletions();
    }
    if (stack[0]?.type.name === "WhitespaceAssetCommandName") {
      if (isCursorAfterNodeText(stack[0])) {
        addStructReferenceCompletions(completions, program, AUDIO_TYPES);
        addKeywordCompletions(completions, "clause", AUDIO_CLAUSE_KEYWORDS);
      }
      return buildCompletions();
    }
    if (
      stack[0]?.type.name === "AssetCommandName" ||
      stack[0]?.type.name === "AssetCommandFileName"
    ) {
      if (isCursorAfterNodeText(stack[0])) {
        addStructReferenceCompletions(completions, program, AUDIO_TYPES);
      }
      return buildCompletions();
    }
    if (
      stack[0]?.type.name === "AssetCommandFilterOperator" ||
      stack[0]?.type.name === "AssetCommandFilterName"
    ) {
      if (isCursorAfterNodeText(stack[0])) {
        const exclude = getOtherMatchesInsideParent(
          "AssetCommandFilterName",
          "AssetCommandContent",
          stack,
          tree,
          read
        );
        addStructReferenceCompletions(
          completions,
          program,
          ["filter"],
          exclude
        );
      }
      return buildCompletions();
    }
    if (stack[0]?.type.name === "WhitespaceAssetCommandClause") {
      if (isCursorAfterNodeText(stack[0])) {
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
        }
        return buildCompletions();
      }
    }
    if (
      (stack[0]?.type.name === "WhitespaceAssetCommandClause" &&
        prevNode?.type.name === "AssetCommandClauseKeyword" &&
        prevText === "with") ||
      stack[0]?.type.name === "NameValue"
    ) {
      if (isCursorAfterNodeText(stack[0])) {
        addStructReferenceCompletions(completions, program, ["modulation"]);
      }
      return buildCompletions();
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
    if (
      isCursorAfterNodeText(stack.find((n) => n.type.name === "DefineTypeName"))
    ) {
      const defineTypeNameNode = stack.find(
        (n) => n.type.name === "DefineTypeName"
      );
      const type = defineTypeNameNode ? getNodeText(defineTypeNameNode) : "";
      addStructTypeNameCompletions(completions, program, type);
    }
    return buildCompletions();
  }
  if (
    stack.some(
      (n) =>
        n.type.name === "DefinePunctuationAccessor" ||
        n.type.name === "WhitespaceDefineVariableName" ||
        n.type.name === "DefineVariableName"
    )
  ) {
    if (
      isCursorAfterNodeText(
        stack.find((n) => n.type.name === "DefineVariableName")
      )
    ) {
      const defineTypeNameNode = getDescendentInsideParent(
        "DefineTypeName",
        "DefineDeclaration",
        stack
      );
      const type = defineTypeNameNode ? getNodeText(defineTypeNameNode) : "";
      addStructVariableNameCompletions(completions, program, type);
    }
    return buildCompletions();
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
    if (isCursorAfterNodeText(propertyNameNode)) {
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
      const exclude = getOtherNodesInsideParent(
        "StructField",
        ["DefineDeclaration_content", "StructObjectProperty_content"],
        stack
      ).map((n) =>
        getNodeText(
          getDescendent(
            ["DeclarationScalarPropertyName", "DeclarationObjectPropertyName"],
            n
          )
        )
      );
      addStructPropertyNameCompletions(
        completions,
        program,
        definitions,
        modifier,
        type,
        name,
        path.join("."),
        lineText,
        position,
        exclude
      );
    }
    return buildCompletions();
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
      return buildCompletions();
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
      const scopes = getScopes(read, scriptAnnotations);
      addMutableAccessPathCompletions(
        completions,
        scopes,
        valueText,
        valueCursorOffset,
        getParentSectionPath(stack, read).join(".")
      );
      addImmutableAccessPathCompletions(
        completions,
        scopes,
        valueText,
        valueCursorOffset,
        getParentSectionPath(stack, read).join(".")
      );
    }
    return buildCompletions();
  }

  // Divert Path
  if (
    stack[0]?.type.name === "DivertArrow" &&
    !getNodeText(getDescendentInsideParent("Divert_content", "Divert", stack))
  ) {
    if (isCursorAfterNodeText(stack[0])) {
      const scopes = getScopes(read, scriptAnnotations);
      addDivertPathCompletions(
        completions,
        scopes,
        "",
        0,
        getParentSectionPath(stack, read).join("."),
        " "
      );
    }
    return buildCompletions();
  }
  if (
    stack[0]?.type.name === "WhitespaceDivertPath" &&
    !getNodeText(getDescendentInsideParent("Divert_content", "Divert", stack))
  ) {
    if (isCursorAfterNodeText(stack[0])) {
      const scopes = getScopes(read, scriptAnnotations);
      addDivertPathCompletions(
        completions,
        scopes,
        "",
        0,
        getParentSectionPath(stack, read).join(".")
      );
    }
    return buildCompletions();
  }
  if (stack[0]?.type.name === "DivertPath") {
    if (isCursorAfterNodeText(stack[0])) {
      const valueText = getNodeText(stack[0]);
      const valueCursorOffset = getCursorOffset(stack[0]);
      const scopes = getScopes(read, scriptAnnotations);
      addDivertPathCompletions(
        completions,
        scopes,
        valueText,
        valueCursorOffset,
        getParentSectionPath(stack, read).join(".")
      );
    }
    return buildCompletions();
  }

  return undefined;
};

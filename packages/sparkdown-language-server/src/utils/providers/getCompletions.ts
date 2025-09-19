import GRAMMAR_DEFINITION from "@impower/sparkdown/language/sparkdown.language-grammar.json";
import { SparkdownAnnotations } from "@impower/sparkdown/src/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/classes/SparkdownDocument";
import { SparkdownCompilerConfig } from "@impower/sparkdown/src/types/SparkdownCompilerConfig";
import { SparkdownNodeName } from "@impower/sparkdown/src/types/SparkdownNodeName";
import { type SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import { filterImage } from "@impower/sparkdown/src/utils/filterImage";
import { getProperty } from "@impower/sparkdown/src/utils/getProperty";
import { type GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { getDescendentInsideParent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendentInsideParent";
import { getDescendentsInsideParent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendentsInsideParent";
import { getOtherMatchesInsideParent } from "@impower/textmate-grammar-tree/src/tree/utils/getOtherMatchesInsideParent";
import { getOtherNodesInsideParent } from "@impower/textmate-grammar-tree/src/tree/utils/getOtherNodesInsideParent";
import { getStack } from "@impower/textmate-grammar-tree/src/tree/utils/getStack";
import { type SyntaxNode, type Tree } from "@lezer/common";
import {
  Command,
  CompletionItemKind,
  InsertTextMode,
  MarkupKind,
  type CompletionContext,
  type CompletionItem,
  type Position,
} from "vscode-languageserver";
import { getDeclarationScopes } from "../annotations/getDeclarationScopes";
import { getParentPropertyPath } from "../syntax/getParentPropertyPath";
import { getParentSectionPath } from "../syntax/getParentSectionPath";

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

const isWhitespaceNode = (name?: SparkdownNodeName) =>
  name === "Separator" || name === "ExtraWhitespace";

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
  scriptAnnotations: Map<string, SparkdownAnnotations>,
  uri: string,
  contentNode: GrammarSyntaxNode<SparkdownNodeName> | undefined
) => {
  // Sort by most recently used
  const before: string[] = [];
  const after: string[] = [];
  const scriptAnnotationEntries = Array.from(scriptAnnotations.entries());
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

const addTransitionCompletions = (
  completions: Map<string, CompletionItem>,
  read: (from: number, to: number) => string,
  scriptAnnotations: Map<string, SparkdownAnnotations>,
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
  scriptAnnotations: Map<string, SparkdownAnnotations>,
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
  scriptAnnotations: Map<string, SparkdownAnnotations>,
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
            if (type === "filtered_image" && program.context) {
              filterImage(
                program.context,
                program.context?.["filtered_image"]?.[name]
              );
            }
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
                ? struct?.assets?.[0]?.src || struct?.assets?.[0]?.uri
                : type === "image"
                ? struct?.src || struct?.uri
                : undefined;
            if (src) {
              completion.documentation = {
                kind: MarkupKind.Markdown,
                value: `<img src="${src}" alt="${name}" height="180" />`,
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
  contentTypes: ("image" | "text" | "animation")[],
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
  config: SparkdownCompilerConfig | undefined,
  typeStruct: any,
  modifier: string,
  path: string,
  valueAssignmentSeparator: " = " | ": ",
  includeTypeAsDetail: boolean,
  lineText: string,
  cursorPosition: Position,
  exclude?: string[]
) => {
  const textAfterCursor = lineText.slice(cursorPosition.character);
  if (typeStruct) {
    const relativePath = path.startsWith(".") ? path : `.${path}`;
    const accessorPath = relativePath.endsWith(".")
      ? relativePath
      : `${relativePath}.`;
    const indentLength = lineText.length - lineText.trimStart().length;
    const indent = lineText.slice(0, indentLength) + "  ";
    const pathPrefix = program?.context?.[typeStruct.$type]?.["$default"]?.[
      "$recursive"
    ]
      ? "."
      : accessorPath.slice(0, accessorPath.lastIndexOf(".") + 1);
    traverse(typeStruct, (p: string) => {
      if (p.startsWith(pathPrefix)) {
        const [propName] = p.slice(pathPrefix.length).split(".");
        const optionValue = getProperty(typeStruct, p);
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
                : valueAssignmentSeparator;
              const completion: CompletionItem = {
                label: propName,
                insertText: propName + insertSuffix,
                kind: CompletionItemKind.Property,
                insertTextMode: InsertTextMode.asIs,
                command: Command.create(
                  "suggest",
                  "editor.action.triggerSuggest"
                ),
              };
              if (includeTypeAsDetail) {
                completion.labelDetails = { description };
              }
              const documentationValue =
                getProperty<Record<string, string>>(
                  program?.context?.[typeStruct.$type]?.[
                    `$description:${name}`
                  ],
                  p
                )?.[""] ||
                getProperty<Record<string, string>>(
                  config?.descriptionDefinitions?.[typeStruct.$type]?.[
                    "$description"
                  ],
                  p
                )?.[""];
              if (documentationValue) {
                completion.documentation = {
                  kind: MarkupKind.Markdown,
                  value: documentationValue,
                };
              }
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
  config: SparkdownCompilerConfig | undefined,
  modifier: string,
  type: string,
  name: string,
  path: string,
  valueAssignmentSeparator: " = " | ": ",
  includeTypeAsDetail: boolean,
  lineText: string,
  cursorPosition: Position,
  exclude: string[]
) => {
  if (type) {
    addStructPropertyNameContextCompletions(
      completions,
      program,
      config,
      program?.context?.[type]?.["$default"],
      modifier,
      path,
      valueAssignmentSeparator,
      includeTypeAsDetail,
      lineText,
      cursorPosition,
      exclude
    );
    addStructPropertyNameContextCompletions(
      completions,
      program,
      config,
      program?.context?.[type]?.[`$optional:${name}`],
      modifier,
      path,
      valueAssignmentSeparator,
      includeTypeAsDetail,
      lineText,
      cursorPosition,
      exclude
    );
    addStructPropertyNameContextCompletions(
      completions,
      program,
      config,
      program?.context?.[type]?.["$optional"],
      modifier,
      path,
      valueAssignmentSeparator,
      includeTypeAsDetail,
      lineText,
      cursorPosition,
      exclude
    );
    addStructPropertyNameContextCompletions(
      completions,
      program,
      config,
      config?.optionalDefinitions?.[type]?.["$optional"],
      modifier,
      path,
      valueAssignmentSeparator,
      includeTypeAsDetail,
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
  config: SparkdownCompilerConfig | undefined,
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
      config?.schemaDefinitions?.[type]?.["$schema"],
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
      config?.optionalDefinitions?.[type]?.["$optional"],
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

const addDivertPathKeywords = (
  completions: Map<string, CompletionItem>,
  valueText: string,
  valueCursorOffset: number,
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
    if (scopes) {
      const types = ["knot", "stitch", "label"];
      for (const [path, declarations] of Object.entries(scopes)) {
        if (
          (parts.length <= 1 && scopePath.startsWith(path)) ||
          (parts.length > 1 && path === parts.slice(0, -1).join("."))
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
  document: SparkdownDocument | undefined,
  tree: Tree | undefined,
  scriptAnnotations: Map<string, SparkdownAnnotations>,
  program: SparkProgram | undefined,
  config: SparkdownCompilerConfig | undefined,
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

  const leftStack = getStack<SparkdownNodeName>(
    tree,
    document.offsetAt(position),
    -1
  );

  if (!leftStack[0]) {
    return null;
  }

  const read = (from: number, to: number) => document.read(from, to);

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
  const prevCursor = tree.cursorAt(leftStack[0].from - 1, side);
  const prevNode = prevCursor.node as GrammarSyntaxNode<SparkdownNodeName>;
  const prevText = getNodeText(prevNode);

  // console.log("program", program);
  // console.log(printTree(tree, document.getText()));
  // console.log(leftStack.map((n) => n.type.name));

  if (
    leftStack[0]?.name === "PunctuationAccessor" ||
    leftStack[0]?.name === "VariableName"
  ) {
    const accessPathNode = leftStack.find((n) => n.name === "AccessPath");
    if (isCursorAfterNodeText(accessPathNode)) {
      const valueText = getNodeText(accessPathNode);
      const valueCursorOffset = getCursorOffset(accessPathNode);
      const scopes = getDeclarationScopes(read, scriptAnnotations);
      addDivertPathCompletions(
        completions,
        scopes,
        valueText,
        valueCursorOffset,
        getParentSectionPath(leftStack, read).join(".")
      );
    }
    return buildCompletions();
  }

  // FrontMatter
  if (
    leftStack.some((n) => n.name === "FrontMatter") &&
    leftStack[0]?.name === "Newline"
  ) {
    const rightStack = getStack<SparkdownNodeName>(
      tree,
      document.offsetAt(position),
      1
    );
    if (rightStack[0]?.name === "Newline") {
      // left and right side of the cursor has a Newline,
      // so this is a completely blank line.
      const lineText = document.getLineText(position.line);
      const exclude = getDescendentsInsideParent(
        "FrontMatterFieldKeyword",
        "FrontMatter",
        leftStack
      ).map((n) => getNodeText(n));
      addStructPropertyNameCompletions(
        completions,
        program,
        config,
        "",
        "metadata",
        "",
        "",
        ": ",
        false,
        lineText,
        position,
        exclude
      );
      return buildCompletions();
    }
  }
  if (leftStack[0]?.name === "FrontMatterFieldKeyword") {
    const lineText = document.getLineText(position.line);
    const exclude = getOtherNodesInsideParent(
      "FrontMatterField",
      "FrontMatter",
      leftStack
    ).map((n) => getNodeText(getDescendent("FrontMatterFieldKeyword", n)));
    addStructPropertyNameCompletions(
      completions,
      program,
      config,
      "",
      "metadata",
      "",
      "",
      ": ",
      false,
      lineText,
      position,
      exclude
    );
    return buildCompletions();
  }

  // Transition
  if (leftStack[0]?.name === "TransitionMark") {
    const contentNode = getDescendentInsideParent(
      "Transition_content",
      "Transition_begin",
      leftStack
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
    (isWhitespaceNode(leftStack[0]?.name) &&
      prevNode?.name === "TransitionMark") ||
    (isWhitespaceNode(leftStack[0]?.name) &&
      leftStack.some((n) => n?.name === "Transition_begin")) ||
    leftStack.some((n) => n?.name === "Transition_content")
  ) {
    const contentNode = getDescendentInsideParent(
      "Transition_content",
      "Transition_begin",
      leftStack
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
  if (leftStack[0]?.name === "SceneMark") {
    const contentNode = getDescendentInsideParent(
      "Scene_content",
      "Scene_begin",
      leftStack
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
    (isWhitespaceNode(leftStack[0]?.name) && prevNode?.name === "SceneMark") ||
    (isWhitespaceNode(leftStack[0]?.name) &&
      leftStack.some((n) => n?.name === "Scene_begin")) ||
    leftStack.some((n) => n?.name === "Scene_content")
  ) {
    const contentNode = getDescendentInsideParent(
      "Scene_content",
      "Scene_begin",
      leftStack
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
  if (leftStack[0]?.name === "DialogueMark") {
    const contentNode =
      getDescendentInsideParent(
        "DialogueCharacter",
        "BlockDialogue_begin",
        leftStack
      ) ||
      getDescendentInsideParent(
        "DialogueCharacter",
        "InlineDialogue_begin",
        leftStack
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
    (isWhitespaceNode(leftStack[0]?.name) &&
      prevNode?.name === "DialogueMark") ||
    (isWhitespaceNode(leftStack[0]?.name) &&
      leftStack.some((n) => n?.name === "BlockDialogue_begin")) ||
    (isWhitespaceNode(leftStack[0]?.name) &&
      leftStack.some((n) => n?.name === "InlineDialogue_begin")) ||
    leftStack.some((n) => n?.name === "DialogueCharacter")
  ) {
    const dialogueCharacterNode =
      getDescendentInsideParent(
        "DialogueCharacter",
        "BlockDialogue_begin",
        leftStack
      ) ||
      getDescendentInsideParent(
        "DialogueCharacter",
        "InlineDialogue_begin",
        leftStack
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
  if (leftStack[0]?.name === "WriteMark") {
    if (isCursorAfterNodeText(leftStack[0])) {
      addUIElementReferenceCompletions(completions, program, ["text"], " ");
    }
    return buildCompletions();
  }
  if (
    (isWhitespaceNode(leftStack[0]?.name) && prevNode?.name === "WriteMark") ||
    (isWhitespaceNode(leftStack[0]?.name) &&
      leftStack.some((n) => n?.name === "BlockWrite_begin")) ||
    (isWhitespaceNode(leftStack[0]?.name) &&
      leftStack.some((n) => n?.name === "InlineWrite_begin")) ||
    leftStack.some((n) => n?.name === "WriteTarget")
  ) {
    const writeTargetNode =
      getDescendentInsideParent("WriteTarget", "BlockWrite_begin", leftStack) ||
      getDescendentInsideParent("WriteTarget", "InlineWrite_begin", leftStack);
    if (isCursorAfterNodeText(writeTargetNode)) {
      addUIElementReferenceCompletions(completions, program, ["text"]);
    }
    return buildCompletions();
  }

  // ImageCommand
  if (leftStack.some((n) => n.type.name === "ImageCommand")) {
    const beforeImageNode = leftStack.find(
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
    if (leftStack[0]?.name === "AssetCommandControl") {
      if (isCursorAfterNodeText(leftStack[0])) {
        addKeywordCompletions(completions, "control", IMAGE_CONTROL_KEYWORDS);
      }
      return buildCompletions();
    }
    if (
      (isWhitespaceNode(leftStack[0]?.name) &&
        prevNode.name === "AssetCommandControl") ||
      leftStack[0]?.name === "AssetCommandTarget"
    ) {
      const controlNode = getDescendentInsideParent(
        "AssetCommandControl",
        "ImageCommand",
        leftStack
      );
      if (isCursorAfterNodeText(leftStack[0])) {
        addUIElementReferenceCompletions(
          completions,
          program,
          getNodeText(controlNode) === "animate"
            ? ["animation", "image"]
            : ["image"]
        );
      }
      return buildCompletions();
    }
    if (
      isWhitespaceNode(leftStack[0]?.name) &&
      prevNode.name === "AssetCommandTarget"
    ) {
      if (isCursorAfterNodeText(leftStack[0])) {
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
      leftStack[0]?.name === "AssetCommandName" ||
      leftStack[0]?.name === "AssetCommandFileName"
    ) {
      if (isCursorAfterNodeText(leftStack[0])) {
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
      leftStack[0]?.name === "AssetCommandFilterOperator" ||
      leftStack[0]?.name === "AssetCommandFilterName"
    ) {
      if (isCursorAfterNodeText(leftStack[0])) {
        const exclude = getOtherMatchesInsideParent(
          "AssetCommandFilterName",
          "AssetCommandContent",
          leftStack,
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
      (isWhitespaceNode(leftStack[0]?.name) &&
        leftStack.some((n) => n.name === "AssetCommandContent") &&
        prevNode?.name === "AssetCommandClauseKeyword" &&
        prevText === "with") ||
      leftStack[0]?.name === "NameValue"
    ) {
      if (isCursorAfterNodeText(leftStack[0])) {
        addStructReferenceCompletions(completions, program, [
          "transition",
          "animation",
        ]);
      }
      return buildCompletions();
    }
    if (
      isWhitespaceNode(leftStack[0]?.name) &&
      leftStack.some((n) => n.name === "AssetCommandContent")
    ) {
      if (isCursorAfterNodeText(leftStack[0])) {
        const prevClauseTakesArgument =
          prevNode?.name === "AssetCommandClauseKeyword" &&
          (prevText === "after" ||
            prevText === "over" ||
            prevText === "with" ||
            prevText === "fadeto");
        if (!prevClauseTakesArgument) {
          const exclude = getOtherMatchesInsideParent(
            "AssetCommandClauseKeyword",
            "AssetCommandContent",
            leftStack,
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
  if (leftStack.some((n) => n.type.name === "AudioCommand")) {
    const beforeAudioNode = leftStack.find(
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
    if (leftStack[0]?.name === "AssetCommandControl") {
      if (isCursorAfterNodeText(leftStack[0])) {
        addKeywordCompletions(completions, "control", AUDIO_CONTROL_KEYWORDS);
      }
      return buildCompletions();
    }
    if (
      (isWhitespaceNode(leftStack[0]?.name) &&
        prevNode.name === "AssetCommandControl") ||
      leftStack[0]?.name === "AssetCommandTarget"
    ) {
      if (isCursorAfterNodeText(leftStack[0])) {
        addStructReferenceCompletions(completions, program, ["channel"]);
      }
      return buildCompletions();
    }
    if (
      isWhitespaceNode(leftStack[0]?.name) &&
      prevNode.name === "AssetCommandTarget"
    ) {
      if (isCursorAfterNodeText(leftStack[0])) {
        addStructReferenceCompletions(completions, program, AUDIO_TYPES);
        addKeywordCompletions(completions, "clause", AUDIO_CLAUSE_KEYWORDS);
      }
      return buildCompletions();
    }
    if (
      leftStack[0]?.name === "AssetCommandName" ||
      leftStack[0]?.name === "AssetCommandFileName"
    ) {
      if (isCursorAfterNodeText(leftStack[0])) {
        addStructReferenceCompletions(completions, program, AUDIO_TYPES);
      }
      return buildCompletions();
    }
    if (
      leftStack[0]?.name === "AssetCommandFilterOperator" ||
      leftStack[0]?.name === "AssetCommandFilterName"
    ) {
      if (isCursorAfterNodeText(leftStack[0])) {
        const exclude = getOtherMatchesInsideParent(
          "AssetCommandFilterName",
          "AssetCommandContent",
          leftStack,
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
      isWhitespaceNode(leftStack[0]?.name) &&
      leftStack.some((n) => n.name === "AssetCommandContent")
    ) {
      if (isCursorAfterNodeText(leftStack[0])) {
        const prevClauseTakesArgument =
          prevNode?.name === "AssetCommandClauseKeyword" &&
          (prevText === "after" ||
            prevText === "over" ||
            prevText === "with" ||
            prevText === "fadeto");
        if (!prevClauseTakesArgument) {
          const exclude = getOtherMatchesInsideParent(
            "AssetCommandClauseKeyword",
            "AssetCommandContent",
            leftStack,
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
      (isWhitespaceNode(leftStack[0]?.name) &&
        leftStack.some((n) => n.name === "AssetCommandContent") &&
        prevNode?.name === "AssetCommandClauseKeyword" &&
        prevText === "with") ||
      leftStack[0]?.name === "NameValue"
    ) {
      if (isCursorAfterNodeText(leftStack[0])) {
        addStructReferenceCompletions(completions, program, ["modulation"]);
      }
      return buildCompletions();
    }
  }

  // Define
  if (
    leftStack.some(
      (n) =>
        (isWhitespaceNode(n.name) &&
          (prevNode.name === "DefineKeyword" ||
            prevNode.name === "DefineModifierName")) ||
        n.name === "DefineTypeName"
    )
  ) {
    if (
      isCursorAfterNodeText(
        leftStack.find((n) => n.type.name === "DefineTypeName")
      )
    ) {
      const defineTypeNameNode = leftStack.find(
        (n) => n.type.name === "DefineTypeName"
      );
      const type = defineTypeNameNode ? getNodeText(defineTypeNameNode) : "";
      addStructTypeNameCompletions(completions, program, type);
    }
    return buildCompletions();
  }
  if (
    leftStack.some(
      (n) =>
        n.type.name === "DefinePunctuationAccessor" ||
        n.type.name === "DefineVariableName"
    )
  ) {
    if (
      isCursorAfterNodeText(
        leftStack.find((n) => n.type.name === "DefineVariableName")
      )
    ) {
      const defineTypeNameNode = getDescendentInsideParent(
        "DefineTypeName",
        "DefineDeclaration",
        leftStack
      );
      const type = defineTypeNameNode ? getNodeText(defineTypeNameNode) : "";
      addStructVariableNameCompletions(completions, program, type);
    }
    return buildCompletions();
  }
  const propertyNameNode = leftStack.find(
    (n) =>
      n.type.name === "BlankProperty" ||
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
        leftStack
      );
      const defineTypeNameNode = getDescendentInsideParent(
        "DefineTypeName",
        "DefineDeclaration",
        leftStack
      );
      const defineVariableNameNode = getDescendentInsideParent(
        "DefineVariableName",
        "DefineDeclaration",
        leftStack
      );
      const modifier = defineModifierNameNode
        ? getNodeText(defineModifierNameNode)
        : "";
      const type = defineTypeNameNode ? getNodeText(defineTypeNameNode) : "";
      const name = defineVariableNameNode
        ? getNodeText(defineVariableNameNode)
        : "$default";
      const path = getParentPropertyPath(propertyNameNode, read);
      const lineText = document.getLineText(position.line);
      const exclude = getOtherNodesInsideParent(
        "StructField",
        ["DefineDeclaration_content", "StructObjectProperty_content"],
        leftStack
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
        config,
        modifier,
        type,
        name,
        path.join("."),
        " = ",
        true,
        lineText,
        position,
        exclude
      );
    }
    return buildCompletions();
  }
  if (
    leftStack.some(
      (n) =>
        (isWhitespaceNode(n.name) &&
          (prevNode.name === "SetEqualOperator" ||
            prevNode.name === "ArrayItemMark") &&
          leftStack.some((x) => x.name === "DefineDeclaration")) ||
        n.name === "StructFieldValue"
    ) &&
    !leftStack.some((n) => n.type.name === "AccessPath")
  ) {
    const defineModifierNameNode = getDescendentInsideParent(
      "DefineModifierName",
      "DefineDeclaration",
      leftStack
    );
    const defineTypeNameNode = getDescendentInsideParent(
      "DefineTypeName",
      "DefineDeclaration",
      leftStack
    );
    const defineVariableNameNode = getDescendentInsideParent(
      "DefineVariableName",
      "DefineDeclaration",
      leftStack
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
      leftStack
    );
    const propertyValueNode = getDescendentInsideParent(
      "StructFieldValue",
      "StructField",
      leftStack
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
        config,
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
  const accessPathNode = leftStack.find((n) => n.type.name === "AccessPath");
  if (accessPathNode) {
    const valueText = getNodeText(accessPathNode);
    const valueCursorOffset = getCursorOffset(accessPathNode);
    if (leftStack.find((n) => n.type.name === "StructField")) {
      addStructAccessPathCompletions(
        completions,
        program,
        valueText,
        valueCursorOffset
      );
    } else {
      const scopes = getDeclarationScopes(read, scriptAnnotations);
      addMutableAccessPathCompletions(
        completions,
        scopes,
        valueText,
        valueCursorOffset,
        getParentSectionPath(leftStack, read).join(".")
      );
      addImmutableAccessPathCompletions(
        completions,
        scopes,
        valueText,
        valueCursorOffset,
        getParentSectionPath(leftStack, read).join(".")
      );
    }
    return buildCompletions();
  }

  // Divert Path
  if (
    leftStack[0]?.name === "DivertMark" &&
    !getNodeText(
      getDescendentInsideParent("Divert_content", "Divert", leftStack)
    )
  ) {
    if (isCursorAfterNodeText(leftStack[0])) {
      const scopes = getDeclarationScopes(read, scriptAnnotations);
      addDivertPathKeywords(completions, "", 0, " ");
      addDivertPathCompletions(
        completions,
        scopes,
        "",
        0,
        getParentSectionPath(leftStack, read).join("."),
        " "
      );
    }
    return buildCompletions();
  }
  if (
    isWhitespaceNode(leftStack[0]?.name) &&
    prevNode.name === "DivertMark" &&
    !getNodeText(
      getDescendentInsideParent("Divert_content", "Divert", leftStack)
    )
  ) {
    if (isCursorAfterNodeText(leftStack[0])) {
      const scopes = getDeclarationScopes(read, scriptAnnotations);
      addDivertPathKeywords(completions, "", 0);
      addDivertPathCompletions(
        completions,
        scopes,
        "",
        0,
        getParentSectionPath(leftStack, read).join(".")
      );
    }
    return buildCompletions();
  }
  if (leftStack[0]?.name === "DivertPath") {
    if (isCursorAfterNodeText(leftStack[0])) {
      const valueText = getNodeText(leftStack[0]);
      const valueCursorOffset = getCursorOffset(leftStack[0]);
      const scopes = getDeclarationScopes(read, scriptAnnotations);
      addDivertPathKeywords(completions, "", 0);
      addDivertPathCompletions(
        completions,
        scopes,
        valueText,
        valueCursorOffset,
        getParentSectionPath(leftStack, read).join(".")
      );
    }
    return buildCompletions();
  }

  return undefined;
};

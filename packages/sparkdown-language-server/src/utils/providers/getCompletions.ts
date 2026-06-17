import GRAMMAR_DEFINITION from "@impower/sparkdown/language/sparkdown.language-grammar.json";
import { SparkdownAnnotations } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { SparkdownCompilerConfig } from "@impower/sparkdown/src/compiler/types/SparkdownCompilerConfig";
import { SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { filterImage } from "@impower/sparkdown/src/compiler/utils/filterImage";
import { getProperty } from "@impower/sparkdown/src/compiler/utils/getProperty";
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
  InsertTextFormat,
  InsertTextMode,
  MarkupKind,
  type CompletionContext,
  type CompletionItem,
  type Position,
} from "vscode-languageserver";
import { getDeclarationScopes } from "../annotations/getDeclarationScopes";
import { getParentSectionPath } from "../syntax/getParentSectionPath";

const IMAGE_CONTROL_KEYWORDS =
  GRAMMAR_DEFINITION.variables.IMAGE_CONTROL_KEYWORDS || [];
const AUDIO_CONTROL_KEYWORDS =
  GRAMMAR_DEFINITION.variables.AUDIO_CONTROL_KEYWORDS || [];

const IMAGE_CLAUSE_KEYWORDS =
  GRAMMAR_DEFINITION.variables.IMAGE_CLAUSE_KEYWORDS || [];
const AUDIO_CLAUSE_KEYWORDS =
  GRAMMAR_DEFINITION.variables.AUDIO_CLAUSE_KEYWORDS || [];

const FLOW_BEAT_KEYWORDS =
  GRAMMAR_DEFINITION.variables.FLOW_BEAT_KEYWORDS || [];
const FLOW_MODULE_KEYWORDS =
  GRAMMAR_DEFINITION.variables.FLOW_MODULE_KEYWORDS || [];

const END_KEYWORDS = GRAMMAR_DEFINITION.variables.LUAU_END_KEYWORDS || [];
const FLOW_BLOCK_KEYWORDS =
  GRAMMAR_DEFINITION.variables.LUAU_FLOW_BLOCK_KEYWORDS || [];
const IF_BLOCK_KEYWORDS =
  GRAMMAR_DEFINITION.variables.LUAU_IF_BLOCK_KEYWORDS || [];
const LOOP_BLOCK_KEYWORDS =
  GRAMMAR_DEFINITION.variables.LUAU_LOOP_BLOCK_KEYWORDS || [];
const ITERATOR_KEYWORDS =
  GRAMMAR_DEFINITION.variables.LUAU_ITERATOR_KEYWORDS || [];
const REPEAT_BLOCK_KEYWORDS =
  GRAMMAR_DEFINITION.variables.LUAU_REPEAT_BLOCK_KEYWORDS || [];
const JUMP_KEYWORDS = GRAMMAR_DEFINITION.variables.LUAU_JUMP_KEYWORDS || [];
const RETURN_KEYWORDS = GRAMMAR_DEFINITION.variables.LUAU_RETURN_KEYWORDS || [];
const LOGICAL_KEYWORDS =
  GRAMMAR_DEFINITION.variables.LUAU_LOGICAL_KEYWORDS || [];
const MODULE_KEYWORDS = GRAMMAR_DEFINITION.variables.LUAU_MODULE_KEYWORDS || [];
const GLOBAL_DECLARATION_KEYWORDS =
  GRAMMAR_DEFINITION.variables.LUAU_GLOBAL_DECLARATION_KEYWORDS || [];
const LOCAL_DECLARATION_KEYWORDS =
  GRAMMAR_DEFINITION.variables.LUAU_LOCAL_DECLARATION_KEYWORDS || [];

const STYLING_DEFINE_TYPES =
  GRAMMAR_DEFINITION.variables.STYLING_DEFINE_TYPES || [];

const IMAGE_TYPES = ["filtered_image", "layered_image", "image"];
const AUDIO_TYPES = ["layered_audio", "audio", "synth"];
const LOGIC_KEYWORDS = ["temp", "return"];
const FLOW_KEYWORDS = ["DONE", "END"];

const INSERT_TEXT_CURSOR_REGEX = /[$]\d+/g;

const isPrefilteredName = (name: string) => name.includes("~");

// Top-level structural-define keyword node → the engine type it declares.
const STRUCTURAL_DEFINE_TYPE: Record<string, string> = {
  LuauStyle: "style",
  LuauScreen: "screen",
  LuauComponent: "component",
  LuauAnimation: "animation",
  LuauTheme: "theme",
};

// Resolve the engine `type` + instance `name` of the define enclosing the
// cursor, in the Luau-port inverted model:
//   - OOP `define <name> as <parent>` → type = parent, name = name.
//   - OOP root `define <name> with …`  → type = name, name = "$default".
//   - structural `<keyword> <name> …`  → type = keyword, name = name.
// Returns null when the cursor is not inside a define body. Used to drive
// struct property-name/value completions against `program.context[type]`.
const getDefineContext = (
  leftStack: GrammarSyntaxNode<SparkdownNodeName>[],
  read: (from: number, to: number) => string,
): { type: string; name: string } | null => {
  const structuralNode = leftStack.find((n) => STRUCTURAL_DEFINE_TYPE[n.name]);
  if (structuralNode) {
    const nameNode = getDescendent("LuauDefineName", structuralNode);
    return {
      type: STRUCTURAL_DEFINE_TYPE[structuralNode.name]!,
      name: nameNode ? read(nameNode.from, nameNode.to).trim() : "$default",
    };
  }
  const defineNode = leftStack.find((n) => n.name === "LuauDefine");
  if (defineNode) {
    const parentNode = getDescendent("LuauDefineParentName", defineNode);
    const nameNode = getDescendent("LuauDefineName", defineNode);
    const parent = parentNode
      ? read(parentNode.from, parentNode.to).trim()
      : "";
    const name = nameNode ? read(nameNode.from, nameNode.to).trim() : "";
    return { type: parent || name, name: parent ? name : "$default" };
  }
  return null;
};

const isWhitespaceNode = (name?: SparkdownNodeName) =>
  name === "RequiredWhitespace" ||
  name === "OptionalWhitespace" ||
  name === "ExtraWhitespace" ||
  name === "Whitespace";

const traverse = <T>(
  obj: T,
  process: (fieldPath: string, fieldValue: any) => void,
  fieldPath: string = "",
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
        if (Array.isArray(v)) {
          process(path, v);
        }
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
  contentNode: GrammarSyntaxNode<SparkdownNodeName> | undefined,
  strict: boolean,
  include?: string[],
) => {
  // Sort by most recently used
  const before: string[] = [];
  const after: string[] = [];
  const scriptAnnotationEntries = Array.from(scriptAnnotations.entries());
  const currentScriptIndex = scriptAnnotationEntries.findIndex(
    ([k]) => k === uri,
  );
  if (currentScriptIndex < 0) {
    return [];
  }
  const beforeScriptEntries = scriptAnnotationEntries.slice(
    0,
    currentScriptIndex,
  );
  const currentScriptEntries = [scriptAnnotationEntries[currentScriptIndex]!];
  const afterScriptEntries = scriptAnnotationEntries.slice(
    currentScriptIndex + 1,
  );
  const currentText = contentNode
    ? read(contentNode.from, contentNode.to)?.trim()
    : "";
  for (const [, annotations] of beforeScriptEntries) {
    const cur = annotations[type]?.iter();
    if (cur) {
      while (cur.value) {
        const text = read(cur.from, cur.to);
        if (
          (!strict && text !== currentText) ||
          (strict && text.startsWith(currentText))
        ) {
          before.push(text);
        }
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
          if (
            (!strict && text !== currentText) ||
            (strict && text.startsWith(currentText))
          ) {
            before.push(text);
          }
        } else if (cur.from > contentNode.from && cur.to > contentNode.to) {
          const text = read(cur.from, cur.to);
          if (
            (!strict && text !== currentText) ||
            (strict && text.startsWith(currentText))
          ) {
            after.push(text);
          }
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
        if (
          (!strict && text !== currentText) ||
          (strict && text.startsWith(currentText))
        ) {
          after.push(text);
        }
        cur.next();
      }
    }
  }
  const mostRecentTexts = Array.from(
    new Set([...before.toReversed(), ...after]),
  );
  // Most recent is the least likely to be used again,
  // So move it to the end of the list
  const mostRecentText = mostRecentTexts.shift();
  if (mostRecentText) {
    mostRecentTexts.push(mostRecentText);
  }
  if (include) {
    for (const name of include) {
      if (name && !name.startsWith("$")) {
        if (!strict || name.startsWith(currentText)) {
          mostRecentTexts.push(name);
        }
      }
    }
  }
  return mostRecentTexts;
};

const addCharacterCompletions = (
  completions: Map<string, CompletionItem>,
  read: (from: number, to: number) => string,
  scriptAnnotations: Map<string, SparkdownAnnotations>,
  uri: string,
  contentNode: GrammarSyntaxNode<SparkdownNodeName> | undefined,
  insertTextPrefix: string = "",
  insertTextSuffix: string = "",
  strict = false,
  program?: SparkProgram,
) => {
  const mostRecentTexts = rankMostRecentTexts(
    "characters",
    read,
    scriptAnnotations,
    uri,
    contentNode,
    strict,
    Object.keys(program?.context?.["character"] || {}),
  );
  // Add completions
  for (const text of mostRecentTexts) {
    const labelDetails = { description: "character" };
    const kind = CompletionItemKind.Constant;
    const completion: CompletionItem = {
      label: text,
      insertText: insertTextPrefix + text + insertTextSuffix,
      labelDetails,
      kind,
    };
    if (completion.label && !completions.has(completion.label)) {
      completions.set(completion.label, completion);
    }
  }
};

const addTriggeredKeywordCompletions = (
  completions: Map<string, CompletionItem>,
  description: string | undefined,
  keywords: string[],
  contentNode: GrammarSyntaxNode<SparkdownNodeName> | undefined,
  read: (from: number, to: number) => string,
) => {
  const currentText = contentNode
    ? read(contentNode.from, contentNode.to)?.trim()
    : "";
  for (const keyword of keywords) {
    if (keyword.startsWith(currentText)) {
      const completion: CompletionItem = {
        label: keyword,
        insertText: keyword,
        labelDetails: { description },
        kind: CompletionItemKind.Constant,
      };
      if (completion.label && !completions.has(completion.label)) {
        completions.set(completion.label, completion);
      }
    }
  }
};

const addKeywordCompletions = (
  completions: Map<string, CompletionItem>,
  description: string,
  keywords: string[],
  exclude?: string[],
  insertTextPrefix: string = "",
  insertTextSuffix: string = "",
) => {
  for (const keyword of keywords) {
    if (!exclude || !exclude.includes(keyword)) {
      const completion: CompletionItem = {
        label: keyword,
        insertText: insertTextPrefix + keyword + insertTextSuffix,
        labelDetails: { description },
        kind: CompletionItemKind.Constant,
      };
      if (completion.label && !completions.has(completion.label)) {
        completions.set(completion.label, completion);
      }
    }
  }
};

const addSnippet = (
  completions: Map<string, CompletionItem>,
  description: string,
  label: string,
  insertText: string,
) => {
  const completion: CompletionItem = {
    label,
    insertText,
    labelDetails: { description },
    kind: CompletionItemKind.Constant,
  };
  if (completion.label && !completions.has(completion.label)) {
    completions.set(completion.label, completion);
  }
};

const addStructTypeNameCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined,
  typeText: string,
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

const addStructReferenceCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined,
  types: string[],
  exclude?: string[] | ((name: string) => boolean),
) => {
  if (program) {
    for (const type of types) {
      const structs = program?.context?.[type];
      if (structs) {
        for (const name of Object.keys(structs)) {
          if (
            !name.startsWith("$") &&
            (!exclude ||
              (Array.isArray(exclude) && !exclude.includes(name)) ||
              (!Array.isArray(exclude) && !exclude(name)))
          ) {
            if (type === "filtered_image" && program.context) {
              filterImage(
                program.context,
                program.context?.["filtered_image"]?.[name],
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

const addScreenElementReferenceCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined,
  contentTypes: ("image" | "text" | "animation")[],
  insertTextPrefix = "",
  insertTextSuffix = "",
) => {
  for (const contentType of contentTypes) {
    const structs = program?.context?.["screen"];
    if (structs) {
      for (const v of Object.values(structs)) {
        traverse(v, (fieldPath) => {
          if (fieldPath.endsWith(`.${contentType}`)) {
            const layer = fieldPath.split(".").at(-2);
            if (layer) {
              const classNames = layer.split(" ");
              const firstClassName = classNames[0];
              if (firstClassName) {
                const completion: CompletionItem = {
                  label: firstClassName,
                  insertText:
                    insertTextPrefix + firstClassName + insertTextSuffix,
                  labelDetails: { description: "layer" },
                  kind: CompletionItemKind.Constructor,
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
  }
};

const addScriptCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined,
  exclude?: string[],
  insertTextPrefix = "",
  insertTextSuffix = "",
) => {
  if (program?.files) {
    for (const file of Object.values(program.files)) {
      if (file.type === "script") {
        const uri = file.uri;
        if (!exclude || !exclude.includes(uri)) {
          const workspace = program.workspace;
          const relativePath =
            workspace && uri.startsWith(workspace)
              ? uri.slice(workspace.length + 1)
              : uri;
          const extIndex = relativePath.lastIndexOf(".");
          const name =
            extIndex < 0 ? relativePath : relativePath.slice(0, extIndex);
          const completion: CompletionItem = {
            label: name,
            insertText: insertTextPrefix + name + insertTextSuffix,
            labelDetails: { description: "script" },
            kind: CompletionItemKind.File,
          };
          if (completion.label && !completions.has(completion.label)) {
            completions.set(completion.label, completion);
          }
        }
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
  return "<" + typeof v + ">";
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
  exclude?: string[],
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
                    : valueAssignmentSeparator;
              const completion: CompletionItem = {
                label: propName,
                insertText: propName + insertSuffix,
                kind: CompletionItemKind.Property,
                insertTextMode: InsertTextMode.asIs,
                command: Command.create(
                  "suggest",
                  "editor.action.triggerSuggest",
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
                  p,
                )?.[""] ||
                getProperty<Record<string, string>>(
                  config?.definitions?.descriptions?.[typeStruct.$type]?.[
                    "$description"
                  ],
                  p,
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
  exclude: string[],
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
      exclude,
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
      exclude,
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
      exclude,
    );
    addStructPropertyNameContextCompletions(
      completions,
      program,
      config,
      config?.definitions?.optionals?.[type]?.["$optional"],
      modifier,
      path,
      valueAssignmentSeparator,
      includeTypeAsDetail,
      lineText,
      cursorPosition,
      exclude,
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
  context: CompletionContext | undefined,
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
            const insertTextPrefix =
              context?.triggerCharacter === "=" ? " " : "";
            const insertText = insertTextPrefix + option;
            if (typeof option === "string") {
              if (!valueText) {
                const insertTextWithoutCursorSyntax = insertText.replace(
                  INSERT_TEXT_CURSOR_REGEX,
                  "",
                );
                if (insertTextWithoutCursorSyntax) {
                  const label = STYLING_DEFINE_TYPES.includes(
                    schemaStruct.$type,
                  )
                    ? insertTextWithoutCursorSyntax
                    : `"${insertTextWithoutCursorSyntax}"`;
                  const insertTextFormat = insertText.includes("$")
                    ? InsertTextFormat.Snippet
                    : undefined;
                  const completion: CompletionItem = {
                    label,
                    insertText,
                    kind,
                    insertTextFormat,
                  };
                  if (completion.label && !completions.has(completion.label)) {
                    completions.set(completion.label, completion);
                  }
                }
              } else if (
                context?.triggerCharacter === '"' &&
                valueCursorOffset === 1
              ) {
                const label = insertText.replace(INSERT_TEXT_CURSOR_REGEX, "");
                if (label) {
                  const insertTextFormat = insertText.includes("$")
                    ? InsertTextFormat.Snippet
                    : undefined;
                  const completion: CompletionItem = {
                    label,
                    insertText,
                    kind,
                    insertTextFormat,
                  };
                  if (completion.label && !completions.has(completion.label)) {
                    completions.set(completion.label, completion);
                  }
                }
              } else if (STYLING_DEFINE_TYPES.includes(schemaStruct.$type)) {
                const insertTextWithoutCursorSyntax = insertText.replace(
                  INSERT_TEXT_CURSOR_REGEX,
                  "",
                );
                if (insertTextWithoutCursorSyntax) {
                  const label = insertTextWithoutCursorSyntax;
                  const insertTextFormat = insertText.includes("$")
                    ? InsertTextFormat.Snippet
                    : undefined;
                  const completion: CompletionItem = {
                    label,
                    insertText,
                    kind,
                    insertTextFormat,
                  };
                  if (completion.label && !completions.has(completion.label)) {
                    completions.set(completion.label, completion);
                  }
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
  path: string,
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
  context: CompletionContext | undefined,
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
      context,
    );
    addStructPropertyValueSchemaCompletions(
      completions,
      program,
      program?.context?.[type]?.["$schema"],
      modifier,
      path,
      valueText,
      valueCursorOffset,
      context,
    );
    addStructPropertyValueSchemaCompletions(
      completions,
      program,
      config?.definitions?.schemas?.[type]?.["$schema"],
      modifier,
      path,
      valueText,
      valueCursorOffset,
      context,
    );
    addStructPropertyValueContextCompletions(
      completions,
      program,
      program?.context?.[type]?.["$default"],
      modifier,
      path,
    );
    addStructPropertyValueContextCompletions(
      completions,
      program,
      program?.context?.[type]?.[`$optional:${name}`],
      modifier,
      path,
    );
    addStructPropertyValueContextCompletions(
      completions,
      program,
      program?.context?.[type]?.["$optional"],
      modifier,
      path,
    );
    addStructPropertyValueContextCompletions(
      completions,
      program,
      config?.definitions?.optionals?.[type]?.["$optional"],
      modifier,
      path,
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
  insertTextPrefix: string = "",
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
  insertTextPrefix: string = "",
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
  insertTextPrefix: string = "",
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
  insertTextPrefix: string = "",
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
        insertTextPrefix,
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
  insertTextPrefix: string = "",
) => {
  const valueTextAfterCursor = valueText.slice(valueCursorOffset);
  if (!valueTextAfterCursor) {
    const parts = valueText?.split(".") || [];
    if (scopes) {
      const types = ["scene", "branch", "knot", "stitch", "label"];
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
  context: CompletionContext | undefined,
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
    -1,
  );

  if (!leftStack[0]) {
    return null;
  }

  const read = (from: number, to: number) => document.read(from, to);

  const getNodeText = (node: SyntaxNode | undefined | null) =>
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
  const nextCursor = tree.cursorAt(leftStack[0].to + 1, side);
  const prevNode = prevCursor.node as GrammarSyntaxNode<SparkdownNodeName>;
  const nextNode = nextCursor.node as GrammarSyntaxNode<SparkdownNodeName>;
  const prevText = getNodeText(prevNode);

  // console.log("program", program);
  // console.log(printTree(tree, document.getText()));
  // console.log(leftStack.map((n) => n.type.name));
  // console.log("prev", prevNode.name);
  // console.log("next", nextNode.name);

  // FrontMatter
  if (
    leftStack.some((n) => n.name === "FrontMatter") &&
    leftStack[0]?.name === "Newline"
  ) {
    const rightStack = getStack<SparkdownNodeName>(
      tree,
      document.offsetAt(position),
      1,
    );
    if (rightStack[0]?.name === "Newline") {
      // left and right side of the cursor has a Newline,
      // so this is a completely blank line.
      const lineText = document.getLineText(position.line);
      const exclude = getDescendentsInsideParent(
        "FrontMatterFieldKeyword",
        "FrontMatter",
        leftStack,
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
        exclude,
      );
      return buildCompletions();
    }
  }
  if (leftStack[0]?.name === "FrontMatterFieldKeyword") {
    const lineText = document.getLineText(position.line);
    const exclude = getOtherNodesInsideParent(
      "FrontMatterField",
      "FrontMatter",
      leftStack,
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
      exclude,
    );
    return buildCompletions();
  }

  // Include
  if (
    (isWhitespaceNode(leftStack[0]?.name) &&
      prevNode?.name === "IncludeKeyword") ||
    (isWhitespaceNode(leftStack[0]?.name) &&
      leftStack.some((n) => n?.name === "Include_begin")) ||
    leftStack.some((n) => n?.name === "IncludeContent")
  ) {
    const includeContentNode = getDescendentInsideParent(
      "IncludeContent",
      "Include",
      leftStack,
    );
    if (isCursorAfterNodeText(includeContentNode)) {
      addScriptCompletions(completions, program, [document.uri]);
    }
    return buildCompletions();
  }

  // Dialogue
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
        leftStack,
      ) ||
      getDescendentInsideParent(
        "DialogueCharacter",
        "InlineDialogue_begin",
        leftStack,
      );
    if (isCursorAfterNodeText(dialogueCharacterNode)) {
      addCharacterCompletions(
        completions,
        read,
        scriptAnnotations,
        document.uri,
        dialogueCharacterNode,
      );
    }
    return buildCompletions();
  }

  // Write
  if (leftStack[0]?.name === "WriteMark") {
    if (isCursorAfterNodeText(leftStack[0])) {
      addScreenElementReferenceCompletions(completions, program, ["text"], " ");
    }
    return buildCompletions();
  }
  if (
    (isWhitespaceNode(leftStack[0]?.name) && prevNode?.name === "WriteMark") ||
    (isWhitespaceNode(leftStack[0]?.name) &&
      leftStack.some((n) => n?.name === "BlockWrite_begin")) ||
    leftStack.some((n) => n?.name === "WriteTarget")
  ) {
    const writeTargetNode = getDescendentInsideParent(
      "WriteTarget",
      "BlockWrite_begin",
      leftStack,
    );
    if (isCursorAfterNodeText(writeTargetNode)) {
      addScreenElementReferenceCompletions(completions, program, ["text"]);
    }
    return buildCompletions();
  }

  // ImageCommand
  if (leftStack.some((n) => n.type.name === "ImageCommand")) {
    const beforeImageNode = leftStack.find(
      (n) => n.type.name === "ImageBeginMark",
    );
    if (beforeImageNode) {
      if (isCursorAfterNodeText(beforeImageNode)) {
        addKeywordCompletions(completions, "control", IMAGE_CONTROL_KEYWORDS);
        addStructReferenceCompletions(
          completions,
          program,
          IMAGE_TYPES,
          isPrefilteredName,
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
        leftStack,
      );
      const control = getNodeText(controlNode);
      if (isCursorAfterNodeText(leftStack[0])) {
        addScreenElementReferenceCompletions(
          completions,
          program,
          control === "animate" ? ["animation", "image"] : ["image"],
        );
      }
      return buildCompletions();
    }
    if (
      (isWhitespaceNode(leftStack[0]?.name) &&
        (prevNode.name === "AssetCommandTarget" ||
          prevNode.name === "AssetCommandFileName" ||
          prevNode.name === "AssetCommandAddOperator")) ||
      leftStack[0]?.name === "AssetCommandAddOperator"
    ) {
      if (isCursorAfterNodeText(leftStack[0])) {
        const controlNode = getDescendentInsideParent(
          "AssetCommandControl",
          "ImageCommand",
          leftStack,
        );
        const control = getNodeText(controlNode);
        const clauses =
          control === "animate"
            ? ["with", ...IMAGE_CLAUSE_KEYWORDS.filter((k) => k !== "with")]
            : IMAGE_CLAUSE_KEYWORDS;
        addKeywordCompletions(completions, "clause", clauses);
        if (control !== "hide" && control !== "animate") {
          addStructReferenceCompletions(
            completions,
            program,
            IMAGE_TYPES,
            isPrefilteredName,
          );
        }
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
          isPrefilteredName,
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
          read,
        );
        addStructReferenceCompletions(
          completions,
          program,
          ["filter"],
          exclude,
        );
      }
      return buildCompletions();
    }
    if (
      (isWhitespaceNode(leftStack[0]?.name) &&
        prevNode?.name === "AssetCommandClauseKeyword" &&
        prevText === "with") ||
      (leftStack[0]?.name === "NameValue" &&
        getNodeText(leftStack[0].node.prevSibling?.prevSibling) === "with")
    ) {
      if (isCursorAfterNodeText(leftStack[0])) {
        const controlNode = getDescendentInsideParent(
          "AssetCommandControl",
          "ImageCommand",
          leftStack,
        );
        const control = getNodeText(controlNode);
        const types =
          control === "animate"
            ? ["animation"]
            : control === "show"
              ? ["transition"]
              : ["transition", "animation"];
        addStructReferenceCompletions(completions, program, types);
      }
      return buildCompletions();
    }
    if (
      (isWhitespaceNode(leftStack[0]?.name) &&
        prevNode?.name === "AssetCommandClauseKeyword" &&
        prevText === "ease") ||
      (leftStack[0]?.name === "NameValue" &&
        getNodeText(leftStack[0].node.prevSibling?.prevSibling) === "ease")
    ) {
      if (isCursorAfterNodeText(leftStack[0])) {
        addStructReferenceCompletions(completions, program, ["ease"]);
      }
      return buildCompletions();
    }
    if (
      isWhitespaceNode(leftStack[0]?.name) &&
      nextNode?.name !== "AssetCommandAddOperator" &&
      nextNode?.name !== "AssetCommandFileName" &&
      prevNode?.name !== "ImageBeginMark" &&
      prevNode?.name !== "ImageEndMark"
    ) {
      if (isCursorAfterNodeText(leftStack[0])) {
        const prevClauseTakesArgument =
          prevNode?.name === "AssetCommandClauseKeyword" &&
          (prevText === "after" ||
            prevText === "over" ||
            prevText === "with" ||
            prevText === "to");
        if (!prevClauseTakesArgument) {
          const exclude = getOtherMatchesInsideParent(
            "AssetCommandClauseKeyword",
            "ImageCommand",
            leftStack,
            tree,
            read,
          );
          addKeywordCompletions(
            completions,
            "clause",
            IMAGE_CLAUSE_KEYWORDS,
            exclude,
          );
        }
      }
      return buildCompletions();
    }
  }

  // AudioCommand
  if (leftStack.some((n) => n.type.name === "AudioCommand")) {
    const beforeAudioNode = leftStack.find(
      (n) => n.type.name === "AudioBeginMark",
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
      (isWhitespaceNode(leftStack[0]?.name) &&
        (prevNode.name === "AssetCommandTarget" ||
          prevNode.name === "AssetCommandFileName" ||
          prevNode.name === "AssetCommandAddOperator")) ||
      leftStack[0]?.name === "AssetCommandAddOperator"
    ) {
      if (isCursorAfterNodeText(leftStack[0])) {
        const controlNode = getDescendentInsideParent(
          "AssetCommandControl",
          "AudioCommand",
          leftStack,
        );
        const control = getNodeText(controlNode);
        addKeywordCompletions(completions, "clause", AUDIO_CLAUSE_KEYWORDS);
        if (control !== "stop") {
          addStructReferenceCompletions(completions, program, AUDIO_TYPES);
        }
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
          read,
        );
        addStructReferenceCompletions(
          completions,
          program,
          ["filter"],
          exclude,
        );
      }
      return buildCompletions();
    }
    if (
      (isWhitespaceNode(leftStack[0]?.name) &&
        prevNode?.name === "AssetCommandClauseKeyword" &&
        prevText === "with") ||
      leftStack[0]?.name === "NameValue"
    ) {
      if (isCursorAfterNodeText(leftStack[0])) {
        addStructReferenceCompletions(completions, program, ["modulation"]);
      }
      return buildCompletions();
    }
    if (
      isWhitespaceNode(leftStack[0]?.name) &&
      nextNode?.name !== "AssetCommandAddOperator" &&
      nextNode?.name !== "AssetCommandFileName" &&
      prevNode?.name !== "AudioBeginMark" &&
      prevNode?.name !== "AudioEndMark"
    ) {
      if (isCursorAfterNodeText(leftStack[0])) {
        const prevClauseTakesArgument =
          prevNode?.name === "AssetCommandClauseKeyword" &&
          (prevText === "after" ||
            prevText === "over" ||
            prevText === "with" ||
            prevText === "to");
        if (!prevClauseTakesArgument) {
          const exclude = getOtherMatchesInsideParent(
            "AssetCommandClauseKeyword",
            "AudioCommand",
            leftStack,
            tree,
            read,
          );
          addKeywordCompletions(
            completions,
            "clause",
            AUDIO_CLAUSE_KEYWORDS,
            exclude,
          );
        }
        return buildCompletions();
      }
    }
  }

  // Define / structural (style/screen/component/animation/theme).
  //
  // The Luau port inverted the model (`define <name> as <TYPE>`) and flattened
  // the struct body into indentation-nested LuauStructScalarProperty /
  // ObjectHeader / ArrayItem lines, so the pre-port node names this section
  // keyed on (DefineTypeName / DefineVariableName / *DeclarationScalarPropertyName
  // / ViewStructField …) are all gone. Re-derive against the current grammar.

  // Type completion: in the inverted model the engine type is the PARENT, so
  // offer type names after `as`.
  if (
    (isWhitespaceNode(leftStack[0]?.name) &&
      prevNode.name === "LuauAsKeyword") ||
    leftStack.some((n) => n.name === "LuauDefineParentName")
  ) {
    const parentNode = leftStack.find(
      (n) => n.type.name === "LuauDefineParentName",
    );
    if (isCursorAfterNodeText(parentNode)) {
      const type = parentNode ? getNodeText(parentNode) : "";
      addStructTypeNameCompletions(completions, program, type);
    }
    return buildCompletions();
  }

  // Struct property NAME completion: cursor editing a struct key. The engine
  // type + instance name come from the enclosing define (getDefineContext).
  // NOTE: the nested property PATH (deep keys) is not yet recovered — the
  // pre-port wrapper-node path tracker (getParentPropertyPath) is dead under the
  // flat indentation grammar; top-level property names are offered (path ""),
  // which covers the common case. Deep-path completion is a follow-up tied to
  // the reactive-sparkle struct grammar.
  const structKeyNode = leftStack.find(
    (n) =>
      n.type.name === "StylingDeclarationScalarPropertyName" ||
      n.type.name === "DeclarationScalarPropertyKey" ||
      n.type.name === "BuiltinComponentName" ||
      n.type.name === "CustomComponentName" ||
      n.type.name === "ComponentName" ||
      n.type.name === "PropertyName" ||
      n.type.name === "SelectorPropertyNamePart",
  );
  if (
    structKeyNode &&
    document.positionAt(structKeyNode.from).line === position.line
  ) {
    if (isCursorAfterNodeText(structKeyNode)) {
      const defineContext = getDefineContext(leftStack, read);
      if (defineContext) {
        const lineText = document.getLineText(position.line);
        addStructPropertyNameCompletions(
          completions,
          program,
          config,
          "",
          defineContext.type,
          defineContext.name,
          "",
          " = ",
          true,
          lineText,
          position,
          [],
        );
      }
    }
    return buildCompletions();
  }

  // Struct property VALUE completion: cursor after `=` in a scalar property
  // line (but not inside a `type.name` struct-reference access path, handled
  // below). Offers the property's schema/option values for the top-level key.
  const scalarPropertyNode = leftStack.find(
    (n) => n.type.name === "LuauStructScalarProperty",
  );
  if (
    scalarPropertyNode &&
    ((isWhitespaceNode(leftStack[0]?.name) &&
      prevNode.name === "AssignEqualOperator") ||
      leftStack.some(
        (n) =>
          n.type.name === "AssignEqualOperator" ||
          n.type.name === "StylingValue" ||
          n.type.name === "StringFieldValue" ||
          n.type.name === "NumericFieldValue" ||
          n.type.name === "BooleanFieldValue" ||
          n.type.name === "UnquotedStringFieldValue",
      )) &&
    !leftStack.some(
      (n) =>
        n.type.name === "LuauAccessPath" || n.type.name === "StylingAccessPath",
    )
  ) {
    const defineContext = getDefineContext(leftStack, read);
    const keyNode = getDescendent(
      [
        "StylingDeclarationScalarPropertyName",
        "DeclarationScalarPropertyKey",
        "BuiltinComponentName",
      ],
      scalarPropertyNode,
    );
    if (defineContext && keyNode) {
      const propertyName = getNodeText(keyNode).trim();
      const valueNode = getDescendent(
        [
          "StylingValue",
          "StringFieldValue",
          "NumericFieldValue",
          "BooleanFieldValue",
          "UnquotedStringFieldValue",
        ],
        scalarPropertyNode,
      );
      const valueText = valueNode ? getNodeText(valueNode) : "";
      const valueCursorOffset = getCursorOffset(valueNode ?? undefined);
      addStructPropertyValueCompletions(
        completions,
        program,
        config,
        "",
        defineContext.type,
        defineContext.name,
        "." + propertyName,
        valueText,
        valueCursorOffset,
        context,
      );
    }
    return buildCompletions();
  }

  // Access Path. The Luau port split the single pre-port `AccessPath` into
  // `StylingAccessPath` (a `type.name` struct-reference inside a struct value)
  // and `LuauAccessPath` (a Luau-code / `{interpolation}` identifier path), so
  // the access-path kind itself now selects struct-reference vs scope
  // completions — no `ViewStructField` wrapper lookup needed.
  const accessPathNode = leftStack.find(
    (n) =>
      n.type.name === "LuauAccessPath" || n.type.name === "StylingAccessPath",
  );
  if (accessPathNode) {
    const valueText = getNodeText(accessPathNode);
    const valueCursorOffset = getCursorOffset(accessPathNode);
    if (accessPathNode.type.name === "StylingAccessPath") {
      addStructAccessPathCompletions(
        completions,
        program,
        valueText,
        valueCursorOffset,
      );
    } else {
      const scopes = getDeclarationScopes(read, scriptAnnotations);
      const scopePath = getParentSectionPath(leftStack, read).join(".");
      addMutableAccessPathCompletions(
        completions,
        scopes,
        valueText,
        valueCursorOffset,
        scopePath,
      );
      addImmutableAccessPathCompletions(
        completions,
        scopes,
        valueText,
        valueCursorOffset,
        scopePath,
      );
      addDivertPathCompletions(
        completions,
        scopes,
        valueText,
        valueCursorOffset,
        scopePath,
      );
    }
    return buildCompletions();
  }

  // Divert Path
  if (
    leftStack[0]?.name === "DivertMark" &&
    !getNodeText(
      getDescendentInsideParent("Divert_content", "Divert", leftStack),
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
        " ",
      );
    }
    return buildCompletions();
  }
  if (
    isWhitespaceNode(leftStack[0]?.name) &&
    prevNode.name === "DivertMark" &&
    !getNodeText(
      getDescendentInsideParent("Divert_content", "Divert", leftStack),
    ).trim()
  ) {
    if (isCursorAfterNodeText(leftStack[0])) {
      const scopes = getDeclarationScopes(read, scriptAnnotations);
      addDivertPathKeywords(completions, "", 0);
      addDivertPathCompletions(
        completions,
        scopes,
        "",
        0,
        getParentSectionPath(leftStack, read).join("."),
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
        getParentSectionPath(leftStack, read).join("."),
      );
    }
    return buildCompletions();
  }
  const divertPathNode = leftStack.find((n) => n.type.name === "DivertPath");
  if (
    divertPathNode &&
    (leftStack[0]?.name === "PunctuationAccessor" ||
      leftStack[0]?.name === "DivertPartName")
  ) {
    if (isCursorAfterNodeText(divertPathNode)) {
      const valueText = getNodeText(divertPathNode);
      const valueCursorOffset = getCursorOffset(divertPathNode);
      const scopes = getDeclarationScopes(read, scriptAnnotations);
      addDivertPathKeywords(completions, "", 0);
      addDivertPathCompletions(
        completions,
        scopes,
        valueText,
        valueCursorOffset,
        getParentSectionPath(leftStack, read).join("."),
      );
    }
    return buildCompletions();
  }

  const rootLevelNode = leftStack.at(-2);

  if (rootLevelNode) {
    if (
      leftStack.some(
        (n) => n.name === "LuauIfBlock" || n.name === "LuauSparkdownIfBlock",
      )
    ) {
      const contentNode = leftStack[0];
      if (contentNode) {
        addTriggeredKeywordCompletions(
          completions,
          "flow",
          IF_BLOCK_KEYWORDS,
          contentNode,
          read,
        );
      }
    }
    if (
      leftStack.some(
        (n) =>
          n.name === "LuauForLoop" ||
          n.name === "LuauSparkdownForLoop" ||
          n.name === "LuauWhileLoop" ||
          n.name === "LuauSparkdownWhileLoop" ||
          n.name === "LuauRepeatLoop" ||
          n.name === "LuauSparkdownRepeatLoop",
      )
    ) {
      const contentNode = leftStack[0];
      if (contentNode) {
        addTriggeredKeywordCompletions(
          completions,
          "flow",
          LOOP_BLOCK_KEYWORDS,
          contentNode,
          read,
        );
      }
    }
    if (leftStack.some((n) => n.name === "LuauForCondition")) {
      const contentNode = leftStack[0];
      if (contentNode) {
        addTriggeredKeywordCompletions(
          completions,
          "iteration",
          ITERATOR_KEYWORDS,
          contentNode,
          read,
        );
      }
    }
    if (
      leftStack.some(
        (n) =>
          n.name === "LuauRepeatLoop" || n.name === "LuauSparkdownRepeatLoop",
      )
    ) {
      const contentNode = leftStack[0];
      if (contentNode) {
        addTriggeredKeywordCompletions(
          completions,
          "flow",
          REPEAT_BLOCK_KEYWORDS,
          contentNode,
          read,
        );
      }
    }

    if (rootLevelNode.name === "LuauFunctionDefinition") {
      const contentNode = leftStack[0];
      if (contentNode) {
        addTriggeredKeywordCompletions(
          completions,
          "flow",
          END_KEYWORDS,
          contentNode,
          read,
        );
        addTriggeredKeywordCompletions(
          completions,
          "flow",
          RETURN_KEYWORDS,
          contentNode,
          read,
        );
        addTriggeredKeywordCompletions(
          completions,
          "declare",
          LOCAL_DECLARATION_KEYWORDS,
          contentNode,
          read,
        );
        addTriggeredKeywordCompletions(
          completions,
          "flow",
          FLOW_BLOCK_KEYWORDS,
          contentNode,
          read,
        );
        addTriggeredKeywordCompletions(
          completions,
          "flow",
          JUMP_KEYWORDS,
          contentNode,
          read,
        );
        addTriggeredKeywordCompletions(
          completions,
          "logic",
          LOGICAL_KEYWORDS,
          contentNode,
          read,
        );
      }

      return buildCompletions();
    }

    if (
      rootLevelNode.name === "LuauSparkdownIfBlock" ||
      rootLevelNode.name === "LuauSparkdownElseifBlock" ||
      rootLevelNode.name === "LuauSparkdownElseBlock" ||
      rootLevelNode.name === "LuauSparkdownForLoop" ||
      rootLevelNode.name === "LuauSparkdownWhileLoop" ||
      rootLevelNode.name === "LuauSparkdownRepeatLoop" ||
      rootLevelNode.name === "LuauSparkdownDoBlock" ||
      rootLevelNode.name === "ImplicitAction"
    ) {
      const contentNode = leftStack.find((n) => n.name === "ImplicitAction");
      const text = getNodeText(contentNode).trimStart();
      if (isCursorAfterNodeText(contentNode)) {
        if (text === "@") {
          addScreenElementReferenceCompletions(
            completions,
            program,
            ["text"],
            " ",
            ": ",
          );
        } else if (text === "^") {
          addSnippet(completions, "title", "^:", ": ");
        } else if (text === "$") {
          addSnippet(completions, "heading", "$:", ": ");
        } else if (text === "%") {
          addSnippet(completions, "transitional", "%:", ": ");
        } else {
          addCharacterCompletions(
            completions,
            read,
            scriptAnnotations,
            document.uri,
            contentNode,
            "",
            ": ",
            true,
            program,
          );
        }

        addTriggeredKeywordCompletions(
          completions,
          "flow",
          END_KEYWORDS,
          contentNode,
          read,
        );
        addTriggeredKeywordCompletions(
          completions,
          "flow",
          RETURN_KEYWORDS,
          contentNode,
          read,
        );
        addTriggeredKeywordCompletions(
          completions,
          "declare",
          LOCAL_DECLARATION_KEYWORDS,
          contentNode,
          read,
        );
        addTriggeredKeywordCompletions(
          completions,
          "flow",
          END_KEYWORDS,
          contentNode,
          read,
        );
        addTriggeredKeywordCompletions(
          completions,
          "flow",
          FLOW_BLOCK_KEYWORDS,
          contentNode,
          read,
        );
        addTriggeredKeywordCompletions(
          completions,
          "logic",
          LOGICAL_KEYWORDS,
          contentNode,
          read,
        );
        addTriggeredKeywordCompletions(
          completions,
          "beat",
          FLOW_BEAT_KEYWORDS,
          contentNode,
          read,
        );
        addTriggeredKeywordCompletions(
          completions,
          "flow",
          FLOW_MODULE_KEYWORDS,
          contentNode,
          read,
        );
        if (rootLevelNode.name === "ImplicitAction") {
          addTriggeredKeywordCompletions(
            completions,
            "module",
            MODULE_KEYWORDS,
            contentNode,
            read,
          );
          addTriggeredKeywordCompletions(
            completions,
            "declare",
            GLOBAL_DECLARATION_KEYWORDS,
            contentNode,
            read,
          );
        }
      }
      return buildCompletions();
    }
  }

  return undefined;
};

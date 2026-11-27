import { isExplicitRuleName } from "@impower/sparkdown/src/compiler/utils/explicitRuleNames";
import GRAMMAR_DEFINITION from "@impower/sparkdown/language/sparkdown.language-grammar.json";
import { resolveAttributes, type AttributeVocabulary } from "@impower/sparkdown/src/attributes";
import { SparkdownAnnotations } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { type DeclarationType } from "@impower/sparkdown/src/compiler/classes/annotators/DeclarationAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { SparkdownCompilerConfig } from "@impower/sparkdown/src/compiler/types/SparkdownCompilerConfig";
import { SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import {
  braceBlockPathAt,
  braceEntryAt,
  entryInsideValue,
  insideElementValue,
  structBlockKeyNode,
  structKeyToken,
} from "@impower/sparkdown/src/compiler/utils/braceBlocks";
import { getProperty } from "@impower/sparkdown/src/compiler/utils/getProperty";
import { layoutNames, showingNames } from "@impower/sparkdown/src/compiler/utils/layoutElementNames";
import { picturedCharacters } from "@impower/sparkdown/src/compiler/utils/picturedCharacters";
import { nodeNameSet } from "@impower/sparkdown/src/compiler/utils/nodeNameSet";
import {
  luauFileName,
  projectLuauFiles,
} from "@impower/sparkdown/src/compiler/utils/projectMembership";
import {
  quotedRunPath,
  relativeRunPath,
} from "@impower/sparkdown/src/compiler/utils/runOperand";
import { resolveImageAttributes } from "@impower/sparkdown/src/compiler/utils/filterImage";
import { MORPH_CLAUSE_DOC } from "@impower/sparkdown/src/compiler/morph/morphSchema";
import { ASSET_TYPES } from "@impower/sparkdown/src/compiler/constants/assetTypes";
import { PRESENCE_STATES } from "@impower/sparkdown/src/compiler/constants/selectorStates";
import { resolveImageReference, typedImageTypes } from "@impower/sparkdown/src/compiler/utils/resolveImageReference";
import { sortFilteredName } from "@impower/sparkdown/src/compiler/utils/sortFilteredName";
import { resolvePictureLook } from "@impower/sparkdown/src/morph/look";
import { MORPH_PICK_NONE } from "@impower/sparkdown/src/morph/types";
import { keywordOfValue } from "@impower/sparkdown/src/compiler/utils/assetClauseTree";
import {
  DIRECTIVE_CLOSERS,
  DIRECTIVE_KINDS_WITH_SEVERAL_WITHS,
  DIRECTIVE_WITH_OWNED_WORDS,
  directiveKind,
  readDirective,
  type DirectiveReading,
} from "@impower/sparkdown/src/compiler/utils/readDirective";
import { cueVariant, readSpeakerBeingWritten } from "@impower/sparkdown/src/compiler/utils/readCue";
import { directiveOwnLookPick } from "@impower/sparkdown/src/compiler/utils/directiveOwnLook";
import { ASSET_VALUE_CLAUSE_WORDS } from "@impower/sparkdown/language/sparkdown.clause-words";
import { type GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { getDescendentInsideParent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendentInsideParent";
import { getDescendentsInsideParent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendentsInsideParent";
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
  type Range,
} from "vscode-languageserver";
import {
  getDeclarationScopes,
  type AnnotatedScript,
  type DeclarationScopes,
} from "../annotations/getDeclarationScopes";
import { getParentSectionPath } from "../syntax/getParentSectionPath";
import { getClearPropCompletion } from "./clearPropHelp";
import { getMorphCompletions } from "./getMorphCompletions";
import {
  ALTERNATOR_KEYWORDS,
  alternatorKeywordDocumentation,
  alternatorOptionStartAt,
} from "./alternatorKeywordHelp";
import { isLayoutVerb, LAYOUT_VERBS } from "@impower/sparkdown/language/sparkdown.layout-verbs";
import { layoutDirectiveTargetNames } from "@impower/sparkdown/src/compiler/utils/layoutDirectiveTargets";
import { LAYOUT_CONTROL_DESCRIPTIONS } from "./layoutControlDescriptions";
import { getStyleValueDescription } from "./styleValueDescriptions";
import { templatedElementCompletions } from "./streamElementHelp";
import { presenceBlockDocumentation } from "./presenceBlockHelp";
import {
  isValuelessAttribute,
  labelKindOfProp,
  propOfAttribute,
  SELECTABLE_PROPS,
  selectorAttributeDocumentation,
  selectorPropDocumentation,
} from "./selectorAttributeHelp";
import { DATA_ATTRIBUTE_PROPS, toDataAttributeName } from "@impower/sparkdown/src/compiler/constants/dataAttributeProps";

const IMAGE_CONTROL_KEYWORDS =
  GRAMMAR_DEFINITION.variables.IMAGE_CONTROL_KEYWORDS || [];
const AUDIO_CONTROL_KEYWORDS =
  GRAMMAR_DEFINITION.variables.AUDIO_CONTROL_KEYWORDS || [];
const MOVIE_CONTROL_KEYWORDS: string[] =
  GRAMMAR_DEFINITION.variables.MOVIE_CONTROL_KEYWORDS || [];
const BRACKET_CONTROL_KEYWORDS = [
  ...IMAGE_CONTROL_KEYWORDS,
  ...MOVIE_CONTROL_KEYWORDS,
  ...LAYOUT_VERBS,
];
const CUTSCENE_CLAUSE_KEYWORDS = ["loop", "mute", "with"];

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

const STYLING_DEFINE_TYPES: string[] = ["style"];

const IMAGE_TYPES = ["filtered_image", "layered_image", "image"];
const IMAGE_COMMAND_NAME_TYPES = [...IMAGE_TYPES, "video"];
const MOVIE_CLAUSE_KEYWORDS = ["loop", "once", "mute"];
const VALUE_CLAUSE_KEYWORDS: readonly string[] = ASSET_VALUE_CLAUSE_WORDS;
const AUDIO_TYPES = ["layered_audio", "audio", "synth"];
const VIDEO_TYPES = ["video"];
const FLOW_KEYWORDS = ["DONE", "END"];

const INSERT_TEXT_CURSOR_REGEX = /[$]\d+/g;

const isPrefilteredName = (name: string) => name.includes(":");

const unclosedOpenerBefore = (
  tree: Tree,
  lineFrom: number,
  offset: number,
  read: (from: number, to: number) => string,
): string | undefined => {
  let opener: { from: number; to: number } | undefined;
  tree.iterate({
    from: lineFrom,
    to: offset,
    enter: (node) => {
      if (node.name === "LiteralDirectiveOpener" && node.to <= offset) {
        opener = { from: node.from, to: node.to };
      }
    },
  });
  if (!opener || !/^(?:[_\p{L}][0-9_\p{L}-]*(?:@[0-9_\p{L}][0-9_\p{L}-]*)*)?$/u.test(read(opener.to, offset))) {
    return undefined;
  }
  return read(opener.from, opener.to);
};

const STRUCTURAL_DEFINE_TYPE: Partial<Record<SparkdownNodeName, string>> = {
  LuauStyle: "style",
  LuauLayout: "layout",
  LuauScreen: "screen",
  LuauComponent: "component",
  LuauAnimation: "animation",
  LuauTheme: "theme",
  LuauFraming: "framing",
  LuauMorph: "morph",
};

const STRUCT_KEYWORD_HEADER_NAMES = nodeNameSet([
  "LuauStyleNameAndInheritance",
  "LuauAnimationThemeNameAndInheritance",
  "LuauLayoutNameAndInheritance",
  "LuauComponentNameAndInheritance",
  "LuauScreenNameHeader",
]);

const STRUCT_KEYWORD_HEADER_END_NAMES = nodeNameSet([
  "LuauDefineName",
  "LuauDefineParentName",
  "LuauLayoutScreenName",
]);

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

const DEFINE_VALUE_ASSET_TYPES: ReadonlySet<string> = new Set(ASSET_TYPES);

const KEYFRAME_POSITION_KEYWORDS = ["from", "to"];

const blockStates = (
  declaration: SyntaxNode,
  tree: Tree,
  read: (from: number, to: number) => string,
): { states: { container: string; state: string }[]; keyframes: boolean } => {
  const states: { container: string; state: string }[] = [];
  let keyframes = false;
  const walk = (node: SyntaxNode) => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.name === "LuauStructBlockProperty") {
        const key = getDescendent("DeclarationScalarPropertyKey", child);
        if (key && key.to <= child.to && read(key.from, key.to).trim() === "state") {
          const container = braceBlockPathAt(tree, child.from, read)?.path.at(-1);
          const value = /=\s*"?([^\s";{}]*)/.exec(read(key.to, child.to))?.[1] ?? "";
          if (container) states.push({ container, state: value });
        }
      } else {
        if (child.name === "LuauStructBlock" && !keyframes) {
          const key = structBlockKeyNode(child);
          const token = key && structKeyToken(key);
          keyframes =
            !!token &&
            read(token.from, token.to).trim() === "keyframes" &&
            !braceBlockPathAt(tree, child.from, read)?.path.length;
        }
        walk(child);
      }
    }
  };
  walk(declaration);
  return { states, keyframes };
};

const isWhitespaceNode = (name?: SparkdownNodeName) =>
  name === "RequiredWhitespace" ||
  name === "OptionalWhitespace" ||
  name === "ExtraWhitespace" ||
  name === "Whitespace";

interface AttributeChoice {
  label: string;
  offset: number;
  attribute?: string;
}

const attributeCompletionChoices = (
  vocabulary: AttributeVocabulary,
  current: string,
  written: readonly string[],
): AttributeChoice[] => {
  const { selection } = resolveAttributes(vocabulary, written);
  const dot = current.indexOf(".");
  if (dot >= 0) {
    const group = current.slice(0, dot);
    const info = Object.hasOwn(vocabulary.groups, group) ? vocabulary.groups[group] : undefined;
    return (info?.options ?? [])
      .filter((option) => selection[group] !== option)
      .map((option) => ({ label: option, offset: dot + 1, attribute: `${group}.${option}` }));
  }
  const choices = new Map<string, AttributeChoice>();
  for (const [group, info] of Object.entries(vocabulary.groups)) {
    if (group in selection) continue;
    choices.set(group, info.switch ? { label: group, offset: 0, attribute: group } : { label: group, offset: 0 });
    if (info.switch) continue;
    for (const option of info.options) {
      if (choices.has(option) || Object.hasOwn(vocabulary.groups, option)) continue;
      const bare = resolveAttributes(vocabulary, [option]);
      const targets = Object.keys(bare.selection);
      if (!bare.diagnostics.length && targets.includes(group) && targets.every((target) => !(target in selection))) {
        choices.set(option, { label: option, offset: 0, attribute: option });
      }
    }
  }
  return [...choices.values()];
};

const attributeCompletionItem = (
  choice: AttributeChoice,
  description: string,
  range: Range,
  data: (attribute: string) => CompletionItem["data"],
): CompletionItem => ({
  label: choice.label,
  kind: choice.attribute ? CompletionItemKind.EnumMember : CompletionItemKind.Enum,
  labelDetails: { description },
  textEdit: { newText: choice.attribute ? choice.label : `${choice.label}.`, range },
  ...(choice.attribute
    ? { data: data(choice.attribute) }
    : { command: Command.create("suggest", "editor.action.triggerSuggest") }),
});

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
  scripts: Map<string, AnnotatedScript>,
  uri: string,
  contentNode: GrammarSyntaxNode<SparkdownNodeName> | undefined,
  strict: boolean,
  include?: string[],
) => {
  const before: string[] = [];
  const after: string[] = [];
  const scriptEntries = Array.from(scripts.entries());
  const currentScriptIndex = scriptEntries.findIndex(
    ([k]) => k === uri,
  );
  if (currentScriptIndex < 0) {
    return [];
  }
  const beforeScriptEntries = scriptEntries.slice(
    0,
    currentScriptIndex,
  );
  const currentScriptEntries = [scriptEntries[currentScriptIndex]!];
  const afterScriptEntries = scriptEntries.slice(
    currentScriptIndex + 1,
  );
  const currentRead = scriptEntries[currentScriptIndex]![1].read;
  const currentText = contentNode
    ? currentRead(contentNode.from, contentNode.to)?.trim()
    : "";
  for (const [, { annotations, read }] of beforeScriptEntries) {
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
  for (const [, { annotations, read }] of currentScriptEntries) {
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
  for (const [, { annotations, read }] of afterScriptEntries) {
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
  scripts: Map<string, AnnotatedScript>,
  uri: string,
  contentNode: GrammarSyntaxNode<SparkdownNodeName> | undefined,
  insertTextPrefix: string = "",
  insertTextSuffix: string = "",
  strict = false,
  program?: SparkProgram,
) => {
  const characters = program?.context?.["character"] || {};
  const mostRecentTexts = rankMostRecentTexts(
    "characters",
    scripts,
    uri,
    contentNode,
    strict,
    [
      ...Object.keys(characters),
      ...Object.values(characters).flatMap((character: any) =>
        Array.isArray(character?.aliases)
          ? character.aliases.filter(
              (alias: unknown): alias is string => typeof alias === "string",
            )
          : [],
      ),
    ],
  );
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

const addSpeakerCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined,
  range: Range,
  insertTextSuffix = "",
) => {
  for (const name of Object.keys(program?.context?.["character"] || {})) {
    if (name.startsWith("$") || completions.has(name)) continue;
    completions.set(name, {
      label: name,
      textEdit: { range, newText: name + insertTextSuffix },
      labelDetails: { description: "character" },
      kind: CompletionItemKind.Constant,
    });
  }
};

const cueBeingTyped = (text: string, program: SparkProgram | undefined) =>
  !/\p{Ll}/u.test(text) ||
  Object.entries<any>(program?.context?.["character"] || {}).some(
    ([name, character]) =>
      !name.startsWith("$") &&
      (name === text ||
        character?.name === text ||
        (Array.isArray(character?.aliases) &&
          character.aliases.includes(text))),
  );

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

const clauseValueAt = (
  directive: { from: number; to: number } | undefined,
  bracket: "image" | "audio",
  cursor: number,
  read: (from: number, to: number) => string,
): { keyword: string; reading: DirectiveReading } | undefined => {
  if (!directive || cursor < directive.from + 2) return undefined;
  const typed = read(directive.from + 2, cursor);
  if (typed.includes(DIRECTIVE_CLOSERS[bracket])) return undefined;
  if (typed.split(/[ \t]+/).some((word) => /^#+$/.test(word))) return undefined;
  const reading = readDirective(bracket, typed);
  const last = reading.clauses.at(-1);
  if (!last || !last.takesValue) return undefined;
  if (last.value && last.value.to !== typed.length) return undefined;
  if (!last.value && last.word.to === typed.length) return undefined;
  return { keyword: last.word.text, reading };
};

const addMorphPickCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined,
  assets: readonly string[],
) => {
  const none: CompletionItem = {
    label: MORPH_PICK_NONE,
    insertText: MORPH_PICK_NONE,
    labelDetails: { description: "plays no speech morph" },
    kind: CompletionItemKind.Keyword,
    documentation: { kind: MarkupKind.Markdown, value: MORPH_CLAUSE_DOC },
    sortText: "0",
  };
  completions.set(none.label, none);
  const context = program?.context;
  const channel = program?.morphs;
  if (!context || !channel) return;
  const names = new Set<string>();
  for (const asset of assets) {
    const image = resolveImageReference(context, { $type: "", $name: sortFilteredName(asset) });
    if (!image) continue;
    for (const name of resolvePictureLook(context, channel, image).speech) names.add(name);
  }
  for (const name of [...names].sort()) {
    const isDefault = Boolean(channel.speech?.[name]?.default);
    completions.set(name, {
      label: name,
      insertText: name,
      labelDetails: { description: isDefault ? "speech morph, default" : "speech morph" },
      kind: CompletionItemKind.Reference,
      documentation: { kind: MarkupKind.Markdown, value: MORPH_CLAUSE_DOC },
      sortText: isDefault ? `1${name}` : `2${name}`,
      ...(isDefault ? { preselect: true } : {}),
    });
  }
};

const addBracketControlCompletions = (
  completions: Map<string, CompletionItem>,
) => {
  addKeywordCompletions(completions, "control", BRACKET_CONTROL_KEYWORDS);
  for (const verb of LAYOUT_VERBS) {
    const completion = completions.get(verb);
    if (completion) {
      completion.documentation = {
        kind: MarkupKind.Markdown,
        value: LAYOUT_CONTROL_DESCRIPTIONS[verb],
      };
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

const readAssetCommandAttributes = (
  leftStack: GrammarSyntaxNode<SparkdownNodeName>[],
  read: (from: number, to: number) => string,
  offset: number,
  tokenStart: number,
): { asset: string; before: string[]; after: string[] } => {
  const nameNode = leftStack.find((n) => n.name === "AssetCommandName");
  if (!nameNode) {
    return { asset: "", before: [], after: [] };
  }
  const cursorNode = leftStack[0];
  let image = "";
  const before: string[] = [];
  const after: string[] = [];
  const cur = nameNode.node.cursor();
  let depth = 0;
  walk: for (;;) {
    if (!image && cur.name === "AssetCommandFileName") {
      image = read(cur.from, cur.to).trim();
    }
    if (
      cur.name === "AssetCommandFilterName" &&
      !(cursorNode && cur.from === cursorNode.from && cur.to === cursorNode.to) &&
      !(cur.from <= offset && cur.to >= tokenStart)
    ) {
      const attribute = read(cur.from, cur.to).trim();
      if (attribute) {
        (cur.to <= offset ? before : after).push(attribute);
      }
    }
    if (cur.firstChild()) {
      depth += 1;
      continue;
    }
    for (;;) {
      if (depth === 0) {
        break walk;
      }
      if (cur.nextSibling()) {
        break;
      }
      cur.parent();
      depth -= 1;
    }
  }
  return { asset: image, before, after };
};

const addStructReferenceCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined,
  types: string[],
  exclude?: string[] | ((name: string) => boolean),
  buildData?: (type: string, name: string) => object | undefined,
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
            const completion: CompletionItem = {
              label: name,
              labelDetails: { description: type },
              kind: CompletionItemKind.Constructor,
            };
            const data =
              buildData?.(type, name) ??
              (IMAGE_TYPES.includes(type) ? { type, name } : undefined);
            if (data) {
              completion.data = data;
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

const SHOWING_ARGUMENT_BEFORE = /@showing\([ \t]*[\p{L}\p{N}_@-]*$/u;

const addShowingNameCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined,
) => {
  const layouts = layoutNames(program);
  const elements = [...showingNames(program)].filter((name) => !layouts.has(name));
  for (const [names, description] of [
    [[...layouts], "layout"],
    [elements, "element"],
  ] as const) {
    for (const name of [...names].sort()) {
      if (!completions.has(name)) {
        completions.set(name, {
          label: name,
          labelDetails: { description },
          kind: CompletionItemKind.Constructor,
        });
      }
    }
  }
};

const LINE_ARGUMENT_BEFORE = /@(variant|speaker)\([ \t]*[\p{L}\p{N}_@]*$/u;

const addLineLabelCompletions = (
  completions: Map<string, CompletionItem>,
  state: string,
  scripts: Map<string, AnnotatedScript>,
  program: SparkProgram | undefined,
) => {
  const labels = new Set<string>();
  if (state === "speaker") {
    for (const name of Object.keys(program?.context?.["character"] ?? {})) {
      if (!name.startsWith("$")) labels.add(name);
    }
  } else {
    for (const script of scripts.values()) {
      script.tree?.iterate({
        enter: (node) => {
          if (node.name !== "DialogueCharacterPositionContent") return undefined;
          const variant = cueVariant(script.read(node.from, node.to));
          if (variant) labels.add(variant);
          return false;
        },
      });
    }
  }
  for (const label of [...labels].sort()) {
    if (!completions.has(label)) {
      completions.set(label, {
        label,
        labelDetails: { description: state === "speaker" ? "character" : "variant" },
        kind: state === "speaker" ? CompletionItemKind.Constant : CompletionItemKind.EnumMember,
      });
    }
  }
};

const SELECTOR_ATTRIBUTE_BEFORE = /^\s*([#[])([\p{L}\p{N}_-]*)(?:([~|^$*]?=)[\p{L}\p{N}_@-]*)?$/u;

const addSelectorAttributeCompletions = (
  completions: Map<string, CompletionItem>,
  typed: RegExpExecArray,
  range: Range,
  scripts: Map<string, AnnotatedScript>,
  program: SparkProgram | undefined,
  written: "nothing" | "text" | "value",
) => {
  const [, opener, name = "", operator] = typed;
  if (operator) {
    const kind = labelKindOfProp(opener === "#" ? name : propOfAttribute(name));
    if (kind) {
      addLineLabelCompletions(completions, kind, scripts, program);
    }
    return;
  }
  for (const prop of SELECTABLE_PROPS) {
    const attribute = opener === "#" ? prop : toDataAttributeName(prop);
    const assigned = written === "value" || isValuelessAttribute(prop) ? "" : "=$1";
    const key = opener === "#" ? `#${prop}${assigned}` : `[${attribute}${assigned}`;
    const label = opener === "#" ? `#${prop}` : `[${attribute}]`;
    completions.set(label, {
      label,
      filterText: `${opener}${attribute}`,
      textEdit: {
        range,
        newText:
          written === "nothing" ? `${key}${opener === "[" ? "]" : ""} { $0 }` : key,
      },
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: `${DATA_ATTRIBUTE_PROPS.has(prop) ? 0 : 1}${prop}`,
      labelDetails: {
        description: opener === "#" ? "prop" : attribute === prop ? "attribute" : `written by #${prop}`,
      },
      kind: CompletionItemKind.Property,
      documentation: {
        kind: MarkupKind.Markdown,
        value: opener === "#" ? selectorPropDocumentation(prop) : selectorAttributeDocumentation(attribute),
      },
    });
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
    for (const structs of [
      program?.context?.["layout"],
      program?.context?.["screen"],
    ]) {
      for (const v of Object.values(structs ?? {})) {
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

const addRunCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined,
  config: SparkdownCompilerConfig | undefined,
  scriptUri: string,
  typed: string,
  position: Position,
) => {
  if (!program?.files) {
    return;
  }
  const quote = typed[0] === '"' || typed[0] === "'" ? typed[0] : "";
  const written = quote ? typed.slice(1) : typed;
  if (quote && written.includes(quote)) {
    return;
  }
  const asWritten = config?.uriPathsAsWritten;
  const uris = new Set(Object.values(program.files).map((file) => file.uri));
  const luauFiles = projectLuauFiles(
    program.uri,
    uris,
    (uri) => uris.has(uri),
    config?.mainScriptFilename,
    asWritten,
  );
  const range = {
    start: { line: position.line, character: position.character - written.length },
    end: position,
  };
  const add = (label: string, description: string) => {
    if (label && !completions.has(label)) {
      completions.set(label, {
        label,
        labelDetails: { description },
        kind: CompletionItemKind.File,
        filterText: label,
        textEdit: { newText: label, range },
      });
    }
  };
  if (quote) {
    for (const uri of luauFiles) {
      add(quotedRunPath(relativeRunPath(scriptUri, uri, asWritten)), "Luau file");
    }
    return;
  }
  const counts = new Map<string, number>();
  for (const uri of luauFiles) {
    const name = luauFileName(uri, asWritten);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  for (const [name, count] of counts) {
    if (count === 1) {
      add(name, "Luau file");
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
  name: string,
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
              const container =
                isArray ||
                isMap ||
                modifier === "schema" ||
                modifier === "random" ||
                modifier === "description";
              const restOfEntry = /^[^;}]*/.exec(textAfterCursor)![0].trim();
              const braced = container && !restOfEntry;
              const insertSuffix = restOfEntry
                ? ""
                : braced
                  ? " { $0 }"
                  : valueAssignmentSeparator;
              const completion: CompletionItem = {
                label: propName,
                insertText: propName + insertSuffix,
                kind: CompletionItemKind.Property,
                insertTextMode: InsertTextMode.asIs,
                command: braced
                  ? undefined
                  : Command.create("suggest", "editor.action.triggerSuggest"),
              };
              if (braced) {
                completion.insertTextFormat = InsertTextFormat.Snippet;
              }
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

const SPARKLE_BODY_TYPES = new Set(["screen", "layout", "component"]);

const addSparkleBodyCompletions = (
  completions: Map<string, CompletionItem>,
  program: SparkProgram | undefined,
  type: string,
) => {
  if (type === "screen") {
    completions.set("slot", {
      label: "slot",
      kind: CompletionItemKind.Keyword,
      labelDetails: { description: "where the open layout goes" },
    });
  } else {
    for (const item of templatedElementCompletions()) {
      completions.set(item.label, item);
    }
  }
  const components = program?.sparkle?.components ?? {};
  for (const name of Object.keys(components)) {
    if (!completions.has(name)) {
      completions.set(name, {
        label: name,
        kind: CompletionItemKind.Class,
        labelDetails: { description: "component" },
      });
    }
  }
  const tags = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") {
      return;
    }
    const node = value as { kind?: unknown; tag?: unknown };
    if (node.kind === "element" && typeof node.tag === "string") {
      tags.add(node.tag);
    }
    Object.values(value).forEach(visit);
  };
  visit(program?.sparkle?.layouts);
  visit(program?.sparkle?.screens);
  visit(program?.sparkle?.components);
  for (const tag of tags) {
    if (!completions.has(tag)) {
      completions.set(tag, {
        label: tag,
        kind: CompletionItemKind.Property,
        labelDetails: { description: "element" },
      });
    }
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
    for (const typeStruct of [
      program?.context?.[type]?.["$default"],
      program?.context?.[type]?.[`$optional:${name}`],
      program?.context?.[type]?.["$optional"],
      config?.definitions?.optionals?.[type]?.["$optional"],
    ]) {
      addStructPropertyNameContextCompletions(
        completions,
        program,
        config,
        typeStruct,
        name,
        modifier,
        path,
        valueAssignmentSeparator,
        includeTypeAsDetail,
        lineText,
        cursorPosition,
        exclude,
      );
    }
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
        const property = lookupPath.split(".").at(-1) ?? "";
        const describeStyleValue = (completion: CompletionItem, option: string) => {
          const documentation =
            schemaStruct.$type === "style"
              ? getStyleValueDescription(property, option)
              : undefined;
          if (documentation) {
            completion.documentation = documentation;
          }
        };
        if (Array.isArray(value)) {
          const isStyling = STYLING_DEFINE_TYPES.includes(schemaStruct.$type);
          const listedValues = new Set(
            valueText
              .slice(0, valueCursorOffset)
              .split(",")
              .slice(0, -1)
              .map((entry) => entry.trim()),
          );
          for (const option of value) {
            const kind = getTypeKind(option);
            const insertTextPrefix =
              context?.triggerCharacter === "=" ? " " : "";
            const insertText = insertTextPrefix + option;
            if (typeof option === "string") {
              if (isStyling) {
                const label = option.replace(INSERT_TEXT_CURSOR_REGEX, "");
                if (label && !listedValues.has(label)) {
                  const insertTextFormat = insertText.includes("$")
                    ? InsertTextFormat.Snippet
                    : undefined;
                  const completion: CompletionItem = {
                    label,
                    insertText,
                    kind,
                    insertTextFormat,
                  };
                  describeStyleValue(completion, option);
                  if (!completions.has(completion.label)) {
                    completions.set(completion.label, completion);
                  }
                }
              } else if (!valueText) {
                const insertTextWithoutCursorSyntax = insertText.replace(
                  INSERT_TEXT_CURSOR_REGEX,
                  "",
                );
                if (insertTextWithoutCursorSyntax) {
                  const label = `"${insertTextWithoutCursorSyntax}"`;
                  const insertTextFormat = insertText.includes("$")
                    ? InsertTextFormat.Snippet
                    : undefined;
                  const completion: CompletionItem = {
                    label,
                    insertText,
                    kind,
                    insertTextFormat,
                  };
                  describeStyleValue(completion, option);
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
                  describeStyleValue(completion, option);
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
        addStructReferenceCompletions(completions, program, typedImageTypes(value.$type));
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

const isWithinSection = (scopePath: string, path: string) =>
  !path || scopePath === path || scopePath.startsWith(path + ".");

const addMutableAccessPathCompletions = (
  completions: Map<string, CompletionItem>,
  scopes: DeclarationScopes,
  valueText: string,
  valueCursorOffset: number,
  scopePath: string,
  insertTextPrefix: string = "",
) => {
  const valueTextAfterCursor = valueText.slice(valueCursorOffset);
  if (!valueTextAfterCursor) {
    const parts = valueText?.split(".") || [];
    if (scopes) {
      const types: DeclarationType[] = ["var", "param"];
      for (const [path, declarations] of Object.entries(scopes)) {
        if (parts.length <= 1 && isWithinSection(scopePath, path)) {
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
  scopes: DeclarationScopes,
  valueText: string,
  valueCursorOffset: number,
  scopePath: string,
  insertTextPrefix: string = "",
) => {
  const valueTextAfterCursor = valueText.slice(valueCursorOffset);
  if (!valueTextAfterCursor) {
    const parts = valueText?.split(".") || [];
    if (scopes) {
      const types: DeclarationType[] = ["const", "function", "define"];
      for (const [path, declarations] of Object.entries(scopes)) {
        if (parts.length <= 1 && isWithinSection(scopePath, path)) {
          for (const type of types) {
            if (declarations[type]) {
              for (const name of declarations[type]) {
                if (name) {
                  const description = type;
                  const kind = type === "function"
                    ? CompletionItemKind.Function
                    : CompletionItemKind.Class;
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
        addStructReferenceCompletions(completions, program, typedImageTypes(type));
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
  scopes: DeclarationScopes,
  valueText: string,
  valueCursorOffset: number,
  scopePath: string,
  insertTextPrefix: string = "",
) => {
  const valueTextAfterCursor = valueText.slice(valueCursorOffset);
  if (!valueTextAfterCursor) {
    const parts = valueText?.split(".") || [];
    if (scopes) {
      const types: DeclarationType[] = ["scene", "branch", "label"];
      for (const [path, declarations] of Object.entries(scopes)) {
        if (
          (parts.length <= 1 && isWithinSection(scopePath, path)) ||
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

const completionsAt = (
  document: SparkdownDocument | undefined,
  tree: Tree | undefined,
  scripts: Map<string, AnnotatedScript>,
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
  const cursor = { uri: document.uri, offset: documentCursorOffset };

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

  const writtenClauses = (commandName: SparkdownNodeName, severalWiths = false) => {
    const command = leftStack.find((n) => n.type.name === commandName);
    const written: { text: string; from: number }[] = [];
    if (command) {
      tree.iterate({
        from: command.from,
        to: command.to,
        enter: (node) => {
          if (
            node.name === "AssetCommandClauseKeyword" &&
            (documentCursorOffset <= node.from || documentCursorOffset > node.to)
          ) {
            written.push({ text: read(node.from, node.to), from: node.from });
          }
        },
      });
    }
    if (!severalWiths) {
      return written.map(({ text }) => text);
    }
    const ownerAt = (offset: number) =>
      written.findLast((keyword) => keyword.text === "with" && keyword.from < offset)?.from ?? -1;
    const cursorOwner = ownerAt(documentCursorOffset);
    return written
      .filter(
        ({ text, from }) =>
          text !== "with" && (!DIRECTIVE_WITH_OWNED_WORDS.includes(text) || ownerAt(from) === cursorOwner),
      )
      .map(({ text }) => text);
  };

  const isNameAfterName = (node: SyntaxNode | undefined) => {
    if (node?.name !== "AssetCommandFileName" || node.prevSibling) return false;
    let name = node.parent;
    while (name && name.name !== "AssetCommandName") name = name.parent;
    const gap = name?.prevSibling;
    if (gap?.name === "AssetCommandNoneName") return /[ \t]$/.test(read(gap.from, gap.to));
    return gap?.name === "AssetCommandSeparator" && gap.prevSibling?.name === "AssetCommandName";
  };

  const isClauseStart = (node: SyntaxNode | undefined) => {
    if (node?.name !== "NameValue") {
      return false;
    }
    return !keywordOfValue(node);
  };

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

  const showingTyped = leftStack.some((node) => node.name === "SimpleSelectorFunction")
    ? SHOWING_ARGUMENT_BEFORE.exec(
        read(document.offsetAt({ line: position.line, character: 0 }), documentCursorOffset),
      )
    : null;
  if (showingTyped) {
    addShowingNameCompletions(completions, program);
    return buildCompletions();
  }
  const lineTyped = leftStack.some((node) => node.name === "SimpleSelectorFunction")
    ? LINE_ARGUMENT_BEFORE.exec(
        read(document.offsetAt({ line: position.line, character: 0 }), documentCursorOffset),
      )
    : null;
  if (lineTyped) {
    addLineLabelCompletions(completions, lineTyped[1]!, scripts, program);
    return buildCompletions();
  }

  const morphNode = leftStack.find((node) => node.name === "LuauMorph");
  if (morphNode) {
    const endNode = getDescendent("LuauMorph_end", morphNode);
    const nameNode = getDescendent("LuauDefineName", morphNode);
    const braceBlock = braceBlockPathAt(tree, documentCursorOffset, read);
    const morphCompletions = getMorphCompletions(
      (line) => document.getLineText(line),
      {
        startLine: document.positionAt(morphNode.from).line,
        endLine: endNode
          ? document.positionAt(endNode.from).line
          : document.positionAt(morphNode.to).line + 1,
        name: nameNode ? getNodeText(nameNode).trim() : "",
      },
      program,
      position,
      {
        path:
          braceBlock && braceBlock.body.from > morphNode.from
            ? braceBlock.path
            : null,
        entry: braceEntryAt(
          tree,
          documentCursorOffset,
          document.offsetAt({ line: position.line, character: 0 }),
          read,
        ),
        ...blockStates(morphNode, tree, read),
      },
    );
    if (morphCompletions) return morphCompletions;
  }

  const optionStart = alternatorOptionStartAt(tree, documentCursorOffset, read);
  const optionKeywords = optionStart
    ? ALTERNATOR_KEYWORDS.filter((keyword) => keyword.startsWith(optionStart.typed))
    : [];
  if (optionKeywords.length) {
    for (const keyword of optionKeywords) {
      completions.set(keyword, {
        label: keyword,
        insertText: keyword,
        labelDetails: { description: "nested set" },
        kind: CompletionItemKind.Keyword,
        documentation: {
          kind: MarkupKind.Markdown,
          value: alternatorKeywordDocumentation(keyword),
        },
      });
    }
    return buildCompletions();
  }

  if (program?.context && leftStack.some((node) => node.name === "ImageCommand")) {
    const asset = leftStack.find((node) => node.name === "AssetCommandName");
    const prefix = asset ? read(asset.from, documentCursorOffset) : "";
    const match = prefix.match(/(?:^|[+])\s*([a-zA-Z_]\w*(?:@\w+)*)((?::[\w.-]*)+)$/);
    if (match) {
      const name = match[1]!;
      const current = match[2]!.split(":").at(-1) ?? "";
      const start = documentCursorOffset - current.length;
      const { before, after } = readAssetCommandAttributes(leftStack, read, documentCursorOffset, start);
      const attributeNode = leftStack.find((node) => node.name === "AssetCommandFilterName");
      const image = program.context["filtered_image"]?.[name] ?? program.context["layered_image"]?.[name] ?? program.context["image"]?.[name];
      const vocabulary = resolveImageAttributes(program.context, image, { visibility: false }).vocabulary;
      if (vocabulary) {
        const pick = directiveOwnLookPick(tree, read, start);
        for (const choice of attributeCompletionChoices(vocabulary, current, [...before, ...after])) {
          completions.set(choice.label, attributeCompletionItem(
            choice,
            `${name} attribute`,
            document.range(start + choice.offset, attributeNode?.to ?? documentCursorOffset),
            (attribute) => ({ type: "filtered_image", name,
              filtered: { image: name, attributes: [...before, attribute, ...after] },
              ...(pick === undefined ? {} : { pick }) }),
          ));
        }
      }
      return buildCompletions();
    }
  }

  const quotedAttribute = leftStack.find((node) =>
    node.name === "LuauDoubleQuotedString" || node.name === "LuauSingleQuotedString",
  );
  const attributeTable = leftStack.find((node) => isExplicitRuleName(node.name, "LuauTable"));
  const attributeProperty = leftStack.find((node) => node.name === "LuauPropertyDefinition");
  const attributeDefine = getDefineContext(leftStack, read);
  if (program?.context && quotedAttribute && attributeTable && attributeProperty &&
      attributeDefine?.type === "filtered_image" &&
      leftStack.filter((node) => isExplicitRuleName(node.name, "LuauTable")).length === 1 &&
      getNodeText(getDescendent("LuauVariableName", attributeProperty)) === "attributes" &&
      getDescendent("LuauTable", attributeProperty)?.from === attributeTable.from) {
    const content = attributeTable.getChild("LuauTable_content");
    const entries: SyntaxNode[] = [];
    let literalList = !!content;
    for (let node = content?.firstChild; node; node = node.nextSibling) {
      if (node.name === "LuauDoubleQuotedString" || node.name === "LuauSingleQuotedString") entries.push(node);
      else if (!["ExtraWhitespace", "Newline", "LuauCommaSeparator", "LuauSemicolonSeparator"].includes(node.name)) literalList = false;
    }
    const open = getDescendent(["PunctuationStringDoubleQuoteOpen", "PunctuationStringSingleQuoteOpen"], quotedAttribute);
    const close = getDescendent(["PunctuationStringDoubleQuoteClose", "PunctuationStringSingleQuoteClose"], quotedAttribute);
    const image = program.context["filtered_image"]?.[attributeDefine.name];
    const vocabulary = resolveImageAttributes(program.context, image, { visibility: false }).vocabulary;
    if (literalList && vocabulary && open && close && documentCursorOffset >= open.to && documentCursorOffset <= close.from) {
      const before: string[] = [];
      const after: string[] = [];
      for (const entry of entries) {
        if (entry.from === quotedAttribute.from) continue;
        const value = getNodeText(entry).trim().slice(1, -1);
        (entry.to <= quotedAttribute.from ? before : after).push(value);
      }
      const current = read(open.to, documentCursorOffset);
      for (const choice of attributeCompletionChoices(vocabulary, current, [...before, ...after])) {
        completions.set(choice.label, attributeCompletionItem(
          choice,
          `${attributeDefine.name} attribute`,
          document.range(open.to + choice.offset, close.from),
          (attribute) => ({ type: "filtered_image", name: attributeDefine.name,
            filtered: { image: image.image?.$name, attributes: [...before, attribute, ...after] } }),
        ));
      }
      return buildCompletions();
    }
  }

  const clearProp = getClearPropCompletion(
    leftStack,
    read(document.offsetAt({ line: position.line, character: 0 }), documentCursorOffset),
    documentCursorOffset,
    (from, to) => document.range(from, to),
  );
  if (clearProp) {
    completions.set(clearProp.label, clearProp);
    return buildCompletions();
  }

  const side = -1;
  const prevCursor = tree.cursorAt(leftStack[0].from - 1, side);
  const nextCursor = tree.cursorAt(leftStack[0].to + 1, side);
  const prevNode = prevCursor.node as GrammarSyntaxNode<SparkdownNodeName>;
  const nextNode = nextCursor.node as GrammarSyntaxNode<SparkdownNodeName>;
  const prevText = getNodeText(prevNode);

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

  if (
    (isWhitespaceNode(leftStack[0]?.name) &&
      prevNode?.name === "RunKeyword") ||
    (isWhitespaceNode(leftStack[0]?.name) &&
      leftStack.some((n) => n?.name === "Run_begin")) ||
    leftStack.some((n) => n?.name === "RunContent")
  ) {
    const runContentNode = getDescendentInsideParent(
      "RunContent",
      "Run",
      leftStack,
    );
    const runKeywordNode = getDescendentInsideParent(
      "RunKeyword",
      "Run",
      leftStack,
    );
    const typed = runKeywordNode
      ? read(runKeywordNode.to, documentCursorOffset).trimStart()
      : "";
    const after = runContentNode
      ? getNodeText(runContentNode).slice(getCursorOffset(runContentNode)).trim()
      : "";
    if (!after || (after.length === 1 && after === typed[0])) {
      addRunCompletions(
        completions,
        program,
        config,
        document.uri,
        typed,
        position,
      );
    }
    return buildCompletions();
  }

  if (
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
    const written =
      dialogueCharacterNode &&
      readSpeakerBeingWritten(
        read(dialogueCharacterNode.from, documentCursorOffset),
        read(documentCursorOffset, dialogueCharacterNode.to),
      );
    if (written) {
      addSpeakerCompletions(
        completions,
        program,
        document.range(
          documentCursorOffset - written.typed.length,
          documentCursorOffset + written.rest.length,
        ),
      );
    } else if (isCursorAfterNodeText(dialogueCharacterNode)) {
      addCharacterCompletions(
        completions,
        scripts,
        document.uri,
        dialogueCharacterNode,
      );
    }
    return buildCompletions();
  }

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

  const unclosedOpener = unclosedOpenerBefore(
    tree,
    document.offsetAt({ line: position.line, character: 0 }),
    documentCursorOffset,
    read,
  );
  if (unclosedOpener === "[[") {
    addBracketControlCompletions(completions);
    addStructReferenceCompletions(
      completions,
      program,
      IMAGE_COMMAND_NAME_TYPES,
      isPrefilteredName,
    );
    return buildCompletions();
  }
  if (unclosedOpener === "((") {
    addKeywordCompletions(completions, "control", AUDIO_CONTROL_KEYWORDS);
    addStructReferenceCompletions(completions, program, AUDIO_TYPES);
    return buildCompletions();
  }

  if (leftStack.some((n) => n.type.name === "ImageCommand")) {
    const takesMovieClauses = (control: string) =>
      control === "" || control === "show" || control === "animate";
    const imageControl = () =>
      getNodeText(
        getDescendentInsideParent(
          "AssetCommandControl",
          "ImageCommand",
          leftStack,
        ),
      );
    const addImageClauseCompletions = (control: string) => {
      const imageClauses = [
        ...IMAGE_CLAUSE_KEYWORDS.filter((k) => k !== "at"),
        ...(control === "animate" ? ["to"] : takesMovieClauses(control) ? ["at"] : []),
      ];
      const clauses = MOVIE_CONTROL_KEYWORDS.includes(control)
        ? CUTSCENE_CLAUSE_KEYWORDS
        : control === "animate"
          ? ["with", ...imageClauses.filter((k) => k !== "with")]
          : imageClauses;
      addKeywordCompletions(
        completions,
        "clause",
        [
          ...clauses,
          ...(takesMovieClauses(control) ? MOVIE_CLAUSE_KEYWORDS : []),
        ],
        writtenClauses(
          "ImageCommand",
          DIRECTIVE_KINDS_WITH_SEVERAL_WITHS.includes(directiveKind("image", control)),
        ),
      );
    };
    const beforeImageNode = leftStack.find(
      (n) => n.type.name === "ImageBeginMark",
    );
    if (beforeImageNode) {
      if (isCursorAfterNodeText(beforeImageNode)) {
        addBracketControlCompletions(completions);
        addStructReferenceCompletions(
          completions,
          program,
          IMAGE_COMMAND_NAME_TYPES,
          isPrefilteredName,
        );
      }
      return buildCompletions();
    }
    if (
      prevNode.name === "ImageBeginMark" &&
      leftStack[0]?.name === "AssetCommandFileName"
    ) {
      if (isCursorAfterNodeText(leftStack[0])) {
        addBracketControlCompletions(completions);
        addStructReferenceCompletions(
          completions,
          program,
          IMAGE_COMMAND_NAME_TYPES,
          isPrefilteredName,
        );
      }
      return buildCompletions();
    }
    if (leftStack[0]?.name === "AssetCommandControl") {
      if (isCursorAfterNodeText(leftStack[0])) {
        addBracketControlCompletions(completions);
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
        if (MOVIE_CONTROL_KEYWORDS.includes(control)) {
          addStructReferenceCompletions(completions, program, VIDEO_TYPES);
          return buildCompletions();
        }
        if (isLayoutVerb(control)) {
          for (const [name, type] of layoutDirectiveTargetNames(program, control)) {
            if (!completions.has(name)) {
              completions.set(name, {
                label: name,
                labelDetails: { description: type },
                kind: CompletionItemKind.Constructor,
              });
            }
          }
          return buildCompletions();
        }
        addScreenElementReferenceCompletions(
          completions,
          program,
          control === "animate" ? ["animation", "image"] : ["image"],
        );
        if (control === "hide" || control === "animate") {
          for (const name of picturedCharacters(program?.context)) {
            if (!completions.has(name)) {
              completions.set(name, {
                label: name,
                labelDetails: { description: "character" },
                kind: CompletionItemKind.Constant,
              });
            }
          }
        }
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
        const control = imageControl();
        addImageClauseCompletions(control);
        if (control !== "hide" && !MOVIE_CONTROL_KEYWORDS.includes(control)) {
          addStructReferenceCompletions(
            completions,
            program,
            IMAGE_COMMAND_NAME_TYPES,
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
        const control = imageControl();
        if (MOVIE_CONTROL_KEYWORDS.includes(control)) {
          addImageClauseCompletions(control);
          return buildCompletions();
        }
        if (isNameAfterName(leftStack[0]?.node)) {
          addImageClauseCompletions(control);
        }
        addStructReferenceCompletions(
          completions,
          program,
          IMAGE_COMMAND_NAME_TYPES,
          isPrefilteredName,
        );
      }
      return buildCompletions();
    }
    if (
      leftStack[0]?.name === "AssetCommandFilterOperator" ||
      leftStack[0]?.name === "AssetCommandFilterName"
    ) {
      return buildCompletions();
    }
    const imageValue = clauseValueAt(
      leftStack.find((n) => n.type.name === "ImageCommand"),
      "image",
      documentCursorOffset,
      read,
    );
    if (imageValue) {
      const { keyword, reading } = imageValue;
      if (keyword === "morph" && reading.kind === "image") {
        addMorphPickCompletions(completions, program, reading.names.map((name) => name.text));
      } else if (keyword === "with") {
        const control = reading.control?.text ?? "";
        const types =
          control === "animate"
            ? ["animation"]
            : control === "show" || MOVIE_CONTROL_KEYWORDS.includes(control)
              ? ["transition"]
              : ["transition", "animation"];
        addStructReferenceCompletions(completions, program, types);
      } else if (keyword === "ease") {
        addStructReferenceCompletions(completions, program, ["ease"]);
      } else if ((keyword === "at" || keyword === "to") && reading.kind === "image") {
        addStructReferenceCompletions(completions, program, ["framing"]);
      }
      return buildCompletions();
    }
    if (
      (isWhitespaceNode(leftStack[0]?.name) &&
        prevNode?.name === "AssetCommandClauseKeyword" &&
        (prevText === "with" ||
          prevText === "ease" ||
          prevText === "morph" ||
          prevText === "at" ||
          prevText === "to")) ||
      (leftStack[0]?.name === "NameValue" && !!keywordOfValue(leftStack[0].node))
    ) {
      return buildCompletions();
    }
    if (isClauseStart(leftStack[0]?.node)) {
      if (isCursorAfterNodeText(leftStack[0])) {
        addImageClauseCompletions(imageControl());
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
          VALUE_CLAUSE_KEYWORDS.includes(prevText);
        if (!prevClauseTakesArgument) {
          addImageClauseCompletions(imageControl());
        }
      }
      return buildCompletions();
    }
  }

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
    if (
      prevNode.name === "AudioBeginMark" &&
      leftStack[0]?.name === "AssetCommandFileName"
    ) {
      if (isCursorAfterNodeText(leftStack[0])) {
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
        addKeywordCompletions(
          completions,
          "clause",
          AUDIO_CLAUSE_KEYWORDS,
          writtenClauses("AudioCommand"),
        );
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
        if (isNameAfterName(leftStack[0]?.node)) {
          addKeywordCompletions(
            completions,
            "clause",
            AUDIO_CLAUSE_KEYWORDS,
            writtenClauses("AudioCommand"),
          );
        }
        addStructReferenceCompletions(completions, program, AUDIO_TYPES);
      }
      return buildCompletions();
    }
    if (
      leftStack[0]?.name === "AssetCommandFilterOperator" ||
      leftStack[0]?.name === "AssetCommandFilterName"
    ) {
      return buildCompletions();
    }
    if (isClauseStart(leftStack[0]?.node)) {
      if (isCursorAfterNodeText(leftStack[0])) {
        addKeywordCompletions(
          completions,
          "clause",
          AUDIO_CLAUSE_KEYWORDS,
          writtenClauses("AudioCommand"),
        );
      }
      return buildCompletions();
    }
    const audioValue = clauseValueAt(
      leftStack.find((n) => n.type.name === "AudioCommand"),
      "audio",
      documentCursorOffset,
      read,
    );
    if (audioValue) {
      if (audioValue.keyword === "with") {
        addStructReferenceCompletions(completions, program, ["modulation"]);
      }
      return buildCompletions();
    }
    if (
      (isWhitespaceNode(leftStack[0]?.name) &&
        prevNode?.name === "AssetCommandClauseKeyword" &&
        prevText === "with") ||
      (leftStack[0]?.name === "NameValue" && !!keywordOfValue(leftStack[0].node))
    ) {
      return buildCompletions();
    }
    if (isClauseStart(leftStack[0]?.node)) {
      if (isCursorAfterNodeText(leftStack[0])) {
        addKeywordCompletions(completions, "clause", AUDIO_CLAUSE_KEYWORDS, writtenClauses("AudioCommand"));
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
          VALUE_CLAUSE_KEYWORDS.includes(prevText);
        if (!prevClauseTakesArgument) {
          addKeywordCompletions(
            completions,
            "clause",
            AUDIO_CLAUSE_KEYWORDS,
            writtenClauses("AudioCommand"),
          );
        }
        return buildCompletions();
      }
    }
  }


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

  if (
    isWhitespaceNode(leftStack[0]?.name) &&
    leftStack.some((n) => STRUCT_KEYWORD_HEADER_NAMES.has(n.name)) &&
    (STRUCT_KEYWORD_HEADER_END_NAMES.has(prevNode?.name) ||
      read(leftStack[0].from - 1, leftStack[0].from) === ")")
  ) {
    completions.set("{", {
      label: "{",
      insertText: "{\n\t$0\n}",
      insertTextFormat: InsertTextFormat.Snippet,
      labelDetails: { description: "body" },
      kind: CompletionItemKind.Keyword,
    });
    return buildCompletions();
  }

  const braceDefine = getDefineContext(leftStack, read);
  const braceBlock = braceDefine
    ? braceBlockPathAt(tree, documentCursorOffset, read)
    : null;
  const braceStructPath =
    braceBlock && braceBlock.body.name !== "LuauSparkleElementBlock"
      ? braceBlock.path.map((key) => key === "-" ? "0" : key)
      : null;
  if (braceDefine && leftStack.some((node) => node.name.endsWith("_content") || node.name === "LuauStructBlockLine" || node.name === "LuauSparkleBlockLine")) {
    const lineText = document.getLineText(position.line);
    const entryBefore = braceEntryAt(
      tree,
      documentCursorOffset,
      document.offsetAt({ line: position.line, character: 0 }),
      read,
    );
    const keying =
      !entryInsideValue(entryBefore) &&
      !insideElementValue(tree, documentCursorOffset);
    const typedState = /@[\w-]*$/.exec(entryBefore);
    if (
      keying &&
      braceDefine.type === "style" &&
      typedState &&
      /^\s*@[\w-]*$/.test(entryBefore)
    ) {
      const range = document.range(
        documentCursorOffset - typedState[0].length,
        documentCursorOffset,
      );
      for (const presence of PRESENCE_STATES) {
        completions.set(`@${presence}`, {
          label: `@${presence}`,
          filterText: `@${presence}`,
          textEdit: { range, newText: `@${presence} { $0 }` },
          insertTextFormat: InsertTextFormat.Snippet,
          labelDetails: { description: "appearing and leaving" },
          kind: CompletionItemKind.Keyword,
          documentation: {
            kind: MarkupKind.Markdown,
            value: presenceBlockDocumentation(presence),
          },
        });
      }
      return buildCompletions();
    }
    const typedSelector = SELECTOR_ATTRIBUTE_BEFORE.exec(entryBefore);
    if (
      braceDefine.type === "style" &&
      typedSelector &&
      !insideElementValue(tree, documentCursorOffset)
    ) {
      const typedLength = typedSelector[0].trimStart().length;
      const after = lineText
        .slice(position.character)
        .replace(/[\r\n]+$/, "");
      const nameRest = /^[\p{L}\p{N}_-]*/u.exec(after)![0];
      const written = /^\s*[~|^$*]?=/.test(after.slice(nameRest.length))
        ? "value"
        : after.trim()
          ? "text"
          : "nothing";
      addSelectorAttributeCompletions(
        completions,
        typedSelector,
        document.range(
          documentCursorOffset - typedLength,
          documentCursorOffset + (written === "value" ? nameRest.length : 0),
        ),
        scripts,
        program,
        written,
      );
      return buildCompletions();
    }
    if (
      keying &&
      SPARKLE_BODY_TYPES.has(braceDefine.type) &&
      /^\s*(?:[A-Za-z_][\w-]*)?$/.test(entryBefore)
    ) {
      addSparkleBodyCompletions(completions, program, braceDefine.type);
      return buildCompletions();
    }
    if (
      keying &&
      (!braceStructPath || !braceBlock) &&
      /^\s*[A-Za-z_][\w-]*$/.test(entryBefore)
    ) {
      addStructPropertyNameCompletions(
        completions,
        program,
        config,
        "",
        braceDefine.type,
        braceDefine.name,
        "",
        " = ",
        true,
        lineText,
        position,
        [],
      );
      return buildCompletions();
    }
    if (
      keying &&
      braceStructPath &&
      /^\s*[A-Za-z_$@&>.-]?[\w.%-]*$/.test(entryBefore)
    ) {
      if (braceStructPath.at(-1) === "keyframes") {
        if (/^\s*[A-Za-z]*$/.test(entryBefore)) {
          for (const keyword of KEYFRAME_POSITION_KEYWORDS) {
            completions.set(keyword, {
              label: keyword,
              insertText: `${keyword} { $0 }`,
              insertTextFormat: InsertTextFormat.Snippet,
              labelDetails: { description: "keyframe position" },
              kind: CompletionItemKind.Constant,
            });
          }
        }
        return buildCompletions();
      }
      addStructPropertyNameCompletions(
        completions,
        program,
        config,
        "",
        braceDefine.type,
        braceDefine.name,
        "." + braceStructPath.join("."),
        " = ",
        true,
        lineText,
        position,
        [],
      );
      return buildCompletions();
    }
  }

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

  const trailingCommaNode = isWhitespaceNode(leftStack[0]?.name)
    ? getStack<SparkdownNodeName>(tree, leftStack[0].from, -1)[0]
    : undefined;
  const continuedListPropertyNode =
    trailingCommaNode?.name === "LuauStructBlockTrailingComma"
      ? getStack<SparkdownNodeName>(tree, trailingCommaNode.from, -1).find(
          (n) => n.type.name === "LuauStructBlockProperty",
        )
      : undefined;
  const scalarPropertyNode =
    leftStack.find((n) => n.type.name === "LuauStructBlockProperty") ??
    continuedListPropertyNode;
  if (
    scalarPropertyNode &&
    ((isWhitespaceNode(leftStack[0]?.name) &&
      prevNode.name === "AssignEqualOperator") ||
      scalarPropertyNode === continuedListPropertyNode ||
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
        isExplicitRuleName(n.type.name, "LuauAccessPath") || n.type.name === "StylingAccessPath",
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
      const valueText =
        valueNode && scalarPropertyNode === continuedListPropertyNode
          ? read(valueNode.from, documentCursorOffset)
          : valueNode
            ? getNodeText(valueNode)
            : "";
      const valueCursorOffset =
        scalarPropertyNode === continuedListPropertyNode
          ? valueText.length
          : getCursorOffset(valueNode ?? undefined);
      addStructPropertyValueCompletions(
        completions,
        program,
        config,
        "",
        defineContext.type,
        defineContext.name,
        "." +
          [
            ...(scalarPropertyNode.name === "LuauStructBlockProperty" &&
            braceStructPath
              ? braceStructPath
              : []),
            propertyName,
          ].join("."),
        valueText,
        valueCursorOffset,
        context,
      );
    }
    return buildCompletions();
  }

  const accessPathNode = leftStack.find(
    (n) =>
      isExplicitRuleName(n.type.name, "LuauAccessPath") || n.type.name === "StylingAccessPath",
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
      if (
        DEFINE_VALUE_ASSET_TYPES.has(valueText.split(".")[0] ?? "") &&
        getDefineContext(leftStack, read)
      ) {
        addStructAccessPathCompletions(
          completions,
          program,
          valueText,
          valueCursorOffset,
        );
      }
      const scopes = getDeclarationScopes(scripts, cursor);
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

  if (
    leftStack[0]?.name === "DivertMark" &&
    !getNodeText(
      getDescendentInsideParent("Divert_content", "Divert", leftStack),
    )
  ) {
    if (isCursorAfterNodeText(leftStack[0])) {
      const scopes = getDeclarationScopes(scripts, cursor);
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
      const scopes = getDeclarationScopes(scripts, cursor);
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
  if (isExplicitRuleName(leftStack[0]?.name, "DivertPath")) {
    if (isCursorAfterNodeText(leftStack[0])) {
      const valueText = getNodeText(leftStack[0]);
      const valueCursorOffset = getCursorOffset(leftStack[0]);
      const scopes = getDeclarationScopes(scripts, cursor);
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
  const divertPathNode = leftStack.find((n) => isExplicitRuleName(n.type.name, "DivertPath"));
  if (
    divertPathNode &&
    (leftStack[0]?.name === "PunctuationAccessor" ||
      leftStack[0]?.name === "DivertPartName")
  ) {
    if (isCursorAfterNodeText(divertPathNode)) {
      const valueText = getNodeText(divertPathNode);
      const valueCursorOffset = getCursorOffset(divertPathNode);
      const scopes = getDeclarationScopes(scripts, cursor);
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
    const storyCondition = leftStack.findIndex(
      (n) => n.name === "LuauSparkdownExplicitLoopCondition",
    );
    const storyConditionLoop =
      storyCondition < 0
        ? undefined
        : leftStack
            .slice(storyCondition + 1)
            .find(
              (n) =>
                n.name === "LuauSparkdownForLoop" ||
                n.name === "LuauSparkdownWhileLoop" ||
                n.name === "LuauSparkdownExplicitLoop",
            );
    const markedLoopBegin =
      storyConditionLoop?.name === "LuauSparkdownExplicitLoop"
        ? storyConditionLoop.getChild("LuauSparkdownExplicitLoop_begin")
        : null;
    const storyConditionIsFor =
      storyConditionLoop?.name === "LuauSparkdownForLoop" ||
      (!!markedLoopBegin &&
        !!getDescendent(
          "LuauForKeyword",
          markedLoopBegin as GrammarSyntaxNode<SparkdownNodeName>,
        ));
    if (
      leftStack.some((n) => n.name === "LuauForCondition") ||
      storyConditionIsFor
    ) {
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
      const written =
        contentNode &&
        readSpeakerBeingWritten(
          read(contentNode.from, documentCursorOffset).trimStart(),
          read(documentCursorOffset, contentNode.to),
        );
      const speakerEndsCue =
        written && written.endsCue
          ? cueBeingTyped(written.name, program)
          : false;
      if (speakerEndsCue || isCursorAfterNodeText(contentNode)) {
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
        } else if (written && speakerEndsCue) {
          addSpeakerCompletions(
            completions,
            program,
            document.range(
              documentCursorOffset - written.typed.length,
              documentCursorOffset + written.rest.length + written.tail.length,
            ),
            `${written.tail.trimEnd()}: `,
          );
        } else {
          addCharacterCompletions(
            completions,
            scripts,
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

const AT_NAME = /^[_\p{L}][_\p{L}\p{N}-]*(?:@[_\p{L}\p{N}-]+)*$/u;

const typedAtName = (
  document: SparkdownDocument,
  tree: Tree,
  offset: number,
): { from: number; nameEnd: number } | undefined => {
  const trailing = document.read(offset - 1, offset) === "@";
  const nameEnd = trailing ? offset - 1 : offset;
  const node = tree.resolveInner(nameEnd, -1);
  if (node.to !== nameEnd || node.from >= nameEnd) {
    return undefined;
  }
  const name = document.read(node.from, nameEnd);
  if (!AT_NAME.test(name) || (!trailing && !name.includes("@"))) {
    return undefined;
  }
  return { from: node.from, nameEnd };
};

export const getCompletions = (
  document: SparkdownDocument | undefined,
  tree: Tree | undefined,
  scripts: Map<string, AnnotatedScript>,
  program: SparkProgram | undefined,
  config: SparkdownCompilerConfig | undefined,
  position: Position,
  context: CompletionContext | undefined,
): CompletionItem[] | null | undefined => {
  if (!document || !tree) {
    return completionsAt(document, tree, scripts, program, config, position, context);
  }
  const offset = document.offsetAt(position);
  const typed = typedAtName(document, tree, offset);
  if (!typed) {
    return completionsAt(document, tree, scripts, program, config, position, context);
  }
  const items = completionsAt(
    document,
    tree,
    scripts,
    program,
    config,
    document.positionAt(typed.nameEnd),
    typed.nameEnd === offset ? context : undefined,
  );
  const range = document.range(typed.from, offset);
  return items?.map((item) =>
    item.textEdit ? item : { ...item, textEdit: { range, newText: item.insertText ?? item.label } },
  );
};

import {
  Compiler as GrammarCompiler,
  NodeSet,
  NodeType,
  Tree,
  printTree,
} from "../../../grammar-compiler/src/compiler";
import { NodeID } from "../../../grammar-compiler/src/core";
import { Grammar } from "../../../grammar-compiler/src/grammar";
import GRAMMAR_DEFINITION from "../../language/sparkdown.language-grammar.json";
import {
  Compiler as InkCompiler,
  CompilerOptions as InkCompilerOptions,
} from "../inkjs/compiler/Compiler";
import { ErrorType } from "../inkjs/compiler/Parser/ErrorType";
import { SourceMetadata } from "../inkjs/engine/Error";
import { StringValue } from "../inkjs/engine/Value";
import { DiagnosticSeverity, SparkDiagnostic } from "../types/SparkDiagnostic";
import { SparkParserConfig } from "../types/SparkParserConfig";
import { SparkProgram } from "../types/SparkProgram";
import { SparkdownNodeName } from "../types/SparkdownNodeName";
import selectProperty from "../utils/selectProperty";
import uuid from "../utils/uuid";
import filterSVG from "../utils/filterSVG";
import buildSVGSource from "../utils/buildSVGSource";
import filterMatchesName from "../utils/filterMatchesName";
import getAllProperties from "../utils/getAllProperties";
import setProperty from "../utils/setProperty";
import { getCharacterIdentifier } from "../utils/getCharacterIdentifier";
import { SparkReference } from "../types/SparkReference";

const LANGUAGE_NAME = GRAMMAR_DEFINITION.name.toLowerCase();

const NEWLINE_REGEX: RegExp = /\r\n|\r|\n/;
const INDENT_REGEX: RegExp = /^[ \t]*/;
const UUID_MARKER_REGEX = new RegExp(GRAMMAR_DEFINITION.repository.UUID.match);

const IMAGE_CONTROL_KEYWORDS =
  GRAMMAR_DEFINITION.variables.IMAGE_CONTROL_KEYWORDS;
const AUDIO_CONTROL_KEYWORDS =
  GRAMMAR_DEFINITION.variables.AUDIO_CONTROL_KEYWORDS;
const IMAGE_CLAUSE_KEYWORDS =
  GRAMMAR_DEFINITION.variables.IMAGE_CLAUSE_KEYWORDS;
const AUDIO_CLAUSE_KEYWORDS =
  GRAMMAR_DEFINITION.variables.AUDIO_CLAUSE_KEYWORDS;

const PROPERTY_SELECTOR_SIMPLE_CONDITION_NAMES = [
  "hovered",
  "focused",
  "pressed",
  "disabled",
  "enabled",
  "checked",
  "unchecked",
  "required",
  "valid",
  "invalid",
  "readonly",
  "first",
  "last",
  "only",
  "odd",
  "even",
  "empty",
  "blank",
  "opened",
  "before",
  "after",
  "placeholder",
  "selection",
  "marker",
  "backdrop",
  "initial",
];
const PROPERTY_SELECTOR_FUNCTION_CONDITION_NAMES = [
  "language",
  "direction",
  "has",
  "screen",
  "theme",
];
const PROPERTY_SELECTOR_DIRECTION_ARGUMENTS = ["rtl", "ltr"];
const PROPERTY_SELECTOR_THEME_ARGUMENTS = ["dark", "light"];
const PROPERTY_SELECTOR_SCREEN_ARGUMENTS = [
  "xs",
  "sm",
  "md",
  "lg",
  "xl",
  "2xl",
];

const formatList = (arr: string[]) => {
  const quotedList = arr.map((c) => `'${c}'`);
  return quotedList.length === 1
    ? quotedList[0]
    : quotedList.length === 2
    ? `${quotedList[0]} or ${quotedList[1]}`
    : quotedList.slice(0, -1).join(", ") + `, or ${quotedList.at(-1)}`;
};

const getRange = (
  from: number,
  to: number,
  script: string,
  currentLineIndex: number,
  currentLinePos: number
) => {
  const rangeLength = to - from;
  const startLineIndex = currentLineIndex;
  const startLineOffset = from - currentLinePos;
  let endLineIndex = startLineIndex;
  let endLinePos = from;
  for (let i = from; i < from + rangeLength; i++) {
    if (script[i] === "\r" && script[i + 1] === "\n") {
      endLinePos = i + 1;
      endLineIndex++;
      i++;
    } else if (script[i] === "\r" || script[i] === "\n") {
      endLinePos = i;
      endLineIndex++;
    }
  }
  const endLineOffset = to - endLinePos;
  return {
    start: {
      line: startLineIndex,
      character: startLineOffset,
    },
    end: {
      line: endLineIndex,
      character: endLineOffset,
    },
  };
};

/**
 * Node emitted when a character doesn't match anything in the grammar,
 * and the parser had to manually advance past it.
 */
export const NODE_ERROR_UNRECOGNIZED = NodeType.define({
  name: "⚠️ ERROR_UNRECOGNIZED",
  id: NodeID.unrecognized,
  error: true,
});

/** Node emitted at the end of incomplete nodes. */
export const NODE_ERROR_INCOMPLETE = NodeType.define({
  name: "⚠️ ERROR_INCOMPLETE",
  id: NodeID.incomplete,
  error: true,
});

const getRuleNodeType = (
  topNode: NodeType,
  typeIndex: number,
  typeId: string
): NodeType => {
  if (typeIndex === NodeID.none) {
    return NodeType.none;
  }
  if (typeIndex === NodeID.top) {
    return topNode;
  }
  if (typeIndex === NodeID.unrecognized) {
    return NODE_ERROR_UNRECOGNIZED;
  }
  if (typeIndex === NodeID.incomplete) {
    return NODE_ERROR_INCOMPLETE;
  }
  // In CodeMirror, `id` is the unique number identifier and `name` is the unique string identifier
  // This is different than the parser node that calls `typeIndex` the unique number identifier and `typeId` the unique string identifier
  return NodeType.define({ id: typeIndex, name: typeId });
};

export default class SparkParser {
  protected _nodeTypeProp = "nodeType";

  protected _nodeSet: NodeSet;

  protected _config: SparkParserConfig = {};

  protected _grammarCompiler: GrammarCompiler;

  protected _grammar: Grammar;
  get grammar() {
    return this._grammar;
  }

  protected _trees = new Map<string, Tree>();
  get trees() {
    return this._trees;
  }

  constructor(config: SparkParserConfig) {
    this._config = config || this._config;
    const rootNodeType = NodeType.define({
      id: NodeID.top,
      name: name,
      top: true,
    });
    const declarator = (typeIndex: number, typeId: string) => ({
      [this._nodeTypeProp]: getRuleNodeType(rootNodeType, typeIndex, typeId),
    });
    this._grammar = new Grammar(GRAMMAR_DEFINITION, declarator);
    const nodeTypes = this.grammar.nodes.map(
      (n) => n.props[this._nodeTypeProp]
    );
    this._nodeSet = new NodeSet(nodeTypes);
    this._grammarCompiler = new GrammarCompiler(this._grammar, this._nodeSet);
  }

  configure(config: SparkParserConfig) {
    if (config.builtins && config.builtins !== this._config.builtins) {
      this._config.builtins = config.builtins;
    }
    if (config.files && config.files !== this._config.files) {
      this._config.files = config.files;
    }
    if (config.resolveFile && config.resolveFile !== this._config.resolveFile) {
      this._config.resolveFile = config.resolveFile;
    }
    if (config.readFile && config.readFile !== this._config.readFile) {
      this._config.readFile = config.readFile;
    }
  }

  transpile(uri: string, program: SparkProgram): string {
    const nodeNames = this._grammar.nodeNames;
    const script = this._config?.readFile?.(uri) || "";
    const lines = script.split(NEWLINE_REGEX);
    const sourceLines = [...lines];
    // Pad script so we ensure all scopes are properly closed before the end of the file.
    const paddedScript = script + "\n\n";
    const tree = this.buildTree(paddedScript);
    this._trees.set(uri, tree);
    const stack: SparkdownNodeName[] = [];
    program.sourceMap ??= {};
    program.sourceMap[uri] ??= [];
    const fileIndex = Object.keys(program.sourceMap).indexOf(uri);
    let lineIndex = 0;
    let linePos = 0;
    let range:
      | {
          start: {
            line: number;
            character: number;
          };
          end: {
            line: number;
            character: number;
          };
        }
      | undefined = undefined;
    let prevNodeType = "";
    let blockPrefix = "";
    let structType = "";
    let propertyName = "";
    let selectorFunctionName = "";
    const generateID = () => {
      while (true) {
        const id = uuid();
        if (!program.uuidToSource?.[id]) {
          program.uuidToSource ??= {};
          program.uuidToSource[id] = [fileIndex, lineIndex];
          return id;
        }
      }
    };
    const getFlowMarker = (id: string) => {
      return `=${id}=`;
    };
    const reportDiagnostic = (
      message: string,
      severity: DiagnosticSeverity = DiagnosticSeverity.Warning,
      mark?:
        | "end"
        | {
            start: { line: number; character: number };
            end: { line: number; character: number };
          }
    ) => {
      if (range) {
        const markRange = !mark
          ? range
          : mark === "end"
          ? { start: { ...range.end }, end: { ...range.end } }
          : mark;
        program.diagnostics ??= {};
        program.diagnostics[uri] ??= [];
        program.diagnostics[uri].push({
          range: markRange,
          severity,
          message,
          relatedInformation: [
            {
              location: { uri, range: markRange },
              message,
            },
          ],
          source: LANGUAGE_NAME,
        });
      }
    };
    const recordReference = (reference: SparkReference) => {
      program.references ??= {};
      program.references[uri] ??= {};
      program.references[uri][lineIndex] ??= [];
      program.references[uri][lineIndex]!.push({
        range: reference.range ?? range,
        fuzzy: reference.fuzzy,
        types: reference.types,
        selectors: reference.selectors,
        description: reference.description,
      });
    };
    const define = (type: string, name: string, obj: object) => {
      program.implicitDefs ??= {};
      program.implicitDefs[type] ??= {};
      program.implicitDefs[type][name] ??= {
        $type: type,
        $name: name,
        ...obj,
      };
    };
    tree.iterate({
      enter: (node) => {
        const nodeType = node.type.name as SparkdownNodeName;
        const transpilationOffset = program.sourceMap?.[uri]?.[lineIndex];
        const after = transpilationOffset?.after ?? 0;
        const shift = transpilationOffset?.shift ?? 0;
        const sourceNodeStart = node.from - linePos;
        const transpiledNodeStart =
          sourceNodeStart > after ? shift + sourceNodeStart : sourceNodeStart;
        const sourceNodeEnd = node.to - linePos;
        const transpiledNodeEnd =
          sourceNodeEnd > after ? shift + sourceNodeEnd : sourceNodeEnd;

        const lineText = lines[lineIndex] || "";
        const text = script.slice(node.from, node.to);
        range = getRange(node.from, node.to, script, lineIndex, linePos);

        // Annotate dialogue line with implicit flow marker
        if (
          nodeType === "BlockDialogue_begin" ||
          nodeType === "BlockWrite_begin"
        ) {
          const lineTextBefore = lineText.slice(0, transpiledNodeEnd);
          const lineTextAfter = lineText.slice(transpiledNodeEnd);
          const id = generateID();
          const flowMarker = getFlowMarker(id);
          const colonSeparator =
            lineTextBefore.trimStart().length === 1 ? " : " : ": ";
          const markup = colonSeparator + flowMarker + "\\";
          lines[lineIndex] = lineTextBefore + markup + lineTextAfter;
          program.sourceMap ??= {};
          program.sourceMap[uri]![lineIndex] = {
            after: lineTextBefore.length,
            shift: markup.length,
          };
          program.uuidToSource ??= {};
          program.uuidToSource[id] = [fileIndex, lineIndex];
          blockPrefix = lineTextBefore;
        }
        // Annotate dialogue line with implicit character name and flow marker
        if (nodeType === "BlockLineContinue" || nodeType === "BlockLineBreak") {
          if (prevNodeType.startsWith("BlockLineBreak")) {
            const lineTextBefore = lineText.slice(0, transpiledNodeStart);
            const lineTextAfter = lineText.slice(transpiledNodeStart);
            const prefix = blockPrefix + ": ";
            const id = generateID();
            const flowMarker = getFlowMarker(id);
            const markup = prefix + flowMarker;
            lines[lineIndex] = lineTextBefore + markup + lineTextAfter;
            program.sourceMap ??= {};
            program.sourceMap[uri]![lineIndex] = {
              after: lineTextBefore.length,
              shift: markup.length,
            };
            program.uuidToSource ??= {};
            program.uuidToSource[id] = [fileIndex, lineIndex];
          }
        }
        // Annotate line with implicit flow marker
        if (
          nodeType === "InlineDialogue_begin" ||
          nodeType === "InlineWrite_begin" ||
          nodeType === "Transition_begin" ||
          nodeType === "Scene_begin" ||
          nodeType === "Action_begin"
        ) {
          const lineTextBefore = lineText.slice(0, transpiledNodeEnd);
          const lineTextAfter = lineText.slice(transpiledNodeEnd);
          if (
            !lineTextAfter.startsWith("=") &&
            !lineTextBefore.trim().endsWith("<>")
          ) {
            const id = generateID();
            const flowMarker = getFlowMarker(id);
            const markup = flowMarker;
            lines[lineIndex] = lineTextBefore + markup + lineTextAfter;
            program.sourceMap ??= {};
            program.sourceMap[uri]![lineIndex] = {
              after: lineTextBefore.length,
              shift: markup.length,
            };
            program.uuidToSource ??= {};
            program.uuidToSource[id] = [fileIndex, lineIndex];
          }
        }
        // Record explicit flow marker's source location
        if (nodeType === "UUID") {
          const id = lineText
            .slice(transpiledNodeStart, transpiledNodeEnd)
            .trim();
          if (id) {
            program.uuidToSource ??= {};
            program.uuidToSource[id] = [fileIndex, lineIndex];
          }
        }
        if (nodeType === "DefineTypeName") {
          structType = text;
        }
        if (nodeType === "DefineVariableName") {
          if (
            IMAGE_CLAUSE_KEYWORDS.includes(text) ||
            AUDIO_CLAUSE_KEYWORDS.includes(text)
          ) {
            const message = `'${text}' is not allowed as a defined name`;
            reportDiagnostic(message, DiagnosticSeverity.Error);
          }
        }
        if (
          nodeType === "DeclarationScalarPropertyName" ||
          nodeType === "DeclarationObjectPropertyName"
        ) {
          propertyName = text;
        }
        // Record transition use
        if (nodeType === "Transition_content") {
          program.metadata ??= {};
          program.metadata.transitions ??= {};
          program.metadata.transitions[text] ??= [];
          program.metadata.transitions[text].push({ uri, range });
        }
        // Record scene use
        if (nodeType === "Scene_content") {
          program.metadata ??= {};
          program.metadata.scenes ??= {};
          program.metadata.scenes[text] ??= [];
          program.metadata.scenes[text].push({ uri, range });
        }
        // Record character use
        if (nodeType === "DialogueCharacter") {
          program.metadata ??= {};
          program.metadata.characters ??= {};
          program.metadata.characters[text] ??= [];
          program.metadata.characters[text].push({ uri, range });
          define("character", getCharacterIdentifier(text), {});
        }
        // Record reference in struct field value
        if (nodeType === "AccessPath" && stack.at(-1) === "StructFieldValue") {
          const types = [];
          const selectors = [text];
          let [type, name] = text.split(".");
          if (type && !name) {
            name = type;
            type = undefined;
          }
          // TODO: Retrieve expected property type from builtins rather than inferring it from propertyName
          if (
            propertyName.split("_").includes("image") ||
            propertyName.split("_").includes("images") ||
            (structType === "layered_image" && propertyName === "assets")
          ) {
            types.push("filtered_image", "layered_image", "image", "graphic");
            selectors.push(
              `filtered_image.${name}`,
              `layered_image.${name}`,
              `image.${name}`,
              `graphic.${name}`
            );
            type ??= "image";
          } else if (
            propertyName.split("_").includes("audio") ||
            (structType === "layered_audio" && propertyName === "assets")
          ) {
            types.push("audio", "synth");
            selectors.push(`audio.${name}`, `synth.${name}`);
            type ??= "audio";
          } else if (
            propertyName.split("_").includes("filter") ||
            propertyName.split("_").includes("filters")
          ) {
            types.push("filter");
            selectors.push(`filter.${name}`);
            type ??= "filter";
          } else if (
            propertyName.split("_").includes("animation") ||
            propertyName.split("_").includes("animations") ||
            structType === "transition"
          ) {
            types.push("animation");
            selectors.push(`animation.${name}`);
            type ??= "animation";
          } else if (
            propertyName.split("_").includes("font") ||
            propertyName.split("_").includes("fonts")
          ) {
            types.push("font");
            selectors.push(`font.${name}`);
            type ??= "font";
          }
          const description = type ? `${type} named '${name}'` : `'${name}'`;
          recordReference({ types, selectors, description });
        }
        // Report invalid property selectors
        if (nodeType === "PropertySelectorSimpleConditionName") {
          if (!PROPERTY_SELECTOR_SIMPLE_CONDITION_NAMES.includes(text)) {
            const message = PROPERTY_SELECTOR_FUNCTION_CONDITION_NAMES.includes(
              text
            )
              ? "Conditional selector should be a function"
              : "Unrecognized conditional selector";
            reportDiagnostic(message);
          }
        }
        if (nodeType === "PropertySelectorFunctionConditionName") {
          selectorFunctionName = text;
          if (!PROPERTY_SELECTOR_FUNCTION_CONDITION_NAMES.includes(text)) {
            const message = PROPERTY_SELECTOR_SIMPLE_CONDITION_NAMES.includes(
              text
            )
              ? "Conditional selector is not a function"
              : "Unrecognized conditional selector";
            reportDiagnostic(message);
          }
        }
        if (nodeType === "PropertySelectorConstant") {
          if (
            selectorFunctionName === "direction" &&
            !PROPERTY_SELECTOR_DIRECTION_ARGUMENTS.includes(text)
          ) {
            const message = `Unrecognized direction argument: Supported values are ${formatList(
              PROPERTY_SELECTOR_DIRECTION_ARGUMENTS
            )}`;
            reportDiagnostic(message);
          }
          if (
            selectorFunctionName === "theme" &&
            !PROPERTY_SELECTOR_THEME_ARGUMENTS.includes(text)
          ) {
            const message = `Unrecognized theme argument: Supported values are ${formatList(
              PROPERTY_SELECTOR_THEME_ARGUMENTS
            )}`;
            reportDiagnostic(message);
          }
          if (
            selectorFunctionName === "screen" &&
            !PROPERTY_SELECTOR_SCREEN_ARGUMENTS.includes(text)
          ) {
            const message = `Unrecognized screen argument: Supported values are ${formatList(
              PROPERTY_SELECTOR_SCREEN_ARGUMENTS
            )}`;
            reportDiagnostic(message);
          }
        }
        // Record image target reference
        if (
          stack.includes("ImageCommand") &&
          nodeType === "AssetCommandTarget"
        ) {
          const types: string[] = [];
          const selectors = [`ui..${text}`];
          const description = `ui element named '${text}'`;
          const fuzzy = true;
          recordReference({ types, selectors, description, fuzzy });
        }
        // Record audio target reference
        if (
          stack.includes("AudioCommand") &&
          nodeType === "AssetCommandTarget"
        ) {
          const types = ["channel"];
          const selectors = [`channel.${text}`];
          const description = `channel named '${text}'`;
          recordReference({ types, selectors, description });
        }
        // Define implicit filtered_image
        if (stack.includes("ImageCommand") && nodeType === "AssetCommandName") {
          if (text.includes("~")) {
            const parts = text.split("~");
            const [fileName, ...filterNames] = parts;
            const sortedFilterNames = filterNames.sort();
            const name = [fileName, ...sortedFilterNames].join("~");
            const obj = {
              image: { $name: fileName },
              filters: sortedFilterNames.map((filterName) => ({
                $type: "filter",
                $name: filterName,
              })),
            };
            define("filtered_image", name, obj);
          }
        }
        // Record image file name reference
        if (
          stack.includes("ImageCommand") &&
          nodeType === "AssetCommandFileName"
        ) {
          const types = ["filtered_image", "layered_image", "image", "graphic"];
          const selectors = [
            `filtered_image.${text}`,
            `layered_image.${text}`,
            `image.${text}`,
            `graphic.${text}`,
          ];
          const description = `image named '${text}'`;
          recordReference({ types, selectors, description });
        }
        // Record image filter reference
        if (
          stack.includes("ImageCommand") &&
          nodeType === "AssetCommandFilterName"
        ) {
          const types = ["filter"];
          const selectors = [`filter.${text}`];
          const description = `filter named '${text}'`;
          recordReference({ types, selectors, description });
        }
        // Record audio file reference
        if (
          stack.includes("AudioCommand") &&
          nodeType === "AssetCommandFileName"
        ) {
          const types = ["layered_audio", "audio", "synth"];
          const selectors = [
            `layered_audio.${text}`,
            `audio.${text}`,
            `synth.${text}`,
          ];
          const description = `audio named '${text}'`;
          recordReference({ types, selectors, description });
        }
        // Record audio filter reference
        if (
          stack.includes("AudioCommand") &&
          nodeType === "AssetCommandFilterName"
        ) {
          const types = ["filter"];
          const selectors = [`filter.${text}`];
          const description = `filter named '${text}'`;
          recordReference({ types, selectors, description });
        }
        // Report invalid image control
        if (
          stack.includes("ImageCommand") &&
          nodeType === "AssetCommandControl" &&
          !IMAGE_CONTROL_KEYWORDS.includes(text)
        ) {
          const message = `Unrecognized visual control: Visual commands only support ${formatList(
            IMAGE_CONTROL_KEYWORDS
          )}`;
          reportDiagnostic(message);
        }
        // Report invalid audio control
        if (
          stack.includes("AudioCommand") &&
          nodeType === "AssetCommandControl" &&
          !AUDIO_CONTROL_KEYWORDS.includes(text)
        ) {
          const message = `Unrecognized visual control: Visual commands only support ${formatList(
            AUDIO_CONTROL_KEYWORDS
          )}`;
          reportDiagnostic(message);
        }
        // Report invalid image name syntax
        if (stack.includes("ImageCommand") && nodeType === "IllegalChar") {
          const message = `Invalid syntax`;
          reportDiagnostic(message, DiagnosticSeverity.Error);
        }
        // Report invalid audio name syntax
        if (stack.includes("AudioCommand") && nodeType === "IllegalChar") {
          const message = `Invalid syntax`;
          reportDiagnostic(message, DiagnosticSeverity.Error);
        }
        if (nodeType === "AssetCommandClauseKeyword") {
          const valueNode = node.node.nextSibling?.node.nextSibling;
          const valueNodeType = (
            valueNode ? valueNode.type.name : ""
          ) as SparkdownNodeName;
          if (text === "after") {
            if (
              valueNodeType !== "ConditionalBlock" &&
              valueNodeType !== "TimeValue" &&
              valueNodeType !== "NumberValue"
            ) {
              const message = `'${text}' should be followed by a time value (e.g. 'after 2' or 'after 2s' or 'after 200ms')`;
              reportDiagnostic(message, DiagnosticSeverity.Error, "end");
            }
          }
          if (text === "over") {
            if (
              valueNodeType !== "ConditionalBlock" &&
              valueNodeType !== "TimeValue" &&
              valueNodeType !== "NumberValue"
            ) {
              const message = `'${text}' should be followed by a time value (e.g. 'over 2' or 'over 2s' or 'over 200ms')`;
              reportDiagnostic(message, DiagnosticSeverity.Error, "end");
            }
          }
          if (text === "with") {
            if (
              stack.includes("ImageCommand") &&
              valueNodeType !== "ConditionalBlock" &&
              valueNodeType !== "NameValue"
            ) {
              const message = `'${text}' should be followed by the name of a transition or animation (e.g. 'with shake')`;
              reportDiagnostic(message, DiagnosticSeverity.Error, "end");
            }
            if (
              stack.includes("AudioCommand") &&
              valueNodeType !== "ConditionalBlock" &&
              valueNodeType !== "NameValue"
            ) {
              const message =
                "'with' should be followed by the name of a modulation (e.g. 'with echo')";
              reportDiagnostic(message);
            }
          }
          if (text === "fadeto") {
            if (
              (valueNodeType !== "ConditionalBlock" &&
                valueNodeType !== "NumberValue") ||
              (valueNodeType === "NumberValue" &&
                (Number(text) < 0 || Number(text) > 1))
            ) {
              const message = `'${text}' should be followed by a number between 0 and 1 (e.g. 'fadeto 0' or 'fadeto 0.5' or 'fadeto 1')`;
              reportDiagnostic(message, DiagnosticSeverity.Error, "end");
            }
          }
          if (
            text === "wait" ||
            text === "nowait" ||
            text === "loop" ||
            text === "noloop" ||
            text === "mute" ||
            text === "unmute" ||
            text === "now"
          ) {
            if (
              valueNode &&
              (valueNodeType === "ConditionalBlock" ||
                valueNodeType === "TimeValue" ||
                valueNodeType === "NumberValue")
            ) {
              const message = `'${text}' is a flag and cannot take an argument`;
              const nodeCharacterOffset = valueNode.to - node.to;
              const markRange = {
                start: { ...range.start },
                end: {
                  line: range.end.line,
                  character: range.end.character + nodeCharacterOffset,
                },
              };
              reportDiagnostic(message, DiagnosticSeverity.Error, markRange);
            }
          }
        }
        if (stack.includes("ImageCommand") && nodeType === "NameValue") {
          const types = ["transition", "animation"];
          const selectors = [`transition.${text}`, `animation.${text}`];
          const description = `transition or animation named '${text}'`;
          recordReference({ types, selectors, description });
        }
        if (stack.includes("AudioCommand") && nodeType === "NameValue") {
          const types = ["modulation"];
          const selectors = [`modulation.${text}`];
          const description = `modulation named '${text}'`;
          recordReference({ types, selectors, description });
        }
        if (nodeType === "Newline") {
          lineIndex += 1;
          linePos = node.to;
        } else {
          prevNodeType = nodeType;
        }
        stack.push(nodeType);
      },
      leave: (node) => {
        const nodeType = node.type.name as SparkdownNodeName;
        const transpilationOffset = program.sourceMap?.[uri]?.[lineIndex];
        const after = transpilationOffset?.after ?? 0;
        const shift = transpilationOffset?.shift ?? 0;
        const nodeEndCharacter = node.to - linePos;
        const nodeEnd =
          nodeEndCharacter > after
            ? shift + nodeEndCharacter
            : nodeEndCharacter;
        if (nodeType === "BlockDialogue_end" || nodeType === "BlockWrite_end") {
          blockPrefix = "";
        }
        if (nodeType === "BlockLineContinue") {
          const lineText = lines[lineIndex] || "";
          const lineTextBefore = lineText.slice(0, nodeEnd);
          const lineTextAfter = lineText.slice(nodeEnd);
          if (
            !lineTextBefore.trim().endsWith("\\") &&
            !lineTextAfter.trim().startsWith("\\")
          ) {
            const indentMatch = lineText.match(INDENT_REGEX);
            const indent = indentMatch?.[0] || "";
            const nextLineText = lines[lineIndex + 1] || "";
            // Check that this dialogue line is not the last in the block
            if (nextLineText.startsWith(indent)) {
              // All lines (except the last in a block) should end with implicit \
              // (So they are grouped together with following text line)
              const suffix = " \\";
              const markup = suffix;
              lines[lineIndex] = lineTextBefore + markup + lineTextAfter;
            }
          }
        }
        if (nodeType === "DefineDeclaration") {
          structType = "";
        }
        if (
          nodeType === "StructScalarProperty" ||
          nodeType === "StructObjectProperty"
        ) {
          propertyName = "";
        }
        stack.pop();
      },
    });
    while (lines.at(-1) === "") {
      // Remove empty newlines at end of script
      lines.pop();
    }
    const transpiled = lines.join("\n");
    // console.log(printTree(tree, script, nodeNames));
    // console.log(transpiled);
    return transpiled;
  }

  parse(filename: string): SparkProgram {
    // console.clear();
    this._trees.clear();
    const program: SparkProgram = {};
    const transpiledScripts = new Map<string, string>();

    const options = new InkCompilerOptions(
      "",
      [],
      false,
      (message: string, type, source) => {
        console.error(message, type, source);
      },
      {
        ResolveInkFilename: (name: string): string => {
          return this._config?.resolveFile?.(name) || name;
        },
        LoadInkFileContents: (uri: string): string => {
          program.sourceMap ??= {};
          let transpiledScript = transpiledScripts.get(uri);
          if (transpiledScript != null) {
            return transpiledScript;
          }
          transpiledScript = this.transpile(uri, program);
          transpiledScripts.set(uri, transpiledScript);
          return transpiledScript;
        },
      },
      {
        WriteRuntimeObject: (_, obj) => {
          if (obj instanceof StringValue) {
            if (!obj.isNewline && obj.value) {
              const flowMarkers = obj.value.match(UUID_MARKER_REGEX);
              if (flowMarkers) {
                const path = obj.path.toString();
                for (const m of flowMarkers) {
                  const flowMarker = m.trim().slice(1, -1);
                  program.uuidToPath ??= {};
                  program.uuidToPath[flowMarker] ??= path;
                }
              }
            }
          }
          return false;
        },
      }
    );
    const rootFilename = filename || "main.script";
    const inkCompiler = new InkCompiler(`INCLUDE ${rootFilename}`, options);
    try {
      const compiledJSON = inkCompiler.Compile().ToJson();
      program.compiled = compiledJSON ? JSON.parse(compiledJSON) : null;
      this.populateBuiltins(program);
      this.populateAssets(program);
      this.populateImplicitDefs(program);
      this.validateReferences(program);
      program.uuidToSource ??= {};
      program.uuidToSource = this.sortSources(program.uuidToSource);
    } catch (e) {
      console.error(e);
    }
    for (const error of inkCompiler.errors) {
      program.diagnostics ??= {};
      const diagnostic = this.getDiagnostic(
        error.message,
        ErrorType.Error,
        error.source,
        program
      );
      if (diagnostic) {
        if (diagnostic.relatedInformation) {
          for (const info of diagnostic.relatedInformation) {
            const uri = info.location.uri;
            if (uri) {
              program.diagnostics[uri] ??= [];
              program.diagnostics[uri].push(diagnostic);
            }
          }
        }
      }
    }
    for (const warning of inkCompiler.warnings) {
      program.diagnostics ??= {};
      const diagnostic = this.getDiagnostic(
        warning.message,
        ErrorType.Warning,
        warning.source,
        program
      );
      if (diagnostic) {
        if (diagnostic.relatedInformation) {
          for (const info of diagnostic.relatedInformation) {
            const uri = info.location.uri;
            if (uri) {
              program.diagnostics[uri] ??= [];
              program.diagnostics[uri].push(diagnostic);
            }
          }
        }
      }
    }
    for (const info of inkCompiler.infos) {
      program.diagnostics ??= {};
      const diagnostic = this.getDiagnostic(
        info.message,
        ErrorType.Information,
        info.source,
        program
      );
      if (diagnostic) {
        if (diagnostic.relatedInformation) {
          for (const info of diagnostic.relatedInformation) {
            const uri = info.location.uri;
            if (uri) {
              program.diagnostics[uri] ??= [];
              program.diagnostics[uri].push(diagnostic);
            }
          }
        }
      }
    }
    // console.log("program", program);
    return program;
  }

  buildTree(script: string): Tree {
    // Pad script with newline to ensure any open scopes are closed by the end of the script.
    let paddedScript = script + "\n";
    const result = this._grammarCompiler.compile(paddedScript);
    if (!result) {
      throw new Error("Could not compile sparkdown script");
    }
    const topID = NodeID.top;
    const buffer = result.cursor;
    const reused = result.reused;
    const tree = Tree.build({
      topID,
      buffer,
      reused,
      nodeSet: this._nodeSet,
    });
    // console.warn(printTree(tree, paddedScript, this.grammar.nodeNames));
    return tree;
  }

  populateBuiltins(program: SparkProgram) {
    program.context ??= {};
    const builtins = this._config.builtins;
    if (builtins) {
      for (const [type, builtinStructs] of Object.entries(builtins)) {
        for (const [name, builtinStruct] of Object.entries(builtinStructs)) {
          program.context[type] ??= {};
          program.context[type][name] ??= structuredClone(builtinStruct);
        }
      }
      if (program?.compiled?.structDefs) {
        for (const [type, structs] of Object.entries(
          program.compiled.structDefs
        )) {
          program.context[type] ??= {};
          for (const [name, definedStruct] of Object.entries(structs as any)) {
            if (Array.isArray(definedStruct)) {
              program.context[type][name] = definedStruct;
            } else {
              const isSpecialDefinition =
                name.startsWith("$") && name !== "$default";
              let constructed = {} as any;
              if (type === "config" || isSpecialDefinition) {
                constructed = program.context[type][name] ?? {};
              }
              if (!isSpecialDefinition) {
                const builtinDefaultStruct = builtins[type]?.["$default"];
                if (builtinDefaultStruct) {
                  for (const [propPath, propValue] of Object.entries(
                    getAllProperties(builtinDefaultStruct)
                  )) {
                    if (propValue !== undefined) {
                      setProperty(
                        constructed,
                        propPath,
                        JSON.parse(JSON.stringify(propValue))
                      );
                    }
                  }
                }
                const definedDefaultStruct = (structs as any)?.["$default"];
                if (definedDefaultStruct) {
                  for (const [propPath, propValue] of Object.entries(
                    getAllProperties(definedDefaultStruct)
                  )) {
                    if (propValue !== undefined) {
                      setProperty(
                        constructed,
                        propPath,
                        JSON.parse(JSON.stringify(propValue))
                      );
                    }
                  }
                }
              }
              for (const [propPath, propValue] of Object.entries(
                getAllProperties(definedStruct)
              )) {
                if (isSpecialDefinition) {
                  // TODO: If constructed value at propPath is defined, report error if propValue type isn't an array of a corresponding type
                } else {
                  // TODO: If constructed value at propPath is defined, report error if propValue type doesn't match
                }
                if (propValue !== undefined) {
                  setProperty(
                    constructed,
                    propPath,
                    JSON.parse(JSON.stringify(propValue))
                  );
                }
              }
              constructed["$type"] = type;
              constructed["$name"] = name;
              program.context[type][name] = constructed;
            }
          }
        }
      }
    }
  }

  populateAssets(program: SparkProgram) {
    if (program.compiled) {
      program.context ??= {};
      const files = this._config.files;
      if (files) {
        for (const [type, assets] of Object.entries(files)) {
          for (const [name, file] of Object.entries(assets)) {
            program.context[type] ??= {};
            program.context[type][name] ??= structuredClone(file);
            const definedFile = program.context[type][name];
            // Set $type and $name
            if (definedFile["$type"] === undefined) {
              definedFile["$type"] = type;
            }
            if (definedFile["$name"] === undefined) {
              definedFile["$name"] = name;
            }
            // Infer asset src if not defined
            if (definedFile["src"] === undefined) {
              definedFile["src"] = file["src"];
            }
            // Infer font settings if not defined
            if (type === "font") {
              if (definedFile["font_family"] === undefined) {
                definedFile["font_family"] = name.split("__")?.[0] || name;
              }
              if (definedFile["font_weight"] === undefined) {
                if (name.toLowerCase().includes("bold")) {
                  definedFile["font_weight"] = "700";
                }
              }
              if (definedFile["font_style"] === undefined) {
                if (name.toLowerCase().includes("italic")) {
                  definedFile["font_style"] = "italic";
                }
              }
            }
            // Process SVGs
            if (
              type === "image" &&
              definedFile["ext"] === "svg" &&
              definedFile["text"]
            ) {
              const text = definedFile["text"];
              if (typeof text === "string") {
                // Populate image data with text
                definedFile["data"] = text;
                delete definedFile["text"];
              }
            }
          }
        }
      }
    }
  }

  populateImplicitDefs(program: SparkProgram) {
    if (program.compiled) {
      const images = program.context?.["image"];
      if (images) {
        for (const image of Object.values(images)) {
          if (image["ext"] === "svg" || image["data"]) {
            const type = image["$type"];
            const name = image["$name"];
            // Declare implicit filtered_image
            // (so it only displays default layers by default)
            const implicitType = "filtered_image";
            program.implicitDefs ??= {};
            program.implicitDefs[implicitType] ??= {};
            program.implicitDefs[implicitType][name] ??= {
              $type: implicitType,
              $name: name,
              image: { $type: type, $name: name },
              filters: [],
            };
          }
        }
      }
      const implicitDefs = program.implicitDefs;
      if (implicitDefs) {
        for (const [type, objs] of Object.entries(implicitDefs)) {
          for (const [name, obj] of Object.entries(objs)) {
            program.context ??= {};
            program.context[type] ??= {};
            program.context[type][name] ??= structuredClone(obj);
          }
        }
      }
      const filteredImages = program.context?.["filtered_image"];
      if (filteredImages) {
        for (const filteredImage of Object.values(filteredImages)) {
          const filters = this.getNestedFilters(filteredImage.$name, program);
          const includes = filters.flatMap((filter) => filter?.includes || []);
          const excludes = filters.flatMap((filter) => filter?.excludes || []);
          const combinedFilter = {
            includes,
            excludes,
          };
          const stack = new Set<{ $type: string; $name: string }>();
          const imageToFilter = this.getRootImage(
            filteredImage?.image?.$name,
            program,
            stack
          );
          if (imageToFilter) {
            if (imageToFilter === "circular") {
              // TODO: lookup property definition location so we can display an error message there
              // const message = `The image named '${filteredImage?.image?.$name}' circularly references itself.`;
              // program.diagnostics ??= {};
              // program.diagnostics[uri] ??= [];
              // program.diagnostics[uri].push({
              //   range,
              //   severity: DiagnosticSeverity.Error,
              //   message,
              //   relatedInformation: [
              //     {
              //       location: { uri, range },
              //       message,
              //     },
              //   ],
              //   source: LANGUAGE_NAME,
              // });
            } else {
              if (
                imageToFilter.$type === "image" &&
                !imageToFilter.$name.startsWith("$")
              ) {
                if (imageToFilter.data) {
                  const filteredData = filterSVG(
                    imageToFilter.data,
                    combinedFilter
                  );
                  filteredImage.filtered_data = filteredData;
                  filteredImage.filtered_src = buildSVGSource(filteredData);
                }
              }
              if (
                imageToFilter.$type === "layered_image" &&
                !imageToFilter.$name.startsWith("$")
              ) {
                for (const [key, layerImage] of Object.entries(
                  imageToFilter.layers
                )) {
                  const filteredLayers: { $type: "image"; $name: string }[] =
                    [];
                  const keyIsArrayIndex = !Number.isNaN(Number(key));
                  if (keyIsArrayIndex) {
                    if (filterMatchesName(layerImage.$name, combinedFilter)) {
                      filteredLayers.push(layerImage);
                    }
                  } else {
                    if (filterMatchesName(key, combinedFilter)) {
                      filteredLayers.push(layerImage);
                    }
                  }
                  filteredImage.filtered_layers = filteredLayers;
                }
              }
            }
          }
        }
      }
    }
  }

  getNestedFilters(
    name: string,
    program: SparkProgram
  ): { includes: unknown[]; excludes: unknown[] }[] {
    const filteredImage = program.context?.["filtered_image"]?.[name];
    if (filteredImage) {
      const filters: { includes: unknown[]; excludes: unknown[] }[] =
        filteredImage?.["filters"]?.map?.(
          (reference: { $type: "filtered_image"; $name: string }) =>
            program.context?.["filter"]?.[reference?.$name]
        ) || [];
      const imageToFilterName = filteredImage?.["image"]?.["$name"];
      if (imageToFilterName !== name) {
        filters.push(...this.getNestedFilters(imageToFilterName, program));
      }
      return filters;
    }
    return [];
  }

  getRootImage(
    name: string,
    program: SparkProgram,
    stack: Set<{ $type: string; $name: string }>
  ):
    | { $type: "image"; $name: string; src: string; data: string }
    | {
        $type: "layered_image";
        $name: string;
        layers: Record<string, { $type: "image"; $name: string }>;
      }
    | "circular"
    | undefined {
    const image = program.context?.["image"]?.[name];
    if (image) {
      return image;
    }
    const layeredImage = program.context?.["layered_image"]?.[name];
    if (layeredImage) {
      return layeredImage;
    }
    const filteredImage = program.context?.["filtered_image"]?.[name];
    if (filteredImage) {
      if (stack.has(filteredImage)) {
        return "circular";
      }
      stack.add(filteredImage);
      return this.getRootImage(
        filteredImage?.["image"]?.["$name"],
        program,
        stack
      );
    }
    return undefined;
  }

  validateReferences(program: SparkProgram) {
    if (program.references && program.compiled) {
      for (const [uri, refsLines] of Object.entries(program.references)) {
        for (const [_line, refs] of Object.entries(refsLines)) {
          for (const ref of refs) {
            const types = ref.types;
            const selectors = ref.selectors;
            const fuzzy = ref.fuzzy;
            const range = ref.range;
            const description = ref.description;
            if (range) {
              if (selectors) {
                let foundStruct: any = undefined;
                for (const selector of selectors) {
                  const [obj, foundPath] = selectProperty(
                    program.context,
                    selector,
                    fuzzy
                  );
                  if (foundPath === selector) {
                    foundStruct = obj;
                    break;
                  }
                }
                if (foundStruct) {
                  if (
                    types &&
                    types.length > 0 &&
                    !types.includes(foundStruct.$type)
                  ) {
                    const message = `Type '${
                      foundStruct.$type
                    }' is not assignable to type ${formatList(types)}`;
                    program.diagnostics ??= {};
                    program.diagnostics[uri] ??= [];
                    program.diagnostics[uri].push({
                      range,
                      severity: DiagnosticSeverity.Warning,
                      message,
                      relatedInformation: [
                        {
                          location: { uri, range },
                          message,
                        },
                      ],
                      source: LANGUAGE_NAME,
                    });
                  }
                } else {
                  const message = `Cannot find ${description}`;
                  program.diagnostics ??= {};
                  program.diagnostics[uri] ??= [];
                  program.diagnostics[uri].push({
                    range,
                    severity: DiagnosticSeverity.Warning,
                    message,
                    relatedInformation: [
                      {
                        location: { uri, range },
                        message,
                      },
                    ],
                    source: LANGUAGE_NAME,
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  getDiagnostic(
    message: string,
    type: ErrorType,
    metadata?: SourceMetadata | null,
    program?: SparkProgram
  ): SparkDiagnostic | null {
    if (metadata && metadata.fileName) {
      const filePath = metadata?.filePath || "";
      const startLine = metadata.startLineNumber - 1;
      const endLine = metadata.endLineNumber - 1;
      const startOffset = program?.sourceMap?.[filePath]?.[startLine];
      const startOffsetAfter = startOffset?.after ?? 0;
      const startOffsetShift = startOffset?.shift ?? 0;
      const endOffset = program?.sourceMap?.[filePath]?.[endLine];
      const endOffsetAfter = endOffset?.after ?? 0;
      const endOffsetShift = endOffset?.shift ?? 0;
      const startCharacterOffset =
        metadata.startCharacterNumber - 1 > startOffsetAfter
          ? startOffsetShift
          : 0;
      const startCharacter =
        metadata.startCharacterNumber - 1 - startCharacterOffset;
      const endCharacterOffset =
        metadata.endCharacterNumber - 1 > endOffsetAfter ? endOffsetShift : 0;
      const endCharacter = metadata.endCharacterNumber - 1 - endCharacterOffset;
      if (startCharacter < 0) {
        // This error is occurring in a part of the script that was automatically added during transpilation
        // Assume it will be properly reported elsewhere and do not report it here.
        console.warn("HIDDEN", message, type, metadata);
        return null;
      }
      // Trim away redundant filename and line number from message
      const uri =
        this._config?.resolveFile?.(metadata.fileName) || metadata.fileName;
      const range = {
        start: {
          line: startLine,
          character: startCharacter,
        },
        end: {
          line: endLine,
          character: endCharacter,
        },
      };
      const severity =
        type === ErrorType.Error
          ? DiagnosticSeverity.Error
          : type === ErrorType.Warning
          ? DiagnosticSeverity.Warning
          : DiagnosticSeverity.Information;
      const source = LANGUAGE_NAME;
      const diagnostic = {
        range,
        severity,
        message,
        relatedInformation: [
          {
            location: { uri, range },
            message,
          },
        ],
        source,
      };
      return diagnostic;
    }
    console.warn("HIDDEN", message, type, metadata);
    return null;
  }

  sortSources<T extends number[]>(data: Record<string, T>): Record<string, T> {
    const compare = (a: [string, T], b: [string, T]) => {
      let i = 0;
      const [, aValue] = a;
      const [, bValue] = b;
      let l = Math.min(aValue.length, bValue.length);
      while (i < l && aValue[i] === bValue[i]) {
        i++;
      }
      if (i === l) {
        return aValue.length - bValue.length;
      }
      return (aValue[i] ?? 0) - (bValue[i] ?? 0);
    };
    const sortedEntries = Object.entries(data).sort(compare);
    const sorted: Record<string, T> = {};
    sortedEntries.forEach(function ([key, value]) {
      sorted[key] = value;
    });
    return sorted;
  }
}

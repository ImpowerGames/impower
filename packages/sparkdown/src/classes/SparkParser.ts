import {
  Compiler as GrammarCompiler,
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

const LANGUAGE_NAME = GRAMMAR_DEFINITION.name.toLowerCase();

const NEWLINE_REGEX: RegExp = /\r\n|\r|\n/;

const UUID_MARKER_REGEX = new RegExp(GRAMMAR_DEFINITION.repository.UUID.match);

export default class SparkParser {
  protected _config: SparkParserConfig = {};

  protected _grammar: Grammar;

  protected _grammarCompiler: GrammarCompiler;

  protected _trees = new Map<string, Tree>();
  get trees() {
    return this._trees;
  }

  constructor(config: SparkParserConfig) {
    this._config = config || this._config;
    this._grammar = new Grammar(GRAMMAR_DEFINITION);
    this._grammarCompiler = new GrammarCompiler(this._grammar);
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
    let prevNodeType = "";
    let blockDialoguePrefix = "";
    let structType = "";
    let propertyName = "";
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
    tree.iterate({
      enter: (node) => {
        const nodeType = nodeNames[node.type]! as SparkdownNodeName;
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
        const text = lineText.slice(transpiledNodeStart, transpiledNodeEnd);
        const range = {
          start: {
            line: lineIndex,
            character: sourceNodeStart,
          },
          end: {
            line: lineIndex,
            character: sourceNodeEnd,
          },
        };

        // Annotate dialogue line with implicit flow marker
        if (nodeType === "BlockDialogue_begin") {
          const lineTextBefore = lineText.slice(0, transpiledNodeEnd);
          const lineTextAfter = lineText.slice(transpiledNodeEnd);
          const id = generateID();
          const flowMarker = getFlowMarker(id);
          const markup = ": " + flowMarker + "\\";
          lines[lineIndex] = lineTextBefore + markup + lineTextAfter;
          program.sourceMap ??= {};
          program.sourceMap[uri]![lineIndex] = {
            after: lineTextBefore.length,
            shift: markup.length,
          };
          program.uuidToSource ??= {};
          program.uuidToSource[id] = [fileIndex, lineIndex];
          blockDialoguePrefix = lineTextBefore;
        }
        // Annotate dialogue line with implicit character name and flow marker
        if (
          nodeType === "BlockDialogueLineContinue" ||
          nodeType === "BlockDialogueLineBreak"
        ) {
          if (prevNodeType.startsWith("BlockDialogueLineBreak")) {
            const lineTextBefore = lineText.slice(0, transpiledNodeStart);
            const lineTextAfter = lineText.slice(transpiledNodeStart);
            const prefix = blockDialoguePrefix + ": ";
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
        if (
          nodeType === "TypeName" &&
          stack.includes("DefineDeclaration_begin")
        ) {
          structType = text;
        }
        if (
          nodeType === "VariableName" &&
          stack.includes("DefineDeclaration_begin")
        ) {
          // Check if style name matches an existing ui element
          if (structType === "style") {
            const selectors = [`ui..${text}`];
            const fuzzy = true;
            const description = `ui element named '${text}'`;
            program.references ??= {};
            program.references[uri] ??= {};
            program.references[uri][lineIndex] ??= [];
            program.references[uri][lineIndex]!.push({
              fuzzy,
              selectors,
              range,
              description,
            });
          }
        }
        if (
          nodeType === "DeclarationScalarPropertyName" ||
          nodeType === "DeclarationObjectPropertyName"
        ) {
          propertyName = text;
        }
        // Record reference in struct field value
        if (nodeType === "AccessPath" && stack.at(-1) === "StructFieldValue") {
          const selectors = [text];
          let [type, name] = text.split(".");
          let description = `${type} named '${name}'`;
          if (type && !name) {
            name = type;
            // Infer type
            if (
              propertyName.split("_").includes("image") ||
              (structType === "layered_image" && propertyName === "assets")
            ) {
              selectors.push(
                `layered_image.${name}`,
                `image.${name}`,
                `graphic.${name}`
              );
              description = `image named '${name}'`;
            } else if (
              propertyName.split("_").includes("audio") ||
              (structType === "layered_audio" && propertyName === "assets")
            ) {
              selectors.push(`audio.${name}`, `synth.${name}`);
              description = `audio named '${name}'`;
            } else if (
              propertyName.split("_").includes("animation") ||
              structType === "transition"
            ) {
              selectors.push(`animation.${name}`);
              description = `animation named '${name}'`;
            } else if (propertyName.split("_").includes("font")) {
              selectors.push(`font.${name}`);
              description = `font named '${name}'`;
            } else {
              description = `'${name}'`;
            }
          }
          program.references ??= {};
          program.references[uri] ??= {};
          program.references[uri][lineIndex] ??= [];
          program.references[uri][lineIndex]!.push({
            selectors,
            range,
            description,
          });
        }
        // Record image target reference
        if (
          stack.includes("ImageCommand") &&
          nodeType === "AssetCommandTarget"
        ) {
          const selectors = [`ui..${text}`];
          const description = `ui element named '${text}'`;
          program.references ??= {};
          program.references[uri] ??= {};
          program.references[uri][lineIndex] ??= [];
          program.references[uri][lineIndex]!.push({
            selectors,
            range,
            description,
          });
        }
        // Record audio target reference
        if (
          stack.includes("AudioCommand") &&
          nodeType === "AssetCommandTarget"
        ) {
          const selectors = [`channel.${text}`];
          const description = `channel named '${text}'`;
          program.references ??= {};
          program.references[uri] ??= {};
          program.references[uri][lineIndex] ??= [];
          program.references[uri][lineIndex]!.push({
            selectors,
            range,
            description,
          });
        }
        // Record image name or filter reference
        if (stack.includes("ImageCommand") && nodeType === "AssetCommandName") {
          const prevChar = lineText[transpiledNodeStart - 1];
          const selectors =
            prevChar === "~"
              ? [`layer_filter.${text}`]
              : [`layered_image.${text}`, `image.${text}`, `graphic.${text}`];
          const description =
            prevChar === "~"
              ? `layer_filter named '${text}'`
              : `image named '${text}'`;
          program.references ??= {};
          program.references[uri] ??= {};
          program.references[uri][lineIndex] ??= [];
          program.references[uri][lineIndex]!.push({
            selectors,
            range,
            description,
          });
        }
        // Record audio name or filter reference
        if (stack.includes("AudioCommand") && nodeType === "AssetCommandName") {
          const prevChar = lineText[transpiledNodeStart - 1];
          const selectors =
            prevChar === "~"
              ? [`audio_filter.${text}`]
              : [`layered_audio.${text}`, `audio.${text}`, `synth.${text}`];
          const description =
            prevChar === "~"
              ? `audio_filter named '${text}'`
              : `audio named '${text}'`;
          program.references ??= {};
          program.references[uri] ??= {};
          program.references[uri][lineIndex] ??= [];
          program.references[uri][lineIndex]!.push({
            selectors,
            range,
            description,
          });
        }
        // Report invalid image control
        if (
          stack.includes("ImageCommand") &&
          nodeType === "AssetCommandControl" &&
          text !== "set" &&
          text !== "show" &&
          text !== "hide" &&
          text !== "animate"
        ) {
          const severity = DiagnosticSeverity.Error;
          const message =
            "Invalid visual control: Visual commands only support 'set', 'show', 'hide', or 'animate'";
          program.diagnostics ??= {};
          program.diagnostics[uri] ??= [];
          program.diagnostics[uri].push({
            range,
            severity,
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
        // Report invalid audio control
        if (
          stack.includes("AudioCommand") &&
          nodeType === "AssetCommandControl" &&
          text !== "start" &&
          text !== "stop" &&
          text !== "play" &&
          text !== "modulate"
        ) {
          const severity = DiagnosticSeverity.Error;
          const message =
            "Invalid audio control: Audio commands only support 'play', 'start', 'stop', or 'modulate'";
          program.diagnostics ??= {};
          program.diagnostics[uri] ??= [];
          program.diagnostics[uri].push({
            range,
            severity,
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
        if (
          stack.includes("ImageCommand") &&
          nodeType === "InvalidValue" &&
          stack.at(-1) === "AssetCommandClauses"
        ) {
          const severity = DiagnosticSeverity.Error;
          const message =
            "Invalid visual clause: Visual commands only support 'after', 'over', 'with', 'wait', or 'nowait'";
          program.diagnostics ??= {};
          program.diagnostics[uri] ??= [];
          program.diagnostics[uri].push({
            range,
            severity,
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
        if (
          stack.includes("AudioCommand") &&
          nodeType === "InvalidValue" &&
          stack.at(-1) === "AssetCommandClauses"
        ) {
          const severity = DiagnosticSeverity.Error;
          const message =
            "Invalid audio clause: Audio commands only support 'after', 'over', 'fadeto', 'loop', 'noloop', 'mute', 'unmute', or 'now'";
          program.diagnostics ??= {};
          program.diagnostics[uri] ??= [];
          program.diagnostics[uri].push({
            range,
            severity,
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
        if (
          stack.includes("AssetCommandAfterClause") &&
          nodeType === "InvalidValue"
        ) {
          const severity = DiagnosticSeverity.Error;
          const message =
            "'after' must be followed by a time value (e.g. 'after 2' or 'after 2s' or 'after 200ms')";
          program.diagnostics ??= {};
          program.diagnostics[uri] ??= [];
          program.diagnostics[uri].push({
            range,
            severity,
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
        if (
          stack.includes("AssetCommandOverClause") &&
          nodeType === "InvalidValue"
        ) {
          const severity = DiagnosticSeverity.Error;
          const message =
            "'over' must be followed by a time value (e.g. 'over 2' or 'over 2s' or 'over 200ms')";
          program.diagnostics ??= {};
          program.diagnostics[uri] ??= [];
          program.diagnostics[uri].push({
            range,
            severity,
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
        if (
          stack.includes("AssetCommandFadetoClause") &&
          (nodeType === "InvalidValue" ||
            (nodeType === "NumberValue" &&
              (Number(text) < 0 || Number(text) > 1)))
        ) {
          const severity = DiagnosticSeverity.Error;
          const message =
            "'fadeto' must be followed by a number between 0 and 1 (e.g. 'fadeto 0' or 'fadeto 0.5' or 'fadeto 1')";
          program.diagnostics ??= {};
          program.diagnostics[uri] ??= [];
          program.diagnostics[uri].push({
            range,
            severity,
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
        if (
          stack.includes("ImageCommand") &&
          stack.includes("AssetCommandWithClause") &&
          nodeType === "InvalidValue"
        ) {
          const severity = DiagnosticSeverity.Error;
          const message =
            "'with' must be followed by the name of a transition or animation (e.g. 'with shake')";
          program.diagnostics ??= {};
          program.diagnostics[uri] ??= [];
          program.diagnostics[uri].push({
            range,
            severity,
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
        if (
          stack.includes("ImageCommand") &&
          stack.includes("AssetCommandWithClause") &&
          nodeType === "NameValue"
        ) {
          const selectors = [`transition.${text}`, `animation.${text}`];
          const description = `transition or animation named '${text}'`;
          program.references ??= {};
          program.references[uri] ??= {};
          program.references[uri][lineIndex] ??= [];
          program.references[uri][lineIndex]!.push({
            selectors,
            range,
            description,
          });
        }
        if (
          stack.includes("AudioCommand") &&
          stack.includes("AssetCommandWithClause") &&
          nodeType === "InvalidValue"
        ) {
          const severity = DiagnosticSeverity.Error;
          const message =
            "'with' must be followed by the name of a modulation (e.g. 'with echo')";
          program.diagnostics ??= {};
          program.diagnostics[uri] ??= [];
          program.diagnostics[uri].push({
            range,
            severity,
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
        if (
          stack.includes("AudioCommand") &&
          stack.includes("AssetCommandWithClause") &&
          nodeType === "NameValue"
        ) {
          const selectors = [`modulation.${text}`];
          const description = `modulation named '${text}'`;
          program.references ??= {};
          program.references[uri] ??= {};
          program.references[uri][lineIndex] ??= [];
          program.references[uri][lineIndex]!.push({
            selectors,
            range,
            description,
          });
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
        const nodeType = nodeNames[node.type]! as SparkdownNodeName;
        const transpilationOffset = program.sourceMap?.[uri]?.[lineIndex];
        const after = transpilationOffset?.after ?? 0;
        const shift = transpilationOffset?.shift ?? 0;
        const nodeEndCharacter = node.to - linePos;
        const nodeEnd =
          nodeEndCharacter > after
            ? shift + nodeEndCharacter
            : nodeEndCharacter;
        if (nodeType === "BlockDialogue_end") {
          blockDialoguePrefix = "";
        }
        if (nodeType === "BlockDialogueLineContinue") {
          const lineText = lines[lineIndex] || "";
          const lineTextBefore = lineText.slice(0, nodeEnd);
          const lineTextAfter = lineText.slice(nodeEnd);
          if (
            !lineTextBefore.trim().endsWith("\\") &&
            !lineTextAfter.trim().startsWith("\\")
          ) {
            // Dialogue lines should end with implicit \
            // (So they are grouped together with following text line)
            const suffix = ` \\`;
            const markup = suffix;
            lines[lineIndex] = lineTextBefore + markup + lineTextAfter;
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
    const transpiled = lines.join("\n");
    // console.log(printTree(tree, script, nodeNames));
    // console.log(transpiled);
    return transpiled;
  }

  parse(filename: string): SparkProgram {
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
          transpiledScript = this.transpile(uri, program)?.trimEnd();
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
      this.validateReferences(program);
      program.uuidToSource ??= {};
      program.uuidToSource = this.sortSources(program.uuidToSource);
    } catch {}
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
    console.log("program", program);
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
    });
    // console.warn(printTree(tree, paddedScript, this.grammar.nodeNames));
    return tree;
  }

  populateBuiltins(program: SparkProgram) {
    if (program.compiled) {
      program.compiled.structDefs ??= {};
      const builtins = this._config.builtins;
      if (builtins) {
        for (const [type, objs] of Object.entries(builtins)) {
          for (const [name, obj] of Object.entries(objs)) {
            program.compiled.structDefs[type] ??= {};
            program.compiled.structDefs[type][name] ??= structuredClone(obj);
          }
        }
      }
    }
  }

  populateAssets(program: SparkProgram) {
    if (program.compiled) {
      program.compiled.structDefs ??= {};
      const files = this._config.files;
      if (files) {
        for (const [type, assets] of Object.entries(files)) {
          for (const [name, file] of Object.entries(assets)) {
            program.compiled.structDefs[type] ??= {};
            program.compiled.structDefs[type][name] ??= structuredClone(file);
            const definedFile = program.compiled.structDefs[type][name];
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
          }
        }
      }
    }
  }

  validateReferences(program: SparkProgram) {
    if (program.references && program.compiled) {
      for (const [uri, refsLines] of Object.entries(program.references)) {
        for (const [_line, refs] of Object.entries(refsLines)) {
          for (const ref of refs) {
            const selectors = ref.selectors;
            const fuzzy = ref.fuzzy;
            const range = ref.range;
            const description = ref.description;
            const struct = selectors.find((s) => {
              const [, foundPath] = selectProperty(
                program.compiled?.structDefs,
                s,
                fuzzy
              );
              return foundPath === s;
            });
            if (!struct) {
              const severity = DiagnosticSeverity.Warning;
              const message = `Cannot find ${description}`;
              program.diagnostics ??= {};
              program.diagnostics[uri] ??= [];
              program.diagnostics[uri].push({
                range,
                severity,
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

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
import {
  DiagnosticSeverity,
  Range,
  SparkDiagnostic,
} from "../types/SparkDiagnostic";
import { SparkParserConfig } from "../types/SparkParserConfig";
import { SparkProgram } from "../types/SparkProgram";
import { SparkdownNodeName } from "../types/SparkdownNodeName";

const NEWLINE_REGEX: RegExp = /\r\n|\r|\n/;

const SOURCE_REGEX: RegExp = /[+](.*?)[+]/g;

export default class SparkParser {
  protected _config: SparkParserConfig = {};

  protected _grammar: Grammar;

  protected _grammarCompiler: GrammarCompiler;

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

  transpile(
    script: string,
    filepath: string,
    sourceMap?: Record<string, Record<number, [number, number]>>
  ): string {
    const nodeNames = this._grammar.nodeNames;
    const lines = script.split(NEWLINE_REGEX);
    // Pad script so we ensure all scopes are properly closed before the end of the file.
    const paddedScript = script + "\n\n";
    const tree = this.buildTree(paddedScript);
    sourceMap ??= {};
    sourceMap[filepath] ??= [];
    const fileIndex = Object.keys(sourceMap).indexOf(filepath);
    let lineIndex = 0;
    let linePos = 0;
    let prevId = "";
    let prevDialogueLineWasLineEnd = false;
    let inBlockDialogue = false;
    let inConditionalBlock = false;
    let blockDialoguePrefix = "";
    tree.iterate({
      enter: (node) => {
        const id = nodeNames[node.type]! as SparkdownNodeName;
        if (id === "BlockDialogue_begin") {
          inBlockDialogue = true;
        }
        if (id === "ConditionalBlock_begin") {
          inConditionalBlock = true;
        }
      },
      leave: (node) => {
        const id = nodeNames[node.type]! as SparkdownNodeName;
        const source = `+${fileIndex};${lineIndex}+ `;
        const [offsetAfter, offset] = sourceMap?.[filepath]?.[lineIndex] ?? [
          0, 0,
        ];
        const nodeStartCharacter = node.from - linePos;
        const nodeStart =
          nodeStartCharacter > offsetAfter
            ? offset + nodeStartCharacter
            : nodeStartCharacter;
        const nodeEndCharacter = node.to - linePos;
        const nodeEnd =
          nodeEndCharacter > offsetAfter
            ? offset + nodeEndCharacter
            : nodeEndCharacter;
        if (id === "BlockDialogue_end") {
          inBlockDialogue = false;
          prevDialogueLineWasLineEnd = false;
          blockDialoguePrefix = "";
        }
        if (id === "ConditionalBlock_end") {
          inConditionalBlock = false;
        }
        if (id === "BlockDialogue_begin") {
          const lineText = lines[lineIndex] || "";
          const lineTextBefore = lineText.slice(0, nodeEnd);
          const lineTextAfter = lineText.slice(nodeEnd);
          const markup = ": " + source + "\\";
          lines[lineIndex] = lineTextBefore + markup + lineTextAfter;
          if (sourceMap) {
            sourceMap[filepath]![lineIndex] = [
              lineTextBefore.length,
              markup.length,
            ];
          }
          blockDialoguePrefix = lineTextBefore;
        }
        if (id === "AssetLine" || id === "ParentheticalLineContent") {
          if (inBlockDialogue) {
            const lineText = lines[lineIndex] || "";
            const lineTextBefore = lineText.slice(0, nodeEnd);
            const lineTextAfter = lineText.slice(nodeEnd);
            // AssetLine and ParentheticalLine should end with implicit \
            // (So they are grouped together with following text line)
            const suffix = ` \\`;
            const markup = suffix;
            lines[lineIndex] = lineTextBefore + markup + lineTextAfter;
          }
        }
        if (id === "BlockDialogueLine_end") {
          prevDialogueLineWasLineEnd = prevId === "LineEnd";
        }
        if (id === "BlockDialogueLine_begin") {
          if (prevDialogueLineWasLineEnd) {
            const lineText = lines[lineIndex] || "";
            const lineTextBefore = lineText.slice(0, nodeStart);
            const lineTextAfter = lineText.slice(nodeStart);
            const prefix = blockDialoguePrefix + ": ";
            const markup = prefix + source;
            lines[lineIndex] = lineTextBefore + markup + lineTextAfter;
            if (sourceMap) {
              sourceMap[filepath]![lineIndex] = [
                lineTextBefore.length,
                markup.length,
              ];
            }
          }
        }
        if (
          id === "InlineDialogue_begin" ||
          id === "Transition_begin" ||
          id === "Scene_begin" ||
          id === "Action_begin"
        ) {
          const lineText = lines[lineIndex] || "";
          const lineTextBefore = lineText.slice(0, nodeEnd);
          const lineTextAfter = lineText.slice(nodeEnd);
          if (!lineTextAfter.startsWith("+")) {
            const markup = source;
            lines[lineIndex] = lineTextBefore + markup + lineTextAfter;
            if (sourceMap) {
              sourceMap[filepath]![lineIndex] = [
                lineTextBefore.length,
                markup.length,
              ];
            }
          }
        }
        if (id === "Newline") {
          lineIndex += 1;
          linePos = node.to;
        }
        prevId = id;
      },
    });
    const transpiled = lines.join("\n");
    // console.log(printTree(tree, script, nodeNames));
    console.log(transpiled);
    return transpiled;
  }

  parse(script: string, filename: string = "main.script"): SparkProgram {
    const program: SparkProgram = {};

    program.sourceMap ??= {};
    const transpiledScript = this.transpile(
      script,
      this._config?.resolveFile?.(filename) || "",
      program.sourceMap
    );

    const options = new InkCompilerOptions(
      filename,
      [],
      false,
      (message: string) => {
        console.error(message);
      },
      {
        ResolveInkFilename: (filename: string): string => {
          return this._config?.resolveFile?.(filename) || filename;
        },
        LoadInkFileContents: (filepath: string): string => {
          program.sourceMap ??= {};
          return this.transpile(
            this._config?.readFile?.(filepath) || "",
            filepath,
            program.sourceMap
          );
        },
      },
      {
        WriteRuntimeObject: (_, obj) => {
          if (obj instanceof StringValue) {
            if (!obj.isNewline && obj.value) {
              const sourceMarkers = obj.value.match(SOURCE_REGEX);
              if (sourceMarkers) {
                const path = obj.path.toString();
                for (const m of sourceMarkers) {
                  const source = m.slice(1, -1);
                  program.pathToSource ??= {};
                  program.pathToSource[path] ??= source;
                  program.sourceToPath ??= {};
                  program.sourceToPath[source] ??= path;
                }
              }
            }
          }
          return false;
        },
      }
    );
    const inkCompiler = new InkCompiler(transpiledScript, options);
    try {
      const compiledJSON = inkCompiler.Compile().ToJson();
      const compiled = compiledJSON ? JSON.parse(compiledJSON) : null;
      for (const filepath of inkCompiler.parser.parsedFiles) {
        program.sourceMap ??= {};
        program.sourceMap[filepath] ??= [];
      }
      if (compiled) {
        this.populateAssets(compiled);
        program.compiled = compiled;
      }
      program.sourceToPath ??= {};
      program.sourceToPath = this.sortPaths(
        Object.keys(program.sourceToPath || {}),
        ";"
      ).reduce((obj, key) => {
        obj[key] = program.sourceToPath![key]!;
        return obj;
      }, {} as Record<string, string>);
    } catch {}
    for (const error of inkCompiler.errors) {
      program.diagnostics ??= [];
      const diagnostic = this.getDiagnostic(
        error.message,
        ErrorType.Error,
        error.source,
        program.sourceMap
      );
      if (diagnostic) {
        program.diagnostics.push(diagnostic);
      }
    }
    for (const warning of inkCompiler.warnings) {
      program.diagnostics ??= [];
      const diagnostic = this.getDiagnostic(
        warning.message,
        ErrorType.Warning,
        warning.source,
        program.sourceMap
      );
      if (diagnostic) {
        program.diagnostics.push(diagnostic);
      }
    }
    for (const info of inkCompiler.infos) {
      program.diagnostics ??= [];
      const diagnostic = this.getDiagnostic(
        info.message,
        ErrorType.Info,
        info.source,
        program.sourceMap
      );
      if (diagnostic) {
        program.diagnostics.push(diagnostic);
      }
    }
    program.diagnostics?.forEach((d) =>
      this.clampDiagnostic(
        d,
        inkCompiler.parser.lineIndex,
        inkCompiler.parser.characterInLineIndex
      )
    );
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

  populateAssets(compiled: { structDefs?: any }) {
    if (compiled) {
      compiled.structDefs ??= {};
      const files = this._config.files;
      if (files) {
        for (const [type, assets] of Object.entries(files)) {
          for (const [name, file] of Object.entries(assets)) {
            compiled.structDefs[type] ??= {};
            compiled.structDefs[type][name] ??= {};
            const definedFile = compiled.structDefs[type][name];
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

  getDiagnostic(
    msg: string,
    type: ErrorType,
    metadata?: SourceMetadata | null,
    sourceMap?: Record<string, Record<number, [number, number]>>
  ): SparkDiagnostic | null {
    if (metadata && metadata.fileName) {
      const filePath = metadata?.filePath || "";
      const startLine = metadata.startLineNumber - 1;
      const endLine = metadata.endLineNumber - 1;
      const [startOffsetAfter, startOffset] = sourceMap?.[filePath]?.[
        startLine
      ] ?? [0, 0];
      const [endOffsetAfter, endOffset] = sourceMap?.[filePath]?.[endLine] ?? [
        0, 0,
      ];
      const startCharacterOffset =
        metadata.startCharacterNumber - 1 > startOffsetAfter ? startOffset : 0;
      const startCharacter =
        metadata.startCharacterNumber - 1 - startCharacterOffset;
      const endCharacterOffset =
        metadata.endCharacterNumber - 1 > endOffsetAfter ? endOffset : 0;
      const endCharacter = metadata.endCharacterNumber - 1 - endCharacterOffset;
      if (startCharacter < 0) {
        // This error is occurring in a part of the script that was automatically added during transpilation
        // Assume it will be properly reported elsewhere and do not report it here.
        return null;
      }
      // Trim away redundant filename and line number from message
      const message = msg.split(":").slice(2).join(":").trim() || msg;
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
      const source = "sparkdown";
      const diagnostic = {
        range,
        severity,
        message,
        relatedInformation: [
          {
            location: {
              uri,
              range,
            },
            message,
          },
        ],
        source,
      };
      return diagnostic;
    }
    return null;
  }

  clampRange(
    range: Range,
    lastLineIndex: number,
    lastCharacterInLineIndex: number
  ) {
    if (lastLineIndex < range.end.line) {
      range.end.line = lastLineIndex;
      range.end.character = lastCharacterInLineIndex;
    }
  }

  clampDiagnostic(
    diagnostic: SparkDiagnostic,
    lastLineIndex: number,
    lastCharacterInLineIndex: number
  ) {
    this.clampRange(diagnostic.range, lastLineIndex, lastCharacterInLineIndex);
    diagnostic.relatedInformation?.forEach((info) => {
      this.clampRange(
        info.location.range,
        lastLineIndex,
        lastCharacterInLineIndex
      );
    });
  }

  sortPaths(data: string[], delimiter: string): string[] {
    const compare = (
      a: { index: number; value: number[] },
      b: { index: number; value: number[] }
    ) => {
      let i = 0;
      let l = Math.min(a.value.length, b.value.length);
      while (i < l && a.value[i] === b.value[i]) {
        i++;
      }
      if (i === l) {
        return a.value.length - b.value.length;
      }
      return (a.value[i] ?? 0) - (b.value[i] ?? 0);
    };
    let mapped = data.map(function (el, i) {
      return {
        index: i,
        value: el.split(delimiter).map((p) => Number(p ?? 0)),
      };
    });
    mapped.sort(compare);
    return mapped.map(function (el) {
      return data[el.index]!;
    });
  }
}

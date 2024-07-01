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
import {
  DiagnosticSeverity,
  Range,
  SparkDiagnostic,
} from "../types/SparkDiagnostic";
import { SparkParserConfig } from "../types/SparkParserConfig";
import { SparkProgram } from "../types/SparkProgram";
import { SparkdownNodeName } from "../types/SparkdownNodeName";

const NEWLINE_REGEX: RegExp = /\r\n|\r|\n/;

export default class SparkParser {
  protected _config: SparkParserConfig = {};

  protected _grammar: Grammar;

  protected _grammarCompiler: GrammarCompiler;

  protected _latestKnot?: string;

  protected _latestStitch?: string;

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
    sourceMap: Record<string, string[]>
  ): string {
    const nodeNames = this._grammar.nodeNames;
    const lines = script.split(NEWLINE_REGEX);
    const tree = this.buildTree(script);
    let lineIndex = 0;
    let linePos = 0;
    tree.iterate({
      enter: (node) => {
        const id = nodeNames[node.type]! as SparkdownNodeName;
        if (id === "KnotDeclarationName" || id === "FunctionDeclarationName") {
          this._latestKnot = script.slice(node.from, node.to).trim();
          this._latestStitch = undefined;
        }
        if (id === "StitchDeclarationName") {
          this._latestStitch = script.slice(node.from, node.to).trim();
        }
        if (id === "AssetLineContent" || id === "ParentheticalContent") {
          const lineText = lines[lineIndex] || "";
          const lineTextBefore = lineText.slice(0, node.to - linePos + 1);
          const lineTextAfter = lineText.slice(node.to - linePos + 1);
          const trimmedLineTextBefore = lineTextBefore.trimEnd();
          const trimmedLineTextAfter = lineTextAfter.trimStart();
          if (
            !trimmedLineTextBefore.endsWith("\\") &&
            !trimmedLineTextAfter.startsWith("\\")
          ) {
            // AssetLine and ParentheticalLine should end with implicit \
            const augmentedLine =
              trimmedLineTextBefore + "\\ " + trimmedLineTextAfter;
            lines[lineIndex] = augmentedLine.trimEnd();
          }
        }
        if (id === "Newline") {
          lineIndex += 1;
          linePos = node.to;

          let closestPath = "";
          if (this._latestKnot && this._latestStitch) {
            closestPath = this._latestKnot + "." + this._latestStitch;
          }
          if (this._latestKnot && !this._latestStitch) {
            closestPath = this._latestKnot;
          }
          if (!this._latestKnot && this._latestStitch) {
            closestPath = this._latestStitch;
          }
          sourceMap[filepath] ??= [];
          sourceMap[filepath]![lineIndex] = closestPath;
        }
      },
    });
    const transpiled = lines.join("\n");
    // console.log(transpiled);
    // console.log(printTree(tree, script, nodeNames));
    return transpiled;
  }

  parse(script: string, filename: string = "main.script"): SparkProgram {
    const program: SparkProgram = {};

    this._latestKnot = undefined;
    this._latestStitch = undefined;
    program.sourceMap ??= {};
    const transpiledScript = this.transpile(
      script,
      this._config?.resolveFile?.(filename) || "",
      program.sourceMap
    );

    const options = new InkCompilerOptions(filename, [], false, null, {
      ResolveInkFilename: (filename: string): string => {
        return this._config?.resolveFile?.(filename) || filename;
      },
      LoadInkFileContents: (filepath: string): string => {
        this._latestKnot = undefined;
        this._latestStitch = undefined;
        program.sourceMap ??= {};
        return this.transpile(
          this._config?.readFile?.(filepath) || "",
          filepath,
          program.sourceMap
        );
      },
    });
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
    } catch {}
    for (const error of inkCompiler.errors) {
      program.diagnostics ??= [];
      const diagnostic = this.getDiagnostic(
        error.message,
        ErrorType.Error,
        error.source
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
        warning.source
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
        info.source
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
    metadata?: SourceMetadata | null
  ): SparkDiagnostic | null {
    if (metadata && metadata.fileName) {
      // Trim away redundant filename and line number from message
      const message = msg.split(":").slice(2).join(":").trim() || msg;
      const uri =
        this._config?.resolveFile?.(metadata.fileName) || metadata.fileName;
      const range = {
        start: {
          line: metadata.startLineNumber - 1,
          character: metadata.startCharacterNumber - 1,
        },
        end: {
          line: metadata.endLineNumber - 1,
          character: metadata.endCharacterNumber - 1,
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
}

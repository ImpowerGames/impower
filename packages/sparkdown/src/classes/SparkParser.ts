import { Compiler, CompilerOptions } from "../inkjs/compiler/Compiler";
import { ErrorType } from "../inkjs/compiler/Parser/ErrorType";
import { SourceMetadata } from "../inkjs/engine/Error";
import {
  DiagnosticSeverity,
  Range,
  SparkDiagnostic,
} from "../types/SparkDiagnostic";
import { SparkParserConfig } from "../types/SparkParserConfig";
import { SparkProgram } from "../types/SparkProgram";

export default class SparkParser {
  protected _config: SparkParserConfig = {};

  constructor(config: SparkParserConfig) {
    this._config = config || this._config;
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

  parse(script: string, filename?: string): SparkProgram {
    const program: SparkProgram = {};
    const options = new CompilerOptions(
      filename || "main.script",
      [],
      false,
      (msg, type, metadata) => {
        program.diagnostics ??= [];
        const diagnostic = this.getDiagnostic(msg, type, metadata);
        if (diagnostic) {
          program.diagnostics.push(diagnostic);
        }
      },
      {
        ResolveInkFilename: (filename: string): string => {
          return this._config?.resolveFile?.(filename) || filename;
        },
        LoadInkFileContents: (filename: string): string => {
          return this._config?.readFile?.(filename) || "";
        },
      }
    );
    try {
      const compiler = new Compiler(script, options);
      const compiledJSON = compiler.Compile().ToJson();
      const compiled = compiledJSON ? JSON.parse(compiledJSON) : null;
      for (const filepath of compiler.parser.parsedFiles) {
        program.sourceMap ??= {};
        program.sourceMap[filepath] = [];
      }
      if (compiled) {
        this.populateAssets(compiled);
        program.compiled = compiled;
      }
      program.diagnostics?.forEach((d) =>
        this.clampDiagnostic(
          d,
          compiler.parser.lineIndex,
          compiler.parser.characterInLineIndex
        )
      );
    } catch (e) {
      console.error(e);
    }
    return program;
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

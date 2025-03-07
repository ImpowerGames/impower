import GRAMMAR_DEFINITION from "../../language/sparkdown.language-grammar.json";
import {
  Compiler as InkCompiler,
  CompilerOptions as InkCompilerOptions,
} from "../inkjs/compiler/Compiler";
import { ErrorType } from "../inkjs/compiler/Parser/ErrorType";
import { SourceMetadata } from "../inkjs/engine/Error";
import { SimpleJson } from "../inkjs/engine/SimpleJson";
import { StringValue } from "../inkjs/engine/Value";
import { File } from "../types/File";
import { SparkDeclaration } from "../types/SparkDeclaration";
import { DiagnosticSeverity, SparkDiagnostic } from "../types/SparkDiagnostic";
import { SparkdownCompilerConfig } from "../types/SparkdownCompilerConfig";
import { SparkdownCompilerState } from "../types/SparkdownCompilerState";
import { SparkdownRuntimeFormat } from "../types/SparkdownRuntimeFormat";
import { SparkProgram } from "../types/SparkProgram";
import { formatList } from "../utils/formatList";
import { getExpectedSelectorTypes } from "../utils/getExpectedSelectorTypes";
import { getProperty } from "../utils/getProperty";
import { profile } from "../utils/profile";
import { resolveFileUsingImpliedExtension } from "../utils/resolveFileUsingImpliedExtension";
import { resolveSelector } from "../utils/resolveSelector";
import { setProperty } from "../utils/setProperty";
import { traverse } from "../utils/traverse";
import {
  SparkdownDocumentContentChangeEvent,
  SparkdownDocumentRegistry,
} from "./SparkdownDocumentRegistry";
import { SparkdownFileRegistry } from "./SparkdownFileRegistry";

const LANGUAGE_NAME = GRAMMAR_DEFINITION.name.toLowerCase();
const NEWLINE_REGEX: RegExp = /\r\n|\r|\n/;
const UUID_MARKER_REGEX = new RegExp(GRAMMAR_DEFINITION.repository.UUID.match);
const FILE_TYPES = GRAMMAR_DEFINITION.fileTypes;

export class SparkdownCompiler {
  protected _config: SparkdownCompilerConfig = {};

  protected _documents = new SparkdownDocumentRegistry("compiler", [
    "characters",
    "scenes",
    "transitions",
    "colors",
    "declarations",
    "formatting",
    "links",
    "semantics",
  ]);
  get documents() {
    return this._documents;
  }

  protected _files = new SparkdownFileRegistry();
  get files() {
    return this._files;
  }

  constructor(config: SparkdownCompilerConfig = {}) {
    this._config = config || this._config;
  }

  configure(config: SparkdownCompilerConfig) {
    if (
      config.builtinDefinitions &&
      config.builtinDefinitions !== this._config.builtinDefinitions
    ) {
      this._config.builtinDefinitions = config.builtinDefinitions;
    }
    if (
      config.optionalDefinitions &&
      config.optionalDefinitions !== this._config.optionalDefinitions
    ) {
      this._config.optionalDefinitions = config.optionalDefinitions;
    }
    if (
      config.schemaDefinitions &&
      config.schemaDefinitions !== this._config.schemaDefinitions
    ) {
      this._config.schemaDefinitions = config.schemaDefinitions;
    }
    if (
      config.descriptionDefinitions &&
      config.descriptionDefinitions !== this._config.descriptionDefinitions
    ) {
      this._config.descriptionDefinitions = config.descriptionDefinitions;
    }
    if (config.files && config.files !== this._config.files) {
      this._config.files = config.files;
      for (const file of config.files) {
        this.addFile({ file });
      }
    }
    return LANGUAGE_NAME;
  }

  addFile(params: { file: File }) {
    const result = this.files.add(params);
    const file = params.file;
    if (file.type === "script") {
      this.documents.add({
        textDocument: {
          uri: file.uri,
          languageId: "sparkdown",
          version: -1,
          text: file.text || "",
        },
      });
    }
    return result;
  }

  updateFile(params: { file: File }) {
    return this.files.update(params);
  }

  updateDocument(params: {
    textDocument: { uri: string; version: number };
    contentChanges: SparkdownDocumentContentChangeEvent[];
  }) {
    return this.documents.update(params);
  }

  removeFile(params: { file: { uri: string } }) {
    this.files.remove(params);
    const file = params.file;
    return this.documents.remove({ textDocument: { uri: file.uri } });
  }

  resolveFile(rootUri: string, relativePath: string) {
    for (const ext of FILE_TYPES) {
      const uri = resolveFileUsingImpliedExtension(rootUri, relativePath, ext);
      if (this._documents.has(uri)) {
        return uri;
      }
    }
    throw new Error(`Cannot find file '${relativePath}'.`);
  }

  transpile(
    uri: string,
    state: SparkdownCompilerState,
    uuidToSource: Record<string, [file: number, line: number]>
  ) {
    profile("start", "transpile", uri);
    state.transpiledScripts ??= {};
    if (state.transpiledScripts[uri]) {
      return state.transpiledScripts[uri].content;
    }
    const doc = this.documents.get(uri);
    if (!doc) {
      console.error("Could not find document: ", uri);
      return "";
    }
    profile("start", "splitIntoLines", uri);
    const script = doc.getText() || "";
    const lines = script.split(NEWLINE_REGEX);
    profile("end", "splitIntoLines", uri);
    state.transpiledScripts[uri] ??= { content: script, version: doc.version };
    const fileIndex = Object.keys(state.transpiledScripts).indexOf(uri);
    const annotations = this.documents.annotations(uri);
    const cur = annotations.transpilations.iter();
    while (cur.value) {
      const lineIndex = doc.lineAt(cur.from);
      const lineFrom = doc.offsetAt({
        line: lineIndex,
        character: 0,
      });
      const lineTo = doc.offsetAt({
        line: lineIndex,
        character: Number.MAX_VALUE,
      });
      const after = cur.to - lineFrom;
      if (cur.value.type.uuid) {
        uuidToSource[cur.value.type.uuid] ??= [fileIndex, lineIndex];
      }
      if (cur.value.type.splice) {
        const lineTextBefore = doc.read(lineFrom, cur.to);
        const lineTextAfter = doc.read(cur.to, lineTo);
        lines[lineIndex] =
          lineTextBefore + cur.value.type.splice + lineTextAfter;
        state.sourceMap ??= {};
        state.sourceMap[uri] ??= {};
        state.sourceMap[uri][lineIndex] = {
          after,
          shift: cur.value.type.splice.length,
        };
      }
      if (cur.value.type.prefix) {
        lines[lineIndex] = cur.value.type.prefix + lines[lineIndex];
        state.sourceMap ??= {};
        state.sourceMap[uri] ??= {};
        state.sourceMap[uri][lineIndex] = {
          after: 0,
          shift: cur.value.type.prefix.length,
        };
      }
      if (cur.value.type.suffix) {
        lines[lineIndex] = lines[lineIndex] + cur.value.type.suffix;
      }
      cur.next();
    }
    const result = lines.join("\n");
    state.transpiledScripts[uri] = { content: result, version: doc.version };
    profile("end", "transpile", uri);
    return result;
  }

  compile(params: { uri: string }) {
    const uri = params.uri;
    // console.clear();
    const program: SparkProgram = {
      uri,
      scripts: { [uri]: this.documents.get(uri)?.version ?? -1 },
    };
    const state: SparkdownCompilerState = {};

    const uuidToSource: Record<string, [file: number, line: number]> = {};
    const uuidToPath: Record<string, string> = {};

    const options = new InkCompilerOptions(
      "",
      [],
      false,
      (message: string, type, source) => {
        // console.error(message, type, source);
      },
      {
        ResolveInkFilename: (filename: string): string => {
          return this.resolveFile(uri, filename);
        },
        LoadInkFileContents: (uri: string): string => {
          return this.transpile(uri, state, uuidToSource);
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
                  uuidToPath[flowMarker] ??= path;
                }
              }
            }
          }
          return false;
        },
      }
    );
    const file = this.files.get(uri);
    if (file) {
      const rootFilename =
        (uri.includes("/") ? uri.split("/").at(-1) : uri) || "main.sd";
      const inkCompiler = new InkCompiler(`include ${rootFilename}`, options);
      try {
        profile("start", "ink/compile", uri);
        const story = inkCompiler.Compile();
        profile("end", "ink/compile", uri);
        const writer = new SimpleJson.Writer();
        if (story) {
          profile("start", "ink/json", uri);
          story.ToJson(writer);
          profile("end", "ink/json", uri);
        }
        const compiledObj = (writer.toObject() || {}) as SparkdownRuntimeFormat;
        compiledObj.uuidToPath = uuidToPath;
        compiledObj.uuidToSource = uuidToSource;
        program.compiled = compiledObj;
        program.scripts = { [uri]: this.documents.get(uri)?.version ?? -1 };
        for (const [scriptUri, transpilation] of Object.entries(
          state.transpiledScripts || {}
        )) {
          program.scripts[scriptUri] = transpilation.version;
        }
        this.populateDiagnostics(state, program, inkCompiler);
        this.populateBuiltins(program);
        this.populateAssets(program);
        this.validateSyntax(program);
        this.populateImplicitDefs(program);
        this.validateReferences(program);
      } catch (e) {
        // console.error(e);
      }
    }
    return program;
  }

  clone<T>(value: T) {
    return structuredClone(value);
  }

  populateBuiltins(program: SparkProgram) {
    const uri = program.uri;
    profile("start", "populateBuiltins", uri);
    const compiled = program.compiled;
    program.context ??= {};
    const builtins = this._config.builtinDefinitions;
    if (builtins) {
      for (const [type, builtinStructs] of Object.entries(builtins)) {
        for (const [name, builtinStruct] of Object.entries(builtinStructs)) {
          program.context[type] ??= {};
          program.context[type][name] ??= this.clone(builtinStruct);
        }
      }
      if (compiled?.structDefs) {
        for (const [type, structs] of Object.entries(compiled.structDefs)) {
          program.context[type] ??= {};
          for (const [name, definedStruct] of Object.entries(structs)) {
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
                  traverse(builtinDefaultStruct, (propPath, propValue) => {
                    setProperty(constructed, propPath, this.clone(propValue));
                  });
                }
                const definedDefaultStruct = structs?.["$default"];
                if (definedDefaultStruct) {
                  traverse(definedDefaultStruct, (propPath, propValue) => {
                    let redirectedPropPath =
                      propPath === ".link" || propPath.startsWith(".link.")
                        ? propPath.replace(/^.link/, ".$link")
                        : propPath;
                    setProperty(
                      constructed,
                      redirectedPropPath,
                      this.clone(propValue)
                    );
                  });
                }
              }
              traverse(definedStruct, (propPath, propValue) => {
                setProperty(constructed, propPath, this.clone(propValue));
              });
              constructed["$type"] = type;
              constructed["$name"] = name;
              program.context[type][name] = constructed;
            }
          }
        }
      }
    }
    profile("end", "populateBuiltins", uri);
  }

  populateAssets(program: SparkProgram) {
    const uri = program.uri;
    profile("start", "populateAssets", uri);
    program.context ??= {};
    const files = this.files.all();
    if (files) {
      for (const file of files) {
        const type = file.type;
        const name = file.name;
        program.context[type] ??= {};
        program.context[type][name] ??= { ...file };
        const definedFile = program.context[type][name];
        delete definedFile.text;
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
      }
    }
    profile("end", "populateAssets", uri);
  }

  populateImplicitDefs(program: SparkProgram) {
    const uri = program.uri;
    profile("start", "populateImplicitDefs", uri);
    const images = program.context?.["image"];
    if (images) {
      for (const image of Object.values(images)) {
        if (image["ext"] === "svg" || image["data"]) {
          const type = image["$type"];
          const name = image["$name"];
          // Declare implicit filtered_image
          // (so it only displays default layers by default)
          const implicitType = "filtered_image";
          program.context ??= {};
          program.context[implicitType] ??= {};
          if (!program.context[implicitType][name]) {
            program.context[implicitType][name] ??= {
              $type: implicitType,
              $name: name,
              image: { $type: type, $name: name },
              filters: [],
            };
          }
        }
      }
    }
    const resolvedImplicits = new Set<string>();
    for (const uri of Object.keys(program.scripts)) {
      const doc = this.documents.get(uri);
      if (doc) {
        const annotations = this.documents.annotations(uri);
        const cur = annotations.implicits.iter();
        while (cur.value) {
          const text = doc.read(cur.from, cur.to);
          if (!resolvedImplicits.has(text)) {
            resolvedImplicits.add(text);
            const type = cur.value.type;
            const parts = text.split("~");
            const [fileName, ...filterNames] = parts;
            const sortedFilterNames = filterNames.sort();
            const name = [fileName, ...sortedFilterNames].join("~");
            program.context ??= {};
            program.context[type] ??= {};
            if (!program.context[type][name]) {
              program.context[type][name] ??= {
                $type: type,
                $name: name,
                image: { $name: fileName },
                filters: sortedFilterNames.map((filterName) => ({
                  $type: "filter",
                  $name: filterName,
                })),
              };
            }
          }
          cur.next();
        }
      }
    }
    profile("end", "populateImplicitDefs", uri);
  }

  getExpectedPropertyValue(
    program: SparkProgram,
    declaration: SparkDeclaration | undefined
  ) {
    const structType = declaration?.type;
    const structName = declaration?.name;
    const structProperty = declaration?.property;
    if (structType && structProperty) {
      // Use the default property value specified in $default and $optional to infer main type
      const propertyPath = program.context?.[structType]?.["$default"]?.[
        "$recursive"
      ]
        ? structProperty.split(".").at(-1) || ""
        : structProperty;
      const trimmedPropertyPath = propertyPath.startsWith(".")
        ? propertyPath.slice(1)
        : propertyPath;
      const expectedPropertyPath = trimmedPropertyPath
        .split(".")
        .map((x) => (!Number.isNaN(Number(x)) ? 0 : x))
        .join(".");
      const expectedPropertyValue =
        getProperty(
          program.context?.[structType]?.["$default"],
          expectedPropertyPath
        ) ??
        getProperty(
          program.context?.[structType]?.[`$optional:${structName}`],
          expectedPropertyPath
        ) ??
        getProperty(
          program.context?.[structType]?.["$optional"],
          expectedPropertyPath
        ) ??
        getProperty(
          this._config?.optionalDefinitions?.[structType]?.["$optional"],
          expectedPropertyPath
        );
      return expectedPropertyValue;
    }
    return undefined;
  }

  validateSyntax(program: SparkProgram) {
    const uri = program.uri;
    profile("start", "validateSyntax", uri);
    for (const uri of Object.keys(program.scripts)) {
      const doc = this.documents.get(uri);
      if (doc) {
        const annotations = this.documents.annotations(uri);
        const cur = annotations.validations.iter();
        while (cur.value) {
          const diagnostic = cur.value.type;
          const range = doc.range(cur.from, cur.to);
          if (range) {
            if (diagnostic.message) {
              const severity =
                diagnostic.severity === "error"
                  ? DiagnosticSeverity.Error
                  : diagnostic.severity === "warning"
                  ? DiagnosticSeverity.Warning
                  : diagnostic.severity === "info"
                  ? DiagnosticSeverity.Information
                  : DiagnosticSeverity.Warning;
              program.diagnostics ??= {};
              program.diagnostics[uri] ??= [];
              program.diagnostics[uri].push({
                range,
                severity,
                message: diagnostic.message,
                relatedInformation: [
                  {
                    location: { uri, range },
                    message: "",
                  },
                ],
                source: LANGUAGE_NAME,
              });
            }
          }
          cur.next();
        }
      }
    }
    profile("end", "validateSyntax", uri);
  }

  validateReferences(program: SparkProgram) {
    const uri = program.uri;
    profile("start", "validateReferences", uri);
    for (const uri of Object.keys(program.scripts)) {
      const doc = this.documents.get(uri);
      if (doc) {
        const annotations = this.documents.annotations(uri);
        const cur = annotations.references.iter();
        while (cur.value) {
          const reference = cur.value.type;
          const range = doc.range(cur.from, cur.to);
          if (reference.selector) {
            const selector = reference.selector;
            const declaration = reference.assigned;
            const expectedSelectorTypes = getExpectedSelectorTypes(
              program,
              declaration,
              this._config
            );
            // Validate that reference resolves to existing an struct
            let [found] = resolveSelector<any>(
              program,
              selector,
              expectedSelectorTypes
            );
            if (found) {
              // Validate that resolved reference matches expected type
              if (
                expectedSelectorTypes &&
                expectedSelectorTypes.length > 0 &&
                typeof found === "object" &&
                "$type" in found &&
                !expectedSelectorTypes.includes(found.$type)
              ) {
                // Report type mismatch error
                const message = `Type '${
                  found.$type
                }' is not assignable to type ${formatList(
                  expectedSelectorTypes
                )}`;
                program.diagnostics ??= {};
                program.diagnostics[uri] ??= [];
                program.diagnostics[uri].push({
                  range,
                  severity: DiagnosticSeverity.Warning,
                  message,
                  relatedInformation: [
                    {
                      location: { uri, range },
                      message: "",
                    },
                  ],
                  source: LANGUAGE_NAME,
                });
              }
            } else {
              // Report missing error
              const validDescription = selector.name
                ? selector.displayType
                  ? `${selector.displayType} named '${selector.name}'`
                  : selector.types && selector.types.length > 0
                  ? `${selector.types[0]} named '${selector.name}'`
                  : expectedSelectorTypes && expectedSelectorTypes.length > 0
                  ? `${expectedSelectorTypes[0]} named '${selector.name}'`
                  : `'${selector.name}'`
                : selector.types
                ? `type named '${selector.types[0]}'`
                : `type`;
              const message = `Cannot find ${validDescription}`;
              program.diagnostics ??= {};
              program.diagnostics[uri] ??= [];
              program.diagnostics[uri].push({
                range,
                severity: DiagnosticSeverity.Warning,
                message,
                relatedInformation: [
                  {
                    location: { uri, range },
                    message: "",
                  },
                ],
                source: LANGUAGE_NAME,
              });
            }
          } else if (reference.assigned) {
            const declaration = reference.assigned;
            const structType = declaration?.type;
            const structName = declaration?.name || "$default";
            const structProperty = declaration?.property;
            if (structType && structProperty) {
              // Validate struct property types
              if (program.context?.[structType]?.[structName]) {
                const definedPropertyValue = getProperty(
                  program.context?.[structType]?.[structName],
                  structProperty
                );
                if (definedPropertyValue !== undefined) {
                  const expectedPropertyValue = this.getExpectedPropertyValue(
                    program,
                    declaration
                  );
                  if (expectedPropertyValue !== undefined) {
                    if (
                      typeof definedPropertyValue !==
                      typeof expectedPropertyValue
                    ) {
                      const message = `Cannot assign '${typeof definedPropertyValue}' to '${typeof expectedPropertyValue}' property`;
                      program.diagnostics ??= {};
                      program.diagnostics[uri] ??= [];
                      program.diagnostics[uri].push({
                        range,
                        severity: DiagnosticSeverity.Error,
                        message,
                        relatedInformation: [
                          {
                            location: { uri, range },
                            message: "",
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
          cur.next();
        }
      }
    }
    profile("end", "validateReferences", uri);
  }

  populateDiagnostics(
    state: SparkdownCompilerState,
    program: SparkProgram,
    compiler: InkCompiler
  ) {
    const uri = program.uri;
    profile("start", "populateDiagnostics", uri);
    for (const error of compiler.errors) {
      program.diagnostics ??= {};
      const diagnostic = this.convertInkCompilerDiagnostic(
        uri,
        error.message,
        ErrorType.Error,
        error.source,
        state
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
    for (const warning of compiler.warnings) {
      program.diagnostics ??= {};
      const diagnostic = this.convertInkCompilerDiagnostic(
        uri,
        warning.message,
        ErrorType.Warning,
        warning.source,
        state
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
    for (const info of compiler.infos) {
      program.diagnostics ??= {};
      const diagnostic = this.convertInkCompilerDiagnostic(
        uri,
        info.message,
        ErrorType.Information,
        info.source,
        state
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
    profile("end", "populateDiagnostics", uri);
  }

  convertInkCompilerDiagnostic(
    rootUri: string,
    message: string,
    type: ErrorType,
    metadata?: SourceMetadata | null,
    state?: SparkdownCompilerState
  ): SparkDiagnostic | null {
    if (metadata && metadata.fileName) {
      const filePath = metadata?.filePath || "";
      const startLine = metadata.startLineNumber - 1;
      const endLine = metadata.endLineNumber - 1;
      const startOffset = state?.sourceMap?.[filePath]?.[startLine];
      const startOffsetAfter = startOffset?.after ?? 0;
      const startOffsetShift = startOffset?.shift ?? 0;
      const endOffset = state?.sourceMap?.[filePath]?.[endLine];
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
      if (
        startLine > endLine ||
        (startLine === endLine && startCharacter > endCharacter)
      ) {
        // This error range is invalid.
        console.warn("HIDDEN", message, type, metadata);
        return null;
      }
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
      const uri = metadata.fileName
        ? this.resolveFile(rootUri, metadata.fileName) || metadata.fileName
        : undefined;
      const relatedInformation = uri
        ? [
            {
              location: { uri, range },
              message: "",
            },
          ]
        : [];
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
        relatedInformation,
        source,
      };
      return diagnostic;
    }
    console.warn("HIDDEN", message, type, metadata);
    return null;
  }
}

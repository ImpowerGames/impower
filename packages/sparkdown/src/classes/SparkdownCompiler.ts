import GRAMMAR_DEFINITION from "../../language/sparkdown.language-grammar.json";
import {
  Compiler as InkCompiler,
  CompilerOptions as InkCompilerOptions,
} from "../inkjs/compiler/Compiler";
import { ErrorType } from "../inkjs/compiler/Parser/ErrorType";
import { SourceMetadata } from "../inkjs/engine/Error";
import { StringValue } from "../inkjs/engine/Value";
import { SimpleJson } from "../inkjs/engine/SimpleJson";
import { File } from "../types/File";
import { SparkDeclaration } from "../types/SparkDeclaration";
import { DiagnosticSeverity, SparkDiagnostic } from "../types/SparkDiagnostic";
import { SparkdownCompilerConfig } from "../types/SparkdownCompilerConfig";
import { SparkProgram } from "../types/SparkProgram";
import { SparkdownCompilerState } from "../types/SparkdownCompilerState";
import { buildSVGSource } from "../utils/buildSVGSource";
import { filterMatchesName } from "../utils/filterMatchesName";
import { filterSVG } from "../utils/filterSVG";
import { getAccessPath } from "../utils/getAccessPath";
import { getProperty } from "../utils/getProperty";
import { profile } from "../utils/profile";
import { resolveSelector } from "../utils/resolveSelector";
import { setProperty } from "../utils/setProperty";
import { traverse } from "../utils/traverse";
import {
  SparkdownDocumentContentChangeEvent,
  SparkdownDocumentRegistry,
} from "./SparkdownDocumentRegistry";
import { SparkdownFileRegistry } from "./SparkdownFileRegistry";
import { SparkdownRuntimeFormat } from "../types/SparkdownRuntimeFormat";
import { getExpectedSelectorTypes } from "../utils/getExpectedSelectorTypes";
import { formatList } from "../utils/formatList";

const LANGUAGE_NAME = GRAMMAR_DEFINITION.name.toLowerCase();
const NEWLINE_REGEX: RegExp = /\r\n|\r|\n/;
const UUID_MARKER_REGEX = new RegExp(GRAMMAR_DEFINITION.repository.UUID.match);
const FILE_TYPES = GRAMMAR_DEFINITION.fileTypes;

export class SparkdownCompiler {
  protected _config: SparkdownCompilerConfig = {};

  protected _documents = new SparkdownDocumentRegistry();
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
      for (const file of Object.values(config.files)) {
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
      const uri = this.resolveFileUsingImpliedExtension(
        rootUri,
        relativePath,
        ext
      );
      if (uri) {
        return uri;
      }
    }
    throw new Error(`Cannot find file '${relativePath}'.`);
  }

  resolveFileUsingImpliedExtension(
    rootUri: string,
    relativePath: string,
    ext: string
  ) {
    const trimmedPath = relativePath.startsWith("/")
      ? relativePath.slice(1).trim()
      : relativePath.trim();
    const indexOfLastSlash = trimmedPath.lastIndexOf("/");
    const filename = trimmedPath.slice(
      indexOfLastSlash >= 0 ? indexOfLastSlash : 0
    );
    const impliedSuffix = filename.includes(".") ? "" : `.${ext}`;
    const relativePathWithSuffix = trimmedPath + impliedSuffix;
    const uri = new URL("./" + relativePathWithSuffix, rootUri).href;
    if (
      relativePathWithSuffix.endsWith(`/main.${ext}`) ||
      this._documents.has(uri)
    ) {
      return uri;
    }
    return "";
  }

  transpile(
    uri: string,
    state: SparkdownCompilerState,
    uuidToSource: Record<string, [file: number, line: number]>
  ) {
    profile("start", "transpile", uri);
    state.transpiledScripts ??= {};
    if (state.transpiledScripts[uri]) {
      return state.transpiledScripts[uri];
    }
    const doc = this.documents.get(uri);
    if (!doc) {
      return "";
    }
    profile("start", "splitIntoLines", uri);
    const script = doc.getText() || "";
    const lines = script.split(NEWLINE_REGEX);
    profile("end", "splitIntoLines", uri);
    const read = (from: number, to: number): string =>
      doc.getText({ start: doc.positionAt(from), end: doc.positionAt(to) });
    state.transpiledScripts[uri] ??= script;
    const fileIndex = Object.keys(state.transpiledScripts).indexOf(uri);
    const annotations = this.documents.annotations(uri);
    const cur = annotations.transpilations.iter();
    while (cur.value) {
      const lineIndex = doc.positionAt(cur.from).line;
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
        const lineTextBefore = read(lineFrom, cur.to);
        const lineTextAfter = read(cur.to, lineTo);
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
    state.transpiledScripts[uri] = result;
    profile("end", "transpile", uri);
    return result;
  }

  compile(params: { uri: string }): SparkProgram {
    const uri = params.uri;
    // console.clear();
    const program: SparkProgram = { uri, scripts: [uri] };
    const state: SparkdownCompilerState = {};

    const uuidToSource: Record<string, [file: number, line: number]> = {};
    const uuidToPath: Record<string, string> = {};

    const options = new InkCompilerOptions(
      "",
      [],
      false,
      (message: string, type, source) => {
        console.error(message, type, source);
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
      const rootFilename = file.name + "." + file.ext || "main.sd";
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
        program.scripts = Object.keys(state.transpiledScripts || {});
        this.populateDiagnostics(state, program, inkCompiler);
        this.populateBuiltins(program, compiledObj);
        this.populateAssets(state, program);
        this.validateSyntax(state, program);
        this.validateReferences(state, program);
        this.populateImplicitDefs(state, program);
        profile("start", "ink/encode", uri);
        const array = new TextEncoder().encode(JSON.stringify(compiledObj));
        program.compiled = array.buffer.slice(
          array.byteOffset,
          array.byteLength + array.byteOffset
        ) as ArrayBuffer;
        profile("end", "ink/encode", uri);
      } catch (e) {
        console.error(e);
      }
    }
    // console.log("program", program);
    return program;
  }

  clone<T>(value: T) {
    return structuredClone(value);
  }

  populateBuiltins(program: SparkProgram, compiledObj: SparkdownRuntimeFormat) {
    const uri = program.uri;
    profile("start", "populateBuiltins", uri);
    const compiled = compiledObj;
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
                    setProperty(constructed, propPath, this.clone(propValue));
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

  populateAssets(_state: SparkdownCompilerState, program: SparkProgram) {
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
    profile("end", "populateAssets", uri);
  }

  populateImplicitDefs(state: SparkdownCompilerState, program: SparkProgram) {
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
          state.implicitDefs ??= {};
          state.implicitDefs[implicitType] ??= {};
          state.implicitDefs[implicitType][name] ??= {
            $type: implicitType,
            $name: name,
            image: { $type: type, $name: name },
            filters: [],
          };
        }
      }
    }
    const implicitDefs = state.implicitDefs;
    if (implicitDefs) {
      for (const [type, objs] of Object.entries(implicitDefs)) {
        for (const [name, obj] of Object.entries(objs)) {
          program.context ??= {};
          program.context[type] ??= {};
          program.context[type][name] ??= this.clone(obj);
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
            const message = `The image named '${filteredImage?.image?.$name}' circularly references itself.`;
            const propertyValueLocations =
              state.properties?.[
                `${filteredImage.$type}.${filteredImage.$name}.image`
              ];
            if (propertyValueLocations) {
              for (const location of propertyValueLocations) {
                const uri = location.uri;
                const range = location.range;
                program.diagnostics ??= {};
                program.diagnostics[uri] ??= [];
                program.diagnostics[uri].push({
                  range,
                  severity: DiagnosticSeverity.Error,
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
                const filteredLayers: { $type: "image"; $name: string }[] = [];
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
    profile("end", "populateImplicitDefs", uri);
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

  validateSyntax(_state: SparkdownCompilerState, program: SparkProgram) {
    const uri = program.uri;
    profile("start", "validateSyntax", uri);
    for (const uri of program.scripts) {
      const doc = this.documents.get(uri);
      if (doc) {
        const annotations = this.documents.annotations(uri);
        const cur = annotations.validations.iter();
        while (cur.value) {
          const diagnostic = cur.value.type;
          const range = {
            start: doc.positionAt(cur.from),
            end: doc.positionAt(cur.to),
          };
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
                    message: diagnostic.message,
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

  validateReferences(state: SparkdownCompilerState, program: SparkProgram) {
    const uri = program.uri;
    profile("start", "validateReferences", uri);
    for (const uri of program.scripts) {
      const doc = this.documents.get(uri);
      if (doc) {
        const annotations = this.documents.annotations(uri);
        const cur = annotations.references.iter();
        while (cur.value) {
          const reference = cur.value.type;
          const range = {
            start: doc.positionAt(cur.from),
            end: doc.positionAt(cur.to),
          };
          if (reference.prop && reference.declaration) {
            const accessPath = getAccessPath(reference.declaration);
            state.properties ??= {};
            state.properties[accessPath] ??= [];
            state.properties[accessPath].push({ uri, range });
          }
          if (reference.selector) {
            const selector = reference.selector;
            const declaration = reference.declaration;
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
                      message,
                    },
                  ],
                  source: LANGUAGE_NAME,
                });
              }
            } else {
              // Report missing error
              const validDescription = selector.displayType
                ? `${selector.displayType} named '${selector.name}'`
                : selector.types && selector.types.length > 0
                ? `${selector.types[0]} named '${selector.name}'`
                : expectedSelectorTypes && expectedSelectorTypes.length > 0
                ? `${expectedSelectorTypes[0]} named '${selector.name}'`
                : `'${selector.name}'`;
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
                    message,
                  },
                ],
                source: LANGUAGE_NAME,
              });
            }
          } else if (reference.declaration) {
            const declaration = reference.declaration;
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
              message,
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

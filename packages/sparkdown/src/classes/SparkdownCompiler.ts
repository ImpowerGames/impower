import { parseSparkle } from "@impower/sparkle-screen-renderer/src/parser/parser";
import { getStack } from "@impower/textmate-grammar-tree/src/tree/utils/getStack";
import GRAMMAR_DEFINITION from "../../language/sparkdown.language-grammar.json";
import {
  Compiler as InkCompiler,
  CompilerOptions as InkCompilerOptions,
  InkList,
} from "../inkjs/compiler/Compiler";
import { ErrorType } from "../inkjs/compiler/Parser/ErrorType";
import { SourceMetadata } from "../inkjs/engine/Error";
import { InkListItem } from "../inkjs/engine/InkList";
import { SimpleJson } from "../inkjs/engine/SimpleJson";
import { asOrNull } from "../inkjs/engine/TypeAssertion";
import { StringValue } from "../inkjs/engine/Value";
import { VariableAssignment } from "../inkjs/engine/VariableAssignment";
import { File } from "../types/File";
import { SparkDeclaration } from "../types/SparkDeclaration";
import { DiagnosticSeverity, SparkDiagnostic } from "../types/SparkDiagnostic";
import { SparkdownCompilerConfig } from "../types/SparkdownCompilerConfig";
import { SparkdownCompilerState } from "../types/SparkdownCompilerState";
import { SparkdownNodeName } from "../types/SparkdownNodeName";
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
const FILE_TYPES = GRAMMAR_DEFINITION.fileTypes;

export class SparkdownCompiler {
  protected _config: SparkdownCompilerConfig = {};

  protected _documents = new SparkdownDocumentRegistry("compiler", [
    "colors",
    "implicits",
    "references",
    "transpilations",
    "validations",
    "declarations",
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

  transpile(uri: string, state: SparkdownCompilerState) {
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
    const annotations = this.documents.annotations(uri);
    const cur = annotations.transpilations.iter();
    while (cur.value) {
      if (cur.value.type.whiteout) {
        const lineFromIndex = doc.lineAt(cur.from);
        const lineToIndex = doc.lineAt(cur.to);
        for (
          let lineIndex = lineFromIndex;
          lineIndex <= lineToIndex;
          lineIndex++
        ) {
          lines[lineIndex] = " ".repeat(lines[lineIndex]?.length ?? 0);
        }
      } else {
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
        if (cur.value.type.trimEnd != null) {
          const lineText = lines[lineIndex] || "";
          const newText = lineText.slice(0, -cur.value.type.trimEnd);
          lines[lineIndex] = newText;
        }
        if (cur.value.type.splice != null) {
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
        if (cur.value.type.prefix != null) {
          lines[lineIndex] = cur.value.type.prefix + lines[lineIndex];
          state.sourceMap ??= {};
          state.sourceMap[uri] ??= {};
          state.sourceMap[uri][lineIndex] = {
            after: 0,
            shift: cur.value.type.prefix.length,
          };
        }
        if (cur.value.type.suffix != null) {
          lines[lineIndex] = lines[lineIndex] + cur.value.type.suffix;
        }
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
      files: {},
      pathToLocation: {},
      functionLocations: {},
      dataLocations: {},
      version: this.documents.get(uri)?.version ?? -1,
    };
    const state: SparkdownCompilerState = {};

    const options = new InkCompilerOptions(
      "",
      [],
      false,
      (message: string, type, source) => {
        // console.error(message, type, source);
        // if (source) {
        //   let [uri, startLine, startColumn, endLine, endColumn] =
        //     this.getPreTranspilationLocation(source, state);
        //   const doc = this.documents.get(uri);
        //   if (doc) {
        //     const from = doc.offsetAt({
        //       line: startLine,
        //       character: startColumn,
        //     });
        //     const to = doc.offsetAt({ line: endLine, character: endColumn });
        //     const margin = 1000;
        //     const text = doc.read(from - margin, to + margin);
        //     console.error(text, "SOURCE");
        //     const transpiledScript = state.transpiledScripts?.[uri];
        //     if (transpiledScript) {
        //       console.error(
        //         transpiledScript?.content.slice(
        //           from - margin * 2,
        //           to + margin * 2
        //         ),
        //         "TRANSPILED"
        //       );
        //     }
        //   }
        // }
      },
      {
        ResolveInkFilename: (filename: string): string => {
          return this.resolveFile(uri, filename);
        },
        LoadInkFileContents: (uri: string): string => {
          return this.transpile(uri, state);
        },
      },
      {
        WriteRuntimeObject: (_, obj) => {
          const metadata = obj?.ownDebugMetadata;
          if (metadata) {
            let path = obj.path.toString();
            let [uri, startLine, startColumn, endLine, endColumn] =
              this.getPreTranspilationLocation(metadata, state);
            const scriptIndex = Object.keys(program.scripts).indexOf(uri || "");
            let varAss = asOrNull(obj, VariableAssignment);
            if (varAss) {
              if (varAss.variableName && !varAss.isNewDeclaration) {
                if (varAss.isGlobal) {
                  program.dataLocations ??= {};
                  program.dataLocations[varAss.variableName] ??= [
                    scriptIndex,
                    startLine,
                    startColumn,
                    endLine,
                    endColumn,
                  ];
                } else {
                  const containerPath = varAss.path
                    .toString()
                    .split(".")
                    .filter(
                      (p) =>
                        Number.isNaN(Number(p)) &&
                        !p.includes("-") &&
                        !p.includes("$")
                    )
                    .join(".");
                  program.dataLocations ??= {};
                  program.dataLocations[
                    containerPath + "." + varAss.variableName
                  ] ??= [
                    scriptIndex,
                    startLine,
                    startColumn,
                    endLine,
                    endColumn,
                  ];
                }
              }
            }
            if (path.startsWith("global ")) {
              path = "0";
            }
            if (
              scriptIndex >= 0 &&
              (!(obj instanceof StringValue) || !obj.isNewline)
            ) {
              const [
                _,
                existingStartLine,
                existingStartColumn,
                existingEndLine,
                existingEndColumn,
              ] = program.pathToLocation?.[path] || [];
              if (
                existingStartLine != null &&
                existingStartColumn != null &&
                (existingStartLine < startLine ||
                  (existingStartLine === startLine &&
                    existingStartColumn < startColumn))
              ) {
                // expand range backward
                startLine = existingStartLine;
                startColumn = existingStartColumn;
              }
              if (
                existingEndLine != null &&
                existingEndColumn != null &&
                (existingEndLine > endLine ||
                  (existingEndLine === endLine &&
                    existingEndColumn > endColumn))
              ) {
                // expand range forward
                endLine = existingEndLine;
                endColumn = existingEndColumn;
              }
              program.pathToLocation ??= {};
              program.pathToLocation[path] ??= [
                scriptIndex,
                startLine,
                startColumn,
                endLine,
                endColumn,
              ];
            }
          }
          return false;
        },
      }
    );
    const file = this.files.get(uri);
    const rootFilename =
      (uri.includes("/") ? uri.split("/").at(-1) : uri) || "main.sd";
    const inkCompiler = new InkCompiler(`include ${rootFilename}`, options);
    if (file) {
      try {
        profile("start", "ink/compile", uri);
        const story = inkCompiler.Compile();
        profile("end", "ink/compile", uri);
        const writer = new SimpleJson.Writer();
        if (story) {
          profile("start", "ink/json", uri);
          story.ToJson(writer);
          program.compiled = writer.toString();
          state.story = story;
          profile("end", "ink/json", uri);
        }
      } catch (e) {
        // console.error(e);
      }
    }
    program.scripts = { [uri]: this.documents.get(uri)?.version ?? -1 };
    for (const file of this.files.all()) {
      if (file.src) {
        const f = { ...file };
        delete f.src;
        delete f.text;
        delete f.data;
        program.files[file.src] = f;
      }
    }
    for (const [scriptUri, transpilation] of Object.entries(
      state.transpiledScripts || {}
    )) {
      program.scripts[scriptUri] = transpilation.version;
    }
    this.populateUI(program);
    this.sortPathToLocation(program);
    this.populateDeclarationLocations(program);
    this.populateDiagnostics(state, program, inkCompiler);
    this.buildContext(state, program);
    this.validateSyntax(program);
    this.validateReferences(program);
    return program;
  }

  evaluate(expression: string, evaluationContext: any) {
    const options = new InkCompilerOptions(
      "",
      [],
      false,
      (message) => {
        console.error(message);
      },
      undefined,
      undefined
    );
    let script = "";
    for (const [name, value] of Object.entries(evaluationContext)) {
      if (typeof value === "object" && value) {
        if ("$type" in value && value.$type === "list.def") {
          // is list
          const itemInitialization: string[] = [];
          for (const [k, v] of Object.entries(value)) {
            if (!k.startsWith("$")) {
              itemInitialization.push(`${k}=${v}`);
            }
          }
          const listInitialization =
            itemInitialization.length === 0
              ? `list ${name} = ()`
              : `list ${name} = ${itemInitialization.join(", ")}`;
          script += "\n" + listInitialization;
        } else if ("$type" in value && value.$type === "list.var") {
          // is list
          const list = new InkList();
          const itemInitialization: string[] = [];
          for (const [k, v] of Object.entries(value)) {
            if (!k.startsWith("$")) {
              if (k.includes(".")) {
                const [originName, itemName] = k.split(".");
                list.Add(
                  new InkListItem(originName ?? null, itemName ?? null),
                  v as number
                );
                itemInitialization.push(`${originName}.${itemName}`);
              }
            }
          }
          const listInitialization = `(${itemInitialization.join(", ")})`;
          script += "\n" + `var ${name} = ${listInitialization}`;
        } else {
          // is define (not usable in expressions)
        }
      } else {
        // is primitive
        script += "\n" + `var ${name} = ${JSON.stringify(value)}`;
      }
    }
    script +=
      "\n" +
      `
== function » ==
~ return ${expression}
`.trim();
    const inkCompiler = new InkCompiler(script, options);
    try {
      const story = inkCompiler.Compile();
      if (story) {
        const result = story.EvaluateFunction("»");
        if (result instanceof InkList) {
          const listDefinition = story.listDefinitions?.TryListGetDefinition(
            expression,
            null
          )?.result;
          if (listDefinition) {
            const listValue: Record<string, unknown> = { $type: "list.def" };
            for (const [key, itemValue] of listDefinition.items) {
              const keyObj = JSON.parse(key) as {
                originName: string;
                itemName: string;
              };
              listValue[keyObj.itemName] = itemValue;
            }
            return listValue;
          }
          const listValue: Record<string, unknown> = { $type: "list.var" };
          for (const [key, value] of result.entries()) {
            const keyObj = JSON.parse(key) as {
              originName: string;
              itemName: string;
            };
            listValue[keyObj.originName + "." + keyObj.itemName] = value;
          }
          return listValue;
        }
        return result;
      }
      return "<invalid expression>";
    } catch {
      return "<invalid expression>";
    }
  }

  clone<T>(value: T) {
    return structuredClone(value);
  }

  populateUI(program: SparkProgram) {
    const uri = program.uri;
    profile("start", "populateUI", uri);
    const scripts = Object.keys(program.scripts);
    for (const uri of scripts) {
      const doc = this.documents.get(uri);
      if (doc) {
        const annotations = this.documents.annotations(uri);
        const tree = this.documents.tree(uri);
        const cur = annotations.declarations.iter();
        if (tree) {
          if (cur) {
            while (cur.value) {
              const type = cur.value.type;
              if (
                type === "screen" ||
                type === "component" ||
                type === "style" ||
                type === "animation" ||
                type === "theme"
              ) {
                const stack = getStack<SparkdownNodeName>(tree, cur.from, -1);
                const declarationNode = stack.find(
                  (n) =>
                    n.name === "ScreenDeclaration" ||
                    n.name === "ComponentDeclaration" ||
                    n.name === "StyleDeclaration" ||
                    n.name === "AnimationDeclaration" ||
                    n.name === "ThemeDeclaration"
                );
                if (declarationNode) {
                  const name = doc.read(cur.from, cur.to);
                  const declaration = doc.read(
                    declarationNode.from,
                    declarationNode.to
                  );
                  const node = parseSparkle(declaration)[0];
                  if (node) {
                    program.ui ??= {};
                    program.ui![type] ??= {};
                    program.ui[type]![name] = node;
                  }
                }
              }
              cur.next();
            }
          }
        }
      }
    }
    profile("end", "populateUI", uri);
  }

  sortPathToLocation(program: SparkProgram) {
    const uri = program.uri;
    const scripts = Object.keys(program.scripts);
    profile("start", "sortPathToLocation", uri);
    if (program.pathToLocation) {
      const sortedEntries = Object.entries(program.pathToLocation).sort(
        ([, a], [, b]) => {
          const [scriptIndexA, startLineA, startColumnA] = a;
          const [scriptIndexB, startLineB, startColumnB] = b;
          return (
            scriptIndexA - scriptIndexB ||
            startLineA - startLineB ||
            startColumnA - startColumnB
          );
        }
      );
      program.pathToLocation = {};
      for (const [k, v] of sortedEntries) {
        program.pathToLocation[k] = v;
        const [scriptIndex, startLine, startColumn, endLine, endColumn] = v;
        if (startLine < endLine && endColumn === 0) {
          // If range stretches to only the start of a line,
          // limit the range to the end of the previous line,
          // (So that the document blinking cursor doesn't confusingly appear
          // at the start of the next unrelated line when doing a stack trace)
          const uri = scripts[scriptIndex];
          if (uri) {
            const document = this.documents.get(uri);
            if (document) {
              const endPositionWithoutNewline = document.positionAt(
                document.offsetAt({ line: endLine, character: endColumn }) - 1
              );
              program.pathToLocation[k] = [
                scriptIndex,
                startLine,
                startColumn,
                endPositionWithoutNewline.line,
                endPositionWithoutNewline.character,
              ];
            }
          }
        }
      }
    }
    profile("end", "sortPathToLocation", uri);
  }

  populateDeclarationLocations(program: SparkProgram) {
    const uri = program.uri;
    profile("start", "populateDeclarationLocations", uri);
    const scripts = Object.keys(program.scripts);
    for (const uri of scripts) {
      const doc = this.documents.get(uri);
      const scriptIndex = scripts.indexOf(uri);
      if (doc) {
        const annotations = this.documents.annotations(uri);
        const cur = annotations.declarations.iter();
        let scopePathParts: {
          kind: "" | "knot" | "stitch" | "label";
          name: string;
        }[] = [];
        if (cur) {
          while (cur.value) {
            const name = doc.read(cur.from, cur.to);
            const range = doc.range(cur.from, cur.to);
            if (cur.value.type === "function") {
              program.functionLocations ??= {};
              program.functionLocations[name] = [
                scriptIndex,
                range.start.line,
                range.start.character,
                range.end.line,
                range.end.character,
              ];
            }
            if (cur.value.type === "knot") {
              scopePathParts = [];
              scopePathParts.push({
                kind: "knot",
                name: doc.read(cur.from, cur.to),
              });
              program.knotLocations ??= {};
              program.knotLocations[name] = [
                scriptIndex,
                range.start.line,
                range.start.character,
                range.end.line,
                range.end.character,
              ];
            }
            if (cur.value.type === "stitch") {
              const prevKind = scopePathParts.at(-1)?.kind || "";
              if (prevKind !== "knot") {
                scopePathParts.pop();
              }
              scopePathParts.push({
                kind: "stitch",
                name: doc.read(cur.from, cur.to),
              });
              const name = scopePathParts.map((p) => p.name).join(".");
              program.stitchLocations ??= {};
              program.stitchLocations[name] = [
                scriptIndex,
                range.start.line,
                range.start.character,
                range.end.line,
                range.end.character,
              ];
            }
            if (cur.value.type === "label") {
              const prevKind = scopePathParts.at(-1)?.kind || "";
              if (prevKind !== "knot" && prevKind !== "stitch") {
                scopePathParts.pop();
              }
              scopePathParts.push({
                kind: "label",
                name: doc.read(cur.from, cur.to),
              });
              const name = scopePathParts.map((p) => p.name).join(".");
              program.labelLocations ??= {};
              program.labelLocations[name] = [
                scriptIndex,
                range.start.line,
                range.start.character,
                range.end.line,
                range.end.character,
              ];
            }
            cur.next();
          }
        }
      }
    }
    profile("end", "populateDeclarationLocations", uri);
  }

  buildContext(state: SparkdownCompilerState, program: SparkProgram) {
    const uri = program.uri;
    profile("start", "buildContext", uri);
    this.populateBuiltins(state, program);
    this.populateAssets(program);
    this.populateImplicitDefs(program);
    profile("end", "buildContext", uri);
  }

  populateBuiltins(state: SparkdownCompilerState, program: SparkProgram) {
    const uri = program.uri;
    profile("start", "populateBuiltins", uri);
    program.context ??= {};
    const builtins = this._config.builtinDefinitions;
    if (builtins) {
      for (const [type, builtinStructs] of Object.entries(builtins)) {
        for (const [name, builtinStruct] of Object.entries(builtinStructs)) {
          program.context[type] ??= {};
          program.context[type][name] ??= this.clone(builtinStruct);
        }
      }
      if (state?.story?.structDefinitions) {
        for (const [type, structs] of Object.entries(
          state?.story?.structDefinitions
        )) {
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
        program.context[type][name] ??= { $type: type, $name: name };
        const definedFile = program.context[type][name] || {};
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
          const [family, attrs] = name.split("__");
          if (definedFile["font_family"] === undefined) {
            definedFile["font_family"] = family || name;
          }
          if (definedFile["font_weight"] === undefined) {
            if (
              attrs &&
              attrs
                .toLowerCase()
                .match(/(^|_|\b)(?:bold|bolditalic|italicbold)($|_|\b)/)
            ) {
              definedFile["font_weight"] = "700";
            } else {
              definedFile["font_weight"] = "normal";
            }
          }
          if (definedFile["font_style"] === undefined) {
            if (
              attrs &&
              attrs
                .toLowerCase()
                .match(/(^|_|\b)(?:italic|bolditalic|italicbold)($|_|\b)/)
            ) {
              definedFile["font_style"] = "italic";
            } else {
              definedFile["font_style"] = "normal";
            }
          }
          if (definedFile["font_stretch"] === undefined) {
            definedFile["font_stretch"] = "normal";
          }
          if (definedFile["font_display"] === undefined) {
            definedFile["font_display"] = "block";
          }
        }
        for (const [k, v] of Object.entries(file)) {
          if (definedFile[k] === undefined) {
            definedFile[k] = v;
          }
        }
        program.context[type][name] = { ...file, ...definedFile };
        delete program.context[type][name].text;
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
          if (reference.symbolIds) {
            for (const symbolId of reference.symbolIds) {
              if (getProperty(this._config.builtinDefinitions, symbolId)) {
                if (
                  reference.declaration === "const" ||
                  reference.declaration === "var" ||
                  reference.declaration === "temp" ||
                  reference.declaration === "param" ||
                  reference.declaration === "list" ||
                  reference.declaration === "knot" ||
                  reference.declaration === "stitch"
                ) {
                  const message = `Cannot declare ${reference.declaration} named '${symbolId}':\nConflicts with builtin type '${symbolId}'`;
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
    message: string,
    type: ErrorType,
    metadata?: SourceMetadata | null,
    state?: SparkdownCompilerState
  ): SparkDiagnostic | null {
    if (metadata && metadata.fileName) {
      const [uri, startLine, startCharacter, endLine, endCharacter] =
        this.getPreTranspilationLocation(metadata, state);
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

  getPreTranspilationLocation(
    metadata: SourceMetadata,
    state?: SparkdownCompilerState
  ): [string, number, number, number, number] {
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
    return [filePath, startLine, startCharacter, endLine, endCharacter];
  }
}

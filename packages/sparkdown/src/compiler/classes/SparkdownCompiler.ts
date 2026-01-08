import { parseSparkle } from "@impower/sparkle-screen-renderer/src/parser/parser";
import { getStack } from "@impower/textmate-grammar-tree/src/tree/utils/getStack";
import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";
import {
  Compiler as InkCompiler,
  CompilerOptions as InkCompilerOptions,
  InkList,
} from "../../inkjs/compiler/Compiler";
import { IFileHandler } from "../../inkjs/compiler/IFileHandler";
import { ErrorType } from "../../inkjs/compiler/Parser/ErrorType";
import { Choice } from "../../inkjs/compiler/Parser/ParsedHierarchy/Choice";
import { FlowBase } from "../../inkjs/compiler/Parser/ParsedHierarchy/Flow/FlowBase";
import { Gather } from "../../inkjs/compiler/Parser/ParsedHierarchy/Gather/Gather";
import { Identifier } from "../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { IncludedFile } from "../../inkjs/compiler/Parser/ParsedHierarchy/IncludedFile";
import { Knot } from "../../inkjs/compiler/Parser/ParsedHierarchy/Knot";
import { ParsedObject } from "../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Statement } from "../../inkjs/compiler/Parser/ParsedHierarchy/Statement";
import { Stitch } from "../../inkjs/compiler/Parser/ParsedHierarchy/Stitch";
import { Story } from "../../inkjs/compiler/Parser/ParsedHierarchy/Story";
import { Weave } from "../../inkjs/compiler/Parser/ParsedHierarchy/Weave";
import { ControlCommand } from "../../inkjs/engine/ControlCommand";
import { DebugMetadata } from "../../inkjs/engine/DebugMetadata";
import { SourceMetadata } from "../../inkjs/engine/Error";
import { InkListItem } from "../../inkjs/engine/InkList";
import { InkObject } from "../../inkjs/engine/Object";
import { SimpleJson } from "../../inkjs/engine/SimpleJson";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";
import { asOrNull } from "../../inkjs/engine/TypeAssertion";
import { StringValue } from "../../inkjs/engine/Value";
import { VariableAssignment } from "../../inkjs/engine/VariableAssignment";
import { SparkDeclaration } from "../types/SparkDeclaration";
import { DiagnosticSeverity } from "../types/SparkDiagnostic";
import { SparkdownCompilerConfig } from "../types/SparkdownCompilerConfig";
import { SparkdownCompilerState } from "../types/SparkdownCompilerState";
import { SparkdownNodeName } from "../types/SparkdownNodeName";
import { SparkProgram } from "../types/SparkProgram";
import { cloneBuiltinStructs } from "../utils/cloneBuiltinStructs";
import { fetchProperty } from "../utils/fetchProperty";
import { formatList } from "../utils/formatList";
import { getExpectedSelectorTypes } from "../utils/getExpectedSelectorTypes";
import { indexStructs } from "../utils/indexStructs";
import { profile } from "../utils/profile";
import { readProperty } from "../utils/readProperty";
import { resolveFileUsingImpliedExtension } from "../utils/resolveFileUsingImpliedExtension";
import { resolveSelector } from "../utils/resolveSelector";
import { AddCompilerFileParams } from "./messages/AddCompilerFileMessage";
import {
  CompiledProgramMessage,
  CompiledProgramParams,
} from "./messages/CompiledProgramMessage";
import { CompileProgramParams } from "./messages/CompileProgramMessage";
import { RemoveCompilerFileParams } from "./messages/RemoveCompilerFileMessage";
import { SelectCompilerDocumentParams } from "./messages/SelectCompilerDocumentMessage";
import {
  SelectedCompilerDocumentMessage,
  SelectedCompilerDocumentParams,
} from "./messages/SelectedCompilerDocumentMessage";
import { UpdateCompilerDocumentParams } from "./messages/UpdateCompilerDocumentMessage";
import { UpdateCompilerFileParams } from "./messages/UpdateCompilerFileMessage";
import { SparkdownDocumentRegistry } from "./SparkdownDocumentRegistry";
import { SparkdownFileRegistry } from "./SparkdownFileRegistry";

const LANGUAGE_NAME = GRAMMAR_DEFINITION.name.toLowerCase();
const FILE_TYPES = GRAMMAR_DEFINITION.fileTypes;

export type SparkdownCompilerEvents = {
  "compiler/didCompile": (
    params: CompiledProgramParams & { story?: RuntimeStory }
  ) => void;
  "compiler/didSelect": (params: SelectedCompilerDocumentParams) => void;
};

export class SparkdownCompiler {
  protected _profilerId?: string;
  get profilerId() {
    return this._profilerId;
  }
  set profilerId(value: string | undefined) {
    this._profilerId = value;
  }

  protected _config: SparkdownCompilerConfig = {};
  get config() {
    return this._config;
  }

  protected _documents?: SparkdownDocumentRegistry;
  get documents() {
    if (!this._documents) {
      throw new Error("Compiler has not been configured!");
    }
    return this._documents;
  }

  protected _files = new SparkdownFileRegistry();
  get files() {
    return this._files;
  }

  protected _builtinStructs: {
    [type: string]: {
      [name: string]: any;
    };
  } = {};

  protected _configStructsPropertyRegistry: {
    [type: string]: {
      [name: string]: {
        [propertyPath: string]: any;
      };
    };
  } = {};

  protected _events: {
    [K in keyof SparkdownCompilerEvents]: Set<SparkdownCompilerEvents[K]>;
  } = {
    "compiler/didCompile": new Set(),
    "compiler/didSelect": new Set(),
  };

  addEventListener<K extends keyof SparkdownCompilerEvents>(
    event: K,
    listener: SparkdownCompilerEvents[K]
  ) {
    this._events[event].add(listener);
  }

  removeEventListener<K extends keyof SparkdownCompilerEvents>(
    event: K,
    listener: SparkdownCompilerEvents[K]
  ) {
    this._events[event].delete(listener);
  }

  configure(config: SparkdownCompilerConfig) {
    if (
      config.definitions?.builtins !== undefined &&
      config.definitions?.builtins !== this._config.definitions?.builtins
    ) {
      this._config.definitions ??= {};
      this._config.definitions.builtins = config.definitions.builtins;
      this._builtinStructs = {};
      profile("start", this._profilerId, "cloneBuiltinStructs");
      cloneBuiltinStructs(
        this._builtinStructs,
        this._config.definitions.builtins
      );
      profile("end", this._profilerId, "cloneBuiltinStructs");
      profile("start", this._profilerId, "indexStructs");
      indexStructs(this._configStructsPropertyRegistry, this._builtinStructs);
      profile("end", this._profilerId, "indexStructs");
    }
    if (
      config.definitions?.optionals !== undefined &&
      config.definitions?.optionals !== this._config.definitions?.optionals
    ) {
      this._config.definitions ??= {};
      this._config.definitions.optionals = config.definitions.optionals;
      profile("start", this._profilerId, "indexStructs");
      indexStructs(
        this._configStructsPropertyRegistry,
        this._config.definitions.optionals
      );
      profile("end", this._profilerId, "indexStructs");
    }
    if (
      config.definitions?.schemas !== undefined &&
      config.definitions?.schemas !== this._config.definitions?.schemas
    ) {
      this._config.definitions ??= {};
      this._config.definitions.schemas = config.definitions.schemas;
      profile("start", this._profilerId, "indexStructs");
      indexStructs(
        this._configStructsPropertyRegistry,
        this._config.definitions.schemas
      );
      profile("end", this._profilerId, "indexStructs");
    }
    if (
      config.definitions?.descriptions !== undefined &&
      config.definitions?.descriptions !==
        this._config.definitions?.descriptions
    ) {
      this._config.definitions ??= {};
      this._config.definitions.descriptions = config.definitions.descriptions;
      profile("start", this._profilerId, "indexStructs");
      indexStructs(
        this._configStructsPropertyRegistry,
        this._config.definitions.descriptions
      );
      profile("end", this._profilerId, "indexStructs");
    }
    if (
      config.skipValidation !== undefined &&
      config.skipValidation !== this._config.skipValidation
    ) {
      this._config.skipValidation = config.skipValidation;
    }
    if (
      config.workspace !== undefined &&
      config.workspace !== this._config.workspace
    ) {
      this._config.workspace = config.workspace;
    }
    if (
      config.startFrom !== undefined &&
      config.startFrom !== this._config.startFrom
    ) {
      this._config.startFrom = config.startFrom;
    }
    if (
      config.simulationOptions !== undefined &&
      config.simulationOptions !== this._config.simulationOptions
    ) {
      this._config.simulationOptions = config.simulationOptions;
    }
    if (!this._documents) {
      this._documents = new SparkdownDocumentRegistry(
        [
          "implicits",
          "references",
          "compilations",
          "validations",
          "declarations",
        ],
        {
          compilations: {
            definitions: this._config.definitions,
          },
        }
      );
      this._documents.profilerId = this._profilerId;
    }
    if (config.files !== undefined && config.files !== this._config.files) {
      this._config.files = config.files;
      for (const file of config.files) {
        this.addFile({ file });
      }
    }
    return LANGUAGE_NAME;
  }

  addFile(params: AddCompilerFileParams) {
    const result = this.files.add(params);
    const file = params.file;
    if (file.type === "script") {
      this.documents.add({
        textDocument: {
          uri: file.uri,
          languageId: "sparkdown",
          version: 0,
          text: file.text || "",
        },
      });
    }
    return result;
  }

  updateFile(params: UpdateCompilerFileParams) {
    return this.files.update(params);
  }

  updateDocument(params: UpdateCompilerDocumentParams) {
    return this.documents.update(params);
  }

  removeFile(params: RemoveCompilerFileParams) {
    this.files.remove(params);
    const file = params.file;
    return this.documents.remove({ textDocument: { uri: file.uri } });
  }

  resolveFile(rootUri: string, relativePath: string) {
    for (const ext of FILE_TYPES) {
      const uri = resolveFileUsingImpliedExtension(rootUri, relativePath, ext);
      if (this.documents.has(uri)) {
        return uri;
      }
    }
    throw new Error(`Cannot find file '${relativePath}'.`);
  }

  selectDocument(params: SelectCompilerDocumentParams) {
    this._events[SelectedCompilerDocumentMessage.method].forEach((l) => {
      l?.(params);
    });
    return params;
  }

  compile(params: CompileProgramParams) {
    const uri = params.textDocument.uri;
    const startFrom = params.startFrom;

    // console.clear();

    const program: SparkProgram = {
      uri,
      scripts: { [uri]: this.documents.get(uri)?.version ?? -1 },
      files: {},
      version: this.documents.get(uri)?.version ?? -1,
    };

    const state: SparkdownCompilerState = {};

    const onDiagnostic = (
      message: string,
      type: ErrorType,
      source: SourceMetadata | null
    ) => {
      if (source && source.filePath) {
        const severity =
          type === ErrorType.Error
            ? DiagnosticSeverity.Error
            : type === ErrorType.Warning
            ? DiagnosticSeverity.Warning
            : DiagnosticSeverity.Information;
        const uri = source.filePath;
        const startLine = source.startLineNumber - 1;
        const startCharacter = source.startCharacterNumber - 1;
        const endLine = source.endLineNumber - 1;
        const endCharacter = source.endCharacterNumber - 1;
        const docDiagnostic = this.getDiagnostic(
          message,
          severity,
          uri,
          startLine,
          startCharacter,
          endLine,
          endCharacter
        );
        if (docDiagnostic) {
          if (docDiagnostic.relatedInformation) {
            for (const info of docDiagnostic.relatedInformation) {
              const uri = info.location.uri;
              if (uri) {
                program.diagnostics ??= {};
                program.diagnostics[uri] ??= [];
                program.diagnostics[uri].push(docDiagnostic);
              }
            }
          }
        }
      }
    };

    const fileHandler: IFileHandler = {
      ResolveInkFilename: (filename: string): string => {
        const filePath = this.resolveFile(uri, filename);
        const doc = this.documents.get(filePath);
        if (doc) {
          program.scripts[filePath] = doc.version;
        }
        return filePath;
      },
      LoadInkFileContents: (uri: string): string => {
        const doc = this.documents.get(uri);
        if (doc) {
          return doc.getText();
        }
        return "";
      },
    };

    this.populateBuiltins(state, program);

    try {
      profile("start", this._profilerId, "ink/parse", uri);
      const parsedStory = this.parseIncrementally(
        uri,
        fileHandler,
        false,
        state,
        program,
        onDiagnostic
      );
      profile("end", this._profilerId, "ink/parse", uri);
      profile("start", this._profilerId, "ink/compile", uri);
      const story = parsedStory.ExportRuntime(onDiagnostic);
      profile("end", this._profilerId, "ink/compile", uri);
      if (story) {
        profile("start", this._profilerId, "ink/json", uri);
        story.onWriteRuntimeObject = (_, obj) =>
          this.populateLocations(program, obj);
        const writer = new SimpleJson.Writer();
        story.ToJson(writer);
        const json = writer.toObject();
        if (json) {
          program.compiled = json;
        }
        state.story = story;
        profile("end", this._profilerId, "ink/json", uri);
      }
    } catch (e) {
      console.error(e);
    }

    this.populateFiles(program);
    this.populateUI(program);
    this.populateDeclarationLocations(program);
    this.sortPathLocations(program);
    this.buildContext(state, program);
    if (!this._config.skipValidation) {
      this.validateSyntax(program);
      this.validateReferences(state, program);
    }
    if (this._config.workspace !== undefined) {
      program.workspace = this._config.workspace;
    }
    if (this._config.simulationOptions !== undefined) {
      program.simulationOptions = this._config.simulationOptions;
    }
    program.startFrom = startFrom ?? this._config.startFrom;
    const result = {
      textDocument: {
        uri,
        version: this.documents.get(uri)!.version,
      },
      program,
      story: state.story,
    };
    this._events[CompiledProgramMessage.method].forEach((l) => {
      l?.(result);
    });
    // Story is not serializable so must be deleted before sending result
    delete result.story;
    return result;
  }

  parseIncrementally(
    uri: string,
    fileHandler: IFileHandler,
    isInclude: boolean,
    state: SparkdownCompilerState,
    program: SparkProgram,
    onDiagnostic: (
      message: string,
      type: ErrorType,
      source: SourceMetadata | null
    ) => void
  ) {
    const version = this.documents.get(uri)?.version ?? 0;
    const getClosestWeave = (content: ParsedObject[]) => {
      const last = content.at(-1);
      if (last instanceof Weave) {
        if (last.content.at(-1) instanceof Weave) {
          return getClosestWeave(last.content);
        }
        return last;
      }
      if (last instanceof Stitch) {
        return getClosestWeave(last.content);
      }
      if (last instanceof Knot) {
        return getClosestWeave(last.content);
      }
      return undefined;
    };

    const fileName = uri.split("/").at(-1)?.split(".")[0] ?? null;

    const remapContent = (
      content: ParsedObject[],
      lineNumberOffset: number
    ) => {
      for (const c of content) {
        c.ResetRuntime();
        if (c.debugMetadata) {
          this.offsetDebugMetadata(c.debugMetadata, lineNumberOffset, version);
          c.debugMetadata.fileName = fileName;
          c.debugMetadata.filePath = uri;
        }
        if (
          "identifier" in c &&
          c.identifier instanceof Identifier &&
          c.identifier?.debugMetadata
        ) {
          this.offsetDebugMetadata(
            c.identifier.debugMetadata,
            lineNumberOffset,
            version
          );
          c.identifier.ResetRuntime();
          c.identifier.debugMetadata.fileName = fileName;
          c.identifier.debugMetadata.filePath = uri;
        }
        if ("pathIdentifiers" in c && Array.isArray(c.pathIdentifiers)) {
          for (const p of c.pathIdentifiers) {
            if (p instanceof Identifier && p.debugMetadata) {
              this.offsetDebugMetadata(
                p.debugMetadata,
                lineNumberOffset,
                version
              );
              p.ResetRuntime();
              p.debugMetadata.fileName = fileName;
              p.debugMetadata.filePath = uri;
            }
          }
        }
        if (c.content) {
          remapContent(c.content, lineNumberOffset);
        }
      }
    };

    const document = this.documents.get(uri);
    const annotations = this.documents.annotations(uri);
    const cur = annotations.compilations.iter();
    const topLevelIncludedFileObjs: IncludedFile[] = [];
    const topLevelFlowBaseObjs: FlowBase[] = [];
    const topLevelWeaveObjs: ParsedObject[] = [];
    const topLevelContent: (FlowBase | Weave)[] = [];

    while (cur.value) {
      const {
        include,
        diagnostics,
        content,
        context,
        contextPropertyRegistry,
        defaultDefinitions,
        uuid,
      } = cur.value.type;
      const lineNumberOffset = document?.lineAt(cur.from) ?? 0;
      if (include) {
        if (include) {
          let resolvedFilePath: string | null = null;
          try {
            resolvedFilePath = fileHandler.ResolveInkFilename(include);
          } catch {}
          const includedStory = resolvedFilePath
            ? this.parseIncrementally(
                resolvedFilePath,
                fileHandler,
                true,
                state,
                program,
                onDiagnostic
              )
            : null;
          topLevelIncludedFileObjs.push(new IncludedFile(includedStory));
        }
      }
      if (diagnostics) {
        for (const diagnostic of diagnostics) {
          if (diagnostic.source) {
            const offsetSource: SourceMetadata = { ...diagnostic.source };
            offsetSource.startLineNumber += lineNumberOffset;
            offsetSource.endLineNumber += lineNumberOffset;
            onDiagnostic(diagnostic.message, diagnostic.severity, offsetSource);
          }
        }
      }
      if (content) {
        remapContent(content, lineNumberOffset);
        const flow = content[0];
        if (flow) {
          if (flow instanceof Knot) {
            const rootWeave = new Weave([]);
            rootWeave.debugMetadata = flow.debugMetadata;
            const knot = new Knot(
              flow.identifier!,
              [],
              flow.args ?? [],
              flow.isFunction
            );
            knot.debugMetadata = flow.debugMetadata;
            knot._rootWeave = rootWeave;
            knot.AddContent(rootWeave);
            topLevelFlowBaseObjs.push(knot);
            topLevelContent.push(knot);
          } else if (flow instanceof Stitch) {
            const rootWeave = new Weave([]);
            const stitch = new Stitch(
              flow.identifier!,
              [],
              flow.args ?? [],
              flow.isFunction
            );
            stitch.debugMetadata = flow.debugMetadata;
            stitch._rootWeave = rootWeave;
            stitch.AddContent(rootWeave);
            rootWeave.debugMetadata = flow.debugMetadata;
            const last = topLevelContent.at(-1);
            if (last instanceof Knot) {
              if (stitch.identifier?.name) {
                last.subFlowsByName.set(stitch.identifier?.name, stitch);
              }
              if (
                last.content.length === 1 &&
                last.content[0] instanceof Weave &&
                last.content[0].content.length === 0
              ) {
                // Remove empty internal weave, since we are not using it
                last.content.pop();
              }
              last.AddContent(stitch);
            } else {
              topLevelFlowBaseObjs.push(stitch);
              topLevelContent.push(stitch);
            }
          } else if (flow instanceof Weave) {
            // Statements with uuids are wrapped in a Statement container so they can be given a stable runtime path
            const firstStatement = flow?.content[0];
            const isWeavePoint =
              firstStatement instanceof Choice ||
              firstStatement instanceof Gather;
            if (uuid && isWeavePoint) {
              // Ensure choices and gathers use a stable name for their inner container
              firstStatement.uuid = uuid;
            }
            const flowContent =
              uuid && !isWeavePoint
                ? [new Statement(uuid, flow.content)] // Wrap non-choice/gather statements in a stably named container
                : flow.content;
            const closestWeave = getClosestWeave(topLevelContent);
            if (closestWeave) {
              const lastContent = closestWeave.content.at(-1);
              if (
                lastContent instanceof Weave &&
                lastContent.content.length === 0
              ) {
                // Remove empty internal weave, since we are not using it
                closestWeave.content.pop();
              }
              closestWeave.AddContent(flowContent);
            } else {
              const weave = new Weave(flowContent);
              topLevelWeaveObjs.push(weave);
              topLevelContent.push(weave);
            }
          }
        }
      }
      if (context) {
        // Copy pre-built structs to program context
        for (const [type, structs] of Object.entries(context)) {
          for (const [name, struct] of Object.entries(structs)) {
            program.context ??= {};
            program.context[type] ??= {};
            program.context[type][name] = struct;
          }
        }
      }
      if (contextPropertyRegistry) {
        for (const [type, structs] of Object.entries(contextPropertyRegistry)) {
          for (const [name, struct] of Object.entries(structs)) {
            if (state.contextPropertyRegistry?.[type]?.[name]) {
              // Defined structs don't inherit the properties of builtins
              // So clear out the property registry for this defined struct
              state.contextPropertyRegistry[type][name] = {};
            }
            state.contextPropertyRegistry ??= {};
            state.contextPropertyRegistry[type] ??= {};
            state.contextPropertyRegistry[type][name] ??= {};
            for (const [propertyPath, propertyValue] of Object.entries(
              struct
            )) {
              state.contextPropertyRegistry ??= {};
              state.contextPropertyRegistry[type] ??= {};
              state.contextPropertyRegistry[type][name] ??= {};
              state.contextPropertyRegistry[type][name][propertyPath] =
                propertyValue;
            }
          }
        }
      }
      if (defaultDefinitions) {
        // Copy default definitions to state
        for (const [type, struct] of Object.entries(defaultDefinitions)) {
          state.defaultDefinitions ??= {};
          state.defaultDefinitions[type] ??= struct;
        }
      }
      cur.next();
    }

    const combinedParsedStory = new Story(
      [
        ...topLevelIncludedFileObjs,
        ...topLevelWeaveObjs.flatMap((w) => w.content),
        ...topLevelFlowBaseObjs,
      ],
      isInclude
    );

    return combinedParsedStory;
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

  populateLocations(program: SparkProgram, obj: InkObject) {
    const metadata = obj?.ownDebugMetadata;
    if (metadata) {
      const uri = metadata.filePath ?? program.uri;
      const scriptIndex = Object.keys(program.scripts).indexOf(uri || "");
      let startLine = metadata.startLineNumber - 1;
      let startColumn = metadata.startCharacterNumber - 1;
      let endLine = metadata.endLineNumber - 1;
      let endColumn = metadata.endCharacterNumber - 1;
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
            program.dataLocations[containerPath + "." + varAss.variableName] ??=
              [scriptIndex, startLine, startColumn, endLine, endColumn];
          }
        }
      }
      if (
        scriptIndex >= 0 &&
        !(
          obj instanceof ControlCommand &&
          obj.commandType === ControlCommand.CommandType.NoOp
        ) &&
        !(obj instanceof StringValue && obj.isNewline)
      ) {
        let path = obj.path.toString();
        if (!path.startsWith("global ")) {
          const [
            _,
            existingStartLine,
            existingStartColumn,
            existingEndLine,
            existingEndColumn,
          ] = program.pathLocations?.[path] || [];
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
              (existingEndLine === endLine && existingEndColumn > endColumn))
          ) {
            // expand range forward
            endLine = existingEndLine;
            endColumn = existingEndColumn;
          }
          if (endColumn === 0) {
            // If range stretches to only the start of a line,
            // limit the range to the end of the previous line,
            // (So that the document blinking cursor doesn't confusingly appear
            // at the start of the next unrelated line when doing a stack trace)
            if (uri) {
              const document = this.documents.get(uri);
              if (document) {
                const endPositionWithoutLastNewline = document.positionAt(
                  document.offsetAt({
                    line: endLine,
                    character: endColumn,
                  }) - 1
                );
                endLine = endPositionWithoutLastNewline.line;
                endColumn = endPositionWithoutLastNewline.character;
              }
            }
          }
          program.pathLocations ??= {};
          program.pathLocations[path] ??= [
            scriptIndex,
            startLine,
            startColumn,
            endLine,
            endColumn,
          ];
        }
      }
    }
    return false;
  }

  populateFiles(program: SparkProgram) {
    const uri = program.uri;
    profile("start", this._profilerId, "populateFiles", uri);
    for (const file of this.files.all()) {
      if (file.src) {
        const f = { ...file };
        delete f.src;
        delete f.text;
        delete f.data;
        program.files[file.src] = f;
      }
    }
    profile("end", this._profilerId, "populateFiles", uri);
  }

  populateUI(program: SparkProgram) {
    const uri = program.uri;
    profile("start", this._profilerId, "populateUI", uri);
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
    profile("end", this._profilerId, "populateUI", uri);
  }

  sortPathLocations(program: SparkProgram) {
    const uri = program.uri;
    profile("start", this._profilerId, "sortPathLocations", uri);
    if (program.pathLocations) {
      const sortedEntries = Object.entries(program.pathLocations).sort(
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
      program.pathLocations = {};
      for (const [k, v] of sortedEntries) {
        program.pathLocations[k] = v;
      }
    }
    profile("end", this._profilerId, "sortPathLocations", uri);
  }

  populateDeclarationLocations(program: SparkProgram) {
    const uri = program.uri;
    profile("start", this._profilerId, "populateDeclarationLocations", uri);
    const scripts = Object.keys(program.scripts);
    for (const uri of scripts) {
      const doc = this.documents.get(uri);
      const scriptIndex = scripts.indexOf(uri);
      if (doc) {
        const annotations = this.documents.annotations(uri);
        const cur = annotations.declarations.iter();
        let scopePathParts: {
          kind:
            | ""
            | "function"
            | "scene"
            | "branch"
            | "knot"
            | "stitch"
            | "label";
          name: string;
        }[] = [];
        if (cur) {
          while (cur.value) {
            const name = doc.read(cur.from, cur.to);
            const range = doc.range(cur.from, cur.to);
            if (cur.value.type === "function") {
              scopePathParts = [];
              scopePathParts.push({
                kind: "function",
                name: doc.read(cur.from, cur.to),
              });
              program.functionLocations ??= {};
              program.functionLocations[name] = [
                scriptIndex,
                range.start.line,
                range.start.character,
                range.end.line,
                range.end.character,
              ];
            }
            if (cur.value.type === "scene") {
              scopePathParts = [];
              scopePathParts.push({
                kind: "scene",
                name: doc.read(cur.from, cur.to),
              });
              program.sceneLocations ??= {};
              program.sceneLocations[name] = [
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
            if (cur.value.type === "branch") {
              const prevKind = scopePathParts.at(-1)?.kind || "";
              if (prevKind !== "scene" && prevKind !== "knot") {
                scopePathParts.pop();
              }
              scopePathParts.push({
                kind: "branch",
                name: doc.read(cur.from, cur.to),
              });
              const name = scopePathParts.map((p) => p.name).join(".");
              program.branchLocations ??= {};
              program.branchLocations[name] = [
                scriptIndex,
                range.start.line,
                range.start.character,
                range.end.line,
                range.end.character,
              ];
            }
            if (cur.value.type === "stitch") {
              const prevKind = scopePathParts.at(-1)?.kind || "";
              if (prevKind !== "scene" && prevKind !== "knot") {
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
              if (
                prevKind !== "function" &&
                prevKind !== "scene" &&
                prevKind !== "branch" &&
                prevKind !== "knot" &&
                prevKind !== "stitch"
              ) {
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
    profile("end", this._profilerId, "populateDeclarationLocations", uri);
  }

  buildContext(state: SparkdownCompilerState, program: SparkProgram) {
    const uri = program.uri;
    profile("start", this._profilerId, "buildContext", uri);
    this.populateAssets(state, program);
    this.populateImplicitDefs(state, program);
    this.populateDefinedDefaultProperties(state, program);
    profile("end", this._profilerId, "buildContext", uri);
  }

  populateBuiltins(state: SparkdownCompilerState, program: SparkProgram) {
    const uri = program.uri;
    profile("start", this._profilerId, "populateBuiltins", uri);
    for (const [type, structs] of Object.entries(this._builtinStructs)) {
      for (const [name, struct] of Object.entries(structs)) {
        program.context ??= {};
        program.context[type] ??= {};
        program.context[type][name] = struct;
      }
    }
    state.contextPropertyRegistry ??= {};
    for (const [type, structs] of Object.entries(
      this._configStructsPropertyRegistry
    )) {
      state.contextPropertyRegistry[type] ??= {};
      for (const [name, struct] of Object.entries(structs)) {
        state.contextPropertyRegistry[type][name] ??= {};
        for (const [propertyPath, propertyValue] of Object.entries(struct)) {
          state.contextPropertyRegistry[type][name][propertyPath] =
            propertyValue;
        }
      }
    }
    profile("end", this._profilerId, "populateBuiltins", uri);
  }

  populateAssets(state: SparkdownCompilerState, program: SparkProgram) {
    const uri = program.uri;
    profile("start", this._profilerId, "populateAssets", uri);
    program.context ??= {};
    const files = this.files.all();
    if (files) {
      for (const file of files) {
        const type = file.type;
        const name = file.name;
        program.context[type] ??= {};
        program.context[type][name] ??= { $type: type, $name: name };
        const definedFile = state.story?.structDefinitions?.[type]?.[name];
        const contextFile = program.context[type][name] || {};
        // Set $type and $name
        if (contextFile["$type"] === undefined) {
          contextFile["$type"] = type;
        }
        if (contextFile["$name"] === undefined) {
          contextFile["$name"] = name;
        }
        // Infer asset src if not defined
        if (definedFile?.["src"] === undefined) {
          contextFile["src"] = file["src"];
        }
        // Infer font settings if not defined
        if (type === "font") {
          const [family, attrs] = name.split("__");
          if (definedFile?.["font_family"] === undefined) {
            contextFile["font_family"] = family || name;
          }
          if (definedFile?.["font_weight"] === undefined) {
            if (
              attrs &&
              attrs
                .toLowerCase()
                .match(/(^|_|\b)(?:bold|bolditalic|italicbold)($|_|\b)/)
            ) {
              contextFile["font_weight"] = "700";
            } else {
              contextFile["font_weight"] = "normal";
            }
          }
          if (definedFile?.["font_style"] === undefined) {
            if (
              attrs &&
              attrs
                .toLowerCase()
                .match(/(^|_|\b)(?:italic|bolditalic|italicbold)($|_|\b)/)
            ) {
              contextFile["font_style"] = "italic";
            } else {
              contextFile["font_style"] = "normal";
            }
          }
          if (definedFile?.["font_stretch"] === undefined) {
            contextFile["font_stretch"] = "normal";
          }
          if (definedFile?.["font_display"] === undefined) {
            contextFile["font_display"] = "block";
          }
        }
        for (const [k, v] of Object.entries(file)) {
          if (definedFile?.[k] === undefined) {
            contextFile[k] = v;
          }
        }
        program.context[type][name] = { ...file, ...contextFile };
        delete program.context[type][name].text;

        state.contextPropertyRegistry ??= {};
        state.contextPropertyRegistry[type] ??= {};
        state.contextPropertyRegistry[type][name] ??= {};
      }
    }
    profile("end", this._profilerId, "populateAssets", uri);
  }

  populateImplicitDefs(state: SparkdownCompilerState, program: SparkProgram) {
    const uri = program.uri;
    profile("start", this._profilerId, "populateImplicitDefs", uri);
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
          state.contextPropertyRegistry ??= {};
          state.contextPropertyRegistry[implicitType] ??= {};
          state.contextPropertyRegistry[implicitType][name] ??= {};
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
            state.contextPropertyRegistry ??= {};
            state.contextPropertyRegistry[type] ??= {};
            state.contextPropertyRegistry[type][name] ??= {};
          }
          cur.next();
        }
      }
    }
    profile("end", this._profilerId, "populateImplicitDefs", uri);
  }

  populateDefinedDefaultProperties(
    state: SparkdownCompilerState,
    program: SparkProgram
  ) {
    const uri = program.uri;
    profile("start", this._profilerId, "populateDefinedDefaultProperties", uri);
    if (state.defaultDefinitions) {
      for (const [defaultType, defaultStruct] of Object.entries(
        state.defaultDefinitions
      )) {
        const structs = program.context?.[defaultType];
        if (structs) {
          for (const [name, struct] of Object.entries(structs)) {
            structs[name] = { ...defaultStruct, ...struct };
          }
        }
      }
    }
    profile("end", this._profilerId, "populateDefinedDefaultProperties", uri);
  }

  getPropertyPath(
    program: SparkProgram,
    structType: string,
    structProperty: string
  ) {
    // Use the default property value specified in $default and $optional to infer main type
    const recursive =
      program.context?.[structType]?.["$default"]?.["$recursive"];
    const propertyPath =
      recursive != null
        ? structProperty.split(".").at(-1) || ""
        : structProperty;
    const trimmedPropertyPath = propertyPath.startsWith(".")
      ? propertyPath.slice(1)
      : propertyPath;
    return trimmedPropertyPath
      .split(".")
      .map((x) => (!Number.isNaN(Number(x)) ? 0 : x))
      .join(".");
  }

  getExpectedPropertyValue(
    state: SparkdownCompilerState,
    program: SparkProgram,
    declaration: SparkDeclaration | undefined
  ) {
    const structType = declaration?.type;
    const structName = declaration?.name;
    const structProperty = declaration?.property;
    if (structType && structProperty) {
      const expectedPropertyPath = this.getPropertyPath(
        program,
        structType,
        structProperty
      );
      const expectedPropertyValue = state.contextPropertyRegistry
        ? fetchProperty(
            expectedPropertyPath,
            state.contextPropertyRegistry?.[structType]?.["$default"],
            state.contextPropertyRegistry?.[structType]?.[
              `$optional:${structName}`
            ],
            state.contextPropertyRegistry?.[structType]?.["$optional"]
          )
        : readProperty(
            expectedPropertyPath,
            program.context?.[structType]?.["$default"],
            program.context?.[structType]?.[`$optional:${structName}`],
            program.context?.[structType]?.["$optional"],
            this._config?.definitions?.optionals?.[structType]?.["$optional"]
          );
      return expectedPropertyValue;
    }
    return undefined;
  }

  getSchemaPropertyValues(
    state: SparkdownCompilerState,
    program: SparkProgram,
    declaration: SparkDeclaration | undefined
  ) {
    const structType = declaration?.type;
    const structName = declaration?.name;
    const structProperty = declaration?.property;
    if (structType && structProperty) {
      const expectedPropertyPath = this.getPropertyPath(
        program,
        structType,
        structProperty
      );
      const schemaPropertyValues = state.contextPropertyRegistry
        ? fetchProperty(
            expectedPropertyPath,
            state.contextPropertyRegistry?.[structType]?.[
              `$schema:${structName}`
            ],
            state.contextPropertyRegistry?.[structType]?.["$schema"]
          )
        : readProperty(
            expectedPropertyPath,
            program.context?.[structType]?.[`$schema:${structName}`],
            program.context?.[structType]?.["$schema"],
            this._config?.definitions?.schemas?.[structType]?.["$schema"]
          );
      return schemaPropertyValues;
    }
    return undefined;
  }

  validateSyntax(program: SparkProgram) {
    const uri = program.uri;
    profile("start", this._profilerId, "validateSyntax", uri);
    for (const uri of Object.keys(program.scripts)) {
      const doc = this.documents.get(uri);
      if (doc) {
        const annotations = this.documents.annotations(uri);
        const cur = annotations.validations.iter();
        while (cur.value) {
          const diagnostic = cur.value.type;
          if (diagnostic.message) {
            const range = doc.range(cur.from, cur.to);
            if (range) {
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
    profile("end", this._profilerId, "validateSyntax", uri);
  }

  validateReferences(state: SparkdownCompilerState, program: SparkProgram) {
    const uri = program.uri;
    profile("start", this._profilerId, "validateReferences", uri);
    for (const uri of Object.keys(program.scripts)) {
      const doc = this.documents.get(uri);
      if (doc) {
        const annotations = this.documents.annotations(uri);
        const cur = annotations.references.iter();
        while (cur.value) {
          const reference = cur.value.type;
          if (reference.symbolIds) {
            for (const symbolId of reference.symbolIds) {
              if (this._config.definitions?.builtins?.[symbolId]) {
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
                  const range = doc.range(cur.from, cur.to);
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
          if (reference.selectors) {
            const declaration = reference.assigned;
            const expectedSelectorTypes = getExpectedSelectorTypes(
              program,
              declaration,
              this._config,
              state
            );
            // Validate that reference resolves to existing an struct
            let found: any = undefined;
            for (const s of reference.selectors) {
              const [resolved] = resolveSelector<any>(
                program,
                s,
                expectedSelectorTypes,
                state
              );
              if (resolved) {
                found = resolved;
              }
            }
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
                const range = doc.range(cur.from, cur.to);
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
              const selector = reference.selectors?.[0];
              const validDescription =
                selector && (selector.displayName || selector.name)
                  ? selector.displayType
                    ? `${selector.displayType} named '${
                        selector.displayName || selector.name
                      }'`
                    : selector.types && selector.types.length > 0
                    ? `${selector.types[0]} named '${
                        selector.displayName || selector.name
                      }'`
                    : expectedSelectorTypes && expectedSelectorTypes.length > 0
                    ? `${expectedSelectorTypes[0]} named '${
                        selector.displayName || selector.name
                      }'`
                    : `'${selector.displayName || selector.name}'`
                  : selector && selector.types
                  ? `type named '${selector.types[0]}'`
                  : `type`;
              const message = `Cannot find ${validDescription}`;
              const range = doc.range(cur.from, cur.to);
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
                const definedPropertyValue = fetchProperty(
                  structProperty,
                  state.contextPropertyRegistry?.[structType]?.[structName]
                );
                if (definedPropertyValue !== undefined) {
                  const expectedPropertyValue = this.getExpectedPropertyValue(
                    state,
                    program,
                    declaration
                  );
                  if (expectedPropertyValue !== undefined) {
                    if (
                      typeof definedPropertyValue !==
                      typeof expectedPropertyValue
                    ) {
                      const schemaPropertyValues = this.getSchemaPropertyValues(
                        state,
                        program,
                        declaration
                      );
                      const isSchemaSupportedScalarType =
                        Array.isArray(schemaPropertyValues) &&
                        schemaPropertyValues.some(
                          (v) =>
                            typeof v !== "object" &&
                            typeof v === typeof definedPropertyValue
                        );
                      if (!isSchemaSupportedScalarType) {
                        const message = `Cannot assign '${typeof definedPropertyValue}' to '${typeof expectedPropertyValue}' property`;
                        const range = doc.range(cur.from, cur.to);
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
          }
          cur.next();
        }
      }
    }
    profile("end", this._profilerId, "validateReferences", uri);
  }

  offsetDebugMetadata(
    debugMetadata: DebugMetadata,
    lineNumberOffset: number,
    version: number
  ) {
    if (debugMetadata.sourceStartLineNumber == null) {
      debugMetadata.sourceStartLineNumber = debugMetadata.startLineNumber;
    }
    if (debugMetadata.sourceEndLineNumber == null) {
      debugMetadata.sourceEndLineNumber = debugMetadata.endLineNumber;
    }
    if (debugMetadata.version !== version) {
      debugMetadata.startLineNumber =
        debugMetadata.sourceStartLineNumber + lineNumberOffset;
      debugMetadata.endLineNumber =
        debugMetadata.sourceEndLineNumber + lineNumberOffset;
      debugMetadata.version = version;
    }
  }

  getDiagnostic(
    message: string,
    severity: DiagnosticSeverity,
    uri: string,
    startLine: number,
    startCharacter: number,
    endLine: number,
    endCharacter: number
  ) {
    if (startCharacter < 0) {
      // This error is occurring in a part of the script that was automatically added during transpilation
      // Assume it will be properly reported elsewhere and do not report it here.
      console.warn(
        "HIDDEN",
        message,
        severity,
        uri,
        startLine,
        startCharacter,
        endLine,
        endCharacter
      );
      return null;
    }
    if (
      startLine > endLine ||
      (startLine === endLine && startCharacter > endCharacter)
    ) {
      // This error range is invalid.
      console.warn(
        "HIDDEN",
        message,
        severity,
        uri,
        startLine,
        startCharacter,
        endLine,
        endCharacter
      );
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
}

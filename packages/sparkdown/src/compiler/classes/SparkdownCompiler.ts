// Side-effect import to stabilize the inkjs engine module load order.
// `engine/Container.ts` ↔ `engine/Value.ts` ↔ `engine/Object.ts` form a
// dependency cycle; if `Object.ts` loads first, `Value.ts` resolves
// `InkObject` as undefined when extending it. Forcing `Container.ts` to be the
// entry point evaluates the cycle in a working order. This used to happen
// implicitly via the (now-removed) `inkjs/compiler/Compiler` import; keep it
// explicit so consumers of SparkdownCompiler don't hit a TDZ crash.
import "../../inkjs/engine/Container";
import { parseSparkle } from "@impower/sparkle-screen-renderer/src/parser/parser";
import { getStack } from "@impower/textmate-grammar-tree/src/tree/utils/getStack";
import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";
import { BUILTINS_PRELUDE } from "../builtins/builtins";
import { IFileHandler } from "../../inkjs/compiler/IFileHandler";
import { ErrorType } from "../../inkjs/compiler/Parser/ErrorType";
import { Choice } from "../../inkjs/compiler/Parser/ParsedHierarchy/Choice";
import { ExternalDeclaration } from "../../inkjs/compiler/Parser/ParsedHierarchy/Declaration/ExternalDeclaration";
import { Divert } from "../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { FlowBase } from "../../inkjs/compiler/Parser/ParsedHierarchy/Flow/FlowBase";
import { Gather } from "../../inkjs/compiler/Parser/ParsedHierarchy/Gather/Gather";
import { Identifier } from "../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { IncludedFile } from "../../inkjs/compiler/Parser/ParsedHierarchy/IncludedFile";
import { Knot } from "../../inkjs/compiler/Parser/ParsedHierarchy/Knot";
import { ParsedObject } from "../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { ReturnType } from "../../inkjs/compiler/Parser/ParsedHierarchy/ReturnType";
import { Statement } from "../../inkjs/compiler/Parser/ParsedHierarchy/Statement";
import { Stitch } from "../../inkjs/compiler/Parser/ParsedHierarchy/Stitch";
import { Story } from "../../inkjs/compiler/Parser/ParsedHierarchy/Story";
import { Tag } from "../../inkjs/compiler/Parser/ParsedHierarchy/Tag";
import { Text } from "../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { TunnelOnwards } from "../../inkjs/compiler/Parser/ParsedHierarchy/TunnelOnwards";
import { Weave } from "../../inkjs/compiler/Parser/ParsedHierarchy/Weave";
import { ControlCommand } from "../../inkjs/engine/ControlCommand";
import { DebugMetadata } from "../../inkjs/engine/DebugMetadata";
import { SourceMetadata } from "../../inkjs/engine/Error";
import { InkObject } from "../../inkjs/engine/Object";
import { SimpleJson } from "../../inkjs/engine/SimpleJson";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";
import { asOrNull } from "../../inkjs/engine/TypeAssertion";
import { StringValue } from "../../inkjs/engine/Value";
import { VariableAssignment } from "../../inkjs/engine/VariableAssignment";
import { SparkDeclaration } from "../types/SparkDeclaration";
import { DiagnosticSeverity, SparkDiagnostic } from "../types/SparkDiagnostic";
import { SparkdownCompilerConfig } from "../types/SparkdownCompilerConfig";
import { SparkdownCompilerState } from "../types/SparkdownCompilerState";
import { SparkdownNodeName } from "../types/SparkdownNodeName";
import { SparkProgram } from "../types/SparkProgram";
import { cloneBuiltinStructs } from "../utils/cloneBuiltinStructs";
import { formatList } from "../utils/formatList";
import { getExpectedSelectorTypes } from "../utils/getExpectedSelectorTypes";
import { getPossibleStringIdentifiers } from "../utils/getPossibleStringIdentifiers";
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
import {
  RemovedCompilerFileMessage,
  RemovedCompilerFileParams,
} from "./messages/RemovedCompilerFileMessage";
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
// Synthetic URI for the bundled builtins prelude (used as the file URI when the
// prelude is compiled once to seed the builtins cache; see getCompiledPrelude).
const BUILTINS_PRELUDE_URI = "file:///__builtins__.sd";

// The builtins prelude (builtins.sd) compiles to the same context + runtime
// every time — its source is a constant. Compiling it as part of EVERY program
// added ~110ms per compile (untenable for live LSP keystrokes). So compile it
// exactly ONCE, process-wide, and reuse:
//   - `context`  is merged into each program as the builtins base layer (the
//     role the legacy JS `populateBuiltins` played), so authored defines that
//     reuse a builtin name override it in place.
//   - `compiled` is the prelude's runtime story JSON, kept for the engine to
//     instantiate the builtin __def tables once (rather than baking them into
//     every program.compiled, which would also bloat unrelated compiled output).
// The prelude is NOT included in any program's parsed story — keeping the cache
// the single point where it is compiled and keeping program.compiled clean.
let _cachedPrelude: { context: Record<string, any>; compiled: unknown } | null =
  null;

function getCompiledPrelude(): {
  context: Record<string, any>;
  compiled: unknown;
} {
  if (_cachedPrelude) {
    return _cachedPrelude;
  }
  // Compile the prelude in isolation. `useBuiltinsPrelude` MUST be false here so
  // this compile doesn't recurse into itself (mergePreludeContext → here →
  // mergePreludeContext → …, never reaching the `_cachedPrelude =` assignment →
  // unbounded recursion/allocation). Set it explicitly rather than relying on the
  // class default, which is now `true`. The prelude defines every builtin it
  // needs, so no JS builtins are required.
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: false,
    definitions: { builtins: {} as any },
    files: [
      {
        uri: BUILTINS_PRELUDE_URI,
        type: "script",
        name: "__builtins__",
        ext: "sd",
        text: BUILTINS_PRELUDE,
        version: 0,
        languageId: LANGUAGE_NAME,
      } as any,
    ],
  });
  const result = compiler.compile({
    textDocument: { uri: BUILTINS_PRELUDE_URI },
  });
  _cachedPrelude = {
    context: result.program.context ?? {},
    compiled: result.program.compiled,
  };
  return _cachedPrelude;
}
const FILE_TYPES = GRAMMAR_DEFINITION.fileTypes;
const VIEW_DEFINE_TYPES = GRAMMAR_DEFINITION.variables.VIEW_DEFINE_TYPES || [];
const STYLING_DEFINE_TYPES =
  GRAMMAR_DEFINITION.variables.STYLING_DEFINE_TYPES || [];

export type SparkdownCompilerEvents = {
  "compiler/didCompile": (
    params: CompiledProgramParams & { story?: RuntimeStory },
  ) => void;
  "compiler/didSelect": (params: SelectedCompilerDocumentParams) => void;
  "compiler/didRemove": (params: RemovedCompilerFileParams) => void;
};

export class SparkdownCompiler {
  protected _profilerId?: string;
  get profilerId() {
    return this._profilerId;
  }
  set profilerId(value: string | undefined) {
    this._profilerId = value;
  }

  protected _config: SparkdownCompilerConfig = { useBuiltinsPrelude: true };
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

  protected _events: {
    [K in keyof SparkdownCompilerEvents]: Set<SparkdownCompilerEvents[K]>;
  } = {
    "compiler/didCompile": new Set(),
    "compiler/didSelect": new Set(),
    "compiler/didRemove": new Set(),
  };

  addEventListener<K extends keyof SparkdownCompilerEvents>(
    event: K,
    listener: SparkdownCompilerEvents[K],
  ) {
    this._events[event].add(listener);
  }

  removeEventListener<K extends keyof SparkdownCompilerEvents>(
    event: K,
    listener: SparkdownCompilerEvents[K],
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
        this._config.definitions.builtins,
      );
      profile("end", this._profilerId, "cloneBuiltinStructs");
    }
    if (
      config.definitions?.optionals !== undefined &&
      config.definitions?.optionals !== this._config.definitions?.optionals
    ) {
      this._config.definitions ??= {};
      this._config.definitions.optionals = config.definitions.optionals;
    }
    if (
      config.definitions?.schemas !== undefined &&
      config.definitions?.schemas !== this._config.definitions?.schemas
    ) {
      this._config.definitions ??= {};
      this._config.definitions.schemas = config.definitions.schemas;
    }
    if (
      config.definitions?.descriptions !== undefined &&
      config.definitions?.descriptions !==
        this._config.definitions?.descriptions
    ) {
      this._config.definitions ??= {};
      this._config.definitions.descriptions = config.definitions.descriptions;
    }
    if (
      config.skipValidation !== undefined &&
      config.skipValidation !== this._config.skipValidation
    ) {
      this._config.skipValidation = config.skipValidation;
    }
    if (
      config.useBuiltinsPrelude !== undefined &&
      config.useBuiltinsPrelude !== this._config.useBuiltinsPrelude
    ) {
      this._config.useBuiltinsPrelude = config.useBuiltinsPrelude;
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
        },
      );
      this._documents.profilerId = this._profilerId;
    }
    if (config.files !== undefined && config.files !== this._config.files) {
      this._config.files = config.files;
      for (const file of config.files) {
        if (
          file.type === "script" &&
          file.version !== undefined &&
          file.languageId !== undefined
        ) {
          this.documents.add({
            textDocument: {
              uri: file.uri,
              languageId: file.languageId!,
              version: file.version,
              text: file.text || "",
            },
          });
        }
        this.addFile({ file });
      }
    }
    return LANGUAGE_NAME;
  }

  addFile(params: AddCompilerFileParams) {
    const result = this.files.add(params);
    const file = params.file;
    if (
      file.type === "script" &&
      file.version !== undefined &&
      file.languageId !== undefined
    ) {
      this.documents.add({
        textDocument: {
          uri: file.uri,
          text: file.text || "",
          version: file.version,
          languageId: file.languageId,
        },
      });
    }
    return result;
  }

  updateFile(params: UpdateCompilerFileParams) {
    const file = params.file;
    if (
      file.type === "script" &&
      file.version !== undefined &&
      file.languageId !== undefined
    ) {
      this.documents.set({
        textDocument: {
          uri: file.uri,
          text: file.text! || "",
          version: file.version,
          languageId: file.languageId,
        },
      });
    }
    return this.files.update(params);
  }

  updateDocument(params: UpdateCompilerDocumentParams) {
    return this.documents.update(params);
  }

  removeFile(params: RemoveCompilerFileParams) {
    this.files.remove(params);
    const file = params.file;
    const removed = this.documents.remove({ textDocument: { uri: file.uri } });
    this._events[RemovedCompilerFileMessage.method].forEach((l) => {
      l?.({ textDocument: { uri: file.uri } });
    });
    return removed;
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
      source: SourceMetadata | null,
      tags?: number[],
    ) => {
      const severity =
        type === ErrorType.Error
          ? DiagnosticSeverity.Error
          : type === ErrorType.Warning
            ? DiagnosticSeverity.Warning
            : type === ErrorType.Hint
              ? DiagnosticSeverity.Hint
              : DiagnosticSeverity.Information;
      // Surface inkjs's `ExportRuntime` diagnostics that have proper
      // source metadata from the parsed object's DebugMetadata.
      // Diagnostics without `filePath` are silently dropped: they're
      // almost always emitted for synthesized parsed objects (e.g.
      // sparkdown's `const`-as-`store` faux constants, locally-scoped
      // `local x` temps in nested blocks) that have no real source
      // Filter the one remaining known-spurious diagnostic class:
      // sparkdown's `local x` block-scope creates a new temp in each
      // nested scope, but inkjs's `CheckForNamingCollisions` walks a
      // single flat scope and sees them as duplicates ("A temp named
      // `x` already exists on null"). Emitting that as a user-facing
      // error would be noise — sparkdown's `local` IS supposed to
      // shadow. See docs/runtime/DIVERGENCES.md.
      //
      // (The previous "A variable must be initialized to a number,
      // string, boolean, constant" filter was needed when `const`
      // lowered to a global `store`; now that `const` lowers to a
      // real `ConstantDeclaration`, that diagnostic no longer fires
      // spuriously.)
      if (/A temp named `\w+` already exists on null/.test(message)) {
        return;
      }
      // Fall back to the document URI when the diagnostic source
      // lacks `filePath`. Many inkjs errors (e.g. "target not found")
      // pass a freshly-constructed Identifier rather than the parsed
      // node with stamped DebugMetadata, so source-side filePath is
      // null and the diagnostic would otherwise be silently dropped.
      const diagUri = source?.filePath || uri;
      const startLine = source ? source.startLineNumber - 1 : 0;
      const startCharacter = source ? source.startCharacterNumber - 1 : 0;
      const endLine = source ? source.endLineNumber - 1 : 0;
      const endCharacter = source ? source.endCharacterNumber - 1 : 0;
      const docDiagnostic = this.getDiagnostic(
        message,
        severity,
        diagUri,
        startLine,
        startCharacter,
        endLine,
        endCharacter,
        tags,
      );
      if (docDiagnostic) {
        program.diagnostics ??= {};
        program.diagnostics[diagUri] ??= [];
        program.diagnostics[diagUri].push(docDiagnostic);
        if (docDiagnostic.relatedInformation) {
          for (const info of docDiagnostic.relatedInformation) {
            const relatedUri = info.location.uri;
            if (relatedUri && relatedUri !== diagUri) {
              program.diagnostics[relatedUri] ??= [];
              program.diagnostics[relatedUri].push(docDiagnostic);
            }
          }
        }
      }
    };

    // `currentParentUri` is the URI of the file whose `include` chunks
    // are currently being resolved. Mutated by `parseIncrementally`
    // before each recursive descent and restored after. Without this,
    // the closure captures the outermost `uri` (main file from
    // `compile()`) and resolves every `include` against THAT — breaking
    // any nested include path. E.g. `main.sd` → `includes/a.sd` →
    // `b.sd` would try to find `b.sd` next to `main.sd` instead of
    // next to `a.sd` where the import was actually written.
    const fileResolutionState = { currentParentUri: uri };
    const fileHandler: IFileHandler = {
      ResolveInkFilename: (filename: string): string => {
        const filePath = this.resolveFile(
          fileResolutionState.currentParentUri,
          filename,
        );
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
    // Stash on `state` so the recursive `parseIncrementally` can update
    // `currentParentUri` before each include descent.
    state.fileResolutionState = fileResolutionState;

    // Seed builtins as the base layer BEFORE parsing this file's chunks (so an
    // authored define reusing a builtin name overrides it in place, preserving
    // the builtin key order). In prelude mode, merge the once-compiled prelude
    // context; otherwise use the legacy JS populateBuiltins.
    if (this._config.useBuiltinsPrelude) {
      this.mergePreludeContext(program);
    } else {
      this.populateBuiltins(program);
    }

    try {
      profile("start", this._profilerId, "ink/parse", uri);
      const parsedStory = this.parseIncrementally(
        uri,
        fileHandler,
        false,
        state,
        program,
        onDiagnostic,
      );
      profile("end", this._profilerId, "ink/parse", uri);
      // Plumb `countAllVisits` through to the parsed Story before
      // `ExportRuntime` runs — `FlowBase.GenerateRuntimeObject` reads
      // `this.story.countAllVisits` to decide whether to set
      // `Container.visitsShouldBeCounted = true` on every flow container.
      // See `CompileProgramParams.countAllVisits` for rationale.
      if (params.countAllVisits) {
        parsedStory.countAllVisits = true;
      }
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
      this.validateReferences(program);
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
      source: SourceMetadata | null,
      tags?: number[],
    ) => void,
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
      lineNumberOffset: number,
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
            version,
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
                version,
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
        run,
        diagnostics,
        content,
        context,
        defaultDefinitions,
        uuid,
        hoistedKnots,
      } = cur.value.type;
      const lineNumberOffset = document?.lineAt(cur.from) ?? 0;
      // Anonymous function literals lowered at chunk-top-level (i.e.
      // outside any enclosing function definition) produce synthetic
      // FlowBase objects that need to land at the story's top level.
      // Anonymous fns lowered INSIDE another function body attach to
      // that function as subFlows instead — they never reach this
      // list. Both Knots (legacy path) and Functions (new path) are
      // accepted.
      if (hoistedKnots) {
        remapContent(hoistedKnots, lineNumberOffset);
        for (const k of hoistedKnots) {
          if (k instanceof FlowBase) {
            topLevelFlowBaseObjs.push(k);
          }
        }
      }
      if (include) {
        if (include) {
          // Resolve the include relative to THIS file's URI, not the
          // outermost compile-entry URI. Stash + restore around the
          // recursive descent so child includes see this file's URI as
          // their resolution base.
          const previousParentUri =
            state.fileResolutionState?.currentParentUri ?? uri;
          if (state.fileResolutionState) {
            state.fileResolutionState.currentParentUri = uri;
          }
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
                onDiagnostic,
              )
            : null;
          if (state.fileResolutionState) {
            state.fileResolutionState.currentParentUri = previousParentUri;
          }
          topLevelIncludedFileObjs.push(new IncludedFile(includedStory));
        }
      }
      if (run) {
        // `run "path"` — load `${path}.luau`, wrap its body in a
        // function, splice a call to the function at this position,
        // and hoist the function declaration to the end of the
        // parent program. Uses the same `IncludedFile` plumbing as
        // `include`, which already separates flow declarations
        // (knots/functions — appended at end) from non-flow content
        // (top-level statements — spliced inline). See
        // `Story.PreProcessTopLevelObjects` for the split logic.
        const previousParentUri =
          state.fileResolutionState?.currentParentUri ?? uri;
        if (state.fileResolutionState) {
          state.fileResolutionState.currentParentUri = uri;
        }
        const luauFilename = `${run}.luau`;
        let resolvedFilePath: string | null = null;
        try {
          resolvedFilePath = fileHandler.ResolveInkFilename(luauFilename);
        } catch {}
        // 1-based line/character — `onDiagnostic` subtracts 1 to
        // produce 0-based values that pass `getDiagnostic`'s
        // `startCharacter < 0` filter.
        const sourceMetadata: SourceMetadata = {
          fileName,
          filePath: uri,
          startLineNumber: lineNumberOffset + 1,
          endLineNumber: lineNumberOffset + 1,
          startCharacterNumber: 1,
          endCharacterNumber: 1,
        };
        if (!resolvedFilePath) {
          onDiagnostic(
            `Could not find '${luauFilename}' for 'run' statement.`,
            ErrorType.Error,
            sourceMetadata,
          );
        } else if (
          state.fileResolutionState?.runStack?.includes(resolvedFilePath)
        ) {
          onDiagnostic(
            `'run' cycle detected: ${[
              ...(state.fileResolutionState.runStack ?? []),
              resolvedFilePath,
            ].join(" -> ")}`,
            ErrorType.Error,
            sourceMetadata,
          );
        } else {
          const rawContent = fileHandler.LoadInkFileContents(resolvedFilePath);
          // Sanitize: identifier-safe name derived from the path so
          // two `run` statements pointing at the same file collide
          // into the same wrapper knot (cheap deduping). Sparkdown
          // identifiers are `[A-Za-z_][A-Za-z0-9_]*`.
          const sanitized = run.replace(/[^A-Za-z0-9_]/g, "_");
          const wrapperName = `__run_${sanitized}`;
          // The wrapper has TWO parts:
          //   `& <wrapperName>()`  → top-level statement, gets
          //                          spliced inline by IncludedFile
          //                          processing.
          //   `function <wrapperName>() <content> end`
          //                       → flow declaration, hoisted to
          //                          end of parent program.
          // Together: the parent calls the wrapper at the run-site,
          // and the wrapper definition lives at the end where it
          // doesn't terminate the parent's main flow.
          const wrapped = `& ${wrapperName}()\nfunction ${wrapperName}()\n${rawContent}\nend\n`;
          // Stash the wrapped content under a virtual URI derived
          // from the .luau file's URI. The `?run` query suffix
          // keeps it distinct from any raw .luau document registered
          // separately. The compiler treats it as a normal `.sd`
          // source from this point on.
          const virtualUri = `${resolvedFilePath}?run=${wrapperName}`;
          this.documents.add({
            textDocument: {
              uri: virtualUri,
              languageId: "sparkdown",
              version: 1,
              text: wrapped,
            },
          });
          if (state.fileResolutionState) {
            state.fileResolutionState.runStack ??= [];
            state.fileResolutionState.runStack.push(resolvedFilePath);
          }
          let runStory: ReturnType<typeof this.parseIncrementally> | null = null;
          try {
            runStory = this.parseIncrementally(
              virtualUri,
              fileHandler,
              true,
              state,
              program,
              onDiagnostic,
            );
          } finally {
            if (state.fileResolutionState?.runStack) {
              state.fileResolutionState.runStack.pop();
            }
          }
          topLevelIncludedFileObjs.push(new IncludedFile(runStory));
        }
        if (state.fileResolutionState) {
          state.fileResolutionState.currentParentUri = previousParentUri;
        }
      }
      if (diagnostics) {
        for (const diagnostic of diagnostics) {
          if (diagnostic.source) {
            const offsetSource: SourceMetadata = { ...diagnostic.source };
            offsetSource.startLineNumber += lineNumberOffset;
            offsetSource.endLineNumber += lineNumberOffset;
            offsetSource.fileName ??= fileName;
            offsetSource.filePath ??= uri;
            onDiagnostic(
              diagnostic.message,
              diagnostic.severity,
              offsetSource,
              diagnostic.tags,
            );
          }
        }
      }
      if (content) {
        remapContent(content, lineNumberOffset);
        const flow = content[0];
        if (flow) {
          if (flow instanceof Knot) {
            // If the lowerer already populated a rootWeave with body content
            // (e.g. function definitions whose body lives inside the same
            // chunk), preserve it. Scene/Branch declarations leave _rootWeave
            // unset so the staged-chunk pattern still creates an empty weave
            // for subsequent body chunks to attach to.
            const rootWeave = flow._rootWeave ?? new Weave([]);
            rootWeave.debugMetadata = flow.debugMetadata;
            const knot = new Knot(
              flow.identifier!,
              [],
              flow.args ?? [],
              flow.isFunction,
            );
            knot.debugMetadata = flow.debugMetadata;
            knot._rootWeave = rootWeave;
            knot.AddContent(rootWeave);
            // Preserve nested subFlows that the lowerer attached (e.g.
            // anonymous-function literals and nested named function
            // definitions lower to `Function` subFlows so they live at
            // their lexical position instead of hoisting to top-level).
            // Re-add them as content so the runtime traversal sees them.
            for (const [subName, subFlow] of flow._subFlowsByName) {
              knot._subFlowsByName.set(subName, subFlow);
              knot.AddContent(subFlow);
            }
            topLevelFlowBaseObjs.push(knot);
            topLevelContent.push(knot);
          } else if (flow instanceof Stitch) {
            const rootWeave = new Weave([]);
            const stitch = new Stitch(
              flow.identifier!,
              [],
              flow.args ?? [],
              flow.isFunction,
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
          } else if (flow instanceof ExternalDeclaration) {
            const weave = new Weave([flow]);
            topLevelWeaveObjs.push(weave);
            topLevelContent.push(weave);
          } else if (flow instanceof Weave) {
            // This chunk's body weave is about to be UNWRAPPED — its children
            // are re-parented directly under the closest existing weave (e.g.
            // a scene's rootWeave) below. Children that carry no OWN debug
            // metadata only have a source line by INHERITING this weave's; once
            // re-parented they'd instead inherit the destination weave's line
            // (the scene-header line), collapsing every body line of the scene
            // onto that header — so the whole scene's pathLocations resolve to
            // one line and its content becomes unpreviewable (action/montage
            // scenes like TEASER lost ALL per-line locations; action lines in
            // dialogue scenes routed to a later beat). Carry this weave's
            // (already chunk-offset) metadata down onto its OWN-metadata-less
            // children first, mirroring `appendBlockContent`. Must guard on
            // `ownDebugMetadata` (NOT the inheriting `debugMetadata` getter,
            // which returns this weave's value and would skip everything).
            // Restrict the carry-down to DISPLAY leaves (Text / Tag) — the
            // content that needs per-line `pathLocations`. Stamping other
            // child types (e.g. VariableAssignment, scope/flow ControlCommands)
            // would give them an own source line they didn't have, which
            // perturbs declaration-collection and scope/collision analysis
            // (block-scoped `local` shadowing, scene/function call
            // restrictions) — a whitelist keeps the fix to its purpose.
            if (flow.ownDebugMetadata) {
              for (const child of flow.content) {
                if (
                  !child.ownDebugMetadata &&
                  (child instanceof Text || child instanceof Tag)
                ) {
                  child.debugMetadata = flow.ownDebugMetadata;
                }
              }
            }
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
      if (defaultDefinitions) {
        // Copy default definitions to state
        for (const [type, struct] of Object.entries(defaultDefinitions)) {
          state.defaultDefinitions ??= {};
          state.defaultDefinitions[type] ??= struct;
        }
      }
      cur.next();
    }

    // Auto-terminate non-function scenes / branches whose body doesn't end
    // with an explicit terminator. Sparkdown narrative flows (`scene` /
    // `branch`) are story content — running off the end without a
    // `-> DONE` / `-> END` / `->->` causes the runtime to halt with a
    // diagnostic. Authors almost always WANT `-> DONE` at the natural
    // end of a scene, so we synthesize it when missing. This mirrors
    // the existing `isRootStory` branch in `FlowBase.
    // SplitWeaveAndSubFlowContent` which appends `Gather + Divert(Done)`
    // to the top-level story for the same reason.
    //
    // Skipped for:
    //   - Functions (`isFunction === true`) — they have explicit `return`
    //     semantics; falling off the end is handled by the runtime as an
    //     implicit `return Void`.
    //   - Flows whose `_rootWeave` already ends with a `Divert` /
    //     `TunnelOnwards` / `ReturnType` — author already terminated.
    //
    // Recurses into `subFlowsByName` so nested branches (sparkdown's
    // `branch X` declared inside a `scene Y`) get the same treatment;
    // those don't appear in `topLevelFlowBaseObjs` because the chunk
    // dispatcher folds them under their parent knot.
    const autoTerminate = (flow: FlowBase): void => {
      if (!flow.isFunction) {
        const rootWeave = flow._rootWeave;
        if (rootWeave) {
          const last = rootWeave.content[rootWeave.content.length - 1];
          const alreadyTerminates =
            last instanceof Divert ||
            last instanceof TunnelOnwards ||
            last instanceof ReturnType;
          if (!alreadyTerminates) {
            const doneDivert = new Divert([Identifier.Done()]);
            // Inherit debug metadata from the enclosing flow so any
            // diagnostic pointing at the synthesized divert lands on
            // the scene/branch declaration line rather than at offset 0.
            doneDivert.debugMetadata = flow.debugMetadata;
            rootWeave.AddContent(doneDivert);
          }
        }
      }
      for (const sub of flow.subFlowsByName.values()) {
        autoTerminate(sub);
      }
    };
    for (const flow of topLevelFlowBaseObjs) {
      autoTerminate(flow);
    }

    const combinedParsedStory = new Story(
      [
        ...topLevelIncludedFileObjs,
        ...topLevelWeaveObjs.flatMap((w) => w.content),
        ...topLevelFlowBaseObjs,
      ],
      isInclude,
    );

    return combinedParsedStory;
  }

  populateLocations(program: SparkProgram, obj: InkObject) {
    // Prefer the object's OWN metadata when set — it's the most
    // specific source range. Fall back to inherited metadata (walks
    // parent chain) so every path in the bytecode gets a location
    // entry, even when individual ControlCommands inside a parent
    // Container weren't stamped by the lowerer. Inherited entries
    // are coarser (point at the enclosing statement or function),
    // but they let runtime consumers (like the conformance harness's
    // `error()` formatter) recover at least the enclosing-scope
    // line from a deeply nested ControlCommand's path.
    //
    // KNOWN LIMITATION (worth a focused investigation): for Luau-
    // lowered function bodies, every ControlCommand inside the
    // function's runtime container ends up with the SAME stamped
    // metadata — the function-definition node's range, not the
    // individual statement's. The lowerer's per-statement
    // `stampDebugMetadata` call sets it on the top-level
    // ParsedObjects, but the metadata-propagation pass at runtime
    // generation (`ParsedObject.runtimeObject` getter) appears to
    // overwrite or collapse to the enclosing function's metadata
    // for inner items. Until that's untangled, the `error()`
    // formatter reports the enclosing function's start line rather
    // than the actual call site.
    const metadata = obj?.ownDebugMetadata ?? obj?.debugMetadata;
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
                  !p.includes("$"),
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
                  }) - 1,
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
                VIEW_DEFINE_TYPES.includes(type) ||
                STYLING_DEFINE_TYPES.includes(type)
              ) {
                const stack = getStack<SparkdownNodeName>(tree, cur.from, -1);
                const declarationNode = stack.find(
                  (n) =>
                    n.name === "DefineViewDeclaration" ||
                    n.name === "DefineStylingDeclaration",
                );
                if (declarationNode) {
                  const name = doc.read(cur.from, cur.to);
                  const declaration = doc.read(
                    declarationNode.from,
                    declarationNode.to,
                  );
                  const node = parseSparkle(declaration)[0];
                  if (node) {
                    program.ui ??= {};
                    const key = type as keyof typeof program.ui;
                    program.ui![key] ??= {};
                    program.ui[key]![name] = node;
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
        },
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
    this.populateImplicitDefs(program);
    this.populateDefinedDefaultProperties(state, program);
    profile("end", this._profilerId, "buildContext", uri);
  }

  /** Merge the once-compiled builtins prelude context into `program.context` as
   *  the base layer (the role the legacy JS `populateBuiltins` filled). Runs
   *  before this file's own chunks populate context, so an authored define
   *  reusing a builtin name overrides it in place. Structs are deep-cloned so
   *  the shared cache can't be mutated by the per-program `$default` merge or
   *  asset inference. */
  mergePreludeContext(program: SparkProgram) {
    const uri = program.uri;
    profile("start", this._profilerId, "mergePreludeContext", uri);
    const { context } = getCompiledPrelude();
    program.context ??= {};
    for (const [type, structs] of Object.entries(context)) {
      program.context[type] ??= {};
      for (const [name, struct] of Object.entries(structs)) {
        program.context[type][name] = structuredClone(struct);
      }
    }
    profile("end", this._profilerId, "mergePreludeContext", uri);
  }

  populateBuiltins(program: SparkProgram) {
    const uri = program.uri;
    profile("start", this._profilerId, "populateBuiltins", uri);
    for (const [type, structs] of Object.entries(this._builtinStructs)) {
      for (const [name, struct] of Object.entries(structs)) {
        program.context ??= {};
        program.context[type] ??= {};
        program.context[type][name] = struct;
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
      }
    }
    profile("end", this._profilerId, "populateAssets", uri);
  }

  populateImplicitDefs(program: SparkProgram) {
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
    profile("end", this._profilerId, "populateImplicitDefs", uri);
  }

  populateDefinedDefaultProperties(
    state: SparkdownCompilerState,
    program: SparkProgram,
  ) {
    const uri = program.uri;
    profile("start", this._profilerId, "populateDefinedDefaultProperties", uri);
    // `define X as <type>` is inheritance: X must inherit <type>'s default
    // property values. The type's effective default lives in context under the
    // reserved `$default` name (the builtin placed by `populateBuiltins`,
    // possibly overridden by an authored `define $default as <type>`). Deep-
    // merge it UNDER every authored instance of that type so omitted (incl.
    // nested) properties fall back to the default — e.g. an authored
    // `define pan_right as animation with keyframes = {...}` (no `timing`
    // block) inherits the animation type's `timing` (delay/duration/easing/
    // fill/…), and a partial `timing = { duration = "3s" }` keeps the other
    // timing fields instead of dropping them.
    //
    // (The legacy `state.defaultDefinitions` source for this merge was never
    // populated anywhere, so this inheritance previously didn't happen and
    // consumers had to re-specify type defaults themselves.)
    const context = program.context;
    if (context) {
      for (const structs of Object.values(context)) {
        const defaultStruct = (structs as Record<string, any>)?.["$default"];
        if (!defaultStruct || typeof defaultStruct !== "object") {
          continue;
        }
        for (const [name, struct] of Object.entries(structs)) {
          // Reserved meta entries ($default, $optional, $optional:<name>,
          // $schema, $recursive, …) describe the type, not instances — never
          // merge into them.
          if (name.startsWith("$")) {
            continue;
          }
          if (!struct || typeof struct !== "object" || Array.isArray(struct)) {
            continue;
          }
          (structs as Record<string, any>)[name] = this.inheritDefaults(
            defaultStruct,
            struct,
          );
        }
      }
    }
    profile("end", this._profilerId, "populateDefinedDefaultProperties", uri);
  }

  /** Deep-merge `override` ONTO `base`: `override` wins, `base` fills gaps, and
   *  nested plain objects merge recursively (arrays and primitives are replaced
   *  wholesale by `override`). Used to inherit a type's `$default` into an
   *  authored define without clobbering sibling fields of nested objects. */
  inheritDefaults(base: any, override: any): any {
    if (
      base == null ||
      typeof base !== "object" ||
      Array.isArray(base) ||
      override == null ||
      typeof override !== "object" ||
      Array.isArray(override)
    ) {
      return override;
    }
    const result: Record<string, any> = {};
    // Inherit `base`'s properties EXCEPT reserved `$`-prefixed metadata
    // ($type / $name / $recursive / …). Those describe identity and type-level
    // behavior and must come from the instance itself — leaking `$default`'s
    // (e.g. `$recursive: true`, or `$name: "$default"`) onto every instance
    // would corrupt them. The instance carries its own `$type`/`$name`, which
    // the override pass below preserves.
    for (const [k, bv] of Object.entries(base)) {
      if (k.startsWith("$")) {
        continue;
      }
      result[k] = bv;
    }
    for (const [k, v] of Object.entries(override)) {
      const bv = (base as Record<string, any>)[k];
      if (
        bv != null &&
        typeof bv === "object" &&
        !Array.isArray(bv) &&
        v != null &&
        typeof v === "object" &&
        !Array.isArray(v)
      ) {
        result[k] = this.inheritDefaults(bv, v);
      } else {
        result[k] = v;
      }
    }
    return result;
  }

  getPropertyPath(
    program: SparkProgram,
    structType: string,
    structProperty: string,
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
    program: SparkProgram,
    declaration: SparkDeclaration | undefined,
  ) {
    const structType = declaration?.type;
    const structName = declaration?.name;
    const structProperty = declaration?.property;
    if (structType && structProperty) {
      const expectedPropertyPath = this.getPropertyPath(
        program,
        structType,
        structProperty,
      );
      const expectedPropertyValue = readProperty(
        expectedPropertyPath,
        program.context?.[structType]?.["$default"],
        program.context?.[structType]?.[`$optional:${structName}`],
        program.context?.[structType]?.["$optional"],
        this._config?.definitions?.optionals?.[structType]?.["$optional"],
      );
      return expectedPropertyValue;
    }
    return undefined;
  }

  getSchemaPropertyValues(
    program: SparkProgram,
    declaration: SparkDeclaration | undefined,
  ) {
    const structType = declaration?.type;
    const structName = declaration?.name;
    const structProperty = declaration?.property;
    if (structType && structProperty) {
      const expectedPropertyPath = this.getPropertyPath(
        program,
        structType,
        structProperty,
      );
      const schemaPropertyValues = readProperty(
        expectedPropertyPath,
        program.context?.[structType]?.[`$schema:${structName}`],
        program.context?.[structType]?.["$schema"],
        this._config?.definitions?.schemas?.[structType]?.["$schema"],
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
                message: {
                  value: diagnostic.message,
                  kind: "markdown",
                },
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

  validateReferences(program: SparkProgram) {
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
                  const message = `Cannot declare ${reference.declaration} named \`${symbolId}\`:\nConflicts with builtin type \`${symbolId}\``;
                  const range = doc.range(cur.from, cur.to);
                  program.diagnostics ??= {};
                  program.diagnostics[uri] ??= [];
                  program.diagnostics[uri].push({
                    range,
                    severity: DiagnosticSeverity.Error,
                    message: {
                      value: message,
                      kind: "markdown",
                    },
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
            const possibleStringIdentifiers = getPossibleStringIdentifiers(
              program,
              declaration,
              this._config,
            );
            const expectedSelectorTypes = getExpectedSelectorTypes(
              program,
              declaration,
              this._config,
            );
            if (expectedSelectorTypes.includes("color")) {
              const range = doc.range(cur.from, cur.to);
              program.colorAnnotations ??= {};
              program.colorAnnotations[uri] ??= [];
              program.colorAnnotations[uri].push(range);
            }
            const selector = reference.selectors?.[0];
            // Validate that reference resolves to existing an struct
            let found: any = undefined;
            for (const s of reference.selectors) {
              const [resolved] = resolveSelector<any>(
                program,
                s,
                expectedSelectorTypes,
              );
              if (resolved) {
                found = resolved;
              }
            }
            if (
              reference.stylingStringIdentifier &&
              selector?.name &&
              possibleStringIdentifiers.includes(selector?.name)
            ) {
              // Valid styling string identifier
            } else if (found) {
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
                  expectedSelectorTypes,
                )}`;
                const range = doc.range(cur.from, cur.to);
                program.diagnostics ??= {};
                program.diagnostics[uri] ??= [];
                program.diagnostics[uri].push({
                  range,
                  severity: DiagnosticSeverity.Warning,
                  message: {
                    value: message,
                    kind: "markdown",
                  },
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
              const validDescription =
                selector && (selector.displayName || selector.name)
                  ? selector.displayType
                    ? `${selector.displayType} named \`${
                        selector.displayName || selector.name
                      }\``
                    : selector.types && selector.types.length > 0
                      ? `${selector.types[0]} named \`${
                          selector.displayName || selector.name
                        }\``
                      : expectedSelectorTypes &&
                          expectedSelectorTypes.length > 0
                        ? `${expectedSelectorTypes[0]} named \`${
                            selector.displayName || selector.name
                          }\``
                        : `\`${selector.displayName || selector.name}\``
                  : selector && selector.types
                    ? `type named \`${selector.types[0]}\``
                    : `type`;
              const type =
                selector?.displayType ||
                selector?.types?.[0] ||
                expectedSelectorTypes[0];
              const invalidStylingStringIdentifier =
                reference.stylingStringIdentifier && !type;
              const message = invalidStylingStringIdentifier
                ? `Invalid property value`
                : `Cannot find ${validDescription}`;
              const severity = invalidStylingStringIdentifier
                ? DiagnosticSeverity.Error
                : DiagnosticSeverity.Warning;
              const range = doc.range(cur.from, cur.to);
              program.diagnostics ??= {};
              program.diagnostics[uri] ??= [];
              program.diagnostics[uri].push({
                range,
                severity,
                message: {
                  value: message,
                  kind: "markdown",
                },
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
                const definedPropertyValue = readProperty(
                  structProperty,
                  program.context?.[structType]?.[structName],
                );
                if (definedPropertyValue !== undefined) {
                  const expectedPropertyValue = this.getExpectedPropertyValue(
                    program,
                    declaration,
                  );
                  if (expectedPropertyValue != null) {
                    if (
                      typeof definedPropertyValue !==
                      typeof expectedPropertyValue
                    ) {
                      const schemaPropertyValues = this.getSchemaPropertyValues(
                        program,
                        declaration,
                      );
                      const isSchemaSupportedScalarType =
                        Array.isArray(schemaPropertyValues) &&
                        schemaPropertyValues.some(
                          (v) =>
                            typeof v !== "object" &&
                            typeof v === typeof definedPropertyValue,
                        );
                      const isStylingFieldValue = STYLING_DEFINE_TYPES.includes(
                        declaration.type,
                      );
                      if (
                        !isSchemaSupportedScalarType &&
                        !isStylingFieldValue
                      ) {
                        const message = `Cannot assign '${typeof definedPropertyValue}' to '${typeof expectedPropertyValue === "object" && "$type" in expectedPropertyValue ? expectedPropertyValue.$type : typeof expectedPropertyValue}' property`;
                        const range = doc.range(cur.from, cur.to);
                        program.diagnostics ??= {};
                        program.diagnostics[uri] ??= [];
                        program.diagnostics[uri].push({
                          range,
                          severity: DiagnosticSeverity.Error,
                          message: {
                            value: message,
                            kind: "markdown",
                          },
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
    version: number,
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
    endCharacter: number,
    tags?: number[],
  ): SparkDiagnostic | null {
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
        endCharacter,
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
        endCharacter,
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
    const diagnostic: SparkDiagnostic = {
      range,
      severity,
      message: {
        value: message,
        kind: "markdown",
      },
      relatedInformation,
      source,
    };
    if (tags && tags.length > 0) {
      diagnostic.tags = tags;
    }
    return diagnostic;
  }
}

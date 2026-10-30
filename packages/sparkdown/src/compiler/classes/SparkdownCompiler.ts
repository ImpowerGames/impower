/// <reference path="../../sd-raw.d.ts" />
import type { TextDocumentContentChangeEvent } from "vscode-languageserver-textdocument";
import type { SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { resolveImageAttributes } from "../utils/filterImage";
import { fingerprintSource } from "../utils/fingerprintSource";
import {
  collectEffectiveMorphs,
  collectMorphIssues,
  type MorphScript,
} from "../morph/collectMorphDiagnostics";
import { buildMorphChannel } from "../../morph/channel";
import type { MorphProgramChannel } from "../../morph/types";
import {
  collectLuauLints,
  duplicateGlobalMemberMessage,
  indexProgramNames,
  lintBuiltinGlobalWrites,
  lintDuplicateGlobalMembers,
  lintGlobalShadows,
  lintGlobalsUsedAsLocals,
  lintUnusedGlobalFunctions,
  type LuauLint,
  type LuauScriptLints,
} from "../lint/collectLuauLints";
import { modeFromName } from "../typecheck/LuauDocumentChecker";
import { isLuauDocument, isLuauFile } from "../typecheck/LuauUnitNodes";
import { storeSyntaxErrors } from "../typecheck/storeReading";
import { withMessageLines } from "../typecheck/messageLines";
import { Mode } from "../typecheck/Module";
import { SparkdownTypechecker } from "../typecheck/SparkdownTypechecker";
import { configTypecheckSetting, frontMatterTypecheckSetting, unknownModeMessage } from "../typecheck/typecheckSettings";
import { STDLIB } from "../../runtime/StdLib";
import { createRasterImageDefinitions, isRasterLayerFile } from "../../attributes/rasterSource";
import type { File } from "../types/File";
import { diagnoseRareAttributeOptions, type AttributeVocabulary } from "../../attributes";
import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";
import BUILTINS_PRELUDE from "../builtins/builtins.sd?raw";
import type { IFileHandler } from "../../inkjs/compiler/IFileHandler";
import { ErrorType } from "../../inkjs/compiler/Parser/ErrorType";
import { Choice } from "../../inkjs/compiler/Parser/ParsedHierarchy/Choice";
import { ConstantDeclaration } from "../../inkjs/compiler/Parser/ParsedHierarchy/Declaration/ConstantDeclaration";
import { ExternalDeclaration } from "../../inkjs/compiler/Parser/ParsedHierarchy/Declaration/ExternalDeclaration";
import { StructDefinition } from "../../inkjs/compiler/Parser/ParsedHierarchy/Struct/StructDefinition";
import { StorePropertyAssignment } from "../../inkjs/compiler/Parser/ParsedHierarchy/Variable/StorePropertyAssignment";
import { VariableAssignment as ParsedVariableAssignment } from "../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { Divert } from "../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { FlowBase } from "../../inkjs/compiler/Parser/ParsedHierarchy/Flow/FlowBase";
import { FunctionCall } from "../../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { Gather } from "../../inkjs/compiler/Parser/ParsedHierarchy/Gather/Gather";
import { Identifier } from "../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { IncludedFile } from "../../inkjs/compiler/Parser/ParsedHierarchy/IncludedFile";
import { Knot } from "../../inkjs/compiler/Parser/ParsedHierarchy/Knot";
import { ParsedObject } from "../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { BINDING_ID_PREFIX } from "../lower/lowerers/lowerSparkleBody";
import { ReturnType as ParsedReturnType } from "../../inkjs/compiler/Parser/ParsedHierarchy/ReturnType";
import { Statement } from "../../inkjs/compiler/Parser/ParsedHierarchy/Statement";
import { Stitch } from "../../inkjs/compiler/Parser/ParsedHierarchy/Stitch";
import { Story } from "../../inkjs/compiler/Parser/ParsedHierarchy/Story";
import { Tag } from "../../inkjs/compiler/Parser/ParsedHierarchy/Tag";
import { Text } from "../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { TunnelOnwards } from "../../inkjs/compiler/Parser/ParsedHierarchy/TunnelOnwards";
import { Weave } from "../../inkjs/compiler/Parser/ParsedHierarchy/Weave";
import { DebugMetadata } from "../../runtime/DebugMetadata";
import type { SourceMetadata } from "../../runtime/Error";
import {
  validateScene,
  validateBranch,
} from "../lower/utils/validateSceneBranchScope";
import { validateOpenBlocks } from "../lower/utils/validateBlockEnds";
import type { LowerContext } from "../lower/context";
import { ContinuationGroup } from "../lower/utils/displayCall";
import { isLoopInternal, loopExitOf } from "../lower/utils/statementShape";
import { nodeNameSet } from "../utils/nodeNameSet";
import type {
  ScriptBody,
  ScriptLoop,
  ScriptStructure,
} from "../utils/routeDecisions";

const REPEAT_LOOP_NODES = nodeNameSet([
  "LuauRepeatLoop",
  "LuauSparkdownRepeatLoop",
  "LuauSparkdownExplicitRepeatLoop",
]);
const OTHER_LOOP_NODES = nodeNameSet([
  "LuauWhileLoop",
  "LuauSparkdownWhileLoop",
  "LuauForLoop",
  "LuauSparkdownForLoop",
  "LuauSparkdownExplicitLoop",
]);
const FUNCTION_BODY_NODES = nodeNameSet(["LuauFunctionBody"]);
import {
  IDENTIFIER_FIELDS,
  NAME_STRING_FIELDS,
  namesHeldBy,
} from "../utils/syntheticNameFields";
import { createProgramTable, reseedProgramTable, type ProgramTable } from "../../program/ProgramTable";
import { type SceneAssetCapture, type SceneAssets } from "../types/SceneAssets";
import { rebaseSparkleSpans } from "../utils/rebaseSparkleSpans";
import type { SparkDeclaration } from "../types/SparkDeclaration";
import { DiagnosticSeverity, DiagnosticTag, type MarkupContent, type Range, type SparkDiagnostic } from "../types/SparkDiagnostic";
import type { SparkdownCompilerConfig } from "../types/SparkdownCompilerConfig";
import type { SparkdownCompilerState } from "../types/SparkdownCompilerState";
import type { ProgramChangeSummary } from "../types/ProgramChangeSummary";
import type { SparkProgram } from "../types/SparkProgram";
import type { SparkSelector } from "../types/SparkSelector";
import { getBuiltinTypeNames, setBuiltinTypeNames } from "../utils/builtinTypeNames";
import { cloneBuiltinStructs } from "../utils/cloneBuiltinStructs";
import { collectLayerNames } from "../utils/collectLayerNames";
import { scopeDefineInstances } from "../utils/scopeDefineInstances";
import { DefineScopeRecord, type DefineScopeStats } from "../utils/DefineScopeRecord";
import { formatList } from "../utils/formatList";
import { getExpectedSelectorTypes } from "../utils/getExpectedSelectorTypes";
import { getPossibleStringIdentifiers } from "../utils/getPossibleStringIdentifiers";
import { profile } from "../utils/profile";
import { readProperty } from "../utils/readProperty";
import {
  ReferenceValidationCache,
  type ReferenceOutcome,
} from "../utils/ReferenceValidationCache";
import type { Reference } from "./annotators/ReferenceAnnotator";
import { resolveFileUsingImpliedExtension } from "../utils/resolveFileUsingImpliedExtension";
import { resolveSelector } from "../utils/resolveSelector";
import { getContextEntry } from "../utils/getContextEntry";
import { setContextEntry } from "../utils/setContextEntry";
import type { AddCompilerFileParams } from "./messages/AddCompilerFileMessage";
import {
  CompiledProgramMessage,
  type CompiledProgramParams,
} from "./messages/CompiledProgramMessage";
import type { CompileProgramParams } from "./messages/CompileProgramMessage";
import type {
  PreviewCompileProgramParams,
  PreviewCompileProgramResult,
} from "./messages/PreviewCompileProgramMessage";
import { invertContentChanges } from "../utils/invertContentChanges";
import type { RemoveCompilerFileParams } from "./messages/RemoveCompilerFileMessage";
import {
  RemovedCompilerFileMessage,
  type RemovedCompilerFileParams,
} from "./messages/RemovedCompilerFileMessage";
import type { SelectCompilerDocumentParams } from "./messages/SelectCompilerDocumentMessage";
import {
  SelectedCompilerDocumentMessage,
  type SelectedCompilerDocumentParams,
} from "./messages/SelectedCompilerDocumentMessage";
import type { UpdateCompilerDocumentParams } from "./messages/UpdateCompilerDocumentMessage";
import type { UpdateCompilerFileParams } from "./messages/UpdateCompilerFileMessage";
import { SparkdownDocumentRegistry } from "./SparkdownDocumentRegistry";
import { SparkdownFileRegistry } from "./SparkdownFileRegistry";
import { ChunkStore, type ProgramBuild } from "../../program/ChunkStore";
import {
  parsedChildren,
  ProgramResolver,
  type MemoCandidate,
} from "../../program/ProgramResolver";
import type { ProgramStoryTables } from "../../program/ProgramRoot";
import type { UnsupportedConstructSite } from "../../program/ChunkStore";
import { StatementFailure } from "../../program/ProgramEmitter";
import { unsupportedConstructMessage } from "../utils/unsupportedConstructMessage";
import { MemoizedStatementNeeded, memoOf } from "../../inkjs/compiler/Parser/ParsedHierarchy/MemoizedStatement";
import {
  memosOf,
  nestedObjects,
  StatementMemoRetry,
  type MemoStats,
  type StatementMemoEntry,
  type StatementMemoHost,
} from "../lower/statementMemo";
import type { ProgramRoot } from "../../program/ProgramRoot";
import {
  flagsOf,
  Op,
  opOf,
  SET_DECLARE,
  SET_GLOBAL,
} from "../../program/ProgramInstructions";
import { H_CODE_WORDS, HEADER_WORDS } from "../../program/ProgramChunk";
import { NUMBERED_SYNTHETIC_NAME } from "../../program/ProgramSymbols";
import { rootChanges } from "../../program/rootChanges";
import { captureProgramAssets } from "../../program/programSceneAssets";
import {
  noteResolved,
  watchStatements,
  type StatementWatch,
} from "../../program/StatementWatch";
import { debugFileName } from "../utils/debugFileName";
import {
  TOP_LEVEL_STATEMENT_MESSAGE,
  topLevelStatements,
} from "../utils/declarationOnly";
import {
  isStartSceneMessage,
  startSceneProblems,
  type StartSceneScript,
} from "../utils/startScene";
import {
  isPlacementMessage,
  misplacedDeclarations,
  type AssignmentFixData,
} from "../utils/declarationPlacement";
import {
  DEFAULT_MAIN_SCRIPT_FILENAME,
  hasLuauExtension,
  isInProject,
  luauFileName,
  projectLuauFiles,
  projectPath,
  projectRootUri,
  projectScripts,
} from "../utils/projectMembership";
import {
  ambiguousRunNameMessage,
  findRunName,
  missingRunNameMessage,
  missingRunPathMessage,
  quotedRunPath,
  relativeRunPath,
  findRunPath,
  runPathNearMisses,
  type RunFix,
  type RunFixData,
} from "../utils/runOperand";
import {
  runDeclarationText,
  runFileRecord,
  runWrapperFunctionName,
  runWrapperUri,
} from "../utils/runWrapper";
import {
  programFlows,
  type StatementRecord,
} from "../../program/programFlows";
import type {
  CompilationConfig,
  CompiledBlock,
  RunOperand,
} from "./annotators/CompilationAnnotator";

const CANONICAL_SYNTH_NAME = NUMBERED_SYNTHETIC_NAME;

const BINARY_TABLE_RESEED_RATIO = 1.5;
const BINARY_TABLE_RESEED_MIN_SLACK = 512;

const LANGUAGE_NAME = GRAMMAR_DEFINITION.name.toLowerCase();
const BUILTINS_PRELUDE_URI = "file:///__builtins__.sd";

let _cachedPrelude: {
  context: Record<string, any>;
  root: ProgramRoot | undefined;
  sparkle: Record<string, any>;
} | null = null;

function getCompiledPrelude(): {
  context: Record<string, any>;
  root: ProgramRoot | undefined;
  sparkle: Record<string, any>;
} {
  if (_cachedPrelude) {
    return _cachedPrelude;
  }
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
    root: result.program.chunks,
    sparkle: result.program.sparkle ?? {},
  };
  setBuiltinTypeNames(Object.keys(_cachedPrelude.context));
  return _cachedPrelude;
}

function displayScriptPath(scriptUri: string, mainUri: string, asWritten = false): string {
  const root = projectRootUri(mainUri);
  if (root !== undefined && scriptUri.startsWith(root)) {
    return projectPath(scriptUri.slice(root.length), asWritten);
  }
  return scriptUri;
}

const isHoistedDeclaration = (obj: ParsedObject): boolean =>
  (obj instanceof ParsedVariableAssignment && obj.isGlobalDeclaration) ||
  obj instanceof ConstantDeclaration ||
  obj instanceof ExternalDeclaration;

function onlyDeclares(content: readonly ParsedObject[] | undefined): boolean {
  return (content ?? []).every(
    (obj) =>
      obj instanceof FlowBase ||
      isHoistedDeclaration(obj) ||
      (obj instanceof StorePropertyAssignment && obj.definesFunction) ||
      (obj instanceof Weave && onlyDeclares(obj.content)),
  );
}

let _preludeGlobalNames: Set<string> | undefined;
function getPreludeGlobalNames(): Set<string> {
  if (_preludeGlobalNames) {
    return _preludeGlobalNames;
  }
  const root = getCompiledPrelude().root;
  if (!root) {
    throw new Error("The builtins prelude built no statement chunks");
  }
  _preludeGlobalNames = declaredGlobalNames(root);
  return _preludeGlobalNames;
}

export function lintBuiltinNames(): Set<string> {
  return new Set([...getPreludeGlobalNames(), ...getBuiltinTypeNames()]);
}

export function declaredGlobalNames(root: ProgramRoot): Set<string> {
  const names = new Set<string>();
  const declares = SET_DECLARE | SET_GLOBAL;
  for (const chunk of root.initialization) {
    const end = HEADER_WORDS + chunk[H_CODE_WORDS]!;
    for (let at = HEADER_WORDS; at < end; at += 2) {
      const word0 = chunk[at]!;
      if (
        opOf(word0) === Op.SetVar &&
        (flagsOf(word0) & declares) === declares
      ) {
        const name = root.table.strings[chunk[at + 1]!]!;
        if (!name.startsWith("$")) {
          names.add(name);
        }
      }
    }
  }
  return names;
}

function indexOfWord(text: string, word: string): number {
  const isWordChar = (c: string | undefined): boolean =>
    c !== undefined && /[A-Za-z0-9_]/.test(c);
  let from = 0;
  while (from <= text.length) {
    const at = text.indexOf(word, from);
    if (at < 0) {
      return -1;
    }
    if (!isWordChar(text[at - 1]) && !isWordChar(text[at + word.length])) {
      return at;
    }
    from = at + 1;
  }
  return -1;
}

function diagnosticMarkup(message: string): MarkupContent {
  return { kind: message.replace(/`[^`]*`/g, "").includes("<") ? "plaintext" : "markdown", value: message };
}

function rangeContains(range: Range, position: { line: number; character: number }): boolean {
  const { start, end } = range;
  const afterStart = position.line > start.line || (position.line === start.line && position.character >= start.character);
  const beforeEnd = position.line < end.line || (position.line === end.line && position.character <= end.character);
  return afterStart && beforeEnd;
}

function rangesEqual(a: Range, b: Range): boolean {
  return (
    a.start.line === b.start.line &&
    a.start.character === b.start.character &&
    a.end.line === b.end.line &&
    a.end.character === b.end.character
  );
}
const FILE_TYPES = GRAMMAR_DEFINITION.fileTypes;

const cloneSharingVocabularies = <T>(value: T): T => {
  const copies = new Map<object, unknown>();
  const copy = (v: unknown, key?: string): unknown => {
    if (v === null || typeof v !== "object" || key === "attribute_vocabulary") {
      return v;
    }
    const existing = copies.get(v);
    if (existing !== undefined) {
      return existing;
    }
    if (Array.isArray(v)) {
      const out: unknown[] = [];
      copies.set(v, out);
      for (const item of v) {
        out.push(copy(item));
      }
      return out;
    }
    const prototype = Object.getPrototypeOf(v);
    if (prototype !== Object.prototype && prototype !== null) {
      const out = structuredClone(v);
      copies.set(v, out);
      return out;
    }
    const out: Record<string, unknown> = {};
    copies.set(v, out);
    for (const k of Object.keys(v)) {
      Object.defineProperty(out, k, {
        value: copy((v as Record<string, unknown>)[k], k),
        writable: true, enumerable: true, configurable: true,
      });
    }
    return out;
  };
  return copy(value) as T;
};

export type SparkdownCompilerEvents = {
  "compiler/didCompile": (
    params: CompiledProgramParams & { produced: boolean },
  ) => void;
  "compiler/didSelect": (params: SelectedCompilerDocumentParams) => void;
  "compiler/didRemove": (params: RemovedCompilerFileParams) => void;
  "compiler/didPreviewCompile": (
    params: PreviewCompileProgramParams & {
      program: SparkProgram;
      produced: boolean;
    },
  ) => void;
};

const ownsItsNumbering = (candidate: MemoCandidate): boolean => {
  const names = new Set<string>();
  const own = new Set<string>();
  let other = false;
  const visit = (obj: ParsedObject) => {
    if (candidate.nested?.has(obj)) {
      return;
    }
    if (
      obj instanceof ContinuationGroup ||
      ((obj instanceof Statement || obj instanceof Choice) && obj.uuid)
    ) {
      other = true;
    }
    if (isLoopInternal(obj)) {
      if (obj instanceof Gather && obj.name) {
        own.add(obj.name);
      } else if (obj instanceof ParsedVariableAssignment) {
        own.add(obj.variableName);
      }
    }
    for (const name of namesHeldBy(obj)) {
      if (CANONICAL_SYNTH_NAME.test(name)) {
        names.add(name);
        if (loopExitOf.has(obj)) {
          own.add(name);
        }
      }
    }
    parsedChildren(obj).forEach(visit);
  };
  candidate.objects.forEach(visit);
  return !other && [...names].every((name) => own.has(name));
};

const CONTEXT_REVISION_ORDINAL = Symbol.for(
  "@impower/sparkdown/contextRevisionOrdinal",
);
const nextCompilerOrdinal = (): number => {
  const registry = globalThis as unknown as Record<symbol, number | undefined>;
  const next = (registry[CONTEXT_REVISION_ORDINAL] ?? 0) + 1;
  registry[CONTEXT_REVISION_ORDINAL] = next;
  return next;
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

  protected _lintsByTree = new WeakMap<object, LuauScriptLints>();

  protected _typechecker = new SparkdownTypechecker();

  protected _files = new SparkdownFileRegistry();
  get files() {
    return this._files;
  }

  protected _prevCompilationIds?: Set<object>;
  protected _compilationIds?: Set<object>;
  protected _injectingPrelude = false;
  protected _cachedPreludeParsedStory?: Story;
  protected _chunkStoreBlocks?: Set<object>;
  protected _chunkStoreChanges?: Map<string, Array<[number, number]>>;

  protected _changeSequence = 0;
  protected _lastChangeId?: number;
  protected _lastChangeRoot?: ProgramRoot;
  protected _changeHazard = false;
  protected _editedFrom = new Map<string, number>();
  protected _changeFilesEpoch = -1;

  protected _contextBase?: {
    uri: string;
    ids: object[];
    filesEpoch: number;
    configKey: string;
    context: { [type: string]: { [name: string]: any } };
    diagnostics: { [uri: string]: SparkDiagnostic[] };
    revision: number;
  };
  protected _contextContributions?: Array<{ [type: string]: { [name: string]: any } }>;
  protected _contextKeyIds?: object[];
  protected _contextLayerTypes?: Set<string>;
  protected _contextLayerAdded?: string[];
  protected _contextLayerSerials?: Map<string, number>;
  protected _contextLayerSerialCounter = 0;
  protected _contextRevisionCounter = 0;
  protected readonly _contextRevisionToken = `c${nextCompilerOrdinal()}`;
  protected _contextBaseBuilds = 0;
  get contextBaseBuilds() {
    return this._contextBaseBuilds;
  }
  protected _engineChannelCache?: Map<
    string,
    { source: object; value: { [name: string]: any } }
  >;
  protected _morphChannelCache?: { signature: string; channel: MorphProgramChannel };
  protected _implicitDefCache?: Map<string, any>;
  protected _referenceCache?: ReferenceValidationCache;
  protected _referenceValidationStats = {
    validated: 0,
    reused: 0,
    stepped: 0,
    chunksValidated: 0,
    chunksServed: 0,
  };
  get referenceValidationStats() {
    return this._referenceValidationStats;
  }
  protected _defineScope = new DefineScopeRecord();
  protected _defineScopeBlocks?: object[];
  protected _scopedPrelude?: { story: Story; declarations: Set<ParsedObject> };
  get defineScopeStats(): DefineScopeStats {
    return this._defineScope.stats;
  }
  protected _flowAssetAccum?: Map<string, SceneAssetCapture>;

  protected _binaryTable: ProgramTable = createProgramTable();

  protected _binaryTableBaseline = 0;

  protected _binarySlotHint = 0;

  protected _compilationConfig: CompilationConfig = {
    recordLoweringReads: true,
  };
  protected _chunkStore?: ChunkStore;
  protected _placedBy = new WeakMap<ParsedObject, object>();
  protected _statementRecords = new Map<object, StatementRecord>();
  protected _preludeStatementRecords = new Map<object, StatementRecord>();
  protected _blockRecords = new WeakMap<
    object,
    { record: StatementRecord; place: { from: number; to: number; uri: string } }
  >();
  protected _previewing = false;
  lastProgramBuild?: ProgramBuild & { declarations: number; functions: number };

  protected _unsupported?: UnsupportedConstructSite;
  protected _programResolver?: ProgramResolver;
  protected _renamedNames: ParsedObject[] = [];
  protected _namesRolledBack: ParsedObject[] = [];
  protected _previewUndo?: (() => void)[];
  protected _memoHost: StatementMemoHost = {
    enabled: true,
    usable: (entry) =>
      !!entry.chunk &&
      !!this._chunkStore &&
      this._chunkStore.holdsMemoChunk(entry.chunk, entry.generation),
  };
  protected _memoBlocks = new Set<CompiledBlock>();
  protected _memoCandidates = new Map<ParsedObject, MemoCandidate>();
  protected _memoAttempt = 0;

  protected _prevFlowRuns?: Map<
    object,
    { flow: FlowBase; contentChunks: object[] }
  >;
  protected _nextFlowRuns?: Map<
    object,
    { flow: FlowBase; contentChunks: object[] }
  >;
  protected _chunkStampOffset = new WeakMap<object, number>();
  protected _sparkleSpanOffset = new WeakMap<
    object,
    { line: number; from: number }
  >();
  protected _prevFlowSignatures?: Map<string, string>;
  protected _lastRootBlocksByUri?: Map<string, string[]>;
  protected _flowReuseDisabled = true;
  protected _disableFlowReuseNextCompile = false;
  protected _reusedFlowsThisCompile?: Set<FlowBase>;
  protected _chunkReuseScan?: WeakMap<
    object,
    {
      disqualifies: boolean;
      declaredNames: string[];
    }
  >;
  protected _censusEntries?: string[];
  protected _prevCensusKey?: string;
  protected _synthFreeSubtrees = new WeakMap<object, number>();
  protected _syntheticNamesLastRun: ReadonlyMap<string, string> = new Map();

  protected _filesEpoch = 0;
  protected _projectFiles?: { uri: string; filesEpoch: number; files: File[] };
  protected _lastCompileResult?: {
    uri: string;
    scripts: Record<string, number>;
    filesEpoch: number;
    program: SparkProgram;
    produced: boolean;
  };
  protected _canonical?: { uri: string; scripts: Record<string, number> };
  protected _previewedSinceCanonical = false;
  protected _lastPreviewVersion = 0;
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
    "compiler/didPreviewCompile": new Set(),
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
    this._filesEpoch++;
    this._programResolver?.invalidate();
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
      config.seedBuiltinsIntoStory !== undefined &&
      config.seedBuiltinsIntoStory !== this._config.seedBuiltinsIntoStory
    ) {
      this._config.seedBuiltinsIntoStory = config.seedBuiltinsIntoStory;
    }
    if (
      config.stripImageData !== undefined &&
      config.stripImageData !== this._config.stripImageData
    ) {
      this._config.stripImageData = config.stripImageData;
    }
    if (
      config.workspace !== undefined &&
      config.workspace !== this._config.workspace
    ) {
      this._config.workspace = config.workspace;
    }
    if (
      config.mainScriptFilename !== undefined &&
      config.mainScriptFilename !== this._config.mainScriptFilename
    ) {
      this._config.mainScriptFilename = config.mainScriptFilename;
    }
    if (
      config.uriPathsAsWritten !== undefined &&
      config.uriPathsAsWritten !== this._config.uriPathsAsWritten
    ) {
      this._config.uriPathsAsWritten = config.uriPathsAsWritten;
    }
    if (
      config.startFrom !== undefined &&
      config.startFrom !== this._config.startFrom
    ) {
      this._config.startFrom = config.startFrom;
    }
    if (!this._documents) {
      this._compilationConfig.definitions = this._config.definitions;
      this._compilationConfig.statementMemo = this._memoHost;
      this._documents = new SparkdownDocumentRegistry(
        [
          "implicits",
          "references",
          "compilations",
          "validations",
          "declarations",
        ],
        { compilations: this._compilationConfig },
      );
      this._documents.profilerId = this._profilerId;
    }
    if (config.files !== undefined && config.files !== this._config.files) {
      this._config.files = config.files;
      if (this._config.useBuiltinsPrelude) {
        getCompiledPrelude();
      }
      for (const file of config.files) {
        if (
          file.type === "script" &&
          file.version !== undefined &&
          file.languageId !== undefined
        ) {
          this.documents.add(
            {
              textDocument: {
                uri: file.uri,
                languageId: file.languageId!,
                version: file.version,
                text: file.text || "",
              },
            },
            { defer: true },
          );
        }
        this.addFile({ file });
      }
    }
    return LANGUAGE_NAME;
  }

  addFile(params: AddCompilerFileParams) {
    this._filesEpoch++;
    const result = this.files.add(params);
    const file = params.file;
    if (
      file.type === "script" &&
      file.version !== undefined &&
      file.languageId !== undefined
    ) {
      this.documents.add(
        {
          textDocument: {
            uri: file.uri,
            text: file.text || "",
            version: file.version,
            languageId: file.languageId,
          },
        },
        { defer: true },
      );
    }
    return result;
  }

  updateFile(params: UpdateCompilerFileParams) {
    this._filesEpoch++;
    const file = params.file;
    if (
      file.type === "script" &&
      file.version !== undefined &&
      file.languageId !== undefined
    ) {
      this.documents.set(
        {
          textDocument: {
            uri: file.uri,
            text: file.text! || "",
            version: file.version,
            languageId: file.languageId,
          },
        },
        { defer: true },
      );
    }
    return this.files.update(params);
  }

  updateDocument(params: UpdateCompilerDocumentParams) {
    const applied = this.documents.update(params);
    if (applied) {
      this.noteDocumentEdits(params.textDocument.uri, params.contentChanges);
    }
    return applied;
  }

  protected noteDocumentEdits(
    uri: string,
    contentChanges: readonly TextDocumentContentChangeEvent[],
  ) {
    for (const change of contentChanges) {
      const line = Math.max(
        0,
        "range" in change ? change.range.start.line : 0,
      );
      const previous = this._editedFrom.get(uri);
      if (previous == null || line < previous) {
        this._editedFrom.set(uri, line);
      }
    }
  }

  removeFile(params: RemoveCompilerFileParams) {
    this._filesEpoch++;
    this.files.remove(params);
    const file = params.file;
    this._lastRootBlocksByUri?.delete(file.uri);
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

  isProgramOutdated(): boolean {
    const canonical = this._canonical;
    if (!canonical) {
      return false;
    }
    return !Object.entries(canonical.scripts).every(
      ([scriptUri, version]) => this.documents.get(scriptUri)?.version === version,
    );
  }

  selectDocument(params: SelectCompilerDocumentParams) {
    if (
      this._previewedSinceCanonical &&
      this._canonical &&
      !this.isProgramOutdated()
    ) {
      this.compile({ textDocument: { uri: this._canonical.uri } });
    }
    params.programOutdated = this.isProgramOutdated();
    this._events[SelectedCompilerDocumentMessage.method].forEach((l) => {
      l?.(params);
    });
    return params;
  }

  protected stampChangeSummary(
    confined: boolean,
    root?: ProgramRoot,
  ): ProgramChangeSummary {
    const changedFrom: { [uri: string]: number } = {};
    const earliest = (uri: string, line: number) => {
      const at = Math.max(0, line);
      const previous = changedFrom[uri];
      if (previous == null || at < previous) {
        changedFrom[uri] = at;
      }
    };
    for (const [uri, line] of this._editedFrom) {
      earliest(uri, line);
    }
    const filesSettled = this._filesEpoch === this._changeFilesEpoch;
    const summary: ProgramChangeSummary = {
      id: ++this._changeSequence,
      since: this._lastChangeId,
      changedFrom,
      confined: confined && filesSettled,
    };
    if (root) {
      const before =
        this._lastChangeId !== undefined ? this._lastChangeRoot : undefined;
      const build = this._chunkStore?.lastBuild;
      profile("start", this._profilerId, "program/changes");
      summary.chunks = rootChanges(before, root, build);
      profile("end", this._profilerId, "program/changes");
      if (ChunkStore.verifyBuilds && build?.root === root) {
        const whole = JSON.stringify(rootChanges(before, root));
        if (JSON.stringify(summary.chunks) !== whole) {
          throw new Error(
            `ChunkStore.verifyBuilds: the change summary ${JSON.stringify(summary.chunks)} is not the whole-root comparison's ${whole}`,
          );
        }
      }
    }
    this._lastChangeRoot = root;
    this._lastChangeId = summary.id;
    this._changeFilesEpoch = this._filesEpoch;
    this._editedFrom.clear();
    this._changeHazard = false;
    return summary;
  }

  compile(params: CompileProgramParams) {
    const result: {
      textDocument: { uri: string; version: number };
      program: SparkProgram;
      produced?: boolean;
    } = this.compileStory(params);
    result.produced = !!result.produced;
    const event = result as typeof result & { produced: boolean };
    this._canonical = this._lastCompileResult
      ? {
          uri: this._lastCompileResult.uri,
          scripts: this._lastCompileResult.scripts,
        }
      : undefined;
    this._previewedSinceCanonical = false;
    this._events[CompiledProgramMessage.method].forEach((l) => {
      l?.(event);
    });
    delete result.produced;
    return result;
  }

  previewCompile(
    params: PreviewCompileProgramParams,
  ): PreviewCompileProgramResult {
    const { textDocument, contentChanges, root, startFrom } = params;
    const document = this.documents.get(textDocument.uri);
    if (!document || document.version !== textDocument.version) {
      return { textDocument, outdated: true };
    }
    const snapshot = this.documents.snapshot(
      textDocument.uri,
      Math.min(
        ...contentChanges.map((change) =>
          "range" in change ? document.offsetAt(change.range.start) : 0,
        ),
      ),
    );
    const previewVersion = --this._lastPreviewVersion;
    const provisional = this._memoHost.provisional;
    this._memoHost.provisional = true;
    let applied = false;
    let compiled: ReturnType<SparkdownCompiler["compileStory"]>;
    try {
      applied = this.documents.update({
        textDocument: { uri: textDocument.uri, version: previewVersion },
        contentChanges,
      });
      if (applied) {
        this.noteDocumentEdits(textDocument.uri, contentChanges);
      }
      this._previewing = true;
      this._previewUndo = [];
      compiled = this.compileStory({ textDocument: root, startFrom });
      if (compiled.program.scripts[textDocument.uri] == null) {
        compiled = this.compileStory({ textDocument, startFrom });
      }
    } finally {
      this._previewing = false;
      this._memoHost.provisional = provisional;
      profile("start", this._profilerId, "previewRollback", textDocument.uri);
      const undo = this._previewUndo;
      this._previewUndo = undefined;
      if (undo) {
        for (let i = undo.length - 1; i >= 0; i--) {
          undo[i]!();
        }
      }
      if (snapshot) {
        this.documents.restore(snapshot);
      }
      profile("end", this._profilerId, "previewRollback", textDocument.uri);
      if (applied) {
        this.noteDocumentEdits(
          textDocument.uri,
          invertContentChanges(document.getText(), contentChanges),
        );
        this._previewedSinceCanonical = true;
      }
    }
    const event = {
      ...params,
      program: compiled.program,
      produced: compiled.produced,
    };
    this._events["compiler/didPreviewCompile"].forEach((l) => {
      l?.(event);
    });
    return {
      textDocument,
      program: compiled.program,
      checkpoint: event.checkpoint,
      simulationFailure: event.simulationFailure,
    };
  }

  protected compileStory(params: CompileProgramParams) {
    for (let attempt = 0; ; attempt += 1) {
      this._memoAttempt = attempt;
      const { memoRetry, ...result } = this.compileStoryOnce(params);
      if (!memoRetry) {
        return result;
      }
      if (attempt >= 2) {
        console.error(memoRetry);
        const program = result.program;
        this.reportCompileThrow(
          memoRetry,
          result.textDocument.uri,
          program,
          (message, _type, source) => {
            const diagnosticUri = source?.filePath || result.textDocument.uri;
            const diagnostic = source
              ? this.getDiagnostic(
                  message,
                  DiagnosticSeverity.Error,
                  diagnosticUri,
                  source.startLineNumber - 1,
                  source.startCharacterNumber - 1,
                  source.endLineNumber - 1,
                  source.endCharacterNumber - 1,
                )
              : null;
            if (diagnostic) {
              program.diagnostics ??= {};
              (program.diagnostics[diagnosticUri] ??= []).push(diagnostic);
            }
          },
        );
        return result;
      }
      this.relowerMemos(memoRetry, attempt > 0);
    }
  }

  protected compileStoryOnce(params: CompileProgramParams): {
    textDocument: { uri: string; version: number };
    program: SparkProgram;
    produced: boolean;
    memoRetry?: StatementMemoRetry;
  } {
    const uri = params.textDocument.uri;
    const startFrom = params.startFrom;
    this._unsupported = undefined;
    this._programResolver?.enterEpoch();

    const cached = this._lastCompileResult;
    if (
      cached &&
      cached.uri === uri &&
      cached.filesEpoch === this._filesEpoch &&
      Object.entries(cached.scripts).every(
        ([scriptUri, version]) =>
          this.documents.get(scriptUri)?.version === version,
      )
    ) {
      cached.program.startFrom = startFrom ?? this._config.startFrom;
      cached.program.changes = this.stampChangeSummary(
        !this._changeHazard,
        cached.program.chunks,
      );
      return {
        textDocument: {
          uri,
          version: this.documents.get(uri)?.version ?? -1,
        },
        program: cached.program,
        produced: cached.produced,
      };
    }

    const program: SparkProgram = {
      uri,
      scripts: { [uri]: this.documents.get(uri)?.version ?? -1 },
      files: {},
      version: this.documents.get(uri)?.version ?? -1,
      filesEpoch: this._filesEpoch,
    };

    const state: SparkdownCompilerState = {
      projectScripts: this.projectScriptsOf(uri),
    };
    for (const member of state.projectScripts!) {
      program.scripts[member] = this.documents.get(member)?.version ?? -1;
    }

    const onDiagnostic = (
      message: string,
      type: ErrorType,
      source: SourceMetadata | null,
      tags?: number[],
      data?: unknown,
    ) => {
      const severity =
        type === ErrorType.Error
          ? DiagnosticSeverity.Error
          : type === ErrorType.Warning
            ? DiagnosticSeverity.Warning
            : type === ErrorType.Hint
              ? DiagnosticSeverity.Hint
              : DiagnosticSeverity.Information;
      if (
        /^Duplicate identifier `\w+`\. A temp named `\w+` already exists on null/.test(
          message,
        )
      ) {
        return;
      }
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
        if (data !== undefined) {
          docDiagnostic.data = data;
        }
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

    const fileResolutionState = {
      currentParentUri: uri,
      runFiles: new Map<string, string>(),
    };
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
    state.fileResolutionState = fileResolutionState;

    if (this._config.useBuiltinsPrelude) {
      this.mergePreludeSparkle(program);
    }

    this._compilationIds = new Set();
    this._defineScopeBlocks = [];
    this._chunkStoreChanges = new Map();
    this._statementRecords = new Map();
    this._memoBlocks = new Set();
    this._memoCandidates = new Map();
    this._contextContributions = [];
    this._contextKeyIds = [];
    this._contextLayerTypes = new Set();
    this._contextLayerAdded = [];
    this._flowAssetAccum = undefined;
    this._changeHazard = false;
    let compileThrew = false;
    let thrown: unknown;
    const lastRootBlocks = this._lastRootBlocksByUri;
    const baseline = {
      lastRootBlocks: lastRootBlocks?.get(uri),
      census: this._prevCensusKey,
      signatures: this._prevFlowSignatures,
      disableReuse: this._disableFlowReuseNextCompile,
    };
    this._flowReuseDisabled = this._disableFlowReuseNextCompile;
    this._disableFlowReuseNextCompile = false;
    if (
      this._lastCompileResult &&
      this._lastCompileResult.uri === uri &&
      this._lastCompileResult.filesEpoch === this._filesEpoch
    ) {
      for (const [scriptUri, scriptVersion] of Object.entries(
        this._lastCompileResult.scripts,
      )) {
        if (
          scriptUri !== uri &&
          this.documents.get(scriptUri)?.version !== scriptVersion
        ) {
          this._flowReuseDisabled = true;
          break;
        }
      }
    } else {
      this._flowReuseDisabled = true;
    }
    this._reusedFlowsThisCompile = new Set();
    this._nextFlowRuns = new Map();
    this._censusEntries = [];
    let restoreWatch: StatementWatch | null | undefined;

    try {
      profile("start", this._profilerId, "ink/parse", uri);
      const story = uri !== BUILTINS_PRELUDE_URI && !hasLuauExtension(uri);
      const parsedStory = this.parseIncrementally(
        uri,
        fileHandler,
        false,
        state,
        program,
        onDiagnostic,
        story,
      );
      if (story) {
        this.validateStartScene(uri, state.projectScripts ?? [], onDiagnostic);
      }
      profile("end", this._profilerId, "ink/parse", uri);
      profile("start", this._profilerId, "scopeDefineInstances", uri);
      const collectTypeNamesFor = (uris: Iterable<string>): Set<string> => {
        const names = new Set<string>();
        for (const scanUri of uris) {
          if (!this.documents.has(scanUri)) {
            continue;
          }
          for (const name of this.documents.defineTypeNames(scanUri)) {
            names.add(name);
          }
        }
        return names;
      };
      let preludeVAs = new Set<ParsedObject>();
      const preludeStory = this._cachedPreludeParsedStory;
      this._renamedNames = this._namesRolledBack.slice();
      if (preludeStory && this.documents.has(BUILTINS_PRELUDE_URI)) {
        if (this._scopedPrelude?.story === preludeStory) {
          preludeVAs = this._scopedPrelude.declarations;
        } else {
          const preludeTypeNames = collectTypeNamesFor([BUILTINS_PRELUDE_URI]);
          scopeDefineInstances([preludeStory], preludeTypeNames, {
            collect: preludeVAs,
            renamed: this._renamedNames,
          });
          this._scopedPrelude = { story: preludeStory, declarations: preludeVAs };
        }
      }
      const userUris = new Set<string>(Object.keys(program.scripts));
      userUris.add(uri);
      userUris.delete(BUILTINS_PRELUDE_URI);
      const userTypeNames = collectTypeNamesFor(userUris);
      const previewUndo = this._previewing ? this._previewUndo : undefined;
      const userVAs = this._defineScope.scope(
        this._defineScopeBlocks ?? [],
        userTypeNames,
        this._renamedNames,
        previewUndo
          ? { undo: previewUndo, rolledBack: () => this._namesRolledBack }
          : undefined,
      );
      if (DefineScopeRecord.verify) {
        DefineScopeRecord.check(parsedStory, userVAs, preludeVAs, userTypeNames);
      }
      this.applyBuiltinOverrides(preludeVAs);
      profile("end", this._profilerId, "scopeDefineInstances", uri);
      const censusKey = (this._censusEntries ?? []).sort().join("");
      if (
        this._prevCensusKey !== undefined &&
        this._prevCensusKey !== censusKey
      ) {
        this._flowReuseDisabled = true;
      }
      this._prevCensusKey = censusKey;
      const watch = this._chunkStore?.watch;
      if (this._memoAttempt === 0) {
        watch?.changed.clear();
      }
      restoreWatch = watchStatements(watch ?? null);
      profile("start", this._profilerId, "ink/canonicalizeSyntheticNames", uri);
      this.canonicalizeSyntheticFlowNames(parsedStory);
      profile("end", this._profilerId, "ink/canonicalizeSyntheticNames", uri);
      this.dropNumberedMemos();
      const flowSignatures = this.collectFlowSignatures(parsedStory);
      if (this._prevFlowSignatures) {
        const prev = this._prevFlowSignatures;
        let signaturesChanged = flowSignatures.size !== prev.size;
        if (!signaturesChanged) {
          for (const [name, sig] of flowSignatures) {
            if (prev.get(name) !== sig) {
              signaturesChanged = true;
              break;
            }
          }
        }
        if (signaturesChanged) {
          this._flowReuseDisabled = true;
        }
      }
      this._prevFlowSignatures = flowSignatures;
      if (this._flowReuseDisabled && this._reusedFlowsThisCompile?.size) {
        this._reusedFlowsThisCompile.clear();
      }
      if (
        this._config.useBuiltinsPrelude !== false &&
        !this._config.seedBuiltinsIntoStory
      ) {
        parsedStory.DeclareBuiltinGlobals(getPreludeGlobalNames());
      }
      profile("start", this._profilerId, "program/resolve", uri);
      this._programResolver ??= new ProgramResolver();
      const tables = this._programResolver.resolve(
        parsedStory,
        {
          blockOf: (obj) => this._placedBy.get(obj),
          renamed: this._renamedNames,
          cold: false,
          memoCandidates: this._memoCandidates,
          carriedMemos: (blocks) => this.noteCarriedMemos(blocks),
        },
        onDiagnostic,
      );
      profile("end", this._profilerId, "program/resolve", uri);
      const stale = this._programResolver.staleMemosLastResolve;
      if (stale.length > 0) {
        throw new StatementMemoRetry(stale, "a name its resolution read is declared otherwise");
      }
      this._namesRolledBack = [];
      watchStatements(restoreWatch ?? null);
      restoreWatch = undefined;
      if (
        this._config.useBuiltinsPrelude !== false &&
        !this._config.seedBuiltinsIntoStory
      ) {
        this.reportBuiltinGlobalCollisions(
          parsedStory,
          getPreludeGlobalNames(),
          program,
          uri,
        );
      }
      const chunked = this.buildProgramChunks(
        parsedStory,
        tables,
        program,
        uri,
        fileResolutionState.runFiles,
      );
      if (chunked) {
        state.produced = true;
        state.structDefinitions =
          program.chunks!.tables?.structDefinitions ?? {};
        this._flowAssetAccum = captureProgramAssets(program.chunks!);
      }
      this._prevCompilationIds = this._compilationIds;
      this._prevFlowRuns = this._nextFlowRuns;
    } catch (e) {
      compileThrew = true;
      thrown = e;
      if (restoreWatch !== undefined) {
        watchStatements(restoreWatch);
      }
      const memoRetry =
        e instanceof MemoizedStatementNeeded
          ? new StatementMemoRetry([memoOf(e.statement) as StatementMemoEntry], e.message)
          : e instanceof StatementMemoRetry
            ? e
            : undefined;
      if (memoRetry) {
        for (const phase of [
          "ink/parse",
          "scopeDefineInstances",
          "ink/canonicalizeSyntheticNames",
          "program/resolve",
          "program/chunks",
        ]) {
          profile("end", this._profilerId, phase, uri);
        }
        this._memoCandidates = new Map();
        if (baseline.lastRootBlocks) {
          lastRootBlocks!.set(uri, baseline.lastRootBlocks);
        } else {
          lastRootBlocks?.delete(uri);
        }
        this._lastRootBlocksByUri = lastRootBlocks;
        this._prevCensusKey = baseline.census;
        this._prevFlowSignatures = baseline.signatures;
        this._disableFlowReuseNextCompile = baseline.disableReuse;
        return {
          textDocument: { uri, version: this.documents.get(uri)?.version ?? -1 },
          program,
          produced: false,
          memoRetry,
        };
      }
      for (const phase of [
        "ink/parse",
        "scopeDefineInstances",
        "ink/canonicalizeSyntheticNames",
        "program/resolve",
        "program/chunks",
      ]) {
        profile("end", this._profilerId, phase, uri);
      }
      console.error(e instanceof StatementFailure ? e.error : e);
      this._prevFlowRuns = undefined;
      this._lastRootBlocksByUri = undefined;
      this._prevCensusKey = undefined;
      this._disableFlowReuseNextCompile = true;
    }
    this._memoCandidates = new Map();
    this._memoBlocks = new Set();

    this.populateFiles(program);
    this.warnSharedLuauNames(program);
    this.populateDeclarationLocations(program);
    if (!compileThrew) {
      this.populateSceneAssets(program);
    }
    this.buildContext(state, program);
    this.populateEngineChannels(program);
    this.populateMorphChannel(program);
    if (!this._config.skipValidation) {
      this.validateSyntax(program);
      this.validateReferences(program);
      this.validateImageAttributes(program);
      this.validateMorphs(program);
      this.validateLints(program);
      this.validateTypes(program);
      this.validateStores(program);
    }
    if (this._unsupported) {
      this.reportUnsupportedConstruct(this._unsupported, program, onDiagnostic);
      this._unsupported = undefined;
    }
    if (compileThrew) {
      this.reportCompileThrow(thrown, uri, program, onDiagnostic);
    }
    if (this._config.workspace !== undefined) {
      program.workspace = this._config.workspace;
    }
    program.startFrom = startFrom ?? this._config.startFrom;
    program.changes = this.stampChangeSummary(false, program.chunks);
    this._lastCompileResult = compileThrew
      ? undefined
      : {
          uri,
          scripts: { ...program.scripts },
          filesEpoch: this._filesEpoch,
          program,
          produced: !!state.produced,
        };
    return {
      textDocument: {
        uri,
        version: this.documents.get(uri)!.version,
      },
      program,
      produced: !compileThrew && !!state.produced,
    };
  }

  protected projectScriptsOf(uri: string): string[] {
    const scripts: string[] = [];
    for (const file of this.files.all()) {
      const name = file.uri.slice(file.uri.lastIndexOf("/") + 1);
      if (
        file.type === "script" &&
        FILE_TYPES.some((ext) => name.endsWith(`.${ext}`)) &&
        this.documents.has(file.uri)
      ) {
        scripts.push(file.uri);
      }
    }
    return projectScripts(
      uri,
      scripts,
      this._config.mainScriptFilename ?? DEFAULT_MAIN_SCRIPT_FILENAME,
      this._config.uriPathsAsWritten,
    ).slice(1);
  }

  protected projectFilesOf(uri: string): File[] {
    const cached = this._projectFiles;
    if (cached?.uri === uri && cached.filesEpoch === this._filesEpoch) {
      return cached.files;
    }
    const root = projectRootUri(uri);
    const mainScriptFilename =
      this._config.mainScriptFilename ?? DEFAULT_MAIN_SCRIPT_FILENAME;
    const hasScript = (scriptUri: string) =>
      this.files.get(scriptUri)?.type === "script" &&
      this.documents.has(scriptUri);
    const files =
      root === undefined
        ? []
        : [...this.files.all()].filter((file) =>
            isInProject(root, file.uri, mainScriptFilename, hasScript),
          );
    this._projectFiles = { uri, filesEpoch: this._filesEpoch, files };
    return files;
  }

  protected projectLuauFilesOf(uri: string): string[] {
    const files = this.files.all().map((file) => file.uri);
    return projectLuauFiles(
      uri,
      files.filter((file) => this.documents.has(file)),
      (script) => this.documents.has(script),
      this._config.mainScriptFilename ?? DEFAULT_MAIN_SCRIPT_FILENAME,
      this._config.uriPathsAsWritten,
    );
  }

  protected resolveRunOperand(
    run: RunOperand,
    scriptUri: string,
    program: SparkProgram,
  ): { uri?: string; message?: string; fixes?: RunFix[] } {
    const asWritten = this._config.uriPathsAsWritten;
    const resolved = (uri: string) => {
      program.scripts[uri] = this.documents.get(uri)?.version ?? -1;
      return { uri };
    };
    if (run.quote) {
      const registered = [...this.files.all()]
        .map((file) => file.uri)
        .filter((file) => hasLuauExtension(file) && this.documents.has(file))
        .sort();
      const uri = findRunPath(scriptUri, `${run.path}.luau`, registered, asWritten);
      if (uri) {
        return resolved(uri);
      } else {
        const spellings = runPathNearMisses(
          run.written,
          scriptUri,
          registered,
          asWritten,
        );
        return {
          message: missingRunPathMessage(run.written, spellings),
          fixes: spellings.map((spelling) => ({
            title: `Change to '${spelling}'`,
            newText: run.quote + spelling + run.quote,
          })),
        };
      }
    }
    const { matches, nearMisses } = findRunName(
      run.path,
      this.projectLuauFilesOf(program.uri),
      asWritten,
    );
    if (matches.length === 1) {
      return resolved(matches[0]!);
    }
    if (matches.length > 1) {
      return {
        message: ambiguousRunNameMessage(
          run.path,
          matches.map((uri) => displayScriptPath(uri, program.uri, asWritten)),
        ),
        fixes: matches.map((uri) => {
          const newText = `"${quotedRunPath(relativeRunPath(scriptUri, uri, asWritten))}"`;
          return { title: `Use ${newText}`, newText };
        }),
      };
    }
    return {
      message: missingRunNameMessage(run.path, nearMisses),
      fixes: nearMisses.map((name) => ({
        title: `Change to '${name}'`,
        newText: name,
      })),
    };
  }

  protected warnSharedLuauNames(program: SparkProgram) {
    const byName = new Map<string, string[]>();
    for (const uri of this.projectLuauFilesOf(program.uri)) {
      const name = luauFileName(uri, this._config.uriPathsAsWritten);
      byName.set(name, [...(byName.get(name) ?? []), uri]);
    }
    for (const [name, uris] of byName) {
      if (uris.length > 1) {
        for (const uri of uris) {
          const other = uris.find((u) => u !== uri)!;
          this.pushAssetCollisionDiagnostic(program, uri, other, "luau", name);
        }
      }
    }
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
      data?: unknown,
    ) => void,
    declarationOnly = false,
  ) {
    const version = this.documents.get(uri)?.version ?? 0;
    const isClosedFunctionFlow = (obj: unknown): boolean =>
      obj instanceof FlowBase && obj.isFunction && obj._bodyClosed;
    const lastStoryEntry = <T,>(content: T[]): T | undefined => {
      for (let i = content.length - 1; i >= 0; i--) {
        if (!isClosedFunctionFlow(content[i])) {
          return content[i];
        }
      }
      return undefined;
    };
    const getClosestWeave = (content: ParsedObject[]): Weave | undefined => {
      const last = lastStoryEntry(content);
      if (last instanceof Weave) {
        if (lastStoryEntry(last.content) instanceof Weave) {
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

    const assemblyWeave = (weave: Weave): Weave => {
      const copy = new Weave(
        withAssemblyWeaves(weave.content),
        weave.baseIndentIndex,
      );
      copy.debugMetadata = weave.ownDebugMetadata;
      copy.isChooseBlock = weave.isChooseBlock;
      copy.isPreambleChoose = weave.isPreambleChoose;
      copy.assembledFrom = weave;
      return copy;
    };
    const withAssemblyWeaves = (content: ParsedObject[]): ParsedObject[] => {
      const last = content.at(-1);
      return last instanceof Weave
        ? [...content.slice(0, -1), assemblyWeave(last)]
        : content;
    };

    const fileName = debugFileName(uri);

    const restamp = (metadata: DebugMetadata, lineNumberOffset: number) => {
      this.offsetDebugMetadata(metadata, lineNumberOffset, version);
      metadata.fileName = fileName;
      metadata.filePath = uri;
    };

    const ownIdentifiers = (c: ParsedObject): Identifier[] =>
      [
        (c as any).identifier,
        (c as any).variableIdentifier,
        (c as any).unresolvedMember,
      ].filter(
        (id): id is Identifier =>
          id instanceof Identifier && !!id.debugMetadata,
      );

    const remapContent = (
      content: ParsedObject[],
      lineNumberOffset: number,
    ) => {
      for (const c of content) {
        if (c.debugMetadata) {
          restamp(c.debugMetadata, lineNumberOffset);
        }
        for (const id of ownIdentifiers(c)) {
          restamp(id.debugMetadata!, lineNumberOffset);
        }
        if ("pathIdentifiers" in c && Array.isArray(c.pathIdentifiers)) {
          for (const p of c.pathIdentifiers) {
            if (p instanceof Identifier && p.debugMetadata) {
              restamp(p.debugMetadata, lineNumberOffset);
            }
          }
        }
        remapContent(parsedChildren(c), lineNumberOffset);
      }
    };

    const restampContent = (
      content: ParsedObject[],
      lineNumberOffset: number,
    ) => {
      for (const c of content) {
        if (c.debugMetadata) {
          restamp(c.debugMetadata, lineNumberOffset);
        }
        for (const id of ownIdentifiers(c)) {
          restamp(id.debugMetadata!, lineNumberOffset);
        }
        if ("pathIdentifiers" in c && Array.isArray(c.pathIdentifiers)) {
          for (const p of c.pathIdentifiers) {
            if (p instanceof Identifier && p.debugMetadata) {
              restamp(p.debugMetadata, lineNumberOffset);
            }
          }
        }
        restampContent(parsedChildren(c), lineNumberOffset);
      }
    };

    const document = this.documents.get(uri);
    const annotations = this.documents.annotations(uri);
    const topLevelIncludedFileObjs: IncludedFile[] = [];
    const projectFileObjs: IncludedFile[] = [];
    let topLevelFlowBaseObjs: FlowBase[] = [];
    const bindingEvaluators = new Map<string, FlowBase>();
    const supersededEvaluators = new Set<FlowBase>();
    const topLevelWeaveObjs: ParsedObject[] = [];
    const topLevelContent: (FlowBase | Weave)[] = [];

    if (
      !isInclude &&
      this._config.seedBuiltinsIntoStory &&
      this._config.useBuiltinsPrelude
    ) {
      let preludeStory = this._cachedPreludeParsedStory;
      if (preludeStory) {
      } else {
        if (!this.documents.has(BUILTINS_PRELUDE_URI)) {
          this.documents.add({
            textDocument: {
              uri: BUILTINS_PRELUDE_URI,
              languageId: LANGUAGE_NAME,
              version: 0,
              text: BUILTINS_PRELUDE,
            },
          });
        }
        const wasInjecting = this._injectingPrelude;
        this._injectingPrelude = true;
        try {
          preludeStory = this.parseIncrementally(
            BUILTINS_PRELUDE_URI,
            fileHandler,
            true,
            state,
            program,
            onDiagnostic,
          );
        } finally {
          this._injectingPrelude = wasInjecting;
        }
        this._cachedPreludeParsedStory = preludeStory;
      }
      topLevelIncludedFileObjs.push(new IncludedFile(preludeStory));
    }

    const chunkRecords: { block: any; from: number; to: number }[] = [];
    {
      const cur = annotations.compilations.iter();
      while (cur.value) {
        chunkRecords.push({
          block: cur.value.type,
          from: cur.from,
          to: cur.to,
        });
        cur.next();
      }
    }

    const chunkFlowKind = (
      block: any,
    ): "knot" | "stitch" | "external" | "body" | "none" => {
      const first = block?.content?.[0];
      if (first instanceof Knot) return "knot";
      if (first instanceof Stitch) return "stitch";
      if (first instanceof ExternalDeclaration) return "external";
      if (first) return "body";
      return "none";
    };
    const isClosedFunctionChunk = (block: any): boolean =>
      isClosedFunctionFlow(block?.content?.[0]);

    const scanChunkForReuse = (
      block: any,
    ): {
      disqualifies: boolean;
      declaredNames: string[];
    } => {
      let cached = this._chunkReuseScan?.get(block);
      if (cached) {
        return cached;
      }
      let disqualifies = false;
      const declaredNames: string[] = [];
      const scan = (nodes: ParsedObject[]) => {
        for (const n of nodes) {
          if (n instanceof ConstantDeclaration) {
            disqualifies = true;
            if (n.constantName) {
              declaredNames.push(`g:${n.constantName}`);
            }
          } else if (
            n instanceof ExternalDeclaration ||
            n instanceof StructDefinition ||
            (n instanceof ParsedVariableAssignment && n.isGlobalDeclaration)
          ) {
            disqualifies = true;
            const globalName =
              n instanceof ParsedVariableAssignment
                ? n.variableName
                : n.identifier?.name;
            if (globalName) {
              declaredNames.push(`g:${globalName}`);
            }
          }
          if (n.content) {
            scan(n.content);
          }
        }
      };
      if (block?.content) {
        scan(block.content);
      }
      cached = { disqualifies, declaredNames };
      (this._chunkReuseScan ??= new WeakMap()).set(block, cached);
      return cached;
    };

    {
      const rootDescriptors: string[] = [];
      for (const rec of chunkRecords) {
        const block = rec.block as any;
        if (block.run) {
          rootDescriptors.push(
            `run:${block.run.quote ? JSON.stringify(block.run.path) : block.run.path}`,
          );
        }
        if (chunkFlowKind(block) === "external") {
          const ext = block.content?.[0] as ExternalDeclaration | undefined;
          rootDescriptors.push(
            `ext:${ext?.identifier?.name ?? "?"}/${
              ext?.argumentNames?.length ?? 0
            }`,
          );
        }
        if (block.content) {
          const scan = scanChunkForReuse(block);
          if (!this._injectingPrelude) {
            for (const name of scan.declaredNames) {
              this._censusEntries?.push(`${uri}|${name}`);
            }
            if (scan.disqualifies) {
              this._contextKeyIds?.push(block);
            }
          }
          if (this._prevCompilationIds && !this._prevCompilationIds.has(block)) {
            if (scan.disqualifies) {
              this._changeHazard = true;
            }
          }
        }
      }
      const prevRootDescriptors = this._lastRootBlocksByUri?.get(uri);
      if (
        !prevRootDescriptors ||
        prevRootDescriptors.length !== rootDescriptors.length ||
        rootDescriptors.some((d, i) => prevRootDescriptors[i] !== d)
      ) {
        this._flowReuseDisabled = true;
      }
      (this._lastRootBlocksByUri ??= new Map()).set(uri, rootDescriptors);
    }

    const reuseSkipBlocks = new Set<object>();
    type FlowRun = { flow: FlowBase; contentChunks: object[] };
    const runsByFlow = new Map<ParsedObject, FlowRun>();
    const startRun = (flow: FlowBase, declBlock: object) => {
      const run: FlowRun = { flow, contentChunks: [declBlock] };
      runsByFlow.set(flow, run);
      this._nextFlowRuns?.set(declBlock, run);
    };
    const continueRun = (flow: ParsedObject | undefined, block: object) => {
      if (flow) {
        runsByFlow.get(flow)?.contentChunks.push(block);
      }
    };

    const tryReuseFlowRun = (
      declBlock: object,
      startIdx: number,
    ): FlowBase | undefined => {
      if (this._flowReuseDisabled || !this._prevFlowRuns) {
        return undefined;
      }
      const prevRun = this._prevFlowRuns.get(declBlock);
      if (!prevRun) {
        return undefined;
      }
      const runChunks = prevRun.contentChunks;
      let k = 0;
      let j = startIdx;
      while (k < runChunks.length) {
        if (j >= chunkRecords.length) {
          return undefined;
        }
        const cb = chunkRecords[j]!.block as any;
        if (cb.run || refused(chunkRecords[j]!)) {
          return undefined;
        }
        if (!cb.content || (k > 0 && isClosedFunctionChunk(cb))) {
          j++;
          continue;
        }
        if (cb !== runChunks[k] || scanChunkForReuse(cb).disqualifies) {
          return undefined;
        }
        j++;
        k++;
      }
      const takesFollowingChunks = !isClosedFunctionChunk(declBlock);
      for (let m = j; takesFollowingChunks && m < chunkRecords.length; m++) {
        const cb = chunkRecords[m]!.block as any;
        if (cb.run) {
          return undefined;
        }
        if (!cb.content || isClosedFunctionChunk(cb) || refused(chunkRecords[m]!)) {
          continue;
        }
        const kind = chunkFlowKind(cb);
        if (kind !== "knot" && kind !== "external") {
          return undefined;
        }
        break;
      }
      for (const c of runChunks) {
        reuseSkipBlocks.add(c);
      }
      this._nextFlowRuns?.set(declBlock, prevRun);
      this._reusedFlowsThisCompile?.add(prevRun.flow);
      return prevRun.flow;
    };

    const tree = declarationOnly ? this.documents.tree(uri) : undefined;
    const topLevel =
      tree && document
        ? topLevelStatements(tree.topNode, (from, to) =>
            document.read(from, to),
          )
        : undefined;
    const refused = (rec: { block: any; from: number }): boolean => {
      const declares = topLevel?.get(rec.from);
      return (
        declares === false ||
        (declares === true && !onlyDeclares(rec.block.content))
      );
    };
    const misplacedLocals = new Set<number>();
    const placementTree =
      this._injectingPrelude || hasLuauExtension(uri)
        ? undefined
        : this.documents.tree(uri);
    if (placementTree && document) {
      for (const misplaced of misplacedDeclarations(
        placementTree.topNode,
        (from, to) => document.read(from, to),
      )) {
        if (misplaced.statement !== undefined) {
          misplacedLocals.add(misplaced.statement);
        }
        const start = document.positionAt(misplaced.from);
        const end = document.positionAt(misplaced.to);
        onDiagnostic(
          misplaced.message,
          ErrorType.Error,
          {
            fileName,
            filePath: uri,
            startLineNumber: start.line + 1,
            endLineNumber: end.line + 1,
            startCharacterNumber: start.character + 1,
            endCharacterNumber: end.character + 1,
          },
          undefined,
          misplaced.assignment !== undefined
            ? ({ assignment: misplaced.assignment } satisfies AssignmentFixData)
            : undefined,
        );
      }
    }
    const firstLineSource = (from: number): SourceMetadata => {
      const text = document?.getText() ?? "";
      const lineEnd = text.indexOf("\n", from);
      const line = lineEnd < 0 ? text.slice(from) : text.slice(from, lineEnd);
      const indent = line.length - line.trimStart().length;
      const start = document?.positionAt(from + indent) ?? {
        line: 0,
        character: 0,
      };
      const end = line.trim().length;
      return {
        fileName,
        filePath: uri,
        startLineNumber: start.line + 1,
        endLineNumber: start.line + 1,
        startCharacterNumber: start.character + 1,
        endCharacterNumber: start.character + end + 1,
      };
    };
    const forwardDiagnostics = (
      diagnostics: CompiledBlock["diagnostics"],
      lineNumberOffset: number,
    ) => {
      for (const diagnostic of diagnostics ?? []) {
        if (diagnostic.source) {
          const offsetSource: SourceMetadata = { ...diagnostic.source };
          offsetSource.startLineNumber += lineNumberOffset;
          offsetSource.endLineNumber += lineNumberOffset;
          offsetSource.fileName ??= fileName;
          offsetSource.filePath ??= uri;
          onDiagnostic(
            diagnostic.messageLinesInChunk
              ? withMessageLines(diagnostic.message, (line) => line + lineNumberOffset)
              : diagnostic.message,
            diagnostic.severity,
            offsetSource,
            diagnostic.tags,
          );
        }
      }
    };

    for (let chunkIdx = 0; chunkIdx < chunkRecords.length; chunkIdx++) {
      const rec = chunkRecords[chunkIdx]!;
      const {
        run,
        diagnostics,
        context,
        sparkle,
        defaultDefinitions,
        uuid,
        hoistedKnots,
      } = rec.block;
      let content = rec.block.content;
      const lineNumberOffset = document?.lineAt(rec.from) ?? 0;
      const declares = topLevel?.get(rec.from);
      if (refused(rec)) {
        if (!misplacedLocals.has(rec.from)) {
          onDiagnostic(
            TOP_LEVEL_STATEMENT_MESSAGE,
            ErrorType.Error,
            firstLineSource(rec.from),
          );
        }
        forwardDiagnostics(diagnostics, lineNumberOffset);
        continue;
      }
      const hoisted = declares === true;
      const sparkleCollides =
        !!sparkle &&
        !this._injectingPrelude &&
        this.recordSparkleDeclarations(
          sparkle,
          uri,
          program.uri,
          state,
          firstLineSource(rec.from),
          onDiagnostic,
        );
      const compiledBlock = rec.block as object;
      this._compilationIds?.add(compiledBlock);
      if (!this._injectingPrelude) {
        this._defineScopeBlocks?.push(compiledBlock);
      }
      if (
        this._chunkStoreBlocks &&
        !this._chunkStoreBlocks.has(compiledBlock)
      ) {
        const chunkStart = lineNumberOffset;
        const chunkEnd = document?.lineAt(rec.to) ?? chunkStart;
        let ranges = this._chunkStoreChanges?.get(uri);
        if (!ranges) {
          ranges = [];
          this._chunkStoreChanges?.set(uri, ranges);
        }
        ranges.push([chunkStart, chunkEnd]);
      }
      const record = this.statementRecord(
        rec.block,
        rec.from,
        rec.to,
        lineNumberOffset,
        uri,
      );
      (uri === BUILTINS_PRELUDE_URI
        ? this._preludeStatementRecords
        : this._statementRecords
      ).set(compiledBlock, record);
      this.noteMemos(rec.block as CompiledBlock, record);
      if (hoistedKnots) {
        remapContent(hoistedKnots, lineNumberOffset);
        for (const k of hoistedKnots) {
          if (k instanceof FlowBase) {
            const name = k.identifier?.name;
            if (name?.startsWith(BINDING_ID_PREFIX)) {
              if (sparkleCollides) {
                continue;
              }
              const earlier = bindingEvaluators.get(name);
              if (earlier) {
                supersededEvaluators.add(earlier);
              }
              bindingEvaluators.set(name, k);
            }
            topLevelFlowBaseObjs.push(k);
            this._placedBy.set(k, compiledBlock);
          }
        }
      }
      if (run) {
        const previousParentUri =
          state.fileResolutionState?.currentParentUri ?? uri;
        if (state.fileResolutionState) {
          state.fileResolutionState.currentParentUri = uri;
        }
        const resolution = this.resolveRunOperand(run, uri, program);
        const resolvedFilePath = resolution.uri ?? null;
        const sourceMetadata: SourceMetadata = {
          fileName,
          filePath: uri,
          startLineNumber: run.source.startLineNumber + lineNumberOffset,
          endLineNumber: run.source.endLineNumber + lineNumberOffset,
          startCharacterNumber: run.source.startCharacterNumber,
          endCharacterNumber: run.source.endCharacterNumber,
        };
        if (!resolvedFilePath) {
          const fixes = resolution.fixes ?? [];
          onDiagnostic(
            resolution.message!,
            ErrorType.Error,
            sourceMetadata,
            undefined,
            fixes.length > 0
              ? ({ runFixes: fixes } satisfies RunFixData)
              : undefined,
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
          const wrapperName = runWrapperFunctionName(resolvedFilePath);
          const declared = state.fileResolutionState
            ? (state.fileResolutionState.runDeclared ??= new Set())
            : undefined;
          if (!declared?.has(resolvedFilePath)) {
            declared?.add(resolvedFilePath);
            state.fileResolutionState?.runFiles?.set(
              wrapperName,
              resolvedFilePath,
            );
            const virtualUri = runWrapperUri(resolvedFilePath, wrapperName);
            const documentText = runDeclarationText(
              wrapperName,
              fileHandler.LoadInkFileContents(resolvedFilePath),
            ).replace(/\r\n|\r/g, "\n");
            const registered = this.documents.get(virtualUri);
            if (registered?.getText() !== documentText) {
              this.documents.add({
                textDocument: {
                  uri: virtualUri,
                  languageId: "sparkdown",
                  version: (registered?.version ?? 0) + 1,
                  text: documentText,
                },
              });
            }
            if (state.fileResolutionState) {
              state.fileResolutionState.runStack ??= [];
              state.fileResolutionState.runStack.push(resolvedFilePath);
            }
            let runStory: Story;
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
          const call = new FunctionCall(new Identifier(wrapperName), []);
          call.shouldPopReturnedValue = true;
          const line = new DebugMetadata();
          line.startLineNumber = run.line.startLineNumber;
          line.endLineNumber = run.line.endLineNumber;
          line.startCharacterNumber = run.line.startCharacterNumber;
          line.endCharacterNumber = run.line.endCharacterNumber;
          call.debugMetadata = line;
          content = [new Weave([call])];
        }
        if (state.fileResolutionState) {
          state.fileResolutionState.currentParentUri = previousParentUri;
        }
      }
      forwardDiagnostics(diagnostics, lineNumberOffset);
      if (content) {
        if (!reuseSkipBlocks.has(compiledBlock)) {
          const first = content[0];
          const declaresTopLevelFlow =
            first instanceof Knot ||
            (first instanceof Stitch &&
              !(lastStoryEntry(topLevelContent) instanceof Knot));
          if (declaresTopLevelFlow) {
            const reusedFlow = tryReuseFlowRun(compiledBlock, chunkIdx);
            if (reusedFlow) {
              topLevelFlowBaseObjs.push(reusedFlow);
              topLevelContent.push(reusedFlow as Knot | Stitch);
            }
          }
        }
        if (reuseSkipBlocks.has(compiledBlock)) {
          if (this._chunkStampOffset.get(compiledBlock) !== lineNumberOffset) {
            restampContent(content, lineNumberOffset);
          }
          this._chunkStampOffset.set(compiledBlock, lineNumberOffset);
        } else {
          remapContent(content, lineNumberOffset);
          this._chunkStampOffset.set(compiledBlock, lineNumberOffset);
          const flow = content[0];
          if (flow) {
            if (flow instanceof Knot) {
              const rootWeave = flow._weave
                ? assemblyWeave(flow._weave)
                : new Weave([]);
              rootWeave.debugMetadata = flow.debugMetadata;
              const knot = new Knot(
                flow.identifier!,
                [],
                flow.args ?? [],
                flow.isFunction,
              );
              knot._bodyClosed = flow._bodyClosed;
              knot._loweredFrom = flow;
              knot.debugMetadata = flow.debugMetadata;
              knot._weave = rootWeave;
              knot.AddContent(rootWeave);
              for (const [subName, subFlow] of flow._subFlowsByName) {
                knot._subFlowsByName.set(subName, subFlow);
                knot.AddContent(subFlow);
              }
              topLevelFlowBaseObjs.push(knot);
              topLevelContent.push(knot);
              startRun(knot, compiledBlock);
              this._placedBy.set(knot, compiledBlock);
            } else if (flow instanceof Stitch) {
              const rootWeave = new Weave([]);
              const stitch = new Stitch(
                flow.identifier!,
                [],
                flow.args ?? [],
                flow.isFunction,
              );
              stitch._bodyClosed = flow._bodyClosed;
              stitch._loweredFrom = flow;
              stitch.debugMetadata = flow.debugMetadata;
              stitch._weave = rootWeave;
              stitch.AddContent(rootWeave);
              rootWeave.debugMetadata = flow.debugMetadata;
              this._placedBy.set(stitch, compiledBlock);
              const last = lastStoryEntry(topLevelContent);
              if (last instanceof Knot) {
                if (stitch.identifier?.name) {
                  last.subFlowsByName.set(stitch.identifier?.name, stitch);
                }
                if (
                  last.content.length === 1 &&
                  last.content[0] instanceof Weave &&
                  last.content[0].content.length === 0
                ) {
                  last.content.pop();
                }
                last.AddContent(stitch);
                continueRun(last, compiledBlock);
              } else {
                topLevelFlowBaseObjs.push(stitch);
                topLevelContent.push(stitch);
                startRun(stitch, compiledBlock);
              }
            } else if (flow instanceof ExternalDeclaration) {
              const weave = new Weave([flow]);
              topLevelWeaveObjs.push(weave);
              topLevelContent.push(weave);
              this._placedBy.set(flow, compiledBlock);
            } else if (flow instanceof Weave) {
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
              const firstStatement = flow?.content[0];
              const isWeavePoint =
                firstStatement instanceof Choice ||
                firstStatement instanceof Gather;
              if (uuid && isWeavePoint) {
                firstStatement.uuid = uuid;
              }
              const flowContent =
                uuid && !isWeavePoint
                  ? [new Statement(uuid, flow.content)]
                  : withAssemblyWeaves(flow.content);
              for (const placed of flowContent) {
                this._placedBy.set(placed, compiledBlock);
              }
              const closestWeave = hoisted
                ? undefined
                : getClosestWeave(topLevelContent);
              if (closestWeave) {
                const lastContent = closestWeave.content.at(-1);
                if (
                  lastContent instanceof Weave &&
                  lastContent.content.length === 0
                ) {
                  closestWeave.content.pop();
                }
                closestWeave.AddContent(flowContent);
                continueRun(lastStoryEntry(topLevelContent), compiledBlock);
              } else {
                const weave = new Weave(flowContent);
                topLevelWeaveObjs.push(weave);
                if (!hoisted) {
                  topLevelContent.push(weave);
                }
              }
            }
          }
        }
      }
      if (context && !this._injectingPrelude) {
        if (!sparkleCollides) {
          this._contextContributions?.push(context);
        }
        this._contextKeyIds?.push(compiledBlock);
      }
      if (sparkle && !this._injectingPrelude) {
        this._contextKeyIds?.push(compiledBlock);
        const stamped = this._sparkleSpanOffset.get(sparkle) ?? {
          line: 0,
          from: 0,
        };
        if (stamped.line !== lineNumberOffset || stamped.from !== rec.from) {
          rebaseSparkleSpans(
            sparkle,
            lineNumberOffset - stamped.line,
            rec.from - stamped.from,
          );
          this._sparkleSpanOffset.set(sparkle, {
            line: lineNumberOffset,
            from: rec.from,
          });
        }
        for (const kind of ["layouts", "screens", "components"] as const) {
          const trees = sparkle[kind];
          if (trees && !sparkleCollides) {
            program.sparkle ??= {};
            program.sparkle[kind] ??= {};
            Object.assign(program.sparkle[kind]!, trees);
          }
        }
      }
      if (defaultDefinitions && !this._injectingPrelude) {
        this._contextKeyIds?.push(compiledBlock);
        for (const [type, struct] of Object.entries(defaultDefinitions)) {
          state.defaultDefinitions ??= {};
          state.defaultDefinitions[type] ??= struct;
        }
      }
    }

    if (!isInclude) {
      for (const member of state.projectScripts ?? []) {
        const memberStory = this.parseIncrementally(
          member,
          fileHandler,
          true,
          state,
          program,
          onDiagnostic,
          true,
        );
        projectFileObjs.push(new IncludedFile(memberStory));
      }
    }

    this.validateSceneStructure(uri, onDiagnostic);

    const autoTerminate = (flow: FlowBase): void => {
      if (!flow.isFunction) {
        const rootWeave = flow._weave;
        if (rootWeave) {
          const last = rootWeave.content[rootWeave.content.length - 1];
          const alreadyTerminates =
            last instanceof Divert ||
            last instanceof TunnelOnwards ||
            last instanceof ParsedReturnType;
          if (!alreadyTerminates) {
            const doneDivert = new Divert([Identifier.Done()]);
            doneDivert.debugMetadata = flow.debugMetadata;
            rootWeave.AddContent(doneDivert);
          }
        }
      }
      for (const sub of flow.subFlowsByName.values()) {
        autoTerminate(sub);
      }
    };
    if (supersededEvaluators.size > 0) {
      topLevelFlowBaseObjs = topLevelFlowBaseObjs.filter(
        (flow) => !supersededEvaluators.has(flow),
      );
    }
    for (const flow of topLevelFlowBaseObjs) {
      autoTerminate(flow);
    }

    const topLevelObjs = topLevelWeaveObjs.flatMap((w) => w.content);
    const combinedParsedStory = new Story(
      [
        ...topLevelIncludedFileObjs,
        ...topLevelObjs,
        ...projectFileObjs,
        ...topLevelFlowBaseObjs,
      ],
      isInclude,
    );

    return combinedParsedStory;
  }

  protected collectFlowSignatures(
    flow: FlowBase,
    into: Map<string, string> = new Map(),
  ): Map<string, string> {
    for (const sub of flow.subFlowsByName.values()) {
      const name = sub.identifier?.name;
      if (name) {
        const args = (sub.args ?? [])
          .map(
            (a) =>
              `p${a.isVararg ? "*" : ""}${a.isByReference ? "&" : ""}${
                a.isDivertTarget ? ">" : ""
              }`,
          )
          .join(",");
        into.set(name, `${sub.isFunction ? "fn" : "knot"}(${args})`);
      }
      this.collectFlowSignatures(sub, into);
    }
    return into;
  }

  protected canonicalizeSyntheticFlowNames(root: ParsedObject): void {
    const RAW_SYNTH =
      /^(?:__anon_fn_|__define_fn_|__mcall_|__forIdx_|__forStop_|__forStep_|__pa_base_|__pa_key_)\w*\$\d+$|^(?:__for_|__forIn_|__while_|__repeat_)\w*\$\d+_[A-Za-z]+$|^__mt_\w*\$\d+_\d+$/;
    const SYNTH = new RegExp(
      `${NUMBERED_SYNTHETIC_NAME.source}|${RAW_SYNTH.source}`,
    );
    const remap = new Map<string, string>();
    let changed = false;
    const matchedIds: Array<{ id: Identifier; owner: ParsedObject }> = [];
    const seenIds = new Set<Identifier>();
    const matchedStrings: Array<{ node: any; field: string; name: string }> =
      [];
    const seenStrings = new Map<object, Set<string>>();
    const flowsToRekey: FlowBase[] = [];
    const groupRemap = new Map<string, string>();
    const matchedGroups: Array<{ group: ContinuationGroup; text: string }> = [];
    const seenGroups = new Set<ContinuationGroup>();
    const matchedUuids: Array<{ node: Statement | Choice; next: string }> = [];
    const seenUuids = new Set<Statement | Choice>();
    const nameScope = new Map<string, string>();
    const groupScope = new Map<string, string>();
    const noteScope = (scopes: Map<string, string>, key: string, scope: string) => {
      const was = scopes.get(key);
      if (scope === `>${key}`) {
        return;
      }
      if (was === undefined || (was[0] === ">" && scope[0] === "=")) {
        scopes.set(key, scope);
      }
    };

    const considerName = (name: string, scope: string) => {
      if (!remap.has(name)) {
        remap.set(name, "");
      }
      noteScope(nameScope, name, scope);
    };
    const considerGroup = (group: ContinuationGroup, scope: string) => {
      if (seenGroups.has(group)) {
        return;
      }
      seenGroups.add(group);
      const text = group.text;
      if (!groupRemap.has(text)) {
        groupRemap.set(text, "");
      }
      noteScope(groupScope, text, scope);
      matchedGroups.push({ group, text });
    };
    const considerId = (id: Identifier, owner: ParsedObject, scope: string) => {
      const name = id.name;
      if (name && SYNTH.test(name) && !seenIds.has(id)) {
        seenIds.add(id);
        considerName(name, scope);
        matchedIds.push({ id, owner });
      }
    };
    const collect = (node: ParsedObject, outer: string): boolean => {
      const markedLength = this._synthFreeSubtrees.get(node);
      if (
        markedLength !== undefined &&
        markedLength === (node.content?.length ?? 0)
      ) {
        return false;
      }
      let scope = outer;
      if (node instanceof FlowBase && node.parent instanceof Story) {
        const name = node.identifier?.name ?? "";
        scope = SYNTH.test(name)
          ? `>${name}`
          : name.includes("$")
            ? "="
            : `=${name}`;
      }
      let found = false;
      for (const f of IDENTIFIER_FIELDS) {
        const val = (node as any)[f];
        if (val instanceof Identifier) {
          if (val.name && SYNTH.test(val.name)) {
            found = true;
          }
          considerId(val, node, scope);
        } else if (Array.isArray(val)) {
          for (const el of val) {
            if (el instanceof Identifier) {
              if (el.name && SYNTH.test(el.name)) {
                found = true;
              }
              considerId(el, node, scope);
            }
          }
        }
      }
      for (const f of NAME_STRING_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(node, f)) {
          continue;
        }
        const v = (node as any)[f];
        if (typeof v === "string" && SYNTH.test(v)) {
          found = true;
          let fields = seenStrings.get(node);
          if (!fields) {
            fields = new Set();
            seenStrings.set(node, fields);
          }
          if (!fields.has(f)) {
            fields.add(f);
            considerName(v, scope);
            matchedStrings.push({ node, field: f, name: v });
          }
        }
      }
      if (node instanceof ContinuationGroup) {
        found = true;
        considerGroup(node, scope);
      }
      if (
        (node instanceof Statement || node instanceof Choice) &&
        node.uuid &&
        !seenUuids.has(node)
      ) {
        found = true;
        seenUuids.add(node);
        const next = `${seenUuids.size - 1}`;
        if (next !== node.uuid) {
          changed = true;
        }
        matchedUuids.push({ node, next });
      }
      if (
        node instanceof FlowBase &&
        (node._subFlowsByName.size > 0 || node.variableDeclarations.size > 0)
      ) {
        flowsToRekey.push(node);
      }
      for (const c of parsedChildren(node)) {
        if (collect(c, scope)) {
          found = true;
        }
      }
      if (!found) {
        this._synthFreeSubtrees.set(node, node.content?.length ?? 0);
      }
      return found;
    };
    collect(root, "=");
    const flowOf = (scope: string | undefined, seen = new Set<string>()): string => {
      if (scope === undefined) {
        return "";
      }
      if (scope[0] === "=") {
        return scope.slice(1);
      }
      const name = scope.slice(1);
      if (seen.has(name)) {
        return "";
      }
      seen.add(name);
      return flowOf(nameScope.get(name), seen);
    };
    const ordinals = new Map<string, number>();
    const numbered = (family: string, flow: string): string => {
      const key = `${family}$${flow}`;
      const n = ordinals.get(key) ?? 0;
      ordinals.set(key, n + 1);
      return `${key}$${n}`;
    };
    for (const name of remap.keys()) {
      const next = numbered("__synth", flowOf(nameScope.get(name)));
      remap.set(name, next);
      if (next !== name) {
        changed = true;
      }
    }
    for (const text of groupRemap.keys()) {
      const next = numbered("__group", flowOf(groupScope.get(text)));
      groupRemap.set(text, next);
      if (next !== text) {
        changed = true;
      }
    }
    const undo = this._previewUndo;
    const lastRun = this._syntheticNamesLastRun;
    undo?.push(() => {
      this._syntheticNamesLastRun = lastRun;
    });
    this._syntheticNamesLastRun = remap;
    if (!changed) {
      return;
    }

    for (const { id, owner } of matchedIds) {
      const next = id.name ? remap.get(id.name) : undefined;
      if (next) {
        if (next !== id.name) {
          this._renamedNames.push(owner);
          const was = id.name;
          undo?.push(() => {
            id.name = was;
            this._namesRolledBack.push(owner);
          });
        }
        id.name = next;
      }
    }
    for (const { node, field, name } of matchedStrings) {
      const next = remap.get(name);
      if (next) {
        if (next !== name) {
          this._renamedNames.push(node);
          undo?.push(() => {
            node[field] = name;
            this._namesRolledBack.push(node);
          });
        }
        node[field] = next;
      }
    }
    for (const { group, text } of matchedGroups) {
      const next = groupRemap.get(text)!;
      if (next !== group.text) {
        const was = group.text;
        undo?.push(() => {
          group.text = was;
          noteResolved(group);
        });
        group.text = next;
        noteResolved(group);
      }
    }
    for (const { node, next } of matchedUuids) {
      if (next !== node.uuid) {
        const was = node.uuid;
        undo?.push(() => {
          node.uuid = was;
        });
        node.uuid = next;
      }
    }
    for (const flow of flowsToRekey) {
      const subFlows = flow._subFlowsByName;
      const declarations = flow.variableDeclarations;
      undo?.push(() => {
        flow._subFlowsByName = subFlows;
        flow.variableDeclarations = declarations;
      });
      const next = flow.subFlowTable();
      for (const [, sub] of flow._subFlowsByName) {
        const nm = sub.identifier?.name;
        if (nm) {
          next.set(nm, sub);
        }
      }
      flow._subFlowsByName = next;
      if ([...flow.variableDeclarations.keys()].some((k) => SYNTH.test(k))) {
        const decls = FlowBase.declarationTable();
        for (const [key, decl] of flow.variableDeclarations) {
          decls.set(SYNTH.test(key) ? (decl.variableName ?? key) : key, decl);
        }
        flow.variableDeclarations = decls;
      }
    }
  }

  validateSceneStructure(
    uri: string,
    onDiagnostic: (
      message: string,
      type: ErrorType,
      source: SourceMetadata | null,
      tags?: number[],
    ) => void,
  ) {
    const tree = this.documents.tree(uri);
    const doc = this.documents.get(uri);
    if (!tree || !doc) {
      return;
    }
    let documentText: string | undefined;
    const ctx = {
      filePath: uri,
      read: (from: number, to: number) => doc.read(from, to),
      lineNumber: (pos: number) => doc.positionAt(pos).line,
      characterNumber: (pos: number) => doc.positionAt(pos).character,
      documentText: () => (documentText ??= doc.getText()),
    } as unknown as LowerContext;
    const emit = (diags: ReturnType<typeof validateScene>) => {
      for (const d of diags) {
        onDiagnostic(d.message, d.severity, d.source ?? null);
      }
    };
    let cur = tree.topNode.firstChild;
    while (cur) {
      if (cur.name === "Scene") {
        emit(validateScene(cur, ctx));
      } else if (cur.name === "Branch") {
        emit(validateBranch(cur, ctx));
      }
      cur = cur.nextSibling;
    }
    emit(validateOpenBlocks(tree.topNode, ctx));
  }

  protected validateStartScene(
    uri: string,
    scripts: readonly string[],
    onDiagnostic: (
      message: string,
      type: ErrorType,
      source: SourceMetadata | null,
    ) => void,
  ) {
    const read: StartSceneScript[] = [];
    for (const scriptUri of [uri, ...scripts]) {
      const tree = this.documents.tree(scriptUri);
      const doc = this.documents.get(scriptUri);
      if (tree && doc) {
        read.push({
          uri: scriptUri,
          top: tree.topNode,
          read: (from, to) => doc.read(from, to),
        });
      }
    }
    for (const problem of startSceneProblems(read)) {
      const doc = this.documents.get(problem.uri)!;
      const text = doc.getText();
      const lineEnd = text.indexOf("\n", problem.from);
      const line = text.slice(problem.from, lineEnd < 0 ? text.length : lineEnd);
      const indent = line.length - line.trimStart().length;
      const start = doc.positionAt(problem.from + indent);
      onDiagnostic(problem.message, ErrorType.Error, {
        fileName: debugFileName(problem.uri),
        filePath: problem.uri,
        startLineNumber: start.line + 1,
        endLineNumber: start.line + 1,
        startCharacterNumber: start.character + 1,
        endCharacterNumber: start.character + line.trim().length + 1,
      });
    }
  }

  protected maybeReseedBinaryTable(): void {
    const size = this._binaryTable.strings.length;
    if (this._binaryTableBaseline === 0) {
      this._binaryTableBaseline = size;
      return;
    }
    const grown = size - this._binaryTableBaseline;
    if (
      size > this._binaryTableBaseline * BINARY_TABLE_RESEED_RATIO &&
      grown > BINARY_TABLE_RESEED_MIN_SLACK
    ) {
      if (this._chunkStore) {
        this._chunkStore.reseed();
      } else {
        reseedProgramTable(this._binaryTable);
      }
      this._binaryTableBaseline = 0;
    }
  }

  protected statementRecord(
    block: CompiledBlock,
    from: number,
    to: number,
    line: number,
    uri: string,
  ): StatementRecord {
    const kept = this._blockRecords.get(block);
    if (kept && kept.place.uri === uri) {
      kept.place.from = from;
      kept.place.to = to;
      kept.record.line = line;
      return kept.record;
    }
    const place = { from, to, uri };
    const shape = block.statement;
    const endOf = () =>
      shape ? Math.max(place.to, place.from + shape.to) : place.to;
    let source: string | undefined;
    let syntax: string | undefined;
    const textOf = (a: number, b: number) =>
      this.documents.get(uri)?.getText().slice(a, b) ?? "";
    const sourceOf = () => (source ??= textOf(place.from, endOf()));
    const fingerprintOf = (
      a: number,
      b: number,
      cuts: readonly { from: number; to: number }[] = [],
    ) =>
      fingerprintSource(
        this.documents.tree(uri),
        this.documents.get(uri)?.getText() ?? "",
        place.from + a,
        place.from + b,
        cuts.map((cut) => ({ from: place.from + cut.from, to: place.from + cut.to })),
      );
    let fingerprint: string | undefined;
    const columnOf = () =>
      this.documents.get(uri)?.positionAt(place.from).character ?? 0;
    const first = block.content?.[0];
    const record: StatementRecord = {
      uri,
      line,
      source: sourceOf,
      fingerprint: () => (fingerprint ??= fingerprintOf(0, endOf() - place.from)),
      fingerprintOf,
      syntax: () =>
        (syntax ??= `${block.node ?? ""}\u0000${columnOf()}\u0000${sourceOf()}`),
      reads: JSON.stringify([
        [...(block.globalCallableReads ?? [])],
        [...(block.defineTypeReads ?? [])],
        block.reads ?? [],
      ]),
      range: first?.ownDebugMetadata ?? null,
      shape,
      lineAt: (offset) =>
        this.documents.get(uri)?.lineAt(place.from + offset) ?? record.line,
      columnAt: (offset) =>
        this.documents.get(uri)?.positionAt(place.from + offset).character ?? 0,
      text: (a, b) => textOf(place.from + a, place.from + b),
      lineEnd: (at) => {
        const document = this.documents.get(uri);
        if (!document) {
          return 0;
        }
        const text = document.getText();
        const start = document.offsetAt({ line: at, character: 0 });
        const end = text.indexOf("\n", start);
        return (end < 0 ? text.length : end) - start;
      },
    };
    this._blockRecords.set(block, { record, place });
    return record;
  }

  protected recordSparkleDeclarations(
    sparkle: NonNullable<CompiledBlock["sparkle"]>,
    uri: string,
    rootUri: string,
    state: SparkdownCompilerState,
    source: SourceMetadata,
    onDiagnostic: (
      message: string,
      type: ErrorType,
      source: SourceMetadata | null,
    ) => void,
  ): boolean {
    const declared = (state.sparkleDeclaredAt ??= new Map());
    let collides = false;
    for (const [kind, label] of [
      ["layouts", "Layout"],
      ["components", "Component"],
    ] as const) {
      for (const name of Object.keys(sparkle[kind] ?? {})) {
        const key = `${kind}:${name}`;
        const first = declared.get(key);
        if (!first || first.uri === uri) {
          declared.set(key, { uri, source });
          continue;
        }
        collides = true;
        const message = `${label} \`${name}\` is declared in ${displayScriptPath(first.uri, rootUri, this._config.uriPathsAsWritten)} and in ${displayScriptPath(uri, rootUri, this._config.uriPathsAsWritten)}. Declare it in one script.`;
        onDiagnostic(message, ErrorType.Error, first.source);
        onDiagnostic(message, ErrorType.Error, source);
      }
    }
    return collides;
  }

  protected noteMemos(block: CompiledBlock, record: StatementRecord): void {
    if (block.memoized?.length) {
      this._memoBlocks.add(block);
    }
    if (!this._prevCompilationIds?.has(block)) {
      this.addMemoCandidates(block, record);
    }
  }

  protected addMemoCandidates(
    block: CompiledBlock,
    record: StatementRecord,
  ): void {
    if (!block.statement || !record.lineAt || !record.text) {
      return;
    }
    for (const shape of memosOf(block.statement).lowered) {
      const text = record.text(shape.from, shape.to);
      const skipped = text.length - text.replace(/^[ \t]+/, "").length;
      const candidate: MemoCandidate = {
        entry: shape.memo!,
        objects: shape.objects,
        line: record.lineAt(shape.from + skipped) + 1,
        endLine: record.lineAt(shape.to) + 1,
        nested: shape.bodies.length > 0 ? nestedObjects(shape) : undefined,
      };
      for (const obj of shape.objects) {
        this._memoCandidates.set(obj, candidate);
      }
    }
  }

  protected dropNumberedMemos(): void {
    for (const [obj, candidate] of this._memoCandidates) {
      if (
        !candidate.objects.every((held) => this.isSynthFree(held)) &&
        !ownsItsNumbering(candidate)
      ) {
        this._memoCandidates.delete(obj);
      }
    }
  }

  protected noteCarriedMemos(blocks: Iterable<object>): void {
    let added = false;
    for (const block of blocks) {
      const record = this._statementRecords.get(block);
      if (record && this._prevCompilationIds?.has(block)) {
        this.addMemoCandidates(block as CompiledBlock, record);
        added = true;
      }
    }
    if (added) {
      this.dropNumberedMemos();
    }
  }

  protected completeMemos(): void {
    const resolutions = this._programResolver?.memoResolutionsLastResolve;
    const store = this._chunkStore;
    if (!resolutions || !store || resolutions.size === 0) {
      return;
    }
    const candidates = new Map<StatementMemoEntry, MemoCandidate>();
    for (const candidate of this._memoCandidates.values()) {
      candidates.set(candidate.entry, candidate);
    }
    for (const [entry, resolution] of resolutions) {
      if (!candidates.has(entry)) {
        continue;
      }
      const chunk = store.memoChunk(entry);
      if (chunk) {
        entry.resolution = resolution;
        entry.chunk = chunk;
        entry.generation = store.table.generation;
      }
    }
  }

  protected isSynthFree(obj: ParsedObject): boolean {
    for (let at: ParsedObject | null = obj; at; at = at.parent) {
      const marked = this._synthFreeSubtrees.get(at);
      if (marked !== undefined && marked === (at.content?.length ?? 0)) {
        return true;
      }
    }
    return false;
  }

  protected relowerMemos(retry: StatementMemoRetry, all: boolean): void {
    const entries = new Set(retry.entries);
    const ranges = new Map<string, { from: number; to: number }[]>();
    for (const block of this._memoBlocks) {
      const served = memosOf(block.statement).served;
      const stale = all ? served : served.filter((shape) => entries.has(shape.memo!));
      const place = this._blockRecords.get(block)?.place;
      if (stale.length === 0 || !place) {
        continue;
      }
      for (const shape of stale) {
        const memo = shape.memo!;
        if (!memo.stale) {
          this._previewUndo?.push(() => {
            memo.stale = false;
          });
        }
        memo.stale = true;
      }
      let list = ranges.get(place.uri);
      if (!list) {
        list = [];
        ranges.set(place.uri, list);
      }
      list.push({ from: place.from, to: place.to });
    }
    const enabled = this._memoHost.enabled;
    this._memoHost.enabled = enabled && !all;
    try {
      for (const [uri, list] of ranges) {
        this.documents.relowerCompilations(uri, list);
      }
    } finally {
      this._memoHost.enabled = enabled;
    }
  }

  memoStats(uri: string): MemoStats | undefined {
    return this.documents.memoStats(uri);
  }

  protected buildProgramChunks(
    parsedStory: Story,
    tables: ProgramStoryTables,
    program: SparkProgram,
    uri: string,
    runFiles: ReadonlyMap<string, string> = new Map(),
  ): boolean {
    profile("start", this._profilerId, "program/chunks", uri);
    const lineCount = (scriptUri: string) => {
      const document = this.documents.get(scriptUri);
      return document ? document.lineAt(document.getText().length) + 1 : 0;
    };
    const flows = programFlows({
      story: parsedStory,
      uri,
      preludeUri: BUILTINS_PRELUDE_URI,
      blockOf: (obj) => this._placedBy.get(obj),
      record: (block) =>
        this._statementRecords.get(block) ??
        this._preludeStatementRecords.get(block),
      lineCount,
      flowEndLine: (() => {
        const byScript = new Map<string, Map<number, number>>();
        return (scriptUri: string, header: number) => {
          let ends = byScript.get(scriptUri);
          if (!ends) {
            ends = new Map(this.flowEndsOf(scriptUri));
            byScript.set(scriptUri, ends);
          }
          return ends.get(header);
        };
      })(),
    });
    this._chunkStore ??= new ChunkStore(this._binaryTable);
    const changed =
      this._chunkStoreBlocks && this._chunkStore.current
        ? this._chunkStoreChanges
        : undefined;
    const build = this._chunkStore.build(
      {
        flows: flows.flows,
        declarations: flows.declarations,
        lineCount,
        changed,
        runFiles: runFileRecord(
          runFiles,
          projectRootUri(uri),
          this._config.uriPathsAsWritten,
        ),
      },
      !this._previewing && !flows.unsupported,
      { ...tables, luauEntry: hasLuauExtension(uri) },
    );
    if (build.root && this._chunkStore.current === build.root) {
      this._chunkStoreBlocks = this._compilationIds;
      this.completeMemos();
      this._programResolver?.committed();
    }
    const unsupported = flows.unsupported ?? build.unsupported;
    for (const [construct, count] of Object.entries(flows.unsupportedCounts)) {
      build.coverage.unsupported[construct] =
        (build.coverage.unsupported[construct] ?? 0) + count;
    }
    this.lastProgramBuild = {
      ...build,
      root: unsupported ? undefined : build.root,
      unsupported,
      declarations: flows.declarations.length,
      functions: flows.functions,
    };
    this._unsupported = unsupported;
    if (!unsupported) {
      program.chunks = build.root;
      this.maybeReseedBinaryTable();
    }
    profile("end", this._profilerId, "program/chunks", uri);
    return !unsupported;
  }

  protected reportUnsupportedConstruct(
    unsupported: UnsupportedConstructSite,
    program: SparkProgram,
    onDiagnostic: (
      message: string,
      type: ErrorType,
      source: SourceMetadata | null,
    ) => void,
  ): void {
    const message = unsupportedConstructMessage(unsupported.construct);
    const line = unsupported.line;
    const reported = program.diagnostics?.[unsupported.uri]?.some(
      (d) =>
        d.severity === DiagnosticSeverity.Error &&
        (d.range.start.line === line ||
          (typeof d.message === "string" ? d.message : d.message.value) ===
            message),
    );
    if (reported) {
      return;
    }
    onDiagnostic(message, ErrorType.Error, this.lineSource(unsupported.uri, line));
  }

  protected reportCompileThrow(
    e: unknown,
    uri: string,
    program: SparkProgram,
    onDiagnostic: (
      message: string,
      type: ErrorType,
      source: SourceMetadata | null,
    ) => void,
  ): void {
    const site = e instanceof StatementFailure ? e : undefined;
    if (
      site &&
      program.diagnostics?.[site.uri]?.some(
        (d) =>
          d.severity === DiagnosticSeverity.Error &&
          d.range.start.line >= site.line &&
          d.range.start.line <= site.endLine,
      )
    ) {
      return;
    }
    const cause = site ? site.error : e;
    const detail = cause instanceof Error ? cause.message : String(cause);
    onDiagnostic(
      `The compile stopped ${site ? "at this statement" : "in this script"}, so no program was made: ${detail}`,
      ErrorType.Error,
      this.lineSource(site?.uri ?? uri, site?.line ?? 0),
    );
  }

  protected lineSource(uri: string, line: number): SourceMetadata {
    const text = this.documents.get(uri)?.getText().split("\n")[line] ?? "";
    const blank = text.trim() === "";
    return {
      filePath: uri,
      startLineNumber: line + 1,
      startCharacterNumber: blank ? 1 : 1 + (text.length - text.trimStart().length),
      endLineNumber: line + 1,
      endCharacterNumber: 1 + (blank ? text.length : text.trimEnd().length),
    } as SourceMetadata;
  }

  get chunkStore(): ChunkStore | undefined {
    return this._chunkStore;
  }

  get programResolver(): ProgramResolver | undefined {
    return this._programResolver;
  }

  populateSceneAssets(program: SparkProgram) {
    const accum = this._flowAssetAccum;
    if (!accum) {
      return;
    }
    const functionNames = new Set(
      Object.keys(program.functionLocations ?? {}),
    );
    const isInternal = (name: string) =>
      functionNames.has(name) ||
      CANONICAL_SYNTH_NAME.test(name) ||
      name.startsWith("__");
    const addUnique = (list: string[], seen: Set<string>, value: string) => {
      if (!seen.has(value)) {
        seen.add(value);
        list.push(value);
      }
    };
    type Names = { image: string[]; audio: string[]; layouts: string[]; loads: string[] };
    type Own = Names & {
      capture: SceneAssetCapture;
      successors: string[];
      calls: string[];
    };
    const NAME_KEYS = ["image", "audio", "layouts", "loads"] as const;
    const own = new Map<string, Own>();
    for (const [name, capture] of accum) {
      const entry: Own = {
        capture,
        image: [],
        audio: [],
        layouts: [],
        loads: [],
        successors: [],
        calls: [],
      };
      const seen = {
        image: new Set<string>(),
        audio: new Set<string>(),
        layouts: new Set<string>(),
        loads: new Set<string>(),
      };
      for (const beat of capture.beats) {
        for (const key of NAME_KEYS) {
          for (const n of beat[key] ?? []) {
            addUnique(entry[key], seen[key], n);
          }
        }
      }
      const seenSuccessors = new Set<string>();
      const seenCalls = new Set<string>();
      for (const edge of capture.edges) {
        if (edge.target === name) {
          continue;
        }
        if (edge.call || isInternal(edge.target)) {
          addUnique(entry.calls, seenCalls, edge.target);
        } else {
          addUnique(entry.successors, seenSuccessors, edge.target);
        }
      }
      own.set(name, entry);
    }
    const sceneAssets: NonNullable<SparkProgram["sceneAssets"]> = {};
    for (const [name, entry] of own) {
      const names: Names = {
        image: [...entry.image],
        audio: [...entry.audio],
        layouts: [...entry.layouts],
        loads: [...entry.loads],
      };
      const seen = {
        image: new Set(names.image),
        audio: new Set(names.audio),
        layouts: new Set(names.layouts),
        loads: new Set(names.loads),
      };
      let dynamic = entry.capture.dynamic;
      const dynamicBases = [...entry.capture.dynamicBases];
      const visited = new Set<string>([name]);
      const pending = [...entry.calls];
      while (pending.length > 0) {
        const callee = pending.pop()!;
        if (visited.has(callee)) {
          continue;
        }
        visited.add(callee);
        const c = own.get(callee);
        if (!c) {
          continue;
        }
        for (const key of NAME_KEYS) {
          for (const n of c[key]) {
            addUnique(names[key], seen[key], n);
          }
        }
        if (c.capture.dynamic) {
          dynamic = true;
        }
        for (const b of c.capture.dynamicBases) {
          if (!dynamicBases.includes(b)) {
            dynamicBases.push(b);
          }
        }
        pending.push(...c.calls);
      }
      const result: SceneAssets = {
        kind: name === "0" ? "root" : isInternal(name) ? "function" : "scene",
        beats: [...entry.capture.beats],
        ...names,
        successors: entry.successors,
        calls: entry.calls,
      };
      if (dynamic) {
        result.dynamic = true;
        if (dynamicBases.length > 0) {
          result.dynamicBases = dynamicBases;
        }
      }
      sceneAssets[name] = result;
    }
    program.sceneAssets = sceneAssets;
  }

  populateFiles(program: SparkProgram) {
    const uri = program.uri;
    profile("start", this._profilerId, "populateFiles", uri);
    for (const file of this.projectFilesOf(uri)) {
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

  flowEndsOf(uri: string): [headerLine: number, endLine: number][] {
    const doc = this.documents.get(uri);
    const cur = doc ? this.documents.annotations(uri).declarations.iter() : undefined;
    const ends: [number, number][] = [];
    if (!doc || !cur) {
      return ends;
    }
    let open: { kind: "scene" | "branch"; line: number }[] = [];
    while (cur.value) {
      const type = cur.value.type;
      if (type === "scene") {
        open = [{ kind: "scene", line: doc.lineAt(cur.from) }];
      } else if (type === "branch") {
        open.length = open.findLastIndex((p) => p.kind === "scene") + 1;
        open.push({ kind: "branch", line: doc.lineAt(cur.from) });
      } else if (type === "end") {
        const closed = open.pop();
        if (closed) {
          ends.push([closed.line, doc.lineAt(cur.from)]);
        }
      }
      cur.next();
    }
    return ends;
  }

  structureOf(uri: string): ScriptStructure {
    const doc = this.documents.get(uri);
    const tree = doc ? this.documents.tree(uri) : undefined;
    const loops: ScriptLoop[] = [];
    const bodies: ScriptBody[] = [];
    if (!doc || !tree) {
      return { loops, bodies };
    }
    tree.iterate({
      enter: (node) => {
        const first = doc.lineAt(node.from);
        const last = doc.lineAt(Math.max(node.from, node.to - 1));
        const repeat = REPEAT_LOOP_NODES.has(node.name);
        if (repeat || OTHER_LOOP_NODES.has(node.name)) {
          loops.push({ header: first, end: last, repeat });
        } else if (FUNCTION_BODY_NODES.has(node.name)) {
          bodies.push({ start: first, end: last });
        }
      },
    });
    return { loops, bodies };
  }

  populateDeclarationLocations(program: SparkProgram) {
    const uri = program.uri;
    profile("start", this._profilerId, "populateDeclarationLocations", uri);
    const scripts = Object.keys(program.scripts);
    for (const uri of scripts) {
      const doc = this.documents.get(uri);
      const scriptIndex = scripts.indexOf(uri);
      const ends = this.flowEndsOf(uri);
      if (ends.length > 0) {
        program.flowEnds ??= {};
        program.flowEnds[uri] = ends;
      }
      if (doc) {
        const annotations = this.documents.annotations(uri);
        const cur = annotations.declarations.iter();
        let scopePathParts: {
          kind: "scene" | "branch" | "label";
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
            if (cur.value.type === "end") {
              const closed = scopePathParts.findLastIndex(
                (p) => p.kind === "scene" || p.kind === "branch",
              );
              if (closed >= 0) {
                scopePathParts.length = closed;
              }
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
            if (cur.value.type === "branch") {
              scopePathParts.length =
                scopePathParts.findLastIndex((p) => p.kind === "scene") + 1;
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
            if (cur.value.type === "label") {
              if (scopePathParts.at(-1)?.kind === "label") {
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
    const ids = this._contextKeyIds ?? [];
    const configKey = `${!!this._config.useBuiltinsPrelude}|${!!this._config
      .stripImageData}`;
    const cached = this._contextBase;
    const reusable =
      cached !== undefined &&
      cached.uri === uri &&
      cached.filesEpoch === this._filesEpoch &&
      cached.configKey === configKey &&
      cached.ids.length === ids.length &&
      cached.ids.every((id, i) => id === ids[i]);
    if (!reusable) {
      this.buildContextBase(state, program, ids, configKey);
    }
    const base = this._contextBase!;
    profile("start", this._profilerId, "contextLayerCopy", uri);
    const layer: { [type: string]: { [name: string]: any } } = {};
    for (const [type, structs] of Object.entries(base.context)) {
      layer[type] = structs;
    }
    program.context = layer;
    this._contextLayerTypes = new Set();
    this._contextLayerAdded = [];
    profile("end", this._profilerId, "contextLayerCopy", uri);
    profile("start", this._profilerId, "contextDiagnosticsReplay", uri);
    for (const [diagnosticUri, diagnostics] of Object.entries(
      base.diagnostics,
    )) {
      if (diagnostics.length > 0) {
        ((program.diagnostics ??= {})[diagnosticUri] ??= []).push(
          ...diagnostics,
        );
      }
    }
    profile("end", this._profilerId, "contextDiagnosticsReplay", uri);
    this.populateImplicitDefs(state, program);
    const layerSignature = (this._contextLayerAdded ?? []).join(",");
    const serials = (this._contextLayerSerials ??= new Map());
    let layerSerial = serials.get(layerSignature);
    if (layerSerial === undefined) {
      layerSerial = ++this._contextLayerSerialCounter;
      if (serials.size >= 64) {
        serials.clear();
      }
      serials.set(layerSignature, layerSerial);
    }
    program.contextRevision = `${this._contextRevisionToken}:${base.revision}:${layerSerial}`;
    profile("end", this._profilerId, "buildContext", uri);
  }

  protected buildContextBase(
    state: SparkdownCompilerState,
    program: SparkProgram,
    ids: object[],
    configKey: string,
  ) {
    const uri = program.uri;
    profile("start", this._profilerId, "buildContextBase", uri);
    const context: { [type: string]: { [name: string]: any } } = {};
    const staging = {
      uri,
      scripts: program.scripts,
      files: program.files,
      context,
      diagnostics: {} as { [uri: string]: SparkDiagnostic[] },
    } as SparkProgram;
    if (this._config.useBuiltinsPrelude) {
      this.mergePreludeContext(staging);
    } else {
      this.populateBuiltins(staging);
    }
    const REPLACE_TYPES = new Set(["layout", "screen", "component"]);
    for (const contribution of this._contextContributions ?? []) {
      for (const [type, structs] of Object.entries(contribution) as [
        string,
        Record<string, any>,
      ][]) {
        for (const [name, struct] of Object.entries(structs)) {
          const existing = getContextEntry(context, type, name);
          setContextEntry(context, type, name,
            existing && !REPLACE_TYPES.has(type)
              ? this.inheritDefaults(existing, struct)
              : struct,
          );
        }
      }
    }
    this.populateAssets(state, staging);
    this.populateImplicitImageDefs(staging);
    this.populateDefinedDefaultProperties(state, staging);
    this._contextBaseBuilds++;
    this._contextBase = {
      uri,
      ids: ids.slice(),
      filesEpoch: this._filesEpoch,
      configKey,
      context,
      diagnostics: staging.diagnostics ?? {},
      revision: ++this._contextRevisionCounter,
    };
    this._implicitDefCache = undefined;
    profile("end", this._profilerId, "buildContextBase", uri);
  }

  protected addImplicitDef(
    program: SparkProgram,
    type: string,
    name: string,
    build: () => any,
  ): boolean {
    const context = (program.context ??= {});
    if (getContextEntry(context, type, name)) {
      return false;
    }
    const key = `${type}/${name}`;
    const cache = (this._implicitDefCache ??= new Map());
    let struct = cache.get(key);
    if (struct === undefined) {
      struct = build();
      const defaultStruct = context[type]?.["$default"];
      if (
        defaultStruct &&
        typeof defaultStruct === "object" &&
        struct &&
        typeof struct === "object" &&
        !Array.isArray(struct)
      ) {
        struct = this.inheritDefaults(defaultStruct, struct);
      }
      cache.set(key, struct);
    }
    const layerTypes = (this._contextLayerTypes ??= new Set());
    if (!layerTypes.has(type)) {
      context[type] = { ...context[type] };
      layerTypes.add(type);
    }
    setContextEntry(context, type, name, struct);
    (this._contextLayerAdded ??= []).push(key);
    return true;
  }

  populateEngineChannels(program: SparkProgram) {
    const uri = program.uri;
    profile("start", this._profilerId, "populateEngineChannels", uri);
    const channels = (this._engineChannelCache ??= new Map());
    const channelFor = (
      type: string,
      derive: (structs: { [name: string]: any }) => { [name: string]: any },
    ) => {
      const source = program.context?.[type];
      if (!source) {
        return undefined;
      }
      const hit = channels.get(type);
      if (hit && hit.source === source) {
        return hit.value;
      }
      const value = derive(source);
      channels.set(type, { source, value });
      return value;
    };
    const layouts = channelFor("layout", structuredClone);
    if (layouts) {
      program.layouts = layouts;
    }
    const screens = channelFor("screen", structuredClone);
    if (screens) {
      program.screens = screens;
    }
    const components = channelFor("component", structuredClone);
    if (components) {
      program.components = components;
    }
    const styles = channelFor("style", structuredClone);
    if (styles) {
      program.styles = styles;
    }
    const ASSET_TYPES = ["image", "audio", "font", "video", "layered_image", "filtered_image"];
    for (const type of ASSET_TYPES) {
      const assets = channelFor(type, cloneSharingVocabularies);
      if (assets) {
        program.assets ??= {};
        program.assets[type] = assets;
      }
    }
    profile("end", this._profilerId, "populateEngineChannels", uri);
  }

  protected applyBuiltinOverrides(
    preludeVAs: ReadonlySet<ParsedObject>,
  ): void {
    for (const obj of preludeVAs) {
      if (obj instanceof ParsedVariableAssignment) {
        obj.isPreludeDeclaration = true;
      }
    }
  }

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

  mergePreludeSparkle(program: SparkProgram) {
    const uri = program.uri;
    profile("start", this._profilerId, "mergePreludeSparkle", uri);
    const { sparkle } = getCompiledPrelude();
    for (const kind of ["layouts", "screens", "components"] as const) {
      const trees = sparkle[kind];
      if (trees) {
        program.sparkle ??= {};
        program.sparkle[kind] ??= {};
        for (const [name, tree] of Object.entries(trees)) {
          program.sparkle[kind]![name] = structuredClone(tree) as any;
        }
      }
    }
    profile("end", this._profilerId, "mergePreludeSparkle", uri);
  }

  protected reportBuiltinGlobalCollisions(
    parsedStory: Story,
    names: ReadonlySet<string>,
    program: SparkProgram,
    uri: string,
  ): void {
    const reported = new Set<string>();
    const report = (
      message: string,
      dm: DebugMetadata | null | undefined,
      name: string,
      exact: boolean,
      severity: DiagnosticSeverity = DiagnosticSeverity.Error,
    ): void => {
      if (!dm) {
        return;
      }
      const diagUri = dm.filePath || uri;
      const line = dm.startLineNumber - 1;
      let startCharacter = dm.startCharacterNumber - 1;
      let endLine = dm.endLineNumber - 1;
      let endCharacter = dm.endCharacterNumber - 1;
      if (!exact) {
        const lineText = this.documents.get(diagUri)?.getText({
          start: { line, character: 0 },
          end: { line: line + 1, character: 0 },
        });
        const at = lineText ? indexOfWord(lineText, name) : -1;
        if (at >= 0) {
          startCharacter = at;
          endLine = line;
          endCharacter = at + name.length;
        }
      }
      const key = `${diagUri}:${line}:${startCharacter}:${message}`;
      if (reported.has(key)) {
        return;
      }
      reported.add(key);
      const diagnostic = this.getDiagnostic(
        message,
        severity,
        diagUri,
        line,
        startCharacter,
        endLine,
        endCharacter,
      );
      if (diagnostic) {
        program.diagnostics ??= {};
        program.diagnostics[diagUri] ??= [];
        program.diagnostics[diagUri].push(diagnostic);
      }
    };
    for (const child of parsedStory.content ?? []) {
      if (child instanceof FlowBase) {
        const name = child.identifier?.name;
        if (name && names.has(name)) {
          report(
            `\`${name}\` is a builtin global, so it cannot also be the name of a scene or function`,
            child.debugMetadata,
            name,
            false,
          );
        }
      }
    }
    for (const { name, divert, warning } of parsedStory.builtinGlobalDiverts) {
      const target = divert instanceof Divert ? divert.pathIdentifiers?.[0] : null;
      const stamped = target?.debugMetadata ?? null;
      report(
        warning
          ? `\`${name}\` is a builtin global; unless the \`${name}\` this divert reads holds a divert target when it runs, the divert binds to the builtin and cannot reach a scene, branch, or label named \`${name}\``
          : `\`${name}\` is a builtin global, so this divert binds to it and cannot reach a scene, branch, or label named \`${name}\``,
        stamped ?? divert.debugMetadata,
        name,
        stamped !== null,
        warning ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error,
      );
    }
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
    const files = this.projectFilesOf(uri);
    const rasterAliases = new Map<string, number>();
    for (const file of files) {
      if (isRasterLayerFile(file))
        rasterAliases.set(file.name, (rasterAliases.get(file.name) ?? 0) + 1);
    }
    if (files) {
      const claimedBy = new Map<string, string>();
      const flaggedCollision = new Set<string>();
      for (const file of files) {
        const rasterFile = isRasterLayerFile(file);
        const rasterPath = rasterFile ? decodeURIComponent(new URL(file.uri).pathname) : "";
        const rasterFolder = rasterPath.split("/").at(-2) ?? "";
        const explicitRaster = rasterFile && getContextEntry(state.structDefinitions, "layered_image", rasterFolder) !== undefined;
        if (rasterFile && !explicitRaster && rasterAliases.get(file.name)! > 1) continue;
        const type = file.type;
        const name = file.name;
        if (name && type !== "script") {
          const key = `${type}/${name}`;
          const firstUri = claimedBy.get(key);
          if (firstUri === undefined) {
            claimedBy.set(key, file.uri);
          } else if (firstUri !== file.uri) {
            this.pushAssetCollisionDiagnostic(
              program,
              file.uri,
              firstUri,
              type,
              name,
            );
            if (!flaggedCollision.has(key)) {
              this.pushAssetCollisionDiagnostic(
                program,
                firstUri,
                file.uri,
                type,
                name,
              );
              flaggedCollision.add(key);
            }
          }
        }
        program.context[type] ??= {};
        if (!Object.hasOwn(program.context[type], name)) {
          Object.defineProperty(program.context[type], name, {
            value: { $type: type, $name: name },
            enumerable: true,
            configurable: true,
            writable: true,
          });
        }
        const definitions = state.structDefinitions?.[type];
        const definedFile = definitions && Object.hasOwn(definitions, name)
          ? definitions[name]
          : undefined;
        const contextFile = program.context[type][name] || {};
        if (contextFile["$type"] === undefined) {
          contextFile["$type"] = type;
        }
        if (contextFile["$name"] === undefined) {
          contextFile["$name"] = name;
        }
        if (definedFile?.["src"] === undefined) {
          contextFile["src"] = file["src"];
        }
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
        if (this._config.stripImageData) {
          delete program.context[type][name].data;
        }
        if (explicitRaster) {
          const filename = rasterPath.split("/").at(-1)!;
          const stem = filename.slice(0, -(file.ext.length + 1));
          if (stem !== name) {
            const key = `${type}/${stem}`;
            const firstUri = claimedBy.get(key);
            if (firstUri && firstUri !== file.uri) {
              this.pushAssetCollisionDiagnostic(program, file.uri, firstUri, type, stem);
              if (!flaggedCollision.has(key)) {
                this.pushAssetCollisionDiagnostic(program, firstUri, file.uri, type, stem);
                flaggedCollision.add(key);
              }
            } else {
              claimedBy.set(key, file.uri);
            }
            program.context[type][stem] = { ...program.context[type][name], $name: stem, name: stem };
          }
        }
      }
    }
    const raster = createRasterImageDefinitions(files);
    Object.assign(program.context["image"] ??= {}, raster.images);
    for (const diagnostic of raster.diagnostics) {
      if (getContextEntry(state.structDefinitions, "layered_image", diagnostic.folder)) continue;
      const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
      ((program.diagnostics ??= {})[diagnostic.uri] ??= []).push({
        range, severity: DiagnosticSeverity.Warning,
        message: { kind: "markdown", value: diagnostic.message }, source: LANGUAGE_NAME,
      });
    }
    for (const { name, firstUri, otherUri } of raster.collisions) {
      if (getContextEntry(state.structDefinitions, "layered_image", name)) continue;
      this.pushAssetCollisionDiagnostic(program, firstUri, otherUri, "layered_image", name);
      this.pushAssetCollisionDiagnostic(program, otherUri, firstUri, "layered_image", name);
    }
    for (const [name, image] of Object.entries(raster.layeredImages)) {
      const ordinary = getContextEntry(program.context, "image", name);
      if (ordinary && !getContextEntry(state.structDefinitions, "layered_image", name)) {
        const firstUri = raster.origins[name]!;
        const otherUri = ordinary.uri ?? program.uri;
        this.pushAssetCollisionDiagnostic(program, firstUri, otherUri, "image", name);
        this.pushAssetCollisionDiagnostic(program, otherUri, firstUri, "image", name);
      }
      if (!ordinary && !getContextEntry(program.context, "layered_image", name)) {
        setContextEntry(program.context, "layered_image", name, image);
      }
    }
    const characters = new Map<string, any[]>();
    for (const image of Object.values({ ...program.context["image"], ...program.context["layered_image"] })) {
      if (!image.attribute_vocabulary) continue;
      const character = image.$name.split("_")[0];
      const images = characters.get(character) ?? [];
      images.push(image);
      characters.set(character, images);
    }
    for (const images of characters.values()) {
      const rare = diagnoseRareAttributeOptions(images.map((image) => image.attribute_vocabulary));
      for (const image of images) {
        const vocabulary = image.attribute_vocabulary as AttributeVocabulary;
        image.attribute_vocabulary = { ...vocabulary, diagnostics: [
          ...vocabulary.diagnostics.filter((diagnostic) => diagnostic.code !== "rare-attribute-option"),
          ...rare.filter((diagnostic) => vocabulary.layers.some((layer) => layer.name === diagnostic.layer && layer.key === diagnostic.path)),
        ] };
      }
    }
    profile("end", this._profilerId, "populateAssets", uri);
  }

  protected pushAssetCollisionDiagnostic(
    program: SparkProgram,
    targetUri: string,
    otherUri: string,
    type: string,
    name: string,
  ) {
    const range = {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    };
    program.diagnostics ??= {};
    program.diagnostics[targetUri] ??= [];
    program.diagnostics[targetUri].push({
      range,
      severity: DiagnosticSeverity.Warning,
      message: {
        value: `Asset name collision: \`${name}\` (${type}) is provided by more than one file. Asset names are shared across the project, so a script that references \`${name}\` is ambiguous — rename or remove one of the files.`,
        kind: "markdown",
      },
      relatedInformation: [
        {
          location: { uri: otherUri, range },
          message: `also provides \`${name}\``,
        },
      ],
      source: LANGUAGE_NAME,
    });
  }

  populateImplicitImageDefs(program: SparkProgram) {
    const uri = program.uri;
    profile("start", this._profilerId, "populateImplicitImageDefs", uri);
    const images = { ...program.context?.["image"], ...program.context?.["layered_image"] };
    if (images) {
      for (const image of Object.values(images)) {
        if (image["ext"]?.toLowerCase() === "svg" || image["data"] || image.attribute_vocabulary) {
          const type = image["$type"];
          const name = image["$name"];
          const implicitType = "filtered_image";
          program.context ??= {};
          if (!getContextEntry(program.context, implicitType, name)) {
            setContextEntry(program.context, implicitType, name, {
              $type: implicitType,
              $name: name,
              image: { $type: type, $name: name },
              attributes: [],
            });
          }
        }
      }
    }
    profile("end", this._profilerId, "populateImplicitImageDefs", uri);
  }

  populateImplicitDefs(_state: SparkdownCompilerState, program: SparkProgram) {
    const uri = program.uri;
    profile("start", this._profilerId, "populateImplicitDefs", uri);
    const resolvedImplicits = new Set<string>();
    for (const uri of Object.keys(program.scripts)) {
      const doc = this.documents.get(uri);
      if (doc) {
        const annotations = this.documents.annotations(uri);
        const cur = annotations.implicits.iter();
        while (cur.value) {
          const text = doc.read(cur.from, cur.to).trim();
          if (!resolvedImplicits.has(text)) {
            resolvedImplicits.add(text);
            const type = cur.value.type;
            const parts = text.split(/[:~]/).map((part) => part.trim());
            const [fileName, ...attributes] = parts;
            const name = parts.join("~");
            this.addImplicitDef(program, type, name, () => ({
              $type: type,
              $name: name,
              image: { $name: fileName },
              attributes,
            }));
          }
          cur.next();
        }
      }
    }
    profile("end", this._profilerId, "populateImplicitDefs", uri);
  }

  populateDefinedDefaultProperties(
    _state: SparkdownCompilerState,
    program: SparkProgram,
  ) {
    const uri = program.uri;
    profile("start", this._profilerId, "populateDefinedDefaultProperties", uri);
    const context = program.context;
    if (context) {
      for (const structs of Object.values(context)) {
        const defaultStruct = (structs as Record<string, any>)?.["$default"];
        if (!defaultStruct || typeof defaultStruct !== "object") {
          continue;
        }
        for (const [name, struct] of Object.entries(structs)) {
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
    for (const [k, bv] of Object.entries(base)) {
      if (k.startsWith("$")) {
        continue;
      }
      result[k] =
        typeof bv === "object" && bv !== null ? structuredClone(bv) : bv;
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
                message: diagnosticMarkup(diagnostic.message),
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

  validateImageAttributes(program: SparkProgram) {
    if (!program.context) return;
    const artworkUri = (image: any, path?: string): string | undefined => {
      if (image?.$type === "layered_image") {
        const reference: any = image.assets?.[path ?? "0"] ?? Object.values(image.assets ?? {})[0];
        const source = reference?.$name ? getContextEntry(program.context, "image", reference.$name) : undefined;
        if (source?.uri) return source.uri;
      }
      return image?.uri;
    };
    const artworkEmitted = new Set<string>();
    const assetRange = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
    const lookDeclarations = new Map<any, { uri: string; order: number; from: number; to: number }>();
    for (const image of Object.values({ ...program.context["image"], ...program.context["layered_image"] })) {
      const resolved = resolveImageAttributes(program.context, image);
      for (const diagnostic of resolved.vocabulary?.diagnostics ?? []) {
        const targetUri = artworkUri(resolved.image, diagnostic.path);
        if (!targetUri) continue;
        const key = JSON.stringify([targetUri, diagnostic.code, diagnostic.path, diagnostic.message]);
        if (artworkEmitted.has(key)) continue;
        artworkEmitted.add(key);
        ((program.diagnostics ??= {})[targetUri] ??= []).push({
          range: assetRange,
          severity: diagnostic.severity === "error" ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
          message: { kind: "markdown", value: diagnostic.message + (diagnostic.path ? ' (Layer hierarchy: ' + diagnostic.path + '.)' : '') },
          source: LANGUAGE_NAME,
        });
      }
    }
    for (const [order, uri] of Object.keys(program.scripts).entries()) {
      const doc = this.documents.get(uri);
      if (!doc) continue;
      const annotations = this.documents.annotations(uri);
      const emitted = new Set<string>();
      const emit = (struct: any, from: number, to: number) => {
        const resolved = resolveImageAttributes(program.context!, struct);
        for (const diagnostic of resolved.diagnostics) {
          if (resolved.vocabulary?.diagnostics.includes(diagnostic)) continue;
          const key = JSON.stringify([from, diagnostic.code, diagnostic.path, diagnostic.message]);
          if (emitted.has(key)) continue;
          emitted.add(key);
          (program.diagnostics ??= {})[uri] ??= [];
          program.diagnostics[uri]!.push({
            range: doc.range(from, to),
            severity: diagnostic.severity === "error" ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
            message: { kind: "markdown", value: diagnostic.message },
            relatedInformation: artworkUri(resolved.image, diagnostic.path) ? [{
              location: { uri: artworkUri(resolved.image, diagnostic.path)!, range: assetRange },
              message: diagnostic.path ? 'Artwork layer hierarchy: ' + diagnostic.path : 'Source artwork for this selection',
            }] : undefined,
            source: LANGUAGE_NAME,
          });
        }
      };
      const references = annotations.references.iter();
      const images: { struct: any; from: number; to: number }[] = [];
      while (references.value) {
        for (const selector of references.value.type.selectors ?? []) {
          if (selector.name && selector.types?.some((type) => ["image", "filtered_image", "layered_image"].includes(type))) {
            const struct = getContextEntry(program.context, "filtered_image", selector.name) ?? getContextEntry(program.context, "layered_image", selector.name) ?? getContextEntry(program.context, "image", selector.name);
            if (struct) {
              images.push({ struct, from: references.from, to: references.to });
            }
          }
        }
        references.next();
      }
      let coveredTo = -1;
      for (const image of images.sort((a, b) => a.from - b.from || b.to - a.to)) {
        if (image.from >= coveredTo) {
          emit(image.struct, image.from, image.to);
          coveredTo = image.to;
        }
      }
      const tree = this.documents.tree(uri);
      const declarations = annotations.declarations.iter();
      while (declarations.value) {
        if (declarations.value.type === "define") {
          let header: SyntaxNode | null = tree?.resolveInner(declarations.from, 1) ?? null;
          while (header && header.name !== "LuauDefineNameAndInheritance") header = header.parent;
          const typeNode = header ? getDescendent("LuauDefineParentName", header) : undefined;
          const type = typeNode ? doc.read(typeNode.from, typeNode.to).trim() : "";
          if (["image", "filtered_image", "layered_image"].includes(type)) {
            const name = doc.read(declarations.from, declarations.to);
            const struct = getContextEntry(program.context, type, name);
            if (struct && type === "filtered_image") {
              lookDeclarations.set(struct, { uri, order, from: declarations.from, to: declarations.to });
            }
            if (struct) emit(struct, declarations.from, declarations.to);
          }
        }
        declarations.next();
      }
    }
    const reportedCycles = new Set<any>();
    for (const look of Object.values(program.context["filtered_image"] ?? {})) {
      const cycle = resolveImageAttributes(program.context, look, { visibility: false }).cycle;
      if (!cycle?.length) continue;
      let closing: any;
      for (const member of cycle) {
        const at = lookDeclarations.get(member);
        const best = closing ? lookDeclarations.get(closing)! : undefined;
        if (at && (!best || at.order > best.order || (at.order === best.order && at.from > best.from))) {
          closing = member;
        }
      }
      if (!closing || reportedCycles.has(closing)) continue;
      reportedCycles.add(closing);
      const at = lookDeclarations.get(closing)!;
      const doc = this.documents.get(at.uri);
      if (!doc) continue;
      const start = cycle.indexOf(closing);
      const loop = [...cycle.slice(start), ...cycle.slice(0, start), closing];
      ((program.diagnostics ??= {})[at.uri] ??= []).push({
        range: doc.range(at.from, at.to),
        severity: DiagnosticSeverity.Error,
        message: {
          kind: "markdown",
          value: "Circular filtered_image chain: " + loop.map((member) => "`" + member.$name + "`").join(" → ") + ". A chain must end at an image or a layered_image.",
        },
        source: LANGUAGE_NAME,
      });
    }
  }

  protected morphScripts(program: SparkProgram): (MorphScript & { uri: string })[] {
    const scripts: (MorphScript & { uri: string })[] = [];
    for (const scriptUri of Object.keys(program.scripts)) {
      const doc = this.documents.get(scriptUri);
      if (!doc || !/\bmorph\b/.test(doc.read(0, doc.length))) continue;
      const tree = this.documents.tree(scriptUri);
      if (!tree) continue;
      scripts.push({
        uri: scriptUri,
        read: (from, to) => doc.read(from, to),
        position: (offset) => doc.positionAt(offset),
        tree,
      });
    }
    return scripts;
  }

  populateMorphChannel(program: SparkProgram) {
    if (!program.context) return;
    const uri = program.uri;
    profile("start", this._profilerId, "populateMorphChannel", uri);
    const effective = collectEffectiveMorphs(
      this.morphScripts(program),
      program.context,
      (base, override) => this.inheritDefaults(base, override),
    );
    if (effective.size === 0) {
      delete program.morphs;
    } else {
      const signature = JSON.stringify([program.contextRevision, ...effective]);
      const cached = this._morphChannelCache;
      if (cached && cached.signature === signature) {
        program.morphs = cached.channel;
      } else {
        const channel = buildMorphChannel(program.context, effective);
        if (channel) program.morphs = channel;
        else delete program.morphs;
        this._morphChannelCache = channel ? { signature, channel } : undefined;
      }
    }
    profile("end", this._profilerId, "populateMorphChannel", uri);
  }

  validateMorphs(program: SparkProgram) {
    if (!program.context) return;
    const uri = program.uri;
    profile("start", this._profilerId, "validateMorphs", uri);
    const scripts = this.morphScripts(program);
    const issuesByUri = collectMorphIssues(
      scripts,
      program.context,
      (base, override) => this.inheritDefaults(base, override),
    );
    for (const [scriptUri, issues] of issuesByUri) {
      const doc = this.documents.get(scriptUri)!;
      for (const issue of issues) {
        const range = doc.range(issue.from, issue.to);
        ((program.diagnostics ??= {})[scriptUri] ??= []).push({
          range,
          code: "morph",
          severity:
            issue.severity === "error"
              ? DiagnosticSeverity.Error
              : DiagnosticSeverity.Warning,
          message: { kind: "markdown", value: issue.message },
          relatedInformation: issue.related
            ? [
                {
                  location: {
                    uri: issue.related.uri,
                    range: {
                      start: { line: 0, character: 0 },
                      end: { line: 0, character: 0 },
                    },
                  },
                  message: issue.related.message,
                },
              ]
            : undefined,
          source: LANGUAGE_NAME,
        });
      }
    }
    profile("end", this._profilerId, "validateMorphs", uri);
  }

  validateLints(program: SparkProgram) {
    const uri = program.uri;
    profile("start", this._profilerId, "validateLints", uri);
    const scripts: ({ uri: string } & Pick<LuauScriptLints, "names" | "globalShadows" | "uncertainGlobalUses" | "outermostLocals" | "mentionsUnplaced" | "mentionsUnplacedVariable" | "misreadStatements" | "topLevelMembers">)[] = [];
    const lints = new Map<string, LuauLint[]>();
    const report = (scriptUri: string, lint: LuauLint) => {
      let list = lints.get(scriptUri);
      if (!list) lints.set(scriptUri, (list = []));
      list.push(lint);
    };
    for (const scriptUri of Object.keys(program.scripts)) {
      const doc = this.documents.get(scriptUri);
      const tree = this.documents.tree(scriptUri);
      if (!doc || !tree) continue;
      let script = this._lintsByTree.get(tree);
      if (!script) {
        script = collectLuauLints(tree, (from, to) => doc.read(from, to), { luauFile: isLuauFile(scriptUri) });
        this._lintsByTree.set(tree, script);
      }
      scripts.push({ uri: scriptUri, names: script.names, globalShadows: script.globalShadows, uncertainGlobalUses: script.uncertainGlobalUses, outermostLocals: script.outermostLocals, mentionsUnplaced: script.mentionsUnplaced, mentionsUnplacedVariable: script.mentionsUnplacedVariable, misreadStatements: script.misreadStatements, topLevelMembers: script.topLevelMembers });
      for (const lint of script.lints) report(scriptUri, lint);
    }
    const names = indexProgramNames(scripts);
    if (!(BUILTINS_PRELUDE_URI in program.scripts)) {
      const builtins = lintBuiltinNames();
      for (const { uri: scriptUri, lint } of lintBuiltinGlobalWrites(names)) report(scriptUri, lint);
      for (const { uri: scriptUri, lint } of lintUnusedGlobalFunctions(names, scripts, builtins)) report(scriptUri, lint);
      const duplicates = lintDuplicateGlobalMembers(names, scripts, (name, original) =>
        duplicateGlobalMemberMessage(name, (this.documents.get(original.uri)?.positionAt(original.from).line ?? 0) + 1, displayScriptPath(original.uri, uri, this._config.uriPathsAsWritten)),
      );
      for (const { uri: scriptUri, lint } of duplicates) report(scriptUri, lint);
      if (scripts.some((script) => script.globalShadows.length)) {
        const shadows = lintGlobalShadows(names, scripts, builtins, (name, reference, own) => {
          const line = (this.documents.get(reference.uri)?.positionAt(reference.from).line ?? 0) + 1;
          return `Variable '${name}' shadows a global variable used at line ${line}${own ? "" : ` in '${displayScriptPath(reference.uri, uri, this._config.uriPathsAsWritten)}'`}`;
        });
        for (const { uri: scriptUri, lint } of shadows) report(scriptUri, lint);
      }
      const locals = lintGlobalsUsedAsLocals(names, scripts, builtins, (scriptUri, offset) => (this.documents.get(scriptUri)?.positionAt(offset).line ?? 0) + 1);
      for (const { uri: scriptUri, lint } of locals) report(scriptUri, lint);
    }
    for (const [scriptUri, list] of lints) {
      const doc = this.documents.get(scriptUri);
      if (!doc) continue;
      list.sort((a, b) => a.from - b.from || a.to - b.to);
      for (const lint of list) {
        const deprecated = lint.code === "DeprecatedApi";
        ((program.diagnostics ??= {})[scriptUri] ??= []).push({
          range: doc.range(lint.from, lint.to),
          code: lint.code,
          severity: deprecated ? DiagnosticSeverity.Information : DiagnosticSeverity.Warning,
          ...(deprecated ? { tags: [DiagnosticTag.Deprecated] } : {}),
          message: { kind: lint.code === "TableLiteral" ? "plaintext" : "markdown", value: lint.message },
          source: LANGUAGE_NAME,
        });
      }
    }
    profile("end", this._profilerId, "validateLints", uri);
    return names;
  }

  validateStores(program: SparkProgram) {
    for (const scriptUri of Object.keys(program.scripts)) {
      if (scriptUri === BUILTINS_PRELUDE_URI || isLuauDocument(scriptUri)) continue;
      const doc = this.documents.get(scriptUri);
      const tree = this.documents.tree(scriptUri);
      if (!doc || !tree) continue;
      const declarations = storeSyntaxErrors(tree, doc.read(0, doc.length));
      if (declarations.length === 0) continue;
      const diagnostics = ((program.diagnostics ??= {})[scriptUri] ??= []);
      const wordsOf = (d: SparkDiagnostic) => (typeof d.message === "string" ? d.message : d.message.value);
      const existing = diagnostics.filter(
        (d) =>
          d.severity === DiagnosticSeverity.Error &&
          !isPlacementMessage(wordsOf(d)) &&
          !isStartSceneMessage(wordsOf(d)),
      );
      const offsetOf = (position: Range["start"]) => doc.offsetAt(position);
      for (const { declaration, found, reported } of declarations) {
        const { from, to, readTo } = declaration;
        const last = to > from && doc.read(to - 1, to) === "\n" ? to - 1 : to;
        const lineStart = doc.offsetAt({ line: doc.positionAt(from).line, character: 0 });
        const spanFrom = /^\s*$/.test(doc.read(lineStart, from)) ? lineStart : from;
        const spanTo = Math.max(last, readTo > from && doc.read(readTo - 1, readTo) === "\n" ? readTo - 1 : readTo);
        const reports = existing.filter((d) => {
          const at = offsetOf(d.range.start);
          return at >= spanFrom && at <= spanTo;
        });
        const spanOf = (range: Range) => {
          const start = offsetOf(range.start);
          return { start, end: Math.max(offsetOf(range.end), start + 1) };
        };
        const overlaps = (a: Range, b: Range) => {
          const x = spanOf(a);
          const y = spanOf(b);
          return x.start < y.end && y.start < x.end;
        };
        const firstToken = from + (/^\s*/.exec(doc.read(from, last))?.[0].length ?? 0);
        const ofStatement = (d: SparkDiagnostic) => {
          const report = spanOf(d.range);
          return report.start <= firstToken && report.end >= last;
        };
        type Found = (typeof found)[number];
        const sameStart = (e: Found, d: SparkDiagnostic) => offsetOf(e.start) === offsetOf(d.range.start);
        const atToken = (e: Found, d: SparkDiagnostic) =>
          overlaps(d.range, e) || (e.opener !== undefined && overlaps(d.range, e.opener));
        const sameWords = (e: Found, d: SparkDiagnostic) => {
          const words = wordsOf(d);
          return e.message === words || (!/, got /.test(words) && e.message.startsWith(`${words}, got `));
        };
        const accounted = new Set<Found>();
        const copies = (d: SparkDiagnostic) => found.some((e) => sameStart(e, d) && e.message === wordsOf(d));
        for (const d of reports) {
          const copy = found.find((e) => !accounted.has(e) && sameStart(e, d) && e.message === wordsOf(d));
          if (copy) accounted.add(copy);
        }
        const others = reports.filter((d) => !copies(d) && !ofStatement(d));
        for (const e of found) if (others.some((d) => atToken(e, d))) accounted.add(e);
        for (const d of others) {
          if (found.some((e) => atToken(e, d))) continue;
          const error = found.find((e) => !accounted.has(e) && sameWords(e, d));
          if (error) accounted.add(error);
        }
        for (const error of reported) {
          if (accounted.has(error) && !error.ofString) continue;
          diagnostics.push({
            range: { start: error.start, end: error.end },
            code: "SyntaxError",
            severity: DiagnosticSeverity.Error,
            message: error.message,
            source: LANGUAGE_NAME,
          });
        }
      }
    }
  }

  validateTypes(program: SparkProgram) {
    const uri = program.uri;
    profile("start", this._profilerId, "validateTypes", uri);
    const report = (scriptUri: string, range: Range, code: string, message: string, severity: DiagnosticSeverity = DiagnosticSeverity.Warning) => {
      ((program.diagnostics ??= {})[scriptUri] ??= []).push({
        range,
        code,
        severity,
        message,
        source: LANGUAGE_NAME,
      });
    };
    const userScripts = Object.keys(program.scripts).filter((scriptUri) => scriptUri !== BUILTINS_PRELUDE_URI);

    let projectMode = Mode.Nonstrict;
    const configured = (program.context?.["config"] as any)?.["typecheck"]?.["mode"];
    if (configured !== undefined) {
      const mode = typeof configured === "string" ? modeFromName(configured) : undefined;
      if (mode !== undefined) {
        projectMode = mode;
      } else {
        const message = unknownModeMessage(String(configured));
        let placed = false;
        for (const scriptUri of userScripts) {
          const doc = this.documents.get(scriptUri);
          const tree = this.documents.tree(scriptUri);
          const setting = doc && tree ? configTypecheckSetting(tree, (from, to) => doc.read(from, to)) : undefined;
          if (doc && setting) {
            report(scriptUri, doc.range(setting.from, setting.to), "UnknownTypecheckMode", message);
            placed = true;
          }
        }
        if (!placed) report(uri, { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, "UnknownTypecheckMode", message);
      }
    }

    this._typechecker.beginCompile(this.typecheckGlobalNames(program));
    for (const scriptUri of userScripts) {
      const doc = this.documents.get(scriptUri);
      const tree = this.documents.tree(scriptUri);
      if (!doc || !tree) continue;
      const read = (from: number, to: number) => doc.read(from, to);
      let mode = projectMode;
      const setting = frontMatterTypecheckSetting(tree, read);
      if (setting) {
        const fileMode = modeFromName(setting.value);
        if (fileMode !== undefined) mode = fileMode;
        else report(scriptUri, doc.range(setting.from, setting.to), "UnknownTypecheckMode", unknownModeMessage(setting.value));
      }
      const unresolved: { name: string; range: Range }[] = [];
      const errors: SparkDiagnostic[] = [];
      for (const d of program.diagnostics?.[scriptUri] ?? []) {
        const message = typeof d.message === "string" ? d.message : d.message.value;
        const path = /Cannot find (?:variable|item or path) named `([^`]+)`/.exec(message)?.[1];
        if (path) unresolved.push({ name: path.split(".")[0]!, range: d.range });
        if (
          d.severity === DiagnosticSeverity.Error &&
          !isPlacementMessage(message) &&
          !isStartSceneMessage(message)
        ) {
          errors.push(d);
        }
      }
      const checked = this._typechecker.checkDocument(scriptUri, doc.read(0, doc.length), tree, mode);
      const tokenOf = (d: { end: { line: number; character: number } }) => ({ line: d.end.line, character: Math.max(d.end.character - 1, 0) });
      const messageOf = (d: SparkDiagnostic) => (typeof d.message === "string" ? d.message : d.message.value);
      const meets = (e: Range, d: { start: Range["start"]; end: Range["end"] }) => {
        if (rangeContains(e, d.start) || rangeContains(e, tokenOf(d)) || rangeContains(d, e.start)) return true;
        const from = doc.offsetAt(e.end);
        const to = doc.offsetAt(d.start);
        return from <= to && /^\s*$/.test(doc.read(from, to));
      };
      const replaced = new Set<SparkDiagnostic>();
      const replacing = new Set<(typeof checked)[number]>();
      for (const d of checked) {
        if (!d.syntax) continue;
        for (const e of errors) {
          if (messageOf(e) === d.message && meets(e.range, d)) {
            replaced.add(e);
            replacing.add(d);
          }
        }
      }
      for (const d of checked) {
        if (d.unknownGlobal !== undefined && unresolved.some((u) => u.name === d.unknownGlobal && rangeContains(u.range, d.start))) continue;
        if (d.syntax && !d.ofString && !replacing.has(d) && errors.some((e) => !replaced.has(e) && rangeContains(e.range, tokenOf(d)))) continue;
        report(scriptUri, { start: d.start, end: d.end }, d.code, d.message, d.syntax ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning);
      }
      if (replaced.size > 0) program.diagnostics![scriptUri] = program.diagnostics![scriptUri]!.filter((d) => !replaced.has(d));
    }
    this._typechecker.endCompile();
    profile("end", this._profilerId, "validateTypes", uri);
  }

  protected typecheckGlobalNames(program: SparkProgram): string[] {
    const names: string[] = [];
    for (const entry of this._censusEntries ?? []) names.push(entry.slice(entry.indexOf(":", entry.indexOf("|")) + 1));
    for (const [type, structs] of Object.entries(program.context ?? {})) {
      names.push(type);
      if (structs && typeof structs === "object") names.push(...Object.keys(structs));
    }
    names.push(
      ...Object.keys(program.functionLocations ?? {}),
      ...Object.keys(program.sceneLocations ?? {}),
      ...Object.keys(program.knotLocations ?? {}),
    );
    for (const key of Object.keys(STDLIB)) names.push(key.split(".")[0]!);
    return names.filter((name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name));
  }

  get typecheckStats() {
    return this._typechecker.stats;
  }

  validateReferences(program: SparkProgram) {
    const uri = program.uri;
    profile("start", this._profilerId, "validateReferences", uri);
    const declaredParentTypes = new Set<string>();
    for (const scriptUri of Object.keys(program.scripts)) {
      const doc = this.documents.get(scriptUri);
      const tree = this.documents.tree(scriptUri);
      if (!doc || !tree) continue;
      const declarations = this.documents
        .annotations(scriptUri).declarations.iter();
      while (declarations.value) {
        if (declarations.value.type === "define") {
          let header = tree.resolveInner(declarations.from, 1).parent;
          while (header && header.name !== "LuauDefineNameAndInheritance") {
            header = header.parent;
          }
          if (header) {
            declaredParentTypes.add(doc.read(declarations.from, declarations.to));
          }
        }
        declarations.next();
      }
    }
    const handlerCallables = new Set<string>([
      ...Object.keys(program.functionLocations ?? {}),
      ...Object.keys(program.sceneLocations ?? {}),
      ...Object.keys(program.knotLocations ?? {}),
    ]);
    const declarationCacheKey = (declaration: SparkDeclaration | undefined) =>
      declaration
        ? [
            declaration.modifier,
            declaration.type,
            declaration.name,
            declaration.property ?? "",
          ].join("\u0000")
        : "";
    const stringIdentifiersByDeclaration = new Map<string, string[]>();
    const selectorTypesByDeclaration = new Map<string, string[]>();
    let layerNames: Set<string> | undefined;
    const namesLayoutElement = (selector: SparkSelector | undefined) => {
      if (selector?.displayType !== "layer" || !selector.name) {
        return false;
      }
      const [name, instance, ...rest] = selector.name.split("#");
      if (
        rest.length > 0 ||
        (instance !== undefined && !/^\d+$/.test(instance))
      ) {
        return false;
      }
      layerNames ??= collectLayerNames(program);
      return Boolean(name) && layerNames.has(name!);
    };
    const possibleStringIdentifiersFor = (
      declaration: SparkDeclaration | undefined,
    ) => {
      const key = declarationCacheKey(declaration);
      let cached = stringIdentifiersByDeclaration.get(key);
      if (!cached) {
        cached = getPossibleStringIdentifiers(
          program,
          declaration,
          this._config,
        );
        stringIdentifiersByDeclaration.set(key, cached);
      }
      return cached;
    };
    const resolvedSelectors = new Map<string, any>();
    const resolveSelectorMemo = (
      selector: SparkSelector,
      expectedSelectorTypes: string[],
    ) => {
      const key = [
        selector.displayType ?? "",
        selector.displayName ?? "",
        (selector.types ?? []).join(","),
        selector.name ?? "",
        selector.property ?? "",
        selector.value ?? "",
        String(selector.fuzzy ?? false),
        expectedSelectorTypes.join(","),
      ].join("|");
      if (resolvedSelectors.has(key)) {
        return resolvedSelectors.get(key);
      }
      const [resolved] = resolveSelector<any>(
        program,
        selector,
        expectedSelectorTypes,
      );
      resolvedSelectors.set(key, resolved);
      return resolved;
    };
    const expectedSelectorTypesFor = (
      declaration: SparkDeclaration | undefined,
    ) => {
      const key = declarationCacheKey(declaration);
      let cached = selectorTypesByDeclaration.get(key);
      if (!cached) {
        cached = getExpectedSelectorTypes(
          program,
          declaration,
          this._config,
        );
        selectorTypesByDeclaration.set(key, cached);
      }
      return cached;
    };
    type Reads = { keys?: Set<string>; types?: Set<string> };
    const readKey = (reads: Reads, type: string, name: string) => {
      (reads.keys ??= new Set()).add(`${type}/${name}`);
    };
    const readType = (reads: Reads, type: string) => {
      (reads.types ??= new Set()).add(type);
    };
    const readsLayout = (reads: Reads) => {
      readType(reads, "layout");
      readType(reads, "component");
      readType(reads, "config");
      return true;
    };
    const readSelector = (
      reads: Reads,
      selector: SparkSelector,
      expectedSelectorTypes: string[],
    ) => {
      const types =
        selector.types && selector.types.length > 0
          ? selector.types
          : expectedSelectorTypes;
      for (const type of types) {
        const path = `${type}.${selector.name ?? ""}`.split(".");
        if (!selector.name || path.some((segment) => !segment)) {
          readType(reads, path[0]!);
          readType(reads, type);
        } else {
          readKey(reads, type, selector.name);
          readKey(reads, path[0]!, path[1]!);
        }
      }
    };
    const check = (
      reference: Reference,
      from: number,
      to: number,
      offset: number,
      outcomes: ReferenceOutcome[],
      reads: Reads,
    ) => {
      const report = (severity: DiagnosticSeverity, message: string) => {
        outcomes.push({
          from: from - offset,
          to: to - offset,
          diagnostic: { severity, message },
        });
      };
      if (reference.usage === "handler") {
        const name = reference.symbolIds?.[0];
        if (name && !handlerCallables.has(name)) {
          report(
            DiagnosticSeverity.Warning,
            `Cannot find function \`${name}\` for this handler — define \`function ${name}() … end\`, or use an inline handler \`{ … }\``,
          );
        }
        return;
      }
      if (reference.asset) {
        const { types, name, typed } = reference.asset;
        const declared = types.some((type) => {
          readKey(reads, type, name);
          return getContextEntry(program.context, type, name) !== undefined;
        });
        if (declared && !typed) {
          outcomes.push({ from: from - offset, to: to - offset, declared: name });
        } else if (!declared && typed) {
          report(DiagnosticSeverity.Warning, `Cannot find ${types[0]} named \`${name}\``);
        }
      }
      if (reference.symbolIds) {
        for (const symbolId of reference.symbolIds) {
          if (this._config.definitions?.builtins?.[symbolId]) {
            if (
              reference.declaration === "const" ||
              reference.declaration === "var" ||
              reference.declaration === "param"
            ) {
              report(
                DiagnosticSeverity.Error,
                `Cannot declare ${reference.declaration} named \`${symbolId}\`:\nConflicts with builtin type \`${symbolId}\``,
              );
            }
          }
        }
      }
      if (reference.selectors) {
        const declaration = reference.assigned;
        const possibleStringIdentifiers =
          possibleStringIdentifiersFor(declaration);
        const expectedSelectorTypes = expectedSelectorTypesFor(declaration);
        if (expectedSelectorTypes.includes("color")) {
          outcomes.push({ from: from - offset, to: to - offset, color: true });
        }
        const selector = reference.selectors?.[0];
        let found: any = undefined;
        for (const s of reference.selectors) {
          readSelector(reads, s, expectedSelectorTypes);
          const resolved = resolveSelectorMemo(s, expectedSelectorTypes);
          if (resolved) {
            found = resolved;
          }
        }
        if (
          reference.stylingStringIdentifier &&
          selector?.name &&
          possibleStringIdentifiers.includes(selector?.name)
        ) {
        } else if (found) {
          if (
            expectedSelectorTypes &&
            expectedSelectorTypes.length > 0 &&
            typeof found === "object" &&
            "$type" in found &&
            !expectedSelectorTypes.includes(found.$type)
          ) {
            report(
              DiagnosticSeverity.Warning,
              `Type '${found.$type}' is not assignable to type ${formatList(
                expectedSelectorTypes,
              )}`,
            );
          }
          const name = selector?.name;
          if (
            name &&
            selector.types?.includes("video") &&
            getContextEntry(program.context, "video", name) !== undefined &&
            selector.types.some(
              (type) =>
                type !== "video" &&
                getContextEntry(program.context, type, name) !== undefined,
            )
          ) {
            report(
              DiagnosticSeverity.Error,
              `\`${name}\` is defined as both an image and a video, so \`[[show]]\` and \`[[animate]]\` cannot tell which to display: rename one of them`,
            );
          }
        } else if (readsLayout(reads) && namesLayoutElement(selector)) {
        } else if (
          reference.declaration === "define_type_name" &&
          selector?.types?.some((type) => declaredParentTypes.has(type))
        ) {
        } else {
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
                  : expectedSelectorTypes && expectedSelectorTypes.length > 0
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
          report(
            invalidStylingStringIdentifier
              ? DiagnosticSeverity.Error
              : DiagnosticSeverity.Warning,
            invalidStylingStringIdentifier
              ? `Invalid property value`
              : `Cannot find ${validDescription}`,
          );
        }
      } else if (reference.assigned) {
        const declaration = reference.assigned;
        const structType = declaration?.type;
        const structName = declaration?.name || "$default";
        const structProperty = declaration?.property;
        if (structType && structProperty) {
          readKey(reads, structType, structName);
          const struct = getContextEntry(program.context, structType, structName);
          if (struct) {
            const definedPropertyValue = readProperty(structProperty, struct);
            if (definedPropertyValue !== undefined) {
              const expectedPropertyValue = this.getExpectedPropertyValue(
                program,
                declaration,
              );
              if (expectedPropertyValue != null) {
                if (
                  typeof definedPropertyValue !== typeof expectedPropertyValue
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
                  if (!isSchemaSupportedScalarType) {
                    report(
                      DiagnosticSeverity.Error,
                      `Cannot assign '${typeof definedPropertyValue}' to '${typeof expectedPropertyValue === "object" && "$type" in expectedPropertyValue ? expectedPropertyValue.$type : typeof expectedPropertyValue}' property`,
                    );
                  }
                }
              }
            }
          }
        }
      }
    };
    const cache = this._previewing
      ? undefined
      : (this._referenceCache ??= new ReferenceValidationCache());
    cache?.begin(
      {
        base: [
          this._contextBase?.uri,
          this._contextBase?.filesEpoch,
          this._contextBase?.configKey,
        ].join("\u0000"),
        baseIds: this._contextBase?.ids ?? [],
        definitions: this._config.definitions,
        builtins: this._config.definitions?.builtins,
        handlerCallables: [...handlerCallables].sort().join("\u0000"),
        declaredParentTypes: [...declaredParentTypes].sort().join("\u0000"),
      },
      program.contextRevision ?? "",
      this._contextLayerAdded ?? [],
    );
    const stats = (this._referenceValidationStats = {
      validated: 0,
      reused: 0,
      stepped: 0,
      chunksValidated: 0,
      chunksServed: 0,
    });
    for (const uri of Object.keys(program.scripts)) {
      const doc = this.documents.get(uri);
      if (!doc) {
        continue;
      }
      const annotations = this.documents.annotations(uri);
      const emit = (outcomes: ReferenceOutcome[], offset: number) => {
        for (const outcome of outcomes) {
          const range = doc.range(offset + outcome.from, offset + outcome.to);
          if (outcome.color) {
            program.colorAnnotations ??= {};
            program.colorAnnotations[uri] ??= [];
            program.colorAnnotations[uri].push(range);
          }
          if (outcome.declared !== undefined) {
            const unresolved = `Cannot find variable named \`${outcome.declared}\``;
            const diagnostics = program.diagnostics?.[uri];
            if (diagnostics) {
              program.diagnostics![uri] = diagnostics.filter(
                (d) =>
                  (typeof d.message === "string" ? d.message : d.message.value) !== unresolved ||
                  !rangesEqual(d.range, range),
              );
            }
          }
          if (outcome.diagnostic) {
            program.diagnostics ??= {};
            program.diagnostics[uri] ??= [];
            program.diagnostics[uri].push({
              range,
              severity: outcome.diagnostic.severity,
              message: {
                value: outcome.diagnostic.message,
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
      };
      let cur = annotations.references.iter();
      const validateUntil = (
        end: number,
        offset: number,
        outcomes: ReferenceOutcome[],
        reads: Reads,
      ) => {
        let count = 0;
        while (cur.value && cur.from < end) {
          count += 1;
          const annotation = cur.value;
          const length = cur.to - cur.from;
          const kept = cache?.reference(annotation);
          let own: { outcomes: ReferenceOutcome[] } & Reads;
          if (kept && kept.length === length) {
            stats.reused += 1;
            own = kept;
          } else {
            stats.validated += 1;
            own = { outcomes: [] };
            check(annotation.type, cur.from, cur.to, cur.from, own.outcomes, own);
            cache?.keepReference(annotation, length, own.outcomes, own);
          }
          for (const outcome of own.outcomes) {
            outcomes.push({
              ...outcome,
              from: outcome.from + cur.from - offset,
              to: outcome.to + cur.from - offset,
            });
          }
          for (const key of own.keys ?? []) {
            (reads.keys ??= new Set()).add(key);
          }
          for (const type of own.types ?? []) {
            readType(reads, type);
          }
          cur.next();
        }
        return count;
      };
      const chunks = annotations.compilations.iter();
      for (; chunks.value; chunks.next()) {
        const block = chunks.value.type as object;
        const from = chunks.from;
        const to = chunks.to;
        const loose: ReferenceOutcome[] = [];
        validateUntil(from, 0, loose, {});
        emit(loose, 0);
        const kept = cache?.take(uri, block);
        if (kept && kept.length === to - from) {
          stats.chunksServed += 1;
          emit(kept.outcomes, from);
          if (kept.references >= 16) {
            cur = annotations.references.iter(to);
          }
          while (cur.value && cur.from < to) {
            stats.stepped += 1;
            cur.next();
          }
          continue;
        }
        stats.chunksValidated += 1;
        const reads: Reads = {};
        const outcomes: ReferenceOutcome[] = [];
        const references = validateUntil(to, from, outcomes, reads);
        cache?.keep(uri, block, {
          length: to - from,
          references,
          outcomes,
          keys: reads.keys,
          types: reads.types,
        });
        emit(outcomes, from);
      }
      const rest: ReferenceOutcome[] = [];
      validateUntil(Number.POSITIVE_INFINITY, 0, rest, {});
      emit(rest, 0);
    }
    cache?.end();
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
      message: diagnosticMarkup(message),
      relatedInformation,
      source,
    };
    if (tags && tags.length > 0) {
      diagnostic.tags = tags;
    }
    return diagnostic;
  }
}

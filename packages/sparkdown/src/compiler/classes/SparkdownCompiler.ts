/// <reference path="../../sd-raw.d.ts" />
// Side-effect import to stabilize the inkjs engine module load order.
// `engine/Container.ts` ↔ `engine/Value.ts` ↔ `engine/Object.ts` form a
// dependency cycle; if `Object.ts` loads first, `Value.ts` resolves
// `InkObject` as undefined when extending it. Forcing `Container.ts` to be the
// entry point evaluates the cycle in a working order. This used to happen
// implicitly via the (now-removed) `inkjs/compiler/Compiler` import; keep it
// explicit so consumers of SparkdownCompiler don't hit a TDZ crash.
import "../../inkjs/engine/Container";
import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";
// The builtins prelude is the raw `builtins.sd` text, imported directly via
// `?raw` (Vite/vitest native; the repo's esbuild bundles add a `?raw` plugin).
// No generated wrapper / codegen step — `builtins.sd` is the single source of
// truth.
import BUILTINS_PRELUDE from "../builtins/builtins.sd?raw";
import type { IFileHandler } from "../../inkjs/compiler/IFileHandler";
import { ErrorType } from "../../inkjs/compiler/Parser/ErrorType";
import { Choice } from "../../inkjs/compiler/Parser/ParsedHierarchy/Choice";
import { ConstantDeclaration } from "../../inkjs/compiler/Parser/ParsedHierarchy/Declaration/ConstantDeclaration";
import { ExternalDeclaration } from "../../inkjs/compiler/Parser/ParsedHierarchy/Declaration/ExternalDeclaration";
import { ListDefinition } from "../../inkjs/compiler/Parser/ParsedHierarchy/List/ListDefinition";
import { StructDefinition } from "../../inkjs/compiler/Parser/ParsedHierarchy/Struct/StructDefinition";
import { VariableAssignment as ParsedVariableAssignment } from "../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { Divert } from "../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { FlowBase } from "../../inkjs/compiler/Parser/ParsedHierarchy/Flow/FlowBase";
import { Gather } from "../../inkjs/compiler/Parser/ParsedHierarchy/Gather/Gather";
import { Identifier } from "../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { IncludedFile } from "../../inkjs/compiler/Parser/ParsedHierarchy/IncludedFile";
import { Knot } from "../../inkjs/compiler/Parser/ParsedHierarchy/Knot";
import { ParsedObject } from "../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { FunctionCall } from "../../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import {
  ObjectExpression,
  ObjectExpressionEntry,
} from "../../inkjs/compiler/Parser/ParsedHierarchy/Expression/ObjectExpression";
import { contextValueToExpression } from "../lower/lowerers/lowerLuauDefine";
import { ReturnType as ParsedReturnType } from "../../inkjs/compiler/Parser/ParsedHierarchy/ReturnType";
import { Statement } from "../../inkjs/compiler/Parser/ParsedHierarchy/Statement";
import { Stitch } from "../../inkjs/compiler/Parser/ParsedHierarchy/Stitch";
import { Story } from "../../inkjs/compiler/Parser/ParsedHierarchy/Story";
import { Tag } from "../../inkjs/compiler/Parser/ParsedHierarchy/Tag";
import { Text } from "../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { TunnelOnwards } from "../../inkjs/compiler/Parser/ParsedHierarchy/TunnelOnwards";
import { Weave } from "../../inkjs/compiler/Parser/ParsedHierarchy/Weave";
import { ControlCommand } from "../../inkjs/engine/ControlCommand";
import { DebugMetadata } from "../../inkjs/engine/DebugMetadata";
import type { SourceMetadata } from "../../inkjs/engine/Error";
import {
  validateScene,
  validateBranch,
} from "../lower/utils/validateSceneBranchScope";
import type { LowerContext } from "../lower/context";
import { InkObject } from "../../inkjs/engine/Object";
import { SimpleJson } from "../../inkjs/engine/SimpleJson";
import { JsonSerialisation } from "../../inkjs/engine/JsonSerialisation";
import {
  ProgramBinaryWriter,
  createProgramTable,
  reseedProgramTable,
  type CachedFlowChunk,
  type ProgramTable,
} from "../../binary/ProgramBinaryWriter";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";
import {
  asINamedContentOrNull,
  asOrNull,
} from "../../inkjs/engine/TypeAssertion";
import { Container } from "../../inkjs/engine/Container";
import { StringValue } from "../../inkjs/engine/Value";
import { Divert as RuntimeDivert } from "../../inkjs/engine/Divert";
import { PushPopType } from "../../inkjs/engine/PushPop";
import {
  createSceneAssetCapture,
  type SceneAssetCapture,
  type SceneAssets,
} from "../types/SceneAssets";
import { scanAssetDirectives } from "../utils/scanAssetDirectives";
import { VariableAssignment } from "../../inkjs/engine/VariableAssignment";
import type { SparkDeclaration } from "../types/SparkDeclaration";
import { DiagnosticSeverity, type SparkDiagnostic } from "../types/SparkDiagnostic";
import type { SparkdownCompilerConfig } from "../types/SparkdownCompilerConfig";
import type { SparkdownCompilerState } from "../types/SparkdownCompilerState";
import type { SparkProgram } from "../types/SparkProgram";
import type { SparkSelector } from "../types/SparkSelector";
import { setBuiltinTypeNames } from "../utils/builtinTypeNames";
import { cloneBuiltinStructs } from "../utils/cloneBuiltinStructs";
import { collectDefineTypeNames } from "../utils/collectDefineTypeNames";
import { collectLayerNames } from "../utils/collectLayerNames";
import { scopeDefineInstances } from "../utils/scopeDefineInstances";
import { formatList } from "../utils/formatList";
import { getExpectedSelectorTypes } from "../utils/getExpectedSelectorTypes";
import { getPossibleStringIdentifiers } from "../utils/getPossibleStringIdentifiers";
import { profile } from "../utils/profile";
import { readProperty } from "../utils/readProperty";
import { resolveFileUsingImpliedExtension } from "../utils/resolveFileUsingImpliedExtension";
import { resolveSelector } from "../utils/resolveSelector";
import type { AddCompilerFileParams } from "./messages/AddCompilerFileMessage";
import {
  CompiledProgramMessage,
  type CompiledProgramParams,
} from "./messages/CompiledProgramMessage";
import type { CompileProgramParams } from "./messages/CompileProgramMessage";
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

// The canonical form `canonicalizeSyntheticFlowNames` renumbers synthetic
// identifiers to. These names are POSITIONAL (document-order ordinals), so a
// name can refer to a different flow after an edit — name-keyed caches must
// never reuse entries for flows matching this.
const CANONICAL_SYNTH_NAME = /^__synth_\d+$/;

// Reseed the binary string table once it is half again its live size, provided
// the absolute slack is worth a full re-serialization. A ratio rather than a
// fixed cap, because a large project legitimately holds more live strings than
// a small one. See `maybeReseedBinaryTable`.
const BINARY_TABLE_RESEED_RATIO = 1.5;
const BINARY_TABLE_RESEED_MIN_SLACK = 512;

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
let _cachedPrelude: {
  context: Record<string, any>;
  compiled: unknown;
  sparkle: Record<string, any>;
} | null = null;

function getCompiledPrelude(): {
  context: Record<string, any>;
  compiled: unknown;
  sparkle: Record<string, any>;
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
    sparkle: result.program.sparkle ?? {},
  };
  // Publish the builtin type/namespace ROOT names (the context's top-level
  // keys — color, character, animation, …) so the lowerer's shadow-warning
  // (validateDefineTypeShadow) can flag a user `store`/`const` that reuses a
  // reserved builtin name. Runs once (cached prelude); before any user
  // compile's lowering, since mergePreludeContext calls this first.
  setBuiltinTypeNames(Object.keys(_cachedPrelude.context));
  return _cachedPrelude;
}

let _preludeGlobalNames: Set<string> | undefined;
/** Every global the seeded prelude creates: a type's root table (`config`,
 *  `game`) and each named define (`assets`, `ui`, the colors, …). An unseeded
 *  compile declares them so references resolve (Story.DeclareBuiltinGlobals). */
function getPreludeGlobalNames(): Set<string> {
  if (_preludeGlobalNames) {
    return _preludeGlobalNames;
  }
  const names = new Set<string>();
  for (const [type, structs] of Object.entries(getCompiledPrelude().context)) {
    names.add(type);
    for (const name of Object.keys(structs ?? {})) {
      if (!name.startsWith("$")) {
        names.add(name);
      }
    }
  }
  _preludeGlobalNames = names;
  return names;
}
const FILE_TYPES = GRAMMAR_DEFINITION.fileTypes;

export type SparkdownCompilerEvents = {
  "compiler/didCompile": (
    params: CompiledProgramParams & { story?: RuntimeStory },
  ) => void;
  "compiler/didSelect": (params: SelectedCompilerDocumentParams) => void;
  "compiler/didRemove": (params: RemovedCompilerFileParams) => void;
};

// Cached per-flow location entries for the incremental location-map cache
// (Design A). Tuples are [scriptIndex, startLine, startColumn, endLine,
// endColumn] in 0-based document coordinates.
type FlowLocCacheEntry = {
  // The flow's 0-based source start line at the time these entries were
  // captured — the reference for computing the line delta on reuse.
  startLine0: number;
  pathEntries: Array<{
    path: string;
    tuple: [number, number, number, number, number];
  }>;
  dataEntries: Array<{
    key: string;
    tuple: [number, number, number, number, number];
  }>;
  // What the flow's leaves reference (`program.sceneAssets`). Line-free, so a
  // reused flow contributes it by reference with no delta to apply.
  assets: SceneAssetCapture;
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

  // uri -> index in `program.scripts`, rebuilt per compile before the JSON
  // emit pass so `populateLocations` can look up the script index in O(1).
  protected _scriptIndices?: Map<string, number>;

  // Insertion-order index of `pathLocations` entries, bucketed by scriptIndex
  // then startLine as they're created during the location walk. Lets
  // `sortPathLocations` emit entries in (scriptIndex, startLine, startColumn)
  // order via a linear bucket merge instead of an O(n log n) comparison sort
  // over every entry. Within a bucket, entries keep DFS insertion order, so a
  // stable per-line tie-break on startColumn reproduces the comparison sort
  // exactly. Rebuilt per compile in `populateAllLocations`.
  protected _pathLocationOrder?: Map<
    number,
    Map<number, Array<[path: string, startColumn: number]>>
  >;

  // ---- Incremental location-map cache (Design A) ------------------------
  // Per top-level flow (knot/scene/function name = its key in the runtime
  // mainContentContainer.namedOnlyContent), the pathLocations + dataLocations
  // entries that flow's subtree contributed last compile, plus the flow's
  // 0-based source start line. On a warm compile, a flow whose source is
  // unchanged (no changed chunk overlaps its span) and whose scriptIndex is
  // unchanged can have its entries REUSED with a single additive line delta
  // (newStart - oldStart) instead of re-walking its subtree — populateLocations'
  // per-leaf body (~29ms) is the cost being skipped. ExportRuntime + ToJson
  // still run fully, so program.compiled is untouched and byte-identical.
  protected _locCache?: Map<string, FlowLocCacheEntry>;
  // Signature of the resolved script set+order; cleared cache when it changes
  // (scriptIndex — tuple[0] of every entry — is derived from it).
  protected _locCacheScriptsKey?: string;
  // CompiledBlock identities seen in the PREVIOUS compile; a chunk is unchanged
  // iff its identity is still present (carried forward by the annotation
  // RangeSet for chunks outside the reparse window).
  protected _prevCompilationIds?: Set<object>;
  // Accumulated during the current compile's chunk walk.
  protected _compilationIds?: Set<object>;
  // True while parsing the SOURCE-INJECTED builtins prelude (seedBuiltinsIntoStory):
  // its chunks contribute their runtime FlowBase (the builtin `__def` global
  // declarations → program.compiled) but MUST NOT re-merge context/sparkle —
  // those already came from mergePreludeContext, and re-merging would perturb
  // program.context vs the flag-off path.
  protected _injectingPrelude = false;
  // The parsed builtins prelude (a constant), cached after its first parse so
  // seedBuiltinsIntoStory reuses it across compiles instead of re-lowering
  // hundreds of builtin defines every keystroke. Reused by resetting only its
  // per-compile RUNTIME state (the same thing the incremental path does for
  // unchanged chunks); PreProcessTopLevelObjects re-parents the content on each
  // splice. Per-instance (mutated/reset per compile), so never shared.
  protected _cachedPreludeParsedStory?: Story;
  // 0-based [startLine, endLine] source ranges of chunks that are NEW/changed
  // this compile (identity not in `_prevCompilationIds`).
  protected _changedChunkRanges?: Array<[number, number]>;
  // Per-flow asset captures for this compile (`program.sceneAssets`), keyed
  // like `_locCache` plus "0" for root content. A reused flow contributes its
  // cached capture by reference; a recomputed flow is captured through
  // `_assetSink` during the walk.
  protected _flowAssetAccum?: Map<string, SceneAssetCapture>;
  // The capture the runtime-tree walk currently records asset directives and
  // divert edges into; null while walking something that has no flow of its
  // own (the uncacheable `global decl`).
  protected _assetSink: SceneAssetCapture | null = null;

  // Incremental ToJson cache: per top-level flow name, its serialized JS subtree
  // (the value under `program.compiled.root`'s terminating object) plus the
  // cross-flow fingerprint of the resolved runtime container it was serialized
  // from. A flow's cached JSON is reused iff its source CHUNK is unchanged AND its
  // cross-flow fingerprint matches AND no header/global chunk changed (const
  // inlining / global decl) — see the `flowMemo` in `compile`.
  protected _flowJsonCache?: Map<string, { fp: string; value: any }>;

  // The binary-format twin of `_flowJsonCache` (#314 phase 2), used when
  // `config.binaryProgram` is set. Same key (top-level flow name) and same
  // validity check (cross-flow fingerprint + the reuse guards below), but the
  // cached value is a portable record range rather than a JS subtree. Chunks
  // store LOCAL string/number tables and chunk-relative `end` offsets, because
  // both are program-global in an assembled buffer and would otherwise decode
  // against the wrong tables on the next compile.
  protected _flowChunkCache?: Map<string, CachedFlowChunk>;

  // The string/number table the binary chunks' payload pointers refer to.
  // Persisted across compiles on purpose: it is the analogue of lezer's
  // grammar-fixed NodeSet, and it is what lets a cached chunk be copied in
  // verbatim instead of remapped record by record.
  protected _binaryTable: ProgramTable = createProgramTable();

  // Table size once a freshly seeded table has settled, i.e. the LIVE string
  // count for the current document. Zero means "recalibrate on the next
  // compile"; see `maybeReseedBinaryTable`.
  protected _binaryTableBaseline = 0;

  // Previous compile's buffer size, so the writer allocates once instead of
  // regrowing geometrically. The program is nearly the same size every edit.
  protected _binarySlotHint = 0;

  // ---- Incremental ExportRuntime: constructed-flow reuse ------------------
  // A top-level flow (knot/scene/function, plus its stitches) is assembled
  // from a RUN of chunks: the declaration chunk plus every body chunk that
  // attached content into it. When the whole run is carried forward
  // unchanged, last compile's CONSTRUCTED flow node — with its registered
  // temps/args, weave state, and (crucially) its cached runtime container
  // subtree — is pushed into the fresh Story as-is and `ExportRuntime` skips
  // regenerating it entirely (the `runtimeObject` getter returns the cached
  // container). `ResolveReferences` still runs over the full tree every
  // compile, so cross-flow paths, count flags, and resolve-time diagnostics
  // are re-derived; see `Divert.targetContent`'s epoch guard and
  // `FlattenContainersIn`'s count-flag reconcile for the state that makes
  // re-resolution over reused containers sound.
  //
  // `_prevFlowRuns`: last compile's run record per DECLARATION chunk
  // identity. `_nextFlowRuns` accumulates this compile's records (fresh
  // constructions AND committed reuses) and is promoted on success.
  protected _prevFlowRuns?: Map<
    object,
    { flow: FlowBase; contentChunks: object[] }
  >;
  protected _nextFlowRuns?: Map<
    object,
    { flow: FlowBase; contentChunks: object[] }
  >;
  // Line offset each content chunk's debugMetadata was last stamped at —
  // a reused chunk whose offset is unchanged skips the restamp walk entirely.
  protected _chunkStampOffset = new WeakMap<object, number>();
  // Constructed flows that raised a diagnostic during GENERATION (reuse skips
  // generation, which would silently drop the diagnostic — such flows are
  // barred from reuse and rebuilt so the diagnostic re-emits).
  protected _flowsWithGenDiagnostics = new WeakSet<object>();
  // Signature (arity + per-parameter flags) of every named flow last compile.
  // A CALL SITE's bytecode depends on its CALLEE's parameter list — a trailing
  // `...` makes the caller emit a `PackTuple` to fill the callee's varargs
  // slot (see `Divert.GenerateRuntimeObject`) — and that is baked in at the
  // CALLER's generation time. So editing a callee's signature must invalidate
  // reuse of every flow that might call it, even though the caller's own
  // chunks are untouched; otherwise the caller keeps argument-push bytecode
  // for the old signature and the callee pops a different number of values,
  // silently and with no diagnostic.
  protected _prevFlowSignatures?: Map<string, string>;
  // Per-file ordered ROOT-REGION STRUCTURE descriptors — `include`/`run`
  // targets and `EXTERNAL` name+arity. A change to this sequence disables all
  // reuse for that compile; ordinary root content (front matter, loose text,
  // globals) is deliberately excluded. See the guard for the full rationale.
  protected _lastRootBlocksByUri?: Map<string, string[]>;
  // Reuse kill-switches. `_flowReuseDisabled` is recomputed per compile;
  // starts true so the first compile after construction never reuses.
  protected _flowReuseDisabled = true;
  protected _disableFlowReuseNextCompile = false;
  protected _lastReuseCountAllVisits = false;
  protected _reusedFlowsThisCompile?: Set<FlowBase>;
  // Per-chunk reuse-disqualifier scan results (see `scanChunkForReuse`),
  // computed once per chunk identity.
  protected _chunkReuseScan?: WeakMap<
    object,
    {
      disqualifies: boolean;
      invalidatesGlobals: boolean;
      declaredNames: string[];
    }
  >;
  // Census of every constant and global NAME declared anywhere in the
  // program, accumulated across all files of one compile and compared against
  // the previous compile's. Two distinct generation-time dependencies make a
  // reused flow's bytecode sensitive to names declared OUTSIDE it:
  //
  //   - a LIST is inlined by value into every referencing flow, so one that
  //     disappears leaves stale inlined bytecode behind; and
  //   - `Divert.ResolveTargetContent` runs during GENERATION and consults
  //     `story.variableDeclarations`, so a global whose name matches a flow
  //     shadows it and flips every call site from knot-call codegen (which
  //     emits `PackTuple`/padding derived from the callee's parameters) to
  //     variable-target codegen, which emits none of that.
  //
  // Neither is visible to the per-chunk scan: a DELETED declaration appears
  // in no chunk at all. Names only — values may change freely, so editing a
  // `store`'s value still keeps reuse.
  protected _censusEntries?: string[];
  protected _prevCensusKey?: string;
  // Parsed nodes whose subtree provably contains no compiler-synthesized
  // name, so `canonicalizeSyntheticFlowNames` can skip them wholesale on
  // later compiles. Keyed by identity, which the incremental pipeline
  // preserves for unchanged content and replaces on re-lowering.
  // Value is the node's content length when it was marked. Assembly can APPEND
  // to a carried-forward container (a later changed chunk's content is added
  // into an existing weave), which would make a stale mark hide the new
  // children. Comparing the length on lookup catches that in O(1); a subtree
  // whose own nodes changed gets a new identity anyway.
  protected _synthFreeSubtrees = new WeakMap<object, number>();
  // [container, previous parent] for every container committed to reuse this
  // compile — restored if the compile throws, so the previous RuntimeStory
  // (still live in the checkpoint-builder Game) isn't left holding containers
  // whose parents were stolen by a discarded half-built tree.
  protected _reuseParentBackups?: Array<[Container, InkObject | null]>;
  // Top-level flow names whose subtree was touched by a synthetic rename this
  // compile — their serialized-JSON cache entries must not be reused (the
  // cross-flow fingerprint records nothing for pure content, so a renamed
  // `__synth_<n>` temp inside an unchanged flow would otherwise serve stale).
  protected _renamedFlowNames?: Set<string>;

  // Bumped whenever the file registry changes (assets added/updated/removed,
  // or a reconfigure). Part of the no-change compile short-circuit key:
  // document versions alone can't see asset changes, but populateAssets and
  // include resolution can be affected by them.
  protected _filesEpoch = 0;
  // The previous successful compile, reusable verbatim when nothing that
  // feeds a compile has changed since. A forced no-change recompile measured
  // ~450ms on a large project even with every incremental cache warm --
  // ExportRuntime alone is ~200ms and fully non-incremental -- and PLAY /
  // init paths re-request compiles without any edit having happened.
  protected _lastCompileResult?: {
    uri: string;
    scripts: Record<string, number>;
    filesEpoch: number;
    countAllVisits: boolean;
    program: SparkProgram;
    story?: RuntimeStory;
  };
  // While recomputing a non-reusable flow's subtree, populateLocations tees the
  // entries it commits here so they can be cached for next compile.
  protected _locCaptureTarget?: {
    pathEntries: FlowLocCacheEntry["pathEntries"];
    dataEntries: FlowLocCacheEntry["dataEntries"];
  } | null;

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
    // Anything a reconfigure can change (definitions, settings, files) feeds
    // compiles, so retire the no-change short-circuit's snapshot.
    this._filesEpoch++;
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
      config.experimentalDisplayCalls !== undefined &&
      config.experimentalDisplayCalls !== this._config.experimentalDisplayCalls
    ) {
      this._config.experimentalDisplayCalls = config.experimentalDisplayCalls;
    }
    if (
      config.stripImageData !== undefined &&
      config.stripImageData !== this._config.stripImageData
    ) {
      this._config.stripImageData = config.stripImageData;
    }
    if (
      config.emitCompiledProgram !== undefined &&
      config.emitCompiledProgram !== this._config.emitCompiledProgram
    ) {
      this._config.emitCompiledProgram = config.emitCompiledProgram;
      // Neither per-flow cache is maintained while serialization is off, so
      // both go stale the moment it is. Drop them rather than let a later
      // re-enable serve subtrees from a compile that never ran.
      this._flowJsonCache = undefined;
      this._flowChunkCache = undefined;
    }
    if (
      config.binaryProgram !== undefined &&
      config.binaryProgram !== this._config.binaryProgram
    ) {
      this._config.binaryProgram = config.binaryProgram;
      // The two paths keep separate per-flow caches; a cache built for the
      // other format must never be consulted after a switch.
      this._flowJsonCache = undefined;
      this._flowChunkCache = undefined;
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
            experimentalDisplayCalls: this._config.experimentalDisplayCalls,
          },
        },
      );
      this._documents.profilerId = this._profilerId;
    }
    if (config.files !== undefined && config.files !== this._config.files) {
      this._config.files = config.files;
      // Populate the builtin type-name registry BEFORE `documents.add` — the
      // registry adds trigger the annotator's lowering pass, which reads
      // `getBuiltinTypeNames()` for the shadow warning. `mergePreludeContext`
      // (which normally publishes them) doesn't run until the later
      // `compile()`, so without this eager call a fresh document's first
      // lowering would miss the builtin shadow warnings until the next edit.
      // `getCompiledPrelude` is cached, so this pays only once. Guarded on
      // `useBuiltinsPrelude` so the prelude's own isolated compile (which sets
      // it false) doesn't recurse.
      if (this._config.useBuiltinsPrelude) {
        getCompiledPrelude();
      }
      for (const file of config.files) {
        if (
          file.type === "script" &&
          file.version !== undefined &&
          file.languageId !== undefined
        ) {
          // Defer parses: the compile that follows pulls the trees it needs
          // through tree()/annotations(), so scripts the program never
          // includes are never parsed, and configure itself stays fast.
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
      // Deferred: the next compile pulls the tree if this script is part of
      // the program (see configure()).
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
    return this.documents.update(params);
  }

  removeFile(params: RemoveCompilerFileParams) {
    this._filesEpoch++;
    this.files.remove(params);
    const file = params.file;
    // Drop the root-region record for this file — it strongly references that
    // file's chunk IR, and nothing else prunes this map.
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

  selectDocument(params: SelectCompilerDocumentParams) {
    this._events[SelectedCompilerDocumentMessage.method].forEach((l) => {
      l?.(params);
    });
    return params;
  }

  /**
   * Serialize the compiled program into `program`.
   *
   * Extracted so the no-change short-circuit can materialize bytecode
   * LAZILY (#351): a host that normally suppresses emission can still ask
   * for it per request, and the answer has to come from the retained
   * runtime story rather than a full recompile.
   */
  protected serializeCompiledProgram(
    story: RuntimeStory,
    program: SparkProgram,
    uri: string,
  ): void {
    profile("start", this._profilerId, "ink/json", uri);
    // #314: the binary writer answers the SAME streaming write events as
    // SimpleJson.Writer, but appends records instead of building a JS
    // object tree — so on the no-memo path it does strictly less work.
    const binary = this._config.binaryProgram === true;
    const writer = binary
      ? new ProgramBinaryWriter(this._binaryTable, this._binarySlotHint)
      : new SimpleJson.Writer();
    // Incremental ToJson: reuse the serialized subtree of each top-level flow
    // whose source content is unchanged AND whose cross-flow fingerprint
    // (#f flags + resolved divert/reference paths) is unchanged. Content is
    // covered by the chunk-unchanged signal; the fingerprint covers the
    // cross-flow bits that change without the flow's own source changing.
    const { reusable: reusableFlows, ok: flowReuseOk } =
      this.computeFlowReuse(story);
    if (this._renamedFlowNames) {
      // A synthetic rename inside a flow changes its serialized bytes in
      // ways the fingerprint can't see — its cached JSON must not be
      // served (see the canonicalize step above).
      for (const renamed of this._renamedFlowNames) {
        reusableFlows.delete(renamed);
      }
    }
    if (!flowReuseOk) {
      // The global guard failed (a changed chunk sits before the first flow,
      // so an inlined const may have shifted): no flow can be reused this
      // compile. Take the exact baseline path — no fingerprinting, which
      // would otherwise be pure overhead — and let the cache lapse so the
      // next reuse-eligible edit reseeds from a fresh serialization.
      story.ToJson(writer as never);
      this._flowJsonCache = undefined;
      this._flowChunkCache = undefined;
    } else if (binary) {
      // Binary twin of the JSON memo below. The reuse GUARDS are shared —
      // `reusableFlows` and the `_renamedFlowNames` subtraction are
      // computed once above — so the two paths can never disagree about
      // which flows are eligible, only about what a cached value is.
      const binaryWriter = writer as ProgramBinaryWriter;
      const prevChunkCache = this._flowChunkCache;
      const nextChunkCache = new Map<string, CachedFlowChunk>();
      const flowMemo = {
        resolve: (name: string, container: Container, serialize: () => any) => {
          // Same two exclusions as the JSON path, for the same reasons:
          // `global decl` is non-contiguous and cheap, and canonical
          // synthetic names are POSITIONAL, so a name can rebind to a
          // different flow that the fingerprint cannot distinguish.
          if (name === "global decl" || CANONICAL_SYNTH_NAME.test(name)) {
            return serialize();
          }
          const fp = JsonSerialisation.FingerprintCrossFlow(container);
          if (reusableFlows.has(name) && prevChunkCache) {
            const cached = prevChunkCache.get(name);
            // The generation check is what keeps a reseed sound. Returning
            // a chunk here means NOT calling serialize(), so a chunk from
            // an older numbering could not be recovered from downstream —
            // the writer throws rather than guess, so the decision has to
            // be made here.
            if (
              cached &&
              cached.fp === fp &&
              cached.chunk.generation === binaryWriter.generation
            ) {
              nextChunkCache.set(name, cached);
              // `WriteInjected` splices the records; the flow is never
              // re-walked and its strings are never re-hashed.
              return cached.chunk;
            }
          }
          // Miss: arm the writer to capture whatever gets injected next,
          // because `resolve` returns BEFORE the caller injects it.
          binaryWriter.captureNextInjectedAs(name, fp);
          return serialize();
        },
      };
      story.ToJson(binaryWriter as never, flowMemo);
      for (const [name, entry] of binaryWriter.takeCapturedChunks()) {
        nextChunkCache.set(name, entry);
      }
      this._flowChunkCache = nextChunkCache;
    } else {
      const prevFlowCache = this._flowJsonCache;
      const nextFlowCache = new Map<string, { fp: string; value: any }>();
      const flowMemo = {
        resolve: (name: string, container: Container, serialize: () => any) => {
          // `global decl` is non-contiguous (scattered declarations) and
          // cheap; always serialize it fresh, never cache.
          //
          // Canonical synthetic flows (`__synth_<n>`, see
          // `canonicalizeSyntheticFlowNames`) are excluded because their
          // names are POSITIONAL (document-order ordinals), so a name can
          // rebind to a DIFFERENT flow when an edit adds/removes a
          // synthetic earlier in the document — and the cross-flow
          // fingerprint can't tell two same-shaped function knots apart
          // (it deliberately records nothing for pure content, relying on
          // chunk identity for structure, which name rebinding breaks).
          // These are tiny function knots; serializing fresh is cheap.
          if (name === "global decl" || CANONICAL_SYNTH_NAME.test(name)) {
            return serialize();
          }
          const fp = JsonSerialisation.FingerprintCrossFlow(container);
          let value: any;
          if (reusableFlows.has(name) && prevFlowCache) {
            const cached = prevFlowCache.get(name);
            value = cached && cached.fp === fp ? cached.value : serialize();
          } else {
            value = serialize();
          }
          nextFlowCache.set(name, { fp, value });
          return value;
        },
      };
      // ProgramBinaryWriter mirrors the streaming surface ToJson drives, but
      // it is not a SimpleJson.Writer: its callbacks hand back itself, not a
      // Writer. The two are interchangeable on this path only.
      story.ToJson(writer as SimpleJson.Writer, flowMemo);
      this._flowJsonCache = nextFlowCache;
    }
    if (binary) {
      // Pieces, not a packed blob: `nodes`/`numbers` are typed arrays that
      // transfer in O(1) across a worker boundary, and packing them into
      // one self-describing byte blob costs ~10ms/compile (it re-encodes
      // the whole string table to UTF-8) for no benefit on that hop.
      const buffer = (writer as ProgramBinaryWriter).toBuffer();
      program.compiledBuffer = buffer;
      this._binarySlotHint = buffer.nodes.length;
      // Safe to run AFTER emitting: reseeding installs fresh arrays on the
      // table rather than clearing them in place, so the buffer just
      // emitted keeps its own (correct) string array alive.
      this.maybeReseedBinaryTable();
    } else {
      const json = (writer as SimpleJson.Writer).toObject();
      if (json) {
        program.compiled = json;
      }
    }
    profile("end", this._profilerId, "ink/json", uri);
  }
  compile(params: CompileProgramParams) {
    const uri = params.textDocument.uri;
    const startFrom = params.startFrom;
    // Per-request override of the instance default (#351). A host can suppress
    // bytecode for its per-keystroke compiles and still ask for it on the one
    // compile that feeds a view, instead of paying for it every edit.
    const emitCompiledProgram =
      params.emitCompiledProgram ?? this._config.emitCompiledProgram !== false;

    // No-change short-circuit: if every script the last compile read is at
    // the same version, the file registry hasn't changed, and the visit
    // counting mode matches, this compile would reproduce the previous
    // program bit-for-bit -- serve it instead of re-running the pipeline.
    // (Per-request fields are re-stamped below; listeners still fire so
    // downstream consumers observe the compile as usual.)
    const cached = this._lastCompileResult;
    if (
      cached &&
      cached.uri === uri &&
      cached.filesEpoch === this._filesEpoch &&
      cached.countAllVisits === !!params.countAllVisits &&
      Object.entries(cached.scripts).every(
        ([scriptUri, version]) =>
          this.documents.get(scriptUri)?.version === version,
      )
    ) {
      cached.program.startFrom = startFrom ?? this._config.startFrom;
      // The cached program may have been built with emission suppressed. If
      // this request wants bytecode, serialize it now from the RETAINED story
      // rather than forcing a recompile — and cache it on the program so a
      // second request does not pay again.
      if (
        emitCompiledProgram &&
        cached.story &&
        !cached.program.compiled &&
        !cached.program.compiledBuffer
      ) {
        this.serializeCompiledProgram(cached.story, cached.program, uri);
      }
      const result: {
        textDocument: { uri: string; version: number };
        program: SparkProgram;
        story?: RuntimeStory;
      } = {
        textDocument: {
          uri,
          version: this.documents.get(uri)?.version ?? -1,
        },
        program: cached.program,
        story: cached.story,
      };
      this._events[CompiledProgramMessage.method].forEach((l) => {
        l?.(result);
      });
      delete result.story;
      return result;
    }

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
      this.mergePreludeSparkle(program);
    } else {
      this.populateBuiltins(program);
    }

    // Begin a fresh per-compile record of chunk identities + changed ranges
    // for the incremental location cache (see `_locCache`). Populated by the
    // recursive `parseIncrementally` chunk walk(s), consumed by
    // `populateAllLocations`, finalized below.
    this._compilationIds = new Set();
    this._changedChunkRanges = [];
    // Rebuilt by `populateAllLocations`; cleared first so a compile that never
    // reaches the walk cannot publish the previous compile's captures.
    this._flowAssetAccum = undefined;

    let compileThrew = false;
    // ---- Incremental ExportRuntime: per-compile flow-reuse guards ----
    this._flowReuseDisabled = this._disableFlowReuseNextCompile;
    this._disableFlowReuseNextCompile = false;
    const reuseCountAllVisits = !!params.countAllVisits;
    if (
      reuseCountAllVisits ||
      reuseCountAllVisits !== this._lastReuseCountAllVisits
    ) {
      // countAllVisits changes what GENERATION bakes into every container
      // (count flags), which reuse skips. Only test harnesses set it.
      this._flowReuseDisabled = true;
    }
    this._lastReuseCountAllVisits = reuseCountAllVisits;
    if (
      this._lastCompileResult &&
      this._lastCompileResult.uri === uri &&
      this._lastCompileResult.filesEpoch === this._filesEpoch
    ) {
      // A change in any NON-entry script (includes / `run` files) can shift
      // consts/globals whose values were INLINED into other files' flows at
      // generation — and the include site may come after flows that would
      // already have committed reuse, so it must be decided up front.
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
    this._reuseParentBackups = undefined;
    this._renamedFlowNames = undefined;
    this._censusEntries = [];

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
      // Whole-program namespace scoping (P1). Scope leaf-instance defines to a
      // synthetic `$<type>_<name>` global here — after assembly, before
      // ExportRuntime bakes each define's global key — rather than in
      // per-document lowering, so a `define X` and its `as X`/`new X()` sites in
      // DIFFERENT files classify consistently. `scopeDefineInstances` is
      // idempotent, so re-running each compile on cached define objects is safe.
      //
      // Two passes with SEPARATE type sets. The source-injected builtins prelude
      // is classified by its OWN type names (as if compiled in isolation) — NOT
      // the user's — so the `character` duality survives: the prelude's `define
      // character as synth` scopes to `$synth_character` even though user files
      // use `character` as a type (`as character`). If the user's type set leaked
      // in, `character` would stay bare and the synth-instance view would
      // collapse into the character type table. The user pass then scopes the
      // rest with the union across all USER files (root + includes), and skips
      // the prelude VAs the first pass already handled.
      const collectTypeNamesFor = (uris: Iterable<string>): Set<string> => {
        const names = new Set<string>();
        for (const scanUri of uris) {
          const scanTree = this.documents.tree(scanUri);
          const scanDoc = this.documents.get(scanUri);
          if (scanTree && scanDoc) {
            const scanText = scanDoc.getText();
            for (const name of collectDefineTypeNames(scanTree, (f, t) =>
              scanText.slice(f, t),
            )) {
              names.add(name);
            }
          }
        }
        return names;
      };
      const preludeVAs = new Set<ParsedObject>();
      const preludeStory = this._cachedPreludeParsedStory;
      if (preludeStory && this.documents.has(BUILTINS_PRELUDE_URI)) {
        const preludeTypeNames = collectTypeNamesFor([BUILTINS_PRELUDE_URI]);
        scopeDefineInstances([preludeStory], preludeTypeNames, {
          collect: preludeVAs,
        });
      }
      // User files: the root + resolved includes (`program.scripts`), excluding
      // the prelude — its defines were just scoped with the prelude's own types.
      const userUris = new Set<string>(Object.keys(program.scripts));
      userUris.add(uri);
      userUris.delete(BUILTINS_PRELUDE_URI);
      const userTypeNames = collectTypeNamesFor(userUris);
      // `collect` hands back exactly the user's define VAs, so the override pass
      // below needs no walk of its own.
      const userVAs = new Set<ParsedObject>();
      scopeDefineInstances([parsedStory], userTypeNames, {
        skip: preludeVAs,
        collect: userVAs,
      });
      // Now that both sides carry their final global keys, let an authored
      // define that reuses a builtin name override it rather than collide.
      this.applyBuiltinOverrides(userVAs, preludeVAs);
      // (Diagnostic-dedup state on reused parsed nodes is invalidated by the
      // compile-epoch bump inside ExportRuntime — see CompileEpoch.ts — so a
      // carried-forward chunk re-emits the same diagnostics a cold compile
      // would, without a per-compile tree walk.)
      //
      // A callee's signature is baked into its CALLERS' bytecode at their
      // generation time, so a signature change invalidates reuse of flows
      // whose own chunks are untouched (see `_prevFlowSignatures`). The
      // current signatures aren't known until assembly finishes, so this is
      // a post-hoc check that feeds the same demotion path as a
      // late-discovered global change.
      // Declared-name census across every file of this compile — see
      // `_censusEntries`. Compared here (not per file) so includes can't
      // clobber each other's census.
      const censusKey = (this._censusEntries ?? []).sort().join("");
      if (
        this._prevCensusKey !== undefined &&
        this._prevCensusKey !== censusKey
      ) {
        this._flowReuseDisabled = true;
      }
      this._prevCensusKey = censusKey;
      const flowSignatures = this.collectFlowSignatures(parsedStory);
      if (this._prevFlowSignatures && !this._flowReuseDisabled) {
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
      // Late-discovered global change (e.g. a mid-file `run` whose .luau
      // source changed re-lowered its virtual file's root region), or a
      // callee-signature change discovered just above: demote any reuse
      // already committed before the discovery so this compile regenerates
      // those flows from their (intact) parsed content.
      if (this._flowReuseDisabled && this._reusedFlowsThisCompile?.size) {
        for (const flow of this._reusedFlowsThisCompile) {
          this.resetSubtreeRuntime(flow);
        }
        this._reusedFlowsThisCompile.clear();
      }
      // Canonicalize offset-derived synthetic names over the fully-assembled
      // tree so incremental compiles emit byte-identical bytecode to cold ones
      // (see method doc) — must run before ExportRuntime resolves references.
      profile("start", this._profilerId, "ink/canonicalizeSyntheticNames", uri);
      const renamedTopLevel = this.canonicalizeSyntheticFlowNames(parsedStory);
      profile("end", this._profilerId, "ink/canonicalizeSyntheticNames", uri);
      // Positional synthetic renames can land INSIDE an unchanged flow
      // (adding an anonymous fn earlier renumbers every later `__synth_<n>`).
      // Names are baked into runtime objects at GENERATION time, so a REUSED
      // flow touched by a rename must be regenerated — and any renamed flow's
      // serialized-JSON cache entry must lapse (the cross-flow fingerprint
      // records nothing for pure content, so it can't catch the rename).
      if (renamedTopLevel) {
        for (const flow of renamedTopLevel) {
          if (this._reusedFlowsThisCompile?.has(flow as FlowBase)) {
            this.resetSubtreeRuntime(flow);
            this._reusedFlowsThisCompile?.delete(flow as FlowBase);
          }
          const flowName =
            flow instanceof FlowBase ? flow.identifier?.name : undefined;
          if (flowName) {
            (this._renamedFlowNames ??= new Set()).add(flowName);
          }
        }
      }
      // An unseeded compile has no runtime table for any builtin define, but
      // every host seeds them at runtime, so their names must still resolve.
      if (
        this._config.useBuiltinsPrelude !== false &&
        !this._config.seedBuiltinsIntoStory
      ) {
        parsedStory.DeclareBuiltinGlobals(getPreludeGlobalNames());
      }
      profile("start", this._profilerId, "ink/compile", uri);
      const story = parsedStory.ExportRuntime(onDiagnostic);
      profile("end", this._profilerId, "ink/compile", uri);
      // Bar flows that raised GENERATION-time diagnostics from future reuse —
      // reuse skips generation, which would silently drop them next compile.
      for (const flow of parsedStory.flowsWithGenerationDiagnostics) {
        this._flowsWithGenDiagnostics.add(flow);
      }
      if (parsedStory.hadUnattributableGenerationDiagnostic) {
        this._disableFlowReuseNextCompile = true;
      }
      if (story) {
        // #345: hosts that never read the bytecode skip SERIALIZATION only.
        // Everything else in this block still has to run — `state.story`, and
        // `populateAllLocations` below, which walks the runtime tree for
        // `pathLocations` (the editor navigates source with those).
        // Orthogonal to `binaryProgram`, which picks the FORM when something
        // is emitted; with emission off neither form is produced.
        // #345/#351: emission is suppressed for hosts that never read the
        // bytecode, and can be re-requested per compile. Everything else in
        // this block still runs — `state.story`, and `populateAllLocations`
        // below, which walks the runtime tree for `pathLocations`.
        if (emitCompiledProgram) {
          this.serializeCompiledProgram(story, program, uri);
        } else {
          // Neither per-flow cache is maintained by a compile that skips
          // serialization, so both go stale the moment one runs — the same
          // reasoning `configure()` applies when the CONFIG flag flips. The
          // per-request opt-out bypasses `configure()`, so it must invalidate
          // here too. Without this, pull → edit → edit → pull re-serves a
          // pre-edit flow from the cache: `computeFlowReuse` only knows the
          // CURRENT compile's `_changedChunkRanges`, and a pure-content edit
          // leaves the cross-flow fingerprint unchanged by design, so nothing
          // else catches the skipped compiles in between.
          this._flowJsonCache = undefined;
          this._flowChunkCache = undefined;
        }
        state.story = story;
        // Gather source-location maps in a single top-down walk of the
        // runtime tree (see `populateAllLocations`). Done AFTER `ToJson`
        // rather than as its `onWriteRuntimeObject` callback so the path of
        // each object is derived incrementally from the traversal instead of
        // recomputed per object via the O(n²) `Object.path` getter.
        profile("start", this._profilerId, "populateLocations", uri);
        // Precompute uri -> scriptIndex once so `populateLocations` can look
        // it up in O(1) instead of re-running `Object.keys().indexOf()` per
        // object.
        this._scriptIndices = new Map(
          Object.keys(program.scripts).map((u, i) => [u, i]),
        );
        this.populateAllLocations(program, story);
        // Carry this compile's chunk-identity set forward so the next compile
        // can tell which chunks are unchanged.
        this._prevCompilationIds = this._compilationIds;
        // Promote this compile's flow-run records (fresh constructions and
        // committed reuses) for the next compile's reuse decisions.
        this._prevFlowRuns = this._nextFlowRuns;
        profile("end", this._profilerId, "populateLocations", uri);
      }
    } catch (e) {
      compileThrew = true;
      // Close whichever phase was in flight. This catch swallows the throw and
      // the compiler keeps serving, so a phase left open here produces no
      // measurement at all — losing exactly the compiles worth looking at, and
      // `ink/compile` (ExportRuntime) is the very phase this catch was written
      // for. Ending a phase that already ended is a no-op, so naming all five
      // is safe. Add any new phase opened inside this `try` to the list.
      for (const phase of [
        "ink/parse",
        "ink/canonicalizeSyntheticNames",
        "ink/compile",
        "ink/json",
        "populateLocations",
      ]) {
        profile("end", this._profilerId, phase, uri);
      }
      console.error(e);
      // Restore the parents of containers committed to reuse — the previous
      // RuntimeStory is still live (checkpoint-builder Game) and generation
      // may have re-parented them into the now-discarded half-built tree.
      const reuseParentBackups = this._reuseParentBackups as
        | Array<[Container, InkObject | null]>
        | undefined;
      if (reuseParentBackups) {
        for (const [container, parent] of reuseParentBackups) {
          container.parent = parent;
        }
      }
      // A threw compile can leave carried parsed/runtime state half-mutated;
      // drop all reuse records so the next compile rebuilds from scratch.
      this._prevFlowRuns = undefined;
      this._lastRootBlocksByUri = undefined;
      // The census may be half-collected (the throw can land mid-parse), so
      // drop it rather than compare a truncated one next compile.
      this._prevCensusKey = undefined;
      this._disableFlowReuseNextCompile = true;
    }

    this.populateFiles(program);
    this.populateDeclarationLocations(program);
    this.sortPathLocations(program);
    if (!compileThrew) {
      // Needs `functionLocations` (just populated) to classify divert edges.
      this.populateSceneAssets(program);
    }
    this.buildContext(state, program);
    this.populateEngineChannels(program);
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
    // Remember this compile for the no-change short-circuit -- but only if it
    // completed cleanly (a compile that threw may hold a partial program).
    this._lastCompileResult = compileThrew
      ? undefined
      : {
          uri,
          scripts: { ...program.scripts },
          filesEpoch: this._filesEpoch,
          countAllVisits: !!params.countAllVisits,
          program,
          story: state.story,
        };
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

  /** Recursively clear the per-compile RUNTIME state of parsed objects (their
   *  generated runtime objects + identifier runtime), mirroring the reset
   *  `remapContent` does for reused incremental chunks but WITHOUT re-offsetting
   *  debug metadata. Lets the cached, constant prelude parse be reused across
   *  compiles; PreProcessTopLevelObjects re-parents the content on each splice. */
  protected resetParsedRuntime(content: ParsedObject[]) {
    for (const c of content) {
      c.ResetRuntime();
      if (
        "identifier" in c &&
        c.identifier instanceof Identifier
      ) {
        c.identifier.ResetRuntime();
      }
      if ("pathIdentifiers" in c && Array.isArray(c.pathIdentifiers)) {
        for (const p of c.pathIdentifiers) {
          if (p instanceof Identifier) {
            p.ResetRuntime();
          }
        }
      }
      if (c.content) {
        this.resetParsedRuntime(c.content);
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

    // Restamp-only variant of `remapContent` for chunks feeding a REUSED
    // flow: rebase debugMetadata source positions in place (shared by
    // reference with the cached runtime objects, so they auto-shift) WITHOUT
    // touching cached runtime state — not resetting is the reuse.
    const restampContent = (
      content: ParsedObject[],
      lineNumberOffset: number,
    ) => {
      for (const c of content) {
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
              p.debugMetadata.fileName = fileName;
              p.debugMetadata.filePath = uri;
            }
          }
        }
        if (c.content) {
          restampContent(c.content, lineNumberOffset);
        }
      }
    };

    const document = this.documents.get(uri);
    const annotations = this.documents.annotations(uri);
    const topLevelIncludedFileObjs: IncludedFile[] = [];
    const topLevelFlowBaseObjs: FlowBase[] = [];
    const topLevelWeaveObjs: ParsedObject[] = [];
    const topLevelContent: (FlowBase | Weave)[] = [];

    // SOURCE-INJECT the builtins prelude (P5 prerequisite). For the ROOT parse
    // only, prepend the prelude as a synthetic leading `include` so its builtin
    // `__def` global declarations execute in THIS program's runtime story VM —
    // one coherent `global decl`, prelude FIRST (so an authored define reusing a
    // builtin name re-registers/overrides in place), with all paths/indices
    // resolved by the single trusted codegen pass. The prelude's chunks
    // contribute only runtime FlowBase here (`_injectingPrelude` suppresses their
    // context/sparkle re-merge), so `program.context` is unchanged vs the
    // flag-off path; only `program.compiled` gains the builtins.
    if (
      !isInclude &&
      this._config.seedBuiltinsIntoStory &&
      this._config.useBuiltinsPrelude
    ) {
      let preludeStory = this._cachedPreludeParsedStory;
      if (preludeStory) {
        // Reuse the cached parse: reset only the per-compile RUNTIME state on the
        // constant prelude objects so ExportRuntime regenerates them cleanly
        // (re-lowering hundreds of builtin defines every compile is too costly).
        this.resetParsedRuntime(preludeStory.content);
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

    // Materialize the chunk list so flow-run reuse decisions can look AHEAD —
    // a flow's reusability depends on ALL the body chunks that fed it last
    // compile reappearing unchanged, in order.
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

    // Where a chunk's content ATTACHES during assembly, discriminated the
    // same way the assembly branches below do (first content object).
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

    // Reuse-disqualifier scan, computed ONCE per chunk identity (carried
    // chunks keep their result). A flow whose run contains any of these can
    // never be reused, because skipping its generation loses a story-global
    // side effect: global `var`/`store` declarations register into the fresh
    // Story's variableDeclarations, EXTERNALs into `story.externals`, and
    // const/list/struct declarations feed story-level maps, and a LIST is
    // additionally INLINED BY VALUE into other flows' bytecode — which is why
    // a CHANGED chunk containing a list disables reuse globally. Constants
    // are no longer inlined (#309), so they only cost the declaring flow its
    // own reuse, not everyone else's.
    const scanChunkForReuse = (
      block: any,
    ): {
      disqualifies: boolean;
      invalidatesGlobals: boolean;
      declaredNames: string[];
    } => {
      let cached = this._chunkReuseScan?.get(block);
      if (cached) {
        return cached;
      }
      let disqualifies = false;
      let invalidatesGlobals = false;
      const declaredNames: string[] = [];
      const scan = (nodes: ParsedObject[]) => {
        for (const n of nodes) {
          if (n instanceof ListDefinition) {
            // List items are still resolved and inlined at generation time.
            disqualifies = true;
            invalidatesGlobals = true;
            const listName = n.identifier?.name;
            if (listName) {
              declaredNames.push(`c:${listName}`);
            }
          } else if (n instanceof ConstantDeclaration) {
            // Constants are no longer inlined into referencing flows (#309),
            // so a constant's VALUE changing can't invalidate anyone else's
            // bytecode and `invalidatesGlobals` is not set — editing a
            // constant no longer kills flow reuse program-wide.
            //
            // The NAME still matters, and for the same reason a global's
            // does: constants are registered in `story.variableDeclarations`,
            // which `Divert.ResolveTargetContent` consults during GENERATION,
            // so a constant named like a flow shadows it and changes call-site
            // codegen. Hence a `g:` census entry, not the retired `c:` one.
            // `disqualifies` also stays: the declaring flow still performs a
            // story-global registration when it generates.
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
          // Always recurse: the NAME census below must be complete, so this
          // can't early-out once the boolean verdicts are both decided.
          if (n.content) {
            scan(n.content);
          }
        }
      };
      if (block?.content) {
        scan(block.content);
      }
      cached = { disqualifies, invalidatesGlobals, declaredNames };
      (this._chunkReuseScan ??= new WeakMap()).set(block, cached);
      return cached;
    };

    // ---- Flow-reuse guards computed from this file's chunk list ----
    // (1) ROOT-REGION STRUCTURE: the ordered sequence of `include`/`run`
    // targets and `EXTERNAL` signatures. These change which files contribute
    // flows, and which call sites compile to external calls — neither of
    // which a reused flow can re-derive on its own. Compared by DESCRIPTOR
    // (the target string / the external's name+arity), NOT by chunk identity:
    // an identity comparison also fired for a re-lowered-but-unchanged chunk,
    // and the incremental parser's reparse window routinely re-lowers a root
    // chunk adjacent to an edit — which is why editing the front matter, or
    // the first scene, used to kill reuse for that whole compile.
    //
    // Deliberately NOT part of the descriptor: front matter, loose top-level
    // content, and top-level `store`/`var`/`define` declarations. None of
    // them can alter a reused flow's bytecode — top-level flows are
    // name-addressed in `namedOnlyContent`, so their internal paths don't
    // shift when top-level content grows or shrinks, and globals are read
    // through runtime variable lookups rather than inlined — as are
    // constants since #309. Their NAMES still matter, and are covered by the
    // declared-name census (see `_censusEntries`); LIST values are still
    // inlined and are covered by (2).
    //
    // (2) A changed chunk containing a list declaration anywhere disables all
    // reuse (value inlining into other flows).
    {
      const rootDescriptors: string[] = [];
      for (const rec of chunkRecords) {
        const block = rec.block as any;
        if (block.include) {
          rootDescriptors.push(`inc:${block.include}`);
        }
        if (block.run) {
          rootDescriptors.push(`run:${block.run}`);
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
          // Declared-NAME census (see `_censusEntries`). Cached per chunk
          // identity, so unchanged chunks cost a map lookup. Accumulated
          // across the WHOLE compile rather than per file — this function
          // recurses once per `include`/`run`, so a per-file key would be
          // overwritten by each included file and then compared against a
          // different file's census on the next compile, permanently
          // disabling reuse for any multi-file project.
          //
          // The source-injected builtins PRELUDE is excluded: its parse runs
          // through here exactly once per compiler instance (the cached parse
          // is reused thereafter, contributing nothing), so counting its ~360
          // defines on compile 1 and zero on compile 2 would make the census
          // keys differ and trip `_flowReuseDisabled` on precisely the first
          // compile where flow reuse could pay off. The prelude is a constant,
          // so its names can never actually change between compiles.
          if (!this._injectingPrelude) {
            for (const name of scan.declaredNames) {
              this._censusEntries?.push(`${uri}|${name}`);
            }
          }
          if (
            !this._flowReuseDisabled &&
            this._prevCompilationIds &&
            !this._prevCompilationIds.has(block) &&
            scan.invalidatesGlobals
          ) {
            this._flowReuseDisabled = true;
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

    // Chunks whose content-assembly is skipped because they feed a flow
    // reused from last compile's construction.
    const reuseSkipBlocks = new Set<object>();
    // The flow currently receiving body content in the NORMAL assembly path,
    // recorded so next compile knows each flow's full chunk run.
    let currentRun: { flow: FlowBase; contentChunks: object[] } | undefined;

    // Try to reuse last compile's constructed flow for the run declared by
    // `declBlock`: every content chunk of the recorded run must reappear
    // identically in order (interleaved content-less chunks — includes,
    // context-only — are transparent), no run chunk may carry a reuse
    // disqualifier, the flow must not have raised generation-time
    // diagnostics, and the chunk FOLLOWING the run must not be one that
    // would attach new body content into this flow.
    const tryReuseFlowRun = (
      declBlock: object,
      startIdx: number,
    ): FlowBase | undefined => {
      if (this._flowReuseDisabled || !this._prevFlowRuns) {
        return undefined;
      }
      const prevRun = this._prevFlowRuns.get(declBlock);
      if (!prevRun || this._flowsWithGenDiagnostics.has(prevRun.flow)) {
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
        if (!cb.content) {
          j++;
          continue;
        }
        if (cb !== runChunks[k] || scanChunkForReuse(cb).disqualifies) {
          return undefined;
        }
        j++;
        k++;
      }
      for (let m = j; m < chunkRecords.length; m++) {
        const cb = chunkRecords[m]!.block as any;
        if (!cb.content) {
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
      // Record the reused container's current parent so an aborted compile
      // can restore it — the previous RuntimeStory is still live in the
      // checkpoint-builder Game, and generation re-parents this container
      // into the (then discarded) new root.
      const reusedContainer = (prevRun.flow as any)._runtimeObject;
      if (reusedContainer) {
        (this._reuseParentBackups ??= []).push([
          reusedContainer,
          reusedContainer.parent,
        ]);
      }
      return prevRun.flow;
    };

    for (let chunkIdx = 0; chunkIdx < chunkRecords.length; chunkIdx++) {
      const rec = chunkRecords[chunkIdx]!;
      const {
        include,
        run,
        diagnostics,
        content,
        context,
        sparkle,
        defaultDefinitions,
        uuid,
        hoistedKnots,
      } = rec.block;
      const lineNumberOffset = document?.lineAt(rec.from) ?? 0;
      // Track chunk identity for the incremental location cache. A chunk whose
      // CompiledBlock object is carried forward from the previous compile (same
      // identity) is unchanged; a new identity means it was re-lowered. Record
      // changed chunks' 0-based source line ranges so `populateAllLocations` can
      // tell which flows' subtrees must be recomputed vs reused.
      const compiledBlock = rec.block as object;
      this._compilationIds?.add(compiledBlock);
      if (
        this._prevCompilationIds &&
        !this._prevCompilationIds.has(compiledBlock)
      ) {
        const chunkStart = lineNumberOffset;
        const chunkEnd = document?.lineAt(rec.to) ?? chunkStart;
        this._changedChunkRanges?.push([chunkStart, chunkEnd]);
      }
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
          let runStory: ReturnType<typeof this.parseIncrementally> | null =
            null;
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
        // ---- Incremental ExportRuntime: flow-run reuse decision ----
        if (!reuseSkipBlocks.has(compiledBlock)) {
          const first = content[0];
          const declaresTopLevelFlow =
            first instanceof Knot ||
            (first instanceof Stitch &&
              !(topLevelContent.at(-1) instanceof Knot));
          if (declaresTopLevelFlow) {
            currentRun = undefined;
            const reusedFlow = tryReuseFlowRun(compiledBlock, chunkIdx);
            if (reusedFlow) {
              topLevelFlowBaseObjs.push(reusedFlow);
              topLevelContent.push(reusedFlow as Knot | Stitch);
            }
          }
        }
        if (reuseSkipBlocks.has(compiledBlock)) {
          // This chunk feeds a REUSED flow: keep its cached runtime subtree
          // intact (skipping ResetRuntime IS the reuse) and skip re-assembly —
          // the constructed flow already holds this chunk's parsed content by
          // identity. Only re-stamp source positions if the chunk moved.
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
              currentRun = { flow: knot, contentChunks: [compiledBlock] };
              this._nextFlowRuns?.set(compiledBlock, currentRun);
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
                currentRun?.contentChunks.push(compiledBlock);
              } else {
                topLevelFlowBaseObjs.push(stitch);
                topLevelContent.push(stitch);
                currentRun = { flow: stitch, contentChunks: [compiledBlock] };
                this._nextFlowRuns?.set(compiledBlock, currentRun);
              }
            } else if (flow instanceof ExternalDeclaration) {
              const weave = new Weave([flow]);
              topLevelWeaveObjs.push(weave);
              topLevelContent.push(weave);
              currentRun = undefined;
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
                currentRun?.contentChunks.push(compiledBlock);
              } else {
                const weave = new Weave(flowContent);
                topLevelWeaveObjs.push(weave);
                topLevelContent.push(weave);
                currentRun = undefined;
              }
            }
          }
        }
      }
      if (context && !this._injectingPrelude) {
        // Copy pre-built structs to program context. An authored define that
        // reuses a builtin name (seeded earlier by mergePreludeContext) OVERRIDES
        // IN PLACE: its properties win, but the builtin's *unspecified* siblings
        // are retained. Without this, a partial override silently drops every
        // field it doesn't restate — e.g. `define ui as config with
        // reactive = true` would lose the builtin `layouts_element_name` /
        // `styles_element_name` / `breakpoints`, leaving `reveal()` unable to
        // find the screen root (it bails on an undefined `layouts_element_name`),
        // so screens stay at opacity:0 — a black preview with no error.
        //
        // Structural element-tree types (screen/component) are REPLACED wholesale
        // rather than deep-merged — merging two element trees would splice the
        // builtin's children into the authored one. (They likewise override by
        // replace in the reactive `sparkle` channel; see mergePreludeSparkle.)
        const REPLACE_TYPES = new Set(["layout", "screen", "component"]);
        for (const [type, structs] of Object.entries(context) as [
          string,
          Record<string, any>,
        ][]) {
          for (const [name, struct] of Object.entries(structs)) {
            program.context ??= {};
            program.context[type] ??= {};
            const existing = program.context[type][name];
            program.context[type][name] =
              existing && !REPLACE_TYPES.has(type)
                ? this.inheritDefaults(existing, struct)
                : struct;
          }
        }
      }
      if (sparkle && !this._injectingPrelude) {
        // Merge the reactive Sparkle UI AST onto program.sparkle (additive;
        // not yet consumed — the static screens/components channels still
        // drive rendering until Phase 3).
        for (const kind of ["layouts", "screens", "components"] as const) {
          const trees = sparkle[kind];
          if (trees) {
            program.sparkle ??= {};
            program.sparkle[kind] ??= {};
            Object.assign(program.sparkle[kind]!, trees);
          }
        }
      }
      if (defaultDefinitions && !this._injectingPrelude) {
        // Copy default definitions to state
        for (const [type, struct] of Object.entries(defaultDefinitions)) {
          state.defaultDefinitions ??= {};
          state.defaultDefinitions[type] ??= struct;
        }
      }
    }

    // Scene/`end` (and branch) pairing validation. This is a CROSS-CHUNK
    // structural check — a scene's validity depends on a LATER root-level `end`
    // sibling — so it runs fresh over the whole parse tree each compile rather
    // than per-chunk during lowering. A per-chunk check would go stale when only
    // the matching `end` chunk is edited (the earlier scene chunk isn't
    // re-lowered), silently dropping the "missing `end`" diagnostic incrementally.
    this.validateSceneStructure(uri, onDiagnostic);

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
            last instanceof ParsedReturnType;
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

  // Canonicalize compiler-synthesized identifier names that are minted from a
  // node's ABSOLUTE source offset at lowering time — anonymous/define/redef
  // function knots (`__anon_fn_<from>`, `__define_fn_<from>`,
  // `<name>__redef_<from>`), method-call receiver temps (`__mcall_<from>`), and
  // loop variables/labels (`__forIdx_<from>`, `__for_<from>_loop`, …). Those
  // offset-based names are FROZEN into the per-chunk lowered IR that the
  // incremental pipeline reuses-and-shifts WITHOUT re-lowering (only
  // `debugMetadata` line numbers are rebased). So a carried-forward shifted
  // chunk keeps a stale offset (`__define_fn_143`) while a cold compile of the
  // same text re-derives the current one (`__define_fn_144`) — and since these
  // names become runtime container names (keys/paths in `program.compiled`),
  // the bytecode diverges between an incremental and a cold compile.
  //
  // This pass runs over the FULLY-ASSEMBLED tree on EVERY compile (both cold
  // and incremental, before ExportRuntime) and renumbers each distinct synthetic
  // name to `__synth_<n>` by DOCUMENT-ORDER of first appearance. Numbering by
  // ORDER (not by the offset value) is what makes the result identical between a
  // cold parse and an incremental parse of the same text: a carried node sits at
  // the same tree position either way, so it gets the same ordinal regardless of
  // any stale offset baked into its name. A given synthetic name's definition
  // and all of its references share the exact same string and are emitted within
  // the same chunk, so a uniform string→string remap suffices (no need to link
  // references back to definitions).
  // Call-relevant signature of every named flow, keyed by name. Walks the
  // flow tree only (each flow's named sub-flows), never the full parsed tree,
  // so this is O(flows) — negligible next to a compile. See
  // `_prevFlowSignatures` for why call sites depend on it.
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
              `${a.isVararg ? "*" : ""}${a.isByReference ? "&" : ""}${
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

  // Recursively clear cached runtime objects under a constructed flow so the
  // next `ExportRuntime` regenerates it from its (intact) parsed content —
  // used to DEMOTE a flow whose committed reuse turned out to be invalid
  // (late-discovered global change, synthetic rename in its subtree).
  protected resetSubtreeRuntime(node: ParsedObject): void {
    node.ResetRuntime();
    const identifier = (node as { identifier?: unknown }).identifier;
    if (identifier instanceof Identifier) {
      identifier.ResetRuntime();
    }
    const content = node.content;
    if (content) {
      for (const c of content) {
        this.resetSubtreeRuntime(c);
      }
    }
  }

  protected canonicalizeSyntheticFlowNames(
    root: ParsedObject,
  ): Set<ParsedObject> | undefined {
    // Every offset-derived synthetic family minted in the lowerers — PLUS the
    // canonical `__synth_<n>` form this pass itself produces. The pass mutates
    // the parsed IR in place and the incremental pipeline carries those nodes
    // into the next compile, so already-renamed names must be re-collected and
    // renumbered too: when an edit adds/removes a synthetic earlier in the
    // document, a carried `__synth_k`'s ordinal is stale and only re-running it
    // through the document-order numbering matches what a cold compile derives.
    const SYNTH =
      /^(?:__anon_fn_|__define_fn_|__mcall_|__forIdx_|__forStop_|__forStep_|__synth_)\d+$|^(?:__for_|__forIn_|__while_|__repeat_)\d+_[A-Za-z]+$|__redef_\d+$/;
    const remap = new Map<string, string>();
    // True once any collected name maps to a DIFFERENT canonical name. In the
    // steady state (carried names already canonical and ordinals unchanged —
    // the common case for most edits) every mapping is the identity and the
    // whole rewrite phase is skipped.
    let changed = false;
    // Matches recorded during the single collection walk so rewriting is
    // O(matches) instead of a second full-tree walk. `matchedIds` is deduped
    // (the same Identifier object can be aliased from several own-properties,
    // e.g. `identifier` and a `pathIdentifiers` entry) so each object is
    // rewritten exactly once — rewriting twice could CHAIN through the remap
    // now that canonical `__synth_<n>` names are themselves remappable.
    const matchedIds: Array<{ id: Identifier; owner: ParsedObject }> = [];
    const seenIds = new Set<Identifier>();
    const matchedStrings: Array<{ node: any; field: string }> = [];
    const flowsToRekey: FlowBase[] = [];

    const considerName = (name: string) => {
      let next = remap.get(name);
      if (next === undefined) {
        next = `__synth_${remap.size}`;
        remap.set(name, next);
        if (next !== name) {
          changed = true;
        }
      }
    };
    const considerId = (id: Identifier, owner: ParsedObject) => {
      const name = id.name;
      if (name && SYNTH.test(name) && !seenIds.has(id)) {
        seenIds.add(id);
        considerName(name);
        matchedIds.push({ id, owner });
      }
    };
    // A few nodes hold a synthetic name as a PLAIN STRING (not an Identifier) and
    // emit runtime variable refs straight from it — `StashAndRereadExpression.tempName`
    // (the `__mcall_<from>` receiver stash) and `VariablePointerExpression.variableName`.
    // Their Identifier-shaped counterparts get renamed above, so the string side
    // must be kept in lockstep or the temp's declaration and its read diverge.
    // Only SYNTH-matching values are touched, so user strings/display text are safe.
    const NAME_STRING_FIELDS = ["tempName", "variableName"];

    // Every Identifier-bearing field in the ParsedHierarchy (from the class
    // declarations): the base `identifier`, Divert/VariableReference
    // `pathIdentifiers`, VariableAssignment `variableIdentifier`,
    // StructDefinition `modifier`/`type`/`name`, List `itemIdentifierList`.
    // Visiting these directly instead of sweeping `Object.keys(node)` per node
    // is what keeps this pass cheap (no per-node key-array allocation over the
    // whole tree). If a new Identifier-valued field is ever added to a parsed
    // node, it must be listed here — the incremental oracle's synthetic-name
    // fuzz and the conformance suite are the safety net for a miss.
    const IDENTIFIER_FIELDS = [
      "identifier",
      "pathIdentifiers",
      "variableIdentifier",
      "modifier",
      "type",
      "name",
      "itemIdentifierList",
    ];

    // Single walk: assign ordinals in document (pre-order content) traversal
    // order, recording every match for the later targeted rewrite. Per node,
    // Identifier-valued fields are visited before the plain string fields
    // (same order the previous two-pass implementation used, so ordinal
    // assignment is unchanged).
    // Returns whether this subtree contains ANY synthetic name.
    //
    // Subtrees with none are remembered by node identity and skipped entirely
    // on later compiles: the incremental pipeline carries unchanged nodes
    // forward by identity, and a re-lowered node is a NEW object, so it is
    // never wrongly skipped. The set stays valid across the rewrite below
    // because renaming only ever rewrites names that already matched SYNTH
    // (including the canonical `__synth_<n>` form), so a synth-free subtree
    // cannot acquire one. Most of a screenplay is display text with no
    // synthetics at all, which is what makes this worth caching — the walk
    // itself is otherwise whole-tree on every keystroke.
    const collect = (node: ParsedObject): boolean => {
      const markedLength = this._synthFreeSubtrees.get(node);
      if (
        markedLength !== undefined &&
        markedLength === (node.content?.length ?? 0)
      ) {
        return false;
      }
      let found = false;
      for (const f of IDENTIFIER_FIELDS) {
        const val = (node as any)[f];
        if (val instanceof Identifier) {
          if (val.name && SYNTH.test(val.name)) {
            found = true;
          }
          considerId(val, node);
        } else if (Array.isArray(val)) {
          for (const el of val) {
            if (el instanceof Identifier) {
              if (el.name && SYNTH.test(el.name)) {
                found = true;
              }
              considerId(el, node);
            }
          }
        }
      }
      for (const f of NAME_STRING_FIELDS) {
        const v = (node as any)[f];
        if (typeof v === "string" && SYNTH.test(v)) {
          found = true;
          considerName(v);
          matchedStrings.push({ node, field: f });
        }
      }
      if (node instanceof FlowBase && node._subFlowsByName.size > 0) {
        // Only flows that actually contain a synthetic can need re-keying,
        // and a skipped subtree contains none by construction.
        flowsToRekey.push(node);
      }
      const content = node.content;
      if (content) {
        for (const c of content) {
          if (collect(c)) {
            found = true;
          }
        }
      }
      if (!found) {
        this._synthFreeSubtrees.set(node, node.content?.length ?? 0);
      }
      return found;
    };
    collect(root);
    if (!changed) {
      return undefined;
    }

    // Rewrite phase: only the recorded matches, then re-key each FlowBase's
    // `_subFlowsByName` index (built from the pre-rename identifiers at
    // lowering time) after all names are final. Every node whose name
    // actually CHANGED marks its enclosing top-level flow — the caller uses
    // that to demote reused flows and lapse stale serialized-JSON entries.
    const renamedTopLevelFlows = new Set<ParsedObject>();
    const markRenamed = (owner: ParsedObject) => {
      let n: ParsedObject | null = owner;
      while (n && n.parent && !(n.parent instanceof Story)) {
        n = n.parent;
      }
      if (n && n.parent instanceof Story) {
        renamedTopLevelFlows.add(n);
      }
    };
    for (const { id, owner } of matchedIds) {
      const next = id.name ? remap.get(id.name) : undefined;
      if (next) {
        if (next !== id.name) {
          markRenamed(owner);
        }
        id.name = next;
      }
    }
    for (const { node, field } of matchedStrings) {
      const v = node[field];
      const next = typeof v === "string" ? remap.get(v) : undefined;
      if (next) {
        if (next !== v) {
          markRenamed(node);
        }
        node[field] = next;
      }
    }
    for (const flow of flowsToRekey) {
      const next = new Map<string, FlowBase>();
      for (const [, sub] of flow._subFlowsByName) {
        const nm = sub.identifier?.name;
        if (nm) {
          next.set(nm, sub);
        }
      }
      flow._subFlowsByName = next;
    }
    return renamedTopLevelFlows;
  }

  populateLocations(
    program: SparkProgram,
    obj: InkObject,
    // Path string computed by the caller's single top-down traversal
    // (`populateAllLocations`). Equivalent to `obj.path.toString()` but
    // avoids the per-object `Object.path` getter, whose
    // `container.content.indexOf(child)` makes computing every child's path
    // O(n²) in a container's size. Falls back to the getter when omitted.
    precomputedPath?: string,
    // Resolved debug metadata (the object's own, or the nearest ancestor's),
    // threaded down by `populateAllLocations` so leaves without their own
    // metadata don't re-walk the parent chain via the `debugMetadata` getter.
    // Only consulted when `precomputedPath` is provided (DFS caller).
    precomputedMetadata?: DebugMetadata | null,
  ) {
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
    const sink = this._assetSink;
    if (sink) {
      this.captureAssetLeaf(
        obj,
        precomputedPath ?? obj.path.toString(),
        sink,
      );
    }
    const metadata =
      precomputedPath !== undefined
        ? (precomputedMetadata ?? null)
        : (obj?.ownDebugMetadata ?? obj?.debugMetadata);
    if (metadata) {
      const uri = metadata.filePath ?? program.uri;
      const scriptIndex =
        this._scriptIndices?.get(uri || "") ??
        Object.keys(program.scripts).indexOf(uri || "");
      let startLine = metadata.startLineNumber - 1;
      let startColumn = metadata.startCharacterNumber - 1;
      let endLine = metadata.endLineNumber - 1;
      let endColumn = metadata.endCharacterNumber - 1;
      let varAss = asOrNull(obj, VariableAssignment);
      if (varAss) {
        if (varAss.variableName && !varAss.isNewDeclaration) {
          if (varAss.isGlobal) {
            program.dataLocations ??= {};
            // Explicit first-write check (was `??=`) so we capture into the
            // flow cache ONLY the entry this call actually committed.
            if (!(varAss.variableName in program.dataLocations)) {
              const tuple: [number, number, number, number, number] = [
                scriptIndex,
                startLine,
                startColumn,
                endLine,
                endColumn,
              ];
              program.dataLocations[varAss.variableName] = tuple;
              this._locCaptureTarget?.dataEntries.push({
                key: varAss.variableName,
                tuple,
              });
            }
          } else {
            const containerPath = (precomputedPath ?? varAss.path.toString())
              .split(".")
              .filter(
                (p) =>
                  Number.isNaN(Number(p)) &&
                  !p.includes("-") &&
                  !p.includes("$"),
              )
              .join(".");
            program.dataLocations ??= {};
            const dataKey = containerPath + "." + varAss.variableName;
            if (!(dataKey in program.dataLocations)) {
              const tuple: [number, number, number, number, number] = [
                scriptIndex,
                startLine,
                startColumn,
                endLine,
                endColumn,
              ];
              program.dataLocations[dataKey] = tuple;
              this._locCaptureTarget?.dataEntries.push({ key: dataKey, tuple });
            }
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
        let path = precomputedPath ?? obj.path.toString();
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
          if (!(path in program.pathLocations)) {
            const tuple: [number, number, number, number, number] = [
              scriptIndex,
              startLine,
              startColumn,
              endLine,
              endColumn,
            ];
            program.pathLocations[path] = tuple;
            this._locCaptureTarget?.pathEntries.push({ path, tuple });
            // Record creation order, bucketed by (scriptIndex, startLine), for
            // the linear-time `sortPathLocations`. Only the first write per
            // path creates an entry (matching the previous `??=`), so a path is
            // bucketed exactly once with its final coordinates.
            const order = this._pathLocationOrder;
            if (order) {
              let byLine = order.get(scriptIndex);
              if (!byLine) {
                byLine = new Map();
                order.set(scriptIndex, byLine);
              }
              let bucket = byLine.get(startLine);
              if (!bucket) {
                bucket = [];
                byLine.set(startLine, bucket);
              }
              bucket.push([path, startColumn]);
            }
          }
        }
      }
    }
    return false;
  }

  // Walk the runtime container tree once, computing each leaf object's path
  // string incrementally (parent path + name-or-index component) and feeding
  // it to `populateLocations`. This replaces the previous approach of running
  // `populateLocations` as the `onWriteRuntimeObject` callback during
  // `ToJson`, which recomputed `obj.path` per object via the `Object.path`
  // getter — whose `container.content.indexOf(child)` is O(n) per level,
  // making path computation across a container O(n²) in its size.
  //
  // The traversal mirrors `JsonSerialisation.WriteRuntimeContainer` exactly:
  // it visits `content` (indexed children) in order, then `namedOnlyContent`
  // (named-only children); the callback only ever fired for NON-container
  // objects, so containers themselves are recursed into but not recorded.
  // Path components match `Object.path`: a child with a valid name uses its
  // name, otherwise its index within `content`. Paths are relative to
  // `mainContentContainer`, which is the serialized root and the path root.
  // Whole-document scene/`end` + branch pairing validation. Walks the file's
  // root-level Scene/Branch nodes and runs the same forward/backward `end`
  // pairing checks the lowerer used to do per-chunk — but freshly, over the full
  // tree, every compile. Because it never relies on a stale per-chunk result, an
  // edit that breaks only the matching `end` keyword now correctly re-emits the
  // "missing `end`" diagnostic incrementally. Source positions are absolute (the
  // doc-level ctx returns document line/column directly), matching what the
  // previous chunk-relative + lineNumberOffset path produced.
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
    const ctx = {
      filePath: uri,
      read: (from: number, to: number) => doc.read(from, to),
      lineNumber: (pos: number) => doc.positionAt(pos).line,
      characterNumber: (pos: number) => doc.positionAt(pos).character,
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
  }

  // Decide which top-level flows the incremental ToJson cache may reuse this
  // compile. A flow is a reuse CANDIDATE when its source content is unchanged —
  // no changed chunk overlaps its source span (same span/changed-chunk logic the
  // location cache uses). The caller additionally requires the flow's cross-flow
  // fingerprint to match before actually reusing.
  //
  // `ok` is the GLOBAL guard: only `const` values get INLINED into flow bytecode
  // (vars/stores are referenced by name; defines/lists go to structDefs/listDefs,
  // which ToJson always re-serializes), and consts are top-level declarations
  // that sit before the first named flow. So if any changed chunk lies before the
  // first flow's span, a referenced const may have changed and every flow must be
  // re-serialized; otherwise per-flow content+fingerprint reuse is sound.
  /**
   * Bound the append-only binary string table.
   *
   * Every edited flow interns strings for its changed lines, and those are
   * dead the moment the next keystroke lands — measured at ~1 per keystroke on
   * raffles-and-bunny. The table is not merely a compiler-side cache: it ships
   * inside `program.compiledBuffer`, so unchecked growth costs payload size and
   * per-hop clone time as well as memory.
   *
   * Reseeding is cheap in the amortized sense but not free: every cached chunk
   * was minted against the old numbering, so the next compile re-serializes
   * every flow. With the thresholds below that happens once per few thousand
   * edits, which is why it is a ratio and not a fixed cap — a large project
   * legitimately holds more live strings than a small one.
   */
  protected maybeReseedBinaryTable(): void {
    const size = this._binaryTable.strings.length;
    if (this._binaryTableBaseline === 0) {
      // First compile after a (re)seed: whatever is interned now is live.
      this._binaryTableBaseline = size;
      return;
    }
    const grown = size - this._binaryTableBaseline;
    if (
      size > this._binaryTableBaseline * BINARY_TABLE_RESEED_RATIO &&
      grown > BINARY_TABLE_RESEED_MIN_SLACK
    ) {
      reseedProgramTable(this._binaryTable);
      // Not strictly required — `generation` already makes stale chunks
      // unusable — but holding them would pin memory for nothing.
      this._flowChunkCache = undefined;
      this._binaryTableBaseline = 0;
    }
  }

  protected computeFlowReuse(story: RuntimeStory): {
    reusable: Set<string>;
    ok: boolean;
  } {
    const reusable = new Set<string>();
    const root = story.mainContentContainer;
    const named = root?.namedOnlyContent;
    const changed = this._changedChunkRanges ?? [];
    if (!named) {
      return { reusable, ok: true };
    }
    const flows: Array<{ name: string; start0: number }> = [];
    for (const [name, value] of named) {
      if (name === "global decl") {
        continue;
      }
      const c = asOrNull(value, Container);
      const md = c?.ownDebugMetadata;
      flows.push({ name, start0: md ? md.startLineNumber - 1 : -1 });
    }
    const starts = flows
      .map((f) => f.start0)
      .filter((s) => s >= 0)
      .sort((a, b) => a - b);
    const firstStart = starts.length ? starts[0]! : Number.POSITIVE_INFINITY;
    let ok = true;
    for (let i = 0; i < changed.length; i++) {
      if (changed[i]![0] < firstStart) {
        ok = false;
        break;
      }
    }
    if (ok) {
      const spanEndOf = (start0: number): number => {
        for (const s of starts) {
          if (s > start0) {
            return s;
          }
        }
        return Number.POSITIVE_INFINITY;
      };
      for (const f of flows) {
        if (f.start0 < 0) {
          continue;
        }
        const end0 = spanEndOf(f.start0);
        const guardStart = f.start0 - 1;
        let overlap = false;
        for (let i = 0; i < changed.length; i++) {
          const cs = changed[i]![0];
          const ce = changed[i]![1];
          if (ce >= guardStart && cs < end0) {
            overlap = true;
            break;
          }
        }
        if (!overlap) {
          reusable.add(f.name);
        }
      }
    }
    return { reusable, ok };
  }

  populateAllLocations(program: SparkProgram, story: RuntimeStory) {
    const root = story.mainContentContainer;
    if (!root) {
      return;
    }
    // Fresh creation-order index for this compile; consumed by
    // `sortPathLocations` to avoid a comparison sort over every entry.
    this._pathLocationOrder = new Map();
    // Root inline content is the pseudo-flow "0"; it is never cached, so it is
    // captured afresh every compile.
    const rootAssets = createSceneAssetCapture();
    this._flowAssetAccum = new Map([["0", rootAssets]]);
    this._assetSink = rootAssets;

    // Generic recursive walk (unchanged behavior) — used for the root's inline
    // content and for recomputing non-reusable top-level flow subtrees.
    const walk = (
      container: Container,
      parentPath: string,
      inherited: DebugMetadata | null,
    ) => {
      // Metadata inherited by this container's children: the container's own
      // stamped metadata, else whatever it inherited. Mirrors the recursive
      // `debugMetadata` getter (own ?? parent.debugMetadata) but resolved once
      // per container instead of re-walked per descendant.
      const containerMeta = container.ownDebugMetadata ?? inherited;
      const content = container.content;
      for (let i = 0; i < content.length; i++) {
        const child = content[i];
        const named = asINamedContentOrNull(child);
        const comp = named != null && named.hasValidName ? named.name! : i;
        const childPath = parentPath ? `${parentPath}.${comp}` : `${comp}`;
        const childContainer = asOrNull(child, Container);
        if (childContainer) {
          walk(childContainer, childPath, containerMeta);
        } else {
          this.populateLocations(
            program,
            child!,
            childPath,
            child!.ownDebugMetadata ?? containerMeta,
          );
        }
      }
      const namedOnly = container.namedOnlyContent;
      if (namedOnly) {
        for (const [key, value] of namedOnly) {
          const childPath = parentPath ? `${parentPath}.${key}` : key;
          const childContainer = asOrNull(value, Container);
          if (childContainer) {
            walk(childContainer, childPath, containerMeta);
          } else {
            this.populateLocations(
              program,
              value,
              childPath,
              value.ownDebugMetadata ?? containerMeta,
            );
          }
        }
      }
    };

    // --- Incremental location cache (Design A) ---------------------------
    // Reuse cached per-flow entries (line-shifted) for top-level flows whose
    // source is unchanged this compile, skipping the per-leaf populateLocations
    // body for their subtrees. ExportRuntime + ToJson are untouched, so
    // program.compiled stays byte-identical; only the *Locations maps are
    // affected and the union is always re-sorted by `sortPathLocations`.
    const scriptsKey = Object.keys(program.scripts).join(" ");
    if (this._locCacheScriptsKey !== scriptsKey) {
      this._locCache = undefined;
      this._locCacheScriptsKey = scriptsKey;
    }
    const prevCache = this._locCache;
    const changed = this._changedChunkRanges ?? [];
    const nextCache: NonNullable<typeof this._locCache> = new Map();

    const rootMeta = root.ownDebugMetadata ?? null;

    // 1) Root inline content (index-addressed positional prefix) — always
    //    recomputed (small; never cached).
    const rootContent = root.content;
    for (let i = 0; i < rootContent.length; i++) {
      const child = rootContent[i];
      const named = asINamedContentOrNull(child);
      const comp = named != null && named.hasValidName ? named.name! : i;
      const childPath = `${comp}`;
      const childContainer = asOrNull(child, Container);
      if (childContainer) {
        walk(childContainer, childPath, rootMeta);
      } else {
        this.populateLocations(
          program,
          child!,
          childPath,
          child!.ownDebugMetadata ?? rootMeta,
        );
      }
    }

    // 2) Top-level named flows — reuse-with-delta or recompute-and-capture.
    this._assetSink = null;
    const named = root.namedOnlyContent;
    if (named) {
      const flows: Array<{
        name: string;
        container: Container | null;
        value: InkObject;
        start0: number;
      }> = [];
      for (const [name, value] of named) {
        const container = asOrNull(value, Container);
        const md = container?.ownDebugMetadata;
        flows.push({
          name,
          container,
          value,
          start0: md ? md.startLineNumber - 1 : -1,
        });
      }
      // Sorted start lines → each flow's span end is the next flow's start.
      const starts = flows
        .map((f) => f.start0)
        .filter((s) => s >= 0)
        .sort((a, b) => a - b);
      const spanEndOf = (start0: number): number => {
        for (const s of starts) {
          if (s > start0) {
            return s;
          }
        }
        return Number.POSITIVE_INFINITY;
      };
      // Reuse is only sound while the set of top-level flows is STABLE. A
      // structural edit (a scene/knot header made/unmade, renamed, added or
      // removed) can reflow content across flow boundaries and shift the
      // document-global ownership of GLOBAL dataLocations (a `& global = …`
      // entry is keyed by bare name and owned by the FIRST writer across all
      // flows — not flow-local). The per-flow cache freezes that ownership, so
      // when the flow set changes, fall back to a full recompute this compile.
      // `_locCache` keys ARE the previous compile's named-flow set (every
      // non-`global decl` flow is stored), so this is a free comparison.
      let effPrevCache = prevCache;
      if (prevCache) {
        const curNames = flows.filter((f) => f.name !== "global decl");
        let sameSet = curNames.length === prevCache.size;
        if (sameSet) {
          for (const f of curNames) {
            if (!prevCache.has(f.name)) {
              sameSet = false;
              break;
            }
          }
        }
        if (!sameSet) {
          effPrevCache = undefined;
        }
      }
      // A flow's cached locations are keyed by INDEX-addressed runtime paths,
      // and an unchanged flow's subtree can still change SHAPE when something
      // before it changes: a constant is inlined at generation, and how many
      // runtime objects it expands to is type-dependent (a string emits
      // BeginString/StringValue/EndString, a number emits one value). So
      // retyping or removing a constant shifts sibling indices inside flows
      // whose own source shows no changed chunk, and replaying their cached
      // keys would map real paths to wrong lines. Apply the same global guard
      // `computeFlowReuse` uses for the bytecode cache: if any changed chunk
      // starts before the first flow, reuse nothing this compile.
      if (effPrevCache && this._changedChunkRanges?.length) {
        const firstStart = starts.length
          ? starts[0]!
          : Number.POSITIVE_INFINITY;
        for (const [changedStart] of this._changedChunkRanges) {
          if (changedStart < firstStart) {
            effPrevCache = undefined;
            break;
          }
        }
      }
      for (const f of flows) {
        // `global decl`'s source is non-contiguous (scattered declarations), so
        // it never gets a span — always recompute it (it emits no pathLocations
        // since its paths start with "global ", only a few dataLocations).
        // Synthetic flows (`__synth_<n>`) are captured (so the flow-set guard
        // above still sees them) but never REUSED by name: their names are
        // positional ordinals that can rebind to a different flow across
        // compiles (see the ToJson flow-memo exclusion in `compile()`).
        const reusable =
          f.container != null &&
          f.start0 >= 0 &&
          f.name !== "global decl" &&
          !CANONICAL_SYNTH_NAME.test(f.name) &&
          effPrevCache != null;
        if (reusable) {
          const cached = effPrevCache!.get(f.name);
          if (cached) {
            const end0 = spanEndOf(f.start0);
            const guardStart = f.start0 - 1;
            let overlap = false;
            for (let i = 0; i < changed.length; i++) {
              const cs = changed[i]![0];
              const ce = changed[i]![1];
              if (ce >= guardStart && cs < end0) {
                overlap = true;
                break;
              }
            }
            if (!overlap) {
              this.spliceCachedFlowLocations(
                program,
                f.name,
                cached,
                f.start0 - cached.startLine0,
                nextCache,
              );
              continue;
            }
          }
        }
        // Recompute (and capture, unless it's the uncacheable global decl).
        if (f.container) {
          const capture =
            f.name === "global decl"
              ? null
              : {
                  pathEntries: [],
                  dataEntries: [],
                  assets: createSceneAssetCapture(),
                };
          const prevTarget = this._locCaptureTarget;
          this._locCaptureTarget = capture;
          this._assetSink = capture?.assets ?? null;
          walk(f.container, f.name, rootMeta);
          this._assetSink = null;
          this._locCaptureTarget = prevTarget;
          if (capture) {
            nextCache.set(f.name, { startLine0: f.start0, ...capture });
            this._flowAssetAccum?.set(f.name, capture.assets);
          }
        } else {
          this.populateLocations(
            program,
            f.value,
            f.name,
            f.value.ownDebugMetadata ?? rootMeta,
          );
        }
      }
    }

    this._locCache = nextCache;
  }

  // Splice a flow's cached location entries back into `program`, shifting every
  // line by `delta` (the flow moved by that many source lines but its content
  // is unchanged). Reproduces the first-write-wins commit + `_pathLocationOrder`
  // bucketing that `populateLocations` does, and records the shifted entries
  // into `nextCache` so the next compile's delta is relative to this one.
  protected spliceCachedFlowLocations(
    program: SparkProgram,
    name: string,
    cached: FlowLocCacheEntry,
    delta: number,
    nextCache: Map<string, FlowLocCacheEntry>,
  ) {
    const pathEntries: typeof cached.pathEntries = [];
    const dataEntries: typeof cached.dataEntries = [];
    // Create the maps lazily only when this flow actually contributes entries —
    // the cold path (populateLocations) creates them on first write, so a flow
    // with zero entries must not materialize an empty {} (which would diverge
    // from a cold compile of a file that has no path/data locations at all).
    if (cached.pathEntries.length > 0) program.pathLocations ??= {};
    const order = this._pathLocationOrder;
    for (const pe of cached.pathEntries) {
      const t = pe.tuple;
      const nt: [number, number, number, number, number] = [
        t[0],
        t[1] + delta,
        t[2],
        t[3] + delta,
        t[4],
      ];
      if (!(pe.path in program.pathLocations!)) {
        program.pathLocations![pe.path] = nt;
        if (order) {
          let byLine = order.get(nt[0]);
          if (!byLine) {
            byLine = new Map();
            order.set(nt[0], byLine);
          }
          let bucket = byLine.get(nt[1]);
          if (!bucket) {
            bucket = [];
            byLine.set(nt[1], bucket);
          }
          bucket.push([pe.path, nt[2]]);
        }
      }
      pathEntries.push({ path: pe.path, tuple: nt });
    }
    if (cached.dataEntries.length > 0) program.dataLocations ??= {};
    for (const de of cached.dataEntries) {
      const t = de.tuple;
      const nt: [number, number, number, number, number] = [
        t[0],
        t[1] + delta,
        t[2],
        t[3] + delta,
        t[4],
      ];
      if (!(de.key in program.dataLocations!)) {
        program.dataLocations![de.key] = nt;
      }
      dataEntries.push({ key: de.key, tuple: nt });
    }
    nextCache.set(name, {
      startLine0: cached.startLine0 + delta,
      pathEntries,
      dataEntries,
      assets: cached.assets,
    });
    // Same object as last compile: a consumer holding it sees the same
    // identity, which is what proves the flow was reused rather than rebuilt.
    this._flowAssetAccum?.set(name, cached.assets);
  }

  // Record what one runtime leaf references for `program.sceneAssets`: the
  // asset directives in a text leaf, or the flow a divert leaves for. Runs
  // inside the same top-down walk that fills `pathLocations`, so a reused flow
  // costs nothing and a recomputed flow pays one substring check per leaf.
  protected captureAssetLeaf(
    obj: InkObject,
    path: string,
    sink: SceneAssetCapture,
  ) {
    if (obj instanceof StringValue) {
      if (!obj.isNewline) {
        const value = obj.value;
        if (
          typeof value === "string" &&
          (value.includes("[[") || value.includes("(("))
        ) {
          scanAssetDirectives(value, path, sink);
        }
      }
      return;
    }
    if (obj instanceof RuntimeDivert) {
      const isCall =
        obj.pushesToStack && obj.stackPushType === PushPopType.Function;
      if (obj.hasVariableTarget) {
        const variable = obj.variableDivertName ?? "";
        if (variable.startsWith("$")) {
          // Ink's own temporaries (`$r`, the return from a choice's start
          // content) never leave the flow.
          return;
        }
        if (isCall && variable) {
          // A Luau function call diverts through the variable that holds
          // the function, named after the function itself, so the callee is
          // known statically after all.
          sink.edges.push({ target: variable, call: true });
          return;
        }
        // `-> {target}`: only the running story knows where this goes.
        sink.dynamic = true;
        return;
      }
      if (obj.isExternal) {
        return;
      }
      // The raw path, not the `targetPath` getter: the getter resolves a
      // relative path by walking the tree, and a relative target never leaves
      // the flow anyway (gathers and choices are addressed relative to it).
      const target = obj._targetPath;
      if (!target || target.isRelative) {
        return;
      }
      const head = target.head;
      if (!head || head.isParent) {
        return;
      }
      const flow = head.isIndex ? "0" : head.name;
      if (!flow) {
        return;
      }
      sink.edges.push({ target: flow, call: isCall });
    }
  }

  // Turn this compile's per-flow captures into `program.sceneAssets`: unions
  // in first-use order, divert edges classified into calls (function flows,
  // which return to the caller) and successors (everything else), and each
  // flow's sets widened by the flows it calls. Runs after
  // `populateDeclarationLocations`, which supplies `functionLocations`.
  populateSceneAssets(program: SparkProgram) {
    const accum = this._flowAssetAccum;
    if (!accum) {
      return;
    }
    const functionNames = new Set(
      Object.keys(program.functionLocations ?? {}),
    );
    // Synthetic and binding-evaluator flows are reached like functions and
    // return like them; they are never a scene the story "enters".
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
      // Widen by callees, transitively, each flow at most once.
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
        // A copy: the capture is carried across compiles by reference, so a
        // consumer that sorts or appends must not reach the cache through it.
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

  sortPathLocations(program: SparkProgram) {
    const uri = program.uri;
    profile("start", this._profilerId, "sortPathLocations", uri);
    const order = this._pathLocationOrder;
    if (program.pathLocations && order) {
      // Linear bucket merge: entries were bucketed by (scriptIndex, startLine)
      // in DFS/creation order as they were added. Emit scriptIndices then lines
      // in ascending numeric order; within each line, a stable sort on
      // startColumn (only when a line holds 2+ entries) reproduces the
      // (scriptIndex, startLine, startColumn) ordering — and the DFS-insertion
      // bucket order matches the prior comparison sort's stable tie-break.
      const entries = program.pathLocations;
      const sorted: typeof entries = {};
      const scriptIndices = [...order.keys()].sort((a, b) => a - b);
      for (const scriptIndex of scriptIndices) {
        const byLine = order.get(scriptIndex)!;
        const lines = [...byLine.keys()].sort((a, b) => a - b);
        for (const line of lines) {
          const bucket = byLine.get(line)!;
          if (bucket.length > 1) {
            bucket.sort((a, b) => a[1] - b[1]);
          }
          for (let i = 0; i < bucket.length; i++) {
            const path = bucket[i]![0];
            sorted[path] = entries[path]!;
          }
        }
      }
      program.pathLocations = sorted;
    } else if (program.pathLocations) {
      // Fallback (no creation-order index, e.g. if locations weren't gathered
      // via `populateAllLocations`): comparison sort. Index into the
      // [scriptIndex, startLine, startColumn, ...] tuples directly rather than
      // array-destructuring inside the comparator — destructuring allocates an
      // iterator per comparison, hot across tens of thousands of entries.
      const sortedEntries = Object.entries(program.pathLocations).sort(
        (a, b) => {
          const av = a[1];
          const bv = b[1];
          return av[0] - bv[0] || av[1] - bv[1] || av[2] - bv[2];
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
            "" | "function" | "scene" | "branch" | "knot" | "stitch" | "label";
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

  /** Mirror the fully-assembled engine-facing context types into dedicated
   *  channels (`program.layouts` / `screens` / `components` / `styles` / `assets`) the Game
   *  runtime reads — so the engine can source them WITHOUT touching the LSP-only
   *  `program.context`. Runs after `buildContext` (and the prelude merge), so it
   *  captures builtin + authored entries with `$extends`/`$default` already
   *  applied. Deep-cloned so later context mutation can't leak into the channel.
   *  (Define-typed context — animation/character/config/… — comes from the
   *  runtime instead; see `buildContextFromStory`.) */
  populateEngineChannels(program: SparkProgram) {
    const uri = program.uri;
    profile("start", this._profilerId, "populateEngineChannels", uri);
    const layout = program.context?.["layout"];
    const screen = program.context?.["screen"];
    const component = program.context?.["component"];
    const style = program.context?.["style"];
    if (layout) {
      program.layouts = structuredClone(layout);
    }
    if (screen) {
      program.screens = structuredClone(screen);
    }
    if (component) {
      program.components = structuredClone(component);
    }
    if (style) {
      program.styles = structuredClone(style);
    }
    // File-derived + implicit-def asset types (not defines).
    const ASSET_TYPES = ["image", "audio", "font", "video", "filtered_image"];
    for (const type of ASSET_TYPES) {
      const structs = program.context?.[type];
      if (structs) {
        program.assets ??= {};
        program.assets[type] = structuredClone(structs);
      }
    }
    // Define-typed context entries (animation/character/ease/config/…) are NOT
    // emitted as a static channel: the Game sources them from the live runtime
    // `__def` tables (buildDefinesContext) so authored→builtin inheritance is
    // resolved by the VM __index chain. Only the structural/asset channels above
    // remain. (The retired `program.defines` channel was a lossy compile-time
    // snapshot; runtime-sourcing proved byte-identical and supersedes it.)
    profile("end", this._profilerId, "populateEngineChannels", uri);
  }

  /** Let a project define REPLACE a same-named builtin (`define slate_80 as
   *  color`, `define ui as config`) instead of colliding with it.
   *
   *  The builtins prelude is source-injected FIRST, and
   *  `FlowBase.AddNewVariableDeclaration` is first-writer-wins, so every such
   *  override used to fail the compile with "Duplicate identifier" — the
   *  opposite of the intent recorded at the injection site. Two things are
   *  needed to undo that safely, and both live here because this is the first
   *  point where the prelude's declarations, the user's, and the prelude's
   *  compiled values are all in scope (and it still runs before ExportRuntime,
   *  where the collision is detected):
   *
   *  1. BACK-FILL. A partial override (`define ui as config with
   *     root_text_size = "112.5%"`) restates one property, but the authored
   *     `__def` table is what reaches the runtime — so every builtin sibling the
   *     author didn't mention (`breakpoints`, `layouts_element_name`, …) would
   *     vanish, and e.g. `reveal()` would fail to find the screen root, giving a
   *     black preview with no error. Copy the prelude's values for keys the
   *     author did NOT restate into the authored table.
   *  2. MARK. Tag the prelude's declarations so the collision handler can tell
   *     an override (allowed, authored wins) from two colliding authored
   *     defines (still an error). `debugMetadata` can't distinguish them.
   *
   *  Idempotent, like {@link scopeDefineInstances}: back-fill only adds keys the
   *  table lacks, so re-running on cached parse nodes across incremental
   *  compiles is a no-op. Must run AFTER the scoping passes, which is what makes
   *  the identifier a stable, comparable key on both sides. */
  protected applyBuiltinOverrides(
    userVAs: ReadonlySet<ParsedObject>,
    preludeVAs: ReadonlySet<ParsedObject>,
  ): void {
    if (preludeVAs.size === 0 || userVAs.size === 0) {
      return;
    }
    // The prelude's declarations, keyed by their STABLE BARE name — never the
    // post-scoping identifier. The two passes of `scopeDefineInstances`
    // classify independently (the prelude by its own type-name census, the
    // user files by theirs), so the same bare name can come out as different
    // global keys on the two sides: the prelude's channel-typed `typewriter`
    // keeps the bare key (`typewriter` is a prelude type name) while a user's
    // `define typewriter as channel` scopes to `$channel_typewriter`. An
    // identifier-keyed gate missed exactly those overrides, and the back-fill
    // silently never ran — a partial override lost every builtin field the
    // author didn't restate. The VALUE lookup inside
    // `backfillBuiltinDefaults` is already (type, name)-keyed against the
    // prelude context, so a bare-name gate can't over-apply: a user define
    // that merely shares a name with an unrelated builtin misses that lookup
    // and no-ops.
    const preludeNames = new Set<string>();
    for (const obj of preludeVAs) {
      if (obj instanceof ParsedVariableAssignment) {
        obj.isPreludeDeclaration = true;
        const bare =
          obj.structDefinition?.name?.name ?? obj.identifier?.name;
        if (bare) {
          preludeNames.add(bare);
        }
      }
    }
    let preludeContext: Record<string, any> | undefined;
    for (const obj of userVAs) {
      if (!(obj instanceof ParsedVariableAssignment)) {
        continue;
      }
      const bare = obj.structDefinition?.name?.name ?? obj.identifier?.name;
      if (!bare || !preludeNames.has(bare)) {
        continue;
      }
      // Resolved lazily so a program with no overrides never touches the cache.
      preludeContext ??= getCompiledPrelude().context;
      this.backfillBuiltinDefaults(obj, preludeContext);
    }
  }

  /** Copy the prelude's values for every property an overriding define did NOT
   *  restate into that define's `__def` table, so a partial override keeps the
   *  builtin's other fields. Mirrors {@link inheritDefaults}, which does the
   *  same for the compile-time `program.context` view — the runtime table is a
   *  separate channel (the engine reads it, not `program.context`), so it needs
   *  its own merge or the two views disagree. */
  protected backfillBuiltinDefaults(
    va: ParsedVariableAssignment,
    preludeContext: Record<string, any>,
  ): void {
    const type = va.structDefinition?.type?.name;
    const name = va.structDefinition?.name?.name;
    if (!type || !name) {
      return;
    }
    const builtinStruct = preludeContext?.[type]?.[name];
    if (!builtinStruct || typeof builtinStruct !== "object") {
      return;
    }
    // `va.expression` is the `__def({ props }, name, parent)` call the define
    // lowerers emit; its first argument is the property table.
    const call = va.expression;
    if (!(call instanceof FunctionCall)) {
      return;
    }
    const table = call.args?.[0];
    if (!(table instanceof ObjectExpression)) {
      return;
    }
    const authored = new Set<string>();
    for (const entry of table.entries) {
      if (typeof entry.key === "string") {
        authored.add(entry.key);
      }
    }
    for (const [k, v] of Object.entries(builtinStruct)) {
      // `$type` / `$name` are context bookkeeping, re-derived by `__def` from
      // its own args; `__storeProps` and friends are the define's own hidden
      // modifier lists and must not be inherited from the builtin.
      if (k.startsWith("$") || k.startsWith("__")) {
        continue;
      }
      if (authored.has(k) || v === undefined) {
        continue;
      }
      table.addEntry(new ObjectExpressionEntry(k, contextValueToExpression(v)));
    }
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

  /** Merge the once-compiled builtins prelude's reactive Sparkle AST into
   *  `program.sparkle` as the base layer, mirroring {@link mergePreludeContext}.
   *  Runs before this file's own chunks populate `program.sparkle`, so an
   *  authored `layout main` overrides the builtin `main` in place (Object.assign
   *  on the same key keeps the builtin's earlier insertion order: loading, main,
   *  …). Trees are deep-cloned so the shared cache can't be mutated by later
   *  per-program work. Keeps the reactive AST channel a faithful superset of the
   *  static `context.layout`/`context.component` channels (it must carry the
   *  builtin `loading`/`main` layouts the reactive runtime renders). */
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
      // Track the first file to claim each (type, name) so we can flag basename
      // collisions among non-script assets. Asset names are a FLAT namespace —
      // scripts reference an asset by its bare name (`[[show image forest]]` ->
      // context.image.forest) — so two assets sharing a (type, name) in
      // different folders are ambiguous and one would silently win. Scripts are
      // exempt: they're keyed/bundled by full path, not by a flat basename.
      const claimedBy = new Map<string, string>();
      const flaggedCollision = new Set<string>();
      for (const file of files) {
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
        if (this._config.stripImageData) {
          // #299: hosts that resolve filtered images through the on-demand
          // `?filters=` service-worker route don't need the inlined SVG
          // source, which dominated the program payload. Only the context
          // COPY is stripped — the file registry keeps the source.
          delete program.context[type][name].data;
        }
      }
    }
    profile("end", this._profilerId, "populateAssets", uri);
  }

  /**
   * Emit a basename-collision warning on `targetUri` (an asset file), pointing
   * at `otherUri` which provides the same flat asset name. Keyed by the asset's
   * own uri so the file manager can flag the offending files.
   */
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
        value: `Asset name collision: \`${name}\` (${type}) is provided by more than one file. Asset names are global, so a script that references \`${name}\` is ambiguous — rename or remove one of the files.`,
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

  populateImplicitDefs(_state: SparkdownCompilerState, program: SparkProgram) {
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
          // Trim the read text AND each `~`-separated part: when an asset
          // command is followed by a clause (e.g. `[[hero~a~b with flip]]`),
          // the `AssetCommandName` node greedily includes the trailing space
          // before the clause, so the last filter would otherwise be `"b "`.
          // That produced a filtered_image keyed `hero~a~b ` (with a space),
          // which never matched the reference's clean `sortFilteredName` key —
          // so the image "could not be found" whenever a `with`/`over`/etc.
          // clause was present.
          const text = doc.read(cur.from, cur.to).trim();
          if (!resolvedImplicits.has(text)) {
            resolvedImplicits.add(text);
            const type = cur.value.type;
            const parts = text.split("~").map((part) => part.trim());
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
    _state: SparkdownCompilerState,
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
      // Clone anything with identity. Handing out the `$default`'s own
      // array/object would alias it across every define that inherits it —
      // one instance mutating a nested field (or a consumer memoizing onto
      // it) would rewrite the type default and every sibling along with it.
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
    // Whole-program set of top-level callables a Sparkle `@event` handler ref
    // can target — mirrors the runtime's story.HasFunction (top-level functions
    // + knots + scenes). Built across ALL scripts so a handler defined in an
    // included file isn't falsely flagged. Stdlib names are intentionally NOT
    // included: they aren't runtime knots, so a bare `@click=print` never fires.
    const handlerCallables = new Set<string>([
      ...Object.keys(program.functionLocations ?? {}),
      ...Object.keys(program.sceneLocations ?? {}),
      ...Object.keys(program.knotLocations ?? {}),
    ]);
    // Per-COMPILE memos. Both of these are pure functions of the reference's
    // `declaration` plus `program`/`config`/`state`, all of which are fixed
    // for the duration of this call — but they were being recomputed once per
    // reference, and a screenplay repeats the same declaration across
    // hundreds of references (every `[[show backdrop X]]` shares one). Scoped
    // to this call deliberately: nothing here survives to the next compile,
    // so there is no staleness surface.
    // A declaration is an object, so it needs a key built from its fields;
    // stringifying it directly would collapse every declaration onto one entry.
    const declarationCacheKey = (declaration: SparkDeclaration | undefined) =>
      declaration
        ? `${declaration.modifier}|${declaration.type}|${declaration.name}|${
            declaration.property ?? ""
          }`
        : "";
    const stringIdentifiersByDeclaration = new Map<string, string[]>();
    const selectorTypesByDeclaration = new Map<string, string[]>();
    // A `[[show/hide/animate <layer> …]]` target names an ELEMENT in the
    // mounted UI tree, which the engine looks up by name with
    // `UIModule.findElements` — it is not a `define`d struct, so selector
    // resolution can never find one. Validate those names against the elements
    // the layouts actually declare instead. Built lazily because a script with
    // no such command never needs it.
    let layerNames: Set<string> | undefined;
    const namesLayoutElement = (selector: SparkSelector | undefined) => {
      if (selector?.displayType !== "layer" || !selector.name) {
        return false;
      }
      // A target may end in `#n` to pick one instance out of several. The
      // engine reads that as an index and matches nothing at all unless it is a
      // non-negative integer, so anything else has to stay a diagnostic.
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
    // Same per-compile scope, for the selector resolution itself. The key
    // covers every field of `SparkSelector` — an incomplete key would resolve
    // one selector to another's struct.
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
    for (const uri of Object.keys(program.scripts)) {
      const doc = this.documents.get(uri);
      if (doc) {
        const annotations = this.documents.annotations(uri);
        const cur = annotations.references.iter();
        while (cur.value) {
          const reference = cur.value.type;
          if (reference.usage === "handler") {
            // A Sparkle `@event=handler` that names a function/knot the runtime
            // can't invoke — warn (it silently never fires). See ReferenceAnnotator.
            const name = reference.symbolIds?.[0];
            if (name && !handlerCallables.has(name)) {
              const message = `Cannot find function \`${name}\` for this handler — define \`function ${name}() … end\`, or use an inline handler \`{ … }\``;
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
            cur.next();
            continue;
          }
          if (reference.symbolIds) {
            for (const symbolId of reference.symbolIds) {
              if (this._config.definitions?.builtins?.[symbolId]) {
                if (
                  reference.declaration === "const" ||
                  reference.declaration === "var" ||
                  reference.declaration === "param"
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
            const possibleStringIdentifiers =
              possibleStringIdentifiersFor(declaration);
            const expectedSelectorTypes = expectedSelectorTypesFor(declaration);
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
            } else if (namesLayoutElement(selector)) {
              // Valid layer: an element declared in the UI tree
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
                      if (!isSchemaSupportedScalarType) {
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

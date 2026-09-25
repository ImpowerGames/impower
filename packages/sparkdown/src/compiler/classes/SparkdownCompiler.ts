/// <reference path="../../sd-raw.d.ts" />
// Side-effect import to stabilize the inkjs engine module load order.
// `engine/Container.ts` ↔ `engine/Value.ts` ↔ `engine/Object.ts` form a
// dependency cycle; if `Object.ts` loads first, `Value.ts` resolves
// `InkObject` as undefined when extending it. Forcing `Container.ts` to be the
// entry point evaluates the cycle in a working order. This used to happen
// implicitly via the (now-removed) `inkjs/compiler/Compiler` import; keep it
// explicit so consumers of SparkdownCompiler don't hit a TDZ crash.
import "../../inkjs/engine/Container";
import type { TextDocumentContentChangeEvent } from "vscode-languageserver-textdocument";
import { resolveImageAttributes } from "../utils/filterImage";
import {
  collectMorphIssues,
  type MorphScript,
} from "../morph/collectMorphDiagnostics";
import { createRasterImageDefinitions, isRasterLayerFile } from "../../attributes/rasterSource";
import { diagnoseRareAttributeOptions, type AttributeVocabulary } from "../../attributes";
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
import { carriedRuntime } from "../../inkjs/compiler/Parser/ParsedHierarchy/CarriedRuntime";
import { activation } from "../../inkjs/engine/StoryActivation";
import { StoryJournal } from "./StoryJournal";
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
import type { ProgramChangeSummary } from "../types/ProgramChangeSummary";
import type {
  FunctionSpan,
  ScriptLocation,
  SparkProgram,
} from "../types/SparkProgram";
import {
  isBindingPath,
  LOCATION_STRIDE,
  narrowPaths,
  pathLocationTableOf,
} from "../utils/pathLocationTable";
import type { SparkSelector } from "../types/SparkSelector";
import { setBuiltinTypeNames } from "../utils/builtinTypeNames";
import { cloneBuiltinStructs } from "../utils/cloneBuiltinStructs";
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
  // compile's lowering, since `configure` reaches here eagerly and
  // `mergePreludeSparkle` reaches here before the parse.
  setBuiltinTypeNames(Object.keys(_cachedPrelude.context));
  return _cachedPrelude;
}

let _preludeGlobalNames: Set<string> | undefined;
/** The bare global names the seeded prelude creates at runtime: the type
 *  roots (`config`, `game`, `color`, `world`, …). An unseeded compile declares
 *  exactly these so references such as `game.loading.percent` resolve
 *  (Story.DeclareBuiltinGlobals).
 *
 *  The names come from the cached prelude's compiled "global decl" container,
 *  the list of globals a seeded story initializes, rather than from the
 *  prelude's `context`. The context also holds names that are never runtime
 *  globals — every layout and style, and each instance's bare name (`main`
 *  is a layout, a style, and a mixer; `red` a color; `title` a typewriter).
 *  Declaring one of those makes an authored scene of the same name
 *  unreachable: `-> main` binds to the declared variable instead of the
 *  scene, and the runtime then fails to find a variable that never existed
 *  (#437). A bare instance name is not a runtime global either: `assets` is
 *  reached as `config.assets`, and a seeded story fails at runtime on a bare
 *  `assets.predict_distance`, so the unseeded compile is right to warn on it.
 *
 *  The initializer also lists each leaf instance under its scoped
 *  `$<type>_<name>` key (`$config_assets`; see `scopeDefineInstances`). Those
 *  are left out: no authored source can spell a `$` name, so no reference
 *  needs them, and declaring them would occupy the very keys an authored
 *  override of the same builtin is scoped to, which either re-keys that
 *  override to `$color_$color_red` or drops it from the registry outright. */
function getPreludeGlobalNames(): Set<string> {
  if (_preludeGlobalNames) {
    return _preludeGlobalNames;
  }
  const names = new Set<string>();
  const compiled = getCompiledPrelude().compiled as
    | { root?: unknown }
    | undefined;
  const root = compiled?.root;
  // A serialized container is an array whose final element carries the named
  // sub-containers; the global initializer is the one named "global decl".
  const terminal = Array.isArray(root) ? root[root.length - 1] : undefined;
  const globalDecl =
    terminal && typeof terminal === "object"
      ? (terminal as Record<string, unknown>)["global decl"]
      : undefined;
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) {
        visit(child);
      }
      return;
    }
    if (node && typeof node === "object") {
      const entry = node as Record<string, unknown>;
      // `{"VAR=": name}` declares a global; `re: true` marks a reassignment
      // of one declared elsewhere, so it adds no name.
      const declared = entry["VAR="];
      if (
        typeof declared === "string" &&
        !declared.startsWith("$") &&
        !entry["re"]
      ) {
        names.add(declared);
      }
      for (const value of Object.values(entry)) {
        if (Array.isArray(value)) {
          visit(value);
        }
      }
    }
  };
  visit(globalDecl);
  _preludeGlobalNames = names;
  return names;
}

/** The parsed objects under `node` that a walk over its subtree visits: its
 *  `content`, and for a call that generated as a builtin, native or stdlib
 *  call, its arguments. Such a call removes its proxy divert, which held the
 *  arguments, from `content` on its first generation, yet the arguments still
 *  generate on every pass and carry cached runtime objects and debug metadata
 *  of their own (a `display()` call's table holds its line's whole text). */
function parsedChildren(node: ParsedObject): ParsedObject[] {
  const content = node.content ?? [];
  if (!(node instanceof FunctionCall) || content.includes(node.proxyDivert)) {
    return content;
  }
  const args = node.args.filter((arg) => !content.includes(arg));
  return args.length > 0 ? [...content, ...args] : content;
}

/** The index of `word` in `text` as a whole identifier (not part of a longer
 *  one), or -1. A literal search rather than a regular expression: `word`
 *  comes from data (the prelude's global names). */
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
const FILE_TYPES = GRAMMAR_DEFINITION.fileTypes;

/**
 * A deep copy of an asset channel that shares each image's attribute
 * vocabulary with the context it was copied from.
 *
 * The channel is a copy so the engine can never change `program.context`
 * through it. A vocabulary is safe to share: nothing changes one after the file
 * registry builds it (a compile that adds diagnostics replaces the object
 * instead), and vocabularies are nearly all of an illustrated project's asset
 * bytes (230KB for one layered portrait). Copying them cost hundreds of
 * milliseconds per compile, and the copy doubled what each compile sends to
 * the player; a shared object crosses the worker boundary once.
 *
 * Shared and cyclic objects are copied once, as `structuredClone` copies them;
 * anything but a plain object or array goes through `structuredClone`.
 */
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
      out[k] = copy((v as Record<string, unknown>)[k], k);
    }
    return out;
  };
  return copy(value) as T;
};

export type SparkdownCompilerEvents = {
  "compiler/didCompile": (
    params: CompiledProgramParams & { story?: RuntimeStory },
  ) => void;
  "compiler/didSelect": (params: SelectedCompilerDocumentParams) => void;
  "compiler/didRemove": (params: RemovedCompilerFileParams) => void;
  /** A preview compile finished. Listeners may fill in `checkpoint` and
   *  `simulationFailure`, which are returned with the program. */
  "compiler/didPreviewCompile": (
    params: PreviewCompileProgramParams & {
      program: SparkProgram;
      story?: RuntimeStory;
    },
  ) => void;
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

// A per-script view of this compile's changed chunks, answering only "did this
// flow's own source change". Whether an UNCHANGED flow can nonetheless have
// changed shape is a separate, position-independent question, answered once per
// compile by `_unchangedFlowShapeAtRisk`.
//
// The bytecode reuse guard (`computeFlowReuse`) and the location/asset reuse
// guard (`populateAllLocations`) each build one from their own flow list — they
// disagree about `global decl`, which one includes and the other skips — so
// they hold separate instances of this, applying the same rule to the same
// `_changedChunkRanges`.
//
// A line number is only meaningful within the script it came from, and a
// project that uses `include` has several scripts whose line numbers overlap
// freely. Every comparison here is therefore answered inside one script's
// coordinates.
type FlowSpanIndex = {
  // True when a changed chunk falls within the flow that starts at `start0` of
  // `uri`. The flow's span runs from its start line to the next flow start in
  // that same script, or to the end of the script if it is the last one.
  touched: (uri: string, start0: number) => boolean;
};

// Distinguishes the context revisions (#654) of two compilers alive at once.
// The counter lives on the global symbol registry rather than in this module,
// so two copies of this module in one process — a bundler resolving the same
// source through two paths — still hand out different ordinals. A consumer
// deciding whether to keep what it derived from a context compares revisions
// for equality, so two producers minting the same one would let it keep a
// context that has nothing to do with the program it was handed.
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

  // The path locations of the compile in progress, keyed by path so the walk
  // can find and widen a range it already recorded. `sortPathLocations` turns
  // it into the program's columnar `pathLocations` table and drops it.
  protected _pathLocationDraft?: Record<string, ScriptLocation>;

  // The function containers of the compile in progress, which
  // `sortPathLocations` puts on the program's `pathLocations` table.
  protected _functionSpans?: FunctionSpan[];

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
  // Chunks that are NEW/changed this compile (identity not in
  // `_prevCompilationIds`), as 0-based [startLine, endLine] source ranges
  // paired with the uri of the script they were read from. The uri is what
  // makes the lines comparable: the recursive parse walks every included
  // script, and two scripts' line numbers overlap.
  protected _changedChunkRanges?: Array<[number, number, string]>;

  // ---- Per-compile change summary (`program.changes`) ---------------------
  // A counter over this instance's compiles, so a client can tell whether the
  // program it is holding is the one this compile's changes are measured
  // against. Document versions cannot answer that: a preview compile stamps a
  // negative one, and two compiles of the same versions are indistinguishable.
  protected _changeSequence = 0;
  // The id stamped on the last program served, which is what the next compile's
  // changes are measured against.
  protected _lastChangeId?: number;
  // Raised during a compile by any signal that means the changed source lines
  // are NOT the whole difference between this program and the last one.
  // Everything that raises it is a hazard listed on
  // `ProgramChangeSummary.confined`.
  protected _changeHazard = false;
  // Per script uri, the earliest 0-based line any content change applied since
  // the last compile touched. Text above it is the same text the last compile
  // read, which is what makes the line mean the same thing in both.
  //
  // Accumulated as the changes arrive rather than derived afterwards: an edit
  // and the chunk it re-lowers are different spans, and only the edit itself
  // bounds what the author can have changed.
  protected _editedFrom = new Map<string, number>();
  // The file-registry epoch the last summary was stamped at. A file added,
  // replaced or removed is a change no line number describes.
  protected _changeFilesEpoch = -1;
  // Per top-level flow, the cross-flow fingerprint it compiled to last
  // compile, whether or not that compile emitted bytecode: its containers'
  // visit-count flags and its diverts' resolved targets. Those are the parts
  // of a flow's bytecode an edit ELSEWHERE can
  // move, and a checkpoint taken before such a move records counts under the
  // old flags and a callstack under the old targets. Kept apart from the
  // serialized-bytecode caches because it has to cover flows those caches skip
  // and flows they were not asked about.
  protected _flowFingerprints?: Map<string, string>;
  // Per top-level flow, which of its containers had to record visits last
  // compile and under which flags, each named by its path within the flow. Kept
  // apart from the fingerprint because it is the one question an EDITED flow
  // can still be asked — its shape is expected to move, its counting is not.
  protected _flowCountingSignatures?: Map<string, string>;

  // ---- Assembled base context cache (#654) -----------------------------
  // The context every compile of one project shares: the prelude's builtin
  // structs, the structs this project's `define`s contribute, the structs
  // derived from its files, and the `$default` merge over all of them. It is
  // rebuilt only when its KEY moves; a compile whose key is unchanged layers
  // its own implicit definitions over it copy-on-write and never writes into
  // the shared tables (`_contextLayerTypes` records which type maps this
  // compile has already copied).
  //
  // The key is the ordered identities of the chunks that feed it plus the
  // file-registry epoch and the config fields that shape it. A chunk feeds it
  // when it contributes `context`, `sparkle` or `defaultDefinitions` — and
  // also when it declares a global, constant, struct, external or list, which
  // is what `scanChunkForReuse` already answers per chunk identity. The second
  // half is what makes the revision sound for the ENGINE's define tables: a
  // define's property value can be computed from a global or constant declared
  // elsewhere, so the compile-time structs alone would not notice that its
  // runtime value moved. A re-lowered-but-unchanged chunk takes a new identity
  // and so costs a rebuild it did not need — a miss, never a stale reuse.
  protected _contextBase?: {
    uri: string;
    ids: object[];
    filesEpoch: number;
    configKey: string;
    context: { [type: string]: { [name: string]: any } };
    // The diagnostics `populateAssets` produced while the base was assembled
    // (asset basename collisions, raster-folder warnings). They belong to the
    // base, so a compile that reuses it has to replay them rather than re-run
    // the pass that reports them.
    diagnostics: { [uri: string]: SparkDiagnostic[] };
    revision: number;
  };
  // Contributions recorded by the chunk walk, applied by `buildContext` in
  // walk order, and the identities that key the assembled result.
  protected _contextContributions?: Array<{ [type: string]: { [name: string]: any } }>;
  protected _contextKeyIds?: object[];
  protected _contextLayerTypes?: Set<string>;
  // `type/name` of every entry this compile's own implicit definitions added
  // over the base, in discovery order — the layer half of the context revision.
  protected _contextLayerAdded?: string[];
  // The serial each distinct layer has been given, so the revision can name it
  // in a few characters instead of spelling out thousands of entries.
  protected _contextLayerSerials?: Map<string, number>;
  protected _contextLayerSerialCounter = 0;
  // Monotonic within this compiler, and prefixed with an ordinal unique to it
  // so that a consumer fed by two different compilers (a worker restarted
  // under a page that kept its Game) can never read one's first revision as
  // the other's.
  protected _contextRevisionCounter = 0;
  protected readonly _contextRevisionToken = `c${nextCompilerOrdinal()}`;
  // How many times the base has been assembled from nothing on this instance.
  // Read by the tests that assert an edit reused it.
  protected _contextBaseBuilds = 0;
  get contextBaseBuilds() {
    return this._contextBaseBuilds;
  }
  // Per context type, the channel last derived from it and the type map it was
  // derived FROM. The copy-on-write layer hands out the base's own type map
  // whenever this compile did not write to that type, so comparing the map by
  // identity answers "is this channel still the right one" exactly, without a
  // revision to keep in step.
  protected _engineChannelCache?: Map<
    string,
    { source: object; value: { [name: string]: any } }
  >;
  // The finished implicit definitions of each `type/name` this compiler has
  // derived, including the `$default` merge, dropped whenever the base they
  // were merged against is reassembled. An attribute directive implies the
  // same struct on every compile, and a project the size of Raffles and Bunny
  // has thousands of them.
  protected _implicitDefCache?: Map<string, any>;
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
  // The `_unchangedFlowShapeAtRisk` counterpart of
  // `_disableFlowReuseNextCompile`, and deliberately narrower: only a compile
  // that THREW arms it. A compile that merely raised an unattributable
  // generation diagnostic arms the construction-reuse switch instead, because
  // that hazard is a diagnostic being silently dropped by a flow whose
  // generation is skipped — neither downstream cache carries diagnostics, and
  // a script holding a `define` raises one on every compile, so treating it as
  // a shape risk would cost those caches their reuse for the whole session.
  protected _riskFlowShapeNextCompile = false;
  // True when something about THIS compile can change the generated shape of a
  // flow whose own source chunks are all unchanged. Both per-flow caches that
  // outlive a compile — the serialized-bytecode memo (`_flowJsonCache` /
  // `_flowChunkCache`, consulted by `computeFlowReuse`) and the location/asset
  // cache (`_locCache`, consulted by `populateAllLocations`) — key a cached
  // entry on "this flow's chunks did not change", so both are only sound while
  // that implication holds. One field serves both, so the two guards cannot
  // reach different verdicts about the same compile.
  //
  // The hazards are the ones catalogued in #306, and each already has a
  // precise, POSITION-INDEPENDENT detector feeding `_flowReuseDisabled`:
  //
  //   - a LIST is inlined by value into every referencing flow, caught by
  //     `scanChunkForReuse`'s `invalidatesGlobals` on a changed chunk. This
  //     one is unreachable from authored Sparkdown, which has no list syntax —
  //     nothing under `compiler/lower/` constructs a `ListDefinition`, so the
  //     detector guards an inkjs-inherited node the lowerer never emits, and
  //     no test can exercise it. It stays because the node type is still live
  //     in the runtime the compiler targets;
  //   - a declared const/global/struct/external NAME entering or leaving the
  //     program flips call-site codegen in flows that reference it, caught by
  //     the declared-name census (`_censusEntries`);
  //   - `include`/`run` targets and `EXTERNAL` name+arity decide which files
  //     contribute flows and which call sites become external calls, caught by
  //     the root-region structure descriptors;
  //   - a callee's parameter list is baked into its CALLERS' bytecode, caught
  //     by `_prevFlowSignatures`;
  //   - `countAllVisits` changes what generation bakes into every container.
  //
  // What is deliberately NOT a hazard, and so does not set this: where the
  // changed content SITS relative to the flows. Top-level flows are
  // name-addressed in `namedOnlyContent`, so their internal index-addressed
  // paths do not shift when content outside them grows or shrinks, and a flow
  // whose start line moved is re-based by the location cache's line delta.
  // Globals and constants are read through runtime variable lookups rather
  // than inlined (#309), so editing a constant's VALUE above the first scene —
  // or a `store` value, or front matter, or loose prose between two scenes —
  // cannot alter any flow's bytecode. Only the declared NAMES matter, and the
  // census covers those wherever they are written.
  //
  // The list above is exhaustive rather than conservative, which is what makes
  // it worth the reuse it buys and also what makes it a maintenance
  // obligation: a new cross-flow generation-time dependency needs a detector
  // added here in the same change, or these caches will quietly serve a flow
  // whose shape moved under it. `incrementalOutsideFlowReuse.test.ts` keeps
  // one test per reachable detector so a feed that stops firing turns red.
  protected _unchangedFlowShapeAtRisk = true;
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
  // The runtime stories kept runnable across later compiles, and the values
  // each needs written back into the objects it shares with them.
  protected _storyJournal = new StoryJournal();
  protected _recordCarried = (container: Container) =>
    this._storyJournal.recordCarried(container);
  protected _recordParent = (obj: InkObject) =>
    this._storyJournal.recordParent(obj);
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
  // The last compile of the real documents: the root it compiled and the
  // script versions it read. `_lastCompileResult` can describe a preview
  // compile instead, so everything that answers for the real documents reads
  // this.
  protected _canonical?: { uri: string; scripts: Record<string, number> };
  // A preview compile has run since `_canonical` was compiled, so the runtime
  // story that compile left behind is no longer intact.
  protected _previewedSinceCanonical = false;
  // The version the last preview compile gave its edited copy of a script.
  // Counts down from zero so no preview version can equal a real one.
  protected _lastPreviewVersion = 0;
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
          },
        },
      );
      this._documents.profilerId = this._profilerId;
    }
    if (config.files !== undefined && config.files !== this._config.files) {
      this._config.files = config.files;
      // Populate the builtin type-name registry BEFORE `documents.add` — the
      // registry adds trigger the annotator's lowering pass, which reads
      // `getBuiltinTypeNames()` for the shadow warning. `getCompiledPrelude`
      // publishes them, and a compile reaches it through
      // `mergePreludeSparkle`, so without this eager call a fresh document's
      // first lowering would miss the builtin shadow warnings until the next
      // edit.
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
    const applied = this.documents.update(params);
    if (applied) {
      this.noteDocumentEdits(params.textDocument.uri, params.contentChanges);
    }
    return applied;
  }

  /** Record where a set of applied content changes starts, for the next
   *  compile's change summary.
   *
   *  A change with no range replaces the whole document, so it starts at its
   *  first line. */
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

  /**
   * Has a script the last compiled program was built from been edited since
   * that compile?
   *
   * The program's `pathLocations` are what turns a source line into a story
   * path, and they describe the scripts as they were when the program was
   * compiled. Once one of those scripts is edited, the same line number names
   * a different piece of the script, so anything resolved from a line against
   * that program is an answer about a line the author is no longer looking at.
   *
   * `false` when there is nothing to compare against — no compile has
   * completed, or the last one threw and left no record — because a consumer
   * that has no fresher answer coming is better served by the program it
   * holds than by nothing.
   */
  isProgramOutdated(): boolean {
    const canonical = this._canonical;
    if (!canonical) {
      return false;
    }
    return !Object.entries(canonical.scripts).every(
      ([scriptUri, version]) => this.documents.get(scriptUri)?.version === version,
    );
  }

  /**
   * Keep a runtime story this compiler produced runnable after later
   * compiles, until `releaseStory`. Only the newest story, or one already
   * kept, can be kept. A later compile carries the story's unchanged flows
   * into its own and writes its values into them; `activateStory` writes the
   * kept story's values back before it runs. Answers whether it is kept.
   */
  keepStory(story: RuntimeStory): boolean {
    return this._storyJournal.keep(story);
  }

  releaseStory(story: RuntimeStory): void {
    this._storyJournal.release(story);
  }

  /** Make a kept story, or the newest one, the one that runs. Nothing else
   *  that shares its flows runs correctly until another is activated; the
   *  next compile activates the newest story itself. */
  activateStory(story: RuntimeStory): void {
    this._storyJournal.activate(story);
  }

  /**
   * The whole compiled program of `story`, the newest story or a kept one,
   * whose compile produced `program`, for a host that runs it once, such as
   * the player's PLAY. The newest compile's program is serialized through the
   * incremental caches and keeps its serialization, as a no-change compile
   * that asks for emission does. A kept earlier story is written afresh into a
   * copy of its program, and the caches, which describe the newest story, are
   * left alone. Leaves `story` the active one.
   */
  emitCompiledProgramOf(story: RuntimeStory, program: SparkProgram): SparkProgram {
    this._storyJournal.activate(story);
    if (program.compiled || program.compiledBuffer) {
      return program;
    }
    const cached = this._lastCompileResult;
    if (
      story === this._storyJournal.latest &&
      cached?.story === story &&
      cached.program === program
    ) {
      this.serializeCompiledProgram(story, program, program.uri);
      return program;
    }
    profile("start", this._profilerId, "ink/json", program.uri);
    const writer = new SimpleJson.Writer();
    story.ToJson(writer);
    profile("end", this._profilerId, "ink/json", program.uri);
    return { ...program, compiled: writer.toObject() ?? undefined };
  }

  selectDocument(params: SelectCompilerDocumentParams) {
    if (
      this._previewedSinceCanonical &&
      this._canonical &&
      !this.isProgramOutdated()
    ) {
      // A preview compile replaced the story the listeners would route
      // against. The real documents have not changed since the last real
      // compile, so nothing else is going to restore it: recompile them, which
      // gives the listeners the same program the player already holds.
      this.compile({ textDocument: { uri: this._canonical.uri } });
    }
    // Stamped before the listeners run, so everything that answers a selection
    // — the route search in the player's workspace worker, and the preview in
    // the player itself — sees whether the program it would answer from still
    // describes the document that was selected in.
    params.programOutdated = this.isProgramOutdated();
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
    const {
      reusable: reusableFlows,
      settled: settledFlows,
      ok: flowReuseOk,
    } = this.computeFlowReuse(story);
    const shapes = this.startFlowShapes(settledFlows);
    if (this._renamedFlowNames?.size) {
      // A synthetic rename inside a flow changes its serialized bytes in
      // ways the fingerprint can't see — its cached JSON must not be
      // served (see the canonicalize step above).
      for (const renamed of this._renamedFlowNames) {
        reusableFlows.delete(renamed);
      }
    }
    if (!flowReuseOk) {
      // The global guard failed (`_unchangedFlowShapeAtRisk`: something this
      // compile can change the shape of a flow whose own chunks are
      // unchanged): no flow can be reused this compile. Take the exact
      // baseline path — no fingerprinting, which would otherwise be pure
      // overhead — and let the cache lapse so the next reuse-eligible edit
      // reseeds from a fresh serialization.
      story.ToJson(writer as never);
      this._flowJsonCache = undefined;
      this._flowChunkCache = undefined;
      // The memo is what normally fingerprints each flow, and it did not run.
      // Walking for them anyway is the difference between the NEXT compile
      // being able to tell a settled flow apart from an unknown one and not,
      // and it costs a fraction of the serialization this branch just did.
      this.noteEveryFlowShape(story, shapes);
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
          // Fingerprinted before anything else, including the flows the cache
          // never serves: the change summary asks about every flow, and one it
          // is not told about is one it cannot claim to account for.
          const fp = shapes.note(name, container);
          // Same two exclusions as the JSON path, for the same reasons:
          // `global decl` is non-contiguous and cheap, and canonical
          // synthetic names are POSITIONAL, so a name can rebind to a
          // different flow that the fingerprint cannot distinguish.
          if (name === "global decl" || CANONICAL_SYNTH_NAME.test(name)) {
            return serialize();
          }
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
          //
          // Both are still fingerprinted, before anything else: the change
          // summary asks about every flow, and one it is not told about is one
          // it cannot claim to account for.
          const fp = shapes.note(name, container);
          if (name === "global decl" || CANONICAL_SYNTH_NAME.test(name)) {
            return serialize();
          }
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
    shapes.commit();
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
  /**
   * Give this compile its identity and its account of what it changed.
   *
   * Every compile gets one, including a compile that changed nothing and one
   * that failed, because the identity is what lets a client tell whether the
   * program it holds is the one these changes are measured against. Serving a
   * program with no summary at all would be indistinguishable from serving one
   * whose summary a client had already read.
   *
   */
  protected stampChangeSummary(confined: boolean): ProgramChangeSummary {
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
    // A file added, replaced or removed since the last summary is a change the
    // edits cannot describe: no content change was applied for it.
    const filesSettled = this._filesEpoch === this._changeFilesEpoch;
    const summary: ProgramChangeSummary = {
      id: ++this._changeSequence,
      since: this._lastChangeId,
      changedFrom,
      confined: confined && filesSettled,
    };
    this._lastChangeId = summary.id;
    this._changeFilesEpoch = this._filesEpoch;
    // Consumed: this summary reports them, and the next one is measured against
    // this program rather than the one before it. The hazard flag is consumed
    // with them, which gives it a lifetime of one summary to the next rather
    // than one compile to the next — bytecode is sometimes serialized outside a
    // compile, and a hazard raised there belongs to the summary being stamped.
    this._editedFrom.clear();
    this._changeHazard = false;
    return summary;
  }

  /**
   * Compare each top-level flow's shape with the one it had last compile,
   * raising the change hazard for any flow that moved in a way the edited lines
   * cannot account for.
   *
   * Two comparisons, because a flow the author edited and a flow they did not
   * can be asked different questions.
   *
   * A flow written entirely above everything the author edited (`settled`)
   * must compile to the same cross-flow bits it did last compile. Anything else
   * moved it from elsewhere, and nothing about the edited LINES can account for
   * that.
   *
   * A flow the author DID edit has to be asked something narrower, because its
   * shape is supposed to have changed. What it may not change is which of its
   * containers count their visits: a checkpoint records a visit count only for
   * the containers that were counting when it was taken, so a container that
   * starts counting leaves every earlier checkpoint short of a visit it cannot
   * reconstruct. Ordinary typing adds containers that count nothing and leaves
   * the signature alone; the first `{scene}` reference anywhere in the program
   * moves it.
   *
   * `note` returns the flow's cross-flow fingerprint, which the serializer's
   * reuse memo also keys on. `commit` makes this compile's shapes the ones the
   * next compile is compared with, so every compile has to note every flow
   * before it commits, whether or not it serializes anything.
   */
  protected startFlowShapes(settled: Set<string>) {
    const previousFingerprints = this._flowFingerprints;
    const nextFingerprints = new Map<string, string>();
    const previousCounting = this._flowCountingSignatures;
    const nextCounting = new Map<string, string>();
    if (this._renamedFlowNames?.size) {
      // A rename rebinds a name to different content, because synthetic names
      // are document-order ordinals. A route names each position it reached by
      // path, and a path through a synthetic flow starts with that name, so the
      // change summary cannot answer for it.
      this._changeHazard = true;
    }
    return {
      note: (name: string, container: Container): string => {
        const fp = JsonSerialisation.FingerprintCrossFlow(container);
        nextFingerprints.set(name, fp);
        const counting = this.countingSignature(container);
        nextCounting.set(name, counting);
        if (previousCounting?.get(name) !== counting) {
          this.noteCrossFlowShift();
        }
        if (settled.has(name) && previousFingerprints?.get(name) !== fp) {
          this.noteCrossFlowShift();
        }
        return fp;
      },
      commit: () => {
        this._flowFingerprints = nextFingerprints;
        this._flowCountingSignatures = nextCounting;
      },
    };
  }

  /** Note the shape of every top-level flow, in the order the serializer
   *  reaches them. */
  protected noteEveryFlowShape(
    story: RuntimeStory,
    shapes: ReturnType<SparkdownCompiler["startFlowShapes"]>,
  ) {
    const flows = story.mainContentContainer?.namedOnlyContent;
    if (flows) {
      for (const [name, value] of flows) {
        const container = asOrNull(value, Container);
        if (container) {
          shapes.note(name, container);
        }
      }
    }
  }

  /**
   * The change evidence `serializeCompiledProgram` gathers, gathered for a
   * compile that serializes nothing. The same flows are compared under the
   * same rules, so a compile's verdict does not depend on whether its bytecode
   * was emitted.
   */
  protected noteFlowShapesWithoutEmitting(story: RuntimeStory, uri: string) {
    profile("start", this._profilerId, "ink/flowShapes", uri);
    const shapes = this.startFlowShapes(
      this.settledFlows(story.mainContentContainer),
    );
    this.noteEveryFlowShape(story, shapes);
    shapes.commit();
    profile("end", this._profilerId, "ink/flowShapes", uri);
  }

  /**
   * Drop the flow shapes the next compile would be compared with, for a compile
   * that gathered none.
   *
   * The shapes on hand would then describe a program older than the one just
   * served, and a comparison with them could pass while the program in between
   * differed. With none on hand, every flow the next compile notes counts as
   * moved, so its summary is not confined and it gathers a fresh baseline.
   */
  protected forgetFlowShapes() {
    this._flowFingerprints = undefined;
    this._flowCountingSignatures = undefined;
  }

  /** Record the shapes of a program already served as the baseline, raising no
   *  hazard: with no shapes on hand every flow would count as moved, and the
   *  program has not changed since it was served. */
  protected seedFlowShapes(story: RuntimeStory, uri: string) {
    const hazard = this._changeHazard;
    this.noteFlowShapesWithoutEmitting(story, uri);
    this._changeHazard = hazard;
  }

  /**
   * Which containers within a flow must record their visits, and under which
   * flags: one `path=flags` entry per counting container, sorted, where the
   * path is that container's position within the flow.
   *
   * Each counting container is named individually because a checkpoint carries
   * a visit count only for the containers that were counting when it was taken.
   * A container that starts counting leaves every earlier checkpoint short of a
   * visit it cannot reconstruct, and one that stops leaves it carrying a count
   * the program no longer keeps — and moving the counting from one container to
   * another does both at once while leaving any total unchanged. Containers
   * that count nothing contribute no entry, which is what lets ordinary typing
   * inside a scene keep the signature it had while the first `{scene}`
   * reference written anywhere in the program moves it.
   *
   * A path shifts when content is inserted above the container it names, so an
   * edit above a counting container refuses reuse even though the counting
   * itself is unchanged. That costs a route search and nothing else.
   */
  protected countingSignature(container: Container): string {
    const counting: string[] = [];
    // Names and indices both, joined only for the few containers that count.
    // This walk reaches every container of every flow on every compile, so it
    // allocates nothing it does not have to.
    const path: (string | number)[] = [];
    const walk = (node: Container) => {
      if (node.countFlags > 0) {
        counting.push(`${path.join(".")}=${node.countFlags}`);
      }
      let index = 0;
      for (const child of node.content) {
        const sub = asOrNull(child, Container);
        if (sub) {
          path.push(sub.name ?? index);
          walk(sub);
          path.pop();
        }
        index += 1;
      }
      const named = node.namedOnlyContent;
      if (named) {
        for (const [childName, value] of named) {
          const sub = asOrNull(value, Container);
          if (sub) {
            path.push(childName);
            walk(sub);
            path.pop();
          }
        }
      }
    };
    walk(container);
    // Sorted so the signature says which containers count and under which
    // flags, not in which order this walk happened to reach them.
    counting.sort();
    return counting.join("|");
  }

  /** Record that a flow whose own source is unchanged nonetheless serialized
   *  differently.
   *
   *  The cross-flow fingerprint covers exactly the bits of a flow's bytecode
   *  that an edit ELSEWHERE can move: the visit-count flags on its containers
   *  and the resolved target of every divert. A checkpoint taken before this
   *  compile recorded visit counts under the old flags and a callstack under the
   *  old targets, so resuming from it would carry both forward. */
  protected noteCrossFlowShift() {
    this._changeHazard = true;
  }

  compile(params: CompileProgramParams) {
    const result: {
      textDocument: { uri: string; version: number };
      program: SparkProgram;
      story?: RuntimeStory;
    } = this.compileStory(params);
    // Only a compile of the real documents can answer for them.
    this._canonical = this._lastCompileResult
      ? {
          uri: this._lastCompileResult.uri,
          scripts: this._lastCompileResult.scripts,
        }
      : undefined;
    this._previewedSinceCanonical = false;
    this._events[CompiledProgramMessage.method].forEach((l) => {
      l?.(result);
    });
    // Story is not serializable so must be deleted before sending result
    delete result.story;
    return result;
  }

  /**
   * Compile the program as it would be with `params.contentChanges` applied to
   * `params.textDocument`, without applying them to anything another request
   * can see.
   *
   * The changes are applied to the registry's copy of the script, the program
   * is compiled through the ordinary incremental pipeline, and the script is
   * put back by applying the inverse changes before this returns. Both edits
   * reparse incrementally, so the cost is that of two small edits rather than
   * of a second compiler holding a second copy of the project.
   *
   * The compile's own caches then describe the edited text, which is sound for
   * the same reason typing a character and deleting it is: every compile
   * compares against the one before it. What does not survive is the runtime
   * story the last real compile produced, whose unchanged flows the preview
   * compile took over, so until the next real compile nothing may be routed
   * against it. `selectDocument` recompiles the real documents first when that
   * is the case, and `isProgramOutdated` keeps answering for the last real
   * compile throughout.
   */
  previewCompile(
    params: PreviewCompileProgramParams,
  ): PreviewCompileProgramResult {
    const { textDocument, contentChanges, root, startFrom } = params;
    const document = this.documents.get(textDocument.uri);
    if (!document || document.version !== textDocument.version) {
      return { textDocument, outdated: true };
    }
    const inverse = invertContentChanges(document.getText(), contentChanges);
    // Negative, and never reused, so neither the no-change short-circuit nor
    // `isProgramOutdated` can mistake the edited text for a real version.
    const previewVersion = --this._lastPreviewVersion;
    const applied = this.documents.update({
      textDocument: { uri: textDocument.uri, version: previewVersion },
      contentChanges,
    });
    if (applied) {
      this.noteDocumentEdits(textDocument.uri, contentChanges);
    }
    let compiled: ReturnType<SparkdownCompiler["compileStory"]>;
    try {
      compiled = this.compileStory({ textDocument: root, startFrom });
      if (compiled.program.scripts[textDocument.uri] == null) {
        // The root does not include the edited script, which is then compiled
        // on its own, as `SparkdownWorkspace.compile` does for a real edit.
        compiled = this.compileStory({ textDocument, startFrom });
      }
    } finally {
      if (applied) {
        this.documents.update({
          textDocument: {
            uri: textDocument.uri,
            version: textDocument.version,
          },
          contentChanges: inverse,
        });
        // Putting the text back is itself an edit as far as the NEXT compile is
        // concerned: the compile above is the one it will be measured against,
        // and that compile read the suggested text.
        this.noteDocumentEdits(textDocument.uri, inverse);
        this._previewedSinceCanonical = true;
      }
    }
    const event = { ...params, program: compiled.program, story: compiled.story };
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
      // Whatever this serves or serializes is read from the newest story.
      if (this._storyJournal.latest) {
        this._storyJournal.activate(this._storyJournal.latest);
      }
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
      } else if (
        !emitCompiledProgram &&
        cached.story &&
        !this._flowFingerprints &&
        (startFrom ?? this._config.startFrom)
      ) {
        // The compile that built this program had no start position and so
        // gathered no shapes, and this one now has somewhere to route. The
        // program is the one the next compile will be measured against, so its
        // shapes are the baseline, taken without comparing: nothing changed.
        this.seedFlowShapes(cached.story, uri);
      }
      // Nothing that feeds a compile has changed, so this program differs from
      // the one before it nowhere at all — the strongest summary there is, and
      // the one that lets a client keep everything it planned. It still needs a
      // fresh identity: the program object is served again, and a client
      // comparing identities has to see a compile it has not seen before.
      //
      // Stamped after any serialization above, so a serialization that raises a
      // hazard raises it against this summary and not a later one.
      cached.program.changes = this.stampChangeSummary(!this._changeHazard);
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
      return result;
    }

    const program: SparkProgram = {
      uri,
      scripts: { [uri]: this.documents.get(uri)?.version ?? -1 },
      files: {},
      version: this.documents.get(uri)?.version ?? -1,
      filesEpoch: this._filesEpoch,
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

    // Seed the builtin Sparkle trees as the base layer BEFORE parsing this
    // file's chunks, so an authored `layout main` overrides the builtin one in
    // place. The builtin CONTEXT is seeded the same way — builtins first, so an
    // authored define reusing a builtin name overrides it while keeping the
    // builtin key order — but inside `buildContext`, which assembles the whole
    // base in one place so it can be reused across compiles (#654). The chunk
    // walk records its context contributions instead of merging them here.
    if (this._config.useBuiltinsPrelude) {
      this.mergePreludeSparkle(program);
    }

    // Begin a fresh per-compile record of chunk identities + changed ranges
    // for the incremental location cache (see `_locCache`). Populated by the
    // recursive `parseIncrementally` chunk walk(s), consumed by
    // `populateAllLocations`, finalized below.
    this._compilationIds = new Set();
    this._changedChunkRanges = [];
    // Fresh per-compile record of what the chunks contribute to the context
    // and of the identities that key the assembled base (#654).
    this._contextContributions = [];
    this._contextKeyIds = [];
    this._contextLayerTypes = new Set();
    this._contextLayerAdded = [];
    // Rebuilt by `populateAllLocations`; cleared first so a compile that never
    // reaches the walk cannot publish the previous compile's captures.
    this._flowAssetAccum = undefined;
    this._pathLocationDraft = undefined;
    this._functionSpans = undefined;
    // Begin a fresh change summary. The verdict is only reached at the very end
    // of the compile, where every hazard below has had its chance to speak; a
    // compile that stops before then reports the answer that costs a client
    // nothing but a full re-plan.
    this._changeHazard = false;
    // Nothing to measure against on the first compile of an instance.
    const hadPreviousCompile = this._prevCompilationIds != null;
    // Whether this compile compared every flow's shape with the last compile's.
    // Serializing does it on the way; a compile that emits nothing does it only
    // when it has a start position, because a summary is read only to resume a
    // route and a route needs somewhere to go. The language servers compile
    // without one on every keystroke and read no summary at all.
    let flowShapesNoted = false;

    let compileThrew = false;
    // ---- Incremental ExportRuntime: per-compile flow-reuse guards ----
    this._flowReuseDisabled = this._disableFlowReuseNextCompile;
    this._unchangedFlowShapeAtRisk = this._riskFlowShapeNextCompile;
    this._disableFlowReuseNextCompile = false;
    this._riskFlowShapeNextCompile = false;
    const reuseCountAllVisits = !!params.countAllVisits;
    if (
      reuseCountAllVisits ||
      reuseCountAllVisits !== this._lastReuseCountAllVisits
    ) {
      // countAllVisits changes what GENERATION bakes into every container
      // (count flags), which reuse skips. Only test harnesses set it.
      this._flowReuseDisabled = true;
      this._unchangedFlowShapeAtRisk = true;
    }
    this._lastReuseCountAllVisits = reuseCountAllVisits;
    if (
      this._lastCompileResult &&
      this._lastCompileResult.uri === uri &&
      this._lastCompileResult.filesEpoch === this._filesEpoch
    ) {
      // A change in any NON-entry script (includes / `run` files) refuses
      // CONSTRUCTION reuse for the whole compile, because that decision is
      // committed during the parse walk: `tryReuseFlowRun` commits a flow as
      // the walk reaches it, and the include site can come after flows that
      // have already committed, so the answer has to be known up front rather
      // than derived once every file has been seen.
      //
      // It deliberately leaves `_unchangedFlowShapeAtRisk` alone. The two
      // downstream caches are consulted after the whole parse, so they can
      // afford to wait for the hazard detectors, which run across every file
      // of the compile. Arming the shape risk here as well would cost every
      // multi-file project both caches on every edit to an included file.
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
      // A different entry script, or a files-epoch bump: the flow set this
      // compile produces need not correspond to the one the caches were built
      // from at all, so neither cache can be trusted by name.
      this._flowReuseDisabled = true;
      this._unchangedFlowShapeAtRisk = true;
    }
    this._reusedFlowsThisCompile = new Set();
    this._nextFlowRuns = new Map();
    this._reuseParentBackups = undefined;
    this._renamedFlowNames = undefined;
    this._censusEntries = [];
    // The flows this compile carries are the newest story's, so they must
    // hold its values; and a story kept runnable must get back the values
    // this compile writes over.
    this._storyJournal.beginCompile();
    const recording = this._storyJournal.recording;
    carriedRuntime.record = recording ? this._recordCarried : null;
    activation.reparent = recording ? this._recordParent : null;
    let producedStory: RuntimeStory | undefined;

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
      //
      // Each document's own set is maintained by the registry across edits, so
      // this unions ready-made sets instead of walking every script's tree
      // again on every compile.
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
      profile("end", this._profilerId, "scopeDefineInstances", uri);
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
        this._unchangedFlowShapeAtRisk = true;
      }
      this._prevCensusKey = censusKey;
      // Compared unconditionally: a signature change is one of the things
      // `_unchangedFlowShapeAtRisk` has to know about, so short-circuiting on
      // an already-disabled construction reuse would let a caller's stale
      // serialized bytecode be served while the callee's parameters changed.
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
          this._unchangedFlowShapeAtRisk = true;
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
      // After ExportRuntime: the diverts it reports are recorded while
      // ExportRuntime resolves references.
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
          flowShapesNoted = true;
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
          if (startFrom ?? this._config.startFrom) {
            this.noteFlowShapesWithoutEmitting(story, uri);
            flowShapesNoted = true;
          } else {
            this.forgetFlowShapes();
          }
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
        this._functionSpans = this.collectFunctionSpans(program, parsedStory);
        // Carry this compile's chunk-identity set forward so the next compile
        // can tell which chunks are unchanged.
        this._prevCompilationIds = this._compilationIds;
        // Promote this compile's flow-run records (fresh constructions and
        // committed reuses) for the next compile's reuse decisions.
        this._prevFlowRuns = this._nextFlowRuns;
        profile("end", this._profilerId, "populateLocations", uri);
        producedStory = story;
      }
    } catch (e) {
      compileThrew = true;
      // Close whichever phase was in flight. This catch swallows the throw and
      // the compiler keeps serving, so a phase left open here produces no
      // measurement at all — losing exactly the compiles worth looking at, and
      // `ink/compile` (ExportRuntime) is the very phase this catch was written
      // for. Ending a phase that already ended is a no-op, so naming them all
      // is safe. Add any new phase opened inside this `try` to the list.
      for (const phase of [
        "ink/parse",
        "scopeDefineInstances",
        "ink/canonicalizeSyntheticNames",
        "ink/compile",
        "ink/json",
        "ink/flowShapes",
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
      // The census baseline just went with it, so next compile cannot detect a
      // declared-name change — the one signal the downstream caches lean on
      // hardest. Refuse them that compile rather than serve a flow whose
      // codegen may have moved under an undetectable name change.
      this._riskFlowShapeNextCompile = true;
    }
    carriedRuntime.record = null;
    activation.reparent = null;
    if (producedStory && !compileThrew) {
      this._storyJournal.endCompile(producedStory);
    } else {
      this._storyJournal.abortCompile();
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
      this.validateImageAttributes(program);
      this.validateMorphs(program);
    }
    if (this._config.workspace !== undefined) {
      program.workspace = this._config.workspace;
    }
    if (this._config.simulationOptions !== undefined) {
      program.simulationOptions = this._config.simulationOptions;
    }
    program.startFrom = startFrom ?? this._config.startFrom;
    program.changes = this.stampChangeSummary(
      hadPreviousCompile &&
        !compileThrew &&
        !!state.story &&
        flowShapesNoted &&
        !this._changeHazard &&
        !this._unchangedFlowShapeAtRisk,
    );
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
    return {
      textDocument: {
        uri,
        version: this.documents.get(uri)!.version,
      },
      program,
      story: state.story as RuntimeStory | undefined,
    };
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
      this.resetParsedRuntime(parsedChildren(c));
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

    // `getClosestWeave` follows a trailing weave into the content a chunk
    // placed, and the chunks after it are appended there, so the assembly
    // places a weave of its own in place of each trailing weave of a chunk.
    // The chunk's objects are carried to the next compile, and their `content`
    // stays as the chunk lowered it; the copy takes over as the `parent` of the
    // children it holds. It holds them at the same indentation, so it
    // generates what the chunk's weave would.
    const assemblyWeave = (weave: Weave): Weave => {
      const copy = new Weave(
        withAssemblyWeaves(weave.content),
        weave.baseIndentIndex,
      );
      copy.debugMetadata = weave.ownDebugMetadata;
      return copy;
    };
    const withAssemblyWeaves = (content: ParsedObject[]): ParsedObject[] => {
      const last = content.at(-1);
      return last instanceof Weave
        ? [...content.slice(0, -1), assemblyWeave(last)]
        : content;
    };

    const fileName = uri.split("/").at(-1)?.split(".")[0] ?? null;

    // A chunk's debug metadata is shared by reference with the runtime objects
    // built from it, in every story that holds them, so a story kept runnable
    // gets back the position this compile writes over.
    const restamp = (metadata: DebugMetadata, lineNumberOffset: number) => {
      this._storyJournal.recordDebugMetadata(metadata);
      this.offsetDebugMetadata(metadata, lineNumberOffset, version);
      metadata.fileName = fileName;
      metadata.filePath = uri;
    };

    const remapContent = (
      content: ParsedObject[],
      lineNumberOffset: number,
    ) => {
      for (const c of content) {
        c.ResetRuntime();
        if (c.debugMetadata) {
          restamp(c.debugMetadata, lineNumberOffset);
        }
        if (
          "identifier" in c &&
          c.identifier instanceof Identifier &&
          c.identifier?.debugMetadata
        ) {
          restamp(c.identifier.debugMetadata, lineNumberOffset);
          c.identifier.ResetRuntime();
        }
        if ("pathIdentifiers" in c && Array.isArray(c.pathIdentifiers)) {
          for (const p of c.pathIdentifiers) {
            if (p instanceof Identifier && p.debugMetadata) {
              restamp(p.debugMetadata, lineNumberOffset);
              p.ResetRuntime();
            }
          }
        }
        remapContent(parsedChildren(c), lineNumberOffset);
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
          restamp(c.debugMetadata, lineNumberOffset);
        }
        if (
          "identifier" in c &&
          c.identifier instanceof Identifier &&
          c.identifier?.debugMetadata
        ) {
          restamp(c.identifier.debugMetadata, lineNumberOffset);
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
            // A chunk that declares a global, constant, struct, external or
            // list also keys the assembled base context (#654): a define's
            // property value can be an expression over any of them, so its
            // RUNTIME value — the define tables the engine reads — moves when
            // one of those declarations moves, while the chunk that carries
            // the define itself is untouched. The prelude is excluded for the
            // same reason it is excluded from the census: its chunks are
            // parsed once per compiler instance and contribute nothing
            // afterwards, so counting them would move the key on the first
            // compile that could reuse anything.
            if (scan.disqualifies) {
              this._contextKeyIds?.push(block);
            }
          }
          if (this._prevCompilationIds && !this._prevCompilationIds.has(block)) {
            if (scan.invalidatesGlobals) {
              this._flowReuseDisabled = true;
              this._unchangedFlowShapeAtRisk = true;
            }
            if (scan.disqualifies) {
              // A changed chunk that declares a list, a constant, an external,
              // a struct or a global. Every one of those is registered into the
              // story at generation time and read back out of the variables a
              // checkpoint carries, so a route resumed from a checkpoint taken
              // before this compile would carry the OLD value forward however
              // far below the route the declaration is written. The changed
              // LINES cannot express that, so the summary declines instead.
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
        this._unchangedFlowShapeAtRisk = true;
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
      // changed chunks' 0-based source line ranges, tagged with this script's
      // uri, so `populateAllLocations` can tell which flows' subtrees must be
      // recomputed vs reused. The lines come from THIS script's document, and
      // this function recurses through every included script, so the uri is
      // what keeps a range from being read against another script's flows.
      const compiledBlock = rec.block as object;
      this._compilationIds?.add(compiledBlock);
      if (
        this._prevCompilationIds &&
        !this._prevCompilationIds.has(compiledBlock)
      ) {
        const chunkStart = lineNumberOffset;
        const chunkEnd = document?.lineAt(rec.to) ?? chunkStart;
        this._changedChunkRanges?.push([chunkStart, chunkEnd, uri]);
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
              const rootWeave = flow._rootWeave
                ? assemblyWeave(flow._rootWeave)
                : new Weave([]);
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
                  : withAssemblyWeaves(flow.content);
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
        // Record this chunk's pre-built structs for `buildContext`, which
        // applies them over the builtins in walk order. Keeping the merge out
        // of the walk is what lets the assembled result be reused by a compile
        // whose contributing chunks are the same objects (#654).
        this._contextContributions?.push(context);
        this._contextKeyIds?.push(compiledBlock);
      }
      if (sparkle && !this._injectingPrelude) {
        this._contextKeyIds?.push(compiledBlock);
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
        this._contextKeyIds?.push(compiledBlock);
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
    for (const c of parsedChildren(node)) {
      this.resetSubtreeRuntime(c);
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
          ] = this._pathLocationDraft?.[path] || [];
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
          if (endColumn <= 0 && endLine > startLine) {
            // If range stretches to only the start of a line,
            // limit the range to the end of the previous line,
            // (So that the document blinking cursor doesn't confusingly appear
            // at the start of the next unrelated line when doing a stack trace,
            // and so that a line-keyed lookup — a breakpoint, a preview point —
            // resolves that line to its own path rather than to the statement
            // that merely stops at its first column.)
            // A range reaching only the start of `endLine` records an end
            // column of either 0 or -1, and which one depends on the stamping
            // convention behind the metadata: the 1-based character numbers
            // this pipeline assumes give 0, while `buildDebugMetadata`'s
            // default 0-based stamps give -1. Both say the range stops at or
            // before `endLine`'s first column, so both are pulled back. The
            // `endLine > startLine` guard keeps a single-line range from being
            // pulled back before its own start.
            if (uri) {
              const document = this.documents.get(uri);
              if (document) {
                const endPositionWithoutLastNewline = document.positionAt(
                  document.offsetAt({
                    line: endLine,
                    character: Math.max(endColumn, 0),
                  }) - 1,
                );
                endLine = endPositionWithoutLastNewline.line;
                endColumn = endPositionWithoutLastNewline.character;
              }
            }
          }
          const draft = (this._pathLocationDraft ??= {});
          if (!(path in draft)) {
            const tuple: [number, number, number, number, number] = [
              scriptIndex,
              startLine,
              startColumn,
              endLine,
              endColumn,
            ];
            draft[path] = tuple;
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

  /**
   * Index this compile's changed chunks against a set of flow starts, one
   * script at a time.
   *
   * A flow whose `uri` is empty or whose `start0` is negative has no source
   * span to test, so it contributes no boundary and reports as touched — the
   * caller falls back to recomputing it.
   */
  protected buildFlowSpanIndex(
    flows: ReadonlyArray<{ uri: string; start0: number }>,
  ): FlowSpanIndex {
    const startsByUri = new Map<string, number[]>();
    for (const f of flows) {
      if (f.start0 < 0 || !f.uri) {
        continue;
      }
      const starts = startsByUri.get(f.uri);
      if (starts) {
        starts.push(f.start0);
      } else {
        startsByUri.set(f.uri, [f.start0]);
      }
    }
    for (const starts of startsByUri.values()) {
      starts.sort((a, b) => a - b);
    }
    const changedByUri = new Map<string, Array<[number, number]>>();
    for (const [start, end, uri] of this._changedChunkRanges ?? []) {
      const ranges = changedByUri.get(uri);
      if (ranges) {
        ranges.push([start, end]);
      } else {
        changedByUri.set(uri, [[start, end]]);
      }
    }
    return {
      touched: (uri: string, start0: number): boolean => {
        if (start0 < 0 || !uri) {
          return true;
        }
        const ranges = changedByUri.get(uri);
        if (!ranges?.length) {
          return false;
        }
        let end0 = Number.POSITIVE_INFINITY;
        const starts = startsByUri.get(uri);
        if (starts) {
          for (const s of starts) {
            if (s > start0) {
              end0 = s;
              break;
            }
          }
        }
        // `start0` is the flow's header line. The guard reaches one line
        // further up so that a chunk ending immediately above the header —
        // the blank line or trailing content a header edit tends to re-chunk
        // along with it — counts as touching the flow.
        const guardStart = start0 - 1;
        for (const [cs, ce] of ranges) {
          if (ce >= guardStart && cs < end0) {
            return true;
          }
        }
        return false;
      },
    };
  }

  protected computeFlowReuse(story: RuntimeStory): {
    reusable: Set<string>;
    settled: Set<string>;
    ok: boolean;
  } {
    const reusable = new Set<string>();
    const root = story.mainContentContainer;
    const named = root?.namedOnlyContent;
    const settled = this.settledFlows(root);
    if (!named) {
      return { reusable, settled, ok: true };
    }
    const flows: Array<{ name: string; uri: string; start0: number }> = [];
    for (const [name, value] of named) {
      if (name === "global decl") {
        continue;
      }
      const c = asOrNull(value, Container);
      const md = c?.ownDebugMetadata;
      flows.push({
        name,
        uri: md?.filePath ?? "",
        start0: md ? md.startLineNumber - 1 : -1,
      });
    }
    if (this._unchangedFlowShapeAtRisk) {
      return { reusable, settled, ok: false };
    }
    const spans = this.buildFlowSpanIndex(flows);
    for (const f of flows) {
      if (!spans.touched(f.uri, f.start0)) {
        reusable.add(f.name);
      }
    }
    return { reusable, settled, ok: true };
  }

  /**
   * The top-level flows written entirely above everything the author edited
   * since the last compile.
   *
   * Their source text is the text the last compile read, so any difference in
   * what they now compile to came from somewhere else in the program — which is
   * the one thing a change summary reported as a set of edited LINES cannot say.
   * Their compiled shape is compared instead, in `startFlowShapes`, which both
   * `serializeCompiledProgram` and `noteFlowShapesWithoutEmitting` call.
   *
   * Deliberately NOT the same question as reuse: a flow can be re-lowered
   * because the edit fell in its chunk's reparse window while its own text is
   * untouched, and that flow still has to be checked.
   */
  protected settledFlows(root: Container | null): Set<string> {
    const settled = new Set<string>();
    const named = root?.namedOnlyContent;
    if (!named) {
      return settled;
    }
    const starts: Array<{ name: string; uri: string; start0: number }> = [];
    const byUri = new Map<string, number[]>();
    for (const [name, value] of named) {
      const md = asOrNull(value, Container)?.ownDebugMetadata;
      const uri = md?.filePath ?? "";
      const start0 = md ? md.startLineNumber - 1 : -1;
      starts.push({ name, uri, start0 });
      if (uri && start0 >= 0) {
        const list = byUri.get(uri);
        if (list) {
          list.push(start0);
        } else {
          byUri.set(uri, [start0]);
        }
      }
    }
    for (const list of byUri.values()) {
      list.sort((a, b) => a - b);
    }
    for (const flow of starts) {
      if (!flow.uri || flow.start0 < 0) {
        continue;
      }
      const edited = this._editedFrom.get(flow.uri);
      if (edited == null) {
        settled.add(flow.name);
        continue;
      }
      // The flow runs to the line before the next flow in the same script.
      let end = Number.POSITIVE_INFINITY;
      for (const start of byUri.get(flow.uri) ?? []) {
        if (start > flow.start0) {
          end = start;
          break;
        }
      }
      if (end <= edited) {
        settled.add(flow.name);
      }
    }
    return settled;
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
        uri: string;
        start0: number;
      }> = [];
      for (const [name, value] of named) {
        const container = asOrNull(value, Container);
        const md = container?.ownDebugMetadata;
        flows.push({
          name,
          container,
          value,
          uri: md?.filePath ?? "",
          start0: md ? md.startLineNumber - 1 : -1,
        });
      }
      // Within one script, sorted start lines → each flow's span end is the
      // next flow's start. Across scripts the starts are incomparable, so the
      // index keeps each script's starts in their own list. Built lazily: a
      // compile that reuses nothing never asks it a question, and building it
      // sorts every flow start in the project.
      let spanIndex: FlowSpanIndex | undefined;
      const spans = () => (spanIndex ??= this.buildFlowSpanIndex(flows));
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
        const curNames = flows.filter((f) => f.name !== "global decl"); // not a node name
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
      // so replaying them is only sound while an unchanged flow's subtree
      // keeps the shape it had. Whether it can have changed shape is the same
      // question the bytecode cache asks, answered once per compile by
      // `_unchangedFlowShapeAtRisk` (see its declaration for the hazard list),
      // so both caches reach the same verdict from the same evidence.
      if (effPrevCache && this._unchangedFlowShapeAtRisk) {
        effPrevCache = undefined;
      }
      if (!effPrevCache) {
        // The set of top-level flows changed, or something can have moved the
        // shape of a flow whose own source did not. Either way this compile is
        // not one whose differences the edited lines account for.
        this._changeHazard = true;
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
          f.uri !== "" &&
          f.name !== "global decl" && // not a node name
          !CANONICAL_SYNTH_NAME.test(f.name) &&
          effPrevCache != null;
        if (reusable) {
          const cached = effPrevCache!.get(f.name);
          if (cached) {
            if (!spans().touched(f.uri, f.start0)) {
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
            f.name === "global decl" // not a node name
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
    if (cached.pathEntries.length > 0) this._pathLocationDraft ??= {};
    const draft = this._pathLocationDraft;
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
      if (!(pe.path in draft!)) {
        draft![pe.path] = nt;
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

  /**
   * Every function container in the story, with the lines its declaration
   * spans: named functions, hoisted function literals and the callables a
   * flow nests. A function's own nested flows are under its path, and their
   * rows start inside this declaration's lines, so this span covers them and
   * the walk stops there. Binding evaluators are left out: `isBindingPath`
   * already rejects every row under one.
   */
  protected collectFunctionSpans(
    program: SparkProgram,
    story: Story,
  ): FunctionSpan[] {
    const spans: FunctionSpan[] = [];
    const visit = (flow: FlowBase) => {
      for (const sub of flow.subFlowsByName.values()) {
        if (sub.isFunction) {
          const path = sub.runtimeObject?.path?.componentsString;
          if (path && !isBindingPath(path)) {
            // Resolved as `populateAllLocations` resolves a row's script.
            const md = sub.ownDebugMetadata ?? sub.debugMetadata;
            const uri = md ? (md.filePath ?? program.uri) : undefined;
            const scriptIndex =
              uri != null ? this._scriptIndices?.get(uri) : undefined;
            spans.push(
              md && scriptIndex != null
                ? {
                    path,
                    lines: [
                      scriptIndex,
                      md.startLineNumber - 1,
                      md.endLineNumber - 1,
                    ],
                  }
                : { path },
            );
          }
        } else {
          visit(sub);
        }
      }
    };
    visit(story);
    return spans;
  }

  sortPathLocations(program: SparkProgram) {
    const uri = program.uri;
    profile("start", this._profilerId, "sortPathLocations", uri);
    const draft = this._pathLocationDraft;
    const order = this._pathLocationOrder;
    if (draft && order) {
      // Linear bucket merge: entries were bucketed by (scriptIndex, startLine)
      // in DFS/creation order as they were added. Emit scriptIndices then lines
      // in ascending numeric order; within each line, a stable sort on
      // startColumn (only when a line holds 2+ entries) gives the
      // (scriptIndex, startLine, startColumn) order a line lookup binary-
      // searches, with the DFS-insertion bucket order as the tie-break.
      const scriptIndices = [...order.keys()].sort((a, b) => a - b);
      let count = 0;
      for (const byLine of order.values()) {
        for (const bucket of byLine.values()) {
          count += bucket.length;
        }
      }
      const paths = new Array<string>(count);
      const values = new Int32Array(count * LOCATION_STRIDE);
      let row = 0;
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
            const tuple = draft[path];
            if (!tuple) {
              continue;
            }
            paths[row] = path;
            const at = row * LOCATION_STRIDE;
            values[at] = tuple[0];
            values[at + 1] = tuple[1];
            values[at + 2] = tuple[2];
            values[at + 3] = tuple[3];
            values[at + 4] = tuple[4];
            row++;
          }
        }
      }
      const functions = this._functionSpans;
      program.pathLocations = {
        ...(row === count
          ? { paths: narrowPaths(paths), values }
          : {
              paths: narrowPaths(paths.slice(0, row)),
              values: values.slice(0, row * LOCATION_STRIDE),
            }),
        ...(functions?.length ? { functions } : {}),
      };
    } else if (draft) {
      // No creation-order index (locations weren't gathered via
      // `populateAllLocations`): sort by comparison instead.
      program.pathLocations = pathLocationTableOf(draft, this._functionSpans);
    }
    this._pathLocationDraft = undefined;
    this._functionSpans = undefined;
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

  /** Assemble `program.context`: the project-wide base (builtins, this
   *  project's defines, its files' structs, and the `$default` merge over all
   *  of them) plus this compile's own implicit definitions layered over it.
   *
   *  The base is shared across compiles whose key is unchanged (#654) — an
   *  edit to a line of dialogue changes none of its inputs, and rebuilding it
   *  cost a project the size of Raffles and Bunny 27 to 55 ms per keystroke.
   *  The layer is copy-on-write: a type map the implicit definitions add to is
   *  copied first, so the shared base never learns about an entry that belongs
   *  to one compile. That is what keeps a preview compile's speculative
   *  filtered image out of the canonical compile that follows it.
   *
   *  The implicit definitions split by what they are derived from. The filtered
   *  image every SVG or vocabulary-carrying image implies is derived from the
   *  files, so it belongs to the base and is assembled with it, before the
   *  `$default` merge that also belongs to the base. The filtered image an
   *  attribute directive such as `[[bunny:phone]]` implies is derived from
   *  scene content, so it is this compile's own and goes in the layer, with the
   *  same `$default` merge applied to it as it is added. */
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
    // The program's own view: a fresh top-level object whose type maps are the
    // base's until this compile writes to one (`addImplicitDef`).
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
    // A revision names the base AND the layer, because a consumer that keeps
    // what it derived from the context has to notice either moving. The layer
    // is named by a serial rather than by the names themselves: a project the
    // size of Raffles and Bunny reaches thousands of implicit definitions, and
    // spelling them out put 33 KB of the revision on the wire with every
    // program. The serials are exact, not a hash — the same set of names always
    // gets the same one — and they are never reused, so dropping the table to
    // bound its size costs a consumer a rebuild it did not need rather than
    // hiding one it did.
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

  /** Assemble the shared base context from nothing and cache it under `ids`. */
  protected buildContextBase(
    state: SparkdownCompilerState,
    program: SparkProgram,
    ids: object[],
    configKey: string,
  ) {
    const uri = program.uri;
    profile("start", this._profilerId, "buildContextBase", uri);
    const context: { [type: string]: { [name: string]: any } } = {};
    // Assembled against a stand-in program so the passes below write into the
    // base rather than into the program that happens to be compiling, and so
    // the diagnostics they report can be kept with it for replay.
    const staging = {
      uri,
      scripts: program.scripts,
      files: program.files,
      context,
      diagnostics: {} as { [uri: string]: SparkDiagnostic[] },
    } as SparkProgram;
    // Builtins first, so an authored define reusing a builtin name overrides
    // it below while keeping the builtin's key order.
    if (this._config.useBuiltinsPrelude) {
      this.mergePreludeContext(staging);
    } else {
      this.populateBuiltins(staging);
    }
    // An authored define that reuses a builtin name OVERRIDES IN PLACE: its
    // properties win, but the builtin's *unspecified* siblings are retained.
    // Without this, a partial override silently drops every field it doesn't
    // restate — e.g. `define ui as config with reactive = true` would lose the
    // builtin `layouts_element_name` / `styles_element_name` / `breakpoints`,
    // leaving `reveal()` unable to find the screen root (it bails on an
    // undefined `layouts_element_name`), so screens stay at opacity:0 — a black
    // preview with no error.
    //
    // Structural element-tree types (layout/screen/component) are REPLACED
    // wholesale rather than deep-merged — merging two element trees would
    // splice the builtin's children into the authored one. (They likewise
    // override by replace in the reactive `sparkle` channel; see
    // mergePreludeSparkle.)
    const REPLACE_TYPES = new Set(["layout", "screen", "component"]);
    for (const contribution of this._contextContributions ?? []) {
      for (const [type, structs] of Object.entries(contribution) as [
        string,
        Record<string, any>,
      ][]) {
        for (const [name, struct] of Object.entries(structs)) {
          context[type] ??= {};
          const existing = context[type][name];
          context[type][name] =
            existing && !REPLACE_TYPES.has(type)
              ? this.inheritDefaults(existing, struct)
              : struct;
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
    // The cached implicit definitions were merged against the `$default`s of
    // the base that has just been replaced, so they go with it.
    this._implicitDefCache = undefined;
    profile("end", this._profilerId, "buildContextBase", uri);
  }

  /** Add one implicit definition to this compile's layer, copying the type map
   *  out of the shared base the first time this compile writes to it, and
   *  merging the type's `$default` under it exactly as
   *  `populateDefinedDefaultProperties` does over the base. Returns false when
   *  the entry is already present (in the base or the layer), which is what
   *  keeps an implicit definition from shadowing an authored one.
   *
   *  `build` is a callback rather than a struct because a name this compiler
   *  has already derived is served from `_implicitDefCache` without building or
   *  merging anything: the same directive implies the same struct on every
   *  compile, and a project the size of Raffles and Bunny reaches here
   *  thousands of times per compile. */
  protected addImplicitDef(
    program: SparkProgram,
    type: string,
    name: string,
    build: () => any,
  ): boolean {
    const context = (program.context ??= {});
    if (context[type]?.[name]) {
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
    context[type]![name] = struct;
    (this._contextLayerAdded ??= []).push(key);
    return true;
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
    // A channel is a pure function of the context type map it mirrors, and the
    // copy-on-write layer hands out the base's own type map for every type this
    // compile did not write to (#654). Comparing that map by identity therefore
    // answers "is the channel I built last time still the right one" exactly:
    // an unchanged type keeps its clone, and only the types a compile actually
    // touched — `filtered_image`, when a directive implies a new one — are
    // cloned again.
    //
    // Successive programs then share the channels they have in common, which is
    // sound because the only thing written onto a channel struct after it is
    // handed over is a derivation OF that struct: `filterImage` caches
    // `filtered_src` / `filtered_layers` on the filtered image it resolved. The
    // struct's inputs cannot have moved without the type map being rebuilt, so
    // the cached derivation is still the right answer; a root retyped from
    // `image` to `layered_image` (#340) or an edited attribute list rebuilds the
    // map and the next compile hands out fresh structs. Warm-up sweeps that
    // resolve against a DIFFERENT define channel already work on their own
    // copies (`resolveImageSrcs`).
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
    // File-derived + implicit-def asset types (not defines).
    const ASSET_TYPES = ["image", "audio", "font", "video", "layered_image", "filtered_image"];
    for (const type of ASSET_TYPES) {
      const assets = channelFor(type, cloneSharingVocabularies);
      if (assets) {
        program.assets ??= {};
        program.assets[type] = assets;
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

  /** Report the two ways a builtin global's name breaks a story, in an
   *  unseeded compile (the editor's), whose diagnostics are the ones an
   *  author sees:
   *
   *  1. A top-level scene or function named after a builtin global. Its
   *     only route is a bare `-> name`, which binds to the global's variable
   *     in every compile; the seeded compile rejects the same flow as a
   *     duplicate identifier when the prelude's own declaration resolves its
   *     references, and the marker of an unseeded compile has no parsed node
   *     to do that from, so the clash is reported here, on the name.
   *  2. Every divert whose target resolved to such a global (recorded in
   *     `Story.builtinGlobalDiverts` while ExportRuntime resolves references,
   *     so this runs after it). `-> game` binds to a table and fails when run,
   *     whether it meant a scene, a branch, or a label of that name, and
   *     whether the slot holds the prelude's marker or an authored override.
   *
   *  A branch or label is not reported for its name alone: one reached by its
   *  qualified path (`-> start.world`), or never diverted to, is correct in
   *  every compile, and the seeded compile says nothing about it. */
  protected reportBuiltinGlobalCollisions(
    parsedStory: Story,
    names: ReadonlySet<string>,
    program: SparkProgram,
    uri: string,
  ): void {
    const reported = new Set<string>();
    // `characterBias` is what the stamp adds to a 0-based column: the
    // lowering dispatcher stamps flows with 0-based character numbers, and
    // a divert's target identifiers carry 1-based ones (see
    // lower/utils/debugMetadata.ts and lowerDivertPath.ts); line numbers are
    // 1-based in both, and getDiagnostic takes 0-based positions on both
    // axes. A target identifier's stamp is the name itself and is used as
    // is. A flow's stamp covers its declaration line (a scene) or its whole
    // body (a function), so that range narrows to the name when the name is
    // on the stamp's first line.
    const report = (
      message: string,
      dm: DebugMetadata | null | undefined,
      characterBias: number,
      name: string,
      exact: boolean,
      severity: DiagnosticSeverity = DiagnosticSeverity.Error,
    ): void => {
      if (!dm) {
        return;
      }
      const diagUri = dm.filePath || uri;
      const line = dm.startLineNumber - 1;
      let startCharacter = dm.startCharacterNumber - characterBias;
      let endLine = dm.endLineNumber - 1;
      let endCharacter = dm.endCharacterNumber - characterBias;
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
    // `content` rather than `subFlowsByName`: the map keeps one flow per
    // name, and two scenes sharing a builtin's name should both be marked.
    for (const child of parsedStory.content ?? []) {
      if (child instanceof FlowBase) {
        const name = child.identifier?.name;
        if (name && names.has(name)) {
          report(
            `\`${name}\` is a builtin global, so it cannot also be the name of a scene or function`,
            child.debugMetadata,
            0,
            name,
            false,
          );
        }
      }
    }
    for (const { name, divert, warning } of parsedStory.builtinGlobalDiverts) {
      // The divert's own position is inherited from its statement or scene;
      // its first target identifier carries the name's position.
      const target = divert instanceof Divert ? divert.pathIdentifiers?.[0] : null;
      const stamped = target?.debugMetadata ?? null;
      report(
        warning
          ? `\`${name}\` is a builtin global; unless the \`${name}\` this divert reads holds a divert target when it runs, the divert binds to the builtin and cannot reach a scene, branch, or label named \`${name}\``
          : `\`${name}\` is a builtin global, so this divert binds to it and cannot reach a scene, branch, or label named \`${name}\``,
        stamped ?? divert.debugMetadata,
        stamped ? 1 : 0,
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
    const files = [...this.files.all()];
    const rasterAliases = new Map<string, number>();
    for (const file of files) {
      if (isRasterLayerFile(file))
        rasterAliases.set(file.name, (rasterAliases.get(file.name) ?? 0) + 1);
    }
    if (files) {
      // Track the first file to claim each (type, name) so we can flag basename
      // collisions among non-script assets. Asset names are a FLAT namespace —
      // scripts reference an asset by its bare name (`[[show image forest]]` ->
      // context["image"].forest) — so two assets sharing a (type, name) in
      // different folders are ambiguous and one would silently win. Scripts are
      // exempt: they're keyed/bundled by full path, not by a flat basename.
      const claimedBy = new Map<string, string>();
      const flaggedCollision = new Set<string>();
      for (const file of files) {
        const rasterFile = isRasterLayerFile(file);
        const rasterPath = rasterFile ? decodeURIComponent(new URL(file.uri).pathname) : "";
        const rasterFolder = rasterPath.split("/").at(-2) ?? "";
        const explicitRaster = rasterFile && state.story?.structDefinitions?.["layered_image"]?.[rasterFolder] !== undefined;
        // Preserve existing numbered image names when unambiguous. Repeated
        // layer names across portraits stay private to their folder instead
        // of flooding the project with irrelevant flat-name collisions.
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
        if (explicitRaster) {
          // The convention uses private references, but an authored override
          // may name the original file or its complete, dotted filename stem.
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
    const raster = createRasterImageDefinitions([...this.files.all()]);
    Object.assign(program.context["image"] ??= {}, raster.images);
    for (const diagnostic of raster.diagnostics) {
      if (state.story?.structDefinitions?.["layered_image"]?.[diagnostic.folder]) continue;
      const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
      ((program.diagnostics ??= {})[diagnostic.uri] ??= []).push({
        range, severity: DiagnosticSeverity.Warning,
        message: { kind: "markdown", value: diagnostic.message }, source: LANGUAGE_NAME,
      });
    }
    for (const { name, firstUri, otherUri } of raster.collisions) {
      if (state.story?.structDefinitions?.["layered_image"]?.[name]) continue;
      this.pushAssetCollisionDiagnostic(program, firstUri, otherUri, "layered_image", name);
      this.pushAssetCollisionDiagnostic(program, otherUri, firstUri, "layered_image", name);
    }
    for (const [name, image] of Object.entries(raster.layeredImages)) {
      const ordinary = program.context["image"]?.[name];
      if (ordinary && !state.story?.structDefinitions?.["layered_image"]?.[name]) {
        const firstUri = raster.origins[name]!;
        const otherUri = ordinary.uri ?? program.uri;
        this.pushAssetCollisionDiagnostic(program, firstUri, otherUri, "image", name);
        this.pushAssetCollisionDiagnostic(program, otherUri, firstUri, "image", name);
      }
      if (!program.context["image"]?.[name] && !program.context["layered_image"]?.[name]) {
        (program.context["layered_image"] ??= {})[name] = image;
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

  /** The filtered image every SVG, inline-data or vocabulary-carrying image
   *  implies, so it only displays default layers by default. Derived from the
   *  project's files, so it is assembled with the shared base context (#654)
   *  rather than per compile. */
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
          program.context[implicitType] ??= {};
          if (!program.context[implicitType][name]) {
            program.context[implicitType][name] = {
              $type: implicitType,
              $name: name,
              image: { $type: type, $name: name },
              attributes: [],
            };
          }
        }
      }
    }
    profile("end", this._profilerId, "populateImplicitImageDefs", uri);
  }

  /** The filtered image an attribute directive such as `[[bunny:phone]]`
   *  implies. Derived from scene content, so it is this compile's own: every
   *  entry goes through `addImplicitDef`, which copies the type map out of the
   *  shared base before writing, so a preview compile's speculative entry never
   *  reaches the compile that follows it. */
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
          // Clause parsing can leave trailing whitespace in AssetCommandName.
          // Normalize separators and trim each part without changing its order.
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

  /** Static artwork warnings belong to assets; selection warnings belong to scripts. */
  validateImageAttributes(program: SparkProgram) {
    if (!program.context) return;
    const artworkUri = (image: any, path?: string): string | undefined => {
      if (image?.$type === "layered_image") {
        const reference: any = image.assets?.[path ?? "0"] ?? Object.values(image.assets ?? {})[0];
        const source = reference?.$name ? program.context?.["image"]?.[reference.$name] : undefined;
        if (source?.uri) return source.uri;
      }
      return image?.uri;
    };
    const artworkEmitted = new Set<string>();
    const assetRange = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
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
    for (const uri of Object.keys(program.scripts)) {
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
            const struct = program.context["filtered_image"]?.[selector.name] ?? program.context["layered_image"]?.[selector.name] ?? program.context["image"]?.[selector.name];
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
      const declarations = annotations.declarations.iter();
      while (declarations.value) {
        if (declarations.value.type === "define") {
          const name = doc.read(declarations.from, declarations.to);
          const struct = program.context["filtered_image"]?.[name] ?? program.context["layered_image"]?.[name] ?? program.context["image"]?.[name];
          if (struct) emit(struct, declarations.from, declarations.to);
        }
        declarations.next();
      }
    }
  }

  /** Morph declarations are checked after inheritance, against the artwork. */
  validateMorphs(program: SparkProgram) {
    if (!program.context) return;
    const uri = program.uri;
    profile("start", this._profilerId, "validateMorphs", uri);
    const scripts: (MorphScript & { uri: string })[] = [];
    for (const scriptUri of Object.keys(program.scripts)) {
      const doc = this.documents.get(scriptUri);
      const tree = this.documents.tree(scriptUri);
      if (!doc || !tree) continue;
      scripts.push({
        uri: scriptUri,
        read: (from, to) => doc.read(from, to),
        position: (offset) => doc.positionAt(offset),
        tree,
      });
    }
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

  validateReferences(program: SparkProgram) {
    const uri = program.uri;
    profile("start", this._profilerId, "validateReferences", uri);
    // A typed define can itself be a parent without having a $default entry.
    // Collect declarations across the participating scripts, not context keys:
    // context also contains file-derived assets and unrelated builtin values.
    // Rebuild per compile so included-file edits cannot leave stale names.
    const declaredParentTypes = new Set<string>();
    for (const scriptUri of Object.keys(program.scripts)) {
      const doc = this.documents.get(scriptUri);
      const tree = this.documents.tree(scriptUri);
      if (!doc || !tree) continue;
      const declarations = this.documents
        .annotations(scriptUri).declarations.iter();
      while (declarations.value) {
        if (declarations.value.type === "define") {
          // The declaration channel also labels structural style/screen/etc.
          // instances as "define". Only an OOP define's own header introduces
          // a parent type; an enclosing define body is not sufficient.
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
        ? [
            declaration.modifier,
            declaration.type,
            declaration.name,
            declaration.property ?? "",
          ].join("\u0000")
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
            } else if (
              reference.declaration === "define_type_name" &&
              selector?.types?.some((type) => declaredParentTypes.has(type))
            ) {
              // Valid declared parent; navigation still uses $default when present.
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

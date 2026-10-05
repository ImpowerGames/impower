/** This contract contains no native pointers, memory views, or WASM encoding. */
export type AnalysisMode = "strict" | "nonstrict" | "nocheck";
export type AnalysisStatus = "ok" | "cancelled" | "deadline" | "memory-limit" | "error" | "requires-reset";
export interface AnalysisConfiguration {
  mode: AnalysisMode;
  /** Official type-function VM allocation budget. Linear memory is separately capped at 256 MiB. */
  typeFunctionHeapBytes?: number;
}
export interface AnalysisPosition { line: number; column: number }
export interface AnalysisRange { start: AnalysisPosition; end: AnalysisPosition }
export interface AnalysisDiagnostic {
  module: string;
  documentVersion: number;
  code: number;
  /** Exact pinned native error variant, independent of printed message text. */
  kind: string;
  unknownSymbol?: { name: string; context: "binding" | "type" };
  /** Original authoritative converter parse-error ordinal, if this came from that input. */
  parseErrorOrdinal?: number;
  message: string;
  /** Zero-based UTF-16 positions. */
  range: AnalysisRange;
}
/** Converter facts, independent of the native allocator and worker transport.
 * Arrays carrying values use the schema's explicit tags; local/node references
 * are record indices, never native pointers. */
export type AnalysisAstValue = null | boolean | number | string | AnalysisAstValue[];
export interface AnalysisAst {
  schemaVersion: 2;
  positionEncoding: "utf16";
  root: number;
  layouts: string[][];
  nodes: AnalysisAstValue[][];
  locals: AnalysisAstValue[][];
  errors: { range: { begin: [number, number]; end: [number, number] }; message: string; malformed?: "type" | "annotation" | "expression" | "statement" }[];
  hotcomments: { range: { begin: [number, number]; end: [number, number] }; header: boolean; content: string }[];
  commentLocations: { kind: "Comment" | "BlockComment" | "BrokenComment"; range: { begin: [number, number]; end: [number, number] } }[];
}
export interface AnalysisSourceDocument { module: string; version: number; kind?: "source"; source: string }
/** AST locations already use UTF-16, including parse errors and hotcomments. */
export interface AnalysisAstDocument { module: string; version: number; kind: "ast"; ast: AnalysisAst }
export type AnalysisDocument = AnalysisSourceDocument | AnalysisAstDocument;
export interface AnalysisDefinition { name: string; version: number; source: string }
/** Explicit Sparkdown program names use the existing any semantics. Builtins remain inherited. */
export interface AnalysisProgramEnvironment { version: number; values: string[]; types: string[] }
/** Scope inheritance is independent of require edges and AST content versions. */
export interface AnalysisScopeLink { module: string; version: number; prelude: string }
/** A file's frontmatter/default mode; a genuine file header retains official precedence. */
export interface AnalysisDocumentMode { module: string; version: number; mode: AnalysisMode }
/** Display/source identity is independent of opaque native module and AST versions. */
export interface AnalysisModuleIdentity { module: string; version: number; sourceUri: string }
/** Explicit host resolution; absent targets remain real missing modules, never placeholders. */
export interface AnalysisModuleResolution {
  module: string; version: number;
  /** Target display identity survives a missing/deleted target with its importer. */
  resolutions: { specifier: string; targetModule: string; targetSourceUri: string }[];
}
export interface AnalysisUpdate {
  /** Strictly increasing, even when bytes are unchanged. */
  projectVersion: number;
  documents?: AnalysisDocument[];
  removeDocuments?: string[];
  /** Applied as one batch. New definitions append in array order; replacements retain registration order.
   * Definition types referenced by later files must be registered earlier. Removals follow additions. */
  definitions?: AnalysisDefinition[];
  removeDefinitions?: string[];
  configuration?: AnalysisConfiguration;
  programEnvironment?: AnalysisProgramEnvironment;
  scopeLinks?: AnalysisScopeLink[];
  removeScopeLinks?: string[];
  documentModes?: AnalysisDocumentMode[];
  removeDocumentModes?: string[];
  moduleIdentities?: AnalysisModuleIdentity[];
  removeModuleIdentities?: string[];
  moduleResolutions?: AnalysisModuleResolution[];
  removeModuleResolutions?: string[];
}
export interface AnalysisTiming {
  initializationMs: number;
  checkingMs: number;
  encodingMs: number;
  transferMs: number;
  totalMs: number;
  inputBytes: number;
  outputBytes: number;
  linearMemoryBytes: number;
}
export interface AnalysisOutcome {
  sessionId: string;
  status: AnalysisStatus;
  projectVersion: number;
  message?: string;
  timings: AnalysisTiming;
  /** Failure diagnostics (including definition parse/type errors); success check diagnostics are a complete snapshot. */
  diagnostics?: AnalysisDiagnostic[];
  /** Actual work performed by this operation, separate from host timing/bytes. */
  work?: { changedInputs: number; decodedInputs: number; parsedModules: number };
}
export interface AnalysisRequest { deadlineMs?: number; signal?: AbortSignal }
export interface AnalysisHandle { sessionId: string; module: string; documentVersion: number; projectVersion: number }
export interface AnalysisCheckResult extends AnalysisOutcome {
  diagnostics: AnalysisDiagnostic[];
  /** Replace all previous diagnostics for these documents, including when diagnostics is empty (e.g. nocheck). */
  replacementDocuments: AnalysisHandle[];
  documents: AnalysisHandle[];
  checkedModules: number;
  /** Per-session opaque generations; meaningful only with this result's session/project revision. */
  scopeGenerations: { module: string; generation: number }[];
  /** Effective source-fact revisions, independent of retained semantic scopes. */
  scopeMetadataGenerations: { module: string; generation: number }[];
  /** Native map sizes at result creation, before any error-triggered session reset.
   * installedInputs counts source entries; retainedAstInputs counts decoded AST entries.
   * These are opaque retention counts, not checked-module or graph exports. */
  nativeRetention: { installedInputs: number; retainedAstInputs: number; snapshots: number; flowOwners: number; leases: number };
}
export interface AnalysisQueryResult extends AnalysisOutcome { type: string | null; truncated: boolean }
/** Copied authored source metadata, never native graph handles. The range was
 * normalized against its originating input, so it always uses UTF16 columns. */
export interface AnalysisSourceField {
  kind: "definition" | "name" | "vararg" | "parameter" | "alias-definition" | "alias-name"
    | "table-definition" | "property-location" | "property-type-location";
  name: string;
  index: number;
  module: string;
  /** Opaque originating-input generation, meaningful only with this result's
   * session/project revision (native generations can restart after reset). */
  sourceGeneration: number;
  range: AnalysisRange;
}
export interface AnalysisSourceFacts { complete: boolean; fields: readonly AnalysisSourceField[] }
export interface AnalysisSourceQueryResult extends AnalysisOutcome {
  /** False for union/overload selection or unavailable/ambiguous provenance.
   * This seam never silently chooses one callable arm. */
  supported: boolean;
  /** Original immutable graph revision, already normalized using that input. */
  origin: AnalysisSourceFacts | null;
  /** Immutable effective source view after proven semantic equivalence. Its
   * positions may come from a newer input than the retained graph's origin. */
  effective: AnalysisSourceFacts | null;
  truncated: boolean;
}
/** Select one actual installed root namespace entry, independently of cursor
 * value selection or an alias's possibly shared underlying builtin TypeId. */
export interface AnalysisScopeSourceSelector { namespace: "alias" | "value"; name: string }
export interface AnalysisScopeSourceQueryResult extends AnalysisSourceQueryResult { selector: Readonly<AnalysisScopeSourceSelector> }
export interface AnalysisProject {
  readonly projectVersion: number;
  readonly initialization: AnalysisTiming;
  update(update: AnalysisUpdate, request?: AnalysisRequest): Promise<AnalysisOutcome>;
  check(module: string, request?: AnalysisRequest): Promise<AnalysisCheckResult>;
  /** Requested roots are checked in order; linked preludes are prepared before their consumers. */
  checkModules(modules: readonly string[], request?: AnalysisRequest): Promise<AnalysisCheckResult>;
  /** Inferred value type; a pack-valued expression displays its first return (empty packs return null). */
  queryType(handle: AnalysisHandle, position: AnalysisPosition, maxLength?: number, request?: AnalysisRequest): Promise<AnalysisQueryResult>;
  /** Source facts for the same selected value as queryType. Null means no
   * authored callable metadata or no unambiguous retained origin. No UI policy
   * or definition-navigation behavior is implied by this bounded observation. */
  querySourceMetadata(handle: AnalysisHandle, position: AnalysisPosition, maxFields?: number, request?: AnalysisRequest): Promise<AnalysisSourceQueryResult>;
  /** Bounded copied declaration and direct property source facts for an exact
   * root alias/table entry. These are not recursive graph metadata. Unknown,
   * merged or unrecorded origins are unsupported; this does not navigate
   * references. A field bound sets truncated and clears facts.complete. */
  queryScopeSourceMetadata(handle: AnalysisHandle, selector: AnalysisScopeSourceSelector, maxFields?: number, request?: AnalysisRequest): Promise<AnalysisScopeSourceQueryResult>;
  /** Reinitialize after interruption or native failure. Retains registered inputs and configuration. */
  reset(request?: AnalysisRequest): Promise<AnalysisOutcome>;
  dispose(): Promise<void>;
}
export interface AnalysisBackend {
  /** Initialization failure rejects explicitly; no unchecked project is returned. */
  createProject(configuration: AnalysisConfiguration, request?: AnalysisRequest): Promise<AnalysisProject>;
}

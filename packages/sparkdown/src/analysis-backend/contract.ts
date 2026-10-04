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
  message: string;
  /** Zero-based UTF-16 positions. */
  range: AnalysisRange;
}
export interface AnalysisDocument { module: string; version: number; source: string }
export interface AnalysisDefinition { name: string; version: number; source: string }
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
}
export interface AnalysisRequest { deadlineMs?: number; signal?: AbortSignal }
export interface AnalysisHandle { sessionId: string; module: string; documentVersion: number; projectVersion: number }
export interface AnalysisCheckResult extends AnalysisOutcome {
  diagnostics: AnalysisDiagnostic[];
  /** Replace all previous diagnostics for these documents, including when diagnostics is empty (e.g. nocheck). */
  replacementDocuments: AnalysisHandle[];
  documents: AnalysisHandle[];
  checkedModules: number;
}
export interface AnalysisQueryResult extends AnalysisOutcome { type: string | null; truncated: boolean }
export interface AnalysisProject {
  readonly projectVersion: number;
  readonly initialization: AnalysisTiming;
  update(update: AnalysisUpdate, request?: AnalysisRequest): Promise<AnalysisOutcome>;
  check(module: string, request?: AnalysisRequest): Promise<AnalysisCheckResult>;
  queryType(handle: AnalysisHandle, position: AnalysisPosition, maxLength?: number, request?: AnalysisRequest): Promise<AnalysisQueryResult>;
  /** Reinitialize after interruption or native failure. Retains registered inputs and configuration. */
  reset(request?: AnalysisRequest): Promise<AnalysisOutcome>;
  dispose(): Promise<void>;
}
export interface AnalysisBackend {
  /** Initialization failure rejects explicitly; no unchecked project is returned. */
  createProject(configuration: AnalysisConfiguration, request?: AnalysisRequest): Promise<AnalysisProject>;
}

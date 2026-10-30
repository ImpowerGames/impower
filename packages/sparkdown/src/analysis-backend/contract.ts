export type AnalysisMode = "strict" | "nonstrict" | "nocheck";
export type AnalysisStatus = "ok" | "cancelled" | "deadline" | "memory-limit" | "error" | "requires-reset";
export interface AnalysisConfiguration {
  mode: AnalysisMode;
  typeFunctionHeapBytes?: number;
}
export interface AnalysisPosition { line: number; column: number }
export interface AnalysisRange { start: AnalysisPosition; end: AnalysisPosition }
export interface AnalysisDiagnostic {
  module: string;
  documentVersion: number;
  code: number;
  message: string;
  range: AnalysisRange;
}
export interface AnalysisDocument { module: string; version: number; source: string }
export interface AnalysisDefinition { name: string; version: number; source: string }
export interface AnalysisUpdate {
  projectVersion: number;
  documents?: AnalysisDocument[];
  removeDocuments?: string[];
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
  diagnostics?: AnalysisDiagnostic[];
}
export interface AnalysisRequest { deadlineMs?: number; signal?: AbortSignal }
export interface AnalysisHandle { sessionId: string; module: string; documentVersion: number; projectVersion: number }
export interface AnalysisCheckResult extends AnalysisOutcome {
  diagnostics: AnalysisDiagnostic[];
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
  reset(request?: AnalysisRequest): Promise<AnalysisOutcome>;
  dispose(): Promise<void>;
}
export interface AnalysisBackend {
  createProject(configuration: AnalysisConfiguration, request?: AnalysisRequest): Promise<AnalysisProject>;
}

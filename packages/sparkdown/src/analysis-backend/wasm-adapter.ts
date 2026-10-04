import type {
  AnalysisBackend, AnalysisCheckResult, AnalysisConfiguration, AnalysisDefinition, AnalysisDocument,
  AnalysisHandle, AnalysisOutcome, AnalysisPosition, AnalysisProject, AnalysisQueryResult,
  AnalysisRequest, AnalysisStatus, AnalysisTiming, AnalysisUpdate,
} from "./contract";

/** Internal transport boundary; host loaders own worker and artifact mechanics. */
export interface AnalysisTransport {
  send(message: unknown): void;
  listen(receive: (message: WorkerResult) => void, fail: (message: string) => void): void;
  terminate(): Promise<void>;
}
interface WorkerResult { id: number; body: string; initializationMs: number; checkingMs: number; encodingMs: number; workerMs: number; inputBytes: number; outputBytes: number; linearMemoryBytes: number }
interface NativeResult {
  status: AnalysisStatus; message?: string; diagnostics?: Array<{ module: string; code: number; message: string; range: { start: AnalysisPosition; end: AnalysisPosition } }>;
  checkedModules?: number; modules?: string[]; type?: string | null; truncated?: boolean; timings: AnalysisTiming;
}
const emptyTiming = (): AnalysisTiming => ({ initializationMs: 0, checkingMs: 0, encodingMs: 0, transferMs: 0, totalMs: 0, inputBytes: 0, outputBytes: 0, linearMemoryBytes: 0 });
const sourceMetadata = new WeakMap<object, { bytes: number; lines: string[] }>();
function metadata(d: { source: string }) {
  let info = sourceMetadata.get(d);
  if (!info) { info = { bytes: new TextEncoder().encode(d.source).length, lines: d.source.split("\n") }; sourceMetadata.set(d, info); }
  return info;
}
const mode = { nocheck: 0, nonstrict: 1, strict: 2 };
const DEFAULT_HEAP = 16 * 1024 * 1024;
function validateConfiguration(c: AnalysisConfiguration) {
  if (c.mode !== "strict" && c.mode !== "nonstrict" && c.mode !== "nocheck") throw Error("Unsupported analysis mode");
  const heap = c.typeFunctionHeapBytes ?? DEFAULT_HEAP;
  if (!Number.isSafeInteger(heap) || heap < 1024 * 1024 || heap > 128 * 1024 * 1024) throw Error("Type-function heap must be 1 MiB to 128 MiB");
}
function validateName(name: string) {
  if (!name || name.includes("\0") || name.length > 4096) throw Error("Invalid module/definition name");
}
function validateInput(d: AnalysisDocument | AnalysisDefinition, previous?: { version: number }) {
  validateName("module" in d ? d.module : d.name);
  if (!Number.isSafeInteger(d.version) || d.version < 0 || (previous && d.version <= previous.version)) throw Error("Document/definition versions must increase");
  if (d.source.includes("\0") || metadata(d).bytes > 8 * 1024 * 1024) throw Error("Source exceeds input limits");
}
function byteColumn(source: { source: string }, p: AnalysisPosition): number {
  const line = metadata(source).lines[p.line];
  if (line === undefined || p.column > line.length) throw Error("Position is outside the document");
  return new TextEncoder().encode(line.slice(0, p.column)).length;
}
function utf16Position(source: { source: string }, p: AnalysisPosition): AnalysisPosition {
  const line = metadata(source).lines[p.line] ?? "";
  const bytes = new TextEncoder().encode(line);
  return { line: p.line, column: new TextDecoder().decode(bytes.slice(0, p.column)).length };
}
class WasmProject implements AnalysisProject {
  private readonly sessionId = crypto.randomUUID();
  projectVersion = 0;
  initialization = emptyTiming();
  private documents = new Map<string, AnalysisDocument>();
  private definitions = new Map<string, AnalysisDefinition>();
  private transport?: AnalysisTransport;
  private failed = false;
  private disposed = false;
  private serial: Promise<unknown> = Promise.resolve();
  private id = 0;
  private pending?: { id: number; resolve: (r: NativeResult) => void; start: number; timer: ReturnType<typeof setTimeout>; cleanup: () => void };
  private checked = new Set<string>();
  private closing: Promise<void> = Promise.resolve();
  private terminationError?: string;
  constructor(private configuration: AnalysisConfiguration, private createTransport: () => AnalysisTransport) { validateConfiguration(configuration); }
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.serial.then(operation);
    this.serial = next.catch(() => {});
    return next;
  }
  private diagnostics(r: NativeResult, documents = this.documents, definitions = this.definitions) {
    return (r.diagnostics ?? []).map(d => {
      const source = documents.get(d.module) ?? definitions.get(d.module);
      return { ...d, documentVersion: source?.version ?? -1, range: { start: utf16Position(source ?? { source: "" }, d.range.start), end: utf16Position(source ?? { source: "" }, d.range.end) } };
    });
  }
  private outcome(r: NativeResult, documents = this.documents, definitions = this.definitions): AnalysisOutcome { return { sessionId: this.sessionId, status: r.status, projectVersion: this.projectVersion, ...(r.message ? { message: r.message } : {}), ...(r.diagnostics ? { diagnostics: this.diagnostics(r, documents, definitions) } : {}), timings: r.timings }; }
  private unavailable(): NativeResult | undefined {
    if (this.disposed) return { status: "error", message: "Project is disposed", timings: emptyTiming() };
    if (this.failed) return { status: "requires-reset", message: "Reset after interruption or native failure", timings: emptyTiming() };
    return undefined;
  }
  private async stop(status: AnalysisStatus, message?: string) {
    const pending = this.pending;
    this.pending = undefined;
    this.failed = true;
    this.checked.clear();
    const transport = this.transport;
    this.transport = undefined;
    if (pending) { clearTimeout(pending.timer); pending.cleanup(); }
    if (transport) this.closing = this.closing.then(() => transport.terminate()).catch(error => { this.terminationError = String(error); });
    await this.closing;
    if (pending) pending.resolve({ status: this.terminationError ? "error" : status,
      message: this.terminationError ? `Worker termination failed: ${this.terminationError}` : message,
      timings: { ...emptyTiming(), totalMs: performance.now() - pending.start } });
  }
  private async request(operation: string, payload: unknown, options: AnalysisRequest = {}): Promise<NativeResult> {
    if (options.signal?.aborted) { await this.stop("cancelled"); return { status: "cancelled", timings: emptyTiming() }; }
    const deadline = options.deadlineMs ?? (operation === "initialize" ? 10000 : 2000);
    if (!Number.isFinite(deadline) || deadline <= 0 || deadline > 60000) throw Error("Deadline must be greater than zero and at most 60 seconds");
    if (!this.transport) throw Error("Transport is not initialized");
    return new Promise(resolve => {
      const id = ++this.id;
      const abort = () => { void this.stop("cancelled"); };
      const start = performance.now();
      this.pending = { id, resolve, start, timer: setTimeout(() => { void this.stop("deadline"); }, deadline), cleanup: () => options.signal?.removeEventListener("abort", abort) };
      options.signal?.addEventListener("abort", abort, { once: true });
      try { this.transport!.send({ id, operation, payload }); }
      catch (error) { void this.stop("error", String(error)); }
    });
  }
  async initialize(options?: AnalysisRequest): Promise<NativeResult> {
    await this.stop("cancelled", "Project reinitializing");
    if (this.terminationError) return { status: "error", message: `Worker termination failed: ${this.terminationError}`, timings: emptyTiming() };
    if (this.disposed) return { status: "error", message: "Project is disposed", timings: emptyTiming() };
    const transport = this.createTransport();
    this.transport = transport;
    transport.listen(message => {
      if (this.transport !== transport) return;
      const pending = this.pending;
      if (!pending || message.id !== pending.id) return;
      this.pending = undefined;
      clearTimeout(pending.timer); pending.cleanup();
      const totalMs = performance.now() - pending.start;
      try {
        const parsed = JSON.parse(message.body);
        if (parsed.status !== "ok") { this.failed = true; this.checked.clear(); }
        pending.resolve({ ...parsed, timings: { initializationMs: message.initializationMs, checkingMs: message.checkingMs,
          encodingMs: message.encodingMs, transferMs: Math.max(0, totalMs - message.workerMs), totalMs,
          inputBytes: message.inputBytes, outputBytes: message.outputBytes, linearMemoryBytes: message.linearMemoryBytes } });
      } catch (error) {
        this.failed = true;
        pending.resolve({ status: "error", message: String(error), timings: emptyTiming() });
      }
    }, message => { if (this.transport === transport) void this.stop(/ERR_WORKER_OUT_OF_MEMORY|Aborted\(OOM\)/i.test(message) ? "memory-limit" : "error", message); });
    let r: NativeResult;
    try { r = await this.request("initialize", { mode: mode[this.configuration.mode], heap: this.configuration.typeFunctionHeapBytes ?? DEFAULT_HEAP }, options); }
    catch (error) { await this.stop("error", String(error)); throw error; }
    this.failed = r.status !== "ok";
    this.initialization = { ...r.timings };
    return r;
  }
  private async hydrate(options?: AnalysisRequest): Promise<NativeResult> {
    const r = await this.initialize(options);
    if (r.status !== "ok") return r;
    let hydrated: NativeResult;
    try { hydrated = await this.request("update", { documents: [...this.documents.values()], definitions: [...this.definitions.values()] }, options); }
    catch (error) { await this.stop("error", String(error)); throw error; }
    if (hydrated.status !== "ok") { this.failed = true; this.checked.clear(); }
    hydrated.timings.initializationMs += r.timings.initializationMs;
    hydrated.timings.totalMs += r.timings.totalMs;
    hydrated.timings.transferMs += r.timings.transferMs;
    hydrated.timings.encodingMs += r.timings.encodingMs;
    hydrated.timings.inputBytes += r.timings.inputBytes;
    hydrated.timings.outputBytes += r.timings.outputBytes;
    return hydrated;
  }
  update(update: AnalysisUpdate, options?: AnalysisRequest): Promise<AnalysisOutcome> {
    update = { ...update, documents: update.documents?.map(d => ({ ...d })), definitions: update.definitions?.map(d => ({ ...d })),
      removeDocuments: update.removeDocuments?.slice(), removeDefinitions: update.removeDefinitions?.slice(), configuration: update.configuration ? { ...update.configuration } : undefined };
    return this.enqueue(async () => {
      const start = performance.now();
      const unavailable = this.unavailable(); if (unavailable) return this.outcome(unavailable);
      if (!Number.isSafeInteger(update.projectVersion) || update.projectVersion <= this.projectVersion) throw Error("Project versions must increase");
      if (update.configuration) validateConfiguration(update.configuration);
      const documents = new Map(this.documents), definitions = new Map(this.definitions);
      for (const d of update.documents ?? []) { const copy = { ...d }; validateInput(copy, documents.get(copy.module)); documents.set(copy.module, copy); }
      for (const d of update.definitions ?? []) { const copy = { ...d }; validateInput(copy, definitions.get(copy.name)); definitions.set(copy.name, copy); }
      for (const name of update.removeDocuments ?? []) { validateName(name); documents.delete(name); }
      for (const name of update.removeDefinitions ?? []) { validateName(name); definitions.delete(name); }
      const totalBytes = [...documents.values(), ...definitions.values()].reduce((n, d) => n + metadata(d).bytes, 0);
      if (totalBytes > 64 * 1024 * 1024) throw Error("Project source budget exceeded");
      let r: NativeResult;
      if (update.configuration) {
        const previous = this.configuration;
        this.configuration = { ...update.configuration };
        try {
          r = await this.hydrate(options);
          if (r.status === "ok") {
            const hydrated = r;
            r = await this.request("update", update, options);
            r.timings.initializationMs += hydrated.timings.initializationMs;
            r.timings.transferMs += hydrated.timings.transferMs;
            r.timings.encodingMs += hydrated.timings.encodingMs;
            r.timings.inputBytes += hydrated.timings.inputBytes;
            r.timings.outputBytes += hydrated.timings.outputBytes;
          }
          if (r.status !== "ok") this.configuration = previous;
        } catch (error) { this.configuration = previous; throw error; }
      } else r = await this.request("update", update, options);
      if (r.status === "ok") { this.documents = documents; this.definitions = definitions; this.projectVersion = update.projectVersion; this.checked.clear(); }
      else { this.failed = true; this.checked.clear(); }
      // Update diagnostics originate from definition loading, even when a document shares its ID.
      const result = this.outcome(r, new Map(), definitions);
      result.timings.totalMs = performance.now() - start;
      return result;
    });
  }
  check(module: string, options?: AnalysisRequest): Promise<AnalysisCheckResult> {
    return this.enqueue(async () => {
      const start = performance.now();
      validateName(module);
      const unavailable = this.unavailable();
      const r = unavailable ?? (this.documents.has(module)
        ? await this.request("check", { module, seconds: (options?.deadlineMs ?? 2000) / 1000 * 2 }, options)
        : { status: "error" as const, message: "Missing root module", timings: emptyTiming() });
      const handles = r.status === "ok" ? (r.modules ?? [module]).flatMap(name => {
        const document = this.documents.get(name);
        return document ? [{ sessionId: this.sessionId, module: name, documentVersion: document.version, projectVersion: this.projectVersion }] : [];
      }) : [];
      if (r.status === "ok") for (const h of handles) this.checked.add(h.module);
      const result = { ...this.outcome(r), checkedModules: r.checkedModules ?? 0,
        diagnostics: this.diagnostics(r), replacementDocuments: handles, documents: handles,
      };
      result.timings.totalMs = performance.now() - start;
      return result;
    });
  }
  queryType(handle: AnalysisHandle, position: AnalysisPosition, maxLength = 4096, options?: AnalysisRequest): Promise<AnalysisQueryResult> {
    handle = { ...handle };
    position = { ...position };
    return this.enqueue(async () => {
      const start = performance.now();
      const unavailable = this.unavailable();
      const document = this.documents.get(handle.module);
      if (handle.sessionId !== this.sessionId || handle.projectVersion !== this.projectVersion || handle.documentVersion !== document?.version || !this.checked.has(handle.module)) throw Error("Stale or unchecked analysis handle");
      if (![position.line, position.column].every(n => Number.isSafeInteger(n) && n >= 0) || !Number.isSafeInteger(maxLength) || maxLength < 1 || maxLength > 65536) throw Error("Invalid query bounds");
      const r = unavailable ?? await this.request("query", { module: handle.module, line: position.line, column: byteColumn(document!, position), maxLength }, options);
      const result = { ...this.outcome(r), type: r.type ?? null, truncated: r.truncated ?? false };
      result.timings.totalMs = performance.now() - start;
      return result;
    });
  }
  reset(options?: AnalysisRequest): Promise<AnalysisOutcome> {
    return this.enqueue(async () => {
      if (this.disposed) return this.outcome({ status: "error", message: "Project is disposed", timings: emptyTiming() });
      this.checked.clear(); this.projectVersion++;
      return this.outcome(await this.hydrate(options));
    });
  }
  async dispose(): Promise<void> {
    this.disposed = true; await this.stop("cancelled", "Project disposed"); this.documents.clear(); this.definitions.clear();
    if (this.terminationError) throw Error(`Worker termination failed: ${this.terminationError}`);
  }
}
export function createWasmAnalysisBackend(createTransport: () => AnalysisTransport): AnalysisBackend {
  return { async createProject(configuration, request) {
    const project = new WasmProject({ ...configuration }, createTransport);
    const r = await project.initialize(request);
    if (r.status !== "ok") { await project.dispose(); throw Error(`Analysis initialization failed (${r.status}): ${r.message ?? ""}`); }
    return project;
  } };
}

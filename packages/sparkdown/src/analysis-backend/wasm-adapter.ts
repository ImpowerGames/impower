import type {
  AnalysisAstDocument, AnalysisBackend, AnalysisCheckResult, AnalysisConfiguration, AnalysisDefinition, AnalysisDocument,
  AnalysisHandle, AnalysisOutcome, AnalysisPosition, AnalysisProject, AnalysisQueryResult,
  AnalysisRequest, AnalysisStatus, AnalysisTiming, AnalysisUpdate,
  AnalysisProgramEnvironment, AnalysisScopeLink, AnalysisDocumentMode,
  AnalysisDiagnostic, AnalysisModuleIdentity, AnalysisModuleResolution,
  AnalysisSourceFacts, AnalysisSourceQueryResult, AnalysisScopeSourceSelector, AnalysisScopeSourceQueryResult,
} from "./contract";

/** Internal transport boundary; host loaders own worker and artifact mechanics. */
export interface AnalysisTransport {
  send(message: unknown): void;
  listen(receive: (message: WorkerResult) => void, fail: (message: string) => void): void;
  terminate(): Promise<void>;
}
interface WorkerResult { id: number; body: string; initializationMs: number; checkingMs: number; encodingMs: number; workerMs: number; inputBytes: number; outputBytes: number; linearMemoryBytes: number }
interface NativeResult {
  status: AnalysisStatus; message?: string; diagnostics?: Omit<AnalysisDiagnostic, "documentVersion">[];
  checkedModules?: number; modules?: string[]; type?: string | null; truncated?: boolean; timings: AnalysisTiming;
  work?: AnalysisOutcome["work"];
  scopeGenerations?: AnalysisCheckResult["scopeGenerations"];
  scopeMetadataGenerations?: AnalysisCheckResult["scopeMetadataGenerations"];
  nativeRetention?: AnalysisCheckResult["nativeRetention"];
  origin?: AnalysisSourceFacts | null; effective?: AnalysisSourceFacts | null; supported?: boolean;
}
const emptyTiming = (): AnalysisTiming => ({ initializationMs: 0, checkingMs: 0, encodingMs: 0, transferMs: 0, totalMs: 0, inputBytes: 0, outputBytes: 0, linearMemoryBytes: 0 });
const sourceMetadata = new WeakMap<object, { bytes: number; lines: string[] }>();
const astMetadata = new WeakMap<object, { bytes: number; encoded: string }>();
function isAst(d: AnalysisDocument | AnalysisDefinition): d is AnalysisAstDocument { return "kind" in d && d.kind === "ast"; }
function astInfo(d: AnalysisAstDocument) {
  let info = astMetadata.get(d);
  if (!info) {
    const encoded = JSON.stringify(d.ast);
    info = { bytes: new TextEncoder().encode(encoded).length, encoded };
    astMetadata.set(d, info);
  }
  return info;
}
function snapshotDocument(d: AnalysisDocument): AnalysisDocument {
  if (!isAst(d)) return { ...d };
  // Capture before enqueueing: caller mutations must not change the retained
  // reset input or the bytes checked under this document version.
  const info = astInfo({ ...d });
  if (info.bytes > 16 * 1024 * 1024) throw Error("AST exceeds input limits");
  const copy = { ...d, ast: JSON.parse(info.encoded) };
  astMetadata.set(copy, info);
  return copy;
}
function wireDocument(d: AnalysisDocument) {
  return isAst(d) ? { module: d.module, version: d.version, kind: "ast", encoded: astInfo(d).encoded } : d;
}
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
  if (isAst(d)) {
    const a = d.ast;
    if (!a || a.schemaVersion !== 2 || a.positionEncoding !== "utf16" || !Number.isSafeInteger(a.root)
      || !Array.isArray(a.layouts) || !Array.isArray(a.nodes) || !Array.isArray(a.locals)
      || !Array.isArray(a.errors) || !Array.isArray(a.hotcomments) || !Array.isArray(a.commentLocations) || a.commentLocations.length > 100000
      || a.root < 0 || a.root >= a.nodes.length || a.nodes.length + a.locals.length > 100000)
      throw Error("Unsupported or invalid AST input");
    const root = a.nodes[a.root]!;
    if (!Array.isArray(root) || root.length < 5 || !root.slice(1, 5).every(n => typeof n === "number" && Number.isSafeInteger(n) && n >= 0))
      throw Error("Invalid AST location bounds");
    if (astInfo(d).bytes > 16 * 1024 * 1024) throw Error("AST exceeds input limits");
  } else if (d.source.includes("\0") || metadata(d).bytes > 8 * 1024 * 1024) throw Error("Source exceeds input limits");
}
function inputBytes(d: AnalysisDocument | AnalysisDefinition): number { return isAst(d) ? astInfo(d).bytes : metadata(d).bytes; }
function queryColumn(d: AnalysisDocument, p: AnalysisPosition): number {
  if (!isAst(d)) return byteColumn(d, p);
  const root = d.ast.nodes[d.ast.root]!;
  const beginLine = root[1] as number, beginColumn = root[2] as number;
  const endLine = root[3] as number, endColumn = root[4] as number;
  if (p.line < beginLine || p.line > endLine || (p.line === beginLine && p.column < beginColumn)
    || (p.line === endLine && p.column > endColumn)) throw Error("Position is outside the document");
  return p.column;
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
  private programEnvironment?: AnalysisProgramEnvironment;
  private scopeLinks = new Map<string, AnalysisScopeLink>();
  private documentModes = new Map<string, AnalysisDocumentMode>();
  private moduleIdentities = new Map<string, AnalysisModuleIdentity>();
  private moduleResolutions = new Map<string, AnalysisModuleResolution>();
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
      return { ...d, documentVersion: source?.version ?? -1, range: source && isAst(source) ? d.range
        : { start: utf16Position(source ?? { source: "" }, d.range.start), end: utf16Position(source ?? { source: "" }, d.range.end) } };
    });
  }
  private outcome(r: NativeResult, documents = this.documents, definitions = this.definitions): AnalysisOutcome { return { sessionId: this.sessionId, status: r.status, projectVersion: this.projectVersion, ...(r.message ? { message: r.message } : {}), ...(r.diagnostics ? { diagnostics: this.diagnostics(r, documents, definitions) } : {}), ...(r.work ? { work: r.work } : {}), timings: r.timings }; }
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
    try { hydrated = await this.request("update", { documents: [...this.documents.values()].map(wireDocument), definitions: [...this.definitions.values()],
      programEnvironment: this.programEnvironment, scopeLinks: [...this.scopeLinks.values()], documentModes: [...this.documentModes.values()],
      moduleIdentities: [...this.moduleIdentities.values()], moduleResolutions: [...this.moduleResolutions.values()] }, options); }
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
    update = { ...update, documents: update.documents?.map(snapshotDocument), definitions: update.definitions?.map(d => ({ ...d })),
      removeDocuments: update.removeDocuments?.slice(), removeDefinitions: update.removeDefinitions?.slice(), configuration: update.configuration ? { ...update.configuration } : undefined,
      programEnvironment: update.programEnvironment ? { ...update.programEnvironment, values: update.programEnvironment.values.slice(), types: update.programEnvironment.types.slice() } : undefined,
      scopeLinks: update.scopeLinks?.map(link => ({ ...link })), removeScopeLinks: update.removeScopeLinks?.slice(),
      documentModes: update.documentModes?.map(m => ({ ...m })), removeDocumentModes: update.removeDocumentModes?.slice(),
      moduleIdentities: update.moduleIdentities?.map(m => ({ ...m })), removeModuleIdentities: update.removeModuleIdentities?.slice(),
      moduleResolutions: update.moduleResolutions?.map(m => ({ ...m, resolutions: m.resolutions.map(r => ({ ...r })) })),
      removeModuleResolutions: update.removeModuleResolutions?.slice() };
    return this.enqueue(async () => {
      const start = performance.now();
      const unavailable = this.unavailable(); if (unavailable) return this.outcome(unavailable);
      if (!Number.isSafeInteger(update.projectVersion) || update.projectVersion <= this.projectVersion) throw Error("Project versions must increase");
      if (update.configuration) validateConfiguration(update.configuration);
      const documents = new Map(this.documents), definitions = new Map(this.definitions);
      const scopeLinks = new Map(this.scopeLinks), documentModes = new Map(this.documentModes);
      const moduleIdentities = new Map(this.moduleIdentities), moduleResolutions = new Map(this.moduleResolutions);
      let programEnvironment = this.programEnvironment;
      const validateVersion = (version: number, previous?: number) => {
        if (!Number.isSafeInteger(version) || version < 0 || (previous !== undefined && version <= previous)) throw Error("Environment/relationship versions must increase");
      };
      if (update.programEnvironment) {
        validateVersion(update.programEnvironment.version, programEnvironment?.version);
        const names = (names: string[]) => { names.forEach(name => {
          validateName(name); if ([...name].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) throw Error("Invalid program binding name");
        }); return [...new Set(names)].sort(); };
        programEnvironment = { ...update.programEnvironment, values: names(update.programEnvironment.values), types: names(update.programEnvironment.types) };
        update.programEnvironment = programEnvironment;
      }
      for (const link of update.scopeLinks ?? []) {
        validateName(link.module); validateName(link.prelude); validateVersion(link.version, scopeLinks.get(link.module)?.version); scopeLinks.set(link.module, link);
      }
      for (const name of update.removeScopeLinks ?? []) { validateName(name); scopeLinks.delete(name); }
      for (const m of update.documentModes ?? []) {
        validateName(m.module); validateConfiguration({ mode: m.mode }); validateVersion(m.version, documentModes.get(m.module)?.version); documentModes.set(m.module, m);
      }
      for (const name of update.removeDocumentModes ?? []) { validateName(name); documentModes.delete(name); }
      for (const identity of update.moduleIdentities ?? []) {
        validateName(identity.module); validateName(identity.sourceUri);
        validateVersion(identity.version, moduleIdentities.get(identity.module)?.version); moduleIdentities.set(identity.module, identity);
      }
      for (const name of update.removeModuleIdentities ?? []) { validateName(name); moduleIdentities.delete(name); }
      for (const resolution of update.moduleResolutions ?? []) {
        validateName(resolution.module); validateVersion(resolution.version, moduleResolutions.get(resolution.module)?.version);
        const specifiers = new Set<string>();
        for (const edge of resolution.resolutions) {
          validateName(edge.specifier); validateName(edge.targetModule); validateName(edge.targetSourceUri);
          if (specifiers.has(edge.specifier)) throw Error("Duplicate module resolution specifier");
          specifiers.add(edge.specifier);
        }
        moduleResolutions.set(resolution.module, resolution);
      }
      for (const name of update.removeModuleResolutions ?? []) { validateName(name); moduleResolutions.delete(name); }
      for (const link of scopeLinks.values()) {
        const visited = new Set<string>([link.module]); let name: string | undefined = link.prelude;
        while (name !== undefined) { if (visited.has(name)) throw Error("Cyclic prelude scope relationship"); visited.add(name); name = scopeLinks.get(name)?.prelude; }
      }
      for (const d of update.documents ?? []) { validateInput(d, documents.get(d.module)); documents.set(d.module, d); }
      for (const d of update.definitions ?? []) { const copy = { ...d }; validateInput(copy, definitions.get(copy.name)); definitions.set(copy.name, copy); }
      for (const name of update.removeDocuments ?? []) { validateName(name); documents.delete(name); scopeLinks.delete(name); documentModes.delete(name); moduleIdentities.delete(name); moduleResolutions.delete(name); }
      const targetLabels = new Map<string, string>();
      for (const resolution of moduleResolutions.values()) for (const edge of resolution.resolutions) {
        const label = targetLabels.get(edge.targetModule);
        if (label !== undefined && label !== edge.targetSourceUri) throw Error("Conflicting target source identities");
        const identity = moduleIdentities.get(edge.targetModule);
        if (identity && identity.sourceUri !== edge.targetSourceUri) throw Error("Resolution target source identity mismatch");
        targetLabels.set(edge.targetModule, edge.targetSourceUri);
      }
      for (const name of update.removeDefinitions ?? []) { validateName(name); definitions.delete(name); }
      const totalBytes = [...documents.values(), ...definitions.values()].reduce((n, d) => n + inputBytes(d), 0);
      const environmentBytes = new TextEncoder().encode(JSON.stringify({ programEnvironment, links: [...scopeLinks.values()], modes: [...documentModes.values()], identities: [...moduleIdentities.values()], resolutions: [...moduleResolutions.values()] })).length;
      if (environmentBytes > 4 * 1024 * 1024) throw Error("Project environment budget exceeded");
      if (totalBytes + environmentBytes > 64 * 1024 * 1024) throw Error("Project source budget exceeded");
      let r: NativeResult;
      if (update.configuration) {
        const previous = this.configuration;
        this.configuration = { ...update.configuration };
        try {
          r = await this.hydrate(options);
          if (r.status === "ok") {
            const hydrated = r;
            r = await this.request("update", { ...update, documents: update.documents?.map(wireDocument) }, options);
            r.timings.initializationMs += hydrated.timings.initializationMs;
            r.timings.transferMs += hydrated.timings.transferMs;
            r.timings.encodingMs += hydrated.timings.encodingMs;
            r.timings.inputBytes += hydrated.timings.inputBytes;
            r.timings.outputBytes += hydrated.timings.outputBytes;
          }
          if (r.status !== "ok") this.configuration = previous;
        } catch (error) { this.configuration = previous; throw error; }
      } else r = await this.request("update", { ...update, documents: update.documents?.map(wireDocument) }, options);
      if (r.status === "ok") { this.documents = documents; this.definitions = definitions; this.programEnvironment = programEnvironment;
        this.scopeLinks = scopeLinks; this.documentModes = documentModes; this.moduleIdentities = moduleIdentities;
        this.moduleResolutions = moduleResolutions; this.projectVersion = update.projectVersion; this.checked.clear(); }
      else { this.failed = true; this.checked.clear(); }
      // Update diagnostics originate from definition loading, even when a document shares its ID.
      const result = this.outcome(r, new Map(), definitions);
      result.timings.totalMs = performance.now() - start;
      return result;
    });
  }
  check(module: string, options?: AnalysisRequest): Promise<AnalysisCheckResult> {
    return this.checkModules([module], options);
  }
  checkModules(modules: readonly string[], options?: AnalysisRequest): Promise<AnalysisCheckResult> {
    modules = [...modules];
    return this.enqueue(async () => {
      const start = performance.now();
      if (!modules.length || modules.length > 100000) throw Error("Invalid analysis root count");
      modules.forEach(validateName);
      const unavailable = this.unavailable();
      const r = unavailable ?? (modules.every(module => this.documents.has(module))
        ? await this.request("check", { modules, seconds: (options?.deadlineMs ?? 2000) / 1000 * 2 }, options)
        : { status: "error" as const, message: "Missing root module", timings: emptyTiming() });
      const handles = r.status === "ok" ? (r.modules ?? modules).flatMap(name => {
        const document = this.documents.get(name);
        return document ? [{ sessionId: this.sessionId, module: name, documentVersion: document.version, projectVersion: this.projectVersion }] : [];
      }) : [];
      if (r.status === "ok") for (const h of handles) this.checked.add(h.module);
      const result = { ...this.outcome(r), checkedModules: r.checkedModules ?? 0,
        scopeGenerations: r.scopeGenerations ?? [], scopeMetadataGenerations: r.scopeMetadataGenerations ?? [],
        nativeRetention: r.nativeRetention ?? { installedInputs: 0, retainedAstInputs: 0, snapshots: 0, flowOwners: 0, leases: 0 },
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
      const r = unavailable ?? await this.request("query", { module: handle.module, line: position.line, column: queryColumn(document!, position), maxLength }, options);
      const result = { ...this.outcome(r), type: r.type ?? null, truncated: r.truncated ?? false };
      result.timings.totalMs = performance.now() - start;
      return result;
    });
  }
  querySourceMetadata(handle: AnalysisHandle, position: AnalysisPosition, maxFields = 64, options?: AnalysisRequest): Promise<AnalysisSourceQueryResult> {
    handle = { ...handle }; position = { ...position };
    return this.enqueue(async () => {
      const start = performance.now(), unavailable = this.unavailable();
      const document = this.documents.get(handle.module);
      if (handle.sessionId !== this.sessionId || handle.projectVersion !== this.projectVersion || handle.documentVersion !== document?.version || !this.checked.has(handle.module))
        throw Error("Stale or unchecked analysis handle");
      if (![position.line, position.column].every(n => Number.isSafeInteger(n) && n >= 0) || !Number.isSafeInteger(maxFields) || maxFields < 1 || maxFields > 128)
        throw Error("Invalid source query bounds");
      const r = unavailable ?? await this.request("query-source", { module: handle.module, line: position.line,
        column: queryColumn(document!, position), maxFields }, options);
      // Native origin facts were normalized while their source was current.
      // Converting them with today's document here would corrupt old origins.
      const immutable = (facts?: AnalysisSourceFacts | null): AnalysisSourceFacts | null => facts ? Object.freeze({ complete: facts.complete,
        fields: Object.freeze(facts.fields.map(field => Object.freeze({ ...field, range: Object.freeze({
          start: Object.freeze({ ...field.range.start }), end: Object.freeze({ ...field.range.end }),
        }) }))) }) : null;
      const result = { ...this.outcome(r), origin: immutable(r.origin), effective: immutable(r.effective), supported: r.supported ?? false, truncated: r.truncated ?? false };
      result.timings.totalMs = performance.now() - start; return result;
    });
  }
  queryScopeSourceMetadata(handle: AnalysisHandle, selector: AnalysisScopeSourceSelector, maxFields = 64, options?: AnalysisRequest): Promise<AnalysisScopeSourceQueryResult> {
    handle = { ...handle }; selector = { ...selector };
    return this.enqueue(async () => {
      const start = performance.now(), unavailable = this.unavailable();
      const document = this.documents.get(handle.module);
      if (handle.sessionId !== this.sessionId || handle.projectVersion !== this.projectVersion || handle.documentVersion !== document?.version || !this.checked.has(handle.module))
        throw Error("Stale or unchecked analysis handle");
      if (!["alias", "value"].includes(selector.namespace) || typeof selector.name !== "string" || selector.name.length < 1 || selector.name.length > 256
        || selector.name.includes(String.fromCharCode(0)) || !Number.isSafeInteger(maxFields) || maxFields < 1 || maxFields > 128)
        throw Error("Invalid scope source query bounds");
      const r = unavailable ?? await this.request("query-scope-source", { module: handle.module, ...selector, maxFields }, options);
      const immutable = (facts?: AnalysisSourceFacts | null): AnalysisSourceFacts | null => facts ? Object.freeze({ complete: facts.complete,
        fields: Object.freeze(facts.fields.map(field => Object.freeze({ ...field, range: Object.freeze({
          start: Object.freeze({ ...field.range.start }), end: Object.freeze({ ...field.range.end }),
        }) }))) }) : null;
      const result = { ...this.outcome(r), selector: Object.freeze({ ...selector }), origin: immutable(r.origin), effective: immutable(r.effective),
        supported: r.supported ?? false, truncated: r.truncated ?? false };
      result.timings.totalMs = performance.now() - start; return result;
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
    this.disposed = true; await this.stop("cancelled", "Project disposed"); this.documents.clear(); this.definitions.clear(); this.scopeLinks.clear(); this.documentModes.clear(); this.moduleIdentities.clear(); this.moduleResolutions.clear(); this.programEnvironment = undefined;
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

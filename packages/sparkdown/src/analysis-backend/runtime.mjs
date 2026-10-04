// Shared production worker implementation. Browser-safe: no Node builtins.
let native;
const now = () => performance.now();
const encoder = new TextEncoder();
let inputEncodingMs = 0;
function call(name, types, args) {
  const buffers = [];
  try {
    const start = now();
    const values = args.map((value, i) => {
      if (types[i] !== "string") return value;
      const bytes = encoder.encode(value);
      const pointer = native.ccall("analysis_allocate", "number", ["number"], [bytes.length + 1]);
      if (!pointer) throw new RangeError("WASM input memory allocation failed");
      buffers.push(pointer);
      native.writeArrayToMemory(bytes, pointer);
      native.writeArrayToMemory([0], pointer + bytes.length);
      return pointer;
    });
    inputEncodingMs += now() - start;
    return JSON.parse(native.ccall(name, "string", types.map(t => t === "string" ? "number" : t), values));
  } finally {
    for (const pointer of buffers.reverse()) native.ccall("analysis_free", null, ["number"], [pointer]);
  }
}
export async function handleAnalysisRequest(message, initialize) {
  const start = now();
  inputEncodingMs = 0;
  let initializationMs = 0, checkingMs = 0;
  let nativeEncodingMs = 0;
  let result;
  try {
    const { operation, payload } = message;
    if (operation === "initialize") {
      const t = now();
      native = await initialize();
      result = call("analysis_create", ["number", "number"], [payload.mode, payload.heap]);
      initializationMs = now() - t;
    } else if (!native) result = { status: "error", message: "Backend was not initialized" };
    else if (operation === "update") {
      result = { status: "ok" };
      const work = { changedInputs: 0, decodedInputs: 0, parsedModules: 0 };
      // Identity/resolution facts precede AST installation's traceRequires.
      for (const identity of payload.moduleIdentities ?? []) {
        result = call("analysis_identity", ["string", "string", "number"], [identity.module, identity.sourceUri, 0]);
        if (result.status !== "ok") break;
      }
      if (result.status === "ok") for (const name of payload.removeModuleIdentities ?? []) {
        result = call("analysis_identity", ["string", "string", "number"], [name, "", 1]);
        if (result.status !== "ok") break;
      }
      if (result.status === "ok") for (const resolution of payload.moduleResolutions ?? []) {
        result = call("analysis_resolution_begin", ["string"], [resolution.module]);
        if (result.status !== "ok") break;
        for (const edge of resolution.resolutions) {
          result = call("analysis_resolution_edge", ["string", "string", "string"], [edge.specifier, edge.targetModule, edge.targetSourceUri]);
          if (result.status !== "ok") break;
        }
        if (result.status === "ok") result = call("analysis_resolution_commit", ["number"], [0]);
        if (result.status !== "ok") break;
      }
      if (result.status === "ok") for (const name of payload.removeModuleResolutions ?? []) {
        result = call("analysis_resolution_begin", ["string"], [name]);
        if (result.status === "ok") result = call("analysis_resolution_commit", ["number"], [1]);
        if (result.status !== "ok") break;
      }
      if (result.status === "ok") for (const d of payload.documents ?? []) {
        result = call(d.kind === "ast" ? "analysis_set_ast" : "analysis_set",
          ["string", "string", "number"], [d.module, d.kind === "ast" ? d.encoded : d.source, 0]);
        if (result.status !== "ok") break;
        work.changedInputs += result.changed ? 1 : 0; work.decodedInputs += result.decodedInputs ?? 0;
      }
      if (result.status === "ok") for (const name of payload.removeDocuments ?? []) {
        result = call("analysis_set", ["string", "string", "number"], [name, "", 1]);
        if (result.status !== "ok") break;
        work.changedInputs += result.changed ? 1 : 0;
      }
      if (result.status === "ok") for (const d of payload.definitions ?? []) {
        result = call("analysis_definition", ["string", "string", "number"], [d.name, d.source, 0]);
        if (result.status !== "ok") break;
      }
      if (result.status === "ok") for (const name of payload.removeDefinitions ?? []) {
        result = call("analysis_definition", ["string", "string", "number"], [name, "", 1]);
        if (result.status !== "ok") break;
      }
      const definitionsChanged = (payload.definitions?.length ?? 0) + (payload.removeDefinitions?.length ?? 0) > 0;
      if (result.status === "ok" && payload.programEnvironment) {
        result = call("analysis_environment_begin", [], []);
        for (const [kind, names] of [[0, payload.programEnvironment.values], [1, payload.programEnvironment.types]]) {
          if (result.status !== "ok") break;
          for (const name of names) {
            result = call("analysis_environment_binding", ["string", "number"], [name, kind]);
            if (result.status !== "ok") break;
          }
        }
        if (result.status === "ok") result = call("analysis_environment_commit", ["number"], [definitionsChanged ? 1 : 0]);
      }
      if (result.status === "ok" && definitionsChanged && !payload.programEnvironment)
        result = call("analysis_commit_definitions", [], []);
      if (result.status === "ok") for (const m of payload.documentModes ?? []) {
        result = call("analysis_mode", ["string", "number", "number"], [m.module, {nocheck: 0, nonstrict: 1, strict: 2}[m.mode], 0]);
        if (result.status !== "ok") break;
      }
      if (result.status === "ok") for (const name of payload.removeDocumentModes ?? []) {
        result = call("analysis_mode", ["string", "number", "number"], [name, 0, 1]);
        if (result.status !== "ok") break;
      }
      if (result.status === "ok") for (const link of payload.scopeLinks ?? []) {
        result = call("analysis_scope", ["string", "string", "number"], [link.module, link.prelude, 0]);
        if (result.status !== "ok") break;
      }
      if (result.status === "ok") for (const name of payload.removeScopeLinks ?? []) {
        result = call("analysis_scope", ["string", "string", "number"], [name, "", 1]);
        if (result.status !== "ok") break;
      }
      if (result.status === "ok") result.work = work;
    } else if (operation === "check") {
      const t = now();
      const modules = new Set(), diagnostics = new Map(), generations = new Map(), metadataGenerations = new Map();
      let checkedModules = 0, parsedModules = 0;
      result = { status: "ok" };
      for (const module of payload.modules) {
        result = call("analysis_check", ["string", "number"], [module, payload.seconds]);
        checkingMs += result.nativeCheckingMs ?? 0; nativeEncodingMs += result.nativeEncodingMs ?? 0;
        if (result.status !== "ok") break;
        checkedModules += result.checkedModules ?? 0; parsedModules += result.work?.parsedModules ?? 0;
        for (const name of result.modules ?? []) modules.add(name);
        for (const diagnostic of result.diagnostics ?? []) diagnostics.set(JSON.stringify(diagnostic), diagnostic);
        for (const generation of result.scopeGenerations ?? []) generations.set(generation.module, generation);
        for (const generation of result.scopeMetadataGenerations ?? []) metadataGenerations.set(generation.module, generation);
      }
      if (result.status === "ok") result = { ...result, checkedModules, modules: [...modules].sort(), diagnostics: [...diagnostics.values()],
        scopeGenerations: [...generations.values()], scopeMetadataGenerations: [...metadataGenerations.values()],
        work: { changedInputs: 0, decodedInputs: 0, parsedModules } };
    } else if (operation === "query") {
      result = call("analysis_query", ["string", "number", "number", "number"], [payload.module, payload.line, payload.column, payload.maxLength]);
    } else if (operation === "query-source") {
      result = call("analysis_query_source", ["string", "number", "number", "number"], [payload.module, payload.line, payload.column, payload.maxFields]);
    } else if (operation === "query-scope-source") {
      result = call("analysis_query_scope_source", ["string", "string", "string", "number"], [payload.module, payload.namespace, payload.name, payload.maxFields]);
    } else if (operation === "dispose") {
      native.ccall("analysis_dispose", null, [], []);
      native = undefined;
      result = { status: "ok" };
    } else throw Error("Unknown analysis operation");
  } catch (error) {
    // Emscripten OOM may abort instead of propagating a C++ bad_alloc.
    const message = String(error);
    const memoryFailure = /Aborted\(OOM\)/i.test(message) || (error instanceof RangeError && /WebAssembly.Memory|memory allocation|Array buffer allocation/i.test(message));
    result = { status: memoryFailure ? "memory-limit" : "error", message };
    native = undefined;
  }
  const encodingStart = now();
  // Measure result encoding separately from native checking and worker transfer.
  const body = JSON.stringify(result);
  const inputBytes = new TextEncoder().encode(JSON.stringify(message)).length;
  const outputBytes = new TextEncoder().encode(body).length;
  return { id: message.id, body, initializationMs, checkingMs, encodingMs: inputEncodingMs + nativeEncodingMs + now() - encodingStart, workerMs: now() - start,
    inputBytes, outputBytes,
    linearMemoryBytes: native ? native.ccall("analysis_memory_bytes", "number", [], []) : 0 };
}

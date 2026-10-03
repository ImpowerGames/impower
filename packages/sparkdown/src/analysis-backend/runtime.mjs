// Shared production worker implementation. Browser-safe: no Node builtins.
let native;
const now = () => performance.now();
function call(name, types, args) {
  return JSON.parse(native.ccall(name, "string", types, args));
}
export async function handleAnalysisRequest(message, initialize) {
  const start = now();
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
      for (const d of payload.documents ?? []) {
        result = call("analysis_set", ["string", "string", "number"], [d.module, d.source, 0]);
        if (result.status !== "ok") break;
      }
      if (result.status === "ok") for (const name of payload.removeDocuments ?? []) {
        result = call("analysis_set", ["string", "string", "number"], [name, "", 1]);
        if (result.status !== "ok") break;
      }
      if (result.status === "ok") for (const d of payload.definitions ?? []) {
        result = call("analysis_definition", ["string", "string", "number"], [d.name, d.source, 0]);
        if (result.status !== "ok") break;
      }
      if (result.status === "ok") for (const name of payload.removeDefinitions ?? []) {
        result = call("analysis_definition", ["string", "string", "number"], [name, "", 1]);
        if (result.status !== "ok") break;
      }
    } else if (operation === "check") {
      const t = now();
      result = call("analysis_check", ["string", "number"], [payload.module, payload.seconds]);
      checkingMs = result.nativeCheckingMs ?? now() - t;
      nativeEncodingMs = result.nativeEncodingMs ?? 0;
    } else if (operation === "query") {
      result = call("analysis_query", ["string", "number", "number", "number"], [payload.module, payload.line, payload.column, payload.maxLength]);
    } else if (operation === "dispose") {
      native.ccall("analysis_dispose", null, [], []);
      native = undefined;
      result = { status: "ok" };
    } else throw Error("Unknown analysis operation");
  } catch (error) {
    // Emscripten OOM may abort instead of propagating a C++ bad_alloc.
    const message = String(error);
    result = { status: /memory|alloc|oom/i.test(message) ? "memory-limit" : "error", message };
    native = undefined;
  }
  const encodingStart = now();
  // Measure result encoding separately from native checking and worker transfer.
  const body = JSON.stringify(result);
  const inputBytes = new TextEncoder().encode(JSON.stringify(message)).length;
  const outputBytes = new TextEncoder().encode(body).length;
  return { id: message.id, body, initializationMs, checkingMs, encodingMs: nativeEncodingMs + now() - encodingStart, workerMs: now() - start,
    inputBytes, outputBytes,
    linearMemoryBytes: native ? native.ccall("analysis_memory_bytes", "number", [], []) : 0 };
}

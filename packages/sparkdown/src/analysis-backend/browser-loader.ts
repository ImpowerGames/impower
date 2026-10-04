import { createWasmAnalysisBackend, type AnalysisTransport } from "./wasm-adapter";
/** Assets must be served together preserving the worker's relative URLs. */
export function createBrowserAnalysisBackend(workerUrl = new URL("./browser-worker.mjs", import.meta.url)) {
  return createWasmAnalysisBackend((): AnalysisTransport => {
    const worker = new Worker(workerUrl, { type: "module" });
    return {
      send: message => worker.postMessage(message),
      listen(receive, fail) { worker.onmessage = e => receive(e.data); worker.onerror = e => fail(e.message); },
      async terminate() { worker.terminate(); },
    };
  });
}

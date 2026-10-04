import { Worker } from "node:worker_threads";
import { createWasmAnalysisBackend, type AnalysisTransport } from "./wasm-adapter";
/** Production Node entry point. One dedicated worker/WASM instance per project. */
export function createNodeAnalysisBackend() {
  return createWasmAnalysisBackend((): AnalysisTransport => {
    const worker = new Worker(new URL("./node-worker.mjs", import.meta.url));
    return {
      send: message => worker.postMessage(message),
      listen(receive, fail) { worker.on("message", receive); worker.on("error", e => fail(e.message)); worker.on("exit", code => { if (code) fail(`Analysis worker exited ${code}`); }); },
      async terminate() { await worker.terminate(); },
    };
  });
}

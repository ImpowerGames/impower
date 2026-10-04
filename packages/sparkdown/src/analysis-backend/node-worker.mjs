import { parentPort } from "node:worker_threads";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { handleAnalysisRequest } from "./runtime.mjs";

const base = new URL("../../vendor/luau-analysis/", import.meta.url);
async function initialize() {
  const manifest = JSON.parse(await readFile(new URL("manifest.json", base), "utf8"));
  if (manifest.abi !== 1 || manifest.source !== "7d5f73364fdbbaa984fa545071630eba73cfea98" || manifest.compiler !== "Emscripten 4.0.10")
    throw Error("Analysis artifact provenance mismatch");
  let wasmBinary;
  for (const name of ["backend.js", "backend.wasm"]) {
    const bytes = await readFile(new URL(name, base));
    if (createHash("sha256").update(bytes).digest("hex") !== manifest.artifacts[name].sha256) throw Error(`Analysis artifact hash mismatch: ${name}`);
    if (name === "backend.wasm") wasmBinary = bytes;
  }
  const { default: factory } = await import(new URL("backend.js", base).href);
  return factory({ wasmBinary, print() {}, printErr() {} });
}
// Parent serializes requests; callbacks cannot race one native frontend.
parentPort.on("message", async message => parentPort.postMessage(await handleAnalysisRequest(message, initialize)));

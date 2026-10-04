import { handleAnalysisRequest } from "./runtime.mjs";

async function initialize() {
  const base = new URL("../../vendor/luau-analysis/", import.meta.url);
  // Some bundlers normalize a directory asset URL by dropping its trailing slash.
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  const response = await fetch(new URL("manifest.json", base));
  if (!response.ok) throw Error("Cannot load analysis manifest");
  const manifest = await response.json();
  if (manifest.abi !== 1 || manifest.source !== "7d5f73364fdbbaa984fa545071630eba73cfea98" || manifest.compiler !== "Emscripten 4.0.10")
    throw Error("Analysis artifact provenance mismatch");
  let wasmBinary;
  for (const name of ["backend.js", "backend.wasm"]) {
    const response = await fetch(new URL(name, base));
    if (!response.ok) throw Error(`Cannot load analysis artifact: ${name}`);
    const bytes = await response.arrayBuffer();
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(n => n.toString(16).padStart(2, "0")).join("");
    if (digest !== manifest.artifacts[name].sha256) throw Error(`Analysis artifact hash mismatch: ${name}`);
    if (name === "backend.wasm") wasmBinary = bytes;
  }
  const { default: factory } = await import(new URL("backend.js", base).href);
  return factory({ wasmBinary, print() {}, printErr() {} });
}
self.onmessage = async event => self.postMessage(await handleAnalysisRequest(event.data, initialize));

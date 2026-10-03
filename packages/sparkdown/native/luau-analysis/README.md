# Official Luau analysis backend

This independent backend accepts ordinary `.luau` modules. It does not change Sparkdown production callers. Task #1387 owns syntax/unit mapping and incremental host integration, #1388 owns conformance integration, and #1389 owns host rollout.

## Build and provenance

Use a clean checkout of `luau-lang/luau` at `7d5f73364fdbbaa984fa545071630eba73cfea98` and Emscripten SDK **4.0.10**:

```
node packages/sparkdown/native/luau-analysis/build.mjs /absolute/luau /absolute/emsdk
```

The build checks the exact Git commit, tracked-source cleanliness and compiler version, reads the official target sources from `Sources.cmake`, and links unmodified Common, Ast, Bytecode, Compiler, Config, Analysis and VM with unresolved symbols forbidden. `bridge.cpp` is the only added native source. `vendor/luau-analysis/manifest.json` records bridge/source-manifest/artifact SHA-256 hashes, compiler identification, flags, artifact sizes and actual build duration. The upstream MIT license is distributed alongside the separate artifact. Neither runtime-conformance parser artifact is used or modified.

`backend.js`, `backend.wasm`, `manifest.json` and `LICENSE.txt` belong together. Node and browser workers verify artifact hashes before initialization. The browser worker requires an HTTP origin with Web Crypto, module workers and permission to instantiate WASM. Its relative source/worker/vendor layout must be preserved by packaging; host bundler/CSP rollout remains #1389's responsibility.

## Contract and lifetime

`src/analysis-backend/contract.ts` contains a backend-independent asynchronous API. `createNodeAnalysisBackend()` and `createBrowserAnalysisBackend()` initialize an isolated worker and WASM instance per project. Initialization failure rejects explicitly. A project retains its native `Frontend`, source modules and type graphs across document updates/checks; no pointers or graph encodings escape. Definitions/configuration changes rebuild the native frontend within that project. `markDirty` invalidates native reverse dependencies at module granularity. No-op source updates reuse cached modules, including cached diagnostics. This makes no claim about Sparkdown equivalent-export or scene-level reuse.

Project versions strictly increase. Document/definition versions increase when those inputs are submitted, including unchanged bytes. Handles include a unique session identity, project version and document version; any update/reset invalidates previous handles. Queries work only on successfully checked documents and return bounded type text, not graph identities. UTF-8 native positions are converted to zero-based UTF-16 host positions. Reset increments the project version and restores the last committed inputs/configuration; failed updates never commit their requested version. Dispose terminates the worker and clears inputs.

A successful check is a complete diagnostic snapshot for `replacementDocuments`, including reachable cached dependencies. Clear old diagnostics for every replacement document, even when the new list is empty or mode is `nocheck`. A failed check is not a replacement snapshot. Removing a document also requires the host to clear its previous diagnostics. Definition failures return structured parse/type diagnostics for the proposed definition version; they do not commit that version and require reset. All native failure/limit outcomes require explicit reset. Native modes are strict, nonstrict and nocheck; ordinary Luau header mode comments retain official precedence.

## Isolation and limits

The official new solver is used. Luau-prefixed boolean flags are enabled in each isolated WASM instance; Debug/Test flag defaults remain upstream defaults. There is no process-global configuration shared across projects. The VM heap budget defaults to 16 MiB and can be configured from 1 MiB through 128 MiB; smaller budgets cannot initialize the official library reliably and are rejected. All native linear memory is capped at 256 MiB. Inputs reject NUL and exceedances of 8 MiB per input or 64 MiB per project. Type query text is capped at 65,536 bytes.

Each request has a host deadline (default 2 seconds, initialization 10 seconds, maximum 60 seconds) and optional AbortSignal. A worker can be terminated while native WASM is executing. The official per-module deadline is a secondary guard at twice the host deadline; the host deadline is authoritative because Luau's type-function VM can turn native timeout exceptions into ordinary runtime diagnostics. Cancellation and deadline outcomes invalidate checked handles and require reset. VM heap errors are conservatively classified as memory-limit from the official runtime error text; a user error imitating that text also causes a safe reset. Linear-memory allocation exceptions/aborts are explicit memory-limit failures.

## Measurements

The committed artifact is 3,914,493 WASM bytes plus 28,090 JavaScript bytes. Two independent Windows builds with the pinned SDK produced identical SHA-256 hashes for both artifacts; the Linux CI rebuild checks cross-host reproducibility separately. One Chromium 149 headless sample using the production browser adapter on a static HTTP origin measured 203.5 ms native initialization (220.7 ms total, 16 MiB initial linear memory), 1.1 ms update total, 57.4 ms native checking (59.8 ms total), and 4.7 ms type-query total for a small Optional type-function module. These are single loaded-machine boundary measurements, not a comparison with the existing checker or a production editor latency claim.

Each result reports initialization, native checking, encoding, transfer and total milliseconds plus input/output encoded byte counts and current linear-memory size. Native checking excludes bridge diagnostic serialization. Encoding includes native result construction and worker JSON/byte measurement. Transfer is the residual outside measured worker work and includes scheduling, structured clone and worker startup; it is not a pure wire-time measurement. Host update validation scans cached per-input sizes; unchanged source bytes and line splits are cached. Check/query position conversion and result processing add host work. No comparison with the existing TypeScript checker or editor speed is claimed.

Run focused production tests with:

```
node scripts/test-suite.mjs run packages/sparkdown src/tests/analysis-backend/analysis-backend.test.ts --wait 600
node scripts/typecheck.mjs packages/sparkdown/
```

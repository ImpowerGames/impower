# @impower/luau

A Vite-powered demo that runs the [Luau](https://github.com/luau-lang/luau)
scripting language in the browser via WebAssembly.

The Luau project ships a built-in `Luau.Web` CMake target
([CLI/src/Web.cpp](https://github.com/luau-lang/luau/blob/master/CLI/src/Web.cpp))
that exports `executeScript(const char*)` — a sandboxed compile-and-run for
a Luau source string. Newer revisions on `master` also add
`checkScript(const char*, int)` for type checking, but tagged releases such
as `0.661` (this package's default pin) only have `executeScript`; the
wrapper detects this at load time and hides the Type-check button
accordingly.

This package builds the `Luau.Web` target to a single-file Emscripten ES
module (`Luau.Web.js`, with the WASM blob embedded as base64), then loads
it from a TypeScript wrapper and wires it to a simple in-browser editor.

## Prerequisites

- Node.js 20+
- Docker Desktop (only required for `npm run build:wasm`)
- ~2GB of disk space for the cached emscripten/emsdk image on first build

## Usage

```sh
# 1. Install dev deps
npm install

# 2. Build the WASM module (clones Luau, runs Emscripten inside Docker)
npm run build:wasm

# 3. Launch the Vite dev server
npm run dev
```

`npm run build:wasm` is a one-time step — the generated
`src/wasm/Luau.Web.js` is gitignored, but you only need to regenerate it when
upgrading Luau (bump `LUAU_REF` in [scripts/build-wasm.mjs](scripts/build-wasm.mjs)).

## How it works

1. `scripts/build-wasm.mjs` clones `luau-lang/luau` into `vendor/luau` and
   runs the official `emscripten/emsdk` Docker image to invoke
   `emcmake cmake -DLUAU_BUILD_WEB=ON` followed by `emmake make Luau.Web`.
   Extra linker flags (`-sMODULARIZE=1 -sEXPORT_ES6=1`) turn the output
   into a default-exported ES module factory.
2. `src/luau.ts` dynamically imports `src/wasm/Luau.Web.js`, instantiates
   the module, and `cwrap`s `executeScript` / `checkScript` into TS.
3. `src/main.ts` wires those to a `<textarea>` editor + Run / Type-check
   buttons defined in [index.html](index.html).

Because Luau's CMake config builds with `-sSINGLE_FILE=1`, there is no
separate `.wasm` file to host — `Luau.Web.js` contains everything.

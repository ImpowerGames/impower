# Luau.Web build output

`Luau.Web.js` is produced by `npm run build:wasm` and dropped here next to
this file. It is gitignored — see `../../.gitignore`.

The file is an Emscripten single-file ES module that embeds the WASM blob as
base64 and default-exports a Module factory. See `../luau.ts` for the wrapper
that drives it.

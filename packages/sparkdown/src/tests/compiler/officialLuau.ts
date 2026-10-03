import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const artifact = new URL(
  "../luau-conformance/upstream/ast/luau-ast.cjs",
  import.meta.url,
);
const wasm = new URL(
  "../luau-conformance/upstream/ast/luau-ast.wasm",
  import.meta.url,
);
export const officialLuauAvailable = existsSync(artifact) && existsSync(wasm);
export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };
export interface OfficialResult {
  root: Json;
  errors: number;
}

interface Module {
  HEAPU8: Uint8Array;
  ccall(name: string, result: string, types: string[], args: unknown[]): number;
}

/** Load once; each parse frees its arena. No native tools are used at test time. */
export async function loadOfficialLuau(): Promise<
  (source: string) => OfficialResult
> {
  const manifest = JSON.parse(
    readFileSync(new URL("build.json", artifact), "utf8"),
  ) as { upstream: string; sha256: Record<string, string> };
  const pin = readFileSync(new URL("../VENDORING.md", artifact), "utf8").match(
    /copied from: `([a-f0-9]+)`/,
  )?.[1];
  if (manifest.upstream !== pin)
    throw new Error(
      "Official parser differs from the conformance pin; rebuild it (VENDORING.md)",
    );
  for (const file of ["bridge.cpp", "luau-ast.cjs", "luau-ast.wasm"]) {
    const hash = createHash("sha256")
      .update(readFileSync(new URL(file, artifact)))
      .digest("hex");
    if (manifest.sha256[file] !== hash)
      throw new Error(
        `Official parser artifact hash mismatch: ${file}; rebuild it (VENDORING.md)`,
      );
  }
  const factory = createRequire(import.meta.url)(fileURLToPath(artifact));
  const module: Module = await factory({ wasmBinary: readFileSync(wasm) });
  return (source) => {
    const pointer = module.ccall("parse_ast", "number", ["string"], [source]);
    const end = module.HEAPU8.indexOf(0, pointer);
    // Luau strings contain arbitrary bytes. Preserve them one-to-one, including
    // non-UTF8 escapes; the C++ encoder is compiled with unsigned char.
    const output = Buffer.from(module.HEAPU8.subarray(pointer, end)).toString(
      "latin1",
    );
    // The upstream encoder emits non-JSON numeric tokens. Quote those tokens
    // outside strings; use strings on both sides to preserve infinities and NaN.
    const json = output.replace(/"(?:[^"\\]|\\.)*"|-?Infinity|NaN/g, (token) =>
      token.startsWith('"') ? token : JSON.stringify(token),
    );
    return {
      root: JSON.parse(json) as Json,
      errors: module.ccall("parse_errors", "number", [], []),
    };
  };
}

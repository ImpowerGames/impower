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
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };
export interface OfficialResult {
  root: Json;
  errors: number;
  diagnostics: OfficialSyntaxError[];
}

/** Upstream's unmodified message and UTF-8 byte positions. */
export interface OfficialSyntaxError {
  message: string;
  location: {
    begin: { line: number; column: number };
    end: { line: number; column: number };
  };
}

interface Module {
  HEAPU8: Uint8Array;
  ccall(name: string, result: string, types: string[], args: unknown[]): number;
}

/** Load once; each parse frees its arena. No native tools are used at test time. */
export async function loadOfficialLuau(
  snapshot: "runtime" | "typecheck" = "runtime",
): Promise<(source: string) => OfficialResult> {
  const selectedArtifact =
    snapshot === "runtime"
      ? artifact
      : new URL(
          "../luau-conformance/upstream/typecheck-ast/luau-ast.cjs",
          import.meta.url,
        );
  const selectedWasm = new URL("luau-ast.wasm", selectedArtifact);
  const manifest = JSON.parse(
    readFileSync(new URL("build.json", selectedArtifact), "utf8"),
  ) as { upstream: string; sha256: Record<string, string> };
  const pin =
    snapshot === "typecheck"
      ? JSON.parse(
          readFileSync(
            new URL("../typecheck-cases.json", selectedArtifact),
            "utf8",
          ),
        ).pin
      : readFileSync(new URL("../VENDORING.md", artifact), "utf8").match(
          /copied from: `([a-f0-9]+)`/,
        )?.[1];
  if (manifest.upstream !== pin)
    throw new Error(
      "Official parser differs from the conformance pin; rebuild it (VENDORING.md)",
    );
  for (const file of ["bridge.cpp", "luau-ast.cjs", "luau-ast.wasm"]) {
    const hash = createHash("sha256")
      .update(readFileSync(new URL(file, selectedArtifact)))
      .digest("hex");
    if (manifest.sha256[file] !== hash)
      throw new Error(
        `Official parser artifact hash mismatch: ${file}; rebuild it (VENDORING.md)`,
      );
  }
  const factory = createRequire(import.meta.url)(
    fileURLToPath(selectedArtifact),
  );
  const module: Module = await factory({
    wasmBinary: readFileSync(selectedWasm),
  });
  const readString = (pointer: number) => {
    const end = module.HEAPU8.indexOf(0, pointer);
    return Buffer.from(module.HEAPU8.subarray(pointer, end)).toString("latin1");
  };
  return (source) => {
    const pointer = module.ccall("parse_ast", "number", ["string"], [source]);
    // Luau strings contain arbitrary bytes. Preserve them one-to-one, including
    // non-UTF8 escapes; the C++ encoder is compiled with unsigned char.
    const output = readString(pointer);
    // The upstream encoder emits non-JSON numeric tokens. Quote those tokens
    // outside strings; use strings on both sides to preserve infinities and NaN.
    const json = output.replace(/"(?:[^"\\]|\\.)*"|-?Infinity|NaN/g, (token) =>
      token.startsWith('"') ? token : JSON.stringify(token),
    );
    return {
      root: JSON.parse(json) as Json,
      errors: module.ccall("parse_errors", "number", [], []),
      diagnostics: JSON.parse(
        readString(module.ccall("parse_error_json", "number", [], [])),
      ) as OfficialSyntaxError[],
    };
  };
}

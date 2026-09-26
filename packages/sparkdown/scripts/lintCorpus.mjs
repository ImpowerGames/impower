#!/usr/bin/env node
// The false-positive corpus run for the Luau lints: compiles a fixed corpus
// and prints every lint it reports as `file:line:column Code message`, one
// per line in a stable order, with a count per corpus on stderr. Every lint
// change reads the findings for false ones, and diffs the output against a
// run on the base commit to see exactly what the change added or removed.
//
// The corpus:
//   - every tracked `.sd` file in the repository, each compiled on its own;
//   - Luau's vendored conformance files, each wrapped in
//     `function run() ... end` (sparkdown is Luau only inside a function),
//     with line numbers still those of the `.luau` file;
//   - with `--project <dir>`, every `.sd` file of a sparkdown project such as
//     R&B, compiled as one program from its `main.sd`.
//
// From the repository root:
//
//   node packages/sparkdown/scripts/lintCorpus.mjs [--project <dir>] > findings.txt
//
// The compiler is TypeScript that imports grammar JSON, so this bundles
// `lintCorpus.ts` with the repository's esbuild into a temporary directory and
// runs the bundle.

import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
const esbuild = createRequire(path.join(REPO, "package.json"))("esbuild");

const scratch = mkdtempSync(path.join(os.tmpdir(), "lint-corpus-"));
try {
  const outfile = path.join(scratch, "lintCorpus.mjs");
  await esbuild.build({
    entryPoints: [path.join(HERE, "lintCorpus.ts")],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    logLevel: "warning",
    // The compiler imports its built-in scripts as text (`builtins.sd?raw`).
    loader: { ".sd": "text", ".luau": "text" },
    banner: {
      js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
    },
  });
  const { main } = await import(pathToFileURL(outfile).href);
  main(REPO, process.argv.slice(2));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

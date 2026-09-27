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
// `lintCorpus.ts` into a temporary directory the way the benchmarks under
// `scripts/bench` are bundled, and runs the bundle.

import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { bundleBench, value } from "../../../scripts/bench/benchLauncher.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");

const args = process.argv.slice(2);
let project;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--project") project = path.resolve(value(args, i++, "--project"));
  else throw new Error(`Unknown argument: ${args[i]}`);
}

const scratch = mkdtempSync(path.join(os.tmpdir(), "lint-corpus-"));
try {
  const outfile = await bundleBench(path.join(HERE, "lintCorpus.ts"), scratch);
  const { main } = await import(pathToFileURL(outfile).href);
  main(REPO, project);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

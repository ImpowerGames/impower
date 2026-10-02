#!/usr/bin/env node
// Converts the indented struct bodies of `layout`, `component`, `style`,
// `animation`, `theme`, `morph` and `screen` declarations into the brace
// forms of #1222 (#1229). The rewrite rules are in `structBodyRewrite.ts`.
//
// It checks its own work: each file (or a project, compiled as one program
// from its `main.sd`) is compiled before and after, and the two programs are
// compared without source positions or the binding names derived from them.
// A difference leaves the file (or the whole project) untouched. A
// declaration whose old meaning cannot be carried over is refused, reported
// with its file and line, and left as it was.
//
// From the repository root:
//
//   node packages/sparkdown/scripts/convertStructBodies.mjs [--check] <file.sd|file.ts> [...]
//   node packages/sparkdown/scripts/convertStructBodies.mjs [--check] --project <dir>
//
// A TypeScript source (#1230) has the Sparkdown in its string literals
// rewritten, each literal compiled before and after on its own; the shapes
// it reads are in `structBodyLiterals.ts`.
//
// `--check` reports without writing. The exit code is 1 when programs differ
// or a declaration was refused.
//
// The builtins prelude (`builtins.sd`) compiles on its own, as the compiler
// compiles it; every other file compiles on top of the bundled prelude.
//
// The compiler is TypeScript that imports grammar JSON, so this bundles
// `convertStructBodies.ts` into a temporary directory the way `lintCorpus.mjs`
// does, and runs the bundle. The script is deleted with the indented forms by
// the last slice of #1222.

import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { bundleBench } from "../../../scripts/bench/benchLauncher.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const scratch = mkdtempSync(path.join(os.tmpdir(), "convert-struct-bodies-"));
try {
  const outfile = await bundleBench(path.join(HERE, "convertStructBodies.ts"), scratch);
  // The bundled TypeScript compiler reads the CommonJS `__filename` and
  // `__dirname` when it loads, which an ES module does not define.
  globalThis.__filename ??= outfile;
  globalThis.__dirname ??= scratch;
  const { main } = await import(pathToFileURL(outfile).href);
  process.exitCode = main(process.cwd(), process.argv.slice(2));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

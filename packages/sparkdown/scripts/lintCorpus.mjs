#!/usr/bin/env node

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

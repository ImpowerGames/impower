#!/usr/bin/env node

import { analyse, scannedFiles, violations } from "./listrow-overflow.mjs";

const files = scannedFiles();
const analysis = analyse(files);
const found = files.filter((f) => f.path.endsWith(".tsx")).flatMap((f) => violations(f, analysis));
const names = [...analysis.clipping].map((key) => key.slice(key.indexOf("#") + 1));

for (const v of found) {
  console.log(`${v.path}:${v.line}: ListRow label fades or clips itself but overflow can be ${v.overflow}; pass overflow="self" (or overflow="wrap" for a wrapping label)`);
}
console.log(`\n${files.length} file(s), ${analysis.clipping.size} self-clipping component(s), ${found.length} violation(s)`);
if (files.length === 0 || !names.includes("Snippet") || !names.includes("DebugNameValue")) {
  console.log("The scan did not discover Snippet and DebugNameValue, so the file filter or the class pattern is broken.");
  process.exitCode = 1;
}
if (found.length) process.exitCode = 1;

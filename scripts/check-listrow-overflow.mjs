#!/usr/bin/env node

import { scannedFiles, selfClippingComponents, violations } from "./listrow-overflow.mjs";

const files = scannedFiles();
const components = selfClippingComponents(files);
const found = files.flatMap((f) => violations(f, components));

for (const v of found) {
  console.log(`${v.path}:${v.line}: ListRow label fades or clips itself but overflow is ${v.overflow}; pass overflow="self" (or overflow="wrap" for a wrapping label)`);
}
console.log(`\n${files.length} file(s), ${components.size} self-clipping component(s), ${found.length} violation(s)`);
if (files.length === 0 || !components.has("Snippet") || !components.has("DebugNameValue")) {
  console.log("The scan did not discover Snippet and DebugNameValue, so the file filter or the class pattern is broken.");
  process.exitCode = 1;
}
if (found.length) process.exitCode = 1;

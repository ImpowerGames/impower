// Parse definition sources once. Runtime consumers load the resulting JSON.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getBuiltinDefinitionSource, getTypeFunctionDefinitionSource } from "../src/compiler/typecheck/EmbeddedBuiltinDefinitions.ts";
import { loadOfficialLuau } from "../src/tests/compiler/officialLuau.ts";

const check = process.argv.slice(2);
if (check.some((arg) => arg !== "--check") || check.length > 1)
  throw new Error("Usage: node packages/sparkdown/scripts/buildDefinitionAst.mjs [--check]");

const upstream = JSON.parse(readFileSync(new URL("../src/tests/luau-conformance/upstream/ast/build.json", import.meta.url), "utf8")).upstream;
// loadOfficialLuau verifies the conformance pin and every artifact hash.
const parse = await loadOfficialLuau();
const inputs = [
  ["builtin", getBuiltinDefinitionSource(), "../src/compiler/typecheck/definitions/builtin.json"],
  ["type-functions", getTypeFunctionDefinitionSource(), "../src/compiler/typecheck/definitions/type-functions.json"],
  ["checked-abs test fixture", readFileSync(new URL("../src/tests/compiler/definition-fixtures/checked-abs.luau", import.meta.url), "utf8"), "../src/tests/compiler/definition-fixtures/checked-abs.json"],
];

// Parse all inputs before writing any artifact, so a rejected source cannot
// leave a partly refreshed build. The JSON uses the official oracle's schema.
const outputs = inputs.map(([name, source, target]) => {
  const parsed = parse(source);
  if (parsed.errors) throw new Error(`Cannot generate ${name}: official Luau parser reported ${parsed.errors} syntax error(s)`);
  const content = JSON.stringify({
    version: 1, parser: upstream,
    sourceSha256: createHash("sha256").update(source).digest("hex"), root: parsed.root,
  }, null, 2) + "\n";
  return { name, target: new URL(target, import.meta.url), content };
});

for (const output of outputs) {
  if (check.length) {
    let actual;
    try { actual = readFileSync(output.target, "utf8"); }
    catch { throw new Error(`Missing ${output.name} AST; run buildDefinitionAst.mjs`); }
    if (actual !== output.content) throw new Error(`Stale ${output.name} AST; run buildDefinitionAst.mjs`);
  } else {
    mkdirSync(dirname(fileURLToPath(output.target)), { recursive: true });
    writeFileSync(output.target, output.content);
  }
  console.log(`${check.length ? "Verified" : "Generated"} ${output.name} AST`);
}

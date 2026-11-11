import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const base = process.argv[2];
if (!base) {
  console.error("usage: node definitions/scripts/compare-grammar.mjs <base-revision>");
  process.exit(2);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LOCATIONS = ["packages/sparkdown/language", "vscode-sparkdown/language"];
const GRAMMAR = "sparkdown.language-grammar.json";
const LUAU_FILE_GRAMMAR = "sparkdown-luau.language-grammar.json";

const atBase = (file) =>
  execFileSync("git", ["-C", root, "show", `${base}:${file}`], {
    encoding: "utf8",
    maxBuffer: 1 << 28,
  });
const atHead = (file) => fs.readFileSync(path.join(root, file), "utf8");

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
};

const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

const differingKeys = (a = {}, b = {}) =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
    (key) => !same(a[key], b[key]),
  );

let failed = false;
for (const location of LOCATIONS) {
  const file = `${location}/${GRAMMAR}`;
  const before = JSON.parse(atBase(file));
  const after = JSON.parse(atHead(file));
  delete before._generated_;
  delete after._generated_;
  const report = [];
  for (const section of ["repository", "variables"]) {
    const keys = differingKeys(before[section], after[section]);
    const count = Object.keys(after[section] ?? {}).length;
    report.push(
      `${section}: ${keys.length === 0 ? `same (${count} entries)` : `differ: ${keys.join(", ")}`}`,
    );
    if (keys.length > 0) failed = true;
  }
  const rest = (grammar) =>
    Object.fromEntries(
      Object.entries(grammar).filter(([key]) => !["repository", "variables"].includes(key)),
    );
  const topKeys = differingKeys(rest(before), rest(after));
  report.push(
    `patterns and other top-level keys: ${topKeys.length === 0 ? `same (${Object.keys(rest(after)).join(", ")})` : `differ: ${topKeys.join(", ")}`}`,
  );
  if (topKeys.length > 0) failed = true;
  const luauFile = `${location}/${LUAU_FILE_GRAMMAR}`;
  const luauSame = atBase(luauFile) === atHead(luauFile);
  report.push(`${LUAU_FILE_GRAMMAR}: ${luauSame ? "byte-identical" : "differs"}`);
  if (!luauSame) failed = true;
  console.log(`${file} against ${base}:\n  ${report.join("\n  ")}`);
}
process.exitCode = failed ? 1 : 0;

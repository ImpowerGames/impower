import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const words = (text) => text.trim().split(/\s+/).length;
const withoutFences = (text) => {
  let fence = null;
  return text.split(/\r?\n/).filter((line) => {
    const mark = line.match(/^\s*(`{3,}|~{3,})/);
    if (mark) {
      if (!fence) fence = mark[1];
      else if (mark[1][0] === fence[0] && mark[1].length >= fence.length) fence = null;
      return false;
    }
    return !fence;
  }).join("\n");
};
function inspect(files) {
  const errors = [], visited = new Set(), edges = new Set();
  const visit = (file) => {
    if (visited.has(file)) return;
    visited.add(file);
    const text = files.get(file);
    if (text === undefined) { errors.push("missing: " + file); return; }
    for (const match of withoutFences(text).matchAll(/\[[^\]\n]*\]\(([^)\s]+)\)/g)) {
      const target = match[1].split("#")[0];
      if (!target || /^[a-z]+:/i.test(target)) continue;
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), target));
      if (resolved.endsWith(".md")) {
        edges.add(file + " -> " + resolved);
        visit(resolved);
      }
    }
  };
  visit("AGENTS.md");
  visit(".agents/skills/RUNNERS.md");
  for (const [file, text] of files) {
    if (!/^\.agents\/skills\/[^/]+\/SKILL\.md$/.test(file)) continue;
    visit(file);
    if (words(text) > 1200) errors.push("oversize skill: " + file);
    const description = text.match(/^description: (.*)$/m)?.[1] ?? "";
    if (!description || words(description) > 80) errors.push("discovery description: " + file);
    if (/Read \[runner notes\].*(?:before proceeding|repository's agent instructions)/.test(text)) errors.push("unconditional reread: " + file);
  }
  if (words(files.get("AGENTS.md") ?? "") > 750) errors.push("oversize: AGENTS.md");
  if (words(files.get(".agents/skills/RUNNERS.md") ?? "") > 400) errors.push("oversize: RUNNERS.md");
  for (const file of files.keys()) {
    if (file.includes("/references/") && file.endsWith(".md") && !visited.has(file)) errors.push("unreachable: " + file);
  }
  // These pre-action routes were exercised by forward workflow simulations.
  // Global reachability alone would miss a caveat accessible only to probe authors.
  for (const mode of ["service-worker", "performance"]) {
    const route = ".agents/skills/drive-web-editor/references/" + mode + ".md -> .agents/skills/drive-web-editor/references/asset-cache.md";
    if (!edges.has(route)) errors.push("missing pre-action route: " + mode);
  }
  return errors;
}
function readDocs(dir, prefix = "") {
  const result = new Map();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      for (const pair of readDocs(path.join(dir, entry.name), name + "/")) result.set(...pair);
    } else if (entry.isFile() && name.endsWith(".md")) result.set(name, fs.readFileSync(path.join(dir, entry.name), "utf8"));
  }
  return result;
}
const docs = new Map([["AGENTS.md", fs.readFileSync(path.join(root, "AGENTS.md"), "utf8")]]);
for (const pair of readDocs(path.join(root, ".agents"), ".agents/")) docs.set(...pair);
assert.deepEqual(inspect(docs), [], "context loading contract");
const broken = new Map(docs);
broken.set("AGENTS.md", docs.get("AGENTS.md") + "\nRead [missing](.agents/references/absent.md).");
assert.ok(inspect(broken).includes("missing: .agents/references/absent.md"));
const orphan = new Map(docs);
orphan.set(".agents/references/orphan.md", "# Unreachable instructions");
assert.ok(inspect(orphan).includes("unreachable: .agents/references/orphan.md"));
const oversized = new Map(docs);
oversized.set("AGENTS.md", "word ".repeat(751));
assert.ok(inspect(oversized).includes("oversize: AGENTS.md"));
const recursive = new Map(docs);
recursive.set(".agents/skills/file-bug/SKILL.md", docs.get(".agents/skills/file-bug/SKILL.md") + "\nRead [runner notes](../RUNNERS.md) and the repository's agent instructions before proceeding.");
assert.ok(inspect(recursive).some((error) => error.startsWith("unconditional reread:")));
for (const mode of ["service-worker", "performance"]) {
  const missingRoute = new Map(docs);
  const file = ".agents/skills/drive-web-editor/references/" + mode + ".md";
  missingRoute.set(file, docs.get(file).replace("(asset-cache.md)", "(../SKILL.md)"));
  assert.ok(inspect(missingRoute).includes("missing pre-action route: " + mode));
}
console.log("PASS: entrypoint budgets, concise discovery, conditional loading, reachable references and pre-action asset-cache routes; broken-link, orphan, size, reread and route controls");

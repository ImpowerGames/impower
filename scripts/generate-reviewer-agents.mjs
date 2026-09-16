import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readReviewerDefaults } from "./reviewer-defaults.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const models = JSON.parse(fs.readFileSync(path.join(root, ".claude/reviewer-models.json"), "utf8"));
const check = process.argv.includes("--check");
const names = new Set();
function output(file, content) {
  const previous = fs.readFileSync(file, "utf8").replaceAll("\r\n", "\n");
  if (previous === content) return;
  if (check) throw new Error(`Generated file is stale: ${file}`);
  fs.writeFileSync(file, content);
}
for (const { name, model } of models) {
  if (!/^reviewer-[a-z0-9-]+$/.test(name) || !/^[a-z0-9][a-z0-9.-]+$/.test(model) || names.has(name)) throw new Error("Invalid or duplicate reviewer configuration");
  names.add(name);
  const content = `---
name: ${name}
description: Reviewer route supplied by the caller; the shared review-pr prompt supplies the task and reporting contract.
model: ${model}
tools: Read, Grep, Glob, Bash, Write
---

Check the pin before reading files or running commands. Use the model declared above as the configured reviewer route; the caller and launcher validate that the configured writer and reviewer routes are distinct and that the launch arguments select this route.

Follow the complete shared reviewer prompt supplied by the caller. A missing prompt is an aborted invocation, not a review.
`;
  const file = path.join(root, ".claude/agents", name + ".md");
  if (!fs.existsSync(file)) {
    if (check) throw new Error(`Missing definition: ${file}`);
    fs.writeFileSync(file, content);
  } else output(file, content);
}
// Every reviewer definition in the directory is registered, so a hand-added
// file cannot bypass the registry.
for (const file of fs.readdirSync(path.join(root, ".claude/agents"))) {
  if (/^reviewer-.*\.md$/.test(file) && !names.has(file.slice(0, -3))) throw new Error(`Unregistered reviewer definition: ${file}; add it to .claude/reviewer-models.json`);
}
readReviewerDefaults(root);
console.log("PASS: generated reviewer definitions and reviewer defaults");

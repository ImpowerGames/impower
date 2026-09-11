import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

Check the pin before reading files or running commands. If the prompt lacks a concrete writer model, reply exactly: ABORT: writer model not supplied.

Compare your runtime model identity, when available, against the writer, ignoring only a context-window suffix. A matching family and version must stop with: ABORT: pin failed, I am <your model id>, same as the writer.

If your runtime identity differs from the requested reviewer route, stop with: ABORT: reviewer route mismatch.

Report your configured route separately from the identity your own runtime context provides. When it supplies none, say: Runtime identity unavailable; configured route only.

Follow the complete shared reviewer prompt supplied by the caller. A missing prompt is an aborted invocation, not a review.
`;
  const file = path.join(root, ".claude/agents", name + ".md");
  if (!fs.existsSync(file)) {
    if (check) throw new Error(`Missing definition: ${file}`);
    fs.writeFileSync(file, content);
  } else output(file, content);
}
const ignore = path.join(root, ".gitignore");
const previous = fs.readFileSync(ignore, "utf8").replaceAll("\r\n", "\n");
const generated = "# BEGIN generated reviewer agents\n" + models.map(({ name }) => `!.claude/agents/${name}.md`).join("\n") + "\n# END generated reviewer agents";
if (!previous.includes("# BEGIN generated reviewer agents")) throw new Error("Missing reviewer ignore markers");
output(ignore, previous.replace(/# BEGIN generated reviewer agents[\s\S]*?# END generated reviewer agents/, () => generated));
console.log("PASS: generated reviewer definitions and ignore entries");

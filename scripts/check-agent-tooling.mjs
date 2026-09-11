import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { testShell } from "../.agents/skills/drive-web-editor/redgreen.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
// Derived from the tracked runnable set. Update this floor when adding checks;
// deleting or renaming a check must not silently reduce the expected coverage.
const MIN_CHECKS = 24;
// The grammar scanner needs the full tree and runs in typecheck.yml.
const checks = files.filter((f) => /^(?:\.agents\/|\.claude\/hooks\/|scripts\/)/.test(f) && /\.test\./.test(f) && f !== "scripts/check-node-names.test.mjs");
const runnable = checks.filter((f) => /\.test\.(?:mjs|sh)$/.test(f));
if (runnable.length < MIN_CHECKS || !checks.some((f) => f.startsWith(".agents/")) || !checks.some((f) => f.startsWith(".claude/hooks/")) || !checks.includes("scripts/link-agent-skills.test.mjs")) throw new Error(`Incomplete tooling check discovery: ${runnable.length} runnable, at least ${MIN_CHECKS} expected; stage checks and verify the checkout`);
const bash = process.platform === "win32" ? testShell() : "bash";
if (bash === true) throw new Error("Git for Windows bash is required for shell checks");
let failed = 0, ran = 0;
const skipped = [];
console.log(`Discovered ${checks.length} tracked check files`);
for (const file of checks) {
  if (/\.(?:json|snap|md|txt)$/.test(file)) continue;
  if (!/\.test\.(?:mjs|sh)$/.test(file) || !fs.existsSync(path.join(root, file))) {
    console.error(`FAILED: unsupported or missing check ${file}`); failed++; continue;
  }
  console.log(`CHECK: ${file}`);
  let output = "";
  const child = spawn(file.endsWith(".sh") ? bash : process.execPath, [file], { cwd: root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=1024" } });
  child.stdout.on("data", (chunk) => { output += chunk; process.stdout.write(chunk); });
  child.stderr.on("data", (chunk) => { output += chunk; process.stderr.write(chunk); });
  const result = await new Promise((resolve) => {
    child.once("error", (error) => resolve({ error: error.message }));
    child.once("close", (status) => resolve({ status }));
  });
  ran++;
  if (result.status !== 0) { console.error(`FAILED: ${file}: ${result.error ?? result.status}`); failed++; }
  for (const line of output.split(/\r?\n/)) if (line.startsWith("SKIP:")) skipped.push(`${file}: ${line}`);
}
const summary = `Tooling checks: ${ran} run, ${failed} failed`;
console.log(summary);
console.log(`Skipped cases: ${skipped.length}`);
for (const line of skipped) console.log(line);
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Agent tooling checks\n\n${summary}. Discovered ${checks.length} tracked files.\n\n### Skipped cases\n\n${skipped.length ? skipped.map((line) => "- " + line).join("\n") : "None."}\n\nRemaining platform coverage: #506 (extension fixtures), #507 (shell classification), #508 (process-tree stop). Zip fixtures require fflate from a workspace install. Skips do not establish compatibility.\n`);
}
process.exitCode = failed ? 1 : 0;

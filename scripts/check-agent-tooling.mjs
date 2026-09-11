import fs from "node:fs";
import path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { testShell } from "../.agents/skills/drive-web-editor/redgreen.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
// The grammar scanner's check needs the full source tree and already runs in
// typecheck.yml. Every other script check belongs to this sparse tooling job.
const checks = files.filter((f) => /^(?:\.agents\/|\.claude\/hooks\/|scripts\/)/.test(f) && /\.test\./.test(f) && f !== "scripts/check-node-names.test.mjs");
if (!checks.length || !checks.some((f) => f.startsWith(".agents/")) || !checks.some((f) => f.startsWith(".claude/hooks/")) || !checks.includes("scripts/link-agent-skills.test.mjs")) throw new Error("Incomplete tooling check discovery; stage new checks and verify the checkout");
const bash = process.platform === "win32" ? testShell() : "bash";
if (bash === true) throw new Error("Git for Windows bash is required for shell checks");
let failed = 0, ran = 0;
console.log(`Discovered ${checks.length} tracked check files`);
for (const file of checks) {
  if (/\.(?:json|snap|md|txt)$/.test(file)) continue;
  if (!/\.test\.(?:mjs|sh)$/.test(file) || !fs.existsSync(path.join(root, file))) {
    console.error(`FAILED: unsupported or missing check ${file}`); failed++; continue;
  }
  console.log(`CHECK: ${file}`);
  const r = spawnSync(file.endsWith(".sh") ? bash : process.execPath, [file], { cwd: root, stdio: "inherit", windowsHide: true, env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=1024" } });
  ran++;
  if (r.status !== 0) { console.error(`FAILED: ${file}: ${r.error?.message ?? r.status}`); failed++; }
}
console.log(`Tooling checks: ${ran} run, ${failed} failed`);
process.exitCode = failed ? 1 : 0;

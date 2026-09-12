import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { testShell } from "../.agents/skills/drive-web-editor/redgreen.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
// Derived from the tracked runnable set. Update this count when adding checks;
// deleting or renaming a check must not silently reduce the expected coverage.
const EXPECTED_CHECKS = 29;
// The grammar scanner needs the full tree and runs in typecheck.yml.
const checks = files.filter((f) => /^(?:\.agents\/|\.claude\/hooks\/|\.github\/scripts\/|scripts\/)/.test(f) && /\.test\./.test(f) && f !== "scripts/check-node-names.test.mjs");
const runnable = checks.filter((f) => /\.test\.(?:mjs|sh)$/.test(f));
const fixtures = checks.filter((f) => /\.(?:json|snap|md|txt)$/.test(f));
const candidates = checks.filter((f) => !fixtures.includes(f));
if (runnable.length !== EXPECTED_CHECKS || !checks.some((f) => f.startsWith(".agents/")) || !checks.some((f) => f.startsWith(".claude/hooks/")) || !checks.includes("scripts/link-agent-skills.test.mjs")) throw new Error(`Incomplete tooling check discovery: ${runnable.length} runnable, exactly ${EXPECTED_CHECKS} expected; stage checks and verify the checkout`);
const bash = process.env.AGENT_TOOLING_BASH || (process.platform === "win32" ? testShell() : "bash");
if (bash === true) throw new Error("Git for Windows bash is required for shell checks");
const probe = execFileSync(bash, ["-c", 'test -n "$BASH_VERSION" && printf agent-tooling-bash'], { encoding: "utf8", timeout: 10000, windowsHide: true });
if (probe !== "agent-tooling-bash") throw new Error("Required Bash probe failed");
const env = { ...process.env, NODE_OPTIONS: "--max-old-space-size=1024", AGENT_TOOLING_BASH: bash };
// Node inherits the first case-insensitive PATH key on Windows.
const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") || "PATH";
if (path.isAbsolute(bash)) {
  env[pathKey] = [path.dirname(bash), path.resolve(path.dirname(bash), "../usr/bin"), env[pathKey] || ""].join(path.delimiter);
}
const timeoutMs = Number(process.env.AGENT_TOOLING_TIMEOUT_MS || 300000);
if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 3600000) throw new Error("AGENT_TOOLING_TIMEOUT_MS must be an integer from 100 to 3600000");
let failed = 0, ran = 0, timedOut = 0, exitUnconfirmed = 0;
const skipped = [];
const missingFixtures = [];
const attemptedFiles = new Set();
console.log(`Discovered ${candidates.length} tracked check files and ${fixtures.length} data fixtures`);
console.log(`Verified Bash: ${bash}; per-check timeout: ${timeoutMs} ms`);
for (const file of fixtures) {
  if (!fs.existsSync(path.join(root, file))) { console.error(`FAILED: missing data fixture ${file}`); missingFixtures.push(file); failed++; }
  else console.log(`FIXTURE: ${file}: non-executable data, excluded from check coverage`);
}
for (const file of candidates) {
  if (!/\.test\.(?:mjs|sh)$/.test(file) || !fs.existsSync(path.join(root, file))) {
    const hint = /\.(?:json|snap|md|txt)$/i.test(file) ? "; data fixture extensions must be lowercase (.json, .snap, .md, .txt)" : "";
    console.error(`FAILED: unsupported or missing check ${file}${hint}`); failed++; continue;
  }
  console.log(`CHECK: ${file}`);
  const started = Date.now();
  let output = "";
  const child = spawn(file.endsWith(".sh") ? bash : process.execPath, [file], { cwd: root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, detached: process.platform !== "win32", env });
  child.stdout.on("data", (chunk) => { output += chunk; process.stdout.write(chunk); });
  child.stderr.on("data", (chunk) => { output += chunk; process.stderr.write(chunk); });
  const result = await new Promise((resolve) => {
    let timedOut = false, cleanupError = null, cleanupTimer;
    const finish = (result) => { clearTimeout(timer); clearTimeout(cleanupTimer); clearInterval(progress); resolve({ ...result, timedOut, cleanupError }); };
    const progress = setInterval(() => console.log(`RUNNING: ${file}: ${Date.now() - started} ms; awaiting exit`), 30000);
    const timer = setTimeout(() => {
      timedOut = true;
      console.error(`TIMEOUT: ${file}; stopping launched ${process.platform === "win32" ? "process tree" : "process group"} ${child.pid}`);
      try {
        if (child.exitCode !== null || child.signalCode !== null) throw new Error("launched parent already exited; refusing an unowned process identifier, inspect remaining descendants");
        if (process.platform === "win32") {
          execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 10000, stdio: "pipe" });
        }
        else process.kill(-child.pid, "SIGKILL");
      } catch (error) { cleanupError = error.message; }
      cleanupTimer = setTimeout(() => {
        child.stdout.destroy(); child.stderr.destroy(); child.unref();
        finish({ error: "process exit could not be confirmed", cleanupUnconfirmed: true });
      }, 10000);
    }, timeoutMs);
    child.once("error", (error) => finish({ error: error.message }));
    child.once("close", (status, signal) => finish({ status, signal }));
  });
  ran++;
  attemptedFiles.add(file);
  if (result.timedOut) timedOut++;
  if (result.cleanupUnconfirmed) exitUnconfirmed++;
  const passed = result.status === 0 && !result.timedOut;
  console.log(`DONE: ${file}: ${passed ? "passed" : result.timedOut ? "timed out" : "failed"}; exit=${result.status ?? "unconfirmed"}; signal=${result.signal ?? "none"}; ${Date.now() - started} ms`);
  if (!passed) { console.error(`FAILED: ${file}: ${result.error ?? result.status}`); failed++; }
  for (const line of output.split(/\r?\n/)) if (line.startsWith("SKIP:")) skipped.push(`${file}: ${line}`);
  if (result.cleanupError || result.cleanupUnconfirmed) {
    console.error(`ABORT: cleanup was not confirmed: ${result.cleanupError || result.error}; remaining checks were not run`);
    break;
  }
  if (result.timedOut) {
    console.error("ABORT: timed-out check requires inspection before later checks; detached descendants are not proven stopped by the parent's exit");
    break;
  }
}
for (const file of candidates) if (!attemptedFiles.has(file)) console.log(`NOT RUN: ${file}: no invocation attempted`);
const summary = `Tooling checks: ${ran} run, ${failed} failed, ${candidates.length - ran} not run; ${timedOut} timed out, ${exitUnconfirmed} exit unconfirmed; ${fixtures.length} data fixtures`;
console.log(summary);
console.log(`Skipped cases: ${skipped.length}`);
for (const line of skipped) console.log(line);
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Agent tooling checks\n\n${summary}. Discovered ${candidates.length} tracked check files and ${fixtures.length} data fixtures.\n\n### Missing data fixtures\n\n${missingFixtures.length ? missingFixtures.map((file) => "- " + file).join("\n") : "None."}\n\n### Skipped cases\n\n${skipped.length ? skipped.map((line) => "- " + line).join("\n") : "None."}\n\nPortable extension fixtures, shell classification, directory-link access and launcher-tree shutdown run in both matrix legs. Zip fixtures require fflate from a workspace install; directory-link capability skips report their filesystem error. Windows-only held-tree and long-path cases are exercised by the Windows matrix leg. Skips do not establish compatibility.\n`);
}
process.exitCode = failed ? 1 : 0;

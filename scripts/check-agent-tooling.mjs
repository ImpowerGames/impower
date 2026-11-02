import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { testShell } from "../.agents/skills/drive-web-editor/redgreen.mjs";
import { toolDirectories } from "./link-agent-skills.mjs";
import { useWorktreeTemp } from "../.agents/skills/drive-web-editor/worktree-temp.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
useWorktreeTemp(root);
const skillsSource = fs.realpathSync(path.join(root, ".agents", "skills"));
const unlinked = toolDirectories.map((tool) => `${tool}/skills`).filter((link) => {
  try { return fs.realpathSync(path.join(root, link)) !== skillsSource; }
  catch (error) { if (error.code === "ENOENT") return true; throw error; }
});
if (unlinked.length) throw new Error(`Skill discovery links missing or foreign: ${unlinked.join(", ")}; run node scripts/link-agent-skills.mjs from this checkout, then rerun`);
const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", windowsHide: true }).split("\0").filter(Boolean).filter((f) => !f.startsWith("scripts/agent-notification-alerts/"));
const FULL_TREE_CHECKS = ["scripts/check-node-names.test.mjs", "scripts/check-lowerer-conventions.test.mjs"];
const isCheck = (f) => /^(?:\.agents\/|\.claude\/hooks\/|\.github\/scripts\/|scripts\/)/.test(f) && /\.test\./.test(f) && !FULL_TREE_CHECKS.includes(f) && !f.startsWith("scripts/agent-notification-alerts/");
const checks = files.filter(isCheck);
const runnable = checks.filter((f) => /\.test\.(?:mjs|sh)$/.test(f));
const fixtures = checks.filter((f) => /\.(?:json|snap|md|txt)$/.test(f));
const discovered = checks.filter((f) => !fixtures.includes(f));
const manifestFile = "scripts/agent-tooling-checks.txt";
if (!files.includes(manifestFile) || !fs.existsSync(path.join(root, manifestFile))) throw new Error(`Incomplete tooling check discovery: missing tracked manifest ${manifestFile}; stage checks and verify the checkout`);
const expected = fs.readFileSync(path.join(root, manifestFile), "utf8").trimEnd().split(/\r?\n/);
if (expected.some((f, i) => !isCheck(f) || !/\.test\.(?:mjs|sh)$/.test(f) || (i > 0 && expected[i - 1] >= f))) throw new Error(`Invalid tooling check manifest ${manifestFile}: use sorted, unique runnable check paths, one per line`);
const missing = expected.filter((f) => !runnable.includes(f) || !fs.existsSync(path.join(root, f)));
const unlisted = runnable.filter((f) => !expected.includes(f));
const untracked = execFileSync("git", ["ls-files", "--others", "-z", "--", ".agents/", ".claude/hooks/", ".github/scripts/", "scripts/"], { cwd: root, encoding: "utf8", windowsHide: true }).split("\0").filter((f) => isCheck(f) && !/\.(?:json|snap|md|txt)$/.test(f));
if (missing.length || unlisted.length || untracked.length || !checks.some((f) => f.startsWith(".agents/")) || !checks.some((f) => f.startsWith(".claude/hooks/")) || !checks.includes("scripts/link-agent-skills.test.mjs")) throw new Error(`Incomplete tooling check discovery: missing ${JSON.stringify(missing)}, unlisted ${JSON.stringify(unlisted)}, untracked ${JSON.stringify(untracked)}; preserve .agents/, .claude/hooks/ and scripts/link-agent-skills.test.mjs anchors; update ${manifestFile}, stage checks and verify the checkout`);
const DRIVER_PREFIXES = [".agents/skills/clean-worktrees/", ".agents/skills/drive-vscode-web/", ".agents/skills/drive-web-editor/", "scripts/"];
const tierOf = (file) => (DRIVER_PREFIXES.some((prefix) => file.startsWith(prefix)) ? "drivers" : "skills");
const args = process.argv.slice(2);
let tier = "all";
const only = [];
let concurrencyArg = process.env.AGENT_TOOLING_CONCURRENCY || undefined;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  const value = () => { if (i + 1 >= args.length) throw new Error(`${arg} needs a value`); return args[++i]; };
  if (arg === "--tier") tier = value();
  else if (arg.startsWith("--tier=")) tier = arg.slice("--tier=".length);
  else if (arg === "--only") only.push(value());
  else if (arg.startsWith("--only=")) only.push(arg.slice("--only=".length));
  else if (arg === "--concurrency") concurrencyArg = value();
  else if (arg.startsWith("--concurrency=")) concurrencyArg = arg.slice("--concurrency=".length);
  else throw new Error(`Unknown argument ${arg}; use --tier skills|drivers|all, --only <path substring> (repeatable) and --concurrency <1-64>`);
}
if (!["skills", "drivers", "all"].includes(tier)) throw new Error(`--tier must be skills, drivers or all, not ${tier}`);
const concurrency = concurrencyArg === undefined ? Math.min(4, os.availableParallelism()) : Number(concurrencyArg);
if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 64) throw new Error(`--concurrency (or AGENT_TOOLING_CONCURRENCY) must be an integer from 1 to 64, not ${concurrencyArg}`);
const candidates = discovered.filter((f) => (tier === "all" || tierOf(f) === tier) && (!only.length || only.some((needle) => f.includes(needle))));
if (!candidates.length) throw new Error(`No check selected by --tier ${tier}${only.length ? ` --only ${only.join(" ")}` : ""}; ${discovered.length} discovered`);
const selection = `${tier === "all" ? "every tier" : `the ${tier} tier`}${only.length ? `, paths containing ${only.map((n) => JSON.stringify(n)).join(", ")}` : ""}`;
const bash = process.env.AGENT_TOOLING_BASH || (process.platform === "win32" ? testShell() : "bash");
if (bash === true) throw new Error("Git for Windows bash is required for shell checks");
const probe = execFileSync(bash, ["-c", 'test -n "$BASH_VERSION" && printf agent-tooling-bash'], { encoding: "utf8", timeout: 10000, windowsHide: true });
if (probe !== "agent-tooling-bash") throw new Error("Required Bash probe failed");
const env = { ...process.env, NODE_OPTIONS: "--max-old-space-size=1024", AGENT_TOOLING_BASH: bash };
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
console.log(`Discovered ${discovered.length} tracked check files and ${fixtures.length} data fixtures`);
console.log(`Selected ${candidates.length} of ${discovered.length} checks: ${selection}`);
console.log(`Verified Bash: ${bash}; per-check timeout: ${timeoutMs} ms; concurrency: ${concurrency}`);
for (const file of fixtures) {
  if (!fs.existsSync(path.join(root, file))) { console.error(`FAILED: missing data fixture ${file}`); missingFixtures.push(file); failed++; }
  else console.log(`FIXTURE: ${file}: non-executable data, excluded from check coverage`);
}
const header = (file) => fs.readFileSync(path.join(root, file), "utf8").split(/\r?\n/, 10).join("\n");
const serialOf = (file) => header(file).match(/^(?:\/\/|#) agent-tooling-serial: (.+)$/m)?.[1];
async function runCheck(file, onTimeout) {
  const buffered = [];
  const out = (text) => buffered.push([process.stdout, `${text}\n`]);
  const err = (text) => buffered.push([process.stderr, `${text}\n`]);
  const flush = () => { for (const [stream, text] of buffered) stream.write(text); };
  if (!/\.test\.(?:mjs|sh)$/.test(file) || !fs.existsSync(path.join(root, file))) {
    const hint = /\.(?:json|snap|md|txt)$/i.test(file) ? "; data fixture extensions must be lowercase (.json, .snap, .md, .txt)" : "";
    err(`FAILED: unsupported or missing check ${file}${hint}`); failed++; flush(); return {};
  }
  const declared = header(file).match(/^(?:\/\/|#) agent-tooling-timeout-ms: (\d+)$/m);
  const checkTimeoutMs = declared ? Number(declared[1]) : timeoutMs;
  if (!Number.isSafeInteger(checkTimeoutMs) || checkTimeoutMs < 100 || checkTimeoutMs > 3600000) { err(`FAILED: ${file}: declared agent-tooling-timeout-ms must be an integer from 100 to 3600000`); failed++; flush(); return {}; }
  const serial = serialOf(file);
  out(`CHECK: ${file}${declared ? `; declared timeout: ${checkTimeoutMs} ms` : ""}${serial ? `; serial-only: ${serial}` : ""}`);
  const started = Date.now();
  let output = "";
  const child = spawn(file.endsWith(".sh") ? bash : process.execPath, [file], { cwd: root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, detached: process.platform !== "win32", env });
  child.stdout.on("data", (chunk) => { output += chunk; buffered.push([process.stdout, chunk]); });
  child.stderr.on("data", (chunk) => { output += chunk; buffered.push([process.stderr, chunk]); });
  const result = await new Promise((resolve) => {
    let timedOut = false, cleanupError = null, cleanupTimer;
    const finish = (result) => { clearTimeout(timer); clearTimeout(cleanupTimer); clearInterval(progress); resolve({ ...result, timedOut, cleanupError }); };
    const progress = setInterval(() => console.log(`RUNNING: ${file}: ${Date.now() - started} ms; awaiting exit`), 30000);
    const timer = setTimeout(() => {
      timedOut = true;
      onTimeout();
      err(`TIMEOUT: ${file}; stopping launched ${process.platform === "win32" ? "process tree" : "process group"} ${child.pid}`);
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
    }, checkTimeoutMs);
    child.once("error", (error) => finish({ error: error.message }));
    child.once("close", (status, signal) => finish({ status, signal }));
  });
  ran++;
  attemptedFiles.add(file);
  if (result.timedOut) timedOut++;
  if (result.cleanupUnconfirmed) exitUnconfirmed++;
  const passed = result.status === 0 && !result.timedOut;
  out(`DONE: ${file}: ${passed ? "passed" : result.timedOut ? "timed out" : "failed"}; exit=${result.status ?? "unconfirmed"}; signal=${result.signal ?? "none"}; ${Date.now() - started} ms`);
  if (!passed) { err(`FAILED: ${file}: ${result.error ?? result.status}`); failed++; }
  for (const line of output.split(/\r?\n/)) if (line.startsWith("SKIP:")) skipped.push(`${file}: ${line}`);
  let abort = false;
  if (result.cleanupError || result.cleanupUnconfirmed) {
    err(`ABORT: cleanup was not confirmed: ${result.cleanupError || result.error}; remaining checks were not run`); abort = true;
  } else if (result.timedOut) {
    err("ABORT: timed-out check requires inspection before later checks; detached descendants are not proven stopped by the parent's exit"); abort = true;
  }
  flush();
  return { abort };
}
await new Promise((resolve) => {
  const queue = [...candidates];
  let active = 0, exclusive = false, aborted = false;
  const abort = () => { aborted = true; };
  const pump = () => {
    while (!aborted && !exclusive && queue.length && active < concurrency) {
      const serial = fs.existsSync(path.join(root, queue[0])) && /\.test\.(?:mjs|sh)$/.test(queue[0]) && serialOf(queue[0]) !== undefined;
      if (serial && active > 0) break;
      const file = queue.shift();
      active++;
      if (serial) exclusive = true;
      runCheck(file, abort).then((result) => { active--; if (serial) exclusive = false; if (result.abort) abort(); pump(); });
      if (serial) break;
    }
    if (active === 0 && (aborted || !queue.length)) resolve();
  };
  pump();
});
for (const file of candidates) if (!attemptedFiles.has(file)) console.log(`NOT RUN: ${file}: no invocation attempted`);
const summary = `Tooling checks (${selection}): ${ran} run, ${failed} failed, ${candidates.length - ran} not run; ${timedOut} timed out, ${exitUnconfirmed} exit unconfirmed; ${fixtures.length} data fixtures; concurrency ${concurrency}`;
console.log(summary);
console.log(`Skipped cases: ${skipped.length}`);
for (const line of skipped) console.log(line);
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Agent tooling checks\n\n${summary}. Discovered ${discovered.length} tracked check files, ${candidates.length} selected, and ${fixtures.length} data fixtures.\n\n### Missing data fixtures\n\n${missingFixtures.length ? missingFixtures.map((file) => "- " + file).join("\n") : "None."}\n\n### Skipped cases\n\n${skipped.length ? skipped.map((line) => "- " + line).join("\n") : "None."}\n\nPortable extension fixtures, shell classification, directory-link access and launcher-tree shutdown run in both matrix legs. Zip fixtures require fflate from a workspace install; directory-link capability skips report their filesystem error. Windows-only held-tree and long-path cases are exercised by the Windows matrix leg. Skips do not establish compatibility.\n`);
}
process.exitCode = failed ? 1 : 0;

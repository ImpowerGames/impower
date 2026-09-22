#!/usr/bin/env node
// Pins that two agent sessions driving one checkout keep separate server
// records: session B's `status` does not report session A's servers as its
// own, B's `down` leaves A's server tree running, `status --all` still shows
// A's servers to a caller that asks for every session, and A's own `down`
// stops them.
// Run:
//   node .agents/skills/drive-web-editor/two-sessions.test.mjs
//
// The driver is copied into a scratch repository whose package.json makes
// `npm run web:dev` start a fixture of three process generations holding TCP
// listeners, so every process signalled belongs to this check. The sessions
// differ only in IMPOWER_DRIVER_SESSION, with IMPOWER_DRIVER_HOME inside the
// scratch directory. This file imports nothing from the driver, so a red run
// can substitute an older driver. Node's built-in assert only.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "two-sessions-"));
console.log(`scratch repository: ${path.join(scratch, "repo")}`);
const copyDir = path.join(scratch, "repo", ".agents", "skills", "drive-web-editor");
fs.mkdirSync(copyDir, { recursive: true });
fs.mkdirSync(path.join(scratch, "repo", ".agents", "skills", "resolve-issue"), { recursive: true });
for (const name of fs.readdirSync(here).filter((n) => n.endsWith(".mjs") && !n.includes(".test."))) fs.copyFileSync(path.join(here, name), path.join(copyDir, name));
// The driver imports the repository's detached launcher.
fs.mkdirSync(path.join(scratch, "repo", "scripts"));
fs.copyFileSync(path.join(here, "..", "..", "..", "scripts", "detached-launch.mjs"), path.join(scratch, "repo", "scripts", "detached-launch.mjs"));
const driver = path.join(copyDir, "driver.mjs");

const fixture = path.join(scratch, "tree.mjs");
const rowsFile = path.join(scratch, "tree.jsonl");
fs.writeFileSync(fixture, [
  'import fs from "node:fs";',
  'import net from "node:net";',
  'import { spawn } from "node:child_process";',
  "const [file, role] = process.argv.slice(2);",
  'process.on("SIGTERM", () => {});',
  'if (role !== "leaf") spawn(process.execPath, [process.argv[1], file, role === "root" ? "child" : "leaf"], { stdio: "ignore", windowsHide: true });',
  "const server = net.createServer();",
  'server.listen(0, "127.0.0.1", () => fs.appendFileSync(file, JSON.stringify({ pid: process.pid }) + "\\n"));',
].join("\n"));
fs.writeFileSync(path.join(scratch, "repo", "package.json"), JSON.stringify({ scripts: { "web:dev": `node "${fixture.replaceAll("\\", "/")}" "${rowsFile.replaceAll("\\", "/")}" root` } }));

const home = path.join(scratch, "home");
const envOf = (session) => {
  const env = { ...process.env, IMPOWER_DRIVER_HOME: home, IMPOWER_DRIVER_SESSION: session };
  delete env.CLAUDE_CODE_SESSION_ID;
  delete env.CODEX_THREAD_ID;
  return env;
};
const run = (session, ...args) => {
  const r = spawnSync(process.execPath, [driver, ...args], { encoding: "utf8", windowsHide: true, timeout: 60_000, env: envOf(session) });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
};
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
};
const rows = () => (fs.existsSync(rowsFile) ? fs.readFileSync(rowsFile, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : []);

let failures = 0;
const check = async (name, fn) => {
  try {
    await fn();
    console.log(`PASS: ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL: ${name}`);
    console.log(`  ${String(err.message).split("\n").join("\n  ")}`);
  }
};

// Session A launches. `up` then waits for a URL the fixture never serves, so
// it is stopped once its record is written; the tree it launched stays up.
const up = spawn(process.execPath, [driver, "up"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true, env: envOf("session-a") });
let upOut = "";
up.stdout.on("data", (d) => (upOut += d));
up.stderr.on("data", (d) => (upOut += d));
try {
  for (let i = 0; i < 600 && (rows().length < 3 || !/launching dev servers/.test(upOut)); i++) await sleep(100);
  assert.equal(rows().length, 3, `session A's launch never started the fixture tree:\n${upOut}`);
  up.kill();
  const tree = rows().map((r) => r.pid);

  await check("session B's status does not report session A's servers", () => {
    const s = run("session-b", "status");
    assert.match(s.out, /down \(no state file\)/, s.out);
  });

  await check("session B's down leaves session A's server tree running", async () => {
    run("session-b", "down");
    await sleep(1500);
    assert.deepEqual(tree.filter((pid) => !alive(pid)), [], "session B's down stopped part of session A's tree");
  });

  await check("status --all shows session A's servers to session B", () => {
    const s = run("session-b", "status", "--all");
    assert.match(s.out, /session=session-a/, s.out);
  });

  await check("session A's down stops its own tree", async () => {
    const d = run("session-a", "down");
    assert.equal(d.status, 0, d.out);
    for (let i = 0; i < 40 && tree.some(alive); i++) await sleep(250);
    assert.deepEqual(tree.filter(alive), [], d.out);
  });
} catch (err) {
  failures++;
  console.log(`FAIL: ${err.message}`);
} finally {
  up.kill();
  for (const { pid } of rows()) if (alive(pid)) spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  if (process.platform !== "win32") for (const { pid } of rows()) try { process.kill(pid, "SIGKILL"); } catch {}
  await sleep(500);
  console.log(`Remove scratch repository: ${scratch}`);
  try {
    fs.rmSync(scratch, { recursive: true, force: true });
  } catch (err) {
    console.log(`could not remove ${scratch} (${err.code}); preserve it for recovery`);
  }
}

if (failures) {
  console.log(`${failures} failing`);
  process.exit(1);
}
console.log("all passed");

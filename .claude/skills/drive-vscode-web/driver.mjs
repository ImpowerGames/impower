#!/usr/bin/env node
// Agent driver for the Sparkdown VS Code extension, served headlessly.
//
// `@vscode/test-web` serves a downloaded VS Code for the Web build with the
// extension under vscode-sparkdown/ loaded as a development extension and a
// project folder mounted as the workspace. This driver owns the loop that the
// "look at the pixels" gate in CLAUDE.md needs for a change under
// vscode-sparkdown/: serve on a port pinned to this worktree, repair the
// stylesheet name the served build and the server disagree on, open a .sd
// file in the workbench with Playwright, read its diagnostics and a hover,
// and write the screenshot.
//
//   node .claude/skills/drive-vscode-web/driver.mjs up --sd repro.sd
//   node .claude/skills/drive-vscode-web/driver.mjs verify --hover colorscript_001 --shot after.png
//   node .claude/skills/drive-vscode-web/driver.mjs down
//
// This file must live inside the repo tree: Node resolves `playwright` from
// the script's directory, not from cwd. State (URL, server pid, served
// folder) lives in .state.json beside this file, which is gitignored.

import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  pidAlive,
  processStartedMs,
  recordStands,
  resolveChromiumExecutablePath,
} from "../drive-web-editor/driver.mjs";

const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SKILL_DIR, "..", "..", "..");
const EXT_DIR = path.join(REPO_ROOT, "vscode-sparkdown");
const EXTENSION_JS = path.join(EXT_DIR, "out", "extension.js");
const STATE_FILE = path.join(SKILL_DIR, ".state.json");
// The server is a devDependency of vscode-sparkdown, so it is resolved from
// there, wherever npm placed it.
const SERVER_ENTRY = (() => {
  try {
    return path.join(path.dirname(createRequire(path.join(EXT_DIR, "package.json")).resolve("@vscode/test-web/package.json")), "out", "server", "index.js");
  } catch {
    return path.join(REPO_ROOT, "node_modules", "@vscode", "test-web", "out", "server", "index.js");
  }
})();
// The VS Code build (about 55 MB, downloaded once per quality and commit),
// the served project folders and the server logs live outside every
// worktree, so the download is shared and none of it sits in a tree
// `git add -A` could reach.
const DEFAULT_DATA_DIR = path.join(os.tmpdir(), "impower-vscode-test-web");
// The first `up` downloads and unpacks the build before the port answers.
const READY_WAIT_MS = 10 * 60_000;

const log = (...a) => console.log(...a);
const die = (msg) => {
  console.error("ERROR: " + msg);
  process.exit(1);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const firstLine = (err) => String(err?.message ?? err).split("\n")[0];

// ------------------------------------------------------------- pure parts ---

// The served build ships its stylesheet as workbench.web.main.internal.css and
// the server's page template links workbench.web.main.css, so without a copy
// under the second name the workbench renders unstyled: no explorer rows, no
// visible editor, every Playwright visibility wait times out. Copies the file
// into place under every unpacked build in the directory and reports which
// builds it touched. A copy that is already there and the same size as the
// original is left alone; a shorter one (a copy interrupted mid-run) is
// written again. The copy lands under a temporary name and is renamed into
// place, so a partial file is never the one the page loads.
export function aliasWorkbenchCss(buildsDir) {
  const aliased = [];
  const present = [];
  if (!fs.existsSync(buildsDir)) return { aliased, present };
  for (const entry of fs.readdirSync(buildsDir)) {
    if (!entry.startsWith("vscode-web-")) continue;
    const dir = path.join(buildsDir, entry, "out", "vs", "workbench");
    const internal = path.join(dir, "workbench.web.main.internal.css");
    const linked = path.join(dir, "workbench.web.main.css");
    if (!fs.existsSync(internal)) continue;
    if (fs.existsSync(linked) && fs.statSync(linked).size === fs.statSync(internal).size) {
      present.push(dir);
      continue;
    }
    const tmp = linked + ".tmp";
    fs.copyFileSync(internal, tmp);
    fs.renameSync(tmp, linked);
    aliased.push(dir);
  }
  return { aliased, present };
}

// Where things live under the data directory. The server deletes the whole
// directory it is given as `--testRunnerDataDir` before it downloads a build
// it does not have yet, so that directory holds nothing but builds, one
// subdirectory per quality so a first insiders download cannot take the
// stable build with it; the served projects and the server logs sit beside
// it, where a download cannot take them.
export function dataLayout(root) {
  return {
    builds: path.join(root, "builds"),
    projects: path.join(root, "projects"),
    logs: path.join(root, "logs"),
  };
}

const inside = (dir, p) => {
  const rel = path.relative(dir, p);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

// The commit of the build already unpacked under a quality's builds
// directory, or null. The server names an unpacked build
// `vscode-web-<quality>-<commit>` and writes a `version` file into it once
// the download is complete; given that commit back as `--commit`, the server
// serves the build it has and never reaches the code path that deletes the
// directory, so a new VS Code release cannot pull the build out from under a
// server another worktree is running.
export function unpackedCommit(buildsDir) {
  if (!fs.existsSync(buildsDir)) return null;
  for (const entry of fs.readdirSync(buildsDir)) {
    const m = /^vscode-web-[a-z]+-([0-9a-f]{40})$/.exec(entry);
    if (m && fs.existsSync(path.join(buildsDir, entry, "version"))) return m[1];
  }
  return null;
}

// Everything a launch is made of, from the options: the server's argument
// list, the folder it serves, and where its log goes. `up` runs exactly this
// plan, so pinning it pins the wiring: the directory the server may delete
// is the one under `builds`, and neither the served project nor the log is
// inside it.
export function launchPlan({ data, port, quality = "stable", sd, project, commit, extDir, entry }) {
  if (sd && project) return { error: "give --sd or --project, not both" };
  if (!sd && !project) return { error: "give --sd <file.sd> (a one-file project) or --project <folder>" };
  const layout = dataLayout(data);
  const builds = path.join(layout.builds, quality);
  const served = sd ? path.join(layout.projects, String(port)) : path.resolve(project);
  if (inside(layout.builds, served)) return { error: `--project ${served} is inside ${layout.builds}, which the server deletes before a download; serve it from anywhere else` };
  const logPath = path.join(layout.logs, `serve-${port}.log`);
  const args = [
    entry,
    "--browser", "none",
    "--quality", quality,
    "--esm",
    "--port", String(port),
    "--testRunnerDataDir", builds,
    ...(commit ? ["--commit", commit] : []),
    "--extensionDevelopmentPath", extDir,
    served,
  ];
  return { builds, project: served, ownProject: Boolean(sd), logPath, args };
}

// A stable port from the worktree path, so each worktree serves on its own
// port and a second `up` in the same worktree finds its own server rather
// than another worktree's. The base and the 200 ports scanned above it stay
// under the web editor driver's 38000.
export function portBase(root) {
  let h = 0;
  for (const ch of root) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 34000 + (h % 1000);
}
export const PORT_SCAN = 200;

// The first source file newer than the built extension, or null. The
// extension bundles the language server, which bundles the packages, so a
// change under any package's src is a change to what the served workbench
// runs; tests and snapshots are not.
export function newerSource(builtMs, dirs) {
  const skip = new Set(["node_modules", "dist", "out", "__snapshots__", "tests", "__tests__"]);
  const stack = dirs.filter((d) => fs.existsSync(d));
  while (stack.length) {
    const dir = stack.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!skip.has(e.name)) stack.push(p);
        continue;
      }
      if (/\.test\./.test(e.name)) continue;
      if (fs.statSync(p).mtimeMs > builtMs) return p;
    }
  }
  return null;
}

// Monaco renders every space in a rendered line as a non-breaking space, so a
// line's text never contains the plain space the source has. Both sides of a
// text match go through this; it runs in the page too, by source.
export function normalizeMonacoText(text) {
  return (text || "").replace(/ /g, " ");
}

// Where `word` sits as a whole word on the first of `lines` that holds it
// (restricted to lines containing `lineText` when given): the line's index
// and the character range. A whole word is bounded by line edges or by
// characters that are not letters, digits or underscores, so `missing` does
// not match inside `missing_backdrop`; a word that itself begins or ends
// with punctuation is bounded on that side by definition.
export function locateWord(lines, word, lineText) {
  const wordChar = (c) => /[A-Za-z0-9_]/.test(c);
  const wanted = lineText ? normalizeMonacoText(lineText) : null;
  for (let index = 0; index < lines.length; index++) {
    const text = normalizeMonacoText(lines[index]);
    if (wanted && !text.includes(wanted)) continue;
    for (let from = 0; from <= text.length - word.length; ) {
      const start = text.indexOf(word, from);
      if (start < 0) break;
      const end = start + word.length;
      const left = start === 0 || !wordChar(text[start - 1]) || !wordChar(word[0]);
      const right = end === text.length || !wordChar(text[end]) || !wordChar(word[word.length - 1]);
      if (left && right) return { index, start, end };
      from = start + 1;
    }
  }
  return null;
}

// The line and column the status bar's selection item reports (`Ln 8, Col 5`).
export function cursorAt(text) {
  const m = /Ln (\d+), Col (\d+)/.exec(text || "");
  return m ? { line: Number(m[1]), col: Number(m[2]) } : null;
}

// Whether a series of readings has stopped changing. The readings are the
// diagnostics snapshot verify takes once a second after opening the file. The
// extension host and the language server boot in workers after the page
// loads, so the first readings are the workbench's own "no problems" and say
// nothing about the server; a reading counts as settled once the series has
// changed from its first value and then held for `stableReads`, or, for a
// file the server finds clean, once `minReads` have been taken and the last
// `stableReads` agree.
export function isSettled(readings, { stableReads = 8, minReads = 25 } = {}) {
  if (readings.length < stableReads) return false;
  const last = readings[readings.length - 1];
  if (!readings.slice(-stableReads).every((r) => r === last)) return false;
  const changed = readings.some((r) => r !== readings[0]);
  return changed || readings.length >= minReads;
}

// Flag parsing shared by `up` and `verify`. `spec` maps a flag to "value",
// "number" (a count of seconds, zero or more) or "flag"; an unknown flag, a
// value flag with nothing usable after it (the end of the arguments, an
// empty string, or another flag from `spec`) and a number that is not one
// are refused before anything runs, so a misspelt option fails at once. A
// value that merely begins with dashes, such as a Luau comment given to
// `--line`, is a value.
export function parseFlags(args, spec) {
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const kind = Object.hasOwn(spec, a) ? spec[a] : null;
    if (!kind) return { error: `unknown option ${a}` };
    if (kind === "flag") {
      opts[a] = true;
      continue;
    }
    const v = args[i + 1];
    if (v == null || v === "" || Object.hasOwn(spec, v)) return { error: `${a} needs a value` };
    if (kind === "number") {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) return { error: `${a} needs a number of seconds, not "${v}"` };
      opts[a] = n;
    } else {
      opts[a] = v;
    }
    i++;
  }
  return { opts };
}

// ------------------------------------------------------------------ state ---

function readState() {
  if (!fs.existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function stateUnreadable() {
  return readState() === null && fs.existsSync(STATE_FILE);
}

function writeState(record) {
  const tmp = STATE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

function removeState() {
  try {
    fs.unlinkSync(STATE_FILE);
  } catch {
    /* already gone */
  }
}

const probe = {
  pidAlive,
  startedMs: processStartedMs,
  recordWrittenMs: () => {
    try {
      return fs.statSync(STATE_FILE).mtimeMs;
    } catch {
      return null;
    }
  },
};

async function isUp(url) {
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(3000) });
    return res.status === 200;
  } catch {
    return false;
  }
}

// The server binds `localhost`, which on this machine is the IPv6 loopback,
// so a port is free only when nothing holds it on either loopback address
// and nothing answers HTTP on it already.
function listens(port, host) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", (err) => resolve(err.code === "EADDRNOTAVAIL" || err.code === "EAFNOSUPPORT" ? "unavailable" : "busy"));
    srv.once("listening", () => srv.close(() => resolve("free")));
    srv.listen(port, host);
  });
}

async function portFree(port) {
  for (const host of ["127.0.0.1", "::1"]) {
    if ((await listens(port, host)) === "busy") return false;
  }
  return !(await isUp(`http://localhost:${port}`));
}

async function pickPort() {
  const base = portBase(REPO_ROOT);
  for (let p = base; p < base + PORT_SCAN; p++) {
    if (await portFree(p)) return p;
  }
  die("could not find a free port");
}

// The extension the server loads is out/extension.js, and a source edit
// after the last build is a change the served workbench does not run; both
// `up` and `verify` refuse that, so a screenshot is always of the build that
// includes the change.
function checkBuild() {
  if (!fs.existsSync(EXTENSION_JS)) {
    die("vscode-sparkdown/out/extension.js is missing; build the extension first: cd vscode-sparkdown && npm run build");
  }
  const builtMs = fs.statSync(EXTENSION_JS).mtimeMs;
  const packages = path.join(REPO_ROOT, "packages");
  const sources = [path.join(EXT_DIR, "src")];
  if (fs.existsSync(packages)) {
    for (const p of fs.readdirSync(packages)) sources.push(path.join(packages, p, "src"));
  }
  const newer = newerSource(builtMs, sources);
  if (newer) {
    die(`vscode-sparkdown/out/extension.js (built ${new Date(builtMs).toISOString()}) is older than ${path.relative(REPO_ROOT, newer)}; rebuild the extension so the served workbench runs the change: cd vscode-sparkdown && npm run build`);
  }
  return { extensionJs: EXTENSION_JS, builtAt: new Date(builtMs).toISOString() };
}

// ----------------------------------------------------------------- server ---

const UP_FLAGS = { "--sd": "value", "--project": "value", "--data": "value", "--quality": "value", "--fresh": "flag" };

// Serve the extension detached, so the server outlives this command, on a
// port pinned to the worktree. `--sd` writes a one-file project into the data
// directory and serves it; `--project` serves an existing folder (one with
// assets, say). While a server from this driver is up, `--sd` rewrites the
// file it serves and a page load reads the new content; the folder itself is
// fixed at launch, so a different `--project` needs `down` first.
async function up(args) {
  const { opts, error } = parseFlags(args, UP_FLAGS);
  if (error) die(`up: ${error}`);
  if (opts["--sd"] && opts["--project"]) die("up: give --sd or --project, not both");
  if (opts["--sd"] && !fs.existsSync(path.resolve(opts["--sd"]))) die(`up: --sd ${path.resolve(opts["--sd"])} does not exist`);
  if (opts["--project"] && !fs.existsSync(path.resolve(opts["--project"]))) die(`up: --project ${path.resolve(opts["--project"])} does not exist`);
  if (stateUnreadable()) {
    die(`state file unreadable: ${STATE_FILE}; \`down\` removes it, and any server it recorded keeps running`);
  }
  checkBuild();
  const existing = readState();
  if (existing?.url && (await recordStands(existing, probe))) {
    let ready = await isUp(existing.url);
    if (!ready) {
      log(`server pid ${existing.pid} is still starting → ${existing.url}`);
      ready = await waitReady(existing.url, existing.builds, () => pidAlive(existing.pid));
      if (!ready) log(`server pid ${existing.pid} has exited; launching`);
    }
    if (ready) return serveInto(existing, opts);
  }
  removeState();
  await launch(opts);
}

// The options applied to a server that is already answering: `--sd`
// rewrites the file it serves; anything that would need a different server
// is refused.
function serveInto(existing, opts) {
  if (opts["--fresh"]) die(`already serving ${existing.project} → ${existing.url}; \`down\` first to download a new build`);
  if (opts["--quality"] && opts["--quality"] !== existing.quality) {
    die(`already serving ${existing.quality} → ${existing.url}; \`down\` first to serve ${opts["--quality"]}`);
  }
  if (opts["--project"] && path.resolve(opts["--project"]) !== existing.project) {
    die(`already serving ${existing.project} → ${existing.url}; \`down\` first to serve another folder`);
  }
  if (opts["--sd"]) {
    if (!existing.ownProject) die(`already serving ${existing.project}, which --sd does not write into; \`down\` first`);
    const n = writeProjectSd(existing.project, opts["--sd"]);
    log(`already up → ${existing.url}; wrote ${n} chars to ${path.join(existing.project, "main.sd")}`);
    return;
  }
  log(`already up → ${existing.url} (serving ${existing.project})`);
}

async function launch(opts) {
  if (!fs.existsSync(SERVER_ENTRY)) {
    die(`${SERVER_ENTRY} is missing; run PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install at the repo root`);
  }
  const data = path.resolve(opts["--data"] ?? DEFAULT_DATA_DIR);
  const quality = opts["--quality"] ?? "stable";
  const port = await pickPort();
  const url = `http://localhost:${port}`;
  const buildsDir = path.join(dataLayout(data).builds, quality);
  const commit = opts["--fresh"] ? null : unpackedCommit(buildsDir);
  const plan = launchPlan({ data, port, quality, sd: opts["--sd"], project: opts["--project"], commit, extDir: EXT_DIR, entry: SERVER_ENTRY });
  if (plan.error) die(`up: ${plan.error}`);
  if (plan.ownProject) writeProjectSd(plan.project, opts["--sd"]);
  fs.mkdirSync(plan.builds, { recursive: true });
  fs.mkdirSync(path.dirname(plan.logPath), { recursive: true });

  // The server's own output goes to a log beside the builds; a detached
  // child on Windows does not always flush into an inherited handle, so the
  // readiness signal is the HTTP poll below, never the log.
  const logFd = fs.openSync(plan.logPath, "a");
  const child = spawn(process.execPath, plan.args, { cwd: EXT_DIR, stdio: ["ignore", logFd, logFd], windowsHide: true, detached: true });
  child.unref();
  fs.closeSync(logFd);

  writeState({ url, pid: child.pid, port, data, builds: plan.builds, project: plan.project, ownProject: plan.ownProject, quality, commit, log: plan.logPath, startedAt: Date.now() });
  log(`serving ${plan.project} pid ${child.pid} → ${url}${commit ? ` (build ${commit.slice(0, 10)}, already unpacked)` : ""}`);
  if (!(await waitReady(url, plan.builds, () => pidAlive(child.pid)))) {
    die(`the server (pid ${child.pid}) exited before ${url} answered; read ${plan.logPath}, then \`down\``);
  }
}

// The project folder is recreated if something removed it, so a served
// folder that vanished under a live server is served again on the next page
// load rather than left as a greyed entry in the explorer.
function writeProjectSd(project, sdPath) {
  const src = fs.readFileSync(path.resolve(sdPath), "utf8");
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(path.join(project, "main.sd"), src);
  return src.length;
}

// Polls until the URL answers, then applies the stylesheet alias, which can
// only be done once the build is unpacked, and the server unpacks it before
// it listens. `keep` ends the wait early with false when it says so.
async function waitReady(url, builds, keep) {
  log("first launch downloads the VS Code build (about 55 MB). Waiting...");
  const deadline = Date.now() + READY_WAIT_MS;
  while (Date.now() < deadline) {
    if (keep && !(await keep())) return false;
    if (await isUp(url)) {
      const { aliased } = aliasWorkbenchCss(builds);
      for (const dir of aliased) log(`stylesheet alias written in ${dir}`);
      log(`READY ${url}`);
      return true;
    }
    await sleep(2000);
  }
  die(`timed out after ${READY_WAIT_MS / 60_000} min waiting for ${url}; read the server log the state file names, then \`down\``);
}

async function status() {
  process.exitCode = 1;
  if (stateUnreadable()) {
    log(`down (state file unreadable: ${STATE_FILE}; \`down\` removes it)`);
    return;
  }
  const s = readState();
  if (!s) return log("down (no state file)");
  const alive = await isUp(s.url);
  log(`${alive ? "UP" : "DOWN"}  url=${s.url}  pid=${s.pid}  project=${s.project}  log=${s.log}`);
  if (alive) process.exitCode = 0;
}

// Only a record that still names its own server is acted on; a stale record
// is removed and nothing is signalled, because its pid may be any process by
// now. The record goes only with a kill that reported success.
async function down() {
  const s = readState();
  if (s?.pid == null) {
    if (fs.existsSync(STATE_FILE)) {
      removeState();
      log(`removed ${STATE_FILE}, which recorded no pid to stop`);
    } else {
      log("nothing to stop");
    }
    return;
  }
  if (!(await recordStands(s, probe))) {
    removeState();
    log(`removed ${STATE_FILE}: pid ${s.pid} is no longer the server it recorded, so nothing was stopped`);
    return;
  }
  const killer =
    process.platform === "win32"
      ? spawn("taskkill", ["/pid", String(s.pid), "/T", "/F"], { stdio: "inherit" })
      : spawn("kill", ["-TERM", String(s.pid)], { stdio: "inherit" });
  const failed = (why) => {
    log(`could not stop pid ${s.pid} (${why}); the record is kept`);
    process.exitCode = 1;
  };
  killer.on("error", (err) => failed(err.message));
  killer.on("exit", (code) => {
    if (code !== 0) return failed(`exit ${code}`);
    removeState();
    log("stopped");
  });
}

// ----------------------------------------------------------------- verify ---

const VERIFY_FLAGS = {
  "--file": "value",
  "--hover": "value",
  "--line": "value",
  "--shot": "value",
  "--hover-shot": "value",
  "--probe": "value",
  "--settle": "number",
  "--headed": "flag",
};

// Opens the file from the explorer, waits for the language server's
// diagnostics to stop changing, reads them, optionally asks for the hover on
// a word, screenshots, and prints a JSON report. Exits 1 when any step in
// `failed` could not do what it was asked. Whatever throws on the way lands
// in `failed` too, and the report is printed regardless.
async function verify(args) {
  const { opts, error } = parseFlags(args, VERIFY_FLAGS);
  if (error) die(`verify: ${error}`);
  const s = readState();
  if (!s?.url) die("no server URL; run `node .claude/skills/drive-vscode-web/driver.mjs up --sd <file.sd>` first");
  if (!(await isUp(s.url))) die(`${s.url} does not answer; \`down\` then \`up\``);
  const build = checkBuild();
  const { aliased } = aliasWorkbenchCss(s.builds);
  for (const dir of aliased) log(`stylesheet alias written in ${dir}`);

  const file = opts["--file"] ?? "main.sd";
  const settleBudgetS = opts["--settle"] ?? 60;
  const report = { url: s.url, project: s.project, file, build, failed: [] };
  const fail = (msg) => report.failed.push(msg);

  try {
    await withWorkbench(s.url, { headless: !opts["--headed"] }, async ({ page, consoleLines }) => {
      try {
        await page.waitForSelector(".monaco-workbench", { timeout: 120_000 });
        await openFile(page, file, report, fail);

        if (report.opened) {
          // The status bar's problem counter and the editor's squiggles are the
          // language server's output; read them once a second until they hold.
          const readings = [];
          const started = Date.now();
          for (;;) {
            readings.push(JSON.stringify(await readDiagnostics(page)));
            if (isSettled(readings) || Date.now() - started >= settleBudgetS * 1000) break;
            await sleep(1000);
          }
          report.settled = isSettled(readings);
          report.settledAfterS = Math.round((Date.now() - started) / 1000);
          report.diagnostics = JSON.parse(readings[readings.length - 1]);
        }

        if (opts["--hover"] && report.opened) await hoverOn(page, opts, report, fail);

        if (opts["--probe"]) {
          try {
            const body = fs.readFileSync(opts["--probe"], "utf8");
            report.probe = await page.evaluate(new Function(`return (async () => { ${body} })()`));
          } catch (err) {
            report.probe = { error: firstLine(err) };
            fail(`probe threw: ${report.probe.error}`);
          }
        }
      } catch (err) {
        fail(`verify threw: ${firstLine(err)}`);
      }

      if (opts["--shot"]) {
        try {
          await page.screenshot({ path: opts["--shot"] });
          report.screenshot = path.resolve(opts["--shot"]);
        } catch (err) {
          fail(`screenshot failed: ${firstLine(err)}`);
        }
      }
      report.consoleErrors = consoleLines.filter((l) => l.startsWith("[error]") || l.startsWith("[pageerror]")).slice(0, 20);
    });
  } catch (err) {
    fail(`verify threw: ${firstLine(err)}`);
  }

  log(JSON.stringify(report, null, 2));
  if (report.failed.length) process.exitCode = 1;
}

// Clicks the explorer row whose label is exactly `file` (a name at the top
// level of the served folder) and checks that the editor that opened carries
// that title, so the report never describes a file it was not asked about.
async function openFile(page, file, report, fail) {
  const exact = new RegExp(`^${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
  const row = page.locator(".explorer-folders-view .monaco-list-row").filter({ has: page.locator(".label-name", { hasText: exact }) }).first();
  try {
    await row.waitFor({ timeout: 60_000 });
    await row.click();
    await page.waitForSelector(".view-lines", { timeout: 60_000 });
  } catch (err) {
    report.opened = false;
    fail(`could not open ${file} from the explorer: ${firstLine(err)}`);
    return;
  }
  const title = (await page.locator(".tabs-container .tab.active .label-name").first().textContent({ timeout: 10_000 }).catch(() => null))?.trim() ?? null;
  report.editor = title;
  report.opened = title === file;
  if (!report.opened) fail(`the editor that opened is titled ${JSON.stringify(title)}, not ${file}`);
}

// Puts the cursor on the word and asks for the hover by keyboard: mouse
// movement never opens the widget headlessly, the Show Hover command
// (Ctrl+K Ctrl+I) does. The cursor position is read back from the status
// bar, so the report says where the hover was asked for and fails when
// that is not inside the word.
async function hoverOn(page, opts, report, fail) {
  const word = opts["--hover"];
  const hit = await findWord(page, word, opts["--line"]);
  if (!hit) {
    fail(`"${word}" is not a whole word on a rendered line${opts["--line"] ? ` containing "${opts["--line"]}"` : ""}; only the lines in the viewport are rendered`);
    return;
  }
  await page.mouse.click(hit.x, hit.y);
  await sleep(400);
  const cursor = await page.evaluate(() => document.querySelector('.statusbar-item[id*="status.editor.selection"]')?.innerText.trim() ?? null);
  const at = cursorAt(cursor);
  report.hover = { word, line: hit.line, col: hit.col, cursor };
  if (!at || at.line !== hit.line || at.col < hit.col || at.col >= hit.col + word.length) {
    fail(`the cursor landed at ${JSON.stringify(cursor)}, not on "${word}" at Ln ${hit.line}, Col ${hit.col}`);
    return;
  }
  await page.keyboard.press("Control+k");
  await page.keyboard.press("Control+i");
  let hover = { present: false };
  for (let i = 0; i < 20 && (!hover.present || (hover.img && !hover.img.complete)); i++) {
    await sleep(500);
    hover = await readHover(page);
  }
  Object.assign(report.hover, hover);
  if (!hover.present) {
    fail(`no hover opened on "${word}" within 10 s of Ctrl+K Ctrl+I`);
    return;
  }
  if (hover.img && !hover.img.complete) fail(`the hover's image had not finished loading within 10 s`);
  if (opts["--hover-shot"]) {
    await page.locator("[data-drive-hover]").first().screenshot({ path: opts["--hover-shot"] });
    report.hoverScreenshot = path.resolve(opts["--hover-shot"]);
  }
}

async function withWorkbench(url, { headless = true } = {}, fn) {
  const { chromium } = await import("playwright");
  const executablePath = resolveChromiumExecutablePath(chromium);
  const browser = await chromium.launch({ headless, ...(executablePath ? { executablePath } : {}) });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const consoleLines = [];
  page.on("console", (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => consoleLines.push(`[pageerror] ${e.message}`));
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
    return await fn({ page, consoleLines });
  } finally {
    await browser.close();
  }
}

// The status bar's problems item (its id carries `status.problems`), which
// counts the whole workspace, and the squiggle overlays in the open editor,
// which Monaco renders for the viewport only.
function readDiagnostics(page) {
  return page.evaluate(() => {
    const item = document.querySelector('.statusbar-item[id*="status.problems"]');
    const count = (cls) => document.querySelectorAll(`.view-overlays .${cls}`).length;
    return {
      problems: item ? (item.innerText || "").replace(/\s+/g, " ").trim() : null,
      problemsLabel: item?.getAttribute("aria-label") ?? item?.querySelector("[aria-label]")?.getAttribute("aria-label") ?? null,
      squiggles: { error: count("squiggly-error"), warning: count("squiggly-warning"), info: count("squiggly-info") },
    };
  });
}

// The word's place on the rendered lines: its line number (from the gutter
// row at the same offset), its column, and a click point inside its first
// character. `locateWord` and `normalizeMonacoText` run in the page from
// their own source, so what the check pins is what the page runs.
function findWord(page, word, lineText) {
  return page.evaluate(
    ({ word, lineText, normSrc, locateSrc }) => {
      const normalizeMonacoText = new Function(`return ${normSrc}`)();
      const locateWord = new Function("normalizeMonacoText", `return ${locateSrc}`)(normalizeMonacoText);
      const top = (el) => parseFloat(el?.style.top) || 0;
      const lines = [...document.querySelectorAll(".view-line")].sort((a, b) => top(a) - top(b));
      const hit = locateWord(lines.map((l) => l.textContent), word, lineText);
      if (!hit) return null;
      const line = lines[hit.index];
      const number = [...document.querySelectorAll(".margin-view-overlays .line-numbers")].find((n) => top(n.parentElement) === top(line));
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      let offset = 0;
      let started = false;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const len = node.nodeValue.length;
        if (!started && hit.start < offset + len) {
          range.setStart(node, hit.start - offset);
          started = true;
        }
        if (started && hit.end <= offset + len) {
          range.setEnd(node, hit.end - offset);
          break;
        }
        offset += len;
      }
      if (!started) return null;
      const r = range.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return null;
      const charWidth = r.width / (hit.end - hit.start);
      return { line: number ? Number(number.textContent) : null, col: hit.start + 1, x: r.x + charWidth * 0.4, y: r.y + r.height / 2 };
    },
    { word, lineText, normSrc: normalizeMonacoText.toString(), locateSrc: locateWord.toString() },
  );
}

// A `.monaco-hover` element sits in the DOM hidden and empty between hovers,
// so presence means one that has size and content. The one read is marked,
// so `--hover-shot` screenshots the same element the report describes.
function readHover(page) {
  return page.evaluate(() => {
    for (const h of document.querySelectorAll("[data-drive-hover]")) h.removeAttribute("data-drive-hover");
    const shown = [...document.querySelectorAll(".monaco-hover")].filter((h) => {
      const r = h.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    });
    const hover = shown.find((h) => h.querySelector("img") || h.innerText.trim());
    if (!hover) return { present: false };
    hover.setAttribute("data-drive-hover", "");
    const img = hover.querySelector("img");
    const r = img?.getBoundingClientRect();
    return {
      present: true,
      text: hover.innerText.replace(/\s+/g, " ").trim().slice(0, 200),
      img: img
        ? {
            hasSrc: img.hasAttribute("src"),
            srcHead: (img.getAttribute("src") || "").slice(0, 40),
            rendered: r ? `${Math.round(r.width)} x ${Math.round(r.height)}` : null,
            complete: img.complete,
          }
        : null,
    };
  });
}

// -------------------------------------------------------------------- cli ---

const runAsCli = process.argv[1] != null && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const [cmd, ...rest] = runAsCli ? process.argv.slice(2) : ["__imported__"];
switch (cmd) {
  case "__imported__":
    break;
  case "up":
    await up(rest);
    break;
  case "status":
    await status();
    break;
  case "down":
    await down();
    break;
  case "verify":
    await verify(rest);
    break;
  default:
    log(
      [
        "usage: node .claude/skills/drive-vscode-web/driver.mjs <command>",
        "",
        "  up [options]       serve the built extension with vscode-test-web on a port pinned to this worktree",
        "  status             is it up? prints the URL and the served folder",
        "  down               stop the server",
        "  verify [options]   open a file in the served workbench, read diagnostics and a hover, screenshot; JSON report",
        "",
        "up options (one of --sd or --project):",
        "  --sd <file.sd>       serve a one-file project holding this script as main.sd",
        "  --project <folder>   serve this folder (for a project with assets)",
        "  --data <dir>         where the VS Code builds, projects and logs live (default: <tmpdir>/impower-vscode-test-web)",
        "  --quality <q>        stable (default) or insiders",
        "  --fresh              download the newest build instead of serving the one already unpacked",
        "",
        "verify options:",
        "  --file <name>        the file to open from the explorer, a name at the top level of the served folder (default main.sd)",
        "  --hover <word>       put the cursor on this whole word and open the hover with Ctrl+K Ctrl+I",
        "  --line <text>        only look for --hover's word on a line containing this text",
        "  --shot <out.png>     screenshot the page",
        "  --hover-shot <png>   screenshot the hover widget alone",
        "  --probe <file.js>    body of an async fn evaluated in the page; result -> JSON",
        "  --settle <seconds>   how long to wait for diagnostics to stop changing (default 60; 0 reads them once)",
        "  --headed             run a visible browser instead of headless",
      ].join("\n"),
    );
}

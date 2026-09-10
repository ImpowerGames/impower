#!/usr/bin/env node
// Agent driver for the Impower live editor + game preview.
//
// Why this exists: CLAUDE.md makes "LOOK at the rendered pixels" a hard gate on
// calling any change done, and `npm run web:dev` picks RANDOM free ports every
// launch — so there is no fixed URL an agent can hardcode. This driver owns the
// whole loop: boot the two dev servers, remember the port it got, drive the
// editor with Playwright, and drop screenshots on disk.
//
// Playwright is a declared root devDependency. Browsers come from the local
// ms-playwright cache; `npx playwright install chromium` if it is empty.
//
// This file must live inside the repo tree regardless: Node resolves
// `playwright` from the SCRIPT's directory, not from cwd, so a copy of this
// script in a temp dir will not find it.
//
//   node .claude/skills/drive-web-editor/driver.mjs up
//   node .claude/skills/drive-web-editor/driver.mjs status
//   node .claude/skills/drive-web-editor/driver.mjs verify --sd repro.sd --shot out.png
//   node .claude/skills/drive-web-editor/driver.mjs down
//
// State (editor URL + launcher pid) lives in .claude/skills/drive-web-editor/.state.json,
// which is gitignored — every command after `up` reads the URL from there.

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gitTopLevel, parseRedGreenArgs, runRedGreen, sameDir } from "./redgreen.mjs";

const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SKILL_DIR, "..", "..", "..");
const STATE_FILE = path.join(SKILL_DIR, ".state.json");
// The state file and the Chromium profile sit beside this script. A worktree
// whose servers are still running from this driver's location under the
// resolve-issue skill keeps both there, so each path resolves to that
// directory while nothing exists here. The state file migrates: `down` stops
// those servers and deletes it, and the next `up` writes beside this script.
// The profile stays wherever it is found, because OPFS is scoped per profile
// and moving it would lose every project loaded into it. `exists` is a
// parameter so state-path.test.mjs can pin the choice without touching disk.
const PREVIOUS_SKILL_DIR = path.resolve(SKILL_DIR, "..", "resolve-issue");
const hereOrPrevious = (name, exists = fs.existsSync) => {
  const here = path.join(SKILL_DIR, name);
  const previous = path.join(PREVIOUS_SKILL_DIR, name);
  return !exists(here) && exists(previous) ? previous : here;
};
const stateFile = () => hereOrPrevious(".state.json");
// Persistent Chromium profile. OPFS is scoped per ORIGIN *and* per profile, so
// reusing one profile plus the pinned port (see pickPorts) means a script you
// loaded stays loaded across driver invocations and across down/up.
const PROFILE_DIR = hereOrPrevious(".chrome-profile");

// Signal 0 delivers nothing and only asks whether the pid exists; EPERM means
// it exists under another user. `kill` is a parameter so state-path.test.mjs
// can pin the EPERM rule without a protected pid.
function pidAlive(pid, kill = process.kill) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === "EPERM";
  }
}

// How long a launch gets to answer before `up` gives up on it.
const READY_WAIT_MS = 15 * 60_000;

// Whether the pid a state file records is still the launcher it recorded. A
// live pid alone proves nothing, because the system hands a freed pid to the
// next process it starts, so a record whose tree is long gone can name any
// live process. What ties the pid to the launch is when the process behind it
// started: the launcher was created just before its record was written, and
// any later process on the same pid was created after that. So the record
// stands while its pid is alive and that process started within
// LAUNCH_SLACK_MS before the record's `startedAt` (spawn latency on a loaded
// machine) or START_GRAIN_MS after it (a start reported in whole seconds). A
// record from a driver that wrote no `startedAt` uses its file's mtime, which
// that driver wrote once, at launch. A start the system will not report (no
// such process, another user's, or nothing to ask) does not stand. `probe`
// supplies the three readings so state-path.test.mjs can pin the table
// without a process or a file.
const LAUNCH_SLACK_MS = 60_000;
const START_GRAIN_MS = 2_000;
async function recordStands(record, probe = liveProbe) {
  if (!record?.url) return false;
  if (!probe.pidAlive(record.pid)) return false;
  const started = await probe.startedMs(record.pid);
  if (started == null) return false;
  const recorded = record.startedAt ?? probe.recordWrittenMs();
  if (recorded == null) return false;
  return started >= recorded - LAUNCH_SLACK_MS && started <= recorded + START_GRAIN_MS;
}

const liveProbe = {
  pidAlive,
  startedMs: processStartedMs,
  recordWrittenMs: () => {
    try {
      return fs.statSync(stateFile()).mtimeMs;
    } catch {
      return null;
    }
  },
};

// When the process behind a pid was created, in ms since the epoch, or null
// when the system will not say. Windows answers through PowerShell (about half
// a second); elsewhere `ps` prints the start as a date `Date.parse` reads.
function processStartedMs(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return Promise.resolve(null);
  const win = process.platform === "win32";
  const [cmd, args] = win
    ? ["powershell", ["-NoProfile", "-Command", `([DateTimeOffset](Get-Process -Id ${pid}).StartTime).ToUnixTimeMilliseconds()`]]
    : ["ps", ["-o", "lstart=", "-p", String(pid)]];
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("error", () => resolve(null));
    p.on("close", (code) => {
      const text = out.trim();
      const ms = win ? Number(text) : Date.parse(text);
      resolve(code === 0 && text !== "" && Number.isFinite(ms) ? ms : null);
    });
  });
}

const log = (...a) => console.log(...a);
const die = (msg) => {
  console.error("ERROR: " + msg);
  process.exit(1);
};

function readState() {
  const file = stateFile();
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

// A state file that is there but does not parse. writeState renames a finished
// file into place, so this means a hand edit or a truncation from outside;
// `status` reports it, `up` refuses to launch over it, `down` removes it.
function stateUnreadable() {
  return readState() === null && fs.existsSync(stateFile());
}

// Written beside this script whatever `stateFile()` read, and renamed into
// place so no reader ever sees a partial file.
function writeState(record) {
  const tmp = STATE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

function removeState() {
  try {
    fs.unlinkSync(stateFile());
  } catch {
    /* already gone */
  }
}

// The sandbox pre-installs a Chromium build under PLAYWRIGHT_BROWSERS_PATH
// independently of whatever `playwright` version this repo's package.json
// pins. When those two drift apart, `chromium.executablePath()` points at a
// revision that was never downloaded (npm install skips the download — see
// CLAUDE.md — so it never will be) and every launch fails with "Executable
// doesn't exist". Fall back to whatever Chromium build the cache actually
// has rather than the exact revision Playwright asked for.
function resolveChromiumExecutablePath(chromium) {
  const expected = chromium.executablePath();
  if (expected && fs.existsSync(expected)) return undefined;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base || !fs.existsSync(base)) return undefined;
  const dirs = fs
    .readdirSync(base)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.match(/\d+/)[0]) - Number(a.match(/\d+/)[0]));
  const relPaths = [
    "chrome-linux/chrome",
    "chrome-linux64/chrome",
    "chrome-win/chrome.exe",
    "chrome-win64/chrome.exe",
    "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
  ];
  for (const dir of dirs) {
    for (const rel of relPaths) {
      const p = path.join(base, dir, ...rel.split("/"));
      if (fs.existsSync(p)) return p;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------- servers ---

// Is this TCP port free on loopback right now?
function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "127.0.0.1");
  });
}

// Pick a stable base port from the worktree path.
//
// OPFS is scoped per ORIGIN, so the random ports `npm run web:dev` picks would
// discard the loaded project on every launch. Hashing the worktree path keeps
// this checkout on one origin while staying clear of the other worktrees
// running on the same machine.
async function pickPorts() {
  let h = 0;
  for (const ch of REPO_ROOT) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const base = 38000 + (h % 800) * 4; // 4-port stride: editor, player, hmr, spare
  for (let attempt = 0; attempt < 200; attempt++) {
    const p = base + attempt * 4;
    if (p > 65000) break;
    const [a, b, c] = await Promise.all([
      portFree(p),
      portFree(p + 1),
      portFree(p + 2),
    ]);
    if (a && b && c) return { editor: p, player: p + 1, hmr: p + 2 };
  }
  die("could not find 3 consecutive free ports");
}

// Boot `npm run web:dev` detached, on ports WE chose.
//
// Detached matters: the agent runs each command as a separate short-lived
// process, so the servers must outlive `up`.
//
// Do NOT try to scrape the launcher's "✓ Live preview ready → URL" line: a
// detached child on Windows does not flush its stdio into an inherited file
// handle, so the log stays 0 bytes forever while the servers run perfectly.
// Since the port is pinned, readiness is just an HTTP poll.
async function up(args) {
  if (stateUnreadable()) {
    die(`state file unreadable: ${stateFile()}; \`down\` removes it, and any servers it recorded keep running`);
  }
  const existing = readState();
  if (existing?.url && (await isUp(existing.url))) {
    log(`already up → ${existing.url}`);
    return;
  }
  // One probe timing out is not evidence the servers are gone: a cold build
  // takes minutes, and a loaded machine stalls the first response. While the
  // record stands (recordStands) this waits for its URL, the same wait a fresh
  // launch gets, and stops the moment the launcher exits. A pid verified as
  // the launcher's stays its own until it exits, so each poll asks only that;
  // a pid the system reuses mid-wait ends the wait at the deadline instead,
  // where the `down` the message names finds the record stale and removes it.
  // A stale record is dropped so the file written below is the only record.
  if (await recordStands(existing)) {
    log(`servers pid ${existing.pid} are still starting → ${existing.url} (state: ${stateFile()})`);
    if (await waitReady(existing.url, existing.mode, () => pidAlive(existing.pid))) return;
    log(`servers pid ${existing.pid} have exited; launching`);
  }
  removeState();

  const mode = args.includes("--cross-origin") ? "cross-origin" : "same-origin";
  const ports = await pickPorts();
  const url = `http://localhost:${ports.editor}`;

  const child = spawn(
    "npm",
    ["run", mode === "cross-origin" ? "web:dev:cross-origin" : "web:dev"],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        EDITOR_PORT: String(ports.editor),
        PLAYER_PORT: String(ports.player),
        HMR_PORT: String(ports.hmr),
      },
      stdio: "ignore",
      shell: true, // npm is npm.cmd on Windows; Node 23 refuses to spawn .cmd directly
      windowsHide: true,
      detached: true,
    },
  );
  child.unref();

  writeState({ url, pid: child.pid, mode, ports, startedAt: Date.now() });

  log(`launching dev servers (${mode}) pid ${child.pid} → ${url}`);
  await waitReady(url, mode);
}

// Polls until the URL answers and returns true. `keep`, when given, is asked
// before each poll whether the wait is still worth it, and a false ends the
// wait with a false return; the deadline ends it with an exit.
async function waitReady(url, mode, keep) {
  log("COLD build takes 4-8 min (esbuild builds every worker bundle). Waiting...");
  const deadline = Date.now() + READY_WAIT_MS;
  while (Date.now() < deadline) {
    if (keep && !(await keep())) return false;
    if (await isUp(url)) {
      log(`READY ${url}   (mode: ${mode})`);
      return true;
    }
    await sleep(3000);
  }
  die(`timed out after ${READY_WAIT_MS / 60_000} min waiting for ${url}; run \`npm run web:dev\` in this worktree to read the build error, which the detached launcher's own log file never records, and \`down\` stops the tree the state file records, or removes the record if its launcher is gone`);
}

async function isUp(url) {
  try {
    await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(3000) });
    return true;
  } catch {
    return false;
  }
}

// Names the state file it read, because with the fallback above there are two
// places it can come from, and an unreadable file is reported as itself rather
// than as absence. Exits 0 only when the recorded URL answers.
async function status() {
  const file = stateFile();
  process.exitCode = 1;
  if (stateUnreadable()) {
    log(`unknown (state file unreadable: ${file}; \`down\` removes it)`);
    return;
  }
  const s = readState();
  if (!s) return log("down (no state file)");
  const alive = await isUp(s.url);
  log(`${alive ? "UP" : "DOWN"}  url=${s.url}  pid=${s.pid}  mode=${s.mode}  state=${file}`);
  if (alive) process.exitCode = 0;
}

// The launcher spawns npm -> node grandchildren. Killing the launcher pid alone
// orphans the two vite servers and they keep holding their ports. taskkill /T
// tears down the whole tree. Only a record that stands names a tree to kill: a
// stale record's pid may belong to any process by now, so that record is
// removed and nothing is signalled. The record goes only with a kill that
// reported success; a refused kill keeps it, so the tree stays stoppable.
async function down() {
  const file = stateFile();
  const s = readState();
  if (s?.pid == null) {
    if (fs.existsSync(file)) {
      removeState();
      log(`removed ${file}, which recorded no pid to stop; servers it belonged to keep running`);
    } else {
      log("nothing to stop");
    }
    return;
  }
  if (!(await recordStands(s))) {
    removeState();
    log(`removed ${file}: pid ${s.pid} is no longer the launcher it recorded (that process exited, and the system may have reused its pid), so nothing was stopped`);
    return;
  }
  const killer =
    process.platform === "win32"
      ? spawn("taskkill", ["/pid", String(s.pid), "/T", "/F"], {
          stdio: "inherit",
        })
      : spawn("kill", ["-TERM", String(-s.pid)], { stdio: "inherit" });
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

// Check the things that fail LATE and expensively if they are wrong:
// a near-full C: silently corrupts a fresh worktree's node_modules, a missing
// Playwright browser only surfaces after the 5-minute dev-server build, and a
// logged-out gh only surfaces when you try to open the PR at the very end.
async function preflight() {
  let ok = true;
  const say = (good, label, detail) => {
    if (!good) ok = false;
    console.log(`${good ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
  };

  const free = await freeBytesOnRepoDrive();
  say(
    free == null || free > 6e9,
    "disk headroom",
    free == null ? "could not measure" : `${(free / 1e9).toFixed(1)} GB free (need ~6 GB for a fresh worktree install)`,
  );

  try {
    const { chromium } = await importPlaywright();
    const executablePath = resolveChromiumExecutablePath(chromium);
    const b = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    await b.close();
    say(true, "playwright chromium", executablePath ? `launches (fallback build: ${executablePath})` : "launches");
  } catch (e) {
    say(false, "playwright chromium", String(e.message).split("\n")[0]);
  }

  say(await cmdOk("gh", ["auth", "status"]), "gh auth", "needed to read the issue and open the PR");
  say(await cmdOk("git", ["rev-parse", "--git-dir"]), "git repo", REPO_ROOT);

  const install = await installHealth();
  say(install.ok, "node_modules", install.detail);

  process.exitCode = ok ? 0 : 1;
}

/**
 * Whether this worktree's dependencies are usable. A full disk leaves an
 * install that looks complete and is not: truncated binaries, empty package
 * directories, a missing `dist/*.mjs`. The damage surfaces much later as a
 * baffling build error, so the binaries are executed here rather than
 * measured, and a failure names the repair. An absent `node_modules` is not
 * a failure: a hooks-only, skills-only or docs-only change needs none.
 */
async function installHealth(root = REPO_ROOT, run = cmdOk) {
  if (!fs.existsSync(path.join(root, "node_modules"))) {
    return {
      ok: true,
      detail: "not installed — fine for a change with nothing to boot; otherwise `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install` at this worktree's root (a bare npm install fails on a Chromium download this network blocks)",
    };
  }
  const broken = [];
  for (const tool of ["esbuild", "vitest"]) {
    if (!(await run("npx", [tool, "--version"]))) broken.push(tool);
  }
  if (broken.length === 0) return { ok: true, detail: "esbuild and vitest both run" };
  return {
    ok: false,
    detail: `${broken.join(" and ")} cannot run, so node_modules is corrupt — a full disk truncates binaries and empties package directories without npm saying so. Repair it in one pass rather than piecemeal: \`npm cache clean --force\`, delete every node_modules (the root's and every workspace's), then \`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install\` once`,
  };
}

function freeBytesOnRepoDrive() {
  return new Promise((resolve) => {
    if (process.platform !== "win32") return resolve(null);
    const drive = path.parse(REPO_ROOT).root.replace(/\\$/, "");
    const ps = spawn(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `(Get-PSDrive -Name '${drive.replace(":", "")}').Free`,
      ],
      { windowsHide: true },
    );
    let out = "";
    ps.stdout.on("data", (d) => (out += d));
    ps.on("close", () => {
      const n = Number(out.trim());
      resolve(Number.isFinite(n) && n > 0 ? n : null);
    });
    ps.on("error", () => resolve(null));
  });
}

function cmdOk(cmd, args) {
  return new Promise((resolve) => {
    const c = spawn(cmd, args, {
      stdio: "ignore",
      shell: true,
      windowsHide: true,
      cwd: REPO_ROOT,
    });
    c.on("close", (code) => resolve(code === 0));
    c.on("error", () => resolve(false));
  });
}

// ---------------------------------------------------------------- browser ---

// The browser `withEditor` drives: the persistent profile, so the editor
// keeps its storage and its last screen across runs.
// Node resolves a bare specifier from the importing script's own directory,
// not from the working directory, so a copy of this driver outside the repo
// tree cannot find playwright however it is invoked, and a worktree that
// skipped its install cannot either. Saying which is the difference between
// a fix and a bare ERR_MODULE_NOT_FOUND.
async function importPlaywright() {
  try {
    return await import("playwright");
  } catch (err) {
    throw new Error(
      `playwright could not be resolved from ${SKILL_DIR}: ` +
        "run the driver at its committed path inside the repo tree (Node resolves playwright from the script's own " +
        "directory, so a copy in a temp directory always fails here), and install the worktree's dependencies with " +
        `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install at its root. (${String(err.message || err).split("\n")[0]})`,
    );
  }
}

async function launchEditorBrowser({ headless }) {
  const { chromium } = await importPlaywright();
  const executablePath = resolveChromiumExecutablePath(chromium);
  return chromium.launchPersistentContext(PROFILE_DIR, {
    headless,
    viewport: { width: 1600, height: 1000 },
    args: ["--autoplay-policy=no-user-gesture-required"],
    ...(executablePath ? { executablePath } : {}),
  });
}

// Every navigation onto the editor goes through these two. A cold editor
// load here takes longer than Playwright's 30 s default, so a bare
// `page.goto(url)` dies with `Timeout 30000ms exceeded` against a server
// that is perfectly healthy; keeping the options in one place means a
// script built on the exported helpers navigates the way the driver does
// rather than rediscovering that. driver-messages.test.mjs pins that these
// are the only navigators in the file.
const EDITOR_NAVIGATION = { waitUntil: "domcontentloaded", timeout: 120_000 };
async function openEditorPage(page, url) {
  return page.goto(url, EDITOR_NAVIGATION);
}
async function reloadEditorPage(page) {
  return page.reload(EDITOR_NAVIGATION);
}

// Runs `fn` against a page on the editor. `url` and `mode` come from the
// state file `up` wrote: `mode` is how it launched the servers, and says
// whether the game preview can be observed at all; a record without one is
// a same-origin launch. `launch` and `state` are parameters so
// seed-project.test.mjs can run this without a browser and pin what `fn`
// is handed.
async function withEditor(fn, { headless = true, launch = launchEditorBrowser, state = readState } = {}) {
  const record = state();
  if (!record?.url)
    die(
      "no editor URL — run `node .claude/skills/drive-web-editor/driver.mjs up` first. Servers launched by hand, or by " +
        "`npm run web:dev` in another shell, are not driven from here, and a hand-launched pair is where a fully black " +
        "Game Preview beside a healthy-looking editor pane comes from: the editor and the player agree over a handshake " +
        "whose values are baked into each bundle at build time, so a reload cannot fix a mismatched one.",
    );
  const { url } = record;
  const mode = record.mode ?? "same-origin";
  const ctx = await launch({ headless });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const consoleLines = [];
  page.on("console", (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => consoleLines.push(`[pageerror] ${e.message}`));
  try {
    return await fn({ page, ctx, url, consoleLines, mode });
  } finally {
    await ctx.close();
  }
}

// Write a .sd source into the editor project's OPFS and reload so the editor
// re-reads it. The default project id is "local" and its entry script is
// "main.sd" (WorkspaceConstants.LOCAL_PROJECT_ID / WorkspaceStore).
async function writeMainSd(page, source) {
  return page.evaluate(async (src) => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle("local", { create: true });
    const fh = await dir.getFileHandle("main.sd", { create: true });
    const w = await fh.createWritable();
    await w.write(src);
    await w.close();
    return src.length;
  }, source);
}

// ---------------------------------------------------------------- project ---
//
// `--sd` writes one script. A bug or feature that involves assets (portraits,
// backdrops, audio, image previews, the asset inspector) needs the whole
// project in the editor's storage, and every session that needed one wrote
// its own seeder (#435). `seedProject` is that seeder: it reads a project
// directory or an exported project zip in Node, ships the files into the page
// in batches of base64, and writes each one under `<project>/<relative path>`
// in `navigator.storage.getDirectory()`, which is the layout the editor's own
// zip import produces (WorkspaceFileSystem.writeProjectZip). Like that import
// it replaces the project: once every file has landed, the entries under the
// project that the source lacks are removed, so a file from an earlier seed
// cannot stand in for one the source lacks. Dot entries (`.name`, `.trash`)
// are the editor's own metadata: the walk skips them, as the editor's export
// does, and the prune leaves them wherever they sit beside a kept entry; a
// stale directory goes whole, dot entries inside it included.
//
// The seed is safe to fail. Nothing is removed before the writes: an entry
// of the previous project whose kind clashes with the source (a file where
// the source has a directory of that name, or the other way round) would
// have to be removed before the write, so a seed with one is refused before
// anything is written. A marker file (`<project>/.seeding`) stands from the
// first write until the prune has finished, so a refused write, a refused
// removal or a Ctrl+C leaves the previous project in storage with the files
// that landed over it and the marker in place; `verify` and `ui` refuse to
// run on a marked project, the next `--project` seed replaces it, and
// `seed --clear` empties it. The report's `storage` field says which state
// storage was left in.
//
// The functions the page runs (`rememberedProject`, `beginSeed`,
// `seedInterrupted`, `kindClashes`, `writeProjectBatch`, `pruneProject`,
// `readProjectFile`) close over nothing, so `page.evaluate` can ship them;
// seed-project.test.mjs rebuilds each from its source and runs it in a
// context holding only the page's globals, so a reference to module scope or
// to a Node global in one fails the check before it fails in the page.

// Bytes of file content per `page.evaluate`. Base64 adds a third, and one
// round trip per file is what made the hand-written seeders slow.
const SEED_BATCH_BYTES = 8 * 1024 * 1024;

// Bounds on what one seed reads into memory: every file is held in Node until
// its batch ships, and one file's base64 has to fit Node's string limit
// (512 MiB of characters, 384 MiB of content). A project over these is not
// one the editor is built for, and the reason names the bound that stopped it.
const SEED_LIMITS = { files: 20_000, dirs: 20_000, bytes: 1024 * 1024 * 1024, fileBytes: 256 * 1024 * 1024 };

// Directory names a project never holds. Meeting one means `--project` points
// at a package or a build output, and reading it in full would hold a
// dependency tree in memory before the mistake showed.
const REFUSED_DIRS = ["node_modules", "dist"];

// The marker file a seed leaves in the project until its prune is done. A dot
// entry: the workspace's file store lists it like any file, the Files panel's
// include globs leave it off the screen, and the prune keeps dot entries
// until the end.
const SEED_MARKER = ".seeding";

// The key the editor keeps the id of the project it opens under
// (WorkspaceConstants.LOADED_PROJECT_STORAGE_KEY) and the id it opens when
// the key is unset (WorkspaceConstants.LOCAL_PROJECT_ID).
const PROJECT_ID_KEY = "project";
const LOCAL_PROJECT_ID = "local";

function refusedDirError(rel) {
  return new Error(`the project holds ${rel}/, which a project never does; point --project at the project directory itself`);
}

// Every file under `dir`, as `{ path, bytes }` with `/`-separated paths
// relative to `dir`, sorted. Links are followed, so a junctioned asset tree
// seeds like a plain one, and a tree reachable by two names seeds under
// both; an entry that cannot be read (a dangling link, a link back to a
// directory the walk is inside or to one above it, a socket) lands in
// `failed` with its reason. Dot entries are skipped and counted in
// `skipped`. The bounds in `limits` stop the walk with a reason before it
// holds more than they allow; the bound on directories entered is what stops
// a tree whose links reach the same directories under many names, which
// the walk otherwise enters once per name.
function walkProjectDir(dir, limits = SEED_LIMITS) {
  const files = [];
  const failed = [];
  // The real paths of the directories the walk is inside, root first; a
  // directory that is one of them, or an ancestor of one, is a cycle.
  const inside = [];
  let skipped = 0;
  let bytes = 0;
  let entered = 0;
  const realpath = (abs) => {
    try {
      return fs.realpathSync(abs);
    } catch {
      return abs;
    }
  };
  const leadsBack = (real) => {
    const prefix = real.endsWith(path.sep) ? real : real + path.sep;
    return inside.some((p) => p === real || p.startsWith(prefix));
  };
  const visit = (abs, rel) => {
    entered += 1;
    if (entered > limits.dirs) throw new Error(`the project has more than ${limits.dirs} directories, the bound on a seed (reached at ${rel})`);
    inside.push(realpath(abs));
    try {
      for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) {
          skipped += 1;
          continue;
        }
        const nextAbs = path.join(abs, entry.name);
        const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
        let stat;
        try {
          stat = fs.statSync(nextAbs);
        } catch (err) {
          failed.push({ path: nextRel, reason: `cannot be read (${err?.code ?? String(err?.message ?? err)})` });
          continue;
        }
        if (stat.isDirectory()) {
          if (REFUSED_DIRS.includes(entry.name)) throw refusedDirError(nextRel);
          if (leadsBack(realpath(nextAbs))) {
            failed.push({ path: nextRel, reason: "links back to a directory the walk is inside, or to one above it" });
            continue;
          }
          visit(nextAbs, nextRel);
        } else if (stat.isFile()) {
          if (stat.size > limits.fileBytes) throw new Error(`${nextRel} is ${stat.size} bytes, over the ${limits.fileBytes}-byte bound on one file`);
          bytes += stat.size;
          if (bytes > limits.bytes) throw new Error(`the project is over the ${limits.bytes}-byte bound on a seed (reached at ${nextRel})`);
          if (files.length >= limits.files) throw new Error(`the project has more than ${limits.files} files, the bound on a seed (reached at ${nextRel})`);
          files.push({ path: nextRel, bytes: fs.readFileSync(nextAbs) });
        } else {
          failed.push({ path: nextRel, reason: "is neither a file nor a directory" });
        }
      }
    } finally {
      inside.pop();
    }
  };
  visit(dir, "");
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files, skipped, failed };
}

// What one zip entry name is to the seed: the `/`-joined project path of a
// file, or null for an entry the seed never writes (a directory entry, a
// name of `.` and empty segments only, or a dot-named entry, which is
// `skipped`). `.` and empty segments are dropped (`./main.sd` is `main.sd`).
// A path that is absolute or climbs out with `..` throws, because the seed
// would write outside the project; an entry under a directory a project
// never holds throws as the walk refuses it. The bounds filter and
// `zipProjectEntries` both go through this, so the bounds count the entries
// the seed would write and a refusal is raised before the entry is inflated.
function zipEntryPath(name) {
  const normalized = name.replace(/\\/g, "/");
  if (normalized.endsWith("/")) return { path: null };
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(`zip entry "${name}" is not a relative path`);
  }
  const segments = normalized.split("/").filter((s) => s !== "" && s !== ".");
  if (segments.length === 0) return { path: null };
  if (segments.some((s) => s === "..")) throw new Error(`zip entry "${name}" climbs out of the project`);
  if (segments.some((s) => s.startsWith("."))) return { path: null, skipped: true };
  const refused = segments.slice(0, -1).find((s) => REFUSED_DIRS.includes(s));
  if (refused) throw refusedDirError(segments.slice(0, segments.indexOf(refused) + 1).join("/"));
  return { path: segments.join("/") };
}

// The project files in an unpacked archive (`{ [name]: Uint8Array }`, the
// shape fflate's unzipSync returns), each entry read as `zipEntryPath` reads
// it. An archive whose every entry sits under one top-level folder that
// holds `main.sd` (a zip made by hand from the project directory, which is
// how a desktop's compress command lays one out) is unwrapped and the folder
// named in `unwrapped`; the editor's own export has no such folder. A single
// folder without `main.sd` cannot be told from the project's own layout (an
// asset bundle under `assets/`), so it stays and is named in `kept`, for the
// seed to say which reading it took. An archive holding both a file and a
// directory of one name is refused, because no filesystem can hold both.
export function zipProjectEntries(archive) {
  let entries = [];
  let skipped = 0;
  let unwrapped;
  let kept;
  for (const [name, bytes] of Object.entries(archive)) {
    const read = zipEntryPath(name);
    if (read.skipped) skipped += 1;
    if (read.path == null) continue;
    entries.push({ path: read.path, bytes });
  }
  const dirs = new Set();
  for (const e of entries) {
    const s = e.path.split("/");
    for (let i = 1; i < s.length; i++) dirs.add(s.slice(0, i).join("/"));
  }
  const clash = entries.find((e) => dirs.has(e.path));
  if (clash) throw new Error(`the zip holds both a file and a directory named "${clash.path}"`);
  if (entries.length > 0) {
    const first = entries[0].path.split("/")[0];
    if (entries.every((e) => e.path.startsWith(`${first}/`))) {
      if (entries.some((e) => e.path === `${first}/main.sd`)) {
        unwrapped = first;
        entries = entries.map((e) => ({ path: e.path.slice(first.length + 1), bytes: e.bytes }));
      } else {
        kept = first;
      }
    }
  }
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files: entries, skipped, failed: [], ...(unwrapped ? { unwrapped } : {}), ...(kept ? { kept } : {}) };
}

// The project at `source`: a directory, walked, or a `.zip`, unpacked with
// fflate, the library the editor's own import uses, so an archive the editor
// accepts is one the driver accepts. The bounds in `limits` are checked on
// the archive's central directory, entry by entry, before the entry they
// name is inflated, so the memory spent before a refusal stays within the
// bound that tripped; the entries before it have been inflated by then.
// Throws with the reason when the source cannot be read as a project or is
// over the bounds.
async function collectProject(source, limits = SEED_LIMITS) {
  const abs = path.resolve(source);
  if (!fs.existsSync(abs)) throw new Error(`--project ${source} does not exist (resolved to ${abs})`);
  const stat = fs.statSync(abs);
  if (stat.isDirectory()) return { kind: "directory", ...walkProjectDir(abs, limits) };
  if (!/\.zip$/i.test(abs)) throw new Error(`--project ${source} is neither a directory nor a .zip file`);
  if (stat.size > limits.bytes) throw new Error(`--project ${source} is ${stat.size} bytes, over the ${limits.bytes}-byte bound on a seed`);
  let unzipSync;
  try {
    ({ unzipSync } = await import("fflate"));
  } catch {
    throw new Error("unpacking a zip needs the fflate package, which the workspace install at the repo root puts under node_modules/fflate");
  }
  let bytes = 0;
  let count = 0;
  let skipped = 0;
  const refused = (err) => Object.assign(err, { seedRefused: true });
  const filter = (entry) => {
    let read;
    try {
      read = zipEntryPath(entry.name);
    } catch (err) {
      throw refused(err);
    }
    if (read.skipped) skipped += 1;
    if (read.path == null) return false;
    if (entry.originalSize > limits.fileBytes) throw refused(new Error(`${read.path} is ${entry.originalSize} bytes, over the ${limits.fileBytes}-byte bound on one file`));
    bytes += entry.originalSize;
    if (bytes > limits.bytes) throw refused(new Error(`the project is over the ${limits.bytes}-byte bound on a seed (reached at ${read.path})`));
    count += 1;
    if (count > limits.files) throw refused(new Error(`the project has more than ${limits.files} files, the bound on a seed (reached at ${read.path})`));
    return true;
  };
  let archive;
  try {
    archive = unzipSync(new Uint8Array(fs.readFileSync(abs)), { filter });
  } catch (err) {
    if (err?.seedRefused) throw err;
    throw new Error(`--project ${source} could not be unpacked as a zip (${String(err?.message ?? err).split("\n")[0]})`);
  }
  const entries = zipProjectEntries(archive);
  return { kind: "zip", ...entries, skipped: skipped + entries.skipped };
}

// Files grouped into batches whose content stays under `maxBytes`, in the
// order given. A file larger than the budget travels alone.
export function planBatches(files, maxBytes = SEED_BATCH_BYTES) {
  const batches = [];
  let current = [];
  let size = 0;
  for (const file of files) {
    const length = file.bytes.length;
    if (current.length > 0 && size + length > maxBytes) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(file);
    size += length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

// Runs in the page. The id of the project the editor opens on load, or null
// when it opens the default.
async function rememberedProject({ key }) {
  return localStorage.getItem(key);
}

// Runs in the page. Puts the seed marker in the project directory, creating
// the directory when `create` holds and answering `missing` when it does not
// and the directory is not there; `interrupted` says whether the marker was
// already there, which means an earlier seed did not finish.
async function beginSeed({ project, marker, create = true }) {
  const root = await navigator.storage.getDirectory();
  let dir;
  try {
    dir = await root.getDirectoryHandle(project, { create });
  } catch (err) {
    if (!create && err?.name === "NotFoundError") return { interrupted: false, missing: true };
    throw err;
  }
  let interrupted = false;
  try {
    await dir.getFileHandle(marker, { create: false });
    interrupted = true;
  } catch {
    /* no marker: the previous seed finished, or there was none */
  }
  await dir.getFileHandle(marker, { create: true });
  return { interrupted };
}

// Runs in the page. Whether the seed marker is in the project.
async function seedInterrupted({ project, marker }) {
  const root = await navigator.storage.getDirectory();
  try {
    const dir = await root.getDirectoryHandle(project, { create: false });
    await dir.getFileHandle(marker, { create: false });
    return true;
  } catch {
    return false;
  }
}

// Runs in the page. The entries under the project whose kind clashes with
// the source: a file where `dirs` (the directories the source's paths lead
// through) names a directory, or a directory where `files` names a file.
// Each is `{ path, storage, source }` with the kind on each side. The walk
// descends only into directories the source leads through; anything else
// is the prune's to remove after the writes.
async function kindClashes({ project, files, dirs }) {
  const root = await navigator.storage.getDirectory();
  const fileSet = new Set(files);
  const dirSet = new Set(dirs);
  const clashes = [];
  let dir;
  try {
    dir = await root.getDirectoryHandle(project, { create: false });
  } catch (err) {
    if (err?.name === "NotFoundError") return clashes;
    throw err;
  }
  const visit = async (handle, prefix) => {
    for await (const [name, child] of handle.entries()) {
      const rel = prefix ? `${prefix}/${name}` : name;
      if (child.kind === "file" && dirSet.has(rel)) clashes.push({ path: rel, storage: "file", source: "directory" });
      else if (child.kind === "directory" && fileSet.has(rel)) clashes.push({ path: rel, storage: "directory", source: "file" });
      else if (child.kind === "directory" && dirSet.has(rel)) await visit(child, rel);
    }
  };
  await visit(dir, "");
  return clashes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

// Runs in the page. Writes each `{ path, base64 }` under the project,
// creating directories, and reads the size back so `bytes` is what landed
// rather than what was sent; a file that could not be written, or that reads
// back a different size, lands in `failed` with the reason and the rest of
// the batch still goes in. Nothing that is there is removed: an entry of the
// other kind in the way is a failed write with the storage's reason. Getting
// a handle creates an empty file before the write can fail, so a file this
// batch created and could not write is removed again, through the parent
// that holds it and only when the descent to that parent succeeded; a file
// that was there before keeps whatever it holds.
async function writeProjectBatch({ project, entries }) {
  const root = await navigator.storage.getDirectory();
  const written = [];
  const failed = [];
  const why = (err) => (err?.name && err.name !== "Error" ? `${err.name}: ${err.message}` : String(err?.message ?? err));
  for (const { path: filePath, base64 } of entries) {
    const segments = filePath.split("/");
    const name = segments.pop();
    let parent = null;
    let created = false;
    try {
      let dir = await root.getDirectoryHandle(project, { create: true });
      for (const segment of segments) dir = await dir.getDirectoryHandle(segment, { create: true });
      parent = dir;
      try {
        await parent.getFileHandle(name, { create: false });
      } catch (err) {
        if (err?.name !== "NotFoundError") throw err;
        created = true;
      }
      const text = atob(base64);
      const bytes = new Uint8Array(text.length);
      for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
      const handle = await parent.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(bytes);
      await writable.close();
      const size = (await handle.getFile()).size;
      if (size !== bytes.length) throw new Error(`wrote ${bytes.length} bytes but the file reads back as ${size}`);
      written.push({ path: filePath, bytes: size });
    } catch (err) {
      failed.push({ path: filePath, reason: why(err) });
      if (parent && created) {
        try {
          await parent.removeEntry(name);
        } catch {
          /* nothing was created */
        }
      }
    }
  }
  return { written, failed };
}

// Runs in the page. Removes every entry under the project that `keep` (the
// seeded paths) does not name or lead through, dot entries excepted, and
// names what it removed as paths relative to the project; a directory none
// of `keep` leads through goes whole and counts once. An entry the storage
// refuses to remove, or a directory it refuses to list, lands in `failed`
// with its reason and the walk goes on; `removed` always says what went,
// whatever failed after it. The marker is removed last and only when
// nothing failed, so an unfinished prune stays marked. A project that is
// not in storage answers `missing`.
async function pruneProject({ project, keep, marker }) {
  const root = await navigator.storage.getDirectory();
  const files = new Set(keep);
  const dirs = new Set();
  for (const p of keep) {
    const s = p.split("/");
    for (let i = 1; i < s.length; i++) dirs.add(s.slice(0, i).join("/"));
  }
  const removed = [];
  const failed = [];
  const why = (err) => (err?.name && err.name !== "Error" ? `${err.name}: ${err.message}` : String(err?.message ?? err));
  let dir;
  try {
    dir = await root.getDirectoryHandle(project, { create: false });
  } catch (err) {
    if (err?.name === "NotFoundError") return { removed, failed, missing: true };
    throw err;
  }
  const visit = async (handle, prefix) => {
    const names = [];
    try {
      for await (const [name, child] of handle.entries()) names.push([name, child.kind]);
    } catch (err) {
      failed.push({ path: prefix || project, reason: `could not be listed: ${why(err)}` });
      return;
    }
    for (const [name, kind] of names) {
      if (name.startsWith(".")) continue;
      const rel = prefix ? `${prefix}/${name}` : name;
      try {
        if (kind === "directory" && dirs.has(rel)) {
          await visit(await handle.getDirectoryHandle(name, { create: false }), rel);
          continue;
        }
        if (kind === "file" && files.has(rel)) continue;
        await handle.removeEntry(name, { recursive: true });
        removed.push(rel);
      } catch (err) {
        failed.push({ path: rel, reason: why(err) });
      }
    }
  };
  await visit(dir, "");
  if (failed.length === 0) {
    try {
      await dir.removeEntry(marker);
    } catch (err) {
      if (err?.name !== "NotFoundError") failed.push({ path: marker, reason: why(err) });
    }
  }
  return { removed: removed.sort(), failed };
}

// Runs in the page. The file's content as base64, or null when it is not
// there; how seed-project.test.mjs reads a seeded file back. The bytes go
// through String.fromCharCode a 32 KiB slice at a time, which keeps an audio
// file's read-back to a few thousand calls.
async function readProjectFile({ project, path: filePath }) {
  const root = await navigator.storage.getDirectory();
  try {
    const segments = filePath.split("/");
    const name = segments.pop();
    let dir = await root.getDirectoryHandle(project, { create: false });
    for (const segment of segments) dir = await dir.getDirectoryHandle(segment, { create: false });
    const file = await (await dir.getFileHandle(name, { create: false })).getFile();
    const bytes = new Uint8Array(await file.arrayBuffer());
    let text = "";
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(text);
  } catch {
    return null;
  }
}

// Which script the run is actually about to drive. `--sd` is needed only
// when the script changes, because the pinned port keeps OPFS across
// `down`/`up`, so a run without it re-uses whatever the last run left in
// storage. Naming that script in every report is what stops the re-use
// being silent: `wroteThisRun: false` with a `firstLine` from another repro
// is the mismatch, visible without remembering to look for it.
async function loadedScript(page, wroteThisRun, project = LOCAL_PROJECT_ID, file = "main.sd") {
  let encoded = null;
  try {
    encoded = await page.evaluate(readProjectFile, { project, path: file });
  } catch (err) {
    return { file, wroteThisRun, read: false, reason: String(err.message || err).split("\n")[0] };
  }
  if (encoded === null) return { file, wroteThisRun, present: false };
  const text = Buffer.from(encoded, "base64").toString("utf8");
  return {
    file,
    wroteThisRun,
    present: true,
    chars: text.length,
    sha: crypto.createHash("sha256").update(text).digest("hex").slice(0, 12),
    firstLine: text.split(/\r?\n/).find((line) => line.trim()) ?? "",
  };
}

// Console lines every run on this app produces, whatever the change under
// test is. They are partitioned out of `consoleErrors` so a reader spends
// no time on them, and counted under `consoleNoise` so the partition stays
// honest: a line that stopped appearing reads as a count of zero rather
// than disappearing, and a line the list does not know still lands in
// `consoleErrors` where it can be read.
const KNOWN_CONSOLE_NOISE = [
  { name: "semanticTokens/refresh", match: /Unhandled method workspace\/semanticTokens\/refresh/ },
  { name: "diagnostic/refresh", match: /Unhandled method workspace\/diagnostic\/refresh/ },
  { name: "foldingRange/refresh", match: /Unhandled method workspace\/foldingRange\/refresh/ },
  { name: "resource 404", match: /Failed to load resource[^\n]*40[34]/ },
];

/** Splits the captured console into the lines worth reading and the known noise, by count. */
function partitionConsole(lines, known = KNOWN_CONSOLE_NOISE, limit = 25) {
  const errors = [];
  const noise = {};
  for (const name of known.map((n) => n.name)) noise[name] = 0;
  for (const line of lines) {
    if (!line.startsWith("[error]") && !line.startsWith("[pageerror]")) continue;
    const known_ = known.find((n) => n.match.test(line));
    if (known_) noise[known_.name] += 1;
    else errors.push(line);
  }
  return { errors: errors.slice(0, limit), noise };
}

// Whether the project in the page's storage carries the seed marker, which
// means an earlier `--project` seed did not finish and the project is a mix.
async function interruptedSeed(page, project = LOCAL_PROJECT_ID) {
  return page.evaluate(seedInterrupted, { project, marker: SEED_MARKER });
}

// The error `verify` and `ui` report when they are asked to run on a project
// an earlier seed left marked.
function interruptedSeedError(project = LOCAL_PROJECT_ID) {
  return `an earlier --project seed did not finish (${project}/${SEED_MARKER} is in storage), so the project in storage is the previous project with part of that seed over it and nothing seen on it is evidence. Re-run with --project to seed it again, or empty it with seed --clear.`;
}

// The first line of an error, with its name in front when it has one worth
// reading (a DOMException's message says nothing about which error it is).
function describeError(err) {
  const message = String(err?.message ?? err).split("\n")[0];
  return err?.name && err.name !== "Error" && !message.startsWith(err.name) ? `${err.name}: ${message}` : message;
}

// The reason a page whose editor remembers a project other than `project`
// refuses a seed or a clear, or null when it remembers `project` or nothing:
// the editor would open the remembered one, so the storage under `project`
// is not what a run on that page would see.
async function otherProjectRemembered(page, project) {
  const remembered = await page.evaluate(rememberedProject, { key: PROJECT_ID_KEY });
  if (remembered == null || remembered === project) return null;
  return `the editor remembers project "${remembered}" (localStorage "${PROJECT_ID_KEY}"), not "${project}", so it would open a project`;
}

// Empty the project in the page's storage: every non-dot entry goes, and the
// marker with it once everything went; a project that is not there is
// nothing to clear and answers `missing`, and a page whose editor remembers
// another project is refused with nothing removed. The marker stands first,
// so a clear that stops part-way leaves the project marked as a plain run
// must not drive it. The way out of storage a seed cannot replace: a marked
// project with nothing to seed over it, an entry whose kind clashes with the
// source, or a quota the previous project and the seed cannot share.
async function clearProject(page, { project = LOCAL_PROJECT_ID } = {}) {
  const report = { project, removed: [], failed: [] };
  try {
    const other = await otherProjectRemembered(page, project);
    if (other) {
      report.reason = `${other} the clear does not touch; nothing was removed`;
      return report;
    }
    if (await page.evaluate(seedInterrupted, { project, marker: SEED_MARKER })) report.interruptedBefore = true;
    const begun = await page.evaluate(beginSeed, { project, marker: SEED_MARKER, create: false });
    if (begun.missing) {
      report.missing = true;
      return report;
    }
    const out = await page.evaluate(pruneProject, { project, keep: [], marker: SEED_MARKER });
    report.removed = out.removed;
    report.failed = out.failed;
  } catch (err) {
    report.reason = `the project could not be cleared: ${describeError(err)}`;
    return report;
  }
  if (report.failed.length > 0) {
    const first = report.failed[0];
    report.reason = `${report.failed.length} of the project's entries could not be removed (first: ${first.path}: ${first.reason}); ${report.removed.length} went, and ${project}/${SEED_MARKER} marks the project as a mix`;
  }
  return report;
}

// Seed the project at `source` into the page's storage and report what
// landed. `files` and `bytes` count what was written and measured back, not
// what was sent; `failed` names every entry that was not read or written;
// `removed` names the previous project's entries that went; `mainSd` says
// whether a root `main.sd` landed; `unwrapped` names a zip's wrapping
// folder, and `kept` a zip's single top-level folder that held no `main.sd`
// and so was seeded as it is, with a `note` saying so; `storage` says what
// storage holds now (`untouched`, `mixed`: the files that landed over
// whatever was there, with the marker set, or `replaced`); and `reason` is
// set whenever storage does not hold the whole project and nothing else, so
// a caller can fail on it. A source with
// no files, or none at its root named `main.sd` while `expectMainSd` holds,
// is refused before anything is written, as is a page whose editor
// remembers a project other than `project`, and a previous project holding
// an entry whose kind clashes with the source (`clashes` names them), since
// writing over it would mean removing it first. With `clear`, the previous
// project is emptied (`clearProject`, reported under `clear`) once the
// source has passed every check that needs no storage, so a refused source
// leaves it standing; a clear that stops part-way is the reason, with the
// project marked. `collect`, `batchBytes` and `limits` are parameters so the
// check can drive this with a fixture, small batches and small bounds.
async function seedProject(page, source, { project = LOCAL_PROJECT_ID, batchBytes = SEED_BATCH_BYTES, collect = collectProject, expectMainSd = true, limits = SEED_LIMITS, clear = false } = {}) {
  const started = Date.now();
  const report = { source: path.resolve(source), project, storage: "untouched", files: 0, bytes: 0, batches: 0, skipped: 0, removed: [], failed: [], mainSd: false, pruned: false };
  const done = (reason) => {
    if (reason) report.reason = reason;
    report.ms = Date.now() - started;
    return report;
  };
  const firstLine = describeError;
  // What storage holds after a seed that stopped part-way. With `clear` the
  // previous project went before the first write, so nothing of it stands.
  const mixed = () => {
    const landed = `${report.files} file${report.files === 1 ? "" : "s"} that landed`;
    const held = `(a file whose write failed holds what that write left)`;
    const marked = `${project}/${SEED_MARKER} marks the seed as unfinished; re-run --project`;
    if (report.clear) return `the project was emptied before the seed, so storage holds the ${landed} and nothing of the previous project ${held}, and ${marked}`;
    return `the previous project's entries stand under the ${landed} ${held}, and ${marked}`;
  };
  let collected;
  try {
    collected = await collect(source, limits);
  } catch (err) {
    return done(firstLine(err));
  }
  report.kind = collected.kind;
  report.skipped = collected.skipped;
  if (collected.unwrapped) report.unwrapped = collected.unwrapped;
  if (collected.kept) {
    report.kept = collected.kept;
    report.note = `every entry of the zip sits under ${collected.kept}/, which holds no main.sd, so the folder was kept as part of the project's layout and a script's paths start with ${collected.kept}/; if the folder is one the compress command added, make the zip from inside it`;
  }
  report.failed.push(...collected.failed);
  const total = collected.files.length;
  if (report.failed.length > 0) {
    const first = report.failed[0];
    return done(`${report.failed.length} project ${report.failed.length === 1 ? "entry" : "entries"} could not be read (first: ${first.path}: ${first.reason}); nothing was written`);
  }
  if (total === 0) {
    return done(`${source} holds no project files${report.skipped > 0 ? ` (${report.skipped} dot ${report.skipped === 1 ? "entry" : "entries"} skipped)` : ""}; nothing was written`);
  }
  if (expectMainSd && !collected.files.some((f) => f.path === "main.sd")) {
    const top = [...new Set(collected.files.map((f) => f.path.split("/")[0]))].slice(0, 6).join(", ");
    return done(`${source} has no main.sd at its root (its top-level entries: ${top}), so the editor could not open it as a project; nothing was written`);
  }
  try {
    const other = await otherProjectRemembered(page, project);
    if (other) return done(`${other} the seed does not write to; nothing was written. Forget it with a \`--probe\` file holding localStorage.removeItem("project"), then re-run`);
    if (clear) {
      report.clear = await clearProject(page, { project });
      if (report.clear.reason) {
        if (await page.evaluate(seedInterrupted, { project, marker: SEED_MARKER })) report.storage = "mixed";
        return done(report.clear.reason);
      }
    }
    const paths = collected.files.map((f) => f.path);
    const dirs = new Set();
    for (const p of paths) {
      const s = p.split("/");
      for (let i = 1; i < s.length; i++) dirs.add(s.slice(0, i).join("/"));
    }
    const clashes = await page.evaluate(kindClashes, { project, files: paths, dirs: [...dirs] });
    if (clashes.length > 0) {
      report.clashes = clashes;
      const first = clashes[0];
      const more = clashes.length > 1 ? ` and ${clashes.length - 1} more` : "";
      return done(`the previous project has a ${first.storage} named "${first.path}" where the source has a ${first.source}${more}, and the seed would have to remove it before writing; nothing was written. Empty the project with seed --clear, or fix the source`);
    }
    const begun = await page.evaluate(beginSeed, { project, marker: SEED_MARKER });
    if (begun.interrupted) report.interruptedBefore = true;
  } catch (err) {
    return done(`the editor's storage refused the seed before anything was written: ${firstLine(err)}`);
  }
  report.storage = "mixed";
  try {
    for (const batch of planBatches(collected.files, batchBytes)) {
      report.batches += 1;
      const entries = batch.map((f) => ({ path: f.path, base64: Buffer.from(f.bytes).toString("base64") }));
      const out = await page.evaluate(writeProjectBatch, { project, entries });
      for (const w of out.written) {
        report.files += 1;
        report.bytes += w.bytes;
        if (w.path === "main.sd") report.mainSd = true;
      }
      report.failed.push(...out.failed);
    }
  } catch (err) {
    return done(`seeding stopped after ${report.files} of ${total} files: ${firstLine(err)}; ${mixed()}`);
  }
  if (report.failed.length > 0) {
    const first = report.failed[0];
    return done(`${report.failed.length} of ${total} project files could not be written (first: ${first.path}: ${first.reason}); ${mixed()}`);
  }
  let pruned;
  try {
    pruned = await page.evaluate(pruneProject, { project, keep: collected.files.map((f) => f.path), marker: SEED_MARKER });
  } catch (err) {
    return done(`the previous project's stale entries could not be removed: ${firstLine(err)}; ${mixed()}`);
  }
  report.removed = pruned.removed;
  if (pruned.failed.length > 0) {
    const first = pruned.failed[0];
    report.failed.push(...pruned.failed);
    return done(`${pruned.failed.length} of the previous project's entries could not be removed (first: ${first.path}: ${first.reason}); ${report.removed.length} went, the rest stand beside the seeded files, and ${project}/${SEED_MARKER} marks the seed as unfinished; re-run --project`);
  }
  report.pruned = true;
  report.storage = "replaced";
  return done();
}

// `seed`: load a project into the editor's storage, reload so the editor
// re-reads it, and print the report. Exits 1 when the seed left storage
// holding anything but the whole project. `--clear` empties the project
// first, once the source has been read and accepted, or on its own, and the
// report says what went under `clear`.
async function seed(args, deps = liveDeps) {
  let source;
  try {
    source = flag(args, "--project");
  } catch (err) {
    deps.die(err.message);
  }
  const clear = args.includes("--clear");
  if (!source && !clear) deps.die("seed needs --project <dir-or-zip>, --clear, or both");
  if (source && !fs.existsSync(path.resolve(source))) deps.die(`--project ${source} does not exist`);
  const headless = !args.includes("--headed");
  return deps.withEditor(
    async ({ page, url }) => {
      const result = { url };
      try {
        await openEditorPage(page, url);
        await deps.waitForApp(page);
      } catch (err) {
        result.error = `the editor page did not load (${String(err.message || err).split("\n")[0]}). Check \`status\`; the machine may be saturated.`;
        deps.log(JSON.stringify(result, null, 2));
        process.exitCode = 1;
        return result;
      }
      if (clear && !source) {
        result.clear = await deps.clearProject(page);
        if (result.clear.reason) {
          result.error = result.clear.reason;
          deps.log(JSON.stringify(result, null, 2));
          process.exitCode = 1;
          return result;
        }
      }
      if (source) {
        result.seed = await deps.seedProject(page, source, { clear });
        if (result.seed.clear) result.clear = result.seed.clear;
      }
      if (result.seed?.reason) {
        result.error = result.seed.reason;
        process.exitCode = 1;
      } else {
        try {
          await reloadEditorPage(page);
          await deps.waitForApp(page);
        } catch (err) {
          result.error = `the editor page did not reload after ${source ? "seeding" : "clearing"} (${String(err.message || err).split("\n")[0]})`;
          process.exitCode = 1;
        }
      }
      deps.log(JSON.stringify(result, null, 2));
      return result;
    },
    { headless },
  );
}

// The editor is a plain Preact app hydrated into #root — there is no
// <spark-editor> custom element to wait for. The CodeMirror instance stashes
// its EditorView on the .cm-content node as `.cmTile.view`.
async function waitForEditor(page, timeout = 90_000) {
  await page.waitForSelector(".sparkdown-script-editor-root .cm-content", { timeout });
  await page.waitForFunction(
    () => document.querySelector(".sparkdown-script-editor-root .cm-content")?.cmTile?.view != null,
    null,
    { timeout },
  );
}

// Scrub the game preview to a source line, by clicking that line.
//
// The click is a real one, driven through Playwright's mouse. A programmatic
// `view.dispatch({selection})` moves the caret without a user event behind it,
// and the editor does not reliably forward that move to the player: the cursor
// sits on the requested line while the route indicator stays on the old beat,
// for as long as you care to wait, with nothing raised. Measured across this
// harness it never moved the preview, so nothing here dispatches a selection.
//
// Three details this depends on:
//   - Scrolling moves `scrollDOM.scrollTop` directly instead of dispatching a
//     transaction with `scrollIntoView`, so the whole path stays free of the
//     mechanism above.
//   - `coordsAtPos` only answers for lines CodeMirror has actually rendered,
//     and its answer is stale until the scroll has landed and the view has
//     re-measured — hence the scroll, the wait, and a separate re-read.
//   - The click lands a few characters INTO the line rather than at its very
//     start, so it still changes the selection when the caret is already parked
//     at the start; a selection that does not change produces no event for the
//     editor to forward.
//
// Two things will silently defeat a scrub however it is driven:
//   1. Scrubbing ONLY works while the preview is STOPPED. Once you press PLAY
//      the engine is time-driven and ignores the cursor entirely.
//   2. The editor RESTORES the previous session's cursor position asynchronously
//      after load, so the caller must let the first compile settle before
//      scrubbing, or the restore lands afterwards and wins.
async function clickLine(page, line) {
  const scrolled = await page.evaluate((target) => {
    const view = document.querySelector(".sparkdown-script-editor-root .cm-content")?.cmTile?.view;
    if (!view) return { ok: false, reason: "no CodeMirror view" };
    const total = view.state.doc.lines;
    const clamped = Math.min(Math.max(1, target), total);
    const block = view.lineBlockAt(view.state.doc.line(clamped).from);
    const scroller = view.scrollDOM;
    // `block.top` is in the document's own coordinate space and `documentTop`
    // is where that space currently sits on screen, so their sum is the line's
    // screen position. Centre it in the scroller.
    const screenY = view.documentTop + block.top;
    const wantY = scroller.getBoundingClientRect().top + scroller.clientHeight / 2;
    scroller.scrollTop += screenY - wantY;
    return { ok: true, line: clamped, totalLines: total };
  }, line);
  if (!scrolled.ok) return { clicked: false, reason: scrolled.reason };

  await page.waitForTimeout(600); // let the scroll land and the view re-measure

  const spot = await page.evaluate((target) => {
    const view = document.querySelector(".sparkdown-script-editor-root .cm-content")?.cmTile?.view;
    if (!view) return { ok: false, reason: "no CodeMirror view" };
    const l = view.state.doc.line(target);
    const pos = l.from + Math.min(6, l.length);
    // A click that resolves to the position the caret already holds changes no
    // selection, and so produces no event for the editor to forward. An empty
    // line always hits this, since there is no character to aim past. Say so
    // rather than clicking and reporting a success that moved nothing.
    if (pos === view.state.selection.main.head) {
      return {
        ok: false,
        reason:
          `a click on line ${target} would land on the position the caret already ` +
          `holds, so it would change no selection` +
          (l.length === 0 ? ` (the line is empty)` : ``),
      };
    }
    const co = view.coordsAtPos(pos);
    if (!co) return { ok: false, reason: `line ${target} is not rendered` };
    const x = Math.round(co.left + 1);
    const y = Math.round((co.top + co.bottom) / 2);
    // Clicking a toolbar or some overlay instead of the text would leave the
    // preview exactly where it was, so check what is under the point rather
    // than assuming the coordinates are reachable.
    const hit = document.elementFromPoint(x, y);
    if (!hit || !hit.closest(".sparkdown-script-editor-root .cm-content")) {
      return {
        ok: false,
        reason: `point (${x}, ${y}) is covered by ${hit ? hit.tagName.toLowerCase() : "nothing"}`,
      };
    }
    return { ok: true, x, y };
  }, scrolled.line);
  if (!spot.ok) return { clicked: false, line: scrolled.line, reason: spot.reason };

  await page.mouse.click(spot.x, spot.y);

  const cursorLine = await page.evaluate(() => {
    const view = document.querySelector(".sparkdown-script-editor-root .cm-content")?.cmTile?.view;
    if (!view) return null;
    return view.state.doc.lineAt(view.state.selection.main.head).number;
  });
  return { clicked: true, line: scrolled.line, x: spot.x, y: spot.y, cursorLine };
}

// Wait for the game to actually MOUNT inside the player iframe.
//
// `readyState === "complete"` is NOT enough: right after a server restart the
// iframe loads but the `#game` scaffold never appears, and the Game Preview pane
// sits BLANK WHITE while every other signal looks healthy. A reload of the
// editor page reliably kicks it into mounting, so try that once before giving
// up rather than reporting a confidently-wrong empty screenshot.
// Whether `#game` is in the player iframe within `timeout`, polled once a
// second; the mount signal `waitForGame` retries on.
const GAME_MOUNT_BUDGET_MS = 45_000;
// Whether the game mounts within `timeout`, polled once a second through
// `window.__preview`. `now` is the clock, a parameter so seed-project.test.mjs
// can run the wait in-process against a page whose `waitForTimeout` moves a
// fake clock and count the polls the budget allows.
async function gameMountedWithin(page, timeout = GAME_MOUNT_BUDGET_MS, { now = Date.now } = {}) {
  const mounted = async () =>
    page.evaluate(() => {
      const s = window.__preview?.summary();
      return !!s && s.sameOrigin && s.gameChildren != null;
    });
  const deadline = now() + timeout;
  while (now() < deadline) {
    if (await mounted()) return true;
    await page.waitForTimeout(1000);
  }
  return false;
}

// The game mount wait `verify` and a `ui --sd` step use: the budget once,
// then a recovery reload, the editor brought back (`switched` says whether
// that changed the screen or tab), and the budget again. `now` is the clock,
// a parameter for the in-process check; `ensure` is what brings the editor
// back, and the commands pass their own `ensureScriptEditor` dep so the
// recovery goes through the same function as the rest of the run.
async function waitForGame(page, { timeout = GAME_MOUNT_BUDGET_MS, now = Date.now, ensure = ensureScriptEditor } = {}) {
  if (await gameMountedWithin(page, timeout, { now })) return { mounted: true, reloaded: false };

  try {
    await reloadEditorPage(page);
  } catch (err) {
    return { mounted: false, reloaded: true, error: `the recovery reload did not complete (${String(err.message || err).split("\n")[0]})` };
  }
  const back = await ensure(page);
  if (!back.present) return { mounted: false, reloaded: true, error: back.reason, switched: back.switched };
  if (await gameMountedWithin(page, timeout, { now })) return { mounted: true, reloaded: true, switched: back.switched };
  return { mounted: false, reloaded: true, switched: back.switched };
}

async function previewSummary(page) {
  return page.evaluate(() => {
    const p = window.__preview;
    if (!p) return { installed: false };
    return { installed: true, ...p.summary() };
  });
}

// What the game is actually SHOWING, as readable text.
//
// TWO traps here, both of which produce useless output if you do the obvious
// thing:
//   1. `textContent` picks up the player's injected <style> blocks, so every
//      ancestor's text is a wall of CSS.
//   2. The typewriter effect wraps EVERY CHARACTER in its own <span>, so
//      "leaf elements with text" gives you one letter per entry.
// `innerText` solves both: it is layout-aware (display:none <style> is
// excluded) and it flattens the per-character spans back into words.
async function previewText(page) {
  return page.evaluate(() => {
    const p = window.__preview;
    const el = p?.$("#game-ui") ?? p?.game();
    return el?.innerText?.trim() ?? null;
  });
}

// The route indicator ("main : 1 → main : 8") lives in the PLAYER's toolbar,
// INSIDE the iframe — it is not in the editor document, so searching the editor
// DOM for it finds nothing. Read it via __preview.
async function routeLabel(page) {
  return page.evaluate(() => {
    const p = window.__preview;
    return p?.$("#toolbar")?.innerText?.trim().replace(/\s+/g, " ") ?? null;
  });
}

// Every line of the open document, as source text.
async function documentLines(page) {
  return page.evaluate(() => {
    const view = document.querySelector(".sparkdown-script-editor-root .cm-content")?.cmTile?.view;
    if (!view) return null;
    const out = [];
    for (let i = 1; i <= view.state.doc.lines; i++) {
      out.push(view.state.doc.line(i).text);
    }
    return out;
  });
}

// Did the preview land on the line we asked for?
//
// The route number cannot answer this. It reports how far execution reached
// rather than the line requested, so it differs from the target on every line
// with anything after it, and a check built on it warns on healthy scrubs and
// teaches its reader to ignore it (#419 — this function is that fix).
//
// The rendered text can answer it, but only for lines it can attribute, so
// there are three outcomes rather than a boolean:
//
//   landed        the target line's own text is on screen
//   elsewhere     some other line's text is on screen and the target's is not.
//                 A real failed scrub, and it names what it found instead.
//   inconclusive  nothing attributable. Either the line does not render
//                 verbatim (interpolation, markup, a heading, a character name)
//                 or its text cannot be told apart from another line's.
//
// "inconclusive" is a real answer, not a soft failure. Collapsing it into
// either of the others is what makes a check like this dangerous: reported as
// success it hides failed scrubs, which is the one thing this harness exists to
// catch, and reported as failure it is the very noise #419 is about.
//
// A line is usable as evidence only when its trimmed text is at least three
// characters and is not contained in any other line's text. That second
// condition is what stops "Hello" being read as proof while the screen shows
// "Hello there", and it makes duplicated lines unusable in both directions
// instead of silently attributing to whichever came first.
export function classifyScrub(lines, target, visible) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return {
      outcome: "inconclusive",
      reason: "the editor returned no document text to compare against",
    };
  }
  if (typeof visible !== "string" || visible.trim() === "") {
    return {
      outcome: "inconclusive",
      reason: "the game rendered no text to compare against",
    };
  }

  const trimmed = lines.map((l) => (typeof l === "string" ? l.trim() : ""));
  const idx = target - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= trimmed.length) {
    return {
      outcome: "inconclusive",
      reason: `line ${target} is outside the document (${trimmed.length} lines)`,
    };
  }

  // Deliberately not precomputed for every line: on a long script that is a
  // quadratic scan of substring tests. Only the target and the handful of lines
  // actually present in `visible` are ever asked.
  const attributable = (i) => {
    const t = trimmed[i];
    if (!t || t.length < 3) return false;
    return !trimmed.some((other, j) => j !== i && other && other.includes(t));
  };

  const targetAttributable = attributable(idx);
  if (targetAttributable && visible.includes(trimmed[idx])) {
    return { outcome: "landed" };
  }

  const showing = [];
  for (let i = 0; i < trimmed.length; i++) {
    if (i === idx) continue;
    if (!trimmed[i] || !visible.includes(trimmed[i])) continue; // cheap filter first
    if (attributable(i)) showing.push(i + 1);
  }
  if (showing.length > 0) {
    return {
      outcome: "elsewhere",
      showing,
      reason:
        `the game is showing line${showing.length > 1 ? "s" : ""} ` +
        `${showing.join(", ")}, not line ${target}; if the scrub really did fail, aim at an ` +
        `indented dialogue or action line, since a NAME: line, a heading and a blank line ` +
        `are not playable beats`,
    };
  }

  return {
    outcome: "inconclusive",
    reason: targetAttributable
      ? `line ${target}'s text is not on screen and neither is any other line's, ` +
        `so it may simply not render verbatim (interpolation, markup, a heading, ` +
        `a character-name line)`
      : `line ${target}'s text cannot be told apart from other lines in the ` +
        `script, so the rendered text can neither confirm nor deny the scrub`,
  };
}

// The beat the preview paused on. In "main : 1 → main : 8" that is 8; with no
// arrow ("main : 1") it is 1.
//
// Do NOT read this as the line that was scrubbed to. The engine pauses on the
// beat AFTER the content it played, so it equals the requested line only when
// nothing follows that line: scrubbing to line 20 of a 63-line script settles
// on beat 22. Comparing it for equality is a rough smoke test that reports a
// mismatch on healthy mid-script scrubs; `previewText` is what says whether the
// preview is actually showing the requested line.
function routeBeat(label) {
  if (!label) return null;
  const nums = [...label.matchAll(/main\s*:\s*(\d+)/g)].map((m) => Number(m[1]));
  return nums.length ? nums[nums.length - 1] : null;
}

// Wait for the program to reach the player. The toolbar's launch-state icon
// gets its `icon` attribute when the player loads a program
// (GamePlayerController's LoadPreview handler ends in updateLaunchStateIcon),
// running or not, so the attribute is the one signal that the first compile
// is over. Until then the game DOM is an empty scaffold whose text is "",
// which waitForPreviewSettle reads as settled at once; on a project whose
// first compile outlasts that quiet window (the Raffles & Bunny project takes
// 5-10 s here) a scrub sent then goes to a player that is not listening and
// the preview stays black (#435). Answers null when the preview is not
// observable (cross-origin mode), where nothing can be waited for; the
// callers answer null themselves when the game never mounted, where the
// wait could only burn its budget. The compiler emits no program for a
// script with error diagnostics, so when the wait fails, `errors` carries
// the count the editor's status bar shows (its `.cm-errorsLabel`, hidden at
// zero), which is what tells a script that does not compile from a harness
// that was not ready. That bar counts the open document's diagnostics
// alone (the language server publishes them per file, and the page holds no
// count for the whole project), so an error in a file that is not open, an
// included script in a seeded project, reads as zero.
const PROGRAM_BUDGET_MS = 90_000;
async function waitForProgram(page, timeout = PROGRAM_BUDGET_MS) {
  const started = Date.now();
  if (!(await previewSummary(page)).installed) return { loaded: null, reason: "the preview is not observable" };
  const loaded = await page
    .waitForFunction(() => window.__preview?.$("#launch-state-icon")?.hasAttribute("icon") === true, null, { timeout })
    .then(() => true, () => false);
  const out = { loaded, ms: Date.now() - started };
  if (!loaded) {
    out.errors = await page
      .evaluate(() => {
        const label = document.querySelector(".sparkdown-script-editor-root .cm-errorsLabel");
        if (!label || label.hidden) return 0;
        const m = /(\d+)/.exec(label.textContent || "");
        return m ? Number(m[1]) : 0;
      })
      .catch(() => null);
  }
  return out;
}

// The warning for a program wait that failed, from its report: an error
// count is the open document not compiling; none is the harness not being
// ready, or an error in a file that is not open.
function programWarning(program, budget = PROGRAM_BUDGET_MS) {
  if (program.errors > 0) {
    return `the script does not compile: the editor's status bar shows ${program.errors} error${program.errors === 1 ? "" : "s"} in the open document, so no program reached the player within ${seconds(budget)}. The preview shows the last program the player had, or nothing, and a scrub is dropped; that is the picture of a script that does not compile, which is evidence only when that is the bug.`;
  }
  return `the player had not loaded a program within ${seconds(budget)} (the toolbar's launch-state icon never appeared) and the editor's status bar shows no errors in the open document: either the harness was not ready (the first compile was still running or never reached the player), or a file that is not open does not compile (an included script, on a --project run; the status bar counts the open document alone). A scrub sent now is dropped and the preview is not evidence; re-run, or open the included scripts in the editor to see their errors.`;
}

// The warning for a run whose logic pane shows its fullscreen scripts view:
// the file on screen is not the project's main.sd, which is what the scrub
// reads and what `--sd` or `--project` wrote.
function scriptsViewWarning({ projectPath, sdPath }) {
  const which = projectPath ? "the seeded project's main.sd" : sdPath ? "the main.sd --sd wrote" : "the project's main.sd";
  return `the logic pane is showing its fullscreen scripts view (another file is open), so the file on screen is not ${which}, and the scrub reads the file on screen. Close that file in the editor before trusting this run.`;
}

// Wait for the game DOM to stop changing. A scrub round-trips editor -> player
// worker -> simulateRoute -> checkpoint -> re-render, and the typewriter effect
// then reveals text character by character — so the DOM keeps mutating for
// seconds after the cursor moves. Polling the rendered text until it stops
// changing is the only reliable "it has settled" signal; a fixed sleep either
// truncates mid-typewriter or wastes time.
async function waitForPreviewSettle(page, { timeout = 30_000, quiet = 2500 } = {}) {
  const deadline = Date.now() + timeout;
  let last = await previewText(page);
  let stableSince = Date.now();
  while (Date.now() < deadline) {
    await page.waitForTimeout(400);
    const now = await previewText(page);
    if (now !== last) {
      last = now;
      stableSince = Date.now();
    } else if (last != null && Date.now() - stableSince > quiet) {
      return { settled: true, text: last };
    }
  }
  return { settled: false, text: last };
}

async function verify(args, deps = liveDeps) {
  let sdPath;
  let projectPath;
  let shot;
  let line;
  let probePath;
  try {
    sdPath = flag(args, "--sd");
    projectPath = flag(args, "--project");
    shot = flag(args, "--shot");
    line = flag(args, "--line");
    probePath = flag(args, "--probe");
  } catch (err) {
    deps.die(err.message);
  }
  const headless = !args.includes("--headed");
  if (projectPath && !fs.existsSync(path.resolve(projectPath))) deps.die(`--project ${projectPath} does not exist`);

  return deps.withEditor(
    async ({ page, url, consoleLines, mode }) => {
      const result = { url };
      // What verify captures is the game preview, which the page can observe
      // only in same-origin mode (window.__preview). In cross-origin mode
      // the run stops here, before the page is loaded and before a seed or
      // a script write replaces what storage holds for a picture that could
      // never be evidence.
      if (mode === "cross-origin") {
        result.gameMounted = null;
        result.program = { loaded: null, reason: "the preview is not observable (cross-origin mode)" };
        result.error = "the game preview is not observable in cross-origin mode (window.__preview is never installed), so nothing seen on it is evidence; `down`, then `up` without --cross-origin";
        deps.log(JSON.stringify(result, null, 2));
        process.exitCode = 1;
        return result;
      }

      // A navigation that never completes is a report, not a stack trace.
      try {
        await openEditorPage(page, url);
      } catch (err) {
        result.gameMounted = false;
        result.error = `the editor page did not load (${String(err.message || err).split("\n")[0]}). Check \`status\`; the machine may be saturated.`;
        deps.log(JSON.stringify(result, null, 2));
        process.exitCode = 1;
        return result;
      }
      const shell = await deps.ensureScriptEditor(page);
      if (shell.switched) result.switchedToLogic = true;
      if (!shell.present) {
        // No editor, no scrub, no evidence: say so in the report rather than
        // dying in a Playwright timeout with nothing printed.
        result.gameMounted = false;
        result.error = shell.reason;
        result.preview = await deps.previewSummary(page).catch(() => null);
        deps.log(JSON.stringify(result, null, 2));
        process.exitCode = 1;
        return result;
      }
      result.editorSettled = shell.settled;
      // Which editor is on screen: the main tab's, or the fullscreen scripts
      // view with another file open. --sd writes main.sd either way, so in
      // the second case the script on screen is not the one being scrubbed.
      result.editorView = await page.evaluate(() =>
        document.querySelector('[role="tab"][id$="-trigger-main"]') ? "main" : "scripts-view",
      );
      if (result.editorView === "scripts-view") result.editorWarning = scriptsViewWarning({ projectPath, sdPath });
      // The preview pane remembers screenplay mode across runs, and in that
      // mode the game never mounts (window.__preview is installed by the game
      // preview alone). verify needs the game, so switch back, the way a user
      // does: the screenplay toolbar's "Preview Game" button.
      const gameObservable = await page
        .waitForFunction(() => window.__preview != null, null, { timeout: 5_000 })
        .then(() => true, () => false);
      if (!gameObservable) {
        const toGame = page.locator('[aria-label="Preview Game"]').first();
        const toolbarUp = await toGame.waitFor({ state: "visible", timeout: 5_000 }).then(() => true, () => false);
        if (toolbarUp) {
          await toGame.click();
          result.switchedToGamePreview = true;
          await deps.waitForDomQuiet(page, { quiet: 600, timeout: 10_000 });
        }
      }

      // The project goes in first and the script over it, so a repro script
      // can run against a real project's assets. A seed that left storage
      // holding anything but the whole project is not the project; nothing
      // seen on it is evidence, so the run stops on `seed.reason` without a
      // screenshot, and says nothing about the game, which was never asked.
      if (projectPath) {
        result.seed = await deps.seedProject(page, projectPath, { expectMainSd: !sdPath });
        if (result.seed.reason) {
          result.error = `${result.seed.reason}. The game was never asked about, so restarting the servers changes nothing.`;
          deps.log(JSON.stringify(result, null, 2));
          process.exitCode = 1;
          return result;
        }
      } else if (await deps.interruptedSeed(page)) {
        result.error = interruptedSeedError();
        deps.log(JSON.stringify(result, null, 2));
        process.exitCode = 1;
        return result;
      }
      if (sdPath) {
        const src = fs.readFileSync(path.resolve(sdPath), "utf8");
        result.wroteChars = await deps.writeMainSd(page, src);
      }
      if (projectPath || sdPath) {
        // Reload so loadInitialFiles re-reads OPFS, then let the LSP + player
        // finish their first compile.
        try {
          await reloadEditorPage(page);
        } catch (err) {
          result.gameMounted = false;
          result.error = `the editor page did not reload after writing the ${projectPath ? "project" : "script"} (${String(err.message || err).split("\n")[0]}). Check \`status\`; the machine may be saturated.`;
          deps.log(JSON.stringify(result, null, 2));
          process.exitCode = 1;
          return result;
        }
        const again = await deps.ensureScriptEditor(page);
        if (again.switched) result.switchedToLogic = true;
        if (!again.present) {
          result.gameMounted = false;
          result.error = again.reason;
          deps.log(JSON.stringify(result, null, 2));
          process.exitCode = 1;
          return result;
        }
        result.editorSettled = again.settled;
        // The reload restores the view from storage; read it again rather
        // than trusting the pre-reload answer.
        result.editorView = await page.evaluate(() =>
          document.querySelector('[role="tab"][id$="-trigger-main"]') ? "main" : "scripts-view",
        );
        if (result.editorView === "scripts-view") result.editorWarning = scriptsViewWarning({ projectPath, sdPath });
        else delete result.editorWarning;
      }

      // Which script the scrub below is about to drive, whether or not this
      // run wrote it.
      result.script = await deps.loadedScript(page, Boolean(sdPath));

      await page
        .waitForFunction(() => window.__preview?.summary().sameOrigin === true, null, {
          timeout: 60_000,
        })
        .catch(() => {
          result.previewWarning =
            "window.__preview never reported sameOrigin within 60s: the preview pane is showing the screenplay, or the game preview never mounted";
        });

      // The recovery reload brings the editor back through the same dep the
      // rest of the run uses, so `switchedToLogic` means one thing.
      const mount = await deps.waitForGame(page, { ensure: deps.ensureScriptEditor });
      result.gameMounted = mount.mounted;
      if (mount.reloaded) result.neededReload = true;
      if (mount.switched) result.switchedToLogic = true;
      if (!mount.mounted) {
        // A game that never mounted is a failed run: the screenshot is not
        // evidence and the shell must not stay green. The retry's own reason
        // (the editor was on another screen after the reload) is added to the
        // generic text rather than replacing it.
        result.error =
          "the game never mounted (#game absent) — the Game Preview is blank. " +
          "Screenshot is NOT valid evidence. Try `down` then `up`." +
          (mount.error ? ` On the reload retry: ${mount.error}.` : "");
        process.exitCode = 1;
      }

      // Let the FIRST compile finish before touching the cursor. On a cold
      // origin the player worker is not listening for `didSelect` yet, so an
      // early scrub is silently dropped and the preview stays on beat 1-2.
      // A game that never mounted has no program to wait for.
      result.program = mount.mounted ? await deps.waitForProgram(page) : { loaded: null, reason: "the game never mounted" };
      if (result.program.loaded === false) result.programWarning = programWarning(result.program);
      let settle = await deps.waitForPreviewSettle(page);

      if (line) {
        const target = Number(line);
        result.scrub = await deps.clickLine(page, target);
        // A line CodeMirror has not rendered yet can refuse the first attempt;
        // giving the view time to catch up and asking once more is cheap.
        if (!result.scrub.clicked) {
          await page.waitForTimeout(1500);
          result.scrub = await deps.clickLine(page, target);
        }

        settle = await deps.waitForPreviewSettle(page);
        result.route = await deps.routeLabel(page);

        // There is deliberately no "did the preview move" field here. Every
        // `verify` reloads the page, so the preview always starts at the top and
        // the route labels are empty until the first selection arrives — a
        // before/after comparison is therefore true on every run, and a field
        // that is always true is one nobody reads.

        // Whether the scrub landed is decided from the rendered text, not from
        // the route number. See classifyScrub.
        result.scrubCheck = classifyScrub(
          await deps.documentLines(page),
          target,
          settle.text,
        );

        if (result.scrubCheck.outcome !== "landed") {
          const scrub = result.scrub;
          let clickNote = "";
          if (scrub?.clicked) {
            const where = Number.isFinite(scrub.cursorLine)
              ? `line ${scrub.cursorLine}`
              : `a position it could not read back`;
            clickNote = ` The click put the cursor on ${where}.`;
          } else if (scrub) {
            clickNote = ` The click could not run: ${scrub.reason}.`;
          }
          result.scrubWarning =
            (result.scrubCheck.outcome === "elsewhere"
              ? `The scrub to line ${target} is not confirmed by the rendered text: ` +
                `${result.scrubCheck.reason}. Usually a genuinely failed scrub, but open ` +
                `the screenshot first — the same near-duplicate-text confusion that ` +
                `produces \`inconclusive\` can produce this outcome too, on a line that ` +
                `is genuinely on screen.`
              : `Could not confirm the scrub landed: ${result.scrubCheck.reason}. ` +
                `This is not the same as a failure — read \`visible\` and judge it ` +
                `yourself.`) +
            clickNote +
            ` (The \`route\` number is not a check on this: it reports how far ` +
            `execution reached, not the line requested.)`;
        }
      } else {
        result.route = await deps.routeLabel(page);
      }

      result.settled = settle.settled;
      result.preview = await deps.previewSummary(page);
      result.visible = settle.text;

      if (probePath) {
        const code = fs.readFileSync(path.resolve(probePath), "utf8");
        result.probe = await page.evaluate(
          // eslint-disable-next-line no-new-func
          (src) => new Function(`return (async () => { ${src} })()`)(),
          code,
        );
      }

      if (shot) {
        const out = path.resolve(shot);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        // verify's evidence is the game preview, but the editor pane is in
        // the same picture; a settled view can still be unpainted, so wait
        // for its lines and gutter and say so if they never came.
        const paintBudget = PAINT_BUDGET_MS;
        if (!(await deps.editorPainted(page, paintBudget))) {
          result.editorPaintWarning = `the script editor had not painted its lines and gutter within ${seconds(paintBudget)} of the screenshot; the editor half of the picture may be blank`;
        }
        await page.screenshot({ path: out, fullPage: false });
        result.screenshot = out;
      }

      const captured = partitionConsole(consoleLines);
      result.consoleErrors = captured.errors;
      result.consoleNoise = captured.noise;

      deps.log(JSON.stringify(result, null, 2));
      return result;
    },
    { headless },
  );
}

// ------------------------------------------------------- editor surfaces ---
//
// `verify` reaches the game preview. These reach the editor's own interface:
// the find and go-to-line panels inside the script editor, and the three main
// screens the bottom tabs switch between. A change to any of those is invisible
// to `verify`, and before this every session that touched one wrote its own
// Playwright script to satisfy the skill's completion gate (#423).
//
// Every action here is the one a user performs: the panels open on their own
// keyboard shortcut, text goes in as real keystrokes, screens switch by
// clicking the tab. Nothing dispatches into CodeMirror or pokes the workspace
// store, so what these observe is what a user would see.

// Panels the script editor owns. Each opens on a CodeMirror keymap binding and
// is identified by the class its Panel implementation sets on its root
// (customSearch.ts in sparkdown-document-views). The fields are contenteditable
// divs carrying a `name`, not <input>s.
const SURFACES = {
  find: {
    selector: ".sparkdown-script-editor-root .cm-search",
    open: "Control+f",
    fields: { search: "[name=search]", replace: "[name=replace]" },
    buttons: ["next", "prev", "select", "replace", "replaceAll", "close"],
    toggles: ["case", "re", "word"],
  },
  goto: {
    selector: ".sparkdown-script-editor-root .cm-gotoLine",
    open: "Control+g",
    fields: { line: "[name=line]" },
    buttons: ["submit", "close"],
    toggles: [],
  },
};

// The main screens. Every tab in the editor is a Radix trigger whose id ends in
// `-trigger-<value>`, and the value is the workspace's own name for the pane
// (`logic`, `assets`, `share`) or, for the tab row inside a pane, its panel
// (`main`, `scripts`, ...). The tab's text is not usable as a name: it renders
// twice (an active and an inactive label), so its accessible name is
// "LogicLogic".
//
// Which screen is on display is read from the pane's content, not from the
// screen tab's selected state: on a fresh load the app highlights no screen tab
// at all (MainWindow.tsx pins the tab row to a non-matching value until the
// workspace reports ready), so the tab says "none" while the logic screen is
// plainly showing. Each pane mounts its own inner tab row and nothing else
// does, so that row is the marker; the logic pane's fullscreen scripts view
// (Logic.tsx, view "logic-editor") mounts no tab row but does mount a script
// editor, so that counts for logic too. The Router mounts one pane at a time.
const SCREENS = {
  logic: '[role="tab"][id$="-trigger-main"], .sparkdown-script-editor-root .cm-content',
  assets: '[role="tab"][id$="-trigger-files"]',
  share: '[role="tab"][id$="-trigger-game"]',
};
const tabSelector = (value) => `[role="tab"][id$="-trigger-${value}"]`;
const SHOT_TARGETS = { find: SURFACES.find.selector, goto: SURFACES.goto.selector, editor: ".sparkdown-script-editor-root .cm-editor", page: null };

/**
 * Playwright's key strings are case-sensitive for a single character: `Shift+g`
 * delivers `key: "g"` with `shiftKey: true`, which no keyboard produces (a
 * keyboard reports `G`), and CodeMirror resolves a letter binding from the
 * reported key, so the shifted variant of a binding never runs from that form
 * and the unshifted one runs instead. Measured in the live editor on
 * 2026-09-04 with playwright 1.61: `Control+Shift+G`, `Control+Shift+KeyG`,
 * and holding Control and Shift around `press("KeyG")` all deliver `key: "G"`;
 * only `Control+Shift+g` delivers `g`. So a lowercase letter under Shift is
 * rewritten to its uppercase form before it is pressed.
 *
 * A `+` key is written as a trailing `+` (`Control++`), the way Playwright
 * reads it; an empty combo is refused rather than pressed as nothing.
 */
export function normalizeKeyCombo(combo) {
  const raw = String(combo ?? "").trim();
  if (raw === "") throw new Error("empty key combo");
  let key;
  let modsText;
  if (raw === "+" || raw.endsWith("++")) {
    key = "+";
    modsText = raw === "+" ? "" : raw.slice(0, -2);
  } else if (raw.endsWith("+")) {
    throw new Error(`key combo "${combo}" names no key (write a + key as "Control++")`);
  } else {
    const at = raw.lastIndexOf("+");
    key = at < 0 ? raw : raw.slice(at + 1);
    modsText = at < 0 ? "" : raw.slice(0, at);
  }
  key = key.trim();
  if (key === "") throw new Error(`key combo "${combo}" names no key`);
  const mods = modsText.split("+").map((m) => m.trim()).filter(Boolean);
  const shifted = mods.some((m) => /^shift$/i.test(m));
  const fixed = shifted && /^[a-z]$/.test(key) ? key.toUpperCase() : key;
  return { combo: [...mods, fixed].join("+"), rewritten: fixed !== key };
}

async function pressKey(page, combo) {
  const n = normalizeKeyCombo(combo);
  await page.keyboard.press(n.combo);
  return n;
}

/** Focus the CodeMirror view so editor-scoped keymap bindings receive keys. */
async function focusEditor(page) {
  await page.evaluate(() => document.querySelector(".sparkdown-script-editor-root .cm-content")?.cmTile?.view?.focus());
}

/** Resolve while the DOM has been still for `quiet` ms, or give up at `timeout`. */
async function waitForDomQuiet(page, { quiet = 400, timeout = 8_000 } = {}) {
  return page.evaluate(
    ({ quiet, timeout }) =>
      new Promise((resolve) => {
        let timer;
        const done = (settled) => {
          obs.disconnect();
          clearTimeout(giveUp);
          resolve(settled);
        };
        const arm = () => {
          clearTimeout(timer);
          timer = setTimeout(() => done(true), quiet);
        };
        const obs = new MutationObserver(arm);
        obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
        const giveUp = setTimeout(() => done(false), timeout);
        arm();
      }),
    { quiet, timeout },
  );
}

/** The editor shell is up: its tab row exists. Does not need the script editor. */
async function waitForApp(page, timeout = 90_000) {
  await page.waitForSelector('[role="tab"]', { timeout });
}

/** The screen on display, read from pane content; null while no pane is mounted. */
async function activeScreen(page) {
  const mounted = await mountedScreens(page);
  return mounted.length === 1 ? mounted[0] : null;
}

/** Every main screen whose content is mounted; empty while no pane is. */
async function mountedScreens(page) {
  return page.evaluate(
    (screens) => Object.entries(screens).filter(([, selector]) => document.querySelector(selector)).map(([name]) => name),
    SCREENS,
  );
}

/**
 * The script editor is only on the logic screen, and the screen is remembered
 * by the persistent profile across runs. A command that needs the editor
 * cannot assume it is there; this says whether it is, and why not.
 */
async function scriptEditorPresent(page, timeout = 10_000) {
  // Fail fast when another screen is on display: the editor cannot appear
  // there, so waiting the full budget would only cost the session time. On
  // the logic screen the budget stays, because a cold editor's mount was
  // measured at up to ~4.6 s on the reference machine.
  const screenNow = await activeScreen(page);
  const budget = screenNow != null && screenNow !== "logic" ? 500 : timeout;
  try {
    await page.waitForFunction(() => document.querySelector(".sparkdown-script-editor-root .cm-content")?.cmTile?.view != null, null, { timeout: budget });
    return { present: true };
  } catch {
    const screen = await activeScreen(page);
    const panelTab = await page.evaluate(() =>
      [...document.querySelectorAll('[role="tab"][aria-selected="true"]')].map((t) => t.id.replace(/^.*-trigger-/, "")).find((v) => !["logic", "assets", "share"].includes(v)) ?? null,
    );
    return { present: false, ...editorAbsentReason({ screen, panelTab, budgetMs: budget }) };
  }
}

/**
 * The words for an absent editor, in parts, so a caller that adds its own
 * advice can keep the navigational kind ("put --screen main before this
 * step") and drop only the generic kind (re-run). Pure; the gate test builds
 * its stubs from it so the strings cannot drift apart.
 */
export function editorAbsentReason({ screen, panelTab, budgetMs }) {
  const where = `the script editor is not on screen (active screen: ${screen ?? "none"}${panelTab ? `, tab: ${panelTab}` : ""})`;
  // No screen at all is a page still loading, not a wrong screen: nothing to
  // navigate to, so no navigational advice.
  const navigational =
    screen === "logic" && panelTab && panelTab !== "main"
      ? "put --screen main before this step"
      : screen != null && screen !== "logic"
        ? "put --screen logic before this step"
        : null;
  const advice = navigational ?? `the editor did not mount within ${seconds(budgetMs)}; the machine may be saturated, re-run`;
  return { reason: `${where}; ${advice}`, where, advice, navigational };
}

/**
 * Is a script editor expected on the screen as it is now? Yes on the logic
 * pane's `main` tab and in its fullscreen scripts view (no tab row); no on the
 * `scripts` tab or on any other screen. Waits briefly for a pane to mount, so
 * a page still hydrating does not read as "nothing expected".
 */
async function editorExpectedHere(page) {
  await page
    .waitForFunction((screens) => Object.values(screens).some((sel) => document.querySelector(sel)), SCREENS, { timeout: 5_000 })
    .catch(() => {});
  const screen = await activeScreen(page);
  // No pane mounted at all is a page still loading, and in the fullscreen
  // scripts view the editor is its own pane marker; neither is "nothing
  // expected". Only a mounted pane can say no.
  if (screen == null) return null;
  if (screen !== "logic") return false;
  return page.evaluate(() => {
    const main = document.querySelector('[role="tab"][id$="-trigger-main"]');
    return main == null || main.getAttribute("aria-selected") === "true";
  });
}

// The budgets the gate, the screen switch, the run's start, the --sd settle
// and the panel opener share. A site that names one in a message formats the
// local it waited with `seconds`, so the wait and the sentence cannot part.
// `verify`'s own mount waits, the --sd reload's, and the gate's short
// recovery look and re-settle are each their own number at their own site.
// A cold mount gets MOUNT_BUDGET_MS and a cold settle SETTLE_BUDGET_MS; a
// screen switch that lands on the editor and the run's start always use
// those two. Once the run has settled the editor anywhere, a gated step
// re-checks with WARM_BUDGET_MS for both.
const MOUNT_BUDGET_MS = 20_000;
const SETTLE_BUDGET_MS = 15_000;
const WARM_BUDGET_MS = 8_000;
// How long a screenshot waits for a settled editor to paint.
const PAINT_BUDGET_MS = 5_000;
const seconds = (ms) => `${ms / 1000}s`;

/**
 * A settled view is not yet a painted one: the identity and document length
 * can hold still while the editor has drawn nothing. A screenshot needs the
 * lines and the gutter on screen; this waits for them.
 */
async function editorPainted(page, timeout = PAINT_BUDGET_MS) {
  return page
    .waitForFunction(
      () => {
        const root = document.querySelector(".sparkdown-script-editor-root");
        if (!root) return false;
        const lines = root.querySelectorAll(".cm-line").length;
        const gutter = root.querySelector(".cm-gutters");
        return lines > 0 && gutter != null && gutter.getBoundingClientRect().height > 0;
      },
      null,
      { timeout },
    )
    .then(() => true, () => false);
}

/**
 * For a step that captures or acts on whatever is on screen (a screenshot or
 * a key press): if an editor is expected here — or nothing has mounted yet to
 * say otherwise — it must be mounted and settled first, or the step reports
 * why not and the run fails. If a mounted pane says none is expected (another
 * screen, the `scripts` tab), the step proceeds; it is not the driver's place
 * to guess what the session wanted to capture there.
 *
 * The wait is paid once per run: after anything has settled the editor (the
 * run's start, a reload, a screen switch, or an earlier step), later steps
 * re-check it with the shorter warm budgets, and after a step has given up
 * on it, later steps fail at once and point at the first. A screenshot alone
 * also waits for the editor to paint.
 */
function editorGate({ expected = editorExpectedHere, present = scriptEditorPresent, settle = settleEditor, painted = editorPainted } = {}) {
  let settledOnce = false;
  // What the first failed step found, and which step it was, so later steps
  // can fail fast and point at it. `kind` decides what a recovery look does.
  let gaveUp = null;
  const gate = async (page, what, step = null) => {
    // The question comes first: a step on a screen where no editor is
    // expected is never refused, whatever an earlier step found.
    const exp = await expected(page);
    if (exp === false) return { required: false };
    const at = gaveUp?.step != null ? `step ${gaveUp.step}` : "an earlier step";
    if (gaveUp) {
      // Fail fast, but let a recovery show: a short look that finds the
      // editor up and settled clears the latch and the step proceeds. The
      // re-settle needs three reads 600 ms apart plus their round trips, so
      // its budget leaves room for a slow machine.
      const quick = await present(page, 2_000);
      if (!quick.present) return { required: true, ok: false, reason: `the script editor is still not up (${at} reported: ${gaveUp.what}); this ${what} was skipped` };
      if (gaveUp.kind === "unsettled" && !(await settle(page, 6_000))) {
        return { required: true, ok: false, reason: `the script editor is still being replaced (${at} reported: ${gaveUp.what}); this ${what} was skipped` };
      }
      gaveUp = null;
    }
    const budget = settledOnce ? WARM_BUDGET_MS : MOUNT_BUDGET_MS;
    const here = await present(page, budget);
    if (!here.present) {
      // The presence check's navigational advice ("put --screen main before
      // this step") is the fix and is kept; its generic advice is the same
      // as the gate's and is said once.
      // "no pane had mounted" is said only while that is still so; a pane
      // that mounted during the wait is named by the presence check itself.
      const stillNoPane = exp == null && /active screen: none/.test(here.where ?? "");
      const state = (stillNoPane ? "no pane had mounted; " : "") + (here.where ?? here.reason);
      const advice = here.navigational ?? "Re-run; if it persists the machine is saturated";
      gaveUp = { kind: "absent", what: state, step };
      return { required: true, ok: false, reason: `this ${what} needs the script editor, which had not mounted within ${seconds(budget)} (${state}); ${advice}` };
    }
    const settleBudget = settledOnce ? WARM_BUDGET_MS : SETTLE_BUDGET_MS;
    if (!(await settle(page, settleBudget))) {
      gaveUp = { kind: "unsettled", what: `the view kept being replaced for ${seconds(settleBudget)}`, step };
      return { required: true, ok: false, reason: `this ${what} needs a settled script editor, and the view kept being replaced for ${seconds(settleBudget)}. Re-run; if it persists the machine is saturated` };
    }
    settledOnce = true;
    // A settled view can still be unpainted; a screenshot of it is a picture
    // of nothing, so the capture step alone also waits for the paint.
    const paintBudget = PAINT_BUDGET_MS;
    if (what === "screenshot" && !(await painted(page, paintBudget))) {
      return { required: true, ok: false, reason: `the script editor is mounted and settled but has not painted its lines and gutter within ${seconds(paintBudget)}; this screenshot would have shown an unpainted editor pane. Re-run; if it persists the machine is saturated` };
    }
    return { required: true, ok: true };
  };
  // A settle the run did elsewhere (at the start, after --sd, in a screen
  // switch that landed on the editor) tells the gate, so the once-per-run
  // rule holds across it; a settled editor is a present one, so either kind
  // of give-up is cleared.
  gate.noteSettled = () => {
    settledOnce = true;
    gaveUp = null;
  };
  // A reload throws the settled view away; nothing the gate learned about it
  // holds for the next one.
  gate.reset = () => {
    settledOnce = false;
    gaveUp = null;
  };
  return gate;
}

/**
 * Wait until the script editor is not only present but stable: the logic pane
 * mounts a CodeMirror view, and a moment later the document arrives and the
 * view can be replaced. A shortcut pressed into the first view goes nowhere,
 * and a cursor read from it is null. Stable means the same view object with
 * the same document length across three reads 600 ms apart.
 */
async function settleEditor(page, timeout = 30_000) {
  // Stability is the view's own identity and document length holding across
  // three reads 600 ms apart. It does not wait for the whole page's DOM to go
  // quiet: the game preview animates and the language server churns
  // attributes, and neither says anything about whether the editor view is
  // about to be replaced.
  const deadline = Date.now() + timeout;
  let last = null;
  let stableFor = 0;
  while (Date.now() < deadline) {
    const id = await page.evaluate(() => {
      const view = document.querySelector(".sparkdown-script-editor-root .cm-content")?.cmTile?.view;
      if (!view) return null;
      // Identity is tracked in a WeakMap on the window, not written onto the
      // view, so the editor is observed and not touched.
      const ids = (window.__driverViewIds ??= new WeakMap());
      if (!ids.has(view)) ids.set(view, Math.random().toString(36).slice(2));
      return `${ids.get(view)}:${view.state.doc.length}`;
    });
    if (id != null && id === last) {
      stableFor += 1;
      if (stableFor >= 2) return true;
    } else {
      stableFor = 0;
    }
    last = id;
    await sleep(600);
  }
  return false;
}

/**
 * For commands that always need the script editor (`verify`): bring the logic
 * screen back if a previous run left the profile elsewhere, then wait for the
 * editor as before.
 */
async function ensureScriptEditor(page) {
  await waitForApp(page);
  let switched = false;
  let first = await scriptEditorPresent(page, 10_000);
  if (!first.present) {
    // The editor lives on the logic screen's `main` tab (or its fullscreen
    // scripts view). Clicking the logic screen tab only changes the screen
    // (WorkspaceWindow.openPane sets the pane, not the panel), so a profile
    // left on the `scripts` tab needs the inner tab clicked as well. Both
    // clicks happen before the one long wait, so a `scripts` profile does not
    // pay a dead budget on the logic click. A tab already on display is not
    // clicked, so `switched` is only ever true for a click that changed
    // something; the screen is judged from its content, not its highlight.
    const clickIfNeeded = async (value, needed) => {
      const tab = page.locator(tabSelector(value)).first();
      if (!(await tab.isVisible().catch(() => false))) return false;
      if (!(await needed(tab))) return false;
      await tab.click();
      await waitForDomQuiet(page, { quiet: 600, timeout: 10_000 });
      return true;
    };
    const clickedLogic = await clickIfNeeded("logic", async () => (await activeScreen(page)) !== "logic");
    const clickedMain = await clickIfNeeded("main", async (tab) => (await tab.getAttribute("aria-selected")) !== "true");
    // One long wait for a cold mount, whether or not anything was clicked.
    first = await scriptEditorPresent(page, 45_000);
    // A click that changed the screen is reported whether or not the editor
    // then came up; the caller can say both things.
    switched = clickedLogic || clickedMain;
  }
  if (!first.present) return { present: false, switched, reason: first.reason };
  // The view can be replaced when the document arrives, on a cold load as
  // much as after a switch, so settle it on every path.
  const settled = await settleEditor(page);
  return { present: true, switched, settled };
}

function surfaceOf(name) {
  const s = SURFACES[name];
  if (!s) throw new Error(`unknown surface "${name}" (know: ${Object.keys(SURFACES).join(", ")})`);
  return s;
}

async function surfaceOpen(page, name) {
  return page.locator(surfaceOf(name).selector).first().isVisible().catch(() => false);
}

/** Open a panel on its own shortcut and wait for it to be on screen. */
async function openSurface(page, name, { settled = false } = {}) {
  const s = surfaceOf(name);
  if (await surfaceOpen(page, name)) return { surface: name, open: true, alreadyOpen: true };
  const editor = await scriptEditorPresent(page);
  if (!editor.present) return { surface: name, open: false, reason: editor.reason };
  // The view can still be replaced a moment after it appears; a shortcut sent
  // into the old view opens nothing. `ui` settles through its gate first and
  // says so; a caller outside `ui` gets the settle here.
  if (!settled && !(await settleEditor(page, SETTLE_BUDGET_MS))) {
    return { surface: name, open: false, reason: `the script editor kept being replaced for ${seconds(SETTLE_BUDGET_MS)} and never settled; the shortcut was not sent. Re-run; if it persists the machine is saturated` };
  }
  await focusEditor(page);
  const key = await pressKey(page, s.open);
  try {
    await page.locator(s.selector).first().waitFor({ state: "visible", timeout: 10_000 });
  } catch {
    return {
      surface: name,
      open: false,
      pressed: key.combo,
      reason: `${s.selector} did not appear within 10s of pressing ${key.combo} with the editor focused; another panel may hold the focus (\`--close\` it), or the run may be off the logic screen's main tab (put \`--screen logic --screen main\` first) — if the editor is up and it still fails, the binding itself changed: check customSearch.ts's keymap`,
    };
  }
  return { surface: name, open: true, pressed: key.combo };
}

/** Close a panel the way a user does: Escape from inside it. */
async function closeSurface(page, name) {
  const s = surfaceOf(name);
  if (!(await surfaceOpen(page, name))) return { surface: name, open: false, alreadyClosed: true };
  const firstField = Object.values(s.fields)[0];
  await page.locator(`${s.selector} ${firstField}`).first().click();
  await pressKey(page, "Escape");
  try {
    await page.locator(s.selector).first().waitFor({ state: "hidden", timeout: 5_000 });
  } catch {
    return { surface: name, open: true, reason: `${s.selector} still visible 5s after Escape` };
  }
  return { surface: name, open: false, closed: true };
}

/** Which panel a field name belongs to. */
function surfaceForField(field) {
  for (const [name, s] of Object.entries(SURFACES)) if (s.fields[field]) return name;
  throw new Error(
    `unknown field "${field}" (know: ${Object.values(SURFACES).flatMap((s) => Object.keys(s.fields)).join(", ")})`,
  );
}

function fieldLocator(page, field) {
  const name = surfaceForField(field);
  const s = surfaceOf(name);
  return page.locator(`${s.selector} ${s.fields[field]}`).first();
}

/**
 * What a field is showing: its rendered text (`innerText`, with the trailing
 * break a contenteditable leaves stripped). This is the browser's rendering,
 * not the panel's own reader (`readFieldText` in customSearch.ts); the two
 * agree on everything `typeInto` can type, and differ only on a non-breaking
 * space that arrives by paste or a restored query. Absent field → null.
 */
async function readField(page, field) {
  const loc = fieldLocator(page, field);
  if ((await loc.count()) === 0) return null;
  return loc.evaluate((el) => el.innerText.replace(/\n$/, ""));
}

/**
 * Put text into a panel field with real keystrokes: click it, select what is
 * there, type. A `\n` in the text is entered as the field's own line-break
 * shortcut (Control+Enter — plain Enter submits the panel), which is how a
 * user gets a multi-line find or replace. A read-back that differs from what
 * was typed is a `reason`, so it lands in `failed`.
 */
async function typeInto(page, field, text, { settled = false } = {}) {
  const name = surfaceForField(field);
  const opened = await openSurface(page, name, { settled });
  if (opened.reason) return { field, typed: false, text, readBack: null, matches: false, reason: opened.reason };
  const loc = fieldLocator(page, field);
  if ((await loc.count()) === 0) {
    return { field, typed: false, text, readBack: null, matches: false, reason: `the ${name} panel is open but has no "${field}" field (the replace field is absent while the editor is read-only)` };
  }
  await loc.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Backspace");
  const segments = text.split("\n");
  for (let i = 0; i < segments.length; i++) {
    if (i > 0) await page.keyboard.press("Control+Enter");
    if (segments[i]) await page.keyboard.type(segments[i]);
  }
  await waitForDomQuiet(page, { quiet: 300, timeout: 4_000 });
  const readBack = await readField(page, field);
  const matches = readBack === text;
  return {
    field,
    typed: true,
    text,
    readBack,
    matches,
    ...(matches ? {} : { reason: `the ${field} field reads back ${JSON.stringify(readBack)} after typing ${JSON.stringify(text)}` }),
  };
}

/** The surfaces that own a button or toggle name, open ones first. */
async function openSurfacesOwning(page, kind, name) {
  const owners = Object.entries(SURFACES).filter(([, s]) => s[kind].includes(name));
  if (owners.length === 0) {
    throw new Error(`unknown ${kind === "buttons" ? "button" : "toggle"} "${name}" (know: ${Object.values(SURFACES).flatMap((s) => s[kind]).join(", ")})`);
  }
  const open = [];
  for (const [surface] of owners) if (await surfaceOpen(page, surface)) open.push(surface);
  return { owners: owners.map(([n]) => n), open };
}

/** Click a panel button by its `name`, on whichever owning panel is open. */
async function clickSurfaceButton(page, name) {
  const { owners, open } = await openSurfacesOwning(page, "buttons", name);
  if (open.length === 0) return { button: name, clicked: false, reason: `no panel with a "${name}" button is open (${owners.join(" or ")})` };
  const surface = open[0];
  await page.locator(`${SURFACES[surface].selector} button[name=${name}]`).first().click();
  await waitForDomQuiet(page, { quiet: 300, timeout: 4_000 });
  return { button: name, surface, clicked: true };
}

/** Flip one of the find panel's checkboxes (`case`, `re`, `word`) and report its state. */
async function toggleSurfaceOption(page, name) {
  const { owners, open } = await openSurfacesOwning(page, "toggles", name);
  if (open.length === 0) return { toggle: name, toggled: false, reason: `no panel with a "${name}" toggle is open (${owners.join(" or ")})` };
  const surface = open[0];
  const box = page.locator(`${SURFACES[surface].selector} input[name=${name}]`).first();
  const before = await box.isChecked();
  // The box is visually hidden behind its label; clicking the label is what a user does.
  const label = page.locator(`${SURFACES[surface].selector} label:has(input[name=${name}])`).first();
  if ((await label.count()) > 0) await label.click();
  else await box.click({ force: true });
  await waitForDomQuiet(page, { quiet: 300, timeout: 4_000 });
  const after = await box.isChecked();
  return {
    toggle: name,
    surface,
    toggled: after !== before,
    checked: after,
    ...(after !== before ? {} : { reason: `clicking the "${name}" toggle left it ${after ? "checked" : "unchecked"}` }),
  };
}

/**
 * Bring a screen to the front by clicking its tab. `name` is a main screen
 * (logic, assets, share) or any other tab value on the page, such as the
 * `main` / `scripts` row inside the logic pane. Success is the screen's own
 * content being mounted (for a main screen) or the tab reporting selected (for
 * an inner tab); the screen tab's own highlight is not trusted, see SCREENS.
 */
async function switchScreen(page, name, { followedByMain = false } = {}) {
  const tab = page.locator(tabSelector(name)).first();
  try {
    await tab.waitFor({ state: "visible", timeout: 10_000 });
  } catch {
    const known = await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].map((t) => t.id.replace(/^.*-trigger-/, "")));
    // The logic pane's fullscreen scripts view has no tab row at all; the
    // way back is its own header button, which `ui` has no step for.
    const inScriptsView = await page.evaluate(
      () => document.querySelector(".sparkdown-script-editor-root .cm-content") != null && document.querySelector('[role="tab"][id$="-trigger-main"]') == null,
    );
    if (inScriptsView && (name === "main" || name === "scripts")) {
      return { screen: name, active: false, reason: `the logic pane is in its fullscreen scripts view (another file is open), which has no tab row; close that file with the view's own header button, then re-run` };
    }
    return { screen: name, active: false, reason: `no tab named "${name}" on the page (tabs present: ${known.join(", ")})` };
  }
  await tab.click();
  const isMain = name in SCREENS;
  try {
    if (isMain) {
      await page.waitForFunction((selector) => document.querySelector(selector) != null, SCREENS[name], { timeout: 10_000 });
    } else {
      await page.locator(`${tabSelector(name)}[aria-selected="true"]`).first().waitFor({ state: "attached", timeout: 10_000 });
    }
  } catch {
    return {
      screen: name,
      active: false,
      reason: isMain ? `the ${name} screen's content never mounted after the click` : `the ${name} tab never reported itself selected after the click`,
    };
  }
  let settled = await waitForDomQuiet(page, { quiet: 600, timeout: 10_000 });
  // A switch that lands on the script editor (the logic screen, or its `main`
  // tab) mounts a view that can be replaced when the document arrives; a step
  // that runs before that lands in a view about to go away.
  // A point check right after the click is too early: the editor mounts up
  // to ~4.6 s after the pane does. Wait for it where the tab can bring it.
  // `--screen logic` lands on an editor only when the logic pane's own tab is
  // `main` (or the pane shows its fullscreen scripts view, which has no tab
  // row); on the `scripts` tab no editor can appear, so waiting would be dead.
  const mainTabSelectedOrAbsent = await page.evaluate(() => {
    const main = document.querySelector('[role="tab"][id$="-trigger-main"]');
    return main == null || main.getAttribute("aria-selected") === "true";
  });
  const landsOnEditor = name === "main" || (name === "logic" && mainTabSelectedOrAbsent);
  if (name === "logic" && !mainTabSelectedOrAbsent) {
    // The screen switched, but the pane's own tab is `scripts`: no editor
    // came up, and the step says so rather than reading as a full recovery.
    return { screen: name, active: true, settled, editorHere: false, note: "the logic pane's own tab is scripts, so no script editor is on screen; use --screen main to reach it" };
  }
  // The cold mount budget, whatever the run has settled so far: the switch
  // mounted a fresh view, so a slow-but-fine mount must not fail the switch
  // and then pass the screenshot that follows it.
  const mountBudget = MOUNT_BUDGET_MS;
  const editorHere = landsOnEditor
    ? (await scriptEditorPresent(page, mountBudget)).present
    : await page.evaluate(() => document.querySelector(".sparkdown-script-editor-root .cm-content") != null);
  if (landsOnEditor && !editorHere) {
    // The tab is up but the editor it should carry never mounted: a switch
    // that reads as a success here would let a later screenshot lie. In the
    // documented pair `--screen logic --screen main`, the main switch that
    // follows waits for the editor and gives the verdict, so this is a note;
    // any other following step does not, so this is a failure.
    const text = `the ${name} tab is up but no script editor mounted within ${seconds(mountBudget)}`;
    if (name === "logic" && followedByMain) return { screen: name, active: true, settled, editorHere: false, note: `${text}; the --screen main that follows waits for it` };
    return { screen: name, active: true, settled, editorHere: false, reason: `${text}. Re-run; if it persists the machine is saturated` };
  }
  if (editorHere) {
    // The cold settle budget, so a switch that reports the editor settled
    // means what the gate means by it.
    const settleBudget = SETTLE_BUDGET_MS;
    const editorSettled = await settleEditor(page, settleBudget);
    settled = editorSettled && settled;
    if (!editorSettled) {
      return { screen: name, active: true, settled, editorHere: true, editorSettled: false, reason: `the ${name} tab is up but its script editor never settled within ${seconds(settleBudget)}; later steps may have hit a view that was being replaced` };
    }
    return { screen: name, active: true, settled, editorHere: true, editorSettled: true };
  }
  return { screen: name, active: true, settled };
}

/** Everything a session might want to read back, in one object. */
async function readSurfaces(page) {
  const out = { screen: null, panelTab: null, tabs: [], find: { open: false }, goto: { open: false }, cursorLine: null };
  out.tabs = await page.evaluate(() =>
    [...document.querySelectorAll('[role="tab"]')].map((t) => ({
      value: t.id.replace(/^.*-trigger-/, ""),
      label: t.innerText.split("\n")[0].trim(),
      selected: t.getAttribute("aria-selected") === "true",
    })),
  );
  out.screens = await mountedScreens(page);
  out.screen = out.screens.length === 1 ? out.screens[0] : null;
  out.panelTab = out.tabs.find((t) => t.selected && !(t.value in SCREENS))?.value ?? null;
  // Which script editor is on screen: the `main` tab's, or the logic pane's
  // fullscreen scripts view (another file open, no tab row). --sd writes
  // main.sd, which in the second case is not the file being shown.
  out.editorView = await page.evaluate(() => {
    if (!document.querySelector(".sparkdown-script-editor-root .cm-content")) return null;
    return document.querySelector('[role="tab"][id$="-trigger-main"]') ? "main" : "scripts-view";
  });

  if (await surfaceOpen(page, "find")) {
    out.find = {
      open: true,
      search: await readField(page, "search"),
      replace: await readField(page, "replace"),
      matches: await page.locator(".sparkdown-script-editor-root .cm-search .cm-search-matches-label").first().innerText().catch(() => ""),
      toggles: await page.evaluate(() =>
        Object.fromEntries([...document.querySelectorAll('.sparkdown-script-editor-root .cm-search input[type="checkbox"]')].map((c) => [c.name, c.checked])),
      ),
    };
  }
  if (await surfaceOpen(page, "goto")) {
    out.goto = { open: true, line: await readField(page, "line") };
  }
  out.cursorLine = await page.evaluate(() => {
    const view = document.querySelector(".sparkdown-script-editor-root .cm-content")?.cmTile?.view;
    return view ? view.state.doc.lineAt(view.state.selection.main.head).number : null;
  });
  return out;
}

/** Screenshot one surface: a panel, the script editor, or the whole page. */
async function shotOf(page, what, out) {
  if (!(what in SHOT_TARGETS)) throw new Error(`unknown --shot-of target "${what}" (know: ${Object.keys(SHOT_TARGETS).join(", ")})`);
  if (!out) throw new Error(`--shot-of ${what} needs an output path`);
  const target = path.resolve(out);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (SHOT_TARGETS[what] == null) {
    await page.screenshot({ path: target, fullPage: false });
  } else {
    const loc = page.locator(SHOT_TARGETS[what]).first();
    if (!(await loc.isVisible().catch(() => false))) {
      return { of: what, screenshot: null, reason: `${SHOT_TARGETS[what]} is not on screen` };
    }
    await loc.screenshot({ path: target });
  }
  return { of: what, screenshot: target };
}

/**
 * Whether the step after `index` is `--screen main`, the one switch that
 * waits for the script editor itself. A `--screen logic` whose editor never
 * mounts is a note rather than a failure only then; any other following step
 * would let the missing editor pass unreported. Pure, so the test can pin the
 * condition where it is decided.
 */
export function followedByMain(steps, index) {
  return steps[index + 1]?.screen === "main";
}

/**
 * Parse `ui` arguments into steps, refusing anything malformed before a
 * browser is launched: a flag with no value, an unknown panel, field, button,
 * toggle, screen or shot target, or an empty field name. Pure; tested in
 * ui-steps.test.mjs.
 */
export function parseUiSteps(args) {
  const steps = [];
  // Any tab value is accepted here; the editor can grow a tab, and whether one
  // exists is decided at run time, where the failure lists the tabs present.
  const screenName = /^[a-z][a-z0-9-]*$/;
  const fields = Object.values(SURFACES).flatMap((s) => Object.keys(s.fields));
  const buttons = Object.values(SURFACES).flatMap((s) => s.buttons);
  const toggles = Object.values(SURFACES).flatMap((s) => s.toggles);
  const bad = (msg) => {
    throw new Error(`ui: ${msg}`);
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const value = () => {
      const v = args[i + 1];
      if (v == null || v === "" || v.startsWith("--")) bad(`${a} needs a value`);
      i++;
      return v;
    };
    switch (a) {
      case "--sd":
        steps.push({ sd: value() });
        break;
      case "--project":
        steps.push({ project: value() });
        break;
      case "--screen": {
        const v = value();
        if (!screenName.test(v)) bad(`a screen is a tab value such as logic, assets, share, main, scripts (lowercase), got "${v}"`);
        steps.push({ screen: v });
        break;
      }
      case "--open":
      case "--close": {
        const v = value();
        if (!SURFACES[v]) bad(`unknown panel "${v}" (know: ${Object.keys(SURFACES).join(", ")})`);
        steps.push(a === "--open" ? { open: v } : { close: v });
        break;
      }
      case "--type": {
        const spec = value();
        const eq = spec.indexOf("=");
        if (eq <= 0) bad(`--type wants field=text with a field name, got "${spec}"`);
        const field = spec.slice(0, eq);
        if (!fields.includes(field)) bad(`unknown field "${field}" (know: ${fields.join(", ")})`);
        steps.push({ type: field, text: spec.slice(eq + 1).replace(/\\n/g, "\n") });
        break;
      }
      case "--press": {
        const v = value();
        try {
          normalizeKeyCombo(v);
        } catch (e) {
          bad(e.message);
        }
        steps.push({ press: v });
        break;
      }
      case "--click": {
        const v = value();
        if (!buttons.includes(v)) bad(`unknown button "${v}" (know: ${buttons.join(", ")})`);
        steps.push({ click: v });
        break;
      }
      case "--toggle": {
        const v = value();
        if (!toggles.includes(v)) bad(`unknown toggle "${v}" (know: ${toggles.join(", ")})`);
        steps.push({ toggle: v });
        break;
      }
      case "--shot":
        steps.push({ shotOf: "page", out: value() });
        break;
      case "--shot-of": {
        const what = value();
        if (!(what in SHOT_TARGETS)) bad(`unknown --shot-of target "${what}" (know: ${Object.keys(SHOT_TARGETS).join(", ")})`);
        const out = value();
        steps.push({ shotOf: what, out });
        break;
      }
      case "--probe":
        steps.push({ probe: value() });
        break;
      case "--headed":
        break;
      default:
        bad(`unknown argument ${a}`);
    }
  }
  // A `--project` seed replaces the project, main.sd included, so a script an
  // earlier `--sd` step wrote would be removed or written over by it; the
  // order that keeps the script is refused the other way round.
  const firstSd = steps.findIndex((s) => s.sd);
  const lastProject = steps.map((s) => Boolean(s.project)).lastIndexOf(true);
  if (firstSd >= 0 && lastProject > firstSd) {
    bad(`--sd (step ${firstSd + 1}) comes before --project (step ${lastProject + 1}), whose seed would remove or replace the main.sd it wrote; put every --sd after the last --project`);
  }
  return steps;
}

// The report of a step that was refused before it ran, in the shape the
// step reports when it runs with its outcome field saying nothing happened
// (`clicked`, `active`, `matches`, `screenshot`), so a reader checking that
// field on a refused step finds it. Every gate goes through this; `--project`
// and `--probe` are never gated, and a step kind added later reports its
// parsed fields until it is given a shape here.
function gatedStep(step, reason) {
  const gated = { gated: true, reason };
  if (step.sd) return { sd: step.sd, wroteChars: null, ...gated };
  if (step.screen) return { screen: step.screen, active: false, ...gated };
  if (step.open) return { surface: step.open, open: false, ...gated };
  if (step.close) return { surface: step.close, open: null, closed: false, ...gated };
  if (step.type) return { field: step.type, typed: false, text: step.text, readBack: null, matches: false, ...gated };
  if (step.press) return { press: step.press, sent: null, ...gated };
  if (step.click) return { button: step.click, clicked: false, ...gated };
  if (step.toggle) return { toggle: step.toggle, toggled: false, ...gated };
  if (step.shotOf) return { of: step.shotOf, screenshot: null, ...gated };
  return { ...step, ...gated };
}

/**
 * `ui`: run the steps in the order given, then read every surface back. Each
 * step records its own outcome under `steps`; a step that fails, or throws,
 * records a `reason` and the run continues, so the report is never lost.
 */
async function ui(args, deps = liveDeps) {
  const headless = !args.includes("--headed");
  let steps;
  try {
    steps = parseUiSteps(args);
  } catch (e) {
    deps.die(e.message);
  }
  for (const step of steps) {
    if (step.project && !fs.existsSync(path.resolve(step.project))) deps.die(`ui: --project ${step.project} does not exist`);
  }

  return deps.withEditor(
    async ({ page, url, consoleLines }) => {
      const result = { url, steps: [] };
      const requireEditor = editorGate();
      try {
        await openEditorPage(page, url);
        await deps.waitForApp(page);
      } catch (err) {
        result.failed = [`the editor page did not load (${String(err.message || err).split("\n")[0]}). Check \`status\`; the machine may be saturated.`];
        deps.log(JSON.stringify(result, null, 2));
        process.exitCode = 1;
        return result;
      }
      result.startedOn = await deps.activeScreen(page);
      // A project an earlier seed left marked is a mix of two projects, and
      // nothing seen on it is evidence. Only a `--project` step can put it
      // right, so every step but a `--project` and a `--probe` (which
      // captures nothing and is how the page is diagnosed) is refused while
      // the marker stands, and the run stops at the first refused step. A
      // `--project` step that fails closes the gate as well, whether its seed
      // stopped part-way (the marker stands) or was refused before it wrote
      // (storage holds the previous project, which this run did not ask
      // for), so no step captures a project the run does not describe.
      let gate = (await deps.interruptedSeed(page)) ? interruptedSeedError() : null;
      // The start only records what it finds. A step that needs a settled
      // editor (a screenshot, a key press, a panel) checks for one itself at
      // the moment it runs, so the failure lands on the step that would
      // otherwise have lied, and a run whose steps never needed the editor is
      // not failed for a slow mount it never depended on.
      const expectedAtStart = await deps.editorExpectedHere(page);
      if (expectedAtStart === false) {
        if (result.startedOn === "logic") result.startNote = "the run started on the logic screen's scripts tab, where there is no script editor; --screen main reaches it";
      } else {
        const mountBudget = MOUNT_BUDGET_MS;
        const here = await deps.scriptEditorPresent(page, mountBudget);
        result.editorSettled = here.present ? await deps.settleEditor(page, SETTLE_BUDGET_MS) : false;
        if (result.editorSettled) requireEditor.noteSettled();
        if (!here.present) {
          result.startNote = expectedAtStart == null
            ? `no pane had mounted ${seconds(mountBudget)} after the page loaded; each later step that needs the editor waits again and reports for itself`
            : `the script editor had not mounted ${seconds(mountBudget)} after the page loaded; each later step that needs it waits again and reports for itself`;
        }
      }

      for (const [index, step] of steps.entries()) {
        const stepNo = index + 1;
        if (gate && !step.project && !step.probe) {
          const rest = steps.length - stepNo;
          result.steps.push(gatedStep(step, `${gate}${rest > 0 ? ` The ${rest} step${rest === 1 ? "" : "s"} after this one did not run.` : ""}`));
          break;
        }
        // What a `--sd` or `--project` step has reported so far, kept
        // outside the try so a throw after the write does not lose it.
        let written = null;
        try {
          if (step.sd || step.project) {
            let out;
            if (step.project) {
              // As verify does: a `--sd` step after this one supplies
              // main.sd, so the project needs none of its own. parseUiSteps
              // refuses a `--sd` before a `--project`, whose main.sd the
              // seed would take away.
              const seeded = await deps.seedProject(page, step.project, { expectMainSd: !steps.slice(index + 1).some((s) => s.sd) });
              out = { project: step.project, seed: seeded };
              written = out;
              if (seeded.reason) {
                // Storage holding anything but the whole project is not the
                // project; the step fails, the page is not reloaded onto it,
                // and the steps after it do not run.
                out.reason = seeded.reason;
                gate = (await deps.interruptedSeed(page))
                  ? interruptedSeedError()
                  : `the --project seed in step ${stepNo} was refused (${seeded.reason}), so storage holds the project that was there before, which this run did not ask for.`;
                result.steps.push(out);
                continue;
              }
              gate = null;
            } else {
              const src = fs.readFileSync(path.resolve(step.sd), "utf8");
              out = { sd: step.sd, wroteChars: null };
              written = out;
              out.wroteChars = await deps.writeMainSd(page, src);
            }
            const wrote = step.project ? "--project seeded the project, whose main.sd" : "--sd wrote main.sd, which";
            // The reload throws the settled view away.
            requireEditor.reset();
            await reloadEditorPage(page);
            await deps.waitForApp(page);
            // No editor can appear on the `scripts` tab or another screen;
            // say so at once instead of waiting a minute for it.
            // Only a mounted pane can say no editor is coming; a page with no
            // pane yet, or the scripts view whose marker is the editor itself,
            // gets the full wait.
            const expectedAfterReload = await deps.editorExpectedHere(page);
            const editor = expectedAfterReload === false ? await deps.scriptEditorPresent(page, 1_000) : await deps.scriptEditorPresent(page, 60_000);
            if (editor.present) {
              // As verify does on its own path: let the view stop being
              // replaced, let the first compile settle, and let the editor's
              // asynchronous cursor restore land, before any step reads or
              // moves the cursor. The preview is observable only in
              // same-origin mode (window.__preview); elsewhere waiting on it
              // would burn the full timeout for nothing.
              out.editorSettled = await deps.settleEditor(page, SETTLE_BUDGET_MS);
              if (out.editorSettled) requireEditor.noteSettled();
              // window.__preview is installed by the game preview's own effect,
              // a moment after mount, and never in cross-origin mode or while
              // the preview is in screenplay mode; wait for it, then give up.
              const observable = await page
                .waitForFunction(() => window.__preview != null, null, { timeout: 15_000 })
                .then(() => true, () => false);
              if (observable) {
                // The mount wait verify uses, reload retry included; a game
                // that never mounted has no program to wait for, and the
                // blank pane fails the step, as it fails verify.
                const mount = await deps.waitForGame(page, { ensure: deps.ensureScriptEditor });
                if (mount.reloaded) {
                  out.neededReload = true;
                  requireEditor.reset();
                  out.editorSettled = await deps.settleEditor(page, SETTLE_BUDGET_MS);
                  if (out.editorSettled) requireEditor.noteSettled();
                }
                // The recovery brings the editor back by clicking the logic
                // screen tab and the main tab when they are not on display;
                // a run whose steps are the navigation has to know.
                if (mount.switched) out.switchedToLogic = true;
                if (mount.mounted) {
                  const program = await deps.waitForProgram(page);
                  out.programLoaded = program.loaded;
                  if (program.loaded === false) out.programNote = programWarning(program);
                  out.previewSettled = (await deps.waitForPreviewSettle(page)).settled;
                } else {
                  out.programLoaded = null;
                  out.previewSettled = null;
                  out.reason = `the game never mounted (#game absent) within ${seconds(GAME_MOUNT_BUDGET_MS)} of the reload and again after a recovery reload, so the Game Preview is blank and nothing captured after this step is evidence of it; \`down\`, then \`up\`, then re-run${mount.error ? ` (on the reload retry: ${mount.error})` : ""}`;
                }
              } else {
                out.previewSettled = null;
                out.previewNote = "the game preview is not observable (cross-origin mode, or the preview is showing the screenplay), so the first compile was not waited for";
              }
              if (!out.editorSettled) {
                const settleReason = `the script editor never settled within ${seconds(SETTLE_BUDGET_MS)} after the reload; later steps may have hit a view that was being replaced`;
                out.reason = out.reason ? `${out.reason}; also ${settleReason}` : settleReason;
              }
              // The step wrote main.sd; if the pane is showing another file
              // in its fullscreen scripts view, the editor on screen is not it.
              out.editorView = await page.evaluate(() => (document.querySelector('[role="tab"][id$="-trigger-main"]') ? "main" : "scripts-view"));
              if (out.editorView === "scripts-view") {
                const viewReason = `the logic pane is showing its fullscreen scripts view (another file is open); ${wrote} is not the file on screen. Close that file in the editor and re-run`;
                out.reason = out.reason ? `${out.reason}; also ${viewReason}` : viewReason;
              }
            } else {
              out.reason = editor.reason;
            }
            await deps.waitForDomQuiet(page, { quiet: 1500, timeout: 30_000 });
            result.steps.push(out);
          } else if (step.screen) {
            // In the documented recovery pair `--screen logic --screen main`,
            // the logic switch has no business failing for an editor the
            // main switch is about to wait for.
            const switched = await switchScreen(page, step.screen, { followedByMain: followedByMain(steps, index) });
            if (switched.editorSettled) requireEditor.noteSettled();
            result.steps.push(switched);
          } else if (step.open) {
            const ready = await requireEditor(page, "panel", stepNo);
            if (ready.ok === false) {
              result.steps.push(gatedStep(step, ready.reason));
              continue;
            }
            result.steps.push(await openSurface(page, step.open, { settled: ready.ok === true }));
          } else if (step.close) {
            result.steps.push(await closeSurface(page, step.close));
          } else if (step.type) {
            const ready = await requireEditor(page, "field", stepNo);
            if (ready.ok === false) {
              result.steps.push(gatedStep(step, ready.reason));
              continue;
            }
            result.steps.push(await typeInto(page, step.type, step.text, { settled: ready.ok === true }));
          } else if (step.press) {
            const ready = await requireEditor(page, "key press", stepNo);
            if (ready.ok === false) {
              result.steps.push(gatedStep(step, ready.reason));
              continue;
            }
            const n = await pressKey(page, step.press);
            await deps.waitForDomQuiet(page, { quiet: 300, timeout: 4_000 });
            result.steps.push({ press: step.press, sent: n.combo, rewritten: n.rewritten });
          } else if (step.click) {
            result.steps.push(await clickSurfaceButton(page, step.click));
          } else if (step.toggle) {
            result.steps.push(await toggleSurfaceOption(page, step.toggle));
          } else if (step.shotOf) {
            const ready = await requireEditor(page, "screenshot", stepNo);
            if (ready.ok === false) {
              result.steps.push(gatedStep(step, ready.reason));
              continue;
            }
            result.steps.push(await shotOf(page, step.shotOf, step.out));
          } else if (step.probe) {
            // Never gated: a probe captures no pixels, and it is the one step
            // that can diagnose a page whose editor will not mount.
            const code = fs.readFileSync(path.resolve(step.probe), "utf8");
            result.steps.push({
              probe: step.probe,
              result: await page.evaluate(
                // eslint-disable-next-line no-new-func
                (src) => new Function(`return (async () => { ${src} })()`)(),
                code,
              ),
            });
          }
        } catch (err) {
          const message = String(err.message || err).split("\n")[0];
          result.steps.push({ ...(written ?? step), reason: `step threw: ${message}` });
          // A `--sd` or `--project` step that threw may have written to
          // storage without the page being reloaded onto it (a reload that
          // timed out), so the page is not known to show what storage
          // holds, and the steps after it do not run.
          if (step.sd || step.project) {
            gate = `the ${step.project ? "--project" : "--sd"} step ${stepNo} threw (${message}), so the page is not known to show what storage holds.`;
          }
        }
      }

      // Which script the run drove, whether or not one of its steps wrote it.
      result.script = await deps
        .loadedScript(page, steps.some((s) => s.sd))
        .catch((err) => ({ file: "main.sd", read: false, reason: String(err.message || err).split("\n")[0] }));

      try {
        result.ui = await deps.readSurfaces(page);
      } catch (err) {
        result.ui = null;
        result.readError = String(err.message || err).split("\n")[0];
      }
      result.failed = result.steps.filter((s) => s.reason).map((s) => s.reason);
      if (result.readError) result.failed.push(`read-back failed: ${result.readError}`);
      const captured = partitionConsole(consoleLines);
      result.consoleErrors = captured.errors;
      result.consoleNoise = captured.noise;
      deps.log(JSON.stringify(result, null, 2));
      // A step that could not do what it was asked is a failed run, whatever
      // else succeeded: `ui --sd x.sd --shot out.png && open out.png` must not
      // open a screenshot of the wrong document under a green shell.
      process.exitCode = result.failed.length > 0 ? 1 : 0;
      return result;
    },
    { headless },
  );
}

// ---------------------------------------------------------------- redgreen ---

// Paths in --files and the test command's cwd are the directory the session
// is standing in, which must be this driver's own worktree root: runRedGreen
// refuses a subdirectory (git resolves rev:path from the root), and this
// refuses another checkout, so the worktree's driver never edits main's tree.
async function redgreenCli(args) {
  let report;
  try {
    const opts = parseRedGreenArgs(args);
    const cwd = process.cwd();
    if (!sameDir(cwd, REPO_ROOT)) {
      const top = (() => {
        try {
          return gitTopLevel(cwd);
        } catch {
          return null;
        }
      })();
      die(
        top && !sameDir(top, REPO_ROOT)
          ? `redgreen: run it from this driver's own worktree root (${REPO_ROOT}), not from ${cwd}, which is ${sameDir(top, cwd) ? "the root of" : "inside"} a different checkout${sameDir(top, cwd) ? "" : ` (${path.resolve(top)})`}`
          : `redgreen: run from the repository root (${REPO_ROOT}), not from ${cwd}; --files paths and the test command resolve from there`,
      );
    }
    report = runRedGreen({
      repoRoot: cwd,
      test: opts.test,
      files: opts.files,
      base: opts.base,
      log: (line) => console.error(line),
    });
  } catch (e) {
    die(e.message);
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

// Helpers for a session that has to drive the editor beyond what `ui` and
// `verify` cover. Import them from a script INSIDE the repo tree (Node resolves
// playwright from the importing script's directory), e.g.
//   import { withEditor, writeMainSd, waitForEditor } from "../../.claude/skills/drive-web-editor/driver.mjs";
export {
  withEditor,
  openEditorPage,
  reloadEditorPage,
  EDITOR_NAVIGATION,
  writeMainSd,
  loadedScript,
  installHealth,
  KNOWN_CONSOLE_NOISE,
  partitionConsole,
  verify,
  ui,
  seed,
  liveDeps,
  seedProject,
  clearProject,
  beginSeed,
  seedInterrupted,
  interruptedSeed,
  interruptedSeedError,
  kindClashes,
  writeProjectBatch,
  pruneProject,
  readProjectFile,
  walkProjectDir,
  collectProject,
  SEED_BATCH_BYTES,
  SEED_LIMITS,
  SEED_MARKER,
  waitForProgram,
  programWarning,
  gameMountedWithin,
  waitForGame,
  gatedStep,
  waitForEditor,
  waitForApp,
  ensureScriptEditor,
  settleEditor,
  scriptEditorPresent,
  editorExpectedHere,
  editorGate,
  activeScreen,
  waitForDomQuiet,
  focusEditor,
  pressKey,
  openSurface,
  closeSurface,
  typeInto,
  readField,
  readSurfaces,
  clickSurfaceButton,
  toggleSurfaceOption,
  switchScreen,
  shotOf,
  SURFACES,
  SCREENS,
  hereOrPrevious,
  pidAlive,
  recordStands,
  processStartedMs,
  resolveChromiumExecutablePath,
  liveProbe,
  READY_WAIT_MS,
  LAUNCH_SLACK_MS,
  START_GRAIN_MS,
};

// ------------------------------------------------------------------ utils ---

// The value after `name`, or undefined when the flag is not given. A flag
// that is given with no value, an empty one, or another flag in its place
// throws, as parseUiSteps refuses the same: `--project "$RB"` with `RB`
// unset must not become a run without a project.
function flag(args, name) {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  if (v == null || v === "" || v.startsWith("--")) throw new Error(`${name} needs a value`);
  return v;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// What `verify`, `ui` and `seed` reach the browser through. Each command takes
// this as its `deps` parameter, so seed-project.test.mjs can run the commands
// in-process against a stub page and storage and pin that each one seeds,
// stops on `seed.reason`, and reloads only after a seed that landed whole.
const liveDeps = {
  withEditor,
  log: console.log,
  die,
  seedProject,
  clearProject,
  interruptedSeed,
  writeMainSd,
  loadedScript,
  waitForApp,
  ensureScriptEditor,
  waitForGame,
  waitForProgram,
  waitForPreviewSettle,
  waitForDomQuiet,
  previewSummary,
  editorPainted,
  clickLine,
  documentLines,
  routeLabel,
  activeScreen,
  editorExpectedHere,
  scriptEditorPresent,
  settleEditor,
  readSurfaces,
};

// Only dispatch when run as a command. `classifyScrub` is a pure function with
// its own test beside this file, and importing it must not boot a browser.
const runAsCli =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

const [cmd, ...rest] = runAsCli ? process.argv.slice(2) : ["__imported__"];
switch (cmd) {
  case "__imported__":
    break;
  case "preflight":
    await preflight();
    break;
  case "up":
    await up(rest);
    break;
  case "down":
    await down();
    break;
  case "status":
    await status();
    break;
  case "verify":
    await verify(rest);
    break;
  case "ui":
    await ui(rest);
    break;
  case "seed":
    await seed(rest);
    break;
  case "redgreen":
    await redgreenCli(rest);
    break;
  default:
    log(
      [
        "usage: node .claude/skills/drive-web-editor/driver.mjs <command>",
        "",
        "  preflight             check disk headroom, playwright, gh auth BEFORE doing work",
        "  up [--cross-origin]   boot both dev servers, wait for ready, record the URL",
        "  status                is it up? prints the editor URL",
        "  down                  kill the server tree",
        "  verify [options]      drive the game preview and print a JSON report",
        "  ui [steps]            drive the editor's own panels and screens; print a JSON report",
        "  seed --project <p>    load a project directory or exported zip into OPFS /local, then reload",
        "  seed --clear          empty OPFS /local (dot entries stay), then reload; with --project, clear first",
        "  redgreen [options]    prove a regression test fails on the base and passes on the fix",
        "",
        "verify options:",
        "  --project <dir-or-zip> replace OPFS /local with this project's files (before --sd), then reload",
        "  --sd <file.sd>   load this script into OPFS /local/main.sd, then reload",
        "  --line <N>       scrub the preview to source line N (STOPPED state only)",
        "  --shot <out.png> screenshot the editor page",
        "  --probe <file.js> body of an async fn evaluated in the editor page; result -> JSON",
        "  --headed         run a visible browser instead of headless",
        "",
        "ui steps (run in the order given, then every surface is read back):",
        "  --project <dir-or-zip>  replace OPFS /local with this project's files, then reload",
        "  --sd <file.sd>          load this script into OPFS /local/main.sd, then reload",
        "  --screen <name>         click a tab: logic | assets | share, or one inside a pane: main | scripts | files | urls | game | screenplay",
        "  --open <panel>          open a panel on its shortcut: find (Ctrl+F) | goto (Ctrl+G)",
        "  --close <panel>         close it with Escape",
        "  --type <field>=<text>   real keystrokes into search | replace | line; \\n = Ctrl+Enter",
        "  --press <combo>         a key combo, e.g. Control+Shift+G (a shifted letter is uppercased)",
        "  --click <button>        a panel button: next prev select replace replaceAll close submit",
        "  --toggle <option>       flip a find-panel checkbox: case | re | word",
        "  --shot <out.png>        screenshot the page",
        "  --shot-of <what> <png>  screenshot one surface: find | goto | editor | page",
        "  --probe <file.js>       body of an async fn evaluated in the page; result -> JSON",
        "  --headed                run a visible browser instead of headless",
        "",
        "redgreen options:",
        "  --test <command>        the test invocation, run twice from the repo root",
        "  --files <a> [<b>...]    the changed source files the test exercises",
        "  --base <rev>            where the pre-fix content comes from (default HEAD;",
        "                          pass origin/main once the fix is committed)",
      ].join("\n"),
    );
}

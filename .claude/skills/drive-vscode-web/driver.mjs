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
const STATE_FILE = path.join(SKILL_DIR, ".state.json");
const SERVER_ENTRY = path.join(REPO_ROOT, "node_modules", "@vscode", "test-web", "out", "server", "index.js");
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

// ------------------------------------------------------------- pure parts ---

// The served build ships its stylesheet as workbench.web.main.internal.css and
// the server's page template links workbench.web.main.css, so without a copy
// under the second name the workbench renders unstyled: no explorer rows, no
// visible editor, every Playwright visibility wait times out. Copies the file
// into place under every unpacked build in the data directory and reports
// which builds it touched; a build that already has the file is left alone.
// `io` is a parameter so driver.test.mjs can pin it on a scratch directory.
export function aliasWorkbenchCss(dataDir, io = fs) {
  const aliased = [];
  const present = [];
  if (!io.existsSync(dataDir)) return { aliased, present };
  for (const entry of io.readdirSync(dataDir)) {
    if (!entry.startsWith("vscode-web-")) continue;
    const dir = path.join(dataDir, entry, "out", "vs", "workbench");
    const internal = path.join(dir, "workbench.web.main.internal.css");
    const linked = path.join(dir, "workbench.web.main.css");
    if (!io.existsSync(internal)) continue;
    if (io.existsSync(linked)) {
      present.push(dir);
      continue;
    }
    io.copyFileSync(internal, linked);
    aliased.push(dir);
  }
  return { aliased, present };
}

// Where things live under the data directory. The server deletes the whole
// directory it is given as `--testRunnerDataDir` before it downloads a build
// it does not have yet, so that directory holds nothing but builds; the
// served projects and the server logs sit beside it, where a new VS Code
// release cannot take them.
export function dataLayout(root) {
  return {
    builds: path.join(root, "builds"),
    projects: path.join(root, "projects"),
    logs: path.join(root, "logs"),
  };
}

// A stable port from the worktree path, so each worktree serves on its own
// port and a second `up` in the same worktree finds its own server rather
// than another worktree's. The range sits clear of the web editor driver's.
export function portBase(root) {
  let h = 0;
  for (const ch of root) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 34000 + (h % 1000);
}

// Monaco renders every space in a rendered line as a non-breaking space, so a
// line's text never contains the plain space the source has. Both sides of a
// text match go through this.
export function normalizeMonacoText(text) {
  return (text || "").replace(/ /g, " ");
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

// Flag parsing shared by `up` and `verify`. `spec` maps a flag to "value" or
// "flag"; an unknown flag or a value flag with nothing after it is refused
// before anything runs, so a misspelt option fails at once.
export function parseFlags(args, spec) {
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const kind = spec[a];
    if (!kind) return { error: `unknown option ${a}` };
    if (kind === "flag") {
      opts[a] = true;
      continue;
    }
    const v = args[i + 1];
    if (v == null || v.startsWith("--")) return { error: `${a} needs a value` };
    opts[a] = v;
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

function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "127.0.0.1");
  });
}

async function pickPort() {
  const base = portBase(REPO_ROOT);
  for (let p = base; p < base + 200; p++) {
    if (await portFree(p)) return p;
  }
  die("could not find a free port");
}

// ----------------------------------------------------------------- server ---

const UP_FLAGS = { "--sd": "value", "--project": "value", "--data": "value", "--quality": "value" };

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
  if (stateUnreadable()) {
    die(`state file unreadable: ${STATE_FILE}; \`down\` removes it, and any server it recorded keeps running`);
  }
  const existing = readState();
  if (existing?.url && (await recordStands(existing, probe)) && (await isUp(existing.url))) {
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
    return;
  }
  if (await recordStands(existing, probe)) {
    log(`server pid ${existing.pid} is still starting → ${existing.url}`);
    if (await waitReady(existing.url, existing.builds, () => pidAlive(existing.pid))) return;
    log(`server pid ${existing.pid} has exited; launching`);
  }
  removeState();

  if (!fs.existsSync(SERVER_ENTRY)) {
    die(`${SERVER_ENTRY} is missing; run PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install at the repo root`);
  }
  if (!fs.existsSync(path.join(EXT_DIR, "out", "extension.js"))) {
    die(`vscode-sparkdown/out/extension.js is missing; build the extension first: cd vscode-sparkdown && npm run build`);
  }

  const data = path.resolve(opts["--data"] ?? DEFAULT_DATA_DIR);
  const { builds, projects, logs } = dataLayout(data);
  const quality = opts["--quality"] ?? "stable";
  const port = await pickPort();
  const url = `http://localhost:${port}`;
  let project;
  let ownProject = false;
  if (opts["--sd"]) {
    project = path.join(projects, String(port));
    fs.mkdirSync(project, { recursive: true });
    writeProjectSd(project, opts["--sd"]);
    ownProject = true;
  } else if (opts["--project"]) {
    project = path.resolve(opts["--project"]);
    if (!fs.existsSync(project)) die(`up: --project ${project} does not exist`);
  } else {
    die("up: give --sd <file.sd> (a one-file project) or --project <folder>");
  }
  fs.mkdirSync(builds, { recursive: true });
  fs.mkdirSync(logs, { recursive: true });

  // The server's own output goes to a log beside the builds; a detached
  // child on Windows does not always flush into an inherited handle, so the
  // readiness signal is the HTTP poll below, never the log.
  const logPath = path.join(logs, `serve-${port}.log`);
  const logFd = fs.openSync(logPath, "a");
  const child = spawn(
    process.execPath,
    [
      SERVER_ENTRY,
      "--browser", "none",
      "--quality", quality,
      "--esm",
      "--port", String(port),
      "--testRunnerDataDir", builds,
      "--extensionDevelopmentPath", EXT_DIR,
      project,
    ],
    { cwd: EXT_DIR, stdio: ["ignore", logFd, logFd], windowsHide: true, detached: true },
  );
  child.unref();
  fs.closeSync(logFd);

  writeState({ url, pid: child.pid, port, data, builds, project, ownProject, quality, log: logPath, startedAt: Date.now() });
  log(`serving ${project} pid ${child.pid} → ${url}`);
  await waitReady(url, builds);
}

function writeProjectSd(project, sdPath) {
  const src = fs.readFileSync(path.resolve(sdPath), "utf8");
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
  "--settle": "value",
  "--headed": "flag",
};

// Opens the file from the explorer, waits for the language server's
// diagnostics to stop changing, reads them, optionally asks for the hover on
// a word, screenshots, and prints a JSON report. Exits 1 when any step in
// `failed` could not do what it was asked.
async function verify(args) {
  const { opts, error } = parseFlags(args, VERIFY_FLAGS);
  if (error) die(`verify: ${error}`);
  const s = readState();
  if (!s?.url) die("no server URL; run `node .claude/skills/drive-vscode-web/driver.mjs up --sd <file.sd>` first");
  if (!(await isUp(s.url))) die(`${s.url} does not answer; \`down\` then \`up\``);
  const { aliased } = aliasWorkbenchCss(s.builds);
  for (const dir of aliased) log(`stylesheet alias written in ${dir}`);

  const file = opts["--file"] ?? "main.sd";
  const settleBudgetS = Number(opts["--settle"] ?? 60);
  const report = { url: s.url, project: s.project, file, failed: [] };
  const fail = (msg) => report.failed.push(msg);

  await withWorkbench(s.url, { headless: !opts["--headed"] }, async ({ page, consoleLines }) => {
    await page.waitForSelector(".monaco-workbench", { timeout: 120_000 });
    const row = page.locator(`.explorer-folders-view .monaco-list-row:has-text("${file}")`).first();
    try {
      await row.waitFor({ timeout: 60_000 });
      await row.click();
      await page.waitForSelector(".view-lines", { timeout: 60_000 });
      report.opened = true;
    } catch (err) {
      report.opened = false;
      fail(`could not open ${file} from the explorer: ${String(err.message).split("\n")[0]}`);
    }

    if (report.opened) {
      // The status bar's problem counter and the editor's squiggles are the
      // language server's output; read them once a second until they hold.
      const readings = [];
      const started = Date.now();
      while (Date.now() - started < settleBudgetS * 1000) {
        readings.push(JSON.stringify(await readDiagnostics(page)));
        if (isSettled(readings)) break;
        await sleep(1000);
      }
      report.settled = isSettled(readings);
      report.settledAfterS = Math.round((Date.now() - started) / 1000);
      report.diagnostics = JSON.parse(readings[readings.length - 1]);
    }

    if (opts["--hover"] && report.opened) {
      const word = opts["--hover"];
      const rect = await wordRect(page, word, opts["--line"]);
      if (!rect) {
        fail(`"${word}" is not on a rendered line${opts["--line"] ? ` containing "${opts["--line"]}"` : ""}`);
      } else {
        // Put the cursor on the word and ask for the hover by keyboard: mouse
        // movement never opens the widget headlessly, the Show Hover command
        // (Ctrl+K Ctrl+I) does.
        await page.mouse.click(rect.x, rect.y);
        await sleep(400);
        await page.keyboard.press("Control+k");
        await page.keyboard.press("Control+i");
        let hover = { present: false };
        for (let i = 0; i < 20 && !hover.present; i++) {
          await sleep(500);
          hover = await readHover(page);
        }
        report.hover = { word, ...hover };
        if (!hover.present) fail(`no hover opened on "${word}" within 10 s of Ctrl+K Ctrl+I`);
        if (hover.present && opts["--hover-shot"]) {
          await page.locator(".monaco-hover:visible").first().screenshot({ path: opts["--hover-shot"] });
          report.hoverScreenshot = path.resolve(opts["--hover-shot"]);
        }
      }
    }

    if (opts["--probe"]) {
      const body = fs.readFileSync(opts["--probe"], "utf8");
      try {
        report.probe = await page.evaluate(new Function(`return (async () => { ${body} })()`));
      } catch (err) {
        report.probe = { error: String(err.message).split("\n")[0] };
        fail(`probe threw: ${report.probe.error}`);
      }
    }

    if (opts["--shot"]) {
      await page.screenshot({ path: opts["--shot"] });
      report.screenshot = path.resolve(opts["--shot"]);
    }
    report.consoleErrors = consoleLines.filter((l) => l.startsWith("[error]") || l.startsWith("[pageerror]")).slice(0, 20);
  });

  log(JSON.stringify(report, null, 2));
  if (report.failed.length) process.exitCode = 1;
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

// The status bar's problems item (its id carries `status.problems`) and the
// squiggle overlays in the open editor.
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

// Viewport centre of `word` on a rendered line, restricted to lines whose
// text contains `lineText` when given. Rendered text is normalized because
// Monaco draws spaces as non-breaking spaces.
function wordRect(page, word, lineText) {
  return page.evaluate(
    ({ word, lineText }) => {
      const norm = (s) => (s || "").replace(/ /g, " ");
      for (const line of document.querySelectorAll(".view-line")) {
        if (lineText && !norm(line.textContent).includes(lineText)) continue;
        for (const span of line.querySelectorAll("span > span")) {
          if (!norm(span.textContent).includes(word)) continue;
          const r = span.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }
      }
      return null;
    },
    { word, lineText },
  );
}

// A `.monaco-hover` element sits in the DOM hidden and empty between hovers,
// so presence means one that has size and content.
function readHover(page) {
  return page.evaluate(() => {
    const shown = [...document.querySelectorAll(".monaco-hover")].filter((h) => {
      const r = h.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    });
    const hover = shown.find((h) => h.querySelector("img") || h.innerText.trim());
    if (!hover) return { present: false };
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
        "",
        "verify options:",
        "  --file <name>        the file to open from the explorer (default main.sd)",
        "  --hover <word>       click this word and open the hover with Ctrl+K Ctrl+I",
        "  --line <text>        only look for --hover's word on a line containing this text",
        "  --shot <out.png>     screenshot the page",
        "  --hover-shot <png>   screenshot the hover widget alone",
        "  --probe <file.js>    body of an async fn evaluated in the page; result -> JSON",
        "  --settle <seconds>   how long to wait for diagnostics to stop changing (default 60)",
        "  --headed             run a visible browser instead of headless",
      ].join("\n"),
    );
}

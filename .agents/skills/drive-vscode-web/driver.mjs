#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnDetached } from "../../../scripts/detached-launch.mjs";
import { systemTemp, useWorktreeTemp } from "../drive-web-editor/worktree-temp.mjs";
import { desktop } from "./desktop.mjs";
import { installEditorProtocol, watchNotification } from "./editor-protocol.mjs";
import { debugWorkbench } from "./web-debug.mjs";
import {
  consoleLine,
  partitionConsole,
  pidAlive,
  processStartedMs,
  recordStands,
  removeState as removeStateFile,
  removeStoppedState,
  stopExitHandler,
  treeStopped,
  windowsProcessTable,
  resolveChromiumExecutablePath,
} from "../drive-web-editor/driver.mjs";

const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SKILL_DIR, "..", "..", "..");
const EXT_DIR = path.join(REPO_ROOT, "vscode-sparkdown");
const PACKAGES_DIR = path.join(REPO_ROOT, "packages");
const CANONICAL_STATE_FILE = path.join(SKILL_DIR, ".state.json");
const LEGACY_STATE_FILE = path.join(REPO_ROOT, ".claude", "skills", "drive-vscode-web", ".state.json");
const STATE_FILE = !fs.existsSync(CANONICAL_STATE_FILE) && fs.existsSync(LEGACY_STATE_FILE) ? LEGACY_STATE_FILE : CANONICAL_STATE_FILE;
const STATE_REL = path.relative(REPO_ROOT, CANONICAL_STATE_FILE);
export const STAMP_NAME = ".drive-vscode-web-build.json";
const SERVER_ENTRY = (() => {
  try {
    return path.join(path.dirname(createRequire(path.join(EXT_DIR, "package.json")).resolve("@vscode/test-web/package.json")), "out", "server", "index.js");
  } catch {
    return path.join(REPO_ROOT, "node_modules", "@vscode", "test-web", "out", "server", "index.js");
  }
})();
const DEFAULT_DATA_DIR = path.join(systemTemp(), "impower-vscode-test-web");
const READY_WAIT_MS = 10 * 60_000;

const log = (...a) => console.log(...a);
const die = (msg) => {
  console.error("ERROR: " + msg);
  process.exit(1);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const firstLine = (err) => String(err?.message ?? err).split("\n")[0];
const iso = (ms) => new Date(ms).toISOString();
const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

// workaround(@vscode/test-web): the served build ships workbench.web.main.internal.css while its page links workbench.web.main.css (seen with @vscode/test-web 0.0.67)
export function aliasWorkbenchCss(buildsDir, io = fs) {
  const aliased = [];
  const present = [];
  if (!io.existsSync(buildsDir)) return { aliased, present };
  for (const entry of io.readdirSync(buildsDir)) {
    if (!entry.startsWith("vscode-web-")) continue;
    const dir = path.join(buildsDir, entry, "out", "vs", "workbench");
    const internal = path.join(dir, "workbench.web.main.internal.css");
    const linked = path.join(dir, "workbench.web.main.css");
    if (!io.existsSync(internal)) continue;
    if (io.existsSync(linked) && io.statSync(linked).size === io.statSync(internal).size) {
      present.push(dir);
      continue;
    }
    const tmp = linked + ".tmp";
    io.copyFileSync(internal, tmp);
    io.renameSync(tmp, linked);
    aliased.push(dir);
  }
  return { aliased, present };
}

export function dataLayout(root) {
  return {
    builds: path.join(root, "builds"),
    projects: path.join(root, "projects"),
    logs: path.join(root, "logs"),
    locks: path.join(root, "locks"),
  };
}

export function downloadLockPath(layout, quality) {
  return path.join(layout.locks, `download-${quality}.lock`);
}

const lockIo = {
  mkdirp: (dir) => fs.mkdirSync(dir, { recursive: true }),
  writeNew: (file, text) => fs.writeFileSync(file, text, { flag: "wx" }),
  readLock: (file) => {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return null;
    }
  },
  removeLock: (file) => {
    try {
      fs.rmSync(file, { force: true });
    } catch {
    }
  },
};

// workaround(@vscode/test-web): the server deletes the whole testRunnerDataDir before a download, so concurrent launches race; an exclusive lock serializes them (seen with @vscode/test-web 0.0.67)
export async function takeDownloadLock(lockPath, record, io, stands) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      io.mkdirp(path.dirname(lockPath));
      io.writeNew(lockPath, JSON.stringify(record, null, 2));
      return { held: true };
    } catch (err) {
      if (err?.code !== "EEXIST") throw err;
    }
    const other = io.readLock(lockPath);
    if (other && (await stands(other))) return { held: false, other };
    io.removeLock(lockPath);
  }
  return { held: false, other: io.readLock(lockPath) };
}

export const QUALITIES = ["stable", "insiders"];

export const WORKBENCH_CONSOLE_NOISE = [
  { name: "package.nls.json 404", match: /^\[error\] Failed to load resource: the server responded with a status of 404 \(Not Found\) \(https?:\/\/[^/\s)]+\/static\/devextensions\/package\.nls\.json(?:[?#][^\s)]*)?\)$/ },
  { name: "spark.d.ts 404", match: /^\[error\] Failed to load resource: the server responded with a status of 404 \(Not Found\) \(https?:\/\/[^/\s)]+\/static\/devextensions\/out\/data\/spark\.d\.ts(?:[?#][^\s)]*)?\)$/ },
  { name: "file watcher", match: /^\[error\] .*?\[File Watcher \('FileSystemObserver'\)\] Error: Unavailable \(FileSystemError\): Error: No file system handle registered \(\\\) \(file:\/\/\/\)(?: \(https?:\/\/[^/\s)]+\/static\/build\/out\/vs\/workbench\/workbench\.web\.main\.internal\.js\))?$/ },
  { name: "Not Found page error", match: /^\[pageerror\] Not Found$/ },
];

const inside = (dir, p) => {
  const rel = path.relative(dir, p);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

export function unpackedCommit(buildsDir) {
  if (!fs.existsSync(buildsDir)) return null;
  for (const entry of fs.readdirSync(buildsDir)) {
    const m = /^vscode-web-[a-z]+-([0-9a-f]{40})$/.exec(entry);
    if (m && fs.existsSync(path.join(buildsDir, entry, "version"))) return m[1];
  }
  return null;
}

export const BUILD_ENTRY_FILES = ["out/vs/workbench/workbench.web.main.internal.js", "out/vs/workbench/workbench.web.main.internal.css"];

export function missingBuildEntries(buildsDir, commit, io = fs) {
  const entry = io.existsSync(buildsDir) ? io.readdirSync(buildsDir).find((e) => /^vscode-web-[a-z]+-[0-9a-f]{40}$/.test(e) && e.endsWith(`-${commit}`)) : undefined;
  const dir = path.join(buildsDir, entry ?? `vscode-web-${commit}`);
  return { dir, missing: BUILD_ENTRY_FILES.filter((f) => !io.existsSync(path.join(dir, ...f.split("/")))) };
}

export async function sharedBuildUsers(records, buildsDir, stands) {
  const users = [];
  for (const r of records) {
    if (r?.pid != null && r.builds && samePath(r.builds, buildsDir) && (await stands(r))) users.push(r);
  }
  return users;
}

export function launchPlan({ data, port, quality = "stable", sd, project, commit, extDir, entry }) {
  if (!QUALITIES.includes(quality)) return { error: `--quality must be ${QUALITIES.join(" or ")}, not "${quality}"` };
  if (sd && project) return { error: "give --sd or --project, not both" };
  if (!sd && !project) return { error: "give --sd <file.sd> (a one-file project) or --project <folder>" };
  const layout = dataLayout(data);
  const builds = path.join(layout.builds, quality);
  const served = sd ? path.join(layout.projects, String(port)) : path.resolve(project);
  if (inside(layout.builds, served)) return { error: `--project ${served} is inside ${layout.builds}, which the server deletes before a download; serve it from anywhere else` };
  const logPath = path.join(layout.logs, `serve-${port}.log`);
  const cwd = extDir;
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
  return { builds, project: served, ownProject: Boolean(sd), logPath, cwd, args };
}

export function portBase(root) {
  let h = 0;
  for (const ch of root) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 34000 + (h % 1000);
}
export const PORT_SCAN = 200;

export const SOURCE_SKIP = ["node_modules", "dist", "out", "__snapshots__", "tests", "__tests__"];

export function sourceFiles(roots, io = fs) {
  const files = [];
  const stack = [];
  for (const root of roots) {
    try {
      const st = io.statSync(root);
      if (st.isFile()) files.push({ path: root, mtimeMs: st.mtimeMs });
      else if (st.isDirectory()) stack.push(root);
    } catch {
    }
  }
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = io.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SOURCE_SKIP.includes(e.name)) stack.push(p);
        continue;
      }
      if (!e.isFile() || /\.test\./.test(e.name)) continue;
      try {
        files.push({ path: p, mtimeMs: io.statSync(p).mtimeMs });
      } catch {
      }
    }
  }
  return files;
}

export const REBUILD_STEPS = ["npm run build:sparkdown-language-server", "node scripts/esbuild.ts"];

export function rebuildCommand(groups) {
  const wanted = new Set(groups.flatMap((g) => g.steps));
  if (wanted.has("npm run build")) return "cd vscode-sparkdown && npm run build";
  return `cd vscode-sparkdown && ${REBUILD_STEPS.filter((s) => wanted.has(s)).join(" && ")}`;
}

export function buildRule(extDir, packagesDir, io = fs, surface = "editor") {
  const out = path.join(extDir, "out");
  const list = (dir) => (io.existsSync(dir) ? io.readdirSync(dir) : []);
  const present = (p) => io.existsSync(p);
  const pkgSrc = list(packagesDir).map((p) => path.join(packagesDir, p, "src")).filter(present);
  if (!pkgSrc.length) throw new Error(`${packagesDir} holds no package with a src directory, so the sources that feed the extension cannot be checked; the driver expects the repository's packages/ beside vscode-sparkdown/`);
  const pkgLang = list(packagesDir).map((p) => path.join(packagesDir, p, "language")).filter(present);
  const shared = [...pkgSrc, ...pkgLang];
  const [lsBuild, self] = REBUILD_STEPS;
  const editorBuildInput = surface === "editor" ? [path.join(extDir, "scripts", "esbuild.ts")] : [];
  const groups = [
    { artifact: path.join(out, "extension.js"), sources: [path.join(extDir, "src"), path.join(extDir, "language"), ...editorBuildInput, ...shared], steps: [self] },
    { artifact: path.join(out, "workers", "sparkdown-language-server.js"), sources: shared, steps: [lsBuild, self] },
  ];
  for (const f of list(path.join(extDir, "data"))) {
    if (io.statSync(path.join(extDir, "data", f)).isFile()) groups.push({ artifact: path.join(out, "data", f), sources: [path.join(extDir, "data", f)], steps: [self], copied: true });
  }
  if (surface === "desktop") {
    const buildInputs = list(packagesDir).flatMap(p => ["esbuild.js", "package.json", "tsconfig.json"].map(file => path.join(packagesDir, p, file))).filter(present);
    groups.push({ artifact: path.join(out, "workers", "sparkdown-screenplay-pdf.js"), sources: shared, steps: ["npm run build"] });
    for (const name of ["game", "screenplay", "screen", "inspector"]) {
      groups.push({ artifact: path.join(out, "webviews", `${name}-webview.js`), sources: [path.join(extDir, "webviews", `${name}-webview`), ...shared], steps: ["npm run build"] });
    }
    for (const group of groups.filter(g => !g.copied)) {
      group.sources.push(path.join(extDir, "scripts"), path.join(extDir, "package.json"), path.join(extDir, "tsconfig.json"), ...buildInputs);
    }
  }
  return groups;
}

export const NEWER_BY_MS = 1;
export function buildFreshness(groups, filesOf, io = fs) {
  const missing = [];
  const stale = [];
  const artifacts = [];
  for (const g of groups) {
    let st;
    try {
      st = io.statSync(g.artifact);
    } catch {
      missing.push(g.artifact);
      continue;
    }
    artifacts.push({ path: g.artifact, size: st.size, mtimeMs: st.mtimeMs });
    const newer = g.sources.flatMap((root) => filesOf(root)).filter((f) => f.mtimeMs - st.mtimeMs > NEWER_BY_MS);
    if (newer.length) {
      const newest = newer.reduce((a, f) => (f.mtimeMs > a.mtimeMs ? f : a));
      stale.push({ ...g, source: newest.path, sourceMs: newest.mtimeMs, artifactMs: st.mtimeMs, newer });
    }
  }
  return { missing, stale, artifacts };
}

export function stampGap(stamp, artifacts, sources, offenders, builtSince = () => false) {
  if (!stamp?.artifacts || !stamp.sources) return { kind: "artifacts" };
  const stamped = new Set(Object.keys(stamp.sources));
  const current = new Set(sources);
  const removed = [...stamped].filter((s) => !current.has(s) && !builtSince(s));
  if (removed.length) return { kind: "removed", files: removed };
  const added = [...current].filter((s) => !stamped.has(s) && !builtSince(s));
  if (added.length) return { kind: "added", files: added };
  const sameSet = stamped.size === current.size && [...stamped].every((s) => current.has(s));
  const keys = Object.keys(artifacts);
  if (!sameSet || keys.length !== Object.keys(stamp.artifacts).length) return { kind: "artifacts" };
  for (const k of keys) {
    const s = stamp.artifacts[k];
    if (!s || s.size !== artifacts[k].size || s.mtimeMs !== artifacts[k].mtimeMs) return { kind: "artifacts" };
  }
  const changed = offenders.filter((o) => stamp.sources[o.rel] !== o.sha).map((o) => o.rel);
  if (changed.length) return { kind: "changed", files: changed };
  return null;
}

export function nearestDirMtime(file, top, io = fs) {
  let dir = path.dirname(file);
  for (;;) {
    try {
      return io.statSync(dir).mtimeMs;
    } catch {
    }
    const up = path.dirname(dir);
    if (samePath(dir, top) || up === dir) return null;
    dir = up;
  }
}

export function locateWord(lines, word, lineText) {
  if (!word) return null;
  const wordChar = (char) => char != null && /\p{ID_Continue}/u.test(char);
  const first = String.fromCodePoint(word.codePointAt(0));
  const last = Array.from(word).at(-1);
  for (let index = 0; index < lines.length; index++) {
    const text = lines[index];
    if (lineText && !text.includes(lineText)) continue;
    for (let from = 0; from <= text.length - word.length;) {
      const start = text.indexOf(word, from);
      if (start < 0) break;
      const end = start + word.length;
      const left = start === 0 || !wordChar(Array.from(text.slice(0, start)).at(-1)) || !wordChar(first);
      const right = end === text.length || !wordChar(String.fromCodePoint(text.codePointAt(end))) || !wordChar(last);
      if (left && right) return { index, start, end };
      from = start + 1;
    }
  }
  return null;
}
export function editorOpened(title, file) {
  return title === file;
}

export function hoverImageFailure(img) {
  if (!img) return null;
  if (!img.hasSrc) return "the hover's image has no src";
  if (!img.complete) return "the hover's image had not finished loading within 10 s";
  if (!(img.naturalWidth > 0 && img.naturalHeight > 0))
    return `the hover's image failed to load: natural size ${img.naturalWidth} x ${img.naturalHeight}; the src the web workbench could not fetch is in the report's img.srcHead, and this is the extension's bug rather than the driver's`;
  if (!(img.width > 0 && img.height > 0)) return "the hover’s image has no visible size";
  return null;
}

export const DEFAULT_SETTLE_S = 60;

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
      if (!/^\d+(\.\d+)?$/.test(v)) return { error: `${a} needs a number of seconds, not ${JSON.stringify(v)}` };
      opts[a] = Number(v);
    } else {
      opts[a] = v;
    }
    i++;
  }
  return { opts };
}

export function renderedCaretOnWord({ word }, doc = document) {
  const visible = (element) => {
    const style = doc.defaultView?.getComputedStyle(element);
    return !style || (style.visibility === "visible" && style.display !== "none" && style.opacity !== "0");
  };
  const carets = [...doc.querySelectorAll(".monaco-editor .cursors-layer .cursor")].filter(visible);
  for (const caret of carets) {
    const cursor = caret.getBoundingClientRect();
    if (!(cursor.width > 0 && cursor.height > 0)) continue;
    const editor = caret.closest(".monaco-editor");
    for (const line of editor?.querySelectorAll(".view-line") ?? []) {
      const row = line.getBoundingClientRect();
      const y = cursor.top + cursor.height / 2;
      if (y < row.top || y >= row.bottom) continue;
      const rendered = (line.textContent ?? "").replace(/\u00a0/g, " ");
      const target = word.replace(/\u00a0/g, " ");
      const walker = doc.createTreeWalker(line, 4);
      const nodes = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
      for (let start = rendered.indexOf(target); start >= 0; start = rendered.indexOf(target, start + 1)) {
        const range = doc.createRange();
        let offset = 0;
        const end = start + target.length;
        for (const node of nodes) {
          const next = offset + node.length;
          if (offset <= start && start < next) range.setStart(node, start - offset);
          if (offset < end && end <= next) {
            range.setEnd(node, end - offset);
            break;
          }
          offset = next;
        }
        const wordRect = range.getBoundingClientRect();
        if (wordRect.width > 0 && wordRect.height > 0 &&
          cursor.left >= wordRect.left - 2 && cursor.left < wordRect.right - 1) return true;
      }
    }
  }
  return false;
}
export function hoverOnPage(_, doc = document) {
  for (const h of doc.querySelectorAll("[data-drive-hover]")) h.removeAttribute("data-drive-hover");
  const shown = [...doc.querySelectorAll(".monaco-hover")].filter((h) => {
    const r = h.getBoundingClientRect();
    const style = doc.defaultView?.getComputedStyle(h);
    return r.width > 1 && r.height > 1 &&
      (!style || (style.display !== "none" && style.visibility === "visible" && style.opacity !== "0"));
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
          width: r?.width ?? 0,
          height: r?.height ?? 0,
          rendered: r ? `${Math.round(r.width)} x ${Math.round(r.height)}` : null,
          natural: `${img.naturalWidth} x ${img.naturalHeight}`,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          complete: img.complete,
        }
      : null,
  };
}

function readJson(file, io = fs) {
  if (!io.existsSync(file)) return null;
  try {
    return JSON.parse(io.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(file, record, io = fs) {
  const tmp = file + ".tmp";
  io.writeFileSync(tmp, JSON.stringify(record, null, 2));
  io.renameSync(tmp, file);
}

const readState = () => readJson(STATE_FILE);

function stateUnreadable() {
  return readState() === null && fs.existsSync(STATE_FILE);
}

const writeState = (record) => writeJson(CANONICAL_STATE_FILE, record);

export function removeState(file = STATE_FILE, io = fs) {
  removeStateFile(file, io);
}

const mtimeOf = (file) => {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return null;
  }
};

export function recordFile(record) {
  return record.stateFilePath ?? (record.worktree ? path.join(record.worktree, STATE_REL) : STATE_FILE);
}

const stands = (record) =>
  recordStands(record, {
    pidAlive,
    startedMs: processStartedMs,
    recordWrittenMs: () => mtimeOf(recordFile(record)),
  });

function otherWorktreeRecords() {
  let roots;
  try {
    const out = execFileSync("git", ["worktree", "list", "--porcelain"], { cwd: REPO_ROOT, encoding: "utf8", windowsHide: true });
    roots = out.split(/\r?\n/).filter((l) => l.startsWith("worktree ")).map((l) => l.slice("worktree ".length));
  } catch {
    return [];
  }
  const records = [];
  for (const root of roots) {
    if (samePath(root, REPO_ROOT)) continue;
    const files = [path.join(root, STATE_REL), path.join(root, ".claude", "skills", "drive-vscode-web", ".state.json")];
    const seen = new Set();
    for (const file of files) {
      if (!fs.existsSync(file)) continue;
      const real = fs.realpathSync(file);
      if (seen.has(real)) continue;
      seen.add(real);
      const r = readJson(file);
      if (r) records.push({ ...r, worktree: root, stateFilePath: file });
    }
  }
  return records;
}

async function isUp(url) {
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(3000) });
    return res.status === 200;
  } catch {
    return false;
  }
}

function listens(port, host) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", (err) => resolve(err.code === "EADDRNOTAVAIL" || err.code === "EAFNOSUPPORT" ? "unavailable" : "busy"));
    srv.once("listening", () => srv.close(() => resolve("free")));
    srv.listen(port, host);
  });
}

export const LOOPBACKS = ["127.0.0.1", "::1"];
export async function portFree(port, probes = { listens, isUp }) {
  for (const host of LOOPBACKS) {
    if ((await probes.listens(port, host)) === "busy") return false;
  }
  return !(await probes.isUp(`http://localhost:${port}`));
}

async function pickPort() {
  const base = portBase(REPO_ROOT);
  for (let p = base; p < base + PORT_SCAN; p++) {
    if (await portFree(p)) return p;
  }
  die("could not find a free port");
}

const isFile = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};
const isDir = (p) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};

function writeProjectSd(project, sdPath) {
  const src = fs.readFileSync(path.resolve(sdPath), "utf8");
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(path.join(project, "main.sd"), src);
  return src.length;
}

export function spawnServer(plan, io = { spawnDetached, openSync: fs.openSync, closeSync: fs.closeSync }) {
  const logFd = io.openSync(plan.logPath, "a");
  const child = io.spawnDetached(process.execPath, plan.args, { cwd: plan.cwd, stdio: ["ignore", logFd, logFd], linger: true });
  child.unref();
  io.closeSync(logFd);
  return child.pid;
}

export const READY_POLL_MS = 2000;
export async function waitReady(url, builds, keep, { downloading = true } = {}, io = { isUp, alias: aliasWorkbenchCss, now: Date.now, sleep, log, die }) {
  io.log(downloading ? "downloading the VS Code build (about 55 MB). Waiting..." : "Waiting for the server...");
  const deadline = io.now() + READY_WAIT_MS;
  while (io.now() < deadline) {
    if (keep && !(await keep())) return false;
    if (await io.isUp(url)) {
      const { aliased } = io.alias(builds);
      for (const dir of aliased) io.log(`stylesheet alias written in ${dir}`);
      io.log(`READY ${url}`);
      return true;
    }
    await io.sleep(READY_POLL_MS);
  }
  io.die(`timed out after ${READY_WAIT_MS / 60_000} min waiting for ${url}; read the server log the state file names, then \`down\``);
}

export const VIEWPORT = { width: 1400, height: 900 };

async function launchWorkbenchBrowser({ headless }) {
  const { chromium } = await import("playwright");
  const executablePath = resolveChromiumExecutablePath(chromium);
  return chromium.launch({ headless, ...(executablePath ? { executablePath } : {}) });
}

export async function withWorkbench(url, { headless = true, launch = launchWorkbenchBrowser, editorProtocol = false } = {}, fn) {
  const browser = await launch({ headless });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    const consoleLines = [];
    page.on("console", (m) => consoleLines.push(consoleLine(m)));
    page.on("pageerror", (e) => consoleLines.push(`[pageerror] ${e.message}`));
    const protocol = editorProtocol ? await installEditorProtocol(page, url) : null;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
    return await fn({ page, consoleLines, protocol });
  } finally {
    await browser.close();
  }
}

export const liveDeps = {
  log,
  die,
  sleep,
  now: () => Date.now(),
  repoRoot: REPO_ROOT,
  extDir: EXT_DIR,
  packagesDir: PACKAGES_DIR,
  io: fs,
  serverEntry: SERVER_ENTRY,
  defaultDataDir: DEFAULT_DATA_DIR,
  stateFile: STATE_FILE,
  readState,
  writeState,
  removeState,
  stateUnreadable,
  recordStands: stands,
  isUp,
  pidAlive,
  isFile,
  isDir,
  exists: (p) => fs.existsSync(p),
  readFile: (p) => fs.readFileSync(p, "utf8"),
  mkdirp: (p) => fs.mkdirSync(p, { recursive: true }),
  checkBuild: surface => checkBuild({ ...liveDeps, surface }),
  pickPort,
  otherWorktreeRecords,
  unpackedCommit,
  missingBuildEntries: (buildsDir, commit) => missingBuildEntries(buildsDir, commit),
  takeDownloadLock: (lockPath, record) => takeDownloadLock(lockPath, record, lockIo, stands),
  releaseDownloadLock: (lockPath) => lockIo.removeLock(lockPath),
  writeProjectSd,
  spawnServer,
  waitReady,
  aliasWorkbenchCss,
  withWorkbench,
};

export function checkBuild(deps = liveDeps) {
  const { repoRoot, extDir, packagesDir } = deps;
  const io = deps.io ?? fs;
  const stampFile = path.join(extDir, "out", deps.surface === "desktop" ? ".drive-vscode-desktop-build.json" : STAMP_NAME);
  const rel = (p) => path.relative(repoRoot, p).replaceAll("\\", "/");
  const sha1 = (p) => createHash("sha1").update(io.readFileSync(p)).digest("hex");
  const cache = new Map();
  const filesOf = (root) => {
    if (!cache.has(root)) cache.set(root, sourceFiles([root], io));
    return cache.get(root);
  };
  let groups;
  try {
    groups = buildRule(extDir, packagesDir, io, deps.surface);
  } catch (err) {
    deps.die(firstLine(err));
  }
  const { missing, stale, artifacts } = buildFreshness(groups, filesOf, io);
  if (missing.length) deps.die(`${rel(missing[0])} is missing; build the extension first: ${rebuildCommand(groups.filter((g) => missing.includes(g.artifact)))}`);
  const current = Object.fromEntries(artifacts.map((a) => [rel(a.path), { size: a.size, mtimeMs: a.mtimeMs }]));
  const roots = [...new Set(groups.flatMap((g) => g.sources))];
  const sources = [...new Set(roots.flatMap((root) => filesOf(root).map((f) => rel(f.path))))];
  const offenders = new Map();
  for (const g of stale) for (const f of g.newer) if (!offenders.has(f.path)) offenders.set(f.path, { rel: rel(f.path), sha: sha1(f.path) });
  const refuseStale = () => {
    const g = stale[0];
    const more = stale.length > 1 ? `, and ${stale.length - 1} more artifact${stale.length > 2 ? "s are" : " is"} older than a source` : "";
    deps.die(`${rel(g.artifact)} (built ${iso(g.artifactMs)}) is older than ${rel(g.source)} (${iso(g.sourceMs)})${more}; rebuild so the served workbench runs the change: ${rebuildCommand(stale)}`);
  };
  const feeding = (file) => {
    const fed = groups.filter((g) => g.sources.some((root) => inside(root, path.join(repoRoot, file))));
    return fed.length ? fed : groups;
  };
  const builtSince = (file) => {
    const dirMs = nearestDirMtime(path.join(repoRoot, file), repoRoot, io);
    if (dirMs == null) return false;
    return feeding(file).every((g) => current[rel(g.artifact)].mtimeMs - dirMs > NEWER_BY_MS);
  };
  const gap = stampGap(readJson(stampFile, io), current, sources, [...offenders.values()], builtSince);
  if (gap?.kind === "artifacts") {
    if (stale.length) refuseStale();
    const stamped = {};
    for (const root of roots) for (const f of filesOf(root)) stamped[rel(f.path)] = sha1(f.path);
    writeJson(stampFile, { artifacts: current, sources: stamped }, io);
  } else if (gap?.kind === "removed" || gap?.kind === "added") {
    const file = gap.files[0];
    const more = gap.files.length > 1 ? ` and ${gap.files.length - 1} more` : "";
    deps.die(`${file}${more} ${gap.kind === "removed" ? "was removed" : "was added"} after the build was stamped, so the served workbench would run a build made from other sources; rebuild: ${rebuildCommand(feeding(file))}`);
  } else if (gap) {
    refuseStale();
  }
  const copied = new Set(groups.filter((g) => g.copied).map((g) => g.artifact));
  const oldest = artifacts.filter((a) => !copied.has(a.path)).reduce((a, b) => (b.mtimeMs < a.mtimeMs ? b : a));
  return { artifacts: artifacts.length, oldest: rel(oldest.path), builtAt: iso(oldest.mtimeMs) };
}

const UP_FLAGS = { "--sd": "value", "--project": "value", "--data": "value", "--quality": "value", "--fresh": "flag" };

export async function up(args, deps = liveDeps) {
  const { opts, error } = parseFlags(args, UP_FLAGS);
  if (error) deps.die(`up: ${error}`);
  if (opts["--sd"] && opts["--project"]) deps.die("up: give --sd or --project, not both");
  if (opts["--sd"] && !deps.isFile(path.resolve(opts["--sd"]))) deps.die(`up: --sd ${path.resolve(opts["--sd"])} is not a file`);
  if (opts["--project"] && !deps.isDir(path.resolve(opts["--project"]))) deps.die(`up: --project ${path.resolve(opts["--project"])} is not a directory`);
  if (opts["--quality"] && !QUALITIES.includes(opts["--quality"])) deps.die(`up: --quality must be ${QUALITIES.join(" or ")}, not "${opts["--quality"]}"`);
  if (deps.stateUnreadable()) {
    deps.die(`state file unreadable: ${deps.stateFile}; \`down\` removes it, and any server it recorded keeps running`);
  }
  const existing = deps.readState();
  if (existing?.url && (await deps.recordStands(existing))) {
    let ready = await deps.isUp(existing.url);
    if (!ready) {
      deps.log(`server pid ${existing.pid} is still starting → ${existing.url}`);
      ready = await deps.waitReady(existing.url, existing.builds, () => deps.pidAlive(existing.pid), { downloading: !existing.commit });
      if (!ready) deps.log(`server pid ${existing.pid} has exited; launching`);
    }
    if (ready) return serveInto(existing, opts, deps);
  }
  deps.removeState();
  await launch(opts, deps);
}

async function serveInto(existing, opts, deps) {
  const commit = existing.builds ? (existing.commit ?? deps.unpackedCommit(existing.builds)) : null;
  if (commit) await refuseEmptiedBuild(existing.builds, commit, `\`down\`, then `, deps);
  if (opts["--fresh"]) deps.die(`already serving ${existing.project} → ${existing.url}; \`down\` first to download a new build`);
  if (opts["--quality"] && opts["--quality"] !== existing.quality) {
    deps.die(`already serving ${existing.quality} → ${existing.url}; \`down\` first to serve ${opts["--quality"]}`);
  }
  if (opts["--data"] && !(existing.data && samePath(opts["--data"], existing.data))) {
    deps.die(`already serving from ${existing.data ?? "a data directory the record does not name"} → ${existing.url}; \`down\` first to use ${path.resolve(opts["--data"])}`);
  }
  if (opts["--project"] && !samePath(opts["--project"], existing.project)) {
    deps.die(`already serving ${existing.project} → ${existing.url}; \`down\` first to serve another folder`);
  }
  if (opts["--sd"]) {
    if (!existing.ownProject) deps.die(`already serving ${existing.project}, which --sd does not write into; \`down\` first`);
    const n = deps.writeProjectSd(existing.project, opts["--sd"]);
    deps.log(`already up → ${existing.url}; wrote ${n} chars to ${path.join(existing.project, "main.sd")}`);
    return;
  }
  deps.log(`already up → ${existing.url} (serving ${existing.project})`);
}

async function refuseEmptiedBuild(builds, commit, first, deps) {
  const { dir, missing } = deps.missingBuildEntries(builds, commit);
  if (!missing.length) return;
  const users = await sharedBuildUsers(deps.otherWorktreeRecords(), builds, deps.recordStands);
  const recovery = users.length
    ? `${users.map((u) => `${u.worktree} (pid ${u.pid})`).join(" and ")} serves from that directory, so ${first}run \`up\` with a private \`--data <dir>\`, which downloads its own copy`
    : `${first}run \`up --fresh\` to download it again`;
  deps.die(`up: the build ${dir} has a version file but is missing ${missing.join(" and ")}, so the workbench would not load; ${recovery}`);
}

async function launch(opts, deps) {
  if (!deps.exists(deps.serverEntry)) {
    deps.die(`${deps.serverEntry} is missing; run PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install at the repo root`);
  }
  deps.checkBuild();
  const data = path.resolve(opts["--data"] ?? deps.defaultDataDir);
  const quality = opts["--quality"] ?? "stable";
  const port = await deps.pickPort();
  const url = `http://localhost:${port}`;
  const base = { data, port, quality, sd: opts["--sd"], project: opts["--project"], extDir: deps.extDir, entry: deps.serverEntry };
  const first = launchPlan(base);
  if (first.error) deps.die(`up: ${first.error}`);
  if (opts["--fresh"]) {
    const users = await sharedBuildUsers(deps.otherWorktreeRecords(), first.builds, deps.recordStands);
    if (users.length) deps.die(`up --fresh would delete ${first.builds}, which ${users.map((u) => `${u.worktree} (pid ${u.pid}, ${u.url})`).join(" and ")} serves from; \`down\` there first, or run \`up\` without --fresh to serve the build already unpacked`);
  }
  const commit = opts["--fresh"] ? null : deps.unpackedCommit(first.builds);
  if (commit) await refuseEmptiedBuild(first.builds, commit, "", deps);
  const plan = launchPlan({ ...base, commit });
  if (plan.error) deps.die(`up: ${plan.error}`);
  const lockPath = downloadLockPath(dataLayout(data), quality);
  let holdsLock = false;
  if (!commit) {
    const lock = await deps.takeDownloadLock(lockPath, { worktree: deps.repoRoot, pid: process.pid, url, quality, startedAt: deps.now() });
    if (!lock.held) {
      const other = lock.other;
      deps.die(
        other
          ? `${other.worktree ?? "another worktree"} (pid ${other.pid ?? "unknown"}) is downloading the VS Code build into ${plan.builds}; ` +
              "two downloads at once delete each other's build, since the server empties that directory before it unpacks. " +
              "Wait for that `up` to print READY, then run this again"
          : `the download lock ${lockPath} was taken both times this launch tried for it and its record could not be read back, so who is downloading the VS Code build into ${plan.builds} cannot be said; ` +
              "two downloads at once delete each other's build, since the server empties that directory before it unpacks. " +
              "Run this again: a lock that was only changing hands is free by then, and one that is still there names its holder",
      );
    }
    holdsLock = true;
  }
  const release = () => {
    if (holdsLock) deps.releaseDownloadLock(lockPath);
    holdsLock = false;
  };
  try {
    if (plan.ownProject) deps.writeProjectSd(plan.project, opts["--sd"]);
    deps.mkdirp(plan.builds);
    deps.mkdirp(path.dirname(plan.logPath));
    const pid = deps.spawnServer(plan);
    deps.writeState({ url, pid, port, data, builds: plan.builds, project: plan.project, ownProject: plan.ownProject, quality, commit, log: plan.logPath, startedAt: deps.now() });
    deps.log(`serving ${plan.project} pid ${pid} → ${url}${commit ? ` (build ${commit.slice(0, 10)}, already unpacked)` : ""}`);
    if (!(await deps.waitReady(url, plan.builds, () => deps.pidAlive(pid), { downloading: !commit }))) {
      release();
      deps.die(`the server (pid ${pid}) exited before ${url} answered; read ${plan.logPath}, then \`down\` and \`up\` again`);
    }
  } finally {
    release();
  }
}

export async function status(deps = liveDeps) {
  if (deps.stateUnreadable()) {
    deps.log(`unknown (state file unreadable: ${deps.stateFile}; \`down\` removes it)`);
    return 1;
  }
  const s = deps.readState();
  if (!s) {
    deps.log("down (no state file)");
    return 1;
  }
  const alive = await deps.isUp(s.url);
  deps.log(`${alive ? "UP" : "DOWN"}  url=${s.url}  pid=${s.pid}  project=${s.project}  log=${s.log}`);
  return alive ? 0 : 1;
}

async function down() {
  const s = readState();
  if (s?.pid == null) {
    if (fs.existsSync(STATE_FILE)) {
      if (!removeStoppedState(STATE_FILE, { remove: removeState, log, context: "No pid could be identified; no process was stopped" })) return;
      log(`removed ${STATE_FILE}, which recorded no pid to stop`);
    } else {
      log("nothing to stop");
    }
    return;
  }
  if (!(await stands(s))) {
    if (!removeStoppedState(STATE_FILE, { remove: removeState, log, context: "The record no longer identifies its original server; no process was stopped" })) return;
    log(`removed ${STATE_FILE}: pid ${s.pid} is no longer the server it recorded, so nothing was stopped`);
    return;
  }
  let tree = null;
  if (process.platform === "win32") {
    try { tree = await windowsProcessTable(); }
    catch (error) { log(`the process tree could not be listed before the stop (${error.message}); a nonzero taskkill exit will not be checked`); }
  }
  const killer =
    process.platform === "win32"
      ? spawn("taskkill", ["/pid", String(s.pid), "/T", "/F"], { stdio: "inherit", windowsHide: true })
      : spawn("kill", ["-TERM", String(s.pid)], { stdio: "inherit", windowsHide: true });
  const failed = (why) => {
    log(`could not stop pid ${s.pid} (${why}); the record is kept`);
    process.exitCode = 1;
  };
  killer.on("error", (err) => failed(err.message));
  killer.on("exit", stopExitHandler(STATE_FILE, s.pid, { remove: removeState, log, verifyStopped: tree ? () => treeStopped(tree, s.pid) : undefined }));
}

const VERIFY_FLAGS = {
  "--file": "value",
  "--hover": "value",
  "--line": "value",
  "--shot": "value",
  "--hover-shot": "value",
  "--hover-image": "flag",
  "--probe": "value",
  "--settle": "number",
  "--headed": "flag",
  "--debug": "flag",
  "--expression": "value",
  "--result": "value",
  "--debug-shot": "value",
};

export async function verify(args, deps = liveDeps) {
  const { opts, error } = parseFlags(args, VERIFY_FLAGS);
  if (error) deps.die(`verify: ${error}`);
  for (const f of ["--hover-shot", "--hover-image", "--line"]) if (opts[f] && !opts["--hover"]) deps.die(`verify: ${f} needs --hover`);
  for (const f of ["--expression", "--result", "--debug-shot"]) if (opts[f] && !opts["--debug"]) deps.die(`verify: ${f} needs --debug`);
  const settleBudgetS = opts["--settle"] ?? DEFAULT_SETTLE_S;
  if (settleBudgetS <= 0 || Math.ceil(settleBudgetS * 1000) > 2_147_483_647) {
    deps.die("verify: --settle must be a positive deadline within the timer limit");
  }
  const s = deps.readState();
  if (!s?.url) deps.die("no server URL; run `node .agents/skills/drive-vscode-web/driver.mjs up --sd <file.sd>` first");
  if (!(await deps.recordStands(s))) deps.die(`${deps.stateFile} records pid ${s.pid}, which is not the server it started; \`down\` then \`up\``);
  if (!(await deps.isUp(s.url))) deps.die(`${s.url} does not answer; \`down\` then \`up\``);
  const build = deps.checkBuild(opts["--debug"] ? "desktop" : "editor");

  const file = opts["--file"] ?? "main.sd";
  const report = { url: s.url, project: s.project, file, build, failed: [], settled: false, extension: { activated: false, answered: false } };
  const fail = (msg) => report.failed.push(msg);

  try {
    const { aliased } = deps.aliasWorkbenchCss(s.builds);
    for (const dir of aliased) deps.log(`stylesheet alias written in ${dir}`);
    await deps.withWorkbench(s.url, { headless: !opts["--headed"], editorProtocol: true }, async ({ page, consoleLines, protocol }) => {
      try {
        await page.waitForSelector(".monaco-workbench", { timeout: 120_000 });
        const loaded = watchNotification(protocol, "editor/didLoad", (params) => mountedFile(params?.textDocument?.uri, file));
        let document;
        try {
          await openFile(page, file, report, fail);
          if (report.opened) {
            const started = deps.now();
            const signal = AbortSignal.timeout(Math.ceil(settleBudgetS * 1000));
            const active = (await loaded.wait(signal)).textDocument;
            const snapshot = await readEditor(protocol, active, signal);
            document = snapshot.textDocument;
            report.document = { uri: document.uri, version: document.version, selection: snapshot.selection };
            report.extension.activated = true;
            report.diagnostics = await readCurrentDiagnostics(protocol, document, signal);
            report.extension.answered = true;
            report.settled = true;
            report.settledAfterS = Math.round((deps.now() - started) / 1000);
          }
        } finally {
          loaded.dispose();
        }

        if (opts["--hover"] && document) await hoverOn(page, opts, report, fail, deps, protocol, document, settleBudgetS);
        if (opts["--debug"] && report.opened) {
          report.debug = await debugWorkbench(page, { expression: opts["--expression"] ?? "1 + 1", result: opts["--result"] ?? "2", screenshot: opts["--debug-shot"] });
          report.failed.push(...report.debug.failed);
        }

        if (opts["--probe"]) {
          try {
            const body = deps.readFile(opts["--probe"]);
            report.probe = await page.evaluate(new Function(`return (async () => { ${body} })()`));
          } catch (err) {
            report.probe = { error: firstLine(err) };
            fail(`probe threw: ${report.probe.error}`);
          }
        }
      } catch (err) {
        fail(`verify threw: ${firstLine(err)}`);
      }

      report.protocol = protocol?.trace ?? [];
      if (opts["--shot"]) {
        try {
          await page.screenshot({ path: opts["--shot"] });
          report.screenshot = path.resolve(opts["--shot"]);
        } catch (err) {
          fail(`screenshot failed: ${firstLine(err)}`);
        }
      }
      const captured = partitionConsole(consoleLines, WORKBENCH_CONSOLE_NOISE, 20);
      report.consoleErrors = captured.errors;
      report.consoleNoise = captured.noise;
      if (captured.errors.length) fail(`unclassified console errors: ${captured.errors.join("; ")}`);
    });
  } catch (err) {
    fail(`verify threw: ${firstLine(err)}`);
  }

  deps.log(JSON.stringify(report, null, 2));
  return { report, exitCode: report.failed.length ? 1 : 0 };
}

export const TOP_ROW = '.explorer-folders-view .monaco-list-row[aria-level="1"]';
async function openFile(page, file, report, fail) {
  const exact = new RegExp(`^${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
  const row = page.locator(TOP_ROW).filter({ has: page.locator(".label-name", { hasText: exact }) }).first();
  try {
    await row.waitFor({ timeout: 60_000 });
    await row.click();
    await page.waitForSelector(".view-lines", { timeout: 60_000 });
  } catch (err) {
    report.opened = false;
    fail(`could not open ${file} from the explorer: ${firstLine(err)}; \`status\` names the served folder, so check it exists and holds ${file} at its top level, since a file of that name in a subfolder is never clicked, then \`down\` and \`up\` again`);
    return;
  }
  const name = (await page.locator(".tabs-container .tab.active .label-name").first().textContent({ timeout: 10_000 }).catch(() => null))?.trim() ?? null;
  const suffixes = page.locator(".tabs-container .tab.active .label-suffix");
  if (name != null && name !== file) await suffixes.first().waitFor({ timeout: 5_000 }).catch(() => {});
  const suffix = name == null ? "" : (await suffixes.allTextContents().catch(() => [])).join("").trim();
  const title = name == null ? null : name + suffix;
  report.editor = title;
  report.opened = editorOpened(title, file);
  if (!report.opened) fail(`the editor that opened is titled ${JSON.stringify(title)}, not ${file}`);
}

function mountedFile(uri, file) {
  try {
    const url = new URL(uri);
    return url.protocol === "vscode-test-web:" && url.host === "mount" &&
      decodeURIComponent(url.pathname) === "/" + file && !url.search && !url.hash;
  } catch {
    return false;
  }
}

async function readEditor(protocol, document, signal) {
  const { uri, version } = document;
  if (!Number.isSafeInteger(version) || version < 0) throw new Error("editor protocol did not report a valid document version");
  const result = await protocol.request("editor/read", { textDocument: { uri } }, { version, signal });
  const read = result?.textDocument;
  if (read?.uri !== uri || read.version !== version || typeof read.text !== "string" ||
    !result.selection?.start || !result.selection?.end) {
    throw new Error(`editor protocol did not return the intended document ${uri} at version ${version}`);
  }
  return result;
}

export async function readCurrentDiagnostics(protocol, document, signal) {
  const { uri, version } = document;
  const exact = (result) => result?.uri === uri && result.version === version && Array.isArray(result.diagnostics);
  const settled = watchNotification(protocol, "textDocument/didSettleDiagnostics", exact);
  try {
    const result = await protocol.request("textDocument/diagnosticsSettled", { textDocument: { uri }, version }, { signal, version });
    if (!exact(result)) throw new Error(`editor protocol returned diagnostics for the wrong URI or version (expected ${uri} at ${version})`);
    const event = await settled.wait(signal);
    if (JSON.stringify(event.diagnostics) !== JSON.stringify(result.diagnostics)) {
      throw new Error("editor protocol diagnostic notification disagreed with the response");
    }
    await readEditor(protocol, document, signal);
    return result;
  } finally {
    settled.dispose();
  }
}

async function hoverOn(page, opts, report, fail, deps, protocol, document, settleBudgetS) {
  const { uri, version } = document;
  const word = opts["--hover"];
  const hit = locateWord(document.text.split(/\r\n|\r|\n/), word, opts["--line"]);
  if (!hit) {
    fail(`"${word}" is not a whole word in the document${opts["--line"] ? ` on a line containing "${opts["--line"]}"` : ""}`);
    return;
  }
  const signal = AbortSignal.timeout(Math.ceil(settleBudgetS * 1000));
  const position = { line: hit.index, character: hit.start };
  const textDocument = { uri };
  const range = { start: position, end: position };
  await protocol.notify("editor/select", { textDocument, range, scrollIntoView: "center", takeFocus: true }, { version, signal });
  const { selection } = await readEditor(protocol, document, signal);
  const at = (point) => point?.line === position.line && point.character === position.character;
  if (!at(selection.start) || !at(selection.end)) {
    fail(`editor protocol selection did not land on "${word}"`);
    return;
  }
  const model = await protocol.request("textDocument/hover", { textDocument, position }, { version, signal });
  await readEditor(protocol, document, signal);
  const order = (a, b) => a.line - b.line || a.character - b.character;
  const diagnostics = report.diagnostics.diagnostics.filter(({ range }) =>
    range?.start && range.end && order(range.start, position) <= 0 && order(position, range.end) < 0,
  );
  report.hover = { word, position, selection, model, diagnostics };
  if (model == null && !diagnostics.length) fail(`no protocol hover or current diagnostic covers "${word}"`);
  let caret = false;
  for (let i = 0; i < 10 && !caret; i++) {
    caret = await page.evaluate(renderedCaretOnWord, { word });
    if (!caret) await deps.sleep(100);
  }
  if (!caret) {
    fail(`no visible caret on the rendered word "${word}" after revealing the protocol selection`);
    return;
  }
  await page.keyboard.press("Control+k");
  await page.keyboard.press("Control+i");
  let visual = { present: false };
  for (let i = 0; i < 20 && (!visual.present || (visual.img && !visual.img.complete)); i++) {
    await deps.sleep(500);
    visual = await page.evaluate(hoverOnPage);
  }
  report.hover.visual = visual;
  if (!visual.present) {
    fail(`no visible hover opened on "${word}" within 10 s of Ctrl+K Ctrl+I`);
    return;
  }
  if (opts["--hover-image"] && !visual.img) fail(`the rendered hover on "${word}" carries no image (--hover-image)`);
  const broken = hoverImageFailure(visual.img);
  if (broken) fail(broken);
  if (opts["--hover-shot"]) {
    await page.locator("[data-drive-hover]").first().screenshot({ path: opts["--hover-shot"] });
    report.hoverScreenshot = path.resolve(opts["--hover-shot"]);
  }
}

const runAsCli = process.argv[1] != null && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
const [cmd, ...rest] = runAsCli ? process.argv.slice(2) : ["__imported__"];
if (runAsCli) useWorktreeTemp();
switch (cmd) {
  case "__imported__":
    break;
  case "up":
    await up(rest).catch((error) => die(error.message));
    break;
  case "status":
    process.exitCode = await status();
    break;
  case "down":
    await down();
    break;
  case "desktop": {
    process.exitCode = await desktop(rest);
    break;
  }
  case "verify": {
    const { exitCode } = await verify(rest);
    process.exitCode = exitCode;
    break;
  }
  default:
    log(
      [
        "usage: node .agents/skills/drive-vscode-web/driver.mjs <command>",
        "",
        "  up [options]       serve the built extension with vscode-test-web on a port pinned to this worktree",
        "  status             is it up? prints the URL and the served folder",
        "  down               stop the server",
        "  verify [options]   open a file in the served workbench, read diagnostics and a hover, screenshot; JSON report",
        "  desktop --code <executable> --mode full|f5 [--project <folder>] [--scenario <json>] [--out <directory>] [--timeout <seconds>]",
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
        "  --hover-image        the hover must carry an image, or the run fails",
        "  --shot <out.png>     screenshot the page",
        "  --hover-shot <png>   screenshot the hover widget alone",
        "  --debug             verify web debugger pause, variables, evaluation, step and continue",
        "  --expression <text> expression to evaluate with --debug (default: 1 + 1)",
        "  --result <text>     exact expected evaluation result (default: 2)",
        "  --debug-shot <png>  screenshot the paused web debugger",
        "  --probe <file.js>    body of an async fn evaluated in the page; result -> JSON",
        `  --settle <seconds>   deadline for protocol document and diagnostic reads (default ${DEFAULT_SETTLE_S})`,
        "  --headed             run a visible browser instead of headless",
      ].join("\n"),
    );
}

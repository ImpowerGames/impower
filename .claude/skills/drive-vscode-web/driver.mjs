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

import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
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
const PACKAGES_DIR = path.join(REPO_ROOT, "packages");
const STATE_FILE = path.join(SKILL_DIR, ".state.json");
// The same file in another worktree of this repository.
const STATE_REL = path.relative(REPO_ROOT, STATE_FILE);
// The build stamp lives under out/, which is gitignored and survives a
// rebuild, so a source file whose content is what the build was made from
// is not mistaken for a change by its modification time alone.
const STAMP_FILE = path.join(EXT_DIR, "out", ".drive-vscode-web-build.json");
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
const iso = (ms) => new Date(ms).toISOString();
const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

// ------------------------------------------------------------- pure parts ---

// The served build ships its stylesheet as workbench.web.main.internal.css and
// the server's page template links workbench.web.main.css, so without a copy
// under the second name the workbench renders unstyled: no explorer rows, no
// visible editor, every Playwright visibility wait times out. Copies the file
// into place under every unpacked build in the directory and reports which
// builds it touched. A copy that is already there and the same size as the
// original is left alone; a shorter one (a copy interrupted mid-run) is
// written again. The copy lands under a temporary name and is renamed into
// place, so a partial file is never the one the page loads; `io` is the file
// system, a parameter so driver.test.mjs can record those two calls.
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

export const QUALITIES = ["stable", "insiders"];

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

// Entries directly under the data directory's builds/ that no quality owns:
// a build unpacked there by a driver that handed the server builds/ itself,
// and any empty directory a refused quality left behind. Each is a path to
// remove once nothing serves from builds/ directly.
export function strayBuilds(buildsRoot, io = fs) {
  if (!io.existsSync(buildsRoot)) return [];
  const strays = [];
  for (const entry of io.readdirSync(buildsRoot)) {
    if (QUALITIES.includes(entry)) continue;
    const p = path.join(buildsRoot, entry);
    let empty = false;
    try {
      empty = io.statSync(p).isDirectory() && io.readdirSync(p).length === 0;
    } catch {
      continue;
    }
    if (entry.startsWith("vscode-web-") || empty) strays.push(p);
  }
  return strays;
}

// The records, among other worktrees' state files, of a live server whose
// build directory is `buildsDir`: the servers a download into that directory
// would pull the build out from under. `alive` says whether a pid is running.
export function sharedBuildUsers(records, buildsDir, alive) {
  return records.filter((r) => r?.pid != null && r.builds && samePath(r.builds, buildsDir) && alive(r.pid));
}

// Everything a launch is made of, from the options: the server's argument
// list, the folder it serves, and where its log goes. `up` runs exactly this
// plan, so pinning it pins the wiring: the directory the server may delete
// is `builds`, which is also where the commit is read from and the
// stylesheet alias is written, and neither the served project nor the log is
// inside it. A quality other than the two the server downloads is refused
// here, because the quality names that directory.
export function launchPlan({ data, port, quality = "stable", sd, project, commit, extDir, entry }) {
  if (!QUALITIES.includes(quality)) return { error: `--quality must be ${QUALITIES.join(" or ")}, not "${quality}"` };
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

// Directories under a source root that hold nothing the extension bundles.
export const SOURCE_SKIP = ["node_modules", "dist", "out", "__snapshots__", "tests", "__tests__"];

// The source files under `roots` (a root may be a file), each with its
// modification time. Directories in SOURCE_SKIP and test files are passed
// over, and so are links, since a junction points at a directory elsewhere
// and is not a source, and anything that cannot be read, since a dangling
// link or a locked directory says nothing about the build.
export function sourceFiles(roots, io = fs) {
  const files = [];
  const stack = [];
  for (const root of roots) {
    try {
      const st = io.statSync(root);
      if (st.isFile()) files.push({ path: root, mtimeMs: st.mtimeMs });
      else if (st.isDirectory()) stack.push(root);
    } catch {
      /* not there */
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
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (!SOURCE_SKIP.includes(e.name)) stack.push(p);
        continue;
      }
      if (!e.isFile() || /\.test\./.test(e.name)) continue;
      try {
        files.push({ path: p, mtimeMs: io.statSync(p).mtimeMs });
      } catch {
        /* removed mid-walk */
      }
    }
  }
  return files;
}

// The artifacts the served workbench loads, each with the source roots that
// feed it and the command that rebuilds it. out/extension.js is the
// extension bundle; out/workers/ holds the language server the diagnostics
// and hovers come from, which the extension build copies from the package's
// dist and only the package's own build rewrites; out/webviews/ holds one
// bundle per webview app; out/data/ holds copies of data/. Every package's
// src feeds every bundle, because the bundles resolve the workspace packages
// by source. language/ and package.json are read by the workbench as they
// are and need no build.
export function buildRule(extDir, packagesDir, io = fs) {
  const out = path.join(extDir, "out");
  const list = (dir) => (io.existsSync(dir) ? io.readdirSync(dir) : []);
  const pkgSrc = list(packagesDir).map((p) => path.join(packagesDir, p, "src"));
  const full = "cd vscode-sparkdown && npm run build";
  const self = "cd vscode-sparkdown && node scripts/esbuild.ts";
  const groups = [
    { artifact: path.join(out, "extension.js"), sources: [path.join(extDir, "src"), ...pkgSrc], rebuild: self },
    { artifact: path.join(out, "workers", "sparkdown-language-server.js"), sources: pkgSrc, rebuild: full },
  ];
  for (const w of list(path.join(out, "workers"))) {
    if (w.endsWith(".js") && w !== "sparkdown-language-server.js") groups.push({ artifact: path.join(out, "workers", w), sources: pkgSrc, rebuild: full });
  }
  for (const w of list(path.join(extDir, "webviews"))) {
    if (io.existsSync(path.join(extDir, "webviews", w, "package.json"))) {
      groups.push({ artifact: path.join(out, "webviews", `${w}.js`), sources: [path.join(extDir, "webviews", w), ...pkgSrc], rebuild: `cd vscode-sparkdown && npm run build:${w}` });
    }
  }
  for (const f of list(path.join(extDir, "data"))) groups.push({ artifact: path.join(out, "data", f), sources: [path.join(extDir, "data", f)], rebuild: self });
  return groups;
}

// Every artifact against the sources that feed it, by modification time. A
// copied artifact keeps its source's time to the millisecond and not below
// it, so a source counts as newer only by more than a millisecond. Returns
// the artifacts that are missing, the groups with a source newer than the
// artifact (with the newest such source and every offending file), and the
// size and time of each artifact present. `filesOf` lists a root's source
// files and is memoized by the caller, since every bundle shares the
// package roots.
export const NEWER_BY_MS = 1;
export function buildFreshness(groups, filesOf) {
  const missing = [];
  const stale = [];
  const artifacts = [];
  for (const g of groups) {
    let st;
    try {
      st = fs.statSync(g.artifact);
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

// Whether the stamp written when the build was last accepted still describes
// it: the same artifacts (size and time), and for every source file newer
// than its artifact the same content as then. That is a file touched but not
// changed (a `git checkout`, a redgreen restore), which is not a reason to
// rebuild. `artifacts` and `stamp.artifacts` map a relative path to `{ size,
// mtimeMs }`; `offenders` carry a relative path and the content's sha1.
export function stampCovers(stamp, artifacts, offenders) {
  if (!stamp?.artifacts || !stamp.sources) return false;
  const keys = Object.keys(artifacts);
  if (keys.length !== Object.keys(stamp.artifacts).length) return false;
  for (const k of keys) {
    const s = stamp.artifacts[k];
    if (!s || s.size !== artifacts[k].size || s.mtimeMs !== artifacts[k].mtimeMs) return false;
  }
  return offenders.every((o) => stamp.sources[o.rel] === o.sha);
}

// Monaco renders every space in a rendered line as a non-breaking space, so a
// line's text never contains the plain space the source has. Both sides of a
// text match go through this; it runs in the page too, by source.
export function normalizeMonacoText(text) {
  return (text || "").replace(/\u00a0/g, " ");
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

// The word location runs in the page, rebuilt from its source, because a
// page function cannot close over module scope. `findWord` and
// driver.test.mjs both rebuild it through `rebuildPageFunctions`, itself
// shipped by source, so a helper the function needs but does not carry fails
// the check before it fails in the page.
export function pageSources() {
  return { normSrc: normalizeMonacoText.toString(), locateSrc: locateWord.toString(), rebuildSrc: rebuildPageFunctions.toString() };
}
export function rebuildPageFunctions({ normSrc, locateSrc }) {
  const normalizeMonacoText = new Function(`return ${normSrc}`)();
  const locateWord = new Function("normalizeMonacoText", `return ${locateSrc}`)(normalizeMonacoText);
  return { normalizeMonacoText, locateWord };
}

// The line and column the status bar's selection item reports (`Ln 8, Col 5`).
export function cursorAt(text) {
  const m = /Ln (\d+), Col (\d+)/.exec(text || "");
  return m ? { line: Number(m[1]), col: Number(m[2]) } : null;
}

// Whether the caret Monaco drew after the click sits inside the word: on the
// word's line as the status bar reports it, and between the word's left and
// right edges on the rendered line. The edges and the caret are compared in
// pixels, because a tab-indented line is rendered wider than the model
// counts it (Monaco expands a tab to the next tab stop), so a rendered
// column and a model column agree only on a space-indented line. `caretX`
// is the caret's centre, which Monaco draws on the character boundary; a
// caret on the boundary before the last character is on the word, one on
// the boundary after it is not, with half a character of slack for the
// rounding of either. Returns the reason the caret is not on the word, or
// null.
export function cursorOnWord(hit, cursorText, caretX) {
  const at = cursorAt(cursorText);
  if (!at) return `the status bar reports no cursor position (${JSON.stringify(cursorText)})`;
  if (hit.line != null && at.line !== hit.line) return `the cursor is on line ${at.line}, not line ${hit.line}`;
  if (caretX == null) return "no caret is drawn";
  const slack = (hit.charWidth ?? 2) / 2;
  if (caretX < hit.left - slack || caretX >= hit.right - slack) return `the caret is at x=${Math.round(caretX)}, outside the word's ${Math.round(hit.left)}..${Math.round(hit.right)}`;
  return null;
}

// `opened` is true only for the editor titled exactly as the file asked for.
export function editorOpened(title, file) {
  return title === file;
}

// Whether the hover's image is what the report can call loaded, or the
// reason it is not. `complete` is true after a load error as well as after
// a load, so the natural size is what tells a rendered image from a broken
// one that the hover's own height keeps at full size.
export function hoverImageFailure(img) {
  if (!img) return null;
  if (!img.hasSrc) return "the hover's image has no src";
  if (!img.complete) return "the hover's image had not finished loading within 10 s";
  if (!(img.naturalWidth > 0 && img.naturalHeight > 0)) return `the hover's image failed to load: natural size ${img.naturalWidth} x ${img.naturalHeight}`;
  return null;
}

// Whether a series of readings has stopped changing. The readings are the
// diagnostics snapshots verify takes once a second after opening the file,
// each `{ problems, ... }`. A reading taken before the status bar's problems
// item exists carries `problems: null` and says nothing, so leading ones are
// dropped. The extension host and the language server boot in workers after
// the page loads, so the first readings are the workbench's own "no
// problems" and say nothing about the server either; the series counts as
// settled once it has changed from its first value and then held for
// `stableReads`, or, for a file the server finds clean, once `minReads` have
// been taken and the last `stableReads` agree.
export function isSettled(readings, { stableReads = 8, minReads = 25 } = {}) {
  const first = readings.findIndex((r) => r?.problems != null);
  const series = (first < 0 ? [] : readings.slice(first)).map((r) => JSON.stringify(r));
  if (series.length < stableReads) return false;
  const last = series[series.length - 1];
  if (!series.slice(-stableReads).every((r) => r === last)) return false;
  return series.some((r) => r !== series[0]) || series.length >= minReads;
}

// What the report says about the readings: the last one, whether they
// settled, and the failure when they did not, so an unsettled run is never
// a clean exit with numbers that are not a result.
export function diagnosticsOutcome(readings, elapsedS, budgetS, thresholds) {
  const settled = isSettled(readings, thresholds);
  return {
    settled,
    settledAfterS: elapsedS,
    diagnostics: readings[readings.length - 1] ?? null,
    failure: settled ? null : `the diagnostics had not settled after ${elapsedS} s (--settle ${budgetS}); the numbers reported are the last reading, not a result`,
  };
}

// Flag parsing shared by `up` and `verify`. `spec` maps a flag to "value",
// "number" (a count of seconds written as digits, zero or more) or "flag";
// an unknown flag, a value flag with nothing usable after it (the end of the
// arguments, an empty string, or another flag from `spec`) and a number that
// is not one are refused before anything runs, so a misspelt option fails at
// once. A value that merely begins with dashes, such as a Luau comment given
// to `--line`, is a value.
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

// ------------------------------------------------------------------ state ---

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(file, record) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2));
  fs.renameSync(tmp, file);
}

const readState = () => readJson(STATE_FILE);

function stateUnreadable() {
  return readState() === null && fs.existsSync(STATE_FILE);
}

const writeState = (record) => writeJson(STATE_FILE, record);

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

// The state files of this repository's other worktrees, listed through git;
// a checkout git does not list is not seen, so what this guards is what can
// be seen.
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
    const r = readJson(path.join(root, STATE_REL));
    if (r) records.push({ ...r, worktree: root });
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

// Every artifact the served workbench loads must be at least as new as every
// source that feeds it, or carry the stamp that says the newer sources hold
// the content it was built from; a launch and every `verify` refuse
// otherwise, so a screenshot is always of a build that includes the change.
// The stamp is written whenever a build is accepted by time and the
// artifacts differ from the last stamped set.
function checkBuild() {
  const rel = (p) => path.relative(REPO_ROOT, p).replaceAll("\\", "/");
  const sha1 = (p) => createHash("sha1").update(fs.readFileSync(p)).digest("hex");
  const cache = new Map();
  const filesOf = (root) => {
    if (!cache.has(root)) cache.set(root, sourceFiles([root]));
    return cache.get(root);
  };
  const groups = buildRule(EXT_DIR, PACKAGES_DIR);
  const { missing, stale, artifacts } = buildFreshness(groups, filesOf);
  if (missing.length) die(`vscode-sparkdown/${path.relative(EXT_DIR, missing[0]).replaceAll("\\", "/")} is missing; build the extension first: cd vscode-sparkdown && npm run build`);
  const current = Object.fromEntries(artifacts.map((a) => [rel(a.path), { size: a.size, mtimeMs: a.mtimeMs }]));
  const stamp = readJson(STAMP_FILE);
  if (stale.length) {
    const offenders = new Map();
    for (const g of stale) for (const f of g.newer) if (!offenders.has(f.path)) offenders.set(f.path, { rel: rel(f.path), sha: sha1(f.path) });
    if (!stampCovers(stamp, current, [...offenders.values()])) {
      const g = stale[0];
      const more = stale.length > 1 ? `, and ${stale.length - 1} more artifact${stale.length > 2 ? "s are" : " is"} older than a source` : "";
      const how = stale.length > 1 ? "cd vscode-sparkdown && npm run build" : g.rebuild;
      die(`${rel(g.artifact)} (built ${iso(g.artifactMs)}) is older than ${rel(g.source)} (${iso(g.sourceMs)})${more}; rebuild so the served workbench runs the change: ${how}`);
    }
  } else if (!stampCovers(stamp, current, [])) {
    const sources = {};
    for (const root of new Set(groups.flatMap((g) => g.sources))) for (const f of filesOf(root)) sources[rel(f.path)] = sha1(f.path);
    writeJson(STAMP_FILE, { artifacts: current, sources });
  }
  const oldest = artifacts.reduce((a, b) => (b.mtimeMs < a.mtimeMs ? b : a));
  return { artifacts: artifacts.length, oldest: rel(oldest.path), builtAt: iso(oldest.mtimeMs) };
}

// ----------------------------------------------------------------- server ---

const UP_FLAGS = { "--sd": "value", "--project": "value", "--data": "value", "--quality": "value", "--fresh": "flag" };

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
  if (opts["--sd"] && !isFile(path.resolve(opts["--sd"]))) die(`up: --sd ${path.resolve(opts["--sd"])} is not a file`);
  if (opts["--project"] && !isDir(path.resolve(opts["--project"]))) die(`up: --project ${path.resolve(opts["--project"])} is not a directory`);
  if (opts["--quality"] && !QUALITIES.includes(opts["--quality"])) die(`up: --quality must be ${QUALITIES.join(" or ")}, not "${opts["--quality"]}"`);
  if (stateUnreadable()) {
    die(`state file unreadable: ${STATE_FILE}; \`down\` removes it, and any server it recorded keeps running`);
  }
  const existing = readState();
  if (existing?.url && (await recordStands(existing, probe))) {
    let ready = await isUp(existing.url);
    if (!ready) {
      log(`server pid ${existing.pid} is still starting → ${existing.url}`);
      ready = await waitReady(existing.url, existing.builds, () => pidAlive(existing.pid), { downloading: !existing.commit });
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
  if (opts["--data"] && !samePath(opts["--data"], existing.data)) {
    die(`already serving from ${existing.data} → ${existing.url}; \`down\` first to use ${path.resolve(opts["--data"])}`);
  }
  if (opts["--project"] && !samePath(opts["--project"], existing.project)) {
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
  checkBuild();
  const data = path.resolve(opts["--data"] ?? DEFAULT_DATA_DIR);
  const quality = opts["--quality"] ?? "stable";
  const port = await pickPort();
  const url = `http://localhost:${port}`;
  const base = { data, port, quality, sd: opts["--sd"], project: opts["--project"], extDir: EXT_DIR, entry: SERVER_ENTRY };
  const first = launchPlan(base);
  if (first.error) die(`up: ${first.error}`);
  const others = otherWorktreeRecords();
  // A launch without a commit pin, which is what `--fresh` asks for, deletes
  // the quality's builds directory before it downloads, so it is refused
  // while another worktree's server serves from that directory.
  if (opts["--fresh"]) {
    const users = sharedBuildUsers(others, first.builds, pidAlive);
    if (users.length) die(`up --fresh would delete ${first.builds}, which ${users.map((u) => `${u.worktree} (pid ${u.pid}, ${u.url})`).join(" and ")} serves from; \`down\` there first`);
  }
  // A build unpacked directly under builds/ belongs to no quality and is
  // removed, unless a server of another worktree still serves from builds/
  // itself, which a driver older than the quality directories does.
  const buildsRoot = dataLayout(data).builds;
  const strays = strayBuilds(buildsRoot);
  if (strays.length) {
    const users = sharedBuildUsers(others, buildsRoot, pidAlive);
    if (users.length) log(`leaving ${strays.join(", ")} in place: ${users.map((u) => u.worktree).join(", ")} still serves from ${buildsRoot}`);
    else {
      for (const p of strays) {
        fs.rmSync(p, { recursive: true, force: true });
        log(`removed ${p}, which no quality directory owns`);
      }
    }
  }
  const commit = opts["--fresh"] ? null : unpackedCommit(first.builds);
  const plan = launchPlan({ ...base, commit });
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
  if (!(await waitReady(url, plan.builds, () => pidAlive(child.pid), { downloading: !commit }))) {
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
async function waitReady(url, builds, keep, { downloading = true } = {}) {
  log(downloading ? "downloading the VS Code build (about 55 MB). Waiting..." : "Waiting for the server...");
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
  for (const f of ["--hover-shot", "--line"]) if (opts[f] && !opts["--hover"]) die(`verify: ${f} needs --hover`);
  const s = readState();
  if (!s?.url) die("no server URL; run `node .claude/skills/drive-vscode-web/driver.mjs up --sd <file.sd>` first");
  if (!(await recordStands(s, probe))) die(`${STATE_FILE} records pid ${s.pid}, which is not the server it started; \`down\` then \`up\``);
  if (!(await isUp(s.url))) die(`${s.url} does not answer; \`down\` then \`up\``);
  const build = checkBuild();

  const file = opts["--file"] ?? "main.sd";
  const settleBudgetS = opts["--settle"] ?? 60;
  const report = { url: s.url, project: s.project, file, build, failed: [] };
  const fail = (msg) => report.failed.push(msg);

  try {
    const { aliased } = aliasWorkbenchCss(s.builds);
    for (const dir of aliased) log(`stylesheet alias written in ${dir}`);
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
            readings.push(await readDiagnostics(page));
            if (isSettled(readings) || Date.now() - started >= settleBudgetS * 1000) break;
            await sleep(1000);
          }
          const outcome = diagnosticsOutcome(readings, Math.round((Date.now() - started) / 1000), settleBudgetS);
          report.settled = outcome.settled;
          report.settledAfterS = outcome.settledAfterS;
          report.diagnostics = outcome.diagnostics;
          if (outcome.failure) fail(outcome.failure);
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
  report.opened = editorOpened(title, file);
  if (!report.opened) fail(`the editor that opened is titled ${JSON.stringify(title)}, not ${file}`);
}

// Puts the cursor on the word and asks for the hover by keyboard: mouse
// movement never opens the widget headlessly, the Show Hover command
// (Ctrl+K Ctrl+I) does. The caret and the status bar are read back after
// the click, so the report says where the hover was asked for and fails
// when that is not inside the word.
async function hoverOn(page, opts, report, fail) {
  const word = opts["--hover"];
  const hit = await findWord(page, word, opts["--line"]);
  if (!hit) {
    fail(`"${word}" is not a whole word on a rendered line${opts["--line"] ? ` containing "${opts["--line"]}"` : ""}; only the lines in the viewport are rendered`);
    return;
  }
  await page.mouse.click(hit.x, hit.y);
  await sleep(400);
  const caret = await page.evaluate(() => {
    const r = document.querySelector(".monaco-editor .cursors-layer .cursor")?.getBoundingClientRect();
    return { text: document.querySelector('.statusbar-item[id*="status.editor.selection"]')?.innerText.trim() ?? null, x: r ? r.x + r.width / 2 : null };
  });
  report.hover = { word, line: hit.line, col: hit.col, cursor: caret.text };
  const off = cursorOnWord(hit, caret.text, caret.x);
  if (off) {
    fail(`the cursor did not land on "${word}" at Ln ${hit.line}, Col ${hit.col}: ${off}`);
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
  const broken = hoverImageFailure(hover.img);
  if (broken) fail(broken);
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
// row at the same offset), its column on the rendered line, the pixel
// edges of its characters, and a click point inside its first character.
// `locateWord` runs in the page rebuilt from its source, through the same
// `rebuildPageFunctions` the check uses, so what the check pins is what the
// page runs.
function findWord(page, word, lineText) {
  return page.evaluate(
    ({ word, lineText, sources }) => {
      const { locateWord } = new Function(`return ${sources.rebuildSrc}`)()(sources);
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
      return { line: number ? Number(number.textContent) : null, col: hit.start + 1, left: r.x, right: r.x + r.width, charWidth, x: r.x + charWidth * 0.4, y: r.y + r.height / 2 };
    },
    { word, lineText, sources: pageSources() },
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
            natural: `${img.naturalWidth} x ${img.naturalHeight}`,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
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
        "  --settle <seconds>   how long to wait for diagnostics to stop changing (default 60); not settling is a failure",
        "  --headed             run a visible browser instead of headless",
      ].join("\n"),
    );
}

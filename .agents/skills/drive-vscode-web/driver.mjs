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
//   node .agents/skills/drive-vscode-web/driver.mjs up --sd repro.sd
//   node .agents/skills/drive-vscode-web/driver.mjs verify --hover colorscript_001 --shot after.png
//   node .agents/skills/drive-vscode-web/driver.mjs down
//
// This file must live inside the repo tree: Node resolves `playwright` from
// the script's directory, not from cwd. State (URL, server pid, served
// folder) lives in .state.json beside this file, which is gitignored.
//
// `up`, `verify`, `status` and `checkBuild` take a `deps` object (the state
// file, the process probes, the server spawn, the browser; for `checkBuild`
// the paths, the refusal and the file system as `io`) so driver.test.mjs runs
// them in-process against stubs and pins what each one refuses and what it
// calls; the pieces `liveDeps` wires in (the spawn, the readiness wait, the
// port probe) take their own system calls as a parameter for the same reason.
// The functions that run inside the page take the page's `document` as a
// parameter that defaults to the real one, and the check rebuilds each of
// them from its source before calling it, as `page.evaluate` does, so one
// that reaches for module scope fails the check before it fails in the page.

import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  consoleLine,
  partitionConsole,
  pidAlive,
  processStartedMs,
  recordStands,
  resolveChromiumExecutablePath,
} from "../drive-web-editor/driver.mjs";

const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SKILL_DIR, "..", "..", "..");
const EXT_DIR = path.join(REPO_ROOT, "vscode-sparkdown");
const PACKAGES_DIR = path.join(REPO_ROOT, "packages");
const CANONICAL_STATE_FILE = path.join(SKILL_DIR, ".state.json");
const LEGACY_STATE_FILE = path.join(REPO_ROOT, ".claude", "skills", "drive-vscode-web", ".state.json");
const STATE_FILE = !fs.existsSync(CANONICAL_STATE_FILE) && fs.existsSync(LEGACY_STATE_FILE) ? LEGACY_STATE_FILE : CANONICAL_STATE_FILE;
// The same file in another worktree of this repository.
const STATE_REL = path.relative(REPO_ROOT, CANONICAL_STATE_FILE);
// The build stamp lives under out/, which is gitignored and survives a
// rebuild, so a source file whose content is what the build was made from
// is not mistaken for a change by its modification time alone.
export const STAMP_NAME = ".drive-vscode-web-build.json";
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
    locks: path.join(root, "locks"),
  };
}

/** Where the lock for a quality's download sits: beside `builds`, which a download deletes whole. */
export function downloadLockPath(layout, quality) {
  return path.join(layout.locks, `download-${quality}.lock`);
}

/**
 * Takes the lock that stops two worktrees downloading into one quality's
 * builds directory at the same time. The directory is deleted before the
 * download, so the launch that loses the race ends up serving a directory
 * the other emptied; nothing but the order of two commands decided it.
 *
 * The lock is created with the exclusive flag, so the winner is decided by
 * the filesystem rather than by a read followed by a write. A lock whose
 * record no longer stands (the launch that took it has exited) is dropped
 * and the lock retaken once; `held: false` carries the record still holding
 * it, for the refusal to name.
 */
// The four filesystem calls the lock is made of, apart so the check can run
// the same code without a disk. `writeNew` fails with EEXIST rather than
// overwriting, which is what decides the winner.
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
      // A lock another launch removed between the read and the remove is
      // the outcome this wanted anyway.
    }
  },
};

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

// Console lines the served workbench produces on every run, whatever the
// change under test is: two resources the build does not ship, the file
// watcher the web workbench has no API for, and the page error that follows
// them. They are partitioned out of `consoleErrors` and counted under
// `consoleNoise`, so what is left in the list is worth reading and a line
// that stopped appearing reads as a count of zero.
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

// The records, among other worktrees' state files, of a live server whose
// build directory is `buildsDir`: the servers a download into that directory
// would pull the build out from under. `stands` says whether a record still
// names its own server (a live pid alone proves nothing after pid reuse).
export async function sharedBuildUsers(records, buildsDir, stands) {
  const users = [];
  for (const r of records) {
    if (r?.pid != null && r.builds && samePath(r.builds, buildsDir) && (await stands(r))) users.push(r);
  }
  return users;
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
// over; so is a link, which a directory listing reports as neither a file
// nor a directory (a junction points at a directory elsewhere and is not a
// source), and anything that cannot be read, since a locked directory says
// nothing about the build.
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

// The steps that rebuild what the guard watches, run from vscode-sparkdown/
// in this order: the language server's own build writes its bundle to the
// package's dist, and the extension's esbuild script copies that dist into
// out/workers, bundles out/extension.js and copies data/ into out/data.
export const REBUILD_STEPS = ["npm run build:sparkdown-language-server", "node scripts/esbuild.ts"];

// The command that rebuilds `groups`: their steps, each once, in the order
// the steps must run.
export function rebuildCommand(groups) {
  const wanted = new Set(groups.flatMap((g) => g.steps));
  return `cd vscode-sparkdown && ${REBUILD_STEPS.filter((s) => wanted.has(s)).join(" && ")}`;
}

// The artifacts the served workbench loads for an open .sd editor, each with
// the source roots that feed it and the steps that rebuild it: the extension
// bundle, the language server worker every diagnostic and hover comes from,
// and the copies of the files under data/. Every package's src feeds both
// bundles, because they resolve the workspace packages by source, and so
// does every package's language/ directory and the extension's own, whose
// JSON the bundles take in by value (the grammar and the language
// configuration), so a regenerated grammar makes both stale. The webview
// bundles and the other workers are not watched: the driver cannot show a
// webview, a command or an export. A packages directory with no package
// source is refused rather than guarded by nothing. The copies under
// out/data are `copied`: a copy carries its source's time, so it says when
// the source was written and nothing about when the build ran.
export function buildRule(extDir, packagesDir, io = fs) {
  const out = path.join(extDir, "out");
  const list = (dir) => (io.existsSync(dir) ? io.readdirSync(dir) : []);
  const present = (p) => io.existsSync(p);
  const pkgSrc = list(packagesDir).map((p) => path.join(packagesDir, p, "src")).filter(present);
  if (!pkgSrc.length) throw new Error(`${packagesDir} holds no package with a src directory, so the sources that feed the extension cannot be checked; the driver expects the repository's packages/ beside vscode-sparkdown/`);
  const pkgLang = list(packagesDir).map((p) => path.join(packagesDir, p, "language")).filter(present);
  const shared = [...pkgSrc, ...pkgLang];
  const [lsBuild, self] = REBUILD_STEPS;
  const groups = [
    { artifact: path.join(out, "extension.js"), sources: [path.join(extDir, "src"), path.join(extDir, "language"), ...shared], steps: [self] },
    { artifact: path.join(out, "workers", "sparkdown-language-server.js"), sources: shared, steps: [lsBuild, self] },
  ];
  for (const f of list(path.join(extDir, "data"))) {
    if (io.statSync(path.join(extDir, "data", f)).isFile()) groups.push({ artifact: path.join(out, "data", f), sources: [path.join(extDir, "data", f)], steps: [self], copied: true });
  }
  return groups;
}

// Every artifact against the sources that feed it, by modification time. A
// copied artifact keeps its source's time to the millisecond and not below
// it, so a source counts as newer only by more than a millisecond. Returns
// the artifacts that are missing, the groups with a source newer than the
// artifact (with the newest such source and every offending file), and the
// size and time of each artifact present. `filesOf` lists a root's source
// files and is memoized by the caller, since both bundles share the
// package roots; `io` is the file system.
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

// What the stamp written when the build was last accepted fails to vouch
// for, or null when it covers the build. The source set is compared first,
// whatever the artifacts are: `removed` or `added` when a source the stamp
// lists is gone or one it never saw is here, since the build then took in
// sources that are not these, unless `builtSince` says the artifacts the
// file feeds were written after the directory entry changed, in which case
// the build is made from this set and the stamp is out of date. Then
// `artifacts` when the artifacts are not the stamped set (a rebuild since,
// no stamp yet, or a set the stamp is out of date on), which is what makes
// a new stamp; then `changed` when a source newer than its artifact does
// not hold the content stamped. A file touched but not changed (a `git
// checkout`, a redgreen restore) is none of those. `artifacts` and
// `stamp.artifacts` map a relative path to `{ size, mtimeMs }`; `sources`
// lists every current source's relative path; `offenders` carry a relative
// path and the content's sha1.
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

// When the entries of the directory holding `file` last changed: the system
// writes a directory's time whenever an entry is added, removed or renamed
// in it, so this is at or after the moment `file` appeared or went, and
// when its directory went with it the nearest directory still there carries
// the time that subtree was removed. Null when nothing up to `top` exists.
export function nearestDirMtime(file, top, io = fs) {
  let dir = path.dirname(file);
  for (;;) {
    try {
      return io.statSync(dir).mtimeMs;
    } catch {
      /* gone with the file */
    }
    const up = path.dirname(dir);
    if (samePath(dir, top) || up === dir) return null;
    dir = up;
  }
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
// page function cannot close over module scope. `wordOnPage` and
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
// is the caret's left edge, which Monaco draws on the character boundary
// whether the caret is a line or a block; a caret on the boundary before
// the last character is on the word, one on the boundary after it is not,
// with half a character of slack for the rounding of either. A word whose
// line has no gutter number cannot be placed, so that is a reason too.
// Returns the reason the caret is not on the word, or null.
export function cursorOnWord(hit, cursorText, caretX) {
  const at = cursorAt(cursorText);
  if (!at) return `the status bar reports no cursor position (${JSON.stringify(cursorText)})`;
  if (hit.line == null)
    return "the word's line has no gutter number, so the line the caret is on cannot be checked; line numbers are off or relative in the served folder's .vscode/settings.json, so serve a folder without that setting";
  if (at.line !== hit.line) return `the cursor is on line ${at.line}, not line ${hit.line}`;
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
  if (!(img.naturalWidth > 0 && img.naturalHeight > 0))
    return `the hover's image failed to load: natural size ${img.naturalWidth} x ${img.naturalHeight}; the src the web workbench could not fetch is in the report's img.srcHead, and this is the extension's bug rather than the driver's`;
  return null;
}

// A diagnostics reading counts only when the status bar's problems counter
// carried a number: before the item exists the reading is `null`, and while
// it exists with no text yet it is `""`, and neither says anything about
// the language server.
export function usableReading(r) {
  return /\d/.test(r?.problems ?? "");
}

// Whether a series of readings has stopped changing, and when not, why. The
// readings are the diagnostics snapshots verify takes once a second after
// opening the file, each `{ problems, squiggles, ... }` and compared whole;
// those that carry no count are no readings and are set aside wherever they
// fall, and the last reading must carry one, so a settled value is always a
// count. The extension host and the language server boot in workers after
// the page loads, so the first readings are the workbench's own "no
// problems" and say nothing about the server either; the series counts as
// settled once it has changed from its first value and then held for
// `stableReads`, or, for a file the server finds clean, once `minReads`
// have been taken, the last `stableReads` agree, and `signal` shows the
// extension activated and the language server answered, since a series that
// never leaves the workbench's own value is also what a build that never ran
// produces.
export const SETTLE = { stableReads: 8, minReads: 25 };
export function settleState(readings, { stableReads = SETTLE.stableReads, minReads = SETTLE.minReads } = {}, signal = null) {
  const last = readings[readings.length - 1];
  if (!usableReading(last))
    return { settled: false, why: `the last reading carried no count (${JSON.stringify(last?.problems ?? null)}): the status bar's problems item was gone or empty at the end, so read the report's consoleErrors` };
  const series = readings.filter(usableReading).map((r) => JSON.stringify(r));
  if (series.length < stableReads) return { settled: false, why: `${series.length} reading${series.length === 1 ? "" : "s"} carried a count and ${stableReads} that agree are needed` };
  const held = series[series.length - 1];
  if (!series.slice(-stableReads).every((r) => r === held))
    return { settled: false, why: `the last ${stableReads} readings did not agree, so the diagnostics were still changing; raise --settle, and check whether a vitest run is saturating the machine` };
  if (series.some((r) => r !== series[0])) return { settled: true, why: null };
  const unchanged = "the readings never changed from the workbench's own value";
  if (series.length < minReads)
    return { settled: false, why: `${unchanged} and ${series.length} of the ${minReads} a clean file needs were taken; raise --settle so the ${minReads} readings fit` };
  if (!signal?.activated)
    return { settled: false, why: `${unchanged} and the extension never showed itself (no status bar item of its own in the page), which is what a build that never ran looks like; read consoleErrors past the pre-existing noise and the server log \`status\` names, and confirm --file and the served folder` };
  if (!signal?.answered) return { settled: false, why: `${unchanged} and the language server never answered (no symbol after the file's name in the breadcrumbs); a file with a scene, a function or a label gives it one to answer with` };
  return { settled: true, why: null };
}
export function isSettled(readings, thresholds, signal) {
  return settleState(readings, thresholds, signal).settled;
}

// The readings come one a second and each one costs a page evaluation, tens
// of milliseconds on a loaded machine, so a budget shorter than `minReads`
// seconds plus that allowance cannot settle a file the server finds clean
// whatever the server does; such a budget is refused before anything runs.
export const READ_ALLOWANCE_S = 5;
export const SETTLE_FLOOR_S = SETTLE.minReads + READ_ALLOWANCE_S;
export const DEFAULT_SETTLE_S = 60;

// What the report says about the readings: the last one, whether they
// settled, and the failure when they did not, naming the rule that was not
// met, so an unsettled run is never a clean exit with numbers that are not
// a result.
export function diagnosticsOutcome(readings, elapsedS, budgetS, thresholds, signal) {
  const { settled, why } = settleState(readings, thresholds, signal);
  return {
    settled,
    settledAfterS: elapsedS,
    diagnostics: readings[readings.length - 1] ?? null,
    failure: settled ? null : `the diagnostics had not settled after ${elapsedS} s (--settle ${budgetS}): ${why}; the numbers reported are the last reading, not a result`,
  };
}

// Flag parsing shared by `up` and `verify`. `spec` maps a flag to "value",
// "number" (a count of seconds written as digits with an optional fraction)
// or "flag"; an unknown flag, a value flag with nothing usable after it (the
// end of the arguments, an empty string, or another flag from `spec`) and a
// number that is not one are refused before anything runs, so a misspelt
// option fails at once. A value that merely begins with dashes, such as a
// Luau comment given to `--line`, is a value.
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

// ---------------------------------------------------------- page functions ---
//
// Each of these runs inside the served workbench through `page.evaluate`,
// which serializes the function by source, so none of them may close over
// module scope: what they need comes in as the argument. `doc` is the page's
// `document` there and a scripted one in driver.test.mjs.

// The status bar's problems item (its id carries `status.problems`), which
// counts the whole workspace, and the squiggle overlays in the open editor,
// which Monaco renders for the viewport only.
export function diagnosticsOnPage(_, doc = document) {
  const item = doc.querySelector('.statusbar-item[id*="status.problems"]');
  const count = (cls) => doc.querySelectorAll(`.view-overlays .${cls}`).length;
  return {
    problems: item ? (item.innerText || "").replace(/\s+/g, " ").trim() : null,
    problemsLabel: item?.getAttribute("aria-label") ?? item?.querySelector("[aria-label]")?.getAttribute("aria-label") ?? null,
    squiggles: { error: count("squiggly-error"), warning: count("squiggly-warning"), info: count("squiggly-info") },
  };
}

// The word's place on the rendered lines: its line number (from the gutter
// row at the same offset, null when that row carries no number), its
// column on the rendered line, the pixel edges of its characters, and a
// click point inside its first character. `locateWord` is rebuilt from the
// sources handed in, through the same `rebuildPageFunctions` the check uses,
// so what the check pins is what the page runs.
export function wordOnPage({ word, lineText, sources }, doc = document) {
  const { locateWord } = new Function(`return ${sources.rebuildSrc}`)()(sources);
  const top = (el) => parseFloat(el?.style.top) || 0;
  const lines = [...doc.querySelectorAll(".view-line")].sort((a, b) => top(a) - top(b));
  const hit = locateWord(lines.map((l) => l.textContent), word, lineText);
  if (!hit) return null;
  const line = lines[hit.index];
  const number = [...doc.querySelectorAll(".margin-view-overlays .line-numbers")].find((n) => top(n.parentElement) === top(line));
  const lineNumber = Number(number?.textContent);
  const texts = [];
  const collect = (node) => {
    for (const c of node.childNodes) {
      if (c.nodeType === 3) texts.push(c);
      else collect(c);
    }
  };
  collect(line);
  const range = doc.createRange();
  let offset = 0;
  let started = false;
  for (const node of texts) {
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
  return { line: Number.isInteger(lineNumber) ? lineNumber : null, col: hit.start + 1, left: r.x, right: r.x + r.width, charWidth, x: r.x + charWidth * 0.4, y: r.y + r.height / 2 };
}

// Two things only the built extension puts in the page: the status bar item
// the extension creates when it activates, whose id is the extension's own
// (`publisher.name` from its package.json), and a breadcrumb after the
// file's name, which the workbench adds once the language server has
// answered a document symbol request (the symbol at the cursor, or `…` when
// the cursor is outside every symbol; a file with no symbol gets none).
export function extensionOnPage({ id, file }, doc = document) {
  const crumbs = [...doc.querySelectorAll(".monaco-breadcrumbs .monaco-breadcrumb-item")].map((c) => (c.innerText || "").trim());
  const at = crumbs.indexOf(file);
  return { activated: Boolean(doc.querySelector(`.statusbar-item[id="${id}"]`)), answered: at >= 0 && at < crumbs.length - 1 };
}

// The status bar's cursor position and the caret's left edge after a click.
export function caretOnPage(_, doc = document) {
  const r = doc.querySelector(".monaco-editor .cursors-layer .cursor")?.getBoundingClientRect();
  return { text: doc.querySelector('.statusbar-item[id*="status.editor.selection"]')?.innerText.trim() ?? null, x: r ? r.x : null };
}

// A `.monaco-hover` element sits in the DOM hidden and empty between hovers,
// so presence means one that has size and content. The one read is marked,
// so `--hover-shot` screenshots the same element the report describes.
export function hoverOnPage(_, doc = document) {
  for (const h of doc.querySelectorAll("[data-drive-hover]")) h.removeAttribute("data-drive-hover");
  const shown = [...doc.querySelectorAll(".monaco-hover")].filter((h) => {
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
}

// ------------------------------------------------------------------ state ---

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

function removeState() {
  try {
    fs.unlinkSync(STATE_FILE);
  } catch {
    /* already gone */
  }
}

const mtimeOf = (file) => {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return null;
  }
};

// The file a record was read from: another worktree's own copy of the state
// file when the record names its worktree, this worktree's otherwise.
export function recordFile(record) {
  return record.stateFilePath ?? (record.worktree ? path.join(record.worktree, STATE_REL) : STATE_FILE);
}

// Whether a record, this worktree's or another's, still names its own
// server: the web driver's rule, with the record's own file as the fallback
// for when it was written.
const stands = (record) =>
  recordStands(record, {
    pidAlive,
    startedMs: processStartedMs,
    recordWrittenMs: () => mtimeOf(recordFile(record)),
  });

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

// The project folder is recreated if something removed it, so a served
// folder that vanished under a live server is served again on the next page
// load rather than left as a greyed entry in the explorer.
function writeProjectSd(project, sdPath) {
  const src = fs.readFileSync(path.resolve(sdPath), "utf8");
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(path.join(project, "main.sd"), src);
  return src.length;
}

// The server detached and unreferenced, so it outlives this command, with
// its own output going to the plan's log: a detached child on Windows does
// not always flush into an inherited handle, so the readiness signal is the
// HTTP poll, never the log. Returns the pid. `io` is the spawn and the log
// file's open and close.
export function spawnServer(plan, io = { spawn, openSync: fs.openSync, closeSync: fs.closeSync }) {
  const logFd = io.openSync(plan.logPath, "a");
  const child = io.spawn(process.execPath, plan.args, { cwd: plan.cwd, stdio: ["ignore", logFd, logFd], windowsHide: true, detached: true });
  child.unref();
  io.closeSync(logFd);
  return child.pid;
}

// Polls until the URL answers, then applies the stylesheet alias, which can
// only be done once the build is unpacked, and the server unpacks it before
// it listens. `keep` ends the wait early with false when it says so. `io`
// is the probe, the alias, the clock, the sleep, the log and the refusal.
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

// The page's size: about 45 rendered lines, which is what a repro has to fit
// in for its word to be on a rendered line.
export const VIEWPORT = { width: 1400, height: 900 };

async function launchWorkbenchBrowser({ headless }) {
  const { chromium } = await import("playwright");
  const executablePath = resolveChromiumExecutablePath(chromium);
  return chromium.launch({ headless, ...(executablePath ? { executablePath } : {}) });
}

export async function withWorkbench(url, { headless = true, launch = launchWorkbenchBrowser } = {}, fn) {
  const browser = await launch({ headless });
  const page = await browser.newPage({ viewport: VIEWPORT });
  const consoleLines = [];
  page.on("console", (m) => consoleLines.push(consoleLine(m)));
  page.on("pageerror", (e) => consoleLines.push(`[pageerror] ${e.message}`));
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
    return await fn({ page, consoleLines });
  } finally {
    await browser.close();
  }
}

// Everything `up`, `verify` and `checkBuild` reach outside their own logic.
// driver.test.mjs hands in stubs for each of these.
export const liveDeps = {
  log,
  die,
  sleep,
  now: () => Date.now(),
  repoRoot: REPO_ROOT,
  extDir: EXT_DIR,
  packagesDir: PACKAGES_DIR,
  io: fs,
  // The extension's identifier, which names the status bar item it creates.
  extensionId: () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(EXT_DIR, "package.json"), "utf8"));
    return `${pkg.publisher}.${pkg.name}`;
  },
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
  checkBuild: () => checkBuild(liveDeps),
  pickPort,
  otherWorktreeRecords,
  unpackedCommit,
  takeDownloadLock: (lockPath, record) => takeDownloadLock(lockPath, record, lockIo, stands),
  releaseDownloadLock: (lockPath) => lockIo.removeLock(lockPath),
  writeProjectSd,
  spawnServer,
  waitReady,
  aliasWorkbenchCss,
  withWorkbench,
};

// ------------------------------------------------------------------ build ---

// Every artifact the served workbench loads for an open editor must be at
// least as new as every source that feeds it, or carry the stamp that says
// the newer sources hold the content it was built from and the source set
// is the one it was built from; a launch and every `verify` refuse
// otherwise, so a screenshot is always of a build that includes the change.
// The source set is judged first, whatever the artifacts: a source the stamp
// lists that is gone, or one it never saw, refuses unless every artifact it
// feeds was written after the directory entry changed, and the stamp is
// never rewritten over such a gap. The stamp is written whenever a build is
// accepted by time and the artifacts, or the source set, differ from the
// last stamped. Returns what the report says about the build: the artifact
// count, and the older of the bundles the rebuild steps write with its time
// (a copy under out/data carries its source's time, so it dates nothing).
export function checkBuild(deps = liveDeps) {
  const { repoRoot, extDir, packagesDir } = deps;
  const io = deps.io ?? fs;
  const stampFile = path.join(extDir, "out", STAMP_NAME);
  const rel = (p) => path.relative(repoRoot, p).replaceAll("\\", "/");
  const sha1 = (p) => createHash("sha1").update(io.readFileSync(p)).digest("hex");
  const cache = new Map();
  const filesOf = (root) => {
    if (!cache.has(root)) cache.set(root, sourceFiles([root], io));
    return cache.get(root);
  };
  let groups;
  try {
    groups = buildRule(extDir, packagesDir, io);
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
  // The artifacts a source feeds: those whose roots hold it, or every
  // artifact for a source the stamp lists under a root this rule no longer
  // watches.
  const feeding = (file) => {
    const fed = groups.filter((g) => g.sources.some((root) => inside(root, path.join(repoRoot, file))));
    return fed.length ? fed : groups;
  };
  // A source added or removed since the stamp is the build's own when every
  // artifact it feeds is newer than the directory whose entries changed; a
  // change that cannot be dated is not vouched for.
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

// ----------------------------------------------------------------- server ---

const UP_FLAGS = { "--sd": "value", "--project": "value", "--data": "value", "--quality": "value", "--fresh": "flag" };

// Serve the extension detached, so the server outlives this command, on a
// port pinned to the worktree. `--sd` writes a one-file project into the data
// directory and serves it; `--project` serves an existing folder (one with
// assets, say). While a server from this driver is up, `--sd` rewrites the
// file it serves and a page load reads the new content; the folder itself is
// fixed at launch, so a different `--project` needs `down` first.
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

// The options applied to a server that is already answering: `--sd`
// rewrites the file it serves; anything that would need a different server
// is refused, including `--data` against a record that does not say which
// data directory its server uses.
function serveInto(existing, opts, deps) {
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
  // A launch without a commit pin, which is what `--fresh` asks for, deletes
  // the quality's builds directory before it downloads, so it is refused
  // while another worktree's server serves from that directory.
  if (opts["--fresh"]) {
    const users = await sharedBuildUsers(deps.otherWorktreeRecords(), first.builds, deps.recordStands);
    if (users.length) deps.die(`up --fresh would delete ${first.builds}, which ${users.map((u) => `${u.worktree} (pid ${u.pid}, ${u.url})`).join(" and ")} serves from; \`down\` there first, or run \`up\` without --fresh to serve the build already unpacked`);
  }
  const commit = opts["--fresh"] ? null : deps.unpackedCommit(first.builds);
  const plan = launchPlan({ ...base, commit });
  if (plan.error) deps.die(`up: ${plan.error}`);
  // Only a launch with no commit to pin downloads, and only a download can
  // be raced. The data directory is shared by every worktree, so the lock is
  // what makes the order of two first launches stop mattering.
  const lockPath = downloadLockPath(dataLayout(data), quality);
  let holdsLock = false;
  if (!commit) {
    const lock = await deps.takeDownloadLock(lockPath, { worktree: deps.repoRoot, pid: process.pid, url, quality, startedAt: deps.now() });
    if (!lock.held) {
      const other = lock.other;
      // `other` is null when the lock stood for both attempts but its record
      // could not be read back: a file another launch removed between the
      // failed write and the read, or one whose JSON is broken. Nobody is
      // named in that case, so the refusal says the state could not be read
      // rather than inventing a holder to wait for.
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
  // The lock is given back on every path out of the launch that this process
  // survives: `release` in the `finally` for a return or a throw, and
  // `release` before the refusal below, because `die` exits the process and
  // an exit runs no `finally`. A launch killed outright leaves the file
  // behind, and `takeDownloadLock` drops it on the next launch, once the pid
  // in its record is gone.
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
    // The build is unpacked by the time the server answers, and a launch
    // that died holds nothing worth guarding either.
    release();
  }
}

// One line, which clean-worktrees reads to decide whether this worktree's
// server is up (`UP`), launching or stale (`DOWN` with the pid), absent
// (`down`), or unknown, which is what a record that cannot be read leaves:
// the server it named may be running. Returns the exit code, 0 only when the
// recorded URL answers.
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
  if (!(await stands(s))) {
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
  "--hover-image": "flag",
  "--probe": "value",
  "--settle": "number",
  "--headed": "flag",
};

// Opens the file from the explorer, waits for the language server's
// diagnostics to stop changing, reads them, optionally asks for the hover on
// a word, screenshots, prints a JSON report and returns it with the exit
// code: 1 when any step in `failed` could not do what it was asked. Whatever
// throws on the way lands in `failed` too, and the report is printed
// regardless.
export async function verify(args, deps = liveDeps) {
  const { opts, error } = parseFlags(args, VERIFY_FLAGS);
  if (error) deps.die(`verify: ${error}`);
  for (const f of ["--hover-shot", "--hover-image", "--line"]) if (opts[f] && !opts["--hover"]) deps.die(`verify: ${f} needs --hover`);
  const settleBudgetS = opts["--settle"] ?? DEFAULT_SETTLE_S;
  if (settleBudgetS < SETTLE_FLOOR_S) {
    deps.die(`verify: --settle ${settleBudgetS} is below ${SETTLE_FLOOR_S}, the ${SETTLE.minReads} readings (one a second) a file the server finds clean needs before the settle rule can call it settled plus ${READ_ALLOWANCE_S} s to take them; the default is ${DEFAULT_SETTLE_S}`);
  }
  const s = deps.readState();
  if (!s?.url) deps.die("no server URL; run `node .agents/skills/drive-vscode-web/driver.mjs up --sd <file.sd>` first");
  if (!(await deps.recordStands(s))) deps.die(`${deps.stateFile} records pid ${s.pid}, which is not the server it started; \`down\` then \`up\``);
  if (!(await deps.isUp(s.url))) deps.die(`${s.url} does not answer; \`down\` then \`up\``);
  const build = deps.checkBuild();

  const file = opts["--file"] ?? "main.sd";
  const report = { url: s.url, project: s.project, file, build, failed: [] };
  const fail = (msg) => report.failed.push(msg);

  try {
    const { aliased } = deps.aliasWorkbenchCss(s.builds);
    for (const dir of aliased) deps.log(`stylesheet alias written in ${dir}`);
    await deps.withWorkbench(s.url, { headless: !opts["--headed"] }, async ({ page, consoleLines }) => {
      try {
        await page.waitForSelector(".monaco-workbench", { timeout: 120_000 });
        await openFile(page, file, report, fail);

        if (report.opened) {
          // The status bar's problem counter and the editor's squiggles are the
          // language server's output; read them once a second until they hold,
          // with the extension's own marks in the page read alongside, since a
          // counter that never leaves the workbench's value settles only once
          // those show the build ran.
          const readings = [];
          const signalArg = { id: deps.extensionId(), file };
          let signal = null;
          const started = deps.now();
          for (;;) {
            readings.push(await page.evaluate(diagnosticsOnPage));
            signal = await page.evaluate(extensionOnPage, signalArg);
            if (isSettled(readings, undefined, signal) || deps.now() - started >= settleBudgetS * 1000) break;
            await deps.sleep(1000);
          }
          const outcome = diagnosticsOutcome(readings, Math.round((deps.now() - started) / 1000), settleBudgetS, undefined, signal);
          report.settled = outcome.settled;
          report.settledAfterS = outcome.settledAfterS;
          report.diagnostics = outcome.diagnostics;
          report.extension = signal;
          if (outcome.failure) fail(outcome.failure);
        }

        if (opts["--hover"] && report.opened) await hoverOn(page, opts, report, fail, deps);

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
    });
  } catch (err) {
    fail(`verify threw: ${firstLine(err)}`);
  }

  deps.log(JSON.stringify(report, null, 2));
  return { report, exitCode: report.failed.length ? 1 : 0 };
}

// Clicks the explorer row at the top level of the served folder (the rows
// carry their depth as `aria-level`, and the folder's own entries are level
// 1) whose label is exactly `file`, and checks that the editor that opened
// carries that title, so the report never describes a file it was not asked
// about, and never one of the same name in a subfolder.
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
  const title = (await page.locator(".tabs-container .tab.active .label-name").first().textContent({ timeout: 10_000 }).catch(() => null))?.trim() ?? null;
  report.editor = title;
  report.opened = editorOpened(title, file);
  if (!report.opened) fail(`the editor that opened is titled ${JSON.stringify(title)}, not ${file}`);
}

// Puts the cursor on the word and asks for the hover by keyboard: mouse
// movement never opens the widget headlessly, the Show Hover command
// (Ctrl+K Ctrl+I) does. The caret and the status bar are read back after
// the click, so the report says where the hover was asked for and fails
// when that is not inside the word. `--hover-image` makes a hover without
// an image a failure, for a change whose whole point is the image.
async function hoverOn(page, opts, report, fail, deps) {
  const word = opts["--hover"];
  const hit = await page.evaluate(wordOnPage, { word, lineText: opts["--line"], sources: pageSources() });
  if (!hit) {
    fail(`"${word}" is not a whole word on a rendered line${opts["--line"] ? ` containing "${opts["--line"]}"` : ""}; give the whole identifier when the word sits inside a longer one, and keep the line near the top of the file, since only the lines in the viewport are rendered`);
    return;
  }
  await page.mouse.click(hit.x, hit.y);
  await deps.sleep(400);
  const caret = await page.evaluate(caretOnPage);
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
    await deps.sleep(500);
    hover = await page.evaluate(hoverOnPage);
  }
  Object.assign(report.hover, hover);
  if (!hover.present) {
    fail(`no hover opened on "${word}" within 10 s of Ctrl+K Ctrl+I: the extension answers a hover only on an image reference or a word under a diagnostic, so read the report's diagnostics and pick such a word`);
    return;
  }
  if (opts["--hover-image"] && !hover.img) fail(`the hover on "${word}" carries no image (--hover-image)`);
  const broken = hoverImageFailure(hover.img);
  if (broken) fail(broken);
  if (opts["--hover-shot"]) {
    await page.locator("[data-drive-hover]").first().screenshot({ path: opts["--hover-shot"] });
    report.hoverScreenshot = path.resolve(opts["--hover-shot"]);
  }
}

// -------------------------------------------------------------------- cli ---

const runAsCli = process.argv[1] != null && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
const [cmd, ...rest] = runAsCli ? process.argv.slice(2) : ["__imported__"];
switch (cmd) {
  case "__imported__":
    break;
  case "up":
    await up(rest);
    break;
  case "status":
    process.exitCode = await status();
    break;
  case "down":
    await down();
    break;
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
        "  --probe <file.js>    body of an async fn evaluated in the page; result -> JSON",
        `  --settle <seconds>   how long to wait for diagnostics to stop changing (default ${DEFAULT_SETTLE_S}, at least ${SETTLE_FLOOR_S}: ${SETTLE.minReads} readings a second apart plus ${READ_ALLOWANCE_S} s to take them); not settling is a failure`,
        "  --headed             run a visible browser instead of headless",
      ].join("\n"),
    );
}

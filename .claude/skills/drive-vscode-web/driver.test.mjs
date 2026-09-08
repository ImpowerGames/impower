#!/usr/bin/env node
// Pins the decisions in the VS Code web driver that do not need a server or
// a browser: the stylesheet alias the served build needs, the launch plan
// `up` runs (the server's whole argument list and where the served project
// and the log go, relative to the directory the server may delete), the
// commit pin that keeps a download from deleting a build in use, the strays
// `up` removes and the guard on `--fresh`, the port each worktree is pinned
// to, the build rule (which artifacts, which sources, the freshness by time
// and the stamp that accepts a file touched but not changed), the word
// location as the page rebuilds it, the caret and image rules a hover is
// judged by, the settle rule verify waits on and the failure an unsettled
// run reports, and the flag parsing that refuses a bad option before
// anything runs. Run:
//   node .claude/skills/drive-vscode-web/driver.test.mjs
//
// aliasWorkbenchCss, unpackedCommit, strayBuilds, buildRule and
// buildFreshness run on scratch directories laid out like the real ones; the
// rest are pure. Node's built-in assert only.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  PORT_SCAN,
  QUALITIES,
  SOURCE_SKIP,
  aliasWorkbenchCss,
  buildFreshness,
  buildRule,
  cursorAt,
  cursorOnWord,
  dataLayout,
  diagnosticsOutcome,
  editorOpened,
  hoverImageFailure,
  isSettled,
  launchPlan,
  locateWord,
  normalizeMonacoText,
  pageSources,
  parseFlags,
  portBase,
  rebuildPageFunctions,
  sharedBuildUsers,
  sourceFiles,
  stampCovers,
  strayBuilds,
  unpackedCommit,
} from "./driver.mjs";

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

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "drive-vscode-web-"));
const build = (name) => {
  const dir = path.join(scratch, name, "out", "vs", "workbench");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

await check("the alias is written where the build ships only the internal stylesheet, by a copy to a temporary name and a rename into place", () => {
  const dir = build("vscode-web-stable-aaa");
  fs.writeFileSync(path.join(dir, "workbench.web.main.internal.css"), "body{}");
  const calls = [];
  const io = {
    ...fs,
    copyFileSync: (from, to) => {
      calls.push(["copy", from, to]);
      fs.copyFileSync(from, to);
    },
    renameSync: (from, to) => {
      calls.push(["rename", from, to]);
      fs.renameSync(from, to);
    },
  };
  const result = aliasWorkbenchCss(scratch, io);
  assert.deepEqual(result.aliased, [dir]);
  const linked = path.join(dir, "workbench.web.main.css");
  assert.equal(fs.readFileSync(linked, "utf8"), "body{}");
  assert.equal(calls.length, 2, `two file system calls, not ${calls.length}`);
  assert.equal(calls[0][0], "copy");
  assert.notEqual(calls[0][2], linked, "the copy is written straight to the name the page loads");
  assert.deepEqual(calls[1], ["rename", calls[0][2], linked]);
  assert.ok(!fs.existsSync(calls[0][2]), "the temporary copy is renamed away");
});

await check("a build that already has the linked stylesheet at full size is left alone and reported as present", () => {
  const dir = build("vscode-web-stable-bbb");
  fs.writeFileSync(path.join(dir, "workbench.web.main.internal.css"), "internal");
  fs.writeFileSync(path.join(dir, "workbench.web.main.css"), "8 bytes!");
  const result = aliasWorkbenchCss(scratch);
  assert.ok(result.present.includes(dir));
  assert.ok(!result.aliased.includes(dir));
  assert.equal(fs.readFileSync(path.join(dir, "workbench.web.main.css"), "utf8"), "8 bytes!");
});

await check("a truncated alias is written again", () => {
  const dir = build("vscode-web-stable-ddd");
  fs.writeFileSync(path.join(dir, "workbench.web.main.internal.css"), "body{color:red}");
  fs.writeFileSync(path.join(dir, "workbench.web.main.css"), "");
  const result = aliasWorkbenchCss(scratch);
  assert.ok(result.aliased.includes(dir), "a zero-byte copy is not present");
  assert.equal(fs.readFileSync(path.join(dir, "workbench.web.main.css"), "utf8"), "body{color:red}");
});

await check("a second run touches nothing: every build is present, none aliased", () => {
  const result = aliasWorkbenchCss(scratch);
  assert.deepEqual(result.aliased, []);
  assert.equal(result.present.length, 3);
});

await check("a directory laid out like a build but not named as one, and a build still downloading, are skipped", () => {
  const stray = path.join(scratch, "a-served-project", "out", "vs", "workbench");
  fs.mkdirSync(stray, { recursive: true });
  fs.writeFileSync(path.join(stray, "workbench.web.main.internal.css"), "not a build");
  build("vscode-web-stable-ccc"); // unpacked far enough to have the directory, no stylesheet yet
  const result = aliasWorkbenchCss(scratch);
  assert.deepEqual(result.aliased, []);
  assert.equal(result.present.length, 3);
  assert.ok(!fs.existsSync(path.join(stray, "workbench.web.main.css")), "the stray directory got an alias");
});

await check("a data directory that does not exist yet aliases nothing and does not throw", () => {
  const result = aliasWorkbenchCss(path.join(scratch, "missing"));
  assert.deepEqual(result, { aliased: [], present: [] });
});

await check("unpackedCommit reads the commit of a build whose download completed, and nothing else", () => {
  const commit = "a".repeat(40);
  fs.mkdirSync(path.join(scratch, `vscode-web-stable-${"b".repeat(40)}`), { recursive: true }); // no version file: still downloading
  assert.equal(unpackedCommit(scratch), null);
  fs.mkdirSync(path.join(scratch, `vscode-web-stable-${commit}`), { recursive: true });
  fs.writeFileSync(path.join(scratch, `vscode-web-stable-${commit}`, "version"), `vscode-web-stable-${commit}`);
  assert.equal(unpackedCommit(scratch), commit);
  assert.equal(unpackedCommit(path.join(scratch, "missing")), null);
});

await check("strayBuilds lists a build unpacked directly under builds/ and an empty directory no quality owns, and nothing else", () => {
  const root = path.join(scratch, "builds");
  fs.mkdirSync(path.join(root, "stable", "vscode-web-stable-" + "e".repeat(40)), { recursive: true });
  fs.mkdirSync(path.join(root, "insiders"), { recursive: true });
  fs.mkdirSync(path.join(root, "vscode-web-stable-" + "f".repeat(40), "out"), { recursive: true });
  fs.mkdirSync(path.join(root, "bogus"), { recursive: true });
  fs.mkdirSync(path.join(root, "kept-by-hand"), { recursive: true });
  fs.writeFileSync(path.join(root, "kept-by-hand", "note.txt"), "mine");
  fs.writeFileSync(path.join(root, "a-file"), "");
  assert.deepEqual(strayBuilds(root).sort(), [path.join(root, "bogus"), path.join(root, "vscode-web-stable-" + "f".repeat(40))].sort());
  assert.deepEqual(strayBuilds(path.join(scratch, "missing")), []);
});

await check("sharedBuildUsers names the live servers of other worktrees serving from the directory, whatever the path's case", () => {
  const dir = path.join(scratch, "data", "builds", "stable");
  const records = [
    { worktree: "a", pid: 1, builds: dir, url: "u1" },
    { worktree: "b", pid: 2, builds: dir.toUpperCase(), url: "u2" },
    { worktree: "c", pid: 3, builds: path.join(scratch, "data", "builds", "insiders") },
    { worktree: "d", pid: 4, builds: dir },
    { worktree: "e", builds: dir },
    null,
  ];
  const alive = (pid) => pid !== 4;
  assert.deepEqual(sharedBuildUsers(records, dir, alive).map((r) => r.worktree), ["a", "b"]);
  assert.deepEqual(sharedBuildUsers(records, path.join(scratch, "data", "builds"), alive), [], "the parent of a quality directory is not that directory");
});

// --- the build rule, on a scratch tree laid out like the repository --------

const repo = path.join(scratch, "repo");
const ext = path.join(repo, "vscode-sparkdown");
const packages = path.join(repo, "packages");
const T0 = Date.now() - 600_000;
const at = (file, ms, content = "x") => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  fs.utimesSync(file, new Date(ms), new Date(ms));
};
for (const f of ["src/extension.ts", "src/deep/a.ts", "webviews/game-webview/game-webview.ts", "webviews/game-webview/package.json", "webviews/not-an-app/readme.md", "data/cheatsheet.css"]) at(path.join(ext, f), T0 - 5000);
for (const f of ["sparkdown/src/a.ts", "sparkdown-language-server/src/b.ts"]) at(path.join(packages, f), T0 - 5000);
for (const f of ["out/extension.js", "out/workers/sparkdown-language-server.js", "out/workers/sparkdown-screenplay-pdf.js", "out/workers/x.js.map", "out/webviews/game-webview.js", "out/data/cheatsheet.css"]) at(path.join(ext, f), T0);
const ruleOf = () => buildRule(ext, packages);
const filesOf = (root) => sourceFiles([root]);
const staleNames = (groups) => buildFreshness(groups, filesOf).stale.map((g) => path.relative(ext, g.artifact).replaceAll("\\", "/"));

await check("the build rule names every artifact the workbench loads, each with the sources that feed it and the command that rebuilds it", () => {
  const groups = ruleOf();
  const by = Object.fromEntries(groups.map((g) => [path.relative(ext, g.artifact).replaceAll("\\", "/"), g]));
  assert.deepEqual(Object.keys(by).sort(), ["out/data/cheatsheet.css", "out/extension.js", "out/webviews/game-webview.js", "out/workers/sparkdown-language-server.js", "out/workers/sparkdown-screenplay-pdf.js"]);
  const pkgSrc = [path.join(packages, "sparkdown", "src"), path.join(packages, "sparkdown-language-server", "src")];
  assert.deepEqual(by["out/extension.js"].sources, [path.join(ext, "src"), ...pkgSrc]);
  assert.deepEqual(by["out/workers/sparkdown-language-server.js"].sources, pkgSrc);
  assert.deepEqual(by["out/webviews/game-webview.js"].sources, [path.join(ext, "webviews", "game-webview"), ...pkgSrc]);
  assert.deepEqual(by["out/data/cheatsheet.css"].sources, [path.join(ext, "data", "cheatsheet.css")]);
  assert.match(by["out/extension.js"].rebuild, /node scripts\/esbuild\.ts/);
  assert.match(by["out/workers/sparkdown-language-server.js"].rebuild, /npm run build$/);
  assert.match(by["out/webviews/game-webview.js"].rebuild, /npm run build:game-webview/);
  const bare = buildRule(path.join(scratch, "nowhere"), path.join(scratch, "nowhere"));
  assert.deepEqual(bare.map((g) => path.basename(g.artifact)), ["extension.js", "sparkdown-language-server.js"], "the extension bundle and the language server are required even before a first build");
});

await check("every artifact is fresh when no source is newer, and a copied artifact with its source's time to the millisecond is fresh", () => {
  assert.deepEqual(staleNames(ruleOf()), []);
  at(path.join(ext, "data", "cheatsheet.css"), T0);
  assert.deepEqual(staleNames(ruleOf()), []);
  // A copy keeps the source's time to the millisecond and drops what is
  // below it, so the source reads as a fraction of a millisecond newer.
  fs.utimesSync(path.join(ext, "data", "cheatsheet.css"), T0 / 1000 + 0.0009, T0 / 1000 + 0.0009);
  assert.deepEqual(staleNames(ruleOf()), [], "a source a fraction of a millisecond newer than its copy");
  fs.utimesSync(path.join(ext, "data", "cheatsheet.css"), T0 / 1000 + 0.005, T0 / 1000 + 0.005);
  assert.deepEqual(staleNames(ruleOf()), ["out/data/cheatsheet.css"], "a source five milliseconds newer");
  at(path.join(ext, "data", "cheatsheet.css"), T0);
});

await check("a source newer than its artifact makes that artifact stale, and only the artifacts it feeds", () => {
  at(path.join(ext, "webviews", "game-webview", "game-webview.ts"), T0 + 5000);
  assert.deepEqual(staleNames(ruleOf()), ["out/webviews/game-webview.js"]);
  at(path.join(ext, "webviews", "game-webview", "game-webview.ts"), T0 - 5000);
  at(path.join(ext, "src", "deep", "a.ts"), T0 + 5000);
  assert.deepEqual(staleNames(ruleOf()), ["out/extension.js"]);
  at(path.join(ext, "src", "deep", "a.ts"), T0 - 5000);
  at(path.join(packages, "sparkdown-language-server", "src", "b.ts"), T0 + 5000);
  assert.deepEqual(staleNames(ruleOf()).sort(), ["out/extension.js", "out/webviews/game-webview.js", "out/workers/sparkdown-language-server.js", "out/workers/sparkdown-screenplay-pdf.js"], "a package feeds every bundle");
  const { stale } = buildFreshness(ruleOf(), filesOf);
  assert.equal(path.basename(stale[0].source), "b.ts");
  assert.deepEqual(stale[0].newer.map((f) => path.basename(f.path)), ["b.ts"]);
  at(path.join(packages, "sparkdown-language-server", "src", "b.ts"), T0 - 5000);
});

await check("a missing artifact is reported as missing, and a webview directory without a package.json is not an app", () => {
  fs.rmSync(path.join(ext, "out", "webviews", "game-webview.js"));
  const { missing, stale } = buildFreshness(ruleOf(), filesOf);
  assert.deepEqual(missing.map((p) => path.basename(p)), ["game-webview.js"]);
  assert.deepEqual(stale, []);
  at(path.join(ext, "out", "webviews", "game-webview.js"), T0);
});

await check("every directory in the skip list, test files, links and the unreadable are not sources", () => {
  assert.deepEqual(SOURCE_SKIP, ["node_modules", "dist", "out", "__snapshots__", "tests", "__tests__"]);
  const src = path.join(packages, "sparkdown", "src");
  for (const d of SOURCE_SKIP) at(path.join(src, d, "newer.ts"), T0 + 5000);
  at(path.join(src, "deep", "c.test.ts"), T0 + 5000);
  at(path.join(src, "deep", "c.test.snap"), T0 + 5000);
  fs.symlinkSync(path.join(scratch, "nowhere"), path.join(src, "dangling"), "junction");
  fs.symlinkSync(path.join(ext, "webviews"), path.join(src, "linked"), "junction");
  fs.utimesSync(path.join(src, "linked"), new Date(T0 + 5000), new Date(T0 + 5000));
  assert.deepEqual(staleNames(ruleOf()), []);
  assert.deepEqual(sourceFiles([src]).map((f) => path.basename(f.path)).sort(), ["a.ts"]);
  assert.deepEqual(sourceFiles([path.join(src, "absent")]), []);
  for (const d of SOURCE_SKIP) fs.rmSync(path.join(src, d), { recursive: true });
});

await check("the stamp covers a build when the artifacts are the ones stamped and every newer source still has the content stamped", () => {
  const artifacts = { "out/extension.js": { size: 1, mtimeMs: T0 }, "out/workers/x.js": { size: 2, mtimeMs: T0 } };
  const stamp = { artifacts: { ...artifacts }, sources: { "packages/a/src/a.ts": "sha-a", "vscode-sparkdown/src/b.ts": "sha-b" } };
  assert.equal(stampCovers(stamp, artifacts, [{ rel: "packages/a/src/a.ts", sha: "sha-a" }]), true, "a file restored with its stamped content");
  assert.equal(stampCovers(stamp, artifacts, []), true, "the same artifacts, nothing newer");
  assert.equal(stampCovers(stamp, artifacts, [{ rel: "packages/a/src/a.ts", sha: "sha-a2" }]), false, "an edited file");
  assert.equal(stampCovers(stamp, artifacts, [{ rel: "packages/a/src/new.ts", sha: "sha-n" }]), false, "a file the stamp never saw");
  assert.equal(stampCovers(stamp, { ...artifacts, "out/extension.js": { size: 1, mtimeMs: T0 + 1 } }, []), false, "a rebuilt artifact");
  assert.equal(stampCovers(stamp, { "out/extension.js": artifacts["out/extension.js"] }, []), false, "an artifact set of another size");
  assert.equal(stampCovers(null, artifacts, []), false);
  assert.equal(stampCovers({ artifacts }, artifacts, []), false, "a stamp without sources");
});

fs.rmSync(scratch, { recursive: true, force: true });

await check("projects and logs sit beside the builds directory, never inside it", () => {
  const { builds, projects, logs } = dataLayout(path.join("C:", "data"));
  const inside = (p) => path.relative(builds, p).startsWith("..") === false;
  assert.equal(path.dirname(builds), path.join("C:", "data"));
  assert.ok(!inside(projects), `${projects} is inside ${builds}, which the server clears on a new download`);
  assert.ok(!inside(logs), `${logs} is inside ${builds}, which the server clears on a new download`);
});

const planFor = (extra) =>
  launchPlan({ data: path.join("C:", "data"), port: 34123, extDir: path.join("C:", "repo", "vscode-sparkdown"), entry: path.join("C:", "repo", "index.js"), ...extra });
const argOf = (args, flag) => args[args.indexOf(flag) + 1];

await check("the launch plan is the server's whole argument list: no browser, the quality, esm, the port, only the quality's builds directory, the commit when there is one, the extension, the project last", () => {
  const plan = planFor({ sd: "repro.sd", quality: "insiders", commit: "c".repeat(40) });
  assert.equal(plan.error, undefined);
  assert.equal(plan.builds, path.join("C:", "data", "builds", "insiders"));
  assert.deepEqual(plan.args, [
    path.join("C:", "repo", "index.js"),
    "--browser", "none",
    "--quality", "insiders",
    "--esm",
    "--port", "34123",
    "--testRunnerDataDir", plan.builds,
    "--commit", "c".repeat(40),
    "--extensionDevelopmentPath", path.join("C:", "repo", "vscode-sparkdown"),
    plan.project,
  ]);
  const stable = planFor({ sd: "repro.sd" });
  assert.equal(argOf(stable.args, "--quality"), "stable");
  assert.equal(stable.builds, path.join("C:", "data", "builds", "stable"));
  assert.ok(!stable.args.includes("--commit"), "no commit is passed when none is unpacked");
});

await check("the served project and the log are outside the builds directory", () => {
  const plan = planFor({ sd: "repro.sd" });
  const { builds } = dataLayout(path.join("C:", "data"));
  const inside = (p) => !path.relative(builds, p).startsWith("..");
  assert.equal(plan.project, path.join("C:", "data", "projects", "34123"));
  assert.equal(plan.ownProject, true);
  assert.ok(!inside(plan.project), `${plan.project} is inside ${builds}`);
  assert.equal(plan.logPath, path.join("C:", "data", "logs", "serve-34123.log"));
  assert.ok(!inside(plan.logPath), `${plan.logPath} is inside ${builds}`);
});

await check("a folder given with --project is served as is, and one inside the builds directory is refused", () => {
  const plan = planFor({ project: path.join("C:", "work", "game") });
  assert.equal(plan.project, path.join("C:", "work", "game"));
  assert.equal(plan.ownProject, false);
  assert.match(planFor({ project: path.join("C:", "data", "builds", "stable", "game") }).error, /inside .*builds/);
  assert.match(planFor({ project: path.join("C:", "data", "builds") }).error, /inside .*builds/);
});

await check("a quality other than stable or insiders is refused before it names a directory", () => {
  assert.deepEqual(QUALITIES, ["stable", "insiders"]);
  assert.match(planFor({ sd: "a.sd", quality: "..\\..\\evil" }).error, /--quality must be stable or insiders/);
  assert.match(planFor({ sd: "a.sd", quality: "Stable" }).error, /--quality must be stable or insiders/);
  assert.match(planFor({ sd: "a.sd", quality: "bogus" }).error, /not "bogus"/);
});

await check("a plan needs exactly one of --sd and --project", () => {
  assert.match(planFor({}).error, /--sd .* or --project/);
  assert.match(planFor({ sd: "a.sd", project: "b" }).error, /not both/);
});

await check("the port is a fixed number for a path, differs between paths, and its scan stays under the web editor driver's 38000", () => {
  assert.equal(portBase("/x/y"), 34075, "the port for a path must not move between runs");
  assert.equal(portBase("C:\\repo\\impower.worktrees\\fix\\1-a"), portBase("C:\\repo\\impower.worktrees\\fix\\1-a"));
  assert.notEqual(portBase("C:\\repo\\impower.worktrees\\fix\\1-a"), portBase("C:\\repo\\impower.worktrees\\fix\\1-b"));
  for (const p of ["C:\\repo\\impower", "/home/x/impower", "C:\\repo\\impower.worktrees\\fix\\1-a", "".padEnd(300, "z")]) {
    const base = portBase(p);
    assert.ok(base >= 1024 && base + PORT_SCAN < 38000, `${base}..${base + PORT_SCAN} for ${p.slice(0, 30)} reaches the web editor driver's range`);
  }
});

await check("Monaco's non-breaking spaces normalize to the source's spaces", () => {
  assert.equal(normalizeMonacoText("show\u00a0backdrop\u00a0pair"), "show backdrop pair");
  assert.equal(normalizeMonacoText(""), "");
  assert.equal(normalizeMonacoText(undefined), "");
});

const rendered = ["->\u00a0START", "", "scene\u00a0START", "", "\u00a0\u00a0[[show\u00a0backdrop\u00a0missing_backdrop]]", "", "\u00a0\u00a0ALICE:", "\u00a0\u00a0\u00a0\u00a0Hello\u00a0from\u00a0the\u00a0served\u00a0workbench."];

await check("locateWord finds the word's own characters on the first rendered line that holds it as a whole word", () => {
  assert.deepEqual(locateWord(rendered, "Hello"), { index: 7, start: 4, end: 9 });
  assert.deepEqual(locateWord(rendered, "workbench"), { index: 7, start: 26, end: 35 });
  assert.deepEqual(locateWord(rendered, "START"), { index: 0, start: 3, end: 8 });
  assert.deepEqual(locateWord(rendered, "missing_backdrop"), { index: 4, start: 18, end: 34 });
});

await check("a word inside a longer identifier is not that identifier", () => {
  assert.equal(locateWord(rendered, "missing"), null);
  assert.equal(locateWord(rendered, "backdrop]]"), null);
  assert.deepEqual(locateWord(rendered, "[[show"), { index: 4, start: 2, end: 8 });
  assert.deepEqual(locateWord(rendered, "backdrop"), { index: 4, start: 9, end: 17 });
});

await check("a word that begins or ends with punctuation is bounded on that side by itself, even against an identifier character", () => {
  assert.deepEqual(locateWord(rendered, "]]"), { index: 4, start: 34, end: 36 }, "]] follows the p of missing_backdrop");
  assert.deepEqual(locateWord(rendered, "[["), { index: 4, start: 2, end: 4 }, "[[ precedes the s of show");
  assert.deepEqual(locateWord(rendered, "ALICE:"), { index: 6, start: 2, end: 8 });
});

await check("--line restricts the search to lines containing the text, matched across Monaco's spaces", () => {
  assert.deepEqual(locateWord(rendered, "START", "scene START"), { index: 2, start: 6, end: 11 });
  assert.equal(locateWord(rendered, "START", "no such line"), null);
  assert.equal(locateWord([], "START"), null);
});

await check("the page rebuilds locateWord from its source the way findWord does, and the rebuilt function answers as the module's does", () => {
  const sources = pageSources();
  assert.deepEqual(Object.keys(sources).sort(), ["locateSrc", "normSrc", "rebuildSrc"]);
  // The same expression findWord evaluates in the page: the rebuild helper
  // itself comes in by source, then rebuilds the two functions.
  const { locateWord: inPage, normalizeMonacoText: normInPage } = new Function(`return ${sources.rebuildSrc}`)()(sources);
  assert.notEqual(inPage, locateWord);
  assert.equal(normInPage("a\u00a0b"), "a b");
  for (const [word, line] of [["Hello", undefined], ["missing", undefined], ["]]", undefined], ["START", "scene START"], ["[[show", undefined]]) {
    assert.deepEqual(inPage(rendered, word, line), locateWord(rendered, word, line), `rebuilt locateWord differs on ${word}`);
  }
  assert.deepEqual(rebuildPageFunctions(sources).locateWord(rendered, "workbench"), { index: 7, start: 26, end: 35 });
});

await check("cursorAt reads the status bar's selection item", () => {
  assert.deepEqual(cursorAt("Ln 8, Col 5"), { line: 8, col: 5 });
  assert.deepEqual(cursorAt("Ln 12, Col 3 (5 selected)"), { line: 12, col: 3 });
  assert.equal(cursorAt(null), null);
  assert.equal(cursorAt("UTF-8"), null);
});

await check("the caret is on the word when it is on the word's line and between the word's pixel edges, whatever column the status bar counts", () => {
  const hit = { line: 7, col: 5, left: 451, right: 495, charWidth: 8.8 };
  assert.equal(cursorOnWord(hit, "Ln 7, Col 5", 451), null);
  assert.equal(cursorOnWord(hit, "Ln 7, Col 5", 449.6), null, "the caret's centre rounds to a pixel or two before the first character");
  assert.equal(cursorOnWord(hit, "Ln 7, Col 2", 451), null, "a tab-indented line: the model column is 2, the caret is on the word");
  assert.equal(cursorOnWord(hit, "Ln 7, Col 9", 486.2), null, "the boundary before the last character");
  assert.match(cursorOnWord(hit, "Ln 7, Col 10", 495), /outside the word's 451\.\.495/, "the boundary after the last character");
  assert.match(cursorOnWord(hit, "Ln 7, Col 4", 442.2), /outside/, "the boundary before the first character");
  assert.match(cursorOnWord({ line: 7, left: 451, right: 495 }, "Ln 7, Col 4", 449), /outside/, "without a character width the slack is a pixel");
  assert.match(cursorOnWord(hit, "Ln 8, Col 5", 451), /line 8, not line 7/);
  assert.match(cursorOnWord(hit, null, 451), /no cursor position/);
  assert.match(cursorOnWord(hit, "Ln 7, Col 5", null), /no caret/);
  assert.equal(cursorOnWord({ ...hit, line: null }, "Ln 3, Col 5", 451), null, "a line with no gutter number is judged by the caret alone");
});

await check("opened is true only for the editor titled exactly as the file", () => {
  assert.equal(editorOpened("main.sd", "main.sd"), true);
  assert.equal(editorOpened("a_main.sd", "main.sd"), false);
  assert.equal(editorOpened("MAIN.SD", "main.sd"), false);
  assert.equal(editorOpened(null, "main.sd"), false);
});

await check("a hover image counts as loaded only with a src, complete, and a natural size", () => {
  assert.equal(hoverImageFailure(null), null, "a hover without an image has no image failure");
  assert.equal(hoverImageFailure({ hasSrc: true, complete: true, naturalWidth: 96, naturalHeight: 180 }), null);
  assert.match(hoverImageFailure({ hasSrc: true, complete: true, naturalWidth: 0, naturalHeight: 0 }), /failed to load: natural size 0 x 0/);
  assert.match(hoverImageFailure({ hasSrc: true, complete: false, naturalWidth: 0, naturalHeight: 0 }), /not finished loading/);
  assert.match(hoverImageFailure({ hasSrc: false, complete: true, naturalWidth: 0, naturalHeight: 0 }), /no src/);
});

const reading = (problems) => ({ problems, squiggles: { error: 0, warning: 0, info: 0 } });
const same = (n, problems = "0 0") => Array(n).fill(reading(problems));

await check("readings that never change settle only after the floor", () => {
  assert.equal(isSettled(same(7)), false);
  assert.equal(isSettled(same(8)), false, "eight identical readings are the workbench before the server");
  assert.equal(isSettled(same(24)), false);
  assert.equal(isSettled(same(25)), true);
});

await check("readings that change and then hold settle as soon as they have held", () => {
  const series = [...same(3), ...same(8, "0 2")];
  assert.equal(isSettled(series), true);
  assert.equal(isSettled(series.slice(0, -1)), false, "seven held readings are not eight");
});

await check("a reading taken before the status bar's problems item exists is not a change", () => {
  assert.equal(isSettled([reading(null), ...same(8)]), false, "null then eight of the workbench's own value is the workbench before the server");
  assert.equal(isSettled([reading(null), reading(null), ...same(8)]), false);
  assert.equal(isSettled([reading(null), ...same(24)]), false);
  assert.equal(isSettled([reading(null), ...same(25)]), true);
  assert.equal(isSettled([reading(null), ...same(2), ...same(8, "0 2")]), true);
  assert.equal(isSettled(Array(30).fill(reading(null))), false, "a status bar that never appears never settles");
});

await check("a change inside the tail is not settled", () => {
  const series = [...same(20, "a"), ...same(4, "b"), ...same(4, "c")];
  assert.equal(isSettled(series), false);
});

await check("the settle thresholds are parameters", () => {
  assert.equal(isSettled(same(3, "a"), { stableReads: 3, minReads: 3 }), true);
  assert.equal(isSettled([reading("a"), reading("b"), reading("b")], { stableReads: 2, minReads: 10 }), true);
});

await check("an unsettled run reports the last reading and a failure; a settled one reports no failure", () => {
  const settled = diagnosticsOutcome([...same(3), ...same(8, "0 2")], 11, 60);
  assert.equal(settled.settled, true);
  assert.equal(settled.failure, null);
  assert.deepEqual(settled.diagnostics, reading("0 2"));
  assert.equal(settled.settledAfterS, 11);
  const cut = diagnosticsOutcome(same(1), 0, 0);
  assert.equal(cut.settled, false);
  assert.match(cut.failure, /had not settled after 0 s \(--settle 0\)/);
  assert.deepEqual(cut.diagnostics, reading("0 0"));
  assert.match(diagnosticsOutcome(same(9, "0 2"), 60, 60).failure, /had not settled after 60 s/, "the floor for a file that never changes is not met");
  assert.equal(diagnosticsOutcome([], 0, 0).diagnostics, null);
});

const spec = { "--sd": "value", "--settle": "number", "--headed": "flag" };

await check("flags parse into values, numbers and booleans", () => {
  assert.deepEqual(parseFlags(["--sd", "repro.sd", "--headed", "--settle", "0"], spec), { opts: { "--sd": "repro.sd", "--headed": true, "--settle": 0 } });
  assert.deepEqual(parseFlags([], spec), { opts: {} });
});

await check("an unknown flag is refused by name, including one that names an Object property", () => {
  assert.deepEqual(parseFlags(["--shot"], spec), { error: "unknown option --shot" });
  assert.deepEqual(parseFlags(["constructor"], spec), { error: "unknown option constructor" });
});

await check("a value flag with nothing usable after it is refused: the end, an empty string, or another flag", () => {
  assert.deepEqual(parseFlags(["--sd"], spec), { error: "--sd needs a value" });
  assert.deepEqual(parseFlags(["--sd", ""], spec), { error: "--sd needs a value" });
  assert.deepEqual(parseFlags(["--sd", "--headed"], spec), { error: "--sd needs a value" });
});

await check("a value that only looks like a flag is a value", () => {
  assert.deepEqual(parseFlags(["--sd", "-- a Luau comment"], spec), { opts: { "--sd": "-- a Luau comment" } });
  assert.deepEqual(parseFlags(["--sd", "--typo"], spec), { opts: { "--sd": "--typo" } });
  assert.deepEqual(parseFlags(["--sd", "constructor"], spec), { opts: { "--sd": "constructor" } });
});

await check("a number flag takes digits with an optional fraction and refuses everything else", () => {
  assert.deepEqual(parseFlags(["--settle", "12.5"], spec), { opts: { "--settle": 12.5 } });
  assert.deepEqual(parseFlags(["--settle", "60"], spec), { opts: { "--settle": 60 } });
  for (const bad of ["60s", "-1", "abc", " ", "0x10", "+3", "5.", "\n7", "Infinity", "1_0", "1e3"]) {
    assert.deepEqual(parseFlags(["--settle", bad], spec), { error: `--settle needs a number of seconds, not ${JSON.stringify(bad)}` }, `accepted ${JSON.stringify(bad)}`);
  }
});

if (failures) {
  console.log(`${failures} failing`);
  process.exit(1);
}
console.log("All drive-vscode-web driver assertions passed.");

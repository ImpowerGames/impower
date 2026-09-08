#!/usr/bin/env node
// Pins the decisions in the VS Code web driver that do not need a server or
// a browser: the stylesheet alias the served build needs, the launch plan
// `up` runs (the server's whole argument list and where the served project
// and the log go, relative to the directory the server may delete), the
// commit pin that keeps a download from deleting a build in use, the guard
// on `--fresh`, the port each worktree is pinned to, the build rule (which
// artifacts, which sources, the freshness by time, the stamp that accepts a
// file touched but not changed and refuses a source set that is not the one
// stamped, and the steps a refusal names), the word location as the page
// rebuilds it, the caret and image rules a hover is judged by, the settle
// rule verify waits on and the failure an unsettled run reports, and the
// flag parsing that refuses a bad option before anything runs. `up`,
// `checkBuild` and `verify` themselves run in-process against stubbed
// dependencies and a scripted document, so what each refuses and what it
// calls is pinned, not only the helpers it could have called. Run:
//   node .claude/skills/drive-vscode-web/driver.test.mjs
//
// aliasWorkbenchCss, unpackedCommit, buildRule, buildFreshness and
// checkBuild run on scratch directories laid out like the real ones; the
// rest are pure or stubbed. Node's built-in assert only.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_SETTLE_S,
  PORT_SCAN,
  QUALITIES,
  REBUILD_STEPS,
  SETTLE,
  SETTLE_FLOOR_S,
  SOURCE_SKIP,
  STAMP_NAME,
  aliasWorkbenchCss,
  buildFreshness,
  buildRule,
  caretOnPage,
  checkBuild,
  cursorAt,
  cursorOnWord,
  dataLayout,
  diagnosticsOnPage,
  diagnosticsOutcome,
  editorOpened,
  hoverImageFailure,
  hoverOnPage,
  isSettled,
  launchPlan,
  locateWord,
  normalizeMonacoText,
  pageSources,
  parseFlags,
  portBase,
  rebuildCommand,
  rebuildPageFunctions,
  settleState,
  sharedBuildUsers,
  sourceFiles,
  stampGap,
  unpackedCommit,
  up,
  usableReading,
  verify,
  wordOnPage,
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

// What `deps.die` does in the checks: the refusal is an exception, so a
// command that refuses is one that rejects with a Refusal, and one that
// went on to spawn or open a browser is one that did not.
class Refusal extends Error {}
const refuses = (promise, re) =>
  assert.rejects(promise, (err) => {
    assert.ok(err instanceof Refusal, `not a refusal: ${err.stack}`);
    assert.match(err.message, re);
    return true;
  });

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

await check("sharedBuildUsers names the other worktrees' records that still stand and serve from the directory, whatever the path's case", async () => {
  const dir = path.join(scratch, "data", "builds", "stable");
  const records = [
    { worktree: "a", pid: 1, builds: dir, url: "u1" },
    { worktree: "b", pid: 2, builds: dir.toUpperCase(), url: "u2" },
    { worktree: "c", pid: 3, builds: path.join(scratch, "data", "builds", "insiders") },
    { worktree: "d", pid: 4, builds: dir },
    { worktree: "e", builds: dir },
    null,
  ];
  const asked = [];
  const stands = async (r) => {
    asked.push(r.worktree);
    return r.pid !== 4;
  };
  assert.deepEqual((await sharedBuildUsers(records, dir, stands)).map((r) => r.worktree), ["a", "b"]);
  assert.deepEqual(asked, ["a", "b", "d"], "only a record with a pid on the directory is asked whether it stands");
  assert.deepEqual(await sharedBuildUsers(records, path.join(scratch, "data", "builds"), stands), [], "the parent of a quality directory is not that directory");
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
const touch = (file, ms) => fs.utimesSync(file, new Date(ms), new Date(ms));
for (const f of ["src/extension.ts", "src/deep/a.ts", "language/sparkdown.language-config.json", "webviews/game-webview/game-webview.ts", "webviews/game-webview/package.json", "data/cheatsheet.css", "data/fonts/a.ttf"]) at(path.join(ext, f), T0 - 5000);
for (const f of ["sparkdown/src/a.ts", "sparkdown/language/sparkdown.language-grammar.json", "sparkdown-language-server/src/b.ts", "no-src/package.json"]) at(path.join(packages, f), T0 - 5000);
for (const f of ["out/extension.js", "out/workers/sparkdown-language-server.js", "out/workers/sparkdown-screenplay-pdf.js", "out/workers/x.js.map", "out/webviews/game-webview.js", "out/data/cheatsheet.css"]) at(path.join(ext, f), T0);
const ruleOf = () => buildRule(ext, packages);
const filesOf = (root) => sourceFiles([root]);
const relOf = (g) => path.relative(ext, g.artifact).replaceAll("\\", "/");
const staleNames = (groups) => buildFreshness(groups, filesOf).stale.map(relOf);
const pkgSrc = [path.join(packages, "sparkdown", "src"), path.join(packages, "sparkdown-language-server", "src")];
const pkgLang = [path.join(packages, "sparkdown", "language")];
const [LS_BUILD, SELF] = REBUILD_STEPS;

await check("the build rule names what an open editor loads, each with the sources that feed it and the steps that rebuild it, and nothing the driver cannot show", () => {
  const groups = ruleOf();
  const by = Object.fromEntries(groups.map((g) => [relOf(g), g]));
  assert.deepEqual(Object.keys(by).sort(), ["out/data/cheatsheet.css", "out/extension.js", "out/workers/sparkdown-language-server.js"], "the webview bundles, the other workers and a subdirectory of data/ are not artifacts");
  assert.deepEqual(by["out/extension.js"].sources, [path.join(ext, "src"), path.join(ext, "language"), ...pkgSrc, ...pkgLang]);
  assert.deepEqual(by["out/workers/sparkdown-language-server.js"].sources, [...pkgSrc, ...pkgLang]);
  assert.deepEqual(by["out/data/cheatsheet.css"].sources, [path.join(ext, "data", "cheatsheet.css")]);
  assert.deepEqual(by["out/extension.js"].steps, [SELF]);
  assert.deepEqual(by["out/workers/sparkdown-language-server.js"].steps, [LS_BUILD, SELF]);
  assert.deepEqual(by["out/data/cheatsheet.css"].steps, [SELF]);
  assert.deepEqual(REBUILD_STEPS, ["npm run build:sparkdown-language-server", "node scripts/esbuild.ts"]);
  const bare = buildRule(path.join(scratch, "nowhere"), packages);
  assert.deepEqual(bare.map((g) => path.basename(g.artifact)), ["extension.js", "sparkdown-language-server.js"], "the extension bundle and the language server are required even before a first build");
  assert.throws(() => buildRule(ext, path.join(scratch, "nowhere")), /holds no package with a src directory/, "a packages directory with no package source is refused rather than guarded by nothing");
});

await check("the rebuild command runs the steps of the artifacts named, each once, the language server's build before the extension's script", () => {
  const by = Object.fromEntries(ruleOf().map((g) => [relOf(g), g]));
  assert.equal(rebuildCommand([by["out/extension.js"]]), `cd vscode-sparkdown && ${SELF}`);
  assert.equal(rebuildCommand([by["out/data/cheatsheet.css"], by["out/extension.js"]]), `cd vscode-sparkdown && ${SELF}`);
  assert.equal(rebuildCommand([by["out/extension.js"], by["out/workers/sparkdown-language-server.js"]]), `cd vscode-sparkdown && ${LS_BUILD} && ${SELF}`);
  assert.equal(rebuildCommand([by["out/workers/sparkdown-language-server.js"]]), `cd vscode-sparkdown && ${LS_BUILD} && ${SELF}`);
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
  at(path.join(ext, "src", "deep", "a.ts"), T0 + 5000);
  assert.deepEqual(staleNames(ruleOf()), ["out/extension.js"]);
  at(path.join(ext, "src", "deep", "a.ts"), T0 - 5000);
  at(path.join(ext, "language", "sparkdown.language-config.json"), T0 + 5000);
  assert.deepEqual(staleNames(ruleOf()), ["out/extension.js"], "the extension's language configuration is bundled into the extension");
  at(path.join(ext, "language", "sparkdown.language-config.json"), T0 - 5000);
  at(path.join(packages, "sparkdown-language-server", "src", "b.ts"), T0 + 5000);
  assert.deepEqual(staleNames(ruleOf()).sort(), ["out/extension.js", "out/workers/sparkdown-language-server.js"], "a package feeds both bundles");
  const { stale } = buildFreshness(ruleOf(), filesOf);
  assert.equal(path.basename(stale[0].source), "b.ts");
  assert.deepEqual(stale[0].newer.map((f) => path.basename(f.path)), ["b.ts"]);
  at(path.join(packages, "sparkdown-language-server", "src", "b.ts"), T0 - 5000);
  at(path.join(packages, "sparkdown", "language", "sparkdown.language-grammar.json"), T0 + 5000);
  assert.deepEqual(staleNames(ruleOf()).sort(), ["out/extension.js", "out/workers/sparkdown-language-server.js"], "a regenerated grammar is bundled into both");
  at(path.join(packages, "sparkdown", "language", "sparkdown.language-grammar.json"), T0 - 5000);
  at(path.join(ext, "webviews", "game-webview", "game-webview.ts"), T0 + 5000);
  assert.deepEqual(staleNames(ruleOf()), [], "a webview source feeds nothing the driver shows");
  at(path.join(ext, "webviews", "game-webview", "game-webview.ts"), T0 - 5000);
});

await check("a missing artifact is reported as missing", () => {
  fs.rmSync(path.join(ext, "out", "data", "cheatsheet.css"));
  const { missing, stale } = buildFreshness(ruleOf(), filesOf);
  assert.deepEqual(missing.map((p) => path.basename(p)), ["cheatsheet.css"]);
  assert.deepEqual(stale, []);
  at(path.join(ext, "out", "data", "cheatsheet.css"), T0);
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

await check("the stamp covers a build when the artifacts, the source set and the content of every newer source are the ones stamped", () => {
  const artifacts = { "out/extension.js": { size: 1, mtimeMs: T0 }, "out/workers/x.js": { size: 2, mtimeMs: T0 } };
  const sources = ["packages/a/src/a.ts", "vscode-sparkdown/src/b.ts"];
  const stamp = { artifacts: { ...artifacts }, sources: { "packages/a/src/a.ts": "sha-a", "vscode-sparkdown/src/b.ts": "sha-b" } };
  assert.equal(stampGap(stamp, artifacts, sources, [{ rel: "packages/a/src/a.ts", sha: "sha-a" }]), null, "a file restored with its stamped content");
  assert.equal(stampGap(stamp, artifacts, sources, []), null, "the same artifacts, nothing newer");
  assert.deepEqual(stampGap(stamp, artifacts, sources, [{ rel: "packages/a/src/a.ts", sha: "sha-a2" }]), { kind: "changed", files: ["packages/a/src/a.ts"] }, "an edited file");
  assert.deepEqual(stampGap(stamp, artifacts, [...sources, "packages/a/src/new.ts"], [{ rel: "packages/a/src/new.ts", sha: "sha-n" }]), { kind: "added", files: ["packages/a/src/new.ts"] }, "a file the stamp never saw");
  assert.deepEqual(stampGap(stamp, artifacts, [...sources, "packages/a/src/old.ts"], []), { kind: "added", files: ["packages/a/src/old.ts"] }, "a file added with an old modification time");
  assert.deepEqual(stampGap(stamp, artifacts, ["vscode-sparkdown/src/b.ts"], []), { kind: "removed", files: ["packages/a/src/a.ts"] }, "a deleted file leaves nothing newer and is still a gap");
  assert.deepEqual(stampGap(stamp, { ...artifacts, "out/extension.js": { size: 1, mtimeMs: T0 + 1 } }, sources, []), { kind: "artifacts" }, "a rebuilt artifact");
  assert.deepEqual(stampGap(stamp, { "out/extension.js": artifacts["out/extension.js"] }, sources, []), { kind: "artifacts" }, "an artifact set of another size");
  assert.deepEqual(stampGap(null, artifacts, sources, []), { kind: "artifacts" });
  assert.deepEqual(stampGap({ artifacts }, artifacts, sources, []), { kind: "artifacts" }, "a stamp without sources");
});

// checkBuild on the scratch tree: `die` throws, so a refusal is a rejection
// and the message is what a session reads.
const buildDeps = { repoRoot: repo, extDir: ext, packagesDir: packages, die: (m) => { throw new Refusal(m); } };
const stampFile = path.join(ext, "out", STAMP_NAME);
const refusesBuild = (re) => assert.throws(() => checkBuild(buildDeps), (err) => err instanceof Refusal && re.test(err.message), `no refusal matching ${re}`);
const relFile = (p) => path.relative(repo, p).replaceAll("\\", "/");

await check("checkBuild accepts a fresh build, writes the stamp, and reports the oldest artifact", () => {
  fs.rmSync(stampFile, { force: true });
  touch(path.join(ext, "out", "extension.js"), T0 - 1000);
  const build = checkBuild(buildDeps);
  assert.deepEqual(build, { artifacts: 3, oldest: "vscode-sparkdown/out/extension.js", builtAt: new Date(T0 - 1000).toISOString() });
  const stamp = JSON.parse(fs.readFileSync(stampFile, "utf8"));
  assert.deepEqual(Object.keys(stamp.artifacts).sort(), ["vscode-sparkdown/out/data/cheatsheet.css", "vscode-sparkdown/out/extension.js", "vscode-sparkdown/out/workers/sparkdown-language-server.js"]);
  assert.deepEqual(Object.keys(stamp.sources).sort(), [
    "packages/sparkdown-language-server/src/b.ts",
    "packages/sparkdown/language/sparkdown.language-grammar.json",
    "packages/sparkdown/src/a.ts",
    "vscode-sparkdown/data/cheatsheet.css",
    "vscode-sparkdown/language/sparkdown.language-config.json",
    "vscode-sparkdown/src/deep/a.ts",
    "vscode-sparkdown/src/extension.ts",
  ]);
});

await check("checkBuild accepts a source touched but not changed, and refuses one edited, naming the artifact, the source and the steps", () => {
  const a = path.join(packages, "sparkdown", "src", "a.ts");
  touch(a, T0 + 5000);
  assert.equal(checkBuild(buildDeps).artifacts, 3, "a touched file with the stamped content");
  fs.writeFileSync(a, "edited");
  touch(a, T0 + 6000);
  refusesBuild(new RegExp(`vscode-sparkdown/out/extension.js \\(built .*\\) is older than packages/sparkdown/src/a.ts \\(.*\\), and 1 more artifact is older than a source; rebuild so the served workbench runs the change: cd vscode-sparkdown && ${LS_BUILD} && ${SELF}`));
  at(a, T0 - 5000);
  assert.equal(checkBuild(buildDeps).artifacts, 3);
});

await check("checkBuild refuses a build whose source set is not the one stamped: a source deleted, or one added with an old time", () => {
  const a = path.join(packages, "sparkdown", "src", "a.ts");
  fs.rmSync(a);
  refusesBuild(new RegExp(`^packages/sparkdown/src/a.ts was removed after the build was stamped, so the served workbench would run a build made from other sources; rebuild: cd vscode-sparkdown && ${LS_BUILD} && ${SELF}$`));
  at(a, T0 - 5000);
  const extra = path.join(ext, "src", "late.ts");
  at(extra, T0 - 5000);
  refusesBuild(new RegExp(`^vscode-sparkdown/src/late.ts was added after the build was stamped, .*; rebuild: cd vscode-sparkdown && ${SELF}$`));
  fs.rmSync(extra);
  assert.equal(checkBuild(buildDeps).artifacts, 3);
});

await check("checkBuild refuses a regenerated grammar that the bundles took in by value", () => {
  const grammar = path.join(packages, "sparkdown", "language", "sparkdown.language-grammar.json");
  fs.writeFileSync(grammar, "{}");
  touch(grammar, T0 + 5000);
  refusesBuild(new RegExp(`is older than packages/sparkdown/language/sparkdown.language-grammar.json .*cd vscode-sparkdown && ${LS_BUILD} && ${SELF}`));
  at(grammar, T0 - 5000);
});

await check("checkBuild writes a new stamp after a rebuild, refuses a missing artifact with the steps that make it, and refuses a tree with no packages", () => {
  for (const f of ["out/extension.js", "out/workers/sparkdown-language-server.js", "out/data/cheatsheet.css"]) at(path.join(ext, f), T0 + 10_000, "rebuilt");
  const before = fs.readFileSync(stampFile, "utf8");
  assert.equal(checkBuild(buildDeps).builtAt, new Date(T0 + 10_000).toISOString());
  assert.notEqual(fs.readFileSync(stampFile, "utf8"), before, "the stamp describes the rebuilt artifacts");
  fs.rmSync(path.join(ext, "out", "workers", "sparkdown-language-server.js"));
  refusesBuild(new RegExp(`^vscode-sparkdown/out/workers/sparkdown-language-server.js is missing; build the extension first: cd vscode-sparkdown && ${LS_BUILD} && ${SELF}$`));
  at(path.join(ext, "out", "workers", "sparkdown-language-server.js"), T0 + 10_000, "rebuilt");
  assert.throws(() => checkBuild({ ...buildDeps, packagesDir: path.join(scratch, "nowhere") }), (err) => err instanceof Refusal && /holds no package with a src directory/.test(err.message));
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

// --- up, in-process against stubs -----------------------------------------

const ENTRY = path.join("C:", "repo", "node_modules", "@vscode", "test-web", "out", "server", "index.js");
const EXT = path.join("C:", "repo", "vscode-sparkdown");
const DATA = path.join("C:", "data");
const upDeps = (over = {}) => {
  const calls = [];
  const deps = {
    calls,
    state: null,
    log: (m) => calls.push(["log", m]),
    die: (m) => {
      throw new Refusal(m);
    },
    sleep: async () => {},
    now: () => 1000,
    repoRoot: path.join("C:", "repo"),
    extDir: EXT,
    packagesDir: path.join("C:", "repo", "packages"),
    serverEntry: ENTRY,
    defaultDataDir: DATA,
    stateFile: path.join("C:", "repo", ".claude", "skills", "drive-vscode-web", ".state.json"),
    readState: () => deps.state,
    writeState: (r) => {
      deps.state = r;
      calls.push(["writeState", r]);
    },
    removeState: () => {
      deps.state = null;
      calls.push(["removeState"]);
    },
    stateUnreadable: () => false,
    recordStands: async (r) => r.pid === 1,
    isUp: async () => true,
    pidAlive: (pid) => pid === 1 || pid === 99,
    isFile: (p) => p.endsWith(".sd"),
    isDir: (p) => p.endsWith("folder"),
    exists: (p) => p === ENTRY,
    readFile: () => "",
    mkdirp: (p) => calls.push(["mkdirp", p]),
    checkBuild: () => {
      calls.push(["checkBuild"]);
      return { artifacts: 3, oldest: "o", builtAt: "t" };
    },
    pickPort: async () => 34123,
    otherWorktreeRecords: () => [],
    unpackedCommit: () => "c".repeat(40),
    writeProjectSd: (project, sd) => {
      calls.push(["writeProjectSd", project, sd]);
      return 5;
    },
    spawnServer: (plan) => {
      calls.push(["spawn", plan]);
      return 99;
    },
    waitReady: async (url, builds) => {
      calls.push(["waitReady", url, builds]);
      return true;
    },
    aliasWorkbenchCss: () => ({ aliased: [] }),
    withWorkbench: async () => {
      throw new Error("the check has no browser");
    },
    ...over,
  };
  return deps;
};
const names = (deps) => deps.calls.map((c) => c[0]);
const spawned = (deps) => deps.calls.filter((c) => c[0] === "spawn").map((c) => c[1]);

await check("up checks the build, then spawns exactly the launch plan for the unpacked commit, writes the project file and the record, and waits on the pid", async () => {
  const deps = upDeps();
  await up(["--sd", "repro.sd"], deps);
  const expected = launchPlan({ data: DATA, port: 34123, quality: "stable", sd: "repro.sd", extDir: EXT, entry: ENTRY, commit: "c".repeat(40) });
  assert.deepEqual(names(deps), ["removeState", "checkBuild", "writeProjectSd", "mkdirp", "mkdirp", "spawn", "writeState", "log", "waitReady"], "a record that does not stand goes first, then the build is checked before anything is written");
  assert.deepEqual(spawned(deps)[0].args, expected.args);
  assert.deepEqual(deps.calls[2], ["writeProjectSd", expected.project, "repro.sd"]);
  assert.deepEqual(deps.calls.slice(3, 5), [["mkdirp", expected.builds], ["mkdirp", path.dirname(expected.logPath)]]);
  assert.deepEqual(deps.state, { url: "http://localhost:34123", pid: 99, port: 34123, data: DATA, builds: expected.builds, project: expected.project, ownProject: true, quality: "stable", commit: "c".repeat(40), log: expected.logPath, startedAt: 1000 });
  assert.deepEqual(deps.calls.at(-1), ["waitReady", "http://localhost:34123", expected.builds]);
});

await check("up refuses a bad option, a --sd that is not a file, a --project that is not a directory, both at once, and a bad quality, before the build is checked", async () => {
  for (const [args, re] of [
    [["--bogus"], /^up: unknown option --bogus$/],
    [["--sd", "notes.txt"], /^up: --sd .*notes\.txt is not a file$/],
    [["--project", "a.sd"], /^up: --project .*a\.sd is not a directory$/],
    [["--sd", "a.sd", "--project", "folder"], /^up: give --sd or --project, not both$/],
    [["--sd", "a.sd", "--quality", "bogus"], /^up: --quality must be stable or insiders, not "bogus"$/],
    [[], /^up: give --sd <file\.sd>/],
  ]) {
    const deps = upDeps();
    await refuses(up(args, deps), re);
    assert.ok(!names(deps).includes("spawn"), `${args.join(" ")} spawned a server`);
    assert.ok(!names(deps).includes("checkBuild") || args.length === 0, `${args.join(" ")} checked the build before refusing`);
  }
});

await check("a stale build, or a missing server entry, ends up before anything is spawned", async () => {
  const stale = upDeps({
    checkBuild: () => {
      throw new Refusal("vscode-sparkdown/out/extension.js (built t) is older than packages/sparkdown/src/a.ts (t2); rebuild so the served workbench runs the change: cd vscode-sparkdown && node scripts/esbuild.ts");
    },
  });
  await refuses(up(["--sd", "repro.sd"], stale), /is older than packages\/sparkdown\/src\/a\.ts/);
  assert.deepEqual(names(stale), ["removeState"], "something was written or spawned after the build refused");
  const noEntry = upDeps({ exists: () => false });
  await refuses(up(["--sd", "repro.sd"], noEntry), /index\.js is missing; run PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install/);
  assert.deepEqual(names(noEntry), ["removeState"]);
});

await check("up --fresh is refused while another worktree's standing record serves from the quality's directory, and otherwise launches without a commit pin", async () => {
  const builds = path.join(DATA, "builds", "stable");
  const other = { worktree: path.join("C:", "w2"), pid: 1, builds, url: "http://localhost:7" };
  const deps = upDeps({ otherWorktreeRecords: () => [other] });
  await refuses(up(["--sd", "repro.sd", "--fresh"], deps), /^up --fresh would delete .*builds.stable, which C:.w2 \(pid 1, http:\/\/localhost:7\) serves from; `down` there first$/);
  assert.ok(!names(deps).includes("spawn"));
  const gone = upDeps({ otherWorktreeRecords: () => [{ ...other, pid: 2 }] });
  await up(["--sd", "repro.sd", "--fresh"], gone);
  assert.ok(!spawned(gone)[0].args.includes("--commit"), "a fresh launch downloads rather than pinning the unpacked build");
  assert.equal(gone.state.commit, null);
  const insiders = upDeps({ otherWorktreeRecords: () => [other] });
  await up(["--sd", "repro.sd", "--fresh", "--quality", "insiders"], insiders);
  assert.equal(argOf(spawned(insiders)[0].args, "--quality"), "insiders", "a record on the other quality's directory does not block");
});

const serving = (extra = {}) => ({ url: "http://localhost:34123", pid: 1, port: 34123, data: DATA, builds: path.join(DATA, "builds", "stable"), project: path.join(DATA, "projects", "34123"), ownProject: true, quality: "stable", commit: "c".repeat(40), log: "l", startedAt: 1, ...extra });

await check("while its server is up, up --sd rewrites the served file and nothing is spawned; the flags that need another server are refused", async () => {
  const deps = upDeps({ state: serving() });
  await up(["--sd", "other.sd"], deps);
  assert.deepEqual(names(deps), ["writeProjectSd", "log"]);
  assert.deepEqual(deps.calls[0], ["writeProjectSd", path.join(DATA, "projects", "34123"), "other.sd"]);
  for (const [args, re] of [
    [["--fresh"], /already serving .*; `down` first to download a new build/],
    [["--quality", "insiders"], /already serving stable .*; `down` first to serve insiders/],
    [["--data", path.join("C:", "elsewhere")], /already serving from .*data .*; `down` first to use .*elsewhere/],
    [["--project", path.join("C:", "otherfolder")], /already serving .*; `down` first to serve another folder/],
  ]) {
    const d = upDeps({ state: serving() });
    await refuses(up(args, d), re);
    assert.deepEqual(names(d), [], `${args.join(" ")} did something before refusing`);
  }
  const same = upDeps({ state: serving() });
  await up(["--data", DATA.toLowerCase()], same);
  assert.deepEqual(names(same), ["log"], "the recorded data directory, in another case, is the same server");
  const folder = upDeps({ state: serving({ ownProject: false, project: path.join("C:", "folder") }) });
  await refuses(up(["--sd", "a.sd"], folder), /which --sd does not write into; `down` first/);
});

await check("up --data against a record that does not name its data directory is refused rather than compared", async () => {
  const { data, ...rest } = serving();
  const deps = upDeps({ state: rest });
  await refuses(up(["--data", data], deps), /already serving from a data directory the record does not name .*; `down` first/);
});

await check("a record whose pid is not the server it started is removed and a launch follows; an unreadable state file ends up", async () => {
  const deps = upDeps({ state: serving({ pid: 2 }) });
  await up(["--sd", "repro.sd"], deps);
  assert.deepEqual(names(deps).slice(0, 2), ["removeState", "checkBuild"]);
  assert.equal(spawned(deps).length, 1);
  const unreadable = upDeps({ stateUnreadable: () => true });
  await refuses(up(["--sd", "repro.sd"], unreadable), /state file unreadable/);
});

// --- the page functions, against a scripted document ----------------------

const CHAR_W = 8;
const LINE_H = 20;
// A document with the parts of the workbench the page functions read: the
// rendered lines, their gutter numbers, the status bar items, the caret and
// the hover. `problems` is a function called on every diagnostics read, so a
// check scripts the series; `hover` appears once Ctrl+K Ctrl+I was pressed.
function fakeDocument({ lines = [], numbers, problems = () => "0 0", squiggles = {}, cursor = "Ln 1, Col 1", caretX = null, hover = null, tabTitle = "main.sd", explorerRow = true } = {}) {
  const lineEls = lines.map((text, i) => {
    const node = { nodeType: 3, nodeValue: text };
    return { style: { top: `${i * LINE_H}px` }, textContent: text, childNodes: [{ nodeType: 1, childNodes: [node] }], rect: { x: 100, y: 50 + i * LINE_H } };
  });
  const numberEls = (numbers ?? lines.map((_, i) => String(i + 1))).map((n, i) => ({ textContent: n, parentElement: { style: { top: `${i * LINE_H}px` } } }));
  const doc = {
    state: { problems, squiggles, cursor, caretX, hover, hoverShown: false, marked: null, tabTitle, explorerRow },
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] ?? null;
    },
    querySelectorAll(sel) {
      const s = this.state;
      if (sel === ".view-line") return lineEls;
      if (sel === ".margin-view-overlays .line-numbers") return numberEls;
      if (sel.includes("status.problems")) {
        const p = s.problems();
        return p == null ? [] : [{ innerText: p, getAttribute: () => (p === "" ? null : `label ${p}`), querySelector: () => null }];
      }
      if (sel.includes("status.editor.selection")) return [{ innerText: s.cursor }];
      if (sel.endsWith(".cursor")) return s.caretX == null ? [] : [{ getBoundingClientRect: () => ({ x: s.caretX, width: 2 }) }];
      if (sel.startsWith(".view-overlays .squiggly-")) return Array(s.squiggles[sel.slice(".view-overlays .squiggly-".length)] ?? 0).fill({});
      if (sel === "[data-drive-hover]") return s.marked ? [s.marked] : [];
      if (sel === ".monaco-hover") {
        const hidden = { getBoundingClientRect: () => ({ width: 0, height: 0 }), innerText: "", querySelector: () => null };
        if (!s.hoverShown || !s.hover) return [hidden];
        const img = s.hover.img && {
          hasAttribute: () => s.hover.img.hasSrc,
          getAttribute: () => s.hover.img.src ?? null,
          getBoundingClientRect: () => ({ width: 319, height: 180 }),
          naturalWidth: s.hover.img.naturalWidth,
          naturalHeight: s.hover.img.naturalHeight,
          complete: s.hover.img.complete,
        };
        const el = {
          getBoundingClientRect: () => ({ width: 200, height: 40 }),
          innerText: s.hover.text ?? "",
          querySelector: (q) => (q === "img" ? img || null : null),
          setAttribute: () => (s.marked = el),
          removeAttribute: () => (s.marked = null),
        };
        return [hidden, el];
      }
      throw new Error(`the scripted document has no ${sel}`);
    },
    createRange() {
      let a;
      let b;
      return {
        setStart: (node, off) => (a = [node, off]),
        setEnd: (node, off) => (b = [node, off]),
        getBoundingClientRect() {
          const line = lineEls.find((l) => l.childNodes[0].childNodes[0] === a[0]);
          return { x: line.rect.x + a[1] * CHAR_W, y: line.rect.y, width: (b[1] - a[1]) * CHAR_W, height: LINE_H };
        },
      };
    },
  };
  return doc;
}

const rendered = ["->\u00a0START", "", "scene\u00a0START", "", "\u00a0\u00a0[[show\u00a0backdrop\u00a0missing_backdrop]]", "", "\u00a0\u00a0ALICE:", "\u00a0\u00a0\u00a0\u00a0Hello\u00a0from\u00a0the\u00a0served\u00a0workbench."];

await check("Monaco's non-breaking spaces normalize to the source's spaces", () => {
  assert.equal(normalizeMonacoText("show\u00a0backdrop\u00a0pair"), "show backdrop pair");
  assert.equal(normalizeMonacoText(""), "");
  assert.equal(normalizeMonacoText(undefined), "");
});

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

await check("the page rebuilds locateWord from its source the way wordOnPage does, and the rebuilt function answers as the module's does", () => {
  const sources = pageSources();
  assert.deepEqual(Object.keys(sources).sort(), ["locateSrc", "normSrc", "rebuildSrc"]);
  // The same expression wordOnPage evaluates in the page: the rebuild helper
  // itself comes in by source, then rebuilds the two functions.
  const { locateWord: inPage, normalizeMonacoText: normInPage } = new Function(`return ${sources.rebuildSrc}`)()(sources);
  assert.notEqual(inPage, locateWord);
  assert.equal(normInPage("a\u00a0b"), "a b");
  for (const [word, line] of [["Hello", undefined], ["missing", undefined], ["]]", undefined], ["START", "scene START"], ["[[show", undefined]]) {
    assert.deepEqual(inPage(rendered, word, line), locateWord(rendered, word, line), `rebuilt locateWord differs on ${word}`);
  }
  assert.deepEqual(rebuildPageFunctions(sources).locateWord(rendered, "workbench"), { index: 7, start: 26, end: 35 });
});

await check("wordOnPage places the word through the rebuilt locateWord: its gutter line, rendered column, pixel edges and a click point in its first character", () => {
  const doc = fakeDocument({ lines: rendered });
  const hit = wordOnPage({ word: "missing_backdrop", sources: pageSources() }, doc);
  assert.deepEqual(hit, { line: 5, col: 19, left: 100 + 18 * CHAR_W, right: 100 + 34 * CHAR_W, charWidth: CHAR_W, x: 100 + 18 * CHAR_W + CHAR_W * 0.4, y: 50 + 4 * LINE_H + LINE_H / 2 });
  assert.deepEqual(wordOnPage({ word: "START", lineText: "scene START", sources: pageSources() }, doc).col, 7);
  assert.equal(wordOnPage({ word: "missing", sources: pageSources() }, doc), null, "a word inside an identifier is not found in the page either");
  // The location the page reports is the rebuilt function's answer, not a
  // fixed one: a locateWord that names another range moves the hit.
  const elsewhere = { ...pageSources(), locateSrc: "() => ({ index: 0, start: 3, end: 8 })" };
  assert.deepEqual(wordOnPage({ word: "missing_backdrop", sources: elsewhere }, doc), { line: 1, col: 4, left: 100 + 3 * CHAR_W, right: 100 + 8 * CHAR_W, charWidth: CHAR_W, x: 100 + 3 * CHAR_W + CHAR_W * 0.4, y: 50 + LINE_H / 2 });
  assert.equal(wordOnPage({ word: "missing_backdrop", sources: pageSources() }, fakeDocument({ lines: rendered, numbers: ["1", "2", "3", "4", "•"] })).line, null, "a gutter row without a number places the word on no line");
});

await check("diagnosticsOnPage reads null before the problems item exists, an empty string while it has no text, and the counter and squiggles once it does", () => {
  assert.deepEqual(diagnosticsOnPage(undefined, fakeDocument({ problems: () => null })), { problems: null, problemsLabel: null, squiggles: { error: 0, warning: 0, info: 0 } });
  assert.deepEqual(diagnosticsOnPage(undefined, fakeDocument({ problems: () => "" })).problems, "");
  assert.deepEqual(diagnosticsOnPage(undefined, fakeDocument({ problems: () => " 0  2 ", squiggles: { warning: 2 } })), { problems: "0 2", problemsLabel: "label  0  2 ", squiggles: { error: 0, warning: 2, info: 0 } });
});

await check("caretOnPage reports the status bar's cursor and the caret's left edge; hoverOnPage reads only a hover with size and content and marks the one it read", () => {
  assert.deepEqual(caretOnPage(undefined, fakeDocument({ cursor: "Ln 5, Col 19", caretX: 244 })), { text: "Ln 5, Col 19", x: 244 });
  assert.deepEqual(caretOnPage(undefined, fakeDocument({ cursor: "Ln 5, Col 19" })), { text: "Ln 5, Col 19", x: null });
  const doc = fakeDocument({ hover: { text: "Cannot  find image", img: { hasSrc: true, src: "https://x/a.png", naturalWidth: 96, naturalHeight: 180, complete: true } } });
  assert.deepEqual(hoverOnPage(undefined, doc), { present: false }, "the hidden hover element between hovers is not a hover");
  doc.state.hoverShown = true;
  assert.deepEqual(hoverOnPage(undefined, doc), { present: true, text: "Cannot find image", img: { hasSrc: true, srcHead: "https://x/a.png", rendered: "319 x 180", natural: "96 x 180", naturalWidth: 96, naturalHeight: 180, complete: true } });
  assert.ok(doc.state.marked, "the hover read is marked for the screenshot");
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
  assert.equal(cursorOnWord(hit, "Ln 7, Col 5", 449.6), null, "the caret's edge rounds to a pixel or two before the first character");
  assert.equal(cursorOnWord(hit, "Ln 7, Col 2", 451), null, "a tab-indented line: the model column is 2, the caret is on the word");
  assert.equal(cursorOnWord(hit, "Ln 7, Col 9", 486.2), null, "the boundary before the last character");
  assert.match(cursorOnWord(hit, "Ln 7, Col 10", 495), /outside the word's 451\.\.495/, "the boundary after the last character");
  assert.match(cursorOnWord(hit, "Ln 7, Col 4", 442.2), /outside/, "the boundary before the first character");
  assert.match(cursorOnWord({ line: 7, left: 451, right: 495 }, "Ln 7, Col 4", 449), /outside/, "without a character width the slack is a pixel");
  assert.match(cursorOnWord(hit, "Ln 8, Col 5", 451), /line 8, not line 7/);
  assert.match(cursorOnWord(hit, null, 451), /no cursor position/);
  assert.match(cursorOnWord(hit, "Ln 7, Col 5", null), /no caret/);
  assert.match(cursorOnWord({ ...hit, line: null }, "Ln 3, Col 5", 451), /has no gutter number/, "a word whose line cannot be placed is not vouched for by the pixels alone");
});

await check("opened is true only for the editor titled exactly as the file", () => {
  assert.equal(editorOpened("main.sd", "main.sd"), true);
  assert.equal(editorOpened("a_main.sd", "main.sd"), false);
  assert.equal(editorOpened("MAIN.SD", "main.sd"), false);
  assert.equal(editorOpened(null, "main.sd"), false);
});

await check("a hover image counts as loaded only with a src, complete, and a natural size", () => {
  assert.equal(hoverImageFailure(null), null, "a hover without an image is judged by --hover-image, not here");
  assert.equal(hoverImageFailure({ hasSrc: true, complete: true, naturalWidth: 96, naturalHeight: 180 }), null);
  assert.match(hoverImageFailure({ hasSrc: true, complete: true, naturalWidth: 0, naturalHeight: 0 }), /failed to load: natural size 0 x 0/);
  assert.match(hoverImageFailure({ hasSrc: true, complete: false, naturalWidth: 0, naturalHeight: 0 }), /not finished loading/);
  assert.match(hoverImageFailure({ hasSrc: false, complete: true, naturalWidth: 0, naturalHeight: 0 }), /no src/);
});

// --- the settle rule ---------------------------------------------------------

const reading = (problems) => ({ problems, squiggles: { error: 0, warning: 0, info: 0 } });
const same = (n, problems = "0 0") => Array(n).fill(reading(problems));

await check("a reading counts only when the counter carried a number", () => {
  assert.equal(usableReading(reading("0 0")), true);
  assert.equal(usableReading(reading("Warnings 2")), true);
  assert.equal(usableReading(reading("")), false);
  assert.equal(usableReading(reading(null)), false);
  assert.equal(usableReading(undefined), false);
  assert.deepEqual(SETTLE, { stableReads: 8, minReads: 25 });
});

await check("readings that never change settle only after the floor", () => {
  assert.equal(isSettled(same(7)), false);
  assert.equal(isSettled(same(8)), false, "eight identical readings are the workbench before the server");
  assert.equal(isSettled(same(24)), false);
  assert.equal(isSettled(same(25)), true);
  assert.match(settleState(same(24)).why, /never changed from the workbench's own value and 24 of the 25 a clean file needs were taken/);
});

await check("readings that change and then hold settle as soon as they have held", () => {
  const series = [...same(3), ...same(8, "0 2")];
  assert.equal(isSettled(series), true);
  assert.equal(isSettled(series.slice(0, -1)), false, "seven held readings are not eight");
  assert.match(settleState(series.slice(0, -1)).why, /the last 8 readings did not agree/);
  assert.match(settleState(same(3)).why, /3 readings carried a count and 8 that agree are needed/);
});

await check("a reading with no count is no reading wherever it falls, and never the settled value", () => {
  assert.equal(isSettled([reading(null), ...same(8)]), false, "null then eight of the workbench's own value is the workbench before the server");
  assert.equal(isSettled([reading(""), ...same(8)]), false, "an item with no text yet is not the workbench's value either");
  assert.equal(isSettled([reading(null), reading(null), ...same(8)]), false);
  assert.equal(isSettled([reading(null), ...same(24)]), false);
  assert.equal(isSettled([reading(""), ...same(24)]), false);
  assert.equal(isSettled([reading(null), ...same(25)]), true);
  assert.equal(isSettled([reading(null), ...same(2), ...same(8, "0 2")]), true);
  assert.equal(isSettled([...same(3), reading(null), ...same(8)]), false, "a counter that vanished for a second is not the change the rule waits for");
  assert.equal(isSettled([...same(3), reading(""), ...same(8)]), false);
  assert.equal(isSettled([...same(3), reading(null), ...same(21)]), false, "twenty-four readings with a count are not the floor");
  assert.equal(isSettled([...same(3), reading(null), ...same(22)]), true, "the readings around a vanished one still count toward the floor");
  assert.equal(isSettled([reading("0 2"), ...same(8, null)]), false, "a null tail is not a settled value");
  assert.equal(isSettled([...same(3), ...same(8, "0 2"), reading(null)]), false, "a last reading with no count settles nothing");
  assert.match(settleState([...same(8, "0 2"), reading("")]).why, /the last reading carried no count \(""\)/);
  assert.equal(isSettled(Array(30).fill(reading(null))), false, "a status bar that never appears never settles");
});

await check("a change inside the tail is not settled", () => {
  const series = [...same(20, "0 1"), ...same(4, "0 2"), ...same(4, "0 3")];
  assert.equal(isSettled(series), false);
});

await check("the settle thresholds are parameters", () => {
  assert.equal(isSettled(same(3, "0 1"), { stableReads: 3, minReads: 3 }), true);
  assert.equal(isSettled([reading("0 1"), reading("0 2"), reading("0 2")], { stableReads: 2, minReads: 10 }), true);
});

await check("an unsettled run reports the last reading and a failure naming the rule not met; a settled one reports no failure", () => {
  const settled = diagnosticsOutcome([...same(3), ...same(8, "0 2")], 11, 60);
  assert.equal(settled.settled, true);
  assert.equal(settled.failure, null);
  assert.deepEqual(settled.diagnostics, reading("0 2"));
  const cut = diagnosticsOutcome(same(1), 0, 25);
  assert.equal(cut.settled, false);
  assert.match(cut.failure, /^the diagnostics had not settled after 0 s \(--settle 25\): 1 reading carried a count and 8 that agree are needed; the numbers reported are the last reading, not a result$/);
  assert.deepEqual(cut.diagnostics, reading("0 0"));
  assert.match(diagnosticsOutcome(same(9, "0 2"), 60, 60).failure, /had not settled after 60 s \(--settle 60\): the readings never changed/, "the floor for a file that never changes is not met");
  assert.equal(diagnosticsOutcome([], 0, 0).diagnostics, null);
  assert.equal(SETTLE_FLOOR_S, 25, "the floor is the readings a clean file needs, one a second");
  assert.equal(DEFAULT_SETTLE_S, 60);
});

// --- flags --------------------------------------------------------------------

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

// --- verify, in-process against the scripted document -----------------------

// A page over the scripted document: `evaluate` runs the page function here,
// with the document as its second argument, and records which function ran
// with what; the locators, mouse and keyboard record what verify asked for.
function fakePage(doc, acts) {
  const locator = (sel) => ({
    filter: () => locator(sel),
    first: () => locator(sel),
    waitFor: async () => {
      if (!doc.state.explorerRow) throw new Error("Timeout 60000ms exceeded.\n  waiting for locator");
    },
    click: async () => acts.push(["open", sel]),
    textContent: async () => doc.state.tabTitle,
    screenshot: async ({ path: p }) => acts.push(["shot", sel, p]),
  });
  return {
    evaluate: (fn, arg) => {
      acts.push(["evaluate", fn.name, arg]);
      return fn(arg, doc);
    },
    waitForSelector: async (sel) => acts.push(["wait", sel]),
    locator,
    mouse: { click: async (x, y) => acts.push(["click", x, y]) },
    keyboard: {
      press: async (key) => {
        acts.push(["key", key]);
        if (key === "Control+i") doc.state.hoverShown = true;
      },
    },
    screenshot: async ({ path: p }) => acts.push(["shot", "page", p]),
  };
}

// The series a scripted counter plays, one value per read, holding the last.
const script = (values) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

const RECORD = { url: "http://localhost:34123", pid: 1, builds: path.join(DATA, "builds", "stable"), project: path.join(DATA, "projects", "34123") };
const BUILD = { artifacts: 3, oldest: "vscode-sparkdown/out/extension.js", builtAt: "2026-09-08T00:00:00.000Z" };
const verifyDeps = (doc, over = {}) => {
  let t = 0;
  const acts = [];
  const logs = [];
  const page = fakePage(doc, acts);
  return {
    acts,
    logs,
    log: (m) => logs.push(m),
    die: (m) => {
      throw new Refusal(m);
    },
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
    stateFile: path.join("C:", "repo", ".claude", "skills", "drive-vscode-web", ".state.json"),
    readState: () => RECORD,
    recordStands: async () => true,
    isUp: async () => true,
    checkBuild: () => BUILD,
    aliasWorkbenchCss: (builds) => {
      acts.push(["alias", builds]);
      return { aliased: [] };
    },
    withWorkbench: async (url, opts, fn) => {
      acts.push(["workbench", url, opts.headless]);
      return fn({ page, consoleLines: ["[error] boom", "[log] fine", "[pageerror] Not Found"] });
    },
    readFile: () => "return 1 + 1",
    ...over,
  };
};
const keys = (deps) => deps.acts.filter((a) => a[0] === "key").map((a) => a[1]);
const evaluated = (deps) => deps.acts.filter((a) => a[0] === "evaluate").map((a) => a[1]);
const hoverDoc = (extra = {}) => fakeDocument({ lines: rendered, problems: script([null, "", "0 0", "0 0", "0 2"]), squiggles: { warning: 2 }, cursor: "Ln 5, Col 19", caretX: 100 + 18 * CHAR_W, hover: { text: "Cannot find image named 'missing_backdrop'" }, ...extra });

await check("verify opens the file, waits for the counter to change and hold, clicks the word, opens the hover by keyboard, screenshots, prints the report and exits 0", async () => {
  const deps = verifyDeps(hoverDoc());
  const { report, exitCode } = await verify(["--hover", "missing_backdrop", "--shot", "after.png", "--hover-shot", "hover.png", "--probe", "p.js"], deps);
  assert.equal(exitCode, 0, JSON.stringify(report.failed));
  assert.deepEqual(report.failed, []);
  assert.equal(report.url, RECORD.url);
  assert.equal(report.project, RECORD.project);
  assert.deepEqual(report.build, BUILD);
  assert.equal(report.file, "main.sd");
  assert.equal(report.editor, "main.sd");
  assert.equal(report.opened, true);
  assert.equal(report.settled, true);
  assert.equal(report.settledAfterS, 11, "null, an empty item and two of the workbench's own value, then the change held for eight readings a second apart");
  assert.deepEqual(report.diagnostics, { problems: "0 2", problemsLabel: "label 0 2", squiggles: { error: 0, warning: 2, info: 0 } });
  assert.deepEqual(report.hover, { word: "missing_backdrop", line: 5, col: 19, cursor: "Ln 5, Col 19", present: true, text: "Cannot find image named 'missing_backdrop'", img: null });
  assert.equal(report.screenshot, path.resolve("after.png"));
  assert.equal(report.hoverScreenshot, path.resolve("hover.png"));
  assert.equal(report.probe, 2);
  assert.deepEqual(report.consoleErrors, ["[error] boom", "[pageerror] Not Found"]);
  assert.deepEqual(deps.acts.slice(0, 4), [["alias", RECORD.builds], ["workbench", RECORD.url, true], ["wait", ".monaco-workbench"], ["open", ".explorer-folders-view .monaco-list-row"]]);
  assert.equal(evaluated(deps).filter((n) => n === "diagnosticsOnPage").length, 12);
  const word = deps.acts.find((a) => a[0] === "evaluate" && a[1] === "wordOnPage");
  assert.deepEqual(word[2], { word: "missing_backdrop", lineText: undefined, sources: pageSources() }, "the page rebuilds the word location from the module's own sources");
  assert.deepEqual(deps.acts.find((a) => a[0] === "click"), ["click", 100 + 18 * CHAR_W + CHAR_W * 0.4, 50 + 4 * LINE_H + LINE_H / 2]);
  assert.deepEqual(keys(deps), ["Control+k", "Control+i"]);
  assert.deepEqual(deps.acts.filter((a) => a[0] === "shot"), [["shot", "[data-drive-hover]", "hover.png"], ["shot", "page", "after.png"]]);
  assert.equal(JSON.parse(deps.logs.at(-1)).settledAfterS, 11, "the report is printed");
});

await check("verify refuses a bad option, a hover flag without --hover, a --settle below the floor, and a server it cannot vouch for, before opening a browser", async () => {
  for (const [args, re] of [
    [["--bogus"], /^verify: unknown option --bogus$/],
    [["--line", "x"], /^verify: --line needs --hover$/],
    [["--hover-shot", "h.png"], /^verify: --hover-shot needs --hover$/],
    [["--hover-image"], /^verify: --hover-image needs --hover$/],
    [["--settle", "abc"], /^verify: --settle needs a number of seconds, not "abc"$/],
    [["--settle", "10"], /^verify: --settle 10 is below 25, the readings \(one a second\) a file the server finds clean needs before the settle rule can call it settled; the default is 60$/],
    [["--settle", "0"], /--settle 0 is below 25/],
  ]) {
    const deps = verifyDeps(hoverDoc());
    await refuses(verify(args, deps), re);
    assert.deepEqual(deps.acts, [], `${args.join(" ")} reached the browser`);
  }
  await refuses(verify([], verifyDeps(hoverDoc(), { readState: () => null })), /^no server URL; run `node .*driver\.mjs up --sd <file\.sd>` first$/);
  const stale = verifyDeps(hoverDoc(), { recordStands: async () => false });
  await refuses(verify([], stale), /records pid 1, which is not the server it started; `down` then `up`/);
  assert.deepEqual(stale.acts, []);
  await refuses(verify([], verifyDeps(hoverDoc(), { isUp: async () => false })), /does not answer; `down` then `up`/);
  const old = verifyDeps(hoverDoc(), {
    checkBuild: () => {
      throw new Refusal("vscode-sparkdown/out/extension.js (built t) is older than packages/sparkdown/src/a.ts (t2)");
    },
  });
  await refuses(verify(["--hover", "missing_backdrop"], old), /is older than packages\/sparkdown\/src\/a\.ts/);
  assert.deepEqual(old.acts, [], "a stale build opened a browser");
});

await check("verify on a clean file settles at the floor, and a counter that appears empty or vanishes for a second only delays the floor", async () => {
  const clean = verifyDeps(fakeDocument({ lines: rendered, problems: script(["0 0"]) }));
  let r = await verify(["--settle", "25"], clean);
  assert.equal(r.exitCode, 0, JSON.stringify(r.report.failed));
  assert.equal(r.report.settledAfterS, 24, "25 readings a second apart");
  const empty = verifyDeps(fakeDocument({ lines: rendered, problems: script(["", "0 0"]) }));
  r = await verify(["--settle", "25"], empty);
  assert.equal(r.report.settledAfterS, 25, "the empty first reading is not the value the rest changed from");
  const blink = verifyDeps(fakeDocument({ lines: rendered, problems: script(["0 0", "0 0", "0 0", null, "0 0"]) }));
  r = await verify(["--settle", "30"], blink);
  assert.equal(r.report.settledAfterS, 25, "a null in the middle is not a change");
  assert.equal(r.exitCode, 0);
});

await check("a run whose readings never settle is a failed entry naming the rule, exit 1, with the last reading as its numbers", async () => {
  const flapping = verifyDeps(hoverDoc({ problems: script(Array.from({ length: 40 }, (_, i) => (i % 2 ? "0 2" : "0 1"))) }));
  let r = await verify(["--settle", "30", "--hover", "missing_backdrop"], flapping);
  assert.equal(r.exitCode, 1);
  assert.equal(r.report.settled, false);
  assert.equal(r.report.settledAfterS, 30);
  assert.deepEqual(r.report.failed, ["the diagnostics had not settled after 30 s (--settle 30): the last 8 readings did not agree; the numbers reported are the last reading, not a result"]);
  assert.equal(r.report.diagnostics.problems, "0 1");
  assert.ok(r.report.hover.present, "the hover is still asked for, so the report says what the workbench shows");
  const vanished = verifyDeps(fakeDocument({ lines: rendered, problems: script(["0 0", "0 0", "0 2", "0 2", "0 2", "0 2", "0 2", "0 2", "0 2", null]) }));
  r = await verify(["--settle", "25"], vanished);
  assert.equal(r.exitCode, 1);
  assert.match(r.report.failed[0], /the last reading carried no count \(null\)/);
});

await check("a hover is judged by the caret: off the word, or on a line with no gutter number, is a failure and no hover is asked for", async () => {
  const off = verifyDeps(hoverDoc({ caretX: 100 }));
  let r = await verify(["--hover", "missing_backdrop"], off);
  assert.equal(r.exitCode, 1);
  assert.deepEqual(r.report.failed, ['the cursor did not land on "missing_backdrop" at Ln 5, Col 19: the caret is at x=100, outside the word\'s 244..372']);
  assert.deepEqual(keys(off), []);
  const unnumbered = verifyDeps(hoverDoc({ numbers: ["1", "2", "3", "4", "•"] }));
  r = await verify(["--hover", "missing_backdrop"], unnumbered);
  assert.match(r.report.failed[0], /the word's line has no gutter number/);
  assert.equal(r.report.hover.line, null);
  const absent = verifyDeps(hoverDoc());
  r = await verify(["--hover", "nowhere"], absent);
  assert.deepEqual(r.report.failed, ['"nowhere" is not a whole word on a rendered line; only the lines in the viewport are rendered']);
  const wrongLine = verifyDeps(hoverDoc({ cursor: "Ln 6, Col 19" }));
  r = await verify(["--hover", "missing_backdrop"], wrongLine);
  assert.match(r.report.failed[0], /the cursor is on line 6, not line 5/);
});

await check("--hover-image fails a hover without an image; an image that did not load fails whether or not it was required", async () => {
  const none = verifyDeps(hoverDoc());
  let r = await verify(["--hover", "missing_backdrop", "--hover-image"], none);
  assert.deepEqual(r.report.failed, ['the hover on "missing_backdrop" carries no image (--hover-image)']);
  const broken = verifyDeps(hoverDoc({ hover: { text: "", img: { hasSrc: true, src: "https://x/a.png", naturalWidth: 0, naturalHeight: 0, complete: true } } }));
  r = await verify(["--hover", "missing_backdrop"], broken);
  assert.deepEqual(r.report.failed, ["the hover's image failed to load: natural size 0 x 0"]);
  const loaded = verifyDeps(hoverDoc({ hover: { text: "", img: { hasSrc: true, src: "https://x/a.png", naturalWidth: 96, naturalHeight: 180, complete: true } } }));
  r = await verify(["--hover", "missing_backdrop", "--hover-image"], loaded);
  assert.deepEqual(r.report.failed, []);
  assert.equal(r.report.hover.img.natural, "96 x 180");
  const never = verifyDeps(hoverDoc({ hover: null }));
  r = await verify(["--hover", "missing_backdrop"], never);
  assert.deepEqual(r.report.failed, ['no hover opened on "missing_backdrop" within 10 s of Ctrl+K Ctrl+I']);
});

await check("a file that does not open, or opens under another title, is a failure and nothing is read from it", async () => {
  const noRow = verifyDeps(fakeDocument({ lines: rendered, explorerRow: false }));
  let r = await verify(["--hover", "missing_backdrop", "--shot", "after.png"], noRow);
  assert.equal(r.exitCode, 1);
  assert.equal(r.report.opened, false);
  assert.match(r.report.failed[0], /^could not open main\.sd from the explorer: Timeout 60000ms exceeded\.$/);
  assert.equal(r.report.settled, undefined);
  assert.ok(!evaluated(noRow).includes("diagnosticsOnPage"));
  assert.equal(r.report.screenshot, path.resolve("after.png"), "the screenshot still shows the workbench as it was");
  const other = verifyDeps(fakeDocument({ lines: rendered, tabTitle: "other.sd" }));
  r = await verify(["--file", "other.sd"], other);
  assert.equal(r.report.opened, true);
  r = await verify([], verifyDeps(fakeDocument({ lines: rendered, tabTitle: "other.sd" })));
  assert.deepEqual(r.report.failed, ['the editor that opened is titled "other.sd", not main.sd']);
});

await check("whatever throws inside the page lands in failed with the report printed, and --headed opens a visible browser", async () => {
  const doc = hoverDoc();
  doc.querySelectorAll = () => {
    throw new Error("the page went away");
  };
  const deps = verifyDeps(doc);
  const r = await verify(["--headed"], deps);
  assert.equal(r.exitCode, 1);
  assert.deepEqual(r.report.failed, ["verify threw: the page went away"]);
  assert.deepEqual(deps.acts[1], ["workbench", RECORD.url, false]);
  assert.equal(JSON.parse(deps.logs.at(-1)).failed[0], "verify threw: the page went away");
});

if (failures) {
  console.log(`${failures} failing`);
  process.exit(1);
}
console.log("All drive-vscode-web driver assertions passed.");

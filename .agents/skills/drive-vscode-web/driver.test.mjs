#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL } from "node:url";
import { diagnosticFailures, lspHealth, validateScenario, previewRead, classifyRuntimeErrors, hostCrashes, pollUntil, scriptProvenance, stopDesktop, ensurePreviewVisible } from "./desktop.mjs";
import { serverRows, serversFrom } from "../clean-worktrees/clean-worktrees.mjs";
import { partitionConsole } from "../drive-web-editor/driver.mjs";
import {
  LOOPBACKS,
  PORT_SCAN,
  QUALITIES,
  WORKBENCH_CONSOLE_NOISE,
  READY_POLL_MS,
  REBUILD_STEPS,
  SOURCE_SKIP,
  STAMP_NAME,
  TOP_ROW,
  VIEWPORT,
  aliasWorkbenchCss,
  buildFreshness,
  buildRule,
  checkBuild,
  dataLayout,
  downloadLockPath,
  takeDownloadLock,
  editorOpened,
  hoverImageFailure,
  hoverOnPage,
  launchPlan,
  locateWord,
  nearestDirMtime,
  parseFlags,
  portBase,
  portFree,
  rebuildCommand,
  recordFile,
  renderedCaretOnWord,
  sharedBuildUsers,
  sourceFiles,
  spawnServer,
  stampGap,
  status,
  unpackedCommit,
  missingBuildEntries,
  BUILD_ENTRY_FILES,
  up,
  verify,
  waitReady,
  withWorkbench,
} from "./driver.mjs";
import { createEditorProtocol } from "./editor-protocol.mjs";

const FIXTURE_ROOT = path.parse(process.cwd()).root;

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
  build("vscode-web-stable-ccc");
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
  fs.mkdirSync(path.join(scratch, `vscode-web-stable-${"b".repeat(40)}`), { recursive: true });
  assert.equal(unpackedCommit(scratch), null);
  fs.mkdirSync(path.join(scratch, `vscode-web-stable-${commit}`), { recursive: true });
  fs.writeFileSync(path.join(scratch, `vscode-web-stable-${commit}`, "version"), `vscode-web-stable-${commit}`);
  assert.equal(unpackedCommit(scratch), commit);
  assert.equal(unpackedCommit(path.join(scratch, "missing")), null);
});

await check("missingBuildEntries names the workbench entry files a build with only its version file lacks, and none once they are there", () => {
  const commit = "d".repeat(40);
  const dir = path.join(scratch, `vscode-web-stable-${commit}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "version"), `vscode-web-stable-${commit}`);
  assert.deepEqual(missingBuildEntries(scratch, commit), { dir, missing: BUILD_ENTRY_FILES });
  fs.mkdirSync(path.dirname(path.join(dir, BUILD_ENTRY_FILES[0])), { recursive: true });
  fs.writeFileSync(path.join(dir, BUILD_ENTRY_FILES[0]), "x");
  assert.deepEqual(missingBuildEntries(scratch, commit), { dir, missing: [BUILD_ENTRY_FILES[1]] }, "a build with the script but not the stylesheet is still incomplete");
  for (const f of BUILD_ENTRY_FILES) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), "x");
  }
  assert.deepEqual(missingBuildEntries(scratch, commit), { dir, missing: [] });
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
  assert.deepEqual(by["out/extension.js"].sources, [path.join(ext, "src"), path.join(ext, "language"), path.join(ext, "scripts", "esbuild.ts"), ...pkgSrc, ...pkgLang]);
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

await check("desktop freshness includes the Game Preview runtime, workers and webviews", () => {
  const groups = buildRule(ext, packages, fs, "desktop");
  assert.ok(groups.some(g => relOf(g) === "out/webviews/game-webview.js"));
  assert.ok(groups.some(g => relOf(g) === "out/workers/sparkdown-screenplay-pdf.js"));
  const game = groups.find(g => relOf(g) === "out/webviews/game-webview.js");
  assert.ok(game.sources.includes(path.join(packages, "sparkdown", "src")));
  assert.equal(rebuildCommand([game]), "cd vscode-sparkdown && npm run build");
  touch(path.join(ext, "webviews/game-webview/game-webview.ts"), T0 + 100);
  assert.ok(staleNames(groups).includes("out/webviews/game-webview.js"));
  touch(path.join(ext, "webviews/game-webview/game-webview.ts"), T0 - 5000);
  const missing = buildFreshness(groups, filesOf).missing;
  assert.ok(missing.includes(path.join(ext, "out/webviews/screen-webview.js")));
});

for (const configRelative of [
  "packages/spark-web-player/tsconfig.json",
  "packages/sparkdown-language-server/tsconfig.json",
  "packages/sparkdown-screenplay-pdf/tsconfig.json",
  "vscode-sparkdown/tsconfig.json",
  "vscode-sparkdown/webviews/game-webview/tsconfig.json",
]) {
  await check(`desktop freshness refuses unchanged outputs after changing ${configRelative}`, () => {
    const configRepo = path.join(scratch, "consumed-config", configRelative.replaceAll("/", "-"));
    console.log("Scratch freshness fixture: " + configRepo);
    const configExt = path.join(configRepo, "vscode-sparkdown");
    const configPackages = path.join(configRepo, "packages");
    const configFile = path.join(configRepo, configRelative);
    const originalConfig = JSON.stringify({ compilerOptions: { useDefineForClassFields: true } });
    at(path.join(configPackages, "spark-web-player/src/Player.ts"), T0 - 10000, "export class Player { scene = 'known'; }");
    at(path.join(configExt, "src/extension.ts"), T0 - 10000, "export const active = true;");
    at(configFile, T0 - 10000, originalConfig);
    const groups = buildRule(configExt, configPackages, fs, "desktop");
    for (const group of groups) at(group.artifact, T0, "original runtime");
    const configDeps = { repoRoot: configRepo, extDir: configExt, packagesDir: configPackages, surface: "desktop", die(message) { throw new Refusal(message); } };
    const configStamp = path.join(configExt, "out/.drive-vscode-desktop-build.json");
    const accepted = checkBuild(configDeps);
    const stamped = fs.readFileSync(configStamp, "utf8");
    assert.equal(accepted.artifacts, 7);
    touch(configFile, T0 + 10000);
    assert.deepEqual(checkBuild(configDeps), accepted);
    assert.equal(fs.readFileSync(configStamp, "utf8"), stamped);
    at(configFile, T0 + 20000, JSON.stringify({ compilerOptions: { useDefineForClassFields: false } }));
    assert.throws(() => checkBuild(configDeps), err => err instanceof Refusal && /older than/.test(err.message), "a consumed tsconfig changed but every runtime artifact is still the accepted old build");
    assert.equal(fs.readFileSync(configStamp, "utf8"), stamped, "refusal must preserve the accepted config/artifact identities");
    at(path.join(configExt, "out/extension.js"), T0 + 30000, "rebuilt extension");
    assert.throws(() => checkBuild(configDeps), err => err instanceof Refusal && /older than/.test(err.message));
    for (const group of groups) at(group.artifact, T0 + 30000, "rebuilt runtime");
    assert.equal(checkBuild(configDeps).artifacts, 7, "outputs rebuilt after the changed configuration remain usable");
    assert.equal(JSON.parse(fs.readFileSync(configStamp, "utf8")).sources[configRelative], createHash("sha1").update(fs.readFileSync(configFile)).digest("hex"));
  });
}

await check("desktop rejects unexpected diagnostics but accepts the exact expected message and source", () => {
  const diagnostic = { file: path.join(repo, "project/main.sd"), message: "Unknown asset", severity: "warning", source: "sparkdown", line: 4 };
  const expectation = { ...diagnostic, file: "project/main.sd" };
  assert.deepEqual(diagnosticFailures([diagnostic], [expectation], repo), { unexpected: [], missing: [] });
  assert.equal(diagnosticFailures([diagnostic], [], repo).unexpected.length, 1);
  assert.equal(diagnosticFailures([{ ...diagnostic, source: "other" }], [expectation], repo).unexpected.length, 1);
  assert.equal(diagnosticFailures([], [expectation], repo).missing.length, 1);
  const health = lspHealth("[Trace] Received response 'textDocument/semanticTokens/full - (1)' in 20ms.\n[Trace] Received response 'textDocument/semanticTokens/range - (2)' in 20ms. Request failed: Cannot assign to read only property 'name' (-32603).\n[Error] Request textDocument/semanticTokens/range failed.");
  assert.equal(health.semanticResponses.length, 2);
  assert.equal(health.semanticResponses[1].failed, true);
  assert.equal(health.failed.length, 2);
  assert.throws(() => validateScenario({ file: "main.sd", expectedDiagnostics: [] }), /interaction/);
  const playable = { file: "main.sd", expectedDiagnostics: [], preview: { text: "First.", steps: [{ selector: "#game", text: "Hello." }] } };
  validateScenario(playable);
  validateScenario({ ...playable, ending: { badge: "Story ran out", restartText: "First." } });
  assert.throws(() => validateScenario({ ...playable, ending: { badge: "Story ran out" } }), /ending check/);
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

await check("a missing artifact is reported as missing, through the file system handed in", () => {
  fs.rmSync(path.join(ext, "out", "data", "cheatsheet.css"));
  const { missing, stale } = buildFreshness(ruleOf(), filesOf);
  assert.deepEqual(missing.map((p) => path.basename(p)), ["cheatsheet.css"]);
  assert.deepEqual(stale, []);
  at(path.join(ext, "out", "data", "cheatsheet.css"), T0);
  const gone = buildFreshness(ruleOf(), filesOf, { statSync: () => { throw new Error("ENOENT"); } });
  assert.equal(gone.missing.length, 3, "the artifacts were read through the module's own file system, not the one handed in");
  assert.ok(ruleOf().find((g) => g.artifact.endsWith("cheatsheet.css")).copied, "a copy under out/data is not marked as one");
  assert.ok(!ruleOf().find((g) => g.artifact.endsWith("extension.js")).copied);
});

await check("nearestDirMtime is the time of the directory holding the file, or of the nearest one still there, and null when none is up to the top", () => {
  const dir = path.join(packages, "sparkdown", "src", "deep");
  fs.mkdirSync(dir, { recursive: true });
  fs.utimesSync(dir, new Date(T0 - 7000), new Date(T0 - 7000));
  fs.utimesSync(path.join(packages, "sparkdown", "src"), new Date(T0 - 8000), new Date(T0 - 8000));
  assert.equal(nearestDirMtime(path.join(dir, "gone.ts"), repo), T0 - 7000);
  assert.equal(nearestDirMtime(path.join(dir, "gone", "deeper", "gone.ts"), repo), T0 - 7000, "a removed subtree is dated by the directory it went from");
  assert.equal(nearestDirMtime(path.join(scratch, "nowhere", "a.ts"), path.join(scratch, "nowhere")), null);
  fs.rmSync(dir, { recursive: true });
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
  const rebuilt = { ...artifacts, "out/extension.js": { size: 1, mtimeMs: T0 + 1 } };
  assert.deepEqual(stampGap(stamp, rebuilt, sources, []), { kind: "artifacts" }, "a rebuilt artifact");
  assert.deepEqual(stampGap(stamp, { "out/extension.js": artifacts["out/extension.js"] }, sources, []), { kind: "artifacts" }, "an artifact set of another size");
  assert.deepEqual(stampGap(stamp, rebuilt, ["vscode-sparkdown/src/b.ts"], []), { kind: "removed", files: ["packages/a/src/a.ts"] }, "the source set is judged before the artifacts, so a rebuild does not hide a deletion");
  assert.deepEqual(stampGap(stamp, rebuilt, [...sources, "packages/a/src/old.ts"], []), { kind: "added", files: ["packages/a/src/old.ts"] }, "nor an addition");
  const built = (f) => f === "packages/a/src/a.ts" || f === "packages/a/src/old.ts";
  assert.deepEqual(stampGap(stamp, rebuilt, ["vscode-sparkdown/src/b.ts"], [], built), { kind: "artifacts" }, "a deletion the artifacts were built after leaves a stamp that is out of date");
  assert.deepEqual(stampGap(stamp, artifacts, [...sources, "packages/a/src/old.ts"], [], built), { kind: "artifacts" }, "an addition the artifacts were built after, even with the stamped artifacts in place");
  assert.deepEqual(stampGap(stamp, artifacts, ["vscode-sparkdown/src/b.ts", "packages/a/src/new.ts"], [], built), { kind: "added", files: ["packages/a/src/new.ts"] }, "each file is asked about on its own");
  assert.deepEqual(stampGap(null, artifacts, sources, []), { kind: "artifacts" });
  assert.deepEqual(stampGap({ artifacts }, artifacts, sources, []), { kind: "artifacts" }, "a stamp without sources");
});

const buildDeps = { repoRoot: repo, extDir: ext, packagesDir: packages, die: (m) => { throw new Refusal(m); } };
const stampFile = path.join(ext, "out", STAMP_NAME);
const refusesBuild = (re) => assert.throws(() => checkBuild(buildDeps), (err) => err instanceof Refusal && re.test(err.message), `no refusal matching ${re}`);
const relFile = (p) => path.relative(repo, p).replaceAll("\\", "/");

await check("checkBuild accepts a fresh build, writes the stamp, and dates the build by the older bundle, never by a copy under out/data", () => {
  fs.rmSync(stampFile, { force: true });
  touch(path.join(ext, "out", "extension.js"), T0 - 1000);
  at(path.join(ext, "data", "cheatsheet.css"), T0 - 50_000);
  at(path.join(ext, "out", "data", "cheatsheet.css"), T0 - 50_000);
  const build = checkBuild(buildDeps);
  assert.deepEqual(build, { artifacts: 3, oldest: "vscode-sparkdown/out/extension.js", builtAt: new Date(T0 - 1000).toISOString() }, "a data copy carries its source's time, not the build's");
  at(path.join(ext, "data", "cheatsheet.css"), T0 - 5000);
  at(path.join(ext, "out", "data", "cheatsheet.css"), T0);
  assert.deepEqual(checkBuild(buildDeps), build, "the copy's time moved and the build's did not");
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

const stampSources = () => Object.keys(JSON.parse(fs.readFileSync(stampFile, "utf8")).sources);
const ARTIFACTS = ["out/extension.js", "out/workers/sparkdown-language-server.js", "out/data/cheatsheet.css"];

await check("checkBuild judges the source set before the artifacts: a source deleted after a rebuild is refused with the stamp untouched, and the rebuild the refusal names clears it", () => {
  const stamp = JSON.parse(fs.readFileSync(stampFile, "utf8"));
  for (const k of Object.keys(stamp.artifacts)) stamp.artifacts[k].mtimeMs -= 1;
  fs.writeFileSync(stampFile, JSON.stringify(stamp));
  const a = path.join(packages, "sparkdown", "src", "a.ts");
  fs.rmSync(a);
  refusesBuild(new RegExp(`^packages/sparkdown/src/a.ts was removed after the build was stamped, so the served workbench would run a build made from other sources; rebuild: cd vscode-sparkdown && ${LS_BUILD} && ${SELF}$`));
  assert.ok(stampSources().includes("packages/sparkdown/src/a.ts"), "the stamp was rewritten over the gap");
  const later = Date.now() + 60_000;
  for (const f of ARTIFACTS) at(path.join(ext, f), later, "rebuilt after the deletion");
  assert.equal(checkBuild(buildDeps).artifacts, 3, "a build made after the deletion");
  assert.ok(!stampSources().includes("packages/sparkdown/src/a.ts"), "the new stamp still names the deleted file");
  at(a, T0 - 5000);
  fs.utimesSync(path.dirname(a), new Date(later + 5000), new Date(later + 5000));
  refusesBuild(new RegExp(`^packages/sparkdown/src/a.ts was added after the build was stamped, .*; rebuild: cd vscode-sparkdown && ${LS_BUILD} && ${SELF}$`));
  assert.ok(!stampSources().includes("packages/sparkdown/src/a.ts"), "the stamp was rewritten over the gap");
  for (const f of ARTIFACTS) at(path.join(ext, f), later + 10_000, "rebuilt after the addition");
  assert.equal(checkBuild(buildDeps).artifacts, 3);
  assert.ok(stampSources().includes("packages/sparkdown/src/a.ts"), "the new stamp does not name the file");
});

await check("a stamp from a driver that watched fewer sources is brought up to date when the artifacts are newer than the directories it never listed", () => {
  const stamp = JSON.parse(fs.readFileSync(stampFile, "utf8"));
  delete stamp.sources["packages/sparkdown/language/sparkdown.language-grammar.json"];
  fs.writeFileSync(stampFile, JSON.stringify(stamp));
  fs.utimesSync(path.join(packages, "sparkdown", "language"), new Date(T0 - 9000), new Date(T0 - 9000));
  assert.equal(checkBuild(buildDeps).artifacts, 3);
  assert.ok(stampSources().includes("packages/sparkdown/language/sparkdown.language-grammar.json"), "the stamp still lacks the source");
  fs.writeFileSync(stampFile, JSON.stringify(stamp));
  fs.utimesSync(path.join(packages, "sparkdown", "language"), new Date(Date.now() + 120_000), new Date(Date.now() + 120_000));
  refusesBuild(/^packages\/sparkdown\/language\/sparkdown.language-grammar.json was added after the build was stamped/);
});

await check("a source set change that no directory can date is refused, not vouched for", () => {
  const io = {
    ...fs,
    statSync: (p) => {
      const st = fs.statSync(p);
      if (st.isDirectory() && path.relative(path.join(ext, "data"), p).startsWith("..")) throw new Error("EPERM: operation not permitted, stat");
      return st;
    },
  };
  const before = fs.readFileSync(stampFile, "utf8");
  assert.throws(() => checkBuild({ ...buildDeps, io }), (err) => err instanceof Refusal && /was removed after the build was stamped/.test(err.message));
  assert.equal(fs.readFileSync(stampFile, "utf8"), before, "the stamp was rewritten over a change nothing could date");
});

fs.rmSync(scratch, { recursive: true, force: true });

await check("projects and logs sit beside the builds directory, never inside it", () => {
  const { builds, projects, logs } = dataLayout(path.join(FIXTURE_ROOT, "data"));
  const inside = (p) => path.relative(builds, p).startsWith("..") === false;
  assert.equal(path.dirname(builds), path.join(FIXTURE_ROOT, "data"));
  assert.ok(!inside(projects), `${projects} is inside ${builds}, which the server clears on a new download`);
  assert.ok(!inside(logs), `${logs} is inside ${builds}, which the server clears on a new download`);
});

const planFor = (extra) =>
  launchPlan({ data: path.join(FIXTURE_ROOT, "data"), port: 34123, extDir: path.join(FIXTURE_ROOT, "repo", "vscode-sparkdown"), entry: path.join(FIXTURE_ROOT, "repo", "index.js"), ...extra });
const argOf = (args, flag) => args[args.indexOf(flag) + 1];

await check("the launch plan is the server's whole argument list: no browser, the quality, esm, the port, only the quality's builds directory, the commit when there is one, the extension, the project last", () => {
  const plan = planFor({ sd: "repro.sd", quality: "insiders", commit: "c".repeat(40) });
  assert.equal(plan.error, undefined);
  assert.equal(plan.builds, path.join(FIXTURE_ROOT, "data", "builds", "insiders"));
  assert.deepEqual(plan.args, [
    path.join(FIXTURE_ROOT, "repo", "index.js"),
    "--browser", "none",
    "--quality", "insiders",
    "--esm",
    "--port", "34123",
    "--testRunnerDataDir", plan.builds,
    "--commit", "c".repeat(40),
    "--extensionDevelopmentPath", path.join(FIXTURE_ROOT, "repo", "vscode-sparkdown"),
    plan.project,
  ]);
  const stable = planFor({ sd: "repro.sd" });
  assert.equal(argOf(stable.args, "--quality"), "stable");
  assert.equal(stable.builds, path.join(FIXTURE_ROOT, "data", "builds", "stable"));
  assert.ok(!stable.args.includes("--commit"), "no commit is passed when none is unpacked");
});

await check("the served project and the log are outside the builds directory", () => {
  const plan = planFor({ sd: "repro.sd" });
  const { builds } = dataLayout(path.join(FIXTURE_ROOT, "data"));
  const inside = (p) => !path.relative(builds, p).startsWith("..");
  assert.equal(plan.project, path.join(FIXTURE_ROOT, "data", "projects", "34123"));
  assert.equal(plan.ownProject, true);
  assert.ok(!inside(plan.project), `${plan.project} is inside ${builds}`);
  assert.equal(plan.logPath, path.join(FIXTURE_ROOT, "data", "logs", "serve-34123.log"));
  assert.ok(!inside(plan.logPath), `${plan.logPath} is inside ${builds}`);
});

await check("a folder given with --project is served as is, and one inside the builds directory is refused", () => {
  const plan = planFor({ project: path.join(FIXTURE_ROOT, "work", "game") });
  assert.equal(plan.project, path.join(FIXTURE_ROOT, "work", "game"));
  assert.equal(plan.ownProject, false);
  assert.match(planFor({ project: path.join(FIXTURE_ROOT, "data", "builds", "stable", "game") }).error, /inside .*builds/);
  assert.match(planFor({ project: path.join(FIXTURE_ROOT, "data", "builds") }).error, /inside .*builds/);
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

const ENTRY = path.join(FIXTURE_ROOT, "repo", "node_modules", "@vscode", "test-web", "out", "server", "index.js");
const EXT = path.join(FIXTURE_ROOT, "repo", "vscode-sparkdown");
const DATA = path.join(FIXTURE_ROOT, "data");
const upDeps = (over = {}) => {
  const calls = [];
  const deps = {
    calls,
    state: null,
    log: (m) => calls.push(["log", m]),
    die: (m) => {
      calls.push(["die", m]);
      throw new Refusal(m);
    },
    sleep: async () => {},
    now: () => 1000,
    repoRoot: path.join(FIXTURE_ROOT, "repo"),
    extDir: EXT,
    packagesDir: path.join(FIXTURE_ROOT, "repo", "packages"),
    serverEntry: ENTRY,
    defaultDataDir: DATA,
    stateFile: path.join(FIXTURE_ROOT, "repo", ".agents", "skills", "drive-vscode-web", ".state.json"),
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
    missingBuildEntries: (builds, commit) => ({ dir: path.join(builds, `vscode-web-stable-${commit}`), missing: [] }),
    takeDownloadLock: async (lockPath, record) => {
      calls.push(["takeDownloadLock", lockPath, record]);
      return { held: true };
    },
    releaseDownloadLock: (lockPath) => calls.push(["releaseDownloadLock", lockPath]),
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
  assert.deepEqual(names(noEntry), ["removeState", "die"]);
});

await check("up refuses an unpacked build missing its workbench entry files, naming the directory and the recovery that fits", async () => {
  const builds = path.join(DATA, "builds", "stable");
  const emptied = (records) =>
    upDeps({
      otherWorktreeRecords: () => records,
      missingBuildEntries: (b, commit) => ({ dir: path.join(b, `vscode-web-stable-${commit}`), missing: BUILD_ENTRY_FILES }),
    });
  const alone = emptied([]);
  await refuses(up(["--sd", "repro.sd"], alone), /^up: the build .*vscode-web-stable-c{40} has a version file but is missing out\/vs\/workbench\/workbench\.web\.main\.internal\.js and out\/vs\/workbench\/workbench\.web\.main\.internal\.css, so the workbench would not load; run `up --fresh` to download it again$/);
  assert.ok(!names(alone).includes("spawn"));
  const shared = emptied([{ worktree: path.join(FIXTURE_ROOT, "w2"), pid: 1, builds, url: "http://localhost:7" }]);
  await refuses(up(["--sd", "repro.sd"], shared), /; (?:[A-Za-z]:)?[\\/]w2 \(pid 1\) serves from that directory, so run `up` with a private `--data <dir>`, which downloads its own copy$/);
  assert.ok(!names(shared).includes("spawn"));
});

await check("up --fresh is refused while another worktree's standing record serves from the quality's directory, and otherwise launches without a commit pin", async () => {
  const builds = path.join(DATA, "builds", "stable");
  const other = { worktree: path.join(FIXTURE_ROOT, "w2"), pid: 1, builds, url: "http://localhost:7" };
  const deps = upDeps({ otherWorktreeRecords: () => [other] });
  await refuses(up(["--sd", "repro.sd", "--fresh"], deps), /^up --fresh would delete .*builds.stable, which (?:[A-Za-z]:)?[\\/]w2 \(pid 1, http:\/\/localhost:7\) serves from; `down` there first, or run `up` without --fresh to serve the build already unpacked$/);
  assert.ok(!names(deps).includes("spawn"));
  const gone = upDeps({ otherWorktreeRecords: () => [{ ...other, pid: 2 }] });
  await up(["--sd", "repro.sd", "--fresh"], gone);
  assert.ok(!spawned(gone)[0].args.includes("--commit"), "a fresh launch downloads rather than pinning the unpacked build");
  assert.equal(gone.state.commit, null);
  const insiders = upDeps({ otherWorktreeRecords: () => [other] });
  await up(["--sd", "repro.sd", "--fresh", "--quality", "insiders"], insiders);
  assert.equal(argOf(spawned(insiders)[0].args, "--quality"), "insiders", "a record on the other quality's directory does not block");
});

await check("the download lock sits beside the builds a download deletes, and only one launch holds it", async () => {
  const layout = dataLayout(DATA);
  const lock = downloadLockPath(layout, "stable");
  assert.equal(path.dirname(lock), layout.locks);
  assert.ok(!lock.startsWith(layout.builds + path.sep), "a lock inside builds would be deleted by the download it guards");
  assert.notEqual(downloadLockPath(layout, "insiders"), lock, "each quality has its own build directory and its own lock");

  const files = new Map();
  const io = {
    mkdirp: () => {},
    writeNew: (file, text) => {
      if (files.has(file)) {
        const err = new Error("EEXIST");
        err.code = "EEXIST";
        throw err;
      }
      files.set(file, text);
    },
    readLock: (file) => (files.has(file) ? JSON.parse(files.get(file)) : null),
    removeLock: (file) => files.delete(file),
  };
  const stands = async (r) => r.pid === 1;
  const mine = { worktree: path.join(FIXTURE_ROOT, "w1"), pid: 1, url: "http://localhost:7", quality: "stable", startedAt: 1 };

  const first = await takeDownloadLock(lock, mine, io, stands);
  assert.deepEqual(first, { held: true });
  assert.deepEqual(io.readLock(lock), mine);

  const second = await takeDownloadLock(lock, { ...mine, worktree: path.join(FIXTURE_ROOT, "w2"), pid: 2 }, io, stands);
  assert.equal(second.held, false, "a launch cannot download into a directory another launch is downloading into");
  assert.deepEqual(second.other, mine, "the refusal knows whose launch to wait for");
  assert.deepEqual(io.readLock(lock), mine, "the standing lock is not overwritten");

  files.set(lock, JSON.stringify({ ...mine, pid: 404 }));
  const afterCrash = await takeDownloadLock(lock, mine, io, stands);
  assert.deepEqual(afterCrash, { held: true }, "a lock whose launch has exited is dropped and retaken");
  assert.deepEqual(io.readLock(lock), mine);

  io.removeLock(lock);
  assert.deepEqual(await takeDownloadLock(lock, mine, io, stands), { held: true }, "a released lock is free again");
});

await check("the workbench captures Chrome's resource location before classifying console errors", async () => {
  const handlers = new Map();
  const page = { on: (event, handler) => handlers.set(event, handler), goto: async () => {} };
  let closed = false;
  const browser = { newPage: async () => page, close: async () => { closed = true; } };
  await withWorkbench("http://localhost:1", { launch: async () => browser }, async ({ consoleLines }) => {
    const missing = "Failed to load resource: the server responded with a status of 404 (Not Found)";
    for (const resource of ["static/devextensions/package.nls.json", "static/devextensions/out/data/spark.d.ts", "cheatsheet.css"]) {
      handlers.get("console")({ type: () => "error", text: () => missing, location: () => ({ url: "http://localhost:1/" + resource }) });
    }
    handlers.get("pageerror")(new Error("unexpected page failure"));
    const { errors, noise } = partitionConsole(consoleLines, WORKBENCH_CONSOLE_NOISE);
    assert.equal(noise["package.nls.json 404"], 1);
    assert.equal(noise["spark.d.ts 404"], 1);
    assert.deepEqual(errors, ["[error] " + missing + " (http://localhost:1/cheatsheet.css)", "[pageerror] unexpected page failure"]);
  });
  assert.equal(closed, true);
});

await check("the workbench noise list names the resources it absorbs, so a 404 the change under test caused is still read", () => {
  const missing = (url) => `[error] Failed to load resource: the server responded with a status of 404 (Not Found) (${url})`;
  const { errors, noise } = partitionConsole(
    [
      missing("http://localhost:1/static/devextensions/package.nls.json"),
      missing("http://localhost:1/static/devextensions/out/data/spark.d.ts"),
      missing("http://localhost:1/static/extensions/sparkdown/out/data/cheatsheet.css"),
      String.raw`[error] %c  ERR color: #f33 [File Watcher ('FileSystemObserver')] Error: Unavailable (FileSystemError): Error: No file system handle registered (\) (file:///) (http://localhost:1/static/build/out/vs/workbench/workbench.web.main.internal.js)`,
      "[pageerror] Not Found",
      "[error] TypeError: cannot read properties of undefined",
      "[log] a log line is not an error",
    ],
    WORKBENCH_CONSOLE_NOISE,
    20,
  );
  assert.deepEqual(errors, [missing("http://localhost:1/static/extensions/sparkdown/out/data/cheatsheet.css"), "[error] TypeError: cannot read properties of undefined"]);
  assert.deepEqual(noise, { "package.nls.json 404": 1, "spark.d.ts 404": 1, "file watcher": 1, "Not Found page error": 1 });
});

await check("known workbench noise cannot hide other statuses, paths or failure messages", () => {
  const errors = [
    "[error] Uncaught SyntaxError: Unexpected token in spark.d.ts",
    "[error] Failed to load resource: the server responded with a status of 500 (Internal Server Error) (http://localhost:1/static/devextensions/out/data/spark.d.ts)",
    "[error] Failed to load resource: the server responded with a status of 404 (Not Found) (http://localhost:1/assets/package.nls.json)",
    "[error] Failed to load resource: the server responded with a status of 404 (Not Found) (http://localhost:1/static/devextensions/out/data/spark.d.ts.map)",
    "[error] Failed to load resource: the server responded with a status of 404 (Not Found) (http://localhost:1/static/devextensions/package.nls.json/child)",
    "[error] Extension activation failed: cannot parse package.nls.json",
    "[error] TypeError: FileSystemObserver is not a constructor",
    "[error] the language client crashed while watching files (File Watcher)",
    "[pageerror] Not Found: the extension host bundle is missing",
  ];
  const captured = partitionConsole(errors, WORKBENCH_CONSOLE_NOISE, 20);
  assert.deepEqual(captured.errors, errors);
  assert.deepEqual(Object.values(captured.noise), [0, 0, 0, 0]);
});

await check("up takes the download lock only when it will download, releases it once the server answers, and is refused while another worktree holds it", async () => {
  const lock = downloadLockPath(dataLayout(path.resolve(DATA)), "stable");
  const pinned = upDeps();
  await up(["--sd", "repro.sd"], pinned);
  assert.ok(!names(pinned).includes("takeDownloadLock"), "a pinned launch does not download, so it does not queue behind one");

  const firstEver = upDeps({ unpackedCommit: () => null });
  await up(["--sd", "repro.sd"], firstEver);
  const order = names(firstEver);
  assert.ok(order.indexOf("takeDownloadLock") < order.indexOf("spawn"), "the lock is taken before the server that deletes the directory starts");
  assert.ok(order.indexOf("releaseDownloadLock") > order.indexOf("waitReady"), "the lock is held until the build is unpacked and the server answers");
  const taken = firstEver.calls.find((c) => c[0] === "takeDownloadLock");
  assert.equal(taken[1], lock);
  assert.equal(taken[2].worktree, firstEver.repoRoot, "the lock names the worktree whose launch holds it, for the refusal to point at");

  const busy = upDeps({
    unpackedCommit: () => null,
    takeDownloadLock: async () => ({ held: false, other: { worktree: path.join(FIXTURE_ROOT, "w2"), pid: 7, url: "http://localhost:9" } }),
  });
  await refuses(up(["--sd", "repro.sd"], busy), /^(?:[A-Za-z]:)?[\\/]w2 \(pid 7\) is downloading the VS Code build into .*builds.stable; two downloads at once delete each other's build, since the server empties that directory before it unpacks\. Wait for that `up` to print READY, then run this again$/);
  assert.ok(!names(busy).includes("spawn"), "nothing is launched into a directory that is being replaced");

  const unreadable = upDeps({
    unpackedCommit: () => null,
    takeDownloadLock: async () => ({ held: false, other: null }),
  });
  await refuses(up(["--sd", "repro.sd"], unreadable), /^the download lock .*download-stable\.lock was taken both times this launch tried for it and its record could not be read back, so who is downloading the VS Code build into .*builds.stable cannot be said; .*Run this again: a lock that was only changing hands is free by then, and one that is still there names its holder$/);
  assert.ok(!names(unreadable).includes("spawn"), "nothing is launched into a directory that may be being replaced");

  const died = upDeps({ unpackedCommit: () => null, waitReady: async () => false });
  await refuses(up(["--sd", "repro.sd"], died), /exited before .* answered; read .*, then `down` and `up` again$/);
  const diedOrder = names(died);
  assert.ok(diedOrder.includes("releaseDownloadLock"), "a failed launch releases the lock rather than wedging every other worktree");
  assert.ok(diedOrder.indexOf("releaseDownloadLock") < diedOrder.indexOf("die"), "the lock is released before the refusal, which in a real run exits the process without running a finally");
  assert.equal(diedOrder.filter((n) => n === "releaseDownloadLock").length, 1, "the lock is released once, so a release cannot remove a lock another launch has since taken");

  const threw = upDeps({
    unpackedCommit: () => null,
    writeProjectSd: () => {
      throw new Error("EACCES");
    },
  });
  await assert.rejects(up(["--sd", "repro.sd"], threw), /EACCES/);
  assert.ok(names(threw).includes("releaseDownloadLock"), "a throw between taking the lock and the server answering gives the lock back");
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
    [["--data", path.join(FIXTURE_ROOT, "elsewhere")], /already serving from .*data .*; `down` first to use .*elsewhere/],
    [["--project", path.join(FIXTURE_ROOT, "otherfolder")], /already serving .*; `down` first to serve another folder/],
  ]) {
    const d = upDeps({ state: serving() });
    await refuses(up(args, d), re);
    assert.deepEqual(names(d), ["die"], `${args.join(" ")} did something before refusing`);
  }
  const same = upDeps({ state: serving() });
  await up(["--data", DATA.toLowerCase()], same);
  assert.deepEqual(names(same), ["log"], "the recorded data directory, in another case, is the same server");
  const folder = upDeps({ state: serving({ ownProject: false, project: path.join(FIXTURE_ROOT, "folder") }) });
  await refuses(up(["--sd", "a.sd"], folder), /which --sd does not write into; `down` first/);
});

await check("while its server is up on a build that has since lost its workbench entry files, up refuses rather than reusing it", async () => {
  const emptied = { missingBuildEntries: (b, commit) => ({ dir: path.join(b, `vscode-web-stable-${commit}`), missing: BUILD_ENTRY_FILES }) };
  const deps = upDeps({ state: serving(), ...emptied });
  await refuses(up(["--sd", "other.sd"], deps), /^up: the build .*vscode-web-stable-c{40} has a version file but is missing .*workbench\.web\.main\.internal\.js .*; `down`, then run `up --fresh` to download it again$/);
  assert.ok(!names(deps).includes("writeProjectSd"), "the served file was rewritten for a workbench that cannot load");
  const downloaded = upDeps({ state: serving({ commit: null }), ...emptied });
  await refuses(up(["--sd", "other.sd"], downloaded), /has a version file but is missing/);
  const shared = upDeps({ state: serving(), ...emptied, otherWorktreeRecords: () => [{ worktree: path.join(FIXTURE_ROOT, "w2"), pid: 1, builds: path.join(DATA, "builds", "stable"), url: "http://localhost:7" }] });
  await refuses(up([], shared), /serves from that directory, so `down`, then run `up` with a private `--data <dir>`, which downloads its own copy$/);
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

const CHAR_W = 8;
const LINE_H = 20;
const DEFAULT_EXPLORER = [
  { name: "assets", level: 1 },
  { name: "main.sd", level: 2 },
  { name: "main.sd.bak", level: 1 },
  { name: "main.sd", level: 1 },
  { name: "other.sd", level: 1 },
];
const inPage = (fn, arg, doc) => new Function("return " + fn.toString())()(arg, doc);

const source = "-> START\n\nscene START\n\n  [[show backdrop missing_backdrop]]\nend";
const renderedLine = "\u00a0\u00a0[[show\u00a0backdrop\u00a0missing_backdrop]]";
const warning = {
  range: { start: { line: 4, character: 18 }, end: { line: 4, character: 34 } },
  message: "Cannot find image named 'missing_backdrop'",
  severity: 2,
};

function fakeDocument({
  caretX = 100 + 18 * CHAR_W, caretY = 130, hover = { text: warning.message }, hoverAfterReads = 3,
  hidden = false, tabTitle = null, splitSuffix = false, suffixLate = false, explorer = DEFAULT_EXPLORER,
  contradictory = false, visualLine = renderedLine,
} = {}) {
  const nodes = (visualLine.match(/\u00a0+|[A-Za-z0-9_]+|[^\u00a0A-Za-z0-9_]+/g) ?? [])
    .map((text) => ({ length: text.length }));
  const line = { textContent: visualLine, getBoundingClientRect: () => ({ top: 130, bottom: 150 }) };
  const state = {
    hover, hoverShown: false, hoverReads: 0, marked: null, tabTitle, splitSuffix, suffixLate,
    suffixWaited: false, explorer, tabs: [{ title: "Welcome", active: false }],
  };
  return {
    state,
    modelReads: [],
    defaultView: { getComputedStyle: (element) => ({ display: "block", visibility: element.hidden ? "hidden" : "visible", opacity: "1" }) },
    querySelectorAll(sel) {
      switch (sel) {
        case ".monaco-editor .cursors-layer .cursor":
          return caretX == null ? [] : [{
            closest: () => ({ querySelectorAll: () => [line] }),
            getBoundingClientRect: () => ({ left: caretX, top: caretY, width: 2, height: LINE_H }),
          }];
        case "[data-drive-hover]":
          return state.marked ? [state.marked] : [];
        case ".monaco-hover": {
          if (!state.hoverShown || !hover || ++state.hoverReads < hoverAfterReads) return [];
          const img = hover.img && {
            hasAttribute: () => hover.img.hasSrc,
            getAttribute: () => hover.img.src ?? null,
            getBoundingClientRect: () => ({ width: hover.img.width ?? 319, height: hover.img.height ?? 180 }),
            naturalWidth: hover.img.naturalWidth,
            naturalHeight: hover.img.naturalHeight,
            complete: hover.img.complete,
          };
          const el = {
            hidden,
            getBoundingClientRect: () => ({ width: 200, height: 40 }),
            innerText: hover.text ?? "",
            querySelector: (q) => (q === "img" ? img || null : null),
            setAttribute: () => (state.marked = el),
            removeAttribute: () => (state.marked = null),
          };
          return [el];
        }
        default:
          this.modelReads.push(sel);
          if (contradictory) return [{ innerText: "0 0", textContent: "a different document" }];
          throw new Error("No model DOM fixture for " + sel);
      }
    },
    createTreeWalker() {
      let index = 0;
      return { nextNode: () => nodes[index++] ?? null };
    },
    createRange() {
      let a;
      let b;
      const place = (node, off) => nodes.slice(0, nodes.indexOf(node)).reduce((sum, item) => sum + item.length, off);
      return {
        setStart: (node, off) => (a = place(node, off)),
        setEnd: (node, off) => (b = place(node, off)),
        getBoundingClientRect: () => ({ left: 100 + a * CHAR_W, right: 100 + b * CHAR_W, width: (b - a) * CHAR_W, height: LINE_H }),
      };
    },
  };
}

await check("word search uses full document lines and UTF-16 offsets without rewriting tabs or non-ASCII", () => {
  const lines = ["scene START", ...Array(50).fill(""), "\t😀 café missing_backdrop", "scene START"];
  assert.deepEqual(locateWord(lines, "missing_backdrop"), { index: 51, start: 9, end: 25 });
  assert.equal(locateWord(lines, "missing"), null);
  assert.equal(locateWord(lines, "caf"), null);
  assert.deepEqual(locateWord(lines, "café", "\t😀"), { index: 51, start: 4, end: 8 });
  assert.equal(locateWord(lines, "café", " 😀"), null);
  assert.deepEqual(locateWord(["a[[show backdrop]]"], "[[show"), { index: 0, start: 1, end: 7 });
});

await check("the page visual checks see actual caret placement and refuse a hidden hover", () => {
  assert.equal(inPage(renderedCaretOnWord, { word: "missing_backdrop" }, fakeDocument()), true);
  assert.equal(inPage(renderedCaretOnWord, { word: "missing_backdrop" }, fakeDocument({ caretX: 100 })), false);
  assert.equal(inPage(renderedCaretOnWord, { word: "missing_backdrop" }, fakeDocument({ caretY: 150 })), false);
  const doc = fakeDocument({ hidden: true, hoverAfterReads: 1 });
  doc.state.hoverShown = true;
  assert.deepEqual(inPage(hoverOnPage, undefined, doc), { present: false });
});

await check("opened is true only for the editor titled exactly as the file", () => {
  assert.equal(editorOpened("main.sd", "main.sd"), true);
  assert.equal(editorOpened("other.sd", "main.sd"), false);
  assert.equal(editorOpened(null, "main.sd"), false);
});

await check("a hover image needs a source, complete load, natural size and visible geometry", () => {
  const image = { hasSrc: true, complete: true, naturalWidth: 96, naturalHeight: 180, width: 319, height: 180 };
  assert.equal(hoverImageFailure(null), null);
  assert.equal(hoverImageFailure(image), null);
  assert.match(hoverImageFailure({ ...image, hasSrc: false }), /no src/);
  assert.match(hoverImageFailure({ ...image, complete: false }), /not finished/);
  assert.match(hoverImageFailure({ ...image, naturalWidth: 0 }), /failed to load/);
  assert.match(hoverImageFailure({ ...image, width: 0 }), /no visible size/);
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

function fakePage(doc, acts, opened) {
  const s = doc.state;
  const matches = (row, has) => {
    if (!has) return true;
    assert.equal(has.sel, ".label-name", `the row filter looks at ${has.sel}`);
    const t = has.hasText;
    return t instanceof RegExp ? t.test(row.name) : typeof t === "string" ? row.name.toLowerCase().includes(t.toLowerCase()) : true;
  };
  const rows = (sel, has) => {
    const level = /\[aria-level="(\d+)"\]/.exec(sel)?.[1];
    return s.explorer.filter((r) => (level == null || String(r.level) === level) && matches(r, has));
  };
  const rowLocator = (sel, has) => ({
    filter: (opts) => rowLocator(sel, opts.has),
    first: () => rowLocator(sel, has),
    waitFor: async () => {
      if (!rows(sel, has).length) throw new Error("Timeout 60000ms exceeded.\n  waiting for locator");
    },
    click: async () => {
      const row = rows(sel, has)[0];
      acts.push(["open", row.name, row.level]);
      for (const t of s.tabs) t.active = false;
      s.tabs.push({ title: s.tabTitle ?? row.name, active: true });
      opened(row.name);
    },
  });
  const text = (value) => ({ first: () => text(value), textContent: async () => value });
  const locator = (sel, opts) => {
    if (sel.startsWith(".explorer-folders-view .monaco-list-row")) return rowLocator(sel, null);
    if (sel === ".label-name") return { sel, hasText: opts?.hasText };
    const active = () => s.tabs.find((t) => t.active)?.title ?? null;
    const dot = (t) => (s.splitSuffix && t != null && t.lastIndexOf(".") > 0 ? t.lastIndexOf(".") : -1);
    if (sel === ".tabs-container .tab.active .label-name") {
      const t = active();
      return text(dot(t) < 0 ? t : t.slice(0, dot(t)));
    }
    if (sel === ".tabs-container .tab.active .label-suffix") {
      const t = active();
      const shown = () => (dot(t) < 0 || (s.suffixLate && !s.suffixWaited) ? [] : [t.slice(dot(t))]);
      const suffixLocator = {
        first: () => suffixLocator,
        waitFor: async () => {
          s.suffixWaited = true;
          if (dot(t) < 0) throw new Error("Timeout 5000ms exceeded.");
        },
        allTextContents: async () => shown(),
      };
      return suffixLocator;
    }
    if (sel === ".tabs-container .tab .label-name") return text(s.tabs[0]?.title ?? null);
    if (sel === "[data-drive-hover]") return { first: () => locator(sel), screenshot: async ({ path: p }) => acts.push(["shot", sel, p]) };
    throw new Error(`the scripted page has no ${sel}`);
  };
  return {
    evaluate: (fn, arg) => {
      acts.push(["evaluate", fn.name, arg]);
      return inPage(fn, arg, doc);
    },
    waitForSelector: async (sel) => acts.push(["wait", sel]),
    locator,
    mouse: { click: async (x, y) => acts.push(["click", x, y]) },
    keyboard: {
      press: async (key) => {
        acts.push(["key", key]);
        if (key === "Control+i") s.hoverShown = true;
      },
    },
    screenshot: async ({ path: p }) => acts.push(["shot", "page", p]),
  };
}

const RECORD = { url: "http://localhost:34123", pid: 1, builds: path.join(DATA, "builds", "stable"), project: path.join(DATA, "projects", "34123") };
const BUILD = { artifacts: 3, oldest: "vscode-sparkdown/out/extension.js", builtAt: "2026-09-08T00:00:00.000Z" };
const initial = { line: 0, character: 0 };

function verifyDeps(doc, { fixture = {}, ...over } = {}) {
  let t = 0;
  const acts = [];
  const logs = [];
  const watchers = new Map();
  const disconnects = new Set();
  let active;
  let selection = { start: initial, end: initial };
  const emit = (method, params) => {
    for (const listener of watchers.get(method) ?? []) listener(params);
  };
  const protocol = {
    onNotification(method, listener) {
      const set = watchers.get(method) ?? new Set();
      watchers.set(method, set);
      set.add(listener);
      return () => set.delete(listener);
    },
    onDisconnect(listener) {
      disconnects.add(listener);
      return () => disconnects.delete(listener);
    },
    async request(method, params, options) {
      acts.push(["request", method, params, options.version]);
      if (method === "editor/read") {
        return { textDocument: active, selection, coordinates: null };
      }
      if (method === "textDocument/hover") {
        assert.equal(params.textDocument.uri, active.uri);
        assert.deepEqual(params.position, selection.start);
        return fixture.hoverModel ?? null;
      }
      assert.equal(method, "textDocument/diagnosticsSettled");
      assert.deepEqual(params, { textDocument: { uri: active.uri }, version: active.version });
      assert.equal(watchers.get("textDocument/didSettleDiagnostics")?.size, 1);
      const result = { uri: active.uri, version: active.version, diagnostics: fixture.diagnostics ?? [warning] };
      emit("textDocument/didSettleDiagnostics", { ...result, version: result.version - 1 });
      emit("textDocument/didSettleDiagnostics", { ...result, uri: "vscode-test-web://mount/other/main.sd" });
      if (fixture.delay) await new Promise((resolve) => setImmediate(resolve));
      if (fixture.switch) active = { ...active, uri: "vscode-test-web://mount/other/main.sd" };
      if (fixture.disconnect) {
        for (const listener of disconnects) listener(new Error("workbench reloaded"));
      }
      if (!fixture.noEvent) emit("textDocument/didSettleDiagnostics", result);
      return { ...result, ...fixture.reply };
    },
    async notify(method, params, options) {
      acts.push(["notify", method, params, options.version]);
      assert.equal(method, "editor/select");
      assert.equal(params.textDocument.uri, active.uri);
      assert.equal(options.version, active.version);
      selection = fixture.selection ?? params.range;
    },
  };
  const page = fakePage(doc, acts, (file) => {
    active = { uri: "vscode-test-web://mount/" + encodeURIComponent(file), version: 7, text: fixture.text ?? source };
    if (fixture.noEndpoint) return;
    assert.equal(watchers.get("editor/didLoad")?.size, 1);
    emit("editor/didLoad", { textDocument: { uri: "vscode-test-web://mount/nested/" + file, version: 7 } });
    emit("editor/didLoad", { textDocument: active });
  });
  return {
    acts,
    logs,
    log: (message) => logs.push(message),
    die: (message) => { throw new Refusal(message); },
    now: () => t,
    sleep: async (ms) => { t += ms; },
    stateFile: path.join(FIXTURE_ROOT, "repo", ".agents", "skills", "drive-vscode-web", ".state.json"),
    readState: () => RECORD,
    recordStands: async () => true,
    isUp: async () => true,
    checkBuild: () => BUILD,
    aliasWorkbenchCss: (builds) => { acts.push(["alias", builds]); return { aliased: [] }; },
    withWorkbench: async (url, options, fn) => {
      acts.push(["workbench", url, options.headless]);
      assert.equal(options.editorProtocol, true);
      return fn({ page, protocol, consoleLines: ["[log] fine", "[pageerror] Not Found"] });
    },
    readFile: () => "return 1 + 1",
    ...over,
  };
}

const keys = (deps) => deps.acts.filter((a) => a[0] === "key").map((a) => a[1]);
const hoverDoc = (options) => fakeDocument(options);

await check("verify accepts the intended immediate load and delayed diagnostics despite missing or contradictory DOM state", async () => {
  for (const contradictory of [false, true]) {
    const doc = fakeDocument({ contradictory });
    const deps = verifyDeps(doc, { fixture: { delay: true } });
    const { report, exitCode } = await verify(["--hover", "missing_backdrop", "--shot", "after.png", "--hover-shot", "hover.png", "--probe", "p.js"], deps);
    assert.equal(exitCode, 0, JSON.stringify(report.failed));
    assert.deepEqual(report.extension, { activated: true, answered: true });
    assert.deepEqual(report.diagnostics, { uri: "vscode-test-web://mount/main.sd", version: 7, diagnostics: [warning] });
    assert.equal(report.editor, "main.sd");
    assert.deepEqual(report.hover.position, { line: 4, character: 18 });
    assert.equal(report.hover.model, null);
    assert.equal(report.hover.visual.text, warning.message);
    assert.deepEqual(keys(deps), ["Control+k", "Control+i"]);
    assert.equal(report.probe, 2);
    assert.equal(report.screenshot, path.resolve("after.png"));
    assert.equal(report.hoverScreenshot, path.resolve("hover.png"));
    assert.deepEqual(doc.modelReads, []);
  }
});

await check("verify accepts a clean versioned diagnostic result and refuses console failures separately", async () => {
  const deps = verifyDeps(fakeDocument(), { fixture: { diagnostics: [] } });
  const result = await verify([], deps);
  assert.equal(result.exitCode, 0, JSON.stringify(result.report.failed));
  assert.deepEqual(result.report.diagnostics.diagnostics, []);
  const withWorkbench = deps.withWorkbench;
  deps.withWorkbench = (url, options, fn) => withWorkbench(url, options, context => fn({ ...context, consoleLines: ["[error] semantic token worker crashed"] }));
  const failed = await verify([], deps);
  assert.equal(failed.exitCode, 1);
  assert.match(failed.report.failed.join("\n"), /semantic token worker crashed/);
});

await check("verify refuses a wrong diagnostic URI or version, or a document switch before using the result", async () => {
  for (const [fixture, failure] of [
    [{ reply: { uri: "vscode-test-web://mount/other/main.sd" } }, /wrong URI or version/],
    [{ reply: { version: 6 } }, /wrong URI or version/],
    [{ reply: { version: null } }, /wrong URI or version/],
    [{ switch: true }, /did not return the intended document/],
    [{ disconnect: true }, /workbench reloaded/],
  ]) {
    const deps = verifyDeps(fakeDocument({ contradictory: true }), { fixture });
    const { report, exitCode } = await verify([], deps);
    assert.equal(exitCode, 1);
    assert.equal(report.settled, false);
    assert.equal(report.diagnostics, undefined);
    assert.match(report.failed[0], failure);
  }
});

await check("verify times out with stale-only notifications or a missing endpoint", async () => {
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    for (const [fixture, method] of [[{ noEndpoint: true }, "editor/didLoad"], [{ noEvent: true }, "textDocument/didSettleDiagnostics"]]) {
      const { report, exitCode } = await verify(["--settle", "0.02"], verifyDeps(fakeDocument(), { fixture }));
      assert.equal(exitCode, 1);
      assert.match(report.failed[0], /timed out/);
      assert.ok(report.failed[0].includes(method));
      assert.equal(report.settled, false);
    }
  } finally {
    clearTimeout(keepAlive);
  }
});

await check("the transport correlates response IDs and rejects old generations after reload or close", async () => {
  const origin = "http://v--example.localhost:34123";
  const protocol = createEditorProtocol();
  const signal = new AbortController().signal;
  const a = protocol.connect(origin);
  const pending = protocol.request("editor/read", {}, { signal });
  const [request] = (await protocol.poll(origin, { ...a, messages: [] })).messages;
  assert.equal(await protocol.poll("http://v--other.localhost:34123", { ...a, messages: [{ id: request.id, result: "wrong origin" }] }), null);
  const wrong = protocol.poll(origin, { ...a, messages: [{ id: request.id + 1, result: "wrong" }] });
  protocol.disconnect("workbench reloaded");
  await assert.rejects(pending, /reloaded/);
  assert.equal(await wrong, null);
  const b = protocol.connect(origin);
  assert.notEqual(b.generation, a.generation);
  assert.equal(await protocol.poll(origin, { ...a, messages: [{ id: request.id, result: "old" }] }), null);
  const fresh = protocol.request("editor/read", {}, { signal });
  const [freshRequest] = (await protocol.poll(origin, { ...b, messages: [] })).messages;
  assert.notEqual(freshRequest.id, request.id);
  const reply = protocol.poll(origin, { ...b, messages: [{ id: freshRequest.id, result: "fresh" }] });
  assert.equal(await fresh, "fresh");
  protocol.close("workbench closed");
  assert.equal(await reply, null);
  assert.equal(protocol.connect(origin), null);
});

await check("an expired request rejects, sends cancellation and cannot be revived by a late reply", async () => {
  const origin = "http://v--example.localhost:34123";
  const protocol = createEditorProtocol();
  const session = protocol.connect(origin);
  try {
    const deadline = new AbortController();
    const pending = protocol.request("editor/read", {}, { signal: deadline.signal });
    const [request] = (await protocol.poll(origin, { ...session, messages: [] })).messages;
    deadline.abort();
    await assert.rejects(pending, /timed out waiting for editor\/read/);
    const poll = await protocol.poll(origin, { ...session, messages: [{ id: request.id, result: "late" }] });
    assert.deepEqual(poll.messages, [{ cancel: request.id }]);
  } finally {
    protocol.close();
  }
});

await check("a valid model hover still fails for wrong geometry, missing popup or a broken image", async () => {
  const fixture = { hoverModel: { contents: "Protocol hover" } };
  for (const [doc, flags, failure] of [
    [fakeDocument({ caretX: 100 }), [], /no visible caret/],
    [fakeDocument({ hidden: true }), [], /no visible hover/],
    [fakeDocument({ hover: null }), [], /no visible hover/],
    [fakeDocument(), ["--hover-image"], /carries no image/],
    [fakeDocument({ hover: { img: { hasSrc: true, naturalWidth: 0, naturalHeight: 0, complete: true } } }), [], /failed to load/],
  ]) {
    const deps = verifyDeps(doc, { fixture });
    const { report, exitCode } = await verify(["--hover", "missing_backdrop", ...flags], deps);
    assert.equal(exitCode, 1);
    assert.deepEqual(report.hover.model, fixture.hoverModel);
    assert.match(report.failed[0], failure);
  }
});

await check("the full model can reveal an offscreen word and verify the selection before looking at the popup", async () => {
  const text = ["scene START", ...Array(55).fill(""), "\t😀 missing_backdrop"].join("\n");
  const doc = fakeDocument({ caretX: 100 + 7 * CHAR_W, visualLine: "    😀 missing_backdrop" });
  const deps = verifyDeps(doc, { fixture: { text, hoverModel: { contents: "Offscreen model hover" } } });
  const { report, exitCode } = await verify(["--hover", "missing_backdrop"], deps);
  assert.equal(exitCode, 0, JSON.stringify(report.failed));
  assert.deepEqual(report.hover.position, { line: 56, character: 4 });
  assert.equal(deps.acts.find(([type]) => type === "notify")[2].scrollIntoView, "center");
  const invalid = verifyDeps(doc, { fixture: { text, selection: { start: initial, end: initial } } });
  const failed = await verify(["--hover", "missing_backdrop"], invalid);
  assert.match(failed.report.failed[0], /selection did not land/);
  assert.deepEqual(keys(invalid), []);
});

await check("served debugging refuses stale complete-runtime artifacts before opening the browser", async () => {
  const checked = [];
  const deps = verifyDeps(hoverDoc(), { checkBuild: surface => { checked.push(surface); throw new Refusal("stale game webview"); } });
  await assert.rejects(verify(["--debug"], deps), /stale game webview/);
  assert.deepEqual(checked, ["desktop"]);
  assert.equal(deps.acts.some(a => a[0] === "workbench"), false);
});

await check("verify refuses a bad option, a hover flag without --hover, an invalid --settle, and a server it cannot vouch for, before opening a browser", async () => {
  for (const [args, re] of [
    [["--bogus"], /^verify: unknown option --bogus$/],
    [["--line", "x"], /^verify: --line needs --hover$/],
    [["--hover-shot", "h.png"], /^verify: --hover-shot needs --hover$/],
    [["--hover-image"], /^verify: --hover-image needs --hover$/],
    [["--settle", "0"], /positive deadline/],
    [["--settle", "2147484"], /timer limit/],
    [["--settle", "abc"], /^verify: --settle needs a number of seconds, not "abc"$/],
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


await check("a file that does not open, or opens under another title, is a failure and nothing is read from it; the title read is the active tab's", async () => {
  const noRow = verifyDeps(fakeDocument({ explorer: [] }));
  let r = await verify(["--hover", "missing_backdrop", "--shot", "after.png"], noRow);
  assert.equal(r.exitCode, 1);
  assert.equal(r.report.opened, false);
  assert.match(r.report.failed[0], /^could not open main\.sd from the explorer: Timeout 60000ms exceeded\.; `status` names the served folder, so check it exists and holds main\.sd at its top level, since a file of that name in a subfolder is never clicked, then `down` and `up` again$/);
  assert.equal(r.report.settled, false);
  assert.ok(!noRow.acts.some(([type]) => type === "request"));
  assert.equal(r.report.screenshot, path.resolve("after.png"), "the screenshot still shows the workbench as it was");
  const nested = verifyDeps(fakeDocument({ explorer: [{ name: "assets", level: 1 }, { name: "main.sd", level: 2 }] }));
  r = await verify([], nested);
  assert.equal(r.report.opened, false, "a file of that name in a subfolder is not the file at the top level");
  assert.match(r.report.failed[0], /^could not open main\.sd from the explorer/);
  const other = verifyDeps(fakeDocument({  }));
  r = await verify(["--file", "other.sd"], other);
  assert.equal(r.report.opened, true);
  assert.deepEqual(other.acts.find((a) => a[0] === "open"), ["open", "other.sd", 1]);
  r = await verify([], verifyDeps(fakeDocument({ tabTitle: "other.sd" })));
  assert.deepEqual(r.report.failed, ['the editor that opened is titled "other.sd", not main.sd']);
  const split = verifyDeps(fakeDocument({ splitSuffix: true }));
  r = await verify([], split);
  assert.equal(r.report.opened, true, "a tab whose extension sits in .label-suffix is the file that opened");
  assert.equal(r.report.editor, "main.sd");
  const late = verifyDeps(fakeDocument({ splitSuffix: true, suffixLate: true }));
  r = await verify([], late);
  assert.equal(r.report.opened, true, "a suffix that renders after the name is waited for");
  assert.equal(r.report.editor, "main.sd");
  r = await verify([], verifyDeps(fakeDocument({ tabTitle: "other.sd", splitSuffix: true })));
  assert.deepEqual(r.report.failed, ['the editor that opened is titled "other.sd", not main.sd']);  const dotted = verifyDeps(fakeDocument({ explorer: [{ name: "a+b.sd", level: 1 }, { name: "a.b.sd", level: 1 }] }));
  r = await verify(["--file", "a.b.sd"], dotted);
  assert.deepEqual(dotted.acts.find((a) => a[0] === "open"), ["open", "a.b.sd", 1], "the name is matched as text, not as a pattern");
});


await check("status prints the one line clean-worktrees reads, which its parser turns into up, launching, down or unknown, and exits 0 only when the URL answers", async () => {
  const lines = [];
  const base = { log: (m) => lines.push(m), stateFile: "S", stateUnreadable: () => false, readState: () => ({ url: "http://localhost:9", pid: 1, project: "p", log: "l" }), isUp: async () => true };
  assert.equal(await status(base), 0);
  assert.deepEqual(lines, ["UP  url=http://localhost:9  pid=1  project=p  log=l"]);
  assert.deepEqual(serversFrom(lines[0]), { state: "up", url: "http://localhost:9", pid: 1 });
  lines.length = 0;
  assert.equal(await status({ ...base, isUp: async () => false }), 1);
  assert.deepEqual(serversFrom(lines[0], () => true), { state: "launching", url: "http://localhost:9", pid: 1 });
  assert.deepEqual(serversFrom(lines[0], () => false), { state: "down", url: "http://localhost:9", pid: 1 });
  lines.length = 0;
  assert.equal(await status({ ...base, readState: () => null }), 1);
  assert.deepEqual(lines, ["down (no state file)"]);
  assert.deepEqual(serverRows([serversFrom(lines[0])]), [], "no record is no row");
  lines.length = 0;
  assert.equal(await status({ ...base, stateUnreadable: () => true }), 1);
  assert.deepEqual(lines, ["unknown (state file unreadable: S; `down` removes it)"]);
  const unknown = serversFrom(lines[0]);
  assert.equal(unknown.state, "unknown", "a record that cannot be read may name a live server, so it is not a down");
  assert.deepEqual(serverRows([unknown]), [unknown]);
});

await check("the server is spawned detached and unreferenced, in the extension directory, with its output on the plan's log", () => {
  const calls = [];
  const child = { pid: 77, unref: () => calls.push(["unref"]) };
  const io = {
    openSync: (p, flag) => {
      calls.push(["open", p, flag]);
      return 5;
    },
    closeSync: (fd) => calls.push(["close", fd]),
    spawnDetached: (cmd, args, opts) => {
      calls.push(["spawnDetached", cmd, args, opts]);
      return child;
    },
  };
  const plan = planFor({ sd: "repro.sd" });
  assert.equal(plan.cwd, path.join(FIXTURE_ROOT, "repo", "vscode-sparkdown"));
  assert.equal(spawnServer(plan, io), 77);
  assert.deepEqual(calls, [
    ["open", plan.logPath, "a"],
    ["spawnDetached", process.execPath, plan.args, { cwd: plan.cwd, stdio: ["ignore", 5, 5], linger: true }],
    ["unref"],
    ["close", 5],
  ]);
});

await check("waitReady polls until the URL answers, then writes the stylesheet alias under the builds directory; keep ends it early; the deadline refuses", async () => {
  const wait = (answers, keep) => {
    const log = [];
    const aliased = [];
    let t = 0;
    let i = 0;
    const io = {
      isUp: async () => answers[Math.min(i++, answers.length - 1)],
      alias: (b) => {
        aliased.push(b);
        return { aliased: [path.join(b, "vscode-web-x", "out", "vs", "workbench")] };
      },
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
      log: (m) => log.push(m),
      die: (m) => {
        throw new Refusal(m);
      },
    };
    return { log, aliased, elapsed: () => t, run: (opts) => waitReady("http://localhost:1", "B", keep, opts, io) };
  };
  const ready = wait([false, false, true]);
  assert.equal(await ready.run({ downloading: false }), true);
  assert.deepEqual(ready.aliased, ["B"], "the alias is written under the builds directory once the server answers");
  assert.equal(ready.elapsed(), 2 * READY_POLL_MS);
  assert.deepEqual(ready.log, ["Waiting for the server...", `stylesheet alias written in ${path.join("B", "vscode-web-x", "out", "vs", "workbench")}`, "READY http://localhost:1"]);
  const downloading = wait([true]);
  await downloading.run({});
  assert.equal(downloading.log[0], "downloading the VS Code build (about 55 MB). Waiting...");
  const gone = wait([false], async () => false);
  assert.equal(await gone.run({}), false);
  assert.deepEqual(gone.aliased, [], "the alias was written for a server that exited");
  const never = wait([false]);
  await refuses(never.run({}), /^timed out after 10 min waiting for http:\/\/localhost:1; read the server log the state file names, then `down`$/);
});

await check("a port is free only when both loopback addresses take a listener and nothing answers HTTP on it", async () => {
  const asked = [];
  const probes = (busyOn, up) => ({
    listens: async (port, host) => {
      asked.push(host);
      return host === busyOn ? "busy" : "free";
    },
    isUp: async () => up,
  });
  assert.equal(await portFree(1, probes(null, false)), true);
  assert.deepEqual(asked, ["127.0.0.1", "::1"]);
  assert.deepEqual(LOOPBACKS, ["127.0.0.1", "::1"]);
  assert.equal(await portFree(1, probes("::1", false)), false, "the IPv6 loopback alone holding the port, which is where the server binds");
  assert.equal(await portFree(1, probes("127.0.0.1", false)), false);
  assert.equal(await portFree(1, probes(null, true)), false, "something answers HTTP on it");
});

await check("the page is 1400 x 900, a record names its own worktree's state file, and the extension id is read from its package.json", () => {
  assert.deepEqual(VIEWPORT, { width: 1400, height: 900 });
  assert.equal(recordFile({ worktree: path.join(FIXTURE_ROOT, "w2") }), path.join(FIXTURE_ROOT, "w2", ".agents", "skills", "drive-vscode-web", ".state.json"));
  assert.equal(path.basename(path.dirname(recordFile({}))), "drive-vscode-web");
});

await check("desktop preview reads per-character story spans without inventing spaces and excludes hidden content", () => {
  const saved = globalThis.document;
  const element = (text, opacity = "1") => ({ id: "", tagName: "SPAN", textContent: text, opacity, getBoundingClientRect: () => ({ x: 0, y: 0, width: 10, height: 10 }), querySelector: () => null, closest: selector => selector === "#game-view, #game-ui" ? {} : null });
  const player = element("");
  const spans = [..."Story text"].map(c => element(c));
  spans.push(element("hidden", "0"));
  const hits = [];
  const d = { defaultView: { getComputedStyle: el => ({ opacity: el.opacity }) }, querySelector: () => player, querySelectorAll: () => spans, elementFromPoint: (x, y) => (hits.push([x, y]), spans[0]), images: [], body: { innerText: "Story text", className: "ready" } };
  globalThis.document = { getElementById: () => ({ contentDocument: d }) };
  try {
    const read = previewRead();
    assert.equal(read.text, "Story text");
    assert.deepEqual(read.center, { id: "", tag: "span", inPlayer: true });
    assert.deepEqual(hits, [[5, 5]]);
  }
  finally { if (saved === undefined) delete globalThis.document; else globalThis.document = saved; }
});

await check("desktop polling fails on host exit or a request that never completes, and captures crashes", async () => {
  assert.equal(await pollUntil(() => "ready", "timeout", { timeout: 100 }), "ready");
  await assert.rejects(pollUntil(() => new Promise(() => {}), "request timeout", { timeout: 10 }), /request timeout/);
  await assert.rejects(pollUntil(() => true, "timeout", { timeout: 100, exited: () => true }), /Owned desktop process exited/);
  assert.deepEqual(hostCrashes("Extension host with pid 7 exited with code: 0, signal: unknown"), []);
  assert.equal(hostCrashes("Extension host with pid 7 exited with code: 134, signal: unknown").length, 1);
});

await check("loaded scripts must match this checkout, including only the exact VS Code CommonJS wrapper", () => {
  const checkout = path.resolve("fixture");
  const url = `${pathToFileURL(path.join(checkout, "vscode-sparkdown/out/extension.js")).href}#vscode-extension`;
  const disk = "module.exports = 42;";
  const io = { readFileSync: () => disk };
  const wrapped = `(function anonymous(module,exports,require\n) {\n${disk}\n//# sourceURL=${url}\n})`;
  assert.equal(scriptProvenance(url, disk, checkout, io).matches, true);
  assert.equal(scriptProvenance(url, wrapped, checkout, io).matches, true);
  assert.equal(scriptProvenance(url, wrapped + "changed", checkout, io).matches, false);
  assert.equal(scriptProvenance(url, disk, path.resolve("other"), io).matches, false);
  assert.equal(scriptProvenance(url.replace("/vscode-sparkdown/", "-stale/vscode-sparkdown/"), disk, checkout, io).matches, false);
});

await check("desktop runtime noise classification is exact and version-specific", () => {
  const known = { error: "%c  ERR color: #f33 Proceeding with EXTRA proposals (authIssuers) because extension is in development mode. Still, this EXTENSION WILL BE BROKEN unless product.json is updated." };
  assert.equal(classifyRuntimeErrors([known], "1.140.0").noise.length, 1);
  assert.equal(classifyRuntimeErrors([known], "1.141.0").unexpected.length, 1);
  assert.equal(classifyRuntimeErrors([{ error: known.error + " changed" }], "1.140.0").unexpected.length, 1);
  assert.equal(classifyRuntimeErrors([{ error: "Game Preview crashed" }], "1.140.0").unexpected.length, 1);
});

await check("desktop shutdown requires owned identity, a successful tree stop and observed exit", async () => {
  const owner = { pid: 42, startedMs: 100 };
  let alive = true, stops = 0;
  const deps = { alive: () => alive, started: async () => 100, platform: "win32", stopWindows: () => { stops++; alive = false; }, timeout: 10 };
  await stopDesktop(owner, deps);
  assert.equal(stops, 1);
  await assert.rejects(stopDesktop(owner, deps), /descendant shutdown is unverified/);
  alive = true;
  await assert.rejects(stopDesktop(owner, { ...deps, started: async () => 200 }), /PID identity changed/);
  assert.equal(stops, 1, "a reused PID is never signalled");
  await assert.rejects(stopDesktop(owner, { ...deps, stopWindows: () => {} }), /did not exit/);
  await assert.rejects(stopDesktop(owner, { ...deps, stopWindows: () => { throw new Error("denied"); } }), /denied/);
  await stopDesktop(owner, { ...deps, platform: "linux", stopLinux: async () => { alive = false; } });
});

await check("desktop preview reveals a covered panel and refuses to read one that remains hidden", async () => {
  let visible = true, active = false, reveals = 0;
  const page = {
    locator: () => ({ isVisible: async () => visible }),
    getByRole: () => ({ first: () => ({ getAttribute: async () => String(active) }) }),
  };
  assert.equal(await ensurePreviewVisible(page, async () => { reveals++; active = true; }), true, "retained off-screen webviews still need their tab revealed");
  assert.equal(reveals, 1);
  assert.equal(await ensurePreviewVisible(page, async () => { reveals++; }), true);
  assert.equal(reveals, 1, "an already visible preview is left active");
  visible = false;
  assert.equal(await ensurePreviewVisible(page, async () => { reveals++; }), false);
});

async function desktopDebugReport(advances) {
  const commands = new Map();
  let frameLine = 10, clock = 0, report, ended = false;
  const session = {
    id: "scenario-game",
    type: "game",
    async customRequest(method) {
      if (method === "threads") return { threads: [{ id: 1 }] };
      if (method === "stackTrace") {
        if (ended) throw new Error("No debugger available");
        return { stackFrames: [{ id: 1, source: { path: "main.sd" }, line: frameLine, column: 1 }] };
      }
      if (method === "scopes") return { scopes: [{ name: "Vars", variablesReference: 1 }] };
      if (method === "variables") return { variables: [{ name: "driver_score", value: "42" }] };
      if (method === "evaluate") return { result: "42" };
      if (method === "next") frameLine = 20;
      if (method === "continue") {
        if (advances === "ended") ended = true;
        else if (advances) frameLine = 30;
      }
      return {};
    },
  };
  const vscode = {
    debug: {
      activeDebugSession: session, registerDebugConfigurationProvider: () => ({}), onDidTerminateDebugSession: () => ({ dispose() {} }), stopDebugging: async () => true,
    },
    commands: { registerCommand: (id, command) => { commands.set(id, command); return {}; } },
  };
  const api = {};
  vm.runInNewContext(fs.readFileSync(new URL("./desktop-harness/extension.cjs", import.meta.url), "utf8"), {
    exports: api, process: { env: { IMPOWER_DESKTOP_SCENARIO: "scenario.json" } },
    Date: { now: () => clock += 1000 }, setTimeout: callback => queueMicrotask(callback),
    require: name => {
      if (name === "vscode") return vscode;
      if (name === "node:path") return path;
      if (name === "node:fs") return {
        readFileSync: () => JSON.stringify({ evidence: FIXTURE_ROOT, debug: { expression: "driver_score", result: "42" } }),
        writeFileSync: (_file, contents) => { report = JSON.parse(contents); },
      };
      throw new Error(`Unexpected harness import: ${name}`);
    },
  });
  api.activate({ subscriptions: [] });
  await commands.get("impower.driver.debug")();
  return report;
}

await check("desktop Continue rejects an acknowledged request that leaves execution at the same frame", async () => {
  const report = await desktopDebugReport(false);
  assert.ok(report.failed.some(message => /Continue did not advance/.test(message)), "an acknowledgment without execution progress must fail");
  assert.notEqual(report.continued, true);
});

await check("desktop Continue accepts execution advancing to another frame", async () => {
  const report = await desktopDebugReport(true);
  assert.deepEqual(report.failed, []);
  assert.equal(report.continued, true);
});

await check("desktop Continue does not equate a vanished adapter with verified progress", async () => {
  const failed = await desktopDebugReport("ended");
  assert.ok(failed.failed.some(message => /No debugger available/.test(message)));
  assert.notEqual(failed.continued, true);
});

await check("F5 waits for all runtime producers before starting the worker copier", async () => {
  const { watchRuntime, runtimeBuilders } = await import("../../../vscode-sparkdown/scripts/f5.mjs");
  const { EventEmitter } = await import("node:events");
  const { PassThrough } = await import("node:stream");
  const children = [], logs = [];
  const start = (_executable, args, options) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => { child.killed = true; child.stdout.end(); child.stderr.end(); child.emit("exit", 0); };
    children.push({ child, args, options });
    return child;
  };
  const promise = watchRuntime(FIXTURE_ROOT, { start, log: line => logs.push(line), io: { readFileSync: () => Buffer.from("current worker"), statSync: () => ({ size: 42 }) } });
  assert.equal(children.length, 6);
  assert.equal(runtimeBuilders.length, 6);
  children[0].child.stdout.write("worker: build failed\n");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(children.length, 6, "failure must not release the copier");
  for (const { child } of children.slice(0, 5)) child.stdout.write("producer: build finished\n");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(children.length, 6, "last webview is still building");
  children[5].child.stdout.write("producer: build finished\n");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(children.length, 7);
  assert.deepEqual(children[6].args, ["scripts/esbuild.ts", "--watch"]);
  assert.ok(!logs.includes("[watch] F5: build finished"));
  children[6].child.stdout.write("extension: build finished\n");
  const watcher = await promise;
  assert.equal(logs.at(-1), "[watch] F5: build finished");
  watcher.stop();
  assert.ok(children.every(({ child }) => child.killed));
});

if (failures) {
  console.log(`${failures} failing`);
  process.exit(1);
}
console.log("All drive-vscode-web driver assertions passed.");

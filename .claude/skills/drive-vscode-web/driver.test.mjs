#!/usr/bin/env node
// Pins the decisions in the VS Code web driver that do not need a server or
// a browser: the stylesheet alias the served build needs, the launch plan
// `up` runs (the server's arguments and where the served project and the
// log go, relative to the directory the server may delete), the commit pin
// that keeps a download from deleting a build in use, the port each worktree
// is pinned to, the stale-build rule, the word location that runs in the
// page, the settle rule verify waits on before reading diagnostics, and the
// flag parsing that refuses a bad option before anything runs. Run:
//   node .claude/skills/drive-vscode-web/driver.test.mjs
//
// aliasWorkbenchCss, unpackedCommit and newerSource run on scratch
// directories laid out like the real ones; the rest are pure. Node's
// built-in assert only.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  PORT_SCAN,
  aliasWorkbenchCss,
  cursorAt,
  dataLayout,
  isSettled,
  launchPlan,
  locateWord,
  newerSource,
  normalizeMonacoText,
  parseFlags,
  portBase,
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

await check("the alias is written where the build ships only the internal stylesheet", () => {
  const dir = build("vscode-web-stable-aaa");
  fs.writeFileSync(path.join(dir, "workbench.web.main.internal.css"), "body{}");
  const result = aliasWorkbenchCss(scratch);
  assert.deepEqual(result.aliased, [dir]);
  assert.equal(fs.readFileSync(path.join(dir, "workbench.web.main.css"), "utf8"), "body{}");
  assert.ok(!fs.existsSync(path.join(dir, "workbench.web.main.css.tmp")), "the temporary copy is renamed away");
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

await check("newerSource finds a source newer than the build and ignores tests, snapshots and node_modules", () => {
  const src = path.join(scratch, "pkg", "src");
  fs.mkdirSync(path.join(src, "deep"), { recursive: true });
  fs.mkdirSync(path.join(src, "node_modules", "x"), { recursive: true });
  fs.mkdirSync(path.join(src, "tests"), { recursive: true });
  const old = Date.now() - 60_000;
  const at = (file, ms) => {
    fs.writeFileSync(file, "x");
    fs.utimesSync(file, new Date(ms), new Date(ms));
  };
  at(path.join(src, "a.ts"), old - 1000);
  at(path.join(src, "deep", "b.ts"), old - 1000);
  assert.equal(newerSource(old, [src]), null);
  at(path.join(src, "node_modules", "x", "index.js"), old + 5000);
  at(path.join(src, "tests", "t.ts"), old + 5000);
  at(path.join(src, "deep", "c.test.ts"), old + 5000);
  assert.equal(newerSource(old, [src]), null, "tests, snapshots and node_modules are not what the extension bundles");
  at(path.join(src, "deep", "b.ts"), old + 5000);
  assert.equal(newerSource(old, [src, path.join(scratch, "absent")]), path.join(src, "deep", "b.ts"));
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

await check("the launch plan tells the server to use, and so possibly delete, only the quality's builds directory", () => {
  const plan = planFor({ sd: "repro.sd" });
  assert.equal(plan.error, undefined);
  assert.equal(plan.builds, path.join("C:", "data", "builds", "stable"));
  assert.equal(argOf(plan.args, "--testRunnerDataDir"), plan.builds);
  assert.equal(planFor({ sd: "repro.sd", quality: "insiders" }).builds, path.join("C:", "data", "builds", "insiders"));
});

await check("the served project and the log are outside the builds directory, and the project is the server's last argument", () => {
  const plan = planFor({ sd: "repro.sd" });
  const { builds } = dataLayout(path.join("C:", "data"));
  const inside = (p) => !path.relative(builds, p).startsWith("..");
  assert.equal(plan.project, path.join("C:", "data", "projects", "34123"));
  assert.equal(plan.ownProject, true);
  assert.ok(!inside(plan.project), `${plan.project} is inside ${builds}`);
  assert.equal(plan.logPath, path.join("C:", "data", "logs", "serve-34123.log"));
  assert.ok(!inside(plan.logPath), `${plan.logPath} is inside ${builds}`);
  assert.equal(plan.args[plan.args.length - 1], plan.project);
  assert.equal(plan.args[0], path.join("C:", "repo", "index.js"));
  assert.equal(argOf(plan.args, "--extensionDevelopmentPath"), path.join("C:", "repo", "vscode-sparkdown"));
  assert.equal(argOf(plan.args, "--port"), "34123");
  assert.ok(plan.args.includes("--esm"));
});

await check("a folder given with --project is served as is, and one inside the builds directory is refused", () => {
  const plan = planFor({ project: path.join("C:", "work", "game") });
  assert.equal(plan.project, path.join("C:", "work", "game"));
  assert.equal(plan.ownProject, false);
  assert.match(planFor({ project: path.join("C:", "data", "builds", "stable", "game") }).error, /inside .*builds/);
  assert.match(planFor({ project: path.join("C:", "data", "builds") }).error, /inside .*builds/);
});

await check("the commit of an unpacked build is passed to the server, and only then", () => {
  const commit = "c".repeat(40);
  assert.equal(argOf(planFor({ sd: "repro.sd", commit }).args, "--commit"), commit);
  assert.ok(!planFor({ sd: "repro.sd" }).args.includes("--commit"));
});

await check("a plan needs exactly one of --sd and --project", () => {
  assert.match(planFor({}).error, /--sd .* or --project/);
  assert.match(planFor({ sd: "a.sd", project: "b" }).error, /not both/);
});

await check("the port is stable for a path, differs between paths, and its scan stays under the web editor driver's 38000", () => {
  const a = portBase("C:\\repo\\impower.worktrees\\fix\\1-a");
  assert.equal(a, portBase("C:\\repo\\impower.worktrees\\fix\\1-a"));
  assert.notEqual(a, portBase("C:\\repo\\impower.worktrees\\fix\\1-b"));
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

await check("--line restricts the search to lines containing the text, matched across Monaco's spaces", () => {
  assert.deepEqual(locateWord(rendered, "START", "scene START"), { index: 2, start: 6, end: 11 });
  assert.equal(locateWord(rendered, "START", "no such line"), null);
  assert.equal(locateWord([], "START"), null);
});

await check("cursorAt reads the status bar's selection item", () => {
  assert.deepEqual(cursorAt("Ln 8, Col 5"), { line: 8, col: 5 });
  assert.deepEqual(cursorAt("Ln 12, Col 3 (5 selected)"), { line: 12, col: 3 });
  assert.equal(cursorAt(null), null);
  assert.equal(cursorAt("UTF-8"), null);
});

await check("readings that never change settle only after the floor", () => {
  const same = (n) => Array(n).fill('{"problems":"0 0"}');
  assert.equal(isSettled(same(7)), false);
  assert.equal(isSettled(same(8)), false, "eight identical readings are the workbench before the server");
  assert.equal(isSettled(same(24)), false);
  assert.equal(isSettled(same(25)), true);
});

await check("readings that change and then hold settle as soon as they have held", () => {
  const series = ['{"problems":"0 0"}', '{"problems":"0 0"}', '{"problems":"0 0"}', ...Array(8).fill('{"problems":"0 2"}')];
  assert.equal(isSettled(series), true);
  assert.equal(isSettled(series.slice(0, -1)), false, "seven held readings are not eight");
});

await check("a change inside the tail is not settled", () => {
  const series = [...Array(20).fill("a"), ...Array(4).fill("b"), ...Array(4).fill("c")];
  assert.equal(isSettled(series), false);
});

await check("the settle thresholds are parameters", () => {
  assert.equal(isSettled(["a", "a", "a"], { stableReads: 3, minReads: 3 }), true);
  assert.equal(isSettled(["a", "b", "b"], { stableReads: 2, minReads: 10 }), true);
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

await check("a number flag refuses anything that is not a count of seconds", () => {
  assert.deepEqual(parseFlags(["--settle", "60s"], spec), { error: '--settle needs a number of seconds, not "60s"' });
  assert.deepEqual(parseFlags(["--settle", "-1"], spec), { error: '--settle needs a number of seconds, not "-1"' });
  assert.deepEqual(parseFlags(["--settle", "abc"], spec), { error: '--settle needs a number of seconds, not "abc"' });
  assert.deepEqual(parseFlags(["--settle", "12.5"], spec), { opts: { "--settle": 12.5 } });
});

if (failures) {
  console.log(`${failures} failing`);
  process.exit(1);
}
console.log("All drive-vscode-web driver assertions passed.");

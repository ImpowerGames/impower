#!/usr/bin/env node
// Pins the decisions in the VS Code web driver that do not need a server or
// a browser: the stylesheet alias the served build needs, the port each
// worktree is pinned to, the non-breaking-space rule for Monaco's rendered
// text, the settle rule verify waits on before reading diagnostics, and the
// flag parsing that refuses a misspelt option before anything runs. Run:
//   node .claude/skills/drive-vscode-web/driver.test.mjs
//
// aliasWorkbenchCss runs on a scratch directory laid out like a data
// directory with an unpacked build; the rest are pure. Node's built-in
// assert only.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { aliasWorkbenchCss, dataLayout, isSettled, normalizeMonacoText, parseFlags, portBase } from "./driver.mjs";

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
});

await check("a build that already has the linked stylesheet is left alone and reported as present", () => {
  const dir = build("vscode-web-stable-bbb");
  fs.writeFileSync(path.join(dir, "workbench.web.main.internal.css"), "internal");
  fs.writeFileSync(path.join(dir, "workbench.web.main.css"), "already here");
  const result = aliasWorkbenchCss(scratch);
  assert.ok(result.present.includes(dir));
  assert.ok(!result.aliased.includes(dir));
  assert.equal(fs.readFileSync(path.join(dir, "workbench.web.main.css"), "utf8"), "already here");
});

await check("a second run touches nothing: every build is present, none aliased", () => {
  const result = aliasWorkbenchCss(scratch);
  assert.deepEqual(result.aliased, []);
  assert.equal(result.present.length, 2);
});

await check("a directory that is not a build, and a build still downloading, are skipped", () => {
  fs.mkdirSync(path.join(scratch, "projects", "34001"), { recursive: true });
  build("vscode-web-stable-ccc"); // unpacked far enough to have the directory, no stylesheet yet
  const result = aliasWorkbenchCss(scratch);
  assert.deepEqual(result.aliased, []);
  assert.equal(result.present.length, 2);
});

await check("a data directory that does not exist yet aliases nothing and does not throw", () => {
  const result = aliasWorkbenchCss(path.join(scratch, "missing"));
  assert.deepEqual(result, { aliased: [], present: [] });
});

fs.rmSync(scratch, { recursive: true, force: true });

await check("projects and logs sit beside the builds directory, never inside it", () => {
  const { builds, projects, logs } = dataLayout(path.join("C:", "data"));
  const inside = (p) => path.relative(builds, p).startsWith("..") === false;
  assert.equal(path.dirname(builds), path.join("C:", "data"));
  assert.ok(!inside(projects), `${projects} is inside ${builds}, which the server clears on a new download`);
  assert.ok(!inside(logs), `${logs} is inside ${builds}, which the server clears on a new download`);
});

await check("the port is stable for a path and in the driver's own range", () => {
  const a = portBase("C:\\repo\\impower.worktrees\\fix\\1-a");
  assert.equal(a, portBase("C:\\repo\\impower.worktrees\\fix\\1-a"));
  assert.ok(a >= 34000 && a < 35000, `${a} is outside 34000..34999`);
  assert.notEqual(a, portBase("C:\\repo\\impower.worktrees\\fix\\1-b"));
});

await check("Monaco's non-breaking spaces normalize to the source's spaces", () => {
  assert.equal(normalizeMonacoText("show\u00a0backdrop\u00a0pair"), "show backdrop pair");
  assert.equal(normalizeMonacoText(""), "");
  assert.equal(normalizeMonacoText(undefined), "");
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

const spec = { "--sd": "value", "--headed": "flag" };

await check("flags parse into values and booleans", () => {
  assert.deepEqual(parseFlags(["--sd", "repro.sd", "--headed"], spec), { opts: { "--sd": "repro.sd", "--headed": true } });
  assert.deepEqual(parseFlags([], spec), { opts: {} });
});

await check("an unknown flag is refused by name", () => {
  assert.deepEqual(parseFlags(["--shot"], spec), { error: "unknown option --shot" });
});

await check("a value flag with nothing after it, or another flag after it, is refused", () => {
  assert.deepEqual(parseFlags(["--sd"], spec), { error: "--sd needs a value" });
  assert.deepEqual(parseFlags(["--sd", "--headed"], spec), { error: "--sd needs a value" });
});

if (failures) {
  console.log(`${failures} failing`);
  process.exit(1);
}
console.log("All drive-vscode-web driver assertions passed.");

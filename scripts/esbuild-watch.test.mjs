// The workers' esbuild --watch rebuilds from file system change notifications
// (scripts/esbuild-watch.mjs) instead of esbuild's ctx.watch(), which polls
// the build graph's files: about 2,000 file opens a second per idle watcher on
// Windows. The helper watches the directories of the last build's inputs,
// outside node_modules, plus a plugin's extra inputs; refreshes that set after
// every build; rebuilds once per burst of changes to an input, or when a file
// appears in a watched directory; keeps watching after a failed rebuild, adding
// the files its errors name; and never calls ctx.watch().
// Run:
//   node scripts/esbuild-watch.test.mjs
//
// A stand-in context answers rebuild() with a metafile listing whatever graph
// the check sets, over real files in a scratch directory, so the change events
// are the system's own. Node's built-in assert only.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { watchBuild } from "./esbuild-watch.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "esbuild-watch-"));
console.log(`scratch directory: ${scratch}`);
const at = (...p) => path.join(scratch, ...p);
const write = (rel, text = `// ${rel} ${Date.now()} ${Math.random()}\n`) => {
  fs.mkdirSync(path.dirname(at(rel)), { recursive: true });
  fs.writeFileSync(at(rel), text);
};
for (const rel of ["src/a.ts", "src/b.ts", "src/notes.txt", "lib/c.ts", "raw/data.txt", "node_modules/dep/index.js", "extra/e.ts", "worker/w.ts", "broken/x.ts"]) write(rel);
// Windows paths compare without case, as the helper's do.
const key = (dir) => (process.platform === "win32" ? path.resolve(dir).toLowerCase() : path.resolve(dir));
const dirs = (...rels) => rels.map((rel) => key(at(rel))).sort();

const graph = ["src/a.ts", "src/b.ts", "lib/c.ts", `raw-loader:${at("raw", "data.txt")}`, "node_modules/dep/index.js"];
let builds = 0;
let failWith = null;
let watchCalls = 0;
const ctx = {
  async rebuild() {
    builds++;
    if (failWith) throw failWith;
    return { metafile: { inputs: Object.fromEntries(graph.map((input) => [input, { bytes: 1 }])) } };
  },
  async watch() {
    watchCalls++;
  },
};
const errors = [];
const extra = new Set([at("worker", "w.ts")]);

// Waits until `builds` reaches `count`, then a little longer, so a second,
// unwanted rebuild would be counted too.
async function settle(count) {
  for (let i = 0; i < 100 && builds < count; i++) await sleep(50);
  await sleep(400);
  return builds;
}
// A short wait in which nothing may rebuild.
async function quiet() {
  const before = builds;
  await sleep(600);
  return builds - before;
}

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

let watcher;
try {
  watcher = await watchBuild(ctx, { cwd: scratch, debounceMs: 50, extraInputs: () => extra, onError: (e) => errors.push(e) });

  await check("the first build runs at once and its inputs' directories are watched, outside node_modules", () => {
    assert.equal(builds, 1);
    assert.deepEqual(watcher.watched().sort(), dirs("src", "lib", "raw", "worker"));
  });

  await check("ctx.watch(), which polls, is never called, and an idle watcher does not rebuild", async () => {
    assert.equal(await quiet(), 0);
    assert.equal(watchCalls, 0);
  });

  await check("an edit to an input rebuilds once, however many writes it takes", async () => {
    write("src/a.ts");
    write("src/a.ts");
    assert.equal(await settle(2), 2);
  });

  await check("a change to a file outside the build does not rebuild", async () => {
    write("src/notes.txt");
    assert.equal(await quiet(), 0);
  });

  await check("a namespaced input (a ?raw import) and a plugin's extra input are watched", async () => {
    write("raw/data.txt");
    assert.equal(await settle(3), 3);
    write("worker/w.ts");
    assert.equal(await settle(4), 4);
  });

  await check("a new import is watched from the build that first reads it", async () => {
    graph.push("extra/e.ts");
    write("src/b.ts");
    assert.equal(await settle(5), 5);
    assert.ok(watcher.watched().includes(key(at("extra"))), watcher.watched().join("\n"));
    write("extra/e.ts");
    assert.equal(await settle(6), 6);
  });

  await check("a file appearing in a watched directory rebuilds, since it can satisfy a failed import", async () => {
    write("src/new.ts");
    assert.equal(await settle(7), 7);
  });

  await check("a failed rebuild is reported, watching continues, and the files its errors name are watched", async () => {
    failWith = Object.assign(new Error("Build failed with 1 error"), { errors: [{ text: "x", location: { file: "broken/x.ts" } }] });
    write("src/a.ts");
    assert.equal(await settle(8), 8);
    assert.equal(errors.length, 1);
    assert.deepEqual(watcher.watched().sort(), dirs("src", "lib", "raw", "worker", "extra", "broken"));
    failWith = null;
    write("broken/x.ts");
    assert.equal(await settle(9), 9);
    assert.equal(errors.length, 1);
    assert.ok(!watcher.watched().includes(key(at("broken"))), "a successful build still watches the directory only its failure named");
  });

  await check("a directory no input needs any more is no longer watched", async () => {
    graph.splice(graph.indexOf("lib/c.ts"), 1);
    write("src/a.ts");
    assert.equal(await settle(10), 10);
    assert.ok(!watcher.watched().includes(key(at("lib"))), watcher.watched().join("\n"));
    write("lib/c.ts");
    assert.equal(await quiet(), 0);
  });

  await check("close stops watching", async () => {
    watcher.close();
    assert.deepEqual(watcher.watched(), []);
    write("src/a.ts");
    assert.equal(await quiet(), 0);
  });

  await check("a context built without a metafile is refused", async () => {
    await assert.rejects(watchBuild({ rebuild: async () => ({}) }, { cwd: scratch }), /metafile: true/);
  });
} catch (err) {
  failures++;
  console.log(`FAIL: ${err.message}`);
} finally {
  watcher?.close();
  console.log(`Remove scratch directory: ${scratch}`);
  try {
    fs.rmSync(scratch, { recursive: true, force: true });
  } catch (err) {
    console.log(`could not remove ${scratch} (${err.code}); preserve it for recovery`);
  }
}

if (failures) {
  console.log(`${failures} failing`);
  process.exit(1);
}
console.log("all passed");

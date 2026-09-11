#!/usr/bin/env node
// Pins seedProject, which `verify --project`, `ui --project` and `seed` use
// to load a whole project (a directory or an exported zip) into the editor's
// OPFS storage (#435), `clearProject` behind `seed --clear`, and the wiring
// of those commands to them. Run:
//   node .agents/skills/drive-web-editor/seed-project.test.mjs
//
// The functions the driver ships into the page close over nothing, so this
// runs them in Node against a stub of `navigator.storage.getDirectory()` (an
// in-memory tree with the handle methods the seeder calls, throwing real
// DOMExceptions as the browser does) through a stub page whose `evaluate`
// rebuilds the function from its source in a `node:vm` context holding only
// the page's globals and structured-clones the argument and the result, as
// Playwright's wire does; a page function that reaches for module scope or a
// Node global fails here before it fails in the browser. The stub can write
// a named file short, refuse a named file's write, refuse a named entry's
// removal or listing, or refuse storage outright, so the read-back check,
// the cleanup, the prune and the untouched-storage promise are each pinned
// by a case that fails without them.
//
// What is pinned: the walk yields every non-dot file with `/`-separated
// relative paths, follows links, seeds a tree reachable by two names under
// both, refuses only a link back into the walk or above it, records an
// unreadable link in `failed`, refuses `node_modules` and `dist` and the
// bounds on count and bytes; the batch plan keeps every batch under its
// budget and an oversize file alone; a seed lands every file byte for byte,
// removes the previous project's stale entries and keeps its dot entries; a
// source with no files, or no root `main.sd`, a page that remembers another
// project, a storage that refuses, or a previous entry whose kind clashes
// with the source, is a `reason` with storage untouched; a refused or short
// write is a `reason` that leaves the previous project in place under the
// files that landed, with the marker set, and the next seed clears it; a
// refused removal, or a throw after one, is a `reason` whose `removed` lists
// what really went; the zip rules, and the zip bound refusing on the central
// directory before inflating, with a refused entry named from the filter
// itself; a zip's single top-level folder without `main.sd` kept and named
// with a note; the bound on directories counting each one entered, against
// a link fan-out; `seed --clear`, and its reason naming the emptied project
// when a write then fails; a flag with no value refused before the browser
// on `seed` and `verify`; `withEditor` handing over the launch mode from the
// state record and same-origin without one; the mount wait's default clock,
// and the commands passing their own `ensureScriptEditor` into it; the shape
// of every gated step; and that `verify`, `ui` and `seed` each seed, stop on
// `reason` without reloading, put the project in before `--sd`, skip the
// program wait on an unmounted game, reload after a seed that landed whole,
// keep a thrown `--sd` or `--project` step's report and stop the run on it,
// and in cross-origin mode stop before loading the page or writing anything.
// The zip round trip needs fflate, which the workspace install puts under
// the root node_modules; in a worktree without it those cases report SKIP.
//
// Node's built-in assert only.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import {
  SEED_MARKER,
  beginSeed,
  clearProject,
  gameMountedWithin,
  waitForGame,
  interruptedSeed,
  planBatches,
  loadedScript,
  programWarning,
  pruneProject,
  readProjectFile,
  seed,
  seedProject,
  ui,
  verify,
  walkProjectDir,
  withEditor,
  writeMainSd,
  writeProjectBatch,
  zipProjectEntries,
} from "./driver.mjs";

let failures = 0;
const check = async (name, fn) => {
  process.exitCode = 0;
  try {
    await fn();
    console.log(`PASS: ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL: ${name}`);
    console.log(`  ${String(err.stack || err.message).split("\n").slice(0, 6).join("\n  ")}`);
  }
  process.exitCode = 0;
};

// What the browser throws: a DOMException whose message carries no name.
const domError = (name, message) => new DOMException(message, name);

// An in-memory stand-in for the OPFS root: directories hold a Map of
// children, files hold a Uint8Array. `refuse` names files whose
// createWritable throws, `shortWrite` maps a file name to the byte count its
// close keeps, `refuseRemove` names entries whose removal throws,
// `refuseList` names directories whose second listing throws (a seed lists a
// directory once to check kinds and once to prune, so the prune is the
// listing that fails), and `refuseRoot` makes the root refuse every
// directory handle.
function stubStorage({ refuse = [], shortWrite = {}, refuseRemove = [], refuseList = [], refuseRoot = false } = {}) {
  const dir = () => ({ kind: "directory", children: new Map(), listings: 0 });
  const rootNode = dir();
  const dirHandle = (node, name) => ({
    kind: "directory",
    name,
    async getDirectoryHandle(child, { create = false } = {}) {
      if (node === rootNode && refuseRoot) throw domError("QuotaExceededError", "storage is unavailable");
      let n = node.children.get(child);
      if (!n) {
        if (!create) throw domError("NotFoundError", `no directory "${child}"`);
        n = dir();
        node.children.set(child, n);
      }
      if (n.kind !== "directory") throw domError("TypeMismatchError", `"${child}" is a file`);
      return dirHandle(n, child);
    },
    async getFileHandle(child, { create = false } = {}) {
      let n = node.children.get(child);
      if (!n) {
        if (!create) throw domError("NotFoundError", `no file "${child}"`);
        n = { kind: "file", bytes: new Uint8Array(0) };
        node.children.set(child, n);
      }
      if (n.kind !== "file") throw domError("TypeMismatchError", `"${child}" is a directory`);
      return fileHandle(n, child);
    },
    async removeEntry(child, { recursive = false } = {}) {
      const n = node.children.get(child);
      if (!n) throw domError("NotFoundError", `no entry "${child}"`);
      if (refuseRemove.includes(child)) throw domError("NoModificationAllowedError", `"${child}" is in use`);
      if (n.kind === "directory" && n.children.size > 0 && !recursive) throw domError("InvalidModificationError", `"${child}" is not empty`);
      node.children.delete(child);
    },
    async *entries() {
      node.listings += 1;
      if (refuseList.includes(name) && node.listings > 1) throw domError("NotReadableError", `"${name}" cannot be listed`);
      for (const [n, c] of node.children) yield [n, c.kind === "directory" ? dirHandle(c, n) : fileHandle(c, n)];
    },
  });
  const fileHandle = (node, name) => ({
    kind: "file",
    name,
    async createWritable() {
      if (refuse.includes(name)) throw domError("NoModificationAllowedError", `"${name}" is locked`);
      let pending = new Uint8Array(0);
      return {
        async write(data) {
          const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
          const next = new Uint8Array(pending.length + bytes.length);
          next.set(pending);
          next.set(bytes, pending.length);
          pending = next;
        },
        async close() {
          node.bytes = name in shortWrite ? pending.subarray(0, shortWrite[name]) : pending;
        },
      };
    },
    async getFile() {
      const bytes = node.bytes;
      return { size: bytes.length, async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); } };
    },
  });
  return { root: dirHandle(rootNode, ""), tree: rootNode, refuse };
}

// The page's globals a page function or an inline evaluate reaches for, and
// nothing of Node's. `remembered` is what localStorage answers for the
// project id.
function stubGlobals(storage, { remembered = null } = {}) {
  return {
    navigator: { storage: { getDirectory: async () => storage.root } },
    localStorage: { getItem: (key) => (key === "project" ? remembered : null) },
    document: { querySelector: (selector) => (selector.includes("-trigger-main") ? {} : null) },
    window: {},
    atob,
    btoa,
  };
}

// A page whose `evaluate` rebuilds the function from source in a context
// holding only the page's globals, as the browser does, and clones the
// argument and the result, as the wire does. Navigation and screenshots are
// counted, waits resolve at once, and event listeners are accepted and
// never called.
function stubPage(globals) {
  const context = vm.createContext({ ...globals });
  const page = {
    gotos: 0,
    reloads: 0,
    screenshots: [],
    evaluate: async (f, arg) => {
      const rebuilt = vm.runInContext(`(${f.toString()})`, context);
      const out = await rebuilt(arg === undefined ? undefined : structuredClone(arg));
      return out === undefined ? undefined : structuredClone(out);
    },
    on: () => {},
    goto: async () => {
      page.gotos += 1;
    },
    reload: async () => {
      page.reloads += 1;
    },
    waitForFunction: async () => ({}),
    waitForTimeout: async () => {},
    screenshot: async ({ path: out }) => {
      page.screenshots.push(out);
    },
  };
  return page;
}

// Runs `fn` with a stub storage and a page over it.
async function withStub(opts, fn) {
  const storage = stubStorage(opts);
  const page = stubPage(stubGlobals(storage, opts));
  return fn({ page, ...storage });
}

const readBack = async (page, filePath) => {
  const b64 = await page.evaluate(readProjectFile, { project: "local", path: filePath });
  return b64 == null ? null : Buffer.from(b64, "base64");
};
const marked = (page) => interruptedSeed(page);
const entryNames = (tree, ...segments) => {
  let node = tree;
  for (const s of segments) node = node.children.get(s);
  return [...node.children.keys()].sort();
};

// Writes files into the stub as a previous project, through the driver's own
// batch writer, which leaves no marker.
async function previousProject(page, files) {
  const entries = Object.entries(files).map(([p, content]) => ({ path: p, base64: Buffer.from(content).toString("base64") }));
  const out = await page.evaluate(writeProjectBatch, { project: "local", entries });
  assert.deepEqual(out.failed, [], "the previous project did not land");
}

// A fixture project on disk: a script, a nested asset, a binary that covers
// every byte value, a dot file to skip and a dot directory to skip.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "seed-project-"));
const fixture = path.join(scratch, "project");
const allBytes = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
const files = {
  "main.sd": Buffer.from("include scripts/chars\n\nALICE:\n  Hello from the fixture.\n"),
  "scripts/chars.sd": Buffer.from("define character ALICE\n"),
  "assets/portraits/alice.webp": allBytes,
  "assets/empty.txt": Buffer.alloc(0),
};
for (const [rel, bytes] of Object.entries(files)) {
  const abs = path.join(fixture, ...rel.split("/"));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, bytes);
}
fs.writeFileSync(path.join(fixture, ".name"), "not seeded");
fs.mkdirSync(path.join(fixture, ".git"));
fs.writeFileSync(path.join(fixture, ".git", "HEAD"), "ref: refs/heads/main");
const totalBytes = Object.values(files).reduce((n, b) => n + b.length, 0);
const writeTree = (root, tree) => {
  for (const [rel, content] of Object.entries(tree)) {
    const abs = path.join(root, ...rel.split("/"));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return root;
};

await check("walking a directory yields every non-dot file with /-separated relative paths, sorted, and counts the dot entries it skipped", () => {
  const walked = walkProjectDir(fixture);
  assert.deepEqual(walked.files.map((f) => f.path), ["assets/empty.txt", "assets/portraits/alice.webp", "main.sd", "scripts/chars.sd"]);
  assert.equal(Buffer.compare(walked.files[1].bytes, allBytes), 0);
  assert.equal(walked.skipped, 2);
  assert.deepEqual(walked.failed, []);
});

// A directory link is a junction on Windows, which needs no privilege, and a
// symlink elsewhere; a machine that refuses both reports the case as skipped.
const linkDir = (target, link) => fs.symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
{
  const linked = writeTree(path.join(scratch, "linked"), { "main.sd": "x", "shared/art/bunny.webp": "art", "scripts/keep.sd": "k" });
  const outside = writeTree(path.join(scratch, "outside"), { "art/bunny.webp": "art" });
  let links = true;
  try {
    // Two links to one tree outside the project, a link from one of the
    // project's directories to another, a dangling link, a link to the
    // project itself, and a link to its parent.
    linkDir(outside, path.join(linked, "shared-link"));
    linkDir(outside, path.join(linked, "twice"));
    linkDir(path.join(linked, "shared"), path.join(linked, "scripts", "to-shared"));
    const gone = writeTree(path.join(scratch, "gone"), { "x.txt": "x" });
    linkDir(gone, path.join(linked, "dangling"));
    fs.rmSync(gone, { recursive: true, force: true });
    linkDir(linked, path.join(linked, "loop"));
    linkDir(scratch, path.join(linked, "up"));
  } catch (err) {
    links = false;
    console.log(`SKIP: the link cases need a directory link, which this machine refused (${err.code ?? err.message})`);
  }
  if (links) {
    await check("the walk follows a directory link, seeds a tree reachable by two names under both, and records a dangling link and a link back into the walk or above it in failed, without reading past the link", () => {
      const walked = walkProjectDir(linked);
      assert.deepEqual(walked.files.map((f) => f.path), ["main.sd", "scripts/keep.sd", "scripts/to-shared/art/bunny.webp", "shared-link/art/bunny.webp", "shared/art/bunny.webp", "twice/art/bunny.webp"]);
      assert.deepEqual(walked.failed.map((f) => f.path).sort(), ["dangling", "loop", "up"]);
      assert.match(walked.failed.find((f) => f.path === "dangling").reason, /cannot be read/);
      assert.match(walked.failed.find((f) => f.path === "loop").reason, /links back to a directory the walk is inside/);
      assert.match(walked.failed.find((f) => f.path === "up").reason, /links back to a directory the walk is inside, or to one above it/);
      assert.ok(!walked.files.some((f) => f.path.startsWith("up/")), "the walk read the project's siblings through a link to its parent");
    });
    await check("a project with an unreadable link is a reason naming it, and nothing is written", async () => {
      await withStub({}, async ({ page, tree }) => {
        const report = await seedProject(page, linked);
        assert.match(report.reason, /^3 project entries could not be read \(first: dangling: cannot be read \(ENOENT\)\); nothing was written$/);
        assert.equal(report.storage, "untouched");
        assert.equal(tree.children.size, 0);
      });
    });
    await check("a project whose only links are to a shared tree seeds whole", async () => {
      const shared = writeTree(path.join(scratch, "shared-only"), { "main.sd": "x" });
      linkDir(outside, path.join(shared, "portraits"));
      linkDir(outside, path.join(shared, "backdrops"));
      await withStub({}, async ({ page }) => {
        const report = await seedProject(page, shared);
        assert.equal(report.reason, undefined, report.reason);
        assert.equal(report.files, 3);
        assert.equal((await readBack(page, "portraits/art/bunny.webp")).toString(), "art");
        assert.equal((await readBack(page, "backdrops/art/bunny.webp")).toString(), "art");
      });
    });
    await check("the bound on directories counts each one entered, so a link fan-out that reaches six real directories under 180 names is refused by it", () => {
      // main.sd and five sibling directories a..e; each of a..d holds three
      // links to the next. None leads back into the walk, so every name is
      // entered: the root, a, b once from the root and three times from a,
      // c thirteen times, d forty, e a hundred and twenty-one. A count of
      // distinct directories would say six and never reach a bound.
      const fanout = writeTree(path.join(scratch, "fanout"), { "main.sd": "x" });
      const names = ["a", "b", "c", "d", "e"];
      for (const name of names) fs.mkdirSync(path.join(fanout, name));
      for (let i = 0; i + 1 < names.length; i++) {
        for (let k = 0; k < 3; k++) linkDir(path.join(fanout, names[i + 1]), path.join(fanout, names[i], `to${k}`));
      }
      const loose = { files: 100, dirs: 200, bytes: 1_000_000, fileBytes: 1_000_000 };
      assert.throws(() => walkProjectDir(fanout, { ...loose, dirs: 20 }), /^Error: the project has more than 20 directories, the bound on a seed \(reached at [a-e](\/to[0-2])+\)$/);
      assert.throws(() => walkProjectDir(fanout, { ...loose, dirs: 179 }), /more than 179 directories/);
      const walked = walkProjectDir(fanout, { ...loose, dirs: 180 });
      assert.deepEqual(walked.files.map((f) => f.path), ["main.sd"]);
      assert.deepEqual(walked.failed, []);
    });
  }
}

await check("the walk refuses node_modules and dist, and the bounds on file count, total bytes and one file's bytes, each with a reason", () => {
  const pkg = writeTree(path.join(scratch, "package"), { "main.sd": "x", "node_modules/dep/index.js": "y" });
  assert.throws(() => walkProjectDir(pkg), /holds node_modules\/, which a project never does/);
  const built = writeTree(path.join(scratch, "built"), { "main.sd": "x", "out/dist/bundle.js": "y" });
  assert.throws(() => walkProjectDir(built), /holds out\/dist\/, which a project never does/);
  const loose = { files: 100, dirs: 100, bytes: 1_000_000, fileBytes: 1_000_000 };
  assert.throws(() => walkProjectDir(fixture, { ...loose, files: 3 }), /more than 3 files/);
  // The fixture is four directories deep in all (the root, assets,
  // assets/portraits, scripts); the bound counts each one entered.
  assert.throws(() => walkProjectDir(fixture, { ...loose, dirs: 3 }), /the project has more than 3 directories, the bound on a seed \(reached at /);
  assert.equal(walkProjectDir(fixture, { ...loose, dirs: 4 }).files.length, 4);
  assert.throws(() => walkProjectDir(fixture, { ...loose, bytes: 100 }), /over the 100-byte bound on a seed/);
  assert.throws(() => walkProjectDir(fixture, { ...loose, fileBytes: 100 }), /alice\.webp is 256 bytes, over the 100-byte bound on one file/);
  assert.equal(walkProjectDir(fixture, loose).files.length, 4);
});

await check("the batch plan keeps each batch under its byte budget, keeps order, and sends an oversize file alone", () => {
  const f = (name, n) => ({ path: name, bytes: new Uint8Array(n) });
  const plan = planBatches([f("a", 3), f("b", 3), f("c", 3), f("big", 20), f("d", 1), f("e", 1)], 7);
  assert.deepEqual(plan.map((b) => b.map((x) => x.path)), [["a", "b"], ["c"], ["big"], ["d", "e"]]);
  // A batch that lands exactly on the budget is under it.
  assert.deepEqual(planBatches([f("a", 3), f("b", 4)], 7).map((b) => b.map((x) => x.path)), [["a", "b"]]);
  assert.deepEqual(planBatches([], 7), []);
  assert.deepEqual(planBatches([f("only", 1)], 7).map((b) => b.map((x) => x.path)), [["only"]]);
});

await check("the stub page runs a page function without the module's scope or Node's globals, as the browser does", async () => {
  await withStub({}, async ({ page }) => {
    const leaky = () => SEED_MARKER;
    await assert.rejects(page.evaluate(leaky), /SEED_MARKER is not defined/);
    assert.equal(await page.evaluate(() => typeof Buffer), "undefined");
    assert.equal(await page.evaluate(() => typeof process), "undefined");
    assert.equal(await page.evaluate(() => typeof require), "undefined");
    assert.deepEqual(await page.evaluate(beginSeed, { project: "local", marker: ".seeding" }), { interrupted: false });
  });
});

await check("seeding a directory writes every file under local/, each reads back byte for byte, and storage is reported replaced with no marker left", async () => {
  await withStub({}, async ({ page }) => {
    const report = await seedProject(page, fixture, { batchBytes: 300 });
    assert.equal(report.reason, undefined, report.reason);
    assert.equal(report.kind, "directory");
    assert.equal(report.files, 4);
    assert.equal(report.bytes, totalBytes);
    assert.equal(report.skipped, 2);
    assert.deepEqual(report.failed, []);
    assert.deepEqual(report.removed, []);
    assert.equal(report.mainSd, true);
    assert.equal(report.pruned, true);
    assert.equal(report.storage, "replaced");
    assert.equal(report.interruptedBefore, undefined);
    assert.equal(typeof report.ms, "number");
    // 300 bytes a batch: the 256-byte binary cannot share with the script,
    // so the four files need more than one round trip.
    assert.ok(report.batches >= 2, `expected the seed to be batched, got ${report.batches} batch(es)`);
    for (const [rel, bytes] of Object.entries(files)) {
      const back = await readBack(page, rel);
      assert.ok(back != null, `${rel} did not land`);
      assert.equal(Buffer.compare(back, bytes), 0, `${rel} reads back differently`);
    }
    assert.equal(await readBack(page, ".name"), null, "a dot file was seeded");
    assert.equal(await readBack(page, ".git/HEAD"), null, "a dot directory was seeded");
    assert.equal(await marked(page), false, "the marker was left behind");
  });
});

await check("seeding replaces the previous project: stale entries go, nested ones too, and dot entries stay", async () => {
  await withStub({}, async ({ page, tree }) => {
    await previousProject(page, { "stale.sd": "old", "scripts/gone.sd": "old", "scripts/chars.sd": "older", "assets/old.png": "gone", ".name": "My Game", ".trash/x.sd": "binned" });
    const report = await seedProject(page, fixture);
    assert.equal(report.reason, undefined, report.reason);
    assert.deepEqual(report.removed, ["assets/old.png", "scripts/gone.sd", "stale.sd"]);
    assert.equal(await readBack(page, "stale.sd"), null, "a stale root file survived the seed");
    assert.equal(await readBack(page, "scripts/gone.sd"), null, "a stale nested file survived the seed");
    assert.equal((await readBack(page, ".name")).toString(), "My Game", "the project's metadata was removed");
    assert.equal((await readBack(page, ".trash/x.sd")).toString(), "binned", "the project's trash was removed");
    assert.equal((await readBack(page, "scripts/chars.sd")).toString(), files["scripts/chars.sd"].toString());
    assert.equal((await readBack(page, "main.sd")).toString(), files["main.sd"].toString());
    assert.equal(Buffer.compare(await readBack(page, "assets/portraits/alice.webp"), allBytes), 0);
    assert.deepEqual(entryNames(tree, "local"), [".name", ".trash", "assets", "main.sd", "scripts"]);
  });
});

await check("a previous entry whose kind clashes with the source is a reason naming it, with nothing written and nothing removed", async () => {
  await withStub({ refuse: [] }, async ({ page, tree, refuse }) => {
    // A file where the source has a directory, and a directory where the
    // source has a file; a write the storage would refuse never runs.
    await previousProject(page, { "assets": "a file", "main.sd/inner.sd": "x", "keep.sd": "k", "scripts/chars.sd": "c" });
    refuse.push("chars.sd");
    const report = await seedProject(page, fixture);
    assert.match(report.reason, /^the previous project has a file named "assets" where the source has a directory and 1 more, and the seed would have to remove it before writing; nothing was written\. Empty the project with seed --clear, or fix the source$/);
    assert.deepEqual(report.clashes, [{ path: "assets", storage: "file", source: "directory" }, { path: "main.sd", storage: "directory", source: "file" }]);
    assert.equal(report.storage, "untouched");
    assert.equal(report.files, 0);
    assert.deepEqual(report.removed, []);
    assert.deepEqual(entryNames(tree, "local"), ["assets", "keep.sd", "main.sd", "scripts"]);
    assert.equal((await readBack(page, "assets")).toString(), "a file");
    assert.equal((await readBack(page, "main.sd/inner.sd")).toString(), "x");
    assert.equal(await marked(page), false, "a refused seed left a marker");
  });
  await withStub({}, async ({ page }) => {
    // A clash in a directory the source does not lead through is stale, not
    // a clash: the prune takes it after the writes.
    await previousProject(page, { "old/assets": "a file" });
    const report = await seedProject(page, fixture);
    assert.equal(report.reason, undefined, report.reason);
    assert.deepEqual(report.removed, ["old"]);
  });
  await withStub({}, async ({ page, tree }) => {
    // A clash below the root, in a directory the source leads through, is
    // found before any write: the check descends.
    await previousProject(page, { "assets/portraits": "a file", "main.sd": "previous" });
    const report = await seedProject(page, fixture);
    assert.match(report.reason, /^the previous project has a file named "assets\/portraits" where the source has a directory, and the seed would have to remove it/);
    assert.deepEqual(report.clashes, [{ path: "assets/portraits", storage: "file", source: "directory" }]);
    assert.equal(report.storage, "untouched");
    assert.equal((await readBack(page, "assets/portraits")).toString(), "a file");
    assert.equal((await readBack(page, "main.sd")).toString(), "previous");
    assert.deepEqual(entryNames(tree, "local"), ["assets", "main.sd"]);
    assert.equal(await marked(page), false);
  });
});

await check("a refused write is a reason naming the storage's error that leaves the previous project in place under the files that landed, with the marker set; the next seed clears it", async () => {
  await withStub({ refuse: [] }, async ({ page, refuse }) => {
    await previousProject(page, { "stale.sd": "old", "assets/portraits/alice.webp": "old portrait" });
    refuse.push("alice.webp");
    const report = await seedProject(page, fixture);
    assert.equal(report.files, 3);
    assert.equal(report.bytes, totalBytes - allBytes.length);
    assert.deepEqual(report.failed, [{ path: "assets/portraits/alice.webp", reason: 'NoModificationAllowedError: "alice.webp" is locked' }]);
    assert.match(report.reason, /^1 of 4 project files could not be written \(first: assets\/portraits\/alice\.webp: NoModificationAllowedError: "alice\.webp" is locked\); the previous project's entries stand under the 3 files that landed \(a file whose write failed holds what that write left\), and local\/\.seeding marks the seed as unfinished; re-run --project$/);
    assert.equal(report.storage, "mixed");
    assert.equal(report.pruned, false);
    assert.deepEqual(report.removed, []);
    assert.equal((await readBack(page, "stale.sd")).toString(), "old", "a failed seed destroyed the previous project");
    assert.equal((await readBack(page, "assets/portraits/alice.webp")).toString(), "old portrait", "a failed write lost the file that was there");
    assert.equal((await readBack(page, "main.sd")).toString(), files["main.sd"].toString());
    assert.equal(await marked(page), true, "a failed seed left no marker");
  });
  await withStub({ refuse: ["alice.webp"] }, async ({ page }) => {
    // The file the failed write created is removed again, through its own
    // parent; its siblings that landed stay.
    await seedProject(page, fixture);
    assert.equal(await readBack(page, "assets/portraits/alice.webp"), null, "the empty file the failed write created was left for the editor");
    assert.equal((await readBack(page, "assets/empty.txt")).toString(), "");
  });
  await withStub({}, async ({ page }) => {
    await previousProject(page, { "stale.sd": "old" });
    await page.evaluate(beginSeed, { project: "local", marker: SEED_MARKER });
    const report = await seedProject(page, fixture);
    assert.equal(report.reason, undefined, report.reason);
    assert.equal(report.interruptedBefore, true);
    assert.equal(report.storage, "replaced");
    assert.equal(await readBack(page, "stale.sd"), null);
    assert.equal(await marked(page), false);
  });
});

await check("a write that reads back short is a reason, counts only the bytes that landed, and the run stops mixed", async () => {
  await withStub({ shortWrite: { "chars.sd": 3 } }, async ({ page }) => {
    const report = await seedProject(page, fixture);
    assert.deepEqual(report.failed, [{ path: "scripts/chars.sd", reason: "wrote 23 bytes but the file reads back as 3" }]);
    assert.equal(report.files, 3);
    assert.equal(report.bytes, totalBytes - files["scripts/chars.sd"].length);
    assert.match(report.reason, /1 of 4 project files could not be written/);
    assert.equal(report.storage, "mixed");
    assert.equal(await marked(page), true);
  });
  const short = {};
  await withStub({ shortWrite: short }, async ({ page }) => {
    // Over a previous project the short-written file holds neither side's
    // content, which is what the reason says; the entries the seed did not
    // reach stand. The short write is switched on after the previous
    // project has landed whole.
    await previousProject(page, { "scripts/chars.sd": "THE PREVIOUS PROJECT'S CHARACTERS", "stale.sd": "old" });
    short["chars.sd"] = 3;
    const report = await seedProject(page, fixture);
    assert.match(report.reason, /the previous project's entries stand under the 3 files that landed \(a file whose write failed holds what that write left\)/);
    assert.equal((await readBack(page, "scripts/chars.sd")).toString(), files["scripts/chars.sd"].toString("utf8").slice(0, 3));
    assert.equal((await readBack(page, "stale.sd")).toString(), "old");
    assert.equal(report.storage, "mixed");
    assert.equal(await marked(page), true);
  });
});

await check("a seed whose main.sd write is refused reports mainSd false, since the field says what landed", async () => {
  await withStub({ refuse: ["main.sd"] }, async ({ page }) => {
    const report = await seedProject(page, fixture);
    assert.equal(report.mainSd, false);
    assert.equal(report.files, 3);
    assert.equal(report.storage, "mixed");
    assert.deepEqual(report.failed.map((f) => f.path), ["main.sd"]);
  });
});

await check("a storage that refuses is a reason naming its error before anything is written", async () => {
  await withStub({ refuseRoot: true }, async ({ page, tree }) => {
    const report = await seedProject(page, fixture);
    assert.match(report.reason, /^the editor's storage refused the seed before anything was written: QuotaExceededError: storage is unavailable$/);
    assert.equal(report.storage, "untouched");
    assert.equal(report.files, 0);
    assert.equal(tree.children.size, 0);
  });
});

await check("a source with no project files is a reason, and the previous project is untouched", async () => {
  const empty = fs.mkdtempSync(path.join(scratch, "empty-"));
  const dots = writeTree(fs.mkdtempSync(path.join(scratch, "dots-")), { ".git/HEAD": "ref", ".name": "x" });
  await withStub({}, async ({ page }) => {
    await previousProject(page, { "main.sd": "previous" });
    for (const [source, pattern] of [[empty, /holds no project files; nothing was written$/], [dots, /holds no project files \(2 dot entries skipped\); nothing was written$/]]) {
      const report = await seedProject(page, source);
      assert.match(report.reason, pattern);
      assert.equal(report.storage, "untouched");
      assert.equal(report.files, 0);
    }
    assert.equal((await readBack(page, "main.sd")).toString(), "previous");
    assert.equal(await marked(page), false);
  });
});

await check("a source with no main.sd at its root is a reason unless the caller supplies main.sd", async () => {
  const assetsOnly = writeTree(path.join(scratch, "assets-only"), { "assets/a.png": "a", "scripts/b.sd": "b" });
  await withStub({}, async ({ page, tree }) => {
    const report = await seedProject(page, assetsOnly);
    assert.match(report.reason, /has no main\.sd at its root \(its top-level entries: assets, scripts\), so the editor could not open it as a project; nothing was written$/);
    assert.equal(report.storage, "untouched");
    assert.equal(tree.children.size, 0);
    const allowed = await seedProject(page, assetsOnly, { expectMainSd: false });
    assert.equal(allowed.reason, undefined, allowed.reason);
    assert.equal(allowed.mainSd, false);
    assert.equal(allowed.files, 2);
    assert.equal(allowed.storage, "replaced");
  });
});

await check("a page whose editor remembers another project is a reason, and nothing is written", async () => {
  await withStub({ remembered: "drive-abc123" }, async ({ page, tree }) => {
    const report = await seedProject(page, fixture);
    assert.match(report.reason, /^the editor remembers project "drive-abc123" \(localStorage "project"\), not "local", so it would open a project the seed does not write to; nothing was written\. Forget it with a `--probe` file holding localStorage\.removeItem\("project"\), then re-run$/);
    assert.equal(report.storage, "untouched");
    assert.equal(tree.children.size, 0);
  });
  await withStub({ remembered: "local" }, async ({ page }) => {
    assert.equal((await seedProject(page, fixture)).reason, undefined);
  });
});

await check("a stale entry the storage refuses to remove is a reason whose removed lists what really went, and the marker stays", async () => {
  await withStub({ refuseRemove: ["video"] }, async ({ page, tree }) => {
    await previousProject(page, { "audio/x.ogg": "a", "video/y.mp4": "v" });
    const report = await seedProject(page, fixture);
    assert.deepEqual(report.removed, ["audio"]);
    assert.deepEqual(report.failed, [{ path: "video", reason: 'NoModificationAllowedError: "video" is in use' }]);
    assert.match(report.reason, /^1 of the previous project's entries could not be removed \(first: video: NoModificationAllowedError: "video" is in use\); 1 went, the rest stand beside the seeded files, and local\/\.seeding marks the seed as unfinished; re-run --project$/);
    assert.equal(report.files, 4);
    assert.equal(report.pruned, false);
    assert.equal(report.storage, "mixed");
    assert.deepEqual(entryNames(tree, "local"), [".seeding", "assets", "main.sd", "scripts", "video"]);
  });
});

await check("a prune that throws after removing (the marker refused, a directory unlistable) still reports what went, and the marker stays", async () => {
  await withStub({ refuseRemove: [SEED_MARKER] }, async ({ page }) => {
    await previousProject(page, { "stale.sd": "old" });
    const report = await seedProject(page, fixture);
    assert.deepEqual(report.removed, ["stale.sd"]);
    assert.deepEqual(report.failed, [{ path: ".seeding", reason: 'NoModificationAllowedError: ".seeding" is in use' }]);
    assert.match(report.reason, /^1 of the previous project's entries could not be removed \(first: \.seeding: .*\); 1 went/);
    assert.equal(report.storage, "mixed");
    assert.equal(await readBack(page, "stale.sd"), null);
    assert.equal(await marked(page), true);
  });
  await withStub({ refuseList: ["scripts"] }, async ({ page }) => {
    await previousProject(page, { "stale.sd": "old", "scripts/gone.sd": "old" });
    const report = await seedProject(page, fixture);
    assert.deepEqual(report.removed, ["stale.sd"]);
    assert.deepEqual(report.failed, [{ path: "scripts", reason: 'could not be listed: NotReadableError: "scripts" cannot be listed' }]);
    assert.equal(report.storage, "mixed");
    assert.equal(await marked(page), true);
  });
});

await check("a source that is missing or is neither a directory nor a zip is a reason, and the storage is not touched", async () => {
  await withStub({}, async ({ page, tree }) => {
    const missing = await seedProject(page, path.join(scratch, "nope"));
    assert.match(missing.reason, /does not exist/);
    const plain = await seedProject(page, path.join(fixture, "main.sd"));
    assert.match(plain.reason, /neither a directory nor a \.zip/);
    assert.equal(tree.children.size, 0);
  });
});

await check("pruning keeps a dot entry beside any kept entry and removes a stale directory whole, as one entry", async () => {
  await withStub({}, async ({ page, tree }) => {
    await previousProject(page, { "main.sd": "m", "assets/.cache/t.png": "c", "assets/a.png": "a", "old/.notes": "n", "old/deep/x.sd": "x", "old/y.sd": "y" });
    await page.evaluate(beginSeed, { project: "local", marker: SEED_MARKER });
    const out = await page.evaluate(pruneProject, { project: "local", keep: ["main.sd", "assets/a.png"], marker: SEED_MARKER });
    assert.deepEqual(out, { removed: ["old"], failed: [] });
    assert.deepEqual(entryNames(tree, "local", "assets"), [".cache", "a.png"]);
    assert.deepEqual(entryNames(tree, "local"), ["assets", "main.sd"]);
    assert.equal(await marked(page), false);
  });
});

await check("clearing a project removes every non-dot entry and the marker, reports them, creates nothing when the project is missing, refuses a page that remembers another project, and leaves a marker when a removal is refused", async () => {
  await withStub({}, async ({ page, tree }) => {
    await previousProject(page, { "main.sd": "m", "assets/a.png": "a", ".name": "My Game" });
    await page.evaluate(beginSeed, { project: "local", marker: SEED_MARKER });
    const report = await clearProject(page);
    assert.equal(report.reason, undefined, report.reason);
    assert.equal(report.interruptedBefore, true);
    assert.deepEqual(report.removed, ["assets", "main.sd"]);
    assert.deepEqual(entryNames(tree, "local"), [".name"]);
    assert.equal(await marked(page), false);
  });
  await withStub({}, async ({ page, tree }) => {
    const report = await clearProject(page);
    assert.equal(report.reason, undefined, report.reason);
    assert.deepEqual(report, { project: "local", removed: [], failed: [], missing: true });
    assert.equal(tree.children.size, 0, "a clear created the project directory");
    assert.equal(await marked(page), false);
  });
  await withStub({ remembered: "drive-abc" }, async ({ page }) => {
    await previousProject(page, { "main.sd": "m" });
    const report = await clearProject(page);
    assert.match(report.reason, /^the editor remembers project "drive-abc" \(localStorage "project"\), not "local", so it would open a project the clear does not touch; nothing was removed$/);
    assert.deepEqual(report.removed, []);
    assert.equal((await readBack(page, "main.sd")).toString(), "m");
    assert.equal(await marked(page), false);
  });
  await withStub({ refuseRemove: ["assets"] }, async ({ page }) => {
    await previousProject(page, { "main.sd": "m", "assets/a.png": "a" });
    const report = await clearProject(page);
    assert.match(report.reason, /^1 of the project's entries could not be removed \(first: assets: NoModificationAllowedError: "assets" is in use\); 1 went, and local\/\.seeding marks the project as a mix$/);
    assert.deepEqual(report.removed, ["main.sd"]);
    assert.equal(await marked(page), true);
  });
});

await check("reading a large file back returns every byte", async () => {
  await withStub({}, async ({ page }) => {
    const big = Buffer.alloc(200_003);
    for (let i = 0; i < big.length; i++) big[i] = (i * 7) & 0xff;
    const out = await page.evaluate(writeProjectBatch, { project: "local", entries: [{ path: "audio/big.bin", base64: big.toString("base64") }] });
    assert.deepEqual(out.failed, []);
    assert.equal(Buffer.compare(await readBack(page, "audio/big.bin"), big), 0);
  });
});

await check("zip entries: directory, dot and ./ segments dropped, a single wrapping folder unwrapped and named only when it holds main.sd, an escaping path, a package directory and a file-directory clash refused", () => {
  const b = (s) => new Uint8Array(Buffer.from(s));
  const plain = zipProjectEntries({ "main.sd": b("m"), "assets/": new Uint8Array(0), "assets/a.png": b("a"), ".name": b("x"), "__MACOSX/._main.sd": b("y") });
  assert.deepEqual(plain.files.map((e) => e.path), ["assets/a.png", "main.sd"]);
  assert.equal(plain.skipped, 2);
  assert.equal(plain.unwrapped, undefined);
  const dotted = zipProjectEntries({ "./": new Uint8Array(0), "./main.sd": b("m"), "./assets//a.png": b("a") });
  assert.deepEqual(dotted.files.map((e) => e.path), ["assets/a.png", "main.sd"]);
  assert.equal(dotted.unwrapped, undefined);
  const wrapped = zipProjectEntries({ "game/": new Uint8Array(0), "game/main.sd": b("m"), "game/scripts/x.sd": b("s") });
  assert.deepEqual(wrapped.files.map((e) => e.path), ["main.sd", "scripts/x.sd"]);
  assert.equal(wrapped.unwrapped, "game");
  // A single top-level folder without main.sd is the project's own layout
  // (an asset bundle, a scripts folder), so it is kept: unwrapping it would
  // move every path the script references.
  // A single top-level folder without main.sd is kept and named, since it
  // cannot be told from the project's own layout: unwrapping it would move
  // every path the script references.
  const noMain = zipProjectEntries({ "mygame/assets/a.png": b("a"), "mygame/scripts/c.sd": b("c") });
  assert.deepEqual(noMain.files.map((e) => e.path), ["mygame/assets/a.png", "mygame/scripts/c.sd"]);
  assert.equal(noMain.unwrapped, undefined);
  assert.equal(noMain.kept, "mygame");
  assert.equal(plain.kept, undefined);
  assert.equal(wrapped.kept, undefined);
  const assetsOnly = zipProjectEntries({ "assets/portraits/alice.webp": b("a"), "assets/backdrops/room.webp": b("r") });
  assert.deepEqual(assetsOnly.files.map((e) => e.path), ["assets/backdrops/room.webp", "assets/portraits/alice.webp"]);
  assert.equal(assetsOnly.unwrapped, undefined);
  assert.equal(assetsOnly.kept, "assets");
  // main.sd two folders down is not a wrapper either: one level is unwrapped
  // at most, and only when main.sd is right under it.
  const deep = zipProjectEntries({ "a/b/main.sd": b("m"), "a/b/x/y.png": b("y") });
  assert.deepEqual(deep.files.map((e) => e.path), ["a/b/main.sd", "a/b/x/y.png"]);
  assert.equal(deep.kept, "a");
  // Two top-level folders, neither the project root: left as they are.
  const two = zipProjectEntries({ "a/main.sd": b("m"), "b/x.sd": b("s") });
  assert.deepEqual(two.files.map((e) => e.path), ["a/main.sd", "b/x.sd"]);
  assert.equal(two.kept, undefined);
  assert.deepEqual(zipProjectEntries({ "assets\\a.png": b("a") }).files.map((e) => e.path), ["assets/a.png"]);
  assert.throws(() => zipProjectEntries({ "../escape.sd": b("e") }), /climbs out/);
  assert.throws(() => zipProjectEntries({ "a/../escape.sd": b("e") }), /climbs out/);
  assert.throws(() => zipProjectEntries({ "/abs.sd": b("e") }), /not a relative path/);
  assert.throws(() => zipProjectEntries({ "main.sd": b("m"), "node_modules/x/index.js": b("j") }), /holds node_modules\/, which a project never does/);
  assert.throws(() => zipProjectEntries({ "main.sd": b("m"), "assets": b("f"), "assets/a.png": b("a") }), /holds both a file and a directory named "assets"/);
  assert.deepEqual(zipProjectEntries({}), { files: [], skipped: 0, failed: [] });
});

let fflate = null;
try {
  fflate = await import("fflate");
} catch {
  /* not installed here */
}
if (fflate) {
  await check("an exported zip seeds the same files as the directory it was made from, a zip's on-disk size is checked before it is read, and a zip without main.sd keeps its single top-level folder under --sd", async () => {
    const archive = {};
    for (const f of walkProjectDir(fixture).files) archive[f.path] = new Uint8Array(f.bytes);
    const zipPath = path.join(scratch, "export.zip");
    fs.writeFileSync(zipPath, fflate.zipSync(archive, { level: 0 }));
    await withStub({}, async ({ page }) => {
      const report = await seedProject(page, zipPath);
      assert.equal(report.reason, undefined, report.reason);
      assert.equal(report.kind, "zip");
      assert.equal(report.files, 4);
      assert.equal(report.bytes, totalBytes);
      assert.equal(report.storage, "replaced");
      assert.equal(report.unwrapped, undefined);
      for (const [rel, bytes] of Object.entries(files)) {
        assert.equal(Buffer.compare(await readBack(page, rel), bytes), 0, `${rel} reads back differently from the zip`);
      }
    });
    await withStub({}, async ({ page }) => {
      const report = await seedProject(page, zipPath, { limits: { files: 100, bytes: 1_000_000, fileBytes: 100 } });
      assert.match(report.reason, /alice\.webp is 256 bytes, over the 100-byte bound on one file/);
      assert.equal(report.storage, "untouched");
      // The archive's own size on disk is checked before it is read at all.
      const onDisk = await seedProject(page, zipPath, { limits: { files: 100, bytes: 10, fileBytes: 1_000_000 } });
      assert.match(onDisk.reason, /^--project .*export\.zip is \d+ bytes, over the 10-byte bound on a seed$/);
    });
    const wrapper = path.join(scratch, "wrapped-no-main.zip");
    fs.writeFileSync(wrapper, fflate.zipSync({ "mygame/assets/portraits/alice.webp": new Uint8Array(allBytes), "mygame/scripts/chars.sd": new Uint8Array(Buffer.from("c")) }, { level: 0 }));
    await withStub({}, async ({ page }) => {
      // The folder the seed kept is named, with a note, since a zip made by
      // hand from an asset-only project looks the same as one whose layout
      // starts with that folder, and the script's paths depend on which.
      const report = await seedProject(page, wrapper, { expectMainSd: false });
      assert.equal(report.reason, undefined, report.reason);
      assert.equal(report.unwrapped, undefined);
      assert.equal(report.kept, "mygame");
      assert.equal(report.note, "every entry of the zip sits under mygame/, which holds no main.sd, so the folder was kept as part of the project's layout and a script's paths start with mygame/; if the folder is one the compress command added, make the zip from inside it");
      assert.equal(Buffer.compare(await readBack(page, "mygame/assets/portraits/alice.webp"), allBytes), 0);
      assert.equal(await readBack(page, "assets/portraits/alice.webp"), null);
    });
    await withStub({}, async ({ page }) => {
      // An export-layout zip has no kept folder.
      const report = await seedProject(page, zipPath);
      assert.equal(report.kept, undefined);
      assert.equal(report.note, undefined);
    });
  });
  await check("a zip entry that climbs out, is absolute, or sits under a package directory is refused from the zip's own filter with the entry's reason, before anything is inflated", async () => {
    for (const [name, pattern] of [
      ["../escape.sd", /^zip entry "\.\.\/escape\.sd" climbs out of the project$/],
      ["/abs.sd", /^zip entry "\/abs\.sd" is not a relative path$/],
      ["node_modules/x/index.js", /^the project holds node_modules\/, which a project never does; point --project at the project directory itself$/],
    ]) {
      const evil = path.join(scratch, `evil-${name.replace(/[^a-z]/g, "")}.zip`);
      fs.writeFileSync(evil, fflate.zipSync({ "main.sd": new Uint8Array(Buffer.from("m")), [name]: new Uint8Array(Buffer.from("e")) }, { level: 0 }));
      await withStub({}, async ({ page, tree }) => {
        const report = await seedProject(page, evil);
        assert.match(report.reason, pattern);
        assert.doesNotMatch(report.reason, /could not be unpacked as a zip/);
        assert.equal(report.storage, "untouched");
        assert.equal(tree.children.size, 0);
      });
    }
  });
  await check("the zip bounds count the entries the seed writes: dot entries and __MACOSX companions are skipped before they are counted", async () => {
    const mac = path.join(scratch, "mac.zip");
    fs.writeFileSync(mac, fflate.zipSync({ "main.sd": new Uint8Array(Buffer.from("m")), "__MACOSX/._main.sd": new Uint8Array(500), ".DS_Store": new Uint8Array(500) }, { level: 0 }));
    await withStub({}, async ({ page }) => {
      // One file and 100 bytes a file: the two 500-byte companions would
      // trip both bounds if they were counted.
      const report = await seedProject(page, mac, { limits: { files: 1, bytes: 10_000, fileBytes: 100 } });
      assert.equal(report.reason, undefined, report.reason);
      assert.equal(report.files, 1);
      assert.equal(report.skipped, 2);
      assert.equal(report.storage, "replaced");
    });
  });
  await check("a zip over the bounds is refused on its central directory, before the entry the bound names is inflated", async () => {
    // The second entry's deflate stream is corrupted after zipping, so
    // inflating it throws; a bound that speaks on that entry has read the
    // central directory's sizes, not the data. fflate writes each local
    // header with its sizes: the name length at 26, the extra length at 28,
    // the compressed size at 18, the data after the 30-byte header.
    const corrupt = (entry) => {
      const zipped = fflate.zipSync({ "a.sd": new Uint8Array(1000), "b.sd": new Uint8Array(1000) }, { level: 9 });
      const u16 = (at) => zipped[at] | (zipped[at + 1] << 8);
      const u32 = (at) => (zipped[at] | (zipped[at + 1] << 8) | (zipped[at + 2] << 16) | (zipped[at + 3] << 24)) >>> 0;
      const firstData = 30 + u16(26) + u16(28);
      const second = firstData + u32(18);
      assert.equal(u32(second), 0x04034b50, "the second local header was not where fflate's layout puts it");
      const secondData = second + 30 + u16(second + 26) + u16(second + 28);
      const at = entry === "b.sd" ? secondData : firstData;
      zipped.fill(0xff, at, at + 4);
      const file = path.join(scratch, `corrupt-${entry}.zip`);
      fs.writeFileSync(file, zipped);
      return file;
    };
    const bomb = corrupt("b.sd");
    await withStub({}, async ({ page, tree }) => {
      const overTotal = await seedProject(page, bomb, { limits: { files: 100, bytes: 1500, fileBytes: 1_000_000 } });
      assert.match(overTotal.reason, /^the project is over the 1500-byte bound on a seed \(reached at b\.sd\)$/);
      const overFile = await seedProject(page, bomb, { limits: { files: 100, bytes: 1_000_000, fileBytes: 500 } });
      assert.match(overFile.reason, /^a\.sd is 1000 bytes, over the 500-byte bound on one file$/);
      const overCount = await seedProject(page, bomb, { limits: { files: 1, bytes: 1_000_000, fileBytes: 1_000_000 } });
      assert.match(overCount.reason, /^the project has more than 1 files, the bound on a seed \(reached at b\.sd\)$/);
      const inflated = await seedProject(page, bomb);
      assert.match(inflated.reason, /could not be unpacked as a zip \(invalid block type\)$/);
      assert.equal(tree.children.size, 0);
    });
    // The entries before the one the bound names have been inflated by
    // then: a corrupt first entry is what the run reports when the bound
    // trips on the second. What the bound buys is the memory it names.
    const early = corrupt("a.sd");
    await withStub({}, async ({ page }) => {
      const report = await seedProject(page, early, { limits: { files: 1, bytes: 1_000_000, fileBytes: 1_000_000 } });
      assert.match(report.reason, /could not be unpacked as a zip \(invalid block type\)$/);
    });
  });
  await check("a file that is not a zip archive is a reason naming the source", async () => {
    const bogus = path.join(scratch, "bogus.zip");
    fs.writeFileSync(bogus, "not a zip");
    await withStub({}, async ({ page }) => {
      const report = await seedProject(page, bogus);
      assert.match(report.reason, /could not be unpacked as a zip/);
    });
  });
} else {
  console.log("SKIP: the zip cases need fflate, which the workspace install at the repo root provides");
}

await check("the program warning tells the open document not compiling from a harness that was not ready or an error in a file that is not open", () => {
  assert.match(programWarning({ loaded: false, ms: 90_000, errors: 2 }), /^the script does not compile: the editor's status bar shows 2 errors in the open document/);
  assert.match(programWarning({ loaded: false, ms: 90_000, errors: 0 }), /^the player had not loaded a program within 90s .* or a file that is not open does not compile/);
  assert.match(programWarning({ loaded: false, ms: 90_000, errors: null }), /^the player had not loaded a program/);
});

await check("gameMountedWithin answers true from its first poll with no timeout given", async () => {
  let polls = 0;
  const page = { evaluate: async () => (polls += 1) > 0, waitForTimeout: async () => {} };
  assert.equal(await gameMountedWithin(page), true);
  assert.equal(polls, 1);
});

// A page for the mount wait: the mount predicate runs in the page context
// against `window.__preview`, `waitForTimeout` moves a fake clock, and a
// reload is counted and installs the preview when it is the
// `mountedOnReload`th one.
function mountPage({ mountedAtStart = false, mountedOnReload = null } = {}) {
  const storage = stubStorage({});
  const globals = stubGlobals(storage);
  const preview = { summary: () => ({ sameOrigin: true, gameChildren: 3 }) };
  if (mountedAtStart) globals.window.__preview = preview;
  const page = stubPage(globals);
  let t = 0;
  let polls = 0;
  const evaluate = page.evaluate;
  page.evaluate = async (f, arg) => {
    polls += 1;
    return evaluate(f, arg);
  };
  page.waitForTimeout = async (ms) => {
    t += ms;
  };
  page.reload = async () => {
    page.reloads += 1;
    if (page.reloads === mountedOnReload) globals.window.__preview = preview;
  };
  return { page, now: () => t, polls: () => polls };
}

await check("waitForGame polls the game once a second for its 45s budget, reloads, brings the editor back, and polls the budget again; a game that mounts is answered as soon as it does", async () => {
  {
    const { page, now, polls } = mountPage();
    const ensure = async () => ({ present: true, switched: true, settled: true });
    assert.deepEqual(await waitForGame(page, { now, ensure }), { mounted: false, reloaded: true, switched: true });
    assert.equal(polls(), 90, "45 polls before the reload and 45 after");
    assert.equal(page.reloads, 1);
    assert.equal(now(), 90_000);
  }
  {
    const { page, now, polls } = mountPage({ mountedOnReload: 1 });
    const ensure = async () => ({ present: true, switched: false, settled: true });
    assert.deepEqual(await waitForGame(page, { now, ensure }), { mounted: true, reloaded: true, switched: false });
    assert.equal(polls(), 46, "the budget, then the first poll after the reload");
    assert.equal(page.reloads, 1);
  }
  {
    const { page, now, polls } = mountPage({ mountedAtStart: true });
    assert.deepEqual(await waitForGame(page, { now, ensure: async () => assert.fail("the editor was brought back with no reload") }), { mounted: true, reloaded: false });
    assert.equal(polls(), 1);
    assert.equal(page.reloads, 0);
  }
  {
    // The editor not coming back after the reload is the answer, with its
    // reason, and the second budget is not spent on a page with no editor.
    const { page, now, polls } = mountPage();
    const ensure = async () => ({ present: false, switched: true, reason: "the script editor did not mount" });
    assert.deepEqual(await waitForGame(page, { now, ensure }), { mounted: false, reloaded: true, error: "the script editor did not mount", switched: true });
    assert.equal(polls(), 45);
  }
  {
    const { page, now } = mountPage();
    page.reload = async () => {
      throw new Error("net::ERR_CONNECTION_REFUSED at http://stub.test\n  more");
    };
    assert.deepEqual(await waitForGame(page, { now }), { mounted: false, reloaded: true, error: "the recovery reload did not complete (net::ERR_CONNECTION_REFUSED at http://stub.test)" });
  }
  {
    // The default clock is the real one: a budget of nothing polls nothing,
    // on a page that would answer yes.
    const { page, polls } = mountPage({ mountedAtStart: true });
    assert.equal(await gameMountedWithin(page, 0), false);
    assert.equal(polls(), 0);
    const ensure = async () => ({ present: true, switched: false, settled: true });
    assert.deepEqual(await waitForGame(page, { timeout: 0, ensure }), { mounted: false, reloaded: true, switched: false });
    assert.equal(polls(), 0);
    assert.equal(page.reloads, 1);
  }
  {
    // The predicate reads the preview's own summary: a preview that is not
    // same-origin, or has no game children yet, is not a mount.
    const { page, now, polls } = mountPage();
    page.evaluate = async (f) => {
      polls();
      return vm.runInContext(`(${f.toString()})`, vm.createContext({ window: { __preview: { summary: () => ({ sameOrigin: false, gameChildren: 3 }) } } }))();
    };
    assert.equal(await gameMountedWithin(page, 2_000, { now }), false);
    page.evaluate = async (f) => vm.runInContext(`(${f.toString()})`, vm.createContext({ window: { __preview: { summary: () => ({ sameOrigin: true, gameChildren: null }) } } }))();
    assert.equal(await gameMountedWithin(page, 2_000, { now }), false);
    page.evaluate = async (f) => vm.runInContext(`(${f.toString()})`, vm.createContext({ window: { __preview: { summary: () => ({ sameOrigin: true, gameChildren: 0 }) } } }))();
    assert.equal(await gameMountedWithin(page, 2_000, { now }), true);
  }
});

// The commands, in-process: the browser-side waits answer at once, the
// seed, the clear, the interrupted-seed check and the script write are the
// driver's own, and the page is the stub whose storage they write to. The
// editor is handed over as `withEditor` hands it over on a same-origin
// launch, and a refusal before the browser (`die`) is a throw here.
function commandDeps(page, overrides = {}) {
  const logs = [];
  const calls = { waitForProgram: 0, withEditor: 0 };
  return {
    logs,
    calls,
    deps: {
      withEditor: async (fn) => {
        calls.withEditor += 1;
        return fn({ page, ctx: null, url: "http://stub.test", consoleLines: [], mode: "same-origin" });
      },
      log: (line) => logs.push(line),
      die: (msg) => {
        throw new Error(`died: ${msg}`);
      },
      seedProject,
      clearProject,
      interruptedSeed,
      writeMainSd,
      loadedScript,
      waitForApp: async () => {},
      ensureScriptEditor: async () => ({ present: true, settled: true }),
      waitForGame: async () => ({ mounted: true }),
      waitForProgram: async () => {
        calls.waitForProgram += 1;
        return { loaded: true, ms: 1 };
      },
      waitForPreviewSettle: async () => ({ settled: true, text: "" }),
      waitForDomQuiet: async () => {},
      previewSummary: async () => ({ installed: true }),
      editorPainted: async () => true,
      clickLine: async () => ({ clicked: false, reason: "stub" }),
      documentLines: async () => [],
      routeLabel: async () => null,
      activeScreen: async () => "logic",
      editorExpectedHere: async () => true,
      scriptEditorPresent: async () => ({ present: true }),
      settleEditor: async () => true,
      readSurfaces: async () => ({}),
      ...overrides,
    },
  };
}
const repro = path.join(scratch, "repro.sd");
await check("verify and ui run fresh worker verification and stop on an unverifiable worker", async () => {
  for (const command of [verify, ui]) {
    for (const failed of [false, true]) {
      await withStub({}, async ({ page }) => {
        let calls = 0, finishes = 0, appWaits = 0;
        const serviceWorker = { refreshed: !failed, controlled: !failed, sha256: failed ? null : "installed-hash", ...(failed ? { reason: "worker could not be verified" } : {}) };
        const { deps } = commandDeps(page, {
          waitForApp: async () => { appWaits++; },
          reportFreshWorker: async () => { calls++; return { report: serviceWorker, close: async () => {}, finish: async () => { finishes++; } }; },
        });
        const next = path.join(scratch, "after-worker.js");
        fs.writeFileSync(next, "return 42;");
        const result = await command(command === ui ? ["--fresh-sw", "--probe", next] : ["--fresh-sw"], deps);
        assert.equal(calls, 1, "the fresh worker flag must not be ignored");
        assert.deepEqual(command === verify ? result.serviceWorker : result.steps[0].serviceWorker, serviceWorker);
        assert.equal(process.exitCode, failed ? 1 : 0);
        if (failed && command === verify) assert.equal(result.gameMounted, undefined, "no game verification after failed worker proof");
        assert.equal(finishes, failed ? 0 : 1);
        if (command === ui) {
          assert.equal(appWaits, failed ? 1 : 2, "wait for the app again after a successful refresh");
          if (!failed) assert.equal(result.editorSettled, true, "the run-level field records the initial settle");
          assert.equal(result.steps.length, failed ? 1 : 2, "failed refresh must stop before the probe");
          if (failed) assert.match(result.steps[0].reason, /1 remaining step did not run/);
        }
        process.exitCode = 0;
      });
    }
  }
});

await check("verify keeps the page's registration error when a fresh worker cannot install", async () => {
  await withStub({}, async ({ page }) => {
    const { deps } = commandDeps(page, {
      withEditor: async (fn) => fn({ page, ctx: null, url: "http://stub.test", consoleLines: ["[error] Service worker registration failed: script evaluation failed"], mode: "same-origin" }),
      reportFreshWorker: async () => ({ report: { reason: "no activated controller" }, close: async () => {} }),
    });
    const result = await verify(["--fresh-sw"], deps);
    assert.ok(result.consoleErrors.some((line) => line.includes("script evaluation failed")));
    assert.equal(process.exitCode, 1);
    process.exitCode = 0;
  });
});

await check("a worker replaced during verify or ui fails the final report", async () => {
  for (const command of [verify, ui]) {
    await withStub({}, async ({ page }) => {
      const report = { controlled: true, refreshed: true };
      const { deps } = commandDeps(page, { reportFreshWorker: async () => ({ report, close: async () => {}, finish: async () => { report.controlled = false; report.reason = "worker changed during the run"; } }) });
      const result = await command(["--fresh-sw"], deps);
      assert.equal(process.exitCode, 1);
      assert.match(command === verify ? result.error : result.failed[0], /worker changed during the run/);
      process.exitCode = 0;
    });
  }
});

await check("a final worker failure retains the preview failure and its evidence warning", async () => {
  await withStub({}, async ({ page }) => {
    const report = { controlled: true, refreshed: true };
    const { deps } = commandDeps(page, {
      waitForGame: async () => ({ mounted: false }),
      reportFreshWorker: async () => ({ report, close: async () => {}, finish: async () => { report.reason = "worker changed during the run"; } }),
    });
    const result = await verify(["--fresh-sw"], deps);
    assert.match(result.error, /Game Preview is blank/);
    assert.match(result.error, /NOT valid evidence/);
    assert.match(result.error, /worker changed during the run/);
    assert.equal(process.exitCode, 1);
    process.exitCode = 0;
  });
});

await check("repeated ui refreshes finish and close the preceding worker before replacing it", async () => {
  await withStub({}, async ({ page }) => {
    const calls = [];
    let id = 0;
    const { deps } = commandDeps(page, { reportFreshWorker: async () => {
      const current = ++id;
      calls.push(`refresh ${current}`);
      return { report: { controlled: true, refreshed: true }, finish: async () => calls.push(`finish ${current}`), close: async () => calls.push(`close ${current}`) };
    } });
    const result = await ui(["--fresh-sw", "--fresh-sw"], deps);
    assert.deepEqual(result.failed, []);
    assert.deepEqual(calls, ["refresh 1", "finish 1", "close 1", "refresh 2", "finish 2", "close 2"]);
  });
});

await check("a failed preceding worker stops the next refresh and all later steps", async () => {
  for (const trailing of [[], ["--shot", path.join(scratch, "must-not-run.png")]]) {
    await withStub({}, async ({ page }) => {
      const report = { controlled: true, refreshed: true };
      let refreshes = 0;
      const { deps } = commandDeps(page, { reportFreshWorker: async () => {
        refreshes++;
        return { report, close: async () => {}, finish: async () => { report.reason = "worker replaced"; } };
      } });
      const result = await ui(["--fresh-sw", "--fresh-sw", ...trailing], deps);
      assert.equal(refreshes, 1);
      assert.equal(result.steps.length, 2);
      assert.match(result.steps[1].reason, /preceding worker check failed; this refresh did not run/);
      assert.doesNotMatch(result.steps[1].reason, /0 remaining|1 remaining steps/);
      assert.equal(process.exitCode, 1);
      process.exitCode = 0;
    });
  }
});

await check("an initial worker failure on the last step does not invent remaining steps", async () => {
  await withStub({}, async ({ page }) => {
    const { deps } = commandDeps(page, { reportFreshWorker: async () => ({ report: { reason: "worker failed" }, close: async () => {} }) });
    const result = await ui(["--fresh-sw"], deps);
    assert.equal(result.steps[0].reason, "worker failed");
    process.exitCode = 0;
  });
});

const reproText = "ALICE:\n  Hi.\n";
fs.writeFileSync(repro, reproText);
const shot = path.join(scratch, "shots", "out.png");
const probe = path.join(scratch, "probe.js");
fs.writeFileSync(probe, "return 42;");

await check("withEditor hands the callback the URL and the mode from how the servers were launched, same-origin when the record has no mode, and closes the browser after the callback", async () => {
  const launches = [];
  const closes = [];
  const page = stubPage(stubGlobals(stubStorage({})));
  const launch = async (opts) => {
    launches.push(opts);
    return { pages: () => [page], newPage: async () => assert.fail("a page was opened beside the profile's own"), close: async () => closes.push(1) };
  };
  const seen = await withEditor(async (editor) => editor, { launch, state: () => ({ url: "http://stub.test:40072", mode: "cross-origin", pid: 1 }) });
  assert.equal(seen.page, page);
  assert.equal(seen.url, "http://stub.test:40072");
  assert.equal(seen.mode, "cross-origin");
  assert.deepEqual(seen.consoleLines, []);
  assert.deepEqual(launches, [{ headless: true }]);
  assert.equal(closes.length, 1);
  const plain = await withEditor(async ({ mode }) => mode, { launch, state: () => ({ url: "http://stub.test:40072" }) });
  assert.equal(plain, "same-origin", "a record without a mode is a same-origin launch");
  const same = await withEditor(async ({ mode }) => mode, { launch, state: () => ({ url: "http://stub.test:40072", mode: "same-origin" }), headless: false });
  assert.equal(same, "same-origin");
  assert.deepEqual(launches.at(-1), { headless: false });
  await assert.rejects(withEditor(async () => { throw new Error("the callback broke"); }, { launch, state: () => ({ url: "http://stub.test" }) }), /the callback broke/);
  assert.equal(closes.length, 4, "the browser was left open after a callback threw");
});

await check("verify and a ui --sd step run the real mount wait with the run's own ensureScriptEditor, so switchedToLogic comes from the recovery reload's click", async () => {
  // The game mounts on the second reload: the first is the command's own
  // after --sd, the second the recovery. The wait is the real function on a
  // fake clock; the editor's return is the command's dep, which reports the
  // click that changed the screen.
  const fresh = () => {
    const mounted = mountPage({ mountedOnReload: 2 });
    return {
      ...mounted,
      ...commandDeps(mounted.page, {
        waitForGame: (page, opts) => waitForGame(page, { ...opts, now: mounted.now }),
        ensureScriptEditor: async () => ({ present: true, switched: true, settled: true }),
      }),
    };
  };
  {
    const { page, deps } = fresh();
    const result = await verify(["--sd", repro, "--shot", shot], deps);
    assert.equal(result.error, undefined, result.error);
    assert.equal(result.gameMounted, true);
    assert.equal(result.neededReload, true);
    assert.equal(result.switchedToLogic, true);
    assert.equal(page.reloads, 2);
    assert.deepEqual(page.screenshots, [shot]);
    assert.equal(process.exitCode, 0);
  }
  {
    const { page, deps } = fresh();
    const result = await ui(["--sd", repro], deps);
    assert.deepEqual(result.failed, []);
    assert.equal(result.steps[0].neededReload, true);
    assert.equal(result.steps[0].switchedToLogic, true);
    assert.equal(result.steps[0].programLoaded, true);
    assert.equal(page.reloads, 2);
  }
});
const assetsOnly2 = writeTree(path.join(scratch, "assets-only-2"), { "assets/a.png": "a" });

await check("verify --project seeds, reloads once, screenshots and exits 0; on a seed reason it stops with that error, no gameMounted, no reload, no screenshot, exit 1", async () => {
  await withStub({}, async ({ page }) => {
    const { deps, logs } = commandDeps(page);
    const result = await verify(["--project", fixture, "--shot", shot], deps);
    assert.equal(result.error, undefined, result.error);
    assert.equal(result.seed.files, 4);
    assert.equal(result.seed.project, "local");
    assert.equal(result.gameMounted, true);
    assert.equal(result.program.loaded, true);
    assert.equal(page.reloads, 1);
    assert.deepEqual(page.screenshots, [shot]);
    assert.equal(process.exitCode, 0);
    assert.equal(logs.length, 1);
    assert.equal((await readBack(page, "main.sd")).toString(), files["main.sd"].toString());
  });
  await withStub({ refuse: ["alice.webp"] }, async ({ page }) => {
    const { deps } = commandDeps(page);
    const result = await verify(["--project", fixture, "--shot", shot], deps);
    assert.match(result.error, /1 of 4 project files could not be written/);
    // verify's error is the seed's reason and the one thing the reason cannot
    // know: that the game was never asked about, so a restart changes nothing.
    assert.equal(result.error, result.seed.reason + ". The game was never asked about, so restarting the servers changes nothing.");
    assert.equal("gameMounted" in result, false, "a seed failure was reported as the game not mounting");
    assert.equal(page.reloads, 0);
    assert.deepEqual(page.screenshots, []);
    assert.equal(process.exitCode, 1);
  });
});

await check("verify --project with --sd accepts a project without main.sd and writes the script over the project's main.sd; without --sd such a project is refused", async () => {
  await withStub({}, async ({ page }) => {
    const { deps } = commandDeps(page);
    const result = await verify(["--project", assetsOnly2, "--sd", repro, "--shot", shot], deps);
    assert.equal(result.error, undefined, result.error);
    assert.equal(result.seed.mainSd, false);
    assert.equal(result.wroteChars, reproText.length);
    assert.equal(page.reloads, 1);
    assert.deepEqual(page.screenshots, [shot]);
    assert.equal(process.exitCode, 0);
    assert.equal((await readBack(page, "main.sd")).toString(), reproText);
    assert.equal((await readBack(page, "assets/a.png")).toString(), "a");
  });
  await withStub({}, async ({ page }) => {
    // The project first, the script over it: the fixture's own main.sd is
    // replaced by the script, not the other way round.
    const { deps } = commandDeps(page);
    const result = await verify(["--project", fixture, "--sd", repro], deps);
    assert.equal(result.error, undefined, result.error);
    assert.equal(result.seed.mainSd, true);
    assert.equal((await readBack(page, "main.sd")).toString(), reproText);
    assert.equal((await readBack(page, "scripts/chars.sd")).toString(), files["scripts/chars.sd"].toString());
  });
  await withStub({}, async ({ page }) => {
    const { deps } = commandDeps(page);
    const result = await verify(["--project", assetsOnly2], deps);
    assert.match(result.error, /has no main\.sd at its root/);
    assert.equal(page.reloads, 0);
    assert.equal(process.exitCode, 1);
  });
});

await check("verify on a game that never mounted skips the program wait and says so, whether or not the preview reported sameOrigin; in cross-origin mode, read from how the servers were launched, it fails without waiting for a game it cannot see", async () => {
  await withStub({}, async ({ page }) => {
    const { deps, calls } = commandDeps(page, { waitForGame: async () => ({ mounted: false, reloaded: true }) });
    const result = await verify(["--sd", repro], deps);
    assert.equal(result.gameMounted, false);
    assert.match(result.error, /the game never mounted/);
    assert.deepEqual(result.program, { loaded: null, reason: "the game never mounted" });
    assert.equal(result.programWarning, undefined);
    assert.equal(calls.waitForProgram, 0, "the program wait ran on an unmounted game");
    assert.equal(process.exitCode, 1);
  });
  await withStub({}, async ({ page }) => {
    // The sameOrigin wait timing out on a same-origin launch is the preview
    // in screenplay mode or a pane that never mounted, and the report says
    // that rather than naming cross-origin mode.
    page.waitForFunction = async (fn) => {
      if (String(fn).includes("sameOrigin")) throw new Error("Timeout");
      return {};
    };
    const { deps } = commandDeps(page, { waitForGame: async () => ({ mounted: false, reloaded: true }) });
    const result = await verify(["--sd", repro], deps);
    assert.match(result.previewWarning, /^window\.__preview never reported sameOrigin within 60s: the preview pane is showing the screenplay, or the game preview never mounted$/);
    assert.deepEqual(result.program, { loaded: null, reason: "the game never mounted" });
    assert.match(result.error, /the game never mounted .*Try `down` then `up`/);
  });
  await withStub({}, async ({ page }) => {
    // The refusal comes before the page is loaded, the project seeded or
    // the script written: a run that can capture nothing replaces nothing.
    await previousProject(page, { "main.sd": "previous", "assets/old.webp": "old" });
    let mountWaits = 0;
    let sameOriginWaits = 0;
    page.waitForFunction = async (fn) => {
      if (String(fn).includes("sameOrigin")) sameOriginWaits += 1;
      return {};
    };
    const { deps, calls, logs } = commandDeps(page, {
      withEditor: async (fn) => fn({ page, ctx: null, url: "http://stub.test", consoleLines: [], mode: "cross-origin" }),
      waitForGame: async () => {
        mountWaits += 1;
        return { mounted: false, reloaded: true };
      },
    });
    const result = await verify(["--project", fixture, "--sd", repro, "--line", "2", "--shot", shot], deps);
    assert.equal(mountWaits, 0, "the mount was waited for in cross-origin mode");
    assert.equal(sameOriginWaits, 0, "sameOrigin was waited for in cross-origin mode");
    assert.equal(calls.waitForProgram, 0);
    assert.deepEqual(result, {
      url: "http://stub.test",
      gameMounted: null,
      program: { loaded: null, reason: "the preview is not observable (cross-origin mode)" },
      error: "the game preview is not observable in cross-origin mode (window.__preview is never installed), so nothing seen on it is evidence; `down`, then `up` without --cross-origin",
    });
    assert.equal(logs.length, 1);
    assert.equal(process.exitCode, 1);
    assert.equal(page.gotos, 0, "the page was loaded for a run that captures nothing");
    assert.equal(page.reloads, 0);
    assert.deepEqual(page.screenshots, [], "a screenshot was taken of a preview the page cannot see");
    assert.equal((await readBack(page, "main.sd")).toString(), "previous", "the script was written in a run that captures nothing");
    assert.equal((await readBack(page, "assets/old.webp")).toString(), "old", "the project was seeded in a run that captures nothing");
    assert.equal(await marked(page), false);
  });
  await withStub({}, async ({ page }) => {
    const { deps } = commandDeps(page, { waitForProgram: async () => ({ loaded: false, ms: 90_000, errors: 0 }) });
    const result = await verify(["--sd", repro], deps);
    assert.match(result.programWarning, /^the player had not loaded a program/);
  });
});

await check("the elsewhere scrubWarning opens on the target line and sends the reader to the screenshot; the inconclusive one still reads as neither success nor failure", async () => {
  // The one string in a verify report a reader acts on directly. SKILL.md
  // says to open the PNG before concluding an `elsewhere` scrub failed, so
  // wording that states the failure without that hedge, or that never names
  // the line asked for, contradicts the doc it is read beside.
  const script = ["ALICE:", "  Line one of the scrub repro.", "", "BOB:", "  Line two of the scrub repro."];
  const renderedText = (name, body) => `${name}\n${name}\n${body}\n${body}\n▼`;
  const scrubDeps = (page, text) =>
    commandDeps(page, {
      clickLine: async () => ({ clicked: true, cursorLine: 5 }),
      documentLines: async () => script,
      waitForPreviewSettle: async () => ({ settled: true, text }),
    }).deps;
  await withStub({}, async ({ page }) => {
    // Line 2's text is on screen, line 5's is not.
    const result = await verify(["--sd", repro, "--line", "5"], scrubDeps(page, renderedText("ALICE", "Line one of the scrub repro.")));
    assert.equal(result.scrubCheck.outcome, "elsewhere");
    assert.match(result.scrubWarning, /^The scrub to line 5 is not confirmed by the rendered text: the game is showing line 2, not line 5; if the scrub really did fail, aim at an indented dialogue or action line, since a NAME: line, a heading and a blank line are not playable beats\./);
    assert.match(result.scrubWarning, /Usually a genuinely failed scrub, but open the screenshot first/);
    assert.match(result.scrubWarning, /The click put the cursor on line 5\./);
  });
  await withStub({}, async ({ page }) => {
    // Nothing on screen is attributable to any line of the script.
    const result = await verify(["--sd", repro, "--line", "5"], scrubDeps(page, renderedText("NARRATOR", "Something else entirely.")));
    assert.equal(result.scrubCheck.outcome, "inconclusive");
    assert.match(result.scrubWarning, /^Could not confirm the scrub landed:/);
    assert.match(result.scrubWarning, /read `visible` and judge it yourself/);
  });
});

await check("a plain verify on a marked project stops with the reason and exit 1; a --project run seeds it again", async () => {
  await withStub({}, async ({ page }) => {
    await previousProject(page, { "main.sd": "half" });
    await page.evaluate(beginSeed, { project: "local", marker: SEED_MARKER });
    const { deps } = commandDeps(page);
    const plain = await verify(["--sd", repro], deps);
    assert.match(plain.error, /^an earlier --project seed did not finish \(local\/\.seeding is in storage\).*seed --clear\.$/);
    assert.equal(page.reloads, 0);
    assert.equal(process.exitCode, 1);
    process.exitCode = 0;
    const again = await verify(["--project", fixture], deps);
    assert.equal(again.error, undefined, again.error);
    assert.equal(again.seed.interruptedBefore, true);
    assert.equal(page.reloads, 1);
  });
});

await check("ui on a marked project refuses every step but --probe until a --project step has seeded, stops at the first refused step, and stops after a seed that fails", async () => {
  await withStub({}, async ({ page }) => {
    await previousProject(page, { "main.sd": "half" });
    await page.evaluate(beginSeed, { project: "local", marker: SEED_MARKER });
    const { deps } = commandDeps(page);
    const plain = await ui(["--sd", repro, "--shot", shot], deps);
    assert.equal(plain.steps.length, 1);
    assert.equal(plain.steps[0].gated, true);
    assert.match(plain.steps[0].reason, /did not finish .* The 1 step after this one did not run\.$/);
    assert.equal(page.reloads, 0);
    assert.deepEqual(page.screenshots, []);
    assert.equal(process.exitCode, 1);
    process.exitCode = 0;
    // A refused step reports in the shape it reports when it runs, with the
    // outcome field saying nothing happened, so a reader finds `matches` on
    // a --type, `screenshot` on a --shot, `clicked` on a --click.
    for (const [args, shape] of [
      [["--type", "search=Hello"], { field: "search", typed: false, text: "Hello", readBack: null, matches: false }],
      [["--shot", shot], { of: "page", screenshot: null }],
      [["--shot-of", "find", shot], { of: "find", screenshot: null }],
      [["--sd", repro], { sd: repro, wroteChars: null }],
      [["--screen", "assets"], { screen: "assets", active: false }],
      [["--open", "find"], { surface: "find", open: false }],
      [["--close", "find"], { surface: "find", open: null, closed: false }],
      [["--press", "Control+f"], { press: "Control+f", sent: null }],
      [["--click", "next"], { button: "next", clicked: false }],
      [["--toggle", "case"], { toggle: "case", toggled: false }],
    ]) {
      const refused = await ui(args, deps);
      assert.deepEqual(refused.steps, [{ ...shape, gated: true, reason: refused.steps[0].reason }], JSON.stringify(args));
      assert.match(refused.steps[0].reason, /did not finish/);
      assert.equal(process.exitCode, 1);
      process.exitCode = 0;
    }
    assert.equal(page.reloads, 0);
    assert.deepEqual(page.screenshots, []);
    // A --project step later in the run does not let the steps before it
    // drive the mix.
    const later = await ui(["--shot", shot, "--project", fixture], deps);
    assert.equal(later.steps.length, 1);
    assert.equal(later.steps[0].gated, true);
    assert.equal(page.reloads, 0);
    assert.equal(process.exitCode, 1);
    process.exitCode = 0;
    // A probe is never gated.
    const probed = await ui(["--probe", probe], deps);
    assert.deepEqual(probed.steps, [{ probe, result: 42 }]);
    assert.deepEqual(probed.failed, []);
    assert.equal(process.exitCode, 0);
    // A --project step that seeds clears the gate for the steps after it.
    const seeded = await ui(["--project", fixture, "--sd", repro], deps);
    assert.deepEqual(seeded.failed, []);
    assert.equal(seeded.steps.length, 2);
    assert.equal(seeded.steps[0].seed.interruptedBefore, true);
    assert.equal(page.reloads, 2);
    assert.equal((await readBack(page, "main.sd")).toString(), reproText);
  });
  await withStub({ refuse: ["alice.webp"] }, async ({ page }) => {
    const { deps } = commandDeps(page);
    const result = await ui(["--project", fixture, "--sd", repro, "--shot", shot], deps);
    assert.match(result.steps[0].reason, /1 of 4 project files could not be written/);
    assert.equal(result.steps.length, 2);
    assert.equal(result.steps[1].gated, true);
    assert.match(result.steps[1].reason, /did not finish/);
    assert.equal(result.failed.length, 2);
    assert.equal(page.reloads, 0);
    assert.deepEqual(page.screenshots, []);
    assert.equal(process.exitCode, 1);
  });
  await withStub({}, async ({ page }) => {
    // A seed refused before it wrote leaves the previous project, which
    // this run did not ask for; the steps after it do not run either, so no
    // screenshot of that project lands.
    await previousProject(page, { "main.sd": "A DIFFERENT PROJECT" });
    const { deps } = commandDeps(page);
    const result = await ui(["--project", assetsOnly2, "--shot", shot, "--probe", probe], deps);
    assert.match(result.steps[0].reason, /has no main\.sd at its root/);
    assert.equal(result.steps[0].seed.storage, "untouched");
    assert.equal(result.steps.length, 2);
    assert.deepEqual(result.steps[1], { of: "page", screenshot: null, gated: true, reason: result.steps[1].reason });
    assert.match(result.steps[1].reason, /^the --project seed in step 1 was refused \(.*has no main\.sd at its root.*\), so storage holds the project that was there before, which this run did not ask for\. The 1 step after this one did not run\.$/);
    assert.equal(await marked(page), false);
    assert.deepEqual(page.screenshots, []);
    assert.equal(page.reloads, 0);
    assert.equal((await readBack(page, "main.sd")).toString(), "A DIFFERENT PROJECT");
    assert.equal(process.exitCode, 1);
  });
});

await check("a ui --project or --sd step that throws keeps what it reported, fails, and closes the gate, so no later step captures a page that was not reloaded onto what storage holds", async () => {
  await withStub({}, async ({ page }) => {
    // The reload after a seed that landed whole times out: the seed report
    // stays on the step, and the screenshot after it is refused.
    await previousProject(page, { "main.sd": "A DIFFERENT PROJECT" });
    page.reload = async () => {
      throw new Error("page.reload: Timeout 120000ms exceeded.\n  more");
    };
    const { deps } = commandDeps(page);
    const result = await ui(["--project", fixture, "--shot", shot, "--probe", probe], deps);
    assert.equal(result.steps.length, 2);
    assert.equal(result.steps[0].project, fixture);
    assert.equal(result.steps[0].seed.files, 4);
    assert.equal(result.steps[0].seed.storage, "replaced");
    assert.equal(result.steps[0].reason, "step threw: page.reload: Timeout 120000ms exceeded.");
    assert.deepEqual(result.steps[1], { of: "page", screenshot: null, gated: true, reason: "the --project step 1 threw (page.reload: Timeout 120000ms exceeded.), so the page is not known to show what storage holds. The 1 step after this one did not run." });
    assert.deepEqual(page.screenshots, []);
    assert.equal(result.failed.length, 2);
    assert.equal(process.exitCode, 1);
    assert.equal((await readBack(page, "main.sd")).toString(), files["main.sd"].toString());
  });
  await withStub({}, async ({ page }) => {
    // The same for --sd: the characters written stay on the step.
    page.reload = async () => {
      throw new Error("net::ERR_ABORTED");
    };
    const { deps } = commandDeps(page);
    const result = await ui(["--sd", repro, "--shot", shot], deps);
    assert.deepEqual(result.steps[0], { sd: repro, wroteChars: reproText.length, reason: "step threw: net::ERR_ABORTED" });
    assert.deepEqual(result.steps[1], { of: "page", screenshot: null, gated: true, reason: "the --sd step 1 threw (net::ERR_ABORTED), so the page is not known to show what storage holds." });
    assert.deepEqual(page.screenshots, []);
    assert.equal(process.exitCode, 1);
  });
  await withStub({}, async ({ page }) => {
    // A write that throws before it landed: the step says nothing was
    // written, and the gate closes all the same.
    const { deps } = commandDeps(page, {
      writeMainSd: async () => {
        throw new Error("Execution context was destroyed");
      },
    });
    const result = await ui(["--sd", repro, "--screen", "assets"], deps);
    assert.deepEqual(result.steps[0], { sd: repro, wroteChars: null, reason: "step threw: Execution context was destroyed" });
    assert.deepEqual(result.steps[1], { screen: "assets", active: false, gated: true, reason: "the --sd step 1 threw (Execution context was destroyed), so the page is not known to show what storage holds." });
    assert.equal(process.exitCode, 1);
  });
  await withStub({}, async ({ page }) => {
    // A step of another kind that throws fails alone; the run goes on.
    const { deps } = commandDeps(page, {
      readSurfaces: async () => ({}),
    });
    const bad = path.join(scratch, "bad-probe.js");
    fs.writeFileSync(bad, "throw new Error('probe broke');");
    const result = await ui(["--probe", bad, "--probe", probe], deps);
    assert.deepEqual(result.steps, [{ probe: bad, reason: "step threw: probe broke" }, { probe, result: 42 }]);
  });
});

await check("a ui step whose mount recovery switched the screen reports switchedToLogic", async () => {
  await withStub({}, async ({ page }) => {
    const { deps } = commandDeps(page, { waitForGame: async () => ({ mounted: true, reloaded: true, switched: true }) });
    const result = await ui(["--sd", repro], deps);
    assert.deepEqual(result.failed, []);
    assert.equal(result.steps[0].neededReload, true);
    assert.equal(result.steps[0].switchedToLogic, true);
    const { deps: quiet } = commandDeps(page, { waitForGame: async () => ({ mounted: true, reloaded: false }) });
    assert.equal((await ui(["--sd", repro], quiet)).steps[0].switchedToLogic, undefined);
  });
});

await check("a ui --project step carries the seed and reloads once, accepts a project without main.sd when a --sd step supplies one, and refuses it otherwise", async () => {
  await withStub({}, async ({ page }) => {
    const { deps } = commandDeps(page);
    const result = await ui(["--project", fixture], deps);
    assert.equal(result.steps.length, 1);
    assert.equal(result.steps[0].project, fixture);
    assert.equal(result.steps[0].seed.files, 4);
    assert.equal(result.steps[0].programLoaded, true);
    assert.equal(result.steps[0].reason, undefined, result.steps[0].reason);
    assert.deepEqual(result.failed, []);
    assert.equal(page.reloads, 1);
    assert.equal(process.exitCode, 0);
  });
  await withStub({}, async ({ page }) => {
    const { deps } = commandDeps(page);
    const result = await ui(["--project", assetsOnly2, "--sd", repro], deps);
    assert.deepEqual(result.failed, []);
    assert.equal(result.steps[0].seed.mainSd, false);
    assert.equal(result.steps[1].wroteChars, reproText.length);
    assert.equal(page.reloads, 2);
    assert.equal((await readBack(page, "main.sd")).toString(), reproText);
  });
  await withStub({}, async ({ page }) => {
    const { deps } = commandDeps(page);
    const result = await ui(["--project", assetsOnly2], deps);
    assert.match(result.steps[0].reason, /has no main\.sd at its root/);
    assert.equal(page.reloads, 0);
    assert.equal(process.exitCode, 1);
  });
});

await check("a ui --sd step on a game that never mounted fails the step, skips the program wait, and reports the reload retry", async () => {
  await withStub({}, async ({ page }) => {
    const { deps, calls } = commandDeps(page, { waitForGame: async () => ({ mounted: false, reloaded: true, error: "the editor was on another screen" }) });
    const result = await ui(["--sd", repro], deps);
    assert.equal(result.steps[0].programLoaded, null);
    assert.equal(result.steps[0].previewSettled, null);
    assert.equal(result.steps[0].neededReload, true);
    assert.match(result.steps[0].reason, /^the game never mounted \(#game absent\) within 45s of the reload and again after a recovery reload, .*\(on the reload retry: the editor was on another screen\)$/);
    assert.equal(calls.waitForProgram, 0, "the program wait ran on an unmounted game");
    assert.equal(result.failed.length, 1);
    assert.equal(process.exitCode, 1);
  });
  await withStub({}, async ({ page }) => {
    const { deps } = commandDeps(page, { waitForGame: async () => ({ mounted: true, reloaded: true }) });
    const result = await ui(["--sd", repro], deps);
    assert.deepEqual(result.failed, []);
    assert.equal(result.steps[0].neededReload, true);
    assert.equal(result.steps[0].programLoaded, true);
  });
});

await check("seed --project seeds and reloads once with exit 0; on a seed reason it prints the error, does not reload, and exits 1", async () => {
  await withStub({}, async ({ page }) => {
    const { deps, logs } = commandDeps(page);
    const result = await seed(["--project", fixture], deps);
    assert.equal(result.error, undefined, result.error);
    assert.equal(result.seed.files, 4);
    assert.equal(page.reloads, 1);
    assert.equal(process.exitCode, 0);
    assert.ok(logs[0].includes('"storage": "replaced"'));
  });
  await withStub({ refuseRoot: true }, async ({ page }) => {
    const { deps } = commandDeps(page);
    const result = await seed(["--project", fixture], deps);
    assert.match(result.error, /storage refused the seed/);
    assert.equal(page.reloads, 0);
    assert.equal(process.exitCode, 1);
  });
});

await check("seed --clear empties the project and reloads; with --project it clears once the source is accepted, so a clashing previous entry no longer refuses the seed and a refused source leaves the previous project; a refused removal is the error with no reload", async () => {
  await withStub({}, async ({ page, tree }) => {
    await previousProject(page, { "main.sd": "half", "assets/a.png": "a", ".name": "My Game" });
    await page.evaluate(beginSeed, { project: "local", marker: SEED_MARKER });
    const { deps } = commandDeps(page);
    const result = await seed(["--clear"], deps);
    assert.equal(result.error, undefined, result.error);
    assert.deepEqual(result.clear.removed, ["assets", "main.sd"]);
    assert.equal(result.seed, undefined);
    assert.deepEqual(entryNames(tree, "local"), [".name"]);
    assert.equal(await marked(page), false);
    assert.equal(page.reloads, 1);
    assert.equal(process.exitCode, 0);
  });
  await withStub({}, async ({ page, tree }) => {
    const { deps } = commandDeps(page);
    const result = await seed(["--clear"], deps);
    assert.equal(result.error, undefined, result.error);
    assert.equal(result.clear.missing, true);
    assert.equal(tree.children.size, 0, "a clear created the project directory");
    assert.equal(page.reloads, 1);
  });
  await withStub({ remembered: "drive-abc" }, async ({ page }) => {
    await previousProject(page, { "main.sd": "m" });
    const { deps } = commandDeps(page);
    const result = await seed(["--clear"], deps);
    assert.match(result.error, /remembers project "drive-abc".*nothing was removed$/);
    assert.equal((await readBack(page, "main.sd")).toString(), "m");
    assert.equal(page.reloads, 0);
    assert.equal(process.exitCode, 1);
  });
  await withStub({}, async ({ page }) => {
    await previousProject(page, { "assets": "a file" });
    const { deps } = commandDeps(page);
    const refused = await seed(["--project", fixture], deps);
    assert.match(refused.error, /has a file named "assets" where the source has a directory/);
    process.exitCode = 0;
    const result = await seed(["--clear", "--project", fixture], deps);
    assert.equal(result.error, undefined, result.error);
    assert.deepEqual(result.clear.removed, ["assets"]);
    assert.deepEqual(result.seed.clear, result.clear);
    assert.equal(result.seed.storage, "replaced");
    assert.equal(result.seed.files, 4);
    assert.equal(page.reloads, 1);
    assert.equal(process.exitCode, 0);
  });
  // Every refusal the seed makes without storage comes before the clear, so
  // the previous project stands, unmarked, and the report says nothing was
  // removed or written.
  const nested = writeTree(path.join(scratch, "nested-main"), { "game/main.sd": "m", "game/assets/a.png": "a" });
  for (const [source, pattern] of [
    [assetsOnly2, /has no main\.sd at its root/],
    [fs.mkdtempSync(path.join(scratch, "empty-clear-")), /holds no project files/],
    [writeTree(path.join(scratch, "package-clear"), { "main.sd": "x", "node_modules/dep/index.js": "y" }), /holds node_modules\//],
    [path.join(fixture, "main.sd"), /neither a directory nor a \.zip/],
    [nested, /has no main\.sd at its root \(its top-level entries: game\)/],
  ]) {
    await withStub({}, async ({ page, tree }) => {
      await previousProject(page, { "main.sd": "previous", "assets/portraits/alice.webp": "old portrait", ".name": "My Game" });
      const { deps } = commandDeps(page);
      const result = await seed(["--clear", "--project", source], deps);
      assert.match(result.error, pattern);
      assert.equal(result.clear, undefined, "the clear ran before the source was refused");
      assert.equal(result.seed.clear, undefined);
      assert.equal(result.seed.storage, "untouched");
      assert.deepEqual(entryNames(tree, "local"), [".name", "assets", "main.sd"]);
      assert.equal((await readBack(page, "main.sd")).toString(), "previous");
      assert.equal((await readBack(page, "assets/portraits/alice.webp")).toString(), "old portrait");
      assert.equal(await marked(page), false, "a refused seed left the previous project marked");
      assert.equal(page.reloads, 0);
      assert.equal(process.exitCode, 1);
    });
  }
  await withStub({ remembered: "drive-abc" }, async ({ page }) => {
    await previousProject(page, { "main.sd": "previous" });
    const { deps } = commandDeps(page);
    const result = await seed(["--clear", "--project", fixture], deps);
    assert.match(result.error, /remembers project "drive-abc".*nothing was written\. Forget it with a `--probe` file holding localStorage\.removeItem\("project"\), then re-run$/);
    assert.equal(result.clear, undefined);
    assert.equal((await readBack(page, "main.sd")).toString(), "previous");
    assert.equal(page.reloads, 0);
  });
  await withStub({}, async ({ page }) => {
    // The bounds too: read on disk, before storage is touched.
    await previousProject(page, { "main.sd": "previous" });
    const report = await seedProject(page, fixture, { clear: true, limits: { files: 2, dirs: 100, bytes: 1_000_000, fileBytes: 1_000_000 } });
    assert.match(report.reason, /more than 2 files/);
    assert.equal(report.clear, undefined);
    assert.equal((await readBack(page, "main.sd")).toString(), "previous");
  });
  await withStub({ refuseRemove: ["assets"] }, async ({ page }) => {
    await previousProject(page, { "assets/a.png": "a" });
    const { deps } = commandDeps(page);
    const result = await seed(["--clear", "--project", fixture], deps);
    assert.match(result.error, /^1 of the project's entries could not be removed/);
    assert.equal(result.error, result.seed.reason);
    assert.deepEqual(result.clear, result.seed.clear);
    assert.equal(result.seed.storage, "mixed");
    assert.equal(result.seed.files, 0);
    assert.equal(await marked(page), true);
    assert.equal(page.reloads, 0);
    assert.equal(process.exitCode, 1);
  });
  await withStub({ refuse: ["chars.sd"] }, async ({ page, tree }) => {
    // A write refused after the clear: the reason says the previous project
    // went before the seed, since nothing of it is there to re-run over.
    await previousProject(page, { "main.sd": "previous", "stale.sd": "old", ".name": "My Game" });
    const { deps } = commandDeps(page);
    const result = await seed(["--clear", "--project", fixture], deps);
    assert.match(result.error, /^1 of 4 project files could not be written \(first: scripts\/chars\.sd: NoModificationAllowedError: "chars\.sd" is locked\); the project was emptied before the seed, so storage holds the 3 files that landed and nothing of the previous project \(a file whose write failed holds what that write left\), and local\/\.seeding marks the seed as unfinished; re-run --project$/);
    assert.deepEqual(result.clear.removed, ["main.sd", "stale.sd"]);
    assert.equal(result.seed.storage, "mixed");
    assert.equal(await readBack(page, "stale.sd"), null);
    assert.equal((await readBack(page, "main.sd")).toString(), files["main.sd"].toString());
    assert.deepEqual(entryNames(tree, "local"), [".name", ".seeding", "assets", "main.sd", "scripts"]);
    assert.equal(page.reloads, 0);
    assert.equal(process.exitCode, 1);
  });
});

await check("seed and verify refuse a flag given with no value, an empty one, or another flag in its place, before the browser launches, so an unset shell variable cannot turn a seed into a bare clear or a verify into a run on whatever is in storage", async () => {
  await withStub({}, async ({ page }) => {
    await previousProject(page, { "main.sd": "previous", "assets/a.png": "a" });
    const { deps, calls } = commandDeps(page);
    for (const [command, args, flagName] of [
      [seed, ["--clear", "--project"], "--project"],
      [seed, ["--clear", "--project", ""], "--project"],
      [seed, ["--project", "--clear"], "--project"],
      [seed, ["--project", ""], "--project"],
      [verify, ["--project", "", "--sd", repro], "--project"],
      [verify, ["--line", "3", "--project"], "--project"],
      [verify, ["--project", "--sd", repro], "--project"],
      [verify, ["--sd"], "--sd"],
      [verify, ["--sd", "", "--shot", shot], "--sd"],
      [verify, ["--project", fixture, "--shot"], "--shot"],
      [verify, ["--project", fixture, "--line", "--shot", shot], "--line"],
      [verify, ["--probe", ""], "--probe"],
    ]) {
      await assert.rejects(command(args, deps), new RegExp(`^Error: died: ${flagName} needs a value$`), `${command.name} ${JSON.stringify(args)}`);
    }
    await assert.rejects(ui(["--project"], deps), /^Error: died: ui: --project needs a value$/);
    await assert.rejects(seed(["--headed"], deps), /^Error: died: seed needs --project <dir-or-zip>, --clear, or both$/);
    await assert.rejects(seed(["--project", path.join(scratch, "nope")], deps), /^Error: died: --project .*nope does not exist$/);
    await assert.rejects(verify(["--project", path.join(scratch, "nope")], deps), /^Error: died: --project .*nope does not exist$/);
    await assert.rejects(ui(["--project", path.join(scratch, "nope")], deps), /^Error: died: ui: --project .*nope does not exist$/);
    assert.equal(calls.withEditor, 0, "a refused command launched the browser");
    assert.equal((await readBack(page, "main.sd")).toString(), "previous");
    assert.equal((await readBack(page, "assets/a.png")).toString(), "a");
    assert.equal(await marked(page), false);
    assert.equal(page.reloads, 0);
    assert.deepEqual(page.screenshots, []);
  });
});

if (fflate) {
  await check("an asset-only zip under verify --project --sd keeps its assets/ paths, so the script's references resolve", async () => {
    const assetsZip = path.join(scratch, "assets-only.zip");
    fs.writeFileSync(assetsZip, fflate.zipSync({ "assets/portraits/alice.webp": new Uint8Array(allBytes), "assets/backdrops/room.webp": new Uint8Array(Buffer.from("room")) }, { level: 0 }));
    await withStub({}, async ({ page }) => {
      const { deps } = commandDeps(page);
      const result = await verify(["--project", assetsZip, "--sd", repro, "--shot", shot], deps);
      assert.equal(result.error, undefined, result.error);
      assert.equal(result.seed.unwrapped, undefined);
      assert.equal(result.seed.files, 2);
      assert.equal(Buffer.compare(await readBack(page, "assets/portraits/alice.webp"), allBytes), 0);
      assert.equal((await readBack(page, "assets/backdrops/room.webp")).toString(), "room");
      assert.equal(await readBack(page, "portraits/alice.webp"), null, "the assets folder was unwrapped");
      assert.equal((await readBack(page, "main.sd")).toString(), reproText);
      assert.deepEqual(page.screenshots, [shot]);
      assert.equal(result.seed.kept, "assets");
    });
  });
  await check("a hand-made zip of an asset-only project under verify --project --sd keeps its wrapping folder and says so in the report, since the seed cannot tell it from the project's layout", async () => {
    const wrapper = path.join(scratch, "wrapped-no-main-verify.zip");
    fs.writeFileSync(wrapper, fflate.zipSync({ "mygame/assets/portraits/alice.webp": new Uint8Array(allBytes), "mygame/scripts/chars.sd": new Uint8Array(Buffer.from("c")) }, { level: 0 }));
    await withStub({}, async ({ page }) => {
      await previousProject(page, { "main.sd": "previous", "assets/portraits/alice.webp": "old portrait" });
      const { deps, logs } = commandDeps(page);
      const result = await verify(["--project", wrapper, "--sd", repro, "--shot", shot], deps);
      assert.equal(result.error, undefined, result.error);
      assert.equal(result.seed.kept, "mygame");
      assert.equal(result.seed.note, "every entry of the zip sits under mygame/, which holds no main.sd, so the folder was kept as part of the project's layout and a script's paths start with mygame/; if the folder is one the compress command added, make the zip from inside it");
      assert.ok(logs[0].includes('"kept": "mygame"'), "the kept folder is not in the printed report");
      // The previous main.sd goes with the seed and --sd writes the repro
      // over the project; the previous assets/ goes and nothing replaces it.
      assert.deepEqual(result.seed.removed, ["assets", "main.sd"]);
      assert.equal((await readBack(page, "main.sd")).toString(), reproText);
      assert.equal(await readBack(page, "assets/portraits/alice.webp"), null);
      assert.equal(Buffer.compare(await readBack(page, "mygame/assets/portraits/alice.webp"), allBytes), 0);
      assert.equal(process.exitCode, 0);
    });
  });
}

fs.rmSync(scratch, { recursive: true, force: true });

if (failures > 0) {
  console.log(`\n${failures} failing`);
  process.exit(1);
}
console.log("\nall passing");
process.exit(0);

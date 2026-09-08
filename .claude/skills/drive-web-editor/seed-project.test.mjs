#!/usr/bin/env node
// Pins seedProject, which `verify --project`, `ui --project` and `seed` use
// to load a whole project (a directory or an exported zip) into the editor's
// OPFS storage (#435), `clearProject` behind `seed --clear`, and the wiring
// of those commands to them. Run:
//   node .claude/skills/drive-web-editor/seed-project.test.mjs
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
// directory before inflating; `seed --clear`; and that `verify`, `ui` and
// `seed` each seed, stop on `reason` without reloading, put the project in
// before `--sd`, skip the program wait on an unmounted game, and reload
// after a seed that landed whole. The zip round trip needs fflate, which the
// workspace install puts under the root node_modules; in a worktree without
// it those cases report SKIP.
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
  interruptedSeed,
  planBatches,
  programWarning,
  pruneProject,
  readProjectFile,
  seed,
  seedProject,
  ui,
  verify,
  walkProjectDir,
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
// counted, waits resolve at once.
function stubPage(globals) {
  const context = vm.createContext({ ...globals });
  const page = {
    reloads: 0,
    screenshots: [],
    evaluate: async (f, arg) => {
      const rebuilt = vm.runInContext(`(${f.toString()})`, context);
      const out = await rebuilt(arg === undefined ? undefined : structuredClone(arg));
      return out === undefined ? undefined : structuredClone(out);
    },
    goto: async () => {},
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
  }
}

await check("the walk refuses node_modules and dist, and the bounds on file count, total bytes and one file's bytes, each with a reason", () => {
  const pkg = writeTree(path.join(scratch, "package"), { "main.sd": "x", "node_modules/dep/index.js": "y" });
  assert.throws(() => walkProjectDir(pkg), /holds node_modules\/, which a project never does/);
  const built = writeTree(path.join(scratch, "built"), { "main.sd": "x", "out/dist/bundle.js": "y" });
  assert.throws(() => walkProjectDir(built), /holds out\/dist\/, which a project never does/);
  const loose = { files: 100, bytes: 1_000_000, fileBytes: 1_000_000 };
  assert.throws(() => walkProjectDir(fixture, { ...loose, files: 3 }), /more than 3 files/);
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
});

await check("a refused write is a reason naming the storage's error that leaves the previous project in place under the files that landed, with the marker set; the next seed clears it", async () => {
  await withStub({ refuse: [] }, async ({ page, refuse }) => {
    await previousProject(page, { "stale.sd": "old", "assets/portraits/alice.webp": "old portrait" });
    refuse.push("alice.webp");
    const report = await seedProject(page, fixture);
    assert.equal(report.files, 3);
    assert.equal(report.bytes, totalBytes - allBytes.length);
    assert.deepEqual(report.failed, [{ path: "assets/portraits/alice.webp", reason: 'NoModificationAllowedError: "alice.webp" is locked' }]);
    assert.match(report.reason, /^1 of 4 project files could not be written \(first: assets\/portraits\/alice\.webp: NoModificationAllowedError: "alice\.webp" is locked\); the previous project's entries are still in storage under the 3 files that landed, and local\/\.seeding marks the seed as unfinished; re-run --project$/);
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
    assert.match(report.reason, /^the editor remembers project "drive-abc123" \(localStorage "project"\), not "local", so it would open a project the seed does not write to; nothing was written$/);
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

await check("clearing a project removes every non-dot entry and the marker, reports them, and leaves a marker when a removal is refused", async () => {
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
  await withStub({}, async ({ page }) => {
    const report = await clearProject(page);
    assert.equal(report.reason, undefined, report.reason);
    assert.deepEqual(report.removed, []);
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

await check("zip entries: directory, dot and ./ segments dropped, a single wrapping folder unwrapped and named, an escaping path, a package directory and a file-directory clash refused", () => {
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
  // A wrapper is unwrapped whether or not it holds main.sd, since a project
  // seeded under --sd need not.
  const noMain = zipProjectEntries({ "mygame/assets/a.png": b("a"), "mygame/scripts/c.sd": b("c") });
  assert.deepEqual(noMain.files.map((e) => e.path), ["assets/a.png", "scripts/c.sd"]);
  assert.equal(noMain.unwrapped, "mygame");
  // Two top-level folders, neither the project root: left as they are.
  assert.deepEqual(zipProjectEntries({ "a/main.sd": b("m"), "b/x.sd": b("s") }).files.map((e) => e.path), ["a/main.sd", "b/x.sd"]);
  assert.deepEqual(zipProjectEntries({ "assets\\a.png": b("a") }).files.map((e) => e.path), ["a.png"]);
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
  await check("an exported zip seeds the same files as the directory it was made from, and a wrapper zip without main.sd seeds unwrapped under --sd", async () => {
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
    });
    const wrapper = path.join(scratch, "wrapped-no-main.zip");
    fs.writeFileSync(wrapper, fflate.zipSync({ "mygame/assets/portraits/alice.webp": new Uint8Array(allBytes), "mygame/scripts/chars.sd": new Uint8Array(Buffer.from("c")) }, { level: 0 }));
    await withStub({}, async ({ page }) => {
      const report = await seedProject(page, wrapper, { expectMainSd: false });
      assert.equal(report.reason, undefined, report.reason);
      assert.equal(report.unwrapped, "mygame");
      assert.equal(Buffer.compare(await readBack(page, "assets/portraits/alice.webp"), allBytes), 0);
      assert.equal(await readBack(page, "mygame/scripts/chars.sd"), null);
    });
  });
  await check("a zip over the bounds is refused on its central directory, before any entry is inflated", async () => {
    // The second entry's deflate stream is corrupted after zipping, so
    // inflating it throws; a bound that speaks on that entry has read the
    // central directory's sizes, not the data. fflate writes each local
    // header with its sizes: the name length at 26, the extra length at 28,
    // the compressed size at 18, the data after the 30-byte header.
    const zipped = fflate.zipSync({ "a.sd": new Uint8Array(1000), "b.sd": new Uint8Array(1000) }, { level: 9 });
    const u16 = (at) => zipped[at] | (zipped[at + 1] << 8);
    const u32 = (at) => (zipped[at] | (zipped[at + 1] << 8) | (zipped[at + 2] << 16) | (zipped[at + 3] << 24)) >>> 0;
    const firstData = 30 + u16(26) + u16(28);
    const second = firstData + u32(18);
    assert.equal(u32(second), 0x04034b50, "the second local header was not where fflate's layout puts it");
    const secondData = second + 30 + u16(second + 26) + u16(second + 28);
    zipped.fill(0xff, secondData, secondData + 4);
    const bomb = path.join(scratch, "corrupt.zip");
    fs.writeFileSync(bomb, zipped);
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

// The commands, in-process: the browser-side waits answer at once, the
// seed, the clear, the interrupted-seed check and the script write are the
// driver's own, and the page is the stub whose storage they write to.
function commandDeps(page, overrides = {}) {
  const logs = [];
  const calls = { waitForProgram: 0 };
  return {
    logs,
    calls,
    deps: {
      withEditor: async (fn) => fn({ page, ctx: null, url: "http://stub.test", consoleLines: [] }),
      log: (line) => logs.push(line),
      seedProject,
      clearProject,
      interruptedSeed,
      writeMainSd,
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
const reproText = "ALICE:\n  Hi.\n";
fs.writeFileSync(repro, reproText);
const shot = path.join(scratch, "shots", "out.png");
const probe = path.join(scratch, "probe.js");
fs.writeFileSync(probe, "return 42;");
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
    assert.equal(result.error, result.seed.reason);
    assert.equal("gameMounted" in result, false, "a seed failure was reported as the game not mounting");
    assert.equal(page.reloads, 0);
    assert.deepEqual(page.screenshots, []);
    assert.equal(process.exitCode, 1);
  });
});

await check("verify --project with --sd accepts a project without main.sd and writes the script over the project's main.sd; without --sd such a project is refused", async () => {
  await withStub({}, async ({ page }) => {
    const { deps } = commandDeps(page);
    const result = await verify(["--project", assetsOnly2, "--sd", repro], deps);
    assert.equal(result.error, undefined, result.error);
    assert.equal(result.seed.mainSd, false);
    assert.equal(result.wroteChars, reproText.length);
    assert.equal(page.reloads, 1);
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

await check("verify on a game that never mounted skips the program wait and says so; in cross-origin mode it says the preview is not observable", async () => {
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
    page.waitForFunction = async (fn) => {
      if (String(fn).includes("sameOrigin")) throw new Error("Timeout");
      return {};
    };
    const { deps } = commandDeps(page, { waitForGame: async () => ({ mounted: false, reloaded: true }) });
    const result = await verify(["--sd", repro], deps);
    assert.match(result.previewWarning, /never reported sameOrigin/);
    assert.deepEqual(result.program, { loaded: null, reason: "the preview is not observable (cross-origin mode)" });
  });
  await withStub({}, async ({ page }) => {
    const { deps } = commandDeps(page, { waitForProgram: async () => ({ loaded: false, ms: 90_000, errors: 0 }) });
    const result = await verify(["--sd", repro], deps);
    assert.match(result.programWarning, /^the player had not loaded a program/);
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

await check("seed --clear empties the project and reloads; with --project it clears first, so a clashing previous entry no longer refuses the seed; a refused removal is the error with no reload", async () => {
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
  await withStub({}, async ({ page }) => {
    await previousProject(page, { "assets": "a file" });
    const { deps } = commandDeps(page);
    const refused = await seed(["--project", fixture], deps);
    assert.match(refused.error, /has a file named "assets" where the source has a directory/);
    process.exitCode = 0;
    const result = await seed(["--clear", "--project", fixture], deps);
    assert.equal(result.error, undefined, result.error);
    assert.deepEqual(result.clear.removed, ["assets"]);
    assert.equal(result.seed.storage, "replaced");
    assert.equal(page.reloads, 1);
    assert.equal(process.exitCode, 0);
  });
  await withStub({ refuseRemove: ["assets"] }, async ({ page }) => {
    await previousProject(page, { "assets/a.png": "a" });
    const { deps } = commandDeps(page);
    const result = await seed(["--clear", "--project", fixture], deps);
    assert.match(result.error, /^1 of the project's entries could not be removed/);
    assert.equal(result.seed, undefined);
    assert.equal(await marked(page), true);
    assert.equal(page.reloads, 0);
    assert.equal(process.exitCode, 1);
  });
});

fs.rmSync(scratch, { recursive: true, force: true });

if (failures > 0) {
  console.log(`\n${failures} failing`);
  process.exit(1);
}
console.log("\nall passing");
process.exit(0);

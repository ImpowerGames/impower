#!/usr/bin/env node
// Pins seedProject, which `verify --project`, `ui --project` and `seed` use
// to load a whole project (a directory or an exported zip) into the editor's
// OPFS storage (#435). Run:
//   node .claude/skills/drive-web-editor/seed-project.test.mjs
//
// The functions the driver ships into the page close over nothing, so this
// runs them in Node against a stub of `navigator.storage.getDirectory()`
// (an in-memory tree with the handle methods the seeder calls) through a
// stub page whose `evaluate` just calls the function. What is pinned: every
// file of a fixture directory lands under `<project>/<relative path>` and
// reads back byte for byte, with `/` separators whatever the host uses; dot
// entries are skipped; the previous project's non-dot entries are removed
// and its dot entries kept; the report's file count and byte total are what
// was measured back, and a file the storage refuses lands in `failed` with
// its path and reason while the rest still go in and `reason` is set; the
// batch plan keeps every batch under its byte budget and an oversize file
// alone; a zip's directory entries and dot entries are dropped, a wrapping
// top-level folder is unwrapped, and an entry that climbs out is refused;
// and an exported zip seeds the same as the directory it was made from. The
// zip round trip needs fflate, which `npm install` hoists to the root; in a
// worktree without it that case reports SKIP and the rest still run.
//
// Node's built-in assert only.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { clearProject, planBatches, readProjectFile, seedProject, walkProjectDir, writeProjectBatch, zipProjectEntries } from "./driver.mjs";

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

// An in-memory stand-in for the OPFS root: directories hold a Map of
// children, files hold a Uint8Array. `refuse` names the files whose
// createWritable throws, so a write failure can be scripted.
function stubStorage({ refuse = [] } = {}) {
  const dir = () => ({ kind: "directory", children: new Map() });
  const rootNode = dir();
  const dirHandle = (node, name) => ({
    kind: "directory",
    name,
    async getDirectoryHandle(child, { create = false } = {}) {
      let n = node.children.get(child);
      if (!n) {
        if (!create) throw new Error(`NotFoundError: no directory "${child}"`);
        n = dir();
        node.children.set(child, n);
      }
      if (n.kind !== "directory") throw new Error(`TypeMismatchError: "${child}" is a file`);
      return dirHandle(n, child);
    },
    async getFileHandle(child, { create = false } = {}) {
      let n = node.children.get(child);
      if (!n) {
        if (!create) throw new Error(`NotFoundError: no file "${child}"`);
        n = { kind: "file", bytes: new Uint8Array(0) };
        node.children.set(child, n);
      }
      if (n.kind !== "file") throw new Error(`TypeMismatchError: "${child}" is a directory`);
      return fileHandle(n, child);
    },
    async removeEntry(child, { recursive = false } = {}) {
      const n = node.children.get(child);
      if (!n) throw new Error(`NotFoundError: no entry "${child}"`);
      if (n.kind === "directory" && n.children.size > 0 && !recursive) throw new Error("InvalidModificationError");
      node.children.delete(child);
    },
    async *entries() {
      for (const [n, c] of node.children) yield [n, c.kind === "directory" ? dirHandle(c, n) : fileHandle(c, n)];
    },
  });
  const fileHandle = (node, name) => ({
    kind: "file",
    name,
    async createWritable() {
      if (refuse.includes(name)) throw new Error(`NoModificationAllowedError: "${name}" is locked`);
      let pending = new Uint8Array(0);
      return {
        async write(bytes) {
          pending = bytes;
        },
        async close() {
          node.bytes = pending;
        },
      };
    },
    async getFile() {
      const bytes = node.bytes;
      return { size: bytes.length, async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); } };
    },
  });
  return { root: dirHandle(rootNode, ""), tree: rootNode };
}

// Runs `fn` with the stub installed as `navigator.storage`, through a page
// whose evaluate is a plain call, and takes the stub down afterwards.
async function withStub(opts, fn) {
  const storage = stubStorage(opts);
  const previous = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", { value: { storage: { getDirectory: async () => storage.root } }, configurable: true, writable: true });
  const page = { evaluate: (f, arg) => f(arg) };
  try {
    return await fn({ page, ...storage });
  } finally {
    Object.defineProperty(globalThis, "navigator", { value: previous, configurable: true, writable: true });
  }
}

const readBack = async (page, filePath) => {
  const b64 = await page.evaluate(readProjectFile, { project: "local", path: filePath });
  return b64 == null ? null : Buffer.from(b64, "base64");
};

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

await check("walking a directory yields every non-dot file with /-separated relative paths, sorted", () => {
  const walked = walkProjectDir(fixture);
  assert.deepEqual(walked.map((f) => f.path), ["assets/empty.txt", "assets/portraits/alice.webp", "main.sd", "scripts/chars.sd"]);
  assert.equal(Buffer.compare(walked[1].bytes, allBytes), 0);
});

await check("the batch plan keeps each batch under its byte budget, keeps order, and sends an oversize file alone", () => {
  const f = (name, n) => ({ path: name, bytes: new Uint8Array(n) });
  const plan = planBatches([f("a", 3), f("b", 3), f("c", 3), f("big", 20), f("d", 1), f("e", 1)], 7);
  assert.deepEqual(plan.map((b) => b.map((x) => x.path)), [["a", "b"], ["c"], ["big"], ["d", "e"]]);
  assert.deepEqual(planBatches([], 7), []);
  assert.deepEqual(planBatches([f("only", 1)], 7).map((b) => b.map((x) => x.path)), [["only"]]);
});

await check("seeding a directory writes every file under local/, and each reads back byte for byte", async () => {
  await withStub({}, async ({ page }) => {
    const report = await seedProject(page, fixture, { batchBytes: 300 });
    assert.equal(report.reason, undefined, report.reason);
    assert.equal(report.kind, "directory");
    assert.equal(report.files, 4);
    assert.equal(report.bytes, totalBytes);
    assert.deepEqual(report.failed, []);
    assert.equal(report.mainSd, true);
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
  });
});

await check("seeding replaces the previous project's non-dot entries and keeps its dot entries", async () => {
  await withStub({}, async ({ page }) => {
    await page.evaluate(writeProjectBatch, {
      project: "local",
      entries: [
        { path: "stale.sd", base64: Buffer.from("old").toString("base64") },
        { path: "scripts/gone.sd", base64: Buffer.from("old").toString("base64") },
        { path: ".name", base64: Buffer.from("My Game").toString("base64") },
      ],
    });
    const report = await seedProject(page, fixture);
    assert.deepEqual(report.removed, ["scripts", "stale.sd"]);
    assert.equal(await readBack(page, "stale.sd"), null, "a stale root file survived the seed");
    assert.equal(await readBack(page, "scripts/gone.sd"), null, "a stale nested file survived the seed");
    assert.equal((await readBack(page, ".name")).toString(), "My Game", "the project's metadata was removed");
    assert.equal((await readBack(page, "scripts/chars.sd")).toString(), files["scripts/chars.sd"].toString());
  });
});

await check("a file the storage refuses lands in failed with its path and reason, the rest still land, and reason is set", async () => {
  await withStub({ refuse: ["alice.webp"] }, async ({ page }) => {
    const report = await seedProject(page, fixture);
    assert.equal(report.files, 3);
    assert.equal(report.bytes, totalBytes - allBytes.length);
    assert.deepEqual(report.failed.map((f) => f.path), ["assets/portraits/alice.webp"]);
    assert.match(report.failed[0].reason, /locked/);
    assert.match(report.reason, /1 of 4 project files could not be written \(first: assets\/portraits\/alice\.webp: .*locked/);
    assert.equal((await readBack(page, "main.sd")).toString(), files["main.sd"].toString());
    assert.equal(await readBack(page, "assets/portraits/alice.webp"), null);
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

await check("clearing a project that does not exist yet removes nothing", async () => {
  await withStub({}, async ({ page }) => {
    assert.deepEqual(await page.evaluate(clearProject, { project: "local" }), { removed: [] });
  });
});

await check("zip entries: directory and dot entries dropped, a wrapping folder unwrapped, an escaping path refused", () => {
  const b = (s) => new Uint8Array(Buffer.from(s));
  assert.deepEqual(
    zipProjectEntries({ "main.sd": b("m"), "assets/": new Uint8Array(0), "assets/a.png": b("a"), ".name": b("x"), "__MACOSX/._main.sd": b("y") }).map((e) => e.path),
    ["assets/a.png", "main.sd"],
  );
  assert.deepEqual(
    zipProjectEntries({ "game/": new Uint8Array(0), "game/main.sd": b("m"), "game/scripts/x.sd": b("s") }).map((e) => e.path),
    ["main.sd", "scripts/x.sd"],
  );
  // Two top-level folders, neither the project root: left as they are.
  assert.deepEqual(
    zipProjectEntries({ "a/main.sd": b("m"), "b/x.sd": b("s") }).map((e) => e.path),
    ["a/main.sd", "b/x.sd"],
  );
  assert.deepEqual(zipProjectEntries({ "assets\\a.png": b("a") }).map((e) => e.path), ["assets/a.png"]);
  assert.throws(() => zipProjectEntries({ "../escape.sd": b("e") }), /climbs out/);
  assert.throws(() => zipProjectEntries({ "/abs.sd": b("e") }), /not a relative path/);
  assert.deepEqual(zipProjectEntries({}), []);
});

let fflate = null;
try {
  fflate = await import("fflate");
} catch {
  /* not installed here */
}
if (fflate) {
  await check("an exported zip seeds the same files as the directory it was made from", async () => {
    const archive = {};
    for (const f of walkProjectDir(fixture)) archive[f.path] = new Uint8Array(f.bytes);
    const zipPath = path.join(scratch, "export.zip");
    fs.writeFileSync(zipPath, fflate.zipSync(archive, { level: 0 }));
    await withStub({}, async ({ page }) => {
      const report = await seedProject(page, zipPath);
      assert.equal(report.reason, undefined, report.reason);
      assert.equal(report.kind, "zip");
      assert.equal(report.files, 4);
      assert.equal(report.bytes, totalBytes);
      for (const [rel, bytes] of Object.entries(files)) {
        assert.equal(Buffer.compare(await readBack(page, rel), bytes), 0, `${rel} reads back differently from the zip`);
      }
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
  console.log("SKIP: the zip cases need fflate, which `npm install` at the repo root provides");
}

fs.rmSync(scratch, { recursive: true, force: true });

if (failures > 0) {
  console.log(`\n${failures} failing`);
  process.exit(1);
}
console.log("\nall passing");

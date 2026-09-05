#!/usr/bin/env node
// Pins hereOrPrevious and pidAlive, the two decisions behind the driver's
// state-file fallback. Run:
//   node .claude/skills/drive-web-editor/state-path.test.mjs
//
// hereOrPrevious picks where the state file and the Chromium profile live:
// beside the driver, unless nothing is there and a copy sits under the
// resolve-issue skill, where a dev-server tree launched from the driver's
// previous location left it. pidAlive is what keeps `up` from deleting the
// record of a tree that is still building: one probe timing out says nothing,
// a recorded pid that is gone says the record is stale.
//
// Pure functions, no browser, no disk: hereOrPrevious takes its `exists`
// predicate as a parameter. Node's built-in assert only.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { hereOrPrevious, pidAlive } from "./driver.mjs";

let failures = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL: ${name}`);
    console.log(`  ${String(err.message).split("\n").join("\n  ")}`);
  }
};

const under = (file, dir) => path.basename(path.dirname(file)) === dir;
const existsIn = (...dirs) => (file) => dirs.includes(path.basename(path.dirname(file)));

check("with nothing anywhere, the path is beside the driver", () => {
  const file = hereOrPrevious(".state.json", () => false);
  assert.equal(path.basename(file), ".state.json");
  assert.ok(under(file, "drive-web-editor"), file);
});

check("with a file only at the previous location, that file is used", () => {
  const file = hereOrPrevious(".state.json", existsIn("resolve-issue"));
  assert.ok(under(file, "resolve-issue"), file);
});

check("with a file only beside the driver, it is used", () => {
  const file = hereOrPrevious(".state.json", existsIn("drive-web-editor"));
  assert.ok(under(file, "drive-web-editor"), file);
});

check("with files at both locations, the one beside the driver wins", () => {
  const file = hereOrPrevious(".chrome-profile", existsIn("drive-web-editor", "resolve-issue"));
  assert.ok(under(file, "drive-web-editor"), file);
});

check("the predicate is asked about both candidates and nothing else", () => {
  const asked = [];
  hereOrPrevious(".state.json", (file) => {
    asked.push(file);
    return false;
  });
  assert.deepEqual(
    asked.map((f) => `${path.basename(path.dirname(f))}/${path.basename(f)}`),
    ["drive-web-editor/.state.json", "resolve-issue/.state.json"],
  );
});

check("pidAlive is true for this process", () => {
  assert.equal(pidAlive(process.pid), true);
});

check("pidAlive is false for a process that has exited", () => {
  const child = spawnSync(process.execPath, ["-e", "0"]);
  assert.equal(child.status, 0, "the probe child must exit cleanly");
  assert.ok(child.pid > 0, "spawnSync reports the child's pid");
  assert.equal(pidAlive(child.pid), false);
});

check("pidAlive is false for a pid that cannot name a process", () => {
  for (const pid of [0, -1, 1.5, NaN, undefined, null, "123"]) {
    assert.equal(pidAlive(pid), false, `pid ${String(pid)}`);
  }
});

if (failures) {
  console.log(`${failures} failing`);
  process.exit(1);
}
console.log("all passing");

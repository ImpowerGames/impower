#!/usr/bin/env node
// Pins the decisions behind the driver's state file: where it lives, whether a
// recorded pid is alive, and whether the tree a record names is still there.
// Run:
//   node .claude/skills/drive-web-editor/state-path.test.mjs
//
// hereOrPrevious picks where the state file and the Chromium profile live:
// beside the driver, unless nothing is there and a copy sits under the
// resolve-issue skill, where a dev-server tree launched from the driver's
// previous location left it. pidAlive asks the system whether a pid exists,
// and counts a pid it may not signal (EPERM) as alive. recordStands is what
// keeps `up` from deleting the record of a tree that is still building, and
// what stops it waiting on a record whose pid the system has handed to some
// other process: a live pid vouches for the record only with a held editor
// port or a record younger than a launch's wait.
//
// No browser, no disk, no signals: hereOrPrevious takes its `exists`
// predicate, pidAlive its `kill`, and recordStands its `probe` as parameters.
// The default wiring is pinned against tracked files that sit at only one of
// the two candidate locations. Node's built-in assert only.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { READY_WAIT_MS, hereOrPrevious, pidAlive, recordStands } from "./driver.mjs";

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

const under = (file, dir) => path.basename(path.dirname(file)) === dir;
const existsIn = (...dirs) => (file) => dirs.includes(path.basename(path.dirname(file)));

await check("with nothing anywhere, the path is beside the driver", () => {
  const file = hereOrPrevious(".state.json", () => false);
  assert.equal(path.basename(file), ".state.json");
  assert.ok(under(file, "drive-web-editor"), file);
});

await check("with a file only at the previous location, that file is used", () => {
  const file = hereOrPrevious(".state.json", existsIn("resolve-issue"));
  assert.ok(under(file, "resolve-issue"), file);
});

await check("with a file only beside the driver, it is used", () => {
  const file = hereOrPrevious(".state.json", existsIn("drive-web-editor"));
  assert.ok(under(file, "drive-web-editor"), file);
});

await check("with files at both locations, the one beside the driver wins", () => {
  const file = hereOrPrevious(".chrome-profile", existsIn("drive-web-editor", "resolve-issue"));
  assert.ok(under(file, "drive-web-editor"), file);
});

await check("the predicate is asked about both candidates and nothing else", () => {
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

await check("with no predicate, the disk decides: a tracked file at only the previous location is found there", () => {
  // landing-pad.test.sh is tracked under resolve-issue and nothing of that name
  // sits beside the driver; SKILL.md is tracked at both; the last name is at
  // neither. A default predicate that answers false for everything would put
  // the first of these beside the driver.
  assert.ok(under(hereOrPrevious("landing-pad.test.sh"), "resolve-issue"));
  assert.ok(under(hereOrPrevious("SKILL.md"), "drive-web-editor"));
  assert.ok(under(hereOrPrevious("no-such-file.probe"), "drive-web-editor"));
});

await check("pidAlive is true for this process", () => {
  assert.equal(pidAlive(process.pid), true);
});

await check("pidAlive is false for a process that has exited", () => {
  const child = spawnSync(process.execPath, ["-e", "0"]);
  assert.equal(child.status, 0, "the probe child must exit cleanly");
  assert.ok(child.pid > 0, "spawnSync reports the child's pid");
  assert.equal(pidAlive(child.pid), false);
});

await check("pidAlive is false for a pid that cannot name a process", () => {
  for (const pid of [0, -1, 1.5, NaN, undefined, null, "123"]) {
    assert.equal(pidAlive(pid), false, `pid ${String(pid)}`);
  }
});

const throwing = (code) => () => {
  throw Object.assign(new Error(code), { code });
};

await check("pidAlive counts a pid it may not signal (EPERM) as alive, and any other refusal as gone", () => {
  assert.equal(pidAlive(4, throwing("EPERM")), true);
  assert.equal(pidAlive(4, throwing("ESRCH")), false);
  assert.equal(pidAlive(4, throwing("EINVAL")), false);
  assert.equal(pidAlive(4, () => undefined), true);
});

// A probe whose answers are fixed, recording what it was asked.
const probe = ({ alive, held, age }) => {
  const asked = [];
  return {
    asked,
    pidAlive: (pid) => (asked.push(`pid:${pid}`), alive),
    portHeld: async (url) => (asked.push(`port:${url}`), held),
    ageMs: () => (asked.push("age"), age),
  };
};
const record = { url: "http://localhost:38200", pid: 31268, mode: "same-origin" };

await check("a record with no url does not stand", async () => {
  assert.equal(await recordStands(null, probe({ alive: true, held: true, age: 0 })), false);
  assert.equal(await recordStands({ pid: 5 }, probe({ alive: true, held: true, age: 0 })), false);
});

await check("a record whose pid is gone does not stand, and its port is never asked", async () => {
  const p = probe({ alive: false, held: true, age: 0 });
  assert.equal(await recordStands(record, p), false);
  assert.deepEqual(p.asked, ["pid:31268"]);
});

await check("a live pid holding its editor port stands, however old the record", async () => {
  const p = probe({ alive: true, held: true, age: Infinity });
  assert.equal(await recordStands(record, p), true);
  assert.deepEqual(p.asked, ["pid:31268", "port:http://localhost:38200"]);
});

await check("a live pid with a free port stands only while the record is younger than a launch's wait", async () => {
  assert.equal(await recordStands(record, probe({ alive: true, held: false, age: READY_WAIT_MS - 1 })), true);
  assert.equal(await recordStands(record, probe({ alive: true, held: false, age: READY_WAIT_MS })), false);
  assert.equal(await recordStands(record, probe({ alive: true, held: false, age: Infinity })), false);
});

if (failures) {
  console.log(`${failures} failing`);
  process.exit(1);
}
console.log("all passing");

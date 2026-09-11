#!/usr/bin/env node
// Pins the decisions behind the driver's state file: where it lives, whether a
// recorded pid is alive, whether the record still names its launcher, and
// what `status`, `up` and `down` do with each kind of record.
// Run:
//   node .agents/skills/drive-web-editor/state-path.test.mjs
//
// hereOrPrevious picks where the state file and the Chromium profile live:
// beside the driver, unless nothing is there and a copy sits under the
// resolve-issue skill, where a dev-server tree launched from the driver's
// previous location left it. pidAlive asks the system whether a pid exists,
// and counts a pid it may not signal (EPERM) as alive. recordStands is what
// keeps `up` from deleting the record of a tree that is still building, and
// what stops `down` killing a process the system handed a freed pid to: a live
// pid vouches for the record only when the process behind it started when the
// record was written.
//
// The pure parts take their inputs as parameters (hereOrPrevious its `exists`
// predicate, pidAlive its `kill`, recordStands its `probe`), so the tables are
// pinned without a process or a file. The live probe is pinned against a child
// this check spawns. The commands are pinned by copying the driver into a
// scratch repository with no package.json, so a launch it attempts fails at
// spawn, and running the copy as a command over records this check writes; the
// only processes it signals are children it spawned. Node's built-in assert
// only.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LAUNCH_SLACK_MS,
  READY_WAIT_MS,
  START_GRAIN_MS,
  hereOrPrevious,
  liveProbe,
  linuxProcesses,
  pidAlive,
  recordStands,
  stopLinuxTree,
} from "./driver.mjs";

const WIN = process.platform === "win32";

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

await check("state lookup checks canonical paths before migration paths", () => {
  const asked = [];
  hereOrPrevious(".state.json", (file) => {
    asked.push(file);
    return false;
  });
  assert.deepEqual(
    asked.map((f) => path.relative(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.."), f).replaceAll("\\", "/")),
    [".agents/skills/drive-web-editor/.state.json", ".agents/skills/resolve-issue/.state.json", ".claude/skills/drive-web-editor/.state.json", ".claude/skills/resolve-issue/.state.json"],
  );
});

await check("with no predicate, the disk decides: a tracked file at only the previous location is found there", () => {
  // landing-pad.test.sh is the one tracked file that sits under resolve-issue
  // and not beside the driver; SKILL.md is tracked at both; the last name is
  // at neither. A default predicate that answers false for everything would
  // put the first of these beside the driver. If landing-pad.test.sh moves,
  // this pin needs another file that sits only under resolve-issue.
  assert.ok(under(hereOrPrevious("landing-pad.test.sh"), "resolve-issue"), "landing-pad.test.sh was not found under resolve-issue alone; this pin depends on that file sitting only there");
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
const probe = ({ alive, started, written = null }) => {
  const asked = [];
  return {
    asked,
    pidAlive: (pid) => (asked.push(`pid:${pid}`), alive),
    startedMs: async (pid) => (asked.push(`start:${pid}`), started),
    recordWrittenMs: () => (asked.push("written"), written),
  };
};
const AT = 1_700_000_000_000;
await check("Linux group shutdown refuses foreign, reused and nonleader identities without signalling", async () => {
  const leader = { pid: 300, parent: 20, group: 300, session: 300, uid: 10, start: "123", state: "S" };
  for (const row of [null, { ...leader, group: 20 }, { ...leader, session: 20 }, { ...leader, uid: 11 }, { ...leader, start: undefined }]) {
    const signals = [];
    await assert.rejects(stopLinuxTree(300, { read: () => row ? [row] : [], uid: 10, self: 20, signal: (...args) => signals.push(args) }));
    assert.deepEqual(signals, []);
  }
  for (const changed of [{ ...leader, start: "456" }, { ...leader, uid: 11 }, { ...leader, session: 400 }]) {
    let reads = 0;
    const signals = [];
    await assert.rejects(stopLinuxTree(300, { read: () => [reads++ ? changed : leader], uid: 10, self: 20, signal: (...args) => signals.push(args) }));
    assert.deepEqual(signals, []);
  }
});

await check("Linux shutdown verifies group exit, escalates resistant children, and refuses reused groups", async () => {
  const leader = { pid: 300, parent: 20, group: 300, session: 300, uid: 10, start: "123", state: "S" };
  const child = { ...leader, pid: 301, parent: 300, start: "124" };
  let rows = [leader, child], time = 0;
  const signals = [];
  await stopLinuxTree(300, { read: () => rows, uid: 10, self: 20, now: () => time, sleep: async (ms) => { time += ms; }, signal: (pid, kind) => { signals.push([pid, kind]); rows = kind === "SIGTERM" ? [child] : [{ ...child, state: "Z" }]; } });
  assert.deepEqual(signals, [[-300, "SIGTERM"], [-300, "SIGKILL"]]);
  rows = [leader];
  await assert.rejects(stopLinuxTree(300, { read: () => rows, uid: 10, self: 20, signal: () => { rows = [{ ...leader, start: "reused" }]; } }), /identity changed/);
  rows = [leader, { ...child, group: 301 }];
  await assert.rejects(stopLinuxTree(300, { read: () => rows, uid: 10, self: 20, signal: () => assert.fail("escaped group was signalled") }), /descendant left/);
  rows = [leader, child];
  await assert.rejects(stopLinuxTree(300, { read: () => rows, uid: 10, self: 20, signal: () => { rows = [{ ...child, parent: 1, group: 301, session: 301 }]; } }), /descendant left/);
});
const record = { url: "http://localhost:38200", pid: 31268, mode: "same-origin", startedAt: AT };

await check("a record with no url does not stand", async () => {
  assert.equal(await recordStands(null, probe({ alive: true, started: AT })), false);
  assert.equal(await recordStands({ pid: 5, startedAt: AT }, probe({ alive: true, started: AT })), false);
});

await check("a record whose pid is gone does not stand, and its start is never asked", async () => {
  const p = probe({ alive: false, started: AT });
  assert.equal(await recordStands(record, p), false);
  assert.deepEqual(p.asked, ["pid:31268"]);
});

await check("a live pid whose start the system will not report does not stand", async () => {
  const p = probe({ alive: true, started: null });
  assert.equal(await recordStands(record, p), false);
  assert.deepEqual(p.asked, ["pid:31268", "start:31268"]);
});

await check("a live pid that started when the record was written stands", async () => {
  assert.equal(await recordStands(record, probe({ alive: true, started: AT })), true);
  assert.equal(await recordStands(record, probe({ alive: true, started: AT - LAUNCH_SLACK_MS })), true);
  assert.equal(await recordStands(record, probe({ alive: true, started: AT + START_GRAIN_MS })), true);
});

await check("a live pid that started after the record was written does not stand (the system reused the pid)", async () => {
  assert.equal(await recordStands(record, probe({ alive: true, started: AT + START_GRAIN_MS + 1 })), false);
  assert.equal(await recordStands(record, probe({ alive: true, started: AT + READY_WAIT_MS })), false);
});

await check("a live pid that started long before the record was written does not stand", async () => {
  assert.equal(await recordStands(record, probe({ alive: true, started: AT - LAUNCH_SLACK_MS - 1 })), false);
});

await check("a record with no startedAt is dated by its file, and stands only when the file can be dated", async () => {
  const old = { url: record.url, pid: record.pid, mode: record.mode };
  const dated = probe({ alive: true, started: AT, written: AT + 100 });
  assert.equal(await recordStands(old, dated), true);
  assert.deepEqual(dated.asked, ["pid:31268", "start:31268", "written"]);
  assert.equal(await recordStands(old, probe({ alive: true, started: AT, written: AT - LAUNCH_SLACK_MS - 1 })), false);
  assert.equal(await recordStands(old, probe({ alive: true, started: AT, written: null })), false);
  const withDate = probe({ alive: true, started: AT, written: null });
  assert.equal(await recordStands(record, withDate), true, "a record with startedAt never consults the file");
  assert.ok(!withDate.asked.includes("written"));
});

// ---------------------------------------------------------- the live probe ---

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const idle = () => spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", detached: true, windowsHide: true });
const untilGone = async (pid, ms = 5_000) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (!pidAlive(pid)) return true;
    await sleep(100);
  }
  return !pidAlive(pid);
};
const stop = (child) => {
  try {
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-child.pid, "SIGKILL");
  } catch {
    /* already gone */
  }
};

await check("the live probe dates a child this check spawned to when it was spawned", async () => {
  const child = idle();
  const spawnedAt = Date.now();
  try {
    const started = await liveProbe.startedMs(child.pid);
    assert.notEqual(started, null, "the system reported no start for our own child");
    assert.ok(started >= spawnedAt - LAUNCH_SLACK_MS && started <= spawnedAt + START_GRAIN_MS, `started ${started} against spawn at ${spawnedAt}`);
    assert.equal(await recordStands({ url: "http://localhost:1", pid: child.pid, startedAt: spawnedAt }), true);
    assert.equal(await recordStands({ url: "http://localhost:1", pid: child.pid, startedAt: spawnedAt - LAUNCH_SLACK_MS - 60_000 }), false, "a record written a minute before the process started names a reused pid");
  } finally {
    stop(child);
    assert.ok(await untilGone(child.pid), "the idle child did not stop");
  }
});

await check("the live probe reports no start for a process that has exited or a pid that names none", async () => {
  const gone = spawnSync(process.execPath, ["-e", "0"]);
  assert.equal(await liveProbe.startedMs(gone.pid), null);
  for (const pid of [0, -1, 1.5, NaN, undefined, null, "123"]) {
    assert.equal(await liveProbe.startedMs(pid), null, `pid ${String(pid)}`);
  }
});

// ------------------------------------------------------------ the commands ---
//
// A copy of the driver laid out as `.agents/skills/drive-web-editor/` under a
// scratch repository root that holds no package.json, beside an empty
// `resolve-issue/`. REPO_ROOT resolves three directories up from the copy, so
// the one `up` that reaches a launch below runs `npm run web:dev` there, fails
// at once, and starts no server.

const here = path.dirname(fileURLToPath(import.meta.url));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "state-path-"));
console.log(`scratch repository: ${path.join(scratch, "repo")}`);
const copyDir = path.join(scratch, "repo", ".agents", "skills", "drive-web-editor");
fs.mkdirSync(copyDir, { recursive: true });
fs.mkdirSync(path.join(scratch, "repo", ".agents", "skills", "resolve-issue"), { recursive: true });
for (const name of ["driver.mjs", "redgreen.mjs"]) fs.copyFileSync(path.join(here, name), path.join(copyDir, name));
const copy = path.join(copyDir, "driver.mjs");
const stateFile = path.join(copyDir, ".state.json");
const fixture = path.join(scratch, "tree.mjs");
fs.writeFileSync(fixture, [
  'import fs from "node:fs";',
  'import net from "node:net";',
  'import { spawn } from "node:child_process";',
  'const [file, role] = process.argv.slice(2);',
  'process.on("SIGTERM", () => {});',
  'if (role !== "leaf") spawn(process.execPath, [process.argv[1], file, role === "root" ? "child" : "leaf"], { stdio: "ignore", windowsHide: true });',
  'const server = net.createServer();',
  'server.listen(0, "127.0.0.1", () => fs.appendFileSync(file, JSON.stringify({ pid: process.pid, port: server.address().port }) + "\\n"));',
].join("\n"));
const startTree = async () => {
  const file = path.join(scratch, `tree-${Date.now()}.jsonl`);
  const child = spawn(process.execPath, [fixture, file, "root"], { stdio: "ignore", detached: true, windowsHide: true });
  let rows = [];
  try {
    for (let i = 0; i < 100; i++) {
      if (fs.existsSync(file)) rows = fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
      if (rows.length === 3) return { child, rows };
      await sleep(50);
    }
    throw new Error("tree did not report all three listeners");
  } catch (error) { stop(child); await untilGone(child.pid); throw error; }
};
const treeGone = async (rows) => {
  for (let i = 0; i < 100; i++) {
    const living = process.platform === "linux" ? linuxProcesses().filter((row) => row.state !== "Z" && row.state !== "X").map((row) => row.pid) : rows.filter((row) => pidAlive(row.pid)).map((row) => row.pid);
    if (!rows.some((row) => living.includes(row.pid))) return true;
    await sleep(50);
  }
  return false;
};
const writeRecord = (record) => fs.writeFileSync(stateFile, typeof record === "string" ? record : JSON.stringify(record));
const run = (cmd) => {
  const r = spawnSync(process.execPath, [copy, cmd], { encoding: "utf8", windowsHide: true, timeout: 60_000 });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
};
// For a command that must reach a server this process is running: spawnSync
// blocks the event loop, and a server here cannot answer while it is blocked.
const runWhileServing = (cmd) =>
  new Promise((resolve) => {
    const p = spawn(process.execPath, [copy, cmd], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (status) => resolve({ status, out }));
  });
const listen = () =>
  new Promise((resolve) => {
    const server = http.createServer((_req, res) => res.end("ok"));
    // The record names the address the listener bound; `localhost` would
    // resolve to ::1 first and miss a server on 127.0.0.1.
    server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
const closed = (server) => new Promise((resolve) => server.close(resolve));

try {
  for (const dated of [true, false]) await check(`down stops three resistant generations and releases their listeners (${dated ? "startedAt" : "file date"})`, async () => {
    const { child, rows } = await startTree();
    try {
      if (process.platform === "linux") {
        const member = rows.find((row) => row.pid !== child.pid);
        writeRecord({ url: "http://localhost:1", pid: member.pid, ...(dated ? { startedAt: Date.now() } : {}) });
        const refused = await runWhileServing("down");
        assert.equal(refused.status, 1, refused.out);
        assert.match(refused.out, /does not own an identifiable process group/);
        assert.ok(fs.existsSync(stateFile), "refused shutdown removed its recovery record");
        assert.ok(rows.every((row) => pidAlive(row.pid)), "a nonleader record killed part of the tree");
      }
      writeRecord({ url: "http://localhost:1", pid: child.pid, mode: "same-origin", ...(dated ? { startedAt: Date.now() } : {}) });
      const result = await runWhileServing("down");
      assert.equal(result.status, 0, result.out);
      assert.match(result.out, /^stopped$/m);
      assert.ok(await treeGone(rows), "down left a launcher, child or grandchild running");
      for (const row of rows) {
        const server = http.createServer();
        await new Promise((resolve, reject) => { server.once("error", reject); server.listen(row.port, "127.0.0.1", resolve); });
        await closed(server);
      }
      assert.equal(fs.existsSync(stateFile), false);
    } finally {
      stop(child);
      assert.ok(await treeGone(rows), "fixture cleanup left child processes behind");
    }
  });
  await check("status: no state file reads down and exits 1", () => {
    const r = run("status");
    assert.match(r.out, /down \(no state file\)/);
    assert.equal(r.status, 1, r.out);
  });

  await check("status, up and down on an unreadable state file: reported, refused and left intact, removed", () => {
    writeRecord('{"url":"http://localhost:1","pid":4,"mo');
    const s = run("status");
    assert.match(s.out, /state file unreadable/);
    assert.equal(s.status, 1, s.out);
    const u = run("up");
    assert.match(u.out, /ERROR: state file unreadable/);
    assert.equal(u.status, 1, u.out);
    assert.equal(fs.readFileSync(stateFile, "utf8"), '{"url":"http://localhost:1","pid":4,"mo', "up changed the unreadable file");
    const d = run("down");
    assert.match(d.out, /removed .*recorded no pid to stop/);
    assert.equal(d.status, 0, d.out);
    assert.equal(fs.existsSync(stateFile), false, "down left the unreadable file");
    assert.match(run("status").out, /down \(no state file\)/);
  });

  await check("status and up on a record whose URL answers: UP with the file named, exit 0, and up reuses it", async () => {
    const { server, url } = await listen();
    try {
      writeRecord({ url, pid: process.pid, mode: "same-origin", startedAt: Date.now() });
      const s = await runWhileServing("status");
      assert.match(s.out, new RegExp(`UP  url=${url}  pid=${process.pid}  mode=same-origin  state=.*state\\.json`));
      assert.equal(s.status, 0, s.out);
      const u = await runWhileServing("up");
      assert.match(u.out, new RegExp(`already up → ${url}`));
      assert.equal(u.status, 0, u.out);
    } finally {
      await closed(server);
    }
  });

  await check("status on a record whose URL does not answer reads DOWN and exits 1", () => {
    writeRecord({ url: "http://localhost:1", pid: process.pid, mode: "same-origin", startedAt: Date.now() });
    const s = run("status");
    assert.match(s.out, /DOWN  url=http:\/\/localhost:1/);
    assert.equal(s.status, 1, s.out);
  });

  await check("down on a record whose pid has exited removes it and signals nothing", () => {
    const gone = spawnSync(process.execPath, ["-e", "0"]);
    writeRecord({ url: "http://localhost:1", pid: gone.pid, mode: "same-origin", startedAt: Date.now() });
    const d = run("down");
    assert.match(d.out, /removed .*no longer the launcher it recorded.*nothing was stopped/);
    assert.equal(d.status, 0, d.out);
    assert.equal(fs.existsSync(stateFile), false);
  });

  await check("down on a record whose pid the system reused removes it and leaves that process alone", async () => {
    const child = idle();
    try {
      writeRecord({ url: "http://localhost:1", pid: child.pid, mode: "same-origin", startedAt: Date.now() - 60 * 60_000 });
      const d = run("down");
      assert.match(d.out, /removed .*no longer the launcher it recorded.*nothing was stopped/);
      assert.doesNotMatch(d.out, /^stopped$/m);
      assert.equal(d.status, 0, d.out);
      assert.equal(fs.existsSync(stateFile), false);
      assert.equal(pidAlive(child.pid), true, "down killed a process the record no longer named");
    } finally {
      stop(child);
      await untilGone(child.pid);
    }
  });

  await check("down on a standing record stops its tree and removes the record", async () => {
    const child = idle();
    try {
      writeRecord({ url: "http://localhost:1", pid: child.pid, mode: "same-origin", startedAt: Date.now() });
      const d = run("down");
      assert.match(d.out, /stopped/);
      assert.equal(d.status, 0, d.out);
      assert.equal(fs.existsSync(stateFile), false, "down kept the record after stopping");
      assert.ok(await untilGone(child.pid), "down reported stopped but the launcher is alive");
    } finally {
      stop(child);
    }
  });

  await check("down on a record with no startedAt dates it by the file and stops its tree", async () => {
    const child = idle();
    try {
      writeRecord({ url: "http://localhost:1", pid: child.pid, mode: "same-origin" });
      const d = run("down");
      assert.match(d.out, /stopped/);
      assert.equal(d.status, 0, d.out);
      assert.ok(await untilGone(child.pid), "down reported stopped but the launcher is alive");
    } finally {
      stop(child);
    }
  });

  await check("up waits on a standing record while its launcher lives, and launches once it exits", async () => {
    const launchedRowsFile = path.join(scratch, "npm-tree.jsonl");
    fs.writeFileSync(path.join(scratch, "repo", "package.json"), JSON.stringify({ scripts: { "web:dev": `node "${fixture.replaceAll("\\", "/")}" "${launchedRowsFile.replaceAll("\\", "/")}" root` } }));
    let launchedRows = [];
    const child = idle();
    writeRecord({ url: "http://localhost:1", pid: child.pid, mode: "same-origin", startedAt: Date.now() });
    const up = spawn(process.execPath, [copy, "up"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true, detached: true });
    let out = "";
    up.stdout.on("data", (d) => (out += d));
    up.stderr.on("data", (d) => (out += d));
    const saw = async (re, ms) => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        if (re.test(out)) return true;
        await sleep(100);
      }
      return re.test(out);
    };
    try {
      assert.ok(await saw(new RegExp(`servers pid ${child.pid} are still starting → http://localhost:1`), 10_000), `up did not wait on the record:\n${out}`);
      await sleep(2_000);
      assert.doesNotMatch(out, /launching/, "up launched while the launcher was alive");
      stop(child);
      assert.ok(await saw(new RegExp(`servers pid ${child.pid} have exited; launching`), 10_000), `up did not notice the launcher exit:\n${out}`);
      assert.ok(await saw(/launching dev servers \(same-origin\) pid \d+ → http:\/\/localhost:\d+/, 10_000), `up did not launch:\n${out}`);
      const written = JSON.parse(fs.readFileSync(stateFile, "utf8"));
      assert.notEqual(written.pid, child.pid, "the new record still names the exited launcher");
      assert.ok(Number.isInteger(written.startedAt), "the new record carries no startedAt");
      assert.equal(fs.existsSync(stateFile + ".tmp"), false, "the rename left its .tmp behind");
      for (let i = 0; i < 100; i++) {
        if (fs.existsSync(launchedRowsFile)) launchedRows = fs.readFileSync(launchedRowsFile, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
        if (launchedRows.length === 3) break;
        await sleep(100);
      }
      assert.equal(launchedRows.length, 3, "the actual npm launcher must reach all fixture descendants");
    } finally {
      stop(child);
      stop(up);
      assert.ok(await untilGone(up.pid), "up coordinator did not exit");
      const launched = JSON.parse(fs.readFileSync(stateFile, "utf8"));
      if (pidAlive(launched.pid)) {
        const d = run("down");
        assert.equal(d.status, 0, d.out);
      }
      assert.ok(await untilGone(launched.pid), "up left its npm launcher behind");
      assert.ok(await treeGone(launchedRows), "up left a descendant behind");
    }
  });
} finally {
  console.log(`Remove scratch repository: ${scratch}`);
  try {
    fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  } catch (err) {
    failures++;
    console.log(`FAIL: could not remove ${scratch} (${err.code ?? err.message}); preserve it for recovery`);
  }
}

if (failures) {
  console.log(`${failures} failing`);
  process.exit(1);
}
console.log("all passing");

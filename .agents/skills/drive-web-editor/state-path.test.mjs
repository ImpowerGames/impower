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
// scratch repository, running the copy over records this check writes. The
// npm launch uses a fixture script that starts three process generations;
// every process signalled belongs to the fixture. Node's built-in assert only.

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
  observeLauncherExit,
  pidAlive,
  recordStands,
  CACHE_STORAGE_SUFFIX,
  PROFILE_CLAIM_MS,
  SESSION_VARIABLES,
  WINDOWS_PATH_LIMIT,
  chooseStateFile,
  driverSession,
  foreignRecord,
  profileClaimConflict,
  profilePathProblem,
  sessionDir,
  launchEditorBrowser,
  claimProfile,
  PROFILE_CLAIM_FILE,
  PROFILE_LOCK_STALE_MS,
  stopLinuxTree,
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
  const child = spawnSync(process.execPath, ["-e", "0"], { windowsHide: true });
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
await check("Linux process reads tolerate protected strangers and refuse unreadable owned entries", () => {
  const fields = Array(20).fill("0");
  Object.assign(fields, { 0: "S", 1: "20", 2: "300", 3: "300", 19: "123" });
  const denied = () => { throw Object.assign(new Error("protected"), { code: "EACCES" }); };
  const io = {
    readdirSync: () => ["300", "933", "sys"],
    statSync: (file) => ({ uid: file.endsWith("933") ? 20 : 10 }),
    readFileSync: (file) => file.includes("/933/") ? denied() : `300 (node worker) ${fields.join(" ")}`,
  };
  const rows = linuxProcesses({ io, uid: 10 });
  assert.equal(rows[0].start, "123");
  assert.deepEqual(rows[1], { pid: 933, uid: 20, unreadable: true });
  assert.throws(() => linuxProcesses({ io: { ...io, statSync: () => ({ uid: 10 }) }, uid: 10 }), /protected/);
  assert.throws(() => linuxProcesses({ io: { ...io, statSync: denied }, uid: 10 }), /protected/);
});

await check("Linux group shutdown refuses foreign, reused and nonleader identities without signalling", async () => {
  const leader = { pid: 300, parent: 20, group: 300, session: 300, uid: 10, start: "123", state: "S" };
  await assert.rejects(stopLinuxTree(300, { read: () => [leader, { ...leader, pid: 20 }], uid: 10, self: 20, signal: () => assert.fail("signalled the caller's group") }), /caller belongs/);
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
  rows = [leader, child];
  await assert.rejects(stopLinuxTree(300, { read: () => rows, uid: 10, self: 20, signal: () => { rows = [{ pid: child.pid, uid: 11, unreadable: true }]; } }), /tracked process became unreadable/);
  const late = { ...child, pid: 302, parent: 301, start: "125" };
  let reads = 0;
  rows = [leader, child, late]; time = 0; signals.length = 0;
  await stopLinuxTree(300, { read: () => reads++ === 0 ? [leader, child] : rows, uid: 10, self: 20, now: () => time, sleep: async (ms) => { time += ms; }, signal: (pid, kind) => { signals.push([pid, kind]); rows = kind === "SIGTERM" ? [late] : []; } });
  assert.deepEqual(signals, [[-300, "SIGTERM"], [-300, "SIGKILL"]], "a later member verified while the group is owned can outlive every original member");
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
const idle = () => spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", detached: process.platform !== "win32", windowsHide: true });
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
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
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
  const gone = spawnSync(process.execPath, ["-e", "0"], { windowsHide: true });
  assert.equal(await liveProbe.startedMs(gone.pid), null);
  for (const pid of [0, -1, 1.5, NaN, undefined, null, "123"]) {
    assert.equal(await liveProbe.startedMs(pid), null, `pid ${String(pid)}`);
  }
});

// ------------------------------------------------------- session storage ---

await check("the session comes from the first variable set, and none means the shared slot", () => {
  assert.equal(driverSession({}), null);
  assert.equal(driverSession({ CLAUDE_CODE_SESSION_ID: "b", CODEX_THREAD_ID: "c" }), "b");
  assert.equal(driverSession({ IMPOWER_DRIVER_SESSION: "a", CLAUDE_CODE_SESSION_ID: "b" }), "a");
  assert.deepEqual(SESSION_VARIABLES[0], "IMPOWER_DRIVER_SESSION");
});

await check("two sessions in one checkout get different directories, both short and outside the checkout", () => {
  const env = { LOCALAPPDATA: "C:\\Users\\someone\\AppData\\Local" };
  const root = "C:\\Users\\someone\\impower.worktrees\\refactor\\689-690-display-only-lowering";
  const a = sessionDir({ root, session: "one", env });
  const b = sessionDir({ root, session: "two", env });
  const shared = sessionDir({ root, session: null, env });
  assert.notEqual(a, b);
  assert.equal(path.basename(shared), "shared");
  assert.ok(!a.startsWith(root), a);
  assert.equal(profilePathProblem(path.join(a, "profile"), "win32"), null, a);
  assert.equal(sessionDir({ root, session: "one", env: { ...env, IMPOWER_DRIVER_HOME: "D:\\h" } }).startsWith("D:\\h"), true);
});

await check("a profile whose Cache Storage paths pass 259 characters is refused on Windows only", () => {
  // The profile location #742 measured: 277 characters with the suffix.
  const deep = "C:\\Users\\Lovelle\\Documents\\GitHub\\impower.worktrees\\refactor\\689-690-display-only-lowering\\.agents\\skills\\drive-web-editor\\.chrome-profile";
  assert.ok(deep.length + CACHE_STORAGE_SUFFIX > WINDOWS_PATH_LIMIT);
  assert.match(profilePathProblem(deep, "win32"), /too deep.*past Windows' 259/);
  assert.equal(profilePathProblem(deep, "linux"), null);
  const edge = "C:\\" + "p".repeat(WINDOWS_PATH_LIMIT - CACHE_STORAGE_SUFFIX - 3);
  assert.equal(profilePathProblem(edge, "win32"), null);
  assert.ok(profilePathProblem(edge + "q", "win32"));
});

await check("a profile claimed by another session in the last 30 min is refused; its own, an old or no claim is not", () => {
  const now = 10 * PROFILE_CLAIM_MS;
  assert.equal(profileClaimConflict(null, "me", now), null);
  assert.equal(profileClaimConflict({ session: "me", at: now - 1000 }, "me", now), null);
  assert.equal(profileClaimConflict({ session: "other", at: now - PROFILE_CLAIM_MS - 1 }, "me", now), null);
  assert.match(profileClaimConflict({ session: "other", at: now - 5 * 60_000 }, "me", now), /opened 5 min ago by another session \(other\)/);
  assert.match(profileClaimConflict({ session: null, at: now }, "me", now), /no session identity/);
  assert.equal(profileClaimConflict({ session: null, at: now }, null, now), null);
});

await check("a record names its session; only a record with a different session is foreign", () => {
  assert.equal(foreignRecord(null, "me"), false);
  assert.equal(foreignRecord({ pid: 1 }, "me"), false);
  assert.equal(foreignRecord({ pid: 1, session: "me" }, "me"), false);
  assert.equal(foreignRecord({ pid: 1, session: "other" }, "me"), true);
  assert.equal(foreignRecord({ pid: 1, session: null }, "me"), true);
  assert.equal(foreignRecord({ pid: 1, session: null }, null), false);
});

await check("the session's own record wins over one beside the driver, which is used only when it alone exists", () => {
  const own = "own/state.json";
  const legacy = () => "legacy/.state.json";
  assert.equal(chooseStateFile(own, legacy, () => false), own);
  assert.equal(chooseStateFile(own, legacy, (f) => f === "legacy/.state.json"), "legacy/.state.json");
  assert.equal(chooseStateFile(own, legacy, () => true), own);
});

await check("the browser launch refuses a too-deep or claimed profile before Playwright loads, and claims a free one", async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "launch-"));
  try {
    let loaded = 0;
    const playwright = async () => {
      loaded++;
      return { chromium: { executablePath: () => process.execPath, launchPersistentContext: async (dir) => ({ dir }) } };
    };
    const deep = path.join(base, "d".repeat(WINDOWS_PATH_LIMIT));
    await assert.rejects(launchEditorBrowser({ headless: true, dir: deep, platform: "win32", playwright }), /too deep/);
    assert.equal(fs.existsSync(deep), false, "a refused profile was created");
    const dir = path.join(base, "p");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, PROFILE_CLAIM_FILE), JSON.stringify({ session: "someone-else", at: Date.now() }));
    await assert.rejects(launchEditorBrowser({ headless: true, dir, platform: "linux", playwright }), /another session \(someone-else\)/);
    fs.writeFileSync(path.join(dir, PROFILE_CLAIM_FILE), '{"session":');
    await assert.rejects(launchEditorBrowser({ headless: true, dir, platform: "linux", playwright }), /cannot be read/);
    assert.equal(loaded, 0, "Playwright loaded for a refused profile");
    fs.rmSync(path.join(dir, PROFILE_CLAIM_FILE));
    assert.deepEqual(await launchEditorBrowser({ headless: true, dir, platform: "linux", playwright }), { dir });
    const claim = JSON.parse(fs.readFileSync(path.join(dir, PROFILE_CLAIM_FILE), "utf8"));
    assert.equal(typeof claim.at, "number");
    assert.deepEqual(fs.readdirSync(dir).sort(), [PROFILE_CLAIM_FILE], "the claim left a temporary or lock file behind");
    // A launch that finds another's lock is refused, whatever the claim says,
    // so two launches at once cannot both pass the check; a stale lock is
    // taken over.
    fs.rmSync(path.join(dir, PROFILE_CLAIM_FILE));
    const lock = path.join(dir, PROFILE_CLAIM_FILE + ".lock");
    fs.writeFileSync(lock, "");
    await assert.rejects(launchEditorBrowser({ headless: true, dir, platform: "linux", playwright }), /another launch is claiming/);
    assert.ok(fs.existsSync(lock), "a refused launch removed another launch's lock");
    assert.equal(fs.existsSync(path.join(dir, PROFILE_CLAIM_FILE)), false, "a refused launch wrote a claim");
    const age = (ms) => {
      const when = (Date.now() - ms) / 1000;
      fs.utimesSync(lock, when, when);
    };
    fs.writeFileSync(lock, "first-holder");
    age(PROFILE_LOCK_STALE_MS + 5_000);
    assert.deepEqual(await launchEditorBrowser({ headless: true, dir, platform: "linux", playwright }), { dir });
    assert.deepEqual(fs.readdirSync(dir).sort(), [PROFILE_CLAIM_FILE]);
    // A stale lock another launch replaced between the read and the removal
    // is not removed, and its new holder is left to finish.
    fs.rmSync(path.join(dir, PROFILE_CLAIM_FILE));
    fs.writeFileSync(lock, "stale-holder");
    age(PROFILE_LOCK_STALE_MS + 5_000);
    assert.throws(() => claimProfile(dir, { session: "me", beforeTakeover: () => fs.writeFileSync(lock, "newer-holder") }), /is held/);
    assert.equal(fs.readFileSync(lock, "utf8"), "newer-holder", "the takeover removed a lock it had not read");
    assert.equal(fs.existsSync(path.join(dir, PROFILE_CLAIM_FILE)), false);
    // A holder stalled past the takeover window writes nothing: the lock it
    // reads back belongs to whoever took it over.
    fs.rmSync(lock);
    assert.throws(() => claimProfile(dir, { session: "me", beforeWrite: () => fs.writeFileSync(lock, "took-over") }), /is held/);
    assert.equal(fs.existsSync(path.join(dir, PROFILE_CLAIM_FILE)), false, "a holder that lost its lock still wrote a claim");
    assert.equal(fs.readFileSync(lock, "utf8"), "took-over", "a holder that lost its lock removed the new holder's lock");
    assert.deepEqual(fs.readdirSync(dir).sort(), [PROFILE_CLAIM_FILE + ".lock"], "a refused claim left a temporary file behind");
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------ the commands ---
//
// A copy of the driver laid out as `.agents/skills/drive-web-editor/` under a
// scratch repository root beside an empty `resolve-issue/`, with the
// `scripts/detached-launch.mjs` it imports. REPO_ROOT resolves
// three directories up from the copy. The final case supplies package.json
// and exercises the real npm launch path with fixture-only TCP listeners.

const here = path.dirname(fileURLToPath(import.meta.url));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "state-path-"));
console.log(`scratch repository: ${path.join(scratch, "repo")}`);
const copyDir = path.join(scratch, "repo", ".agents", "skills", "drive-web-editor");
fs.mkdirSync(copyDir, { recursive: true });
fs.mkdirSync(path.join(scratch, "repo", ".agents", "skills", "resolve-issue"), { recursive: true });
for (const name of ["driver.mjs", "redgreen.mjs", "session-dir.mjs"]) fs.copyFileSync(path.join(here, name), path.join(copyDir, name));
fs.mkdirSync(path.join(scratch, "repo", "scripts"));
fs.copyFileSync(path.join(here, "..", "..", "..", "scripts", "detached-launch.mjs"), path.join(scratch, "repo", "scripts", "detached-launch.mjs"));
const copy = path.join(copyDir, "driver.mjs");
// The copy keeps its records under a home inside the scratch directory, as
// the session this check names; every command below inherits both.
process.env.IMPOWER_DRIVER_HOME = path.join(scratch, "home");
process.env.IMPOWER_DRIVER_SESSION = "state-path-session";
const stateFile = path.join(sessionDir({ root: path.join(scratch, "repo"), session: "state-path-session", env: process.env }), "state.json");
const legacyStateFile = path.join(copyDir, ".state.json");
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
  const child = spawn(process.execPath, [fixture, file, "root"], { stdio: "ignore", detached: process.platform !== "win32", windowsHide: true });
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
const writeRecord = (record, file = stateFile) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof record === "string" ? record : JSON.stringify(record));
};
// A record that must name no live process takes the pid of a child that has
// already exited. A fixed small pid names a kernel thread on some Linux hosts
// and the System process on Windows, and the driver refuses to stop those.
const deadPid = () => {
  const child = spawnSync(process.execPath, ["-e", "0"], { windowsHide: true });
  assert.ok(child.pid > 0 && !pidAlive(child.pid), `fixture pid ${String(child.pid)} still names a live process`);
  return child.pid;
};
// Each command case starts with no record in either location, so a record one
// failed case leaves behind cannot fail the next.
const freshCheck = (name, fn) =>
  check(name, () => {
    for (const file of [stateFile, legacyStateFile]) fs.rmSync(file, { force: true });
    return fn();
  });
const run = (cmd, ...args) => {
  const r = spawnSync(process.execPath, [copy, cmd, ...args], { encoding: "utf8", windowsHide: true, timeout: 60_000 });
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
  for (const dated of [true, false]) await freshCheck(`down stops three resistant generations and releases their listeners (${dated ? "startedAt" : "file date"})`, async () => {
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
      } else {
        console.log(`SKIP: nonleader shutdown refusal (${dated ? "startedAt" : "file date"}; Linux only: process-group ownership)`);
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
  await freshCheck("status: no state file reads down and exits 1", () => {
    const r = run("status");
    assert.match(r.out, /down \(no state file\)/);
    assert.equal(r.status, 1, r.out);
  });

  await freshCheck("down leaves another session's servers running and keeps its record; --force goes past the refusal", () => {
    writeRecord({ url: "http://localhost:1", pid: deadPid(), mode: "same-origin", startedAt: Date.now(), session: "someone-else" });
    const d = run("down");
    assert.equal(d.status, 1, d.out);
    assert.match(d.out, /launched by another session \(someone-else\); they keep running/);
    assert.ok(fs.existsSync(stateFile), "down removed another session's record");
    const forced = run("down", "--force");
    assert.doesNotMatch(forced.out, /another session/);
    assert.equal(fs.existsSync(stateFile), false, forced.out);
  });

  await freshCheck("a record beside the driver, from before session directories, is still found and stopped", () => {
    writeRecord({ url: "http://localhost:1", pid: deadPid(), mode: "same-origin" }, legacyStateFile);
    assert.match(run("status").out, /state=.*drive-web-editor[\\/]\.state\.json/);
    run("down");
    assert.equal(fs.existsSync(legacyStateFile), false);
  });

  await freshCheck("status, up and down on an unreadable state file: reported, refused and left intact, removed", () => {
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

  await freshCheck("status and up on a record whose URL answers: UP with the file named, exit 0, and up reuses it", async () => {
    const { server, url } = await listen();
    try {
      writeRecord({ url, pid: process.pid, mode: "same-origin", startedAt: Date.now() });
      const s = await runWhileServing("status");
      assert.match(s.out, new RegExp(`UP  url=${url}  pid=${process.pid}  mode=same-origin  session=none  state=.*state\\.json`));
      assert.equal(s.status, 0, s.out);
      const u = await runWhileServing("up");
      assert.match(u.out, new RegExp(`already up → ${url}`));
      assert.equal(u.status, 0, u.out);
    } finally {
      await closed(server);
    }
  });

  await freshCheck("status on a record whose URL does not answer reads DOWN and exits 1", () => {
    writeRecord({ url: "http://localhost:1", pid: process.pid, mode: "same-origin", startedAt: Date.now() });
    const s = run("status");
    assert.match(s.out, /DOWN  url=http:\/\/localhost:1/);
    assert.equal(s.status, 1, s.out);
  });

  await freshCheck("down on a record whose pid has exited removes it and signals nothing", () => {
    const gone = spawnSync(process.execPath, ["-e", "0"], { windowsHide: true });
    writeRecord({ url: "http://localhost:1", pid: gone.pid, mode: "same-origin", startedAt: Date.now() });
    const d = run("down");
    assert.match(d.out, /removed .*no longer the launcher it recorded.*nothing was stopped/);
    assert.equal(d.status, 0, d.out);
    assert.equal(fs.existsSync(stateFile), false);
  });

  await freshCheck("down on a record whose pid the system reused removes it and leaves that process alone", async () => {
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

  await freshCheck("down on a standing record stops its tree and removes the record", async () => {
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

  await freshCheck("down on a record with no startedAt dates it by the file and stops its tree", async () => {
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

  await freshCheck("up waits on a standing record while its launcher lives, and launches once it exits", async () => {
    const launchedRowsFile = path.join(scratch, "npm-tree.jsonl");
    fs.writeFileSync(path.join(scratch, "repo", "package.json"), JSON.stringify({ scripts: { "web:dev": `node "${fixture.replaceAll("\\", "/")}" "${launchedRowsFile.replaceAll("\\", "/")}" root` } }));
    let launchedRows = [];
    const child = idle();
    writeRecord({ url: "http://localhost:1", pid: child.pid, mode: "same-origin", startedAt: Date.now() });
    const up = spawn(process.execPath, [copy, "up"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true, detached: process.platform !== "win32" });
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
      assert.equal(launchedRows.length, 3, `the actual npm launcher must reach all fixture descendants\ncoordinator exit=${up.exitCode ?? "unobserved"}; signal=${up.signalCode ?? "none"}\n${out}`);
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
  await freshCheck("launcher diagnostics report a real child's observed exit", async () => {
    const child = spawn(process.execPath, ["-e", "process.exit(23)"], { stdio: "ignore", windowsHide: true, detached: process.platform !== "win32" });
    const messages = [];
    const closed = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
    const timeout = setTimeout(() => stop(child), 10_000);
    observeLauncherExit(child, (message) => messages.push(message));
    try {
      assert.deepEqual(await closed, { code: 23, signal: null }, "controlled child must complete normally");
      assert.deepEqual(messages, [`dev server launcher pid ${child.pid} exited: code=23; signal=none`]);
    } finally {
      clearTimeout(timeout);
      if (pidAlive(child.pid)) stop(child);
      assert.ok(await untilGone(child.pid), "diagnostic child did not exit");
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

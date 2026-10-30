import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { startCoordinator } from "./start-coordinator.mjs";

const scripts = path.dirname(fileURLToPath(import.meta.url));
const handoff = path.join(scripts, "agent-handoff.mjs");
const wrapper = path.join(scripts, "detached-launch.mjs");

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "start-coordinator-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const worktree = path.join(dir, "worktree");
  const job = path.join(dir, "job");
  fs.mkdirSync(worktree);
  fs.mkdirSync(job);
  const plan = path.join(job, "handoff.json");
  fs.writeFileSync(plan, JSON.stringify({ worktree }));
  return { worktree, job, plan };
}

function fakeSpawn(pid) {
  const calls = [];
  const spawn = (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    child.pid = pid;
    child.unref = () => { child.unrefed = true; };
    calls.at(-1).child = child;
    queueMicrotask(() => child.emit("spawn"));
    return child;
  };
  return { calls, spawn };
}

test("on Windows the handoff starts inside the hidden detached wrapper and the wrapper pid is returned", async (t) => {
  const { worktree, job, plan } = fixture(t);
  const { calls, spawn } = fakeSpawn(4242);
  const result = await startCoordinator(plan, job, { spawn, platform: "win32" });
  assert.equal(calls.length, 1);
  const [{ command, args, options, child }] = calls;
  assert.equal(command, process.execPath);
  assert.equal(args[0], wrapper);
  assert.deepEqual(JSON.parse(args[1]), { command: process.execPath, args: [handoff, plan], shell: false, linger: false });
  assert.equal(options.windowsHide, true);
  assert.equal(options.detached, true);
  assert.equal(options.cwd, worktree);
  assert.equal(options.stdio[0], "ignore");
  assert.equal(typeof options.stdio[1], "number");
  assert.equal(typeof options.stdio[2], "number");
  assert.equal(child.unrefed, true);
  assert.equal(result.pid, 4242);
  assert.equal(result.stdout, path.join(job, "handoff.coordinator.out.log"));
  assert.equal(result.stderr, path.join(job, "handoff.coordinator.err.log"));
  assert.ok(fs.existsSync(result.stdout) && fs.existsSync(result.stderr));
});

test("elsewhere the handoff itself starts detached and hidden", async (t) => {
  const { worktree, job, plan } = fixture(t);
  const { calls, spawn } = fakeSpawn(77);
  const result = await startCoordinator(plan, job, { spawn, platform: "linux" });
  const [{ command, args, options }] = calls;
  assert.equal(command, process.execPath);
  assert.deepEqual(args, [handoff, plan]);
  assert.equal(options.windowsHide, true);
  assert.equal(options.detached, true);
  assert.equal(options.cwd, worktree);
  assert.equal(result.pid, 77);
});

test("a plan already started from this job directory is refused before anything spawns", async (t) => {
  const { job, plan } = fixture(t);
  const { calls, spawn } = fakeSpawn(1);
  await startCoordinator(plan, job, { spawn, platform: "win32" });
  await assert.rejects(startCoordinator(plan, job, { spawn, platform: "win32" }), /EEXIST/);
  assert.equal(calls.length, 1);
});

test("a log left by an earlier launch refuses the start and keeps its contents", async (t) => {
  for (const kept of ["handoff.coordinator.out.log", "handoff.coordinator.err.log"]) {
    const { job, plan } = fixture(t);
    fs.writeFileSync(path.join(job, kept), "earlier diagnostics\n");
    const { calls, spawn } = fakeSpawn(1);
    await assert.rejects(startCoordinator(plan, job, { spawn, platform: "win32" }), /EEXIST/);
    assert.equal(calls.length, 0);
    assert.deepEqual(fs.readdirSync(job).sort(), [kept, "handoff.json"].sort());
    assert.equal(fs.readFileSync(path.join(job, kept), "utf8"), "earlier diagnostics\n");
    await assert.rejects(startCoordinator(plan, job, { spawn, platform: "win32" }), /EEXIST/);
  }
});

test("relative paths, a missing job directory and a plan without a worktree are refused", async (t) => {
  const { job, plan } = fixture(t);
  const { calls, spawn } = fakeSpawn(1);
  const io = { spawn, platform: "win32" };
  await assert.rejects(startCoordinator("handoff.json", job, io), /absolute/);
  await assert.rejects(startCoordinator(plan, "job", io), /absolute/);
  await assert.rejects(startCoordinator(plan, path.join(job, "missing"), io), /ENOENT|not a directory/);
  fs.writeFileSync(plan, JSON.stringify({}));
  await assert.rejects(startCoordinator(plan, job, io), /worktree/);
  assert.equal(calls.length, 0);
});

test("a spawn that never started is reported and the plan can be started again", async (t) => {
  const { job, plan } = fixture(t);
  const spawn = () => {
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("error", new Error("spawn node ENOENT")));
    return child;
  };
  await assert.rejects(startCoordinator(plan, job, { spawn, platform: "win32" }), /ENOENT/);
  assert.deepEqual(fs.readdirSync(job), ["handoff.json"]);
  const { calls, spawn: working } = fakeSpawn(9);
  assert.equal((await startCoordinator(plan, job, { spawn: working, platform: "win32" })).pid, 9);
  assert.equal(calls.length, 1);
});

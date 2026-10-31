import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { acquire, acquireWaiting, processIdentity, read, withProbeCleanupGuard } from "./test-suite-process.mjs";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "impower-bounded-contention-"));
console.log(`Bounded contention scratch: ${scratch}`);
const owner = processIdentity(process.pid);
const options = root => ({ root, identify: pid => pid === owner.pid ? owner : null, memory: () => 8192, census: () => [], guardWaitMs: 60 });
const fault = code => Object.assign(new Error(`injected transient ${code}`), { code });
const cases = [];
const check = async (name, action) => {
  try { await action(); console.log(`PASS: ${name}`); }
  catch (error) { cases.push({ name, error }); console.error(`FAIL: ${name}`, error); }
};

await check("a second process holds a live guard until the bounded waiter observes it", async () => {
  const root = path.join(scratch, "live-guard");fs.mkdirSync(root);
  const guard = path.join(root, "guard.json"), stop = path.join(root, "release");
  const source = `import fs from 'node:fs';import {processIdentity} from ${JSON.stringify(new URL("./test-suite-process.mjs", import.meta.url).href)};
const owner=processIdentity(process.pid);fs.writeFileSync(process.argv[2],JSON.stringify({owner}),{flag:'wx'});process.send(owner);
const deadline=Date.now()+20000;while(!fs.existsSync(process.argv[3])&&Date.now()<deadline)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);
fs.unlinkSync(process.argv[2]);process.disconnect();`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", source, process.argv[1], guard, stop], { windowsHide: true, stdio: ["ignore", "ignore", "pipe", "ipc"] });
  let stderr = "";child.stderr.on("data", value => { stderr += value; });
  const closed = new Promise((resolve, reject) => { child.once("error", reject);child.once("close", (code, signal) => resolve({ code, signal })); });
  try {
    const peer = await new Promise((resolve, reject) => { child.once("message", resolve);child.once("exit", () => reject(new Error(stderr || "holder exited before publication"))); });
    let waits = 0;
    const reservation = await acquireWaiting("real guard waiter", { ...options(root), waitMs: 10000, pollMs: 5,
      identify: pid => pid === peer.pid ? peer : pid === owner.pid ? owner : null,
      onWait: row => { assert.equal(row.waiting, "guard");assert.deepEqual(read(guard).owner, peer);waits++;fs.writeFileSync(stop, "release"); } });
    assert.ok(waits > 0);reservation.release();
  } finally { fs.writeFileSync(stop, "release");assert.deepEqual(await closed, { code: 0, signal: null }, stderr); }
});

for (const code of ["EEXIST", "EPERM", "EACCES", "EBUSY", "ENOENT"]) {
  for (const operation of ["waiting-read", "waiting-write", "reservation-read", "reservation-write", "claim-cleanup"]) {
    await check(`${operation} ${code} retries before admission`, async () => {
      const root = path.join(scratch, `${operation}-${code}`);fs.mkdirSync(root);
      const config = options(root);
      let holder;
      if (operation.startsWith("waiting")) holder = acquire("holder", { ...config, slots: 1 });
      if (operation === "reservation-read") fs.writeFileSync(path.join(root, "reservation.json"), JSON.stringify({ token: "dead", owner: { pid: 800001, start: "gone" }, phase: "reserved" }));
      if (operation === "claim-cleanup") fs.writeFileSync(path.join(root, "guard.json"), JSON.stringify({ owner: { pid: 800001, start: "gone" } }));
      const method = operation.endsWith("read") ? "readFileSync" : operation === "claim-cleanup" ? "unlinkSync" : "writeFileSync";
      const original = fs[method], open = fs.openSync;
      const files = new Map();let injected = 0, waits = 0;
      fs.openSync = (file, ...args) => { const fd = open(file, ...args);files.set(fd, String(file));return fd; };
      fs[method] = (target, ...args) => {
        const file = typeof target === "number" ? files.get(target) : String(target);
        const affected = operation.startsWith("waiting") ? path.basename(file ?? "").startsWith("waiting-")
          : operation === "claim-cleanup" ? file === path.join(root, "guard-recovery.json")
          : operation === "reservation-write" ? file?.startsWith(path.join(root, "reservation.json.")) : file === path.join(root, "reservation.json");
        if (affected && injected++ === 0) throw fault(code);
        return original(target, ...args);
      };
      let result;
      try {
        result = await acquireWaiting("contention successor", { ...config, slots: 1, waitMs: 2000, pollMs: 5,
          onWait: () => { waits++;if (holder) { holder.release();holder = null; } } });
      } finally { fs[method] = original;fs.openSync = open;if (holder) holder.release(); }
      assert.ok(injected > 0);assert.ok(waits > 0 || operation === "claim-cleanup", "the failure must be retried, not swallowed");
      assert.equal(read(result.file).token, result.record.token);result.release();
      assert.equal(fs.existsSync(path.join(root, "guard.json")), false);
      assert.equal(fs.existsSync(path.join(root, "guard-recovery.json")), false);
    });
  }
}

await check("probe cleanup retries transient guard publication without replaying its callback", () => {
  const root = path.join(scratch, "probe");fs.mkdirSync(root);
  const link = fs.linkSync;let failures = 0, calls = 0;
  fs.linkSync = (from, to) => { if (to === path.join(root, "guard.json") && failures++ < 2) throw fault("EBUSY");return link(from, to); };
  try { withProbeCleanupGuard(() => { calls++;return {}; }, { root }); }
  finally { fs.linkSync = link; }
  assert.equal(calls, 1);assert.ok(failures >= 3);
});

for (const operation of ["readFileSync", "unlinkSync"]) {
  await check(`release retries ${operation} while retaining its terminal result`, () => {
    const root = path.join(scratch, `release-${operation}`), reservation = acquire("terminal", options(root));
    const original = fs[operation];let injected = 0;
    fs[operation] = (target, ...args) => { if (target === reservation.file && injected++ < 2) throw fault("EPERM");return original(target, ...args); };
    try { reservation.release(); } finally { fs[operation] = original; }
    assert.ok(injected >= 3);assert.equal(fs.existsSync(reservation.file), false);
  });
}

await check("published admission never retries when guard cleanup remains blocked", async () => {
  const root = path.join(scratch, "published"), guard = path.join(root, "guard.json");
  const unlink = fs.unlinkSync, rename = fs.renameSync;let publications = 0;
  fs.renameSync = (from, to) => { if (to === path.join(root, "reservation.json")) publications++;return rename(from, to); };
  fs.unlinkSync = file => { if (file === guard) throw fault("EBUSY");return unlink(file); };
  try { await assert.rejects(acquireWaiting("published once", { ...options(root), waitMs: 1000,
    onWait: () => assert.fail("published admission replayed") }), /injected transient EBUSY/); }
  finally { fs.unlinkSync = unlink;fs.renameSync = rename; }
  assert.equal(publications, 1);assert.equal(read(path.join(root, "reservation.json")).run, "published once");
});

await check("a guard replaced during recovery is never archived or removed", async () => {
  const root = path.join(scratch, "recovery-replacement");fs.mkdirSync(root);
  const guard = path.join(root, "guard.json"), saved = path.join(root, "saved-guard");
  fs.writeFileSync(guard, JSON.stringify({ owner: { pid: 800001, start: "dead" } }));
  const peer = { pid: 800002, start: "live" };let replaced = false;
  await assert.rejects(acquireWaiting("cannot steal successor", { ...options(root), waitMs: 100, pollMs: 5,
    identify: pid => {
      if (pid === 800001 && !replaced) { replaced = true;fs.renameSync(guard, saved);fs.writeFileSync(guard, JSON.stringify({ owner: peer })); }
      return pid === peer.pid ? peer : pid === owner.pid ? owner : null;
    } }), /Reservation transaction unavailable/);
  assert.equal(replaced, true);assert.deepEqual(read(guard), { owner: peer });
  assert.equal(fs.existsSync(path.join(root, "reservation.json")), false);
  assert.equal(fs.readdirSync(root).some(name => name.startsWith("recovered-guard-")), false);
});

await check("cleanup and release preserve replacement guard and reservation owners", async () => {
  const root = path.join(scratch, "cleanup-replacement");fs.mkdirSync(root);
  const guard = path.join(root, "guard.json"), peer = { owner: { pid: 800002, start: "live" } };
  await assert.rejects(acquireWaiting("cleanup must refuse", { ...options(root), waitMs: 500,
    census: () => { fs.renameSync(guard, path.join(root, "old-guard"));fs.writeFileSync(guard, JSON.stringify(peer));return []; },
    onWait: () => assert.fail("replacement guard caused a transaction replay") }), /ownership changed/);
  assert.deepEqual(read(guard), peer);assert.equal(read(path.join(root, "reservation.json")).run, "cleanup must refuse");
  const other = path.join(scratch, "slot-replacement"), reservation = acquire("old slot", options(other));
  fs.writeFileSync(reservation.file, JSON.stringify({ token: "new owner", owner: peer.owner }));
  assert.throws(() => reservation.release(), /ownership changed/);
  assert.equal(read(reservation.file).token, "new owner");
});

await check("a denied private write probe refuses without retrying admission", async () => {
  const root = path.join(scratch, "denied"), open = fs.openSync;let waits = 0;
  fs.openSync = (file, ...args) => { if (String(file).startsWith(root + path.sep)) throw fault("EACCES");return open(file, ...args); };
  try { await assert.rejects(acquireWaiting("denied", { ...options(root), waitMs: 1000, onWait: () => waits++ }), /store not writable/); }
  finally { fs.openSync = open; }
  assert.equal(waits, 0);assert.equal(fs.existsSync(path.join(root, "reservation.json")), false);
});

await check("persistent file contention consumes the wait and leaves no admission", async () => {
  const root = path.join(scratch, "persistent"), rename = fs.renameSync;let waits = 0;
  fs.renameSync = (from, to) => { if (to === path.join(root, "reservation.json")) throw fault("EPERM");return rename(from, to); };
  const began = Date.now();
  try { await assert.rejects(acquireWaiting("persistent", { ...options(root), waitMs: 120, pollMs: 5, onWait: () => waits++ }), /Reservation files busy.*waited.*Test Suite workflow/); }
  finally { fs.renameSync = rename; }
  assert.ok(Date.now() - began >= 120);assert.ok(waits > 0);
  assert.equal(fs.existsSync(path.join(root, "reservation.json")), false);
  assert.equal(fs.readdirSync(root).some(file => file.endsWith(".tmp") || file === "guard.json"), false);
});

await check("a transient queue read cannot let a newcomer overtake an eligible waiter", async () => {
  const root = path.join(scratch, "queue-read");fs.mkdirSync(root);
  const row = path.join(root, "waiting-old.json");
  fs.writeFileSync(row, JSON.stringify({ token: "old", owner, pool: "writer", run: "older", arrivedAt: "2020-01-01T00:00:00Z" }));
  const original = fs.readFileSync;let failures = 0, waits = 0;
  fs.readFileSync = (target, ...args) => { if (target === row && failures++ === 0) throw fault("EPERM");return original(target, ...args); };
  let reservation;
  try { reservation = await acquireWaiting("newcomer", { ...options(root), waitMs: 1000, pollMs: 5,
    onWait: event => {
      waits++;assert.equal(fs.existsSync(path.join(root, "reservation.json")), false);
      if (event.waiting === "queue") fs.unlinkSync(row);
    } }); }
  finally { fs.readFileSync = original; }
  assert.ok(waits >= 2);reservation.release();
});

await check("an update retries only its own file operation and preserves a same-token replacement", () => {
  const root = path.join(scratch, "update"), reservation = acquire("update owner", options(root));
  const write = fs.writeFileSync, open = fs.openSync;let fd, failures = 0;
  fs.openSync = (file, ...args) => { const value = open(file, ...args);if (String(file).startsWith(reservation.file + ".")) fd = value;return value; };
  fs.writeFileSync = (target, ...args) => { if (target === fd && failures++ === 0) throw fault("EBUSY");return write(target, ...args); };
  try { reservation.update({ phase: "exited", exit: 0 }); }
  finally { fs.writeFileSync = write;fs.openSync = open; }
  assert.ok(failures >= 2);assert.equal(read(reservation.file).exit, 0);
  const replacement = path.join(root, "replacement");fs.writeFileSync(replacement, JSON.stringify({ ...reservation.record, run: "replacement" }));
  fs.renameSync(replacement, reservation.file);
  assert.throws(() => reservation.update({ exit: 1 }), /ownership changed/);
  assert.throws(() => reservation.release(), /ownership changed/);
  assert.equal(read(reservation.file).run, "replacement");assert.equal(read(reservation.file).exit, 0);
});

await check("ownership loss takes priority over an unconfirmed local phase", () => {
  const root = path.join(scratch, "release-priority"), reservation = acquire("old owner", options(root));
  reservation.update({ phase: "running" });
  fs.writeFileSync(reservation.file, JSON.stringify({ token: "replacement" }));
  assert.throws(() => reservation.release(), /Reservation ownership changed/);
  assert.equal(read(reservation.file).token, "replacement");
});

for (const boundary of ["claim", "atomic"]) {
  await check(`${boundary} cleanup cannot extend a bounded admission or admit after expiry`, async () => {
    const root = path.join(scratch, `deadline-${boundary}`);fs.mkdirSync(root);
    if (boundary === "claim") fs.writeFileSync(path.join(root, "guard.json"), JSON.stringify({ owner: { pid: 800001, start: "gone" } }));
    const unlink = fs.unlinkSync, write = fs.writeFileSync, open = fs.openSync;let began, fd, publications = 0;
    fs.openSync = (file, ...args) => { const value = open(file, ...args);if (String(file).startsWith(path.join(root, "reservation.json."))) fd = value;return value; };
    fs.writeFileSync = (target, ...args) => { if (boundary === "atomic" && target === fd && publications++ === 0) throw fault("EBUSY");return write(target, ...args); };
    fs.unlinkSync = file => {
      const affected = boundary === "claim" ? file === path.join(root, "guard-recovery.json") : String(file).startsWith(path.join(root, "reservation.json."));
      if (affected) { began ??= Date.now();if (Date.now() - began < 350) throw fault("EBUSY"); }
      return unlink(file);
    };
    try { await assert.rejects(acquireWaiting("deadline", { ...options(root), waitMs: 100, pollMs: 5 }), /EBUSY|expired|waited/); }
    finally { fs.unlinkSync = unlink;fs.writeFileSync = write;fs.openSync = open; }
    assert.ok(began);assert.ok(Date.now() - began < 300, "nested cleanup must share the original bound");
    assert.equal(fs.existsSync(path.join(root, "reservation.json")), false);
  });
}

await check("a failed slot publication does not consume a pool turn", async () => {
  const root = path.join(scratch, "alternation");fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, "last-admitted.json"), JSON.stringify({ pool: "reviewer", token: "prior", at: "2020-01-01T00:00:00Z" }));
  fs.writeFileSync(path.join(root, "waiting-reviewer.json"), JSON.stringify({ token: "reviewer", owner, pool: "reviewer", run: "reviewer B", arrivedAt: "2020-01-01T00:00:00Z" }));
  const rename = fs.renameSync;let failures = 0, waits = 0;
  fs.renameSync = (from, to) => { if (to === path.join(root, "reservation.json") && failures++ === 0) throw fault("EPERM");return rename(from, to); };
  let reservation;
  try { reservation = await acquireWaiting("writer A", { ...options(root), waitMs: 1000, pollMs: 5,
    onWait: event => { waits++;assert.notEqual(event.waiting, "queue", "an unsuccessful admission cannot hand the turn back to reviewers"); } }); }
  finally { fs.renameSync = rename; }
  assert.ok(waits > 0);assert.equal(reservation.record.pool, "writer");reservation.release();
  assert.equal(read(path.join(root, "last-admitted.json")).pool, "writer");
});

await check("a transient published-file identity read retries without replaying publication", async () => {
  const root = path.join(scratch, "published-identity"), file = path.join(root, "reservation.json");
  const lstat = fs.lstatSync, rename = fs.renameSync;let publications = 0, failures = 0;
  fs.renameSync = (from, to) => { const result = rename(from, to);if (to === file) publications++;return result; };
  fs.lstatSync = (target, ...args) => { if (target === file && publications > 0 && failures++ === 0) throw fault("EBUSY");return lstat(target, ...args); };
  let reservation;
  try { reservation = await acquireWaiting("one publication", { ...options(root), waitMs: 1000 }); }
  finally { fs.lstatSync = lstat;fs.renameSync = rename; }
  assert.equal(publications, 1);assert.ok(failures >= 2);reservation.release();
});

assert.equal(cases.length, 0, cases.map(value => value.name).join("; "));

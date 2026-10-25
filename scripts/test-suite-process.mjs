import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { processIdentity } from "./reviewer-slots.mjs";
import { readTreeProof, assertAttemptBinding } from "./test-suite-child.mjs";

export { processIdentity };
export const machineRoot = process.platform === "win32"
  ? path.join(process.env.ProgramData || "C:\\ProgramData", "Impower", "test-suite")
  : "/var/tmp/impower-test-suite";
export const same = (a, b) => a && b && a.pid === b.pid && a.start === b.start;
export function atomic(file, value, { admissionRoot } = {}) {
  const temp = `${file}.${randomUUID()}.tmp`;
  let fd;
  try { fd = fs.openSync(temp, "wx"); }
  catch (error) { throw admissionRoot ? admissionFailure(admissionRoot, error) : error; }
  let identity, published = false;
  try {
    try {
      if (admissionRoot) identity = fs.fstatSync(fd, { bigint: true });
      fs.writeFileSync(fd, JSON.stringify(value, null, 2) + "\n", "utf8");
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    // Windows can briefly deny replacement while a status reader or scanner
    // has the destination open. Never unlink valid published evidence.
    const deadline = Date.now() + 1000;
    for (;;) {
      try { fs.renameSync(temp, file); published = true; break; }
      catch (error) {
        // Admission retries belong to acquireWaiting's single deadline. Other
        // atomic writers retain their bounded reader/scanner retry.
        if (admissionRoot) throw admissionFailure(admissionRoot, error);
        if (process.platform !== "win32" || !["EPERM", "EACCES", "EBUSY"].includes(error.code) || Date.now() >= deadline) throw error;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
      }
    }
  } finally {
    if (admissionRoot && !published) {
      if (!identity) throw new Error(`Private reservation file identity unavailable at ${temp}; preserve it for inspection`);
      unlinkOwned(temp, identity);
    }
  }
}
export const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function unlinkOwned(file, identity) {
  const current = fs.lstatSync(file, { bigint: true });
  // Windows path stats can report dev=0 while handle stats name the volume.
  // The private path stays in one store; require its exact file ID and birth.
  if (!sameFile(current, identity)) throw new Error(`Private reservation file ownership changed at ${file}; preserve it for inspection`);
  fs.unlinkSync(file);
}

const sameFile = (current, identity) => current.isFile() && identity?.isFile() && current.ino !== 0n
  && current.ino === identity.ino && current.birthtimeNs === identity.birthtimeNs
  && (process.platform === "win32" || current.dev === identity.dev);

function removeGuard(file, identity) {
  if (!identity) throw new Error(`Reservation guard identity unavailable at ${file}; preserve it for inspection`);
  try { unlinkOwned(file, identity); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}

const storeDenied = (root, error) => new Error(`Reservation store not writable at ${root} (${error.code}); this process cannot take the machine-wide Vitest reservation, so it cannot run Vitest here`);
function admissionFailure(root, error) {
  if (process.platform !== "win32" || !["EPERM", "EACCES", "EBUSY"].includes(error.code)) return error;
  const probe = path.join(root, `write-probe-${randomUUID()}.tmp`);
  let fd, identity;
  try {
    fd = fs.openSync(probe, "wx");
    identity = fs.fstatSync(fd, { bigint: true });
    fs.writeFileSync(fd, "reservation store write probe");
    fs.fsyncSync(fd);
  } catch (failure) {
    return storeDenied(root, failure);
  } finally {
    if (fd !== undefined) {
      fs.closeSync(fd);
      // An uncertain or failed cleanup is a refusal, never writable proof.
      if (!identity) throw new Error(`Private reservation probe identity unavailable at ${probe}`);
      unlinkOwned(probe, identity);
    }
  }
  return Object.assign(new Error(`Reservation files busy at ${root} (${error.code}); writable store confirmed, but acquisition did not complete`), { reservationFilesBusy: true });
}

// `within` narrows the census to command lines naming that path, so a fixture
// can watch its own children without reading other sessions' processes.
const names = (command, within) => !within || command.toLowerCase().includes(within.toLowerCase());
export function windowsVitestProcesses(raw, ownPid = process.pid, { within } = {}) {
  const parsed = JSON.parse(raw.trim() || "[]");
  const rows = Array.isArray(parsed) ? parsed : parsed === null ? [] : [parsed];
  if (rows.some(p => !p || !Number.isSafeInteger(p.ProcessId) || p.ProcessId < 1 || (p.CommandLine !== null && typeof p.CommandLine !== "string"))) throw new Error("Malformed Windows process census");
  return rows.filter(p => p.ProcessId !== ownPid && (!p.CommandLine ? !within : /vitest|tinypool/i.test(p.CommandLine) && names(p.CommandLine, within))).map(p => p.ProcessId);
}

// An unreadable process table is a refusal, never an empty inventory.
export function vitestProcesses({ within } = {}) {
  if (process.platform === "win32") {
    const script = "$ErrorActionPreference='Stop'; @(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object ProcessId,CommandLine) | ConvertTo-Json -Compress";
    const raw = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", windowsHide: true });
    return windowsVitestProcesses(raw, process.pid, { within });
  }
  if (process.platform !== "linux") throw new Error("Test suites require Windows or Linux");
  const pids = [];
  for (const name of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(name) || Number(name) === process.pid) continue;
    try {
      const argv = fs.readFileSync(`/proc/${name}/cmdline`, "utf8").split("\0");
      const command = argv.join(" ");
      const executable = path.basename(argv[0] || "");
      if (/^(?:node(?:js)?(?:\s|$)|vitest)/i.test(executable) && /vitest|tinypool/i.test(command) && names(command, within) && processIdentity(Number(name))) pids.push(Number(name));
    } catch (error) { if (!["ENOENT", "ESRCH"].includes(error.code)) throw error; }
  }
  return pids;
}

// A supervised reservation taken before the current boot is interrupted once
// its recorded identities are absent: no process from before a restart can
// still run, so the tree proof its supervisor never wrote is not needed. The
// restart is detected by the system uptime falling below the uptime recorded
// at acquisition, which no wall-clock correction can produce. A record without
// that uptime, or a boot that has since run longer than it, stays unknown.
export function reservationState(record, identify = processIdentity, { uptime = os.uptime } = {}) {
  if (!record?.owner?.pid || !record.owner.start) return "unknown";
  const owner = identify(record.owner.pid);
  if (same(record.owner, owner)) return "running";
  if (record.version === 2) {
    if (owner !== null && (!owner?.pid || !owner.start)) return "unknown";
    const preBoot = () => Number.isFinite(record.heldUptime) && uptime() < record.heldUptime;
    if (!record.supervision) return record.phase === "reserved" || preBoot() ? "interrupted" : "unknown";
    const expected = record.supervision;
    if (expected.reservationToken !== record.token) return "unknown";
    try {
      assertAttemptBinding(expected,{id:record.attempt,
        ...(typeof record.run==="string"&&path.isAbsolute(record.run)?{directory:path.join(record.run,record.attempt)}:{})});
      for (const original of [expected.launcher, expected.helper]) {
        if (!original?.pid || !original.start) return "unknown";
        const current = identify(original.pid);
        if (current !== null && (!current?.pid || !current.start)) return "unknown";
        if (same(original, current)) return "running";
      }
      if (preBoot()) return "interrupted";
      // This terminal refusal was observed while the strict nonce handshake
      // could not authorize a root. A partial may-launch publication can never
      // use this shortcut, even when the coordinator did not send its nonce.
      if (expected.authorizationPhase === "no-launch" && expected.launchAuthorized === false
        && expected.status === "not-run" && !expected.root && expected.exitConfirmed === true
        && expected.helperExitEvidence?.observation === "original-identity-absent"
        && same(expected.helperExitEvidence.identity, expected.helper)
        && Number.isInteger(expected.launcherClose?.exit) && !expected.launcherClose.signal) return "interrupted";
      readTreeProof(expected, { identify, close: expected.launcherClose });
      return "interrupted";
    } catch { return "unknown"; }
  }
  if (["reserved", "exited"].includes(record.phase)) return "interrupted";
  if (record.phase !== "running" || !record.child?.start) return "unknown";
  return same(record.child, identify(record.child.pid)) ? "running" : "interrupted";
}

// Serialize acquisition, recovery and release, including the reservation's
// creation window. A transaction holds the guard only for a few synchronous
// file operations, so a held guard is retried until `waitMs` passes. A guard
// whose recorded owner is no longer running, or that stayed empty past
// `emptyAbandonMs`, was abandoned inside its transaction and is renamed aside;
// any other guard, including one whose owner identity cannot be read, is never
// guessed away.
function guarded(root, action, waitMs = guardWaitMs, identify = processIdentity, admitting = false, recover = true) {
  const denied = (error) => ["EPERM", "EACCES"].includes(error.code)
    ? storeDenied(root, error)
    : null;
  try { fs.mkdirSync(root, { recursive: true }); }
  catch (error) { throw denied(error) || error; }
  const guard = path.join(root, "guard.json");
  const deadline = Date.now() + waitMs;
  let fd, identity, cause;
  for (;;) {
    try { fd = fs.openSync(guard, "wx"); break; }
    catch (error) {
      if (admitting && process.platform === "win32" && ["EPERM", "EACCES", "EBUSY"].includes(error.code)) throw admissionFailure(root, error);
      if (error.code === "EEXIST" && recover && recoverAbandonedGuard(root, guard, identify, admitting)) continue;
      if (error.code === "EEXIST" && Date.now() < deadline) { Atomics.wait(sleeper, 0, 0, 10); continue; }
      const refusal = denied(error);
      if (refusal) throw refusal;
      throw Object.assign(new Error(`Reservation transaction unavailable at ${guard}: ${error.message}`), { guardHeld: error.code === "EEXIST" });
    }
  }
  try {
    identity = fs.fstatSync(fd, { bigint: true });
    fs.writeFileSync(fd, JSON.stringify({ owner: processIdentity(process.pid) }));
    fs.fsyncSync(fd);
    return action(path.join(root, "reservation.json"));
  } catch (error) { cause = error; throw error; }
  finally {
    fs.closeSync(fd);
    try { removeGuard(guard, identity); }
    catch (error) {
      if (!cause) throw error;
      cause.guardCleanupError = error.message;
      console.error(`Reservation guard cleanup failed after ${cause.message}: ${error.message}`);
    }
  }
}

// A guard or claim is created empty by an exclusive open and gets its owner
// written by the next synchronous call, so a live creator leaves it empty for
// microseconds. An empty file this much older than its last write was left by
// a creator killed between the two calls.
export const emptyAbandonMs = 60_000;
const claimDepth = 4;

// Judge one guard or claim file: abandoned when its recorded owner (pid and
// start time, the identity `reservationState` compares) names no live process,
// or when it is empty and older than `emptyAbandonMs`. Returns null when the
// file is gone, otherwise its identity and verdict. Unparseable content and
// an unreadable process table are never evidence that the owner is gone.
function judge(root, file, identify, admitting) {
  let fd, identity, text;
  try {
    fd = fs.openSync(file, "r");
    identity = fs.fstatSync(fd, { bigint: true });
    text = fs.readFileSync(fd, "utf8");
  } catch (error) {
    if (admitting && process.platform === "win32" && ["EPERM", "EACCES", "EBUSY"].includes(error.code)) throw admissionFailure(root, error);
    return error.code === "ENOENT" ? null : { identity, abandoned: false };
  } finally { if (fd !== undefined) fs.closeSync(fd); }
  if (text === "") return { identity, abandoned: Date.now() - Number(identity.mtimeMs) > emptyAbandonMs };
  let owner;
  try { owner = JSON.parse(text)?.owner; } catch { return { identity, abandoned: false }; }
  if (!owner?.pid || !owner.start) return { identity, abandoned: false };
  try { return { identity, abandoned: !same(owner, identify(owner.pid)) }; }
  catch { return { identity, abandoned: false }; }
}

// Rename `file` aside as `<prefix>-<time>.json` if it is still the generation
// `identity`. Callers hold the exclusive claim that alone may move it, and its
// owner is dead or never wrote itself, so nothing else replaces it in between.
function setAside(root, file, identity, prefix, admitting) {
  try {
    if (!sameFile(fs.lstatSync(file, { bigint: true }), identity)) return false;
    const stamp = new Date().toISOString().replace(/[^0-9]/g, "");
    fs.renameSync(file, path.join(root, `${prefix}-${stamp}-${randomUUID().slice(0, 8)}.json`));
    return true;
  } catch (error) {
    if (admitting && process.platform === "win32" && ["EPERM", "EACCES", "EBUSY"].includes(error.code)) throw admissionFailure(root, error);
    return error.code === "ENOENT";
  }
}

// Take the exclusive claim `file` and run `action` under it, returning its
// result, or false when the claim is held. A claim abandoned by a recoverer
// that died inside it is set aside under a takeover claim named after that
// claim's own file identity. Only one process can hold the takeover for a
// given generation, and a dead or never-written owner cannot remove it, so the
// generation the takeover holder verified is the one it renames. Takeover
// claims nest the same way, to a fixed depth, if their holders die too; a
// takeover left after its claim was set aside names a generation that no
// longer exists and is never consulted again.
function withClaim(root, file, identify, admitting, action, depth = 0) {
  let fd;
  for (let attempt = 0; fd === undefined; attempt++) {
    try { fd = fs.openSync(file, "wx"); }
    catch (error) {
      if (admitting && process.platform === "win32" && ["EPERM", "EACCES", "EBUSY"].includes(error.code)) throw admissionFailure(root, error);
      if (error.code !== "EEXIST" || attempt > 0 || depth >= claimDepth) return false;
      const held = judge(root, file, identify, admitting);
      if (held && !held.abandoned) return false;
      if (held) {
        const takeover = path.join(root, `${path.basename(file, ".json")}-${held.identity.ino}-${held.identity.birthtimeNs}.json`);
        if (!withClaim(root, takeover, identify, admitting, () => setAside(root, file, held.identity, "recovered-claim", admitting), depth + 1)) return false;
      }
    }
  }
  try {
    // Recorded so an abandoned claim can be judged by its owner's liveness.
    try {
      fs.writeFileSync(fd, JSON.stringify({ owner: processIdentity(process.pid) }));
      fs.fsyncSync(fd);
    } catch (error) {
      if (admitting && process.platform === "win32" && ["EPERM", "EACCES", "EBUSY"].includes(error.code)) throw admissionFailure(root, error);
      return false;
    }
    return action();
  } finally { fs.closeSync(fd); fs.unlinkSync(file); }
}

// Rename an abandoned guard (see `judge`) aside as `recovered-guard-<time>.json`.
// Returns whether the guard is gone and the caller should try to take it again.
//
// The read, the judgment and the rename run under the exclusive
// `guard-recovery.json` claim, so two recoverers cannot both judge the same
// abandoned guard. Normal transactions may still finish and replace the guard
// during the process lookup: `setAside` verifies the same file generation
// AFTER the judgment. An abandoned guard's owner can no longer remove it, and
// the claim excludes other recoverers, so nothing changes it before rename.
function recoverAbandonedGuard(root, guard, identify, admitting = false) {
  return withClaim(root, path.join(root, "guard-recovery.json"), identify, admitting, () => {
    const held = judge(root, guard, identify, admitting);
    if (!held) return true;
    return held.abandoned && setAside(root, guard, held.identity, "recovered-guard", admitting);
  });
}

const guardWaitMs = 5000;
const sleeper = new Int32Array(new SharedArrayBuffer(4));
// Probe cleanup owns this same guard while its synchronous callback reads the
// reservation entry (passed as a path that may not exist) and moves the
// reviewer's scratch aside, so no run can be admitted between that read and
// the move. It never recovers a guard or reservation.
export function withProbeCleanupGuard(action, { root = machineRoot } = {}) {
  const began = Date.now();
  const inspect = allowMissing => {
    const directories = new Map();
    for (let current = path.resolve(root); ; current = path.dirname(current)) {
      let stat;
      try { stat = fs.lstatSync(current, { bigint: true }); }
      catch (error) { if (!allowMissing || error.code !== "ENOENT") throw error; }
      if (stat) {
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Ambiguous cleanup reservation store at ${current}; preserve reviewer scratch`);
        directories.set(current, stat);
      }
      if (path.dirname(current) === current) break;
    }
    return directories;
  };
  // A genuinely absent store can be initialized by guarded mkdir. Existing
  // physical ancestors must remain the same through acquisition; redirects,
  // unreadable paths and changed directory generations refuse the walk.
  const before = inspect(true);
  const result = guarded(root, file => {
    const after = inspect(false);
    for (const [directory, original] of before) {
      const current = after.get(directory);
      if (!current || current.ino !== original.ino || current.dev !== original.dev || current.birthtimeNs !== original.birthtimeNs)
        throw new Error(`Cleanup reservation store changed at ${directory}; preserve reviewer scratch`);
    }
    const value = action(file);
    if (value && typeof value.then === "function") {
      Promise.resolve(value).catch(() => {});
      throw new Error("Probe cleanup callback must complete synchronously under its guard");
    }
    return value;
  }, guardWaitMs, processIdentity, false, false);
  return { ...result, elapsedMs: Date.now() - began };
}
const elapsedSince = (value, now) => {
  const time = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, now - time)) : null;
};

// `admitWaitMs` bounds only the acquiring transaction's guard wait, so a caller
// with a deadline can keep it inside that deadline; release keeps the full bound.
export function acquire(run, { root = machineRoot, identify = processIdentity, uptime = os.uptime, census = vitestProcesses, guardWaitMs: waitMs = guardWaitMs, admitWaitMs = waitMs, supervised = false } = {}) {
  return guarded(root, file => {
    if (fs.existsSync(file)) {
      const previous = read(file);
      const state = reservationState(previous, identify, { uptime });
      const observedAt = Date.now();
      if (state !== "interrupted") throw Object.assign(new Error(`Existing suite ${state}; inspect ${file} and ${previous.run}`), {
        holder: { run: previous.run, phase: previous.phase, attempt: previous.attempt,
          file: previous.file ?? null, mode: previous.mode ?? null, unitStartedAt: previous.unitStartedAt ?? null,
          progress: previous.progress ?? null, timeoutMs: previous.timeoutMs ?? null,
          heldSince: previous.heldSince ?? null, heldAgeMs: elapsedSince(previous.heldSince, observedAt),
          unitElapsedMs: elapsedSince(previous.unitStartedAt, observedAt),
          lastProgressAgeMs: elapsedSince(previous.progress?.at, observedAt) },
      });
      const existing = census();
      if (existing.length) throw new Error(`Vitest processes still present: ${existing.join(", ")}`);
      // Preserve process identity and the recovery decision before replacing ownership.
      atomic(path.join(root, `recovered-${previous.token}.json`), { ...previous, recoveredAt: new Date().toISOString() }, { admissionRoot: root });
    }
    const existing = census();
    if (existing.length) throw new Error(`Vitest processes already running: ${existing.join(", ")}`);
    const record = { ...(supervised ? { version: 2 } : {}), token: randomUUID(), owner: identify(process.pid), run,
      heldSince: new Date().toISOString(), heldUptime: uptime(), phase: "reserved" };
    if (!record.owner) throw new Error("Coordinator identity unavailable");
    atomic(file, record, { admissionRoot: root });
    const update = (values) => {
      if (read(file).token !== record.token) throw new Error("Reservation ownership changed");
      Object.assign(record, values);
      atomic(file, record);
    };
    return { record, update, release() {
      guarded(root, target => {
        if (read(target).token !== record.token) throw new Error("Reservation ownership changed");
        if (!["reserved", "exited"].includes(record.phase)) throw new Error("Child exit unconfirmed; preserve reservation");
        fs.unlinkSync(target);
      }, waitMs, identify);
    } };
  }, admitWaitMs, identify, true);
}

// Release on an error path: the error being handled stays the one thrown, and
// a release failure beside it is reported rather than replacing it.
export function releaseKeeping(reservation, cause) {
  try { reservation.release(); }
  catch (error) { console.error(`Reservation not released after ${cause.message}; the next acquirer recovers it: ${error.message}`); }
}

// A sleep never runs past the deadline, so the last attempt happens at it.
const pause = (ms, deadline) => new Promise(resolve => setTimeout(resolve, Math.max(0, Math.min(ms, deadline - Date.now()))));

// Queue behind the machine-wide reservation, then hold it while polling the
// census, so later reservation-aware runs queue behind this one instead of
// racing it for the moment other Vitest processes exit. Ambiguous and unknown
// reservations still refuse at once; a live owner, a present process or a
// held guard waits. With a bound, each guard attempt stops at the deadline;
// without one, a held guard gets one transaction's bound, as in acquire.
export async function acquireWaiting(run, { waitMs = 0, pollMs = 2000, census = vitestProcesses, onWait = () => {}, ...options } = {}) {
  const deadline = Date.now() + waitMs;
  const transactionMs = options.guardWaitMs ?? guardWaitMs;
  let reservation;
  for (;;) {
    const admitWaitMs = waitMs > 0 ? Math.min(transactionMs, Math.max(0, deadline - Date.now())) : transactionMs;
    try { reservation = acquire(run, { ...options, admitWaitMs, census: () => [] }); break; }
    catch (error) {
      const waiting = error.reservationFilesBusy ? "reservation files" : error.guardHeld ? "guard" : /^Existing suite running/.test(error.message) ? "reservation" : null;
      if (!waiting || Date.now() >= deadline) throw error;
      onWait({ waiting, detail: error.message, ...(error.holder ? { holder: error.holder } : {}) });
      await pause(pollMs, deadline);
    }
  }
  try { await waitForCensus({ deadline, pollMs, census, onWait }); }
  catch (error) { releaseKeeping(reservation, error); throw error; }
  return reservation;
}

export async function waitForCensus({ deadline = Date.now(), pollMs = 2000, census = vitestProcesses, onWait = () => {} } = {}) {
  for (;;) {
    const existing = census();
    if (!existing.length) return;
    if (Date.now() >= deadline) throw new Error(`Vitest processes still present: ${existing.join(", ")}`);
    onWait({ waiting: "vitest processes", pids: existing });
    await pause(pollMs, deadline);
  }
}

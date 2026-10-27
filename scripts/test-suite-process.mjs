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
// Admission is gated on measured free memory and capped. The floor is one
// run's worst case, an engine process and a fork each capped at a 1024 MB heap
// (scripts/suite-engine.mjs) plus their native memory, with headroom: the
// machine's memory is taken by the desktop sessions, not the tests, so a fixed
// slot count is unsafe when they fill it and too strict when they do not. The
// floor gates new admissions and new execution units only; an admitted holder
// is never evicted. Three slots bound the worst case when memory is plentiful:
// `reservation.json` is the first, so a checkout on older code, which knows
// only that file, still takes and honours it, then `reservation-2.json` and
// `reservation-3.json`. Each pool holds at most two of them, so one slot is
// always reachable by the other pool.
export const admissionFloorMb = 4096;
export const admissionSlots = 3;
export const poolSlotLimit = 2;
export const pools = Object.freeze(["writer", "reviewer"]);
export const slotFile = (root, index) => path.join(root, index === 1 ? "reservation.json" : `reservation-${index}.json`);
export const slotFiles = (root = machineRoot, slots = admissionSlots) => Array.from({ length: slots }, (_, index) => slotFile(root, index + 1));
const waitingName = /^waiting-[A-Za-z0-9-]+\.json$/;
const waitingFile = (root, token) => path.join(root, `waiting-${token}.json`);
const lastAdmittedFile = root => path.join(root, "last-admitted.json");

// The machine's free memory in MB, read through the same transport as the
// process census: on Windows the free commit (`FreeVirtualMemory`, the figure
// that ran out in the EPIPE and fork failures), on Linux `MemAvailable`. A
// reading that cannot be taken throws; the caller refuses admission.
export function freeMemoryMb() {
  if (process.platform === "win32") {
    const script = "$ErrorActionPreference='Stop'; (Get-CimInstance Win32_OperatingSystem).FreeVirtualMemory";
    const raw = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", windowsHide: true }).trim();
    if (!/^\d+$/.test(raw)) throw new Error(`Free memory reading unavailable: ${raw.slice(0, 80) || "no value"}`);
    return Math.floor(Number(raw) / 1024);
  }
  if (process.platform !== "linux") throw new Error("Test suites require Windows or Linux");
  const match = /^MemAvailable:\s+(\d+)\s+kB$/m.exec(fs.readFileSync("/proc/meminfo", "utf8"));
  if (!match) throw new Error("Free memory reading unavailable: /proc/meminfo has no MemAvailable");
  return Math.floor(Number(match[1]) / 1024);
}

// The pool a run belongs to: the reviewer pool when its environment carries
// IMPOWER_TEST_POOL=reviewer, which the handoff launcher gives its reviewers
// and its delegated execution service, or when the package it tests lies under
// a `*.review-jobs` directory, a reviewer's probe clone; the writer pool
// otherwise. The variable can only name a pool; any other value refuses.
export function runPool({ env = process.env, directory } = {}) {
  const declared = env.IMPOWER_TEST_POOL;
  if (declared !== undefined && !pools.includes(declared)) throw new Error(`IMPOWER_TEST_POOL must be writer or reviewer, not ${JSON.stringify(declared)}`);
  if (declared === "reviewer") return "reviewer";
  if (directory && path.resolve(directory).split(/[\\/]+/).some(segment => /\.review-jobs$/i.test(segment))) return "reviewer";
  return "writer";
}
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

function stillOwned(file, identity) {
  try { return sameFile(fs.lstatSync(file, { bigint: true }), identity); }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

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

// The foreign Vitest processes among `rows`, one `{ pid, parent, command,
// node }` per process on the machine: the Node processes whose command line
// names Vitest or tinypool (or cannot be read) and whose ancestor chain,
// followed through every process, reaches none of the `accounted` pids, the
// live holders' coordinators. A holder's engine and its forks reach their
// coordinator through the supervisor that launched them, so they are accounted
// for; a direct `npx vitest` call, or an orphan of a dead holder, is foreign
// and blocks admission as every Vitest process did before. A recorded engine
// or supervisor pid is never trusted by number: a pid outlives its process,
// and a direct Vitest call can inherit it. A row without `node` is a Node row.
export function foreignVitestProcesses(rows, ownPid = process.pid, { within, accounted = new Set() } = {}) {
  const parentOf = new Map(rows.map(row => [row.pid, row.parent]));
  const reaches = pid => {
    const seen = new Set();
    for (let current = pid; Number.isSafeInteger(current) && current > 0 && !seen.has(current); current = parentOf.get(current)) {
      if (accounted.has(current)) return true;
      seen.add(current);
    }
    return false;
  };
  return rows.filter(row => row.pid !== ownPid && row.node !== false && (!row.command ? !within : /vitest|tinypool/i.test(row.command) && names(row.command, within)))
    .filter(row => !reaches(row.pid)).map(row => row.pid);
}

export function windowsVitestProcesses(raw, ownPid = process.pid, options = {}) {
  // A command line can hold a raw control character that the compressed JSON
  // carries unescaped; the JSON itself has none, so each is blanked.
  const parsed = JSON.parse(raw.replace(/[\u0000-\u001f]/g, " ").trim() || "[]");
  const rows = Array.isArray(parsed) ? parsed : parsed === null ? [] : [parsed];
  // The idle process is pid 0; it heads every parent chain and is never a candidate.
  if (rows.some(p => !p || !Number.isSafeInteger(p.ProcessId) || p.ProcessId < 0 || (p.CommandLine !== null && typeof p.CommandLine !== "string")
    || (p.ParentProcessId !== undefined && p.ParentProcessId !== null && !Number.isSafeInteger(p.ParentProcessId))
    || (p.Name !== undefined && p.Name !== null && typeof p.Name !== "string"))) throw new Error("Malformed Windows process census");
  return foreignVitestProcesses(rows.map(p => ({ pid: p.ProcessId, parent: p.ParentProcessId ?? null, command: p.CommandLine,
    node: p.Name === undefined || p.Name === null || /^node(?:\.exe)?$/i.test(p.Name) })), ownPid, options);
}

// An unreadable process table is a refusal, never an empty inventory. Every
// process is read, not only Node, because a holder's engine reaches its
// coordinator through a supervisor that is not one.
export function vitestProcesses({ within, accounted } = {}) {
  if (process.platform === "win32") {
    const script = "$ErrorActionPreference='Stop'; @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine) | ConvertTo-Json -Compress";
    const raw = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    return windowsVitestProcesses(raw, process.pid, { within, accounted });
  }
  if (process.platform !== "linux") throw new Error("Test suites require Windows or Linux");
  const rows = [];
  for (const name of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const stat = fs.readFileSync(`/proc/${name}/stat`, "utf8");
      const parent = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
      const argv = fs.readFileSync(`/proc/${name}/cmdline`, "utf8").split("\0");
      const executable = path.basename(argv[0] || "");
      const node = /^(?:node(?:js)?(?:\s|$)|vitest)/i.test(executable) && !!processIdentity(Number(name));
      rows.push({ pid: Number(name), parent: Number.isSafeInteger(parent) ? parent : null, command: argv.join(" "), node });
    } catch (error) { if (!["ENOENT", "ESRCH"].includes(error.code)) throw error; }
  }
  return foreignVitestProcesses(rows, process.pid, { within, accounted });
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
  let identity, cause;
  sweepCreating(root, identify);
  for (;;) {
    try { identity = publishOwned(root, guard); break; }
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
    return action(path.join(root, "reservation.json"));
  } catch (error) { cause = error; throw error; }
  finally {
    try { removeGuard(guard, identity); }
    catch (error) {
      if (!cause) throw error;
      cause.guardCleanupError = error.message;
      console.error(`Reservation guard cleanup failed after ${cause.message}: ${error.message}`);
    }
  }
}

// Guards and claims are published with their owner already written: the
// creator writes `creating-<pid>-<start>-<id>.tmp` beside the target, then
// hard-links it into place, which fails with EEXIST exactly as an exclusive
// open does. The private file is removed on every path; one left by a creator
// that died before removing it names that creator and is swept once its pid
// and start time name no live process. Returns the published file's identity.
const creatingName = /^creating-(\d+)-(.+)-[0-9a-f]{8}\.tmp$/;
// This process's own identity never changes, and the lookup is a PowerShell
// call on Windows, so every guard reuses the first reading.
let ownIdentityValue;
const ownIdentity = () => ownIdentityValue ??= processIdentity(process.pid);
function publishOwned(root, file) {
  const owner = ownIdentity();
  const temp = path.join(root, `creating-${owner.pid}-${owner.start}-${randomUUID().slice(0, 8)}.tmp`);
  let fd, identity;
  try {
    fd = fs.openSync(temp, "wx");
    identity = fs.fstatSync(fd, { bigint: true });
    fs.writeFileSync(fd, JSON.stringify({ owner }));
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.linkSync(temp, file);
    return identity;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    removeCreating(temp);
  }
}

// Windows can refuse an unlink with EPERM or EBUSY while another reader (an
// indexer, antivirus) has the file open. Such a refusal is retried briefly;
// a file still left is retried at each later transaction and at exit, and
// once this process is gone any other process's sweep removes it.
const leftCreating = new Set();
let exitRetry = false;
function removeCreating(temp, retryMs = 1000) {
  const deadline = Date.now() + retryMs;
  for (;;) {
    try { fs.unlinkSync(temp); leftCreating.delete(temp); return; }
    catch (error) {
      if (error.code === "ENOENT") { leftCreating.delete(temp); return; }
      if (!["EPERM", "EBUSY", "EACCES"].includes(error.code) || Date.now() >= deadline) {
        if (!exitRetry) {
          exitRetry = true;
          process.once("exit", () => { for (const file of [...leftCreating]) removeCreating(file, 0); });
        }
        leftCreating.add(temp);
        return;
      }
      Atomics.wait(sleeper, 0, 0, 10);
    }
  }
}

// Remove private files whose creator is dead. Only names matching
// `creatingName` are considered; a live or unidentifiable creator's file stays.
function sweepCreating(root, identify) {
  for (const file of [...leftCreating]) removeCreating(file, 0);
  let names;
  try { names = fs.readdirSync(root); } catch { return; }
  for (const name of names) {
    const match = creatingName.exec(name);
    if (!match) continue;
    const owner = { pid: Number(match[1]), start: match[2] };
    try {
      if (same(owner, identify(owner.pid))) continue;
      fs.unlinkSync(path.join(root, name));
    } catch {}
  }
}

// This code never leaves a guard or claim empty. Checkouts still on older code
// create one empty by an exclusive open and write its owner in the next call,
// so their live creator leaves it empty for microseconds. An empty file this
// much older than its last write was left by such a creator killed between the
// two calls (or, the residual until those checkouts update, suspended there).
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
  let identity;
  for (let attempt = 0; identity === undefined; attempt++) {
    try { identity = publishOwned(root, file); }
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
  try { return action(); }
  finally { if (stillOwned(file, identity)) fs.unlinkSync(file); }
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
// reservation entries (every slot, passed as paths that may not exist, then
// every waiting row present) and moves the reviewer's scratch aside, so no run
// can be admitted between that read and the move. It never recovers a guard or
// reservation.
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
  const result = guarded(root, () => {
    const after = inspect(false);
    for (const [directory, original] of before) {
      const current = after.get(directory);
      if (!current || current.ino !== original.ino || current.dev !== original.dev || current.birthtimeNs !== original.birthtimeNs)
        throw new Error(`Cleanup reservation store changed at ${directory}; preserve reviewer scratch`);
    }
    const waiting = fs.readdirSync(root).filter(name => waitingName.test(name)).sort().map(name => path.join(root, name));
    const value = action([...slotFiles(root), ...waiting]);
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

// A holder's summary for waiting rows and refusals.
const holderSummary = (record, slot, observedAt) => ({ run: record.run, pool: record.pool ?? "writer", slot, phase: record.phase, attempt: record.attempt,
  file: record.file ?? null, mode: record.mode ?? null, unitStartedAt: record.unitStartedAt ?? null,
  progress: record.progress ?? null, timeoutMs: record.timeoutMs ?? null,
  heldSince: record.heldSince ?? null, heldAgeMs: elapsedSince(record.heldSince, observedAt),
  unitElapsedMs: elapsedSince(record.unitStartedAt, observedAt),
  lastProgressAgeMs: elapsedSince(record.progress?.at, observedAt) });

// The pids the live holders' Vitest processes descend from: their coordinators,
// whose identities the slot records' `running` state has just verified. The
// census follows every process's parent chain to them.
const accountedPids = records => new Set(records.map(record => record.owner?.pid).filter(pid => Number.isSafeInteger(pid) && pid > 0));

const byArrival = (a, b) => Date.parse(a.arrivedAt) - Date.parse(b.arrivedAt) || (a.token < b.token ? -1 : a.token > b.token ? 1 : 0);

// The waiting rows in the store, oldest first: the queue is every parsed row
// whose owner is alive and holds no slot. A row whose owner is gone is set
// aside as `recovered-waiting-<token>.json`, like an interrupted reservation;
// a row naming a live holder's own run and owner was left by that admission's
// failed unlink, and is removed now rather than counted against later runs; a
// row that cannot be parsed or whose owner cannot be identified is neither
// counted nor touched.
function waitingQueue(root, identify, holders = []) {
  const rows = [];
  for (const name of fs.readdirSync(root)) {
    if (!waitingName.test(name)) continue;
    const file = path.join(root, name);
    let row;
    try { row = read(file); } catch { continue; }
    if (!row?.token || !row.owner?.pid || !row.owner.start || !pools.includes(row.pool) || !Number.isFinite(Date.parse(row.arrivedAt))) continue;
    if (holders.some(holder => same(holder.owner, row.owner) && holder.run === row.run)) { try { fs.unlinkSync(file); } catch {} continue; }
    let alive;
    try { alive = same(row.owner, identify(row.owner.pid)); } catch { continue; }
    if (alive) { rows.push(row); continue; }
    try { fs.renameSync(file, path.join(root, `recovered-waiting-${row.token}.json`)); } catch {}
  }
  return rows.sort(byArrival);
}

// One admission transaction. Under the guard it reads every slot, recovers
// the interrupted ones once no foreign Vitest process remains, keeps its own
// waiting row current, and admits the run into the first free slot when no
// live holder has the same run directory, a slot is free, the run's pool holds
// fewer than its limit, the free-memory reading is at or above the floor, no
// foreign Vitest process is running and the queue says it is this run's turn:
// among the waiters whose pool can still take a slot, the oldest of the pool
// not admitted last, else the oldest overall. Each other outcome is a waitable
// refusal carrying the holders, the reading and the queue position, so the
// caller can wait and report. An ambiguous slot record, an unreadable memory
// reading or process table and a dead holder's lingering Vitest processes
// refuse outright, as before. The hand-over note that records the admitted
// pool is written before the slot record, under the same admission failure
// rules, so a published admission is never missing from it. `admitWaitMs`
// bounds only this transaction's guard wait, so a caller with a deadline can
// keep it inside that deadline; release keeps the full bound.
export function acquire(run, { root = machineRoot, pool = "writer", identify = processIdentity, uptime = os.uptime, census = vitestProcesses, memory = freeMemoryMb,
  floorMb = admissionFloorMb, slots = admissionSlots, waiting = null, guardWaitMs: waitMs = guardWaitMs, admitWaitMs = waitMs, supervised = false } = {}) {
  if (!pools.includes(pool)) throw new Error(`Unknown test pool ${JSON.stringify(pool)}; the pools are writer and reviewer`);
  // The reading is this attempt's evidence; it is taken outside the guard so
  // a slow reader never holds every other transaction.
  const freeMb = memory();
  if (!Number.isFinite(freeMb)) throw new Error(`Free memory reading unavailable: ${String(freeMb)}`);
  return guarded(root, () => {
    const observedAt = Date.now();
    const holders = [], interrupted = [];
    for (let index = 1; index <= slots; index++) {
      const file = slotFile(root, index);
      if (!fs.existsSync(file)) continue;
      const previous = read(file);
      const state = reservationState(previous, identify, { uptime });
      if (state === "running") { holders.push({ index, file, record: previous }); continue; }
      if (state !== "interrupted") throw Object.assign(new Error(`Existing suite ${state}; inspect ${file} and ${previous.run}`), { holder: holderSummary(previous, index, observedAt) });
      interrupted.push({ index, file, record: previous });
    }
    const foreign = census({ accounted: accountedPids(holders.map(holder => holder.record)) });
    if (interrupted.length) {
      if (foreign.length) throw new Error(`Vitest processes still present: ${foreign.join(", ")}`);
      // Preserve process identity and the recovery decision before replacing
      // ownership. The interrupted record stays in its file until an
      // admission's atomic rename replaces it: the lowest free slot is taken
      // first, so it is replaced before an empty higher slot is used, and a
      // failed replacement leaves its published bytes for inspection.
      for (const { record: previous } of interrupted) atomic(path.join(root, `recovered-${previous.token}.json`), { ...previous, recoveredAt: new Date().toISOString() }, { admissionRoot: root });
    }
    const summaries = holders.map(holder => holderSummary(holder.record, holder.index, observedAt));
    const owner = identify(process.pid);
    if (!owner) throw new Error("Coordinator identity unavailable");
    const mine = waiting ? { token: waiting.token, owner, pool, run, arrivedAt: waiting.arrivedAt } : null;
    const candidates = [...waitingQueue(root, identify, holders.map(holder => holder.record)).filter(row => !mine || row.token !== mine.token), ...(mine ? [mine] : [])].sort(byArrival);
    const position = mine ? candidates.findIndex(row => row.token === mine.token) + 1 : candidates.length + 1;
    const poolHolders = name => summaries.filter(holder => holder.pool === name).length;
    // A refused run with a wait holds its place with a row, written on its
    // first refusal and kept current after; a run admitted at once writes
    // none, and a refusal at or past the wait's deadline removes the row here,
    // in the same transaction, instead of holding another to withdraw it.
    const blocked = (waitable, message) => {
      if (mine) {
        const file = waitingFile(root, mine.token);
        if (Number.isFinite(waiting.deadline) && Date.now() >= waiting.deadline) {
          if (waiting.published) {
            try { fs.unlinkSync(file); waiting.published = false; }
            catch (error) { if (error.code !== "ENOENT") console.error(`Waiting row not removed at the deadline: ${error.message}`); else waiting.published = false; }
          }
        } else {
          let current = null;
          try { current = read(file); } catch (error) { if (error.code !== "ENOENT") throw error; }
          if (JSON.stringify(current) !== JSON.stringify(mine)) atomic(file, mine, { admissionRoot: root });
          waiting.published = true;
        }
      }
      return Object.assign(new Error(message), { waitable, holders: summaries, holder: summaries[0], freeMb, floorMb, position, queued: candidates.length });
    };
    // A live coordinator owns its run directory: a resume of the same run
    // waits for it, as it did when one slot excluded every other run.
    const sameRun = holders.find(holder => holder.record.run === run);
    if (sameRun) throw blocked("reservation", `Existing suite running for ${run}; inspect ${sameRun.file}`);
    if (holders.length >= slots) throw blocked("reservation", `Existing suite running in every slot (${holders.length} of ${slots}); inspect ${holders.map(holder => holder.file).join(", ")}`);
    if (poolHolders(pool) >= poolSlotLimit) throw blocked("pool slots", `The ${pool} pool holds its ${poolSlotLimit} slots`);
    if (freeMb < floorMb) throw blocked("memory", `Free memory ${freeMb} MB is below the ${floorMb} MB floor`);
    if (foreign.length) throw blocked("vitest processes", `Vitest processes already running: ${foreign.join(", ")}`);
    const admissible = candidates.filter(row => poolHolders(row.pool) < poolSlotLimit);
    let last = null;
    try { last = read(lastAdmittedFile(root)).pool ?? null; } catch {}
    const preferred = admissible.filter(row => row.pool !== last);
    const next = (preferred.length ? preferred : admissible)[0];
    if (next && (!mine || next.token !== mine.token)) throw blocked("queue", `Queued behind the ${next.pool} run ${next.run}`);
    const index = Array.from({ length: slots }, (_, at) => at + 1).find(at => !holders.some(holder => holder.index === at));
    const file = slotFile(root, index);
    const record = { ...(supervised ? { version: 2 } : {}), token: randomUUID(), owner, run, pool, slot: index,
      heldSince: new Date().toISOString(), heldUptime: uptime(), phase: "reserved" };
    // The note first: a note that cannot be written refuses the admission
    // like any other admission write, so the queue never reads a note that
    // names an older admission than the slots hold. A note written for a
    // record that then fails to publish only skews the next preference once.
    atomic(lastAdmittedFile(root), { pool, token: record.token, at: record.heldSince }, { admissionRoot: root });
    atomic(file, record, { admissionRoot: root });
    if (waiting?.published) {
      try { fs.unlinkSync(waitingFile(root, mine.token)); }
      catch (error) { if (error.code !== "ENOENT") console.error(`Waiting row not removed after admission: ${error.message}`); }
    }
    const update = (values) => {
      if (read(file).token !== record.token) throw new Error("Reservation ownership changed");
      Object.assign(record, values);
      atomic(file, record);
    };
    return { record, slot: index, file, freeMb, update, release() {
      guarded(root, () => {
        if (read(file).token !== record.token) throw new Error("Reservation ownership changed");
        if (!["reserved", "exited"].includes(record.phase)) throw new Error("Child exit unconfirmed; preserve reservation");
        fs.unlinkSync(file);
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

// A run that gives up removes its own waiting row; a row it cannot remove is
// swept once its owner is gone.
function withdraw(root, token, identify) {
  try {
    guarded(root, () => {
      try { fs.unlinkSync(waitingFile(root, token)); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
    }, guardWaitMs, identify, false, false);
  } catch (error) { console.error(`Waiting row not withdrawn: ${error.message}`); }
}

const describeHolders = holders => holders?.length
  ? holders.map(holder => `${holder.run} (${holder.pool}, slot ${holder.slot}, ${holder.phase}${holder.file ? `, ${path.basename(holder.file)}` : ""})`).join("; ")
  : "none";

// The refusal an expired wait reports: what blocked the last attempt, the
// queue position, the holders with their pools, the last free-memory reading,
// and the route for the files that did not run.
function expired(error, waitedMs) {
  const message = `${error.message}; waited ${Math.round(waitedMs / 1000)} s`
    + (error.waitable ? `: queue position ${error.position} of ${error.queued}; holders: ${describeHolders(error.holders)}; free memory ${error.freeMb} MB (floor ${error.floorMb} MB)` : "")
    + "; the Test Suite workflow on the pushed head is the route for the files that did not run";
  return Object.assign(new Error(message), error, { message });
}

// Queue for admission. Each attempt is one transaction; a waitable refusal (a
// full store, a full pool, a reading below the floor, a foreign Vitest
// process, an earlier waiter's turn, a held guard or busy reservation files)
// is reported and retried until the deadline, when the run withdraws its row
// and refuses with the queue state. Ambiguous and unknown reservations, an
// unreadable reading or process table and a dead holder's lingering processes
// refuse at once. Without a bound, one attempt decides; a held guard then gets
// one transaction's bound, as in acquire.
export async function acquireWaiting(run, { waitMs = 0, pollMs = 2000, onWait = () => {}, ...options } = {}) {
  const began = Date.now(), deadline = began + waitMs;
  const transactionMs = options.guardWaitMs ?? guardWaitMs;
  const waiting = waitMs > 0 ? { token: randomUUID(), arrivedAt: new Date(began).toISOString(), deadline } : null;
  for (;;) {
    const admitWaitMs = waitMs > 0 ? Math.min(transactionMs, Math.max(0, deadline - Date.now())) : transactionMs;
    try { return acquire(run, { ...options, admitWaitMs, waiting }); }
    catch (error) {
      const reason = error.reservationFilesBusy ? "reservation files" : error.guardHeld ? "guard" : error.waitable ?? null;
      if (!reason || Date.now() >= deadline) {
        if (waiting?.published) withdraw(options.root ?? machineRoot, waiting.token, options.identify ?? processIdentity);
        throw reason ? expired(error, Date.now() - began) : error;
      }
      onWait({ waiting: reason, detail: error.message, ...(error.holder ? { holder: error.holder } : {}),
        ...(error.waitable ? { holders: error.holders, position: error.position, queued: error.queued, freeMb: error.freeMb, floorMb: error.floorMb } : {}) });
      await pause(pollMs, deadline);
    }
  }
}

// The gate before each execution unit of an admitted run: the free-memory
// reading at or above the floor and no foreign Vitest process, where the other
// live holders' coordinators are accounted for (a slot whose coordinator is
// gone, or whose state is unknown, accounts for nothing, so a dead holder's
// orphan stays foreign). The slot snapshot and the census run under the
// store's guard, so no admission lands between them: a holder admitted before
// the snapshot is in it, and one admitted after cannot have launched an engine
// yet. A reading below the floor delays the unit until the deadline; the
// holder keeps its slot throughout.
export async function waitForUnit(reservation, { deadline = Date.now(), pollMs = 2000, census = vitestProcesses, memory = freeMemoryMb,
  floorMb = admissionFloorMb, root = machineRoot, slots = admissionSlots, identify = processIdentity, uptime = os.uptime, onWait = () => {} } = {}) {
  for (;;) {
    const freeMb = memory();
    if (!Number.isFinite(freeMb)) throw new Error(`Free memory reading unavailable: ${String(freeMb)}`);
    let foreign;
    try {
      foreign = guarded(root, () => {
        const records = [reservation.record];
        for (const file of slotFiles(root, slots)) {
          if (file === reservation.file) continue;
          try { const record = read(file); if (reservationState(record, identify, { uptime }) === "running") records.push(record); } catch {}
        }
        return census({ accounted: accountedPids(records) });
      }, guardWaitMs, identify, false, true);
    } catch (error) {
      if (!error.guardHeld || Date.now() >= deadline) throw error;
      onWait({ waiting: "guard", detail: error.message });
      await pause(pollMs, deadline);
      continue;
    }
    if (freeMb >= floorMb && !foreign.length) return { freeMb };
    const message = freeMb < floorMb ? `Free memory ${freeMb} MB is below the ${floorMb} MB floor` : `Vitest processes still present: ${foreign.join(", ")}`;
    if (Date.now() >= deadline) throw new Error(message);
    onWait({ waiting: freeMb < floorMb ? "memory" : "vitest processes", freeMb, floorMb, ...(foreign.length ? { pids: foreign } : {}) });
    await pause(pollMs, deadline);
  }
}

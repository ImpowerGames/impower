import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { processIdentity } from "./reviewer-slots.mjs";
import { readTreeProof, readRecordedTreeProof, readWindowsJobRecovery, assertAttemptBinding } from "./test-suite-child.mjs";

export { processIdentity };
export const machineRoot = process.platform === "win32"
  ? path.join(process.env.ProgramData || "C:\\ProgramData", "Impower", "test-suite")
  : "/var/tmp/impower-test-suite";
export const admissionFloorMb = 4096;
export const admissionSlots = 3;
export const poolSlotLimit = 2;
export const pools = Object.freeze(["writer", "reviewer"]);
export const slotFile = (root, index) => path.join(root, index === 1 ? "reservation.json" : `reservation-${index}.json`);
export const slotFiles = (root = machineRoot, slots = admissionSlots) => Array.from({ length: slots }, (_, index) => slotFile(root, index + 1));
const waitingName = /^waiting-[A-Za-z0-9-]+\.json$/;
const waitingFile = (root, token) => path.join(root, `waiting-${token}.json`);
const lastAdmittedFile = root => path.join(root, "last-admitted.json");

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
    const deadline = Date.now() + 1000;
    for (;;) {
      try { fs.renameSync(temp, file); published = true; break; }
      catch (error) {
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

function readAdmissionRecord(file) {
  try { return read(file); }
  catch (cause) {
    if (!(cause instanceof SyntaxError)) throw cause;
    throw Object.assign(new Error(`Reservation record unreadable at ${file}: ${cause.message}; admission remains blocked; retrying is safe after the record is repaired or its writer finishes`, { cause }), { reservationRecordUnreadable: true });
  }
}

function unlinkOwned(file, identity) {
  const current = fs.lstatSync(file, { bigint: true });
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
      if (!identity) throw new Error(`Private reservation probe identity unavailable at ${probe}`);
      unlinkOwned(probe, identity);
    }
  }
  return Object.assign(new Error(`Reservation files busy at ${root} (${error.code}); writable store confirmed, but acquisition did not complete`), { reservationFilesBusy: true });
}

const names = (command, within) => !within || command.toLowerCase().includes(within.toLowerCase());

// workaround(windows): a child keeps a dead parent's pid, which a newer process can reuse, so a parent edge needs creation-time order
export function foreignVitestProcesses(rows, ownPid = process.pid, { within, accounted = new Set() } = {}) {
  const byPid = new Map(rows.map(row => [row.pid, row]));
  const parentOf = row => {
    const parent = byPid.get(row.parent);
    if (!parent || parent.pid === row.pid || !Number.isFinite(row.created) || !Number.isFinite(parent.created) || parent.created > row.created) return undefined;
    return parent;
  };
  const reaches = pid => {
    const seen = new Set();
    for (let current = byPid.get(pid); current && !seen.has(current.pid); current = parentOf(current)) {
      if (accounted.has(current.pid)) return true;
      seen.add(current.pid);
    }
    return false;
  };
  return rows.filter(row => row.pid !== ownPid && row.node !== false && (!row.command ? !within : /vitest|tinypool/i.test(row.command) && names(row.command, within)))
    .filter(row => !reaches(row.pid)).map(row => row.pid);
}

export function windowsVitestProcesses(raw, ownPid = process.pid, options = {}) {
  const parsed = JSON.parse(raw.replace(/[\u0000-\u001f]/g, " ").trim() || "[]");
  const rows = Array.isArray(parsed) ? parsed : parsed === null ? [] : [parsed];
  if (rows.some(p => !p || !Number.isSafeInteger(p.ProcessId) || p.ProcessId < 0 || (p.CommandLine !== null && typeof p.CommandLine !== "string")
    || (p.ParentProcessId !== undefined && p.ParentProcessId !== null && !Number.isSafeInteger(p.ParentProcessId))
    || (p.Created !== undefined && p.Created !== null && typeof p.Created !== "number")
    || (p.Name !== undefined && p.Name !== null && typeof p.Name !== "string"))) throw new Error("Malformed Windows process census");
  return foreignVitestProcesses(rows.map(p => ({ pid: p.ProcessId, parent: p.ParentProcessId ?? null, created: typeof p.Created === "number" ? p.Created : NaN, command: p.CommandLine,
    node: p.Name === undefined || p.Name === null || /^node(?:\.exe)?$/i.test(p.Name) })), ownPid, options);
}

export function vitestProcesses({ within, accounted } = {}) {
  if (process.platform === "win32") {
    const script = "$ErrorActionPreference='Stop'; @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine,@{n='Created';e={if($_.CreationDate){[math]::Floor($_.CreationDate.ToFileTimeUtc()/10000)}else{$null}}}) | ConvertTo-Json -Compress";
    const raw = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    return windowsVitestProcesses(raw, process.pid, { within, accounted });
  }
  if (process.platform !== "linux") throw new Error("Test suites require Windows or Linux");
  const rows = [];
  for (const name of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const stat = fs.readFileSync(`/proc/${name}/stat`, "utf8");
      const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      const parent = Number(fields[1]), created = Number(fields[19]);
      const argv = fs.readFileSync(`/proc/${name}/cmdline`, "utf8").split("\0");
      const executable = path.basename(argv[0] || "");
      const node = /^(?:node(?:js)?(?:\s|$)|vitest)/i.test(executable) && !!processIdentity(Number(name));
      rows.push({ pid: Number(name), parent: Number.isSafeInteger(parent) ? parent : null, created: Number.isFinite(created) ? created : NaN, command: argv.join(" "), node });
    } catch (error) { if (!["ENOENT", "ESRCH"].includes(error.code)) throw error; }
  }
  return foreignVitestProcesses(rows, process.pid, { within, accounted });
}

export function reservationState(record, identify = processIdentity, { uptime = os.uptime } = {}) {
  if (!record?.owner?.pid || !record.owner.start) return "unknown";
  const valid = value => Number.isSafeInteger(value?.pid) && value.pid > 0 && typeof value.start === "string" && value.start.length > 0;
  if (!valid(record.owner) || record.version !== undefined && ![1, 2].includes(record.version)) return "unknown";
  let owner;
  try { owner = identify(record.owner.pid); }
  catch (error) { if (record.version === 2) return "unknown"; throw error; }
  if (same(record.owner, owner)) return "running";
  if (owner !== null && !valid(owner)) return "unknown";
  for (const original of [record.child, record.root].filter(value => value !== undefined && value !== null)) {
    if (!valid(original)) return "unknown";
    let current;
    try { current = identify(original.pid); }
    catch { return "unknown"; }
    if (current !== null && !valid(current)) return "unknown";
    if (same(original, current)) return "running";
  }
  if (record.version === 2) {
    const preBoot = () => Number.isFinite(record.heldUptime) && uptime() < record.heldUptime;
    if (!record.supervision) return record.phase === "reserved" && !record.child && !record.root || preBoot() ? "interrupted" : "unknown";
    const expected = record.supervision;
    if (expected.reservationToken !== record.token) return "unknown";
    try {
      assertAttemptBinding(expected,{id:record.attempt,
        ...(typeof record.run==="string"&&path.isAbsolute(record.run)?{directory:path.join(record.run,record.attempt)}:{})});
      const noLaunch = record.phase === "launching" && expected.version === 1
        && expected.authorizationPhase === "no-launch" && [undefined, false].includes(expected.launchAuthorized) && !expected.root && !record.child
        && ["win32", "linux"].includes(expected.platform)
        && typeof record.run === "string" && path.isAbsolute(record.run)
        && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(expected.launchNonce)
        && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(expected.reservationToken);
      for (const original of [expected.launcher, expected.helper, ...[expected.root].filter(value => value !== undefined && value !== null)]) {
        if (noLaunch && (original === undefined || original === null)) continue;
        if (!valid(original)) return "unknown";
        const current = identify(original.pid);
        if (current !== null && !valid(current)) return "unknown";
        if (same(original, current)) return "running";
      }
      if (record.child && !same(record.child, expected.root)) return "unknown";
      if (preBoot()) return "interrupted";
      if (noLaunch) {
        if (expected.platform === "linux" && expected.launcher && expected.helper && !same(expected.launcher, expected.helper)) return "unknown";
        if (expected.proofFile !== undefined) {
          if (expected.proofFile !== path.join(expected.directory, "tree-proof.json")) return "unknown";
          let exists = true;
          try { fs.lstatSync(expected.proofFile); }
          catch (error) { if (error.code !== "ENOENT") throw error; exists = false; }
          if (exists) readTreeProof(expected, { identify, close: expected.launcherClose });
        }
        return "interrupted";
      }
      if (expected.authorizationPhase === "no-launch" && expected.launchAuthorized === false
        && expected.status === "not-run" && !expected.root && expected.exitConfirmed === true
        && expected.helperExitEvidence?.observation === "original-identity-absent"
        && same(expected.helperExitEvidence.identity, expected.helper)
        && Number.isInteger(expected.launcherClose?.exit) && !expected.launcherClose.signal) return "interrupted";
      try { readTreeProof(expected, { identify, close: expected.launcherClose }); }
      catch (error) {
        if (error.code !== "ENOENT") throw error;
        if (typeof record.run !== "string" || !path.isAbsolute(record.run)) return "unknown";
        if (expected.exitConfirmed === true) readRecordedTreeProof(expected, { identify });
        else readWindowsJobRecovery(expected);
      }
      return "interrupted";
    } catch { return "unknown"; }
  }
  if (["reserved", "exited"].includes(record.phase)) return "interrupted";
  if (record.phase !== "running" || !record.child?.start) return "unknown";
  return "interrupted";
}

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

const creatingName = /^creating-(\d+)-(.+)-[0-9a-f]{8}\.tmp$/;
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

export const emptyAbandonMs = 60_000;
const claimDepth = 4;

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

function recoverAbandonedGuard(root, guard, identify, admitting = false) {
  return withClaim(root, path.join(root, "guard-recovery.json"), identify, admitting, () => {
    const held = judge(root, guard, identify, admitting);
    if (!held) return true;
    return held.abandoned && setAside(root, guard, held.identity, "recovered-guard", admitting);
  });
}

const guardWaitMs = 5000;
const sleeper = new Int32Array(new SharedArrayBuffer(4));
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

const holderSummary = (record, slot, observedAt) => ({ run: record.run, pool: record.pool ?? "writer", slot, phase: record.phase, attempt: record.attempt,
  file: record.file ?? null, mode: record.mode ?? null, unitStartedAt: record.unitStartedAt ?? null,
  progress: record.progress ?? null, timeoutMs: record.timeoutMs ?? null,
  heldSince: record.heldSince ?? null, heldAgeMs: elapsedSince(record.heldSince, observedAt),
  unitElapsedMs: elapsedSince(record.unitStartedAt, observedAt),
  lastProgressAgeMs: elapsedSince(record.progress?.at, observedAt) });

const memoized = identify => {
  const seen = new Map();
  return pid => { if (!seen.has(pid)) seen.set(pid, identify(pid)); return seen.get(pid); };
};

const accountedPids = (records, lookup) => {
  const pids = new Set();
  const live = value => Number.isSafeInteger(value?.pid) && value.pid > 0 && !!value.start && same(value, lookup(value.pid));
  for (const record of records) {
    if (live(record.owner)) { pids.add(record.owner.pid); continue; }
    for (const value of [record.supervision?.launcher, record.supervision?.helper, record.child]) if (live(value)) pids.add(value.pid);
  }
  return pids;
};

const byArrival = (a, b) => Date.parse(a.arrivedAt) - Date.parse(b.arrivedAt) || (a.token < b.token ? -1 : a.token > b.token ? 1 : 0);

function archiveReservation(root, record, options) {
  if (typeof record.token !== "string" || !/^[A-Za-z0-9-]+$/.test(record.token)) throw new Error("Invalid recovery token; preserve the reservation");
  const file = path.join(root, `recovered-${record.token}.json`);
  let prior, exists = true;
  try { prior = read(file); }
  catch (error) { if (error.code !== "ENOENT") throw options?.admissionRoot ? admissionFailure(root, error) : error; exists = false; }
  if (exists) {
    const { recoveredAt, ...saved } = prior;
    if (JSON.stringify(saved) !== JSON.stringify(record)) throw new Error(`Recovery archive differs at ${file}; preserve both records`);
  } else atomic(file, { ...record, recoveredAt: new Date().toISOString() }, options);
}

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

export function acquire(run, { root = machineRoot, pool = "writer", identify = processIdentity, uptime = os.uptime, census = vitestProcesses, memory = freeMemoryMb,
  floorMb = admissionFloorMb, slots = admissionSlots, waiting = null, guardWaitMs: waitMs = guardWaitMs, admitWaitMs = waitMs, supervised = false } = {}) {
  if (!pools.includes(pool)) throw new Error(`Unknown test pool ${JSON.stringify(pool)}; the pools are writer and reviewer`);
  const freeMb = memory();
  if (!Number.isFinite(freeMb)) throw new Error(`Free memory reading unavailable: ${String(freeMb)}`);
  return guarded(root, () => {
    const observedAt = Date.now();
    const lookup = memoized(identify);
    const holders = [], interrupted = [];
    for (let index = 1; index <= slots; index++) {
      const file = slotFile(root, index);
      if (!fs.existsSync(file)) continue;
      const previous = readAdmissionRecord(file);
      const state = reservationState(previous, lookup, { uptime });
      if (state === "running") { holders.push({ index, file, record: previous }); continue; }
      if (state !== "interrupted") throw Object.assign(new Error(`Existing suite ${state}; inspect ${file} and ${previous.run}; node scripts/test-suite.mjs recover-reservation rechecks containment under the guard and preserves recoverable records; ambiguous evidence stays protected`), { reservationUnknown: true, holder: holderSummary(previous, index, observedAt) });
      interrupted.push({ index, file, record: previous });
    }
    const foreign = census({ accounted: accountedPids(holders.map(holder => holder.record), lookup) });
    if (interrupted.length) {
      if (foreign.length) throw new Error(`Vitest processes still present: ${foreign.join(", ")}`);
      for (const { file, record: previous } of interrupted) {
        archiveReservation(root, previous, { admissionRoot: root });
        try { fs.unlinkSync(file); }
        catch (error) { throw admissionFailure(root, error); }
      }
    }
    const summaries = holders.map(holder => holderSummary(holder.record, holder.index, observedAt));
    const owner = lookup(process.pid);
    if (!owner) throw new Error("Coordinator identity unavailable");
    const mine = waiting ? { token: waiting.token, owner, pool, run, arrivedAt: waiting.arrivedAt } : null;
    const candidates = [...waitingQueue(root, lookup, holders.map(holder => holder.record)).filter(row => !mine || row.token !== mine.token), ...(mine ? [mine] : [])].sort(byArrival);
    const position = mine ? candidates.findIndex(row => row.token === mine.token) + 1 : candidates.length + 1;
    const poolHolders = name => summaries.filter(holder => holder.pool === name).length;
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
    const sameRun = holders.find(holder => holder.record.run === run);
    if (sameRun) throw blocked("reservation", `Existing suite running for ${run}; inspect ${sameRun.file}`);
    if (holders.length >= slots) throw blocked("reservation", `Existing suite running in every slot (${holders.length} of ${slots}); inspect ${holders.map(holder => holder.file).join(", ")}`);
    if (poolHolders(pool) >= poolSlotLimit) throw blocked("pool slots", `The ${pool} pool holds its ${poolSlotLimit} slots`);
    if (freeMb < floorMb) throw blocked("memory", `Free memory ${freeMb} MB is below the ${floorMb} MB floor`);
    if (foreign.length) throw blocked("vitest processes", `Vitest processes already running: ${foreign.join(", ")}`);
    const admissible = candidates.filter(row => poolHolders(row.pool) < poolSlotLimit && !holders.some(holder => holder.record.run === row.run));
    let last = null;
    try { last = read(lastAdmittedFile(root)).pool ?? null; } catch {}
    const preferred = admissible.filter(row => row.pool !== last);
    const next = (preferred.length ? preferred : admissible)[0];
    if (next && (!mine || next.token !== mine.token)) throw blocked("queue", `Queued behind the ${next.pool} run ${next.run}`);
    const index = Array.from({ length: slots }, (_, at) => at + 1).find(at => !holders.some(holder => holder.index === at));
    const file = slotFile(root, index);
    const record = { ...(supervised ? { version: 2 } : {}), token: randomUUID(), owner, run, pool, slot: index,
      heldSince: new Date().toISOString(), heldUptime: uptime(), phase: "reserved" };
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

export function releaseKeeping(reservation, cause) {
  try { reservation.release(); }
  catch (error) { console.error(`Release failed after ${cause.message}: ${releaseDiagnostic(reservation, error)}`); }
}

export function releaseDiagnostic(reservation, error) {
  let state;
  try { state = read(reservation.file).token === reservation.record.token ? "slot still holds this token" : "slot now holds another token; preserve it"; }
  catch (inspection) { state = inspection.code === "ENOENT" ? "slot is absent" : `slot state unavailable: ${inspection.message}`; }
  return `${error.message}; ${state}; node scripts/test-suite.mjs recover-reservation rechecks containment under the guard; never delete reservation records`;
}

export function recoverReservations({ root = machineRoot, slots = admissionSlots, identify = processIdentity, uptime = os.uptime, census = vitestProcesses } = {}) {
  return guarded(root, () => {
    const lookup = memoized(identify), records = [];
    for (const file of slotFiles(root, slots)) {
      if (!fs.existsSync(file)) continue;
      const record = readAdmissionRecord(file), state = reservationState(record, lookup, { uptime });
      if (state !== "interrupted") throw new Error(`Recovery refused: suite ${state} at ${file}; preserve the record and its attempt evidence`);
      records.push({ file, record });
    }
    const foreign = census();
    if (foreign.length) throw new Error(`Recovery refused: Vitest processes still present: ${foreign.join(", ")}`);
    for (const { file, record } of records) {
      archiveReservation(root, record);
      fs.unlinkSync(file);
    }
    return records.map(({ file, record }) => ({ file, token: record.token, run: record.run }));
  }, guardWaitMs, identify);
}

const pause = (ms, deadline) => new Promise(resolve => setTimeout(resolve, Math.max(0, Math.min(ms, deadline - Date.now()))));

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

function expired(error, waitedMs) {
  const message = `${error.message}; waited ${Math.round(waitedMs / 1000)} s`
    + (error.waitable ? `: queue position ${error.position} of ${error.queued}; holders: ${describeHolders(error.holders)}; free memory ${error.freeMb} MB (floor ${error.floorMb} MB)` : "")
    + "; the Test Suite workflow on the pushed head is the route for the files that did not run";
  return Object.assign(new Error(message), error, { message });
}

export async function acquireWaiting(run, { waitMs = 0, pollMs = 2000, onWait = () => {}, ...options } = {}) {
  const began = Date.now(), deadline = began + waitMs;
  const transactionMs = options.guardWaitMs ?? guardWaitMs;
  const waiting = waitMs > 0 ? { token: randomUUID(), arrivedAt: new Date(began).toISOString(), deadline } : null;
  for (;;) {
    const admitWaitMs = waitMs > 0 ? Math.min(transactionMs, Math.max(0, deadline - Date.now())) : transactionMs;
    try { return acquire(run, { ...options, admitWaitMs, waiting }); }
    catch (error) {
      const reason = error.reservationRecordUnreadable ? "reservation record" : error.reservationUnknown ? "unknown reservation" : error.reservationFilesBusy ? "reservation files" : error.guardHeld ? "guard" : error.waitable ?? null;
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

export async function waitForUnit(reservation, { deadline = Date.now(), pollMs = 2000, census = vitestProcesses, memory = freeMemoryMb,
  floorMb = admissionFloorMb, root = machineRoot, slots = admissionSlots, identify = processIdentity, uptime = os.uptime, onWait = () => {} } = {}) {
  for (;;) {
    const freeMb = memory();
    if (!Number.isFinite(freeMb)) throw new Error(`Free memory reading unavailable: ${String(freeMb)}`);
    let foreign;
    try {
      foreign = guarded(root, () => {
        const lookup = memoized(identify);
        const records = [reservation.record];
        for (const file of slotFiles(root, slots)) {
          if (file === reservation.file) continue;
          try { const record = read(file); if (reservationState(record, lookup, { uptime }) === "running") records.push(record); } catch {}
        }
        return census({ accounted: accountedPids(records, lookup) });
      }, Math.min(guardWaitMs, Math.max(0, deadline - Date.now())), identify, false, true);
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

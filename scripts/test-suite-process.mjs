import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { processIdentity } from "./reviewer-slots.mjs";

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
  if (!current.isFile() || current.ino === 0n || current.ino !== identity.ino || current.birthtimeNs !== identity.birthtimeNs
    || (process.platform !== "win32" && current.dev !== identity.dev)) throw new Error(`Private reservation file ownership changed at ${file}; preserve it for inspection`);
  fs.unlinkSync(file);
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

export function reservationState(record, identify = processIdentity) {
  if (!record?.owner?.pid || !record.owner.start) return "unknown";
  if (same(record.owner, identify(record.owner.pid))) return "running";
  if (["reserved", "exited"].includes(record.phase)) return "interrupted";
  if (record.phase !== "running" || !record.child?.start) return "unknown";
  return same(record.child, identify(record.child.pid)) ? "running" : "interrupted";
}

// Serialize acquisition, recovery and release, including the reservation's
// creation window. A transaction holds the guard only for a few synchronous
// file operations, so a held guard is retried until `waitMs` passes. A guard
// whose recorded owner is no longer running was abandoned inside its transaction
// and is renamed aside; any other guard, including one whose owner identity
// cannot be read, is never guessed away.
function guarded(root, action, waitMs = guardWaitMs, identify = processIdentity, admitting = false) {
  const denied = (error) => ["EPERM", "EACCES"].includes(error.code)
    ? storeDenied(root, error)
    : null;
  try { fs.mkdirSync(root, { recursive: true }); }
  catch (error) { throw denied(error) || error; }
  const guard = path.join(root, "guard.json");
  const deadline = Date.now() + waitMs;
  let fd;
  for (;;) {
    try { fd = fs.openSync(guard, "wx"); break; }
    catch (error) {
      if (admitting && process.platform === "win32" && ["EPERM", "EACCES", "EBUSY"].includes(error.code)) throw admissionFailure(root, error);
      if (error.code === "EEXIST" && recoverAbandonedGuard(root, guard, identify, admitting)) continue;
      if (error.code === "EEXIST" && Date.now() < deadline) { Atomics.wait(sleeper, 0, 0, 10); continue; }
      const refusal = denied(error);
      if (refusal) throw refusal;
      throw Object.assign(new Error(`Reservation transaction unavailable at ${guard}: ${error.message}`), { guardHeld: error.code === "EEXIST" });
    }
  }
  try {
    fs.writeFileSync(fd, JSON.stringify({ owner: processIdentity(process.pid) }));
    fs.fsyncSync(fd);
    return action(path.join(root, "reservation.json"));
  } finally { fs.closeSync(fd); fs.unlinkSync(guard); }
}

// Rename a guard whose recorded owner (pid and start time, the identity
// `reservationState` compares) names no live process, keeping it as
// `recovered-guard-<time>.json`. Returns whether the guard is gone and the
// caller should try to take it again.
//
// The read, the identity check and the rename run under an exclusive
// `guard-recovery.json` claim, so two recoverers cannot both judge the same
// abandoned guard and have the slower one rename the replacement the faster one
// just took. Only a recoverer can remove a guard whose owner is dead, so under
// the claim the guard read is the guard renamed. A claim left by a recoverer
// that died inside it is never guessed away: no guard is recovered until it is
// inspected, which is how every abandoned guard behaved before recovery existed.
function recoverAbandonedGuard(root, guard, identify, admitting = false) {
  const claim = path.join(root, "guard-recovery.json");
  let fd;
  try { fd = fs.openSync(claim, "wx"); }
  catch (error) {
    if (admitting && process.platform === "win32" && ["EPERM", "EACCES", "EBUSY"].includes(error.code)) throw admissionFailure(root, error);
    return false;
  }
  try {
    // Recorded for the inspector of an abandoned claim; nothing reads it back.
    try {
      fs.writeFileSync(fd, JSON.stringify({ owner: processIdentity(process.pid) }));
      fs.fsyncSync(fd);
    } catch (error) {
      if (admitting && process.platform === "win32" && ["EPERM", "EACCES", "EBUSY"].includes(error.code)) throw admissionFailure(root, error);
      return false;
    }
    let owner;
    try { owner = JSON.parse(fs.readFileSync(guard, "utf8"))?.owner; }
    catch (error) {
      if (admitting && process.platform === "win32" && ["EPERM", "EACCES", "EBUSY"].includes(error.code)) throw admissionFailure(root, error);
      return error.code === "ENOENT";
    }
    if (!owner?.pid || !owner.start) return false;
    // An unreadable process table is not evidence that the owner is gone.
    let current;
    try { current = identify(owner.pid); }
    catch { return false; }
    if (same(owner, current)) return false;
    const stamp = new Date().toISOString().replace(/[^0-9]/g, "");
    try { fs.renameSync(guard, path.join(root, `recovered-guard-${stamp}-${randomUUID().slice(0, 8)}.json`)); }
    catch (error) {
      if (admitting && process.platform === "win32" && ["EPERM", "EACCES", "EBUSY"].includes(error.code)) throw admissionFailure(root, error);
      return error.code === "ENOENT";
    }
    return true;
  } finally { fs.closeSync(fd); fs.unlinkSync(claim); }
}

const guardWaitMs = 5000;
const sleeper = new Int32Array(new SharedArrayBuffer(4));

// `admitWaitMs` bounds only the acquiring transaction's guard wait, so a caller
// with a deadline can keep it inside that deadline; release keeps the full bound.
export function acquire(run, { root = machineRoot, identify = processIdentity, census = vitestProcesses, guardWaitMs: waitMs = guardWaitMs, admitWaitMs = waitMs } = {}) {
  return guarded(root, file => {
    if (fs.existsSync(file)) {
      const previous = read(file);
      const state = reservationState(previous, identify);
      if (state !== "interrupted") throw new Error(`Existing suite ${state}; inspect ${file} and ${previous.run}`);
      const existing = census();
      if (existing.length) throw new Error(`Vitest processes still present: ${existing.join(", ")}`);
      // Preserve process identity and the recovery decision before replacing ownership.
      atomic(path.join(root, `recovered-${previous.token}.json`), { ...previous, recoveredAt: new Date().toISOString() }, { admissionRoot: root });
    }
    const existing = census();
    if (existing.length) throw new Error(`Vitest processes already running: ${existing.join(", ")}`);
    const record = { token: randomUUID(), owner: identify(process.pid), run, phase: "reserved" };
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
      onWait({ waiting, detail: error.message });
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

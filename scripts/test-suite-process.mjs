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
export function atomic(file, value) {
  const temp = `${file}.${randomUUID()}.tmp`;
  const fd = fs.openSync(temp, "wx");
  try { fs.writeFileSync(fd, JSON.stringify(value, null, 2) + "\n", "utf8"); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  // Windows can briefly deny replacement while a status reader or scanner has
  // the destination open. Retry the atomic rename; never unlink valid evidence.
  const deadline = Date.now() + 1000;
  for (;;) {
    try { fs.renameSync(temp, file); break; }
    catch (error) {
      if (process.platform !== "win32" || !["EPERM", "EACCES", "EBUSY"].includes(error.code) || Date.now() >= deadline) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }
}
export const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

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
// file operations, so a held guard is retried until `waitMs` passes. An
// abandoned guard requires inspection; it is never guessed away.
function guarded(root, action, waitMs = guardWaitMs) {
  const denied = (error) => ["EPERM", "EACCES"].includes(error.code)
    ? new Error(`Reservation store not writable at ${root} (${error.code}); this process cannot take the machine-wide Vitest reservation, so it cannot run Vitest here`)
    : null;
  try { fs.mkdirSync(root, { recursive: true }); }
  catch (error) { throw denied(error) || error; }
  const guard = path.join(root, "guard.json");
  const deadline = Date.now() + waitMs;
  let fd;
  for (;;) {
    try { fd = fs.openSync(guard, "wx"); break; }
    catch (error) {
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

const guardWaitMs = 5000;
const sleeper = new Int32Array(new SharedArrayBuffer(4));

export function acquire(run, { root = machineRoot, identify = processIdentity, census = vitestProcesses, guardWaitMs: waitMs = guardWaitMs } = {}) {
  return guarded(root, file => {
    if (fs.existsSync(file)) {
      const previous = read(file);
      const state = reservationState(previous, identify);
      if (state !== "interrupted") throw new Error(`Existing suite ${state}; inspect ${file} and ${previous.run}`);
      const existing = census();
      if (existing.length) throw new Error(`Vitest processes still present: ${existing.join(", ")}`);
      // Preserve process identity and the recovery decision before replacing ownership.
      atomic(path.join(root, `recovered-${previous.token}.json`), { ...previous, recoveredAt: new Date().toISOString() });
    }
    const existing = census();
    if (existing.length) throw new Error(`Vitest processes already running: ${existing.join(", ")}`);
    const record = { token: randomUUID(), owner: identify(process.pid), run, phase: "reserved" };
    if (!record.owner) throw new Error("Coordinator identity unavailable");
    atomic(file, record);
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
      }, waitMs);
    } };
  }, waitMs);
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
// guard held past one transaction's bound waits.
export async function acquireWaiting(run, { waitMs = 0, pollMs = 2000, census = vitestProcesses, onWait = () => {}, ...options } = {}) {
  const deadline = Date.now() + waitMs;
  let reservation;
  for (;;) {
    try { reservation = acquire(run, { ...options, census: () => [] }); break; }
    catch (error) {
      const waiting = error.guardHeld ? "guard" : /^Existing suite running/.test(error.message) ? "reservation" : null;
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

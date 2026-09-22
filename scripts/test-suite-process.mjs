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
// creation window. An abandoned guard requires inspection; it is never guessed away.
function guarded(root, action) {
  fs.mkdirSync(root, { recursive: true });
  const guard = path.join(root, "guard.json");
  let fd;
  try { fd = fs.openSync(guard, "wx"); }
  catch (error) { throw new Error(`Reservation transaction unavailable at ${guard}: ${error.message}`); }
  try {
    fs.writeFileSync(fd, JSON.stringify({ owner: processIdentity(process.pid) }));
    fs.fsyncSync(fd);
    return action(path.join(root, "reservation.json"));
  } finally { fs.closeSync(fd); fs.unlinkSync(guard); }
}

export function acquire(run, { root = machineRoot, identify = processIdentity, census = vitestProcesses } = {}) {
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
      });
    } };
  });
}

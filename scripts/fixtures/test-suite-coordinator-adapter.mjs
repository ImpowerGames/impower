// Coordinator unit adapter only. Its helper/proof fields are synthetic protocol
// inputs, never OS containment evidence. Actual Job/subreaper behavior and
// cancellation are exercised by test-suite-child and installed API checks.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

export const prepareRuntime = async () => ({ status: "prepared", coordinatorUnitAdapter: true });
export const prepareChild = async value => ({ ...value, status: "prepared", platform: process.platform,
  launchNonce: randomUUID(), proofFile: path.join(value.directory, "tree-proof.json") });

export async function ownedChild({ prepared, reservationToken, onPreparing, onReady, onAuthorize, onStarted }) {
  const helper = { pid: 2147483647, start: "synthetic-coordinator-unit-helper" };
  const metadata = { directory: prepared.directory, attemptId: prepared.attemptId, reservationToken,
    launchNonce: prepared.launchNonce, proofFile: prepared.proofFile, platform: process.platform, launcher: helper, helper };
  let child, actualClose, close, root = null, startedAt, fd, setupError;
  const logFile = path.join(prepared.directory, "output.log");
  try {
    onPreparing(metadata); onReady(metadata); onAuthorize(metadata);
    fd = fs.openSync(logFile, "wx");
    child = spawn(prepared.command, prepared.args, { cwd: prepared.cwd, env: prepared.env,
      stdio: ["ignore", fd, fd], windowsHide: true });
    actualClose = new Promise(resolve => child.once("close", (exit, signal) => resolve({ exit, signal })));
    child.on("error", error => { setupError = error.message; });
    root = { pid: child.pid, start: "synthetic-coordinator-unit-root" }; startedAt = new Date().toISOString();
    onStarted({ ...metadata, root, startedAt });
    const timer = setTimeout(() => child.kill(), 60000);
    try { close = await actualClose; } finally { clearTimeout(timer); }
  } catch (error) {
    if (!child) throw Object.assign(error, { helperLaunched: false });
    setupError = error.message;
    child.kill(); close = await actualClose;
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch (error) { setupError ||= error.message; }
  }
  const status = root ? "exited" : "not-run", finishedAt = new Date().toISOString();
  const proof = { version: 1, ...metadata, root, startedAt, status, exit: root ? close.exit : null,
    signal: root ? close.signal : null, timedOut: false, interrupted: false, finishedAt,
    tree: { mechanism: process.platform === "win32" ? "windows-job" : "linux-subreaper", empty: true,
      observation: root ? process.platform === "win32" ? "active-processes-zero" : "ECHILD" : "no-launch",
      activeProcesses: 0, observedAt: finishedAt }, coordinatorUnitAdapter: true };
  fs.writeFileSync(prepared.proofFile, JSON.stringify(proof));
  return { ...metadata, root, startedAt, status, exit: proof.exit, signal: proof.signal, timedOut: false,
    exitConfirmed: true, fixtureRootClose: close,
    launcherClose: { exit: root ? close.exit === 0 ? 0 : 1 : 75, signal: null }, launchAuthorized: !!root,
    ...(setupError ? { coordinationError: setupError } : {}), coordinatorUnitAdapter: true };
}

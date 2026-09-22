// spawnDetached starts a process that outlives its launcher and, on Windows,
// shows no window even when a console program it starts does not hide itself.
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnDetached } from "./detached-launch.mjs";

const helper = fileURLToPath(new URL("./detached-launch.mjs", import.meta.url));
const recorder = () => {
  const calls = [];
  return { calls, spawn: (...call) => (calls.push(call), { pid: 1 }) };
};

{
  const io = { ...recorder(), platform: "linux" };
  spawnDetached("npm", ["run", "x"], { cwd: "/r", stdio: "ignore", shell: true }, io);
  assert.deepEqual(io.calls, [["npm", ["run", "x"], { cwd: "/r", stdio: "ignore", shell: true, windowsHide: true, detached: true }]]);
  console.log("PASS: POSIX detaches the command itself");
}
{
  const io = { ...recorder(), platform: "win32" };
  spawnDetached("npm", ["run", "x"], { cwd: "C:/r", stdio: "ignore", shell: true }, io);
  assert.deepEqual(io.calls, [[process.execPath, [helper, JSON.stringify({ command: "npm", args: ["run", "x"], shell: true })], { cwd: "C:/r", stdio: "ignore", windowsHide: true, detached: true }]]);
  console.log("PASS: Windows detaches a node wrapper that carries the command");
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "detached-launch-"));
console.log(`scratch directory: ${scratch}`);
const exited = (child) => new Promise((resolve) => child.once("exit", (code) => resolve(code)));
try {
  const log = path.join(scratch, "out.log");
  const fd = fs.openSync(log, "w");
  const child = spawnDetached(process.execPath, ["-e", "console.log('through ' + process.env.MARK); process.exit(23)"], { stdio: ["ignore", fd, fd], env: { ...process.env, MARK: "the wrapper" } });
  fs.closeSync(fd);
  assert.equal(await exited(child), 23);
  assert.equal(fs.readFileSync(log, "utf8").trim(), "through the wrapper");
  console.log("PASS: the exit code, environment and log file pass through");

  if (process.platform === "win32") {
    // The drivers stop a launch with taskkill /T from the recorded pid, which
    // is the wrapper's, so that has to reach the whole tree: here a node and
    // its node children, each recording its pid.
    const pids = path.join(scratch, "pids.txt");
    const record = "require('fs').appendFileSync(process.env.PIDS,process.pid+' ')";
    const leaf = `require('child_process').spawn(process.execPath,['-e',"${record};setInterval(()=>{},1000)"],{stdio:'ignore',windowsHide:true})`;
    const child = spawnDetached(process.execPath, ["-e", `${record};for(let i=0;i<3;i++)${leaf};setInterval(()=>{},1000)`], { stdio: "ignore", env: { ...process.env, PIDS: pids } });
    const deadline = Date.now() + 10_000;
    const recorded = () => (fs.existsSync(pids) ? fs.readFileSync(pids, "utf8").trim().split(/\s+/).filter(Boolean).map(Number) : []);
    while (recorded().length < 4 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(recorded().length, 4, "the tree did not start");
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    await exited(child);
    const alive = recorded().filter((pid) => { try { process.kill(pid, 0); return true; } catch { return false; } });
    assert.deepEqual(alive, [], "taskkill /T from the wrapper's pid left part of the tree running");
    console.log("PASS: taskkill /T from the wrapper's pid stops the whole tree");
  }

  // The window comparison is opt-in: its control opens a real window that takes
  // keyboard focus, which is the defect this helper prevents, so routine check
  // runs skip it. Set DETACHED_LAUNCH_WINDOW_PROBE=1 on Windows to run it.
  if (process.platform === "win32" && process.env.DETACHED_LAUNCH_WINDOW_PROBE === "1") {
    // A shell whose node grandchild titles its console and does not hide
    // itself, which is what npm.cmd and vitest's workers do. The window count
    // comes from EnumWindows, so it sees conhost and Windows Terminal alike.
    const probe = path.join(scratch, "windows.ps1");
    fs.writeFileSync(probe, [
      "param([string]$Marker)",
      'Add-Type @"',
      "using System; using System.Text; using System.Runtime.InteropServices; using System.Collections.Generic;",
      "public static class W {",
      "  delegate bool P(IntPtr h, IntPtr l);",
      '  [DllImport("user32.dll")] static extern bool EnumWindows(P p, IntPtr l);',
      '  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);',
      '  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);',
      "  public static List<string> Visible() { var r = new List<string>(); EnumWindows((h,l)=>{ if (IsWindowVisible(h)) { var s=new StringBuilder(512); GetWindowText(h,s,512); r.Add(s.ToString()); } return true; }, IntPtr.Zero); return r; }",
      "}",
      '"@',
      '@([W]::Visible() | Where-Object { $_ -like "*$Marker*" }).Count',
    ].join("\n"));
    const windows = (marker) => Number(execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", probe, marker], { encoding: "utf8", windowsHide: true }).trim());
    const titled = (marker) => `node -e "process.title='${marker}';setTimeout(()=>{},6000)"`;
    const count = async (launch) => {
      const marker = `detached-launch-${process.pid}-${Date.now()}`;
      const child = launch(titled(marker));
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const seen = windows(marker);
      // The tree ends on its own after six seconds; one already gone is fine.
      try { execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); } catch {}
      return seen;
    };
    // The control proves the probe can see the window this helper prevents.
    const control = await count((command) => spawn(command, { shell: true, stdio: "ignore", windowsHide: true, detached: true }));
    assert.equal(control, 1, "the probe saw no window from a directly detached shell, so it cannot tell a fix from a miss");
    assert.equal(await count((command) => spawnDetached(command, [], { shell: true, stdio: "ignore" })), 0, "a console grandchild of spawnDetached opened a visible window");
    console.log("PASS: a direct detached launch opens 1 window, spawnDetached opens 0");
  } else if (process.platform === "win32") console.log("SKIP: window comparison; set DETACHED_LAUNCH_WINDOW_PROBE=1 to run it");
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}

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
  assert.deepEqual(io.calls, [[process.execPath, [helper, JSON.stringify({ command: "npm", args: ["run", "x"], shell: true, linger: false })], { cwd: "C:/r", stdio: "ignore", windowsHide: true, detached: true }]]);
  console.log("PASS: Windows detaches a node wrapper that carries the command");
}
{
  const io = { ...recorder(), platform: "win32" };
  spawnDetached("npm", [], { stdio: "ignore", linger: true }, io);
  assert.equal(io.calls[0][1][1], JSON.stringify({ command: "npm", args: [], shell: false, linger: true }));
  assert.deepEqual(io.calls[0][2], { stdio: "ignore", windowsHide: true, detached: true });
  const posix = { ...recorder(), platform: "linux" };
  spawnDetached("npm", [], { stdio: "ignore", linger: true }, posix);
  assert.deepEqual(posix.calls, [["npm", [], { stdio: "ignore", shell: false, windowsHide: true, detached: true }]]);
  console.log("PASS: linger travels in the wrapper's argument, and POSIX ignores it");
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

  const here = path.join(scratch, "cwd");
  fs.mkdirSync(here);
  const cwdLog = path.join(scratch, "cwd.log");
  const cwdFd = fs.openSync(cwdLog, "w");
  const inHere = spawnDetached(process.execPath, ["-e", "console.log(process.cwd())"], { cwd: here, stdio: ["ignore", cwdFd, cwdFd] });
  fs.closeSync(cwdFd);
  assert.equal(await exited(inHere), 0);
  assert.equal(fs.realpathSync(fs.readFileSync(cwdLog, "utf8").trim()), fs.realpathSync(here));
  console.log("PASS: the command runs in the caller's cwd");

  if (process.platform === "win32") {
    const pids = path.join(scratch, "pids.txt");
    const record = "require('fs').appendFileSync(process.env.PIDS,process.pid+' ')";
    const leaf = `require('child_process').spawn(process.execPath,['-e',"${record};setInterval(()=>{},1000)"],{stdio:'ignore',windowsHide:true})`;
    const child = spawnDetached(process.execPath, ["-e", `${record};for(let i=0;i<3;i++)${leaf};setInterval(()=>{},1000)`], { stdio: "ignore", linger: true, env: { ...process.env, PIDS: pids } });
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

  if (process.platform === "win32") {
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
      try { execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); } catch {}
      return seen;
    };
    const control = process.env.DETACHED_LAUNCH_WINDOW_PROBE === "1" || process.env.CI === "true"
      ? await count((command) => spawn(command, { shell: true, stdio: "ignore", windowsHide: true, detached: true }))
      : null;
    if (control === 0) console.log("SKIP: the window count; this host opens no window even for a direct detached launch, so the count proves nothing here");
    else {
      if (control !== null) console.log("PASS: the control, a direct detached launch, opens 1 window the probe sees");
      assert.equal(await count((command) => spawnDetached(command, [], { shell: true, stdio: "ignore" })), 0, "a console grandchild of spawnDetached opened a visible window");
      console.log(`PASS: a console grandchild of spawnDetached opens no visible window${control === null ? " (control not run; set DETACHED_LAUNCH_WINDOW_PROBE=1 to check the probe can see one)" : ""}`);
    }
  }
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}

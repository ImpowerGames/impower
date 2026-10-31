import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { linuxProcesses, treeStopped, treeSurvivors, windowsProcessTable } from "../.agents/skills/drive-web-editor/driver.mjs";
import { sessionDir } from "../.agents/skills/drive-web-editor/session-dir.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const skill = path.join(here, "..", ".agents", "skills", "drive-web-editor");
const IS_WIN = process.platform === "win32";
const STATUS_CONTROL_C_EXIT = 0xc000013a;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "dev-preview-"));
const repo = path.join(scratch, "repo");
console.log(`scratch repository: ${repo}`);

const copy = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
};
const launcher = path.join(repo, "scripts", "dev-preview.mjs");
copy(path.join(here, "dev-preview.mjs"), launcher);
copy(path.join(here, "linux-processes.mjs"), path.join(repo, "scripts", "linux-processes.mjs"));
copy(path.join(here, "detached-launch.mjs"), path.join(repo, "scripts", "detached-launch.mjs"));
const driver = path.join(repo, ".agents", "skills", "drive-web-editor", "driver.mjs");
for (const name of ["driver.mjs", "redgreen.mjs", "session-dir.mjs", "worktree-temp.mjs"]) copy(path.join(skill, name), path.join(path.dirname(driver), name));
fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({ private: true, scripts: { "web:dev": "node scripts/dev-preview.mjs --mode same-origin" } }));
fs.writeFileSync(path.join(repo, "server.mjs"), [
  'import fs from "node:fs";',
  'import http from "node:http";',
  'import { spawn } from "node:child_process";',
  "const role = process.argv[2];",
  'const record = () => fs.appendFileSync(process.env.DEV_PREVIEW_ROWS, JSON.stringify({ role, pid: process.pid }) + "\\n");',
  "const idle = () => setInterval(() => {}, 1000);",
  'if (role.endsWith("-worker")) { record(); idle(); }',
  "else {",
  '  spawn(process.execPath, [process.argv[1], role + "-worker"], { stdio: "ignore", windowsHide: true });',
  '  if (role === "editor") http.createServer((request, response) => response.end("ok")).listen(Number(process.env.PORT), record);',
  "  else { record(); idle(); }",
  "}",
].join("\n"));
for (const [dir, role] of [["impower-dev", "editor"], ["sparkdown-player-app", "player"]]) {
  fs.mkdirSync(path.join(repo, dir));
  fs.writeFileSync(path.join(repo, dir, "package.json"), JSON.stringify({ private: true, scripts: { dev: `node ../server.mjs ${role}` } }));
}

const baseEnv = { ...process.env };
for (const name of ["EDITOR_PORT", "PLAYER_PORT", "HMR_PORT", "CLAUDE_CODE_SESSION_ID", "CODEX_THREAD_ID"]) delete baseEnv[name];
const driverEnv = { ...baseEnv, IMPOWER_DRIVER_HOME: path.join(scratch, "home"), IMPOWER_DRIVER_SESSION: "dev-preview-test" };
const stateFile = path.join(sessionDir({ root: repo, session: "dev-preview-test", env: driverEnv }), "state.json");
const record = () => JSON.parse(fs.readFileSync(stateFile, "utf8"));
const runDriver = (file, ...args) => {
  const result = spawnSync(process.execPath, [driver, ...args], { cwd: repo, encoding: "utf8", windowsHide: true, timeout: 180_000, env: { ...driverEnv, DEV_PREVIEW_ROWS: file } });
  return { status: result.status, out: `${result.stdout ?? ""}${result.stderr ?? ""}` };
};
let runs = 0;
const rowsFile = () => path.join(scratch, `rows-${++runs}.jsonl`);
const rows = (file) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : []);
async function serving(file, output = () => "", needReady = false) {
  for (let i = 0; i < 1800; i++) {
    if (rows(file).length === 4 && (!needReady || /Live preview ready/.test(output()))) return;
    await sleep(100);
  }
  throw new Error(`the fixture servers did not start: ${JSON.stringify(rows(file))}\n${output()}`);
}
const collect = (child) => {
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  return () => out;
};
const exitOf = (child) => new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
const within = (promise, ms) => Promise.race([promise, sleep(ms).then(() => null)]);
function startLauncher(file, args = []) {
  const child = spawn(process.execPath, [launcher, "--mode", "same-origin", ...args], {
    cwd: repo,
    env: { ...baseEnv, DEV_PREVIEW_ROWS: file },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    detached: process.platform !== "win32",
  });
  return { child, output: collect(child), exited: exitOf(child) };
}

const trees = [];
async function census(root) {
  if (!IS_WIN) return linuxProcesses().filter((row) => row.group === root);
  const before = await windowsProcessTable();
  trees.push({ before, root });
  return before;
}
const censused = (root) => trees.some((tree) => tree.root === root);
const stopTree = (pid) => spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
async function assertTreeGone(before, root, context) {
  if (!IS_WIN) {
    for (let i = 0; i < 20; i++) {
      const survivors = linuxProcesses().filter((row) => row.state !== "Z" && row.state !== "X" && (row.group === root || before.some((old) => old.pid === row.pid && old.start === row.start)));
      if (!survivors.length) return;
      if (i === 19) assert.fail(`shutdown left Linux descendants: ${JSON.stringify(survivors)}\n${context}`);
      await sleep(100);
    }
    return;
  }
  const result = await treeStopped(before, root, { attempts: 20, waitMs: 500 });
  assert.ok(result.stopped, `${result.reason}\n${context}`);
}

let failures = 0;
const check = async (name, fn) => {
  try {
    await fn();
    console.log(`PASS: ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL: ${name}`);
    console.log(`  ${String(err.message).split("\n").join("\n  ")}`);
  }
};

const ptyScript = path.join(scratch, "pty.ps1");
fs.writeFileSync(ptyScript, [
  "param([string]$Command, [string]$Log)",
  "$ErrorActionPreference = 'Stop'",
  "Add-Type -TypeDefinition @'",
  "using System;",
  "using System.IO;",
  "using System.Text;",
  "using System.Threading;",
  "using System.ComponentModel;",
  "using System.Runtime.InteropServices;",
  "using Microsoft.Win32.SafeHandles;",
  "public static class Pty {",
  "  [StructLayout(LayoutKind.Sequential)] struct COORD { public short X, Y; }",
  "  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct STARTUPINFO { public int cb; public string reserved, desktop, title; public int x,y,xSize,ySize,xCount,yCount,fill,flags; public short show,reserved2; public IntPtr reservedPtr,stdin,stdout,stderr; }",
  "  [StructLayout(LayoutKind.Sequential)] struct STARTUPINFOEX { public STARTUPINFO startup; public IntPtr attributes; }",
  "  [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr process, thread; public int pid, tid; }",
  '  [DllImport("kernel32.dll", SetLastError=true)] static extern bool CreatePipe(out IntPtr read, out IntPtr write, IntPtr attributes, int size);',
  '  [DllImport("kernel32.dll")] static extern int CreatePseudoConsole(COORD size, IntPtr input, IntPtr output, uint flags, out IntPtr console);',
  '  [DllImport("kernel32.dll")] static extern void ClosePseudoConsole(IntPtr console);',
  '  [DllImport("kernel32.dll", SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, int flags, ref IntPtr size);',
  '  [DllImport("kernel32.dll", SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attribute, IntPtr value, IntPtr size, IntPtr previous, IntPtr returned);',
  '  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool CreateProcess(string app, StringBuilder command, IntPtr processAttributes, IntPtr threadAttributes, bool inherit, uint flags, IntPtr environment, string cwd, ref STARTUPINFOEX startup, out PROCESS_INFORMATION info);',
  '  [DllImport("kernel32.dll", SetLastError=true)] static extern bool CloseHandle(IntPtr handle);',
  '  [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle, uint ms);',
  '  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process, out uint code);',
  '  static void Check(bool ok, string what) { if (!ok) throw new Exception(what + ": " + new Win32Exception(Marshal.GetLastWin32Error()).Message); }',
  "  public static void Run(string command, string log) {",
  "    IntPtr inRead, inWrite, outRead, outWrite, console;",
  '    Check(CreatePipe(out inRead, out inWrite, IntPtr.Zero, 0), "CreatePipe");',
  '    Check(CreatePipe(out outRead, out outWrite, IntPtr.Zero, 0), "CreatePipe");',
  "    int result = CreatePseudoConsole(new COORD { X = 120, Y = 30 }, inRead, outWrite, 0, out console);",
  '    if (result != 0) throw new Exception("CreatePseudoConsole: " + new Win32Exception(result).Message);',
  "    CloseHandle(inRead);",
  "    CloseHandle(outWrite);",
  "    // The console blocks its client once the output pipe fills, so drain it.",
  "    var drain = new Thread(() => { using (var source = new FileStream(new SafeFileHandle(outRead, true), FileAccess.Read)) using (var target = File.Create(log)) { try { source.CopyTo(target); } catch (IOException) {} } });",
  "    drain.IsBackground = true;",
  "    drain.Start();",
  "    IntPtr size = IntPtr.Zero;",
  "    InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref size);",
  "    IntPtr list = Marshal.AllocHGlobal(size);",
  '    Check(InitializeProcThreadAttributeList(list, 1, 0, ref size), "InitializeProcThreadAttributeList");',
  '    Check(UpdateProcThreadAttribute(list, 0, (IntPtr)0x00020016, console, (IntPtr)IntPtr.Size, IntPtr.Zero, IntPtr.Zero), "UpdateProcThreadAttribute"); // PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE',
  "    var startup = new STARTUPINFOEX();",
  "    startup.startup.cb = Marshal.SizeOf(typeof(STARTUPINFOEX));",
  "    // STARTF_USESTDHANDLES with no handles: the client's standard handles",
  "    // are the pseudo-console's, not this helper's redirected pipes.",
  "    startup.startup.flags = 0x100;",
  "    startup.attributes = list;",
  "    PROCESS_INFORMATION info;",
  '    Check(CreateProcess(null, new StringBuilder(command), IntPtr.Zero, IntPtr.Zero, false, 0x00080000, IntPtr.Zero, null, ref startup, out info), "CreateProcess"); // EXTENDED_STARTUPINFO_PRESENT',
  '    Console.Out.WriteLine("pid " + info.pid);',
  "    Console.Out.Flush();",
  "    Console.In.ReadLine();",
  "    ClosePseudoConsole(console);",
  "    uint wait = WaitForSingleObject(info.process, 30000);",
  "    uint code;",
  '    Check(GetExitCodeProcess(info.process, out code), "GetExitCodeProcess");',
  '    Console.Out.WriteLine(wait == 0 ? "exit " + code : "still running");',
  "    Console.Out.Flush();",
  "  }",
  "}",
  "'@",
  "[Pty]::Run($Command, $Log)",
].join("\n"));

try {
  const delayedStartup = async (established = "") => {
    let now = 0;
    let output = "";
    const exits = [];
    const timers = [];
    const code = fs.readFileSync(launcher, "utf8").replace(/^import .*;\r?\n/gm, "").replace(/main\(\)\.catch\([\s\S]*$/, "main();").replaceAll("import.meta.url", '"file:///fixture/scripts/dev-preview.mjs"');
    vm.runInNewContext(code, {
      Buffer,
      join: path.join, dirname: path.dirname, fileURLToPath: () => launcher,
      process: { platform: "win32", argv: ["node", "launcher", "--idle-exit-seconds", "900"], env: { EDITOR_PORT: "4000", PLAYER_PORT: "4001", HMR_PORT: "4002" }, stdout: { write: (text) => { output += text; } }, stderr: { write: () => {} }, on: () => {}, exit: (code) => exits.push(code) },
      spawnSync: () => ({ status: 0, stdout: "" }),
      spawn: () => ({ pid: 123, on: () => {}, kill: () => {}, stdout: null, stderr: null }),
      execFile: (command, args, options, done) => done(null, "TCP 127.0.0.1:4000 0.0.0.0:0 LISTENING 123" + established),
      fetch: async () => { if (now < 240_000) throw new Error("still building"); return {}; },
      Date: { now: () => now },
      setTimeout: (fn, delay) => { timers.push({ at: now + delay, fn }); },
    });
    for (let i = 0; i < 20_000 && !exits.length; i++) {
      await Promise.resolve();
      timers.sort((a, b) => a.at - b.at);
      const timer = timers.shift();
      if (timer) { now = timer.at; await timer.fn(); }
      if (now > 1_200_000) break;
    }
    assert.match(output, /Live preview ready/);
    assert.deepEqual(exits, [0], `late readiness must still stop idle servers: ${output}`);
    assert.ok(now >= 1_140_000, "the idle period starts after readiness");
  };
  await check("a build ready after four minutes still acquires its idle watchdog", () => delayedStartup());
  await check("an unrelated outbound source-port collision does not keep an idle launcher running", () => delayedStartup("\nTCP 10.0.0.1:4000 203.0.113.1:443 ESTABLISHED 456"));
  await check("remote clients keep servers alive when either socket or listener ownership is unknown", () => {
    const source = fs.readFileSync(launcher, "utf8");
    const part = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
    const pure = part("const portOf", "const CENSUS") + part("function clientConnections", "function stopWhenIdle");
    const clients = new Function(pure + "; return clientConnections;")();
    const row = { localPort: 4000, foreignPort: 5000, foreignHost: "203.0.113.1", pid: 123 };
    const count = (listeners, established) => clients({ listeners, established: [established] }, [4000]).length;
    assert.equal(count([{ port: 4000, pid: 123 }], row), 1);
    assert.equal(count([{ port: 4000, pid: 123 }], { ...row, pid: NaN }), 1);
    assert.equal(count([{ port: 4000, pid: NaN }], { ...row, pid: 456 }), 1);
    assert.equal(count([], { ...row, pid: 456 }), 1);
    assert.equal(count([{ port: 4000, pid: 123 }], { ...row, pid: 456 }), 0);
  });
  if (IS_WIN || process.platform === "linux") {
    await check("a launcher with an idle exit stops its tree once no client is connected, and not while one is", async () => {
      const file = rowsFile();
      const run = startLauncher(file, ["--idle-exit-seconds", "10"]);
      let before = null;
      try {
        await serving(file, run.output, true);
        const port = Number(run.output().match(/editor\s+http:\/\/localhost:(\d+)/)?.[1]);
        assert.ok(port > 0, `the launcher printed no editor port:\n${run.output()}`);
        const client = net.connect({ port, host: "localhost" });
        await new Promise((resolve, reject) => { client.once("connect", resolve); client.once("error", (error) => reject(new Error(`the client could not connect to the fixture editor: ${error.message}\n${run.output()}`))); });
        before = await census(run.child.pid);
        assert.ok(rows(file).every((row) => before.some((old) => old.pid === row.pid)), "the census must include both servers and their workers");
        assert.equal(await within(run.exited, 14_000), null, `the launcher stopped while a client was connected:\n${run.output()}`);
        client.destroy();
        assert.deepEqual(await within(run.exited, 40_000), { code: 0, signal: null }, `the launcher did not stop itself once the client left:\n${run.output()}`);
        assert.match(run.output(), /Idle exit: no client held a connection to the servers for 10 s/);
        await assertTreeGone(before, run.child.pid, run.output());
      } finally {
        if (!IS_WIN) try { process.kill(-run.child.pid, "SIGKILL"); } catch {}
        else if (run.child.exitCode === null && !censused(run.child.pid)) stopTree(run.child.pid);
      }
    });
  } else {
    console.log("SKIP: the idle exit reads the TCP table through netstat or ss, which only Windows and Linux supply");
  }

  if (IS_WIN) {
    await check("a launcher killed outright leaves no process of its tree running", async () => {
      const file = rowsFile();
      const run = startLauncher(file);
      try {
        await serving(file, run.output, true);
        const before = await census(run.child.pid);
        process.kill(run.child.pid);
        await run.exited;
        await assertTreeGone(before, run.child.pid, run.output());
      } finally {
        if (!censused(run.child.pid) && run.child.exitCode === null) stopTree(run.child.pid);
      }
    });

    await check("closing the launcher's terminal runs its stop and leaves no process of its tree running", async () => {
      const file = rowsFile();
      const command = `"${process.execPath}" "${launcher}" --mode same-origin`;
      const helper = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", ptyScript, command, path.join(scratch, `pty-${runs}.log`)], {
        cwd: repo,
        env: { ...baseEnv, DEV_PREVIEW_ROWS: file },
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      const output = collect(helper);
      const helperExit = exitOf(helper);
      const launcherPid = () => Number(output().match(/^pid (\d+)/m)?.[1]);
      try {
        await serving(file, output);
        const pid = launcherPid();
        assert.ok(pid > 0, `the pseudo-console helper named no launcher pid:\n${output()}`);
        const before = await census(pid);
        helper.stdin.write("close\n");
        assert.ok(await within(helperExit, 45_000), `the pseudo-console helper did not finish:\n${output()}`);
        const code = output().match(/^exit (\d+)/m)?.[1];
        assert.ok(code !== undefined, `the launcher did not exit within 30 s of the close:\n${output()}`);
        assert.equal(Number(code), 0, Number(code) === STATUS_CONTROL_C_EXIT ? "Windows ended the launcher itself (0xC000013A): its SIGHUP stop never ran" : `the launcher exited with ${code}`);
        await assertTreeGone(before, pid, output());
      } finally {
        if (launcherPid() > 0 && !censused(launcherPid()) && helper.exitCode === null) stopTree(launcherPid());
        if (helper.exitCode === null) helper.kill();
      }
    });

    await check("killing the driver's wrapper without its tree leaves no process of that tree running", async () => {
      const file = rowsFile();
      const { out } = runDriver(file, "up");
      const pid = Number(out.match(/launching dev servers \(same-origin\) pid (\d+)/)?.[1]);
      assert.ok(pid > 0, `up named no launcher pid:\n${out}`);
      const before = await census(pid);
      assert.match(out, /READY/, out);
      assert.match(out, /stop themselves after 15 min without a browser connection/, out);
      assert.equal(record().idleExitSeconds, 900, "up did not record the launcher's idle exit");
      await serving(file);
      process.kill(pid);
      await assertTreeGone(before, pid, out);
    });

    await check("up --keep starts a launcher with no idle exit, and down stops its tree", async () => {
      const file = rowsFile();
      const { out } = runDriver(file, "up", "--keep");
      const pid = Number(out.match(/launching dev servers \(same-origin\) pid (\d+)/)?.[1]);
      assert.ok(pid > 0, `up --keep named no launcher pid:\n${out}`);
      const before = await census(pid);
      assert.match(out, /READY/, out);
      assert.doesNotMatch(out, /stop themselves/, out);
      assert.equal(record().idleExitSeconds, undefined, "up --keep recorded an idle exit");
      await serving(file);
      const down = runDriver(file, "down");
      assert.equal(down.status, 0, down.out);
      await assertTreeGone(before, pid, `${out}\n${down.out}`);
    });
    console.log("SKIP: SIGHUP from a signal; Windows delivers a terminal close as CTRL_CLOSE_EVENT, checked above through a pseudo-console");
  } else {
    await check("SIGHUP runs the launcher's stop", async () => {
      const file = rowsFile();
      const run = startLauncher(file);
      try {
        await serving(file, run.output, true);
        const before = process.platform === "linux" ? await census(run.child.pid) : null;
        process.kill(run.child.pid, "SIGHUP");
        const result = await within(run.exited, 15_000);
        assert.deepEqual(result, { code: 0, signal: null }, `the launcher did not stop itself on SIGHUP:\n${run.output()}`);
        if (before) await assertTreeGone(before, run.child.pid, run.output());
      } finally {
        try { process.kill(-run.child.pid, "SIGKILL"); } catch {}
      }
    });
    console.log("SKIP: a launcher killed outright, a closed terminal and a killed driver wrapper; the job object that covers them is Windows-only");
  }
} catch (err) {
  failures++;
  console.log(`FAIL: ${err.message}`);
} finally {
  if (IS_WIN) {
    const now = await windowsProcessTable().catch(() => []);
    for (const { before, root } of trees) for (const { pid } of treeSurvivors(before, now, root) ?? []) stopTree(pid);
    await sleep(500);
  }
  console.log(`Remove scratch repository: ${scratch}`);
  try {
    fs.rmSync(scratch, { recursive: true, force: true });
  } catch (err) {
    console.log(`could not remove ${scratch} (${err.code}); preserve it for recovery`);
  }
}

if (failures) {
  console.log(`${failures} failing`);
  process.exit(1);
}
console.log("all passed");

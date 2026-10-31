import { execFile, spawn, spawnSync } from "node:child_process";
import { linuxProcesses, treeSurvivors, windowsProcessTable } from "./process-table.mjs";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IS_WIN = process.platform === "win32";

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function pickPort(envName) {
  const forced = process.env[envName];
  if (forced) return Number(forced);
  return findFreePort();
}

async function waitForHttp(url, { timeoutMs = 180_000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url, { redirect: "manual" });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  return false;
}

function pipePrefixed(child, label) {
  const prefix = `[${label}] `;
  for (const stream of [child.stdout, child.stderr]) {
    let buf = "";
    stream?.on("data", (chunk) => {
      buf += chunk.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const line of lines) process.stdout.write(prefix + line + "\n");
    });
  }
}

const children = [];

function spawnServer(label, cwd, args, env) {
  const child = spawn("npm", args, {
    cwd: join(ROOT, cwd),
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
    windowsHide: true,
  });
  pipePrefixed(child, label);
  child.on("exit", (code) => {
    process.stdout.write(`[${label}] exited (code ${code})\n`);
    shutdown(code ?? 0);
  });
  children.push(child);
  return child;
}

let shuttingDown = false;
function linuxTree(known = new Map()) {
  const rows = linuxProcesses();
  const owned = new Set([process.pid, ...rows.filter((row) => known.get(row.pid) === row.start).map((row) => row.pid)]);
  let changed;
  do {
    changed = false;
    for (const row of rows) {
      if (!owned.has(row.pid) && (owned.has(row.parent) || row.group === process.pid)) {
        owned.add(row.pid);
        changed = true;
      }
    }
  } while (changed);
  return rows.filter((row) => row.pid !== process.pid && owned.has(row.pid) && row.state !== "Z" && row.state !== "X");
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  const tracked = new Map();
  const stopLinux = (signal) => {
    for (const row of linuxTree(tracked).reverse()) {
      tracked.set(row.pid, row.start);
      try { process.kill(row.pid, signal); }
      catch (error) { if (error.code !== "ESRCH") throw error; }
    }
  };
  if (process.platform === "linux") stopLinux("SIGTERM");
  for (const child of children) {
    if (child.pid == null || child.killed) continue;
    if (IS_WIN) {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else if (process.platform !== "linux") {
      try {
        child.kill("SIGTERM");
      } catch {
      }
    }
  }
  setTimeout(() => {
    if (process.platform === "linux") stopLinux("SIGKILL");
    process.exit(code);
  }, 500);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("SIGHUP", () => shutdown(0));

function jobScript(pid) {
  return [
    "$ErrorActionPreference = 'Stop'",
    "try {",
    "Add-Type -TypeDefinition @'",
    "using System;",
    "using System.ComponentModel;",
    "using System.Runtime.InteropServices;",
    "public static class DevPreviewJob {",
    "  [StructLayout(LayoutKind.Sequential)] struct BASIC_LIMIT { public long processTime, jobTime; public uint flags; public UIntPtr minWorking, maxWorking; public uint activeLimit; public UIntPtr affinity; public uint priority, scheduling; }",
    "  [StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS { public ulong readOps, writeOps, otherOps, readBytes, writeBytes, otherBytes; }",
    "  [StructLayout(LayoutKind.Sequential)] struct EXTENDED_LIMIT { public BASIC_LIMIT basic; public IO_COUNTERS io; public UIntPtr processMemory, jobMemory, peakProcessMemory, peakJobMemory; }",
    '  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);',
    '  [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int type, ref EXTENDED_LIMIT limit, int size);',
    '  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);',
    '  [DllImport("kernel32.dll", SetLastError=true)] static extern bool DuplicateHandle(IntPtr sourceProcess, IntPtr source, IntPtr targetProcess, out IntPtr target, uint access, bool inherit, uint options);',
    '  [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);',
    '  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();',
    '  static void Check(bool ok, string what) { if (!ok) throw new Exception(what + ": " + new Win32Exception(Marshal.GetLastWin32Error()).Message); }',
    "  public static void Bind(int pid) {",
    "    IntPtr job = CreateJobObject(IntPtr.Zero, null);",
    '    Check(job != IntPtr.Zero, "CreateJobObject");',
    "    var limit = new EXTENDED_LIMIT();",
    "    limit.basic.flags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE",
    '    Check(SetInformationJobObject(job, 9, ref limit, Marshal.SizeOf(limit)), "SetInformationJobObject"); // JobObjectExtendedLimitInformation',
    "    IntPtr launcher = OpenProcess(0x0141, false, pid); // PROCESS_DUP_HANDLE | PROCESS_SET_QUOTA | PROCESS_TERMINATE",
    '    Check(launcher != IntPtr.Zero, "OpenProcess");',
    "    // The launcher holds a handle before it joins, so this step exiting",
    "    // never closes the job's last handle on a launcher already inside it.",
    "    IntPtr copy;",
    '    Check(DuplicateHandle(GetCurrentProcess(), job, launcher, out copy, 0, false, 2), "DuplicateHandle"); // DUPLICATE_SAME_ACCESS',
    '    Check(AssignProcessToJobObject(job, launcher), "AssignProcessToJobObject");',
    "  }",
    "}",
    "'@",
    `[DevPreviewJob]::Bind(${pid})`,
    "} catch { $e = $_.Exception; if ($e.InnerException) { $e = $e.InnerException }; [Console]::Out.Write($e.Message); exit 1 }",
  ].join("\n");
}

function joinKillOnCloseJob() {
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(jobScript(process.pid), "utf16le").toString("base64")],
    { encoding: "utf8", windowsHide: true, timeout: 60_000 },
  );
  if (result.status === 0) return null;
  return result.stdout?.trim() || result.error?.message || `PowerShell exited with code ${result.status}`;
}

function parseMode() {
  const i = process.argv.indexOf("--mode");
  const mode = i >= 0 ? process.argv[i + 1] : "same-origin";
  if (mode !== "same-origin" && mode !== "cross-origin") {
    process.stderr.write(
      `Unknown --mode "${mode}" (expected "same-origin" or "cross-origin").\n`,
    );
    process.exit(1);
  }
  return mode;
}

function parseIdleExitSeconds() {
  const i = process.argv.indexOf("--idle-exit-seconds");
  if (i < 0) return null;
  const seconds = Number(process.argv[i + 1]);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    process.stderr.write(`--idle-exit-seconds needs a positive number of seconds, not "${process.argv[i + 1]}".\n`);
    process.exit(1);
  }
  return seconds;
}

const portOf = (address) => Number(address.slice(address.lastIndexOf(":") + 1));
const hostOf = (address) => address.slice(0, address.lastIndexOf(":"));
const loopback = (host) => /^\[?(?:127\.\d+\.\d+\.\d+|::1|::ffff:127\.\d+\.\d+\.\d+)\]?$/.test(host);

function parseNetstat(text) {
  const listeners = [];
  const established = [];
  for (const line of text.split(/\r?\n/)) {
    const [proto, local, foreign, state, pid] = line.trim().split(/\s+/);
    if (proto !== "TCP") continue;
    if (state === "LISTENING") listeners.push({ port: portOf(local), pid: Number(pid) });
    else if (state === "ESTABLISHED") established.push({ localPort: portOf(local), foreignPort: portOf(foreign), foreignHost: hostOf(foreign), pid: Number(pid) });
  }
  return { listeners, established };
}

function parseSs(text) {
  const listeners = [];
  const established = [];
  for (const line of text.split(/\r?\n/)) {
    const [state, , , local, peer, ...rest] = line.trim().split(/\s+/);
    if (!local || !peer) continue;
    const pid = Number(/pid=(\d+)/.exec(rest.join(" "))?.[1] ?? NaN);
    if (state === "LISTEN") listeners.push({ port: portOf(local), pid });
    else if (state === "ESTAB") established.push({ localPort: portOf(local), foreignPort: portOf(peer), foreignHost: hostOf(peer), pid });
  }
  return { listeners, established };
}

const CENSUS = IS_WIN
  ? { command: "netstat", args: ["-ano"], parse: parseNetstat }
  : process.platform === "linux"
    ? { command: "ss", args: ["-Htnap"], parse: parseSs }
    : null;

function readConnections() {
  if (!CENSUS) return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile(CENSUS.command, CENSUS.args, { encoding: "utf8", windowsHide: true, timeout: 20_000, maxBuffer: 64 * 1024 * 1024 }, (error, stdout) => {
      resolve(error ? null : CENSUS.parse(stdout));
    });
  });
}

async function readOwnedProcesses() {
  try {
    const rows = IS_WIN ? await windowsProcessTable() : process.platform === "linux"
      ? linuxProcesses().map((row) => ({ ...row, ppid: row.parent })) : [];
    const owned = treeSurvivors(rows, rows, process.pid);
    if (!owned?.length || owned.some((row) => !/^\d+$/.test(row.start ?? ""))) return null;
    return new Set(owned.map((row) => row.pid));
  } catch {
    return null;
  }
}

function clientConnections(table, ports, owned) {
  if (!owned?.size) return null;
  const listeners = table.listeners.filter((row) => ports.includes(row.port));
  if (!listeners.some((row) => owned.has(row.pid)) || listeners.some((row) => !Number.isInteger(row.pid))) return null;
  const localClient = (row) => ports.includes(row.foreignPort) && loopback(row.foreignHost) && !owned.has(row.pid);
  const remoteClient = (row) => {
    if (!ports.includes(row.localPort) || loopback(row.foreignHost)) return false;
    return !Number.isInteger(row.pid) || owned.has(row.pid);
  };
  return table.established.filter((row) => localClient(row) || remoteClient(row));
}

function stopWhenIdle(seconds, ports) {
  const pollMs = Math.max(250, Math.min(30_000, (seconds * 1000) / 4));
  let idleSince = Date.now();
  let censusFailed = false;
  const poll = async () => {
    if (shuttingDown) return;
    const owned = await readOwnedProcesses();
    const table = await readConnections();
    const clients = table === null ? null : clientConnections(table, ports, owned);
    if (clients === null) {
      if (!censusFailed) process.stdout.write(`\n  ! Idle exit suspended: the process/connection census (${CENSUS ? CENSUS.command : process.platform}) cannot establish the servers' ownership and connections.\n\n`);
      censusFailed = true;
      idleSince = Date.now();
    } else if (clients.length) {
      idleSince = Date.now();
    } else if (Date.now() - idleSince >= seconds * 1000) {
      process.stdout.write(`\n  Idle exit: no client held a connection to the servers for ${seconds} s; stopping both.\n\n`);
      shutdown(0);
      return;
    }
    setTimeout(poll, pollMs);
  };
  setTimeout(poll, pollMs);
}

async function main() {
  const mode = parseMode();
  const idleExitSeconds = parseIdleExitSeconds();
  if (IS_WIN) {
    const problem = joinKillOnCloseJob();
    if (problem) {
      process.stdout.write(
        `\n  ! Could not tie the servers to this launcher (${problem});\n` +
          `    if it is killed rather than stopped, they keep running.\n`,
      );
    }
  }
  const editorPort = await pickPort("EDITOR_PORT");
  const playerPort = await pickPort("PLAYER_PORT");
  const hmrPort = await pickPort("HMR_PORT");

  const editorOrigin = `http://localhost:${editorPort}`;
  const playerOrigin = `http://localhost:${playerPort}`;

  process.stdout.write(
    `\nLaunching live preview (${mode}):\n` +
      `  editor  ${editorOrigin}  (HMR ${hmrPort})\n` +
      `  player  ${playerOrigin}\n\n`,
  );

  if (mode === "same-origin") {
    spawnServer("player", "sparkdown-player-app", ["run", "dev", "--", "--strictPort"], {
      VITE_SAME_ORIGIN_PREVIEW: "1",
      SPARKDOWN_PLAYER_PORT: String(playerPort),
      VITE_SPARKDOWN_EDITOR_ORIGIN: editorOrigin,
    });
  } else {
    spawnServer("player", "sparkdown-player-app", ["run", "dev", "--", "--port", String(playerPort), "--strictPort"], {
      VITE_SPARKDOWN_EDITOR_ORIGIN: editorOrigin,
    });
  }

  if (mode === "same-origin") {
    spawnServer("editor", "impower-dev", ["run", "dev"], {
      PORT: String(editorPort),
      HMR_PORT: String(hmrPort),
      VITE_SAME_ORIGIN_PREVIEW: "1",
      SPARKDOWN_PLAYER_DEV_ORIGIN: playerOrigin,
      VITE_SPARKDOWN_EDITOR_ORIGIN: editorOrigin,
    });
  } else {
    spawnServer("editor", "impower-dev", ["run", "dev"], {
      PORT: String(editorPort),
      HMR_PORT: String(hmrPort),
      VITE_SPARKDOWN_PLAYER_ORIGIN: playerOrigin,
      VITE_SPARKDOWN_EDITOR_ORIGIN: editorOrigin,
    });
  }

  const ready = await waitForHttp(editorOrigin + "/", idleExitSeconds === null ? {} : { timeoutMs: Infinity });
  if (ready) {
    process.stdout.write(
      `\n  ✓ Live preview ready → ${editorOrigin}\n` +
        `    mode: ${mode}` +
        (mode === "same-origin"
          ? " (game DOM reachable via window.__preview)\n"
          : "\n") +
        `    (Ctrl+C stops both servers.)\n` +
        (idleExitSeconds === null ? "\n" : `    (They stop themselves after ${idleExitSeconds} s without a client connection.)\n\n`),
    );
    if (idleExitSeconds !== null) stopWhenIdle(idleExitSeconds, [editorPort, playerPort, hmrPort]);
  } else {
    process.stdout.write(
      `\n  ! Editor did not become ready within the timeout — check the logs above.\n\n`,
    );
  }
}

main().catch((err) => {
  process.stderr.write(String(err?.stack || err) + "\n");
  shutdown(1);
});

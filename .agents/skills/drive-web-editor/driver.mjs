#!/usr/bin/env node

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnDetached } from "../../../scripts/detached-launch.mjs";
import { gitTopLevel, parseRedGreenArgs, runRedGreen, sameDir } from "./redgreen.mjs";
import { PROFILE_CLAIM_FILE, PROFILE_CLAIM_MS, PROFILE_LOCK_STALE_MS, SESSION_VARIABLES, checkoutStateFiles, driverSession, recordCheckoutOwner, sessionDir } from "./session-dir.mjs";

const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SKILL_DIR, "..", "..", "..");
export { SESSION_VARIABLES, driverSession, sessionDir, checkoutStateFiles };
const SESSION = driverSession();
const SESSION_DIR = sessionDir({ root: REPO_ROOT });
const STATE_FILE = path.join(SESSION_DIR, "state.json");
const PREVIOUS_SKILL_DIR = path.resolve(SKILL_DIR, "..", "resolve-issue");
const hereOrPrevious = (name, exists = fs.existsSync) => {
  const here = path.join(SKILL_DIR, name);
  const candidates = [here, path.join(PREVIOUS_SKILL_DIR, name), path.join(REPO_ROOT, ".claude", "skills", "drive-web-editor", name), path.join(REPO_ROOT, ".claude", "skills", "resolve-issue", name)];
  return candidates.find(exists) ?? here;
};
export function chooseStateFile(own = STATE_FILE, legacy = () => hereOrPrevious(".state.json"), exists = fs.existsSync) {
  if (exists(own)) return own;
  const previous = legacy();
  return exists(previous) ? previous : own;
}
const stateFile = () => chooseStateFile();

function takeProfileFlag(argv) {
  const at = argv.indexOf("--profile");
  if (at < 0) return null;
  const dir = argv[at + 1];
  if (!dir || dir.startsWith("--")) {
    console.error("ERROR: --profile needs a directory");
    process.exit(1);
  }
  argv.splice(at, 2);
  return path.resolve(dir);
}
const PROFILE_DIR = takeProfileFlag(process.argv) ?? (process.env.IMPOWER_DRIVER_PROFILE ? path.resolve(process.env.IMPOWER_DRIVER_PROFILE) : path.join(SESSION_DIR, "profile"));

export const CACHE_STORAGE_SUFFIX = 139;
export const WINDOWS_PATH_LIMIT = 259;
export function profilePathProblem(dir, platform = process.platform) {
  if (platform !== "win32") return null;
  const longest = path.win32.resolve(dir).length + CACHE_STORAGE_SUFFIX;
  if (longest <= WINDOWS_PATH_LIMIT) return null;
  return `browser profile ${dir} is too deep: its Cache Storage paths reach about ${longest} characters, past Windows' ${WINDOWS_PATH_LIMIT}, so the service worker cannot install and assets 404. Pass a shorter --profile <dir>, or leave --profile and IMPOWER_DRIVER_PROFILE unset for the short per-session default`;
}

export { PROFILE_CLAIM_FILE, PROFILE_CLAIM_MS };
export function profileClaimConflict(claim, session = SESSION, now = Date.now(), dir = PROFILE_DIR) {
  if (!claim || typeof claim.at !== "number") return null;
  if ((claim.session ?? null) === (session ?? null)) return null;
  if (now - claim.at > PROFILE_CLAIM_MS) return null;
  const minutes = Math.max(0, Math.round((now - claim.at) / 60_000));
  return `browser profile ${dir} was opened ${minutes} min ago by another session (${claim.session ?? "no session identity"}), and its OPFS project may be that session's work. Use your own profile: set IMPOWER_DRIVER_SESSION or pass --profile <dir>; the claim lapses after ${PROFILE_CLAIM_MS / 60_000} min`;
}
export { PROFILE_LOCK_STALE_MS };
export function claimProfile(dir = PROFILE_DIR, { session = SESSION, now = Date.now(), beforeWrite, beforeTakeover } = {}) {
  const file = path.join(dir, PROFILE_CLAIM_FILE);
  const lock = file + ".lock";
  const held = `${process.pid}-${crypto.randomUUID()}`;
  const taken = () => new Error(`another launch is claiming browser profile ${dir} right now (${lock} is held); use your own profile, or retry once it has finished`);
  const holder = () => {
    try {
      return fs.readFileSync(lock, "utf8");
    } catch {
      return null;
    }
  };
  fs.mkdirSync(dir, { recursive: true });
  const take = () => {
    const fd = fs.openSync(lock, "wx");
    fs.writeSync(fd, held);
    return fd;
  };
  let fd;
  try {
    fd = take();
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const other = holder();
    let age = 0;
    try {
      age = now - fs.statSync(lock).mtimeMs;
    } catch {}
    if (age <= PROFILE_LOCK_STALE_MS) throw taken();
    beforeTakeover?.();
    if (other == null || holder() !== other) throw taken();
    try {
      fs.rmSync(lock, { force: true });
      fd = take();
    } catch (again) {
      if (again.code === "EEXIST") throw taken();
      throw again;
    }
  }
  try {
    let claim = null;
    if (fs.existsSync(file)) {
      try {
        claim = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch {
        throw new Error(`profile claim ${file} cannot be read, so whether another session is using ${dir} is unknown; delete the file once no other session is driving this profile`);
      }
    }
    const conflict = profileClaimConflict(claim, session, now, dir);
    if (conflict) throw new Error(conflict);
    beforeWrite?.();
    if (holder() !== held) throw taken();
    const tmp = `${file}.${held}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ session, at: now }));
    fs.renameSync(tmp, file);
  } finally {
    fs.closeSync(fd);
    if (holder() === held) fs.rmSync(lock, { force: true });
  }
}

export function foreignRecord(record, session = SESSION) {
  if (!record || !("session" in record)) return false;
  return (record.session ?? null) !== (session ?? null);
}

function pidAlive(pid, kill = process.kill) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === "EPERM";
  }
}

const READY_WAIT_MS = 15 * 60_000;

const LAUNCH_SLACK_MS = 60_000;
const START_GRAIN_MS = 2_000;
async function recordStands(record, probe = liveProbe) {
  if (!record?.url) return false;
  if (!probe.pidAlive(record.pid)) return false;
  const started = await probe.startedMs(record.pid);
  if (started == null) return false;
  const recorded = record.startedAt ?? probe.recordWrittenMs();
  if (recorded == null) return false;
  return started >= recorded - LAUNCH_SLACK_MS && started <= recorded + START_GRAIN_MS;
}

const liveProbe = {
  pidAlive,
  startedMs: processStartedMs,
  recordWrittenMs: () => {
    try {
      return fs.statSync(stateFile()).mtimeMs;
    } catch {
      return null;
    }
  },
};

function processStartedMs(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return Promise.resolve(null);
  const win = process.platform === "win32";
  const [cmd, args] = win
    ? ["powershell", ["-NoProfile", "-Command", `([DateTimeOffset](Get-Process -Id ${pid}).StartTime).ToUnixTimeMilliseconds()`]]
    : ["ps", ["-o", "lstart=", "-p", String(pid)]];
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("error", () => resolve(null));
    p.on("close", (code) => {
      const text = out.trim();
      const ms = win ? Number(text) : Date.parse(text);
      resolve(code === 0 && text !== "" && Number.isFinite(ms) ? ms : null);
    });
  });
}

const log = (...a) => console.log(...a);
const die = (msg) => {
  console.error("ERROR: " + msg);
  process.exit(1);
};

function readState() {
  const file = stateFile();
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function stateUnreadable() {
  return readState() === null && fs.existsSync(stateFile());
}

function writeState(record) {
  recordCheckoutOwner(REPO_ROOT);
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const tmp = STATE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

export function removeState(file = stateFile(), io = fs) {
  try {
    io.unlinkSync(file);
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error(`Cannot remove state file ${file}: ${error.message}. Preserve the record and resolve its ownership or filesystem error before starting another server.`);
  }
}

export function removeStoppedState(file, { remove = () => removeState(file), log: report = log, fail = (code) => { process.exitCode = code; }, context = "No process was stopped" } = {}) {
  try { remove(); return true; }
  catch (error) { report(`${context}; state cleanup failed: ${error.message} The record is kept. Check ownership, resolve the filesystem error and retry down.`); fail(1); return false; }
}

export function stopExitHandler(file, pid, { remove = () => removeState(file), log: report = log, fail = (code) => { process.exitCode = code; }, verifyStopped } = {}) {
  return (code) => {
    if (code !== 0) {
      const failed = (why) => { report(`could not stop pid ${pid} (exit ${code}${why ? `; ${why}` : ""}); the record is kept`); fail(1); };
      if (!verifyStopped) { failed(); return; }
      return Promise.resolve().then(verifyStopped).catch((error) => ({ stopped: false, reason: `the tree could not be checked: ${error.message}` })).then((check) => {
        if (!check?.stopped) { failed(check?.reason); return; }
        report(`the stop command for pid ${pid} exited ${code}, but no process of the tree it was asked to stop remains`);
        if (removeStoppedState(file, { remove, log: report, fail, context: `Every process of pid ${pid}'s tree is gone` })) report("stopped");
      });
    }
    if (removeStoppedState(file, { remove, log: report, fail, context: `Stop command for pid ${pid} succeeded; server exit has not been independently verified` })) report("stopped");
  };
}

export function windowsProcessTable() {
  const script = "Get-CimInstance Win32_Process | ForEach-Object { '{0} {1} {2}' -f $_.ProcessId, $_.ParentProcessId, $(if ($_.CreationDate) { $_.CreationDate.ToUniversalTime().Ticks } else { '-' }) }";
  return new Promise((resolve, reject) => {
    const p = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("error", reject);
    p.on("close", (code) => {
      const rows = out.split(/\r?\n/).filter(Boolean).map((line) => {
        const [pid, ppid, start] = line.trim().split(" ");
        return { pid: Number(pid), ppid: Number(ppid), start: /^\d+$/.test(start ?? "") ? start : null };
      });
      if (code !== 0 || !rows.length || rows.some((row) => !Number.isSafeInteger(row.pid) || !Number.isSafeInteger(row.ppid))) reject(new Error(`the process census failed (exit ${code})`));
      else resolve(rows);
    });
  });
}

export function treeSurvivors(before, after, root) {
  const rootRow = before.find((row) => row.pid === root);
  if (!rootRow) return null;
  const key = (row) => `${row.pid}:${row.start}`;
  const notAfter = (a, b) => a.start === null || b.start === null || BigInt(a.start) <= BigInt(b.start);
  const rows = [...before, ...after];
  const byPid = new Map();
  for (const row of rows) byPid.set(row.pid, [...(byPid.get(row.pid) ?? []), row]);
  const parentOf = (row) => {
    let parent = null;
    for (const other of byPid.get(row.ppid) ?? []) {
      if (key(other) === key(row) || !notAfter(other, row)) continue;
      if (!parent || (parent.start !== null && other.start !== null && BigInt(other.start) > BigInt(parent.start))) parent = other;
    }
    return parent;
  };
  const tree = new Set([key(rootRow)]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const row of rows) {
      if (tree.has(key(row))) continue;
      const parent = parentOf(row);
      if (!parent || !tree.has(key(parent))) continue;
      tree.add(key(row));
      grew = true;
    }
  }
  const memberPids = new Set([...tree].map((member) => Number(member.split(":")[0])));
  return after.filter((row) => tree.has(key(row)) || (memberPids.has(row.pid) && (row.start === null || tree.has(`${row.pid}:null`))));
}

export async function treeStopped(before, root, { table = windowsProcessTable, attempts = 6, waitMs = 500 } = {}) {
  let survivors = [];
  const known = [...before];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    survivors = treeSurvivors(known, await table(), root);
    if (survivors === null) return { stopped: false, reason: `pid ${root} was not in the process census taken before the stop, so its tree is unknown` };
    for (const row of survivors) if (!known.some((seen) => seen.pid === row.pid && seen.start === row.start)) known.push(row);
    if (!survivors.length) return { stopped: true };
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  return { stopped: false, reason: `pid${survivors.length > 1 ? "s" : ""} ${survivors.map((row) => row.pid).join(", ")} of its tree still run` };
}

export const SYSTEM_CHROMIUM_NAMES = ["chromium", "chromium-browser", "google-chrome"];
export const SYSTEM_CHROMIUM_PATHS = ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"];
const CACHE_REL_PATHS = [
  ["linux", "arm64", "chrome-linux/chrome"],
  ["linux", "x64", "chrome-linux64/chrome"],
  ["win32", null, "chrome-win/chrome.exe"],
  ["win32", null, "chrome-win64/chrome.exe"],
  ["darwin", null, "chrome-mac/Chromium.app/Contents/MacOS/Chromium"],
  ["darwin", "arm64", "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"],
  ["darwin", null, "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"],
  ["linux", "x64", "chrome-headless-shell-linux64/chrome-headless-shell"],
  ["linux", "arm64", "chrome-linux/headless_shell"],
  ["win32", null, "chrome-headless-shell-win64/chrome-headless-shell.exe"],
  ["darwin", "arm64", "chrome-headless-shell-mac-arm64/chrome-headless-shell"],
  ["darwin", null, "chrome-headless-shell-mac-x64/chrome-headless-shell"],
];
export function resolveChromium({ expected, full, env = process.env, platform = process.platform, arch = process.arch, exists = fs.existsSync, readdir = fs.readdirSync } = {}) {
  const p = platform === "win32" ? path.win32 : path.posix;
  const explicit = env.IMPOWER_DRIVER_CHROMIUM;
  if (explicit) {
    if (!exists(explicit)) throw new Error(`IMPOWER_DRIVER_CHROMIUM names ${explicit}, which does not exist; point it at a Chromium executable or unset it`);
    return { executablePath: explicit, source: "explicit", reason: "set by IMPOWER_DRIVER_CHROMIUM" };
  }
  if (expected && exists(expected)) return { executablePath: expected, source: "playwright", reason: "pinned by the installed playwright" };
  const missing = expected ? `pinned build ${expected} is missing` : "playwright names no pinned build";
  const looked = ["IMPOWER_DRIVER_CHROMIUM (unset)", expected ? `${expected} (pinned)` : "no pinned build"];
  if (full && full !== expected) {
    if (exists(full)) return { executablePath: full, source: "pinned-full", reason: `${missing}; using the pinned full build` };
    looked.push(`${full} (pinned full build)`);
  }
  const base = env.PLAYWRIGHT_BROWSERS_PATH;
  if (base) {
    looked.push(p.join(base, "chromium-*"), p.join(base, "chromium_headless_shell-*"));
    if (exists(base)) {
      const dirs = readdir(base)
        .filter((d) => /^chromium(?:_headless_shell)?-\d+$/.test(d))
        .sort((a, b) => Number(b.match(/\d+$/)[0]) - Number(a.match(/\d+$/)[0]));
      for (const dir of dirs) {
        for (const [os, cpu, rel] of CACHE_REL_PATHS) {
          if (os !== platform || (cpu && cpu !== arch)) continue;
          const candidate = p.join(base, dir, ...rel.split("/"));
          if (exists(candidate)) return { executablePath: candidate, source: "cache", reason: `${missing}; using cached ${dir} from PLAYWRIGHT_BROWSERS_PATH` };
        }
      }
    }
  }
  const exe = platform === "win32" ? ".exe" : "";
  for (const dir of (env.PATH ?? env.Path ?? "").split(platform === "win32" ? ";" : ":").filter(Boolean)) {
    for (const name of SYSTEM_CHROMIUM_NAMES) {
      const candidate = p.join(dir, name + exe);
      if (exists(candidate)) return { executablePath: candidate, source: "system", reason: `${missing}; using system ${name} found on PATH` };
    }
  }
  looked.push(`${SYSTEM_CHROMIUM_NAMES.join(", ")} on PATH`);
  if (platform !== "win32") {
    for (const candidate of SYSTEM_CHROMIUM_PATHS) {
      if (exists(candidate)) return { executablePath: candidate, source: "system", reason: `${missing}; using system Chromium at ${candidate}` };
    }
    looked.push(...SYSTEM_CHROMIUM_PATHS);
  }
  throw new Error(`no Chromium found; looked at: ${looked.join("; ")}. Set IMPOWER_DRIVER_CHROMIUM to a Chromium executable, or run \`npx playwright install chromium\``);
}

let chromiumChoice;
export function chromiumChoiceLine(choice = chromiumChoice) {
  return choice ? `${choice.executablePath} (${choice.reason})` : "not resolved";
}
export function pinnedExecutable(full, { headless, platform = process.platform } = {}) {
  if (!headless || !full) return full;
  const p = platform === "win32" ? path.win32 : path.posix;
  const parts = full.split(/[\\/]/);
  const i = parts.findIndex((s) => /^chromium-\d+$/.test(s));
  const plat = i >= 0 ? parts[i + 1]?.match(/^chrome-(.+)$/) : null;
  if (!plat) return full;
  const root = parts.slice(0, i).join(p.sep) || p.sep;
  const shellDir = parts[i].replace("chromium-", "chromium_headless_shell-");
  if (plat[1] === "linux") return p.join(root, shellDir, "chrome-linux", "headless_shell");
  const exe = "chrome-headless-shell" + (platform === "win32" ? ".exe" : "");
  return p.join(root, shellDir, `chrome-headless-shell-${plat[1]}`, exe);
}
function resolveChromiumExecutablePath(chromium, { headless } = {}) {
  const full = chromium.executablePath();
  chromiumChoice = resolveChromium({ expected: pinnedExecutable(full, { headless }), full });
  return chromiumChoice.source === "playwright" ? undefined : chromiumChoice.executablePath;
}

function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "127.0.0.1");
  });
}

async function pickPorts() {
  let h = 0;
  for (const ch of REPO_ROOT + (SESSION ?? "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const base = 38000 + (h % 800) * 4;
  for (let attempt = 0; attempt < 200; attempt++) {
    const p = base + attempt * 4;
    if (p > 65000) break;
    const [a, b, c] = await Promise.all([
      portFree(p),
      portFree(p + 1),
      portFree(p + 2),
    ]);
    if (a && b && c) return { editor: p, player: p + 1, hmr: p + 2 };
  }
  die("could not find 3 consecutive free ports");
}

export function observeLauncherExit(child, report = log) {
  child.once("exit", (code, signal) => {
    report(`dev server launcher pid ${child.pid} exited: code=${code ?? "none"}; signal=${signal ?? "none"}`);
  });
}

export async function up(args) {
  if (stateUnreadable()) {
    die(`state file unreadable: ${stateFile()}; \`down\` removes it, and any servers it recorded keep running`);
  }
  const existing = readState();
  if (existing?.url && (await isUp(existing.url))) {
    log(`already up → ${existing.url}`);
    return;
  }
  if (await recordStands(existing)) {
    log(`servers pid ${existing.pid} are still starting → ${existing.url} (state: ${stateFile()})`);
    if (await waitReady(existing.url, existing.mode, () => pidAlive(existing.pid))) return;
    log(`servers pid ${existing.pid} have exited; launching`);
  }
  removeState();

  const mode = args.includes("--cross-origin") ? "cross-origin" : "same-origin";
  const ports = await pickPorts();
  const url = `http://localhost:${ports.editor}`;

  const child = spawnDetached(
    process.execPath,
    [path.join(REPO_ROOT, "scripts", "dev-preview.mjs"), "--mode", mode],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        EDITOR_PORT: String(ports.editor),
        PLAYER_PORT: String(ports.player),
        HMR_PORT: String(ports.hmr),
      },
      stdio: "ignore",
      linger: true,
    },
  );
  observeLauncherExit(child);
  child.unref();

  writeState({ url, pid: child.pid, mode, ports, startedAt: Date.now(), session: SESSION });

  log(`launching dev servers (${mode}) pid ${child.pid} → ${url}`);
  await waitReady(url, mode);
}

async function waitReady(url, mode, keep) {
  log("COLD build takes 4-8 min (esbuild builds every worker bundle). Waiting...");
  const deadline = Date.now() + READY_WAIT_MS;
  while (Date.now() < deadline) {
    if (keep && !(await keep())) return false;
    if (await isUp(url)) {
      log(`READY ${url}   (mode: ${mode})`);
      return true;
    }
    await sleep(3000);
  }
  die(`timed out after ${READY_WAIT_MS / 60_000} min waiting for ${url}; run \`npm run web:dev\` in this worktree to read the build error, which the detached launcher's own log file never records, and \`down\` stops the tree the state file records, or removes the record if its launcher is gone`);
}

async function isUp(url) {
  try {
    await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(3000) });
    return true;
  } catch {
    return false;
  }
}

async function status(args = []) {
  if (args.includes("--all")) return statusAll();
  const file = stateFile();
  process.exitCode = 1;
  if (stateUnreadable()) {
    log(`unknown (state file unreadable: ${file}; \`down\` removes it)`);
    return;
  }
  const s = readState();
  if (!s) return log("down (no state file)");
  const alive = await isUp(s.url);
  log(`${alive ? "UP" : "DOWN"}  url=${s.url}  pid=${s.pid}  mode=${s.mode}  session=${s.session ?? "none"}  state=${file}`);
  if (alive) process.exitCode = 0;
}

async function statusAll() {
  const legacy = hereOrPrevious(".state.json");
  const files = [...new Set([...checkoutStateFiles(REPO_ROOT), ...(fs.existsSync(legacy) ? [legacy] : [])])];
  const up = [];
  const unreadable = [];
  const down = [];
  for (const file of files) {
    let s = null;
    try {
      s = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {}
    if (!s?.url) {
      unreadable.push(`unknown (state file unreadable: ${file}; \`down\` in its session removes it)`);
      continue;
    }
    const line = `url=${s.url}  pid=${s.pid}  mode=${s.mode}  session=${s.session ?? "none"}  state=${file}`;
    ((await isUp(s.url)) ? up : down).push(line);
  }
  const lines = [...up.map((l) => `UP  ${l}`), ...unreadable, ...(unreadable.length ? [] : down.map((l) => `DOWN  ${l}`))];
  log(lines.length ? lines.join("\n") : "down (no state file)");
  process.exitCode = up.length ? 0 : 1;
}

export function linuxProcesses({ io = fs, uid = process.getuid?.() } = {}) {
  const rows = [];
  for (const name of io.readdirSync("/proc")) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const owner = io.statSync(`/proc/${name}`).uid;
      let stat;
      try { stat = io.readFileSync(`/proc/${name}/stat`, "utf8"); }
      catch (error) {
        if ((error.code === "EACCES" || error.code === "EPERM") && owner !== uid) {
          rows.push({ pid: Number(name), uid: owner, unreadable: true });
          continue;
        }
        throw error;
      }
      const fields = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/);
      rows.push({ pid: Number(name), parent: Number(fields[1]), group: Number(fields[2]), session: Number(fields[3]), state: fields[0], start: fields[19], uid: owner });
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ESRCH") throw error;
    }
  }
  return rows;
}

const runningProcess = (row) => row.state !== "Z" && row.state !== "X";
const sameProcess = (a, b) => a?.pid === b?.pid && a?.start === b?.start && a?.uid === b?.uid;

export async function stopLinuxTree(pid, { read = linuxProcesses, signal = process.kill, uid = process.getuid?.(), self = process.pid, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = Date.now } = {}) {
  if (!Number.isInteger(pid) || pid <= 1 || pid === self) throw new Error("invalid launcher pid");
  const initial = read();
  if (initial.some((row) => row.pid === self && row.group === pid)) throw new Error("caller belongs to the launcher group; refusing to signal itself");
  const leader = initial.find((row) => row.pid === pid && runningProcess(row));
  if (!leader || leader.group !== pid || leader.session !== pid || leader.uid !== uid || !leader.start) throw new Error("launcher does not own an identifiable process group and session");
  const anchors = initial.filter((row) => row.group === pid && runningProcess(row));
  const observed = new Map(anchors.map((row) => [row.pid, row]));
  const members = () => {
    const rows = read();
    if (rows.some((row) => row.pid === self && row.group === pid)) throw new Error("caller belongs to the launcher group; refusing to signal itself");
    if (rows.some((row) => row.unreadable && observed.has(row.pid))) throw new Error("a tracked process became unreadable; the record is kept");
    const group = rows.filter((row) => row.group === pid && runningProcess(row));
    if (group.length && (group.some((row) => row.session !== pid || row.uid !== uid) || !group.some((row) => anchors.some((anchor) => sameProcess(anchor, row))))) throw new Error("process group identity changed; refusing to signal it");
    const currentLeader = rows.find((row) => row.pid === pid && runningProcess(row));
    if (currentLeader && !sameProcess(leader, currentLeader)) throw new Error("launcher identity changed; refusing to signal it");
    for (const row of group) {
      if (!anchors.some((anchor) => sameProcess(anchor, row))) anchors.push(row);
      observed.set(row.pid, row);
    }
    const descendants = new Set(rows.filter((row) => sameProcess(observed.get(row.pid), row)).map((row) => row.pid));
    let changed;
    do {
      changed = false;
      for (const row of rows) if (descendants.has(row.parent) && !descendants.has(row.pid)) { descendants.add(row.pid); observed.set(row.pid, row); changed = true; }
    } while (changed);
    if (rows.some((row) => descendants.has(row.pid) && runningProcess(row) && row.group !== pid)) throw new Error("a launcher descendant left its group; the record is kept for recovery");
    return group;
  };
  const send = (kind) => {
    if (!members().length) return;
    try { signal(-pid, kind); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
  };
  send("SIGTERM");
  const started = now();
  let forced = false;
  while (members().length) {
    if (!forced && now() - started >= 1000) { send("SIGKILL"); forced = true; }
    if (now() - started >= 5000) throw new Error("launcher group still has running processes after shutdown");
    await sleep(50);
  }
}

async function down(args = []) {
  const file = stateFile();
  const s = readState();
  if (foreignRecord(s) && !args.includes("--force")) {
    log(`servers pid ${s.pid} in ${file} were launched by another session (${s.session ?? "no session identity"}); they keep running. \`down --force\` stops them anyway`);
    process.exitCode = 1;
    return;
  }
  if (s?.pid == null) {
    if (fs.existsSync(file)) {
      if (!removeStoppedState(file, { remove: removeState, context: "No pid could be identified; no process was stopped" })) return;
      log(`removed ${file}, which recorded no pid to stop; servers it belonged to keep running`);
    } else {
      log("nothing to stop");
    }
    return;
  }
  if (!(await recordStands(s))) {
    if (!removeStoppedState(file, { remove: removeState, context: "The record no longer identifies its original server; no process was stopped" })) return;
    log(`removed ${file}: pid ${s.pid} is no longer the launcher it recorded (that process exited, and the system may have reused its pid), so nothing was stopped`);
    return;
  }
  if (process.platform === "linux") {
    try {
      await stopLinuxTree(s.pid);
      if (removeStoppedState(file, { context: "Launcher group exited" })) log("stopped");
    } catch (error) {
      log(`could not stop pid ${s.pid} (${error.message}); the record is kept`);
      process.exitCode = 1;
    }
    return;
  }
  let tree = null;
  if (process.platform === "win32") {
    try { tree = await windowsProcessTable(); }
    catch (error) { log(`the process tree could not be listed before the stop (${error.message}); a nonzero taskkill exit will not be checked`); }
  }
  const killer =
    process.platform === "win32"
      ? spawn("taskkill", ["/pid", String(s.pid), "/T", "/F"], {
          stdio: "inherit",
          windowsHide: true,
        })
      : spawn("kill", ["-TERM", String(-s.pid)], { stdio: "inherit", windowsHide: true });
  const failed = (why) => {
    log(`could not stop pid ${s.pid} (${why}); the record is kept`);
    process.exitCode = 1;
  };
  killer.on("error", (err) => failed(err.message));
  killer.on("exit", stopExitHandler(file, s.pid, { remove: removeState, log, verifyStopped: tree ? () => treeStopped(tree, s.pid) : undefined }));
}

async function preflight(args = []) {
  const unknown = args.filter((arg) => arg !== "--tooling-only");
  if (unknown.length) die(`preflight takes only --tooling-only; got ${unknown.join(" ")}`);
  const toolingOnly = args.includes("--tooling-only");
  let ok = true;
  const say = (good, label, detail) => {
    if (!good) ok = false;
    console.log(`${good ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
  };

  const free = await freeBytesOnRepoDrive();
  say(
    free == null || free > 6e9,
    "disk headroom",
    free == null ? "could not measure" : `${(free / 1e9).toFixed(1)} GB free (need ~6 GB for a fresh worktree install)`,
  );

  if (toolingOnly) console.log("SKIP  playwright chromium  — --tooling-only: nothing to boot");
  else try {
    const { chromium } = await importPlaywright();
    const executablePath = resolveChromiumExecutablePath(chromium, { headless: true });
    const b = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    await b.close();
    say(true, "playwright chromium", `launches ${chromiumChoiceLine()}`);
  } catch (e) {
    say(false, "playwright chromium", String(e.message).split("\n")[0]);
  }

  say(await cmdOk("gh", ["auth", "status"]), "gh auth", "needed to read the issue and open the PR");
  say(await cmdOk("git", ["rev-parse", "--git-dir"]), "git repo", REPO_ROOT);

  if (toolingOnly) console.log("SKIP  node_modules  — --tooling-only: no install needed");
  else {
    const install = await installHealth();
    say(install.ok, "node_modules", install.detail);
  }

  process.exitCode = ok ? 0 : 1;
}

async function installHealth(root = REPO_ROOT, run = cmdOk) {
  if (!fs.existsSync(path.join(root, "node_modules"))) {
    return {
      ok: true,
      detail: "not installed — fine for a change with nothing to boot; otherwise `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install` at this worktree's root (a bare npm install fails on a Chromium download this network blocks)",
    };
  }
  const broken = [];
  for (const tool of ["esbuild", "vitest"]) {
    if (!(await run("npx", [tool, "--version"]))) broken.push(tool);
  }
  if (broken.length === 0) return { ok: true, detail: "esbuild and vitest both run" };
  return {
    ok: false,
    detail: `${broken.join(" and ")} cannot run, so node_modules is corrupt — a full disk truncates binaries and empties package directories without npm saying so. Repair it in one pass rather than piecemeal: \`npm cache clean --force\`, delete every node_modules (the root's and every workspace's), then \`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install\` once`,
  };
}

function freeBytesOnRepoDrive() {
  return new Promise((resolve) => {
    if (process.platform !== "win32") return resolve(null);
    const drive = path.parse(REPO_ROOT).root.replace(/\\$/, "");
    const ps = spawn(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `(Get-PSDrive -Name '${drive.replace(":", "")}').Free`,
      ],
      { windowsHide: true },
    );
    let out = "";
    ps.stdout.on("data", (d) => (out += d));
    ps.on("close", () => {
      const n = Number(out.trim());
      resolve(Number.isFinite(n) && n > 0 ? n : null);
    });
    ps.on("error", () => resolve(null));
  });
}

function cmdOk(cmd, args) {
  return new Promise((resolve) => {
    const c = spawn(cmd, args, {
      stdio: "ignore",
      shell: true,
      windowsHide: true,
      cwd: REPO_ROOT,
    });
    c.on("close", (code) => resolve(code === 0));
    c.on("error", () => resolve(false));
  });
}

async function importPlaywright() {
  try {
    return await import("playwright");
  } catch (err) {
    throw new Error(
      `playwright could not be resolved from ${SKILL_DIR}: ` +
        "run the driver at its committed path inside the repo tree (Node resolves playwright from the script's own " +
        "directory, so a copy in a temp directory always fails here), and install the worktree's dependencies with " +
        `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install at its root. (${String(err.message || err).split("\n")[0]})`,
    );
  }
}

export async function launchEditorBrowser({ headless, dir = PROFILE_DIR, platform = process.platform, playwright = importPlaywright }) {
  const tooDeep = profilePathProblem(dir, platform);
  if (tooDeep) throw new Error(tooDeep);
  if (dir === path.join(SESSION_DIR, "profile")) recordCheckoutOwner(REPO_ROOT);
  claimProfile(dir);
  const { chromium } = await playwright();
  const executablePath = resolveChromiumExecutablePath(chromium, { headless });
  log(`browser: ${chromiumChoiceLine()}`);
  return chromium.launchPersistentContext(dir, {
    headless,
    viewport: { width: 1600, height: 1000 },
    args: ["--autoplay-policy=no-user-gesture-required"],
    ...(executablePath ? { executablePath } : {}),
  });
}

const EDITOR_NAVIGATION = { waitUntil: "domcontentloaded", timeout: 120_000 };
async function openEditorPage(page, url) {
  return page.goto(url, EDITOR_NAVIGATION);
}
async function reloadEditorPage(page) {
  return page.reload(EDITOR_NAVIGATION);
}

async function reportFreshWorker(...args) {
  const worker = await import("./worker-report.mjs");
  return worker.reportFreshWorker(...args);
}

async function withEditor(fn, { headless = true, launch = launchEditorBrowser, state = readState } = {}) {
  const record = state();
  if (!record?.url)
    die(
      "no editor URL — run `node .agents/skills/drive-web-editor/driver.mjs up` first. Servers launched by hand, or by " +
        "`npm run web:dev` in another shell, are not driven from here, and a hand-launched pair is where a fully black " +
        "Game Preview beside a healthy-looking editor pane comes from: the editor and the player agree over a handshake " +
        "whose values are baked into each bundle at build time, so a reload cannot fix a mismatched one.",
    );
  const { url } = record;
  const mode = record.mode ?? "same-origin";
  const ctx = await launch({ headless });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const consoleLines = [];
  const cleanups = [];
  page.on("console", (m) => consoleLines.push(consoleLine(m)));
  page.on("pageerror", (e) => consoleLines.push(`[pageerror] ${e.message}`));
  try {
    return await fn({ page, ctx, url, consoleLines, mode, cleanups });
  } finally {
    for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
    await ctx.close();
  }
}

async function writeMainSd(page, source) {
  await waitForProtocol(page);
  return page.evaluate(async (src) => {
    const bridge = window.__editorProtocol;
    const project = await bridge.send({ jsonrpc: "2.0", id: crypto.randomUUID(), method: "window/loadedProjectId", params: {} });
    if (project.id !== "local") throw new Error("Refusing to write main.sd into a different loaded project");
    await bridge.send({ jsonrpc: "2.0", id: crypto.randomUUID(), method: "workspace/willCreateFiles", params: {
      files: [{ uri: "file://local/main.sd", data: new TextEncoder().encode(src).buffer }],
    } });
    return src.length;
  }, source);
}

const SEED_BATCH_BYTES = 8 * 1024 * 1024;

const SEED_LIMITS = { files: 20_000, dirs: 20_000, bytes: 1024 * 1024 * 1024, fileBytes: 256 * 1024 * 1024 };

const REFUSED_DIRS = ["node_modules", "dist"];

const SEED_MARKER = ".seeding";

const PROJECT_ID_KEY = "project";
const LOCAL_PROJECT_ID = "local";

function refusedDirError(rel) {
  return new Error(`the project holds ${rel}/, which a project never does; point --project at the project directory itself`);
}

function walkProjectDir(dir, limits = SEED_LIMITS) {
  const files = [];
  const failed = [];
  const inside = [];
  let skipped = 0;
  let bytes = 0;
  let entered = 0;
  const realpath = (abs) => {
    try {
      return fs.realpathSync(abs);
    } catch {
      return abs;
    }
  };
  const leadsBack = (real) => {
    const prefix = real.endsWith(path.sep) ? real : real + path.sep;
    return inside.some((p) => p === real || p.startsWith(prefix));
  };
  const visit = (abs, rel) => {
    entered += 1;
    if (entered > limits.dirs) throw new Error(`the project has more than ${limits.dirs} directories, the bound on a seed (reached at ${rel})`);
    inside.push(realpath(abs));
    try {
      for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) {
          skipped += 1;
          continue;
        }
        const nextAbs = path.join(abs, entry.name);
        const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
        let stat;
        try {
          stat = fs.statSync(nextAbs);
        } catch (err) {
          failed.push({ path: nextRel, reason: `cannot be read (${err?.code ?? String(err?.message ?? err)})` });
          continue;
        }
        if (stat.isDirectory()) {
          if (REFUSED_DIRS.includes(entry.name)) throw refusedDirError(nextRel);
          if (leadsBack(realpath(nextAbs))) {
            failed.push({ path: nextRel, reason: "links back to a directory the walk is inside, or to one above it" });
            continue;
          }
          visit(nextAbs, nextRel);
        } else if (stat.isFile()) {
          if (stat.size > limits.fileBytes) throw new Error(`${nextRel} is ${stat.size} bytes, over the ${limits.fileBytes}-byte bound on one file`);
          bytes += stat.size;
          if (bytes > limits.bytes) throw new Error(`the project is over the ${limits.bytes}-byte bound on a seed (reached at ${nextRel})`);
          if (files.length >= limits.files) throw new Error(`the project has more than ${limits.files} files, the bound on a seed (reached at ${nextRel})`);
          files.push({ path: nextRel, bytes: fs.readFileSync(nextAbs) });
        } else {
          failed.push({ path: nextRel, reason: "is neither a file nor a directory" });
        }
      }
    } finally {
      inside.pop();
    }
  };
  visit(dir, "");
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files, skipped, failed };
}

function zipEntryPath(name) {
  const normalized = name.replace(/\\/g, "/");
  if (normalized.endsWith("/")) return { path: null };
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(`zip entry "${name}" is not a relative path`);
  }
  const segments = normalized.split("/").filter((s) => s !== "" && s !== ".");
  if (segments.length === 0) return { path: null };
  if (segments.some((s) => s === "..")) throw new Error(`zip entry "${name}" climbs out of the project`);
  if (segments.some((s) => s.startsWith("."))) return { path: null, skipped: true };
  const refused = segments.slice(0, -1).find((s) => REFUSED_DIRS.includes(s));
  if (refused) throw refusedDirError(segments.slice(0, segments.indexOf(refused) + 1).join("/"));
  return { path: segments.join("/") };
}

export function zipProjectEntries(archive) {
  let entries = [];
  const paths = new Set();
  let skipped = 0;
  let unwrapped;
  let kept;
  for (const [name, bytes] of Object.entries(archive)) {
    const read = zipEntryPath(name);
    if (read.skipped) skipped += 1;
    if (read.path == null) continue;
    if (paths.has(read.path)) throw new Error(`the zip holds duplicate normalized path "${read.path}"`);
    paths.add(read.path);
    entries.push({ path: read.path, bytes });
  }
  const dirs = new Set();
  for (const e of entries) {
    const s = e.path.split("/");
    for (let i = 1; i < s.length; i++) dirs.add(s.slice(0, i).join("/"));
  }
  const clash = entries.find((e) => dirs.has(e.path));
  if (clash) throw new Error(`the zip holds both a file and a directory named "${clash.path}"`);
  if (entries.length > 0) {
    const first = entries[0].path.split("/")[0];
    if (entries.every((e) => e.path.startsWith(`${first}/`))) {
      if (entries.some((e) => e.path === `${first}/main.sd`)) {
        unwrapped = first;
        entries = entries.map((e) => ({ path: e.path.slice(first.length + 1), bytes: e.bytes }));
      } else {
        kept = first;
      }
    }
  }
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files: entries, skipped, failed: [], ...(unwrapped ? { unwrapped } : {}), ...(kept ? { kept } : {}) };
}

async function collectProject(source, limits = SEED_LIMITS) {
  const abs = path.resolve(source);
  if (!fs.existsSync(abs)) throw new Error(`--project ${source} does not exist (resolved to ${abs})`);
  const stat = fs.statSync(abs);
  if (stat.isDirectory()) return { kind: "directory", ...walkProjectDir(abs, limits) };
  if (!/\.zip$/i.test(abs)) throw new Error(`--project ${source} is neither a directory nor a .zip file`);
  if (stat.size > limits.bytes) throw new Error(`--project ${source} is ${stat.size} bytes, over the ${limits.bytes}-byte bound on a seed`);
  let unzipSync;
  try {
    ({ unzipSync } = await import("fflate"));
  } catch {
    throw new Error("unpacking a zip needs the fflate package, which the workspace install at the repo root puts under node_modules/fflate");
  }
  let bytes = 0;
  let count = 0;
  let skipped = 0;
  const refused = (err) => Object.assign(err, { seedRefused: true });
  const filter = (entry) => {
    let read;
    try {
      read = zipEntryPath(entry.name);
    } catch (err) {
      throw refused(err);
    }
    if (read.skipped) skipped += 1;
    if (read.path == null) return false;
    if (entry.originalSize > limits.fileBytes) throw refused(new Error(`${read.path} is ${entry.originalSize} bytes, over the ${limits.fileBytes}-byte bound on one file`));
    bytes += entry.originalSize;
    if (bytes > limits.bytes) throw refused(new Error(`the project is over the ${limits.bytes}-byte bound on a seed (reached at ${read.path})`));
    count += 1;
    if (count > limits.files) throw refused(new Error(`the project has more than ${limits.files} files, the bound on a seed (reached at ${read.path})`));
    return true;
  };
  let archive;
  try {
    archive = unzipSync(new Uint8Array(fs.readFileSync(abs)), { filter });
  } catch (err) {
    if (err?.seedRefused) throw err;
    throw new Error(`--project ${source} could not be unpacked as a zip (${String(err?.message ?? err).split("\n")[0]})`);
  }
  const entries = zipProjectEntries(archive);
  return { kind: "zip", ...entries, skipped: skipped + entries.skipped };
}

export function planBatches(files, maxBytes = SEED_BATCH_BYTES) {
  const batches = [];
  let current = [];
  let size = 0;
  for (const file of files) {
    const length = file.bytes.length;
    if (current.length > 0 && size + length > maxBytes) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(file);
    size += length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

async function rememberedProject({ key }) {
  return localStorage.getItem(key);
}

async function beginSeed({ project, marker, create = true }) {
  const root = await navigator.storage.getDirectory();
  let dir;
  try {
    dir = await root.getDirectoryHandle(project, { create });
  } catch (err) {
    if (!create && err?.name === "NotFoundError") return { interrupted: false, missing: true };
    throw err;
  }
  let interrupted = false;
  try {
    await dir.getFileHandle(marker, { create: false });
    interrupted = true;
  } catch {
  }
  await dir.getFileHandle(marker, { create: true });
  return { interrupted };
}

async function seedInterrupted({ project, marker }) {
  const root = await navigator.storage.getDirectory();
  try {
    const dir = await root.getDirectoryHandle(project, { create: false });
    await dir.getFileHandle(marker, { create: false });
    return true;
  } catch {
    return false;
  }
}

async function kindClashes({ project, files, dirs }) {
  const root = await navigator.storage.getDirectory();
  const fileSet = new Set(files);
  const dirSet = new Set(dirs);
  const clashes = [];
  let dir;
  try {
    dir = await root.getDirectoryHandle(project, { create: false });
  } catch (err) {
    if (err?.name === "NotFoundError") return clashes;
    throw err;
  }
  const visit = async (handle, prefix) => {
    for await (const [name, child] of handle.entries()) {
      const rel = prefix ? `${prefix}/${name}` : name;
      if (child.kind === "file" && dirSet.has(rel)) clashes.push({ path: rel, storage: "file", source: "directory" });
      else if (child.kind === "directory" && fileSet.has(rel)) clashes.push({ path: rel, storage: "directory", source: "file" });
      else if (child.kind === "directory" && dirSet.has(rel)) await visit(child, rel);
    }
  };
  await visit(dir, "");
  return clashes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

async function writeProjectBatch({ project, entries, archive }) {
  const bridge = window.__editorProtocol;
  if (!bridge) throw new Error("Editor protocol bridge is not ready");
  const send = (method, params) => bridge.send({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params });
  const loaded = await send("window/loadedProjectId", {});
  if (loaded.id !== project) throw new Error("Refusing to seed a project that is not loaded");
  let data = archive;
  if (typeof archive === "string") {
    const binary = atob(archive);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    data = bytes.buffer;
  }
  const files = await send("workspace/unzipFiles", { data });
  const written = [], failed = [];
  const expectedFiles = new Set(entries.map(entry => entry.path));
  const returnedFiles = new Set(files.map(file => file.filename));
  for (const file of files) {
    if (!expectedFiles.has(file.filename)) throw new Error("Archive returned an unexpected file: " + file.filename);
  }
  const importFile = async ({ filename, data }, index) => {
    const uri = "file://" + project + "/" + filename;
    try {
      const originalSize = data.byteLength;
      const created = await send("workspace/willCreateFiles", { files: [{ uri, data }] });
      const size = created.find(file => file.uri === uri)?.size ?? originalSize;
      const readBack = await send("workspace/readFile", { file: { uri } });
      if (readBack.byteLength !== size) throw new Error(`wrote ${size} bytes but the file reads back as ${readBack.byteLength}`);
      written[index] = { path: filename, bytes: readBack.byteLength };
    } catch (error) {
      failed[index] = { path: filename, reason: error.name && error.name !== "Error" ? `${error.name}: ${error.message}` : String(error.message || error) };
    }
  };
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(8, files.length) }, async () => {
    while (next < files.length) {
      const index = next++;
      await importFile(files[index], index);
    }
  }));
  for (const entry of entries) {
    if (!returnedFiles.has(entry.path)) failed.push({ path: entry.path, reason: "Archive did not return the expected file" });
  }
  return { written: written.filter(Boolean), failed: failed.filter(Boolean) };
}

async function pruneProject({ project, keep, marker }) {
  const root = await navigator.storage.getDirectory();
  const files = new Set(keep);
  const dirs = new Set();
  for (const p of keep) {
    const s = p.split("/");
    for (let i = 1; i < s.length; i++) dirs.add(s.slice(0, i).join("/"));
  }
  const removed = [];
  const failed = [];
  const why = (err) => (err?.name && err.name !== "Error" ? `${err.name}: ${err.message}` : String(err?.message ?? err));
  let dir;
  try {
    dir = await root.getDirectoryHandle(project, { create: false });
  } catch (err) {
    if (err?.name === "NotFoundError") return { removed, failed, missing: true };
    throw err;
  }
  const visit = async (handle, prefix) => {
    const names = [];
    try {
      for await (const [name, child] of handle.entries()) names.push([name, child.kind]);
    } catch (err) {
      failed.push({ path: prefix || project, reason: `could not be listed: ${why(err)}` });
      return;
    }
    for (const [name, kind] of names) {
      if (name.startsWith(".")) continue;
      const rel = prefix ? `${prefix}/${name}` : name;
      try {
        if (kind === "directory" && dirs.has(rel)) {
          await visit(await handle.getDirectoryHandle(name, { create: false }), rel);
          continue;
        }
        if (kind === "file" && files.has(rel)) continue;
        await handle.removeEntry(name, { recursive: true });
        removed.push(rel);
      } catch (err) {
        failed.push({ path: rel, reason: why(err) });
      }
    }
  };
  await visit(dir, "");
  if (failed.length === 0) {
    try {
      await dir.removeEntry(marker);
    } catch (err) {
      if (err?.name !== "NotFoundError") failed.push({ path: marker, reason: why(err) });
    }
  }
  return { removed: removed.sort(), failed };
}

async function readProjectFile({ project, path: filePath }) {
  const root = await navigator.storage.getDirectory();
  try {
    const segments = filePath.split("/");
    const name = segments.pop();
    let dir = await root.getDirectoryHandle(project, { create: false });
    for (const segment of segments) dir = await dir.getDirectoryHandle(segment, { create: false });
    const file = await (await dir.getFileHandle(name, { create: false })).getFile();
    const bytes = new Uint8Array(await file.arrayBuffer());
    let text = "";
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(text);
  } catch {
    return null;
  }
}

async function loadedScript(page, wroteThisRun, project = LOCAL_PROJECT_ID, file = "main.sd") {
  let encoded = null;
  try {
    encoded = await page.evaluate(readProjectFile, { project, path: file });
  } catch (err) {
    return { file, wroteThisRun, read: false, reason: String(err.message || err).split("\n")[0] };
  }
  if (encoded === null) return { file, wroteThisRun, present: false };
  const text = Buffer.from(encoded, "base64").toString("utf8");
  return {
    file,
    wroteThisRun,
    present: true,
    chars: text.length,
    sha: crypto.createHash("sha256").update(text).digest("hex").slice(0, 12),
    firstLine: text.split(/\r?\n/).find((line) => line.trim()) ?? "",
  };
}

function consoleLine(m) {
  const text = m.text();
  const url = m.type() === "error" ? (m.location?.()?.url ?? "") : "";
  return `[${m.type()}] ${text}${url && !text.includes(url) ? ` (${url})` : ""}`;
}

const KNOWN_CONSOLE_NOISE = [
  { name: "/api/auth/account 404", match: /Failed to load resource: the server responded with a status of 404\b[^\n]*\(https?:\/\/[^/\s)]+\/api\/auth\/account(?:[?#][^\s)]*)?\)$/ },
];

function partitionConsole(lines, known = KNOWN_CONSOLE_NOISE, limit = 25) {
  const errors = [];
  const noise = {};
  for (const name of known.map((n) => n.name)) noise[name] = 0;
  for (const line of lines) {
    if (!line.startsWith("[error]") && !line.startsWith("[pageerror]")) continue;
    const known_ = known.find((n) => n.match.test(line));
    if (known_) noise[known_.name] += 1;
    else errors.push(line);
  }
  return { errors: errors.slice(0, limit), noise };
}

async function interruptedSeed(page, project = LOCAL_PROJECT_ID) {
  return page.evaluate(seedInterrupted, { project, marker: SEED_MARKER });
}

function interruptedSeedError(project = LOCAL_PROJECT_ID) {
  return `an earlier --project seed did not finish (${project}/${SEED_MARKER} is in storage), so the project in storage is the previous project with part of that seed over it and nothing seen on it is evidence. Re-run with --project to seed it again, or empty it with seed --clear.`;
}

function describeError(err) {
  const message = String(err?.message ?? err).split("\n")[0];
  return err?.name && err.name !== "Error" && !message.startsWith(err.name) ? `${err.name}: ${message}` : message;
}

async function otherProjectRemembered(page, project) {
  const remembered = await page.evaluate(rememberedProject, { key: PROJECT_ID_KEY });
  if (remembered == null || remembered === project) return null;
  return `the editor remembers project "${remembered}" (localStorage "${PROJECT_ID_KEY}"), not "${project}", so it would open a project`;
}

async function clearProject(page, { project = LOCAL_PROJECT_ID } = {}) {
  const report = { project, removed: [], failed: [] };
  try {
    const other = await otherProjectRemembered(page, project);
    if (other) {
      report.reason = `${other} the clear does not touch; nothing was removed`;
      return report;
    }
    if (await page.evaluate(seedInterrupted, { project, marker: SEED_MARKER })) report.interruptedBefore = true;
    const begun = await page.evaluate(beginSeed, { project, marker: SEED_MARKER, create: false });
    if (begun.missing) {
      report.missing = true;
      return report;
    }
    const out = await page.evaluate(pruneProject, { project, keep: [], marker: SEED_MARKER });
    report.removed = out.removed;
    report.failed = out.failed;
  } catch (err) {
    report.reason = `the project could not be cleared: ${describeError(err)}`;
    return report;
  }
  if (report.failed.length > 0) {
    const first = report.failed[0];
    report.reason = `${report.failed.length} of the project's entries could not be removed (first: ${first.path}: ${first.reason}); ${report.removed.length} went, and ${project}/${SEED_MARKER} marks the project as a mix`;
  }
  return report;
}

async function packProjectBatch(batch) {
  const { zipSync } = await import("fflate");
  return Buffer.from(zipSync(Object.fromEntries(batch.map((file) => [file.path, file.bytes])), { level: 0 })).toString("base64");
}

async function sendProjectBatch(page, { project, entries, archive }) {
  const chunkChars = 4 * 1024 * 1024;
  if (archive.length <= chunkChars) return page.evaluate(writeProjectBatch, { project, entries, archive });
  const length = archive.length / 4 * 3 - (archive.endsWith("==") ? 2 : archive.endsWith("=") ? 1 : 0);
  const handle = await page.evaluateHandle((length) => new ArrayBuffer(length), length);
  try {
    for (let start = 0; start < archive.length; start += chunkChars) {
      await handle.evaluate((buffer, { chunk, offset }) => {
        const decoded = atob(chunk);
        const bytes = new Uint8Array(buffer, offset, decoded.length);
        for (let index = 0; index < decoded.length; index++) bytes[index] = decoded.charCodeAt(index);
      }, { chunk: archive.slice(start, start + chunkChars), offset: start / 4 * 3 });
    }
    return await page.evaluate(writeProjectBatch, { project, entries, archive: handle });
  } finally { await handle.dispose(); }
}

async function seedProject(page, source, { project = LOCAL_PROJECT_ID, batchBytes = SEED_BATCH_BYTES, collect = collectProject, expectMainSd = true, limits = SEED_LIMITS, clear = false, pack = packProjectBatch } = {}) {
  const started = Date.now();
  const report = { source: path.resolve(source), project, storage: "untouched", files: 0, bytes: 0, batches: 0, skipped: 0, removed: [], failed: [], mainSd: false, pruned: false };
  const done = (reason) => {
    if (reason) report.reason = reason;
    report.ms = Date.now() - started;
    return report;
  };
  const firstLine = describeError;
  const mixed = () => {
    const landed = `${report.files} file${report.files === 1 ? "" : "s"} that landed`;
    const held = `(a file whose write failed holds what that write left)`;
    const marked = `${project}/${SEED_MARKER} marks the seed as unfinished; re-run --project`;
    if (report.clear) return `the project was emptied before the seed, so storage holds the ${landed} and nothing of the previous project ${held}, and ${marked}`;
    return `the previous project's entries stand under the ${landed} ${held}, and ${marked}`;
  };
  let collected;
  try {
    collected = await collect(source, limits);
  } catch (err) {
    return done(firstLine(err));
  }
  report.kind = collected.kind;
  report.skipped = collected.skipped;
  if (collected.unwrapped) report.unwrapped = collected.unwrapped;
  if (collected.kept) {
    report.kept = collected.kept;
    report.note = `every entry of the zip sits under ${collected.kept}/, which holds no main.sd, so the folder was kept as part of the project's layout and a script's paths start with ${collected.kept}/; if the folder is one the compress command added, make the zip from inside it`;
  }
  report.failed.push(...collected.failed);
  const total = collected.files.length;
  if (report.failed.length > 0) {
    const first = report.failed[0];
    return done(`${report.failed.length} project ${report.failed.length === 1 ? "entry" : "entries"} could not be read (first: ${first.path}: ${first.reason}); nothing was written`);
  }
  if (total === 0) {
    return done(`${source} holds no project files${report.skipped > 0 ? ` (${report.skipped} dot ${report.skipped === 1 ? "entry" : "entries"} skipped)` : ""}; nothing was written`);
  }
  if (expectMainSd && !collected.files.some((f) => f.path === "main.sd")) {
    const top = [...new Set(collected.files.map((f) => f.path.split("/")[0]))].slice(0, 6).join(", ");
    return done(`${source} has no main.sd at its root (its top-level entries: ${top}), so the editor could not open it as a project; nothing was written`);
  }
  try {
    const other = await otherProjectRemembered(page, project);
    if (other) return done(`${other} the seed does not write to; nothing was written. Forget it with a \`--probe\` file holding localStorage.removeItem("project"), then re-run`);
    if (clear) {
      report.clear = await clearProject(page, { project });
      if (report.clear.reason) {
        if (await page.evaluate(seedInterrupted, { project, marker: SEED_MARKER })) report.storage = "mixed";
        return done(report.clear.reason);
      }
    }
    const paths = collected.files.map((f) => f.path);
    const dirs = new Set();
    for (const p of paths) {
      const s = p.split("/");
      for (let i = 1; i < s.length; i++) dirs.add(s.slice(0, i).join("/"));
    }
    const clashes = await page.evaluate(kindClashes, { project, files: paths, dirs: [...dirs] });
    if (clashes.length > 0) {
      report.clashes = clashes;
      const first = clashes[0];
      const more = clashes.length > 1 ? ` and ${clashes.length - 1} more` : "";
      return done(`the previous project has a ${first.storage} named "${first.path}" where the source has a ${first.source}${more}, and the seed would have to remove it before writing; nothing was written. Empty the project with seed --clear, or fix the source`);
    }
    const begun = await page.evaluate(beginSeed, { project, marker: SEED_MARKER });
    if (begun.interrupted) report.interruptedBefore = true;
  } catch (err) {
    return done(`the editor's storage refused the seed before anything was written: ${firstLine(err)}`);
  }
  report.storage = "mixed";
  try {
    for (const batch of planBatches(collected.files, batchBytes)) {
      report.batches += 1;
      const entries = batch.map((f) => ({ path: f.path }));
      const archive = await pack(batch);
      await waitForProtocol(page);
      const out = await sendProjectBatch(page, { project, entries, archive });
      for (const w of out.written) {
        report.files += 1;
        report.bytes += w.bytes;
        if (w.path === "main.sd") report.mainSd = true;
      }
      report.failed.push(...out.failed);
    }
  } catch (err) {
    return done(`seeding stopped after ${report.files} of ${total} files: ${firstLine(err)}; ${mixed()}`);
  }
  if (report.failed.length > 0) {
    const first = report.failed[0];
    return done(`${report.failed.length} of ${total} project files could not be written (first: ${first.path}: ${first.reason}); ${mixed()}`);
  }
  let pruned;
  try {
    pruned = await page.evaluate(pruneProject, { project, keep: collected.files.map((f) => f.path), marker: SEED_MARKER });
  } catch (err) {
    return done(`the previous project's stale entries could not be removed: ${firstLine(err)}; ${mixed()}`);
  }
  report.removed = pruned.removed;
  if (pruned.failed.length > 0) {
    const first = pruned.failed[0];
    report.failed.push(...pruned.failed);
    return done(`${pruned.failed.length} of the previous project's entries could not be removed (first: ${first.path}: ${first.reason}); ${report.removed.length} went, the rest stand beside the seeded files, and ${project}/${SEED_MARKER} marks the seed as unfinished; re-run --project`);
  }
  report.pruned = true;
  report.storage = "replaced";
  return done();
}

async function seed(args, deps = liveDeps) {
  let source;
  try {
    source = flag(args, "--project");
  } catch (err) {
    deps.die(err.message);
  }
  const clear = args.includes("--clear");
  if (!source && !clear) deps.die("seed needs --project <dir-or-zip>, --clear, or both");
  if (source && !fs.existsSync(path.resolve(source))) deps.die(`--project ${source} does not exist`);
  const headless = !args.includes("--headed");
  return deps.withEditor(
    async ({ page, url }) => {
      const result = { url };
      try {
        await openEditorPage(page, url);
        await deps.waitForApp(page);
      } catch (err) {
        result.error = `the editor page did not load (${String(err.message || err).split("\n")[0]}). Check \`status\`; the machine may be saturated.`;
        deps.log(JSON.stringify(result, null, 2));
        process.exitCode = 1;
        return result;
      }
      if (clear && !source) {
        result.clear = await deps.clearProject(page);
        if (result.clear.reason) {
          result.error = result.clear.reason;
          deps.log(JSON.stringify(result, null, 2));
          process.exitCode = 1;
          return result;
        }
      }
      if (source) {
        result.seed = await deps.seedProject(page, source, { clear });
        if (result.seed.clear) result.clear = result.seed.clear;
      }
      if (result.seed?.reason) {
        result.error = result.seed.reason;
        process.exitCode = 1;
      } else {
        try {
          await reloadEditorPage(page);
          await deps.waitForApp(page);
        } catch (err) {
          result.error = `the editor page did not reload after ${source ? "seeding" : "clearing"} (${String(err.message || err).split("\n")[0]})`;
          process.exitCode = 1;
        }
      }
      deps.log(JSON.stringify(result, null, 2));
      return result;
    },
    { headless },
  );
}

async function waitForProtocol(page, timeout = 90_000) {
  await page.waitForFunction(() => window.__editorProtocol != null, null, { timeout });
}

async function protocolRequest(page, method, params = {}, timeout = 30_000) {
  await waitForProtocol(page, timeout);
  return page.evaluate(({ method, params, timeout }) =>
    window.__editorProtocol.send({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }, timeout),
    { method, params, timeout });
}

async function protocolNotify(page, method, params = {}) {
  await waitForProtocol(page);
  return page.evaluate(({ method, params }) => window.__editorProtocol.send({ jsonrpc: "2.0", method, params }), { method, params });
}

async function settledDiagnostics(page, timeout = 30_000) {
  const editor = await protocolRequest(page, "editor/read", {}, timeout);
  return protocolRequest(page, "textDocument/diagnosticsSettled", {
    textDocument: { uri: editor.textDocument.uri }, version: editor.textDocument.version,
  }, timeout);
}

async function waitForProtocolState(page, method, notification, field, timeout, expectedPosition = null) {
  await waitForProtocol(page, timeout);
  return page.evaluate(({ method, notification, field, timeout, expectedPosition }) => new Promise((resolve, reject) => {
    const bridge = window.__editorProtocol;
    const matches = (state) => state[field] && (!expectedPosition || (state.position?.uri === expectedPosition.uri && state.position?.line === expectedPosition.line));
    let done = false;
    const finish = (value, error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      unsubscribe();
      if (error) reject(error); else resolve(value);
    };
    const unsubscribe = bridge.subscribe((message) => {
      if (message.method === notification && matches(message.params)) finish(message.params);
    });
    const timer = setTimeout(() => finish(null, new Error("Protocol state wait timed out: " + field)), timeout);
    bridge.send({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params: {} }, timeout)
      .then((state) => { if (matches(state)) finish(state); }, (error) => finish(null, error));
  }), { method, notification, field, timeout, expectedPosition });
}

async function waitForEditor(page, timeout = 90_000) {
  const deadline = Date.now() + timeout;
  await waitForProtocol(page, timeout);
  return page.evaluate(({ timeout }) => new Promise((resolve, reject) => {
    const bridge = window.__editorProtocol;
    const deadline = Date.now() + timeout;
    let done = false;
    const finish = (value, error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      unsubscribe();
      if (error) reject(error); else resolve(value);
    };
    const read = () => {
      if (done) return;
      bridge.send({ jsonrpc: "2.0", id: crypto.randomUUID(), method: "editor/read", params: {} }, Math.max(1, deadline - Date.now()))
        .then((editor) => { if (editor?.textDocument?.uri) finish(editor); }, () => {});
    };
    const unsubscribe = bridge.subscribe((message) => { if (message.method === "editor/didLoad") read(); });
    const timer = setTimeout(() => finish(null, new Error("Editor did not answer editor/read before the readiness deadline")), timeout);
    read();
  }), { timeout: Math.max(1, deadline - Date.now()) });
}

async function clickLine(page, line) {
  const editor = await protocolRequest(page, "editor/read");
  const lines = editor.textDocument.text.split("\n");
  const clamped = Math.min(Math.max(1, line), lines.length);
  const range = { start: { line: clamped - 1, character: 0 }, end: { line: clamped - 1, character: 0 } };
  const state = await protocolRequest(page, "preview/gameState");
  if (state.launchState !== "preview") return { clicked: false, reason: "Stop the running preview before scrubbing" };
  await protocolNotify(page, "editor/select", { textDocument: { uri: editor.textDocument.uri }, range, takeFocus: true, scrollIntoView: "center" });
  await protocolNotify(page, "textDocument/didSelect", { textDocument: { uri: editor.textDocument.uri }, selectedRange: range, docChanged: false, userEvent: true, hasFocus: true });
  const selected = await waitForProtocolState(page, "preview/gameState", "preview/didChangeGameState", "position", 30_000, { uri: editor.textDocument.uri, line: clamped - 1 });
  const after = await protocolRequest(page, "editor/read", { textDocument: { uri: editor.textDocument.uri }, position: range.start });
  const coordinates = after.coordinates;
  return { clicked: true, line: clamped, totalLines: lines.length, cursorLine: after.selection.start.line + 1, x: coordinates ? coordinates.left + 1 : null, y: coordinates ? (coordinates.top + coordinates.bottom) / 2 : null, previousPosition: state.position, position: selected.position };
}

const GAME_MOUNT_BUDGET_MS = 45_000;
async function gameMountedWithin(page, timeout = GAME_MOUNT_BUDGET_MS, { now = Date.now } = {}) {
  if (timeout <= 0) return false;
  return waitForProtocolState(page, "preview/gameState", "preview/didChangeGameState", "mounted", timeout).then(() => true, () => false);
}

async function waitForGame(page, { timeout = GAME_MOUNT_BUDGET_MS, now = Date.now, ensure = ensureScriptEditor } = {}) {
  if (await gameMountedWithin(page, timeout, { now })) return { mounted: true, reloaded: false };

  try {
    await reloadEditorPage(page);
  } catch (err) {
    return { mounted: false, reloaded: true, error: `the recovery reload did not complete (${String(err.message || err).split("\n")[0]})` };
  }
  const back = await ensure(page);
  if (!back.present) return { mounted: false, reloaded: true, error: back.reason, switched: back.switched };
  if (await gameMountedWithin(page, timeout, { now })) return { mounted: true, reloaded: true, switched: back.switched };
  return { mounted: false, reloaded: true, switched: back.switched };
}

async function previewSummary(page) {
  return page.evaluate(() => {
    const p = window.__preview;
    if (!p) return { installed: false };
    return { installed: true, ...p.summary() };
  });
}

async function previewText(page) {
  return page.evaluate(() => {
    const p = window.__preview;
    const el = p?.$("#game-ui") ?? p?.game();
    return el?.innerText?.trim() ?? null;
  });
}

async function routeLabel(page) {
  return page.evaluate(() => {
    const p = window.__preview;
    return p?.$("#toolbar")?.innerText?.trim().replace(/\s+/g, " ") ?? null;
  });
}

async function documentLines(page) {
  const editor = await protocolRequest(page, "editor/read");
  return editor.textDocument.text.split("\n");
}

export function classifyScrub(lines, target, visible) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return {
      outcome: "inconclusive",
      reason: "the editor returned no document text to compare against",
    };
  }
  if (typeof visible !== "string" || visible.trim() === "") {
    return {
      outcome: "inconclusive",
      reason: "the game rendered no text to compare against",
    };
  }

  const trimmed = lines.map((l) => (typeof l === "string" ? l.trim() : ""));
  const idx = target - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= trimmed.length) {
    return {
      outcome: "inconclusive",
      reason: `line ${target} is outside the document (${trimmed.length} lines)`,
    };
  }

  const attributable = (i) => {
    const t = trimmed[i];
    if (!t || t.length < 3) return false;
    return !trimmed.some((other, j) => j !== i && other && other.includes(t));
  };

  const targetAttributable = attributable(idx);
  if (targetAttributable && visible.includes(trimmed[idx])) {
    return { outcome: "landed" };
  }

  const showing = [];
  for (let i = 0; i < trimmed.length; i++) {
    if (i === idx) continue;
    if (!trimmed[i] || !visible.includes(trimmed[i])) continue;
    if (attributable(i)) showing.push(i + 1);
  }
  if (showing.length > 0) {
    return {
      outcome: "elsewhere",
      showing,
      reason:
        `the game is showing line${showing.length > 1 ? "s" : ""} ` +
        `${showing.join(", ")}, not line ${target}; if the scrub really did fail, aim at an ` +
        `indented dialogue or action line, since a NAME: line, a heading and a blank line ` +
        `are not playable beats`,
    };
  }

  return {
    outcome: "inconclusive",
    reason: targetAttributable
      ? `line ${target}'s text is not on screen and neither is any other line's, ` +
        `so it may simply not render verbatim (interpolation, markup, a heading, ` +
        `a character-name line)`
      : `line ${target}'s text cannot be told apart from other lines in the ` +
        `script, so the rendered text can neither confirm nor deny the scrub`,
  };
}

function routeBeat(label) {
  if (!label) return null;
  const nums = [...label.matchAll(/main\s*:\s*(\d+)/g)].map((m) => Number(m[1]));
  return nums.length ? nums[nums.length - 1] : null;
}

const PROGRAM_BUDGET_MS = 90_000;
async function waitForProgram(page, timeout = PROGRAM_BUDGET_MS) {
  const started = Date.now();
  const loaded = await waitForProtocolState(page, "preview/gameState", "preview/didChangeGameState", "programLoaded", timeout).then(() => true, () => false);
  const out = { loaded, ms: Date.now() - started };
  if (!loaded) {
    out.errors = await settledDiagnostics(page).then((result) => result.diagnostics.filter((d) => d.severity === 1).length, () => null);
  }
  return out;
}

function programWarning(program, budget = PROGRAM_BUDGET_MS) {
  if (program.errors == null) return `the player had not loaded a program within ${seconds(budget)}, and settled diagnostics could not be read. Inspect the protocol error and retry before trusting the preview.`;
  if (program.errors > 0) {
    return `the script does not compile: settled diagnostics report ${program.errors} error${program.errors === 1 ? "" : "s"} in the open document, so no program reached the player within ${seconds(budget)}. The preview shows the last program the player had, or nothing, and a scrub is dropped; that is the picture of a script that does not compile, which is evidence only when that is the bug.`;
  }
  return `the player had not loaded a program within ${seconds(budget)} according to preview/gameState, and settled diagnostics report no errors in the open document: either the harness was not ready (the first compile was still running or never reached the player), or a file that is not open does not compile (an included script, on a --project run; this diagnostic read covers the open document alone). A scrub sent now is dropped and the preview is not evidence; re-run, or open the included scripts in the editor to see their errors.`;
}

function scriptsViewWarning({ projectPath, sdPath }) {
  const which = projectPath ? "the seeded project's main.sd" : sdPath ? "the main.sd --sd wrote" : "the project's main.sd";
  return `the logic pane is showing its fullscreen scripts view (another file is open), so the file on screen is not ${which}, and the scrub reads the file on screen. Close that file in the editor before trusting this run.`;
}

async function waitForPreviewSettle(page, { timeout = 30_000, quiet = 2500 } = {}) {
  const deadline = Date.now() + timeout;
  let last = await previewText(page);
  let stableSince = Date.now();
  while (Date.now() < deadline) {
    await page.waitForTimeout(400);
    const now = await previewText(page);
    if (now !== last) {
      last = now;
      stableSince = Date.now();
    } else if (last != null && Date.now() - stableSince > quiet) {
      return { settled: true, text: last };
    }
  }
  return { settled: false, text: last };
}

async function verify(args, deps = liveDeps) {
  let sdPath;
  let projectPath;
  let shot;
  let line;
  let probePath;
  try {
    sdPath = flag(args, "--sd");
    projectPath = flag(args, "--project");
    shot = flag(args, "--shot");
    line = flag(args, "--line");
    probePath = flag(args, "--probe");
  } catch (err) {
    deps.die(err.message);
  }
  const headless = !args.includes("--headed");
  if (projectPath && !fs.existsSync(path.resolve(projectPath))) deps.die(`--project ${projectPath} does not exist`);

  return deps.withEditor(
    async ({ page, ctx, url, consoleLines, mode, cleanups = [] }) => {
      const result = { url };
      let monitoredWorker;
      if (mode === "cross-origin") {
        result.gameMounted = null;
        result.program = { loaded: null, reason: "the preview is not observable (cross-origin mode)" };
        result.error = "the game preview is not observable in cross-origin mode (window.__preview is never installed), so nothing seen on it is evidence; `down`, then `up` without --cross-origin";
        deps.log(JSON.stringify(result, null, 2));
        process.exitCode = 1;
        return result;
      }

      try {
        await openEditorPage(page, url);
      } catch (err) {
        result.gameMounted = false;
        result.error = `the editor page did not load (${String(err.message || err).split("\n")[0]}). Check \`status\`; the machine may be saturated.`;
        deps.log(JSON.stringify(result, null, 2));
        process.exitCode = 1;
        return result;
      }
      if (args.includes("--fresh-sw")) {
        const worker = await deps.reportFreshWorker(page, ctx, reloadEditorPage);
        monitoredWorker = worker;
        cleanups.push(worker.close);
        result.serviceWorker = worker.report;
        if (worker.report.reason) {
          result.error = worker.report.reason;
          const captured = partitionConsole(consoleLines);
          result.consoleErrors = captured.errors;
          result.consoleNoise = captured.noise;
          deps.log(JSON.stringify(result, null, 2));
          process.exitCode = 1;
          return result;
        }
      }
      const shell = await deps.ensureScriptEditor(page);
      if (shell.switched) result.switchedToLogic = true;
      if (!shell.present) {
        result.gameMounted = false;
        result.error = shell.reason;
        result.preview = await deps.previewSummary(page).catch(() => null);
        deps.log(JSON.stringify(result, null, 2));
        process.exitCode = 1;
        return result;
      }
      result.editorSettled = shell.settled;
      result.editorView = await page.evaluate(() =>
        document.querySelector('[role="tab"][id$="-trigger-main"]') ? "main" : "scripts-view",
      );
      if (result.editorView === "scripts-view") result.editorWarning = scriptsViewWarning({ projectPath, sdPath });
      const gameObservable = await page
        .waitForFunction(() => window.__preview != null, null, { timeout: 5_000 })
        .then(() => true, () => false);
      if (!gameObservable) {
        const toGame = page.locator('[aria-label="Preview Game"]').first();
        const toolbarUp = await toGame.waitFor({ state: "visible", timeout: 5_000 }).then(() => true, () => false);
        if (toolbarUp) {
          await toGame.click();
          result.switchedToGamePreview = true;
          await deps.waitForDomQuiet(page, { quiet: 600, timeout: 10_000 });
        }
      }

      if (projectPath) {
        result.seed = await deps.seedProject(page, projectPath, { expectMainSd: !sdPath });
        if (result.seed.reason) {
          result.error = `${result.seed.reason}. The game was never asked about, so restarting the servers changes nothing.`;
          deps.log(JSON.stringify(result, null, 2));
          process.exitCode = 1;
          return result;
        }
      } else if (await deps.interruptedSeed(page)) {
        result.error = interruptedSeedError();
        deps.log(JSON.stringify(result, null, 2));
        process.exitCode = 1;
        return result;
      }
      if (sdPath) {
        const src = fs.readFileSync(path.resolve(sdPath), "utf8");
        result.wroteChars = await deps.writeMainSd(page, src);
      }
      if (projectPath || sdPath) {
        try {
          await reloadEditorPage(page);
        } catch (err) {
          result.gameMounted = false;
          result.error = `the editor page did not reload after writing the ${projectPath ? "project" : "script"} (${String(err.message || err).split("\n")[0]}). Check \`status\`; the machine may be saturated.`;
          deps.log(JSON.stringify(result, null, 2));
          process.exitCode = 1;
          return result;
        }
        const again = await deps.ensureScriptEditor(page);
        if (again.switched) result.switchedToLogic = true;
        if (!again.present) {
          result.gameMounted = false;
          result.error = again.reason;
          deps.log(JSON.stringify(result, null, 2));
          process.exitCode = 1;
          return result;
        }
        result.editorSettled = again.settled;
        result.editorView = await page.evaluate(() =>
          document.querySelector('[role="tab"][id$="-trigger-main"]') ? "main" : "scripts-view",
        );
        if (result.editorView === "scripts-view") result.editorWarning = scriptsViewWarning({ projectPath, sdPath });
        else delete result.editorWarning;
      }

      result.script = await deps.loadedScript(page, Boolean(sdPath));

      await page
        .waitForFunction(() => window.__preview?.summary().sameOrigin === true, null, {
          timeout: 60_000,
        })
        .catch(() => {
          result.previewWarning =
            "window.__preview never reported sameOrigin within 60s: the preview pane is showing the screenplay, or the game preview never mounted";
        });

      const mount = await deps.waitForGame(page, { ensure: deps.ensureScriptEditor });
      result.gameMounted = mount.mounted;
      if (mount.reloaded) result.neededReload = true;
      if (mount.switched) result.switchedToLogic = true;
      if (!mount.mounted) {
        result.error =
          "the game never mounted (#game absent) — the Game Preview is blank. " +
          "Screenshot is NOT valid evidence. Try `down` then `up`." +
          (mount.error ? ` On the reload retry: ${mount.error}.` : "");
        process.exitCode = 1;
      }

      result.program = mount.mounted ? await deps.waitForProgram(page) : { loaded: null, reason: "the game never mounted" };
      if (result.program.loaded === false) result.programWarning = programWarning(result.program);
      let settle = await deps.waitForPreviewSettle(page);

      if (line) {
        const target = Number(line);
        const scrubbed = await scrubPreview(page, target, deps);
        result.scrub = scrubbed.scrub;
        settle = scrubbed.settle;
        result.route = scrubbed.route;

        result.scrubCheck = scrubbed.scrubCheck;

        if (result.scrubCheck.outcome !== "landed") {
          const scrub = result.scrub;
          let clickNote = "";
          if (scrub?.clicked) {
            const where = Number.isFinite(scrub.cursorLine)
              ? `line ${scrub.cursorLine}`
              : `a position it could not read back`;
            clickNote = ` The click put the cursor on ${where}.`;
          } else if (scrub) {
            clickNote = ` The click could not run: ${scrub.reason}.`;
          }
          result.scrubWarning =
            (result.scrubCheck.outcome === "elsewhere"
              ? `The scrub to line ${target} is not confirmed by the rendered text: ` +
                `${result.scrubCheck.reason}. Usually a genuinely failed scrub, but open ` +
                `the screenshot first — the same near-duplicate-text confusion that ` +
                `produces \`inconclusive\` can produce this outcome too, on a line that ` +
                `is genuinely on screen.`
              : `Could not confirm the scrub landed: ${result.scrubCheck.reason}. ` +
                `This is not the same as a failure — read \`visible\` and judge it ` +
                `yourself.`) +
            clickNote +
            ` (The \`route\` number is not a check on this: it reports how far ` +
            `execution reached, not the line requested.)`;
        }
      } else {
        result.route = await deps.routeLabel(page);
      }

      result.settled = settle.settled;
      result.preview = await deps.previewSummary(page);
      result.visible = settle.text;

      if (probePath) {
        const code = fs.readFileSync(path.resolve(probePath), "utf8");
        result.probe = await page.evaluate(
          // eslint-disable-next-line no-new-func
          (src) => new Function(`return (async () => { ${src} })()`)(),
          code,
        );
      }

      if (shot) {
        const out = path.resolve(shot);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        const paintBudget = PAINT_BUDGET_MS;
        if (!(await deps.editorPainted(page, paintBudget))) {
          result.editorPaintWarning = `the script editor had not painted its lines and gutter within ${seconds(paintBudget)} of the screenshot; the editor half of the picture may be blank`;
        }
        await page.screenshot({ path: out, fullPage: false });
        result.screenshot = out;
      }

      if (monitoredWorker) {
        await monitoredWorker.finish();
        if (monitoredWorker.report.reason) {
          result.error = [result.error, monitoredWorker.report.reason].filter(Boolean).join(" Also: ");
          process.exitCode = 1;
        }
      }
      const captured = partitionConsole(consoleLines);
      result.consoleErrors = captured.errors;
      result.consoleNoise = captured.noise;

      deps.log(JSON.stringify(result, null, 2));
      return result;
    },
    { headless },
  );
}

const SURFACES = {
  find: {
    selector: ".sparkdown-script-editor-root .cm-search",
    open: "Control+f",
    fields: { search: "[name=search]", replace: "[name=replace]" },
    buttons: ["next", "prev", "select", "replace", "replaceAll", "close"],
    toggles: ["case", "re", "word"],
  },
  goto: {
    selector: ".sparkdown-script-editor-root .cm-gotoLine",
    open: "Control+g",
    fields: { line: "[name=line]" },
    buttons: ["submit", "close"],
    toggles: [],
  },
};

const SCREENS = {
  logic: '[role="tab"][id$="-trigger-main"], .sparkdown-script-editor-root .cm-content',
  assets: '[role="tab"][id$="-trigger-files"]',
  share: '[role="tab"][id$="-trigger-game"]',
};
const tabSelector = (value) => `[role="tab"][id$="-trigger-${value}"]`;
const LANGUAGE_TARGETS = {
  hover: ".sparkdown-script-editor-root .cm-tooltip-hover",
  completion: ".sparkdown-script-editor-root .cm-tooltip-autocomplete",
  info: ".sparkdown-script-editor-root .cm-completionInfo",
};
const SHOT_TARGETS = { find: SURFACES.find.selector, goto: SURFACES.goto.selector, editor: ".sparkdown-script-editor-root .cm-editor", hover: LANGUAGE_TARGETS.hover, completion: LANGUAGE_TARGETS.completion, page: null };

export function normalizeKeyCombo(combo) {
  const raw = String(combo ?? "").trim();
  if (raw === "") throw new Error("empty key combo");
  let key;
  let modsText;
  if (raw === "+" || raw.endsWith("++")) {
    key = "+";
    modsText = raw === "+" ? "" : raw.slice(0, -2);
  } else if (raw.endsWith("+")) {
    throw new Error(`key combo "${combo}" names no key (write a + key as "Control++")`);
  } else {
    const at = raw.lastIndexOf("+");
    key = at < 0 ? raw : raw.slice(at + 1);
    modsText = at < 0 ? "" : raw.slice(0, at);
  }
  key = key.trim();
  if (key === "") throw new Error(`key combo "${combo}" names no key`);
  const mods = modsText.split("+").map((m) => m.trim()).filter(Boolean);
  const shifted = mods.some((m) => /^shift$/i.test(m));
  const fixed = shifted && /^[a-z]$/.test(key) ? key.toUpperCase() : key;
  return { combo: [...mods, fixed].join("+"), rewritten: fixed !== key };
}

async function pressKey(page, combo) {
  const n = normalizeKeyCombo(combo);
  await page.keyboard.press(n.combo);
  return n;
}

async function focusEditor(page, editor) {
  editor ??= await protocolRequest(page, "editor/read");
  await protocolNotify(page, "editor/select", { textDocument: { uri: editor.textDocument.uri }, range: editor.selection, takeFocus: true });
  return editor;
}

const DOCUMENT_COMMAND_KEYS = new Set(["Shift+Alt+F", "Control+s", "Meta+s"]);
const PRESS_TEXT_LIMIT = 8192;

export async function pressInEditor(page, combo, { wait = waitForDomQuiet, commandWaitMs = 5_000 } = {}) {
  const before = await focusEditor(page);
  const n = await pressKey(page, combo);
  await wait(page, { quiet: 300, timeout: 4_000 });
  let after = await protocolRequest(page, "editor/read");
  if (DOCUMENT_COMMAND_KEYS.has(n.combo)) {
    const deadline = Date.now() + commandWaitMs;
    while (after.textDocument.version === before.textDocument.version && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      after = await protocolRequest(page, "editor/read");
    }
  }
  const text = after.textDocument.text;
  const changed = text !== before.textDocument.text;
  return {
    press: combo, sent: n.combo, rewritten: n.rewritten,
    version: { before: before.textDocument.version, after: after.textDocument.version },
    textChanged: changed,
    ...(changed ? { text: text.slice(0, PRESS_TEXT_LIMIT), ...(text.length > PRESS_TEXT_LIMIT ? { textTruncated: text.length } : {}) } : {}),
  };
}

const INSERT_TEXT_LIMIT = 4096;
const PLAY_BUDGET_MS = 30_000;

async function waitGameState(request, reached, { timeout, now = Date.now, pause }) {
  const end = now() + timeout;
  let state = await request("preview/gameState");
  while (!reached(state) && now() < end) {
    await pause(100);
    state = await request("preview/gameState");
  }
  return state;
}

export async function playPreview(page, action, { request = (method, params) => protocolRequest(page, method, params), timeout = PLAY_BUDGET_MS, now = Date.now, pause = (ms) => page.waitForTimeout(ms) } = {}) {
  const start = action === "start";
  const label = start ? "Play Game" : "Stop Game";
  const other = start ? "Stop Game" : "Play Game";
  const reached = (s) => (start ? s?.launchState === "play" || s?.launchState === "pause" : s?.launchState === "preview");
  const before = await request("preview/gameState");
  const out = { play: action, clicked: false, reached: false, launchStateBefore: before?.launchState ?? null };
  const button = page.locator(`[aria-label="${label}"]`).first();
  if (!(await button.isVisible().catch(() => false))) {
    return { ...out, launchState: out.launchStateBefore, reason: `the ${label} control is not on screen (launch state ${out.launchStateBefore}); ${start ? "the game may already be running, or the preview pane is not showing" : "the game is not running"}` };
  }
  await button.click();
  out.clicked = true;
  const state = await waitGameState(request, reached, { timeout, now, pause });
  out.launchState = state?.launchState ?? null;
  out.running = out.launchState === "play" || out.launchState === "pause";
  out.control = (await page.locator(`[aria-label="${other}"]`).first().isVisible().catch(() => false)) ? other : label;
  out.reached = reached(state) && out.control === other;
  if (!out.reached) out.reason = `PLAY was clicked but the game did not ${start ? "start" : "stop"} within ${seconds(timeout)} (launch state ${out.launchState}, control showing ${out.control})`;
  return out;
}

const running = (s) => s?.launchState === "play" || s?.launchState === "pause";

async function gameNotifications(page) {
  await waitForProtocol(page);
  await page.evaluate(() => {
    if (window.__driverGameLog) return;
    window.__driverGameLog = [];
    window.__editorProtocol.subscribe((message) => {
      if (typeof message?.method === "string" && message.method.startsWith("game/")) {
        window.__driverGameLog.push({ method: message.method, params: message.params ?? null });
      }
    });
  });
  return () => page.evaluate(() => window.__driverGameLog.splice(0));
}

async function clickGame(page) {
  const frame = page.frames().find((f) => f !== page.mainFrame() && /\/__player\//.test(f.url()));
  if (!frame) return { clicked: false, reason: "no same-origin player frame is on the page; `up` without --cross-origin" };
  const box = await frame.locator("#game").first().boundingBox().catch(() => null);
  if (!box || box.width <= 0 || box.height <= 0) return { clicked: false, reason: "the game's view (#game) is not on screen in the player frame" };
  const at = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  await page.mouse.click(at.x, at.y);
  return { clicked: true, at };
}

export async function advanceGame(page, count, {
  request = (method, params) => protocolRequest(page, method, params),
  click = () => clickGame(page),
  settle = () => waitForPreviewSettle(page),
  notifications = () => gameNotifications(page),
} = {}) {
  const drain = await notifications();
  await drain();
  const out = { advance: count, clicked: 0, clicks: [] };
  for (let n = 1; n <= count; n++) {
    const before = await request("preview/gameState");
    if (!running(before)) {
      out.launchState = before?.launchState ?? null;
      out.reason = `click ${n} of ${count} was not made: no game is running (launch state ${out.launchState}); --play start runs one`;
      return out;
    }
    const clicked = await click();
    if (!clicked.clicked) {
      out.launchState = before.launchState;
      out.reason = `click ${n} of ${count} was not made: ${clicked.reason}`;
      return out;
    }
    out.clicked = n;
    const settled = await settle();
    const state = await request("preview/gameState");
    out.clicks.push({ click: n, at: clicked.at, settled: settled.settled, visible: settled.text, launchState: state?.launchState ?? null, notifications: await drain() });
    out.launchState = state?.launchState ?? null;
  }
  return out;
}

export async function insertText(page, position, text, { request = (method, params) => protocolRequest(page, method, params), notify = (method, params) => protocolNotify(page, method, params), settle = waitForPreviewSettle, route = routeLabel, versionWaitMs = 5_000, now = Date.now, pause = (ms) => page.waitForTimeout(ms) } = {}) {
  const out = { insert: position, inserted: false, textMatches: false };
  const before = await request("editor/read");
  const source = before.textDocument.text;
  const lines = source.split("\n");
  if (position.line > lines.length || position.col > lines[position.line - 1].length + 1) {
    return { ...out, reason: `position ${position.line}:${position.col} is outside the open document (${lines.length} lines); choose a line and column within its text` };
  }
  const point = { line: position.line - 1, character: position.col - 1 };
  await notify("editor/select", { textDocument: { uri: before.textDocument.uri }, range: { start: point, end: point }, takeFocus: true, scrollIntoView: "center" });
  const caret = await request("editor/read");
  const at = { line: caret.selection.start.line + 1, col: caret.selection.start.character + 1 };
  if (at.line !== position.line || at.col !== position.col) return { ...out, caret: at, reason: "the editor did not put the caret at the requested position" };
  await page.keyboard.insertText(text);
  out.inserted = true;
  let after = await request("editor/read");
  const end = now() + versionWaitMs;
  while (after.textDocument.version === before.textDocument.version && now() < end) {
    await pause(100);
    after = await request("editor/read");
  }
  const offset = lines.slice(0, point.line).reduce((n, l) => n + l.length + 1, 0) + point.character;
  const expected = source.slice(0, offset) + text + source.slice(offset);
  const got = after.textDocument.text;
  out.version = { before: before.textDocument.version, after: after.textDocument.version };
  out.textMatches = got === expected;
  const span = text.split("\n").length;
  out.readBack = got.split("\n").slice(point.line, point.line + span).join("\n");
  if (!out.textMatches) {
    out.reason = out.version.after === out.version.before
      ? "the document did not change after the insert; the editor may not have had focus"
      : "the document read back differs from the requested insert; inspect readBack for auto-inserted characters";
    return out;
  }
  const settled = await settle(page);
  out.preview = { settled: settled.settled, route: await route(page) };
  return out;
}

export async function scrubPreview(page, target, deps) {
  let scrub = await deps.clickLine(page, target);
  if (!scrub.clicked && !/Stop the running preview/.test(scrub.reason ?? "")) {
    await page.waitForTimeout(1500);
    scrub = await deps.clickLine(page, target);
  }
  const settle = await deps.waitForPreviewSettle(page);
  const route = await deps.routeLabel(page);
  const scrubCheck = classifyScrub(await deps.documentLines(page), target, settle.text);
  return { scrub, settle, route, scrubCheck };
}

export function scrubReport(target, { scrub, settle, route, scrubCheck }) {
  const out = { scrub: target, ...scrub, route, settled: settle.settled, visible: settle.text, scrubCheck };
  delete out.reason;
  if (!scrub.clicked) out.reason = `the scrub to line ${target} did not run: ${scrub.reason}`;
  else if (scrub.line !== target) out.reason = `line ${target} is past the end of the document (${scrub.totalLines} lines)`;
  else if (scrub.position?.line !== scrub.line - 1) out.reason = `the preview did not move to line ${scrub.line} (position ${JSON.stringify(scrub.position)})`;
  else if (scrubCheck.outcome === "elsewhere") out.reason = `the scrub to line ${target} is not confirmed by the rendered text: ${scrubCheck.reason}`;
  return out;
}

async function waitForDomQuiet(page, { quiet = 400, timeout = 8_000 } = {}) {
  return page.evaluate(
    ({ quiet, timeout }) =>
      new Promise((resolve) => {
        let timer;
        const done = (settled) => {
          obs.disconnect();
          clearTimeout(giveUp);
          resolve(settled);
        };
        const arm = () => {
          clearTimeout(timer);
          timer = setTimeout(() => done(true), quiet);
        };
        const obs = new MutationObserver(arm);
        obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
        const giveUp = setTimeout(() => done(false), timeout);
        arm();
      }),
    { quiet, timeout },
  );
}

async function waitForApp(page, timeout = 90_000) {
  await page.waitForSelector('[role="tab"]', { timeout });
}

async function activeScreen(page) {
  const mounted = await mountedScreens(page);
  return mounted.length === 1 ? mounted[0] : null;
}

async function mountedScreens(page) {
  return page.evaluate(
    (screens) => Object.entries(screens).filter(([, selector]) => document.querySelector(selector)).map(([name]) => name),
    SCREENS,
  );
}

async function scriptEditorPresent(page, timeout = 10_000) {
  const screenNow = await activeScreen(page);
  const budget = screenNow != null && screenNow !== "logic" ? 500 : timeout;
  try {
    await waitForEditor(page, budget);
    return { present: true };
  } catch {
    const screen = await activeScreen(page);
    const panelTab = await page.evaluate(() =>
      [...document.querySelectorAll('[role="tab"][aria-selected="true"]')].map((t) => t.id.replace(/^.*-trigger-/, "")).find((v) => !["logic", "assets", "share"].includes(v)) ?? null,
    );
    return { present: false, ...editorAbsentReason({ screen, panelTab, budgetMs: budget }) };
  }
}

export function editorAbsentReason({ screen, panelTab, budgetMs }) {
  const where = `the script editor is not on screen (active screen: ${screen ?? "none"}${panelTab ? `, tab: ${panelTab}` : ""})`;
  const navigational =
    screen === "logic" && panelTab && panelTab !== "main"
      ? "put --screen main before this step"
      : screen != null && screen !== "logic"
        ? "put --screen logic before this step"
        : null;
  const advice = navigational ?? `the editor did not mount within ${seconds(budgetMs)}; the machine may be saturated, re-run`;
  return { reason: `${where}; ${advice}`, where, advice, navigational };
}

async function editorExpectedHere(page) {
  await page
    .waitForFunction((screens) => Object.values(screens).some((sel) => document.querySelector(sel)), SCREENS, { timeout: 5_000 })
    .catch(() => {});
  const screen = await activeScreen(page);
  if (screen == null) return null;
  if (screen !== "logic") return false;
  return page.evaluate(() => {
    const main = document.querySelector('[role="tab"][id$="-trigger-main"]');
    return main == null || main.getAttribute("aria-selected") === "true";
  });
}

const MOUNT_BUDGET_MS = 20_000;
const SETTLE_BUDGET_MS = 15_000;
const WARM_BUDGET_MS = 8_000;
const PAINT_BUDGET_MS = 5_000;
const seconds = (ms) => `${ms / 1000}s`;

async function editorPainted(page, timeout = PAINT_BUDGET_MS) {
  return page
    .waitForFunction(
      () => {
        const root = document.querySelector(".sparkdown-script-editor-root");
        if (!root) return false;
        const lines = root.querySelectorAll(".cm-line").length;
        const gutter = root.querySelector(".cm-gutters");
        return lines > 0 && gutter != null && gutter.getBoundingClientRect().height > 0;
      },
      null,
      { timeout },
    )
    .then(() => true, () => false);
}

function editorGate({ expected = editorExpectedHere, present = scriptEditorPresent, settle = settleEditor, painted = editorPainted } = {}) {
  let settledOnce = false;
  let gaveUp = null;
  const gate = async (page, what, step = null) => {
    const exp = await expected(page);
    if (exp === false) return { required: false };
    const at = gaveUp?.step != null ? `step ${gaveUp.step}` : "an earlier step";
    if (gaveUp) {
      const quick = await present(page, 2_000);
      if (!quick.present) return { required: true, ok: false, reason: `the script editor is still not up (${at} reported: ${gaveUp.what}); this ${what} was skipped` };
      if (gaveUp.kind === "unsettled" && !(await settle(page, 6_000))) {
        return { required: true, ok: false, reason: `the script editor is still waiting for settled diagnostics (${at} reported: ${gaveUp.what}); this ${what} was skipped` };
      }
      gaveUp = null;
    }
    const budget = settledOnce ? WARM_BUDGET_MS : MOUNT_BUDGET_MS;
    const here = await present(page, budget);
    if (!here.present) {
      const stillNoPane = exp == null && /active screen: none/.test(here.where ?? "");
      const state = (stillNoPane ? "no pane had mounted; " : "") + (here.where ?? here.reason);
      const advice = here.navigational ?? "Re-run; if it persists the machine is saturated";
      gaveUp = { kind: "absent", what: state, step };
      return { required: true, ok: false, reason: `this ${what} needs the script editor, which had not mounted within ${seconds(budget)} (${state}); ${advice}` };
    }
    const settleBudget = settledOnce ? WARM_BUDGET_MS : SETTLE_BUDGET_MS;
    if (!(await settle(page, settleBudget))) {
      gaveUp = { kind: "unsettled", what: `the view did not return settled diagnostics for ${seconds(settleBudget)}`, step };
      return { required: true, ok: false, reason: `this ${what} needs a settled script editor, and the view did not return settled diagnostics for ${seconds(settleBudget)}. Re-run; if it persists the machine is saturated` };
    }
    settledOnce = true;
    const paintBudget = PAINT_BUDGET_MS;
    if (what === "screenshot" && !(await painted(page, paintBudget))) {
      return { required: true, ok: false, reason: `the script editor is mounted and settled but has not painted its lines and gutter within ${seconds(paintBudget)}; this screenshot would have shown an unpainted editor pane. Re-run; if it persists the machine is saturated` };
    }
    return { required: true, ok: true };
  };
  gate.noteSettled = () => {
    settledOnce = true;
    gaveUp = null;
  };
  gate.reset = () => {
    settledOnce = false;
    gaveUp = null;
  };
  return gate;
}

async function settleEditor(page, timeout = 30_000) {
  return settledDiagnostics(page, timeout).then(() => true, () => false);
}

async function ensureScriptEditor(page) {
  await waitForApp(page);
  let switched = false;
  let first = await scriptEditorPresent(page, 10_000);
  if (!first.present) {
    const clickIfNeeded = async (value, needed) => {
      const tab = page.locator(tabSelector(value)).first();
      if (!(await tab.isVisible().catch(() => false))) return false;
      if (!(await needed(tab))) return false;
      await tab.click();
      await waitForDomQuiet(page, { quiet: 600, timeout: 10_000 });
      return true;
    };
    const clickedLogic = await clickIfNeeded("logic", async () => (await activeScreen(page)) !== "logic");
    const clickedMain = await clickIfNeeded("main", async (tab) => (await tab.getAttribute("aria-selected")) !== "true");
    first = await scriptEditorPresent(page, 45_000);
    switched = clickedLogic || clickedMain;
  }
  if (!first.present) return { present: false, switched, reason: first.reason };
  const settled = await settleEditor(page);
  return { present: true, switched, settled };
}

function surfaceOf(name) {
  const s = SURFACES[name];
  if (!s) throw new Error(`unknown surface "${name}" (know: ${Object.keys(SURFACES).join(", ")})`);
  return s;
}

async function surfaceOpen(page, name) {
  return page.locator(surfaceOf(name).selector).first().isVisible().catch(() => false);
}

async function openSurface(page, name, { settled = false } = {}) {
  const s = surfaceOf(name);
  if (await surfaceOpen(page, name)) return { surface: name, open: true, alreadyOpen: true };
  const editor = await scriptEditorPresent(page);
  if (!editor.present) return { surface: name, open: false, reason: editor.reason };
  if (!settled && !(await settleEditor(page, SETTLE_BUDGET_MS))) {
    return { surface: name, open: false, reason: `the script editor did not return settled diagnostics for ${seconds(SETTLE_BUDGET_MS)} and never settled; the shortcut was not sent. Re-run; if it persists the machine is saturated` };
  }
  await focusEditor(page);
  const key = await pressKey(page, s.open);
  try {
    await page.locator(s.selector).first().waitFor({ state: "visible", timeout: 10_000 });
  } catch {
    return {
      surface: name,
      open: false,
      pressed: key.combo,
      reason: `${s.selector} did not appear within 10s of pressing ${key.combo} with the editor focused; another panel may hold the focus (\`--close\` it), or the run may be off the logic screen's main tab (put \`--screen logic --screen main\` first) — if the editor is up and it still fails, the binding itself changed: check customSearch.ts's keymap`,
    };
  }
  return { surface: name, open: true, pressed: key.combo };
}

async function closeSurface(page, name) {
  const s = surfaceOf(name);
  if (!(await surfaceOpen(page, name))) return { surface: name, open: false, alreadyClosed: true };
  const firstField = Object.values(s.fields)[0];
  await page.locator(`${s.selector} ${firstField}`).first().click();
  await pressKey(page, "Escape");
  try {
    await page.locator(s.selector).first().waitFor({ state: "hidden", timeout: 5_000 });
  } catch {
    return { surface: name, open: true, reason: `${s.selector} still visible 5s after Escape` };
  }
  return { surface: name, open: false, closed: true };
}

function surfaceForField(field) {
  for (const [name, s] of Object.entries(SURFACES)) if (s.fields[field]) return name;
  throw new Error(
    `unknown field "${field}" (know: ${Object.values(SURFACES).flatMap((s) => Object.keys(s.fields)).join(", ")})`,
  );
}

function fieldLocator(page, field) {
  const name = surfaceForField(field);
  const s = surfaceOf(name);
  return page.locator(`${s.selector} ${s.fields[field]}`).first();
}

async function readField(page, field) {
  const loc = fieldLocator(page, field);
  if ((await loc.count()) === 0) return null;
  return loc.evaluate((el) => el.innerText.replace(/\n$/, ""));
}

async function typeInto(page, field, text, { settled = false } = {}) {
  const name = surfaceForField(field);
  const opened = await openSurface(page, name, { settled });
  if (opened.reason) return { field, typed: false, text, readBack: null, matches: false, reason: opened.reason };
  const loc = fieldLocator(page, field);
  if ((await loc.count()) === 0) {
    return { field, typed: false, text, readBack: null, matches: false, reason: `the ${name} panel is open but has no "${field}" field (the replace field is absent while the editor is read-only)` };
  }
  await loc.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Backspace");
  const segments = text.split("\n");
  for (let i = 0; i < segments.length; i++) {
    if (i > 0) await page.keyboard.press("Control+Enter");
    if (segments[i]) await page.keyboard.type(segments[i]);
  }
  await waitForDomQuiet(page, { quiet: 300, timeout: 4_000 });
  const readBack = await readField(page, field);
  const matches = readBack === text;
  return {
    field,
    typed: true,
    text,
    readBack,
    matches,
    ...(matches ? {} : { reason: `the ${field} field reads back ${JSON.stringify(readBack)} after typing ${JSON.stringify(text)}` }),
  };
}

async function openSurfacesOwning(page, kind, name) {
  const owners = Object.entries(SURFACES).filter(([, s]) => s[kind].includes(name));
  if (owners.length === 0) {
    throw new Error(`unknown ${kind === "buttons" ? "button" : "toggle"} "${name}" (know: ${Object.values(SURFACES).flatMap((s) => s[kind]).join(", ")})`);
  }
  const open = [];
  for (const [surface] of owners) if (await surfaceOpen(page, surface)) open.push(surface);
  return { owners: owners.map(([n]) => n), open };
}

async function clickSurfaceButton(page, name) {
  const { owners, open } = await openSurfacesOwning(page, "buttons", name);
  if (open.length === 0) return { button: name, clicked: false, reason: `no panel with a "${name}" button is open (${owners.join(" or ")})` };
  const surface = open[0];
  await page.locator(`${SURFACES[surface].selector} button[name=${name}]`).first().click();
  await waitForDomQuiet(page, { quiet: 300, timeout: 4_000 });
  return { button: name, surface, clicked: true };
}

async function toggleSurfaceOption(page, name) {
  const { owners, open } = await openSurfacesOwning(page, "toggles", name);
  if (open.length === 0) return { toggle: name, toggled: false, reason: `no panel with a "${name}" toggle is open (${owners.join(" or ")})` };
  const surface = open[0];
  const box = page.locator(`${SURFACES[surface].selector} input[name=${name}]`).first();
  const before = await box.isChecked();
  const label = page.locator(`${SURFACES[surface].selector} label:has(input[name=${name}])`).first();
  if ((await label.count()) > 0) await label.click();
  else await box.click({ force: true });
  await waitForDomQuiet(page, { quiet: 300, timeout: 4_000 });
  const after = await box.isChecked();
  return {
    toggle: name,
    surface,
    toggled: after !== before,
    checked: after,
    ...(after !== before ? {} : { reason: `clicking the "${name}" toggle left it ${after ? "checked" : "unchecked"}` }),
  };
}

async function switchScreen(page, name, { followedByMain = false } = {}) {
  const tab = page.locator(tabSelector(name)).first();
  try {
    await tab.waitFor({ state: "visible", timeout: 10_000 });
  } catch {
    const known = await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].map((t) => t.id.replace(/^.*-trigger-/, "")));
    const inScriptsView = !known.includes("main") && await protocolRequest(page, "editor/read", {}, 500).then(() => true, () => false);
    if (inScriptsView && (name === "main" || name === "scripts")) {
      return { screen: name, active: false, reason: `the logic pane is in its fullscreen scripts view (another file is open), which has no tab row; close that file with the view's own header button, then re-run` };
    }
    return { screen: name, active: false, reason: `no tab named "${name}" on the page (tabs present: ${known.join(", ")})` };
  }
  await tab.click();
  const isMain = name in SCREENS;
  try {
    if (isMain) {
      await page.waitForFunction((selector) => document.querySelector(selector) != null, SCREENS[name], { timeout: 10_000 });
    } else {
      await page.locator(`${tabSelector(name)}[aria-selected="true"]`).first().waitFor({ state: "attached", timeout: 10_000 });
    }
  } catch {
    return {
      screen: name,
      active: false,
      reason: isMain ? `the ${name} screen's content never mounted after the click` : `the ${name} tab never reported itself selected after the click`,
    };
  }
  let settled = await waitForDomQuiet(page, { quiet: 600, timeout: 10_000 });
  const mainTabSelectedOrAbsent = await page.evaluate(() => {
    const main = document.querySelector('[role="tab"][id$="-trigger-main"]');
    return main == null || main.getAttribute("aria-selected") === "true";
  });
  const landsOnEditor = name === "main" || (name === "logic" && mainTabSelectedOrAbsent);
  if (name === "logic" && !mainTabSelectedOrAbsent) {
    return { screen: name, active: true, settled, editorHere: false, note: "the logic pane's own tab is scripts, so no script editor is on screen; use --screen main to reach it" };
  }
  const mountBudget = MOUNT_BUDGET_MS;
  const editorHere = landsOnEditor
    ? (await scriptEditorPresent(page, mountBudget)).present
    : await protocolRequest(page, "editor/read", {}, 500).then(() => true, () => false);
  if (landsOnEditor && !editorHere) {
    const text = `the ${name} tab is up but no script editor mounted within ${seconds(mountBudget)}`;
    if (name === "logic" && followedByMain) return { screen: name, active: true, settled, editorHere: false, note: `${text}; the --screen main that follows waits for it` };
    return { screen: name, active: true, settled, editorHere: false, reason: `${text}. Re-run; if it persists the machine is saturated` };
  }
  if (editorHere) {
    const settleBudget = SETTLE_BUDGET_MS;
    const editorSettled = await settleEditor(page, settleBudget);
    settled = editorSettled && settled;
    if (!editorSettled) {
      return { screen: name, active: true, settled, editorHere: true, editorSettled: false, reason: `the ${name} tab is up but its script editor never settled within ${seconds(settleBudget)}; later steps may have run without settled diagnostics` };
    }
    return { screen: name, active: true, settled, editorHere: true, editorSettled: true };
  }
  return { screen: name, active: true, settled };
}

async function readSurfaces(page) {
  const out = { screen: null, panelTab: null, tabs: [], find: { open: false }, goto: { open: false }, cursorLine: null };
  out.tabs = await page.evaluate(() =>
    [...document.querySelectorAll('[role="tab"]')].map((t) => ({
      value: t.id.replace(/^.*-trigger-/, ""),
      label: t.innerText.split("\n")[0].trim(),
      selected: t.getAttribute("aria-selected") === "true",
    })),
  );
  out.screens = await mountedScreens(page);
  out.screen = out.screens.length === 1 ? out.screens[0] : null;
  out.panelTab = out.tabs.find((t) => t.selected && !(t.value in SCREENS))?.value ?? null;
  const editor = await protocolRequest(page, "editor/read", {}, 500).catch(() => null);
  out.editorView = editor ? await page.evaluate(() => document.querySelector('[role="tab"][id$="-trigger-main"]') ? "main" : "scripts-view") : null;

  if (await surfaceOpen(page, "find")) {
    out.find = {
      open: true,
      search: await readField(page, "search"),
      replace: await readField(page, "replace"),
      matches: await page.locator(".sparkdown-script-editor-root .cm-search .cm-search-matches-label").first().innerText().catch(() => ""),
      toggles: await page.evaluate(() =>
        Object.fromEntries([...document.querySelectorAll('.sparkdown-script-editor-root .cm-search input[type="checkbox"]')].map((c) => [c.name, c.checked])),
      ),
    };
  }
  if (await surfaceOpen(page, "goto")) {
    out.goto = { open: true, line: await readField(page, "line") };
  }
  out.cursorLine = editor ? editor.selection.start.line + 1 : null;
  return out;
}

export function parsePosition(spec) {
  const match = /^(\d+):(\d+)$/.exec(spec);
  const [line, col] = match ? match.slice(1).map(Number) : [];
  if (!Number.isSafeInteger(line) || !Number.isSafeInteger(col) || line < 1 || col < 1) {
    throw new Error(`position must be positive line:col integers, got "${spec}"`);
  }
  return { line, col };
}

export function unionRect(rects, viewport) {
  const visible = rects.filter((r) => r && r.width > 0 && r.height > 0 && r.x < viewport.width && r.y < viewport.height && r.x + r.width > 0 && r.y + r.height > 0);
  if (!visible.length) return null;
  const x = Math.max(0, Math.floor(Math.min(...visible.map((r) => r.x))));
  const y = Math.max(0, Math.floor(Math.min(...visible.map((r) => r.y))));
  const right = Math.min(viewport.width, Math.ceil(Math.max(...visible.map((r) => r.x + r.width))));
  const bottom = Math.min(viewport.height, Math.ceil(Math.max(...visible.map((r) => r.y + r.height))));
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

export async function placeCaret(page, position, { present = scriptEditorPresent } = {}) {
  const editor = await present(page);
  if (!editor.present) return { placed: false, reason: editor.reason };
  const snapshot = await protocolRequest(page, "editor/read");
  const lines = snapshot.textDocument.text.split("\n");
  if (position.line > lines.length || position.col > lines[position.line - 1].length + 1) {
    return { placed: false, reason: "position is outside the open document; choose a line and column within its text" };
  }
  const point = { line: position.line - 1, character: position.col - 1 };
  await protocolNotify(page, "editor/select", { textDocument: { uri: snapshot.textDocument.uri }, range: { start: point, end: point }, takeFocus: true, scrollIntoView: "center" });
  const readBack = await protocolRequest(page, "editor/read");
  const cursor = { line: readBack.selection.start.line + 1, col: readBack.selection.start.character + 1 };
  const placed = cursor.line === position.line && cursor.col === position.col;
  return { placed, cursor, ...(placed ? {} : { reason: "editor did not select the requested position" }) };
}

export async function readLanguageSurface(page, kind) {
  if (kind === "hover") {
    const editor = await protocolRequest(page, "editor/read");
    const result = await protocolRequest(page, "textDocument/hover", { textDocument: { uri: editor.textDocument.uri }, position: editor.selection.start });
    const parts = result ? (Array.isArray(result.contents) ? result.contents : [result.contents]) : [];
    const firstImage = result?.images?.[0];
    return { present: result != null, text: parts.map((p) => typeof p === "string" ? p : p.value).join("\n"),
      contents: result?.contents ?? null, serverResponse: result == null ? "empty" : "received",
      surfaceRect: null, imgRect: null, imgSrc: firstImage?.src ?? null,
      naturalWidth: firstImage?.naturalWidth ?? null, naturalHeight: firstImage?.naturalHeight ?? null };
  }
  return page.evaluate(({ kind, selectors }) => {
    const visible = (selector) => [...document.querySelectorAll(selector)].find((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.left < innerWidth && r.top < innerHeight && r.right > 0 && r.bottom > 0 && getComputedStyle(e).visibility !== "hidden";
    });
    const root = visible(selectors[kind]);
    const info = kind === "completion" ? visible(selectors.info) : root;
    const box = (element) => {
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const img = info?.querySelector("img");
    const rect = img?.getBoundingClientRect();
    const image = {
      imgSrc: img?.currentSrc || img?.src || null,
      imgRect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
      naturalWidth: img?.naturalWidth ?? null,
      naturalHeight: img?.naturalHeight ?? null,
    };
    const label = (option) => option?.querySelector(".cm-completionLabel")?.innerText ?? null;
    const items = [...(root?.querySelectorAll('[role="option"]') ?? [])].map((o) => ({ label: label(o), detail: o.querySelector(".cm-completionDetail")?.innerText ?? null }));
    return {
      popupPresent: Boolean(root),
      options: items.map((item) => item.label),
      optionsTruncated: Boolean(root?.querySelector(".cm-completionListIncompleteTop, .cm-completionListIncompleteBottom")),
      items,
      selected: label(root?.querySelector('[aria-selected="true"]')),
      surfaceRect: box(root),
      infoPanelPresent: Boolean(info),
      infoPanelRect: box(info),
      ...image,
    };
  }, { kind, selectors: LANGUAGE_TARGETS });
}

export async function waitLanguageSurface(page, kind, { read = readLanguageSurface, timeout = 15_000, infoTimeout = 2000, now = Date.now, pause = (ms) => page.waitForTimeout(ms) } = {}) {
  if (kind === "hover") return read(page, kind);
  const end = now() + timeout;
  let surface = await read(page, kind);
  const present = () => kind === "hover" ? surface.present : surface.popupPresent;
  while (!present() && now() < end) {
    await pause(Math.min(50, end - now()));
    surface = await read(page, kind);
  }
  if (kind === "completion" && present()) {
    const infoEnd = now() + infoTimeout;
    while (!surface.infoPanelPresent && now() < infoEnd) {
      await pause(Math.min(50, infoEnd - now()));
      surface = await read(page, kind);
      if (!present()) break;
    }
  }
  return surface;
}

const SEVERITY = { 1: "error", 2: "warning", 3: "information", 4: "hint" };

export async function diagnosticsAt(page, position, { diagnostics = settledDiagnostics } = {}) {
  const settled = await diagnostics(page);
  const line = position.line - 1;
  const character = position.col - 1;
  const before = (a, b) => a.line < b.line || (a.line === b.line && a.character <= b.character);
  const at = { line, character };
  return (settled?.diagnostics ?? [])
    .filter((d) => before(d.range.start, at) && before(at, d.range.end))
    .map((d) => ({
      message: typeof d.message === "string" ? d.message : d.message?.value ?? "",
      severity: SEVERITY[d.severity] ?? d.severity ?? null,
      range: d.range,
    }));
}

async function lintTooltip(page, timeout = 5_000) {
  const selector = ".sparkdown-script-editor-root .cm-tooltip-lint";
  const shown = await page.locator(selector).first().waitFor({ state: "visible", timeout }).then(() => true, () => false);
  return { present: shown, text: shown ? await page.locator(selector).first().innerText() : null };
}

export async function languageSurface(page, kind, position, text, { place = placeCaret, read = readLanguageSurface, wait = waitLanguageSurface, timeout = 15_000, diagnostics = settledDiagnostics } = {}) {
  const empty = kind === "hover" ? { present: false } : { popupPresent: false, options: [], selected: null, infoPanelPresent: false };
  const out = { [kind]: position, ...empty };
  await page.keyboard.press("Escape");
  await page.mouse.move(0, 0);
  const caret = await place(page, position);
  out.caret = caret;
  if (!caret.placed) return { ...out, reason: caret.reason };
  if (kind === "completion") {
    out.editorView = await page.evaluate(() => document.querySelector('[role="tab"][id$="-trigger-main"]') ? "main" : "scripts-view");
    if (out.editorView !== "main") return { ...out, reason: "completion typing requires main.sd on screen; return with the fullscreen scripts view's header button before retrying" };
    const before = await documentLines(page);
    await page.keyboard.type(text);
    const after = await documentLines(page);
    const expected = [...before];
    expected[position.line - 1] = before[position.line - 1].slice(0, position.col - 1) + text + before[position.line - 1].slice(position.col - 1);
    out.typed = text;
    out.textMatches = after.join("\n") === expected.join("\n");
    if (!out.textMatches) return { ...out, reason: "typed text differs from the document read-back; inspect auto-closing characters and the screenshot before retrying" };
  } else {
    const measured = await protocolRequest(page, "editor/read", { position: { line: position.line - 1, character: position.col - 1 } });
    const rect = measured.coordinates;
    const spot = rect ? { x: rect.left + 1, y: (rect.top + rect.bottom) / 2 } : null;
    if (!spot) return { ...out, reason: "hover position is covered or not painted; bring the script into view and retry" };
    await page.mouse.move(spot.x, spot.y, { steps: 5 });
    out.pointer = spot;
  }
  const surface = await wait(page, kind, { read, timeout });
  if (kind === "completion" && surface.popupPresent) {
    await page.waitForFunction(({ kind, selectors }) => {
      const root = document.querySelector(kind === "completion" ? selectors.info : selectors.hover);
      return [...(root?.querySelectorAll("img") ?? [])].every((img) => img.complete);
    }, { kind, selectors: LANGUAGE_TARGETS }, { timeout: 10_000 }).catch(() => {});
  }
  Object.assign(out, await read(page, kind));
  if (kind === "hover") {
    const found = await diagnosticsAt(page, position, { diagnostics });
    out.diagnostics = found;
    if (found.length > 0) {
      let spot = { x: out.pointer.x + 2, y: out.pointer.y };
      const { start, end } = found[0].range;
      const atEnd = end.line === position.line - 1 && end.character === position.col - 1;
      const nonEmpty = start.line < end.line || start.character < end.character;
      if (atEnd && nonEmpty) {
        const lines = (await protocolRequest(page, "editor/read")).textDocument.text.split("\n");
        let line = end.line;
        let character = end.character;
        let at = null;
        while (line > start.line || character > start.character) {
          if (character === 0) {
            line -= 1;
            character = (lines[line] ?? "").length;
            continue;
          }
          at = { line, character: character - 1 };
          break;
        }
        if (at) {
          const inside = await protocolRequest(page, "editor/read", { position: at });
          const rect = inside.coordinates;
          if (rect) spot = { x: rect.left + 2, y: (rect.top + rect.bottom) / 2 };
        }
      }
      out.tooltipPointer = spot;
      await page.mouse.move(spot.x, spot.y, { steps: 2 });
      out.diagnosticTooltip = await lintTooltip(page);
      if (!out.diagnosticTooltip.present) {
        out.reason = `a diagnostic is at this position (${found[0].message}) but its tooltip did not open under the pointer`;
      }
      return out;
    }
  }
  if (!(kind === "hover" ? out.present : out.popupPresent)) {
    out.serverResponse ??= "unobserved";
    out.reason = kind === "hover" ? "The language server returned no hover at this position" : "Completion did not appear; inspect the screenshot and requested position";
  }
  return out;
}

async function shotOf(page, what, out) {
  if (!(what in SHOT_TARGETS)) throw new Error(`unknown --shot-of target "${what}" (know: ${Object.keys(SHOT_TARGETS).join(", ")})`);
  if (!out) throw new Error(`--shot-of ${what} needs an output path`);
  const target = path.resolve(out);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (SHOT_TARGETS[what] == null) {
    await page.screenshot({ path: target, fullPage: false });
  } else if (what === "hover") {
    const tooltip = page.locator(SHOT_TARGETS.hover).first();
    try { await tooltip.screenshot({ path: target, timeout: 5000 }); }
    catch { return { of: what, screenshot: null, reason: "Hover is not visible for its screenshot" }; }
  } else if (what === "completion") {
    const surface = await waitLanguageSurface(page, what, { timeout: 2000 });
    const clip = surface.surfaceRect && unionRect([surface.surfaceRect, surface.infoPanelRect], page.viewportSize());
    if (!clip) return { of: what, screenshot: null, reason: `${what} is outside the viewport or not on screen; re-open it on a visible line` };
    await page.screenshot({ path: target, clip });
  } else {
    const loc = page.locator(SHOT_TARGETS[what]).first();
    if (!(await loc.isVisible().catch(() => false))) {
      return { of: what, screenshot: null, reason: `${SHOT_TARGETS[what]} is not on screen` };
    }
    await loc.screenshot({ path: target });
  }
  return { of: what, screenshot: target };
}

export function followedByMain(steps, index) {
  return steps[index + 1]?.screen === "main";
}

export function parseUiSteps(args) {
  const steps = [];
  const screenName = /^[a-z][a-z0-9-]*$/;
  const fields = Object.values(SURFACES).flatMap((s) => Object.keys(s.fields));
  const buttons = Object.values(SURFACES).flatMap((s) => s.buttons);
  const toggles = Object.values(SURFACES).flatMap((s) => s.toggles);
  const bad = (msg) => {
    throw new Error(`ui: ${msg}`);
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const value = () => {
      const v = args[i + 1];
      if (v == null || v === "" || v.startsWith("--")) bad(`${a} needs a value`);
      i++;
      return v;
    };
    switch (a) {
      case "--fresh-sw":
        steps.push({ freshSw: true });
        break;
      case "--hover":
        steps.push({ hover: parsePosition(value()) });
        break;
      case "--complete": {
        const spec = value();
        const eq = spec.indexOf("=");
        if (eq < 0 || !spec.slice(eq + 1)) bad("--complete needs position=text with non-empty text");
        steps.push({ complete: parsePosition(spec.slice(0, eq)), text: spec.slice(eq + 1) });
        break;
      }
      case "--insert": {
        const spec = value();
        const eq = spec.indexOf("=");
        if (eq < 0) bad("--insert needs line:col=text");
        const text = spec.slice(eq + 1).replace(/\\([\\n])/g, (_, c) => (c === "n" ? "\n" : "\\"));
        if (!text || text.length > INSERT_TEXT_LIMIT) bad(`--insert text must be 1..${INSERT_TEXT_LIMIT} characters`);
        steps.push({ insert: parsePosition(spec.slice(0, eq)), text });
        break;
      }
      case "--play": {
        const v = value();
        if (v !== "start" && v !== "stop") bad(`--play takes start or stop, got "${v}"`);
        steps.push({ play: v });
        break;
      }
      case "--advance": {
        const v = args[i + 1];
        if (v == null || v.startsWith("--")) {
          steps.push({ advance: 1 });
          break;
        }
        if (!/^\d+$/.test(v) || !Number.isSafeInteger(Number(v)) || Number(v) < 1) bad(`--advance takes a positive click count, got "${v}"`);
        i++;
        steps.push({ advance: Number(v) });
        break;
      }
      case "--scrub": {
        const v = value();
        if (!/^\d+$/.test(v) || !Number.isSafeInteger(Number(v)) || Number(v) < 1) bad(`--scrub needs a positive line number, got "${v}"`);
        steps.push({ scrub: Number(v) });
        break;
      }
      case "--sd":
        steps.push({ sd: value() });
        break;
      case "--project":
        steps.push({ project: value() });
        break;
      case "--screen": {
        const v = value();
        if (!screenName.test(v)) bad(`a screen is a tab value such as logic, assets, share, main, scripts (lowercase), got "${v}"`);
        steps.push({ screen: v });
        break;
      }
      case "--open":
      case "--close": {
        const v = value();
        if (!SURFACES[v]) bad(`unknown panel "${v}" (know: ${Object.keys(SURFACES).join(", ")})`);
        steps.push(a === "--open" ? { open: v } : { close: v });
        break;
      }
      case "--type": {
        const spec = value();
        const eq = spec.indexOf("=");
        if (eq <= 0) bad(`--type wants field=text with a field name, got "${spec}"`);
        const field = spec.slice(0, eq);
        if (!fields.includes(field)) bad(`unknown field "${field}" (know: ${fields.join(", ")})`);
        steps.push({ type: field, text: spec.slice(eq + 1).replace(/\\n/g, "\n") });
        break;
      }
      case "--press": {
        const v = value();
        try {
          normalizeKeyCombo(v);
        } catch (e) {
          bad(e.message);
        }
        steps.push({ press: v });
        break;
      }
      case "--click": {
        const v = value();
        if (!buttons.includes(v)) bad(`unknown button "${v}" (know: ${buttons.join(", ")})`);
        steps.push({ click: v });
        break;
      }
      case "--toggle": {
        const v = value();
        if (!toggles.includes(v)) bad(`unknown toggle "${v}" (know: ${toggles.join(", ")})`);
        steps.push({ toggle: v });
        break;
      }
      case "--shot":
        steps.push({ shotOf: "page", out: value() });
        break;
      case "--shot-of": {
        const what = value();
        if (!(what in SHOT_TARGETS)) bad(`unknown --shot-of target "${what}" (know: ${Object.keys(SHOT_TARGETS).join(", ")})`);
        const out = value();
        steps.push({ shotOf: what, out });
        break;
      }
      case "--probe":
        steps.push({ probe: value() });
        break;
      case "--headed":
        break;
      default:
        bad(`unknown argument ${a}`);
    }
  }
  const firstSd = steps.findIndex((s) => s.sd);
  const lastProject = steps.map((s) => Boolean(s.project)).lastIndexOf(true);
  if (firstSd >= 0 && lastProject > firstSd) {
    bad(`--sd (step ${firstSd + 1}) comes before --project (step ${lastProject + 1}), whose seed would remove or replace the main.sd it wrote; put every --sd after the last --project`);
  }
  return steps;
}

function gatedStep(step, reason) {
  const gated = { gated: true, reason };
  if (step.sd) return { sd: step.sd, wroteChars: null, ...gated };
  if (step.screen) return { screen: step.screen, active: false, ...gated };
  if (step.open) return { surface: step.open, open: false, ...gated };
  if (step.close) return { surface: step.close, open: null, closed: false, ...gated };
  if (step.type) return { field: step.type, typed: false, text: step.text, readBack: null, matches: false, ...gated };
  if (step.press) return { press: step.press, sent: null, ...gated };
  if (step.click) return { button: step.click, clicked: false, ...gated };
  if (step.toggle) return { toggle: step.toggle, toggled: false, ...gated };
  if (step.shotOf) return { of: step.shotOf, screenshot: null, ...gated };
  if (step.hover) return { hover: step.hover, present: false, ...gated };
  if (step.complete) return { completion: step.complete, popupPresent: false, ...gated };
  if (step.play) return { play: step.play, clicked: false, reached: false, ...gated };
  if (step.advance) return { advance: step.advance, clicked: 0, clicks: [], ...gated };
  if (step.insert) return { insert: step.insert, inserted: false, textMatches: false, ...gated };
  if (step.scrub) return { scrub: step.scrub, clicked: false, ...gated };
  return { ...step, ...gated };
}

async function ui(args, deps = liveDeps) {
  const headless = !args.includes("--headed");
  let steps;
  try {
    steps = parseUiSteps(args);
  } catch (e) {
    deps.die(e.message);
  }
  for (const step of steps) {
    if (step.project && !fs.existsSync(path.resolve(step.project))) deps.die(`ui: --project ${step.project} does not exist`);
  }

  return deps.withEditor(
    async ({ page, ctx, url, consoleLines, cleanups = [] }) => {
      const result = { url, steps: [] };
      let monitoredWorker;
      const finishWorker = async () => {
        if (!monitoredWorker) return;
        const { worker, step } = monitoredWorker;
        await worker.finish();
        if (worker.report.reason) step.reason = worker.report.reason;
        await worker.close();
        monitoredWorker = null;
        return step.reason;
      };
      const requireEditor = editorGate();
      try {
        await openEditorPage(page, url);
        await deps.waitForApp(page);
      } catch (err) {
        result.failed = [`the editor page did not load (${String(err.message || err).split("\n")[0]}). Check \`status\`; the machine may be saturated.`];
        deps.log(JSON.stringify(result, null, 2));
        process.exitCode = 1;
        return result;
      }
      result.startedOn = await deps.activeScreen(page);
      let gate = (await deps.interruptedSeed(page)) ? interruptedSeedError() : null;
      const expectedAtStart = await deps.editorExpectedHere(page);
      if (expectedAtStart === false) {
        if (result.startedOn === "logic") result.startNote = "the run started on the logic screen's scripts tab, where there is no script editor; --screen main reaches it";
      } else {
        const mountBudget = MOUNT_BUDGET_MS;
        const here = await deps.scriptEditorPresent(page, mountBudget);
        result.editorSettled = here.present ? await deps.settleEditor(page, SETTLE_BUDGET_MS) : false;
        if (result.editorSettled) requireEditor.noteSettled();
        if (!here.present) {
          result.startNote = expectedAtStart == null
            ? `no pane had mounted ${seconds(mountBudget)} after the page loaded; each later step that needs the editor waits again and reports for itself`
            : `the script editor had not mounted ${seconds(mountBudget)} after the page loaded; each later step that needs it waits again and reports for itself`;
        }
      }

      for (const [index, step] of steps.entries()) {
        const stepNo = index + 1;
        if (gate && !step.project && !step.probe) {
          const rest = steps.length - stepNo;
          result.steps.push(gatedStep(step, `${gate}${rest > 0 ? ` The ${rest} step${rest === 1 ? "" : "s"} after this one did not run.` : ""}`));
          break;
        }
        let written = null;
        try {
          if (step.freshSw) {
            const priorFailure = await finishWorker();
            if (priorFailure) {
              result.steps.push({ freshSw: true, reason: `the preceding worker check failed; this refresh did not run${steps.length > stepNo ? `, nor did the ${steps.length - stepNo} remaining step${steps.length - stepNo === 1 ? "" : "s"}` : ""}` });
              break;
            }
            const worker = await deps.reportFreshWorker(page, ctx, reloadEditorPage);
            cleanups.push(worker.close);
            const workerStep = { freshSw: true, serviceWorker: worker.report };
            result.steps.push(workerStep);
            if (worker.report.reason) {
              workerStep.reason = `${worker.report.reason}${steps.length > stepNo ? `. The ${steps.length - stepNo} remaining step${steps.length - stepNo === 1 ? "" : "s"} did not run.` : ""}`;
              break;
            }
            monitoredWorker = { worker, step: workerStep };
            requireEditor.reset();
            await deps.waitForApp(page);
          } else if (step.sd || step.project) {
            let out;
            if (step.project) {
              const seeded = await deps.seedProject(page, step.project, { expectMainSd: !steps.slice(index + 1).some((s) => s.sd) });
              out = { project: step.project, seed: seeded };
              written = out;
              if (seeded.reason) {
                out.reason = seeded.reason;
                gate = (await deps.interruptedSeed(page))
                  ? interruptedSeedError()
                  : `the --project seed in step ${stepNo} was refused (${seeded.reason}), so storage holds the project that was there before, which this run did not ask for.`;
                result.steps.push(out);
                continue;
              }
              gate = null;
            } else {
              const src = fs.readFileSync(path.resolve(step.sd), "utf8");
              out = { sd: step.sd, wroteChars: null };
              written = out;
              out.wroteChars = await deps.writeMainSd(page, src);
            }
            const wrote = step.project ? "--project seeded the project, whose main.sd" : "--sd wrote main.sd, which";
            requireEditor.reset();
            await reloadEditorPage(page);
            await deps.waitForApp(page);
            const expectedAfterReload = await deps.editorExpectedHere(page);
            const editor = expectedAfterReload === false ? await deps.scriptEditorPresent(page, 1_000) : await deps.scriptEditorPresent(page, 60_000);
            if (editor.present) {
              out.editorSettled = await deps.settleEditor(page, SETTLE_BUDGET_MS);
              if (out.editorSettled) requireEditor.noteSettled();
              const observable = await page
                .waitForFunction(() => window.__preview != null, null, { timeout: 15_000 })
                .then(() => true, () => false);
              if (observable) {
                const mount = await deps.waitForGame(page, { ensure: deps.ensureScriptEditor });
                if (mount.reloaded) {
                  out.neededReload = true;
                  requireEditor.reset();
                  out.editorSettled = await deps.settleEditor(page, SETTLE_BUDGET_MS);
                  if (out.editorSettled) requireEditor.noteSettled();
                }
                if (mount.switched) out.switchedToLogic = true;
                if (mount.mounted) {
                  const program = await deps.waitForProgram(page);
                  out.programLoaded = program.loaded;
                  if (program.loaded === false) out.programNote = programWarning(program);
                  out.previewSettled = (await deps.waitForPreviewSettle(page)).settled;
                } else {
                  out.programLoaded = null;
                  out.previewSettled = null;
                  out.reason = `the game never mounted (#game absent) within ${seconds(GAME_MOUNT_BUDGET_MS)} of the reload and again after a recovery reload, so the Game Preview is blank and nothing captured after this step is evidence of it; \`down\`, then \`up\`, then re-run${mount.error ? ` (on the reload retry: ${mount.error})` : ""}`;
                }
              } else {
                out.previewSettled = null;
                out.previewNote = "the game preview is not observable (cross-origin mode, or the preview is showing the screenplay), so the first compile was not waited for";
              }
              if (!out.editorSettled) {
                const settleReason = `the script editor never settled within ${seconds(SETTLE_BUDGET_MS)} after the reload; later steps may have run without settled diagnostics`;
                out.reason = out.reason ? `${out.reason}; also ${settleReason}` : settleReason;
              }
              out.editorView = await page.evaluate(() => (document.querySelector('[role="tab"][id$="-trigger-main"]') ? "main" : "scripts-view"));
              if (out.editorView === "scripts-view") {
                const viewReason = `the logic pane is showing its fullscreen scripts view (another file is open); ${wrote} is not the file on screen. Close that file in the editor and re-run`;
                out.reason = out.reason ? `${out.reason}; also ${viewReason}` : viewReason;
              }
            } else {
              out.reason = editor.reason;
            }
            await deps.waitForDomQuiet(page, { quiet: 1500, timeout: 30_000 });
            result.steps.push(out);
          } else if (step.screen) {
            const switched = await switchScreen(page, step.screen, { followedByMain: followedByMain(steps, index) });
            if (switched.editorSettled) requireEditor.noteSettled();
            result.steps.push(switched);
          } else if (step.hover || step.complete) {
            const ready = await requireEditor(page, "language surface", stepNo);
            if (ready.ok === false) {
              result.steps.push(gatedStep(step, ready.reason));
              continue;
            }
            result.steps.push(await deps.languageSurface(page, step.hover ? "hover" : "completion", step.hover ?? step.complete, step.text));
          } else if (step.open) {
            const ready = await requireEditor(page, "panel", stepNo);
            if (ready.ok === false) {
              result.steps.push(gatedStep(step, ready.reason));
              continue;
            }
            result.steps.push(await openSurface(page, step.open, { settled: ready.ok === true }));
          } else if (step.close) {
            result.steps.push(await closeSurface(page, step.close));
          } else if (step.type) {
            const ready = await requireEditor(page, "field", stepNo);
            if (ready.ok === false) {
              result.steps.push(gatedStep(step, ready.reason));
              continue;
            }
            result.steps.push(await typeInto(page, step.type, step.text, { settled: ready.ok === true }));
          } else if (step.press) {
            const ready = await requireEditor(page, "key press", stepNo);
            if (ready.ok === false) {
              result.steps.push(gatedStep(step, ready.reason));
              continue;
            }
            result.steps.push(await pressInEditor(page, step.press, { wait: deps.waitForDomQuiet }));
          } else if (step.play || step.advance || step.insert || step.scrub) {
            const ready = await requireEditor(page, step.play ? "PLAY" : step.advance ? "advance" : step.insert ? "insert" : "scrub", stepNo);
            if (ready.ok === false) {
              result.steps.push(gatedStep(step, ready.reason));
              continue;
            }
            if (step.play) result.steps.push(await playPreview(page, step.play));
            else if (step.advance) result.steps.push(await advanceGame(page, step.advance));
            else if (step.insert) result.steps.push(await insertText(page, step.insert, step.text, { settle: deps.waitForPreviewSettle, route: deps.routeLabel }));
            else result.steps.push(scrubReport(step.scrub, await scrubPreview(page, step.scrub, deps)));
          } else if (step.click) {
            result.steps.push(await clickSurfaceButton(page, step.click));
          } else if (step.toggle) {
            result.steps.push(await toggleSurfaceOption(page, step.toggle));
          } else if (step.shotOf) {
            const ready = await requireEditor(page, "screenshot", stepNo);
            if (ready.ok === false) {
              result.steps.push(gatedStep(step, ready.reason));
              continue;
            }
            result.steps.push(await shotOf(page, step.shotOf, step.out));
          } else if (step.probe) {
            const code = fs.readFileSync(path.resolve(step.probe), "utf8");
            result.steps.push({
              probe: step.probe,
              result: await page.evaluate(
                // eslint-disable-next-line no-new-func
                (src) => new Function(`return (async () => { ${src} })()`)(),
                code,
              ),
            });
          }
        } catch (err) {
          const message = String(err.message || err).split("\n")[0];
          result.steps.push({ ...(written ?? step), reason: `step threw: ${message}` });
          if (step.sd || step.project) {
            gate = `the ${step.project ? "--project" : "--sd"} step ${stepNo} threw (${message}), so the page is not known to show what storage holds.`;
          }
        }
      }

      result.script = await deps
        .loadedScript(page, steps.some((s) => s.sd))
        .catch((err) => ({ file: "main.sd", read: false, reason: String(err.message || err).split("\n")[0] }));

      try {
        result.ui = await deps.readSurfaces(page);
      } catch (err) {
        result.ui = null;
        result.readError = String(err.message || err).split("\n")[0];
      }
      await finishWorker();
      result.failed = result.steps.filter((s) => s.reason).map((s) => s.reason);
      if (result.readError) result.failed.push(`read-back failed: ${result.readError}`);
      const captured = partitionConsole(consoleLines);
      result.consoleErrors = captured.errors;
      result.consoleNoise = captured.noise;
      deps.log(JSON.stringify(result, null, 2));
      process.exitCode = result.failed.length > 0 ? 1 : 0;
      return result;
    },
    { headless },
  );
}

async function redgreenCli(args) {
  let report;
  try {
    const opts = parseRedGreenArgs(args);
    const cwd = process.cwd();
    if (!sameDir(cwd, REPO_ROOT)) {
      const top = (() => {
        try {
          return gitTopLevel(cwd);
        } catch {
          return null;
        }
      })();
      die(
        top && !sameDir(top, REPO_ROOT)
          ? `redgreen: run it from this driver's own worktree root (${REPO_ROOT}), not from ${cwd}, which is ${sameDir(top, cwd) ? "the root of" : "inside"} a different checkout${sameDir(top, cwd) ? "" : ` (${path.resolve(top)})`}`
          : `redgreen: run from the repository root (${REPO_ROOT}), not from ${cwd}; --files paths and the test command resolve from there`,
      );
    }
    report = runRedGreen({
      repoRoot: cwd,
      test: opts.test,
      files: opts.files,
      base: opts.base,
      log: (line) => console.error(line),
    });
  } catch (e) {
    die(e.message);
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

export {
  withEditor,
  openEditorPage,
  reloadEditorPage,
  EDITOR_NAVIGATION,
  writeMainSd,
  loadedScript,
  installHealth,
  consoleLine,
  KNOWN_CONSOLE_NOISE,
  partitionConsole,
  verify,
  ui,
  seed,
  liveDeps,
  seedProject,
  clearProject,
  beginSeed,
  seedInterrupted,
  interruptedSeed,
  interruptedSeedError,
  kindClashes,
  writeProjectBatch,
  pruneProject,
  readProjectFile,
  walkProjectDir,
  collectProject,
  SEED_BATCH_BYTES,
  SEED_LIMITS,
  SEED_MARKER,
  waitForProgram,
  programWarning,
  gameMountedWithin,
  waitForGame,
  gatedStep,
  waitForEditor,
  waitForApp,
  ensureScriptEditor,
  settleEditor,
  scriptEditorPresent,
  editorExpectedHere,
  editorGate,
  activeScreen,
  waitForDomQuiet,
  focusEditor,
  pressKey,
  openSurface,
  closeSurface,
  typeInto,
  readField,
  readSurfaces,
  clickSurfaceButton,
  toggleSurfaceOption,
  switchScreen,
  shotOf,
  SURFACES,
  SCREENS,
  hereOrPrevious,
  pidAlive,
  recordStands,
  processStartedMs,
  resolveChromiumExecutablePath,
  liveProbe,
  READY_WAIT_MS,
  LAUNCH_SLACK_MS,
  START_GRAIN_MS,
};

function flag(args, name) {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  if (v == null || v === "" || v.startsWith("--")) throw new Error(`${name} needs a value`);
  return v;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const liveDeps = {
  reportFreshWorker,
  languageSurface,
  withEditor,
  log: console.log,
  die,
  seedProject,
  clearProject,
  interruptedSeed,
  writeMainSd,
  loadedScript,
  waitForApp,
  ensureScriptEditor,
  waitForGame,
  waitForProgram,
  waitForPreviewSettle,
  waitForDomQuiet,
  previewSummary,
  editorPainted,
  clickLine,
  documentLines,
  routeLabel,
  activeScreen,
  editorExpectedHere,
  scriptEditorPresent,
  settleEditor,
  readSurfaces,
};

const runAsCli =
  process.argv[1] != null &&
  fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));

const [cmd, ...rest] = runAsCli ? process.argv.slice(2) : ["__imported__"];
switch (cmd) {
  case "__imported__":
    break;
  case "preflight":
    await preflight(rest);
    break;
  case "up":
    await up(rest).catch((error) => die(error.message));
    break;
  case "down":
    await down(rest);
    break;
  case "status":
    await status(rest);
    break;
  case "verify":
    await verify(rest);
    break;
  case "ui":
    await ui(rest);
    break;
  case "seed":
    await seed(rest);
    break;
  case "redgreen":
    await redgreenCli(rest);
    break;
  case "measure": {
    const { measure } = await import("./measure.mjs");
    await measure(rest, {
      importPlaywright,
      resolveChromiumExecutablePath,
      chromiumChoiceLine,
      withEditor,
      openEditorPage,
      reloadEditorPage,
      waitForApp,
      seedProject,
      switchScreen,
      scriptEditorPresent,
      settleEditor,
      waitForGame,
      waitForProgram,
      waitLanguageSurface,
      readLanguageSurface,
      log,
      die,
    });
    break;
  }
  case "timing": {
    const { timing } = await import("./timing.mjs");
    await timing(rest, {
      importPlaywright,
      resolveChromiumExecutablePath,
      chromiumChoiceLine,
      withEditor,
      openEditorPage,
      reloadEditorPage,
      waitForApp,
      seedProject,
      switchScreen,
      scriptEditorPresent,
      settleEditor,
      waitForGame,
      waitForProgram,
      clickLine,
      log,
      die,
    });
    break;
  }
  default:
    log(
      [
        "usage: node .agents/skills/drive-web-editor/driver.mjs <command>",
        "",
        "  preflight [--tooling-only]  check disk headroom, playwright, gh auth BEFORE doing work; --tooling-only skips the browser and install probes",
        "  up [--cross-origin]   boot both dev servers, wait for ready, record the URL",
        "  status [--all]        is it up? prints the editor URL (--all: every session's servers for this checkout)",
        "  down [--force]        kill the server tree this session launched (--force: any session's)",
        "  verify [options]      drive the game preview and print a JSON report",
        "  ui [steps]            drive the editor's own panels and screens; print a JSON report",
        "  seed --project <p>    load a project directory or exported zip into OPFS /local, then reload",
        "  seed --clear          empty OPFS /local (dot entries stay), then reload; with --project, clear first",
        "  redgreen [options]    prove a regression test fails on the base and passes on the fix",
        "  measure [options]     time key press to painted preview at one line, in a browser profile of its own",
        "  timing input|metronome [options]  time input and audio against the running game, in a browser profile of its own",
        "",
        "verify options:",
        "  --fresh-sw       unregister and reload; report the controlling worker's script hash and console",
        "  --project <dir-or-zip> replace OPFS /local with this project's files (before --sd), then reload",
        "  --sd <file.sd>   load this script into OPFS /local/main.sd, then reload",
        "  --line <N>       scrub the preview to source line N (STOPPED state only)",
        "  --shot <out.png> screenshot the editor page",
        "  --probe <file.js> body of an async fn evaluated in the editor page; result -> JSON",
        "  --headed         run a visible browser instead of headless",
        "",
        "ui steps (run in the order given, then every surface is read back):",
        "  --fresh-sw             unregister and reload; report the controlling worker's script hash and console",
        "  --hover <line>:<col>    open a hover with real pointer movement (positions count from one)",
        "  --complete <line>:<col>=<text>  type real keystrokes and read completion plus its info panel",
        "  --project <dir-or-zip>  replace OPFS /local with this project's files, then reload",
        "  --sd <file.sd>          load this script into OPFS /local/main.sd, then reload",
        "  --screen <name>         click a tab: logic | assets | share, or one inside a pane: main | scripts | files | urls | game | screenplay",
        "  --open <panel>          open a panel on its shortcut: find (Ctrl+F) | goto (Ctrl+G)",
        "  --close <panel>         close it with Escape",
        "  --type <field>=<text>   real keystrokes into search | replace | line; \\n = Ctrl+Enter",
        "  --press <combo>         a key combo, e.g. Control+Shift+G (a shifted letter is uppercased)",
        "  --click <button>        a panel button: next prev select replace replaceAll close submit",
        "  --toggle <option>       flip a find-panel checkbox: case | re | word",
        "  --shot <out.png>        screenshot the page",
        "  --shot-of <what> <png>  screenshot one surface: find | goto | editor | hover | completion | page",
        "  --probe <file.js>       body of an async fn evaluated in the page; result -> JSON",
        "  --headed                run a visible browser instead of headless",
        "",
        "redgreen options:",
        "  --test <command>        the test invocation, run twice from the repo root",
        "  --files <a> [<b>...]    the changed source files the test exercises",
        "  --base <rev>            where the pre-fix content comes from (default HEAD;",
        "                          pass origin/main once the fix is committed)",
        "",
        "measure: see references/performance.md; `measure --help` lists its options.",
        "timing: see references/performance.md; `timing --help` lists its options.",
      ].join("\n"),
    );
}

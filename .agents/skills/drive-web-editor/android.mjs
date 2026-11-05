import { execFile } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

export const DEVICE_KINDS = ["android"];
export const CHROME_PACKAGE = "com.android.chrome";
export const MIN_CHROME_MAJOR = 87;
export const DEVICE_WAIT_SECONDS = 900;
export const LONG_PRESS_MS = 750;
export const SWIPE_MS = 300;
export const BIND_STALL_MS = 1_000;
export const LOOKUP_MS = 3_000;
export const ORIENTATIONS = { portrait: 0, landscape: 1 };

export const ANDROID_SETUP = [
  "One-time Android emulator setup (the driver installs nothing; do this once on the machine):",
  "  1. Install Android Studio with the SDK Platform-Tools and the Android Emulator; on Windows, turn on the Windows Hypervisor Platform.",
  "  2. In Android Studio's Device Manager, create a Pixel-class virtual device on API 34 with a Google APIs system image.",
  "  3. Boot it, open Chrome (87 or later), finish its first-run screens, open chrome://flags, enable \"Enable command line on non-rooted devices\" and relaunch Chrome.",
  "  4. Put the SDK's platform-tools folder on PATH, or set ANDROID_HOME to the SDK folder.",
  "  5. With the emulator running, `adb devices` lists it as `device`; then rerun this command.",
].join("\n");

const adbName = (platform) => (platform === "win32" ? "adb.exe" : "adb");

export function defaultSdkAdb({ env = process.env, platform = process.platform } = {}) {
  if (platform === "win32") return env.LOCALAPPDATA ? path.win32.join(env.LOCALAPPDATA, "Android", "Sdk", "platform-tools", "adb.exe") : null;
  const home = env.HOME;
  if (!home) return null;
  return platform === "darwin" ? path.posix.join(home, "Library", "Android", "sdk", "platform-tools", "adb") : path.posix.join(home, "Android", "Sdk", "platform-tools", "adb");
}

export function findAdb({ env = process.env, platform = process.platform, exists = fs.existsSync } = {}) {
  const join = platform === "win32" ? path.win32.join : path.posix.join;
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const dirs = (env[pathKey] ?? "").split(platform === "win32" ? ";" : ":").filter(Boolean);
  for (const dir of dirs) {
    const candidate = join(dir.replace(/^"|"$/g, ""), adbName(platform));
    if (exists(candidate)) return candidate;
  }
  for (const name of ["ANDROID_HOME", "ANDROID_SDK_ROOT"]) {
    if (!env[name]) continue;
    const candidate = join(env[name], "platform-tools", adbName(platform));
    if (exists(candidate)) return candidate;
  }
  return null;
}

export function adbMissingMessage({ env = process.env, platform = process.platform, exists = fs.existsSync } = {}) {
  const sdk = defaultSdkAdb({ env, platform });
  const found = sdk && exists(sdk) ? ` Android Studio's copy is at ${sdk}: put its folder on PATH.` : "";
  return `--device android needs adb, and there is none on PATH or under ANDROID_HOME or ANDROID_SDK_ROOT.${found}\n${ANDROID_SETUP}`;
}

export function requireAdb(options = {}) {
  const adb = findAdb(options);
  if (!adb) throw new Error(adbMissingMessage(options));
  return adb;
}

export function runAdb(adb, args, { timeout = 20_000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(adb, args, { timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const detail = String(stderr || error.message).trim().split("\n")[0];
        reject(new Error(`adb ${args.join(" ")} failed${error.killed ? ` after ${timeout / 1000} s` : ""}: ${detail}`));
      } else resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

export function parseAdbDevices(stdout) {
  return String(stdout)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("List of devices") && !line.startsWith("*"))
    .map((line) => {
      const [serial, state = "unknown"] = line.split(/\s+/);
      return { serial, state };
    });
}

export function chooseDevice(rows, wanted = null) {
  const listed = rows.map((row) => `${row.serial} (${row.state})`).join(", ");
  if (rows.length === 0) throw new Error(`no Android device is attached: \`adb devices\` lists none. Start the emulator and wait for it to finish booting.\n${ANDROID_SETUP}`);
  const pool = wanted ? rows.filter((row) => row.serial === wanted) : rows;
  if (wanted && pool.length === 0) throw new Error(`ANDROID_SERIAL is ${wanted}, which \`adb devices\` does not list (it lists ${listed})`);
  const ready = pool.filter((row) => row.state === "device");
  if (ready.length === 0) {
    throw new Error(`no Android device is ready: \`adb devices\` lists ${listed}. An emulator still booting reads offline; unauthorized means the device has not accepted this computer's debugging key.\n${ANDROID_SETUP}`);
  }
  if (ready.length > 1) throw new Error(`several Android devices are ready (${ready.map((row) => row.serial).join(", ")}); set ANDROID_SERIAL to the one to drive`);
  return ready[0].serial;
}

export function parseChromeVersion(dumpsys) {
  const match = /versionName=(\d+)\.[\d.]+/.exec(String(dumpsys));
  return match ? { version: match[0].slice("versionName=".length), major: Number(match[1]) } : null;
}

export function requireChrome(chrome, serial) {
  if (!chrome) throw new Error(`Chrome (${CHROME_PACKAGE}) is not installed on ${serial}; use a system image that ships Chrome.\n${ANDROID_SETUP}`);
  if (chrome.major < MIN_CHROME_MAJOR) throw new Error(`Chrome on ${serial} is ${chrome.version}; the route needs ${MIN_CHROME_MAJOR} or later. Update Chrome on the device.\n${ANDROID_SETUP}`);
  return chrome;
}

export function parseWmSize(output) {
  const text = String(output);
  const pick = (label) => {
    const match = new RegExp(`${label} size:\\s*(\\d+)x(\\d+)`).exec(text);
    return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
  };
  const physical = pick("Physical");
  if (!physical) throw new Error(`could not read the screen size from \`wm size\`: ${text.trim()}`);
  return { physical, override: pick("Override") };
}

export function parseWmDensity(output) {
  const text = String(output);
  const pick = (label) => {
    const match = new RegExp(`${label} density:\\s*(\\d+)`).exec(text);
    return match ? Number(match[1]) : null;
  };
  const physical = pick("Physical");
  if (physical == null) throw new Error(`could not read the screen density from \`wm density\`: ${text.trim()}`);
  return { physical, override: pick("Override") };
}

export function densityForWidth(screenWidthPx, cssWidth) {
  return Math.round((screenWidthPx * 160) / cssWidth);
}

export function parsePoint(spec, name) {
  const match = /^(\d+),(\d+)$/.exec(spec ?? "");
  if (!match) throw new Error(`${name} takes screen pixels as X,Y, such as 540,1200, got "${spec}"`);
  return { x: Number(match[1]), y: Number(match[2]) };
}

export function parseGesture(spec, name, { twoPoints, defaultMs }) {
  const parts = String(spec ?? "").split(":");
  const points = twoPoints ? 2 : 1;
  if (parts.length < points || parts.length > points + 1) {
    throw new Error(`${name} takes ${twoPoints ? "X1,Y1:X2,Y2" : "X,Y"} in screen pixels with an optional :MS duration, got "${spec}"`);
  }
  const at = parts.slice(0, points).map((part) => parsePoint(part, name));
  const msText = parts[points];
  if (msText != null && !/^\d+$/.test(msText)) throw new Error(`${name} duration must be whole milliseconds, got "${msText}"`);
  const ms = msText == null ? defaultMs : Number(msText);
  if (ms < 1 || ms > 60_000) throw new Error(`${name} duration must be 1..60000 ms, got ${ms}`);
  return twoPoints ? { from: at[0], to: at[1], ms } : { at: at[0], ms };
}

export function takeDeviceFlags(argv) {
  const take = (name) => {
    const at = argv.indexOf(name);
    if (at < 0) return null;
    const value = argv[at + 1];
    if (value == null || value === "" || value.startsWith("--")) throw new Error(`${name} needs a value`);
    argv.splice(at, 2);
    if (argv.includes(name)) throw new Error(`${name} was given more than once`);
    return value;
  };
  const kind = take("--device");
  if (kind != null && !DEVICE_KINDS.includes(kind)) throw new Error(`--device takes ${DEVICE_KINDS.join(" or ")}, got "${kind}"`);
  const wait = take("--device-wait");
  if (wait != null && kind == null) throw new Error("--device-wait applies only with --device android");
  if (wait != null && (!/^\d+$/.test(wait) || Number(wait) > 86_400)) throw new Error(`--device-wait takes whole seconds (0..86400), got "${wait}"`);
  return kind == null ? null : { kind, waitSeconds: wait == null ? DEVICE_WAIT_SECONDS : Number(wait) };
}

export const DEVICE_LOCK_PORT_BASE = 36900;
export const DEVICE_LOCK_PORTS = 100;

export function deviceLockPort(serial) {
  let hash = 0;
  for (const ch of String(serial)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return DEVICE_LOCK_PORT_BASE + (hash % DEVICE_LOCK_PORTS);
}

export function describeHolder(record) {
  if (!record) return "a process that did not say who it is";
  const parts = [`pid ${record.pid ?? "?"}`];
  if (record.serial) parts.push(`device ${record.serial}`);
  if (record.session) parts.push(`session ${record.session}`);
  if (record.worktree) parts.push(`worktree ${record.worktree}`);
  if (record.command) parts.push(`running \`${record.command}\``);
  return `${parts.join(", ")}, since ${record.acquiredAt ?? "an unknown time"}`;
}

function holdPort(port, record) {
  const server = net.createServer((socket) => {
    socket.on("error", () => {});
    socket.end(JSON.stringify(record));
  });
  return new Promise((resolve, reject) => {
    server.once("error", (error) => (error.code === "EADDRINUSE" ? resolve(null) : reject(error)));
    server.listen({ port, host: "127.0.0.1", exclusive: true }, () => {
      server.removeAllListeners("error");
      server.on("error", () => {});
      server.unref();
      resolve(server);
    });
  });
}

export function askHolder(port, { timeoutMs = 3_000 } = {}) {
  return new Promise((resolve) => {
    let text = "";
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(value);
    };
    const socket = net.connect({ port, host: "127.0.0.1" });
    const timer = setTimeout(() => done({ holder: null }), timeoutMs);
    socket.on("data", (chunk) => {
      text += chunk;
      if (text.length > 64 * 1024) done({ holder: null });
    });
    socket.on("end", () => {
      try {
        const record = JSON.parse(text);
        done({ holder: record && typeof record === "object" && Number.isSafeInteger(record.pid) ? record : null });
      } catch {
        done({ holder: null });
      }
    });
    socket.on("error", (error) => done(error.code === "ECONNREFUSED" ? { gone: true } : { holder: null }));
  });
}

export async function acquireDevice(serial, {
  port = deviceLockPort(serial),
  waitSeconds = DEVICE_WAIT_SECONDS,
  pollMs = 2_000,
  session = null,
  worktree = null,
  command = null,
  log = () => {},
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  hold = holdPort,
  ask = askHolder,
} = {}) {
  const record = { pid: process.pid, serial, session, worktree, command, acquiredAt: null };
  const began = now();
  const deadline = began + waitSeconds * 1000;
  let lastHolder = null;
  const expired = (holder) =>
    new Error(`timed out after ${Math.round((now() - began) / 1000)} s waiting for Android device ${serial}, held by ${holder} (the hold is a listener on 127.0.0.1:${port} and ends with that process). Wait for it to finish, or pass a longer --device-wait <seconds>`);
  const unasked = () => lastHolder ?? "another process (no wait was left to ask which)";
  for (let attempt = 0; ; attempt++) {
    if (attempt > 0 && now() >= deadline) throw expired(unasked());
    record.acquiredAt = new Date(now()).toISOString();
    const bindMs = attempt === 0 ? Math.max(BIND_STALL_MS, deadline - now()) : deadline - now();
    const bound = await settleWithin(hold(port, record), bindMs);
    if (bound.late) {
      bound.late.then((server) => server?.close(), () => {});
      throw new Error(`binding 127.0.0.1:${port} for Android device ${serial} did not finish within ${bindMs} ms`);
    }
    const server = bound.value;
    if (server) {
      let released = false;
      return {
        port,
        record,
        waitedMs: now() - began,
        release: () => {
          if (released) return;
          released = true;
          server.close();
        },
      };
    }
    const remaining = deadline - now();
    if (remaining <= 0) throw expired(unasked());
    const answer = await ask(port, { timeoutMs: Math.min(LOOKUP_MS, remaining) });
    const holder = answer.gone ? (lastHolder ?? "a process that let go while this one asked who it was") : describeHolder(answer.holder);
    if (now() >= deadline) throw expired(holder);
    if (answer.gone) continue;
    if (holder !== lastHolder) {
      log(`waiting for Android device ${serial}: held by ${holder}; waiting up to ${waitSeconds} s`);
      lastHolder = holder;
    }
    await sleep(Math.min(pollMs, deadline - now()));
  }
}

function settleWithin(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ late: promise }), Math.max(0, ms));
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve({ value });
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function parseReverseList(stdout) {
  const mapped = new Map();
  for (const line of String(stdout).split(/\r?\n/)) {
    const match = /\btcp:(\d+)\s+tcp:(\d+)/.exec(line);
    if (match) mapped.set(Number(match[1]), Number(match[2]));
  }
  return mapped;
}

export function editorPorts(record) {
  const ports = record?.ports ? [record.ports.editor, record.ports.player, record.ports.hmr] : [];
  const fromUrl = Number(new URL(record.url).port);
  if (fromUrl) ports.push(fromUrl);
  return [...new Set(ports.filter((port) => Number.isSafeInteger(port) && port > 0))];
}

const shellText = async (device, command) => String(await device.shell(command)).trim();

export function deviceInput(device) {
  return {
    tap: ({ x, y }) => shellText(device, `input tap ${x} ${y}`),
    longPress: ({ x, y }, ms = LONG_PRESS_MS) => shellText(device, `input swipe ${x} ${y} ${x} ${y} ${ms}`),
    swipe: (from, to, ms = SWIPE_MS) => shellText(device, `input swipe ${from.x} ${from.y} ${to.x} ${to.y} ${ms}`),
  };
}

export async function openAndroidDevice({
  record,
  viewport = null,
  colorScheme = null,
  waitSeconds = DEVICE_WAIT_SECONDS,
  playwright,
  env = process.env,
  platform = process.platform,
  run = runAdb,
  acquire = acquireDevice,
  lockOptions = {},
  log = () => {},
}) {
  const adb = requireAdb({ env, platform });
  await run(adb, ["start-server"]);
  const serial = chooseDevice(parseAdbDevices((await run(adb, ["devices"])).stdout), env.ANDROID_SERIAL || null);
  const adbOn = (args) => run(adb, ["-s", serial, ...args]);
  const lock = await acquire(serial, { waitSeconds, log, ...lockOptions });
  const undo = [];
  const unwind = async () => {
    const problems = [];
    for (const step of undo.reverse()) {
      try {
        await step.run();
      } catch (error) {
        problems.push(`${step.what}: ${String(error.message || error).split("\n")[0]}`);
      }
    }
    undo.length = 0;
    lock.release();
    return problems;
  };
  try {
    const { _android } = await playwright();
    const enumerated = await _android.devices({ omitDriverInstall: true });
    const device = enumerated.find((candidate) => candidate.serial() === serial);
    if (device) undo.push({ what: "close the device connection", run: () => device.close() });
    const others = enumerated.filter((candidate) => candidate !== device);
    const closed = await Promise.allSettled(others.map((other) => other.close()));
    if (!device) throw new Error(`adb lists ${serial}, and Playwright's Android connection does not; restart the adb server (\`adb kill-server\`) and retry`);
    const stuck = closed.map((result, index) => (result.status === "rejected" ? `${others[index].serial()}: ${String(result.reason?.message || result.reason).split("\n")[0]}` : null)).filter(Boolean);
    if (stuck.length) throw new Error(`could not close Playwright's connection to the other attached devices (${stuck.join("; ")})`);
    const chrome = requireChrome(parseChromeVersion(await shellText(device, `dumpsys package ${CHROME_PACKAGE}`)), serial);

    const mapped = parseReverseList((await adbOn(["reverse", "--list"])).stdout);
    const conflicts = editorPorts(record).filter((port) => mapped.has(port) && mapped.get(port) !== port);
    if (conflicts.length) {
      throw new Error(`${serial} already forwards ${conflicts.map((port) => `device port ${port} to host port ${mapped.get(port)}`).join(" and ")}, so the device's localhost:${conflicts[0]} would not reach this checkout's editor. Remove ${conflicts.length === 1 ? "that mapping" : "those mappings"} (\`adb -s ${serial} reverse --remove tcp:${conflicts[0]}\`) if nothing still needs ${conflicts.length === 1 ? "it" : "them"}, or run \`up\` again for other ports`);
    }
    const reversed = [];
    for (const port of editorPorts(record)) {
      if (mapped.has(port)) continue;
      await adbOn(["reverse", `tcp:${port}`, `tcp:${port}`]);
      reversed.push(port);
      undo.push({ what: `remove the adb reverse mapping for port ${port}`, run: () => adbOn(["reverse", "--remove", `tcp:${port}`]) });
    }

    const screen = parseWmSize(await shellText(device, "wm size"));
    const density = parseWmDensity(await shellText(device, "wm density"));
    let appliedDensity = density.override ?? density.physical;
    if (viewport) {
      const width = Math.min((screen.override ?? screen.physical).width, (screen.override ?? screen.physical).height);
      appliedDensity = densityForWidth(width, viewport.width);
      undo.push({ what: "restore the screen density", run: () => shellText(device, density.override ? `wm density ${density.override}` : "wm density reset") });
      await shellText(device, `wm density ${appliedDensity}`);
    }

    let ctx;
    try {
      ctx = await device.launchBrowser({ ...(colorScheme ? { colorScheme } : {}) });
    } catch (error) {
      error.message = `Chrome on ${serial} did not open its debugging connection (${String(error.message || error).split("\n")[0]}). This is what a missing "Enable command line on non-rooted devices" flag in chrome://flags looks like; turn it on and relaunch Chrome.\n${ANDROID_SETUP}`;
      throw error;
    }
    undo.push({ what: "close Chrome's browser context", run: () => ctx.close() });

    let rotation = null;
    const input = deviceInput(device);
    const handle = {
      kind: "android",
      serial,
      model: device.model(),
      chrome: chrome.version,
      ...input,
      screenshot: (file) => device.screenshot({ path: file }),
      async rotate(orientation) {
        if (!(orientation in ORIENTATIONS)) throw new Error(`rotate takes ${Object.keys(ORIENTATIONS).join(" or ")}, got "${orientation}"`);
        if (!rotation) {
          rotation = {
            accelerometer: await shellText(device, "settings get system accelerometer_rotation"),
            user: await shellText(device, "settings get system user_rotation"),
          };
          const restore = (key, value) => shellText(device, /^\d+$/.test(value) ? `settings put system ${key} ${value}` : `settings delete system ${key}`);
          undo.push({ what: "restore the screen rotation", run: async () => {
            await restore("user_rotation", rotation.user);
            await restore("accelerometer_rotation", rotation.accelerometer);
          } });
        }
        await shellText(device, "settings put system accelerometer_rotation 0");
        await shellText(device, `settings put system user_rotation ${ORIENTATIONS[orientation]}`);
      },
      report: () => ({
        kind: "android",
        serial,
        model: device.model(),
        chrome: chrome.version,
        screen: screen.override ?? screen.physical,
        density: appliedDensity,
        reversedPorts: reversed,
        waitedForDeviceMs: lock.waitedMs,
      }),
    };
    return { ctx, device: handle, close: unwind };
  } catch (error) {
    const problems = await unwind();
    if (problems.length) error.message += `; cleanup also failed (${problems.join("; ")})`;
    throw error;
  }
}

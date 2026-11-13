#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ANDROID_SETUP,
  acquireDevice,
  askHolder,
  adbMissingMessage,
  chooseDevice,
  densityForWidth,
  deviceLockPort,
  editorPorts,
  findAdb,
  openAndroidDevice,
  parseAdbDevices,
  parseChromeVersion,
  parseGesture,
  parseReverseList,
  parseWmDensity,
  parseWmSize,
  requireChrome,
  takeDeviceFlags,
} from "./android.mjs";
import { NAMED_STEPS, TICKETS, notBuiltYet, parseNamedStep } from "./steps.mjs";
import { parseScreenshotArgs, parseUiSteps, ui, verify } from "./driver.mjs";

const { LAUNCH_SECONDS, SHELL_SECONDS, launchTab, pageVerdict, planReverse } = await import("./android.mjs");
const { shotGate, shotWaitsFor } = await import("./steps.mjs");
const { surfacePainted } = await import("./driver.mjs");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DRIVER = path.join(HERE, "driver.mjs");
const ANDROID = pathToFileURL(path.join(HERE, "android.mjs")).href;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "android-route-"));

let failures = 0;
const check = async (name, fn) => {
  try {
    await fn();
    console.log(`PASS: ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL: ${name}`);
    console.log(`  ${String(err.stack || err.message).split("\n").join("\n  ")}`);
  }
};

const device = { kind: "android", waitSeconds: 900 };

await check("adb is found on PATH first, then under ANDROID_HOME or ANDROID_SDK_ROOT, and otherwise not at all", () => {
  const exists = (file) => ["/opt/tools/adb", "/sdk/platform-tools/adb", "C:\\sdk\\platform-tools\\adb.exe"].includes(file);
  assert.equal(findAdb({ env: { PATH: "/usr/bin:/opt/tools" }, platform: "linux", exists }), "/opt/tools/adb");
  assert.equal(findAdb({ env: { PATH: "/usr/bin", ANDROID_HOME: "/sdk" }, platform: "linux", exists }), "/sdk/platform-tools/adb");
  assert.equal(findAdb({ env: { PATH: "/usr/bin", ANDROID_SDK_ROOT: "/sdk" }, platform: "linux", exists }), "/sdk/platform-tools/adb");
  assert.equal(findAdb({ env: { Path: "C:\\Windows", ANDROID_HOME: "C:\\sdk" }, platform: "win32", exists }), "C:\\sdk\\platform-tools\\adb.exe");
  assert.equal(findAdb({ env: { PATH: "/usr/bin" }, platform: "linux", exists }), null);
});

await check("the missing-adb message carries the whole setup procedure and points at Android Studio's copy when it is there", () => {
  const env = { PATH: "C:\\Windows", LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" };
  const sdkAdb = "C:\\Users\\me\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe";
  const plain = adbMissingMessage({ env, platform: "win32", exists: () => false });
  assert.ok(plain.includes(ANDROID_SETUP));
  assert.match(plain, /none on PATH or under ANDROID_HOME or ANDROID_SDK_ROOT/);
  assert.doesNotMatch(plain, /Android Studio's copy is at/);
  assert.ok(plain.includes(`It looked for adb.exe in each PATH folder (C:\\Windows) and for Android Studio's default copy at ${sdkAdb}, which is not there.`), plain);
  const hinted = adbMissingMessage({ env, platform: "win32", exists: (file) => file === sdkAdb });
  assert.ok(hinted.includes(`Android Studio's copy is at ${sdkAdb}: put its folder on PATH.`), hinted);
  const named = adbMissingMessage({ env: { ...env, ANDROID_HOME: "D:\\sdk" }, platform: "win32", exists: () => false });
  assert.ok(named.includes("under ANDROID_HOME (D:\\sdk\\platform-tools\\adb.exe)"), named);
  for (const part of ["API 34", "Google APIs", "Pixel-class", "Chrome (87 or later)", "Enable command line on non-rooted devices", "adb devices", "settings get global debug_app"]) {
    assert.ok(ANDROID_SETUP.includes(part), `setup procedure lacks ${part}`);
  }
  assert.doesNotMatch(ANDROID_SETUP, /AppData|LOCALAPPDATA/);
});

await check("the setup text says the Chrome flag is needed only when Chrome is not the debug app, and warns about tabs, the clipboard strip and Git Bash paths", () => {
  assert.match(ANDROID_SETUP, /only when Chrome is not the device's debug app/);
  assert.match(ANDROID_SETUP, /opens its own tab/);
  assert.match(ANDROID_SETUP, /clipboard/);
  assert.match(ANDROID_SETUP, /MSYS_NO_PATHCONV=1/);
});

await check("without adb on the path, the driver fails within ten seconds with the setup procedure, for screenshot, ui and verify", () => {
  const env = { ...process.env, PATH: path.dirname(process.execPath), Path: path.dirname(process.execPath) };
  delete env.ANDROID_HOME;
  delete env.ANDROID_SDK_ROOT;
  for (const args of [["--device", "android", "screenshot", "story"], ["ui", "--device", "android", "--step", "focus-project-name"], ["verify", "--device", "android"]]) {
    const began = Date.now();
    const run = spawnSync(process.execPath, [DRIVER, ...args], { env, encoding: "utf8", timeout: 30_000, windowsHide: true });
    const elapsed = Date.now() - began;
    assert.equal(run.status, 1, `${args.join(" ")}: ${run.stdout}${run.stderr}`);
    assert.ok(elapsed < 10_000, `${args.join(" ")} took ${elapsed} ms`);
    assert.match(run.stderr, /--device android needs adb/);
    assert.ok(run.stderr.includes("Enable command line on non-rooted devices"), run.stderr);
  }
});

await check("--device is refused for commands that do not drive the editor page", () => {
  const run = spawnSync(process.execPath, [DRIVER, "status", "--device", "android"], { encoding: "utf8", timeout: 30_000, windowsHide: true });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /--device, --viewport, --color-scheme and --theme apply to verify, ui, screenshot only, not status/);
});

await check("device flags are taken from anywhere on the command line, with a default queue wait", () => {
  const argv = ["screenshot", "story", "--device", "android", "--device-wait", "30"];
  assert.deepEqual(takeDeviceFlags(argv), { kind: "android", waitSeconds: 30 });
  assert.deepEqual(argv, ["screenshot", "story"]);
  assert.deepEqual(takeDeviceFlags(["--device", "android"]), { kind: "android", waitSeconds: 900 });
  assert.equal(takeDeviceFlags(["ui"]), null);
  assert.throws(() => takeDeviceFlags(["--device", "ios"]), /--device takes android, got "ios"/);
  assert.throws(() => takeDeviceFlags(["--device"]), /--device needs a value/);
  assert.throws(() => takeDeviceFlags(["--device-wait", "5"]), /only with --device android/);
  assert.throws(() => takeDeviceFlags(["--device", "android", "--device-wait", "soon"]), /whole seconds/);
});

await check("adb's device list is read, and the one ready device is chosen or the problem is named", () => {
  const rows = parseAdbDevices("* daemon not running; starting now at tcp:5037\n* daemon started successfully\nList of devices attached\nemulator-5554\tdevice\nemulator-5556\toffline\n\n");
  assert.deepEqual(rows, [{ serial: "emulator-5554", state: "device" }, { serial: "emulator-5556", state: "offline" }]);
  assert.equal(chooseDevice(rows), "emulator-5554");
  assert.equal(chooseDevice([...rows, { serial: "emulator-5558", state: "device" }], "emulator-5558"), "emulator-5558");
  assert.throws(() => chooseDevice([]), (e) => /no Android device is attached/.test(e.message) && e.message.includes(ANDROID_SETUP));
  assert.throws(() => chooseDevice([{ serial: "emulator-5554", state: "unauthorized" }]), /no Android device is ready: `adb devices` lists emulator-5554 \(unauthorized\)/);
  assert.throws(() => chooseDevice([...rows, { serial: "emulator-5558", state: "device" }]), /several Android devices are ready \(emulator-5554, emulator-5558\); set ANDROID_SERIAL/);
  assert.throws(() => chooseDevice(rows, "emulator-9999"), /ANDROID_SERIAL is emulator-9999, which `adb devices` does not list/);
});

await check("Chrome's version is read from dumpsys and anything before 87 is refused", () => {
  const chrome = parseChromeVersion("Packages:\n  Package [com.android.chrome] (1a2b):\n    versionCode=612000000 minSdk=29\n    versionName=120.0.6099.230\n");
  assert.deepEqual(chrome, { version: "120.0.6099.230", major: 120 });
  assert.equal(requireChrome(chrome, "emulator-5554"), chrome);
  assert.throws(() => requireChrome(parseChromeVersion("versionName=86.0.4240.99"), "emulator-5554"), /Chrome on emulator-5554 is 86\.0\.4240\.99; the route needs 87 or later/);
  assert.throws(() => requireChrome(parseChromeVersion("Unable to find package"), "emulator-5554"), /Chrome \(com\.android\.chrome\) is not installed on emulator-5554/);
});

await check("screen size and density are read from wm, and a CSS width picks the density that gives it", () => {
  assert.deepEqual(parseWmSize("Physical size: 1080x2400\n"), { physical: { width: 1080, height: 2400 }, override: null });
  assert.deepEqual(parseWmSize("Physical size: 1080x2400\nOverride size: 720x1600\n"), { physical: { width: 1080, height: 2400 }, override: { width: 720, height: 1600 } });
  assert.deepEqual(parseWmDensity("Physical density: 420\n"), { physical: 420, override: null });
  assert.deepEqual(parseWmDensity("Physical density: 420\nOverride density: 480\n"), { physical: 420, override: 480 });
  assert.equal(densityForWidth(1080, 360), 480);
  assert.equal(densityForWidth(1080, 430), 402);
  assert.equal(Math.round(1080 / (402 / 160)), 430);
  assert.throws(() => parseWmSize("error"), /could not read the screen size/);
});

await check("gestures take screen pixels with an optional duration", () => {
  assert.deepEqual(parseGesture("540,1200", "--long-press", { twoPoints: false, defaultMs: 750 }), { at: { x: 540, y: 1200 }, ms: 750 });
  assert.deepEqual(parseGesture("540,1200:1500", "--long-press", { twoPoints: false, defaultMs: 750 }), { at: { x: 540, y: 1200 }, ms: 1500 });
  assert.deepEqual(parseGesture("540,1800:540,600", "--swipe", { twoPoints: true, defaultMs: 300 }), { from: { x: 540, y: 1800 }, to: { x: 540, y: 600 }, ms: 300 });
  assert.throws(() => parseGesture("540", "--long-press", { twoPoints: false, defaultMs: 750 }), /--long-press takes screen pixels as X,Y/);
  assert.throws(() => parseGesture("540,1800", "--swipe", { twoPoints: true, defaultMs: 300 }), /--swipe takes X1,Y1:X2,Y2/);
  assert.throws(() => parseGesture("1,2:0", "--long-press", { twoPoints: false, defaultMs: 750 }), /1\.\.60000 ms/);
});

await check("every named step is accepted by --step in ui and screenshot, and an unknown one lists them all", () => {
  const names = ["app-menu", "dialog", "drawer", "file-menu", "asset-inspector", "add-menu", "preview-settings", "play", "problems", "settings", "focus-project-name", "focus-script-name", "wheel-list"];
  assert.deepEqual(Object.keys(NAMED_STEPS).sort(), [...names].sort());
  for (const name of names) {
    const spec = name === "settings" ? "settings=appearance" : name;
    assert.deepEqual(parseUiSteps(["--step", spec], { device: null }), [name === "settings" ? { step: "settings", section: "appearance" } : { step: name }]);
    assert.deepEqual(parseScreenshotArgs(["story", "--step", spec], { viewport: null, colorScheme: null, theme: null }).steps, [spec]);
  }
  assert.throws(() => parseUiSteps(["--step", "menu"], { device: null }), /unknown --step "menu" \(know: app-menu, dialog, .*settings=<section>, focus-project-name, focus-script-name, wheel-list\)/);
  assert.throws(() => parseUiSteps(["--step", "settings"], { device: null }), /--step settings needs a section, as settings=<section>/);
  assert.throws(() => parseUiSteps(["--step", "play=fast"], { device: null }), /--step play takes no value/);
  assert.throws(() => parseScreenshotArgs(["story", "--step", "nope"], { viewport: null, colorScheme: null, theme: null }), /unknown --step "nope"/);
  assert.throws(() => parseScreenshotArgs(["story", "--step"], { viewport: null, colorScheme: null, theme: null }), /--step needs a step name/);
});


await check("touch, rotation and the whole-screen shot need the device; --shot is the device screen on one and the page otherwise", () => {
  for (const args of [["--tap", "1,2"], ["--long-press", "1,2"], ["--swipe", "1,2:3,4"], ["--rotate", "landscape"]]) {
    assert.throws(() => parseUiSteps(args, { device: null }), /needs --device android/, args[0]);
  }
  assert.throws(() => parseUiSteps(["--shot-of", "screen", "a.png"], { device: null }), /--shot-of screen captures a device's whole screen and needs --device android/);
  assert.deepEqual(parseUiSteps(["--shot", "a.png"], { device: null }), [{ shotOf: "page", out: "a.png" }]);
  assert.deepEqual(
    parseUiSteps(["--tap", "540,1200", "--long-press", "540,1200:900", "--swipe", "540,1800:540,600", "--rotate", "landscape", "--shot", "a.png", "--shot-of", "page", "b.png"], { device }),
    [
      { tap: { x: 540, y: 1200 } },
      { longPress: { at: { x: 540, y: 1200 }, ms: 900 } },
      { swipe: { from: { x: 540, y: 1800 }, to: { x: 540, y: 600 }, ms: 300 } },
      { rotate: "landscape" },
      { shotOf: "screen", out: "a.png" },
      { shotOf: "page", out: "b.png" },
    ],
  );
  assert.throws(() => parseUiSteps(["--rotate", "upside-down"], { device }), /--rotate takes portrait or landscape/);
  assert.throws(() => parseUiSteps(["--tap", "1,2:5"], { device }), /--tap takes screen pixels as X,Y/);
});

function stubPage() {
  const page = {
    shots: [],
    gotos: 0,
    goto: async () => {
      page.gotos++;
    },
    reload: async () => {},
    waitForSelector: async () => {},
    waitForFunction: async () => {},
    waitForTimeout: async () => {},
    screenshot: async ({ path: file }) => {
      page.shots.push(file);
    },
    evaluate: async (fn, arg) => (typeof arg === "string" && arg.includes("aria-selected") ? "assets" : { width: 360, height: 780, devicePixelRatio: 3, visibility: "visible" }),
  };
  return page;
}

function stubDevice() {
  const calls = [];
  return {
    calls,
    report: () => ({ kind: "android", serial: "emulator-5554", model: "sdk_gphone64_x86_64", chrome: "120.0.6099.230" }),
    screenshot: async (file) => {
      calls.push(["screenshot", file]);
    },
    tap: async (at) => calls.push(["tap", at]),
    longPress: async (at, ms) => calls.push(["longPress", at, ms]),
    swipe: async (from, to, ms) => calls.push(["swipe", from, to, ms]),
    rotate: async (orientation) => calls.push(["rotate", orientation]),
  };
}

function uiDeps(page, dev) {
  const logs = [];
  return {
    logs,
    deps: {
      withEditor: async (fn) => fn({ page, ctx: null, url: "http://localhost:38000", consoleLines: [], mode: "same-origin", device: dev }),
      log: (line) => logs.push(line),
      die: (msg) => {
        throw new Error(`died: ${msg}`);
      },
      waitForApp: async () => {},
      waitForDomQuiet: async () => {},
      activeScreen: async () => "assets",
      interruptedSeed: async () => false,
      editorExpectedHere: async () => false,
      scriptEditorPresent: async () => ({ present: false }),
      settleEditor: async () => true,
      loadedScript: async () => ({ file: "main.sd", present: true }),
      readSurfaces: async () => ({}),
    },
  };
}

await check("ui runs a not-built step as a failure naming its ticket, keeps going, and exits 1", async () => {
  const page = stubPage();
  const { deps } = uiDeps(page, null);
  const shot = path.join(scratch, "page.png");
  const result = await ui(["--step", "dialog", "--shot", shot], deps);
  assert.deepEqual(result.steps[0], { step: "dialog", ran: false, reason: `not built yet: --step dialog (open a dialog and dismiss it) gets its body when ${TICKETS}#984 builds the surface` });
  assert.deepEqual(result.steps[1], { of: "page", screenshot: shot });
  assert.deepEqual(page.shots, [shot]);
  assert.equal(result.failed.length, 1);
  assert.equal(process.exitCode, 1);
  process.exitCode = 0;
});

await check("every step not built yet runs through ui as a failure naming the ticket that builds its surface, and play does not", async () => {
  const expected = {
    dialog: ["open a dialog and dismiss it", 984],
  };
  for (const [spec, [does, ticket]] of Object.entries(expected)) {
    const name = spec.split("=")[0];
    const { deps } = uiDeps(stubPage(), null);
    const result = await ui(["--step", spec], deps);
    assert.equal(result.steps.length, 1, spec);
    assert.equal(result.steps[0].step, name, spec);
    assert.equal(result.steps[0].ran, false, spec);
    assert.equal(result.steps[0].reason, `not built yet: --step ${name} (${does}) gets its body when ImpowerGames/impower-internal#${ticket} builds the surface`, spec);
    assert.deepEqual(result.failed, [result.steps[0].reason], spec);
    assert.equal(process.exitCode, 1, spec);
    process.exitCode = 0;
  }
  assert.deepEqual(Object.keys(NAMED_STEPS).filter((name) => !Object.keys(expected).some((spec) => spec.split("=")[0] === name)), ["app-menu", "drawer", "file-menu", "asset-inspector", "add-menu", "preview-settings", "play", "problems", "settings", "focus-project-name", "focus-script-name", "wheel-list"]);
  for (const name of ["app-menu", "drawer", "file-menu", "asset-inspector", "add-menu", "preview-settings", "play", "problems", "settings=appearance", "focus-project-name", "focus-script-name", "wheel-list"]) assert.equal(notBuiltYet(parseNamedStep(name)), null, name);
});

await check("on a device, ui reports the device, sends gestures through it and takes --shot as the whole screen", async () => {
  const page = stubPage();
  const dev = stubDevice();
  const { deps } = uiDeps(page, dev);
  const screen = path.join(scratch, "screen.png");
  const pageOnly = path.join(scratch, "page-only.png");
  const result = await ui(["--tap", "540,1200", "--long-press", "540,1200", "--swipe", "540,1800:540,600:200", "--rotate", "landscape", "--shot", screen, "--shot-of", "page", pageOnly], { device, ...deps });
  assert.deepEqual(result.device, { kind: "android", serial: "emulator-5554", model: "sdk_gphone64_x86_64", chrome: "120.0.6099.230", page: { width: 360, height: 780, devicePixelRatio: 3 } });
  assert.deepEqual(dev.calls, [
    ["tap", { x: 540, y: 1200 }],
    ["longPress", { x: 540, y: 1200 }, 750],
    ["swipe", { x: 540, y: 1800 }, { x: 540, y: 600 }, 200],
    ["rotate", "landscape"],
    ["screenshot", screen],
  ]);
  assert.deepEqual(result.steps.slice(4), [{ of: "screen", screenshot: screen }, { of: "page", screenshot: pageOnly }]);
  assert.deepEqual(page.shots, [pageOnly]);
  assert.deepEqual(result.failed, []);
  assert.equal(process.exitCode, 0);
});

const LAID_OUT = { width: 980, height: 1839 };
const UNRENDERED = { width: 0, height: 0 };

function fakeTab(log, name, url, size = LAID_OUT) {
  return {
    name,
    url: () => url,
    evaluate: async () => size,
    bringToFront: async () => log.push([`${name}.bringToFront`]),
    close: async () => log.push([`${name}.close`]),
  };
}

function fakeAndroid({ chrome = "versionName=120.0.6099.230", density = "Physical density: 420", reverse = "", serials = ["emulator-5554"], tabs = [["launch", "about:blank"]] } = {}) {
  const log = [];
  const shell = async (command) => {
    log.push(["shell", command]);
    if (command.startsWith("dumpsys package")) return Buffer.from(chrome);
    if (command === "wm size") return Buffer.from("Physical size: 1080x2400\n");
    if (command === "wm density") return Buffer.from(density);
    if (command.startsWith("settings get system accelerometer_rotation")) return Buffer.from("1\n");
    if (command.startsWith("settings get system user_rotation")) return Buffer.from("null\n");
    return Buffer.from("");
  };
  const listed = tabs.map(([name, url, size]) => fakeTab(log, name, url, size));
  const ctx = {
    close: async () => log.push(["context.close"]),
    pages: () => [...listed],
    newPage: async () => {
      log.push(["newPage"]);
      const tab = fakeTab(log, "new", "about:blank");
      listed.push(tab);
      return tab;
    },
  };
  const makeDevice = (serial, first) => ({
    serial: () => serial,
    model: () => "sdk_gphone64_x86_64",
    shell,
    screenshot: async ({ path: file }) => log.push(["screenshot", file]),
    launchBrowser: async (options) => {
      log.push(["launchBrowser", options]);
      return ctx;
    },
    close: async () => log.push([first ? "device.close" : `${serial}.close`]),
  });
  const devices = serials.map((serial, index) => makeDevice(serial, index === 0));
  const run = async (adb, args) => {
    log.push(["adb", ...args]);
    if (args[0] === "devices") return { stdout: `List of devices attached\n${serials.map((serial) => `${serial}\tdevice`).join("\n")}\n` };
    if (args.includes("--list")) return { stdout: reverse };
    return { stdout: "" };
  };
  const acquire = async (serial, options) => {
    log.push(["acquire", serial, options.waitSeconds]);
    return { waitedMs: 0, release: () => log.push(["release"]) };
  };
  const playwright = async () => ({
    _android: {
      devices: async (options) => {
        log.push(["devices", options]);
        return devices;
      },
    },
  });
  return { log, run, acquire, playwright, ctx, devices };
}

const adbEnv = { PATH: "/tools", ANDROID_SERIAL: "" };
const adbHere = { env: adbEnv, platform: "linux" };
const withAdb = (fn) => {
  const original = fs.existsSync;
  fs.existsSync = (file) => file === "/tools/adb" || original(file);
  return fn().finally(() => {
    fs.existsSync = original;
  });
};

await check("opening the device maps the unmapped editor ports, takes over the ones a dead run left, sets the density for --viewport, never installs Playwright's driver app, and undoes everything in reverse", () =>
  withAdb(async () => {
    const fake = fakeAndroid({ reverse: "emulator-5554 tcp:38001 tcp:38001\n" });
    const record = { url: "http://localhost:38000", ports: { editor: 38000, player: 38001, hmr: 38002 } };
    const session = await openAndroidDevice({ record, viewport: { name: "phone", width: 360, height: 780 }, colorScheme: "dark", waitSeconds: 30, ...fake, ...adbHere });
    assert.equal(session.ctx, fake.ctx);
    assert.deepEqual(fake.log.find((entry) => entry[0] === "devices"), ["devices", { omitDriverInstall: true }]);
    assert.deepEqual(fake.log.find((entry) => entry[0] === "acquire"), ["acquire", "emulator-5554", 30]);
    assert.deepEqual(fake.log.find((entry) => entry[0] === "launchBrowser"), ["launchBrowser", { colorScheme: "dark" }]);
    const reversed = fake.log.filter((entry) => entry[0] === "adb" && entry.includes("reverse") && !entry.includes("--list"));
    assert.deepEqual(reversed, [["adb", "-s", "emulator-5554", "reverse", "tcp:38000", "tcp:38000"], ["adb", "-s", "emulator-5554", "reverse", "tcp:38002", "tcp:38002"]]);
    assert.ok(fake.log.some((entry) => entry[0] === "shell" && entry[1] === "wm density 480"));
    await session.device.tap({ x: 10, y: 20 });
    await session.device.longPress({ x: 10, y: 20 }, 750);
    await session.device.swipe({ x: 1, y: 2 }, { x: 3, y: 4 }, 300);
    await session.device.rotate("landscape");
    await session.device.screenshot("/tmp/screen.png");
    assert.deepEqual(session.device.report().reversedPorts, [38000, 38002]);
    assert.deepEqual(session.device.report().leftoverPorts, [38001]);
    assert.equal(session.device.report().density, 480);
    const mark = fake.log.length;
    assert.deepEqual(await session.close(), []);
    assert.deepEqual(fake.log.slice(mark), [
      ["shell", "settings delete system user_rotation"],
      ["shell", "settings put system accelerometer_rotation 1"],
      ["launch.close"],
      ["context.close"],
      ["shell", "wm density reset"],
      ["adb", "-s", "emulator-5554", "reverse", "--remove", "tcp:38002"],
      ["adb", "-s", "emulator-5554", "reverse", "--remove", "tcp:38001"],
      ["adb", "-s", "emulator-5554", "reverse", "--remove", "tcp:38000"],
      ["device.close"],
      ["release"],
    ]);
    const inputs = fake.log.filter((entry) => entry[0] === "shell" && entry[1].startsWith("input "));
    assert.deepEqual(inputs.map((entry) => entry[1]), ["input tap 10 20", "input swipe 10 20 10 20 750", "input swipe 1 2 3 4 300"]);
    assert.ok(!fake.log.some((entry) => entry[0] === "shell" && /package (un)?install|pm install/.test(entry[1])));
  }));

await check("with several devices enumerated, the connections to the ones not chosen are closed at once, on success and on failure", () =>
  withAdb(async () => {
    const fake = fakeAndroid({ serials: ["emulator-5554", "emulator-5556"] });
    const env = { ...adbEnv, ANDROID_SERIAL: "emulator-5554" };
    const session = await openAndroidDevice({ record: { url: "http://localhost:38000" }, ...fake, env, platform: "linux" });
    const devicesAt = fake.log.findIndex((entry) => entry[0] === "devices");
    const otherClosedAt = fake.log.findIndex((entry) => entry[0] === "emulator-5556.close");
    assert.ok(otherClosedAt > devicesAt, JSON.stringify(fake.log));
    assert.ok(otherClosedAt < fake.log.findIndex((entry) => entry[0] === "launchBrowser"));
    await session.close();
    assert.deepEqual(fake.log.filter((entry) => /close$/.test(entry[0])).map((entry) => entry[0]), ["emulator-5556.close", "launch.close", "context.close", "device.close"]);

    const failing = fakeAndroid({ serials: ["emulator-5554", "emulator-5556"], chrome: "versionName=80.0.3987.99" });
    await assert.rejects(openAndroidDevice({ record: { url: "http://localhost:38000" }, ...failing, env, platform: "linux" }), /Chrome on emulator-5554 is 80/);
    assert.deepEqual(failing.log.filter((entry) => /close$/.test(entry[0])).map((entry) => entry[0]), ["emulator-5556.close", "device.close"]);

    const missing = fakeAndroid({ serials: ["emulator-5556"] });
    missing.run = async (adb, args) => (args[0] === "devices" ? { stdout: "List of devices attached\nemulator-5554\tdevice\n" } : { stdout: "" });
    await assert.rejects(openAndroidDevice({ record: { url: "http://localhost:38000" }, ...missing, ...adbHere }), /adb lists emulator-5554, and Playwright's Android connection does not/);
    assert.deepEqual(missing.log.filter((entry) => /close$/.test(entry[0])).map((entry) => entry[0]), ["device.close"]);
    assert.deepEqual(missing.log.at(-1), ["release"]);
  }));

await check("a reverse mapping of an editor port to some other host port is refused, naming it, and nothing is remapped", () =>
  withAdb(async () => {
    const fake = fakeAndroid({ reverse: "UsbFfs tcp:38000 tcp:39999\n" });
    const record = { url: "http://localhost:38000", ports: { editor: 38000, player: 38001, hmr: 38002 } };
    await assert.rejects(
      openAndroidDevice({ record, ...fake, ...adbHere }),
      /emulator-5554 already forwards device port 38000 to host port 39999, so the device's localhost:38000 would not reach this checkout's editor\. Remove that mapping \(`adb -s emulator-5554 reverse --remove tcp:38000`\)/,
    );
    assert.ok(!fake.log.some((entry) => entry[0] === "adb" && entry.includes("reverse") && !entry.includes("--list")));
    assert.ok(!fake.log.some((entry) => entry[0] === "launchBrowser"));
    assert.deepEqual(fake.log.slice(-2), [["device.close"], ["release"]]);
  }));

await check("a density override already set is restored, not reset", () =>
  withAdb(async () => {
    const fake = fakeAndroid({ density: "Physical density: 420\nOverride density: 440\n" });
    const session = await openAndroidDevice({ record: { url: "http://localhost:38000" }, viewport: { name: "phone-large", width: 430, height: 932 }, ...fake, ...adbHere });
    await session.close();
    assert.ok(fake.log.some((entry) => entry[1] === "wm density 402"));
    assert.ok(fake.log.some((entry) => entry[1] === "wm density 440"));
    assert.ok(!fake.log.some((entry) => entry[1] === "wm density reset"));
  }));

await check("a device whose Chrome is too old releases the queue and undoes its mappings before failing", () =>
  withAdb(async () => {
    const fake = fakeAndroid({ chrome: "versionName=80.0.3987.99" });
    await assert.rejects(openAndroidDevice({ record: { url: "http://localhost:38000" }, ...fake, ...adbHere }), /Chrome on emulator-5554 is 80\.0\.3987\.99/);
    assert.deepEqual(fake.log.slice(-2), [["device.close"], ["release"]]);
    assert.ok(!fake.log.some((entry) => entry[0] === "launchBrowser"));
  }));

await check("a Chrome that never opens its debugging connection says how to check whether the command line is read, and undoes the session", () =>
  withAdb(async () => {
    const fake = fakeAndroid();
    fake.devices[0].launchBrowser = async () => {
      throw new Error("Timeout 30000ms exceeded while waiting for the devtools socket");
    };
    await assert.rejects(
      openAndroidDevice({ record: { url: "http://localhost:38000" }, viewport: { name: "phone", width: 360, height: 780 }, ...fake, ...adbHere }),
      (e) =>
        /Chrome on emulator-5554 did not open its debugging connection \(Timeout 30000ms exceeded/.test(e.message) &&
        e.message.includes("only when Chrome is the device's debug app") &&
        e.message.includes("adb -s emulator-5554 shell settings get global debug_app") &&
        e.message.includes("Enable command line on non-rooted devices"),
    );
    assert.deepEqual(fake.log.slice(-4), [["shell", "wm density reset"], ["adb", "-s", "emulator-5554", "reverse", "--remove", "tcp:38000"], ["device.close"], ["release"]]);
  }));

await check("a Chrome that dies or never offers its debugging socket fails the run within the launch limit instead of hanging, and the session is undone", () =>
  withAdb(async () => {
    const fake = fakeAndroid();
    fake.devices[0].launchBrowser = () => new Promise(() => {});
    let timer;
    const hung = new Promise((resolve) => {
      timer = setTimeout(() => resolve("still waiting after 5 s"), 5_000);
    });
    const outcome = await Promise.race([openAndroidDevice({ record: { url: "http://localhost:38000" }, launchMs: 50, ...fake, ...adbHere }).then(() => "opened", (error) => error), hung]);
    clearTimeout(timer);
    assert.match(String(outcome?.message ?? outcome), /Chrome on emulator-5554 offered no debugging connection within 0\.05 s/);

    const unhandled = [];
    const onUnhandled = (reason) => unhandled.push(String(reason?.message ?? reason));
    process.on("unhandledRejection", onUnhandled);
    const lateFake = fakeAndroid();
    lateFake.devices[0].launchBrowser = () => new Promise((_, reject) => setTimeout(() => reject(new Error("Device closed")), 100));
    await assert.rejects(openAndroidDevice({ record: { url: "http://localhost:38000" }, launchMs: 20, ...lateFake, ...adbHere }), /offered no debugging connection/);
    await new Promise((resolve) => setTimeout(resolve, 250));
    process.off("unhandledRejection", onUnhandled);
    assert.deepEqual(unhandled, []);
    assert.deepEqual(fake.log.slice(-3), [["adb", "-s", "emulator-5554", "reverse", "--remove", "tcp:38000"], ["device.close"], ["release"]]);
    assert.equal(LAUNCH_SECONDS, 60);
  }));

await check("the route drives the one tab Chrome's launch opened, fronts it and closes it when the run ends", () =>
  withAdb(async () => {
    const fake = fakeAndroid({ tabs: [["launch", "about:blank"]] });
    const session = await openAndroidDevice({ record: { url: "http://localhost:38000" }, ...fake, ...adbHere });
    assert.equal(session.page.name, "launch");
    assert.ok(fake.log.some((entry) => entry[0] === "launch.bringToFront"));
    assert.ok(!fake.log.some((entry) => entry[0] === "newPage"));
    assert.equal(session.device.report().tab, "the tab Chrome opened for this run");
    await session.close();
    assert.deepEqual(fake.log.filter((entry) => /\.close$/.test(entry[0])).map((entry) => entry[0]), ["launch.close", "context.close", "device.close"]);
  }));

await check("with restored tabs listed beside it, the route still drives and closes the launch tab, the only blank one laid out, and touches no other", () =>
  withAdb(async () => {
    const fake = fakeAndroid({ tabs: [["stray1", "about:blank", UNRENDERED], ["stray2", "https://example.com/", UNRENDERED], ["launch", "about:blank", LAID_OUT]] });
    const session = await openAndroidDevice({ record: { url: "http://localhost:38000" }, ...fake, ...adbHere });
    assert.equal(session.page.name, "launch");
    assert.ok(!fake.log.some((entry) => entry[0] === "newPage"));
    assert.equal(session.device.report().tab, "the tab Chrome opened for this run");
    await session.close();
    const closed = fake.log.filter((entry) => /\.close$/.test(entry[0])).map((entry) => entry[0]);
    assert.deepEqual(closed, ["launch.close", "context.close", "device.close"]);
  }));

await check("when the launch tab cannot be told apart, the route opens a tab of its own, drives and closes only that one, and says the launch tab stays", () =>
  withAdb(async () => {
    const fake = fakeAndroid({ tabs: [["stray", "about:blank", LAID_OUT], ["launch", "about:blank", LAID_OUT]] });
    const session = await openAndroidDevice({ record: { url: "http://localhost:38000" }, ...fake, ...adbHere });
    assert.equal(session.page.name, "new");
    assert.ok(fake.log.some((entry) => entry[0] === "new.bringToFront"));
    assert.match(session.device.report().tab, /^a new tab: of the 2 tabs Chrome listed at launch, not exactly one was a blank page laid out on screen/);
    await session.close();
    const closed = fake.log.filter((entry) => /\.close$/.test(entry[0])).map((entry) => entry[0]);
    assert.deepEqual(closed, ["new.close", "context.close", "device.close"]);
  }));

await check("the tab choice takes the one blank tab laid out on screen, since after Chrome's restart only the tab its launch fronts is laid out", async () => {
  const tab = (url, size) => ({ url: () => url, size });
  const measure = async (page) => page.size;
  const launch = tab("about:blank", LAID_OUT);
  assert.equal(await launchTab([launch], measure), launch);
  assert.equal(await launchTab([tab("about:blank", UNRENDERED), tab("https://example.com/", LAID_OUT), launch], measure), launch);
  assert.equal(await launchTab([], measure), null);
  assert.equal(await launchTab([tab("https://example.com/", LAID_OUT)], measure), null);
  assert.equal(await launchTab([tab("about:blank", UNRENDERED)], measure), null);
  assert.equal(await launchTab([tab("about:blank", LAID_OUT), tab("about:blank", LAID_OUT)], measure), null);
  const failing = { url: () => "about:blank", evaluate: async () => { throw new Error("Target closed"); } };
  assert.equal(await launchTab([failing]), null);
});

await check("a device that stops answering fails the run within the answer limit, naming the command, and the session is undone", () =>
  withAdb(async () => {
    const fake = fakeAndroid();
    const answering = fake.devices[0].shell;
    fake.devices[0].shell = (command) => (command === "wm size" ? new Promise(() => {}) : answering(command));
    await assert.rejects(
      openAndroidDevice({ record: { url: "http://localhost:38000" }, answerMs: 50, ...fake, ...adbHere }),
      /`adb shell wm size` on emulator-5554 did not answer within 0\.05 s; the device has stopped responding/,
    );
    assert.deepEqual(fake.log.slice(-3), [["adb", "-s", "emulator-5554", "reverse", "--remove", "tcp:38000"], ["device.close"], ["release"]]);

    const listing = fakeAndroid();
    listing.playwright = async () => ({ _android: { devices: () => new Promise(() => {}) } });
    await assert.rejects(openAndroidDevice({ record: { url: "http://localhost:38000" }, answerMs: 50, ...listing, ...adbHere }), /Playwright's list of Android devices did not answer within 0\.05 s/);
    assert.deepEqual(listing.log.at(-1), ["release"]);
    assert.equal(SHELL_SECONDS, 30);
  }));

await check("a page that measures 0x0 or is not the visible tab fails the run, naming the cause", () => {
  assert.equal(pageVerdict({ width: 430, height: 807, visibility: "visible" }), null);
  assert.match(pageVerdict({ width: 0, height: 0, visibility: "visible" }), /the page the run drove measures 0x0/);
  assert.match(pageVerdict({ width: 430, height: 0, visibility: "visible" }), /measures 430x0/);
  assert.match(pageVerdict({ width: 430, height: 807, visibility: "hidden" }), /is not the visible tab \(document\.visibilityState is hidden\)/);
});

await check("the mapping rule: unmapped ports are added, a same-port mapping is a dead run's and is taken over, and one sent elsewhere is refused", () => {
  const mapped = new Map([[38001, 38001], [38000, 39999], [9000, 9001]]);
  assert.deepEqual(planReverse([38000, 38001, 38002], mapped), { add: [38002], leftover: [38001], conflicts: [38000] });
  assert.deepEqual(planReverse([38002], new Map()), { add: [38002], leftover: [], conflicts: [] });
});

await check("a device shot waits for the surface the step before it opened, and each named step says what that is", () => {
  for (const [name, def] of Object.entries(NAMED_STEPS)) {
    if (def.builtBy) continue;
    assert.equal(typeof def.waitsFor?.what, "string", name);
    assert.equal(typeof def.waitsFor?.selector, "string", name);
  }
  const steps = parseUiSteps(["--step", "add-menu", "--shot", "a.png", "--tap", "1,2", "--shot", "b.png", "--step", "app-menu", "--shot-of", "page", "c.png", "--shot", "d.png"], { device });
  assert.deepEqual(shotWaitsFor(steps, 1), NAMED_STEPS["add-menu"].waitsFor);
  assert.equal(shotWaitsFor(steps, 3), null);
  assert.deepEqual(shotWaitsFor(steps, 7), NAMED_STEPS["app-menu"].waitsFor);
  assert.equal(shotWaitsFor(parseUiSteps(["--shot", "a.png"], { device }), 0), null);
});

await check("one rule picks a shot's gate: after a named step it is that step's surface, and only a shot of nothing named waits on the script editor", () => {
  const steps = parseUiSteps(["--shot", "a.png", "--step", "play", "--shot", "b.png", "--shot-of", "page", "c.png", "--tap", "1,2", "--shot", "d.png"], { device });
  assert.deepEqual(shotGate(steps, 0), { gate: "editor" });
  assert.deepEqual(shotGate(steps, 2), { gate: "surface", waitsFor: NAMED_STEPS.play.waitsFor });
  assert.deepEqual(shotGate(steps, 3), { gate: "surface", waitsFor: NAMED_STEPS.play.waitsFor });
  assert.deepEqual(shotGate(steps, 5), { gate: "editor" });
  for (const name of Object.keys(NAMED_STEPS)) {
    if (NAMED_STEPS[name].builtBy || NAMED_STEPS[name].argument) continue;
    assert.equal(shotGate(parseUiSteps(["--step", name, "--shot", "x.png"], { device }), 1).gate, "surface", name);
  }
});

await check("a shot of a named step's surface is not refused because the script editor is covered, while a shot of nothing named still is", async () => {
  const { page } = addSheetPage({ animationPolls: 0 });
  const dev = stubDevice();
  const asked = [];
  const refusing = () => {
    const gate = async (_page, what) => {
      asked.push(what);
      return { required: true, ok: false, reason: "the script editor is not on screen (the preview covers it)" };
    };
    gate.noteSettled = () => {};
    gate.reset = () => {};
    return gate;
  };
  const before = path.join(scratch, "covered-before.png");
  const after = path.join(scratch, "covered-after.png");
  const result = await ui(["--shot", before, "--step", "add-menu", "--shot", after], { device, ...uiDeps(page, dev).deps, editorGate: refusing });
  assert.equal(result.steps[0].gated, true);
  assert.equal(result.steps[0].screenshot, null);
  assert.equal(result.steps[2].gated, undefined);
  assert.equal(result.steps[2].waitedFor, "the Add to script panel");
  assert.equal(result.steps[2].screenshot, path.resolve(after));
  assert.deepEqual(asked, ["screenshot"]);
  assert.deepEqual(dev.calls.filter(([kind]) => kind === "screenshot"), [["screenshot", path.resolve(after)]]);
  process.exitCode = 0;
});

function addSheetPage({ animationPolls, hidden = false }) {
  const panelSelector = NAMED_STEPS["add-menu"].waitsFor.selector;
  const dom = { open: false, polls: 0 };
  const panel = { getBoundingClientRect: () => ({ width: 430, height: 420 }), contains: (other) => other === panel };
  const running = () => dom.open && dom.polls < animationPolls;
  const fakeDocument = {
    querySelectorAll: (selector) => (selector === panelSelector && dom.open ? [panel] : []),
    getAnimations: () => (running() ? [{ effect: { target: panel, getComputedTiming: () => ({ endTime: 250 }) }, playState: "running" }] : []),
  };
  const page = stubPage();
  const evaluateDefault = page.evaluate;
  page.locator = (selector) => ({
    first: () => ({
      isVisible: async () => selector === "[data-add-trigger]",
      click: async () => {
        dom.open = true;
      },
      waitFor: async () => {
        if (selector === panelSelector && !dom.open) throw new Error("not visible");
      },
    }),
  });
  page.evaluate = (fn, arg) => (arg === panelSelector ? Promise.resolve([{ construct: "character", disabled: false }]) : evaluateDefault(fn, arg));
  page.frames = () => [fakeFrame(fakeDocument, { hidden, onCheck: () => dom.polls++ })];
  page.waitForTimeout = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  return { page, dom, animating: running };
}

function fakeFrame(fakeDocument, { hidden = false, onCheck = () => {} } = {}) {
  return {
    evaluate: async (fn, arg) => {
      if (typeof arg !== "string") return undefined;
      const saved = { document: globalThis.document, getComputedStyle: globalThis.getComputedStyle };
      globalThis.document = fakeDocument;
      globalThis.getComputedStyle = () => ({ visibility: hidden ? "hidden" : "visible" });
      try {
        return fn(arg);
      } finally {
        Object.assign(globalThis, saved);
        onCheck();
      }
    },
  };
}

await check("the paint wait looks in every frame, so Play's game inside the player frame counts as painted", async () => {
  const shown = { getBoundingClientRect: () => ({ width: 430, height: 242 }), contains: (other) => other === shown };
  const editorDocument = { querySelectorAll: () => [], getAnimations: () => [] };
  const playerDocument = { querySelectorAll: (selector) => (selector === "#game" ? [shown] : []), getAnimations: () => [] };
  const page = { frames: () => [fakeFrame(editorDocument), fakeFrame(playerDocument)], waitForTimeout: async () => {} };
  assert.equal(await surfacePainted(page, NAMED_STEPS.play.waitsFor), true);
});

await check("on a device, --shot after a named step waits until that step's surface has finished animating, and fails when it never settles", async () => {
  for (const [label, options, settles] of [["settles", { animationPolls: 3 }, true], ["never settles", { animationPolls: Infinity }, false], ["stays hidden", { animationPolls: 0, hidden: true }, false]]) {
    const { page, animating } = addSheetPage(options);
    const dev = stubDevice();
    const captured = [];
    dev.screenshot = async () => captured.push({ animating: animating() });
    const result = await ui(["--step", "add-menu", "--shot", path.join(scratch, `add-${label}.png`)], { device, ...uiDeps(page, dev).deps });
    assert.deepEqual(result.steps[0], { step: "add-menu", ran: true, opened: "popover", rows: [{ construct: "character", disabled: false }] }, label);
    const shotStep = result.steps[1];
    assert.equal(shotStep.waitedFor, "the Add to script panel", label);
    assert.equal(captured.length, 1, label);
    if (settles) {
      assert.deepEqual(captured, [{ animating: false }], label);
      assert.equal(shotStep.reason, undefined, label);
      assert.deepEqual(result.failed, [], label);
      assert.equal(process.exitCode, 0, label);
    } else {
      assert.match(shotStep.reason, /the Add to script panel had not painted within 5s of the screenshot/, label);
      assert.deepEqual(result.failed, [shotStep.reason], label);
      assert.equal(process.exitCode, 1, label);
    }
    process.exitCode = 0;
  }
});

const OWNED_PREVIEW = "impower-driver/revealed-preview";

function phonePreviewPage({ paneShown = false, owned = false, saveStuck = false, backMissing = false } = {}) {
  const pane = '[role="group"][aria-label="Playback controls"]';
  const show = 'button[aria-label="Show the preview"]';
  const settings = 'button[aria-label="Preview settings"]';
  const open = '[role="menu"], [role="dialog"]';
  const state = { paneShown, savedRevealed: paneShown, menuOpen: false, storage: owned ? { [OWNED_PREVIEW]: "1" } : {}, pressed: [] };
  const visible = (selector, options) => {
    if (selector === pane || selector === settings) return state.paneShown;
    if (selector === show) return !state.paneShown;
    if (selector === open) return state.menuOpen;
    if (options?.hasText === "Back to story") return state.paneShown && !backMissing;
    return false;
  };
  const page = stubPage();
  page.keyboard = { press: async (key) => { if (key === "Escape") state.menuOpen = false; } };
  page.locator = (selector, options) => ({
    first: () => ({
      isVisible: async () => visible(selector, options),
      click: async () => {
        state.pressed.push(options?.hasText ?? selector);
        if (selector === show) state.paneShown = state.savedRevealed = true;
        if (selector === settings) state.menuOpen = true;
        if (options?.hasText === "Back to story") state.paneShown = false;
      },
      waitFor: async ({ state: want } = {}) => {
        if ((want === "hidden") === visible(selector, options)) throw new Error("timeout");
      },
    }),
  });
  page.evaluate = async (fn, arg) => {
    if (Array.isArray(arg) && arg[0] === OWNED_PREVIEW) {
      if (arg[1] === "claim") state.storage[OWNED_PREVIEW] = "1";
      if (arg[1] === "release") delete state.storage[OWNED_PREVIEW];
      return state.storage[OWNED_PREVIEW] === "1";
    }
    if (arg === undefined && String(fn).includes("menuitemcheckbox")) return [{ name: "Game preview follows cursor", checked: true }];
    return { width: 430, height: 807, devicePixelRatio: 3, visibility: "visible" };
  };
  page.waitForFunction = async (fn) => {
    if (String(fn).includes("workspace/")) {
      if (saveStuck) throw new Error("timeout");
      state.savedRevealed = state.paneShown;
      if (state.savedRevealed) throw new Error("timeout");
    }
    return true;
  };
  return { page, state };
}

await check("in the phone layout a preview step reveals the pane through ui before its body runs, and the run hides it again and waits for the hidden pane to be saved", async () => {
  const { page, state } = phonePreviewPage();
  const result = await ui(["--step", "preview-settings"], uiDeps(page, null).deps);
  assert.equal(result.steps[0].ran, true, JSON.stringify(result.steps[0]));
  assert.equal(result.steps[0].revealed, "preview");
  assert.deepEqual(state.pressed, ['button[aria-label="Show the preview"]', 'button[aria-label="Preview settings"]', "Back to story"]);
  assert.deepEqual(result.hidAgain, [{ reveal: "preview", hidden: true }]);
  assert.equal(state.paneShown, false);
  assert.equal(state.savedRevealed, false);
  assert.deepEqual(state.storage, {});
  assert.deepEqual(result.failed, []);
  assert.equal(process.exitCode, 0);
});

await check("a run whose revealed pane cannot be hidden and saved again fails, naming why", async () => {
  for (const [label, options, cause] of [["save never lands", { saveStuck: true }, /the workspace had not saved the preview as hidden within 5 s/], ["no Back to story", { backMissing: true }, /the preview pane is on screen and its Back to story link is not/]]) {
    const { page, state } = phonePreviewPage(options);
    const result = await ui(["--step", "preview-settings"], uiDeps(page, null).deps);
    assert.equal(result.hidAgain[0].hidden, false, label);
    assert.match(result.failed.at(-1), /the preview pane this run revealed was not hidden again/, label);
    assert.match(result.failed.at(-1), cause, label);
    assert.equal(state.storage[OWNED_PREVIEW], "1", `${label}: the run keeps its claim so the next run hides the pane`);
    assert.equal(process.exitCode, 1, label);
    process.exitCode = 0;
  }
});

await check("a pane an earlier run revealed and never hid is hidden when the next run starts, and an author's own pane is left alone", async () => {
  const left = phonePreviewPage({ paneShown: true, owned: true });
  const shot = path.join(scratch, "reclaimed.png");
  const result = await ui(["--shot", shot], uiDeps(left.page, null).deps);
  assert.deepEqual(result.previewReclaimed, { restored: true });
  assert.equal(left.state.paneShown, false);
  assert.deepEqual(left.state.storage, {});
  assert.deepEqual(result.failed, []);
  const authors = phonePreviewPage({ paneShown: true });
  const kept = await ui(["--shot", shot], uiDeps(authors.page, null).deps);
  assert.equal(kept.previewReclaimed, undefined);
  assert.equal(authors.state.paneShown, true);
  assert.deepEqual(authors.state.pressed, []);
  process.exitCode = 0;
});

await check("verify fails when it cannot hide a pane an earlier run left, as ui does, and hides one it can", async () => {
  const failing = phonePreviewPage({ paneShown: true, owned: true, saveStuck: true });
  const verifyDeps = (page) => ({ ...uiDeps(page, null).deps, ensureScriptEditor: async () => ({ present: false, reason: "stub stops here" }), previewSummary: async () => null });
  const failed = await verify([], verifyDeps(failing.page));
  assert.equal(failed.previewReclaimed.restored, false);
  assert.match(failed.error, /an earlier run revealed the preview pane and ended before hiding it, and it could not be hidden now: the workspace had not saved the preview as hidden/);
  assert.equal(process.exitCode, 1);
  process.exitCode = 0;
  const viaUi = await ui(["--shot", path.join(scratch, "reclaim-fail.png")], uiDeps(phonePreviewPage({ paneShown: true, owned: true, saveStuck: true }).page, null).deps);
  assert.match(viaUi.failed.join(" "), /could not be hidden now/);
  assert.equal(process.exitCode, 1);
  process.exitCode = 0;
  const left = phonePreviewPage({ paneShown: true, owned: true });
  let reached = false;
  await verify([], { ...verifyDeps(left.page), ensureScriptEditor: async () => { reached = true; return { present: false, reason: "stub stops here" }; } });
  assert.equal(reached, true);
  assert.equal(left.state.paneShown, false);
  assert.deepEqual(left.state.storage, {});
  process.exitCode = 0;
});

await check("a device run whose page measures 0x0 stops at the start with a failure and exit code 1, in ui and in verify", async () => {
  const blank = () => {
    const page = stubPage();
    page.evaluate = async () => ({ width: 0, height: 0, devicePixelRatio: 1, visibility: "hidden" });
    return page;
  };
  const dev = stubDevice();
  const uiRun = await ui(["--shot", path.join(scratch, "blank.png")], { device, ...uiDeps(blank(), dev).deps });
  assert.match(uiRun.failed.join(" "), /measures 0x0/);
  assert.deepEqual(dev.calls, []);
  assert.equal(process.exitCode, 1);
  process.exitCode = 0;
  const verifyDeps = { ...uiDeps(blank(), dev).deps, ensureScriptEditor: async () => ({ present: true, settled: true }) };
  const verifyRun = await verify([], verifyDeps);
  assert.match(verifyRun.error, /measures 0x0/);
  assert.equal(process.exitCode, 1);
  process.exitCode = 0;
});

await check("verify on a device takes its --shot through the device and reports the device", async () => {
  const page = stubPage();
  const dev = stubDevice();
  const shot = path.join(scratch, "verify-screen.png");
  const deps = {
    ...uiDeps(page, dev).deps,
    previewSummary: async () => ({ installed: true }),
    editorPainted: async () => true,
    ensureScriptEditor: async () => ({ present: true, settled: true }),
    waitForGame: async () => ({ mounted: true }),
    waitForProgram: async () => ({ loaded: true, ms: 1 }),
    waitForPreviewSettle: async () => ({ settled: true, text: "" }),
    routeLabel: async () => null,
    documentLines: async () => [],
    clickLine: async () => ({ clicked: false, reason: "stub" }),
  };
  const result = await verify(["--shot", shot], deps);
  assert.equal(result.screenshot, shot);
  assert.equal(result.screenshotOf, "screen");
  assert.deepEqual(dev.calls, [["screenshot", shot]]);
  assert.deepEqual(page.shots, []);
  assert.equal(result.device.serial, "emulator-5554");
  assert.deepEqual(result.device.page, { width: 360, height: 780, devicePixelRatio: 3 });
  process.exitCode = 0;
});

await check("the editor's ports come from the server record, with the URL's port as a fallback, and reverse targets are kept", () => {
  assert.deepEqual(editorPorts({ url: "http://localhost:38000", ports: { editor: 38000, player: 38001, hmr: 38002 } }), [38000, 38001, 38002]);
  assert.deepEqual(editorPorts({ url: "http://localhost:38004" }), [38004]);
  assert.deepEqual([...parseReverseList("emulator-5554 tcp:38000 tcp:38000\nhost-19 tcp:9000 tcp:9001\n")], [[38000, 38000], [9000, 9001]]);
});

const freePort = () =>
  new Promise((resolve) => {
    const server = net.createServer().listen({ port: 0, host: "127.0.0.1" }, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

await check("each device gets its own lock port in a fixed range", () => {
  for (const serial of ["emulator-5554", "emulator-5556", "R5CX12345"]) {
    const port = deviceLockPort(serial);
    assert.ok(port >= 36900 && port < 37000, `${serial} → ${port}`);
    assert.equal(deviceLockPort(serial), port);
  }
});

await check("a live holder makes the waiter time out naming it, a zero wait tries once without asking, and release frees the device", async () => {
  const port = await freePort();
  const held = await acquireDevice("emulator-5554", { port, session: "mine", worktree: "/w", command: "screenshot story" });
  const lines = [];
  await assert.rejects(
    acquireDevice("emulator-5554", { port, waitSeconds: 1, pollMs: 200, log: (line) => lines.push(line) }),
    new RegExp(`timed out after 1 s waiting for Android device emulator-5554, held by pid ${process.pid}, device emulator-5554, session mine, worktree /w, running \`screenshot story\`, since \\S+ \\(the hold is a listener on 127\\.0\\.0\\.1:${port} and ends with that process\\)`),
  );
  assert.equal(lines.length, 1);
  await assert.rejects(acquireDevice("emulator-5554", { port, waitSeconds: 0 }), /timed out after 0 s waiting for Android device emulator-5554, held by another process \(no wait was left to ask which\)/);
  held.release();
  held.release();
  const again = await acquireDevice("emulator-5554", { port, waitSeconds: 0 });
  assert.equal(again.waitedMs < 5_000, true);
  again.release();
});

const fakeQueue = ({ waitSeconds, holds, askAnswer = () => ({ holder: { pid: 77, serial: "emulator-5554", acquiredAt: "t" } }), holdMs = 0, askMs = 0, lateWakeMs = 0, pollMs = 2_000 }) => {
  const trace = { clock: 0, binds: 0, asks: [], sleeps: [], deadline: waitSeconds * 1000 };
  const options = {
    port: 1,
    waitSeconds,
    pollMs,
    now: () => trace.clock,
    sleep: async (ms) => {
      trace.sleeps.push({ ms, remaining: trace.deadline - trace.clock });
      trace.clock += ms + lateWakeMs;
    },
    hold: async () => {
      if (++trace.binds > 50) throw new Error(`spinning: ${trace.binds} binds`);
      trace.clock += holdMs;
      return holds(trace.binds);
    },
    ask: async (port, { timeoutMs }) => {
      trace.asks.push({ timeoutMs, remaining: trace.deadline - trace.clock });
      trace.clock += Math.min(askMs, timeoutMs);
      return askAnswer(trace.asks.length);
    },
  };
  return { trace, options };
};

await check("every wait inside the queue loop is capped by what is left of --device-wait, and the loop ends at the deadline", async () => {
  const { trace, options } = fakeQueue({ waitSeconds: 5, holds: () => null, holdMs: 100, askMs: 300 });
  await assert.rejects(acquireDevice("emulator-5554", options), /timed out after 5 s waiting for Android device emulator-5554, held by pid 77/);
  assert.deepEqual(trace.asks, [
    { timeoutMs: 3_000, remaining: 4_900 },
    { timeoutMs: 2_500, remaining: 2_500 },
    { timeoutMs: 100, remaining: 100 },
  ]);
  assert.deepEqual(trace.sleeps, [
    { ms: 2_000, remaining: 4_600 },
    { ms: 2_000, remaining: 2_200 },
  ]);
  assert.equal(trace.binds, 3);
  assert.equal(trace.clock, 5_000);
});

await check("a wake that comes late after the deadline does not bind, even when the holder has let go", async () => {
  const { trace, options } = fakeQueue({ waitSeconds: 1, holds: (n) => (n === 1 ? null : { close: () => {} }), lateWakeMs: 600 });
  await assert.rejects(acquireDevice("emulator-5554", options), /timed out after 2 s waiting for Android device emulator-5554, held by pid 77/);
  assert.equal(trace.binds, 1);
  assert.deepEqual(trace.sleeps, [{ ms: 1_000, remaining: 1_000 }]);
});

await check("a bind that leaves no wait does not ask who holds the port, and a zero wait binds once", async () => {
  const late = fakeQueue({ waitSeconds: 1, holds: () => null, holdMs: 1_000 });
  await assert.rejects(acquireDevice("emulator-5554", late.options), /held by another process \(no wait was left to ask which\)/);
  assert.deepEqual(late.trace.asks, []);
  assert.equal(late.trace.binds, 1);

  const zero = fakeQueue({ waitSeconds: 0, holds: () => null });
  await assert.rejects(acquireDevice("emulator-5554", zero.options), /timed out after 0 s/);
  assert.deepEqual([zero.trace.binds, zero.trace.asks.length, zero.trace.sleeps.length], [1, 0, 0]);

  const free = fakeQueue({ waitSeconds: 0, holds: () => ({ close: () => {} }) });
  const held = await acquireDevice("emulator-5554", free.options);
  assert.equal(free.trace.binds, 1);
  held.release();
});

await check("holders that keep letting go while the waiter asks still end the wait at its deadline, and one that lets go once is followed at once", async () => {
  const cycling = fakeQueue({ waitSeconds: 1, holds: () => null, holdMs: 400, askAnswer: () => ({ gone: true }) });
  await assert.rejects(acquireDevice("emulator-5554", cycling.options), /timed out after 1 s waiting for Android device emulator-5554, held by another process \(no wait was left to ask which\)/);
  assert.equal(cycling.trace.binds, 3);
  assert.deepEqual(cycling.trace.asks, [{ timeoutMs: 600, remaining: 600 }, { timeoutMs: 200, remaining: 200 }]);
  assert.deepEqual(cycling.trace.sleeps, []);

  const answers = [{ holder: { pid: 77, serial: "emulator-5554", acquiredAt: "t" } }, { gone: true }];
  let binds = 0;
  const lines = [];
  const sleeps = [];
  const held = await acquireDevice("emulator-5554", {
    port: 1,
    waitSeconds: 60,
    log: (line) => lines.push(line),
    sleep: async (ms) => sleeps.push(ms),
    hold: async () => (++binds === 3 ? { close: () => {} } : null),
    ask: async () => answers.shift(),
  });
  assert.equal(binds, 3);
  assert.deepEqual(sleeps, [2_000]);
  assert.deepEqual(lines, ["waiting for Android device emulator-5554: held by pid 77, device emulator-5554, since t; waiting up to 60 s"]);
  held.release();
});

await check("a bind that never finishes fails after its stall limit, and a server it opens later is closed", async () => {
  const neverAt = Date.now();
  let guard;
  const stalled = acquireDevice("emulator-5554", { port: 1, waitSeconds: 0, hold: () => new Promise(() => {}) });
  const bounded = Promise.race([stalled, new Promise((_, reject) => (guard = setTimeout(() => reject(new Error("the stalled bind was still pending after 5000 ms")), 5_000)))]);
  await assert.rejects(bounded.finally(() => clearTimeout(guard)), /binding 127\.0\.0\.1:1 for Android device emulator-5554 did not finish within 1000 ms/);
  const never = Date.now() - neverAt;
  assert.ok(never >= 900 && never < 2_000, `stall limit took ${never} ms`);
  let closed = false;
  await assert.rejects(
    acquireDevice("emulator-5554", { port: 1, waitSeconds: 0, hold: () => new Promise((resolve) => setTimeout(() => resolve({ close: () => (closed = true) }), 1_300)) }),
    /did not finish within 1000 ms/,
  );
  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.equal(closed, true);
});

await check("a listener that keeps trickling bytes without ending cannot stretch the lookup or the wait past their limits", async () => {
  const port = await freePort();
  const timers = new Set();
  const sockets = new Set();
  const trickler = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => {});
    const timer = setInterval(() => socket.write("x"), 50);
    timers.add(timer);
    socket.on("close", () => clearInterval(timer));
  }).listen({ port, host: "127.0.0.1" });
  await new Promise((resolve) => trickler.once("listening", resolve));
  const guards = [];
  const within = (promise, ms, what) =>
    Promise.race([
      promise,
      new Promise((_, reject) => guards.push(setTimeout(() => reject(new Error(`${what} was still pending after ${ms} ms`)), ms))),
    ]);
  try {
    const askedAt = Date.now();
    assert.deepEqual(await within(askHolder(port, { timeoutMs: 400 }), 1_500, "a 400 ms lookup"), { holder: null });
    const asked = Date.now() - askedAt;
    assert.ok(asked >= 350 && asked < 800, `a 400 ms lookup took ${asked} ms`);
    const waitedAt = Date.now();
    await assert.rejects(
      within(acquireDevice("emulator-5554", { port, waitSeconds: 1, pollMs: 200 }), 5_000, "a 1 s device wait"),
      /timed out after 1 s waiting for Android device emulator-5554, held by a process that did not say who it is/,
    );
    const waited = Date.now() - waitedAt;
    assert.ok(waited >= 900 && waited < 1_400, `a 1 s wait took ${waited} ms`);
  } finally {
    for (const guard of guards) clearTimeout(guard);
    for (const timer of timers) clearInterval(timer);
    for (const socket of sockets) socket.destroy();
    trickler.close();
  }
});

await check("a listener that does not say who it is still holds the port, and the timeout says so", async () => {
  const port = await freePort();
  const foreign = net.createServer((socket) => socket.end("hello")).listen({ port, host: "127.0.0.1" });
  await new Promise((resolve) => foreign.once("listening", resolve));
  try {
    await assert.rejects(acquireDevice("emulator-5554", { port, waitSeconds: 1, pollMs: 200 }), /held by a process that did not say who it is \(the hold is a listener on 127\.0\.0\.1:\d+/);
  } finally {
    foreign.close();
  }
});

const holdScript = path.join(scratch, "hold.mjs");
fs.writeFileSync(
  holdScript,
  [
    `import { acquireDevice } from ${JSON.stringify(ANDROID)};`,
    `const [name, port, holdMs] = process.argv.slice(2);`,
    `const held = await acquireDevice("emulator-5554", { port: Number(port), pollMs: 200, waitSeconds: 60, session: name, worktree: "/w/" + name, command: "screenshot " + name, log: (line) => console.log("LOG " + line) });`,
    `console.log("ACQUIRED " + name + " " + Date.now());`,
    `await new Promise((resolve) => setTimeout(resolve, Number(holdMs)));`,
    `console.log("RELEASED " + name + " " + Date.now());`,
    `held.release();`,
  ].join("\n"),
);
const startHolder = (name, port, holdMs) => {
  const child = spawn(process.execPath, [holdScript, name, String(port), String(holdMs)], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let out = "";
  child.stdout.on("data", (chunk) => (out += chunk));
  child.stderr.on("data", (chunk) => (out += chunk));
  const closed = new Promise((resolve) => child.on("close", (code) => resolve({ name, pid: child.pid, code, out })));
  return { child, closed, output: () => out };
};

await check("a holder that is killed frees the device at once", async () => {
  const port = await freePort();
  const holder = startHolder("doomed", port, 600_000);
  const began = Date.now();
  while (!/ACQUIRED doomed/.test(holder.output())) {
    if (Date.now() - began > 30_000) throw new Error(`holder never acquired: ${holder.output()}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  holder.child.kill("SIGKILL");
  await holder.closed;
  const next = await acquireDevice("emulator-5554", { port, waitSeconds: 5 });
  assert.ok(next.waitedMs < 5_000, `waited ${next.waitedMs} ms`);
  next.release();
});

await check("two processes started together against one device run one after the other, and the second says it is waiting and for whom", async () => {
  const port = await freePort();
  const runs = await Promise.all([startHolder("one", port, 2_500).closed, startHolder("two", port, 2_500).closed]);
  for (const run of runs) assert.equal(run.code, 0, run.out);
  const at = (run, word) => Number(new RegExp(`${word} ${run.name} (\\d+)`).exec(run.out)?.[1]);
  const [first, second] = [...runs].sort((a, b) => at(a, "ACQUIRED") - at(b, "ACQUIRED"));
  assert.ok(at(second, "ACQUIRED") >= at(first, "RELEASED"), `overlap:\n${first.out}\n${second.out}`);
  assert.match(second.out, new RegExp(`LOG waiting for Android device emulator-5554: held by pid ${first.pid}, device emulator-5554, session ${first.name}, worktree /w/${first.name}, running \`screenshot ${first.name}\`, since \\S+; waiting up to 60 s`));
  assert.doesNotMatch(first.out, /waiting for Android device/);
});

fs.rmSync(scratch, { recursive: true, force: true });
if (failures) {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("all android route checks passed");

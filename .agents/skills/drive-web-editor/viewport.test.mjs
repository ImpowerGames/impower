#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { contextOptions, displayReport, parseViewport, PREFERENCES_STORAGE_KEY, screenshotPath, seedThemePreference, shotFileName, takeDisplayFlags, themeMismatch, themeSeed } from "./viewport.mjs";
import { launchEditorBrowser, parseScreenshotArgs } from "./driver.mjs";

const DRIVER = path.join(path.dirname(fileURLToPath(import.meta.url)), "driver.mjs");

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

const none = { viewport: null, colorScheme: null, theme: null };

await check("each preset resolves to its size, and only the phone presets turn on touch", () => {
  assert.deepEqual(parseViewport("desktop"), { name: "desktop", width: 1440, height: 900, touch: false });
  assert.deepEqual(parseViewport("tablet"), { name: "tablet", width: 768, height: 1024, touch: false });
  assert.deepEqual(parseViewport("phone"), { name: "phone", width: 360, height: 780, touch: true });
  assert.deepEqual(parseViewport("phone-large"), { name: "phone-large", width: 430, height: 932, touch: true });
});

await check("an arbitrary WxH is accepted and an invalid value names the presets", () => {
  assert.deepEqual(parseViewport("1280x720"), { name: "1280x720", width: 1280, height: 720, touch: false });
  for (const bad of ["huge", "1280", "0x720", "1280x", "12.5x720", "toString", "20000x720"]) {
    assert.throws(() => parseViewport(bad), /presets: desktop \(1440x900\), tablet \(768x1024\), phone \(360x780\), phone-large \(430x932\)/, bad);
  }
});

await check("the flags are taken out of argv wherever they sit, leaving the command and its own arguments", () => {
  const argv = ["node", "driver.mjs", "--viewport", "phone", "ui", "--color-scheme", "dark", "--shot", "a.png", "--theme", "charcoal"];
  const display = takeDisplayFlags(argv);
  assert.deepEqual(argv, ["node", "driver.mjs", "ui", "--shot", "a.png"]);
  assert.equal(display.viewport.name, "phone");
  assert.equal(display.colorScheme, "dark");
  assert.equal(display.theme, "charcoal");
});

await check("a missing, repeated or unknown flag value is refused", () => {
  assert.throws(() => takeDisplayFlags(["--viewport"]), /--viewport needs a value/);
  assert.throws(() => takeDisplayFlags(["--viewport", "--shot"]), /--viewport needs a value/);
  assert.throws(() => takeDisplayFlags(["--viewport", "phone", "--viewport", "tablet"]), /more than once/);
  assert.throws(() => takeDisplayFlags(["--color-scheme", "sepia"]), /light or dark/);
  assert.throws(() => takeDisplayFlags(["--theme", "../x"]), /theme name/);
});

await check("with no flags the context keeps the 1600x1000 mouse-only default", () => {
  assert.deepEqual(takeDisplayFlags(["ui"]), none);
  assert.deepEqual(contextOptions(none), { viewport: { width: 1600, height: 1000 } });
});

await check("phone presets set touch, isMobile and scale factor 3; tablet and color scheme pass straight through", () => {
  assert.deepEqual(contextOptions({ ...none, viewport: parseViewport("phone") }), {
    viewport: { width: 360, height: 780 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3,
  });
  assert.deepEqual(contextOptions({ ...none, viewport: parseViewport("tablet"), colorScheme: "dark" }), {
    viewport: { width: 768, height: 1024 },
    colorScheme: "dark",
  });
});

await check("the launcher hands the display options to the persistent context and seeds the theme", async () => {
  let seen;
  const initScripts = [];
  const fake = async () => ({
    chromium: {
      executablePath: () => "",
      launchPersistentContext: async (_dir, options) => {
        seen = options;
        return { addInitScript: async (fn, arg) => initScripts.push([fn, arg]) };
      },
    },
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "viewport-test-profile-"));
  const previous = process.env.IMPOWER_DRIVER_CHROMIUM;
  process.env.IMPOWER_DRIVER_CHROMIUM = process.execPath;
  try {
    await launchEditorBrowser({ headless: true, dir, platform: "linux", playwright: fake, display: { ...none, viewport: parseViewport("phone"), colorScheme: "dark", theme: "chalk" } });
  } finally {
    if (previous == null) delete process.env.IMPOWER_DRIVER_CHROMIUM;
    else process.env.IMPOWER_DRIVER_CHROMIUM = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.ok(seen, "launchPersistentContext was not called");
  assert.deepEqual(seen.viewport, { width: 360, height: 780 });
  assert.equal(seen.hasTouch, true);
  assert.equal(seen.isMobile, true);
  assert.equal(seen.deviceScaleFactor, 3);
  assert.equal(seen.colorScheme, "dark");
  assert.deepEqual(initScripts, [[seedThemePreference, themeSeed({ ...none, theme: "chalk" })]]);
});

await check("flags on the driver's own command line reach the browser context without being passed in", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "viewport-test-argv-"));
  const source = [
    `const { launchEditorBrowser } = await import(${JSON.stringify(pathToFileURL(DRIVER).href)});`,
    "let seen;",
    "const chromium = { executablePath: () => '', launchPersistentContext: async (_dir, options) => { seen = options; return { addInitScript: async () => {} }; } };",
    `await launchEditorBrowser({ headless: true, dir: ${JSON.stringify(path.join(dir, "profile"))}, platform: 'linux', playwright: async () => ({ chromium }) });`,
    "console.log('OPTIONS ' + JSON.stringify(seen));",
  ].join("\n");
  const run = (...flags) => {
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", source, "--", ...flags], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 60_000,
      env: { ...process.env, IMPOWER_DRIVER_CHROMIUM: process.execPath },
    });
    const line = child.stdout.split("\n").find((l) => l.startsWith("OPTIONS "));
    assert.ok(line, `no launch options printed (exit ${child.status}): ${child.stderr}`);
    return JSON.parse(line.slice("OPTIONS ".length));
  };
  try {
    const phone = run("--viewport", "phone", "--color-scheme", "dark", "--theme", "charcoal");
    assert.deepEqual(phone.viewport, { width: 360, height: 780 });
    assert.equal(phone.hasTouch, true);
    assert.equal(phone.isMobile, true);
    assert.equal(phone.deviceScaleFactor, 3);
    assert.equal(phone.colorScheme, "dark");
    const plain = run();
    assert.deepEqual(plain.viewport, { width: 1600, height: 1000 });
    assert.equal(plain.hasTouch, undefined);
    assert.equal(plain.colorScheme, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

await check("screenshot names carry the viewport, theme and scheme", () => {
  assert.equal(shotFileName("story", none), "story.png");
  assert.equal(shotFileName("story", { ...none, viewport: parseViewport("phone") }), "story-phone.png");
  assert.equal(shotFileName("story", { viewport: parseViewport("tablet"), colorScheme: "dark", theme: "charcoal" }), "story-tablet-charcoal-dark.png");
  assert.equal(shotFileName("story", { ...none, colorScheme: "light" }), "story-light.png");
  assert.equal(shotFileName("story", { ...none, viewport: parseViewport("1280x720") }), "story-1280x720.png");
  assert.throws(() => shotFileName("story.png", none), /bare name/);
  assert.throws(() => shotFileName("../story", none), /bare name/);
  assert.equal(screenshotPath("story", none, "out"), path.resolve("out", "story.png"));
});

await check("the report echoes the requested theme, and a theme the editor did not render is a failure", () => {
  assert.deepEqual(displayReport({ ...none, viewport: parseViewport("tablet") }), {
    viewport: "tablet",
    width: 768,
    height: 1024,
    touch: false,
    colorScheme: null,
    theme: null,
  });
  const themed = displayReport({ ...none, theme: "charcoal" });
  assert.equal(themed.viewport, "default");
  assert.equal(themed.theme, "charcoal");
  assert.equal(themeMismatch(none, "charcoal"), null);
  assert.equal(themeMismatch({ ...none, theme: "chalk" }, "chalk"), null);
  assert.match(themeMismatch({ ...none, theme: "ink" }, "charcoal"), /--theme ink .* rendered charcoal/);
  assert.match(themeMismatch({ ...none, theme: "ink" }, null), /rendered no theme/);
});

await check("the theme seed sets or clears the preference once per page session and leaves other preferences alone", () => {
  const store = () => {
    const map = new Map();
    return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
  };
  const saved = { window: globalThis.window, localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage };
  const setTop = (value) => Object.defineProperty(globalThis, "top", { value, configurable: true });
  try {
    globalThis.window = globalThis;
    setTop(globalThis);
    globalThis.localStorage = store();
    globalThis.sessionStorage = store();
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ theme: "midnight", other: 1 }));
    seedThemePreference(themeSeed({ ...none, theme: "chalk" }));
    assert.deepEqual(JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY)), { theme: "chalk", other: 1 });
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ theme: "charcoal", other: 1 }));
    seedThemePreference(themeSeed({ ...none, theme: "chalk" }));
    assert.deepEqual(JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY)), { theme: "charcoal", other: 1 }, "a reload re-seeded the theme");
    globalThis.sessionStorage = store();
    seedThemePreference(themeSeed(none));
    assert.deepEqual(JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY)), { other: 1 });
    globalThis.sessionStorage = store();
    localStorage.setItem(PREFERENCES_STORAGE_KEY, "not json");
    seedThemePreference(themeSeed({ ...none, theme: "charcoal" }));
    assert.deepEqual(JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY)), { theme: "charcoal" });
    globalThis.sessionStorage = store();
    setTop({});
    localStorage.setItem(PREFERENCES_STORAGE_KEY, "{}");
    seedThemePreference(themeSeed({ ...none, theme: "chalk" }));
    assert.equal(localStorage.getItem(PREFERENCES_STORAGE_KEY), "{}", "a frame wrote the editor's preference");
  } finally {
    delete globalThis.top;
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  }
});

await check("screenshot arguments resolve the derived path and refuse strays", () => {
  assert.deepEqual(parseScreenshotArgs(["story", "--out-dir", "ev"], { ...none, viewport: parseViewport("phone") }), { out: path.resolve("ev", "story-phone.png"), headed: false });
  assert.deepEqual(parseScreenshotArgs(["story", "--headed"], none), { out: path.resolve("story.png"), headed: true });
  assert.throws(() => parseScreenshotArgs([], none), /needs a name/);
  assert.throws(() => parseScreenshotArgs(["story", "--shot", "x.png"], none), /unknown argument --shot/);
  assert.throws(() => parseScreenshotArgs(["story", "--out-dir"], none), /--out-dir needs a directory/);
});

await check("the CLI refuses display flags on commands that launch no editor browser, and rejects bad values before any work", () => {
  const run = (...args) => spawnSync(process.execPath, [DRIVER, ...args], { encoding: "utf8", windowsHide: true, timeout: 60_000 });
  const onStatus = run("--viewport", "tablet", "status");
  assert.equal(onStatus.status, 1);
  assert.match(onStatus.stderr, /apply to verify, ui, screenshot only, not status/);
  const badSize = run("--viewport", "huge", "ui");
  assert.equal(badSize.status, 1);
  assert.match(badSize.stderr, /presets: desktop/);
  const help = run("help");
  assert.match(help.stdout, /--viewport <preset\|WxH>/);
  assert.match(help.stdout, /screenshot <name>/);
});

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall viewport checks passed");

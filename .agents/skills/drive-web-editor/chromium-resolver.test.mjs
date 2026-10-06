// Pins the driver's Chromium resolver order (#1470): an explicit
// IMPOWER_DRIVER_CHROMIUM, the pinned Playwright build, the managed cache's
// other builds, then a system Chromium on PATH or at the usual Linux paths.
// Run:
//   node .agents/skills/drive-web-editor/chromium-resolver.test.mjs
//
// Every case is an in-memory file layout; nothing is downloaded or launched.

import assert from "node:assert/strict";
import { pinnedExecutable, resolveChromium } from "./driver.mjs";

const PINNED = "/home/agent/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell";

// A fake file system holding exactly `files` (and the directories above them).
function layout(files) {
  const set = new Set(files);
  return {
    exists: (p) => set.has(p) || files.some((f) => f.startsWith(p + "/")),
    readdir: (dir) => [...new Set(files.filter((f) => f.startsWith(dir + "/")).map((f) => f.slice(dir.length + 1).split("/")[0]))],
  };
}

function resolve(files, env = {}) {
  return resolveChromium({ expected: PINNED, env: { PATH: "/usr/local/bin:/usr/bin", ...env }, platform: "linux", ...layout(files) });
}

// Pinned cache present: Playwright's own build, unchanged default path.
{
  const r = resolve([PINNED, "/usr/bin/chromium"]);
  assert.equal(r.source, "playwright");
  assert.equal(r.executablePath, PINNED);
  assert.match(r.reason, /pinned/);
}

// Pinned cache missing, system Chromium on PATH: the system build, said so.
{
  const r = resolve(["/usr/bin/chromium"]);
  assert.equal(r.source, "system");
  assert.equal(r.executablePath, "/usr/bin/chromium");
  assert.match(r.reason, /PATH/);
  assert.match(r.reason, /chromium_headless_shell-1228/);
}

// Not on PATH but at a usual Linux location.
{
  const r = resolve(["/usr/bin/google-chrome"], { PATH: "/opt/nothing" });
  assert.equal(r.source, "system");
  assert.equal(r.executablePath, "/usr/bin/google-chrome");
}

// Another build in the managed cache wins over a system Chromium.
{
  const cached = "/cache/chromium-1200/chrome-linux/chrome";
  const r = resolve([cached, "/usr/bin/chromium"], { PLAYWRIGHT_BROWSERS_PATH: "/cache" });
  assert.equal(r.source, "cache");
  assert.equal(r.executablePath, cached);
}

// The explicit setting wins over everything, and a missing one is refused.
{
  const r = resolve([PINNED, "/opt/my/chrome"], { IMPOWER_DRIVER_CHROMIUM: "/opt/my/chrome" });
  assert.equal(r.source, "explicit");
  assert.equal(r.executablePath, "/opt/my/chrome");
  assert.throws(() => resolve([PINNED], { IMPOWER_DRIVER_CHROMIUM: "/opt/missing" }), /IMPOWER_DRIVER_CHROMIUM.*\/opt\/missing/);
}

// A headless launch runs the pinned headless shell, not the full build that
// chromium.executablePath() names, so that is the path checked first.
{
  const FULL = "/home/agent/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome";
  assert.equal(pinnedExecutable(FULL, { headless: true, platform: "linux" }), PINNED);
  assert.equal(pinnedExecutable(FULL, { headless: false, platform: "linux" }), FULL);
  assert.equal(
    pinnedExecutable("C:\\cache\\chromium-1228\\chrome-win64\\chrome.exe", { headless: true, platform: "win32" }),
    "C:\\cache\\chromium_headless_shell-1228\\chrome-headless-shell-win64\\chrome-headless-shell.exe",
  );
  assert.equal(pinnedExecutable("/opt/odd/chrome", { headless: true, platform: "linux" }), "/opt/odd/chrome");
  // Full build present, headless shell missing: the full build, said so.
  const r = resolveChromium({ expected: PINNED, full: FULL, env: { PATH: "/usr/bin" }, platform: "linux", ...layout([FULL, "/usr/bin/chromium"]) });
  assert.equal(r.source, "pinned-full");
  assert.equal(r.executablePath, FULL);
  assert.match(r.reason, /chromium_headless_shell-1228/);
  // Both missing: on to the system build, and the failure names both.
  assert.equal(resolveChromium({ expected: PINNED, full: FULL, env: { PATH: "/usr/bin" }, platform: "linux", ...layout(["/usr/bin/chromium"]) }).source, "system");
  assert.throws(() => resolveChromium({ expected: PINNED, full: FULL, env: {}, platform: "linux", ...layout([]) }), (e) => e.message.includes(FULL) && e.message.includes(PINNED));
}

// Neither present: one clear line naming every place that was looked at.
{
  assert.throws(
    () => resolve([], { PLAYWRIGHT_BROWSERS_PATH: "/cache" }),
    (e) => {
      const m = e.message;
      assert.doesNotMatch(m, /\n/);
      for (const want of ["no Chromium found", PINNED, "/cache/chromium-*", "chromium, chromium-browser, google-chrome on PATH", "/usr/bin/chromium", "/usr/bin/google-chrome", "IMPOWER_DRIVER_CHROMIUM"]) {
        assert.ok(m.includes(want), `missing ${want} in: ${m}`);
      }
      return true;
    },
  );
}

console.log("chromium-resolver: all cases pass");

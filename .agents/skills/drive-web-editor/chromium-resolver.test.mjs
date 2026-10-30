import assert from "node:assert/strict";
import fs from "node:fs";
import { pinnedExecutable, resolveChromium } from "./driver.mjs";
import { privateLaunch } from "./measure.mjs";

const PINNED = "/home/agent/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell";

function layout(files) {
  const set = new Set(files);
  return {
    exists: (p) => set.has(p) || files.some((f) => f.startsWith(p + "/")),
    readdir: (dir) => [...new Set(files.filter((f) => f.startsWith(dir + "/")).map((f) => f.slice(dir.length + 1).split("/")[0]))],
  };
}

function resolve(files, env = {}, arch = "x64") {
  return resolveChromium({ expected: PINNED, env: { PATH: "/usr/local/bin:/usr/bin", ...env }, platform: "linux", arch, ...layout(files) });
}

{
  const r = resolve([PINNED, "/usr/bin/chromium"]);
  assert.equal(r.source, "playwright");
  assert.equal(r.executablePath, PINNED);
  assert.match(r.reason, /pinned/);
}

{
  const r = resolve(["/usr/bin/chromium"]);
  assert.equal(r.source, "system");
  assert.equal(r.executablePath, "/usr/bin/chromium");
  assert.match(r.reason, /PATH/);
  assert.match(r.reason, /chromium_headless_shell-1228/);
}

{
  const r = resolve(["/usr/bin/google-chrome"], { PATH: "/opt/nothing" });
  assert.equal(r.source, "system");
  assert.equal(r.executablePath, "/usr/bin/google-chrome");
}

{
  const cached = "/cache/chromium-1200/chrome-linux64/chrome";
  const r = resolve([cached, "/usr/bin/chromium"], { PLAYWRIGHT_BROWSERS_PATH: "/cache" });
  assert.equal(r.source, "cache");
  assert.equal(r.executablePath, cached);
}

{
  const r = resolve([PINNED, "/opt/my/chrome"], { IMPOWER_DRIVER_CHROMIUM: "/opt/my/chrome" });
  assert.equal(r.source, "explicit");
  assert.equal(r.executablePath, "/opt/my/chrome");
  assert.throws(() => resolve([PINNED], { IMPOWER_DRIVER_CHROMIUM: "/opt/missing" }), /IMPOWER_DRIVER_CHROMIUM.*\/opt\/missing/);
}

{
  const FULL = "/home/agent/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome";
  assert.equal(pinnedExecutable(FULL, { headless: true, platform: "linux" }), PINNED);
  assert.equal(pinnedExecutable(FULL, { headless: false, platform: "linux" }), FULL);
  assert.equal(
    pinnedExecutable("C:\\cache\\chromium-1228\\chrome-win64\\chrome.exe", { headless: true, platform: "win32" }),
    "C:\\cache\\chromium_headless_shell-1228\\chrome-headless-shell-win64\\chrome-headless-shell.exe",
  );
  assert.equal(pinnedExecutable("/opt/odd/chrome", { headless: true, platform: "linux" }), "/opt/odd/chrome");
  const r = resolveChromium({ expected: PINNED, full: FULL, env: { PATH: "/usr/bin" }, platform: "linux", ...layout([FULL, "/usr/bin/chromium"]) });
  assert.equal(r.source, "pinned-full");
  assert.equal(r.executablePath, FULL);
  assert.match(r.reason, /chromium_headless_shell-1228/);
  assert.equal(resolveChromium({ expected: PINNED, full: FULL, env: { PATH: "/usr/bin" }, platform: "linux", ...layout(["/usr/bin/chromium"]) }).source, "system");
  assert.throws(() => resolveChromium({ expected: PINNED, full: FULL, env: {}, platform: "linux", ...layout([]) }), (e) => e.message.includes(FULL) && e.message.includes(PINNED));
}

{
  const shell = "/cache/chromium_headless_shell-1200/chrome-headless-shell-linux64/chrome-headless-shell";
  const r = resolve([shell], { PLAYWRIGHT_BROWSERS_PATH: "/cache", PATH: "" });
  assert.equal(r.source, "cache");
  assert.equal(r.executablePath, shell);
  const arm = "/cache/chromium_headless_shell-1200/chrome-linux/headless_shell";
  assert.equal(resolve([arm], { PLAYWRIGHT_BROWSERS_PATH: "/cache", PATH: "" }, "arm64").executablePath, arm);
  const armFull = "/cache/chromium-1300/chrome-linux/chrome";
  assert.equal(resolve([armFull, arm, "/usr/bin/chromium"], { PLAYWRIGHT_BROWSERS_PATH: "/cache" }).executablePath, "/usr/bin/chromium");
  assert.equal(resolve([armFull, "/usr/bin/chromium"], { PLAYWRIGHT_BROWSERS_PATH: "/cache" }, "arm64").executablePath, armFull);
  assert.equal(
    pinnedExecutable("/cache/chromium-1228/chrome-linux/chrome", { headless: true, platform: "linux" }),
    "/cache/chromium_headless_shell-1228/chrome-linux/headless_shell",
  );
  const mac = "/cache/chromium-1300/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
  const linux = "/cache/chromium-1200/chrome-linux64/chrome";
  assert.equal(resolve([mac, linux, "/usr/bin/chromium"], { PLAYWRIGHT_BROWSERS_PATH: "/cache" }).executablePath, linux);
  assert.equal(resolve([mac, "/usr/bin/chromium"], { PLAYWRIGHT_BROWSERS_PATH: "/cache" }).executablePath, "/usr/bin/chromium");
  const older = "/cache/chromium-1100/chrome-linux64/chrome";
  assert.equal(resolve([older, shell], { PLAYWRIGHT_BROWSERS_PATH: "/cache" }).executablePath, shell);
}

{
  const driverSource = fs.readFileSync(new URL("./driver.mjs", import.meta.url), "utf8");
  for (const command of ["measure", "timing"]) {
    const call = driverSource.match(new RegExp(`await ${command}\\(rest, \\{([^}]*)\\}`));
    assert.ok(call, `driver passes dependencies to ${command}`);
    assert.match(call[1], /\bchromiumChoiceLine\b/, `${command} gets chromiumChoiceLine`);
  }
  const logs = [];
  const launched = await privateLaunch(
    {
      importPlaywright: async () => ({ chromium: { launchPersistentContext: async (_dir, options) => options } }),
      resolveChromiumExecutablePath: () => "/usr/bin/chromium",
      chromiumChoiceLine: () => "/usr/bin/chromium (system)",
      log: (line) => logs.push(line),
    },
    "/profile",
  )({ headless: true });
  assert.equal(launched.executablePath, "/usr/bin/chromium");
  assert.deepEqual(logs, ["browser: /usr/bin/chromium (system)"]);
}

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

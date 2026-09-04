#!/usr/bin/env node
// Agent driver for the Impower live editor + game preview.
//
// Why this exists: CLAUDE.md makes "LOOK at the rendered pixels" a hard gate on
// calling any change done, and `npm run web:dev` picks RANDOM free ports every
// launch — so there is no fixed URL an agent can hardcode. This driver owns the
// whole loop: boot the two dev servers, remember the port it got, drive the
// editor with Playwright, and drop screenshots on disk.
//
// Playwright is a declared root devDependency. Browsers come from the local
// ms-playwright cache; `npx playwright install chromium` if it is empty.
//
// This file must live inside the repo tree regardless: Node resolves
// `playwright` from the SCRIPT's directory, not from cwd, so a copy of this
// script in a temp dir will not find it.
//
//   node .claude/skills/resolve-issue/driver.mjs up
//   node .claude/skills/resolve-issue/driver.mjs status
//   node .claude/skills/resolve-issue/driver.mjs verify --sd repro.sd --shot out.png
//   node .claude/skills/resolve-issue/driver.mjs down
//
// State (editor URL + launcher pid) lives in .claude/skills/resolve-issue/.state.json,
// which is gitignored — every command after `up` reads the URL from there.

import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SKILL_DIR, "..", "..", "..");
const STATE_FILE = path.join(SKILL_DIR, ".state.json");
// Persistent Chromium profile. OPFS is scoped per ORIGIN *and* per profile, so
// reusing one profile plus the pinned port (see pickPorts) means a script you
// loaded stays loaded across driver invocations and across down/up.
const PROFILE_DIR = path.join(SKILL_DIR, ".chrome-profile");

const log = (...a) => console.log(...a);
const die = (msg) => {
  console.error("ERROR: " + msg);
  process.exit(1);
};

function readState() {
  if (!fs.existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function requireUrl() {
  const s = readState();
  if (!s?.url) {
    die("no editor URL — run `node .claude/skills/resolve-issue/driver.mjs up` first");
  }
  return s.url;
}

// The sandbox pre-installs a Chromium build under PLAYWRIGHT_BROWSERS_PATH
// independently of whatever `playwright` version this repo's package.json
// pins. When those two drift apart, `chromium.executablePath()` points at a
// revision that was never downloaded (npm install skips the download — see
// CLAUDE.md — so it never will be) and every launch fails with "Executable
// doesn't exist". Fall back to whatever Chromium build the cache actually
// has rather than the exact revision Playwright asked for.
function resolveChromiumExecutablePath(chromium) {
  const expected = chromium.executablePath();
  if (expected && fs.existsSync(expected)) return undefined;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base || !fs.existsSync(base)) return undefined;
  const dirs = fs
    .readdirSync(base)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.match(/\d+/)[0]) - Number(a.match(/\d+/)[0]));
  const relPaths = [
    "chrome-linux/chrome",
    "chrome-linux64/chrome",
    "chrome-win/chrome.exe",
    "chrome-win64/chrome.exe",
    "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
  ];
  for (const dir of dirs) {
    for (const rel of relPaths) {
      const p = path.join(base, dir, ...rel.split("/"));
      if (fs.existsSync(p)) return p;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------- servers ---

// Is this TCP port free on loopback right now?
function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "127.0.0.1");
  });
}

// Pick a stable base port from the worktree path.
//
// OPFS is scoped per ORIGIN, so the random ports `npm run web:dev` picks would
// discard the loaded project on every launch. Hashing the worktree path keeps
// this checkout on one origin while staying clear of the other worktrees
// running on the same machine.
async function pickPorts() {
  let h = 0;
  for (const ch of REPO_ROOT) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const base = 38000 + (h % 800) * 4; // 4-port stride: editor, player, hmr, spare
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

// Boot `npm run web:dev` detached, on ports WE chose.
//
// Detached matters: the agent runs each command as a separate short-lived
// process, so the servers must outlive `up`.
//
// Do NOT try to scrape the launcher's "✓ Live preview ready → URL" line: a
// detached child on Windows does not flush its stdio into an inherited file
// handle, so the log stays 0 bytes forever while the servers run perfectly.
// Since the port is pinned, readiness is just an HTTP poll.
async function up(args) {
  const existing = readState();
  if (existing?.url && (await isUp(existing.url))) {
    log(`already up → ${existing.url}`);
    return;
  }

  const mode = args.includes("--cross-origin") ? "cross-origin" : "same-origin";
  const ports = await pickPorts();
  const url = `http://localhost:${ports.editor}`;

  const child = spawn(
    "npm",
    ["run", mode === "cross-origin" ? "web:dev:cross-origin" : "web:dev"],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        EDITOR_PORT: String(ports.editor),
        PLAYER_PORT: String(ports.player),
        HMR_PORT: String(ports.hmr),
      },
      stdio: "ignore",
      shell: true, // npm is npm.cmd on Windows; Node 23 refuses to spawn .cmd directly
      windowsHide: true,
      detached: true,
    },
  );
  child.unref();

  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify({ url, pid: child.pid, mode, ports }, null, 2),
  );

  log(`launching dev servers (${mode}) pid ${child.pid} → ${url}`);
  log("COLD build takes 4-8 min (esbuild builds every worker bundle). Waiting...");

  const deadline = Date.now() + 15 * 60_000;
  while (Date.now() < deadline) {
    if (await isUp(url)) {
      log(`READY ${url}   (mode: ${mode})`);
      return;
    }
    await sleep(3000);
  }
  die(`timed out after 15 min waiting for ${url}`);
}

async function isUp(url) {
  try {
    await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(3000) });
    return true;
  } catch {
    return false;
  }
}

async function status() {
  const s = readState();
  if (!s) return log("down (no state file)");
  const alive = await isUp(s.url);
  log(`${alive ? "UP" : "DOWN"}  url=${s.url}  pid=${s.pid}  mode=${s.mode}`);
  if (!alive) process.exitCode = 1;
}

// The launcher spawns npm -> node grandchildren. Killing the launcher pid alone
// orphans the two vite servers and they keep holding their ports. taskkill /T
// tears down the whole tree.
function down() {
  const s = readState();
  if (s?.pid == null) {
    log("nothing to stop");
    return;
  }
  const killer =
    process.platform === "win32"
      ? spawn("taskkill", ["/pid", String(s.pid), "/T", "/F"], {
          stdio: "inherit",
        })
      : spawn("kill", ["-TERM", String(-s.pid)], { stdio: "inherit" });
  killer.on("exit", () => {
    try {
      fs.unlinkSync(STATE_FILE);
    } catch {
      /* already gone */
    }
    log("stopped");
  });
}

// Check the things that fail LATE and expensively if they are wrong:
// a near-full C: silently corrupts a fresh worktree's node_modules, a missing
// Playwright browser only surfaces after the 5-minute dev-server build, and a
// logged-out gh only surfaces when you try to open the PR at the very end.
async function preflight() {
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

  try {
    const { chromium } = await import("playwright");
    const executablePath = resolveChromiumExecutablePath(chromium);
    const b = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    await b.close();
    say(true, "playwright chromium", executablePath ? `launches (fallback build: ${executablePath})` : "launches");
  } catch (e) {
    say(false, "playwright chromium", String(e.message).split("\n")[0]);
  }

  say(await cmdOk("gh", ["auth", "status"]), "gh auth", "needed to read the issue and open the PR");
  say(await cmdOk("git", ["rev-parse", "--git-dir"]), "git repo", REPO_ROOT);

  process.exitCode = ok ? 0 : 1;
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

// ---------------------------------------------------------------- browser ---

async function withEditor(fn, { headless = true } = {}) {
  const url = requireUrl();
  const { chromium } = await import("playwright");
  const executablePath = resolveChromiumExecutablePath(chromium);
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless,
    viewport: { width: 1600, height: 1000 },
    args: ["--autoplay-policy=no-user-gesture-required"],
    ...(executablePath ? { executablePath } : {}),
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const consoleLines = [];
  page.on("console", (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => consoleLines.push(`[pageerror] ${e.message}`));
  try {
    return await fn({ page, ctx, url, consoleLines });
  } finally {
    await ctx.close();
  }
}

// Write a .sd source into the editor project's OPFS and reload so the editor
// re-reads it. The default project id is "local" and its entry script is
// "main.sd" (WorkspaceConstants.LOCAL_PROJECT_ID / WorkspaceStore).
async function writeMainSd(page, source) {
  return page.evaluate(async (src) => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle("local", { create: true });
    const fh = await dir.getFileHandle("main.sd", { create: true });
    const w = await fh.createWritable();
    await w.write(src);
    await w.close();
    return src.length;
  }, source);
}

// The editor is a plain Preact app hydrated into #root — there is no
// <spark-editor> custom element to wait for. The CodeMirror instance stashes
// its EditorView on the .cm-content node as `.cmTile.view`.
async function waitForEditor(page, timeout = 90_000) {
  await page.waitForSelector(".cm-content", { timeout });
  await page.waitForFunction(
    () => document.querySelector(".cm-content")?.cmTile?.view != null,
    null,
    { timeout },
  );
}

// Scrub the game preview to a source line.
//
// Two things will silently defeat you here:
//   1. Scrubbing ONLY works while the preview is STOPPED. Once you press PLAY
//      the engine is time-driven and ignores the cursor entirely — the scrub
//      appears to do nothing.
//   2. The editor RESTORES the previous session's cursor position asynchronously
//      after load, so a scrub issued too early gets clobbered a second later and
//      the preview settles on the OLD line. Hence the dispatch/re-read/
//      re-dispatch loop below.
async function scrubToLine(page, line, attempts = 4) {
  // Verification hook. The dispatch-based scrub usually works, which makes the
  // trusted-click fallback below it hard to credit — a passing run cannot tell
  // you which of the two moved the preview. Setting
  // RESOLVE_ISSUE_NO_DISPATCH_SCRUB=1 turns this function into a no-op, so the
  // click is the only thing left that can move it. Nothing in normal use sets
  // the variable; it exists so a session changing the fallback can prove the
  // fallback still works.
  if (process.env["RESOLVE_ISSUE_NO_DISPATCH_SCRUB"]) {
    return { line, dispatchDisabled: true };
  }

  const dispatch = (n) =>
    page.evaluate((target) => {
      const view = document.querySelector(".cm-content")?.cmTile?.view;
      if (!view) throw new Error("no CodeMirror view");
      const total = view.state.doc.lines;
      const clamped = Math.min(Math.max(1, target), total);
      view.focus();
      view.dispatch({ selection: { anchor: view.state.doc.line(clamped).from } });
      return { line: clamped, totalLines: total };
    }, n);

  const currentLine = () =>
    page.evaluate(() => {
      const view = document.querySelector(".cm-content")?.cmTile?.view;
      if (!view) return null;
      return view.state.doc.lineAt(view.state.selection.main.head).number;
    });

  // The restore can fire LATE — well after a single 1.2s check passes — so one
  // confirmation is not enough. Require the cursor to hold the target across
  // consecutive checks; that outlasts the restore instead of racing it.
  let info = await dispatch(line);
  let holds = 0;
  for (let i = 0; i < attempts * 3; i++) {
    await page.waitForTimeout(1200);
    const at = await currentLine();
    if (at === info.line) {
      if (++holds >= 3) return { ...info, settledAfter: i + 1 };
    } else {
      holds = 0;
      info = await dispatch(line); // restore clobbered us — go again
    }
  }
  return { ...info, warning: `cursor kept drifting; wanted line ${info.line}` };
}

// Scrub with a REAL mouse click.
//
// `view.dispatch({selection})` moves the caret without a user event behind it,
// and the editor can fail to forward that move to the player: the cursor sits
// on the requested line while the route indicator stays on the old beat, for as
// long as you care to wait, with nothing raised. Re-dispatching cannot escape
// that — a retry built on dispatch fails exactly the way the first attempt did.
// A trusted click goes through the selection path a real user drives, so it
// moves the preview where no amount of dispatching will.
//
// Three details this depends on:
//   - Scrolling is done by moving `scrollDOM.scrollTop` rather than by
//     dispatching a transaction with `scrollIntoView`. A fallback that leans on
//     dispatch to get into position is a fallback that fails whenever dispatch
//     is what is broken, and it also makes the click impossible to credit: the
//     scroll transaction would move the preview by itself.
//   - `coordsAtPos` only answers for lines CodeMirror has actually rendered,
//     and its answer is stale until the scroll has landed and the view has
//     re-measured — hence the scroll, the wait, and a separate re-read.
//   - The click lands a few characters INTO the line rather than at its very
//     start, so it still changes the selection when a previous dispatch already
//     parked the caret at the start; a selection that does not change produces
//     no event for the editor to forward.
async function clickLine(page, line) {
  const scrolled = await page.evaluate((target) => {
    const view = document.querySelector(".cm-content")?.cmTile?.view;
    if (!view) return { ok: false, reason: "no CodeMirror view" };
    const total = view.state.doc.lines;
    const clamped = Math.min(Math.max(1, target), total);
    const block = view.lineBlockAt(view.state.doc.line(clamped).from);
    const scroller = view.scrollDOM;
    // `block.top` is in the document's own coordinate space and `documentTop`
    // is where that space currently sits on screen, so their sum is the line's
    // screen position. Centre it in the scroller.
    const screenY = view.documentTop + block.top;
    const wantY = scroller.getBoundingClientRect().top + scroller.clientHeight / 2;
    scroller.scrollTop += screenY - wantY;
    return { ok: true, line: clamped, totalLines: total };
  }, line);
  if (!scrolled.ok) return { clicked: false, reason: scrolled.reason };

  await page.waitForTimeout(600); // let the scroll land and the view re-measure

  const spot = await page.evaluate((target) => {
    const view = document.querySelector(".cm-content")?.cmTile?.view;
    if (!view) return { ok: false, reason: "no CodeMirror view" };
    const l = view.state.doc.line(target);
    const co = view.coordsAtPos(l.from + Math.min(6, l.length));
    if (!co) return { ok: false, reason: `line ${target} is not rendered` };
    const x = Math.round(co.left + 1);
    const y = Math.round((co.top + co.bottom) / 2);
    // Clicking a toolbar or some overlay instead of the text would leave the
    // preview exactly where it was, so check what is under the point rather
    // than assuming the coordinates are reachable.
    const hit = document.elementFromPoint(x, y);
    if (!hit || !hit.closest(".cm-content")) {
      return {
        ok: false,
        reason: `point (${x}, ${y}) is covered by ${hit ? hit.tagName.toLowerCase() : "nothing"}`,
      };
    }
    return { ok: true, x, y };
  }, scrolled.line);
  if (!spot.ok) return { clicked: false, line: scrolled.line, reason: spot.reason };

  await page.mouse.click(spot.x, spot.y);

  const cursorLine = await page.evaluate(() => {
    const view = document.querySelector(".cm-content")?.cmTile?.view;
    if (!view) return null;
    return view.state.doc.lineAt(view.state.selection.main.head).number;
  });
  return { clicked: true, line: scrolled.line, x: spot.x, y: spot.y, cursorLine };
}

// Wait for the game to actually MOUNT inside the player iframe.
//
// `readyState === "complete"` is NOT enough: right after a server restart the
// iframe loads but the `#game` scaffold never appears, and the Game Preview pane
// sits BLANK WHITE while every other signal looks healthy. A reload of the
// editor page reliably kicks it into mounting, so try that once before giving
// up rather than reporting a confidently-wrong empty screenshot.
async function waitForGame(page, { timeout = 45_000 } = {}) {
  const mounted = async () =>
    page.evaluate(() => {
      const s = window.__preview?.summary();
      return !!s && s.sameOrigin && s.gameChildren != null;
    });

  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await mounted()) return { mounted: true, reloaded: false };
    await page.waitForTimeout(1000);
  }

  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitForEditor(page);
  const deadline2 = Date.now() + timeout;
  while (Date.now() < deadline2) {
    if (await mounted()) return { mounted: true, reloaded: true };
    await page.waitForTimeout(1000);
  }
  return { mounted: false, reloaded: true };
}

async function previewSummary(page) {
  return page.evaluate(() => {
    const p = window.__preview;
    if (!p) return { installed: false };
    return { installed: true, ...p.summary() };
  });
}

// What the game is actually SHOWING, as readable text.
//
// TWO traps here, both of which produce useless output if you do the obvious
// thing:
//   1. `textContent` picks up the player's injected <style> blocks, so every
//      ancestor's text is a wall of CSS.
//   2. The typewriter effect wraps EVERY CHARACTER in its own <span>, so
//      "leaf elements with text" gives you one letter per entry.
// `innerText` solves both: it is layout-aware (display:none <style> is
// excluded) and it flattens the per-character spans back into words.
async function previewText(page) {
  return page.evaluate(() => {
    const p = window.__preview;
    const el = p?.$("#game-ui") ?? p?.game();
    return el?.innerText?.trim() ?? null;
  });
}

// The route indicator ("main : 1 → main : 8") lives in the PLAYER's toolbar,
// INSIDE the iframe — it is not in the editor document, so searching the editor
// DOM for it finds nothing. Read it via __preview.
async function routeLabel(page) {
  return page.evaluate(() => {
    const p = window.__preview;
    return p?.$("#toolbar")?.innerText?.trim().replace(/\s+/g, " ") ?? null;
  });
}

// The beat the preview actually landed on. In "main : 1 → main : 8" that is 8;
// with no arrow ("main : 1") it is 1. This number is the SOURCE LINE the engine
// settled on, so it can be compared directly against the line we scrubbed to.
function routeBeat(label) {
  if (!label) return null;
  const nums = [...label.matchAll(/main\s*:\s*(\d+)/g)].map((m) => Number(m[1]));
  return nums.length ? nums[nums.length - 1] : null;
}

// Wait for the game DOM to stop changing. A scrub round-trips editor -> player
// worker -> simulateRoute -> checkpoint -> re-render, and the typewriter effect
// then reveals text character by character — so the DOM keeps mutating for
// seconds after the cursor moves. Polling the rendered text until it stops
// changing is the only reliable "it has settled" signal; a fixed sleep either
// truncates mid-typewriter or wastes time.
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

async function verify(args) {
  const sdPath = flag(args, "--sd");
  const shot = flag(args, "--shot");
  const line = flag(args, "--line");
  const probePath = flag(args, "--probe");
  const headless = !args.includes("--headed");

  return withEditor(
    async ({ page, url, consoleLines }) => {
      const result = { url };

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await waitForEditor(page);

      if (sdPath) {
        const src = fs.readFileSync(path.resolve(sdPath), "utf8");
        result.wroteChars = await writeMainSd(page, src);
        // Reload so loadInitialFiles re-reads OPFS, then let the LSP + player
        // finish their first compile.
        await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
        await waitForEditor(page);
      }

      await page
        .waitForFunction(() => window.__preview?.summary().sameOrigin === true, null, {
          timeout: 60_000,
        })
        .catch(() => {
          result.previewWarning =
            "window.__preview never reported sameOrigin — is this a cross-origin run?";
        });

      const mount = await waitForGame(page);
      result.gameMounted = mount.mounted;
      if (mount.reloaded) result.neededReload = true;
      if (!mount.mounted) {
        result.error =
          "the game never mounted (#game absent) — the Game Preview is blank. " +
          "Screenshot is NOT valid evidence. Try `down` then `up`.";
      }

      // Let the FIRST compile finish before touching the cursor. On a cold
      // origin the player worker is not listening for `didSelect` yet, so an
      // early scrub is silently dropped and the preview stays on beat 1-2.
      let settle = await waitForPreviewSettle(page);

      if (line) {
        const target = Number(line);
        result.scrub = await scrubToLine(page, target);
        settle = await waitForPreviewSettle(page);
        result.route = await routeLabel(page);

        // Confirm the preview really moved. If the selection event was dropped,
        // re-arm it by bouncing the cursor to line 1 and back — a repeat
        // dispatch at the SAME position produces no `selectionSet`, so bouncing
        // is required, not optional.
        for (let i = 0; i < 3 && routeBeat(result.route) !== target; i++) {
          await scrubToLine(page, 1);
          await page.waitForTimeout(600);
          await scrubToLine(page, target);
          settle = await waitForPreviewSettle(page);
          result.route = await routeLabel(page);
          result.scrubRetries = i + 1;
        }

        // Every retry above is another `dispatch`, so when dispatch is not
        // reaching the preview at all they fail identically and the run reports
        // a warning where a scrub was still available. One trusted click drives
        // the selection path a real user drives, which recovers those runs.
        if (routeBeat(result.route) !== target) {
          result.scrubClick = await clickLine(page, target);
          settle = await waitForPreviewSettle(page);
          result.route = await routeLabel(page);
        }

        // Beat equality is a rough test, not a verdict. The engine pauses on the
        // beat AFTER the content it played — scrubbing to a dialogue line 20 in
        // a 63-line script settles on beat 22, and only a line with nothing
        // after it settles on its own number. So this warning fires on healthy
        // mid-script scrubs too, and `visible` is what tells the two apart.
        if (routeBeat(result.route) !== target) {
          result.scrubWarning =
            `preview settled on beat ${routeBeat(result.route)}, not line ${target}` +
            (result.scrubClick?.clicked
              ? ` even after a trusted click put the cursor on line ${result.scrubClick.cursorLine}`
              : ``) +
            ` — read \`visible\` before calling this a failed scrub. The engine pauses ` +
            `on the beat after the one it played, so a nearby beat number is normal; ` +
            `a genuinely failed scrub shows text from a different part of the script. ` +
            `Failing that, the line may not be a playable beat (blank line / ` +
            `character name / heading).`;
        }
      } else {
        result.route = await routeLabel(page);
      }

      result.settled = settle.settled;
      result.preview = await previewSummary(page);
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
        await page.screenshot({ path: out, fullPage: false });
        result.screenshot = out;
      }

      result.consoleErrors = consoleLines
        .filter((l) => l.startsWith("[error]") || l.startsWith("[pageerror]"))
        .slice(0, 25);

      console.log(JSON.stringify(result, null, 2));
      return result;
    },
    { headless },
  );
}

// ------------------------------------------------------------------ utils ---

function flag(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const [cmd, ...rest] = process.argv.slice(2);
switch (cmd) {
  case "preflight":
    await preflight();
    break;
  case "up":
    await up(rest);
    break;
  case "down":
    down();
    break;
  case "status":
    await status();
    break;
  case "verify":
    await verify(rest);
    break;
  default:
    log(
      [
        "usage: node .claude/skills/resolve-issue/driver.mjs <command>",
        "",
        "  preflight             check disk headroom, playwright, gh auth BEFORE doing work",
        "  up [--cross-origin]   boot both dev servers, wait for ready, record the URL",
        "  status                is it up? prints the editor URL",
        "  down                  kill the server tree",
        "  verify [options]      drive the editor and print a JSON report",
        "",
        "verify options:",
        "  --sd <file.sd>   load this script into OPFS /local/main.sd, then reload",
        "  --line <N>       scrub the preview to source line N (STOPPED state only)",
        "  --shot <out.png> screenshot the editor page",
        "  --probe <file.js> body of an async fn evaluated in the editor page; result -> JSON",
        "  --headed         run a visible browser instead of headless",
      ].join("\n"),
    );
}

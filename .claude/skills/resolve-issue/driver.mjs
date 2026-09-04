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

// Scrub the game preview to a source line, by clicking that line.
//
// The click is a real one, driven through Playwright's mouse. A programmatic
// `view.dispatch({selection})` moves the caret without a user event behind it,
// and the editor does not reliably forward that move to the player: the cursor
// sits on the requested line while the route indicator stays on the old beat,
// for as long as you care to wait, with nothing raised. Measured across this
// harness it never moved the preview, so nothing here dispatches a selection.
//
// Three details this depends on:
//   - Scrolling moves `scrollDOM.scrollTop` directly instead of dispatching a
//     transaction with `scrollIntoView`, so the whole path stays free of the
//     mechanism above.
//   - `coordsAtPos` only answers for lines CodeMirror has actually rendered,
//     and its answer is stale until the scroll has landed and the view has
//     re-measured — hence the scroll, the wait, and a separate re-read.
//   - The click lands a few characters INTO the line rather than at its very
//     start, so it still changes the selection when the caret is already parked
//     at the start; a selection that does not change produces no event for the
//     editor to forward.
//
// Two things will silently defeat a scrub however it is driven:
//   1. Scrubbing ONLY works while the preview is STOPPED. Once you press PLAY
//      the engine is time-driven and ignores the cursor entirely.
//   2. The editor RESTORES the previous session's cursor position asynchronously
//      after load, so the caller must let the first compile settle before
//      scrubbing, or the restore lands afterwards and wins.
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
    const pos = l.from + Math.min(6, l.length);
    // A click that resolves to the position the caret already holds changes no
    // selection, and so produces no event for the editor to forward. An empty
    // line always hits this, since there is no character to aim past. Say so
    // rather than clicking and reporting a success that moved nothing.
    if (pos === view.state.selection.main.head) {
      return {
        ok: false,
        reason:
          `a click on line ${target} would land on the position the caret already ` +
          `holds, so it would change no selection` +
          (l.length === 0 ? ` (the line is empty)` : ``),
      };
    }
    const co = view.coordsAtPos(pos);
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

// Every line of the open document, as source text.
async function documentLines(page) {
  return page.evaluate(() => {
    const view = document.querySelector(".cm-content")?.cmTile?.view;
    if (!view) return null;
    const out = [];
    for (let i = 1; i <= view.state.doc.lines; i++) {
      out.push(view.state.doc.line(i).text);
    }
    return out;
  });
}

// Did the preview land on the line we asked for?
//
// The route number cannot answer this. It reports how far execution reached
// rather than the line requested, so it differs from the target on every line
// with anything after it, and a check built on it warns on healthy scrubs and
// teaches its reader to ignore it (#419 — this function is that fix).
//
// The rendered text can answer it, but only for lines it can attribute, so
// there are three outcomes rather than a boolean:
//
//   landed        the target line's own text is on screen
//   elsewhere     some other line's text is on screen and the target's is not.
//                 A real failed scrub, and it names what it found instead.
//   inconclusive  nothing attributable. Either the line does not render
//                 verbatim (interpolation, markup, a heading, a character name)
//                 or its text cannot be told apart from another line's.
//
// "inconclusive" is a real answer, not a soft failure. Collapsing it into
// either of the others is what makes a check like this dangerous: reported as
// success it hides failed scrubs, which is the one thing this harness exists to
// catch, and reported as failure it is the very noise #419 is about.
//
// A line is usable as evidence only when its trimmed text is at least three
// characters and is not contained in any other line's text. That second
// condition is what stops "Hello" being read as proof while the screen shows
// "Hello there", and it makes duplicated lines unusable in both directions
// instead of silently attributing to whichever came first.
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

  // Deliberately not precomputed for every line: on a long script that is a
  // quadratic scan of substring tests. Only the target and the handful of lines
  // actually present in `visible` are ever asked.
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
    if (!trimmed[i] || !visible.includes(trimmed[i])) continue; // cheap filter first
    if (attributable(i)) showing.push(i + 1);
  }
  if (showing.length > 0) {
    return {
      outcome: "elsewhere",
      showing,
      reason:
        `the game is showing line${showing.length > 1 ? "s" : ""} ` +
        `${showing.join(", ")}, not line ${target}`,
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

// The beat the preview paused on. In "main : 1 → main : 8" that is 8; with no
// arrow ("main : 1") it is 1.
//
// Do NOT read this as the line that was scrubbed to. The engine pauses on the
// beat AFTER the content it played, so it equals the requested line only when
// nothing follows that line: scrubbing to line 20 of a 63-line script settles
// on beat 22. Comparing it for equality is a rough smoke test that reports a
// mismatch on healthy mid-script scrubs; `previewText` is what says whether the
// preview is actually showing the requested line.
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
        result.scrub = await clickLine(page, target);
        // A line CodeMirror has not rendered yet can refuse the first attempt;
        // giving the view time to catch up and asking once more is cheap.
        if (!result.scrub.clicked) {
          await page.waitForTimeout(1500);
          result.scrub = await clickLine(page, target);
        }

        settle = await waitForPreviewSettle(page);
        result.route = await routeLabel(page);

        // There is deliberately no "did the preview move" field here. Every
        // `verify` reloads the page, so the preview always starts at the top and
        // the route labels are empty until the first selection arrives — a
        // before/after comparison is therefore true on every run, and a field
        // that is always true is one nobody reads.

        // Whether the scrub landed is decided from the rendered text, not from
        // the route number. See classifyScrub.
        result.scrubCheck = classifyScrub(
          await documentLines(page),
          target,
          settle.text,
        );

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
              ? `the scrub did not land: ${result.scrubCheck.reason}. The screenshot ` +
                `is not evidence about line ${target}.`
              : `Could not confirm the scrub landed: ${result.scrubCheck.reason}. ` +
                `This is not the same as a failure — read \`visible\` and judge it ` +
                `yourself.`) +
            clickNote +
            ` (The \`route\` number is not a check on this: it reports how far ` +
            `execution reached, not the line requested.)`;
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

// Only dispatch when run as a command. `classifyScrub` is a pure function with
// its own test beside this file, and importing it must not boot a browser.
const runAsCli =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

const [cmd, ...rest] = runAsCli ? process.argv.slice(2) : ["__imported__"];
switch (cmd) {
  case "__imported__":
    break;
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

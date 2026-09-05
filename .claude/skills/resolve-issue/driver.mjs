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
import { gitTopLevel, parseRedGreenArgs, runRedGreen, sameDir } from "./redgreen.mjs";

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
  await page.waitForSelector(".sparkdown-script-editor-root .cm-content", { timeout });
  await page.waitForFunction(
    () => document.querySelector(".sparkdown-script-editor-root .cm-content")?.cmTile?.view != null,
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
    const view = document.querySelector(".sparkdown-script-editor-root .cm-content")?.cmTile?.view;
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
    const view = document.querySelector(".sparkdown-script-editor-root .cm-content")?.cmTile?.view;
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
    if (!hit || !hit.closest(".sparkdown-script-editor-root .cm-content")) {
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
    const view = document.querySelector(".sparkdown-script-editor-root .cm-content")?.cmTile?.view;
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

  try {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  } catch (err) {
    return { mounted: false, reloaded: true, error: `the recovery reload did not complete (${String(err.message || err).split("\n")[0]})` };
  }
  const back = await ensureScriptEditor(page);
  if (!back.present) return { mounted: false, reloaded: true, error: back.reason, switched: back.switched };
  const deadline2 = Date.now() + timeout;
  while (Date.now() < deadline2) {
    if (await mounted()) return { mounted: true, reloaded: true, switched: back.switched };
    await page.waitForTimeout(1000);
  }
  return { mounted: false, reloaded: true, switched: back.switched };
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
    const view = document.querySelector(".sparkdown-script-editor-root .cm-content")?.cmTile?.view;
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

      // A navigation that never completes is a report, not a stack trace.
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
      } catch (err) {
        result.gameMounted = false;
        result.error = `the editor page did not load (${String(err.message || err).split("\n")[0]}). Check \`status\`; the machine may be saturated.`;
        console.log(JSON.stringify(result, null, 2));
        process.exitCode = 1;
        return result;
      }
      const shell = await ensureScriptEditor(page);
      if (shell.switched) result.switchedToLogic = true;
      if (!shell.present) {
        // No editor, no scrub, no evidence: say so in the report rather than
        // dying in a Playwright timeout with nothing printed.
        result.gameMounted = false;
        result.error = shell.reason;
        result.preview = await previewSummary(page).catch(() => null);
        console.log(JSON.stringify(result, null, 2));
        process.exitCode = 1;
        return result;
      }
      result.editorSettled = shell.settled;
      // Which editor is on screen: the main tab's, or the fullscreen scripts
      // view with another file open. --sd writes main.sd either way, so in
      // the second case the script on screen is not the one being scrubbed.
      result.editorView = await page.evaluate(() =>
        document.querySelector('[role="tab"][id$="-trigger-main"]') ? "main" : "scripts-view",
      );
      if (result.editorView === "scripts-view") {
        result.editorWarning = "the logic pane is showing its fullscreen scripts view (another file is open); --sd writes main.sd and the scrub reads the file on screen, so the two may differ. Close that file in the editor before trusting this run.";
      }
      // The preview pane remembers screenplay mode across runs, and in that
      // mode the game never mounts (window.__preview is installed by the game
      // preview alone). verify needs the game, so switch back, the way a user
      // does: the screenplay toolbar's "Preview Game" button.
      const gameObservable = await page
        .waitForFunction(() => window.__preview != null, null, { timeout: 5_000 })
        .then(() => true, () => false);
      if (!gameObservable) {
        const toGame = page.locator('[aria-label="Preview Game"]').first();
        const toolbarUp = await toGame.waitFor({ state: "visible", timeout: 5_000 }).then(() => true, () => false);
        if (toolbarUp) {
          await toGame.click();
          result.switchedToGamePreview = true;
          await waitForDomQuiet(page, { quiet: 600, timeout: 10_000 });
        }
      }

      if (sdPath) {
        const src = fs.readFileSync(path.resolve(sdPath), "utf8");
        result.wroteChars = await writeMainSd(page, src);
        // Reload so loadInitialFiles re-reads OPFS, then let the LSP + player
        // finish their first compile.
        try {
          await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
        } catch (err) {
          result.gameMounted = false;
          result.error = `the editor page did not reload after writing the script (${String(err.message || err).split("\n")[0]}). Check \`status\`; the machine may be saturated.`;
          console.log(JSON.stringify(result, null, 2));
          process.exitCode = 1;
          return result;
        }
        const again = await ensureScriptEditor(page);
        if (again.switched) result.switchedToLogic = true;
        if (!again.present) {
          result.gameMounted = false;
          result.error = again.reason;
          console.log(JSON.stringify(result, null, 2));
          process.exitCode = 1;
          return result;
        }
        result.editorSettled = again.settled;
        // The reload restores the view from storage; read it again rather
        // than trusting the pre-reload answer.
        result.editorView = await page.evaluate(() =>
          document.querySelector('[role="tab"][id$="-trigger-main"]') ? "main" : "scripts-view",
        );
        if (result.editorView === "scripts-view") {
          result.editorWarning = "the logic pane is showing its fullscreen scripts view (another file is open); --sd writes main.sd and the scrub reads the file on screen, so the two may differ. Close that file in the editor before trusting this run.";
        } else {
          delete result.editorWarning;
        }
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
      if (mount.switched) result.switchedToLogic = true;
      if (!mount.mounted) {
        // A game that never mounted is a failed run: the screenshot is not
        // evidence and the shell must not stay green. The retry's own reason
        // (the editor was on another screen after the reload) is added to the
        // generic text rather than replacing it.
        result.error =
          "the game never mounted (#game absent) — the Game Preview is blank. " +
          "Screenshot is NOT valid evidence. Try `down` then `up`." +
          (mount.error ? ` On the reload retry: ${mount.error}.` : "");
        process.exitCode = 1;
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

// ------------------------------------------------------- editor surfaces ---
//
// `verify` reaches the game preview. These reach the editor's own interface:
// the find and go-to-line panels inside the script editor, and the three main
// screens the bottom tabs switch between. A change to any of those is invisible
// to `verify`, and before this every session that touched one wrote its own
// Playwright script to satisfy the skill's completion gate (#423).
//
// Every action here is the one a user performs: the panels open on their own
// keyboard shortcut, text goes in as real keystrokes, screens switch by
// clicking the tab. Nothing dispatches into CodeMirror or pokes the workspace
// store, so what these observe is what a user would see.

// Panels the script editor owns. Each opens on a CodeMirror keymap binding and
// is identified by the class its Panel implementation sets on its root
// (customSearch.ts in sparkdown-document-views). The fields are contenteditable
// divs carrying a `name`, not <input>s.
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

// The main screens. Every tab in the editor is a Radix trigger whose id ends in
// `-trigger-<value>`, and the value is the workspace's own name for the pane
// (`logic`, `assets`, `share`) or, for the tab row inside a pane, its panel
// (`main`, `scripts`, ...). The tab's text is not usable as a name: it renders
// twice (an active and an inactive label), so its accessible name is
// "LogicLogic".
//
// Which screen is on display is read from the pane's content, not from the
// screen tab's selected state: on a fresh load the app highlights no screen tab
// at all (MainWindow.tsx pins the tab row to a non-matching value until the
// workspace reports ready), so the tab says "none" while the logic screen is
// plainly showing. Each pane mounts its own inner tab row and nothing else
// does, so that row is the marker; the logic pane's fullscreen scripts view
// (Logic.tsx, view "logic-editor") mounts no tab row but does mount a script
// editor, so that counts for logic too. The Router mounts one pane at a time.
const SCREENS = {
  logic: '[role="tab"][id$="-trigger-main"], .sparkdown-script-editor-root .cm-content',
  assets: '[role="tab"][id$="-trigger-files"]',
  share: '[role="tab"][id$="-trigger-game"]',
};
const tabSelector = (value) => `[role="tab"][id$="-trigger-${value}"]`;
const SHOT_TARGETS = { find: SURFACES.find.selector, goto: SURFACES.goto.selector, editor: ".sparkdown-script-editor-root .cm-editor", page: null };

/**
 * Playwright's key strings are case-sensitive for a single character: `Shift+g`
 * delivers `key: "g"` with `shiftKey: true`, which no keyboard produces (a
 * keyboard reports `G`), and CodeMirror resolves a letter binding from the
 * reported key, so the shifted variant of a binding never runs from that form
 * and the unshifted one runs instead. Measured in the live editor on
 * 2026-09-04 with playwright 1.61: `Control+Shift+G`, `Control+Shift+KeyG`,
 * and holding Control and Shift around `press("KeyG")` all deliver `key: "G"`;
 * only `Control+Shift+g` delivers `g`. So a lowercase letter under Shift is
 * rewritten to its uppercase form before it is pressed.
 *
 * A `+` key is written as a trailing `+` (`Control++`), the way Playwright
 * reads it; an empty combo is refused rather than pressed as nothing.
 */
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

/** Focus the CodeMirror view so editor-scoped keymap bindings receive keys. */
async function focusEditor(page) {
  await page.evaluate(() => document.querySelector(".sparkdown-script-editor-root .cm-content")?.cmTile?.view?.focus());
}

/** Resolve while the DOM has been still for `quiet` ms, or give up at `timeout`. */
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

/** The editor shell is up: its tab row exists. Does not need the script editor. */
async function waitForApp(page, timeout = 90_000) {
  await page.waitForSelector('[role="tab"]', { timeout });
}

/** The screen on display, read from pane content; null while no pane is mounted. */
async function activeScreen(page) {
  const mounted = await mountedScreens(page);
  return mounted.length === 1 ? mounted[0] : null;
}

/** Every main screen whose content is mounted; empty while no pane is. */
async function mountedScreens(page) {
  return page.evaluate(
    (screens) => Object.entries(screens).filter(([, selector]) => document.querySelector(selector)).map(([name]) => name),
    SCREENS,
  );
}

/**
 * The script editor is only on the logic screen, and the screen is remembered
 * by the persistent profile across runs. A command that needs the editor
 * cannot assume it is there; this says whether it is, and why not.
 */
async function scriptEditorPresent(page, timeout = 10_000) {
  // Fail fast when another screen is on display: the editor cannot appear
  // there, so waiting the full budget would only cost the session time (three
  // --type steps on the assets screen used to spend 30 s learning one thing).
  // On the logic screen the budget stays, because a cold editor's mount was
  // measured at up to ~4.6 s on the reference machine.
  const screenNow = await activeScreen(page);
  const budget = screenNow != null && screenNow !== "logic" ? 500 : timeout;
  try {
    await page.waitForFunction(() => document.querySelector(".sparkdown-script-editor-root .cm-content")?.cmTile?.view != null, null, { timeout: budget });
    return { present: true };
  } catch {
    const screen = await activeScreen(page);
    const panelTab = await page.evaluate(() =>
      [...document.querySelectorAll('[role="tab"][aria-selected="true"]')].map((t) => t.id.replace(/^.*-trigger-/, "")).find((v) => !["logic", "assets", "share"].includes(v)) ?? null,
    );
    const where = `active screen: ${screen ?? "none"}${panelTab ? `, tab: ${panelTab}` : ""}`;
    const advice =
      screen === "logic" && panelTab && panelTab !== "main"
        ? `put --screen main before this step`
        : screen === "logic"
          ? `the editor did not mount within ${budget / 1000}s; the machine may be saturated, re-run`
          : `put --screen logic before this step`;
    return { present: false, reason: `the script editor is not on screen (${where}); ${advice}` };
  }
}

/**
 * Is a script editor expected on the screen as it is now? Yes on the logic
 * pane's `main` tab and in its fullscreen scripts view (no tab row); no on the
 * `scripts` tab or on any other screen. Waits briefly for a pane to mount, so
 * a page still hydrating does not read as "nothing expected".
 */
async function editorExpectedHere(page) {
  await page
    .waitForFunction((screens) => Object.values(screens).some((sel) => document.querySelector(sel)), SCREENS, { timeout: 5_000 })
    .catch(() => {});
  if ((await activeScreen(page)) !== "logic") return false;
  return page.evaluate(() => {
    const main = document.querySelector('[role="tab"][id$="-trigger-main"]');
    return main == null || main.getAttribute("aria-selected") === "true";
  });
}

/**
 * For a step that captures or acts on whatever is on screen (a screenshot, a
 * key press, a probe): if an editor is expected here, it must be mounted and
 * settled first, or the step reports why not and the run fails. If none is
 * expected (another screen, the `scripts` tab), the step proceeds; it is not
 * the driver's place to guess what the session wanted to capture there.
 */
async function requireEditorIfExpected(page) {
  if (!(await editorExpectedHere(page))) return { required: false };
  const here = await scriptEditorPresent(page, 20_000);
  if (!here.present) {
    return { required: true, ok: false, reason: `the script editor is expected here and had not mounted within 20s (${here.reason}); this step would have captured a page still loading. Re-run; if it persists the machine is saturated` };
  }
  if (!(await settleEditor(page, 15_000))) {
    return { required: true, ok: false, reason: "the script editor kept being replaced for 15s and never settled; this step would have captured a view about to go away. Re-run; if it persists the machine is saturated" };
  }
  return { required: true, ok: true };
}

/**
 * Wait until the script editor is not only present but stable: the logic pane
 * mounts a CodeMirror view, and a moment later the document arrives and the
 * view can be replaced. A shortcut pressed into the first view goes nowhere,
 * and a cursor read from it is null. Stable means the same view object across
 * two checks and a quiet DOM in between.
 */
async function settleEditor(page, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  let last = null;
  let stableFor = 0;
  while (Date.now() < deadline) {
    const id = await page.evaluate(() => {
      const view = document.querySelector(".sparkdown-script-editor-root .cm-content")?.cmTile?.view;
      if (!view) return null;
      // Identity is tracked in a WeakMap on the window, not written onto the
      // view, so the editor is observed and not touched.
      const ids = (window.__driverViewIds ??= new WeakMap());
      if (!ids.has(view)) ids.set(view, Math.random().toString(36).slice(2));
      return `${ids.get(view)}:${view.state.doc.length}`;
    });
    if (id != null && id === last) {
      stableFor += 1;
      if (stableFor >= 2) return true;
    } else {
      stableFor = 0;
    }
    last = id;
    await waitForDomQuiet(page, { quiet: 500, timeout: 3_000 });
  }
  return false;
}

/**
 * For commands that always need the script editor (`verify`): bring the logic
 * screen back if a previous run left the profile elsewhere, then wait for the
 * editor as before.
 */
async function ensureScriptEditor(page) {
  await waitForApp(page);
  let switched = false;
  let first = await scriptEditorPresent(page, 10_000);
  if (!first.present) {
    // The editor lives on the logic screen's `main` tab (or its fullscreen
    // scripts view). Clicking the logic screen tab only changes the screen
    // (WorkspaceWindow.openPane sets the pane, not the panel), so a profile
    // left on the `scripts` tab needs the inner tab clicked as well. Both
    // clicks happen before the one long wait, so a `scripts` profile does not
    // pay a dead budget on the logic click. A tab already on display is not
    // clicked, so `switched` is only ever true for a click that changed
    // something; the screen is judged from its content, not its highlight.
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
    // One long wait for a cold mount, whether or not anything was clicked;
    // the pre-change code gave 90 s after its probe, this gives 45 s.
    first = await scriptEditorPresent(page, 45_000);
    // A click that changed the screen is reported whether or not the editor
    // then came up; the caller can say both things.
    switched = clickedLogic || clickedMain;
  }
  if (!first.present) return { present: false, switched, reason: first.reason };
  // The view can be replaced when the document arrives, on a cold load as
  // much as after a switch, so settle it on every path.
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

/** Open a panel on its own shortcut and wait for it to be on screen. */
async function openSurface(page, name) {
  const s = surfaceOf(name);
  if (await surfaceOpen(page, name)) return { surface: name, open: true, alreadyOpen: true };
  const editor = await scriptEditorPresent(page);
  if (!editor.present) return { surface: name, open: false, reason: editor.reason };
  // The view can still be replaced a moment after it appears; a shortcut sent
  // into the old view opens nothing. Cheap when the editor is already stable.
  if (!(await settleEditor(page, 15_000))) {
    return { surface: name, open: false, reason: "the script editor kept being replaced for 15s and never settled; the shortcut was not sent. Re-run; if it persists the machine is saturated" };
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
      reason: `${s.selector} did not appear within 10s of pressing ${key.combo} with the editor focused`,
    };
  }
  return { surface: name, open: true, pressed: key.combo };
}

/** Close a panel the way a user does: Escape from inside it. */
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

/** Which panel a field name belongs to. */
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

/**
 * What a field is showing: its rendered text (`innerText`, with the trailing
 * break a contenteditable leaves stripped). This is the browser's rendering,
 * not the panel's own reader (`readFieldText` in customSearch.ts); the two
 * agree on everything `typeInto` can type, and differ only on a non-breaking
 * space that arrives by paste or a restored query. Absent field → null.
 */
async function readField(page, field) {
  const loc = fieldLocator(page, field);
  if ((await loc.count()) === 0) return null;
  return loc.evaluate((el) => el.innerText.replace(/\n$/, ""));
}

/**
 * Put text into a panel field with real keystrokes: click it, select what is
 * there, type. A `\n` in the text is entered as the field's own line-break
 * shortcut (Control+Enter — plain Enter submits the panel), which is how a
 * user gets a multi-line find or replace. A read-back that differs from what
 * was typed is a `reason`, so it lands in `failed`.
 */
async function typeInto(page, field, text) {
  const name = surfaceForField(field);
  const opened = await openSurface(page, name);
  if (opened.reason) return { field, typed: false, reason: opened.reason };
  const loc = fieldLocator(page, field);
  if ((await loc.count()) === 0) {
    return { field, typed: false, reason: `the ${name} panel is open but has no "${field}" field (the replace field is absent while the editor is read-only)` };
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

/** The surfaces that own a button or toggle name, open ones first. */
async function openSurfacesOwning(page, kind, name) {
  const owners = Object.entries(SURFACES).filter(([, s]) => s[kind].includes(name));
  if (owners.length === 0) {
    throw new Error(`unknown ${kind === "buttons" ? "button" : "toggle"} "${name}" (know: ${Object.values(SURFACES).flatMap((s) => s[kind]).join(", ")})`);
  }
  const open = [];
  for (const [surface] of owners) if (await surfaceOpen(page, surface)) open.push(surface);
  return { owners: owners.map(([n]) => n), open };
}

/** Click a panel button by its `name`, on whichever owning panel is open. */
async function clickSurfaceButton(page, name) {
  const { owners, open } = await openSurfacesOwning(page, "buttons", name);
  if (open.length === 0) return { button: name, clicked: false, reason: `no panel with a "${name}" button is open (${owners.join(" or ")})` };
  const surface = open[0];
  await page.locator(`${SURFACES[surface].selector} button[name=${name}]`).first().click();
  await waitForDomQuiet(page, { quiet: 300, timeout: 4_000 });
  return { button: name, surface, clicked: true };
}

/** Flip one of the find panel's checkboxes (`case`, `re`, `word`) and report its state. */
async function toggleSurfaceOption(page, name) {
  const { owners, open } = await openSurfacesOwning(page, "toggles", name);
  if (open.length === 0) return { toggle: name, toggled: false, reason: `no panel with a "${name}" toggle is open (${owners.join(" or ")})` };
  const surface = open[0];
  const box = page.locator(`${SURFACES[surface].selector} input[name=${name}]`).first();
  const before = await box.isChecked();
  // The box is visually hidden behind its label; clicking the label is what a user does.
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

/**
 * Bring a screen to the front by clicking its tab. `name` is a main screen
 * (logic, assets, share) or any other tab value on the page, such as the
 * `main` / `scripts` row inside the logic pane. Success is the screen's own
 * content being mounted (for a main screen) or the tab reporting selected (for
 * an inner tab); the screen tab's own highlight is not trusted, see SCREENS.
 */
async function switchScreen(page, name) {
  const tab = page.locator(tabSelector(name)).first();
  try {
    await tab.waitFor({ state: "visible", timeout: 10_000 });
  } catch {
    const known = await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].map((t) => t.id.replace(/^.*-trigger-/, "")));
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
  // A switch that lands on the script editor (the logic screen, or its `main`
  // tab) mounts a view that can be replaced when the document arrives; a step
  // that runs before that lands in a view about to go away.
  // A point check right after the click is too early: the editor mounts up
  // to ~4.6 s after the pane does. Wait for it where the tab can bring it.
  // `--screen logic` lands on an editor only when the logic pane's own tab is
  // `main` (or the pane shows its fullscreen scripts view, which has no tab
  // row); on the `scripts` tab no editor can appear, so waiting would be dead.
  const mainTabSelectedOrAbsent = await page.evaluate(() => {
    const main = document.querySelector('[role="tab"][id$="-trigger-main"]');
    return main == null || main.getAttribute("aria-selected") === "true";
  });
  const landsOnEditor = name === "main" || (name === "logic" && mainTabSelectedOrAbsent);
  if (name === "logic" && !mainTabSelectedOrAbsent) {
    // The screen switched, but the pane's own tab is `scripts`: no editor
    // came up, and the step says so rather than reading as a full recovery.
    return { screen: name, active: true, settled, editorHere: false, note: "the logic pane's own tab is scripts, so no script editor is on screen; use --screen main to reach it" };
  }
  const editorHere = landsOnEditor
    ? (await scriptEditorPresent(page, 15_000)).present
    : await page.evaluate(() => document.querySelector(".sparkdown-script-editor-root .cm-content") != null);
  if (editorHere) {
    const editorSettled = await settleEditor(page);
    settled = editorSettled && settled;
    if (!editorSettled) {
      return { screen: name, active: true, settled, reason: `the ${name} tab is up but its script editor never settled within 30s; later steps may have hit a view that was being replaced` };
    }
  }
  return { screen: name, active: true, settled };
}

/** Everything a session might want to read back, in one object. */
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
  // Which script editor is on screen: the `main` tab's, or the logic pane's
  // fullscreen scripts view (another file open, no tab row). --sd writes
  // main.sd, which in the second case is not the file being shown.
  out.editorView = await page.evaluate(() => {
    if (!document.querySelector(".sparkdown-script-editor-root .cm-content")) return null;
    return document.querySelector('[role="tab"][id$="-trigger-main"]') ? "main" : "scripts-view";
  });

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
  out.cursorLine = await page.evaluate(() => {
    const view = document.querySelector(".sparkdown-script-editor-root .cm-content")?.cmTile?.view;
    return view ? view.state.doc.lineAt(view.state.selection.main.head).number : null;
  });
  return out;
}

/** Screenshot one surface: a panel, the script editor, or the whole page. */
async function shotOf(page, what, out) {
  if (!(what in SHOT_TARGETS)) throw new Error(`unknown --shot-of target "${what}" (know: ${Object.keys(SHOT_TARGETS).join(", ")})`);
  if (!out) throw new Error(`--shot-of ${what} needs an output path`);
  const target = path.resolve(out);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (SHOT_TARGETS[what] == null) {
    await page.screenshot({ path: target, fullPage: false });
  } else {
    const loc = page.locator(SHOT_TARGETS[what]).first();
    if (!(await loc.isVisible().catch(() => false))) {
      return { of: what, screenshot: null, reason: `${SHOT_TARGETS[what]} is not on screen` };
    }
    await loc.screenshot({ path: target });
  }
  return { of: what, screenshot: target };
}

/**
 * Parse `ui` arguments into steps, refusing anything malformed before a
 * browser is launched: a flag with no value, an unknown panel, field, button,
 * toggle, screen or shot target, or an empty field name. Pure; tested in
 * ui-steps.test.mjs.
 */
export function parseUiSteps(args) {
  const steps = [];
  // Any tab value is accepted here; the editor can grow a tab, and whether one
  // exists is decided at run time, where the failure lists the tabs present.
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
      case "--sd":
        steps.push({ sd: value() });
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
  return steps;
}

/**
 * `ui`: run the steps in the order given, then read every surface back. Each
 * step records its own outcome under `steps`; a step that fails, or throws,
 * records a `reason` and the run continues, so the report is never lost.
 */
async function ui(args) {
  const headless = !args.includes("--headed");
  let steps;
  try {
    steps = parseUiSteps(args);
  } catch (e) {
    die(e.message);
  }

  return withEditor(
    async ({ page, url, consoleLines }) => {
      const result = { url, steps: [] };
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
        await waitForApp(page);
      } catch (err) {
        result.failed = [`the editor page did not load (${String(err.message || err).split("\n")[0]}). Check \`status\`; the machine may be saturated.`];
        console.log(JSON.stringify(result, null, 2));
        process.exitCode = 1;
        return result;
      }
      result.startedOn = await activeScreen(page);
      // Settle the editor only when it is there to settle: the logic screen's
      // `scripts` tab has no script editor, and a step that needs one reports
      // that itself.
      // On the logic screen the editor is expected; give it the same 10 s the
      // panel steps do (a cold mount was measured at ~4.6 s), settle it, and
      // say so when it never came, so an absent `editorSettled` only ever
      // means "no editor on this screen".
      // The start only records what it finds. A step that needs a settled
      // editor (a screenshot, a key press, a probe, a panel) checks for one
      // itself at the moment it runs, so the failure lands on the step that
      // would otherwise have lied, and a run whose steps never needed the
      // editor is not failed for a slow mount it never depended on.
      if (result.startedOn === "logic") {
        const expected = await editorExpectedHere(page);
        if (expected) {
          const here = await scriptEditorPresent(page, 20_000);
          result.editorSettled = here.present ? await settleEditor(page) : false;
          if (!here.present) result.startNote = `the script editor had not mounted 20s after the page loaded; each later step that needs it waits again and reports for itself`;
        } else {
          result.startNote = "the run started on the logic screen's scripts tab, where there is no script editor; --screen main reaches it";
        }
      }

      for (const step of steps) {
        try {
          if (step.sd) {
            const src = fs.readFileSync(path.resolve(step.sd), "utf8");
            const wroteChars = await writeMainSd(page, src);
            await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
            await waitForApp(page);
            const out = { sd: step.sd, wroteChars };
            // No editor can appear on the `scripts` tab or another screen;
            // say so at once instead of waiting a minute for it.
            const expectedAfterReload = await editorExpectedHere(page);
            const editor = expectedAfterReload ? await scriptEditorPresent(page, 60_000) : await scriptEditorPresent(page, 1_000);
            if (editor.present) {
              // As verify does on its own path: let the view stop being
              // replaced, let the first compile settle, and let the editor's
              // asynchronous cursor restore land, before any step reads or
              // moves the cursor. The preview is observable only in
              // same-origin mode (window.__preview); elsewhere waiting on it
              // would burn the full timeout for nothing.
              out.editorSettled = await settleEditor(page);
              // window.__preview is installed by the game preview's own effect,
              // a moment after mount, and never in cross-origin mode or while
              // the preview is in screenplay mode; wait for it, then give up.
              const observable = await page
                .waitForFunction(() => window.__preview != null, null, { timeout: 15_000 })
                .then(() => true, () => false);
              if (observable) {
                out.previewSettled = (await waitForPreviewSettle(page)).settled;
              } else {
                out.previewSettled = null;
                out.previewNote = "the game preview is not observable (cross-origin mode, or the preview is showing the screenplay), so the first compile was not waited for";
              }
              if (!out.editorSettled) out.reason = "the script editor never settled within 30s after the reload; later steps may have hit a view that was being replaced";
              // --sd wrote main.sd; if the pane is showing another file in
              // its fullscreen scripts view, the editor on screen is not it.
              out.editorView = await page.evaluate(() => (document.querySelector('[role="tab"][id$="-trigger-main"]') ? "main" : "scripts-view"));
              if (out.editorView === "scripts-view") {
                const viewReason = "the logic pane is showing its fullscreen scripts view (another file is open); --sd wrote main.sd, which is not the file on screen. Close that file in the editor and re-run";
                out.reason = out.reason ? `${out.reason}; also ${viewReason}` : viewReason;
              }
            } else {
              out.reason = editor.reason;
            }
            await waitForDomQuiet(page, { quiet: 1500, timeout: 30_000 });
            result.steps.push(out);
          } else if (step.screen) {
            result.steps.push(await switchScreen(page, step.screen));
          } else if (step.open) {
            result.steps.push(await openSurface(page, step.open));
          } else if (step.close) {
            result.steps.push(await closeSurface(page, step.close));
          } else if (step.type) {
            result.steps.push(await typeInto(page, step.type, step.text));
          } else if (step.press) {
            const ready = await requireEditorIfExpected(page);
            if (ready.ok === false) {
              result.steps.push({ press: step.press, sent: null, reason: ready.reason });
              continue;
            }
            const n = await pressKey(page, step.press);
            await waitForDomQuiet(page, { quiet: 300, timeout: 4_000 });
            result.steps.push({ press: step.press, sent: n.combo, rewritten: n.rewritten });
          } else if (step.click) {
            result.steps.push(await clickSurfaceButton(page, step.click));
          } else if (step.toggle) {
            result.steps.push(await toggleSurfaceOption(page, step.toggle));
          } else if (step.shotOf) {
            const ready = await requireEditorIfExpected(page);
            if (ready.ok === false) {
              result.steps.push({ of: step.shotOf, screenshot: null, reason: ready.reason });
              continue;
            }
            result.steps.push(await shotOf(page, step.shotOf, step.out));
          } else if (step.probe) {
            const ready = await requireEditorIfExpected(page);
            if (ready.ok === false) {
              result.steps.push({ probe: step.probe, result: null, reason: ready.reason });
              continue;
            }
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
          result.steps.push({ ...step, reason: `step threw: ${String(err.message || err).split("\n")[0]}` });
        }
      }

      try {
        result.ui = await readSurfaces(page);
      } catch (err) {
        result.ui = null;
        result.readError = String(err.message || err).split("\n")[0];
      }
      result.failed = result.steps.filter((s) => s.reason).map((s) => s.reason);
      if (result.readError) result.failed.push(`read-back failed: ${result.readError}`);
      result.consoleErrors = consoleLines.filter((l) => l.startsWith("[error]") || l.startsWith("[pageerror]")).slice(0, 25);
      console.log(JSON.stringify(result, null, 2));
      // A step that could not do what it was asked is a failed run, whatever
      // else succeeded: `ui --sd x.sd --shot out.png && open out.png` must not
      // open a screenshot of the wrong document under a green shell.
      process.exitCode = result.failed.length > 0 ? 1 : 0;
      return result;
    },
    { headless },
  );
}

// ---------------------------------------------------------------- redgreen ---

// Paths in --files and the test command's cwd are the directory the session
// is standing in, which must be this driver's own worktree root: runRedGreen
// refuses a subdirectory (git resolves rev:path from the root), and this
// refuses another checkout, so the worktree's driver never edits main's tree.
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

// Helpers for a session that has to drive the editor beyond what `ui` and
// `verify` cover. Import them from a script INSIDE the repo tree (Node resolves
// playwright from the importing script's directory), e.g.
//   import { withEditor, writeMainSd, waitForEditor } from "../../.claude/skills/resolve-issue/driver.mjs";
export {
  withEditor,
  writeMainSd,
  waitForEditor,
  waitForApp,
  ensureScriptEditor,
  settleEditor,
  scriptEditorPresent,
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
};

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
  case "ui":
    await ui(rest);
    break;
  case "redgreen":
    await redgreenCli(rest);
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
        "  verify [options]      drive the game preview and print a JSON report",
        "  ui [steps]            drive the editor's own panels and screens; print a JSON report",
        "  redgreen [options]    prove a regression test fails on the base and passes on the fix",
        "",
        "verify options:",
        "  --sd <file.sd>   load this script into OPFS /local/main.sd, then reload",
        "  --line <N>       scrub the preview to source line N (STOPPED state only)",
        "  --shot <out.png> screenshot the editor page",
        "  --probe <file.js> body of an async fn evaluated in the editor page; result -> JSON",
        "  --headed         run a visible browser instead of headless",
        "",
        "ui steps (run in the order given, then every surface is read back):",
        "  --sd <file.sd>          load this script into OPFS /local/main.sd, then reload",
        "  --screen <name>         click a tab: logic | assets | share, or one inside a pane: main | scripts | files | urls | game | screenplay",
        "  --open <panel>          open a panel on its shortcut: find (Ctrl+F) | goto (Ctrl+G)",
        "  --close <panel>         close it with Escape",
        "  --type <field>=<text>   real keystrokes into search | replace | line; \\n = Ctrl+Enter",
        "  --press <combo>         a key combo, e.g. Control+Shift+G (a shifted letter is uppercased)",
        "  --click <button>        a panel button: next prev select replace replaceAll close submit",
        "  --toggle <option>       flip a find-panel checkbox: case | re | word",
        "  --shot <out.png>        screenshot the page",
        "  --shot-of <what> <png>  screenshot one surface: find | goto | editor | page",
        "  --probe <file.js>       body of an async fn evaluated in the page; result -> JSON",
        "  --headed                run a visible browser instead of headless",
        "",
        "redgreen options:",
        "  --test <command>        the test invocation, run twice from the repo root",
        "  --files <a> [<b>...]    the changed source files the test exercises",
        "  --base <rev>            where the pre-fix content comes from (default HEAD;",
        "                          pass origin/main once the fix is committed)",
      ].join("\n"),
    );
}

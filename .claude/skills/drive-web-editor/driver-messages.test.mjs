// Pins the mechanisms that replaced this skill's Gotchas bullets and
// Troubleshooting rows (#497). Each one exists because a sentence telling
// the next session to be careful is what had been failing, so each is
// checked here rather than described there. Run:
//   node .claude/skills/drive-web-editor/driver-messages.test.mjs
//
// Three kinds of assertion appear below. Where the code is reachable without
// a browser it is called (partitionConsole, loadedScript, classifyScrub,
// interruptedSeedError). Where it is not, the driver's source is read and
// the symptom and its advice are required to sit within one window of each
// other, which is what fails when someone shortens the message back to the
// symptom alone; the window is wide enough for a message split across
// concatenated lines and far narrower than the file.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EDITOR_NAVIGATION,
  KNOWN_CONSOLE_NOISE,
  classifyScrub,
  installHealth,
  interruptedSeedError,
  loadedScript,
  openEditorPage,
  partitionConsole,
  readProjectFile,
  reloadEditorPage,
} from "./driver.mjs";

const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url));
const DRIVER = path.join(SKILL_DIR, "driver.mjs");
const source = fs.readFileSync(DRIVER, "utf8");
// Newlines and their indentation collapse to one space, so a message written
// across several concatenated lines reads as the one sentence it prints as.
const flat = source.replace(/\s*\n\s*/g, " ");

let failures = 0;
function check(label, fn) {
  try {
    fn();
    console.log(`PASS: ${label}`);
  } catch (err) {
    failures++;
    console.log(`FAIL: ${label}`);
    console.log(`  ${String(err.message || err).split("\n").slice(0, 6).join("\n  ")}`);
  }
}

/** The symptom and the advice it must carry, within one message's reach of each other. */
function carriesAdvice(symptom, advice, window = 600) {
  const at = flat.indexOf(symptom);
  assert.notEqual(at, -1, `the message is gone from driver.mjs: ${symptom}`);
  const near = flat.slice(at, at + window);
  assert.ok(
    near.includes(advice),
    `the message no longer names what to do: expected ${JSON.stringify(advice)} within ${window} characters of ${JSON.stringify(symptom)}, got ${JSON.stringify(near.slice(0, 300))}`,
  );
}

// ------------------------------------------------------------ navigation ---

check("the editor's navigation options are the long ones a cold load needs", () => {
  assert.deepEqual(EDITOR_NAVIGATION, { waitUntil: "domcontentloaded", timeout: 120_000 });
  assert.equal(typeof openEditorPage, "function");
  assert.equal(typeof reloadEditorPage, "function");
});

check("openEditorPage and reloadEditorPage are the only navigators in the driver", () => {
  // Playwright's own default is 30 s and a cold editor load here takes
  // longer, so an inline `page.goto` dies against a healthy server. The two
  // helpers are exported for a script of its own; a navigation written
  // anywhere else in the file is the trap coming back.
  const code = source.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
  const navigations = [...code.matchAll(/page\.(goto|reload)\(/g)];
  assert.equal(navigations.length, 2, `expected exactly two navigation calls (the two helpers), found ${navigations.length}`);
  assert.match(source, /async function openEditorPage\(page, url\) \{\s*return page\.goto\(url, EDITOR_NAVIGATION\);/);
  assert.match(source, /async function reloadEditorPage\(page\) \{\s*return page\.reload\(EDITOR_NAVIGATION\);/);
});

check("a driver run from outside the repo tree says why playwright cannot be found", () => {
  carriesAdvice("playwright could not be resolved from", "run the driver at its committed path inside the repo tree");
  carriesAdvice("playwright could not be resolved from", "PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install");
});

// --------------------------------------------------------------- console ---

check("partitionConsole keeps the lines worth reading and counts the known noise", () => {
  const lines = [
    "[error] Unhandled method workspace/semanticTokens/refresh",
    "[error] Unhandled method workspace/diagnostic/refresh",
    "[error] Unhandled method workspace/foldingRange/refresh",
    "[error] Failed to load resource: the server responded with a status of 404 (Not Found)",
    "[error] Unhandled method workspace/semanticTokens/refresh",
    "[log] a log line is not an error",
    "[warning] neither is a warning",
    "[error] TypeError: cannot read properties of undefined",
    "[pageerror] ReferenceError: game is not defined",
  ];
  const { errors, noise } = partitionConsole(lines);
  assert.deepEqual(errors, [
    "[error] TypeError: cannot read properties of undefined",
    "[pageerror] ReferenceError: game is not defined",
  ]);
  assert.deepEqual(noise, {
    "semanticTokens/refresh": 2,
    "diagnostic/refresh": 1,
    "foldingRange/refresh": 1,
    "resource 404": 1,
  });
});

check("every known-noise entry reports a count even when it did not appear", () => {
  // A line that stops appearing has to read as zero rather than vanish, or
  // the partition quietly starts hiding a line that became a real error.
  const { errors, noise } = partitionConsole([]);
  assert.deepEqual(errors, []);
  assert.deepEqual(Object.keys(noise).sort(), KNOWN_CONSOLE_NOISE.map((n) => n.name).sort());
  for (const count of Object.values(noise)) assert.equal(count, 0);
});

check("partitionConsole caps what it returns without capping what it counts", () => {
  const many = Array.from({ length: 40 }, (_, i) => `[error] distinct failure ${i}`);
  const { errors } = partitionConsole(many.concat(Array(5).fill("[error] Unhandled method workspace/diagnostic/refresh")));
  assert.equal(errors.length, 25);
  assert.equal(partitionConsole(many, KNOWN_CONSOLE_NOISE, 3).errors.length, 3);
});

// ---------------------------------------------------------------- script ---

// A page stub that answers `evaluate(readProjectFile, ...)` the way the
// browser does: the function is rebuilt from its source, as page.evaluate
// ships it, so a reference to module scope would fail here.
function stubPage(files) {
  return {
    async evaluate(fn, arg) {
      assert.equal(fn, readProjectFile, "loadedScript must read storage through readProjectFile");
      const source = files[`${arg.project}/${arg.path}`];
      if (source === undefined) return null;
      return Buffer.from(source, "utf8").toString("base64");
    },
  };
}

const asyncChecks = [];
function checkAsync(label, fn) {
  asyncChecks.push(async () => {
    try {
      await fn();
      console.log(`PASS: ${label}`);
    } catch (err) {
      failures++;
      console.log(`FAIL: ${label}`);
      console.log(`  ${String(err.message || err).split("\n").slice(0, 6).join("\n  ")}`);
    }
  });
}

checkAsync("loadedScript names the script the run is about to drive, and whether this run wrote it", async () => {
  const text = "$:\n  A MOONLIT ROOFTOP\n\nALICE:\n  Hello from the driver.\n";
  const page = stubPage({ "local/main.sd": text });
  const wrote = await loadedScript(page, true);
  assert.equal(wrote.present, true);
  assert.equal(wrote.file, "main.sd");
  assert.equal(wrote.wroteThisRun, true);
  assert.equal(wrote.chars, text.length);
  assert.equal(wrote.firstLine, "$:");
  assert.match(wrote.sha, /^[0-9a-f]{12}$/);
  // The trap this replaces: a run without --sd drives whatever the last run
  // left in storage, and said nothing about it. The report now does.
  const reused = await loadedScript(page, false);
  assert.equal(reused.wroteThisRun, false);
  assert.equal(reused.sha, wrote.sha);
  // Two different scripts have to be told apart by the report alone.
  const other = await loadedScript(stubPage({ "local/main.sd": "BOB:\n  A different repro.\n" }), false);
  assert.notEqual(other.sha, wrote.sha);
  assert.equal(other.firstLine, "BOB:");
});

checkAsync("preflight tells a corrupt install from an absent one, and names the repair for the corrupt one", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "preflight-"));
  try {
    // No install at all is not a failure: a hooks-only or skills-only change
    // needs none, and the line says how to get one when the change does.
    const absent = await installHealth(root, async () => assert.fail("nothing should be run without node_modules"));
    assert.equal(absent.ok, true);
    assert.match(absent.detail, /not installed/);
    assert.match(absent.detail, /PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install/);

    fs.mkdirSync(path.join(root, "node_modules"));
    const healthy = await installHealth(root, async () => true);
    assert.deepEqual(healthy, { ok: true, detail: "esbuild and vitest both run" });

    // The trap: a full disk leaves an install that looks complete, and the
    // damage surfaces much later as a build error nobody connects to it.
    const asked = [];
    const corrupt = await installHealth(root, async (cmd, args) => {
      asked.push(`${cmd} ${args.join(" ")}`);
      return args[0] !== "vitest";
    });
    assert.deepEqual(asked, ["npx esbuild --version", "npx vitest --version"], "the binaries are executed, not measured");
    assert.equal(corrupt.ok, false);
    assert.match(corrupt.detail, /vitest cannot run/);
    assert.match(corrupt.detail, /npm cache clean --force/);
    assert.match(corrupt.detail, /delete every node_modules/);
    assert.match(corrupt.detail, /rather than piecemeal/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

checkAsync("loadedScript says so rather than throwing when there is no script or the read fails", async () => {
  const missing = await loadedScript(stubPage({}), false);
  assert.deepEqual(missing, { file: "main.sd", wroteThisRun: false, present: false });
  const broken = {
    async evaluate() {
      throw new Error("Execution context was destroyed\nat somewhere");
    },
  };
  const failed = await loadedScript(broken, true);
  assert.equal(failed.read, false);
  assert.equal(failed.reason, "Execution context was destroyed");
});

// -------------------------------------------------------------- messages ---

check("the readiness timeout names where the build error can be read", () => {
  carriesAdvice("timed out after ${READY_WAIT_MS / 60_000} min waiting for", "npm run web:dev");
  carriesAdvice("timed out after ${READY_WAIT_MS / 60_000} min waiting for", "never records");
});

check("the missing-record refusal names the hand-launch that renders the preview black", () => {
  carriesAdvice("no editor URL", "up` first");
  carriesAdvice("no editor URL", "fully black");
  carriesAdvice("no editor URL", "baked into each bundle at build time");
});

check("a seed refused because the editor remembers another project names how to forget it", () => {
  carriesAdvice("the seed does not write to; nothing was written", 'localStorage.removeItem("project")');
});

check("a panel that never opened names every reason it might not have", () => {
  carriesAdvice("did not appear within 10s of pressing", "--close");
  carriesAdvice("did not appear within 10s of pressing", "--screen logic --screen main");
  carriesAdvice("did not appear within 10s of pressing", "customSearch.ts");
});

check("a ui step whose game never mounted says what to do, as verify's twin does", () => {
  carriesAdvice("the game never mounted (#game absent) within", "then re-run");
  carriesAdvice("the game never mounted (#game absent) — the Game Preview is blank", "down");
});

check("a seed reason reported by verify adds the one thing the reason cannot know", () => {
  carriesAdvice("result.error = `${result.seed.reason}", "restarting the servers changes nothing");
});

check("the marked-project error names both ways out", () => {
  const message = interruptedSeedError();
  assert.match(message, /Re-run with --project to seed it again, or empty it with seed --clear\.$/);
});

check("an elsewhere scrub names the kind of line that is a playable beat", () => {
  const lines = ["$:", "  A MOONLIT ROOFTOP", "ALICE:", "  First beat here.", "  Second beat here."];
  const showingLineFour = classifyScrub(lines, 5, "First beat here.");
  assert.equal(showingLineFour.outcome, "elsewhere");
  assert.match(showingLineFour.reason, /the game is showing line 4, not line 5/);
  assert.match(showingLineFour.reason, /aim at an indented dialogue or action line/);
  assert.match(showingLineFour.reason, /a NAME: line, a heading and a blank line are not playable beats/);
});

for (const run of asyncChecks) await run();

console.log(failures === 0 ? "all checks passed" : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

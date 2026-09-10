// Pins this skill's mechanisms for preventing or reporting mistakes (#497).
// Run:
//   node .claude/skills/drive-web-editor/driver-messages.test.mjs
//
// Browser-independent mechanisms are called directly; console checks also
// invoke the registered event listener. Source checks require a symptom and
// its advice in the same extracted message, and fixtures exercise the scanner.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EDITOR_NAVIGATION,
  KNOWN_CONSOLE_NOISE,
  classifyScrub,
  consoleLine,
  installHealth,
  interruptedSeedError,
  loadedScript,
  openEditorPage,
  partitionConsole,
  readProjectFile,
  reloadEditorPage,
  withEditor,
} from "./driver.mjs";

const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url));
const DRIVER = path.join(SKILL_DIR, "driver.mjs");
const source = fs.readFileSync(DRIVER, "utf8");

// What the driver prints, read out of its source: every string and template
// literal, with a run of them joined by `+` read as the one message they
// concatenate to. Comments and code are not message text and are left out,
// which is what makes the search below answer the question it asks — a
// session hitting the error reads the message, never the source around it,
// so advice sitting in a comment beside the message is advice that is gone.
//
// The scan tracks the three literal kinds, comments, and regular expression
// literals, which it has to know about because one can hold a quote (`/["']/`)
// that would otherwise open a string and swallow the rest of the file.
function scanSource(src) {
  const literals = [];
  // The source with every comment blanked to spaces (newlines kept, so line
  // numbers and the shape of the code survive), for the checks that read code
  // rather than message text.
  const bare = src.split("");
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (bare[k] !== "\n") bare[k] = " ";
  };
  const skipComment = (start) => {
    let end = start + 2;
    if (src[start + 1] === "/") {
      while (end < src.length && src[end] !== "\n") end++;
    } else {
      while (end < src.length && !(src[end] === "*" && src[end + 1] === "/")) end++;
      end = Math.min(end + 2, src.length);
    }
    blank(start, end);
    return end;
  };
  // A `/` opens a regular expression where a value cannot stand: after an
  // operator, a comma, an opening bracket, or a keyword. After a value (a
  // name, a literal, a closing bracket) it is division.
  const opensRegex = (upto) => {
    const before = upto.replace(/\s+$/, "");
    if (before === "") return true;
    if (/(?:\+\+|--)$/.test(before)) return false;
    const last = before[before.length - 1];
    if ("=(,:[!&|?{};+-*%~^<>".includes(last)) return true;
    const keyword = /\b(return|typeof|instanceof|in|of|new|delete|void|case|do|else|yield|await)$/.exec(before);
    return keyword !== null && !/\.\s*$/.test(before.slice(0, keyword.index));
  };
  const regexAt = (i) => opensRegex(bare.slice(Math.max(0, i - 200), i).join(""));
  const skipRegex = (i) => {
    const opened = i;
    i++;
    let inClass = false;
    while (i < src.length) {
      if (src[i] === "\\") { i += 2; continue; }
      if (src[i] === "[") inClass = true;
      else if (src[i] === "]") inClass = false;
      else if (src[i] === "/" && !inClass) return i + 1;
      else if (src[i] === "\n") return opened + 1;
      i++;
    }
    return opened + 1;
  };
  const skipString = (i) => {
    const quote = src[i];
    i++;
    while (i < src.length) {
      if (src[i] === "\\") { i += 2; continue; }
      if (src[i] === quote) return i + 1;
      if (src[i] === "\n") return i; // an unterminated string; give up on it
      i++;
    }
    return i;
  };
  const skipTemplate = (i) => {
    const opened = i;
    i++; // the opening backtick
    while (i < src.length) {
      if (src[i] === "\\") { i += 2; continue; }
      if (src[i] === "`") return i + 1;
      if (src[i] === "$" && src[i + 1] === "{") {
        i += 2;
        let depth = 1;
        while (i < src.length && depth > 0) {
          const ch = src[i];
          if (ch === "/" && (src[i + 1] === "/" || src[i + 1] === "*")) { i = skipComment(i); continue; }
          if (ch === "/" && regexAt(i)) { i = skipRegex(i); continue; }
          if (ch === "\\") { i += 2; continue; }
          if (ch === '"' || ch === "'") { i = skipString(i); continue; }
          if (ch === "`") { i = skipTemplate(i); continue; }
          if (ch === "{") depth++;
          if (ch === "}") depth--;
          i++;
        }
        continue;
      }
      i++;
    }
    throw new Error(`Unterminated template literal in message check at offset ${opened}`);
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "/" && (src[i + 1] === "/" || src[i + 1] === "*")) {
      i = skipComment(i);
      continue;
    }
    if (c === '"' || c === "'") {
      const start = i;
      i = skipString(i);
      literals.push({ start, end: i, text: src.slice(start + 1, i - 1) });
      continue;
    }
    if (c === "`") {
      const start = i;
      i = skipTemplate(i);
      literals.push({ start, end: i, text: bare.slice(start + 1, i - 1).join("") });
      continue;
    }
    if (c === "/" && regexAt(i)) {
      i = skipRegex(i);
      continue;
    }
    i++;
  }
  const code = bare.join("");
  // Literals joined by nothing but `+` are one message; anything else between
  // them (a name, a call, a comma) ends the run, because what follows is a
  // different string than the one this message prints.
  const messages = [];
  let current = null;
  for (const lit of literals) {
    const gap = current ? code.slice(current.end, lit.start).trim() : null;
    if (current && gap === "+") {
      current.text += lit.text;
      current.end = lit.end;
      continue;
    }
    if (current) messages.push(current.text);
    current = { text: lit.text, end: lit.end };
  }
  if (current) messages.push(current.text);
  // Newlines and their indentation collapse to one space, so a message
  // written across several concatenated lines reads as the one sentence it
  // prints as.
  return { code, messages: messages.map((m) => m.replace(/\s*\n\s*/g, " ")) };
}

const { code: sourceCode, messages } = scanSource(source);

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

/** The symptom and the advice it must carry, inside one printed message. */
function carriesAdvice(symptom, advice, window = 600, texts = messages) {
  const holding = texts.filter((m) => m.includes(symptom));
  assert.notEqual(holding.length, 0, `the message is gone from driver.mjs: ${symptom}`);
  const windows = holding.map((m) => m.slice(m.indexOf(symptom), m.indexOf(symptom) + window));
  assert.ok(
    windows.some((near) => near.includes(advice)),
    `the message no longer names what to do: expected ${JSON.stringify(advice)} within ${window} characters of ${JSON.stringify(symptom)} in the same message, got ${JSON.stringify(windows[0].slice(0, 300))}`,
  );
}

// ---------------------------------------------------------------- reader ---

check("the message reader reads what the driver prints, and not the source around it", () => {
  const fixture = [
    'const a = () => die(`the panel did not open within 10s; --close it`);',
    '// --close it, or run --screen logic first',
    'const b = () => die(`the panel did not open within 10s`);',
    'const c = () => die("the wait ran out" + " and the log names why");',
    'const d = () => die("the port was taken"), advice = "pick another port";',
    'const e = /["\'`]/.test(x) ? die(`the name is quoted; strip the quotes`) : null;',
  ].join("\n");
  const read = scanSource(fixture);
  // A comment is not a message: the advice in one is advice the session that
  // hits the error never sees, which is the hole this reader closes.
  assert.ok(!read.messages.some((m) => m.includes("--screen logic")), "a comment was read as message text");
  assert.deepEqual(
    read.messages.filter((m) => m.startsWith("the panel")),
    ["the panel did not open within 10s; --close it", "the panel did not open within 10s"],
    "each message stands on its own",
  );
  // Literals joined by `+` are the one message they print as; two literals
  // with anything else between them are two.
  assert.ok(read.messages.includes("the wait ran out and the log names why"), "a message split across a `+` was not joined");
  assert.ok(read.messages.includes("the port was taken"), "a message ending at a `,` was joined to what followed");
  assert.ok(!read.messages.some((m) => m.includes("the port was taken") && m.includes("pick another port")), "two separate literals were read as one message");
  // A regular expression holding a quote or a backtick must not open a string
  // and swallow the rest of the file.
  assert.ok(read.messages.includes("the name is quoted; strip the quotes"), "a regex literal derailed the scan");

  const inComment = fixture.replace("within 10s; --close it", "within 10s");
  assert.throws(
    () => carriesAdvice("the panel did not open within 10s", "--close", 600, scanSource(inComment).messages),
    /no longer names what to do/,
    "advice moved out of the message and into the comment beside it has to fail this check",
  );
  carriesAdvice("the panel did not open within 10s", "--close", 600, read.messages);
});

// ------------------------------------------------------------ navigation ---

check("division inside an interpolation cannot merge a later message with unrelated advice", () => {
  for (const expression of ["count++ / total", "count-- / total", "object.of / total", "object.in / total", "value /*" + " long comment".repeat(25) + " */ / total"]) {
    const fixture = [
      'const label = `read ${' + expression + '} of the log`;',
      'die("the panel did not open within 10s");',
      'const advice = "--close it";',
    ].join("\n");
    const read = scanSource(fixture);
    assert.equal(read.messages.length, 3, expression);
    assert.throws(() => carriesAdvice("the panel did not open within 10s", "--close", 600, read.messages), /no longer names what to do/, expression);
  }
});

check("a template whose end the reader cannot find fails the check instead of becoming message text", () => {
  assert.throws(() => scanSource('const label = `unfinished ${value}'), /Unterminated template literal/);
});

check("comments inside template interpolations are neither navigation code nor printed advice", () => {
  const fixture = [
    'const a = `the panel did not open ${/* page.goto(url); --close */ true}`;',
    'const b = `another message ${// page.reload(); --screen logic',
    'true}`;',
    'const c = `a regular expression ${/[/*}]/.test(value)} keeps its remedy`;',
    'const d = `a slash expression ${/* a comment */ /[//}]/.test(value)} keeps its remedy`;',
  ].join("\n");
  const read = scanSource(fixture);
  assert.doesNotMatch(read.code, /page\.(goto|reload)\(/, "an interpolation comment was read as navigation code");
  assert.ok(!read.messages.some((m) => /--close|--screen logic/.test(m)), "an interpolation comment was read as printed advice");
  assert.ok(read.messages.some((m) => m.startsWith("a regular expression") && m.endsWith("keeps its remedy")), "a regex character class was read as a comment or interpolation boundary");
  assert.ok(read.messages.some((m) => m.startsWith("a slash expression") && m.endsWith("keeps its remedy")), "a regex after a comment was not kept intact");
});

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
  const navigations = [...sourceCode.matchAll(/page\.(goto|reload)\(/g)];
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
    "[error] Failed to load resource: the server responded with a status of 404 (Not Found) (http://localhost:38276/api/auth/account)",
    "[error] Unhandled method workspace/semanticTokens/refresh",
    "[log] a log line is not an error",
    "[warning] neither is a warning",
    "[error] TypeError: cannot read properties of undefined",
    "[pageerror] ReferenceError: game is not defined",
    // A 404 the change under test introduced: a wrong asset path, a route
    // that is not served. The noise entry names the one resource that is
    // always missing, so this one is left where it can be read.
    "[error] Failed to load resource: the server responded with a status of 404 (Not Found) (http://localhost:38276/local/assets/missing.png)",
    // A resource the app is refused rather than one that is absent.
    "[error] Failed to load resource: the server responded with a status of 403 (Forbidden) (http://localhost:38276/api/auth/account)",
  ];
  const { errors, noise } = partitionConsole(lines);
  assert.deepEqual(errors, [
    "[error] TypeError: cannot read properties of undefined",
    "[pageerror] ReferenceError: game is not defined",
    "[error] Failed to load resource: the server responded with a status of 404 (Not Found) (http://localhost:38276/local/assets/missing.png)",
    "[error] Failed to load resource: the server responded with a status of 403 (Forbidden) (http://localhost:38276/api/auth/account)",
  ]);
  assert.deepEqual(noise, {
    "semanticTokens/refresh": 2,
    "diagnostic/refresh": 1,
    "foldingRange/refresh": 1,
    "/api/auth/account 404": 1,
  });
});

check("a captured console line carries the resource a failed request names nowhere else", () => {
  // Chrome's text says the status and not the URL, which sits in the
  // message's location; without it every 404 reads the same and the noise
  // list cannot tell the one that is always there from a new one.
  const message = (type, text, url) => ({ type: () => type, text: () => text, location: () => ({ url }) });
  const failed = "Failed to load resource: the server responded with a status of 404 (Not Found)";
  assert.equal(
    consoleLine(message("error", failed, "http://localhost:1/api/auth/account")),
    `[error] ${failed} (http://localhost:1/api/auth/account)`,
  );
  // A message that already names its own location is not made to say it twice.
  assert.equal(consoleLine(message("error", "boom at http://localhost:1/x.js", "http://localhost:1/x.js")), "[error] boom at http://localhost:1/x.js");
  // Only errors carry a location worth reading; a log keeps the text it has.
  assert.equal(consoleLine(message("log", "a log line", "http://localhost:1/x.js")), "[log] a log line");
  assert.equal(consoleLine({ type: () => "error", text: () => "no location here" }), "[error] no location here");
});

{
  const handlers = new Map();
  const page = { on: (event, handler) => handlers.set(event, handler) };
  let closed = false;
  const ctx = { pages: () => [page], close: async () => { closed = true; } };
  const captured = await withEditor(({ consoleLines }) => {
    for (const resource of ["/api/auth/account", "/missing.png"]) {
      handlers.get("console")({
        type: () => "error",
        text: () => "Failed to load resource: the server responded with a status of 404 (Not Found)",
        location: () => ({ url: "http://localhost:1" + resource }),
      });
    }
    return partitionConsole(consoleLines);
  }, { state: () => ({ url: "http://localhost:1" }), launch: async () => ctx });
  check("the editor's console listener preserves resource locations before classifying errors", () => {
    assert.equal(captured.noise["/api/auth/account 404"], 1);
    assert.deepEqual(captured.errors, ["[error] Failed to load resource: the server responded with a status of 404 (Not Found) (http://localhost:1/missing.png)"]);
    assert.equal(closed, true);
  });
}

check("only a 404 for the account endpoint is known resource noise", () => {
  for (const [url, status, known] of [
    ["http://localhost:1/api/auth/account", 404, true],
    ["http://localhost:1/api/auth/account?format=json", 404, true],
    ["http://localhost:1/api/auth/account/settings", 404, false],
    ["http://localhost:1/api/auth/accountant", 404, false],
    ["http://localhost:1/local/api/auth/account", 404, false],
    ["http://localhost:1/other?next=/api/auth/account", 404, false],
    ["http://localhost:404/api/auth/account", 403, false],
  ]) {
    const line = consoleLine({ type: () => "error", text: () => `Failed to load resource: the server responded with a status of ${status} (${status === 404 ? "Not Found" : "Forbidden"})`, location: () => ({ url }) });
    const result = partitionConsole([line]);
    assert.equal(result.noise["/api/auth/account 404"], Number(known), url);
    assert.deepEqual(result.errors, known ? [] : [line], url);
  }
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
  carriesAdvice("${result.seed.reason}", "restarting the servers changes nothing");
  assert.match(sourceCode, /result\.error = `\$\{result\.seed\.reason\}/, "the sentence is appended to the seed's own reason, not printed on its own");
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

#!/usr/bin/env node
// Pins `measure`'s argument parsing and how it attributes a preview result to
// the key press that requested it (#647). Run:
//   node .agents/skills/drive-web-editor/measure.test.mjs
//
// The timing is only as good as the attribution: the preview answers
// highlights asynchronously, so a state reporting an earlier request as
// showing can arrive after the next key, and counting it would report the
// earlier suggestion's latency as this one's. A sample whose answer never
// arrives has to be reported as a failure, because dropping it would leave
// only the fast samples in the median.
//
// Pure functions, no browser. Node's built-in assert only.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as measureModule from "./measure.mjs";

// Read through the module, so a missing export fails its own check rather
// than the whole file's import.
const { analyzeBurst, attributeEditSample, attributePreviewSample, measure: measureCommand, parseMeasureArgs, runFailed, phaseName, replacedSpan, summarize, summarizeBurst } = measureModule;
const { STRUCTURAL_KEYS, STRUCTURAL_TEXT } = measureModule;
const attributeStructuralSample = (...args) => measureModule.attributeStructuralSample(...args);
const restoreSpan = (...args) => measureModule.restoreSpan(...args);

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

await check("a project run needs a line and a word, and takes the defaults otherwise", () => {
  assert.deepEqual(parseMeasureArgs(["--project", "rb", "--line", "3515", "--word", "concerned"]), {
    project: "rb",
    line: 3515,
    word: "concerned",
    samples: 10,
    warmup: 2,
    edit: false,
    timeout: 20000,
    settle: 1500,
    headed: false,
  });
  assert.throws(() => parseMeasureArgs(["--project", "rb", "--line", "3515"]), /--line and --word/);
  assert.throws(() => parseMeasureArgs(["--project", "rb", "--word", "x"]), /--line and --word/);
});

await check("the fixture run needs nothing else, and excludes --project", () => {
  const parsed = parseMeasureArgs(["--fixture", "--edit", "--samples", "12", "--warmup", "0", "--json", "out.json", "--headed"]);
  assert.equal(parsed.fixture, true);
  assert.equal(parsed.edit, true);
  assert.equal(parsed.samples, 12);
  assert.equal(parsed.warmup, 0);
  assert.equal(parsed.json, "out.json");
  assert.equal(parsed.headed, true);
  assert.equal(parsed.line, undefined);
  assert.throws(() => parseMeasureArgs(["--fixture", "--project", "rb", "--line", "1", "--word", "x"]), /exclusive/);
  assert.throws(() => parseMeasureArgs([]), /--project .* or --fixture/);
});

await check("a flag with a missing, empty or flag-shaped value is refused, not skipped", () => {
  assert.throws(() => parseMeasureArgs(["--project"]), /--project needs a value/);
  assert.throws(() => parseMeasureArgs(["--project", "", "--line", "1", "--word", "x"]), /--project needs a value/);
  assert.throws(() => parseMeasureArgs(["--project", "--fixture"]), /--project needs a value/);
  assert.throws(() => parseMeasureArgs(["--fixture", "--samples", "0"]), /--samples must be an integer of at least 1/);
  assert.throws(() => parseMeasureArgs(["--fixture", "--line", "2.5"]), /--line must be an integer/);
  assert.throws(() => parseMeasureArgs(["--fixture", "--sample", "3"]), /unknown measure argument --sample/);
});

// The measured line: main.sd line 3515, which the protocol numbers 3514.
const TARGET = { uri: "file:///main.sd", line: 3514 };
const preview = (events) => attributePreviewSample(events, TARGET);
const key = (t, k = "ArrowDown") => ({ t, kind: "key", key: k });
const request = (t, n, edit = "raffles_shy") => ({ t, kind: "request", request: n, state: "focus", edit });
const state = (t, n, status, extra = {}) => ({ t, kind: "state", completion: n == null ? null : { request: n, status }, position: { uri: "file:///main.sd", line: 3514 }, programVersion: 7, ...extra });
const measure = (start, dur, name) => ({ t: start + dur, kind: "measure", name, start, dur });

await check("the result is the state whose completion.request is the key's own request", () => {
  const sample = preview([
    key(100),
    request(104, 42),
    state(110, 42, "preparing"),
    state(700, 42, "showing"),
    measure(120, 300, "player workspace previewCompile file:///local/main.sd"),
    measure(430, 50, "game/updateProgram"),
    measure(800, 90, "game/updateProgram"),
    { t: 500, kind: "longtask", start: 500, dur: 180.4 },
  ]);
  assert.equal(sample.failure, undefined);
  assert.equal(sample.request, 42);
  assert.equal(sample.status, "showing");
  assert.equal(sample.ms, 600);
  assert.equal(sample.keyToRequest, 4);
  assert.equal(sample.edit, "raffles_shy");
  // Only the measures that started between the key and the answer count.
  assert.deepEqual(sample.phases, { "player workspace previewCompile": 300, "game/updateProgram": 50 });
  assert.deepEqual(sample.longtasks, [180]);
});

await check("a late answer to an earlier request is never counted for this key", () => {
  const sample = preview([state(90, 41, "showing"), key(100), request(104, 42), state(150, 41, "showing"), state(900, 42, "showing")]);
  assert.equal(sample.request, 42);
  assert.equal(sample.ms, 800);
  const unanswered = preview([key(100), request(104, 42), state(150, 41, "showing")]);
  assert.match(unanswered.failure, /no preview\/didChangeGameState answered request 42/);
  assert.equal(unanswered.ms, undefined);
});

await check("a sample without a request, or answered unavailable, is a failure with its reason", () => {
  assert.match(preview([key(100)]).failure, /produced no textDocument\/previewCompletion/);
  assert.match(preview([request(90, 3)]).failure, /no ArrowDown keydown/);
  // A close notification is not the key's request.
  assert.match(preview([key(100), { t: 101, kind: "request", request: 5, state: "close" }]).failure, /produced no textDocument/);
  const unavailable = preview([key(100), request(101, 5), state(300, 5, "unavailable")]);
  assert.equal(unavailable.status, "unavailable");
  assert.match(unavailable.failure, /reported request 5 unavailable/);
});

await check("an accepted edit is timed from its compile's start to the first newer program painted", () => {
  const sample = attributeEditSample(
    [
      key(100, "Enter"),
      state(150, null, null, { programVersion: 7 }),
      measure(320, 400, "player workspace compile file:///local/main.sd"),
      state(900, null, null, { programVersion: 8, position: null }),
      state(1000, null, null, { programVersion: 8 }),
    ],
    7,
    TARGET,
  );
  assert.equal(sample.failure, undefined);
  assert.equal(sample.programVersion, 8);
  assert.equal(sample.ms, 680);
  assert.equal(sample.msFromKey, 900);
  assert.equal(sample.debounce, 220);
  assert.equal(sample.msFromKey - sample.debounce, sample.ms);
  assert.deepEqual(sample.phases, { "player workspace compile": 400 });
  assert.match(attributeEditSample([key(100, "Enter"), state(1000, null, null, { programVersion: 8 })], 7, TARGET).failure, /no workspace compile/);
  assert.match(attributeEditSample([key(100, "Enter"), measure(320, 400, "player workspace compile x"), state(1000, null, null, { programVersion: 7 })], 7, TARGET).failure, /newer than version 7/);
});

await check("each sample says how its display went, and the summary counts the paths (#657)", () => {
  const beat = preview([key(100), request(104, 42), measure(300, 0, "player displayPreview path beat"), state(700, 42, "showing")]);
  assert.deepEqual(beat.paths, ["beat"]);
  // The path's own measure is not a phase.
  assert.deepEqual(beat.phases, {});
  const full = preview([key(100), request(104, 43), measure(300, 0, "player displayPreview path full swap"), state(700, 43, "showing")]);
  assert.deepEqual(full.paths, ["full swap"]);
  const edit = attributeEditSample(
    [key(100, "Enter"), measure(320, 40, "player workspace compile x"), measure(500, 0, "player displayPreview path full checkpoint"), state(900, null, null, { programVersion: 8 })],
    7,
    TARGET,
  );
  assert.deepEqual(edit.paths, ["full checkpoint"]);
  assert.deepEqual(summarize([beat, beat, full, { ms: 5 }, { failure: "x", paths: ["beat"] }]).paths, { beat: 2, "full swap": 1, unrecorded: 1 });
});

await check("the summary counts failures and takes min, median and max over the rest", () => {
  const summary = summarize([{ ms: 300, phases: { a: 10 } }, { ms: 100, phases: { a: 30 } }, { failure: "x" }, { ms: 200, phases: {} }]);
  assert.equal(summary.samples, 4);
  assert.equal(summary.failures, 1);
  assert.deepEqual(summary.ms, { min: 100, median: 200, max: 300 });
  assert.deepEqual(summary.phases.a, { min: 0, median: 10, max: 30 });
  assert.equal(summarize([{ failure: "x" }]).ms, null);
});

await check("a mixed run summarizes each clock over the passing samples that carry it", () => {
  const edit = (at) =>
    attributeEditSample([key(100, "Enter"), measure(100 + at, 30, "player workspace compile x"), state(100 + at + 60, null, null, { programVersion: 8 })], 7, TARGET);
  const summary = summarize([edit(200), edit(250), edit(220), { failure: "x", ms: 1, msFromKey: 1, debounce: 1 }, { ms: 90, keyToRequest: 4 }]);
  assert.equal(summary.failures, 1);
  assert.deepEqual(summary.ms, { min: 60, median: 60, max: 90 });
  assert.deepEqual(summary.msFromKey, { min: 260, median: 280, max: 310 });
  assert.deepEqual(summary.debounce, { min: 200, median: 220, max: 250 });
  assert.deepEqual(summary.keyToRequest, { min: 4, median: 4, max: 4 });
  assert.equal("debounce" in summarize([{ ms: 90, keyToRequest: 4 }]), false);
});

await check("measure names lose their document URI, and a replaced word is found between its neighbours", () => {
  assert.equal(phaseName("player workspace previewCompile file:///local/main.sd"), "player workspace previewCompile");
  assert.equal(phaseName("game/preview"), "game/preview");
  const line = "      [[raffles_concerned:gloves]]";
  assert.deepEqual(replacedSpan(line, "concerned", "      [[raffles_shy:gloves]]"), { start: 16, text: "shy" });
  assert.deepEqual(replacedSpan(line, "concerned", "      [[raffles_:gloves]]"), { start: 16, text: "" });
  assert.equal(replacedSpan(line, "concerned", "      [[bunny_shy]]"), null);
});

await check("an answer or an edit painted on another line is a failure naming both lines", () => {
  const moved = preview([key(100), request(104, 42), state(700, 42, "showing", { position: { uri: "file:///main.sd", line: 0 } })]);
  assert.equal(moved.ms, undefined);
  assert.match(moved.failure, /request 42 was painted at file:\/\/\/main\.sd line 1, not file:\/\/\/main\.sd line 3515/);
  const otherFile = preview([key(100), request(104, 42), state(700, 42, "showing", { position: { uri: "file:///other.sd", line: 3514 } })]);
  assert.match(otherFile.failure, /painted at file:\/\/\/other\.sd line 3515/);
  const edit = attributeEditSample([key(100, "Enter"), measure(320, 400, "player workspace compile x"), state(1000, null, null, { programVersion: 8, position: { uri: "file:///main.sd", line: 12 } })], 7, TARGET);
  assert.equal(edit.ms, undefined);
  assert.match(edit.failure, /program 8 was painted at file:\/\/\/main\.sd line 13, not file:\/\/\/main\.sd line 3515/);
  assert.equal(summarize([moved, edit]).failures, 2);
});

// The command itself, against stand-in driver helpers: what a run that stops
// early reports, and that it leaves no scratch directory or profile behind.
const measureDirs = () => fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith("impower-measure-"));
async function runMeasure(args, overrides) {
  const logged = [];
  const launches = [];
  const deps = {
    withEditor: async (fn, options) => {
      launches.push(options);
      return fn({ page: {}, url: "http://localhost:1", consoleLines: ["[error] the player threw", "[log] fine"] });
    },
    openEditorPage: async () => {},
    reloadEditorPage: async () => {},
    waitForApp: async () => {},
    seedProject: async () => ({ files: 3 }),
    switchScreen: async () => {},
    scriptEditorPresent: async () => ({ present: true }),
    settleEditor: async () => {},
    waitForGame: async () => ({ mounted: true }),
    waitForProgram: async () => ({ loaded: true }),
    log: (text) => logged.push(text),
    die: (text) => {
      throw new Error(`die: ${text}`);
    },
    ...overrides,
  };
  const before = measureDirs();
  const exitCode = process.exitCode;
  try {
    const report = await measureCommand(args, deps);
    return { report, exitCode: process.exitCode, logged, launches, leftover: measureDirs().filter((d) => !before.includes(d)) };
  } finally {
    process.exitCode = exitCode;
  }
}

await check("a seed that fails stops the run nonzero, with the page's console errors and nothing left behind", async () => {
  const json = path.join(os.tmpdir(), `measure-test-${process.pid}.json`);
  try {
    const run = await runMeasure(["--project", "rb", "--line", "3515", "--word", "concerned", "--json", json], { seedProject: async () => ({ reason: "main.sd is missing" }) });
    assert.equal(run.report.error, "seed failed: main.sd is missing");
    assert.deepEqual(run.report.consoleErrors, ["[error] the player threw"]);
    assert.equal(run.exitCode, 1);
    assert.deepEqual(run.leftover, []);
    // The browser profile is the run's own, launched by the command.
    assert.equal(typeof run.launches[0].launch, "function");
    assert.equal(JSON.parse(fs.readFileSync(json, "utf8")).error, "seed failed: main.sd is missing");
    assert.equal(JSON.parse(run.logged[0]).summary.samples, 0);
  } finally {
    fs.rmSync(json, { force: true });
  }
});

await check("a game that never mounts, or a program that never loads, stops the run with that cause", async () => {
  const unmounted = await runMeasure(["--fixture"], { waitForGame: async () => ({ mounted: false, error: "the editor was on another screen" }) });
  assert.match(unmounted.report.error, /the game never mounted.*on the reload retry: the editor was on another screen/);
  assert.equal(unmounted.report.gameMounted, false);
  assert.equal(unmounted.exitCode, 1);
  assert.deepEqual(unmounted.leftover, [], "the generated fixture is removed too");
  const unloaded = await runMeasure(["--fixture"], { waitForProgram: async () => ({ loaded: false, errors: 2 }) });
  assert.match(unloaded.report.error, /loaded no program within 180 s; the open document has 2 error\(s\)/);
  assert.equal(unloaded.exitCode, 1);
});

await check("any failed sample fails the run, a warm-up one included, as do an error and an unrestored line", () => {
  const ok = { samples: [{ warmup: true, ms: 1 }, { ms: 2 }], restoredMatches: true };
  assert.equal(runFailed(ok), false);
  assert.equal(runFailed({ ...ok, samples: [{ warmup: true, failure: "painted elsewhere" }, { ms: 2 }] }), true);
  assert.equal(runFailed({ ...ok, samples: [{ warmup: true, ms: 1 }, { failure: "x" }] }), true);
  assert.equal(runFailed({ ...ok, error: "seed failed" }), true);
  assert.equal(runFailed({ ...ok, restoredMatches: false }), true);
});

// A stand-in editor page for one full preview-mode run: the document holds
// the measured line, and each ArrowDown yields that key's request and answer,
// painted where `paints` says, in the order the keys are pressed.
function scriptedPage(lineText, paints) {
  const uri = "file://local/main.sd";
  const text = [...Array(3514).fill(""), lineText].join("\n");
  let clock = 0;
  let pending = [];
  let pressed = 0;
  const page = {
    evaluate: async (fn, arg) => {
      const source = String(fn);
      if (arg?.method === "editor/read") return { textDocument: { uri, text } };
      if (arg?.method) return undefined;
      if (source.includes("PerformanceObserver")) return 1;
      if (source.includes("splice")) return pending.splice(0);
      if (source.includes("__measureState")) return 7;
      throw new Error(`unexpected evaluate: ${source.slice(0, 80)}`);
    },
    waitForTimeout: async () => {},
    waitForFunction: async () => {},
    keyboard: {
      type: async () => {},
      press: async (key) => {
        clock += 1000;
        if (key !== "ArrowDown") return;
        const request = ++pressed;
        const line = paints.shift() ?? 3514;
        pending.push({ t: clock, kind: "key", key }, { t: clock + 5, kind: "request", request, state: "focus" }, { t: clock + 400, kind: "state", completion: { request, status: "showing" }, position: { uri, line }, programVersion: 7 });
      },
    },
  };
  return page;
}

await check("the command fails a run whose warm-up sample was painted elsewhere, though the measured one passed", async () => {
  const line = "      [[raffles_concerned:gloves]]";
  const surface = { popupPresent: true, selected: "raffles_shy", options: ["raffles_shy"] };
  const page = scriptedPage(line, [0, 3514]);
  const run = await runMeasure(["--project", "rb", "--line", "3515", "--word", "concerned", "--warmup", "1", "--samples", "1", "--settle", "0"], {
    withEditor: async (fn) => fn({ page, url: "http://localhost:1", consoleLines: [] }),
    waitLanguageSurface: async () => surface,
    readLanguageSurface: async () => surface,
  });
  assert.equal(run.report.error, undefined, run.report.error);
  assert.equal(run.report.restoredMatches, true);
  assert.equal(run.report.samples.length, 2);
  assert.match(run.report.samples[0].failure, /painted at file:\/\/local\/main\.sd line 1/);
  assert.equal(run.report.samples[1].ms, 400);
  assert.equal(run.report.summary.failures, 0);
  assert.equal(run.report.summary.warmupFailures, 1);
  assert.equal(run.exitCode, 1);
  // The same run with both samples on the line passes.
  const clean = await runMeasure(["--project", "rb", "--line", "3515", "--word", "concerned", "--warmup", "1", "--samples", "1", "--settle", "0"], {
    withEditor: async (fn) => fn({ page: scriptedPage(line, [3514, 3514]), url: "http://localhost:1", consoleLines: [] }),
    waitLanguageSurface: async () => surface,
    readLanguageSurface: async () => surface,
  });
  assert.equal(clean.report.summary.warmupFailures, 0);
  assert.notEqual(clean.exitCode, 1);
});

await check("a burst needs a line but no word, and excludes --edit", () => {
  const parsed = parseMeasureArgs(["--project", "rb", "--line", "3516", "--burst", "--text", " ab"]);
  assert.equal(parsed.burst, true);
  assert.equal(parsed.text, " ab");
  assert.equal(parsed.word, undefined);
  assert.equal(parseMeasureArgs(["--fixture", "--burst"]).burst, true);
  assert.throws(() => parseMeasureArgs(["--project", "rb", "--burst"]), /--burst needs --line/);
  assert.throws(() => parseMeasureArgs(["--fixture", "--burst", "--edit"]), /exclusive/);
  assert.throws(() => parseMeasureArgs(["--fixture", "--text", "x"]), /--text needs --burst/);
});

await check("a structural run needs a line but no word, takes one line of text, and excludes --edit and --burst (#1672)", () => {
  const parsed = parseMeasureArgs(["--project", "rb", "--line", "3514", "--structural"]);
  assert.equal(parsed.structural, true);
  assert.equal(parsed.word, undefined);
  assert.equal(parsed.text, undefined, "the default text is applied by the run");
  assert.equal(STRUCTURAL_TEXT, "Just one more thing.");
  assert.equal(parseMeasureArgs(["--fixture", "--structural", "--text", "Wait."]).text, "Wait.");
  assert.equal(parseMeasureArgs(["--fixture", "--structural", "--screenshots", "shots"]).screenshots, "shots");
  assert.throws(() => parseMeasureArgs(["--project", "rb", "--structural"]), /--project --structural needs --line/);
  assert.throws(() => parseMeasureArgs(["--fixture", "--structural", "--text"]), /--text needs a value/);
  assert.throws(() => parseMeasureArgs(["--fixture", "--structural", "--text", "  "]), /--text is one line of text/);
  assert.throws(() => parseMeasureArgs(["--fixture", "--structural", "--text", "a\nb"]), /--text is one line of text/);
  assert.throws(() => parseMeasureArgs(["--fixture", "--structural", "--edit"]), /exclusive/);
  assert.throws(() => parseMeasureArgs(["--fixture", "--structural", "--burst"]), /exclusive/);
  assert.throws(() => parseMeasureArgs(["--fixture", "--screenshots", "shots"]), /--screenshots needs --structural/);
  assert.equal(parseMeasureArgs(["--fixture", "--structural", "--indent", "4"]).indent, 4);
  assert.throws(() => parseMeasureArgs(["--fixture", "--structural", "--indent", "-2"]), /--indent must be an integer of at least 0/);
  assert.throws(() => parseMeasureArgs(["--fixture", "--indent", "4"]), /--indent needs --structural/);
});

await check("a structural sample is timed from its compile to the first newer program painted at the caret's line", () => {
  // The insert has no keydown: the run records its own `insertText` mark.
  const insert = attributeStructuralSample(
    [
      { t: 100, ts: 100, kind: "key", key: "insertText" },
      measure(200, 40, "player workspace compile x"),
      measure(260, 0, "player displayPreview path full scenes"),
      state(300, null, null, { programVersion: 8, position: { uri: "file:///main.sd", line: 3515 } }),
    ],
    7,
    { uri: "file:///main.sd", line: 3515 },
    "insert",
  );
  assert.equal(insert.failure, undefined);
  assert.equal(insert.direction, "insert");
  assert.equal(insert.ms, 100);
  assert.equal(insert.msFromKey, 200);
  assert.equal(insert.debounce, 100);
  assert.deepEqual(insert.paths, ["full scenes"]);
  const remove = attributeStructuralSample([key(100, "Backspace"), measure(200, 40, "player workspace compile x"), state(300, null, null, { programVersion: 9 })], 8, TARGET, "remove");
  assert.equal(remove.direction, "remove");
  assert.equal(remove.ms, 100);
  // The line count moves with every sample, so a paint at the line the
  // other direction leaves is not this edit's.
  const stale = attributeStructuralSample([key(100, "Backspace"), measure(200, 40, "player workspace compile x"), state(300, null, null, { programVersion: 9, position: { uri: "file:///main.sd", line: 3515 } })], 8, TARGET, "remove");
  assert.match(stale.failure, /painted at file:\/\/\/main\.sd line 3516, not file:\/\/\/main\.sd line 3515/);
  assert.match(attributeStructuralSample([key(100, "Enter")], 7, TARGET, "insert").failure, /no insertText keydown/);
  assert.match(attributeStructuralSample([], 7, TARGET, "sideways").failure, /unknown structural direction sideways/);
  assert.deepEqual(STRUCTURAL_KEYS, { insert: "insertText", remove: "Backspace" });
});

await check("the restoring edit replaces whole lines, with a line break no input handler rewrites, as a protocol range", () => {
  assert.equal(restoreSpan("a\nb\n", "a\nb\n"), null);
  // An inserted line comes out again, with its break.
  assert.deepEqual(restoreSpan("a\n  b\n  x\n  c\n", "a\n  b\n  c\n"), { range: { start: { line: 2, character: 0 }, end: { line: 3, character: 0 } }, text: "" });
  // A removed line goes back in.
  assert.deepEqual(restoreSpan("a\nc\n", "a\nb\nc\n"), { range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } }, text: "b\n" });
  // A lost bracket is put back as its whole line and break, never as the
  // bracket alone, which the editor's close-brackets handler would double.
  assert.deepEqual(restoreSpan("x\n  [hero]]\n  y", "x\n  [[hero]]\n  y"), { range: { start: { line: 1, character: 0 }, end: { line: 2, character: 0 } }, text: "  [[hero]]\n" });
  // A change on the last line starts from the break before it.
  assert.deepEqual(restoreSpan("x\nsay hello", "x\nsay hi"), { range: { start: { line: 0, character: 1 }, end: { line: 1, character: 9 } }, text: "\nsay hi" });
  // With no line shared at either end, the whole document is replaced.
  assert.deepEqual(restoreSpan("say hello there", "say hi there"), { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 15 } }, text: "say hi there" });
  // Applying it gives the original back, whatever the two are.
  const apply = (text, { range, text: put }) => {
    const lines = text.split("\n");
    const offset = (p) => lines.slice(0, p.line).reduce((n, l) => n + l.length + 1, 0) + p.character;
    return text.slice(0, offset(range.start)) + put + text.slice(offset(range.end));
  };
  for (const [current, original] of [["", "x"], ["x", ""], ["aaa", "aa"], ["ab\nab", "ab"], ["l1\nl2\nNEW\nl3", "l1\nl2\nl3"], ["l1\nl2", "l1\nl2\nl3\n"], ["l1\nl2\nl3\n", "l1\nl2"], ["a\n[b]]\nc\n", "a\n[[b]]\nc\n"], ["\n\n", "\n"]]) {
    const span = restoreSpan(current, original);
    assert.equal(apply(current, span), original, JSON.stringify([current, original]));
    // Never a short insert an input handler would act on.
    assert.ok(span.text === "" || span.text.includes("\n") || span.text === original, JSON.stringify(span));
  }
});

// A stand-in editor for a structural run: a document the run's selections
// and keys really edit, and a preview that paints each edit's program at the
// caret's line, or where `paintAt` says for a given edit. `garble` makes the
// editor add text of its own to the given edit, as an auto-indent would, or,
// as a function, rewrite the document after it. Typed text passes a
// close-brackets handler shaped like the editor's (vscodeCloseBrackets): a
// typed opening bracket gains its closing one.
function structuralPage(lineText, { paintAt = {}, garble = {} } = {}) {
  const uri = "file://local/main.sd";
  let doc = [...Array(3513).fill("x"), lineText, "      (searching his face)", "end"].join("\n");
  const original = doc;
  let selection = { anchor: 0, head: 0 };
  let clock = 0;
  let version = 7;
  let edits = 0;
  let pending = [];
  const offset = (p) => doc.split("\n").slice(0, p.line).reduce((n, l) => n + l.length + 1, 0) + p.character;
  const lineOf = (at) => doc.slice(0, at).split("\n").length - 1;
  const edit = (text) => {
    edits++;
    const from = Math.min(selection.anchor, selection.head);
    const to = Math.max(selection.anchor, selection.head);
    const closing = { "[": "]", "(": ")", "{": "}", "[[": "]]" };
    const typed = text in closing ? text + closing[text] : text;
    const extra = typeof garble[edits] === "string" ? garble[edits] : "";
    const put = typed + extra;
    doc = doc.slice(0, from) + put + doc.slice(to);
    selection = { anchor: from + text.length + extra.length, head: from + text.length + extra.length };
    if (typeof garble[edits] === "function") doc = garble[edits](doc);
    version++;
    clock += 1000;
    pending.push(
      { t: clock + 100, kind: "measure", name: "player workspace compile file://local/main.sd", start: clock + 100, dur: 40 },
      { t: clock + 150, kind: "measure", name: "player displayPreview path beat", start: clock + 150, dur: 0 },
      { t: clock + 200, kind: "state", completion: null, position: { uri, line: paintAt[edits] ?? lineOf(selection.head) }, programVersion: version },
    );
  };
  const page = {
    evaluate: async (fn, arg) => {
      const source = String(fn);
      if (arg?.method === "editor/read") return { textDocument: { uri, text: doc } };
      if (arg?.method === "editor/select") {
        selection = { anchor: offset(arg.params.range.start), head: offset(arg.params.range.end) };
        return undefined;
      }
      if (arg?.method) return undefined;
      if (source.includes("PerformanceObserver")) return 1;
      if (source.includes("splice")) return pending.splice(0);
      if (source.includes("__measureState")) return version;
      if (source.includes("push")) {
        pending.push({ t: clock + 1, ts: clock + 1, kind: "key", key: arg });
        return undefined;
      }
      throw new Error(`unexpected evaluate: ${source.slice(0, 80)}`);
    },
    waitForTimeout: async () => {},
    waitForFunction: async () => {},
    screenshot: async () => {},
    keyboard: {
      type: async () => {},
      insertText: async (text) => edit(text),
      press: async (k) => {
        if (k !== "Backspace") return;
        pending.push({ t: clock + 1, ts: clock + 1, kind: "key", key: k });
        if (selection.anchor === selection.head) selection.anchor -= 1;
        edit("");
      },
    },
  };
  return { page, original: () => original, text: () => doc };
}

await check("a structural run alternates an insert and its removal, and leaves the document as it found it", async () => {
  const line = "      [[raffles_inquisitive:gloves]]";
  const editor = structuralPage(line);
  const run = await runMeasure(["--project", "rb", "--line", "3514", "--structural", "--warmup", "1", "--samples", "2", "--settle", "0"], {
    withEditor: async (fn) => fn({ page: editor.page, url: "http://localhost:1", consoleLines: [] }),
  });
  assert.equal(run.report.error, undefined, run.report.error);
  assert.equal(run.report.mode, "structural");
  assert.equal(run.report.inserted, `      ${STRUCTURAL_TEXT}`);
  assert.deepEqual(run.report.samples.map((s) => [s.direction, s.lines, s.failure]), [["insert", 3517, undefined], ["remove", 3516, undefined], ["insert", 3517, undefined]]);
  assert.equal(run.report.samples[1].restoredMatches, true);
  assert.deepEqual(run.report.samples.map((s) => s.ms), [100, 100, 100]);
  assert.deepEqual(run.report.samples.map((s) => s.paths), [["beat"], ["beat"], ["beat"]]);
  // The run ended on an insert, so it took the line out again.
  assert.equal(editor.text(), editor.original());
  assert.equal(run.report.restoredMatches, true);
  assert.equal(run.report.linesAfter, run.report.linesBefore);
  assert.equal(run.report.summary.byDirection.insert.samples, 1);
  assert.equal(run.report.summary.byDirection.remove.samples, 1);
  assert.notEqual(run.exitCode, 1);
  // `--indent` gives the inserted line an indentation of its own.
  const indented = structuralPage(line);
  const choice = await runMeasure(["--project", "rb", "--line", "3514", "--structural", "--indent", "4", "--text", "+ [Ask]", "--warmup", "0", "--samples", "1", "--settle", "0"], {
    withEditor: async (fn) => fn({ page: indented.page, url: "http://localhost:1", consoleLines: [] }),
  });
  assert.equal(choice.report.inserted, "    + [Ask]");
  assert.equal(choice.report.samples[0].failure, undefined);
  assert.equal(indented.text(), indented.original());
});

await check("a structural sample that fails still leaves the document as it found it, and fails the run", async () => {
  const line = "      [[raffles_inquisitive:gloves]]";
  // The second insert paints at the measured line instead of the new one.
  const misplaced = structuralPage(line, { paintAt: { 3: 3513 } });
  const painted = await runMeasure(["--project", "rb", "--line", "3514", "--structural", "--warmup", "0", "--samples", "4", "--settle", "0"], {
    withEditor: async (fn) => fn({ page: misplaced.page, url: "http://localhost:1", consoleLines: [] }),
  });
  assert.match(painted.report.samples[2].failure, /painted at file:\/\/local\/main\.sd line 3514, not file:\/\/local\/main\.sd line 3515/);
  assert.equal(misplaced.text(), misplaced.original());
  assert.equal(painted.report.restoredMatches, true);
  assert.equal(painted.exitCode, 1);
  // The editor adds text of its own to the first insert: the sample fails,
  // the run stops, and the document is still put back byte for byte.
  const garbled = structuralPage(line, { garble: { 1: "  " } });
  const stopped = await runMeasure(["--project", "rb", "--line", "3514", "--structural", "--warmup", "0", "--samples", "4", "--settle", "0"], {
    withEditor: async (fn) => fn({ page: garbled.page, url: "http://localhost:1", consoleLines: [] }),
  });
  assert.equal(stopped.report.samples.length, 1);
  assert.match(stopped.report.samples[0].failure, /not the measured one with the line added/);
  assert.equal(garbled.text(), garbled.original());
  assert.equal(stopped.report.restoredMatches, true);
  assert.equal(stopped.exitCode, 1);
  // The editor loses one bracket of the measured line after a removal (the
  // reviewer's case on PR #1882): restoring it must not pass a lone `[`
  // through the close-brackets handler, which would make it `[]`.
  const bracket = structuralPage(line, { garble: { 2: (doc) => doc.replace("[[raffles", "[raffles") } });
  const lost = await runMeasure(["--project", "rb", "--line", "3514", "--structural", "--warmup", "0", "--samples", "4", "--settle", "0"], {
    withEditor: async (fn) => fn({ page: bracket.page, url: "http://localhost:1", consoleLines: [] }),
  });
  assert.ok(lost.report.samples[1].failure, "the removal that lost the bracket fails its sample");
  assert.equal(bracket.text(), bracket.original());
  assert.equal(lost.report.restoredMatches, true);
  assert.equal(lost.report.restored, line);
  assert.equal(lost.exitCode, 1);
});

// Keys pressed at 0, 100, ..., 500, each handled 10 ms later and the last 60
// ms later; compiles named as the workspace names them.
const burstKeys = [0, 100, 200, 300, 400, 500].map((ts) => ({ t: ts + (ts === 500 ? 60 : 10), ts, kind: "key", key: "a" }));
const compileAt = (start, dur) => ({ t: start + dur, kind: "measure", name: "player workspace compile file:///main.sd", start, dur });

await check("a burst counts its compiles, the stale ones, the overlap and the worker's busy share", () => {
  const events = [
    ...burstKeys,
    // Started before the burst: not one of its compiles.
    compileAt(-300, 250),
    compileAt(150, 100), // a key at 200 lands while it runs: stale
    compileAt(220, 40), // runs beside the one before
    compileAt(450, 30), // the key at 500 is after it returns: not stale
    compileAt(560, 40), // the text as typed, 100 ms after the last key
    // Not a keystroke compile.
    { t: 330, kind: "measure", name: "player workspace previewCompile file:///main.sd", start: 300, dur: 30 },
    // Long tasks: one before the burst, two during it.
    { t: -100, kind: "longtask", start: -100, dur: 80 },
    { t: 210, kind: "longtask", start: 210, dur: 70 },
    { t: 505, kind: "longtask", start: 505, dur: 55 },
  ];
  const sample = analyzeBurst(events);
  assert.equal(sample.failure, undefined);
  assert.equal(sample.keys, 6);
  assert.equal(sample.burstMs, 500);
  assert.deepEqual(sample.keyGap, { median: 100, max: 100 });
  assert.deepEqual(sample.inputDelay, { median: 10, max: 60 });
  assert.equal(sample.longtaskMs, 125);
  assert.equal(sample.compiles, 4);
  assert.equal(sample.compilesDuringBurst, 3);
  assert.equal(sample.staleOnArrival, 1);
  assert.equal(sample.maxConcurrent, 2);
  // 150 to 260, then 450 to 480: 140 ms of 500.
  assert.equal(sample.busyShare, 0.28);
  // From 220 to 450 no compile started.
  assert.equal(sample.longestWithoutCompile, 230);
  assert.equal(sample.lastKeyToCompiled, 100);
  const summary = summarizeBurst([sample, { failure: "x" }]);
  assert.equal(summary.samples, 2);
  assert.equal(summary.failures, 1);
  assert.deepEqual(summary.staleOnArrival, { min: 1, median: 1, max: 1 });
  assert.deepEqual(summary.inputDelayMax, { min: 60, median: 60, max: 60 });
});

await check("a burst no compile followed is a failure", () => {
  const sample = analyzeBurst([...burstKeys, compileAt(150, 100)]);
  assert.match(sample.failure, /no workspace compile started after the last key/);
  assert.equal(sample.lastKeyToCompiled, null);
  assert.match(analyzeBurst([burstKeys[0]]).failure, /1 keydown/);
});

await check("bad arguments print the usage through die and launch nothing", async () => {
  await assert.rejects(runMeasure(["--line", "3"], {}), /die: measure needs --project <dir-or-zip> or --fixture\n\nmeasure options:/);
});

if (failures) {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("all measure checks passed");

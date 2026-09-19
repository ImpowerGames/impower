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
import { attributeEditSample, attributePreviewSample, parseMeasureArgs, phaseName, replacedSpan, summarize } from "./measure.mjs";

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

const key = (t, k = "ArrowDown") => ({ t, kind: "key", key: k });
const request = (t, n, edit = "raffles_shy") => ({ t, kind: "request", request: n, state: "focus", edit });
const state = (t, n, status, extra = {}) => ({ t, kind: "state", completion: n == null ? null : { request: n, status }, position: { uri: "file:///main.sd", line: 3514 }, programVersion: 7, ...extra });
const measure = (start, dur, name) => ({ t: start + dur, kind: "measure", name, start, dur });

await check("the result is the state whose completion.request is the key's own request", () => {
  const sample = attributePreviewSample([
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
  const sample = attributePreviewSample([state(90, 41, "showing"), key(100), request(104, 42), state(150, 41, "showing"), state(900, 42, "showing")]);
  assert.equal(sample.request, 42);
  assert.equal(sample.ms, 800);
  const unanswered = attributePreviewSample([key(100), request(104, 42), state(150, 41, "showing")]);
  assert.match(unanswered.failure, /no preview\/didChangeGameState answered request 42/);
  assert.equal(unanswered.ms, undefined);
});

await check("a sample without a request, or answered unavailable, is a failure with its reason", () => {
  assert.match(attributePreviewSample([key(100)]).failure, /produced no textDocument\/previewCompletion/);
  assert.match(attributePreviewSample([request(90, 3)]).failure, /no ArrowDown keydown/);
  // A close notification is not the key's request.
  assert.match(attributePreviewSample([key(100), { t: 101, kind: "request", request: 5, state: "close" }]).failure, /produced no textDocument/);
  const unavailable = attributePreviewSample([key(100), request(101, 5), state(300, 5, "unavailable")]);
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
  );
  assert.equal(sample.failure, undefined);
  assert.equal(sample.programVersion, 8);
  assert.equal(sample.ms, 680);
  assert.equal(sample.keyToPainted, 900);
  assert.deepEqual(sample.phases, { "player workspace compile": 400 });
  assert.match(attributeEditSample([key(100, "Enter"), state(1000, null, null, { programVersion: 8 })], 7).failure, /no workspace compile/);
  assert.match(attributeEditSample([key(100, "Enter"), measure(320, 400, "player workspace compile x"), state(1000, null, null, { programVersion: 7 })], 7).failure, /newer than version 7/);
});

await check("the summary counts failures and takes min, median and max over the rest", () => {
  const summary = summarize([{ ms: 300, phases: { a: 10 } }, { ms: 100, phases: { a: 30 } }, { failure: "x" }, { ms: 200, phases: {} }]);
  assert.equal(summary.samples, 4);
  assert.equal(summary.failures, 1);
  assert.deepEqual(summary.ms, { min: 100, median: 200, max: 300 });
  assert.deepEqual(summary.phases.a, { min: 0, median: 10, max: 30 });
  assert.equal(summarize([{ failure: "x" }]).ms, null);
});

await check("measure names lose their document URI, and a replaced word is found between its neighbours", () => {
  assert.equal(phaseName("player workspace previewCompile file:///local/main.sd"), "player workspace previewCompile");
  assert.equal(phaseName("game/preview"), "game/preview");
  const line = "      [[raffles_concerned:gloves]]";
  assert.deepEqual(replacedSpan(line, "concerned", "      [[raffles_shy:gloves]]"), { start: 16, text: "shy" });
  assert.deepEqual(replacedSpan(line, "concerned", "      [[raffles_:gloves]]"), { start: 16, text: "" });
  assert.equal(replacedSpan(line, "concerned", "      [[bunny_shy]]"), null);
});

if (failures) {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("all measure checks passed");

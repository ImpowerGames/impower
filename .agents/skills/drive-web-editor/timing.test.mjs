#!/usr/bin/env node
// Pins `timing`'s arguments, its statistics, how it pairs a click with the
// command the click caused, and how it turns one metronome beat's clock
// readings into the figures the report gives (#683). Run:
//   node .agents/skills/drive-web-editor/timing.test.mjs
//
// The figures are only as good as the pairing: a message the game was
// already sending must not be timed as the answer to a click, and a beat
// whose sound never started has to be a failure rather than a missing row,
// because dropping it would leave only the good beats in the jitter.
//
// Pure functions, no browser. Node's built-in assert only.

import assert from "node:assert/strict";
import { attributeInputSample, metronomeRow, parseTimingArgs, stats, summarizeInput, summarizeMetronome, timingFailed } from "./timing.mjs";
import { buildInputFixture, buildMetronomeFixture, clickWav } from "./timing-fixture.mjs";

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

await check("each measurement takes its own defaults, and both switch positions, on first", () => {
  assert.deepEqual(parseTimingArgs(["input"]), { kind: "input", load: 10, positions: ["on", "off"], bpm: 120, timeout: 5000, headed: false, samples: 200, warmup: 10 });
  assert.deepEqual(parseTimingArgs(["metronome"]), { kind: "metronome", load: 10, positions: ["on", "off"], bpm: 120, timeout: 5000, headed: false, samples: 100, warmup: 4 });
});

await check("options override the defaults", () => {
  const options = parseTimingArgs(["metronome", "--samples", "20", "--warmup", "0", "--load", "0", "--worker-preview", "off", "--bpm", "90", "--json", "out.json", "--headed"]);
  assert.equal(options.samples, 20);
  assert.equal(options.warmup, 0);
  assert.equal(options.load, 0);
  assert.deepEqual(options.positions, ["off"]);
  assert.equal(options.bpm, 90);
  assert.equal(options.json, "out.json");
  assert.equal(options.headed, true);
});

await check("a measurement has to be named, and unknown or empty options are refused", () => {
  assert.throws(() => parseTimingArgs([]), /input or metronome/);
  assert.throws(() => parseTimingArgs(["--samples", "3"]), /input or metronome/);
  assert.throws(() => parseTimingArgs(["input", "--fast"]), /unknown timing argument --fast/);
  assert.throws(() => parseTimingArgs(["input", "--samples"]), /--samples needs a value/);
  assert.throws(() => parseTimingArgs(["input", "--samples", "0"]), /at least 1/);
  assert.throws(() => parseTimingArgs(["input", "--worker-preview", "sometimes"]), /on, off or both/);
});

await check("statistics are nearest-rank quantiles with the spread between the extremes", () => {
  const values = Array.from({ length: 200 }, (_, i) => i + 1);
  assert.deepEqual(stats(values), { n: 200, min: 1, median: 100, p95: 190, p99: 198, max: 200, spread: 199 });
  assert.deepEqual(stats([3, 1, 2]), { n: 3, min: 1, median: 2, p95: 3, p99: 3, max: 3, spread: 2 });
  assert.equal(stats([]), null);
  assert.equal(stats([undefined, null, Number.NaN]), null);
});

// A page record around one click on the choice: a pointerdown, then the
// click, then the game's answer.
const record = (answerAt, overrides = {}) => ({
  clicks: [
    { type: "pointerdown", t: 100, timeStamp: 99, trusted: true },
    { type: "click", t: 104, timeStamp: 102.5, trusted: true },
  ],
  messages: [{ t: answerAt, method: "ui/batch", answersChoice: true }],
  previousMessageAt: 20,
  timeOrigin: 1_000_000,
  ...overrides,
});

await check("a click is timed from the click event to the page handling the game's answer", () => {
  assert.deepEqual(attributeInputSample(record(104.6)), { trusted: true, quietBefore: 84, method: "ui/batch", ms: 0.6, fromTimeStamp: 2.1 });
});

await check("a message that arrived before the click is not its answer", () => {
  const sample = attributeInputSample(record(110, { messages: [{ t: 103, method: "ui/batch", answersChoice: true }, { t: 110, method: "ui/batch", answersChoice: true }] }));
  assert.equal(sample.ms, 6);
});

await check("an answer that does not touch a choice is a failure, not a sample", () => {
  const sample = attributeInputSample(record(105, { messages: [{ t: 105, method: "audio/update", answersChoice: false }] }));
  assert.match(sample.failure, /audio\/update\) does not touch a choice/);
  assert.equal(sample.ms, 1);
});

await check("a click with no answer, or no click at all, is a failure", () => {
  assert.match(attributeInputSample(record(0, { messages: [] })).failure, /sent nothing after the click/);
  assert.match(attributeInputSample(record(105, { clicks: [{ type: "pointerdown", t: 100, timeStamp: 99 }] })).failure, /no click event/);
});

await check("with the game in the worker, the time divides at the worker posting its answer", () => {
  // The page posted the click at shared 1,000,104.2, the worker answered at
  // 1,000,104.3, and the page took the answer at 1,000,112.
  const sample = attributeInputSample(record(112, { posted: [{ at: 1_000_104.2, type: "click" }], sent: [1_000_050, 1_000_104.3] }));
  assert.equal(sample.postedToAnswered, 0.1);
  assert.equal(sample.answeredToHandled, 7.7);
  assert.equal(sample.ms, 8);
});

await check("an input summary leaves failed samples out of the figures and counts them", () => {
  const summary = summarizeInput([{ ms: 1 }, { ms: 3 }, { ms: 2 }, { failure: "x", ms: 50 }]);
  assert.equal(summary.samples, 4);
  assert.equal(summary.failures, 1);
  assert.equal(summary.ms.max, 3);
  assert.equal(summary.postedToAnswered, null);
});

// One beat at 48 kHz: the output timestamp says context time 10 s is heard at
// page time 5,000 ms; the page's time origin is 1,000,000 ms since the epoch.
// So context time t is heard at 1,005,000 + (t - 10) * 1000, and a sound due
// at 10.46 s is heard at 1,005,460: its stamp, 1,005,420, plus the 40 ms of
// output latency.
const timeOrigin = 1_000_000;
const beat = (overrides = {}) => ({
  stamp: 1_005_420,
  arrivedAt: 5_405,
  due: 10.46,
  currentTime: 10.45,
  outputTimestamp: { contextTime: 10, performanceTime: 5_000 },
  outputLatency: 0.04,
  flash: { startTime: 5_460, setAt: 5_452 },
  ...overrides,
});
const onsetAt = (contextTime) => ({ contextTime, frame: Math.round(contextTime * 48_000), peak: 0.9 });

await check("a beat on time is heard at its stamp plus the output latency, with its flash", () => {
  const row = metronomeRow(beat(), [onsetAt(10.46)], timeOrigin);
  assert.deepEqual(row, {
    stamp: 1_005_420,
    arrivedMinusStamp: -15,
    late: false,
    lateBy: 0,
    scheduledMinusStamp: 40,
    outputLatency: 40,
    frame: 502_080,
    peak: 0.9,
    onsetMinusStamp: 40,
    onsetMinusScheduled: 0,
    flashMinusOnset: 0,
    flashMinusStamp: 40,
    flashSetLateBy: 0,
  });
});

await check("a sound handled after it was due starts then, and the row says how late", () => {
  const row = metronomeRow(beat({ currentTime: 10.4725 }), [onsetAt(10.4725)], timeOrigin);
  assert.equal(row.late, true);
  assert.equal(row.lateBy, 12.5);
  assert.equal(row.scheduledMinusStamp, 52.5);
  assert.equal(row.onsetMinusStamp, 52.5);
  // The flash still starts at the stamp's time, so it leads the late sound.
  assert.equal(row.flashMinusOnset, -12.5);
  assert.equal(row.onsetMinusScheduled, 0);
});

await check("the onset is the tap's first report near the beat, not a neighbouring beat's", () => {
  const row = metronomeRow(beat(), [onsetAt(9.96), onsetAt(10.4601), onsetAt(10.96)], timeOrigin);
  assert.equal(row.frame, Math.round(10.4601 * 48_000));
  assert.equal(row.onsetMinusScheduled, 0.1);
});

await check("a beat with no onset or no flash is a failure", () => {
  assert.match(metronomeRow(beat(), [onsetAt(12)], timeOrigin).failure, /no onset/);
  assert.match(metronomeRow(beat({ flash: null }), [onsetAt(10.46)], timeOrigin).failure, /no flash/);
});

await check("a flash set after its own start time reports how late it was set", () => {
  assert.equal(metronomeRow(beat({ flash: { startTime: 5_460, setAt: 5_471.5 } }), [onsetAt(10.46)], timeOrigin).flashSetLateBy, 11.5);
});

await check("with the game in the worker, a beat's time divides at the worker posting it", () => {
  const row = metronomeRow(beat({ sentAt: 1_005_405 }), [onsetAt(10.46)], timeOrigin);
  assert.equal(row.sentMinusStamp, -15);
  assert.equal(row.transit, 0);
});

await check("a metronome summary counts late arrivals and failures and reads the stamp intervals", () => {
  const rows = [
    { stamp: 0, late: false, onsetMinusStamp: 40 },
    { stamp: 500, late: true, lateBy: 5, onsetMinusStamp: 45 },
    { stamp: 1016, late: false, failure: "no onset" },
  ];
  const summary = summarizeMetronome(rows);
  assert.equal(summary.clicks, 3);
  assert.equal(summary.failures, 1);
  assert.equal(summary.lateArrivals, 1);
  assert.deepEqual(summary.stampInterval, { n: 2, min: 500, median: 500, p95: 516, p99: 516, max: 516, spread: 16 });
  assert.equal(summary.onsetMinusStamp.spread, 5);
  assert.equal(summary.lateBy.n, 1);
});

await check("a run fails on an error in any position or any failed measured sample", () => {
  const phase = (failures) => ({ summary: { failures } });
  assert.equal(timingFailed({ positions: [{ phases: [phase(0)] }] }), false);
  assert.equal(timingFailed({ positions: [{ phases: [phase(0)] }, { error: "no frame", phases: [] }] }), true);
  assert.equal(timingFailed({ positions: [{ phases: [phase(0), phase(2)] }] }), true);
});

await check("the metronome fixture alternates its flashes and starts PLAY on its first line", () => {
  const { files, startLine, beats } = buildMetronomeFixture({ beats: 4 });
  const lines = files.get("main.sd").split("\n");
  assert.equal(beats, 4);
  assert.equal(lines[startLine - 1], "  Ready.");
  assert.deepEqual(
    lines.filter((l) => l.includes("[[show")),
    ["  [[show backdrop flash_a]]", "  [[show backdrop flash_b]]", "  [[show backdrop flash_a]]", "  [[show backdrop flash_b]]"],
  );
  assert.equal(lines.filter((l) => l === "  ((play sound click))").length, 4);
  assert.ok(files.has("assets/click.wav") && files.has("assets/flash_a.svg") && files.has("assets/flash_b.svg"));
});

await check("the click's first sample is at full level, so its first frame is its onset", () => {
  const wav = clickWav({ sampleRate: 48_000, ms: 40 });
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.readUInt32LE(24), 48_000);
  assert.equal(wav.readUInt32LE(40), 1920 * 2);
  assert.ok(wav.readInt16LE(44) / 32767 > 0.89);
});

await check("the input fixture offers its two choices for ever", () => {
  const { files, startLine, choices } = buildInputFixture();
  const lines = files.get("main.sd").split("\n");
  assert.equal(lines[startLine - 1], "  Ready.");
  assert.deepEqual(choices, ["Left", "Right"]);
  assert.ok(lines.includes("    + [Left]") && lines.includes("    + [Right]") && lines.includes("  -> PICK"));
});

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");

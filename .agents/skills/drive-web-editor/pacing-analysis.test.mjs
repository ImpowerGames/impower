#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MERGE_MS, analyzeLine, clockOffset, cpuLoad, layerPaints, mergePresentations, parseTrace, quietness, repeatability, stallsIn } from "./pacing-analysis.mjs";
import { pacingBeats, pacingEnvironment, pacingFired, pacingMotion, pacingProbe, pacingRead, pacingTypingEnd, layerTracker, planFor, playLines } from "./pacing-run.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const firstSecondOnly = (doc) => ({ ...doc, record: { ...doc.record, typingEnd: undefined, mouthChanges: doc.record.mouthChanges.filter((t) => t < doc.record.firedAt + 1000 - 30) } });
const excerpt = (name) => firstSecondOnly(JSON.parse(fs.readFileSync(path.join(here, "fixtures", "pacing-trace", `${name}.json`), "utf8")));
const TALK = excerpt("talk-line");
const NARRATION = excerpt("narration-line");

const pageMarks = (doc) => doc.traceEvents.filter((e) => e.ph === "I" && e.args?.data?.startTime != null).map((e) => ({ name: e.name, startTime: e.args.data.startTime }));

const rawPresented = (doc, pid) => {
  const open = new Map();
  const ends = [];
  for (const e of doc.traceEvents.filter((x) => x.name === "PipelineReporter" && x.pid === pid)) {
    if (e.ph === "b") open.set(e.id2.local, e);
    else {
      const begin = open.get(e.id2.local);
      if (begin && /PRESENTED/.test(begin.args.frame_reporter.state)) ends.push(e.ts / 1000);
    }
  }
  return ends.sort((a, b) => a - b);
};

const analyzed = (doc, trace = parseTrace(doc)) => {
  const clock = clockOffset(trace.marks, pageMarks(doc));
  return { clock, line: analyzeLine(trace, doc.record, clock) };
};

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

await check("the page clock is joined to the trace through the line's marks", () => {
  const { clock } = analyzed(TALK);
  assert.equal(clock.matched, 4);
  assert.ok(clock.spreadMs <= 0.2, `marks disagree by ${clock.spreadMs} ms`);
  const fired = TALK.traceEvents.find((e) => e.name.startsWith("beat fired "));
  assert.equal(clock.pid, fired.pid);
  assert.equal(clock.tid, fired.tid);
});

await check("presentations whose ends fall within 2 ms of each other are merged into one", () => {
  const { clock } = analyzed(TALK);
  const raw = rawPresented(TALK, clock.pid);
  const merged = parseTrace(TALK).frames.get(clock.pid).presented;
  assert.equal(raw.length, 143);
  assert.equal(merged.length, 80);
  assert.deepEqual(merged, mergePresentations(raw));
  for (let i = 1; i < merged.length; i++) assert.ok(merged[i] - merged[i - 1] > MERGE_MS, `two presentations ${merged[i] - merged[i - 1]} ms apart survived the merge`);
  for (const end of raw) assert.ok(merged.some((m) => end >= m && end - m <= MERGE_MS), `presentation at ${end} lost`);
  assert.deepEqual(mergePresentations([10, 11.5, 13.6, 30, 31.9, 32.1]), [10, 13.6, 30, 32.1]);
});

await check("a stretch between two presentations with a dropped frame in it is a stall, and one with none is not", () => {
  const { clock, line } = analyzed(TALK);
  const fired = TALK.record.firedAt + clock.offset;
  const frames = parseTrace(TALK).frames.get(clock.pid);
  assert.deepEqual(line.firstSecond.stalls, { count: 1, longestMs: 49.9, totalMs: 49.9 });
  assert.equal(line.firstSecond.droppedFrames, 2);
  const stall = stallsIn(frames.presented, frames.dropped, fired, fired + 1000).list[0];
  assert.deepEqual(frames.dropped.filter((d) => d >= stall.from && d < stall.to).map((d) => Math.round((d - fired) * 10) / 10), [65.6, 82.3]);
  const quietGaps = [];
  for (let i = 1; i < frames.presented.length; i++) {
    const [a, b] = [frames.presented[i - 1], frames.presented[i]];
    if (b > fired && a < fired + 1000 && b - a > 30 && !frames.dropped.some((d) => d >= a && d < b)) quietGaps.push(Math.round((b - a) * 10) / 10);
  }
  assert.deepEqual(quietGaps, [33.5]);
});

await check("a line whose longest wait between frames had nothing dropped has no stall", () => {
  const { clock, line } = analyzed(NARRATION);
  const fired = NARRATION.record.firedAt + clock.offset;
  const frames = parseTrace(NARRATION).frames.get(clock.pid);
  let longest = 0;
  for (let i = 1; i < frames.presented.length; i++) if (frames.presented[i] > fired && frames.presented[i - 1] < fired + 1000) longest = Math.max(longest, frames.presented[i] - frames.presented[i - 1]);
  assert.ok(longest > 30, `the narration line's longest gap is ${longest} ms`);
  assert.deepEqual(line.firstSecond.stalls, { count: 0, longestMs: 0, totalMs: 0 });
  assert.equal(line.firstSecond.droppedFrames, 0);
});

await check("graphics-process and page-thread tasks are attributed to the line they fall in", () => {
  const combined = parseTrace({ traceEvents: [...TALK.traceEvents, ...NARRATION.traceEvents] });
  for (const doc of [TALK, NARRATION]) {
    const alone = analyzed(doc).line;
    const together = analyzed(doc, combined).line;
    assert.deepEqual(together, alone, `line ${doc.record.line} changed when the other line's events were present`);
  }
  const talk = analyzed(TALK, combined).line;
  const narration = analyzed(NARRATION, combined).line;
  assert.deepEqual(talk.firstSecond.graphicsTasks, [{ atMs: 45.6, ms: 32.8 }]);
  assert.equal(talk.firstSecond.graphicsMs, 99);
  assert.deepEqual(narration.firstSecond.graphicsTasks, []);
  assert.equal(narration.firstSecond.graphicsMs, 20.7);
  assert.equal(talk.pageThread.fromClockMs, 262.6);
  assert.equal(narration.pageThread.fromClockMs, 217.5);
  assert.equal(talk.waitMs, 99.4);
  assert.equal(narration.waitMs, 101.3);
  assert.equal(talk.mouth.changes, 9);
  assert.equal(narration.mouth.changes, 0);
});

await check("a fired beat's line maps to the fixture line listed at or after it", () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(here, "..", "drive-vscode-web", "fixtures", "pacing", "lines.json"), "utf8"));
  const kinds = [163, 167, 170, 175, 179, 182, 185, 188, 191, 194].map((line) => planFor(fixture, line)?.kind);
  assert.deepEqual(kinds, ["talk", "narration", "talk-pan", "sound", "swap-layered", "zoom-layered", "vector-backdrop", "vector-element", "talk", "narration"]);
  assert.equal(planFor(fixture, 195), null);
});

await check("a run is quiet only while the CPU load before it stays under the limit", () => {
  const snapshot = (user, idle) => [{ times: { user, nice: 0, sys: 0, idle, irq: 0 } }, { times: { user, nice: 0, sys: 0, idle, irq: 0 } }];
  const busy = cpuLoad(snapshot(0, 0), snapshot(900, 100));
  const idle = cpuLoad(snapshot(0, 0), snapshot(50, 950));
  assert.equal(busy, 90);
  assert.equal(idle, 5);
  assert.equal(quietness(busy, 25).quiet, false);
  assert.match(quietness(busy, 25).verdict, /^not quiet/);
  assert.equal(quietness(idle, 25).quiet, true);
  assert.equal(quietness(null, 25).quiet, false);
});

await check("two quiet runs are repeatable only when every occurrence of the talking line stays within 20 ms of itself", () => {
  const run = (figures, { quiet = true, failed = [] } = {}) => ({ quiet: { quiet }, failed, lines: figures.map(([listed, longestMs, kind = "talk"]) => ({ listed, kind, firstSecond: { stalls: { longestMs } } })) });
  const close = repeatability([run([[165, 49.9], [172, 0, "talk-pan"], [167, 300, "narration"]]), run([[165, 50.1], [172, 12, "talk-pan"], [167, 0, "narration"]])]);
  assert.equal(close.within, true);
  assert.match(close.verdict, /^repeatable/);
  assert.deepEqual(close.lines.map((l) => [l.line, l.spreadMs]), [[165, 0.2], [172, 12]]);
  const oneFrame = repeatability([run([[165, 50.1], [172, 28.2, "talk-pan"]]), run([[165, 32.6], [172, 0, "talk-pan"]])]);
  assert.equal(oneFrame.within, false);
  assert.match(oneFrame.verdict, /^not repeatable/);
  const swapped = repeatability([run([[165, 500], [172, 0, "talk-pan"]]), run([[165, 0], [172, 500, "talk-pan"]])]);
  assert.equal(swapped.within, false);
  assert.match(repeatability([run([[165, 30]]), run([[165, 31]], { quiet: false })]).verdict, /^not judged, because at least one run was not quiet/);
  assert.match(repeatability([run([[165, 30]]), run([[165, 31]], { failed: ["line 163: the trace holds no frame"] })]).verdict, /^not judged, because at least one run failed/);
  assert.equal(repeatability([run([[165, 30]])]).within, null);
});

await check("a pan or zoom line's frame rate is read over the animation's own interval, not the typing", () => {
  const trace = parseTrace(TALK);
  const clock = clockOffset(trace.marks, pageMarks(TALK));
  const fired = TALK.record.firedAt;
  const firstSecond = analyzeLine(trace, { ...TALK.record, motion: true, motionWindow: { start: fired, end: fired + 1000, target: "span.instance" } }, clock);
  assert.equal(firstSecond.motionFramesPerSecond, 57);
  assert.equal(firstSecond.motion.ms, 1000);
  const half = analyzeLine(trace, { ...TALK.record, motion: true, motionWindow: { start: fired + 500, end: fired + 1000 } }, clock);
  const frames = trace.frames.get(clock.pid).presented.filter((t) => t >= fired + clock.offset + 500 && t < fired + clock.offset + 1000).length;
  assert.equal(half.motionFramesPerSecond, frames * 2);
  assert.match(analyzeLine(trace, { ...TALK.record, motion: true }, clock).failure, /no pan or zoom animation/);
  assert.equal(analyzeLine(trace, TALK.record, clock).motion, undefined);
});

await check("a run whose line could not be measured fails, so a broken capture never passes", async () => {
  const fixture = { start: 160, lines: [{ line: 160, kind: "warmup" }, { line: 165, kind: "talk" }] };
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "pacing-run-test-"));
  const listeners = new Map();
  const answers = new Map([
    [pacingProbe, "installed"],
    [pacingEnvironment, { refreshHz: 60, devicePixelRatio: 1, gameView: "781x563" }],
    [pacingBeats, { fired: [], clicks: 0 }],
    [pacingFired, "beat fired main.sd:163 #2"],
    [pacingTypingEnd, { end: 100, now: 100 }],
    [pacingMotion, null],
    [pacingRead, { label: "main.sd:163 #2", line: 163, clickName: "pacing click 1", clickAt: 10, receivedAt: 20, firedAt: 30, beatWaitMs: 10, morph: [], text: "" }],
  ]);
  const surface = {
    inGame: async (fn) => (answers.has(fn) ? answers.get(fn) : 1e9),
    clickGame: async () => {},
    sendBrowser: async (method) => {
      if (method === "Tracing.end") setTimeout(() => listeners.get("Tracing.tracingComplete")?.({ stream: "s" }), 0);
      if (method === "IO.read") return { data: JSON.stringify({ traceEvents: [] }), eof: true };
      return {};
    },
    onBrowser: (name, handler) => {
      listeners.set(name, handler);
      return () => listeners.delete(name);
    },
    sendGame: async () => ({}),
    onGame: () => () => {},
  };
  try {
    const run = await playLines(surface, { out, fixture, restMs: 0, settleMs: 0, quietSampleMs: 0, fireTimeoutMs: 1000 });
    assert.equal(run.lines.length, 1);
    assert.match(run.lines[0].failure, /none of the line's marks/);
    assert.ok(run.failed.some((f) => /line 163: the trace held none of the line's marks/.test(f)), JSON.stringify(run.failed));
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

await check("a frame not enclosed by two captured presentations, or a trace not spanning what a line reports, fails the line; an enclosed frame is measured", () => {
  const FIRE = 1000;
  const frame = (id, begin, end, state) => [
    { name: "PipelineReporter", ph: "b", pid: 1, tid: 2, id2: { local: `0x${id}` }, ts: begin * 1000, args: { frame_reporter: { state } } },
    { name: "PipelineReporter", ph: "e", pid: 1, tid: 2, id2: { local: `0x${id}` }, ts: end * 1000, args: {} },
  ];
  const build = (presented, dropped, { from = 500, to = 4000 } = {}, unended = [], extra = []) => {
    let id = 0;
    const events = [{ name: "thread_name", ph: "M", pid: 1, tid: 1, args: { name: "CrRendererMain" } }, { name: "thread_name", ph: "M", pid: 3, tid: 4, args: { name: "CrGpuMain" } }, ...extra];
    for (const at of presented) events.push(...frame(++id, at - 16, at, "STATE_PRESENTED_ALL"));
    for (const at of dropped) events.push(...frame(++id, at, at + 16, "STATE_DROPPED"));
    for (const { at, state } of unended) events.push(frame(++id, at, at + 16, state)[0]);
    events.push({ name: "RunTask", ph: "X", pid: 1, tid: 1, ts: from * 1000, dur: 1000 });
    events.push({ name: "RunTask", ph: "X", pid: 1, tid: 1, ts: (to - 1) * 1000, dur: 1000 });
    return parseTrace({ traceEvents: events });
  };
  const clock = { offset: 0, pid: 1, tid: 1 };
  const windows = {
    "first second": { end: 2000, record: {} },
    typing: { end: 2600, record: { typingEnd: 2600 } },
    "pan or zoom": { end: 3200, record: { motion: true, motionWindow: { start: FIRE, end: 3200, target: "span.instance" } } },
  };
  const rows = [];
  for (const [window, { end, record }] of Object.entries(windows)) {
    rows.push(
      { window, where: "between two presentations", presented: [990, 1100, 1300, end + 50], dropped: [1200], expect: { count: 1, longestMs: 200 } },
      { window, where: "before the first, a presentation precedes the fire", presented: [990, 1100, end + 50], dropped: [980], expect: { count: 0, longestMs: 0 } },
      { window, where: "before the first, no presentation precedes the fire", presented: [1100, 1300, end + 50], dropped: [1050], expect: "fail" },
      { window, where: "after the last, a presentation follows the window's end", presented: [990, 1100, end + 50], dropped: [end + 80], expect: { count: 0, longestMs: 0 } },
      { window, where: "after the last, no presentation follows the window's end", presented: [990, 1100, end - 100], dropped: [end - 50], expect: "fail" },
      { window, where: "with no presentation at all", presented: [], dropped: [1500], expect: "fail" },
    );
    for (const row of rows.slice(-6)) row.record = record;
  }
  rows.push(
    { window: "first second", where: "round 1: the trace holds no frame reports", trace: parseTrace({ traceEvents: TALK.traceEvents.filter((e) => e.name !== "PipelineReporter") }), expect: "fail" },
    { window: "first second", where: "round 1: the trace stops 500 ms after the fire", presented: [990, 1100, 1400], dropped: [], span: { to: 1500 }, expect: "fail" },
    { window: "typing", where: "round 2: drops after the last of 900/990/1100/1200", presented: [900, 990, 1100, 1200], dropped: [1216, 1233, 1250, 1300, 1500, 1990], span: { to: 2501 }, record: { typingEnd: 1400 }, expect: "fail" },
    { window: "typing", where: "round 3: drops before the first of 1800/1900/2100", presented: [1800, 1900, 2100], dropped: [1016, 1033, 1050, 1100, 1200, 1400, 1600, 1700], span: { to: 2501 }, record: { typingEnd: 1900 }, expect: "fail" },
    { window: "first second", where: "control: a closing presentation at 2050 ends the round-2 stretch", presented: [900, 990, 1100, 1200, 2050], dropped: [1216, 1233, 1250, 1300, 1500, 1990], span: { to: 2501 }, record: { typingEnd: 1400 }, expect: { count: 1, longestMs: 850 } },
    { window: "first second", where: "control: a presentation at 900 starts the round-3 stretch", presented: [900, 1800, 1900, 2100], dropped: [1016, 1033, 1050, 1100, 1200, 1400, 1600, 1700], span: { to: 2501 }, record: { typingEnd: 1900 }, expect: { count: 1, longestMs: 900 } },
    { window: "first second", where: "control: a stretch overlapping the second counts whole", presented: [900, 1600, 2300], dropped: [2100], span: { to: 2501 }, expect: { count: 1, longestMs: 700 } },
    { window: "first second", where: "round 4: a dropped reporter whose end is missing, after the last of 990/1100", presented: [990, 1100], dropped: [], unended: [{ at: 1500, state: "STATE_DROPPED" }], span: { to: 3001 }, expect: "fail" },
    { window: "first second", where: "a reporter whose end is missing, between two presentations, outcome unknown", presented: [990, 1100, 1300, 2050], dropped: [], unended: [{ at: 1200, state: "STATE_PRESENTED_ALL" }], expect: "fail" },
    { window: "first second", where: "control: a reporter whose end is missing after the windows", presented: [990, 1100, 2050], dropped: [], unended: [{ at: 2100, state: "STATE_PRESENTED_ALL" }, { at: 2120, state: "STATE_DROPPED" }], expect: { count: 0, longestMs: 0 } },
    { window: "first second", where: "round 4: the trace starts after the click it reads page work from", presented: [990, 1100, 2050], dropped: [], span: { from: 974 }, record: { clickAt: 800 }, expect: "fail" },
    { window: "first second", where: "control: the trace starts before the click", presented: [990, 1100, 2050], dropped: [], span: { from: 700 }, record: { clickAt: 800 }, expect: { count: 0, longestMs: 0 } },
    { window: "typing", where: "round 4: the trace ends inside the last mouth change's 30 ms", presented: [990, 1100, 1990], dropped: [], span: { to: 2000 }, record: { typingEnd: 2000, mouthChanges: [1995] }, expect: "fail" },
    { window: "typing", where: "round 5: a graphics task with no end starts inside the last mouth window", presented: [990, 1100, 1300, 2050], dropped: [], record: { typingEnd: 2000, mouthChanges: [1950] }, extra: [{ name: "GPUTask", ph: "B", pid: 3, tid: 4, ts: 1950 * 1000 }], expect: "fail" },
    { window: "first second", where: "round 5: a page task with no end starts after the click", presented: [990, 1100, 2050], dropped: [], record: { clickAt: 900 }, extra: [{ name: "RunTask", ph: "B", pid: 1, tid: 1, ts: 950 * 1000 }], expect: "fail" },
    { window: "typing", where: "control: tasks with no end start after every reported interval", presented: [990, 1100, 2050], dropped: [], record: { typingEnd: 2000, mouthChanges: [1950] }, extra: [{ name: "GPUTask", ph: "B", pid: 3, tid: 4, ts: 2500 * 1000 }, { name: "RunTask", ph: "B", pid: 1, tid: 1, ts: 2500 * 1000 }], expect: { count: 0, longestMs: 0 } },
    { window: "first second", where: "a frame report whose start is missing ends between two presentations", presented: [990, 1100, 1300, 2050], dropped: [], extra: [{ name: "PipelineReporter", ph: "e", pid: 1, tid: 2, id2: { local: "0xff" }, ts: 1200 * 1000, args: {} }], expect: "fail" },
    { window: "first second", where: "a completed frame report of an unknown state between two presentations", presented: [990, 1100, 1300, 2050], dropped: [], extra: [{ name: "PipelineReporter", ph: "b", pid: 1, tid: 2, id2: { local: "0xfe" }, ts: 1180 * 1000, args: { frame_reporter: { state: "STATE_UNKNOWN" } } }, { name: "PipelineReporter", ph: "e", pid: 1, tid: 2, id2: { local: "0xfe" }, ts: 1200 * 1000, args: {} }], expect: "fail" },
    { window: "typing", where: "control: the trace covers the last mouth change's 30 ms", presented: [990, 1100, 2050], dropped: [], span: { to: 2100 }, record: { typingEnd: 2000, mouthChanges: [1995] }, expect: { count: 0, longestMs: 0 } },
  );
  const wrong = [];
  for (const row of rows) {
    const trace = row.trace ?? build(row.presented, row.dropped, row.span, row.unended, row.extra);
    const line = analyzeLine(trace, { line: 5, clickAt: 900, firedAt: FIRE, ...row.record }, row.trace ? analyzed(TALK).clock : clock);
    const got = line.failure ? "fail" : { count: line.firstSecond.stalls.count, longestMs: line.firstSecond.stalls.longestMs };
    if (JSON.stringify(got) !== JSON.stringify(row.expect)) wrong.push(`${row.window}, dropped frame ${row.where}: expected ${JSON.stringify(row.expect)}, got ${JSON.stringify(got)}${line.failure ? ` (${line.failure})` : ""}`);
  }
  assert.deepEqual(wrong, []);
  assert.equal(rows.length, 37);
});

await check("a task given as a begin and an end is measured like a complete one, and only a begin is kept as unfinished", () => {
  const trace = parseTrace({
    traceEvents: [
      { name: "thread_name", ph: "M", pid: 3, tid: 4, args: { name: "CrGpuMain" } },
      { name: "GPUTask", ph: "B", pid: 3, tid: 4, ts: 1000 * 1000 },
      { name: "GPUTask", ph: "E", pid: 3, tid: 4, ts: 1030 * 1000 },
      { name: "RunTask", ph: "B", pid: 1, tid: 1, ts: 1100 * 1000 },
      { name: "RunTask", ph: "E", pid: 1, tid: 1, ts: 1160 * 1000 },
      { name: "RunTask", ph: "B", pid: 1, tid: 1, ts: 1200 * 1000 },
    ],
  });
  assert.deepEqual(trace.graphics, [{ ts: 1000, dur: 30 }]);
  assert.deepEqual(trace.tasks.get("1:1"), [{ ts: 1100, dur: 60 }]);
  assert.deepEqual(trace.unfinished.tasks.get("1:1"), [1200]);
  assert.deepEqual(trace.unfinished.graphics, []);
});

await check("a picture layer that paints and then leaves the layer tree keeps its paints", () => {
  let emit;
  const tracker = layerTracker((name, handler) => {
    emit = handler;
    return () => {};
  });
  const portrait = (paintCount) => ({ layerId: "portrait", paintCount, drawsContent: true, width: 736, height: 552 });
  emit({ layers: [portrait(10)] });
  const before = tracker.begin();
  emit({ layers: [portrait(15)] });
  emit({ layers: [] });
  assert.deepEqual(layerPaints(before, tracker.observed()).map((l) => l.paints), [5]);
  emit({ layers: [portrait(17)] });
  assert.deepEqual(layerPaints(before, tracker.observed()).map((l) => l.paints), [7]);
});

await check("a real project's line keeps tracing through its first second at no rest, and a pan it detects is measured", async () => {
  const marks = pageMarks(TALK);
  const fired = marks.find((m) => m.name.startsWith("beat fired ")).name;
  const click = marks.find((m) => m.name.startsWith("pacing click "));
  const label = fired.slice("beat fired ".length);
  const firedAt = TALK.record.firedAt;
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "pacing-run-test-"));
  let now = firedAt;
  let stoppedAt = null;
  const listeners = new Map();
  const answers = new Map([
    [pacingProbe, "installed"],
    [pacingEnvironment, { refreshHz: 60, devicePixelRatio: 1, gameView: "781x563" }],
    [pacingBeats, { fired: [], clicks: 0 }],
    [pacingFired, fired],
    [pacingTypingEnd, { end: firedAt + 50, now: firedAt + 50, fired: firedAt }],
    [pacingMotion, { start: firedAt, end: firedAt + 600, target: "span.instance[image=hall]" }],
    [pacingRead, { label, line: TALK.record.line, clickName: click.name, clickAt: click.startTime, receivedAt: TALK.record.receivedAt, firedAt, beatWaitMs: TALK.record.beatWaitMs, morph: [], text: "" }],
  ]);
  const surface = {
    inGame: async (fn) => {
      if (answers.has(fn)) return answers.get(fn);
      now += 100;
      return now;
    },
    clickGame: async () => {},
    sendBrowser: async (method) => {
      if (method === "Tracing.end") {
        stoppedAt = now;
        setTimeout(() => listeners.get("Tracing.tracingComplete")?.({ stream: "s" }), 0);
      }
      if (method === "IO.read") return { data: JSON.stringify(TALK), eof: true };
      return {};
    },
    onBrowser: (name, handler) => {
      listeners.set(name, handler);
      return () => listeners.delete(name);
    },
    sendGame: async () => ({}),
    onGame: () => () => {},
  };
  try {
    const run = await playLines(surface, { out, fixture: null, beats: 1, restMs: 0, settleMs: 0, quietSampleMs: 0, fireTimeoutMs: 1000 });
    assert.deepEqual(run.failed, []);
    assert.ok(stoppedAt >= firedAt + 1000, `the trace stopped ${stoppedAt - firedAt} ms after the fire`);
    const offset = clockOffset(parseTrace(TALK).marks, marks).offset;
    const shown = parseTrace(TALK).frames.get(clockOffset(parseTrace(TALK).marks, marks).pid).presented.filter((t) => t >= firedAt + offset && t < firedAt + offset + 600).length;
    assert.equal(run.lines[0].motionFramesPerSecond, Math.round((shown / 0.6) * 10) / 10);
    assert.equal(run.lines[0].motion.target, "span.instance[image=hall]");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

if (failures) {
  console.log(`${failures} failed`);
  process.exit(1);
}

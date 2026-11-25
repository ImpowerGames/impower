#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MERGE_MS, analyzeLine, clockOffset, cpuLoad, mergePresentations, parseTrace, quietness, repeatability, stallsIn } from "./pacing-analysis.mjs";
import { planFor } from "./pacing-run.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const excerpt = (name) => JSON.parse(fs.readFileSync(path.join(here, "fixtures", "pacing-trace", `${name}.json`), "utf8"));
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
  assert.equal(talk.mouth.changes, 27);
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

await check("two quiet runs are repeatable when the talking line's longest stall in each stays within 20 ms", () => {
  const run = (figures, quiet = true) => ({ quiet: { quiet }, lines: figures.map(([listed, longestMs, kind = "talk"]) => ({ listed, kind, firstSecond: { stalls: { longestMs } } })) });
  const close = repeatability([run([[165, 50.1], [172, 28.2, "talk-pan"], [167, 300, "narration"]]), run([[165, 32.6], [172, 0, "talk-pan"], [167, 0, "narration"]])]);
  assert.deepEqual(close.figures, [50.1, 32.6]);
  assert.equal(close.within, true);
  assert.match(close.verdict, /^repeatable/);
  assert.deepEqual(close.lines.map((l) => [l.line, l.spreadMs]), [[165, 17.5], [172, 28.2]]);
  const far = repeatability([run([[165, 30]]), run([[165, 60]])]);
  assert.equal(far.within, false);
  assert.match(far.verdict, /^not repeatable/);
  assert.match(repeatability([run([[165, 30]]), run([[165, 31]], false)]).verdict, /^not judged/);
  assert.equal(repeatability([run([[165, 30]])]).within, null);
});

if (failures) {
  console.log(`${failures} failed`);
  process.exit(1);
}

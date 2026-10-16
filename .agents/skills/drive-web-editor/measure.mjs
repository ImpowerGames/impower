// `driver.mjs measure`: how long the Game Preview takes to paint a highlighted
// autocomplete suggestion, or an accepted edit, at one line of a project
// (#646, #647). See references/performance.md for running it and reading it.
//
// The pure parts (argument parsing, attributing a result to the key press
// that requested it, the summary) are exported for measure.test.mjs; `measure`
// drives the browser through helpers the driver passes in, so this file never
// imports the driver and importing it never launches anything.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// What a structural edit inserts by default: a plain dialogue line, which
// needs nothing the project defines. The worker benchmark inserts the same
// line (`STRUCTURAL_TEXT` in scripts/bench/preview-bench.mjs, which this file
// does not import so that it runs without scripts/), and
// preview-fixture.test.mjs holds the two equal (#1672).
export const STRUCTURAL_TEXT = "Just one more thing.";

export const MEASURE_USAGE = [
  "measure options:",
  "  --project <dir-or-zip>  the project to measure; seeded into a browser profile of this run's own",
  "  --fixture               generate the fixture project (scripts/bench/preview-fixture.mjs) instead",
  "  --line <N>              the line of main.sd, counting from one (--fixture: its target line)",
  "  --word <text>           the word on that line to delete so the list offers every candidate",
  "  --samples <K>           measured samples (default 10)",
  "  --warmup <W>            discarded samples first (default 2)",
  "  --edit                  accept a suggestion per sample and time the real compile instead",
  "  --burst                 type --text at the end of --line, a key every 80 to 120 ms, per sample, and count",
  "                          the keystroke compiles it caused (--word is not needed)",
  "  --structural            insert a dialogue line after --line, at its indentation, then remove it, alternating,",
  "                          one per sample, and time each like --edit (--word is not needed)",
  "  --text <text>           what a burst types (default: a 52-character clause, about five seconds), or the",
  `                          line --structural inserts after the indentation (default "${STRUCTURAL_TEXT}")`,
  "  --indent <n>            with --structural, the inserted line's indentation in spaces instead of --line's own",
  "  --screenshots <dir>     with --structural, also write before.png, inserted.png (after the first insert painted)",
  "                          and restored.png (after the run put the document back) into <dir>",
  "  --timeout <ms>          how long one sample may take before it is a failure (default 20000)",
  "  --settle <ms>           wait after each result so its trailing measures arrive (default 1500)",
  "  --json <file>           also write the full report, with the raw event log of every sample",
  "  --headed                run a visible browser instead of headless",
  "  --heap                  also read the page's heap, collected, before the list opens and after it closes",
];

function value(args, i, name) {
  const v = args[i + 1];
  if (v == null || v === "" || v.startsWith("--")) throw new Error(`${name} needs a value`);
  return v;
}
function integer(text, name, min) {
  const n = Number(text);
  if (!Number.isInteger(n) || n < min) throw new Error(`${name} must be an integer of at least ${min}`);
  return n;
}

export function parseMeasureArgs(args) {
  const out = { samples: 10, warmup: 2, edit: false, timeout: 20_000, settle: 1500, headed: false };
  for (let i = 0; i < args.length; i++) {
    const name = args[i];
    switch (name) {
      case "--project":
        out.project = value(args, i++, name);
        break;
      case "--fixture":
        out.fixture = true;
        break;
      case "--line":
        out.line = integer(value(args, i++, name), name, 1);
        break;
      case "--word":
        out.word = value(args, i++, name);
        break;
      case "--samples":
        out.samples = integer(value(args, i++, name), name, 1);
        break;
      case "--warmup":
        out.warmup = integer(value(args, i++, name), name, 0);
        break;
      case "--edit":
        out.edit = true;
        break;
      case "--burst":
        out.burst = true;
        break;
      case "--structural":
        out.structural = true;
        break;
      case "--indent":
        out.indent = integer(value(args, i++, name), name, 0);
        break;
      case "--screenshots":
        out.screenshots = value(args, i++, name);
        break;
      case "--text":
        out.text = value(args, i++, name);
        break;
      case "--timeout":
        out.timeout = integer(value(args, i++, name), name, 1);
        break;
      case "--settle":
        out.settle = integer(value(args, i++, name), name, 0);
        break;
      case "--json":
        out.json = value(args, i++, name);
        break;
      case "--headed":
        out.headed = true;
        break;
      case "--heap":
        out.heap = true;
        break;
      default:
        throw new Error(`unknown measure argument ${name}`);
    }
  }
  if (out.project && out.fixture) throw new Error("--project and --fixture are exclusive");
  if (!out.project && !out.fixture) throw new Error("measure needs --project <dir-or-zip> or --fixture");
  if ([out.edit, out.burst, out.structural].filter(Boolean).length > 1) throw new Error("--edit, --burst and --structural are exclusive");
  if (out.text != null && !out.burst && !out.structural) throw new Error("--text needs --burst or --structural");
  if (out.structural && out.text != null && (!out.text.trim() || /[\r\n]/.test(out.text))) throw new Error("--text is one line of text");
  if (out.screenshots != null && !out.structural) throw new Error("--screenshots needs --structural");
  if (out.indent != null && !out.structural) throw new Error("--indent needs --structural");
  if (out.burst || out.structural) {
    if (out.project && out.line == null) throw new Error(`--project ${out.burst ? "--burst" : "--structural"} needs --line`);
  } else if (out.project && (out.line == null || out.word == null)) throw new Error("--project needs --line and --word");
  return out;
}

export const BURST_TEXT = " and then the storm broke over the old house at last";
// The pause after each key of a burst, cycled: 80 to 120 ms, in an order that
// is the same on every run so two runs type alike.
export const BURST_GAPS = [100, 85, 115, 90, 120, 80, 105, 95, 110];

// One burst of typing. `events` is the page's log from just before its first
// key: the keys and the player frame's measures. A keystroke compile is a
// `workspace compile` measure that started at or after the first key. Its
// result is stale on arrival when a key was pressed after it started and
// before it returned, since that key's text is not in it. `busyShare` is the
// part of the burst (first key to last) during which at least one compile ran;
// `maxConcurrent` is the most compiles running at once; `longestWithoutCompile`
// is the longest stretch of the burst in which no compile started, which the
// max-wait bounds; `lastKeyToCompiled` runs from the last key to the end of the
// first compile that started after it, the text as typed compiled.
//
// A key's time is when it was pressed (`ts`, the event's time stamp), and
// `inputDelay` is how long the page took to get to it; `longtaskMs` sums the
// player frame's long tasks from the first key to the last key handled. Those
// two say whether the editor kept up with the typing.
export function analyzeBurst(events) {
  const pressed = events.filter((e) => e.kind === "key");
  const keys = pressed.map((e) => e.ts ?? e.t).sort((a, b) => a - b);
  if (keys.length < 2) return { failure: `${keys.length} keydown(s) were recorded` };
  const delays = pressed.map((e) => ms(e.t - (e.ts ?? e.t))).sort((a, b) => a - b);
  const handled = Math.max(...pressed.map((e) => e.t));
  const first = keys[0];
  const last = keys.at(-1);
  const compiles = events
    .filter((e) => e.kind === "measure" && /\bworkspace compile\b/.test(e.name) && e.start >= first - 1)
    .map((e) => ({ start: e.start, end: e.start + e.dur }))
    .sort((a, b) => a.start - b.start);
  const gaps = keys.slice(1).map((t, i) => t - keys[i]).sort((a, b) => a - b);
  let busy = 0;
  let reach = first;
  for (const c of compiles) {
    const from = Math.max(c.start, reach);
    const to = Math.min(c.end, last);
    if (to > from) busy += to - from;
    reach = Math.max(reach, c.end);
  }
  let maxConcurrent = 0;
  for (const c of compiles) {
    const running = compiles.filter((o) => o.start <= c.start && o.end > c.start).length;
    maxConcurrent = Math.max(maxConcurrent, running);
  }
  const starts = compiles.filter((c) => c.start <= last).map((c) => c.start);
  const marks = [first, ...starts, last];
  const longestWithoutCompile = Math.max(...marks.slice(1).map((t, i) => t - marks[i]));
  const final = compiles.find((c) => c.start >= last);
  const sample = {
    keys: keys.length,
    burstMs: ms(last - first),
    keyGap: { median: ms(gaps[Math.floor(gaps.length / 2)]), max: ms(gaps.at(-1)) },
    inputDelay: { median: delays[Math.floor(delays.length / 2)], max: delays.at(-1) },
    longtaskMs: ms(events.filter((e) => e.kind === "longtask" && e.start >= first && e.start <= handled).reduce((sum, e) => sum + e.dur, 0)),
    compiles: compiles.length,
    compilesDuringBurst: starts.length,
    staleOnArrival: compiles.filter((c) => keys.some((t) => t > c.start && t <= c.end)).length,
    maxConcurrent,
    busyShare: Math.round((busy / (last - first)) * 1000) / 1000,
    longestWithoutCompile: ms(longestWithoutCompile),
    compileMs: stats(compiles.map((c) => ms(c.end - c.start)).sort((a, b) => a - b)),
    lastKeyToCompiled: final ? ms(final.end - last) : null,
  };
  if (!final) sample.failure = "no workspace compile started after the last key";
  return sample;
}

const stats = (list) => (list.length ? { min: list[0], median: list[Math.floor(list.length / 2)], max: list.at(-1) } : null);

const BURST_FIGURES = ["burstMs", "inputDelayMedian", "inputDelayMax", "longtaskMs", "compiles","compilesDuringBurst", "staleOnArrival", "maxConcurrent", "busyShare", "longestWithoutCompile", "lastKeyToCompiled"];

export function summarizeBurst(samples) {
  const passed = samples.filter((s) => !s.failure);
  return {
    samples: samples.length,
    failures: samples.length - passed.length,
    ...Object.fromEntries(
      BURST_FIGURES.map((name) => {
        const read = (s) => (name === "inputDelayMedian" ? s.inputDelay?.median : name === "inputDelayMax" ? s.inputDelay?.max : s[name]);
        return [name, stats(passed.map(read).sort((a, b) => a - b))];
      }),
    ),
  };
}

// A measure's name without the document URI the workspace appends, so the
// same phase sums across samples: `player workspace previewCompile file:///x`
// becomes `player workspace previewCompile`.
export const phaseName = (name) =>
  name
    .split(" ")
    .filter((part) => !part.includes("://"))
    .join(" ");

// The page's record of how the worker displayed a preview (#657): `beat`, or
// `full` and the reason the display could not be beat-only.
const DISPLAY_PATH = /^player displayPreview path (.+)$/;

// How each display the sample's request answered went, in order.
function pathsBetween(events, from, to) {
  return events
    .filter((e) => e.kind === "measure" && e.start >= from - 1 && e.start <= to)
    .map((e) => DISPLAY_PATH.exec(e.name)?.[1])
    .filter(Boolean);
}

function phasesBetween(events, from, to) {
  const phases = {};
  for (const e of events) {
    if (e.kind !== "measure" || e.start < from - 1 || e.start > to) continue;
    if (DISPLAY_PATH.test(e.name)) continue;
    const name = phaseName(e.name);
    phases[name] = (phases[name] ?? 0) + e.dur;
  }
  for (const name of Object.keys(phases)) phases[name] = ms(phases[name]);
  return phases;
}
const longtasksFrom = (events, from) => events.filter((e) => e.kind === "longtask" && e.start >= from - 1).map((e) => Math.round(e.dur));
const ms = (n) => Math.round(n * 10) / 10;

// One highlighted suggestion. `events` is the page's log for one ArrowDown,
// in page time: the key, the `textDocument/previewCompletion` it produced,
// every `preview/didChangeGameState`, and the player frame's measures and long
// tasks. The result belongs to the key only when its `completion.request` is
// the request that key produced: a state carrying another request number is a
// late answer to an earlier highlight and is never counted. A sample without
// its answer is a failure with a reason, not a missing row, and so is an
// answer painted anywhere but `target` ({ uri, line }, the line counting from
// zero as the protocol does), since that is not the measured line.
export function attributePreviewSample(events, target, key = "ArrowDown") {
  const press = events.find((e) => e.kind === "key" && e.key === key);
  if (!press) return { failure: `no ${key} keydown was recorded` };
  const request = events.find((e) => e.kind === "request" && e.state === "focus" && e.t >= press.t);
  if (!request) return { failure: "the key produced no textDocument/previewCompletion" };
  const answer = events.find(
    (e) => e.kind === "state" && e.t >= request.t && e.completion?.request === request.request && (e.completion.status === "showing" || e.completion.status === "unavailable"),
  );
  const base = { request: request.request, edit: request.edit ?? null, keyToRequest: ms(request.t - press.t) };
  if (!answer) return { ...base, failure: `no preview/didChangeGameState answered request ${request.request}` };
  const phases = phasesBetween(events, press.t, answer.t);
  if (answer.completion.status === "unavailable") return { ...base, status: "unavailable", phases, failure: `the preview reported request ${request.request} unavailable` };
  const elsewhere = offTarget(answer.position, target);
  if (elsewhere) return { ...base, status: "showing", phases, failure: `request ${request.request} was painted at ${elsewhere}` };
  return { ...base, status: "showing", ms: ms(answer.t - press.t), phases, paths: pathsBetween(events, press.t, answer.t), longtasks: longtasksFrom(events, press.t) };
}

// Where a position is, when it is not `target`; null when it is.
function offTarget(position, target) {
  if (position?.uri === target.uri && position?.line === target.line) return null;
  const where = position ? `${position.uri} line ${position.line + 1}` : "no position";
  return `${where}, not ${target.uri} line ${target.line + 1}`;
}

// One accepted edit. The clock starts at the compile the edit caused (the
// first `workspace compile` measure to start after the Enter keydown), since
// the editor holds a typed change back before sending it, and stops at the
// first state carrying a program newer than `versionBefore` with a position,
// which is the preview painting the edited document; that position has to be
// `target`, as for a suggestion. `ms` is that compile clock, the one #646's
// criterion reads. Beside it, `msFromKey` runs from the Enter keydown to the
// same paint, the clock a suggestion's `ms` uses, and `debounce` from the
// keydown to the compile's start (the editor's hold and its request latency),
// so `msFromKey - debounce` is `ms` within the rounding.
export function attributeEditSample(events, versionBefore, target, key = "Enter") {
  const press = events.find((e) => e.kind === "key" && e.key === key);
  if (!press) return { failure: `no ${key} keydown was recorded` };
  const compile = events.find((e) => e.kind === "measure" && e.start >= press.t && /\bworkspace compile\b/.test(e.name));
  const painted = events.find((e) => e.kind === "state" && e.t >= press.t && e.programVersion != null && e.programVersion > (versionBefore ?? -1) && e.position != null);
  if (!compile) return { failure: "the edit started no workspace compile" };
  if (!painted) return { failure: `no preview/didChangeGameState carried a program newer than version ${versionBefore}` };
  const elsewhere = offTarget(painted.position, target);
  if (elsewhere) return { programVersion: painted.programVersion, failure: `program ${painted.programVersion} was painted at ${elsewhere}` };
  return {
    programVersion: painted.programVersion,
    ms: ms(painted.t - compile.start),
    msFromKey: ms(painted.t - press.t),
    debounce: ms(compile.start - press.t),
    phases: phasesBetween(events, press.t, painted.t),
    paths: pathsBetween(events, press.t, painted.t),
    longtasks: longtasksFrom(events, press.t),
  };
}

// The key a structural sample's clock starts from: the insert goes in as one
// `insertText` with no keydown of its own, so the run records this name in
// the key's place just before it; the removal is a real Backspace (#1672).
export const STRUCTURAL_KEYS = { insert: "insertText", remove: "Backspace" };

// One structural edit, timed as an accepted edit is. The line count changes
// with every sample, so the line the paint has to be at is the one the edit
// left the caret on, which the caller passes as `target`: the inserted line
// after an insert, the measured line after a removal. A state painted at the
// line the other direction would have left fails the sample, so a paint of the
// previous document is never counted as this edit's.
export function attributeStructuralSample(events, versionBefore, target, direction) {
  const key = STRUCTURAL_KEYS[direction];
  if (!key) return { direction, failure: `unknown structural direction ${direction}` };
  return { direction, ...attributeEditSample(events, versionBefore, target, key) };
}

// The clocks a sample can carry besides `ms`: an accepted edit's key clock and
// debounce, and a suggestion's key-to-request time. Each is summarized over the
// samples that did not fail and carry it, and left out when none does.
const CLOCKS = ["msFromKey", "debounce", "keyToRequest"];

export function summarize(samples) {
  const passed = samples.filter((s) => !s.failure);
  const times = passed.map((s) => s.ms).sort((a, b) => a - b);
  const phaseNames = [...new Set(samples.flatMap((s) => Object.keys(s.phases ?? {})))];
  const clocks = CLOCKS.map((name) => [name, passed.filter((s) => s[name] != null).map((s) => s[name]).sort((a, b) => a - b)]).filter(([, list]) => list.length);
  // How the display each sample painted went: the last one its answer
  // carried, counted over the samples that did not fail.
  const paths = {};
  for (const s of passed) {
    const path = s.paths?.at(-1) ?? "unrecorded";
    paths[path] = (paths[path] ?? 0) + 1;
  }
  return {
    samples: samples.length,
    failures: samples.filter((s) => s.failure).length,
    ms: stats(times),
    paths,
    ...Object.fromEntries(clocks.map(([name, list]) => [name, stats(list)])),
    phases: Object.fromEntries(
      phaseNames.map((name) => [
        name,
        stats(
          samples
            .filter((s) => !s.failure)
            .map((s) => s.phases?.[name] ?? 0)
            .sort((a, b) => a - b),
        ),
      ]),
    ),
  };
}

// Whether a finished report is a failed run: an error, a line left unrestored,
// or any failed sample, warm-up included. A warm-up sample is left out of the
// timings, but one that failed has already shown the preview not answering at
// the measured line, so it fails the run like a measured one.
export function runFailed(report) {
  return Boolean(report.error || report.restoredMatches === false || report.samples.some((s) => s.failure));
}

// The line with `word` replaced by whatever now sits between the text before
// and after it, or null when the line no longer has that shape.
export function replacedSpan(original, word, current) {
  const at = original.indexOf(word);
  const before = original.slice(0, at);
  const after = original.slice(at + word.length);
  if (!current.startsWith(before) || !current.endsWith(after) || current.length < before.length + after.length) return null;
  return { start: before.length, text: current.slice(before.length, current.length - after.length) };
}

// The one edit that turns `current` back into `original`: the whole lines
// of `current` between the lines the two share at their start and at their
// end, as a protocol range (lines and characters from zero), and the lines
// of `original` that go there. Null when the two are equal. A structural run
// puts its document back with it whatever state a failed sample left
// (#1672).
//
// The run types the text in, and typed text passes the editor's input
// handlers, which add a closing bracket to a typed opening one. Whole lines
// with a line break are text no handler rewrites (an opening token never
// ends in a line break), so the text is never shorter than a line: it is
// empty, when lines only go, or holds a line break, except when the two
// documents share no line at either end.
export function restoreSpan(current, original) {
  if (current === original) return null;
  const now = current.split("\n");
  const was = original.split("\n");
  let head = 0;
  while (head < now.length && head < was.length && now[head] === was[head]) head++;
  let tail = 0;
  while (tail < now.length - head && tail < was.length - head && now[now.length - 1 - tail] === was[was.length - 1 - tail]) tail++;
  const lines = was.slice(head, was.length - tail);
  if (tail > 0) {
    // Each replaced line with the break after it, up to the first shared
    // line at the end.
    return { range: { start: { line: head, character: 0 }, end: { line: now.length - tail, character: 0 } }, text: lines.map((l) => `${l}\n`).join("") };
  }
  if (head > 0) {
    // To the end of the document: from the end of the last shared line, so
    // the text starts with the break.
    const start = { line: head - 1, character: now[head - 1].length };
    return { range: { start, end: { line: now.length - 1, character: now.at(-1).length } }, text: lines.map((l) => `\n${l}`).join("") };
  }
  return { range: { start: { line: 0, character: 0 }, end: { line: now.length - 1, character: now.at(-1).length } }, text: original };
}

// ---------------------------------------------------------------- browser ---

const send = (page, method, params = {}, timeout = 30_000) =>
  page.evaluate(({ method, params, timeout }) => window.__editorProtocol.send({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }, timeout), { method, params, timeout });
const notify = (page, method, params = {}) => page.evaluate(({ method, params }) => window.__editorProtocol.send({ jsonrpc: "2.0", method, params }), { method, params });
const readLine = async (page, line) => (await send(page, "editor/read")).textDocument.text.split("\n")[line - 1];

// Records keys and protocol traffic on the editor page, and the player
// frame's measures and long tasks shifted onto the editor page's clock.
async function instrument(page) {
  return page.evaluate(() => {
    const log = (window.__measureLog = []);
    window.__measureState = null;
    const origin = performance.timeOrigin;
    // `ts` is when the key was pressed, `t` when the page got to handle it.
    window.addEventListener("keydown", (e) => log.push({ t: performance.now(), ts: e.timeStamp, kind: "key", key: e.key }), true);
    window.__editorProtocol.subscribe((m) => {
      if (m.method === "textDocument/previewCompletion") {
        log.push({ t: performance.now(), kind: "request", request: m.params.request, state: m.params.state, edit: m.params.contentChanges?.[0]?.text });
      } else if (m.method === "preview/didChangeGameState") {
        window.__measureState = m.params;
        log.push({ t: performance.now(), kind: "state", completion: m.params.completion, position: m.params.position, programVersion: m.params.programVersion });
      } else if (m.method === "textDocument/didChange" || m.method === "textDocument/didSelect") {
        // When the editor published the edit and its selection, which the
        // player's workspace hears after them (#1881).
        log.push({ t: performance.now(), kind: "editor", method: m.method, version: m.params.textDocument?.version });
      }
    });
    let observed = 0;
    for (const frame of document.querySelectorAll("iframe")) {
      try {
        const w = frame.contentWindow;
        const shift = w.performance.timeOrigin - origin;
        new w.PerformanceObserver((list) => {
          for (const e of list.getEntries()) log.push({ t: e.startTime + e.duration + shift, kind: "measure", name: e.name, start: e.startTime + shift, dur: e.duration });
        }).observe({ entryTypes: ["measure"] });
        try {
          new w.PerformanceObserver((list) => {
            for (const e of list.getEntries()) log.push({ t: e.startTime + shift, kind: "longtask", start: e.startTime + shift, dur: e.duration });
          }).observe({ entryTypes: ["longtask"] });
        } catch {}
        observed++;
      } catch {}
    }
    return observed;
  });
}
const takeLog = (page) => page.evaluate(() => window.__measureLog.splice(0));

// Waits until `done(log)` holds in the page or `timeout` passes; either way
// the caller attributes whatever arrived, so a timeout is a reported failure.
const waitInPage = (page, predicate, arg, timeout) =>
  page.waitForFunction(predicate, arg, { timeout, polling: 25 }).then(
    () => true,
    () => false,
  );

const answeredLatest = (key) => {
  const log = window.__measureLog;
  const press = log.find((e) => e.kind === "key" && e.key === key);
  const request = press && log.find((e) => e.kind === "request" && e.state === "focus" && e.t >= press.t);
  // The same answer attributePreviewSample accepts, which cannot import here.
  return (
    !!request && log.some((e) => e.kind === "state" && e.t >= request.t && e.completion?.request === request.request && (e.completion.status === "showing" || e.completion.status === "unavailable"))
  );
};
const answeredAny = () => {
  const log = window.__measureLog;
  return log.some((r) => r.kind === "request" && r.state === "focus" && log.some((e) => e.kind === "state" && e.completion?.request === r.request && e.completion.status !== "preparing"));
};
const paintedAfter = (versionBefore) => window.__measureLog.some((e) => e.kind === "state" && e.programVersion != null && e.programVersion > (versionBefore ?? -1) && e.position != null);

// The editor page's JavaScript heap after two forced collections, in MB. The
// player is a same-origin frame of the page in a measured run, so its heap is
// this one; its worker's is not.
async function pageHeapMB(page) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("HeapProfiler.collectGarbage");
    await cdp.send("HeapProfiler.collectGarbage");
    const { usedSize } = await cdp.send("Runtime.getHeapUsage");
    return Math.round((usedSize / (1024 * 1024)) * 10) / 10;
  } finally {
    await cdp.detach().catch(() => {});
  }
}

// A browser profile that exists only for this run, so another session's
// `verify --sd` or `--project` cannot replace the project being measured, and
// this run cannot replace theirs. Removed afterwards.
export function privateLaunch(deps, dir) {
  return async ({ headless }) => {
    const { chromium } = await deps.importPlaywright();
    const executablePath = deps.resolveChromiumExecutablePath(chromium, { headless });
    deps.log(`browser: ${deps.chromiumChoiceLine()}`);
    return chromium.launchPersistentContext(dir, {
      headless,
      viewport: { width: 1600, height: 1000 },
      args: ["--autoplay-policy=no-user-gesture-required"],
      ...(executablePath ? { executablePath } : {}),
    });
  };
}

export async function measure(args, deps) {
  let options;
  try {
    options = parseMeasureArgs(args);
  } catch (error) {
    return deps.die([error.message, "", ...MEASURE_USAGE].join("\n"));
  }
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "impower-measure-"));
  const report = { mode: options.burst ? "burst" : options.structural ? "structural" : options.edit ? "edit" : "preview", line: options.line, word: options.word, samples: [], warmup: options.warmup };
  let pageConsole = [];
  try {
    let project = options.project;
    if (options.fixture) {
      const { writePreviewFixture } = await import("../../../scripts/bench/preview-fixture.mjs");
      project = path.join(scratch, "fixture");
      const target = writePreviewFixture(project);
      options.line ??= target.line;
      if (!options.burst && !options.structural) options.word ??= target.word;
      report.line = options.line;
      report.word = options.word;
    }
    report.project = path.resolve(project);
    await deps.withEditor(
      async ({ page, url, consoleLines }) => {
        pageConsole = consoleLines;
        await deps.openEditorPage(page, url);
        await deps.waitForApp(page);
        report.seed = await deps.seedProject(page, project, { expectMainSd: true });
        if (report.seed.reason) throw new Error(`seed failed: ${report.seed.reason}`);
        await deps.reloadEditorPage(page);
        await deps.waitForApp(page);
        await deps.switchScreen(page, "logic", { followedByMain: true }).catch(() => {});
        await deps.switchScreen(page, "main").catch(() => {});
        await deps.scriptEditorPresent(page, 60_000);
        await deps.settleEditor(page, 120_000);
        // Every sample would fail without a mounted game and a loaded program,
        // so either missing stops the run with its cause.
        const mount = await deps.waitForGame(page);
        report.gameMounted = mount.mounted;
        if (!mount.mounted) throw new Error(`the game never mounted, so the Game Preview is blank; try \`down\` then \`up\`${mount.error ? ` (on the reload retry: ${mount.error})` : ""}`);
        report.program = await deps.waitForProgram(page, 180_000);
        if (!report.program.loaded) throw new Error(`the player loaded no program within 180 s${report.program.errors ? `; the open document has ${report.program.errors} error(s)` : ""}`);

        const { uri, text } = (await send(page, "editor/read")).textDocument;
        report.uri = uri;
        const lineText = text.split("\n")[options.line - 1];
        report.lineText = lineText ?? null;
        if (lineText == null) throw new Error(`${uri} has no line ${options.line}`);
        // A burst types at the end of the line, and a structural edit inserts
        // after it; neither needs a word.
        const wordAt = options.burst || options.structural ? lineText.length : lineText.indexOf(options.word);
        if (wordAt < 0) throw new Error(`"${options.word}" is not on line ${options.line} of ${uri}: ${JSON.stringify(lineText)}`);
        const target = { uri, line: options.line - 1 };
        report.playerFramesObserved = await instrument(page);
        // The player frame is reachable only on a same-origin launch; without
        // it `ms` is still measured but no sample has phases or long tasks.
        if (report.playerFramesObserved === 0) report.warning = "no player frame could be observed (a cross-origin launch?), so samples carry no phases or long tasks";

        const at = (character) => ({ line: options.line - 1, character });
        const select = (from, to, extra = {}) => notify(page, "editor/select", { textDocument: { uri }, range: { start: at(from), end: at(to) }, takeFocus: true, ...extra });
        // Put the preview on the line and let it settle there first.
        await select(wordAt, wordAt, { scrollIntoView: "center" });
        await page.waitForTimeout(6000);

        let span = { start: wordAt, text: options.word };
        // Opening the list highlights its first option, which the preview
        // answers like any other. A list can close again while its first
        // answer is pending, and an ArrowDown sent then moves the caret
        // instead, so the list counts as open only once that answer has
        // arrived and the list is still there; otherwise it is reopened.
        report.reopenedLists = 0;
        const openList = async () => {
          await select(span.start, span.start + span.text.length);
          await page.keyboard.press("Backspace");
          await page.waitForTimeout(4000);
          for (let attempt = 1; ; attempt++) {
            await takeLog(page);
            await page.keyboard.press("Control+Space");
            await deps.waitLanguageSurface(page, "completion", { timeout: 15_000 });
            await waitInPage(page, answeredAny, null, options.timeout);
            await page.waitForTimeout(500);
            const popup = await deps.readLanguageSurface(page, "completion");
            if (popup.popupPresent) return popup;
            if (attempt === 3) throw new Error("the completion list closed on each of three openings with Ctrl+Space");
            report.reopenedLists++;
          }
        };

        const total = options.warmup + options.samples;
        if (options.burst) {
          const text = options.text ?? BURST_TEXT;
          report.text = text;
          const end = lineText.length;
          const compiledAfterLastKey = () => {
            const log = window.__measureLog;
            const keys = log.filter((e) => e.kind === "key");
            const lastKey = keys.at(-1)?.t ?? Infinity;
            return log.some((e) => e.kind === "measure" && /\bworkspace compile\b/.test(e.name) && e.start >= lastKey);
          };
          for (let i = 0; i < total; i++) {
            try {
              await select(end, end);
              await page.waitForTimeout(options.settle + 2500);
              await takeLog(page);
              // Keys go out on a schedule, as a person types, rather than each
              // after the page has handled the last: a busy page then shows as
              // input delay instead of slowing the typing down.
              const typed = [];
              const startedAt = Date.now();
              let at = 0;
              for (let k = 0; k < text.length; k++) {
                const wait = startedAt + at - Date.now();
                if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
                typed.push(page.keyboard.type(text[k]));
                at += BURST_GAPS[k % BURST_GAPS.length];
              }
              await Promise.all(typed);
              await waitInPage(page, compiledAfterLastKey, null, options.timeout);
              await page.waitForTimeout(options.settle);
              const events = await takeLog(page);
              report.samples.push({ index: i + 1, warmup: i < options.warmup, ...analyzeBurst(events), events });
            } finally {
              // Take the typed text out again, whether or not the burst finished.
              const current = await readLine(page, options.line);
              if (current !== lineText && current.startsWith(lineText)) {
                await select(end, current.length);
                await page.keyboard.press("Backspace");
              }
              await page.waitForTimeout(3000);
            }
            report.restored = await readLine(page, options.line);
            report.restoredMatches = report.restored === lineText;
            if (!report.restoredMatches) throw new Error(`line ${options.line} was not put back after burst ${i + 1}: ${JSON.stringify(report.restored)}`);
          }
        } else if (options.structural) {
          // Each sample inserts a line after the measured one, at its
          // indentation, or removes it again, alternately (#1672). The
          // document is compared whole, so `restoredMatches` says it came
          // back byte for byte, not merely that the line did.
          const indentation = options.indent != null ? " ".repeat(options.indent) : (/^\s*/.exec(lineText)?.[0] ?? "");
          const inserted = indentation + (options.text ?? STRUCTURAL_TEXT);
          report.text = options.text ?? STRUCTURAL_TEXT;
          report.inserted = inserted;
          report.linesBefore = text.split("\n").length;
          const lines = text.split("\n");
          const withInsert = [...lines.slice(0, options.line), inserted, ...lines.slice(options.line)].join("\n");
          const end = lineText.length;
          // The line the edit leaves the caret on, which is where the
          // preview has to paint: the inserted line, or the measured one.
          const targets = { insert: { uri, line: options.line }, remove: target };
          // The insert's range: from the end of the measured line to the end
          // of the inserted one.
          const selectInserted = () => notify(page, "editor/select", { textDocument: { uri }, range: { start: at(end), end: { line: options.line, character: inserted.length } }, takeFocus: true });
          const readText = async () => (await send(page, "editor/read")).textDocument.text;
          const shoot = async (name) => {
            if (!options.screenshots) return;
            fs.mkdirSync(options.screenshots, { recursive: true });
            const file = path.resolve(options.screenshots, `${name}.png`);
            await page.screenshot({ path: file, fullPage: false });
            (report.screenshots ??= []).push(file);
          };
          try {
            for (let i = 0; i < total; i++) {
              const direction = i % 2 === 0 ? "insert" : "remove";
              const expected = direction === "insert" ? text : withInsert;
              const current = await readText();
              if (current !== expected) throw new Error(`before structural sample ${i + 1} (${direction}) the document is not the one the run left`);
              // The caret where the edit goes, and the preview settled there
              // first, so the paint the clock stops at is the edit's own.
              if (direction === "insert") await select(end, end);
              else await selectInserted();
              await page.waitForTimeout(options.settle + 1500);
              if (i === 0) await shoot("before");
              const versionBefore = await page.evaluate(() => window.__measureState?.programVersion ?? null);
              await takeLog(page);
              if (direction === "insert") {
                await page.evaluate((key) => window.__measureLog.push({ t: performance.now(), ts: performance.now(), kind: "key", key }), STRUCTURAL_KEYS.insert);
                await page.keyboard.insertText(`\n${inserted}`);
              } else {
                await page.keyboard.press(STRUCTURAL_KEYS.remove);
              }
              await waitInPage(page, paintedAfter, versionBefore, options.timeout);
              await page.waitForTimeout(options.settle);
              const events = await takeLog(page);
              if (i === 0) await shoot("inserted");
              const after = await readText();
              const sample = { index: i + 1, warmup: i < options.warmup, lines: after.split("\n").length, ...attributeStructuralSample(events, versionBefore, targets[direction], direction), events };
              if (direction === "remove") sample.restoredMatches = after === text;
              const wanted = direction === "insert" ? withInsert : text;
              if (after !== wanted && !sample.failure) sample.failure = direction === "insert" ? "the document after the insert is not the measured one with the line added" : "the removal did not give the document back as it was";
              report.samples.push(sample);
              if (after !== wanted) break;
            }
          } finally {
            // Take the inserted line out again whether or not the samples
            // finished, then compare the whole document with the one the run
            // found; a restore that fails is reported beside the error that
            // stopped the run rather than replacing it.
            try {
              const span = restoreSpan(await readText(), text);
              if (span) {
                await notify(page, "editor/select", { textDocument: { uri }, range: span.range, takeFocus: true });
                if (span.text) await page.keyboard.insertText(span.text);
                else await page.keyboard.press("Backspace");
                await page.waitForTimeout(3000);
              }
              const restored = await readText();
              report.restoredMatches = restored === text;
              report.linesAfter = restored.split("\n").length;
              report.restored = await readLine(page, options.line);
            } catch (error) {
              report.restoreError = String(error?.message ?? error);
              report.restoredMatches = false;
            }
            if (options.screenshots) {
              // The caret back where the run started, so the picture shows
              // the measured line and the preview at it.
              try {
                await select(end, end);
                await page.waitForTimeout(options.settle);
                await shoot("restored");
              } catch (error) {
                report.screenshotError = String(error?.message ?? error);
              }
            }
          }
        } else try {
          if (!options.edit) {
            if (options.heap) report.heapMB = { before: await pageHeapMB(page) };
            const popup = await openList();
            report.lineWithoutWord = await readLine(page, options.line);
            report.listLength = popup.options?.length ?? null;
            await page.waitForTimeout(options.settle + 2500);
            await takeLog(page);
            for (let i = 0; i < total; i++) {
              await page.keyboard.press("ArrowDown");
              await waitInPage(page, answeredLatest, "ArrowDown", options.timeout);
              await page.waitForTimeout(options.settle);
              const selected = (await deps.readLanguageSurface(page, "completion")).selected ?? null;
              const events = await takeLog(page);
              const sample = { index: i + 1, warmup: i < options.warmup, selected, ...attributePreviewSample(events, target), events };
              report.samples.push(sample);
            }
            await page.keyboard.press("Escape");
            await page.waitForTimeout(1500);
            if (options.heap) {
              // Once the closed list has put the real document back.
              await page.waitForTimeout(options.settle + 3000);
              report.heapMB.after = await pageHeapMB(page);
            }
          } else {
            for (let i = 0; i < total; i++) {
              await openList();
              // A different suggestion each time, answered before accepting it,
              // so no preview compile is still running when the clock starts.
              for (let k = 0; k <= i % 3; k++) {
                await takeLog(page);
                await page.keyboard.press("ArrowDown");
                await waitInPage(page, answeredLatest, "ArrowDown", options.timeout);
              }
              await page.waitForTimeout(options.settle);
              const list = await deps.readLanguageSurface(page, "completion");
              if (!list.popupPresent) throw new Error(`the completion list closed before sample ${i + 1} could accept a suggestion`);
              const versionBefore = await page.evaluate(() => window.__measureState?.programVersion ?? null);
              await takeLog(page);
              await page.keyboard.press("Enter");
              await waitInPage(page, paintedAfter, versionBefore, options.timeout);
              await page.waitForTimeout(options.settle);
              const events = await takeLog(page);
              const accepted = await readLine(page, options.line);
              const sample = { index: i + 1, warmup: i < options.warmup, selected: list.selected ?? null, line: accepted, ...attributeEditSample(events, versionBefore, target), events };
              report.samples.push(sample);
              const next = replacedSpan(lineText, options.word, accepted);
              if (!next) throw new Error(`line ${options.line} no longer has the measured shape: ${JSON.stringify(accepted)}`);
              span = next;
            }
          }
        } finally {
          // Put the word back where the run took it from, whether or not the
          // samples finished; a restore that fails is reported beside the
          // error that stopped the run rather than replacing it.
          try {
            await page.keyboard.press("Escape");
            const current = await readLine(page, options.line);
            const last = replacedSpan(lineText, options.word, current) ?? span;
            await select(last.start, last.start + last.text.length);
            await page.keyboard.type(options.word);
            await page.keyboard.press("Escape");
            await page.waitForTimeout(3000);
            report.restored = await readLine(page, options.line);
            report.restoredMatches = report.restored === lineText;
          } catch (error) {
            report.restoreError = String(error?.message ?? error);
            report.restoredMatches = false;
          }
        }
      },
      { headless: !options.headed, launch: privateLaunch(deps, path.join(scratch, "profile")) },
    );
  } catch (error) {
    report.error = String(error?.message ?? error);
  } finally {
    // The page's console, on every exit path, since it explains most failures.
    report.consoleErrors = pageConsole.filter((l) => /error/i.test(l)).slice(-10);
    fs.rmSync(scratch, { recursive: true, force: true });
  }

  const measured = report.samples.filter((s) => !s.warmup);
  report.summary = options.burst ? summarizeBurst(measured) : summarize(measured);
  // An insert and a removal are different edits, so each has its own figures
  // beside the ones over both (#1672).
  if (options.structural) report.summary.byDirection = Object.fromEntries(["insert", "remove"].map((d) => [d, summarize(measured.filter((s) => s.direction === d))]));
  report.summary.warmupFailures = report.samples.filter((s) => s.warmup && s.failure).length;
  if (options.json) fs.writeFileSync(options.json, JSON.stringify(report, null, 2));
  const printed = { ...report, samples: report.samples.map(({ events, ...rest }) => rest) };
  deps.log(JSON.stringify(printed, null, 2));
  if (runFailed(report)) process.exitCode = 1;
  return report;
}

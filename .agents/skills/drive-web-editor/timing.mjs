// `driver.mjs timing input` and `driver.mjs timing metronome`: whether a game
// running in the player's worker keeps time (#683). See
// references/performance.md for running them and reading them.
//
// `input` times a click on the page to the page handling the command the
// game sent back for it. `metronome` plays beats of one click and one flash
// and reads, for each, the beat's stamp, when the page scheduled the sound and
// whether its message arrived late, the first audible sample of the click
// from a sample-accurate tap on the mixer (`AudioProbe.startOnsetTap`), and
// the flash animation's start time. Each runs idle and then with the page's
// main thread loaded, in each switch position asked for.
//
// The pure parts (arguments, statistics, pairing a click with what it caused,
// pairing a beat with its onset and flash) are exported for timing.test.mjs;
// `timing` drives the browser through helpers the driver passes in, so this
// file never imports the driver and importing it never launches anything.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { privateLaunch } from "./measure.mjs";
import { buildInputFixture, buildMetronomeFixture, writeTimingFixture } from "./timing-fixture.mjs";

export const TIMING_USAGE = [
  "timing input|metronome [options]:",
  "  input                   clicks on a choice, each timed to the page handling the game's answer",
  "  metronome               beats of one click and one flash at --bpm, each onset and flash read against the beat's stamp",
  "  --samples <K>           measured samples per phase (default: input 200, metronome 100)",
  "  --warmup <W>            discarded samples first, per phase (default: input 10, metronome 4)",
  "  --load <ms>             the loaded phase burns this long on the page's main thread every frame (default 10; 0 skips it)",
  "  --worker-preview on|off|both  the switch positions to run, each in a browser of its own (default both, on first)",
  "  --bpm <n>               the metronome's tempo (default 120)",
  "  --timeout <ms>          how long one sample may take before it is a failure (default 5000)",
  "  --json <file>           also write the full report, with every sample",
  "  --headed                run a visible browser instead of headless",
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

export function parseTimingArgs(args) {
  const kind = args[0];
  if (kind !== "input" && kind !== "metronome") throw new Error("timing needs input or metronome first");
  const out = { kind, load: 10, positions: ["on", "off"], bpm: 120, timeout: 5000, headed: false };
  for (let i = 1; i < args.length; i++) {
    const name = args[i];
    switch (name) {
      case "--samples":
        out.samples = integer(value(args, i++, name), name, 1);
        break;
      case "--warmup":
        out.warmup = integer(value(args, i++, name), name, 0);
        break;
      case "--load":
        out.load = integer(value(args, i++, name), name, 0);
        break;
      case "--worker-preview": {
        const position = value(args, i++, name);
        if (!["on", "off", "both"].includes(position)) throw new Error("--worker-preview takes on, off or both");
        out.positions = position === "both" ? ["on", "off"] : [position];
        break;
      }
      case "--bpm":
        out.bpm = integer(value(args, i++, name), name, 1);
        break;
      case "--timeout":
        out.timeout = integer(value(args, i++, name), name, 1);
        break;
      case "--json":
        out.json = value(args, i++, name);
        break;
      case "--headed":
        out.headed = true;
        break;
      default:
        throw new Error(`unknown timing argument ${name}`);
    }
  }
  out.samples ??= kind === "input" ? 200 : 100;
  out.warmup ??= kind === "input" ? 10 : 4;
  return out;
}

const round = (n) => Math.round(n * 1000) / 1000;

/** Nearest-rank quantile of an ascending list. */
const quantile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];

/** min, median, p95, p99 and max of `values`, and the spread between the
 *  least and the greatest; null for an empty list. */
export function stats(values) {
  const sorted = values.filter((v) => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  return {
    n: sorted.length,
    min: round(sorted[0]),
    median: round(quantile(sorted, 0.5)),
    p95: round(quantile(sorted, 0.95)),
    p99: round(quantile(sorted, 0.99)),
    max: round(sorted.at(-1)),
    spread: round(sorted.at(-1) - sorted[0]),
  };
}

// ------------------------------------------------------------------ input ---

/**
 * One click. `record` is what the page logged from the moment before the
 * click: the DOM events it saw (`clicks`, each with the page's
 * `performance.now()` when a capturing listener saw it and the event's own
 * `timeStamp`) and every message the game sent it (`messages`, stamped as the
 * page's router took each one). The command the click caused is the first
 * message after the click; it has to answer the choice, or something else
 * the game was sending would be timed as the answer.
 *
 * With the game in the worker the record also holds, on the shared clock,
 * when the page posted each input to the game (`posted`) and when the worker
 * posted each of the game's messages (`sent`, each { at, method }), which
 * divide the time into the page's input reaching the game and being
 * answered, and the answer reaching the page's router. The worker's answer is
 * its first post after the click's of the answer's method. `timeOrigin` is
 * the page's `performance.timeOrigin`. With `requireWorker`, a sample whose
 * answer the worker probe did not record fails, since its figures would lack
 * the split they are read for.
 */
export function attributeInputSample(record, { requireWorker = false } = {}) {
  const click = record.clicks.find((c) => c.type === "click");
  if (!click) return { failure: "no click event reached the page" };
  const answer = record.messages.find((m) => m.t >= click.t);
  const quietBefore = record.previousMessageAt == null ? null : round(click.t - record.previousMessageAt);
  if (!answer) return { trusted: click.trusted, quietBefore, failure: "the game sent nothing after the click" };
  const out = {
    trusted: click.trusted,
    quietBefore,
    method: answer.method,
    ms: round(answer.t - click.t),
    fromTimeStamp: round(answer.t - click.timeStamp),
  };
  const post = record.posted?.find((p) => p.type === "click");
  const answered = post ? record.sent?.find((s) => s.at >= post.at && s.method === answer.method) : undefined;
  if (answered) {
    out.postedToAnswered = round(answered.at - post.at);
    out.answeredToHandled = round(record.timeOrigin + answer.t - answered.at);
  }
  if (!answer.answersChoice) return { ...out, failure: `the first message after the click (${answer.method}) does not touch a choice` };
  if (requireWorker && !answered) return { ...out, failure: "the worker probe recorded no post of the answer" };
  return out;
}

export function summarizeInput(samples) {
  const ok = samples.filter((s) => !s.failure);
  return {
    samples: samples.length,
    failures: samples.length - ok.length,
    ms: stats(ok.map((s) => s.ms)),
    fromTimeStamp: stats(ok.map((s) => s.fromTimeStamp)),
    postedToAnswered: stats(ok.map((s) => s.postedToAnswered)),
    answeredToHandled: stats(ok.map((s) => s.answeredToHandled)),
  };
}

// -------------------------------------------------------------- metronome ---

/**
 * The page's clock readings for one beat turned into rows. `beat` holds what
 * the page logged for one click:
 *
 * - `stamp`: the beat's start on the shared clock (ms since the epoch);
 * - `arrivedAt`: when its `audio/update` reached the page's router, page
 *   `performance.now()`;
 * - `due` and `currentTime`: the context times, in seconds, the audio manager
 *   was due to start the sound at and read when it handled the update; the
 *   sound starts at the later of the two;
 * - `outputTimestamp` and `outputLatency`: the context's
 *   `getOutputTimestamp()` and `outputLatency` read at that moment, which map
 *   the context's clock onto the page's;
 * - `flash`: the flash animation's `startTime` on the document timeline and
 *   the `performance.now()` it was set at, or null;
 * - `sentAt`: with the game in the worker, when the worker posted the
 *   `audio/update`, on the shared clock.
 *
 * `onset` is the tap's report the beat was paired with ({ contextTime,
 * frame, peak }), or null (`pairMetronome`). `timeOrigin` is the page's
 * `performance.timeOrigin`. With `requireWorker`, the game runs in the worker
 * and a beat whose post the worker probe did not record fails, since its
 * figures would lack the split they are read for.
 *
 * Every time here is when it reaches the listener: a context time is mapped
 * through the output timestamp, which gives the time it leaves the speakers.
 */
export function metronomeRow(beat, onset, timeOrigin, { requireWorker = false } = {}) {
  const ts = beat.outputTimestamp;
  const heard = (contextTime) => timeOrigin + ts.performanceTime + (contextTime - ts.contextTime) * 1000;
  const late = beat.currentTime > beat.due;
  const when = late ? beat.currentTime : beat.due;
  const row = {
    stamp: beat.stamp,
    arrivedMinusStamp: round(timeOrigin + beat.arrivedAt - beat.stamp),
    late,
    lateBy: late ? round((beat.currentTime - beat.due) * 1000) : 0,
    scheduledMinusStamp: round(heard(when) - beat.stamp),
    outputLatency: round(beat.outputLatency * 1000),
  };
  if (beat.sentAt != null) {
    row.sentMinusStamp = round(beat.sentAt - beat.stamp);
    row.transit = round(timeOrigin + beat.arrivedAt - beat.sentAt);
  } else if (requireWorker) {
    row.failure = "the worker probe recorded no post of the beat's audio/update";
  }
  if (onset) {
    const at = heard(onset.contextTime);
    row.frame = onset.frame;
    row.peak = round(onset.peak);
    row.onsetMinusStamp = round(at - beat.stamp);
    row.onsetMinusScheduled = round(at - heard(when));
    if (beat.flash) row.flashMinusOnset = round(timeOrigin + beat.flash.startTime - at);
  } else {
    row.failure ??= "no onset was heard for the beat's click";
  }
  if (beat.flash) {
    row.flashMinusStamp = round(timeOrigin + beat.flash.startTime - beat.stamp);
    row.flashSetLateBy = round(Math.max(0, beat.flash.setAt - beat.flash.startTime));
  } else {
    row.failure ??= "no flash animation was started for the beat";
  }
  return row;
}

/**
 * One row for every key the page pressed, so a key that started no beat is a
 * failed row rather than a missing one. What the page logged:
 *
 * - `keys`: the page `performance.now()` of each key, in order. A key owns
 *   what arrives from it to the next key.
 * - `beats`: each played sound, as `metronomeRow` reads it, without `flash`
 *   or `sentAt`. A key's beat is the first to arrive in its window; a second
 *   one fails the row, since the attribution would be a guess.
 * - `writes`: each stamped `ui/write-image` ({ t, time }). A beat's write is
 *   the one carrying its stamp.
 * - `anims`: each animation start time the page set ({ setAt, startTime,
 *   fresh }), where `fresh` says its target was never animated before. The
 *   flash is the first fresh one set from the beat's write to the end of the
 *   key's window, which is the enter animation of the layer the write made:
 *   the exit of the layer before it, and the target wrapper, animate elements
 *   that existed already. A write arrives after its key, so no two beats
 *   search the same stretch.
 * - `onsets`: the tap's reports. A beat's onset is the first one from 50 ms
 *   before the sound was due to 250 ms after, or to 50 ms before the next beat
 *   was due when that is sooner, so no two beats search the same stretch and
 *   a missing click is never credited with its neighbour's.
 * - `sends`: the worker's posts ({ at, method, time, channel }); a beat's is
 *   the `audio/update` carrying its stamp.
 */
export function pairMetronome({ keys, beats, writes, anims, onsets, sends = [], timeOrigin, requireWorker = false }) {
  const paired = keys.map((key, i) => {
    const end = keys[i + 1] ?? Infinity;
    const mine = beats.filter((b) => b.arrivedAt >= key && b.arrivedAt < end);
    if (mine.length === 0) return { failure: "the key started no beat" };
    const beat = mine[0];
    const write = writes.find((w) => w.time === beat.stamp);
    let flash = null;
    if (write) {
      const anim = anims.find((a) => a.fresh && a.setAt >= write.t && a.setAt < end);
      if (anim) flash = { startTime: anim.startTime, setAt: anim.setAt };
    }
    const sent = sends.find((s) => s.method === "audio/update" && s.time === beat.stamp);
    return { beat: { ...beat, flash, sentAt: sent?.at }, extra: mine.length - 1 };
  });
  const played = paired.filter((p) => p.beat);
  return paired.map((p) => {
    if (!p.beat) return p;
    const next = played[played.indexOf(p) + 1]?.beat;
    const until = Math.min(p.beat.due + 0.25, next ? next.due - 0.05 : Infinity);
    const onset = onsets.find((o) => o.contextTime >= p.beat.due - 0.05 && o.contextTime < until) ?? null;
    const row = metronomeRow(p.beat, onset, timeOrigin, { requireWorker });
    if (p.extra > 0) row.failure = `the key started ${p.extra + 1} beats`;
    return row;
  });
}

/**
 * The phase's samples from its rows, one per key pressed, when `requested`
 * keys were asked for and the first `warmup` are discarded. A run that
 * pressed fewer keys ends with a measured failed sample saying so, whatever
 * its position, so a shortfall can never hide among the warm-up samples.
 */
export function metronomeSamples(rows, requested, warmup) {
  const samples = rows.map((row, i) => ({ index: i + 1, warmup: i < warmup, ...row }));
  if (rows.length !== requested) samples.push({ index: samples.length + 1, warmup: false, failure: `the page pressed ${rows.length} of ${requested} keys` });
  return samples;
}

export function summarizeMetronome(rows) {
  const ok = rows.filter((r) => !r.failure);
  const stamps = rows.map((r) => r.stamp).filter((s) => s != null);
  const intervals = stamps.slice(1).map((s, i) => s - stamps[i]);
  const metric = (name) => stats(ok.map((r) => r[name]));
  return {
    clicks: rows.length,
    failures: rows.length - ok.length,
    lateArrivals: rows.filter((r) => r.late).length,
    stampInterval: stats(intervals),
    sentMinusStamp: stats(rows.map((r) => r.sentMinusStamp)),
    transit: stats(rows.map((r) => r.transit)),
    arrivedMinusStamp: stats(rows.map((r) => r.arrivedMinusStamp)),
    lateBy: stats(rows.filter((r) => r.late).map((r) => r.lateBy)),
    scheduledMinusStamp: stats(rows.map((r) => r.scheduledMinusStamp)),
    onsetMinusStamp: metric("onsetMinusStamp"),
    onsetMinusScheduled: metric("onsetMinusScheduled"),
    flashMinusStamp: metric("flashMinusStamp"),
    flashMinusOnset: metric("flashMinusOnset"),
    flashSetLateBy: metric("flashSetLateBy"),
    outputLatency: stats(rows.map((r) => r.outputLatency)),
  };
}

/** Whether a finished report is a failed run: an error in any position, or
 *  any measured sample that failed. */
export function timingFailed(report) {
  return report.positions.some((p) => p.error || p.phases?.some((phase) => phase.summary.failures > 0));
}

// ---------------------------------------------------------------- browser ---

// Installed in the player frame before PLAY. It records the DOM input the
// page sees, the keys it presses, the start time every animation is given
// with whether its target was ever animated before, and, once `attach` is
// handed PLAY's application, every message the game sends it and every sound
// its audio manager starts. The router is stamped on entry, before anything
// handles the message, and each message is kept by reference and summarized
// only when a sample is read, so recording adds nothing to the path timed.
function installProbe() {
  const w = window;
  if (w.__timing) return true;
  const T = (w.__timing = { clicks: [], keys: [], messages: [], beats: [], anims: [], burn: 0, frame: null, app: null, tap: null });
  const animated = new WeakSet();
  T.timeOrigin = performance.timeOrigin;
  const startTime = Object.getOwnPropertyDescriptor(w.Animation.prototype, "startTime");
  Object.defineProperty(w.Animation.prototype, "startTime", {
    configurable: true,
    get: startTime.get,
    set(v) {
      const target = this.effect?.target;
      const fresh = !!target && !animated.has(target);
      if (target) animated.add(target);
      T.anims.push({ setAt: performance.now(), startTime: v, fresh });
      startTime.set.call(this, v);
    },
  });
  for (const type of ["pointerdown", "click"]) {
    w.addEventListener(type, (e) => T.clicks.push({ type, t: performance.now(), timeStamp: e.timeStamp, trusted: e.isTrusted }), true);
  }
  T.playApp = () => {
    const app = w.__assetProbe?.().app;
    return app && !app._previewing && app.initialized && !app.destroyed ? app : null;
  };
  T.attach = (app) => {
    T.app = app;
    T.posted = [];
    const game = app._game;
    const post = game.receive;
    game.receive = (m) => {
      if (m.method === "event") T.posted.push({ at: T.timeOrigin + performance.now(), type: m.params?.type });
      return post(m);
    };
    const router = app._router;
    const receive = router.receive.bind(router);
    router.receive = (m) => {
      T.messages.push({ t: performance.now(), m });
      return receive(m);
    };
    const audio = app.audio;
    const onUpdate = audio.onUpdateAudioPlayers.bind(audio);
    let current = null;
    audio.onUpdateAudioPlayers = (params) => {
      current = params.time != null && params.channel === "sound" ? { stamp: params.time, arrivedAt: performance.now() } : null;
      try {
        return onUpdate(params);
      } finally {
        current = null;
      }
    };
    const updatePlayer = audio.updateAudioPlayer.bind(audio);
    audio.updateAudioPlayer = (player, update, start, currentTime, ...rest) => {
      if (current && update.control === "start") {
        const context = app.audioContext;
        const ts = context.getOutputTimestamp();
        T.beats.push({
          ...current,
          due: start + (update.after ?? 0),
          currentTime,
          outputTimestamp: { contextTime: ts.contextTime, performanceTime: ts.performanceTime },
          outputLatency: context.outputLatency ?? 0,
        });
      }
      return updatePlayer(player, update, start, currentTime, ...rest);
    };
    return true;
  };
  T.setLoad = (ms) => {
    T.burn = ms;
    if (ms > 0 && T.frame == null) {
      const burn = () => {
        const end = performance.now() + T.burn;
        while (performance.now() < end) {}
        T.frame = requestAnimationFrame(burn);
      };
      T.frame = requestAnimationFrame(burn);
    } else if (ms === 0 && T.frame != null) {
      cancelAnimationFrame(T.frame);
      T.frame = null;
    }
  };
  const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden" && Number(getComputedStyle(el).opacity) > 0;
  // The leaf that shows a choice's label, marked so the driver can click it.
  T.markChoice = (label) => {
    for (const el of document.querySelectorAll("[data-timing-target]")) el.removeAttribute("data-timing-target");
    const game = document.querySelector("#game") ?? document.body;
    const leaf = [...game.querySelectorAll("*")].find((el) => el.children.length === 0 && el.textContent.trim() === label && visible(el));
    if (!leaf) return false;
    leaf.setAttribute("data-timing-target", "");
    return true;
  };
  T.quietFor = () => (T.messages.length ? performance.now() - T.messages.at(-1).t : Infinity);
  T.mark = () => ({ clicks: T.clicks.length, messages: T.messages.length, posted: T.posted.length, at: T.timeOrigin + performance.now() });
  T.readInput = (mark) => {
    const clicks = T.clicks.slice(mark.clicks);
    const posted = T.posted.slice(mark.posted);
    const messages = T.messages.slice(mark.messages).map(({ t, m }) => {
      let text = "";
      try {
        text = JSON.stringify(m.params ?? null);
      } catch {}
      return { t, method: m.method, answersChoice: /choice/.test(text) };
    });
    const previous = T.messages[mark.messages - 1];
    return { clicks, messages, posted, previousMessageAt: previous ? previous.t : null, timeOrigin: T.timeOrigin };
  };
  // Enter every `interval` ms on a fixed grid, as the page's own timer
  // allows; the game advances a beat on each.
  T.pressOnGrid = (count, interval) =>
    new Promise((resolve) => {
      const start = performance.now() + 50;
      let i = 0;
      const next = () => {
        if (i >= count) return resolve(true);
        T.keys.push(performance.now());
        w.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        i += 1;
        setTimeout(next, Math.max(0, start + i * interval - performance.now()));
      };
      setTimeout(next, Math.max(0, start - performance.now()));
    });
  return true;
}

// Installed in each of the page's workers made from a blob, the player's
// among them: every message the game posts carries a stream epoch, and this
// stamps each one on the shared clock as the worker posts it. Nothing else a
// worker posts carries an epoch, so the other workers record nothing.
function installWorkerProbe() {
  if (self.__timingSent) return true;
  const sent = (self.__timingSent = []);
  const post = MessagePort.prototype.postMessage;
  MessagePort.prototype.postMessage = function (message, ...rest) {
    if (message && typeof message.epoch === "number") {
      sent.push({ at: performance.timeOrigin + performance.now(), method: message.method, time: message.params?.time, channel: message.params?.channel });
    }
    return post.call(this, message, ...rest);
  };
  return true;
}

// What the probed workers posted from `from` on the shared clock, oldest
// first. A worker that can no longer be read stops the run: its posts would
// be missing from every figure that follows.
async function workerSends(workers, from) {
  const sends = [];
  for (const worker of workers) sends.push(...(await worker.evaluate((from) => self.__timingSent.filter((s) => s.at >= from), from)));
  return sends.sort((a, b) => a.at - b.at);
}

// Proves the tap against a known signal in the real browser: a buffer that
// is silent but for a click starting at `frame`, rendered through an
// OfflineAudioContext, must be reported at exactly that frame. The tap class
// is taken from the live tap, since a page script cannot import it.
async function checkTap({ frame, sampleRate }) {
  const T = window.__timing;
  const Tap = T.tap.constructor;
  const context = new OfflineAudioContext(1, sampleRate, sampleRate);
  const buffer = context.createBuffer(1, sampleRate, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < 400; i++) data[frame + i] = (i === 0 ? 0.9 : Math.sin(i / 3) * 0.9) * Math.exp(-i / 80);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  const tap = await Tap.create(context, source);
  source.start(0);
  await context.startRendering();
  await new Promise((resolve) => setTimeout(resolve, 100));
  const reported = tap.onsets.map((o) => o.frame);
  tap.dispose();
  return { frame, reported, exact: reported.length === 1 && reported[0] === frame };
}

// Puts the preview on `line` (from one), which is where PLAY starts, presses
// PLAY, hands the probe the application PLAY built, and lets the first beat
// settle.
async function startPlay(page, frame, line, settle, deps) {
  const scrub = await deps.clickLine(page, line);
  if (!scrub.clicked || scrub.position?.line !== line - 1) throw new Error(`the preview did not move to line ${line} to start PLAY there: ${JSON.stringify(scrub)}`);
  await page.locator('[aria-label="Play Game"]').click();
  await frame.waitForFunction(() => window.__timing.playApp() != null, null, { timeout: 60_000, polling: 50 });
  await frame.evaluate(() => window.__timing.attach(window.__timing.playApp()));
  await page.waitForTimeout(settle);
}

async function runInput(page, frame, workers, options, fixture) {
  const samples = [];
  const total = options.warmup + options.samples;
  for (let i = 0; i < total; i++) {
    const label = fixture.choices[i % fixture.choices.length];
    const ready = await frame
      .waitForFunction(({ label }) => window.__timing.markChoice(label) && window.__timing.quietFor() > 150, { label }, { timeout: options.timeout, polling: 20 })
      .then(
        () => true,
        () => false,
      );
    if (!ready) {
      samples.push({ index: i + 1, warmup: i < options.warmup, failure: `the ${label} choice was not on the page and quiet within ${options.timeout} ms` });
      continue;
    }
    // A random phase against the page's and the worker's frames.
    await page.waitForTimeout(Math.random() * 17);
    const mark = await frame.evaluate(() => window.__timing.mark());
    await frame.locator("[data-timing-target]").click({ timeout: options.timeout });
    await frame
      .waitForFunction((mark) => window.__timing.messages.length > mark.messages && window.__timing.clicks.length > mark.clicks, mark, { timeout: options.timeout, polling: 10 })
      .catch(() => {});
    // Whatever else the answer brings arrives before the next sample.
    await page.waitForTimeout(30);
    const record = await frame.evaluate((mark) => window.__timing.readInput(mark), mark);
    record.sent = await workerSends(workers, mark.at);
    samples.push({ index: i + 1, warmup: i < options.warmup, label, ...attributeInputSample(record, { requireWorker: options.requireWorker }) });
  }
  return samples;
}

async function runMetronome(page, frame, workers, options) {
  const total = options.warmup + options.samples;
  const interval = 60_000 / options.bpm;
  const from = await frame.evaluate(() => ({ keys: window.__timing.keys.length, beats: window.__timing.beats.length, anims: window.__timing.anims.length, at: window.__timing.timeOrigin + performance.now() }));
  await frame.evaluate(({ total, interval }) => window.__timing.pressOnGrid(total, interval), { total, interval });
  // The last beat's sound and flash, which start after its key.
  await page.waitForTimeout(1000);
  const read = await frame.evaluate((from) => {
    const T = window.__timing;
    return {
      keys: T.keys.slice(from.keys),
      beats: T.beats.slice(from.beats),
      anims: T.anims.slice(from.anims),
      onsets: T.tap.onsets.map((o) => ({ frame: o.frame, contextTime: o.contextTime, peak: o.peak })),
      writes: T.messages.filter((e) => e.m.method === "ui/write-image" && e.m.params?.time != null).map((e) => ({ t: e.t, time: e.m.params.time })),
      timeOrigin: T.timeOrigin,
    };
  }, from);
  const sends = (await workerSends(workers, from.at)).filter((s) => s.channel === "sound" && s.time != null);
  return metronomeSamples(pairMetronome({ ...read, sends, requireWorker: options.requireWorker }), total, options.warmup);
}

async function runPosition(position, options, deps, scratch) {
  const fixture = options.kind === "input" ? buildInputFixture() : buildMetronomeFixture({ beats: (options.warmup + options.samples) * 2 + 20 });
  const dir = path.join(scratch, `fixture-${position}`);
  writeTimingFixture(dir, fixture);
  const result = { workerPreview: position, phases: [] };
  let pageConsole = [];
  try {
    await deps.withEditor(
      async ({ page, url, consoleLines }) => {
        pageConsole = consoleLines;
        await deps.openEditorPage(page, url);
        await deps.waitForApp(page);
        result.seed = await deps.seedProject(page, dir, { expectMainSd: true });
        if (result.seed.reason) throw new Error(`seed failed: ${result.seed.reason}`);
        await deps.reloadEditorPage(page);
        await deps.waitForApp(page);
        await deps.switchScreen(page, "logic", { followedByMain: true }).catch(() => {});
        await deps.switchScreen(page, "main").catch(() => {});
        await deps.scriptEditorPresent(page, 60_000);
        await deps.settleEditor(page, 120_000);
        const mount = await deps.waitForGame(page);
        if (!mount.mounted) throw new Error(`the game never mounted; try \`down\` then \`up\`${mount.error ? ` (${mount.error})` : ""}`);
        const program = await deps.waitForProgram(page, 180_000);
        if (!program.loaded) throw new Error("the player loaded no program within 180 s");
        const frame = page.frames().find((f) => f !== page.mainFrame() && /\/__player\//.test(f.url()));
        if (!frame) throw new Error("no same-origin player frame; the timing commands need `up` without --cross-origin");
        await frame.evaluate(installProbe);
        await startPlay(page, frame, fixture.startLine, 2000, deps);
        // With the game in the worker every sample needs the worker's posts,
        // so a position with no worker the probe could reach stops here.
        const workers = [];
        for (const worker of page.workers().filter((w) => w.url().startsWith("blob:"))) {
          if (await worker.evaluate(installWorkerProbe).catch(() => false)) workers.push(worker);
        }
        options = { ...options, requireWorker: position === "on" };
        if (options.requireWorker && workers.length === 0) throw new Error("no worker of the page could be probed, so no sample could split the worker's time from the delivery");
        result.browser = await page.evaluate(() => navigator.userAgent);
        if (options.kind === "metronome") {
          // The first sound creates the mixers the tap goes on. A key that
          // lands while "Ready." is still being revealed only finishes it.
          for (let i = 0; i < 5 && !(await frame.evaluate(() => window.__timing.beats.length > 0)); i++) {
            await frame.evaluate(() => window.__timing.pressOnGrid(1, 0));
            await page.waitForTimeout(600);
          }
          if (!(await frame.evaluate(() => window.__timing.beats.length > 0))) {
            const seen = await frame.evaluate(() => {
              const T = window.__timing;
              const methods = {};
              for (const { m } of T.messages) methods[m.method] = (methods[m.method] ?? 0) + 1;
              return { methods, sameApp: T.app === T.playApp(), text: (document.querySelector("#game")?.innerText ?? "").trim().slice(-120) };
            });
            throw new Error(`no beat played a sound after five keys: ${JSON.stringify(seen)}`);
          }
          const tap = await frame.evaluate(async () => {
            const T = window.__timing;
            T.tap = await T.app.audio.audioProbe.startOnsetTap("main");
            const context = T.app.audioContext;
            return { sampleRate: context.sampleRate, baseLatency: context.baseLatency, outputLatency: context.outputLatency };
          });
          result.audio = tap;
          result.tapCheck = await frame.evaluate(checkTap, { frame: 12_345, sampleRate: tap.sampleRate });
          if (!result.tapCheck.exact) throw new Error(`the tap reported frames ${JSON.stringify(result.tapCheck.reported)} for a click at frame ${result.tapCheck.frame}`);
        }
        for (const load of options.load > 0 ? [0, options.load] : [0]) {
          await frame.evaluate((ms) => window.__timing.setLoad(ms), load);
          await page.waitForTimeout(500);
          const samples = options.kind === "input" ? await runInput(page, frame, workers, options, fixture) : await runMetronome(page, frame, workers, options);
          await frame.evaluate(() => window.__timing.setLoad(0));
          const measured = samples.filter((s) => !s.warmup);
          const summary = options.kind === "input" ? summarizeInput(measured) : summarizeMetronome(measured);
          summary.warmupFailures = samples.filter((s) => s.warmup && s.failure).length;
          result.phases.push({ loadMs: load, summary, samples });
        }
      },
      { headless: !options.headed, workerPreview: position, launch: privateLaunch(deps, path.join(scratch, `profile-${position}`)) },
    );
  } catch (error) {
    result.error = String(error?.message ?? error);
  } finally {
    result.consoleErrors = pageConsole.filter((l) => /error/i.test(l)).slice(-10);
  }
  return result;
}

export async function timing(args, deps) {
  let options;
  try {
    options = parseTimingArgs(args);
  } catch (error) {
    return deps.die([error.message, "", ...TIMING_USAGE].join("\n"));
  }
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "impower-timing-"));
  const report = {
    kind: options.kind,
    samples: options.samples,
    warmup: options.warmup,
    loadMs: options.load,
    ...(options.kind === "metronome" ? { bpm: options.bpm } : {}),
    machine: { platform: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0]?.model ?? null, cores: os.cpus().length },
    positions: [],
  };
  try {
    for (const position of options.positions) report.positions.push(await runPosition(position, options, deps, scratch));
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  if (options.json) fs.writeFileSync(options.json, JSON.stringify(report, null, 2));
  const printed = { ...report, positions: report.positions.map((p) => ({ ...p, phases: p.phases.map(({ samples, ...rest }) => rest) })) };
  deps.log(JSON.stringify(printed, null, 2));
  if (timingFailed(report)) process.exitCode = 1;
  return report;
}

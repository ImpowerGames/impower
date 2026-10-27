// Where a layer's movie stands in Chromium's own media element, with the
// production UIManager, Application and Clock: after each settle of a skip,
// a rewind, playback and a Fast Forward hold, the element must stand where
// the game clock puts the movie (within 0.02 s while paused, where a loop's
// last frame is not its first, and within the quarter second UIManager
// counts as in step while playing), and a movie in step with the clock must
// not be seeked by the page, including while the clock gets no animation
// frames, as in a hidden page.
//
// Run from the repository root (needs Playwright's Chromium):
//
//   node packages/spark-web-player/scripts/movie-placement-probe.ts [--out <evidence.json>]
//
// The movies are blob-backed WebM files recorded in the page with
// MediaRecorder: one whose duration Chromium reads at load ("known"), the
// same file skipped before its metadata loads ("learned"), and one recorded
// in slices, which Chromium reports as Infinity while it stays seekable
// ("infinite"). Expected positions come from the probe's own tally of the
// game clock, not from UIManager: a loop wraps at the movie's duration, and
// a movie that plays once stays between its start and its end; a loop
// skipped back past its start before its duration is known starts from its
// first frame. Exits 1 with an AssertionError listing every failed check.

import { AssertionError } from "node:assert";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

type Fixture = "known" | "learned" | "infinite";
type First = "before" | "inside" | "past" | "twice" | "none" | "unframed";
interface Case {
  fixture: Fixture;
  loop: boolean;
  first: First;
}
interface Check {
  case: string;
  step: string;
  ok: boolean;
  detail: string;
}
interface Outcome {
  checks: Check[];
  rows: Record<string, unknown>[];
}

const outIndex = process.argv.indexOf("--out");
const out = outIndex >= 0 ? process.argv[outIndex + 1] : undefined;

const cases: Case[] = [];
for (const fixture of ["known", "learned", "infinite"] as const) {
  for (const loop of [true, false]) {
    for (const first of ["before", "inside", "past"] as const) {
      cases.push({ fixture, loop, first });
    }
  }
}
// Played through from the start with no skip, so the duration of the
// infinite file arrives while the movie plays.
cases.push({ fixture: "infinite", loop: true, first: "none" });
cases.push({ fixture: "infinite", loop: false, first: "none" });
// Skipped exactly two lengths before its metadata loads: a paused loop stands
// on its first frame, not on its last.
cases.push({ fixture: "learned", loop: true, first: "twice" });
cases.push({ fixture: "learned", loop: false, first: "twice" });
// Playing while the clock gets no animation frames (a hidden page) for two
// wraps of the loop, then gets them again.
cases.push({ fixture: "known", loop: true, first: "unframed" });
cases.push({ fixture: "infinite", loop: true, first: "unframed" });

const packageDir = fileURLToPath(new URL("..", import.meta.url));
const bundle = await build({
  absWorkingDir: packageDir,
  stdin: {
    contents: [
      `import UIManager from "./src/app/managers/UIManager";`,
      `import { Application } from "./src/app/Application";`,
      `import { Clock } from "@impower/spark-engine/src/game/core/classes/Clock";`,
      `(window as any).probe = { UIManager, Application, Clock };`,
    ].join("\n"),
    resolveDir: packageDir,
    loader: "ts",
  },
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  logLevel: "error",
});

const browser = await chromium.launch({ headless: true });
let outcome: Outcome;
try {
  const page = await browser.newPage();
  await page.setContent("<!doctype html><body></body>");
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
  outcome = await page.evaluate(async (cases: Case[]): Promise<Outcome> => {
    const { UIManager, Application, Clock } = (window as any).probe;
    const delay = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));
    const mod = (t: number, d: number) => ((t % d) + d) % d;

    // Three seconds of a bar filling the frame, recorded whole (Chromium
    // reads its duration at load) or in 100 ms slices (Infinity until
    // Chromium finds the end).
    const record = async (timeslice: number): Promise<string> => {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 180;
      const context = canvas.getContext("2d")!;
      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp9",
      });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) {
          chunks.push(e.data);
        }
      };
      const start = performance.now();
      if (timeslice > 0) {
        recorder.start(timeslice);
      } else {
        recorder.start();
      }
      await new Promise<void>((resolve) => {
        const draw = () => {
          const t = (performance.now() - start) / 1000;
          context.fillStyle = "#222";
          context.fillRect(0, 0, 320, 180);
          context.fillStyle = "#08f";
          context.fillRect(0, 0, (320 * t) / 3, 180);
          context.fillStyle = "#fff";
          context.fillText(t.toFixed(2), 10, 20);
          if (t < 3) {
            requestAnimationFrame(draw);
          } else {
            resolve();
          }
        };
        draw();
      });
      recorder.stop();
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });
      stream.getTracks().forEach((track) => track.stop());
      return URL.createObjectURL(new Blob(chunks, { type: "video/webm" }));
    };
    const urls = { known: await record(0), infinite: await record(100) };
    // The whole recording's duration, read from an element of its own.
    const knownSpan = await new Promise<number>((resolve) => {
      const sizer = document.createElement("video");
      sizer.muted = true;
      sizer.onloadedmetadata = () => resolve(sizer.duration);
      sizer.src = urls.known;
    });

    const native = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "currentTime",
    )!;

    const runCase = async (c: Case): Promise<Outcome> => {
      const name = `${c.fixture} ${c.loop ? "loop" : "once"} ${c.first}`;
      const checks: Check[] = [];
      const rows: Record<string, unknown>[] = [];
      const overlay = document.createElement("div");
      document.body.appendChild(overlay);
      // Application's clock, whose frames can be held back as a hidden page's
      // are.
      let unframed = false;
      let heldFrame: (() => void) | undefined;
      const clock = new Clock(
        {
          get currentTime() {
            return performance.now() / 1000;
          },
        },
        (callback: () => void) => {
          if (unframed) {
            heldFrame = callback;
            return 0;
          }
          return requestAnimationFrame(callback);
        },
      );
      const reframe = () => {
        unframed = false;
        const frame = heldFrame;
        heldFrame = undefined;
        if (frame) {
          requestAnimationFrame(frame);
        }
      };
      const app = Object.create(Application.prototype);
      Object.assign(app, {
        _overlay: overlay,
        _clock: clock,
        _dolly: {},
        _initialized: false,
        _managers: [],
        _paused: false,
      });
      const ui = new UIManager(app);
      app._managers.push(ui);
      // Each frame updates the managers, as `Application.start` arranges.
      clock.add((time: unknown) => app.update(time));
      clock.start();

      const video = document.createElement("video");
      video.className = "object";
      video.muted = true;
      video.loop = c.loop;
      video.style.cssText = "width:96px;height:54px";
      // While the movie plays, the probe's tally of the clock from when it
      // started to: how far the element stands from the clock's place.
      let playing: { tally: number; game: number } | undefined;
      const gapToClock = (): number | undefined => {
        if (!playing) {
          return undefined;
        }
        const t = playing.tally + clock.elapsedTime - playing.game;
        const at: number = native.get!.call(video);
        const d = span();
        if (d === undefined) {
          return Math.abs(at - t);
        }
        const gap = Math.abs(at - (c.loop ? mod(t, d) : Math.min(t, d)));
        return c.loop ? Math.min(gap, d - gap) : gap;
      };
      // Every position the page gives the element, with how far from the
      // clock's place the element stood then, so a seek of a movie already in
      // step with the clock shows up.
      const writes: { value: number; gap?: number }[] = [];
      Object.defineProperty(video, "currentTime", {
        configurable: true,
        get() {
          return native.get!.call(this);
        },
        set(value: number) {
          writes.push({ value, gap: gapToClock() });
          native.set!.call(this, value);
        },
      });
      const inStepSeeks = (from: number) =>
        writes.slice(from).filter((w) => w.gap !== undefined && w.gap <= 0.25);
      let lastEvent = performance.now();
      for (const type of [
        "seeking",
        "seeked",
        "durationchange",
        "loadedmetadata",
        "ended",
      ]) {
        video.addEventListener(type, () => {
          lastEvent = performance.now();
        });
      }
      overlay.appendChild(video);
      const loaded = new Promise<void>((resolve) =>
        video.addEventListener("loadeddata", () => resolve(), { once: true }),
      );
      video.src = c.fixture === "infinite" ? urls.infinite : urls.known;

      // Until no seek is pending and the element has reported nothing for a
      // quarter second.
      const settle = async () => {
        const deadline = performance.now() + 5000;
        await delay(50);
        while (performance.now() < deadline) {
          if (
            !video.seeking &&
            video.readyState >= 2 &&
            performance.now() - lastEvent > 250
          ) {
            return;
          }
          await delay(25);
        }
      };
      const snap = (step: string) => {
        const row = {
          case: name,
          step,
          currentTime: video.currentTime,
          duration: String(video.duration),
          seeking: video.seeking,
          paused: video.paused,
          ended: video.ended,
          readyState: video.readyState,
          position: ui.moviePosition(video),
          writes: writes.length,
        };
        rows.push(row);
        return row;
      };
      // The game clock's position, by the probe's own tally.
      let tally = 0;
      const span = () =>
        Number.isFinite(video.duration) && video.duration > 0
          ? video.duration
          : undefined;
      const expected = (d: number) =>
        c.loop ? mod(tally, d) : Math.min(tally, d);
      // A playing loop is in step anywhere around its end; a paused one shows
      // its last frame at its end and its first at its start.
      const distance = (a: number, b: number, d: number) => {
        const gap = Math.abs(a - b);
        return c.loop && !video.paused ? Math.min(gap, d - gap) : gap;
      };
      const check = (step: string, tolerance: number) => {
        const row = snap(step);
        // Until Chromium reports the duration the tally is neither wrapped
        // nor held at an end: the movie stands at the clock's time itself.
        const d = span() ?? Infinity;
        if (!c.loop) {
          tally = Math.min(tally, d);
        }
        const want = Number.isFinite(d) ? expected(d) : tally;
        const element = distance(video.currentTime, want, d);
        const anchor = distance(
          c.loop && Number.isFinite(d) ? mod(row.position, d) : row.position,
          want,
          d,
        );
        checks.push({
          case: name,
          step,
          ok: !video.seeking && element <= tolerance && anchor <= tolerance,
          detail: `element ${video.currentTime.toFixed(3)} anchor ${row.position.toFixed(3)} clock ${want.toFixed(3)} (duration ${row.duration}, tolerance ${tolerance})`,
        });
      };
      const skip = async (seconds: number) => {
        const known = span() !== undefined;
        app.skip(seconds);
        const moved = tally + seconds;
        tally = c.loop && known ? moved : Math.max(0, moved);
        const d = span();
        if (!c.loop && d !== undefined) {
          tally = Math.min(tally, d);
        }
      };

      if (c.first === "unframed") {
        await loaded;
        ui.startMovie(video);
        const game = clock.elapsedTime;
        playing = { tally: 0, game };
        await delay(300);
        const held = writes.length;
        unframed = true;
        await delay(knownSpan * 2200);
        const resumed = writes.length;
        reframe();
        await delay(600);
        tally = clock.elapsedTime - game;
        check("playing after frames held back for two wraps", 0.25);
        checks.push({
          case: name,
          step: "no seek by the page while frames were held back",
          ok: resumed === held,
          detail: `page seeks: ${JSON.stringify(writes.slice(held, resumed))}`,
        });
        checks.push({
          case: name,
          step: "playing in step is not seeked",
          ok: inStepSeeks(0).length === 0,
          detail: `page seeks (value, gap to the clock): ${JSON.stringify(writes)}`,
        });
        playing = undefined;
        snap("done");
        clock.stop();
        return { checks, rows };
      }
      if (c.fixture === "learned") {
        // Shown and paused before its metadata loads.
        ui.startMovie(video);
        app.pause();
        tally = 0;
      } else {
        await loaded;
        ui.startMovie(video);
        await delay(250);
        app.pause();
        // The pause anchors the movie where its element stands.
        tally = video.currentTime;
      }
      const first = {
        before: -(tally + 1),
        inside: 1,
        past: 5,
        twice: 2 * knownSpan,
        none: 0,
        unframed: 0,
      }[c.first];
      if (c.first !== "none") {
        await skip(first);
        await settle();
        check(`skip ${first.toFixed(2)}`, 0.02);
        const before = video.currentTime;
        await skip(0);
        await settle();
        check("zero skip", 0.02);
        checks.push({
          case: name,
          step: "zero skip leaves the frame",
          ok: Math.abs(video.currentTime - before) <= 0.02,
          detail: `${before.toFixed(3)} -> ${video.currentTime.toFixed(3)}`,
        });
        await skip(-0.5);
        await settle();
        check("rewind -0.5", 0.02);
      }

      // Playing with the clock: the page seeks no movie in step with it.
      const writesBefore = writes.length;
      let game = clock.elapsedTime;
      playing = { tally, game };
      app.unpause();
      await delay(c.first === "none" ? 3800 : 1600);
      tally += clock.elapsedTime - game;
      playing = undefined;
      check("playing", 0.25);
      checks.push({
        case: name,
        step: "playing in step is not seeked",
        ok: inStepSeeks(writesBefore).length === 0,
        detail: `page seeks while playing (value, gap to the clock): ${JSON.stringify(writes.slice(writesBefore))}`,
      });

      // Fast Forward held while playing: ten steps of 0.1 s.
      game = clock.elapsedTime;
      for (let i = 0; i < 10; i += 1) {
        await skip(0.1);
        await delay(100);
      }
      await delay(300);
      while (video.seeking) {
        await delay(25);
      }
      tally += clock.elapsedTime - game;
      check("Fast Forward held while playing", 0.25);

      app.pause();
      await settle();
      const held = video.currentTime;
      await skip(0);
      await settle();
      checks.push({
        case: name,
        step: "paused after play, zero skip leaves the frame",
        ok: Math.abs(video.currentTime - held) <= 0.02 && !video.seeking,
        detail: `${held.toFixed(3)} -> ${video.currentTime.toFixed(3)}`,
      });
      snap("done");
      clock.stop();
      return { checks, rows };
    };

    // One at a time, as the editor plays a movie or two: concurrent decodes
    // slow every seek.
    const results: Outcome[] = [];
    for (const c of cases) {
      results.push(await runCase(c));
    }
    return {
      checks: results.flatMap((r) => r.checks),
      rows: results.flatMap((r) => r.rows),
    };
  }, cases);
} finally {
  await browser.close();
}

for (const [i, check] of outcome.checks.entries()) {
  console.log(
    `${check.ok ? "ok" : "not ok"} ${i + 1} - ${check.case}: ${check.step} (${check.detail})`,
  );
}
const retained = outcome.rows.filter(
  (row) => row["duration"] === "Infinity" && !row["seeking"],
);
console.log(
  `Infinity after a settle: ${retained.length ? retained.map((row) => `${row["case"]} at ${row["step"]}`).join("; ") : "none (Chromium reported each infinite file's duration once a seek or playback reached its end)"}`,
);
if (out) {
  await writeFile(out, JSON.stringify(outcome, null, 2));
}
const failed = outcome.checks.filter((check) => !check.ok);
console.log(
  `${outcome.checks.length - failed.length} passed, ${failed.length} failed (${outcome.checks.length})`,
);
if (failed.length) {
  throw new AssertionError({
    message: `${failed.length} movie placement checks failed:\n${failed.map((check) => `  ${check.case}: ${check.step} (${check.detail})`).join("\n")}`,
  });
}

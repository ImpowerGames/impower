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

export const MEASURE_USAGE = [
  "measure options:",
  "  --project <dir-or-zip>  the project to measure; seeded into a browser profile of this run's own",
  "  --fixture               generate the fixture project (scripts/bench/preview-fixture.mjs) instead",
  "  --line <N>              the line of main.sd, counting from one (--fixture: its target line)",
  "  --word <text>           the word on that line to delete so the list offers every candidate",
  "  --samples <K>           measured samples (default 10)",
  "  --warmup <W>            discarded samples first (default 2)",
  "  --edit                  accept a suggestion per sample and time the real compile instead",
  "  --timeout <ms>          how long one sample may take before it is a failure (default 20000)",
  "  --settle <ms>           wait after each result so its trailing measures arrive (default 1500)",
  "  --json <file>           also write the full report, with the raw event log of every sample",
  "  --headed                run a visible browser instead of headless",
  "  --worker-preview on|off display the stopped preview from the player's worker (#680); off by default",
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
  const out = { samples: 10, warmup: 2, edit: false, timeout: 20_000, settle: 1500, headed: false, workerPreview: "off" };
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
      case "--worker-preview": {
        const position = value(args, i++, name);
        if (position !== "on" && position !== "off") throw new Error("--worker-preview takes on or off");
        out.workerPreview = position;
        break;
      }
      default:
        throw new Error(`unknown measure argument ${name}`);
    }
  }
  if (out.project && out.fixture) throw new Error("--project and --fixture are exclusive");
  if (!out.project && !out.fixture) throw new Error("measure needs --project <dir-or-zip> or --fixture");
  if (out.project && (out.line == null || out.word == null)) throw new Error("--project needs --line and --word");
  return out;
}

// A measure's name without the document URI the workspace appends, so the
// same phase sums across samples: `player workspace previewCompile file:///x`
// becomes `player workspace previewCompile`.
export const phaseName = (name) =>
  name
    .split(" ")
    .filter((part) => !part.includes("://"))
    .join(" ");

function phasesBetween(events, from, to) {
  const phases = {};
  for (const e of events) {
    if (e.kind !== "measure" || e.start < from - 1 || e.start > to) continue;
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
  return { ...base, status: "showing", ms: ms(answer.t - press.t), phases, longtasks: longtasksFrom(events, press.t) };
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
// `target`, as for a suggestion. Key to paint, which includes that hold, is
// reported beside it.
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
    keyToPainted: ms(painted.t - press.t),
    phases: phasesBetween(events, press.t, painted.t),
    longtasks: longtasksFrom(events, press.t),
  };
}

export function summarize(samples) {
  const times = samples
    .filter((s) => !s.failure)
    .map((s) => s.ms)
    .sort((a, b) => a - b);
  const stats = (list) => (list.length ? { min: list[0], median: list[Math.floor(list.length / 2)], max: list.at(-1) } : null);
  const phaseNames = [...new Set(samples.flatMap((s) => Object.keys(s.phases ?? {})))];
  return {
    samples: samples.length,
    failures: samples.filter((s) => s.failure).length,
    ms: stats(times),
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
    window.addEventListener("keydown", (e) => log.push({ t: performance.now(), kind: "key", key: e.key }), true);
    window.__editorProtocol.subscribe((m) => {
      if (m.method === "textDocument/previewCompletion") {
        log.push({ t: performance.now(), kind: "request", request: m.params.request, state: m.params.state, edit: m.params.contentChanges?.[0]?.text });
      } else if (m.method === "preview/didChangeGameState") {
        window.__measureState = m.params;
        log.push({ t: performance.now(), kind: "state", completion: m.params.completion, position: m.params.position, programVersion: m.params.programVersion });
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
function privateLaunch(deps, dir) {
  return async ({ headless }) => {
    const { chromium } = await deps.importPlaywright();
    const executablePath = deps.resolveChromiumExecutablePath(chromium);
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
  const report = { mode: options.edit ? "edit" : "preview", workerPreview: options.workerPreview, line: options.line, word: options.word, samples: [], warmup: options.warmup };
  let pageConsole = [];
  try {
    let project = options.project;
    if (options.fixture) {
      const { writePreviewFixture } = await import("../../../scripts/bench/preview-fixture.mjs");
      project = path.join(scratch, "fixture");
      const target = writePreviewFixture(project);
      options.line ??= target.line;
      options.word ??= target.word;
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
        const wordAt = lineText?.indexOf(options.word) ?? -1;
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
        try {
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
      { headless: !options.headed, workerPreview: options.workerPreview, launch: privateLaunch(deps, path.join(scratch, "profile")) },
    );
  } catch (error) {
    report.error = String(error?.message ?? error);
  } finally {
    // The page's console, on every exit path, since it explains most failures.
    report.consoleErrors = pageConsole.filter((l) => /error/i.test(l)).slice(-10);
    fs.rmSync(scratch, { recursive: true, force: true });
  }

  const measured = report.samples.filter((s) => !s.warmup);
  report.summary = summarize(measured);
  report.summary.warmupFailures = report.samples.filter((s) => s.warmup && s.failure).length;
  if (options.json) fs.writeFileSync(options.json, JSON.stringify(report, null, 2));
  const printed = { ...report, samples: report.samples.map(({ events, ...rest }) => rest) };
  deps.log(JSON.stringify(printed, null, 2));
  if (runFailed(report)) process.exitCode = 1;
  return report;
}

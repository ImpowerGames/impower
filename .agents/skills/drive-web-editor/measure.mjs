import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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
export const BURST_GAPS = [100, 85, 115, 90, 120, 80, 105, 95, 110];

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

export const phaseName = (name) =>
  name
    .split(" ")
    .filter((part) => !part.includes("://"))
    .join(" ");

const DISPLAY_PATH = /^player displayPreview path (.+)$/;

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

function offTarget(position, target) {
  if (position?.uri === target.uri && position?.line === target.line) return null;
  const where = position ? `${position.uri} line ${position.line + 1}` : "no position";
  return `${where}, not ${target.uri} line ${target.line + 1}`;
}

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

export const STRUCTURAL_KEYS = { insert: "insertText", remove: "Backspace" };

export function attributeStructuralSample(events, versionBefore, target, direction) {
  const key = STRUCTURAL_KEYS[direction];
  if (!key) return { direction, failure: `unknown structural direction ${direction}` };
  return { direction, ...attributeEditSample(events, versionBefore, target, key) };
}

const CLOCKS = ["msFromKey", "debounce", "keyToRequest"];

export function summarize(samples) {
  const passed = samples.filter((s) => !s.failure);
  const times = passed.map((s) => s.ms).sort((a, b) => a - b);
  const phaseNames = [...new Set(samples.flatMap((s) => Object.keys(s.phases ?? {})))];
  const clocks = CLOCKS.map((name) => [name, passed.filter((s) => s[name] != null).map((s) => s[name]).sort((a, b) => a - b)]).filter(([, list]) => list.length);
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

export function runFailed(report) {
  return Boolean(report.error || report.restoredMatches === false || report.samples.some((s) => s.failure));
}

export function replacedSpan(original, word, current) {
  const at = original.indexOf(word);
  const before = original.slice(0, at);
  const after = original.slice(at + word.length);
  if (!current.startsWith(before) || !current.endsWith(after) || current.length < before.length + after.length) return null;
  return { start: before.length, text: current.slice(before.length, current.length - after.length) };
}

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
    return { range: { start: { line: head, character: 0 }, end: { line: now.length - tail, character: 0 } }, text: lines.map((l) => `${l}\n`).join("") };
  }
  if (head > 0) {
    const start = { line: head - 1, character: now[head - 1].length };
    return { range: { start, end: { line: now.length - 1, character: now.at(-1).length } }, text: lines.map((l) => `\n${l}`).join("") };
  }
  return { range: { start: { line: 0, character: 0 }, end: { line: now.length - 1, character: now.at(-1).length } }, text: original };
}

const send = (page, method, params = {}, timeout = 30_000) =>
  page.evaluate(({ method, params, timeout }) => window.__editorProtocol.send({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }, timeout), { method, params, timeout });
const notify = (page, method, params = {}) => page.evaluate(({ method, params }) => window.__editorProtocol.send({ jsonrpc: "2.0", method, params }), { method, params });
const readLine = async (page, line) => (await send(page, "editor/read")).textDocument.text.split("\n")[line - 1];

async function instrument(page) {
  return page.evaluate(() => {
    const log = (window.__measureLog = []);
    window.__measureState = null;
    const origin = performance.timeOrigin;
    window.addEventListener("keydown", (e) => log.push({ t: performance.now(), ts: e.timeStamp, kind: "key", key: e.key }), true);
    window.__editorProtocol.subscribe((m) => {
      if (m.method === "textDocument/previewCompletion") {
        log.push({ t: performance.now(), kind: "request", request: m.params.request, state: m.params.state, edit: m.params.contentChanges?.[0]?.text });
      } else if (m.method === "preview/didChangeGameState") {
        window.__measureState = m.params;
        log.push({ t: performance.now(), kind: "state", completion: m.params.completion, position: m.params.position, programVersion: m.params.programVersion });
      } else if (m.method === "textDocument/didChange" || m.method === "textDocument/didSelect") {
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

const waitInPage = (page, predicate, arg, timeout) =>
  page.waitForFunction(predicate, arg, { timeout, polling: 25 }).then(
    () => true,
    () => false,
  );

const answeredLatest = (key) => {
  const log = window.__measureLog;
  const press = log.find((e) => e.kind === "key" && e.key === key);
  const request = press && log.find((e) => e.kind === "request" && e.state === "focus" && e.t >= press.t);
  return (
    !!request && log.some((e) => e.kind === "state" && e.t >= request.t && e.completion?.request === request.request && (e.completion.status === "showing" || e.completion.status === "unavailable"))
  );
};
const answeredAny = () => {
  const log = window.__measureLog;
  return log.some((r) => r.kind === "request" && r.state === "focus" && log.some((e) => e.kind === "state" && e.completion?.request === r.request && e.completion.status !== "preparing"));
};
const paintedAfter = (versionBefore) => window.__measureLog.some((e) => e.kind === "state" && e.programVersion != null && e.programVersion > (versionBefore ?? -1) && e.position != null);

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
        const wordAt = options.burst || options.structural ? lineText.length : lineText.indexOf(options.word);
        if (wordAt < 0) throw new Error(`"${options.word}" is not on line ${options.line} of ${uri}: ${JSON.stringify(lineText)}`);
        const target = { uri, line: options.line - 1 };
        report.playerFramesObserved = await instrument(page);
        if (report.playerFramesObserved === 0) report.warning = "no player frame could be observed (a cross-origin launch?), so samples carry no phases or long tasks";

        const at = (character) => ({ line: options.line - 1, character });
        const select = (from, to, extra = {}) => notify(page, "editor/select", { textDocument: { uri }, range: { start: at(from), end: at(to) }, takeFocus: true, ...extra });
        await select(wordAt, wordAt, { scrollIntoView: "center" });
        await page.waitForTimeout(6000);

        let span = { start: wordAt, text: options.word };
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
          const indentation = options.indent != null ? " ".repeat(options.indent) : (/^\s*/.exec(lineText)?.[0] ?? "");
          const inserted = indentation + (options.text ?? STRUCTURAL_TEXT);
          report.text = options.text ?? STRUCTURAL_TEXT;
          report.inserted = inserted;
          report.linesBefore = text.split("\n").length;
          const lines = text.split("\n");
          const withInsert = [...lines.slice(0, options.line), inserted, ...lines.slice(options.line)].join("\n");
          const end = lineText.length;
          const targets = { insert: { uri, line: options.line }, remove: target };
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
              await page.waitForTimeout(options.settle + 3000);
              report.heapMB.after = await pageHeapMB(page);
            }
          } else {
            for (let i = 0; i < total; i++) {
              await openList();
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
    report.consoleErrors = pageConsole.filter((l) => /error/i.test(l)).slice(-10);
    fs.rmSync(scratch, { recursive: true, force: true });
  }

  const measured = report.samples.filter((s) => !s.warmup);
  report.summary = options.burst ? summarizeBurst(measured) : summarize(measured);
  if (options.structural) report.summary.byDirection = Object.fromEntries(["insert", "remove"].map((d) => [d, summarize(measured.filter((s) => s.direction === d))]));
  report.summary.warmupFailures = report.samples.filter((s) => s.warmup && s.failure).length;
  if (options.json) fs.writeFileSync(options.json, JSON.stringify(report, null, 2));
  const printed = { ...report, samples: report.samples.map(({ events, ...rest }) => rest) };
  deps.log(JSON.stringify(printed, null, 2));
  if (runFailed(report)) process.exitCode = 1;
  return report;
}

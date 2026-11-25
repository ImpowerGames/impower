import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TRACE_CATEGORIES, analyzeLine, clockOffset, cpuLoad, layerPaints, parseTrace, quietness } from "./pacing-analysis.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const PACING_DEFAULTS = { restMs: 1500, settleMs: 300, quietSampleMs: 3000, fireTimeoutMs: 20000, beats: 10 };

export function pacingProbe(w) {
  if (w.__pacing) return "already";
  const P = (w.__pacing = { clicks: 0, morph: [], roots: new Set() });
  w.addEventListener(
    "pointerdown",
    (event) => {
      P.clicks += 1;
      w.performance.mark(`pacing click ${P.clicks}`, { startTime: event.timeStamp });
    },
    true,
  );
  const watch = (root) => {
    new w.MutationObserver((records) => {
      const t = w.performance.now();
      let kind = "swap";
      const targets = new Set();
      for (const record of records) {
        if (record.type === "childList") kind = "rebuild";
        else if (record.attributeName === "d" && kind !== "rebuild") kind = "tween";
        targets.add(record.target.getAttribute?.("data-morph") ?? record.target.localName);
      }
      P.morph.push({ t, kind, targets: [...targets] });
    }).observe(root, { subtree: true, attributes: true, childList: true });
  };
  const scan = (root) => {
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) {
        if (!P.roots.has(el.shadowRoot) && (el.__sdMorphs || el.classList?.contains("morph") || el.closest?.(".morph"))) {
          P.roots.add(el.shadowRoot);
          watch(el.shadowRoot);
        }
        scan(el.shadowRoot);
      }
    }
  };
  P.scan = () => scan(w.document);
  P.timer = w.setInterval(P.scan, 100);
  P.scan();
  return "installed";
}

export function pacingBeats(w) {
  const marks = w.performance.getEntriesByType("mark").filter((m) => m.name.startsWith("beat fired "));
  return { fired: marks.map((m) => m.name), clicks: w.__pacing?.clicks ?? 0 };
}

export function pacingFired(w, before) {
  const seen = new Set(before);
  const fired = w.performance
    .getEntriesByType("mark")
    .filter((m) => m.name.startsWith("beat fired ") && !seen.has(m.name))
    .sort((a, b) => a.startTime - b.startTime);
  return fired.length ? fired[fired.length - 1].name : null;
}

export function pacingTypingEnd(w) {
  const timeline = w.document.timeline;
  let end = null;
  for (const animation of w.document.getAnimations()) {
    const target = animation.effect?.target;
    if (!target?.classList?.contains("text_letter")) continue;
    const start = animation.startTime ?? timeline.currentTime;
    const computed = animation.effect.getComputedTiming();
    const at = start + (Number.isFinite(computed.endTime) ? computed.endTime : 0);
    if (end == null || at > end) end = at;
  }
  return { end, now: w.performance.now() };
}

export function pacingRead(w, { firedName, sinceClicks }) {
  const label = firedName.slice("beat fired ".length);
  const entry = (type, name) => w.performance.getEntriesByName(name, type)[0] ?? null;
  const fired = entry("mark", firedName);
  const received = entry("mark", `beat received ${label}`);
  const wait = entry("measure", `beat wait ${label}`);
  const clicks = w.performance.getEntriesByType("mark").filter((m) => m.name.startsWith("pacing click ")).filter((m) => Number(m.name.split(" ").pop()) > sinceClicks);
  const click = clicks.length ? clicks[clicks.length - 1] : null;
  const from = click?.startTime ?? received?.startTime ?? 0;
  const morph = w.__pacing.morph.filter((m) => m.t >= from);
  w.__pacing.morph = w.__pacing.morph.filter((m) => m.t >= w.performance.now() - 100);
  for (const m of clicks.slice(0, -1)) w.performance.clearMarks(m.name);
  const lineText = [...w.document.querySelectorAll("#game .text_letter")].map((el) => el.textContent).join("").slice(0, 80);
  return {
    label,
    line: Number((label.match(/:(\d+) #/) ?? [])[1]) || null,
    clickName: click?.name ?? null,
    clickAt: click?.startTime ?? null,
    receivedAt: received?.startTime ?? null,
    firedAt: fired?.startTime ?? null,
    beatWaitMs: wait?.duration ?? null,
    morph,
    text: lineText,
  };
}

export function pacingEnvironment(w) {
  return new Promise((resolve) => {
    const times = [];
    const step = (t) => {
      times.push(t);
      if (times.length < 90) w.requestAnimationFrame(step);
      else {
        const gaps = times.slice(1).map((v, i) => v - times[i]).sort((a, b) => a - b);
        const median = gaps[Math.floor(gaps.length / 2)];
        const game = w.document.querySelector("#game")?.getBoundingClientRect();
        resolve({
          refreshHz: median ? Math.round(1000 / median) : null,
          devicePixelRatio: w.devicePixelRatio,
          gameView: game ? `${Math.round(game.width)}x${Math.round(game.height)}` : null,
        });
      }
    };
    w.requestAnimationFrame(step);
  });
}

export async function captureTrace(send, on, file, categories = TRACE_CATEGORIES) {
  let resolveDone;
  const done = new Promise((resolve) => (resolveDone = resolve));
  const off = on("Tracing.tracingComplete", (params) => resolveDone(params));
  await send("Tracing.start", { transferMode: "ReturnAsStream", traceConfig: { includedCategories: categories, recordMode: "recordAsMuchAsPossible" } });
  return async () => {
    await send("Tracing.end", {});
    const { stream } = await done;
    off();
    const out = fs.openSync(file, "w");
    try {
      for (;;) {
        const chunk = await send("IO.read", { handle: stream, size: 1 << 22 });
        if (chunk.data) fs.writeSync(out, chunk.base64Encoded ? Buffer.from(chunk.data, "base64") : Buffer.from(chunk.data, "utf8"));
        if (chunk.eof) break;
      }
    } finally {
      fs.closeSync(out);
      await send("IO.close", { handle: stream }).catch(() => {});
    }
    return file;
  };
}

export function layerTracker(on) {
  let layers = new Map();
  const off = on("LayerTree.layerTreeDidChange", (params) => {
    if (!params?.layers) return;
    const next = new Map();
    for (const layer of params.layers) next.set(layer.layerId, layer);
    layers = next;
  });
  return { snapshot: () => new Map(layers), stop: off };
}

export async function describeLayers(sendGame, painted, snapshot) {
  for (const entry of painted) {
    const layer = snapshot.get(entry.id);
    if (!layer?.backendNodeId) continue;
    try {
      const { node } = await sendGame("DOM.describeNode", { backendNodeId: layer.backendNodeId });
      const attrs = {};
      for (let i = 0; i + 1 < (node.attributes ?? []).length; i += 2) attrs[node.attributes[i]] = node.attributes[i + 1];
      entry.node = `${node.localName || node.nodeName}${attrs.class ? "." + attrs.class.trim().split(/\s+/).slice(0, 3).join(".") : ""}${attrs.image ? `[image=${attrs.image}]` : ""}`;
    } catch {
      entry.node = null;
    }
  }
  return painted;
}

export async function sampleCpu(ms) {
  const before = os.cpus();
  await sleep(ms);
  return cpuLoad(before, os.cpus());
}

export function planFor(fixture, line) {
  const lines = [...(fixture?.lines ?? [])].sort((a, b) => a.line - b.line);
  return lines.find((entry, i) => line <= entry.line && (i === 0 || lines[i - 1].line < line)) ?? null;
}

export async function playLines(surface, options) {
  const { out, fixture, beats, restMs, settleMs, quietSampleMs, fireTimeoutMs, keepTrace, quietLimit, log = () => {} } = { ...PACING_DEFAULTS, ...options };
  const run = { lines: [], failed: [] };
  await surface.inGame(pacingProbe);
  run.environment = await surface.inGame(pacingEnvironment);
  run.cpuLoadPercent = await sampleCpu(quietSampleMs);
  run.quiet = quietness(run.cpuLoadPercent, quietLimit);
  log(`pacing: ${run.quiet.verdict}`);
  const tracker = layerTracker(surface.onGame);
  await surface.sendGame("DOM.enable", {}).catch(() => {});
  await surface.sendGame("LayerTree.enable", {});
  const expected = fixture ? fixture.lines.filter((l) => l.kind !== "warmup") : null;
  const total = expected ? expected.length : beats;
  try {
    for (let n = 1; n <= total; n++) {
      await sleep(restMs);
      await surface.inGame(pacingProbe);
      const before = await surface.inGame(pacingBeats);
      const layersBefore = tracker.snapshot();
      const traceFile = path.join(out, `trace-${String(n).padStart(2, "0")}.json`);
      const stopTrace = await captureTrace(surface.sendBrowser, surface.onBrowser, traceFile);
      await sleep(settleMs);
      await surface.clickGame();
      const deadline = Date.now() + fireTimeoutMs;
      let firedName = null;
      while (!firedName && Date.now() < deadline) {
        firedName = await surface.inGame(pacingFired, before.fired);
        if (!firedName) await sleep(50);
      }
      if (!firedName) {
        await stopTrace().catch(() => {});
        if (!keepTrace) fs.rmSync(traceFile, { force: true });
        run.failed.push(`click ${n} fired no beat within ${fireTimeoutMs} ms`);
        break;
      }
      const typing = await surface.inGame(pacingTypingEnd);
      const until = Math.max(typing.end ?? typing.now, typing.now) + restMs;
      while ((await surface.inGame((w) => w.performance.now())) < until) await sleep(100);
      if (surface.beatFinished) {
        const finishBy = Date.now() + fireTimeoutMs;
        while (!(await surface.beatFinished()) && Date.now() < finishBy) await sleep(100);
      }
      const layersAfter = tracker.snapshot();
      const read = await surface.inGame(pacingRead, { firedName, sinceClicks: before.clicks });
      const file = await stopTrace();
      const plan = planFor(fixture, read.line);
      const record = {
        ...read,
        kind: plan?.kind ?? (fixture ? "unlisted" : null),
        motion: plan?.motion ?? false,
        text: plan?.text ?? read.text,
        typingEnd: typing.end,
        mouthChanges: read.morph.filter((m) => m.kind === "swap").map((m) => m.t),
      };
      record.layers = await describeLayers(surface.sendGame, layerPaints(layersBefore, layersAfter), layersAfter);
      const trace = parseTrace(JSON.parse(fs.readFileSync(file, "utf8")));
      const pageMarks = [read.clickName && { name: read.clickName, startTime: read.clickAt }, { name: firedName, startTime: read.firedAt }, read.receivedAt != null && { name: `beat received ${read.label}`, startTime: read.receivedAt }].filter(Boolean);
      const clock = clockOffset(trace.marks, pageMarks);
      const line = clock ? analyzeLine(trace, record, clock) : { line: read.line, kind: record.kind, failure: "the trace held none of the line's marks" };
      line.listed = plan?.line ?? null;
      line.page = { clickAt: read.clickAt, receivedAt: read.receivedAt, firedAt: read.firedAt, typingEnd: typing.end, mouthChanges: record.mouthChanges, clockOffset: clock?.offset ?? null };
      line.morphChanges = { swaps: record.mouthChanges.length, other: read.morph.length - record.mouthChanges.length };
      line.traceMB = Math.round(fs.statSync(file).size / 1e5) / 10;
      if (!keepTrace) fs.rmSync(file, { force: true });
      run.lines.push(line);
      log(`pacing: line ${line.line} ${line.kind ?? ""} click>fire ${line.waitMs} ms, first second longest stall ${line.firstSecond?.stalls.longestMs ?? "-"} ms${line.failure ? ` FAILED ${line.failure}` : ""}`);
      if (surface.screenshot) await surface.screenshot(path.join(out, `line-${String(n).padStart(2, "0")}-${line.line}.png`)).catch(() => {});
      if (expected && plan === expected[expected.length - 1]) break;
    }
  } catch (error) {
    run.failed.push(String(error?.stack ?? error));
  } finally {
    tracker.stop();
    await surface.sendGame("LayerTree.disable", {}).catch(() => {});
  }
  if (expected) {
    const missing = expected.filter((l) => !run.lines.some((r) => r.listed === l.line)).map((l) => `${l.line} (${l.kind})`);
    if (missing.length) run.failed.push(`fixture lines never measured: ${missing.join(", ")}`);
  }
  return run;
}

export function readFixture(dir) {
  const file = path.join(dir, "lines.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

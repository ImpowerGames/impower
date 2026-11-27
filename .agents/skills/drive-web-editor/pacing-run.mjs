import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FIRST_SECOND_MS, MOUTH_WINDOW_MS, TRACE_CATEGORIES, analyzeLine, clockOffset, cpuLoad, layerPaints, parseTrace, quietness } from "./pacing-analysis.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const PACING_DEFAULTS = { restMs: 1500, settleMs: 300, quietSampleMs: 3000, fireTimeoutMs: 20000, beats: 10 };

export function pacingProbe(w) {
  if (w.__pacing) return "already";
  const P = (w.__pacing = { clicks: 0, morph: [], paints: [], roots: new Set() });
  const canvas = w.CanvasRenderingContext2D?.prototype;
  if (canvas && !canvas.__pacingPaints) {
    const clear = canvas.clearRect;
    canvas.clearRect = function (...args) {
      const root = this.canvas?.getRootNode?.();
      const host = root && root !== this.canvas ? root.host : null;
      const span = host?.classList?.contains("morph") ? host.parentElement : null;
      if (span) w.__pacing?.paints.push({ t: w.performance.now(), image: span.getAttribute("image") ?? "" });
      return clear.apply(this, args);
    };
    canvas.__pacingPaints = true;
  }
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

export function pacingTypingEnd(w, firedName) {
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
  return { end, now: w.performance.now(), fired: firedName ? (w.performance.getEntriesByName(firedName, "mark")[0]?.startTime ?? null) : null };
}

export function pacingMotion(w, firedName) {
  const fired = w.performance.getEntriesByName(firedName, "mark")[0]?.startTime;
  if (fired == null) return null;
  const timeline = w.document.timeline;
  let longest = null;
  for (const animation of w.document.getAnimations()) {
    const target = animation.effect?.target;
    if (!target || target.classList?.contains("text_letter")) continue;
    const timing = animation.effect.getComputedTiming();
    if (!Number.isFinite(timing.activeDuration) || timing.activeDuration < 500) continue;
    const start = (animation.startTime ?? timeline.currentTime) + (animation.effect.getTiming().delay ?? 0);
    if (start < fired - 100 || start > fired + 1000) continue;
    if (!longest || timing.activeDuration > longest.end - longest.start) {
      const cls = typeof target.className === "string" ? target.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
      const image = target.getAttribute?.("image");
      longest = { start, end: start + timing.activeDuration, target: `${target.localName}${cls ? "." + cls : ""}${image ? `[image=${image}]` : ""}` };
    }
  }
  return longest;
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
  const firedAt = fired?.startTime ?? Infinity;
  const canvasPaints = {};
  const posePaints = [];
  for (const paint of w.__pacing.paints.filter((p) => p.t >= from)) {
    const counts = (canvasPaints[paint.image] ??= { beforeFire: 0, afterFire: 0 });
    if (paint.t < firedAt) counts.beforeFire += 1;
    else {
      counts.afterFire += 1;
      posePaints.push(paint.t);
    }
  }
  w.__pacing.paints = w.__pacing.paints.filter((p) => p.t >= w.performance.now() - 100);
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
    canvasPaints,
    posePaints,
    text: lineText,
  };
}

const SVG_LAYER_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../packages/spark-web-player/src/app/morph/svgLayerFile.ts");

export function svgFilesOf(project) {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.svg$/i.test(entry.name)) found.push({ path: path.relative(project, full).split(path.sep).join("/"), text: fs.readFileSync(full, "utf8") });
    }
  };
  if (project && fs.existsSync(project)) walk(project);
  return found.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export async function svgVerdictProbe() {
  const require = createRequire(import.meta.url);
  const esbuild = require("esbuild");
  const built = await esbuild.build({ entryPoints: [SVG_LAYER_FILE], bundle: true, format: "iife", globalName: "svgLayer", platform: "browser", write: false, logLevel: "silent" });
  const body = `${built.outputFiles[0].text}
return (async () => {
  const results = [];
  for (const file of files) {
    try {
      const img = new w.Image();
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(file.text);
      try { await img.decode(); } catch {}
      const natural = { width: img.naturalWidth, height: img.naturalHeight };
      const read = svgLayer.readSvgLayer(file.text, new w.DOMParser(), { view: w, natural });
      if ("reason" in read) {
        results.push({ path: file.path, verdict: read.reason, ...(read.declaration !== undefined ? { declaration: read.declaration } : {}) });
        continue;
      }
      const scale = Math.min(1, 2048 / Math.max(1, natural.width, natural.height));
      const width = Math.max(1, Math.round((natural.width || 512) * scale));
      const height = Math.max(1, Math.round((natural.height || 512) * scale));
      const raster = await svgLayer.browserSvgLayerRasterizer(read.source, natural, width, height, w.document);
      results.push({ path: file.path, verdict: raster ? "drawn" : "undrawn" });
      raster?.release();
    } catch (error) {
      results.push({ path: file.path, verdict: "error", error: String(error) });
    }
  }
  return results;
})();`;
  return new Function("w", "files", body);
}

export async function svgVerdicts(surface, project) {
  const files = svgFilesOf(project);
  if (files.length === 0) return { files: [], counts: {} };
  const results = await surface.inGame(await svgVerdictProbe(), files);
  const counts = {};
  for (const result of results) counts[result.verdict] = (counts[result.verdict] ?? 0) + 1;
  return { counts, files: results };
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
  let seen = null;
  const off = on("LayerTree.layerTreeDidChange", (params) => {
    if (!params?.layers) return;
    const next = new Map();
    for (const layer of params.layers) next.set(layer.layerId, layer);
    layers = next;
    if (seen) for (const [id, layer] of next) seen.set(id, layer);
  });
  return {
    begin: () => {
      seen = new Map(layers);
      return new Map(layers);
    },
    observed: () => new Map(seen ?? layers),
    stop: off,
  };
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
  const { out, fixture, project, beats, restMs, settleMs, quietSampleMs, fireTimeoutMs, keepTrace, quietLimit, log = () => {} } = { ...PACING_DEFAULTS, ...options };
  const run = { lines: [], failed: [] };
  await surface.inGame(pacingProbe);
  if (project) {
    try {
      run.svgFiles = await svgVerdicts(surface, project);
      log(`pacing: SVG files ${Object.entries(run.svgFiles.counts).map(([verdict, n]) => `${verdict} ${n}`).join(", ") || "none"}`);
    } catch (error) {
      run.svgFiles = { error: String(error?.message ?? error) };
    }
  }
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
      const layersBefore = tracker.begin();
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
      const typing = await surface.inGame(pacingTypingEnd, firedName);
      await sleep(300);
      const motion = await surface.inGame(pacingMotion, firedName);
      const until = Math.max((typing.end ?? typing.now) + MOUTH_WINDOW_MS, motion?.end ?? 0, (typing.fired ?? typing.now) + FIRST_SECOND_MS, typing.now) + restMs;
      while ((await surface.inGame((w) => w.performance.now())) < until) await sleep(100);
      if (surface.beatFinished) {
        const finishBy = Date.now() + fireTimeoutMs;
        while (!(await surface.beatFinished()) && Date.now() < finishBy) await sleep(100);
      }
      const layersAfter = tracker.observed();
      const read = await surface.inGame(pacingRead, { firedName, sinceClicks: before.clicks });
      const file = await stopTrace();
      const plan = planFor(fixture, read.line);
      const record = {
        ...read,
        kind: plan?.kind ?? (fixture ? "unlisted" : null),
        motion: fixture ? (plan?.motion ?? false) : motion != null,
        text: plan?.text ?? read.text,
        typingEnd: typing.end,
        motionWindow: motion,
        mouthChanges: [...read.morph.filter((m) => m.kind === "swap").map((m) => m.t), ...(read.posePaints ?? [])].sort((a, b) => a - b),
      };
      record.layers = await describeLayers(surface.sendGame, layerPaints(layersBefore, layersAfter), layersAfter);
      const trace = parseTrace(JSON.parse(fs.readFileSync(file, "utf8")));
      const pageMarks = [read.clickName && { name: read.clickName, startTime: read.clickAt }, { name: firedName, startTime: read.firedAt }, read.receivedAt != null && { name: `beat received ${read.label}`, startTime: read.receivedAt }].filter(Boolean);
      const clock = clockOffset(trace.marks, pageMarks);
      const line = clock ? analyzeLine(trace, record, clock) : { line: read.line, kind: record.kind, failure: "the trace held none of the line's marks" };
      line.listed = plan?.line ?? null;
      line.page = { clickAt: read.clickAt, receivedAt: read.receivedAt, firedAt: read.firedAt, typingEnd: typing.end, motionWindow: motion, mouthChanges: record.mouthChanges, clockOffset: clock?.offset ?? null };
      const swaps = read.morph.filter((m) => m.kind === "swap").length;
      line.morphChanges = { swaps, canvas: read.posePaints?.length ?? 0, other: read.morph.length - swaps };
      line.canvasPaints = read.canvasPaints;
      line.traceMB = Math.round(fs.statSync(file).size / 1e5) / 10;
      if (!keepTrace) fs.rmSync(file, { force: true });
      run.lines.push(line);
      if (line.failure) run.failed.push(`line ${line.line}: ${line.failure}`);
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

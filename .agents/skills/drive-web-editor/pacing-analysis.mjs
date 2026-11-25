export const TRACE_CATEGORIES = ["benchmark", "blink.user_timing", "disabled-by-default-devtools.timeline"];
export const MERGE_MS = 2;
export const FIRST_SECOND_MS = 1000;
export const GRAPHICS_TASK_MS = 25;
export const PAGE_TASK_MS = 50;
export const MOUTH_WINDOW_MS = 30;
export const REPEAT_LIMIT_MS = 20;
export const QUIET_LIMIT_PERCENT = 25;
export const TALK_KINDS = ["talk", "talk-pan"];

const toMs = (us) => us / 1000;
const round = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10) / 10);

export function quantile(values, q) {
  const sorted = values.filter((v) => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
}

const reporterState = (e) => String((e.args?.chrome_frame_reporter ?? e.args?.frame_reporter)?.state ?? "");
const reporterId = (e) => `${e.pid}:${e.id ?? e.id2?.local ?? e.id2?.global ?? ""}`;
const isUserTiming = (e) => typeof e.cat === "string" && e.cat.split(",").includes("blink.user_timing") && ["R", "I", "i", "n"].includes(e.ph);

export function parseTrace(raw) {
  const events = Array.isArray(raw) ? raw : (raw?.traceEvents ?? []);
  const threadNames = new Map();
  for (const e of events) if (e.ph === "M" && e.name === "thread_name") threadNames.set(`${e.pid}:${e.tid}`, e.args?.name);
  const gpuThreads = new Set([...threadNames].filter(([, name]) => name === "CrGpuMain").map(([key]) => key));
  const marks = [];
  const graphics = [];
  const tasks = new Map();
  const reporters = [];
  for (const e of events) {
    const key = `${e.pid}:${e.tid}`;
    if (e.ph === "X" && e.name === "GPUTask" && gpuThreads.has(key)) graphics.push({ ts: toMs(e.ts), dur: toMs(e.dur ?? 0) });
    else if (e.ph === "X" && e.name === "RunTask") {
      if (!tasks.has(key)) tasks.set(key, []);
      tasks.get(key).push({ ts: toMs(e.ts), dur: toMs(e.dur ?? 0) });
    } else if (e.name === "PipelineReporter") reporters.push(e);
    else if (isUserTiming(e)) marks.push({ name: e.name, ts: toMs(e.ts), pid: e.pid, tid: e.tid });
  }
  graphics.sort((a, b) => a.ts - b.ts);
  for (const list of tasks.values()) list.sort((a, b) => a.ts - b.ts);
  const frames = new Map();
  const frameList = (pid) => {
    if (!frames.has(pid)) frames.set(pid, { ends: [], dropped: [] });
    return frames.get(pid);
  };
  const open = new Map();
  for (const e of reporters.sort((a, b) => a.ts - b.ts)) {
    if (e.ph === "b") open.set(reporterId(e), e);
    else if (e.ph === "e") {
      const begin = open.get(reporterId(e));
      if (!begin) continue;
      open.delete(reporterId(e));
      addFrame(frameList(begin.pid), toMs(begin.ts), toMs(e.ts), reporterState(begin) || reporterState(e));
    } else if (e.ph === "X") addFrame(frameList(e.pid), toMs(e.ts), toMs(e.ts + (e.dur ?? 0)), reporterState(e));
  }
  const byPid = new Map();
  for (const [pid, list] of frames) byPid.set(pid, { presented: mergePresentations(list.ends), dropped: list.dropped.sort((a, b) => a - b) });
  let endsAt = null;
  for (const e of events) if (e.ph !== "M" && typeof e.ts === "number") endsAt = Math.max(endsAt ?? 0, toMs(e.ts + (e.dur ?? 0)));
  return { marks, graphics, tasks, frames: byPid, graphicsThreads: gpuThreads.size, endsAt };
}

function addFrame(list, begin, end, state) {
  if (/PRESENTED/.test(state)) list.ends.push(end);
  else if (/DROPPED/.test(state)) list.dropped.push(begin);
}

export function mergePresentations(ends, within = MERGE_MS) {
  const merged = [];
  for (const end of [...ends].sort((a, b) => a - b)) {
    if (!merged.length || end - merged[merged.length - 1] > within) merged.push(end);
  }
  return merged;
}

export function stallsIn(presented, dropped, from, to) {
  const list = [];
  for (let i = 1; i < presented.length; i++) {
    const a = presented[i - 1];
    const b = presented[i];
    if (b <= from || a >= to) continue;
    if (dropped.some((d) => d >= a && d < b)) list.push({ from: a, to: b, ms: b - a });
  }
  return {
    count: list.length,
    longestMs: round(list.reduce((m, s) => Math.max(m, s.ms), 0)),
    totalMs: round(list.reduce((sum, s) => sum + s.ms, 0)),
    list,
  };
}

export function framesPerSecond(presented, from, to) {
  if (!(to > from)) return null;
  return round(presented.filter((t) => t >= from && t < to).length / ((to - from) / 1000));
}

export function countIn(times, from, to) {
  return times.filter((t) => t >= from && t < to).length;
}

export function tasksIn(tasks, from, to, longest, origin = from) {
  let total = 0;
  const long = [];
  for (const task of tasks) {
    const end = task.ts + task.dur;
    if (end <= from || task.ts >= to) continue;
    total += Math.min(end, to) - Math.max(task.ts, from);
    if (task.ts >= from && task.dur >= longest) long.push({ atMs: round(task.ts - origin), ms: round(task.dur) });
  }
  return { ms: round(total), long, longestMs: round(long.reduce((m, t) => Math.max(m, t.ms), 0)) };
}

export function busyAfter(tasks, times, span = MOUTH_WINDOW_MS) {
  const values = times.map((t) => tasksIn(tasks, t, t + span, Infinity).ms ?? 0);
  return {
    changes: values.length,
    meanMs: values.length ? round(values.reduce((a, b) => a + b, 0) / values.length) : null,
    medianMs: round(quantile(values, 0.5)),
    p90Ms: round(quantile(values, 0.9)),
    maxMs: round(values.length ? Math.max(...values) : null),
  };
}

export function clockOffset(traceMarks, pageMarks) {
  const diffs = [];
  const threads = new Map();
  for (const mark of pageMarks) {
    const seen = traceMarks.filter((m) => m.name === mark.name);
    if (seen.length !== 1) continue;
    diffs.push(seen[0].ts - mark.startTime);
    const key = `${seen[0].pid}:${seen[0].tid}`;
    threads.set(key, (threads.get(key) ?? 0) + 1);
  }
  if (!diffs.length) return null;
  const thread = [...threads].sort((a, b) => b[1] - a[1])[0][0];
  const [pid, tid] = thread.split(":").map(Number);
  const offset = quantile(diffs, 0.5);
  return { offset, pid, tid, matched: diffs.length, spreadMs: round(Math.max(...diffs) - Math.min(...diffs)) };
}

export function layerPaints(before, after, describe = () => null) {
  const painted = [];
  for (const [id, layer] of after) {
    if (!layer.drawsContent) continue;
    const was = before.get(id)?.paintCount ?? 0;
    const paints = layer.paintCount - was;
    if (paints > 0) painted.push({ id, size: `${Math.round(layer.width)}x${Math.round(layer.height)}`, paints, node: describe(layer) });
  }
  return painted.sort((a, b) => b.paints - a.paints);
}

export function analyzeLine(trace, record, clock) {
  const at = (t) => (t == null ? null : t + clock.offset);
  const click = at(record.clickAt);
  const fired = at(record.firedAt);
  const out = {
    line: record.line,
    kind: record.kind ?? null,
    text: record.text ?? null,
    waitMs: record.clickAt != null && record.firedAt != null ? round(record.firedAt - record.clickAt) : null,
    beatWaitMs: round(record.beatWaitMs),
    layers: record.layers ?? [],
  };
  if (fired == null) return { ...out, failure: "no beat fired after the click" };
  const frames = trace.frames.get(clock.pid);
  if (!frames?.presented.length) return { ...out, failure: "the trace holds no frame that reached the screen from the page's renderer" };
  if (trace.endsAt != null && trace.endsAt < fired + FIRST_SECOND_MS) return { ...out, failure: `the trace ends ${round(trace.endsAt - fired)} ms after the fire, before the first second was captured` };
  const firstEnd = fired + FIRST_SECOND_MS;
  const lastShown = frames.presented[frames.presented.length - 1];
  const measuredTo = Math.max(firstEnd, at(record.typingEnd) ?? 0, record.motion ? (at(record.motionWindow?.end) ?? 0) : 0);
  if (lastShown < measuredTo && frames.dropped.some((d) => d >= lastShown)) {
    return { ...out, failure: `a stall that began ${round(lastShown - fired)} ms after the fire had not ended when the trace stopped, so its length is unknown` };
  }
  const graphics = tasksIn(trace.graphics, fired, firstEnd, GRAPHICS_TASK_MS, fired);
  const page = tasksIn(trace.tasks.get(`${clock.pid}:${clock.tid}`) ?? [], click ?? fired, firstEnd, PAGE_TASK_MS, fired);
  const stalls = stallsIn(frames.presented, frames.dropped, fired, firstEnd);
  out.firstSecond = {
    stalls: { count: stalls.count, longestMs: stalls.longestMs, totalMs: stalls.totalMs },
    droppedFrames: countIn(frames.dropped, fired, firstEnd),
    framesPerSecond: framesPerSecond(frames.presented, fired, firstEnd),
    graphicsMs: trace.graphicsThreads ? graphics.ms : null,
    graphicsTasks: trace.graphicsThreads ? graphics.long : null,
  };
  out.pageThread = { fromClockMs: page.ms, longTasks: page.long, longestMs: page.longestMs };
  const typingEnd = at(record.typingEnd);
  if (typingEnd != null && typingEnd > fired) {
    out.typing = {
      ms: round(typingEnd - fired),
      droppedFrames: countIn(frames.dropped, fired, typingEnd),
      framesPerSecond: framesPerSecond(frames.presented, fired, typingEnd),
    };
  }
  if (record.motion) {
    const from = at(record.motionWindow?.start);
    const to = at(record.motionWindow?.end);
    if (from == null || !(to > from)) out.failure = "no pan or zoom animation ran after the line fired";
    else {
      out.motion = {
        target: record.motionWindow.target ?? null,
        ms: round(to - from),
        framesPerSecond: framesPerSecond(frames.presented, from, to),
        droppedFrames: countIn(frames.dropped, from, to),
      };
      out.motionFramesPerSecond = out.motion.framesPerSecond;
    }
  }
  const mouth = (record.mouthChanges ?? []).map(at).filter((t) => t != null && t >= fired && (typingEnd == null || t < typingEnd));
  out.mouth = trace.graphicsThreads ? busyAfter(trace.graphics, mouth) : { changes: mouth.length };
  return out;
}

export function cpuLoad(before, after) {
  let idle = 0;
  let total = 0;
  for (let i = 0; i < Math.min(before.length, after.length); i++) {
    const a = before[i].times;
    const b = after[i].times;
    const sum = (t) => t.user + t.nice + t.sys + t.idle + t.irq;
    idle += b.idle - a.idle;
    total += sum(b) - sum(a);
  }
  return total > 0 ? round(100 * (1 - idle / total)) : null;
}

export function quietness(loadPercent, limit = QUIET_LIMIT_PERCENT) {
  if (loadPercent == null) return { loadPercent, limit, quiet: false, verdict: "not quiet: the machine's CPU load could not be read" };
  const quiet = loadPercent < limit;
  return { loadPercent, limit, quiet, verdict: quiet ? `quiet: CPU load ${loadPercent}% before the lines played, under ${limit}%` : `not quiet: CPU load ${loadPercent}% before the lines played, at or over ${limit}%; the figures are not judged` };
}

export function repeatability(runs, limit = REPEAT_LIMIT_MS) {
  const byLine = new Map();
  for (const run of runs) {
    for (const line of run.lines ?? []) {
      if (!TALK_KINDS.includes(line.kind) || !line.firstSecond) continue;
      const key = line.listed ?? line.line;
      if (!byLine.has(key)) byLine.set(key, []);
      byLine.get(key).push(line.firstSecond.stalls.longestMs);
    }
  }
  const lines = [...byLine]
    .filter(([, figures]) => figures.length === runs.length)
    .map(([line, figures]) => ({ line, figures, spreadMs: round(Math.max(...figures) - Math.min(...figures)) }));
  if (runs.length < 2 || !lines.length) return { lines, limit, within: null, verdict: "one run, or no talking line measured in every run: repeatability not judged" };
  const within = lines.every((l) => l.spreadMs <= limit);
  const quiet = runs.every((run) => run.quiet?.quiet);
  const failed = runs.some((run) => run.failed?.length);
  const listed = lines.map((l) => `line ${l.line} ${l.figures.join("/")} ms (spread ${l.spreadMs})`).join(", ");
  const judged = failed ? "not judged, because at least one run failed" : !quiet ? "not judged, because at least one run was not quiet" : within ? "repeatable" : "not repeatable";
  return {
    lines,
    limit,
    within: failed || !quiet ? null : within,
    quiet,
    verdict: `${judged}: each occurrence of the talking line's longest stall in the first second across ${runs.length} runs, ${within ? "every one within" : "not every one within"} ${limit} ms: ${listed}`,
  };
}

const cell = (v, width) => String(v ?? "-").padStart(width);

export function pictureLayers(layers) {
  return (layers ?? []).flatMap((layer) => {
    const image = /\[image=([^\]]*)\]/.exec(layer.node ?? "")?.[1];
    return image ? [{ image, size: layer.size, paints: layer.paints }] : [];
  });
}

export function formatReport(report) {
  const out = [];
  out.push(`${report.surface}: ${report.project}${report.commit ? ` at ${report.commit}` : ""}`);
  const env = report.environment ?? {};
  out.push(`game view ${env.gameView ?? "-"}, graphics ${env.graphics ?? "-"}, refresh ${env.refreshHz ?? "-"} Hz, CPU ${env.cpu ?? "-"}`);
  for (const [index, run] of (report.runs ?? []).entries()) {
    out.push(`run ${index + 1}: ${run.quiet?.verdict ?? "quietness unknown"}${run.failed?.length ? `; failed: ${run.failed.join("; ")}` : ""}`);
    out.push("  line kind            click>fire  wait | 1st s: stalls longest total dropped fps graphics >=25ms | page ms >=50ms | mouth n ms/30ms | motion fps | picture layer paints");
    for (const l of run.lines ?? []) {
      const s = l.firstSecond ?? {};
      const groups = new Map();
      for (const layer of pictureLayers(l.layers)) groups.set(layer.image, [...(groups.get(layer.image) ?? []), layer.paints]);
      const layers = [...groups].map(([image, paints]) => `${image} ${paints.join(",")}`).join("; ");
      out.push(
        `  ${cell(l.line, 4)} ${String(l.kind ?? "-").padEnd(15)} ${cell(l.waitMs, 9)} ${cell(l.beatWaitMs, 5)} | ${cell(s.stalls?.count, 13)} ${cell(s.stalls?.longestMs, 7)} ${cell(s.stalls?.totalMs, 5)} ${cell(s.droppedFrames, 7)} ${cell(s.framesPerSecond, 3)} ${cell(s.graphicsMs, 8)} ${cell(s.graphicsTasks?.length, 6)} | ${cell(l.pageThread?.fromClockMs, 7)} ${cell(l.pageThread?.longTasks?.length, 6)} | ${cell(l.mouth?.changes, 7)} ${cell(l.mouth?.meanMs, 7)} | ${cell(l.motionFramesPerSecond, 10)} | ${layers}${l.failure ? `  FAILED: ${l.failure}` : ""}`,
      );
    }
  }
  if (report.repeatability) out.push(report.repeatability.verdict);
  return out.join("\n");
}

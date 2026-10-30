#!/usr/bin/env node

import fs from "node:fs";
import { SourceMap } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { within } from "./phaseGaps.mjs";

export function parseShareArgs(args) {
  const out = { profiles: [], under: [], inclusive: [], min: 0.2 };
  for (let i = 0; i < args.length; i++) {
    const name = args[i];
    const next = () => {
      const v = args[++i];
      if (v == null || v.startsWith("--")) throw new Error(`${name} needs a value`);
      return v;
    };
    if (name === "--under") out.under = next().split(",");
    else if (name === "--inclusive") out.inclusive = next().split(",");
    else if (name === "--groups") out.groups = next();
    else if (name === "--min") out.min = Number(next());
    else if (name === "--json") out.json = next();
    else if (name === "--gaps") out.gaps = true;
    else if (name === "--by-path") out.byPath = true;
    else if (name === "--windows") out.windows = true;
    else if (name.startsWith("--")) throw new Error(`unknown argument ${name}`);
    else out.profiles.push(name);
  }
  if (!out.profiles.length) throw new Error("pass a .cpuprofile file");
  if (!out.under.length) throw new Error("pass --under <function>");
  return out;
}

function selfTimes(profile, keep) {
  const self = new Map();
  const { samples, timeDeltas } = profile;
  let timestamp = profile.startTime;
  let kept = 0;
  for (let i = 0; i < samples.length; i++) {
    timestamp += timeDeltas[i];
    if (keep && !keep(timestamp)) continue;
    kept++;
    const dt = timeDeltas[i + 1] ?? 0;
    self.set(samples[i], (self.get(samples[i]) ?? 0) + dt);
  }
  return { self, kept };
}

export function profileShares(profile, { under, inclusive = [], groups, keep, nameOf = (frame) => frame.functionName || "(anonymous)" }) {
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const { self, kept } = selfTimes(profile, keep);
  const byFunction = new Map();
  const inclusiveTime = new Map(inclusive.map((fn) => [fn, 0]));
  let total = 0;
  const visit = (node, inside, open) => {
    const fn = node.callFrame.functionName;
    inside ||= under.includes(fn);
    const opened = inside && inclusiveTime.has(fn) && !open.has(fn) ? fn : undefined;
    if (opened) open.add(opened);
    const t = self.get(node.id) ?? 0;
    if (inside && t) {
      total += t;
      const name = nameOf(node.callFrame);
      byFunction.set(name, (byFunction.get(name) ?? 0) + t);
      for (const o of open) inclusiveTime.set(o, inclusiveTime.get(o) + t);
    }
    for (const child of node.children ?? []) visit(nodes.get(child), inside, open);
    if (opened) open.delete(opened);
  };
  visit(profile.nodes[0], false, new Set());
  const functions = [...byFunction.entries()]
    .map(([name, t]) => ({ name, share: t / total, group: groups?.find(([, re]) => re.test(name))?.[0] ?? (groups ? "(unassigned)" : undefined) }))
    .sort((a, b) => b.share - a.share);
  const groupShares = new Map();
  for (const f of functions) if (f.group) groupShares.set(f.group, (groupShares.get(f.group) ?? 0) + f.share);
  const profiled = [...self.values()].reduce((a, b) => a + b, 0);
  const collector = profile.nodes.filter((n) => n.callFrame.functionName === "(garbage collector)").reduce((a, n) => a + (self.get(n.id) ?? 0), 0);
  const ratio = (t, of) => (of ? t / of : 0);
  return {
    under,
    underMs: total / 1000,
    keptSamples: kept,
    keptMs: profiled / 1000,
    shareOfProfile: ratio(total, profiled),
    collectorShareOfProfile: ratio(collector, profiled),
    groups: [...groupShares.entries()].map(([group, share]) => ({ group, share })).sort((a, b) => b.share - a.share),
    inclusive: [...inclusiveTime.entries()].map(([fn, t]) => ({ function: fn, share: ratio(t, total) })),
    functions,
  };
}

export function summarizeShares(results) {
  const row = (label, shares) => {
    const sorted = [...shares].sort((a, b) => a - b);
    return { label, min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], max: sorted.at(-1) };
  };
  const groups = [...new Set(results.flatMap((r) => r.groups.map((g) => g.group)))];
  return [
    ...groups.map((group) =>
      row(
        group,
        results.map((r) => r.groups.find((g) => g.group === group)?.share ?? 0),
      ),
    ),
    ...results[0].inclusive.map(({ function: fn }) =>
      row(
        `inclusive ${fn}`,
        results.map((r) => r.inclusive.find((f) => f.function === fn).share),
      ),
    ),
    row(
      "(garbage collector, share of the whole profile)",
      results.map((r) => r.collectorShareOfProfile),
    ),
  ];
}

export function repositoryPath(source) {
  const s = source.replace(/\\/g, "/");
  const at = s.search(/(^|\/)(packages|node_modules|scripts)\//);
  return at < 0 ? path.basename(s) : s.slice(s[at] === "/" ? at + 1 : at);
}

function sourceNamer(profilePath, byPath = false) {
  const maps = new Map();
  return (frame) => {
    const fn = frame.functionName || "(anonymous)";
    if (!frame.url?.startsWith("file:")) return `${frame.url ? path.basename(frame.url) : "(vm)"}:${fn}`;
    const bundle = fileURLToPath(frame.url);
    if (!maps.has(bundle)) {
      const beside = path.join(path.dirname(profilePath), path.basename(bundle) + ".map");
      const found = [bundle + ".map", beside].find((p) => fs.existsSync(p));
      maps.set(bundle, found ? new SourceMap(JSON.parse(fs.readFileSync(found, "utf8"))) : null);
    }
    const entry = maps.get(bundle)?.findEntry(frame.lineNumber, frame.columnNumber);
    const file = entry?.originalSource ? (byPath ? repositoryPath(entry.originalSource) : path.basename(entry.originalSource)) : path.basename(bundle);
    return `${file}:${fn}`;
  };
}

async function main(args) {
  const options = parseShareArgs(args);
  let groups;
  if (options.groups) {
    const at = options.groups.lastIndexOf(":");
    const module = await import(pathToFileURL(path.resolve(options.groups.slice(0, at))).href);
    groups = module[options.groups.slice(at + 1)];
    if (!Array.isArray(groups)) throw new Error(`${options.groups} is not a list of [group, RegExp]`);
  }
  const results = options.profiles.map((file) => {
    let keep;
    let perSample = 1;
    if (options.gaps) {
      const gapsFile = file.replace(/\.cpuprofile$/, "") + ".gaps.json";
      if (!fs.existsSync(gapsFile)) throw new Error(`--gaps needs ${gapsFile}, which preview-bench.mjs --cpu-prof writes`);
      const { samples } = JSON.parse(fs.readFileSync(gapsFile, "utf8"));
      const gaps = samples.flat().sort((a, b) => a[0] - b[0]);
      keep = (timestamp) => within(gaps, timestamp);
      perSample = samples.length;
    } else if (options.windows) {
      const windowsFile = file.replace(/\.cpuprofile$/, "") + ".windows.json";
      if (!fs.existsSync(windowsFile)) throw new Error(`--windows needs ${windowsFile}, which preview-bench.mjs --cpu-prof writes`);
      const { samples } = JSON.parse(fs.readFileSync(windowsFile, "utf8"));
      const windows = samples.flat().sort((a, b) => a[0] - b[0]);
      keep = (timestamp) => within(windows, timestamp);
      perSample = samples.length;
    }
    const result = profileShares(JSON.parse(fs.readFileSync(file, "utf8")), { under: options.under, inclusive: options.inclusive, groups, keep, nameOf: sourceNamer(path.resolve(file), options.byPath) });
    if (options.windows) return { ...result, underMsPerSample: result.underMs / perSample };
    return options.gaps ? { ...result, gapMsPerSample: result.keptMs / perSample } : result;
  });
  const result = results[0];
  if (options.json) fs.writeFileSync(options.json, JSON.stringify(results.length > 1 ? results : result, null, 2));
  const pct = (share) => (share * 100).toFixed(1).padStart(6) + "%";
  if (options.windows) {
    console.log(`only the measured samples: ${results.map((r) => r.underMsPerSample.toFixed(1)).join(", ")} ms of profiled time under ${options.under.join(", ")} per benchmark sample`);
  }
  if (options.gaps) {
    console.log(`only the unattributed stretches: ${results.map((r) => r.gapMsPerSample.toFixed(1)).join(", ")} ms of profiled time per benchmark sample`);
    if (results.every((r) => r.keptSamples === 0)) {
      console.log("no profiler sample landed in them: the stretches are shorter than the sampling interval, or there are none");
      return;
    }
  }
  if (results.length > 1) {
    console.log(`${results.length} profiles, shares of the time under ${options.under.join(", ")}`);
    console.log(`  ${"min".padStart(7)} ${"median".padStart(7)} ${"max".padStart(7)}`);
    for (const { label, min, median, max } of summarizeShares(results)) console.log(`  ${pct(min)} ${pct(median)} ${pct(max)}  ${label}`);
    console.log("");
    console.log("first profile:");
  }
  console.log(`time under ${options.under.join(", ")}: ${pct(result.shareOfProfile).trim()} of the profile; the garbage collector, which the profile shows outside every function, is ${pct(result.collectorShareOfProfile).trim()} of the profile`);
  for (const { function: fn, share } of result.inclusive) console.log(`  inclusive ${pct(share)}  ${fn}`);
  const list = (fns) => {
    for (const f of fns) if (f.share * 100 >= options.min) console.log(`    ${pct(f.share)}  ${f.name}`);
    const rest = fns.filter((f) => f.share * 100 < options.min);
    if (rest.length) console.log(`    ${pct(rest.reduce((a, f) => a + f.share, 0))}  (${rest.length} functions below ${options.min}%)`);
  };
  if (groups) {
    for (const { group, share } of result.groups) {
      console.log(`\n  ${pct(share)}  ${group}`);
      list(result.functions.filter((f) => f.group === group));
    }
  } else {
    console.log("");
    list(result.functions);
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  await main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 2;
  });
}

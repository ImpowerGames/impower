#!/usr/bin/env node
// Reads a V8 CPU profile written by engine-bench.mjs or preview-bench.mjs with
// --cpu-prof and divides the time spent under one function into shares.
//
//   node scripts/bench/profile-shares.mjs <file.cpuprofile> --under ContinueAsync --groups scripts/bench/profile-groups.mjs:STEPPING
//   node scripts/bench/profile-shares.mjs <file.cpuprofile> --under ExportRuntime --inclusive ResolveReferences,CheckForNamingCollisions
//
// Options:
//   --under <fn,..>      only time with one of these functions on the stack
//                        counts, and shares are of that time
//   --groups <file:NAME> a module exporting NAME, an ordered list of
//                        [group, RegExp]; a function belongs to the first group
//                        whose expression matches its `<source file>:<name>`.
//                        Prints each group's share of self time with every
//                        function assigned to it.
//   --inclusive <fn,..>  prints the share of time with each of these functions
//                        on the stack, its callees included
//   --min <percent>      leave functions below this share out of the listing
//                        (default 0.2); they still count towards their group
//   --json <file>        also write the result
//
// A sampling profiler charges call-heavy code more than it costs unprofiled,
// so these are shares to set beside an unprofiled time, never times themselves.
// Functions are named by the source file they came from when the bundle's
// source map (`<bundle>.map`) sits beside the profile, as the benchmarks put it.

import fs from "node:fs";
import { SourceMap } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function parseShareArgs(args) {
  const out = { under: [], inclusive: [], min: 0.2 };
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
    else if (name.startsWith("--")) throw new Error(`unknown argument ${name}`);
    else if (out.profile) throw new Error("pass one profile");
    else out.profile = name;
  }
  if (!out.profile) throw new Error("pass a .cpuprofile file");
  if (!out.under.length) throw new Error("pass --under <function>");
  return out;
}

// Self time per profile node, in microseconds: a sample's time is the delta
// that follows it.
function selfTimes(profile) {
  const self = new Map();
  const { samples, timeDeltas } = profile;
  for (let i = 0; i < samples.length; i++) {
    const dt = timeDeltas[i + 1] ?? 0;
    self.set(samples[i], (self.get(samples[i]) ?? 0) + dt);
  }
  return self;
}

/**
 * Shares of the time under `under`. `nameOf(callFrame)` names a function;
 * `groups` is an ordered list of [group, RegExp] or undefined.
 */
export function profileShares(profile, { under, inclusive = [], groups, nameOf = (frame) => frame.functionName || "(anonymous)" }) {
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = selfTimes(profile);
  const byFunction = new Map();
  const inclusiveTime = new Map(inclusive.map((fn) => [fn, 0]));
  let total = 0;
  const visit = (node, inside, open) => {
    const fn = node.callFrame.functionName;
    inside ||= under.includes(fn);
    // The outermost occurrence owns the inclusive time, so recursion counts once.
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
  return {
    under,
    shareOfProfile: total / profiled,
    collectorShareOfProfile: collector / profiled,
    groups: [...groupShares.entries()].map(([group, share]) => ({ group, share })).sort((a, b) => b.share - a.share),
    inclusive: [...inclusiveTime.entries()].map(([fn, t]) => ({ function: fn, share: t / total })),
    functions,
  };
}

// Names a call frame `<source file>:<function>` through the bundle's source
// map, or `<bundle file>:<function>` without one.
function sourceNamer(profilePath) {
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
    const file = entry?.originalSource ? path.basename(entry.originalSource) : path.basename(bundle);
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
  const profile = JSON.parse(fs.readFileSync(options.profile, "utf8"));
  const result = profileShares(profile, { under: options.under, inclusive: options.inclusive, groups, nameOf: sourceNamer(path.resolve(options.profile)) });
  if (options.json) fs.writeFileSync(options.json, JSON.stringify(result, null, 2));
  const pct = (share) => (share * 100).toFixed(1).padStart(6) + "%";
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

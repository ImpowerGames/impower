import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as run from "./issue-run.mjs";
import { readJournals } from "./review-checkpoint.mjs";
import { runHandoff } from "../../../scripts/agent-handoff.mjs";
import { readRepos } from "../../repos.mjs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "review-jobs-walk-"));
const fold = (p) => (process.platform === "win32" ? path.resolve(p).toLowerCase() : path.resolve(p));
const inside = (child, parent) => fold(child) === fold(parent) || fold(child).startsWith(fold(parent) + path.sep);
const coordinatorRow = JSON.stringify({ event: "coordinator", time: "2026-10-01T00:00:00Z", pid: 1 });

function jobs(name, { journal = false, probeFiles = 50 } = {}) {
  const root = path.join(tmp, `${name}.review-jobs`);
  const round = path.join(root, "pr-1", "round-1");
  const launch = path.join(round, "launch-a-1");
  const reviewer = path.join(round, "reviewer-undirected-1");
  fs.mkdirSync(launch, { recursive: true });
  const plan = path.join(launch, "plan.json");
  const journalFile = path.join(launch, "journal.jsonl");
  fs.writeFileSync(plan, JSON.stringify({ pr: 1, journal: journalFile, first: "review", steps: { review: { role: "review", round: 1 } } }));
  fs.writeFileSync(path.join(launch, "plan.coordinator.err.log"), "Error: refused at validation\n");
  if (journal) fs.writeFileSync(journalFile, coordinatorRow + "\n");
  const probe = path.join(reviewer, "probe");
  fs.mkdirSync(path.join(probe, ".git"), { recursive: true });
  for (let i = 0; i < probeFiles; i++) {
    const dir = path.join(probe, "src", `d${i % 10}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `f${i}.json`), JSON.stringify({ journal: "x.jsonl", steps: {} }));
  }
  fs.mkdirSync(path.join(reviewer, "npm-cache"), { recursive: true });
  fs.writeFileSync(path.join(reviewer, "npm-cache", "index.json"), "{}");
  const fixture = path.join(reviewer, "interruption-data-x", "src.review-jobs", "pr-1801");
  fs.mkdirSync(fixture, { recursive: true });
  fs.writeFileSync(path.join(fixture, "journal.jsonl"), coordinatorRow + "\n");
  const toolHome = path.join(launch, "handoff-0-review-x", "codex-home-y");
  fs.mkdirSync(path.join(toolHome, "sessions"), { recursive: true });
  for (let i = 0; i < probeFiles; i++) fs.writeFileSync(path.join(toolHome, "sessions", `s${i}.jsonl`), coordinatorRow + "\n");
  fs.writeFileSync(path.join(launch, "handoff-0-review-x", "process.log"), "launched\n");
  return { root, prDir: path.join(root, "pr-1"), round, launch, reviewer, toolHome, plan, journalFile };
}

const WATCHED = ["readdirSync", "statSync", "lstatSync", "openSync", "readFileSync", "existsSync"];
function traced(body, hook = () => {}) {
  const calls = [];
  const originals = Object.fromEntries(WATCHED.map((name) => [name, fs[name]]));
  let hooking = false;
  for (const name of WATCHED) fs[name] = function (target, ...rest) {
    if (typeof target === "string" && !hooking) {
      calls.push({ name, target });
      hooking = true;
      try { hook(name, target); } finally { hooking = false; }
    }
    return originals[name].call(this, target, ...rest);
  };
  try { return { result: body(), calls }; }
  finally { Object.assign(fs, originals); }
}

const failures = [];
const scenario = (name, body) => {
  try { body(); console.log(`ok   ${name}`); }
  catch (error) { failures.push(name); console.log(`FAIL ${name}\n${error.stack}`); }
};

scenario("the dead-launch sweep never enters a reviewer workspace, and its reads do not grow with what reviewers leave there", () => {
  const counts = [];
  for (const probeFiles of [10, 400]) {
    const f = jobs(`sweep-cost-${probeFiles}`, { probeFiles });
    const { result, calls } = traced(() => run.deadLaunches(f.root, [{ ticket: 1, pr: 1 }], () => []));
    assert.deepEqual(result.map((d) => d.plan), [f.plan], "the refused launch is still found");
    assert.deepEqual(calls.filter((c) => inside(c.target, f.reviewer) || inside(c.target, f.toolHome)).map((c) => `${c.name} ${c.target}`), [], "nothing under the reviewer workspace or the tool home is read");
    counts.push(calls.length);
  }
  assert.equal(counts[1], counts[0], `the sweep's fs calls grow with probe files: ${counts.join(" -> ")}`);
});

scenario("the checkpoint's journal reader never enters a reviewer workspace", () => {
  const f = jobs("journals-cost", { journal: true, probeFiles: 200 });
  const { result, calls } = traced(() => readJournals(f.prDir));
  assert.deepEqual(result.map((j) => j.file), [f.journalFile]);
  assert.deepEqual(calls.filter((c) => inside(c.target, f.reviewer) || inside(c.target, f.toolHome)).map((c) => `${c.name} ${c.target}`), [], "nothing under the reviewer workspace or the tool home is read");
});

scenario("a fixture journal nested in a reviewer's scratch directory is not counted as the PR's own (#1214)", () => {
  const f = jobs("journals-fixture", { journal: true, probeFiles: 0 });
  const found = readJournals(f.prDir);
  assert.deepEqual(found.map((j) => [j.file, Boolean(j.plan)]), [[f.journalFile, true]]);
});

scenario("each file in the job directory is statted at most once by either reader", () => {
  const f = jobs("stat-once", { journal: true, probeFiles: 0 });
  fs.writeFileSync(path.join(f.round, "notes.txt"), "not a plan");
  for (const [label, body] of [["dead-launch sweep", () => run.deadLaunches(f.root, [{ ticket: 1, pr: 1 }], () => [])], ["journal reader", () => readJournals(f.prDir)]]) {
    const { calls } = traced(body);
    const stats = new Map();
    for (const c of calls.filter((c) => ["statSync", "lstatSync"].includes(c.name))) stats.set(fold(c.target), (stats.get(fold(c.target)) ?? 0) + 1);
    const repeated = [...stats].filter(([, n]) => n > 1);
    assert.deepEqual(repeated, [], `${label} stats a file more than once`);
  }
});

const removedMidWalk = (label, read) => scenario(`a directory or file removed while ${label} reads it is skipped, never fatal`, () => {
  const f = jobs(`removed-${label.replace(/\W+/g, "-")}`, { journal: true, probeFiles: 0 });
  const doomedDir = path.join(f.round, "head-probe");
  fs.mkdirSync(path.join(doomedDir, "nested"), { recursive: true });
  fs.writeFileSync(path.join(doomedDir, "nested", "a.txt"), "probe");
  const doomedFile = path.join(f.round, "scratch.txt");
  fs.writeFileSync(doomedFile, "scratch");
  const { result } = traced(() => read(f), (name, target) => {
    if (name === "readdirSync" && fold(target) === fold(doomedDir)) fs.rmSync(doomedDir, { recursive: true, force: true });
    if (name !== "readdirSync" && fold(target) === fold(doomedFile)) fs.rmSync(doomedFile, { force: true });
  });
  return result;
});
removedMidWalk("the dead-launch sweep", (f) => run.deadLaunches(f.root, [{ ticket: 1, pr: 1 }], () => []));
removedMidWalk("the journal reader", (f) => assert.equal(readJournals(f.prDir).length, 1));

scenario("a journal the walk saw empty and its launcher filled before the census is not a dead launch", () => {
  const f = jobs("journal-filled", { probeFiles: 0 });
  fs.writeFileSync(f.journalFile, "");
  const { result } = traced(() => run.deadLaunches(f.root, [{ ticket: 1, pr: 1 }], () => []), (name, target) => {
    if (name === "readFileSync" && fold(target) === fold(f.plan)) fs.writeFileSync(f.journalFile, coordinatorRow + "\n");
  });
  assert.deepEqual(result, []);
});

const launcherRefusals = async () => {
  const name = "launcher refuses a plan or journal inside a directory the review-job readers skip";
  try {
    const root = path.join(tmp, "launcher.review-jobs");
    const worktree = path.join(tmp, "launcher-worktree");
    fs.mkdirSync(worktree, { recursive: true });
    const repos = path.join(tmp, "repos-off.json");
    fs.writeFileSync(repos, JSON.stringify({ ...readRepos(), cutover: false }));
    const attempt = (planDir, journalDir = planDir) => {
      fs.mkdirSync(planDir, { recursive: true });
      fs.mkdirSync(journalDir, { recursive: true });
      const file = path.join(planDir, "plan.json");
      const prompt = path.join(round, "prompt.txt");
      fs.writeFileSync(prompt, "review");
      fs.writeFileSync(file, JSON.stringify({ worktree, pr: 1, writer: "claude-opus-5-5", writerEffort: "medium", completedReviewRound: 0, maxSteps: 1, first: "review", journal: path.join(journalDir, "journal.jsonl"), steps: { review: { role: "review", round: 1, prompt, next: [null] } } }));
      return runHandoff(file, { jobRoot: root, slotRoot: path.join(tmp, "launcher-slots"), repos: readRepos(repos) }).then(() => null, (error) => error.message);
    };
    const round = path.join(root, "pr-1", "round-1");
    const hidden = /must not lie inside a reviewer workspace/;
    assert.match(await attempt(path.join(round, "reviewer-supervisor")), hidden, "a plan in a reviewer-* directory is refused");
    assert.match(await attempt(path.join(round, "launch-b-1"), path.join(round, "launch-b-1", "handoff-0-review-x", "codex-home-y")), hidden, "a journal in a tool home is refused");
    const probe = path.join(round, "probe-head");
    fs.mkdirSync(path.join(probe, ".git"), { recursive: true });
    assert.match(await attempt(path.join(probe, "state")), hidden, "a plan inside a Git checkout is refused");
    assert.doesNotMatch(await attempt(path.join(round, "launch-a-1")) ?? "", hidden, "a plan in a launch-state directory passes this check");
    console.log(`ok   ${name}`);
  } catch (error) { failures.push(name); console.log(`FAIL ${name}\n${error.stack}`); }
};
await launcherRefusals();

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) { console.log(`${failures.length} failed`); process.exit(1); }
console.log("all passed");

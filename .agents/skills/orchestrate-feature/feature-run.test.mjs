// Exercises the orchestrate-feature helper: dependency admission, adoption of
// existing PRs and worktrees, exclusive ticket and coordinator ownership,
// uncertain launches, observed process exit, writer defaults and route
// selection, the writer brief, and coexistence with the review launcher's
// worktree freeze. Runs in a scratch repository under the system temp
// directory and launches only a stand-in writer.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { processIdentity } from "../../../scripts/reviewer-slots.mjs";
import { reserveFreeze, worktreePaths } from "../../../scripts/review-job-store.mjs";
import { writerRoutes } from "../../../scripts/writer-route-preflight.mjs";
import * as run from "./feature-run.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "feature-run.mjs");
const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "feature-run-")));
console.log(`scratch: ${tmp}`);
const defaults = run.readWriterDefaults();
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim();
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const waitFor = (test, what, ms = 30000) => { const end = Date.now() + ms; while (!test()) { if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`); sleep(200); } };
const readJsonFile = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const write = (name, value) => { const file = path.join(tmp, name); fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value)); return file; };
const started = [];

try {
  // A scratch checkout holds the coordinator pointer and the writer worktree.
  const checkout = path.join(tmp, "checkout");
  fs.mkdirSync(checkout);
  git(checkout, "init", "-q", "-b", "main");
  git(checkout, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "--allow-empty", "-m", "base");
  const artifacts = path.join(tmp, "artifacts");
  fs.mkdirSync(artifacts);

  // Writer defaults follow the orchestrator's harness; an explicit model wins
  // and keeps its own vendor's routes; every configured route is one the
  // route preflight judges.
  assert.deepEqual(run.resolveWriterModel("claude", undefined, defaults), { model: "claude-opus-5-5", source: "claude orchestrator default" });
  assert.deepEqual(run.resolveWriterModel("codex", undefined, defaults), { model: "gpt-6.1-sol", source: "codex orchestrator default" });
  assert.deepEqual(run.resolveWriterModel("claude", "gpt-6-astra", defaults), { model: "gpt-6-astra", source: "invocation" });
  assert.throws(() => run.resolveWriterModel("claude", "gemini-3", defaults), /no supported writer route/);
  for (const routes of Object.values(defaults.routes)) for (const { route, selfCheck } of routes) { assert.ok(Object.hasOwn(writerRoutes, route), route); assert.ok(selfCheck, route); }
  const userTurn = run.routeOptions("claude-opus-5-5", "user", defaults), eventTurn = run.routeOptions("claude-opus-5-5", "event", defaults);
  assert.deepEqual(userTurn.map((r) => [r.route, r.dispatchable]), [["claude-desktop", true], ["claude-adopted", true], ["claude-cli", true], ["claude-agent", true]]);
  assert.deepEqual(eventTurn.map((r) => [r.route, r.dispatchable]), [["claude-desktop", false], ["claude-adopted", true], ["claude-cli", true], ["claude-agent", true]], "an event-driven turn cannot start a desktop session");
  assert.ok(eventTurn.find((r) => r.route === "claude-agent").endsWithCoordinator, "the in-process route is marked as ending with the coordinator");
  assert.deepEqual(run.routeOptions("gpt-6.1-sol", "event", defaults).map((r) => r.route), ["codex-cli", "codex-app"]);
  assert.throws(() => run.routeOptions("claude-opus-5-5", "timer", defaults), /--turn/);

  // Concurrency follows host capacity and never exceeds the reviewer-slot bound.
  const GB = 2 ** 30;
  assert.equal(run.defaultConcurrency({ freeBytes: 50 * GB, totalMemory: 64 * GB }).limit, 3);
  assert.equal(run.defaultConcurrency({ freeBytes: 13 * GB, totalMemory: 64 * GB }).limit, 2);
  assert.equal(run.defaultConcurrency({ freeBytes: 50 * GB, totalMemory: 15.8 * GB }).limit, 3);
  assert.equal(run.defaultConcurrency({ freeBytes: 50 * GB, totalMemory: 7 * GB }).limit, 1);
  assert.equal(run.defaultConcurrency({ freeBytes: 5 * GB, totalMemory: 64 * GB }).limit, 0);

  // One coordinator per Feature: the pointer refuses a second session, and a
  // takeover needs the first observed to have ended.
  const record = path.join(artifacts, "run.json");
  const init = (extra = {}) => run.initRecord({ record, checkout, repository: "acme/widgets", feature: 100, coordinator: "local_a", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", invocation: "Use orchestrate-feature for #100.", ...extra }, { defaults, freeBytes: 40 * GB, totalMemory: 64 * GB });
  const first = init();
  assert.equal(first.action, "init");
  assert.equal(first.record.writer.model, "claude-opus-5-5");
  assert.equal(first.record.concurrency.limit, 3);
  assert.equal(init().action, "resume");
  const second = path.join(artifacts, "second.json");
  assert.throws(() => init({ record: second, coordinator: "local_b" }), /already has coordinator local_a/);
  assert.throws(() => init({ record: second, coordinator: "local_b", takeover: true, observations: { sessions: { local_a: { state: "idle" } } } }), /Takeover refused: .* waiting/);
  assert.throws(() => init({ record: second, coordinator: "local_b", takeover: true }), /Takeover refused: .* unknown/);
  assert.ok(!fs.existsSync(second), "a refused coordinator writes no record");
  assert.throws(() => run.initRecord({ record: path.join(artifacts, "x.json"), checkout, repository: "acme/widgets", feature: 101, coordinator: "local_c", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", invocation: "Use orchestrate-feature for #101.", concurrency: 9 }, { defaults, freeBytes: 40 * GB }), /--concurrency must be 1 to 8/);

  // Dependency admission and adoption. #101 is independent, #102 waits for an
  // open #101, #103's blocker is closed with its merge on origin/main, #106's
  // blocker is closed but its merge is not on origin/main, #104 has a draft PR
  // two rounds in, #105 a ready PR, #107 no Effort, #108 and #109 are eligible
  // past the concurrency limit, #110 has a worktree but no PR.
  const ticket = (number, more = {}) => ({ number, title: `ticket ${number}`, state: "open", parent: 100, container: false, effort: "Medium", delivered: false, blockers: [], prs: [], worktrees: [], ...more });
  const snapshot = {
    repository: "acme/widgets", feature: { number: 100, state: "open" }, originMain: "abc", tickets: [
      ticket(101),
      ticket(102, { blockers: [{ number: 101, state: "open", delivered: false }] }),
      ticket(103, { blockers: [{ number: 90, state: "closed", delivered: true }], effort: "High" }),
      ticket(104, { prs: [{ number: 504, state: "OPEN", isDraft: true, branch: "fix/104-thing", head: "d4", rounds: 2 }] }),
      ticket(105, { prs: [{ number: 505, state: "OPEN", isDraft: false, branch: "fix/105-thing", head: "d5", rounds: 3 }] }),
      ticket(106, { blockers: [{ number: 91, state: "closed", delivered: false }] }),
      ticket(107, { effort: null }),
      ticket(108), ticket(109),
      ticket(110, { worktrees: [{ path: path.join(tmp, "wt-110"), branch: "feat/110-thing", head: "e1" }] }),
      ticket(111, { state: "closed", delivered: true }),
      ticket(112, { container: true }),
    ],
  };
  const available = (route, model, numbers, extra = {}) => ({ route, model, verdicts: numbers.map((n) => ({ ticket: n, effort: n === 103 ? "high" : "medium", verdict: "available", ...extra })) });
  const all = [101, 103, 108, 109];
  const plan = (r, more = {}) => run.planDispatch({ record: run.readRecord(record), snapshot, turn: "user", preflights: [available("claude-desktop", "claude-opus-5-5", all)], freeBytes: 100 * GB, defaults, ...more, ...r });
  const actions = (p) => Object.fromEntries(p.tickets.map((t) => [t.number, t.action]));
  const p1 = plan();
  assert.deepEqual(actions(p1), { 101: "dispatch", 102: "wait-dependency", 103: "wait-capacity", 104: "adopt-pr", 105: "await-maintainer", 106: "wait-dependency", 107: "decision-needed", 108: "wait-capacity", 109: "wait-capacity", 110: "adopt-worktree", 111: "done", 112: "container" });
  assert.equal(p1.concurrency.active, 2, "existing PR and worktree work occupies capacity");
  const adopted = p1.tickets.find((t) => t.number === 104);
  assert.deepEqual([adopted.pr, adopted.rounds], [504, 2], "an adopted PR keeps its started review rounds");
  assert.match(p1.tickets.find((t) => t.number === 106).reason, /#91 \(closed, but no merged deliverable is on origin\/main\)/);
  assert.equal(p1.complete, false);
  assert.ok(p1.remaining.some((line) => /maintainer to merge/.test(line)));
  assert.equal(p1.tickets.find((t) => t.number === 101).route, "claude-desktop");
  // More capacity admits the next eligible tickets in number order.
  const roomy = { ...run.readRecord(record), concurrency: { limit: 4, basis: "test" } };
  assert.deepEqual(Object.entries(actions(plan({ record: roomy }))).filter(([, a]) => a === "dispatch").map(([n]) => Number(n)), [101, 103]);
  // Free disk below one writer's install blocks new dispatch and says so.
  assert.match(plan({ freeBytes: 13 * GB }).tickets.find((t) => t.number === 101).reason, /free disk does not admit another writer/);

  // Route choice: an event-driven turn falls back from the desktop session to
  // the detached CLI, proposes when the desktop session is the only available
  // route, and never substitutes another model's available route.
  const eventPlan = (preflights) => plan({ turn: "event", preflights });
  assert.equal(eventPlan([available("claude-desktop", "claude-opus-5-5", all), available("claude-cli", "claude-opus-5-5", all)]).tickets.find((t) => t.number === 101).route, "claude-cli");
  const proposal = eventPlan([available("claude-desktop", "claude-opus-5-5", all)]).tickets.find((t) => t.number === 101);
  assert.deepEqual([proposal.action, proposal.route], ["propose", "claude-desktop"]);
  const lastResort = eventPlan([available("claude-agent", "claude-opus-5-5", all, { launch: { subagent_type: "writer-opus-5-5-medium" } })]).tickets.find((t) => t.number === 101);
  assert.deepEqual([lastResort.action, lastResort.route, lastResort.endsWithCoordinator], ["dispatch", "claude-agent", true]);
  const blocked = plan({ preflights: [available("claude-desktop", "claude-sonnet-5-5", all), { route: "claude-cli", model: "claude-opus-5-5", verdicts: [{ ticket: 101, effort: "medium", verdict: "blocked", reason: "the Claude CLI probe exited 1: not signed in" }] }] }).tickets.find((t) => t.number === 101);
  assert.equal(blocked.action, "blocked-route");
  assert.match(blocked.reason, /claude-desktop: no preflight result for claude-opus-5-5 at medium; claude-adopted: no preflight result .*; claude-cli: the Claude CLI probe exited 1: not signed in; claude-agent: no preflight/);

  // Claims are exclusive and bound to the plan's revision.
  const planFile = write("plan.json", p1);
  const wt101 = path.join(tmp, "wt-101");
  const mutate = (rev, fn) => run.updateRecord(record, { expectRevision: rev, coordinator: "local_a" }, fn).record.revision;
  assert.throws(() => mutate(1, (r) => run.claim(r, { plan: planFile, ticket: 102, worktree: path.join(tmp, "wt-102"), branch: "fix/102-thing", artifactParent: artifacts })), /action for #102 is wait-dependency/);
  assert.throws(() => run.updateRecord(record, { expectRevision: 1, coordinator: "local_b" }, () => {}), /coordinated by local_a/);
  assert.throws(() => mutate(1, (r) => run.claim(r, { plan: planFile, ticket: 101, worktree: wt101, branch: "fix/999-thing", artifactParent: artifacts })), /--branch must be <type>\/101-<slug>/);
  let rev = mutate(1, (r) => run.claim(r, { plan: planFile, ticket: 101, worktree: wt101, branch: "fix/101-thing", artifactParent: artifacts }));
  assert.equal(rev, 2);
  assert.throws(() => mutate(1, (r) => run.claim(r, { plan: planFile, ticket: 101, worktree: wt101, branch: "fix/101-thing", artifactParent: artifacts })), /revision 2, not 1/, "a duplicate invocation on a stale revision changes nothing");
  assert.throws(() => mutate(2, (r) => run.claim(r, { plan: planFile, ticket: 101, worktree: wt101, branch: "fix/101-thing", artifactParent: artifacts })), /made at revision 1/);
  const p2File = write("plan2.json", plan());
  assert.equal(actions(plan())[101], "reconcile-pending", "a claimed ticket waits for its launch outcome");
  assert.throws(() => mutate(2, (r) => run.claim(r, { plan: p2File, ticket: 101, worktree: wt101, branch: "fix/101-thing", artifactParent: artifacts })), /action for #101 is reconcile-pending/);

  // A pending desktop start is settled by evidence, never assumed: it needs a
  // reason to withdraw, and a detached-CLI reconcile does not apply to it.
  assert.throws(() => mutate(2, (r) => run.reconcile(r, { ticket: 101 })), /confirmed with launched or withdrawn with evidence/);
  assert.throws(() => mutate(2, (r) => run.withdraw(r, { ticket: 101 })), /--evidence must say why/);
  rev = mutate(2, (r) => run.withdraw(r, { ticket: 101, evidence: "the session list shows no session on fix/101-thing" }));
  assert.equal(rev, 3);

  // Detached CLI launch: the plan routes #101 to the CLI, the launch checks
  // the exact model and effort, records the wrapper's process identity, and
  // the writer stays live until its process is observed to exit.
  const standIn = write("stand-in-writer.mjs", [
    'import fs from "node:fs";',
    'const stop = process.argv[process.argv.indexOf("--stop") + 1];',
    'fs.readFileSync(0, "utf8");',
    'console.log(JSON.stringify({ type: "system", subtype: "init", model: process.argv[process.argv.indexOf("--model") + 1] }));',
    'const end = Date.now() + 120000;',
    'const wait = () => { if (fs.existsSync(stop) || Date.now() > end) process.exit(0); setTimeout(wait, 100); };',
    "wait();",
  ].join("\n"));
  const prompt = write("prompt.txt", "Resolve #101.");
  const cliPreflights = [available("claude-cli", "claude-opus-5-5", all)];
  const p3File = write("plan3.json", plan({ preflights: cliPreflights }));
  rev = mutate(rev, (r) => run.claim(r, { plan: p3File, ticket: 101, worktree: wt101, branch: "fix/101-thing", artifactParent: artifacts }));
  const stop101 = path.join(tmp, "stop-101");
  const args101 = [standIn, "-p", "--model", "claude-opus-5-5", "--effort", "medium", "--stop", stop101];
  assert.throws(() => mutate(rev, (r) => run.launch(r, { ticket: 101, executable: process.execPath, args: [standIn, "-p", "--model", "claude-opus-5-5", "--effort", "high", "--stop", stop101], prompt })), /--effort must be medium/, "a launch at another effort is refused");
  assert.throws(() => mutate(rev, (r) => run.launch(r, { ticket: 101, executable: process.execPath, args: [standIn, "-p", "--model", "claude-sonnet-5-5", "--effort", "medium", "--stop", stop101], prompt })), /--model must be claude-opus-5-5/, "a launch of another model is refused");
  assert.throws(() => mutate(rev, (r) => run.launch(r, { ticket: 101, executable: process.execPath, args: [...args101, "& calc"], prompt })), /character the command line would interpret/);
  const launchedRun = run.updateRecord(record, { expectRevision: rev, coordinator: "local_a" }, (r) => run.launch(r, { ticket: 101, executable: process.execPath, args: args101, prompt }));
  rev = launchedRun.record.revision;
  const owner101 = launchedRun.output.owner;
  started.push({ stop: stop101, pid: owner101.handle.pid });
  assert.equal(owner101.handle.kind, "process");
  assert.ok(owner101.handle.start, "the launch records the process start identity");
  waitFor(() => fs.existsSync(path.join(owner101.handle.launchDir, "out.jsonl")) && fs.readFileSync(path.join(owner101.handle.launchDir, "out.jsonl"), "utf8").includes('"model":"claude-opus-5-5"'), "the stand-in writer's init event");
  assert.equal(actions(plan({ preflights: cliPreflights }))[101], "observe");
  assert.equal(run.ownerStatus({ handle: { ...owner101.handle, host: "elsewhere" } }).status, "unknown", "a process on another host is never probed locally");
  assert.throws(() => mutate(rev, (r) => run.release(r, { ticket: 101, observations: {} })), /writer is live/, "a live writer is never released");
  const wt103 = path.join(tmp, "wt-103");
  const widened = (limit) => ({ ...run.readRecord(record), concurrency: { limit, basis: "test" } });
  const p4File = write("plan4.json", plan({ record: widened(4), preflights: cliPreflights }));
  assert.throws(() => mutate(rev, (r) => run.claim(r, { plan: p4File, ticket: 103, worktree: wt101, branch: "fix/103-thing", artifactParent: artifacts })), /assigned to #101/, "one worktree per writer");

  // The writer's own metadata confirms or blocks the route through the
  // preflight's observed verdicts.
  assert.throws(() => mutate(rev, (r) => run.verify(r, { ticket: 101, preflight: write("confirm-other.json", { route: "claude-desktop", model: "claude-opus-5-5", verdicts: [{ ticket: 101, effort: "medium", verdict: "confirmed" }] }) })), /not claude-cli claude-opus-5-5/);
  rev = mutate(rev, (r) => run.verify(r, { ticket: 101, preflight: write("confirm.json", { route: "claude-cli", model: "claude-opus-5-5", verdicts: [{ ticket: 101, effort: "medium", verdict: "confirmed" }] }) }));
  assert.equal(run.readRecord(record).tickets[101].owner.verified, true);

  // The writer's report must carry the full contract.
  assert.throws(() => mutate(rev, (r) => run.result(r, { ticket: 101, report: write("partial.json", { model: "claude-opus-5-5", effort: "medium", pr: 601 }) })), /lacks reviewedHead, rounds, findings, verification, ci, next/);
  assert.throws(() => mutate(rev, (r) => run.result(r, { ticket: 101, report: write("wrong.json", { model: "claude-opus-5-5", effort: "low", pr: 601, reviewedHead: "f1", rounds: { "gpt-6.1-sol": 1 }, findings: "None", verification: "check", ci: {}, next: "x" }) })), /started as claude-opus-5-5 at medium/);
  rev = mutate(rev, (r) => run.result(r, { ticket: 101, report: write("report.json", { model: "claude-opus-5-5", effort: "medium", pr: 601, reviewedHead: "f1", rounds: { "gpt-6.1-sol": 1 }, findings: "None", verification: "check", ci: { "hook-tests": "pass" }, next: "await review" }) }));

  // Observed exit releases the ticket; the next plan offers it again.
  fs.writeFileSync(stop101, "");
  waitFor(() => !processIdentity(owner101.handle.pid) || processIdentity(owner101.handle.pid).start !== owner101.handle.start, "the stand-in writer to exit");
  assert.equal(actions(plan({ preflights: cliPreflights }))[101], "release");
  rev = mutate(rev, (r) => run.release(r, { ticket: 101, observations: {}, evidence: "stand-in finished" }));
  assert.equal(actions(plan({ preflights: cliPreflights }))[101], "dispatch");

  // An uncertain launch: the writer started but the outcome was not recorded.
  // The claim stays pending, a second claim is refused, and reconcile finds
  // the running writer by its launch directory instead of starting another.
  const p5File = write("plan5.json", plan({ preflights: cliPreflights }));
  rev = mutate(rev, (r) => run.claim(r, { plan: p5File, ticket: 101, worktree: wt101, branch: "fix/101-thing", artifactParent: artifacts }));
  const stopLost = path.join(tmp, "stop-lost");
  assert.throws(() => mutate(rev, (r) => run.launch(r, { ticket: 101, executable: process.execPath, args: [standIn, "-p", "--model", "claude-opus-5-5", "--effort", "medium", "--stop", stopLost], prompt, spawner: (o) => { const out = run.startDetachedWriter(o); started.push({ stop: stopLost, pid: out.pid }); throw new Error("the host lost the reply"); } })), /outcome of launch .* is uncertain/);
  assert.equal(run.readRecord(record).tickets[101].pending.operation, "dispatch", "the uncertain launch stays pending");
  assert.equal(actions(plan({ preflights: cliPreflights }))[101], "reconcile-pending");
  waitFor(() => { const r = run.readRecord(record); return fs.existsSync(path.join(run.launchDirOf(r.tickets[101].pending, 101), "out.jsonl")) && fs.statSync(path.join(run.launchDirOf(r.tickets[101].pending, 101), "out.jsonl")).size > 0; }, "the unrecorded writer to start");
  const settled = run.updateRecord(record, { expectRevision: rev, coordinator: "local_a" }, (r) => run.reconcile(r, { ticket: 101 }));
  rev = settled.record.revision;
  assert.equal(settled.output.outcome, "running");
  assert.equal(actions(plan({ preflights: cliPreflights }))[101], "observe", "the found writer owns the ticket; no replacement is offered");
  fs.writeFileSync(stopLost, "");
  waitFor(() => !processIdentity(settled.output.owner.handle.pid), "the found writer to exit");
  rev = mutate(rev, (r) => run.release(r, { ticket: 101, observations: {} }));

  // Session and task owners are observed through the coordinator's tools.
  // Absent, cancel-requested and unknown states block replacement.
  const session = { handle: { kind: "session", id: "local_w" } };
  assert.equal(run.ownerStatus(session, {}).status, "unknown");
  assert.equal(run.ownerStatus(session, { sessions: { local_w: { state: "running" } } }).status, "live");
  assert.equal(run.ownerStatus(session, { sessions: { local_w: { state: "idle" } } }).status, "waiting");
  assert.equal(run.ownerStatus(session, { sessions: { local_w: { state: "archived" } } }).status, "exited");
  assert.equal(run.ownerStatus({ handle: { kind: "task", id: "t1" } }, { tasks: { t1: { state: "cancel-requested" } } }).status, "unknown", "a cancellation request is not exit");
  assert.equal(run.ownerStatus({ handle: { kind: "task", id: "t1" } }, { tasks: { t1: { state: "completed" } } }).status, "exited");

  // A proposed desktop start is recorded as pending, then confirmed when the
  // user starts it; the brief carries the whole contract.
  const p6File = write("plan6.json", plan({ turn: "event", preflights: [available("claude-desktop", "claude-opus-5-5", all)] }));
  rev = mutate(rev, (r) => run.claim(r, { plan: p6File, ticket: 101, worktree: wt101, branch: "fix/101-thing", artifactParent: artifacts, operation: "proposed" }));
  assert.match(plan().tickets.find((t) => t.number === 101).reason, /proposed and awaits the user/, "a proposal is never silently queued");
  assert.throws(() => mutate(rev, (r) => run.reconcile(r, { ticket: 101 })), /confirmed with launched/);
  rev = mutate(rev, (r) => run.launched(r, { ticket: 101, handleKind: "session", handle: "local_w101" }));
  const text = run.brief(run.readRecord(record), p6File, 101, ["No stacked branches."], defaults);
  for (const needle of ["#101", "Feature #100", "session local_a", "claude-desktop, model claude-opus-5-5 at effort medium", "get_session on self", "never substitute", "resolve-issue", wt101, "fix/101-thing", artifacts, "- No stacked branches.", "three-round cap", "checkpoint report", "machine-wide reviewer and test reservations", "Never merge", ...run.REPORT_FIELDS]) assert.ok(text.includes(needle), `brief names ${needle}`);
  assert.equal(actions(plan({ observations: { sessions: { local_w101: { state: "running" } } } }))[101], "observe");
  assert.equal(actions(plan({ observations: { sessions: { local_w101: { state: "idle" } } } }))[101], "collect-report");
  assert.equal(actions(plan())[101], "blocked-owner-unknown", "an unobserved session blocks replacement");

  // Adopted desktop writer: from an event-driven turn the plan prefers it to
  // the bare CLI. Each step records intent before its side effect and its
  // outcome after; an uncertain create or handoff is never retried blindly,
  // adoption is confirmed only from the session list, and the brief's
  // delivery is its own recorded step.
  const adoptedPreflights = [available("claude-desktop", "claude-opus-5-5", [108]), available("claude-adopted", "claude-opus-5-5", [108]), available("claude-cli", "claude-opus-5-5", [108])];
  const adoptedPlan = () => plan({ record: widened(8), turn: "event", preflights: adoptedPreflights });
  const pA = adoptedPlan();
  assert.deepEqual([pA.tickets.find((t) => t.number === 108).action, pA.tickets.find((t) => t.number === 108).route], ["dispatch", "claude-adopted"]);
  const wt108 = path.join(tmp, "wt-108");
  const claimAdopted = () => { rev = mutate(rev, (r) => run.claim(r, { plan: write("planA.json", adoptedPlan()), ticket: 108, worktree: wt108, branch: "fix/108-thing", artifactParent: artifacts })); };
  claimAdopted();
  assert.equal(actions(adoptedPlan())[108], "dispatch-step");
  const exe = path.join(tmp, "claude.exe");
  const sessionId = "0f8c1e7a-2b3d-4c5e-9f60-718293a4b5c6";
  assert.throws(() => run.handoffAdopted(record, { coordinator: "local_a", expectRevision: rev, ticket: 108, executable: exe, runner: () => ({ requested: true, pid: 1 }) }), /at step none, not create confirmed/, "no handoff before a confirmed create");
  let out = run.createAdopted(record, { coordinator: "local_a", expectRevision: rev, ticket: 108, executable: exe, permissionMode: "auto", runner: () => { throw new Error("the host lost the reply"); } });
  rev = out.revision;
  assert.deepEqual(run.readRecord(record).tickets[108].pending.steps.map((s) => `${s.step} ${s.state}`), ["create intent", "create uncertain"], "the intent is recorded before the create runs");
  assert.match(plan({ record: widened(8), turn: "event", preflights: adoptedPreflights }).tickets.find((t) => t.number === 108).reason, /may have made a session/);
  assert.throws(() => run.createAdopted(record, { coordinator: "local_a", expectRevision: rev, ticket: 108, executable: exe, permissionMode: "auto", runner: () => ({ created: true, sessionId }) }), /at step create uncertain, not none/, "an uncertain create is not retried");
  rev = mutate(rev, (r) => run.withdraw(r, { ticket: 108, evidence: "no session for fix/108-thing in the list" }));
  claimAdopted();
  let ran;
  out = run.createAdopted(record, { coordinator: "local_a", expectRevision: rev, ticket: 108, executable: exe, permissionMode: "auto", runner: (o) => { ran = o; return { created: true, sessionId }; } });
  rev = out.revision;
  assert.deepEqual([ran.model, ran.effort, ran.permissionMode, ran.cwd], ["claude-opus-5-5", "medium", "auto", checkout], "the session is created at the claimed model and effort");
  assert.match(plan({ record: widened(8), turn: "event", preflights: adoptedPreflights }).tickets.find((t) => t.number === 108).reason, new RegExp(`${sessionId} was created; run handoff`));
  assert.throws(() => mutate(rev, (r) => run.launched(r, { ticket: 108, handleKind: "session", handle: "local_w108" })), /after its handoff ran/);
  out = run.handoffAdopted(record, { coordinator: "local_a", expectRevision: rev, ticket: 108, executable: exe, runner: (o) => { ran = o; return { requested: true, pid: 4242 }; } });
  rev = out.revision;
  assert.equal(ran.sessionId, sessionId);
  assert.equal(actions(adoptedPlan())[108], "reconcile-pending", "a requested handoff waits for the session list");
  assert.throws(() => mutate(rev, (r) => run.launched(r, { ticket: 108, handleKind: "task", handle: "t" })), /confirmed as a session/);
  rev = mutate(rev, (r) => run.launched(r, { ticket: 108, handleKind: "session", handle: "local_w108" }));
  const owner108 = run.readRecord(record).tickets[108].owner;
  assert.deepEqual(owner108.steps.map((s) => `${s.step} ${s.state}`), ["create intent", "create confirmed", "handoff intent", "handoff requested", "adopt confirmed"]);
  const running108 = { sessions: { local_w108: { state: "idle" } } };
  assert.equal(actions(plan({ record: widened(8), turn: "event", preflights: adoptedPreflights, observations: running108 }))[108], "deliver-brief");
  const briefA = run.brief(run.readRecord(record), write("planA2.json", adoptedPlan()), 108, [], defaults);
  assert.match(briefA, /not linked to the coordinator.*session local_a as a cross-session message/);
  assert.match(briefA, /get_session on self/);
  // Delivery records its intent before the message and its outcome after. An
  // unconfirmed send may still be queued, so it is settled from the
  // transcript or resent only as an identified retry the writer ignores once
  // a copy has arrived.
  assert.throws(() => mutate(rev, (r) => run.delivered(r, { ticket: 108 })), /record deliver before sending it/);
  assert.throws(() => mutate(rev, (r) => run.deliver(r, { ticket: 108, retry: true })), /has not been sent/);
  rev = mutate(rev, (r) => run.deliver(r, { ticket: 108 }));
  const firstCopy = run.readRecord(record).tickets[108].owner.brief;
  const assignment = run.readRecord(record).tickets[108].owner.launchId;
  const copy1 = run.brief(run.readRecord(record), write("planA3.json", adoptedPlan()), 108, [], defaults);
  assert.match(copy1, new RegExp(`^Assignment ${assignment} \\(delivery ${firstCopy.deliveryId}\\)\\. If you have already received assignment ${assignment}, ignore this copy`), "each copy names its assignment so the writer acts on the first");
  assert.throws(() => mutate(rev, (r) => run.deliver(r, { ticket: 108 })), /already at intent .* --retry/);
  const interrupted = plan({ record: widened(8), turn: "event", preflights: adoptedPreflights, observations: { sessions: { local_w108: { state: "running" } } } }).tickets.find((t) => t.number === 108);
  assert.equal(interrupted.action, "reconcile-pending");
  assert.match(interrupted.reason, /may still be queued; .* otherwise wait, or resend with deliver --retry/, "an unconfirmed send is never resent as a fresh assignment");
  assert.doesNotMatch(interrupted.reason, /send it and record delivered/);
  rev = mutate(rev, (r) => run.deliver(r, { ticket: 108, retry: true }));
  const secondCopy = run.readRecord(record).tickets[108].owner.brief;
  assert.deepEqual([secondCopy.attempts, secondCopy.deliveryId !== firstCopy.deliveryId], [2, true]);
  assert.match(run.brief(run.readRecord(record), write("planA4.json", adoptedPlan()), 108, [], defaults), new RegExp(`^Assignment ${assignment} \\(delivery ${secondCopy.deliveryId}\\)`), "a retry names the same assignment");
  rev = mutate(rev, (r) => run.delivered(r, { ticket: 108, evidence: "the transcript shows the brief" }));
  assert.throws(() => mutate(rev, (r) => run.delivered(r, { ticket: 108 })), /at delivered/);
  assert.equal(actions(plan({ record: widened(8), turn: "event", preflights: adoptedPreflights, observations: running108 }))[108], "collect-report");
  // A writer's request stays on the plan until its answer is delivered. A
  // relayed request stays open while the maintainer decides; an answer is a
  // message with the same intent, outcome and identified retry.
  assert.throws(() => mutate(rev, (r) => run.request(r, { ticket: 108, text: "authorize round 4?" })), /--source/);
  const asked = run.updateRecord(record, { expectRevision: rev, coordinator: "local_a" }, (r) => run.request(r, { ticket: 108, text: "authorize round 4?", source: "session local_w108 transcript" }));
  rev = asked.record.revision;
  const requestId = asked.output.id;
  const plan108 = () => plan({ record: widened(8), turn: "event", preflights: adoptedPreflights, observations: running108 }).tickets.find((t) => t.number === 108);
  assert.deepEqual([plan108().action, plan108().requests.map((q) => q.text)], ["answer-request", ["authorize round 4?"]]);
  rev = mutate(rev, (r) => run.relay(r, { ticket: 108, request: requestId, to: "the maintainer" }));
  assert.match(plan108().reason, /relayed to the maintainer at .*; once they decide, record answer/, "a relayed request stays open");
  assert.throws(() => mutate(rev, (r) => run.answered(r, { ticket: 108, request: requestId })), /record answer before sending it/);
  const answering = run.updateRecord(record, { expectRevision: rev, coordinator: "local_a" }, (r) => run.answer(r, { ticket: 108, request: requestId, text: "round 4 is authorized" }));
  rev = answering.record.revision;
  assert.match(answering.output.message, new RegExp(`^Answer to your request ${requestId} \\(delivery \\w+\\): round 4 is authorized\\nIf you already received an answer to request ${requestId}, ignore this copy\\.`));
  assert.equal(plan108().action, "answer-request", "an answer recorded but not confirmed sent keeps the request open");
  assert.match(plan108().reason, /may still be queued; .* answer --retry/);
  assert.throws(() => mutate(rev, (r) => run.answer(r, { ticket: 108, request: requestId, text: "again" })), /--retry/);
  const resent = run.updateRecord(record, { expectRevision: rev, coordinator: "local_a" }, (r) => run.answer(r, { ticket: 108, request: requestId, retry: true }));
  rev = resent.record.revision;
  assert.match(resent.output.message, /round 4 is authorized/, "a retry resends the same answer");
  rev = mutate(rev, (r) => run.answered(r, { ticket: 108, request: requestId, evidence: "the writer acknowledged it" }));
  assert.throws(() => mutate(rev, (r) => run.answer(r, { ticket: 108, request: requestId, text: "again" })), /already answered/);
  assert.equal(plan108().action, "collect-report");
  assert.doesNotMatch(run.brief(run.readRecord(record), p6File, 101, [], defaults), /cross-session message/, "a linked desktop writer reports by ending its turn");
  // The CLI's answer is accepted only without error, with a session id and
  // from the requested model.
  assert.deepEqual(run.createOutcome({ status: 0, stdout: JSON.stringify({ is_error: false, session_id: sessionId, modelUsage: { "claude-opus-5-5": {} } }) }, "claude-opus-5-5"), { created: true, sessionId });
  assert.match(run.createOutcome({ status: 0, stdout: JSON.stringify({ is_error: false, session_id: sessionId, modelUsage: { "claude-sonnet-5-5": {} } }) }, "claude-opus-5-5").reason, /answered with claude-sonnet-5-5/);
  assert.match(run.createOutcome({ status: 1, stdout: JSON.stringify({ is_error: true, result: "Not logged in" }) }, "claude-opus-5-5").reason, /exited 1: Not logged in/);
  assert.match(run.createOutcome({ error: new Error("ENOENT") }, "claude-opus-5-5").reason, /could not run: ENOENT/);
  assert.equal(run.createOutcome({ error: Object.assign(new Error("spawnSync ETIMEDOUT"), { code: "ETIMEDOUT" }), signal: "SIGTERM" }, "claude-opus-5-5").uncertain, true, "a timed-out create may have made a session");

  // Adopting an existing PR records its writer without starting another and
  // carries the PR's started rounds into the brief.
  const p7File = write("plan7.json", plan());
  rev = mutate(rev, (r) => run.adopt(r, { plan: p7File, ticket: 104, handleKind: "session", handle: "local_w104", route: "claude-desktop", model: "claude-opus-5-5", effort: "medium", worktree: path.join(tmp, "wt-104") }));
  assert.match(run.brief(run.readRecord(record), p7File, 104, [], defaults), /PR #504, which has started 2 review rounds; the count continues/);
  assert.equal(run.readRecord(record).tickets[104].owner.adopted.rounds, 2);
  assert.throws(() => mutate(rev, (r) => run.adopt(r, { plan: p7File, ticket: 104, handleKind: "session", handle: "local_x", route: "claude-desktop", model: "claude-opus-5-5", effort: "medium", worktree: path.join(tmp, "wt-104") })), /revision/);
  // A found worktree is adopted only at the path the plan found, with its branch.
  const p7bFile = write("plan7b.json", plan());
  assert.throws(() => mutate(rev, (r) => run.adopt(r, { plan: p7bFile, ticket: 110, handleKind: "session", handle: "local_w110", route: "claude-desktop", model: "claude-opus-5-5", effort: "medium", worktree: path.join(tmp, "elsewhere") })), /one the plan found for #110/);
  rev = mutate(rev, (r) => run.adopt(r, { plan: p7bFile, ticket: 110, handleKind: "session", handle: "local_w110", route: "claude-desktop", model: "claude-opus-5-5", effort: "medium", worktree: path.join(tmp, "wt-110") }));
  assert.equal(run.readRecord(record).tickets[110].owner.branch, "feat/110-thing");

  // A mismatched writer is stopped, never substituted.
  rev = mutate(rev, (r) => run.verify(r, { ticket: 104, preflight: write("mismatch.json", { route: "claude-desktop", model: "claude-opus-5-5", verdicts: [{ ticket: 104, effort: "medium", verdict: "blocked", reason: "the launched writer runs claude-opus-5-5 at low, not claude-opus-5-5 at medium" }] }) }));
  assert.equal(actions(plan({ observations: { sessions: { local_w104: { state: "running" } } } }))[104], "stop-writer");

  // Disk recoveries are recorded one removal at a time.
  rev = mutate(rev, (r) => run.diskRecovery(r, { removed: path.join(tmp, "old"), branch: "fix/1-old", classifier: "remove: merged into origin/main, clean, idle" }));
  assert.equal(run.readRecord(record).diskRecoveries.length, 1);

  // The record lock: a live holder refuses, an exited holder is reported and
  // removed only by recover-lock.
  const lock = `${record}.lock`;
  const self = processIdentity(process.pid);
  fs.writeFileSync(lock, JSON.stringify({ token: "x", identity: self }));
  assert.throws(() => mutate(rev, () => {}), new RegExp(`Process ${process.pid} holds`));
  assert.throws(() => run.recoverLock(record), /still holds/);
  fs.writeFileSync(lock, JSON.stringify({ token: "x", identity: { pid: self.pid, start: "0" } }));
  assert.throws(() => mutate(rev, () => {}), /which has exited; run recover-lock/);
  assert.match(run.recoverLock(record), /removed the lock/);
  fs.writeFileSync(lock, "{");
  assert.throws(() => mutate(rev, () => {}), /unreadable; preserve it/);
  fs.unlinkSync(lock);

  // A full writer's reviewer launcher freezes its own worktree while the
  // coordinator's record is locked mid-update: the coordinator keeps no lock
  // or file in the writer's worktree.
  git(checkout, "worktree", "add", "-q", "-b", "fix/103-thing", wt103);
  const unlisted = plan({ record: widened(3), snapshot: { ...snapshot, tickets: snapshot.tickets.filter((t) => t.number !== 101) } });
  assert.equal(actions(unlisted)[101], "decision-needed", "a held writer outside the Feature is reported");
  assert.equal(unlisted.concurrency.active, 4, "and still occupies capacity beside #104, #108 and #110");
  const p8File = write("plan8.json", plan({ record: widened(8) }));
  assert.throws(() => mutate(rev, (r) => run.claim(r, { plan: p8File, ticket: 103, worktree: wt103, branch: "fix/103-thing", artifactParent: artifacts })), /already exists; adopt/, "existing work is adopted, never claimed for a second writer");
  const wt109 = path.join(tmp, "wt-109");
  rev = mutate(rev, (r) => run.claim(r, { plan: p8File, ticket: 109, worktree: wt109, branch: "feat/109-thing", artifactParent: artifacts }));
  git(checkout, "worktree", "add", "-q", "-b", "feat/109-thing", wt109);
  const admin = git(wt109, "rev-parse", "--path-format=absolute", "--git-dir");
  const before = fs.readdirSync(admin).sort();
  rev = mutate(rev, (r) => run.launched(r, { ticket: 109, handleKind: "task", handle: "task-109" }));
  const head = git(wt109, "rev-parse", "HEAD");
  const job = path.join(tmp, "job");
  fs.mkdirSync(job);
  run.updateRecord(record, { expectRevision: rev, coordinator: "local_a" }, () => {
    reserveFreeze({ worktree: fs.realpathSync.native(wt109), commonGit: git(wt109, "rev-parse", "--path-format=absolute", "--git-common-dir"), head, base: head, jobId: "job-1" }, job);
  });
  rev++;
  assert.ok(fs.existsSync(worktreePaths(wt109).freeze), "the reviewer launcher froze the writer's worktree");
  fs.unlinkSync(worktreePaths(wt109).freeze);
  assert.deepEqual(fs.readdirSync(admin).sort(), before, "coordinator operations leave the writer worktree's Git directory alone");

  // Snapshot discovery through an injected client: PRs match by closing
  // reference or branch, rounds come from round-state comments, a blocker is
  // delivered only when its merged commit is on origin/main, and nested
  // sub-issues are planned under their container.
  const client = {
    fetchMain: () => "m1",
    issue: () => ({ state: "open", title: "Feature" }),
    worktrees: () => run.parseWorktrees(`worktree ${checkout}\nHEAD m1\nbranch refs/heads/main\n\nworktree ${path.join(tmp, "x")}\nHEAD e2\nbranch refs/heads/codex/fix/202-thing\n`),
    subIssues: (n) => ({ 200: [{ number: 201, state: "open", title: "a" }, { number: 202, state: "open", title: "b" }, { number: 210, state: "open", title: "container" }], 210: [{ number: 211, state: "open", title: "c" }] })[n] ?? [],
    blockedBy: (n) => ({ 201: [{ number: 190, state: "closed" }], 202: [{ number: 191, state: "closed" }] })[n] ?? [],
    effort: () => "Medium",
    pulls: (n) => ({
      190: [{ number: 390, state: "MERGED", mergeCommit: { oid: "on-main" }, headRefName: "fix/190-x", closingIssuesReferences: [{ number: 190 }] }],
      191: [{ number: 391, state: "MERGED", mergeCommit: { oid: "off-main" }, headRefName: "fix/191-x", closingIssuesReferences: [{ number: 191 }] }],
      201: [{ number: 401, state: "OPEN", isDraft: true, headRefName: "feat/201-x", headRefOid: "h1", closingIssuesReferences: [] }, { number: 499, state: "OPEN", isDraft: false, headRefName: "fix/2010-y", headRefOid: "h9", closingIssuesReferences: [{ number: 2010 }] }],
    })[n] ?? [],
    comments: () => [{ body: "### Review round 1 state\n" }, { body: "intro\n### Review round 3 state\n" }, { body: "Round 4 is not a heading" }],
    checks: () => [{ name: "hook-tests", state: "SUCCESS" }],
    onMain: (sha) => sha === "on-main",
  };
  const snap = run.takeSnapshot({ repository: "acme/widgets", feature: 200 }, client);
  const byNumber = Object.fromEntries(snap.tickets.map((t) => [t.number, t]));
  assert.deepEqual(byNumber[201].prs.map((p) => [p.number, p.rounds]), [[401, 3]], "the PR of another ticket is not adopted");
  assert.deepEqual(byNumber[201].blockers, [{ number: 190, state: "closed", delivered: true }]);
  assert.deepEqual(byNumber[202].blockers, [{ number: 191, state: "closed", delivered: false }]);
  assert.deepEqual(byNumber[202].worktrees.map((w) => w.branch), ["codex/fix/202-thing"]);
  assert.deepEqual([byNumber[210].container, byNumber[211].parent], [true, 210]);

  // The command line refuses with exit 1 and leaves the record unchanged.
  const cli = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", windowsHide: true });
  const refused = cli("claim", "--record", record, "--coordinator", "local_a", "--expect-revision", String(rev - 1), "--plan", p8File, "--ticket", "108", "--worktree", path.join(tmp, "wt-108"), "--branch", "fix/108-thing", "--artifact-parent", artifacts);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, new RegExp(`at revision ${rev}, not ${rev - 1}`));
  assert.equal(run.readRecord(record).revision, rev);
  const duplicate = cli("init", "--record", second, "--checkout", checkout, "--repo", "acme/widgets", "--feature", "100", "--coordinator", "local_b", "--harness", "claude", "--coordinator-model", "claude-opus-5-5", "--coordinator-effort", "high", "--invocation", "Use orchestrate-feature for #100.");
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.stderr, /already has coordinator local_a/);
  assert.equal(cli("plan", "--record", "relative.json").status, 1);

  // Takeover after the first coordinator is observed to have ended carries
  // ownership and adopted rounds over unchanged, and the first coordinator's
  // record stops accepting changes.
  const taken = init({ record: second, coordinator: "local_b", takeover: true, observations: { sessions: { local_a: { state: "archived" } } } });
  assert.equal(taken.action, "takeover");
  assert.deepEqual(taken.record.tickets[104].owner.adopted, { pr: 504, rounds: 2 });
  assert.deepEqual(taken.record.previousCoordinators.map((c) => [c.session, c.record]), [["local_a", record]]);
  assert.throws(() => mutate(rev, (r) => run.diskRecovery(r, { removed: "x", classifier: "y" })), /this record no longer coordinates the Feature/);
  assert.equal(run.updateRecord(second, { expectRevision: 1, coordinator: "local_b" }, (r) => run.diskRecovery(r, { removed: "x", classifier: "y" })).record.revision, 2);

  // Review regressions, each in a fresh scratch checkout and record.
  const fresh = (name, feature = 300) => {
    const dir = path.join(tmp, name);
    fs.mkdirSync(path.join(dir, "artifacts"), { recursive: true });
    git(tmp, "init", "-q", "-b", "main", dir);
    git(dir, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "--allow-empty", "-m", "base");
    const file = path.join(dir, "artifacts", "run.json");
    run.initRecord({ record: file, checkout: dir, repository: "acme/widgets", feature, coordinator: "local_r", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", invocation: `Use orchestrate-feature for #${feature}.` }, { defaults, freeBytes: 40 * GB, totalMemory: 64 * GB });
    // Each change starts from the record's current revision, since create and
    // handoff change it through their own two writes.
    const change = (fn) => run.updateRecord(file, { expectRevision: run.readRecord(file).revision, coordinator: "local_r" }, fn).output;
    return { dir, file, artifacts: path.join(dir, "artifacts"), change };
  };
  const snapshotOf = (feature, tickets) => ({ repository: "acme/widgets", feature: { number: feature, state: "open" }, originMain: "abc", tickets });
  const planOf = (f, snap, more = {}) => run.planDispatch({ record: run.readRecord(f.file), snapshot: snap, turn: "user", freeBytes: 100 * GB, defaults, ...more });

  // 1. A detached writer that outlives its wrapper still owns its ticket: it
  // is live, cannot be released, and no replacement is offered.
  {
    const f = fresh("r1");
    const snap = snapshotOf(300, [{ ...ticket(301), parent: 300 }]);
    const pre = [available("claude-cli", "claude-opus-5-5", [301])];
    f.change((r) => run.claim(r, { plan: write("r1-plan.json", planOf(f, snap, { preflights: pre })), ticket: 301, worktree: path.join(f.dir, "wt-301"), branch: "fix/301-thing", artifactParent: f.artifacts }));
    const stop = path.join(f.dir, "stop-301");
    const owner = f.change((r) => run.launch(r, { ticket: 301, executable: process.execPath, args: [standIn, "-p", "--model", "claude-opus-5-5", "--effort", "medium", "--stop", stop], prompt })).owner;
    started.push({ stop, pid: owner.handle.pid });
    waitFor(() => fs.existsSync(path.join(owner.handle.launchDir, "out.jsonl")) && fs.statSync(path.join(owner.handle.launchDir, "out.jsonl")).size > 0, "the r1 writer to start");
    process.kill(owner.handle.pid);
    waitFor(() => { const now = processIdentity(owner.handle.pid); return !now || now.start !== owner.handle.start; }, "the r1 wrapper to exit");
    const status = run.ownerStatus(owner);
    assert.equal(status.status, "live", "the writer outlives its wrapper");
    assert.match(status.reason, /still names launch directory/);
    assert.throws(() => f.change((r) => run.release(r, { ticket: 301, observations: {} })), /writer is live/);
    assert.equal(actions(planOf(f, snap, { preflights: pre }))[301], "observe", "no replacement is offered while the writer runs");
    assert.equal(run.ownerStatus(owner, {}, { census: () => null }).status, "unknown", "a failed census proves nothing");
    fs.writeFileSync(stop, "");
    waitFor(() => run.ownerStatus(owner).status === "exited", "the r1 writer to exit");
    f.change((r) => run.release(r, { ticket: 301, observations: {} }));
  }

  // 2. Takeovers and initializations are serialized on the pointer, and a
  // takeover copies the previous record only while holding its lock.
  {
    const f = fresh("r2");
    const pointerLock = `${run.pointerFile(f.dir, "acme/widgets", 300)}.lock`;
    const takeover = () => run.initRecord({ record: path.join(f.artifacts, "c.json"), checkout: f.dir, repository: "acme/widgets", feature: 300, coordinator: "local_c", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", invocation: "Use orchestrate-feature for #300.", takeover: true, observations: { sessions: { local_r: { state: "archived" } } } }, { defaults, freeBytes: 40 * GB, totalMemory: 64 * GB });
    fs.writeFileSync(pointerLock, JSON.stringify({ token: "b", identity: processIdentity(process.pid) }));
    assert.throws(takeover, new RegExp(`Process ${process.pid} holds .*pointer|Process ${process.pid} holds`), "a takeover in progress blocks another");
    fs.unlinkSync(pointerLock);
    fs.writeFileSync(`${f.file}.lock`, JSON.stringify({ token: "m", identity: processIdentity(process.pid) }));
    assert.throws(takeover, /holds/, "a change in progress to the previous record blocks the copy");
    fs.unlinkSync(`${f.file}.lock`);
    assert.ok(!fs.existsSync(path.join(f.artifacts, "c.json")), "a refused takeover writes no record");
    assert.equal(takeover().action, "takeover");
    assert.throws(() => run.initRecord({ record: path.join(f.artifacts, "d.json"), checkout: f.dir, repository: "acme/widgets", feature: 300, coordinator: "local_d", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", invocation: "Use orchestrate-feature for #300.", takeover: true, observations: { sessions: { local_r: { state: "archived" } } } }, { defaults, freeBytes: 40 * GB }), /previous coordinator local_c is unknown/, "a stale view of the first coordinator cannot replace the second");
  }

  // 3. Lock recovery removes only the generation it judged, one recovery at a
  // time, and a mutation never proceeds while a recovery marker exists.
  {
    const f = fresh("r3");
    const lock = `${f.file}.lock`, self = processIdentity(process.pid);
    fs.writeFileSync(lock, JSON.stringify({ token: "old", identity: { pid: self.pid, start: "0" } }));
    assert.throws(() => run.recoverLock(f.file, { identify: () => { fs.writeFileSync(lock, JSON.stringify({ token: "new-live", identity: self })); return null; } }), /changed during recovery/);
    assert.equal(JSON.parse(fs.readFileSync(lock, "utf8")).token, "new-live", "the new generation survives");
    fs.unlinkSync(lock);
    fs.writeFileSync(`${lock}.recovery`, "{}");
    assert.throws(() => run.recoverLock(f.file), /Another recovery/);
    assert.throws(() => f.change(() => {}), /Recovery of .* is in progress/);
    assert.ok(!fs.existsSync(lock), "a refused mutation gives its lock back");
    fs.unlinkSync(`${lock}.recovery`);
  }

  // 4. An ended writer's draft PR or worktree is continued by a new writer
  // through a recorded claim that keeps the branch and the started rounds.
  {
    const f = fresh("r4");
    const wt = path.join(f.dir, "wt-402");
    fs.mkdirSync(wt);
    const snap = snapshotOf(300, [{ ...ticket(401), parent: 300, prs: [{ number: 801, state: "OPEN", isDraft: true, branch: "fix/401-thing", head: "h1", rounds: 2 }] }, { ...ticket(402), parent: 300, worktrees: [{ path: wt, branch: "feat/402-thing", head: "h2" }] }]);
    const pre = [available("claude-cli", "claude-opus-5-5", [401, 402])];
    const planFile = write("r4-plan.json", planOf(f, snap, { preflights: pre }));
    const entry = readJsonFile(planFile).tickets.find((t) => t.number === 401);
    assert.deepEqual([entry.action, entry.continueWith.route, entry.rounds], ["adopt-pr", "claude-cli", 2]);
    assert.throws(() => f.change((r) => run.claim(r, { plan: planFile, ticket: 401, worktree: path.join(f.dir, "wt-401"), branch: "fix/401-thing", artifactParent: f.artifacts, operation: "continue" })), /--evidence must say/);
    assert.throws(() => f.change((r) => run.claim(r, { plan: planFile, ticket: 401, worktree: path.join(f.dir, "wt-401"), branch: "fix/401-other", artifactParent: f.artifacts, operation: "continue", evidence: "x" })), /existing branch fix\/401-thing/);
    f.change((r) => run.claim(r, { plan: planFile, ticket: 401, worktree: path.join(f.dir, "wt-401"), branch: "fix/401-thing", artifactParent: f.artifacts, operation: "continue", evidence: "the previous writer's session is archived" }));
    const pending = run.readRecord(f.file).tickets[401].pending;
    assert.deepEqual([pending.operation, pending.route, pending.continues.pr, pending.continues.rounds], ["dispatch", "claude-cli", 801, 2]);
    assert.match(run.brief(run.readRecord(f.file), planFile, 401, [], defaults), /checked out from the existing origin branch on branch fix\/401-thing and its PR #801, which has started 2 review rounds/);
    const plan2 = write("r4-plan2.json", planOf(f, snap, { preflights: pre }));
    assert.throws(() => f.change((r) => run.claim(r, { plan: plan2, ticket: 402, worktree: path.join(f.dir, "elsewhere"), branch: "feat/402-thing", artifactParent: f.artifacts, operation: "continue", evidence: "ended" })), /one the plan found for #402/);
    f.change((r) => run.claim(r, { plan: plan2, ticket: 402, worktree: wt, branch: "feat/402-thing", artifactParent: f.artifacts, operation: "continue", evidence: "ended" }));
    assert.match(run.brief(run.readRecord(f.file), plan2, 402, [], defaults), new RegExp(`Continue the existing work in ${wt.replace(/[\\.]/g, (c) => `\\${c}`)} on branch feat/402-thing`));
  }

  // 5. A ticket that becomes a container while its writer holds it keeps that
  // writer's capacity.
  {
    const f = fresh("r5");
    const held = { ...run.readRecord(f.file), concurrency: { limit: 1, basis: "test" }, tickets: { 501: { owner: { route: "claude-desktop", model: "claude-opus-5-5", effort: "medium", worktree: "w", handle: { kind: "session", id: "local_w501" } }, pending: null, history: [], results: [] } } };
    const snap = snapshotOf(300, [{ ...ticket(501), parent: 300, container: true }, { ...ticket(502), parent: 300 }]);
    const p = run.planDispatch({ record: held, snapshot: snap, turn: "user", preflights: [available("claude-desktop", "claude-opus-5-5", [502])], observations: { sessions: { local_w501: { state: "running" } } }, freeBytes: 100 * GB, defaults });
    assert.deepEqual([actions(p)[501], actions(p)[502], p.concurrency.active], ["decision-needed", "wait-capacity", 1]);
    assert.match(p.tickets.find((t) => t.number === 501).reason, /gained sub-issues while writer local_w501 \(live\)/);
  }

  // 6. The snapshot reads sub-issues to GitHub's nesting limit, and marks a
  // container beyond it instead of dispatching it.
  {
    const chain = (from, to) => Object.fromEntries(Array.from({ length: to - from }, (_, i) => [from + i, [{ number: from + i + 1, state: "open", title: `n${from + i + 1}` }]]));
    const nested = (links) => ({ ...client, worktrees: () => [], pulls: () => [], blockedBy: () => [], subIssues: (n) => links[n] ?? [] });
    const deep = run.takeSnapshot({ repository: "acme/widgets", feature: 600 }, nested(chain(600, 604)));
    assert.deepEqual(deep.tickets.map((t) => [t.number, t.container]), [[601, true], [602, true], [603, true], [604, false]], "a leaf four levels down is a ticket");
    const tooDeep = run.takeSnapshot({ repository: "acme/widgets", feature: 700 }, nested(chain(700, 700 + run.MAX_SUB_ISSUE_DEPTH + 1)));
    const last = tooDeep.tickets.at(-1);
    assert.deepEqual([last.container, last.truncated], [true, true]);
    const f = fresh("r6", 700);
    assert.equal(actions(planOf(f, tooDeep))[last.number], "decision-needed");
  }

  // Round 2, finding 1: continuing existing work obeys dependency and
  // concurrency admission like a new dispatch.
  {
    const f = fresh("r7");
    const pr = (n) => ({ number: 900 + n, state: "OPEN", isDraft: true, branch: `fix/${n}-thing`, head: "h", rounds: 1 });
    const pre = [available("claude-cli", "claude-opus-5-5", [701, 702, 703])];
    const limited = (limit) => ({ ...run.readRecord(f.file), concurrency: { limit, basis: "test" } });
    const blocked = run.planDispatch({ record: limited(1), snapshot: snapshotOf(300, [{ ...ticket(701), parent: 300, prs: [pr(701)], blockers: [{ number: 99, state: "open", delivered: false }] }, { ...ticket(702), parent: 300, prs: [pr(702)], blockers: [{ number: 99, state: "open", delivered: false }] }]), turn: "user", preflights: pre, freeBytes: 100 * GB, defaults });
    for (const n of [701, 702]) {
      const entry = blocked.tickets.find((t) => t.number === n);
      assert.equal(entry.continueWith, undefined, `#${n} with an undelivered blocker has no continuation`);
      assert.match(entry.continueBlocked, /waiting for #99 \(open\)/);
    }
    const bounded = run.planDispatch({ record: limited(1), snapshot: snapshotOf(300, [{ ...ticket(701), parent: 300, prs: [pr(701)] }, { ...ticket(702), parent: 300, worktrees: [{ path: path.join(f.dir, "wt-702"), branch: "fix/702-thing", head: "h" }] }]), turn: "user", preflights: pre, freeBytes: 100 * GB, defaults });
    for (const entry of [701, 702].map((n) => bounded.tickets.find((t) => t.number === n))) {
      assert.equal(entry.continueWith, undefined, `#${entry.number}: the other ticket's writer may still run`);
      assert.match(entry.continueBlocked, /1 other writers, held or possibly running on existing work, fill the limit of 1/);
    }
    // Once the record shows #702's writer released after an observed exit,
    // #702 no longer reserves a place. #701 may then continue, its own claim
    // standing for its writer's end; #702 may not, since #701's writer may run.
    const released = { ...limited(1), tickets: { 702: { owner: null, pending: null, history: [{ released: "session archived" }], results: [] } } };
    const freed = run.planDispatch({ record: released, snapshot: snapshotOf(300, [{ ...ticket(701), parent: 300, prs: [pr(701)] }, { ...ticket(702), parent: 300, worktrees: [{ path: path.join(f.dir, "wt-702"), branch: "fix/702-thing", head: "h" }] }]), turn: "user", preflights: pre, freeBytes: 100 * GB, defaults });
    assert.equal(freed.concurrency.active, 1, "the released ticket's existing work reserves nothing");
    assert.equal(freed.tickets.find((t) => t.number === 701).continueWith.route, "claude-cli");
    assert.match(freed.tickets.find((t) => t.number === 702).continueBlocked, /1 other writers, .* fill the limit of 1/, "the ended writer's ticket waits for the other ticket's possibly running writer");
    const planFile = write("r7-plan.json", run.planDispatch({ record: run.readRecord(f.file), snapshot: snapshotOf(300, [{ ...ticket(701), parent: 300, prs: [pr(701)] }, { ...ticket(703), parent: 300, prs: [pr(703)] }]), turn: "user", preflights: pre, freeBytes: 100 * GB, defaults }));
    f.change((r) => run.claim(r, { plan: planFile, ticket: 701, worktree: path.join(f.dir, "wt-701"), branch: "fix/701-thing", artifactParent: f.artifacts, operation: "continue", evidence: "archived" }));
    const after = run.planDispatch({ record: { ...run.readRecord(f.file), concurrency: { limit: 1, basis: "test" } }, snapshot: snapshotOf(300, [{ ...ticket(701), parent: 300, prs: [pr(701)] }, { ...ticket(703), parent: 300, prs: [pr(703)] }]), turn: "user", preflights: pre, freeBytes: 100 * GB, defaults });
    assert.match(after.tickets.find((t) => t.number === 703).continueBlocked, /fill the limit of 1/, "a claimed continuation holds its place");
  }

  // Round 2, finding 2: a handoff whose outcome was lost is settled by
  // finding the session in the app's list, without running the handoff again.
  {
    const f = fresh("r8");
    const snap = snapshotOf(300, [{ ...ticket(801), parent: 300 }]);
    const pre = [available("claude-adopted", "claude-opus-5-5", [801])];
    f.change((r) => run.claim(r, { plan: write("r8-plan.json", planOf(f, snap, { turn: "event", preflights: pre })), ticket: 801, worktree: path.join(f.dir, "wt"), branch: "fix/801-thing", artifactParent: f.artifacts }));
    const uuid = "1f8c1e7a-2b3d-4c5e-9f60-718293a4b5c6";
    run.createAdopted(f.file, { coordinator: "local_r", expectRevision: run.readRecord(f.file).revision, ticket: 801, executable: path.join(tmp, "claude.exe"), permissionMode: "auto", runner: () => ({ created: true, sessionId: uuid }) });
    run.handoffAdopted(f.file, { coordinator: "local_r", expectRevision: run.readRecord(f.file).revision, ticket: 801, executable: path.join(tmp, "claude.exe"), runner: () => { throw new Error("the reply was lost"); } });
    assert.match(planOf(f, snap, { turn: "event", preflights: pre }).tickets.find((t) => t.number === 801).reason, /never run handoff again/);
    assert.throws(() => run.handoffAdopted(f.file, { coordinator: "local_r", expectRevision: run.readRecord(f.file).revision, ticket: 801, executable: path.join(tmp, "claude.exe"), runner: () => ({ requested: true, pid: 1 }) }), /not create confirmed/);
    run.updateRecord(f.file, { expectRevision: run.readRecord(f.file).revision, coordinator: "local_r" }, (r) => run.launched(r, { ticket: 801, handleKind: "session", handle: "local_w801" }));
    const steps = run.readRecord(f.file).tickets[801].owner.steps;
    assert.deepEqual(steps.map((s) => `${s.step} ${s.state}`).slice(-2), ["handoff uncertain", "adopt confirmed"]);
    assert.equal(steps.at(-1).after, "handoff uncertain");
  }

  // Round 2 (corrections), finding 5: a create whose outcome was lost is
  // settled by the session found, or by evidence of none, and never rerun.
  {
    const f = fresh("r9");
    const snap = snapshotOf(300, [{ ...ticket(901), parent: 300 }]);
    const pre = [available("claude-adopted", "claude-opus-5-5", [901])];
    const claimIt = () => f.change((r) => run.claim(r, { plan: write("r9-plan.json", planOf(f, snap, { turn: "event", preflights: pre })), ticket: 901, worktree: path.join(f.dir, "wt"), branch: "fix/901-thing", artifactParent: f.artifacts }));
    claimIt();
    const exe = path.join(tmp, "claude.exe"), uuid = "2f8c1e7a-2b3d-4c5e-9f60-718293a4b5c6";
    run.createAdopted(f.file, { coordinator: "local_r", expectRevision: run.readRecord(f.file).revision, ticket: 901, executable: exe, permissionMode: "auto", runner: () => ({ created: false, uncertain: true, reason: "the CLI was stopped (ETIMEDOUT) before it answered" }) });
    assert.match(planOf(f, snap, { turn: "event", preflights: pre }).tickets.find((t) => t.number === 901).reason, /settle-create .* never run create again/);
    assert.throws(() => f.change((r) => run.settleCreate(r, { ticket: 901, session: uuid })), /--evidence/);
    assert.throws(() => f.change((r) => run.settleCreate(r, { ticket: 901, session: "not-a-uuid", evidence: "x" })), /--session must be/);
    f.change((r) => run.settleCreate(r, { ticket: 901, session: uuid, evidence: "the CLI transcript store holds it" }));
    let handedOver;
    run.handoffAdopted(f.file, { coordinator: "local_r", expectRevision: run.readRecord(f.file).revision, ticket: 901, executable: exe, runner: (o) => { handedOver = o.sessionId; return { requested: true, pid: 1 }; } });
    assert.equal(handedOver, uuid, "the found session is the one handed over");
    // And when no session exists, the evidence closes the step for a withdrawal.
    f.change((r) => run.withdraw(r, { ticket: 901, evidence: "test reset" }));
    claimIt();
    run.createAdopted(f.file, { coordinator: "local_r", expectRevision: run.readRecord(f.file).revision, ticket: 901, executable: exe, permissionMode: "auto", runner: () => { throw new Error("lost"); } });
    f.change((r) => run.settleCreate(r, { ticket: 901, absent: true, evidence: "no transcript was written after the intent" }));
    assert.match(planOf(f, snap, { turn: "event", preflights: pre }).tickets.find((t) => t.number === 901).reason, /create failed \(settled: no transcript/);
    assert.throws(() => f.change((r) => run.settleCreate(r, { ticket: 901, absent: true, evidence: "again" })), /create failed, not create intent or create uncertain/);
  }

  // Round 2 (corrections), finding 2: an existing adopted-route writer
  // adopted with its work already has its assignment, so no brief is due.
  // Requests belong to the writer that asked and close when it is released.
  {
    const f = fresh("r10");
    const snap = snapshotOf(300, [{ ...ticket(1001), parent: 300, prs: [{ number: 1101, state: "OPEN", isDraft: true, branch: "fix/1001-thing", head: "h", rounds: 1 }] }]);
    const planFile = write("r10-plan.json", planOf(f, snap));
    f.change((r) => run.adopt(r, { plan: planFile, ticket: 1001, handleKind: "session", handle: "local_old", route: "claude-adopted", model: "claude-opus-5-5", effort: "medium", worktree: path.join(f.dir, "wt") }));
    const idle = { sessions: { local_old: { state: "idle" } } };
    assert.equal(actions(planOf(f, snap, { observations: idle }))[1001], "collect-report", "an adopted existing writer is not briefed again");
    assert.throws(() => f.change((r) => run.deliver(r, { ticket: 1001 })), /already has its assignment/);
    const { id } = f.change((r) => run.request(r, { ticket: 1001, text: "may I widen the PR?", source: "transcript" }));
    assert.equal(actions(planOf(f, snap, { observations: idle }))[1001], "answer-request");
    f.change((r) => run.release(r, { ticket: 1001, observations: { sessions: { local_old: { state: "archived" } } } }));
    assert.match(run.readRecord(f.file).tickets[1001].requests[0].closed.reason, /writer was released/);
    assert.throws(() => f.change((r) => run.answer(r, { ticket: 1001, request: id, text: "yes" })), /closed: its writer was released/);
    f.change((r) => run.adopt(r, { plan: write("r10-plan2.json", planOf(f, snap)), ticket: 1001, handleKind: "session", handle: "local_new", route: "claude-desktop", model: "claude-opus-5-5", effort: "medium", worktree: path.join(f.dir, "wt") }));
    assert.equal(actions(planOf(f, snap, { observations: { sessions: { local_new: { state: "idle" } } } }))[1001], "collect-report", "a new writer does not inherit its predecessor's question");
  }
} finally {
  for (const { stop } of started) fs.writeFileSync(stop, "");
  for (const { pid } of started) { try { waitFor(() => !processIdentity(pid), `stand-in ${pid} to exit`, 15000); } catch (error) { console.error(error.message); } }
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log("PASS: dependency admission, adoption, exclusive ownership, uncertain launches, observed exit, writer routes, brief contract and reviewer-freeze coexistence");

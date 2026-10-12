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
  assert.deepEqual(userTurn.map((r) => [r.route, r.dispatchable]), [["claude-desktop", true], ["claude-cli", true], ["claude-agent", true]]);
  assert.deepEqual(eventTurn.map((r) => [r.route, r.dispatchable]), [["claude-desktop", false], ["claude-cli", true], ["claude-agent", true]], "an event-driven turn cannot start a desktop session");
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
  assert.match(blocked.reason, /claude-desktop: no preflight result for claude-opus-5-5 at medium; claude-cli: the Claude CLI probe exited 1: not signed in; claude-agent: no preflight/);

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
  assert.throws(() => mutate(rev, (r) => run.result(r, { ticket: 101, report: write("partial.json", { model: "claude-opus-5-5", effort: "medium", pr: 601 }) })), /lacks reviewedHead, rounds, findings, verification, ci/);
  assert.throws(() => mutate(rev, (r) => run.result(r, { ticket: 101, report: write("wrong.json", { model: "claude-opus-5-5", effort: "low", pr: 601, reviewedHead: "f1", rounds: { "gpt-6.1-sol": 1 }, findings: "None", verification: "check", ci: {} }) })), /started as claude-opus-5-5 at medium/);
  rev = mutate(rev, (r) => run.result(r, { ticket: 101, report: write("report.json", { model: "claude-opus-5-5", effort: "medium", pr: 601, reviewedHead: "f1", rounds: { "gpt-6.1-sol": 1 }, findings: "None", verification: "check", ci: { "hook-tests": "pass" } }) }));

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
  assert.throws(() => mutate(rev, (r) => run.launch(r, { ticket: 101, executable: process.execPath, args: [standIn, "-p", "--model", "claude-opus-5-5", "--effort", "medium", "--stop", stopLost], prompt, spawner: (o) => { const out = run.spawnDetached(o); started.push({ stop: stopLost, pid: out.pid }); throw new Error("the host lost the reply"); } })), /outcome of launch .* is uncertain/);
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
  assert.throws(() => mutate(rev, () => {}), new RegExp(`Process ${process.pid} is updating`));
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
  assert.equal(unlisted.concurrency.active, 3, "and still occupies capacity beside #104 and #110");
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
} finally {
  for (const { stop } of started) fs.writeFileSync(stop, "");
  for (const { pid } of started) { try { waitFor(() => !processIdentity(pid), `stand-in ${pid} to exit`, 15000); } catch (error) { console.error(error.message); } }
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log("PASS: dependency admission, adoption, exclusive ownership, uncertain launches, observed exit, writer routes, brief contract and reviewer-freeze coexistence");

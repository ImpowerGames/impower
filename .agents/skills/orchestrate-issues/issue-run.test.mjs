// Exercises the orchestrate-issues helper: dependency admission, adoption of
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
import { readRepos } from "../../repos.mjs";
import * as run from "./issue-run.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "issue-run.mjs");
const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "issue-run-")));
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
  assert.deepEqual(run.routeOptions("claude-opus-5-5", defaults).map((r) => r.route), ["claude-cli"]);
  assert.deepEqual(run.routeOptions("gpt-6.1-sol", defaults).map((r) => r.route), ["codex-cli", "codex-app"]);
  assert.throws(() => run.routeOptions("claude-opus-5-5", { ...defaults, retiredRoutes: { "claude-cli": "test" } }), /also listed as retired/);

  // Concurrency follows host capacity and never exceeds the reviewer-slot bound.
  const GB = 2 ** 30;
  // The run's bound comes from memory and the reviewer slots; free disk is
  // admitted by each plan, since it changes during a run.
  assert.equal(run.defaultConcurrency({ totalMemory: 64 * GB }).limit, 3);
  assert.equal(run.defaultConcurrency({ totalMemory: 15.8 * GB }).limit, 3);
  assert.equal(run.defaultConcurrency({ totalMemory: 7 * GB }).limit, 1);

  // Both WMI creates pass a startup record that hides the new process's
  // console, so no window opens and none takes the foreground.
  {
    const calls = [];
    const exec = (file, args, options) => { calls.push({ file, script: args.at(-1), command: options.env.LAUNCH_COMMAND }); return "0 4242\r\n"; };
    const absent = path.join(tmp, "absent-writer.exe");
    assert.deepEqual(run.startDetachedWriter({ executable: absent, args: ["-p"], cwd: tmp, launchDir: path.join(tmp, "hidden-launch") }, { exec, platform: "win32" }), { started: true, pid: 4242 });
    assert.deepEqual(run.runHandoff({ executable: absent, sessionId: "00000000-0000-0000-0000-000000000000", cwd: tmp }, { exec, platform: "win32" }), { requested: true, pid: 4242 });
    assert.equal(calls.length, 2, "both paths create through the PowerShell runner they are given");
    for (const { file, script, command } of calls) {
      assert.equal(file, "powershell.exe");
      assert.match(script, /\$s = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @\{ ShowWindow = \[uint16\]0 \};/);
      assert.match(script, /Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @\{ [^}]*ProcessStartupInformation = \$s \}/);
      assert.match(command, /^cmd\.exe \/d /);
    }
    // `start` would give the resume a new console of its own, outside the
    // hidden one, and that console is visible.
    assert.doesNotMatch(calls[1].command, /\bstart\b/i, "the handoff resumes in the hidden console");
  }

  // On Windows, a probe started through each real WMI path reports the console
  // it runs in: the console must exist (the app refuses a resume whose output
  // is redirected) and its window must not be visible. A visible console is
  // what opens a Terminal window and takes the foreground.
  if (process.platform === "win32") {
    const probe = write("console-probe.ps1", [
      "Add-Type -Name Console -Namespace Probe -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern IntPtr GetConsoleWindow(); [DllImport(\"user32.dll\")] public static extern bool IsWindowVisible(IntPtr h);'",
      "$h = [Probe.Console]::GetConsoleWindow()",
      "Set-Content -LiteralPath $args[0] -Value \"$h $([Probe.Console]::IsWindowVisible($h))\"",
    ].join("\n"));
    const probeArgs = (out) => ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", probe, out];
    const consoleOf = (file, what) => {
      waitFor(() => fs.existsSync(file) && fs.readFileSync(file, "utf8").trim() !== "", `the ${what} probe's report`);
      const [window, visible] = fs.readFileSync(file, "utf8").trim().split(" ");
      return { window: Number(window), visible };
    };
    const launchDir = path.join(tmp, "console-launch");
    fs.mkdirSync(launchDir);
    fs.writeFileSync(path.join(launchDir, "prompt.txt"), "");
    const writerReport = path.join(tmp, "writer-console.txt");
    assert.equal(run.startDetachedWriter({ executable: "powershell.exe", args: probeArgs(writerReport), cwd: tmp, launchDir }).started, true);
    const writer = consoleOf(writerReport, "writer");
    assert.notEqual(writer.window, 0, "the writer runs in a console of its own");
    assert.equal(writer.visible, "False", "the writer's console is hidden");
    const handoffReport = path.join(tmp, "handoff-console.txt");
    const resume = write("stand-in-resume.cmd", `@powershell.exe ${probeArgs(handoffReport).map((a) => `"${a}"`).join(" ")}\r\n`);
    assert.equal(run.runHandoff({ executable: resume, sessionId: "00000000-0000-0000-0000-000000000000", cwd: tmp }).requested, true);
    const handoff = consoleOf(handoffReport, "handoff");
    assert.notEqual(handoff.window, 0, "the resume runs in a console of its own");
    assert.equal(handoff.visible, "False", "the resume's console is hidden");
  }

  // One coordinator per parent issue: the pointer refuses a second session, and a
  // takeover needs the first observed to have ended.
  const record = path.join(artifacts, "run.json");
  const init = (extra = {}) => run.initRecord({ record, checkout, repository: "acme/widgets", issue: 100, coordinator: "local_a", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", coordinatorMode: "bypassPermissions", invocation: "Use orchestrate-issues for #100.", ...extra }, { defaults, freeBytes: 40 * GB, totalMemory: 64 * GB });
  const first = init();
  assert.equal(first.action, "init");
  assert.equal(first.record.writer.model, "claude-opus-5-5");
  assert.equal(first.record.concurrency.limit, 3);
  assert.equal(init().action, "resume");
  // Running init again in the same session with a changed request records
  // it: a grant, then a request that stops at ready PRs takes the merge back.
  const later = (extra) => init({ record: path.join(artifacts, "later.json"), issue: 109, invocation: "Use orchestrate-issues for #109.", ...extra });
  assert.equal(later().action, "init");
  assert.equal(run.coordinatorMerges(later({ merging: "coordinator" }).record), true);
  const stopped = later({ invocation: "Use orchestrate-issues for #109; stop at ready PRs.", merging: "maintainer" }).record;
  assert.deepEqual([run.coordinatorMerges(stopped), stopped.authority, stopped.log.at(-1).replaced], [false, run.AUTHORITY, { text: "Use orchestrate-issues for #109.", merging: "coordinator" }]);
  assert.equal(later().record.invocation.text, "Use orchestrate-issues for #109.");
  const second = path.join(artifacts, "second.json");
  assert.throws(() => init({ record: second, coordinator: "local_b" }), /already has coordinator local_a/);
  assert.throws(() => init({ record: second, coordinator: "local_b", takeover: true, observations: { sessions: { local_a: { state: "idle" } } } }), /Takeover refused: .* waiting/);
  assert.throws(() => init({ record: second, coordinator: "local_b", takeover: true }), /Takeover refused: .* unknown/);
  assert.ok(!fs.existsSync(second), "a refused coordinator writes no record");
  assert.throws(() => run.initRecord({ record: path.join(artifacts, "x.json"), checkout, repository: "acme/widgets", issue: 101, coordinator: "local_c", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", invocation: "Use orchestrate-issues for #101.", concurrency: 9 }, { defaults, freeBytes: 40 * GB }), /--concurrency must be 1 to 8/);

  // Dependency admission and adoption. #101 is independent, #102 waits for an
  // open #101, #103's blocker is closed with its merge on origin/main, #106's
  // blocker is closed but its merge is not on origin/main, #104 has a draft PR
  // two rounds in, #105 a ready PR, #107 no Effort, #108 and #109 are eligible
  // past the concurrency limit, #110 has a worktree but no PR.
  const ticket = (number, more = {}) => ({ number, title: `ticket ${number}`, state: "open", parent: 100, container: false, effort: "Medium", delivered: false, blockers: [], prs: [], worktrees: [], ...more });
  const snapshot = {
    repository: "acme/widgets", issue: { number: 100, state: "open" }, originMain: "abc", tickets: [
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
  // #105's ready PR belongs to a writer the fixture treats as already
  // released, so it holds no place; the review regressions below cover a
  // ready PR whose writer is not settled.
  const settled105 = (rec) => ({ ...rec, tickets: { 105: { owner: null, pending: null, history: [{ released: "fixture: the ready PR's writer ended" }], results: [] }, ...rec.tickets } });
  const plan = (r, more = {}) => run.planDispatch({ record: settled105(run.readRecord(record)), snapshot, preflights: [available("claude-cli", "claude-opus-5-5", all)], freeBytes: 100 * GB, defaults, census: () => [], ...more, ...r });
  const actions = (p) => Object.fromEntries(p.tickets.map((t) => [t.number, t.action]));
  const p1 = plan();
  assert.deepEqual(actions(p1), { 101: "dispatch", 102: "wait-dependency", 103: "wait-capacity", 104: "adopt-pr", 105: "await-maintainer", 106: "wait-dependency", 107: "assign-effort", 108: "wait-capacity", 109: "wait-capacity", 110: "adopt-worktree", 111: "done", 112: "container" });
  assert.equal(p1.concurrency.active, 2, "existing PR and worktree work occupies capacity");
  const unknownEffort = plan({ snapshot: { ...snapshot, tickets: snapshot.tickets.map((t) => t.number === 107 ? { ...t, effort: "Huge" } : t) } });
  assert.deepEqual([actions(unknownEffort)[107], unknownEffort.tickets.find((t) => t.number === 107).reason], ["decision-needed", "Effort Huge has no writer effort"], "the coordinator assigns a missing Effort but never reinterprets an existing one");
  const adopted = p1.tickets.find((t) => t.number === 104);
  assert.deepEqual([adopted.pr, adopted.rounds], [504, 2], "an adopted PR keeps its started review rounds");
  assert.match(p1.tickets.find((t) => t.number === 106).reason, /#91 \(closed, but no merged deliverable is on origin\/main\)/);
  assert.equal(p1.complete, false);
  assert.ok(p1.remaining.some((line) => /maintainer to merge/.test(line)), "a run that recorded no coordinator merge leaves it to the maintainer");
  // A run whose recorded decision grants the coordinator the merge sends the
  // ready PR through the merge gate instead.
  const merging = { ...settled105(run.readRecord(record)), invocation: { text: "Use orchestrate-issues for #100.", merging: "coordinator" }, authority: run.authorityFor("coordinator") };
  const viaGate = plan({ record: merging });
  assert.equal(actions(viaGate)[105], "merge-gate");
  assert.ok(viaGate.remaining.some((line) => /merges only through integration\.mjs's merge gate/.test(line)));
  assert.equal(p1.tickets.find((t) => t.number === 101).route, "claude-cli");
  // More capacity admits the next eligible tickets in number order.
  const roomy = { ...settled105(run.readRecord(record)), concurrency: { limit: 4, basis: "test" } };
  assert.deepEqual(Object.entries(actions(plan({ record: roomy }))).filter(([, a]) => a === "dispatch").map(([n]) => Number(n)), [101, 103]);
  // Free disk below one writer's install blocks new dispatch and says so.
  assert.match(plan({ freeBytes: 13 * GB }).tickets.find((t) => t.number === 101).reason, /free disk does not admit another writer/);

  // Route choice never substitutes another model's available route or a
  // retired route, and names why each was passed over.
  const blocked = plan({ preflights: [available("claude-cli", "claude-sonnet-5-5", all), available("claude-desktop", "claude-opus-5-5", all), { route: "claude-cli", model: "claude-opus-5-5", verdicts: [{ ticket: 101, effort: "medium", verdict: "blocked", reason: "the Claude CLI probe exited 1: not signed in" }] }] }).tickets.find((t) => t.number === 101);
  assert.equal(blocked.action, "blocked-route");
  assert.match(blocked.reason, /claude-cli: the Claude CLI probe exited 1: not signed in; claude-desktop is retired as a dispatch route: /);
  assert.match(plan({ preflights: [] }).tickets.find((t) => t.number === 101).reason, /claude-cli: no preflight result for claude-opus-5-5 at medium/);

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

  // A pending start is settled by evidence, never assumed: it needs a reason
  // to withdraw, and a detached start is confirmed only by launch or reconcile.
  assert.throws(() => mutate(2, (r) => run.launched(r, { ticket: 101, handleKind: "session", handle: "local_w101" })), /started with launch and confirmed with reconcile/);
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
  const args101 = [standIn, "-p", "--model", "claude-opus-5-5", "--effort", "medium", "--permission-mode", "bypassPermissions", "--stop", stop101];
  assert.throws(() => mutate(rev, (r) => run.launch(r, { ticket: 101, executable: process.execPath, args: [standIn, "-p", "--model", "claude-opus-5-5", "--effort", "high", "--permission-mode", "bypassPermissions", "--stop", stop101], prompt })), /--effort must be medium/, "a launch at another effort is refused");
  assert.throws(() => mutate(rev, (r) => run.launch(r, { ticket: 101, executable: process.execPath, args: [standIn, "-p", "--model", "claude-sonnet-5-5", "--effort", "medium", "--permission-mode", "bypassPermissions", "--stop", stop101], prompt })), /--model must be claude-opus-5-5/, "a launch of another model is refused");
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
  const widened = (limit) => ({ ...settled105(run.readRecord(record)), concurrency: { limit, basis: "test" } });
  const p4File = write("plan4.json", plan({ record: widened(4), preflights: cliPreflights }));
  assert.throws(() => mutate(rev, (r) => run.claim(r, { plan: p4File, ticket: 103, worktree: wt101, branch: "fix/103-thing", artifactParent: artifacts })), /assigned to #101/, "one worktree per writer");

  // The writer's own metadata confirms or blocks the route through the
  // preflight's observed verdicts.
  assert.throws(() => mutate(rev, (r) => run.verify(r, { ticket: 101, preflight: write("confirm-other.json", { route: "claude-desktop", model: "claude-opus-5-5", verdicts: [{ ticket: 101, effort: "medium", verdict: "confirmed" }] }) })), /not claude-cli claude-opus-5-5/);
  rev = mutate(rev, (r) => run.verify(r, { ticket: 101, preflight: write("confirm.json", { route: "claude-cli", model: "claude-opus-5-5", verdicts: [{ ticket: 101, effort: "medium", verdict: "confirmed" }] }) }));
  assert.equal(run.readRecord(record).tickets[101].owner.verified, true);

  // The writer's report must carry the full contract; one at another effort
  // is kept and stops the writer.
  assert.throws(() => mutate(rev, (r) => run.result(r, { ticket: 101, report: write("partial.json", { model: "claude-opus-5-5", effort: "medium", pr: 601 }) })), /lacks permissionMode, reviewedHead, rounds, findings, verification, ci, filed, next/);
  const wrong = structuredClone(run.readRecord(record));
  run.result(wrong, { ticket: 101, report: write("wrong.json", { model: "claude-opus-5-5", effort: "low", permissionMode: "bypassPermissions", pr: 601, reviewedHead: "f1", rounds: { "gpt-6.1-sol": 1 }, findings: "None", verification: "check", ci: {}, filed: "None", next: "x" }) });
  assert.match(wrong.tickets[101].owner.mismatch, /the writer reported claude-opus-5-5 at low in bypassPermissions, not claude-opus-5-5 at medium in bypassPermissions/);
  rev = mutate(rev, (r) => run.result(r, { ticket: 101, report: write("report.json", { model: "claude-opus-5-5", effort: "medium", permissionMode: "bypassPermissions", pr: 601, reviewedHead: "f1", rounds: { "gpt-6.1-sol": 1 }, findings: "None", verification: "check", ci: { "hook-tests": "pass" }, filed: "None", next: "await review" }) }));

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
  assert.throws(() => mutate(rev, (r) => run.launch(r, { ticket: 101, executable: process.execPath, args: [standIn, "-p", "--model", "claude-opus-5-5", "--effort", "medium", "--permission-mode", "bypassPermissions", "--stop", stopLost], prompt, spawner: (o) => { const out = run.startDetachedWriter(o); started.push({ stop: stopLost, pid: out.pid }); throw new Error("the host lost the reply"); } })), /outcome of launch .* is uncertain/);
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

  // The brief carries the whole contract for a claimed CLI start.
  const p6File = write("plan6.json", plan());
  rev = mutate(rev, (r) => run.claim(r, { plan: p6File, ticket: 101, worktree: wt101, branch: "fix/101-thing", artifactParent: artifacts }));
  const text = run.brief(run.readRecord(record), p6File, 101, ["No stacked branches."], defaults);
  for (const needle of ["#101", "a sub-issue of issue #100", "The design of record is the body of issue #100, as its template structures it", "coordinator session local_a", "claude-cli, model claude-opus-5-5 at effort medium in permission mode bypassPermissions", defaults.routes.claude[0].selfCheck, "never substitute", "resolve-issue", wt101, "fix/101-thing", artifacts, "- No stacked branches.", "three-round cap", "checkpoint report", "machine-wide reviewer and test reservations", "Never merge", ...run.REPORT_FIELDS]) assert.ok(text.includes(needle), `brief names ${needle}`);

  // Adopting an existing PR records its writer without starting another and
  // carries the PR's started rounds into the brief.
  const p7File = write("plan7.json", plan());
  rev = mutate(rev, (r) => run.adopt(r, { plan: p7File, ticket: 104, handleKind: "session", handle: "local_w104", route: "claude-desktop", model: "claude-opus-5-5", effort: "medium", worktree: path.join(tmp, "wt-104") }));
  assert.match(run.brief(run.readRecord(record), p7File, 104, [], defaults), /PR #504, which has started 2 review rounds; the count continues/);
  assert.equal(run.readRecord(record).tickets[104].owner.adopted.rounds, 2);
  assert.throws(() => mutate(rev, (r) => run.adopt(r, { plan: p7File, ticket: 104, handleKind: "session", handle: "local_x", route: "claude-desktop", model: "claude-opus-5-5", effort: "medium", worktree: path.join(tmp, "wt-104") })), /revision/);
  // A session owner is observed through the coordinator's own tools; an
  // unobserved one blocks replacement.
  assert.equal(actions(plan({ observations: { sessions: { local_w104: { state: "running" } } } }))[104], "observe");
  assert.equal(actions(plan({ observations: { sessions: { local_w104: { state: "idle" } } } }))[104], "collect-report");
  assert.equal(actions(plan())[104], "blocked-owner-unknown", "an unobserved session blocks replacement");
  // A writer's request stays on the plan until its answer is delivered. A
  // relayed request stays open while the maintainer decides; an answer is a
  // message with its intent, outcome and identified retry.
  const idle104 = { sessions: { local_w104: { state: "idle" } } };
  assert.throws(() => mutate(rev, (r) => run.request(r, { ticket: 104, text: "authorize round 4?" })), /--source/);
  const asked = run.updateRecord(record, { expectRevision: rev, coordinator: "local_a" }, (r) => run.request(r, { ticket: 104, text: "authorize round 4?", source: "session local_w104 transcript" }));
  rev = asked.record.revision;
  const requestId = asked.output.id;
  const plan104 = () => plan({ observations: idle104 }).tickets.find((t) => t.number === 104);
  assert.deepEqual([plan104().action, plan104().requests.map((q) => q.text)], ["answer-request", ["authorize round 4?"]]);
  rev = mutate(rev, (r) => run.relay(r, { ticket: 104, request: requestId, to: "the maintainer" }));
  assert.match(plan104().reason, /relayed to the maintainer at .*; once they decide, record answer/, "a relayed request stays open");
  assert.throws(() => mutate(rev, (r) => run.answered(r, { ticket: 104, request: requestId })), /record answer before sending it/);
  const answering = run.updateRecord(record, { expectRevision: rev, coordinator: "local_a" }, (r) => run.answer(r, { ticket: 104, request: requestId, text: "round 4 is authorized" }));
  rev = answering.record.revision;
  assert.match(answering.output.message, new RegExp(`^Answer to your request ${requestId}, which asked: "authorize round 4\\?" \\(delivery \\w+\\):\\nround 4 is authorized\\nIf you already received an answer to request ${requestId}, ignore this copy\\.`), "the answer quotes the question it answers");
  assert.equal(plan104().action, "answer-request", "an answer recorded but not confirmed sent keeps the request open");
  assert.match(plan104().reason, /may still be queued; .* answer --retry/);
  assert.throws(() => mutate(rev, (r) => run.answer(r, { ticket: 104, request: requestId, text: "again" })), /--retry/);
  const resent = run.updateRecord(record, { expectRevision: rev, coordinator: "local_a" }, (r) => run.answer(r, { ticket: 104, request: requestId, retry: true }));
  rev = resent.record.revision;
  assert.match(resent.output.message, /round 4 is authorized/, "a retry resends the same answer");
  rev = mutate(rev, (r) => run.answered(r, { ticket: 104, request: requestId, evidence: "the writer acknowledged it" }));
  assert.throws(() => mutate(rev, (r) => run.answer(r, { ticket: 104, request: requestId, text: "again" })), /already answered/);
  assert.equal(plan104().action, "collect-report");
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
  assert.equal(actions(unlisted)[101], "decision-needed", "a pending start outside the parent issue is reported");
  assert.equal(unlisted.concurrency.active, 3, "and still occupies capacity beside #104 and #110");
  const p8File = write("plan8.json", plan({ record: widened(8) }));
  assert.throws(() => mutate(rev, (r) => run.claim(r, { plan: p8File, ticket: 103, worktree: wt103, branch: "fix/103-thing", artifactParent: artifacts })), /already exists; adopt/, "existing work is adopted, never claimed for a second writer");
  const wt109 = path.join(tmp, "wt-109");
  rev = mutate(rev, (r) => run.claim(r, { plan: p8File, ticket: 109, worktree: wt109, branch: "feat/109-thing", artifactParent: artifacts }));
  git(checkout, "worktree", "add", "-q", "-b", "feat/109-thing", wt109);
  const admin = git(wt109, "rev-parse", "--path-format=absolute", "--git-dir");
  const before = fs.readdirSync(admin).sort();
  // The stand-in spawner reports this check's own process as the writer.
  rev = mutate(rev, (r) => run.launch(r, { ticket: 109, executable: process.execPath, args: [standIn, "-p", "--model", "claude-opus-5-5", "--effort", "medium", "--permission-mode", "bypassPermissions"], prompt, spawner: () => ({ started: true, pid: process.pid }) }));
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
    issue: () => ({ state: "open", title: "Widgets", type: { name: "Task" }, body: "## Description\n\nx\n\n## Acceptance criteria\n\n- [ ] Widgets work.\n" }),
    worktrees: () => run.parseWorktrees(`worktree ${checkout}\nHEAD m1\nbranch refs/heads/main\n\nworktree ${path.join(tmp, "x")}\nHEAD e2\nbranch refs/heads/codex/fix/202-thing\n`),
    // Types as GitHub's sub-issues API reports them: #212 is a Task whose
    // sub-issues are all Bugs, so it stays a slice that delivers them; #210
    // holds a Task, so it is a container; #215 and #217 are Bugs under the
    // parent that sibling slices' PRs close.
    // #220 is an umbrella: a Task whose Bugs other slices' bodies claim, so
    // it is a container and its Bugs are delivered by the claimants. #223's
    // only PR is closed without merging; #224 is closed by two slices' PRs.
    subIssues: (n) => ({
      200: [{ number: 201, state: "open", title: "a", type: { name: "Task" }, body: "## Scope\n\nCloses #221 and, with it, #2010 outside this tree; closes other/repo#223 there, not here; closes #228 too (it does not: #227's own PR does)." }, { number: 202, state: "open", title: "b", type: { name: "Task" }, body: "Fixes acme/widgets#222." }, { number: 210, state: "open", title: "container", type: { name: "Task" } }, { number: 212, state: "open", title: "slice with bugs", type: { name: "Task" } }, { number: 215, state: "open", title: "sibling-closed bug", type: { name: "Bug" } }, { number: 217, state: "closed", title: "merged sibling bug", type: { name: "Bug" } }, { number: 220, state: "open", title: "umbrella", type: { name: "Task" } }, { number: 223, state: "open", title: "stale closed PR bug", type: { name: "Bug" } }, { number: 224, state: "open", title: "two closers bug", type: { name: "Bug" } }, { number: 225, state: "open", title: "pr-only umbrella", type: { name: "Task" } }, { number: 227, state: "open", title: "slice with its own pr", type: { name: "Task" } }],
      210: [{ number: 211, state: "open", title: "c", type: { name: "Task" } }],
      212: [{ number: 213, state: "open", title: "d", type: { name: "Bug" } }, { number: 214, state: "open", title: "e", type: { name: "Bug" } }],
      220: [{ number: 221, state: "open", title: "umbrella bug one", type: { name: "Bug" } }, { number: 222, state: "open", title: "umbrella bug two", type: { name: "Bug" } }],
      225: [{ number: 226, state: "open", title: "bug a sibling PR closes", type: { name: "Bug" } }],
      227: [{ number: 228, state: "open", title: "bug its own slice closes", type: { name: "Bug" } }],
    })[n] ?? [],
    blockedBy: (n) => ({ 201: [{ number: 190, state: "closed" }], 202: [{ number: 191, state: "closed" }] })[n] ?? [],
    effort: () => "Medium",
    pulls: (n) => ({
      190: [{ number: 390, state: "MERGED", mergeCommit: { oid: "on-main" }, headRefName: "fix/190-x", closingIssuesReferences: [{ number: 190 }] }],
      191: [{ number: 391, state: "MERGED", mergeCommit: { oid: "off-main" }, headRefName: "fix/191-x", closingIssuesReferences: [{ number: 191 }] }],
      201: [{ number: 401, state: "OPEN", isDraft: true, headRefName: "feat/201-x", headRefOid: "h1", closingIssuesReferences: [{ number: 215, repository: { name: "widgets", owner: { login: "acme" } } }, { number: 221 }, { number: 224 }, { number: 213, repository: { name: "repo", owner: { login: "other" } } }] }, { number: 499, state: "OPEN", isDraft: false, headRefName: "fix/2010-y", headRefOid: "h9", closingIssuesReferences: [{ number: 2010 }] }],
      202: [{ number: 392, state: "MERGED", mergeCommit: { oid: "on-main" }, headRefName: "fix/202-thing", closingIssuesReferences: [{ number: 217 }, { number: 224 }, { number: 226 }] }],
      211: [{ number: 405, state: "CLOSED", isDraft: false, headRefName: "fix/211-x", headRefOid: "h5", closingIssuesReferences: [{ number: 223 }] }],
      215: [{ number: 401, state: "OPEN", isDraft: true, headRefName: "feat/201-x", headRefOid: "h1", closingIssuesReferences: [{ number: 215 }, { number: 221 }, { number: 224 }] }],
      217: [{ number: 392, state: "MERGED", mergeCommit: { oid: "on-main" }, headRefName: "fix/202-thing", closingIssuesReferences: [{ number: 217 }, { number: 224 }, { number: 226 }] }],
      221: [{ number: 401, state: "OPEN", isDraft: true, headRefName: "feat/201-x", headRefOid: "h1", closingIssuesReferences: [{ number: 215 }, { number: 221 }, { number: 224 }] }],
      223: [{ number: 405, state: "CLOSED", isDraft: false, headRefName: "fix/211-x", headRefOid: "h5", closingIssuesReferences: [{ number: 223 }] }],
      227: [{ number: 407, state: "OPEN", isDraft: true, headRefName: "feat/227-x", headRefOid: "h7", closingIssuesReferences: [{ number: 227 }, { number: 228 }] }],
      228: [{ number: 407, state: "OPEN", isDraft: true, headRefName: "feat/227-x", headRefOid: "h7", closingIssuesReferences: [{ number: 227 }, { number: 228 }] }],
      224: [{ number: 401, state: "OPEN", isDraft: true, headRefName: "feat/201-x", headRefOid: "h1", closingIssuesReferences: [{ number: 215 }, { number: 221 }, { number: 224 }] }, { number: 392, state: "MERGED", mergeCommit: { oid: "on-main" }, headRefName: "fix/202-thing", closingIssuesReferences: [{ number: 217 }, { number: 224 }, { number: 226 }] }],
    })[n] ?? [],
    comments: () => [{ body: "### Review round 1 state\n" }, { body: "intro\n### Review round 3 state\n" }, { body: "Round 4 is not a heading" }],
    checks: () => [{ name: "hook-tests", state: "SUCCESS" }],
    onMain: (sha) => sha === "on-main",
  };
  const snap = run.takeSnapshot({ repository: "acme/widgets", issue: 200 }, client);
  const byNumber = Object.fromEntries(snap.tickets.map((t) => [t.number, t]));
  assert.deepEqual(byNumber[201].prs.map((p) => [p.number, p.rounds]), [[401, 3]], "the PR of another ticket is not adopted");
  assert.deepEqual(byNumber[201].blockers, [{ number: 190, state: "closed", delivered: true }]);
  assert.deepEqual(byNumber[202].blockers, [{ number: 191, state: "closed", delivered: false }]);
  assert.deepEqual(byNumber[202].worktrees.map((w) => w.branch), ["codex/fix/202-thing"]);
  assert.deepEqual([byNumber[210].container, byNumber[211].parent], [true, 210]);
  // The delivered-by relation: a Task whose sub-issues are all Bugs is a slice
  // that delivers them; a Bug whose only PR is a sibling slice's (its branch
  // names the sibling, and it closes the Bug) is delivered by that slice; a
  // ticket with a PR of its own is its own slice; a merged deliverer's Bug is
  // delivered. The final gate's scope read lists the same slices.
  assert.deepEqual([byNumber[212].container, byNumber[212].deliveredBy, byNumber[212].type], [false, undefined, "Task"], "a slice whose sub-issues are all Bugs is not a container");
  assert.deepEqual([byNumber[213].deliveredBy, byNumber[214].deliveredBy], [{ ticket: 212, via: "sub-issue", pr: null, merged: false }, { ticket: 212, via: "sub-issue", pr: null, merged: false }], "its Bugs are delivered by its PR, which does not exist yet");
  assert.deepEqual(byNumber[215].deliveredBy, { ticket: 201, via: "pr", pr: 401, merged: false }, "a Bug a sibling's PR closes is delivered by that sibling");
  assert.deepEqual([byNumber[217].deliveredBy, byNumber[217].delivered], [{ ticket: 202, via: "pr", pr: 392, merged: true }, true], "a Bug a merged sibling PR closed is delivered");
  assert.equal(byNumber[201].deliveredBy, undefined, "a ticket with a PR of its own is its own slice");
  // An umbrella whose Bugs other slices' bodies claim is a container, not a
  // slice: the sibling's PR or body delivers each Bug, and the umbrella is
  // never dispatched for them.
  assert.deepEqual([byNumber[220].container, byNumber[220].deliveredBy], [true, undefined], "an umbrella is a container");
  assert.deepEqual(byNumber[221].deliveredBy, { ticket: 201, via: "pr", pr: 401, merged: false }, "the claimant's open PR delivers the umbrella's Bug, never the umbrella");
  assert.deepEqual(byNumber[222].deliveredBy, { ticket: 202, via: "body", pr: 392, merged: true }, "a body claim with the claimant's merged PR");
  assert.equal(byNumber[223].deliveredBy, undefined, "a closed, unmerged PR delivers nothing, and a body reference qualified with another repository names nothing here");
  // An umbrella whose only claims come from a sibling's PR, with no body
  // mention, is a container too: the Bug's own PR list is empty, and the
  // claim is read from the sibling's PR.
  assert.deepEqual([byNumber[225].container, byNumber[226].prs, byNumber[226].deliveredBy], [true, [], { ticket: 202, via: "pr", pr: 392, merged: true }], "a PR-only claim makes the umbrella a container");
  // A PR's closing reference to another repository claims nothing (#213 stays
  // its slice's), a qualified reference to the tickets repository counts
  // (#215), and a slice's own PR claiming its sub-issue wins over a sibling's
  // body claim, so the slice stays a slice (#227) and its Bug is delivered by
  // that PR (#228).
  assert.deepEqual(byNumber[213].deliveredBy.ticket, 212, "a foreign-repository PR reference claims nothing");
  assert.deepEqual([byNumber[227].container, byNumber[227].deliveredBy, byNumber[228].deliveredBy], [false, undefined, { ticket: 227, via: "pr", pr: 407, merged: false }], "the own PR's claim outranks the sibling's body claim in the classification too");
  assert.deepEqual([byNumber[224].deliveredBy, byNumber[224].deliveryConflict], [undefined, [201, 202]], "two slices' PRs closing one ticket is a conflict, not a delivery");
  assert.deepEqual(run.readIssueScope({ issue: 200 }, client).slices, run.snapshotScope(snap).slices, "the scope read and the snapshot agree on the slices");
  assert.deepEqual(run.snapshotScope(snap).slices, ["#201 open", "#202 open", "#211 open", "#212 open", "#213 open", "#214 open", "#215 open", "#217 closed", "#221 open", "#222 open", "#223 open", "#224 open", "#226 open", "#227 open", "#228 open"]);
  assert.deepEqual(run.closingReferences("Closes #1, closes #2, fixed #3, Resolves: acme/widgets#4, close #1, other/repo#2 is not closed, and #5 is only mentioned").map((r) => `${r.repository ?? ""}#${r.number}`), ["#1", "#2", "#3", "acme/widgets#4"]);
  assert.deepEqual(run.readIssueScope({ issue: 200 }, client).slices, run.snapshotScope(snap).slices, "the scope read reads the same PRs and agrees");
  // The parent is of any type: a Task with sub-issues is orchestrated as a
  // Feature is, and the brief names it by the type GitHub reports and points
  // the writer at its body as the design of record, never at a Feature.
  {
    assert.deepEqual([snap.issue.number, snap.issue.type, snap.issue.criteria.map((c) => c.text)], [200, "Task", ["Widgets work."]], "the snapshot carries the parent's type and criteria");
    const taskRecord = path.join(artifacts, "run-200.json");
    assert.equal(run.initRecord({ record: taskRecord, checkout, repository: "acme/widgets", issue: 200, coordinator: "local_a", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", coordinatorMode: "bypassPermissions", invocation: "Use orchestrate-issues for #200.", concurrency: 4 }, { defaults, freeBytes: 40 * GB, totalMemory: 64 * GB }).action, "init");
    const taskPlan = run.planDispatch({ record: run.readRecord(taskRecord), snapshot: snap, preflights: [available("claude-cli", "claude-opus-5-5", [211, 212])], freeBytes: 100 * GB, defaults, census: () => [] });
    assert.deepEqual([taskPlan.parent, actions(taskPlan)[211]], [{ type: "Task", title: "Widgets" }, "dispatch"], "the plan carries the parent's type and admits the nested slice");
    // Delivered tickets are never dispatched and hold no place: only #201's
    // draft PR and #202's worktree occupy capacity, so #212 waits on the limit
    // behind #211, and each slice's entry names what its PR delivers.
    assert.deepEqual([213, 214, 215, 221].map((n) => actions(taskPlan)[n]), ["delivered-by", "delivered-by", "delivered-by", "delivered-by"]);
    assert.deepEqual([actions(taskPlan)[217], actions(taskPlan)[212], taskPlan.concurrency.active], ["done", "wait-capacity", 3], "a merged deliverer's Bug is done; delivered Bugs take no writer place");
    assert.match(taskPlan.tickets.find((t) => t.number === 215).reason, /#201's PR #401 delivers it \(that PR closes it\): it is never dispatched and holds no writer place/);
    assert.match(taskPlan.tickets.find((t) => t.number === 213).reason, /#212's PR delivers it \(a Bug under slice #212\)/);
    assert.deepEqual([actions(taskPlan)[220], actions(taskPlan)[225], actions(taskPlan)[223], actions(taskPlan)[224], actions(taskPlan)[226], actions(taskPlan)[227], actions(taskPlan)[228]], ["container", "container", "blocked-route", "decision-needed", "decision-needed", "adopt-pr", "delivered-by"], "umbrellas are containers, a ticket with only a dead PR is its own work, two closers need the maintainer, a merged deliverer with the ticket open is a decision, and a slice whose own PR claims its Bug keeps it");
    assert.deepEqual(taskPlan.tickets.find((t) => t.number === 227).delivers, [228]);
    // A conflicted ticket's pending start keeps its place.
    const conflicted = run.planDispatch({ record: { ...run.readRecord(taskRecord), tickets: { 224: { owner: null, pending: { operation: "dispatch", launchId: "L1", route: "claude-cli", host: os.hostname(), since: new Date().toISOString() }, history: [], results: [] } } }, snapshot: snap, preflights: [], freeBytes: 100 * GB, defaults, census: () => [] });
    assert.deepEqual([actions(conflicted)[224], conflicted.concurrency.active], ["decision-needed", 4], "a pending start on a conflicted ticket is counted until settled");
    assert.match(conflicted.tickets.find((t) => t.number === 224).reason, /keeps a place until it is settled/);
    assert.match(taskPlan.tickets.find((t) => t.number === 224).reason, /#201 and #202 both claim it \(by an open or merged PR or a body closing reference\)/);
    assert.match(taskPlan.tickets.find((t) => t.number === 222).reason, /#202's PR #392 is merged on origin\/main, but GitHub left it open/, "a merged deliverer with the ticket still open is a decision, not a silent wait");
    assert.equal(actions(taskPlan)[222], "decision-needed");
    assert.deepEqual([212, 201, 202].map((n) => taskPlan.tickets.find((t) => t.number === n).delivers), [[213, 214], [215, 221], [217, 222, 226]]);
    assert.equal(taskPlan.concurrency.active, 3, "#227's draft PR reserves a place beside #201's PR and #202's worktree");
    assert.equal(taskPlan.tickets.find((t) => t.number === 211).delivers, undefined);
    // A writer the record holds for a delivered ticket is a mistake to settle,
    // and it holds the slice that would otherwise start the same work.
    const held = run.planDispatch({ record: { ...run.readRecord(taskRecord), tickets: { 213: { owner: { route: "claude-desktop", handle: { kind: "session", id: "local_stray" }, since: new Date().toISOString() }, pending: null, history: [], results: [] } } }, snapshot: snap, preflights: [available("claude-cli", "claude-opus-5-5", [212])], freeBytes: 100 * GB, defaults, census: () => [], observations: { sessions: { local_stray: { state: "running" } } } });
    assert.deepEqual([actions(held)[213], actions(held)[212], held.concurrency.active], ["decision-needed", "wait-dependency", 4], "a held writer on a delivered ticket is counted and holds its slice");
    assert.match(held.tickets.find((t) => t.number === 212).reason, /#213, which its PR delivers, holds a writer or work of its own; settle that before #212 is dispatched/);
    // A worktree on a delivered ticket with no recorded writer is existing
    // work to adopt, and it holds the slice the same way.
    const treeSnap = { ...snap, tickets: snap.tickets.map((t) => (t.number === 213 ? { ...t, worktrees: [{ path: path.join(tmp, "wt-213-stray"), branch: "fix/213-work", head: "x" }] } : t)) };
    const tree = run.planDispatch({ record: run.readRecord(taskRecord), snapshot: treeSnap, preflights: [available("claude-cli", "claude-opus-5-5", [212])], freeBytes: 100 * GB, defaults, census: () => [] });
    assert.deepEqual([actions(tree)[213], actions(tree)[212], tree.concurrency.active], ["adopt-worktree", "wait-dependency", 4], "a worktree on a delivered ticket reserves a place and holds its slice");
    // The slice that delivers Bugs is dispatched like any other, and its brief
    // asks for their closing references.
    const slicePlan = run.planDispatch({ record: run.readRecord(taskRecord), snapshot: snap, preflights: [available("claude-cli", "claude-opus-5-5", [212])], freeBytes: 100 * GB, defaults, census: () => [] });
    assert.deepEqual([actions(slicePlan)[211], actions(slicePlan)[212]], ["blocked-route", "dispatch"]);
    const taskPlanFile = write("plan-200.json", slicePlan);
    run.updateRecord(taskRecord, { expectRevision: 1, coordinator: "local_a" }, (r) => run.claim(r, { plan: taskPlanFile, ticket: 212, worktree: path.join(tmp, "wt-212"), branch: "fix/212-thing", artifactParent: artifacts }));
    const taskBrief = run.brief(run.readRecord(taskRecord), taskPlanFile, 212, [], defaults);
    assert.match(taskBrief, /You are the writer for acme\/widgets ticket #212 \(slice with bugs\), a sub-issue of Task #200, coordinated by/);
    assert.match(taskBrief, /Your PR also delivers #213, #214 \(sub-issues of #212, or tickets its body or PR closes\), never dispatched to another writer, so the PR body carries a closing reference for each of them beside the one for #212/);
    assert.match(taskBrief, /The design of record is the body of Task #200, as its template structures it, together with the decisions below\. Settled decisions: none beyond the ticket and that body\./);
    assert.doesNotMatch(taskBrief, /Feature/, "nothing in the brief calls the Task a Feature");
    // A delivered Bug's own blocker holds its deliverer; a claim by a ticket
    // that cannot deliver (a container, or a ticket itself delivered) is a
    // decision, not a delivery; a body claim written as the issue's URL counts.
    const task = (number, title, body) => ({ number, state: "open", title, type: { name: "Task" }, ...(body && { body }) });
    const bug = (number, title, body) => ({ number, state: "open", title, type: { name: "Bug" }, ...(body && { body }) });
    const miniTree = {
      200: [task(301, "slice"), task(303, "blocker slice"), task(311, "claiming container", "Closes #313."), bug(313, "claimed by a container"), task(321, "slice with a claiming bug"), bug(323, "claimed by a delivered bug"), task(331, "url claimant", "Closes https://github.com/acme/widgets/issues/334, and closes https://github.com/other/repo/issues/336."), task(333, "url umbrella"), task(335, "foreign url umbrella")],
      301: [bug(302, "blocked bug")], 311: [task(312, "inner task")], 321: [bug(322, "claiming bug", "Closes #323.")], 333: [bug(334, "url-claimed bug")], 335: [bug(336, "bug a foreign url names")],
    };
    const mini = { fetchMain: () => "m1", worktrees: () => [], onMain: () => false, issue: () => ({ state: "open", title: "Widgets", type: { name: "Task" }, body: "" }), subIssues: (n) => miniTree[n] ?? [], blockedBy: (n) => (n === 302 ? [{ number: 303, state: "open" }] : []), effort: () => "Medium", pulls: () => [], comments: () => [], checks: () => [] };
    const miniSnap = run.takeSnapshot({ repository: "acme/widgets", issue: 200 }, mini);
    const m = Object.fromEntries(miniSnap.tickets.map((t) => [t.number, t]));
    assert.deepEqual([m[311].container, m[313].claimInvalid, m[313].deliveredBy], [true, { ticket: 311, via: "body", reason: "a container, planned through its own sub-issues" }, undefined], "a container's claim delivers nothing");
    assert.deepEqual([m[322].deliveredBy, m[323].claimInvalid?.ticket, m[323].deliveredBy], [{ ticket: 321, via: "sub-issue", pr: null, merged: false }, 322, undefined], "a delivered ticket's claim delivers nothing");
    assert.deepEqual([m[333].container, m[334].deliveredBy, m[335].container, m[336].deliveredBy], [true, { ticket: 331, via: "body", pr: null, merged: false }, false, { ticket: 335, via: "sub-issue", pr: null, merged: false }], "a URL claim counts for the tickets repository and names nothing for another");
    assert.deepEqual(run.readIssueScope({ issue: 200, tickets: "acme/widgets" }, mini).slices, run.snapshotScope(miniSnap).slices, "the scope read agrees");
    const miniPlan = run.planDispatch({ record: run.readRecord(taskRecord), snapshot: miniSnap, preflights: [available("claude-cli", "claude-opus-5-5", [303])], freeBytes: 100 * GB, defaults, census: () => [] });
    assert.deepEqual([301, 302, 303, 313, 323, 334].map((n) => actions(miniPlan)[n]), ["wait-dependency", "delivered-by", "dispatch", "decision-needed", "decision-needed", "delivered-by"]);
    assert.match(miniPlan.tickets.find((t) => t.number === 301).reason, /#302, which its PR delivers, waits for #303 \(open\)/);
    assert.deepEqual(miniPlan.tickets.find((t) => t.number === 301).waitingFor, [303]);
    assert.match(miniPlan.tickets.find((t) => t.number === 313).reason, /#311's body claims it, but #311 cannot deliver it \(a container/);
    assert.match(miniPlan.tickets.find((t) => t.number === 323).reason, /#322's body claims it, but #322 cannot deliver it \(itself delivered by another slice or contested\)/);
    assert.deepEqual(miniPlan.tickets.find((t) => t.number === 321).delivers, [322], "no writer is handed a claim its slice cannot carry");
    assert.deepEqual(run.closingReferences("Fixes https://github.com/acme/widgets/issues/7 and closes http://github.com/o/r/issues/8").map((r) => `${r.repository}#${r.number}`), ["acme/widgets#7", "o/r#8"]);
    // A reference inside an HTML comment is invisible to GitHub and claims nothing.
    assert.deepEqual(run.closingReferences("<!-- Previous scope: Closes #102. -->\nNothing here.\n<!--\ncloses #103\n-->"), []);
    // A ticket another ticket claims delivers none of its own sub-issues: Task
    // #402, claimed by #401's body, is a container reported for a decision,
    // and its Bug #403 is planned on its own. An unrelated merged PR naming a
    // delivered Bug neither completes it nor admits its dependents.
    const t2 = {
      200: [task(401, "claimant", "Closes #402. <!-- and closes #404 once, long ago -->"), task(402, "claimed task"), task(405, "slice with a bug"), task(406, "waits on the bug"), bug(404, "independent bug")],
      402: [bug(403, "bug under a claimed task")], 405: [bug(407, "closed bug the slice delivers")],
    };
    const t2Pulls = { 407: [{ number: 599, state: "MERGED", mergeCommit: { oid: "on-main" }, headRefName: "fix/999-work", closingIssuesReferences: [{ number: 407 }] }], 405: [{ number: 501, state: "OPEN", isDraft: true, headRefName: "feat/405-x", headRefOid: "h501", closingIssuesReferences: [{ number: 405 }, { number: 407 }] }] };
    const t2Client = { ...mini, subIssues: (n) => t2[n] ?? [], pulls: (n) => [...(t2Pulls[n] ?? []), ...(n === 407 ? t2Pulls[405] : [])], blockedBy: (n) => (n === 406 ? [{ number: 407, state: "closed" }] : []), onMain: (sha) => sha === "on-main" };
    const t2Snap = run.takeSnapshot({ repository: "acme/widgets", issue: 200 }, { ...t2Client, subIssues: (n) => (t2[n] ?? []).map((x) => (x.number === 407 ? { ...x, state: "closed" } : x)) });
    const k = Object.fromEntries(t2Snap.tickets.map((t) => [t.number, t]));
    assert.deepEqual([k[402].container, k[402].claimedContainer, k[403].deliveredBy, k[404].deliveredBy], [true, { ticket: 401, via: "body" }, undefined, undefined], "a claimed task delivers nothing and a commented-out claim names nothing");
    assert.deepEqual([k[407].deliveredBy, k[407].delivered, k[406].blockers[0].delivered], [{ ticket: 405, via: "pr", pr: 501, merged: false }, false, false], "only the deliverer's merge delivers the Bug and admits its dependents");
    const t2Plan = run.planDispatch({ record: run.readRecord(taskRecord), snapshot: t2Snap, preflights: [available("claude-cli", "claude-opus-5-5", [403, 404, 406])], freeBytes: 100 * GB, defaults, census: () => [] });
    assert.deepEqual([402, 403, 404, 406, 407].map((n) => actions(t2Plan)[n]), ["decision-needed", "dispatch", "dispatch", "wait-dependency", "decision-needed"]);
    assert.match(t2Plan.tickets.find((t) => t.number === 402).reason, /#401's body claims it, but it has sub-issues of its own/);
    assert.equal(t2Plan.tickets.find((t) => t.number === 401).delivers, undefined, "no writer is handed a container's closing reference");
    // A claim on a container keeps the container's unsettled worktree: it
    // reserves a place and holds the container's sub-issues.
    const treeT2 = { ...t2Snap, tickets: t2Snap.tickets.map((t) => (t.number === 402 ? { ...t, worktrees: [{ path: path.join(tmp, "wt-402"), branch: "feat/402-work", head: "x" }] } : t)) };
    const treeT2Plan = run.planDispatch({ record: run.readRecord(taskRecord), snapshot: treeT2, preflights: [available("claude-cli", "claude-opus-5-5", [403, 404, 406])], freeBytes: 100 * GB, defaults, census: () => [] });
    assert.deepEqual([actions(treeT2Plan)[402], actions(treeT2Plan)[403], treeT2Plan.concurrency.active - t2Plan.concurrency.active], ["decision-needed", "wait-dependency", 1], "the claimed container's worktree reserves a place and holds #403");
    assert.match(treeT2Plan.tickets.find((t) => t.number === 402).reason, /existing work on it .*wt-402.* may still have a writer/);
    // A Bug closed by hand without its deliverer's merge still holds its
    // deliverer on its own unmet blocker.
    const closedSnap = { ...miniSnap, tickets: miniSnap.tickets.map((t) => (t.number === 302 ? { ...t, state: "closed", delivered: false } : t)) };
    const closedPlan = run.planDispatch({ record: run.readRecord(taskRecord), snapshot: closedSnap, preflights: [available("claude-cli", "claude-opus-5-5", [301, 303])], freeBytes: 100 * GB, defaults, census: () => [] });
    assert.deepEqual([actions(closedPlan)[301], actions(closedPlan)[302]], ["wait-dependency", "decision-needed"], "a closed issue alone is not delivery");
  }

  // The cutover switch, each position pinned from its own copy of the repos
  // file; no case reads the committed position.
  const committedRepos = readRepos();
  const pinRepos = (cutover) => { const file = path.join(tmp, `repos-${cutover ? "on" : "off"}.json`); fs.writeFileSync(file, JSON.stringify({ ...committedRepos, code: "acme/widgets", internal: "acme/widgets-internal", cutover })); return readRepos(file); };
  const OFF = pinRepos(false), ON = pinRepos(true), INTERNAL = "acme/widgets-internal";
  const parentSnapshot = (issue, tickets) => ({ repository: "acme/widgets", issue: { number: issue, state: "open" }, originMain: "abc", tickets });
  assert.deepEqual(run.startRepositories("acme/widgets", OFF), {}, "with the switch off a run has one repository, and its record names no second one");
  assert.deepEqual(run.startRepositories("acme/widgets", ON), { ticketsRepository: INTERNAL });
  assert.deepEqual(run.startRepositories("acme/other", ON), {}, "a repository the file does not name keeps its own tickets");

  // The GitHub calls of each position, through an injected gh.
  const ghCalls = (names, reply) => { const calls = []; return { calls, client: run.githubClient(names, checkout, { run: (cmd, args) => { calls.push(`${cmd} ${args.join(" ")}`); return reply(args); } }) }; };
  // `pulls` answers every PR search, or, as a function, each search by its query.
  const replies = (pulls, comments = {}) => (args) => (args[0] === "api" && args[1] === "user" ? "shared\n" : args[0] === "pr" && args[1] === "list" ? JSON.stringify(typeof pulls === "function" ? pulls(args[args.indexOf("--search") + 1]) : pulls) : args[0] === "pr" ? JSON.stringify({ statusCheckRollup: [] }) : args.includes("--slurp") ? JSON.stringify([comments[args.at(-1)] ?? []]) : "{}");
  const listFields = "number,state,isDraft,headRefName,headRefOid,baseRefName,closingIssuesReferences,mergeCommit,createdAt";
  {
    const { client: one, calls } = ghCalls({ repository: "acme/widgets" }, replies([]));
    one.issue(200); one.subIssues(200); one.blockedBy(201); one.effort(201); one.pulls(201); one.comments(401, 201); one.checks(401);
    assert.deepEqual(calls, [
      "gh api repos/acme/widgets/issues/200",
      "gh api --paginate --slurp repos/acme/widgets/issues/200/sub_issues",
      "gh api --paginate --slurp repos/acme/widgets/issues/201/dependencies/blocked_by",
      "gh api --paginate --slurp -H X-GitHub-Api-Version: 2026-03-10 repos/acme/widgets/issues/201/issue-field-values",
      `gh pr list --repo acme/widgets --state all --search 201 --limit 100 --json ${listFields}`,
      "gh api --paginate --slurp repos/acme/widgets/issues/401/comments",
      "gh pr view 401 --repo acme/widgets --json statusCheckRollup",
    ], "with one repository the client makes today's calls, and a PR's comments are its own");
  }
  // With tickets apart, every ticket read goes through REST on the internal
  // repository, and a ticket's PRs are the shared account's on a head branch
  // <type>/<N>-: a same-numbered branch from another author and a branch of
  // another number are not the ticket's, and only closing references to the
  // tickets repository stay. A PR's review rounds come from its ticket.
  {
    const ref = (slug, number) => ({ number, repository: { name: slug.split("/")[1], owner: { login: slug.split("/")[0] } } });
    const pr = (number, branch, login, refs) => ({ number, state: "OPEN", isDraft: true, headRefName: branch, headRefOid: `h${number}`, baseRefName: "main", closingIssuesReferences: refs, mergeCommit: null, author: { login } });
    const listed = [pr(701, "feat/7-thing", "shared", [ref(INTERNAL, 7), ref("acme/widgets", 7)]), pr(702, "fix/7-thing", "someone-else", [ref(INTERNAL, 7)]), pr(703, "feat/70-other", "shared", [ref(INTERNAL, 70)])];
    // GitHub's head: qualifier matches a branch name's start, so a branch with
    // a prefix a claim allows is answered only by the search for the number.
    const prefixed = pr(704, "codex/fix/7-prefixed", "shared", [ref(INTERNAL, 7)]);
    const heads = run.DISCOVERY_TYPES.map((t) => `head:${t}/7-`).join(" ");
    const { client: split, calls } = ghCalls({ repository: "acme/widgets", ticketsRepository: INTERNAL }, replies((search) => (search === heads ? listed : search === "7" ? [prefixed, listed[0], pr(705, "fix/77-other", "shared", [])] : []), { [`repos/${INTERNAL}/issues/7/comments`]: [{ body: "### Review round 2 state\n" }], "repos/acme/widgets/issues/701/comments": [{ body: "### Review round 5 state\n" }] }));
    split.issue(6); split.subIssues(6); split.blockedBy(7); split.effort(7);
    const found = split.pulls(7);
    assert.deepEqual(found.map((p) => [p.number, p.closingIssuesReferences.map((r) => `${r.repository.owner.login}/${r.repository.name}#${r.number}`)]), [[704, [`${INTERNAL}#7`]], [701, [`${INTERNAL}#7`]]], "only the shared account's PRs on the ticket's own branch, prefixed or not, are the ticket's, once each, with their references to the tickets repository");
    assert.ok(!("author" in found[0]), "the author is read for discovery only");
    split.comments(701, 7); split.checks(701);
    assert.deepEqual(calls, [
      `gh api repos/${INTERNAL}/issues/6`,
      `gh api --paginate --slurp repos/${INTERNAL}/issues/6/sub_issues`,
      `gh api --paginate --slurp repos/${INTERNAL}/issues/7/dependencies/blocked_by`,
      `gh api --paginate --slurp -H X-GitHub-Api-Version: 2026-03-10 repos/${INTERNAL}/issues/7/issue-field-values`,
      "gh api user --jq .login",
      `gh pr list --repo acme/widgets --author @me --state all --search ${heads} --limit 100 --json ${listFields},author`,
      `gh pr list --repo acme/widgets --author @me --state all --search 7 --limit 100 --json ${listFields},author`,
      `gh api --paginate --slurp repos/${INTERNAL}/issues/7/comments`,
      "gh pr view 701 --repo acme/widgets --json statusCheckRollup",
    ]);
    assert.ok(!calls.some((c) => /graphql|^gh issue|repos\/acme\/widgets\//.test(c)), "nothing reads tickets or comments of the code repository, and nothing uses GraphQL for them");
    assert.throws(() => split.comments(701), /Supply ticket/, "a PR's review thread needs its ticket once tickets live apart");
    const splitSnap = run.takeSnapshot({ repository: "acme/widgets", issue: 6 }, { ...split, fetchMain: () => "m1", worktrees: () => [], onMain: () => false, issue: () => ({ state: "open", title: "Feature", body: "" }), subIssues: (n) => (n === 6 ? [{ number: 7, state: "open", title: "slice" }] : []), blockedBy: () => [], effort: () => "Medium" });
    assert.deepEqual(splitSnap.tickets[0].prs.map((p) => [p.number, p.rounds]), [[704, 2], [701, 2]], "the PRs' rounds come from the round-state comments on their ticket");
    // The record names the tickets repository; its brief and remaining work
    // send the writer and the checkpoint decisions there.
    const dir = path.join(tmp, "split-run");
    git(tmp, "init", "-q", "-b", "main", dir);
    git(dir, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "--allow-empty", "-m", "base");
    const file = path.join(dir, "run.json");
    run.initRecord({ record: file, checkout: dir, repository: "acme/widgets", ...run.startRepositories("acme/widgets", ON), issue: 6, coordinator: "local_split", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", coordinatorMode: "bypassPermissions", invocation: "Use orchestrate-issues for #6." }, { defaults, freeBytes: 100 * GB, totalMemory: 64 * GB });
    assert.throws(() => run.initRecord({ record: path.join(dir, "bad.json"), checkout: dir, repository: "acme/widgets", ticketsRepository: "acme/widgets", issue: 9, coordinator: "local_split", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", invocation: "x" }, { defaults, freeBytes: 100 * GB, totalMemory: 64 * GB }), /another owner\/name than --repo/);
    const splitRecord = run.readRecord(file);
    assert.equal(splitRecord.ticketsRepository, INTERNAL);
    // The coordinator pointer is keyed by the repository holding the parent issue,
    // so a code repository issue #6 in the same checkout, from a run of one
    // repository, has its own pointer at the path it always had.
    const sameNumber = run.initRecord({ record: path.join(dir, "public-6.json"), checkout: dir, repository: "acme/widgets", issue: 6, coordinator: "local_public", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", coordinatorMode: "bypassPermissions", invocation: "Use orchestrate-issues for #6." }, { defaults, freeBytes: 100 * GB, totalMemory: 64 * GB });
    assert.equal(sameNumber.action, "init", "an unrelated issue of the same number in the code repository starts its own run");
    assert.equal(sameNumber.pointer, run.pointerFile(dir, "acme/widgets", 6));
    assert.notEqual(run.pointerFile(dir, INTERNAL, 6), sameNumber.pointer);
    assert.equal(JSON.parse(fs.readFileSync(run.pointerFile(dir, INTERNAL, 6), "utf8")).coordinator, "local_split", "and the internal issue's pointer still names its coordinator");
    assert.deepEqual(run.repositoriesOf(splitRecord).thread(701, 7), { repo: INTERNAL, number: 7, issueUrl: `https://api.github.com/repos/${INTERNAL}/issues/7` });
    const splitSnapshot = parentSnapshot(6, [{ ...ticket(7), parent: 6 }]);
    const splitPlanFile = write("split-plan.json", run.planDispatch({ record: splitRecord, snapshot: splitSnapshot, preflights: [available("claude-cli", "claude-opus-5-5", [7])], freeBytes: 100 * GB, defaults }));
    assert.match(readJsonFile(splitPlanFile).remaining[0], /publishes it on the slice's ticket, its review thread\.$/);
    run.updateRecord(file, { expectRevision: 1, coordinator: "local_split" }, (r) => run.claim(r, { plan: splitPlanFile, ticket: 7, worktree: path.join(dir, "wt-7"), branch: "feat/7-thing", artifactParent: dir }));
    // Once tickets live apart a ticket's own PR list holds only PRs on its own
    // branch, so a sibling's PR that closes it is seen from the sibling's side:
    // Bug #8, closed by #7's PR #701 and found by the actual client, is
    // delivered by #7, never dispatched.
    {
      const listedWith8 = [pr(701, "feat/7-thing", "shared", [ref(INTERNAL, 7), ref(INTERNAL, 8)])];
      const { client: split8 } = ghCalls({ repository: "acme/widgets", ticketsRepository: INTERNAL }, replies((search) => (search === heads || search === "7" ? listedWith8 : []), { [`repos/${INTERNAL}/issues/7/comments`]: [] }));
      const split8Snap = run.takeSnapshot({ repository: "acme/widgets", issue: 6, tickets: INTERNAL }, { ...split8, fetchMain: () => "m1", worktrees: () => [], onMain: () => false, issue: () => ({ state: "open", title: "Widgets", type: { name: "Task" }, body: "" }), subIssues: (n) => (n === 6 ? [{ number: 7, state: "open", title: "slice", type: { name: "Task" } }, { number: 8, state: "open", title: "bug the slice closes", type: { name: "Bug" } }] : []), blockedBy: () => [], effort: () => "Medium" });
      const eight = split8Snap.tickets.find((t) => t.number === 8);
      assert.deepEqual([eight.prs, eight.deliveredBy], [[], { ticket: 7, via: "pr", pr: 701, merged: false }], "the sibling's PR is absent from the Bug's own list and still delivers it");
      const split8Plan = run.planDispatch({ record: run.readRecord(file), snapshot: split8Snap, preflights: [available("claude-cli", "claude-opus-5-5", [8])], freeBytes: 100 * GB, defaults, census: () => [] });
      assert.deepEqual([actions(split8Plan)[8], split8Plan.tickets.find((t) => t.number === 7).delivers], ["delivered-by", [8]], "the Bug is delivered by #7 whatever the record holds for #7");
      // The snapshot command passes the run's tickets repository, so a body
      // reference qualified with it claims after the cutover: Task #7's body
      // "Closes acme/widgets-internal#9" delivers Bug #9 under umbrella #10.
      const { client: split9 } = ghCalls({ repository: "acme/widgets", ticketsRepository: INTERNAL }, replies(() => []));
      const bodyClient = { ...split9, fetchMain: () => "m1", worktrees: () => [], onMain: () => false, issue: () => ({ state: "open", title: "Widgets", type: { name: "Task" }, body: "" }), subIssues: (n) => ({ 6: [{ number: 7, state: "open", title: "slice", type: { name: "Task" }, body: `Closes ${INTERNAL}#9.` }, { number: 10, state: "open", title: "umbrella", type: { name: "Task" } }], 10: [{ number: 9, state: "open", title: "bug the slice's body claims", type: { name: "Bug" } }] })[n] ?? [], blockedBy: () => [], effort: () => "Medium" };
      const cliOut = path.join(tmp, "split-cli-snapshot.json");
      run.main(["snapshot", "--record", file, "--out", cliOut], { clientFor: () => bodyClient, defaults });
      const cliSnap = readJsonFile(cliOut);
      assert.deepEqual([cliSnap.tickets.find((t) => t.number === 10).container, cliSnap.tickets.find((t) => t.number === 9).deliveredBy], [true, { ticket: 7, via: "body", pr: null, merged: false }], "the CLI snapshot reads qualified body claims against the tickets repository");
      assert.deepEqual(run.snapshotScope(cliSnap).slices, run.readIssueScope({ issue: 6, tickets: INTERNAL }, bodyClient).slices, "and agrees with the gate's scope read");
    }
    // A pre-cutover PR's branch names its old public number while its closing
    // reference was rewritten to the internal one: merged PR #1357 on
    // codex/refactor/1322-x closes only internal #873, so it is not Task
    // #1322's and #1322's Bug #900 is delivered by #1322 itself. A fresh
    // draft on feat/7-x with no references yet is still #7's.
    {
      const stale = { number: 1357, state: "MERGED", isDraft: false, headRefName: "codex/refactor/1322-x", headRefOid: "h", baseRefName: "main", mergeCommit: { oid: "c" }, closingIssuesReferences: [ref(INTERNAL, 873)] };
      const fresh = { number: 1400, state: "OPEN", isDraft: true, headRefName: "feat/7-x", headRefOid: "f", baseRefName: "main", mergeCommit: null, closingIssuesReferences: [] };
      const tree = { 6: [{ number: 1322, state: "open", title: "slice", type: { name: "Task" }, body: "" }, { number: 7, state: "open", title: "fresh slice", type: { name: "Task" }, body: "" }], 1322: [{ number: 900, state: "open", title: "bug", type: { name: "Bug" }, body: "" }] };
      const staleClient = { fetchMain: () => "m1", worktrees: () => [], onMain: () => true, issue: () => ({ state: "open", title: "T", body: "", type: { name: "Task" } }), subIssues: (n) => tree[n] ?? [], blockedBy: () => [], effort: () => "Low", comments: () => [], checks: () => [], pulls: (n) => (n === 1322 ? [stale] : n === 7 ? [fresh] : []) };
      const staleSnap = run.takeSnapshot({ repository: "acme/widgets", issue: 6, tickets: INTERNAL }, staleClient);
      const of = (n) => staleSnap.tickets.find((t) => t.number === n);
      assert.deepEqual([of(1322).prs, of(900).deliveredBy?.ticket, of(900).deliveredBy?.pr, of(7).prs.map((p) => p.number)], [[], 1322, null, [1400]], "a PR that closes another internal ticket is not the one its old branch names; a draft with no references is found by its branch");
      const stalePlan = run.planDispatch({ record: run.readRecord(file), snapshot: staleSnap, preflights: [available("claude-cli", "claude-opus-5-5", [1322, 900, 7])], freeBytes: 100 * GB, defaults, census: () => [] });
      assert.equal(actions(stalePlan)[900], "delivered-by", "the slice's Bug is delivered by the slice");
      assert.deepEqual(run.readIssueScope({ issue: 6, tickets: INTERNAL, split: true }, staleClient).slices, run.snapshotScope(staleSnap).slices, "the gate's scope read applies the same rule");
      // The actual client applies it too.
      const { client: staleGh } = ghCalls({ repository: "acme/widgets", ticketsRepository: INTERNAL }, replies(() => [{ ...stale, author: { login: "shared" } }]));
      assert.deepEqual(staleGh.pulls(1322), [], "the client does not give the ticket a PR closing another ticket");
      assert.deepEqual(staleGh.pulls(873).map((p) => p.number), [1357], "and gives it to the ticket it closes");
      // A sibling slice's PR on its own branch still is not a Bug's own PR.
      const sibling = { ...stale, number: 1358, headRefName: "feat/7-x", closingIssuesReferences: [ref(INTERNAL, 7), ref(INTERNAL, 8)], author: { login: "shared" } };
      const { client: siblingGh } = ghCalls({ repository: "acme/widgets", ticketsRepository: INTERNAL }, replies(() => [sibling]));
      assert.deepEqual([siblingGh.pulls(7).map((p) => p.number), siblingGh.pulls(8)], [[1358], []], "a PR whose branch ticket it closes is that ticket's only");
    }
    // A pre-cutover draft with no closing references at all, on
    // codex/refactor/1389-x, was opened before internal #1389 existed, so it
    // is no internal ticket's PR and #1389 is dispatched; a draft with no
    // references yet opened after its ticket is still its branch ticket's.
    {
      const old = { number: 1413, state: "OPEN", isDraft: true, headRefName: "codex/refactor/1389-x", headRefOid: "o", baseRefName: "main", mergeCommit: null, closingIssuesReferences: [], createdAt: "2026-10-05T00:00:00Z" };
      const fresh = { number: 1401, state: "OPEN", isDraft: true, headRefName: "feat/8-x", headRefOid: "f", baseRefName: "main", mergeCommit: null, closingIssuesReferences: [], createdAt: "2026-10-21T00:00:00Z" };
      assert.equal(run.ownsPull(old, 1389, true, "2026-10-20T00:00:00Z"), false, "a no-reference PR older than its branch's ticket is not that ticket's");
      assert.equal(run.ownsPull(fresh, 8, true, "2026-10-20T00:00:00Z"), true, "a no-reference PR opened after its branch's ticket is that ticket's");
      const created = { 6: "2026-10-01T00:00:00Z", 1389: "2026-10-20T00:00:00Z", 8: "2026-10-20T00:00:00Z" };
      const tree = { 6: [{ number: 1389, state: "open", title: "slice", type: { name: "Task" }, body: "", created_at: created[1389] }, { number: 8, state: "open", title: "fresh slice", type: { name: "Task" }, body: "", created_at: created[8] }] };
      const oldClient = { fetchMain: () => "m1", worktrees: () => [], onMain: () => true, issue: (n) => ({ number: n, state: "open", title: "T", body: "", type: { name: "Task" }, created_at: created[n] }), subIssues: (n) => tree[n] ?? [], blockedBy: () => [], effort: () => "Low", comments: () => [], checks: () => [], pulls: (n) => (n === 1389 ? [old] : n === 8 ? [fresh] : []) };
      const oldSnap = run.takeSnapshot({ repository: "acme/widgets", issue: 6, tickets: INTERNAL }, oldClient);
      const of = (n) => oldSnap.tickets.find((t) => t.number === n);
      assert.deepEqual([of(1389).prs, of(8).prs.map((p) => p.number)], [[], [1401]], "the snapshot gives the old draft to no ticket and the fresh draft to its branch's");
      const oldPlan = run.planDispatch({ record: run.readRecord(file), snapshot: oldSnap, preflights: [available("claude-cli", "claude-opus-5-5", [1389, 8])], freeBytes: 100 * GB, defaults, census: () => [] });
      assert.notEqual(actions(oldPlan)[1389], "adopt-pr", "plan does not adopt the old draft for the ticket its branch number collides with");
      assert.equal(actions(oldPlan)[8], "adopt-pr", "and still adopts the fresh draft");
    }
    const splitBrief = run.brief(run.readRecord(file), splitPlanFile, 7, [], defaults);
    assert.match(splitBrief, new RegExp(`You are the writer for ${INTERNAL} ticket #7 `));
    assert.match(splitBrief, new RegExp(`checkpoint decision it publishes on your ticket in ${INTERNAL}, the PR's review thread\\.`));
  }

  // A run record shaped like the live ones from before the switch existed (no
  // tickets repository, checkpoints on origin, a revision past 100) loads,
  // plans, briefs and changes in the off position exactly as before.
  {
    const dir = path.join(tmp, "legacy-run");
    git(tmp, "init", "-q", "-b", "main", dir);
    git(dir, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "--allow-empty", "-m", "base");
    const file = path.join(dir, "run.json"), since = "2026-10-16T10:00:00.000Z", host = os.hostname();
    const legacy = {
      version: run.RECORD_VERSION, revision: 119, runId: "6d7a2c1e-1c2b-4f3a-8e5d-000000000119", repository: "acme/widgets", issue: 1900, checkout: dir,
      coordinator: { session: "local_legacy", host, harness: "claude", model: "claude-opus-5-5", effort: "high", permissionMode: "bypassPermissions", since },
      invocation: { text: "/orchestrate-issues #1900", merging: "coordinator" }, authority: run.authorityFor("coordinator"),
      writer: { model: "claude-opus-5-5", source: "claude orchestrator default" }, concurrency: { limit: 3, basis: "the smaller of 3 (reviewer slots) and 15 by memory at 4 GB per writer" },
      tickets: { 1901: { owner: null, pending: null, history: [], results: [], requests: [], checkpoints: [] } },
      diskRecoveries: [], previousCoordinators: [], title: "ORCH #1900: legacy shaped run", log: [{ time: since, event: "init", coordinator: "local_legacy", writer: "claude-opus-5-5", concurrency: 3 }],
      checkpoints: { remote: "origin", branch: "orchestrate-state/issue-1900" }, updated: since,
      checkIn: { interval: 30, cron: "10,40 * * * *", prompt: "check in", command: run.scheduleCommand(file), job: "job-1", none: null, state: "scheduled", since, expires: null }, operations: [],
    };
    fs.writeFileSync(file, JSON.stringify(legacy, null, 2));
    const pointer = run.pointerFile(dir, "acme/widgets", 1900);
    fs.mkdirSync(path.dirname(pointer), { recursive: true });
    fs.writeFileSync(pointer, JSON.stringify({ record: file, coordinator: "local_legacy", host, since }));
    const loaded = run.readRecord(file);
    assert.deepEqual([run.repositoriesOf(loaded).split, run.repositoriesOf(loaded).tickets], [false, "acme/widgets"], "a record without a tickets repository is a one-repository run");
    assert.deepEqual(run.repositoriesOf(loaded).thread(2001, 1902), { repo: "acme/widgets", number: 2001, issueUrl: "https://api.github.com/repos/acme/widgets/issues/2001" }, "its review threads are the PRs");
    const legacySnap = parentSnapshot(1900, [{ ...ticket(1901), parent: 1900, state: "closed", delivered: true }, { ...ticket(1902), parent: 1900, blockers: [{ number: 1901, state: "closed", delivered: true }] }]);
    const legacyPlanFile = write("legacy-plan.json", run.planDispatch({ record: loaded, snapshot: legacySnap, preflights: [available("claude-cli", "claude-opus-5-5", [1902])], freeBytes: 100 * GB, defaults }));
    const legacyPlan = readJsonFile(legacyPlanFile);
    assert.deepEqual(actions(legacyPlan), { 1901: "done", 1902: "dispatch" });
    assert.equal(legacyPlan.remaining[0], "A writer's review reaches a checkpoint after round 3's verified fixes and after every later round's; the coordinator decides each with review-checkpoint.mjs and publishes it on the PR.");
    const claimed = run.updateRecord(file, { expectRevision: 119, coordinator: "local_legacy" }, (r) => run.claim(r, { plan: legacyPlanFile, ticket: 1902, worktree: path.join(dir, "wt-1902"), branch: "feat/1902-thing", artifactParent: dir }));
    assert.equal(claimed.record.revision, 120);
    assert.ok(!("ticketsRepository" in claimed.record), "a change adds no tickets repository to the record");
    const legacyBrief = run.brief(run.readRecord(file), legacyPlanFile, 1902, [], defaults);
    assert.match(legacyBrief, /You are the writer for acme\/widgets ticket #1902 /);
    assert.match(legacyBrief, /The coordinator answers with a checkpoint decision it publishes on the PR\. Launch a further round/);
    // GitHub names a repository case-insensitively, so a takeover whose --repo
    // differs from the run's only in case is the same one-repository run. The
    // pointer is placed at both casings, as a case-insensitive filesystem
    // finds it, so the takeover is reached on every filesystem.
    const upper = run.pointerFile(dir, "ACME/widgets", 1900);
    if (!fs.existsSync(upper)) fs.copyFileSync(pointer, upper);
    const caseTakeover = run.initRecord({ record: path.join(dir, "run-upper.json"), checkout: dir, repository: "ACME/widgets", issue: 1900, coordinator: "local_upper", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", coordinatorMode: "bypassPermissions", invocation: "/orchestrate-issues #1900", takeover: true, observations: { sessions: { local_legacy: { state: "archived" } } } }, { defaults, freeBytes: 100 * GB, totalMemory: 64 * GB });
    assert.deepEqual([caseTakeover.action, "ticketsRepository" in caseTakeover.record], ["takeover", false], "a case-only difference in --repo takes the run over as before");
  }

  // The command line refuses with exit 1 and leaves the record unchanged.
  const cli = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", windowsHide: true });
  const refused = cli("claim", "--record", record, "--coordinator", "local_a", "--expect-revision", String(rev - 1), "--plan", p8File, "--ticket", "108", "--worktree", path.join(tmp, "wt-108"), "--branch", "fix/108-thing", "--artifact-parent", artifacts);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, new RegExp(`at revision ${rev}, not ${rev - 1}`));
  assert.equal(run.readRecord(record).revision, rev);
  const duplicate = cli("init", "--record", second, "--checkout", checkout, "--repo", "acme/widgets", "--issue", "100", "--coordinator", "local_0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b", "--harness", "claude", "--coordinator-model", "claude-opus-5-5", "--coordinator-effort", "high", "--coordinator-mode", "bypassPermissions", "--slug", "widget-feature", "--invocation", "Use orchestrate-issues for #100.", "--merging", "coordinator");
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
  assert.throws(() => mutate(rev, (r) => run.diskRecovery(r, { removed: "x", classifier: "y" })), /this record no longer coordinates the parent issue/);
  assert.equal(run.updateRecord(second, { expectRevision: 1, coordinator: "local_b" }, (r) => run.diskRecovery(r, { removed: "x", classifier: "y" })).record.revision, 2);

  // Review regressions, each in a fresh scratch checkout and record.
  const fresh = (name, issue = 300) => {
    const dir = path.join(tmp, name);
    fs.mkdirSync(path.join(dir, "artifacts"), { recursive: true });
    git(tmp, "init", "-q", "-b", "main", dir);
    git(dir, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "--allow-empty", "-m", "base");
    const file = path.join(dir, "artifacts", "run.json");
    run.initRecord({ record: file, checkout: dir, repository: "acme/widgets", issue, coordinator: "local_r", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", coordinatorMode: "bypassPermissions", invocation: `Use orchestrate-issues for #${issue}.` }, { defaults, freeBytes: 40 * GB, totalMemory: 64 * GB });
    // Each change starts from the record's current revision, since create and
    // handoff change it through their own two writes.
    const change = (fn) => run.updateRecord(file, { expectRevision: run.readRecord(file).revision, coordinator: "local_r" }, fn).output;
    return { dir, file, artifacts: path.join(dir, "artifacts"), change };
  };
  const snapshotOf = (issue, tickets) => ({ repository: "acme/widgets", issue: { number: issue, state: "open" }, originMain: "abc", tickets });
  const planOf = (f, snap, more = {}) => run.planDispatch({ record: run.readRecord(f.file), snapshot: snap, freeBytes: 100 * GB, defaults, ...more });

  // 1. A detached writer that outlives its wrapper still owns its ticket: it
  // is live, cannot be released, and no replacement is offered.
  {
    const f = fresh("r1");
    const snap = snapshotOf(300, [{ ...ticket(301), parent: 300 }]);
    const pre = [available("claude-cli", "claude-opus-5-5", [301])];
    f.change((r) => run.claim(r, { plan: write("r1-plan.json", planOf(f, snap, { preflights: pre })), ticket: 301, worktree: path.join(f.dir, "wt-301"), branch: "fix/301-thing", artifactParent: f.artifacts }));
    const stop = path.join(f.dir, "stop-301");
    const owner = f.change((r) => run.launch(r, { ticket: 301, executable: process.execPath, args: [standIn, "-p", "--model", "claude-opus-5-5", "--effort", "medium", "--permission-mode", "bypassPermissions", "--stop", stop], prompt })).owner;
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
    const takeover = () => run.initRecord({ record: path.join(f.artifacts, "c.json"), checkout: f.dir, repository: "acme/widgets", issue: 300, coordinator: "local_c", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", coordinatorMode: "bypassPermissions", invocation: "Use orchestrate-issues for #300.", takeover: true, observations: { sessions: { local_r: { state: "archived" } } } }, { defaults, freeBytes: 40 * GB, totalMemory: 64 * GB });
    fs.writeFileSync(pointerLock, JSON.stringify({ token: "b", identity: processIdentity(process.pid) }));
    assert.throws(takeover, new RegExp(`Process ${process.pid} holds .*pointer|Process ${process.pid} holds`), "a takeover in progress blocks another");
    fs.unlinkSync(pointerLock);
    fs.writeFileSync(`${f.file}.lock`, JSON.stringify({ token: "m", identity: processIdentity(process.pid) }));
    assert.throws(takeover, /holds/, "a change in progress to the previous record blocks the copy");
    fs.unlinkSync(`${f.file}.lock`);
    assert.ok(!fs.existsSync(path.join(f.artifacts, "c.json")), "a refused takeover writes no record");
    assert.equal(takeover().action, "takeover");
    assert.throws(() => run.initRecord({ record: path.join(f.artifacts, "d.json"), checkout: f.dir, repository: "acme/widgets", issue: 300, coordinator: "local_d", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", coordinatorMode: "bypassPermissions", invocation: "Use orchestrate-issues for #300.", takeover: true, observations: { sessions: { local_r: { state: "archived" } } } }, { defaults, freeBytes: 40 * GB }), /previous coordinator local_c is unknown/, "a stale view of the first coordinator cannot replace the second");
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
    const p = run.planDispatch({ record: held, snapshot: snap, preflights: [available("claude-cli", "claude-opus-5-5", [502])], observations: { sessions: { local_w501: { state: "running" } } }, freeBytes: 100 * GB, defaults });
    assert.deepEqual([actions(p)[501], actions(p)[502], p.concurrency.active], ["decision-needed", "wait-capacity", 1]);
    assert.match(p.tickets.find((t) => t.number === 501).reason, /gained sub-issues while writer local_w501 \(live\)/);
  }

  // 6. The snapshot reads sub-issues to GitHub's nesting limit, and marks a
  // container beyond it instead of dispatching it.
  {
    const chain = (from, to) => Object.fromEntries(Array.from({ length: to - from }, (_, i) => [from + i, [{ number: from + i + 1, state: "open", title: `n${from + i + 1}` }]]));
    const nested = (links) => ({ ...client, worktrees: () => [], pulls: () => [], blockedBy: () => [], subIssues: (n) => links[n] ?? [] });
    const deep = run.takeSnapshot({ repository: "acme/widgets", issue: 600 }, nested(chain(600, 604)));
    assert.deepEqual(deep.tickets.map((t) => [t.number, t.container]), [[601, true], [602, true], [603, true], [604, false]], "a leaf four levels down is a ticket");
    const tooDeep = run.takeSnapshot({ repository: "acme/widgets", issue: 700 }, nested(chain(700, 700 + run.MAX_SUB_ISSUE_DEPTH + 1)));
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
    const blocked = run.planDispatch({ record: limited(1), snapshot: snapshotOf(300, [{ ...ticket(701), parent: 300, prs: [pr(701)], blockers: [{ number: 99, state: "open", delivered: false }] }, { ...ticket(702), parent: 300, prs: [pr(702)], blockers: [{ number: 99, state: "open", delivered: false }] }]), preflights: pre, freeBytes: 100 * GB, defaults });
    for (const n of [701, 702]) {
      const entry = blocked.tickets.find((t) => t.number === n);
      assert.equal(entry.continueWith, undefined, `#${n} with an undelivered blocker has no continuation`);
      assert.match(entry.continueBlocked, /waiting for #99 \(open\)/);
    }
    const bounded = run.planDispatch({ record: limited(1), snapshot: snapshotOf(300, [{ ...ticket(701), parent: 300, prs: [pr(701)] }, { ...ticket(702), parent: 300, worktrees: [{ path: path.join(f.dir, "wt-702"), branch: "fix/702-thing", head: "h" }] }]), preflights: pre, freeBytes: 100 * GB, defaults });
    for (const entry of [701, 702].map((n) => bounded.tickets.find((t) => t.number === n))) {
      assert.equal(entry.continueWith, undefined, `#${entry.number}: the other ticket's writer may still run`);
      assert.match(entry.continueBlocked, /1 other writers, held or possibly running on existing work, fill the limit of 1/);
    }
    // Once the record shows #702's writer released after an observed exit,
    // #702 no longer reserves a place. #701 may then continue, its own claim
    // standing for its writer's end; #702 may not, since #701's writer may run.
    const released = { ...limited(1), tickets: { 702: { owner: null, pending: null, history: [{ released: "session archived" }], results: [] } } };
    const freed = run.planDispatch({ record: released, snapshot: snapshotOf(300, [{ ...ticket(701), parent: 300, prs: [pr(701)] }, { ...ticket(702), parent: 300, worktrees: [{ path: path.join(f.dir, "wt-702"), branch: "fix/702-thing", head: "h" }] }]), preflights: pre, freeBytes: 100 * GB, defaults });
    assert.equal(freed.concurrency.active, 1, "the released ticket's existing work reserves nothing");
    assert.equal(freed.tickets.find((t) => t.number === 701).continueWith.route, "claude-cli");
    assert.match(freed.tickets.find((t) => t.number === 702).continueBlocked, /1 other writers, .* fill the limit of 1/, "the ended writer's ticket waits for the other ticket's possibly running writer");
    const planFile = write("r7-plan.json", run.planDispatch({ record: run.readRecord(f.file), snapshot: snapshotOf(300, [{ ...ticket(701), parent: 300, prs: [pr(701)] }, { ...ticket(703), parent: 300, prs: [pr(703)] }]), preflights: pre, freeBytes: 100 * GB, defaults }));
    f.change((r) => run.claim(r, { plan: planFile, ticket: 701, worktree: path.join(f.dir, "wt-701"), branch: "fix/701-thing", artifactParent: f.artifacts, operation: "continue", evidence: "archived" }));
    const after = run.planDispatch({ record: { ...run.readRecord(f.file), concurrency: { limit: 1, basis: "test" } }, snapshot: snapshotOf(300, [{ ...ticket(701), parent: 300, prs: [pr(701)] }, { ...ticket(703), parent: 300, prs: [pr(703)] }]), preflights: pre, freeBytes: 100 * GB, defaults });
    assert.match(after.tickets.find((t) => t.number === 703).continueBlocked, /fill the limit of 1/, "a claimed continuation holds its place");
  }

  // Round 2 (undirected), finding 1: a plan admits work only for the run it
  // was made from, so a takeover cannot revive the earlier coordinator's plan.
  {
    const f = fresh("r11");
    const snap = snapshotOf(300, [{ ...ticket(1201), parent: 300 }, { ...ticket(1202), parent: 300 }]);
    const pre = [available("claude-cli", "claude-opus-5-5", [1201, 1202])];
    const oldPlan = write("r11-old.json", planOf(f, snap, { preflights: pre }));
    const second = path.join(f.artifacts, "b.json");
    run.initRecord({ record: second, checkout: f.dir, repository: "acme/widgets", issue: 300, coordinator: "local_b", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", coordinatorMode: "bypassPermissions", invocation: "Use orchestrate-issues for #300.", concurrency: 1, takeover: true, observations: { sessions: { local_r: { state: "archived" } } } }, { defaults, freeBytes: 40 * GB, totalMemory: 64 * GB });
    assert.equal(run.readRecord(second).revision, 1, "the new run also starts at revision 1");
    assert.throws(() => run.updateRecord(second, { expectRevision: 1, coordinator: "local_b" }, (r) => run.claim(r, { plan: oldPlan, ticket: 1202, worktree: path.join(f.dir, "wt-1202"), branch: "fix/1202-thing", artifactParent: f.artifacts })), /made for another run/);
  }

  // Round 2 (undirected), finding 2: a launch settled by a census that found
  // no process counts as an ended writer, so its work can be continued.
  {
    const f = fresh("r12");
    const pr = { number: 1301, state: "OPEN", isDraft: true, branch: "fix/1301-thing", head: "h", rounds: 1 };
    const snapNew = snapshotOf(300, [{ ...ticket(1301), parent: 300 }]);
    const pre = [available("claude-cli", "claude-opus-5-5", [1301])];
    f.change((r) => run.claim(r, { plan: write("r12-plan.json", planOf(f, snapNew, { preflights: pre })), ticket: 1301, worktree: path.join(f.dir, "wt-1301"), branch: "fix/1301-thing", artifactParent: f.artifacts }));
    fs.mkdirSync(run.launchDirOf(run.readRecord(f.file).tickets[1301].pending, 1301), { recursive: true });
    assert.equal(f.change((r) => run.reconcile(r, { ticket: 1301, census: () => [] })).outcome, "not running");
    const withPr = snapshotOf(300, [{ ...ticket(1301), parent: 300, prs: [pr] }]);
    const p = run.planDispatch({ record: { ...run.readRecord(f.file), concurrency: { limit: 1, basis: "test" } }, snapshot: withPr, preflights: pre, freeBytes: 100 * GB, defaults });
    assert.equal(p.concurrency.active, 0, "a census-settled writer reserves nothing");
    assert.equal(p.tickets[0].continueWith.route, "claude-cli");
  }

  // Round 2 (undirected), finding 3: low disk at init does not fix the run at
  // zero writers; each plan admits writers against the disk free then.
  {
    const dir = path.join(tmp, "r13");
    fs.mkdirSync(path.join(dir, "artifacts"), { recursive: true });
    git(tmp, "init", "-q", "-b", "main", dir);
    git(dir, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "--allow-empty", "-m", "base");
    const file = path.join(dir, "artifacts", "run.json");
    const made = run.initRecord({ record: file, checkout: dir, repository: "acme/widgets", issue: 300, coordinator: "local_r", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", coordinatorMode: "bypassPermissions", invocation: "x" }, { defaults, freeBytes: 5 * GB, totalMemory: 64 * GB });
    assert.deepEqual([made.record.concurrency.limit, made.diskAdmits], [3, 0]);
    const snap = snapshotOf(300, [{ ...ticket(1401), parent: 300 }]);
    const pre = [available("claude-cli", "claude-opus-5-5", [1401])];
    const low = run.planDispatch({ record: run.readRecord(file), snapshot: snap, preflights: pre, freeBytes: 5 * GB, defaults });
    assert.match(low.tickets[0].reason, /free disk does not admit another writer/);
    assert.equal(run.planDispatch({ record: run.readRecord(file), snapshot: snap, preflights: pre, freeBytes: 40 * GB, defaults }).tickets[0].action, "dispatch", "after disk recovery the next plan dispatches");
  }

  // Round 2 (undirected), unverified concern: sub-issues of a container whose
  // writer is still held wait for it, even with capacity to spare.
  {
    const f = fresh("r14");
    const held = { ...run.readRecord(f.file), concurrency: { limit: 3, basis: "test" }, tickets: { 1501: { owner: { route: "claude-desktop", model: "claude-opus-5-5", effort: "medium", worktree: "w", handle: { kind: "session", id: "local_w1501" } }, pending: null, history: [], results: [] } } };
    const snap = snapshotOf(300, [{ ...ticket(1501), parent: 300, container: true }, { ...ticket(1502), parent: 1501 }, { ...ticket(1503), parent: 1501, prs: [{ number: 1601, state: "OPEN", isDraft: true, branch: "fix/1503-thing", head: "h", rounds: 0 }] }, { ...ticket(1504), parent: 300 }]);
    const p = run.planDispatch({ record: held, snapshot: snap, preflights: [available("claude-cli", "claude-opus-5-5", [1502, 1503, 1504])], observations: { sessions: { local_w1501: { state: "running" } } }, freeBytes: 100 * GB, defaults });
    assert.deepEqual([1501, 1502, 1503, 1504].map((n) => actions(p)[n]), ["decision-needed", "wait-dependency", "adopt-pr", "dispatch"]);
    assert.match(p.tickets.find((t) => t.number === 1502).reason, /parent #1501 is still held/);
    assert.match(p.tickets.find((t) => t.number === 1503).continueBlocked, /parent #1501 is still held/);
  }

  // Round 3 (undirected), findings 2 to 4: existing work found on GitHub but
  // not settled in the record (a ready PR, or a ticket that became a
  // container) keeps its place and holds what depends on it until its writer
  // is adopted and settled; an adopted writer is verified against the
  // ticket's Effort, not its own.
  {
    const f = fresh("r18");
    const pre = [available("claude-cli", "claude-opus-5-5", [2201, 2202, 2204]), { route: "claude-cli", model: "claude-opus-5-5", verdicts: [{ ticket: 2203, effort: "high", verdict: "available" }] }];
    const snap = snapshotOf(300, [
      { ...ticket(2201), parent: 300, prs: [{ number: 2301, state: "OPEN", isDraft: false, branch: "fix/2201-thing", head: "h", rounds: 2 }] },
      { ...ticket(2202), parent: 300 },
    ]);
    const one = (rec) => ({ ...rec, concurrency: { limit: 1, basis: "test" } });
    const p = run.planDispatch({ record: one(run.readRecord(f.file)), snapshot: snap, preflights: pre, freeBytes: 100 * GB, defaults });
    assert.deepEqual([actions(p)[2201], actions(p)[2202], p.concurrency.active], ["await-maintainer", "wait-capacity", 1], "a ready PR's unsettled writer keeps its place");
    assert.match(p.tickets.find((t) => t.number === 2201).reason, /may still be running, so find it and record it with adopt/);
    f.change((r) => run.adopt(r, { plan: write("r18-plan.json", p), ticket: 2201, handleKind: "session", handle: "local_ready", route: "claude-desktop", model: "claude-opus-5-5", effort: "medium", worktree: path.join(f.dir, "wt-2201") }));
    f.change((r) => run.release(r, { ticket: 2201, observations: { sessions: { local_ready: { state: "archived" } } } }));
    const after = run.planDispatch({ record: one(run.readRecord(f.file)), snapshot: snap, preflights: pre, freeBytes: 100 * GB, defaults });
    assert.deepEqual([actions(after)[2201], actions(after)[2202]], ["await-maintainer", "dispatch"], "once its writer is settled the place is free");

    const nested = snapshotOf(300, [
      { ...ticket(2203), parent: 300, effort: "High", container: true, prs: [{ number: 2303, state: "OPEN", isDraft: true, branch: "fix/2203-thing", head: "h", rounds: 1 }] },
      { ...ticket(2204), parent: 2203 },
    ]);
    const q = run.planDispatch({ record: { ...run.readRecord(f.file), concurrency: { limit: 3, basis: "test" } }, snapshot: nested, preflights: pre, freeBytes: 100 * GB, defaults });
    assert.deepEqual([actions(q)[2203], actions(q)[2204]], ["adopt-pr", "wait-dependency"], "a container's unrecorded writer holds its sub-issues");
    assert.match(q.tickets.find((t) => t.number === 2203).continueBlocked, /now a container/);
    f.change((r) => run.adopt(r, { plan: write("r18-plan2.json", q), ticket: 2203, handleKind: "session", handle: "local_low", route: "claude-desktop", model: "claude-opus-5-5", effort: "low", worktree: path.join(f.dir, "wt-2203") }));
    assert.equal(run.readRecord(f.file).tickets[2203].owner.requestedEffort, "high");
    // The preflight judges the writer's observed Low against the ticket's High.
    const { preflight } = await import("../../../scripts/writer-route-preflight.mjs");
    const confirmation = write("r18-confirm.json", preflight({ route: "claude-desktop", model: "claude-opus-5-5", tickets: [{ number: 2203, effort: "high", observed: { model: "claude-opus-5-5", effort: "low" } }] }));
    f.change((r) => run.verify(r, { ticket: 2203, preflight: confirmation }));
    assert.match(run.readRecord(f.file).tickets[2203].owner.mismatch, /runs claude-opus-5-5 at low, not claude-opus-5-5 at high/);
  }

  // Round 4: a merged and closed ticket whose worktree remains here and
  // whose writer the record has not settled keeps that writer's place, and
  // the writer can be adopted and released; without a worktree here, a
  // closed ticket reserves nothing.
  {
    const f = fresh("r19");
    const wt = path.join(f.dir, "wt-2401");
    const merged = { number: 2501, state: "MERGED", isDraft: false, branch: "fix/2401-thing", head: "h", mergeCommit: "m" };
    const snap = (worktrees) => snapshotOf(300, [{ ...ticket(2401), parent: 300, state: "closed", delivered: true, prs: [merged], worktrees }, { ...ticket(2402), parent: 300 }]);
    const pre = [available("claude-cli", "claude-opus-5-5", [2402])];
    const one = () => ({ ...run.readRecord(f.file), concurrency: { limit: 1, basis: "test" } });
    const lingering = run.planDispatch({ record: one(), snapshot: snap([{ path: wt, branch: "fix/2401-thing", head: "h" }]), preflights: pre, freeBytes: 100 * GB, defaults });
    assert.deepEqual([actions(lingering)[2401], actions(lingering)[2402], lingering.concurrency.active], ["done", "wait-capacity", 1], "a merge does not show the writer ended");
    assert.match(lingering.tickets.find((t) => t.number === 2401).reason, /its writer is not settled in the record, so it keeps a place/);
    const planFile = write("r19-plan.json", lingering);
    assert.throws(() => f.change((r) => run.adopt(r, { plan: planFile, ticket: 2401, handleKind: "session", handle: "local_late", route: "claude-desktop", model: "claude-opus-5-5", effort: "medium", worktree: path.join(f.dir, "elsewhere") })), /one the plan found for #2401/);
    f.change((r) => run.adopt(r, { plan: planFile, ticket: 2401, handleKind: "session", handle: "local_late", route: "claude-desktop", model: "claude-opus-5-5", effort: "medium", worktree: wt }));
    assert.equal(actions(run.planDispatch({ record: one(), snapshot: snap([{ path: wt, branch: "fix/2401-thing", head: "h" }]), preflights: pre, observations: { sessions: { local_late: { state: "running" } } }, freeBytes: 100 * GB, defaults }))[2402], "wait-capacity", "the adopted writer still holds its place while it runs");
    f.change((r) => run.release(r, { ticket: 2401, observations: { sessions: { local_late: { state: "archived" } } } }));
    assert.equal(actions(run.planDispatch({ record: one(), snapshot: snap([{ path: wt, branch: "fix/2401-thing", head: "h" }]), preflights: pre, freeBytes: 100 * GB, defaults }))[2402], "dispatch", "once released, the place is free");
    const elsewhereRecord = fresh("r19b");
    const noTree = run.planDispatch({ record: { ...run.readRecord(elsewhereRecord.file), concurrency: { limit: 1, basis: "test" } }, snapshot: snap([]), preflights: pre, freeBytes: 100 * GB, defaults });
    assert.deepEqual([noTree.concurrency.active, actions(noTree)[2402]], [0, "dispatch"], "a closed ticket with no worktree here reserves nothing");
    const doneFile = write("r19-done.json", noTree);
    assert.throws(() => elsewhereRecord.change((r) => run.adopt(r, { plan: doneFile, ticket: 2401, handleKind: "session", handle: "x", route: "claude-desktop", model: "claude-opus-5-5", effort: "medium", worktree: wt })), /no unsettled writer to adopt/);
  }

  // Round 3 (corrections), finding 1: two answers in flight each quote the
  // question they answer.
  {
    const f = fresh("r15");
    const snap = snapshotOf(300, [{ ...ticket(1701), parent: 300, prs: [{ number: 1801, state: "OPEN", isDraft: true, branch: "fix/1701-thing", head: "h", rounds: 3 }] }]);
    f.change((r) => run.adopt(r, { plan: write("r15-plan.json", planOf(f, snap)), ticket: 1701, handleKind: "session", handle: "local_w", route: "claude-desktop", model: "claude-opus-5-5", effort: "medium", worktree: path.join(f.dir, "wt") }));
    const round4 = f.change((r) => run.request(r, { ticket: 1701, text: "May I start review round 4?", source: "transcript" })).id;
    const scope = f.change((r) => run.request(r, { ticket: 1701, text: "May I expand the implementation scope?", source: "transcript" })).id;
    const yes = f.change((r) => run.answer(r, { ticket: 1701, request: round4, text: "yes" })).message;
    const no = f.change((r) => run.answer(r, { ticket: 1701, request: scope, text: "no" })).message;
    assert.match(yes, /which asked: "May I start review round 4\?"[^\n]*:\nyes/);
    assert.match(no, /which asked: "May I expand the implementation scope\?"[^\n]*:\nno/);
  }

  // Round 3 (corrections), finding 4: a continuation that never started keeps
  // its claim's evidence that the previous writer ended, so neither holds a place.
  {
    const f = fresh("r17");
    const withPr = snapshotOf(300, [{ ...ticket(2001), parent: 300, prs: [{ number: 2101, state: "OPEN", isDraft: true, branch: "fix/2001-thing", head: "h", rounds: 1 }] }, { ...ticket(2002), parent: 300 }]);
    const pre = [available("claude-cli", "claude-opus-5-5", [2001, 2002])];
    f.change((r) => run.claim(r, { plan: write("r17-plan.json", planOf(f, withPr, { preflights: pre })), ticket: 2001, worktree: path.join(f.dir, "wt-2001"), branch: "fix/2001-thing", artifactParent: f.artifacts, operation: "continue", evidence: "the previous writer's session is archived" }));
    assert.equal(f.change((r) => run.reconcile(r, { ticket: 2001 })).outcome, "not started");
    const after = run.planDispatch({ record: { ...run.readRecord(f.file), concurrency: { limit: 1, basis: "test" } }, snapshot: withPr, preflights: pre, freeBytes: 100 * GB, defaults });
    assert.equal(after.concurrency.active, 0, "neither the never-started continuation nor the ended writer holds a place");
    assert.equal(actions(after)[2002], "dispatch");
    assert.equal(run.readRecord(f.file).tickets[2001].history.at(-1).priorEnded, "the previous writer's session is archived");
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
    assert.throws(() => f.change((r) => run.deliver(r, { ticket: 1001, retry: true })), /already has its assignment/);
    const { id } = f.change((r) => run.request(r, { ticket: 1001, text: "may I widen the PR?", source: "transcript" }));
    assert.equal(actions(planOf(f, snap, { observations: idle }))[1001], "answer-request");
    f.change((r) => run.release(r, { ticket: 1001, observations: { sessions: { local_old: { state: "archived" } } } }));
    assert.match(run.readRecord(f.file).tickets[1001].requests[0].closed.reason, /writer was released/);
    assert.throws(() => f.change((r) => run.answer(r, { ticket: 1001, request: id, text: "yes" })), /closed: its writer was released/);
    f.change((r) => run.adopt(r, { plan: write("r10-plan2.json", planOf(f, snap)), ticket: 1001, handleKind: "session", handle: "local_new", route: "claude-desktop", model: "claude-opus-5-5", effort: "medium", worktree: path.join(f.dir, "wt") }));
    assert.equal(actions(planOf(f, snap, { observations: { sessions: { local_new: { state: "idle" } } } }))[1001], "collect-report", "a new writer does not inherit its predecessor's question");
  }

  // History: a sub-issue closed as completed before the run started, with no
  // open or merged PR of its own, is done as history; so are the closed Bugs a
  // closed umbrella carries and a closed Bug directly under the parent. One
  // closed during the run, or closed as not planned, is still surfaced.
  {
    const f = fresh("closed-history");
    const before = "2020-01-01T00:00:00Z", during = new Date(Date.now() + 3600000).toISOString();
    const closed = (number, more) => ({ ...ticket(number), parent: 300, state: "closed", stateReason: "completed", closedAt: before, ...more });
    const snap = snapshotOf(300, [
      closed(1101, { type: "Task" }),
      closed(1102, { type: "Bug", parent: 1101, deliveredBy: { ticket: 1101, via: "sub-issue", pr: null, merged: false } }),
      closed(1103, { type: "Bug" }),
      closed(1104, { type: "Bug", closedAt: during }),
      closed(1105, { type: "Bug", stateReason: "not_planned" }),
      closed(1106, { type: "Bug", prs: [{ number: 1199, state: "MERGED", branch: "fix/1106-thing", mergeCommit: "off-main" }] }),
    ]);
    const p = planOf(f, snap);
    assert.deepEqual(actions(p), { 1101: "done", 1102: "done", 1103: "done", 1104: "decision-needed", 1105: "decision-needed", 1106: "decision-needed" });
    for (const n of [1101, 1102, 1103]) assert.match(p.tickets.find((t) => t.number === n).reason, /closed before the run, delivered outside it/);
    assert.match(p.tickets.find((t) => t.number === 1105).reason, /closed as not planned/);
    assert.equal(p.concurrency.active, 0, "history holds no writer place");
    // A ticket waiting on history is admitted; one waiting on a ticket closed
    // during the run still waits.
    const waiting = (blocker) => snapshotOf(300, [...snap.tickets, { ...ticket(1107), parent: 300, blockers: [{ number: blocker, state: "closed", delivered: false }] }]);
    const pre = [available("claude-cli", "claude-opus-5-5", [1107])];
    assert.equal(actions(planOf(f, waiting(1103), { preflights: pre }))[1107], "dispatch", "history counts as a delivered blocker");
    assert.equal(actions(planOf(f, waiting(1104), { preflights: pre }))[1107], "wait-dependency", "a blocker closed during the run without its deliverable still holds");
    // A history Bug's own unmet blocker does not hold its open deliverer.
    const umbrella = snapshotOf(300, [
      { ...ticket(1108), parent: 300, type: "Task" },
      closed(1109, { type: "Bug", parent: 1108, deliveredBy: { ticket: 1108, via: "sub-issue", pr: null, merged: false }, blockers: [{ number: 900, state: "closed", delivered: false }] }),
    ]);
    assert.deepEqual(actions(planOf(f, umbrella, { preflights: [available("claude-cli", "claude-opus-5-5", [1108])] })), { 1108: "dispatch", 1109: "done" });
    // GitHub reports closed_at in whole seconds: a closure in the start's own
    // second may follow the start, so it is not history.
    const record = run.readRecord(f.file), start = run.runStartedAt(record);
    const second = new Date(Math.floor(Date.parse(start) / 1000) * 1000).toISOString().replace(".000Z", "Z");
    assert.equal(run.closedBeforeRun(record, closed(1110, { closedAt: second })), false, "a closure in the start's second");
    assert.equal(run.closedBeforeRun(record, closed(1110, { closedAt: new Date(Date.parse(second) - 1000).toISOString() })), true, "a closure in the second before");
    // A reopen and close during the run changes the scope the final gate
    // compares, since the closure decides whether the ticket is history.
    const reclosed = snapshotOf(300, snap.tickets.map((t) => (t.number === 1103 ? { ...t, closedAt: during } : t)));
    assert.notDeepEqual(run.snapshotScope(reclosed).slices, run.snapshotScope(snap).slices);
    // The walk keeps what the rule reads from GitHub.
    const client = { subIssues: (n) => (n === 300 ? [{ number: 1103, title: "t", state: "closed", state_reason: "completed", closed_at: before, type: { name: "Bug" }, body: "" }] : []), pulls: () => [] };
    const [walked] = run.walkSubIssues(300, client);
    assert.deepEqual([walked.stateReason, walked.closedAt], ["completed", before]);
  }

  // Tickets filed during the run. The writer's report names them, a writer
  // claimed before the brief asked for them still reports, each ticket is
  // recorded once GitHub confirms it and triaged, the plan reports one with
  // no outcome, a ticket completing a slice's fix waits for that slice and is
  // delivered by its PR, and a ticket the parent needs is admitted like any
  // sub-issue once attached under the parent behind its chain's tail.
  {
    const f = fresh("filed");
    const pre = [available("claude-cli", "claude-opus-5-5", [3001, 3003])];
    assert.ok(run.REPORT_FIELDS.includes("filed"), "the report has a field for filed tickets");
    // A claim records the report fields its brief asks for.
    const claimed = f.change((r) => run.claim(r, { plan: write("filed-plan.json", planOf(f, snapshotOf(300, [{ ...ticket(3001), parent: 300 }]), { preflights: pre })), ticket: 3001, worktree: path.join(f.dir, "wt-3001"), branch: "fix/3001-thing", artifactParent: f.artifacts }));
    assert.deepEqual(claimed.reportFields, run.REPORT_FIELDS, "the claim keeps the fields its brief asks for");
    f.change((r) => { const t = r.tickets[3001]; t.owner = { ...t.pending, handle: { kind: "session", id: "local_w3001" }, since: new Date().toISOString() }; t.pending = null; });
    const base = { model: "claude-opus-5-5", effort: "medium", permissionMode: "bypassPermissions", pr: 3901, reviewedHead: "abc1234", rounds: { codex: 1 }, findings: "None", verification: "tests", ci: "test-suite passed", next: "none" };
    assert.throws(() => f.change((r) => run.result(r, { ticket: 3001, report: write("filed-r0.json", base) })), /lacks filed/, "a writer briefed for it reports its filed tickets");
    const named = f.change((r) => run.result(r, { ticket: 3001, report: write("filed-r1.json", { ...base, filed: [{ number: 3002, reading: "completes the fix" }] }) }));
    assert.match(named.filed, /#3002 as filed; confirm each on GitHub/, "the report's list is a hint to confirm");
    // A writer adopted with its work, briefed before the field existed,
    // reports without it; its filed tickets are read from GitHub.
    f.change((r) => { r.tickets[3009] = { owner: { route: "claude-cli", model: "claude-opus-5-5", effort: "medium", handle: { kind: "session", id: "local_old" }, adopted: { pr: null, rounds: 0 }, since: new Date().toISOString() }, pending: null, history: [], results: [] }; });
    assert.match(f.change((r) => run.result(r, { ticket: 3009, report: write("filed-r2.json", { ...base, pr: 3909 }) })).filed, /read what #3009's writer filed from GitHub/, "an older writer's report still records");
    assert.equal(run.readRecord(f.file).tickets[3009].results.length, 1);
    // The field is None or a list of entries; prose is refused, since a
    // reading names the slice and the parent too.
    assert.throws(() => f.change((r) => run.result(r, { ticket: 3001, report: write("filed-r3.json", { ...base, filed: "#3002: removes the guard in #3001, needed by parent #300" }) })), /filed field must be "None" or a list of entries/);
    assert.throws(() => f.change((r) => run.result(r, { ticket: 3001, report: write("filed-r4.json", { ...base, filed: [{ reading: "no number" }] }) })), /filed field must be "None" or a list/);
    f.change((r) => run.result(r, { ticket: 3001, report: write("filed-r5.json", { ...base, filed: "None." }) }));
    assert.deepEqual(run.filedNumbers([3002, { number: 3003, reading: "x" }, 3002]), [3002, 3003]);
    assert.deepEqual(run.filedNumbers("None"), []);
    // A ticket a report names and the record lacks plans as confirm-filed;
    // once recorded, as triage-filed until it has an outcome.
    const filedOf = (p) => Object.fromEntries(p.filed.map((x) => [x.number, x.action]));
    assert.deepEqual(filedOf(planOf(f, snapshotOf(300, []))), { 3002: "confirm-filed" });
    assert.throws(() => f.change((r) => run.filed(r, { filed: 3002, ticket: 3001, pr: 3901 })), /--source must say where GitHub confirms/);
    assert.throws(() => f.change((r) => run.filed(r, { filed: 300, source: "x" })), /is the parent issue/);
    f.change((r) => run.filed(r, { filed: 3002, ticket: 3001, pr: 3901, source: "PR #3901's report, Notes for reviewers", reading: "completes the fix" }));
    assert.throws(() => f.change((r) => run.filed(r, { filed: 3002, source: "again" })), /already recorded as filed/);
    let p = planOf(f, snapshotOf(300, []));
    assert.deepEqual(filedOf(p), { 3002: "triage-filed" }, "a recorded ticket with no outcome is an action");
    assert.ok(p.remaining.some((line) => /#3002 \(triage-filed\)/.test(line)), "the remaining work names it");
    // The parent cannot be complete while a filed ticket lacks an outcome,
    // even on a verification that otherwise holds.
    const verified = { ...run.readRecord(f.file), verifications: [{ verdict: "complete", mainSha: "abc", criteria: [], acceptanceSha256: null, tickets: [3001] }] };
    const doneSnap = { ...snapshotOf(300, [{ ...ticket(3001), parent: 300, state: "closed", delivered: true }]), issue: { number: 300, state: "open", criteria: [], acceptanceSha256: null } };
    assert.deepEqual(run.verificationGaps(verified, doneSnap), ["#3002 was filed during the run and has no triage outcome; triage it with issue-run.mjs triage"]);
    // Triage: each outcome takes what it needs.
    assert.throws(() => f.change((r) => run.triage(r, { filed: 3002, outcome: "later" })), /--outcome must be completes, needed, separate, maintainer/);
    assert.throws(() => f.change((r) => run.triage(r, { filed: 3002, outcome: "completes", reason: "same root cause" })), /--slice must name the slice/);
    assert.throws(() => f.change((r) => run.triage(r, { filed: 3004, outcome: "separate", reason: "x" })), /not recorded as filed/);
    f.change((r) => run.triage(r, { filed: 3002, outcome: "completes", slice: 3001, reason: "it replaces the guard PR #3901 adds" }));
    assert.deepEqual(run.verificationGaps({ ...run.readRecord(f.file), verifications: verified.verifications }, doneSnap), [], "a triaged ticket leaves the verification holding");
    assert.deepEqual(filedOf(planOf(f, snapshotOf(300, []))), {});
    assert.deepEqual(run.completingTickets(run.readRecord(f.file), 3001).map((e) => e.number), [3002]);
    // Attached under the parent while #3001's PR is open and does not close
    // it, the completing ticket waits for #3001 and is never dispatched.
    const slicePr = (closes) => ({ number: 3901, state: "OPEN", isDraft: true, branch: "fix/3001-thing", head: "h", rounds: 1, closes });
    p = planOf(f, snapshotOf(300, [{ ...ticket(3001), parent: 300, prs: [slicePr([3001])] }, { ...ticket(3002), parent: 300 }]), { preflights: [available("claude-cli", "claude-opus-5-5", [3002])], observations: { sessions: { local_w3001: { state: "running" } } } });
    assert.equal(actions(p)[3002], "wait-dependency");
    assert.match(p.tickets.find((t) => t.number === 3002).reason, /completes #3001's fix .*makes the proper fix in its PR with a closing reference to #3002/);
    // Once #3001's PR closes it, the delivered-by rule counts it delivered by
    // that slice, read through the snapshot's own walk.
    const issues = { 300: { title: "parent", state: "open", body: "## Acceptance criteria\n\n- [ ] done\n" }, 3001: { title: "slice", state: "open", type: { name: "Bug" }, body: "" }, 3002: { title: "filed", state: "open", type: { name: "Bug" }, body: "" } };
    const prNode = { number: 3901, state: "OPEN", isDraft: true, headRefName: "fix/3001-thing", headRefOid: "h", baseRefName: "main", closingIssuesReferences: [{ number: 3001 }, { number: 3002 }], mergeCommit: null };
    const client = { fetchMain: () => "abc", worktrees: () => [], issue: (n) => issues[n], subIssues: (n) => (n === 300 ? [3001, 3002].map((k) => ({ number: k, ...issues[k] })) : []), pulls: (n) => ([3001, 3002].includes(n) ? [prNode] : []), effort: () => "Medium", blockedBy: () => [], comments: () => [], checks: () => [], onMain: () => false };
    const walked = run.takeSnapshot({ repository: "acme/widgets", issue: 300 }, client);
    assert.deepEqual(walked.tickets.find((t) => t.number === 3002).deliveredBy, { ticket: 3001, via: "pr", pr: 3901, merged: false });
    p = planOf(f, walked, { observations: { sessions: { local_w3001: { state: "running" } } } });
    assert.equal(actions(p)[3002], "delivered-by", "an open slice's PR delivers the completing ticket");
    assert.deepEqual(p.tickets.find((t) => t.number === 3001).delivers, [3002]);
    // A ticket the parent needs, attached mid-run behind the tail of its file
    // set's chain, waits for that tail and is admitted once it is delivered.
    f.change((r) => run.filed(r, { filed: 3003, ticket: 3001, pr: 3901, source: "ticket #3003's provenance line" }));
    f.change((r) => run.triage(r, { filed: 3003, outcome: "needed", under: 300, reason: "a defect in behavior #3001 changed" }));
    const needed = (delivered) => snapshotOf(300, [{ ...ticket(3001), parent: 300, state: delivered ? "closed" : "open", delivered }, { ...ticket(3003), parent: 300, blockers: [{ number: 3001, state: delivered ? "closed" : "open", delivered }] }]);
    const freed = (r) => ({ ...r, tickets: { ...r.tickets, 3001: { ...r.tickets[3001], owner: null } } });
    assert.equal(actions(run.planDispatch({ record: freed(run.readRecord(f.file)), snapshot: needed(false), preflights: pre, freeBytes: 100 * GB, defaults }))[3003], "wait-dependency", "it waits behind the chain's tail");
    assert.equal(actions(run.planDispatch({ record: freed(run.readRecord(f.file)), snapshot: needed(true), preflights: pre, freeBytes: 100 * GB, defaults }))[3003], "dispatch", "a ticket attached mid-run is admitted once its blocker is delivered");
    // A ticket raised with the maintainer holds its slice and is not
    // dispatched; an interim decision lets the slice merge without it, and it
    // stays in scope as completing that fix.
    f.change((r) => run.filed(r, { filed: 3005, ticket: 3001, pr: 3901, source: "review-pr's deferral Task" }));
    f.change((r) => run.triage(r, { filed: 3005, outcome: "maintainer", question: "Should the cache key change?", slice: 3001 }));
    assert.equal(actions(planOf(f, snapshotOf(300, [{ ...ticket(3005), parent: 300 }])))[3005], "decision-needed");
    assert.deepEqual(run.completingTickets(run.readRecord(f.file), 3001).map((e) => e.number), [3002, 3005]);
    assert.throws(() => f.change((r) => run.interim(r, { filed: 3003, decision: "ok", evidence: "chat" })), /not triaged as completing/);
    f.change((r) => run.interim(r, { filed: 3005, decision: "Keep the narrow fix for now", evidence: "the maintainer's reply on the parent" }));
    const after = run.readRecord(f.file).filed[3005].outcome;
    assert.deepEqual([after.kind, after.slice, after.interim.decision], ["completes", 3001, "Keep the narrow fix for now"]);
    assert.deepEqual(run.completingTickets(run.readRecord(f.file), 3001).map((e) => e.number), [3002], "an interim releases the slice's PR");
    // The triage hold applies to a writer continuing existing work too: a
    // ticket raised with the maintainer, or completing an undelivered slice's
    // fix, offers no continuation.
    f.change((r) => run.filed(r, { filed: 3006, ticket: 3001, pr: 3901, source: "ticket #3006's provenance line" }));
    f.change((r) => run.triage(r, { filed: 3006, outcome: "maintainer", question: "Does the cache key change?" }));
    const draft = (n) => ({ number: 3900 + n, state: "OPEN", isDraft: true, branch: `fix/${n}-thing`, head: "h", rounds: 1 });
    const continuing = run.planDispatch({ record: freed(run.readRecord(f.file)), snapshot: snapshotOf(300, [{ ...ticket(3001), parent: 300 }, { ...ticket(3006), parent: 300, prs: [{ ...draft(3006), number: 3966 }] }, { ...ticket(3002), parent: 300, worktrees: [{ path: path.join(f.dir, "wt-3002"), branch: "fix/3002-thing", head: "h" }] }]), preflights: [available("claude-cli", "claude-opus-5-5", [3001, 3002, 3006])], freeBytes: 100 * GB, defaults });
    const entryOf = (p, n) => p.tickets.find((t) => t.number === n);
    assert.deepEqual([entryOf(continuing, 3006).action, entryOf(continuing, 3006).continueWith], ["adopt-pr", undefined], "no continuation while the maintainer decides");
    assert.match(entryOf(continuing, 3006).continueBlocked, /raised with the maintainer: "Does the cache key change\?"/);
    assert.deepEqual([entryOf(continuing, 3002).action, entryOf(continuing, 3002).continueWith], ["adopt-worktree", undefined], "no continuation of a completing ticket before its slice is delivered");
    assert.match(entryOf(continuing, 3002).continueBlocked, /completes #3001's fix/);
    // A completing ticket whose slice has left the tree waits on the
    // coordinator rather than dispatching.
    const orphan = run.planDispatch({ record: freed(run.readRecord(f.file)), snapshot: snapshotOf(300, [{ ...ticket(3002), parent: 300 }]), preflights: [available("claude-cli", "claude-opus-5-5", [3002])], freeBytes: 100 * GB, defaults });
    assert.equal(actions(orphan)[3002], "decision-needed");
    assert.match(entryOf(orphan, 3002).reason, /#3001 is not in the parent's tree/);
    // A number a report names that GitHub shows is no ticket the writer filed
    // or reused is dismissed with that evidence and stops holding the plan.
    f.change((r) => run.result(r, { ticket: 3001, report: write("filed-r6.json", { ...base, filed: [3002, 3007] }) }));
    assert.deepEqual(filedOf(planOf(f, snapshotOf(300, []))), { 3007: "confirm-filed" });
    assert.throws(() => f.change((r) => run.dismiss(r, { filed: 3008, evidence: "x" })), /No writer's report names #3008/);
    assert.throws(() => f.change((r) => run.dismiss(r, { filed: 3002, evidence: "x" })), /recorded as filed during the run; triage it instead/);
    assert.throws(() => f.change((r) => run.dismiss(r, { filed: 3007, ticket: 3009, evidence: "x" })), /#3009's writer's report does not name #3007/);
    f.change((r) => run.dismiss(r, { filed: 3007, ticket: 3001, evidence: "#3007 is a mistyped number: PR #3901's report lists #3006, and #3007 is an unrelated pull request" }));
    assert.deepEqual(filedOf(planOf(f, snapshotOf(300, []))), {}, "a dismissed number holds nothing");
    assert.throws(() => f.change((r) => run.filed(r, { filed: 3007, source: "x" })), /was dismissed at .* as no ticket a writer filed or reused/);
  }
} finally {
  for (const { stop } of started) fs.writeFileSync(stop, "");
  for (const { pid } of started) { try { waitFor(() => !processIdentity(pid), `stand-in ${pid} to exit`, 15000); } catch (error) { console.error(error.message); } }
  // A process still holding the scratch directory makes removal fail; report
  // it rather than let it replace the error that ended the run.
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (error) { console.error(`scratch not removed: ${error.message}`); }
}
console.log("PASS: dependency admission, adoption, exclusive ownership, uncertain launches, observed exit, writer routes, brief contract and reviewer-freeze coexistence");

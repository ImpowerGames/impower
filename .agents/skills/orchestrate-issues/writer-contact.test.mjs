// Exercises how the coordinator and its writers stay in contact: every
// route's brief carries the coordinator's recorded session id and its report
// mechanism from the runner configuration, the coordinator id is a session id
// or nothing, the writer's acknowledgement confirms the model, effort and
// permission mode, an unacknowledged brief becomes a delivery to settle after
// one check-in interval, the periodic check-in is recorded and recreated on
// takeover, the wake sweep reads only idle writers and flags dead reviewer
// launches, an idle CLI writer can be opened in the app, and the retired Claude routes are refused. Each
// scenario reports on its own, so a run shows every one that fails. Runs in
// a scratch repository under the system temp directory and launches only a
// stand-in writer.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { processIdentity } from "../../../scripts/reviewer-slots.mjs";
import { preflight } from "../../../scripts/writer-route-preflight.mjs";
import { testShell } from "../drive-web-editor/redgreen.mjs";
import * as run from "./issue-run.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "issue-run.mjs");
const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "writer-contact-")));
console.log(`scratch: ${tmp}`);
const defaults = run.readWriterDefaults();
const GB = 2 ** 30, MINUTE = 60000;
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim();
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const waitFor = (test, what, ms = 30000) => { const end = Date.now() + ms; while (!test()) { if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`); sleep(200); } };
const write = (name, value) => { const file = path.join(tmp, name); fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value)); return file; };
const COORDINATOR = "local_0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const CODEX_THREAD = "0199c3a2-7b1e-7c40-9d2a-5e6f7a8b9c0d";
const WRITER_SESSION = "5e1d2c3b-4a59-4687-8796-a5b4c3d2e1f0";
const started = [];
const failed = [];
const scenario = (name, fn) => {
  try { fn(); console.log(`PASS  ${name}`); }
  catch (error) { failed.push(name); console.log(`FAIL  ${name}: ${String(error.message).split("\n").slice(0, 6).join(" ")}`); }
};

try {
  const fresh = (name, { issue = 300, harness = "claude", coordinator = COORDINATOR, coordinatorMode = "bypassPermissions", model = harness === "claude" ? "claude-opus-5-5" : "gpt-6.1-sol" } = {}) => {
    const dir = path.join(tmp, name);
    fs.mkdirSync(path.join(dir, "artifacts"), { recursive: true });
    git(tmp, "init", "-q", "-b", "main", dir);
    git(dir, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "--allow-empty", "-m", "base");
    const file = path.join(dir, "artifacts", "run.json");
    run.initRecord({ record: file, checkout: dir, repository: "acme/widgets", issue, coordinator, harness, coordinatorModel: model, coordinatorEffort: "high", coordinatorMode, slug: "resumable-feature-orchestration", invocation: `Use orchestrate-issues for #${issue}.` }, { defaults, freeBytes: 40 * GB, totalMemory: 64 * GB });
    const change = (fn) => run.updateRecord(file, { expectRevision: run.readRecord(file).revision, coordinator }, fn).output;
    return { dir, file, artifacts: path.join(dir, "artifacts"), change, coordinator };
  };
  const ticket = (number, more = {}) => ({ number, title: `ticket ${number}`, state: "open", parent: 300, container: false, effort: "Medium", delivered: false, blockers: [], prs: [], worktrees: [], ...more });
  const snapshotOf = (tickets, issue = 300) => ({ repository: "acme/widgets", issue: { number: issue, state: "open" }, originMain: "abc", tickets });
  const available = (route, model, numbers) => ({ route, model, verdicts: numbers.map((n) => ({ ticket: n, effort: "medium", verdict: "available" })) });
  const planOf = (f, snap, more = {}) => run.planDispatch({ record: run.readRecord(f.file), snapshot: snap, freeBytes: 100 * GB, defaults, census: () => [], env: {}, ...more });
  const entryOf = (plan, n) => plan.tickets.find((t) => t.number === n);
  const standIn = write("stand-in-writer.mjs", [
    'import fs from "node:fs";',
    'const stop = process.argv[process.argv.indexOf("--stop") + 1];',
    'fs.readFileSync(0, "utf8");',
    `console.log(JSON.stringify({ type: "system", subtype: "init", session_id: "${WRITER_SESSION}", model: process.argv[process.argv.indexOf("--model") + 1] }));`,
    'const end = Date.now() + 120000;',
    'const wait = () => { if (fs.existsSync(stop) || Date.now() > end) process.exit(0); setTimeout(wait, 100); };',
    "wait();",
  ].join("\n"));
  // A claude-cli writer claimed from a plan, briefed and launched as the
  // stand-in, once its stream has started.
  const cliWriter = (name, number) => {
    const f = fresh(name);
    const snap = snapshotOf([ticket(number)]);
    const pre = [available("claude-cli", "claude-opus-5-5", [number])];
    const planFile = write(`${name}-plan.json`, planOf(f, snap, { preflights: pre }));
    f.change((r) => run.claim(r, { plan: planFile, ticket: number, worktree: path.join(f.dir, `wt-${number}`), branch: `fix/${number}-thing`, artifactParent: f.artifacts }));
    const prompt = write(`${name}-prompt.txt`, run.brief(run.readRecord(f.file), planFile, number, [], defaults));
    const stop = path.join(tmp, `stop-${name}`);
    const args = (mode) => [standIn, "-p", "--model", "claude-opus-5-5", "--effort", "medium", ...(mode ? ["--permission-mode", mode] : []), "--stop", stop];
    const launch = (mode = "bypassPermissions") => {
      const launchedAt = Date.now();
      const owner = f.change((r) => run.launch(r, { ticket: number, executable: process.execPath, args: args(mode), prompt })).owner;
      started.push({ stop, pid: owner.handle.pid });
      const out = path.join(owner.handle.launchDir, "out.jsonl");
      waitFor(() => fs.existsSync(out) && fs.readFileSync(out, "utf8").includes("session_id"), "the stand-in writer's init event");
      return { owner, out, launchedAt };
    };
    const end = (owner) => { fs.writeFileSync(stop, ""); waitFor(() => run.ownerStatus(owner).status === "exited", "the stand-in writer to exit"); };
    return { f, snap, pre, planFile, prompt, args, launch, end, number };
  };
  // A takeover of a run, as another coordinator session on this machine.
  const NEXT = "local_4d5e6f7a-8b9c-4d0e-8f1a-2b3c4d5e6f7a";
  const takeOver = (w) => {
    const file = path.join(w.f.artifacts, "takeover.json");
    run.initRecord({ record: file, checkout: w.f.dir, repository: "acme/widgets", issue: 300, coordinator: NEXT, harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", coordinatorMode: "bypassPermissions", invocation: "Use orchestrate-issues for #300.", takeover: true, observations: { sessions: { [COORDINATOR]: { state: "archived" } } } }, { defaults, freeBytes: 40 * GB, totalMemory: 64 * GB });
    return { file, change: (fn) => run.updateRecord(file, { expectRevision: run.readRecord(file).revision, coordinator: NEXT }, fn).output, plan: (n, now) => entryOf(run.planDispatch({ record: run.readRecord(file), snapshot: w.snap, preflights: w.pre, freeBytes: 100 * GB, defaults, census: () => [], ...(now && { now }) }), n) };
  };

  // --- Routes ---------------------------------------------------------------

  scenario("claude-cli is the only Claude dispatch route; retired routes are refused with their reasons", () => {
    assert.deepEqual(defaults.routes.claude.map((r) => r.route), ["claude-cli"]);
    assert.deepEqual(Object.keys(defaults.retiredRoutes).sort(), ["claude-adopted", "claude-agent", "claude-desktop"]);
    assert.deepEqual(run.routeOptions("claude-opus-5-5", defaults).map((r) => r.route), ["claude-cli"]);
    for (const route of ["claude-desktop", "claude-adopted", "claude-agent"]) {
      const verdict = preflight({ route, model: "claude-opus-5-5", tickets: [{ number: 1, effort: "high" }] }).verdicts[0];
      assert.equal(verdict.verdict, "blocked", `${route} is never dispatched`);
      assert.ok(verdict.reason.includes(defaults.retiredRoutes[route]), `${route}'s refusal names its reason`);
      assert.equal(preflight({ route, model: "claude-opus-5-5", tickets: [{ number: 1, effort: "high", observed: { model: "claude-opus-5-5", effort: "high" } }] }).verdicts[0].verdict, "confirmed", `an existing ${route} writer can still be confirmed`);
    }
    const f = fresh("routes");
    const p = planOf(f, snapshotOf([ticket(301)]), { preflights: [available("claude-adopted", "claude-opus-5-5", [301]), available("claude-desktop", "claude-opus-5-5", [301])] });
    assert.equal(entryOf(p, 301).action, "blocked-route");
    assert.match(entryOf(p, 301).reason, /claude-adopted is retired as a dispatch route: the app resumes an adopted session/);
    assert.match(entryOf(p, 301).reason, /claude-desktop is retired as a dispatch route: a desktop session starts only/);
  });

  // --- The coordinator's id, mode and title -----------------------------------

  scenario("init refuses a coordinator id that is not a session id, naming the expected shape", () => {
    run.checkCoordinatorId("claude", COORDINATOR);
    run.checkCoordinatorId("codex", CODEX_THREAD);
    for (const bad of ["C:\\Users\\me\\AppData\\Local\\Temp\\claude\\scratchpad", "scratchpad", "657afe2b-179f-4eb0-a92a-640ec593032a", "local_a", ""]) assert.throws(() => run.checkCoordinatorId("claude", bad), /local_<uuid>/, `claude refuses ${JSON.stringify(bad)}`);
    assert.throws(() => run.checkCoordinatorId("codex", COORDINATOR), /thread id/);
    const dir = path.join(tmp, "cli-init");
    fs.mkdirSync(dir);
    git(tmp, "init", "-q", "-b", "main", dir);
    git(dir, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "--allow-empty", "-m", "base");
    const record = path.join(tmp, "cli-init.json");
    const cli = (...extra) => spawnSync(process.execPath, [script, "init", "--record", record, "--checkout", dir, "--repo", "acme/widgets", "--issue", "300", "--harness", "claude", "--coordinator-model", "claude-opus-5-5", "--coordinator-effort", "high", "--invocation", "Use orchestrate-issues for #300.", "--merging", "maintainer", ...extra], { encoding: "utf8", windowsHide: true });
    const scratch = cli("--coordinator", "657afe2b-179f-4eb0-a92a-640ec593032a", "--coordinator-mode", "bypassPermissions", "--slug", "resumable-feature-orchestration");
    assert.equal(scratch.status, 1);
    assert.match(scratch.stderr, /local_<uuid>/);
    assert.ok(!fs.existsSync(record), "a refused id writes no record");
    assert.match(cli("--coordinator", COORDINATOR, "--slug", "resumable-feature-orchestration").stderr, /--coordinator-mode/);
    assert.match(cli("--coordinator", COORDINATOR, "--coordinator-mode", "bypassPermissions", "--slug", "Not A Slug").stderr, /--slug/);
    const made = cli("--coordinator", COORDINATOR, "--coordinator-mode", "bypassPermissions", "--slug", "resumable-feature-orchestration");
    assert.equal(made.status, 0, made.stderr);
    const rec = run.readRecord(record);
    assert.deepEqual([rec.title, rec.coordinator.session, rec.coordinator.permissionMode], ["ORCH #300: resumable feature orchestration", COORDINATOR, "bypassPermissions"]);
  });

  scenario("a coordinator outside bypass permissions mode dispatches nothing until init records the switch", () => {
    const f = fresh("mode", { coordinatorMode: "auto" });
    const snap = snapshotOf([ticket(311)]);
    const pre = [available("claude-cli", "claude-opus-5-5", [311])];
    const blocked = entryOf(planOf(f, snap, { preflights: pre }), 311);
    assert.equal(blocked.action, "blocked-route");
    assert.match(blocked.reason, /coordinator runs in auto permission mode, not bypassPermissions/);
    run.initRecord({ record: f.file, checkout: f.dir, repository: "acme/widgets", issue: 300, coordinator: f.coordinator, harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", coordinatorMode: "bypassPermissions", invocation: "Use orchestrate-issues for #300." }, { defaults, freeBytes: 40 * GB, totalMemory: 64 * GB });
    assert.equal(run.readRecord(f.file).coordinator.permissionMode, "bypassPermissions");
    assert.equal(entryOf(planOf(f, snap, { preflights: pre }), 311).action, "dispatch");
  });

  scenario("a record without a title takes one when init runs again, and keeps it after", () => {
    const f = fresh("title-later");
    const again = (slug) => run.initRecord({ record: f.file, checkout: f.dir, repository: "acme/widgets", issue: 300, coordinator: f.coordinator, harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", coordinatorMode: "bypassPermissions", slug, invocation: "Use orchestrate-issues for #300." }, { defaults, freeBytes: 40 * GB, totalMemory: 64 * GB });
    f.change((r) => { delete r.title; });
    assert.equal(again("later-title").record.title, "ORCH #300: later title");
    assert.equal(again("another-title").record.title, "ORCH #300: later title", "the parent issue keeps the title it was given");
  });

  // --- Briefs on every route ------------------------------------------------

  scenario("every route's brief carries the recorded coordinator id, its report mechanism or fallback, the verbatim self-check and the dead-launch rule", () => {
    for (const [harness, coordinator] of [["claude", COORDINATOR], ["codex", CODEX_THREAD]]) {
      for (const [vendor, routes] of Object.entries(defaults.routes)) {
        for (const route of routes) {
          const model = vendor === "claude" ? "claude-opus-5-5" : "gpt-6.1-sol";
          const f = fresh(`brief-${harness}-${route.route}`, { harness, coordinator });
          const rec = run.readRecord(f.file);
          const planFile = write(`brief-${harness}-${route.route}.json`, { runId: rec.runId, repository: rec.repository, issue: rec.issue, revision: rec.revision, coordinator, tickets: [{ number: 321, title: "ticket 321", action: "dispatch", route: route.route, model, effort: "medium" }] });
          f.change((r) => run.claim(r, { plan: planFile, ticket: 321, worktree: path.join(f.dir, "wt-321"), branch: "fix/321-thing", artifactParent: f.artifacts }));
          const text = run.brief(run.readRecord(f.file), planFile, 321, [], defaults);
          const how = route.reports[harness];
          const label = `${route.route} reporting to a ${harness} coordinator`;
          assert.ok(text.includes(`coordinator session ${coordinator}`), `${label}: the brief names the recorded coordinator`);
          assert.ok(text.includes(route.selfCheck), `${label}: the verbatim self-check`);
          assert.match(text, /If any of them differs, stop and report the mismatch as a blocker/, label);
          assert.match(text, /read the launcher's exit and its .*\.coordinator\.err\.log at once/, `${label}: the dead-launch rule`);
          if (how.mechanism) {
            assert.ok(text.includes(how.mechanism), `${label}: the mechanism comes from the configuration`);
            assert.match(text, /Your first act after reading this brief: send coordinator session .* an acknowledgement/, label);
            assert.match(text, /Send every report, blocker and question to coordinator session/, label);
          } else {
            assert.ok(text.includes(how.unsupported), `${label}: the brief says why it cannot message`);
            assert.ok(text.includes(defaults.reportFallback), `${label}: the brief names the transcript sweep as the fallback`);
            assert.doesNotMatch(text, /SendMessage/, label);
          }
          if (vendor === "claude") assert.match(text, /permission mode bypassPermissions/, `${label}: the brief states the mode it was started in`);
          if (route.route === "claude-cli") assert.ok(text.includes(route.turns) && /Never end a turn waiting on a background task/.test(text), `${label}: a process that exits with its turn never ends one to wait`);
        }
      }
    }
  });

  // --- A CLI writer from launch to acknowledgement -----------------------------

  scenario("a CLI dispatch records the permission mode it requests, launches only at that mode and keeps the brief it sent", () => {
    const w = cliWriter("cli-mode", 331);
    assert.equal(run.readRecord(w.f.file).tickets[331].pending.permissionMode, "bypassPermissions", "the claim records the mode it requests");
    assert.throws(() => w.f.change((r) => run.launch(r, { ticket: 331, executable: process.execPath, args: w.args(null), prompt: w.prompt })), /exactly one --permission-mode/);
    assert.throws(() => w.f.change((r) => run.launch(r, { ticket: 331, executable: process.execPath, args: w.args("auto"), prompt: w.prompt })), /--permission-mode must be bypassPermissions/);
    const { owner } = w.launch();
    assert.deepEqual([owner.permissionMode, owner.brief.state, owner.brief.text], ["bypassPermissions", "delivered", fs.readFileSync(w.prompt, "utf8")], "the brief went with the start");
    w.end(owner);
  });

  scenario("the wake sweep reads no transcript of a running writer, and reads it once the writer's turn has ended", () => {
    const w = cliWriter("cli-sweep", 332);
    const { owner, out } = w.launch();
    const running = planOf(w.f, w.snap, { preflights: w.pre });
    assert.equal(entryOf(running, 332).action, "observe");
    assert.equal(entryOf(running, 332).transcript, undefined);
    assert.deepEqual(running.sweep.read, []);
    assert.deepEqual(running.sweep.notRead.map((s) => s.ticket), [332]);
    assert.match(running.sweep.notRead[0].reason, /running; a running writer cannot be waiting on the coordinator/);
    w.end(owner);
    const ended = planOf(w.f, w.snap, { preflights: w.pre });
    assert.deepEqual(ended.sweep.read, [{ ticket: 332, from: out }]);
    assert.equal(entryOf(ended, 332).transcript.from, out);
  });

  scenario("a brief unacknowledged after one check-in interval is a delivery failure, settled by an identified resend", () => {
    const w = cliWriter("cli-ack", 333);
    const { owner, launchedAt } = w.launch();
    const at = (ms) => entryOf(planOf(w.f, w.snap, { preflights: w.pre, now: ms }), 333);
    assert.equal(at(launchedAt + 29 * MINUTE).action, "observe");
    const overdue = at(launchedAt + 31 * MINUTE);
    assert.equal(overdue.action, "settle-delivery");
    assert.match(overdue.reason, new RegExp(`no acknowledgement .* within 30 minutes .* confirm that ${COORDINATOR} is this session's own id`));
    const resent = w.f.change((r) => run.deliver(r, { ticket: 333, retry: true }));
    const assignment = run.readRecord(w.f.file).tickets[333].owner.launchId;
    assert.match(resent.message, new RegExp(`^Assignment ${assignment} \\(delivery \\w+\\)\\. If you have already received assignment ${assignment}, ignore this copy`));
    assert.ok(resent.message.endsWith(fs.readFileSync(w.prompt, "utf8")), "the retry carries the stored brief exactly");
    assert.ok(fs.readFileSync(w.prompt, "utf8").includes(`Assignment ${assignment}`), "the first copy already named its assignment");
    assert.equal(at(Date.now() + 31 * MINUTE).action, "reconcile-pending", "an unconfirmed resend is settled before anything else");
    w.f.change((r) => run.delivered(r, { ticket: 333, evidence: "sent to the writer's session" }));
    assert.equal(at(Date.now() + MINUTE).action, "observe", "the clock restarts with the resend");
    assert.throws(() => w.f.change((r) => run.acknowledged(r, { ticket: 333, model: "claude-opus-5-5", effort: "medium", permissionMode: "bypassPermissions" })), /--evidence/);
    w.f.change((r) => run.acknowledged(r, { ticket: 333, model: "claude-opus-5-5", effort: "medium", permissionMode: "bypassPermissions", evidence: "message from the writer" }));
    assert.deepEqual(run.readRecord(w.f.file).tickets[333].owner.acknowledged.confirmed, { model: "claude-opus-5-5", effort: "medium", permissionMode: "bypassPermissions" });
    assert.equal(at(Date.now() + 90 * MINUTE).action, "observe", "an acknowledged brief is never overdue");
    w.end(owner);
  });

  scenario("the acknowledgement and the report carry what the writer confirmed, and a mismatch plans as stop-writer", () => {
    const w = cliWriter("cli-confirm", 334);
    const { owner } = w.launch();
    w.f.change((r) => run.acknowledged(r, { ticket: 334, model: "claude-opus-5-5", effort: "low", permissionMode: "bypassPermissions", evidence: "message from the writer" }));
    assert.equal(entryOf(planOf(w.f, w.snap, { preflights: w.pre }), 334).action, "stop-writer");
    assert.match(run.readRecord(w.f.file).tickets[334].owner.mismatch, /confirmed claude-opus-5-5 at low in bypassPermissions, not .* at medium in bypassPermissions/);
    w.f.change((r) => { delete r.tickets[334].owner.mismatch; });
    const report = (more) => write(`report-${Date.now()}.json`, { model: "claude-opus-5-5", effort: "medium", permissionMode: "bypassPermissions", pr: 901, reviewedHead: "f1", rounds: { "gpt-6.1-sol": 1 }, findings: "None", verification: "check", ci: {}, filed: "None", next: "x", ...more });
    assert.throws(() => w.f.change((r) => run.result(r, { ticket: 334, report: write("no-mode.json", { model: "claude-opus-5-5", effort: "medium", pr: 901, reviewedHead: "f1", rounds: {}, findings: "None", verification: "check", ci: {}, next: "x" }) })), /lacks permissionMode/);
    w.f.change((r) => run.result(r, { ticket: 334, report: report({ permissionMode: "acceptEdits" }) }));
    assert.equal(run.readRecord(w.f.file).tickets[334].results.length, 1, "the report is kept");
    assert.equal(entryOf(planOf(w.f, w.snap, { preflights: w.pre }), 334).action, "stop-writer");
    assert.match(run.readRecord(w.f.file).tickets[334].owner.mismatch, /reported claude-opus-5-5 at medium in acceptEdits/);
    w.end(owner);
  });

  scenario("an idle CLI writer's session opens in the app without changing who the writer is", () => {
    const w = cliWriter("cli-open", 335);
    const { owner, out } = w.launch();
    let handed = null;
    const open = (runner = (o) => { handed = o.sessionId; return { requested: true, pid: 1 }; }) => run.openWriter(w.f.file, { coordinator: w.f.coordinator, expectRevision: run.readRecord(w.f.file).revision, ticket: 335, executable: process.execPath, runner });
    assert.throws(() => open(), /is live .*; only an idle writer/);
    w.end(owner);
    // An open whose outcome was lost is settled from the app's session list,
    // never run again.
    open(() => { throw new Error("the reply was lost"); });
    assert.match(entryOf(planOf(w.f, w.snap, { preflights: w.pre }), 335).reason, /uncertain outcome \(the reply was lost\); look for local_.* and never run open again/);
    assert.throws(() => open(), /already opened \(open uncertain\)/);
    assert.equal(handed, null);
    assert.throws(() => w.f.change((r) => run.opened(r, { ticket: 335, session: "local_00000000-0000-4000-8000-000000000000" })), new RegExp(`local_${WRITER_SESSION}`), "the app session is the one the writer's stream names");
    w.f.change((r) => run.opened(r, { ticket: 335, session: `local_${WRITER_SESSION}` }));
    // The record keeps the CLI process as the writer: its transcript is still
    // its stream, and its ended turn is still read as the CLI writer's.
    const after = planOf(w.f, w.snap, { preflights: w.pre, observations: { sessions: { [`local_${WRITER_SESSION}`]: { state: "running" } } } });
    assert.deepEqual([entryOf(after, 335).action, entryOf(after, 335).owner.handle.kind, entryOf(after, 335).transcript.from], ["collect-report", "process", out]);
    assert.equal(run.readRecord(w.f.file).tickets[335].owner.opened.session, `local_${WRITER_SESSION}`);
    // A second writer's open runs the handoff with the session its stream names.
    const v = cliWriter("cli-open-2", 336);
    const second = v.launch();
    v.end(second.owner);
    const opening = run.openWriter(v.f.file, { coordinator: v.f.coordinator, expectRevision: run.readRecord(v.f.file).revision, ticket: 336, executable: process.execPath, runner: (o) => { handed = o.sessionId; return { requested: true, pid: 1 }; } });
    assert.deepEqual([handed, opening.sessionId, entryOf(planOf(v.f, v.snap, { preflights: v.pre }), 336).action], [WRITER_SESSION, WRITER_SESSION, "reconcile-pending"]);
  });

  scenario("a request left by a CLI writer whose turn ended is answered by resuming its session", () => {
    const w = cliWriter("cli-resume", 371);
    const { owner } = w.launch();
    const { id } = w.f.change((r) => run.request(r, { ticket: 371, text: "Round 3 complete; may I start round 4?", source: "message from the writer" }));
    w.end(owner);
    const asking = entryOf(planOf(w.f, w.snap, { preflights: w.pre }), 371);
    assert.equal(asking.action, "answer-request", "an ended CLI writer's request is answered, not released away");
    assert.match(asking.reason, /resuming its session: record answer, .* run resume/);
    const message = w.f.change((r) => run.answer(r, { ticket: 371, request: id, text: "Round 4 is authorized." })).message;
    const answerFile = write("cli-resume-answer.txt", message);
    const stop = path.join(tmp, "stop-cli-resume-2");
    const resumeArgs = (session, effort = "medium") => [standIn, "-p", "--resume", session, "--model", "claude-opus-5-5", "--effort", effort, "--permission-mode", "bypassPermissions", "--stop", stop];
    const resumeIt = (args, spawner) => run.resumeWriter(w.f.file, { coordinator: w.f.coordinator, expectRevision: run.readRecord(w.f.file).revision, ticket: 371, executable: process.execPath, args, prompt: answerFile, ...(spawner && { spawner }) });
    assert.throws(() => resumeIt(resumeArgs("00000000-0000-4000-8000-000000000000")), new RegExp(`exactly one --resume ${WRITER_SESSION}`), "only the session the writer's stream names is resumed");
    assert.throws(() => resumeIt(resumeArgs(WRITER_SESSION, "high")), /--effort must be medium/, "the writer resumes at its own effort");
    // A resume whose outcome was lost is settled by reconcile, never run again.
    assert.equal(resumeIt(resumeArgs(WRITER_SESSION), () => { throw new Error("the host lost the reply"); }).uncertain, true);
    assert.match(entryOf(planOf(w.f, w.snap, { preflights: w.pre }), 371).reason, /resume .* has no recorded outcome \(the host lost the reply\); run reconcile/);
    assert.throws(() => resumeIt(resumeArgs(WRITER_SESSION)), /no recorded outcome; settle it with reconcile/);
    assert.equal(w.f.change((r) => run.reconcile(r, { ticket: 371, census: () => [] })).outcome, "not running");
    const resumed = resumeIt(resumeArgs(WRITER_SESSION));
    started.push({ stop, pid: resumed.pid });
    assert.equal(resumed.started, true);
    const after = run.readRecord(w.f.file).tickets[371].owner;
    assert.notEqual(after.handle.pid, owner.handle.pid, "the resumed process is the writer's handle");
    assert.equal(after.launchId, owner.launchId, "the assignment stays the same");
    waitFor(() => fs.existsSync(path.join(after.handle.launchDir, "out.jsonl")) && fs.readFileSync(path.join(after.handle.launchDir, "out.jsonl"), "utf8").includes("session_id"), "the resumed writer's stream");
    assert.equal(fs.readFileSync(path.join(after.handle.launchDir, "prompt.txt"), "utf8"), message, "the answer is the resumed prompt");
    const unconfirmed = entryOf(planOf(w.f, w.snap, { preflights: w.pre }), 371);
    assert.equal(unconfirmed.action, "answer-request");
    assert.doesNotMatch(unconfirmed.reason, /transcript/, "the running writer's transcript is not read for the answer's outcome");
    w.f.change((r) => run.answered(r, { ticket: 371, request: id, evidence: "resumed with the answer as its prompt" }));
    assert.equal(entryOf(planOf(w.f, w.snap, { preflights: w.pre }), 371).action, "observe");
    assert.throws(() => resumeIt(resumeArgs(WRITER_SESSION)), /is live .*only a writer whose turn has ended is resumed/);
    fs.writeFileSync(stop, "");
    waitFor(() => run.ownerStatus(run.readRecord(w.f.file).tickets[371].owner).status === "exited", "the resumed writer to exit");
    const report = write("cli-resume-report.json", { model: "claude-opus-5-5", effort: "medium", permissionMode: "bypassPermissions", pr: 971, reviewedHead: "f1", rounds: { "gpt-6.1-sol": 4 }, findings: "None", verification: "check", ci: {}, filed: "None", next: "await the merge" });
    w.f.change((r) => run.result(r, { ticket: 371, report }));
    assert.equal(entryOf(planOf(w.f, w.snap, { preflights: w.pre }), 371).action, "release", "a writer that ended with its final report recorded is released");
  });

  scenario("a CLI writer whose turn ended with no report or request is read and resumed, never released as finished", () => {
    const w = cliWriter("cli-stalled", 375);
    const { owner, out } = w.launch();
    w.f.change((r) => run.acknowledged(r, { ticket: 375, model: "claude-opus-5-5", effort: "medium", permissionMode: "bypassPermissions", evidence: "message from the writer" }));
    // The writer ended its turn on a wait ("I'll pick up when the reviewer exits").
    w.end(owner);
    const stalled = entryOf(planOf(w.f, w.snap, { preflights: w.pre }), 375);
    assert.equal(stalled.action, "collect-report");
    assert.match(stalled.reason, new RegExp(`no final report recorded since its last start: read its transcript at .*out\\.jsonl.*resume it with a prompt to continue`));
    assert.ok(stalled.reason.includes(out));
    const prompt = write("cli-stalled-continue.txt", "Continue: wait for the reviewer in the foreground, then carry on.");
    const stop = path.join(tmp, "stop-cli-stalled-2");
    const resumed = run.resumeWriter(w.f.file, { coordinator: w.f.coordinator, expectRevision: run.readRecord(w.f.file).revision, ticket: 375, executable: process.execPath, args: [standIn, "-p", "--resume", WRITER_SESSION, "--model", "claude-opus-5-5", "--effort", "medium", "--permission-mode", "bypassPermissions", "--stop", stop], prompt });
    started.push({ stop, pid: resumed.pid });
    assert.equal(entryOf(planOf(w.f, w.snap, { preflights: w.pre }), 375).action, "observe", "the resumed writer carries on");
    fs.writeFileSync(stop, "");
    waitFor(() => run.ownerStatus(run.readRecord(w.f.file).tickets[375].owner).status === "exited", "the resumed writer to exit");
    assert.equal(entryOf(planOf(w.f, w.snap, { preflights: w.pre }), 375).action, "collect-report", "the resumed turn's end is read in its turn");
  });

  scenario("the sweep reads every held writer and checks every open PR, whatever the ticket's action", () => {
    const w = cliWriter("cli-closed", 376);
    const { owner, out } = w.launch();
    w.end(owner);
    // The ticket closed with its deliverable merged while the writer's last message was lost.
    const closed = snapshotOf([ticket(376, { state: "closed", delivered: true }), ticket(377, { prs: [{ number: 977, state: "OPEN", isDraft: true, branch: "fix/377-thing", head: "h", rounds: 2 }] })]);
    const jobs = path.join(tmp, "cli-closed.review-jobs");
    const dir = path.join(jobs, "pr-977", "round-3");
    fs.mkdirSync(dir, { recursive: true });
    const plan = path.join(dir, "plan.json");
    fs.writeFileSync(plan, JSON.stringify({ worktree: w.f.dir, pr: 977, journal: path.join(dir, "journal.jsonl"), steps: { review: {} }, first: "review" }));
    fs.writeFileSync(path.join(dir, "plan.coordinator.err.log"), "Error: Supply reviewedHead from the journal\n");
    const p = planOf(w.f, closed, { preflights: w.pre, reviewJobs: jobs });
    assert.equal(entryOf(p, 376).action, "release", "a held writer on a closed ticket is read and released, not left holding a place");
    assert.deepEqual(p.sweep.read, [{ ticket: 376, from: out }]);
    assert.equal(entryOf(p, 377).action, "adopt-pr");
    assert.deepEqual(p.sweep.deadLaunches.map((d) => [d.ticket, d.pr, d.plan]), [[377, 977, plan]], "a PR whose writer the record does not hold is checked too");
  });

  scenario("a launch whose outcome was lost and whose writer then ended keeps that writer, so its request is answered by resume", () => {
    const w = cliWriter("cli-lost-launch", 378);
    // The writer ran and ended its turn, but the launch outcome was never recorded.
    const launchDir = run.launchDirOf(run.readRecord(w.f.file).tickets[378].pending, 378);
    fs.mkdirSync(launchDir, { recursive: true });
    fs.copyFileSync(w.prompt, path.join(launchDir, "prompt.txt"));
    fs.writeFileSync(path.join(launchDir, "out.jsonl"), `${JSON.stringify({ type: "system", subtype: "init", session_id: WRITER_SESSION, model: "claude-opus-5-5" })}\n`);
    const settled = w.f.change((r) => run.reconcile(r, { ticket: 378, census: () => [] }));
    assert.equal(settled.outcome, "started and ended");
    const owner = run.readRecord(w.f.file).tickets[378].owner;
    assert.deepEqual([owner.handle.kind, owner.handle.pid, owner.handle.launchDir, owner.permissionMode], ["process", null, launchDir, "bypassPermissions"], "the ended writer is kept with its launch directory");
    assert.deepEqual(planOf(w.f, w.snap, { preflights: w.pre }).sweep.read, [{ ticket: 378, from: path.join(launchDir, "out.jsonl") }]);
    const { id } = w.f.change((r) => run.request(r, { ticket: 378, text: "Round 3 complete; may I start round 4?", source: "the writer's stream" }));
    assert.equal(entryOf(planOf(w.f, w.snap, { preflights: w.pre }), 378).action, "answer-request");
    const answer = write("cli-lost-launch-answer.txt", w.f.change((r) => run.answer(r, { ticket: 378, request: id, text: "Round 4 is authorized." })).message);
    let spawned = null;
    const resumed = run.resumeWriter(w.f.file, { coordinator: w.f.coordinator, expectRevision: run.readRecord(w.f.file).revision, ticket: 378, executable: process.execPath, args: [standIn, "-p", "--resume", WRITER_SESSION, "--model", "claude-opus-5-5", "--effort", "medium", "--permission-mode", "bypassPermissions"], prompt: answer, spawner: (o) => { spawned = o; return { started: true, pid: process.pid }; } });
    assert.equal(resumed.started, true);
    assert.ok(spawned.args.includes(WRITER_SESSION), "the session the stream named is resumed");
  });

  scenario("a stopped writer resumed after a takeover is told the new coordinator with the resume, even from a brief kept before briefs named their coordinator", () => {
    const w = cliWriter("cli-takeover-resume", 379);
    const { owner } = w.launch();
    w.end(owner);
    // A record written before stored briefs kept their own coordinator.
    w.f.change((r) => { delete r.tickets[379].owner.brief.coordinator; });
    const t = takeOver(w);
    assert.equal(t.plan(379).action, "collect-report");
    const prompt = write("cli-takeover-resume.txt", "Continue: wait for the reviewer in the foreground, then carry on.");
    let spawned = null;
    run.resumeWriter(t.file, { coordinator: NEXT, expectRevision: run.readRecord(t.file).revision, ticket: 379, executable: process.execPath, args: [standIn, "-p", "--resume", WRITER_SESSION, "--model", "claude-opus-5-5", "--effort", "medium", "--permission-mode", "bypassPermissions"], prompt, spawner: (o) => { spawned = o; return { started: true, pid: process.pid }; } });
    const sent = fs.readFileSync(path.join(spawned.launchDir, "prompt.txt"), "utf8");
    assert.ok(sent.startsWith("Continue:") && sent.includes(`Your coordinator is now session ${NEXT}`), "the resume prompt carries the new coordinator");
    const after = run.readRecord(t.file).tickets[379].owner;
    assert.equal(after.coordinator, NEXT, "the resumed writer is recorded as told");
    const printed = run.brief(run.readRecord(t.file), null, 379, [], defaults);
    assert.ok(printed.includes(`coordinator session ${NEXT}`) && !printed.includes(COORDINATOR), "the old-shape brief still prints the current coordinator after the contact moved");
  });

  scenario("a writer recovered from a predecessor's lost launch is recorded as told the predecessor, so the new coordinator still tells it", () => {
    const w = cliWriter("cli-predecessor-launch", 381);
    const launchDir = run.launchDirOf(run.readRecord(w.f.file).tickets[381].pending, 381);
    fs.mkdirSync(launchDir, { recursive: true });
    fs.copyFileSync(w.prompt, path.join(launchDir, "prompt.txt"));
    fs.writeFileSync(path.join(launchDir, "out.jsonl"), `${JSON.stringify({ type: "system", subtype: "init", session_id: WRITER_SESSION, model: "claude-opus-5-5" })}\n`);
    const t = takeOver(w);
    assert.equal(t.change((r) => run.reconcile(r, { ticket: 381, census: () => [] })).outcome, "started and ended");
    const owner = run.readRecord(t.file).tickets[381].owner;
    assert.deepEqual([owner.coordinator, owner.brief.coordinator], [COORDINATOR, COORDINATOR], "the launch's prompt named the predecessor");
    const printed = run.brief(run.readRecord(t.file), null, 381, [], defaults);
    assert.ok(printed.includes(`coordinator session ${NEXT}`) && !printed.includes(COORDINATOR));
    let spawned = null;
    run.resumeWriter(t.file, { coordinator: NEXT, expectRevision: run.readRecord(t.file).revision, ticket: 381, executable: process.execPath, args: [standIn, "-p", "--resume", WRITER_SESSION, "--model", "claude-opus-5-5", "--effort", "medium", "--permission-mode", "bypassPermissions"], prompt: write("cli-predecessor-continue.txt", "Continue the work."), spawner: (o) => { spawned = o; return { started: true, pid: process.pid }; } });
    assert.match(fs.readFileSync(path.join(spawned.launchDir, "prompt.txt"), "utf8"), new RegExp(`Your coordinator is now session ${NEXT}`), "the continuation tells the writer the new coordinator");
  });

  scenario("a resume with no recorded outcome is settled before any release, on a closed ticket too", () => {
    const w = cliWriter("cli-resume-closed", 382);
    const { owner } = w.launch();
    w.end(owner);
    const resumeArgs = [standIn, "-p", "--resume", WRITER_SESSION, "--model", "claude-opus-5-5", "--effort", "medium", "--permission-mode", "bypassPermissions"];
    assert.equal(run.resumeWriter(w.f.file, { coordinator: w.f.coordinator, expectRevision: run.readRecord(w.f.file).revision, ticket: 382, executable: process.execPath, args: resumeArgs, prompt: write("cli-resume-closed.txt", "Continue."), spawner: () => { throw new Error("the host lost the reply"); } }).uncertain, true);
    const closed = snapshotOf([ticket(382, { state: "closed", delivered: true })]);
    const entry = entryOf(planOf(w.f, closed, { preflights: w.pre }), 382);
    assert.equal(entry.action, "reconcile-pending", "a closed ticket's writer is not released while its resume may run");
    assert.match(entry.reason, /resume .* has no recorded outcome; run reconcile/);
    assert.throws(() => w.f.change((r) => run.release(r, { ticket: 382, observations: {} })), /no recorded outcome.*settle it with reconcile before release/);
  });

  scenario("the dead-launch sweep recognizes a launcher plan by its content, whatever its file name", () => {
    const f = fresh("dead-launch-named");
    const dir = path.join(tmp, "dead-launch-named.review-jobs", "pr-983", "round-1");
    fs.mkdirSync(dir, { recursive: true });
    const plan = path.join(dir, "review.plan");
    fs.writeFileSync(plan, JSON.stringify({ worktree: f.dir, pr: 983, journal: path.join(dir, "journal.jsonl"), steps: { review: {} }, first: "review" }));
    fs.writeFileSync(path.join(dir, "review.coordinator.err.log"), "Error: the review step's prompt is missing\n");
    fs.writeFileSync(path.join(dir, "notes.txt"), "not a plan");
    assert.deepEqual(run.deadLaunches(path.join(tmp, "dead-launch-named.review-jobs"), [{ ticket: 383, pr: 983 }], () => []).map((d) => [d.plan, d.error]), [[plan, "Error: the review step's prompt is missing"]]);
  });

  scenario("the dead-launch sweep finds the launcher's logs in the journal's launch-state directory too", () => {
    const f = fresh("dead-launch-state-dir");
    const round = path.join(tmp, "dead-launch-state-dir.review-jobs", "pr-984", "round-1");
    const state = path.join(round, "launch-a-1");
    fs.mkdirSync(state, { recursive: true });
    const plan = path.join(round, "review.plan");
    fs.writeFileSync(plan, JSON.stringify({ worktree: f.dir, pr: 984, journal: path.join(state, "journal.jsonl"), steps: { review: {} }, first: "review" }));
    // start-coordinator was given the launch-state directory as its job directory.
    fs.writeFileSync(path.join(state, "review.coordinator.out.log"), "");
    fs.writeFileSync(path.join(state, "review.coordinator.err.log"), "Supply reviewedHead from the journal\n");
    const dead = run.deadLaunches(path.join(tmp, "dead-launch-state-dir.review-jobs"), [{ ticket: 384, pr: 984 }], () => []);
    assert.deepEqual(dead.map((d) => [d.plan, d.errLog, d.error]), [[plan, path.join(state, "review.coordinator.err.log"), "Supply reviewedHead from the journal"]]);
  });

  scenario("a start with no recorded outcome is settled before its closed ticket counts as done", () => {
    const w = cliWriter("cli-closed-pending", 385);
    const launchDir = run.launchDirOf(run.readRecord(w.f.file).tickets[385].pending, 385);
    fs.mkdirSync(launchDir, { recursive: true });
    fs.copyFileSync(w.prompt, path.join(launchDir, "prompt.txt"));
    fs.writeFileSync(path.join(launchDir, "out.jsonl"), `${JSON.stringify({ type: "system", subtype: "init", session_id: WRITER_SESSION, model: "claude-opus-5-5" })}\n`);
    const closed = snapshotOf([ticket(385, { state: "closed", delivered: true })]);
    const entry = entryOf(planOf(w.f, closed, { preflights: w.pre }), 385);
    assert.equal(entry.action, "reconcile-pending", "not done while a writer that ran is unsettled");
    assert.match(entry.reason, /closed, but launch .* has no confirmed outcome; run reconcile/);
    assert.equal(w.f.change((r) => run.reconcile(r, { ticket: 385, census: () => [] })).outcome, "started and ended");
    const after = planOf(w.f, closed, { preflights: w.pre });
    assert.equal(entryOf(after, 385).action, "release");
    assert.deepEqual(after.sweep.read, [{ ticket: 385, from: path.join(launchDir, "out.jsonl") }]);
  });

  scenario("a confirmed preflight never clears a mismatch the writer's acknowledgement showed", () => {
    const w = cliWriter("cli-verify", 372);
    const { owner } = w.launch();
    w.f.change((r) => run.acknowledged(r, { ticket: 372, model: "claude-opus-5-5", effort: "medium", permissionMode: "auto", evidence: "message from the writer" }));
    const confirmation = write("cli-verify-confirm.json", preflight({ route: "claude-cli", model: "claude-opus-5-5", tickets: [{ number: 372, effort: "medium", observed: { model: "claude-opus-5-5", effort: "medium" } }] }));
    w.f.change((r) => run.verify(r, { ticket: 372, preflight: confirmation }));
    assert.equal(entryOf(planOf(w.f, w.snap, { preflights: w.pre }), 372).action, "stop-writer");
    assert.match(run.readRecord(w.f.file).tickets[372].owner.mismatch, /confirmed claude-opus-5-5 at medium in auto/);
    w.end(owner);
  });


  scenario("after a takeover, a resent brief names the new coordinator, and settling it never reads a running writer's transcript", () => {
    const w = cliWriter("cli-takeover-brief", 373);
    const { owner } = w.launch();
    const t = takeOver(w);
    // The contact notice comes first and on its own: a resent brief's header
    // tells a writer that already has its assignment to ignore the copy.
    assert.equal(t.plan(373, Date.now() + 31 * MINUTE).action, "update-contact");
    const resentFirst = t.change((r) => run.deliver(r, { ticket: 373, retry: true })).message;
    assert.match(resentFirst, /ignore this copy/);
    t.change((r) => run.delivered(r, { ticket: 373, evidence: "sent" }));
    assert.equal(run.readRecord(t.file).tickets[373].owner.coordinator, COORDINATOR, "a resend the writer may ignore never counts as telling it the new coordinator");
    assert.equal(t.plan(373, Date.now() + 31 * MINUTE).action, "update-contact");
    t.change((r) => run.contact(r, { ticket: 373, defaults }));
    t.change((r) => run.contacted(r, { ticket: 373, evidence: "sent" }));
    const overdue = t.plan(373, Date.now() + 62 * MINUTE);
    assert.equal(overdue.action, "settle-delivery");
    assert.match(overdue.reason, new RegExp(`confirm that ${NEXT} is this session's own id; it is running, so its transcript is not read: resend`));
    assert.doesNotMatch(overdue.reason, /read its transcript/);
    const printed = run.brief(run.readRecord(t.file), null, 373, [], defaults);
    assert.ok(printed.includes(`coordinator session ${NEXT}`) && !printed.includes(COORDINATOR), "the brief command prints the stored brief naming the new coordinator");
    const resent = t.change((r) => run.deliver(r, { ticket: 373, retry: true })).message;
    assert.ok(resent.includes(`coordinator session ${NEXT}`), "the resent brief names the new coordinator");
    assert.ok(!resent.includes(COORDINATOR), "and no longer the previous one");
    t.change((r) => run.delivered(r, { ticket: 373, evidence: "sent" }));
    assert.equal(t.plan(373).action, "observe");
    w.end(owner);
  });

  scenario("after a takeover, a resent answer the writer may already have still tells it the new coordinator", () => {
    const w = cliWriter("cli-takeover-answer", 386);
    const { owner } = w.launch();
    w.f.change((r) => run.acknowledged(r, { ticket: 386, model: "claude-opus-5-5", effort: "medium", permissionMode: "bypassPermissions", evidence: "message from the writer" }));
    const { id } = w.f.change((r) => run.request(r, { ticket: 386, text: "Round 3 complete; may I start round 4?", source: "message from the writer" }));
    // The writer received the first copy and carried on; its outcome was lost.
    w.f.change((r) => run.answer(r, { ticket: 386, request: id, text: "Round 4 is authorized." }));
    const t = takeOver(w);
    assert.equal(t.plan(386).action, "answer-request");
    const lines = t.change((r) => run.answer(r, { ticket: 386, request: id, retry: true })).message.trimEnd().split("\n");
    const ignore = lines.findIndex((l) => /ignore this copy/.test(l));
    const contactAt = lines.findIndex((l) => l.startsWith(`Your coordinator is now session ${NEXT} `));
    assert.ok(ignore >= 0 && contactAt > ignore, "the new coordinator comes after the duplicate instruction");
    assert.match(lines[contactAt], /holds even if you set the rest of this message aside as a copy you already have/);
    t.change((r) => run.answered(r, { ticket: 386, request: id, evidence: "sent" }));
    assert.equal(run.readRecord(t.file).tickets[386].owner.coordinator, NEXT);
    assert.equal(t.plan(386).action, "observe");
    w.end(owner);
  });

  scenario("after a takeover, an acknowledged writer gets a contact notice naming the new coordinator before anything else", () => {
    const w = cliWriter("cli-takeover-contact", 374);
    const { owner } = w.launch();
    w.f.change((r) => run.acknowledged(r, { ticket: 374, model: "claude-opus-5-5", effort: "medium", permissionMode: "bypassPermissions", evidence: "message from the writer" }));
    // A record written before stored briefs kept their own coordinator.
    w.f.change((r) => { delete r.tickets[374].owner.brief.coordinator; });
    const t = takeOver(w);
    const due = t.plan(374);
    assert.equal(due.action, "update-contact");
    assert.match(due.reason, new RegExp(`briefed to report to ${COORDINATOR}, not this coordinator ${NEXT}`));
    assert.throws(() => t.change((r) => run.deliver(r, { ticket: 374, retry: true })), /acknowledged its brief/);
    const notice = t.change((r) => run.contact(r, { ticket: 374, defaults })).message;
    // A coordinator can take the run back after another took it over, so a
    // notice never asks the writer to skip one that names a coordinator it
    // has heard of before.
    assert.doesNotMatch(notice, /ignore/i, "a contact notice is never one the writer is told to ignore");
    assert.match(notice, new RegExp(`your coordinator is now session ${NEXT} .*took over from ${COORDINATOR}\\. Send every further report, blocker and question to ${NEXT} as a cross-session message \\(SendMessage`));
    const queued = t.plan(374);
    assert.equal(queued.action, "reconcile-pending");
    assert.doesNotMatch(queued.reason, /transcript/, "a running writer's transcript is not read");
    assert.throws(() => t.change((r) => run.contact(r, { ticket: 374, defaults })), /--retry/);
    t.change((r) => run.contacted(r, { ticket: 374, evidence: "sent" }));
    assert.equal(t.plan(374).action, "observe");
    // The stored brief keeps naming whoever coordinates now, after the contact
    // and after a second takeover.
    const named = (file, id) => { const text = run.brief(run.readRecord(file), null, 374, [], defaults); return text.includes(`coordinator session ${id}`) && !text.includes(COORDINATOR); };
    assert.ok(named(t.file, NEXT), "after the contact the brief names the new coordinator");
    const THIRD = "local_5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b";
    const third = path.join(w.f.artifacts, "second-takeover.json");
    run.initRecord({ record: third, checkout: w.f.dir, repository: "acme/widgets", issue: 300, coordinator: THIRD, harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", coordinatorMode: "bypassPermissions", invocation: "Use orchestrate-issues for #300.", takeover: true, observations: { sessions: { [NEXT]: { state: "archived" } } } }, { defaults, freeBytes: 40 * GB, totalMemory: 64 * GB });
    assert.ok(named(third, THIRD) && !run.brief(run.readRecord(third), null, 374, [], defaults).includes(NEXT), "after a second takeover it names the third");
    w.end(owner);
  });

  scenario("the recorded schedule command runs as written for a record path with spaces", () => {
    const f = fresh("check in with spaces");
    const spec = run.scheduleSpec(run.readRecord(f.file), f.file, defaults);
    const root = path.resolve(here, "../../..");
    const shells = [[process.platform === "win32" ? testShell() : "bash", ["-c", spec.command]], ...(process.platform === "win32" ? [["powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", spec.command]]] : [])];
    for (const [shell, args] of shells) {
      const ran = spawnSync(shell, args, { cwd: root, encoding: "utf8", windowsHide: true });
      assert.equal(ran.status, 0, `${shell}: ${ran.stderr}`);
      assert.equal(JSON.parse(ran.stdout).interval, 30, shell);
    }
    assert.throws(() => run.scheduleCommand("C:/it's here/run.json"), /single quote/);
  });

  // --- The wake sweep flags a reviewer launch that died before its journal ---

  scenario("the wake sweep flags a reviewer plan with no journal and no live process, with its error log", () => {
    const f = fresh("dead-launch");
    const jobs = path.join(tmp, "dead-launch.review-jobs");
    const round = (n) => { const dir = path.join(jobs, "pr-951", `round-${n}`); fs.mkdirSync(dir, { recursive: true }); return dir; };
    const planIn = (dir, name) => { const file = path.join(dir, `${name}.json`); fs.writeFileSync(file, JSON.stringify({ worktree: f.dir, pr: 951, journal: path.join(dir, `${name}.journal.jsonl`), steps: { review: {} }, first: "review" })); return file; };
    const refusedPlan = planIn(round(5), "plan");
    fs.writeFileSync(path.join(round(5), "plan.coordinator.err.log"), "Error: Supply completedRoundReviews from the journal as a positive integer\n");
    const journaled = planIn(round(4), "plan");
    fs.writeFileSync(path.join(round(4), "plan.journal.jsonl"), `${JSON.stringify({ event: "coordinator", processIdentity: { pid: 1, start: "1" } })}\n`);
    const live = planIn(round(6), "plan");
    fs.writeFileSync(path.join(round(6), "plan.coordinator.err.log"), "");
    // A plan still being written has no launcher logs: nothing was launched.
    const authored = planIn(round(7), "plan");
    const session = "local_9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a";
    const snap = snapshotOf([ticket(351, { prs: [{ number: 951, state: "OPEN", isDraft: true, branch: "fix/351-thing", head: "h", rounds: 4 }] })]);
    f.change((r) => run.adopt(r, { plan: write("dead-plan.json", planOf(f, snap)), ticket: 351, handleKind: "session", handle: session, route: "claude-desktop", model: "claude-opus-5-5", effort: "medium", worktree: path.join(f.dir, "wt-351") }));
    const census = () => [{ pid: 77, ppid: 1, cmd: `node scripts/agent-handoff.mjs ${live}` }];
    const p = planOf(f, snap, { reviewJobs: jobs, census, observations: { sessions: { [session]: { state: "idle" } } } });
    assert.deepEqual(p.sweep.deadLaunches.map((d) => d.plan), [refusedPlan], "only the launched plan with no journal and no live process is dead");
    assert.match(p.sweep.deadLaunches[0].error, /Supply completedRoundReviews/);
    assert.equal(p.sweep.deadLaunches[0].ticket, 351);
    assert.ok(!p.sweep.deadLaunches.some((d) => [journaled, live, authored].includes(d.plan)));
    assert.deepEqual(run.deadLaunches(jobs, [{ ticket: 351, pr: 951 }], () => null), [], "a failed census proves no launch dead");
  });

  // --- The periodic check-in --------------------------------------------------

  scenario("the check-in job is scheduled at 30 minutes, recorded with the command that recreates it, and expires after seven days", () => {
    const f = fresh("check-in", { issue: 1775 });
    const snap = snapshotOf([ticket(361)], 1775);
    const missing = planOf(f, snap);
    assert.equal(missing.checkIn.state, "missing");
    assert.match(missing.checkIn.next, /schedule --record/);
    const spec = run.scheduleSpec(run.readRecord(f.file), f.file, defaults);
    assert.equal(spec.interval, 30);
    assert.match(spec.cron, /^\d{1,2},\d{1,2} \* \* \* \*$/);
    const [a, b] = spec.cron.split(" ")[0].split(",").map(Number);
    assert.equal(b - a, 30, "the job fires every 30 minutes");
    assert.ok(spec.prompt.includes(f.file) && spec.prompt.includes("references/writer-reports.md"), "the job's prompt names the record and the wake routine");
    assert.equal(spec.command, `node .agents/skills/orchestrate-issues/issue-run.mjs schedule --record '${f.file}'`);
    assert.ok(spec.capability.includes("CronCreate"), "the capability comes from the runner configuration");
    f.change((r) => run.recordCheckIn(r, { job: "cron-1", file: f.file, defaults, env: {} }));
    const recorded = run.readRecord(f.file).checkIn;
    assert.deepEqual([recorded.job, recorded.command, recorded.interval], ["cron-1", spec.command, 30]);
    assert.equal(planOf(f, snap).checkIn.state, "scheduled");
    assert.equal(planOf(f, snap, { now: Date.parse(recorded.since) + 8 * 24 * 60 * MINUTE }).checkIn.state, "expired", "a recurring job expires after seven days and is recreated");
  });

  scenario("a check-in that finds nothing records the outcome no change", () => {
    const f = fresh("checked-in");
    f.change((r) => run.checkedIn(r, { outcome: "no change" }));
    assert.deepEqual([run.readRecord(f.file).log.at(-1).event, run.readRecord(f.file).log.at(-1).outcome], ["check-in", "no change"]);
    assert.throws(() => f.change((r) => run.checkedIn(r, {})), /--outcome/);
  });

  scenario("a coordinator taking over finds the check-in to recreate, and its recorded command schedules a working job", () => {
    const f = fresh("check-in-takeover", { issue: 1775 });
    const snap = snapshotOf([ticket(362)], 1775);
    f.change((r) => run.recordCheckIn(r, { job: "cron-1", file: f.file, defaults, env: {} }));
    const takeoverFile = path.join(f.artifacts, "takeover.json");
    const NEXT = "local_1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
    run.initRecord({ record: takeoverFile, checkout: f.dir, repository: "acme/widgets", issue: 1775, coordinator: NEXT, harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", coordinatorMode: "bypassPermissions", invocation: "Use orchestrate-issues for #1775.", takeover: true, observations: { sessions: { [COORDINATOR]: { state: "archived" } } } }, { defaults, freeBytes: 40 * GB, totalMemory: 64 * GB });
    const carried = run.readRecord(takeoverFile);
    assert.deepEqual([carried.checkIn.job, carried.checkIn.state, carried.title], [null, "recreate on this coordinator's runner", "ORCH #1775: resumable feature orchestration"]);
    assert.equal(carried.checkIn.command, `node .agents/skills/orchestrate-issues/issue-run.mjs schedule --record '${takeoverFile}'`);
    assert.equal(run.planDispatch({ record: carried, snapshot: snap, freeBytes: 100 * GB, defaults, census: () => [], env: {} }).checkIn.state, "recreate");
    const printed = run.main(["schedule", "--record", takeoverFile], { defaults });
    const scheduled = [];
    const scheduler = ({ cron, prompt, recurring }) => { if (cron.split(" ").length !== 5 || recurring !== true || !prompt.includes(takeoverFile)) throw new Error("not a working job"); scheduled.push(cron); return "cron-2"; };
    const job = scheduler({ cron: printed.cron, prompt: printed.prompt, recurring: true });
    run.updateRecord(takeoverFile, { expectRevision: carried.revision, coordinator: NEXT }, (r) => run.recordCheckIn(r, { job, file: takeoverFile, defaults, env: {} }));
    assert.deepEqual([run.readRecord(takeoverFile).checkIn.job, run.readRecord(takeoverFile).checkIn.state, scheduled.length], ["cron-2", "scheduled", 1]);
  });

  // The runner process is named by an environment variable from the runner
  // configuration and identified by its start time; the tracking log lives
  // under an environment-relative path, so a scratch directory stands in.
  const runner = defaults.orchestrators.claude.checkIn;
  const instanceEnv = (pid, extra = {}) => ({ [runner.instance.pidEnv]: String(pid), ...extra });
  const identifyAs = (starts) => (pid) => (pid in starts ? { pid, start: starts[pid] } : null);
  const desktopEnv = (f, pid) => { const logs = path.join(f.artifacts, "app"); fs.mkdirSync(logs, { recursive: true }); return instanceEnv(pid, { [runner.confirm.where.env]: runner.confirm.where.equals, LOCALAPPDATA: logs }); };
  const trackingLog = (env) => runner.confirm.log.replace(/%(\w+)%/g, (_, name) => env[name]);

  scenario("a check-in armed by an earlier runner process is reported for re-arming, with the commands to run", () => {
    const f = fresh("check-in-restart", { issue: 1775 });
    const snap = snapshotOf([ticket(363)], 1775);
    const identify = identifyAs({ 4100: "100", 4200: "200" });
    f.change((r) => run.recordCheckIn(r, { job: "cron-1", file: f.file, defaults, env: instanceEnv(4100), identify }));
    const armed = run.readRecord(f.file).checkIn;
    assert.deepEqual([armed.instance, armed.tracked], [{ pid: 4100, start: "100" }, "unavailable"], "the record keeps the arming process, and a runner outside the desktop app has no confirmation");
    assert.equal(planOf(f, snap, { env: instanceEnv(4100), identify }).checkIn.state, "scheduled", "the arming process sees its job as scheduled");
    const restarted = planOf(f, snap, { env: instanceEnv(4200), identify }).checkIn;
    assert.equal(restarted.state, "rearm", "a restart keeps the job id and expiry but needs the job re-armed");
    assert.match(restarted.next, /CronDelete/);
    assert.ok(restarted.next.includes(armed.command) && restarted.next.includes("check-in --job"), "the next step names the remove, recreate and record commands");
    assert.equal(planOf(f, snap, { env: instanceEnv(4100), identify: identifyAs({ 4100: "300" }) }).checkIn.state, "rearm", "a reused process id with another start time is another process");
    f.change((r) => run.recordCheckIn(r, { job: "cron-2", file: f.file, defaults, env: instanceEnv(4200), identify }));
    assert.equal(planOf(f, snap, { env: instanceEnv(4200), identify }).checkIn.state, "scheduled", "re-arming in the new process clears the state");
  });

  scenario("a check-in armed longer ago than the runner's tracking window is re-armed before the job expires", () => {
    const f = fresh("check-in-window", { issue: 1775 });
    const snap = snapshotOf([ticket(364)], 1775);
    const env = instanceEnv(4100), identify = identifyAs({ 4100: "100" });
    f.change((r) => run.recordCheckIn(r, { job: "cron-1", file: f.file, defaults, env, identify }));
    const since = Date.parse(run.readRecord(f.file).checkIn.since);
    assert.ok(runner.trackedForDays < runner.expiresAfterDays, "the tracking window is shorter than the job's own expiry");
    assert.equal(planOf(f, snap, { env, identify, now: since + (runner.trackedForDays * 24 * 60 - 1) * MINUTE }).checkIn.state, "scheduled");
    const aged = planOf(f, snap, { env, identify, now: since + (runner.trackedForDays * 24 * 60 + 1) * MINUTE }).checkIn;
    assert.equal(aged.state, "rearm");
    assert.match(aged.next, new RegExp(`${runner.trackedForDays} days`));
  });

  scenario("arming on the desktop app confirms the runner's tracking from its log, and an unconfirmed job is re-armed", () => {
    const f = fresh("check-in-confirm", { issue: 1775 });
    const snap = snapshotOf([ticket(365)], 1775);
    const env = desktopEnv(f, 4100), identify = identifyAs({ 4100: "100" });
    const log = trackingLog(env);
    fs.mkdirSync(path.dirname(log), { recursive: true });
    fs.writeFileSync(log, `[CCD] Session ${COORDINATOR} cron cron-0 confirmed (active: 1)\n`);
    f.change((r) => run.recordCheckIn(r, { job: "cron-1", file: f.file, defaults, env, identify }));
    assert.equal(run.readRecord(f.file).checkIn.tracked, "unconfirmed", "another job's line does not confirm this one");
    const unconfirmed = planOf(f, snap, { env, identify }).checkIn;
    assert.equal(unconfirmed.state, "unconfirmed");
    assert.ok(unconfirmed.next.includes("CronDelete") && unconfirmed.next.includes("check-in --job"));
    fs.appendFileSync(log, `[CCD] Session ${COORDINATOR} cron cron-1 confirmed (active: 1)\n`);
    assert.equal(planOf(f, snap, { env, identify }).checkIn.state, "scheduled", "a confirmation logged after arming is found by the next plan");
    f.change((r) => run.recordCheckIn(r, { job: "cron-1", file: f.file, defaults, env, identify }));
    const confirmed = run.readRecord(f.file).checkIn;
    assert.deepEqual([confirmed.tracked, confirmed.instance], ["confirmed", { pid: 4100, start: "100" }]);
    assert.equal(run.readRecord(f.file).log.at(-1).tracked, "confirmed", "the log keeps the confirmation");
  });

  scenario("a runner without a scheduling capability records none and runs the wake routine at every turn", () => {
    const f = fresh("check-in-codex", { harness: "codex", coordinator: CODEX_THREAD });
    assert.equal(run.scheduleSpec(run.readRecord(f.file), f.file, defaults).capability, null);
    assert.throws(() => f.change((r) => run.recordCheckIn(r, { file: f.file, defaults, env: {} })), /--job .*--none/);
    f.change((r) => run.recordCheckIn(r, { none: "Codex offers no scheduling capability", file: f.file, defaults, env: {} }));
    assert.match(planOf(f, snapshotOf([ticket(371)])).checkIn.next, /wake routine at the start of every turn/);
  });

  // --- Shared skill text names no harness tool -----------------------------------

  scenario("the shared skill text names no harness tool", () => {
    const tools = ["SendMessage", "CronCreate", "CronDelete", "ListAgents", "get_session", "list_sessions", "start_session", "list_events", "export_transcript", "set_session_title", "set_session_effort", "set_thread_title", "Agent tool", "Skill tool"];
    const shared = [path.join(here, "SKILL.md"), ...fs.readdirSync(path.join(here, "references")).map((n) => path.join(here, "references", n))];
    const found = shared.flatMap((file) => tools.filter((tool) => fs.readFileSync(file, "utf8").includes(tool)).map((tool) => `${path.relative(here, file)}: ${tool}`));
    assert.deepEqual(found, [], "the runner table carries tool names");
  });

  if (failed.length) throw new Error(`${failed.length} scenario${failed.length === 1 ? "" : "s"} failed: ${failed.join("; ")}`);
  console.log("PASS: CLI-only Claude dispatch, coordinator id and mode, per-route briefs with report mechanisms, acknowledgement and delivery settlement, idle-only transcript sweep, dead reviewer launches, periodic check-in and its takeover, opening an idle writer, and tool-free skill text");
} finally {
  for (const { stop } of started) fs.writeFileSync(stop, "");
  for (const { pid } of started) { try { waitFor(() => !processIdentity(pid), `stand-in ${pid} to exit`, 15000); } catch (error) { console.error(error.message); } }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (error) { console.error(`scratch not removed: ${error.message}`); }
}

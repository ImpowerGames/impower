import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { brief, contact, deliver, answer, readWriterDefaults, initRecord, readRecord, updateRecord, resumeWriter } from "./issue-run.mjs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "coordinator-address-"));
console.log(`scratch: ${tmp}`);
const defaults = readWriterDefaults();
const previous = "local_11111111-1111-4111-8111-111111111111";
const current = "local_22222222-2222-4222-8222-222222222222";
const title = "ORCH #300: reliable coordinator delivery";
const record = {
  repository: "acme/widgets", issue: 300, title, log: [],
  coordinator: { session: current, harness: "claude", host: "test-host" },
  tickets: { 301: { owner: { model: "claude-opus-5-5", route: "claude-cli", effort: "low", coordinator: previous, launchId: "assignment", worktree: tmp, branch: "fix/301-contact", brief: { coordinator: previous, deliveryId: "first", text: `coordinator session ${previous}: SendMessage with to set to that session id` } }, requests: [{ id: "question", text: "Proceed?" }] } },
};
const plan = path.join(tmp, "plan.json");
fs.writeFileSync(plan, JSON.stringify({ tickets: [{ number: 301, title: "contact" }] }));
const owner = record.tickets[301].owner;
const stored = owner.brief;
const failures = [];
const scenario = (name, run) => { try { run(); } catch (error) { failures.push(name); console.log(`FAIL ${name}: ${error.message}`); } };
const check = (text) => {
  assert.ok(text.includes(title), "the reachable title accompanies the coordinator identity");
  assert.ok(text.includes(current), "the current session identity is retained");
  assert.match(text, /SendMessage with to set to the coordinator's current ListAgents title/);
  assert.match(text, /ListAgents.*multiple.*ambiguous.*stop/);
  assert.doesNotMatch(text, /to set to that session id/);
};
try {
  delete owner.brief;
  check(brief(record, plan, 301, [], defaults));
  owner.brief = stored;
  check(brief(record, plan, 301, [], defaults));
  check(deliver(record, { ticket: 301, retry: true }).message);
  check(deliver(record, { ticket: 301, retry: true }).message);
  assert.equal(owner.brief.text.split("Your coordinator is now session ").length, 2, "resends do not accumulate contact instructions");
  owner.brief.text = `coordinated by coordinator session ${current} (title "ORCH #300: old title") on test-host\nCoordinator contact: Resolve "ORCH #300: old title" with ListAgents.`;
  const refreshed = brief(record, plan, 301, [], defaults);
  check(refreshed);
  assert.doesNotMatch(refreshed, /old title/, "a stored brief uses the current recorded title");
  check(contact(record, { ticket: 301, defaults }).message);
  check(contact(record, { ticket: 301, retry: true, defaults }).message);
  check(answer(record, { ticket: 301, request: "question", text: "Proceed." }).message);
  check(answer(record, { ticket: 301, request: "question", retry: true }).message);
  owner.coordinator = current;
  record.tickets[301].requests.push({ id: "same", text: "Continue with the same coordinator?" });
  scenario("same-coordinator legacy answer and retry refresh contact", () => {
    check(answer(record, { ticket: 301, request: "same", text: "Proceed." }).message);
    check(answer(record, { ticket: 301, request: "same", retry: true }).message);
  });
  delete record.title;
  assert.throws(() => brief(record, plan, 301, [], defaults), /no recorded ListAgents title/);
  record.title = title;
  record.coordinator.harness = "codex";
  owner.route = "codex-app";
  owner.model = "gpt-6.1-sol";
  delete owner.brief;
  const native = brief(record, plan, 301, [], defaults);
  assert.match(native, /native child.*collaboration.send_message.*parent native task address/);
  assert.match(native, /outside that native tree.*transcript/);
  owner.brief = { ...stored, text: `You cannot message coordinator session ${current}: no message from a Codex writer to another Codex thread has been verified.\nSince you cannot message coordinator session ${current}, end with your report.` };
  const nativeRetry = brief(record, plan, 301, [], defaults);
  assert.match(nativeRetry, /collaboration.send_message/);
  assert.doesNotMatch(nativeRetry, /cannot message|no message from a Codex writer/);
  delete owner.brief;
  owner.route = "codex-cli";
  const separate = brief(record, plan, 301, [], defaults);
  assert.doesNotMatch(separate, /collaboration.send_message/);
  assert.match(separate, /cannot message.*coordinator reads the end of your transcript/);
  const repo = path.join(tmp, "repo"), artifacts = path.join(tmp, "artifacts");
  fs.mkdirSync(repo);
  fs.mkdirSync(artifacts);
  execFileSync("git", ["init", "-q", "-b", "main", repo], { windowsHide: true });
  execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "--allow-empty", "-m", "base"], { windowsHide: true });
  const state = path.join(artifacts, "run.json");
  initRecord({ record: state, checkout: repo, repository: "acme/widgets", issue: 300, coordinator: current, harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", coordinatorMode: "bypassPermissions", slug: "reliable-coordinator-delivery", invocation: "Use orchestrate-issues for #300." }, { defaults, freeBytes: 100 * 2 ** 30, totalMemory: 64 * 2 ** 30 });
  const session = "33333333-3333-4333-8333-333333333333";
  updateRecord(state, { expectRevision: readRecord(state).revision, coordinator: current }, (r) => {
    r.tickets[301] = { owner: { route: "claude-cli", model: "claude-opus-5-5", effort: "low", permissionMode: "bypassPermissions", coordinator: current, sessionId: session, artifactParent: artifacts, acknowledged: { time: "before-fix" }, brief: stored, handle: { kind: "process", pid: null, start: null, host: os.hostname(), launchDir: path.join(artifacts, "old-launch") } }, history: [], results: [] };
  });
  const prompt = path.join(artifacts, "continue.txt");
  fs.writeFileSync(prompt, "Continue the assignment.");
  let sent;
  const resumed = resumeWriter(state, { coordinator: current, expectRevision: readRecord(state).revision, ticket: 301, executable: process.execPath, args: ["-p", "--resume", session, "--model", "claude-opus-5-5", "--effort", "low", "--permission-mode", "bypassPermissions"], prompt, identify: () => null, census: () => [], spawner: (spec) => { sent = fs.readFileSync(path.join(spec.launchDir, "prompt.txt"), "utf8"); return { started: false, reason: "contract probe: no child launched" }; } });
  assert.equal(resumed.started, false);
  scenario("same-coordinator acknowledged legacy resume refreshes contact", () => {
    check(sent);
    assert.ok(sent.startsWith("Continue the assignment."));
  });
  assert.deepEqual(failures, []);
  console.log("PASS: first brief, stored brief, repeated resend, contact, answer and retry use route-specific coordinator addresses");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

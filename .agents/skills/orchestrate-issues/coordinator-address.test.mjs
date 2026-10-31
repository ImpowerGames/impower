import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { brief, contact, deliver, answer, readWriterDefaults } from "./issue-run.mjs";

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
  owner.route = "codex-cli";
  const separate = brief(record, plan, 301, [], defaults);
  assert.doesNotMatch(separate, /collaboration.send_message/);
  assert.match(separate, /cannot message.*coordinator reads the end of your transcript/);
  console.log("PASS: first brief, stored brief, repeated resend, contact, answer and retry use route-specific coordinator addresses");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

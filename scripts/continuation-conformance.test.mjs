import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pipeRequest, checkDestination, probeIdle, validatePlan } from "./continuation-conformance.mjs";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "impower-continuation-"));
console.log(`Scratch repository: ${scratch}`);
const worktree = path.join(scratch, "repo"); fs.mkdirSync(worktree);
const git = (...args) => execFileSync("git", args, { cwd: worktree, encoding: "utf8", windowsHide: true });
git("init"); git("-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-m", "fixture");
const plan = { threadId: "origin", turnId: "original-turn", continuationId: "probe-fixture-546", destinationCwd: worktree, worktree, head: git("rev-parse", "HEAD").trim(), journal: path.join(scratch, "journal.jsonl") };
const idle = () => ({ thread: { id: "origin", hostId: "local", cwd: worktree, status: { type: "idle" } }, turns: [{ id: "original-turn", status: "completed" }] });
const active = () => { const state = idle(); state.thread.status.type = "active"; state.turns[0].status = "inProgress"; return state; };
const events = file => fs.readFileSync(file, "utf8").trim().split("\n").map(JSON.parse);
let checks = 0;
const test = async (name, run) => { await run(); checks++; console.log(`PASS: ${name}`); };

await test("scope rejects a different originating task or absent host pipe", () => {
  assert.throws(() => validatePlan(plan, { CODEX_THREAD_ID: "other", CODEX_APP_TOOLS_PIPE_PATH: "pipe" }), /originating/);
  assert.throws(() => validatePlan(plan, { CODEX_THREAD_ID: "origin" }), /pipe/);
  validatePlan(plan, { CODEX_THREAD_ID: "origin", CODEX_APP_TOOLS_PIPE_PATH: "pipe" });
});
await test("destination mismatch, cancellation and steering prevent delivery", () => {
  for (const change of [s => s.thread.id = "other", s => s.thread.cwd = scratch, s => s.turns[0].status = "interrupted", s => s.turns[0].id = "new-user-turn"]) {
    const state = idle(); change(state); assert.throws(() => checkDestination(state, plan));
  }
  assert.equal(checkDestination(active(), plan), "wait");
});
await test("active writer waits; only a completed idle turn receives one submission", async () => {
  let inspections = 0, submissions = 0, sleeps = 0;
  await probeIdle(plan, {
    inspect: async () => ++inspections === 1 ? active() : idle(),
    submit: async prompt => { assert.ok(prompt.includes(plan.continuationId)); assert.equal(sleeps, 1); submissions++; return { queued: true }; },
  }, { sleep: async () => { sleeps++; } });
  assert.equal(submissions, 1);
  assert.equal(events(plan.journal).at(-1).event, "delivery-uncertain", "queue response cannot establish a destination turn");
  await assert.rejects(probeIdle(plan, { inspect: () => assert.fail("duplicate inspected"), submit: () => assert.fail("duplicate sent") }), /EEXIST/);
});
await test("matching new destination turn establishes observed acceptance", async () => {
  const journal = path.join(scratch, "accepted.jsonl"); let sent = false;
  await probeIdle({ ...plan, journal }, {
    inspect: async () => sent ? { ...idle(), turns: [{ id: "accepted-turn", items: [{ type: "userMessage", content: [{ text: plan.continuationId }] }] }] } : idle(),
    submit: async () => { sent = true; return { ok: true }; },
  });
  assert.equal(events(journal).at(-1).turnId, "accepted-turn");
});
await test("lost acknowledgment is retained without retry", async () => {
  const journal = path.join(scratch, "uncertain.jsonl"); let calls = 0;
  await assert.rejects(probeIdle({ ...plan, journal }, { inspect: async () => idle(), submit: async () => { calls++; throw new Error("lost acknowledgment"); } }), /lost acknowledgment/);
  assert.equal(calls, 1); assert.equal(events(journal).at(-1).event, "delivery-uncertain");
});
await test("stale head and last-moment steering block before submission", async () => {
  for (const stale of [true, false]) {
    let calls = 0;
    await assert.rejects(probeIdle({ ...plan, head: stale ? "a".repeat(40) : plan.head, journal: path.join(scratch, `stale-${stale}.jsonl`) }, {
      inspect: async () => ++calls === 1 ? idle() : active(), submit: () => assert.fail("must not send"),
    }), stale ? /head changed/ : /became active/);
  }
});

async function withServer(reply, run) {
  const endpoint = process.platform === "win32" ? `\\\\.\\pipe\\impower-546-${process.pid}-${checks}` : path.join(scratch, `socket-${checks}`);
  const sockets = new Set();
  const server = net.createServer(socket => { sockets.add(socket); socket.on("error", () => {}); socket.once("data", () => reply(socket)); });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(endpoint, resolve); });
  try { await run(endpoint); }
  finally { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); }
}
const frame = response => { const payload = Buffer.from(JSON.stringify(response)); const result = Buffer.alloc(payload.length + 4); result.writeUInt32LE(payload.length); payload.copy(result, 4); return result; };
await test("native pipe decodes fragmented response frames", async () => {
  await withServer(socket => { const data = frame({ jsonrpc: "2.0", id: 1, result: { ok: true } }); socket.write(data.subarray(0, 2)); setTimeout(() => socket.end(data.subarray(2)), 10); }, async endpoint => {
    assert.deepEqual(await pipeRequest(endpoint, "tools/list", {}), { ok: true });
  });
});
await test("native pipe rejects wrong request identity and oversized frames", async () => {
  await withServer(socket => socket.end(frame({ jsonrpc: "2.0", id: 2, result: {} })), endpoint => assert.rejects(pipeRequest(endpoint, "tools/list", {}), /identity/));
  await withServer(socket => { const size = Buffer.alloc(4); size.writeUInt32LE(9 * 1024 * 1024); socket.end(size); }, endpoint => assert.rejects(pipeRequest(endpoint, "tools/list", {}), /too large/));
});
await test("native pipe preserves refusal, disconnect and timeout failures", async () => {
  await withServer(socket => socket.end(frame({ jsonrpc: "2.0", id: 1, error: { message: "refused" } })), endpoint => assert.rejects(pipeRequest(endpoint, "tools/list", {}), /refused/));
  await withServer(socket => socket.destroy(), endpoint => assert.rejects(pipeRequest(endpoint, "tools/list", {}), /disconnected/));
  await withServer(() => {}, endpoint => assert.rejects(pipeRequest(endpoint, "tools/list", {}, 100), /timed out/));
});
console.log(`Continuation conformance: ${checks} cases passed. Host fixtures do not establish live host compatibility.`);

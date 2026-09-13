import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pipeRequest, checkDestination, probeIdle, validatePlan, codexProbeHost, observedTurn, reconcileProbe } from "./continuation-conformance.mjs";
const fixture = JSON.parse(fs.readFileSync(new URL("./codex-app-tools.fixture.json", import.meta.url), "utf8"));

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "impower-continuation-"));
console.log(`Scratch repository: ${scratch}`);
try {
const worktree = path.join(scratch, "repo"); fs.mkdirSync(worktree);
const git = (...args) => execFileSync("git", args, { cwd: worktree, encoding: "utf8", windowsHide: true });
git("init"); git("-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-m", "fixture");
const plan = { threadId: "origin", turnId: "original-turn", continuationId: "probe-fixture-546", destinationCwd: worktree, worktree, head: git("rev-parse", "HEAD").trim(), journal: path.join(scratch, "journal.jsonl") };
const idle = () => ({ thread: { id: "origin", hostId: "local", cwd: worktree, status: { type: "idle" } }, turns: [{ id: "original-turn", status: "completed" }] });
const active = () => { const state = idle(); state.thread.status.type = "active"; state.turns[0].status = "inProgress"; return state; };
const accepted = () => { const value = structuredClone(fixture.readResult); value.thread.cwd = worktree; return value; };
const events = file => fs.readFileSync(file, "utf8").trim().split("\n").map(JSON.parse);
let checks = 0;
const test = async (name, run) => { await run(); checks++; console.log(`PASS: ${name}`); };

await test("scope rejects a different originating task or absent host pipe", () => {
  assert.throws(() => validatePlan(plan, { CODEX_THREAD_ID: "other", CODEX_APP_TOOLS_PIPE_PATH: "pipe" }), /originating/);
  assert.throws(() => validatePlan(plan, { CODEX_THREAD_ID: "origin" }), /pipe/);
  validatePlan(plan, { CODEX_THREAD_ID: "origin", CODEX_APP_TOOLS_PIPE_PATH: "pipe" });
});
await test("destination mismatch, cancellation and steering prevent delivery", () => {
  for (const [change, reason] of [[s => s.thread.id = "other", /identity/], [s => s.thread.cwd = scratch, /worktree/], [s => s.turns[0].status = "interrupted", /cancelled/], [s => s.turns[0].id = "new-user-turn", /steering/], [s => s.thread.hostId = "remote", /identity/], [s => s.turns[0].error = { message: "failed" }, /failed/], [s => s.thread.status.type = "active", /explicitly completed/], [s => s.turns[0].status = "inProgress", /explicitly completed/], [s => delete s.thread.status, /explicitly completed/]]) {
    const state = idle(); change(state); assert.throws(() => checkDestination(state, plan), reason);
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
    inspect: async () => sent ? accepted() : idle(),
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
await test("native pipe requires a matching response and rejects oversized frames", async () => {
  await withServer(socket => socket.end(frame({ jsonrpc: "2.0", id: 2, result: {} })), endpoint => assert.rejects(pipeRequest(endpoint, "tools/list", {}), /disconnected/));
  await withServer(socket => { const size = Buffer.alloc(4); size.writeUInt32LE(9 * 1024 * 1024); socket.end(size); }, endpoint => assert.rejects(pipeRequest(endpoint, "tools/list", {}), /too large/));
});
await test("native pipe preserves refusal, disconnect and timeout failures", async () => {
  await withServer(socket => socket.end(frame({ jsonrpc: "2.0", id: 1, error: { message: "refused" } })), endpoint => assert.rejects(pipeRequest(endpoint, "tools/list", {}), /refused/));
  await withServer(socket => socket.destroy(), endpoint => assert.rejects(pipeRequest(endpoint, "tools/list", {}), /disconnected/));
  await withServer(() => {}, endpoint => assert.rejects(pipeRequest(endpoint, "tools/list", {}, 100), /timed out/));
});
await test("native pipe accepts string IDs after unrelated frames", async () => {
  await withServer(socket => socket.end(Buffer.concat([frame({ jsonrpc: "2.0", id: 99, result: {} }), frame({ jsonrpc: "2.0", id: "1", result: "matched" })])), async endpoint => {
    assert.equal(await pipeRequest(endpoint, "tools/list", {}), "matched");
  });
  await withServer(() => {}, endpoint => assert.rejects(pipeRequest(endpoint, "tools/list", { text: "x".repeat(8 * 1024 * 1024) }), /Request too large/));
  await withServer(socket => socket.end(frame({ jsonrpc: "wrong", id: 1, result: {} })), endpoint => assert.rejects(pipeRequest(endpoint, "tools/list", {}), /envelope/));
  await withServer(socket => socket.end(frame({ jsonrpc: "2.0", id: 1 })), endpoint => assert.rejects(pipeRequest(endpoint, "tools/list", {}), /Missing host result/));
});
await test("native acceptance requires a new matching untruncated tool-delivered turn", () => {
  for (const status of [undefined, "queued", "failed", "interrupted"]) { const value = accepted(); value.turns[0].status = status; assert.equal(observedTurn(value, plan), undefined); }
  const errored = accepted(); errored.turns[0].error = { message: "failed" }; assert.equal(observedTurn(errored, plan), undefined);
  for (const change of [s => s.turns[0].id = plan.turnId, s => delete s.turns[0].id, s => s.turns[0].items[0].output.text = "unrelated", s => s.turns[0].items[0].output.text = s.turns[0].items[0].output.text.replace("probe-fixture-546", "another-marker"), s => s.turns[0].items[0].output.truncated = true, s => s.turns[0].items[0].namespace = "other", s => s.turns[0].items[0].output.text = s.turns[0].items[0].output.text.replace(">origin<", ">other<"), s => s.turns[0].items = [{ type: "userMessage", content: [{ text: plan.continuationId }] }]]) {
    const value = accepted(); change(value); assert.equal(observedTurn(value, plan), undefined);
  }
  for (const change of [s => s.thread.id = "other", s => s.thread.hostId = "remote", s => s.thread.cwd = scratch]) {
    const value = accepted(); change(value); assert.throws(() => observedTurn(value, plan), /identity/);
  }
});
await test("invalid plans and journals in either checkout fail before host use", () => {
  const env = { CODEX_THREAD_ID: "origin", CODEX_APP_TOOLS_PIPE_PATH: "pipe" };
  for (const key of ["threadId", "turnId", "continuationId", "destinationCwd", "worktree", "head", "journal"]) assert.throws(() => validatePlan({ ...plan, [key]: "" }, env), /Missing/);
  for (const key of ["destinationCwd", "worktree", "journal"]) assert.throws(() => validatePlan({ ...plan, [key]: "relative" }, env), /absolute/);
  assert.throws(() => validatePlan({ ...plan, head: "short" }, env), /full worktree head/);
  assert.throws(() => validatePlan({ ...plan, continuationId: "bad marker" }, env), /marker/);
  const destination = path.join(scratch, "destination"); fs.mkdirSync(destination);
  for (const directory of [destination, worktree]) assert.throws(() => validatePlan({ ...plan, destinationCwd: destination, journal: path.join(directory, "journal.jsonl") }, env), /both worktrees/);
});
await test("the wait bound blocks without submission and intent is flushed before send", async () => {
  let time = 0;
  await assert.rejects(probeIdle({ ...plan, journal: path.join(scratch, "deadline.jsonl") }, { inspect: async () => active(), submit: () => assert.fail("deadline sent") }, { now: () => time, sleep: async () => { time = 600001; } }), /ten minutes/);
  const journal = path.join(scratch, "durable.jsonl"), originalSync = fs.fsyncSync; let syncs = 0;
  fs.fsyncSync = (...args) => { syncs++; return originalSync(...args); };
  try {
    await probeIdle({ ...plan, journal }, { inspect: async () => idle(), submit: async () => {
      const rows = events(journal); assert.equal(rows.at(-1).event, "submission-intent"); assert.equal(syncs, rows.length); return {};
    } });
  } finally { fs.fsyncSync = originalSync; }
});
await test("host adapter follows the captured schema and preserves caller attribution", async () => {
  const calls = [];
  const host = codexProbeHost("fixture-pipe", plan.threadId, plan.turnId, async (endpoint, method, params) => {
    assert.equal(endpoint, "fixture-pipe"); assert.equal(method, "tools/call");
    assert.equal(params.threadId, plan.threadId); assert.equal(params.turnId, plan.turnId);
    const tool = fixture.tools.find(tool => tool.name === params.tool); assert.ok(tool); assert.equal(params.namespace, tool.namespace);
    for (const key of Object.keys(params.arguments)) assert.ok(Object.hasOwn(tool.inputSchema.properties, key), `unexpected ${key}`);
    for (const key of tool.inputSchema.required) assert.ok(Object.hasOwn(params.arguments, key));
    assert.ok(!("model" in params.arguments) && !("thinking" in params.arguments));
    calls.push(params);
    return { success: true, contentItems: [{ type: "inputText", text: JSON.stringify(params.tool === "read_thread" ? accepted() : { threadId: plan.threadId }) }] };
  });
  assert.equal(observedTurn(await host.inspect("cursor"), plan).id, "accepted-turn");
  await host.submit("probe");
  assert.equal(calls[0].arguments.includeOutputs, true); assert.equal(calls[0].arguments.cursor, "cursor");
  assert.notEqual(calls[0].callId, calls[1].callId);
  await assert.rejects(codexProbeHost("pipe", "origin", "turn", async () => ({ success: false })).inspect(), /refused/);
  await assert.rejects(codexProbeHost("pipe", "origin", "turn", async () => ({ success: true, contentItems: [] })).inspect(), /Missing/);
  await assert.rejects(codexProbeHost("pipe", "origin", "turn", async () => ({ success: true, contentItems: [{ type: "inputText", text: "not json" }] })).inspect(), /JSON/);
});
await test("reconciliation follows read cursors and never submits or rewrites acceptance", async () => {
  const journal = path.join(scratch, "reconcile.jsonl"), p = { ...plan, journal };
  fs.copyFileSync(plan.journal, journal);
  let calls = 0;
  const host = { inspect: async cursor => {
    calls++; if (!cursor) return { ...accepted(), turns: [{ id: "later-turn", items: [] }], page: { order: "newest_first", hasMore: true, nextCursor: "older" } };
    assert.equal(cursor, "older"); return accepted();
  }, submit: () => assert.fail("reconciliation submitted") };
  assert.equal(await reconcileProbe(p, host), "accepted-turn"); assert.equal(calls, 2);
  await assert.rejects(reconcileProbe(p, host), /EEXIST/);
  await assert.rejects(reconcileProbe({ ...p, continuationId: "other-marker" }, host), /Journal/);
  const missing = { inspect: async () => ({ ...idle(), page: { order: "newest_first", hasMore: false } }) };
  await assert.rejects(reconcileProbe(p, missing), /uncertain/);
  let pages = 0;
  await assert.rejects(reconcileProbe(p, { inspect: async () => ({ ...accepted(), turns: [], page: { order: "newest_first", hasMore: true, nextCursor: String(++pages) } }) }), /bounded read/);
  assert.equal(pages, 10);
});
await test("CLI refuses missing commands and malformed plans", () => {
  const module = new URL("./continuation-conformance.mjs", import.meta.url);
  const malformed = path.join(scratch, "invalid.json"); fs.writeFileSync(malformed, "not json");
  for (const args of [[], ["codex-idle", malformed]]) {
    const result = spawnSync(process.execPath, [fileURLToPath(module), ...args], { encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 1); assert.match(result.stderr, args.length ? /JSON/ : /Usage/);
  }
});
assert.equal(checks, 16, "conformance case inventory changed");
console.log(`Continuation conformance: ${checks} cases passed. Host fixtures do not establish live host compatibility.`);
} finally {
  if (fs.realpathSync(scratch) !== path.resolve(scratch) || !path.basename(scratch).startsWith("impower-continuation-")) throw new Error("Refusing cleanup outside original scratch directory");
  fs.rmSync(scratch, { recursive: true, force: true });
}

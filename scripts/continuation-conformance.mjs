// Scratch host conformance only. This is not a production continuation adapter.
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const MAX_FRAME = 8 * 1024 * 1024;

// Bind Git discovery to cwd while retaining discovery ceilings and user config.
function gitEnvironment() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR"].includes(process.platform === "win32" ? key.toUpperCase() : key)) delete env[key];
  return env;
}

// Protocol observed in the installed codex-app-tools 0.1.4 bridge. No daemon
// launch, replacement session, credentials, or permission overrides are used.
export function pipeRequest(endpoint, method, params, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0), settled = false;
    const socket = net.createConnection(endpoint);
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error("Host request timed out; acceptance may be uncertain")), timeoutMs);
    socket.on("error", error => finish(error));
    socket.on("close", () => finish(new Error("Host disconnected before acknowledgment")));
    socket.on("connect", () => {
      const payload = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }));
      if (payload.length > MAX_FRAME) return finish(new Error("Request too large"));
      const frame = Buffer.alloc(payload.length + 4);
      frame.writeUInt32LE(payload.length);
      payload.copy(frame, 4);
      socket.write(frame);
    });
    socket.on("data", chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const length = buffer.readUInt32LE();
        if (length > MAX_FRAME) return finish(new Error("Host frame too large"));
        if (buffer.length < length + 4) return;
        try {
          const response = JSON.parse(buffer.subarray(4, length + 4).toString("utf8"));
          buffer = buffer.subarray(length + 4);
          if (response.jsonrpc !== "2.0" || !["string", "number"].includes(typeof response.id)) throw new Error("Invalid host response envelope");
          if (response.id !== 1 && response.id !== "1") continue;
          if (response.error) throw new Error(response.error.message ?? "Host refused request");
          if (!Object.hasOwn(response, "result")) throw new Error("Missing host result");
          return finish(null, response.result);
        } catch (error) { return finish(error); }
      }
    });
  });
}

export function codexProbeHost(endpoint, threadId, turnId, request = pipeRequest) {
  if (!turnId) throw new Error("Originating turn ID is required for host attribution");
  const call = async (tool, args) => {
    const result = await request(endpoint, "tools/call", {
      namespace: "codex_app", tool, arguments: args, threadId,
      callId: randomUUID(), turnId,
    });
    if (result.success !== true) throw new Error("Host refused conformance tool call");
    const text = result.contentItems?.find(item => item.type === "inputText")?.text;
    if (!text) throw new Error("Missing host tool response");
    return JSON.parse(text);
  };
  return {
    inspect: cursor => call("read_thread", { threadId, turnLimit: 1, includeOutputs: true, maxOutputCharsPerItem: 4000, ...(cursor ? { cursor } : {}) }),
    submit: prompt => call("send_message_to_thread", { threadId, prompt }),
  };
}

export function observedTurn(snapshot, plan) {
  if (snapshot.thread?.id !== plan.threadId || snapshot.thread?.hostId !== "local" || path.resolve(snapshot.thread.cwd) !== path.resolve(plan.destinationCwd)) throw new Error("Post-submit destination identity mismatch");
  return snapshot.turns?.find(turn => typeof turn.id === "string" && turn.id.trim() && turn.id !== plan.turnId && ["inProgress", "completed"].includes(turn.status) && !turn.error && turn.items?.some(item =>
    item.type === "functionCallOutput" && item.name === "send_message_to_thread" && item.namespace === "codex_app" &&
    item.output?.truncated === false && typeof item.output.text === "string" &&
    item.output.text.includes(`<source_thread_id>${plan.threadId}</source_thread_id>`) &&
    item.output.text.includes(`<input>Conformance probe ${plan.continuationId} for issue #546:`)));
}

// Read-only reconciliation of a bounded scratch experiment; never resubmit.
export async function reconcileProbe(plan, host) {
  const rows = fs.readFileSync(plan.journal, "utf8").trim().split("\n").map(JSON.parse);
  const started = rows[0];
  if (started?.event !== "probe-started" || started.threadId !== plan.threadId || started.turnId !== plan.turnId || started.continuationId !== plan.continuationId || !rows.some(row => row.event === "submission-intent")) throw new Error("Journal does not establish this continuation's submission intent");
  let cursor;
  const cursors = new Set();
  for (let page = 0; page < 10; page++) {
    const snapshot = await host.inspect(cursor);
    if (snapshot.page?.order !== "newest_first") throw new Error("Unknown host turn ordering");
    const accepted = observedTurn(snapshot, plan);
    if (accepted) {
      const fd = fs.openSync(plan.journal + ".acceptance.json", "wx");
      try { fs.writeSync(fd, JSON.stringify({ continuationId: plan.continuationId, threadId: plan.threadId, turnId: accepted.id, observedAt: new Date().toISOString() }) + "\n"); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
      return accepted.id;
    }
    if (snapshot.turns?.some(turn => turn.id === plan.turnId) || snapshot.page.hasMore === false) break;
    cursor = snapshot.page.nextCursor;
    if (typeof cursor !== "string" || !cursor || cursors.has(cursor)) throw new Error("Missing or repeated host cursor");
    cursors.add(cursor);
  }
  throw new Error("Delivery remains uncertain; no matching turn in the bounded read; no retry was sent");
}

export function checkDestination(snapshot, plan) {
  if (snapshot.thread?.id !== plan.threadId || snapshot.thread?.hostId !== "local") throw new Error("Destination identity mismatch");
  if (path.resolve(snapshot.thread.cwd) !== path.resolve(plan.destinationCwd)) throw new Error("Destination worktree mismatch");
  const turn = snapshot.turns?.[0];
  if (turn?.id !== plan.turnId) throw new Error("User steering or another turn changed the destination; probe cancelled");
  if (turn.status === "interrupted" || turn.status === "failed" || turn.error) throw new Error("Destination stopped or failed; probe cancelled");
  if (snapshot.thread.status?.type === "active" && turn.status === "inProgress") return "wait";
  if (snapshot.thread.status?.type === "idle" && turn.status === "completed") return "idle";
  throw new Error("Destination state is not an explicitly completed idle turn");
}

// At most one submission: a lost acknowledgment is evidence, not permission to
// retry. Re-running with the same journal refuses before inspecting or sending.
export async function probeIdle(plan, host, { sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now } = {}) {
  const fd = fs.openSync(plan.journal, "wx");
  const event = (name, details = {}) => {
    fs.writeSync(fd, JSON.stringify({ event: name, at: new Date().toISOString(), ...details }) + "\n");
    fs.fsyncSync(fd);
  };
  let submissionStarted = false;
  try {
    event("probe-started", { threadId: plan.threadId, turnId: plan.turnId, continuationId: plan.continuationId });
    const deadline = now() + 600000;
    while (checkDestination(await host.inspect(), plan) === "wait") {
      if (now() >= deadline) throw new Error("Destination did not become idle within ten minutes");
      await sleep(2000);
    }
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: plan.worktree, env: gitEnvironment(), encoding: "utf8", windowsHide: true }).trim();
    if (head !== plan.head) throw new Error("Conformance worktree head changed");
    event("originating-turn-completed", { turnId: plan.turnId });
    // Recheck after the local head probe. This is still a non-atomic host API:
    // production adoption requires resolving the inspect/submit race.
    if (checkDestination(await host.inspect(), plan) !== "idle") throw new Error("Destination became active before submission");
    event("submission-intent");
    submissionStarted = true;
    const response = await host.submit(`Conformance probe ${plan.continuationId} for issue #546: this message was sent by the scratch harness after the originating turn ended. Inspect ${plan.journal} and record this task's current turn ID as acceptance evidence. Then continue only the work already authorized by the user. This probe selects no model and authorizes no new work or duplicate review.`);
    event("submission-response", { response });
    // Response alone is deliberately not called accepted. Read the subsequent
    // destination turn, matching our unique marker, to establish acceptance.
    const snapshot = await host.inspect();
    const accepted = observedTurn(snapshot, plan);
    if (accepted) event("continuation-observed", { threadId: plan.threadId, turnId: accepted.id });
    else event("delivery-uncertain", { reason: "No matching new destination turn observed; inspect before any retry" });
  } catch (error) {
    event(submissionStarted ? "delivery-uncertain" : "probe-blocked", { reason: error.message });
    throw error;
  } finally { fs.closeSync(fd); }
}

export function validatePlan(plan, env = process.env) {
  for (const key of ["threadId", "turnId", "continuationId", "destinationCwd", "worktree", "head", "journal"]) {
    if (typeof plan[key] !== "string" || !plan[key].trim()) throw new Error(`Missing ${key}`);
  }
  if (plan.threadId !== env.CODEX_THREAD_ID) throw new Error("Probe must target the originating Codex task");
  if (!env.CODEX_APP_TOOLS_PIPE_PATH) throw new Error("Originating host did not expose its app-tools pipe");
  if (!/^[a-f0-9]{40}$/.test(plan.head)) throw new Error("Expected full worktree head");
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(plan.continuationId)) throw new Error("Invalid continuation marker");
  for (const key of ["destinationCwd", "worktree", "journal"]) if (!path.isAbsolute(plan[key])) throw new Error(`${key} must be absolute`);
  for (const key of ["destinationCwd", "worktree"]) {
    if (!fs.statSync(plan[key]).isDirectory()) throw new Error(`${key} must name a directory: ${plan[key]}`);
  }
  const directories = new Set([plan.worktree, plan.destinationCwd]);
  const journal = path.join(fs.realpathSync(path.dirname(plan.journal)), path.basename(plan.journal));
  const refuseContained = directory => {
    const relative = path.relative(fs.realpathSync(directory), journal);
    if (!relative.startsWith(".." + path.sep) && !path.isAbsolute(relative)) throw new Error("Journal must be outside both worktrees");
  };
  for (const directory of directories) refuseContained(directory);
  for (const directory of [plan.worktree, plan.destinationCwd]) {
    const git = args => {
      try { return execFileSync("git", args, { cwd: directory, env: gitEnvironment(), encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }); }
      catch (error) { throw new Error(`Cannot validate Git repository for ${directory}: ${error.stderr?.trim() || error.message}`); }
    };
    const common = fs.realpathSync(git(["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim());
    directories.add(common);
    for (const field of git(["worktree", "list", "--porcelain", "-z"]).split("\0")) {
      if (field.startsWith("worktree ") && fs.existsSync(field.slice(9))) {
        const checkout = fs.realpathSync(field.slice(9));
        if (checkout === common) throw new Error(`Cannot verify owning checkout for ${directory}: Git reports its storage as a worktree; this layout is unsupported`);
        directories.add(checkout);
      }
    }
  }
  for (const directory of directories) refuseContained(directory);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (!["codex-idle", "codex-reconcile"].includes(process.argv[2]) || !process.argv[3] || !path.isAbsolute(process.argv[3])) throw new Error("Usage: node scripts/continuation-conformance.mjs <codex-idle|codex-reconcile> <absolute-plan.json>; scratch probe only, not automatic review mode");
    const plan = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
    validatePlan(plan);
    const host = codexProbeHost(process.env.CODEX_APP_TOOLS_PIPE_PATH, plan.threadId, plan.turnId);
    if (process.argv[2] === "codex-reconcile") console.log(await reconcileProbe(plan, host));
    else await probeIdle(plan, host);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
